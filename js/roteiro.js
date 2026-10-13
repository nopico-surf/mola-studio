/* ============================================================
   Roteiro de cortes (pedido do usuário: de um vídeo longo, o Mola propõe os cortes pelas palavras-chave e pelo tempo
   de cada corte; o usuário revisa e aí corta tudo). Seção "Roteiro" na janela Importar trecho (js/trecho.js).
   - Som: lido direto do arquivo (mp4Index → amostras AAC → AudioDecoder), misturado em mono e reamostrado para 16 kHz
     aos poucos. Nunca decodifica o vídeo inteiro de uma vez (1 h de som decodificado = ~1,4 GB).
   - Fala → palavras: o mesmo Whisper + alinhador da legenda (js/legenda.js), em pedaços de ~10 min cortados no silêncio,
     no mesmo worker. Cada pedaço pronto fica guardado no IndexedDB ('rot:' + nome + tamanho + data do arquivo): mudar
     as palavras ou os tempos não ouve de novo, e fechar no meio continua de onde parou.
   - Roteiro (rotPlan, função pura): frases → janelas que começam numa frase e crescem frase a frase até caber entre o
     mínimo e o máximo → nota (palavras-chave distintas, densidade, começo/fim limpos) → as N melhores sem sobreposição.
   Carregado antes do app.js: só declara (usa h, field, toast, DB, mp4Index, legStart etc. na hora da chamada).
   ============================================================ */
const ROT = { sr:16000, pre:.15, post:.25, gap:.6, piece:600, slack:60, minD:1, maxD:600, rate:.35 };

/* ------------ texto: sem acento, minúsculas; radical simples do português (venda/vendas/vender = "vend") ------------ */
const rotNorm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const ROT_SUF = ['amentos', 'imentos', 'amento', 'imento', 'mente', 'acoes', 'icoes', 'acao', 'icao', 'dores', 'doras', 'dora', 'dor', 'ando', 'endo', 'indo',
  'aram', 'eram', 'iram', 'avam', 'amos', 'emos', 'imos', 'asse', 'esse', 'isse', 'ados', 'idos', 'adas', 'idas', 'ado', 'ido', 'ada', 'ida', 'ava',
  'ar', 'er', 'ir', 'as', 'es', 'os', 'is', 'am', 'em', 'ou', 'eu', 'iu', 'ia', 'a', 'e', 'o', 's'].sort((p, q) => q.length - p.length);
