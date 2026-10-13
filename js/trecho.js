/* ============================================================
   Importar trecho (pedido do usuário: editar vídeos longos, de até 1 h ou mais; o arquivo do Mola vai até 10 min).
   Vídeo longo não entra inteiro: copiar 1 h para o navegador, ler o arquivo todo para a memória e decodificar o som inteiro
   (~23 MB por minuto) travava o editor. A janela toca o arquivo direto do disco (<video> com o File, nada é copiado),
   o usuário marca um ou mais trechos e só eles viram MP4s pequenos, copiados sem recomprimir (mesma qualidade, segundos).
   Cada trecho entra como um vídeo normal; a cópia começa no quadro-chave anterior e vIn/vOut acertam o começo exato.
   Carregado antes do app.js: só declara (usa h, toast, field, needMp4box etc. na hora da chamada).
   ============================================================ */
const TRECHO = { minDur:180, minSize:1.5e9, maxDur:600, win:16 << 20, fatMax:10 };
let TRECHOWIN = null;
/* escolhas da janela que valem para a próxima vez (localStorage 'mola-trecho'): own = um arquivo por trecho (pedido do usuário:
   cortes de um vídeo longo, cada um no seu arquivo), fat = gordura em segundos, copiada antes e depois de cada trecho para dar
   espaço a uma transição (o vídeo entra cortado no ponto marcado; puxar a borda da barra na timeline usa a gordura) */
const trPref = () => { try { return JSON.parse(localStorage.getItem('mola-trecho')) || {}; } catch (e) { return {}; } };
const trPrefSet = o => { try { localStorage.setItem('mola-trecho', JSON.stringify({ ...trPref(), ...o })); } catch (e) {} };

/* ------------ MP4 em pedaços: alvo do mp4-muxer que vai virando Blob (o Chrome guarda Blob grande em disco), então um vídeo
   de 10 min não fica inteiro na memória. Escrita de volta (cabeçalho no fim) remenda o pedaço certo do Blob ------------ */
function blobSink() {
  let blob = new Blob([]), pend = [], pendLen = 0;
  const flush = () => { if (pend.length) { blob = new Blob([blob, ...pend]); pend = []; pendLen = 0; } };
  const target = new Mp4Muxer.StreamTarget({ chunked:true, chunkSize:8 << 20, onData:(data, pos) => {
    const d = data.slice(), end = blob.size + pendLen;
    if (pos === end) { pend.push(d); pendLen += d.length; if (pendLen > (48 << 20)) flush(); return; }
    flush();
    if (pos > end) blob = new Blob([blob, new Uint8Array(pos - end), d]);
    else blob = new Blob([blob.slice(0, pos), d, blob.slice(Math.min(blob.size, pos + d.length))]);
  } });
  return { target, blob:type => { flush(); return new Blob([blob], { type }); } };
}

/* ------------ índice do MP4/MOV sem ler o arquivo inteiro: as caixas de cima (mdat é pulado), o moov pelo mp4box
   (stco já tem a posição de cada amostra no arquivo) e, em MP4 fragmentado (OBS, gravação do navegador), cada moof ------------ */
