/* ============================================================
   Efeitos sonoros (pedido do usuário: sons melhores nas animações e apagar de onde quiser, cada um numa camada separada).
   Carregado antes do app.js, só declara (usa S, rand, phase, gpseudo, base… na hora da chamada).
   Camada type:'sfx' (NOBOX: só tempo, como o Áudio), no grupo "Efeitos sonoros" (S.groups[gid].sfx). Campos:
   sk = o som (SFXK), vol (0..2, relativo; o nível da Trilha, Sutis/Marcantes, multiplica tudo), sn = batidas (pop, digitação…),
   sseed = variação, spk = onde o sopro chega no máximo (0..1 da barra), links = ids de quem faz o som ('g:<gid>' = grupo com
   animação própria; elementos que entram juntos com o mesmo som dividem uma camada só), sync = anda junto com quem faz o som,
   auto = criado sozinho (a duração acompanha a entrada; Desligados tira), skFix = som escolhido à mão (trocar o preset não troca mais), ss/as = começo de quem faz o som e do som na última conta
   (a diferença diz quem andou: só o elemento = o som vai junto; os dois juntos = nada a corrigir), sg = assinatura da entrada.
   S.sfx = 'off' | 'soft' | 'punchy': ligado, toda entrada animada (e transição, câmera de impacto) ganha o som dela sozinha
   (sfxEnsure, em changed). Apagar o som marca quem fazia o som com nosfx (não volta sozinho); desligar tira os automáticos.
   Síntese: cada som é renderizado sozinho num OfflineAudioContext curto (com eco suave) e guardado (SFXBUF); a mistura (buildMix)
   só posiciona, com volume e lado (estéreo pela posição do elemento). Prévia e MP4 iguais, determinístico (rand).
   Peso: nada por quadro; ~5 ms por som novo, refeito só quando ele muda.
   ============================================================ */
// g = ganho de cada som (medido: todos com a mesma força percebida, os graves um pouco acima)
const SFXK = {
  whoosh:{ label:'Sopro', g:2.4, wet:.16, tail:.9 }, swish:{ label:'Deslize', g:3.7, wet:.14, tail:.8 }, pop:{ label:'Pop', g:0.83, wet:.2, tail:.8 },
  thud:{ label:'Batida', g:0.65, wet:.18, tail:1 }, tick:{ label:'Digitação', g:2.9, wet:.07, tail:.5 }, click:{ label:'Clique', g:2.5, wet:.1, tail:.5 },
  shine:{ label:'Brilho', g:0.8, wet:.55, tail:1.8 }, glitch:{ label:'Falha', g:0.66, wet:.1, tail:.5 }, boom:{ label:'Impacto', g:0.62, wet:.3, tail:1.6 },
  riser:{ label:'Subida', g:1.8, wet:.28, tail:1.2 },
};
const SFX_LV = [['off', 'Desligados'], ['soft', 'Sutis'], ['punchy', 'Marcantes']];
const SFX_GAIN = { soft:.6, punchy:1.05 };
const SFX_HITS = { pop:8, thud:8, click:8, tick:60 }; // sons que têm "Batidas"
// o som de cada animação de entrada: deslizes = sopro, revelações = deslize, molas = pop, carimbo = batida, digitação = cliques…
function sfxKindOf(L) {
  if (L.type === 'fx') return L.fx === 'flash' ? 'shine' : 'whoosh';
  if (L.type === 'camera') return L.cam === 'punch' || L.cam === 'shake' ? 'boom' : null;
  const k = L.in || '';
  if (!k || k === 'cut' || k === 'fade') return null;
  if (/^(spring|pop|springWord|jelly|elastic|swing|bounce)$/.test(k)) return 'pop';
  if (/^(stamp|drop)$/.test(k)) return 'thud';
  if (/^(type|counter|scramble)$/.test(k)) return 'tick';
  if (/^(glitch|rgb|pixel|tiles)$/.test(k)) return 'glitch';
  if (/^(handwrite|draw|assemble|line|flash|neon|highlight|dust)$/.test(k)) return 'shine';
  if (/^(wipe|blinds|slices|diag|diamond|clock|scan|circle|ink|rise|lineMask|blur|blurChar|liquid|track)$/.test(k)) return 'swish';
  return 'whoosh';
}
// palavras que entram uma a uma (Mola por palavra, Carimbo): uma batida por palavra, até 5
function sfxUnits(P) {
  if (P.type !== 'text') return 1;
  const T_ = TP[P.in]; if (!T_ || T_.unit !== 'word' || !(T_.s > 0)) return 1;
  return clamp((P.text || '').trim().split(/\s+/).filter(Boolean).length, 1, 5);
}
// onde o som começa (em relação à entrada), quanto dura e quantas batidas
function sfxShape(P, k) {
  const end = P.end ?? S.duration, ph = phase(P, P.start), inD = ph ? ph.inD || .5 : .5;
  if (P.type === 'fx') return { off:0, d:Math.max(.2, end - P.start), spk:.5 };
  if (P.type === 'camera') return { off:0, d:1.1 };
  const n = sfxUnits(P);
  switch (k) {
    case 'whoosh': return { off:-.06, d:clamp(inD * .7, .3, 1), spk:.35 };
    case 'swish': return { off:-.03, d:clamp(inD * .55, .22, .6), spk:.35 };
    case 'pop': return { off:0, d:n > 1 ? clamp(inD * .6, .3, 1.4) : .3, sn:n };
    case 'thud': return { off:0, d:n > 1 ? clamp(inD * .6, .3, 1.4) : .5, sn:n };
    case 'tick': return { off:0, d:clamp(inD * .9, .3, 4), sn:clamp(Math.round(((P.text || '').replace(/\s/g, '').length || 8) * .8), 3, 40) };
    case 'shine': return { off:0, d:clamp(inD, .8, 1.8) };
    case 'glitch': return { off:0, d:clamp(inD * .5, .25, .6) };
  }
  return { off:0, d:.5 };
}
// quem faz o som: a camada, ou o grupo com animação própria (como camada de tempo)
function sfxSrc(id) {
  if (!id) return null;
  if (id.startsWith('g:')) {
    const g = id.slice(2), lv = gleaves(g); if (!lv.length || !gAnimOn(g)) return null;
    const P = gpseudo(g); return P && { ...P, id, type:'group', x:P.__sx, visible:lv.some(l => l.visible), name:groupName(g) };
  }
  return S.layers.find(l => l.id === id) || null;
}
const sfxSig = P => [P.type, P.in, P.inDur, spdOf(P, 'in'), P.fx, P.cam, P.end ?? -1, P.type === 'text' ? (P.text || '').length : 0].join('|');
const sfxAudible = A => !A.links || !A.links.length || A.links.some(id => { const P = sfxSrc(id); return !P || P.visible; });
const sfxLayers = sl => S.layers.filter(A => A.type === 'sfx' && A.visible && (A.vol ?? 1) > 0 && SFXK[A.sk] && (sl == null || slideOfL(A) === sl) && sfxAudible(A));
// lado do som pela posição do elemento no slide (estéreo suave: no meio = centro)
const sfxPan = A => clamp(((+A.x || .5) - slideOfL(A) - .5) * 1.1, -.55, .55);
const sfxSigAll = () => [S.sfx || 'off', sfxLayers().map(A => [A.sk, A.start, A.end, A.vol, A.sn, A.sseed, A.spk, +sfxPan(A).toFixed(2), slideOfL(A)])];

