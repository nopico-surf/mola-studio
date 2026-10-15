/* ============================================================
   Legendas: fala → texto com o tempo de cada palavra, no próprio navegador (sem API, sem custo, o som não sai da máquina)
   - Transcrição: Whisper large-v3-turbo (OpenAI, MIT), fp16, pelo transformers.js (Apache 2.0) no WebGPU.
   - Tempo de cada palavra: alinhamento forçado (a técnica do WhisperX) com um wav2vec2 treinado em português
     (jonatasgrosman, Apache 2.0). O Whisper acerta o texto mas erra o tempo das palavras em até 0,3 s; o alinhador
     encaixa cada letra no som, quadro a quadro (20 ms). Também serve para corrigir: texto trocado à mão é alinhado de novo.
   - Confiança de cada palavra = o quanto o som combina com ela, pelo alinhador (independente do Whisper):
     palavra duvidosa aparece marcada para revisar (pedido do usuário: "minha dicção é ruim").
   - Modelos (~2,25 GB) baixados uma vez em pedaços paralelos (o Hugging Face limita cada conexão) e guardados no
     armazenamento do navegador (OPFS, pasta 'mola-ai'). Tudo pesado roda num Worker encerrado no fim: a memória da IA
     só existe enquanto ela trabalha.
   ============================================================ */
const LEG = {
  tjs:'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js',
  host:'https://huggingface.co/',
  asr:{ id:'onnx-community/whisper-large-v3-turbo', rev:'360ebcde2559d60bb474678be3c1de9ef347d01a',
    dtype:{ encoder_model:'fp16', decoder_model_merged:'fp16' },
    files:[['onnx/encoder_model_fp16.onnx', 1274342603, 'fdadc70836e6b028fd5e580417c312208dad073d2d01e509e2d127c1373399d8'],
      ['onnx/decoder_model_merged_fp16.onnx', 344227339, 'fdf10afca73a0c7bf87286cfb96cf7028a9edbc9bb02512509a526f95b126c9d']] },
  ali:{ id:'onnx-community/wav2vec2-large-xlsr-53-portuguese-ONNX', rev:'6f425223d83cd1ad134c007798c47f2e122744fd',
    dtype:'fp16', files:[['onnx/model_fp16.onnx', 631533482, 'aa0cf9e009884a383b51b3712fd5fdfe0dee5b06fe019e99ad299c79182d433f']] },
  sr:16000,
};
const LEG_BYTES = [...LEG.asr.files, ...LEG.ali.files].reduce((s, f) => s + f[1], 0);