const trU32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const trS32 = (b, i) => (b[i] << 24) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const trU64 = (b, i) => trU32(b, i) * 4294967296 + trU32(b, i + 4);
const trB4 = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const trRead = async (file, p, n) => new Uint8Array(await file.slice(p, p + n).arrayBuffer());
async function mp4Boxes(file, want) {
  const out = []; let p = 0, n = 0;
  while (p + 8 <= file.size) {
    const b = await trRead(file, p, 16); let sz = trU32(b, 0), hd = 8; const ty = trB4(b, 4);
    if (sz === 1) { sz = trU64(b, 8); hd = 16; } else if (sz === 0) sz = file.size - p;
    if (sz < hd || !/^[\x20-\x7e]{4}$/.test(ty)) break; // lixo no fim do arquivo
    if (want.includes(ty)) out.push({ ty, p, sz, hd });
    p += sz; if (++n > 400000) break;
  }
  return out;
}
const trDsi = d => { if (!d) return null; if (d.tag === 5 && d.data) return d.data; for (const c of d.descs || []) { const r = trDsi(c); if (r) return r; } return null; };
// trak do mp4box → faixa: timescale, deslocamento da edit list (como o demuxMp4 do app), configuração do decodificador
function mp4Track(f, info, tr) {
  const trak = f.getTrackById(tr.id), e = trak.mdia.minf.stbl.stsd.entries[0], sc = tr.timescale;
  const ed = trak.edts && trak.edts.elst && trak.edts.elst.entries; let off = 0;
  if (ed && ed.length) { let i = 0, empty = 0; while (i < ed.length && ed[i].media_time === -1) { empty += ed[i].segment_duration / (info.timescale || sc); i++; } if (i < ed.length) off = ed[i].media_time / sc - empty; }
  const t = { id:tr.id, sc, off, codec:tr.codec, type:e.type, trak, s:null };
  if (tr.video) {
    const b = e.avcC || e.hvcC; let desc = null;
    if (b) { const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); b.write(ds); desc = new Uint8Array(ds.buffer, 8); }
    const m = tr.matrix || [], deg = m.length ? Math.atan2(m[1], m[0]) * 180 / Math.PI : 0;
    Object.assign(t, { mux:e.avcC ? 'avc' : e.hvcC ? 'hevc' : null, desc, w:e.width || tr.video.width, h:e.height || tr.video.height, rot:((Math.round(deg / 90) * 90) % 360 + 360) % 360 });
  } else {
    const asc = e.esds && e.esds.esd ? trDsi(e.esds.esd) : null;
    Object.assign(t, { mux:e.type === 'mp4a' && asc ? 'aac' : null, desc:asc ? new Uint8Array(asc) : null, ch:e.channel_count || (tr.audio && tr.audio.channel_count) || 2,
      rate:(tr.audio && tr.audio.sample_rate) || e.samplerate || sc });
  }
  return t;
}
// amostras de um moof (MP4 fragmentado): tfhd/tfdt/trun, com os padrões do trex
function mp4Moof(b, base, tracks, trex) {
  let prevEnd = base;
  const kids = (s, e, fn) => { for (let p = s; p + 8 <= e;) { const sz = trU32(b, p) || e - p, ty = trB4(b, p + 4); fn(ty, p + 8, p + sz); p += sz; } };
  kids(8, b.length, (ty, s, e) => {
    if (ty !== 'traf') return;
    let T = null, df = {}, bdo = null, dbm = false, tdt = null;
    kids(s, e, (k, a) => {
      if (k === 'tfhd') {
        const fl = trU32(b, a) & 0xffffff; let q = a + 8; const id = trU32(b, a + 4); T = tracks.find(t => t.id === id); const tx = trex[id] || {};
        df = { dur:tx.dur, size:tx.size, flags:tx.flags };
        if (fl & 1) { bdo = trU64(b, q); q += 8; } if (fl & 2) q += 4;
        if (fl & 8) { df.dur = trU32(b, q); q += 4; } if (fl & 0x10) { df.size = trU32(b, q); q += 4; } if (fl & 0x20) { df.flags = trU32(b, q); q += 4; }
        dbm = !!(fl & 0x20000);
      }
      else if (k === 'tfdt') tdt = b[a] === 1 ? trU64(b, a + 4) : trU32(b, a + 4);
    });
    if (!T) return;
    let off = bdo != null ? bdo : dbm ? base : prevEnd, pos = off, t = tdt != null ? tdt : T.next || 0;
    kids(s, e, (k, a) => {
      if (k !== 'trun') return;
      const v = b[a], fl = trU32(b, a) & 0xffffff, n = trU32(b, a + 4); let q = a + 8;
      if (fl & 1) { pos = off + trS32(b, q); q += 4; }
      let ff = null; if (fl & 4) { ff = trU32(b, q); q += 4; }
      for (let i = 0; i < n; i++) {
        let du = df.dur || 0, sz = df.size || 0, f = i === 0 && ff != null ? ff : df.flags || 0, ct = 0;
        if (fl & 0x100) { du = trU32(b, q); q += 4; } if (fl & 0x200) { sz = trU32(b, q); q += 4; } if (fl & 0x400) { f = trU32(b, q); q += 4; }
        if (fl & 0x800) { ct = v ? trS32(b, q) : trU32(b, q); q += 4; }
        T.s.push({ o:pos, s:sz, d:t, c:t + ct, du, k:!(f & 0x10000) });
        pos += sz; t += du;
      }
    });
    T.next = t; prevEnd = pos;
  });
}
async function mp4Index(file, prog) {
  const top = await mp4Boxes(file, ['ftyp', 'moov', 'moof']), mv = top.find(x => x.ty === 'moov'), ft = top.find(x => x.ty === 'ftyp');
  if (!mv) throw new Error('não achei o índice do vídeo (moov)');
  await needMp4box();
  const f = MP4Box.createFile(); let info = null;
  f.onReady = i => { info = i; }; f.onError = () => {};
  // o mp4box só lê ftyp + moov (as posições das amostras no stco são do arquivo inteiro, não deste pedaço)
  const parts = [ft && ft.sz < 65536 ? await trRead(file, ft.p, ft.sz) : null, await trRead(file, mv.p, mv.sz)].filter(Boolean), buf = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  parts.reduce((o, x) => (buf.set(x, o), o + x.length), 0); buf.buffer.fileStart = 0; f.appendBuffer(buf.buffer); f.flush();
  if (!info) throw new Error('não consegui ler o índice do vídeo');
  const vt = info.videoTracks[0], at = info.audioTracks[0]; if (!vt) throw new Error('o arquivo não tem imagem');
  const V = mp4Track(f, info, vt), A = at ? mp4Track(f, info, at) : null, tracks = [V, A].filter(Boolean);
  const moofs = top.filter(x => x.ty === 'moof');
  if (!moofs.length) for (const t of tracks) t.s = (t.trak.samples || []).map(x => ({ o:x.offset, s:x.size, d:x.dts, c:x.cts, du:x.duration, k:!!x.is_sync }));
  else {
    const trex = {}; for (const x of (f.moov.mvex && f.moov.mvex.trexs) || []) trex[x.track_id] = { dur:x.default_sample_duration, size:x.default_sample_size, flags:x.default_sample_flags };
    for (const t of tracks) { t.s = (t.trak.samples || []).map(x => ({ o:x.offset, s:x.size, d:x.dts, c:x.cts, du:x.duration, k:!!x.is_sync })); t.next = t.s.length ? t.s[t.s.length - 1].d + t.s[t.s.length - 1].du : 0; }
    for (let i = 0; i < moofs.length; i++) { const m = moofs[i]; mp4Moof(await trRead(file, m.p, m.sz), m.p, tracks, trex); if (prog && i % 50 === 0) prog(i / moofs.length); }
  }
  for (const t of tracks) delete t.trak;
  if (!V.s.length) throw new Error('não achei os quadros do vídeo');
  return { V, A:A && A.s.length ? A : null };
}
// motivo para não cortar este arquivo aqui (null = dá)
function trechoNo(ix) {
  if (!ix.V.mux) return `a imagem está em ${ix.V.codec.split('.')[0]}, que não sei copiar (só H.264 e H.265)`;
  if (!ix.V.desc) return 'o vídeo não traz a configuração do codec no índice';
  return null;
}