// grupo "Efeitos sonoros" (criado na primeira vez) e onde a camada nova entra: junto das outras, ou logo acima do fundo
function sfxGroup() {
  const gs = S.groups ||= {};
  let g = Object.keys(gs).find(k => gs[k].sfx);
  if (!g) { g = 'g' + Math.random().toString(36).slice(2, 7); gs[g] = { name:'Efeitos sonoros', open:true, sfx:true }; }
  return g;
}
function sfxPut(A) {
  const g = sfxGroup(); A.grp = g;
  const ins = S.layers.filter(l => l.grp === g), last = ins.length ? S.layers.indexOf(ins[ins.length - 1]) + 1 : S.layers.findIndex(l => l.type !== 'bg');
  S.layers.splice(last < 0 ? S.layers.length : last, 0, A);
}
function sfxMake(k, st, sh, P) {
  const d = Math.max(.05, sh.d), e = Math.min(S.duration, st + d);
  const A = base('sfx', 'sfx', { name:SFXK[k].label + (P ? ' · ' + (P.name || '') : ''), sk:k, vol:1, sseed:Math.floor(Math.random() * 1e4),
    in:'cut', out:'cut', inDur:0, outDur:0 }, { start:+st.toFixed(3), end:+e.toFixed(3), x:P ? +(+P.x || .5).toFixed(5) : .5 + curSlide(), y:.5 });
  if (sh.sn > 1) A.sn = sh.sn; if (sh.spk != null) A.spk = sh.spk;
  if (P) Object.assign(A, { links:[P.id], sync:true, auto:true, ss:P.start, as:A.start, sg:sfxSig(P), so:sh.off });
  return A;
}
// chamado em changed(): o som acompanha quem faz o som e, com os sons ligados, toda animação nova ganha o dela.
// Devolve true quando entrou ou saiu alguma camada (a lista e a timeline precisam ser refeitas)
function sfxEnsure() {
  if (!S || !S.layers || S.still) return false;
  let ch = false;
  const drop = A => { S.layers.splice(S.layers.indexOf(A), 1); if (RT.picks && RT.picks.delete(A.id) && RT.selected === A.id) RT.selected = [...RT.picks][0] || null; ch = true; };
  for (const A of S.layers.filter(l => l.type === 'sfx')) {
    if (!A.links || !A.links.length) continue;
    const live = A.links.filter(id => sfxSrc(id));
    if (live.length !== A.links.length) A.links = live;
    if (!live.length) { if (A.auto) drop(A); else delete A.links; continue; }
    if (A.sync === false) continue;
    const P = sfxSrc(live[0]), sg = sfxSig(P);
    if (A.sg !== sg) { // a entrada mudou (outro preset, outra duração): o som se refaz, no mesmo lugar se ele foi arrastado
      A.sg = sg;
      const k = A.skFix ? A.sk : sfxKindOf(P);
      if (!k) { drop(A); continue; }
      const sh = sfxShape(P, k), moved = A.ss != null && Math.abs((A.start - A.ss) - (A.so ?? 0)) > .01, off = moved ? A.start - A.ss : sh.off;
      if (A.auto && k !== A.sk) { if (A.name.startsWith(SFXK[A.sk].label)) A.name = SFXK[k].label + A.name.slice(SFXK[A.sk].label.length); A.sk = k; }
      if (A.auto && !A.skFix) { if (sh.sn > 1) A.sn = sh.sn; else delete A.sn; if (sh.spk != null) A.spk = sh.spk; else delete A.spk; }
      A.so = sh.off; A.start = +Math.max(0, P.start + off).toFixed(3); A.end = +Math.min(S.duration, A.start + (A.auto ? sh.d : (A.end ?? S.duration) - A.start)).toFixed(3);
      A.ss = P.start; A.as = A.start;
    } else {
      const dS = P.start - (A.ss ?? P.start), dA = A.start - (A.as ?? A.start);
      if (Math.abs(dS) > 1e-6 && Math.abs(dA - dS) > 1e-4) { // só o elemento andou: o som vai junto
        const len = (A.end ?? S.duration) - A.start;
        A.start = +Math.max(0, A.start + dS).toFixed(3); A.end = +Math.min(S.duration, A.start + len).toFixed(3);
      }
      A.ss = P.start; A.as = A.start;
    }
    A.x = +(+P.x || .5).toFixed(5); // carrossel: o som vai no arquivo do slide de quem faz o som; e o lado do estéreo
  }
  if (S.sfx && S.sfx !== 'off') {
    const have = new Set(); for (const A of S.layers) if (A.type === 'sfx') for (const id of A.links || []) have.add(id);
    const cands = S.layers.filter(L => L.visible && !L.nosfx && L.type !== 'bg' && L.type !== 'audio' && L.type !== 'sfx' && !L.capt);
    for (const g of Object.keys(S.groups || {})) if (!S.groups[g].nosfx && !S.groups[g].sfx) { const P = sfxSrc('g:' + g); if (P && P.visible) cands.push(P); }
    for (const P of cands) {
      if (have.has(P.id) || layerStill(P)) continue;
      const k = sfxKindOf(P); if (!k) continue;
      const sh = sfxShape(P, k), st = Math.max(0, P.start + sh.off);
      if (st > S.duration - .05) continue;
      // o mesmo som ao mesmo tempo (um grupo entrando junto): uma camada só para todos
      const twin = S.layers.find(A => A.type === 'sfx' && A.auto && A.sk === k && A.links && A.links.length && Math.abs(A.start - st) < .06 && slideOfL(A) === slideOfL(P));
      if (twin) twin.links.push(P.id);
      else sfxPut(sfxMake(k, st, sh, P));
      have.add(P.id); ch = true;
    }
  }
  return ch;
}
// apagar (deleteLayer): quem apaga o elemento apaga o som dele (se não sobrou ninguém); quem apaga o som não o recebe de novo sozinho
function sfxOnDelete(grp) {
  const ids = new Set(grp.map(o => o.id));
  for (const A of S.layers) {
    if (A.type !== 'sfx' || !A.links || ids.has(A.id)) continue;
    const rest = A.links.filter(id => !ids.has(id));
    if (!rest.length && A.links.length) grp.push(A); else if (rest.length !== A.links.length) A.links = rest;
  }
  for (const A of grp) if (A.type === 'sfx') for (const id of A.links || []) {
    if (ids.has(id)) continue;
    if (id.startsWith('g:')) { const m = S.groups && S.groups[id.slice(2)]; if (m) m.nosfx = true; }
    else { const P = S.layers.find(l => l.id === id); if (P) P.nosfx = true; }
  }
}
// Trilha → Efeitos sonoros: Desligados tira os automáticos; ligar de novo devolve um som para cada animação
function sfxSetLevel(v) {
  const was = S.sfx && S.sfx !== 'off';
  pushUndo(); S.sfx = v;
  let msg = '';
  if (v === 'off') {
    const gone = S.layers.filter(A => A.type === 'sfx' && A.auto);
    gone.forEach(A => S.layers.splice(S.layers.indexOf(A), 1));
    if (gone.length) msg = `${gone.length} efeito${gone.length > 1 ? 's' : ''} sonoro${gone.length > 1 ? 's' : ''} tirado${gone.length > 1 ? 's' : ''} da timeline`;
  } else if (!was) {
    for (const L of S.layers) delete L.nosfx;
    for (const m of Object.values(S.groups || {})) delete m.nosfx;
  }
  const n0 = S.layers.filter(A => A.type === 'sfx').length;
  changed({ layers:true, props:true }); renderTimeline(); renderAudio();
  const n = S.layers.filter(A => A.type === 'sfx').length;
  if (v !== 'off' && !was) msg = n ? `${n} efeito${n > 1 ? 's' : ''} sonoro${n > 1 ? 's' : ''} no grupo "Efeitos sonoros" da timeline: apague ou arraste o que quiser` : 'Os sons entram quando algum elemento tiver animação de entrada';
  if (msg) toast(msg, 5000, typeof UNDO_ACT !== 'undefined' ? UNDO_ACT : undefined);
  return n - n0;
}
// Adicionar → Efeito sonoro: um som solto na agulha (não segue ninguém)
function sfxAdd() {
  if (S.still) { toast('Imagem estática não tem som. Digite uma duração para voltar ao vídeo.'); return; }
  const st = +clamp(playing ? 0 : T, 0, Math.max(0, S.duration - .3)).toFixed(3);
  pushUndo();
  const A = sfxMake('whoosh', st, { d:.6, spk:.35 }, null); A.auto = false; sfxPut(A);
  RT.picks = new Set([A.id]); RT.selected = A.id; RT.itemPicks = null; propTab = 'style';
  changed({ layers:true, props:true }); renderTimeline();
  toast('Efeito sonoro na agulha: escolha o som no painel e arraste a barra na timeline', 4500, typeof UNDO_ACT !== 'undefined' ? UNDO_ACT : undefined);
  return A;
}

