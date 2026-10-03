"use strict";
/* ============================================================
   Utilidades
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// cores da interface que o canvas usa (seleção, margem, quadro): vêm do CSS (--sel, --margin-rgb, --frame-rgb) para o tema valer também no palco
const UI_V = { sel:['--sel', '#F2B632'], selInk:['--sel-ink', '#1B1403'], bg:['--bg', '#101115'], selRgb:['--sel-rgb', '242,182,50'], marginRgb:['--margin-rgb', '111,211,166'], frameRgb:['--frame-rgb', '143,176,255'] }, UI_CACHE = {};
const uiC = k => UI_CACHE[k] || (UI_CACHE[k] = getComputedStyle(document.documentElement).getPropertyValue(UI_V[k][0]).trim() || UI_V[k][1]);
const uiA = (k, a) => `rgba(${uiC(k + 'Rgb')},${a})`;
const lerp = (a, b, t) => a + (b - a) * t;
// caixa que envolve várias caixas { x, y, w, h } (seleção, grupo, margem, guias: uma conta só)
const unionBox = bs => { const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w:Math.max(...bs.map(b => b.x + b.w)) - x, h:Math.max(...bs.map(b => b.y + b.h)) - y }; };
const uid = () => 'l' + Math.random().toString(36).slice(2, 9);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;
function h(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
}
// cor com opacidade = "#rrggbbaa" (o canvas e o CSS já entendem); opaca segue "#rrggbb"
function colA(c) { const x = String(c || '').replace('#', ''); return x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1; }
function withA(c, a) {
  const b = String(c || '#000000').slice(0, 7), n = Math.round(clamp(a, 0, 1) * 255);
  return n >= 255 ? b : b + n.toString(16).padStart(2, '0');
}
function hexA(hex, a) {
  let c = (hex || '#000').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+(a * (c.length === 8 ? parseInt(c.slice(6), 16) / 255 : 1)).toFixed(4)})`;
}
// act = { label, fn }: botão no próprio aviso (ex.: Desfazer)
function toast(msg, ms = 2600, act) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (act) { t.append(h('button', { class:'toast-act', text:act.label, onclick:() => { t.hidden = true; act.fn(); } })); ms = Math.max(ms, 5000); }
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms);
}
const UNDO_ACT = { label:'Desfazer', fn:() => undo() };
const readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](file); });
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem não carregou')); i.src = src; });

/* ============================================================
   Curvas
   ============================================================ */
const Ease = {
  linear: p => p,
  cubicOut: p => 1 - Math.pow(1 - p, 3),
  quintOut: p => 1 - Math.pow(1 - p, 5),
  expoOut: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  cubicInOut: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  backOut: (p, k = .5) => { const s = 1.1 + 1.8 * k, q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; },
  spring: (p, k = .5) => p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * Math.PI * (2.5 + 2.2 * k)),
};
function easeIn(name, q, I) { return (Ease[name] || Ease.linear)(clamp(q), I); }
function easeOutPhase(name, q, I) {
  // saída: começa devagar e acelera (espelho da curva de entrada, sem mola)
  const n = (name === 'spring' || name === 'backOut') ? 'cubicOut' : name;
  return (Ease[n] || Ease.linear)(clamp(1 - q), I);
}
function unitP(p, i, n, s) {
  if (n <= 1 || s <= 0) return clamp(p);
  const start = (i / (n - 1)) * s;
  return clamp((p - start) / (1 - s));
}

/* ============================================================
   Presets
   ============================================================ */
const TP = { // texto
  rise:      {label:'Sobe letra a letra', unit:'char', s:.55, ease:'expoOut', dur:1.1, fn:({e,p,I,size,dir})=>({dy:(1-e)*size*(.35+.6*I)*dir, a:clamp(p*3)})},
  springWord:{label:'Mola por palavra', unit:'word', s:.5, ease:'spring', dur:1.2, fn:({e,p,I,size,dir})=>({sc:.35+.65*e, dy:(1-e)*size*.35*I*dir, a:clamp(p*4)})},
  lineMask:  {label:'Máscara por linha', unit:'line', s:.35, ease:'quintOut', dur:1.1, fn:({e,maskH,dir})=>({dy:(1-e)*maskH*dir, clip:true})},
  blurChar:  {label:'Desfoque orgânico', unit:'char', s:.6, ease:'cubicOut', dur:1.3, fn:({e,I})=>({blur:(1-e)*(6+20*I), sc:1+(1-e)*.4*I, a:clamp(e*1.2)})},
  wave:      {label:'Onda suave', unit:'char', s:.65, ease:'backOut', dur:1.2, fn:({e,p,size,dir})=>({dy:(1-e)*size*.5*dir, sc:.6+.4*e, a:clamp(p*3)})},
  stamp:     {label:'Carimbo', unit:'word', s:.55, ease:'expoOut', dur:.9, fn:({e,p,I,i})=>({sc:1+(1-e)*(1.2+1.5*I), rot:(1-e)*.15*(i%2?1:-1), a:clamp(p*5)})},
  highlight: {label:'Marca-texto', unit:'line', s:.3, ease:'cubicOut', dur:1.3, fn:({p,size,dir})=>({bar:Ease.cubicInOut(clamp(p/.6)), a:clamp((p-.3)/.5), dy:(1-clamp((p-.3)/.7))*size*.15*dir})},
  type:      {label:'Máquina de escrever', unit:'char', s:.97, ease:'linear', dur:1.4, cursor:true, fn:({p})=>({a:p>0?1:0})},
  track:     {label:'Espaçamento abre', unit:'all', s:0, ease:'quintOut', dur:1.3, fn:({e,p,I,size})=>({track:(1-e)*size*(.2+.6*I), a:clamp(p*1.8), blur:(1-e)*8})},
  drop:      {label:'Queda com giro', unit:'char', s:.5, ease:'spring', dur:1.3, fn:({e,p,I,size,dir,i})=>({dy:-(1-e)*size*(.6+.8*I)*dir, rot:(1-e)*(i%2?1:-1)*.5*I, a:clamp(p*3)})},
  elastic:   {label:'Estica e volta', unit:'char', s:.45, ease:'spring', dur:1.2, pivot:'base', fn:({e,p,I})=>({sy:Math.max(0,e), sx:1+(1-e)*.35*I, a:clamp(p*4)})},
  flip:      {label:'Vira no eixo', unit:'char', s:.5, ease:'backOut', dur:1.1, fn:({e,p})=>({sy:Math.cos((1-e)*Math.PI/2), a:clamp(p*3)})},
  scramble:  {label:'Embaralhar', unit:'char', s:.6, ease:'linear', dur:1.2, fn:({p})=>({scr:p<1, a:clamp(p*3)})},
  glitch:    {label:'Falha digital', unit:'line', s:.3, ease:'linear', dur:.9, fn:({p,I,size,i,seed})=>p>=1?{}:({dx:(rand(seed,i)-.5)*size*(.2+.8*I)*(1-p), a:rand(seed,i+7)<(.35+p*.65)?1:.15, split:(1-p)*size*.07})},
  zoom:      {label:'Zoom de câmera', unit:'all', s:0, ease:'expoOut', dur:1.0, fn:({e,p,I})=>({sc:1+(1-e)*(.25+.8*I), blur:(1-e)*16, a:clamp(p*2.2)})},
  slideWord: {label:'Desliza por palavra', unit:'word', s:.45, ease:'expoOut', dur:1.1, fn:({e,p,I,size,dir,sax,ssg})=>{ const m=(1-e)*size*(.6+1.2*I)*(ssg??1)*dir, o={a:clamp(p*2.5)}; if(sax==='y')o.dy=m; else o.dx=m; return o; }},
  slideAlt:  {label:'Linhas alternadas', unit:'line', s:.2, ease:'expoOut', dur:1.1, fn:({e,p,i,W,H,dir,I,sax,ssg})=>{ const m=(1-e)*(sax==='y'?H:W)*(.3+.5*I)*(i%2?1:-1)*(ssg??1)*dir, o={blur:(1-e)*12, a:clamp(p*2)}; if(sax==='y')o.dy=m; else o.dx=m; return o; }},
  counter:   {label:'Contador', unit:'all', s:0, ease:'expoOut', dur:1.3, counter:true, fn:({e,p})=>({count:e, a:clamp(p*4)})},
  fade:      {label:'Fade', unit:'all', s:0, ease:'cubicOut', dur:.8, fn:({e})=>({a:e, dy:(1-e)*8})},
  cut:       {label:'Sem animação', unit:'all', s:0, ease:'linear', dur:0, fn:()=>({})},
};
const TEXT_IN  = ['cut','rise','springWord','lineMask','blurChar','wave','stamp','highlight','type','track','drop','elastic','flip','scramble','glitch','zoom','slideWord','slideAlt','counter','fade'];
const TEXT_OUT = ['cut','fade','rise','lineMask','blurChar','zoom','track','slideWord','slideAlt','glitch','scramble','drop','highlight'];

/* Direção dos presets de deslizar (slide, slideWord, slideAlt): 4 opções, por fase (entrada e saída).
   Código = de onde o elemento vem: L (esquerda→direita), R (direita→esquerda), T (cima→baixo), B (baixo→cima).
   sax = eixo do movimento; ssg = sinal do deslocamento inicial (onde a unidade começa em relação ao repouso). */
const SLIDE_DIRS = { L:{ sax:'x', ssg:-1 }, R:{ sax:'x', ssg:1 }, T:{ sax:'y', ssg:-1 }, B:{ sax:'y', ssg:1 } };
const SLIDE_DEF = { slide:'L', slideWord:'R', slideAlt:'R' }; // padrão que mantém o visual dos arquivos antigos
function slideOf(L, mode) {
  const key = mode === 'out' ? L.out : L.in;
  if (!(key in SLIDE_DEF)) return null;
  const code = (mode === 'out' ? L.outSlide : L.inSlide) || SLIDE_DEF[key];
  return SLIDE_DIRS[code] || SLIDE_DIRS[SLIDE_DEF[key]];
}

const BP = { // blocos: logo, botão, imagem
  draw:    {label:'Desenhar traço', svg:true, shape:true, special:true, dur:2.4},
  assemble:{label:'Montar peças', svg:true, special:true, dur:1.8},
  handwrite:{label:'Escrever letra a letra', pen:true, special:true, dur:3.2},
  line:    {label:'Linha e revela', ease:'linear', dur:1.5, fn:({p})=>p>=1?{}:({line:p})},
  spring:  {label:'Mola', ease:'spring', dur:1.0, fn:({e,p,I})=>({sc:Math.max(0,e), rot:(1-e)*-.25*I, a:clamp(p*4)})},
  pop:     {label:'Pulo', ease:'spring', dur:1.0, fn:({e,p,h,dir})=>({dy:(1-e)*h*.6*dir, sc:.6+.4*e, a:clamp(p*4)})},
  drop:    {label:'Cai e quica', ease:'spring', dur:1.2, fn:({e,p,h,dir})=>({dy:-(1-e)*h*2.2*dir, a:clamp(p*5)})},
  spin:    {label:'Giro', ease:'expoOut', dur:1.1, fn:({e,p,I})=>({rot:(1-e)*Math.PI*(1+I), sc:Math.max(0,e), a:clamp(p*3)})},
  flip:    {label:'Vira', ease:'backOut', dur:1.0, fn:({e,p})=>({sx:Math.cos((1-e)*Math.PI/2), a:clamp(p*3)})},
  slide:   {label:'Desliza', ease:'expoOut', dur:1.0, fn:({e,p,I,W,H,dir,sax,ssg})=>{ const m=(1-e)*(sax==='y'?H:W)*(.3+.4*I)*(ssg??-1)*dir, o={blur:(1-e)*14*I, a:clamp(p*2)}; if(sax==='y')o.dy=m; else o.dx=m; return o; }},
  rise:    {label:'Sobe com máscara', ease:'quintOut', dur:1.0, fn:({e,h,dir})=>({cdy:(1-e)*h*1.08*dir, clip:'bounds'})},
  blur:    {label:'Desfoque', ease:'cubicOut', dur:1.0, fn:({e,p,I})=>({blur:(1-e)*(10+26*I), sc:1+(1-e)*.3*I, a:clamp(p*1.5)})},
  circle:  {label:'Revelação circular', ease:'cubicInOut', dur:1.1, fn:({e,I})=>({clip:'circle', ce:e, sc:1+(1-e)*.15*I})},
  wipe:    {label:'Cortina', ease:'cubicInOut', dur:1.0, fn:({e,dir})=>({clip:'wipe', ce:e, cdir:dir})},
  fade:    {label:'Fade', ease:'cubicOut', dur:.8, fn:({e})=>({a:e, sc:1+(1-e)*.04})},
  cut:     {label:'Sem animação', ease:'linear', dur:0, fn:()=>({})},
};
const BLOCK_IN = { logo:['cut','handwrite','draw','assemble','line','spring','pop','drop','spin','flip','slide','rise','blur','circle','wipe','fade'],
                   cta:['cut','pop','spring','drop','flip','slide','rise','blur','circle','wipe','line','fade'],
                   image:['cut','circle','wipe','rise','blur','pop','spring','slide','flip','line','fade'],
                   shape:['cut','draw','pop','spring','circle','wipe','rise','drop','spin','flip','slide','blur','fade'] };
const BLOCK_OUT = { logo:['cut','fade','blur','handwrite','draw','rise','wipe','circle','spring','spin','slide'],
                    cta:['cut','fade','blur','rise','wipe','spring','slide'],
                    image:['cut','fade','blur','rise','wipe','circle','slide'],
                    shape:['cut','fade','draw','blur','rise','wipe','circle','spring','spin','slide'] };

/* Presets compartilhados: o que o texto faz como um todo vale para logo, botão, imagem e forma, e vice-versa.
   Só entram os que fazem sentido sem letras (nada de máquina de escrever, embaralhar, contador, marca-texto, espaçamento). */
const TEXT_TO_BLOCK = { springWord:'Mola com queda', blurChar:'Desfoque orgânico', wave:'Onda suave', stamp:'Carimbo', elastic:'Estica e volta', slideWord:'Desliza curto', slideAlt:'Desliza e desfoca', glitch:'Falha digital', zoom:'Zoom de câmera' };
const BLOCK_TO_TEXT = ['spring','pop','spin','slide','blur','circle','wipe'];
for (const k in TEXT_TO_BLOCK) {
  const T = TP[k];
  BP[k] = { label:TEXT_TO_BLOCK[k], ease:T.ease, dur:T.dur, fn:a => T.fn({ ...a, size:Math.min(a.h, a.w * .5) * .5, lineH:a.h, maskH:a.h, i:0, n:1 }) };
}
for (const k of BLOCK_TO_TEXT) {
  const B = BP[k];
  TP[k] = { label:B.label, unit:'all', s:0, ease:B.ease, dur:B.dur, fn:a => B.fn({ ...a, w:a.bw, h:a.bh }) };
}
const BLOCK_SHARED_IN = ['springWord','blurChar','wave','stamp','elastic','slideWord','slideAlt','glitch','zoom'];
const BLOCK_SHARED_OUT = ['zoom','slideWord','slideAlt','glitch'];
for (const t in BLOCK_IN) {
  BLOCK_IN[t].push(...BLOCK_SHARED_IN.filter(k => !BLOCK_IN[t].includes(k)));
  BLOCK_OUT[t].push(...BLOCK_SHARED_OUT.filter(k => !BLOCK_OUT[t].includes(k)));
}
TEXT_IN.push(...BLOCK_TO_TEXT);
TEXT_OUT.push('blur','slide','wipe','circle','spring','spin');

/* ------------ presets universais ------------
   Escritos uma vez e usados por texto, logo (SVG ou PNG), botão, imagem e forma (entrada e saída).
   O fn recebe { e, p, I, dir, i, n, seed, W, H, uh } (uh = meia altura da unidade: letra, palavra, linha ou o bloco inteiro)
   e, além do estado de sempre, pode devolver (tudo desenhado por drawState e rasterFx, na seção Efeitos):
   - kx: inclinação; bright: brilho (filtro); glow: luz que vaza da própria cor.
   - clip: 'blinds' | 'diag' | 'diamond' | 'clock' | 'ink' | 'scan' (ce = progresso com curva, cp = linear, edge = linha na frente do corte).
   - fx: 'slices' | 'pixel' | 'dust' | 'tiles' | 'rgb' | 'liquid' | 'persp' | 'glitch': o elemento vira imagem e é redesenhado em pedaços
     (fp = progresso linear, fe = com curva, fI = intensidade, fdir = 1 entrando e -1 saindo, para a saída continuar o movimento).
   whole: no texto, anima o bloco inteiro de uma vez (recortes e efeitos de imagem). trail: cópias atrasadas (rastro) enquanto se move.
   pivot: 'base' ou 'top' (gira e estica a partir da base ou do topo da unidade). */
// balanço de dobradiça: 1 (aberto) → passa um pouco do ponto → 0; a intensidade dá mais balanço
const hingeSwing = (p, I) => Math.exp(-2.2 * p) * Math.cos(p * Math.PI * (1 + .7 * I)) * Math.pow(1 - p, .6);
const SP = {
  // movimento
  whip:   { label:'Chicote', cat:'mov', unit:'word', s:.3, ease:'expoOut', dur:.9, trail:{ n:4, lag:.035 },
            fn:({e,p,I,dir,W}) => { const v = 1 - e, wob = Math.sin(p * 13) * (1 - p) * (1 - p) * .2 * I;
              return { dx:-v * W * (.35 + .45 * I) * dir, kx:-v * (.3 + .5 * I) + wob, sx:1 + v * (.2 + .35 * I), a:clamp(p * 3) }; } },
  jelly:  { label:'Gelatina', cat:'mov', unit:'char', s:.5, ease:'linear', dur:1.4, pivot:'base',
            fn:({p,I,uh,H}) => {
              const t1 = .3; // cai esticada, bate, amassa e treme até parar
              if (p < t1) { const q = p / t1; return { dy:-(1 - q * q) * (uh * 3 + H * .1) * (.6 + I), sy:1 + .3 * q * (.4 + I), sx:1 - .12 * q * (.4 + I), a:clamp(q * 4) }; }
              const q = (p - t1) / (1 - t1), d = Math.exp(-4 * q) * (1 - q) * Math.cos(q * Math.PI * (4 + 2 * I)) * (.28 + .32 * I);
              return { sy:1 - d, sx:1 + d * .8 };
            } },
  swing:  { label:'Pêndulo', cat:'mov', unit:'char', s:.45, ease:'linear', dur:1.5, pivot:'top',
            fn:({p,I}) => ({ rot:(.7 + .9 * I) * Math.exp(-3 * p) * (1 - p) * Math.cos(p * Math.PI * (3 + I)), a:clamp(p * 5) }) },
  roll:   { label:'Rolar', cat:'mov', unit:'char', s:.7, ease:'cubicOut', dur:1.5, // rola como roda (o giro acompanha a distância), chega e sai pela direita
            fn:({e,p,I,uh}) => { const r = Math.max(uh, 12), dx = (1 - e) * TAU * r * (.5 + .7 * I); return { dx, rot:dx / r, a:clamp(p * 4) }; } },
  warp:   { label:'Hiperespaço', cat:'mov', unit:'all', s:0, ease:'expoOut', dur:1.1, trail:{ n:5, lag:.04 },
            fn:({e,p,I}) => ({ sc:1 + (1 - e) * (1.6 + 3 * I), blur:(1 - e) * 10, a:clamp(p * 2.5) }) },
  // 3D de verdade: o elemento vira imagem e cada fatia é desenhada com perspectiva
  door:   { label:'Porta 3D', cat:'3d', unit:'all', whole:true, ease:'linear', dur:1.5,
            fn:({p,I,dir}) => p >= 1 ? {} : ({ fx:'persp', fax:'y', fhinge:-1, fang:-hingeSwing(p, I) * 1.45 * dir, a:clamp(p * 4) }) },
  tilt:   { label:'Tombar 3D', cat:'3d', unit:'all', whole:true, ease:'linear', dur:1.5,
            fn:({p,I,dir}) => p >= 1 ? {} : ({ fx:'persp', fax:'x', fhinge:1, fang:-hingeSwing(p, I) * 1.45 * dir, a:clamp(p * 4) }) },
  coin:   { label:'Moeda 3D', cat:'3d', unit:'all', whole:true, ease:'expoOut', dur:1.4,
            fn:({e,p,I,dir}) => p >= 1 ? {} : ({ fx:'persp', fax:'y', fhinge:0, fang:(1 - e) * TAU * (1 + Math.round(I)) * dir, sc:1 + (1 - e) * .15, a:clamp(p * 3) }) },
  // revelações
  blinds: { label:'Persianas', cat:'rev', unit:'all', whole:true, ease:'cubicInOut', dur:1.2,
            fn:({p,I}) => p >= 1 ? {} : ({ clip:'blinds', cp:p, cn:Math.round(4 + 8 * I) }) },
  slices: { label:'Fatias', cat:'rev', unit:'all', whole:true, ease:'expoOut', dur:1.2,
            fn:({p,I,dir}) => p >= 1 ? {} : ({ fx:'slices', fp:p, fI:I, fcount:Math.round(2 + 7 * I), fdir:dir }) },
  diag:   { label:'Corte diagonal', cat:'rev', unit:'all', whole:true, ease:'cubicInOut', dur:1.1,
            fn:({e,p,dir}) => p >= 1 ? {} : ({ clip:'diag', ce:e, cdir:dir, edge:true }) },
  diamond:{ label:'Losango', cat:'rev', unit:'all', whole:true, ease:'expoOut', dur:1.1,
            fn:({e,p,I}) => p >= 1 ? {} : ({ clip:'diamond', ce:e, sc:1 + (1 - e) * .15 * I }) },
  clock:  { label:'Relógio', cat:'rev', unit:'all', whole:true, ease:'cubicInOut', dur:1.2,
            fn:({e,p,dir}) => p >= 1 ? {} : ({ clip:'clock', ce:e, cdir:dir }) },
  ink:    { label:'Mancha de tinta', cat:'rev', unit:'all', whole:true, ease:'linear', dur:1.6,
            fn:({p,I}) => p >= 1 ? {} : ({ clip:'ink', cp:p, cI:I }) },
  scan:   { label:'Scanner', cat:'rev', unit:'all', whole:true, ease:'cubicInOut', dur:1.2,
            fn:({e,p,dir}) => p >= 1 ? {} : ({ clip:'scan', ce:e, cdir:dir, edge:true, bright:1 + (1 - e) * .5 }) },
  // efeitos
  flash:  { label:'Flash de luz', cat:'fx', unit:'char', s:.45, ease:'cubicOut', dur:1.1,
            fn:({e,p,I}) => ({ bright:1 + (1 - e) * (1.5 + 2.5 * I), glow:(1 - e) * (.8 + .8 * I), blur:(1 - e) * (3 + 8 * I), sc:1 + (1 - e) * .06, a:clamp(p * 4) }) },
  neon:   { label:'Neon', cat:'fx', unit:'char', s:.55, ease:'linear', dur:1.4,
            fn:({p,I,i,seed}) => { // acende piscando, como lâmpada velha; quanto mais perto do fim, mais tempo acesa
              if (p >= 1) return {}; if (p <= 0) return { a:0 };
              const on = p > .8 || rand(seed + i * 13, i + 5) < .12 + p * 1.1;
              return { a:on ? 1 : .1, glow:on ? (.6 + .9 * I) * (1 - p) : 0 }; } },
  rgb:    { label:'Aberração RGB', cat:'fx', unit:'all', whole:true, ease:'expoOut', dur:1.0,
            fn:({e,p,I,seed}) => p >= 1 ? {} : ({ fx:'rgb', fe:e, fI:I, fseed:seed, sc:1 + (1 - e) * .1 * I, a:clamp(p * 4) }) },
  pixel:  { label:'Pixels', cat:'fx', unit:'all', whole:true, ease:'cubicOut', dur:1.2,
            fn:({e,p,I}) => p >= 1 ? {} : ({ fx:'pixel', fe:e, fI:I, a:clamp(p * 3) }) },
  dust:   { label:'Poeira', cat:'fx', unit:'all', whole:true, ease:'linear', dur:1.8,
            fn:({p,I,dir}) => p >= 1 ? {} : ({ fx:'dust', fp:p, fI:I, fdir:dir }) },
  tiles:  { label:'Mosaico', cat:'fx', unit:'all', whole:true, ease:'linear', dur:1.3,
            fn:({p,I,dir}) => p >= 1 ? {} : ({ fx:'tiles', fp:p, fI:I, fdir:dir }) },
  liquid: { label:'Líquido', cat:'fx', unit:'all', whole:true, ease:'cubicOut', dur:1.5,
            fn:({e,p,I}) => p >= 1 ? {} : ({ fx:'liquid', fe:e, fp:p, fI:I, blur:(1 - e) * 5 * I, a:clamp(p * 2.5) }) },
};
for (const k in SP) {
  const D = SP[k], unit = D.unit || 'all';
  const com = { label:D.label, cat:D.cat, ease:D.ease, dur:D.dur, pivot:D.pivot, trail:D.trail, whole:D.whole };
  TP[k] = { ...com, unit, s:D.s || 0, fn:a => D.fn({ ...a, H:H(), uh:unit === 'all' ? a.bh / 2 : a.size * .42 }) };
  BP[k] = { ...com, fn:a => D.fn({ ...a, H:H(), i:0, n:1, uh:a.h / 2 }) };
}
// "Linha e revela" também no texto e na forma
TP.line = { label:BP.line.label, unit:'all', s:0, ease:'linear', dur:BP.line.dur, whole:true, fn:BP.line.fn };
const SP_KEYS = ['line', ...Object.keys(SP)];
for (const L of [TEXT_IN, TEXT_OUT, ...Object.values(BLOCK_IN), ...Object.values(BLOCK_OUT)]) L.push(...SP_KEYS.filter(k => !L.includes(k)));

/* categorias, só para organizar a grade de presets */
const CATS = [['', ''], ['pen', 'Traço'], ['mov', 'Movimento'], ['rev', 'Revelação'], ['3d', '3D'], ['fx', 'Efeitos'], ['txt', 'Só texto']];
Object.entries({ rise:'mov', springWord:'mov', lineMask:'rev', blurChar:'fx', wave:'mov', stamp:'mov', highlight:'txt', type:'txt', track:'txt', drop:'mov', elastic:'mov', flip:'3d',
  scramble:'txt', glitch:'fx', zoom:'mov', slideWord:'mov', slideAlt:'mov', counter:'txt', fade:'mov', line:'rev' }).forEach(([k, c]) => TP[k].cat = c);
Object.entries({ draw:'pen', assemble:'pen', handwrite:'pen', line:'rev', spring:'mov', pop:'mov', drop:'mov', spin:'mov', flip:'3d', slide:'mov', rise:'rev', blur:'fx',
  circle:'rev', wipe:'rev', fade:'mov' }).forEach(([k, c]) => BP[k].cat = c);
for (const k in TEXT_TO_BLOCK) BP[k].cat ||= TP[k].cat;
for (const k of BLOCK_TO_TEXT) TP[k].cat ||= BP[k].cat;

const IDLE = { none:'Sem animação', float:'Flutuar', breathe:'Respirar', sway:'Balançar', shine:'Brilho', pulse:'Pulsar', spin:'Girar',
               float3d:'Flutuar 3D', bounce:'Quicar', wiggle:'Tremer', glow:'Neon', glitch:'Interferência' };
const IDLE_BY = { text:['none','float','breathe','sway','pulse'], logo:['none','shine','breathe','float','sway','pulse'], cta:['none','pulse','shine','breathe','sway','float'], image:['none','float','breathe','sway','shine','pulse'],
                 shape:['none','float','breathe','sway','spin','pulse','shine'] };
for (const t in IDLE_BY) IDLE_BY[t].push(...['shine','float3d','bounce','wiggle','glow','glitch','spin'].filter(k => !IDLE_BY[t].includes(k)));
const SHAPE_KINDS = { rect:'Retângulo', ellipse:'Círculo', triangle:'Triângulo', polygon:'Polígono', star:'Estrela', line:'Linha', custom:'Vetor' };
const BG_MODES = { mesh:'Gradiente vivo', linear:'Linear girando', spot:'Holofote', solid:'Sólido', image:'Imagem' };

const FORMATS = { '1x1':{w:1080,h:1080,label:'1:1'}, '4x5':{w:1080,h:1350,label:'4:5'}, '3x4':{w:1080,h:1440,label:'3:4'}, '9x16':{w:1080,h:1920,label:'9:16'} };
const FPS_OPTS = [24, 25, 30, 50, 60];
const fps = () => (S && FPS_OPTS.includes(S.fps) ? S.fps : 30);
const TYPE_LABEL = { bg:'Fundo', text:'Texto', logo:'Logo', cta:'Botão', image:'Imagem', video:'Vídeo', svg:'SVG', shape:'Forma', camera:'Câmera', fx:'Transição' };
const typeKey = L => L.type === 'image' && L.video ? 'video' : L.type === 'logo' && L.svg ? 'svg' : L.type;
const TYPE_COLOR = { bg:'var(--c-bg)', text:'var(--c-text)', logo:'var(--c-logo)', cta:'var(--c-cta)', image:'var(--c-image)', video:'var(--c-video)', svg:'var(--c-svg)', shape:'var(--c-shape)', camera:'var(--c-camera)', fx:'var(--c-fx)' };
const ROLE_NAME = { logo:'Logo', logoSmall:'Logo pequeno', brand:'Nome da marca', title:'Título', sub:'Subtítulo', cta:'Botão', big:'Número grande', offer:'Oferta', tag:'Etiqueta', kicker:'Chamada', k1:'Frase 1', k2:'Frase 2', k3:'Frase 3', image:'Imagem', bg:'Fundo' };
const ROLE_TEXT = { brand:'GRÃO LENTO', title:'Café de verdade,\nsem pressa.', sub:'Torra artesanal na sua porta em 24h', cta:'Peça agora  →', big:'-30%', offer:'na primeira assinatura', tag:'Só até domingo', kicker:'LANÇAMENTO', k1:'Moído na hora.', k2:'Torrado ontem.', k3:'Na sua porta amanhã.' };
const GOOGLE_SUGGEST = ['Urbanist','Inter Tight','Roboto','Open Sans','Lato','Nunito','Nunito Sans','Raleway','Work Sans','Mulish','Karla','Barlow','Barlow Condensed','Josefin Sans','Quicksand','Kanit','Prompt','Jost','Albert Sans','Be Vietnam Pro','Public Sans','IBM Plex Sans','IBM Plex Serif','Libre Franklin','Merriweather','Lora','EB Garamond','Crimson Pro','Source Serif 4','Noto Sans','Noto Serif','Playfair','Abril Fatface','Alfa Slab One','Space Mono','JetBrains Mono','Fraunces','Manrope','Unbounded','Bricolage Grotesque','Syne','Sora','Outfit','Plus Jakarta Sans','DM Sans','DM Serif Display','Instrument Serif','Instrument Sans','Space Grotesk','Archivo','Archivo Black','Anton','Bebas Neue','Oswald','Montserrat','Poppins','Inter','Figtree','Onest','Rubik','Geist','Hanken Grotesk','Schibsted Grotesk','Familjen Grotesk','Big Shoulders Display','Bodoni Moda','Playfair Display','Cormorant Garamond','Gloock','Caveat','Permanent Marker','Lexend','Red Hat Display','Chivo','Darker Grotesque','Krona One','Dela Gothic One','Rethink Sans','Epilogue','Young Serif','Libre Caslon Display','Shrikhand','Righteous','Bowlby One','Lilita One'];

const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<circle cx="120" cy="120" r="104" fill="none" stroke="#F4EDE1" stroke-width="8"/>
<path d="M70 118 H170 V126 C170 158 150 178 120 178 C90 178 70 158 70 126 Z" fill="#F4EDE1"/>
<path d="M170 132 C192 132 194 160 168 162" fill="none" stroke="#F4EDE1" stroke-width="8" stroke-linecap="round"/>
<path d="M98 102 C90 90 106 82 98 66" fill="none" stroke="#D98E4A" stroke-width="7" stroke-linecap="round"/>
<path d="M120 98 C112 84 130 74 120 54" fill="none" stroke="#D98E4A" stroke-width="7" stroke-linecap="round"/>
<path d="M142 102 C134 90 150 82 142 66" fill="none" stroke="#D98E4A" stroke-width="7" stroke-linecap="round"/>
<path d="M58 192 H182" fill="none" stroke="#D98E4A" stroke-width="6" stroke-linecap="round"/>
</svg>`;

/* ============================================================
   Estado
   ============================================================ */
let S;                     // projeto
let T = 0, playing = false, needs = true;
const RT = { logo:null, images:new Map(), layout:new Map(), fontsOk:new Set(), fontsBad:new Set(), selected:null, dirtyUndo:false, exporting:false, drag:null, guide:null,
  rev:0, gRev:0, imgRev:0, gBox:new Map(), noGrp:false }; // rev: sobe a cada mudança (caixa dos grupos); gRev: sobe a cada movimento do mouse num arrasto; noGrp: ao medir posições de repouso o grupo não se anima
const undoStack = [];

function defaultBrand() {
  return { colors:['#2B1D16','#F4EDE1','#D98E4A','#7A3E1D','#140E0B'], fonts:['Fraunces','Manrope','Unbounded'],
           loaded:[{family:'Fraunces',src:'google'},{family:'Manrope',src:'google'},{family:'Unbounded',src:'google'}],
           logo:{kind:'svg', text:DEMO_SVG, name:'exemplo.svg'} };
}
/* ------------ margem ------------
   Texto, logo e botão param sempre dentro dela (a posição de repouso é empurrada para dentro e,
   se não couber, o elemento encolhe). As animações de entrada/saída podem passar. Imagem e fundo ficam livres, a não ser que a imagem tenha `keepIn` ("Manter dentro da margem", `freeType`). */
function marginSides() {
  const m = S.margin || {}, d = m.px ?? 64, v = k => Math.max(0, m[k] ?? d);
  return { on:!!m.on, top:v('top'), right:v('right'), bottom:v('bottom'), left:v('left') };
}
/* ------------ carrossel ------------
   S.slides = quantos slides lado a lado (ausente = 1, quadro normal). Cada slide tem o tamanho do formato e o quadro inteiro
   é a soma deles (FW). x vai de 0 a N em larguras de slide, então tamanhos (fração da largura) continuam sendo do slide e mudar
   o número de slides não mexe em nada. Os elementos podem atravessar de um slide para o outro (carrossel emendado); a margem,
   o alinhamento ao quadro e os layouts automáticos valem por slide; a exportação sai um arquivo por slide. */
const SLIDES_MAX = 10;
const slides = () => (S && S.slides > 1 ? Math.min(SLIDES_MAX, Math.round(S.slides)) : 1);
function FW() { return W() * slides(); }
const slideAt = px => clamp(Math.floor(px / W()), 0, slides() - 1); // slide de um ponto (px do quadro inteiro)
const slideShift = (B, s) => (B && s ? { ...B, x0:B.x0 + s * W(), x1:B.x1 + s * W() } : B);
// margem do slide em que fica px; sem margem, o próprio slide
const marginAt = (px, fmt) => marginBox(fmt, slideAt(px));
const areaAt = (px, fmt = S.format) => marginAt(px, fmt) || slideShift({ x0:0, y0:0, x1:W(), y1:FORMATS[fmt].h }, slideAt(px));
function marginBox(fmt = S.format, si = 0) {
  const m = marginSides(); if (!m.on) return null;
  const w = FORMATS[fmt].w, hh = FORMATS[fmt].h;
  const x0 = Math.min(m.left, w - 1), y0 = Math.min(m.top, hh - 1);
  return slideShift({ x0, y0, x1:Math.max(x0 + 1, w - m.right), y1:Math.max(y0 + 1, hh - m.bottom) }, si);
}
function fitInMargin(ax, ay, w, h, fmt) {
  const M = marginAt(ax, fmt); if (!M) return { ax, ay, k:1 };
  const aw = Math.max(1, M.x1 - M.x0), ah = Math.max(1, M.y1 - M.y0), k = Math.min(1, aw / Math.max(w, 1), ah / Math.max(h, 1));
  const hw = w * k / 2, hh = h * k / 2;
  return { ax:clamp(ax, M.x0 + hw, M.x1 - hw), ay:clamp(ay, M.y0 + hh, M.y1 - hh), k };
}
function W() { return FORMATS[S.format].w; }
function H() { return FORMATS[S.format].h; }

/* ------------ outros formatos: reorganização automática ------------
   x/y valem no formato principal (`baseFmt`: S.base, o formato em que o arquivo ganhou o primeiro elemento; arquivo antigo
   fica com o que estava aberto). Nos outros, `adaptLayout` refaz a diagramação na vertical (a largura é 1080 em todos):
   - os blocos (texto, logo, botão, imagem e forma soltos) não mudam de tamanho; só os vãos entre eles esticam ou encolhem,
     e vão pequeno quase não muda (peso g³/(g²+τ²)): título e subtítulo continuam juntos, o que encosta na margem continua
     encostado, o que estava centralizado continua centralizado.
   - foto ou forma em retângulo sozinha na sua altura muda a altura da máscara junto com os vãos (a imagem cobre, não distorce):
     mais baixa, alarga até as margens laterais; com sobra, fica mais alta. Se ainda não couber, imagem e forma diminuem e só
     por último texto, logo e botão (pedido do usuário). Quem muda de largura fica apoiado na mesma borda (anchorX).
   - blocos que se sobrepõem na vertical (mesmo em momentos diferentes) andam juntos: nada passa a se sobrepor.
   - a faixa útil é a margem em todos os formatos. O 9:16 não foge da interface do Stories sozinho (decisão do usuário:
     no exemplo dele a marca fica no topo e a foto ocupa o resto); o destaque "Zona segura 9:16" continua para conferir.
   - imagem e forma que sangram pela borda do quadro ficam presas nela; retângulo (máscara ou forma) estica a borda de dentro
     junto com o layout e o que cobre o quadro inteiro continua cobrindo (hh = nova altura, px).
   Mover ou redimensionar no palco num formato que não é o principal grava só nele (`L.fpos[formato]`); "Voltar ao automático" apaga.
   Ler a posição com `posOf`/`placeOf` e escrever com `setPos` (no principal, mexem em x/y). */
const GAP_TAU = 80; // px: vão bem menor que isso conta como "junto" e quase não estica
const baseFmt = () => (FORMATS[S.base] ? S.base : S.format);
const hasContent = () => S.layers.some(l => l.type !== 'bg' && !NOBOX(l));
// faixa vertical onde o conteúdo fica: a margem (sem margem, o quadro)
function contentBand(fmt) {
  const M = marginBox(fmt), hh = FORMATS[fmt].h;
  return M ? { y0:M.y0, y1:M.y1 } : { y0:0, y1:hh };
}
// caixa de repouso de uma camada num formato, sem desenhar (px; centro já empurrado para dentro da margem)
function restBoxIn(L, fmt) {
  let w, hh;
  if (L.type === 'text') { const lay = layoutText(L, L.upper ? L.text.toUpperCase() : L.text); w = lay.blockW; hh = lay.blockH; }
  else { const G = blockGeom(L); if (!G) return null; w = G.w; hh = G.h; }
  const Hf = FORMATS[fmt].h, f = freeType(L) ? { ax:L.x * W(), ay:L.y * Hf, k:1 } : fitInMargin(L.x * W(), L.y * Hf, w, hh, fmt);
  const r = (L.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const ew = (w * c + hh * s) * f.k, eh = (w * s + hh * c) * f.k;
  return { cx:f.ax, cy:f.ay, t:f.ay - eh / 2, b:f.ay + eh / 2, l:f.ax - ew / 2, r:f.ax + ew / 2, hh:hh * f.k, fk:f.k };
}
// Map id → { x, y (frações do formato aberto), k (escala), ww/hh (tamanho novo da máscara em px, ou null) }
function adaptLayout() {
  const bf = baseFmt(), Hb = FORMATS[bf].h, Ht = H(), dH = Ht - Hb, all = [], out = new Map();
  for (const L of S.layers) {
    if (L.type === 'bg' || NOBOX(L)) continue;
    const r = restBoxIn(L, bf); if (!r) continue;
    const up = freeType(L) && r.t <= 1, dn = freeType(L) && r.b >= Hb - 1; // só imagem e forma sangram
    all.push({ L, ...r, hs:holdSpan(L), s0:slideAt(r.l + 1), s1:slideAt(r.r - 1), edge:up && dn ? 'cover' : up ? 'top' : dn ? 'bottom' : null,
      stretch:!L.rot && ((L.type === 'image' && L.mask === 'rect') || (L.type === 'shape' && L.kind === 'rect')) });
  }
  // grupo (sem layout automático) = uma composição só: entra nas contas como um bloco rígido e os itens andam e escalam juntos.
  // Sem isso um SVG importado (disco, anéis, cada letra = uma forma) se desmontava: cada forma era tratada como foto,
  // encolhia e se apoiava na margem sozinha. Grupo com foto ou com algo que sangra pela borda segue item por item.
  const units = new Map();
  for (const i of all) {
    const gid = i.L.grp && !inFlow(i.L) ? gtop(i.L.grp) : null; if (!gid) continue;
    if (!units.has(gid)) units.set(gid, []); units.get(gid).push(i);
  }
  for (const [gid, ms] of units) {
    if (ms.length < 2 || ms.some(i => i.edge || i.L.type === 'image' || i.s0 !== ms[0].s0 || i.s1 !== ms[0].s1)) { units.delete(gid); continue; }
    const t = Math.min(...ms.map(i => i.t)), b = Math.max(...ms.map(i => i.b)), l = Math.min(...ms.map(i => i.l)), r = Math.max(...ms.map(i => i.r));
    const U = { L:{ id:'g:' + gid, type:'group', visible:ms.some(i => i.L.visible), start:Math.min(...ms.map(i => i.L.start || 0)), end:Math.max(...ms.map(i => i.L.end ?? S.duration)) }, ms, t, b, l, r, cx:(l + r) / 2, cy:(t + b) / 2, hh:b - t, fk:1,
      hs:[Math.min(...ms.map(i => i.hs[0])), Math.max(...ms.map(i => i.hs[1]))], s0:ms[0].s0, s1:ms[0].s1, edge:null, stretch:false };
    for (const i of ms) all.splice(all.indexOf(i), 1);
    all.push(U); units.set(gid, U);
  }
  // cada camada se organiza só com quem aparece na tela junto com ela: cenas diferentes na mesma altura não se empurram
  // nem se espremem (a foto da cena 1 não comprime os textos da cena 2). Quem tem o mesmo conjunto faz a conta uma vez só
  // no carrossel, slides diferentes também não aparecem juntos (cada slide se organiza sozinho)
  const meets = (p, q) => { const [a0, a1] = p.hs, [b0, b1] = q.hs; return Math.min(a1, b1) - Math.max(a0, b0) > .01 && p.s0 <= q.s1 && q.s0 <= p.s1; };
  const groups = new Map();
  for (const i of all) {
    const set = all.filter(j => j === i || meets(i, j)), key = set.map(j => j.L.id).join(',');
    if (!groups.has(key)) groups.set(key, { set, want:[] });
    groups.get(key).want.push(i);
  }
  for (const g of groups.values()) solve(g.set, g.want);
  // texto, logo e botão que aparecem juntos e estão colados no principal (vão pequeno ou sobrepostos) andam como um bloco só:
  // com entradas e saídas diferentes eles podem ter caído em contas diferentes e se desencontrar ("Como funciona?" + título)
  const solid = all.filter(i => !i.edge && i.L.type !== 'image' && i.L.type !== 'shape' && out.has(i.L.id));
  const par = new Map(solid.map(i => [i, i])), root = i => { while (par.get(i) !== i) i = par.get(i); return i; };
  // peças lado a lado na mesma altura (símbolo + nome do logo) são uma composição só mesmo que as animações tenham tempos
  // diferentes (o "na tela" delas não se cruza): sem isso cada uma caía numa conta e saía numa altura
  const life = i => [i.L.start || 0, i.L.end ?? S.duration];
  const beside = (a, b) => { const [a0, a1] = life(a), [b0, b1] = life(b); return Math.min(a1, b1) - Math.max(a0, b0) > .01 && Math.max(a.t, b.t) < Math.min(a.b, b.b) && (a.r <= b.l + 2 || b.r <= a.l + 2) && a.s0 <= b.s1 && b.s0 <= a.s1; };
  for (const a of solid) for (const b of solid) {
    if (a === b || Math.max(a.t, b.t) - Math.min(a.b, b.b) >= GAP_TAU * .75 || !(meets(a, b) || beside(a, b))) continue;
    const ra = root(a), rb = root(b); if (ra !== rb) par.set(ra, rb);
  }
  const blocks = new Map();
  for (const i of solid) { const r = root(i); if (!blocks.has(r)) blocks.set(r, []); blocks.get(r).push(i); }
  for (const bl of blocks.values()) {
    if (bl.length < 2) continue;
    const rep = bl.reduce((p, q) => (q.b - q.t > p.b - p.t ? q : p)), pr = out.get(rep.L.id); // o maior manda
    for (const i of bl) if (i !== rep) { const p = out.get(i.L.id); p.y = (pr.y * Ht + (i.cy - rep.cy) * pr.k) / Ht; }
  }
  // o grupo volta para os itens: mesmo deslocamento e a mesma escala em torno do centro do conjunto
  for (const U of units.values()) {
    const p = out.get(U.L.id); out.delete(U.L.id); if (!p) continue;
    const gx = p.x * W(), gy = p.y * Ht;
    for (const i of U.ms) out.set(i.L.id, { x:(gx + (i.cx - U.cx) * p.k) / W(), y:(gy + (i.cy - U.cy) * p.k) / Ht, k:p.k, hh:null, ww:null });
  }
  return out;

  function solve(its, want) {
  // faixa útil do principal: cresce para caber o que estava fora dela (ex.: logo na faixa da interface, num 9:16)
  // a margem só segura quem a respeita: se o elemento de cima (ou de baixo) é imagem/forma sem "Manter dentro da margem",
  // a faixa útil daquele lado é a borda do quadro, não a margem (senão a foto era empurrada para dentro dela ao trocar de formato)
  const body = its.filter(i => !i.edge), seen = body.some(i => i.L.visible) ? body.filter(i => i.L.visible) : body;
  const isFree = i => i.ms ? i.ms.every(m => freeType(m.L)) : freeType(i.L);
  const topI = seen.reduce((p, q) => (!p || q.t < p.t ? q : p), null), botI = seen.reduce((p, q) => (!p || q.b > p.b ? q : p), null);
  const edges = (fmt, hf) => { const c = contentBand(fmt); return { y0:topI && isFree(topI) ? 0 : c.y0, y1:botI && isFree(botI) ? hf : c.y1 }; };
  const cb = edges(bf, Hb), ct = edges(S.format, Ht);
  const A = Math.min(cb.y0, ...body.map(i => i.t)), B = Math.max(cb.y1, ...body.map(i => i.b));
  const M0 = marginBox() || { x0:0, x1:W() }, Mw = M0.x1 - M0.x0; // na horizontal é igual em todos os formatos (e slides)
  const len = s => s.b - s.a, wt = g => g * g * g / (g * g + GAP_TAU * GAP_TAU), least = g => Math.min(g, 12 + g * .25);
  const pic = i => i.L.type === 'image' || i.L.type === 'shape';
  // o que se sobrepõe na vertical vira um trecho rígido só; imagem ou forma sozinha na sua altura pode mudar.
  // A fila de um layout automático com espaço em número também (o espaço entre os itens não estica nem encolhe)
  const fl = new Map();
  const fr = i => inFlow(i.L) ? flowRoot(i.L.grp) : null;
  for (const i of body) { const r = fr(i); if (r && !flowOf(r).auto) { const u = fl.get(r) || { t:i.t, b:i.b }; u.t = Math.min(u.t, i.t); u.b = Math.max(u.b, i.b); fl.set(r, u); } }
  const rt = i => (fl.get(fr(i)) || i).t, rb = i => (fl.get(fr(i)) || i).b;
  const runs = [];
  for (const i of body.filter(i => i.L.visible).sort((p, q) => rt(p) - rt(q))) {
    const r = runs[runs.length - 1];
    if (r && rt(i) <= r.b) { r.b = Math.max(r.b, rb(i)); r.its.push(i); } else runs.push({ a:rt(i), b:rb(i), its:[i] });
  }
  // a borda de dentro de uma faixa presa ao quadro (foto no topo, tarja embaixo) divide o vão: o que está colado nela continua colado
  const cuts = its.filter(i => i.edge === 'top' || i.edge === 'bottom').map(i => i.edge === 'top' ? i.b : i.t)
    .filter(v => v > A && v < B && !runs.some(r => v > r.a && v < r.b)).sort((p, q) => p - q);
  const segs = [], gap = (a, b) => { let s = a; for (const c of cuts) if (c > a && c < b) { segs.push({ a:s, b:c }); s = c; } segs.push({ a:s, b }); };
  let y = A;
  for (const r of runs) {
    gap(y, r.a);
    // a imagem ou forma que domina o trecho (metade da altura ou mais) pode mudar; texto por cima dela ou de outro momento acompanha
    const dp = r.its.filter(pic).sort((p, q) => (q.b - q.t) - (p.b - p.t))[0];
    if (dp && dp.b - dp.t >= (r.b - r.a) * .5) {
      const peers = r.its.filter(i => pic(i) && Math.abs(i.t - dp.t) < 12 && Math.abs(i.b - dp.b) < 12); // fotos lado a lado, mesma altura
      // alarga só se nada do trecho ficar ao lado dela (o que está por cima, dentro da largura dela, não atrapalha)
      const wide = peers.length === 1 && r.its.every(i => i === dp || (i.l >= dp.l - 1 && i.r <= dp.r + 1));
      if (dp.t > r.a) segs.push({ a:r.a, b:dp.t, run:true });
      segs.push({ a:dp.t, b:dp.b, run:true, pic:dp, peers, wide });
      if (dp.b < r.b) segs.push({ a:dp.b, b:r.b, run:true });
    } else segs.push({ a:r.a, b:r.b, run:true });
    y = r.b;
  }
  gap(y, B);
  // cada trecho tem um tamanho (n) que pode ir de lo a hi; os vãos grandes cedem ou ganham quase tudo (peso wt)
  const setUp = grow => segs.forEach(s => {
    const h = len(s); s.n = h; s.lo = s.hi = h; s.w = 0;
    if (!s.run) { s.lo = least(h); s.hi = Infinity; s.w = wt(h); }
    else if (s.pic && s.peers.every(p => p.stretch) && h >= 120) {
      // foto em retângulo: a máscara muda de altura (a imagem cobre, não distorce); mais baixa, alarga até a margem.
      // Na falta, divide com os vãos; na sobra, fica com quase toda (até 2× a altura)
      const w = s.pic.r - s.pic.l;
      s.crop = true; s.lo = Math.min(h, Math.max(h * .3, (s.wide ? Math.max(w, Mw) : w) / 2.4)); s.hi = Math.max(h, Math.min(h * 2, w * 1.6)); s.w = h * (grow ? 1.2 : .25);
    }
  });
  // distribui d (positivo: sobra; negativo: falta) entre os trechos, na proporção do peso e sem passar dos limites
  const fill = (rs, d) => {
    for (let g = 0; g < 40 && Math.abs(d) > .01; g++) {
      const act = rs.filter(s => d > 0 ? s.hi - s.n > .01 : s.n - s.lo > .01); if (!act.length) break;
      const Wt = act.reduce((n, s) => n + (s.w || 1e-6), 0); let used = 0;
      for (const s of act) { const q = Math.min(Math.abs(d) * (s.w || 1e-6) / Wt, d > 0 ? s.hi - s.n : s.n - s.lo); s.n += Math.sign(d) * q; used += q; }
      d -= Math.sign(d) * used;
    }
    return d;
  };
  const Ct = ct.y1 - ct.y0;
  let D = Ct - (B - A), sc = 1;
  setUp(D >= 0);
  if (D >= 0) {
    if (segs.some(s => s.w > .01)) D = fill(segs, D);
    if (D > .01) { const e = segs.filter(s => !s.run); e[0].n += D / 2; e[e.length - 1].n += D / 2; } // tudo colado: fica no meio
    segs.forEach(s => { s.c = s.n; });
  } else {
    // falta altura: 1) vãos e recorte das fotos; 2) imagem e forma diminuem (até 35%); 3) só então o resto (texto, logo, botão)
    D = fill(segs, D);
    segs.forEach(s => { s.c = s.n; });
    if (D < -.01) {
      const ps = segs.filter(s => s.pic); ps.forEach(s => { s.lo = len(s) * .35; s.hi = s.n; s.w = s.n; });
      D = fill(ps, D);
    }
    if (D < -.01) sc = Math.max(.5, Ct / (Ct - D));
  }
  const total = segs.reduce((n, s) => n + s.n, 0) * sc;
  let pos = ct.y0 + Math.min(0, Ct - total) / 2;
  for (const s of segs) { s.ta = pos; s.tn = s.n * sc; pos += s.tn; }
  const F = v => {
    if (v <= A) return segs[0].ta - (A - v) * sc;
    for (const s of segs) if (v <= s.b) return s.ta + (len(s) > 0 ? (v - s.a) / len(s) * s.tn : 0);
    const z = segs[segs.length - 1]; return z.ta + z.tn + (v - B) * sc;
  };
  const edgeY = v => v <= A ? v : v >= B ? v + dH : F(v); // fora da faixa útil, fica presa à borda do quadro
  // com outra largura, fica apoiado na mesma borda: texto pelo alinhamento; o resto pela margem em que encosta
  // (a margem vem antes do alinhamento: texto "centro" encostado na margem esquerda continua na linha dos outros)
  const anchorX = (i, w2) => {
    const M = areaAt(i.cx), lf = Math.abs(i.l - M.x0) < 16, rt = Math.abs(i.r - M.x1) < 16, own = i.L.type === 'text' ? i.L.align : 'center';
    const al = lf && rt ? own : lf ? 'left' : rt ? 'right' : own;
    let cx = al === 'left' ? i.l + w2 / 2 : al === 'right' ? i.r - w2 / 2 : i.cx;
    if (i.l >= M.x0 - 1 && i.r <= M.x1 + 1 && w2 <= Mw) cx = clamp(cx, M.x0 + w2 / 2, M.x1 - w2 / 2);
    return cx;
  };
  const picSeg = new Map(segs.filter(s => s.pic).flatMap(s => s.peers.map(p => [p, s])));
  for (const i of want) {
    let cx = i.cx, cy = i.cy, k = 1, hh = null, ww = null;
    const w0 = i.r - i.l;
    if (!i.edge) {
      cy = F(i.cy); k = sc;
      const s = picSeg.get(i);
      // texto (ou outro bloco) por cima da foto: mantém a distância até a borda dela mais próxima, sem ser espremido
      const ov = !s && segs.find(q => q.pic && i.cy > q.a && i.cy < q.b);
      if (ov) { const d0 = i.cy - ov.a, d1 = ov.b - i.cy; cy = clamp(d0 <= d1 ? ov.ta + d0 * sc : ov.ta + ov.tn - d1 * sc, ov.ta, ov.ta + ov.tn); }
      if (s && s.crop) {
        const h0 = i.b - i.t, c = h0 * s.c / len(s), f = s.n / s.c; // c = altura da máscara, f = quanto a foto diminuiu depois disso
        if (Math.abs(c - h0) > .5) { hh = c; ww = c < h0 && s.wide ? Math.min(Math.max(w0, Mw), w0 * h0 / c) : w0; }
        k = f * sc;
        cx = anchorX(i, (ww || w0) * k);
      } else if (s) { const f = s.n / len(s); k = i.fk * f * sc; cx = anchorX(i, w0 * f * sc); }
      else if (sc < 1) cx = anchorX(i, w0 * sc);
    }
    else if (i.edge === 'cover') { cy = i.cy + dH / 2; if (i.stretch) hh = Math.max(40, i.hh + dH); else k = Math.max(1, (i.b - i.t + dH) / Math.max(1, i.b - i.t)); }
    else if (i.edge === 'top') { const d = edgeY(i.b) - i.b; if (i.stretch) { hh = Math.max(40, i.hh + d); cy = i.cy + (hh - i.hh) / 2; } }
    else { const d = edgeY(i.t) - i.t - dH; cy = i.cy + dH; if (i.stretch) { hh = Math.max(40, i.hh - d); cy -= (hh - i.hh) / 2; } }
    out.set(i.L.id, { x:cx / W(), y:cy / Ht, k, hh, ww });
  }
  }
}
// uma conta por quadro (renderFrame avança RT.frameNo)
function placement() {
  const key = `${RT.frameNo}|${S.format}|${baseFmt()}`;
  if (RT.placeKey !== key) { RT.place = adaptLayout(); RT.placeKey = key; }
  return RT.place;
}
// onde a camada fica no formato aberto: no principal, x/y; nos outros, o ajuste feito ali ou a adaptação automática
// fpos[formato] também guarda o que foi mexido no palco só naquele formato: s (escala pela alça do canto),
// ww/hh (máscara pelas alças laterais, px) e zoom/ix/iy (enquadramento da imagem)
function placeRaw(L) {
  if (S.format === baseFmt()) return { x:L.x, y:L.y, k:1, hh:null, ww:null };
  const p = placement().get(L.id) || { x:L.x, y:L.y, k:1, hh:null, ww:null }, f = L.fpos && L.fpos[S.format];
  return f ? { ...p, x:f.x ?? p.x, y:f.y ?? p.y, k:p.k * (f.s ?? 1), ww:f.ww ?? p.ww, hh:f.hh ?? p.hh, fsz:f.fsz } : p;
}
// grupo com layout automático: a fila decide a posição (o item arrastado para trocar de lugar segue o mouse)
function placeOf(L) {
  const p = placeRaw(L);
  if (!(S.flow || inFlow(L)) || flowSkip(L)) return p;
  const q = flowPlace().get(L.id); return q ? { ...p, x:q.x, y:q.y, k:q.s ? p.k * q.s : p.k } : p; // s = foto encolhida para a fila caber na margem
}
// quem está sendo arrastado para trocar de lugar segue o mouse (item da fila do grupo ou bloco da coluna do quadro)
const flowSkip = L => { const D = RT.drag; return !!D && (D.flowL === L.id || !!(D.flowB && D.flowB.has(L.id))); };
function posOf(L) { const p = placeOf(L); return { x:p.x, y:p.y }; }
const fmtOwn = () => S.format !== baseFmt(); // mexer no palco agora grava só neste formato
const fOf = L => (fmtOwn() && L.fpos && L.fpos[S.format]) || {};
function setFmt(L, patch) { L.fpos ||= {}; L.fpos[S.format] = { ...L.fpos[S.format], ...patch }; }
// limite do centro (fração do quadro) ao mover: largo de propósito, forma e foto podem ir bem para fora do palco; só evita perder o elemento de vez
// no carrossel o x vai até o último slide (+ a mesma folga)
const POS_LO = -3, POS_HI = 4, posHi = () => POS_HI + slides() - 1, clampPos = v => clamp(v, POS_LO, posHi());
// null mantém o eixo como está
function setPos(L, x, y) {
  if (!fmtOwn()) { if (x != null) L.x = x; if (y != null) L.y = y; return; }
  const p = posOf(L); setFmt(L, { x:x ?? p.x, y:y ?? p.y });
}
// enquadramento da imagem dentro da máscara (Alt + arrastar, roda do mouse): fora do principal vale só no formato aberto
function panOf(L) {
  if (L._pan) return L._pan; // movimento da imagem, durante o desenho (imageMotion)
  const f = fOf(L);
  return { ix:(f.ix ?? L.ix) || 0, iy:(f.iy ?? L.iy) || 0, zoom:(f.zoom ?? L.zoom) ?? 1 };
}
function setFrame(L, patch) { if (fmtOwn()) setFmt(L, patch); else Object.assign(L, patch); }
const setPan = (L, ix, iy) => setFrame(L, { ix, iy });
// escala pela alça do canto (e "Tamanho da seleção"): fora do principal, um fator só deste formato
// mw = largura em que o texto quebra (fração do quadro, já limitada pela margem): escalar o texto escala ela junto, senão as linhas quebram em outro lugar e a altura não acompanha
const wrapW = o => { const M = marginBox(); return Math.min((o.maxW || .84) * W(), M ? M.x1 - M.x0 : Infinity) / W(); };
const size0 = o => ({ size:o.size, mh:o.mh, padX:o.padX, padY:o.padY, fs:fOf(o).s ?? 1,
  mw:o.type === 'text' && (o.fixW || layoutText(o, o.upper ? o.text.toUpperCase() : o.text).nLines > 1) ? wrapW(o) : null });
function scaleAny(L, s0, f) {
  if (!fmtOwn()) return scaleLayer(L, s0, f);
  const s = +clamp(s0.fs * f, .001, L.type === 'text' || L.type === 'cta' ? 8 : Infinity).toFixed(4); setFmt(L, { s }); return s / s0.fs; // a escala que valeu de fato
}
const ownPos = L => S.format !== baseFmt() && !!(L.fpos && L.fpos[S.format]);
function resetPos(ls) {
  const ms = ls.filter(ownPos); if (!ms.length) return;
  pushUndo();
  for (const L of ms) { delete L.fpos[S.format]; if (!Object.keys(L.fpos).length) delete L.fpos; }
  changed({ props:true }); toast(ms.length > 1 ? `${ms.length} elementos voltaram ao automático` : 'Voltou ao automático');
}
const fmtLabel = f => FORMATS[f].label;

/* ------------ layout automático (como o do Figma, mas solto para animar) ------------
   S.groups[gid].flow = { dir:'v'|'h', gap (px do vídeo), auto, align, pin }. Os itens do grupo ficam em fila com o mesmo espaço
   entre eles; no Auto, espalhados entre o primeiro e o último. align = alinhamento no outro eixo (start | center | end);
   pin = o lado que fica parado quando um item muda de tamanho (texto maior, outra variação). Só a posição de repouso vira regra:
   a animação de cada item continua por cima, e quem ainda não entrou já guarda o lugar (nada pula quando ele aparece).
   A ordem é a da posição (quem está em cima ou à esquerda vem antes): arrastar um item sozinho (Ctrl + clique) para além do
   vizinho troca a ordem; as setas também. Item oculto não ocupa lugar; L.flowFree = fora do layout (fica onde está, no grupo).
   A âncora sai das posições guardadas + L.fsz (tamanho de cada item na última conta, px sem escala), então o lado fixo não anda
   quando algo cresce. `flowBake` (em pushUndo e changed) grava posição e tamanho de volta: outros formatos, desligar o layout
   e desagrupar veem o mesmo que a tela. */
const flowOf = gid => { const g = gid && S.groups && S.groups[gid]; return (g && g.flow) || null; };
/* Frame dentro de frame: S.groups[gid].parent = o frame que contém este. A camada guarda só o grupo de baixo (L.grp); o de cima só tem
   meta (layout, nome) e enxerga as camadas pelos filhos. Dentro de um frame com layout, cada frame filho é um bloco da fila. */
const gpar = gid => { const g = gid && S.groups && S.groups[gid]; return g && g.parent && g.parent !== gid && S.groups[g.parent] ? g.parent : null; };
function gtop(gid) { for (let n = 0; gpar(gid) && n < 20; n++) gid = gpar(gid); return gid; }
function ginside(gid, anc) { for (let n = 0; gid && n < 20; n++, gid = gpar(gid)) if (gid === anc) return true; return false; }
const gleaves = gid => S.layers.filter(l => l.grp && ginside(l.grp, gid));
const gkids = gid => S.groups ? Object.keys(S.groups).filter(k => gpar(k) === gid && S.layers.some(l => l.grp && ginside(l.grp, k))) : [];
function chainFlow(gid) { for (let n = 0; gid && n < 20; n++, gid = gpar(gid)) if (flowOf(gid)) return true; return false; }
function flowRoot(gid) { let r = null; for (let n = 0; gid && n < 20; n++, gid = gpar(gid)) if (flowOf(gid)) r = gid; return r; }
const flowMember = L => !!(L && L.grp && L.visible && !L.flowFree && L.type !== 'bg' && !NOBOX(L));
const inFlow = L => flowMember(L) && chainFlow(L.grp);
// a seleção leva todos os itens da fila (então mover, alinhar ou escalar é do grupo inteiro)
const flowWhole = (gid, ls) => gleaves(gid).every(o => !inFlow(o) || ls.includes(o));
// tamanho de repouso de um item (px, já com a escala do formato) e o da última conta; p = posição bruta (placeRaw)
function flowItem(L, p, Hf) {
  let w, hh, bw, bh;
  if (L.type === 'text') { const lay = layoutText(L, L.upper ? L.text.toUpperCase() : L.text); w = bw = lay.blockW; hh = bh = lay.blockH; }
  else { const G = blockGeom(L); if (!G) return null; bw = G.w; bh = G.h; w = p.ww || G.w; hh = p.hh || G.h; }
  const r = (L.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), ext = (a, b) => [a * c + b * s, a * s + b * c];
  const [ew, eh] = ext(w, hh), [bx, by] = ext(bw, bh), f0 = L.fsz || [bx, by], k = p.k || 1;
  // fsz vale no principal; fora dele a máscara pode ter outro tamanho (ww/hh): na mesma proporção. Com fpos[formato].fsz (o tamanho
  // que valeu na última conta deste formato, sem o k), a âncora é a dele: o encolhimento pela margem muda de um formato para o outro e,
  // com o do principal, o frame andava a cada clique
  if (p.fsz) return { L, k, cx:p.x * W(), cy:p.y * Hf, w:ew * k, h:eh * k, w0:p.fsz[0] * k, h0:p.fsz[1] * k, raw:[bx, by] };
  return { L, k, cx:p.x * W(), cy:p.y * Hf, w:ew * k, h:eh * k, w0:f0[0] * k * ew / (bx || 1), h0:f0[1] * k * eh / (by || 1), raw:[bx, by] };
}
// itens de um grupo: no formato aberto ou (base) no principal, direto de x/y; any = antes de ligar o layout
function flowItems(gid, base, any) {
  const Hf = base ? FORMATS[baseFmt()].h : H();
  return S.layers.map((L, i) => {
    if (L.grp !== gid || !(any ? flowMember(L) : inFlow(L))) return null;
    const it = flowItem(L, base ? { x:L.x, y:L.y, k:1 } : placeRaw(L), Hf); if (it) it.i = i;
    return it;
  }).filter(Boolean);
}
// a fila: rects em ordem ({ cx, cy, w, h, L }, px), o espaço usado e a âncora (fz congela a âncora enquanto um item é arrastado)
// F.w / F.h = tamanho fixo do frame (px do principal, na horizontal / vertical); vazio = abraça o conteúdo.
// bx = caixa imposta (puxando a alça do frame), em px do formato aberto
function flowSolve(F, its, M, fz, bx) {
  const v = F.dir !== 'h', A = v ? 'cy' : 'cx', B = v ? 'cx' : 'cy', Z = v ? 'h' : 'w', Z0 = v ? 'h0' : 'w0', C = v ? 'w' : 'h', C0 = v ? 'w0' : 'h0';
  let o = [...its].sort((p, q) => p[A] - q[A] || p.i - q.i);
  // texto, logo, botão e foto com "Manter dentro da margem" não passam da margem, mas dentro da fila não são empurrados nem
  // encolhidos um a um (o espaço rosa ficava num lugar e o item em outro): a fila decide. Mais largo que a margem encolhe até caber;
  // fila mais comprida que a margem encolhe primeiro as fotos (até 35%) e só depois o resto. s = escala que o desenho aplica (placeOf)
  const fitIn = q => q.L.type !== 'group' && !freeType(q.L), isPic = q => q.L.type === 'image';
  if (M && !bx && o.some(fitIn)) {
    const aw = v ? M.x1 - M.x0 : M.y1 - M.y0, am = v ? M.y1 - M.y0 : M.x1 - M.x0, kk0 = o.reduce((n, i) => n + i.k, 0) / o.length;
    const cs = o.map(i => fitIn(i) ? Math.min(1, aw / Math.max(1, i[C])) : 1), z = o.map((i, j) => i[Z] * cs[j]);
    const sum = f => o.reduce((n, i, j) => n + (f(i) ? z[j] : 0), 0), pic = sum(i => fitIn(i) && isPic(i)), oth = sum(i => fitIn(i) && !isPic(i));
    const fixed = sum(i => !fitIn(i)) + (F.auto ? 0 : (F.gap ?? 24) * kk0 * (o.length - 1));
    let sp = 1, so = 1;
    if (fixed + pic + oth > am) {
      if (pic) sp = clamp((am - fixed - oth) / pic, .35, 1);
      if (oth) so = clamp((am - fixed - pic * sp) / oth, .35, 1);
    }
    o = o.map((i, j) => { if (!fitIn(i)) return i; const s = cs[j] * (isPic(i) ? sp : so);
      return s < .9999 ? { ...i, s, w:i.w * s, h:i.h * s } : i; }); // w0/h0 (âncora) já vêm do fsz, que é gravado encolhido
  }
  const a0 = fz && (!F.auto || fz.all) ? fz : { lo:Math.min(...o.map(i => i[A] - i[Z0] / 2)), hi:Math.max(...o.map(i => i[A] + i[Z0] / 2)) };
  const x0 = fz || { cl:Math.min(...o.map(i => i[B] - i[C0] / 2)), ch:Math.max(...o.map(i => i[B] + i[C0] / 2)) };
  const sum = o.reduce((n, i) => n + i[Z], 0), kk = o.reduce((n, i) => n + i.k, 0) / o.length;
  // frame com tamanho fixo: a caixa sai do conteúdo (como estava na última conta) + a folga, pelo alinhamento; o conteúdo se alinha dentro dela
  const off = (m, free) => m === 'end' ? free : m === 'center' ? free / 2 : 0, Lm = v ? F.h : F.w, Lc = v ? F.w : F.h;
  let a = a0, x = x0;
  if (bx) { a = v ? { lo:bx.y0, hi:bx.y1 } : { lo:bx.x0, hi:bx.x1 }; x = v ? { cl:bx.x0, ch:bx.x1 } : { cl:bx.y0, ch:bx.y1 }; }
  else {
    if (Lm) { const l = Math.max(Lm * kk, sum + (F.auto ? 0 : (F.gap ?? 24) * kk * (o.length - 1))), lo = a0.lo - off(F.auto ? 'center' : F.pin || 'start', l - (a0.hi - a0.lo)); a = { lo, hi:lo + l }; }
    if (Lc) { const l = Math.max(Lc * kk, ...o.map(i => i[C])), cl = x0.cl - off(F.align || 'center', l - (x0.ch - x0.cl)); x = { cl, ch:cl + l }; }
  }
  let gap = (F.gap ?? 24) * kk, pos;
  if (F.auto && o.length > 1) { gap = (a.hi - a.lo - sum) / (o.length - 1); if (gap < 0) { gap = 0; pos = (a.lo + a.hi - sum) / 2; } else pos = a.lo; }
  else { const tot = sum + gap * (o.length - 1); pos = F.pin === 'end' ? a.hi - tot : F.pin === 'center' ? (a.lo + a.hi - tot) / 2 : a.lo; }
  const rects = o.map(i => {
    const c = F.align === 'start' ? x.cl + i[C] / 2 : F.align === 'end' ? x.ch - i[C] / 2 : (x.cl + x.ch) / 2, m = pos + i[Z] / 2;
    pos += i[Z] + gap;
    return { cx:v ? c : m, cy:v ? m : c, w:i.w, h:i.h, L:i.L, s:i.s, k:i.k };
  });
  // texto, logo e botão não passam da margem: a fila entra inteira (empurrado sozinho, um item encostaria no vizinho)
  const rs = M ? rects.filter(r => !freeType(r.L)) : [];
  let sx = 0, sy = 0;
  if (rs.length) {
    const sh = (a0, a1, m0, m1) => a1 - a0 > m1 - m0 ? 0 : a0 < m0 ? m0 - a0 : a1 > m1 ? m1 - a1 : 0;
    sx = sh(Math.min(...rs.map(r => r.cx - r.w / 2)), Math.max(...rs.map(r => r.cx + r.w / 2)), M.x0, M.x1);
    sy = sh(Math.min(...rs.map(r => r.cy - r.h / 2)), Math.max(...rs.map(r => r.cy + r.h / 2)), M.y0, M.y1);
    for (const r of rects) { r.cx += sx; r.cy += sy; }
  }
  // a caixa do frame (px): no eixo fixo, a do frame; no que abraça, a do conteúdo
  const ext = (k, s) => [Math.min(...rects.map(r => r[k] - r[s] / 2)), Math.max(...rects.map(r => r[k] + r[s] / 2))];
  const fixM = bx || Lm, fixC = bx || Lc, [m0, m1] = fixM ? [a.lo, a.hi] : ext(A, Z), [c0, c1] = fixC ? [x.cl, x.ch] : ext(B, C);
  const dm = fixM ? (v ? sy : sx) : 0, dc = fixC ? (v ? sx : sy) : 0;
  const box = v ? { x0:c0 + dc, x1:c1 + dc, y0:m0 + dm, y1:m1 + dm } : { x0:m0 + dm, x1:m1 + dm, y0:c0 + dc, y1:c1 + dc };
  return { rects, gap, kk, v, box, fz:{ ...a0, ...x0 } };
}
// uma conta por quadro no formato aberto (como placement): Map id → { x, y } em frações; RT.flowRects = a fila de cada grupo
function flowPlace() {
  const key = `${RT.frameNo}|${S.format}|${baseFmt()}`;
  if (RT.flowKey === key && RT.flowS === S) return RT.flowMap;
  const m = new Map(); RT.flowKey = key; RT.flowS = S; RT.flowMap = m;
  const R = flowLayout(false, RT.drag);
  for (const [id, q] of R.pos) m.set(id, { x:q.cx / W(), y:q.cy / H(), s:q.s });
  RT.flowRects = R.groups; RT.frameRows = R.frame; RT.frameIds = R.frame ? R.frame.ids : new Set();
  return m;
}
/* Tudo junto: 1) a fila de cada grupo com layout; 2) a coluna do quadro (S.flow), por cima. Devolve pos (id → { cx, cy } px),
   groups (gid → resultado de flowSolve, já com o deslocamento do quadro), frame (linhas da coluna) e sizes (id → tamanho para o fsz).
   base = no principal, direto de x/y; D = arrasto em curso ({ flow, fz } congela a âncora de um grupo; flowB = blocos soltos do quadro) */
function flowLayout(base, D) {
  // fin = tamanho que valeu na fila (px sem o k, já encolhido), para a âncora de cada formato (fpos[formato].fsz / fszF)
  const fmt = base ? baseFmt() : S.format, Hf = FORMATS[fmt].h, M = marginBox(fmt), pos = new Map(), groups = new Map(), sizes = new Map(), memo = new Map(), fin = new Map();
  // um frame filho vira um bloco da fila do pai: caixa das folhas dele (tamanho de agora; o guardado, para a âncora, vem de fsz do grupo)
  const block = (kid, lv) => {
    const a = [...lv.values()], x0 = Math.min(...a.map(q => q.cx - q.w / 2)), x1 = Math.max(...a.map(q => q.cx + q.w / 2)), y0 = Math.min(...a.map(q => q.cy - q.h / 2)), y1 = Math.max(...a.map(q => q.cy + q.h / 2));
    const k = a.reduce((n, q) => n + q.k, 0) / a.length, w = x1 - x0, hh = y1 - y0, gm = gmeta(kid) || {}, f = (fmt !== baseFmt() && gm.fszF && gm.fszF[fmt]) || gm.fsz;
    return { L:{ id:'g:' + kid, type:'group', kid }, k, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, w, h:hh, w0:f ? f[0] * k : w, h0:f ? f[1] * k : hh, raw:[w / k, hh / k], i:Math.min(...a.map(q => q.i)), lv };
  };
  // resolve um frame: devolve as folhas (id → item com cx, cy já no lugar), as dele e as dos frames de dentro
  const solve = gid => {
    if (memo.has(gid)) return memo.get(gid);
    const F = flowOf(gid), its = flowItems(gid, base), byL = new Map(its.map(i => [i.L, i])), blocks = new Map(), res = new Map();
    for (const kid of gkids(gid)) { const kr = solve(kid); if (kr.size) { const b = block(kid, kr); blocks.set(b.L, b); } }
    if (F && (its.length || blocks.size)) {
      const boxed = D && D.boxGid === gid, items = [...its, ...blocks.values()];
      const Mg = M && slides() > 1 ? marginBox(fmt, slideAt(items.reduce((n, q) => n + q.cx, 0) / items.length)) : M; // carrossel: a margem do slide do grupo
      const r = flowSolve(F, items, boxed ? null : Mg, D && D.flow === gid ? D.fz : null, boxed ? D.box : null);
      r.items = items;
      for (const q of r.rects) {
        const b = blocks.get(q.L);
        fin.set(q.L.id, [q.w / (q.k || 1), q.h / (q.k || 1)]);
        if (b) { const dx = q.cx - b.cx, dy = q.cy - b.cy; for (const [id, o] of b.lv) res.set(id, { ...o, cx:o.cx + dx, cy:o.cy + dy }); sizes.set(b.L.id, b.raw); }
        else { const it = byL.get(q.L), s = q.s || 1; res.set(q.L.id, { ...it, cx:q.cx, cy:q.cy, s:q.s, w:it.w * s, h:it.h * s }); }
      }
      // fsz = o tamanho que valeu (já encolhido pela margem): a posição gravada é a do item encolhido, então a âncora precisa dele
      for (const it of its) { const s = res.get(it.L.id)?.s; sizes.set(it.L.id, s ? it.raw.map(n => n * s) : it.raw); }
      const lead = res.values().next().value; r.lead = lead ? { id:lead.L.id, cx:lead.cx, cy:lead.cy } : null;
      groups.set(gid, r);
    } else {
      for (const it of its) { res.set(it.L.id, it); sizes.set(it.L.id, it.raw); }
      for (const b of blocks.values()) for (const [id, o] of b.lv) res.set(id, o);
    }
    memo.set(gid, res); return res;
  };
  if (S.groups) for (const gid of Object.keys(S.groups)) if (!gpar(gid)) for (const [id, q] of solve(gid)) pos.set(id, { cx:q.cx, cy:q.cy, s:q.s });
  const raw = new Map(pos), frame = S.flow ? frameSolve(base, Hf, M, pos, sizes, D) : null;
  if (frame) for (const [gid, r] of groups) { // a caixa do grupo anda junto com a coluna (alças e espaços no lugar certo)
    const q = r.lead && pos.get(r.lead.id); if (!q) continue;
    const dx = q.cx - r.lead.cx, dy = q.cy - r.lead.cy; if (!dx && !dy) continue;
    r.rects = r.rects.map(o => ({ ...o, cx:o.cx + dx, cy:o.cy + dy })); r.box = { x0:r.box.x0 + dx, x1:r.box.x1 + dx, y0:r.box.y0 + dy, y1:r.box.y1 + dy };
  }
  return { pos, raw, groups, frame, sizes, fin };
}
// o frame com tamanho imposto (puxando a alça ou mudando Largura/Altura): grava a posição de todos os itens de dentro
function flowFill(gid, box) {
  const R = flowLayout(false, { boxGid:gid, box });
  for (const L of gleaves(gid)) { const q = R.raw.get(L.id); if (q) setPos(L, +(q.cx / W()).toFixed(5), +(q.cy / H()).toFixed(5)); }
}
/* ------------ layout automático do quadro: S.flow = { gap, auto, pin, align } ------------
   Tudo que está no quadro vira uma coluna. Cada grupo é um bloco só; blocos que se sobrepõem na vertical (texto em cima da foto,
   cena 2 no lugar da cena 1, coisas lado a lado) formam uma linha rígida. Quem não aparece na tela junto não se empurra: cada linha
   desce só abaixo das linhas anteriores que aparecem junto com ela. A margem é o respiro: pin start | center | end = a coluna encosta
   em cima, fica no meio ou encosta embaixo; auto = espalha de margem a margem. Foto ou forma que sangra pela borda de cima ou de baixo
   fica de fora e o que está abaixo (ou acima) dela respeita a borda. align: keep = na horizontal fica onde está; start | center | end = na margem.
   As linhas saem das posições guardadas + fsz (estáveis quando algo cresce); a altura de cada linha, do tamanho de agora. */
function frameSolve(base, Hf, M, pos, sizes, D) {
  const FF = S.flow, Mb = M || { x0:0, y0:0, x1:W(), y1:Hf }, gap = FF.gap ?? 24, blocks = new Map(), bands = [], ids = new Set();
  const moving = D && D.flowB;
  // carrossel: o tempo em que aparece, separado por slide (um bloco em outro slide não "aparece junto"; quem atravessa conta nos dois)
  const spans = (L, it) => {
    const sp = holdSpan(L); if (slides() < 2) return [sp];
    const out = []; for (let s = slideAt(it.cx - it.w / 2 + 1); s <= slideAt(it.cx + it.w / 2 - 1); s++) out.push([sp[0] + s * 1e4, sp[1] + s * 1e4]);
    return out;
  };
  S.layers.forEach((L, i) => {
    if (!L.visible || L.type === 'bg' || NOBOX(L)) return;
    const g = L.grp ? gtop(L.grp) : null; if (g ? (gmeta(g) || {}).free : L.flowFree) return;
    let it = flowItem(L, base ? { x:L.x, y:L.y, k:1 } : placeRaw(L), Hf); if (!it) return;
    { const s = pos.get(L.id)?.s; if (s) it = { ...it, w:it.w * s, h:it.h * s }; } // encolhido pela fila do grupo
    if (!g && freeType(L)) { // sangra pela borda: fica de fora (cobre o quadro inteiro = fundo; só em cima ou só embaixo = faixa)
      const t = it.cy - it.h / 2, b = it.cy + it.h / 2, up = t <= 1, dn = b >= Hf - 1;
      if (up || dn) { if (!(up && dn)) bands.push({ up, t, b, sp:spans(L, it) }); return; }
    }
    const q = pos.get(L.id), key = g ? 'g:' + g : L.id, bl = blocks.get(key) || { key, ms:[], sp:[], i };
    blocks.set(key, bl); ids.add(L.id); if (!sizes.has(L.id)) sizes.set(L.id, it.raw);
    bl.ms.push({ L, it, cx:q ? q.cx : it.cx, cy:q ? q.cy : it.cy }); bl.sp.push(...spans(L, it));
    if ((moving && moving.has(L.id)) || (g ? (gmeta(g) || {}).enter : L.flowEnter)) bl.forced = true; // voltando ao layout: linha própria
  });
  // o que está em cima de uma foto que sangra (em repouso) fica com ela, fora da coluna
  const meets0 = (a, b) => a.some(([a0, a1]) => b.some(([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > .01));
  for (const [k, bl] of blocks) {
    const rt = Math.min(...bl.ms.map(m => m.it.cy - m.it.h0 / 2)), rb = Math.max(...bl.ms.map(m => m.it.cy + m.it.h0 / 2));
    if (!bl.forced && bands.some(bd => meets0(bd.sp, bl.sp) && (bd.up ? rt < bd.b - 1 : rb > bd.t + 1))) { blocks.delete(k); bl.ms.forEach(m => { ids.delete(m.L.id); if (!inFlow(m.L)) sizes.delete(m.L.id); }); }
  }
  if (!blocks.size) return { rows:[], ids, gaps:new Map() };
  const mn = (a, f) => Math.min(...a.map(f)), mx = (a, f) => Math.max(...a.map(f));
  for (const bl of blocks.values()) {
    bl.rt = mn(bl.ms, m => m.it.cy - m.it.h0 / 2); bl.rb = mx(bl.ms, m => m.it.cy + m.it.h0 / 2); // guardado (estável)
    bl.ct = mn(bl.ms, m => m.cy - m.it.h / 2); bl.cb = mx(bl.ms, m => m.cy + m.it.h / 2); // agora
    bl.cl = mn(bl.ms, m => m.cx - m.it.w / 2); bl.cr = mx(bl.ms, m => m.cx + m.it.w / 2);
    bl.pic = bl.ms.some(m => m.L.type === 'image' || m.L.type === 'shape');
  }
  // mesma linha só quem está lado a lado (não se cruza na horizontal) ou em cima de foto/forma (metade da altura ou mais).
  // Texto, logo e botão que só se encostam empilham: antes viravam uma linha rígida e continuavam sobrepostos, era preciso afastar à mão
  const together = (p, q) => {
    if (Math.min(p.cr, q.cr) - Math.max(p.cl, q.cl) < 2) return true;
    return (p.pic || q.pic) && Math.min(p.rb, q.rb) - Math.max(p.rt, q.rt) >= .5 * Math.min(p.rb - p.rt, q.rb - q.rt);
  };
  // linhas: blocos que se sobrepõem na vertical E aparecem na tela juntos (texto em cima da foto, coisas lado a lado).
  // Só sobrepor não basta: num arquivo trabalhado a cena 2 ocupa o lugar da cena 1 e, emendando em cadeia, o quadro inteiro virava
  // uma linha só (nada para espaçar, nada se mexia). O bloco arrastado só fica na linha em que já estava (D.mates), senão vira linha própria
  const rows = [], all = [...blocks.values()], free = all.filter(b => !b.forced).sort((p, q) => p.rt - q.rt || p.i - q.i);
  const up0 = free.map((_, j) => j), rt0 = j => { while (up0[j] !== j) j = up0[j] = up0[up0[j]]; return j; };
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
    const p = free[a], q = free[b];
    if (p.rt < q.rb - 1 && q.rt < p.rb - 1 && meets0(p.sp, q.sp) && together(p, q)) up0[rt0(b)] = rt0(a);
  }
  const byRoot = new Map();
  free.forEach((bl, j) => { const k = rt0(j); let r = byRoot.get(k); if (!r) { r = { bs:[], rt:bl.rt, rb:bl.rb }; byRoot.set(k, r); rows.push(r); } r.bs.push(bl); r.rt = Math.min(r.rt, bl.rt); r.rb = Math.max(r.rb, bl.rb); });
  for (const bl of all.filter(b => b.forced)) {
    const r = D && D.mates && rows.find(r => r.bs.some(b => D.mates.has(b.key)));
    if (r) r.bs.push(bl); else rows.push({ bs:[bl], rt:bl.rt, rb:bl.rb });
  }
  for (const r of rows) {
    r.ord = r.bs.some(b => b.forced) ? (mn(r.bs, b => b.rt) + mx(r.bs, b => b.rb)) / 2 : (r.rt + r.rb) / 2;
    r.ct = mn(r.bs, b => b.ct); r.H = mx(r.bs, b => b.cb) - r.ct; r.cl = mn(r.bs, b => b.cl); r.cr = mx(r.bs, b => b.cr); r.sp = r.bs.flatMap(b => b.sp);
    r.rt0 = mn(r.bs, b => b.rt); r.rb0 = mx(r.bs, b => b.rb);
  }
  rows.sort((p, q) => p.ord - q.ord);
  const meets = (a, b) => a.some(([a0, a1]) => b.some(([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > .01));
  // cenas: linhas ligadas por aparecerem juntas
  const par = rows.map((_, j) => j), root = j => { while (par[j] !== j) j = par[j] = par[par[j]]; return j; };
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) if (meets(rows[a].sp, rows[b].sp)) par[root(a)] = root(b);
  const comps = new Map(); rows.forEach((r, j) => { const k = root(j); if (!comps.has(k)) comps.set(k, []); comps.get(k).push(r); });
  const gaps = new Map(); let tight = false;
  // faixa útil de cada linha: a margem, menos as fotos que sangram e aparecem junto COM ELA (abaixo da de cima / acima da de baixo).
  // Por linha, não por cena: o que só entra depois que a foto saiu usa a margem inteira
  for (const r of rows) {
    r.lob = []; r.hib = [];
    for (const bd of bands) if (meets(r.sp, bd.sp)) {
      if (bd.up && r.rt0 >= bd.b - 1) r.lob.push(bd.b);
      if (!bd.up && r.rb0 <= bd.t + 1) r.hib.push(bd.t);
    }
  }
  const loOf = (r, g) => Math.max(Mb.y0, ...r.lob.map(b => b + g)), hiOf = (r, g) => Math.min(Mb.y1, ...r.hib.map(t => t - g));
  for (const cs of comps.values()) {
    // empilha de cima (down) ou de baixo (up); over = quanto passa da faixa útil (> 0 = não cabe)
    const down = g => { for (let j = 0; j < cs.length; j++) { let y = loOf(cs[j], g); for (let k = 0; k < j; k++) if (meets(cs[k].sp, cs[j].sp)) y = Math.max(y, cs[k].Y + cs[k].H + g); cs[j].Y = y; } };
    const up = g => { for (let j = cs.length - 1; j >= 0; j--) { let e = hiOf(cs[j], g); for (let k = j + 1; k < cs.length; k++) if (meets(cs[k].sp, cs[j].sp)) e = Math.min(e, cs[k].Y - g); cs[j].Y = e - cs[j].H; } };
    const over = g => { down(g); return mx(cs, r => r.Y + r.H - hiOf(r, g)); };
    // no meio = a média das duas pilhas (as duas respeitam o espaço e a faixa, então a média também)
    const mid = g => { down(g); const a = cs.map(r => r.Y); up(g); cs.forEach((r, j) => { r.Y = (r.Y + a[j]) / 2; }); };
    const most = (a, b) => { for (let n = 0; n < 32; n++) { const m = (a + b) / 2; if (over(m) <= .5) a = m; else b = m; } return a; };
    const fit0 = over(0) <= .5; if (!fit0) tight = true;
    let g = gap;
    if (FF.auto) {
      const big = Mb.y1 - Mb.y0;
      if (!fit0 || over(big) <= .5) { g = 0; mid(0); } // não cabe, ou nada está empilhado: fica no meio
      else { g = most(0, big); down(g); }
    } else {
      // não cabe na margem com esse espaço: o espaço diminui até caber (senão a margem empurra texto e botão de volta e tudo se amontoa)
      if (over(g) > .5) g = fit0 ? most(0, g) : 0;
      if (FF.pin === 'end') up(g); else if (FF.pin === 'center') mid(g); else down(g);
    }
    cs.forEach(r => gaps.set(r, g));
  }
  // horizontal e saída: cada linha anda inteira
  for (const r of rows) {
    const Mr = slideShift(Mb, slideAt((r.cl + r.cr) / 2)); // carrossel: a margem do slide da linha
    const dx = FF.align === 'start' ? Mr.x0 - r.cl : FF.align === 'end' ? Mr.x1 - r.cr : FF.align === 'center' ? (Mr.x0 + Mr.x1 - r.cl - r.cr) / 2 : 0, dy = r.Y - r.ct;
    r.dx = dx; r.dy = dy;
    for (const b of r.bs) for (const m of b.ms) pos.set(m.L.id, { cx:m.cx + dx, cy:m.cy + dy });
  }
  return { rows, ids, gaps, tight };
}
// grava o que a fila decidiu: no principal em x/y (+ fsz); no formato aberto, só em quem já tem posição própria ali
function flowBake() {
  if (!S || RT.drag) return;
  try { flowBake1(); } catch (e) { console.error(e); }
}
function flowBake1() {
  const on = S.flow || (S.groups && Object.values(S.groups).some(g => g && g.flow));
  const own = on && fmtOwn() ? flowLayout(false) : null; // antes de trocar o fsz (a âncora depende dele)
  const R = on ? flowLayout(true) : null, Hb = FORMATS[baseFmt()].h, byId = new Map(S.layers.map(l => [l.id, l]));
  if (R) for (const [id, q] of R.pos) {
    const L = byId.get(id), x = q.cx / W(), y = q.cy / Hb;
    if (Math.abs(L.x - x) > 1e-4) L.x = +x.toFixed(5);
    if (Math.abs(L.y - y) > 1e-4) L.y = +y.toFixed(5);
  }
  const rz = z => z.map(n => +n.toFixed(2));
  if (own) for (const [id, q] of own.pos) { const L = byId.get(id), f = L.fpos && L.fpos[S.format]; if (f && (f.x != null || f.y != null)) { f.x = +(q.cx / W()).toFixed(5); f.y = +(q.cy / H()).toFixed(5); const z = own.fin.get(id); if (z) f.fsz = rz(z); } }
  // frame de dentro: o tamanho dele neste formato, quando as folhas têm posição própria aqui (senão a adaptação automática decide)
  if (own) for (const [id, z] of own.fin) if (id.startsWith('g:')) {
    const gid = id.slice(2), g = gmeta(gid); if (!g) continue;
    if (gleaves(gid).every(l => !inFlow(l) || (l.fpos && l.fpos[S.format] && l.fpos[S.format].y != null))) (g.fszF ||= {})[S.format] = rz(z);
  }
  if (R) for (const [id, z] of R.sizes) {
    if (id.startsWith('g:')) { const g = gmeta(id.slice(2)); if (g && (!g.fsz || Math.abs(g.fsz[0] - z[0]) > .05 || Math.abs(g.fsz[1] - z[1]) > .05)) g.fsz = z.map(n => +n.toFixed(2)); continue; }
    const L = byId.get(id); if (!L.fsz || Math.abs(L.fsz[0] - z[0]) > .05 || Math.abs(L.fsz[1] - z[1]) > .05) L.fsz = z.map(n => +n.toFixed(2)); }
  if (S.groups) for (const [k, g] of Object.entries(S.groups)) if (g && g.fsz && !(R && R.sizes.has('g:' + k))) delete g.fsz;
  for (const L of S.layers) if (L.fsz && !(R && R.sizes.has(L.id))) delete L.fsz;
  for (const L of S.layers) delete L.flowEnter;
  if (S.groups) for (const g of Object.values(S.groups)) if (g) delete g.enter;
}
// ao ligar: direção, espaço, alinhamento e lado fixo saem de como os itens já estão
function flowGuess(gid, dir) {
  const its = flowItems(gid, false, true);
  for (const kid of gkids(gid)) { // frame filho = um bloco, pela caixa dos itens
    const lv = gleaves(kid).filter(flowMember).map(L => flowItem(L, placeRaw(L), H())).filter(Boolean); if (!lv.length) continue;
    const x0 = Math.min(...lv.map(q => q.cx - q.w / 2)), x1 = Math.max(...lv.map(q => q.cx + q.w / 2)), y0 = Math.min(...lv.map(q => q.cy - q.h / 2)), y1 = Math.max(...lv.map(q => q.cy + q.h / 2));
    its.push({ L:{ id:'g:' + kid, type:'group', kid }, k:1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, w:x1 - x0, h:y1 - y0 });
  }
  if (!its.length) return null;
  const spread = (A, Z) => {
    const o = [...its].sort((p, q) => p[A] - q[A]), gs = [];
    for (let j = 1; j < o.length; j++) gs.push(o[j][A] - o[j][Z] / 2 - (o[j - 1][A] + o[j - 1][Z] / 2));
    return { gs, ov:gs.filter(g => g < -1).length };
  };
  const V = spread('cy', 'h'), Hz = spread('cx', 'w');
  dir ||= Hz.ov < V.ov ? 'h' : 'v';
  const v = dir === 'v', gs = (v ? V : Hz).gs.filter(g => g >= 0).sort((p, q) => p - q);
  const B = v ? 'cx' : 'cy', C = v ? 'w' : 'h', near = f => its.every(i => Math.abs(f(i) - f(its[0])) < 6);
  let align = near(i => i[B]) ? 'center' : near(i => i[B] - i[C] / 2) ? 'start' : near(i => i[B] + i[C] / 2) ? 'end' : null;
  if (!align && v) { const al = new Set(its.map(i => i.L.type === 'text' ? i.L.align : 'center')); align = al.size === 1 ? ({ left:'start', right:'end' })[[...al][0]] : null; }
  const lo = Math.min(...its.map(i => v ? i.cy - i.h / 2 : i.cx - i.w / 2)), hi = Math.max(...its.map(i => v ? i.cy + i.h / 2 : i.cx + i.w / 2));
  const mid = v ? (lo + hi) / 2 / H() : ((lo + hi) / 2 - slideAt((lo + hi) / 2) * W()) / W(); // na horizontal, dentro do slide
  return { dir, gap:gs.length ? Math.round(gs[gs.length >> 1]) : 24, auto:false, align:align || 'center', pin:mid < .4 ? 'start' : mid > .6 ? 'end' : 'center' };
}

/* ------------ fábrica de camadas ------------ */
function base(type, role, defs, o = {}) {
  return Object.assign({ id:uid(), type, role, name:ROLE_NAME[role] || TYPE_LABEL[type], visible:true, start:0, end:null,
    in:'fade', out:'cut', inDur:1, outDur:.6, inSpeed:1, inInt:.6, outSpeed:1, outInt:.6, idleSpeed:1, idleInt:.6, idle:'none', x:.5, y:.5, opacity:1 }, defs, o);
}
// velocidade e intensidade são de cada fase (entrada, na tela, saída); arquivos antigos tinham um valor só (speed, intensity)
const RHY = { in:['inSpeed', 'inInt'], out:['outSpeed', 'outInt'], idle:['idleSpeed', 'idleInt'] };
const spdOf = (L, m) => L[RHY[m][0]] ?? (m === 'idle' ? 1 : L.speed ?? 1);
const intOf = (L, m) => L[RHY[m][1]] ?? L.intensity ?? .6;
function mkText(role, o = {}) {
  const B = S.brand;
  const L = base('text', role, { in:'rise', inDur:TP.rise.dur, text:ROLE_TEXT[role] ?? 'Seu texto aqui', font:B.fonts[1], weight:700, italic:false, size:80,
    color:B.colors[1], ls:0, lh:1.08, align:'center', maxW:.84, upper:false, hl:B.colors[2] }, o);
  if (o.in && TP[o.in] && o.inDur == null) L.inDur = TP[o.in].dur;
  return L;
}
function mkLogo(role, o = {}) {
  const B = S.brand;
  const L = base('logo', role, { in:'draw', inDur:BP.draw.dur, size:.36, drawColor:B.colors[2], drawOrig:false, drawWidth:5, lineColor:B.colors[2], tint:false, tintColor:B.colors[1] }, o);
  if (o.in && BP[o.in] && o.inDur == null) L.inDur = BP[o.in].dur;
  return L;
}
function mkCta(o = {}) {
  const B = S.brand;
  const L = base('cta', 'cta', { in:'pop', inDur:BP.pop.dur, idle:'pulse', text:ROLE_TEXT.cta, font:B.fonts[1], weight:700, size:40,
    color:B.colors[0], bg:B.colors[2], radius:999, padX:54, padY:26, lineColor:B.colors[2] }, o);
  if (o.in && BP[o.in] && o.inDur == null) L.inDur = BP[o.in].dur;
  return L;
}
function mkImage(o = {}) {
  const L = base('image', 'image', { in:'circle', inDur:BP.circle.dur, size:.6, radius:24, src:null, lineColor:S.brand.colors[2], mask:'rect', mh:null, zoom:1, ix:0, iy:0 }, o);
  if (o.in && BP[o.in] && o.inDur == null) L.inDur = BP[o.in].dur;
  return L;
}
function mkShape(o = {}) {
  const c = S.brand.colors;
  const L = base('shape', 'shape', { in:'pop', inDur:BP.pop.dur, idle:'none', kind:'rect', size:.5, mh:.3, radius:40, points:5, inner:.45, d:'M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80', rot:0,
    mode:'mesh', c1:c[2], c2:c[0], c3:c[3], c4:c[4], motion:1, angle:135, src:null, darken:.25, grain:0,
    fill:true, stroke:false, strokeColor:c[1], strokeW:8, strokeDash:'solid', strokeGap:1, strokeCap:'round', strokeJoin:'round' }, o);
  if (o.in && BP[o.in] && o.inDur == null) L.inDur = BP[o.in].dur;
  return L;
}
function mkBg(o = {}) {
  const c = S.brand.colors;
  return base('bg', 'bg', { mode:'mesh', c1:c[0], c2:c[3], c3:c[2], c4:c[4], motion:1, angle:135, src:null, darken:.25, grain:.08, in:'cut', out:'cut' }, o);
}

/* ------------ roteiros ------------ */
const TEMPLATES = [
  { id:'blank', ic:'+', name:'Do zero', desc:'Só o fundo. Você adiciona texto, imagem, logo e botão', dur:8, build:(B,F)=>[mkBg({mode:'mesh', motion:1, grain:.08})] },
  { id:'marca-msg', ic:'LOGO', name:'Marca, mensagem e botão', desc:'O logo se desenha, depois entram a mensagem e o botão', dur:10, build:(B,F)=>[
    mkBg({mode:'mesh'}),
    mkLogo('logo',{y:.42,size:.36,start:.2,end:3.4,in:'draw',out:'blur',outDur:.5}),
    mkText('brand',{y:.64,font:F[1],weight:700,size:40,ls:.32,start:1.7,end:3.4,in:'track',out:'fade',outDur:.4}),
    mkText('title',{y:.40,font:F[0],weight:500,size:104,lh:1.02,start:3.3,in:'lineMask'}),
    mkText('sub',{y:.575,font:F[1],weight:500,size:40,opacity:.82,start:3.8,in:'blurChar'}),
    mkCta({y:.69,start:4.5,in:'pop',idle:'pulse'}),
    mkLogo('logoSmall',{y:.15,size:.11,start:4.2,in:'fade',idle:'none'}),
  ]},
  { id:'msg-marca', ic:'MSG', name:'Mensagem primeiro', desc:'Frase de impacto e a marca aparece no fim', dur:8, build:(B,F)=>[
    mkBg({mode:'mesh'}),
    mkText('title',{y:.42,font:F[0],weight:500,size:104,lh:1.02,start:.2,end:4.4,in:'springWord',out:'blurChar',outDur:.6}),
    mkText('sub',{y:.595,font:F[1],weight:500,size:40,opacity:.82,start:.8,end:4.4,in:'rise',out:'fade',outDur:.4}),
    mkLogo('logo',{y:.42,size:.32,start:4.3,in:'line',idle:'shine'}),
    mkText('brand',{y:.60,font:F[1],weight:700,size:40,ls:.32,start:5.0,in:'scramble'}),
    mkCta({y:.71,start:5.6,in:'rise',idle:'pulse'}),
  ]},
  { id:'revela', ic:'SVG', name:'Revelação de marca', desc:'Logo desenhado com brilho, nome e assinatura', dur:6, build:(B,F)=>[
    mkBg({mode:'spot'}),
    mkLogo('logo',{y:.43,size:.42,start:.2,in:'draw',inDur:2.6,idle:'shine'}),
    mkText('brand',{y:.665,font:F[1],weight:700,size:46,ls:.3,start:2.3,in:'scramble'}),
    mkText('sub',{y:.72,font:F[1],weight:500,size:32,opacity:.7,start:2.9,in:'blurChar'}),
  ]},
  { id:'oferta', ic:'%', name:'Oferta relâmpago', desc:'Número que conta, marca-texto e botão pulsando', dur:7, build:(B,F)=>[
    mkBg({mode:'solid',c1:B.colors[2],grain:.12}),
    mkText('big',{y:.36,font:F[2],weight:800,size:280,color:B.colors[0],start:.2,in:'counter',idle:'float'}),
    mkText('offer',{y:.515,font:F[1],weight:700,size:58,color:B.colors[0],hl:B.colors[1],start:.9,in:'highlight'}),
    mkText('tag',{y:.585,font:F[1],weight:600,size:36,color:B.colors[0],opacity:.8,start:1.5,in:'rise'}),
    mkCta({y:.70,bg:B.colors[0],color:B.colors[1],start:1.9,in:'spring',idle:'pulse'}),
    mkLogo('logoSmall',{y:.86,size:.12,start:2.3,in:'fade',idle:'none'}),
  ]},
  { id:'cinetica', ic:'Aa', name:'Tipografia cinética', desc:'Três frases em sequência, cada uma com um ritmo', dur:9, build:(B,F)=>[
    mkBg({mode:'solid',c1:B.colors[4],grain:.08}),
    mkText('k1',{y:.5,font:F[2],weight:800,size:132,upper:true,lh:1,start:.2,end:2.4,in:'stamp',out:'zoom',outDur:.35}),
    mkText('k2',{y:.5,font:F[0],weight:400,italic:true,size:150,lh:1,start:2.4,end:4.6,in:'lineMask',out:'lineMask',outDur:.45}),
    mkText('k3',{y:.5,font:F[1],weight:800,size:92,color:B.colors[0],hl:B.colors[2],start:4.6,end:6.6,in:'highlight',out:'fade',outDur:.4}),
    mkLogo('logo',{y:.42,size:.3,start:6.6,in:'assemble'}),
    mkCta({y:.66,start:7.2,in:'pop',idle:'pulse'}),
  ]},
  { id:'produto', ic:'IMG', name:'Produto em destaque', desc:'Foto revelada em círculo, título e botão', dur:8, build:(B,F)=>[
    mkBg({mode:'linear'}),
    mkLogo('logoSmall',{y:.1,size:.1,start:.4,in:'fade',idle:'none'}),
    mkImage({y:.41,size:.62,start:.2,in:'circle',idle:'float'}),
    mkText('title',{y:.73,font:F[0],weight:500,size:76,lh:1.02,start:1.0,in:'slideAlt'}),
    mkCta({y:.86,start:1.8,in:'pop',idle:'pulse'}),
  ]},
  { id:'minimal', ic:'—', name:'Minimalista', desc:'Fundo claro, uma frase e a assinatura', dur:6, build:(B,F)=>[
    mkBg({mode:'solid',c1:B.colors[1],grain:.05}),
    mkText('title',{y:.45,font:F[0],weight:400,size:104,lh:1.02,color:B.colors[0],start:.3,in:'wave'}),
    mkText('sub',{y:.585,font:F[1],weight:500,size:36,color:B.colors[0],opacity:.7,start:1.1,in:'fade'}),
    mkText('brand',{y:.86,font:F[1],weight:700,size:30,ls:.34,color:B.colors[0],start:1.7,in:'track'}),
  ]},
  { id:'lancamento', ic:'NEW', name:'Lançamento', desc:'Chamada com falha digital, título que cai e botão', dur:7, build:(B,F)=>[
    mkBg({mode:'mesh'}),
    mkText('kicker',{y:.32,font:F[1],weight:700,size:34,ls:.4,color:B.colors[2],start:.2,in:'glitch'}),
    mkText('title',{y:.45,font:F[2],weight:800,size:92,lh:1.0,start:.6,in:'drop'}),
    mkText('sub',{y:.595,font:F[1],weight:500,size:38,opacity:.82,start:1.6,in:'flip'}),
    mkCta({y:.69,start:2.2,in:'flip',idle:'shine'}),
    mkLogo('logoSmall',{y:.86,size:.12,start:2.6,in:'spin',idle:'none'}),
  ]},
];

function applyTemplate(tpl, keepContent = true) {
  const prev = S.layers || [];
  const keepText = {}; let keepImg = null;
  if (keepContent) for (const L of prev) {
    if ((L.type === 'text' || L.type === 'cta') && L.role && keepText[L.role] == null) keepText[L.role] = { text:L.text, runs:L.runs };
    if (L.type === 'image' && L.src) keepImg = L.src;
  }
  S.duration = tpl.dur;
  const layers = tpl.build(S.brand, S.brand.fonts);
  for (const L of layers) {
    if (L.end == null) L.end = tpl.dur;
    if (keepText[L.role] != null) { L.text = keepText[L.role].text; if (keepText[L.role].runs) L.runs = keepText[L.role].runs; }
    if (L.type === 'image' && keepImg) L.src = keepImg;
  }
  S.layers = layers;
  S.template = tpl.id;
  RT.selected = layers.find(l => l.type !== 'bg')?.id || layers[0].id;
}

function newProject() {
  S = { v:1, format:'4x5', duration:10, fps:30, loop:true, margin:{ on:true, top:64, right:64, bottom:64, left:64 }, brand:defaultBrand(), layers:[], template:null };
  applyTemplate(TEMPLATES.find(t => t.id === 'blank'), false);
}

/* ============================================================
   Fontes
   ============================================================ */
function addStylesheet(url) {
  return new Promise(res => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url;
    l.onload = () => res(true); l.onerror = () => { l.remove(); res(false); };
    document.head.appendChild(l);
    setTimeout(() => res(false), 8000);
  });
}
async function loadGoogleFont(family) {
  family = family.trim(); if (!family) return false;
  if (RT.fontsOk.has(family)) return true;
  const fam = family.replace(/ +/g, '+');
  const tries = ['100..900','200..900','100..800','200..800','300..900','300..800','400..900','400..800','300..700','400..700'].map(r => `${fam}:ital,wght@0,${r};1,${r}`)
    .concat(['100..900','200..800','300..700','400..900'].map(r => `${fam}:wght@${r}`), [`${fam}:ital,wght@0,400;0,700;1,400`, `${fam}:wght@400;700`, fam]);
  let ok = false;
  for (const q of tries) { ok = await addStylesheet(`https://fonts.googleapis.com/css2?family=${q}&display=swap`); if (ok) break; }
  if (!ok) { RT.fontsBad.add(family); return false; }
  await Promise.all([300,400,500,600,700,800,900].flatMap(w => [document.fonts.load(`${w} 40px "${family}"`), document.fonts.load(`italic ${w} 40px "${family}"`)]).map(p => p.catch(() => {})));
  RT.fontsOk.add(family); RT.fontsBad.delete(family); RT.layout.clear(); needs = true;
  return true;
}
// maior peso que a fonte realmente tem (document.fonts lê as @font-face mesmo de folha de outra origem); 0 = não deu para saber
function fontMaxWeight(family) {
  let mx = 0;
  try {
    document.fonts.forEach(ff => {
      if (ff.family.replace(/["']/g, '') !== family) return;
      const m = String(ff.weight).match(/\d+/g); if (m) mx = Math.max(mx, ...m.map(Number));
    });
  } catch (e) { /* sem document.fonts */ }
  return mx;
}
// só os pesos que a fonte tem (se não deu para saber, todos)
function weightsOf(family) {
  const mx = fontMaxWeight(family);
  return mx ? WEIGHTS.filter(([v]) => v <= mx) : WEIGHTS;
}
async function loadFileFont(f) {
  try {
    const buf = await (await fetch(f.data)).arrayBuffer();
    const ff = new FontFace(f.family, buf); await ff.load(); document.fonts.add(ff);
    RT.fontsOk.add(f.family); RT.layout.clear(); needs = true; return true;
  } catch (e) { RT.fontsBad.add(f.family); return false; }
}
async function ensureFonts() {
  await Promise.all(S.brand.loaded.map(f => f.src === 'file' ? loadFileFont(f) : loadGoogleFont(f.family)));
  renderBrand(); needs = true;
}
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { RT.layout.clear(); needs = true; });

/* ============================================================
   Logo: SVG em partes
   ============================================================ */
function shapeToD(el) {
  const n = el.tagName.toLowerCase(), g = a => parseFloat(el.getAttribute(a)) || 0;
  if (n === 'path') return el.getAttribute('d');
  if (n === 'rect') {
    const x = g('x'), y = g('y'), w = g('width'), hh = g('height'); if (!w || !hh) return null;
    let rx = g('rx') || g('ry'), ry = g('ry') || rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, hh / 2);
    if (!rx) return `M${x} ${y}H${x + w}V${y + hh}H${x}Z`;
    return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + hh - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + hh}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + hh - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  if (n === 'circle') { const cx = g('cx'), cy = g('cy'), r = g('r'); if (!r) return null; return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`; }
  if (n === 'ellipse') { const cx = g('cx'), cy = g('cy'), rx = g('rx'), ry = g('ry'); if (!rx || !ry) return null; return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; }
  if (n === 'line') return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
  if (n === 'polyline' || n === 'polygon') {
    const p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); if (p.length < 4) return null;
    let d = `M${p[0]} ${p[1]}`; for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
    return n === 'polygon' ? d + 'Z' : d;
  }
  return null;
}
function resolvePaint(v, root) {
  if (!v || v === 'none') return null;
  const m = v.match(/url\(["']?#([^"')]+)["']?\)/);
  if (m) {
    const g = root.querySelector('#' + CSS.escape(m[1]));
    const stop = g && g.querySelector('stop');
    return stop ? getComputedStyle(stop).stopColor : '#888';
  }
  return v;
}
function sanitizeSvg(text) {
  const doc = new DOMParser().parseFromString(text.replace(/<script[\s\S]*?<\/script>/gi, ''), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Esse SVG não pôde ser lido.');
  svg.querySelectorAll('script,foreignObject').forEach(e => e.remove());
  [svg, ...svg.querySelectorAll('*')].forEach(el => [...el.attributes].forEach(a => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name); }));
  return svg;
}
const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line';
async function parseLogo(logo) {
  if (!logo) return null;
  if (logo.kind === 'img') {
    const img = await loadImg(logo.data);
    const lg = { img, isSvg:false, parts:[], bx:0, by:0, bw:img.naturalWidth, bh:img.naturalHeight };
    try { lg.pen = await buildPen(lg, []); } catch (e) { console.warn(e); lg.pen = null; }
    return lg;
  }
  const svg = sanitizeSvg(logo.text);
  const host = h('div', { style:'position:fixed;left:-99999px;top:0;width:800px;height:800px;opacity:0;pointer-events:none' });
  const live = document.importNode(svg, true);
  if (!live.getAttribute('viewBox')) {
    const w = parseFloat(live.getAttribute('width')) || 300, hh = parseFloat(live.getAttribute('height')) || 150;
    live.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  }
  live.setAttribute('width', '800'); live.setAttribute('height', '800');
  host.appendChild(live); document.body.appendChild(host);
  let parts = [], extras = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  try {
    const rootInv = live.getScreenCTM().inverse();
    [...live.querySelectorAll(SHAPES)].forEach((el, ei) => {
      if (el.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const d = shapeToD(el); if (!d) return;
      const M = rootInv.multiply(el.getScreenCTM());
      let len = 0; try { len = el.getTotalLength(); } catch (e) {}
      let bb; try { bb = el.getBBox(); } catch (e) { return; }
      const sw = parseFloat(cs.strokeWidth) || 0;
      const stroke = sw > 0 ? resolvePaint(cs.stroke, live) : null;
      const fill = resolvePaint(cs.fill, live);
      if (!stroke && !fill) return;
      const ms = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
      const pad = stroke ? sw / 2 : 0;
      const pts = [[bb.x - pad, bb.y - pad], [bb.x + bb.width + pad, bb.y - pad], [bb.x - pad, bb.y + bb.height + pad], [bb.x + bb.width + pad, bb.y + bb.height + pad]]
        .map(([x, y]) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
      parts.push({ path:new Path2D(d), m:[M.a, M.b, M.c, M.d, M.e, M.f], ms, len:len || 500, fill, stroke, sw,
        rule:cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', cap:cs.strokeLinecap || 'butt', join:cs.strokeLinejoin || 'miter',
        op:parseFloat(cs.opacity) || 1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, x0, y0, x1, y1, ei, grad:/url\(/.test(cs.fill + cs.stroke) });
    });
    // texto, imagem embutida e <use> não viram partes, mas entram no recorte (e na caneta, como imagem)
    live.querySelectorAll('text,image,use').forEach(el => {
      if (el.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      try {
        const bb = el.getBBox(), M = rootInv.multiply(el.getScreenCTM()); if (!bb.width || !bb.height) return;
        for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]) {
          const X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f;
          minX = Math.min(minX, X); minY = Math.min(minY, Y); maxX = Math.max(maxX, X); maxY = Math.max(maxY, Y);
        }
        extras++;
      } catch (e) {}
    });
    if (!parts.length && !extras) { const b = live.getBBox(); minX = b.x; minY = b.y; maxX = b.x + b.width; maxY = b.y + b.height; }
  } finally { host.remove(); }
  const pad = Math.max(maxX - minX, maxY - minY) * .015;
  const bx = minX - pad, by = minY - pad, bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2;
  // imagem do logo recortada no bbox; `hide` esconde formas (índices em SHAPES) para as camadas da caneta
  const snap = async (hide, hideExtras) => {
    const clone = document.importNode(svg, true);
    if (hide) {
      const all = clone.querySelectorAll(SHAPES), off = el => el.setAttribute('style', (el.getAttribute('style') || '') + ';display:none');
      hide.forEach(i => all[i] && off(all[i]));
      if (hideExtras) clone.querySelectorAll('text,image,use').forEach(off);
    }
    clone.setAttribute('viewBox', `${bx} ${by} ${bw} ${bh}`);
    const k = 1200 / Math.max(bw, bh);
    clone.setAttribute('width', String(bw * k)); clone.setAttribute('height', String(bh * k));
    clone.removeAttribute('style');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type:'image/svg+xml' }));
    return { img:await loadImg(url), url };
  };
  const { img, url } = await snap();
  const lg = { img, isSvg:true, parts, extras, bx, by, bw, bh, url };
  try { lg.pen = await buildPen(lg, parts, snap); } catch (e) { console.warn(e); lg.pen = null; }
  return lg;
}

/* ============================================================
   Caneta: preset "Escrever letra a letra" (handwrite)
   ============================================================
   O logo vira um mapa de tempos: cada pixel guarda o instante em que a caneta passa por ele. No render a máscara
   (tempo ≤ agora) recorta a própria imagem do logo, então cores, degradês, cantos e serifas saem certos e o último
   quadro é exatamente o logo, sem troca no fim.
   1. Rasteriza cada forma do SVG (ou o PNG inteiro) numa grade de PEN_RES px e separa as ilhas
      (letras, pingos, acentos, peças do símbolo), não importa como o SVG foi montado. Texto, imagem embutida e
      <use> entram como mais uma fonte (renderizados sozinhos).
   2. Ordem (penOrder, corte XY): moldura (anel, selo) primeiro; linhas de texto de cima para baixo; colunas cortadas
      no maior vão (símbolo | texto); o resto da esquerda para a direita. Pingo, acento e sublinhado entram logo depois
      da letra (ou palavra) deles.
   3. Ilha fina (letra, linha): esqueleto (Zhang-Suen; traço grosso numa cópia reduzida) → grafo → traços. Em cada nó
      as pontas se ligam da mais reta para a mais torta: a caneta segue sem levantar sempre que dá. Traço sem canto
      vivo (S, J, C, g) começa por cima; com canto (N, M, Z, r), pela esquerda; ponta solta conta como mais alta
      (a letra começa pela haste, não pelo meio). Laços começam em cima à esquerda e giram anti-horário.
      Ilha cheia (coração, bola, selo): contorna a borda e preenche em colunas, descendo e subindo, da esquerda para
      a direita. Pingo: cresce do centro.
   4. A caneta é um disco com a largura local da letra (raio = distância até a borda) que percorre o traço; cada pixel
      fica com o instante em que o disco chega nele. O que o disco não alcança (pontas, cantos, serifas, sombras)
      herda do vizinho pintado mais próximo. A tinta anda sempre na mesma velocidade; caneta no ar custa `penGap`.
   Formas sobrepostas de cores diferentes viram camadas separadas (até 4), cada uma com sua imagem e seu mapa. */
const PEN_RES = 1000, PEN_LAG = 1;
const penGap = d => 4 + d * .22;

// distância até a borda (chanfro 1/√2); bordas da grade precisam ser 0
function penChamfer(M, w, h) {
  const N = w * h, D = new Float32Array(N);
  for (let i = 0; i < N; i++) D[i] = M[i] ? 1e9 : 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w] + 1, D[i - w - 1] + 1.4142, D[i - w + 1] + 1.4142);
  }
  for (let y = h - 2; y > 0; y--) for (let x = w - 2; x > 0; x--) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w] + 1, D[i + w + 1] + 1.4142, D[i + w - 1] + 1.4142);
  }
  return D;
}
// afinamento Zhang-Suen, no lugar
function penThin(S, w, h) {
  const O = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1], del = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; if (!S[i]) continue;
        const p2 = S[i + O[0]], p3 = S[i + O[1]], p4 = S[i + O[2]], p5 = S[i + O[3]], p6 = S[i + O[4]], p7 = S[i + O[5]], p8 = S[i + O[6]], p9 = S[i + O[7]];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A !== 1) continue;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      if (del.length) { changed = true; for (const i of del) S[i] = 0; }
    }
  }
}
// esqueleto → grafo: nós (pontas e cruzamentos), trechos entre nós e laços sem nó
function penGraph(M, D, w, h) {
  const N = w * h, S = new Uint8Array(M);
  penThin(S, w, h);
  const O = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1]; // N, NE, E, SE, S, SW, W, NW
  const trans = i => { let A = 0; for (let d = 0; d < 8; d++) if (!S[i + O[d]] && S[i + O[(d + 1) % 8]]) A++; return A; };
  const cl = new Int32Array(N).fill(-1), nodes = [];
  for (let i = 0; i < N; i++) {
    if (!S[i] || cl[i] >= 0) continue;
    const A = trans(i); if (A === 2 || A === 0) continue;
    const id = nodes.length, q = [i], mem = []; cl[i] = id;
    while (q.length) {
      const j = q.pop(); mem.push(j);
      if (A < 3) continue; // ponta: nó de um pixel só
      for (let d = 0; d < 8; d++) { const u = j + O[d]; if (S[u] && cl[u] < 0 && trans(u) >= 3) { cl[u] = id; q.push(u); } }
    }
    nodes.push({ mem, end:A === 1 });
  }
  const used = new Set(), vis = new Uint8Array(N), edges = [];
  const walk = (s, d0) => {
    const a = cl[s], chain = [s]; let prev = s, cur = s + O[d0];
    used.add(s * 8 + d0);
    for (let guard = 0; guard < N; guard++) {
      chain.push(cur);
      if (cl[cur] >= 0 && (cl[cur] !== a || chain.length > 3)) {
        const back = O.indexOf(prev - cur); if (back >= 0) used.add(cur * 8 + back);
        return { chain, a, b:cl[cur] };
      }
      if (cl[cur] < 0) vis[cur] = 1;
      let nx = -1, best = 9;
      for (let d = 0; d < 8; d++) {
        const u = cur + O[d]; if (!S[u] || u === prev) continue;
        let pr;
        if (cl[u] >= 0) { if (cl[u] === a && chain.length < 4) continue; if (used.has(u * 8 + O.indexOf(cur - u))) continue; pr = 0; }
        else { if (vis[u]) continue; pr = d % 2 ? 2 : 1; }
        if (pr < best) { best = pr; nx = u; }
      }
      if (nx < 0) return { chain, a, b:-1 };
      prev = cur; cur = nx;
    }
    return { chain, a, b:-1 };
  };
  nodes.forEach(nd => nd.mem.forEach(s => {
    for (let d = 0; d < 8; d++) {
      const u = s + O[d];
      if (!S[u] || cl[u] === cl[s] || used.has(s * 8 + d) || (cl[u] < 0 && vis[u])) continue;
      const e = walk(s, d); if (e.chain.length >= 2) edges.push(e);
    }
  }));
  const loops = [];
  for (let i = 0; i < N; i++) {
    if (!S[i] || vis[i] || cl[i] >= 0) continue;
    const chain = [i]; vis[i] = 1; let cur = i;
    for (;;) {
      let nx = -1;
      for (let d = 0; d < 8; d += 2) { const u = cur + O[d]; if (S[u] && !vis[u] && cl[u] < 0) { nx = u; break; } }
      if (nx < 0) for (let d = 1; d < 8; d += 2) { const u = cur + O[d]; if (S[u] && !vis[u] && cl[u] < 0) { nx = u; break; } }
      if (nx < 0) break;
      vis[nx] = 1; chain.push(nx); cur = nx;
    }
    if (chain.length > 6) loops.push(chain);
  }
  // poda: espinhos curtos de uma ponta até um cruzamento (sobras de cantos)
  for (let pass = 0; pass < 2; pass++) {
    const deg = nodes.map(() => 0);
    edges.forEach(e => { if (e.dead) return; if (e.a >= 0) deg[e.a]++; if (e.b >= 0) deg[e.b]++; });
    edges.forEach(e => {
      if (e.dead) return;
      const ea = e.a >= 0 && deg[e.a] === 1, eb = e.b >= 0 && deg[e.b] === 1;
      if (ea === eb) return;
      const jp = ea ? e.chain[e.chain.length - 1] : e.chain[0];
      if (e.chain.length < D[jp] * 1.6 + 2) { e.dead = true; if (e.a >= 0) deg[e.a]--; if (e.b >= 0) deg[e.b]--; }
    });
  }
  // funde cruzamentos colados (um "T" costuma virar dois nós com um trechinho entre eles)
  // e liga trechos que terminaram soltos rente a um nó
  const par = nodes.map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const nodeAt = pix => { for (let d = 0; d < 8; d++) { const u = pix + O[d]; if (cl[u] >= 0) return cl[u]; } for (let d = 0; d < 8; d++) for (let d2 = 0; d2 < 8; d2++) { const u = pix + O[d] + O[d2]; if (u >= 0 && u < N && cl[u] >= 0) return cl[u]; } return -1; };
  edges.forEach(e => {
    if (e.dead) return;
    if (e.b < 0) e.b = nodeAt(e.chain[e.chain.length - 1]);
    if (e.a >= 0 && e.b >= 0 && e.a !== e.b && !nodes[e.a].end && !nodes[e.b].end) {
      const jp = e.chain[0];
      if (e.chain.length <= Math.max(4, D[jp] * .8)) { par[find(e.b)] = find(e.a); e.dead = true; }
    }
  });
  edges.forEach(e => { if (e.a >= 0) e.a = find(e.a); if (e.b >= 0) e.b = find(e.b); });
  return { edges:edges.filter(e => !e.dead), loops };
}
// pixels → pontos suavizados (centro do pixel) com o raio local
function penSmooth(chain, D, w) {
  const raw = chain.map(i => [i % w + .5, Math.floor(i / w) + .5, D[i]]);
  const n = raw.length, pts = [], rs = [];
  for (let i = 0; i < n; i += (i === 0 || i >= n - 2) ? 1 : 2) {
    let sx = 0, sy = 0, c = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { sx += raw[j][0]; sy += raw[j][1]; c++; }
    const keep = i === 0 || i === n - 1;
    pts.push(keep ? [raw[i][0], raw[i][1]] : [sx / c, sy / c]); rs.push(raw[i][2]);
  }
  return { pts, rs };
}
function penResample(P, sp) {
  const out = [P[0]]; let acc = 0;
  for (let i = 1; i < P.length; i++) {
    let a = P[i - 1]; const b = P[i]; let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (L > 0 && acc + L >= sp) { const f = (sp - acc) / L; a = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; out.push(a); L = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; }
    acc += L;
  }
  return out;
}
// canto vivo: o traço vira mais de 100° num trecho curto (N, M, Z, V, r). Traço sem canto (S, J, C, g, l) começa
// por cima; com canto, pela esquerda
function penCorner(P, R) {
  let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const rm = [...R].sort((a, b) => a - b)[R.length >> 1] || 2, wl = Math.max(rm, L / 25), Q = penResample(P, wl / 2);
  const hd = [];
  for (let i = 1; i < Q.length; i++) {
    const a = Math.atan2(Q[i][1] - Q[i - 1][1], Q[i][0] - Q[i - 1][0]);
    if (!hd.length) { hd.push(a); continue; }
    const p = hd[hd.length - 1], d = a - p; hd.push(p + d - TAU * Math.round(d / TAU));
  }
  for (let i = 2; i < hd.length - 2; i++) if (Math.abs(hd[i + 2] - hd[i - 2]) > 1.75) return true;
  return false;
}
// sentido de cada traço. Aberto: começa na ponta de menor x + a·y; ponta solta conta como 0,6 altura mais alta
// (a letra começa pela haste, não pelo meio). Fechado: começa em cima à esquerda e gira anti-horário
function penOrient(s, h) {
  let P = s.pts, R = s.rs;
  if (!s.closed) {
    const al = penCorner(P, R) ? .2 : 2, f = (q, free) => q[0] + al * (q[1] - (free ? h * .6 : 0));
    if (f(P[P.length - 1], s.fb) < f(P[0], s.fa)) { P.reverse(); R.reverse(); }
    return;
  }
  if (P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 3) { P = P.slice(0, -1); R = R.slice(0, -1); }
  let iS = 0; P.forEach((q, i) => { if (q[0] + .5 * q[1] < P[iS][0] + .5 * P[iS][1]) iS = i; });
  P = P.slice(iS).concat(P.slice(0, iS)); R = R.slice(iS).concat(R.slice(0, iS));
  let A = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; }
  if (A > 0) { P = [P[0], ...P.slice(1).reverse()]; R = [R[0], ...R.slice(1).reverse()]; }
  P.push(P[0]); R.push(R[0]); s.pts = P; s.rs = R;
}
// traços de uma ilha fina, já na ordem de escrita
function penStrokes(M, D, w, h) {
  const { edges, loops } = penGraph(M, D, w, h);
  const E = edges.map(e => Object.assign(penSmooth(e.chain, D, w), { a:e.a, b:e.b })).filter(e => e.pts.length > 1);
  const deg = {}; E.forEach(e => [e.a, e.b].forEach(n => { if (n >= 0) deg[n] = (deg[n] || 0) + 1; }));
  // alonga pontas soltas pelo raio, para a tinta chegar até a ponta da letra
  E.forEach(e => {
    const j = Math.min(3, e.pts.length - 1);
    const ext = (i, k) => { const p = e.pts[i], q = e.pts[k], L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, r = e.rs[i] * .8; return [p[0] + (p[0] - q[0]) / L * r, p[1] + (p[1] - q[1]) / L * r]; };
    if (e.a < 0 || deg[e.a] === 1) { e.pts.unshift(ext(0, j)); e.rs.unshift(e.rs[0]); }
    if (e.b < 0 || deg[e.b] === 1) { const m = e.pts.length; e.pts.push(ext(m - 1, m - 1 - j)); e.rs.push(e.rs[m - 1]); }
  });
  // direção de saída de uma ponta (id = trecho*2 + lado), medida a ~2,5 raios do nó (perto do cruzamento o esqueleto entorta)
  const dirOut = id => {
    const e = E[id >> 1], fw = !(id & 1), P = fw ? e.pts : e.pts.slice().reverse(), p = P[0];
    const far = Math.max((fw ? e.rs[0] : e.rs[e.rs.length - 1]) * 2.5, 3);
    let q = P[P.length - 1], acc = 0;
    for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc >= far) { q = P[i]; break; } }
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  };
  // em cada nó, liga as pontas em pares: primeiro o par mais reto (até 140° de virada); sobra ponta = caneta levanta
  const link = new Int32Array(E.length * 2).fill(-1), at = {};
  E.forEach((e, i) => { if (e.a >= 0) (at[e.a] = at[e.a] || []).push(i * 2); if (e.b >= 0) (at[e.b] = at[e.b] || []).push(i * 2 + 1); });
  Object.values(at).forEach(L => {
    if (L.length === 2) { link[L[0]] = L[1]; link[L[1]] = L[0]; return; }
    if (L.length < 3) return;
    const dv = L.map(dirOut), pairs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pairs.push([Math.acos(clamp(-(dv[i][0] * dv[j][0] + dv[i][1] * dv[j][1]), -1, 1)), L[i], L[j]]);
    pairs.sort((p, q) => p[0] - q[0]);
    for (const [t, a, b] of pairs) if (t < 2.45 && link[a] < 0 && link[b] < 0) { link[a] = b; link[b] = a; }
  });
  const used = new Uint8Array(E.length), out = [];
  const free = id => { const e = E[id >> 1], n = id & 1 ? e.b : e.a; return n < 0 || deg[n] === 1; };
  const follow = id => {
    const P = [], R = [], fa = free(id);
    let end = id;
    while (id >= 0 && !used[id >> 1]) {
      const e = E[id >> 1], fw = !(id & 1); used[id >> 1] = 1;
      const pts = fw ? e.pts : e.pts.slice().reverse(), rs = fw ? e.rs : e.rs.slice().reverse();
      for (let k = P.length ? 1 : 0; k < pts.length; k++) { P.push(pts[k]); R.push(rs[k]); }
      end = id ^ 1; id = link[end];
    }
    return { pts:P, rs:R, fa, fb:free(end) };
  };
  for (let id = 0; id < E.length * 2; id++) if (link[id] < 0 && !used[id >> 1]) { const s = follow(id); if (s.pts.length > 1) out.push(Object.assign(s, { closed:false })); }
  for (let i = 0; i < E.length; i++) if (!used[i]) { const s = follow(i * 2); if (s.pts.length > 2) out.push(Object.assign(s, { closed:true })); }
  loops.forEach(ch => { const s = penSmooth(ch, D, w); if (s.pts.length > 2) out.push(Object.assign(s, { closed:true })); });
  out.forEach(s => penOrient(s, h));
  // ordem: palavra emendada (ilha larga) vai da esquerda para a direita; letra vai de cima para baixo e, na mesma altura, da esquerda
  if (w > h * 1.4) return out.sort((a, b) => a.pts[0][0] + .3 * a.pts[0][1] - b.pts[0][0] - .3 * b.pts[0][1]);
  out.forEach(s => { s.top = Math.min(...s.pts.map(q => q[1])); });
  out.sort((a, b) => a.top - b.top);
  const res = [], tol = h * .15, key = s => s.pts[0][0] + .5 * s.pts[0][1];
  let grp = [];
  const flush = () => { res.push(...grp.sort((a, b) => key(a) - key(b))); grp = []; };
  out.forEach(s => { if (grp.length && s.top - grp[0].top > tol) flush(); grp.push(s); });
  flush();
  return res;
}
// traço grosso: o esqueleto sai de uma cópia reduzida (fica ~5 px de raio nos traços finos), bem mais rápido;
// os pontos voltam para a grade cheia e o raio é medido nela
function penStrokesFast(M, D, w, h) {
  const rid = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = D[i];
    if (v && v >= D[i - 1] && v >= D[i + 1] && v >= D[i - w] && v >= D[i + w]) rid.push(v);
  }
  rid.sort((a, b) => a - b);
  const f = clamp(Math.floor((rid[Math.floor(rid.length * .25)] || 0) / 5), 1, 6);
  if (f === 1) return penStrokes(M, D, w, h);
  const w2 = Math.ceil(w / f) + 4, h2 = Math.ceil(h / f) + 4, M2 = new Uint8Array(w2 * h2);
  for (let y2 = 2; y2 < h2 - 2; y2++) for (let x2 = 2; x2 < w2 - 2; x2++) {
    let c = 0, n = 0;
    for (let y = (y2 - 2) * f, ye = Math.min(h, y + f); y < ye; y++) for (let x = (x2 - 2) * f, xe = Math.min(w, x + f); x < xe; x++) { n++; c += M[y * w + x]; }
    M2[y2 * w2 + x2] = n && c * 2 >= n ? 1 : 0;
  }
  const rad = (x, y) => {
    let r = 1;
    for (let yy = Math.max(0, Math.floor(y - f)), ye = Math.min(h - 1, Math.ceil(y + f)); yy <= ye; yy++)
      for (let xx = Math.max(0, Math.floor(x - f)), xe = Math.min(w - 1, Math.ceil(x + f)); xx <= xe; xx++) if (D[yy * w + xx] > r) r = D[yy * w + xx];
    return r;
  };
  return penStrokes(M2, penChamfer(M2, w2, h2), w2, h2).map(s => {
    s.pts = s.pts.map(q => [(q[0] - 2) * f, (q[1] - 2) * f]);
    s.rs = s.pts.map(q => rad(q[0], q[1]));
    return s;
  });
}
// contorno externo (vizinhança de Moore), no sentido horário da tela, começando no pixel mais alto à esquerda
function penContour(M, w, h) {
  let s = -1; for (let i = 0; i < w * h; i++) if (M[i]) { s = i; break; }
  if (s < 0) return [];
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const dirOf = (dx, dy) => { for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return d; return 4; };
  const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && M[y * w + x];
  const sx = s % w, sy = (s - sx) / w, path = [];
  let cx = sx, cy = sy, bd = 4, f0 = -1;
  for (let guard = 0; guard < w * h * 2; guard++) {
    let f = -1;
    for (let k = 1; k <= 8; k++) { const d = (bd + k) % 8; if (fg(cx + DX[d], cy + DY[d])) { f = d; break; } }
    if (f < 0) { path.push([cx + .5, cy + .5]); break; }
    if (cx === sx && cy === sy) { if (f0 < 0) f0 = f; else if (f === f0) break; }
    path.push([cx + .5, cy + .5]);
    const pd = (f + 7) % 8, bx = cx + DX[pd], by = cy + DY[pd];
    cx += DX[f]; cy += DY[f]; bd = dirOf(bx - cx, by - cy);
  }
  return path;
}
// suaviza um contorno fechado e começa no ponto mais alto à esquerda
function penRing(P) {
  const n = P.length; if (n < 4) return P;
  const Q = [];
  for (let i = 0; i < n; i += 2) { let sx = 0, sy = 0; for (let k = -3; k <= 3; k++) { const q = P[(i + k + n) % n]; sx += q[0]; sy += q[1]; } Q.push([sx / 7, sy / 7]); }
  let iS = 0; Q.forEach((q, i) => { if (q[0] + .5 * q[1] < Q[iS][0] + .5 * Q[iS][1]) iS = i; });
  const R = Q.slice(iS).concat(Q.slice(0, iS)); R.push(R[0]);
  return R;
}
// a caneta: um disco com a largura local da forma percorre cada traço; o pixel fica com o instante em que o disco
// chega nele pela primeira vez (ponta redonda, junções cobertas). Devolve o tempo no fim.
function penStamp(strokes, tau, g, R) {
  const { w, h, T } = g;
  let last = null;
  for (const s of strokes) {
    const P = s.pts, rs = s.rs;
    if (last) tau += penGap(Math.hypot(P[0][0] - last[0], P[0][1] - last[1]));
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[k + 1] || a, ra = rs[k], rb = k + 1 < P.length ? rs[k + 1] : ra, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / Math.max(.5, Math.min(ra, rb) * .2)));
      for (let j = 0; j < n; j++) {
        const f = j / n, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, r = ra + (rb - ra) * f, t = tau + L * f, r2 = r * r;
        const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.floor(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.floor(y + r));
        for (let yy = y0; yy <= y1; yy++) {
          const dy = yy + .5 - y;
          for (let xx = x0, i = yy * w + x0; xx <= x1; xx++, i++) { const dx = xx + .5 - x; if (dx * dx + dy * dy <= r2 && R[i] && T[i] === Infinity) T[i] = t; }
        }
      }
      tau += L;
    }
    last = P[P.length - 1];
  }
  return tau;
}
// o que o disco não alcançou (pontas, cantos, serifas, franja): herda do pixel pintado mais próximo,
// por dentro da forma, com atraso pela distância. Só preenche; nunca adianta quem já tem tempo.
function penFill(g, R) {
  const { w, h, T } = g, N = w * h, dist = new Float32Array(N).fill(Infinity), own = new Float32Array(N), free = new Uint8Array(N);
  for (let i = 0; i < N; i++) free[i] = R[i] && T[i] === Infinity ? 1 : 0;
  let cap = 1024, hi = new Int32Array(cap), hd = new Float32Array(cap), n = 0;
  const push = (i, d) => {
    if (n === cap) { cap *= 2; const a = new Int32Array(cap); a.set(hi); hi = a; const b = new Float32Array(cap); b.set(hd); hd = b; }
    let c = n++;
    while (c > 0) { const p = (c - 1) >> 1; if (hd[p] <= d) break; hi[c] = hi[p]; hd[c] = hd[p]; c = p; }
    hi[c] = i; hd[c] = d;
  };
  const OX = [-1, 1, 0, 0, -1, 1, -1, 1], OY = [0, 0, -1, 1, -1, -1, 1, 1], OC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  for (let i = 0; i < N; i++) {
    if (!R[i] || free[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (let k = 0; k < 8; k++) {
      const xx = x + OX[k], yy = y + OY[k];
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && free[yy * w + xx]) { dist[i] = 0; own[i] = T[i]; push(i, 0); break; }
    }
  }
  while (n) {
    const i = hi[0], d = hd[0], li = hi[--n], ld = hd[n];
    let c = 0;
    for (;;) { let l = c * 2 + 1; if (l >= n) break; if (l + 1 < n && hd[l + 1] < hd[l]) l++; if (hd[l] >= ld) break; hi[c] = hi[l]; hd[c] = hd[l]; c = l; }
    hi[c] = li; hd[c] = ld;
    if (d > dist[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (let k = 0; k < 8; k++) {
      const xx = x + OX[k], yy = y + OY[k]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const u = yy * w + xx; if (!free[u]) continue;
      const nd = d + OC[k]; if (nd < dist[u]) { dist[u] = nd; own[u] = own[i]; push(u, nd); }
    }
  }
  for (let i = 0; i < N; i++) if (free[i] && dist[i] < Infinity) T[i] = own[i] + dist[i] * PEN_LAG;
}
// grade local de uma ilha: M = a ilha, R = ilha + franja antisserrilhada encostada nela
function penGrid(s, it) {
  const pad = 2, lx = it.bx0 - pad, ly = it.by0 - pad, w = it.bx1 - it.bx0 + 1 + pad * 2, h = it.by1 - it.by0 + 1 + pad * 2, N = w * h;
  const M = new Uint8Array(N), R = new Uint8Array(N);
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + lx, Y = y + ly; if (X < 0 || Y < 0 || X >= s.w || Y >= s.h) continue;
    if (s.lab[Y * s.w + X] === it.id) { M[y * w + x] = 1; sx += x + .5; sy += y + .5; n++; }
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (M[i]) { R[i] = 1; continue; }
    const X = x + lx, Y = y + ly; if (X < 0 || Y < 0 || X >= s.w || Y >= s.h) continue;
    const j = Y * s.w + X; if (!s.A[j] || s.lab[j] >= 0) continue;
    if (M[i - 1] || M[i + 1] || M[i - w] || M[i + w] || M[i - w - 1] || M[i - w + 1] || M[i + w - 1] || M[i + w + 1]) R[i] = 1;
  }
  return { lx, ly, w, h, M, R, T:new Float32Array(N).fill(Infinity), cx:sx / (n || 1), cy:sy / (n || 1), bw:it.bx1 - it.bx0 + 1, bh:it.by1 - it.by0 + 1 };
}
function penRunStrokes(g, strokes, tau) {
  tau = penStamp(strokes, tau, g, g.R);
  penFill(g, g.R);
  const P = strokes[strokes.length - 1].pts;
  return { tau, last:P[P.length - 1] };
}
// forma cheia: contorna a borda e depois preenche em colunas, descendo e subindo da esquerda para a direita
function penRunMass(g, rMax, C, tau) {
  const { w, M, R, T } = g, N = w * g.h;
  const band = clamp(Math.min(g.bw, g.bh) * .07, 2, Math.max(2, rMax * .5));
  const t1 = penStamp([{ pts:C, rs:C.map(() => band) }], tau, g, R);
  const outline = t1 - tau; tau = t1;
  let ix0 = w, ix1 = -1;
  for (let i = 0; i < N; i++) if (M[i] && T[i] === Infinity) { const x = i % w; if (x < ix0) ix0 = x; if (x > ix1) ix1 = x; }
  if (ix1 < 0) { penFill(g, R); return { tau, last:C[C.length - 1] }; }
  const span = ix1 - ix0 + 1, cw = Math.max(3, band * 2, span / 14), K = Math.ceil(span / cw);
  const lo = new Float32Array(K).fill(Infinity), hi = new Float32Array(K).fill(-Infinity), col = x => Math.min(K - 1, Math.floor((x - ix0) / cw));
  for (let i = 0; i < N; i++) if (M[i] && T[i] === Infinity) { const x = i % w, y = (i - x) / w, c = col(x); if (y < lo[c]) lo[c] = y; if (y > hi[c]) hi[c] = y; }
  let len = 0; for (let c = 0; c < K; c++) if (hi[c] >= lo[c]) len += hi[c] - lo[c] + 1 + cw;
  const hk = Math.min(.5, outline * 1.5 / Math.max(len, 1)), t0 = new Float32Array(K), down = new Uint8Array(K);
  let at = tau, lastC = 0, n = 0;
  for (let c = 0; c < K; c++) { t0[c] = at; if (hi[c] < lo[c]) continue; down[c] = n++ % 2 === 0 ? 1 : 0; at += (hi[c] - lo[c] + 1 + cw) * hk; lastC = c; }
  for (let i = 0; i < N; i++) if (M[i] && T[i] === Infinity) {
    const x = i % w, y = (i - x) / w, c = col(x);
    T[i] = t0[c] + ((down[c] ? y - lo[c] : hi[c] - y) + (x - ix0 - c * cw) * .5) * hk;
  }
  penFill(g, R);
  return { tau:at, last:[ix0 + (lastC + .5) * cw, down[lastC] ? hi[lastC] : lo[lastC]] };
}
// pingo: cresce do centro
function penRunDot(g, tau) {
  let md = 0;
  for (let i = 0; i < g.R.length; i++) if (g.R[i]) {
    const x = i % g.w + .5, y = Math.floor(i / g.w) + .5, d = Math.hypot(x - g.cx, y - g.cy);
    if (d > md) md = d; if (tau + d < g.T[i]) g.T[i] = tau + d;
  }
  return { tau:tau + Math.max(4, md), last:[g.cx, g.cy] };
}
// ordem de leitura das ilhas (corte XY)
function penOrder(items) {
  if (items.length < 2) return items.slice();
  const ba = o => (o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1);
  if (items.length > 2) { // moldura: anel ou selo que envolve o resto vem primeiro
    const big = items.reduce((a, b) => ba(b) > ba(a) ? b : a), rest = items.filter(o => o !== big);
    const inside = rest.filter(o => o.cx > big.x0 && o.cx < big.x1 && o.cy > big.y0 && o.cy < big.y1).length;
    if (inside >= rest.length * .6 && ba(big) > 2.5 * Math.max(...rest.map(ba))) return [big, ...penOrder(rest)];
  }
  const split = (lo, hi) => {
    const s = items.slice().sort((a, b) => lo(a) - lo(b)), groups = []; let end = -Infinity;
    for (const o of s) { if (!groups.length || lo(o) > end) { groups.push([]); end = hi(o); } else end = Math.max(end, hi(o)); groups[groups.length - 1].push(o); }
    return groups;
  };
  // linhas de texto (3+ ilhas, faixa larga) de cima para baixo
  const rows = split(o => o.y0 + (o.y1 - o.y0) * .18, o => o.y1 - (o.y1 - o.y0) * .18);
  const text = r => r.length >= 3 && Math.max(...r.map(o => o.x1)) - Math.min(...r.map(o => o.x0)) > 2 * (Math.max(...r.map(o => o.y1)) - Math.min(...r.map(o => o.y0)));
  if (rows.length > 1 && rows.some(text)) {
    const info = rows.map(r => { const hs = r.map(o => o.y1 - o.y0).sort((a, b) => a - b); return { r, kids:[], area:r.reduce((s, o) => s + o.area, 0), h:hs[hs.length >> 1], y0:Math.min(...r.map(o => o.y0)), y1:Math.max(...r.map(o => o.y1)) }; });
    const A = Math.max(...info.map(o => o.area)), H = Math.max(...info.map(o => o.h));
    const small = o => o.area < A * .3 && o.h < H * .5, gap = (a, b) => Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
    // pingos, acentos e sublinhados (pequenos e colados numa linha) entram junto com ela; o resto é linha própria
    const major = info.filter(o => !small(o));
    info.filter(small).forEach(o => {
      const m = major.reduce((a, b) => gap(o, b) < gap(o, a) ? b : a);
      if (gap(o, m) < m.h * .6) { o.minor = true; m.kids.push(o); }
    });
    return info.filter(o => !o.minor).flatMap(m => {
      const seq = penOrder(m.r), extra = m.kids.flatMap(k => penOrder(k.r));
      extra.forEach(o => { // logo depois da última letra que ele cobre na linha mais próxima: o pingo depois do i, o sublinhado depois da palavra
        const cand = seq.filter(b => !extra.includes(b) && Math.min(o.x1, b.x1) > Math.max(o.x0, b.x0));
        const g0 = Math.min(...cand.map(b => gap(o, b))), tol = Math.max(...cand.map(b => b.y1 - b.y0), 0) * .5;
        let at = -1;
        seq.forEach((b, i) => { if (cand.includes(b) && gap(o, b) <= g0 + tol) at = i; });
        if (at < 0) seq.forEach((b, i) => { if (!extra.includes(b) && b.cx < o.cx) at = i; });
        at++; while (at < seq.length && extra.includes(seq[at])) at++;
        seq.splice(at, 0, o);
      });
      return seq;
    });
  }
  // colunas: corta só no maior vão (símbolo | texto) e cada lado volta para cá, onde pode ter as próprias linhas
  const cols = split(o => o.x0, o => o.x1);
  if (cols.length > 1) {
    let k = 1, best = -Infinity;
    for (let i = 1; i < cols.length; i++) { const g = Math.min(...cols[i].map(o => o.x0)) - Math.max(...cols[i - 1].map(o => o.x1)); if (g > best) { best = g; k = i; } }
    return [...penOrder(cols.slice(0, k).flat()), ...penOrder(cols.slice(k).flat())];
  }
  // o resto, da esquerda para a direita; peça pequena acima ou abaixo de outra maior (pingo, acento) vem logo depois dela
  const s = items.slice().sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  const host = o => s.filter(b => b !== o && b.area > o.area * 4 && (o.y1 < b.y0 || o.y0 > b.y1) && o.cx > b.x0 && o.cx < b.x1).sort((a, b) => b.area - a.area)[0];
  const kids = new Map(), top = [];
  s.forEach(o => { const b = host(o); if (b) { if (!kids.has(b)) kids.set(b, []); kids.get(b).push(o); } else top.push(o); });
  const out = [], put = o => { out.push(o); (kids.get(o) || []).forEach(put); };
  top.forEach(put);
  return out;
}
function penDilate(T, w, h, n) {
  for (let k = 0; k < n; k++) {
    const P = T.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (P[i] !== Infinity) continue;
      let v = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const u = P[yy * w + xx]; if (u < v) v = u;
      }
      T[i] = v;
    }
  }
}
async function buildPen(lg, parts, snap) {
  const km = PEN_RES / Math.max(lg.bw, lg.bh, 1e-6);
  const MW = Math.max(4, Math.ceil(lg.bw * km)), MH = Math.max(4, Math.ceil(lg.bh * km));
  const grid = document.createElement('canvas'); grid.width = MW; grid.height = MH;
  const cx = grid.getContext('2d', { willReadFrequently:true });
  const srcs = [];
  const grab = (x0, y0, x1, y1, o) => {
    x0 = clamp(x0, 0, MW); y0 = clamp(y0, 0, MH); x1 = clamp(x1, 0, MW); y1 = clamp(y1, 0, MH);
    const w = x1 - x0, h = y1 - y0; if (w < 1 || h < 1) return;
    const d = cx.getImageData(x0, y0, w, h).data, A = new Uint8Array(w * h);
    let ink = 0; for (let i = 0; i < w * h; i++) { A[i] = d[i * 4 + 3]; if (A[i] >= 128) ink++; }
    if (ink) srcs.push(Object.assign({ x:x0, y:y0, w, h, A }, o));
  };
  if (parts.length) parts.forEach((pt, pi) => {
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, MW, MH);
    cx.setTransform(km, 0, 0, km, -lg.bx * km, -lg.by * km); cx.transform(...pt.m);
    cx.fillStyle = cx.strokeStyle = '#fff';
    if (pt.fill) cx.fill(pt.path, pt.rule);
    if (pt.stroke) { cx.lineWidth = pt.sw; cx.lineCap = pt.cap; cx.lineJoin = pt.join; cx.stroke(pt.path); }
    const m = 3 + (pt.stroke ? pt.sw * pt.ms * km * 2 : 0);
    grab(Math.floor((pt.x0 - lg.bx) * km - m), Math.floor((pt.y0 - lg.by) * km - m), Math.ceil((pt.x1 - lg.bx) * km + m), Math.ceil((pt.y1 - lg.by) * km + m),
      { pi, key:pt.grad || pt.op < 1 ? 'p' + pi : pt.fill && pt.stroke && pt.fill !== pt.stroke ? pt.fill + '|' + pt.stroke : pt.fill || pt.stroke });
  });
  else {
    cx.drawImage(lg.img, 0, 0, lg.bw * km, lg.bh * km);
    grab(0, 0, MW, MH, { pi:-1, key:'img' });
    const s = srcs[0]; if (!s) return null;
    let solid = 0; for (let i = 0; i < s.A.length; i++) if (s.A[i] > 250) solid++;
    if (solid > s.A.length * .92) return null; // PNG sem fundo transparente: não há forma para seguir
  }
  if (!srcs.length) return null;
  if (parts.length && lg.extras && snap) {
    // texto, imagem embutida e <use>: o SVG só com eles (formas escondidas) vira mais uma fonte, na camada de cima
    const only = (await snap(parts.map(pt => pt.ei))).img;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, MW, MH); cx.drawImage(only, 0, 0, lg.bw * km, lg.bh * km);
    grab(0, 0, MW, MH, { pi:-1, key:'rest', rest:true });
    const s = srcs[srcs.length - 1];
    if (s && s.rest) { // recorta no que tem tinta
      let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
      for (let i = 0; i < s.A.length; i++) if (s.A[i]) { const x = i % s.w, y = (i - x) / s.w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, A = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) A.set(s.A.subarray((y + y0) * s.w + x0, (y + y0) * s.w + x0 + w), y * w);
      Object.assign(s, { x:x0, y:y0, w, h, A });
    }
  }
  // ilhas (componentes conexos) de cada forma
  const items = [];
  srcs.forEach(s => {
    const { w, h, A } = s, N = w * h, lab = new Int32Array(N).fill(-1), st = new Int32Array(N);
    s.lab = lab; s.T = new Float32Array(N).fill(Infinity);
    for (let i = 0; i < N; i++) {
      if (A[i] < 128 || lab[i] >= 0) continue;
      const id = items.length; let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0, sx = 0, sy = 0;
      st[sp++] = i; lab[i] = id;
      while (sp) {
        const j = st[--sp], x = j % w, y = (j - x) / w; area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const u = yy * w + xx; if (A[u] >= 128 && lab[u] < 0) { lab[u] = id; st[sp++] = u; }
        }
      }
      items.push({ id, s, bx0:x0, by0:y0, bx1:x1, by1:y1, area, x0:x0 + s.x, y0:y0 + s.y, x1:x1 + s.x, y1:y1 + s.y, cx:sx / area + s.x + .5, cy:sy / area + s.y + .5 });
    }
  });
  const real = items.filter(o => o.area >= 3);
  if (!real.length) return null;
  const hs = real.map(o => o.y1 - o.y0 + 1).sort((a, b) => a - b), refH = hs[hs.length >> 1];
  // percurso: ilha por ilha, na ordem de leitura
  let tau = 0, last = null;
  for (const it of penOrder(real)) {
    const g = penGrid(it.s, it), D = penChamfer(g.M, g.w, g.h);
    let rMax = 0; for (let i = 0; i < D.length; i++) if (D[i] > rMax) rMax = D[i];
    const size = Math.max(g.bw, g.bh);
    let kind = it.area / (rMax * rMax) < 10 ? 'mass' : 'stroke', strokes = null, C = null;
    if (size < 6 || (kind === 'mass' && size < refH * .45)) kind = 'dot';
    if (kind === 'stroke') { strokes = penStrokesFast(g.M, D, g.w, g.h); if (!strokes.length) kind = 'dot'; }
    if (kind === 'mass') { C = penRing(penContour(g.M, g.w, g.h)); if (C.length < 4) kind = 'dot'; }
    const ox = g.lx + it.s.x, oy = g.ly + it.s.y;
    const first = kind === 'stroke' ? strokes[0].pts[0] : kind === 'mass' ? C[0] : [g.cx, g.cy];
    if (last) tau += penGap(Math.hypot(first[0] + ox - last[0], first[1] + oy - last[1]));
    const r = kind === 'stroke' ? penRunStrokes(g, strokes, tau) : kind === 'mass' ? penRunMass(g, rMax, C, tau) : penRunDot(g, tau);
    tau = r.tau; last = [r.last[0] + ox, r.last[1] + oy];
    const s = it.s;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const v = g.T[y * g.w + x]; if (v === Infinity) continue;
      const X = x + g.lx, Y = y + g.ly; if (X < 0 || Y < 0 || X >= s.w || Y >= s.h) continue;
      const j = Y * s.w + X; if (v < s.T[j]) s.T[j] = v;
    }
  }
  const total = Math.max(tau, 1);
  // camadas: forma que se sobrepõe a outra de outra cor (ou com degradê/transparência) vai para a camada de cima.
  // No máximo 4; o que sobra do SVG (texto, imagem) fica numa camada própria, por cima
  srcs.forEach((s, i) => {
    s.layer = 0;
    if (s.rest) return;
    for (let j = 0; j < i; j++) {
      const q = srcs[j], ox0 = Math.max(s.x, q.x), oy0 = Math.max(s.y, q.y), ox1 = Math.min(s.x + s.w, q.x + q.w), oy1 = Math.min(s.y + s.h, q.y + q.h);
      if (ox1 <= ox0 || oy1 <= oy0) continue;
      let hit = 0;
      for (let y = oy0; y < oy1 && hit < 8; y++) for (let x = ox0; x < ox1; x++) if (s.A[(y - s.y) * s.w + x - s.x] > 64 && q.A[(y - q.y) * q.w + x - q.x] > 64 && ++hit >= 8) break;
      if (hit >= 8) s.layer = Math.min(3, Math.max(s.layer, q.layer + (q.key === s.key ? 0 : 1)));
    }
  });
  const top = Math.max(...srcs.filter(s => !s.rest).map(s => s.layer), 0);
  srcs.forEach(s => { if (s.rest) s.layer = top + 1; });
  const layers = [];
  for (let l = 0, nL = Math.max(...srcs.map(s => s.layer)) + 1; l < nL; l++) {
    const ss = srcs.filter(s => s.layer === l); if (!ss.length) continue;
    const x0 = Math.max(0, Math.min(...ss.map(s => s.x)) - 3), y0 = Math.max(0, Math.min(...ss.map(s => s.y)) - 3);
    const x1 = Math.min(MW, Math.max(...ss.map(s => s.x + s.w)) + 3), y1 = Math.min(MH, Math.max(...ss.map(s => s.y + s.h)) + 3);
    const w = x1 - x0, h = y1 - y0, T = new Float32Array(w * h).fill(Infinity);
    ss.forEach(s => {
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const v = s.T[y * s.w + x]; if (v === Infinity) continue;
        const j = (y + s.y - y0) * w + x + s.x - x0; if (v < T[j]) T[j] = v;
      }
    });
    layers.push({ x:x0, y:y0, w, h, T, pis:ss.map(s => s.pi), img:null });
  }
  if (layers.length > 1 && snap) for (const ly of layers) {
    const hide = parts.map((pt, i) => ly.pis.includes(i) ? -1 : pt.ei).filter(i => i >= 0);
    ly.img = (await snap(hide, ly !== layers[layers.length - 1])).img;
  }
  for (const ly of layers) {
    // tinta que nenhuma forma cobriu (sombra, brilho, marcador) acompanha a forma vizinha; depois folga de 2 px na borda
    const { x, y, w, h, T } = ly, img = ly.img || lg.img;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, MW, MH); cx.drawImage(img, 0, 0, lg.bw * km, lg.bh * km);
    const d = cx.getImageData(x, y, w, h).data, R = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) R[i] = d[i * 4 + 3] >= 8 ? 1 : 0;
    penFill({ w, h, T }, R);
    penDilate(T, w, h, 2);
    let t0 = Infinity, t1 = 0;
    for (let i = 0; i < T.length; i++) { if (T[i] === Infinity) continue; T[i] /= total; if (T[i] < t0) t0 = T[i]; if (T[i] > t1) t1 = T[i]; }
    ly.t0 = t0; ly.t1 = t1;
  }
  return { km, MW, MH, layers, total, soft:3 / total };
}
// desenha o logo revelado até `dp` (0..1): a máscara de tempos recorta a imagem de cada camada
const PENC = { mask:null, lay:null };
function drawPen(ctx, lg, G, dp) {
  const pen = lg.pen;
  if (dp >= 1) { ctx.drawImage(lg.img, -G.w / 2, -G.h / 2, G.w, G.h); return; }
  if (dp <= 0) return;
  if (!PENC.mask) { PENC.mask = document.createElement('canvas'); PENC.lay = document.createElement('canvas'); }
  const m = ctx.getTransform(), k = Math.max(.05, Math.hypot(m.a, m.b)), inv = 1 / pen.soft;
  const gu = G.w / (lg.bw * pen.km), gv = G.h / (lg.bh * pen.km); // unidades do bloco por px da grade
  for (const ly of pen.layers) {
    if (dp <= ly.t0) continue;
    const img = ly.img || lg.img, iu = img.naturalWidth / (lg.bw * pen.km), iv = img.naturalHeight / (lg.bh * pen.km);
    const sx = ly.x * iu, sy = ly.y * iv, sw = Math.min(ly.w * iu, img.naturalWidth - sx), sh = Math.min(ly.h * iv, img.naturalHeight - sy);
    if (sw <= 0 || sh <= 0) continue;
    const dx = -G.w / 2 + ly.x * gu, dy = -G.h / 2 + ly.y * gv, dw = sw / iu * gu, dh = sh / iv * gv;
    if (dp >= ly.t1 + pen.soft) { ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); continue; }
    const { w, h, T } = ly;
    if (!ly.id) { ly.id = new ImageData(w, h); ly.id.data.fill(255); }
    const d = ly.id.data;
    for (let i = 0, n = w * h; i < n; i++) { const a = (dp - T[i]) * inv; d[i * 4 + 3] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255; }
    const mc = PENC.mask; if (mc.width < w || mc.height < h) { mc.width = Math.max(mc.width, w); mc.height = Math.max(mc.height, h); }
    mc.getContext('2d').putImageData(ly.id, 0, 0);
    const pw = Math.max(1, Math.ceil(dw * k)), ph = Math.max(1, Math.ceil(dh * k)), lc = PENC.lay;
    if (lc.width < pw || lc.height < ph) { lc.width = Math.max(lc.width, pw); lc.height = Math.max(lc.height, ph); }
    const lx = lc.getContext('2d');
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, pw, ph);
    lx.drawImage(img, sx, sy, sw, sh, 0, 0, pw, ph);
    lx.globalCompositeOperation = 'destination-in';
    lx.drawImage(mc, 0, 0, sw / iu, sh / iv, 0, 0, pw, ph);
    lx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lc, 0, 0, pw, ph, dx, dy, dw, dh);
  }
}
async function refreshLogo() {
  try { RT.logo = await parseLogo(S.brand.logo); }
  catch (e) { RT.logo = null; toast(e.message || 'Não consegui ler o logo'); }
  renderBrand(); renderProps(); needs = true;
}
// SVG próprio da camada (Adicionar > SVG); sem ele a camada usa o logo da marca
const LGC = new Map();
function logoOf(L) {
  if (!L || !L.svg) return RT.logo;
  const k = L.svg.text;
  if (LGC.has(k)) return LGC.get(k);
  LGC.set(k, null);
  parseLogo(L.svg).then(lg => { LGC.set(k, lg); needs = true; if (selL() === L) renderProps(); }).catch(() => {});
  return null;
}
async function getImage(src) {
  if (!src) return null;
  if (RT.images.has(src)) return RT.images.get(src);
  RT.images.set(src, null);
  try { const img = await loadImg(await srcUrl(src)); RT.images.set(src, img); RT.imgRev++; needs = true; return img; } catch (e) { return null; }
}
function imgNow(src) { if (!src) return null; const i = RT.images.get(src); if (i === undefined) getImage(src); return i || null; }

/* ============================================================
   Tempo das camadas
   ============================================================ */
// imagem estática (S.still, Duração = 0): tudo na tela junto, em repouso. Duração e animações ficam guardadas para voltar ao vídeo
const STILL_PH = { mode:'hold', p:1, inD:0, outD:0 };
function phase(L, t) {
  if (S.still) return STILL_PH;
  const end = L.end ?? S.duration;
  if (t < L.start || t > end + 1e-6) return null;
  let inD = L.in === 'cut' ? 0 : L.inDur / (spdOf(L, 'in') || 1), outD = L.out === 'cut' ? 0 : L.outDur / (spdOf(L, 'out') || 1);
  const span = end - L.start;
  if (inD + outD > span && span > 0) { const k = span / (inD + outD); inD *= k; outD *= k; }
  if (inD > 0 && t < L.start + inD) return { mode:'in', p:(t - L.start) / inD, inD, outD };
  if (outD > 0 && t > end - outD) return { mode:'out', p:(t - (end - outD)) / outD, inD, outD };
  return { mode:'hold', p:1, inD, outD };
}
// trecho em que a camada fica parada na tela (sem a entrada e a saída). Os layouts só separam quem fica parado junto: numa emenda
// um sai enquanto o outro entra, e esse cruzamento de frações de segundo ligava todas as cenas numa só (uma cena apertada desalinhava as outras)
function holdSpan(L) {
  if (S.still) return [0, 1];
  const s = L.start || 0, end = L.end ?? S.duration, ph = phase(L, s);
  if (!ph) return [s, end];
  const a = s + ph.inD, b = end - ph.outD;
  return b - a > .05 ? [a, b] : [s, end];
}

/* ------------ grupos: tempo e animação do grupo inteiro ------------ */
// S.groups[gid] = { name?, open, in?, out?, idle?, inDur?, outDur?, inSpeed?, inInt?, … }. O grupo vai do primeiro que entra ao último que sai
// e tem animação própria (mesmos campos de uma camada): o conjunto é desenhado junto (`drawGroup`) e o preset age sobre ele,
// por cima da animação de cada item, que não é alterada.
function gmeta(gid, mk) {
  const g = S.groups && S.groups[gid]; if (g || !mk) return g;
  return ((S.groups ||= {})[gid] = { open:true });
}
function gwin(gid) {
  const m = gleaves(gid); if (!m.length) return null;
  return { start:Math.min(...m.map(l => l.start)), end:Math.max(...m.map(l => l.end ?? S.duration)) };
}
// presets do grupo: os de imagem (qualquer elemento serve: o grupo é uma imagem do conjunto)
const G_KEYS = { in:BLOCK_IN.image, out:BLOCK_OUT.image, idle:IDLE_BY.image };
// sombra, opacidade ou mesclagem do grupo inteiro (S.groups[gid].shadow / opacity / blend): o conjunto é desenhado junto, como na animação do grupo
// giro do grupo (S.groups[gid].rot, graus, em torno do centro da caixa do conjunto): o conjunto já desenhado gira junto, como a forma (L.rot)
const gRad = gid => { const g = S.groups && S.groups[gid]; return g && g.rot ? g.rot * Math.PI / 180 : 0; };
const gStyleOn = gid => { const g = S.groups && S.groups[gid]; return !!g && ((g.shadow && g.shadow !== 'none') || (g.opacity ?? 1) < 1 || !!g.rot || !!blendOf(g) || blurOn(g)) && gleaves(gid).length > 1; };
const gAnimOn = gid => { const g = S.groups && S.groups[gid]; return !!g && ((g.in || 'cut') !== 'cut' || (g.out || 'cut') !== 'cut' || (g.idle || 'none') !== 'none') && gleaves(gid).length > 1; };
// o grupo como uma camada de tempo (start/end do conjunto + a animação dele): serve para `phase`, `idleState`, `spdOf`, `intOf` e para a barra
function gpseudo(gid) {
  const w = gwin(gid); if (!w) return null;
  const g = gmeta(gid) || {}, inK = (g.in || 'cut') !== 'cut', outK = (g.out || 'cut') !== 'cut';
  return { ...g, start:w.start, end:w.end, in:inK ? g.in : 'cut', out:outK ? g.out : 'cut', idle:g.idle || 'none', inDur:inK ? g.inDur ?? .8 : 0, outDur:outK ? g.outDur ?? .5 : 0 };
}
// frames de fora para dentro até gid (o último é o próprio gid)
function gchain(gid) { const c = []; for (let g = gid, n = 0; g && n < 20; g = gpar(g), n++) c.unshift(g); return c; }
// numeração: primeiro os frames que têm camada direta (a ordem de sempre), depois os que só têm frames dentro
function groupNum(gid) {
  const ids = []; S.layers.forEach(l => { if (l.grp && !ids.includes(l.grp)) ids.push(l.grp); });
  S.layers.forEach(l => { if (l.grp) gchain(l.grp).forEach(g => { if (!ids.includes(g)) ids.push(g); }); });
  return ids.indexOf(gid) + 1;
}
const groupName = gid => (gmeta(gid) || {}).name || `Grupo ${groupNum(gid)}`;

/* ============================================================
   Efeitos: o que texto e blocos desenham do mesmo jeito
   ============================================================ */
// movimento contínuo ("Enquanto está na tela"). tx = texto (amplitudes menores). hh = meia altura do elemento
// t0 = segundos desde que a camada entrou; a velocidade da fase acelera o relógio do movimento
function idleState(L, t0, ph, tx, hh) {
  const I = intOf(L, 'idle'), sp = spdOf(L, 'idle'), tl = t0 * sp;
  const st = {}, hold = ph.mode === 'hold', th = (t0 - ph.inD) * sp, k = .4 + I;
  if (S.still) return st;
  switch (L.idle) {
    case 'float': st.dy = Math.sin(tl * TAU / 3.4) * (tx ? 7 : 9) * k; break;
    case 'breathe': st.sc = 1 + Math.sin(tl * TAU / 3) * (tx ? .015 : .025) * k; break;
    case 'pulse': if (hold) st.sc = 1 + (tx ? .03 : .045) * I * Math.pow(Math.max(0, Math.sin(tl * TAU / 1.6)), 6); break;
    case 'sway': st.rot = Math.sin(tl * TAU / 3.2) * (tx ? .03 : .05) * k; break;
    case 'spin': st.rot = tl * (.25 + .9 * I); break;
    case 'shine': if (hold) { const sk = (th % 3.2) / 1.15; if (sk < 1) st.shine = sk; } break;
    case 'wiggle': // tremida orgânica: senos de frequências que não se repetem juntas
      st.dx = (Math.sin(tl * 7.3) + .6 * Math.sin(tl * 12.1 + 1.3)) * 2.4 * k;
      st.dy = (Math.sin(tl * 8.7 + 2) + .5 * Math.sin(tl * 13.9)) * 2.4 * k;
      st.rot = Math.sin(tl * 9.4 + .7) * .014 * k; break;
    case 'bounce': if (hold) { // pulinho e amassada ao cair, a cada 1,7 s
      const u = (th % 1.7) / 1.7, h0 = Math.min(hh, 140) * .35 * k;
      if (u < .42) st.dy = -Math.sin(u / .42 * Math.PI) * h0;
      else if (u < .6) { const s = Math.sin((u - .42) / .18 * Math.PI) * .07 * k; st.sy = 1 - s; st.sx = 1 + s * .8; st.dy = hh * s; }
    } break;
    case 'glow': if (hold) st.glow = (.35 + .65 * I) * (.5 - .5 * Math.cos(th * TAU / 2.6)); break;
    case 'float3d': // o giro nasce do zero quando termina de entrar (sem salto depois de uma entrada 3D)
      st.dy = Math.sin(tl * TAU / 3.4) * (tx ? 5 : 7) * k;
      if (th > 0) { st.fx = 'persp'; st.fax = 'y'; st.fhinge = 0; st.fang = Math.sin(th * TAU / 5.5) * (.2 + .35 * I); }
      break;
    case 'glitch': if (hold) { const u = th % 2.6; if (u < .32) { st.fx = 'glitch'; st.fe = Math.sin(u / .32 * Math.PI) * (.35 + .65 * I); st.fseed = Math.floor(tl * 24); } } break;
  }
  return st;
}
// o rastro some quando o movimento assenta (fim da entrada) e cresce quando acelera (saída)
const trailFade = ph => clamp((ph.mode === 'in' ? 1 - ph.p : ph.p) * 2.5);
// só a parte do idle que desenha (o texto aplica o movimento por fora)
function rasterIdle(idl) { const r = { ...idl }; for (const k of ['dx', 'dy', 'rot', 'sc', 'sx', 'sy']) delete r[k]; return r; }
// junta o estado do preset (a) com o do movimento contínuo (b): deslocamentos somam, escalas multiplicam, efeitos do preset vencem
function mergeSt(a, b) {
  const o = { ...b, ...a };
  for (const k of ['dx', 'dy', 'rot', 'kx', 'glow']) if (k in a || k in b) o[k] = (a[k] || 0) + (b[k] || 0);
  for (const k of ['sc', 'sx', 'sy', 'a']) if (k in a || k in b) o[k] = (a[k] ?? 1) * (b[k] ?? 1);
  return o;
}
// rotação, inclinação e escala do estado; pv = pivô vertical (base ou topo), r0 = rotação fixa da camada
function applyXf(ctx, st, pv = 0, r0 = 0) {
  if (r0) ctx.rotate(r0);
  const sc = st.sc ?? 1, sx = sc * (st.sx ?? 1), sy = sc * (st.sy ?? 1), piv = pv && (st.rot || st.kx || sx !== 1 || sy !== 1);
  if (piv) ctx.translate(0, pv);
  if (st.rot) ctx.rotate(st.rot);
  if (st.kx) ctx.transform(1, 0, st.kx, 1, 0, 0);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (piv) ctx.translate(0, -pv);
}
// só o desfoque vai no ctx.filter: brightness() e filtro junto com sombra são lentos demais no Chrome.
// O brilho (bright) entra pela cor na letra (brightCol) e pela soma da imagem com ela mesma nos blocos (brighten)
function fxFilter(st, rs) { return st.blur > .15 ? `blur(${(st.blur * rs).toFixed(2)}px)` : ''; }
function brightCol(c, b) {
  if (!(b > 1.005)) return c;
  const x = String(c || '#000').replace('#', ''); if (!/^([0-9a-f]{3}|[0-9a-f]{6,8})$/i.test(x)) return c;
  const n = parseInt((x.length === 3 ? x.split('').map(v => v + v).join('') : x).slice(0, 6), 16), k = v => Math.min(255, Math.round(v * b));
  return `rgba(${k(n >> 16 & 255)},${k(n >> 8 & 255)},${k(n & 255)},${+colA(c).toFixed(4)})`;
}
function brighten(c, cw, ch, b) {
  const t = fxCanvas(3, cw, ch); t.getContext('2d').drawImage(c, 0, 0, cw, ch, 0, 0, cw, ch);
  const x = c.getContext('2d'); x.globalCompositeOperation = 'lighter';
  for (let r = b - 1; r > .005; r -= 1) { x.globalAlpha = Math.min(1, r); x.drawImage(t, 0, 0, cw, ch, 0, 0, cw, ch); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
}
// O Chrome prende texto sem rotação no pixel inteiro na vertical (na horizontal não): subir ou descer vira degraus
// de 1 px, e cada linha pula num quadro diferente. Um giro imperceptível (0,17°, ~0,1 px na letra) faz o texto ser
// desenhado na posição exata. Abaixo de ~1e-3 o Chrome ignora o giro.
const SUBPX = 3e-3;
// letra desfocada sem filtro: desenha longe, fora da tela, e só a sombra desfocada (px do canvas) cai no lugar
const OFFX = 40000;
function blurText(c, ch, x, y, col, px, lw) {
  const m = c.getTransform();
  c.save();
  c.setTransform(m.a, m.b, m.c, m.d, m.e - OFFX, m.f);
  c.fillStyle = col; c.shadowColor = col; c.shadowBlur = px * 2; c.shadowOffsetX = OFFX; c.shadowOffsetY = 0;
  if (lw) { c.strokeStyle = col; c.lineWidth = lw; c.strokeText(ch, x, y); } // contorno da letra desfocada
  else c.fillText(ch, x, y);
  c.restore();
}
/* ------------ recortes ------------ */
const DIAG_A = .42; // inclinação do corte diagonal
function clipFront(st, w, h) { // onde está a frente dos cortes 'diag' e 'scan'
  const e = clamp(st.ce), v = st.cdir < 0 ? 1 - e : e;
  if (st.clip === 'diag') { const D = w / 2 * Math.cos(DIAG_A) + h / 2 * Math.sin(DIAG_A) + 30; return lerp(-D, D, v); }
  return lerp(-h / 2 - 12, h / 2 + 12, v);
}
// manchas que crescem e se juntam, com a borda viva (sem sorteio: o mesmo quadro sempre sai igual)
// gotas pequenas pingam primeiro; a mancha do centro cresce devagar e cobre tudo
const INK = [[0, 0, 1.42, 0], [-.42, .3, .55, 0], [.4, -.28, .5, .08], [.18, .42, .42, .16], [-.25, -.38, .38, .24]];
function inkPath(ctx, p, I, w, h) {
  const R0 = Math.hypot(w, h) / 2 + 20;
  INK.forEach(([bx, by, rk, d], j) => {
    const e = j ? Ease.cubicOut(clamp((p - d) / .5)) : Ease.cubicInOut(p); if (e <= 0) return;
    const R = e * R0 * rk * (j ? .6 + .6 * I : 1), cx = bx * w / 2, cy = by * h / 2;
    const f1 = rand(j, 1) * TAU, f2 = rand(j, 2) * TAU, f3 = rand(j, 3) * TAU;
    for (let s = 0; s <= 72; s++) {
      const a = s / 72 * TAU, r = R * (1 + .14 * Math.sin(3 * a + f1 + p * 2.2) + .08 * Math.sin(5 * a + f2 - p * 3.1) + .05 * Math.sin(9 * a + f3 + p * 1.7));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  });
}
// recorta pelo estado (w×h = caixa do elemento, centrada em 0,0). 'bounds' e a máscara de linha do texto ficam com quem desenha
function clipFx(ctx, st, w, h) {
  const c = st.clip; if (!c || c === true || c === 'bounds') return;
  const hyp = Math.hypot(w, h), BIG = hyp * 4 + 800;
  ctx.beginPath();
  if (c === 'circle') ctx.arc(0, 0, Math.max(0, st.ce) * hyp / 2 * 1.08, 0, TAU);
  else if (c === 'wipe') { const L0 = -w / 2 - 20, full = w + 40, v = clamp(st.ce); if (st.cdir > 0) ctx.rect(L0, -h, full * v, h * 2); else ctx.rect(L0 + full * (1 - v), -h, full * v, h * 2); }
  else if (c === 'blinds') {
    const n = st.cn || 8, pad = h * .08 + 12, sh = (h + pad * 2) / n;
    for (let i = 0; i < n; i++) {
      const v = Ease.cubicInOut(unitP(st.cp, i, n, .5)); if (v <= 0) continue;
      const yc = -h / 2 - pad + (i + .5) * sh, top = v >= 1 && !i ? -BIG : yc - sh * v / 2 - .5, bot = v >= 1 && i === n - 1 ? BIG : yc + sh * v / 2 + .5;
      ctx.rect(-BIG, top, BIG * 2, bot - top);
    }
  }
  else if (c === 'diag') { const f = clipFront(st, w, h); ctx.rotate(DIAG_A); if (st.cdir < 0) ctx.rect(f, -BIG, BIG * 2, BIG * 2); else ctx.rect(-BIG * 2, -BIG, BIG * 2 + f, BIG * 2); ctx.rotate(-DIAG_A); }
  else if (c === 'scan') { const f = clipFront(st, w, h); if (st.cdir < 0) ctx.rect(-BIG, f, BIG * 2, BIG * 2); else ctx.rect(-BIG, -BIG * 2, BIG * 2, BIG * 2 + f); }
  else if (c === 'diamond') { const r = Math.max(0, st.ce) * ((w + h) / 2 + 40); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); }
  else if (c === 'clock') {
    const v = clamp(st.ce), R = hyp / 2 + 40, a0 = -Math.PI / 2;
    if (v > 0) { ctx.moveTo(0, 0); if (st.cdir < 0) ctx.arc(0, 0, R, a0 + (1 - v) * TAU, a0 + TAU); else ctx.arc(0, 0, R, a0, a0 + v * TAU); ctx.closePath(); }
  }
  else if (c === 'ink') inkPath(ctx, st.cp, st.cI ?? .6, w, h);
  ctx.clip();
}
// linha luminosa na frente do corte (diagonal e scanner)
function edgeFx(ctx, st, w, h, color) {
  const e = clamp(st.ce), a = Math.min(1, e * 12, (1 - e) * 12); if (a <= 0) return;
  const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) || 1, f = clipFront(st, w, h), BIG = Math.hypot(w, h) + 200;
  ctx.save(); ctx.globalAlpha *= a; ctx.filter = 'none'; // sombra com filtro é lenta
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, Math.min(w, h) * .012 + 1.5); ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 16 * k;
  ctx.beginPath();
  if (st.clip === 'diag') { ctx.rect(-w / 2 - 14, -h / 2 - 14, w + 28, h + 28); ctx.clip(); ctx.rotate(DIAG_A); ctx.beginPath(); ctx.moveTo(f, -BIG); ctx.lineTo(f, BIG); }
  else { ctx.moveTo(-w / 2 - 16, f); ctx.lineTo(w / 2 + 16, f); }
  ctx.stroke(); ctx.stroke(); ctx.restore();
}
// "Linha e revela": a linha se estende e o elemento sobe de trás dela
function lineReveal(ctx, pp, w, h, color) {
  const lp = Ease.cubicInOut(clamp(pp / .45)), rise = Ease.quintOut(clamp((pp - .3) / .7)), la = 1 - clamp((pp - .78) / .22);
  const ly = h / 2 + h * .08 + 6;
  if (lp > 0 && la > 0) { ctx.save(); ctx.globalAlpha *= la; ctx.fillStyle = color; const lw = w * 1.1 * lp; ctx.fillRect(-lw / 2, ly - 2.5, lw, 5); ctx.restore(); }
  ctx.beginPath(); ctx.rect(-w * 2, -h * 4, w * 4, h * 4 + ly - 3); ctx.clip();
  ctx.translate(0, (1 - rise) * (h * 1.1 + 10));
}
/* Desenha um elemento com o estado da animação: movimento, recorte, filtros e efeitos de imagem.
   O contexto já está no centro do elemento; draw(c, st) desenha o conteúdo parado, centrado em 0,0 (caixa w×h).
   o = { k: encaixe na margem, rot: rotação fixa, piv: pivô vertical, pad: folga do raster, color: cor das linhas } */
function drawState(ctx, st, w, h, R, draw, o = {}) {
  const a = st.a ?? 1; if (a <= .001) return;
  ctx.save();
  if (st.dx || st.dy) ctx.translate(st.dx || 0, st.dy || 0);
  if (o.k && o.k !== 1) ctx.scale(o.k, o.k);
  applyXf(ctx, st, o.piv || 0, o.rot || 0);
  ctx.globalAlpha *= a;
  const f = fxFilter(st, R.rs); if (f) ctx.filter = f;
  ctx.save();
  clipFx(ctx, st, w, h);
  if (st.line != null) lineReveal(ctx, st.line, w, h, o.color);
  if (st.fx || st.shine != null || st.glow > .01 || st.bright > 1.005) rasterFx(ctx, st, w, h, o.pad ?? 12, R, c => draw(c, st));
  else draw(ctx, st);
  ctx.restore();
  if (st.edge) edgeFx(ctx, st, w, h, o.color || '#fff');
  ctx.restore();
}
/* ------------ efeitos de imagem ------------
   O elemento é desenhado parado num canvas à parte (na escala em que vai aparecer) e redesenhado em pedaços. */
const FXC = [];
function fxCanvas(i, w, h) {
  const c = FXC[i] || (FXC[i] = document.createElement('canvas'));
  if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
  x.shadowBlur = 0; x.shadowColor = 'transparent'; x.imageSmoothingEnabled = true;
  x.clearRect(0, 0, w + 2, h + 2);
  return c;
}
const fxEase = (name, q, dir) => Ease[dir < 0 && (name === 'spring' || name === 'backOut') ? 'cubicOut' : name](clamp(q));
// separa vermelho, verde e azul e desloca cada um (off em px do raster); devolve o canvas com margem M
function rgbSplit(src, cw, ch, off, seed) {
  const M = Math.ceil(off * 1.6) + 2, ow = cw + M * 2, oh = ch + M * 2, oc = fxCanvas(2, ow, oh), ox = oc.getContext('2d');
  const tc = fxCanvas(1, cw, ch), tx = tc.getContext('2d');
  ox.globalCompositeOperation = 'lighter';
  [['#f00', -1], ['#0f0', 0], ['#00f', 1]].forEach(([col, sg], j) => {
    tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, cw, ch); tx.drawImage(src, 0, 0, cw, ch, 0, 0, cw, ch);
    tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, cw, ch);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(src, 0, 0, cw, ch, 0, 0, cw, ch);
    ox.drawImage(tc, 0, 0, cw, ch, M + sg * off + (rand(seed, j + 1) - .5) * off * .7, M + (rand(seed, j + 4) - .5) * off * .5, cw, ch);
  });
  ox.globalCompositeOperation = 'source-over';
  return { c:oc, M, ow, oh };
}
function shineOver(c, cw, ch, sk) {
  c.globalCompositeOperation = 'source-atop';
  const bx = -cw * .5 + Ease.cubicInOut(sk) * cw * 2;
  const gr = c.createLinearGradient(bx - cw * .22, 0, bx + cw * .22, ch * .35);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.fillRect(0, 0, cw, ch); c.globalCompositeOperation = 'source-over';
}
function rasterFx(ctx, st, w, h, pad, R, draw) {
  const m = ctx.getTransform();
  let k = Math.min(3, Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)));
  if (!(k > .002)) return;
  const bw = w + pad * 2, bh = h + pad * 2;
  if (bw * bh * k * k > 8e6) k = Math.sqrt(8e6 / (bw * bh));
  const cw = Math.max(1, Math.ceil(bw * k)), ch = Math.max(1, Math.ceil(bh * k)), u = 1 / k;
  const src = fxCanvas(0, cw, ch), sx = src.getContext('2d');
  sx.setTransform(k, 0, 0, k, cw / 2, ch / 2);
  sx.save(); draw(sx); sx.restore();
  sx.setTransform(1, 0, 0, 1, 0, 0);
  if (st.shine != null) shineOver(sx, cw, ch, st.shine);
  if (st.bright > 1.005) brighten(src, cw, ch, st.bright);
  const X0 = -cw / 2 * u, Y0 = -ch / 2 * u, I = st.fI ?? .6, dir = st.fdir || 1, a0 = ctx.globalAlpha;
  // efeito em muitos pedaços com transparência ou filtro: os pedaços vão para um buffer (senão as emendas somam
  // opacidade e aparecem listras) e a transparência e o filtro entram uma vez só, ao copiar o buffer
  const many = { slices:1, dust:1, tiles:1, glitch:1, liquid:1, persp:1 }[st.fx];
  const buf = many && (a0 < .999 || (ctx.filter && ctx.filter !== 'none'));
  let g = ctx, A = a0, bk = 1, ow = 0, oh = 0, out = null;
  if (buf) {
    bk = Math.min(1, Math.sqrt(8e6 / (9 * cw * ch))); ow = Math.ceil(cw * 3 * bk); oh = Math.ceil(ch * 3 * bk);
    out = fxCanvas(4, ow, oh); g = out.getContext('2d'); A = 1;
    g.setTransform(k * bk, 0, 0, k * bk, ow / 2, oh / 2);
  }
  const whole = () => g.drawImage(src, 0, 0, cw, ch, X0, Y0, cw * u, ch * u);
  const put = (x, y, sw, sh, dx, dy, dw = sw * u, dh = sh * u) => g.drawImage(src, x, y, sw, sh, dx, dy, dw, dh);
  switch (st.fx) {
    case 'slices': { // faixas que chegam alternando os lados
      const n = st.fcount || 6, D = (bw * .5 + 120) * (.5 + I);
      for (let i = 0; i < n; i++) {
        const q = unitP(st.fp, i, n, .45); if (q <= 0) continue;
        const y0 = Math.floor(i * ch / n), y1 = i === n - 1 ? ch : Math.floor((i + 1) * ch / n) + 1;
        g.globalAlpha = A * clamp(q * 3);
        put(0, y0, cw, y1 - y0, X0 + (1 - fxEase('expoOut', q, dir)) * D * (i % 2 ? 1 : -1) * dir, Y0 + y0 * u);
      }
      break;
    }
    case 'pixel': { // resolução baixa que vai subindo
      const big = Math.max(cw, ch) / (4 + 10 * (1 - I)), b = Math.round(Math.pow(Math.max(1, big), 1 - clamp(st.fe)));
      if (b <= 1) { whole(); break; }
      const tw = Math.ceil(cw / b), th = Math.ceil(ch / b), tc = fxCanvas(1, tw, th), tx = tc.getContext('2d');
      tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, cw, ch, 0, 0, cw / b, ch / b);
      const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
      g.drawImage(tc, 0, 0, tw, th, X0, Y0, tw * b * u, th * b * u);
      g.imageSmoothingEnabled = sm;
      break;
    }
    case 'dust': { // partículas que pousam da esquerda (entrada) ou se desfazem ao vento (saída)
      const p = st.fp, cs = Math.max(2, Math.ceil(Math.sqrt(cw * ch / 3000))), nx = Math.ceil(cw / cs), ny = Math.ceil(ch / cs), sp = .6, amp = .5 + I;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const id = j * nx + i, r1 = rand(id, 1), xn = (i + .5) / nx;
        const q = clamp((p - clamp((dir > 0 ? xn : 1 - xn) * .72 + r1 * .28) * sp) / (1 - sp)); if (q <= 0) continue;
        const x = i * cs, y = j * cs, sw = Math.min(cs, cw - x), sh = Math.min(cs, ch - y);
        if (q >= 1) { g.globalAlpha = A; put(x, y, Math.min(sw + 1, cw - x), Math.min(sh + 1, ch - y), X0 + x * u, Y0 + y * u); continue; }
        const e = Ease.cubicOut(q), v = 1 - e, r2 = rand(id, 2), r3 = rand(id, 3), s = .3 + .7 * e;
        const ox = -dir * v * (bw * (.12 + .45 * r2) + 50) * amp, oy = -v * (bh * (.15 + .9 * r3) + 30) * amp + Math.sin(v * 5 + r1 * TAU) * bh * .08 * v;
        g.globalAlpha = A * Math.min(1, e * 1.6);
        put(x, y, sw, sh, X0 + (x + sw * (1 - s) / 2) * u + ox, Y0 + (y + sh * (1 - s) / 2) * u + oy, sw * s * u, sh * s * u);
      }
      break;
    }
    case 'tiles': { // ladrilhos que brotam em diagonal
      const p = st.fp, n = Math.round(5 + 7 * I), ts = Math.max(cw, ch) / n, nx = Math.ceil(cw / ts), ny = Math.ceil(ch / ts);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const q = clamp((p - ((i + .5) / nx + (j + .5) / ny) / 2 * .55) / .45); if (q <= 0) continue;
        const x = i * ts, y = j * ts, sw = Math.min(ts, cw - x), sh = Math.min(ts, ch - y);
        g.globalAlpha = A * clamp(q * 2.5);
        if (q >= 1) { put(x, y, Math.min(sw + 1, cw - x), Math.min(sh + 1, ch - y), X0 + x * u, Y0 + y * u); continue; }
        const e = dir > 0 ? Ease.backOut(q, I) : Ease.cubicOut(q);
        g.save(); g.translate(X0 + (x + sw / 2) * u, Y0 + (y + sh / 2) * u); g.rotate((1 - e) * (rand(i, j) - .5) * 1.4); g.scale(e, e);
        put(x, y, sw, sh, -sw / 2 * u, -sh / 2 * u); g.restore();
      }
      break;
    }
    case 'rgb': { // canais de cor separados que se juntam
      const off = (1 - clamp(st.fe)) * (bw * .04 + 14) * (.5 + I) * k;
      if (off < .5) { whole(); break; }
      const sp = rgbSplit(src, cw, ch, off, st.fseed || 0);
      g.drawImage(sp.c, 0, 0, sp.ow, sp.oh, X0 - sp.M * u, Y0 - sp.M * u, sp.ow * u, sp.oh * u);
      break;
    }
    case 'glitch': { // faixas deslocadas com as cores separadas
      const g0 = clamp(st.fe), sd = st.fseed || 0, off = g0 * (bw * .02 + 8) * k;
      const sp = off >= .5 ? rgbSplit(src, cw, ch, off, sd) : { c:src, M:0, ow:cw, oh:ch };
      for (let y = 0, j = 0; y < sp.oh; j++) {
        const sh = Math.min(Math.max(2, Math.round((.04 + rand(sd, j * 3 + 1) * .2) * sp.oh)), sp.oh - y);
        const shx = rand(sd, j * 3 + 2) < .4 ? (rand(sd, j * 3 + 3) - .5) * g0 * sp.ow * .22 : 0;
        g.drawImage(sp.c, 0, y, sp.ow, Math.min(sh + 1, sp.oh - y), X0 + (shx - sp.M) * u, Y0 + (y - sp.M) * u, sp.ow * u, Math.min(sh + 1, sp.oh - y) * u);
        y += sh;
      }
      break;
    }
    case 'liquid': { // ondas horizontais que se acalmam
      const amp = (1 - clamp(st.fe)) * (bw * .04 + bh * .12) * (.4 + I) * k;
      if (amp < .3) { whole(); break; }
      const sh = Math.max(2, Math.ceil(ch / 160)), p = st.fp || 0;
      for (let y = 0; y < ch; y += sh) {
        const yn = y / ch, off = amp * (Math.sin(yn * TAU * 1.2 + p * 7) + .45 * Math.sin(yn * TAU * 3.1 - p * 11));
        put(0, y, cw, Math.min(sh + 1, ch - y), X0 + off * u, Y0 + y * u);
      }
      break;
    }
    case 'persp': { // giro 3D com perspectiva: fatias finas, cada uma na profundidade dela
      const ang = st.fang || 0; if (Math.abs(ang) < 1e-3) { whole(); break; }
      const yAx = st.fax !== 'x', len = (yAx ? cw : ch) * u, oth = (yAx ? ch : cw) * u, pn = yAx ? cw : ch, d = Math.max(bw, bh) * 2.4;
      const hinge = (st.fhinge || 0) * len / 2, c = Math.cos(ang), s = Math.sin(ang), n = Math.max(12, Math.min(220, Math.round(pn / 3)));
      const pr = x => { const r = x - hinge, f = d / Math.max(d * .15, d + r * s); return [(hinge + r * c) * f, f]; };
      let [xa, fa] = pr(-len / 2);
      for (let i = 0; i < n; i++) {
        const [xb, fb] = pr(-len / 2 + (i + 1) / n * len), lo = Math.min(xa, xb), wd = Math.abs(xb - xa), ex = oth * (fa + fb) / 2;
        const s0 = i / n * pn, s1 = Math.min(pn, (i + 1) / n * pn + 1);
        if (wd > 1e-4) {
          if (yAx) g.drawImage(src, s0, 0, s1 - s0, ch, lo, -ex / 2, wd + u, ex);
          else g.drawImage(src, 0, s0, cw, s1 - s0, -ex / 2, lo, ex, wd + u);
        }
        xa = xb; fa = fb;
      }
      break;
    }
    default: whole();
  }
  ctx.globalAlpha = a0;
  if (buf) { const q = 1 / (k * bk); ctx.drawImage(out, 0, 0, ow, oh, -ow / 2 * q, -oh / 2 * q, ow * q, oh * q); }
  if (st.glow > .01 && !st.fx) { // luz que vaza da própria cor: cópias desfocadas somadas por cima
    const r = (Math.min(bw, bh) * .05 + 5) * k;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${r.toFixed(1)}px)`; ctx.globalAlpha = a0 * Math.min(1, st.glow * .5); whole();
    ctx.filter = `blur(${(r * 3).toFixed(1)}px)`; ctx.globalAlpha = a0 * Math.min(1, st.glow * .35); whole();
    ctx.restore();
  }
}

/* ============================================================
   Texto: layout e desenho
   ============================================================ */
let MCTX = document.createElement('canvas').getContext('2d');
function fontStr(L, size, w = L.weight, it = L.italic) { return `${it ? 'italic ' : ''}${w} ${size}px "${L.font}", system-ui, sans-serif`; }
// peso, itálico e cor por trecho: L.runs = [{ t, w?, i?, c? }]. Só vale enquanto os trechos somam exatamente L.text
function runsOf(L) { const r = L.runs; return r && r.length && r.map(x => x.t).join('') === L.text ? r : null; }
function charStyles(L, txt) {
  const r = runsOf(L); if (!r) return null;
  const st = [];
  for (const x of r) for (const ch of x.t) for (const _ of (L.upper ? ch.toUpperCase() : ch)) st.push([x.w ?? L.weight, x.i ?? !!L.italic, x.c || null]);
  return st.length === [...txt].length && st.some(s => s[0] !== L.weight || s[1] !== !!L.italic || s[2]) ? st : null;
}
function layoutText(L, txt) {
  const M = marginBox(), size = L.size, ls = (L.ls || 0) * size, maxW = Math.min((L.maxW || .84) * W(), M ? M.x1 - M.x0 : Infinity);
  const font = fontStr(L, size), sty = charStyles(L, txt);
  const key = [txt, font, ls, maxW, L.lh, L.align, L.fixW ? 1 : 0, sty ? sty.join(';') : ''].join('|');
  let lay = RT.layout.get(key); if (lay) return lay;
  if (RT.layout.size > 400) RT.layout.clear();
  const all = [...txt].map((ch, i) => ({ ch, c:sty ? sty[i][2] : null, f:sty ? fontStr(L, size, sty[i][0], sty[i][1]) : font }));
  // trechos seguidos com a mesma fonte são medidos juntos: assim o kerning entre as letras vale
  const segs = arr => { const out = []; for (const c of arr) { const s = out[out.length - 1]; if (s && s.f === c.f) s.s += c.ch; else out.push({ f:c.f, s:c.ch }); } return out; };
  let curF = null;
  const meas = (f, s) => { if (curF !== f) MCTX.font = curF = f; return MCTX.measureText(s).width; };
  const mw = arr => segs(arr).reduce((w, s) => w + meas(s.f, s.s), 0) + Math.max(0, arr.length - 1) * ls;
  const lines = [];
  let para = [];
  const flush = () => {
    // palavras separadas por um ou mais espaços; na linha voltam com um espaço só
    const words = []; let w = [], sp = null;
    for (const c of para) { if (c.ch === ' ') { if (!sp) { words.push({ w, sp:null }); w = []; sp = c; } } else { if (sp) { words[words.length - 1].sp = sp; sp = null; } w.push(c); } }
    words.push({ w, sp:null });
    let cur = null;
    words.forEach((wd, i) => {
      const gap = i ? words[i - 1].sp || { ch:' ', f:font } : null;
      const test = cur ? [...cur, gap, ...wd.w] : wd.w;
      if (cur && mw(test) > maxW) { lines.push(cur); cur = wd.w; } else cur = test;
    });
    lines.push(cur || []); para = [];
  };
  for (const c of all) { if (c.ch === '\n') flush(); else para.push(c); }
  flush();
  const lineH = size * (L.lh || 1.1);
  const blockH = lines.length * lineH;
  let wi = 0, ci = 0, blockW = 0;
  const out = lines.map((cs, li) => {
    const glyphs = []; let k = 0, segX = 0;
    for (const s of segs(cs)) {
      const chs = [...s.s]; let pre = '';
      chs.forEach(ch => {
        pre += ch;
        // posição = largura até esta letra (com o kerning do par anterior) menos a própria letra
        const w = meas(s.f, ch), x = segX + meas(s.f, pre) - w + k * ls;
        const space = ch === ' ';
        if (space) wi++;
        glyphs.push({ ch, x, w, k, f:s.f, c:cs[k].c, space, word:wi, ci:space ? -1 : ci++ });
        k++;
      });
      segX += meas(s.f, s.s);
    }
    wi++;
    const width = mw(cs); blockW = Math.max(blockW, width);
    const baseline = -blockH / 2 + li * lineH + lineH / 2 + size * .34;
    return { text:cs.map(c => c.ch).join(''), glyphs, width, baseline, li };
  });
  if (L.fixW) blockW = Math.max(blockW, maxW); // largura fixa (puxada pela alça lateral): a caixa tem essa largura e o texto se alinha dentro
  for (const l of out) l.x0 = L.align === 'left' ? -blockW / 2 : L.align === 'right' ? blockW / 2 - l.width : -l.width / 2;
  lay = { lines:out, blockW, blockH, lineH, size, font, mixed:!!sty, nChars:ci, nWords:wi, nLines:out.length };
  RT.layout.set(key, lay);
  return lay;
}
function counterText(txt, e) {
  return txt.replace(/\d+(?:[.,]\d+)?/g, m => {
    const dec = (m.split(/[.,]/)[1] || '').length, sep = m.includes(',') ? ',' : '.';
    const v = parseFloat(m.replace(',', '.')) * clamp(e, 0, 1.2);
    return (dec ? v.toFixed(dec) : String(Math.round(v))).replace('.', sep);
  });
}
const SCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?';

function drawText(ctx, L, t, R) {
  const ph = phase(L, t); if (!ph) return;
  const key = ph.mode === 'in' ? L.in : ph.mode === 'out' ? L.out : null;
  const P = key ? (TP[key] || TP.cut) : null;
  const I = intOf(L, ph.mode === 'out' ? 'out' : 'in'), tl = t - L.start;
  let txt = L.upper ? L.text.toUpperCase() : L.text;
  const seed = Math.floor(t * 24);

  // contador precisa do valor antes do layout
  if (P && P.counter) {
    const e = ph.mode === 'in' ? easeIn(P.ease, ph.p, I) : easeOutPhase(P.ease, ph.p, I);
    txt = counterText(txt, e);
  }
  const lay = layoutText(L, txt);
  const size = lay.size;
  const pl = placeOf(L), fit = inFlow(L) ? { ax:pl.x * W(), ay:pl.y * H(), k:1 } : fitInMargin(pl.x * W(), pl.y * H(), lay.blockW * pl.k, lay.blockH * pl.k), ax = fit.ax, ay = fit.ay, fk = fit.k * pl.k;
  const idl = idleState(L, tl, ph, true, lay.blockH / 2);
  L._bounds = { x:ax - lay.blockW * fk / 2, y:ay - lay.blockH * fk / 2, w:lay.blockW * fk, h:lay.blockH * fk, k:fk };

  ctx.save();
  ctx.translate(ax + (idl.dx || 0), ay + (idl.dy || 0)); if (idl.rot) ctx.rotate(idl.rot);
  const isx = (idl.sc ?? 1) * (idl.sx ?? 1) * fk, isy = (idl.sc ?? 1) * (idl.sy ?? 1) * fk;
  if (isx !== 1 || isy !== 1) ctx.scale(isx, isy);
  ctx.globalAlpha *= L.opacity ?? 1;
  ctx.font = lay.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  const unit = P ? P.unit : 'all';
  const nOf = unit === 'char' ? lay.nChars : unit === 'word' ? lay.nWords : unit === 'line' ? lay.nLines : 1;
  // janela da máscara: ascendente/descendente reais do texto (itálicos e pernas de j, g, p passam da altura da linha)
  if (!lay.mask) {
    const m = ctx.measureText(lay.lines.map(l => l.text).join('') || 'Hg'), pad = size * .06;
    const asc = Math.max(m.actualBoundingBoxAscent || 0, size * .8), desc = Math.max(m.actualBoundingBoxDescent || 0, size * .2);
    lay.mask = { top:asc + pad, bot:desc + pad, h:asc + desc + pad * 2 };
  }
  const dir = ph.mode === 'out' ? -1 : 1;
  // estado da unidade idx com o progresso da fase em pr (o rastro pede progressos atrasados)
  const stAt = (idx, pr) => {
    if (!P) return {};
    const q = unitP(pr, idx, nOf, P.s);
    const e = ph.mode === 'in' ? easeIn(P.ease, q, I) : easeOutPhase(P.ease, q, I);
    const p = ph.mode === 'in' ? q : 1 - q;
    return P.fn({ e, p, I, size, lineH:lay.lineH, maskH:lay.mask.h, dir, i:idx, n:nOf, seed, W:W(), H:H(), bw:lay.blockW, bh:lay.blockH, ...slideOf(L, ph.mode) });
  };
  const stCache = new Map();
  const stateFor = idx => { if (!stCache.has(idx)) stCache.set(idx, stAt(idx, ph.p)); return stCache.get(idx); };
  const none = () => ({});
  // bloco inteiro de uma vez (recortes e efeitos de imagem dos presets universais, brilho e 3D do "enquanto está na tela")
  const whole = !!((P && P.whole) || idl.fx || idl.shine != null);
  const glowIdle = whole ? 0 : idl.glow || 0;
  const trail = P && P.trail && ph.mode !== 'hold' ? P.trail : null, tfade = trailFade(ph);
  // cursor da máquina de escrever
  let lastVisible = -1;

  const skOn = strokeSee(L), skw = skW(L), skOut = L.strokePos === 'outside'; // contorno da letra (fora = por baixo, com o dobro da espessura)
  const drawGlyph = (c, line, g, st, px, py, track) => {
    const a = st.a == null ? 1 : st.a;
    if (a <= .001) return false;
    c.save();
    if (st.clip === true) { const sx = skOn ? skw : 0; c.beginPath(); c.rect(line.x0 - size * 2, line.baseline - lay.mask.top - sx, line.width + size * 4, lay.mask.h + sx * 2); c.clip(); }
    else if (st.clip) clipFx(c, st, lay.blockW, lay.blockH);
    c.globalAlpha *= a;
    c.translate(px + (st.dx || 0), py + (st.dy || 0));
    applyXf(c, st);
    c.translate(-px, -py);
    if (lay.mixed) c.font = g.f;
    let ch = g.ch, gx = line.x0 + g.x + track;
    if (st.scr) { ch = SCR[Math.floor(rand(seed, g.ci + 3) * SCR.length)]; gx = line.x0 + g.x + g.w / 2 - c.measureText(ch).width / 2; }
    c.translate(gx, line.baseline); c.rotate(SUBPX); // ver SUBPX: sem isso a letra anda em degraus de 1 px na vertical
    // sem ctx.filter por letra (brilho e filtro com sombra custam centenas de ms por quadro): desfoque pela sombra, brilho pela cor
    const bl = st.blur > .15 ? st.blur * R.rs : 0;
    const put = (col, x) => { c.fillStyle = col; if (bl) blurText(c, ch, x, 0, col, bl); else c.fillText(ch, x, 0); };
    if (st.split) { c.save(); c.globalAlpha *= .7; put('#FF3D6E', -st.split); put('#3DD6FF', st.split); c.restore(); }
    const col = brightCol(g.c || L.color, st.bright), gl = (st.glow || 0) + glowIdle;
    const putStroke = () => {
      const sc = brightCol(skC(L), st.bright), lw = skOut ? skw * 2 : skw;
      c.save(); c.lineJoin = L.strokeJoin || 'round'; c.miterLimit = 3;
      if (bl) blurText(c, ch, 0, 0, sc, bl, lw); else { c.strokeStyle = sc; c.lineWidth = lw; c.strokeText(ch, 0, 0); }
      c.restore();
    };
    if (skOn && skOut) putStroke();
    put(col, 0);
    if (skOn && !skOut) putStroke();
    if (gl > .01) { // luz na cor da própria letra (neon, flash): só o halo desfocado, por cima
      const m = c.getTransform(), r = size * (.12 + .16 * Math.min(gl, 2)) * Math.hypot(m.a, m.b);
      c.globalAlpha *= Math.min(1, gl);
      blurText(c, ch, 0, 0, col, r);
      if (gl > .6) blurText(c, ch, 0, 0, col, r * 2.5);
    }
    c.restore();
    return true;
  };
  const paint = (c, stOf) => {
    for (const line of lay.lines) {
      const nInLine = line.glyphs.length;
      // barra de marca-texto: anima quando o preset atual é "highlight"; fica cheia enquanto a camada entrou com ele
      if ((L.in === 'highlight' || key === 'highlight') && line.text.trim()) {
        let b;
        if (key === 'highlight') b = stOf(line.li).bar ?? 0;
        else b = L.in === 'highlight' ? 1 : 0;
        if (b > 0) {
          const padX = size * .18;
          const x = line.x0 - padX, wBar = (line.width + padX * 2) * b;
          c.save(); c.fillStyle = L.hl || '#D98E4A';
          c.fillRect(x, line.baseline - size * .86, wBar, size * 1.12);
          c.restore();
        }
      }
      for (const g of line.glyphs) {
        if (g.space) continue;
        const idx = unit === 'char' ? g.ci : unit === 'word' ? g.word : unit === 'line' ? line.li : 0;
        const st = stOf(idx);
        // pivô da unidade
        let px, py;
        if (unit === 'char') { px = line.x0 + g.x + g.w / 2; }
        else if (unit === 'word') { const wg = line.glyphs.filter(x => x.word === g.word); px = line.x0 + (wg[0].x + wg[wg.length - 1].x + wg[wg.length - 1].w) / 2; }
        else if (unit === 'line') px = line.x0 + line.width / 2;
        else px = 0;
        py = (unit === 'all') ? 0 : (P && P.pivot === 'base' ? line.baseline : P && P.pivot === 'top' ? line.baseline - size * .74 : line.baseline - size * .34);
        const track = st.track ? (g.k - (nInLine - 1) / 2) * st.track : 0;
        // rastro: a mesma unidade alguns instantes antes, cada vez mais apagada
        if (trail && stOf !== none) for (let j = trail.n; j >= 1; j--) {
          const pr = ph.p - j * trail.lag; if (pr <= 0) continue;
          const sj = stAt(idx, pr);
          drawGlyph(c, line, g, { ...sj, a:(sj.a ?? 1) * (1 - j / (trail.n + 1)) * .45 * tfade }, px, py, track);
        }
        if (drawGlyph(c, line, g, st, px, py, track) && P && P.cursor) lastVisible = Math.max(lastVisible, g.ci);
      }
    }
  };
  if (whole) {
    // preset do bloco inteiro: o estado vale para o todo; senão (3D ou brilho contínuo) as letras seguem animando dentro
    const own = P && P.whole, st = mergeSt(own ? stateFor(0) : {}, rasterIdle(idl));
    drawState(ctx, st, lay.blockW, lay.blockH, R, c => { c.font = lay.font; c.textBaseline = 'alphabetic'; c.textAlign = 'left'; paint(c, own || !P ? none : stateFor); },
      { pad:size * .6, color:L.lineColor || S.brand.colors[2] });
  } else paint(ctx, stateFor);
  // cursor
  if (P && P.cursor && ph.mode === 'in') {
    let gx = 0, by = 0, found = false;
    for (const line of lay.lines) for (const g of line.glyphs) if (g.ci === lastVisible) { gx = line.x0 + g.x + g.w + size * .06; by = line.baseline; found = true; }
    if (!found && lay.lines[0]) { gx = lay.lines[0].x0; by = lay.lines[0].baseline; }
    if (Math.floor(t * 3) % 2 === 0 || ph.p < .95) { ctx.fillStyle = L.color; ctx.fillRect(gx, by - size * .78, Math.max(3, size * .06), size * .9); }
  }
  drawMark(ctx, L, lay, ph, t, R); // marca à mão (sublinhar, circular, riscar…)
  ctx.restore();
}

/* ============================================================
   Ajustes de imagem (exposição, contraste, cor, detalhes)
   ============================================================ */
// L.aExp, L.aCon… (−1..1, ausente = 0; os de min 0 só vão para um lado). As contas rodam num shader WebGL2 (`adjGL`) e a foto
// ajustada fica num canvas por camada (`ADJC`), refeito só quando a foto ou um valor muda (vídeo: a cada quadro). Até ADJ_MAX px
// no lado maior. Vinheta: com máscara é desenhada no palco, por cima da máscara (`adjVignette`), senão o recorte escondia parte dela.
const ADJ = [
  ['Luz', [['aExp', 'Exposição'], ['aCon', 'Contraste'], ['aHi', 'Realces'], ['aSh', 'Sombras'], ['aWh', 'Brancos'], ['aBl', 'Pretos']]],
  ['Cor', [['aTemp', 'Temperatura'], ['aTint', 'Tonalidade'], ['aSat', 'Saturação'], ['aVib', 'Vibração'], ['aHue', 'Matiz']]],
  ['Detalhes', [['aSharp', 'Nitidez', 0], ['aFade', 'Desbotar', 0], ['aVig', 'Vinheta'], ['aGrain', 'Granulado', 0]]],
];
const ADJ_K = ADJ.flatMap(g => g[1].map(a => a[0]));
const ADJ_MAX = 3200;
const LOOKS = {
  none:['Original', {}],
  vivid:['Vivo', { aVib:.45, aCon:.15, aSat:.08 }],
  warm:['Quente', { aTemp:.35, aVib:.12, aExp:.04 }],
  cool:['Frio', { aTemp:-.32, aTint:.04, aSat:-.06 }],
  soft:['Suave', { aCon:-.2, aHi:-.25, aSh:.25, aFade:.15 }],
  drama:['Dramático', { aCon:.35, aHi:-.45, aSh:-.15, aSat:-.15, aVig:.35, aSharp:.3 }],
  film:['Filme', { aCon:.18, aSat:-.12, aFade:.22, aTemp:.08, aVig:.25, aGrain:.18 }],
  vintage:['Vintage', { aFade:.45, aTemp:.22, aSat:-.25, aCon:-.08, aVig:.3, aGrain:.25 }],
  bw:['P&B', { aSat:-1, aCon:.18 }],
  noir:['Noir', { aSat:-1, aCon:.45, aBl:-.3, aVig:.4, aGrain:.2 }],
};
const adjOn = L => L.type === 'image' && ADJ_K.some(k => L[k]);
let AGL = null;
function adjGL() {
  if (AGL !== null) return AGL;
  AGL = false;
  const cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { alpha:true, premultipliedAlpha:true, antialias:false });
  if (!gl) return false;
  const VS = `#version 300 es
in vec2 p; out vec2 v; void main() { v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  const FS = `#version 300 es
precision highp float;
uniform sampler2D u_img; uniform vec2 u_px; uniform float u_gs;
uniform float ${ADJ_K.map(k => 'u_' + k).join(', ')};
in vec2 v; out vec4 o;
const vec3 LW = vec3(.2126, .7152, .0722);
float hash(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 c = texture(u_img, v);
  vec3 col = c.rgb;
  if (u_aSharp > 0.) { // máscara de nitidez; vizinhos pesados pelo alfa (sem halo na borda de recorte)
    vec4 n1 = texture(u_img, v + vec2(u_px.x, 0.)), n2 = texture(u_img, v - vec2(u_px.x, 0.)), n3 = texture(u_img, v + vec2(0., u_px.y)), n4 = texture(u_img, v - vec2(0., u_px.y));
    float sa = n1.a + n2.a + n3.a + n4.a;
    vec3 b = sa > 1e-4 ? (n1.rgb * n1.a + n2.rgb * n2.a + n3.rgb * n3.a + n4.rgb * n4.a) / sa : col;
    col += (col - b) * u_aSharp * 2.5;
  }
  // exposição e balanço de branco em luz linear
  vec3 lin = pow(max(col, 0.), vec3(2.2));
  lin *= vec3(1. + u_aTemp * .4 + u_aTint * .08, 1. - u_aTint * .25, 1. - u_aTemp * .4 + u_aTint * .08) * exp2(u_aExp * 2.);
  col = pow(max(lin, 0.), vec3(1. / 2.2));
  float l = dot(col, LW);
  col += u_aSh * .28 * (1. - smoothstep(0., .55, l)) + u_aHi * .28 * smoothstep(.45, 1., l)
       + u_aWh * .22 * smoothstep(.55, 1., l) + u_aBl * .18 * (1. - smoothstep(0., .3, l));
  col = (col - .5) * (u_aCon >= 0. ? 1. + u_aCon * .9 : 1. + u_aCon * .7) + .5;
  l = dot(col, LW);
  float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
  col = mix(vec3(l), col, max(0., 1. + u_aSat) * max(0., 1. + u_aVib * (1. - clamp((mx - mn) * 1.6, 0., 1.)) * 1.1));
  if (u_aHue != 0.) { // gira o matiz no espaço YIQ (mantém o brilho)
    float a = u_aHue * 3.14159265, cs = cos(a), sn = sin(a);
    float Y = dot(col, vec3(.299, .587, .114)), I = dot(col, vec3(.596, -.274, -.322)), Q = dot(col, vec3(.211, -.523, .312));
    float I2 = I * cs - Q * sn, Q2 = I * sn + Q * cs;
    col = vec3(Y + .956 * I2 + .621 * Q2, Y - .272 * I2 - .647 * Q2, Y - 1.106 * I2 + 1.703 * Q2);
  }
  col = col * (1. - u_aFade * .22) + u_aFade * .1;
  if (u_aVig != 0.) {
    float m = smoothstep(.35, 1., length((v - .5) * 2.) * .7071) * abs(u_aVig) * .9;
    col = mix(col, vec3(u_aVig > 0. ? 0. : 1.), m);
  }
  if (u_aGrain > 0.) col += (hash(floor(v / u_px / u_gs)) - .5) * u_aGrain * .35;
  col = clamp(col, 0., 1.);
  o = vec4(col * c.a, c.a);
}`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  try {
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const u = { px:gl.getUniformLocation(pr, 'u_px'), gs:gl.getUniformLocation(pr, 'u_gs') };
    for (const k of ADJ_K) u[k] = gl.getUniformLocation(pr, 'u_' + k);
    cv.addEventListener('webglcontextlost', () => { AGL = null; ADJC.clear(); needs = true; });
    AGL = { cv, gl, pr, u, tex, src:null, max:gl.getParameter(gl.MAX_TEXTURE_SIZE) };
  } catch (e) { console.warn('Ajustes de imagem:', e); }
  return AGL;
}
const ADJC = new Map(); // id da camada → { key, cv }
function adjImg(L, img) {
  if (!img || !adjOn(L)) return img;
  const vid = img.tagName === 'VIDEO';
  if (vid && img.readyState < 2) return img;
  const iw = img.naturalWidth, ih = img.naturalHeight; if (!iw || !ih) return img;
  const fit = !masked(L);
  const key = (vid ? 'v' + img.currentTime + '|' + RT.frameNo : L.src) + '|' + fit + '|' + ADJ_K.map(k => L[k] || 0).join(',');
  let e = ADJC.get(L.id);
  if (e && e.key === key) return e.cv;
  const A = adjGL(); if (!A) return img;
  const s = Math.min(1, ADJ_MAX / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * s)), hh = Math.max(1, Math.round(ih * s));
  const gl = A.gl;
  if (A.cv.width !== w || A.cv.height !== hh) { A.cv.width = w; A.cv.height = hh; }
  gl.viewport(0, 0, w, hh);
  gl.bindTexture(gl.TEXTURE_2D, A.tex);
  if (vid || A.src !== img) {
    let el = img;
    if (Math.max(iw, ih) > A.max) { el = document.createElement('canvas'); el.width = w; el.height = hh; el.getContext('2d').drawImage(img, 0, 0, w, hh); }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    const mip = s < .7 && el === img; // reduzindo muito: mipmap, senão serrilha
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    A.src = vid ? null : img;
  }
  gl.useProgram(A.pr);
  for (const k of ADJ_K) gl.uniform1f(A.u[k], k === 'aVig' && !fit ? 0 : L[k] || 0);
  gl.uniform2f(A.u.px, 1 / w, 1 / hh); gl.uniform1f(A.u.gs, Math.max(1, Math.max(w, hh) / 1400));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (!e) {
    for (const id of ADJC.keys()) if (!S.layers.some(o => o.id === id)) ADJC.delete(id);
    e = { cv:document.createElement('canvas') }; ADJC.set(L.id, e);
  }
  if (e.cv.width !== w || e.cv.height !== hh) { e.cv.width = w; e.cv.height = hh; }
  const c = e.cv.getContext('2d'); c.clearRect(0, 0, w, hh); c.drawImage(A.cv, 0, 0);
  e.cv.naturalWidth = iw; e.cv.naturalHeight = ih; e.key = key; // quem desenha usa as medidas da foto original
  return e.cv;
}
// vinheta na máscara (elipse do tamanho dela, mesma curva do shader); v < 0 = clareia
function adjVignette(ctx, v, w, hh) {
  ctx.save(); ctx.scale(w / 2, hh / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2), c = v > 0 ? '0,0,0' : '255,255,255', a = Math.abs(v) * .9;
  for (let i = 0; i <= 10; i++) { const o = .35 + .065 * i, q = (o - .35) / .65; g.addColorStop(o, `rgba(${c},${(a * q * q * (3 - 2 * q)).toFixed(3)})`); }
  g.addColorStop(0, `rgba(${c},0)`);
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}

/* ============================================================
   Blocos: logo, botão, imagem
   ============================================================ */
function blockGeom(L) {
  if (L.type === 'logo') {
    const lg = logoOf(L); if (!lg) return null;
    const w = L.size * W(); const s = w / lg.bw; return { w, h:lg.bh * s, s };
  }
  if (L.type === 'image') {
    const img = (L.video && videoEl(L)) || imgNow(L.src); const w = L.size * W(); // vídeo: o quadro atual; até carregar, o pôster (src)
    const h = L.mask && L.mask !== 'fit' && L.mh != null ? L.mh * W() : img ? w * img.naturalHeight / img.naturalWidth : w * .75;
    return { w, h, img };
  }
  if (L.type === 'shape') {
    const w = L.size * W();
    if (L.kind === 'custom') { const b = customBox(L.d); return { w, h:w * b.h / b.w, cust:b }; }
    if (L.kind === 'line') return { w, h:Math.max(1, L.strokeW || 8) };
    return { w, h:(L.kind === 'ellipse' && L.mh == null ? L.size : L.mh ?? L.size * .6) * W() };
  }
  if (L.type === 'cta') {
    MCTX.font = fontStr(L, L.size);
    const tw = MCTX.measureText(L.text).width;
    return { w: tw + L.padX * 2, h: L.size + L.padY * 2, tw };
  }
  return null;
}
function effKey(L, key) {
  const lgo = L.type === 'logo' ? logoOf(L) : null;
  if (key === 'handwrite' && L.type === 'logo') return lgo && lgo.pen ? key : 'wipe';
  const svgKey = key === 'draw' || key === 'assemble' || key === 'handwrite';
  if (L.type === 'logo' && svgKey && !(lgo && lgo.isSvg && lgo.parts.length)) return key === 'assemble' ? 'spring' : 'wipe';
  if (L.type === 'shape' && key === 'draw') return key;
  if (L.type !== 'logo' && svgKey) return 'fade';
  return key;
}
/* Formas vetoriais: Path2D centrado em (0,0) + comprimento do contorno (para o traço se desenhar) */
const SVGNS = 'http://www.w3.org/2000/svg';
let CBOX = null; const CUST = new Map();
function customBox(d) {
  if (CUST.has(d)) return CUST.get(d);
  if (!CBOX) { CBOX = document.createElementNS(SVGNS, 'svg'); CBOX.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'; CBOX.append(document.createElementNS(SVGNS, 'path')); document.body.append(CBOX); }
  const el = CBOX.firstChild; let r = { x:0, y:0, w:100, h:100, len:400 };
  try { el.setAttribute('d', d); const b = el.getBBox(); r = { x:b.x, y:b.y, w:Math.max(1, b.width), h:Math.max(1, b.height), len:el.getTotalLength() || 400 }; } catch (e) {}
  CUST.set(d, r); return r;
}
function polyPath(pts) { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); p.closePath(); return p; }
const polyLen = pts => pts.reduce((a, q, i) => a + Math.hypot(q[0] - pts[(i + 1) % pts.length][0], q[1] - pts[(i + 1) % pts.length][1]), 0);
function ngon(w, h, n, inner) {
  const pts = [], m = inner ? n * 2 : n;
  for (let i = 0; i < m; i++) { const a = -Math.PI / 2 + i * TAU / m, k = inner && i % 2 ? inner : 1; pts.push([Math.cos(a) * w / 2 * k, Math.sin(a) * h / 2 * k]); }
  return pts;
}
// estilos do traçado: padrão em múltiplos da espessura (traço, vão, ...); o ponto é um traço de comprimento 0 com ponta redonda
const STROKE_STYLES = { solid:'Sólido', dash:'Tracejado', long:'Longo', dot:'Pontilhado', dashdot:'Traço-ponto' };
const STROKE_PAT = { dash:[3, 2], long:[6, 3], dot:[0, 2], dashdot:[4, 2, 0, 2] };
function strokeCap(L) { return L.strokeDash === 'dot' ? 'round' : (L.strokeCap || 'round'); }
// padrão de traço exato (SVG importado): só vale enquanto o estilo e o espaçamento são os de quando entrou; mexer num deles volta aos estilos prontos
const strokeArr = L => { const s = L.strokeArr; return s && s.a && s.a.length && s.k === `${L.strokeDash}|${L.strokeGap ?? 1}` ? s.a : null; };
/* Contorno (como no Figma): vale para texto, logo, botão, imagem/vídeo e forma, junto com a cor, sem tirá-la.
   "Sem cor" (a bolinha branca cortada de vermelho no seletor) é a cor com opacidade 0: o rgb fica guardado para voltar. */
const noCol = c => colA(c) <= 0;
const skW = L => Math.max(.5, L.strokeW || (L.type === 'shape' ? 8 : 4));
const skC = L => L.strokeColor || '#ffffff';
// forma sem preenchimento (arquivos antigos: fill:false) ou com todas as cores em uso "sem cor"; contorno ligado
function fillVoid(L) {
  const n = { solid:1, linear:3, spot:2, mesh:4 }[L.mode] || 0;
  for (let i = 1; i <= n; i++) if (!noCol(L['c' + i])) return false;
  return n > 0;
}
const shFilled = L => L.kind !== 'line' && L.fill !== false && !fillVoid(L);
const strokeOn = L => L.type === 'shape' ? L.kind === 'line' || !!L.stroke || L.fill === false : !!L.stroke;
const strokeSee = L => strokeOn(L) && !noCol(skC(L));
// lista para setLineDash. dp < 1 = traço sendo desenhado: o padrão é cortado no comprimento já percorrido
function strokeDash(L, len, dp) {
  const pat = STROKE_PAT[L.strokeDash], raw = strokeArr(L), far = len * 2 + 10;
  if (!pat && !raw) return dp < 1 ? [len * dp, far] : [];
  let a;
  if (raw) a = raw; // padrão exato (vindo de um SVG): medidas em px do vídeo, sem compensar a ponta
  else {
    const w = Math.max(3, skW(L)), cap = strokeCap(L), g = clamp(L.strokeGap ?? 1, .4, 3);
    // ponta redonda/quadrada avança meia espessura de cada lado: encurta o traço e alarga o vão, o desenho fica igual
    const ext = cap === 'butt' ? 0 : w;
    a = pat.map((v, i) => i % 2 ? Math.max(.5, v * w * g + ext) : Math.max(.01, v * w - ext));
  }
  if (dp >= 1) return a;
  const end = len * dp, out = []; let pos = 0;
  for (let i = 0; pos < end && i < 6000; i++) {
    const take = Math.min(a[i % a.length], end - pos);
    out.push(take); pos += take;
  }
  if (out.length % 2) out.push(far); else out[out.length - 1] += far;
  return out;
}
function shapeVec(L, G) {
  const w = G.w, h = G.h, k = L.kind;
  if (k === 'ellipse') { const p = new Path2D(); p.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); const a = w / 2, b = h / 2; return { path:p, len:Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))), closed:true }; }
  if (k === 'line') { const p = new Path2D(); p.moveTo(-w / 2, 0); p.lineTo(w / 2, 0); return { path:p, len:w, closed:false }; }
  if (k === 'custom') {
    const b = G.cust, s = w / b.w, p = new Path2D();
    p.addPath(new Path2D(L.d), new DOMMatrix().translate(-(b.x + b.w / 2) * s, -(b.y + b.h / 2) * s).scale(s, s));
    return { path:p, len:b.len * s, closed:true };
  }
  if (k === 'triangle') { const pts = [[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; return { path:polyPath(pts), len:polyLen(pts), closed:true }; }
  if (k === 'polygon' || k === 'star') { const pts = ngon(w, h, Math.max(3, Math.round(L.points || 5)), k === 'star' ? clamp(L.inner ?? .45, .1, .95) : 0); return { path:polyPath(pts), len:polyLen(pts), closed:true }; }
  const rr = radii4(radOf(L), w, h), p = new Path2D();
  rrTrace(p, -w / 2, -h / 2, w, h, rr);
  return { path:p, len:2 * (w + h) - (2 - Math.PI / 2) * (rr[0] + rr[1] + rr[2] + rr[3]), closed:true };
}
// raio dos cantos: número (todos iguais) ou [sup. esq., sup. dir., inf. dir., inf. esq.]; radOf lê da camada (radSep = cada canto com o seu)
const RAD_KEYS = ['rTL', 'rTR', 'rBR', 'rBL'];
const radOf = L => L.radSep ? RAD_KEYS.map(k => L[k] ?? L.radius ?? 0) : (L.radius || 0);
function radii4(r, w, h) {
  if (!Array.isArray(r)) { const v = Math.max(0, Math.min(r, w / 2, h / 2)); return [v, v, v, v]; }
  const [a, b, c, d] = r.map(v => Math.max(0, v || 0));
  const f = Math.min(1, w / ((a + b) || 1), w / ((c + d) || 1), h / ((a + d) || 1), h / ((b + c) || 1));
  return [a * f, b * f, c * f, d * f];
}
function rrTrace(p, x, y, w, h, r) {
  const [a, b, c, d] = radii4(r, w, h);
  p.moveTo(x + a, y); p.arcTo(x + w, y, x + w, y + h, b); p.arcTo(x + w, y + h, x, y + h, c); p.arcTo(x, y + h, x, y, d); p.arcTo(x, y, x + w, y, a); p.closePath();
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrTrace(ctx, x, y, w, h, r); }
function rrectP(x, y, w, h, r) { const p = new Path2D(); rrTrace(p, x, y, w, h, r); return p; }
// contorno de um caminho fechado ou aberto (forma, máscara da imagem, botão). strokePos: dentro/fora = traço central
// com o dobro da espessura recortado pelo caminho (ou pelo que sobra dele); dp < 1 = "Desenhar traço" em andamento
function strokeOnPath(ctx, path, L, o = {}) {
  const { closed = true, len = 0, dp = 1 } = o, w = skW(L), pos = closed ? L.strokePos || 'center' : 'center', lw = pos === 'center' ? w : w * 2;
  ctx.save();
  ctx.strokeStyle = skC(L); ctx.lineJoin = L.strokeJoin || 'round'; ctx.lineCap = strokeCap(L); ctx.lineWidth = lw;
  if (pos === 'inside') ctx.clip(path, L.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
  else if (pos === 'outside') { const big = new Path2D(); big.rect(-1e5, -1e5, 2e5, 2e5); big.addPath(path); ctx.clip(big, 'evenodd'); }
  const dash = strokeDash({ ...L, strokeW:lw }, len, dp); if (dash.length) ctx.setLineDash(dash);
  ctx.stroke(path); ctx.restore();
}
function paintPart(ctx, pt, overrideAlpha) {
  ctx.globalAlpha *= pt.op;
  if (pt.fill) { ctx.fillStyle = pt.fill; ctx.fill(pt.path, pt.rule); }
  if (pt.stroke) { ctx.lineWidth = pt.sw; ctx.strokeStyle = pt.stroke; ctx.lineCap = pt.cap; ctx.lineJoin = pt.join; ctx.stroke(pt.path); }
}
let TINTC = null;
// contorno do logo: a silhueta da imagem engordada (cópias em volta, em passos pequenos para a espessura ficar cheia), guardada pronta
function logoOutline(ctx, L, G, info) {
  const lg = logoOf(L); if (!lg || !lg.img) return;
  const r = skW(L), col = withA(skC(L), 1), key = `${Math.round(G.w)}|${Math.round(G.h)}|${r}|${col}`;
  if (!lg._ol || lg._ol.key !== key) {
    const pad = Math.ceil(r) + 2, w = Math.ceil(G.w) + pad * 2, hh = Math.ceil(G.h) + pad * 2;
    const sil = document.createElement('canvas'); sil.width = w; sil.height = hh;
    const s = sil.getContext('2d'); s.drawImage(lg.img, pad, pad, G.w, G.h);
    s.globalCompositeOperation = 'source-in'; s.fillStyle = col; s.fillRect(0, 0, w, hh);
    let cur = sil;
    const n = Math.max(1, Math.ceil(r / 4)), step = r / n;
    for (let i = 0; i < n; i++) {
      const nx = document.createElement('canvas'); nx.width = w; nx.height = hh;
      const c = nx.getContext('2d'); c.drawImage(cur, 0, 0);
      for (let a = 0; a < 16; a++) c.drawImage(cur, Math.cos(a * TAU / 16) * step, Math.sin(a * TAU / 16) * step);
      cur = nx;
    }
    lg._ol = { key, c:cur, pad };
  }
  const svg = info.key === 'draw' || info.key === 'assemble' || info.key === 'handwrite'; // o contorno só aparece quando o logo termina de se formar
  ctx.save(); ctx.globalAlpha *= colA(skC(L)) * (svg ? clamp((info.pp - .8) / .2) : 1);
  ctx.drawImage(lg._ol.c, -G.w / 2 - lg._ol.pad, -G.h / 2 - lg._ol.pad); ctx.restore();
}
function drawBlockContent(ctx, L, G, info, R) {
  if (L.type === 'logo' && strokeSee(L)) logoOutline(ctx, L, G, info);
  drawBlockBody(ctx, L, G, info, R);
}
function drawBlockBody(ctx, L, G, info, R) {
  if (L.type === 'logo' && L.tint) {
    // pinta o logo inteiro (imagem, traço, peças) numa cor só: desenha à parte e troca a cor de tudo que tem tinta
    const pad = Math.ceil(info.key === 'assemble' ? G.w * .7 : (L.drawWidth || 5) + 30);
    const w = Math.ceil(G.w + pad * 2), h = Math.ceil(G.h + pad * 2);
    if (!TINTC) TINTC = document.createElement('canvas');
    TINTC.width = w; TINTC.height = h;
    const c = TINTC.getContext('2d');
    c.translate(w / 2, h / 2);
    drawBlockContent(c, { ...L, tint:false, drawOrig:false, stroke:false }, G, info, R);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = L.tintColor || '#ffffff'; c.fillRect(0, 0, w, h);
    ctx.drawImage(TINTC, -w / 2, -h / 2);
    return;
  }
  if (L.type === 'logo') {
    const lg = logoOf(L);
    const key = info.key;
    if (key === 'handwrite' && lg.pen) {
      // a caneta revela o logo pelo mapa de tempos (ver buildPen); intensidade acentua o embalo no meio
      const pp = info.pp;
      drawPen(ctx, lg, G, lerp(pp, (1 - Math.cos(Math.PI * pp)) / 2, .3 + .5 * info.I));
      return;
    }
    if (lg.isSvg && lg.parts.length && (key === 'draw' || key === 'assemble')) {
      const pp = info.pp, I = info.I, n = lg.parts.length;
      const enter = c => { c.scale(G.s, G.s); c.translate(-(lg.bx + lg.bw / 2), -(lg.by + lg.bh / 2)); };
      if (key === 'draw') {
        const dp = clamp(pp / .72), fillA = Ease.cubicInOut(clamp((pp - .55) / .45)), strokeA = 1 - Ease.cubicInOut(clamp((pp - .82) / .18));
        if (strokeA > 0) {
          ctx.save(); enter(ctx);
          lg.parts.forEach((pt, i) => {
            const pi = Ease.cubicInOut(unitP(dp, i, n, .15 + .45 * I)); if (pi <= .002) return;
            ctx.save(); ctx.transform(...pt.m);
            ctx.lineWidth = L.drawWidth / (G.s * pt.ms);
            ctx.strokeStyle = L.drawOrig ? (pt.stroke || pt.fill || L.drawColor) : L.drawColor;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.setLineDash([pt.len * pi, pt.len * 2 + 10]); ctx.lineDashOffset = 0;
            ctx.globalAlpha *= strokeA; ctx.stroke(pt.path); ctx.restore();
          });
          ctx.restore();
        }
        if (fillA > 0) { ctx.save(); ctx.globalAlpha *= fillA; ctx.drawImage(lg.img, -G.w / 2, -G.h / 2, G.w, G.h); ctx.restore(); }
      } else {
        const ap = clamp(pp / .85), imgA = clamp((pp - .85) / .15);
        ctx.save(); enter(ctx);
        lg.parts.forEach((pt, i) => {
          const pi = unitP(ap, i, n, .5); if (pi <= 0) return;
          const e = Ease.spring(pi, I), r1 = rand(i, 1), r2 = rand(i, 2);
          const dist = (1 - e) * lg.bw * (.35 + .6 * I), ang = r1 * TAU;
          ctx.save(); ctx.globalAlpha *= clamp(pi * 3) * (1 - imgA);
          ctx.translate(pt.cx + Math.cos(ang) * dist, pt.cy + Math.sin(ang) * dist);
          ctx.rotate((1 - e) * (r2 - .5) * 2 * (.6 + I)); const sc = .3 + .7 * e; ctx.scale(sc, sc);
          ctx.translate(-pt.cx, -pt.cy); ctx.transform(...pt.m); paintPart(ctx, pt); ctx.restore();
        });
        ctx.restore();
        if (imgA > 0) { ctx.save(); ctx.globalAlpha *= imgA; ctx.drawImage(lg.img, -G.w / 2, -G.h / 2, G.w, G.h); ctx.restore(); }
      }
      return;
    }
    ctx.drawImage(lg.img, -G.w / 2, -G.h / 2, G.w, G.h);
    return;
  }
  if (L.type === 'image') {
    if (G.img) {
      ctx.save();
      if (L.mask === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, G.w / 2, G.h / 2, 0, 0, TAU); }
      else rrect(ctx, -G.w / 2, -G.h / 2, G.w, G.h, radOf(L));
      ctx.clip();
      const pn = panOf(L), iw = G.img.naturalWidth, ih = G.img.naturalHeight, k = Math.max(G.w / iw, G.h / ih) * pn.zoom; // enquadramento do formato aberto
      const dw = iw * k, dh = ih * k;
      ctx.drawImage(adjImg(L, G.img), -dw / 2 + pn.ix * G.w, -dh / 2 + pn.iy * G.h, dw, dh);
      if (L.aVig && masked(L)) adjVignette(ctx, L.aVig, G.w, G.h);
      ctx.restore();
      if (strokeSee(L)) strokeOnPath(ctx, L.mask === 'circle' ? (() => { const p = new Path2D(); p.ellipse(0, 0, G.w / 2, G.h / 2, 0, 0, TAU); return p; })() : rrectP(-G.w / 2, -G.h / 2, G.w, G.h, radOf(L)), L);
      drawDevice(ctx, L, G); // moldura de celular ou navegador em volta da máscara
    } else if (!R.export) {
      ctx.save(); rrect(ctx, -G.w / 2, -G.h / 2, G.w, G.h, radOf(L));
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 34px "Instrument Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Envie uma imagem', 0, 0); ctx.restore();
    }
    return;
  }
  if (L.type === 'shape') {
    const V = shapeVec(L, G), pp = info.pp, drawing = info.key === 'draw';
    const filled = shFilled(L), stroked = strokeOn(L); // fill desligado e contorno ligado são independentes (o "sem cor" é só uma cor)
    const dp = drawing ? Ease.cubicInOut(clamp(pp / .72)) : 1;
    const fillA = !filled ? 0 : drawing ? Ease.cubicInOut(clamp((pp - .5) / .5)) : 1;
    if (fillA > 0) {
      ctx.save(); ctx.clip(V.path, L.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'); ctx.globalAlpha *= fillA; ctx.translate(-G.w / 2, -G.h / 2);
      paintFill(ctx, L, info.t, G.w, G.h); ctx.restore();
    }
    const tmp = drawing && !stroked; // traço de apoio: some no fim
    const sa = tmp ? 1 - Ease.cubicInOut(clamp((pp - .82) / .18)) : 1;
    if (stroked && strokeSee(L) && dp > .002) strokeOnPath(ctx, V.path, L, { closed:V.closed, len:V.len, dp });
    else if (tmp && sa > 0 && dp > .002) {
      ctx.save(); ctx.globalAlpha *= sa; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = 5; ctx.strokeStyle = L.mode === 'solid' ? L.c1 : L.c2;
      ctx.setLineDash(dp < 1 ? [V.len * dp, V.len * 2 + 10] : []);
      ctx.stroke(V.path); ctx.restore();
    }
    return;
  }
  if (L.type === 'cta') {
    if (info.mode === 'hold' && L.idle === 'pulse') {
      const k = (info.tl % 1.6) / 1.6, I = info.I;
      ctx.save(); ctx.globalAlpha *= (1 - k) * .55; ctx.strokeStyle = L.bg; ctx.lineWidth = 4;
      const g = 1 + k * (.18 + .25 * I); const ww = G.w * g + k * 30, hh = G.h * g + k * 30;
      rrect(ctx, -ww / 2, -hh / 2, ww, hh, L.radius); ctx.stroke(); ctx.restore();
    }
    rrect(ctx, -G.w / 2, -G.h / 2, G.w, G.h, L.radius); ctx.fillStyle = L.bg; ctx.fill();
    if (strokeSee(L)) strokeOnPath(ctx, rrectP(-G.w / 2, -G.h / 2, G.w, G.h, L.radius), L);
    ctx.font = fontStr(L, L.size); ctx.fillStyle = L.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.translate(0, L.size * .35); ctx.rotate(SUBPX / 3); // o botão é largo: giro menor, também acima do limite (ver SUBPX)
    ctx.fillText(L.text, 0, 0);
  }
}
const freeType = L => ((L.type === 'image' || L.type === 'shape') && !L.keepIn); // sem margem: imagem e forma podem sangrar (com "Manter dentro da margem" obedecem)
// tamanho do bloco no formato aberto (fora do principal, a máscara de foto ou forma em retângulo pode mudar)
function geomNow(L) { const G = blockGeom(L); if (!G) return G; const pl = placeOf(L); return pl.hh || pl.ww ? { ...G, h:pl.hh || G.h, w:pl.ww || G.w } : G; }
function drawBlock(ctx, L, t, R) {
  const G = geomNow(L); if (!G) return;
  const ph = phase(L, t); if (!ph) return;
  const I = intOf(L, ph.mode === 'out' ? 'out' : 'in'), tl = t - L.start;
  // no formato aberto: posição e escala adaptadas
  const pl = placeOf(L);
  const fit = freeType(L) || inFlow(L) ? { ax:pl.x * W(), ay:pl.y * H(), k:1 } : fitInMargin(pl.x * W(), pl.y * H(), G.w * pl.k, G.h * pl.k), ax = fit.ax, ay = fit.ay, fk = fit.k * pl.k;
  L._bounds = { x:ax - G.w * fk / 2, y:ay - G.h * fk / 2, w:G.w * fk, h:G.h * fk };
  let key = ph.mode === 'in' ? L.in : ph.mode === 'out' ? L.out : null;
  if (key) key = effKey(L, key);
  const P = key ? BP[key] : null;
  const dir = ph.mode === 'out' ? -1 : 1;
  const pp = ph.mode === 'in' ? ph.p : ph.mode === 'out' ? 1 - ph.p : 1;
  const seed = Math.floor(t * 24);
  const stAt = q => {
    const e = ph.mode === 'in' ? easeIn(P.ease, q, I) : easeOutPhase(P.ease, q, I);
    return P.fn({ e, p:ph.mode === 'in' ? q : 1 - q, I, w:G.w, h:G.h, dir, W:W(), H:H(), seed, ...slideOf(L, ph.mode) });
  };
  const st = P && P.fn ? stAt(ph.p) : {};
  const idl = idleState(L, tl, ph, false, G.h / 2); // movimento contínuo

  // parado na tela, I e tl são os do movimento contínuo (anel do botão pulsante)
  const info = { key, pp, I:key ? I : intOf(L, 'idle'), mode:ph.mode, tl:tl * spdOf(L, 'idle'), t };
  const content = (c, s) => {
    if (s.clip === 'bounds') { const padX = G.w * .35, padY = G.h * .06; c.beginPath(); c.rect(-G.w / 2 - padX, -G.h / 2 - padY, G.w + padX * 2, G.h + padY * 2); c.clip(); }
    if (s.cdy) c.translate(0, s.cdy);
    drawBlockContent(c, L, G, info, R);
  };
  const o = { k:fk, rot:(L.rot || 0) * Math.PI / 180, piv:P && P.pivot ? (P.pivot === 'top' ? -G.h / 2 : G.h / 2) : 0,
    pad:Math.max(12, strokeOn(L) ? skW(L) : 0, Math.max(G.w, G.h) * .04), color:L.lineColor || S.brand.colors[2] };
  ctx.save();
  ctx.translate(ax, ay);
  ctx.globalAlpha *= L.opacity ?? 1;
  // rastro: o bloco alguns instantes antes, cada vez mais apagado
  if (P && P.trail && ph.mode !== 'hold') for (let j = P.trail.n; j >= 1; j--) {
    const q = ph.p - j * P.trail.lag; if (q <= 0) continue;
    const sj = stAt(q);
    drawState(ctx, mergeSt({ ...sj, a:(sj.a ?? 1) * (1 - j / (P.trail.n + 1)) * .45 * trailFade(ph) }, idl), G.w, G.h, R, content, o);
  }
  drawState(ctx, mergeSt(st, idl), G.w, G.h, R, content, o);
  ctx.restore();
}

/* ============================================================
   Fundo
   ============================================================ */
let NOISE = null;
function noiseTile() {
  if (NOISE) return NOISE;
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const x = c.getContext('2d'), d = x.createImageData(220, 220);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); NOISE = c; return c;
}
function drawBg(ctx, L, t, R) { paintFill(ctx, L, t, FW(), H()); }
// degradê exato (SVG importado): paradas em [posição 0..1 na caixa, cor]; só vale enquanto as três cores são as de quando entrou (editou a cor = volta ao degradê de três paradas)
const gradStops = L => { const s = L.gst; return L.mode === 'linear' && s && s.stops && s.key === [L.c1, L.c2, L.c3].join('|') ? s.stops : null; };
// preenchimento animado (usado pelo fundo e pelas formas): pinta o retângulo 0,0 → w,hh
function paintFill(ctx, L, t, w, hh) {
  const m = L.motion ?? 1, gs = gradStops(L);
  ctx.save();
  if (!gs) { ctx.fillStyle = L.c1; ctx.fillRect(0, 0, w, hh); } // degradê exato (SVG) pode ter transparência: sem cor de base
  if (L.mode === 'mesh') {
    [L.c2, L.c3, L.c4].forEach((c, i) => {
      const ph = i * 2.1 + .7;
      const px = w * (.5 + .42 * Math.sin(t * .33 * m + ph)), py = hh * (.5 + .42 * Math.cos(t * .26 * m + ph * 1.3));
      const r = Math.max(w, hh) * (.62 + .1 * i);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, hexA(c, i === 1 ? .55 : .85)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
    });
  } else if (L.mode === 'linear') {
    const a = ((L.angle ?? 135) + t * 8 * m) * Math.PI / 180, d = Math.hypot(w, hh) / 2;
    const g = ctx.createLinearGradient(w / 2 - Math.cos(a) * d, hh / 2 - Math.sin(a) * d, w / 2 + Math.cos(a) * d, hh / 2 + Math.sin(a) * d);
    if (gs) gs.forEach(([o, c]) => g.addColorStop(clamp(o, 0, 1), c)); else { g.addColorStop(0, L.c1); g.addColorStop(.55, L.c2); g.addColorStop(1, L.c3); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
  } else if (L.mode === 'spot') {
    const px = w * (.5 + .08 * Math.sin(t * .5 * m)), py = hh * (.42 + .05 * Math.cos(t * .4 * m));
    const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(w, hh) * .7);
    g.addColorStop(0, hexA(L.c2, .95)); g.addColorStop(.55, hexA(L.c2, .25)); g.addColorStop(1, hexA(L.c2, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
  } else if (L.mode === 'image') {
    const img = imgNow(L.src);
    if (img) {
      const k = Math.max(w / img.naturalWidth, hh / img.naturalHeight) * (1 + .1 * m * (t / Math.max(1, S.duration)));
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      ctx.drawImage(img, (w - iw) / 2, (hh - ih) / 2, iw, ih);
      if (L.darken > 0) { ctx.fillStyle = `rgba(0,0,0,${L.darken})`; ctx.fillRect(0, 0, w, hh); }
    }
  }
  if (L.grain > 0) {
    const n = noiseTile(), f = Math.floor(t * fps());
    ctx.globalAlpha *= L.grain; ctx.globalCompositeOperation = 'overlay'; // soma ao alfa herdado (opacidade, animação), senão o granulado ignora
    const pat = ctx.createPattern(n, 'repeat');
    const ox = Math.floor(rand(f, 1) * 220), oy = Math.floor(rand(f, 2) * 220);
    ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(0, 0, w + 220, hh + 220);
  }
  ctx.restore();
}

/* ============================================================
   Quadro
   ============================================================ */
function renderFrame(ctx, t, rs, isExport) {
  const R = { rs, export:!!isExport };
  if (S.still) t = 0;
  RT.frameNo = (RT.frameNo || 0) + 1; // a adaptação ao formato (placement) é refeita uma vez por quadro
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // RT.only (PNG da seleção): só essas camadas, sobre fundo transparente
  if (RT.only) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  ctx.setTransform(rs, 0, 0, rs, 0, 0);
  const one = (c, L) => {
    try {
      if (L.type === 'bg') drawBg(c, L, t, R);
      else if (L.type === 'text') drawText(c, L, t, R);
      else drawBlock(c, L, t, R);
    } catch (e) { console.error(e); }
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  };
  // câmera (camadas 'camera' e transições com movimento) mexe em todo o quadro; sombra e movimento da imagem são de cada camada
  const cam = camAt(t), buf = !RT.only && (cam.blur > .3 || cam.whip) ? frameBuf(ctx.canvas, 0) : null, tc = buf ? buf.getContext('2d') : ctx;
  if (buf) { tc.setTransform(1, 0, 0, 1, 0, 0); tc.fillStyle = '#000'; tc.fillRect(0, 0, buf.width, buf.height); tc.setTransform(rs, 0, 0, rs, 0, 0); }
  const els = S.layers.filter(L => L.visible && !NOBOX(L) && (!RT.only || RT.only.has(L.id)));
  // grupo com animação própria: os itens são desenhados juntos, à parte, e o conjunto entra no lugar do primeiro item
  const gAct = new Map(), gDone = new Set();
  const gActive = gid => {
    if (!gAct.has(gid)) { const gp = !RT.noGrp && (gAnimOn(gid) || gStyleOn(gid)) && gpseudo(gid); gAct.set(gid, gp && phase(gp, t) ? gp : null); }
    return gAct.get(gid);
  };
  drawItems(tc, els, null, { act:gActive, done:gDone }, els, t, R, cam, one, 0);
  if (buf) camComposite(ctx, buf, cam);
  // transições por cima de tudo
  if (!S.still && !RT.only) for (const L of S.layers) if (L.visible && L.type === 'fx') drawFx(ctx, L, t, R);
}

/* ============================================================
   Câmera, transições, sombra, movimento da imagem, moldura e marcas à mão
   Tudo por preset. Câmera e transição são camadas da timeline (tipos 'camera' e 'fx'): não aparecem no palco
   e só valem entre o início e o fim da barra. Sombra, marca, movimento e moldura são escolhas da própria camada.
   ============================================================ */
const NOBOX = L => L.type === 'camera' || L.type === 'fx';
const sinIO = u => .5 - .5 * Math.cos(Math.PI * clamp(u));
const hashId = s => { let x = 7; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 100003; return x; };
// telas de apoio do tamanho do quadro: uma por uso e por tamanho
// 0 câmera · 1 camada à parte (sombra, mesclagem) · 2 e 3 sombra longa · 4 desfoque de movimento (exportação) · 5 sombra + mesclagem · 6 transição com mesclagem · 7 grupo animado
// pad = margem em px em volta do quadro (c._pad): o que passa da borda continua existindo e entra no desfoque e na sombra
// (sem ela o desfoque de um elemento que sangra pela borda clareava perto da borda, como se ele acabasse ali)
const FBUF = new Map();
const padOf = c => c._pad || 0;
function frameBuf(ref, slot, pad = 0) {
  const w = ref.width - 2 * padOf(ref), hh = ref.height - 2 * padOf(ref);
  const k = `${slot}:${w}x${hh}+${pad}`; let c = FBUF.get(k);
  if (!c) { if (FBUF.size > 40) FBUF.clear(); c = document.createElement('canvas'); c.width = w + pad * 2; c.height = hh + pad * 2; c._pad = pad; FBUF.set(k, c); }
  return c;
}
// margem que a sombra e o desfoque da camada precisam (px da tela, arredondada para poucas telas diferentes)
function fxPad(L, sh, rs, w, hh) {
  if (L.type === 'bg') return 0; // o fundo não passa do quadro (o desfoque dele já desenha um pouco maior)
  let p = (L.lblur || 0) * rs * 3;
  if (sh) { const k = shadowK(L) * rs; p += sh.long ? 28 * Math.max(.75, 3.4 * k) : ((sh.blur || 0) + Math.max(Math.abs(sh.x || 0), Math.abs(sh.y || 0))) * k; }
  return p < 1 ? 0 : Math.min(Math.ceil(p / 32) * 32, Math.ceil(Math.max(w, hh) / 2));
}

/* ------------ mesclagem (blend mode): como a camada se mistura com o que está atrás dela.
   Vale para tudo que desenha: texto, logo, botão, imagem, forma, fundo e transição (L.blend; ausente = normal).
   A camada inteira (com sombra e efeitos) é desenhada à parte e só então mistura com o quadro, então letras e pedaços
   que se sobrepõem não misturam duas vezes. A chave é o próprio globalCompositeOperation do canvas; normal desenha
   direto, sem tela extra. Cada modo: [chave, nome, dica] ------------ */
const BLEND_GROUPS = [
  ['', [['normal', 'Normal', '']]],
  ['Escurecem', [
    ['darken', 'Escurecer', 'Darken. Fica só o que é mais escuro que o que está atrás.'],
    ['multiply', 'Multiplicar', 'Multiply. Escurece: o branco some e o preto fica. Bom para sombras e texturas.'],
    ['color-burn', 'Queimar cores', 'Color Burn. Escurece e aumenta o contraste.']]],
  ['Clareiam', [
    ['lighten', 'Clarear', 'Lighten. Fica só o que é mais claro que o que está atrás.'],
    ['screen', 'Tela', 'Screen. Clareia: o preto some e o branco fica. Bom para luz, brilho e fumaça.'],
    ['color-dodge', 'Desviar cores', 'Color Dodge. Clareia e aumenta o contraste, com brilho forte.'],
    ['lighter', 'Adicionar', 'Add. Soma a luz com o que está atrás. Bom para faíscas e clarões.']]],
  ['Contraste', [
    ['overlay', 'Sobrepor', 'Overlay. Escurece os tons escuros de trás e clareia os claros. Bom para dar cor e textura.'],
    ['soft-light', 'Luz suave', 'Soft Light. Contraste suave. Dá cor à foto sem estourar.'],
    ['hard-light', 'Luz direta', 'Hard Light. Contraste forte, como uma luz dura por cima.']]],
  ['Comparação', [
    ['difference', 'Diferença', 'Difference. O claro inverte as cores de trás e o preto não muda.'],
    ['exclusion', 'Exclusão', 'Exclusion. Como Diferença, com menos contraste.']]],
  ['Cor e luz', [
    ['hue', 'Matiz', 'Hue. Troca só a cor de trás, mantendo a luz e a saturação.'],
    ['saturation', 'Saturação', 'Saturation. Usa só a saturação desta camada.'],
    ['color', 'Cor', 'Color. Pinta o que está atrás com esta cor, mantendo a luz.'],
    ['luminosity', 'Luminosidade', 'Luminosity. Usa só a claridade desta camada, mantendo a cor de trás.']]],
];
const BLENDS = Object.fromEntries(BLEND_GROUPS.flatMap(g => g[1]).map(([k, nome, dica]) => [k, { nome, dica }]));
// modo escolhido na camada, ou null quando é normal (ou desconhecido)
const blendOf = L => { const b = L.blend; return b && b !== 'normal' && BLENDS[b] ? b : null; };
// mistura uma tela do tamanho do quadro (já pronta, em pixels) com o que está no quadro
function blendOnto(tc, buf, bm) {
  tc.save(); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1; tc.filter = 'none'; tc.globalCompositeOperation = bm;
  tc.drawImage(buf, 0, 0); tc.restore();
}

/* ------------ câmera: u = 0..1 ao longo da barra, tl = segundos desde o início. Devolve s (escala), dx, dy (px), r (rad) ------------ */
const CAMS = {
  push:     { label:'Aproximar devagar', fn:(u, tl, I) => ({ s:1 + (.05 + .13 * I) * sinIO(u) }) },
  pull:     { label:'Afastar devagar', fn:(u, tl, I) => ({ s:1 + (.05 + .13 * I) * (1 - sinIO(u)) }) },
  punch:    { label:'Zoom de impacto', fn:(u, tl, I, sp) => ({ s:1 + (.06 + .14 * I) * Ease.spring(clamp(tl * sp / .8), .4 + .5 * I) }) },
  shake:    { label:'Tremor no impacto', fn:(u, tl, I, sp) => { const a = (8 + 30 * I) * Math.exp(-tl * sp * 4.5); return { dx:a * (Math.sin(tl * 71) + .5 * Math.sin(tl * 127 + 1)) / 1.5, dy:a * (Math.sin(tl * 83 + 2) + .5 * Math.sin(tl * 151)) / 1.5, r:a * .0008 * Math.sin(tl * 59) }; } },
  hand:     { label:'Câmera na mão', fn:(u, tl, I, sp) => { const a = sinIO(tl * 1.5), f = .7 * sp, m = (3 + 9 * I) * a; return { dx:m * (Math.sin(tl * 1.3 * f) + .6 * Math.sin(tl * 2.9 * f + 1.7)), dy:m * (Math.sin(tl * 1.7 * f + .5) + .5 * Math.sin(tl * 3.3 * f)), r:.0035 * I * a * Math.sin(tl * 1.1 * f + .3), s:1 + .015 * a }; } },
  drift:    { label:'Deriva lateral', fn:(u, tl, I) => ({ dx:-(30 + 90 * I) * sinIO(u), s:1 + .025 * sinIO(u) }) },
  parallax: { label:'Paralaxe', par:1, fn:(u, tl, I) => ({ dx:-(40 + 110 * I) * sinIO(u), s:1 + (.02 + .05 * I) * sinIO(u) }) },
  tilt:     { label:'Inclinar', fn:(u, tl, I) => ({ r:(.012 + .028 * I) * sinIO(u), s:1 + (.03 + .03 * I) * sinIO(u) }) },
};
/* ------------ transição: cobre a tela inteira no meio da barra (u = .5), onde o conteúdo troca. `cam` mexe no quadro ------------ */
const FXS = {
  wipe:   { label:'Cortina', dur:.8, draw:(c, L, u) => fxSweep(c, [L.c2, L.c1], u, 0) },
  bars:   { label:'Faixas', dur:.9, draw:(c, L, u) => fxSweep(c, [L.c3, L.c2, L.c1], u, H() * .14) },
  circle: { label:'Círculo', dur:.9, draw:(c, L, u) => fxCircle(c, [L.c2, L.c1], u) },
  blinds: { label:'Persianas', dur:.9, draw:(c, L, u) => fxBlinds(c, L, u) },
  flash:  { label:'Clarão', dur:.5, draw:(c, L, u) => { c.globalAlpha *= u < .5 ? Math.pow(u * 2, 2) : 1 - Ease.cubicOut((u - .5) * 2); c.fillStyle = L.c2; c.fillRect(0, 0, W(), H()); } },
  zoom:   { label:'Zoom através', dur:.7,
            cam:(u, I) => { const q = u < .5 ? u * 2 : 2 - u * 2; return { s:1 + (u < .5 ? 1.6 : 1.1) * q * q * q, blur:(8 + 30 * I) * q * q }; },
            draw:(c, L, u) => { c.globalAlpha *= .55 * Math.exp(-Math.pow((u - .5) / .06, 2)); c.fillStyle = L.c2; c.fillRect(0, 0, W(), H()); } },
  whip:   { label:'Chicote', dur:.6, cam:(u, I) => { const q = u < .5 ? u * 2 : 2 - u * 2; return { whip:(u < .5 ? -.5 : .5) * q * q * q, wblur:(.06 + .16 * I) * Math.pow(q, 1.5) }; } },
};
// faixas que entram pela esquerda, cobrem e saem pela direita (a primeira cor fica atrás: cobre antes e sai depois)
function fxSweep(c, cols, u, sk) {
  const w = W(), hh = H(), n = cols.length, ex = Math.abs(sk), span = w + ex * 2;
  cols.forEach((col, i) => {
    const d = (n - 1 - i) * .07, a = .46 - d;
    const le = Ease.cubicInOut(clamp(u / a)), tr = Ease.cubicInOut(clamp((u - .54 - d) / a));
    const x0 = -ex + span * tr, x1 = -ex + span * le; if (x1 <= x0) return;
    c.fillStyle = col; c.beginPath();
    c.moveTo(x0 + sk, 0); c.lineTo(x1 + sk, 0); c.lineTo(x1 - sk, hh); c.lineTo(x0 - sk, hh); c.closePath(); c.fill();
  });
}
function fxCircle(c, cols, u) {
  const w = W(), hh = H(), R = Math.hypot(w, hh) / 2 + 4, n = cols.length;
  cols.forEach((col, i) => {
    const d = (n - 1 - i) * .08, a = .46 - d;
    const g = Ease.cubicInOut(clamp(u / a)), q = Ease.cubicInOut(clamp((u - .54 - d) / a));
    if (g <= 0 || q >= 1) return;
    c.fillStyle = col; c.beginPath(); c.arc(w / 2, hh / 2, R * g, 0, TAU);
    if (q > 0) { c.moveTo(w / 2 + R * q, hh / 2); c.arc(w / 2, hh / 2, R * q, 0, TAU, true); }
    c.fill();
  });
}
function fxBlinds(c, L, u) {
  const w = W(), hh = H(), n = 7, sh = hh / n, s = .035, a = .46 - (n - 1) * s;
  for (let i = 0; i < n; i++) {
    const g = Ease.cubicInOut(clamp((u - i * s) / a)), q = Ease.cubicInOut(clamp((u - .54 - i * s) / a));
    if (g <= q) continue;
    c.fillStyle = i % 2 ? L.c3 : L.c1;
    c.fillRect(0, i * sh + sh * q - .5, w, sh * (g - q) + 1);
  }
}
function camAt(t) {
  const c = { s:1, dx:0, dy:0, r:0, par:0, blur:0, whip:0, wblur:0 };
  if (S.still) return c;
  for (const L of S.layers) {
    if (!L.visible || !NOBOX(L)) continue;
    const end = L.end ?? S.duration; if (t < L.start || t > end) continue;
    const P = L.type === 'camera' ? CAMS[L.cam] : FXS[L.fx]; if (!P) continue;
    const u = (t - L.start) / Math.max(.05, end - L.start), I = L.intensity ?? .6;
    const st = L.type === 'camera' ? P.fn(u, t - L.start, I, L.speed || 1) : P.cam ? P.cam(u, I) : null; if (!st) continue;
    c.s *= st.s ?? 1; c.dx += st.dx || 0; c.dy += st.dy || 0; c.r += st.r || 0;
    c.blur += st.blur || 0; c.whip += st.whip || 0; c.wblur += st.wblur || 0;
    if (P.par) c.par = Math.max(c.par, P.par);
  }
  return c;
}
// paralaxe: o fundo anda pouco, quem está mais na frente anda mais
const layerDepth = (L, i, n) => L.type === 'bg' ? .3 : .55 + .9 * i / Math.max(1, n - 1);
function applyCam(c, cam, L, depth) {
  const k = cam.par ? lerp(1, depth, cam.par) : 1, dx = cam.dx * k, dy = cam.dy * k, r = cam.r;
  let s = 1 + (cam.s - 1) * k;
  // o fundo sempre cobre o quadro: cresce o bastante para as bordas não aparecerem
  if (L.type === 'bg') s = Math.max(s, 1 + 2 * Math.max(Math.abs(dx) / FW(), Math.abs(dy) / H()) + Math.abs(r) * 2.2);
  if (s === 1 && !dx && !dy && !r) return;
  const cx = FW() / 2, cy = H() / 2;
  c.translate(cx + dx, cy + dy); if (r) c.rotate(r); c.scale(s, s); c.translate(-cx, -cy);
}
function camComposite(ctx, buf, cam) {
  const w = buf.width, hh = buf.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (cam.whip) {
    // chicote: média de cópias deslocadas (rastro de lado); a borda que abre mostra o próprio quadro de novo
    const v = cam.whip * w, len = cam.wblur * w, n = 9;
    for (let j = 0; j < n; j++) {
      const o = v + (j / (n - 1) - .5) * len;
      ctx.globalAlpha = 1 / (j + 1);
      ctx.drawImage(buf, o, 0); ctx.drawImage(buf, o - (o >= 0 ? w : -w), 0);
    }
  } else {
    const b = cam.blur * (w / FW()), k = 1 + b * 3 / Math.min(w, hh);
    ctx.filter = `blur(${b.toFixed(2)}px)`;
    ctx.drawImage(buf, -(k - 1) * w / 2, -(k - 1) * hh / 2, w * k, hh * k);
  }
  ctx.restore();
}
function drawFx(ctx, L, t, R) {
  const P = FXS[L.fx], end = L.end ?? S.duration; if (!P || !P.draw || t < L.start || t > end) return;
  // com mesclagem, a transição é desenhada inteira à parte (as faixas se sobrepõem) e só então mistura com o quadro
  const bm = blendOf(L), buf = bm ? frameBuf(ctx.canvas, 6) : null, c = buf ? buf.getContext('2d') : ctx;
  if (buf) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, buf.width, buf.height); c.setTransform(R.rs, 0, 0, R.rs, 0, 0); }
  c.save(); c.globalAlpha = L.opacity ?? 1;
  // carrossel: a transição acontece em cada slide, do mesmo jeito
  for (let s = 0; s < slides(); s++) {
    c.save(); if (slides() > 1) { c.beginPath(); c.rect(s * W(), 0, W(), H()); c.clip(); c.translate(s * W(), 0); }
    try { P.draw(c, L, (t - L.start) / Math.max(.05, end - L.start)); } catch (e) { console.error(e); }
    c.restore();
  }
  c.restore();
  if (buf) blendOnto(ctx, buf, bm);
}

/* ------------ sombra: a camada é desenhada à parte e volta com a sombra (acompanha fade, máscaras e animações) ------------ */
const SHADOWS = {
  none:  { label:'Sem sombra' },
  soft:  { label:'Suave', blur:26, y:10, a:.4 },
  close: { label:'Rente', blur:8, y:4, a:.55 },
  float: { label:'Flutuante', blur:64, y:36, a:.5 },
  hard:  { label:'Dura', x:10, y:10, a:1, solid:true },
  glow:  { label:'Luz', blur:44, a:.95, glow:true },
  long:  { label:'Longa', long:true, a:.3 },
};
const shadowColor = (L, sh) => hexA(L.shColor || autoShadowHex(L, L.shadow), sh.a);
// a sombra cresce com o elemento (texto pequeno, sombra curta)
const shadowK = L => { const b = L._bounds; return b ? clamp(Math.sqrt(Math.min(b.w, b.h) / 180), .45, 1.6) : 1; };
function drawShadowed(tc, src, L, sh, rs) {
  const k = shadowK(L) * rs, o = padOf(tc.canvas) - padOf(src);
  tc.save(); tc.setTransform(1, 0, 0, 1, o, o);
  if (sh.long) {
    // silhueta tingida, empilhada na diagonal numa tela à parte e aplicada com transparência
    const tint = frameBuf(src, 2, padOf(src)), x = tint.getContext('2d'), ext = frameBuf(src, 3, padOf(src)), y = ext.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, tint.width, tint.height); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = L.shColor || '#000000'; x.fillRect(0, 0, tint.width, tint.height); x.globalCompositeOperation = 'source-over';
    y.setTransform(1, 0, 0, 1, 0, 0); y.clearRect(0, 0, ext.width, ext.height);
    const n = 28, step = Math.max(.75, 3.4 * k);
    for (let i = n; i >= 1; i--) y.drawImage(tint, i * step, i * step);
    tc.globalAlpha = sh.a; tc.drawImage(ext, 0, 0); tc.globalAlpha = 1;
  } else {
    tc.shadowColor = shadowColor(L, sh); tc.shadowBlur = (sh.blur || 0) * k; tc.shadowOffsetX = (sh.x || 0) * k; tc.shadowOffsetY = (sh.y || 0) * k;
  }
  tc.drawImage(src, 0, 0);
  tc.restore();
}
/* ------------ desfoque (como no Figma): L.lblur = da camada (ela inteira, com a sombra, fica borrada), L.bblur = do fundo
   (vidro: o que já está no quadro atrás dela é borrado no formato dela). Valores em px do vídeo (largura 1080) ------------ */
const BLURS = {
  lblur: [[0, 'Nenhum'], [3, 'Leve'], [10, 'Médio'], [28, 'Forte']],
  bblur: [[0, 'Nenhum'], [8, 'Leve'], [20, 'Vidro'], [44, 'Fosco']],
};
const blurOn = L => (L.lblur || 0) > 0 || (L.type !== 'bg' && (L.bblur || 0) > 0);
// borra o que já está em tc (o quadro até aqui) e põe de volta só onde a camada (src) existe
function backBlur(tc, src, b, lb = 0) {
  const m = frameBuf(src, 'bb', padOf(src)), c = m.getContext('2d'), o = padOf(src) - padOf(tc.canvas);
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, m.width, m.height);
  // a forma da camada com o alfa reforçado: vidro com preenchimento quase transparente ainda desfoca tudo atrás
  for (let i = 0; i < 6; i++) c.drawImage(src, 0, 0);
  // um pouco maior que o quadro, para a borda da tela não escurecer o desfoque
  const w = tc.canvas.width, hh = tc.canvas.height, k = 1 + b * 3 / Math.min(w, hh);
  c.globalCompositeOperation = 'source-in'; c.filter = `blur(${b.toFixed(2)}px)`;
  c.drawImage(tc.canvas, o - (k - 1) * w / 2, o - (k - 1) * hh / 2, w * k, hh * k);
  c.filter = 'none'; c.globalCompositeOperation = 'source-over';
  // com desfoque da camada, a borda do vidro também borra: o fundo desfocado se dissolve no quadro em vez de cortar em linha seca
  if (lb > .2 && padOf(m)) clampEdges(m);
  tc.save(); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1; tc.filter = lb > .2 ? `blur(${lb.toFixed(2)}px)` : 'none'; tc.globalCompositeOperation = 'source-over';
  tc.drawImage(m, -o, -o); tc.restore();
}
// estica a última linha/coluna do quadro pela margem da tela: o desfoque continua a camada além da borda do quadro
// (sem isso, o que encosta ou passa da borda clareava perto dela)
function clampEdges(cv) {
  const p = padOf(cv), fw = cv.width - 2 * p, fh = cv.height - 2 * p, x = cv.getContext('2d');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, cv.width, p); x.clearRect(0, p + fh, cv.width, p); x.clearRect(0, p, p, fh); x.clearRect(p + fw, p, p, fh);
  x.drawImage(cv, p, p, fw, 1, p, 0, fw, p); x.drawImage(cv, p, p + fh - 1, fw, 1, p, p + fh, fw, p);
  x.drawImage(cv, p, p, 1, fh, 0, p, p, fh); x.drawImage(cv, p + fw - 1, p, 1, fh, p + fw, p, p, fh);
  x.drawImage(cv, p, p, 1, 1, 0, 0, p, p); x.drawImage(cv, p + fw - 1, p, 1, 1, p + fw, 0, p, p);
  x.drawImage(cv, p, p + fh - 1, 1, 1, 0, p + fh, p, p); x.drawImage(cv, p + fw - 1, p + fh - 1, 1, 1, p + fw, p + fh, p, p);
  x.restore();
}
// devolve ao quadro a camada pronta (src, em pixels): desfoque do fundo atrás, sombra, desfoque da camada e mesclagem
function composeOnto(tc, src, L, sh, bm, rs) {
  const lb = (L.lblur || 0) * rs, bb = L.type === 'bg' ? 0 : (L.bblur || 0) * rs;
  if (bb > .2) backBlur(tc, src, bb, lb);
  if (sh && !bm && lb <= .2) { drawShadowed(tc, src, L, sh, rs); return; }
  // a sombra mistura e borra junto com a camada (como no CSS e no Figma): primeiro camada + sombra, depois o modo e o desfoque
  let out = src;
  if (sh) {
    out = frameBuf(src, 5, padOf(src)); const oc = out.getContext('2d');
    oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, out.width, out.height);
    drawShadowed(oc, src, L, sh, rs);
  }
  if (lb > .2 && padOf(out)) clampEdges(out);
  const w = out.width, hh = out.height, k = L.type === 'bg' && lb > .2 ? 1 + lb * 3 / Math.min(w, hh) : 1; // o fundo borrado não mostra borda
  const o = padOf(tc.canvas) - padOf(out);
  tc.save(); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1;
  tc.globalCompositeOperation = bm || 'source-over'; tc.filter = lb > .2 ? `blur(${lb.toFixed(2)}px)` : 'none';
  tc.drawImage(out, o - (k - 1) * w / 2, o - (k - 1) * hh / 2, w * k, hh * k);
  tc.restore();
}
function drawLayerFx(tc, L, t, R, cam, depth, one) {
  const sh = L.type !== 'bg' && L.shadow && L.shadow !== 'none' ? SHADOWS[L.shadow] : null, bm = blendOf(L);
  const back = L.type === 'image' && L.move && L.move !== 'none' ? imageMotion(L, t) : null;
  try {
    if (!sh && !bm && !blurOn(L)) { tc.save(); applyCam(tc, cam, L, depth); one(tc, L); tc.restore(); return; }
    if (!phase(L, t)) return;
    // sombra, mesclagem e desfoque pedem a camada inteira pronta, à parte
    const P = fxPad(L, sh, R.rs, tc.canvas.width, tc.canvas.height), src = frameBuf(tc.canvas, 1, P), lc = src.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, src.width, src.height);
    lc.setTransform(R.rs, 0, 0, R.rs, P, P); applyCam(lc, cam, L, depth); one(lc, L);
    composeOnto(tc, src, L, sh, bm, R.rs);
  } finally { if (back) Object.assign(L, back); }
}

/* ------------ grupo com animação própria ------------
   Os itens do grupo são desenhados juntos numa tela à parte (cada um com a própria animação, sombra e câmera) e essa imagem
   do conjunto é animada pelo preset do grupo (mesmo motor dos blocos: drawState). O pivô é o centro da caixa do conjunto em repouso.
   Itens com mesclagem misturam só com o resto do grupo, não com o que está atrás dele. */
function groupBox(gid, mem) {
  const key = `${RT.rev}|${RT.gRev}|${RT.imgRev}|${RT.fontsOk.size}|${S.format}|${mem.map(l => l.id).join()}`, c = RT.gBox.get(gid);
  if (c && c.S === S && c.key === key) return c.b;
  ensureBounds(mem, true); // posição de repouso de todos (quem não está na tela agora também conta)
  const bs = mem.map(l => l._bounds).filter(Boolean); if (!bs.length) return null;
  const b = unionBox(bs);
  // faixas: itens que não se cruzam na vertical (linhas do conjunto); servem para máscara e inclinação por linha
  b.bands = [];
  for (const q of [...bs].sort((u, v) => u.y - v.y)) {
    const l = b.bands[b.bands.length - 1];
    if (l && q.y < l.y1 - 1) l.y1 = Math.max(l.y1, q.y + q.h); else b.bands.push({ y0:q.y, y1:q.y + q.h });
  }
  if (bs.length === mem.length) RT.gBox.set(gid, { S, key, b }); // sem cache enquanto faltar medir alguém (logo ou imagem carregando)
  return b;
}
// desenha itens em ordem; o frame animado mais acima (abaixo de `top`) desenha o conjunto dele de uma vez, com os de dentro por dentro
function drawItems(c, mem, top, G, els, t, R, cam, one, depth) {
  for (const L of mem) {
    let kid = null;
    if (L.grp) { const chain = []; for (let g = L.grp, n = 0; g && g !== top && n < 20; g = gpar(g), n++) chain.unshift(g); kid = chain.find(x => G.act(x)) || null; }
    if (kid) { if (!G.done.has(kid)) { G.done.add(kid); try { drawGroup(c, kid, G.act(kid), els, t, R, cam, one, G, depth + 1); } catch (e) { console.error(e); } } continue; }
    drawLayerFx(c, L, t, R, cam, layerDepth(L, els.indexOf(L), els.length), one);
  }
}
function drawGroup(tc, gid, gp, els, t, R, cam, one, G, depth = 0) {
  // sombra, opacidade e mesclagem do grupo: o conjunto (já animado) vai para uma tela à parte e só então volta ao quadro, com a sombra do grupo
  // por fora de tudo (a sombra de cada item já está no conjunto). Sem nada disso, desenha direto em tc.
  const gm = gmeta(gid) || {}, gsh = gm.shadow && gm.shadow !== 'none' ? SHADOWS[gm.shadow] : null, gbm = blendOf(gm), gop = gm.opacity ?? 1;
  const gL = { shadow:gm.shadow, shColor:gm.shColor, lblur:gm.lblur, bblur:gm.bblur, type:'group', _bounds:RT.gBox.get(gid)?.b };
  // com sombra ou desfoque, o conjunto é desenhado com margem em volta do quadro (o que passa da borda entra no efeito)
  const gpad = gsh || blurOn(gm) ? fxPad(gL, gsh, R.rs, tc.canvas.width, tc.canvas.height) : 0;
  const mem = els.filter(l => l.grp && ginside(l.grp, gid)), buf = frameBuf(tc.canvas, 7 + depth, gpad), bc = buf.getContext('2d');
  bc.setTransform(1, 0, 0, 1, 0, 0); bc.globalAlpha = 1; bc.filter = 'none'; bc.globalCompositeOperation = 'source-over';
  bc.clearRect(0, 0, buf.width, buf.height); bc.setTransform(R.rs, 0, 0, R.rs, gpad, gpad);
  drawItems(bc, mem, gid, G, els, t, R, cam, one, depth);
  const B = groupBox(gid, mem); gL._bounds = B;
  const pu = gpad / R.rs; // a margem em unidades do quadro
  // pela escala (não pelo tamanho do quadro): vale também em telas que mostram só parte do quadro (miniatura do carrossel)
  const blit = (c, x, y) => c.drawImage(buf, 0, 0, buf.width, buf.height, x - pu, y - pu, buf.width / R.rs, buf.height / R.rs);
  const out = gsh || gbm || gop < 1 || blurOn(gm) ? frameBuf(tc.canvas, 1, gpad) : null, dst = out ? out.getContext('2d') : tc;
  if (out) {
    dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = 1; dst.filter = 'none'; dst.globalCompositeOperation = 'source-over';
    dst.clearRect(0, 0, out.width, out.height); dst.setTransform(R.rs, 0, 0, R.rs, gpad, gpad); dst.globalAlpha = gop;
  }
  const done = () => {
    tc.filter = 'none'; tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
    if (!out) return;
    dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = 1;
    composeOnto(tc, out, gL, gsh, gbm, R.rs);
  };
  if (!B) { dst.save(); blit(dst, 0, 0); dst.restore(); done(); return; }
  const ph = phase(gp, t), w = B.w + 48, hh = B.h + 48, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  const key = ph.mode === 'in' ? gp.in : ph.mode === 'out' ? gp.out : null, P = key && BP[key] && BP[key].fn ? BP[key] : null;
  const I = intOf(gp, ph.mode === 'out' ? 'out' : 'in'), dir = ph.mode === 'out' ? -1 : 1, seed = Math.floor(t * 24);
  const stAt = q => {
    const e = ph.mode === 'in' ? easeIn(P.ease, q, I) : easeOutPhase(P.ease, q, I);
    return P.fn({ e, p:ph.mode === 'in' ? q : 1 - q, I, w, h:hh, dir, W:W(), H:H(), seed, ...slideOf(gp, ph.mode) });
  };
  const st = P ? stAt(ph.p) : {}, idl = idleState(gp, t - gp.start, ph, false, hh / 2);
  const bands = B.bands || [], padX = w * .35, BIG = 1e5;
  const content = (c, s) => {
    // várias linhas (textos empilhados com vão): máscara e inclinação valem para cada linha, não para a caixa alta do conjunto
    // (senão a inclinação entortava o grupo, o de cima andando muito mais que o de baixo, e a máscara única cortava o de baixo)
    if (bands.length > 1 && (s.clip === 'bounds' || s.kx)) {
      const sc = s.sc ?? 1, kx = s.kx || 0, k = kx * sc * (s.sy ?? 1) / (sc * (s.sx ?? 1) || 1);
      bands.forEach((bd, i) => {
        const y0 = bd.y0 - cy, y1 = bd.y1 - cy, bh = y1 - y0 + 48, mid = (y0 + y1) / 2;
        // cada linha fica com o seu pedaço (até o meio do vão), para nada aparecer duas vezes
        let top = i ? (bands[i - 1].y1 + bd.y0) / 2 - cy : -BIG, bot = i < bands.length - 1 ? (bd.y1 + bands[i + 1].y0) / 2 - cy : BIG;
        if (s.clip === 'bounds') { const pad = 24 + bh * .06; top = Math.max(top, y0 - pad); bot = Math.min(bot, y1 + pad); }
        c.save(); c.beginPath(); c.rect(-w / 2 - padX - BIG * (s.clip === 'bounds' ? 0 : 1), top, w + padX * 2 + BIG * (s.clip === 'bounds' ? 0 : 2), bot - top); c.clip();
        if (k) c.translate(-k * (mid - o.piv), 0);
        if (s.cdy) c.translate(0, s.cdy * bh / hh);
        blit(c, -cx, -cy); c.restore();
      });
      return;
    }
    if (s.clip === 'bounds') { const padY = hh * .06; c.beginPath(); c.rect(-w / 2 - padX, -hh / 2 - padY, w + padX * 2, hh + padY * 2); c.clip(); }
    if (s.cdy) c.translate(0, s.cdy);
    blit(c, -cx, -cy);
  };
  const o = { piv:P && P.pivot ? (P.pivot === 'top' ? -hh / 2 : hh / 2) : 0, pad:80, color:S.brand.colors[2], rot:gRad(gid) };
  dst.save(); dst.translate(cx, cy);
  if (P && P.trail && ph.mode !== 'hold') for (let j = P.trail.n; j >= 1; j--) {
    const q = ph.p - j * P.trail.lag; if (q <= 0) continue;
    const sj = stAt(q);
    drawState(dst, mergeSt({ ...sj, a:(sj.a ?? 1) * (1 - j / (P.trail.n + 1)) * .45 * trailFade(ph) }, idl), w, hh, R, content, o);
  }
  drawState(dst, mergeSt(st, idl), w, hh, R, content, o);
  dst.restore();
  done();
}

/* ------------ movimento dentro da imagem (ao longo da barra inteira): muda zoom/ix/iy só enquanto desenha ------------ */
const MOVES = { none:'Parada', in:'Aproximar', out:'Afastar', left:'Para a esquerda', right:'Para a direita', up:'Para cima', down:'Para baixo', scroll:'Rolar a tela' };
function imageMotion(L, t) {
  if (S.still) return null;
  const G = geomNow(L); if (!G || !G.img) return null;
  const iw = G.img.naturalWidth, ih = G.img.naturalHeight; if (!iw || !ih) return null;
  // parte do enquadramento do formato aberto; o resultado vai em L._pan (lido por panOf) só enquanto desenha
  const pn = panOf(L), back = { _pan:L._pan }, z0 = pn.zoom, end = L.end ?? S.duration;
  const u = clamp((t - L.start) / Math.max(.1, end - L.start)), e = sinIO(u), A = .14 + .12 * intOf(L, 'idle');
  // folga para andar sem mostrar a borda da imagem (em frações da máscara)
  const room = z => { const k = Math.max(G.w / iw, G.h / ih) * z; return { x:Math.max(0, (iw * k / G.w - 1) / 2), y:Math.max(0, (ih * k / G.h - 1) / 2) }; };
  const m = L.move; let { ix, iy } = pn, z = z0;
  if (m === 'in') z = z0 * (1 + A * e);
  else if (m === 'out') z = z0 * (1 + A * (1 - e));
  else if (m === 'left' || m === 'right') { z = z0 * (1 + A * .7); ix = (m === 'left' ? 1 : -1) * room(z).x * .92 * (1 - 2 * e); }
  else if (m === 'up' || m === 'down') { z = z0 * (1 + A * .7); iy = (m === 'up' ? 1 : -1) * room(z).y * .92 * (1 - 2 * e); }
  else if (m === 'scroll') iy = room(z0).y * (1 - 2 * sinIO(clamp((u - .12) / .76)));
  L._pan = { ix, iy, zoom:z };
  return back;
}

/* ------------ moldura (celular, navegador) em volta da máscara da imagem; G = tamanho da máscara. Acompanha as animações ------------ */
const DEVICES = { none:'Nenhuma', phone:'Celular', browser:'Navegador' };
function drawDevice(ctx, L, G) {
  if (L.type !== 'image' || !L.device || L.device === 'none') return;
  const w = G.w, hh = G.h;
  ctx.save();
  if (L.device === 'phone') {
    const b = w * .034, ro = radii4(radOf(L), w, hh);
    ctx.lineWidth = b; ctx.strokeStyle = '#0C0D10';
    rrect(ctx, -w / 2 - b / 2, -hh / 2 - b / 2, w + b, hh + b, ro.map(v => v + b / 2)); ctx.stroke();
    ctx.lineWidth = Math.max(1, b * .16); ctx.strokeStyle = 'rgba(255,255,255,.28)';
    rrect(ctx, -w / 2 - b, -hh / 2 - b, w + b * 2, hh + b * 2, ro.map(v => v + b)); ctx.stroke();
    const iw = w * .3, ih = w * .085;
    ctx.fillStyle = '#0C0D10'; rrect(ctx, -iw / 2, -hh / 2 + w * .035, iw, ih, ih / 2); ctx.fill();
    ctx.fillStyle = '#23252B';
    ctx.fillRect(w / 2 + b * .95, -hh * .2, b * .45, hh * .1);
    ctx.fillRect(-w / 2 - b * 1.4, -hh * .27, b * .45, hh * .06); ctx.fillRect(-w / 2 - b * 1.4, -hh * .18, b * .45, hh * .06);
  } else if (L.device === 'browser') {
    const bh = w * .068, r = Math.min(Math.max(radii4(radOf(L), w, hh)[0], 10), bh), top = -hh / 2 - bh;
    ctx.fillStyle = '#ECEDF0'; ctx.beginPath();
    ctx.moveTo(-w / 2, -hh / 2 + 1); ctx.lineTo(-w / 2, top + r); ctx.arcTo(-w / 2, top, -w / 2 + r, top, r);
    ctx.lineTo(w / 2 - r, top); ctx.arcTo(w / 2, top, w / 2, top + r, r); ctx.lineTo(w / 2, -hh / 2 + 1); ctx.closePath(); ctx.fill();
    const cy = top + bh / 2, dr = bh * .13;
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(-w / 2 + bh * .5 + i * dr * 3.2, cy, dr, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#FFFFFF'; rrect(ctx, -w * .26, cy - bh * .27, w * .52, bh * .54, bh * .27); ctx.fill();
  }
  ctx.restore();
}

/* ------------ marcas à mão sobre o texto: se desenham logo depois da entrada e somem na saída ------------ */
const MARKS = { none:'Nenhuma', underline:'Sublinhar', double:'Sublinhado duplo', strike:'Riscar', circle:'Circular', box:'Caixa', arrow:'Seta', cross:'Xis' };
// traços em volta do texto, no espaço do bloco (centro em 0,0). O tremido é fixo por camada (nada de aleatório no render)
function markPaths(L, lay) {
  const size = lay.size, bw = lay.blockW, bh = lay.blockH, sd = hashId(L.id);
  const ph = k => rand(sd, k) * TAU;
  const wob = (u, k, a) => (Math.sin(u * 7.1 + ph(k)) * .6 + Math.sin(u * 15.3 + ph(k + 1)) * .4) * a;
  const seg = (x0, y0, x1, y1, bow, k, n = 28) => { const P = []; for (let i = 0; i <= n; i++) { const u = i / n; P.push([lerp(x0, x1, u) + wob(u, k + 5, size * .012), lerp(y0, y1, u) + Math.sin(u * Math.PI) * bow + wob(u, k, size * .022)]); } return P; };
  const lines = lay.lines.filter(l => l.width > 0), out = [], m = L.mark;
  if (m === 'underline' || m === 'double') lines.forEach((l, i) => {
    const y = l.baseline + size * .17, x0 = l.x0 - size * .06, x1 = l.x0 + l.width + size * .1;
    out.push(seg(x0, y + size * .02, x1, y - size * .03, size * .04, i * 3));
    if (m === 'double') out.push(seg(x0 + size * .12, y + size * .15, x1 - size * .08, y + size * .1, size * .03, i * 3 + 1));
  });
  if (m === 'strike') lines.forEach((l, i) => { const y = l.baseline - size * .3; out.push(seg(l.x0 - size * .08, y + size * .07, l.x0 + l.width + size * .08, y - size * .07, -size * .02, i * 3)); });
  if (m === 'cross') { const x = bw / 2 + size * .08, y = bh / 2 + size * .02; out.push(seg(-x, -y, x, y, size * .05, 1), seg(x, -y, -x, y, -size * .05, 2)); }
  if (m === 'circle') {
    const rx = bw / 2 + size * .42, ry = bh / 2 + size * .3, a0 = -2.5 + rand(sd, 9) * .3, n = 72, P = [];
    for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + u * TAU * 1.07, k = 1 + wob(u, 3, .035) + u * .04; P.push([Math.cos(a) * rx * k, -size * .04 + Math.sin(a) * ry * k]); }
    out.push(P);
  }
  if (m === 'box') {
    const x = bw / 2 + size * .28, y = bh / 2 + size * .2, o = size * .12;
    out.push(seg(-x - o, -y, x + o * .5, -y - size * .02, size * .02, 1), seg(x, -y - o, x + size * .02, y + o * .5, size * .02, 2),
      seg(x + o, y, -x - o * .5, y + size * .02, size * .02, 3), seg(-x, y + o, -x - size * .02, -y - o * .6, size * .02, 4));
  }
  if (m === 'arrow') {
    const tx = -bw / 2 - size * .22, ty = size * .05, sx = tx - size * 1.1, sy = bh / 2 + size * .85, cx = tx - size * 1.05, cy = ty + size * .1, P = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30, q = 1 - u; P.push([q * q * sx + 2 * q * u * cx + u * u * tx + wob(u, 5, size * .015), q * q * sy + 2 * q * u * cy + u * u * ty + wob(u, 6, size * .015)]); }
    const a = Math.atan2(ty - cy, tx - cx), hl = size * .3;
    out.push(P, [[tx + Math.cos(a + 2.6) * hl, ty + Math.sin(a + 2.6) * hl], [tx, ty], [tx + Math.cos(a - 2.6) * hl, ty + Math.sin(a - 2.6) * hl]]);
  }
  return out.map(P => { let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return { P, len }; });
}
const MARKC = new Map();
// chamada no fim de drawText, no espaço do bloco de texto (acompanha posição, escala e movimento contínuo)
function drawMark(ctx, L, lay, ph, t, R) {
  if (!L.mark || L.mark === 'none' || !MARKS[L.mark]) return;
  const big = L.mark === 'circle' || L.mark === 'box' || L.mark === 'arrow', sp = spdOf(L, 'in') || 1;
  const t0 = L.start + ph.inD * .8, md = (big ? .8 : .55) / sp;
  let pr = S.still ? 1 : Ease.cubicOut(clamp((t - t0) / md)), a = 1;
  if (ph.mode === 'out') { pr *= 1 - clamp(ph.p * 1.5); a = 1 - clamp(ph.p * 1.4 - .3); }
  if (pr <= 0 || a <= 0) return;
  const key = [L.id, L.mark, lay.blockW.toFixed(1), lay.blockH.toFixed(1), lay.size, lay.nLines].join('|');
  let paths = MARKC.get(key); if (!paths) { if (MARKC.size > 200) MARKC.clear(); paths = markPaths(L, lay); MARKC.set(key, paths); }
  let left = pr * paths.reduce((s, p) => s + p.len, 0);
  ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = L.markColor || S.brand.colors[2]; ctx.lineWidth = Math.max(2.5, lay.size * (big ? .06 : .075));
  for (const { P } of paths) {
    if (left <= 0) break;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length && left > 0; i++) {
      const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (d <= left) { ctx.lineTo(P[i][0], P[i][1]); left -= d; }
      else { const f = left / d; ctx.lineTo(lerp(P[i - 1][0], P[i][0], f), lerp(P[i - 1][1], P[i][1], f)); left = 0; }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   Prévia
   ============================================================ */
const cv = $('#cv'), pctx = cv.getContext('2d');
let RS = .5;
/* Zoom do palco: RT.zoom = 1 cabe no espaço; maior rola (barras, Shift + roda, botão do meio), menor afasta e deixa mesa em volta.
   As alças e contornos ficam num canvas à parte (#ov, do tamanho da área visível), então aparecem e pegam mesmo fora do quadro. */
const ZMIN = .25, ZMAX = 8, STAGE_PAD = 36;
function fitStage() {
  if (!S) return;
  const box = $('#stageBox'), z = RT.zoom || 1;
  const bw = Math.max(100, box.clientWidth - STAGE_PAD * 2), bh = Math.max(100, box.clientHeight - STAGE_PAD * 2);
  const k = Math.min(bw / FW(), bh / H()) * z;
  const cw = Math.max(40, Math.floor(FW() * k)), ch = Math.max(40, Math.floor(H() * k));
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  RS = Math.min(1.5, (cw * dpr) / FW());
  cv.width = Math.round(FW() * RS); cv.height = Math.round(H() * RS);
  RT.fitK = Math.min(bw / FW(), bh / H());
  updZoomUI(); needs = true;
}
new ResizeObserver(fitStage).observe($('#stageBox'));
// zoom mantendo o ponto sob o cursor (ou o centro da área visível) no mesmo lugar
function setZoom(z, cx, cy) {
  z = clamp(z, ZMIN, ZMAX); if (Math.abs(z - 1) < .02) z = 1;
  const sc = $('#stageScroll'), r = cv.getBoundingClientRect(), b = sc.getBoundingClientRect();
  if (cx == null) { cx = b.left + sc.clientWidth / 2; cy = b.top + sc.clientHeight / 2; }
  const u = (cx - r.left) / (r.width || 1), v = (cy - r.top) / (r.height || 1);
  RT.zoom = z; fitStage();
  const r2 = cv.getBoundingClientRect();
  sc.scrollLeft += r2.left + u * r2.width - cx; sc.scrollTop += r2.top + v * r2.height - cy;
  needs = true;
}
const zoomPct = () => Math.round((RT.fitK || 1) * (RT.zoom || 1) * 100);
function updZoomUI() { const el = $('#zVal'); if (el) el.textContent = zoomPct() + '%'; }
function zoomFit() { RT.zoom = 1; fitStage(); const sc = $('#stageScroll'); sc.scrollLeft = 0; sc.scrollTop = 0; }
function zoom100() { setZoom(1 / (RT.fitK || 1)); }
$('#zIn').addEventListener('click', () => setZoom((RT.zoom || 1) * 1.25));
$('#zOut').addEventListener('click', () => setZoom((RT.zoom || 1) / 1.25));
$('#zVal').addEventListener('click', () => (RT.zoom || 1) === 1 ? zoom100() : zoomFit());
// Ctrl + roda (ou pinça do trackpad) faz zoom no ponto do cursor; a roda sozinha rola
$('#stageBox').addEventListener('wheel', ev => {
  if (!(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
  const d = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
  setZoom((RT.zoom || 1) * Math.exp(clamp(-d * .0025, -.6, .6)), ev.clientX, ev.clientY);
}, { passive:false });
$('#stageScroll').addEventListener('scroll', () => { needs = true; });
// botão do meio arrasta o palco
function panStage(ev) {
  const sc = $('#stageScroll'), x0 = ev.clientX, y0 = ev.clientY, l0 = sc.scrollLeft, t0 = sc.scrollTop;
  ev.preventDefault(); $('#stageBox').style.cursor = 'grabbing';
  const mv = e => { sc.scrollLeft = l0 - (e.clientX - x0); sc.scrollTop = t0 - (e.clientY - y0); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); $('#stageBox').style.cursor = ''; };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
$('#stageBox').addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
// ferramenta mão: com o espaço segurado, arrastar em qualquer ponto do palco navega (pega antes de selecionar ou escalar)
function handOn() { RT.hand = true; RT.handUsed = false; $('#stageBox').classList.add('hand'); }
function handOff(play_) {
  if (!RT.hand) return; const used = RT.handUsed; RT.hand = false; RT.handUsed = false; $('#stageBox').classList.remove('hand');
  if (play_ && !used) playing ? pause() : play();
}
addEventListener('keyup', e => { if (e.code === 'Space') handOff(true); });
addEventListener('blur', () => handOff(false));
$('#stageBox').addEventListener('pointerdown', e => {
  if (!RT.hand || e.button !== 0 || onScrollbar(e)) return;
  e.stopPropagation(); RT.handUsed = true; panStage(e);
}, true); // sem a rolagem automática do navegador

const ov = $('#ov'), octx = ov.getContext('2d');
function drawOverlays() {
  const sc = $('#stageScroll'), dpr = Math.min(2, window.devicePixelRatio || 1), vw = sc.clientWidth, vh = sc.clientHeight;
  if (ov.width !== Math.round(vw * dpr) || ov.height !== Math.round(vh * dpr)) { ov.width = Math.round(vw * dpr); ov.height = Math.round(vh * dpr); ov.style.width = vw + 'px'; ov.style.height = vh + 'px'; }
  const ctx = octx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
  const r = cv.getBoundingClientRect(), o = ov.getBoundingClientRect(), OS = dpr * r.width / FW(); // OS = pixels do overlay por unidade do vídeo
  const xf = [OS, 0, 0, OS, dpr * (r.left - o.left), dpr * (r.top - o.top)];
  ctx.save(); ctx.setTransform(...xf);
  ctx.beginPath(); ctx.rect(0, 0, FW(), H()); ctx.clip(); // área segura e margem ficam dentro do quadro; o resto (alças, contornos) passa da borda
  for (let s = 0; s < slides(); s++) {
  ctx.save(); ctx.translate(s * W(), 0); // carrossel: cada slide com a sua área segura e a sua margem
  if ($('#safe').checked && S.format === '9x16') {
    const w = W(), hh = H();
    ctx.fillStyle = 'rgba(229,118,106,.16)';
    ctx.fillRect(0, 0, w, hh * .14); ctx.fillRect(0, hh * .65, w, hh * .35);
    ctx.fillRect(0, hh * .14, w * .06, hh * .51); ctx.fillRect(w * .94, hh * .14, w * .06, hh * .51);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 26px "Instrument Sans", system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Área coberta pela interface do Reels (aprox.)', w / 2, hh * .14 - 22);
    ctx.fillText('Legenda, botões e perfil ficam aqui', w / 2, hh * .65 + 44);
  }
  const M = marginBox();
  if (M && !playing) {
    ctx.setLineDash([12, 10]); ctx.lineWidth = 1.5 / OS; ctx.strokeStyle = uiA('margin', .7);
    ctx.strokeRect(M.x0, M.y0, M.x1 - M.x0, M.y1 - M.y0); ctx.setLineDash([]);
  }
  ctx.restore();
  }
  // carrossel: divisa entre os slides (o que atravessa aparece cortado aqui no post)
  if (slides() > 1) {
    ctx.lineWidth = 1.5 / OS; ctx.strokeStyle = uiA('frame', .75); ctx.setLineDash([]);
    ctx.beginPath(); for (let s = 1; s < slides(); s++) { ctx.moveTo(s * W(), 0); ctx.lineTo(s * W(), H()); } ctx.stroke();
  }
  ctx.restore(); ctx.save(); ctx.setTransform(...xf);
  if (slides() > 1) { // número de cada slide, acima do quadro (o atual em destaque: é onde entra o que você adicionar)
    const px = 1 / OS * dpr, cur = curSlide(); ctx.save();
    ctx.font = `600 ${11 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (let s = 0; s < slides(); s++) { ctx.fillStyle = s === cur ? uiC('sel') : 'rgba(255,255,255,.5)'; ctx.fillText(`Slide ${s + 1}`, s * W() + 2 * px, -6 * px); }
    ctx.restore();
  }
  const ub = selUnion();
  if (!playing) for (const o of S.layers) {
    if ((o.id === RT.selected && !ub) || o.type === 'bg' || !o._bounds || !o.visible || !RT.picks || !RT.picks.has(o.id) || !phase(o, T)) continue;
    ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / OS; ctx.strokeStyle = uiA('sel', .55);
    outlineBox(ctx, o._bounds, o, selPad(o)); ctx.setLineDash([]);
  }
  const L = S.layers.find(l => l.id === RT.selected);
  for (const o of offPicked()) { // escolhida e fora da tela neste momento: tracejada onde assenta, dá para arrastar
    const g = ghostB(o); if (!g) continue;
    const p = selPad(o);
    ctx.fillStyle = uiA('sel', .07); outlineBox(ctx, g, o, p, undefined, true);
    ctx.setLineDash([4, 7]); ctx.lineWidth = 2 / OS; ctx.strokeStyle = uiA('sel', .75);
    outlineBox(ctx, g, o, p); ctx.setLineDash([]);
  }
  // item escolhido sozinho dentro de um grupo/frame: o contorno do grupo continua à vista (sem alças), como no Figma
  const pb = !playing && !ub && L && L.grp && !wholeGroup() && pickedLayers().length === 1 ? parentBox(L.grp) : null;
  if (pb) { ctx.setLineDash([]); ctx.lineWidth = 1.25 / OS; ctx.strokeStyle = uiA('sel', .6); outlineBox(ctx, pb, L, 0, 0); }
  // canto = quadrado (escala); lado = barra (muda largura, altura ou tamanho do frame)
  const hdl = q => { // q.a = giro com que a caixa aparece (forma e grupos): as alças giram junto
    const s = hRad() * .75 * SEL_FINE, bar = !(q.hx && q.hy), w = bar ? (q.hy === 0 ? s * .75 : s * 1.9) : s, hh = bar ? (q.hy === 0 ? s * 1.9 : s * .75) : s;
    ctx.fillStyle = uiC('sel'); ctx.strokeStyle = uiC('bg'); ctx.lineWidth = hRad() / 11;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a || 0);
    rrect(ctx, -w, -hh, w * 2, hh * 2, bar ? Math.min(w, hh) : w * .3); ctx.fill(); ctx.stroke(); ctx.restore();
  };
  if (!playing && ub) {
    ctx.setLineDash([]); ctx.lineWidth = 1.25 / OS; ctx.strokeStyle = uiA('sel', .9);
    outlineBox(ctx, ub, L, 0, 0);
    handlesOf(L).forEach(hdl);
  } else if (!playing && L && L.type !== 'bg' && L._bounds && L.visible && !RT.vec) {
    const ph = phase(L, T);
    if (ph) {
      ctx.setLineDash([]); ctx.lineWidth = 1.25 / OS;
      ctx.strokeStyle = uiA('sel', .9);
      outlineBox(ctx, L._bounds, L, selPad(L)); // girada (forma ou grupo): a caixa gira junto
      handlesOf(L).forEach(hdl);
    }
  }
  drawFlowGaps(ctx, 1 / OS * dpr); // espaços do layout automático
  if (RT.guide) {
    ctx.setLineDash([]); ctx.lineWidth = 2 / OS;
    for (const g of RT.guide) { ctx.strokeStyle = g.c; ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x1, g.y1); ctx.stroke(); }
  }
  // largura máx. do texto enquanto arrasta a alça lateral: onde as linhas quebram
  if (RT.drag && RT.drag.mode === 'rs' && RT.drag.how === 'tw' && RT.drag.L._bounds) {
    const D = RT.drag, b = D.L._bounds, cx = b.x + b.w / 2, hw = D.L.maxW * W() * D.k / 2;
    ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5 / OS; ctx.strokeStyle = uiA('frame', .9);
    ctx.beginPath(); ctx.moveTo(cx - hw, 0); ctx.lineTo(cx - hw, H()); ctx.moveTo(cx + hw, 0); ctx.lineTo(cx + hw, H()); ctx.stroke(); ctx.setLineDash([]);
  }
  const px = FW() / (cv.getBoundingClientRect().width || 1); // 1 px da tela em unidades do vídeo
  if (RT.drag && RT.drag.mode === 'rot' && RT.drag.show != null) { // ângulo enquanto gira
    const c = camFwd(RT.drag.cm, RT.drag.C), txt = Math.round(RT.drag.show * 10) / 10 + '°';
    ctx.font = `600 ${12 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width + 14 * px, th = 20 * px;
    ctx.fillStyle = uiC('sel'); rrect(ctx, c.x - tw / 2, c.y - th / 2, tw, th, 4 * px); ctx.fill();
    ctx.fillStyle = uiC('selInk'); ctx.fillText(txt, c.x, c.y + px * .5);
  }
  // passar o mouse (no palco, na lista ou na timeline): contorno fino e o nome, para saber quem vai ser clicado
  const hv = !playing && !RT.drag && RT.hover && !isPicked(RT.hover) ? S.layers.find(l => l.id === RT.hover) : null;
  if (hv && hv.type !== 'bg' && hv.visible && hv._bounds && phase(hv, T)) {
    const b = visB(hv), p = selPad(hv);
    ctx.setLineDash([]); ctx.lineWidth = 1.5 * px; ctx.strokeStyle = uiA('sel', .85);
    outlineBox(ctx, hv._bounds, hv, p);
    ctx.font = `600 ${11 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(hv.name).width, th = 18 * px, ty = b.y - p - th - 3 * px < 0 ? b.y + b.h + p + 3 * px : b.y - p - th - 3 * px;
    ctx.fillStyle = uiC('sel'); rrect(ctx, b.x - p, ty, tw + 12 * px, th, 4 * px); ctx.fill();
    ctx.fillStyle = uiC('selInk'); ctx.fillText(hv.name, b.x - p + 6 * px, ty + th / 2);
  }
  // edição de texto aberta: contorno cheio e etiqueta, para saber que dá para digitar
  const ed = !playing && RT.editId ? S.layers.find(l => l.id === RT.editId) : null;
  if (ed && ed.visible && ed._bounds && ed.id === RT.selected && phase(ed, T)) {
    const b = visB(ed), p = 0, txt = 'Editando texto · Esc para sair';
    ctx.setLineDash([]); ctx.lineWidth = 1.25 * px; ctx.strokeStyle = uiC('sel');
    outlineBox(ctx, ed._bounds, ed, p);
    ctx.font = `600 ${10.5 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width, th = 18 * px, ty = b.y - p - th - 3 * px < 0 ? b.y + b.h + p + 3 * px : b.y - p - th - 3 * px;
    ctx.fillStyle = uiC('sel'); rrect(ctx, b.x - p, ty, tw + 12 * px, th, 4 * px); ctx.fill();
    ctx.fillStyle = uiC('selInk'); ctx.fillText(txt, b.x - p + 6 * px, ty + th / 2);
  }
  // seleção por área: retângulo e quem vai entrar nela
  if (RT.marq) {
    const r = RT.marq;
    for (const o of marqHits(r)) { ctx.setLineDash([]); ctx.lineWidth = 1.5 * px; ctx.strokeStyle = uiA('sel', .85); outlineBox(ctx, o._bounds, o); }
    ctx.fillStyle = uiA('sel', .08); ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]); ctx.lineWidth = 1 * px; ctx.strokeStyle = uiA('sel', .9); ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  drawPenTool(ctx); // caneta e edição de pontos
  ctx.restore();
}
// aviso no palco: a camada selecionada não aparece neste momento (ou está oculta), com o atalho para resolver
function updStageHint() {
  const el = $('#stageHint'), L = selL(), els = S.layers.filter(l => l.type !== 'bg');
  let msg = null, act = null, tools = null;
  if (!playing && !RT.exporting) {
    if (RT.pen) {
      const n = RT.pen.pts.length;
      msg = PEN_MODE === 'free' ? 'Arraste para desenhar. Soltar perto do começo fecha a forma'
        : n >= 2 ? 'Clique no 1º ponto para fechar · Enter termina · Backspace tira o último'
        : PEN_MODE === 'smooth' ? 'Cada clique cria um ponto e a linha passa curva por eles (Alt + clique: canto)' : 'Clique cria um canto, clicar e arrastar cria uma curva';
      act = [n < 2 ? 'Cancelar' : 'Concluir', () => penToolFinish(false)];
      tools = PEN_MODES.map(([v, t]) => [t, PEN_MODE === v, () => setPenMode(v)]);
    } else if (RT.vec) {
      msg = 'Arraste a linha para curvar · clique nela cria ponto · arraste no vazio seleciona vários pontos · Delete apaga'; act = ['Concluir', vecExit];
      const Lv = vecL(), s = Lv && vecSel(Lv);
      if (Lv && RT.vec.multi) msg = `${vecAll(Lv).length} pontos escolhidos · arraste um para mover todos · Delete apaga`;
      if (s) { const q = Lv.vec[s.si].pts[s.pi], cur = hasH(q, 'i') || hasH(q, 'o'); tools = [['Canto', !cur, () => vecSetType(Lv, false)], ['Curva', cur, () => vecSetType(Lv, true)]]; }
    }
    else if (!els.length) { msg = 'Arquivo vazio. Arraste uma imagem para cá ou'; act = ['Adicionar título', () => addLayer(ADD_KINDS[0].mk(S.brand, S.brand.fonts))]; }
    else if (L && L.type !== 'bg' && !L.visible) { msg = `Camada oculta: ${L.name}`; act = ['Mostrar', () => { pushUndo(); L.visible = true; changed({ layers:true }); }]; }
    else if (L && L.type !== 'bg' && !phase(L, T)) { msg = T < L.start ? `${L.name} ainda não apareceu neste momento (entra em ${fmtSec(L.start)})` : `${L.name} já saiu neste momento (sai em ${fmtSec(L.end ?? S.duration)})`; act = ['Ver no palco', () => seekLayer(L)]; }
    // fora do principal, quem tem posição presa só neste formato não acompanha o principal: o botão solta todos de uma vez
    // (pedido do usuário: o "Voltar ao automático" do painel só aparecia com um elemento solto escolhido)
    else if (fmtOwn() && els.some(ownPos)) {
      const n = els.filter(ownPos).length;
      msg = `${n} elemento${n > 1 ? 's' : ''} com posição presa só no ${fmtLabel(S.format)}`;
      act = ['Voltar ao automático', () => resetPos(S.layers)];
    }
  }
  const key = msg ? (L && L.id) + msg + (tools ? tools.map(t => t[0] + t[1]).join() : '') : '';
  if (el._k === key) return; el._k = key;
  el.hidden = !msg; el.innerHTML = '';
  if (msg) {
    const parts = [h('span', { text:msg })];
    if (tools) parts.push(h('div', { class:'hseg', role:'group' }, tools.map(([t, on, fn]) => h('button', { type:'button', 'aria-pressed':String(on), text:t, onclick:() => { fn(); el._k = ''; needs = true; } }))));
    parts.push(h('button', { type:'button', text:act[0], onclick:act[1] }));
    el.append(...parts);
  }
}
let lastNow = performance.now();
function tick(now) {
  const dt = Math.min(.1, (now - lastNow) / 1000); lastNow = now;
  if (S && S.still && (playing || T)) { playing = false; RT.stopAt = null; T = 0; updPlay(); needs = true; } // imagem: sem tempo
  if (playing && !RT.exporting) {
    T += dt;
    if (RT.stopAt != null && T >= RT.stopAt) { T = RT.stopAt; pause(); } // "Ver entrada/saída": toca só o trecho
    else if (T >= S.duration) { if (S.loop) T = T % S.duration; else { T = S.duration; playing = false; updPlay(); } }
    needs = true;
  }
  syncMedia(); // vídeos e trilha acompanham a agulha
  if (needs && !RT.exporting) { measureGhosts(); renderFrame(pctx, T, RS, false); drawOverlays(); updTime(); updStageHint(); needs = false; }
  requestAnimationFrame(tick);
}
const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60), ss = Math.floor(s % 60), f = Math.floor((s % 1) * fps()); return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}<span>:${String(f).padStart(2, '0')}</span>`; };
function updTime() {
  $('#tc').innerHTML = `${fmtT(T)} <span>/ ${S.duration.toFixed(1)}s</span>`;
  $('#scrub').value = String(Math.round(T / S.duration * 1000));
  placeHead();
}
const ICON_PLAY = '<svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9.5-5.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2.5" y="1.5" width="3.2" height="11" rx=".6"/><rect x="8.3" y="1.5" width="3.2" height="11" rx=".6"/></svg>';
function updPlay() { const b = $('#play'); b.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; b.setAttribute('aria-label', playing ? 'Pausar' : 'Tocar'); }
function play(from, until) { if (S.still) return; if (from != null) T = from; if (T >= S.duration - .01) T = 0; RT.stopAt = until ?? null; playing = true; updPlay(); needs = true; }
function pause() { playing = false; RT.stopAt = null; updPlay(); needs = true; }
// nada toca sozinho: só a barra de espaço e o botão ▶. As ações só levam a agulha (pausada) a um quadro útil.
function restTime(L) {
  const ph = phase(L, L.start) || { inD:0, outD:0 }, end = L.end ?? S.duration;
  let r = clamp(Math.min(L.start + ph.inD + .05, end - ph.outD - .02), L.start, Math.max(L.start, end - .02));
  // item de grupo animado: só assenta depois da entrada do grupo (e o grupo, depois de todos os itens)
  for (let g0 = L.grp, n = 0; g0 && n < 20; g0 = gpar(g0), n++) {
    const gp = gAnimOn(g0) && gpseudo(g0);
    if (gp) { const g = phase(gp, gp.start) || { inD:0, outD:0 }; r = Math.min(Math.max(r, Math.min(gp.start + g.inD + .05, gp.end - g.outD - .02)), Math.max(L.start, end - .02)); }
  }
  if (L.__g) { const mem = gleaves(L.__g).filter(l => l.visible); if (mem.length) r = clamp(Math.max(r, ...mem.map(restTime)), L.start, S.duration - .02); }
  return r;
}
// item de grupo/frame: a agulha vai para onde o grupo inteiro já assentou (se o item ainda estiver parado ali), senão os vizinhos que entram depois
// ficam no meio da entrada, translúcidos (inserir uma forma no frame, por exemplo, levava a agulha para o começo do frame)
function settleT(L) {
  const r = restTime(L); if (!L.grp) return r;
  const ph = phase(L, L.start) || { outD:0 }, hi = (L.end ?? S.duration) - ph.outD - .02;
  const all = Math.max(r, ...gleaves(gtop(L.grp)).filter(l => l.visible && l.start <= hi).map(restTime));
  return all <= hi ? all : r;
}
function seekLayer(L) { pause(); T = clamp(settleT(L), 0, S.duration); needs = true; }
// vários elementos de uma vez (SVG em camadas, texto em curvas): a agulha vai para onde o último já assentou, senão os que entram depois ficam no meio da entrada, translúcidos
function seekLayers(Ls) { pause(); T = clamp(Math.max(...Ls.map(settleT)), 0, S.duration); needs = true; }
function seekOut(L) { pause(); const ph = phase(L, L.start) || { outD:0 }, end = L.end ?? S.duration; T = clamp(end - ph.outD * .5, 0, S.duration); needs = true; }
// mexer em velocidade/intensidade não leva a agulha para outro lugar se ela já está dentro da camada (restTime muda com a velocidade e a linha pulava)
function seekKeep(L, out) { const end = L.end ?? S.duration; if (T >= L.start && T <= end) { needs = true; return; } out ? seekOut(L) : seekLayer(L); }
// "Ver entrada" / "Ver saída": toca só o trecho da camada uma vez e para (pedido explícito, com botão)
function previewIn(L) { play(Math.max(0, L.start - .25), Math.min(L.end ?? S.duration, restTime(L) + .45)); }
function previewOut(L) {
  const ph = phase(L, L.start) || { outD:0 }, end = L.end ?? S.duration;
  play(clamp(end - ph.outD - .6, L.start, S.duration), Math.min(S.duration - .001, end + .35));
}
// quadro a quadro (vírgula/ponto, setas com o fundo selecionado); Shift anda 1 s
function stepFrames(n) { if (S.still) return; pause(); const f = fps(); T = clamp((Math.round(T * f) + n) / f, 0, S.duration); RT.userSeek = true; needs = true; }
const lastFrame = () => Math.max(0, (Math.round(S.duration * fps()) - 1) / fps());
const fmtSec = v => v.toFixed(1).replace('.', ',') + 's';
// quadro em que tudo que está na tela já entrou
function heroTime() {
  const els = S.layers.filter(l => l.type !== 'bg' && l.visible && !NOBOX(l)); // câmera e transição não contam
  if (!els.length) return 0;
  const t = Math.max(...els.map(restTime));
  return clamp(t, 0, S.duration - .02);
}

/* ------------ arrastar no palco ------------ */
function stagePt(ev) { const r = cv.getBoundingClientRect(); return { x:(ev.clientX - r.left) / r.width * FW(), y:(ev.clientY - r.top) / r.height * H() }; }
// carrossel: o último slide clicado no palco vira o atual (é onde entra o que for adicionado)
$('#stageBox').addEventListener('pointerdown', ev => {
  if (slides() < 2) return;
  const p = stagePt(ev); if (p.x < 0 || p.x > FW() || p.y < 0 || p.y > H()) return;
  const s = slideAt(p.x); if (s !== RT.slide) { RT.slide = s; needs = true; }
}, true);
// A câmera mexe no desenho (zoom, deslocamento, giro, paralaxe) e os grupos girados giram o conjunto por cima dela (`g`: do grupo mais de dentro
// para o de fora, cada um com o pivô e o ângulo), então contornos e alças ficam no que se vê na tela: `camFwd` leva um ponto do espaço da camada
// para a tela e `camInv` volta. As contas de arrastar e escalar continuam no espaço da camada (`_bounds`). `skip` = ids de quem se move junto:
// o grupo que anda inteiro não conta (o giro dele acompanha o deslocamento, então um arrasto na tela é o mesmo no espaço da camada).
function gRots(L, skip) {
  const out = [];
  for (let g = L && !RT.noGrp ? L.grp : null, n = 0; g && n < 20; g = gpar(g), n++) {
    const a = gRad(g), p = a && gStyleOn(g) ? gPivot(g, true) : null; // o pivô vem do último quadro desenhado
    if (p && !(skip && gleaves(g).every(l => skip.has(l.id)))) out.push({ gid:g, a, x:p.x, y:p.y });
  }
  return out;
}
// centro do conjunto (onde o grupo gira): a caixa de `drawGroup`; sem quadro desenhado ainda (`cached` desliga), mede os itens
const gPivot = (gid, cached) => {
  const c = RT.gBox.get(gid), b = c && c.S === S ? c.b : cached ? null : groupBox(gid, gleaves(gid).filter(l => l.visible && !NOBOX(l)));
  return b ? boxC(b) : null;
};
function camOf(L, skip) {
  const cam = camAt(T), g = gRots(L, skip); if (!L || (cam.s === 1 && !cam.dx && !cam.dy && !cam.r && !g.length)) return null;
  const els = S.layers.filter(l => l.visible && !NOBOX(l)), k = cam.par ? lerp(1, layerDepth(L, els.indexOf(L), els.length), cam.par) : 1;
  return { s:1 + (cam.s - 1) * k, dx:cam.dx * k, dy:cam.dy * k, r:cam.r, g, ga:g.reduce((n, e) => n + e.a, 0) };
}
function camFwd(c, p) {
  if (!c) return p;
  const cx = FW() / 2, cy = H() / 2, x = (p.x - cx) * c.s, y = (p.y - cy) * c.s, co = Math.cos(c.r), si = Math.sin(c.r);
  p = { x:cx + c.dx + x * co - y * si, y:cy + c.dy + x * si + y * co };
  for (const e of c.g || []) p = rotPt(p, e, e.a);
  return p;
}
function camInv(c, p) {
  if (!c) return p;
  for (let i = (c.g || []).length - 1; i >= 0; i--) p = rotPt(p, c.g[i], -c.g[i].a);
  const cx = FW() / 2, cy = H() / 2, x = p.x - cx - c.dx, y = p.y - cy - c.dy, co = Math.cos(c.r), si = Math.sin(c.r);
  return { x:cx + (x * co + y * si) / c.s, y:cy + (-x * si + y * co) / c.s };
}
// só os giros dos grupos de fora de `gid` (sem câmera, sem o dele): onde o pivô dele está e onde o mouse gira em torno dele
const camOuter = (c, gid) => { const up = new Set(); for (let g = gpar(gid), n = 0; g && n < 20; g = gpar(g), n++) up.add(g); return { s:1, dx:0, dy:0, r:0, g:(c ? c.g : []).filter(e => up.has(e.gid)), ga:0 }; };
// contorno (rect b no espaço da camada, folga p) na tela: quatro cantos já com o giro da forma `a`, o dos grupos e a câmera
const quadRect = (b, p, cm, a = 0) => { const c = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  return [[b.x - p, b.y - p], [b.x + b.w + p, b.y - p], [b.x + b.w + p, b.y + b.h + p], [b.x - p, b.y + b.h + p]].map(([x, y]) => camFwd(cm, a ? rotPt({ x, y }, c, a) : { x, y })); };
function pathQuad(ctx, q) { ctx.beginPath(); q.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); }
// risca/preenche o contorno de um retângulo da camada: girado vira polígono, senão a caixa que envolve o que se vê
function outlineBox(ctx, b, L, p = 0, a = rotOf(L), fill) {
  const cm = camOf(L);
  if (a || (cm && cm.ga)) { pathQuad(ctx, quadRect(b, p, cm, a)); if (fill) ctx.fill(); else ctx.stroke(); return; }
  const v = visRect(b, L); if (fill) ctx.fillRect(v.x - p, v.y - p, v.w + p * 2, v.h + p * 2); else ctx.strokeRect(v.x - p, v.y - p, v.w + p * 2, v.h + p * 2);
}
// retângulo do espaço da camada -> caixa que envolve o que aparece na tela
function visRect(b, L) {
  const c = camOf(L); if (!c || !b) return b;
  const q = [camFwd(c, { x:b.x, y:b.y }), camFwd(c, { x:b.x + b.w, y:b.y }), camFwd(c, { x:b.x + b.w, y:b.y + b.h }), camFwd(c, { x:b.x, y:b.y + b.h })];
  const x0 = Math.min(...q.map(a => a.x)), y0 = Math.min(...q.map(a => a.y));
  return { ...b, x:x0, y:y0, w:Math.max(...q.map(a => a.x)) - x0, h:Math.max(...q.map(a => a.y)) - y0 };
}
const visB = L => visRect(L._bounds, L);
// Camada escolhida que não está na tela neste momento (ainda não entrou, já saiu): aparece tracejada onde assenta, pega no clique e anda
// junto com o arrasto. A caixa fica em RT.ghost (fora de S, senão entraria no desfazer e no arquivo) e é medida em repouso por `measureGhosts`.
const offPicked = () => playing || RT.exporting || RT.pen || RT.vec ? [] : freePicked().filter(o => o.visible && !NOBOX(o) && !phase(o, T));
const ghostB = o => { const g = RT.ghost && RT.ghost.get(o.id); return g && g.b; };
const bOf = o => (!phase(o, T) && ghostB(o)) || o._bounds; // caixa de quem se move junto (a de repouso, se não está na tela)
function measureGhosts() {
  const key = `${RT.rev}|${S.format}`, ghost = RT.ghost || (RT.ghost = new Map());
  const need = offPicked().filter(o => (ghost.get(o.id) || {}).k !== key); if (!need.length) return;
  const keep = S.layers.map(o => o._bounds); // medir em outro momento mexe nos _bounds de todo mundo; o quadro de agora refaz, mas aqui voltam
  ensureBounds(need, true);
  need.forEach(o => ghost.set(o.id, { k:key, b:o._bounds ? { ...o._bounds } : null }));
  S.layers.forEach((o, i) => { o._bounds = keep[i]; });
}
function ghostAt(pt) {
  for (const o of offPicked().reverse()) {
    const g = ghostB(o); if (!g) continue;
    const b = visRect(g, o), p = 16;
    if (pt.x >= b.x - p && pt.x <= b.x + b.w + p && pt.y >= b.y - p && pt.y <= b.y + b.h + p) return o;
  }
  return null;
}
function hitTest(pt) {
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const L = S.layers[i]; if (!L.visible || L.locked || L.type === 'bg' || !L._bounds) continue;
    if (!phase(L, T)) continue;
    const a = rotOf(L), cm = camOf(L);
    if (a || (cm && cm.ga)) { // forma ou grupo girado: testa no espaço da camada, sem o giro
      const q = rotPt(camInv(cm, pt), boxC(L._bounds), -a), b = L._bounds, p = 16;
      if (q.x >= b.x - p && q.x <= b.x + b.w + p && q.y >= b.y - p && q.y <= b.y + b.h + p) return L;
      continue;
    }
    const b = visB(L), p = 16;
    if (pt.x >= b.x - p && pt.x <= b.x + b.w + p && pt.y >= b.y - p && pt.y <= b.y + b.h + p) return L;
  }
  return null;
}
// alças: canto = escala tudo; lateral/baixo = largura/altura da máscara da imagem; lateral do texto = largura máx. (quebra de linha)
const hRad = () => 11 * FW() / (cv.getBoundingClientRect().width || 1);
// caixa de seleção rente ao elemento, alças delicadas (SEL_FINE = escala delas).
// Forma com traço: o traço passa metade para fora da geometria, então a caixa abre essa metade para ficar rente ao que se vê
const SEL_FINE = .55;
function selPad(L) {
  if (!L || L.type !== 'shape' || L.kind === 'line' || !strokeOn(L)) return 0;
  const g = L._bounds && L.size ? L._bounds.w / (L.size * W()) : 1, pos = L.strokePos || 'center';
  return skW(L) * (pos === 'outside' ? 1 : pos === 'inside' ? 0 : .5) * (isFinite(g) && g > 0 ? g : 1);
}
const masked = L => L.type === 'image' && (L.mask === 'rect' || L.mask === 'circle');
const resizable = L => masked(L) || L.type === 'shape' && L.kind !== 'custom' && L.kind !== 'line';
// largura (size) e altura (mh) de forma/imagem não têm teto (pedido do usuário: esticar o quanto quiser além da borda;
// os buffers de efeito já se limitam sozinhos em rasterFx)
const SZ_MAX = Infinity, MH_MAX = Infinity, SZ_MIN = .0005; // sem mínimo de verdade: só evita tamanho zero (não dá para escalar de volta)
// caixa que envolve toda a seleção (grupo ou vários), só das camadas que estão na tela agora (rg = o grupo, quando a seleção é ele inteiro)
function selUnion() {
  const fb = flowFrameSel(); if (fb) return fb; // grupo com layout: a caixa é o frame dele
  const ls = freePicked().filter(o => o._bounds && o.visible && phase(o, T)); if (!ls.length || pickedLayers().length < 2) return null;
  return { ...unionBox(ls.map(o => o._bounds)), ls, rg:wholeGroup() };
}
// Oito alças em todo elemento (e na seleção de vários): canto = escala tudo de uma vez a partir do canto oposto; lado = depende do tipo
// (imagem com máscara e forma: só largura ou só altura; texto: largura de quebra nas laterais; linha: comprimento e espessura; o resto escala).
// Alt ao arrastar escala a partir do centro. [hx, hy] = para que lado a alça puxa.
// rotação: forma (L.rot) e grupo inteiro (S.groups[gid].rot, `gRad`), em graus, em torno do centro. A caixa da seleção e as alças giram junto
const rotOf = L => L && L.type === 'shape' && L.rot ? L.rot * Math.PI / 180 : 0;
const boxC = b => ({ x:b.x + b.w / 2, y:b.y + b.h / 2 });
const rotPt = (p, c, a) => { const co = Math.cos(a), si = Math.sin(a), x = p.x - c.x, y = p.y - c.y; return { x:c.x + x * co - y * si, y:c.y + x * si + y * co }; };
const ROT_ARC = 'M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9';
const ROT_CUR = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="' + ROT_ARC + '" fill="none" stroke="#101115" stroke-width="4.2" stroke-linecap="round"/><path d="' + ROT_ARC + '" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M13.5 3.5l4.2 3.3-4.9 1.8zM10.5 20.5l-4.2-3.3 4.9-1.8z" fill="#fff" stroke="#101115" stroke-width="1.2" stroke-linejoin="round"/></svg>') + '") 12 12, alias';
const HDIR = { nw:[-1, -1], n:[0, -1], ne:[1, -1], e:[1, 0], se:[1, 1], s:[0, 1], sw:[-1, 1], w:[-1, 0] };
const HCUR = { nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize', n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize' };
function handlesOf(L) {
  const ub = playing ? null : selUnion(), p = ub ? 0 : selPad(L);
  if (RT.pen || RT.vec) return []; // caneta e edição de pontos: sem alças de escala
  if (!ub && (!L || L.type === 'bg' || L.locked || !L._bounds || !L.visible || playing || !phase(L, T))) return [];
  const b = ub || L._bounds, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.w + p, y1 = b.y + b.h + p, mx = b.x + b.w / 2, my = b.y + b.h / 2;
  const at = { nw:[x0, y0], n:[mx, y0], ne:[x1, y0], e:[x1, my], se:[x1, y1], s:[mx, y1], sw:[x0, y1], w:[x0, my] };
  const min = hRad() * 1.9 * SEL_FINE; // alça de lado que encostaria nas de canto some (elemento pequeno no zoom baixo)
  // padrão: só o canto escala; o lado só existe onde muda outra coisa (frame: tamanho; texto: largura da caixa; máscara, forma e linha: largura ou altura)
  const sideOk = k => { const [kx, ky] = HDIR[k]; if (kx && ky) return true; if (ub) return !!ub.gid; if (L.type === 'text') return ky === 0; return resizable(L) || (L.type === 'shape' && L.kind === 'line'); };
  const cm = camOf(L), ra = ub ? 0 : rotOf(L), rc = { x:mx, y:my }; // x/y = onde a alça aparece na tela (com giro e câmera); lx/ly = o mesmo ponto no espaço da camada, sem giro (as contas de escala partem dele)
  return Object.keys(HDIR).filter(sideOk).filter(k => !(HDIR[k][0] === 0 && b.w / 2 + p < min) && !(HDIR[k][1] === 0 && b.h / 2 + p < min))
    .map(k => { const v = camFwd(cm, ra ? rotPt({ x:at[k][0], y:at[k][1] }, rc, ra) : { x:at[k][0], y:at[k][1] }); return { k, hx:HDIR[k][0], hy:HDIR[k][1], x:v.x, y:v.y, lx:at[k][0], ly:at[k][1], grp:!!ub, a:ra + (cm ? cm.ga : 0) }; }); // a = giro com que a alça aparece
}
// quem gira (logo fora de uma quina, como no Figma): a forma sozinha ou o grupo inteiro
function rotTarget() {
  if (playing || RT.pen || RT.vec) return null;
  const L = selL(), ub = L && selUnion();
  if (ub) { const gid = ub.gid || ub.rg; return gid && freePicked().length === pickedLayers().length ? { gid, b:ub, p:0, a:0 } : null; } // grupo com item bloqueado não gira
  return L && L.type === 'shape' && !L.locked && pickedLayers().length === 1 ? { L, b:L._bounds, p:selPad(L), a:rotOf(L) } : null;
}
function handleAt(pt) {
  const r = hRad() * 1.3, d = q => Math.hypot(pt.x - q.x, pt.y - q.y);
  const hs = handlesOf(selL()), hit = hs.filter(q => Math.abs(pt.x - q.x) <= r && Math.abs(pt.y - q.y) <= r).sort((a, b) => d(a) - d(b))[0];
  if (hit) return hit;
  const t = rotTarget(), L = selL(), cs = t ? hs.filter(q => q.hx && q.hy) : [];
  if (cs.length) {
    const rr = hRad() * 3.6, q = cs.filter(c => d(c) <= rr).sort((a, b) => d(a) - d(b))[0];
    if (q) { // dentro da caixa continua sendo mover
      const l = rotPt(camInv(camOf(L), pt), boxC(t.b), -t.a), b = t.b, p = t.p;
      if (l.x < b.x - p || l.x > b.x + b.w + p || l.y < b.y - p || l.y > b.y + b.h + p) return { k:'rot', rot:true, hx:0, hy:0, x:q.x, y:q.y };
    }
  }
  return null;
}
// gira em torno do centro (forma: o da caixa; grupo: o do conjunto, onde ele se desenha girado): Shift trava de 15 em 15°.
// O ponteiro é lido no espaço em que o pivô vive (`D.cm`): o da camada para a forma, só os grupos de fora para o grupo
function startRotate(ev, pt) {
  const t = rotTarget(), L = selL(); pushUndo();
  let O, C, cm;
  if (t.gid) { O = gview(t.gid); C = gPivot(t.gid) || boxC(t.b); cm = camOuter(camOf(L), t.gid); }
  else { O = L; C = boxC(L._bounds); cm = camOf(L); }
  const p0 = camInv(cm, pt);
  RT.drag = { L, O, mode:'rot', cm, C, a0:Math.atan2(p0.y - C.y, p0.x - C.x), r0:O.rot || 0 };
  cv.setPointerCapture(ev.pointerId);
}
function rotateTo(D, pt, ev) {
  let r = D.r0 + (Math.atan2(pt.y - D.C.y, pt.x - D.C.x) - D.a0) * 180 / Math.PI;
  if (ev.shiftKey) r = Math.round(r / 15) * 15;
  r = ((r + 180) % 360 + 360) % 360 - 180; r = Math.round(r * 10) / 10;
  D.O.rot = r; D.show = r;
  const i = document.getElementById(fid(D.O, 'rot')); if (i) { i.value = r; const o = i.parentElement.querySelector('.num'); if (o && document.activeElement !== o) o.value = Math.round(r) + '°'; }
}
// devolve a escala que valeu de fato (os limites e o arredondamento do tamanho podem segurar um pouco)
function scaleLayer(L, s0, f) {
  if (L.type === 'text') {
    L.size = Math.round(clamp(s0.size * f, 6, 600)); RT.layout.clear();
    if (s0.mw != null) L.maxW = +clamp(s0.mw * L.size / s0.size, .1, 1).toFixed(4);
    return L.size / s0.size;
  }
  if (L.type === 'cta') { L.size = Math.round(clamp(s0.size * f, 8, 200)); L.padX = Math.round(s0.padX * f); L.padY = Math.round(s0.padY * f); return L.size / s0.size; }
  L.size = clamp(s0.size * f, SZ_MIN, SZ_MAX); if (s0.mh != null) L.mh = clamp(s0.mh * f, SZ_MIN, MH_MAX);
  return L.size / s0.size;
}
// começa a puxar uma alça (vale no quadro e na mesa em volta dele)
function startResize(ev, pt, hd) {
  const grp = hd.grp, L = selL(), b = grp ? selUnion() : L._bounds; if (!b) return;
  const cm = camOf(L), ra = grp ? 0 : rotOf(L), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (cm) pt = camInv(cm, pt);
  if (ra) pt = rotPt(pt, { x:cx, y:cy }, -ra); // tudo no espaço da camada, sem o giro da forma
  if (cm || ra) hd = { ...hd, x:hd.lx, y:hd.ly };
  pushUndo();
  const { hx, hy } = hd;
  let how = 'uni'; // uni = escala tudo; wid/hei = só largura/altura; tw = largura de quebra do texto; thick = espessura da linha
  if (!grp) {
    if (resizable(L)) how = hy === 0 ? 'wid' : hx === 0 ? 'hei' : 'uni';
    else if (L.type === 'shape' && L.kind === 'line') how = hy === 0 ? 'wid' : hx === 0 ? 'thick' : 'uni';
    else if (L.type === 'text' && hy === 0) how = 'tw';
    if (resizable(L) && L.mh == null) L.mh = (S.format === baseFmt() ? b.h : blockGeom(L).h) / W(); // fora do principal a altura na tela pode estar esticada
  }
  const items = (grp ? freePicked().filter(o => o._bounds) : [L]).map(o => { const q = posOf(o); return { o, n0:natBox(o), x0:q.x, y0:q.y, ox:o._bounds.x + o._bounds.w / 2, oy:o._bounds.y + o._bounds.h / 2, s0:{ ...size0(o), strokeW:o.strokeW } }; });
  RT.drag = { L, mode:'rs', cm, how, hx, hy, pad:grp ? 0 : selPad(L), pt0:pt, rotA:ra, items, off:{ x:pt.x - hd.x, y:pt.y - hd.y }, b0:{ w:b.w, h:b.h }, C:{ x:cx, y:cy }, g0:grp ? null : geomNow(L),
    gR:grp && cm ? cm.g.find(e => e.gid === (b.gid || b.rg)) : null, // grupo girado: o pivô anda quando o conjunto escala (ver `put` em resizeTo)
    A:{ x:cx - hx * b.w / 2, y:cy - hy * b.h / 2 }, H0:{ x:cx + hx * b.w / 2, y:cy + hy * b.h / 2 }, s0:items[0].s0, k:b.k || 1, bw:b.w / (b.k || 1),
    fl:grp ? flowScale(items.map(q => q.o)) : null, fg:grp && b.gid || null }; // grupo com layout: o espaço (e o frame) escala junto
  // frame do grupo com layout: os lados mudam o tamanho dele; os cantos escalam tudo junto (como antes)
  if (b.gid && (hx === 0 || hy === 0)) Object.assign(RT.drag, { how:'frame', gid:b.gid, B0:{ x0:b.x, y0:b.y, x1:b.x + b.w, y1:b.y + b.h } }); // alça do frame: muda o tamanho dele
  cv.setPointerCapture(ev.pointerId);
}
// deslocamento do centro calculado no espaço da forma (sem giro) -> na tela
const rotV = (D, dx, dy) => D.rotA ? rotPt({ x:dx, y:dy }, { x:0, y:0 }, D.rotA) : { x:dx, y:dy };
// tamanho de verdade do bloco (px, antes de a margem encolher o desenho): é ele que fica gravado na camada
function natBox(o) {
  const pl = placeOf(o);
  if (o.type === 'text') { const l = layoutText(o, o.upper ? o.text.toUpperCase() : o.text); return { w:l.blockW * pl.k, h:l.blockH * pl.k }; }
  const G = geomNow(o); return G ? { w:G.w * pl.k, h:G.h * pl.k } : { w:0, h:0 };
}
// quanto o tamanho de verdade passa da margem (px; 0 = cabe ou já passava antes do arrasto). O desenho encolhe para caber, então sem isso o valor
// gravado crescia sem aparecer e, ao desmarcar "Manter dentro da margem", o elemento pulava para o tamanho grande
function natExcess(D) {
  const M = marginBox(); if (!M) return 0;
  let ex = 0;
  for (const q of D.items) {
    if (freeType(q.o) || inFlow(q.o) || !q.n0) continue;
    const n = natBox(q.o);
    ex = Math.max(ex, n.w - Math.max(M.x1 - M.x0, q.n0.w), n.h - Math.max(M.y1 - M.y0, q.n0.h));
  }
  return Math.max(0, ex);
}
// alça de lado de máscara/forma com "Manter dentro da margem": a borda puxada para na margem em vez de o bloco ser empurrado e encolhido.
// ext = tamanho puxado (px na tela) no eixo; devolve o que cabe (nunca menos que o tamanho de antes)
function marginCap(D, axis, ext, alt) {
  const L = D.L, M = marginAt(D.C.x), cur = axis === 'x' ? D.b0.w : D.b0.h;
  if (!M || freeType(L) || inFlow(L) || ext <= cur) return ext;
  const { hx, hy } = D, lo = axis === 'x' ? M.x0 : M.y0, hi = axis === 'x' ? M.x1 : M.y1;
  const fits = a => {
    const c = alt ? 0 : (axis === 'x' ? D.A.x + hx * a / 2 - D.C.x : D.A.y + hy * a / 2 - D.C.y), v = axis === 'x' ? rotV(D, c, 0) : rotV(D, 0, c);
    const cs = axis === 'x' ? D.C.x + v.x : D.C.y + v.y;
    return cs - a / 2 >= lo - .5 && cs + a / 2 <= hi + .5;
  };
  if (fits(ext)) return ext;
  if (!fits(cur)) return cur;
  let ok = cur, bad = ext;
  for (let n = 0; n < 24 && bad - ok > .05; n++) { const m = (ok + bad) / 2; if (fits(m)) ok = m; else bad = m; }
  return ok;
}
// puxa a alça: o lado oposto fica parado (Alt: o centro fica parado)
function resizeTo(D, pt, ev) {
  const p = D.pad, { hx, hy, L } = D, alt = ev.altKey, q0 = D.items[0], span = alt ? 2 : 1;
  const ex = pt.x - D.off.x - hx * p, ey = pt.y - D.off.y - hy * p; // onde a borda puxada está agora
  const A = alt ? D.C : D.A;
  if (D.how === 'frame') { flowResize(D, ex, ey, alt); return; }
  if (D.how === 'tw') { // caixa de largura fixa: o lado oposto fica parado (Alt: os dois lados)
    // não passa da margem: o limite é a distância do lado parado (ou do centro, com Alt) até a margem; só a largura total deixava a borda
    // puxada passar dela e o texto, empurrado para dentro, crescia para o outro lado
    const Mg = marginAt(D.C.x), d = hx * (pt.x - D.pt0.x) / D.k * (alt ? 2 : 1);
    let cap = Mg ? Mg.x1 - Mg.x0 : W();
    if (Mg && !inFlow(L)) {
      const room = alt ? 2 * Math.min(D.C.x - Mg.x0, Mg.x1 - D.C.x) : hx > 0 ? Mg.x1 - D.A.x : D.A.x - Mg.x0;
      cap = Math.max(D.bw + 1, room / D.k); // se já estava além da margem, não encolhe de repente
    }
    const mw = clamp(D.bw + d + 1, .1 * W(), Math.max(.1 * W(), cap));
    L.fixW = true; L.maxW = +(mw / W()).toFixed(4);
    if (!alt) setPos(L, +(q0.x0 + hx * (mw - D.bw - 1) * D.k / 2 / W()).toFixed(5), null);
    RT.layout.clear(); return;
  }
  if (D.how === 'wid' || D.how === 'hei' || D.how === 'thick') {
    let dist = hx ? (ex - A.x) * hx : (ey - A.y) * hy;
    if (D.how === 'wid' || D.how === 'hei') dist = marginCap(D, hx ? 'x' : 'y', span * dist, alt) / span;
    const apply = dist => {
    // fora do formato principal a máscara muda só neste formato (fpos ww/hh, px do bloco antes da escala)
    if (D.how === 'wid') {
      let aw; // largura que valeu de fato
      if (fmtOwn()) { aw = clamp(span * dist, SZ_MIN * W(), W() * SZ_MAX); setFmt(L, { ww:+(D.g0.w * aw / D.b0.w).toFixed(2) }); }
      else { L.size = clamp(D.s0.size * Math.max(SZ_MIN * W(), span * dist) / D.b0.w, SZ_MIN, SZ_MAX); aw = D.b0.w * L.size / D.s0.size; }
      const v = rotV(D, alt ? 0 : A.x + hx * aw / 2 - D.C.x, 0); // o centro anda no espaço da forma; com giro, na diagonal
      setPos(L, +(q0.x0 + v.x / W()).toFixed(4), D.rotA ? +(q0.y0 + v.y / H()).toFixed(4) : null);
    } else {
      let ah;
      if (D.how === 'hei' && fmtOwn()) { ah = clamp(span * dist, SZ_MIN * W(), W() * MH_MAX); setFmt(L, { hh:+(D.g0.h * ah / D.b0.h).toFixed(2) }); }
      else if (D.how === 'hei') { L.mh = clamp(D.s0.mh * Math.max(SZ_MIN * W(), span * dist) / D.b0.h, SZ_MIN, MH_MAX); ah = D.b0.h * L.mh / D.s0.mh; }
      else { const s = Math.max(1, D.s0.strokeW || 8); L.strokeW = clamp(Math.round(s * Math.max(1, span * dist) / D.b0.h), 1, 80); ah = D.b0.h * Math.max(1, L.strokeW) / s; }
      const v = rotV(D, 0, alt ? 0 : A.y + hy * ah / 2 - D.C.y);
      setPos(L, D.rotA ? +(q0.x0 + v.x / W()).toFixed(4) : null, +(q0.y0 + v.y / H()).toFixed(4));
    }
    };
    apply(dist);
    if ((D.how === 'wid' || D.how === 'hei') && natExcess(D) > .5) { // o tamanho gravado passaria da margem (o desenho só encolhe): para no limite
      let ok = Math.min((hx ? D.b0.w : D.b0.h) / span, dist), bad = dist;
      for (let n = 0; n < 20 && bad - ok > .05; n++) { const m = (ok + bad) / 2; apply(m); if (natExcess(D) > .5) bad = m; else ok = m; }
      apply(ok);
    }
    return;
  }
  const vx = D.H0.x - A.x, vy = D.H0.y - A.y;
  const f = Math.max(.001, hx && hy ? ((ex - A.x) * vx + (ey - A.y) * vy) / (vx * vx + vy * vy) : hx ? (ex - A.x) / vx : (ey - A.y) / vy);
  const inFlowAny = !D.fg && D.items.every(q => inFlow(q.o) || (S.flow && RT.frameIds && RT.frameIds.has(q.o.id)));
  const put = f => {
    const as = D.items.map(q => scaleAny(q.o, q.s0, f));
    // grupo girado: ao escalar em torno da quina parada o centro do giro anda e a quina sairia do lugar na tela;
    // o deslocamento (1 - s)(I - R)(pivô - quina) devolve a quina ao lugar (translação não gira: o conjunto anda o mesmo na tela)
    const e = D.gR, u = e ? { x:e.x - A.x, y:e.y - A.y } : null, ru = e ? rotPt(u, { x:0, y:0 }, e.a) : null;
    D.gd = e ? { x:(1 - as[0]) * (u.x - ru.x), y:(1 - as[0]) * (u.y - ru.y) } : null;
    D.items.forEach((q, i) => {
      const v = rotV(D, A.x + (q.ox - A.x) * as[i] - q.ox, A.y + (q.oy - A.y) * as[i] - q.oy);
      setPos(q.o, +(q.x0 + (v.x + (D.gd ? D.gd.x : 0)) / W()).toFixed(5), +(q.y0 + (v.y + (D.gd ? D.gd.y : 0)) / H()).toFixed(5));
    });
    if (D.fl) D.fl(f);
    // forma girada não tem margem: a quina oposta já fica parada pela conta acima. Item de layout automático (frame ou coluna do quadro)
    // cresce mesmo no limite de baixo: quem decide o lugar é a fila, que reorganiza o resto (a quina não precisa ficar parada)
    return inFlowAny ? 0 : Math.max(D.rotA ? 0 : rsPin(D, alt), natExcess(D));
  };
  // encostou na margem (texto, logo e botão não passam dela): para de crescer em vez de ser empurrado para dentro
  let fz = f;
  if (put(f) > .5) {
    let ok = Math.min(D.fOk ?? 1, f), bad = f;
    for (let n = 0; n < 10 && bad - ok > .002; n++) { const m = (ok + bad) / 2; if (put(m) > .5) bad = m; else ok = m; }
    put(ok); fz = ok;
  }
  D.fOk = fz;
}
// Canto: a quina oposta fica parada e só cresce para o lado puxado; Alt: o centro fica parado (texto, logo, imagem, grupo e frame, tudo igual).
// A conta acima supõe que o bloco cresce exatamente na proporção do mouse, mas a fonte arredonda, a linha quebra em outro lugar,
// a margem empurra, o frame se refaz pela fila... Então mede onde o bloco ficou de verdade e devolve a quina (ou o centro) para o lugar
function rsPin(D, alt) {
  const { hx, hy } = D, box = () => {
    if (D.fg) { const r = flowNow(D.fg); if (r) return r.box; }
    const cx = rsPin.cx || (rsPin.cx = (() => { const c = document.createElement('canvas').getContext('2d'); c.canvas.width = c.canvas.height = 8; return c; })());
    renderFrame(cx, T, 8 / W(), false); // quadro mínimo: só para atualizar os _bounds
    const bs = D.items.map(q => q.o._bounds).filter(Boolean); if (!bs.length) return null;
    const u = unionBox(bs); return { x0:u.x, y0:u.y, x1:u.x + u.w, y1:u.y + u.h };
  };
  // devolve quanto a quina (ou o centro) ainda ficou fora do lugar, em px (> 0 = a margem segurou)
  let left = 0;
  for (let n = 0; n < 4; n++) { // a margem pode segurar: tenta de novo com o que sobrou
    const b = box(); if (!b) return 0;
    const gx = D.gd ? D.gd.x : 0, gy = D.gd ? D.gd.y : 0; // grupo girado: a quina parada vai para onde `put` a levou
    const dx = !hx ? 0 : alt ? D.C.x + gx - (b.x0 + b.x1) / 2 : D.A.x + gx - (hx > 0 ? b.x0 : b.x1);
    const dy = !hy ? 0 : alt ? D.C.y + gy - (b.y0 + b.y1) / 2 : D.A.y + gy - (hy > 0 ? b.y0 : b.y1);
    left = Math.max(Math.abs(dx), Math.abs(dy));
    if (left < .05 || n === 3) return left;
    for (const q of D.items) { const p = placeRaw(q.o); setPos(q.o, +(p.x + dx / W()).toFixed(5), +(p.y + dy / H()).toFixed(5)); }
  }
  return left;
}
function cvDown(ev) {
  if (ev.button === 1) { panStage(ev); return; }
  if (ev.button === 2) return; // botão direito abre o menu (contextmenu)
  let pt = stagePt(ev), hd = handleAt(pt);
  if (hd) { hd.rot ? startRotate(ev, pt) : startResize(ev, pt, hd); return; }
  const gp = flowGapAt(pt); if (gp) { startGapDrag(ev, pt, gp); return; } // espaço do layout automático
  const L = hitTest(pt) || ghostAt(pt); // sem nada na tela ali, a seleção que está fora da tela também pega
  if (!L) { marquee(ev); return; } // no vazio: arrastar seleciona por área; só um clique solta a seleção (com Shift, não)
  if (ev.shiftKey) { // segundo clique do clique duplo com Shift: o item já foi somado no primeiro, não tira de volta
    const now = performance.now(), again = RT.shiftTap && RT.shiftTap.id === L.id && now - RT.shiftTap.t < 500;
    RT.shiftTap = again ? null : { id:L.id, t:now };
    if (!again) toggleSel(L);
    return;
  }
  // grupo/frame: o primeiro clique pega o grupo inteiro, o clique duplo entra no item; vizinho de um item já escolhido sozinho pega só ele (arrastar troca de lugar na fila)
  const sel = pickedLayers(), deep = !!L.grp && !(isPicked(L.id) && sel.length > 1) && sel.length === 1 && sel[0].grp === L.grp;
  const only = ev.ctrlKey || ev.metaKey || deep, grp = isPicked(L.id) && sel.length > 1 && !only;
  if (only) select(L.id, true);
  else if (grp) { RT.selected = L.id; renderLayers(); renderProps(); needs = true; } else select(L.id);
  pushUndo();
  // arrastar parte do espaço da camada; o grupo girado que anda inteiro não conta (deslocamento na tela = deslocamento no espaço dele)
  const pan = ev.altKey && L.type === 'image', cm = camOf(L, pan ? null : new Set([L, ...freePicked()].map(o => o.id)));
  pt = camInv(cm, pt);
  if (pan) { const pn = panOf(L); RT.drag = { L, cm, mode:'pan', pt0:pt, ix0:pn.ix, iy0:pn.iy, bw:L._bounds.w, bh:L._bounds.h }; }
  else { const p = posOf(L); RT.drag = { L, cm, mode:'move', tap:grp, pxy:[ev.clientX, ev.clientY], ox:pt.x - p.x * W(), oy:pt.y - p.y * H(), others:freePicked().filter(o => o !== L).map(o => { const q = posOf(o); return { o, x0:q.x, y0:q.y }; }), x0:p.x, y0:p.y, ...snapSetup() }; RT.drag.fb = marginHold([L, ...RT.drag.others.map(q => q.o)]); flowGrab(RT.drag); }
  cv.setPointerCapture(ev.pointerId);
}
cv.addEventListener('pointerdown', cvDown);
// caixa (px, no começo do arrasto) do que se move e respeita a margem: texto, logo, botão e foto com keepIn, fora de layout automático
function marginHold(ls) {
  const bs = ls.filter(o => !freeType(o) && !inFlow(o) && bOf(o)).map(bOf); if (!bs.length) return null;
  return unionBox(bs);
}
// Guias ao arrastar: bordas e centro da seleção contra os elementos fora dela, o quadro e a margem (Ctrl desliga; Shift trava num eixo)
function snapSetup() {
  const mv = freePicked().filter(o => o.visible && bOf(o)).map(bOf);
  if (!mv.length) return {};
  const b0 = unionBox(mv);
  const tg = [{ x:0, y:0, w:FW(), h:H(), c:uiA('frame', .9) }];
  for (let s = 0; s < slides(); s++) { // carrossel: cada slide e a margem dele
    if (slides() > 1) tg.push({ x:s * W(), y:0, w:W(), h:H(), c:uiA('frame', .9) });
    const M = marginBox(S.format, s); if (M) tg.push({ x:M.x0, y:M.y0, w:M.x1 - M.x0, h:M.y1 - M.y0, c:uiA('margin', .9) });
  }
  for (const o of S.layers) if (o.type !== 'bg' && o.visible && o._bounds && !isPicked(o.id) && phase(o, T)) tg.push({ x:o._bounds.x, y:o._bounds.y, w:o._bounds.w, h:o._bounds.h, c:'rgba(255,92,163,.95)' });
  return { b0, tg };
}
function snapMove(D, dx, dy) {
  const U = D.b0, thr = 7 * FW() / (cv.getBoundingClientRect().width || 1);
  const three = (a, n) => [a, a + n / 2, a + n];
  const best = (vals, tgs) => { let b = null; for (const v of vals) for (const t of tgs) { const d = t - v; if (Math.abs(d) <= thr && (b === null || Math.abs(d) < Math.abs(b))) b = d; } return b; };
  const bx = best(three(U.x + dx, U.w), D.tg.flatMap(t => three(t.x, t.w))); if (bx !== null) dx += bx;
  const by = best(three(U.y + dy, U.h), D.tg.flatMap(t => three(t.y, t.h))); if (by !== null) dy += by;
  const lines = [], mx = three(U.x + dx, U.w), my = three(U.y + dy, U.h);
  for (const t of D.tg) {
    for (const v of mx) for (const tv of three(t.x, t.w)) if (Math.abs(v - tv) < .5)
      lines.push({ c:t.c, x0:tv, x1:tv, y0:Math.min(U.y + dy, t.y), y1:Math.max(U.y + dy + U.h, t.y + t.h) });
    for (const v of my) for (const tv of three(t.y, t.h)) if (Math.abs(v - tv) < .5)
      lines.push({ c:t.c, y0:tv, y1:tv, x0:Math.min(U.x + dx, t.x), x1:Math.max(U.x + dx + U.w, t.x + t.w) });
  }
  return { dx, dy, lines };
}
cv.addEventListener('pointermove', ev => {
  let pt = stagePt(ev);
  if (!RT.drag) {
    if (RT.marq) return;
    const hd = handleAt(pt), gp = !hd && flowGapAt(pt), ht = !gp && (hitTest(pt) || ghostAt(pt));
    cv.style.cursor = hd ? (hd.rot ? ROT_CUR : HCUR[hd.k]) : gp ? (gp.v ? 'row-resize' : 'col-resize') : ht ? (ev.altKey && ht.type === 'image' ? 'all-scroll' : 'move') : '';
    setHover(hd || gp ? null : ht && ht.id);
    const gk = gp && !gp.gid ? Math.round(gp.s0) : null; if (RT.gapHot !== gk) { RT.gapHot = gk; needs = true; } // espaço do quadro só aparece com o mouse em cima
    return;
  }
  const D = RT.drag, L = D.L;
  if (D.cm !== undefined) pt = camInv(D.cm, pt); // a conversão da tela para o espaço da camada fica congelada no começo do arrasto (o pivô de um grupo girado anda junto)
  if (D.mode === 'rs' && D.rotA) pt = rotPt(pt, D.C, -D.rotA); // alça de forma girada: a conta é no espaço dela
  if (D.tap && Math.hypot(ev.clientX - D.pxy[0], ev.clientY - D.pxy[1]) > 3) D.tap = false;
  // como no Figma: só arrasta depois de 3 px; senão o tremido do clique, com o ímã das guias, puxava a seleção para a guia mais perto
  if (D.mode === 'move' && !D.go) { if (Math.hypot(ev.clientX - D.pxy[0], ev.clientY - D.pxy[1]) <= 3) return; D.go = true; }
  if (D.mode === 'gap') gapDrag(D, pt);
  else if (D.mode === 'rot') rotateTo(D, pt, ev);
  else if (D.mode === 'rs') resizeTo(D, pt, ev); // largura de quebra do texto ('tw'): parte da largura real do bloco (não da máx.), senão o começo do arrasto não faz nada; +1 px para não quebrar no empate
  else if (D.mode === 'pan') setPan(L, clamp(D.ix0 + (pt.x - D.pt0.x) / D.bw, -2, 2), clamp(D.iy0 + (pt.y - D.pt0.y) / D.bh, -2, 2));
  else {
    let x = (pt.x - D.ox) / W(), y = (pt.y - D.oy) / H();
    RT.guide = null;
    // Shift = movimento reto: trava no eixo em que mais andou
    const lock = ev.shiftKey ? (Math.abs(x - D.x0) * W() >= Math.abs(y - D.y0) * H() ? 'y' : 'x') : null;
    const relock = () => { if (lock === 'y') y = D.y0; else if (lock === 'x') x = D.x0; };
    relock();
    if (D.b0 && !ev.ctrlKey && !ev.metaKey) { const sn = snapMove(D, (x - D.x0) * W(), (y - D.y0) * H()); x = D.x0 + sn.dx / W(); y = D.y0 + sn.dy / H(); RT.guide = sn.lines; relock(); }
    // margem: trava a caixa de tudo que se move junto (não só a do item clicado) e só no eixo em que ela cabe; o que passa da margem
    // não é puxado para dentro no primeiro movimento (o frame inteiro dava um pulo). Item de layout: quem respeita a margem é a fila
    if (D.fb) {
      const U = D.fb, dx = (x - D.x0) * W(), dy = (y - D.y0) * H(), M = marginAt(U.x + dx + U.w / 2); // carrossel: a margem do slide para onde vai
      if (M && U.w <= M.x1 - M.x0 + .5) x = D.x0 + (clamp(U.x + dx, M.x0, M.x1 - U.w) - U.x) / W();
      if (M && U.h <= M.y1 - M.y0 + .5) y = D.y0 + (clamp(U.y + dy, M.y0, M.y1 - U.h) - U.y) / H();
      relock();
    }
    // um deslocamento só para todos: se um bate no limite, ninguém passa (senão desalinham)
    const its = [{ o:L, x0:D.x0, y0:D.y0 }, ...(D.others || [])];
    const ddx = clamp(x - D.x0, Math.max(...its.map(q => POS_LO - q.x0)), Math.min(...its.map(q => posHi() - q.x0)));
    const ddy = clamp(y - D.y0, Math.max(...its.map(q => POS_LO - q.y0)), Math.min(...its.map(q => POS_HI - q.y0)));
    for (const q of its) setPos(q.o, +(q.x0 + ddx).toFixed(4), +(q.y0 + ddy).toFixed(4));
    // quem está fora da tela anda junto: a caixa tracejada acompanha
    for (const q of its) { const g = RT.ghost && RT.ghost.get(q.o.id); if (g && g.b) { g.b.x += (ddx - (D.gx || 0)) * W(); g.b.y += (ddy - (D.gy || 0)) * H(); } }
    D.gx = ddx; D.gy = ddy;
    syncPosFields(L);
  }
  RT.gRev++; // arrastando, a caixa dos grupos (pivô do giro) se refaz a cada movimento
  needs = true;
});
// roda do mouse sobre a imagem selecionada: zoom da imagem dentro da máscara
let wheelT = null;
cv.addEventListener('wheel', ev => {
  if (ev.ctrlKey || ev.metaKey) return; // Ctrl + roda é o zoom do palco (#stageBox)
  const L = selL(); if (!L || L.type !== 'image' || L.locked || !L._bounds) return;
  const pt = stagePt(ev), b = visB(L); if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) return;
  ev.preventDefault();
  if (!wheelT) pushUndo();
  setFrame(L, { zoom:clamp(panOf(L).zoom * (ev.deltaY < 0 ? 1.06 : 1 / 1.06), .2, 5) }); needs = true; // fora do principal, só neste formato
  clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = null; changed({ props:true }); }, 350);
}, { passive:false });
const endDrag = () => {
  if (!RT.drag) return;
  const mv = RT.drag.mode === 'move', tap = RT.drag.tap && RT.drag.L; // toque sem arrastar num grupo: fica só essa camada
  if (RT.drag.flowL) { const D = RT.drag, p = placeRaw(D.L); if (Math.abs(p.x - D.x0) + Math.abs(p.y - D.y0) > 1e-6) flowCommit(D.flow, D.fz); } // item da fila solto: entra no lugar dele
  else if (RT.drag.flowB) { const D = RT.drag, p = placeRaw(D.L); if (Math.abs(p.x - D.x0) + Math.abs(p.y - D.y0) > 1e-6) frameCommit(D); } // bloco da coluna do quadro solto
  RT.drag = null; RT.guide = null;
  if (tap && !(tap.grp && wholeGroup())) select(tap.id); // frame de dentro já escolhido inteiro: o toque não volta para o frame de fora (senão o clique duplo nunca desce além do 2º nível)
  changed({ props:!mv });
};
// clique duplo: dentro de um grupo escolhe só o item; num texto ou botão, vai direto editar o texto
// clique duplo num grupo escolhido: entra um nível (frame de dentro); no último, escolhe o item
function drillSelect(L) {
  const chain = []; for (let g = L.grp, n = 0; g && n < 20; g = gpar(g), n++) chain.unshift(g);
  const pk = pickedLayers(); // nível atual = frame de fora cujas folhas são exatamente a seleção (vale também com 1 folha só)
  const w = chain.find(g => { const lv = gleaves(g); return lv.length === pk.length && lv.every(m => isPicked(m.id) || pk.includes(m)); });
  const next = w ? chain[chain.indexOf(w) + 1] : chain[0];
  if (!next) { select(L.id, true); return; }
  RT.picks = new Set(gleaves(next).map(l => l.id)); RT.selected = L.id; renderLayers(); renderProps(); needs = true;
}
cv.addEventListener('dblclick', ev => {
  if (RT.pen || RT.vec) return; // caneta e edição de pontos tratam o clique sozinhas
  const L = hitTest(stagePt(ev)); if (!L) return;
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) return; // Shift/Ctrl + clique duplo só soma o item, não sobe para o grupo
  const pk0 = pickedLayers();
  if (L.grp && !(pk0.length === 1 && pk0[0] === L) && (pk0.length > 1 || gpar(L.grp) || wholeGroup())) { drillSelect(L); return; }
  editText(L);
});
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { setHover(null); if (RT.gapHot != null) { RT.gapHot = null; needs = true; } });
// área cinza em volta do palco: arrastar seleciona por área, um clique tira a seleção (fica o fundo)
// (as alças da seleção também pegam aqui: elas passam da borda do quadro)
const onScrollbar = e => { const sc = $('#stageScroll'); if (e.target !== sc) return false; const r = sc.getBoundingClientRect(); return e.clientX - r.left >= sc.clientWidth || e.clientY - r.top >= sc.clientHeight; };
$('#stageBox').addEventListener('pointerdown', e => {
  if (e.target.closest('#cv') || e.target.closest('#stageHint')) return;
  if (e.button === 1) { panStage(e); return; }
  if (e.button !== 0 || onScrollbar(e)) return;
  const pt = stagePt(e), hd = handleAt(pt);
  if (hd) { hd.rot ? startRotate(e, pt) : startResize(e, pt, hd); return; }
  marquee(e);
});
$('#stageBox').addEventListener('pointermove', e => {
  if (RT.drag || RT.marq || e.target.closest('#cv') || e.target.closest('#stageHint')) return;
  const hd = handleAt(stagePt(e)); $('#stageBox').style.cursor = hd ? (hd.rot ? ROT_CUR : HCUR[hd.k]) : '';
});
/* ------------ caneta (P) e edição de pontos do vetor ------------ */
// A caneta desenha uma forma "Vetor" (kind 'custom'): o d continua sendo a verdade do desenho e `L.vec` guarda os pontos para editar,
// [{ pts:[{ x, y, ix, iy, ox, oy }], closed }] no espaço do d (alça de entrada i, de saída o; alça em cima do ponto = sem alça).
// `L.vecD` = o d que saiu deles: se o d for trocado à mão no painel, os pontos são lidos de novo dele (`vecOf`/`vecParse`; arco não entra).
// Criando (`RT.pen`) os pontos ficam no espaço do quadro e só viram camada no fim; editando (`RT.vec`) o resto da forma fica parado na tela
// (`vecApply` refaz tamanho e posição pela caixa nova do d).
const PEN_C = uiC('sel'), vr2 = v => Math.round(v * 100) / 100;
const hasH = (a, w) => Math.abs(a[w + 'x'] - a.x) + Math.abs(a[w + 'y'] - a.y) > .01;
const vecPt = (x, y) => ({ x, y, ix:x, iy:y, ox:x, oy:y });
const pxU = () => FW() / (cv.getBoundingClientRect().width || 1); // 1 px da tela em unidades do vídeo
function snap45(a, p) { const r = Math.hypot(p.x - a.x, p.y - a.y), g = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * Math.PI / 4; return { x:a.x + Math.cos(g) * r, y:a.y + Math.sin(g) * r }; }
const bezAt = (a, b, t) => { const u = 1 - t; return { x:u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x, y:u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y }; };
function vecD(paths) {
  const seg = (a, b) => hasH(a, 'o') || hasH(b, 'i') ? `C${vr2(a.ox)} ${vr2(a.oy)} ${vr2(b.ix)} ${vr2(b.iy)} ${vr2(b.x)} ${vr2(b.y)}` : `L${vr2(b.x)} ${vr2(b.y)}`;
  let d = '';
  for (const sp of paths) {
    const P = sp.pts; if (!P.length) continue;
    d += `M${vr2(P[0].x)} ${vr2(P[0].y)}`;
    for (let i = 1; i < P.length; i++) d += seg(P[i - 1], P[i]);
    if (sp.closed && P.length > 1) { const s = seg(P[P.length - 1], P[0]); d += (s[0] === 'L' ? '' : s) + 'Z'; }
  }
  return d;
}
// d do SVG -> pontos (M L H V C S Q T Z, absolutos e relativos; quadrática vira cúbica). Arco (A) devolve null
function vecParse(d) {
  const tk = String(d || '').match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [], isN = s => s != null && !/[a-zA-Z]/.test(s);
  const paths = []; let sp = null, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', i = 0, lc = null, lq = null;
  const n = () => +tk[i++];
  while (i < tk.length) {
    if (!isN(tk[i])) cmd = tk[i++];
    const C = cmd.toUpperCase(), rel = cmd !== C, ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') {
      if (sp && sp.pts.length > 1) { const P = sp.pts, a = P[P.length - 1], b = P[0]; sp.closed = true; if (Math.hypot(a.x - b.x, a.y - b.y) < .01) { b.ix = a.ix; b.iy = a.iy; P.pop(); } }
      cx = sx; cy = sy; sp = null; lc = lq = null; cmd = ''; continue;
    }
    if (!C || !isN(tk[i])) return null;
    if (C === 'M') { cx = sx = n() + ox; cy = sy = n() + oy; sp = { pts:[vecPt(cx, cy)], closed:false }; paths.push(sp); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if (!sp) { sp = { pts:[vecPt(cx, cy)], closed:false }; paths.push(sp); }
    let x = cx, y = cy, c1 = null, c2 = null;
    if (C === 'L') { x = n() + ox; y = n() + oy; }
    else if (C === 'H') x = n() + ox;
    else if (C === 'V') y = n() + oy;
    else if (C === 'C' || C === 'S') { c1 = C === 'C' ? [n() + ox, n() + oy] : lc ? [2 * cx - lc[0], 2 * cy - lc[1]] : [cx, cy]; c2 = [n() + ox, n() + oy]; x = n() + ox; y = n() + oy; }
    else if (C === 'Q' || C === 'T') { const q = C === 'Q' ? [n() + ox, n() + oy] : lq ? [2 * cx - lq[0], 2 * cy - lq[1]] : [cx, cy]; x = n() + ox; y = n() + oy; c1 = [cx + (q[0] - cx) * 2 / 3, cy + (q[1] - cy) * 2 / 3]; c2 = [x + (q[0] - x) * 2 / 3, y + (q[1] - y) * 2 / 3]; lq = q; }
    else return null;
    lc = C === 'C' || C === 'S' ? c2 : null; if (C !== 'Q' && C !== 'T') lq = null;
    const P = sp.pts, a = P[P.length - 1], q = vecPt(x, y);
    if (c1) { a.ox = c1[0]; a.oy = c1[1]; q.ix = c2[0]; q.iy = c2[1]; }
    P.push(q); cx = x; cy = y;
  }
  const ok = paths.filter(p => p.pts.length > 1);
  return ok.length && ok.every(p => p.pts.every(q => [q.x, q.y, q.ix, q.iy, q.ox, q.oy].every(Number.isFinite))) ? ok : null;
}
function vecOf(L) {
  if (!L || L.type !== 'shape' || L.kind !== 'custom') return null;
  if (!L.vec || L.vecD !== L.d) { const p = vecParse(L.d); if (!p) return null; L.vec = p; L.vecD = L.d; }
  return L.vec;
}
// espaço do d -> tela (posição, escala do formato, rotação e câmera) e de volta
function vecMap(L) {
  const G = geomNow(L), b = G && G.cust; if (!b) return null;
  const pl = placeOf(L), a = (L.rot || 0) * Math.PI / 180;
  return { s:G.w / b.w * pl.k, k:pl.k, co:Math.cos(a), si:Math.sin(a), ax:pl.x * W(), ay:pl.y * H(), bx:b.x + b.w / 2, by:b.y + b.h / 2, cam:camOf(L) };
}
const vecFwd = (M, x, y) => { const u = (x - M.bx) * M.s, v = (y - M.by) * M.s; return camFwd(M.cam, { x:M.ax + u * M.co - v * M.si, y:M.ay + u * M.si + v * M.co }); };
function vecInv(M, p) { p = camInv(M.cam, p); const u = (p.x - M.ax) / M.s, v = (p.y - M.ay) / M.s; return { x:M.bx + (u * M.co + v * M.si), y:M.by + (-u * M.si + v * M.co) }; }
// grava o d novo; tamanho e centro acompanham a caixa nova, então o que não foi mexido fica onde estava na tela
function vecApply(L, M) {
  const d = vecD(L.vec); if (!d) return;
  L.d = L.vecD = d; if (CUST.size > 400) CUST.clear();
  const b = customBox(d), bx = b.x + b.w / 2, by = b.y + b.h / 2, u = (bx - M.bx) * M.s, v = (by - M.by) * M.s;
  M.ax += u * M.co - v * M.si; M.ay += u * M.si + v * M.co; M.bx = bx; M.by = by;
  L.size = b.w * M.s / (M.k || 1) / W();
  // fora do principal, gravar a posição daria ao item um fpos só dele e ele sairia da fila do layout automático (e da adaptação) dos outros
  const p0 = posOf(L), nx = M.ax / W(), ny = M.ay / H();
  if (!(fmtOwn() && !ownPos(L) && (S.flow || inFlow(L))) && Math.hypot((nx - p0.x) * W(), (ny - p0.y) * H()) > .01) setPos(L, nx, ny);
  needs = true;
}
function stageMode() { const b = $('#stageBox'); b.classList.toggle('pen', !!RT.pen); setHover(null); needs = true; }
// modos: 'pen' = clique é canto e arrastar é curva; 'smooth' = cada clique é um ponto suave (a linha passa curva por eles);
// 'free' = mão livre (arrastar desenha, vira poucos pontos suaves). Fica guardado neste navegador, como os favoritos
const PEN_MODES = [['pen', 'Caneta'], ['smooth', 'Curvas'], ['free', 'Mão livre']];
let PEN_MODE = (() => { try { return localStorage.getItem('mola-pen-mode') || 'pen'; } catch (e) { return 'pen'; } })();
function setPenMode(m) { PEN_MODE = m; try { localStorage.setItem('mola-pen-mode', m); } catch (e) {} needs = true; }
function penToolStart(mode) { vecExit(); pause(); if (mode) setPenMode(mode); RT.pen = { pts:[], cur:null }; stageMode(); }
function penToolCancel() { if (!RT.pen) return; RT.pen = null; stageMode(); }
function penToolFinish(close) {
  const P = RT.pen; penToolCancel(); if (!P || P.pts.length < 2) return;
  autoH(P.pts, !!close); P.pts.forEach(q => delete q.a);
  const sp = { pts:P.pts, closed:!!close }, d = vecD([sp]), b = customBox(d);
  // fechada: preenchimento como as outras formas; aberta: só o traço
  addLayer(mkShape({ name:'Vetor', kind:'custom', d, vec:[sp], vecD:d, size:b.w / W(), in:'draw', inDur:BP.draw.dur, fill:!!close }), { x:(b.x + b.w / 2) / W(), y:(b.y + b.h / 2) / H() });
}
// clique = ponto de canto; arrastar = curva (alças simétricas; Alt solta a de entrada); Shift = 45°.
// Clicar no primeiro ponto fecha; clicar de novo no último (ou clique duplo) termina aberta
function penToolDown(e) {
  if (PEN_MODE === 'free') { penFreeDown(e); return; }
  const P = RT.pen, px = pxU(), pts = P.pts, last = pts[pts.length - 1], raw = stagePt(e);
  const close = pts.length >= 2 && Math.hypot(raw.x - pts[0].x, raw.y - pts[0].y) <= 9 * px;
  if (!close && last && Math.hypot(raw.x - last.x, raw.y - last.y) <= 6 * px) { if (pts.length >= 2) penToolFinish(false); return; }
  const pt = e.shiftKey && last ? snap45(last, raw) : raw, q = close ? pts[0] : vecPt(pt.x, pt.y);
  if (!close) { if (PEN_MODE === 'smooth' && !e.altKey) q.a = 1; pts.push(q); autoH(pts, false); } // Curvas: ponto suave (Alt = canto)
  const x0 = e.clientX, y0 = e.clientY; let moved = false; if (close) P.closing = true; // enquanto fecha, o trecho de fechamento fica à vista
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
    if (!moved && close) autoH(pts, true); // fechando: a alça de saída do 1º ponto (automática) fica como está
    moved = true; P.cur = null; delete q.a; // arrastou: as alças são as do arrasto
    const hh = ev.shiftKey ? snap45(q, stagePt(ev)) : stagePt(ev);
    if (close) { q.ix = 2 * q.x - hh.x; q.iy = 2 * q.y - hh.y; } // fechando só a alça de chegada segue o arrasto
    else { q.ox = hh.x; q.oy = hh.y; if (!ev.altKey) { q.ix = 2 * q.x - hh.x; q.iy = 2 * q.y - hh.y; } }
    autoH(pts, false); needs = true;
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (close) penToolFinish(true); needs = true; };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  needs = true;
}
// alças automáticas (pontos com q.a): na direção do vizinho de trás para o da frente, 1/3 da distância até cada um
function smoothPt(q, pr, nx) {
  if (pr === q && nx === q) { q.ix = q.ox = q.x; q.iy = q.oy = q.y; return; }
  let dx = nx.x - pr.x, dy = nx.y - pr.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const li = Math.hypot(q.x - pr.x, q.y - pr.y) / 3, lo = Math.hypot(nx.x - q.x, nx.y - q.y) / 3;
  q.ix = q.x - dx * li; q.iy = q.y - dy * li; q.ox = q.x + dx * lo; q.oy = q.y + dy * lo;
}
function autoH(pts, closed) {
  const n = pts.length;
  pts.forEach((q, i) => { if (q.a) smoothPt(q, pts[i > 0 ? i - 1 : closed ? n - 1 : i], pts[i < n - 1 ? i + 1 : closed ? 0 : i]); });
}
// simplifica a linha da mão livre (Ramer-Douglas-Peucker): fica só o ponto que se afasta mais que eps
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length), st = [[0, pts.length - 1]]; keep[0] = keep[pts.length - 1] = 1;
  while (st.length) {
    const [a, b] = st.pop(), A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = l > 1e-6 ? Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / l : Math.hypot(pts[i].x - A.x, pts[i].y - A.y); if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// mão livre: arrastar desenha; ao soltar vira poucos pontos suaves (curva fechada se terminar perto do começo; virada forte fica canto)
function penFreeDown(e) {
  const P = RT.pen, raw = [stagePt(e)]; P.raw = raw;
  const mv = ev => { const p = stagePt(ev), l = raw[raw.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) >= 1.5 * pxU()) { raw.push(p); needs = true; } };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    P.raw = null; needs = true;
    const px = pxU(), len = raw.reduce((a, p, i) => i ? a + Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) : 0, 0);
    if (raw.length < 3 || len < 12 * px) return;
    const a0 = raw[0], z = raw[raw.length - 1], closed = len > 80 * px && Math.hypot(a0.x - z.x, a0.y - z.y) <= 18 * px;
    const pts = rdp(raw, 2.5 * px); if (closed && pts.length > 3) pts.pop();
    if (pts.length < 2) return;
    const n = pts.length;
    P.pts = pts.map((p, i) => {
      const q = { ...vecPt(p.x, p.y), a:1 }, pr = pts[i > 0 ? i - 1 : closed ? n - 1 : i], nx = pts[i < n - 1 ? i + 1 : closed ? 0 : i];
      if (pr !== p && nx !== p) { const t1 = Math.atan2(p.y - pr.y, p.x - pr.x), t2 = Math.atan2(nx.y - p.y, nx.x - p.x); if (Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) > 1.75) delete q.a; } // virada de mais de ~100°: canto
      return q;
    });
    penToolFinish(closed);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  needs = true;
}
// edição de pontos: clique duplo num vetor, Enter ou "Editar pontos" no painel
function vecEdit(L) {
  if (!L || L.type !== 'shape') return false;
  if (lockedNote(L)) return true;
  if (L.kind !== 'custom' && !vecConvert(L)) return true;
  if (!vecOf(L)) { toast('Este caminho tem arcos (comando A) e não dá para editar ponto a ponto. Desenhe com a caneta (P).', 4500); return true; }
  penToolCancel();
  if (RT.selected !== L.id || pickedLayers().length > 1) select(L.id, true);
  const ph = phase(L, T); if (!ph || ph.mode !== 'hold') seekLayer(L);
  RT.vec = { id:L.id, sel:null }; stageMode(); return true;
}
// retângulo, círculo, triângulo, polígono, estrela e linha -> pontos (no espaço da forma, centro em 0), como no Figma ao editar uma forma
function shapePts(L, G) {
  const w = G.w, h = G.h, k = L.kind, K = .5523;
  const poly = pts => [{ pts:pts.map(([x, y]) => vecPt(x, y)), closed:true }];
  if (k === 'line') return [{ pts:[vecPt(-w / 2, 0), vecPt(w / 2, 0)], closed:false }];
  if (k === 'triangle') return poly([[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
  if (k === 'polygon' || k === 'star') return poly(ngon(w, h, Math.max(3, Math.round(L.points || 5)), k === 'star' ? clamp(L.inner ?? .45, .1, .95) : 0));
  if (k === 'ellipse') {
    const a = w / 2, b = h / 2;
    return [{ closed:true, pts:[{ x:0, y:-b, ix:-a * K, iy:-b, ox:a * K, oy:-b }, { x:a, y:0, ix:a, iy:-b * K, ox:a, oy:b * K },
      { x:0, y:b, ix:a * K, iy:b, ox:-a * K, oy:b }, { x:-a, y:0, ix:-a, iy:b * K, ox:-a, oy:-b * K }] }];
  }
  const [r0, r1, r2, r3] = radii4(radOf(L), w, h), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, c0 = r0 * K, c1 = r1 * K, c2 = r2 * K, c3 = r3 * K;
  if (Math.max(r0, r1, r2, r3) < .5) return poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const P = [], add = (x, y, ix, iy, ox, oy) => {
    const l = P[P.length - 1];
    if (l && Math.hypot(l.x - x, l.y - y) < .01) { l.ox = ox; l.oy = oy; return; } // canto inteiro redondo (ou reto): os dois pontos viram um
    P.push({ x, y, ix, iy, ox, oy });
  };
  add(x0 + r0, y0, x0 + r0 - c0, y0, x0 + r0, y0); add(x1 - r1, y0, x1 - r1, y0, x1 - r1 + c1, y0);
  add(x1, y0 + r1, x1, y0 + r1 - c1, x1, y0 + r1); add(x1, y1 - r2, x1, y1 - r2, x1, y1 - r2 + c2);
  add(x1 - r2, y1, x1 - r2 + c2, y1, x1 - r2, y1); add(x0 + r3, y1, x0 + r3, y1, x0 + r3 - c3, y1);
  add(x0, y1 - r3, x0, y1 - r3 + c3, x0, y1 - r3); add(x0, y0 + r0, x0, y0 + r0, x0, y0 + r0 - c0);
  const f = P[0], l = P[P.length - 1]; if (P.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < .01) { f.ix = l.ix; f.iy = l.iy; P.pop(); }
  return [{ pts:P, closed:true }];
}
function vecConvert(L) {
  const G = geomNow(L); if (!G) return false;
  const pl = placeOf(L), a = (L.rot || 0) * Math.PI / 180;
  pushUndo();
  if (L.kind === 'line') L.fill = false; // a linha vira caminho aberto, só traço
  L.vec = shapePts(L, G); L.kind = 'custom';
  vecApply(L, { s:pl.k, k:pl.k, co:Math.cos(a), si:Math.sin(a), ax:pl.x * W(), ay:pl.y * H(), bx:0, by:0 });
  changed({ props:true });
  toast('A forma virou vetor para editar os pontos', 2600, UNDO_ACT);
  return true;
}
function vecExit() { if (!RT.vec) return; RT.vec = null; stageMode(); }
// a camada em edição (sai sozinho se ela sumiu, foi trocada ou deixou de ser vetor)
function vecL() {
  const V = RT.vec; if (!V) return null;
  const L = S.layers.find(l => l.id === V.id);
  if (!L || RT.selected !== L.id || !L.visible || L.locked || !vecOf(L)) { vecExit(); return null; }
  return L;
}
// `RT.vec.sel` = um ponto escolhido (com alças à vista); `RT.vec.multi` = vários pontos ([{ si, pi }], sempre 2 ou mais, sem alças)
const vecSel = L => { const V = RT.vec, s = V && !V.multi && V.sel, sp = s && L.vec[s.si]; return sp && sp.pts[s.pi] ? s : null; };
const vecAll = L => {
  const V = RT.vec; if (!V) return [];
  const ok = s => L.vec[s.si] && L.vec[s.si].pts[s.pi];
  if (V.multi) return V.multi.filter(ok);
  const s = vecSel(L); return s ? [s] : [];
};
const vecIn = (L, si, pi) => vecAll(L).some(s => s.si === si && s.pi === pi);
function vecSetSel(list) {
  const seen = new Set(), out = list.filter(s => { const k = s.si + ':' + s.pi; if (seen.has(k)) return false; seen.add(k); return true; });
  RT.vec.sel = out.length === 1 ? { si:out[0].si, pi:out[0].pi } : null;
  RT.vec.multi = out.length > 1 ? out.map(s => ({ si:s.si, pi:s.pi })) : null;
  needs = true;
}
// pontos cujo centro (na tela) cai dentro do retângulo r (espaço do palco)
function vecInRect(L, M, r) {
  const out = [];
  L.vec.forEach((sp, si) => sp.pts.forEach((q, pi) => { const a = vecFwd(M, q.x, q.y); if (a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h) out.push({ si, pi }); }));
  return out;
}
// arrastar no vazio (ou no corpo da forma) seleciona pontos por área, como a seleção normal; Shift soma; só um clique no vazio sai da edição
function vecMarquee(e, L, M, onBody) {
  const p0 = stagePt(e), add = e.shiftKey, x0 = e.clientX, y0 = e.clientY, base = add ? vecAll(L) : []; let moved = false;
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    moved = true; const p = stagePt(ev);
    RT.vmarq = { x:Math.min(p0.x, p.x), y:Math.min(p0.y, p.y), w:Math.abs(p.x - p0.x), h:Math.abs(p.y - p0.y), base }; needs = true;
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const r = RT.vmarq; RT.vmarq = null; needs = true;
    if (!RT.vec) return;
    if (!moved || !r) {
      if (add) return;
      if (onBody) vecSetSel([]);
      else { vecExit(); const o = hitTest(p0); if (o) select(o.id); else selectBg(); }
      return;
    }
    vecSetSel([...base, ...vecInRect(L, M, r)]);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
// alças à vista: as do ponto escolhido e as dos vizinhos que encostam nele (como no Figma)
function vecKnobs(L, M) {
  const s = vecSel(L), out = []; if (!s) return out;
  const sp = L.vec[s.si], n = sp.pts.length;
  const at = (pi, w) => {
    const q = sp.pts[pi]; if (!q || !hasH(q, w) || (!sp.closed && ((w === 'i' && pi === 0) || (w === 'o' && pi === n - 1)))) return;
    const a = vecFwd(M, q.x, q.y), b = vecFwd(M, q[w + 'x'], q[w + 'y']); out.push({ kind:'h', si:s.si, pi, w, ax:a.x, ay:a.y, x:b.x, y:b.y });
  };
  const prev = s.pi > 0 ? s.pi - 1 : sp.closed ? n - 1 : -1, next = s.pi < n - 1 ? s.pi + 1 : sp.closed ? 0 : -1;
  at(s.pi, 'i'); at(s.pi, 'o'); if (prev >= 0 && prev !== s.pi) at(prev, 'o'); if (next >= 0 && next !== s.pi) at(next, 'i');
  return out;
}
// o que está sob o cursor: alça, ponto ou trecho da linha (com o t do ponto mais perto)
function vecHit(L, M, pt) {
  const r = 7 * pxU(), d = (x, y) => Math.hypot(pt.x - x, pt.y - y);
  for (const k of vecKnobs(L, M)) if (d(k.x, k.y) <= r) return k;
  for (let si = 0; si < L.vec.length; si++) for (let pi = 0; pi < L.vec[si].pts.length; pi++) {
    const q = L.vec[si].pts[pi], a = vecFwd(M, q.x, q.y); if (d(a.x, a.y) <= r) return { kind:'p', si, pi };
  }
  let best = null;
  L.vec.forEach((sp, si) => {
    const P = sp.pts, n = P.length, m = sp.closed ? n : n - 1;
    for (let j = 0; j < m; j++) {
      const a = P[j], b = P[(j + 1) % n]; let p0 = vecFwd(M, a.x, a.y), t0 = 0;
      for (let k = 1; k <= 48; k++) {
        const t1 = k / 48, q = bezAt(a, b, t1), p1 = vecFwd(M, q.x, q.y), vx = p1.x - p0.x, vy = p1.y - p0.y;
        const u = clamp(((pt.x - p0.x) * vx + (pt.y - p0.y) * vy) / (vx * vx + vy * vy || 1)), dd = d(p0.x + vx * u, p0.y + vy * u);
        if (dd <= r && (!best || dd < best.dd)) best = { kind:'seg', si, pi:j, t:t0 + (t1 - t0) * u, dd };
        p0 = p1; t0 = t1;
      }
    }
  });
  return best && best.t > .01 && best.t < .99 ? best : null;
}
// ponto novo no meio de um trecho, sem mudar o desenho (de Casteljau)
function vecSplit(L, hit) {
  const P = L.vec[hit.si].pts, a = P[hit.pi], b = P[(hit.pi + 1) % P.length], t = hit.t;
  let q;
  if (!hasH(a, 'o') && !hasH(b, 'i')) q = vecPt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  else {
    const lp = (p, r) => ({ x:p.x + (r.x - p.x) * t, y:p.y + (r.y - p.y) * t });
    const p01 = lp(a, { x:a.ox, y:a.oy }), p12 = lp({ x:a.ox, y:a.oy }, { x:b.ix, y:b.iy }), p23 = lp({ x:b.ix, y:b.iy }, b), p012 = lp(p01, p12), p123 = lp(p12, p23), m = lp(p012, p123);
    a.ox = p01.x; a.oy = p01.y; b.ix = p23.x; b.iy = p23.y;
    q = { x:m.x, y:m.y, ix:p012.x, iy:p012.y, ox:p123.x, oy:p123.y };
  }
  P.splice(hit.pi + 1, 0, q);
}
// Alt + clique no ponto: curva vira canto (tira as alças) e canto vira curva (alças na direção dos vizinhos)
function vecToggle(L, si, pi) {
  const sp = L.vec[si], P = sp.pts, n = P.length, q = P[pi];
  if (hasH(q, 'i') || hasH(q, 'o')) { q.ix = q.ox = q.x; q.iy = q.oy = q.y; return; }
  smoothPt(q, P[pi > 0 ? pi - 1 : sp.closed ? n - 1 : pi], P[pi < n - 1 ? pi + 1 : sp.closed ? 0 : pi]);
}
// botões Canto / Curva no aviso do palco
function vecSetType(L, curve) {
  const s = vecSel(L); if (!s) return;
  const q = L.vec[s.si].pts[s.pi]; if ((hasH(q, 'i') || hasH(q, 'o')) === curve) return;
  const M = vecMap(L); pushUndo(); vecToggle(L, s.si, s.pi); vecApply(L, M); changed();
}
const oppH = w => w === 'i' ? 'o' : 'i';
// as duas alças do ponto estão alinhadas (ponto suave)? Então, mexendo numa, a outra gira junto e mantém o comprimento
function linedH(q, w) {
  const o = oppH(w); if (!hasH(q, w) || !hasH(q, o)) return false;
  const a1 = Math.atan2(q[w + 'y'] - q.y, q[w + 'x'] - q.x), a2 = Math.atan2(q[o + 'y'] - q.y, q[o + 'x'] - q.x);
  return Math.abs(Math.abs(Math.atan2(Math.sin(a1 - a2), Math.cos(a1 - a2))) - Math.PI) < .07;
}
function keepLined(q, w, len) { const o = oppH(w), a = Math.atan2(q[w + 'y'] - q.y, q[w + 'x'] - q.x) + Math.PI; q[o + 'x'] = q.x + Math.cos(a) * len; q[o + 'y'] = q.y + Math.sin(a) * len; }
const hLen = (q, w) => Math.hypot(q[w + 'x'] - q.x, q[w + 'y'] - q.y);
// arrastar ponto (leva as alças; Shift trava o eixo; Alt puxa alças novas), alça (a oposta alinhada continua alinhada; Alt solta) ou trecho (cria ponto e arrasta)
function vecDown(e, L, M, hit) {
  let undone = false; const once = () => { if (!undone) { pushUndo(); undone = true; } };
  const alt = e.altKey, x0 = e.clientX, y0 = e.clientY; let moved = false, mv, up0 = () => {};
  if (hit.kind === 'seg') { // arrastar a linha = curvar (o ponto do trecho sob o mouse segue o mouse); só clicar = ponto novo
    const P = L.vec[hit.si].pts, a = P[hit.pi], b = P[(hit.pi + 1) % P.length], a0 = { ...a }, b0 = { ...b }, t = hit.t, u = 1 - t;
    const B0 = bezAt(a0, b0, t), w1 = 3 * u * u * t, w2 = 3 * u * t * t, den = w1 * w1 + w2 * w2;
    const linA = linedH(a0, 'o'), linB = linedH(b0, 'i'), lenA = hLen(a0, 'i'), lenB = hLen(b0, 'o');
    mv = ev => {
      const g = vecInv(M, stagePt(ev)), dx = g.x - B0.x, dy = g.y - B0.y;
      a.ox = a0.ox + dx * w1 / den; a.oy = a0.oy + dy * w1 / den; b.ix = b0.ix + dx * w2 / den; b.iy = b0.iy + dy * w2 / den;
      if (!ev.altKey) { if (linA) keepLined(a, 'o', lenA); if (linB) keepLined(b, 'i', lenB); }
    };
    up0 = () => { if (!moved) { once(); vecSplit(L, hit); vecApply(L, M); vecSetSel([{ si:hit.si, pi:hit.pi + 1 }]); } };
  } else {
    if (hit.kind === 'p') {
      if (e.shiftKey && !alt) {
        const all = vecAll(L), has = all.some(s => s.si === hit.si && s.pi === hit.pi);
        vecSetSel(has ? all.filter(s => !(s.si === hit.si && s.pi === hit.pi)) : [...all, { si:hit.si, pi:hit.pi }]);
        if (has) return; // Shift + clique num ponto já escolhido tira ele da seleção
      }
      else if (!(RT.vec.multi && vecIn(L, hit.si, hit.pi))) vecSetSel([{ si:hit.si, pi:hit.pi }]);
    }
    // vários pontos escolhidos: arrastar um leva todos (clicar sem arrastar volta a escolher só ele)
    const grp = hit.kind === 'p' && !alt && RT.vec.multi && vecIn(L, hit.si, hit.pi) ? vecAll(L).map(s => { const o = L.vec[s.si].pts[s.pi]; return { q:o, st:{ ...o } }; }) : null;
    const q = L.vec[hit.si].pts[hit.pi], st = { ...q }, w = hit.w, lined = !!w && linedH(q, w), oLen = w ? hLen(q, oppH(w)) : 0;
    mv = ev => {
      let p = stagePt(ev);
      if (hit.kind === 'p' && !alt) { // ponto: leva as alças junto; Shift trava o eixo
        const p0 = vecFwd(M, st.x, st.y); if (ev.shiftKey) { if (Math.abs(p.x - p0.x) > Math.abs(p.y - p0.y)) p.y = p0.y; else p.x = p0.x; }
        const g = vecInv(M, p), dx = g.x - st.x, dy = g.y - st.y;
        for (const o of grp || [{ q, st }]) Object.assign(o.q, { x:o.st.x + dx, y:o.st.y + dy, ix:o.st.ix + dx, iy:o.st.iy + dy, ox:o.st.ox + dx, oy:o.st.oy + dy });
      } else if (hit.kind === 'p') { // Alt + arrastar o ponto: puxa alças novas, simétricas
        if (ev.shiftKey) p = snap45(vecFwd(M, q.x, q.y), p);
        const g = vecInv(M, p); q.ox = g.x; q.oy = g.y; q.ix = 2 * q.x - g.x; q.iy = 2 * q.y - g.y;
      } else { // alça: a oposta alinhada continua alinhada (Alt solta)
        if (ev.shiftKey) p = snap45(vecFwd(M, q.x, q.y), p);
        const g = vecInv(M, p); q[w + 'x'] = g.x; q[w + 'y'] = g.y;
        if (lined && !ev.altKey) keepLined(q, w, oLen);
      }
    };
    up0 = () => {
      if (moved || hit.kind !== 'p') return;
      if (grp && !e.shiftKey) { vecSetSel([{ si:hit.si, pi:hit.pi }]); return; }
      const now = performance.now(), tp = RT.vec.tap, dbl = tp && tp.si === hit.si && tp.pi === hit.pi && now - tp.t < 400;
      RT.vec.tap = dbl ? null : { si:hit.si, pi:hit.pi, t:now };
      if (alt || dbl) { once(); vecToggle(L, hit.si, hit.pi); vecApply(L, M); } // Alt + clique ou clique duplo: curva <-> canto
    };
  }
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
    moved = true; once(); mv(ev); vecApply(L, M);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    up0();
    if (undone) changed({ props:true }); needs = true;
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  needs = true;
}
function vecDelete(L) {
  const all = vecAll(L); if (!all.length) return;
  const total = L.vec.reduce((a, p) => a + p.pts.length, 0);
  if (total - all.length < 2) { vecExit(); deleteLayer(L); return; }
  const M = vecMap(L); pushUndo();
  all.sort((a, b) => b.si - a.si || b.pi - a.pi).forEach(s => L.vec[s.si].pts.splice(s.pi, 1));
  L.vec = L.vec.filter(sp => sp.pts.length >= 2);
  vecSetSel([]); vecApply(L, M); changed({ props:true });
}
let vecNT = null;
function vecNudge(L, dx, dy) {
  const all = vecAll(L); if (!all.length) return;
  if (!vecNT) pushUndo(); clearTimeout(vecNT); vecNT = setTimeout(() => { vecNT = null; }, 700);
  const M = vecMap(L), q0 = L.vec[all[0].si].pts[all[0].pi], a = vecFwd(M, q0.x, q0.y), g = vecInv(M, { x:a.x + dx, y:a.y + dy }), ddx = g.x - q0.x, ddy = g.y - q0.y;
  for (const s of all) { const q = L.vec[s.si].pts[s.pi]; q.x += ddx; q.y += ddy; q.ix += ddx; q.iy += ddy; q.ox += ddx; q.oy += ddy; }
  vecApply(L, M); changed();
}
// overlay (#ov, espaço do vídeo): caminho, pontos e alças
function drawPenTool(ctx) {
  if (playing || (!RT.pen && !RT.vec)) return;
  const px = pxU(), lw = 1.5 * px;
  const anchor = (x, y, on, big) => { const r = (big ? 5.5 : 3.5) * px; ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = on ? PEN_C : '#fff'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = PEN_C; ctx.stroke(); };
  const knob = (ax, ay, x, y) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y); ctx.lineWidth = px; ctx.strokeStyle = PEN_C; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3 * px, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  };
  const trace = (pts, closed, f) => {
    const p = new Path2D(); if (!pts.length) return p;
    const a0 = f(pts[0].x, pts[0].y); p.moveTo(a0.x, a0.y);
    const seg = (a, b) => { const c1 = f(a.ox, a.oy), c2 = f(b.ix, b.iy), e = f(b.x, b.y); p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y); };
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
    if (closed && pts.length > 1) { seg(pts[pts.length - 1], pts[0]); p.closePath(); }
    return p;
  };
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = lw; ctx.strokeStyle = PEN_C;
  if (RT.pen) {
    const P = RT.pen, pts = P.pts, last = pts[pts.length - 1], id = (x, y) => ({ x, y });
    const hot = PEN_MODE !== 'free' && pts.length >= 2 && (!!P.closing || (!!P.cur && Math.hypot(P.cur.x - pts[0].x, P.cur.y - pts[0].y) <= 9 * px)); // closing = arrastando no 1º ponto para fechar
    if (P.raw) { ctx.beginPath(); P.raw.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineWidth = 2 * px; ctx.stroke(); ctx.lineWidth = lw; } // mão livre
    // o próximo trecho, até o cursor (no modo Curvas o ponto de trás já se ajusta)
    const tmp = pts.map(q => ({ ...q }));
    if (last && P.cur && !hot && PEN_MODE !== 'free') { const c = P.shift ? snap45(last, P.cur) : P.cur; tmp.push({ ...vecPt(c.x, c.y), a:PEN_MODE === 'smooth' ? 1 : 0 }); }
    autoH(tmp, hot);
    if (tmp.length > pts.length || hot) { ctx.globalAlpha = .55; ctx.stroke(trace(tmp, hot, id)); ctx.globalAlpha = 1; }
    ctx.stroke(trace(tmp.slice(0, pts.length), false, id));
    pts.forEach((q, i) => anchor(q.x, q.y, i === pts.length - 1, i === 0 && hot));
    for (const q of [pts[0], last]) if (q) { if (hasH(q, 'i') && q !== pts[0]) knob(q.x, q.y, q.ix, q.iy); if (hasH(q, 'o') && (q === last || pts.length === 1)) knob(q.x, q.y, q.ox, q.oy); }
  }
  const L = vecL(), M = L && vecMap(L);
  if (M) {
    const f = (x, y) => vecFwd(M, x, y), pre = RT.vmarq ? new Set([...RT.vmarq.base, ...vecInRect(L, M, RT.vmarq)].map(k => k.si + ':' + k.pi)) : null;
    L.vec.forEach(sp => ctx.stroke(trace(sp.pts, sp.closed, f)));
    for (const k of vecKnobs(L, M)) knob(k.ax, k.ay, k.x, k.y);
    L.vec.forEach((sp, si) => sp.pts.forEach((q, pi) => { const a = f(q.x, q.y); anchor(a.x, a.y, pre ? pre.has(si + ':' + pi) : vecIn(L, si, pi)); }));
    if (RT.vmarq) {
      const r = RT.vmarq;
      ctx.fillStyle = uiA('sel', .08); ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.lineWidth = px; ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  }
  ctx.restore();
}
// pega antes do palco (na fase de captura): a mão (espaço) continua valendo, o botão do meio continua arrastando
$('#stageBox').addEventListener('pointerdown', e => {
  if (!(RT.pen || RT.vec) || RT.hand || e.button !== 0 || onScrollbar(e) || e.target.closest('#stageHint')) return;
  if (RT.pen) { e.stopPropagation(); e.preventDefault(); penToolDown(e); return; }
  const L = vecL(), M = L && vecMap(L), hit = M && vecHit(L, M, stagePt(e));
  if (!hit) {
    if (!M) { vecExit(); return; }
    const onBody = hitTest(stagePt(e)) === L;
    // Ctrl + arrastar no corpo da forma move a forma (continua editando); arrastar sem Ctrl seleciona pontos por área
    if (onBody && (e.ctrlKey || e.metaKey)) { e.stopPropagation(); e.preventDefault(); cvDown(e); return; }
    e.stopPropagation(); e.preventDefault(); vecMarquee(e, L, M, onBody); return;
  }
  e.stopPropagation(); e.preventDefault(); vecDown(e, L, M, hit);
}, true);
$('#stageBox').addEventListener('pointermove', e => {
  if (!(RT.pen || RT.vec) || RT.hand) return;
  if (e.buttons) return; // arrastando: o movimento tem que chegar à janela (curva da caneta, mão livre, pontos)
  e.stopPropagation();
  if (RT.pen) { RT.pen.cur = stagePt(e); RT.pen.shift = e.shiftKey; needs = true; return; }
  const L = vecL(), M = L && vecMap(L), hit = M && vecHit(L, M, stagePt(e)), c = !hit ? (M && hitTest(stagePt(e)) === L && (e.ctrlKey || e.metaKey) ? 'move' : '') : hit.kind === 'seg' ? 'copy' : 'move';
  cv.style.cursor = c; $('#stageBox').style.cursor = c;
}, true);
addEventListener('keydown', e => {
  if (!(RT.pen || RT.vec) || typingIn(e.target) || overlayOpen()) return;
  const k = e.key, kl = k.toLowerCase(), mod = e.ctrlKey || e.metaKey; let ok = true;
  if (RT.pen) {
    if (k === 'Escape' || k === 'Enter' || (kl === 'p' && !mod)) penToolFinish(false);
    else if (k === 'Backspace' || k === 'Delete' || (mod && kl === 'z' && !e.shiftKey)) { RT.pen.pts.pop(); if (!RT.pen.pts.length) penToolCancel(); needs = true; }
    else ok = false;
  } else {
    const L = vecL(); if (!L) return;
    if (k === 'Escape' || k === 'Enter') vecExit();
    else if (k === 'Backspace' || k === 'Delete') vecDelete(L);
    else if (k.startsWith('Arrow') && vecAll(L).length) { const s = e.shiftKey ? 10 : 1; vecNudge(L, ((k === 'ArrowRight') - (k === 'ArrowLeft')) * s, ((k === 'ArrowDown') - (k === 'ArrowUp')) * s); }
    else if (mod && kl === 'a') vecSetSel(L.vec.flatMap((sp, si) => sp.pts.map((q, pi) => ({ si, pi }))));
    else ok = false;
  }
  if (ok) { e.preventDefault(); e.stopPropagation(); }
}, true);
function selectBg() { const bg = S.layers.find(l => l.type === 'bg'); if (bg) select(bg.id); }
function setHover(id) { id = id || null; if (RT.hover !== id) { RT.hover = id; needs = true; } }
// camadas na tela que encostam no retângulo (um grupo entra inteiro)
function marqHits(r) {
  return S.layers.filter(o => { if (o.type === 'bg' || !o.visible || o.locked || !o._bounds || !phase(o, T)) return false; const b = visB(o); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; });
}
function marquee(ev) {
  const p0 = stagePt(ev), add = ev.shiftKey, x0 = ev.clientX, y0 = ev.clientY;
  let moved = false;
  const mv = e => {
    if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
    moved = true; const p = stagePt(e);
    RT.marq = { x:Math.min(p0.x, p.x), y:Math.min(p0.y, p.y), w:Math.abs(p.x - p0.x), h:Math.abs(p.y - p0.y) }; needs = true;
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const r = RT.marq; RT.marq = null; needs = true;
    if (!moved || !r) { if (!add) selectBg(); return; } // Shift errando o clique não solta a seleção
    const hits = marqHits(r);
    if (!hits.length) { if (!add) selectBg(); return; }
    const ids = new Set(add ? [...(RT.picks || [])].filter(id => S.layers.some(l => l.id === id && l.type !== 'bg')) : []);
    if (add && selL() && selL().type !== 'bg') ids.add(RT.selected);
    hits.forEach(o => groupOf(o).forEach(m => ids.add(m.id)));
    RT.picks = ids; RT.selected = hits[hits.length - 1].id;
    renderLayers(); renderProps(); needs = true;
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
// abre a edição do texto (clique duplo no palco ou Enter): aba de conteúdo, texto todo selecionado
function editText(L) {
  if (!L || L.type === 'bg') return;
  if (vecEdit(L)) return; // vetor: edita os pontos
  if (lockedNote(L)) return;
  if (propTab !== 'style') { propTab = 'style'; renderProps(); }
  if (L.type !== 'text' && L.type !== 'cta') return;
  const ph = phase(L, T); if (!ph || ph.mode !== 'hold') seekLayer(L); // com o texto inteiro na tela
  const el = document.getElementById(fid(L, 'text')); if (!el) return;
  paneShow('right'); foldReveal(el); // coluna escondida ou seção Texto fechada: aparece
  el.focus();
  if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  else el.select();
  // feedback: contorno "Editando" no palco e o campo pulsa; some quando o campo perde o foco
  RT.editId = L.id; needs = true;
  const box = el; box.classList.remove('edit-flash'); void box.offsetWidth; box.classList.add('edit-flash');
  el.addEventListener('blur', () => { if (RT.editId === L.id) { RT.editId = null; needs = true; } }, { once:true });
}

/* ============================================================
   Desfazer, salvar automático, projetos
   ============================================================ */
const redoStack = [];
let redoBase = null; // estado logo depois de desfazer/refazer: enquanto nada mudar, o refazer continua valendo
function syncHist() { const u = $('#undo'), r = $('#redo'); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; }
function pushUndo() {
  try {
    flowBake(); // o passo começa com as posições que a tela mostra (fonte que carregou depois, por exemplo)
    const snap = JSON.stringify(S);
    if (redoStack.length && snap !== redoBase) redoStack.length = 0; // ação nova: o refazer perde o sentido
    // controles chamam pushUndo ao focar/clicar sem mudar nada: não vira passo
    if (undoStack[undoStack.length - 1] !== snap) { undoStack.push(snap); histT.set(snap, T); if (undoStack.length > 60) undoStack.shift(); }
    if (histT.size > 160) { const keep = new Set([...undoStack, ...redoStack]); for (const k of histT.keys()) if (!keep.has(k)) histT.delete(k); }
  } catch (e) {}
  syncHist();
}
// onde estava a agulha em cada passo: ações levam a agulha para outro ponto (seekLayer) e desfazer deixava as camadas restauradas no meio da entrada
const histT = new Map();
function histSeek(s) { const t = histT.get(s); if (t != null) { pause(); T = clamp(t, 0, S.duration); needs = true; } }
function applyState(s) {
  const prevLogo = JSON.stringify(S.brand.logo), prevFit = S.format + '|' + slides();
  S = JSON.parse(s); RT.layout.clear();
  if (!S.layers.find(l => l.id === RT.selected)) RT.selected = S.layers[0]?.id;
  if (JSON.stringify(S.brand.logo) !== prevLogo) refreshLogo();
  ensureFonts(); S.layers.forEach(l => l.src && getImage(l.src));
  redoBase = s;
  renderAll(); needs = true; autosave();
  if (S.format + '|' + slides() !== prevFit) fitStage(); // desfazer a troca de formato ou do número de slides muda o tamanho do palco
}
function undo() {
  const cur = JSON.stringify(S);
  let s; while ((s = undoStack.pop()) === cur) {} // pula passos idênticos ao estado atual
  if (!s) { syncHist(); return; }
  redoStack.push(cur); histT.set(cur, T); applyState(s); histSeek(s); syncHist();
}
function redo() {
  const s = redoStack.pop(); if (!s) { syncHist(); return; }
  const cur = JSON.stringify(S); undoStack.push(cur); histT.set(cur, T); applyState(s); histSeek(s); syncHist();
}
const DB = {
  db:null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => { const r = indexedDB.open('mola-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return this.db;
  },
  async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; } },
  async del(k) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { return false; } },
  async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; } catch (e) { return false; } },
};
/* ------------ arquivos: tudo salva sozinho, como no Figma ------------
   'files' = índice [{ id, name, createdAt, updatedAt, thumb }], 'file:<id>' = projeto (JSON), 'currentId' = arquivo aberto */
const FILES = { id:null, name:'Sem título' };
let saveT = null, saving = false;
function setSaveState(txt) { const el = $('#saveState'); if (el) el.textContent = txt; }
function autosave() { clearTimeout(saveT); setSaveState('Salvando…'); saveT = setTimeout(flushSave, 700); }
function fileThumb() {
  try {
    const c = document.createElement('canvas'), k = 240 / W(); c.width = 240; c.height = Math.round(H() * k);
    renderFrame(c.getContext('2d'), heroTime(), k, false); needs = true;
    return c.toDataURL('image/jpeg', .72);
  } catch (e) { return null; }
}
async function flushSave() {
  clearTimeout(saveT); saveT = null;
  if (!FILES.id) return;
  saving = true;
  const id = FILES.id, ok = await DB.set('file:' + id, JSON.stringify(S));
  const list = (await DB.get('files')) || [];
  let rec = list.find(f => f.id === id);
  if (!rec) { rec = { id, name:FILES.name, createdAt:Date.now() }; list.unshift(rec); }
  rec.name = FILES.name; rec.updatedAt = Date.now(); rec.thumb = fileThumb() || rec.thumb;
  const ok2 = await DB.set('files', list);
  saving = false;
  setSaveState(ok && ok2 ? 'Salvo' : 'Não salvou');
  if (!(ok && ok2)) toast('Este navegador bloqueou o armazenamento. Use Exportar .json.', 3600);
  if (!$('#files').hidden) renderFiles();
}
function changed(opts = {}) {
  flowBake();
  RT.rev++; needs = true; autosave();
  refreshBars();
  if (opts.layers) renderLayers();
  if (opts.props) renderProps();
  if (opts.marks) renderMarks();
}
function newFileId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function showFileName() { const el = $('#fileName'); if (el && document.activeElement !== el) el.value = FILES.name; document.title = `${FILES.name} · Mola Studio`; }
// abre um estado como arquivo (novo ou existente)
async function openState(st, id, name) {
  if (saveT) await flushSave();
  if (!st || !st.layers || !st.brand) { toast('Arquivo de projeto inválido'); return false; }
  await internImages(st); // foto em dataURL (arquivo antigo ou .json importado) vai para fora do JSON
  fixTornGroups(st);
  FILES.id = id; FILES.name = name; showFileName();
  DB.set('currentId', id);
  undoStack.length = 0; redoStack.length = 0; redoBase = null; syncHist();
  S = st; RT.layout.clear(); RT.slide = 0;
  RT.selected = S.layers.find(l => l.type === 'logo')?.id || S.layers.find(l => l.type !== 'bg')?.id || S.layers[0]?.id;
  renderAll(); fitStage();
  await refreshLogo(); ensureFonts();
  S.layers.forEach(l => l.src && getImage(l.src));
  pause(); T = heroTime(); needs = true;
  return true;
}
async function openFile(id) {
  const list = (await DB.get('files')) || [], rec = list.find(f => f.id === id);
  let st = null; try { st = JSON.parse(await DB.get('file:' + id)); } catch (e) {}
  if (!rec || !st) { toast('Não consegui abrir esse arquivo'); return; }
  if (await openState(st, id, rec.name)) { closeFiles(); }
}
// arquivo novo mantém a marca (logo, cores e fontes) do arquivo aberto
async function newFile() {
  const brand = S && S.brand ? JSON.parse(JSON.stringify(S.brand)) : null;
  newProject(); if (brand) S.brand = brand;
  const list = (await DB.get('files')) || [];
  let n = 1; while (list.some(f => f.name === (n === 1 ? 'Sem título' : `Sem título ${n}`))) n++;
  await openState(S, newFileId(), n === 1 ? 'Sem título' : `Sem título ${n}`);
  await flushSave(); closeFiles(); toast('Arquivo novo criado');
}
async function duplicateFile(id) {
  if (id === FILES.id && saveT) await flushSave();
  const list = (await DB.get('files')) || [], rec = list.find(f => f.id === id), data = await DB.get('file:' + id);
  if (!rec || !data) return;
  const nid = newFileId();
  await DB.set('file:' + nid, data);
  list.unshift({ ...rec, id:nid, name:`${rec.name} (cópia)`, createdAt:Date.now(), updatedAt:Date.now() });
  await DB.set('files', list); renderFiles();
}
// "Salvar como": o arquivo aberto fica como está e você passa a trabalhar na cópia
async function saveAsCopy() {
  if (saveT) await flushSave();
  const list = (await DB.get('files')) || [], base = FILES.name.replace(/ \(cópia(?: \d+)?\)$/, '');
  let n = 1, name; do { name = n === 1 ? `${base} (cópia)` : `${base} (cópia ${n})`; n++; } while (list.some(f => f.name === name));
  const st = JSON.parse(JSON.stringify(S)), t = T;
  if (await openState(st, newFileId(), name)) { T = t; needs = true; await flushSave(); toast(`Cópia criada: ${name}`); }
}
async function renameFile(id, name) {
  name = name.trim(); if (!name) return;
  if (id === FILES.id) { FILES.name = name; showFileName(); }
  const list = (await DB.get('files')) || [], rec = list.find(f => f.id === id); if (!rec) return;
  rec.name = name; await DB.set('files', list); renderFiles();
}
async function deleteFile(id) {
  const list = (await DB.get('files')) || [], i = list.findIndex(f => f.id === id); if (i < 0) return;
  if (!confirm(`Apagar "${list[i].name}"? Não dá para desfazer.`)) return;
  list.splice(i, 1); await DB.set('files', list); await DB.del('file:' + id);
  if (id === FILES.id) { FILES.id = null; if (list[0]) await openFile(list[0].id); else await newFile(); }
  renderFiles();
}
const ago = ts => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
};
async function renderFiles() {
  const list = ((await DB.get('files')) || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const q = ($('#fileSearch').value || '').trim().toLowerCase();
  const grid = $('#fgrid'); grid.innerHTML = '';
  grid.append(h('button', { class:'fcard new', onclick:newFile }, [h('div', { class:'fthumb' }, [h('span', { text:'+' })]), h('b', { text:'Novo arquivo' }), h('small', { text:'Com a marca atual' })]));
  for (const f of list) {
    if (q && !f.name.toLowerCase().includes(q)) continue;
    const nm = h('b', { text:f.name, title:'Clique duas vezes para renomear' });
    nm.addEventListener('dblclick', e => {
      e.stopPropagation();
      const inp = h('input', { type:'text', value:f.name, 'aria-label':'Novo nome' });
      const done = ok => { if (ok) renameFile(f.id, inp.value); else renderFiles(); };
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true)); inp.addEventListener('click', ev => ev.stopPropagation());
      nm.replaceWith(inp); inp.focus(); inp.select();
    });
    const card = h('div', { class:'fcard' + (f.id === FILES.id ? ' cur' : ''), role:'button', tabindex:'0', title:`Abrir ${f.name}`,
      onclick:() => f.id === FILES.id ? closeFiles() : openFile(f.id),
      onkeydown:e => { if (e.key === 'Enter' && e.target === card) card.click(); } }, [
      h('div', { class:'fthumb' }, [f.thumb ? h('img', { src:f.thumb, alt:'' }) : null, f.id === FILES.id ? h('em', { text:'Aberto' }) : null]),
      nm,
      h('small', { text:`Editado ${ago(f.updatedAt || f.createdAt)}` }),
      h('div', { class:'facts' }, [
        h('button', { class:'icon-btn', title:'Duplicar', 'aria-label':`Duplicar ${f.name}`, html:ICONS.copy, onclick:e => { e.stopPropagation(); duplicateFile(f.id); } }),
        h('button', { class:'icon-btn', title:'Apagar', 'aria-label':`Apagar ${f.name}`, html:ICONS.trash, onclick:e => { e.stopPropagation(); deleteFile(f.id); } }),
      ]),
    ]);
    grid.append(card);
  }
}
async function openFiles() { if (saveT) await flushSave(); $('#files').hidden = false; $('#fileSearch').value = ''; await renderFiles(); $('#fileSearch').focus(); }
function closeFiles() { $('#files').hidden = true; }
// projetos de versões antigas ('current' e a lista 'projects') viram arquivos
async function migrateFiles() {
  let list = await DB.get('files');
  if (list) return list;
  list = [];
  const old = (await DB.get('projects')) || [];
  for (const p of old.slice().reverse()) {
    const id = newFileId(); await DB.set('file:' + id, p.state);
    list.unshift({ id, name:p.name, createdAt:p.savedAt, updatedAt:p.savedAt });
  }
  const cur = await DB.get('current');
  if (cur) { const id = newFileId(); await DB.set('file:' + id, cur); list.unshift({ id, name:'Sem título', createdAt:Date.now(), updatedAt:Date.now() }); await DB.set('currentId', id); }
  await DB.set('files', list);
  return list;
}
async function loadState(st, name = 'Importado') {
  if (!st || !st.layers || !st.brand) { toast('Arquivo de projeto inválido'); return; }
  await openState(st, newFileId(), name); await flushSave();
}

/* ------------ downloads ------------ */
let DL = null;
try { window.claude?.use?.('downloads').then(d => { DL = d; }).catch(() => {}); } catch (e) {}
async function saveFile(data, filename) {
  if (!DL) {
    // fora do Claude: download normal do navegador
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = h('a', { href:url, download:filename }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Download iniciado'); return true;
  }
  try { await DL.save({ filename, data }); toast('Arquivo salvo'); return true; }
  catch (e) {
    if (e && e.code === 'declined') return false;
    if (e && e.code === 'rate_limited') { toast('Já tem um pedido de download aberto'); return false; }
    toast('Não foi possível salvar o arquivo aqui'); return false;
  }
}

/* ============================================================
   Exportação
   ============================================================ */
let lastExport = null;
// ~0,2 bit por pixel por quadro: sobra qualidade para degradês e granulado, e o arquivo continua leve para web
function exportBitrate(w, hh) { return Math.round(clamp(w * hh * fps() * .2, 8e6, 20e6)); }
// nível H.264 pela carga de macroblocos por segundo (4.0 até 1080p30, 4.2 até 1080p60, 5.1 acima)
function avcLevel(w, hh) { const mbs = Math.ceil(w / 16) * Math.ceil(hh / 16) * fps(); return mbs <= 245760 ? '28' : mbs <= 522240 ? '2a' : '33'; }
async function pickConfig(w, hh) {
  if (!('VideoEncoder' in window)) return null;
  const lv = avcLevel(w, hh);
  const base = { width:w, height:hh, bitrate:exportBitrate(w, hh), bitrateMode:'variable', latencyMode:'quality', framerate:fps() };
  const cands = [
    { codec:'avc1.6400' + lv, mux:'avc', avc:{ format:'avc' } },
    { codec:'avc1.640033', mux:'avc', avc:{ format:'avc' } },
    { codec:'avc1.4d00' + lv, mux:'avc', avc:{ format:'avc' } },
    { codec:'avc1.42e0' + lv, mux:'avc', avc:{ format:'avc' } },
    { codec:'vp09.00.41.08', mux:'vp9' },
  ];
  for (const c of cands) for (const hw of ['no-preference', 'prefer-software']) {
    const cfg = { ...base, codec:c.codec, hardwareAcceleration:hw }; if (c.avc) cfg.avc = c.avc;
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux:c.mux }; } catch (e) {}
  }
  return null;
}
let cancelExport = false;
// sl = slides que saem nesta passada (carrossel: um vídeo por slide, recortado do quadro inteiro; sem carrossel, [0] = o quadro)
async function encodeWebCodecs(canvas, ctx, w, hh, N, prog, mix, sl = [0]) {
  if (!window.Mp4Muxer) return null;
  const pick = await pickConfig(w, hh); if (!pick) return null;
  // trilha: codifica antes (AAC, senão Opus); se falhar, o vídeo sai sem som em vez de não sair
  const apick = mix ? await pickAudio(mix.sampleRate) : null;
  let achunks = null;
  if (apick) try { achunks = await encodeAudio(mix, apick); } catch (e) { console.warn('áudio falhou', e); achunks = null; }
  const cut = canvas.width > w; // o quadro tem mais de um slide
  const outs = sl.map(s => {
    const opt = { target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:pick.mux, width:w, height:hh, frameRate:fps() }, fastStart:'in-memory', firstTimestampBehavior:'offset' };
    if (achunks) opt.audio = { codec:apick.mux, sampleRate:mix.sampleRate, numberOfChannels:2 };
    const o = { s, muxer:new Mp4Muxer.Muxer(opt), err:null, cv:null };
    if (achunks) for (const [c, m] of achunks) o.muxer.addAudioChunk(c, m);
    if (cut) { o.cv = document.createElement('canvas'); o.cv.width = w; o.cv.height = hh; }
    o.enc = new VideoEncoder({ output:(chunk, meta) => o.muxer.addVideoChunk(chunk, meta), error:e => { o.err = e; } });
    o.enc.configure(pick.cfg);
    return o;
  });
  const closeAll = () => outs.forEach(o => { try { o.enc.close(); } catch (e) {} });
  const fail = () => { const o = outs.find(o => o.err); if (o) { closeAll(); throw o.err; } };
  for (let i = 0; i < N; i++) {
    if (cancelExport) { closeAll(); return 'cancel'; }
    const t = i / fps();
    await seekVideos(t);
    renderExportFrame(ctx, t);
    for (const o of outs) {
      if (o.cv) o.cv.getContext('2d').drawImage(canvas, o.s * w, 0, w, hh, 0, 0, w, hh);
      const vf = new VideoFrame(o.cv || canvas, { timestamp:Math.round(i * 1e6 / fps()), duration:Math.round(1e6 / fps()) });
      o.enc.encode(vf, { keyFrame:i % (fps() * 2) === 0 }); vf.close();
    }
    while (outs.some(o => o.enc.encodeQueueSize > 6)) await sleep(1);
    fail();
    if (i % 3 === 0) { prog(i / N); await sleep(0); }
  }
  await Promise.all(outs.map(o => o.enc.flush())); fail();
  for (const o of outs) { o.muxer.finalize(); o.enc.close(); }
  const blobs = outs.map(o => new Blob([o.muxer.target.buffer], { type:'video/mp4' }));
  return { blob:blobs[0], blobs, ext:'mp4', audio:!!achunks,
    codec:(pick.cfg.codec.startsWith('avc1.64') ? 'H.264 High' : pick.cfg.codec.startsWith('avc') ? 'H.264' : 'VP9') + ` · ${(pick.cfg.bitrate / 1e6).toFixed(1)} Mbps` + (achunks ? ` · ${apick.mux === 'aac' ? 'AAC' : 'Opus'}` : mix ? ' · sem som (o navegador não codificou o áudio)' : '') };
}
async function encodeRecorder(canvas, ctx, prog) {
  if (!canvas.captureStream || !window.MediaRecorder) return null;
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;
  const stream = canvas.captureStream(fps()), rec = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:exportBitrate(canvas.width, canvas.height) }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);
  rec.start(200);
  const t0 = performance.now();
  await new Promise(res => { const step = () => { const t = (performance.now() - t0) / 1000; if (cancelExport || t >= S.duration) return res(); renderFrame(ctx, t, 1, true); prog(t / S.duration); requestAnimationFrame(step); }; step(); });
  rec.stop(); await done;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  return { blob:new Blob(chunks, { type:mime.split(';')[0] }), ext, codec:ext === 'mp4' ? 'H.264 (tempo real)' : 'WebM (tempo real)' };
}
// um vídeo do jeito que S está agora (formato e variação já aplicados)
async function renderVideo(prog) {
  const w = W(), hh = H(), N = Math.round(S.duration * fps()), n = slides();
  await document.fonts.ready; await videosReady();
  const canvas = document.createElement('canvas'); canvas.width = w * n; canvas.height = hh;
  const ctx = canvas.getContext('2d');
  let mix = null;
  if (hasAudio()) try { mix = await buildMix(48000); } catch (e) { console.warn('trilha falhou', e); }
  let res = null;
  try { res = await encodeWebCodecs(canvas, ctx, w, hh, N, prog, mix, [...Array(n).keys()]); } catch (e) { console.warn('WebCodecs falhou', e); res = null; }
  if (res === 'cancel' || cancelExport) return 'cancel';
  // carrossel: a placa pode recusar vários codificadores ao mesmo tempo; tenta um slide por vez (mais lento, mas sai)
  if (!res && n > 1) {
    const blobs = []; let r = null;
    for (let s = 0; s < n; s++) {
      try { r = await encodeWebCodecs(canvas, ctx, w, hh, N, p => prog((s + p) / n), mix, [s]); } catch (e) { console.warn('WebCodecs falhou', e); r = null; }
      if (!r || r === 'cancel' || cancelExport) break;
      blobs.push(r.blob);
    }
    if (r === 'cancel' || cancelExport) return 'cancel';
    return r && blobs.length === n ? { ...r, blob:blobs[0], blobs } : null; // gravar em tempo real só serve para um quadro
  }
  if (!res) { $('#mMeta').textContent += ' · gravando em tempo real, sem som'; try { res = await encodeRecorder(canvas, ctx, prog); } catch (e) { res = null; } }
  return res;
}
const fileSafe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 40) || 'versao';
// vários vídeos: numa pasta escolhida (Chrome/Edge) ou um download para cada
async function saveOut(dir, blob, fname) {
  if (dir) { try { const fh = await dir.getFileHandle(fname, { create:true }), wr = await fh.createWritable(); await wr.write(blob); await wr.close(); return; } catch (e) { console.warn(e); } }
  await saveFile(blob, fname); await sleep(400);
}
// fmts = formatos; vars = [null (o arquivo como está), ...linhas de variação]
async function runExport(fmts, vars) {
  const jobs = []; for (const v of vars) for (const f of fmts) jobs.push({ f, v });
  if (!jobs.length) return;
  const many = jobs.length > 1 || slides() > 1; // carrossel: um arquivo por slide
  let dir = null;
  if (many && window.showDirectoryPicker) {
    try { dir = await window.showDirectoryPicker({ id:'mola-export', mode:'readwrite' }); }
    catch (e) { if (e && e.name === 'AbortError') return; dir = null; }
  }
  if (saveT) await flushSave();
  pause(); RT.exporting = true; cancelExport = false;
  const fmt0 = S.format, m = $('#modal');
  if (!FORMATS[S.base] && hasContent()) S.base = fmt0; // os outros formatos se reorganizam a partir do aberto
  m.hidden = false; $('#mTitle').textContent = many ? `Exportando ${jobs.length * slides()} vídeos` : 'Exportando vídeo';
  $('#mVideo').hidden = true; $('#mSave').hidden = true; $('#mBar').style.width = '0%'; $('#mClose').textContent = 'Cancelar';
  const prog = p => { $('#mBar').style.width = (clamp(p) * 100).toFixed(1) + '%'; };
  const done = []; let fail = false, last = null;
  try {
    for (let j = 0; j < jobs.length && !cancelExport; j++) {
      const { f, v } = jobs[j]; S.format = f; RT.layout.clear();
      $('#mMeta').textContent = `${many ? `${j + 1} de ${jobs.length} · ` : ''}${v ? v.name + ' · ' : ''}${slides() > 1 ? `${slides()} slides de ` : ''}${W()}×${H()} · ${fps()} fps · ${S.duration}s${(MBLUR[S.mblur] || MBLUR.off).n > 1 ? ' · desfoque de movimento' : ''}`;
      const res = await withVariant(v, () => renderVideo(p => prog((j + p) / jobs.length)));
      if (res === 'cancel' || cancelExport) break;
      if (!res) { fail = true; break; }
      const nm = outName(), fname = `${v ? nm.replace(/-(\d+x\d+)$/, `-${fileSafe(v.name)}-$1`) : nm}.${res.ext}`;
      last = { ...res, fname, w:W(), hh:H() };
      // carrossel: nome-4x5-01.mp4, nome-4x5-02.mp4… (na ordem dos slides)
      const parts = res.blobs && res.blobs.length > 1 ? res.blobs.map((b, s) => [b, fname.replace(/(\.\w+)$/, `-${String(s + 1).padStart(2, '0')}$1`)]) : [[res.blob, fname]];
      if (many) for (const [b, fn] of parts) { await saveOut(dir, b, fn); done.push(fn); }
    }
  } finally { S.format = fmt0; RT.layout.clear(); RT.exporting = false; needs = true; fitStage(); }
  $('#mClose').textContent = 'Fechar';
  if (cancelExport) { m.hidden = true; if (done.length) toast(`${done.length} vídeo${done.length > 1 ? 's' : ''} salvo${done.length > 1 ? 's' : ''} antes de cancelar`); return; }
  if (fail || !last) { $('#mTitle').textContent = 'Este navegador não exporta vídeo'; $('#mMeta').textContent = 'Use o Chrome ou o Edge atualizados.'; return; }
  prog(1);
  if (many) { $('#mTitle').textContent = `${done.length} vídeos prontos`; $('#mMeta').textContent = dir ? `Salvos na pasta "${dir.name}".` : 'Cada vídeo foi baixado separado.'; return; }
  if (lastExport?.url) URL.revokeObjectURL(lastExport.url);
  lastExport = { ...last, url:URL.createObjectURL(last.blob) };
  $('#mTitle').textContent = 'Vídeo pronto';
  $('#mMeta').textContent = `${last.w}×${last.hh} · ${fps()} fps · ${last.codec} · ${(last.blob.size / 1048576).toFixed(1)} MB`;
  const vid = $('#mVideo'); vid.src = lastExport.url; vid.hidden = false;
  $('#mSave').hidden = false; $('#mSave').textContent = `Salvar ${last.ext.toUpperCase()}`;
}
// Exportar: escolhe formatos, variações e desfoque de movimento (lembra a última escolha do arquivo)
function exportVideo() {
  if (RT.exporting || document.querySelector('.xsheet')) return;
  pause();
  if (S.still) { exportStill(); return; }
  const ex = S.export || {}, rows = varRows();
  const fm = new Set((ex.fmts || [S.format]).filter(f => FORMATS[f])); if (!fm.size) fm.add(S.format);
  let all = !!ex.vars && rows.length > 0, mb = MBLUR[S.mblur] ? S.mblur : 'off';
  const close = () => ov.remove();
  const count = () => fm.size * (all ? rows.length + 1 : 1) * slides(); // carrossel: um vídeo por slide
  const summary = h('p', { class:'hint xsum' });
  const go = h('button', { class:'btn primary', onclick:() => {
    S.export = { fmts:[...fm], vars:all }; S.mblur = mb; autosave(); close();
    runExport(Object.keys(FORMATS).filter(f => fm.has(f)), all ? [null, ...rows] : [null]);
  } });
  const upd = () => {
    const n = count();
    summary.textContent = `${n} vídeo${n > 1 ? 's' : ''}${slides() > 1 ? ` (carrossel: um por slide, ${slides()} slides)` : ''}, ${hasAudio() ? 'com som' : 'sem som'}.${n > 1 ? (window.showDirectoryPicker ? ' Você escolhe a pasta onde salvar.' : ' Cada um baixa separado.') : ''}`;
    go.textContent = n > 1 ? `Exportar ${n} vídeos` : 'Exportar MP4';
  };
  const chips = (opts, isOn, onPick) => {
    const w = h('div', { class:'chips' });
    const draw = () => { w.innerHTML = ''; opts.forEach(([k, t]) => w.append(h('button', { class:'chip', 'aria-pressed':String(isOn(k)), onclick:() => { onPick(k); draw(); upd(); } }, [h('span', { text:t })]))); };
    draw(); return w;
  };
  const card = h('div', { class:'files-card xcard', role:'dialog', 'aria-modal':'true', 'aria-label':'Exportar' }, [
    h('div', { class:'files-head' }, [h('h2', { text:'Exportar' }), h('div', { class:'spacer' }), h('button', { class:'btn small ghost', text:'Fechar', onclick:close })]),
    h('h3', { text:'Formatos' }),
    chips(Object.entries(FORMATS).map(([k, f]) => [k, f.label]), k => fm.has(k), k => { if (fm.has(k)) { if (fm.size > 1) fm.delete(k); } else fm.add(k); }),
    h('p', { class:'hint', text:`Cada formato se reorganiza a partir do ${fmtLabel(baseFmt())} (o principal): os blocos ficam juntos, o que encosta na margem continua nela e a foto muda de recorte para ocupar o espaço. O que você ajustou num formato fica só nele.` }),
    h('h3', { text:'Variações de texto' }),
    rows.length ? chips([['one', 'Só a atual'], ['all', `Todas (${rows.length + 1})`]], k => (k === 'all') === all, k => { all = k === 'all'; })
      : h('p', { class:'hint', text:'Nenhuma variação ainda. Crie em "Variações", no topo, para exportar várias versões de uma vez.' }),
    h('h3', { text:'Desfoque de movimento' }),
    chips(Object.entries(MBLUR).map(([k, v]) => [k, v.label]), k => k === mb, k => { mb = k; }),
    h('p', { class:'hint', text:'Dá rastro de câmera de cinema às molas, deslizes e zooms. A exportação fica mais lenta.' }),
    summary,
    h('div', { class:'row', style:'justify-content:flex-end' }, [h('button', { class:'btn', text:'Cancelar', onclick:close }), go]),
  ]);
  const ov = h('div', { class:'files xsheet', onpointerdown:e => { if (e.target === ov) close(); }, onkeydown:e => { e.stopPropagation(); if (e.key === 'Escape') close(); } }, [card]);
  document.body.append(ov); upd(); go.focus();
}
$('#export').onclick = exportVideo;
// nome dos arquivos exportados: nome do arquivo + formato (ex.: "Promo junho-4x5")
const outName = () => `${(FILES.name || 'mola').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mola'}-${FORMATS[S.format].label.replace(':', 'x')}`;
// quadro da agulha em PNG, na resolução do vídeo (capa, miniatura, post estático)
// com algo selecionado, sai só a seleção (fundo transparente, recortada nela); sem seleção, o quadro todo
async function saveSelectionPng(sel) {
  await document.fonts.ready; await seekVideos(T);
  ensureBounds(sel);
  const bs = sel.map(l => l._bounds).filter(Boolean); if (!bs.length) { toast('A seleção não está na tela'); return; }
  const fxs = sel.some(l => (l.shadow && l.shadow !== 'none') || l.lblur);
  const pad = Math.ceil(Math.max(fxs ? 96 : 8, ...sel.map(l => (strokeSee(l) ? skW(l) : 0) * 1.2)));
  const fw = FW(), fh = H();
  const x0 = Math.max(0, Math.floor(Math.min(...bs.map(o => o.x)) - pad)), y0 = Math.max(0, Math.floor(Math.min(...bs.map(o => o.y)) - pad));
  const x1 = Math.min(fw, Math.ceil(Math.max(...bs.map(o => o.x + o.w)) + pad)), y1 = Math.min(fh, Math.ceil(Math.max(...bs.map(o => o.y + o.h)) + pad));
  if (x1 <= x0 || y1 <= y0) { toast('A seleção está fora do quadro'); return; }
  const c = document.createElement('canvas'); c.width = fw; c.height = fh;
  RT.only = new Set(sel.map(l => l.id));
  try { renderFrame(c.getContext('2d'), T, 1, true); } finally { RT.only = null; needs = true; }
  const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  if (!blob) { toast('Não consegui gerar a imagem'); return; }
  await saveFile(blob, `${outName()}-selecao-${T.toFixed(1).replace('.', ',')}s.png`);
}
async function saveFramePng(mode) {
  pause();
  const sel = mode === 'frame' ? [] : pickedLayers().filter(l => l.visible);
  if (sel.length) return saveSelectionPng(sel);
  const n = slides();
  // carrossel: uma imagem por slide (escolhe a pasta antes de desenhar, enquanto o clique ainda vale)
  let dir = null;
  if (n > 1 && window.showDirectoryPicker) {
    try { dir = await window.showDirectoryPicker({ id:'mola-export', mode:'readwrite' }); }
    catch (e) { if (e && e.name === 'AbortError') return; dir = null; }
  }
  await document.fonts.ready; await seekVideos(T);
  const c = document.createElement('canvas'); c.width = FW(); c.height = H();
  renderFrame(c.getContext('2d'), T, 1, true); needs = true;
  const nm = `${outName()}-${T.toFixed(1).replace('.', ',')}s`;
  if (n < 2) {
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) { toast('Não consegui gerar a imagem'); return; }
    saveFile(blob, `${nm}.png`); return;
  }
  const one = document.createElement('canvas'); one.width = W(); one.height = H();
  const x = one.getContext('2d');
  for (let s = 0; s < n; s++) {
    x.clearRect(0, 0, one.width, one.height); x.drawImage(c, s * W(), 0, W(), H(), 0, 0, W(), H());
    const blob = await new Promise(r => one.toBlob(r, 'image/png'));
    if (!blob) { toast('Não consegui gerar a imagem'); return; }
    await saveOut(dir, blob, `${nm}-${String(s + 1).padStart(2, '0')}.png`);
  }
  toast(dir ? `${n} imagens salvas na pasta "${dir.name}"` : `${n} imagens baixadas, uma por slide`);
}
$('#pngBtn').onclick = () => saveFramePng();
$('#svgBtn').onclick = () => exportSvg();
// imagem estática: Exportar abre a escolha de formatos e variações e sai um PNG por formato, variação e slide
function exportStill() {
  const ex = S.export || {}, rows = varRows();
  const fm = new Set((ex.fmts || [S.format]).filter(f => FORMATS[f])); if (!fm.size) fm.add(S.format);
  let all = !!ex.vars && rows.length > 0;
  const close = () => ov.remove();
  const count = () => fm.size * (all ? rows.length + 1 : 1) * slides();
  const summary = h('p', { class:'hint xsum' });
  const go = h('button', { class:'btn primary', onclick:() => {
    S.export = { ...S.export, fmts:[...fm], vars:all }; autosave(); close();
    runStill(Object.keys(FORMATS).filter(f => fm.has(f)), all ? [null, ...rows] : [null]);
  } });
  const upd = () => {
    const n = count();
    summary.textContent = `${n} imagem${n > 1 ? 'ns' : ''} PNG${slides() > 1 ? ` (carrossel: uma por slide, ${slides()} slides)` : ''}.${n > 1 ? (window.showDirectoryPicker ? ' Você escolhe a pasta onde salvar.' : ' Cada uma baixa separada.') : ''}`;
    go.textContent = n > 1 ? `Exportar ${n} imagens` : 'Exportar PNG';
  };
  const chips = (opts, isOn, onPick) => {
    const w = h('div', { class:'chips' });
    const draw = () => { w.innerHTML = ''; opts.forEach(([k, t]) => w.append(h('button', { class:'chip', 'aria-pressed':String(isOn(k)), onclick:() => { onPick(k); draw(); upd(); } }, [h('span', { text:t })]))); };
    draw(); return w;
  };
  const card = h('div', { class:'files-card xcard', role:'dialog', 'aria-modal':'true', 'aria-label':'Exportar imagem' }, [
    h('div', { class:'files-head' }, [h('h2', { text:'Exportar imagem' }), h('div', { class:'spacer' }), h('button', { class:'btn small ghost', text:'Fechar', onclick:close })]),
    h('h3', { text:'Formatos' }),
    chips(Object.entries(FORMATS).map(([k, f]) => [k, f.label]), k => fm.has(k), k => { if (fm.has(k)) { if (fm.size > 1) fm.delete(k); } else fm.add(k); }),
    h('p', { class:'hint', text:`Cada formato se reorganiza a partir do ${fmtLabel(baseFmt())} (o principal). O que você ajustou num formato fica só nele.` }),
    h('h3', { text:'Variações de texto' }),
    rows.length ? chips([['one', 'Só a atual'], ['all', `Todas (${rows.length + 1})`]], k => (k === 'all') === all, k => { all = k === 'all'; })
      : h('p', { class:'hint', text:'Nenhuma variação ainda. Crie em "Variações", no topo, para exportar várias versões de uma vez.' }),
    summary,
    h('div', { class:'row', style:'justify-content:flex-end' }, [h('button', { class:'btn', text:'Cancelar', onclick:close }), go]),
  ]);
  const ov = h('div', { class:'files xsheet', onpointerdown:e => { if (e.target === ov) close(); }, onkeydown:e => { e.stopPropagation(); if (e.key === 'Escape') close(); } }, [card]);
  document.body.append(ov); upd(); go.focus();
}
async function runStill(fmts, vars) {
  const jobs = []; for (const v of vars) for (const f of fmts) jobs.push({ f, v });
  if (!jobs.length) return;
  const n = slides(), many = jobs.length > 1 || n > 1;
  let dir = null;
  if (many && window.showDirectoryPicker) {
    try { dir = await window.showDirectoryPicker({ id:'mola-export', mode:'readwrite' }); }
    catch (e) { if (e && e.name === 'AbortError') return; dir = null; }
  }
  if (saveT) await flushSave();
  pause(); RT.exporting = true;
  const fmt0 = S.format;
  if (!FORMATS[S.base] && hasContent()) S.base = fmt0; // os outros formatos se reorganizam a partir do aberto
  let done = 0, fail = false;
  try {
    await document.fonts.ready; await videosReady();
    for (const { f, v } of jobs) {
      S.format = f; RT.layout.clear();
      await withVariant(v, async () => {
        await seekVideos(0);
        const c = document.createElement('canvas'); c.width = FW(); c.height = H();
        renderFrame(c.getContext('2d'), 0, 1, true);
        const nm0 = outName(), nm = v ? nm0.replace(/-(\d+x\d+)$/, `-${fileSafe(v.name)}-$1`) : nm0;
        const one = n > 1 ? document.createElement('canvas') : c;
        if (n > 1) { one.width = W(); one.height = H(); }
        for (let s = 0; s < n; s++) {
          if (n > 1) { const x = one.getContext('2d'); x.clearRect(0, 0, one.width, one.height); x.drawImage(c, s * W(), 0, W(), H(), 0, 0, W(), H()); }
          const blob = await new Promise(r => one.toBlob(r, 'image/png'));
          if (!blob) { fail = true; return; }
          await saveOut(many ? dir : null, blob, `${nm}${n > 1 ? '-' + String(s + 1).padStart(2, '0') : ''}.png`); done++;
        }
      });
      if (fail) break;
    }
  } finally { S.format = fmt0; RT.layout.clear(); RT.exporting = false; needs = true; fitStage(); }
  if (fail) { toast('Não consegui gerar a imagem'); return; }
  if (many) toast(dir ? `${done} imagens salvas na pasta "${dir.name}"` : `${done} imagens baixadas`);
}
$('#mClose').onclick = () => { if (RT.exporting) { cancelExport = true; return; } $('#modal').hidden = true; const v = $('#mVideo'); v.pause(); };
$('#mSave').onclick = () => lastExport && saveFile(lastExport.blob, lastExport.fname);

/* ------------ desfoque de movimento (só na exportação): média de quadros dentro do obturador ------------
   Só para a frente a partir do quadro, então o granulado (que muda por quadro) não borra. A média progressiva
   (cada subquadro com alfa 1/(k+1)) mantém exatamente igual o que está parado. */
const MBLUR = { off:{ label:'Nenhum', n:1 }, soft:{ label:'Suave', n:6, sh:.35 }, cine:{ label:'Cinema', n:12, sh:.5 } };
function renderExportFrame(ctx, t) {
  const mb = MBLUR[S.mblur] || MBLUR.off;
  renderFrame(ctx, t, 1, true);
  if (mb.n < 2) return;
  const sub = frameBuf(ctx.canvas, 4), sc = sub.getContext('2d'), dt = mb.sh / fps() / mb.n;
  for (let k = 1; k < mb.n; k++) {
    renderFrame(sc, t + k * dt, 1, true);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(sub, 0, 0); ctx.restore();
  }
}

/* ============================================================
   Mídia pesada: música e vídeo ficam no IndexedDB ('media:<id>'), fora do JSON do projeto
   (o desfazer e o autosave não copiam megabytes a cada mudança). O .json exportado não leva esses arquivos.
   ============================================================ */
const MEDIA = new Map(); // id → objectURL
async function putMedia(file) {
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!(await DB.set('media:' + id, file))) throw new Error('Não sobrou espaço no navegador para guardar esse arquivo');
  MEDIA.set(id, URL.createObjectURL(file));
  return id;
}
async function mediaUrl(id) {
  if (MEDIA.has(id)) return MEDIA.get(id);
  const b = await DB.get('media:' + id); if (!b) return null;
  const u = URL.createObjectURL(b); MEDIA.set(id, u); return u;
}
/* ------------ fotos também ficam fora do JSON: L.src = 'img:<id>' aponta para 'media:<id>' (getImage resolve).
   Arquivos antigos (foto em dataURL) são convertidos ao abrir; o .json exportado volta a levar as fotos dentro ------------ */
const isRef = s => typeof s === 'string' && s.startsWith('img:');
async function srcUrl(src) { return isRef(src) ? mediaUrl(src.slice(4)) : src; }
async function putImage(blob) { return 'img:' + await putMedia(blob); }
async function imageSrc(f) { try { return await putImage(f); } catch (e) { return readAs(f, 'readAsDataURL'); } }
const IMG_KEYS = L => [[L, 'src'], [L.cut, 'orig'], [L.cut, 'mask']].filter(([o, k]) => o && typeof o[k] === 'string');
async function internImages(st) {
  let n = 0;
  for (const L of (st && st.layers) || []) for (const [o, k] of IMG_KEYS(L)) {
    if (!o[k].startsWith('data:image/') || o[k].length < 60000) continue;
    try { o[k] = await putImage(await (await fetch(o[k])).blob()); n++; } catch (e) {}
  }
  return n;
}
async function portableState() {
  const st = JSON.parse(JSON.stringify(S));
  for (const L of st.layers) for (const [o, k] of IMG_KEYS(L)) if (isRef(o[k])) { const b = await DB.get('media:' + o[k].slice(4)); if (b) o[k] = await readAs(b, 'readAsDataURL'); }
  return st;
}
// mídia que nenhum arquivo usa mais (arquivo apagado, recorte refeito) sai do navegador. Roda uma vez, depois de abrir
async function gcMedia() {
  try {
    const db = await DB.open();
    const keys = await new Promise(res => { const q = db.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
    const ids = keys.filter(k => typeof k === 'string' && k.startsWith('media:')).map(k => k.slice(6)); if (!ids.length) return;
    let txt = JSON.stringify(S) + undoStack.join('') + redoStack.join('') + JSON.stringify((await DB.get('elements')) || []);
    for (const k of keys) if (typeof k === 'string' && k.startsWith('file:')) txt += (await DB.get(k)) || '';
    for (const id of ids) if (!txt.includes(id)) { await DB.del('media:' + id); const u = MEDIA.get(id); if (u) { URL.revokeObjectURL(u); MEDIA.delete(id); } }
  } catch (e) {}
}

/* ------------ vídeo dentro da camada de imagem: L.video = id da mídia, L.src = pôster (1º quadro).
   Mudo, repete se for mais curto que a camada. Um elemento <video> por camada ------------ */
const VIDS = new Map(); // id da camada → { el, ok, media }
function videoEl(L) {
  let v = VIDS.get(L.id);
  if (v && v.media !== L.video) { v.el.removeAttribute('src'); v.el.load(); VIDS.delete(L.id); v = null; }
  if (!v) {
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    Object.defineProperty(el, 'naturalWidth', { get:() => el.videoWidth });
    Object.defineProperty(el, 'naturalHeight', { get:() => el.videoHeight });
    v = { el, ok:false, media:L.video }; VIDS.set(L.id, v);
    el.addEventListener('loadeddata', () => { v.ok = true; needs = true; });
    el.addEventListener('seeked', () => { needs = true; });
    mediaUrl(L.video).then(u => { if (u) el.src = u; else v.missing = true; });
  }
  return v.ok ? v.el : null;
}
// corte: L.vIn/L.vOut = trecho do vídeo em segundos (ausente = do começo / até o fim); o trecho repete se a camada for mais longa
function vidCut(L, el) {
  const d = (el && el.duration) || L.vdur || 1, a = clamp(L.vIn || 0, 0, Math.max(0, d - .1));
  return { a, b:clamp(L.vOut ?? d, a + .1, d), d };
}
function vidTime(L, t, el) {
  const { a, b } = vidCut(L, el), len = b - a, vt = Math.max(0, t - L.start);
  return a + (vt < len - .02 ? vt : vt % len);
}
// a camada dura o trecho (como um clipe num editor de vídeo): o fim da barra acompanha o corte
function vidFitEnd(o) {
  const { a, b } = vidCut(o); o.end = +Math.min(S.duration, o.start + b - a).toFixed(3);
}
// borda da barra na timeline = corte. v = estado no começo do arrasto ({ a, b, d, s, e } de vidCut + barra).
// Esquerda: o vídeo fica parado no tempo e o começo do trecho anda junto. Direita: o fim do trecho segue a barra;
// passou do fim do vídeo = trecho até o fim, repetindo. Se a camada já era mais longa que o trecho (repetindo), a direita não corta.
function vidTrim(o, v, mode) {
  if (mode === 'l') { const a = clamp(v.a + o.start - v.s, 0, v.b - .1); if (a > 1e-3) o.vIn = +a.toFixed(3); else delete o.vIn; }
  else if (mode === 'r' && v.e - v.s <= v.b - v.a + .05) { const b = v.a + (o.end ?? S.duration) - o.start; if (b < v.d - 1e-3) o.vOut = +b.toFixed(3); else delete o.vOut; }
}
// prévia: toca junto quando o palco toca; pausado, fica no quadro da agulha
function syncVideos() {
  for (const [id, v] of VIDS) {
    const L = S.layers.find(l => l.id === id);
    if (!L || L.video !== v.media) { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); VIDS.delete(id); continue; }
    const el = v.el; if (!v.ok) continue;
    if (!L.visible || !phase(L, T) || RT.exporting) { if (!el.paused) el.pause(); continue; }
    const vt = vidTime(L, T, el);
    if (playing) {
      if (el.paused) el.play().catch(() => {});
      // tocando sozinho o <video> passaria do fim do corte antes de a conta dar a volta
      if (Math.abs(el.currentTime - vt) > .25 || el.currentTime > vidCut(L, el).b + .02) el.currentTime = vt;
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - vt) > .02 && !el.seeking) el.currentTime = vt;
    }
  }
}
// exportação e PNG: cada vídeo exatamente no quadro t
async function seekVideos(t) {
  const jobs = [];
  for (const L of S.layers) {
    if (!L.video || L.type !== 'image' || !L.visible || !phase(L, t)) continue;
    const v = VIDS.get(L.id); if (!v || !v.ok) continue;
    const el = v.el; if (!el.paused) el.pause();
    const vt = vidTime(L, t, el); if (Math.abs(el.currentTime - vt) < .0005 && !el.seeking) continue;
    jobs.push(new Promise(res => { let ok = false; const fin = () => { if (ok) return; ok = true; el.removeEventListener('seeked', fin); res(); }; el.addEventListener('seeked', fin); el.currentTime = vt; setTimeout(fin, 2500); }));
  }
  await Promise.all(jobs);
}
async function videosReady() {
  const ls = S.layers.filter(L => L.video && L.type === 'image' && L.visible); ls.forEach(L => videoEl(L));
  const t0 = performance.now();
  while (ls.some(L => { const v = VIDS.get(L.id); return v && !v.ok && !v.missing; }) && performance.now() - t0 < 8000) await sleep(50);
}
function videoPoster(url) {
  return new Promise((res, rej) => {
    const el = document.createElement('video'); el.muted = true; el.preload = 'auto';
    el.onerror = () => rej(new Error('Não consegui abrir esse vídeo. Tente MP4 (H.264) ou WebM.'));
    el.onloadeddata = () => { el.currentTime = Math.min(.1, (el.duration || 1) / 2); };
    el.onseeked = () => {
      const k = Math.min(1, 720 / el.videoWidth), c = document.createElement('canvas');
      c.width = Math.round(el.videoWidth * k); c.height = Math.round(el.videoHeight * k);
      c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
      res({ src:c.toDataURL('image/jpeg', .82), w:el.videoWidth, h:el.videoHeight, dur:el.duration });
    };
    el.src = url;
  });
}
const isVid = f => f && /^video\//.test(f.type);
const isAud = f => f && (/^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name || ''));
async function addVideoFile(f, pos) {
  if (!f) return;
  toast('Abrindo o vídeo…');
  try {
    const id = await putMedia(f), p = await videoPoster(await mediaUrl(id)), size = .8;
    const L = mkImage({ name:f.name ? f.name.replace(/\.[^.]+$/, '') : 'Vídeo', video:id, src:p.src, vdur:p.dur, mask:'rect', radius:24, size, mh:+(size * p.h / p.w).toFixed(4), in:'fade', inDur:BP.fade.dur, y:.5 });
    await getImage(L.src);
    addLayer(L, pos || {});
    const e0 = L.end ?? S.duration; vidFitEnd(L); L.end = Math.min(L.end, e0); changed({ layers:true, props:true }); // a barra do vídeo começa do tamanho dele (dentro de um frame, no máximo a dele)
    toast(p.dur > S.duration - L.start + .05 ? `Vídeo adicionado. Ele tem ${fmtSec(p.dur)} e passa do fim: puxe a borda da barra para cortar` : 'Vídeo adicionado');
  } catch (e) { toast(e.message || 'Não consegui abrir esse vídeo'); }
}

/* ============================================================
   Trilha: música (batidas detectadas) e efeitos sonoros automáticos nas entradas
   S.audio = { id, name, dur, vol, from:'zero'|'beat'|'peak', bpm, beats:[s na música], peaks:[0..1 a cada 0,1 s], firstLoud, peakAt }
   S.sfx = 'off' | 'soft' | 'punchy'. A mistura é feita num OfflineAudioContext: igual na prévia e no MP4.
   ============================================================ */
const MUSIC = new Map(); // id da mídia → AudioBuffer
async function musicBuffer(id) {
  if (MUSIC.has(id)) return MUSIC.get(id);
  const u = await mediaUrl(id); if (!u) return null;
  const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await (await fetch(u)).arrayBuffer());
  MUSIC.set(id, buf); return buf;
}
// batidas: força de ataque (subidas de energia, graves pesam mais) → andamento por autocorrelação → fase da grade
async function analyzeMusic(buf) {
  const sr = buf.sampleRate, n = buf.length, hop = Math.round(sr / 100), F = Math.floor(n / hop);
  const off = new OfflineAudioContext(1, n, sr), src = off.createBufferSource(), lp = off.createBiquadFilter();
  src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 160; src.connect(lp); lp.connect(off.destination); src.start();
  const low = (await off.startRendering()).getChannelData(0), chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const eF = new Float32Array(F), eL = new Float32Array(F);
  for (let f = 0; f < F; f++) {
    let a = 0, b = 0;
    for (let i = f * hop, e = i + hop; i < e; i++) { let s = 0; for (const c of chs) s += c[i]; s /= chs.length; a += s * s; b += low[i] * low[i]; }
    eF[f] = a / hop; eL[f] = b / hop;
  }
  const lg = v => Math.log(1e-7 + v), on = new Float32Array(F), on2 = new Float32Array(F);
  for (let f = 1; f < F; f++) on[f] = Math.max(0, lg(eL[f]) - lg(eL[f - 1])) + .6 * Math.max(0, lg(eF[f]) - lg(eF[f - 1]));
  let acc = 0; const WN = 30;
  for (let f = 0; f < F; f++) { acc += on[f]; if (f >= WN) acc -= on[f - WN]; on2[f] = Math.max(0, on[f] - acc / Math.min(f + 1, WN)); }
  const lo = Math.round(6000 / 180), hi = Math.round(6000 / 70), ac = new Float32Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let s = 0; for (let f = 0; f + L < F; f++) s += on2[f] * on2[f + L]; ac[L] = s; }
  let best = -1, bl = 50;
  for (let L = lo; L <= hi; L++) { const bpm = 6000 / L, w = Math.exp(-.5 * Math.pow(Math.log2(bpm / 120) / .8, 2)), v = ac[L] * w; if (v > best) { best = v; bl = L; } }
  const y0 = ac[bl - 1], y1 = ac[bl], y2 = ac[bl + 1], dd = y0 - 2 * y1 + y2, per = bl + (dd ? clamp(.5 * (y0 - y2) / dd, -.5, .5) : 0);
  let bp = 0, bs = -1;
  for (let p = 0; p < Math.ceil(per); p++) { let s = 0; for (let x = p; x < F; x += per) { const i = Math.round(x); s += (on2[i] || 0) + .5 * ((on2[i - 1] || 0) + (on2[i + 1] || 0)); } if (s > bs) { bs = s; bp = p; } }
  const beats = []; for (let x = bp; x < F; x += per) beats.push(Math.round(x * hop / sr * 1000) / 1000);
  // energia a cada 0,1 s (desenho da onda na timeline e escolha do começo)
  const bins = Math.ceil(F / 10), rms = new Float32Array(bins); let mx = 1e-9;
  for (let b = 0; b < bins; b++) { let s = 0, k = 0; for (let f = b * 10; f < Math.min(F, b * 10 + 10); f++) { s += eF[f]; k++; } rms[b] = Math.sqrt(s / Math.max(1, k)); mx = Math.max(mx, rms[b]); }
  const peaks = [...rms].map(v => Math.round(v / mx * 100) / 100);
  const firstLoud = beats.find(b => (peaks[Math.floor(b * 10)] || 0) > .3) ?? 0;
  let peakAt = 0, pv = -1;
  for (let b = 0; b + 40 <= bins; b++) { let s = 0; for (let k = b; k < b + 40; k++) s += peaks[k]; if (s > pv) { pv = s; peakAt = b / 10; } }
  const before = beats.filter(b => b <= peakAt + .05);
  return { bpm:Math.round(6000 / per), beats, peaks, firstLoud, peakAt:before.length ? before[before.length - 1] : 0 };
}
async function setMusicFile(f) {
  if (!f) return;
  toast('Analisando a música…', 10000);
  try {
    const id = await putMedia(f), buf = await musicBuffer(id), an = await analyzeMusic(buf);
    pushUndo();
    S.audio = { id, name:(f.name || 'Música').replace(/\.[^.]+$/, ''), dur:+buf.duration.toFixed(3), vol:.8, from:'beat', bpm:an.bpm, beats:an.beats, peaks:an.peaks, firstLoud:an.firstLoud, peakAt:an.peakAt };
    changed(); renderAudio(); renderTimeline();
    toast(`${S.audio.name}: ${an.bpm} bpm. A timeline agora gruda nas batidas.`, 4000);
  } catch (e) { console.warn(e); toast('Não consegui ler esse áudio. Tente MP3, WAV ou M4A.'); }
}
// onde a música começa: do início, na primeira batida com som ou na parte mais forte
const audioSkip = () => { const A = S.audio; return !A ? 0 : A.from === 'beat' ? A.firstLoud || 0 : A.from === 'peak' ? A.peakAt || 0 : 0; };
// batidas no tempo do vídeo (a música repete se for mais curta)
function beatTimes() {
  const A = S.audio; if (!A || !A.beats || !A.beats.length) return [];
  const sk = audioSkip(), len = A.dur - sk, d = S.duration, out = [];
  for (let loop = 0; loop < 30 && len > .5; loop++) for (const b of A.beats) { if (b < sk) continue; const t = loop * len + b - sk; if (t > d) return out; out.push(+t.toFixed(3)); }
  return out;
}
// ímã extra da timeline: batidas e o meio das transições (onde a tela está coberta)
const extraSnaps = ex => [...beatTimes(), ...S.layers.filter(l => l.type === 'fx' && l.visible && l !== ex).map(l => (l.start + (l.end ?? S.duration)) / 2)];
// Encaixar na batida: cada elemento entra na batida mais próxima (transição: o meio dela). Quem começa com o vídeo fica.
function snapToBeats() {
  const bt = beatTimes(); if (bt.length < 2) { toast('Envie uma música primeiro'); return; }
  pushUndo();
  const near = v => bt.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  let n = 0;
  for (const L of S.layers) {
    if (L.type === 'bg' || L.start < .05) continue;
    const end = L.end ?? S.duration, anchor = L.type === 'fx' ? (L.start + end) / 2 : L.start, d = near(anchor) - anchor;
    if (Math.abs(d) < .005) continue;
    const toEnd = end >= S.duration - .01;
    L.start = +clamp(L.start + d, 0, S.duration - .3).toFixed(3);
    if (!toEnd) L.end = +clamp(end + d, L.start + .2, S.duration).toFixed(3);
    n++;
  }
  changed({ layers:true, props:true }); renderTimeline();
  toast(n ? `${n} elemento${n > 1 ? 's' : ''} no ritmo da música` : 'Tudo já estava na batida', 4000, UNDO_ACT);
}
/* efeitos: o som vem do preset de entrada (deslizes = sopro, molas = pop, digitação = cliques, desenho = brilho) */
const SFX = { off:'Nenhum', soft:'Sutis', punchy:'Marcantes' };
function sfxKind(L) {
  if (L.type === 'fx') return L.fx === 'flash' ? 'shine' : 'whoosh';
  if (L.type === 'camera') return L.cam === 'punch' || L.cam === 'shake' ? 'boom' : null;
  const k = L.in || ''; if (!k || k === 'cut' || k === 'fade') return null;
  if (/^(pop|spring|stamp|elastic|flip|spin|drop|bounce)/.test(k)) return 'pop';
  if (/^(type|counter|scramble|glitch)/.test(k)) return 'tick';
  if (/^(handwrite|draw|assemble|line)/.test(k)) return 'shine';
  return 'whoosh';
}
function sfxEvents() {
  const ev = [];
  for (const L of S.layers) {
    if (!L.visible || L.type === 'bg') continue;
    const kind = sfxKind(L); if (!kind) continue;
    const ph = phase(L, L.start) || { inD:.5 }, span = (L.end ?? S.duration) - L.start;
    if (kind === 'tick') { const n = clamp(Math.round(((L.text || '').length || 8) * .6), 3, 18); for (let i = 0; i < n; i++) ev.push({ t:L.start + Math.max(.3, ph.inD) * .9 * i / n, kind, i }); }
    else ev.push({ t:L.start, kind, d:L.type === 'fx' ? span : Math.max(.3, ph.inD), mid:L.type === 'fx', i:0 });
  }
  ev.sort((a, b) => a.t - b.t);
  // o mesmo som ao mesmo tempo (grupo entrando junto) toca uma vez só
  return ev.filter((e, i) => e.kind === 'tick' || !ev.slice(Math.max(0, i - 6), i).some(o => o.kind === e.kind && Math.abs(o.t - e.t) < .06));
}
function sfxNoise(ctx) {
  const n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rand(i, 17) * 2 - 1;
  return b;
}
function playSfx(ctx, out, noise, e) {
  const t = Math.max(0, e.t), g = ctx.createGain(); g.connect(out);
  const env = (a, peak, dec) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); };
  if (e.kind === 'whoosh') {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), d = clamp(e.d || .5, .3, 1.2);
    const a = e.mid ? d * .5 : .07, dec = e.mid ? d * .5 : d * .8;
    s.buffer = noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2600, t + a); f.frequency.exponentialRampToValueAtTime(700, t + a + dec);
    s.connect(f); f.connect(g); env(a, .6, dec); s.start(t); s.stop(t + a + dec + .05);
  } else if (e.kind === 'pop') {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(170, t + .1);
    o.connect(g); env(.004, .7, .16); o.start(t); o.stop(t + .25);
  } else if (e.kind === 'tick') {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(); s.buffer = noise; f.type = 'highpass'; f.frequency.value = 2500 + (e.i % 3) * 400;
    s.connect(f); f.connect(g); env(.001, .35, .035); s.start(t, rand(e.i, 5) * .5); s.stop(t + .06);
  } else if (e.kind === 'boom') {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + .45);
    o.connect(g); env(.006, 1, .55); o.start(t); o.stop(t + .7);
  } else if (e.kind === 'shine') {
    [1320, 1980, 2640].forEach((fr, i) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = fr; og.gain.value = [.5, .3, .15][i]; o.connect(og); og.connect(g); o.start(t + i * .04); o.stop(t + 1.3); });
    env(.02, .28, 1.1);
  }
}
const hasAudio = () => !!(S.audio && S.audio.id) || (!!S.sfx && S.sfx !== 'off');
async function buildMix(sr = 48000) {
  const d = S.duration, off = new OfflineAudioContext(2, Math.ceil(d * sr), sr), A = S.audio;
  if (A && A.id) {
    const buf = await musicBuffer(A.id);
    if (buf) {
      const sk = clamp(audioSkip(), 0, Math.max(0, buf.duration - .5)), s = off.createBufferSource(), g = off.createGain(), v = A.vol ?? .8, fo = Math.min(1.2, d * .2);
      s.buffer = buf; if (buf.duration - sk < d) { s.loop = true; s.loopStart = sk; s.loopEnd = buf.duration; }
      // entra sem estalo e sai em fade no fim do vídeo
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(v, .04); g.gain.setValueAtTime(v, Math.max(.05, d - fo)); g.gain.linearRampToValueAtTime(0, d);
      s.connect(g); g.connect(off.destination); s.start(0, sk);
    }
  }
  if (S.sfx && S.sfx !== 'off') {
    const out = off.createGain(), comp = off.createDynamicsCompressor(), noise = sfxNoise(off);
    out.gain.value = S.sfx === 'punchy' ? .9 : .4; out.connect(comp); comp.connect(off.destination);
    for (const e of sfxEvents()) if (e.t < d) playSfx(off, out, noise, e);
  }
  return off.startRendering();
}
async function pickAudio(sr) {
  if (!('AudioEncoder' in window)) return null;
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate:sr, numberOfChannels:2, bitrate:192000 };
    try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { cfg, mux }; } catch (e) {}
  }
  return null;
}
async function encodeAudio(buf, pick) {
  const chunks = []; let err = null;
  const enc = new AudioEncoder({ output:(c, m) => chunks.push([c, m]), error:e => { err = e; } });
  enc.configure(pick.cfg);
  const sr = buf.sampleRate, n = buf.length, step = 4800, L0 = buf.getChannelData(0), R0 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L0;
  for (let i = 0; i < n; i += step) {
    const m = Math.min(step, n - i), data = new Float32Array(m * 2);
    data.set(L0.subarray(i, i + m), 0); data.set(R0.subarray(i, i + m), m);
    const ad = new AudioData({ format:'f32-planar', sampleRate:sr, numberOfFrames:m, numberOfChannels:2, timestamp:Math.round(i * 1e6 / sr), data });
    enc.encode(ad); ad.close();
    if (err) throw err;
    if (enc.encodeQueueSize > 20) await sleep(0);
  }
  await enc.flush(); enc.close(); if (err) throw err;
  return chunks;
}
/* prévia: a mistura toca junto com o palco e a agulha segue o relógio do áudio (sem deriva entre som e imagem) */
const AUD = { ctx:null, src:null, buf:null, sig:'', chk:0, building:false, c0:0, t0:0 };
function audioSig() {
  const A = S.audio, fx = S.sfx && S.sfx !== 'off';
  return JSON.stringify([S.duration, A ? [A.id, A.vol, A.from] : 0, S.sfx || 'off', fx ? S.layers.map(l => [l.visible, l.type, l.start, l.end, l.in, l.inDur, l.speed, l.cam, l.fx, l.text && l.text.length]) : 0]);
}
async function rebuildMix(sig) {
  AUD.building = true;
  try { AUD.buf = await buildMix(48000); } catch (e) { console.warn('trilha', e); AUD.buf = null; }
  AUD.sig = sig; AUD.building = false; stopAudio();
}
function stopAudio() { if (!AUD.src) return; try { AUD.src.stop(); } catch (e) {} try { AUD.src.disconnect(); } catch (e) {} AUD.src = null; }
function startAudioAt(t) {
  stopAudio();
  const s = AUD.ctx.createBufferSource(); s.buffer = AUD.buf; s.connect(AUD.ctx.destination);
  const off = clamp(t, 0, Math.max(0, AUD.buf.duration - .01));
  s.start(0, off); AUD.src = s; AUD.c0 = AUD.ctx.currentTime; AUD.t0 = off;
}
function syncAudio() {
  if (!playing || RT.exporting || !hasAudio()) { stopAudio(); return; }
  const now = performance.now();
  if (now - AUD.chk > 300) { AUD.chk = now; const sig = audioSig(); if (sig !== AUD.sig && !AUD.building) rebuildMix(sig); }
  if (!AUD.buf) return;
  if (!AUD.ctx) AUD.ctx = new AudioContext();
  if (AUD.ctx.state !== 'running') { if (!AUD.resuming) { AUD.resuming = true; AUD.ctx.resume().catch(() => {}).finally(() => { AUD.resuming = false; }); } return; }
  const pos = AUD.src ? AUD.t0 + AUD.ctx.currentTime - AUD.c0 : null;
  if (pos == null || Math.abs(pos - T) > .15) { startAudioAt(T); return; }
  if (pos < S.duration) T = pos;
}
function syncMedia() { syncVideos(); syncAudio(); }
// o navegador só libera o som depois de um clique ou tecla
const unlockAudio = () => { if (!hasAudio()) return; if (!AUD.ctx) AUD.ctx = new AudioContext(); if (AUD.ctx.state !== 'running') AUD.ctx.resume().catch(() => {}); };
addEventListener('pointerdown', unlockAudio, true); addEventListener('keydown', unlockAudio, true);

/* ============================================================
   Interface
   ============================================================ */
const ICONS = {
  eye:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeOff:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 2l12 12M6.5 4Q7.2 3.5 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.8 2.3M10.4 11.7Q9.3 12.5 8 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 0 1 2.5-3"/></svg>',
  lock:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/></svg>',
  unlock:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.8-.9"/></svg>',
  up:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10l4-4 4 4"/></svg>',
  down:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg>',
  trash:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
  copy:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5V3.8C3 3.4 3.4 3 3.8 3h6.7"/></svg>',
};
// RT.picks = todas as camadas selecionadas (Shift + clique soma ou tira); RT.selected = a principal (painel de propriedades)
// Grupo: as camadas com o mesmo `grp` se selecionam juntas. Ctrl + clique (`only`) escolhe uma só de dentro do grupo.
const groupOf = L => L && L.grp ? gleaves(gtop(L.grp)) : [L];
// id do grupo quando a seleção é o grupo inteiro (e só ele); um item escolhido sozinho (timeline, Ctrl + clique) não conta
const itemSel = () => !!RT.itemPicks && RT.itemPicks === RT.picks; // itens escolhidos um a um: não valem como o grupo, mesmo que sejam todos
function wholeGroup() {
  const L = selL(); if (!L || !L.grp) return null;
  if (itemSel()) return null; // itens escolhidos um a um (mesmo que sejam todos do grupo): continuam itens, não viram o grupo
  const pk = pickedLayers(), chain = []; for (let g = L.grp, n = 0; g && n < 20; g = gpar(g), n++) chain.unshift(g);
  for (const g of chain) { const lv = gleaves(g); if (lv.length >= 2 && lv.every(m => isPicked(m.id)) && pk.every(p => lv.includes(p))) return g; } // do frame de fora para o de dentro
  return null;
}
// o grupo com cara de camada para os controles do painel (id próprio, tempo do conjunto); o que se escreve vai para S.groups[gid]
function gview(gid) {
  const g = gmeta(gid, true);
  g.in ??= 'cut'; g.out ??= 'cut'; g.idle ??= 'none'; g.inDur ??= .8; g.outDur ??= .5;
  return new Proxy(g, { get:(t, k) => k === 'id' ? 'g-' + gid : k === '__g' ? gid : k === 'start' ? (gwin(gid) || {}).start : k === 'end' ? (gwin(gid) || {}).end : t[k] });
}
function select(id, only) {
  RT.selected = id; const L = S.layers.find(l => l.id === id);
  RT.picks = new Set(!only && L && L.grp ? groupOf(L).map(l => l.id) : [id]);
  RT.itemPicks = only && L && L.grp ? RT.picks : null;
  renderLayers(); renderProps(); needs = true;
}
function selL() { return S.layers.find(l => l.id === RT.selected); }
function isPicked(id) { return id === RT.selected || !!(RT.picks && RT.picks.has(id)); }
function pickedLayers() {
  const out = S.layers.filter(l => l.type !== 'bg' && isPicked(l.id));
  return out.length ? out : [selL()].filter(l => l && l.type !== 'bg');
}
// bloqueada (L.locked): não se move, escala nem muda de tempo com o mouse ou o teclado, e o palco a ignora (clique, área, mouse por cima). Os campos do painel continuam valendo
const freePicked = () => pickedLayers().filter(l => !l.locked);
function setLock(ls, on) { ls = ls.filter(l => l.type !== 'bg'); if (!ls.length) return; pushUndo(); ls.forEach(l => { l.locked = on || undefined; }); changed({ layers:true }); }
function toggleLock() { const ls = pickedLayers(); if (ls.length) setLock(ls, !ls.every(l => l.locked)); }
function lockedNote(ls) {
  ls = (Array.isArray(ls) ? ls : [ls]).filter(l => l.locked); if (!ls.length) return false;
  toast(ls.length > 1 ? `${ls.length} camadas bloqueadas` : `${ls[0].name} está bloqueada`, 4000, { label:'Desbloquear', fn:() => setLock(ls, false) });
  return true;
}
function toggleSel(L) {
  if (L.type === 'bg') return select(L.id);
  const cur = RT.picks && RT.picks.size ? new Set([...RT.picks].filter(id => S.layers.some(l => l.id === id))) : new Set();
  cur.add(RT.selected);
  const mem = groupOf(L).map(l => l.id);
  const itemWise = !!L.grp && (mem.some(id => cur.has(id)) && !mem.every(id => cur.has(id)) || (RT.itemPicks && RT.itemPicks === RT.picks)); // item a item dentro do grupo: não vira o grupo ao completar
  // parte do grupo já escolhida (item de dentro): Shift soma ou tira só o item clicado, não o grupo inteiro
  if (L.grp && mem.some(id => cur.has(id)) && !mem.every(id => cur.has(id))) {
    if (cur.has(L.id) && cur.size > 1) { cur.delete(L.id); if (RT.selected === L.id) RT.selected = [...cur].pop(); }
    else if (!cur.has(L.id)) { cur.add(L.id); RT.selected = L.id; }
  } else if (cur.has(L.id) && cur.size > mem.length) { mem.forEach(id => cur.delete(id)); if (!cur.has(RT.selected)) RT.selected = [...cur].pop(); }
  else { mem.forEach(id => cur.add(id)); RT.selected = L.id; }
  const bg = S.layers.find(l => l.type === 'bg'); if (bg && cur.size > 1) cur.delete(bg.id);
  RT.picks = cur; RT.itemPicks = itemWise ? cur : null;
  renderLayers(); renderProps(); needs = true;
}

/* ------------ alinhar e agrupar ------------ */
// recalcula a posição de repouso de cada camada (o _bounds só existe para quem está na tela no quadro atual)
// quiet: sem pedir novo quadro (usado no meio do desenho, para a caixa dos grupos)
function ensureBounds(ls, quiet) {
  const miss = ls.filter(l => l.visible);
  if (!miss.length) return;
  const cx = document.createElement('canvas').getContext('2d'); cx.canvas.width = cx.canvas.height = 8;
  const was = RT.noGrp; RT.noGrp = true; // a posição de repouso não depende da animação do grupo
  try { for (const L of miss) renderFrame(cx, restTime(L), 8 / W(), false); } finally { RT.noGrp = was; }
  if (!quiet) needs = true;
}
// um grupo escolhido inteiro conta como um bloco só (o de fora mais alto que está todo na seleção);
// itens escolhidos um a um (itemSel) ou só parte do grupo alinham cada um por si
function selUnits(ls) {
  const map = new Map(), set = new Set(ls), item = itemSel();
  const unitOf = L => { let k = L.id; if (!item) for (let g = L.grp, n = 0; g && n < 20; g = gpar(g), n++) if (gleaves(g).every(o => set.has(o))) k = g; return k; };
  for (const L of ls) if (L._bounds) { const k = unitOf(L); if (!map.has(k)) map.set(k, []); map.get(k).push(L); }
  return [...map.values()].map(m => ({ m,
    x0:Math.min(...m.map(l => l._bounds.x)), y0:Math.min(...m.map(l => l._bounds.y)),
    x1:Math.max(...m.map(l => l._bounds.x + l._bounds.w)), y1:Math.max(...m.map(l => l._bounds.y + l._bounds.h)) }));
}
// mode: l | ch | r | t | cv | b | dh | dv. Um bloco só alinha ao quadro; vários alinham entre si.
function alignLayers(mode) {
  const all = pickedLayers(), ls = all.filter(l => !l.locked);
  if (!ls.length) { lockedNote(all); return; }
  if (ls.every(l => inFlow(l) && !flowWhole(l.grp, ls))) { toast('Está no layout automático: quem alinha é o grupo (selecione o grupo inteiro)'); return; }
  if (S.flow && RT.frameIds && ls.every(l => RT.frameIds.has(l.id)) && (['t', 'cv', 'b', 'dv'].includes(mode) || (S.flow.align || 'keep') !== 'keep')) { toast('Layout do quadro ligado: a posição vem da coluna (clique no vazio para ver as opções)'); return; }
  ensureBounds(ls);
  const U = selUnits(ls); if (!U.length) return;
  // um bloco só alinha à margem (ou ao quadro) do slide em que está
  const ref = U.length > 1 ? { x0:Math.min(...U.map(u => u.x0)), y0:Math.min(...U.map(u => u.y0)), x1:Math.max(...U.map(u => u.x1)), y1:Math.max(...U.map(u => u.y1)) } : areaAt((U[0].x0 + U[0].x1) / 2);
  const d = new Map();
  if (mode === 'dh' || mode === 'dv') {
    if (U.length < 3) return;
    const hz = mode === 'dh', a = hz ? 'x0' : 'y0', z = hz ? 'x1' : 'y1', o = [...U].sort((p, q) => p[a] + p[z] - q[a] - q[z]);
    const gap = (o[o.length - 1][z] - o[0][a] - o.reduce((n, u) => n + u[z] - u[a], 0)) / (o.length - 1);
    let pos = o[0][a]; for (const u of o) { d.set(u, pos - u[a]); pos += u[z] - u[a] + gap; }
  } else for (const u of U) d.set(u, {
    l:ref.x0 - u.x0, ch:(ref.x0 + ref.x1 - u.x0 - u.x1) / 2, r:ref.x1 - u.x1,
    t:ref.y0 - u.y0, cv:(ref.y0 + ref.y1 - u.y0 - u.y1) / 2, b:ref.y1 - u.y1 }[mode]);
  const horiz = ['l', 'ch', 'r', 'dh'].includes(mode);
  pushUndo();
  for (const u of U) { const v = d.get(u); for (const L of u.m) {
    const b = L._bounds;
    if (horiz) { setPos(L, +clampPos((b.x + b.w / 2 + v) / W()).toFixed(4), null); b.x += v; }
    else { setPos(L, null, +clampPos((b.y + b.h / 2 + v) / H()).toFixed(4)); b.y += v; }
  } }
  changed({ props:true });
}
function groupSel() {
  const ms = S.layers.filter(l => l.type !== 'bg' && isPicked(l.id)); if (ms.length < 2) return;
  pushUndo();
  // frames inteiros na seleção ficam como estão e passam a ser filhos do novo grupo
  const whole = [...new Set(ms.filter(l => l.grp).map(l => gtop(l.grp)))].filter(t => gleaves(t).every(l => ms.includes(l)));
  const ng = 'g' + Math.random().toString(36).slice(2, 7);
  (S.groups ||= {})[ng] = { open:true };
  const loose = ms.filter(l => !l.grp || !whole.includes(gtop(l.grp)));
  // só parte de um grupo escolhida: o novo grupo nasce dentro dele, o grupo de fora continua
  const outer = new Set(loose.map(l => l.grp || null));
  if (!whole.length && outer.size === 1 && [...outer][0]) S.groups[ng].parent = [...outer][0];
  whole.forEach(t => { gmeta(t, true).parent = ng; });
  loose.forEach(l => { l.grp = ng; });
  if (loose.length > 1 || (loose.length && whole.length)) { // fica junto na pilha, na altura do que está mais à frente
    const top = Math.max(...loose.map(l => S.layers.indexOf(l)));
    S.layers = [...S.layers.slice(0, top + 1).filter(l => !loose.includes(l)), ...loose, ...S.layers.slice(top + 1)];
  }
  RT.picks = new Set(ms.map(l => l.id)); if (!RT.picks.has(RT.selected)) RT.selected = ms[ms.length - 1].id;
  changed({ layers:true, props:true }); toast(`${ms.length} elementos agrupados. Ctrl+Shift+G desfaz`);
}
function ungroupSel() {
  const w = wholeGroup();
  if (w && gkids(w).length) { // frame com frames dentro: desmancha só o de fora
    pushUndo(); keepPlace(() => { gkids(w).forEach(k => { delete S.groups[k].parent; }); S.layers.forEach(l => { if (l.grp === w) delete l.grp; }); delete S.groups[w]; });
    changed({ layers:true, props:true }); toast('Frame desfeito: os de dentro continuam'); return;
  }
  const ids = new Set(pickedLayers().map(l => l.grp).filter(Boolean)); if (!ids.size) return;
  pushUndo(); keepPlace(() => { S.layers.forEach(l => { if (ids.has(l.grp)) delete l.grp; }); ids.forEach(g => { if (S.groups) delete S.groups[g]; }); });
  changed({ layers:true, props:true }); toast('Grupo desfeito');
}
/* ------------ Pathfinder (como no Figma): Unir, Subtrair, Interseção, Excluir e Achatar ------------
   Vale para formas (qualquer tipo; retângulo, círculo etc. viram vetor). As contas são do paper.js (vendor/paper-core.min.js, só as operações
   booleanas, em curvas de verdade). O resultado é uma forma Vetor só, na posição de agora, com o estilo e o tempo da forma de baixo
   (a que serve de base no Subtrair) e no lugar da forma de cima da pilha. Tudo é medido na tela do formato aberto, sem a câmera. */
const PF_SVG = p => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">${p}</svg>`;
const PF_OPS = [
  ['union', 'Unir', 'Alt + Shift + U', 'unite', PF_SVG('<path fill="currentColor" d="M2 2h8v4h4v8H6v-4H2z"/>')],
  ['subtract', 'Subtrair', 'Alt + Shift + S', 'subtract', PF_SVG('<path fill="currentColor" d="M2 2h8v4H6v4H2z"/><path d="M6 6h8v8H6z"/>')],
  ['intersect', 'Interseção', 'Alt + Shift + I', 'intersect', PF_SVG('<path d="M2 2h8v8H2zM6 6h8v8H6z"/><path fill="currentColor" d="M6 6h4v4H6z"/>')],
  ['exclude', 'Excluir', 'Alt + Shift + E', 'exclude', PF_SVG('<path fill="currentColor" fill-rule="evenodd" d="M2 2h8v4h4v8H6v-4H2zM6 6v4h4V6z"/>')],
  ['flatten', 'Achatar', 'Ctrl + E', null, PF_SVG('<path d="M8 2l6 6-6 6-6-6z"/><path d="M5 8h6" stroke-linecap="round"/>')],
];
let PF_SCOPE = null;
const paperScope = () => PF_SCOPE || (PF_SCOPE = (() => { const s = new paper.PaperScope(); s.setup(new s.Size(8, 8)); return s; })());
// pontos da forma na tela (px do vídeo): posição, escala do formato, giro (o espaço do d não é o da tela)
function pfSubpaths(L) {
  const G = geomNow(L); if (!G) return null;
  const pl = placeOf(L), a = (L.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  let vec, bx = 0, by = 0, s = pl.k;
  if (L.kind === 'custom') {
    vec = vecOf(L); const b = G.cust; if (!vec || !b) return null;
    s = G.w / b.w * pl.k; bx = b.x + b.w / 2; by = b.y + b.h / 2;
  } else vec = shapePts(L, G);
  const ax = pl.x * W(), ay = pl.y * H(), f = (x, y) => { const u = (x - bx) * s, v = (y - by) * s; return [ax + u * co - v * si, ay + u * si + v * co]; };
  return vec.map(sp => ({ closed:sp.closed, pts:sp.pts.map(p => { const q = f(p.x, p.y), i = f(p.ix, p.iy), o = f(p.ox, p.oy); return { x:q[0], y:q[1], ix:i[0], iy:i[1], ox:o[0], oy:o[1] }; }) }));
}
// forma sem preenchimento (só contorno, como os anéis de um SVG): o que entra na conta é a silhueta do traço, não a linha do meio
const pfStrokeOnly = L => !shFilled(L) && strokeSee(L) && typeof polygonClipping !== 'undefined';
function pfStrokeSubs(L) {
  const base = pfSubpaths(L); if (!base) return null;
  const pl = placeOf(L), k = pl.k, w = skW(L), subs = flatSubs(base); if (!subs.length) return null;
  const closed = subs.every(s => s.closed), pos = closed ? L.strokePos || 'center' : 'center', lw = (pos === 'center' ? w : w * 2) * k;
  const dash = strokeDash({ ...L, strokeW:w * (pos === 'center' ? 1 : 2) }, 0, 1).map(v => v * k);
  let res = strokeMulti(subs, { w:lw, join:L.strokeJoin || 'round', cap:strokeCap(L), dash });
  if (pos !== 'center') {
    const area = polygonClipping.xor(...subs.filter(s => s.closed).map(s => [s.pts]));
    res = pos === 'inside' ? polygonClipping.intersection(res, area) : polygonClipping.difference(res, area);
  }
  const out = ringsToVec(res, (x, y) => [x, y], lw);
  return out.length ? out : null;
}
// as partes de uma forma só (letra feita de duas barras que se sobrepõem, como o L) viram uma silhueta sem sobreposição. `unite` com um Path vazio
// não junta quando as bordas coincidem (a base do L), então une par a par; furos (sentido contrário, como o miolo do O) saem só da peça que os contém
function pfMerge(c, sc) {
  const kids = c.children ? [...c.children] : [c]; if (kids.length < 2 || c.fillRule === 'evenodd') return c;
  const ref = kids.reduce((m, k) => Math.abs(k.area) > Math.abs(m.area) ? k : m, kids[0]).clockwise;
  const solids = kids.filter(k => k.clockwise === ref).map(k => new sc.Path({ pathData:k.pathData, insert:false })), holes = kids.filter(k => k.clockwise !== ref);
  const own = solids.map(s => [s]);
  for (const hk of holes) {
    const pt = hk.getInteriorPoint(); let best = -1;
    solids.forEach((s, i) => { if (s.contains(pt) && (best < 0 || Math.abs(s.area) < Math.abs(solids[best].area))) best = i; });
    if (best >= 0) own[best].push(new sc.Path({ pathData:hk.pathData, insert:false }));
  }
  const parts = own.map(([s, ...hs]) => hs.reduce((a, hk) => a.subtract(hk, { insert:false }), s));
  return parts.reduce((a, p) => a.unite(p, { insert:false }));
}
const pfTargets = () => pickedLayers().filter(l => l.type === 'shape'); // grupo com texto/logo/foto junto: só as formas entram na conta
function pathfinder(op) {
  const def = PF_OPS.find(o => o[0] === op), ls = pfTargets(); if (!def || !ls.length) return;
  if (ls.some(l => l.locked)) { lockedNote(ls); return; }
  if (op !== 'flatten' && op !== 'union' && ls.length < 2) { toast('Selecione duas formas ou mais'); return; }
  if (op !== 'flatten' && ls.some(l => l.kind === 'line' && !pfStrokeOnly(l))) { toast('A linha não tem área: use Achatar, ou troque por outra forma'); return; }
  if (typeof paper === 'undefined') { toast('O Pathfinder não carregou. Recarregue a página', 4000); return; }
  const order = [...ls].sort((a, b) => S.layers.indexOf(a) - S.layers.indexOf(b)), subs = order.map(l => op !== 'flatten' && pfStrokeOnly(l) ? pfStrokeSubs(l) : pfSubpaths(l));
  if (subs.some(s => !s)) { toast('Um dos caminhos tem arcos (comando A) e não dá para combinar. Redesenhe com a caneta (P)', 4500); return; }
  let d, bad = false;
  if (op === 'flatten') d = vecD(subs.flat());
  else {
    const sc = paperScope(); let acc = null;
    try {
      const its = subs.map((s, i) => { const c = new sc.CompoundPath({ pathData:vecD(s), insert:false }); c.closed = true; c.fillRule = order[i].fillRule === 'evenodd' ? 'evenodd' : 'nonzero'; return c; });
      // cada forma antes sem sobreposição interna (o que `unite` com um Path vazio não garante); uma forma só: junta as partes dela (letras do texto em vetor)
      const flat = its.map(c => pfMerge(c, sc));
      acc = flat[0]; for (const c of flat.slice(1)) acc = acc[def[3]](c, { insert:false });
      d = acc.pathData;
    } catch (e) { console.warn(e); bad = true; }
    sc.project.clear();
  }
  const vec = !bad && d && vecParse(d);
  if (vec) { // restos sem área da conta (um triângulo de verdade, como o miolo do A, fica)
    const area = sp => Math.abs(sp.pts.reduce((a, p, i, P) => { const q = P[(i + 1) % P.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2);
    const ok = vec.filter(sp => !sp.closed || sp.pts.length > 3 || (sp.pts.length === 3 && (area(sp) > 1 || sp.pts.some(p => p.ix !== p.x || p.ox !== p.x || p.iy !== p.y || p.oy !== p.y))));
    if (ok.length) vec.splice(0, vec.length, ...ok);
  }
  if (!vec) { toast(!bad && !d ? 'Nada sobrou dessa conta (as formas não se tocam?)' : 'Não consegui combinar essas formas', 4000); return; }
  d = vecD(vec);
  const b = customBox(d), cx = (b.x + b.w / 2) / W(), cy = (b.y + b.h / 2) / H();
  const src = order.find(l => l.kind !== 'line') || order[0], n = JSON.parse(JSON.stringify(src)), ring = op !== 'flatten' && pfStrokeOnly(src);
  for (const k of ['_bounds', 'fpos', 'fsz', 'flowFree', 'radius', 'radSep', 'rTL', 'rTR', 'rBR', 'rBL', 'points', 'inner', 'fillRule']) delete n[k];
  Object.assign(n, { id:uid(), name:def[1], kind:'custom', d, vec, vecD:d, size:b.w / W(), mh:null, rot:0, x:cx, y:cy, fill:src.kind === 'line' ? true : src.fill });
  if (ring) Object.assign(n, { fill:true, stroke:false, mode:'solid', c1:skC(src), c2:skC(src), c3:skC(src), c4:skC(src) }); // o contorno virou o corpo da forma: leva a cor dele
  const tAll = Math.max(...order.map(restTime)); // a agulha para onde todas as formas de antes já assentaram: ao desfazer, nenhuma fica no meio da entrada
  pushUndo();
  const top = Math.max(...order.map(l => S.layers.indexOf(l)));
  S.layers.splice(top + 1, 0, n);
  order.forEach(l => S.layers.splice(S.layers.indexOf(l), 1));
  if (fmtOwn()) { // fora do principal a forma nova nasce com a escala da adaptação: desfaz, o desenho fica como foi medido
    setPos(n, cx, cy); RT.frameNo = (RT.frameNo || 0) + 1;
    const k = placement().get(n.id)?.k; if (k && Math.abs(k - 1) > .001) setFmt(n, { s:1 / k });
  }
  propTab = 'style'; select(n.id, true);
  changed({ layers:true, props:true }); seekLayer(n); T = clamp(Math.max(T, tAll), 0, S.duration - .02);
  toast(`${def[1]}: ${ls.length > 1 ? `${ls.length} formas viraram uma` : 'a forma virou vetor'}`, 3500, UNDO_ACT);
}
function pathfinderSec() {
  const ls = pfTargets(); if (!ls.length) return null;
  const many = ls.length > 1;
  return h('section', { class:'sec' }, [h('h3', {}, ['Pathfinder', h('small', { text:many ? `${ls.length} formas` : 'uma forma' })]),
    h('div', { class:'pfrow' }, PF_OPS.map(([op, t, key,, ic]) => h('button', { class:'btn small', title:`${t} (${key})`, disabled:op !== 'flatten' && op !== 'union' && !many || null, onclick:() => pathfinder(op), html:`${ic}<span>${t}</span>` }))),
    h('p', { class:'hint', text:'Junta as formas em uma só, em curvas de verdade. Com uma forma só, Unir junta as partes dela (letras do texto em vetor). Subtrair tira as de cima da de baixo. O resultado fica com o estilo da forma de baixo.' })]);
}
const AL = (d, r) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="${d}"/>${r}</svg>`;
const rc = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx=".7"/>`;
Object.assign(ICONS, {
  al_l:AL('M2.5 2v12', rc(5, 3.5, 8, 3.2) + rc(5, 9.3, 5, 3.2)), al_ch:AL('M8 2v12', rc(3, 3.5, 10, 3.2) + rc(4.5, 9.3, 7, 3.2)), al_r:AL('M13.5 2v12', rc(3, 3.5, 8, 3.2) + rc(6, 9.3, 5, 3.2)),
  al_t:AL('M2 2.5h12', rc(3.5, 5, 3.2, 8) + rc(9.3, 5, 3.2, 5)), al_cv:AL('M2 8h12', rc(3.5, 3, 3.2, 10) + rc(9.3, 4.5, 3.2, 7)), al_b:AL('M2 13.5h12', rc(3.5, 3, 3.2, 8) + rc(9.3, 6, 3.2, 5)),
  al_dh:AL('M2.5 2v12M13.5 2v12', rc(6.3, 4, 3.4, 8)), al_dv:AL('M2 2.5h12M2 13.5h12', rc(4, 6.3, 8, 3.4)),
  pin_t:AL('', rc(2, 2, 12, 12) + rc(4.5, 4, 7, 2) + rc(4.5, 7, 7, 2)), pin_m:AL('', rc(2, 2, 12, 12) + rc(4.5, 5.2, 7, 2.2) + rc(4.5, 8.6, 7, 2.2)), pin_b:AL('', rc(2, 2, 12, 12) + rc(4.5, 7, 7, 2) + rc(4.5, 10, 7, 2)),
  pin_l:AL('', rc(2, 2, 12, 12) + rc(4, 4.5, 2, 7) + rc(7, 4.5, 2, 7)), pin_c:AL('', rc(2, 2, 12, 12) + rc(5.2, 4.5, 2.2, 7) + rc(8.6, 4.5, 2.2, 7)), pin_r:AL('', rc(2, 2, 12, 12) + rc(7, 4.5, 2, 7) + rc(10, 4.5, 2, 7)),
  fl_off:AL('', rc(2.5, 2.5, 6, 4.5) + rc(7.5, 9, 6, 4.5)), fl_v:AL('M5.5 8h5', rc(3, 2, 10, 4) + rc(3, 10, 10, 4)), fl_h:AL('M8 5.5v5', rc(2, 3, 4, 10) + rc(10, 3, 4, 10)),
});
// escala a seleção toda (proporcional, em torno do centro do conjunto); devolve apply(f) sobre o tamanho de agora
function beginScaleSel() {
  const ls = freePicked(); if (!ls.length) { lockedNote(pickedLayers()); return null; }
  ensureBounds(ls);
  const its = ls.filter(o => o._bounds); if (!its.length) return null;
  const x0 = Math.min(...its.map(o => o._bounds.x)), y0 = Math.min(...its.map(o => o._bounds.y));
  const cx = (x0 + Math.max(...its.map(o => o._bounds.x + o._bounds.w))) / 2, cy = (y0 + Math.max(...its.map(o => o._bounds.y + o._bounds.h))) / 2;
  const items = its.map(o => ({ o, s0:size0(o), ox:o._bounds.x + o._bounds.w / 2, oy:o._bounds.y + o._bounds.h / 2 })), fl = flowScale(ls);
  // quem respeita a margem não passa dela (o desenho encolhe, mas o tamanho gravado cresceria): a escala para no maior que ainda cabe
  const M = marginBox(), fmax = M ? Math.min(Infinity, ...its.filter(o => !freeType(o) && !inFlow(o)).map(o => { const n = natBox(o); return Math.max(1, Math.min((M.x1 - M.x0) / Math.max(n.w, 1), (M.y1 - M.y0) / Math.max(n.h, 1))); })) : Infinity;
  return f => { f = Math.min(f, fmax); for (const q of items) { scaleAny(q.o, q.s0, f); setPos(q.o, +((cx + (q.ox - cx) * f) / W()).toFixed(4), +((cy + (q.oy - cy) * f) / H()).toFixed(4)); } fl(f); needs = true; };
}
function scaleBar() {
  const rng = h('input', { type:'range', min:25, max:300, step:1, value:100, 'aria-label':'Escala da seleção' }), out = h('output', { text:'100%' });
  let ap = null;
  rng.addEventListener('pointerdown', () => { pushUndo(); ap = beginScaleSel(); });
  rng.addEventListener('input', () => { if (!ap) { pushUndo(); ap = beginScaleSel(); } if (ap) { ap(+rng.value / 100); out.textContent = rng.value + '%'; } });
  rng.addEventListener('change', () => { ap = null; rng.value = 100; out.textContent = '100%'; changed({ props:true }); });
  // escrito (−10% / +10%): mais claro que um − / + solto
  const step = (f, t) => h('button', { class:'btn small', title:t, 'aria-label':t, text:f > 1 ? '+10%' : '−10%', onclick:() => { pushUndo(); const a = beginScaleSel(); if (a) { a(f); changed({ props:true }); } } });
  return h('section', { class:'sec' }, [h('h3', {}, ['Tamanho da seleção', h('small', { text:'todos juntos' })]),
    h('div', { class:'row' }, [step(1 / 1.1, 'Diminuir 10%'), rng, out, step(1.1, 'Aumentar 10%')])]);
}
// Posição (como no Figma): alinhar, agrupar e a posição do elemento numa seção só, no topo da aba "Conteúdo e estilo"
function alignBar() {
  const ls = pickedLayers(); if (!ls.length) return null;
  const n = new Set(ls.map(l => l.grp || l.id)).size;
  const b = (k, t, off) => h('button', { class:'icon-btn', title:t, 'aria-label':t, html:ICONS['al_' + k], disabled:off || null, onclick:() => alignLayers(k) });
  const oneGrp = ls.every(l => l.grp && l.grp === ls[0].grp);
  // grupo inteiro: só alinhar (a posição é a dos itens); o resto ganha os campos de posição e, foto/forma, "Manter dentro da margem"
  const L = selL(), pos = L && !wholeGroup() ? posFields(L) : [];
  const keep = pos.length && ls.every(l => l.type === L.type) && (L.type === 'image' || L.type === 'shape')
    ? [checkF(L, 'keepIn', 'Manter dentro da margem'), h('p', { class:'hint', text:`Precisa da margem ligada. Se ${L.type === 'image' ? 'a imagem' : 'a forma'} não couber, ela encolhe.` })] : [];
  return h('section', { class:'sec' }, [
    h('h3', {}, ['Posição', h('small', { text:n > 1 ? 'alinha entre a seleção' : ls.length > 1 ? marginBox() ? 'grupo à margem' : 'grupo ao quadro' : marginBox() ? 'alinha à margem' : 'alinha ao quadro' })]),
    h('div', { class:'alrow' }, [b('l', 'Alinhar à esquerda'), b('ch', 'Centralizar na horizontal'), b('r', 'Alinhar à direita'), h('i'),
      b('t', 'Alinhar ao topo'), b('cv', 'Centralizar na vertical'), b('b', 'Alinhar embaixo'), h('i'),
      b('dh', 'Distribuir na horizontal (3 ou mais)', n < 3), b('dv', 'Distribuir na vertical (3 ou mais)', n < 3)]),
    h('div', { class:'row row-wrap' }, [
      h('button', { class:'btn small', text:'Agrupar', title:'Agrupar (Ctrl+G)', disabled:ls.length < 2 || oneGrp || null, onclick:groupSel }),
      ls.some(l => l.grp) ? h('button', { class:'btn small', text:'Desagrupar', title:'Desagrupar (Ctrl+Shift+G)', onclick:ungroupSel }) : null,
      n > 1 ? h('button', { class:'btn small', text:'Layout automático', title:'Agrupar em fila, com o mesmo espaço entre eles (Shift+A)', onclick:flowToggle }) : null,
    ]),
    ...pos, ...keep,
    ls.length > 1 ? h('p', { class:'hint', text:`${ls.length} selecionados${pos.length ? ': a posição move todos juntos' : ''}` }) : null,
  ]);
}

/* ------------ layout automático: painel, atalho e palco (a conta fica em flowSolve, perto de placeOf) ------------ */
/* Desligar um layout (quadro, grupo, "Fora do layout", desagrupar) nunca mexe em nada, em nenhum formato (pedido do usuário).
   No principal as posições já estão gravadas (flowBake); nos outros a fila era feita no próprio formato e, sem ela, a adaptação
   automática pode pôr o elemento em outro lugar: quem andaria ganha a posição de antes em fpos daquele formato. */
function keepPlace(fn) {
  const bf = baseFmt(), cur = S.format, ls = S.layers.filter(l => l.type !== 'bg'), snap = new Map();
  const each = f => { try { for (const k of Object.keys(FORMATS)) if (k !== bf) { S.format = k; RT.frameNo = (RT.frameNo || 0) + 1; f(k); } } finally { S.format = cur; RT.frameNo++; } };
  flowBake();
  each(k => snap.set(k, new Map(ls.map(L => [L.id, placeOf(L)]))));
  fn();
  each(k => holdPlace(snap.get(k), k, ls));
  changed({ props:true });
}
// arquivo de antes do holdPlace: grupo com parte das peças fixas num formato e parte automática (logo desmontado) volta todo ao automático
function fixTornGroups(st) {
  if (st.grpFix) return 0; // uma vez por arquivo: depois disso, peça mexida sozinha num formato é de propósito
  st.grpFix = 1;
  const G = st.groups || {}, top = gid => { for (let n = 0; G[gid] && G[gid].parent && G[G[gid].parent] && n < 20; n++) gid = G[gid].parent; return gid; };
  const flowy = gid => { for (let n = 0; gid && G[gid] && n < 20; n++, gid = G[gid].parent) if (G[gid].flow) return true; return false; };
  const by = new Map();
  for (const l of st.layers) if (l.grp && !flowy(l.grp)) { const g = top(l.grp); if (!by.has(g)) by.set(g, []); by.get(g).push(l); }
  let n = 0;
  for (const ms of by.values()) {
    const fmts = new Set(ms.flatMap(l => Object.keys(l.fpos || {})));
    for (const f of fmts) {
      const own = ms.filter(l => l.fpos && l.fpos[f] && l.fpos[f].x != null);
      if (!own.length || own.length === ms.length) continue;
      for (const l of ms) if (l.fpos && l.fpos[f]) { const p = l.fpos[f]; delete p.x; delete p.y; delete p.s; if (!Object.keys(p).length) delete l.fpos[f]; if (!Object.keys(l.fpos).length) delete l.fpos; }
      n++;
    }
  }
  return n;
}
// grava em fpos[k] (formato aberto = k) a posição/escala de antes de quem andaria. Grupo (sem layout automático) é uma composição:
// se uma peça anda, o grupo inteiro fica fixo. Peça por peça, um logo importado (várias formas) ficava meio fixo e meio automático
// e se desmontava no próximo ajuste feito no principal.
function holdPlace(m, k, ls) {
  const moved = (L, a, b) => Math.abs(a.x - b.x) * W() > .5 || Math.abs(a.y - b.y) * H() > .5 || Math.abs(a.k - b.k) > 1e-3;
  const unit = L => (L.grp && !inFlow(L) ? 'g:' + gtop(L.grp) : L.id), hit = new Set();
  for (const L of ls) { const a = m.get(L.id); if (a && S.layers.includes(L) && moved(L, a, placeOf(L))) hit.add(unit(L)); }
  for (const L of ls) {
    const a = m.get(L.id); if (!a || !S.layers.includes(L) || !hit.has(unit(L))) continue;
    const b = placeOf(L), f = (L.fpos && L.fpos[k]) || {}, auto = b.k / (f.s ?? 1);
    const s = Math.abs(a.k - b.k) > 1e-3 && auto > 0 ? { s:+(a.k / auto).toFixed(5) } : {};
    L.fpos ||= {}; L.fpos[k] = { ...L.fpos[k], x:+a.x.toFixed(5), y:+a.y.toFixed(5), ...s };
  }
}
function setFlow(gid, F) {
  pushUndo();
  const g = gmeta(gid, true);
  if (F) { g.flow = F; gleaves(gid).forEach(l => { delete l.fsz; }); changed({ props:true }); } // a âncora sai de como está agora
  else keepPlace(() => { delete g.flow; changed({ props:true }); });
}
function flowOn(gid, dir) {
  const F = flowGuess(gid, dir); if (!F) return;
  setFlow(gid, F);
  toast(`Layout automático ${F.dir === 'h' ? 'em linha' : 'em coluna'}, ${F.gap}px entre os itens`, 3600, UNDO_ACT);
}
// Shift + A (e o botão): seleção solta vira um grupo com layout; num grupo, liga ou desliga
function flowToggle() {
  const L0 = selL(); if (!L0 || L0.type === 'bg') { frameToggle(); return; }
  const gid = wholeGroup();
  if (gid) { if (flowOf(gid)) { setFlow(gid, null); toast('Layout automático desligado. Os itens ficaram onde estavam', 3600, UNDO_ACT); } else flowOn(gid); return; }
  const ls = pickedLayers().filter(l => !NOBOX(l));
  if (new Set(ls.map(l => l.grp ? gtop(l.grp) : l.id)).size < 2) { toast('Selecione dois ou mais elementos (ou um grupo) para o layout automático'); return; }
  // frames inteiros na seleção ficam como estão e passam a ser filhos do novo (layout, nome e animação deles continuam); o resto entra direto
  const whole = [...new Set(ls.filter(l => l.grp).map(l => gtop(l.grp)))].filter(t => gleaves(t).every(l => ls.includes(l)));
  if (!whole.length) { groupSel(); const g = wholeGroup(); if (g) flowOn(g); return; }
  pushUndo();
  const ng = 'g' + Math.random().toString(36).slice(2, 7), loose = ls.filter(l => !l.grp || !whole.includes(gtop(l.grp)));
  (S.groups ||= {})[ng] = { open:true, name:'Frame' };
  whole.forEach(t => { gmeta(t, true).parent = ng; });
  loose.forEach(l => { l.grp = ng; });
  if (loose.length > 1) { // os soltos ficam juntos na pilha
    const top = Math.max(...loose.map(l => S.layers.indexOf(l)));
    S.layers = [...S.layers.slice(0, top + 1).filter(l => !loose.includes(l)), ...loose, ...S.layers.slice(top + 1)];
  }
  RT.picks = new Set(ls.map(l => l.id)); if (!RT.picks.has(RT.selected)) RT.selected = ls[ls.length - 1].id;
  changed({ layers:true, props:true }); flowOn(ng);
}
// painel: grupo inteiro selecionado = o layout dele; um item de um grupo com layout = "fora do layout"
function flowSec() {
  const gid = wholeGroup();
  if (gid) { const sec = flowGroupSec(gid); if (S.flow) sec.append(frameOutCheck(gmeta(gid, true), 'free', 'g-' + gid)); return sec; }
  const L = selL(); if (!L || L.type === 'bg' || pickedLayers().length !== 1) return null;
  if (chainFlow(L.grp)) return flowItemSec(L);
  if (S.flow && !L.grp) return h('section', { class:'sec' }, [h('h3', {}, ['Layout do quadro', h('small', { text:'coluna' })]), frameOutCheck(L, 'flowFree', L.id),
    h('p', { class:'hint', text:L.flowFree ? 'Fica onde você deixar; os outros não guardam lugar para ele.' : 'Arraste (ou use ↑ ↓) para trocar de lugar na coluna. O espaço fica no painel do quadro (clique no vazio).' })]);
  return null;
}
// fora da coluna do quadro: o elemento solto (L.flowFree) ou o grupo inteiro (S.groups[gid].free)
function frameOutCheck(o, k, idk) {
  const id = 'f-' + idk + '-frameout', inp = h('input', { type:'checkbox', id, checked:!!o[k] });
  inp.addEventListener('change', () => { pushUndo(); keepPlace(() => { o[k] = inp.checked || undefined; if (!inp.checked) o[k === 'free' ? 'enter' : 'flowEnter'] = true; changed({ props:true }); }); });
  return h('label', { class:'check', for:id }, [inp, k === 'free' ? 'Fora do layout do quadro' : 'Fora do layout (fica onde você deixar)']);
}
// a fila agora, no formato aberto (o painel não espera o próximo quadro)
function flowNow(gid) { return flowOf(gid) ? flowLayout(false, RT.drag && RT.drag.flow === gid ? RT.drag : null).groups.get(gid) || null : null; }
// grupo inteiro com layout selecionado: a caixa da seleção é o frame (as alças mudam o tamanho dele, não escalam o que está dentro)
function flowFrameSel() {
  const gid = !playing && wholeGroup(); if (!gid || !flowOf(gid) || !freePicked().length) return null;
  const r = flowNow(gid); if (!r) return null;
  const b = r.box; return { x:b.x0, y:b.y0, w:b.x1 - b.x0, h:b.y1 - b.y0, ls:freePicked(), gid };
}
// caixa do grupo na tela (frame do layout ou a soma dos itens visíveis), para o contorno quando um item está escolhido sozinho
function parentBox(gid) {
  const r = flowOf(gid) && flowNow(gid);
  if (r && r.box) { const b = r.box; return { x:b.x0, y:b.y0, w:b.x1 - b.x0, h:b.y1 - b.y0 }; }
  const bs = gleaves(gid).filter(o => o.visible && o._bounds && phase(o, T)).map(o => o._bounds); if (bs.length < 2) return null;
  return unionBox(bs);
}
// puxa a alça do frame: o lado puxado vira tamanho fixo (o oposto fica parado; Alt = o centro) e o conteúdo se alinha dentro
// menor tamanho do frame: o do conteúdo (px do formato aberto) => { w, h }
function flowMin(F, its) {
  const v = F.dir !== 'h', kk = its.reduce((n, i) => n + i.k, 0) / its.length;
  const tot = its.reduce((n, i) => n + (v ? i.h : i.w), 0) + (F.auto ? 0 : (F.gap ?? 24) * kk * (its.length - 1)), cr = Math.max(...its.map(i => v ? i.w : i.h));
  return v ? { w:cr, h:tot } : { w:tot, h:cr };
}
function flowResize(D, ex, ey, alt) {
  const F = flowOf(D.gid), its = F ? (flowNow(D.gid) || {}).items || [] : []; if (!its.length) return;
  const b = { ...D.B0 }, kk = its.reduce((n, i) => n + i.k, 0) / its.length, lim = flowMin(F, its);
  const pull = (e, k0, k1, d, mn) => { // nunca menor que o conteúdo
    if (alt) { const c = (b[k0] + b[k1]) / 2, hw = Math.max(mn / 2, Math.abs(e - c)); b[k0] = c - hw; b[k1] = c + hw; }
    else if (d > 0) b[k1] = Math.max(b[k0] + mn, e); else b[k0] = Math.min(b[k1] - mn, e);
  };
  const M = marginAt((D.B0.x0 + D.B0.x1) / 2); // texto, logo e botão dentro do frame não passam da margem: a caixa para nela em vez de empurrar o conteúdo
  const lock = M && its.some(i => i.L.type !== 'group' && !freeType(i.L));
  const cap = (k0, k1, lo, hi, mn) => { if (b[k1] > hi && D.B0[k1] <= hi + .5) b[k1] = Math.max(hi, b[k0] + mn); if (b[k0] < lo && D.B0[k0] >= lo - .5) b[k0] = Math.min(lo, b[k1] - mn); };
  if (D.hx) { pull(ex, 'x0', 'x1', D.hx, lim.w); if (lock) cap('x0', 'x1', M.x0, M.x1, lim.w); F.w = Math.round((b.x1 - b.x0) / kk); }
  if (D.hy) { pull(ey, 'y0', 'y1', D.hy, lim.h); if (lock) cap('y0', 'y1', M.y0, M.y1, lim.h); F.h = Math.round((b.y1 - b.y0) / kk); }
  flowFill(D.gid, b);
}
function flowGroupSec(gid) {
  const F = flowOf(gid), v = !F || F.dir !== 'h';
  const set = patch => {
    pushUndo();
    // frame com tamanho fixo: alinhar, lado fixo e Auto rearrumam o conteúdo dentro dele (o frame não sai do lugar)
    const keep = F && (F.w != null || F.h != null) && ['align', 'pin', 'auto'].some(k => k in patch) && flowNow(gid);
    Object.assign(flowOf(gid), patch);
    if (keep) flowFill(gid, keep.box);
    changed({ props:true });
  };
  const tog = (on, t, ic, fn) => h('button', { type:'button', class:'icon-btn', 'aria-pressed':String(!!on), title:t, 'aria-label':t, html:ic, onclick:fn });
  const sec = h('section', { class:'sec flow' }, [
    h('h3', {}, ['Layout automático', h('small', { text:F ? (v ? 'em coluna' : 'em linha') : 'Shift+A' })]),
    h('div', { class:'alrow' }, [
      tog(!F, 'Livre: cada item fica onde você deixar', ICONS.fl_off, () => { if (F) setFlow(gid, null); }),
      tog(F && v, 'Em coluna: um embaixo do outro', ICONS.fl_v, () => { if (!F) flowOn(gid, 'v'); else if (!v) set({ dir:'v' }); }),
      tog(F && !v, 'Em linha: um ao lado do outro', ICONS.fl_h, () => { if (!F) flowOn(gid, 'h'); else if (v) set({ dir:'h' }); }),
    ]),
  ]);
  if (!F) { sec.append(h('p', { class:'hint', text:'Fila com o mesmo espaço entre os itens: mudar o tamanho de um empurra os outros. As animações continuam por cima.' })); return sec; }
  const autoB = h('button', { type:'button', class:'btn small flow-auto', 'aria-pressed':String(!!F.auto), text:'Auto',
    title:F.auto ? 'Voltar ao espaço em número' : 'Auto: o primeiro e o último ficam onde estão e os outros se espalham entre eles',
    onclick:() => { const r = flowNow(gid); set(F.auto ? { auto:false, gap:Math.max(0, Math.round(r ? r.gap / (r.kk || 1) : F.gap ?? 24)) } : { auto:true }); } });
  let gapF;
  if (F.auto) {
    const r = flowNow(gid);
    gapF = field('Espaço', h('div', { class:'rng' }, [h('span', { class:'hint', text:'espalhado' }), h('span', { class:'flow-num', text:r ? Math.round(r.gap / (r.kk || 1)) + 'px' : '' })]));
  } else gapF = rangeF(new Proxy(F, { get:(t, k) => k === 'id' ? 'flow-' + gid : t[k] }), 'gap', 'Espaço', 0, 400, 1, n => Math.round(n) + 'px');
  gapF.classList.add('flowgap'); gapF.append(autoB);
  const al = v ? [['start', 'al_l', 'À esquerda'], ['center', 'al_ch', 'No centro'], ['end', 'al_r', 'À direita']] : [['start', 'al_t', 'Em cima'], ['center', 'al_cv', 'No meio'], ['end', 'al_b', 'Embaixo']];
  const pins = v ? [['start', 'pin_t', 'Em cima'], ['center', 'pin_m', 'No meio'], ['end', 'pin_b', 'Embaixo']] : [['start', 'pin_l', 'À esquerda'], ['center', 'pin_c', 'No meio'], ['end', 'pin_r', 'À direita']];
  // tamanho do frame: abraça o conteúdo ou fixo (puxar a alça no palco também deixa fixo)
  const sizeRow = (k, label) => {
    const minOf = () => { const its = (flowNow(gid) || {}).items || [], m = its.length ? flowMin(F, its) : { w:8, h:8 }, kk = its.length ? its.reduce((n, i) => n + i.k, 0) / its.length : 1; return Math.ceil((k === 'w' ? m.w : m.h) / kk); };
    const hug = F[k] == null, cur = () => { const r = flowNow(gid); return r ? Math.round((k === 'w' ? r.box.x1 - r.box.x0 : r.box.y1 - r.box.y0) / (r.kk || 1)) : 200; };
    const f = hug ? field(label, h('div', { class:'rng' }, [h('span', { class:'hint', text:'abraça' }), h('span', { class:'flow-num', text:cur() + 'px' })]))
      : rangeF(new Proxy(F, { get:(t, kk) => kk === 'id' ? 'flow-' + gid : t[kk] }), k, label, minOf(), 2400, 1, n => Math.round(n) + 'px');
    f.classList.add('flowgap');
    f.append(h('button', { type:'button', class:'btn small flow-auto', 'aria-pressed':String(hug), text:'Abraçar',
      title:hug ? 'Fixar o tamanho atual (ou puxe a alça no palco)' : 'Voltar a abraçar o conteúdo', onclick:() => set({ [k]:hug ? cur() : undefined }) }));
    return f;
  };
  sec.append(...[gapF, sizeRow('w', 'Largura'), sizeRow('h', 'Altura'),
    field('Alinhar', h('div', { class:'alrow' }, al.map(([k, ic, t]) => tog((F.align || 'center') === k, `Alinhar ${t.toLowerCase()}`, ICONS[ic], () => set({ align:k }))))),
    F.auto ? null : (() => { const f = field('Fixo', h('div', { class:'alrow' }, pins.map(([k, ic, t]) => tog((F.pin || 'start') === k, `Fixo ${t.toLowerCase()}`, ICONS[ic], () => set({ pin:k })))));
      f.title = 'Quando um item cresce (texto maior, outra variação), este lado fica parado e o resto se ajusta'; return f; })(),
    h('p', { class:'hint', text:F.auto ? 'Os itens se espalham por todo o frame. Puxe as alças no palco para mudar o tamanho dele.'
      : 'No palco: as alças mudam o tamanho do frame e o espaço rosa muda o espaço. Para trocar a ordem, Ctrl + clique num item e arraste (ou use as setas).' })].filter(Boolean));
  return sec;
}
function flowItemSec(L) {
  const id = fid(L, 'flowFree'), inp = h('input', { type:'checkbox', id, checked:!!L.flowFree });
  inp.addEventListener('change', () => { pushUndo(); keepPlace(() => { L.flowFree = inp.checked || undefined; changed({ props:true }); }); });
  return h('section', { class:'sec' }, [
    h('h3', {}, ['Layout automático', h('small', { text:groupName(L.grp) })]),
    h('label', { class:'check', for:id }, [inp, 'Fora do layout (fica onde você deixar)']),
    h('p', { class:'hint', text:L.flowFree ? 'Continua no grupo e anima junto, mas não ocupa lugar na fila.' : 'Arraste (ou use as setas) para trocar de lugar na fila. O espaço e o alinhamento são do grupo.' }),
  ]);
}
// arrastar um item sozinho (clique nele; com o grupo inteiro escolhido, um toque antes) de um grupo com layout: ele segue o mouse, os outros abrem espaço, e ao soltar entra na fila
function flowGrab(D) {
  const L = D.L, mv = [L, ...(D.others || []).map(q => q.o)];
  if (inFlow(L) && flowOf(L.grp) && !flowWhole(L.grp, mv)) { D.flow = L.grp; D.flowL = L.id; D.fz = flowSolve(flowOf(L.grp), flowItems(L.grp), null).fz; return; }
  // coluna do quadro: o bloco arrastado segue o mouse, os outros abrem espaço; só continua junto da linha em que já estava
  if (!S.flow || !RT.frameIds || !RT.frameIds.has(L.id)) return;
  D.flowB = new Set(mv.filter(o => RT.frameIds.has(o.id)).map(o => o.id));
  const row = RT.frameRows && RT.frameRows.rows.find(r => r.bs.some(b => b.ms.some(m => m.L === L)));
  D.mates = new Set(row ? row.bs.filter(b => !b.ms.some(m => D.flowB.has(m.L.id))).map(b => b.key) : []);
}
// ↑ ↓ num bloco da coluna do quadro (elemento solto ou grupo inteiro): passa para o outro lado da linha vizinha que aparece junto
function frameStep(ls, d) {
  const fr = S.flow && RT.frameRows; if (!fr) return false;
  const row = fr.rows.find(r => r.bs.some(b => b.ms.some(m => m.L === ls[0]))), bl = row && row.bs.find(b => b.ms.some(m => m.L === ls[0]));
  if (!bl || !bl.ms.every(m => ls.includes(m.L)) || !ls.every(l => bl.ms.some(m => m.L === l))) return false;
  const meets = (a, b) => a.some(([a0, a1]) => b.some(([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > .01));
  const nb = [...fr.rows].filter(r => r !== row && meets(r.sp, row.sp) && Math.sign(r.Y - row.Y) === Math.sign(d)).sort((p, q) => Math.abs(p.Y - row.Y) - Math.abs(q.Y - row.Y))[0];
  if (!nb) return true;
  pushUndo();
  const dl = ((nb.rt0 + nb.rb0) / 2 - (bl.rt + bl.rb) / 2 + Math.sign(d)) / H();
  for (const m of bl.ms) { const p = placeRaw(m.L); setPos(m.L, null, p.y + dl); }
  frameCommit({ flowB:new Set(bl.ms.map(m => m.L.id)), mates:new Set() }); changed();
  return true;
}
// grava a fila na nova ordem com a âncora de antes (senão o item que estava fora do lugar puxaria a fila inteira)
function flowCommit(gid, fz) {
  if (!flowOf(gid)) return;
  const R = flowLayout(false, { flow:gid, fz });
  for (const L of gleaves(gid)) { const q = R.pos.get(L.id); if (q) setPos(L, +(q.cx / W()).toFixed(5), +(q.cy / H()).toFixed(5)); }
}
// bloco solto na coluna do quadro: entra no lugar dele (sem se juntar com quem ele encostou, a não ser a linha em que já estava)
function frameCommit(D) {
  const R = flowLayout(false, D);
  for (const L of S.layers) { const q = R.frame && R.frame.ids.has(L.id) && R.pos.get(L.id); if (q) setPos(L, +(q.cx / W()).toFixed(5), +(q.cy / H()).toFixed(5)); }
}
// setas num item sozinho: troca de lugar com o vizinho (no eixo da fila); no outro eixo quem manda é o alinhamento do grupo
function flowStep(L, dx, dy) {
  const F = flowOf(L.grp), v = F.dir !== 'h', d = Math.sign(v ? dy : dx);
  const r = RT.flowRects && RT.flowRects.get(L.grp), j = r ? r.rects.findIndex(q => q.L === L) : -1, n = j >= 0 && r.rects[j + d];
  if (!d) { toast(`Está no layout automático: ${v ? '↑ ↓' : '← →'} trocam de lugar`); return; }
  if (!n) return;
  if (n.L.kid) { toast('O vizinho é um frame inteiro: arraste o item com o mouse para trocar'); return; }
  pushUndo();
  const fz = { ...flowSolve(F, flowItems(L.grp), null).fz, all:true }, q = placeRaw(n.L), c = (v ? q.y : q.x) + d * .001; // passa para o outro lado do vizinho
  setPos(L, v ? null : c, v ? c : null); flowCommit(L.grp, fz); changed();
}
// escalar o grupo inteiro (alça de canto, "Tamanho da seleção"): o espaço e o tamanho guardado acompanham.
// Fora do principal a escala é só daquele formato e já entra na conta pelo k
function flowScale(ls) {
  if (fmtOwn()) return () => {};
  const gs = new Set(); for (const l of ls) for (let g = l.grp, n = 0; g && n < 20; g = gpar(g), n++) gs.add(g);
  const st = [...gs].filter(g => chainFlow(g) && flowWhole(g, ls)).map(g => { const F = flowOf(g), m = gmeta(g);
    return { F, gap:F && (F.gap ?? 24), w:F && F.w, h:F && F.h, m, z:m && m.fsz, ms:S.layers.filter(o => o.grp === g && o.fsz).map(o => [o, o.fsz]) }; });
  return f => { for (const s of st) {
    if (s.F) { s.F.gap = +(s.gap * f).toFixed(1); if (s.w != null) s.F.w = Math.round(s.w * f); if (s.h != null) s.F.h = Math.round(s.h * f); }
    if (s.z) s.m.fsz = [s.z[0] * f, s.z[1] * f];
    for (const [o, z] of s.ms) o.fsz = [z[0] * f, z[1] * f];
  } };
}
// os espaços da fila no palco (como no Figma): com o grupo ou um item dele selecionado, faixas rosadas com o valor
function flowGaps() {
  const L = selL(); if (playing) return [];
  if ((!L || L.type === 'bg') && S.flow) return frameGaps();
  const wg = wholeGroup(), gid = wg || (L && pickedLayers().length === 1 ? L.grp : null);
  if (!L || !gid || !flowOf(gid) || !RT.flowRects) return [];
  const r = RT.flowRects.get(gid); if (!r || r.rects.length < 2) return [];
  const F = flowOf(gid), out = [];
  for (let j = 1; j < r.rects.length; j++) {
    const a = r.rects[j - 1], b = r.rects[j], [A, Z, B, C] = r.v ? ['cy', 'h', 'cx', 'w'] : ['cx', 'w', 'cy', 'h'];
    const s0 = a[A] + a[Z] / 2, s1 = b[A] - b[Z] / 2;
    let c0 = Math.max(a[B] - a[C] / 2, b[B] - b[C] / 2), c1 = Math.min(a[B] + a[C] / 2, b[B] + b[C] / 2);
    if (c1 - c0 < 40) { c0 = Math.min(a[B] - a[C] / 2, b[B] - b[C] / 2); c1 = Math.max(a[B] + a[C] / 2, b[B] + b[C] / 2); }
    out.push({ gid, v:r.v, s0, s1, c0, c1, n:Math.round(F.auto ? r.gap / (r.kk || 1) : F.gap ?? 24) });
  }
  return out;
}
// espaços da coluna do quadro (nada selecionado): entre as linhas que estão na tela agora
function frameGaps() {
  const fr = RT.frameRows; if (!fr || !fr.rows.length) return [];
  // carrossel: o tempo de cada linha vem somado ao slide (frameSolve, 1e4 por slide); os espaços são entre linhas do mesmo slide
  const off = a => Math.round(a / 1e4) * 1e4, out = [], seen = new Set();
  for (const k of new Set(fr.rows.flatMap(r => r.sp.map(([a]) => off(a))))) {
    const on = fr.rows.filter(r => r.sp.some(([a, b]) => off(a) === k && T + k >= a - 1e-6 && T + k <= b + 1e-6)).sort((p, q) => p.Y - q.Y);
    for (let j = 1; j < on.length; j++) {
      const a = on[j - 1], b = on[j], s0 = a.Y + a.H, s1 = b.Y, pk = fr.rows.indexOf(a) + ':' + fr.rows.indexOf(b);
      if (s1 < s0 - 1 || seen.has(pk)) continue; seen.add(pk);
      let c0 = Math.max(a.cl, b.cl) + 0, c1 = Math.min(a.cr, b.cr);
      c0 += (a.dx + b.dx) / 2; c1 += (a.dx + b.dx) / 2;
      if (c1 - c0 < 40) { c0 = Math.min(a.cl + a.dx, b.cl + b.dx); c1 = Math.max(a.cr + a.dx, b.cr + b.dx); }
      out.push({ gid:null, v:true, s0, s1, c0, c1, n:Math.round(fr.gaps.get(b) ?? (S.flow.auto ? s1 - s0 : S.flow.gap ?? 24)) }); // o espaço que valeu (diminui quando não cabe)
    }
  }
  return out;
}
// Shift + A sem nada selecionado (e o painel do quadro): liga ou desliga a coluna do quadro
function frameToggle() {
  if (S.flow) { pushUndo(); keepPlace(() => { delete S.flow; changed({ props:true }); }); toast('Layout do quadro desligado. Tudo ficou onde estava', 3600, UNDO_ACT); return; }
  // espaço, lado fixo e alinhamento saem de como está: conta uma vez com espaço 0 só para achar as linhas
  pushUndo();
  S.flow = { gap:0, auto:false, pin:'start', align:'keep' };
  const fr = flowLayout(false).frame; delete S.flow;
  if (!fr || !fr.rows.length) { toast('Nada no quadro para organizar ainda'); return; }
  // na ordem da coluna (o meio de cada linha): pelo topo, um texto sobreposto ao de cima media o espaço até o vizinho errado
  const rows = [...fr.rows].sort((p, q) => p.ord - q.ord), gs = [], meets = (a, b) => a.some(([a0, a1]) => b.some(([b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0) > .01));
  for (let j = 1; j < rows.length; j++) { const k = [...rows.slice(0, j)].reverse().find(r => meets(r.sp, rows[j].sp)); if (k) gs.push(rows[j].ct - (k.ct + k.H)); }
  const pos = gs.filter(g => g > 0).sort((p, q) => p - q), M = marginBox() || { x0:0, y0:0, x1:W(), y1:H() };
  const top = Math.min(...rows.map(r => r.ct)), bot = Math.max(...rows.map(r => r.ct + r.H)), mid = ((top + bot) / 2 - M.y0) / (M.y1 - M.y0);
  // na horizontal: quase no centro (ou quase encostado numa margem) já conta; com 10px de tolerância um botão um pouco torto deixava tudo em "Manter" e era preciso alinhar à mão
  const tol = (M.x1 - M.x0) * .06, near = f => rows.every(r => Math.abs(f(r, areaAt((r.cl + r.cr) / 2))) < tol); // carrossel: a margem do slide da linha
  const align = near((r, M) => (r.cl + r.cr - M.x0 - M.x1) / 2) ? 'center' : near((r, M) => r.cl - M.x0) ? 'start' : near((r, M) => r.cr - M.x1) ? 'end' : 'keep';
  S.flow = { gap:pos.length ? Math.round(pos[pos.length >> 1]) : 40, auto:false, pin:mid < .4 ? 'start' : mid > .6 ? 'end' : 'center', align };
  changed({ props:true });
  toast(`Layout do quadro: coluna com ${S.flow.gap}px entre os blocos`, 3600, UNDO_ACT);
}
// painel com nada selecionado (o quadro): a coluna de tudo
function frameFlowSec() {
  const F = S.flow;
  const set = patch => { pushUndo(); Object.assign(S.flow, patch); changed({ props:true }); };
  const tog = (on, t, ic, fn) => h('button', { type:'button', class:'icon-btn', 'aria-pressed':String(!!on), title:t, 'aria-label':t, html:ic, onclick:fn });
  const sec = h('section', { class:'sec flow' }, [
    h('h3', {}, ['Layout do quadro', h('small', { text:F ? 'tudo em coluna' : 'Shift+A' })]),
    h('div', { class:'alrow' }, [
      tog(!F, 'Livre: cada elemento fica onde você deixar', ICONS.fl_off, () => { if (F) frameToggle(); }),
      tog(F, 'Em coluna: tudo um embaixo do outro, com o mesmo espaço', ICONS.fl_v, () => { if (!F) frameToggle(); }),
    ]),
  ]);
  if (!F) { sec.append(h('p', { class:'hint', text:'Tudo no quadro em coluna, com o mesmo espaço: grupos contam como um bloco, a margem é o respiro e quem não aparece junto não se empurra.' })); return sec; }
  const autoB = h('button', { type:'button', class:'btn small flow-auto', 'aria-pressed':String(!!F.auto), text:'Auto', title:F.auto ? 'Voltar ao espaço em número' : 'Auto: espalha de margem a margem',
    onclick:() => set({ auto:!F.auto }) });
  // espaço pedido maior do que cabe na margem: avisa o que valeu de fato (frameSolve diminui o espaço até caber)
  const warn = h('p', { class:'hint' }), fitNote = () => {
    let fr = null; try { fr = flowLayout(false).frame; } catch (e) {}
    const used = !F.auto && fr && fr.gaps.size ? Math.min(...fr.gaps.values()) : null, want = F.gap ?? 24;
    warn.textContent = fr && fr.tight ? 'Não cabe na margem nem sem espaço: tem coisa demais na tela ao mesmo tempo. Tire algo da coluna (Fora do layout do quadro) ou diminua os elementos.'
      : used != null && used < want - .5 ? `Com ${Math.round(want)}px não cabe na margem: o espaço ficou em ${Math.round(used)}px.` : '';
    warn.hidden = !warn.textContent;
  };
  const gapF = F.auto ? field('Espaço', h('div', { class:'rng' }, [h('span', { class:'hint', text:'de margem a margem' })]))
    : rangeF(new Proxy(F, { get:(t, k) => k === 'id' ? 'frameflow' : t[k] }), 'gap', 'Espaço', 0, 600, 1, n => Math.round(n) + 'px', { onInput:fitNote });
  fitNote();
  gapF.classList.add('flowgap'); gapF.append(autoB);
  const iconSeg = (label, k, opts, title) => { const f = field(label, h('div', { class:'alrow' }, opts.map(([v, ic, t]) => tog((F[k] || opts[0][0]) === v, t, ICONS[ic], () => set({ [k]:v }))))); if (title) f.title = title; return f; };
  sec.append(...[gapF, warn,
    F.auto ? null : iconSeg('Fica', 'pin', [['start', 'pin_t', 'Em cima'], ['center', 'pin_m', 'No meio'], ['end', 'pin_b', 'Embaixo']], 'Onde a coluna encosta dentro da margem'),
    iconSeg('Horizontal', 'align', [['keep', 'fl_off', 'Manter: cada um fica onde você deixou'], ['start', 'al_l', 'À esquerda'], ['center', 'al_ch', 'No centro'], ['end', 'al_r', 'À direita']]),
    h('p', { class:'hint', text:'Grupos contam como um bloco; texto em cima de foto continua em cima dela; foto que sangra pela borda fica de fora. Quem não aparece junto não se empurra. Arraste um elemento para trocar de lugar.' })].filter(Boolean));
  return sec;
}
function flowGapAt(pt) {
  const px = FW() / (cv.getBoundingClientRect().width || 1), m = 6 * px;
  return flowGaps().find(g => { const a = g.v ? pt.y : pt.x, c = g.v ? pt.x : pt.y, mid = (g.s0 + g.s1) / 2, hw = Math.max(Math.abs(g.s1 - g.s0) / 2, m);
    return a >= mid - hw && a <= mid + hw && c >= g.c0 && c <= g.c1; }) || null;
}
// arrastar o espaço: muda o espaço do grupo (sai do Auto)
function startGapDrag(ev, pt, g) {
  pushUndo();
  RT.drag = { mode:'gap', L:selL(), g, pt0:pt, gap0:g.n };
  cv.setPointerCapture(ev.pointerId);
}
function gapDrag(D, pt) {
  const F = D.g.gid ? flowOf(D.g.gid) : S.flow; if (!F) return;
  F.auto = false; F.gap = Math.max(0, Math.round(D.gap0 + (D.g.v ? pt.y - D.pt0.y : pt.x - D.pt0.x)));
}
function drawFlowGaps(ctx, px) {
  for (const g of flowGaps()) {
    // layout do quadro: o espaço não fica fixo na tela, só aparece com o mouse em cima ou arrastando (pedido do usuário)
    if (!g.gid && !(RT.drag && RT.drag.mode === 'gap' && !RT.drag.g.gid) && RT.gapHot !== Math.round(g.s0)) continue;
    const [x, y, w, hh] = g.v ? [g.c0, g.s0, g.c1 - g.c0, g.s1 - g.s0] : [g.s0, g.c0, g.s1 - g.s0, g.c1 - g.c0];
    const hot = RT.drag && RT.drag.mode === 'gap' && RT.drag.g.gid === g.gid;
    ctx.fillStyle = hot ? 'rgba(255,92,163,.26)' : 'rgba(255,92,163,.14)'; ctx.fillRect(x, y, w, hh);
    ctx.strokeStyle = 'rgba(255,92,163,.95)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([]);
    const mx = x + w / 2, my = y + hh / 2, k = 8 * px; ctx.beginPath();
    if (g.v) { ctx.moveTo(mx - k, my); ctx.lineTo(mx + k, my); } else { ctx.moveTo(mx, my - k); ctx.lineTo(mx, my + k); }
    ctx.stroke();
    const t = String(g.n); ctx.font = `600 ${10.5 * px}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(t).width + 10 * px, th = 16 * px, tx = g.v ? mx + k + 4 * px + tw / 2 : mx, ty = g.v ? my : my - k - 4 * px - th / 2;
    ctx.fillStyle = '#FF5CA3'; rrect(ctx, tx - tw / 2, ty - th / 2, tw, th, 4 * px); ctx.fill();
    ctx.fillStyle = '#1B0710'; ctx.fillText(t, tx, ty + .5 * px);
  }
}

// arquivo vazio: o formato escolhido vira o principal. Com conteúdo, o principal fica onde estava e este se reorganiza a partir dele
function setFormat(k) {
  if (k === S.format) return;
  if (!hasContent()) S.base = k; else if (!FORMATS[S.base]) S.base = S.format;
  S.format = k; RT.layout.clear(); renderFormats(); fitStage(); changed({ props:true });
  if (k !== S.base && !RT.fmtTip) { RT.fmtTip = true; toast(`O ${fmtLabel(k)} se reorganiza sozinho a partir do ${fmtLabel(S.base)}. O que você mover aqui fica só nele.`, 6000); }
}
// Torna k o formato principal (clique duplo no botão do formato) sem mudar nada do que se vê, em nenhum formato: o que está na tela
// em k vira x/y (e tamanho/enquadramento) de verdade e os outros formatos, que passam a se reorganizar a partir de k, ganham em
// `fpos` a posição de antes se a conta nova cairia em outro lugar (mesma ideia de `keepPlace`).
function makeBase(k) {
  if (!FORMATS[k] || k === baseFmt() || !hasContent()) return;
  const cur = S.format, ls = S.layers.filter(l => l.type !== 'bg' && !NOBOX(l)), snap = new Map();
  flowBake(); pushUndo();
  const each = f => { try { for (const j of Object.keys(FORMATS)) { S.format = j; RT.frameNo = (RT.frameNo || 0) + 1; f(j); } } finally { S.format = cur; RT.frameNo++; } };
  each(j => snap.set(j, new Map(ls.map(L => [L.id, placeOf(L)]))));
  S.base = k; S.format = k; RT.frameNo++; RT.layout.clear();
  for (const L of ls) {
    const p = snap.get(k).get(L.id), f = (L.fpos && L.fpos[k]) || {};
    L.x = +p.x.toFixed(5); L.y = +p.y.toFixed(5);
    if (Math.abs(p.k - 1) > 1e-3) scaleLayer(L, size0(L), p.k);
    if (p.ww != null && (L.type === 'image' || L.type === 'shape')) L.size = +clamp(p.ww / W(), SZ_MIN, SZ_MAX).toFixed(4);
    if (p.hh != null && (L.type === 'image' || L.type === 'shape')) L.mh = +clamp(p.hh / W(), SZ_MIN, MH_MAX).toFixed(4);
    for (const key of ['ix', 'iy', 'zoom']) if (f[key] != null) L[key] = f[key];
    if (L.fpos) { delete L.fpos[k]; if (!Object.keys(L.fpos).length) delete L.fpos; }
  }
  each(j => { if (j !== k) holdPlace(snap.get(j), j, ls); });
  S.format = k; RT.layout.clear(); fitStage(); renderFormats(); changed({ props:true });
  toast(`${fmtLabel(k)} agora é o formato principal. Os outros ficaram como estavam; "Voltar ao automático" refaz a partir dele`, 7000, { label:'Desfazer', fn:() => undo() });
}
function renderFormats() {
  const box = $('#fmt'); box.innerHTML = '';
  const bf = baseFmt(), any = hasContent();
  for (const [k, f] of Object.entries(FORMATS)) box.append(h('button', { 'aria-pressed':String(S.format === k), class:any && k === bf ? 'base' : null, text:f.label, onclick:() => setFormat(k), ondblclick:() => makeBase(k),
    title:!any ? null : k === bf ? 'Formato principal: os outros se reorganizam a partir dele' : `Reorganizado a partir do ${fmtLabel(bf)}. O que você mover aqui fica só neste formato. Clique duplo: tornar principal` }));
  $('#dur').value = S.still ? 0 : S.duration; $('#slides').value = slides();
  // imagem estática: some tudo que é de vídeo (CSS em .app.still)
  $('#app').classList.toggle('still', !!S.still);
  $('#export').textContent = S.still ? 'Exportar PNG' : 'Exportar MP4';
  $('#export').title = S.still ? 'Salvar a imagem em PNG (Ctrl+Shift+E)' : 'Exportar o vídeo (Ctrl+Shift+E)';
  const fs = $('#fps'); if (!fs.options.length) FPS_OPTS.forEach(f => fs.append(h('option', { value:f, text:f }))); fs.value = fps();
  { const m = marginSides(); $('#mOn').checked = m.on; [['mT', 'top'], ['mR', 'right'], ['mB', 'bottom'], ['mL', 'left']].forEach(([id, k]) => { $('#' + id).value = m[k]; $('#' + id).disabled = !m.on; });
    $('#mSum').textContent = m.on ? `${m.top} · ${m.right} · ${m.bottom} · ${m.left}` : 'desligada'; }
}
function allFonts() { return S.brand.loaded.map(f => f.family); }
// Paleta em grupos, como no Figma. O grupo "Marca" é B.colors (as 5 primeiras são os papéis que os roteiros usam:
// Fundo, Texto, Destaque, Apoio, Profundo; nomes em B.names). Os demais ficam em B.groups [{ name, colors:[{ n, c }] }].
const ROLE_NAMES = ['Fundo', 'Texto', 'Destaque', 'Apoio', 'Profundo'];
function brandGroups(B) {
  if (!B.names) B.names = [];
  if (!B.groups) B.groups = [{ name:'Neutros', colors:[{ n:'Branco', c:'#ffffff' }, { n:'Cinza', c:'#8a8a8a' }, { n:'Preto', c:'#000000' }] }];
  return B.groups;
}
function allBrandColors() {
  const B = S.brand, out = [...B.colors];
  brandGroups(B).forEach(g => g.colors.forEach(x => out.push(x.c)));
  return [...new Set(out)];
}
// a paleta na ordem em que aparece na aba Marca: [{ title, items:[{ n, c }] }]
function brandLib() {
  const B = S.brand, nm = (i) => B.names?.[i] || ROLE_NAMES[i] || `Cor ${i + 1}`, hx = c => String(c).slice(0, 7).toLowerCase();
  const out = [{ title:'Marca', items:B.colors.map((c, i) => ({ n:nm(i), c:hx(c) })) }];
  brandGroups(B).forEach(g => out.push({ title:g.name, items:g.colors.map((x, i) => ({ n:x.n || `Cor ${i + 1}`, c:hx(x.c) })) }));
  return out.filter(g => g.items.length);
}
function renderPalette() {
  const B = S.brand, box = $('#brandColors'); box.innerHTML = '';
  const groups = brandGroups(B);
  const redo = () => { renderPalette(); renderProps(); autosave(); };
  const nameIn = (val, ph, onSet, cls) => {
    const i = h('input', { type:'text', class:cls, value:val, placeholder:ph, spellcheck:'false', maxlength:24, 'aria-label':ph });
    i.addEventListener('focus', () => { pushUndo(); i.select(); });
    i.addEventListener('change', () => { onSet(i.value.trim()); autosave(); });
    i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
    return i;
  };
  // Arrastar pela alça reorganiza dentro do grupo: `move(de, para)` troca a ordem nos dados.
  const grip = (i, move) => {
    const g = h('span', { class:'sw-grip', title:'Arrastar para reordenar', 'aria-label':'Arrastar para reordenar',
      html:'<svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3.5" r="1.7"/><circle cx="10" cy="3.5" r="1.7"/><circle cx="4" cy="9" r="1.7"/><circle cx="10" cy="9" r="1.7"/><circle cx="4" cy="14.5" r="1.7"/><circle cx="10" cy="14.5" r="1.7"/></svg>' });
    g.addEventListener('pointerdown', e => {
      if (e.button) return;
      e.preventDefault();
      const row = g.parentNode, list = row.parentNode;
      const rows = [...list.querySelectorAll(':scope > .swcol')];
      let to = i;
      row.classList.add('dragging'); g.setPointerCapture(e.pointerId);
      const idxAt = y => { let k = 0; rows.forEach((r, j) => { const b = r.getBoundingClientRect(); if (y > b.top + b.height / 2) k = j; }); return k; };
      const clear = () => rows.forEach(r => r.classList.remove('drop-above', 'drop-below'));
      const onMove = ev => {
        to = idxAt(ev.clientY); clear();
        if (to !== i) rows[to].classList.add(to < i ? 'drop-above' : 'drop-below');
      };
      const end = ev => {
        g.removeEventListener('pointermove', onMove); g.removeEventListener('pointerup', end); g.removeEventListener('pointercancel', end);
        clear(); row.classList.remove('dragging');
        if (ev.type === 'pointerup' && to !== i) { pushUndo(); move(i, to); redo(); }
      };
      g.addEventListener('pointermove', onMove); g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    });
    return g;
  };
  const reorder = (arrs, from, to) => arrs.forEach(a => { const [x] = a.splice(from, 1); a.splice(to, 0, x); });
  const chip = (c, label, onInput, onDel, nameEl, gripEl) => {
    const sw = colorButton(c, `Cor ${label}`, { cls:'sw', onStart:pushUndo, onInput:x => { onInput(x); needs = true; autosave(); } });
    return h('div', { class:'swcol' }, [gripEl, h('div', { class:'swwrap' }, [sw, onDel ? h('button', { class:'sw-del', title:'Remover cor', 'aria-label':'Remover cor', text:'×', onclick:() => { pushUndo(); onDel(); redo(); } }) : null]), nameEl]);
  };
  const group = (title, titleEl, chips, onAdd, onDelGroup) => h('div', { class:'pgroup' }, [
    h('div', { class:'pg-head' }, [titleEl || h('span', { class:'pg-name', text:title }), onDelGroup ? h('button', { class:'icon-btn', title:'Apagar grupo', 'aria-label':'Apagar grupo', html:ICONS.trash, onclick:() => { pushUndo(); onDelGroup(); redo(); } }) : null]),
    h('div', { class:'swatches' }, [...chips, h('button', { class:'sw-add', title:'Adicionar cor', 'aria-label':'Adicionar cor', text:'+ Adicionar cor', onclick:() => { pushUndo(); onAdd(); redo(); } })]),
  ]);
  // Marca
  box.append(group('Marca', null, B.colors.map((c, i) => chip(c, B.names[i] || ROLE_NAMES[i] || `Cor ${i + 1}`,
    x => { B.colors[i] = x; }, i >= ROLE_NAMES.length ? () => { B.colors.splice(i, 1); B.names.splice(i, 1); } : null,
    nameIn(B.names[i] || ROLE_NAMES[i] || '', `Cor ${i + 1}`, v => { B.names[i] = v; }, 'sw-lbl'),
    grip(i, (a, b) => {
      // o nome padrão (Fundo, Texto…) acompanha a cor: grava antes de mover
      B.colors.forEach((_, k) => { B.names[k] = B.names[k] || ROLE_NAMES[k] || ''; });
      reorder([B.colors, B.names], a, b);
    }))),
    () => { B.colors.push('#888888'); }));
  // Demais grupos
  groups.forEach((g, gi) => box.append(group(g.name, nameIn(g.name, 'Nome do grupo', v => { g.name = v || 'Grupo'; }, 'pg-name'),
    g.colors.map((x, ci) => chip(x.c, x.n || `Cor ${ci + 1}`, c => { x.c = c; }, () => g.colors.splice(ci, 1), nameIn(x.n, `Cor ${ci + 1}`, v => { x.n = v; }, 'sw-lbl'), grip(ci, (a, b) => reorder([g.colors], a, b)))),
    () => { g.colors.push({ n:'', c:'#888888' }); }, () => groups.splice(gi, 1))));
  box.append(h('button', { class:'btn small ghost pg-new', text:'+ Novo grupo', onclick:() => { pushUndo(); groups.push({ name:`Grupo ${groups.length + 1}`, colors:[{ n:'', c:'#888888' }] }); redo(); } }));
}
function renderBrand() {
  const B = S.brand;
  const th = $('#logoThumb'); th.innerHTML = '';
  if (RT.logo) th.append(h('img', { src:RT.logo.url || B.logo.data, alt:'Logo' }));
  $('#logoName').textContent = B.logo ? `${B.logo.name}${RT.logo ? (RT.logo.isSvg ? ` · ${RT.logo.parts.length} partes` : ' · imagem') : ''}` : 'SVG ou PNG';
  renderPalette();
  const fams = allFonts();
  [0, 1, 2].forEach(i => {
    const sel = $('#bf' + i); sel.innerHTML = '';
    fams.forEach(f => sel.append(h('option', { value:f, text:f, selected:B.fonts[i] === f })));
    sel.onchange = () => {
      const old = B.fonts[i]; B.fonts[i] = sel.value; pushUndo();
      // troca nas camadas que usavam a fonte antiga
      S.layers.forEach(L => { if ((L.type === 'text' || L.type === 'cta') && L.font === old) L.font = sel.value; });
      RT.layout.clear(); changed({ props:true });
    };
  });
  const fl = $('#fontList'); fl.innerHTML = '';
  B.loaded.forEach(f => fl.append(h('span', { class:'ftag' + (RT.fontsBad.has(f.family) ? ' err' : ''), text:f.family + (f.src === 'file' ? ' · arquivo' : ''), title:RT.fontsBad.has(f.family) ? 'Não carregou' : '' })));
}
/* ------------ célula de camada e de grupo ------------
   Um componente só, usado na lista de Camadas (where = 'list') e na coluna de nomes da timeline (where = 'tl'):
   mesmas ações (subir, descer, bloquear, ocultar, desagrupar), mesmo clique, renomear e arrastar. Ação nova entra aqui, não em cada lugar. */
function setVisible(ls, on) { if (!ls.length) return; pushUndo(); ls.forEach(l => { l.visible = on; }); changed({ layers:true }); }
function actBtn(title, icon, fn, o = {}) {
  return h('button', { class:'icon-btn' + (o.on ? ' on' : ''), title, 'aria-label':title, 'aria-pressed':o.pressed == null ? null : String(o.pressed), html:icon, onclick:e => { e.stopPropagation(); fn(); } });
}
// bloquear e ocultar de um conjunto (uma camada ou os itens de um grupo)
function lockVisAct(ls) {
  const lk = ls.every(l => l.locked), vs = ls.every(l => l.visible), one = ls.length === 1, g = one ? '' : ' o grupo';
  const fix = b => (b.classList.add('fix'), b);   // cadeado e olho têm lugar fixo: não andam ao passar o mouse
  return [
    fix(actBtn((lk ? 'Desbloquear' : 'Bloquear') + g, lk ? ICONS.lock : ICONS.unlock, () => setLock(ls, !lk), { on:lk, pressed:lk })),
    fix(actBtn((vs ? 'Ocultar' : 'Mostrar') + g, vs ? ICONS.eye : ICONS.eyeOff, () => setVisible(ls, !vs), { on:!vs })),
  ];
}
/* Ordem em que a lista e a timeline mostram as camadas: [{ gid, depth }] = cabeçalho de frame, [{ L, depth }] = camada.
   Frame dentro de frame vem logo depois do de fora, um nível mais recuado (`depth`); recolher um frame esconde tudo que está dentro dele. */
function layerTree(layers) {
  const out = [], seen = new Set();
  for (const L of layers) {
    const chain = L.grp ? gchain(L.grp) : [];
    let shut = false;
    for (let i = 0; i < chain.length && !shut; i++) {
      if (!seen.has(chain[i])) { seen.add(chain[i]); out.push({ gid:chain[i], depth:i }); }
      if ((gmeta(chain[i]) || {}).open === false) shut = true;
    }
    if (!shut) out.push({ L, depth:chain.length });
  }
  return out;
}
// recuo por nível: lista = margem da célula; timeline = respiro à esquerda do nome
const cellIndent = (el, list, depth, base, step) => { if (depth > 0) el.style[list ? 'marginLeft' : 'paddingLeft'] = (base + step * depth) + 'px'; };
function layerCell(L, where, depth = L.grp ? 1 : 0) {
  const list = where === 'list', bg = L.type === 'bg', i = S.layers.indexOf(L);
  const el = h('div', { class:(list ? 'layer' : 'tl-nm') + ' lcell' + (list ? (L.visible ? '' : ' off') + (L.locked ? ' locked' : '') + (L.grp ? ' ingrp' : '') : ''),
    title:list ? null : 'Clique duas vezes para renomear. Arraste para reordenar', onclick:e => clickOrRename(L, where, e) }, [
    h('span', { class:'dot', style:`background:${TYPE_COLOR[typeKey(L)]}` }),
    h('span', { class:'lnm', title:list ? 'Clique duas vezes para renomear. Arraste para reordenar' : null }, [L.name, bg || S.still ? null : h('small', { text:`${L.start.toFixed(1)}s` })]),
    h('div', { class:'acts' }, [
      bg ? null : actBtn('Subir', ICONS.up, () => move(i, 1)),
      bg ? null : actBtn('Descer', ICONS.down, () => move(i, -1)),
      ...(bg ? [actBtn(L.visible ? 'Ocultar' : 'Mostrar', L.visible ? ICONS.eye : ICONS.eyeOff, () => setVisible([L], !L.visible), { on:!L.visible })] : lockVisAct([L])),
    ])]);
  if (list) {
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-selected', String(isPicked(L.id)));
    el.oncontextmenu = e => openMenu(e, L); el.onkeydown = e => { if (e.key === 'Enter') select(L.id); };
    el.onmouseenter = () => setHover(L.id); el.onmouseleave = () => setHover(null);
    el.dataset.id = L.id;
  }
  cellIndent(el, list, L.grp ? depth : 0, list ? 0 : 16, list ? 10 : 12);
  dragReorder(el, L);
  return el;
}
// escolhe o frame gid inteiro (com os de dentro), não o frame de fora
function selectGroup(gid) {
  const lv = gleaves(gid); if (!lv.length) return;
  RT.picks = new Set(lv.map(l => l.id)); RT.selected = lv[lv.length - 1].id; renderLayers(); renderProps(); needs = true;
}
function groupCell(gid, where, depth = 0) {
  const list = where === 'list', g = gmeta(gid, true), mem = gleaves(gid);
  const flip = () => { g.open = g.open === false; renderLayers(); autosave(); };
  const chev = h('button', { class:'tl-chev', title:g.open === false ? 'Mostrar os itens do grupo' : 'Recolher o grupo', 'aria-label':'Recolher ou expandir o grupo', 'aria-expanded':String(g.open !== false), text:'▾',
    onpointerdown:e => { e.stopPropagation(); if (e.button) return; e.preventDefault(); flip(); },
    onclick:e => { e.stopPropagation(); if (e.detail === 0) flip(); } });
  chev.style.transform = g.open === false ? 'rotate(-90deg)' : '';
  const el = h('div', { class:(list ? 'lgroup' : 'tl-nm') + ' lcell', title:'Clique para selecionar o grupo. Clique duas vezes para renomear. Ctrl + clique num item escolhe só ele', onclick:e => {
    if (e.detail > 1) { renameGroupInline(gid, e.currentTarget.querySelector('.lnm')); return; }
    selectGroup(gid);
  } }, [chev, h('span', { class:'lnm', text:groupName(gid) }), h('small', { class:'tl-n', text:String(mem.length) }),
    h('div', { class:'acts' }, [...lockVisAct(mem), actBtn('Desagrupar', '<span class="x">×</span>', () => { selectGroup(gid); ungroupSel(); })])]);
  if (list) {
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-selected', String(!itemSel() && mem.every(m => isPicked(m.id))));
    el.onkeydown = e => { if (e.key === 'Enter') selectGroup(gid); };
  }
  if (depth > 0) el.classList.add('nested');
  if (g.open === false && mem.some(m => isPicked(m.id)) && !(!itemSel() && mem.every(m => isPicked(m.id)))) el.classList.add('has-sel'); // recolhido com algo escolhido dentro
  cellIndent(el, list, depth, list ? 0 : 6, list ? 10 : 12);
  groupDrop(el, gid);
  el.draggable = true;
  el.addEventListener('dragstart', e => { dragGroupId = gid; dragLayerId = mem[0].id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', gid); setTimeout(() => el.classList.add('dragging')); });
  el.addEventListener('dragend', () => { dragGroupId = null; dragLayerId = null; el.classList.remove('dragging'); document.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in')); });
  return el;
}
/* A seleção nunca fica escondida (como no Figma): quando ela muda, os frames recolhidos que contêm algo escolhido se abrem.
   Frame inteiro escolhido abre só os de fora dele (ele mesmo continua como estava). Só na troca de seleção (`RT.revealKey`):
   recolher à mão depois continua valendo. Quem recolhe com algo escolhido dentro ganha o cabeçalho marcado (`has-sel`). */
function revealPicks() {
  const pk = pickedLayers(), key = pk.map(l => l.id).join(',') + '|' + (wholeGroup() || '');
  if (key === RT.revealKey) return; RT.revealKey = key;
  const wg = wholeGroup(); let opened = false;
  for (const L of pk) if (L.grp) for (const g of gchain(L.grp)) {
    if (g === wg) break; // daqui para dentro faz parte do frame escolhido inteiro
    const m = gmeta(g); if (m && m.open === false) { m.open = true; opened = true; }
  }
  // a timeline cresce com as linhas e o palco encolheria embaixo do mouse (o 2º clique duplo cairia em outro lugar): fica da altura que estava
  const tl = $('#tl'); if (opened && tl && !tl.hidden && !tl.style.height) tl.style.height = tl.offsetHeight + 'px';
}
function renderLayers() {
  revealPicks();
  const box = $('#layers'); box.innerHTML = '';
  for (const n of layerTree([...S.layers].reverse())) box.append(n.gid ? groupCell(n.gid, 'list', n.depth) : layerCell(n.L, 'list', n.depth));
  renderMarks();
}
// renomear no lugar: clique duplo no nome (lista e timeline) ou "Renomear" no menu
function renameInline(L, span) {
  if (!span || span.querySelector('input')) return;
  const old = L.name, inp = h('input', { type:'text', value:old, class:'nm-edit', 'aria-label':'Nome da camada' });
  const box = span.closest('[draggable]'); if (box) box.draggable = false;
  span.textContent = ''; span.append(inp); inp.focus(); inp.select();
  let done = false;
  const end = ok => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v && v !== old) { pushUndo(); L.name = v; changed({ layers:true, props:true }); } else changed({ layers:true });
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); });
  inp.addEventListener('blur', () => end(true));
  ['click', 'dblclick', 'pointerdown'].forEach(n => inp.addEventListener(n, e => e.stopPropagation()));
}
function renameGroupInline(gid, span) {
  if (!span || span.querySelector('input')) return;
  const old = groupName(gid), inp = h('input', { type:'text', value:old, class:'nm-edit', 'aria-label':'Nome do grupo' });
  const box = span.closest('[draggable]'); if (box) box.draggable = false;
  span.textContent = ''; span.append(inp); inp.focus(); inp.select();
  let done = false;
  const end = ok => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v && v !== old) { pushUndo(); gmeta(gid, true).name = v; changed({ layers:true, props:true }); } else changed({ layers:true });
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') end(true); if (e.key === 'Escape') end(false); });
  inp.addEventListener('blur', () => end(true));
  ['click', 'dblclick', 'pointerdown'].forEach(n => inp.addEventListener(n, e => e.stopPropagation()));
}
function renameLayer(L, where) {
  const q = w => document.querySelector(w === 'tl' ? `#tl .tl-row[data-id="${L.id}"] .lnm` : `#layers .layer[data-id="${L.id}"] .lnm`);
  let s = q(where);
  // lista de camadas fechada ou coluna escondida: renomeia na timeline; sem ela, a lista aparece
  if (s && !s.offsetParent && where !== 'tl') { const t = q('tl'); if (t && t.offsetParent) s = t; else { paneShow('left'); foldReveal(s); } }
  renameInline(L, s);
}
// o primeiro clique re-renderiza a lista, então o dblclick nativo se perde: conta o segundo clique na mão
let lastClick = { id:null, t:0 };
function clickOrRename(L, where, ev) {
  if (ev && ev.shiftKey) { lastClick = { id:null, t:0 }; toggleSel(L); return; }
  if (ev && (ev.ctrlKey || ev.metaKey) && L.type !== 'bg') { lastClick = { id:null, t:0 }; select(L.id, true); return; }
  const now = performance.now(), dbl = lastClick.id === L.id && now - lastClick.t < 700 && L.type !== 'bg';
  lastClick = dbl ? { id:null, t:0 } : { id:L.id, t:now };
  if (dbl) renameLayer(L, where); else select(L.id, where === 'tl');  // na timeline o item do grupo se escolhe sozinho; o grupo tem a própria linha
}
// arrastar para reordenar (lista de camadas e nomes da timeline). Topo da tela = mais à frente.
let dragLayerId = null, dragGroupId = null;
function dragReorder(el, L) {
  if (L.type === 'bg') return;
  el.draggable = true;
  const clear = () => document.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in'));
  el.addEventListener('dragstart', e => { dragLayerId = L.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', L.id); setTimeout(() => el.classList.add('dragging')); });
  el.addEventListener('dragend', () => { dragLayerId = null; el.classList.remove('dragging'); clear(); });
  el.addEventListener('dragover', e => {
    if (!dragLayerId || dragLayerId === L.id) return;
    e.preventDefault(); clear();
    const r = el.getBoundingClientRect();
    el.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-after'); });
  el.addEventListener('drop', e => {
    if (!dragLayerId || dragLayerId === L.id) return;
    e.preventDefault();
    const above = el.classList.contains('drop-before'); clear();
    const one = S.layers.find(l => l.id === dragLayerId); dragLayerId = null;
    if (one) applyDrop(one, L, above);
  });
}
// solta em cima de um item (entra no grupo dele, ou sai do grupo se o item não tem) ou do cabeçalho de um grupo (metade de cima = acima do grupo, de baixo = dentro)
function applyDrop(one, T, above, gid) {
  // arrastar uma camada da seleção leva todas juntas (mantendo a ordem entre elas)
  const dg = dragGroupId; dragGroupId = null;
  const mvs = dg ? gleaves(dg) : isPicked(one.id) ? pickedLayers() : [one];
  if (!mvs.includes(one)) mvs.push(one);
  const set = new Set(mvs);
  if (T && set.has(T)) return;
  const members = gid ? gleaves(gid) : [];
  if (gid && members.every(m => set.has(m))) return;
  // frame arrastado pelo cabeçalho (com os de dentro) é sempre "inteiro": a estrutura dele não muda, só o lugar na pilha
  const g0 = dg || mvs[0].grp, whole = !!dg || (!!g0 && mvs.every(m => m.grp === g0) && S.layers.filter(l => l.grp === g0).every(m => set.has(m)));
  const block = S.layers.filter(l => set.has(l));
  pushUndo();
  S.layers = S.layers.filter(l => !set.has(l));
  // "acima" na tela = índice maior (frame = ele e os de dentro)
  const topOf = id => Math.max(...S.layers.map((l, i) => l.grp && ginside(l.grp, id) ? i : -1)) + 1;
  let j, ng;
  if (gid) { j = topOf(gid); ng = above ? gpar(gid) || undefined : gid; }
  else { j = S.layers.indexOf(T) + (above ? 1 : 0); ng = T.grp; }
  if (whole && ng && ng !== g0) { j = topOf(gtop(ng)); ng = undefined; }  // grupo inteiro não entra em outro grupo
  j = Math.max(1, j);
  S.layers.splice(j, 0, ...block);
  if (!whole) block.forEach(l => { if (ng) l.grp = ng; else delete l.grp; });
  pruneGroups();
  changed({ layers:true });
}
// cabeçalho do grupo como alvo de soltar
// grupo sem camada nenhuma (nem nos frames de dentro) some
function pruneGroups() { if (S.groups) for (const k of Object.keys(S.groups)) if (!S.layers.some(l => l.grp && ginside(l.grp, k))) delete S.groups[k]; }
function groupDrop(el, gid) {
  const clear = () => document.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in'));
  el.addEventListener('dragover', e => {
    if (!dragLayerId) return;
    e.preventDefault(); clear();
    const r = el.getBoundingClientRect();
    el.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-in');
  });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-in'); });
  el.addEventListener('drop', e => {
    if (!dragLayerId) return;
    e.preventDefault();
    const above = el.classList.contains('drop-before'); clear();
    const one = S.layers.find(l => l.id === dragLayerId); dragLayerId = null;
    if (one) applyDrop(one, null, above, gid);
  });
}
function move(i, d) {
  const j = i + d; if (j < 1 || j >= S.layers.length) return;
  pushUndo(); [S.layers[i], S.layers[j]] = [S.layers[j], S.layers[i]]; changed({ layers:true });
}
function duplicateLayer(L) {
  const src = isPicked(L.id) && L.type !== 'bg' ? pickedLayers() : [L], gm = {};
  pushUndo(); let last = null;
  for (const o of src) {
    const c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.name = o.name + ' (cópia)'; c.y = Math.min(1, o.y + .06);
    for (const f in c.fpos || {}) c.fpos[f].y = Math.min(1, c.fpos[f].y + .06); // ajustes de outros formatos descem junto
    if (o.grp) {
      if (!gm[o.grp]) { gm[o.grp] = 'g' + Math.random().toString(36).slice(2, 7); const gmt = gmeta(o.grp); if (gmt) (S.groups ||= {})[gm[o.grp]] = JSON.parse(JSON.stringify(gmt)); }
      c.grp = gm[o.grp];
    }
    S.layers.splice(S.layers.indexOf(o) + 1, 0, c); last = c;
  }
  select(last.id); changed({ layers:true });
}
function deleteLayer(L, msg) {
  if (!L || L.type === 'bg') return;
  const grp = isPicked(L.id) ? pickedLayers() : [L];
  if (grp.some(g => g.locked)) { lockedNote(grp); return; }
  pushUndo(); const i = S.layers.indexOf(L);
  grp.forEach(g => S.layers.splice(S.layers.indexOf(g), 1));
  RT.selected = (S.layers[Math.min(i, S.layers.length - 1)] || S.layers[0])?.id; RT.picks = new Set([RT.selected]); RT.hover = null;
  changed({ layers:true, props:true }); toast(msg || (grp.length > 1 ? `${grp.length} camadas apagadas` : `"${L.name}" apagada`), 5000, UNDO_ACT);
}
/* ------------ copiar e colar camadas (Ctrl+C / Ctrl+X / Ctrl+V), também de um arquivo para outro ------------
   Vai pela área de transferência do sistema como texto com o prefixo CLIP_TAG. Leva junto as fontes usadas e o nome dos grupos. */
const CLIP_TAG = 'mola-camadas:';
function clipPayload() {
  const ls = pickedLayers(); if (!ls.length) return null;
  const fams = new Set(ls.map(l => l.font).filter(Boolean)), groups = {};
  ls.forEach(l => { if (l.grp && S.groups && S.groups[l.grp]) groups[l.grp] = S.groups[l.grp]; });
  return { v:1, dur:S.duration, layers:ls.map(l => { const c = JSON.parse(JSON.stringify(l)); delete c._bounds; return c; }), fonts:S.brand.loaded.filter(f => fams.has(f.family)), groups };
}
/* ------------ inserir dentro do frame selecionado (como no Figma) ------------
   Frame/grupo inteiro selecionado: colar e "Adicionar" põem o novo dentro dele; item de dentro escolhido sozinho: ao lado dele, no mesmo frame.
   ids = o que está sendo colado: colar o próprio frame com ele selecionado põe a cópia ao lado (no frame de cima), não dentro dele */
function insertTarget(ids) {
  let g = wholeGroup() || (pickedLayers().length === 1 && selL()?.grp) || null;
  while (g && ids && gleaves(g).every(l => ids.has(l.id))) g = gpar(g);
  return g;
}
// ls já estão em S.layers: entram no frame gid (grupos colados viram frames de dentro), logo acima do último item dele na pilha;
// com layout automático, vão para o fim da fila (logo depois do último, com o espaço do frame)
function intoFrame(gid, ls) {
  const before = gleaves(gid), last = Math.max(-1, ...before.map(l => S.layers.indexOf(l)));
  for (const L of ls) {
    if (L.grp) { const m = gmeta(L.grp, true); if (!gpar(L.grp) && L.grp !== gid) m.parent = gid; } else L.grp = gid;
    S.layers.splice(S.layers.indexOf(L), 1);
  }
  S.layers.splice(last < 0 ? S.layers.length : last + 1, 0, ...ls);
  const F = flowOf(gid), vis = before.filter(l => l.visible);
  if (!F || !vis.length) return;
  ls.forEach(l => { l._ff = l.flowFree; l.flowFree = true; }); // medidos soltos, fora da fila
  RT.frameNo = (RT.frameNo || 0) + 1;
  try {
    const box = groupBox(gid, vis); ensureBounds(ls, true);
    const bs = ls.map(l => l._bounds).filter(Boolean); if (!box || !bs.length) return;
    const { x:ux, y:uy, w:uw, h:uh } = unionBox(bs);
    const gap = F.auto ? 24 : F.gap ?? 24, al = (o, s, bo, bs_) => F.align === 'start' ? bo - o : F.align === 'end' ? bo + bs_ - o - s : bo + bs_ / 2 - o - s / 2;
    const v = F.dir !== 'h', dx = v ? al(ux, uw, box.x, box.w) : box.x + box.w + gap - ux, dy = v ? box.y + box.h + gap - uy : al(uy, uh, box.y, box.h);
    for (const L of ls) {
      const p = posOf(L); setPos(L, p.x + dx / W(), p.y + dy / H());
      if (fmtOwn()) { L.x += dx / W(); L.y += dy / H(); } // a ordem da fila no principal também
    }
  } finally {
    ls.forEach(l => { if (l._ff) l.flowFree = l._ff; else delete l.flowFree; delete l._ff; });
    RT.frameNo++;
  }
}
// carrossel: leva camadas do slide s0 para o s (x anda slides inteiros, também nos ajustes por formato)
function toSlide(ls, s0, s) {
  const d = s - s0; if (!d) return;
  for (const l of ls) { l.x = +((+l.x || 0) + d).toFixed(5); if (l.fpos) for (const f of Object.values(l.fpos)) if (f && f.x != null) f.x = +(f.x + d).toFixed(5); }
}
function pasteLayers(p) {
  const src = (p && Array.isArray(p.layers) ? p.layers : []).filter(o => o && o.type && o.type !== 'bg');
  if (!src.length) return;
  const fr = insertTarget(new Set(src.map(o => o.id)));
  pushUndo();
  let fontsAdded = false;
  for (const f of p.fonts || []) if (f && f.family && !S.brand.loaded.some(x => x.family === f.family)) {
    S.brand.loaded.push(f); fontsAdded = true;
    (f.src === 'file' ? loadFileFont(f) : loadGoogleFont(f.family)).then(() => renderBrand());
  }
  const gm = {}, out = [], ids = new Set(src.map(o => o.id));
  for (const o of src) {
    const c = JSON.parse(JSON.stringify(o)); c.id = uid();
    // item copiado de dentro de um grupo (sem o grupo inteiro) chega solto, como no Figma
    if (c.grp && S.groups && S.groups[c.grp] && !gleaves(c.grp).every(l => ids.has(l.id))) delete c.grp;
    if (c.grp) {
      if (!gm[c.grp]) { gm[c.grp] = 'g' + Math.random().toString(36).slice(2, 7); if (p.groups && p.groups[c.grp]) { (S.groups ||= {})[gm[c.grp]] = { ...p.groups[c.grp] }; delete S.groups[gm[c.grp]].parent; } }
      c.grp = gm[c.grp];
    }
    // o que ia até o fim do vídeo de origem vai até o fim deste; o resto fica dentro da duração
    const toEnd = c.end == null || (p.dur && c.end >= p.dur - .01);
    c.start = clamp(+c.start || 0, 0, Math.max(0, S.duration - .3));
    c.end = toEnd ? S.duration : clamp(c.end, c.start + .3, S.duration);
    if (c.src) getImage(c.src);
    S.layers.push(c); out.push(c);
  }
  // carrossel: Meus elementos entram no slide atual; colado que cairia depois do último slide (veio de um carrossel maior) também
  if (!fr) { const s0 = Math.floor(clamp(Math.min(...out.map(l => +l.x || 0)), 0, 1e3)); if (p.here || s0 >= slides()) toSlide(out, s0, curSlide()); }
  if (fr) intoFrame(fr, out);
  RT.picks = new Set(out.map(l => l.id)); RT.selected = out[out.length - 1].id;
  if (fontsAdded) renderBrand();
  renderLayers(); renderProps(); changed();
  toast((out.length > 1 ? `${out.length} elementos colados` : `"${out[0].name}" colado`) + (fr ? ` em "${groupName(fr)}"` : ''));
}
const typingIn = t => { const tag = (t && t.tagName || '').toLowerCase(); return tag === 'input' && !['range', 'checkbox', 'color', 'button'].includes(t.type) || tag === 'textarea' || tag === 'select' || !!(t && t.isContentEditable); };
const overlayOpen = () => !$('#files').hidden || !$('#modal').hidden || !$('#keys').hidden || !!CUTWIN;
['copy', 'cut'].forEach(kind => document.addEventListener(kind, e => {
  if (typingIn(e.target) || overlayOpen() || String(getSelection() || '').length) return; // texto selecionado copia o texto
  const L = selL(), p = clipPayload(); if (!p) return;
  e.preventDefault(); e.clipboardData.setData('text/plain', CLIP_TAG + JSON.stringify(p));
  const what = p.layers.length > 1 ? `${p.layers.length} elementos` : `"${p.layers[0].name}"`;
  if (kind === 'cut') deleteLayer(L, `${what} recortado${p.layers.length > 1 ? 's' : ''}. Ctrl+V cola`);
  else toast(`${what} copiado${p.layers.length > 1 ? 's' : ''}. Ctrl+V cola aqui ou em outro arquivo`);
}));
/* ------------ menu do botão direito ------------ */
function closeMenu() { document.querySelector('.ctx')?.remove(); }
function openMenu(ev, L) {
  ev.preventDefault(); closeMenu();
  if (!L) return;
  if (!isPicked(L.id)) select(L.id); else RT.selected = L.id;
  const i = S.layers.indexOf(L), isBg = L.type === 'bg';
  const item = (text, fn, o = {}) => h('button', { class:o.danger ? 'danger' : null, disabled:o.off || null, onclick:() => { closeMenu(); fn(); } }, [h('span', { text }), o.kbd ? h('kbd', { text:o.kbd }) : null]);
  const m = h('div', { class:'ctx', role:'menu' }, [
    ...(S.still ? [] : [ // imagem estática: sem tempo
      item('Ir para este elemento', () => seekLayer(L), { off:isBg }),
      item('Ver a entrada', () => previewIn(L), { off:isBg }),
      item('Entrar na agulha', () => markAt('start'), { off:isBg, kbd:'I' }),
      item('Sair na agulha', () => markAt('end'), { off:isBg, kbd:'O' }),
      h('hr')]),
    item('Renomear', () => renameLayer(L), { off:isBg }),
    item('Copiar', () => document.execCommand('copy'), { off:isBg, kbd:'Ctrl+C' }),
    item('Duplicar', () => duplicateLayer(L), { off:isBg, kbd:'Ctrl+D' }),
    item('Salvar em Meus elementos', saveElement, { off:isBg }),
    item('Agrupar', groupSel, { off:isBg || pickedLayers().length < 2, kbd:'Ctrl+G' }),
    item('Desagrupar', ungroupSel, { off:!L.grp, kbd:'Ctrl+Shift+G' }),
    item(L.locked ? 'Desbloquear' : 'Bloquear', toggleLock, { off:isBg, kbd:'Ctrl+Shift+L' }),
    item(L.visible ? 'Ocultar' : 'Mostrar', () => { if (isBg) { pushUndo(); L.visible = !L.visible; changed({ layers:true }); } else toggleVisible(); }, { kbd:'Ctrl+Shift+H' }),
    item('Trazer para frente', () => move(i, 1), { off:isBg || i >= S.layers.length - 1, kbd:'Ctrl+]' }),
    item('Enviar para trás', () => move(i, -1), { off:isBg || i <= 1, kbd:'Ctrl+[' }),
    h('hr'),
    item('Converter em vetor', vectorize, { off:isBg || !(L.type === 'text' || canOutline(L)), kbd:'Ctrl+Shift+O' }),
    item('Salvar seleção (PNG)', () => saveFramePng(), { off:isBg }),
    item('Salvar seleção (SVG)', () => exportSvg(), { off:isBg }),
    item('Salvar quadro todo (PNG)', () => saveFramePng('frame')),
    item('Salvar quadro todo (SVG)', () => exportSvg('frame')),
    h('hr'),
    item('Apagar', () => deleteLayer(L), { danger:true, off:isBg, kbd:'Del' }),
  ]);
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(ev.clientX, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - r.height - 8) + 'px';
}
addEventListener('pointerdown', e => { if (!e.target.closest('.ctx')) closeMenu(); }, true);
addEventListener('resize', closeMenu);
addEventListener('wheel', e => { if (!e.target.closest('.ctx')) closeMenu(); }, { passive:true });
cv.addEventListener('contextmenu', ev => { const L = hitTest(stagePt(ev)) || S.layers.find(l => l.type === 'bg'); RT.drag = null; openMenu(ev, L); });
/* ------------ timeline ------------ */
// mostra as camadas como barras (entra..sai); arrastar muda só início e fim, sem keyframes
const tlLabel = L => {
  if (L.type === 'camera') return (CAMS[L.cam] || {}).label || '';
  if (L.type === 'fx') return (FXS[L.fx] || {}).label || '';
  const m = L.type === 'text' ? TP : BP; return (m[L.in] || {}).label || '';
};
function tlGeom() { const tl = $('#tl'), lane = tl.querySelector('.tl-scale'); if (!lane) return null; const r = lane.getBoundingClientRect(); return { x0:r.left, w:r.width, tl }; }
function placeHead() {
  const g = tlGeom(); if (!g) return;
  const hd = g.tl.querySelector('.tl-head'); if (!hd) return;
  hd.style.height = '0px'; hd.style.height = g.tl.scrollHeight + 'px'; // bottom:0 só cobre a área visível; a agulha vai até o fim das camadas
  hd.style.left = (g.x0 - g.tl.getBoundingClientRect().left + T / S.duration * g.w) + 'px';
}
function placeBar(bar, L) {
  const d = S.duration, end = L.end ?? d, ph = phase(L, L.start) || { inD:0, outD:0 }, span = Math.max(.001, end - L.start);
  bar.style.left = (L.start / d * 100) + '%'; bar.style.width = (span / d * 100) + '%';
  bar.querySelector('.seg.in').style.width = (ph.inD / span * 100) + '%';
  bar.querySelector('.seg.out').style.width = (ph.outD / span * 100) + '%';
}
// reposiciona as barras existentes (velocidade, duração de entrada/saída etc.) sem refazer a timeline
function refreshBars() {
  const tl = $('#tl'); if (!tl || tl.hidden) return;
  for (const row of tl.querySelectorAll('.tl-row')) {
    const bar = row.querySelector('.tl-bar'); if (!bar || bar.classList.contains('drag')) continue;
    if (row.dataset.gid) { if (gleaves(row.dataset.gid).length) placeBar(bar, gpseudo(row.dataset.gid)); }
    else { const L = S.layers.find(l => l.id === row.dataset.id); if (L) placeBar(bar, L); }
  }
}
function renderTimeline() {
  const tl = $('#tl'); if (!tl || tl.hidden) return;
  revealPicks();
  const keep = tl.scrollTop; tl.innerHTML = '';
  const d = S.duration, ruler = h('div', { class:'tl-ruler' }, [h('div', { class:'tl-nm', style:'cursor:default' }, [h('span', { text:'Camadas' })])]);
  const scale = h('div', { class:'tl-scale' });
  const step = d > 30 ? 5 : d > 12 ? 2 : 1;
  for (let s = 0; s <= d + 1e-6; s += step) { const x = s / d * 100; scale.append(h('i', { style:`left:${x}%` })); if (s < d - step * .3) scale.append(h('b', { style:`left:${x}%`, text:s + 's' })); }
  const endH = h('div', { class:'tl-end', title:`Duração do vídeo: ${d.toFixed(1)}s. Arraste para mudar` });
  endH.addEventListener('pointerdown', tlDuration);
  scale.append(endH);
  for (const b of beatTimes()) scale.append(h('u', { class:'tl-beat', style:`left:${(b / d * 100).toFixed(3)}%` })); // batidas da música
  ruler.append(scale); tl.append(ruler);
  if (S.audio) tl.append(audioRow());
  const els = S.layers.filter(L => L.type !== 'bg').reverse();
  if (!els.length) tl.append(h('div', { class:'tl-empty', text:'Nenhum elemento ainda. Use Adicionar, na coluna da esquerda.' }));
  const groupRow = (gid, depth) => {
    const g = gmeta(gid, true), mem = gleaves(gid), on = !itemSel() && mem.every(m => isPicked(m.id));
    const bar = h('div', { class:'tl-bar grp', style:`--c:var(--accent)` }, [h('div', { class:'seg in' }), h('div', { class:'seg out' }), h('div', { class:'h l' }), h('div', { class:'h r' })]);
    const tip = () => { const w = gwin(gid); bar.title = `${groupName(gid)}: ${w.start.toFixed(1)}s a ${w.end.toFixed(1)}s. Arraste para os lados para mover o grupo todo, para cima ou para baixo para mudar a ordem`; };
    placeBar(bar, gpseudo(gid)); tip();
    const lane = h('div', { class:'tl-lane' }, [bar]);
    lane.addEventListener('pointerdown', e => {
      if (e.button) return; const m = tlHit(bar, e.clientX);
      if (m && mem.some(l => l.locked)) { e.stopPropagation(); select(mem[mem.length - 1].id); lockedNote(mem); return; } // grupo com item bloqueado não se move
      if (m) tlDragGroup(e, gid, bar, m); else tlScrub(e);
    });
    lane.addEventListener('pointermove', e => {
      if (bar.classList.contains('drag')) return;
      const m = tlHit(bar, e.clientX), c = m === 'l' || m === 'r' ? 'ew-resize' : '';
      lane.style.cursor = c; bar.style.cursor = c; bar.classList.toggle('hl', m === 'l'); bar.classList.toggle('hr', m === 'r');
    });
    lane.addEventListener('pointerleave', () => { if (!bar.classList.contains('drag')) bar.classList.remove('hl', 'hr'); });
    const row = h('div', { class:'tl-row grp' + (on ? ' sel' : '') }, [groupCell(gid, 'tl', depth), lane]);
    row.dataset.gid = gid;
    tl.append(row);
    return g;
  };
  for (const n of layerTree(els)) {
    if (n.gid) { groupRow(n.gid, n.depth); continue; }
    const L = n.L;
    const bar = h('div', { class:'tl-bar', style:`--c:${TYPE_COLOR[typeKey(L)]}`, title:`${L.name}: entra em ${L.start.toFixed(1)}s, sai em ${(L.end ?? d).toFixed(1)}s. Arraste para cima ou para baixo para mudar a ordem. Clique duplo leva a agulha até ele. I e O marcam entrada e saída na agulha` }, [
      h('div', { class:'seg in' }), h('div', { class:'seg out' }), h('em', { text:tlLabel(L) }), h('div', { class:'h l' }), h('div', { class:'h r' })]);
    placeBar(bar, L);
    const lane = h('div', { class:'tl-lane' }, [bar]);
    // a faixa inteira decide: perto da borda (dentro ou fora da barra) redimensiona, no meio move, no vazio leva a agulha
    lane.addEventListener('pointerdown', e => {
      if (e.button) return;
      const m = tlHit(bar, e.clientX);
      if (e.shiftKey && m) { e.preventDefault(); e.stopPropagation(); toggleSel(L); return; } // sem stopPropagation o .stage solta a seleção
      if (m && L.locked) { e.stopPropagation(); if (!isPicked(L.id)) select(L.id, true); tlScrub(e); return; } // bloqueada: a barra só seleciona
      if (m) tlDrag(e, L, bar, m); else tlScrub(e);
    });
    lane.addEventListener('pointermove', e => {
      if (bar.classList.contains('drag')) return;
      const m = L.locked ? null : tlHit(bar, e.clientX), c = m === 'l' || m === 'r' ? 'ew-resize' : '';
      lane.style.cursor = c; bar.style.cursor = c;
      bar.classList.toggle('hl', m === 'l'); bar.classList.toggle('hr', m === 'r');
    });
    lane.addEventListener('pointerleave', () => { if (!bar.classList.contains('drag')) bar.classList.remove('hl', 'hr'); });
    const row = h('div', { class:'tl-row' + (L.grp ? ' ingrp' : '') + (isPicked(L.id) ? ' sel' : '') + (L.visible ? '' : ' off') + (L.locked ? ' locked' : ''), oncontextmenu:e => openMenu(e, L),
      onmouseenter:() => setHover(L.id), onmouseleave:() => setHover(null) }, [layerCell(L, 'tl', n.depth), lane]);
    row.dataset.id = L.id;
    tl.append(row);
  }
  scale.addEventListener('pointerdown', tlScrub);
  tl.append(h('div', { class:'tl-head' }));
  tl.scrollTop = keep; placeHead();
}
function tlDuration(e) {
  e.preventDefault(); e.stopPropagation();
  const g = tlGeom(); if (!g) return;
  pushUndo(); pause();
  const d0 = S.duration, pps = g.w / d0, x0 = e.clientX;
  const mv = ev => { setDuration(Math.round((d0 + (ev.clientX - x0) / pps) * 2) / 2); T = S.duration; needs = true; };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); toast(`Duração: ${S.duration.toFixed(1)}s`); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function tlScrub(e) {
  const g = tlGeom(); if (!g) return;
  // sem isso o navegador pode iniciar um arrastar-e-soltar nativo (imagem "fantasma" duplicada) e perder o pointerup
  e.preventDefault();
  try { getSelection().removeAllRanges(); } catch (err) {}
  pause();
  const set = ev => { T = clamp((ev.clientX - g.x0) / g.w) * S.duration; RT.userSeek = true; needs = true; };
  set(e);
  const mv = ev => set(ev), nodrag = ev => ev.preventDefault();
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('dragstart', nodrag, true); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('dragstart', nodrag, true);
}
// qual parte da barra está sob o ponteiro: 'l' | 'r' (borda, com folga de 8px para fora) | 'm' (meio) | null
function tlHit(bar, cx) {
  const r = bar.getBoundingClientRect(), out = 8, inn = Math.min(8, r.width / 4);
  const dl = cx - r.left, dr = r.right - cx;
  if (dl >= -out && dl <= inn && dl <= dr) return 'l';
  if (dr >= -out && dr <= inn) return 'r';
  return dl > 0 && dr > 0 ? 'm' : null;
}
// arrastar uma barra para cima ou para baixo muda a ordem (topo = mais à frente), como arrastar o nome.
// Metade de cima/baixo da linha sob o ponteiro decide; item de grupo leva para dentro do grupo dele; grupo inteiro nunca entra em outro.
function tlStack(tl, bar, moving, y0) {
  const set = new Set(moving);
  // frame inteiro que se move (ele e os de dentro): a estrutura dele não muda, só o lugar na pilha
  const wg = (moving[0].grp && gchain(moving[0].grp).find(g => { const lv = gleaves(g); return lv.length === set.size && lv.every(l => set.has(l)); })) || null, whole = !!wg;
  const byId = id => S.layers.find(l => l.id === id), grpOf = r => r.dataset.gid || (byId(r.dataset.id) || {}).grp;
  // frame (ou grupo de cima) que a linha representa no nível do que se move: os irmãos do frame que anda, ou o de fora de todos
  const lvl = r => { const g = grpOf(r); if (!g) return null; const c = gchain(g), p = gpar(wg), i = p ? c.indexOf(p) : -1; return c[i + 1] || null; };
  const own = r => r.dataset.gid ? (whole && ginside(r.dataset.gid, wg)) || gleaves(r.dataset.gid).every(l => set.has(l)) : set.has(byId(r.dataset.id));
  const all = [...tl.querySelectorAll('.tl-row')], rows = all.filter(r => !own(r));
  all.forEach(r => r.classList.toggle('moving', own(r)));
  const line = h('div', { class:'tl-drop', hidden:true }, [h('span')]); tl.append(line);
  tl.classList.add('stacking'); bar.classList.add('lift');
  // a barra acompanha o ponteiro sem sair das linhas (senão ela mesma aumenta a área e a rolagem não para)
  const sc0 = tl.scrollTop, maxS = tl.scrollHeight - tl.clientHeight, ruler = tl.querySelector('.tl-ruler');
  const row0 = bar.closest('.tl-row'), minT = all[0].offsetTop - row0.offsetTop, maxT = all[all.length - 1].offsetTop - row0.offsetTop;
  let to = null, y = y0, raf = 0;
  // nova ordem de S.layers e o grupo de quem se move
  const result = to => {
    const rest = S.layers.filter(l => !set.has(l)), block = S.layers.filter(l => set.has(l));
    const topOf = gid => Math.max(...rest.map((l, i) => l.grp && ginside(l.grp, gid) ? i : -1)) + 1;
    let j = to.ref ? rest.indexOf(to.ref) + (to.up ? 1 : 0) : to.gtop ? topOf(to.gtop) : rest.findIndex(l => l.grp && ginside(l.grp, to.gbot));
    j = Math.max(1, j);
    return { order:[...rest.slice(0, j), ...block, ...rest.slice(j)], ng:whole ? wg : to.ng };
  };
  const same = r => r.order.every((l, i) => l === S.layers[i]) && (whole || moving.every(l => (l.grp || null) === (r.ng || null)));
  const place = () => {
    bar.style.transform = `translateY(${clamp(y - y0 + tl.scrollTop - sc0, minT, maxT)}px)`;
    to = null; line.hidden = true;
    if (!rows.length) return;
    const r = rows.find(q => y < q.getBoundingClientRect().bottom) || rows[rows.length - 1], rr = r.getBoundingClientRect(), rg = grpOf(r);
    let top = rr.top, bot = rr.bottom, up = y < (top + bot) / 2, inside = false;
    const rt = whole ? lvl(r) : null;
    if (rt) {
      const span = rows.filter(q => lvl(q) === rt);
      top = span[0].getBoundingClientRect().top; bot = span[span.length - 1].getBoundingClientRect().bottom; up = y < (top + bot) / 2;
      to = up ? { gtop:rt } : { gbot:rt };
    } else if (r.dataset.gid) {
      // cabeçalho: metade de cima = acima do grupo; de baixo = no topo do grupo (recolhido: abaixo dele). Frame de dentro de outro continua no de fora
      const open = gmeta(rg)?.open !== false, pr = gpar(rg) || undefined;
      to = up ? { gtop:rg, ng:pr } : open ? { gtop:rg, ng:rg } : { gbot:rg, ng:pr }; inside = !up && open;
    } else { const T = byId(r.dataset.id); if (T.type === 'bg') up = true; to = { ref:T, up, ng:T.grp }; inside = !!T.grp; }  // o fundo fica sempre embaixo: o limite é acima dele
    const res = result(to);
    // sem mudança a linha continua à vista (limite de cima/baixo), só não grava nada
    to.noop = same(res);
    line.hidden = false; line.classList.toggle('in', inside);
    line.style.top = ((up ? top : bot) - tl.getBoundingClientRect().top + tl.scrollTop) + 'px';
    line.firstChild.textContent = whole ? '' : res.ng && moving.some(l => l.grp !== res.ng) ? `Entra em ${groupName(res.ng)}` : !res.ng && moving.some(l => l.grp) ? 'Sai do grupo' : '';
  };
  // perto da borda de cima/baixo a timeline rola sozinha
  const tick = () => {
    raf = 0;
    const tr = tl.getBoundingClientRect(), top = tr.top + (ruler ? ruler.offsetHeight : 0), edge = 24;
    const v = y < top + edge ? y - top - edge : y > tr.bottom - edge ? y - tr.bottom + edge : 0;
    if (!v) return;
    const s = tl.scrollTop; tl.scrollTop = clamp(s + clamp(v / 2, -14, 14), 0, maxS);
    if (tl.scrollTop !== s) { place(); raf = requestAnimationFrame(tick); }
  };
  place();
  return {
    move(cy) { y = cy; place(); if (!raf) raf = requestAnimationFrame(tick); },
    end() {
      if (raf) cancelAnimationFrame(raf);
      line.remove(); tl.classList.remove('stacking'); bar.classList.remove('lift'); bar.style.transform = '';
      all.forEach(r => r.classList.remove('moving'));
    },
    drop() {
      if (!to || to.noop) return false;
      const r = result(to);
      S.layers = r.order;
      if (!whole) moving.forEach(l => { if (r.ng) l.grp = r.ng; else delete l.grp; });
      pruneGroups();
      changed({ layers:true }); return true;
    },
  };
}
// arrastar a barra do grupo: mover leva todos os membros; as bordas esticam ou encolhem o conjunto na mesma proporção
function tlDragGroup(e, gid, bar, mode) {
  e.preventDefault(); e.stopPropagation();
  const g = tlGeom(); if (!g) return;
  const mem = gleaves(gid);
  if (!mem.every(l => isPicked(l.id))) {
    RT.selected = mem[mem.length - 1].id; RT.picks = new Set(mem.map(l => l.id)); renderLayers(); renderProps(); needs = true;
    bar = g.tl.querySelector(`.tl-row[data-gid="${gid}"] .tl-bar`) || bar;
  }
  pushUndo(); pause();
  const d = S.duration, o = mem.map(l => ({ l, s:l.start, e:l.end })), s0 = Math.min(...o.map(x => x.s)), e0 = Math.max(...o.map(x => x.e ?? d));
  const x0 = e.clientX, y0 = e.clientY, grid = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000, MIN = .3;
  const pts = [0, d, T, ...extraSnaps()]; for (const q of S.layers) if (!mem.includes(q) && q.type !== 'bg') pts.push(q.start, q.end ?? d);
  const tol = 7 / g.w * d;
  const near = v => { let b = null; for (const p of pts) if (Math.abs(p - v) <= tol && (b === null || Math.abs(p - v) < Math.abs(b - v))) b = p; return b; };
  const lane = bar.parentElement, tip = h('div', { class:'tl-tip' }), guide = h('div', { class:'tl-snap', hidden:true });
  lane.append(tip); g.tl.append(guide);
  const fmtS = v => v.toFixed(1).replace('.', ',') + 's';
  let moved = false, axis = null, stk = null;
  const apply = (s, en) => {
    const k = (en - s) / (e0 - s0);
    for (const x of o) {
      x.l.start = r3(s + (x.s - s0) * k);
      if (x.e != null) x.l.end = r3(s + (x.e - s0) * k); else if (mode === 'r' && en < d - .01) x.l.end = r3(en);
    }
  };
  const mv = ev => {
    if (!axis) {
      const ax = Math.abs(ev.clientX - x0), ay = Math.abs(ev.clientY - y0); if (Math.max(ax, ay) <= 3) return;
      // para os lados muda o tempo; para cima ou para baixo muda a ordem
      axis = mode === 'm' && ay > ax ? 'y' : 'x';
      if (axis === 'y') { tip.remove(); stk = tlStack(g.tl, bar, mem, y0); }
    }
    if (stk) { stk.move(ev.clientY); return; }
    const dt = (ev.clientX - x0) / g.w * d; moved = true;
    const free = ev.shiftKey, fit = v => { const p = free ? null : near(v); return p !== null ? { v:p, hit:p } : { v:grid(v), hit:null }; };
    let s = s0, en = e0, hit = null;
    if (mode === 'm') {
      const a = fit(s0 + dt), b = fit(e0 + dt);
      let ds = a.hit !== null && (b.hit === null || Math.abs(a.hit - (s0 + dt)) <= Math.abs(b.hit - (e0 + dt))) ? (hit = a.hit, a.v - s0) : b.hit !== null ? (hit = b.hit, b.v - e0) : grid(s0 + dt) - s0;
      // sem sair do vídeo: as entradas ficam em 0..d e as saídas marcadas ficam até d
      const lim = Math.max(...o.map(x => x.e != null ? x.e : x.s + MIN));
      ds = clamp(ds, -s0, d - lim); s = s0 + ds; en = e0 + ds;
      for (const x of o) { x.l.start = r3(x.s + ds); if (x.e != null) x.l.end = r3(x.e + ds); }
    } else if (mode === 'l') { const f = fit(s0 + dt); s = clamp(f.v, 0, e0 - MIN); hit = s === f.v ? f.hit : null; apply(s, en); }
    else { const f = fit(e0 + dt); en = clamp(f.v, s0 + MIN, d); hit = en === f.v ? f.hit : null; apply(s, en); }
    placeBar(bar, gpseudo(gid));
    tip.textContent = `${fmtS(s)} – ${fmtS(en)}`;
    const at = (mode === 'r' ? en : s) / d * g.w, tw = tip.offsetWidth + 8;
    tip.style.left = Math.max(0, Math.min(g.w - tw + 8, mode === 'r' ? at + 6 : at - tw < 0 ? en / d * g.w + 6 : at - tw + 2)) + 'px';
    guide.hidden = hit === null; if (hit !== null) guide.style.left = (g.x0 - g.tl.getBoundingClientRect().left + hit / d * g.w) + 'px';
    needs = true;
  };
  const done = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', key, true);
    bar.classList.remove('drag', 'hl', 'hr'); tip.remove(); guide.remove(); if (stk) stk.end();
  };
  const up = () => { done(); if (stk) stk.drop(); else if (moved) changed({ layers:true, props:true }); };
  const key = ev => { if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); o.forEach(x => { x.l.start = x.s; x.l.end = x.e; }); placeBar(bar, gpseudo(gid)); done(); needs = true; };
  bar.classList.add('drag'); if (mode !== 'm') bar.classList.add('h' + mode);
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('keydown', key, true);
}
function tlDrag(e, L, bar, mode) {
  e.preventDefault(); e.stopPropagation();
  const g = tlGeom(); if (!g) return;
  // item dentro de um grupo: arrasta só ele (o grupo todo se move pela barra do grupo)
  const wholeGrp = L.grp && groupOf(L).every(l => isPicked(l.id));
  if (wholeGrp || !isPicked(L.id)) {
    RT.selected = L.id; RT.picks = new Set([L.id]); renderLayers(); renderProps(); needs = true;
    // selecionar redesenha a timeline: arrasta a barra nova, não a que saiu da tela
    bar = g.tl.querySelector(`.tl-row[data-id="${L.id}"] .tl-bar`) || bar;
  }
  pushUndo(); pause();
  const grp = isPicked(L.id) ? freePicked().filter(o => o !== L).map(o => ({ o, s:o.start, e:o.end })) : [];
  const d = S.duration, s0 = L.start, e0 = L.end ?? d, end0 = L.end, x0 = e.clientX, y0 = e.clientY, grid = v => Math.round(v * 10) / 10, MIN = .3;
  // vídeo: as bordas cortam o vídeo (vidTrim); a esquerda não passa do começo do vídeo
  const vid0 = new Map([L, ...grp.map(q => q.o)].filter(o => o.video).map(o => [o, { ...vidCut(o), rIn:o.vIn, rOut:o.vOut, s:o.start, e:o.end ?? d }]));
  const sMin = o => { const v = vid0.get(o); return v ? Math.max(0, v.s - v.a) : 0; };
  // ímã: início, fim, agulha e as bordas das outras camadas (Shift desliga)
  const pts = [0, d, T, ...extraSnaps(L)]; // + batidas da música e o meio das transições
  for (const o of S.layers) if (o !== L && o.type !== 'bg' && !grp.some(q => q.o === o)) pts.push(o.start, o.end ?? d);
  // limites do deslocamento para a seleção toda andar junta (ninguém sai do vídeo, ninguém fica para trás)
  const ext = (s, en) => en != null && en < d - .01 ? en : s + MIN;
  const dLo = Math.max(-s0, ...grp.map(q => -q.s)), dHi = Math.min(d - ext(s0, L.end), ...grp.map(q => d - ext(q.s, q.e)));
  const tol = 7 / g.w * d;
  const near = v => { let best = null; for (const p of pts) if (Math.abs(p - v) <= tol && (best === null || Math.abs(p - v) < Math.abs(best - v))) best = p; return best; };
  const lane = bar.parentElement, tip = h('div', { class:'tl-tip' }), guide = h('div', { class:'tl-snap', hidden:true });
  lane.append(tip); g.tl.append(guide);
  const fmtS = v => v.toFixed(1).replace('.', ',') + 's';
  let moved = false, axis = null, stk = null;
  const show = (hit) => {
    placeBar(bar, L);
    const end = L.end ?? d;
    bar.title = `${L.name}: entra em ${L.start.toFixed(1)}s, sai em ${end.toFixed(1)}s`;
    tip.textContent = mode === 'l' ? fmtS(L.start) : mode === 'r' ? fmtS(end) : `${fmtS(L.start)} – ${fmtS(end)}`;
    // o balão fica do lado de fora da borda que está sendo arrastada; vira para dentro se não couber
    const at = (mode === 'r' ? end : L.start) / d * g.w, tw = tip.offsetWidth + 8;
    const left = mode === 'r' ? (at + tw > g.w ? at - tw : at + 6) : (at - tw < 0 ? (mode === 'm' ? (end / d * g.w) + 6 : at + 6) : at - tw + 2);
    tip.style.left = Math.max(0, Math.min(g.w - tw + 8, left)) + 'px';
    guide.hidden = hit === null;
    if (hit !== null) guide.style.left = (g.x0 - g.tl.getBoundingClientRect().left + hit / d * g.w) + 'px';
  };
  const mv = ev => {
    if (!axis) {
      const ax = Math.abs(ev.clientX - x0), ay = Math.abs(ev.clientY - y0); if (Math.max(ax, ay) <= 3) return;
      axis = mode === 'm' && ay > ax ? 'y' : 'x';
      if (axis === 'y') { tip.remove(); stk = tlStack(g.tl, bar, [L, ...grp.map(q => q.o)], y0); }
    }
    if (stk) { stk.move(ev.clientY); return; }
    const dt = (ev.clientX - x0) / g.w * d; moved = true;
    const free = ev.shiftKey;
    // ajusta um valor: ímã primeiro, senão grade de 0,1s
    const fit = v => { const p = free ? null : near(v); return p !== null ? { v:p, hit:p } : { v:grid(v), hit:null }; };
    let hit = null;
    if (mode === 'm' && e0 >= d - .01) { const f = fit(s0 + dt); L.start = clamp(f.v, s0 + dLo, s0 + dHi); hit = f.hit; } // fica até o fim: move só a entrada
    else if (mode === 'm') {
      const len = e0 - s0, a = fit(s0 + dt), b = fit(e0 + dt);
      // prende pela borda que achou ímã mais perto
      let s = a.hit !== null && (b.hit === null || Math.abs(a.hit - (s0 + dt)) <= Math.abs(b.hit - (e0 + dt))) ? (hit = a.hit, a.v)
            : b.hit !== null ? (hit = b.hit, b.v - len) : grid(s0 + dt);
      s = clamp(s, s0 + dLo, s0 + dHi); if (hit !== null && Math.abs(s - hit) > 1e-6 && Math.abs(s + len - hit) > 1e-6) hit = null;
      L.start = s; L.end = Math.round((s + len) * 1000) / 1000;
    }
    else if (mode === 'l') { const f = fit(s0 + dt); L.start = clamp(f.v, sMin(L), e0 - MIN); hit = L.start === f.v ? f.hit : null; }
    else { const f = fit(e0 + dt); L.end = clamp(f.v, s0 + MIN, d); hit = L.end === f.v ? f.hit : null; }
    // mesma diferença para todos os selecionados (mover ou esticar as bordas)
    const r3 = v => Math.round(v * 1000) / 1000;
    for (const q of grp) {
      if (mode === 'm') { q.o.start = r3(q.s + L.start - s0); if (q.e != null && q.e < d - .01) q.o.end = r3(q.e + L.start - s0); }
      else if (mode === 'l') q.o.start = r3(clamp(q.s + L.start - s0, sMin(q.o), ext(q.s, q.e) - MIN));
      else { const ne = r3(clamp((q.e ?? d) + (L.end ?? d) - e0, q.s + MIN, d)); if (q.e != null || ne < d - .01) q.o.end = ne; }
    }
    if (mode !== 'm') for (const [o, v] of vid0) vidTrim(o, v, mode);
    show(hit);
    needs = true; // a agulha fica onde está
  };
  const done = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', key, true);
    bar.classList.remove('drag', 'hl', 'hr'); tip.remove(); guide.remove(); if (stk) stk.end();
  };
  const up = () => { done(); if (stk) stk.drop(); else if (moved) changed({ layers:true, props:true }); };
  // Esc devolve a barra para onde estava
  const key = ev => { if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); L.start = s0; L.end = end0; grp.forEach(q => { q.o.start = q.s; q.o.end = q.e; }); vid0.forEach((v, o) => { o.vIn = v.rIn; o.vOut = v.rOut; if (o.vIn == null) delete o.vIn; if (o.vOut == null) delete o.vOut; }); placeBar(bar, L); done(); needs = true; };
  bar.classList.add('drag'); if (mode === 'l' || mode === 'r') bar.classList.add('h' + mode);
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('keydown', key, true);
}
{
  let on = true; try { on = localStorage.getItem('mola-tl') !== '0'; } catch (e) {}
  const b = $('#tlToggle'), tl = $('#tl');
  // com a timeline aberta, a régua dela substitui a barra de posição
  const grip = $('#tlGrip');
  const apply = () => { tl.hidden = !on; grip.hidden = !on; $('.scrub').style.display = on ? 'none' : ''; b.setAttribute('aria-pressed', String(on)); if (on && S) renderTimeline(); };
  // altura da timeline: arrastar a borda de cima
  try { const hh = +localStorage.getItem('mola-tlh'); if (hh) { tl.style.height = hh + 'px'; tl.style.maxHeight = 'none'; } } catch (e) {}
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); const y0 = e.clientY, h0 = tl.getBoundingClientRect().height;
    const mv = ev => { const hh = Math.round(clamp(h0 - (ev.clientY - y0), 50, innerHeight * .7)); tl.style.height = hh + 'px'; tl.style.maxHeight = 'none'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); try { localStorage.setItem('mola-tlh', String(parseInt(tl.style.height))); } catch (e) {} };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  b.onclick = () => { on = !on; try { localStorage.setItem('mola-tl', on ? '1' : '0'); } catch (e) {} apply(); };
  apply();
  // clique duplo numa barra: a agulha vai até o elemento já na tela (no grupo, até o primeiro que entra)
  tl.addEventListener('dblclick', e => {
    const row = e.target.closest('.tl-bar') && e.target.closest('.tl-row'); if (!row) return;
    const L = row.dataset.gid ? gleaves(row.dataset.gid).sort((a, c) => a.start - c.start)[0] : S.layers.find(l => l.id === row.dataset.id);
    if (L) seekLayer(L);
  });
}
/* ------------ painéis: esconder as colunas e a barra de cima (botões no transporte, ao lado do da timeline);
   Ctrl + \ esconde tudo e deixa só o palco, como no Figma (pedido do usuário). Cada painel fica salvo no navegador; o "tudo" não. ------------ */
const PANES = (() => { try { const o = JSON.parse(localStorage.getItem('mola-panes')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })(); // { left, top, right, bottom }: false = escondido
let uiOff = false;
function panesApply() {
  const app = $('#app');
  for (const k of ['left', 'top', 'right', 'bottom']) { app.classList.toggle('no-' + k, PANES[k] === false); $('#p-' + k).setAttribute('aria-pressed', String(PANES[k] !== false)); }
  $('#botBack').hidden = uiOff || PANES.bottom !== false;
  app.classList.toggle('no-ui', uiOff); $('#uiBack').hidden = !uiOff;
}
function paneToggle(k) { PANES[k] = PANES[k] === false; try { localStorage.setItem('mola-panes', JSON.stringify(PANES)); } catch (e) {} panesApply(); }
function uiToggle(v = !uiOff) { uiOff = v; closeMenu(); closePicker(); panesApply(); }
// algo precisa do painel (editar o texto pelo palco, buscar animação, renomear): ele volta
function paneShow(k) { if (uiOff) uiToggle(false); if (PANES[k] === false) paneToggle(k); }
['left', 'top', 'right', 'bottom'].forEach(k => { $('#p-' + k).onclick = () => paneToggle(k); });
$('#botBack').onclick = () => paneToggle('bottom');
$('#pAll').onclick = () => uiToggle(true);
$('#uiBack').onclick = () => uiToggle(false);
panesApply();
function renderMarks() {
  renderTimeline();
  const box = $('#marks'); box.innerHTML = '';
  for (const L of S.layers) if (L.type !== 'bg' && L.visible) box.append(h('i', { style:`left:calc(${(L.start / S.duration * 100).toFixed(2)}% - 1px);background:${TYPE_COLOR[typeKey(L)]}`, title:`${L.name} entra em ${L.start.toFixed(1)}s` }));
}

/* ------------ propriedades ------------ */
function fid(L, k) { return `f-${L.id}-${k}`; }
function field(label, ctl, forId, stack) { return h('div', { class:'field' + (stack ? ' stack' : '') }, [h('label', { for:forId, text:label }), ctl]); }
function rangeF(L, k, label, min, max, step, fmt = v => v, opts = {}) {
  const id = fid(L, k);
  // o número ao lado também é digitável; a escala da exibição (×100 em %, ×1 no resto) sai do próprio formato
  const num = v => parseFloat(String(fmt(v)).replace(',', '.'));
  let ref = max; if (!isFinite(num(ref))) ref = (min + max) / 2; if (!ref || !isFinite(num(ref))) ref = min + step;
  const scale = opts.scale || 10 ** Math.round(Math.log10(Math.abs(num(ref) / ref) || 1));
  const unit = (String(fmt(ref)).match(/[^\d.,\s-]+$/) || [''])[0];
  // posição: a do formato aberto (fora do principal, o ajuste vale só nele)
  const isPos = k === 'x' || k === 'y', val = () => opts.get ? opts.get() : isPos ? posOf(L)[k] : L[k];
  const out = h('input', { type:'text', class:'num', inputmode:'decimal', 'aria-label':`${label} (valor)`, value:fmt(val()) });
  const inp = h('input', { type:'range', id, min, max, step, value:val() });
  // tamanho, opacidade, ritmo etc. valem para todas as camadas do mesmo tipo selecionadas; posição e tempo ficam só na principal
  const set = v => {
    if (opts.put) { opts.put(v); if (opts.onInput) opts.onInput(); changed(); return; }
    // posição: a seleção toda se move junto (mesmo deslocamento)
    if (isPos) {
      const d = v - val();
      for (const o of peersAny(L)) { const n = o === L ? v : +clampPos(posOf(o)[k] + d).toFixed(4); setPos(o, k === 'x' ? n : null, k === 'y' ? n : null); }
      if (opts.onInput) opts.onInput(); changed(); return;
    }
    for (const o of (['start', 'end'].includes(k) ? [L] : ['inSpeed', 'inInt', 'outSpeed', 'outInt', 'idleSpeed', 'idleInt', 'opacity', 'lblur', 'bblur'].includes(k) ? peersAny(L) : peersOf(L))) o[k] = v; if (opts.layout) RT.layout.clear(); if (opts.onInput) opts.onInput(); changed(); };
  inp.addEventListener('pointerdown', pushUndo);
  inp.addEventListener('input', () => { set(Math.max(parseFloat(inp.value), opts.low ?? -Infinity)); out.value = fmt(val()); });
  if (opts.after) inp.addEventListener('change', opts.after);
  const shown = () => { const v = val() ?? max; return +(v * scale).toFixed(opts.dec ?? Math.max(0, -Math.floor(Math.log10(step * scale)) + 1)); };
  out.addEventListener('focus', () => { out.value = String(shown()).replace('.', ','); out.select(); });
  const apply = () => {
    const raw = parseFloat(out.value.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (isFinite(raw)) {
      let v = clamp(raw / scale, opts.low ?? min, opts.cap ?? max); if (step >= 1) v = Math.round(v); // cap/low: digitado pode passar das pontas da barra
      if (v !== val()) { pushUndo(); set(v); inp.value = v; if (opts.after) opts.after(); }
    }
    out.value = fmt(val());
  };
  out.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); out.blur(); }
    else if (e.key === 'Escape') { out.value = fmt(val()); out.dataset.skip = '1'; out.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseFloat(out.value.replace(',', '.')); if (!isFinite(cur)) return;
      const d = step * scale * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      out.value = String(+(clamp((cur + d) / scale, opts.low ?? min, opts.cap ?? max) * scale).toFixed(4)).replace('.', ',');
      const v = clamp((cur + d) / scale, opts.low ?? min, opts.cap ?? max); if (v !== val()) { pushUndo(); set(v); inp.value = v; }
    }
  });
  out.addEventListener('blur', () => { if (out.dataset.skip) { delete out.dataset.skip; out.value = fmt(val()); return; } apply(); });
  out.title = `Digite o valor${unit && unit !== 'pílula' ? ' em ' + unit : ''}. Setas ↑↓ ajustam, Shift vai de 10 em 10.`;
  return field(label, h('div', { class:'rng' }, [inp, out]), id);
}
// largura/altura guardadas em fração da largura do quadro; o painel mostra em % ou px (escolha vale para todos os campos, fora de `S`)
let SZ_UNIT = (() => { try { return localStorage.getItem('mola-szunit') === 'px' ? 'px' : '%'; } catch (e) { return '%'; } })();
function sizeF(L, k, label, min, max, step, opts = {}) {
  const px = SZ_UNIT === 'px';
  // fora do formato principal a máscara tem tamanho próprio (fpos ww/hh, px do bloco) e escala k: o campo mostra e grava o que está na tela
  if (fmtOwn() && (k === 'mh' || (k === 'size' && (L.type === 'image' || L.type === 'shape'))) && L.type !== 'text') {
    const wd = k === 'size', own = () => { const G = blockGeom(L); return G ? { G, k:placeOf(L).k || 1 } : null; };
    opts = { ...opts,
      get: () => { const o = own(); return o ? (wd ? geomNow(L).w : geomNow(L).h) * o.k / W() : L[k]; },
      put: v => { const o = own(); if (!o) { L[k] = v; return; } for (const q of peersOf(L)) { const g = blockGeom(q); if (g) setFmt(q, wd ? { ww:+(v * W() / o.k).toFixed(2) } : { hh:+(v * W() / o.k).toFixed(2) }); } RT.layout.clear(); } };
  }
  const f = px ? rangeF(L, k, label, min, max, 1 / W(), v => Math.round(v * W()) + 'px', { ...opts, scale:W(), dec:0 })
    : rangeF(L, k, label, min, max, step, v => Math.round(v * 100) + '%', opts);
  f.classList.add('flowgap');
  f.append(h('button', { type:'button', class:'btn small flow-auto', 'aria-pressed':String(px), text:'px', title:px ? 'Mostrar em % da largura do quadro' : 'Mostrar em pixels do vídeo',
    onclick:() => { SZ_UNIT = px ? '%' : 'px'; try { localStorage.setItem('mola-szunit', SZ_UNIT); } catch (e) {} renderProps(); } }));
  return f;
}
// aceita "#1a2b3c", "1a2b3c", "abc", "#ABC", "#1a2b3c80", "rgb(1, 42, 28)", "rgba(1, 42, 28, .5)";
// devolve "#rrggbb" (ou "#rrggbbaa" se vier com opacidade) ou null
function parseHex(s) {
  s = String(s || '').trim();
  const m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+)(%?))?/i);
  if (m) return withA('#' + [m[1], m[2], m[3]].map(n => clamp(+n, 0, 255).toString(16).padStart(2, '0')).join(''), m[4] == null ? 1 : m[5] ? m[4] / 100 : +m[4]);
  s = s.replace(/[^0-9a-f]/gi, '');
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  if (s.length !== 6 && s.length !== 8) return null;
  return withA('#' + s.slice(0, 6).toLowerCase(), s.length === 8 ? parseInt(s.slice(6), 16) / 255 : 1);
}
// Seletor de cor próprio: o do navegador abre em RGB; aqui o hex é sempre o primeiro campo.
function hexToHsv(c) {
  const n = parseInt(c.slice(1, 7), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, mx ? d / mx : 0, mx];
}
function hsvToHex(hh, sat, v) {
  const f = k => { const q = (k + hh / 60) % 6; return v - v * sat * Math.max(0, Math.min(q, 4 - q, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
let openPicker = null;
function closePicker() { if (openPicker) { openPicker.remove(); openPicker = null; document.removeEventListener('pointerdown', pickerOutside, true); } }
function pickerOutside(e) { if (openPicker && !openPicker.contains(e.target) && !e.target.closest?.('.cpick')) closePicker(); }
// devolve o botão-amostra; .setColor(c) atualiza por fora
function colorButton(value, label, { onStart, onInput, cls = '', alpha = true }) {
  let cur = value;
  const btn = h('button', { type:'button', class:'cpick ' + cls, 'aria-label':label, title:label, style:`--c:${cur}` });
  btn.setColor = c => { cur = c; btn.style.setProperty('--c', c); btn.classList.toggle('none', alpha && noCol(c)); }; // "sem cor": amostra branca cortada de vermelho
  btn.setColor(cur);
  btn.addEventListener('click', () => {
    if (openPicker && openPicker._btn === btn) { closePicker(); return; }
    closePicker();
    let [hh, sat, v] = hexToHsv(cur), al = alpha ? colA(cur) : 1;
    const sv = h('div', { class:'cp-sv' }, [h('i', { class:'cp-knob' })]);
    const hue = h('div', { class:'cp-hue' }, [h('i', { class:'cp-knob' })]);
    const alp = alpha ? h('div', { class:'cp-alpha' }, [h('i', { class:'cp-knob' })]) : null;
    const pct = alpha ? h('input', { type:'number', class:'cp-pct', min:0, max:100, step:1, inputmode:'numeric', 'aria-label':'Opacidade (%)', title:'Opacidade em %. Setas ↑↓ ajustam.' }) : null;
    const hexIn = h('input', { type:'text', class:'cp-hex', maxlength:32, spellcheck:'false', 'aria-label':'Hex', title:'Cole ou digite o hex, com ou sem #' });
    // conta-gotas (Chrome/Edge): pega a cor de qualquer ponto da tela, inclusive de uma foto no palco
    const eye = 'EyeDropper' in window ? h('button', { type:'button', class:'icon-btn cp-eye', title:'Conta-gotas: pegar uma cor da tela', 'aria-label':'Conta-gotas',
      html:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3-1.6 1.6-3-3zM8.9 4.1l-5.6 5.6-.8 3.3 3.3-.8 5.6-5.6"/></svg>',
      onclick:async () => {
        try {
          const r = await new EyeDropper().open(), c = parseHex(r.sRGBHex); if (!c) return;
          if (onStart) onStart(); [hh, sat, v] = hexToHsv(c); if (alpha && al <= 0) al = 1; emit();
        } catch (e) {} // Esc cancela
      } }) : null;
    // sem cor: a opacidade vai a 0 e o rgb fica guardado; clicar de novo (ou escolher uma cor) devolve a cor
    const noneBtn = alpha ? h('button', { type:'button', class:'cnone', title:'Sem cor', 'aria-label':'Sem cor', 'aria-pressed':String(noCol(cur)), onclick:() => {
      if (onStart) onStart(); al = al <= 0 ? 1 : 0; emit();
    } }) : null;
    // cores da marca: um clique troca a cor e mantém a opacidade
    // lista como a de estilos do Figma: grupos na mesma ordem da paleta da marca (aba Marca), com busca
    const lib = cls.includes('sw') ? null : brandLib();
    const pick = c => { if (onStart) onStart(); [hh, sat, v] = hexToHsv(c); if (alpha && al <= 0) al = 1; emit(); };
    const libList = h('div', { class:'cp-list' }), libQ = h('input', { type:'text', class:'cp-q', placeholder:'Buscar cor da marca', spellcheck:'false', 'aria-label':'Buscar cor da marca' });
    const fillLib = () => {
      const q = libQ.value.trim().toLowerCase().replace(/^#/, ''), now = cur.slice(0, 7).toLowerCase();
      libList.innerHTML = '';
      for (const g of lib || []) {
        const its = g.items.filter(x => !q || x.n.toLowerCase().includes(q) || x.c.slice(1).includes(q));
        if (!its.length) continue;
        libList.append(h('div', { class:'cp-gh', text:g.title }), ...its.map(x => h('button', { type:'button', class:'cp-it' + (x.c === now ? ' on' : ''), title:x.c.toUpperCase(), onclick:() => { pick(x.c); fillLib(); } }, [
          h('i', { class:'cp-dot', style:`background:${x.c}` }), h('span', { class:'cp-nm', text:x.n }), h('span', { class:'cp-hx', text:x.c.slice(1).toUpperCase() })])));
      }
      if (!libList.firstChild) libList.append(h('div', { class:'cp-empty', text:'Nenhuma cor' }));
      // Scroll até o item selecionado
      const selected = libList.querySelector('.cp-it.on');
      if (selected) selected.scrollIntoView({ behavior:'auto', block:'nearest' });
    };
    libQ.addEventListener('input', fillLib);
    libQ.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); } });
    const brandSws = lib && lib.length ? [h('div', { class:'cp-lib' }, [libQ, libList])] : [];
    if (brandSws.length) fillLib();
    const pop = h('div', { class:'cp-pop', role:'dialog', 'aria-label':label }, [
      h('div', { class:'cp-row' }, [h('span', { class:'cp-lbl', text:'HEX' }), h('span', { class:'cp-rr' }, [h('span', { class:'hexwrap' }, [h('i', { text:'#' }), hexIn]), noneBtn, eye])]),
      sv, hue,
      alpha ? h('div', { class:'cp-row' }, [h('span', { class:'cp-lbl', text:'OPAC.' }), alp, h('span', { class:'hexwrap pctwrap' }, [pct, h('i', { text:'%' })])]) : null,
      ...brandSws
    ]);
    pop._btn = btn;
    const paint = () => {
      const base = hsvToHex(hh, sat, v);
      sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsvToHex(hh, 1, 1)})`;
      sv.firstChild.style.left = sat * 100 + '%'; sv.firstChild.style.top = (1 - v) * 100 + '%';
      hue.firstChild.style.left = hh / 360 * 100 + '%';
      if (alp) { alp.style.setProperty('--top', base); alp.firstChild.style.left = al * 100 + '%'; if (document.activeElement !== pct) pct.value = Math.round(al * 100); }
      hexIn.value = base.slice(1).toUpperCase();
      if (noneBtn) noneBtn.setAttribute('aria-pressed', String(al <= 0));
      return withA(base, al);
    };
    const emit = () => { const c = paint(); cur = c; btn.setColor(c); onInput(c); };
    const drag = (el, fn) => el.addEventListener('pointerdown', e => {
      e.preventDefault(); if (onStart) onStart(); el.setPointerCapture(e.pointerId);
      const mv = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); emit(); };
      mv(e); el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', mv), { once:true });
    });
    drag(sv, (x, y) => { sat = x; v = 1 - y; if (alpha && al <= 0) al = 1; });
    drag(hue, x => { hh = x * 360; if (alpha && al <= 0) al = 1; });
    if (alp) {
      drag(alp, x => { al = Math.round(x * 100) / 100; });
      const setPct = () => { const n = parseFloat(pct.value); if (!isFinite(n)) return; const a = clamp(n, 0, 100) / 100; if (a === al) return; if (onStart) onStart(); al = a; emit(); };
      pct.addEventListener('input', setPct);
      pct.addEventListener('focus', () => pct.select());
      pct.addEventListener('blur', () => { pct.value = Math.round(al * 100); });
      pct.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pct.blur(); } else if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); } });
    }
    const commit = () => {
      const c = parseHex(hexIn.value);
      if (c) {
        const a = alpha && c.length === 9 ? colA(c) : al <= 0 && c.slice(0, 7) !== withA(cur, 1) ? 1 : al, nc = withA(c, a);
        if (nc !== cur) { if (onStart) onStart(); [hh, sat, v] = hexToHsv(c); al = a; cur = nc; btn.setColor(nc); onInput(nc); }
      }
      paint();
    };
    hexIn.addEventListener('focus', () => hexIn.select());
    hexIn.addEventListener('paste', e => { const c = parseHex(e.clipboardData.getData('text/plain')); if (!c) return; e.preventDefault(); hexIn.value = c.slice(1); commit(); });
    hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); closePicker(); } else if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); } });
    hexIn.addEventListener('blur', commit);
    document.body.append(pop); openPicker = pop; paint();
    const r = btn.getBoundingClientRect(), pw = pop.offsetWidth;
    let ph = pop.offsetHeight;
    // alto demais para a janela: a lista da marca encolhe (e rola) em vez de sair da tela
    if (ph > innerHeight - 16) { libList.style.maxHeight = Math.max(72, libList.offsetHeight - (ph - (innerHeight - 16))) + 'px'; ph = pop.offsetHeight; }
    pop.style.left = clamp(r.left, 8, innerWidth - pw - 8) + 'px';
    pop.style.top = clamp(r.bottom + 6 + ph > innerHeight ? r.top - ph - 6 : r.bottom + 6, 8, Math.max(8, innerHeight - ph - 8)) + 'px';
    document.addEventListener('pointerdown', pickerOutside, true);
    hexIn.focus();
  });
  return btn;
}
// camadas do mesmo tipo selecionadas junto com L (L inclusive): a cor vale para todas
function peersOf(L) {
  if (!isPicked(L.id)) return [L];
  const ps = pickedLayers().filter(o => o.type === L.type);
  return ps.includes(L) ? ps : [L];
}
function colorF(L, k, label) {
  const id = fid(L, k);
  const setAll = c => { for (const o of peersOf(L)) o[k] = c; };
  const six = () => String(L[k]).slice(1, 7).toUpperCase();
  const show = () => { hex.value = six(); if (document.activeElement !== pct) pct.value = Math.round(colA(L[k]) * 100); row.classList.toggle('is-none', noCol(L[k])); none.setAttribute('aria-pressed', String(noCol(L[k]))); };
  const inp = colorButton(L[k], `${label} (seletor)`, { onStart:pushUndo, onInput:c => { setAll(c); show(); changed(); } });
  inp.id = id;
  const hex = h('input', { type:'text', class:'hex', value:six(), maxlength:32, spellcheck:'false', 'aria-label':`${label} (hex)`, title:'Cole ou digite o hex, com ou sem #' });
  const pct = h('input', { type:'number', class:'apct', min:0, max:100, step:1, inputmode:'numeric', value:Math.round(colA(L[k]) * 100), 'aria-label':`${label} (opacidade %)`, title:'Opacidade em %. Setas ↑↓ ajustam.' });
  const put = c => { setAll(c); inp.setColor(c); show(); changed(); };
  const commit = () => {
    const c = parseHex(hex.value);
    if (c) { const n = withA(c, c.length === 9 ? colA(c) : colA(L[k])); if (n !== L[k]) { pushUndo(); put(n); } }
    show();
  };
  hex.addEventListener('focus', () => hex.select());
  hex.addEventListener('paste', e => { const c = parseHex(e.clipboardData.getData('text/plain')); if (!c) return; e.preventDefault(); pushUndo(); put(withA(c, c.length === 9 ? colA(c) : colA(L[k]))); });
  hex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } else if (e.key === 'Escape') { hex.value = six(); hex.blur(); } });
  hex.addEventListener('blur', commit);
  let pctUndo = false;
  pct.addEventListener('focus', () => { pct.select(); pctUndo = false; });
  pct.addEventListener('input', () => {
    const v = parseFloat(pct.value); if (!isFinite(v)) return;
    const n = withA(L[k], clamp(v, 0, 100) / 100); if (n === L[k]) return;
    if (!pctUndo) { pushUndo(); pctUndo = true; }
    put(n);
  });
  pct.addEventListener('blur', () => show());
  pct.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pct.blur(); } else if (e.key === 'Escape') { pct.blur(); } });
  // sem cor (amostra branca cortada de vermelho): opacidade 0, o rgb fica guardado; clicar de novo devolve a cor
  const none = h('button', { type:'button', class:'cnone', title:'Sem cor', 'aria-label':`${label}: sem cor`, 'aria-pressed':String(noCol(L[k])),
    onclick:() => { pushUndo(); put(withA(L[k], noCol(L[k]) ? 1 : 0)); } });
  // as cores da marca ficam na lista do seletor (colorButton)
  const row = h('div', { class:'colorctl' + (noCol(L[k]) ? ' is-none' : '') }, [inp, h('span', { class:'hexwrap' }, [h('i', { text:'#' }), hex]), h('span', { class:'hexwrap pctwrap' }, [pct, h('i', { text:'%' })]), none]);
  return field(label, row, id);
}
function selectF(L, k, label, opts, o = {}) {
  const id = fid(L, k);
  const sel = h('select', { id }, opts.map(([v, t]) => h('option', { value:v, text:t, selected:String(L[k]) === String(v) })));
  sel.addEventListener('change', () => { pushUndo(); for (const p of peersOf(L)) p[k] = o.num ? parseFloat(sel.value) : sel.value; RT.layout.clear(); changed({ props:!!o.props }); });
  return field(label, sel, id);
}
// mesclagem (blend mode): vale para toda a seleção, de qualquer tipo, como a opacidade. Devolve [campo, dica do modo escolhido]
function blendF(L) {
  const id = fid(L, 'blend');
  const nameOf = () => BLENDS[blendOf(L) || 'normal'].nome;
  const btn = h('button', { type:'button', id, class:'blendbtn', 'aria-haspopup':'menu' }, [h('span', { text:nameOf() }), h('i', { html:'<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>' })]);
  const hint = h('p', { class:'hint' });
  const tip = () => {
    const b = blendOf(L); hint.hidden = !b;
    hint.textContent = b ? BLENDS[b].dica + (L.type === 'bg' ? ' O fundo fica embaixo de tudo: aqui ele mistura com preto.' : '') : '';
    btn.firstChild.textContent = nameOf();
  };
  // o palco mostra o modo enquanto o mouse passa; fechar sem escolher devolve o que cada camada tinha
  const open = () => {
    const peers = peersAny(L), orig = peers.map(o => o.blend), cur = blendOf(L) || 'normal';
    const show = v => { for (const o of peers) o.blend = v; RT.rev++; needs = true; };
    const restore = () => { peers.forEach((o, i) => { o.blend = orig[i]; }); RT.rev++; needs = true; };
    let done = false, items = [];
    const close = keep => {
      if (done) return; done = true;
      document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', away); m.remove();
      if (!keep) restore();
      btn.focus({ preventScroll:true });
    };
    const pick = v => {
      restore(); pushUndo(); for (const o of peers) o.blend = v; close(true); tip(); changed();
    };
    const away = e => { if (!m.contains(e.target)) close(false); };
    const mark = i => { items.forEach((b, j) => b.classList.toggle('on', j === i)); if (items[i]) { items[i].scrollIntoView({ block:'nearest' }); show(items[i].dataset.v); } };
    const key = e => {
      const i = items.findIndex(b => b.classList.contains('on'));
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); mark((i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (i >= 0) pick(items[i].dataset.v); else close(false); }
    };
    const m = h('div', { class:'ctx blendmenu', role:'menu' }, BLEND_GROUPS.flatMap(([g, xs], gi) => [
      ...(gi ? [h('hr')] : []),
      ...xs.map(([v, t]) => {
        const b = h('button', { type:'button', role:'menuitemradio', 'aria-checked':String(v === cur), 'data-v':v }, [h('b', { text:v === cur ? '✓' : '' }), h('span', { text:t })]);
        b.addEventListener('pointerenter', () => { items.forEach(x => x.classList.remove('on')); b.classList.add('on'); show(v); });
        b.addEventListener('click', () => pick(v));
        return b;
      })])
    );
    items = [...m.querySelectorAll('button')];
    m.addEventListener('pointerleave', () => { items.forEach(x => x.classList.remove('on')); restore(); });
    document.body.append(m);
    const r = btn.getBoundingClientRect(), mh = Math.min(m.offsetHeight, innerHeight - 16);
    m.style.minWidth = Math.max(r.width, 196) + 'px'; m.style.maxHeight = mh + 'px';
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    const below = innerHeight - r.bottom - 8;
    m.style.top = (below >= mh || below >= r.top ? Math.min(r.bottom + 4, innerHeight - mh - 8) : Math.max(8, r.top - mh - 4)) + 'px';
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
    window.addEventListener('resize', away);
    items[Math.max(0, items.findIndex(b => b.dataset.v === cur))]?.scrollIntoView({ block:'center' });
  };
  btn.addEventListener('click', open);
  tip();
  return [field('Mesclagem', btn, id), hint];
}
function segF(L, k, label, opts) {
  const wrap = h('div', { class:'segs' + (opts.every(o => String(o[1]).length <= 8) ? ' tight' : ''), role:'group', 'aria-label':label });
  const draw = () => { wrap.innerHTML = ''; opts.forEach(([v, t]) => wrap.append(h('button', { 'aria-pressed':String(L[k] === v), text:t, onclick:() => { pushUndo(); for (const o of peersOf(L)) o[k] = v; RT.layout.clear(); draw(); changed(); if (k === 'mode' || k === 'kind' || k === 'strokeDash') renderProps(); } }))); };
  draw();
  return field(label, wrap, null, true);
}
// "Cantos": uma barra para todos; "Cada canto" abre quatro (sup. esq., sup. dir., inf. dir., inf. esq.)
function cornersF(L, fmt) {
  const sep = !!L.radSep, names = ['Sup. esquerdo', 'Sup. direito', 'Inf. direito', 'Inf. esquerdo'];
  const btn = h('button', { class:'btn small', text:sep ? 'Todos iguais' : 'Cada canto', title:sep ? 'Volta a um raio só' : 'Ajusta cada canto separado', onclick:() => {
    pushUndo();
    for (const o of peersOf(L)) {
      if (!o.radSep) { for (const k of RAD_KEYS) o[k] = o.radius || 0; o.radSep = true; }
      else { o.radius = o.rTL ?? o.radius ?? 0; o.radSep = false; }
    }
    changed({ props:true });
  } });
  return [sep ? null : rangeF(L, 'radius', 'Cantos', 0, 600, 1, fmt), ...(sep ? RAD_KEYS.map((k, i) => { if (L[k] == null) L[k] = L.radius || 0; return rangeF(L, k, names[i], 0, 600, 1, fmt); }) : []), h('div', { class:'row' }, [btn])].filter(Boolean);
}function checkF(L, k, label) {
  const id = fid(L, k);
  const inp = h('input', { type:'checkbox', id, checked:!!L[k] });
  inp.addEventListener('change', () => { pushUndo(); for (const o of peersOf(L)) o[k] = inp.checked; RT.layout.clear(); changed(); if (k === 'stroke' || k === 'tint' || k === 'fill') renderProps(); });
  return h('label', { class:'check', for:id }, [inp, label]);
}
function textF(L, k, label, multi) {
  const id = fid(L, k);
  const inp = h(multi ? 'textarea' : 'input', multi ? { id, rows:3 } : { id, type:'text' });
  inp.value = L[k];
  inp.addEventListener('focus', pushUndo);
  inp.addEventListener('input', () => { L[k] = inp.value; RT.layout.clear(); changed(); });
  return field(label, inp, id, true);
}
// texto com peso por trecho: selecione uma parte e escolha o peso (ou Ctrl+B / Ctrl+I)
const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extrabold'], [900, 'Black']];
function richF(L, label) {
  const id = fid(L, 'text');
  const ed = h('div', { class:'rich', id, contenteditable:'true', role:'textbox', 'aria-multiline':'true', 'aria-label':label, spellcheck:'false' });
  // cada letra guarda peso e itálico; null = segue o da camada
  const toChars = () => { const cs = []; for (const x of runsOf(L) || [{ t:L.text }]) for (const ch of x.t) cs.push({ ch, w:x.w ?? null, i:x.i ?? null, c:x.c ?? null }); return cs; };
  const fromChars = cs => {
    const runs = [];
    for (const c of cs) { const p = runs[runs.length - 1]; if (p && p.w === c.w && p.i === c.i && p.c === c.c) p.t += c.ch; else runs.push({ t:c.ch, w:c.w, i:c.i, c:c.c }); }
    L.text = cs.map(c => c.ch).join('');
    L.runs = runs.every(r => r.w == null && r.i == null && r.c == null) ? null : runs.map(r => { const o = { t:r.t }; if (r.w != null) o.w = r.w; if (r.i != null) o.i = r.i; if (r.c != null) o.c = r.c; return o; });
  };
  const paint = () => {
    ed.innerHTML = '';
    for (const r of runsOf(L) || [{ t:L.text }]) {
      if (!r.t) continue;
      const sp = h('span', { text:r.t });
      sp.style.fontWeight = r.w ?? L.weight; sp.style.fontStyle = (r.i ?? L.italic) ? 'italic' : 'normal';
      if (r.w != null) sp.dataset.w = r.w;
      if (r.i != null) sp.dataset.i = r.i ? '1' : '0';
      if (r.c) sp.dataset.c = r.c;
      ed.append(sp);
    }
    ed.style.fontFamily = `"${L.font}", var(--f-ui)`;
    ed.style.fontWeight = L.weight; ed.style.fontStyle = L.italic ? 'italic' : 'normal';
    if (typeof showClr === 'function') showClr();
  };
  // lê o editor mantendo o estilo de cada trecho
  const read = () => {
    const cs = [];
    const walk = (n, w, it, cl) => {
      if (n.nodeType === 3) { for (const ch of n.data) cs.push({ ch:ch === ' ' ? ' ' : ch, w, i:it, c:cl }); return; }
      if (n.nodeName === 'BR') { cs.push({ ch:'\n', w, i:it, c:cl }); return; }
      if (n !== ed && /^(DIV|P)$/.test(n.nodeName) && cs.length && cs[cs.length - 1].ch !== '\n') cs.push({ ch:'\n', w, i:it, c:cl });
      if (n.dataset && n.dataset.c) cl = n.dataset.c;
      if (n.dataset && n.dataset.w) w = +n.dataset.w;
      if (n.dataset && n.dataset.i) it = n.dataset.i === '1';
      for (const c of n.childNodes) walk(c, w, it, cl);
    };
    walk(ed, null, null, null);
    return cs;
  };
  // seleção em índices de letra
  const offsetOf = (node, off) => { const r = document.createRange(); r.setStart(ed, 0); r.setEnd(node, off); const d = h('div'); d.append(r.cloneContents()); return [...d.textContent].length; };
  const getSel = () => {
    const s = getSelection(); if (!s.rangeCount || !ed.contains(s.anchorNode) || !ed.contains(s.focusNode)) return null;
    const a = offsetOf(s.anchorNode, s.anchorOffset), b = offsetOf(s.focusNode, s.focusOffset);
    return [Math.min(a, b), Math.max(a, b)];
  };
  const setSel = (a, b) => {
    const at = i => {
      let n = 0;
      for (const sp of ed.childNodes) {
        const tn = sp.firstChild || sp, cs = [...(tn.data || '')];
        if (i <= n + cs.length) return [tn, cs.slice(0, i - n).join('').length];
        n += cs.length;
      }
      return [ed, ed.childNodes.length];
    };
    const r = document.createRange(), [n1, o1] = at(a), [n2, o2] = at(b); r.setStart(n1, o1); r.setEnd(n2, o2);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  let sel = null;
  const wSel = h('select', { 'aria-label':'Peso do trecho selecionado' }, [h('option', { value:'', text:'Peso do trecho' }), ...weightsOf(L.font).map(([v, t]) => h('option', { value:v, text:`${t} ${v}` }))]);
  // mostra o peso do trecho selecionado
  const sync = () => {
    const rg = getSel(); if (!rg) return; sel = rg;
    const ws = [...new Set(toChars().slice(rg[0], rg[1]).map(c => c.w ?? L.weight))];
    wSel.value = rg[0] !== rg[1] && ws.length === 1 ? String(ws[0]) : '';
    const cc = [...new Set(toChars().slice(rg[0], rg[1]).map(c => c.c || L.color))];
    cBtn.setColor(rg[0] !== rg[1] && cc.length === 1 ? cc[0] : L.color);
  };
  const style = (k, v) => {
    const rg = sel; if (!rg || rg[0] === rg[1]) { toast('Selecione um trecho do texto primeiro'); wSel.value = ''; return; }
    pushUndo();
    const cs = toChars(), cur = cs.slice(rg[0], rg[1]);
    if (k === 'i' && v === 'toggle') v = !cur.every(c => c.i ?? !!L.italic);
    if (k === 'w' && v === 'toggle') v = cur.every(c => (c.w ?? L.weight) >= 700) ? 400 : 700;
    for (let j = rg[0]; j < rg[1]; j++) cs[j][k] = (k === 'w' ? v === L.weight : v === !!L.italic) ? null : v;
    fromChars(cs); RT.layout.clear(); paint(); changed();
    ed.focus(); setSel(rg[0], rg[1]); sync();
  };
  // cor do trecho: aplica ao vivo, sem tirar o foco do seletor
  let cUndo = false;
  const cBtn = colorButton(L.color, 'Cor do trecho selecionado', { onStart:() => { sel = getSel() || sel; cUndo = false; }, onInput:c => {
    const rg = sel; if (!rg || rg[0] === rg[1]) { toast('Selecione um trecho do texto primeiro'); return; }
    if (!cUndo) { pushUndo(); cUndo = true; }
    const cs = toChars(); for (let j = rg[0]; j < rg[1]; j++) cs[j].c = c === L.color ? null : c;
    fromChars(cs); RT.layout.clear(); paint(); changed();
  } });
  cBtn.addEventListener('pointerdown', () => { sel = getSel() || sel; cUndo = false; }, true);
  const keep = e => { e.preventDefault(); sel = getSel() || sel; };
  wSel.addEventListener('pointerdown', () => { sel = getSel() || sel; });
  wSel.addEventListener('change', () => { if (wSel.value) style('w', +wSel.value); });
  const bBtn = h('button', { class:'btn small', title:'Negrito no trecho (Ctrl+B)', html:'<b>B</b>', onpointerdown:keep, onclick:() => style('w', 'toggle') });
  const iBtn = h('button', { class:'btn small', title:'Itálico no trecho (Ctrl+I)', html:'<i>I</i>', onpointerdown:keep, onclick:() => style('i', 'toggle') });
  // só aparece quando há trechos com peso diferente
  const clr = h('button', { class:'btn small ghost clr', text:'Limpar', title:'Tira peso, itálico e cor dos trechos', onclick:() => { if (!L.runs) return; pushUndo(); L.runs = null; RT.layout.clear(); paint(); changed(); } });
  const showClr = () => { clr.hidden = !L.runs; };
  document.addEventListener('selectionchange', function f() { if (!ed.isConnected) { document.removeEventListener('selectionchange', f); return; } if (document.activeElement === ed) sync(); });
  ed.addEventListener('focus', pushUndo);
  ed.addEventListener('input', () => { fromChars(read()); RT.layout.clear(); showClr(); changed(); });
  ed.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'b' || k === 'i')) { e.preventDefault(); sel = getSel(); style(k === 'b' ? 'w' : 'i', 'toggle'); return; }
    if (mod && k === 'u') { e.preventDefault(); return; }
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
  });
  // colar: só o texto simples, direto no modelo (sem depender do execCommand)
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const txt = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n').replace(/[\u200b\ufeff\u2028\u2029]/g, '').replace(/\u00a0/g, ' ');
    if (!txt) return;
    const rg = getSel() || sel || [toChars().length, toChars().length];
    pushUndo();
    const cs = toChars(), prev = cs[rg[0] - 1] || cs[rg[0]] || {};
    cs.splice(rg[0], rg[1] - rg[0], ...[...txt].map(ch => ({ ch, w:prev.w ?? null, i:prev.i ?? null, c:prev.c ?? null })));
    fromChars(cs); RT.layout.clear(); paint(); changed();
    const at = rg[0] + [...txt].length; setSel(at, at); sel = [at, at];
  });
  // o navegador às vezes cria <div>/<br>/<b>; ao sair, redesenha limpo
  ed.addEventListener('blur', () => { if (ed.querySelector('div,p,br,b,strong,i,em,font')) paint(); });
  paint();
  return h('div', { class:'field stack' }, [h('label', { for:id, text:label }), ed, h('div', { class:'richbar' }, [bBtn, iBtn, cBtn, wSel, clr])]);
}
function fontF(L) {
  const fams = allFonts(); if (!fams.includes(L.font)) fams.push(L.font);
  return selectF(L, 'font', 'Fonte', fams.map(f => [f, f]));
}
function uploadF(label, accept, onFile) {
  const id = 'up-' + Math.random().toString(36).slice(2, 7);
  const inp = h('input', { type:'file', id, accept, hidden:true });
  inp.addEventListener('change', () => { if (inp.files[0]) onFile(inp.files[0]); });
  return h('div', { class:'row' }, [h('button', { class:'btn small', text:label, onclick:() => inp.click() }), inp]);
}
// camadas que recebem a mudança: a selecionada e o resto da seleção (de qualquer tipo)
function peersAny(L) { if (!isPicked(L.id)) return [L]; const ps = pickedLayers(); return ps.includes(L) ? ps : [L]; }
function presetKeys(q, k) {
  if (q.__g) return G_KEYS[k]; // o grupo (gview)
  if (k === 'in') return q.type === 'text' ? TEXT_IN : BLOCK_IN[q.type] || [];
  if (k === 'out') return q.type === 'text' ? TEXT_OUT : BLOCK_OUT[q.type] || [];
  return IDLE_BY[q.type] || ['none'];
}
/* favoritos e busca de presets: preferência de quem usa, vale em todos os arquivos (fica no navegador, fora do projeto) */
const ICON_STAR = '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/></svg>';
const FAVS = (() => { try { const o = JSON.parse(localStorage.getItem('mola-favs')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })(); // { in:[chaves], out:[…], idle:[…] }
const isFav = (k, key) => (FAVS[k] || []).includes(key);
function toggleFav(k, key) {
  const a = FAVS[k] = FAVS[k] || [], i = a.indexOf(key);
  if (i < 0) a.push(key); else a.splice(i, 1);
  try { localStorage.setItem('mola-favs', JSON.stringify(FAVS)); } catch (e) {}
}
let presetQ = ''; // texto da lupa na aba Animação (continua ao trocar de camada)
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CAT_NAME = Object.fromEntries(CATS);
// todas as palavras precisam aparecer no nome ou na categoria ("3d", "revela", "mola"), sem acento
function presetMatch(P, q) { const hay = fold(P.label + ' ' + (CAT_NAME[P.cat] || '')); return fold(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w)); }
function presetSearch(box) {
  const inp = h('input', { type:'text', id:'presetQ', value:presetQ, placeholder:'Buscar animação', 'aria-label':'Buscar animação (tecla /)', autocomplete:'off', spellcheck:'false' });
  const set = v => { presetQ = v; inp.value = v; clr.hidden = !v; box.querySelectorAll('.chips').forEach(w => w.fill && w.fill()); };
  const clr = h('button', { type:'button', class:'psearch-x', title:'Limpar busca (Esc)', 'aria-label':'Limpar busca', text:'×', hidden:!presetQ, onclick:() => { set(''); inp.focus(); } });
  inp.addEventListener('input', () => set(inp.value));
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); if (inp.value) set(''); else inp.blur(); } });
  return h('label', { class:'psearch' }, [h('span', { class:'psearch-i', html:ICON_SEARCH }), inp, clr]);
}
// tecla /: abre a aba Animação e põe o cursor na lupa
function findPreset() {
  const L = selL(); if (!L || L.type === 'bg') { toast('Selecione um elemento para buscar a animação'); return; }
  if (S.still) { toast('Imagem estática não tem animação. Digite uma duração para voltar ao vídeo'); return; }
  if (propTab !== 'anim') { propTab = 'anim'; renderProps(); }
  paneShow('right');
  const i = $('#presetQ'); if (i) { i.focus(); i.select(); }
}
function presetGrid(L, k, keys, map, onPick) {
  const wrap = h('div', { class:'chips' });
  let dest = null; // bloco da categoria aberta (os chips entram nele)
  const lgo = logoOf(L), svgOK = lgo && lgo.isSvg && lgo.parts.length, penOK = lgo && lgo.pen;
  const one = key => {
    const P = map[key]; const needSvg = P.svg && L.type === 'logo';
    const off = L.type === 'logo' && (P.svg ? !svgOK : P.pen ? !penOK : false);
    const fav = isFav(k, key);
    const b = h('button', { class:'chip' + (off ? ' dim' : ''), 'data-key':key, 'aria-pressed':String(L[k] === key), title:off ? (P.svg ? 'Precisa de logo em SVG' : 'Precisa de logo em SVG ou PNG com fundo transparente') : P.label,
      onclick:() => {
        pushUndo();
        // vale para toda a seleção (grupo ou vários): quem não tem esse preset fica como está
        for (const q of peersAny(L)) {
          if (!presetKeys(q, k).includes(key)) continue;
          const Pq = (q.type === 'text' ? TP : BP)[key] || P;
          q[k] = key;
          if (k === 'in' && Pq.dur != null && key !== 'cut') q.inDur = Pq.dur;
          if (k === 'out' && key !== 'cut') q.outDur = Math.min(.8, Math.max(.35, (Pq.dur || .6) * .55));
        }
        // o mesmo preset pode aparecer duas vezes (em Favoritos e na categoria)
        wrap.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.key === key))); wrap.dataset.cur = P.label; changed(); renderMarks();
        if (k === 'out') seekOut(L); else seekLayer(L);
        if (onPick) onPick();
      } }, [h('span', { text:P.label }), needSvg ? h('em', { text:'SVG' }) : null]);
    // "Sem animação" não tem estrela: já fica sempre no topo
    const star = key === 'cut' || key === 'none' ? null : h('button', { type:'button', class:'fav', 'aria-pressed':String(fav), title:fav ? 'Tirar dos favoritos' : 'Favoritar',
      'aria-label':(fav ? 'Tirar dos favoritos: ' : 'Favoritar: ') + P.label, html:ICON_STAR, onclick:() => { toggleFav(k, key); fill(); } });
    (dest || wrap).append(h('div', { class:'chip-w' + (fav ? ' on' : '') }, [b, star]));
  };
  const head = t => wrap.append(h('div', { class:'chip-cat', text:t }));
  // categoria que abre e fecha (lembrada por grade): fechada mostra quantos tem, ou o escolhido se ele estiver ali.
  // Sem escolha, só a do preset escolhido começa aberta; na busca todas aparecem abertas
  const fold = (cat, name, cs) => {
    const key = `cat:${k}:${cat}`, cur = cs.includes(L[k]) ? map[L[k]].label : '', open = FOLD[key] ?? !!cur;
    // mesma seta das seções, à direita; a categoria aberta vira um bloco destacado com os presets dela
    const hd = h('button', { type:'button', class:'chip-cat' + (open ? '' : ' shut'), 'aria-expanded':String(open), title:(open ? 'Fechar ' : 'Abrir ') + name, onclick:() => { foldSave(key, !open); fill(); } },
      [h('span', { text:name }), h('small', { class:cur && !open ? 'cur' : null, text:cur && !open ? cur : String(cs.length) }), h('span', { class:'fold-btn fold-chev', 'aria-hidden':'true', html:FOLD_CHEV })]);
    if (!open) { wrap.append(hd); return; }
    dest = h('div', { class:'cat-box' }, [hd]); wrap.append(dest);
    cs.forEach(one); dest = null;
  };
  const fill = () => {
    wrap.innerHTML = ''; wrap.dataset.cur = map[L[k]]?.label || '';
    const q = presetQ.trim(), ks = q ? keys.filter(key => presetMatch(map[key], q)) : keys;
    if (!ks.length) { wrap.append(h('p', { class:'chip-none', text:`Nenhuma com “${q}”.` })); return; }
    // favoritos: atalho no topo (sem esconder da categoria); na busca, cada um aparece uma vez só
    const favs = q ? [] : keys.filter(key => isFav(k, key));
    // agrupa por categoria (Movimento, Revelação, 3D...), mantendo a ordem da lista dentro de cada uma
    const cats = new Set(ks.map(key => map[key].cat || ''));
    if (cats.size < 2) {
      const top = favs.length && (ks[0] === 'none' || ks[0] === 'cut') ? [ks[0]] : [];
      top.forEach(one);
      if (favs.length) { head('Favoritos'); favs.forEach(one); head('Todos'); }
      ks.filter(key => !top.includes(key)).forEach(one); return;
    }
    for (const [cat, name] of CATS) {
      const cs = ks.filter(key => (map[key].cat || '') === cat);
      if (cs.length) { if (!name) cs.forEach(one); else if (q) { head(name); cs.forEach(one); } else fold(cat, name, cs); }
      if (!cat && favs.length) { head('Favoritos'); favs.forEach(one); } // "Sem animação" em cima, favoritos logo depois
    }
  };
  wrap.fill = fill; fill();
  return wrap;
}
// direção dos presets de deslizar (slide, slideWord, slideAlt), por fase: de onde o elemento vem
const SLIDE_ARROWS = [['L', '▶', 'Da esquerda para a direita'], ['R', '◀', 'Da direita para a esquerda'], ['T', '▼', 'De cima para baixo'], ['B', '▲', 'De baixo para cima']];
function slideDirF(L, k) {
  if (!(L[k] in SLIDE_DEF)) return null;
  const sk = k === 'out' ? 'outSlide' : 'inSlide';
  const wrap = h('div', { class:'segs tight', role:'group', 'aria-label':'Direção do deslize' });
  const draw = () => { wrap.innerHTML = ''; const cur = L[sk] || SLIDE_DEF[L[k]];
    SLIDE_ARROWS.forEach(([v, arrow, title]) => wrap.append(h('button', { 'aria-pressed':String(cur === v), text:arrow, title,
      onclick:() => { pushUndo(); for (const o of peersOf(L)) if (o[k] in SLIDE_DEF) o[sk] = v; draw(); changed(); if (k === 'out') seekOut(L); else seekLayer(L); } }))); };
  draw();
  return field('Direção', wrap, null, true);
}
const usesLine = L => ['line', 'diag', 'scan'].some(k => L.in === k || L.out === k);
function lineF(L) {
  if (!usesLine(L)) return null;
  if (!L.lineColor) L.lineColor = S.brand.colors[2];
  return colorF(L, 'lineColor', 'Cor da linha');
}
function idleGrid(L) {
  const keys = IDLE_BY[L.type] || ['none'];
  const map = Object.fromEntries(keys.map(k => [k, { label:IDLE[k] }]));
  return presetGrid(L, 'idle', keys, map);
}
let propTab = 'anim';
function renderProps() {
  const box = $('#props'); box.innerHTML = '';
  const L = selL();
  if (!L) { box.append(h('div', { class:'props-empty', text:'Selecione uma camada.' })); return; }
  const gid = wholeGroup(); // grupo inteiro selecionado: a aba Animação é a do grupo
  const head = h('section', { class:'sec sec-head', style:`--tc:${gid ? 'var(--c-group)' : TYPE_COLOR[typeKey(L)]}` }, [
    h('div', { class:'lhead' }, [
      h('span', { class:'type-chip', style:`color:${gid ? 'var(--c-group)' : TYPE_COLOR[typeKey(L)]}`, text:gid ? 'Grupo' : TYPE_LABEL[typeKey(L)] }),
      gid ? (() => { const i = h('input', { type:'text', id:'f-g-' + gid + '-name', value:groupName(gid), 'aria-label':'Nome do grupo' }); i.addEventListener('input', () => { gmeta(gid, true).name = i.value.trim() || undefined; renderLayers(); renderTimeline(); autosave(); }); return i; })()
        : (() => { const i = h('input', { type:'text', id:fid(L, 'name'), value:L.name, 'aria-label':'Nome da camada' }); i.addEventListener('input', () => { L.name = i.value; renderLayers(); autosave(); }); return i; })(),
      L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Duplicar', html:ICONS.copy, onclick:() => duplicateLayer(L) }) : null,
      L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Apagar camada (Delete)', html:ICONS.trash, onclick:() => deleteLayer(L) }) : null,
    ]),
  ]);
  box.append(head);

  if (L.type === 'bg') { box.append(frameFlowSec(), bgProps(L)); return; }
  if (NOBOX(L)) { box.append(...camFxProps(L)); return; } // câmera e transição: só preset, ritmo e tempo

  const tabs = h('div', { class:'tabs', role:'tablist' }, [['anim', 'Animação'], ['style', 'Conteúdo e estilo']].map(([k, t]) =>
    h('button', { role:'tab', 'aria-selected':String(propTab === k), text:t, onclick:() => { propTab = k; renderProps(); } })));
  if (S.still) propTab = 'style'; // imagem estática: sem animação
  else head.append(tabs);
  // como no Figma: o nome e as abas ficam sempre no topo; alinhar, tamanho da seleção e layout automático são do conteúdo e estilo
  if (propTab !== 'anim') box.append(...[alignBar(), pathfinderSec(), pickedLayers().length > 1 ? scaleBar() : null, flowSec()].filter(Boolean));

  if (propTab === 'anim' && gid) { box.append(...groupAnimSecs(gid, head, box)); return; }
  if (gid) { box.append(...groupStyleSecs(gid)); return; }
  if (propTab === 'anim') {
    const inKeys = L.type === 'text' ? TEXT_IN : BLOCK_IN[L.type];
    const outKeys = L.type === 'text' ? TEXT_OUT : BLOCK_OUT[L.type];
    const map = L.type === 'text' ? TP : BP;
    head.append(presetSearch(box));
    // ▶ Ver: toca só o trecho (entrada ou saída) e para; nada toca sozinho ao trocar o preset
    const seeBtn = (t, fn) => h('button', { type:'button', class:'see', title:t, 'aria-label':t, html:`${ICON_PLAY}<span>Ver</span>`, onclick:fn });
    // velocidade e intensidade de cada fase, logo abaixo dos presets dela (sempre à vista; valem quando a fase tiver animação)
    const rhythm = (m, minS, maxS, after) => {
      const [sk, ik] = RHY[m]; for (const o of peersAny(L)) { o[sk] = spdOf(o, m); o[ik] = intOf(o, m); } // arquivos antigos: herda o valor único
      return [rangeF(L, sk, 'Velocidade', minS, maxS, .05, v => v.toFixed(2) + '×', { after }),
        rangeF(L, ik, 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%', { after })];
    };
    box.append((() => { const slot = h('div'); const ref = () => { slot.innerHTML = ''; const f = slideDirF(L, 'in'); if (f) slot.append(f); }; ref();
      return h('section', { class:'sec' }, [h('h3', {}, ['Entrada', seeBtn('Ver a entrada (toca só este trecho)', () => previewIn(L))]), presetGrid(L, 'in', inKeys, map, ref), slot,
        ...rhythm('in', .4, 6, () => seekKeep(L))]); })());
    box.append(h('section', { class:'sec' }, [h('h3', { text:'Enquanto está na tela' }), idleGrid(L), ...rhythm('idle', .2, 4, () => seekKeep(L))]));
    box.append(...animExtras(L)); // marca à mão (texto), movimento dentro da imagem
    box.append((() => { const slot = h('div'); const ref = () => { slot.innerHTML = ''; const f = slideDirF(L, 'out'); if (f) slot.append(f); }; ref();
      return h('section', { class:'sec' }, [h('h3', {}, ['Saída', h('span', { class:'h3r' }, [h('small', { text:(L.end ?? S.duration) >= S.duration - .01 ? 'no fim do vídeo' : `em ${(L.end).toFixed(1)}s` }),
        seeBtn('Ver a saída (toca só este trecho)', () => previewOut(L))])]), presetGrid(L, 'out', outKeys, map, ref), slot,
        ...rhythm('out', .4, 6, () => seekKeep(L, true))]); })());
    box.append(h('section', { class:'sec' }, [
      h('h3', { text:'Tempo', 'data-sum':`${fmtSec(L.start)} → ${fmtSec(L.end ?? S.duration)}` }),
      rangeF(L, 'start', 'Entra em', 0, S.duration - .2, .1, v => v.toFixed(1) + 's', { onInput:() => { if (L.end != null && L.end < L.start + .3) L.end = Math.min(S.duration, L.start + .3); renderMarks(); }, after:() => { renderLayers(); seekLayer(L); } }),
      rangeF(L, 'end', 'Sai em', .3, S.duration, .1, v => (v ?? S.duration).toFixed(1) + 's', { onInput:() => { if (L.end < L.start + .3) L.end = L.start + .3; }, after:() => { renderProps(); seekOut(L); } }),
    ]));
  } else {
    box.append(styleProps(L));
    box.append(...styleExtras(L)); // ajustes da imagem
  }
}
// aba Animação do grupo inteiro: age sobre o conjunto e se soma à animação de cada item (que não muda)
function groupAnimSecs(gid, head, box) {
  const G = gview(gid);
  head.append(presetSearch(box));
  const seeBtn = (t, fn) => h('button', { type:'button', class:'see', title:t, 'aria-label':t, html:`${ICON_PLAY}<span>Ver</span>`, onclick:fn });
  const rhythm = (m, minS, maxS, after) => {
    const [sk, ik] = RHY[m]; G[sk] = spdOf(G, m); G[ik] = intOf(G, m);
    return [rangeF(G, sk, 'Velocidade', minS, maxS, .05, v => v.toFixed(2) + '×', { after }),
      rangeF(G, ik, 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%', { after })];
  };
  const idleMap = Object.fromEntries(G_KEYS.idle.map(k => [k, { label:IDLE[k] }]));
  const w = gwin(gid);
  const inSlot = h('div'), inRef = () => { inSlot.innerHTML = ''; const f = slideDirF(G, 'in'); if (f) inSlot.append(f); }; inRef();
  const outSlot = h('div'), outRef = () => { outSlot.innerHTML = ''; const f = slideDirF(G, 'out'); if (f) outSlot.append(f); }; outRef();
  return [
    h('p', { class:'hint hint-pad', text:'Animação do grupo inteiro: age sobre o conjunto e se soma à de cada item, que continua como está. Para mexer em um item só, clique nele na timeline ou use Ctrl + clique.' }),
    h('section', { class:'sec' }, [h('h3', {}, ['Entrada do grupo', seeBtn('Ver a entrada do grupo (toca só este trecho)', () => previewIn(G))]), presetGrid(G, 'in', G_KEYS.in, BP, inRef), inSlot,
      ...rhythm('in', .4, 6, () => seekKeep(G))]),
    h('section', { class:'sec' }, [h('h3', { text:'Enquanto está na tela' }), presetGrid(G, 'idle', G_KEYS.idle, idleMap), ...rhythm('idle', .2, 4, () => seekKeep(G))]),
    h('section', { class:'sec' }, [h('h3', {}, ['Saída do grupo', h('span', { class:'h3r' }, [h('small', { text:`em ${w.end.toFixed(1)}s` }),
      seeBtn('Ver a saída do grupo (toca só este trecho)', () => previewOut(G))])]), presetGrid(G, 'out', G_KEYS.out, BP, outRef), outSlot,
      ...rhythm('out', .4, 6, () => seekKeep(G, true))]),
  ];
}
// opacidade, mesclagem, sombra e desfoque: iguais em toda camada, no grupo e na seleção mista (um lugar só)
const lookFields = L => [rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'), ...blendF(L), ...fxFields(L)];
// aba "Conteúdo e estilo" do grupo inteiro: rotação, opacidade, mesclagem, sombra e desfoque do conjunto (por fora da de cada item, que continua como está)
function groupStyleSecs(gid) {
  const G = gview(gid); G.opacity ??= 1;
  return [h('section', { class:'sec' }, [h('h3', { text:'Aparência do grupo' }),
    h('p', { class:'hint', text:'Vale para o conjunto inteiro, sem mexer nos itens. Cada item pode ter a própria sombra por dentro.' }),
    rotF(G), ...lookFields(G)])];
}
// rotação em graus: a forma e o grupo inteiro (também se giram pela quina no palco)
const rotF = L => rangeF(L, 'rot', 'Rotação', -180, 180, 1, v => Math.round(v) + '°');
function syncPosFields(L) {
  const p = posOf(L);
  ['x', 'y'].forEach(k => { const i = document.getElementById(fid(L, k)); if (i) { i.value = p[k]; const o = i.parentElement.querySelector('.num'); if (o && document.activeElement !== o) o.value = Math.round(p[k] * 100) + '%'; } });
  const n = document.getElementById(fid(L, 'fpos')), nn = posNote(L); if (n && nn) n.replaceWith(nn);
}
function posFields(L) {
  const pos = { low:POS_LO, cap:POS_HI }, posX = { low:POS_LO, cap:posHi() }; // digitado pode ir além da barra (elemento fora do palco)
  return [rangeF(L, 'x', 'Horizontal', 0, slides(), .005, v => Math.round(v * 100) + '%', posX), rangeF(L, 'y', 'Vertical', 0, 1, .005, v => Math.round(v * 100) + '%', pos), posNote(L)];
}
// fora do formato principal: de onde vem a posição e como voltar ao automático
function posNote(L) {
  if (S.format === baseFmt()) return null;
  const ls = peersAny(L), own = ls.some(ownPos);
  return h('div', { class:'posnote', id:fid(L, 'fpos') }, [
    h('span', { text:own ? `Posição ou tamanho ajustados só no ${fmtLabel(S.format)}` : `Automática, reorganizada a partir do ${fmtLabel(baseFmt())}` }),
    own ? h('button', { type:'button', class:'btn small ghost', text:'Voltar ao automático', onclick:() => resetPos(ls) }) : null]);
}
function styleProps(L) {
  const sec = h('section', { class:'sec' }), put = (...xs) => sec.append(...xs.filter(Boolean));
  const px = v => Math.round(v) + 'px';
  // tipos misturados: só o que todos têm em comum (opacidade, mesclagem, sombra e desfoque; a posição fica em Posição, no topo)
  if (peersAny(L).some(o => o.type !== L.type)) {
    put(h('h3', { text:'Aparência' }),
      h('p', { class:'hint', text:`${peersAny(L).length} elementos de tipos diferentes: aqui ficam só as opções em comum. Escolha um tipo só para ver as demais.` }),
      ...lookFields(L));
    return sec;
  }
  // em todos os tipos: Posição (alignBar, no topo) → conteúdo → Aparência (opacidade, mesclagem, sombra, desfoque) → Contorno
  const look = () => [h('h3', { text:'Aparência' }), ...lookFields(L)];
  if (L.type === 'text') {
    put(h('h3', { text:'Texto' }), richF(L, 'Texto (Enter quebra a linha)'), fontF(L),
      selectF(L, 'weight', 'Peso do texto', weightsOf(L.font).map(([v, t]) => [v, `${t} ${v}`]), { num:true, props:true }),
      colorF(L, 'color', 'Cor'),
      L.in === 'highlight' || L.out === 'highlight' ? colorF(L, 'hl', 'Marca-texto') : null,
      lineF(L),
      rangeF(L, 'size', 'Tamanho', 16, 400, 1, px, { layout:true }),
      rangeF(L, 'ls', 'Entre letras', -.08, .6, .005, v => v.toFixed(3) + 'em', { layout:true }),
      rangeF(L, 'lh', 'Entrelinha', .8, 1.6, .01, v => v.toFixed(2), { layout:true }),
      (() => { // largura: abraça o texto (quebra na largura máx.) ou fixa (a caixa tem essa largura; alça lateral no palco)
        const f = rangeF(L, 'maxW', L.fixW ? 'Largura' : 'Largura máx.', .1, 1, .01, v => Math.round(v * 100) + '%', { layout:true });
        f.classList.add('flowgap');
        f.append(h('button', { type:'button', class:'btn small flow-auto', 'aria-pressed':String(!L.fixW), text:'Abraçar', title:L.fixW ? 'Voltar a abraçar o texto (a caixa fica do tamanho da linha mais longa)' : 'Fixar a largura da caixa (ou puxe a lateral no palco)',
          onclick:() => { pushUndo(); const v = !L.fixW; for (const o of peersOf(L)) o.fixW = v || undefined; RT.layout.clear(); changed({ props:true }); } }));
        return f;
      })(),
      segF(L, 'align', 'Alinhamento', [['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']]),
      h('div', { class:'checks' }, [checkF(L, 'upper', 'Caixa alta'), checkF(L, 'italic', 'Itálico')]),
      h('div', { class:'row' }, [h('button', { class:'btn small', text:'Converter em vetor', title:'Texto em curvas (Ctrl+Shift+O). Vira forma Vetor: não edita mais as letras, e a animação passa a ser do bloco', onclick:() => textToVector(peersOf(L).filter(o => o.type === 'text')) })]),
      ...strokeSecs(L),
      ...look());
  } else if (L.type === 'cta') {
    put(h('h3', { text:'Texto' }), textF(L, 'text', 'Texto do botão'), fontF(L),
      selectF(L, 'weight', 'Peso', [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extrabold']], { num:true }),
      rangeF(L, 'size', 'Tamanho', 16, 120, 1, px),
      colorF(L, 'color', 'Cor do texto'),
      h('h3', { text:'Botão' }),
      colorF(L, 'bg', 'Fundo'),
      rangeF(L, 'radius', 'Arredondado', 0, 999, 1, v => v >= 999 ? 'pílula' : px(v)),
      rangeF(L, 'padX', 'Folga lateral', 10, 160, 1, px), rangeF(L, 'padY', 'Folga vertical', 6, 80, 1, px),
      lineF(L),
      ...strokeSecs(L),
      ...look());
  } else if (L.type === 'logo') {
    const drawn = L.in === 'draw' || L.out === 'draw' || L.in === 'assemble' || L.out === 'assemble';
    if (!L.tintColor) L.tintColor = S.brand.colors[1];
    put(
      h('h3', { text:L.svg ? 'SVG' : 'Logo' }),
      h('p', { class:'hint', text:L.svg ? 'Este SVG é só desta camada. Tem as mesmas animações do logo.' : 'O arquivo do logo é trocado em Marca, na coluna da esquerda.' }),
      sizeF(L, 'size', 'Tamanho', .04, .95, .005),
      checkF(L, 'tint', L.svg ? 'Pintar o SVG de uma cor só' : 'Pintar o logo de uma cor só'),
      L.tint ? colorF(L, 'tintColor', 'Cor') : null,
      L.tint ? h('p', { class:'hint', text:'Troca todas as cores do logo por esta. Serve para logo preto, branco ou de outra marca.' }) : null,
      // "Desenhar" e "Montar" desenham o traço do logo antes da cor
      drawn ? checkF(L, 'drawOrig', 'Traço com as cores originais do SVG') : null,
      drawn ? rangeF(L, 'drawWidth', 'Espessura do traço', 1, 16, .5, v => v + 'px') : null,
      drawn && !L.drawOrig ? colorF(L, 'drawColor', 'Cor do traço') : null,
      lineF(L),
      ...strokeSecs(L),
      ...look());
  } else if (L.type === 'shape') {
    const pct = v => Math.round(v * 100) + '%', k = L.kind;
    if (L.fill == null) L.fill = true;
    if (L.strokeDash == null) L.strokeDash = 'solid';
    if (L.strokeGap == null) L.strokeGap = 1;
    if (L.strokeCap == null) L.strokeCap = 'round';
    if (L.strokeJoin == null) L.strokeJoin = 'round';
    // arquivo antigo / caminho aberto com fill:false: o preenchimento vira "sem cor" e o contorno que era obrigatório fica ligado
    if (L.fill === false && k !== 'line') { L.fill = true; L.mode = 'solid'; L.c1 = withA(L.c1 || S.brand.colors[2], 0); L.stroke = true; }
    put(h('h3', { text:'Forma' }),
      segF(L, 'kind', 'Tipo', Object.entries(SHAPE_KINDS)),
      k === 'custom' ? textF(L, 'd', 'Caminho SVG (atributo d do <path>)', true) : null,
      h('div', { class:'row' }, [h('button', { class:'btn small', text:'Editar pontos', title:k === 'custom' ? null : 'A forma vira vetor', onclick:() => vecEdit(L) }), h('button', { class:'btn small', text:'Desenhar com a caneta', onclick:() => penToolStart() })]),
      k === 'custom' ? h('p', { class:'hint', text:'Desenhe com a caneta (P) ou cole o d de qualquer path (Figma, Illustrator, Inkscape). Clique duplo no palco edita os pontos. Ele é vetorial: escala sem perder qualidade e "Desenhar traço" percorre o contorno.' }) : null,
      sizeF(L, 'size', k === 'line' || k === 'custom' ? 'Tamanho' : 'Largura', 0, 1.6, .005, { low:SZ_MIN, cap:SZ_MAX }),
      resizable(L) ? sizeF(L, 'mh', 'Altura', 0, 2.6, .005, { low:SZ_MIN, cap:MH_MAX }) : null,
      ...(k === 'rect' ? cornersF(L, px) : []),
      k === 'polygon' || k === 'star' ? rangeF(L, 'points', 'Pontas', 3, 12, 1, v => String(Math.round(v))) : null,
      k === 'star' ? rangeF(L, 'inner', 'Profundidade', .1, .95, .01, pct) : null,
      rotF(L),
      k !== 'line' ? h('h3', { text:'Preenchimento' }) : null);
    if (k !== 'line') fillProps(L, sec);
    put(...strokeSecs(L),
      L.in === 'draw' && !strokeOn(L) ? h('p', { class:'hint', text:'"Desenhar traço" usa a cor 2 como traço de apoio. Ative Contorno para mantê-lo.' }) : null,
      ...look(),
      lineF(L));
  } else if (L.type === 'image') {
    const pct = v => Math.round(v * 100) + '%';
    L.mask = L.mask || 'fit'; if (L.zoom == null) L.zoom = 1; if (L.ix == null) L.ix = 0; if (L.iy == null) L.iy = 0;
    if (masked(L) && L.mh == null) { const G = blockGeom(L); if (G) L.mh = G.h / W(); }
    const maskSeg = h('div', { class:'segs', role:'group', 'aria-label':'Máscara' }, [['fit', 'Forma da imagem'], ['rect', 'Retângulo'], ['circle', 'Círculo']].map(([v, t]) =>
      h('button', { 'aria-pressed':String(L.mask === v), text:t, onclick:() => {
        pushUndo();
        if (v !== 'fit' && L.mh == null) { const G = blockGeom(L); L.mh = G ? G.h / W() : L.size * .75; }
        L.mask = v; changed({ props:true });
      } })));
    put(
      h('h3', { text:L.video ? 'Vídeo' : 'Imagem' }),
      ...mediaFields(L),
      h('h3', { text:'Máscara' }),
      field('Forma', maskSeg, null),
      sizeF(L, 'size', masked(L) ? 'Largura' : 'Tamanho', 0, 1.6, .005, { low:SZ_MIN, cap:SZ_MAX }),
      masked(L) ? sizeF(L, 'mh', 'Altura', 0, 2.6, .005, { low:SZ_MIN, cap:MH_MAX }) : null,
      ...(L.mask !== 'circle' ? cornersF(L, px) : []),
      // a imagem dentro da máscara (antes uma seção à parte)
      rangeF(L, 'zoom', 'Zoom', .2, 5, .01, v => v.toFixed(2) + '×'),
      rangeF(L, 'ix', 'Imagem ↔', -1, 1, .005, pct),
      rangeF(L, 'iy', 'Imagem ↕', -1, 1, .005, pct),
      h('div', { class:'row' }, [h('button', { class:'btn small', text:'Preencher a máscara', onclick:() => { pushUndo(); setFrame(L, { zoom:1, ix:0, iy:0 }); changed({ props:true }); } })]),
      h('p', { class:'hint', text:'A imagem nunca distorce. No palco: a alça do canto aumenta tudo, as das laterais mudam a máscara, a roda do mouse dá zoom na imagem e Alt + arrastar move a imagem dentro.' }),
      ...strokeSecs(L),
      ...look(),
      lineF(L));
  }
  return sec;
}
function bgProps(L) {
  const sec = h('section', { class:'sec' }, [h('h3', { text:'Fundo' })]);
  fillProps(L, sec);
  sec.append(...blendF(L));
  return sec;
}
// Contorno de qualquer elemento (texto, logo, botão, imagem/vídeo, forma), como no Figma: junto com a cor, não no lugar dela.
// Linha só tem traço (sempre ligado); o resto liga e desliga em "Contorno". Tirar a cor = botão "sem cor" do campo de cor.
function strokeSecs(L) {
  const t = L.type, shape = t === 'shape', line = shape && L.kind === 'line';
  if (L.strokeW == null) L.strokeW = shape ? 8 : 4;
  if (!L.strokeColor) L.strokeColor = shape ? S.brand.colors[1] : '#ffffff';
  if (L.strokeDash == null) L.strokeDash = 'solid';
  if (L.strokeGap == null) L.strokeGap = 1;
  if (L.strokeCap == null) L.strokeCap = 'round';
  if (L.strokeJoin == null) L.strokeJoin = 'round';
  if (L.strokePos == null || (t === 'text' && L.strokePos === 'inside')) L.strokePos = 'center';
  const on = strokeOn(L), dashes = t !== 'text' && t !== 'logo', round = shape && L.kind === 'ellipse' || t === 'image' && L.mask === 'circle';
  const pos = t === 'text' ? [['center', 'Centro'], ['outside', 'Fora']] : [['inside', 'Dentro'], ['center', 'Centro'], ['outside', 'Fora']];
  return [h('h3', { text:line ? 'Traço' : 'Contorno' }),
    line ? null : checkF(L, 'stroke', 'Contorno'),
    on ? rangeF(L, 'strokeW', 'Espessura', 1, 80, .5, v => v + 'px') : null,
    on ? colorF(L, 'strokeColor', 'Cor do traço') : null,
    on && !line && t !== 'logo' ? segF(L, 'strokePos', 'Posição', pos) : null,
    on && dashes ? segF(L, 'strokeDash', 'Estilo', Object.entries(STROKE_STYLES)) : null,
    on && dashes && L.strokeDash !== 'solid' ? rangeF(L, 'strokeGap', 'Espaçamento', .4, 3, .05, v => v.toFixed(2) + '×') : null,
    on && dashes && L.strokeDash !== 'dot' ? segF(L, 'strokeCap', 'Pontas', [['round', 'Redonda'], ['butt', 'Reta'], ['square', 'Quadrada']]) : null,
    on && !line && !round && t !== 'logo' ? segF(L, 'strokeJoin', 'Cantos', [['round', 'Redondo'], ['miter', 'Vivo'], ['bevel', 'Chanfro']]) : null,
    on && canOutline(L) ? h('div', { class:'row' }, [h('button', { class:'btn small', text:'Contorno em vetor', title:'O contorno vira uma forma Vetor própria (Ctrl+Shift+O), como Outline stroke no Figma', onclick:() => outlineStroke(L) })]) : null];
}
// cor animada: o mesmo motor do fundo, também usado nas formas
// Estilo da forma com "Sem preenchimento" junto de Sólido etc.: é só todas as cores em uso com opacidade 0 (o rgb fica guardado)
function fillStyleF(L) {
  const wrap = h('div', { class:'segs', role:'group', 'aria-label':'Estilo' });
  const used = o => { const n = { solid:1, linear:3, spot:2, mesh:4 }[o.mode] || 0; return Array.from({ length:n }, (_, i) => 'c' + (i + 1)); };
  const draw = () => {
    wrap.innerHTML = ''; const none = fillVoid(L);
    const pick = (t, on, fn) => wrap.append(h('button', { 'aria-pressed':String(on), text:t, onclick:() => { pushUndo(); for (const o of peersOf(L)) fn(o); RT.layout.clear(); draw(); changed(); renderProps(); } }));
    for (const [v, t] of Object.entries(BG_MODES)) pick(t, !none && L.mode === v, o => {
      const was = fillVoid(o); o.mode = v;
      if (was) for (const k of used(o)) o[k] = withA(o[k] || S.brand.colors[2], 1);
    });
    pick('Sem preenchimento', none, o => {
      if (o.mode === 'image') o.mode = 'solid';
      for (const k of used(o)) o[k] = withA(o[k] || S.brand.colors[2], 0);
    });
  };
  draw();
  return field('Estilo', wrap, null, true);
}
function fillProps(L, sec) {
  sec.append(L.type === 'shape' ? fillStyleF(L) : segF(L, 'mode', 'Estilo', Object.entries(BG_MODES)));
  if (L.type === 'shape' && fillVoid(L)) return; // sem preenchimento: nada de cor, ângulo, movimento ou granulado
  const lbl =   { mesh:['Base', 'Mancha 1', 'Mancha 2', 'Mancha 3'], linear:['Cor 1', 'Cor 2', 'Cor 3'], spot:['Base', 'Luz'], solid:['Cor'], image:[] }[L.mode] || [];
  lbl.forEach((t, i) => sec.append(colorF(L, 'c' + (i + 1), t)));
  if (L.mode === 'image') {
    sec.append(uploadF(L.src ? 'Trocar imagem' : 'Enviar imagem de fundo', 'image/*', async f => { const src = await imageSrc(f); pushUndo(); L.src = src; await getImage(L.src); changed(); }));
    sec.append(rangeF(L, 'darken', 'Escurecer', 0, .85, .01, v => Math.round(v * 100) + '%'));
  }
  if (L.mode === 'linear') sec.append(rangeF(L, 'angle', 'Ângulo', 0, 360, 1, v => Math.round(v) + '°'));
  if (L.mode !== 'solid') sec.append(rangeF(L, 'motion', L.mode === 'image' ? 'Zoom lento' : 'Movimento', 0, 3, .05, v => v.toFixed(2) + '×'));
  sec.append(rangeF(L, 'grain', 'Granulado', 0, .4, .01, v => Math.round(v * 100) + '%'));
}
function renderAll() { renderFormats(); renderAdds(); renderBrand(); renderLayers(); renderProps(); renderAudio(); $('#loop').checked = S.loop !== false; syncHist(); }

/* ------------ seções que abrem e fecham (como no Figma) ------------
   Todo h3 de uma .sec nas duas colunas vira cabeçalho: um clique fecha o que vem depois dele até o próximo h3 (h3.sub fica
   dentro do de cima). Vale para tudo o que os painéis desenham sem mexer em cada função: um MutationObserver refaz a conta
   quando o conteúdo muda. O estado fica no navegador por título ('mola-fold'); sem escolha, o que é raro começa fechado
   (FOLD_SHUT). Fechado, o cabeçalho mostra o valor atual (preset escolhido, data-sum ou FOLD_SUM). */
const FOLD = (() => { try { const o = JSON.parse(localStorage.getItem('mola-fold')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
const FOLD_SHUT = new Set(['props:Enquanto está na tela', 'props:Marca à mão', 'props:Movimento dentro da imagem', 'props:Saída', 'props:Tempo',
  'props:Ajustes', 'left:Marca', 'left:Trilha', 'left:Arquivo']);
const FOLD_SUM = {
  'left:Trilha': () => S && S.audio ? S.audio.name : 'sem música',
  'left:Camadas': () => S ? String(S.layers.filter(l => l.type !== 'bg').length) : '',
};
// seta à direita em todos os níveis (pedido do usuário: o + / − confundia): para baixo = fechada, gira para cima ao abrir (.shut no CSS)
const FOLD_CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.25 8 9.75l3.5-3.5"/></svg>';
const foldOpen = k => FOLD[k] ?? !FOLD_SHUT.has(k);
function foldSave(k, open) { FOLD[k] = open; try { localStorage.setItem('mola-fold', JSON.stringify(FOLD)); } catch (e) {} }
// o título sem o que vem junto (Ver, small); "Entrada do grupo" divide o estado com "Entrada"
function foldName(el) { return [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().replace(/ do grupo$/, ''); }
const foldPanel = el => el.closest('#props') ? 'props' : el.closest('.left') ? 'left' : null;
// valor atual com a seção fechada: o preset escolhido em cada grade (data-cur vale mesmo com a categoria dele fechada)
function foldSum(el) {
  const fn = FOLD_SUM[el.dataset.fold]; if (fn) return fn();
  if (el.dataset.sum != null) return el.dataset.sum;
  const out = [];
  for (let n = el.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling)
    for (const w of n.matches('.chips') ? [n] : n.querySelectorAll('.chips')) {
      // busca de animação ligada: quantas a grade fechada achou (abrir mostra só elas)
      if (presetQ.trim() && w.dataset.cur != null) { const c = w.querySelectorAll('.chip').length; out.push(c ? `${c} na busca` : 'nada na busca'); continue; }
      const t = w.dataset.cur || w.querySelector('.chip[aria-pressed="true"]')?.textContent.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  return out.join(' · ');
}
function foldHead(el, key) {
  el.dataset.fold = key;
  if (!el._fold) {
    el._fold = true; el.classList.add('fold-h');
    const inner = el.classList.contains('sub');
    el._btn = h('button', { type:'button', class:'fold-btn' + (inner ? ' fold-chev' : ''), html:FOLD_CHEV });
    el._sum = h('span', { class:'fold-sum' }); // logo depois do título; também empurra o resto para a direita
    const t = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); if (t) t.after(el._sum); else el.prepend(el._sum);
    el.append(el._btn);
    // o cabeçalho inteiro abre e fecha; os botões dele (Ver) continuam sendo deles
    el.addEventListener('click', e => { const c = e.target.closest('button, input, select, a, [contenteditable]'); if (c && c !== el._btn) return; foldToggle(el); });
  }
  const open = foldOpen(key), name = foldName(el), s = open ? '' : foldSum(el) || '';
  el.classList.toggle('shut', !open); el.classList.toggle('has-sum', !!s);
  el._btn.setAttribute('aria-expanded', String(open)); el._btn.setAttribute('aria-label', (open ? 'Fechar ' : 'Abrir ') + name); el._btn.title = open ? 'Fechar' : 'Abrir';
  if (el._sum.textContent !== s) el._sum.textContent = s;
}
function foldSec(sec) {
  const panel = foldPanel(sec); if (!panel) return;
  let top = null, shut1 = false, shut2 = false, tail = false, box = null, last = null;
  // subgrupo aberto (h3.sub e o que vem embaixo dele) = um bloco destacado
  const end = () => { if (box) (last || box).classList.add('in-sub-end'); box = last = null; };
  for (const el of sec.children) {
    el.classList.remove('sub-open', 'in-sub', 'in-sub-end');
    if (el.tagName === 'H3') {
      end();
      if (top && el.classList.contains('sub') && !shut1 && foldOpen(panel + ':' + foldName(top) + '/' + foldName(el))) { el.classList.add('sub-open'); box = el; }
      const sub = top && el.classList.contains('sub');
      foldHead(el, panel + ':' + (sub ? foldName(top) + '/' : '') + foldName(el));
      const shut = el.classList.contains('shut');
      if (sub) { el.classList.toggle('folded', shut1); shut2 = shut; } else { top = el; shut1 = shut; shut2 = false; }
      if (!shut1 || !sub) tail = shut;
      continue;
    }
    const off = !!top && (shut1 || shut2);
    el.classList.toggle('folded', off);
    if (!off && !el.hidden) { tail = false; if (box) { el.classList.add('in-sub'); last = el; } }
  }
  end();
  sec.classList.toggle('sec-shut', tail); // fechada no fim: menos espaço embaixo
}
const foldAll = root => root.querySelectorAll('section.sec').forEach(foldSec);
function foldToggle(el) { foldSave(el.dataset.fold, !foldOpen(el.dataset.fold)); const p = el.closest('#props, .left'); if (p) foldAll(p); }
// abre o que esconde el (para focar um campo de dentro, como o texto pelo clique duplo no palco)
function foldReveal(el) {
  const sec = el && el.closest('section.sec'); if (!sec || !foldPanel(sec)) return;
  foldSec(sec); // o painel pode ter acabado de ser desenhado (a conta do observer ainda não rodou)
  let kid = el; while (kid.parentElement !== sec) kid = kid.parentElement;
  let sub = false;
  for (let n = kid.previousElementSibling; n; n = n.previousElementSibling) {
    if (n.tagName !== 'H3') continue;
    if (n.classList.contains('sub')) { if (!sub && n.classList.contains('shut')) foldSave(n.dataset.fold, true); sub = true; continue; }
    if (n.classList.contains('shut')) foldSave(n.dataset.fold, true);
    break;
  }
  foldSec(sec);
}
{
  const obs = new MutationObserver(recs => {
    const secs = new Set();
    for (const r of recs) {
      const s = r.target.closest && r.target.closest('section.sec');
      if (s) secs.add(s);
      else for (const n of r.addedNodes) if (n.nodeType === 1) (n.matches('section.sec') ? [n] : n.querySelectorAll('section.sec')).forEach(x => secs.add(x));
    }
    secs.forEach(foldSec);
    obs.takeRecords(); // as mudanças da própria conta (seta, resumo) não pedem outra
  });
  for (const el of [$('#props'), $('.left')]) { obs.observe(el, { childList:true, subtree:true }); foldAll(el); }
}

/* ------------ eventos globais ------------ */
$('#play').onclick = () => playing ? pause() : play();
$('#scrub').addEventListener('input', e => { pause(); RT.userSeek = true; T = e.target.value / 1000 * S.duration; needs = true; });
$('#loop').onchange = e => { S.loop = e.target.checked; autosave(); };
$('#safe').onchange = () => { needs = true; if ($('#safe').checked && S.format !== '9x16') toast('A zona segura aparece no formato 9:16'); };
$('#undo').onclick = undo;
$('#redo').onclick = redo;
// camadas que iam até o fim acompanham a nova duração
function setDuration(v) {
  v = clamp(v, 2, 60); const old = S.duration; if (v === old) return;
  S.duration = v;
  S.layers.forEach(L => { if (L.end == null || L.end >= old - .01 || L.end > v) L.end = v; if (L.start > v - .3) L.start = Math.max(0, v - .3); });
  T = Math.min(T, v); $('#dur').value = v; changed({ props:true, layers:true });
}
function setMargin() {
  const n = id => clamp(parseFloat($('#' + id).value) || 0, 0, 800);
  pushUndo(); S.margin = { on:$('#mOn').checked, top:n('mT'), right:n('mR'), bottom:n('mB'), left:n('mL') };
  renderFormats(); RT.layout.clear(); pause(); changed();
}
$('#fps').addEventListener('change', e => { pushUndo(); S.fps = +e.target.value; changed(); updTime(); toast(`${S.fps} quadros por segundo na exportação`); });
['mOn', 'mT', 'mR', 'mB', 'mL'].forEach(id => $('#' + id).addEventListener('change', setMargin));
{
  const btn = $('#mBtn'), pop = $('#mPop');
  const show = on => { pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
  btn.onclick = () => show(pop.hidden);
  addEventListener('pointerdown', e => { if (!pop.hidden && !e.target.closest('.mwrap')) show(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') show(false); });
}
$('#dur').addEventListener('change', e => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  if (v === 0) setStill(true);
  else if (v > 0) {
    pushUndo();
    if (S.still) { delete S.still; RT.layout.clear(); renderFormats(); renderAdds(); toast('Vídeo de novo: as animações voltaram'); }
    setDuration(v); changed({ props:true, layers:true });
  }
  e.target.value = S.still ? 0 : S.duration;
});
// Duração 0 = imagem estática: tudo aparece junto e parado, sem timeline, play nem animação. Nada se perde:
// duração, tempos e animações das camadas ficam guardados e voltam ao digitar uma duração
function setStill(on) {
  if (!!S.still === on) return;
  pushUndo(); pause();
  if (on) S.still = true; else delete S.still;
  if (on && propTab === 'anim') propTab = 'style';
  RT.layout.clear(); renderFormats(); renderAdds(); changed({ props:true, layers:true });
  toast(on ? 'Imagem estática: tudo aparece junto e parado. Digite uma duração para voltar ao vídeo' : 'Vídeo de novo: as animações voltaram', 4500, UNDO_ACT);
}
// carrossel: mais ou menos slides. Nada se mexe (x é em larguras de slide); o que fica depois do último slide só sai de vista
function setSlides(v) {
  const n = clamp(Math.round(+v || 1), 1, SLIDES_MAX), was = slides();
  if (n === was) { renderFormats(); return; }
  pushUndo();
  if (n > 1) S.slides = n; else delete S.slides;
  RT.slide = Math.min(RT.slide || 0, n - 1); RT.layout.clear();
  renderFormats(); zoomFit(); changed({ props:true });
  const out = S.layers.filter(l => l.type !== 'bg' && !NOBOX(l) && posOf(l).x >= n);
  if (out.length) toast(`${out.length} elemento${out.length > 1 ? 's ficaram' : ' ficou'} depois do último slide, fora de vista`, 5000, UNDO_ACT);
  else if (was === 1) toast(`Carrossel com ${n} slides. Clique num slide para adicionar nele; cada slide sai como um arquivo`, 5000);
}
$('#slides').addEventListener('change', e => setSlides(e.target.value));
/* ------------ atalhos: mover, marcar tempo, selecionar ------------ */
// setas: move a seleção 1 px do vídeo (Shift = 10). Passos seguidos viram um só no desfazer
let nudgeT = null;
function nudge(dx, dy) {
  const all = pickedLayers(), ls = all.filter(l => !l.locked), L = ls.includes(selL()) ? selL() : ls[0];
  if (!L) { if (all.length && !nudgeT) lockedNote(all); return; }
  if (ls.length === 1 && inFlow(L) && flowOf(L.grp) && !flowWhole(L.grp, ls)) { flowStep(L, dx, dy); return; } // item na fila: troca de lugar
  if (dy && !dx && frameStep(ls, dy)) return; // bloco na coluna do quadro: troca de lugar
  if (!nudgeT) pushUndo();
  clearTimeout(nudgeT); nudgeT = setTimeout(() => { nudgeT = null; }, 700);
  const p = posOf(L); let x = p.x + dx / W(), y = p.y + dy / H();
  if (!freeType(L) && L._bounds) { const f = fitInMargin(x * W(), y * H(), L._bounds.w, L._bounds.h); x = f.ax / W(); y = f.ay / H(); }
  const ddx = x - p.x, ddy = y - p.y;
  for (const o of ls) { const q = posOf(o); setPos(o, +clampPos(q.x + ddx).toFixed(5), +clampPos(q.y + ddy).toFixed(5)); }
  syncPosFields(L); changed();
}
// I / O: a seleção entra / sai no quadro da agulha. Se a agulha passou do outro lado, o elemento inteiro vai para lá
function markAt(edge) {
  if (S.still) return; // imagem: sem tempo
  const all = pickedLayers(); if (!all.length) { toast('Selecione um elemento para marcar a entrada ou a saída'); return; }
  const ls = all.filter(l => !l.locked); if (!ls.length) { lockedNote(all); return; }
  pushUndo();
  const t = clamp(Math.round(T * fps()) / fps(), 0, S.duration), r3 = v => Math.round(v * 1000) / 1000;
  for (const L of ls) {
    const end = L.end ?? S.duration, len = end - L.start;
    if (edge === 'start') {
      if (t <= end - .3) L.start = r3(t);
      else { L.start = r3(Math.min(t, S.duration - .3)); L.end = r3(Math.min(S.duration, L.start + len)); }
    } else if (t >= L.start + .3) L.end = r3(t);
    else { L.end = r3(Math.max(t, .3)); L.start = r3(Math.max(0, L.end - len)); }
  }
  changed({ layers:true, props:true });
  const L = ls.includes(selL()) ? selL() : ls[0];
  toast(edge === 'start' ? `${L.name} entra em ${fmtSec(L.start)}` : `${L.name} sai em ${fmtSec(L.end ?? S.duration)}`, 2600, UNDO_ACT);
}
function selectAll() {
  const ls = S.layers.filter(l => l.type !== 'bg'); if (!ls.length) return;
  RT.picks = new Set(ls.map(l => l.id)); if (!RT.picks.has(RT.selected)) RT.selected = ls[ls.length - 1].id;
  renderLayers(); renderProps(); needs = true;
}
function toggleVisible() {
  const ls = pickedLayers(); if (!ls.length) return;
  pushUndo(); const on = !ls.every(l => l.visible); ls.forEach(l => { l.visible = on; }); changed({ layers:true });
}
// d: 1 = uma para frente, -1 = uma para trás, 2 = na frente de tudo, -2 = logo acima do fundo
function restack(L, d) {
  const i = S.layers.indexOf(L); if (!L || L.type === 'bg' || i < 0) return;
  if (Math.abs(d) === 1) { move(i, d); return; }
  pushUndo(); S.layers.splice(i, 1); S.layers.splice(d > 0 ? S.layers.length : 1, 0, L); changed({ layers:true });
}
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(), typing = typingIn(e.target);
  const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
  if (!$('#keys').hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); showKeys(false); } return; }
  if (mod && !e.altKey && k === 's') { e.preventDefault(); if (e.shiftKey) saveAsCopy(); else flushSave().then(() => toast('Tudo salvo. O Mola salva sozinho a cada mudança.')); return; }
  if (e.key === 'Escape') {
    if (document.querySelector('.ctx')) { closeMenu(); return; }
    if (openPicker) { closePicker(); return; }
    if (typing) { if (tag === 'textarea' || e.target.isContentEditable) e.target.blur(); return; } // Esc sai do texto
    if (overlayOpen() || !$('#mPop').hidden || RT.drag || RT.marq) return; // cada janela fecha sozinha
    const L = selL(); if (L && L.type !== 'bg') { e.preventDefault(); selectBg(); }
    return;
  }
  if (typing || overlayOpen() || RT.exporting) return;
  if (e.altKey && e.shiftKey && !mod) { // Pathfinder, como no Figma
    const op = { KeyU:'union', KeyS:'subtract', KeyI:'intersect', KeyE:'exclude' }[e.code];
    if (op && pfTargets().length) { e.preventDefault(); pathfinder(op); return; }
  }
  if (mod && !e.altKey) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'e' && !e.shiftKey && pfTargets().length) { e.preventDefault(); pathfinder('flatten'); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    else if (k === 'd') { e.preventDefault(); const L = selL(); if (L && L.type !== 'bg') duplicateLayer(L); }
    else if (k === 'a') { e.preventDefault(); selectAll(); }
    else if (k === 'h' && e.shiftKey) { e.preventDefault(); toggleVisible(); }
    else if (k === 'l' && e.shiftKey) { e.preventDefault(); toggleLock(); }
    else if (k === 'e' && e.shiftKey) { e.preventDefault(); exportVideo(); }
    else if (k === 'o' && e.shiftKey) { e.preventDefault(); vectorize(); }
    else if (e.key === '\\') { e.preventDefault(); uiToggle(); } // como no Figma: esconde ou mostra todos os painéis
    else if (e.key === ']' || e.key === '}' || e.key === '[' || e.key === '{') { e.preventDefault(); restack(selL(), (e.key === ']' || e.key === '}' ? 1 : -1) * (e.shiftKey ? 2 : 1)); }
    return;
  }
  // espaço sempre toca/pausa (mesmo com um botão focado), menos enquanto digita
  // Espaço segurado = mão (arrasta o palco); tocar e soltar sem arrastar toca/pausa, como antes
  if (e.code === 'Space') { e.preventDefault(); if (tag === 'button') e.target.blur(); if (!e.repeat) handOn(); return; }
  // atalhos do Figma: Delete / Backspace apagam a camada selecionada
  if (e.key === 'Delete' || e.key === 'Backspace') { const L = selL(); if (L && L.type !== 'bg') { e.preventDefault(); closeMenu(); deleteLayer(L); } return; }
  if (e.key === '?') { e.preventDefault(); showKeys(true); return; }
  if (e.key === '/') { e.preventDefault(); findPreset(); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom((RT.zoom || 1) * 1.25); return; }
  if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom((RT.zoom || 1) / 1.25); return; }
  if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); zoomFit(); return; }
  if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); zoom100(); return; }
  if (e.altKey) return;
  const L = selL(), el = !!L && L.type !== 'bg';
  if (e.key.startsWith('Arrow')) {
    if (tag === 'input') return; // barra deslizante focada: as setas são dela
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (el) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; nudge(dx * s, dy * s); }
    else if (dx) { e.preventDefault(); stepFrames(dx * (e.shiftKey ? fps() : 1)); }
    return;
  }
  if (e.code === 'Comma' || e.code === 'Period') { e.preventDefault(); stepFrames((e.code === 'Comma' ? -1 : 1) * (e.shiftKey ? fps() : 1)); return; }
  if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pause(); T = e.key === 'Home' ? 0 : lastFrame(); RT.userSeek = true; needs = true; return; }
  if (k === 'a' && e.shiftKey) { e.preventDefault(); flowToggle(); return; }
  if (k === 'p') { e.preventDefault(); penToolStart(e.shiftKey ? 'free' : null); return; }
  if (k === 'i' || k === 'o') { e.preventDefault(); markAt(k === 'i' ? 'start' : 'end'); return; }
  if (e.key === 'Enter' && el && (e.target === document.body || e.target === cv)) { e.preventDefault(); editText(L); }
});
/* ------------ painel de atalhos (tecla ?) ------------ */
const KEYS = [
  ['Tocar', [['Espaço', 'Tocar e pausar'], [', .', 'Um quadro para trás / para frente'], ['Shift + , .', 'Um segundo para trás / para frente'], ['← →', 'Quadro a quadro, com nada selecionado'], ['Home End', 'Início / último quadro']]],
  ['Tempo do elemento', [['I', 'Entra na agulha'], ['O', 'Sai na agulha'], ['Clique duplo na barra', 'Leva a agulha até ele'], ['Shift ao arrastar', 'Desliga o ímã da timeline'], ['Esc ao arrastar', 'Cancela']]],
  ['Palco', [['← ↑ → ↓', 'Move 1 px (Shift: 10 px)'], ['Arrastar no vazio', 'Seleciona por área'], ['Shift + clique', 'Soma ou tira da seleção'], ['Ctrl + clique', 'Escolhe um item dentro do grupo'], ['Clique duplo / Enter', 'Edita o texto'], ['Ctrl ao arrastar', 'Desliga as guias'], ['Alt + arrastar imagem', 'Move a imagem na máscara'], ['Roda na imagem', 'Zoom na máscara'], ['Alças (8 pontos)', 'Cantos escalam; lados mudam largura, altura ou quebra do texto'], ['Alt ao puxar a alça', 'Escala a partir do centro']]],
  ['Zoom e painéis', [['+ −  ou Ctrl + roda', 'Zoom do palco'], ['Shift + 1 / Shift + 0', 'Ajustar ao espaço / 100%'], ['Botão do meio', 'Arrasta o palco'], ['Ctrl + \\', 'Esconde ou mostra todos os painéis']]],
  ['Caneta e pontos', [['P', 'Caneta (modos Caneta, Curvas e Mão livre no topo do palco)'], ['Shift + P', 'Caneta à mão livre'], ['Clique duplo na forma', 'Edita os pontos (qualquer forma vira vetor)'], ['Arrastar a linha', 'Curva o trecho (na edição de pontos)'], ['Clique duplo no ponto', 'Curva / canto']]],
  ['Editar', [['Ctrl + Z', 'Desfazer'], ['Ctrl + Shift + Z', 'Refazer'], ['Ctrl + C / X / V', 'Copiar, recortar, colar (vale entre arquivos)'], ['Ctrl + D', 'Duplicar'], ['Delete', 'Apagar'], ['Ctrl + A', 'Selecionar tudo'], ['Esc', 'Tirar a seleção / sair do texto'], ['/', 'Buscar animação']]],
  ['Organizar', [['Ctrl + G', 'Agrupar'], ['Ctrl + Shift + G', 'Desagrupar'], ['Alt + Shift + U S I E', 'Pathfinder: unir, subtrair, interseção, excluir (formas)'], ['Ctrl + E', 'Pathfinder: achatar as formas em um vetor'], ['Ctrl + Shift + O', 'Converter em vetor: texto em curvas e contorno em forma'], ['Shift + A', 'Layout automático (sem nada selecionado: o quadro todo)'], ['Arrastar o espaço rosa', 'Muda o espaço do layout'], ['Ctrl + ] [', 'Para frente / para trás'], ['Ctrl + Shift + ] [', 'Na frente de tudo / no fundo'], ['Ctrl + Shift + H', 'Mostrar ou ocultar'], ['Ctrl + Shift + L', 'Bloquear ou desbloquear']]],
  ['Arquivo', [['Ctrl + S', 'Salvar agora (já salva sozinho)'], ['Ctrl + Shift + S', 'Salvar cópia'], ['Ctrl + Shift + E', 'Exportar (MP4, ou PNG com Duração 0)'], ['Exportar PNG / SVG', 'No transporte. Com algo selecionado salva só a seleção; sem seleção, o quadro da agulha (SVG parado, com o texto em curvas)'], ['Ctrl + V', 'Colar imagem ou SVG'], ['?', 'Este painel']]],
];
function showKeys(on) {
  const box = $('#keys');
  if (on && !box.firstChild) {
    const card = h('div', { class:'keys-card', role:'dialog', 'aria-modal':'true', 'aria-label':'Atalhos de teclado' }, [
      h('div', { class:'files-head' }, [h('h2', { text:'Atalhos' }), h('div', { class:'spacer' }), h('button', { class:'btn small ghost', text:'Fechar', onclick:() => showKeys(false) })]),
      h('div', { class:'keys-grid' }, KEYS.map(([t, rows]) => h('section', {}, [h('h3', { text:t }),
        ...rows.map(([kk, d]) => h('div', { class:'krow' }, [h('kbd', { text:kk }), h('span', { text:d })]))]))),
    ]);
    box.append(card);
    box.addEventListener('pointerdown', ev => { if (ev.target === box) showKeys(false); });
  }
  box.hidden = !on;
  if (on) box.querySelector('button').focus();
}
$('#keysBtn').onclick = () => showKeys(true);
/* ------------ adicionar elementos prontos ------------ */
const ADD_KINDS = [
  { id:'title', label:'Título', gl:'<b style="font:600 20px serif">Aa</b>', mk:(B, F) => mkText('title', { name:'Título', text:'Seu título aqui', font:F[0], weight:500, size:104, lh:1.02, y:.42, in:'lineMask' }) },
  { id:'sub', label:'Subtítulo', gl:'<span style="font-size:13px">Aa</span>', mk:(B, F) => mkText('sub', { name:'Subtítulo', text:'Uma frase curta de apoio', font:F[1], weight:500, size:40, opacity:.82, y:.56, in:'blurChar' }) },
  { id:'kicker', label:'Chamada', gl:'<span style="font:700 9px var(--f-mono);letter-spacing:.2em">NOVO</span>', mk:(B, F) => mkText('kicker', { name:'Chamada', text:'NOVIDADE', font:F[1], weight:700, size:34, ls:.4, color:B.colors[2], y:.3, in:'track' }) },
  { id:'big', label:'Número', gl:'<b style="font-size:17px">%</b>', mk:(B, F) => mkText('big', { name:'Número grande', text:'-30%', font:F[2], weight:800, size:240, lh:1, y:.38, in:'counter', idle:'float' }) },
  { id:'hl', label:'Destaque', gl:'<span style="background:var(--muted);color:var(--bg);padding:1px 4px;border-radius:2px;font-size:11px;font-weight:700">ab</span>', mk:(B, F) => mkText('offer', { name:'Destaque', text:'frete grátis hoje', font:F[1], weight:700, size:56, color:B.colors[0], hl:B.colors[2], y:.6, in:'highlight' }) },
  { id:'impact', label:'Impacto', gl:'<b style="font-size:15px;font-weight:900">AA</b>', mk:(B, F) => mkText('k1', { name:'Frase de impacto', text:'Sem pressa.', font:F[2], weight:800, size:132, upper:true, lh:1, y:.5, in:'stamp' }) },
  { id:'image', label:'Imagem', gl:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="18" height="14" rx="2"/><path d="M1 12l5-5 4 4 3-3 6 6"/><circle cx="14" cy="5" r="1.5"/></svg>', mk:() => mkImage({ y:.42, idle:'float' }) },
  { id:'logo', label:'Logo', gl:'<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="7.5"/><path d="M5 11c2-5 6-5 8 0"/></svg>', mk:() => { const pen = RT.logo && RT.logo.pen; const alone = !S.layers.some(l => l.type !== 'bg'); return mkLogo(alone ? 'logo' : 'logoSmall', { y:alone ? .42 : .12, size:alone ? .36 : .14, in:pen ? 'handwrite' : 'spring', inDur:pen ? BP.handwrite.dur : BP.spring.dur, idle:'shine' }); } },
  { id:'svg', label:'SVG', gl:'<b style="font:700 10px var(--f-mono)">&lt;/&gt;</b>', mk:null },
  { id:'shape', label:'Forma', gl:'<svg width="20" height="18" viewBox="0 0 20 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="6" width="10" height="10" rx="2"/><circle cx="13" cy="6" r="5"/></svg>', mk:() => mkShape({ y:.5 }) },
  { id:'pen', label:'Caneta', gl:'<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 1.5l5 7-5 8-5-8z"/><circle cx="9" cy="9" r="1.3"/><path d="M9 1.5v6.2"/></svg>', add:() => penToolStart() },
  { id:'cta', label:'Botão', gl:'<span style="border:1.5px solid currentColor;border-radius:9px;padding:1px 7px;font-size:10px;font-weight:700">ir</span>', mk:() => mkCta({ y:.74, in:'pop', idle:'pulse' }) },
];
// momento: onde você deixou a agulha (se a moveu de propósito), senão logo depois do último elemento
function nextStart() {
  if (RT.userSeek && T > .05) return Math.min(T, S.duration - .5);
  const els = S.layers.filter(l => l.type !== 'bg');
  if (!els.length) return .2;
  return Math.min(Math.max(...els.map(l => l.start)) + .6, S.duration - .5);
}
// altura: a padrão do tipo, descendo se já houver algo ali ao mesmo tempo (no carrossel, só conta quem está no mesmo slide)
function freeY(y, st, si = 0) {
  const busy = S.layers.filter(l => l.type !== 'bg' && l.visible && (S.still || (l.start <= st + .1 && (l.end ?? S.duration) > st)) && (slides() < 2 || slideAt(l.x * W()) === si));
  const free = v => !busy.some(l => Math.abs(l.y - v) < .07);
  for (let k = 0; k <= 8; k++) for (const v of [y + k * .05, y - k * .05]) if (v >= .08 && v <= .9 && free(v)) return v;
  return y;
}
// carrossel: onde entra o que for adicionado = o slide do elemento escolhido, senão o último slide clicado no palco
function curSlide() {
  if (slides() < 2) return 0;
  const L = selL(); if (L && L.type !== 'bg' && !NOBOX(L)) return slideAt(posOf(L).x * W());
  return clamp(RT.slide || 0, 0, slides() - 1);
}
function addLayer(L, opts = {}) {
  pushUndo();
  // frame selecionado: entra nele, no mesmo tempo que ele (solto num ponto do palco continua onde caiu)
  const fr = opts.x == null ? insertTarget() : null, win = fr && gwin(fr);
  const st = opts.start ?? (win ? win.start : S.still ? 0 : nextStart()); // imagem estática: o tempo todo (continua na tela se voltar ao vídeo)
  L.start = st; L.end = win ? win.end : S.duration;
  if (opts.x != null) { L.x = opts.x; L.y = opts.y; setPos(L, opts.x, opts.y); }
  else { const si = fr ? 0 : curSlide(); if (si) L.x += si; L.y = freeY(L.y, st, si); } // solto num ponto: fica nele também fora do principal
  S.layers.push(L);
  if (fr) { intoFrame(fr, [L]); toast(`Entrou em "${groupName(fr)}"`); }
  select(L.id, !!fr); propTab = 'style'; renderProps(); changed({ layers:true }); seekLayer(L); RT.userSeek = false;
  return L;
}
function renderAdds() {
  const box = $('#adds'); box.innerHTML = '';
  for (const k of ADD_KINDS) {
    if (S.still && (k.id === 'camera' || k.id === 'fx')) continue; // imagem estática: câmera e transição não existem
    box.append(h('button', { class:'add', title:'Adicionar ' + k.label.toLowerCase(), onclick:() => {
    if (k.add) { k.add(); return; }
    if (k.id === 'image') { $('#imgFile').click(); return; }
    if (k.id === 'svg') { $('#svgFile').click(); return; }
    addLayer(k.mk(S.brand, S.brand.fonts));
  } }, [h('span', { class:'gl', html:k.gl }), h('span', { text:k.label })]));
  }
  // meus elementos: salvos pelo botão direito ("Salvar em Meus elementos"), valem para qualquer arquivo
  if (!MY_ELS.length) return;
  box.append(h('div', { class:'adds-sub', text:'Meus elementos' }));
  for (const el of MY_ELS) box.append(h('div', { class:'add my', role:'button', tabindex:'0', title:`Adicionar "${el.name}"`, onclick:() => addElement(el), onkeydown:e => { if (e.key === 'Enter') addElement(el); } }, [
    el.thumb ? h('img', { class:'gl', src:el.thumb, alt:'' }) : h('span', { class:'gl', text:'★' }), h('span', { text:el.name }),
    h('button', { class:'x', title:'Tirar de Meus elementos', 'aria-label':`Tirar "${el.name}" de Meus elementos`, text:'×', onclick:e => { e.stopPropagation(); removeElement(el); } })]));
}
const isImg = f => f && /^image\//.test(f.type);
const isSvgFile = f => f && (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name || ''));
// SVG vira uma imagem vetorial sem máscara; garante width/height (a partir do viewBox) para ter proporção
function normalizeSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Esse arquivo não é um SVG válido');
  svg.querySelectorAll('script,foreignObject').forEach(n => n.remove());
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const num = a => parseFloat(svg.getAttribute(a)), vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let w = num('width'), hh = num('height');
  if (!(w > 0 && hh > 0)) {
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; hh = vb[3]; } else { w = 512; hh = 512; }
    svg.setAttribute('width', w); svg.setAttribute('height', hh);
  }
  if (vb.length !== 4 || !(vb[2] > 0)) svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  return new XMLSerializer().serializeToString(svg);
}
/* ------------ SVG com camadas ------------
   Figma, Illustrator, Inkscape e afins exportam cada camada/grupo como um <g>. `splitSvgLayers` acha o nível onde as camadas estão
   (desce enquanto houver um <g> só) e devolve um SVG por camada: o mesmo arquivo, sem as outras camadas (defs, estilos e gradientes
   ficam). Formas soltas entre grupos viram uma camada só ("Formas"). Sem pelo menos um grupo e duas camadas, vale o SVG inteiro. */
const SVG_TAGS = /^(g|path|rect|circle|ellipse|polygon|polyline|line|text|image|use)$/i, SVG_MAXL = 40;
const svgKids = n => [...n.children].filter(c => SVG_TAGS.test(c.localName));
function svgHost(svg) {
  let host = svg;
  for (let k = svgKids(host); k.length === 1 && k[0].localName === 'g'; k = svgKids(host)) host = k[0];
  return host;
}
function svgLayerName(el, i) {
  const raw = el.getAttribute('inkscape:label') || el.getAttribute('data-name') || el.getAttribute('id') || '';
  const nm = raw.replace(/_x([0-9a-f]{2,4})_/gi, (m, c) => String.fromCharCode(parseInt(c, 16))).replace(/_+/g, ' ').trim();
  return nm.slice(0, 40) || `Camada ${i + 1}`;
}
function splitSvgLayers(text) {
  const parse = () => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const kids = svgKids(svgHost(parse()));
  const units = []; // { idx:[posições em kids], name }
  kids.forEach((el, i) => {
    const last = units[units.length - 1];
    if (el.localName !== 'g' && last && last.loose) { last.idx.push(i); return; }
    units.push({ idx:[i], loose:el.localName !== 'g', name:el.localName !== 'g' ? 'Formas' : svgLayerName(el, units.length) });
  });
  if (units.length < 2 || units.length > SVG_MAXL || !kids.some(k => k.localName === 'g')) return null;
  return units.map(u => {
    const svg = parse(), all = svgKids(svgHost(svg)); // o mesmo caminho: ficam só os desta camada
    all.forEach((el, i) => { if (!u.idx.includes(i)) el.remove(); });
    return { name:u.loose && u.idx.length === 1 ? svgLayerName(kids[u.idx[0]], u.idx[0]) : u.name, text:new XMLSerializer().serializeToString(svg) };
  });
}
// cada camada do SVG vira um logo cortado no próprio tamanho, no lugar de onde estava, e todas entram agrupadas
async function addSvgLayers(units, name, pos) {
  const items = [];
  for (const u of units) {
    const svg = { kind:'svg', text:u.text, name:u.name };
    try { const lg = await parseLogo(svg); if (lg.parts.length || lg.pen) { LGC.set(svg.text, lg); items.push({ svg, lg }); } } catch (e) { console.warn(e); }
  }
  if (items.length < 2) return false;
  pushUndo();
  const fr = pos ? null : insertTarget(), win = fr && gwin(fr), st = win ? win.start : S.still ? 0 : nextStart(), end = win ? win.end : S.duration;
  const x0 = Math.min(...items.map(i => i.lg.bx)), x1 = Math.max(...items.map(i => i.lg.bx + i.lg.bw));
  const y0 = Math.min(...items.map(i => i.lg.by)), y1 = Math.max(...items.map(i => i.lg.by + i.lg.bh));
  const k = .4 / Math.max(x1 - x0, 1e-6); // o conjunto ocupa .4 da largura, como um SVG só
  const bf = baseFmt(), si = pos || fr ? 0 : curSlide(), cx = pos ? pos.x : .5 + si, cy = pos ? pos.y : freeY(.42, st, si);
  const step = S.still ? 0 : clamp((end - .5 - st) / items.length, 0, .12);
  const Ls = items.map(({ svg, lg }, i) => {
    const L = mkLogo('logoSmall', { name:svg.name, svg, size:+(lg.bw * k).toFixed(5), in:'fade', inDur:BP.fade.dur, idle:'none' });
    L.start = +(st + i * step).toFixed(3); L.end = end;
    const x = cx + ((lg.bx + lg.bw / 2) - (x0 + x1) / 2) * k, y = cy + ((lg.by + lg.bh / 2) - (y0 + y1) / 2) * k * FORMATS[bf].w / FORMATS[bf].h;
    L.x = +x.toFixed(5); L.y = +y.toFixed(5); if (pos) setPos(L, L.x, L.y);
    return L;
  });
  S.layers.push(...Ls);
  if (fr) intoFrame(fr, Ls);
  else { const gid = 'g' + Math.random().toString(36).slice(2, 7); Ls.forEach(l => { l.grp = gid; }); gmeta(gid, true).name = name || 'SVG'; }
  RT.picks = new Set(Ls.map(l => l.id)); RT.selected = Ls[Ls.length - 1].id; propTab = 'style';
  renderProps(); changed({ layers:true }); seekLayers(Ls); RT.userSeek = false;
  toast(`SVG separado em ${Ls.length} camadas`);
  return true;
}
async function addSvgText(text, name, pos) {
  let svg, lg;
  try {
    const norm = normalizeSvg(text);
    try { if (await addSvgNative(norm, name || 'SVG', pos)) return; } catch (e) { console.warn(e); } // formas e textos de verdade
    let units = null; try { units = splitSvgLayers(norm); } catch (e) { console.warn(e); }
    if (units && await addSvgLayers(units, name || 'SVG', pos)) return;
    svg = { kind:'svg', text:norm, name:name || 'SVG' }; lg = await parseLogo(svg); LGC.set(svg.text, lg); if (!lg.parts.length && !lg.pen) throw new Error('Não achei formas nesse SVG');
  }
  catch (e) { toast(e.message || 'Não consegui ler esse SVG', 3200); return; }
  const pen = !!lg.pen;
  addLayer(mkLogo('logoSmall', { name:svg.name, svg, y:.42, size:.4, in:pen ? 'handwrite' : 'draw', inDur:pen ? BP.handwrite.dur : BP.draw.dur, idle:'none' }), pos || {});
  toast('SVG adicionado');
}
async function addImageFile(f, pos) {
  if (isSvgFile(f)) { addSvgText(await readAs(f, 'readAsText'), f.name && f.name.replace(/\.[^.]+$/, ''), pos); return; }
  if (!isImg(f)) return;
  const src = await imageSrc(f); await getImage(src);
  addLayer(mkImage({ y:.42, idle:'float', src, name:f.name ? f.name.replace(/\.[^.]+$/, '') : 'Imagem' }), pos || {});
  toast('Imagem adicionada');
}
$('#imgFile').addEventListener('change', e => { addImageFile(e.target.files[0]); e.target.value = ''; });
$('#svgFile').addEventListener('change', e => { addImageFile(e.target.files[0]); e.target.value = ''; });
{
  const box = $('#stageBox'), dz = $('#dropzone');
  const hasImg = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file' && /^(image|video|audio)\//.test(i.type));
  box.addEventListener('dragover', e => { if (!hasImg(e)) return; e.preventDefault(); dz.hidden = false; });
  box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) dz.hidden = true; });
  box.addEventListener('drop', e => {
    const fs = [...e.dataTransfer.files], f = fs.find(isImg) || fs.find(isVid) || fs.find(isAud);
    dz.hidden = true; if (!f) return;
    e.preventDefault();
    if (isAud(f)) { setMusicFile(f); return; } // música vai para a trilha
    const r = $('#cv').getBoundingClientRect(), inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    (isVid(f) ? addVideoFile : addImageFile)(f, inside ? { x:clamp((e.clientX - r.left) / r.width) * slides(), y:clamp((e.clientY - r.top) / r.height) } : null);
  });
  document.addEventListener('paste', e => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || overlayOpen()) return;
    const f = [...(e.clipboardData?.files || [])].find(isImg); if (f) { e.preventDefault(); addImageFile(f); return; }
    const t = (e.clipboardData?.getData('text/plain') || '').trim();
    if (t.startsWith(CLIP_TAG)) { e.preventDefault(); try { pasteLayers(JSON.parse(t.slice(CLIP_TAG.length))); } catch (err) { toast('Não consegui colar esses elementos'); } return; }
    if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t)) { e.preventDefault(); addSvgText(t, 'SVG'); }
  });
}

// logo
async function setLogoFile(f) {
  pushUndo();
  const isSvg = /svg/i.test(f.type) || /\.svg$/i.test(f.name);
  S.brand.logo = isSvg ? { kind:'svg', text:await readAs(f, 'readAsText'), name:f.name } : { kind:'img', data:await readAs(f, 'readAsDataURL'), name:f.name };
  await refreshLogo(); autosave();
  const lg = S.layers.find(l => l.type === 'logo'); if (lg) seekLayer(lg);
  if (RT.logo) toast(RT.logo.isSvg ? `Logo SVG carregado com ${RT.logo.parts.length} partes` : 'Logo carregado. Para desenhar o traço, use SVG.');
}
$('#logoFile').addEventListener('change', e => e.target.files[0] && setLogoFile(e.target.files[0]));
const drop = $('#logoDrop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setLogoFile(f); });

// fontes
// lista de sugestões própria (o datalist nativo é desenhado pelo navegador e não pega o CSS)
const GF_LIST = [...new Set(GOOGLE_SUGGEST)];
let gfOn = -1;
function gfClose() { $('#gfonts').hidden = true; $('#gfont').setAttribute('aria-expanded', 'false'); gfOn = -1; }
function gfOpen() {
  const inp = $('#gfont'), pop = $('#gfonts'), q = fold(inp.value.trim());
  const items = GF_LIST.filter(f => !S.brand.loaded.some(l => l.family === f) && fold(f).includes(q))
    .sort((a, b) => (fold(b).startsWith(q) - fold(a).startsWith(q))).slice(0, 60);
  if (!items.length) { gfClose(); return; }
  pop.replaceChildren(...items.map(f => h('button', { type:'button', role:'option', onmousedown:e => { e.preventDefault(); inp.value = f; gfClose(); addGoogle(); } }, f)));
  const r = inp.getBoundingClientRect(), row = inp.parentElement.getBoundingClientRect(), below = innerHeight - r.bottom - 12, above = r.top - 12, up = below < 160 && above > below;
  pop.hidden = false; gfOn = -1; inp.setAttribute('aria-expanded', 'true');
  pop.style.left = row.left + 'px'; pop.style.width = row.width + 'px';
  pop.style.maxHeight = Math.min(240, up ? above : below) + 'px';
  pop.style.top = up ? '' : r.bottom + 4 + 'px'; pop.style.bottom = up ? innerHeight - r.top + 4 + 'px' : '';
}
function gfMove(d) {
  const bs = [...$('#gfonts').children]; if (!bs.length) return;
  gfOn = (gfOn + d + bs.length) % bs.length;
  bs.forEach((b, i) => b.classList.toggle('on', i === gfOn)); bs[gfOn].scrollIntoView({ block:'nearest' });
}
async function addGoogle() {
  const name = $('#gfont').value.trim(); if (!name) return;
  if (S.brand.loaded.some(f => f.family.toLowerCase() === name.toLowerCase())) { toast('Essa fonte já está na lista'); return; }
  $('#gfontAdd').disabled = true; $('#gfontAdd').textContent = 'Carregando…';
  const ok = await loadGoogleFont(name);
  $('#gfontAdd').disabled = false; $('#gfontAdd').textContent = 'Adicionar';
  if (!ok) { toast('Não achei essa fonte no Google Fonts. Confira o nome exato.', 3200); return; }
  pushUndo(); S.brand.loaded.push({ family:name, src:'google' }); $('#gfont').value = '';
  renderBrand(); renderProps(); autosave(); toast(`${name} adicionada`);
}
$('#gfontAdd').onclick = addGoogle;
$('#gfont').addEventListener('keydown', e => {
  const open = !$('#gfonts').hidden;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) gfOpen(); gfMove(e.key === 'ArrowDown' ? 1 : -1); }
  else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); gfClose(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (open && gfOn >= 0) $('#gfont').value = $('#gfonts').children[gfOn].textContent;
    gfClose(); setTimeout(addGoogle, 0);
  }
});
$('#gfont').addEventListener('input', gfOpen);
$('#gfont').addEventListener('focus', gfOpen);
$('#gfont').addEventListener('blur', gfClose);
addEventListener('resize', gfClose);
$('#gfonts').addEventListener('mousedown', e => e.preventDefault()); // clicar na barra de rolagem da lista não tira o foco do campo
$('.left').addEventListener('scroll', e => { if (e.target !== $('#gfonts')) gfClose(); }, true);
// lista própria para os selects (a nativa é desenhada pelo sistema, com destaque azul)
let selPop = null, selOn = null;
function selClose() { if (selPop) { selPop.remove(); selPop = null; if (selOn) selOn.setAttribute('aria-expanded', 'false'); selOn = null; } }
function selOpen(sel) {
  selClose(); selOn = sel; sel.setAttribute('aria-expanded', 'true');
  const pick = o => { sel.value = o.value; selClose(); sel.dispatchEvent(new Event('input', { bubbles:true })); sel.dispatchEvent(new Event('change', { bubbles:true })); sel.focus(); };
  const pop = h('div', { class:'gf-pop sel-pop', role:'listbox' }, [...sel.options].map(o => h('button', { type:'button', role:'option', class:o.selected ? 'sel' : '', disabled:o.disabled, onclick:() => pick(o) }, o.textContent)));
  document.body.append(pop); selPop = pop;
  const r = sel.getBoundingClientRect(), below = innerHeight - r.bottom - 12, above = r.top - 12, up = below < 160 && above > below;
  pop.style.left = r.left + 'px'; pop.style.minWidth = r.width + 'px';
  pop.style.maxHeight = Math.min(280, up ? above : below) + 'px';
  pop.style.top = up ? '' : r.bottom + 4 + 'px'; pop.style.bottom = up ? innerHeight - r.top + 4 + 'px' : '';
  pop.querySelector('.sel')?.scrollIntoView({ block:'nearest' });
}
document.addEventListener('mousedown', e => {
  const sel = e.target.closest?.('select');
  if (sel && !sel.disabled && !sel.multiple) { e.preventDefault(); sel.focus(); sel === selOn ? selClose() : selOpen(sel); return; }
  if (selPop && !selPop.contains(e.target)) selClose();
}, true);
document.addEventListener('keydown', e => {
  const sel = e.target.closest?.('select');
  if (selPop && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); selClose(); return; }
  if (sel && !sel.multiple && (e.key === 'Enter' || e.key === ' ') && !selPop) { e.preventDefault(); selOpen(sel); return; }
  if (selPop && ['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) selClose();
}, true);
addEventListener('resize', selClose);
addEventListener('wheel', e => { if (selPop && !selPop.contains(e.target)) selClose(); }, { passive:true, capture:true });
document.addEventListener('scroll', e => { if (selPop && !selPop.contains(e.target)) selClose(); }, true);
$('#fontUp').onclick = () => $('#fontFile').click();
$('#fontFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  let family = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim();
  if (S.brand.loaded.some(x => x.family === family)) family += ' ' + Math.random().toString(36).slice(2, 5);
  const data = await readAs(f, 'readAsDataURL');
  const rec = { family, src:'file', data };
  const ok = await loadFileFont(rec);
  if (!ok) { toast('Esse arquivo de fonte não abriu. Tente TTF, OTF ou WOFF.'); return; }
  pushUndo(); S.brand.loaded.push(rec); renderBrand(); renderProps(); autosave(); toast(`${family} adicionada`);
  e.target.value = '';
});

// arquivos
$('#filesBtn').onclick = openFiles;
$('#filesOpen').onclick = openFiles;
$('#filesClose').onclick = closeFiles;
$('#fileNew').onclick = newFile;
$('#files').addEventListener('pointerdown', e => { if (e.target.id === 'files') closeFiles(); });
$('#files').addEventListener('keydown', e => { if (e.key === 'Escape') closeFiles(); });
$('#fileSearch').addEventListener('input', renderFiles);
$('#copyBtn').onclick = saveAsCopy; // Ctrl+Shift+S fica no atalho geral
{
  const fn = $('#fileName');
  fn.addEventListener('keydown', e => { if (e.key === 'Enter') fn.blur(); if (e.key === 'Escape') { fn.value = FILES.name; fn.blur(); } });
  fn.addEventListener('blur', () => { const v = fn.value.trim(); if (v && v !== FILES.name) { FILES.name = v; showFileName(); autosave(); } else fn.value = FILES.name; });
}
// antes de fechar a aba ou trocar de janela, grava o que estiver pendente
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) flushSave(); });
addEventListener('beforeunload', e => { if (saveT || saving) { flushSave(); e.preventDefault(); } });
$('#jsonOut').onclick = async () => saveFile(JSON.stringify(await portableState()), `${FILES.name.replace(/[\\/:*?"<>|]+/g, '-')}.json`);
$('#jsonIn').onclick = () => $('#jsonFile').click();
$('#jsonFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const st = JSON.parse(await readAs(f, 'readAsText')); await loadState(st, f.name.replace(/\.json$/i, '')); toast('Projeto importado como arquivo novo'); } catch (err) { toast('Não consegui ler esse .json'); }
  e.target.value = '';
});

/* ============================================================
   Painéis dos recursos novos: câmera, transição, marca, movimento, moldura, sombra,
   trilha, variações de texto e meus elementos
   ============================================================ */
function pickFile(accept, fn) { const i = h('input', { type:'file', accept, hidden:true }); i.addEventListener('change', () => { if (i.files[0]) fn(i.files[0]); i.remove(); }); document.body.append(i); i.click(); }
// escolha por preset (chips): vale para a seleção do mesmo tipo; `after(v, camada)` ajusta o que depende dela; `seek(v)` leva a agulha a um quadro útil
function chipPick(L, k, opts, after, seek) {
  const wrap = h('div', { class:'chips' });
  opts.forEach(([v, t]) => wrap.append(h('button', { class:'chip', 'aria-pressed':String((L[k] ?? 'none') === v), title:t, onclick:() => {
    pushUndo();
    for (const o of peersOf(L)) { o[k] = v; if (after) after(v, o); }
    RT.layout.clear(); changed({ layers:true }); renderProps();
    if (seek) seek(v);
  } }, [h('span', { text:t })])));
  return wrap;
}
const FXCOLS = { wipe:['c1', 'c2'], bars:['c1', 'c2', 'c3'], circle:['c1', 'c2'], blinds:['c1', 'c3'], flash:['c2'], zoom:['c2'] };
function camFxProps(L) {
  const cam = L.type === 'camera', map = cam ? CAMS : FXS, end = () => L.end ?? S.duration;
  const seek = () => { pause(); T = clamp(cam ? L.start + (end() - L.start) * .6 : (L.start + end()) / 2 - .12, 0, S.duration); needs = true; };
  const secs = [h('section', { class:'sec' }, [h('h3', { text:cam ? 'Movimento da câmera' : 'Transição' }),
    chipPick(L, cam ? 'cam' : 'fx', Object.entries(map).map(([v, P]) => [v, P.label]), (v, o) => {
      if (cam || !FXS[v].dur) return;
      // outra transição: mantém o meio e usa a duração dela
      const mid = (o.start + (o.end ?? S.duration)) / 2, d = FXS[v].dur;
      o.start = +clamp(mid - d / 2, 0, Math.max(0, S.duration - d)).toFixed(2); o.end = +(o.start + d).toFixed(2);
    }, seek),
    h('p', { class:'hint', text:cam ? 'Mexe em todas as camadas juntas, do início ao fim da barra na timeline. Na paralaxe, o que está mais na frente anda mais.'
      : 'No meio da barra a tela fica toda coberta: é ali que o conteúdo troca. A timeline gruda nesse ponto.' })])];
  if (L.intensity == null) L.intensity = .5;
  if (L.speed == null) L.speed = 1;
  const rit = [h('h3', { text:'Ritmo' }), rangeF(L, 'intensity', 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%', { after:seek })];
  if (cam && ['punch', 'shake', 'hand'].includes(L.cam)) rit.push(rangeF(L, 'speed', 'Velocidade', .4, 3, .05, v => v.toFixed(2) + '×', { after:seek }));
  rit.push(
    rangeF(L, 'start', 'Começa em', 0, S.duration - .2, .05, v => v.toFixed(2) + 's', { onInput:() => { if (L.end != null && L.end < L.start + .2) L.end = Math.min(S.duration, L.start + .2); }, after:() => { renderLayers(); seek(); } }),
    rangeF(L, 'end', 'Termina em', .2, S.duration, .05, v => (v ?? S.duration).toFixed(2) + 's', { onInput:() => { if (L.end < L.start + .2) L.end = L.start + .2; }, after:() => { renderLayers(); seek(); } }));
  secs.push(h('section', { class:'sec' }, rit));
  // transição que desenha algo (o chicote só mexe na câmera): opacidade e mesclagem, como nos outros elementos
  if (!cam && FXS[L.fx] && FXS[L.fx].draw) secs.push(h('section', { class:'sec' }, [h('h3', { text:'Aparência' }),
    rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'), ...blendF(L)]));
  const cols = !cam && FXCOLS[L.fx];
  if (cols) secs.push(h('section', { class:'sec' }, [h('h3', { text:'Cores' }),
    ...cols.map((k, i) => colorF(L, k, cols.length === 1 ? 'Cor da luz' : i === 0 ? 'Cor da frente' : `Cor ${i + 1}`))]));
  return secs;
}
function animExtras(L) {
  const out = [];
  if (L.type === 'text') {
    const B = S.brand.colors;
    const sec = h('section', { class:'sec' }, [h('h3', { text:'Marca à mão' }),
      chipPick(L, 'mark', Object.entries(MARKS), (v, o) => { if (v !== 'none' && !o.markColor) o.markColor = (o.color || '').toLowerCase() === B[2].toLowerCase() ? B[1] : B[2]; },
        v => { pause(); const ph = phase(L, L.start) || { inD:0 }; T = clamp(L.start + ph.inD + (v === 'none' ? .05 : 1 / (spdOf(L, 'in') || 1)), 0, (L.end ?? S.duration) - .02); needs = true; })]);
    if (L.mark && L.mark !== 'none') sec.append(colorF(L, 'markColor', 'Cor da marca'), h('p', { class:'hint', text:'Se desenha logo depois da entrada e some na saída.' }));
    out.push(sec);
  }
  if (L.type === 'image') out.push(h('section', { class:'sec' }, [h('h3', { text:'Movimento dentro da imagem' }),
    chipPick(L, 'move', Object.entries(MOVES), null, () => { pause(); T = clamp(L.start + ((L.end ?? S.duration) - L.start) * .5, 0, S.duration); needs = true; }),
    h('p', { class:'hint', text:'Anda devagar do começo ao fim da camada, sem mostrar a borda. "Rolar a tela" desce por prints compridos de app ou site.' })]));
  return out;
}
// cor automática da sombra: escura; "Dura" usa o destaque da marca; "Luz" usa a cor do próprio elemento
function autoShadowHex(L, key) {
  const B = S.brand.colors, own = L.type === 'text' ? L.color : L.type === 'cta' ? L.bg : L.type === 'shape' ? L.c1 : null;
  if (key === 'hard') return own && own.toLowerCase() === B[2].toLowerCase() ? B[3] : B[2];
  if (key === 'glow') return own || B[2];
  return '#000000';
}
// ajustes da foto (exposição, cor…): filtros prontos + barras; vale para todas as imagens selecionadas
function adjSec(L) {
  const peers = peersOf(L);
  for (const o of peers) for (const k of ADJ_K) if (o[k] == null) o[k] = 0;
  const same = vals => ADJ_K.every(k => (L[k] || 0) === (vals[k] || 0));
  const set = vals => { pushUndo(); for (const o of peers) for (const k of ADJ_K) o[k] = vals[k] || 0; changed({ props:true }); };
  const sec = h('section', { class:'sec' }, [h('h3', { text:'Ajustes' }),
    h('div', { class:'chips' }, Object.entries(LOOKS).map(([v, [t, vals]]) => h('button', { class:'chip', 'aria-pressed':String(same(vals)), title:t, onclick:() => set(vals) }, [h('span', { text:t })])))]);
  const num = v => Math.round((v || 0) * 100);
  for (const [g, list] of ADJ) {
    sec.append(h('h3', { class:'sub', text:g })); // abre e fecha dentro de Ajustes
    for (const [k, label, min = -1] of list) {
      const f = rangeF(L, k, label, min, 1, .01, num);
      // clique duplo na barra volta ao zero
      f.querySelector('input[type=range]').addEventListener('dblclick', () => { pushUndo(); for (const o of peers) o[k] = 0; changed({ props:true }); });
      sec.append(f);
    }
  }
  sec.append(h('div', { class:'row' }, [h('button', { class:'btn small', text:'Redefinir ajustes', disabled:same({}), onclick:() => set({}) })]),
    h('p', { class:'hint', text:adjGL() ? 'Clique duplo numa barra volta ao zero. Vale também para vídeo.' : 'Este navegador não tem WebGL2: os ajustes não aparecem.' }));
  return sec;
}
// só o que é grande e raro fica numa seção à parte (Ajustes da imagem); o resto entrou nas seções de styleProps
function styleExtras(L) {
  return L.type === 'image' ? [adjSec(L)] : [];
}
// chipPick numa linha só (poucas opções curtas: moldura, presets do desfoque)
function segPick(L, k, opts, after, seek, def = 'none', peers = peersOf) {
  const wrap = h('div', { class:'segs' + (opts.length <= 4 && opts.every(o => String(o[1]).length <= 10) ? ' tight' : ''), role:'group' });
  opts.forEach(([v, t, tip]) => wrap.append(h('button', { 'aria-pressed':String((L[k] ?? def) === v), text:t, title:tip || t, onclick:() => {
    pushUndo();
    for (const o of peers(L)) { o[k] = v; if (after) after(v, o); }
    RT.layout.clear(); changed({ layers:true }); renderProps();
    if (seek) seek(v);
  } })));
  return wrap;
}
// corte do vídeo: início e fim do trecho (no vídeo original). A barra da camada acompanha sozinha (vidFitEnd)
function vidCutFields(L) {
  const d = L.vdur || 60, step = .05;
  const fix = o => { const od = o.vdur || d; o.vIn = clamp(o.vIn || 0, 0, od - .1); if (o.vOut != null) { o.vOut = clamp(o.vOut, 0, od); if (o.vOut - o.vIn < .1) o.vOut = Math.min(od, o.vIn + .1); if (o.vOut >= od - 1e-3) o.vOut = null; } if (!o.vIn) delete o.vIn; if (o.vOut == null) delete o.vOut; vidFitEnd(o); };
  const look = edge => {
    pause(); const { a, b } = vidCut(L), s = L.start, e = (L.end ?? S.duration) - 1e-3;
    T = clamp(edge ? s + (b - a) - 1 / fps() : restTime(L), s, e); needs = true;
  };
  const len = () => { const { a, b } = vidCut(L); return b - a; };
  const edit = edge => { peersOf(L).filter(o => o.video).forEach(fix); look(edge); upd(); renderTimeline(); };
  const inF = rangeF(L, 'vIn', 'Começa em', 0, d, step, v => fmtSec(v || 0), { onInput:() => edit(0) });
  const outF = rangeF(L, 'vOut', 'Termina em', 0, d, step, v => fmtSec(v ?? d), { onInput:() => edit(1) });
  const inR = inF.querySelector('input[type=range]'), outR = outF.querySelector('input[type=range]'), nums = [inF, outF].map(f => f.querySelector('.num'));
  const note = h('p', { class:'hint' });
  const upd = () => {
    const n = len(), on = (L.end ?? S.duration) - L.start;
    inR.value = L.vIn || 0; outR.value = L.vOut ?? d;
    if (document.activeElement !== nums[0]) nums[0].value = fmtSec(L.vIn || 0);
    if (document.activeElement !== nums[1]) nums[1].value = fmtSec(L.vOut ?? d);
    note.textContent = `Trecho de ${fmtSec(n)} (o vídeo tem ${fmtSec(d)}). ${n < on - .05 ? 'Repete até a camada sair.' : n > on + .05 ? 'O vídeo final acaba antes do fim do trecho.' : 'As bordas da barra na timeline também cortam.'}`;
  };
  upd();
  return [inF, outF, note];
}
// topo da seção Imagem/Vídeo: trocar o arquivo, remover fundo, moldura
function mediaFields(L) {
  return [
    L.video ? h('p', { class:'hint', text:'Vídeo sem som. Começa quando a camada entra.' }) : null,
    ...(L.video ? vidCutFields(L) : []),
    L.video ? uploadF('Trocar vídeo', 'video/*', async f => {
      toast('Abrindo o vídeo…');
      try { const id = await putMedia(f), p = await videoPoster(await mediaUrl(id)); pushUndo(); L.video = id; L.src = p.src; L.vdur = p.dur; delete L.vIn; delete L.vOut; vidFitEnd(L); await getImage(L.src); changed({ layers:true, props:true }); toast('Vídeo trocado'); }
      catch (e) { toast(e.message || 'Não consegui abrir esse vídeo'); }
    }) : uploadF(L.src ? 'Trocar imagem' : 'Enviar imagem', 'image/*', async f => { const src = await imageSrc(f); pushUndo(); L.src = src; delete L.cut; await getImage(L.src); changed({ props:true }); }),
    cutoutF(L),
    field('Moldura', segPick(L, 'device', Object.entries(DEVICES), (v, o) => {
      if (v === 'phone') { o.mask = 'rect'; o.mh = +(o.size * 2.05).toFixed(4); o.radius = Math.round(o.size * W() * .12); o.zoom = 1; o.ix = 0; o.iy = 0; }
      if (v === 'browser') { o.mask = 'rect'; if (o.mh == null) { const G = blockGeom(o); o.mh = +((G ? G.h / W() : o.size * .62)).toFixed(4); } o.radius = 0; }
    }, () => seekLayer(L)), null, true),
    L.device === 'phone' ? h('p', { class:'hint', text:'Print comprido de app ou site: use "Rolar a tela" em Movimento dentro da imagem, na aba Animação.' }) : null];
}
// sombra e desfoque, no fim de "Aparência" (antes eram seções fechadas à parte): sombra num menu; desfoque = barra livre + presets numa linha.
// Valem para toda a seleção, de qualquer tipo (como a opacidade)
function fxFields(L) {
  const sid = fid(L, 'shadow');
  const sel = h('select', { id:sid }, Object.entries(SHADOWS).map(([k, s]) => h('option', { value:k, text:s.label, selected:(L.shadow || 'none') === k })));
  sel.addEventListener('change', () => {
    pushUndo(); const v = sel.value;
    for (const o of peersAny(L)) { o.shadow = v; o.shColor = v === 'none' ? null : autoShadowHex(o, v); }
    RT.layout.clear(); changed({ layers:true }); renderProps(); seekLayer(L);
  });
  const out = [field('Sombra', sel, sid), L.shadow && L.shadow !== 'none' ? colorF(L, 'shColor', 'Cor da sombra') : null];
  // desfoque da camada e do fundo (vidro), em px
  for (const k of L.type === 'bg' ? ['lblur'] : ['lblur', 'bblur']) {
    L[k] ??= 0;
    out.push(rangeF(L, k, k === 'lblur' ? 'Desfoque' : 'Borrar atrás', 0, 800, 1, v => Math.round(v || 0) + ' px', { after:renderProps }),
      segPick(L, k, BLURS[k].map(([v, t]) => [v, t, v ? `${t}: ${v} px` : t]), null, null, 0, peersAny));
  }
  if (L.type !== 'bg' && L.bblur > 0) out.push(h('p', { class:'hint', text:'Borra o que está atrás, no formato do elemento. Com preenchimento meio transparente, vira vidro.' }));
  return out.filter(Boolean);
}

/* ------------ adicionar: câmera, transição, vídeo e preço de/por ------------ */
function addCamera() {
  const st = RT.userSeek && T > .05 ? Math.min(T, S.duration - .5) : 0;
  const L = addLayer(base('camera', 'camera', { name:'Câmera', cam:'push', in:'cut', out:'cut', inDur:0, outDur:0, intensity:.5, speed:1 }), { start:st });
  pause(); T = clamp(st + (S.duration - st) * .6, 0, S.duration); needs = true;
  return L;
}
// sem agulha posicionada: a transição fica onde a maioria dos elementos sai (senão no meio do vídeo)
function autoCut() {
  const d = S.duration, ends = S.layers.filter(l => l.type !== 'bg' && !NOBOX(l) && l.end != null && l.end > .5 && l.end < d - .3).map(l => l.end);
  if (!ends.length) return d / 2;
  let best = ends[0], bn = 0;
  for (const e of ends) { const n = ends.filter(o => Math.abs(o - e) < .2).length; if (n > bn) { bn = n; best = e; } }
  return best;
}
function addFx() {
  const d = FXS.bars.dur, mid = RT.userSeek && T > .05 ? T : autoCut(), c = S.brand.colors;
  const st = +clamp(mid - d / 2, 0, Math.max(0, S.duration - d)).toFixed(2);
  const L = addLayer(base('fx', 'fx', { name:'Transição', fx:'bars', in:'cut', out:'cut', inDur:0, outDur:0, intensity:.5, speed:1, c1:c[2], c2:c[1], c3:c[3] }), { start:st });
  L.end = +(st + d).toFixed(2); changed({ layers:true });
  pause(); T = clamp(st + d / 2 - .12, 0, S.duration); needs = true;
  toast('No meio da transição a tela fica coberta: é ali que o conteúdo troca. A timeline gruda nesse ponto.', 6000);
  return L;
}
// preço antigo riscado à mão e o novo contando logo depois (agrupados)
function addPrice() {
  const B = S.brand, F = B.fonts, st = nextStart(), gid = 'g' + Math.random().toString(36).slice(2, 7);
  pushUndo();
  const old = mkText('offer', { name:'Preço antigo', text:'R$ 199', font:F[1], weight:600, size:60, opacity:.75, y:freeY(.4, st), in:'rise', mark:'strike', markColor:B.colors[2], grp:gid });
  const now = mkText('big', { name:'Preço novo', text:'R$ 99', font:F[2], weight:800, size:190, lh:1, y:Math.min(.9, old.y + .12), in:'counter', grp:gid });
  old.start = st; old.end = S.duration; now.start = +Math.min(st + .9, S.duration - .5).toFixed(2); now.end = S.duration;
  S.layers.push(old, now); (S.groups ||= {})[gid] = { name:'Preço de/por', open:true };
  RT.picks = new Set([old.id, now.id]); RT.selected = now.id; propTab = 'style';
  renderProps(); changed({ layers:true }); seekLayers([old, now]); RT.userSeek = false;
}
ADD_KINDS.push(
  { id:'price', label:'Preço de/por', gl:'<span style="font-size:10px;font-weight:700"><s style="opacity:.6">9</s> 5</span>', add:addPrice },
  { id:'video', label:'Vídeo', gl:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="18" height="14" rx="2"/><path d="M8 5v6l5-3z" fill="currentColor"/></svg>', add:() => pickFile('video/*', addVideoFile) },
  { id:'camera', label:'Câmera', gl:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="13" height="10" rx="2"/><path d="M14 7l5-3v8l-5-3"/></svg>', add:addCamera },
  { id:'fx', label:'Transição', gl:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 15L9 1M6 15L14 1M11 15L19 1"/></svg>', add:addFx },
);

/* ------------ trilha: painel na coluna da esquerda e faixa na timeline ------------ */
function segSet(obj, k, label, opts, after) {
  const wrap = h('div', { class:'segs tight', role:'group', 'aria-label':label });
  const draw = () => { wrap.innerHTML = ''; opts.forEach(([v, t]) => wrap.append(h('button', { 'aria-pressed':String((obj[k] ?? opts[0][0]) === v), text:t, onclick:() => { pushUndo(); obj[k] = v; draw(); changed(); if (after) after(v); } }))); };
  draw(); return field(label, wrap, null, true);
}
function renderAudio() {
  const box = $('#audioBox'); if (!box || !S) return; box.innerHTML = '';
  const A = S.audio, pick = () => pickFile('audio/*,.mp3,.wav,.m4a,.aac,.ogg', setMusicFile);
  if (!A) box.append(h('div', { class:'row' }, [h('button', { class:'btn small', text:'Enviar música', onclick:pick })]),
    h('p', { class:'hint', text:'MP3, WAV ou M4A. As batidas viram ímã na timeline. Também dá para arrastar o arquivo para o palco.' }));
  else {
    box.append(h('div', { class:'aud' }, [
      h('span', { class:'aud-nm' }, [h('b', { text:A.name, title:A.name }), h('small', { text:`${A.bpm} bpm · ${fmtSec(A.dur)}` })]),
      h('button', { class:'btn small ghost', text:'Trocar', onclick:pick }),
      h('button', { class:'icon-btn', title:'Tirar a música', 'aria-label':'Tirar a música', html:ICONS.trash, onclick:() => { pushUndo(); S.audio = null; changed(); renderAudio(); renderTimeline(); toast('Música removida', 5000, UNDO_ACT); } })]),
      segSet(A, 'from', 'A música começa', [['zero', 'Do início'], ['beat', '1ª batida'], ['peak', 'Parte forte']], () => renderTimeline()),
      rangeF(A, 'vol', 'Volume', 0, 1, .01, v => Math.round(v * 100) + '%'),
      h('div', { class:'row' }, [h('button', { class:'btn small', text:'Encaixar na batida', title:'Cada elemento entra na batida mais próxima (Ctrl+Z desfaz)', onclick:snapToBeats })]));
  }
  box.append(segSet(S, 'sfx', 'Sons nas entradas', Object.entries(SFX)),
    h('p', { class:'hint', text:'Sopro nos deslizes, pop nas molas, cliques na digitação. Toca na prévia (espaço) e sai no MP4.' }));
}
function audioRow() {
  const A = S.audio, cv2 = h('canvas', { class:'tl-wave' }), lane = h('div', { class:'tl-lane' }, [cv2]);
  lane.addEventListener('pointerdown', e => { if (!e.button) tlScrub(e); });
  const nm = h('div', { class:'tl-nm', title:`${A.name} · ${A.bpm} bpm` }, [h('span', { class:'dot', style:'background:var(--muted)' }), h('span', { text:A.name })]);
  requestAnimationFrame(() => drawWave(cv2, lane));
  return h('div', { class:'tl-row tl-audio' }, [nm, lane]);
}
function drawWave(c, lane) {
  const A = S.audio, r = lane.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (!A || !A.peaks || !r.width) return;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const x = c.getContext('2d'), sk = audioSkip(), len = Math.max(.1, A.dur - sk), d = S.duration;
  x.fillStyle = uiA('sel', .35);
  for (let px = 0; px < c.width; px++) {
    const ts = sk + (px / c.width * d) % len, v = A.peaks[Math.floor(ts * 10)] || 0, hh = Math.max(dpr, v * c.height * .85);
    x.fillRect(px, (c.height - hh) / 2, 1, hh);
  }
  x.fillStyle = uiA('sel', .95);
  for (const b of beatTimes()) x.fillRect(Math.round(b / d * c.width), c.height - 5 * dpr, Math.max(1, dpr), 5 * dpr);
}

/* ------------ variações de texto: a mesma animação com outros textos (títulos, preços, chamadas)
   S.vars = { rows:[{ id, name, t:{ [id da camada]:texto } }] }. Em branco = igual ao arquivo ("Atual") ------------ */
const varRows = () => (S.vars && S.vars.rows) || [];
const varCols = () => S.layers.filter(l => l.type === 'text' || l.type === 'cta').sort((a, b) => a.start - b.start || a.y - b.y);
function applyVariant(v) {
  const saved = [];
  if (v && v.t) for (const L of S.layers) { const t = v.t[L.id]; if (t && t !== L.text && (L.type === 'text' || L.type === 'cta')) { saved.push([L, L.text]); L.text = t; } }
  if (saved.length) RT.layout.clear();
  return () => { for (const [L, t] of saved) L.text = t; if (saved.length) RT.layout.clear(); };
}
async function withVariant(v, fn) { const back = applyVariant(v); try { return await fn(); } finally { back(); } }
// cola de planilha: tabulação separa colunas, Enter separa linhas; aspas guardam quebras de linha (Excel, Google Planilhas)
function parseTSV(text) {
  const rows = [[]]; let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === '\t') { rows[rows.length - 1].push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
    else cur += ch;
  }
  rows[rows.length - 1].push(cur);
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
}
function openVars() {
  if (document.querySelector('.vsheet')) return;
  const cols = varCols(); if (!cols.length) { toast('Adicione um texto ou um botão primeiro'); return; }
  pause(); pushUndo();
  S.vars ||= { rows:[] };
  const rows = S.vars.rows;
  let sel = -1;
  const pv = h('canvas', { class:'vprev' }), pvName = h('b', { text:'Atual' });
  pv.width = 300; pv.height = Math.round(300 * H() / W());
  const drawPrev = () => {
    const v = sel >= 0 ? rows[sel] : null, back = applyVariant(v);
    try { renderFrame(pv.getContext('2d'), heroTime(), pv.width / W(), false); } finally { back(); }
    pvName.textContent = v ? v.name : 'Atual'; needs = true;
  };
  const get = (r, c) => c < 0 ? (r < 0 ? 'Atual' : rows[r].name) : r < 0 ? cols[c].text : (rows[r].t[cols[c].id] ?? '');
  const set = (r, c, val) => {
    if (c < 0) { if (r >= 0) rows[r].name = val.trim() || `Versão ${r + 2}`; return; }
    if (r < 0) { cols[c].text = val; RT.layout.clear(); return; }
    if (val.trim()) rows[r].t[cols[c].id] = val; else delete rows[r].t[cols[c].id];
  };
  const grid = h('div', { class:'vgrid', style:`grid-template-columns:130px repeat(${cols.length}, minmax(160px, 1fr)) 28px` });
  const spread = (r0, c0, text) => {
    parseTSV(text).forEach((cells, i) => {
      const r = r0 + i;
      if (r >= rows.length) rows.push({ id:uid(), name:`Versão ${rows.length + 2}`, t:{} });
      cells.forEach((v, j) => { if (c0 + j < cols.length) set(r, c0 + j, v); });
    });
    changed(); draw(); drawPrev();
  };
  const draw = () => {
    grid.innerHTML = '';
    grid.append(h('span', { class:'vh', text:'Versão' }), ...cols.map(L => h('span', { class:'vh', text:L.name, title:L.name })), h('span'));
    for (let r = -1; r < rows.length; r++) {
      const focus = () => { if (sel === r) return; sel = r; drawPrev(); grid.querySelectorAll('.vsel').forEach(n => n.classList.remove('vsel')); grid.querySelectorAll(`[data-r="${r}"]`).forEach(n => n.classList.add('vsel')); };
      for (let c = -1; c < cols.length; c++) {
        const el = c < 0 ? h('input', { type:'text', 'aria-label':'Nome da versão', readonly:r < 0 ? true : null }) : h('textarea', { rows:2, 'aria-label':cols[c].name, placeholder:r >= 0 ? cols[c].text : '' });
        el.value = get(r, c); el.dataset.r = r; if (r === sel) el.classList.add('vsel');
        el.addEventListener('focus', focus);
        el.addEventListener('input', () => { set(r, c, el.value); changed(); if (c >= 0) drawPrev(); });
        el.addEventListener('paste', e => { const t = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(t.replace(/\r?\n$/, ''))) return; e.preventDefault(); spread(r, Math.max(0, c), t); });
        grid.append(el);
      }
      grid.append(r < 0 ? h('span') : h('button', { class:'icon-btn', title:'Apagar esta versão', 'aria-label':`Apagar ${rows[r].name}`, html:ICONS.trash, onclick:() => { rows.splice(r, 1); sel = Math.min(sel, rows.length - 1); changed(); draw(); drawPrev(); } }));
    }
  };
  const close = () => { ov.remove(); RT.layout.clear(); renderProps(); needs = true; };
  const card = h('div', { class:'files-card vcard', role:'dialog', 'aria-modal':'true', 'aria-label':'Variações de texto' }, [
    h('div', { class:'files-head' }, [h('h2', { text:'Variações de texto' }), h('div', { class:'spacer' }),
      h('button', { class:'btn small', text:'+ Nova versão', onclick:() => { rows.push({ id:uid(), name:`Versão ${rows.length + 2}`, t:{} }); changed(); draw(); grid.querySelector(`textarea[data-r="${rows.length - 1}"]`)?.focus(); } }),
      h('button', { class:'btn small primary', text:'Pronto', onclick:close })]),
    h('p', { class:'hint', text:'A mesma animação com outros textos. Em branco fica igual à linha "Atual". Cole direto de uma planilha: cada linha vira uma versão e cada coluna um texto, na ordem de cima. Na exportação, escolha "Todas".' }),
    h('div', { class:'vbody' }, [h('div', { class:'vscroll' }, [grid]), h('div', { class:'vside' }, [pv, pvName])]),
  ]);
  const ov = h('div', { class:'files vsheet', onpointerdown:e => { if (e.target === ov) close(); }, onkeydown:e => { e.stopPropagation(); if (e.key === 'Escape') close(); } }, [card]);
  document.body.append(ov); draw(); drawPrev();
}

/* ------------ meus elementos: camadas salvas para reusar em qualquer arquivo (no navegador, chave 'elements') ------------ */
let MY_ELS = [];
async function loadElements() { MY_ELS = (await DB.get('elements')) || []; renderAdds(); }
// miniatura: cada camada no seu quadro de repouso, recortada em volta
function elementThumb(ls) {
  try {
    const k = 200 / W(), c = document.createElement('canvas'); c.width = Math.round(200 * slides()); c.height = Math.round(H() * k);
    const x = c.getContext('2d'), R = { rs:k, export:true };
    for (const L of S.layers) if (ls.includes(L) && !NOBOX(L)) { x.setTransform(k, 0, 0, k, 0, 0); x.globalAlpha = 1; x.filter = 'none'; try { if (L.type === 'text') drawText(x, L, restTime(L), R); else drawBlock(x, L, restTime(L), R); } catch (e) {} }
    const bs = ls.map(l => l._bounds).filter(Boolean); if (!bs.length) return null;
    const p = 20, x0 = Math.max(0, Math.min(...bs.map(b => b.x)) - p) * k, y0 = Math.max(0, Math.min(...bs.map(b => b.y)) - p) * k;
    const x1 = Math.min(FW(), Math.max(...bs.map(b => b.x + b.w)) + p) * k, y1 = Math.min(H(), Math.max(...bs.map(b => b.y + b.h)) + p) * k;
    const sw = Math.max(1, x1 - x0), sh = Math.max(1, y1 - y0), f = 56 / Math.max(sw, sh), o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(sw * f)); o.height = Math.max(1, Math.round(sh * f));
    o.getContext('2d').drawImage(c, x0, y0, sw, sh, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  } catch (e) { return null; } finally { needs = true; }
}
async function saveElement() {
  const p = clipPayload(); if (!p) return;
  const L = selL(), ls = pickedLayers();
  const name = ls.length > 1 ? (L && L.grp && ls.every(o => o.grp === L.grp) ? groupName(L.grp) : `${ls.length} elementos`) : ls[0].name;
  MY_ELS = [{ id:uid(), name, thumb:elementThumb(ls), p }, ...MY_ELS].slice(0, 48);
  await DB.set('elements', MY_ELS); renderAdds();
  toast(`"${name}" salvo em Meus elementos, na coluna da esquerda`);
}
function addElement(el) {
  const p = JSON.parse(JSON.stringify(el.p)), st = nextStart(), s0 = Math.min(...p.layers.map(l => +l.start || 0));
  for (const l of p.layers) {
    const toEnd = l.end == null || (p.dur && l.end >= p.dur - .01);
    l.start = (+l.start || 0) - s0 + st; l.end = toEnd ? null : l.end - s0 + st;
  }
  p.dur = null; p.here = true; // no carrossel, entra no slide atual
  pasteLayers(p);
  const L = selL(); if (L) seekLayer(L); RT.userSeek = false;
  toast(`"${el.name}" adicionado`);
}
async function removeElement(el) {
  const i = MY_ELS.indexOf(el); if (i < 0) return;
  MY_ELS.splice(i, 1); await DB.set('elements', MY_ELS); renderAdds();
  toast(`"${el.name}" saiu de Meus elementos`, 5000, { label:'Desfazer', fn:async () => { MY_ELS.splice(Math.min(i, MY_ELS.length), 0, el); await DB.set('elements', MY_ELS); renderAdds(); } });
}
$('#varBtn').onclick = openVars;

/* ============================================================
   Início
   ============================================================ */
(async function boot() {
  const list = await migrateFiles();
  let id = await DB.get('currentId'); if (!list.some(f => f.id === id)) id = list[0]?.id;
  let saved = null;
  if (id) try { saved = JSON.parse(await DB.get('file:' + id)); } catch (e) {}
  const fresh = !(saved && saved.layers && saved.brand);
  if (!fresh) { S = saved; FILES.id = id; FILES.name = list.find(f => f.id === id).name; }
  else { newProject(); FILES.id = newFileId(); FILES.name = 'Sem título'; }
  const interned = !fresh && await internImages(S);
  const torn = !fresh && fixTornGroups(S);
  DB.set('currentId', FILES.id); showFileName(); setSaveState('Salvo');
  RT.selected = S.layers.find(l => l.type === 'logo')?.id || S.layers[1]?.id || S.layers[0]?.id;
  renderAll(); updPlay(); fitStage();
  requestAnimationFrame(tick);
  loadElements();
  await refreshLogo();
  S.layers.forEach(l => l.src && getImage(l.src));
  ensureFonts();
  pause(); T = heroTime(); needs = true;
  if (fresh || interned || torn) autosave();
  setTimeout(gcMedia, 20000);
})();