/* ------------ Worker (fonte inteira numa função: vira Blob de módulo) ------------ */
function legWorkerMain() {
  let tf = null, asr = null, ali = null, voc = null, VN = 0, cfg = null;
  const post = (m, t) => self.postMessage(m, t || []);
  const prog = (stage, x) => post({ type:'progress', stage, ...(x || {}) });

  /* ---- armazenamento: OPFS, um arquivo por URL ---- */
  const root = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('mola-ai', { create:true });
  const fname = u => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9._-]+/gi, '_').slice(-180);
  async function stored(u) { try { return await (await (await root()).getFileHandle(fname(u))).getFile(); } catch (e) { return null; } }
  // baixa para o OPFS: arquivo grande em pedaços paralelos escritos direto no disco (a memória não cresce com o arquivo)
  async function fetchTo(u, size, onBytes, sha) {
    const d = await root(), tmp = fname(u) + '.part';
    if (!size) { // pequeno (json): uma requisição
      const r = await fetch(u); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = new Uint8Array(await r.arrayBuffer()), fh = await d.getFileHandle(fname(u), { create:true }), w = await fh.createWritable();
      await w.write(b); await w.close(); return fh.getFile();
    }
    const fh = await d.getFileHandle(tmp, { create:true }), ah = await fh.createSyncAccessHandle();
    try {
      ah.truncate(size);
      const CH = 8 << 20; let next = 0;
      const one = async () => {
        for (;;) {
          const a = next; if (a >= size) return; next += CH;
          const b = Math.min(size, a + CH) - 1;
          for (let k = 0; ; k++) {
            try {
              const r = await fetch(u, { headers:{ Range:`bytes=${a}-${b}` } });
              if (r.status !== 206) throw new Error('HTTP ' + r.status);
              const rd = r.body.getReader(); let o = a;
              for (;;) {
                const { done, value } = await rd.read(); if (done) break;
                if (o + value.length > b + 1) throw new Error('tamanho');
                if (ah.write(value, { at:o }) !== value.length) throw new Error('escrita'); // sem espaço: não pode passar em silêncio
                o += value.length; onBytes(value.length);
              }
              if (o !== b + 1) throw new Error('incompleto');
              break;
            } catch (e) { if (k >= 5) throw e; await new Promise(r => setTimeout(r, 900 * (k + 1))); }
          }
        }
      };
      await Promise.all(Array.from({ length:12 }, one));
      ah.flush();
    } finally { ah.close(); }
    if (sha) { onBytes(0, 'verify'); if (await sha256(await fh.getFile(), onBytes) !== sha) { await d.removeEntry(tmp).catch(() => {}); throw new Error('O arquivo da IA chegou corrompido. Tente de novo.'); } }
    await fh.move(fname(u));
    return (await d.getFileHandle(fname(u))).getFile();
  }
  // SHA-256 lendo o arquivo em pedaços (o arquivo inteiro nunca fica na memória)
  async function sha256(file, onB) {
    const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const Hh = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
    const blk = (b, p) => {
      for (let i = 0; i < 16; i++) w[i] = (b[p + i * 4] << 24) | (b[p + i * 4 + 1] << 16) | (b[p + i * 4 + 2] << 8) | b[p + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const x = w[i - 15], y = w[i - 2]; w[i] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 16] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + w[i - 7]; }
      let a = Hh[0], bb = Hh[1], c = Hh[2], d = Hh[3], e = Hh[4], f = Hh[5], g = Hh[6], h = Hh[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      Hh[0] += a; Hh[1] += bb; Hh[2] += c; Hh[3] += d; Hh[4] += e; Hh[5] += f; Hh[6] += g; Hh[7] += h;
    };
    const n = file.size, CH = 16 << 20;
    for (let o = 0; o + 64 <= n; o += CH) {
      const b = new Uint8Array(await file.slice(o, Math.min(n, o + CH)).arrayBuffer()), m = b.length - (b.length % 64);
      for (let p = 0; p < m; p += 64) blk(b, p);
      onB && onB(m, 'verify');
      if (m < b.length) break;
    }
    const tail = n % 64, last = new Uint8Array(await file.slice(n - tail).arrayBuffer()), pad = new Uint8Array(tail < 56 ? 64 : 128);
    pad.set(last); pad[tail] = 0x80; const bits = n * 8, L = pad.length;
    for (let i = 0; i < 8; i++) pad[L - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 255;
    for (let p = 0; p < L; p += 64) blk(pad, p);
    return [...Hh].map(x => x.toString(16).padStart(8, '0')).join('');
  }
  const url = (m, f) => `${cfg.host}${m.id}/resolve/${m.rev}/${f}`;
  // o transformers.js pede cada arquivo por aqui: devolve o que já está guardado, senão baixa (os grandes já vieram no prefetch)
  const cache = {
    async match(key) {
      const k = typeof key === 'string' ? key : key.url;
      const f = await stored(k); if (f) return new Response(f, { headers:{ 'content-length':String(f.size) } });
      if (!k.startsWith(cfg.host) || /.onnx(_data)?$/.test(k)) return undefined; // modelo só vem pelo prefetch (pedaços paralelos)
      try { const g = await fetchTo(k, 0); return g ? new Response(g, { headers:{ 'content-length':String(g.size) } }) : undefined; } catch (e) { return undefined; }
    },
    async put() {},
  };
  async function prefetch() {
    const big = [...cfg.asr.files.map(f => [url(cfg.asr, f[0]), f[1], f[2]]), ...cfg.ali.files.map(f => [url(cfg.ali, f[0]), f[1], f[2]])];
    const total = big.reduce((s, f) => s + f[1], 0); let got = 0, last = 0;
    for (const [u, size, sha] of big) {
      const f = await stored(u);
      if (f && f.size === size) { got += size; continue; } // só fica com o nome final depois de conferido
      let vg = 0;
      await fetchTo(u, size, (n, st) => {
        if (st === 'verify') vg += n; else got += n;
        const now = Date.now(); if (now - last > 300) { last = now; prog(st === 'verify' ? 'verify' : 'download', st === 'verify' ? { got:vg, total:size } : { got, total }); }
      }, sha);
    }
  }

  /* ---- números por extenso (o alinhador só conhece letras) ---- */
  const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const k999 = n => { if (n === 100) return 'cem'; const p = []; if (n >= 100) p.push(C[Math.floor(n / 100)]); const r = n % 100; if (r) p.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : '')); return p.join(' e '); };
  function spell(n) {
    if (n < 1000) return n ? k999(n) : 'zero';
    const sc = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']], p = []; let r = n;
    for (const [v, s1, s2] of sc) { const q = Math.floor(r / v); if (!q) continue; p.push(v === 1e3 && q === 1 ? 'mil' : k999(q) + ' ' + (q === 1 ? s1 : s2)); r %= v; }
    if (r) p.push((r < 100 || r % 100 === 0 ? 'e ' : '') + k999(r));
    return p.join(' ');
  }
  function spellNum(m) {
    if (/^\d{1,3}(\.\d{3})+$/.test(m)) return spell(+m.replace(/\./g, ''));
    const [a, b] = m.split(/[.,]/);
    if (b == null) return a.length > 12 ? [...a].map(d => U[+d]).join(' ') : spell(+a);
    return spell(+a) + (b.length === 2 ? ' e ' + spell(+b) : ' vírgula ' + [...b].map(d => U[+d]).join(' '));
  }
  // palavra → letras que o alinhador conhece (os espaços de "quarenta e nove" viram '|')
  function aliChars(w, prev) {
    if (/^r$/i.test(w)) return ''; // "R$ 49,90": o valor é falado com "reais" (vem na palavra seguinte)
    if (prev && /^r$/i.test(prev) && /^d+(?:[.,]d+)*$/.test(w)) {
      const [a, b] = w.replace(/.(?=d{3})/g, '').split(','), n = +a;
      w = spell(n) + (n === 1 ? ' real' : ' reais') + (b && +b ? ' e ' + spell(+b.padEnd(2, '0').slice(0, 2)) + ' centavos' : '');
    }
    let s = w.toLowerCase().normalize('NFC').replace(/r\$\s*/g, '').replace(/(\d)\s*%/g, '$1 por cento').replace(/\d+(?:[.,]\d+)*/g, m => ' ' + spellNum(m) + ' ');
    s = [...s].map(ch => voc.has(ch) ? ch : ' ').join('').replace(/[-']+/g, m => m[0]).trim();
    return s ? s.split(/\s+/).join('|') : '';
  }

  /* ---- áudio: energia a cada 20 ms e cortes no silêncio (pedaços de até 28 s para o Whisper) ---- */
  function energy(a) {
    const hop = 320, n = Math.floor(a.length / hop), e = new Float32Array(n);
    for (let f = 0; f < n; f++) { let s = 0; for (let i = f * hop, j = i + hop; i < j; i++) s += a[i] * a[i]; e[f] = Math.sqrt(s / hop); }
    const sm = new Float32Array(n), R = 5; // ~200 ms
    for (let f = 0; f < n; f++) { let s = 0, k = 0; for (let j = Math.max(0, f - R); j <= Math.min(n - 1, f + R); j++) { s += e[j]; k++; } sm[f] = s / k; }
    return sm;
  }
  function pieces(a, e) {
    const fps = 50, n = e.length, srt = [...e].sort((x, y) => x - y), loud = srt[Math.floor(n * .95)] || 0, quiet = loud * .04, out = [];
    let c = 0;
    while (c < n) {
      let end = n;
      if (n - c > 28 * fps) { let best = c + 28 * fps, bv = Infinity; for (let f = c + 12 * fps; f < c + 28 * fps; f++) if (e[f] < bv) { bv = e[f]; best = f; } end = best; }
      let mx = 0; for (let f = c; f < end; f++) mx = Math.max(mx, e[f]);
      if (mx > quiet) out.push([c, end]); // pedaço só de silêncio: o Whisper inventaria frases ("Legendas pela comunidade Amara.org")
      c = end;
    }
    return out.map(([f0, f1]) => [f0 * 320, Math.min(a.length, f1 * 320)]);
  }

  /* ---- alinhador: log-probabilidades das letras a cada 20 ms (janelas de 20 s com 1 s de contexto) ---- */
  async function logprobs(a, onP) {
    const hop = 320, T = Math.floor(a.length / hop), V = VN, lp = new Float32Array(T * V);
    const win = 20 * 16000, ctx = 16000;
    for (let s = 0; s < a.length; s += win) {
      const w0 = Math.max(0, s - ctx), w1 = Math.min(a.length, s + win + ctx), x = a.slice(w0, w1);
      let mu = 0; for (const v of x) mu += v; mu /= x.length; let va = 0; for (const v of x) va += (v - mu) ** 2; const sd = Math.sqrt(va / x.length + 1e-7);
      for (let i = 0; i < x.length; i++) x[i] = (x[i] - mu) / sd;
      const out = await ali({ input_values:new tf.Tensor('float32', x, [1, x.length]) });
      const lg = out.logits, nf = lg.dims[1], nv = lg.dims[2], d = lg.data;
      const base = Math.round(w0 / hop);
      for (let f = 0; f < nf; f++) {
        const g = base + f; if (g < s / hop || g >= Math.min(T, (s + win) / hop)) continue;
        let mx = -Infinity; for (let v = 0; v < nv; v++) mx = Math.max(mx, +d[f * nv + v]);
        let se = 0; for (let v = 0; v < nv; v++) se += Math.exp(+d[f * nv + v] - mx);
        const ls = mx + Math.log(se); for (let v = 0; v < Math.min(nv, V); v++) lp[g * V + v] = +d[f * nv + v] - ls;
      }
      lg.dispose && lg.dispose();
      onP(Math.min(1, (s + win) / a.length));
    }
    return { lp, T, V };
  }
  // alinhamento forçado (Viterbi) de uma sequência de letras numa janela de quadros. Pontas livres: o começo e o fim da janela
  // podem ser de outra fala (a janela tem folga), então ficar parado antes da 1ª letra e depois da última não custa nada
  function viterbi(L, f0, f1, toks) {
    const { lp, V } = L, J = toks.length, F = f1 - f0; if (!J || F < J) return null;
    let prev = new Float32Array(J + 1).fill(-Infinity), cur = new Float32Array(J + 1); prev[0] = 0;
    const dec = new Uint8Array(F * (J + 1));
    for (let t = 0; t < F; t++) {
      const r = (f0 + t) * V; cur[0] = prev[0];
      for (let j = 1; j <= J; j++) {
        const tk = toks[j - 1], em = lp[r + tk];
        const st = prev[j] + (j === J ? 0 : Math.max(lp[r], em)), ad = prev[j - 1] + em; // lp[r] = <pad> (vazio do CTC)
        if (ad > st) { cur[j] = ad; dec[t * (J + 1) + j] = 1; } else cur[j] = st;
      }
      const sw = prev; prev = cur; cur = sw;
    }
    if (!(prev[J] > -Infinity)) return null;
    const at = new Int32Array(J); let j = J;
    for (let t = F - 1; t >= 0 && j > 0; t--) if (dec[t * (J + 1) + j]) at[--j] = f0 + t;
    return j === 0 ? at : null;
  }
  function alignGroup(L, words, t0, t1) {
    const toks = [], span = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i], cs = aliChars(w.w, i ? words[i - 1].w : null);
      if (!cs) { span.push(null); continue; }
      if (toks.length) toks.push(voc.get('|'));
      const a = toks.length; for (const ch of cs) toks.push(voc.get(ch)); span.push([a, toks.length]);
    }
    const f0 = Math.max(0, Math.floor(t0 * 50)), f1 = Math.min(L.T, Math.ceil(t1 * 50)), at = viterbi(L, f0, f1, toks);
    if (!at) return false;
    words.forEach((w, i) => {
      const sp = span[i]; if (!sp) return;
      const a = at[sp[0]], b = at[sp[1] - 1]; let sc = 0, n = 0;
      // confiança: a melhor probabilidade da letra perto de onde ela foi posta (até 3 quadros, sem passar das vizinhas)
      for (let k = sp[0]; k < sp[1]; k++) {
        if (toks[k] === voc.get('|')) continue;
        const lo = Math.max(k ? at[k - 1] + 1 : 0, at[k] - 3), hi = Math.min(k + 1 < at.length ? at[k + 1] - 1 : L.T - 1, at[k] + 3);
        let best = -Infinity; for (let f = lo; f <= hi; f++) best = Math.max(best, L.lp[f * L.V + toks[k]]);
        sc += Math.exp(Math.max(best, L.lp[at[k] * L.V + toks[k]])); n++;
      }
      let e = b + 1; const lim = Math.min(L.T, b + 12, i + 1 < words.length && span[i + 1] ? at[span[i + 1][0]] : Infinity);
      while (e < lim) { const r = e * L.V; let best = 0; for (let v = 1; v < L.V; v++) if (L.lp[r + v] > L.lp[r + best]) best = v; if (best !== toks[sp[1] - 1]) break; e++; }
      w.s = a / 50; w.e = e / 50; w.c = n ? sc / n : null;
    });
    return true;
  }
  // palavra sem letra alinhável (símbolo, emoji) ou grupo que não alinhou: tempo dividido entre as vizinhas, pelo tamanho
  function fillGaps(words, lo, hi) {
    let i = 0;
    while (i < words.length) {
      if (words[i].s != null) { i++; continue; }
      let j = i; while (j < words.length && words[j].s == null) j++;
      const a = i ? words[i - 1].e : lo, b = j < words.length ? words[j].s : hi, len = words.slice(i, j).reduce((s, w) => s + w.w.length + 1, 0);
      let t = a; for (let k = i; k < j; k++) { const d = (b - a) * (words[k].w.length + 1) / len; words[k].s = t; words[k].e = t + d; if (words[k].c === undefined) words[k].c = null; t += d; }
      i = j;
    }
  }
  function align(L, segs) {
    // grupos de falas seguidas (até 30 s): o alinhamento não depende do tempo de cada frase que o Whisper deu
    const groups = []; let g = null;
    for (const s of segs) {
      if (g && s.s - g.e < 1.5 && s.e - g.s < 30) { g.e = Math.max(g.e, s.e); g.words.push(...s.words); }
      else { g = { s:s.s, e:s.e, words:[...s.words] }; groups.push(g); }
    }
    for (const G of groups) {
      if (!alignGroup(L, G.words, G.s - 1, G.e + 1)) for (const w of G.words) { w.s = w.e = null; w.c = 0; }
      fillGaps(G.words, G.s, G.e);
    }
  }
  const JUNK = /amara\.org|legendas? (pela|por)|legendado por|inscreva-se|obrigad[oa] por assistir|tradu[cç][aã]o (e|por)/i;

  async function run(a, opts) {
    const t0 = performance.now(), e = energy(a), ps = pieces(a, e), segs = [];
    // 1) Whisper, pedaço por pedaço (o progresso anda e nenhum pedaço passa de 30 s)
    for (let i = 0; i < ps.length; i++) {
      const [s0, s1] = ps[i], off = s0 / 16000;
      prog('asr', { f:i / ps.length });
      const r = await asr(a.subarray(s0, s1), { language:opts.lang || 'portuguese', task:'transcribe', return_timestamps:true });
      for (const c of r.chunks || [{ text:r.text, timestamp:[0, (s1 - s0) / 16000] }]) {
        const text = (c.text || '').trim(); if (!text) continue;
        const ts = c.timestamp || [], s = off + (ts[0] ?? 0), en = off + (ts[1] ?? (s1 - s0) / 16000);
        segs.push({ s, e:Math.max(s + .1, en), text, words:text.split(/\s+/).filter(Boolean).map(w => ({ w })) });
      }
    }
    const tAsr = performance.now();
    // 2) alinhador
    prog('align', { f:0 });
    const L = await logprobs(a, f => prog('align', { f:f * .9 }));
    align(L, segs);
    // 3) frase inventada sobre som baixo/ruído: o alinhador não reconhece nada nela
    const keep = segs.filter(s => { const cs = s.words.filter(w => w.c != null), c = cs.reduce((t, w) => t + w.c, 0) / Math.max(1, cs.length); s.c = c; return !(JUNK.test(s.text) && c < .35) && !(c < .08 && s.words.length < 4); });
    const words = keep.flatMap(s => s.words.map((w, i) => ({ w:w.w, s:+w.s.toFixed(3), e:+w.e.toFixed(3), c:w.c == null ? null : +w.c.toFixed(3), ...(i === 0 ? { seg:1 } : {}) })));
    return { words, ms:{ asr:Math.round(tAsr - t0), align:Math.round(performance.now() - tAsr) }, dur:a.length / 16000 };
  }
  // texto corrigido à mão: alinha de novo só aquele trecho (o tempo das outras palavras não muda)
  async function realign(a, words, t0, t1) {
    // só o trecho (com 1 s de folga): o alinhador roda em poucos décimos
    const z0 = Math.max(0, Math.floor((t0 - 1) * 50) * 320), z1 = Math.min(a.length, Math.ceil((t1 + 1) * 50) * 320), o = z0 / 16000;
    const Lp = await logprobs(a.slice(z0, z1), () => {}), ws = words.map(w => ({ w:w.w }));
    if (!alignGroup(Lp, ws, Math.max(0, t0 - .3 - o), t1 + .3 - o)) for (const w of ws) w.s = null;
    else for (const w of ws) if (w.s != null) { w.s += o; w.e += o; }
    fillGaps(ws, t0, t1);
    return ws.map(w => ({ w:w.w, s:+w.s.toFixed(3), e:+w.e.toFixed(3), c:w.c == null ? null : +w.c.toFixed(3) }));
  }

  let AUDIO = null;
  self.onmessage = async ev => {
    const m = ev.data;
    try {
      if (m.type === 'init') {
        cfg = m.cfg; const need = m.need || ['asr', 'ali'];
        if (!navigator.gpu) throw new Error('NO_WEBGPU');
        const ad = await navigator.gpu.requestAdapter({ powerPreference:'high-performance' });
        if (!ad) throw new Error('NO_WEBGPU');
        if (!ad.features.has('shader-f16')) throw new Error('NO_F16');
        prog('download', { got:0, total:1 });
        await prefetch();
        if (!tf) {
          prog('load');
          tf = await import(cfg.tjs);
          tf.env.allowLocalModels = false; tf.env.useBrowserCache = false; tf.env.useCustomCache = true; tf.env.customCache = cache;
          tf.env.remoteHost = cfg.host;
          if (cfg.wasm) tf.env.backends.onnx.wasm.wasmPaths = cfg.wasm;
          const vj = await (await cache.match(url(cfg.ali, 'vocab.json'))).json();
          voc = new Map(Object.entries(vj).filter(([k]) => k.length === 1)); VN = Object.keys(vj).length;
        }
        if (need.includes('asr') && !asr) { prog('prepare', { what:'asr' }); asr = await tf.pipeline('automatic-speech-recognition', cfg.asr.id, { revision:cfg.asr.rev, device:'webgpu', dtype:cfg.asr.dtype }); }
        if (need.includes('ali') && !ali) { prog('prepare', { what:'align' }); ali = await tf.AutoModelForCTC.from_pretrained(cfg.ali.id, { revision:cfg.ali.rev, device:'webgpu', dtype:cfg.ali.dtype }); }
        post({ type:'ready' });
      } else if (m.type === 'run') {
        AUDIO = m.audio;
        const r = await run(AUDIO, m.opts || {});
        post({ type:'done', id:m.id, ...r });
      } else if (m.type === 'realign') {
        if (m.audio) AUDIO = m.audio;
        post({ type:'done', id:m.id, words:await realign(AUDIO, m.words, m.t0, m.t1) });
      }
    } catch (e) {
      post({ type:'error', id:m.id, stage:m.type, msg:String(e && e.message || e) });
    }
  };
}