/* ------------ síntese ------------ */
const SFXBUF = new Map(); // chave do som → AudioBuffer pronto (com o eco)
const SFXNZ = new Map(), SFXIR = new Map(); // ruído rosa e resposta do eco, por taxa de amostragem
function sfxNoise(sr) {
  if (SFXNZ.has(sr)) return SFXNZ.get(sr);
  const n = sr * 2, b = new AudioBuffer({ length:n, numberOfChannels:1, sampleRate:sr }), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // ruído rosa (Paul Kellet): mais macio que o branco, soa como ar
  for (let i = 0; i < n; i++) {
    const w = rand(i, 17) * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856;
    b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
  }
  SFXNZ.set(sr, b); return b;
}
// sala pequena: ruído que decai (1,3 s), cada vez mais abafado, um pouco diferente em cada lado
function sfxIR(sr) {
  if (SFXIR.has(sr)) return SFXIR.get(sr);
  const n = Math.round(sr * 1.3), b = new AudioBuffer({ length:n, numberOfChannels:2, sampleRate:sr });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, a = .85 - .6 * Math.min(1, t / 1.1);
      y += a * ((rand(i, 31 + c) * 2 - 1) - y);
      d[i] = y * Math.exp(-t * 4.6) * Math.min(1, t / .006);
    }
  }
  SFXIR.set(sr, b); return b;
}
// helpers do desenho do som (c = contexto, F = { out, d, pk, n, r(k) })
const sxEnv = (G, t, a, peak, dec) => { G.setValueAtTime(0, t); G.linearRampToValueAtTime(peak, t + a); G.exponentialRampToValueAtTime(.0001, t + a + dec); G.setValueAtTime(0, t + a + dec + .001); };
function sxCurve(G, t, d, fn, peak) { const a = new Float32Array(96); for (let i = 0; i < a.length; i++) a[i] = Math.max(0, fn(i / (a.length - 1))) * peak; a[0] = 0; a[a.length - 1] = 0; G.value = 0; G.setValueCurveAtTime(a, t, d); }
function sxNoiseSrc(c, F, k) { const s = c.createBufferSource(); s.buffer = sfxNoise(c.sampleRate); s.loop = true; s._o = F.r(k) * 1.8; return s; }
const sxRun = (s, t, e) => { s.start(t, s._o || 0); s.stop(e); };
const sxFilt = (c, type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; return n; };
const sxChain = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); return ns[ns.length - 1]; };
const sxGain = (c, v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };
// sopro/deslize: ar filtrado que cresce até o pico e some, passando de um lado para o outro, com um grave que passa junto
function sxAir(c, F, o) {
  const d = F.d, pk = clamp(F.pk, .15, .85), j = .85 + .3 * F.r(1), env = u => u < pk ? Math.pow(u / pk, 2.2) : Math.pow((1 - u) / (1 - pk), 1.6);
  const pn = c.createStereoPanner(), sw = (F.r(3) < .5 ? -1 : 1) * o.sw; pn.pan.setValueAtTime(-sw, 0); pn.pan.linearRampToValueAtTime(sw, d); pn.connect(F.out);
  const s = sxNoiseSrc(c, F, 2), bp = sxFilt(c, 'bandpass', o.f0 * j, o.q), lp = sxFilt(c, 'lowpass', 2000), g = sxGain(c);
  bp.frequency.setValueAtTime(o.f0 * j, 0); bp.frequency.exponentialRampToValueAtTime(o.f1 * j, d * pk); bp.frequency.exponentialRampToValueAtTime(o.f2 * j, d);
  lp.frequency.setValueAtTime(o.f1 * .9, 0); lp.frequency.exponentialRampToValueAtTime(o.f1 * 3.2, d * pk); lp.frequency.exponentialRampToValueAtTime(o.f2 * 2.2, d);
  sxCurve(g.gain, 0, d, env, o.v); sxChain(s, bp, lp, g, pn); sxRun(s, 0, d + .02);
  // o chiado fino, só perto do pico
  const s2 = sxNoiseSrc(c, F, 4), hp = sxFilt(c, 'highpass', 4800), g2 = sxGain(c);
  sxCurve(g2.gain, 0, d, u => Math.pow(Math.max(0, 1 - Math.abs(u - pk) / Math.max(pk, 1 - pk)), 3), o.air); sxChain(s2, hp, g2, pn); sxRun(s2, 0, d + .02);
  if (o.body) { // o "vuum"
    const w = c.createOscillator(), gw = sxGain(c); w.frequency.setValueAtTime(85 * j, 0); w.frequency.exponentialRampToValueAtTime(150 * j, d * pk); w.frequency.exponentialRampToValueAtTime(65 * j, d);
    sxCurve(gw.gain, 0, d, env, o.body); sxChain(w, gw, pn); w.start(0); w.stop(d + .02);
  }
}
// batidas espalhadas pela barra (pop, batida, clique): a 1ª no começo, a última antes do fim
const sxHits = (F, len) => { const n = Math.max(1, Math.round(F.n || 1)); return Array.from({ length:n }, (_, i) => n > 1 ? i * Math.max(0, F.d - len) / (n - 1) : 0); };
const SFX_SYN = {
  whoosh:(c, F) => sxAir(c, F, { f0:260, f1:1900, f2:520, q:.7, v:.95, air:.22, body:.16, sw:.45 }),
  swish:(c, F) => sxAir(c, F, { f0:520, f1:3600, f2:1300, q:.9, v:.8, air:.3, body:0, sw:.3 }),
  // bolha: o tom sobe rápido, com um corpo redondo e um estalinho no começo; cada batida um pouco mais aguda
  pop:(c, F) => sxHits(F, .18).forEach((t, i) => {
    const j = (.9 + .2 * F.r(10 + i)) * Math.pow(1.12, i), o = c.createOscillator(), g = sxGain(c);
    o.frequency.setValueAtTime(330 * j, t); o.frequency.exponentialRampToValueAtTime(980 * j, t + .045); o.frequency.exponentialRampToValueAtTime(820 * j, t + .12);
    sxEnv(g.gain, t, .004, .75, .15); sxChain(o, g, F.out); o.start(t); o.stop(t + .2);
    const b = c.createOscillator(), gb = sxGain(c); b.type = 'triangle'; b.frequency.setValueAtTime(170 * j, t); b.frequency.exponentialRampToValueAtTime(115 * j, t + .08);
    sxEnv(gb.gain, t, .003, .32, .09); sxChain(b, gb, F.out); b.start(t); b.stop(t + .14);
    const s = sxNoiseSrc(c, F, 30 + i), hp = sxFilt(c, 'highpass', 2600), gs = sxGain(c); sxEnv(gs.gain, t, .0008, .22, .012); sxChain(s, hp, gs, F.out); sxRun(s, t, t + .03);
  }),
  // pancada abafada (carimbo, queda): grave que cai, um "toc" e um pouco de ruído grave
  thud:(c, F) => sxHits(F, .3).forEach((t, i) => {
    const j = .92 + .16 * F.r(10 + i), o = c.createOscillator(), g = sxGain(c);
    o.frequency.setValueAtTime(150 * j, t); o.frequency.exponentialRampToValueAtTime(52 * j, t + .16); sxEnv(g.gain, t, .003, 1, .42); sxChain(o, g, F.out); o.start(t); o.stop(t + .5);
    const k = c.createOscillator(), gk = sxGain(c); k.type = 'triangle'; k.frequency.setValueAtTime(380 * j, t); k.frequency.exponentialRampToValueAtTime(140 * j, t + .05);
    sxEnv(gk.gain, t, .002, .3, .08); sxChain(k, gk, F.out); k.start(t); k.stop(t + .12);
    const s = sxNoiseSrc(c, F, 40 + i), lp = sxFilt(c, 'lowpass', 900, .7), gs = sxGain(c); sxEnv(gs.gain, t, .002, .45, .07); sxChain(s, lp, gs, F.out); sxRun(s, t, t + .1);
  }),
  // teclado: cada tecla = estalo agudo + "toc" grave, com tempo e força um pouco diferentes; de vez em quando uma mais forte (espaço)
  tick:(c, F) => {
    const n = Math.max(1, Math.round(F.n || 8)), step = F.d / n;
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, (i + (F.r(20 + i) - .5) * .35) * step), v = (.55 + .45 * F.r(40 + i)) * ((i + 1) % 7 ? 1 : 1.3);
      const s = sxNoiseSrc(c, F, 50 + i), bp = sxFilt(c, 'bandpass', 2400 + 1600 * F.r(60 + i), 1.4), g = sxGain(c);
      sxEnv(g.gain, t, .0008, .6 * v, .016); sxChain(s, bp, g, F.out); sxRun(s, t, t + .03);
      const o = c.createOscillator(), go = sxGain(c); o.frequency.value = 190 + 60 * F.r(80 + i); sxEnv(go.gain, t, .001, .26 * v, .028); sxChain(o, go, F.out); o.start(t); o.stop(t + .05);
    }
  },
  click:(c, F) => sxHits(F, .05).forEach((t, i) => {
    const s = sxNoiseSrc(c, F, 70 + i), bp = sxFilt(c, 'bandpass', 4200, 1.2), g = sxGain(c); sxEnv(g.gain, t, .0006, .7, .014); sxChain(s, bp, g, F.out); sxRun(s, t, t + .03);
    const o = c.createOscillator(), go = sxGain(c); o.frequency.setValueAtTime(2100, t); o.frequency.exponentialRampToValueAtTime(1300, t + .02);
    sxEnv(go.gain, t, .001, .32, .03); sxChain(o, go, F.out); o.start(t); o.stop(t + .05);
  }),
  // brilho: notas altas de sino (escala pentatônica), em cascata, com um chiado cintilante por baixo e bastante eco
  shine:(c, F) => {
    const notes = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186], m = 5, s0 = Math.floor(F.r(1) * 3), spread = clamp(F.d * .45, .12, .7);
    for (let k = 0; k < m; k++) {
      const t = k * spread / (m - 1) + F.r(100 + k) * .02, f = notes[Math.min(notes.length - 1, s0 + k + (F.r(110 + k) < .3 ? 1 : 0))], dec = .95 - k * .09;
      for (const [mul, amp] of [[1, .2], [2.76, .045], [5.4, .016]]) { const o = c.createOscillator(), g = sxGain(c); o.frequency.value = f * mul; sxEnv(g.gain, t, .002, amp, dec / mul ** .4); sxChain(o, g, F.out); o.start(t); o.stop(t + dec + .05); }
    }
    const s = sxNoiseSrc(c, F, 5), hp = sxFilt(c, 'highpass', 7000), g = sxGain(c); sxCurve(g.gain, 0, F.d, u => Math.sin(Math.PI * u) ** 2, .07); sxChain(s, hp, g, F.out); sxRun(s, 0, F.d + .02);
  },
  // falha digital: pedacinhos de onda quadrada e ruído estreito, cortados, com um zumbido grave
  glitch:(c, F) => {
    let t = 0, i = 0;
    while (t < F.d - .01 && i < 40) {
      const len = .018 + .05 * F.r(200 + i), e = Math.min(F.d, t + len), g = sxGain(c);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.26, t + .001); g.gain.setValueAtTime(.26, e - .001); g.gain.linearRampToValueAtTime(0, e);
      if (F.r(220 + i) < .5) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 200 + 2600 * F.r(240 + i); sxChain(o, sxFilt(c, 'lowpass', 5000), g, F.out); o.start(t); o.stop(e + .01); }
      else { const s = sxNoiseSrc(c, F, 260 + i); sxChain(s, sxFilt(c, 'bandpass', 500 + 5000 * F.r(280 + i), 4), g, F.out); sxRun(s, t, e + .01); }
      t = e + (F.r(300 + i) < .3 ? .01 + .03 * F.r(320 + i) : 0); i++;
    }
    const z = c.createOscillator(), gz = sxGain(c); z.type = 'sawtooth'; z.frequency.value = 58; sxCurve(gz.gain, 0, F.d, u => u < .1 ? u / .1 : 1 - (u - .1) / .9, .06); sxChain(z, sxFilt(c, 'lowpass', 600), gz, F.out); z.start(0); z.stop(F.d + .02);
  },
  // impacto (câmera): bumbo grave saturado + estalo de ruído que escurece + ronco
  boom:(c, F) => {
    const ws = c.createWaveShaper(), cv = new Float32Array(1024); for (let i = 0; i < cv.length; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); } ws.curve = cv;
    const o = c.createOscillator(), g = sxGain(c); o.frequency.setValueAtTime(120, 0); o.frequency.exponentialRampToValueAtTime(38, .55); sxEnv(g.gain, 0, .004, .95, 1); sxChain(o, ws, g, F.out); o.start(0); o.stop(1.1);
    const s = sxNoiseSrc(c, F, 6), lp = sxFilt(c, 'lowpass', 1500, .8), gs = sxGain(c); lp.frequency.setValueAtTime(1500, 0); lp.frequency.exponentialRampToValueAtTime(250, .3);
    sxEnv(gs.gain, 0, .002, .55, .34); sxChain(s, lp, gs, F.out); sxRun(s, 0, .4);
    const r = sxNoiseSrc(c, F, 7), lr = sxFilt(c, 'lowpass', 120), gr = sxGain(c); sxEnv(gr.gain, 0, .01, .35, .9); sxChain(r, lr, gr, F.out); sxRun(r, 0, 1);
  },
  // subida: ruído e duas ondas que sobem até o fim da barra (o "antes do corte" das transições)
  riser:(c, F) => {
    const d = F.d, j = .9 + .2 * F.r(1), env = u => u < .94 ? Math.pow(u / .94, 2.4) : (1 - u) / .06;
    const s = sxNoiseSrc(c, F, 2), bp = sxFilt(c, 'bandpass', 300, 2.5), g = sxGain(c); bp.frequency.setValueAtTime(300 * j, 0); bp.frequency.exponentialRampToValueAtTime(5200 * j, d);
    sxCurve(g.gain, 0, d, env, .7); sxChain(s, bp, g, F.out); sxRun(s, 0, d + .02);
    const lp = sxFilt(c, 'lowpass', 400), gw = sxGain(c); lp.frequency.setValueAtTime(400, 0); lp.frequency.exponentialRampToValueAtTime(4000, d); sxCurve(gw.gain, 0, d, env, .1); sxChain(lp, gw, F.out);
    for (const det of [1, 1.006]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110 * j * det, 0); o.frequency.exponentialRampToValueAtTime(660 * j * det, d); o.connect(lp); o.start(0); o.stop(d + .02); }
  },
};
const sfxKey = (A, sr) => [A.sk, (+((A.end ?? S.duration) - A.start)).toFixed(3), A.sn || 1, A.sseed | 0, A.spk ?? .35, sr].join('|');
// um som pronto (com o eco), começando em 0; guardado pela chave
async function sfxRender(A, sr) {
  const key = sfxKey(A, sr); if (SFXBUF.has(key)) return SFXBUF.get(key);
  const K = SFXK[A.sk], d = Math.max(.05, (A.end ?? S.duration) - A.start), c = new OfflineAudioContext(2, Math.ceil((d + K.tail) * sr), sr);
  const out = sxGain(c, K.g ?? 1), wet = c.createConvolver(), wg = sxGain(c, K.wet);
  wet.buffer = sfxIR(sr); out.connect(c.destination); out.connect(wg); wg.connect(wet); wet.connect(c.destination);
  SFX_SYN[A.sk](c, { out, d, pk:A.spk ?? .35, n:A.sn || 1, r:k => rand((A.sseed | 0) + 7, k) });
  const buf = await c.startRendering();
  if (SFXBUF.size > 300) SFXBUF.delete(SFXBUF.keys().next().value);
  SFXBUF.set(key, buf); return buf;
}
// na mistura (buildMix e "Ouvir"): cada som no tempo dele, com volume e lado; um compressor suave junta todos
async function sfxMix(off, d, Ls, t0 = 0) {
  if (!Ls.length) return;
  const sr = off.sampleRate, bufs = await Promise.all(Ls.map(A => sfxRender(A, sr)));
  // limitador sem memória (o compressor do navegador abafava o que toca logo no começo do vídeo): reto até 0,6 e arredonda até 0,98
  const out = sxGain(off, SFX_GAIN[S.sfx] ?? SFX_GAIN.soft), hp = sxFilt(off, 'highpass', 30), lim = off.createWaveShaper();
  lim.curve = SFX_LIM || (SFX_LIM = Float32Array.from({ length:2049 }, (_, i) => { const x = i / 512 - 2, a = Math.abs(x); return Math.sign(x) * (a <= .6 ? a : .6 + .38 * Math.tanh((a - .6) / .38)); }));
  sxChain(out, hp, lim, off.destination);
  Ls.forEach((A, i) => {
    const t = A.start - t0; if (t >= d) return;
    const s = off.createBufferSource(), g = sxGain(off, A.vol ?? 1), p = off.createStereoPanner(); s.buffer = bufs[i]; p.pan.value = sfxPan(A);
    sxChain(s, g, p, out);
    if (t >= 0) s.start(t); else s.start(0, -t);
  });
}
// "Ouvir" no painel: só os sons escolhidos, na hora (não mexe na agulha nem toca o vídeo)
let SFX_LIM = null;
const SFXPV = { src:null };
async function sfxListen(As) {
  if (playing || !As.length) return;
  const t0 = Math.min(...As.map(a => a.start)), d = Math.max(...As.map(a => (a.end ?? S.duration) + SFXK[a.sk].tail)) - t0, sr = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(d * sr), sr); await sfxMix(off, d, As, t0);
  const buf = await off.startRendering();
  if (!AUD.ctx) AUD.ctx = new AudioContext(); if (AUD.ctx.state !== 'running') await AUD.ctx.resume().catch(() => {});
  if (SFXPV.src) try { SFXPV.src.stop(); } catch (e) {}
  const s = AUD.ctx.createBufferSource(); s.buffer = buf; s.connect(AUD.ctx.destination); s.start(); SFXPV.src = s;
}

