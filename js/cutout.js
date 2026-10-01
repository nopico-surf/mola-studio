/* ============================================================
   Remover fundo: recorte de foto com IA, no próprio navegador (sem API, sem custo, a foto não sai da máquina)
   - Modelo BEN2 (MIT), fp16, 219 MB, baixado uma vez do Hugging Face (12 pedaços em paralelo: o servidor
     limita cada conexão) e guardado no IndexedDB ('ai:…'). Roda no WebGPU com o onnxruntime-web (CDN).
   - Tudo pesado roda num Worker que é encerrado ao fechar a janela: a memória da IA só existe enquanto ela está aberta.
   - O modelo vê a foto em 1024 px; a máscara volta ao tamanho original com guided filter (borda alinhada à foto)
     e a cor dos pixels semitransparentes é refeita sem a cor do fundo (blur fusion). Tudo em faixas de linhas,
     para a memória não crescer com o tamanho da foto.
   - Resultado: L.src = PNG no tamanho original (mídia 'img:<id>'), L.cut = { orig, mask } (foto de antes e
     máscara em cinza) para editar de novo ou voltar ao original.
   ============================================================ */
const CUT = {
  ort:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
  model:{
    url:'https://huggingface.co/square-zero-labs/BEN2-ONNX/resolve/75eb62bc12f6a1b8d33d3effa31d99cb71d0e8c2/onnx/model_fp16.onnx',
    size:219121675, sha:'dfdc25f421f32a0d1268e0f2ff2153d340e8f1d52d3dd16f5dc33c1ce85cedf1', key:'ai:ben2-fp16-75eb62b',
  },
  maxPx:60e6,
};