function rotStem(w) { for (const s of ROT_SUF) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length); return w; }
const ROT_TAIL = new Set(['', 'a', 'e', 'i']); // o que pode sobrar depois do radical (vende-dor → "vende", vend-i)
// "venda, tráfego pago; cliente" → [{ label, toks:[{ n, st }] }] (frase de várias palavras = palavras seguidas)
function rotKeys(str) {
  const seen = new Set(), out = [];
  for (const raw of String(str || '').split(/[,;\n]+/)) {
    const label = raw.trim().replace(/\s+/g, ' '), toks = label.split(' ').map(rotNorm).filter(Boolean);
    const id = toks.join(' '); if (!toks.length || seen.has(id)) continue; seen.add(id);
    out.push({ label, toks:toks.map(n => ({ n, st:rotStem(n) })) });
  }
  return out;
}
// a palavra (normalizada; ws = radical dela) é a palavra-chave ou uma variação: o plural, ou o mesmo radical (4 letras ou mais)
function rotTok(k, w, ws = rotStem(w)) {
  if (!w) return false;
  if (w === k.n || w === k.n + 's' || w === k.n + 'es') return true;
  if (k.n.endsWith('ao') && (w === k.n.slice(0, -2) + 'oes' || w === k.n.slice(0, -2) + 'aes')) return true;
  return k.st.length >= 4 && ws.startsWith(k.st) && ROT_TAIL.has(ws.slice(k.st.length));
}
const ROT_END = /[.!?…]["”')]?$/;
const ROT_JOIN = new Set(['e', 'mas', 'entao', 'porque', 'pois', 'ai', 'que', 'isso', 'ou', 'tambem', 'ne', 'tipo', 'dai', 'senao', 'porem', 'so', 'nem', 'logo', 'enfim']);

/* ------------ frases: começa outra no começo de uma fala do Whisper (seg), depois de ponto ou de pausa > 0,6 s.
   Frase longa demais para caber num corte é dividida na melhor pausa/vírgula perto do meio (começo "macio") ------------ */
function rotSentences(ws, max) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const p = ws[i - 1], end = p && ROT_END.test(p.w), gap = p ? ws[i].s - p.e : Infinity;
    if (!out.length || ws[i].seg || end || gap > ROT.gap) out.push({ i0:i, i1:i, clean:!p || end || gap > ROT.gap });
    else out[out.length - 1].i1 = i;
  }
  const lim = Math.max(4, max * .6), res = [];
  const split = s => {
    if (ws[s.i1].e - ws[s.i0].s <= lim || s.i1 - s.i0 < 5) { res.push(s); return; }
    const mid = (ws[s.i0].s + ws[s.i1].e) / 2, half = (ws[s.i1].e - ws[s.i0].s) / 2;
    let best = -1, bv = -Infinity;
    for (let k = s.i0 + 2; k <= s.i1 - 2; k++) {
      const g = ws[k].s - ws[k - 1].e, c = /[,;:]$/.test(ws[k - 1].w) ? .35 : 0, d = Math.abs(ws[k].s - mid) / half;
      const v = Math.min(g, 1.5) + c - d * .5; if (v > bv) { bv = v; best = k; }
    }
    split({ i0:s.i0, i1:best - 1, clean:s.clean }); split({ i0:best, i1:s.i1, clean:false, soft:true });
  };
  out.forEach(split);
  return res;
}
// onde o corte começa/termina: um pouco antes da 1ª palavra e depois da última, nunca dentro da palavra vizinha
function rotCutA(ws, i) {
  const w = ws[i], p = ws[i - 1];
  if (!p) return Math.max(0, w.s - ROT.pre);
  return w.s - p.e >= ROT.pre ? w.s - ROT.pre : Math.max(0, Math.min(w.s, (p.e + w.s) / 2));
}
function rotCutB(ws, i, dur) {
  const w = ws[i], n = ws[i + 1], cap = dur || Infinity;
  if (!n) return Math.min(cap, w.e + ROT.post);
  return Math.min(cap, n.s - w.e >= ROT.post ? w.e + ROT.post : Math.max(w.e, (w.e + n.s) / 2));
}
// onde cada palavra-chave aparece: hit[i] = índice da palavra-chave que começa na palavra i (span = quantas palavras)
function rotHits(ws, keys) {
  const nw = ws.map(w => rotNorm(w.w)), sw = nw.map(rotStem), hit = new Int16Array(ws.length).fill(-1), span = new Uint8Array(ws.length);
  for (let i = 0; i < ws.length; i++) for (let k = 0; k < keys.length; k++) {
    const ts = keys[k].toks; if (i + ts.length > ws.length) continue;
    let ok = true; for (let j = 0; j < ts.length && ok; j++) ok = rotTok(ts[j], nw[i + j], sw[i + j]);
    if (ok) { hit[i] = k; span[i] = ts.length; break; }
  }
  return { hit, span };
}
/* o roteiro: words = [{ w, s, e, c?, seg? }] (segundos do vídeo), o = { keys (texto), min, max, n, dur }.
   Devolve [{ a, b, i0, i1, keys:[rótulos], hits:[índices de palavra], score }] em ordem de tempo */