/* ------------ lado do editor: abre o worker, manda o som (16 kHz mono) e devolve as palavras ------------ */
let LEG_IDLE = 0;
const LEGW = { worker:null, ready:null, pending:new Map(), id:0, onProg:null, has:new Set() };
// need = quais IAs abrir ('asr' transcreve, 'ali' alinha); o worker aberto ganha só as que faltam
function legStart(onProg, need = ['asr', 'ali']) {
  LEGW.onProg = onProg; clearTimeout(LEG_IDLE);
  if (LEGW.ready && need.every(k => LEGW.has.has(k))) return LEGW.ready;
  if (LEGW.worker) { // aberto, mas sem uma das IAs
    LEGW.ready = LEGW.ready.then(() => new Promise((res, rej) => { LEGW.initRes = res; LEGW.initRej = rej; LEGW.worker.postMessage({ type:'init', cfg:LEGW.cfg, need }); }));
    need.forEach(k => LEGW.has.add(k)); return LEGW.ready;
  }
  const dev = window.LEG_DEV || {}; // testes: { host, tjs, wasm } apontando para cópias locais
  const src = '(' + legWorkerMain.toString() + ')()';
  const u = URL.createObjectURL(new Blob([src], { type:'text/javascript' }));
  // worker clássico, como o do Remover fundo (funciona também abrindo o index.html direto do disco; módulo de Blob não abre sem servidor);
  // o transformers.js entra por import() dinâmico. O endereço do Blob só é solto no legStop: soltar logo fazia o worker não abrir.
  LEGW.url = u;
  const w = LEGW.worker = new Worker(u);
  LEGW.ready = new Promise((res, rej) => {
    LEGW.initRes = res; LEGW.initRej = rej;
    w.onmessage = ev => {
      const m = ev.data;
      if (m.type === 'progress') { LEGW.onProg && LEGW.onProg(m); return; }
      if (m.type === 'ready') { LEGW.initRes(); return; }
      if (m.type === 'error' && m.stage === 'init') { LEGW.initRej(new Error(m.msg)); legStop(); return; }
      const p = LEGW.pending.get(m.id); if (!p) return; LEGW.pending.delete(m.id);
      if (m.type === 'error') p.rej(new Error(m.msg)); else p.res(m);
    };
    w.onerror = ev => { LEGW.initRej(new Error(ev.message ? 'worker: ' + ev.message : 'o processo da IA não abriu (' + (location.protocol === 'file:' ? 'arquivo aberto direto do disco' : 'worker') + ')')); legStop(); };
  });
  LEGW.cfg = { ...LEG, host:dev.host || LEG.host, tjs:dev.tjs || LEG.tjs, wasm:dev.wasm || null };
  need.forEach(k => LEGW.has.add(k));
  w.postMessage({ type:'init', cfg:LEGW.cfg, need });
  return LEGW.ready;
}
function legStop() {
  if (LEGW.worker) LEGW.worker.terminate();
  if (LEGW.url) { URL.revokeObjectURL(LEGW.url); LEGW.url = null; }
  for (const p of LEGW.pending.values()) p.rej(new Error('cancelado'));
  LEGW.worker = null; LEGW.ready = null; LEGW.pending.clear(); LEGW.has.clear(); clearTimeout(LEG_IDLE);
}
function legAsk(msg, transfer) {
  return new Promise((res, rej) => { const id = ++LEGW.id; LEGW.pending.set(id, { res, rej }); LEGW.worker.postMessage({ ...msg, id }, transfer || []); });
}
// AudioBuffer (qualquer taxa, qualquer canal) → Float32Array 16 kHz mono
async function legResample(buf) {
  const n = Math.ceil(buf.duration * LEG.sr), off = new OfflineAudioContext(1, Math.max(1, n), LEG.sr), s = off.createBufferSource();
  s.buffer = buf; s.connect(off.destination); s.start();
  return (await off.startRendering()).getChannelData(0).slice();
}
async function legTranscribe(audio, onProg, opts) {
  await legStart(onProg);
  return legAsk({ type:'run', audio, opts }, [audio.buffer]);
}