/* ------------ Worker (fonte inteira numa função: vira Blob, funciona também abrindo o index.html direto) ------------ */
function cutWorkerMain() {
  let ort = null, sess = null, img = null; // img = { W, H, d } (pixels da foto original)
  const post = (m, t) => self.postMessage(m, t || []);
  const prog = (stage, extra) => post({ type:'progress', stage, ...(extra || {}) });

  /* ---- IndexedDB (o mesmo banco do app) ---- */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('mola-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbGet = async k => { const db = await idb(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); };
  const idbSet = async (k, v) => { const db = await idb(); return new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); }); };

  /* ---- download em pedaços paralelos, com progresso e conferência do SHA-256 ---- */
  async function download(url, size, sha) {
    const buf = new Uint8Array(size), CH = 8 << 20, N = 12; let next = 0, got = 0, last = 0;
    const one = async () => {
      for (;;) {
        const a = next; if (a >= size) return; next += CH;
        const b = Math.min(size, a + CH) - 1;
        for (let tries = 0; ; tries++) {
          try {
            const r = await fetch(url, { headers:{ Range:`bytes=${a}-${b}` } });
            if (r.status !== 206 && !(r.status === 200 && a === 0 && b === size - 1)) throw new Error('HTTP ' + r.status);
            const rd = r.body.getReader(); let o = a;
            for (;;) {
              const { done, value } = await rd.read(); if (done) break;
              if (o + value.length > b + 1) throw new Error('tamanho');
              buf.set(value, o); o += value.length; got += value.length;
              const now = Date.now(); if (now - last > 250) { last = now; prog('download', { got, total:size }); }
            }
            if (o !== b + 1) throw new Error('incompleto');
            break;
          } catch (e) { if (tries >= 4) throw e; await new Promise(r => setTimeout(r, 800 * (tries + 1))); }
        }
      }
    };
    await Promise.all(Array.from({ length:N }, one));
    prog('verify');
    const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), x => x.toString(16).padStart(2, '0')).join('');
    if (h !== sha) throw new Error('O arquivo da IA chegou corrompido. Tente de novo.');
    return buf;
  }

  /* ---- ajustes no grafo ONNX para o WebGPU (mesma conta, só reorganizada) ----
     1) Concat/Split com mais de K pedaços viram árvores (o WebGPU aceita 16 buffers por shader).
     2) Pow(x, 2) vira Mul(x, x): sem isso o ORT funde ReduceMean/Pow/Sqrt num LayerNorm com fp16 e fp32
        misturados e o shader não compila ("cannot assign vec4<f16> to vec4<f32>"). */
  function fixOnnx(u8, K = 8) {
    const rv = (b, p) => { let x = 0, m = 1, c; do { c = b[p++]; x += (c & 127) * m; m *= 128; } while (c & 128); return [x, p]; };
    const fields = (b, s, e) => {
      const out = []; let p = s;
      while (p < e) {
        const st = p; let k; [k, p] = rv(b, p);
        const f = Math.floor(k / 8), w = k & 7; let ps = p, pe, v;
        if (w === 0) { [v, p] = rv(b, p); pe = p; } else if (w === 1) { p += 8; pe = p; } else if (w === 5) { p += 4; pe = p; }
        else if (w === 2) { let l; [l, p] = rv(b, p); ps = p; p += l; pe = p; } else throw new Error('ONNX inesperado');
        out.push({ f, w, st, ps, pe, en:p, v });
      }
      return out;
    };
    const te = new TextEncoder(), td = new TextDecoder();
    const str = y => td.decode(u8.subarray(y.ps, y.pe)), raw = y => u8.subarray(y.st, y.en);
    const wv = (a, x) => { while (x >= 128) { a.push((x % 128) | 128); x = Math.floor(x / 128); } a.push(x); };
    const bytesF = (a, f, b) => { wv(a, f * 8 + 2); wv(a, b.length); for (const x of b) a.push(x); };
    const strF = (a, f, s) => bytesF(a, f, te.encode(s));
    const head = (f, n) => { const a = []; wv(a, f * 8 + 2); wv(a, n); return Uint8Array.from(a); };
    const int64s = tb => {
      const tf = fields(u8, tb.ps, tb.pe), r = tf.find(y => y.f === 9);
      if (r) { const dv = new DataView(u8.buffer, u8.byteOffset + r.ps, r.pe - r.ps), o = []; for (let i = 0; i < dv.byteLength; i += 8) o.push(Number(dv.getBigInt64(i, true))); return o; }
      const o = []; for (const y of tf.filter(y => y.f === 7)) { if (y.w === 0) o.push(y.v); else { let p = y.ps; while (p < y.pe) { let v; [v, p] = rv(u8, p); o.push(v); } } }
      return o;
    };
    const scalar = tb => {
      const tf = fields(u8, tb.ps, tb.pe), dt = (tf.find(y => y.f === 2) || {}).v, r = tf.find(y => y.f === 9);
      if (r) {
        const dv = new DataView(u8.buffer, u8.byteOffset + r.ps, r.pe - r.ps);
        if (dt === 1 && dv.byteLength === 4) return dv.getFloat32(0, true);
        if (dt === 11 && dv.byteLength === 8) return dv.getFloat64(0, true);
        if (dt === 10 && dv.byteLength === 2) { const x = dv.getUint16(0, true), e = (x >> 10) & 31, m = x & 1023; return (x >> 15 ? -1 : 1) * (e ? 2 ** (e - 15) * (1 + m / 1024) : 2 ** -14 * m / 1024); }
        return NaN;
      }
      const fd = tf.find(y => y.f === 4); return fd && fd.w === 5 ? new DataView(u8.buffer, u8.byteOffset + fd.ps, 4).getFloat32(0, true) : NaN;
    };
    const i64raw = vals => { const b = new Uint8Array(vals.length * 8), dv = new DataView(b.buffer); vals.forEach((v, i) => dv.setBigInt64(i * 8, BigInt(v), true)); return b; };
    const mf = fields(u8, 0, u8.length), g = mf.find(x => x.f === 7), gf = fields(u8, g.ps, g.pe);
    const consts = new Map(); // nome → tensor (inicializador ou saída de Constant)
    for (const x of gf) if (x.f === 5) { const nm = fields(u8, x.ps, x.pe).find(y => y.f === 8); if (nm) consts.set(str(nm), x); }
    for (const x of gf) {
      if (x.f !== 1) continue;
      const nf = fields(u8, x.ps, x.pe), op = nf.find(y => y.f === 4);
      if (!op || str(op) !== 'Constant') continue;
      const at = nf.find(y => y.f === 5), o = nf.find(y => y.f === 2); if (!at || !o) continue;
      const t = fields(u8, at.ps, at.pe).find(y => y.f === 5); if (t) consts.set(str(o), t);
    }
    const parts = []; let uid = 0;
    const node = (ins, outs, op, attrs, name) => {
      const a = []; ins.forEach(s => strF(a, 1, s)); outs.forEach(s => strF(a, 2, s)); if (name) strF(a, 3, name); strF(a, 4, op);
      const hd = Uint8Array.from(a); parts.push(head(1, hd.length + attrs.reduce((s, r) => s + r.length, 0)), hd, ...attrs);
    };
    const constNode = (out, vals) => {
      const t = []; wv(t, 8); wv(t, vals.length); wv(t, 16); wv(t, 7); bytesF(t, 9, i64raw(vals));
      const at = []; strF(at, 1, 'value'); bytesF(at, 5, t); wv(at, 160); wv(at, 4);
      const n = []; strF(n, 2, out); strF(n, 4, 'Constant'); bytesF(n, 5, at); parts.push(head(1, n.length), Uint8Array.from(n));
    };
    for (const x of gf) {
      if (x.f !== 1) { parts.push(raw(x)); continue; }
      const nf = fields(u8, x.ps, x.pe), opF = nf.find(y => y.f === 4), op = opF ? str(opF) : '';
      if (op !== 'Pow' && op !== 'Concat' && op !== 'Split') { parts.push(raw(x)); continue; }
      const ins = nf.filter(y => y.f === 1).map(str), outs = nf.filter(y => y.f === 2).map(str);
      const nameF = nf.find(y => y.f === 3), name = nameF ? str(nameF) : '', attrs = nf.filter(y => y.f === 5).map(raw);
      if (op === 'Pow' && ins[1] && consts.has(ins[1]) && scalar(consts.get(ins[1])) === 2) { node([ins[0], ins[0]], outs, 'Mul', [], name); continue; }
      if (op === 'Concat' && ins.length > K) {
        let cur = ins;
        while (cur.length > K) {
          const nx = [];
          for (let i = 0; i < cur.length; i += K) { const ch = cur.slice(i, i + K); if (ch.length === 1) { nx.push(ch[0]); continue; } const o = `${outs[0]}__cat${uid++}`; node(ch, [o], 'Concat', attrs); nx.push(o); }
          cur = nx;
        }
        node(cur, outs, 'Concat', attrs, name); continue;
      }
      if (op === 'Split' && outs.length > K && ins[1] && consts.has(ins[1])) {
        const sizes = int64s(consts.get(ins[1]));
        if (sizes.length === outs.length) {
          const split = (src, on, sz) => {
            if (on.length === 1) { node([src], on, 'Identity', []); return; }
            if (on.length <= K) { const c = `${on[0]}__sz${uid++}`; constNode(c, sz); node([src, c], on, 'Split', attrs); return; }
            const per = Math.ceil(on.length / K), grp = [];
            for (let i = 0; i < on.length; i += per) grp.push([i, Math.min(on.length, i + per)]);
            const go = grp.map(() => `${on[0]}__grp${uid++}`), c = `${on[0]}__sz${uid++}`;
            constNode(c, grp.map(([a, b]) => sz.slice(a, b).reduce((s, v) => s + v, 0)));
            node([src, c], go, 'Split', attrs);
            grp.forEach(([a, b], i) => split(go[i], on.slice(a, b), sz.slice(a, b)));
          };
          split(ins[0], outs, sizes); continue;
        }
      }
      parts.push(raw(x));
    }
    const gLen = parts.reduce((s, p) => s + p.length, 0), res = [];
    for (const x of mf) { if (x === g) res.push(head(7, gLen), ...parts); else res.push(raw(x)); }
    const out = new Uint8Array(res.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of res) { out.set(p, o); o += p.length; }
    return out;
  }

  async function init(m) {
    if (!m.url) { post({ type:'ready' }); return; } // editar um recorte que já existe: só o refinamento da cor, sem IA
    if (!self.navigator.gpu) throw new Error('NO_WEBGPU');
    const ad = await navigator.gpu.requestAdapter({ powerPreference:'high-performance' }); if (!ad) throw new Error('NO_WEBGPU');
    importScripts(m.ort + 'ort.webgpu.min.js');
    ort = self.ort; ort.env.wasm.wasmPaths = m.ort; ort.env.wasm.numThreads = 1; ort.env.logLevel = 'error';
    let bytes = null; const cached = await idbGet(m.key);
    if (cached) { prog('load'); bytes = new Uint8Array(await cached.arrayBuffer()); }
    else {
      prog('download', { got:0, total:m.size });
      bytes = fixOnnx(await download(m.url, m.size, m.sha));
      prog('store'); const ok = await idbSet(m.key, new Blob([bytes])); if (!ok) post({ type:'warn', msg:'NO_SPACE' });
    }
    prog('prepare');
    sess = await ort.InferenceSession.create(bytes, { executionProviders:['webgpu'], graphOptimizationLevel:'all' });
    bytes = null;
    post({ type:'ready' });
  }

  function takePixels(bmp) {
    const W = bmp.width, H = bmp.height, c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently:true });
    x.drawImage(bmp, 0, 0); img = { W, H, d:x.getImageData(0, 0, W, H).data };
  }

  async function infer(bmp) {
    const S = 1024, c = new OffscreenCanvas(S, S), x = c.getContext('2d', { willReadFrequently:true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data, n = S * S, f = new Float32Array(3 * n), mean = [.485, .456, .406], std = [.229, .224, .225];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) f[k * n + i] = (d[i * 4 + k] / 255 - mean[k]) / std[k];
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) });
    const t = out[sess.outputNames[sess.outputNames.length - 1]];
    let m = t.data; if (!(m instanceof Float32Array)) m = Float32Array.from(m);
    return m; // 1024×1024, 0..1
  }

  /* ---- média em janela (2r+1)², borda repetida. Horizontal por linha, vertical por somas de coluna (cache) ---- */
  function box(src, dst, w, h, r, t, cs) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let x = -r; x <= r; x++) s += src[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
      for (let x = 0; x < w; x++) { t[o + x] = s; const xa = x + r + 1, xb = x - r; s += src[o + (xa >= w ? w - 1 : xa)] - src[o + (xb < 0 ? 0 : xb)]; }
    }
    const k = 1 / ((2 * r + 1) * (2 * r + 1)), cy = y => (y < 0 ? 0 : y >= h ? h - 1 : y) * w;
    cs.fill(0);
    for (let y = -r; y <= r; y++) { const o = cy(y); for (let x = 0; x < w; x++) cs[x] += t[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, a = cy(y + r + 1), b = cy(y - r);
      for (let x = 0; x < w; x++) { dst[o + x] = cs[x] * k; cs[x] += t[a + x] - t[b + x]; }
    }
  }

  /* ---- máscara 1024 → tamanho original, com guided filter (guia = luminância da foto), em faixas ---- */
  function refineMask(m) {
    const { W, H, d } = img, M = 1024, sc = Math.max(W, H) / M;
    const out = new Uint8Array(W * H);
    const X0 = new Int32Array(W), WX = new Float32Array(W);
    for (let x = 0; x < W; x++) { const f = Math.min(M - 1, Math.max(0, (x + .5) * M / W - .5)); X0[x] = Math.min(M - 2, Math.floor(f)); WX[x] = f - X0[x]; }
    const sample = y => { const f = Math.min(M - 1, Math.max(0, (y + .5) * M / H - .5)), y0 = Math.min(M - 2, Math.floor(f)); return [y0 * M, (y0 + 1) * M, f - y0]; };
    if (sc <= 1.05) { // foto do tamanho do modelo ou menor: só reamostra
      for (let y = 0; y < H; y++) { const [r0, r1, wy] = sample(y); for (let x = 0; x < W; x++) { const x0 = X0[x], wx = WX[x]; const v = (m[r0 + x0] * (1 - wx) + m[r0 + x0 + 1] * wx) * (1 - wy) + (m[r1 + x0] * (1 - wx) + m[r1 + x0 + 1] * wx) * wy; out[y * W + x] = Math.round(v * 255); } }
      return out;
    }
    const r = Math.max(1, Math.round(2 * sc)), eps = 1e-3, rn = Math.max(1, r >> 1);
    const CORE = 160, halo = 2 * r + 2, rows = CORE + 2 * halo, N = W * rows;
    const I = new Float32Array(N), p = new Float32Array(N), a1 = new Float32Array(N), a2 = new Float32Array(N), a3 = new Float32Array(N), a4 = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N), t = new Float32Array(N), cs = new Float64Array(W);
    for (let y0 = 0; y0 < H; y0 += CORE) {
      const y1 = Math.min(H, y0 + CORE), ya = Math.max(0, y0 - halo), yb = Math.min(H, y1 + halo), h = yb - ya;
      for (let y = ya; y < yb; y++) {
        const [r0, r1, wy] = sample(y), o = (y - ya) * W, oi = y * W * 4;
        for (let x = 0; x < W; x++) {
          const j = oi + x * 4, x0 = X0[x], wx = WX[x];
          I[o + x] = (d[j] * .299 + d[j + 1] * .587 + d[j + 2] * .114) / 255;
          p[o + x] = (m[r0 + x0] * (1 - wx) + m[r0 + x0 + 1] * wx) * (1 - wy) + (m[r1 + x0] * (1 - wx) + m[r1 + x0 + 1] * wx) * wy;
        }
      }
      const n = W * h;
      box(I, a1, W, h, r, t, cs); box(p, a2, W, h, r, t, cs);
      for (let i = 0; i < n; i++) A[i] = I[i] * p[i]; box(A, a3, W, h, r, t, cs);
      for (let i = 0; i < n; i++) A[i] = I[i] * I[i]; box(A, a4, W, h, r, t, cs);
      for (let i = 0; i < n; i++) { const mi = a1[i], ai = (a3[i] - mi * a2[i]) / (a4[i] - mi * mi + eps); A[i] = ai; B[i] = a2[i] - ai * mi; }
      box(A, a3, W, h, r, t, cs); box(B, a4, W, h, r, t, cs); box(p, a1, W, h, rn, t, cs);
      for (let y = y0; y < y1; y++) {
        const o = (y - ya) * W, oo = y * W;
        for (let x = 0; x < W; x++) {
          const i = o + x, pv = p[i], nv = a1[i];
          const band = (nv > .004 && nv < .996) || (pv > .004 && pv < .996);
          const v = band ? a3[i] * I[i] + a4[i] : pv;
          out[oo + x] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
        }
      }
      prog('refine', { f:y1 / H * .5 });
    }
    return out;
  }

  /* ---- cor do primeiro plano (Forte & Pitié 2021, blur fusion), em faixas ----
     Passada 1 (raio grande) numa grade reduzida; passada 2 (raio pequeno) em tamanho cheio.
     Saída: RGBA com alfa 255; só muda a cor onde 0 < alfa < 1 (no resto fica a foto, intacta). */
  function foreground(al, stage) {
    const { W, H, d } = img, sc = Math.max(W, H) / 1024;
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0, n = W * H; i < n; i++) { const j = i * 4; out[j] = d[j]; out[j + 1] = d[j + 1]; out[j + 2] = d[j + 2]; out[j + 3] = 255; }
    const r1 = Math.max(8, Math.round(30 * sc)), r2 = Math.max(3, Math.round(2 * sc));
    // passada 1, grade reduzida f×
    const f = Math.max(1, Math.floor(r1 / 8)), lw = Math.ceil(W / f), lh = Math.ceil(H / f), ln = lw * lh, rl = Math.max(1, Math.round(r1 / f));
    const la = new Float32Array(ln), cnt = new Float32Array(ln), lF = [0, 1, 2].map(() => new Float32Array(ln)), lB = [0, 1, 2].map(() => new Float32Array(ln));
    for (let y = 0; y < H; y++) {
      const ly = Math.floor(y / f) * lw;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, j = i * 4, li = ly + Math.floor(x / f), a = al[i] / 255;
        la[li] += a; cnt[li]++;
        for (let c = 0; c < 3; c++) { const v = d[j + c] / 255; lF[c][li] += v * a; lB[c][li] += v * (1 - a); }
      }
    }
    for (let i = 0; i < ln; i++) { const k = 1 / cnt[i]; la[i] *= k; for (let c = 0; c < 3; c++) { lF[c][i] *= k; lB[c][i] *= k; } }
    const lt = new Float32Array(ln), lcs = new Float64Array(lw), ba = new Float32Array(ln), tmp = new Float32Array(ln);
    box(la, ba, lw, lh, rl, lt, lcs);
    for (let c = 0; c < 3; c++) {
      box(lF[c], tmp, lw, lh, rl, lt, lcs); for (let i = 0; i < ln; i++) lF[c][i] = tmp[i] / (ba[i] + 1e-5);
      box(lB[c], tmp, lw, lh, rl, lt, lcs); for (let i = 0; i < ln; i++) lB[c][i] = tmp[i] / (1 - ba[i] + 1e-5);
    }
    const X0 = new Int32Array(W), WX = new Float32Array(W), X1 = new Int32Array(W);
    for (let x = 0; x < W; x++) { const q = Math.min(lw - 1, Math.max(0, (x + .5) / f - .5)); X0[x] = Math.floor(q); X1[x] = Math.min(lw - 1, X0[x] + 1); WX[x] = q - X0[x]; }
    const lerpL = (L, r0, r1, wy, x) => { const x0 = X0[x], x1 = X1[x], wx = WX[x]; return (L[r0 + x0] * (1 - wx) + L[r0 + x1] * wx) * (1 - wy) + (L[r1 + x0] * (1 - wx) + L[r1 + x1] * wx) * wy; };
    // passada 2, faixas em tamanho cheio
    const CORE = 160, halo = r2 + 1, rows = CORE + 2 * halo, N = W * rows;
    const A = new Float32Array(N), bA = new Float32Array(N), xF = new Float32Array(N), xB = new Float32Array(N), bF = new Float32Array(N), bB = new Float32Array(N), t = new Float32Array(N), cs = new Float64Array(W);
    for (let y0 = 0; y0 < H; y0 += CORE) {
      const y1 = Math.min(H, y0 + CORE), ya = Math.max(0, y0 - halo), yb = Math.min(H, y1 + halo), h = yb - ya;
      let any = false;
      for (let y = y0; y < y1 && !any; y++) for (let x = 0, o = y * W; x < W; x++) { const v = al[o + x]; if (v > 0 && v < 255) { any = true; break; } }
      if (any) {
        for (let y = ya; y < yb; y++) { const o = (y - ya) * W, oo = y * W; for (let x = 0; x < W; x++) A[o + x] = al[oo + x] / 255; }
        box(A, bA, W, h, r2, t, cs);
        for (let c = 0; c < 3; c++) {
          for (let y = ya; y < yb; y++) {
            const q = Math.min(lh - 1, Math.max(0, (y + .5) / f - .5)), yy0 = Math.floor(q), r0 = yy0 * lw, r1 = Math.min(lh - 1, yy0 + 1) * lw, wy = q - yy0;
            const o = (y - ya) * W, oi = y * W * 4;
            for (let x = 0; x < W; x++) {
              const i = o + x, a = A[i], I = d[oi + x * 4 + c] / 255;
              const fb = lerpL(lF[c], r0, r1, wy, x), bb = lerpL(lB[c], r0, r1, wy, x);
              let F1 = fb + a * (I - a * fb - (1 - a) * bb); F1 = F1 < 0 ? 0 : F1 > 1 ? 1 : F1;
              xF[i] = F1 * a; xB[i] = bb * (1 - a);
            }
          }
          box(xF, bF, W, h, r2, t, cs); box(xB, bB, W, h, r2, t, cs);
          for (let y = y0; y < y1; y++) {
            const o = (y - ya) * W, oo = y * W;
            for (let x = 0; x < W; x++) {
              const v8 = al[oo + x]; if (v8 === 0 || v8 === 255) continue;
              const i = o + x, a = A[i], I = d[(oo + x) * 4 + c] / 255, ba2 = bA[i];
              const F2 = bF[i] / (ba2 + 1e-5), B2 = bB[i] / (1 - ba2 + 1e-5);
              out[(oo + x) * 4 + c] = Math.round(255 * (F2 + a * (I - a * F2 - (1 - a) * B2)));
            }
          }
        }
      }
      if (stage) prog(stage, { f:.5 + y1 / H * .5 });
    }
    return out;
  }

  const bitmapOf = async rgba => createImageBitmap(new ImageData(rgba, img.W, img.H));

  self.onmessage = async e => {
    const m = e.data;
    try {
      if (m.type === 'init') await init(m);
      else if (m.type === 'cut') {
        takePixels(m.bmp); prog('infer');
        const mk = await infer(m.bmp); m.bmp.close();
        prog('refine', { f:0 }); const al = refineMask(mk);
        const fb = await bitmapOf(foreground(al, 'refine'));
        post({ type:'cut', alpha:al, fg:fb }, [al.buffer, fb]);
      } else if (m.type === 'load') {   // editar de novo: a máscara já existe, só precisa dos pixels
        takePixels(m.bmp); m.bmp.close();
        const fb = await bitmapOf(foreground(m.alpha, 'refine'));
        post({ type:'cut', alpha:m.alpha, fg:fb }, [m.alpha.buffer, fb]);
      } else if (m.type === 'fg') {
        const fb = await bitmapOf(foreground(m.alpha));
        post({ type:'fg', id:m.id, fg:fb }, [fb]);
      } else if (m.type === 'final') {
        const { W, H } = img, al = m.alpha, px = foreground(al, m.quiet ? null : 'final');
        for (let i = 0, n = W * H; i < n; i++) px[i * 4 + 3] = al[i];
        const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
        x.putImageData(new ImageData(px, W, H), 0, 0);
        const png = await c.convertToBlob({ type:'image/png' });
        let mask = null;
        if (m.withMask) {
          for (let i = 0, n = W * H; i < n; i++) { const j = i * 4, v = al[i]; px[j] = px[j + 1] = px[j + 2] = v; px[j + 3] = 255; }
          x.putImageData(new ImageData(px, W, H), 0, 0);
          mask = await c.convertToBlob({ type:'image/png' });
        }
        post({ type:'final', id:m.id, png, mask });
      }
    } catch (err) { post({ type:'error', id:m.id, stage:m.type, msg:String(err && err.message || err) }); }
  };
}