function rotPlan(words, o) {
  const ws = words || [], keys = rotKeys(o.keys);
  const min = Math.max(1, +o.min || 20), max = Math.max(min + 1, +o.max || 45), N = Math.max(1, Math.round(+o.n || 5)), dur = o.dur || Infinity;
  if (!ws.length || !keys.length) return [];
  const S = rotSentences(ws, max), { hit, span } = rotHits(ws, keys), cand = [];
  for (let i = 0; i < S.length; i++) {
    const a = rotCutA(ws, S[i].i0), first = rotNorm(ws[S[i].i0].w);
    for (let j = i; j < S.length; j++) {
      const i1 = S[j].i1, b = rotCutB(ws, i1, dur), len = b - a;
      if (len > max) break;
      if (len < min) continue;
      const got = new Set(), at = []; let dead = 0, nh = 0;
      for (let k = S[i].i0; k <= i1; k++) {
        if (hit[k] >= 0) { got.add(hit[k]); nh++; for (let q = 0; q < span[k] && k + q <= i1; q++) at.push(k + q); }
        if (k > S[i].i0) dead += Math.max(0, ws[k].s - ws[k - 1].e - 2); // pausa entre frases (1 a 2 s) é fala normal
      }
      if (!got.size) continue;
      // palavras-chave distintas valem mais; depois quantas vezes aparecem (a ideia inteira, até 8) e a densidade (por 30 s)
      const dens = Math.min(3, nh / (len / 30));
      let sc = 10 * got.size + 2 * Math.min(nh, 8) + 2 * dens;
      sc += S[i].clean ? 3 : S[i].soft ? 0 : -1;                          // começa no começo de uma ideia
      if (ROT_JOIN.has(first)) sc -= 4;                                   // "e…", "mas…", "então…": começa no meio de uma ideia
      const nx = ws[i1 + 1];
      sc += ROT_END.test(ws[i1].w) ? 2 : !nx || nx.s - ws[i1].e > ROT.gap ? 1 : -1; // termina fechando a frase
      if ((ws[at[0]].s - a) / len <= .25) sc += 2;                         // a palavra-chave logo no começo prende quem assiste
      sc -= Math.min(6, dead * 1.5);                                      // silêncio comprido no meio
      cand.push({ a, b, i0:S[i].i0, i1, keys:[...got].map(k => keys[k].label), hits:at, score:+sc.toFixed(3) });
    }
  }
  cand.sort((p, q) => q.score - p.score || p.a - q.a);
  const pick = [];
  for (const c of cand) { if (pick.length >= N) break; if (!pick.some(p => c.a < p.b - 1e-6 && c.b > p.a + 1e-6)) pick.push(c); }
  return pick.sort((p, q) => p.a - q.a).map(c => ({ ...c, a:+c.a.toFixed(3), b:+c.b.toFixed(3) }));
}

/* ------------ som do arquivo: amostras AAC do índice → AudioDecoder → mono → 16 kHz, aos poucos.
   from = segundo do vídeo onde começa; read(n) devolve até n amostras de 16 kHz (menos = acabou) ------------ */