/* ============================================================
   Camada de legenda: um texto (type 'text', role 'caption') com L.capt = { words:[{ w, s, e, c }], t0 }.
   - s/e em segundos da timeline; o desenho desloca por L.start − t0 (arrastar a barra leva a legenda junto).
   - Blocos (o que aparece de cada vez) saem das palavras: quebra no fim de frase, numa pausa, no limite de palavras e
     de letras por linha (capBlocks, guardado por WeakMap: só refaz quando as palavras ou os ajustes mudam).
   - Desenho: drawText com uma "vista" da camada (Object.create) cujo texto é o bloco da vez; cada palavra ganha o
     estado do estilo pelo tempo dela (_capSt) e, no estilo Caixa, uma caixa atrás da palavra falada (_capPre).
   - L.text = o bloco mais longo: tamanho do bloco, seleção, alinhar e layouts veem uma caixa de legenda de verdade.
   - Palavra com confiança baixa (o som combina pouco com ela) fica marcada na lista para revisar.
   - capt.words é trocado inteiro a cada edição (nunca mutado): a assinatura do cache do palco usa a identidade dele.
   ============================================================ */
const CAP_DUB = .5; // abaixo disso a palavra aparece para conferir
const CAP_STYLES = {
  karaoke:{ name:'Karaokê', tip:'A frase inteira e a palavra falada acende', mode:'karaoke', words:5, lines:2, ch:18, hl:'accent',
    props:{ weight:800, upper:true, italic:false, size:72, color:'#FFFFFF', ls:0, wsp:.12, lh:1.06, stroke:true, strokeColor:'#000000', strokeW:9, strokePos:'outside', shadow:'none', tbg:false } },
  pop:{ name:'Palavra por palavra', tip:'Cada palavra entra quando é falada', mode:'pop', words:4, lines:2, ch:16, hl:'accent',
    props:{ weight:800, upper:true, italic:false, size:76, color:'#FFFFFF', ls:0, wsp:.14, lh:1.06, stroke:true, strokeColor:'#000000', strokeW:9, strokePos:'outside', shadow:'none', tbg:false } },
  box:{ name:'Caixa na palavra', tip:'Uma caixa colorida corre atrás da palavra falada', mode:'box', words:4, lines:2, ch:16, hl:'accent',
    props:{ weight:800, upper:true, italic:false, size:70, color:'#FFFFFF', ls:0, wsp:.3, lh:1.22, stroke:false, shadow:'soft', tbg:false } },
  one:{ name:'Uma palavra', tip:'Uma palavra de cada vez, grande', mode:'one', words:1, lines:1, ch:14, hl:null,
    props:{ weight:900, upper:true, italic:false, size:120, color:'#FFFFFF', ls:0, wsp:0, lh:1, stroke:true, strokeColor:'#000000', strokeW:12, strokePos:'outside', shadow:'none', tbg:false } },
  impact:{ name:'Impacto', tip:'A palavra falada cresce e muda de cor', mode:'impact', words:3, lines:2, ch:14, hl:'#FFE14D',
    props:{ weight:900, upper:true, italic:false, size:84, color:'#FFFFFF', ls:0, wsp:.26, lh:1.12, stroke:true, strokeColor:'#000000', strokeW:13, strokePos:'outside', shadow:'none', tbg:false } },
  clean:{ name:'Frase', tip:'Legenda clássica, com fundo, frase por frase', mode:'clean', words:12, lines:2, ch:30, punct:true, hl:null,
    props:{ weight:600, upper:false, italic:false, size:50, color:'#FFFFFF', ls:0, wsp:0, lh:1.12, stroke:false, shadow:'none', tbg:true, hl:'#000000B3', hlPadX:.38, hlPadY:.14, hlRad:.22, hlBox:'line' } },
};
const capStyle = L => CAP_STYLES[L.capStyle] || CAP_STYLES.karaoke;
const capOff = L => (L.start || 0) - (L.capt.t0 || 0);
const capHlOf = L => L.capHl || S.brand.colors[2];
function capApplyStyle(L, id) {
  const st = CAP_STYLES[id]; if (!st) return;
  Object.assign(L, st.props, { capStyle:id, capWords:st.words, capLines:st.lines, capCh:st.ch, capPunct:!!st.punct });
  if (st.hl) L.capHl = st.hl === 'accent' ? S.brand.colors[2] : st.hl;
  RT.layout.clear();
}
const capShow = (w, punct) => punct ? w : w.replace(/[.,;:]+$/, '') || w; // sem pontuação no fim (a não ser ? ! …)
const CAPB = new WeakMap();
function capBlocks(L) {
  const ws = L.capt.words, maxW = Math.max(1, Math.round(L.capWords || 4)), lines = L.capLines === 1 ? 1 : 2, ch = L.capCh || 18, punct = !!L.capPunct;
  const key = [maxW, lines, ch, punct].join('|'), c = CAPB.get(ws);
  if (c && c.key === key) return c.bl;
  const bl = [], lim = ch * lines;
  let cur = [], len = 0;
  const flush = () => {
    if (!cur.length) return;
    const parts = cur.map(i => capShow(ws[i].w, punct));
    let text = parts.join(' ');
    if (lines === 2 && text.length > ch && parts.length > 1) { // duas linhas equilibradas
      let best = 1, bv = Infinity;
      for (let k = 1; k < parts.length; k++) { const a = parts.slice(0, k).join(' ').length, b = parts.slice(k).join(' ').length, v = Math.max(a, b); if (v < bv) { bv = v; best = k; } }
      text = parts.slice(0, best).join(' ') + '\n' + parts.slice(best).join(' ');
    }
    bl.push({ i0:cur[0], i1:cur[cur.length - 1], s:ws[cur[0]].s, e:Math.max(ws[cur[cur.length - 1]].e, ws[cur[0]].s + .3), text, ws:cur.map(i => ws[i]) });
    cur = []; len = 0;
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], n = capShow(w.w, punct).length;
    if (cur.length) {
      const p = ws[i - 1], gap = w.s - p.e, end = /[.!?…]["”']?$/.test(p.w), comma = /[,;:]$/.test(p.w);
      const full = cur.length >= maxW || len + 1 + n > lim;
      if (full && !(gap > .6 || end) && cur.length >= 3 && maxW > 2) {
        // a frase acaba nesta palavra: leva a anterior junto, senão ela fica sozinha no bloco seguinte
        const nx = ws[i + 1], last = !nx || /[.!?…]["”']?$/.test(w.w) || nx.s - w.e > .6;
        if (last) { const mv = cur.pop(); len -= capShow(ws[mv].w, punct).length + 1; flush(); cur.push(mv); len = capShow(ws[mv].w, punct).length; }
        else flush();
      } else if (full || gap > .6 || end || (comma && cur.length >= 2 && len > lim * .4)) flush();
    }
    cur.push(i); len += (cur.length > 1 ? 1 : 0) + n;
  }
  flush();
  // tempo de cada bloco: emenda no próximo se o vão é curto (sem piscar), senão fica um pouco depois da última palavra
  for (let k = 0; k < bl.length; k++) {
    const b = bl[k], nx = bl[k + 1];
    if (nx && nx.s - b.e < .35) { b.e = nx.s; b.join = true; } else b.e = nx ? Math.min(nx.s, b.e + .3) : b.e + .3;
  }
  CAPB.set(ws, { key, bl });
  const lg = bl.reduce((m, b) => b.text.length > m.length ? b.text : m, '');
  if (lg && L.text !== lg) { L.text = lg; RT.layout.clear(); } // a caixa da camada = o bloco mais longo
  return bl;
}
function capAt(bl, tl) {
  let lo = 0, hi = bl.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bl[m].s <= tl) { r = m; lo = m + 1; } else hi = m - 1; }
  return r >= 0 && tl < bl[r].e ? bl[r] : null;
}
// estado de cada palavra pelo tempo (determinístico: só depende de t)
function capState(L, b, k, tl, cur) {
  const st = capStyle(L), w = b.ws[k]; if (!w) return {};
  const age = tl - b.s, ts = tl - w.s, hl = st.hl ? capHlOf(L) : null, on = k === cur;
  const fade = b.join ? 1 : clamp((b.e - tl) / .12);
  const enter = clamp(age / .09), pop0 = .9 + .1 * Ease.spring(clamp(age / .3), .3);
  switch (st.mode) {
    case 'pop': case 'one': {
      if (ts < 0) return { a:0 };
      const one = st.mode === 'one', p = clamp(ts / (one ? .28 : .22));
      return { a:clamp(ts / .05) * fade, sc:(one ? .45 : .55) + (one ? .55 : .45) * Ease.spring(p, .55), dy:(1 - Ease.cubicOut(clamp(ts / .16))) * L.size * .14, col:on && hl ? hl : null };
    }
    case 'impact': return { a:enter * fade, sc:pop0 * (on ? 1 + .16 * Ease.backOut(clamp(ts / .18), .6) : 1), col:on ? hl : null };
    case 'box': return { a:enter * fade, sc:pop0, col:on && L.capInk ? L.capInk : null };
    case 'clean': return { a:clamp(age / .15) * (b.join ? 1 : clamp((b.e - tl) / .15)) };
    default: return { a:enter * fade, sc:pop0, col:on ? hl : null }; // karaokê: só a cor (ampliar a palavra invade a vizinha)
  }
}
// caixa atrás da palavra falada (estilo Caixa): anda da palavra anterior até a atual em 0,1 s
function capBox(c, lay, L, b, tl, cur) {
  if (cur < 0) return;
  const size = lay.size, rect = k => {
    for (const line of lay.lines) {
      const gs = line.glyphs.filter(g => g.word === k && !g.space); if (!gs.length) continue;
      const a = gs[0], z = gs[gs.length - 1], px = size * .16, py = size * .1;
      return { x:line.x0 + a.x - px, y:line.baseline - size * .8 - py, w:z.x + z.w - a.x + 2 * px, h:size * 1.02 + 2 * py };
    }
    return null;
  };
  const r1 = rect(cur); if (!r1) return;
  const age = tl - b.ws[cur].s, p = cur > 0 ? Ease.cubicOut(clamp(age / .1)) : 1, r0 = cur > 0 ? rect(cur - 1) || r1 : r1;
  const m = (a, z) => a + (z - a) * p, enter = clamp((tl - b.s) / .09);
  c.save(); c.globalAlpha *= enter * (b.join ? 1 : clamp((b.e - tl) / .12)); c.fillStyle = capHlOf(L);
  rrect(c, m(r0.x, r1.x), m(r0.y, r1.y), m(r0.w, r1.w), m(r0.h, r1.h), size * .16); c.fill(); c.restore();
}
function capRestBounds(L) {
  const lay = layoutText(L, caseTxt(L, L.text || ' ')), pl = placeOf(L), fit = textFit(L, lay, pl), fk = fit.k * pl.k;
  L._bounds = { x:fit.ax - lay.blockW * fk / 2, y:fit.ay - lay.blockH * fk / 2, w:lay.blockW * fk, h:lay.blockH * fk, k:fk };
}
// chamado por drawText quando a camada tem L.capt
function drawCaption(ctx, L, t, R) {
  if (!phase(L, t)) return;
  const bl = capBlocks(L), off = capOff(L), tl = t - off, b = capAt(bl, tl);
  if (!b) { capRestBounds(L); return; }
  let cur = -1; for (let k = 0; k < b.ws.length; k++) if (b.ws[k].s <= tl + 1e-4) cur = k;
  const V = Object.create(L);
  Object.assign(V, { _capView:true, text:b.text, start:b.s + off, end:b.e + off, in:'cut', out:'cut', inDur:0, outDur:0, runs:undefined });
  V._capSt = k => capState(L, b, k, tl, cur);
  if (capStyle(L).mode === 'box') V._capPre = (c, lay) => capBox(c, lay, L, b, tl, cur);
  drawText(ctx, V, t, R);
  L._bounds = V._bounds;
}