/* ------------ Painel da imagem: botões ------------ */
function cutoutF(L) {
  if (L.video || !L.src) return null;
  const kids = L.cut
    ? [h('button', { class:'btn small', text:'Editar recorte', onclick:() => openCutout(L) }),
       h('button', { class:'btn small', text:'Baixar PNG', title:'O recorte no tamanho original da foto', onclick:() => cutDownload(L) }),
       h('button', { class:'btn small ghost', text:'Voltar ao original', onclick:() => cutRestore(L) })]
    : [h('button', { class:'btn small', text:'Remover fundo', title:'Recorta a foto com IA, no tamanho original', onclick:() => openCutout(L) })];
  return h('div', { class:'row cut-wrap' }, kids);
}
function cutRestore(L) {
  if (!L.cut) return;
  pushUndo(); L.src = L.cut.orig; delete L.cut; getImage(L.src);
  changed({ props:true }); toast('Foto original de volta', 5000, { label:'Desfazer', fn:undo });
}
const cutFileName = L => `${(L.name || 'imagem').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'imagem'}-sem-fundo.png`;
async function cutDownload(L) {
  try { const b = isRef(L.src) ? await DB.get('media:' + L.src.slice(4)) : await (await fetch(L.src)).blob(); if (!b) throw 0; await saveFile(b, cutFileName(L)); }
  catch (e) { toast('Não consegui baixar o PNG'); }
}