function rotAudioNo(ix) {
  const A = ix && ix.A;
  if (!A) return 'o vídeo não tem som';
  if (!A.mux || !A.desc) return `o som está em ${String(A.codec || '?').split('.')[0]}, que não sei ler aqui (só AAC)`;
  if (!window.AudioDecoder) return 'este navegador não decodifica som (use o Chrome ou o Edge)';
  return null;
}
async function rotAudio(file, ix, from = 0) {
  const A = ix.A, SR = ROT.sr, as = A.s, ap = j => as[j].c / A.sc - A.off;
  const cfg = { codec:A.codec, sampleRate:A.rate, numberOfChannels:A.ch, description:A.desc };
  if (!(await AudioDecoder.isConfigSupported(cfg)).supported) throw new Error('o Chrome não decodifica este som (' + A.codec + ')');
  // começa um quadro de AAC antes (o primeiro decodificado é só a sobreposição)
  let j = 0; for (let q = 0; q < as.length; q++) { if (ap(q) <= from - .05) j = q; else break; }
  const t0 = as.length ? ap(j) : 0;
  // reamostragem: sinc com janela de Blackman, tabela de 256 fases (cada fase soma 1)
  const R = A.rate / SR, fc = Math.min(1, 1 / R) * .92, W = Math.ceil(8 * Math.max(1, R)), P = 256, taps = 2 * W, tab = new Float32Array((P + 1) * taps);
  for (let ph = 0; ph <= P; ph++) {
    let s = 0;
    for (let q = 0; q < taps; q++) {
      const x = q - W + 1 - ph / P, sinc = x === 0 ? 1 : Math.sin(Math.PI * fc * x) / (Math.PI * fc * x), u = (x + W) / (2 * W);
      const win = u <= 0 || u >= 1 ? 0 : .42 - .5 * Math.cos(2 * Math.PI * u) + .08 * Math.cos(4 * Math.PI * u), v = sinc * win;
      tab[ph * taps + q] = v; s += v;
    }
    for (let q = 0; q < taps; q++) tab[ph * taps + q] /= s || 1;
  }
  let inp = new Float32Array(1 << 16), base = 0, len = 0, k = 0, err = null, ended = false, tmp = new Float32Array(4096), pend = [];
  const push = m => {
    if (len + m.length > inp.length) { const g = new Float32Array(Math.max(inp.length * 2, len + m.length)); g.set(inp.subarray(0, len)); inp = g; }
    inp.set(m, len); len += m.length;
  };
  const dec = new AudioDecoder({
    output:ad => {
      const n = ad.numberOfFrames, ch = ad.numberOfChannels, m = new Float32Array(n);
      if (tmp.length < n) tmp = new Float32Array(n);
      for (let c = 0; c < ch; c++) { ad.copyTo(tmp, { planeIndex:c, format:'f32-planar' }); for (let i = 0; i < n; i++) m[i] += tmp[i] / ch; }
      ad.close();
      // cada quadro vai para onde o índice do arquivo diz, com a duração que o índice dá (o resto é enchimento do codificador):
      // buraco no som vira silêncio, sobreposição perde o começo. Emendar um atrás do outro ia atrasando a fala; o carimbo do
      // AudioData não serve (o Chrome conta sozinho a partir do primeiro). Um quadro de AAC = um AudioData, na ordem
      const q = pend.shift(); if (!q) { push(m); return; }
      const at = Math.round((q.t - t0) * A.rate), end = base + len, mm = m.subarray(0, Math.min(n, Math.max(1, Math.round(q.du * A.rate))));
      if (at > end + 2) push(new Float32Array(Math.min(at - end, A.rate * 120)));
      if (at < end - 2) { if (end - at < mm.length) push(mm.subarray(end - at)); } else push(mm);
    },
    error:e => { err = e; },
  });
  dec.configure(cfg);
  // amostra de saída k = tempo from + k/SR = posição (from + k/SR − t0) × rate na entrada (antes do 1º som = silêncio)
  const emit = (out, o, lim) => {
    while (o < lim) {
      const x = (from + k / SR - t0) * A.rate; let b = Math.floor(x), ph = Math.round((x - b) * P);
      if (ph >= P) { b++; ph -= P; }
      if (ended ? b - W + 1 >= base + len : b + W >= base + len) break;
      let v = 0; const tb = ph * taps;
      for (let q = 0; q < taps; q++) { const i = b - W + 1 + q - base; if (i >= 0 && i < len) v += inp[i] * tab[tb + q]; }
      out[o++] = v; k++;
    }
    // solta o que já passou (fica W amostras antes da próxima)
    const keep = Math.floor((from + k / SR - t0) * A.rate) - W - 1 - base;
    if (keep > (1 << 18)) { inp.copyWithin(0, keep, len); len -= keep; base += keep; }
    return o;
  };
  let win = { s:-1, e:-1, b:null };
  const bytes = async x => {
    if (x.o < win.s || x.o + x.s > win.e) { win = { s:x.o, e:Math.min(file.size, x.o + Math.max(x.s, 1 << 20)), b:null }; win.b = await trRead(file, win.s, win.e - win.s); }
    return win.b.subarray(x.o - win.s, x.o - win.s + x.s);
  };
  // lê os bytes por grupos de amostras seguidas no arquivo (o som fica intercalado com a imagem: ler janelas grandes leria o vídeo todo)
  const feed = async () => {
    const j0 = j; let end = as[j].o + as[j].s;
    while (j + 1 - j0 < 512 && j + 1 < as.length && as[j + 1].o >= end && as[j + 1].o - end < 4096 && as[j + 1].o + as[j + 1].s - as[j0].o < (2 << 20)) { j++; end = as[j].o + as[j].s; }
    j++;
    win = { s:as[j0].o, e:end, b:await trRead(file, as[j0].o, end - as[j0].o) };
    for (let q = j0; q < j; q++) {
      const x = as[q], d = await bytes(x); pend.push({ t:ap(q), du:x.du / A.sc });
      dec.decode(new EncodedAudioChunk({ type:'key', timestamp:Math.round(ap(q) * 1e6), duration:Math.round(x.du / A.sc * 1e6), data:d }));
    }
  };
  return {
    async read(n) {
      const out = new Float32Array(n); let o = 0;
      while (o < n) {
        if (err) throw err;
        o = emit(out, o, n);
        if (o >= n || (ended && dec.decodeQueueSize === 0)) break;
        if (j < as.length) { await feed(); while (dec.decodeQueueSize > 64 && !err) await new Promise(r => { dec.addEventListener('dequeue', r, { once:true }); setTimeout(r, 50); }); }
        else if (!ended) { await dec.flush(); ended = true; }
        else break;
      }
      return o < n ? out.slice(0, o) : out;
    },
    close() { try { dec.close(); } catch (e) {} },
  };
}