/* ------------ gerar: som das camadas de áudio (sem a trilha) → IA → camada nova ------------ */
async function legHave() {
  const dev = window.LEG_DEV || {}, host = dev.host || LEG.host;
  try {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('mola-ai');
    const fname = u => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9._-]+/gi, '_').slice(-180);
    for (const [m, f] of [...LEG.asr.files.map(f => [LEG.asr, f]), ...LEG.ali.files.map(f => [LEG.ali, f])]) {
      const file = await (await d.getFileHandle(fname(`${host}${m.id}/resolve/${m.rev}/${f[0]}`))).getFile();
      if (file.size !== f[1]) return false;
    }
    return true;
  } catch (e) { return false; }
}
// a fala que está na timeline: só as camadas de áudio (som dos vídeos), sem a música nem os efeitos, já com cortes e pausas
async function capAudio() {
  const buf = await buildMix(LEG.sr, S.duration, null, true), a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}
function capProgWin(onCancel) {
  const title = h('h2', { text:'Gerando a legenda' }), msg = h('p', { class:'ask-msg' }), bar = h('div', { class:'leg-bar' }, [h('i')]), sub = h('p', { class:'hint' });
  const cancel = h('button', { class:'btn small ghost', text:'Cancelar', onclick:() => { onCancel(); close(); } });
  const ov = h('div', { class:'modal ask leg-win' }, [h('div', { class:'modal-card', role:'dialog', 'aria-modal':'true' }, [title, msg, bar, sub, h('div', { class:'row', style:'justify-content:flex-end' }, [cancel])])]);
  document.body.append(ov);
  const set = (m, f, s) => { msg.textContent = m; bar.classList.toggle('busy', f == null); bar.firstChild.style.width = f == null ? '' : Math.round(clamp(f) * 100) + '%'; sub.textContent = s || ''; };
  const gb = v => (v / 1e9).toFixed(2).replace('.', ',');
  const prog = m => {
    if (m.stage === 'download') set('Baixando as IAs (só na primeira vez)', m.total > 1 ? m.got / m.total : 0, m.total > 1 ? `${gb(m.got)} de ${gb(m.total)} GB` : '');
    else if (m.stage === 'verify') set('Conferindo o arquivo baixado', m.got / m.total);
    else if (m.stage === 'load') set('Abrindo as IAs', null);
    else if (m.stage === 'prepare') set('Preparando as IAs na placa de vídeo', null, 'Leva alguns segundos.');
    else if (m.stage === 'asr') set('Ouvindo a fala', m.f, 'O Whisper transcreve o áudio inteiro.');
    else if (m.stage === 'align') set('Acertando o tempo de cada palavra', m.f, 'O alinhador encaixa cada letra no som.');
  };
  function close() { ov.remove(); }
  const fail = text => { title.textContent = 'Não deu certo'; set(text, 0); cancel.textContent = 'Fechar'; };
  return { set, prog, close, fail };
}
function capErr(e) {
  const m = String(e && e.message || e);
  if (m === 'NO_WEBGPU') return 'Este navegador não tem WebGPU. Use o Chrome ou o Edge atualizados.';
  if (m === 'NO_F16') return 'A placa de vídeo deste computador não aceita o formato das IAs (fp16).';
  if (/unsafe for access|SecurityError/i.test(m)) return 'O Chrome bloqueou o armazenamento das IAs. Abra o Mola por http://localhost:3000 (npx serve .), não pelo arquivo direto.';
  if (/espaço|quota|escrita/i.test(m)) return 'Sem espaço para guardar as IAs neste navegador (precisa de ~2,3 GB livres).';
  return 'A legenda falhou: ' + m;
}
async function capGenerate(L0) {
  if (!audLayers().length) { toast('Importe um vídeo com som (ou uma camada de áudio) para gerar a legenda', 4500); return; }
  if (!navigator.gpu) { toast(capErr(new Error('NO_WEBGPU')), 5000); return; }
  if (location.protocol === 'file:') { // o Chrome bloqueia o armazenamento das IAs (OPFS) em arquivo aberto direto do disco
    await askConfirm('Abra o Mola pelo servidor', 'A legenda guarda as IAs no navegador, e o Chrome não deixa isso com o arquivo aberto direto do disco. Rode "npx serve ." na pasta do Mola e abra http://localhost:3000. Seus arquivos continuam os mesmos.', 'Entendi');
    return;
  }
  if (!(await legHave()) && !(await askConfirm('Baixar as IAs da legenda?',
    `A legenda é feita no seu computador: sem custo, e o som não sai daqui. Na primeira vez o Mola baixa duas IAs (${(LEG_BYTES / 1e9).toFixed(1).replace('.', ',')} GB, uma vez só) e guarda neste navegador. Depois abre em uns 15 segundos.`, 'Baixar e legendar'))) return;
  if (L0 && !(await askConfirm('Gerar a legenda de novo?', 'O texto e as correções desta legenda são trocados pelos novos. O estilo fica. Ctrl+Z desfaz.', 'Gerar de novo'))) return;
  pause();
  let off = false; const win = capProgWin(() => { off = true; legStop(); });
  try {
    win.set('Preparando o som', null);
    const a = await capAudio();
    const r = await legTranscribe(a, m => { if (!off) win.prog(m); }, {});
    legStop(); // a memória das IAs (placa de vídeo e RAM) volta na hora
    if (off) return;
    win.close();
    if (!r.words.length) { toast('Não encontrei fala no som do arquivo', 4000); return; }
    capCreate(r.words, L0);
  } catch (e) { legStop(); if (!off) win.fail(capErr(e)); }
}
function capCreate(words, L0) {
  pushUndo();
  let L = L0 && S.layers.includes(L0) ? L0 : null;
  if (L) L.capt = { ...L.capt, words };
  else {
    L = mkText('caption', { name:'Legenda', text:' ', in:'cut', out:'cut', inDur:0, outDur:0, x:.5 + curSlide(), y:.74, maxW:.88, align:'center' });
    capApplyStyle(L, 'karaoke');
    L.capt = { words, t0:0 }; L.start = 0; L.end = null;
    S.layers.push(L);
  }
  capBlocks(L);
  select(L.id); propTab = 'style'; changed({ layers:true, props:true }); renderTimeline();
  T = clamp(words[0].s + .05, 0, S.duration); RT.userSeek = false; needs = true;
  const n = words.filter(w => w.c != null && w.c < CAP_DUB).length;
  toast(n ? `Legenda pronta. ${n} palavra${n > 1 ? 's' : ''} para conferir (marcadas no painel)` : 'Legenda pronta', 5000, UNDO_ACT);
}