/* ------------ corte: as amostras do trecho (do quadro-chave antes de a até o quadro que cobre b) num MP4 novo, sem recomprimir.
   Tempos de apresentação = os do <video> no original (cts/sc − edit list); a cópia começa no quadro-chave (T0) e a edit list
   nova põe o tempo 0 nele (com quadros B o primeiro quadro decodificado não é o tempo 0 da mídia) ------------ */
async function trechoCut(file, ix, a, b, prog) {
  const { V, A } = ix, vs = V.s, pts = i => vs[i].c / V.sc - V.off, fd = (vs[0].du || V.sc / 30) / V.sc;
  let k = -1; for (let i = 0; i < vs.length; i++) if (vs[i].k && pts(i) <= a + 1e-4) k = i; else if (pts(i) > a + 1e-4 && vs[i].k && k >= 0) break;
  if (k < 0) k = vs.findIndex(x => x.k); if (k < 0) k = 0;
  const T0 = pts(k);
  let m = k; for (let i = k; i < vs.length; i++) if (pts(i) < b + fd * .5) m = i; else if (vs[i].k) break; // ordem de decodificação: até o último quadro que aparece antes de b
  const vid = []; for (let i = k; i <= m; i++) if (pts(i) >= T0 - 1e-4) vid.push(vs[i]); // quadros de antes do quadro-chave (GOP aberto) não decodificam
  const neg = Math.max(0, ...vid.map(x => x.d - x.c)), D0 = vs[k].d, vLead = (vs[k].c - D0 + neg) / V.sc; // vLead = tempo de mídia do 1º quadro
  const vEnd = Math.max(...vid.map(x => x.c + x.du)) / V.sc - V.off; // fim do último quadro (tempo do original)
  let aud = [], aLead = 0;
  if (A && A.mux) {
    const as = A.s, ap = j => as[j].c / A.sc - A.off; let j0 = 0;
    for (let j = 0; j < as.length; j++) { if (ap(j) <= T0 + 1e-6) j0 = j; else break; }
    j0 = Math.max(0, j0 - 1); // um quadro de AAC a mais antes: o primeiro decodificado é só a sobreposição
    for (let j = j0; j < as.length && ap(j) < vEnd; j++) aud.push(as[j]);
    if (aud.length) aLead = Math.max(0, T0 - ap(j0));
  }
  const sink = blobSink();
  const opt = { target:sink.target, video:{ codec:V.mux, width:V.w, height:V.h, rotation:V.rot }, fastStart:false, firstTimestampBehavior:'strict' };
  if (aud.length) opt.audio = { codec:'aac', numberOfChannels:A.ch, sampleRate:A.rate };
  const mux = new Mp4Muxer.Muxer(opt);
  // ordem de gravação: por tempo de decodificação, as duas faixas intercaladas; os bytes vêm em janelas de 16 MB
  const q = [...vid.map(x => ({ x, v:1, t:(x.d - D0) / V.sc })), ...aud.map(x => ({ x, v:0, t:(x.d - aud[0].d) / A.sc }))].sort((p, r) => p.t - r.t || r.v - p.v);
  // uma janela por faixa: há arquivos com o som longe da imagem (cada troca relia 16 MB)
  const wins = [{ s:-1, e:-1, b:null }, { s:-1, e:-1, b:null }]; let firstV = true, firstA = true;
  for (let i = 0; i < q.length; i++) {
    const { x, v } = q[i];
    const w = wins[v]; if (x.o < w.s || x.o + x.s > w.e) { w.s = x.o; w.e = Math.min(file.size, x.o + Math.max(x.s, TRECHO.win)); w.b = await trRead(file, w.s, w.e - w.s); }
    const data = w.b.subarray(x.o - w.s, x.o - w.s + x.s);
    if (data.length < x.s) throw new Error('o arquivo terminou antes do que o índice diz');
    if (v) {
      const meta = firstV ? { decoderConfig:{ codec:V.codec, codedWidth:V.w, codedHeight:V.h, description:V.desc } } : undefined; firstV = false;
      mux.addVideoChunkRaw(data, x.k ? 'key' : 'delta', (x.c - D0 + neg) / V.sc * 1e6, x.du / V.sc * 1e6, meta, (x.c - x.d + neg) / V.sc * 1e6);
    } else {
      const meta = firstA ? { decoderConfig:{ codec:A.codec, numberOfChannels:A.ch, sampleRate:A.rate, description:A.desc } } : undefined; firstA = false;
      mux.addAudioChunkRaw(data, 'key', (x.d - aud[0].d) / A.sc * 1e6, x.du / A.sc * 1e6, meta);
    }
    if (prog && i % 200 === 0) { prog(i / q.length); await new Promise(r => setTimeout(r)); }
  }
  mux.finalize();
  const len = vEnd - T0, blob = await mp4Edts(sink.blob('video/mp4'), { vide:vLead, soun:aLead }, len);
  return { blob, lead:Math.max(0, a - T0), len, sound:!!aud.length };
}
// edit list depois de gravar (o mp4-muxer não escreve): o moov fica no fim (fastStart:false), então só mudam os tamanhos dele
// e do trak. edits = { vide|soun: segundos de mídia que ficam antes do tempo 0 }
async function mp4Edts(blob, edits, len) {
  const top = await mp4Boxes(blob, ['moov']), mv = top[top.length - 1];
  if (!mv || mv.p + mv.sz !== blob.size || mv.hd !== 8) return blob;
  const b = await trRead(blob, mv.p, mv.sz), parts = []; let mvts = 1000;
  const kids = (s, e) => { const r = []; for (let q = s; q + 8 <= e;) { const sz = trU32(b, q); r.push({ ty:trB4(b, q + 4), p:q, sz }); q += sz || e - q; } return r; };
  const top2 = kids(8, b.length);
  const mvhd = top2.find(x => x.ty === 'mvhd'); if (mvhd) mvts = b[mvhd.p + 8] === 1 ? trU32(b, mvhd.p + 28) : trU32(b, mvhd.p + 20);
  for (const x of top2) {
    if (x.ty !== 'trak') continue;
    const tk = kids(x.p + 8, x.p + x.sz), md = tk.find(y => y.ty === 'mdia'), tkhd = tk.find(y => y.ty === 'tkhd');
    const mk = md ? kids(md.p + 8, md.p + md.sz) : [], mdhd = mk.find(y => y.ty === 'mdhd'), hdlr = mk.find(y => y.ty === 'hdlr');
    const kind = hdlr ? trB4(b, hdlr.p + 16) : '', lead = edits[kind];
    if (!tkhd || !mdhd || !lead || tk.some(y => y.ty === 'edts')) continue;
    const ts = b[mdhd.p + 8] === 1 ? trU32(b, mdhd.p + 28) : trU32(b, mdhd.p + 20);
    const e = new Uint8Array(36), dv = new DataView(e.buffer);
    dv.setUint32(0, 36); e.set([101, 100, 116, 115], 4); dv.setUint32(8, 28); e.set([101, 108, 115, 116], 12); dv.setUint32(16, 0); dv.setUint32(20, 1);
    dv.setUint32(24, Math.round(len * mvts)); dv.setInt32(28, Math.round(lead * ts)); dv.setInt16(32, 1); dv.setInt16(34, 0);
    parts.push({ at:tkhd.p + tkhd.sz, add:e, trak:x.p });
  }
  if (!parts.length) return blob;
  const out = new Uint8Array(b.length + parts.length * 36), od = new DataView(out.buffer); let w = 0, r = 0;
  for (const pt of parts) { out.set(b.subarray(r, pt.at), w); w += pt.at - r; r = pt.at; out.set(pt.add, w); w += 36; }
  out.set(b.subarray(r), w);
  od.setUint32(0, trU32(b, 0) + parts.length * 36);
  // tamanho de cada trak (a posição dele no novo moov anda 36 por edts gravado antes)
  parts.forEach((pt, i) => od.setUint32(pt.trak + i * 36, trU32(b, pt.trak) + 36));
  return new Blob([blob.slice(0, mv.p), out], { type:'video/mp4' });
}