/* ------------ fala do vídeo inteiro → palavras, em pedaços de ~10 min cortados no silêncio; cada pedaço fica guardado ------------ */
const rotKey = f => 'rot:' + [f.name || 'video', f.size, f.lastModified || 0].join('|');
async function rotCache(f) { try { const c = await DB.get(rotKey(f)); return c && c.v === 1 ? c : null; } catch (e) { return null; } }
// onde cortar o pedaço: o trecho mais quieto (janelas de 20 ms, média de ~0,2 s) entre lo e hi amostras
function rotQuiet(a, lo, hi) {
  const hop = 320, f0 = Math.floor(lo / hop), f1 = Math.min(Math.floor(a.length / hop), Math.floor(hi / hop)), e = [];
  for (let f = f0; f < f1; f++) { let s = 0; for (let i = f * hop, z = i + hop; i < z; i++) s += a[i] * a[i]; e.push(s); }
  let best = f0, bv = Infinity;
  for (let q = 5; q < e.length - 5; q++) { let s = 0; for (let r = q - 5; r <= q + 5; r++) s += e[r]; if (s < bv) { bv = s; best = f0 + q; } }
  return best * hop;
}
/* o = { onProg({ f, t, stage }), onPiece(words, upto), stop() → true = parar }. Devolve as palavras (inteiro ou até onde chegou) */
async function rotTranscribe(file, ix, D, o = {}) {
  const key = rotKey(file), c = (await rotCache(file)) || { v:1, name:file.name, dur:D, upto:0, words:[] };
  if (c.done) return c.words;
  const SR = ROT.sr, PIECE = ROT.piece * SR, SL = ROT.slack * SR, rd = await rotAudio(file, ix, c.upto);
  const dev = window.ROT_DEV; // testes: { run(audio, off) → palavras } no lugar da IA
  try {
    if (!dev) await legStart(m => { if (o.onProg) o.onProg(o.cur ? { ...o.cur(m), stage:m.stage, m } : { stage:m.stage, m }); }, ['asr', 'ali']);
    let left = new Float32Array(0), t = c.upto;
    for (;;) {
      if (o.stop && o.stop()) break;
      const more = await rd.read(Math.max(0, PIECE + SL - left.length)), buf = new Float32Array(left.length + more.length);
      buf.set(left); buf.set(more, left.length);
      const last = buf.length < PIECE + SL, cut = last ? buf.length : rotQuiet(buf, PIECE - SL, PIECE + SL);
      const piece = buf.slice(0, cut); left = buf.slice(cut);
      if (piece.length < SR * .5) {
        if (!last) continue;
        c.done = true; await DB.set(key, c); if (o.onPiece) o.onPiece(c.words, c.upto, true); break;
      }
      const len = piece.length / SR;
      o.cur = m => { const f = m.stage === 'asr' ? (m.f || 0) * .75 : m.stage === 'align' ? .75 + (m.f || 0) * .25 : 0; return { f:clamp((t + len * f) / D), t:t + len * f }; };
      if (o.onProg) o.onProg({ f:t / D, t, stage:'asr' });
      const r = dev ? { words:await dev.run(piece, t) } : await legAsk({ type:'run', audio:piece, opts:{} }, [piece.buffer]);
      const add = (r.words || []).map((w, i) => ({ w:w.w, s:+(w.s + t).toFixed(3), e:+(w.e + t).toFixed(3), c:w.c, ...(w.seg || i === 0 ? { seg:1 } : {}) }));
      c.words = c.words.concat(add); t += len; c.upto = +t.toFixed(3);
      if (last) c.done = true;
      await DB.set(key, c);
      if (o.onPiece) o.onPiece(c.words, c.upto, !!c.done);
      if (last) break;
    }
  } finally { rd.close(); if (!dev) legStop(); }
  return c.words;
}