/* ------------ corrigir: texto trocado à mão volta a ser alinhado (só o alinhador, ~3 s para abrir) ------------ */
async function capRealign(L, ws, i0, n) {
  try {
    const a = await capAudio();
    await legStart(null, ['ali']);
    const s0 = ws[i0].s, e1 = ws[i0 + n - 1].e;
    const r = await legAsk({ type:'realign', audio:a, words:ws.slice(i0, i0 + n), t0:s0, t1:e1 }, [a.buffer]);
    legIdle();
    if (L.capt.words !== ws || !S.layers.includes(L)) return; // mudou de novo enquanto alinhava
    const nw = ws.slice(); r.words.forEach((w, k) => { nw[i0 + k] = { ...nw[i0 + k], s:w.s, e:w.e }; });
    L.capt = { ...L.capt, words:nw }; changed(); renderProps();
  } catch (e) { legIdle(); }
}
const legIdle = () => { clearTimeout(LEG_IDLE); LEG_IDLE = setTimeout(legStop, 60000); }; // o alinhador fica aberto 1 min para a próxima correção
function capEdit(L, b, text) {
  const ws = L.capt.words, old = ws.slice(b.i0, b.i1 + 1), toks = text.trim().split(/\s+/).filter(Boolean);
  if (toks.join(' ') === old.map(w => w.w).join(' ')) return;
  pushUndo();
  const s0 = old[0].s, e1 = old[old.length - 1].e;
  let nw;
  if (toks.length === old.length) nw = old.map((w, k) => w.w === toks[k] ? w : { ...w, w:toks[k], c:1 }); // trocou palavras: o tempo fica
  else { // número de palavras mudou: divide o tempo pelo tamanho e o alinhador acerta em seguida
    const tot = toks.reduce((s, x) => s + x.length + 1, 0); let t = s0;
    nw = toks.map(x => { const d = (e1 - s0) * (x.length + 1) / tot, w = { w:x, s:+t.toFixed(3), e:+(t + d).toFixed(3), c:1 }; t += d; return w; });
  }
  if (old[0].seg && nw.length) nw[0] = { ...nw[0], seg:1 };
  const all = [...ws.slice(0, b.i0), ...nw, ...ws.slice(b.i1 + 1)];
  L.capt = { ...L.capt, words:all }; changed(); renderProps();
  if (nw.length && toks.length !== old.length) capRealign(L, all, b.i0, nw.length);
}
// .srt (para subir no Instagram/YouTube ou usar em outro editor)
function capSrt(L) {
  const off = capOff(L), tc = v => { v = Math.max(0, v); const ms = Math.round(v * 1000), hh = Math.floor(ms / 36e5), mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1e3) % 60; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  const txt = capBlocks(L).map((b, i) => `${i + 1}\n${tc(b.s + off)} --> ${tc(b.e + off)}\n${caseTxt(L, b.text)}\n`).join('\n');
  const a = h('a', { href:URL.createObjectURL(new Blob([txt], { type:'text/plain;charset=utf-8' })), download:`${(FILES.name || 'mola').replace(/[\\/:*?"<>|]+/g, '-')}-legenda.srt` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------ painel ------------ */
function capSecs(L) {
  const st = capStyle(L), bl = capBlocks(L), off = capOff(L), dub = L.capt.words.filter(w => w.c != null && w.c < CAP_DUB).length;
  const chips = h('div', { class:'chips leg-styles', role:'group', 'aria-label':'Estilo da legenda' }, Object.entries(CAP_STYLES).map(([id, s]) =>
    h('button', { type:'button', class:'chip', 'aria-pressed':String((L.capStyle || 'karaoke') === id), title:s.tip, text:s.name, onclick:() => { pushUndo(); for (const o of peersOf(L)) if (o.capt) capApplyStyle(o, id); changed({ props:true }); renderProps(); } })));
  const out = [h('h3', { text:'Legenda', 'data-sum':st.name }), field('Estilo', chips, null, true)];
  if (st.hl) out.push(colorF(L, 'capHl', st.mode === 'box' ? 'Cor da caixa' : 'Cor do destaque'));
  if (st.mode === 'box') { L.capInk ??= L.color; out.push(colorF(L, 'capInk', 'Cor da palavra na caixa')); }
  if (st.mode !== 'one') out.push(rangeF(L, 'capWords', 'Palavras por vez', 1, 12, 1, v => String(Math.round(v))),
    segF(L, 'capLines', 'Linhas', [[1, '1 linha'], [2, '2 linhas']]),
    rangeF(L, 'capCh', 'Letras por linha', 8, 40, 1, v => String(Math.round(v))));
  out.push(rangeF(L, 'wsp', 'Entre palavras', 0, 1, .01, v => (v || 0).toFixed(2) + 'em', { layout:true, get:() => L.wsp || 0 }), checkF(L, 'capPunct', 'Mostrar a pontuação'));
  // texto: um bloco por linha, com a hora; palavra duvidosa marcada. Clicar leva a agulha até ele, ▶ toca só ele
  const only = !!RT.capOnlyDub && dub > 0, list = h('div', { class:'leg-list', id:fid(L, 'caplist') });
  for (const b of bl) {
    const bad = b.ws.some(w => w.c != null && w.c < CAP_DUB); if (only && !bad) continue;
    const tx = h('div', { class:'leg-tx', contenteditable:'plaintext-only', spellcheck:'true', lang:'pt-BR', 'aria-label':'Texto do trecho', 'data-s':String(b.s) });
    b.ws.forEach((w, k) => { if (k) tx.append(' '); tx.append(w.c != null && w.c < CAP_DUB ? h('mark', { text:w.w, title:`Conferir: o som combina pouco com esta palavra (${Math.round(w.c * 100)}%)` }) : w.w); });
    const orig = tx.textContent;
    tx.addEventListener('focus', () => { pause(); T = clamp(b.s + off + .02, 0, S.duration); RT.userSeek = true; needs = true; });
    tx.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tx.blur(); } else if (e.key === 'Escape') { e.preventDefault(); tx.textContent = orig; tx.blur(); } e.stopPropagation(); });
    tx.addEventListener('blur', () => { const v = tx.textContent.replace(/\s+/g, ' ').trim(); if (v !== orig.replace(/\s+/g, ' ').trim()) capEdit(L, b, v); });
    list.append(h('div', { class:'leg-row' + (bad ? ' bad' : '') }, [
      h('button', { type:'button', class:'leg-t', text:fmtSec(b.s + off), title:'Levar a agulha até aqui', onclick:() => { pause(); T = clamp(b.s + off + .02, 0, S.duration); RT.userSeek = true; needs = true; } }),
      tx,
      h('button', { type:'button', class:'icon-btn', html:ICON_PLAY, title:'Ouvir este trecho', 'aria-label':'Ouvir este trecho', onclick:() => play(b.s + off, b.e + off) })]));
  }
  const s = dub > 1 ? 's' : '';
  out.push(h('h3', { text:'Texto da legenda', 'data-sum':dub ? `${dub} para conferir` : `${bl.length} trechos` }),
    h('p', { class:'hint', text:dub ? `${dub} palavra${s} marcada${s}: o som combina pouco com ela${s}. Ouça (▶) e corrija se precisar. Enter confirma; o tempo é acertado sozinho.` : 'Clique num trecho para corrigir. Enter confirma; o tempo de cada palavra é acertado sozinho.' }),
    dub ? (() => { const id = fid(L, 'caponly'), i = h('input', { type:'checkbox', id, checked:only }); i.addEventListener('change', () => { RT.capOnlyDub = i.checked; renderProps(); }); return h('label', { class:'check', for:id }, [i, 'Mostrar só os trechos para conferir']); })() : null,
    list,
    h('div', { class:'row' }, [h('button', { class:'btn small', text:'Baixar .srt', title:'Arquivo de legenda para Instagram, YouTube ou outro editor', onclick:() => capSrt(L) }),
      h('button', { class:'btn small ghost', text:'Gerar de novo', onclick:() => capGenerate(L) })]));
  return out.filter(Boolean);
}
// clique duplo no palco (ou Enter): vai para o trecho da agulha na lista
function capFocus(L) {
  paneShow('right');
  const list = document.getElementById(fid(L, 'caplist')); if (!list) return;
  const tl = T - capOff(L); let best = null;
  for (const el of list.querySelectorAll('.leg-tx')) if (+el.dataset.s <= tl + 1e-3) best = el;
  best = best || list.querySelector('.leg-tx'); if (!best) return;
  foldReveal(best); best.focus(); best.scrollIntoView({ block:'nearest' });
}