/* ------------ painel ------------ */
function sfxProps(L, As) {
  As = As && As.length ? As : [L];
  const many = As.length > 1, listen = () => sfxListen(As);
  const P = !many && L.links && L.links.length ? sfxSrc(L.links[0]) : null;
  const was = new Map(S.layers.filter(o => o.type === 'sfx').map(o => [o, o.sk])); // o nome troca junto ("Sopro · Título" → "Pop · Título")
  const som = h('section', { class:'sec' }, [h('h3', { text:many ? `${As.length} efeitos sonoros` : 'Som' }),
    chipPick(L, 'sk', Object.entries(SFXK).map(([v, o]) => [v, o.label]), (v, o) => {
      const K0 = SFXK[was.get(o)]; if (K0 && o.name && o.name.startsWith(K0.label)) o.name = SFXK[v].label + o.name.slice(K0.label.length);
      o.skFix = true; if (!SFX_HITS[v]) delete o.sn; // escolhido à mão: trocar a entrada do elemento não troca mais o som
    }, listen)]);
  som.append(rangeF(L, 'vol', 'Volume', 0, VOL_MAX, .01, v => Math.round((v ?? 1) * 100) + '%', { get:() => L.vol ?? 1, put:v => { for (const o of As) o.vol = +(+v).toFixed(2); } }));
  if (SFX_HITS[L.sk]) som.append(rangeF(L, 'sn', 'Batidas', 1, SFX_HITS[L.sk], 1, v => String(Math.round(v ?? 1)), { get:() => L.sn ?? 1, put:v => { for (const o of As) if (SFX_HITS[o.sk]) o.sn = Math.round(v); } }));
  som.append(h('div', { class:'row' }, [
    h('button', { class:'btn small', text:'Ouvir', title:'Toca só este som', onclick:listen }),
    h('button', { class:'btn small', text:'Outra variação', title:'O mesmo som, um pouco diferente', onclick:() => { pushUndo(); for (const o of As) o.sseed = Math.floor(Math.random() * 1e4); changed(); listen(); } })]),
    h('p', { class:'hint', text:'O nível de todos os sons (Sutis ou Marcantes) fica na Trilha. Toca na prévia (espaço) e sai no MP4.' }));
  const secs = [som];
  if (!many) {
    const t = h('section', { class:'sec' }, [h('h3', { text:'Tempo' })]);
    if (P) t.append(checkF(L, 'sync', 'Seguir o elemento'), h('p', { class:'hint', text:L.sync === false ? `Fica parado na timeline, mesmo se "${P.name}" mudar de lugar.` : `Toca quando "${P.name}" entra e anda junto com ele. Arraste a barra para adiantar ou atrasar.` }));
    t.append(
      rangeF(L, 'start', 'Começa em', 0, Math.max(0, S.duration - .05), .01, v => (+v).toFixed(2) + 's', { onInput:() => { const len = Math.max(.05, (L.end ?? S.duration) - L.start); L.end = +Math.min(S.duration, L.start + len).toFixed(3); }, after:() => renderTimeline() }),
      rangeF(L, 'end', 'Termina em', .05, S.duration, .01, v => (+(v ?? S.duration)).toFixed(2) + 's', { onInput:() => { if (L.end < L.start + .05) L.end = L.start + .05; }, after:() => renderTimeline() }),
      h('p', { class:'hint', text:'Esticar a barra deixa o sopro, a digitação e o brilho mais longos. Apagar esta camada tira só este som.' }));
    secs.push(t);
  }
  return secs;
}