/* ------------ Janela de recorte ------------ */
let CUTWIN = null, cutOpening = false;
const imgReady = async src => (await getImage(src)) || loadImg(await srcUrl(src)).catch(() => null); // getImage devolve null enquanto carrega
async function openCutout(L) {
  if (CUTWIN || cutOpening || !L || L.type !== 'image' || !L.src || L.video) return;
  cutOpening = true;
  const srcOrig = L.cut ? L.cut.orig : L.src;
  const [img, maskImg] = await Promise.all([imgReady(srcOrig), L.cut && L.cut.mask ? imgReady(L.cut.mask) : null]);
  cutOpening = false;
  if (!img) { toast('A foto não carregou. Tente de novo.'); return; }
  const W = img.naturalWidth, H = img.naturalHeight;
  if (W * H > CUT.maxPx) { toast(`Foto grande demais para recortar aqui (${Math.round(W * H / 1e6)} MP). O limite é ${CUT.maxPx / 1e6} MP.`, 5000); return; }
  const dev = window.CUT_DEV || {}; // testes: { ort, model } apontando para cópias locais
  const st = { L, W, H, img, alpha0:null, fg:null, tool:'erase', size:Math.round(Math.max(W, H) * .04), hard:.5, bg:'checker', comp:false,
    z:1, ox:0, oy:0, ready:false, busy:true, dirty:false, undo:[], redo:[], fgId:0, fgT:null, hover:null, worker:null, pending:new Map(), closed:false,
    reedit:!!maskImg, ai:!maskImg }; // ai = esta vez passa pela IA (recorte novo ou "Refazer com a IA")
  CUTWIN = st;

  /* ---- interface ---- */
  const cv = h('canvas', { class:'cut-cv' });
  const stage = h('div', { class:'cut-stage' }, [cv]);
  const barI = h('i'), pTitle = h('b', { text:'Preparando a IA' }), pDet = h('p', { class:'hint', text:'' });
  const pRetry = h('button', { class:'btn small', text:'Tentar de novo', hidden:true, onclick:() => { pRetry.hidden = true; startWorker(st.ai); } });
  const prog = h('div', { class:'cut-prog' }, [pTitle, h('div', { class:'cut-bar' }, [barI]), pDet, pRetry]);
  stage.append(prog);
  const zVal = h('button', { text:'100%', title:'Tamanho real (1)', onclick:() => zoomTo(1) });
  const zoomBox = h('div', { class:'zoom cut-zoom' }, [
    h('button', { text:'−', title:'Diminuir (−)', onclick:() => zoomBy(1 / 1.25) }), zVal,
    h('button', { text:'+', title:'Aumentar (+)', onclick:() => zoomBy(1.25) }),
    h('button', { text:'Ajustar', title:'Caber na tela (0)', onclick:fit })]);
  stage.append(zoomBox);

  const toolSeg = h('div', { class:'segs', role:'group', 'aria-label':'Pincel' });
  const tools = [['erase', 'Apagar', 'E'], ['restore', 'Restaurar', 'R']];
  const drawTools = () => { toolSeg.innerHTML = ''; tools.forEach(([v, t, k]) => toolSeg.append(h('button', { 'aria-pressed':String(st.tool === v), title:`${t} (${k})`, text:t, onclick:() => { st.tool = v; drawTools(); } }))); };
  drawTools();
  const rng = (label, min, max, step, get, set, fmt) => {
    const num = h('input', { type:'text', class:'num', value:fmt(get()), 'aria-label':label + ' (valor)' });
    const inp = h('input', { type:'range', min, max, step, value:get() });
    inp.addEventListener('input', () => { set(+inp.value); num.value = fmt(get()); paint(); });
    num.addEventListener('change', () => { const v = parseFloat(num.value.replace(',', '.')); if (isFinite(v)) { set(clamp(fmt === pctF ? v / 100 : v, min, max)); inp.value = get(); } num.value = fmt(get()); });
    num.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') num.blur(); });
    return { el:field(label, h('div', { class:'rng' }, [inp, num])), sync:() => { inp.value = get(); num.value = fmt(get()); } };
  };
  const pctF = v => Math.round(v * 100) + '%';
  const maxSize = Math.max(8, Math.round(Math.max(W, H) / 3));
  const sizeR = rng('Tamanho', 2, maxSize, 1, () => st.size, v => st.size = Math.round(v), v => v + ' px');
  const hardR = rng('Dureza', 0, 1, .01, () => st.hard, v => st.hard = v, pctF);
  const bgSeg = h('div', { class:'segs tight', role:'group', 'aria-label':'Fundo da prévia' });
  const bgs = [['checker', 'Xadrez'], ['dark', 'Escuro'], ['light', 'Claro'], ['ghost', 'Fantasma']];
  const drawBgs = () => { bgSeg.innerHTML = ''; bgs.forEach(([v, t]) => bgSeg.append(h('button', { 'aria-pressed':String(st.bg === v), text:t, title:v === 'ghost' ? 'Mostra o que foi removido, apagado' : '', onclick:() => { st.bg = v; drawBgs(); paint(); } }))); };
  drawBgs();
  const compBtn = h('button', { class:'btn small', text:'Comparar com o original', title:'Segure (ou segure C)' });
  const holdComp = on => { st.comp = on; compBtn.classList.toggle('on', on); paint(); };
  compBtn.addEventListener('pointerdown', () => holdComp(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => compBtn.addEventListener(t, () => st.comp && holdComp(false)));
  const undoB = h('button', { class:'btn small', text:'Desfazer', title:'Ctrl+Z', onclick:() => undoStep(st.undo, st.redo) });
  const redoB = h('button', { class:'btn small', text:'Refazer', title:'Ctrl+Shift+Z', onclick:() => undoStep(st.redo, st.undo) });
  const autoB = h('button', { class:'btn small ghost', text:'Descartar retoques', title:'Volta a máscara de quando a janela abriu', onclick:backToAuto });
  const aiB = st.reedit ? h('button', { class:'btn small', text:'Refazer com a IA', title:'Recorta a foto original de novo (os retoques podem ser desfeitos)', onclick:rerunAI }) : null;
  const side = h('div', { class:'cut-side' }, [
    h('section', { class:'sec' }, [h('h3', { text:'Pincel' }), toolSeg, sizeR.el, hardR.el,
      h('p', { class:'hint', text:'[ e ] mudam o tamanho. Shift + [ ] muda a dureza.' })]),
    h('section', { class:'sec' }, [h('h3', { text:'Ver' }), bgSeg, h('div', { class:'row' }, [compBtn])]),
    h('section', { class:'sec' }, [h('h3', { text:'Retoques' }), h('div', { class:'row cut-wrap' }, [undoB, redoB, autoB, aiB])]),
    h('section', { class:'sec' }, [h('p', { class:'hint', text:'Roda do mouse dá zoom. Espaço + arrastar (ou o botão do meio) move a foto. O recorte sai no tamanho original.' })]),
  ]);
  const dlB = h('button', { class:'btn small', text:'Baixar PNG', title:'Baixa o recorte no tamanho original', onclick:() => finish('download') });
  const okB = h('button', { class:'btn small primary', text:'Aplicar', title:'Enter', onclick:() => finish('apply') });
  const card = h('div', { class:'files-card cut-card', role:'dialog', 'aria-modal':'true', 'aria-label':'Remover fundo' }, [
    h('div', { class:'files-head' }, [h('h2', { text:'Remover fundo' }), h('span', { class:'cut-meta', text:`${W} × ${H} px · tamanho original` }), h('div', { class:'spacer' }),
      dlB, h('button', { class:'btn small ghost', text:'Cancelar', title:'Esc', onclick:() => close() }), okB]),
    h('div', { class:'cut-body' }, [side, stage]),
  ]);
  const win = h('div', { class:'files cut-win' }, [card]);
  document.body.append(win);
  const syncBtns = () => {
    const off = !st.ready || st.busy;
    [okB, dlB, autoB, aiB].forEach(b => b && (b.disabled = off)); undoB.disabled = off || !st.undo.length; redoB.disabled = off || !st.redo.length;
    side.classList.toggle('off', off);
  };
  syncBtns();

  /* ---- máscara em tamanho cheio: canvas branco com alfa = máscara ---- */
  const mc = new OffscreenCanvas(W, H), mx = mc.getContext('2d');
  const putAlpha = al => { const id = new ImageData(W, H), dd = id.data; for (let i = 0, n = W * H; i < n; i++) { const j = i * 4; dd[j] = dd[j + 1] = dd[j + 2] = 255; dd[j + 3] = al[i]; } mx.putImageData(id, 0, 0); };
  const readAlpha = () => { const dd = mx.getImageData(0, 0, W, H).data, al = new Uint8Array(W * H); for (let i = 0, n = W * H; i < n; i++) al[i] = dd[i * 4 + 3]; return al; };

  /* ---- worker ---- */
  function setProg(title, f, det) { prog.hidden = false; pTitle.textContent = title; barI.style.width = f == null ? '' : Math.round(clamp(f) * 100) + '%'; prog.classList.toggle('indet', f == null); pDet.textContent = det || ''; }
  const MB = b => (b / 1048576).toFixed(0);
  function onMsg(e) {
    const m = e.data; if (st.closed) return;
    if (m.type === 'progress') {
      if (m.stage === 'download') setProg('Baixando a IA (só na primeira vez)', m.got / m.total, `${MB(m.got)} de ${MB(m.total)} MB. Fica guardada neste navegador para as próximas fotos.`);
      else if (m.stage === 'verify') setProg('Conferindo o arquivo da IA', null);
      else if (m.stage === 'store') setProg('Guardando a IA neste navegador', null);
      else if (m.stage === 'load') setProg('Abrindo a IA', null);
      else if (m.stage === 'prepare') setProg('Preparando a IA na placa de vídeo', null, 'Leva alguns segundos.');
      else if (m.stage === 'infer') setProg('Recortando a foto', null, 'A IA está separando o primeiro plano do fundo.');
      else if (m.stage === 'refine') setProg('Refinando a borda em tamanho original', m.f, `${W} × ${H} px`);
      else if (m.stage === 'final') setProg('Montando o PNG', m.f);
      return;
    }
    if (m.type === 'warn' && m.msg === 'NO_SPACE') { toast('Sem espaço para guardar a IA neste navegador: ela será baixada de novo na próxima vez.', 5000); return; }
    if (m.type === 'ready') { begin(); return; }
    if (m.type === 'error') {
      if (m.id && st.pending.has(m.id)) { st.pending.get(m.id).rej(new Error(m.msg)); st.pending.delete(m.id); return; }
      const msg = m.msg === 'NO_WEBGPU' ? 'Este navegador não tem WebGPU. Use o Chrome ou o Edge atualizados.'
        : m.stage === 'init' ? 'Não consegui preparar a IA. Confira a internet e tente de novo.' : 'O recorte falhou: ' + m.msg;
      if (st.worker) { st.worker.terminate(); st.worker = null; }
      if (st.ready) { // "Refazer com a IA" falhou: o recorte aberto continua editável
        st.ai = false; st.busy = false; st.undo.pop(); syncBtns(); prog.hidden = true; toast(msg, 5000); startWorker(false); return;
      }
      setProg('Não deu certo', 0, msg); pRetry.hidden = m.msg === 'NO_WEBGPU'; st.busy = false; syncBtns();
      return;
    }
    if (m.type === 'cut') {
      if (!st.alpha0) st.alpha0 = new Uint8Array(m.alpha);
      putAlpha(m.alpha); setFg(m.fg);
      if (st.ready && st.ai) st.dirty = true; // refeito com a IA
      st.ready = true; st.busy = false; st.ai = false; prog.hidden = true; syncBtns(); paint(); return;
    }
    if (m.id && st.pending.has(m.id)) { st.pending.get(m.id).res(m); st.pending.delete(m.id); }
  }
  const ask = (msg, transfer) => new Promise((res, rej) => { const id = ++st.fgId; st.pending.set(id, { res, rej }); st.worker.postMessage({ ...msg, id }, transfer || []); });
  const initMsg = withAI => ({ type:'init', ort:dev.ort || CUT.ort, url:withAI ? dev.model || CUT.model.url : null, size:CUT.model.size, sha:CUT.model.sha, key:CUT.model.key });
  function startWorker(withAI) {
    if (!st.ready) setProg(withAI ? 'Preparando a IA' : 'Abrindo o recorte', null);
    st.busy = true; syncBtns();
    const url = URL.createObjectURL(new Blob(['(' + cutWorkerMain.toString() + ')()'], { type:'text/javascript' }));
    st.worker = new Worker(url); URL.revokeObjectURL(url);
    st.worker.onmessage = onMsg;
    st.worker.onerror = ev => onMsg({ data:{ type:'error', stage:'init', msg:ev.message || 'worker' } });
    st.worker.postMessage(initMsg(withAI));
  }
  async function begin() {
    let bmp; try { bmp = await createImageBitmap(img); } catch (e) { onMsg({ data:{ type:'error', stage:'cut', msg:'a foto não abriu' } }); return; }
    if (!st.ai) {   // sem IA: editar de novo (máscara guardada) ou worker recriado depois de uma falha (máscara da tela)
      let al = null;
      if (st.ready) al = readAlpha();
      else if (maskImg) {
        const c = new OffscreenCanvas(W, H), x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(maskImg, 0, 0, W, H);
        const dd = x.getImageData(0, 0, W, H).data; al = new Uint8Array(W * H); for (let i = 0; i < al.length; i++) al[i] = dd[i * 4];
      }
      if (al) { st.worker.postMessage({ type:'load', bmp, alpha:al }, [bmp, al.buffer]); return; }
    }
    st.worker.postMessage({ type:'cut', bmp }, [bmp]);
  }
  function rerunAI() {
    if (!st.ready || st.busy) return;
    snapshotAll(); st.ai = true; st.busy = true; syncBtns(); setProg('Preparando a IA', null);
    if (st.worker) st.worker.postMessage(initMsg(true)); else startWorker(true);
  }
  function setFg(bmp) { if (st.fg) st.fg.close(); st.fg = bmp; }
  // depois de um retoque, a cor da borda é refeita com a máscara nova (sem travar o pincel)
  function scheduleFg() {
    clearTimeout(st.fgT);
    st.fgT = setTimeout(async () => {
      if (!st.worker || st.busy || st.closed) return;
      const al = readAlpha(), my = st.fgId + 1;
      try { const r = await ask({ type:'fg', alpha:al }, [al.buffer]); if (!st.closed && my === st.fgId) { setFg(r.fg); paint(); } else r.fg.close(); } catch (e) {}
    }, 450);
  }

  /* ---- vista: zoom e deslocamento (px da tela = px da foto × z + o) ---- */
  const ctx = cv.getContext('2d');
  let dpr = 1, VW = 0, VH = 0;
  const comp = document.createElement('canvas'), cx = comp.getContext('2d');
  function resize() { const r = stage.getBoundingClientRect(); dpr = devicePixelRatio || 1; VW = r.width; VH = r.height; cv.width = comp.width = Math.max(1, Math.round(VW * dpr)); cv.height = comp.height = Math.max(1, Math.round(VH * dpr)); paint(); }
  function fit() { const pad = 24, z = Math.min((VW - pad * 2) / W, (VH - pad * 2) / H); st.z = z; st.ox = (VW - W * z) / 2; st.oy = (VH - H * z) / 2; zVal.textContent = Math.round(z * 100) + '%'; paint(); }
  function zoomAt(z, px, py) { z = clamp(z, .02, 16); st.ox = px - (px - st.ox) * z / st.z; st.oy = py - (py - st.oy) * z / st.z; st.z = z; zVal.textContent = Math.round(z * 100) + '%'; paint(); }
  const zoomBy = k => zoomAt(st.z * k, VW / 2, VH / 2), zoomTo = z => zoomAt(z, VW / 2, VH / 2);
  const toImg = (sx, sy) => [(sx - st.ox) / st.z, (sy - st.oy) / st.z];

  let raf = 0;
  function paint() { if (!raf) raf = requestAnimationFrame(draw); }
  function draw() {
    raf = 0; if (st.closed) return;
    const w = cv.width, hh = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, hh);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dx = st.ox, dy = st.oy, dw = W * st.z, dh = H * st.z;
    // fundo da prévia
    if (st.bg === 'dark') { ctx.fillStyle = '#0b0c0f'; ctx.fillRect(dx, dy, dw, dh); }
    else if (st.bg === 'light') { ctx.fillStyle = '#f4f3ef'; ctx.fillRect(dx, dy, dw, dh); }
    else { ctx.save(); ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip(); ctx.fillStyle = checkerPat(ctx); ctx.fillRect(dx, dy, dw, dh); ctx.restore(); }
    ctx.imageSmoothingEnabled = st.z < 2; ctx.imageSmoothingQuality = 'high';
    if (st.comp || !st.ready) { ctx.drawImage(img, dx, dy, dw, dh); drawCursor(); return; }
    if (st.bg === 'ghost') { ctx.globalAlpha = .28; ctx.drawImage(img, dx, dy, dw, dh); ctx.globalAlpha = 1; }
    // recorte = cor (refeita na borda) com a máscara, montado numa tela do tamanho da vista
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, comp.width, comp.height);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.imageSmoothingEnabled = st.z < 2; cx.imageSmoothingQuality = 'high';
    cx.drawImage(st.fg || img, dx, dy, dw, dh);
    cx.globalCompositeOperation = 'destination-in'; cx.drawImage(mc, dx, dy, dw, dh); cx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(comp, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCursor();
  }
  let pat = null;
  function checkerPat(c) {
    if (pat) return pat;
    const t = document.createElement('canvas'); t.width = t.height = 16; const x = t.getContext('2d');
    x.fillStyle = '#c9c9c9'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
    return pat = c.createPattern(t, 'repeat');
  }
  function drawCursor() {
    if (!st.hover || !st.ready || st.pan) return;
    const r = st.size / 2 * st.z, [x, y] = st.hover;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = st.tool === 'erase' ? '#fff' : '#F2B632'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    if (st.hard < .98) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * st.hard), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }

  /* ---- pincel: tiles de 256 px guardam o antes de cada traço (desfazer sem copiar a foto inteira) ---- */
  const TS = 256;
  function dab(x, y, stroke) {
    const r = st.size / 2, x0 = Math.max(0, Math.floor(x - r - 1)), y0 = Math.max(0, Math.floor(y - r - 1)), x1 = Math.min(W, Math.ceil(x + r + 1)), y1 = Math.min(H, Math.ceil(y + r + 1));
    if (x1 <= x0 || y1 <= y0) return;
    for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y1 - 1) / TS); ty++) for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x1 - 1) / TS); tx++) {
      const k = ty * 100000 + tx; if (stroke.tiles.has(k)) continue;
      const w = Math.min(TS, W - tx * TS), hh = Math.min(TS, H - ty * TS);
      stroke.tiles.set(k, { x:tx * TS, y:ty * TS, d:mx.getImageData(tx * TS, ty * TS, w, hh) });
    }
    const g = mx.createRadialGradient(x, y, 0, x, y, r);
    const hi = clamp(st.hard, 0, .999);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(hi, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    mx.globalCompositeOperation = st.tool === 'erase' ? 'destination-out' : 'source-over';
    mx.fillStyle = g; mx.beginPath(); mx.arc(x, y, r, 0, Math.PI * 2); mx.fill();
    mx.globalCompositeOperation = 'source-over';
  }
  function undoStep(from, to) {
    const s = from.pop(); if (!s) return;
    const back = { tiles:new Map() };
    for (const [k, t] of s.tiles) { back.tiles.set(k, { x:t.x, y:t.y, d:mx.getImageData(t.x, t.y, t.d.width, t.d.height) }); mx.putImageData(t.d, t.x, t.y); }
    to.push(back); st.dirty = true; syncBtns(); paint(); scheduleFg();
  }
  function snapshotAll() { // a máscara inteira vira um passo do desfazer (antes de trocar tudo de uma vez)
    const s = { tiles:new Map() };
    for (let ty = 0; ty * TS < H; ty++) for (let tx = 0; tx * TS < W; tx++) { const w = Math.min(TS, W - tx * TS), hh = Math.min(TS, H - ty * TS); s.tiles.set(ty * 100000 + tx, { x:tx * TS, y:ty * TS, d:mx.getImageData(tx * TS, ty * TS, w, hh) }); }
    st.undo.push(s); st.redo.length = 0;
  }
  function backToAuto() {
    if (!st.alpha0) return;
    snapshotAll(); putAlpha(st.alpha0); st.dirty = true; syncBtns(); paint(); scheduleFg();
  }

  /* ---- mouse ---- */
  let stroke = null, panDrag = null, spaceDown = false;
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceDown || e.button === 2) { panDrag = { sx, sy, ox:st.ox, oy:st.oy }; st.pan = true; cv.style.cursor = 'grabbing'; paint(); e.preventDefault(); return; }
    if (e.button !== 0 || !st.ready || st.busy) return;
    const [x, y] = toImg(sx, sy);
    stroke = { tiles:new Map(), last:[x, y] }; dab(x, y, stroke); paint();
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    st.hover = [sx, sy];
    if (panDrag) { st.ox = panDrag.ox + sx - panDrag.sx; st.oy = panDrag.oy + sy - panDrag.sy; paint(); return; }
    if (stroke) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = toImg(ev.clientX - r.left, ev.clientY - r.top), [lx, ly] = stroke.last;
        const dist = Math.hypot(x - lx, y - ly), step = Math.max(1, st.size * .12), n = Math.floor(dist / step);
        for (let i = 1; i <= n; i++) dab(lx + (x - lx) * i / n, ly + (y - ly) * i / n, stroke);
        if (n) stroke.last = [lx + (x - lx) * n / n, ly + (y - ly) * n / n];
      }
    }
    paint();
  });
  const endPtr = () => {
    if (panDrag) { panDrag = null; st.pan = false; cv.style.cursor = ''; paint(); }
    if (stroke) { if (stroke.tiles.size) { st.undo.push(stroke); if (st.undo.length > 40) st.undo.shift(); st.redo.length = 0; st.dirty = true; scheduleFg(); } stroke = null; syncBtns(); }
  };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', () => { st.hover = null; paint(); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(st.z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive:false });

  /* ---- teclado (a janela tem os próprios atalhos; os do editor ficam parados enquanto ela está aberta) ---- */
  function key(e) {
    if (st.closed) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' && t.type === 'text');
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (e.type === 'keyup') { if (e.code === 'Space') { spaceDown = false; cv.style.cursor = ''; } if (k === 'c' && st.comp) holdComp(false); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (typing) return;
    e.stopPropagation();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? undoStep(st.redo, st.undo) : undoStep(st.undo, st.redo); return; }
    if (mod && k === 'y') { e.preventDefault(); undoStep(st.redo, st.undo); return; }
    if (mod) return;
    if (e.code === 'Space') { e.preventDefault(); spaceDown = true; cv.style.cursor = 'grab'; return; }
    if (e.key === 'Enter') { e.preventDefault(); if (!okB.disabled) finish('apply'); return; }
    if (k === 'e') { st.tool = 'erase'; drawTools(); paint(); }
    else if (k === 'r') { st.tool = 'restore'; drawTools(); paint(); }
    else if (k === 'c' && !e.repeat) holdComp(true);
    else if (e.key === '[' || e.key === ']') {
      const up = e.key === ']';
      if (e.shiftKey || e.key === '{' || e.key === '}') { st.hard = clamp(st.hard + (up ? .1 : -.1)); hardR.sync(); }
      else { st.size = clamp(Math.round(st.size * (up ? 1.2 : 1 / 1.2)), 2, maxSize); sizeR.sync(); }
      paint();
    } else if (e.key === '{' || e.key === '}') { st.hard = clamp(st.hard + (e.key === '}' ? .1 : -.1)); hardR.sync(); paint(); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-') zoomBy(1 / 1.25);
    else if (e.key === '0' || (e.key === '!' && e.shiftKey)) fit();
    else if (e.key === '1') zoomTo(1);
    else return;
    e.preventDefault();
  }
  addEventListener('keydown', key, true); addEventListener('keyup', key, true);
  const ro = new ResizeObserver(() => { const first = !VW; resize(); if (first) fit(); });
  ro.observe(stage);

  /* ---- aplicar / baixar / fechar ---- */
  async function finish(how) {
    if (!st.ready || st.busy) return;
    st.busy = true; syncBtns(); setProg(how === 'apply' ? 'Salvando o recorte' : 'Montando o PNG', 0);
    try {
      const al = readAlpha();
      const r = await ask({ type:'final', alpha:al, withMask:how === 'apply' }, [al.buffer]);
      if (how === 'download') {
        await saveFile(r.png, cutFileName(L));
        st.busy = false; prog.hidden = true; syncBtns(); return;
      }
      const [src, mask] = [await putImage(r.png), await putImage(r.mask)];
      await getImage(src);
      pushUndo();
      const orig = srcOrig, before = L.src;
      L.cut = { orig, mask }; L.src = src;
      if (before !== orig && before !== src && RT.images.has(before)) RT.images.delete(before); // o recorte anterior não volta a ser usado (o desfazer recarrega)
      close(true);
      changed({ props:true }); toast('Fundo removido. A foto ficou no tamanho original.', 5000, { label:'Desfazer', fn:undo });
    } catch (e) {
      st.busy = false; syncBtns(); setProg('Não deu certo', 0, 'Não consegui salvar o recorte: ' + (e.message || e));
      setTimeout(() => { if (!st.busy) prog.hidden = true; }, 3500);
    }
  }
  function close(applied) {
    if (st.closed) return;
    if (!applied && st.dirty && !confirm('Descartar os retoques deste recorte?')) return;
    st.closed = true; CUTWIN = null;
    clearTimeout(st.fgT); cancelAnimationFrame(raf);
    if (st.worker) st.worker.terminate(); st.worker = null; // libera a memória da IA (RAM e placa de vídeo)
    for (const p of st.pending.values()) p.rej(new Error('fechado'));
    removeEventListener('keydown', key, true); removeEventListener('keyup', key, true); ro.disconnect();
    if (st.fg) st.fg.close(); mc.width = mc.height = 0; comp.width = comp.height = 0;
    win.remove();
  }
  startWorker(st.ai);
}