/* ------------ entrada de vídeo: curto entra como sempre; longo (ou enorme) passa pela janela de trechos.
   Devolve [{ file, cut:{ vIn, vOut } | null }] (null = cancelou). o.one = só um trecho (Trocar vídeo, preenchimento) ------------ */
async function videoGate(f, o = {}) {
  // nunca fica mudo: a leitura tem prazo, qualquer erro vira aviso e a janela não pode travar a entrada do vídeo
  toast('Lendo o vídeo…');
  const big = f.size > TRECHO.minSize;
  let meta = null;
  try { meta = await vidMeta(f); } catch (e) { console.warn('trecho: metadados', e); }
  if (!meta) { // o Chrome não leu o vídeo (codec que ele não toca, como H.265 sem placa que decodifique, ou arquivo lento)
    if (big) { toast('O Chrome não consegue abrir este vídeo (' + Math.round(f.size / 1e6) + ' MB). Converta para MP4 (H.264) ou corte antes em outro programa.', 8000); return null; }
    return [{ file:f, cut:null }];
  }
  if (!(meta.dur > TRECHO.minDur || big)) return [{ file:f, cut:null }];
  try { return await openTrecho(f, meta, o); }
  catch (e) {
    console.warn('trecho: janela', e); TRECHOWIN = null; document.querySelectorAll('.tr-win').forEach(x => x.remove());
    if (big) { toast('Não consegui abrir a janela de trechos: ' + (e.message || e), 8000); return null; }
    return [{ file:f, cut:null }];
  }
}
// duração e tamanho do vídeo sem carregá-lo; 10 s de prazo. Duração desconhecida (WebM gravado pelo navegador): pula para o fim para o Chrome descobrir
function vidMeta(f) {
  return new Promise((res, rej) => {
    const el = document.createElement('video'), u = URL.createObjectURL(f); el.preload = 'metadata'; el.muted = true;
    let to = 0;
    const end = v => { clearTimeout(to); URL.revokeObjectURL(u); el.onloadedmetadata = el.onerror = el.ondurationchange = null; el.removeAttribute('src'); el.load(); v instanceof Error ? rej(v) : res(v); };
    const info = () => ({ dur:el.duration, w:el.videoWidth, h:el.videoHeight });
    el.onloadedmetadata = () => {
      if (isFinite(el.duration)) return end(info());
      el.ondurationchange = () => { if (isFinite(el.duration)) end(info()); };
      el.currentTime = 1e9;
    };
    el.onerror = () => end(new Error('não abriu'));
    to = setTimeout(() => end(new Error('demorou')), 10000);
    el.src = u;
  });
}
const tcF = (s, frac = true) => {
  s = Math.max(0, s); const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  const sec = frac ? ss.toFixed(1).padStart(4, '0').replace('.', ',') : String(Math.floor(ss)).padStart(2, '0');
  return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm)) + ':' + sec;
};
const tcParse = s => {
  const p = String(s).trim().replace(',', '.').split(':').map(Number); if (!p.length || p.some(x => !isFinite(x))) return null;
  return p.reduce((acc, x) => acc * 60 + x, 0);
};