/* ------------ seção "Roteiro" da janela Importar trecho. st = estado da janela; st.ui = { file, D, sync, seek, play } ------------ */
function rotSec(st) {
  const ui = st.ui, file = ui.file, D = ui.D, pf = (trPref().rot) || {};
  const R = st.rot = { keys:pf.keys || '', min:pf.min || 20, max:pf.max || 45, n:pf.n || 5, words:null, upto:0, done:false, plan:null, sel:new Set(), busy:false, off:false };
  const save = () => trPrefSet({ rot:{ keys:R.keys, min:R.min, max:R.max, n:R.n } });
  const sec = h('section', { class:'sec rot' });
  const sF = v => String(+(+v).toFixed(1)).replace('.', ',') + ' s';
  const numIn = (k, lab, fmt, lo, hi, tip) => {
    const i = h('input', { type:'text', class:'num rot-num', inputmode:'decimal', value:fmt(R[k]), 'aria-label':lab, title:tip || '' });
    i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (isFinite(v)) { R[k] = clamp(v, lo, hi); if (k === 'min' && R.max < R.min + 1) R.max = Math.min(ROT.maxD, R.min + 1); if (k === 'max' && R.min > R.max - 1) R.min = Math.max(ROT.minD, R.max - 1); save(); replan(); } draw(); });
    i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); if (e.key === 'Escape') { i.value = fmt(R[k]); i.blur(); } });
    return i;
  };
  const keyIn = h('input', { type:'text', class:'rot-keys', value:R.keys, placeholder:'venda, cliente, preço', 'aria-label':'Palavras-chave', title:'Separe por vírgula. Variações também contam (venda, vendas, vender)' });
  keyIn.addEventListener('input', () => { R.keys = keyIn.value; save(); });
  keyIn.addEventListener('change', () => { replan(); draw(); });
  keyIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { keyIn.blur(); build(); } if (e.key === 'Escape') keyIn.blur(); });
  const minIn = numIn('min', 'Duração mínima de cada corte', sF, ROT.minD, ROT.maxD - 1), maxIn = numIn('max', 'Duração máxima de cada corte', sF, ROT.minD + 1, ROT.maxD, 'Cada corte vai até 10 min');
  const nIn = numIn('n', 'Quantos cortes', v => String(Math.round(v)), 1, 30);
  const goB = h('button', { class:'btn small rot-go', onclick:() => build() }); // o botão principal da janela continua sendo o de importar
  const note = h('p', { class:'hint rot-note' }), barI = h('i'), bar = h('div', { class:'leg-bar' }, [barI]);
  const pMsg = h('p', { class:'hint rot-pmsg' }), stopB = h('button', { class:'btn small ghost', text:'Parar', title:'O que já foi ouvido fica guardado', onclick:() => stop() });
  const prog = h('div', { class:'rot-prog', hidden:true }, [pMsg, bar, h('div', { class:'row' }, [stopB])]);
  const list = h('div', { class:'rot-list' }), foot = h('div', { class:'rot-foot' });
  sec.append(h('h3', { text:'Roteiro' }),
    h('p', { class:'hint', text:'Diga o assunto. O Mola ouve a fala e propõe os cortes; você revisa antes de cortar.' }),
    field('Palavras-chave', keyIn, null, true), field('Mínimo', minIn), field('Máximo', maxIn), field('Cortes', nIn),
    h('div', { class:'row' }, [goB]), note, prog, list, foot);
  const mm = s => Math.max(1, Math.round(s / 60));
  function draw() {
    minIn.value = sF(R.min); maxIn.value = sF(R.max); nIn.value = String(Math.round(R.n));
    const no = st.ix ? rotAudioNo(st.ix) : null;
    goB.textContent = R.busy ? 'Ouvindo…' : R.plan ? 'Montar de novo' : 'Montar o roteiro';
    goB.disabled = R.busy || !!no || !!st.ixErr;
    // o que pesa (pedido do usuário: sempre avisar) e a alternativa leve
    note.textContent = no ? `Sem roteiro neste vídeo: ${no}. Marque os trechos à mão, abaixo.`
      : R.done ? 'A fala deste vídeo já foi ouvida. Mudar as palavras ou os tempos é na hora.'
      : R.upto > 0 ? `Já ouvi até ${tcF(R.upto, false)}. Continua de onde parou (falta ~${mm((D - R.upto) * ROT.rate)} min).`
      : `Na primeira vez a IA ouve o vídeo todo, no seu computador: ~${mm(D * ROT.rate)} min para este vídeo, com a placa de vídeo ocupada. Fica guardado. Sem esperar: marque os trechos à mão, abaixo.`;
    prog.hidden = !R.busy;
    drawList();
  }
  function replan() {
    if (!R.words) return;
    R.plan = rotPlan(R.words, { keys:R.keys, min:R.min, max:R.max, n:R.n, dur:D });
    R.sel = new Set(R.plan.map((_, i) => i));
  }
  // a frase do corte, com as palavras-chave marcadas; corte comprido mostra o começo e o que está em volta de cada palavra-chave
  function phrase(it) {
    const ws = R.words, hs = new Set(it.hits), n = it.i1 - it.i0 + 1, show = new Set();
    if (n <= 34) for (let k = it.i0; k <= it.i1; k++) show.add(k);
    else { for (let k = it.i0; k < it.i0 + 14; k++) show.add(k); for (const x of it.hits) for (let k = Math.max(it.i0, x - 4); k <= Math.min(it.i1, x + 4); k++) show.add(k); }
    const el = h('span', { class:'rot-tx' }); let prev = it.i0 - 1;
    for (let k = it.i0; k <= it.i1; k++) {
      if (!show.has(k)) continue;
      if (k > prev + 1) el.append(' … '); else if (k > it.i0) el.append(' ');
      el.append(hs.has(k) ? h('mark', { text:ws[k].w }) : ws[k].w); prev = k;
    }
    if (prev < it.i1) el.append(' …');
    return el;
  }
  function drawList() {
    list.innerHTML = ''; foot.innerHTML = '';
    if (!R.plan) return;
    const part = !R.done ? ` Parcial: ouvi até ${tcF(R.upto, false)} de ${tcF(D, false)}.` : '';
    if (!R.plan.length) {
      list.append(h('p', { class:'hint', text:(rotKeys(R.keys).length ? 'Não achei essas palavras na fala, com esse tempo de corte. Tente outras palavras ou um máximo maior.' : 'Escreva pelo menos uma palavra-chave.') + part }));
      return;
    }
    R.plan.forEach((it, i) => {
      const id = 'rot-c' + i, cb = h('input', { type:'checkbox', id, checked:R.sel.has(i), 'aria-label':`Usar o corte ${i + 1}` });
      cb.addEventListener('change', () => { cb.checked ? R.sel.add(i) : R.sel.delete(i); drawFoot(); });
      const tf = k => {
        const inp = h('input', { type:'text', class:'num tr-t', value:tcF(it[k]), 'aria-label':`${k === 'a' ? 'Começo' : 'Fim'} do corte ${i + 1}` });
        inp.addEventListener('change', () => {
          const v = tcParse(inp.value);
          if (v != null) { if (k === 'a') it.a = clamp(v, 0, Math.max(0, it.b - .5)); else it.b = clamp(v, it.a + .5, Math.min(D, it.a + ROT.maxD)); }
          drawList();
        });
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = tcF(it[k]); inp.blur(); } });
        return inp;
      };
      const tx = phrase(it); tx.title = 'Tocar este corte';
      list.append(h('div', { class:'rot-item' + (R.sel.has(i) ? '' : ' off') }, [
        h('div', { class:'rot-top' }, [cb, h('label', { class:'tr-n', for:id, text:String(i + 1) }), tf('a'), h('span', { class:'tr-ar', text:'→' }), tf('b'), h('span', { class:'tr-len', text:tcF(it.b - it.a) })]),
        h('button', { type:'button', class:'rot-play', title:'Tocar este corte', 'aria-label':`Tocar o corte ${i + 1}`, onclick:() => ui.play(it.a, it.b) }, [tx]),
        h('p', { class:'hint rot-k', text:it.keys.join(' · ') })]));
    });
    drawFoot();
    const few = R.plan.length < Math.round(R.n) ? `Só achei ${R.plan.length} corte${R.plan.length > 1 ? 's' : ''} com essas palavras, sem repetir trecho.` : '';
    if (few || part) foot.append(h('p', { class:'hint', text:(few + part).trim() }));
  }
  function drawFoot() {
    [...foot.querySelectorAll('.rot-use')].forEach(x => x.remove());
    list.querySelectorAll('.rot-item').forEach((el, i) => el.classList.toggle('off', !R.sel.has(i)));
    const n = R.sel.size;
    foot.prepend(h('div', { class:'row rot-use' }, [h('button', { class:'btn small', disabled:!n || null, text:n === 1 ? 'Usar o corte marcado' : `Usar os ${n} marcados`, title:'Viram os trechos abaixo (a gordura e "Como entram" valem para eles)', onclick:() => apply() })]));
  }
  function apply() {
    const segs = R.plan.filter((_, i) => R.sel.has(i)).map(it => ({ a:it.a, b:Math.min(it.b, it.a + ROT.maxD) }));
    if (!segs.length) return;
    st.segs = segs; st.cur = 0; ui.sync(); ui.seek(segs[0].a);
    toast(`${segs.length} trecho${segs.length > 1 ? 's' : ''} no corte. Confira na barra e ${st.own ? 'crie os arquivos' : 'importe'}.`, 4000);
  }
  function stop() { R.off = true; legStop(); stopB.disabled = true; pMsg.textContent = 'Parando…'; }
  async function build() {
    if (R.busy) return;
    if (!rotKeys(R.keys).length) { toast('Escreva pelo menos uma palavra-chave', 3000); keyIn.focus(); return; }
    await st.ixP; const no = st.ixErr || rotAudioNo(st.ix);
    if (no) { toast('Sem roteiro neste vídeo: ' + no, 5000); draw(); return; }
    if (!R.done && !window.ROT_DEV) {
      if (!navigator.gpu) { toast(capErr(new Error('NO_WEBGPU')), 5000); return; }
      if (location.protocol === 'file:') { await askConfirm('Abra o Mola pelo servidor', 'O roteiro usa as IAs da legenda, guardadas no navegador, e o Chrome não deixa isso com o arquivo aberto direto do disco. Rode "npx serve ." na pasta do Mola e abra http://localhost:3000.', 'Entendi'); return; }
      const have = await legHave(), left = mm((D - R.upto) * ROT.rate);
      if (!(await askConfirm(have ? 'Ouvir a fala do vídeo?' : 'Baixar as IAs e ouvir a fala?',
        (have ? '' : `Na primeira vez o Mola baixa as IAs da legenda (${(LEG_BYTES / 1e9).toFixed(1).replace('.', ',')} GB, uma vez só). `)
        + `A IA ouve o vídeo no seu computador (sem custo, o som não sai daqui): ~${left} min, com a placa de vídeo ocupada (~3 GB da memória dela) e o editor mais lento enquanto isso. O que já foi ouvido fica guardado, e dá para parar a qualquer momento. Sem esperar: marque os trechos à mão.`,
        have ? 'Ouvir' : 'Baixar e ouvir'))) return;
    }
    if (st.closed) return;
    if (R.done) { replan(); draw(); return; }
    R.busy = true; R.off = false; stopB.disabled = false; draw();
    const gb = v => (v / 1e9).toFixed(2).replace('.', ',');
    const show = p => {
      if (st.closed) return;
      const m = p.m || {}, f = p.f;
      if (p.stage === 'download') { pMsg.textContent = `Baixando as IAs (só na primeira vez): ${gb(m.got || 0)} de ${gb(m.total || 1)} GB`; barI.style.width = (m.total > 1 ? m.got / m.total * 100 : 0) + '%'; bar.classList.remove('busy'); return; }
      if (p.stage === 'verify') { pMsg.textContent = 'Conferindo o arquivo baixado'; barI.style.width = (m.got / m.total * 100) + '%'; return; }
      if (p.stage === 'load' || p.stage === 'prepare') { pMsg.textContent = 'Preparando as IAs na placa de vídeo'; bar.classList.add('busy'); barI.style.width = ''; return; }
      bar.classList.remove('busy'); barI.style.width = (clamp(f) * 100).toFixed(1) + '%';
      pMsg.textContent = `Ouvindo a fala: ${tcF(p.t || 0, false)} de ${tcF(D, false)} (falta ~${mm((D - (p.t || 0)) * ROT.rate)} min)`;
    };
    pMsg.textContent = 'Lendo o som do vídeo'; bar.classList.add('busy'); barI.style.width = '';
    try {
      const words = await rotTranscribe(file, st.ix, D, {
        onProg:show, stop:() => R.off || st.closed,
        // cada pedaço pronto já atualiza o roteiro (num vídeo de 1 h os primeiros cortes aparecem em minutos)
        onPiece:(ws, upto, done) => { if (st.closed) return; R.words = ws; R.upto = upto; R.done = done; replan(); drawList(); },
      });
      R.words = words;
    } catch (e) {
      console.warn('roteiro', e);
      if (!R.off && !st.closed) toast(capErr(e).replace('A legenda falhou', 'O roteiro falhou'), 7000);
    }
    // parou ou falhou no meio: o que já foi ouvido está guardado e vale para o roteiro parcial
    const c = await rotCache(file); if (c) { R.words = c.words; R.upto = c.upto; R.done = !!c.done; }
    R.busy = false; if (st.closed) return;
    replan(); draw();
  }
  st.onClose = () => { if (R.busy) { R.off = true; legStop(); } };
  // o que já foi ouvido deste arquivo (guardado) aparece logo: com a fala inteira, o roteiro sai sem esperar
  rotCache(file).then(c => { if (!c || st.closed) return; R.words = c.words; R.upto = c.upto; R.done = !!c.done; if (rotKeys(R.keys).length && c.words.length) replan(); draw(); });
  setTimeout(() => st.ixP && st.ixP.then(() => { if (!st.closed) draw(); })); // o índice começa a ser lido depois que a janela monta
  draw();
  return sec;
}