/* ------------ janela: o vídeo, a barra do vídeo inteiro (com zoom) e a lista de trechos ------------ */
function openTrecho(file, meta, o = {}) {
  if (TRECHOWIN) return Promise.resolve(null);
  return new Promise(resolve => {
    const pf = trPref(), D = meta.dur, url = URL.createObjectURL(file),
      st = { segs:[], cur:0, v0:0, v1:D, busy:false, closed:false, ix:null, ixErr:null, own:!o.one && !!pf.own, fat:clamp(+(pf.fat ?? 1) || 0, 0, TRECHO.fatMax) };
    TRECHOWIN = st;
    // para a seção Roteiro (js/roteiro.js): chamadas só depois que a janela está montada
    st.ui = { file, D, sync:() => sync(), seek:t => seek(t), play:(a, b) => { vid.currentTime = a; segEnd = b; vid.play(); } };
    const fps = 30, MIN = .5;
    // começa com um trecho de 1 min no começo (ou o vídeo todo, se couber)
    st.segs.push({ a:0, b:Math.min(D, 60) });
    const vid = h('video', { class:'tr-vid', src:url, preload:'auto', playsinline:'' });
    const tcEl = h('span', { class:'tr-tc' });
    const playB = h('button', { class:'tr-play', title:'Tocar (espaço)', 'aria-label':'Tocar', html:ICON_PLAY, onclick:() => vid.paused ? vid.play() : vid.pause() });
    const inB = h('button', { class:'btn small', text:'Começa aqui', title:'Marca o começo do trecho na agulha (I)', onclick:() => mark('a') });
    const outB = h('button', { class:'btn small', text:'Termina aqui', title:'Marca o fim do trecho na agulha (O)', onclick:() => mark('b') });
    const seeB = h('button', { class:'btn small ghost', text:'Ver o trecho', title:'Toca o trecho escolhido do começo ao fim', onclick:() => playSeg() });
    const zoomB = h('button', { class:'btn small ghost', text:'Ver o vídeo todo', title:'Volta a barra para o vídeo inteiro', onclick:() => { st.v0 = 0; st.v1 = D; drawBar(); } });
    const bar = h('div', { class:'tr-bar', title:'Clique leva a agulha. Arraste as bordas de um trecho para ajustar. Ctrl + roda: zoom; roda: anda' });
    const thumbs = h('div', { class:'tr-thumbs' }), lanes = h('div', { class:'tr-lanes' }), head = h('div', { class:'tr-head' });
    const scale = h('div', { class:'tr-scale' });
    bar.append(thumbs, lanes, head);
    const main = h('div', { class:'tr-main' }, [
      h('div', { class:'tr-stage' }, [vid]),
      h('div', { class:'tr-ctl' }, [playB, tcEl, h('div', { class:'spacer' }), inB, outB, seeB, zoomB]),
      scale, bar]);
    const list = h('div', { class:'tr-list' });
    const addB = o.one ? null : h('button', { class:'btn small', text:'+ Novo trecho', title:'Um trecho novo na agulha (N)', onclick:() => newSeg() });
    const sumEl = h('p', { class:'hint tr-sum' }), errEl = h('p', { class:'hint tr-err', hidden:true });
    // como entram: no arquivo aberto (um depois do outro) ou um arquivo novo por trecho; e a gordura, nos dois
    const outSec = h('section', { class:'sec tr-out' }), howEl = h('p', { class:'hint' });
    const fatF = v => String(+v.toFixed(1)).replace('.', ',') + ' s';
    const fatIn = h('input', { type:'text', class:'num tr-fat', inputmode:'decimal', value:fatF(st.fat), 'aria-label':'Gordura em segundos',
      title:'Segundos a mais copiados antes e depois de cada trecho, para uma transição. O vídeo entra cortado no ponto marcado' });
    fatIn.addEventListener('change', () => { const v = parseFloat(fatIn.value.replace(',', '.')); if (isFinite(v)) { st.fat = clamp(v, 0, TRECHO.fatMax); trPrefSet({ fat:st.fat }); } fatIn.value = fatF(st.fat); sync(); });
    fatIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fatIn.blur(); if (e.key === 'Escape') { fatIn.value = fatF(st.fat); fatIn.blur(); } });
    function drawOut() {
      outSec.innerHTML = '';
      const mode = o.one ? null : modeF('Entram', [[false, 'Neste arquivo', 'Um depois do outro na timeline deste arquivo'], [true, 'Um arquivo cada', 'Cada trecho vira um arquivo novo neste projeto']], st.own,
        v => { st.own = v; trPrefSet({ own:v }); drawOut(); sync(); });
      if (mode) mode.classList.add('stack'); // a coluna é estreita: o nome em cima e os dois botões na largura toda
      outSec.append(h('h3', { text:'Como entram' }), mode, field('Gordura', fatIn), howEl);
    }
    const side = h('div', { class:'cut-side tr-side' }, [
      !o.one && typeof rotSec === 'function' ? rotSec(st) : null,
      h('section', { class:'sec' }, [h('h3', { text:o.one ? 'Trecho' : 'Trechos' }), list, addB ? h('div', { class:'row' }, [addB]) : null, sumEl, errEl]),
      outSec,
      h('section', { class:'sec' }, [h('p', { class:'hint', text:'Só o trecho entra, copiado sem perder qualidade. Espaço toca, I e O marcam começo e fim, ← → andam 1 s (Shift: 10 s), , e . andam um quadro.' })]),
    ]);
    drawOut();
    const okB = h('button', { class:'btn small primary', title:'Enter', onclick:() => finish() });
    const fullB = D <= TRECHO.maxDur && file.size <= TRECHO.minSize ? h('button', { class:'btn small ghost', text:'Importar inteiro', title:'Entra o vídeo todo, como antes (mais pesado)', onclick:() => done([{ file, cut:null }]) }) : null;
    const pTitle = h('b', { text:'Copiando o trecho' }), barI = h('i'), prog = h('div', { class:'cut-prog', hidden:true }, [pTitle, h('div', { class:'cut-bar' }, [barI])]);
    main.querySelector('.tr-stage').append(prog);
    const card = h('div', { class:'files-card cut-card tr-card', role:'dialog', 'aria-modal':'true', 'aria-label':'Importar trecho' }, [
      h('div', { class:'files-head' }, [h('h2', { text:'Importar trecho' }),
        h('span', { class:'cut-meta', text:`${file.name || 'vídeo'} · ${tcF(D, false)}${meta.w ? ` · ${meta.w} × ${meta.h}` : ''}` }), h('div', { class:'spacer' }),
        fullB, h('button', { class:'btn small ghost', text:'Cancelar', title:'Esc', onclick:() => done(null) }), okB]),
      h('div', { class:'cut-body tr-body' }, [side, main])]);
    const win = h('div', { class:'files cut-win tr-win' }, [card]);
    document.body.append(win);

    // o índice do MP4 é lido enquanto a janela está aberta: o aviso de "não dá para cortar este arquivo" aparece cedo
    st.ixP = mp4Index(file).then(ix => { st.ix = ix; const no = trechoNo(ix); if (no) st.ixErr = no; }).catch(e => { st.ixErr = /moov|índice|quebrado/.test(e.message) ? 'o arquivo não é um MP4/MOV que eu consiga ler aos pedaços' : e.message; })
      .then(() => { if (!st.closed) sync(); });

    const seg = () => st.segs[st.cur];
    const tot = () => st.segs.reduce((s, x) => s + x.b - x.a, 0);
    const X = t => (t - st.v0) / (st.v1 - st.v0) * 100;
    const tAt = cx => { const r = bar.getBoundingClientRect(); return clamp(st.v0 + (cx - r.left) / r.width * (st.v1 - st.v0), 0, D); };
    const seek = t => { vid.currentTime = clamp(t, 0, D); drawHead(); };
    function sync() {
      const n = st.segs.length, T = tot(), own = st.own && !o.one;
      // um arquivo por trecho: cada um até 10 min; no arquivo aberto, a soma
      const over = own ? st.segs.some(s => s.b - s.a > TRECHO.maxDur + .01) : T > TRECHO.maxDur + .01;
      okB.textContent = own ? (n === 1 ? 'Criar o arquivo' : `Criar ${n} arquivos`) : o.one || n === 1 ? 'Importar trecho' : `Importar ${n} trechos`;
      okB.disabled = st.busy || over || !!st.ixErr || !n;
      sumEl.textContent = n > 1 ? `${n} trechos · ${tcF(T)} no total` : n ? `${tcF(T)} de vídeo` : '';
      errEl.hidden = !(over || st.ixErr);
      errEl.textContent = st.ixErr ? `Não dá para cortar este arquivo aqui: ${st.ixErr}. Converta para MP4 (H.264) ou corte antes em outro programa.`
        : over ? (own ? `Um trecho passa de ${TRECHO.maxDur / 60} min, o máximo de um arquivo. Encurte esse trecho.` : `Passa de ${TRECHO.maxDur / 60} min, o máximo de um arquivo. Encurte ${n > 1 ? 'os trechos' : 'o trecho'}.`) : '';
      howEl.textContent = (own ? 'Cada trecho vira um arquivo novo neste projeto, com o vídeo cobrindo o quadro. O arquivo aberto não muda.'
        : o.one ? '' : 'Cada trecho vira um vídeo, um depois do outro na timeline.')
        + (st.fat > 0 ? ` A gordura (${fatF(st.fat)} antes e depois) fica guardada: puxe a borda da barra na timeline para usar numa transição.` : '');
      card.classList.toggle('busy', st.busy);
      drawList(); drawBar();
    }
    function drawList() {
      list.innerHTML = '';
      st.segs.forEach((s, i) => {
        const field2 = (k, lab) => {
          const inp = h('input', { type:'text', class:'num tr-t', value:tcF(s[k]), 'aria-label':`${lab} do trecho ${i + 1}` });
          inp.addEventListener('focus', () => { st.cur = i; drawBar(); });
          inp.addEventListener('change', () => { const v = tcParse(inp.value); if (v != null) setEdge(i, k, v, true); sync(); });
          inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = tcF(s[k]); inp.blur(); } });
          return inp;
        };
        const row = h('div', { class:'tr-item' + (i === st.cur ? ' sel' : ''), 'aria-selected':String(i === st.cur), onclick:e => { if (e.target.closest('input,button')) return; st.cur = i; seek(s.a); sync(); } }, [
          h('span', { class:'tr-n', text:String(i + 1) }), field2('a', 'Começo'), h('span', { class:'tr-ar', text:'→' }), field2('b', 'Fim'),
          h('span', { class:'tr-len', text:tcF(s.b - s.a) }),
          st.segs.length > 1 ? h('button', { class:'tr-x', title:'Tirar este trecho', 'aria-label':`Tirar o trecho ${i + 1}`, html:ICONS.trash, onclick:() => { st.segs.splice(i, 1); st.cur = Math.min(st.cur, st.segs.length - 1); sync(); } }) : null]);
        list.append(row);
      });
    }
    // push (campos e I/O): começo depois do fim leva o trecho junto (mesma duração); arrastar a borda na barra só prende
    function setEdge(i, k, v, push) {
      const s = st.segs[i], len = s.b - s.a; v = clamp(v, 0, D);
      if (k === 'a') { if (push && v > s.b - MIN) { s.a = Math.min(v, D - MIN); s.b = Math.min(D, s.a + len); } else s.a = clamp(v, 0, s.b - MIN); }
      else if (push && v < s.a + MIN) { s.b = Math.max(v, MIN); s.a = Math.max(0, s.b - len); } else s.b = clamp(v, s.a + MIN, D);
    }
    function mark(k) { setEdge(st.cur, k, vid.currentTime, true); sync(); }
    function newSeg() {
      const t = vid.currentTime; st.segs.push({ a:Math.min(t, D - MIN), b:Math.min(D, Math.max(t, 0) + 30) });
      st.cur = st.segs.length - 1; sync();
    }
    let segEnd = null;
    function playSeg() { const s = seg(); vid.currentTime = s.a; segEnd = s.b; vid.play(); }
    // régua: passo pelo zoom (no mínimo ~70 px entre números)
    function drawBar() {
      const span = st.v1 - st.v0, w = bar.clientWidth || 600, steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
      const step = steps.find(x => x / span * w >= 70) || 3600;
      scale.innerHTML = '';
      for (let s = Math.ceil(st.v0 / step) * step; s <= st.v1 + 1e-6; s += step) scale.append(h('b', { style:`left:${X(s)}%`, text:tcF(s, false) }));
      lanes.innerHTML = '';
      st.segs.forEach((s, i) => {
        const r = h('div', { class:'tr-seg' + (i === st.cur ? ' sel' : ''), style:`left:${X(s.a)}%;width:${Math.max(.2, X(s.b) - X(s.a))}%` }, [h('span', { text:String(i + 1) }), h('i', { class:'l' }), h('i', { class:'r' })]);
        r.dataset.i = i; lanes.append(r);
      });
      zoomB.hidden = st.v0 <= 0 && st.v1 >= D;
      drawHead(); thumbsSoon();
    }
    function drawHead() {
      const t = vid.currentTime || 0, x = X(t);
      head.style.left = x + '%'; head.hidden = x < 0 || x > 100;
      tcEl.innerHTML = `${tcF(t)} <span>/ ${tcF(D, false)}</span>`;
      playB.innerHTML = vid.paused ? ICON_PLAY : ICON_PAUSE;
    }
    // miniaturas da parte que a barra mostra: um <video> à parte, uma busca de cada vez (geração nova cancela a anterior)
    const tv = h('video', { src:url, preload:'auto', muted:'' }); tv.muted = true;
    let thT = 0, thGen = 0;
    function thumbsSoon() { clearTimeout(thT); thT = setTimeout(makeThumbs, 250); }
    async function makeThumbs() {
      const gen = ++thGen, r = bar.getBoundingClientRect(), hh = Math.max(20, r.height), ar = (meta.w && meta.h) ? meta.w / meta.h : 16 / 9;
      const tw = Math.max(24, hh * ar), n = Math.max(1, Math.ceil(r.width / tw)), span = st.v1 - st.v0;
      thumbs.innerHTML = '';
      const cs = []; for (let i = 0; i < n; i++) { const c = h('canvas', { style:`left:${i * tw / r.width * 100}%;width:${tw / r.width * 100}%` }); c.width = Math.round(tw * 1.5); c.height = Math.round(hh * 1.5); thumbs.append(c); cs.push(c); }
      if (tv.readyState < 1) await new Promise(res => { tv.addEventListener('loadedmetadata', res, { once:true }); setTimeout(res, 3000); });
      for (let i = 0; i < n; i++) {
        if (gen !== thGen || st.closed) return;
        const t = clamp(st.v0 + (i + .5) * tw / r.width * span, 0, D - .05);
        await new Promise(res => { const ok = () => { clearTimeout(to); res(); }, to = setTimeout(ok, 1500); tv.addEventListener('seeked', ok, { once:true }); tv.currentTime = t; });
        if (gen !== thGen || st.closed) return;
        try { const x = cs[i].getContext('2d'); x.drawImage(tv, 0, 0, cs[i].width, cs[i].height); } catch (e) {}
      }
    }
    // barra: clicar leva a agulha; perto da borda de um trecho = ajusta a borda; no meio do trecho = escolhe e leva a agulha
    bar.addEventListener('pointerdown', e => {
      if (e.button) return; e.preventDefault();
      const r = bar.getBoundingClientRect(), px = (st.v1 - st.v0) / r.width;
      let hit = null;
      st.segs.forEach((s, i) => { for (const k of ['a', 'b']) { const d = Math.abs(tAt(e.clientX) - s[k]) / px; if (d <= 7 && (!hit || d < hit.d || (d === hit.d && i === st.cur))) hit = { i, k, d }; } });
      if (hit) { st.cur = hit.i; vid.pause(); }
      else { const i = st.segs.findIndex(s => tAt(e.clientX) >= s.a && tAt(e.clientX) <= s.b); if (i >= 0) st.cur = i; }
      const mv = ev => { const t = tAt(ev.clientX); if (hit) { setEdge(hit.i, hit.k, t); seek(st.segs[hit.i][hit.k]); sync(); } else seek(t); };
      mv(e); if (!hit) sync();
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    bar.addEventListener('pointermove', e => {
      const r = bar.getBoundingClientRect(), px = (st.v1 - st.v0) / r.width, t = tAt(e.clientX);
      bar.style.cursor = st.segs.some(s => Math.abs(t - s.a) / px <= 7 || Math.abs(t - s.b) / px <= 7) ? 'ew-resize' : '';
    });
    // Ctrl + roda (ou pinça) = zoom em volta do ponteiro; roda = anda para os lados
    bar.addEventListener('wheel', e => {
      e.preventDefault();
      const span = st.v1 - st.v0;
      if (e.ctrlKey || e.metaKey) {
        const t = tAt(e.clientX), k = Math.exp(e.deltaY * .0025), ns = clamp(span * k, Math.min(D, 4), D), f = (t - st.v0) / span;
        st.v0 = clamp(t - f * ns, 0, D - ns); st.v1 = st.v0 + ns;
      } else {
        const dx = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / bar.clientWidth * span;
        st.v0 = clamp(st.v0 + dx, 0, D - span); st.v1 = st.v0 + span;
      }
      drawBar();
    }, { passive:false });
    vid.addEventListener('timeupdate', () => { if (segEnd != null && vid.currentTime >= segEnd) { vid.pause(); segEnd = null; } follow(); drawHead(); });
    vid.addEventListener('error', () => { st.ixErr = st.ixErr || 'o Chrome não consegue tocar este vídeo (codec)'; sync(); });
    vid.addEventListener('play', drawHead); vid.addEventListener('pause', () => { segEnd = null; drawHead(); });
    vid.addEventListener('seeked', drawHead);
    // tocando com zoom: a barra acompanha a agulha
    function follow() { const t = vid.currentTime, span = st.v1 - st.v0; if (!vid.paused && (t > st.v1 || t < st.v0) && span < D) { st.v0 = clamp(t - span * .1, 0, D - span); st.v1 = st.v0 + span; drawBar(); } }
    let raf = 0; const loop = () => { if (st.closed) return; if (!vid.paused) drawHead(); raf = requestAnimationFrame(loop); }; loop();
    const keys = e => {
      if (st.closed) return;
      if (e.target.closest && e.target.closest('input')) return;
      if (document.querySelector('.modal.ask')) return; // confirmação aberta (Roteiro): Enter/Esc são dela
      const k = e.key, step = e.shiftKey ? 10 : 1;
      let used = true;
      if (k === ' ') vid.paused ? vid.play() : vid.pause();
      else if (k === 'Escape') done(null);
      else if (k === 'Enter') { if (!okB.disabled) finish(); }
      else if (k === 'i' || k === 'I') mark('a');
      else if (k === 'o' || k === 'O') mark('b');
      else if ((k === 'n' || k === 'N') && !o.one) newSeg();
      else if (k === 'ArrowLeft') seek(vid.currentTime - step);
      else if (k === 'ArrowRight') seek(vid.currentTime + step);
      else if (k === ',') { vid.pause(); seek(vid.currentTime - 1 / fps); }
      else if (k === '.') { vid.pause(); seek(vid.currentTime + 1 / fps); }
      else if (k === 'Home') seek(0); else if (k === 'End') seek(D);
      else if ((k === 'Delete' || k === 'Backspace') && st.segs.length > 1) { st.segs.splice(st.cur, 1); st.cur = Math.min(st.cur, st.segs.length - 1); sync(); }
      else used = false;
      e.stopPropagation(); if (used) e.preventDefault(); // nada chega ao editor por baixo (Ctrl+Z desfazia lá)
    };
    addEventListener('keydown', keys, true);
    const ro = new ResizeObserver(() => drawBar()); ro.observe(bar);
    sync();

    function done(v) {
      if (st.closed) return; st.closed = true; TRECHOWIN = null; thGen++;
      if (st.onClose) try { st.onClose(); } catch (e) {} // Roteiro ouvindo: para (o que já foi ouvido fica guardado)
      removeEventListener('keydown', keys, true); ro.disconnect(); cancelAnimationFrame(raf);
      vid.pause(); vid.removeAttribute('src'); vid.load(); tv.removeAttribute('src'); tv.load(); URL.revokeObjectURL(url);
      win.remove(); resolve(v);
    }
    async function finish() {
      if (st.busy || okB.disabled) return;
      vid.pause(); st.busy = true; sync();
      prog.hidden = false; pTitle.textContent = 'Lendo o vídeo'; barI.style.width = '0%';
      try {
        await st.ixP; if (st.ixErr) throw new Error(st.ixErr);
        const segs = st.segs.slice().sort((p, q) => p.a - q.a), out = [], base = (file.name || 'video').replace(/\.[^.]+$/, '');
        for (let i = 0; i < segs.length; i++) {
          pTitle.textContent = segs.length > 1 ? `Copiando o trecho ${i + 1} de ${segs.length}` : 'Copiando o trecho';
          // gordura: copia [a − g, b + g] (sem passar do vídeo) e o corte (vIn/vOut) fica no trecho marcado
          const s = segs[i], a0 = Math.max(0, s.a - st.fat), b0 = Math.min(D, s.b + st.fat);
          const r = await trechoCut(file, st.ix, a0, b0, p => { barI.style.width = ((i + p) / segs.length * 100).toFixed(1) + '%'; });
          if (st.closed) return;
          const nm = `${base} ${tcF(s.a, false).replace(/:/g, '.')}`, vIn = r.lead + s.a - a0;
          out.push({ file:new File([r.blob], nm + '.mp4', { type:'video/mp4' }), cut:{ vIn:+vIn.toFixed(3), vOut:+(vIn + s.b - s.a).toFixed(3) }, from:{ name:file.name, a:s.a, b:s.b } });
        }
        out.own = st.own && !o.one; // um arquivo por trecho (addVideoFile → cutFiles)
        done(out);
      } catch (e) {
        console.warn('trecho', e); st.busy = false; prog.hidden = true; sync();
        toast('Não consegui copiar o trecho: ' + (e.message || e), 6000);
      }
    }
  });
}
