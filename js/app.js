"use strict";
/* ============================================================
   Utilidades
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
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
function hexA(hex, a) {
  let c = (hex || '#000').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms);
}
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
  slideWord: {label:'Desliza por palavra', unit:'word', s:.45, ease:'expoOut', dur:1.1, fn:({e,p,I,size,dir})=>({dx:(1-e)*size*(.6+1.2*I)*dir, a:clamp(p*2.5)})},
  slideAlt:  {label:'Linhas alternadas', unit:'line', s:.2, ease:'expoOut', dur:1.1, fn:({e,p,i,W,dir,I})=>({dx:(1-e)*W*(.3+.5*I)*(i%2?1:-1)*dir, blur:(1-e)*12, a:clamp(p*2)})},
  counter:   {label:'Contador', unit:'all', s:0, ease:'expoOut', dur:1.3, counter:true, fn:({e,p})=>({count:e, a:clamp(p*4)})},
  fade:      {label:'Fade', unit:'all', s:0, ease:'cubicOut', dur:.8, fn:({e})=>({a:e, dy:(1-e)*8})},
  cut:       {label:'Sem animação', unit:'all', s:0, ease:'linear', dur:0, fn:()=>({})},
};
const TEXT_IN  = ['cut','rise','springWord','lineMask','blurChar','wave','stamp','highlight','type','track','drop','elastic','flip','scramble','glitch','zoom','slideWord','slideAlt','counter','fade'];
const TEXT_OUT = ['cut','fade','rise','lineMask','blurChar','zoom','track','slideWord','slideAlt','glitch','scramble','drop','highlight'];

const BP = { // blocos: logo, botão, imagem
  draw:    {label:'Desenhar traço', svg:true, shape:true, special:true, dur:2.4},
  assemble:{label:'Montar peças', svg:true, special:true, dur:1.8},
  handwrite:{label:'Escrever letra a letra', pen:true, special:true, dur:3.2},
  line:    {label:'Linha e revela', special:true, dur:1.5},
  spring:  {label:'Mola', ease:'spring', dur:1.0, fn:({e,p,I})=>({sc:Math.max(0,e), rot:(1-e)*-.25*I, a:clamp(p*4)})},
  pop:     {label:'Pulo', ease:'spring', dur:1.0, fn:({e,p,h,dir})=>({dy:(1-e)*h*.6*dir, sc:.6+.4*e, a:clamp(p*4)})},
  drop:    {label:'Cai e quica', ease:'spring', dur:1.2, fn:({e,p,h,dir})=>({dy:-(1-e)*h*2.2*dir, a:clamp(p*5)})},
  spin:    {label:'Giro', ease:'expoOut', dur:1.1, fn:({e,p,I})=>({rot:(1-e)*Math.PI*(1+I), sc:Math.max(0,e), a:clamp(p*3)})},
  flip:    {label:'Vira', ease:'backOut', dur:1.0, fn:({e,p})=>({sx:Math.cos((1-e)*Math.PI/2), a:clamp(p*3)})},
  slide:   {label:'Desliza', ease:'expoOut', dur:1.0, fn:({e,p,I,W,dir})=>({dx:-(1-e)*W*(.3+.4*I)*dir, blur:(1-e)*14*I, a:clamp(p*2)})},
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

const IDLE = { none:'Sem animação', float:'Flutuar', breathe:'Respirar', sway:'Balançar', shine:'Brilho', pulse:'Pulsar', spin:'Girar' };
const IDLE_BY = { text:['none','float','breathe','sway','pulse'], logo:['none','shine','breathe','float','sway','pulse'], cta:['none','pulse','shine','breathe','sway','float'], image:['none','float','breathe','sway','shine','pulse'],
                 shape:['none','float','breathe','sway','spin','pulse','shine'] };
const SHAPE_KINDS = { rect:'Retângulo', ellipse:'Círculo', triangle:'Triângulo', polygon:'Polígono', star:'Estrela', line:'Linha', custom:'Vetor SVG' };
const BG_MODES = { mesh:'Gradiente vivo', linear:'Linear girando', spot:'Holofote', solid:'Sólido', image:'Imagem' };

const FORMATS = { '1x1':{w:1080,h:1080,label:'1:1'}, '4x5':{w:1080,h:1350,label:'4:5'}, '3x4':{w:1080,h:1440,label:'3:4'}, '9x16':{w:1080,h:1920,label:'9:16'} };
const FPS_OPTS = [24, 25, 30, 50, 60];
const fps = () => (S && FPS_OPTS.includes(S.fps) ? S.fps : 30);
const TYPE_LABEL = { bg:'Fundo', text:'Texto', logo:'Logo', cta:'Botão', image:'Imagem', shape:'Forma' };
const TYPE_COLOR = { bg:'var(--c-bg)', text:'var(--c-text)', logo:'var(--c-logo)', cta:'var(--c-cta)', image:'var(--c-image)', shape:'var(--c-shape)' };
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
const RT = { logo:null, images:new Map(), layout:new Map(), fontsOk:new Set(), fontsBad:new Set(), selected:null, dirtyUndo:false, exporting:false, drag:null, guide:null };
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
function marginBox() {
  const m = marginSides(); if (!m.on) return null;
  const x0 = Math.min(m.left, W() - 1), y0 = Math.min(m.top, H() - 1);
  return { x0, y0, x1:Math.max(x0 + 1, W() - m.right), y1:Math.max(y0 + 1, H() - m.bottom) };
}
function fitInMargin(ax, ay, w, h) {
  const M = marginBox(); if (!M) return { ax, ay, k:1 };
  const aw = Math.max(1, M.x1 - M.x0), ah = Math.max(1, M.y1 - M.y0), k = Math.min(1, aw / Math.max(w, 1), ah / Math.max(h, 1));
  const hw = w * k / 2, hh = h * k / 2;
  return { ax:clamp(ax, M.x0 + hw, M.x1 - hw), ay:clamp(ay, M.y0 + hh, M.y1 - hh), k };
}
function W() { return FORMATS[S.format].w; }
function H() { return FORMATS[S.format].h; }

/* ------------ fábrica de camadas ------------ */
function base(type, role, defs, o = {}) {
  return Object.assign({ id:uid(), type, role, name:ROLE_NAME[role] || TYPE_LABEL[type], visible:true, start:0, end:null,
    in:'fade', out:'cut', inDur:1, outDur:.6, speed:1, intensity:.6, idle:'none', x:.5, y:.5, opacity:1 }, defs, o);
}
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
    stroke:false, strokeColor:c[1], strokeW:8 }, o);
  if (o.in && BP[o.in] && o.inDur == null) L.inDur = BP[o.in].dur;
  return L;
}
function mkBg(o = {}) {
  const c = S.brand.colors;
  return base('bg', 'bg', { mode:'mesh', c1:c[0], c2:c[3], c3:c[2], c4:c[4], motion:1, angle:135, src:null, darken:.25, grain:.08, in:'cut', out:'cut' }, o);
}

/* ------------ roteiros ------------ */
const TEMPLATES = [
  { id:'blank', ic:'+', name:'Do zero', desc:'Só o fundo. Você adiciona texto, imagem, logo e botão', dur:8, build:()=>[mkBg({mode:'mesh'})] },
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
  try { const img = await loadImg(src); RT.images.set(src, img); needs = true; return img; } catch (e) { return null; }
}
function imgNow(src) { if (!src) return null; const i = RT.images.get(src); if (i === undefined) getImage(src); return i || null; }

/* ============================================================
   Tempo das camadas
   ============================================================ */
function phase(L, t) {
  const end = L.end ?? S.duration;
  if (t < L.start || t > end + 1e-6) return null;
  const sp = L.speed || 1; let inD = L.in === 'cut' ? 0 : L.inDur / sp, outD = L.out === 'cut' ? 0 : L.outDur / sp;
  const span = end - L.start;
  if (inD + outD > span && span > 0) { const k = span / (inD + outD); inD *= k; outD *= k; }
  if (inD > 0 && t < L.start + inD) return { mode:'in', p:(t - L.start) / inD, inD, outD };
  if (outD > 0 && t > end - outD) return { mode:'out', p:(t - (end - outD)) / outD, inD, outD };
  return { mode:'hold', p:1, inD, outD };
}

/* ------------ grupos: tempo e animação do grupo inteiro ------------ */
// S.groups[gid] = { name?, open }. O grupo só organiza a timeline (do primeiro que entra ao último que sai); as animações são de cada item.
function gmeta(gid, mk) {
  const g = S.groups && S.groups[gid]; if (g || !mk) return g;
  return ((S.groups ||= {})[gid] = { open:true });
}
function gwin(gid) {
  const m = S.layers.filter(l => l.grp === gid); if (!m.length) return null;
  return { start:Math.min(...m.map(l => l.start)), end:Math.max(...m.map(l => l.end ?? S.duration)) };
}
function gpseudo(gid) {
  const w = gwin(gid); if (!w) return null;
  return { start:w.start, end:w.end, in:'cut', out:'cut', inDur:0, outDur:0, speed:1 };
}
function groupNum(gid) { const ids = []; S.layers.forEach(l => { if (l.grp && !ids.includes(l.grp)) ids.push(l.grp); }); return ids.indexOf(gid) + 1; }
const groupName = gid => (gmeta(gid) || {}).name || `Grupo ${groupNum(gid)}`;

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
  const key = [txt, font, ls, maxW, L.lh, L.align, sty ? sty.join(';') : ''].join('|');
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
  const I = L.intensity ?? .6, tl = t - L.start;
  let txt = L.upper ? L.text.toUpperCase() : L.text;
  const seed = Math.floor(t * 24);

  // contador precisa do valor antes do layout
  if (P && P.counter) {
    const e = ph.mode === 'in' ? easeIn(P.ease, ph.p, I) : easeOutPhase(P.ease, ph.p, I);
    txt = counterText(txt, e);
  }
  const lay = layoutText(L, txt);
  const size = lay.size;
  const fit = fitInMargin(L.x * W(), L.y * H(), lay.blockW, lay.blockH), ax = fit.ax, ay = fit.ay;
  let idy = 0, isc = 1;
  if (L.idle === 'float') idy = Math.sin(tl * TAU / 3.4) * 7 * (.4 + I);
  if (L.idle === 'breathe') isc = 1 + Math.sin(tl * TAU / 3) * .015 * (.4 + I);
  if (L.idle === 'pulse' && ph.mode === 'hold') isc = 1 + .03 * I * Math.pow(Math.max(0, Math.sin(tl * TAU / 1.6)), 6);
  const irot = L.idle === 'sway' ? Math.sin(tl * TAU / 3.2) * .03 * (.4 + I) : 0;
  L._bounds = { x:ax - lay.blockW * fit.k / 2, y:ay - lay.blockH * fit.k / 2, w:lay.blockW * fit.k, h:lay.blockH * fit.k };

  ctx.save();
  ctx.translate(ax, ay + idy); if (irot) ctx.rotate(irot); if (isc * fit.k !== 1) ctx.scale(isc * fit.k, isc * fit.k);
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
  const stCache = new Map();
  const dir = ph.mode === 'out' ? -1 : 1;
  const stateFor = (idx) => {
    if (stCache.has(idx)) return stCache.get(idx);
    let st;
    if (!P) st = {};
    else {
      const q = unitP(ph.p, idx, nOf, P.s);
      const e = ph.mode === 'in' ? easeIn(P.ease, q, I) : easeOutPhase(P.ease, q, I);
      const p = ph.mode === 'in' ? q : 1 - q;
      st = P.fn({ e, p, I, size, lineH:lay.lineH, maskH:lay.mask.h, dir, i:idx, n:nOf, seed, W:W(), bw:lay.blockW, bh:lay.blockH });
    }
    stCache.set(idx, st); return st;
  };
  // cursor da máquina de escrever
  let lastVisible = -1;

  for (const line of lay.lines) {
    const nInLine = line.glyphs.length;
    // barra de marca-texto: anima quando o preset atual é "highlight"; fica cheia enquanto a camada entrou com ele
    if ((L.in === 'highlight' || key === 'highlight') && line.text.trim()) {
      let b;
      if (key === 'highlight') b = stateFor(line.li).bar ?? 0;
      else b = L.in === 'highlight' ? 1 : 0;
      if (b > 0) {
        const padX = size * .18;
        const x = line.x0 - padX, wBar = (line.width + padX * 2) * b;
        ctx.save(); ctx.fillStyle = L.hl || '#D98E4A';
        ctx.fillRect(x, line.baseline - size * .86, wBar, size * 1.12);
        ctx.restore();
      }
    }
    for (const g of line.glyphs) {
      if (g.space) continue;
      const idx = unit === 'char' ? g.ci : unit === 'word' ? g.word : unit === 'line' ? line.li : 0;
      const st = stateFor(idx);
      const a = st.a == null ? 1 : st.a;
      if (a <= .001) continue;
      if (P && P.cursor && a > 0) lastVisible = Math.max(lastVisible, g.ci);
      // pivô da unidade
      let px, py;
      if (unit === 'char') { px = line.x0 + g.x + g.w / 2; }
      else if (unit === 'word') { const wg = line.glyphs.filter(x => x.word === g.word); px = line.x0 + (wg[0].x + wg[wg.length - 1].x + wg[wg.length - 1].w) / 2; }
      else if (unit === 'line') px = line.x0 + line.width / 2;
      else px = 0;
      py = (unit === 'all') ? 0 : (P && P.pivot === 'base' ? line.baseline : line.baseline - size * .34);
      const track = st.track ? (g.k - (nInLine - 1) / 2) * st.track : 0;
      ctx.save();
      if (st.clip === 'circle') { ctx.beginPath(); ctx.arc(0, 0, Math.max(0, st.ce) * Math.hypot(lay.blockW, lay.blockH) / 2 * 1.08, 0, TAU); ctx.clip(); }
      else if (st.clip === 'wipe') {
        const L0 = -lay.blockW / 2 - 20, full = lay.blockW + 40, v = clamp(st.ce);
        ctx.beginPath(); if (st.cdir > 0) ctx.rect(L0, -lay.blockH, full * v, lay.blockH * 2); else ctx.rect(L0 + full * (1 - v), -lay.blockH, full * v, lay.blockH * 2); ctx.clip();
      }
      else if (st.clip) { ctx.beginPath(); ctx.rect(line.x0 - size * 2, line.baseline - lay.mask.top, line.width + size * 4, lay.mask.h); ctx.clip(); }
      ctx.globalAlpha *= a;
      ctx.translate(px + (st.dx || 0), py + (st.dy || 0));
      if (st.rot) ctx.rotate(st.rot);
      const sc = st.sc == null ? 1 : st.sc;
      const sx = sc * (st.sx == null ? 1 : st.sx), sy = sc * (st.sy == null ? 1 : st.sy);
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
      ctx.translate(-px, -py);
      if (st.blur > .15) ctx.filter = `blur(${(st.blur * R.rs).toFixed(2)}px)`;
      if (lay.mixed) ctx.font = g.f;
      let ch = g.ch, gx = line.x0 + g.x + track;
      if (st.scr) { ch = SCR[Math.floor(rand(seed, g.ci + 3) * SCR.length)]; gx = line.x0 + g.x + g.w / 2 - ctx.measureText(ch).width / 2; }
      if (st.split) {
        ctx.save(); ctx.globalAlpha *= .7;
        ctx.fillStyle = '#FF3D6E'; ctx.fillText(ch, gx - st.split, line.baseline);
        ctx.fillStyle = '#3DD6FF'; ctx.fillText(ch, gx + st.split, line.baseline);
        ctx.restore();
      }
      ctx.fillStyle = g.c || L.color;
      ctx.fillText(ch, gx, line.baseline);
      ctx.restore();
    }
  }
  // cursor
  if (P && P.cursor && ph.mode === 'in') {
    let gx = 0, by = 0, found = false;
    for (const line of lay.lines) for (const g of line.glyphs) if (g.ci === lastVisible) { gx = line.x0 + g.x + g.w + size * .06; by = line.baseline; found = true; }
    if (!found && lay.lines[0]) { gx = lay.lines[0].x0; by = lay.lines[0].baseline; }
    if (Math.floor(t * 3) % 2 === 0 || ph.p < .95) { ctx.fillStyle = L.color; ctx.fillRect(gx, by - size * .78, Math.max(3, size * .06), size * .9); }
  }
  ctx.restore();
}

/* ============================================================
   Blocos: logo, botão, imagem
   ============================================================ */
let OFF = null;
function getOff(w, h) {
  if (!OFF) OFF = document.createElement('canvas');
  if (OFF.width < w || OFF.height < h) { OFF.width = Math.max(OFF.width, w); OFF.height = Math.max(OFF.height, h); }
  return OFF;
}
function blockGeom(L) {
  if (L.type === 'logo') {
    const lg = logoOf(L); if (!lg) return null;
    const w = L.size * W(); const s = w / lg.bw; return { w, h:lg.bh * s, s };
  }
  if (L.type === 'image') {
    const img = imgNow(L.src); const w = L.size * W();
    const h = L.mask && L.mask !== 'fit' && L.mh != null ? L.mh * W() : img ? w * img.naturalHeight / img.naturalWidth : w * .75;
    return { w, h, img };
  }
  if (L.type === 'shape') {
    const w = L.size * W();
    if (L.kind === 'custom') { const b = customBox(L.d); return { w, h:w * b.h / b.w, cust:b }; }
    if (L.kind === 'line') return { w, h:Math.max(4, L.strokeW || 8) };
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
  const r = Math.max(0, Math.min(L.radius || 0, w / 2, h / 2)), p = new Path2D();
  p.moveTo(-w / 2 + r, -h / 2); p.arcTo(w / 2, -h / 2, w / 2, h / 2, r); p.arcTo(w / 2, h / 2, -w / 2, h / 2, r); p.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r); p.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r); p.closePath();
  return { path:p, len:2 * (w + h) - (8 - 2 * Math.PI) * r, closed:true };
}
function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function paintPart(ctx, pt, overrideAlpha) {
  ctx.globalAlpha *= pt.op;
  if (pt.fill) { ctx.fillStyle = pt.fill; ctx.fill(pt.path, pt.rule); }
  if (pt.stroke) { ctx.lineWidth = pt.sw; ctx.strokeStyle = pt.stroke; ctx.lineCap = pt.cap; ctx.lineJoin = pt.join; ctx.stroke(pt.path); }
}
let TINTC = null;
function drawBlockContent(ctx, L, G, info, R) {
  if (L.type === 'logo' && L.tint) {
    // pinta o logo inteiro (imagem, traço, peças) numa cor só: desenha à parte e troca a cor de tudo que tem tinta
    const pad = Math.ceil(info.key === 'assemble' ? G.w * .7 : (L.drawWidth || 5) + 30);
    const w = Math.ceil(G.w + pad * 2), h = Math.ceil(G.h + pad * 2);
    if (!TINTC) TINTC = document.createElement('canvas');
    TINTC.width = w; TINTC.height = h;
    const c = TINTC.getContext('2d');
    c.translate(w / 2, h / 2);
    drawBlockContent(c, { ...L, tint:false, drawOrig:false }, G, info, R);
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
      else rrect(ctx, -G.w / 2, -G.h / 2, G.w, G.h, L.radius || 0);
      ctx.clip();
      const iw = G.img.naturalWidth, ih = G.img.naturalHeight, k = Math.max(G.w / iw, G.h / ih) * (L.zoom ?? 1);
      const dw = iw * k, dh = ih * k;
      ctx.drawImage(G.img, -dw / 2 + (L.ix || 0) * G.w, -dh / 2 + (L.iy || 0) * G.h, dw, dh); ctx.restore();
    } else if (!R.export) {
      ctx.save(); rrect(ctx, -G.w / 2, -G.h / 2, G.w, G.h, L.radius || 0);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); ctx.setLineDash([14, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 34px "Instrument Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Envie uma imagem', 0, 0); ctx.restore();
    }
    return;
  }
  if (L.type === 'shape') {
    const V = shapeVec(L, G), pp = info.pp, drawing = info.key === 'draw';
    const line = L.kind === 'line', stroked = line || L.stroke;
    const dp = drawing ? Ease.cubicInOut(clamp(pp / .72)) : 1;
    const fillA = line ? 0 : drawing ? Ease.cubicInOut(clamp((pp - .5) / .5)) : 1;
    if (fillA > 0) {
      ctx.save(); ctx.clip(V.path); ctx.globalAlpha *= fillA; ctx.translate(-G.w / 2, -G.h / 2);
      paintFill(ctx, L, info.t, G.w, G.h); ctx.restore();
    }
    const tmp = drawing && !stroked; // traço de apoio: some no fim
    const sa = tmp ? 1 - Ease.cubicInOut(clamp((pp - .82) / .18)) : 1;
    if ((stroked || tmp) && sa > 0 && dp > .002) {
      ctx.save(); ctx.globalAlpha *= sa; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = stroked ? L.strokeW : 5; ctx.strokeStyle = stroked ? L.strokeColor : (L.mode === 'solid' ? L.c1 : L.c2);
      if (dp < 1) ctx.setLineDash([V.len * dp, V.len * 2 + 10]);
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
    ctx.font = fontStr(L, L.size); ctx.fillStyle = L.color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(L.text, 0, L.size * .35);
  }
}
const freeType = L => (L.type === 'image' && !L.keepIn) || L.type === 'shape'; // sem margem: podem sangrar (imagem com "Manter dentro da margem" obedece)
function drawBlock(ctx, L, t, R) {
  const G = blockGeom(L); if (!G) return;
  const ph = phase(L, t); if (!ph) return;
  const I = L.intensity ?? .6, tl = t - L.start;
  const fit = freeType(L) ? { ax:L.x * W(), ay:L.y * H(), k:1 } : fitInMargin(L.x * W(), L.y * H(), G.w, G.h), ax = fit.ax, ay = fit.ay;
  L._bounds = { x:ax - G.w * fit.k / 2, y:ay - G.h * fit.k / 2, w:G.w * fit.k, h:G.h * fit.k };
  let key = ph.mode === 'in' ? L.in : ph.mode === 'out' ? L.out : null;
  if (key) key = effKey(L, key);
  const P = key ? BP[key] : null;
  const dir = ph.mode === 'out' ? -1 : 1;
  const pp = ph.mode === 'in' ? ph.p : ph.mode === 'out' ? 1 - ph.p : 1;
  let st = {};
  if (P && P.fn) {
    const e = ph.mode === 'in' ? easeIn(P.ease, ph.p, I) : easeOutPhase(P.ease, ph.p, I);
    st = P.fn({ e, p:pp, I, w:G.w, h:G.h, dir, W:W(), seed:Math.floor(t * 24) });
  }
  // movimento contínuo
  let idy = 0, isc = 1, irot = 0;
  if (L.idle === 'float') idy = Math.sin(tl * TAU / 3.4) * 9 * (.4 + I);
  if (L.idle === 'breathe') isc = 1 + Math.sin(tl * TAU / 3) * .025 * (.4 + I);
  if (L.idle === 'sway') irot = Math.sin(tl * TAU / 3.2) * .05 * (.4 + I);
  if (L.idle === 'spin') irot = tl * (.25 + .9 * I);
  if (L.idle === 'pulse' && ph.mode === 'hold') isc = 1 + .045 * I * Math.pow(Math.max(0, Math.sin(tl * TAU / 1.6)), 6);

  ctx.save();
  ctx.translate(ax + (st.dx || 0), ay + (st.dy || 0) + idy);
  if (fit.k !== 1) ctx.scale(fit.k, fit.k);
  const rot = (st.rot || 0) + irot + (L.rot || 0) * Math.PI / 180; if (rot) ctx.rotate(rot);
  const sc = (st.sc == null ? 1 : st.sc) * isc, sx = sc * (st.sx == null ? 1 : st.sx), sy = sc * (st.sy == null ? 1 : st.sy);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.globalAlpha *= (st.a == null ? 1 : st.a) * (L.opacity ?? 1);
  if (st.blur > .15) ctx.filter = `blur(${(st.blur * R.rs).toFixed(2)}px)`;

  // recortes
  const padX = G.w * .35, padY = G.h * .06;
  if (st.clip === 'bounds') { ctx.beginPath(); ctx.rect(-G.w / 2 - padX, -G.h / 2 - padY, G.w + padX * 2, G.h + padY * 2); ctx.clip(); }
  if (st.clip === 'circle') { ctx.beginPath(); ctx.arc(0, 0, Math.max(0, st.ce) * Math.hypot(G.w, G.h) / 2 * 1.08, 0, TAU); ctx.clip(); }
  if (st.clip === 'wipe') {
    const L0 = -G.w / 2 - 20, full = G.w + 40, v = clamp(st.ce);
    ctx.beginPath(); if (st.cdir > 0) ctx.rect(L0, -G.h, full * v, G.h * 2); else ctx.rect(L0 + full * (1 - v), -G.h, full * v, G.h * 2); ctx.clip();
  }
  if (key === 'line') {
    const lp = Ease.cubicInOut(clamp(pp / .45)), rise = Ease.quintOut(clamp((pp - .3) / .7)), la = 1 - clamp((pp - .78) / .22);
    const ly = G.h / 2 + G.h * .08 + 6;
    if (lp > 0 && la > 0) { ctx.save(); ctx.globalAlpha *= la; ctx.fillStyle = L.lineColor || S.brand.colors[2]; const lw = G.w * 1.1 * lp; ctx.fillRect(-lw / 2, ly - 2.5, lw, 5); ctx.restore(); }
    ctx.beginPath(); ctx.rect(-G.w * 2, -G.h * 4, G.w * 4, G.h * 4 + ly - 3); ctx.clip();
    ctx.translate(0, (1 - rise) * (G.h * 1.1 + 10));
  }
  if (st.cdy) ctx.translate(0, st.cdy);

  const info = { key, pp, I, mode:ph.mode, tl, t };
  const shineOn = L.idle === 'shine' && ph.mode === 'hold';
  const cyc = 3.2, sk = ((tl - ph.inD) % cyc) / 1.15;
  if (shineOn && sk >= 0 && sk < 1) {
    const m = ctx.getTransform(); const k = Math.max(.1, Math.hypot(m.a, m.b)); const pad = 6;
    const cw = Math.ceil(G.w * k) + pad * 2, chh = Math.ceil(G.h * k) + pad * 2;
    const oc = getOff(cw, chh), o = oc.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, oc.width, oc.height);
    o.setTransform(k, 0, 0, k, cw / 2, chh / 2);
    drawBlockContent(o, L, G, info, R);
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop';
    const bx = -cw * .5 + Ease.cubicInOut(sk) * cw * 2;
    const gr = o.createLinearGradient(bx - cw * .22, 0, bx + cw * .22, chh * .35);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = gr; o.fillRect(0, 0, cw, chh); o.globalCompositeOperation = 'source-over';
    ctx.drawImage(oc, 0, 0, cw, chh, -cw / 2 / k, -chh / 2 / k, cw / k, chh / k);
  } else {
    drawBlockContent(ctx, L, G, info, R);
  }
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
function drawBg(ctx, L, t, R) { paintFill(ctx, L, t, W(), H()); }
// preenchimento animado (usado pelo fundo e pelas formas): pinta o retângulo 0,0 → w,hh
function paintFill(ctx, L, t, w, hh) {
  const m = L.motion ?? 1;
  ctx.save();
  ctx.fillStyle = L.c1; ctx.fillRect(0, 0, w, hh);
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
    g.addColorStop(0, L.c1); g.addColorStop(.55, L.c2); g.addColorStop(1, L.c3);
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
    ctx.globalAlpha = L.grain; ctx.globalCompositeOperation = 'overlay';
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(rs, 0, 0, rs, 0, 0);
  const one = (c, L) => {
    try {
      if (L.type === 'bg') drawBg(c, L, t, R);
      else if (L.type === 'text') drawText(c, L, t, R);
      else drawBlock(c, L, t, R);
    } catch (e) { console.error(e); }
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  };
  for (const L of S.layers) if (L.visible) one(ctx, L);
}

/* ============================================================
   Prévia
   ============================================================ */
const cv = $('#cv'), pctx = cv.getContext('2d');
let RS = .5;
function fitStage() {
  if (!S) return;
  const box = $('#stageBox'); const pad = 40;
  const bw = Math.max(100, box.clientWidth - pad), bh = Math.max(100, box.clientHeight - pad);
  const k = Math.min(bw / W(), bh / H());
  const cw = Math.floor(W() * k), ch = Math.floor(H() * k);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  RS = Math.min(1, (cw * dpr) / W());
  cv.width = Math.round(W() * RS); cv.height = Math.round(H() * RS);
  needs = true;
}
new ResizeObserver(fitStage).observe($('#stageBox'));

function drawOverlays() {
  const ctx = pctx; ctx.save(); ctx.setTransform(RS, 0, 0, RS, 0, 0);
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
    ctx.setLineDash([12, 10]); ctx.lineWidth = 1.5 / RS; ctx.strokeStyle = 'rgba(111,211,166,.7)';
    ctx.strokeRect(M.x0, M.y0, M.x1 - M.x0, M.y1 - M.y0); ctx.setLineDash([]);
  }
  const ub = selUnion();
  if (!playing) for (const o of S.layers) {
    if ((o.id === RT.selected && !ub) || o.type === 'bg' || !o._bounds || !o.visible || !RT.picks || !RT.picks.has(o.id) || !phase(o, T)) continue;
    const b = o._bounds, p = 14;
    ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / RS; ctx.strokeStyle = 'rgba(242,182,50,.55)';
    ctx.strokeRect(b.x - p, b.y - p, b.w + p * 2, b.h + p * 2); ctx.setLineDash([]);
  }
  const L = S.layers.find(l => l.id === RT.selected);
  const hdl = q => { const s = hRad() * .75; ctx.fillStyle = '#F2B632'; ctx.strokeStyle = '#101115'; ctx.lineWidth = hRad() / 11 * 1.5; ctx.fillRect(q.x - s, q.y - s, s * 2, s * 2); ctx.strokeRect(q.x - s, q.y - s, s * 2, s * 2); };
  if (!playing && ub) {
    const p = 14; ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / RS; ctx.strokeStyle = 'rgba(242,182,50,.9)';
    ctx.strokeRect(ub.x - p, ub.y - p, ub.w + p * 2, ub.h + p * 2); ctx.setLineDash([]);
    handlesOf(L).forEach(hdl);
  } else if (!playing && L && L.type !== 'bg' && L._bounds && L.visible) {
    const ph = phase(L, T);
    if (ph) {
      const b = L._bounds, p = 14;
      ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / RS; ctx.strokeStyle = 'rgba(242,182,50,.9)';
      ctx.strokeRect(b.x - p, b.y - p, b.w + p * 2, b.h + p * 2);
      ctx.setLineDash([]); const s = hRad() * .75;
      handlesOf(L).forEach(q => { ctx.fillStyle = '#F2B632'; ctx.strokeStyle = '#101115'; ctx.lineWidth = hRad() / 11 * 1.5; ctx.fillRect(q.x - s, q.y - s, s * 2, s * 2); ctx.strokeRect(q.x - s, q.y - s, s * 2, s * 2); });
    }
  }
  if (RT.guide) {
    ctx.setLineDash([]); ctx.lineWidth = 2 / RS;
    for (const g of RT.guide) { ctx.strokeStyle = g.c; ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x1, g.y1); ctx.stroke(); }
  }
  ctx.restore();
}
let lastNow = performance.now();
function tick(now) {
  const dt = Math.min(.1, (now - lastNow) / 1000); lastNow = now;
  if (playing && !RT.exporting) {
    T += dt;
    if (T >= S.duration) { if (S.loop) T = T % S.duration; else { T = S.duration; playing = false; updPlay(); } }
    needs = true;
  }
  if (needs && !RT.exporting) { renderFrame(pctx, T, RS, false); drawOverlays(); updTime(); needs = false; }
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
function play(from) { if (from != null) T = from; if (T >= S.duration - .01) T = 0; playing = true; updPlay(); needs = true; }
function pause() { playing = false; updPlay(); needs = true; }
// nada toca sozinho: só a barra de espaço e o botão ▶. As ações só levam a agulha (pausada) a um quadro útil.
function restTime(L) {
  const ph = phase(L, L.start) || { inD:0, outD:0 }, end = L.end ?? S.duration;
  return clamp(Math.min(L.start + ph.inD + .05, end - ph.outD - .02), L.start, Math.max(L.start, end - .02));
}
function seekLayer(L) { pause(); T = clamp(restTime(L), 0, S.duration); needs = true; }
function seekOut(L) { pause(); const ph = phase(L, L.start) || { outD:0 }, end = L.end ?? S.duration; T = clamp(end - ph.outD * .5, 0, S.duration); needs = true; }
// quadro em que tudo que está na tela já entrou
function heroTime() {
  const els = S.layers.filter(l => l.type !== 'bg' && l.visible);
  if (!els.length) return 0;
  const t = Math.max(...els.map(restTime));
  return clamp(t, 0, S.duration - .02);
}

/* ------------ arrastar no palco ------------ */
function stagePt(ev) { const r = cv.getBoundingClientRect(); return { x:(ev.clientX - r.left) / r.width * W(), y:(ev.clientY - r.top) / r.height * H() }; }
function hitTest(pt) {
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const L = S.layers[i]; if (!L.visible || L.type === 'bg' || !L._bounds) continue;
    if (!phase(L, T)) continue;
    const b = L._bounds, p = 16;
    if (pt.x >= b.x - p && pt.x <= b.x + b.w + p && pt.y >= b.y - p && pt.y <= b.y + b.h + p) return L;
  }
  return null;
}
// alças: canto = escala tudo; lateral/baixo = largura/altura da máscara da imagem
const hRad = () => 11 * W() / (cv.getBoundingClientRect().width || 1);
const masked = L => L.type === 'image' && (L.mask === 'rect' || L.mask === 'circle');
const resizable = L => masked(L) || L.type === 'shape' && L.kind !== 'custom' && L.kind !== 'line';
// caixa que envolve toda a seleção (grupo ou vários), só das camadas que estão na tela agora
function selUnion() {
  const ls = pickedLayers().filter(o => o._bounds && o.visible && phase(o, T)); if (!ls.length || pickedLayers().length < 2) return null;
  const x0 = Math.min(...ls.map(o => o._bounds.x)), y0 = Math.min(...ls.map(o => o._bounds.y));
  return { x:x0, y:y0, w:Math.max(...ls.map(o => o._bounds.x + o._bounds.w)) - x0, h:Math.max(...ls.map(o => o._bounds.y + o._bounds.h)) - y0, ls };
}
function handlesOf(L) {
  const ub = playing ? null : selUnion(); if (ub) return [{ k:'corner', grp:true, x:ub.x + ub.w + 14, y:ub.y + ub.h + 14 }];
  if (!L || L.type === 'bg' || !L._bounds || !L.visible || playing || !phase(L, T)) return [];
  const b = L._bounds, p = 14, x1 = b.x + b.w + p, y1 = b.y + b.h + p;
  const hs = [{ k:'corner', x:x1, y:y1 }];
  if (resizable(L)) hs.push({ k:'w', x:x1, y:b.y + b.h / 2 }, { k:'h', x:b.x + b.w / 2, y:y1 });
  return hs;
}
function handleAt(pt) { const r = hRad() * 1.3; return handlesOf(selL()).find(q => Math.abs(pt.x - q.x) <= r && Math.abs(pt.y - q.y) <= r) || null; }
function scaleLayer(L, s0, f) {
  if (L.type === 'text') { L.size = Math.round(clamp(s0.size * f, 12, 600)); RT.layout.clear(); }
  else if (L.type === 'cta') { L.size = Math.round(clamp(s0.size * f, 12, 200)); L.padX = Math.round(s0.padX * f); L.padY = Math.round(s0.padY * f); }
  else { L.size = clamp(s0.size * f, .03, 1.6); if (s0.mh != null) L.mh = clamp(s0.mh * f, .03, 2.6); }
}
cv.addEventListener('pointerdown', ev => {
  if (ev.button === 2) return; // botão direito abre o menu (contextmenu)
  const pt = stagePt(ev), hd = handleAt(pt);
  if (hd && hd.grp) {
    const ub = selUnion(); pushUndo();
    const cx = ub.x + ub.w / 2, cy = ub.y + ub.h / 2;
    RT.drag = { L:selL(), mode:'gcorner', cx, cy, d0:Math.max(1, Math.hypot(pt.x - cx, pt.y - cy)),
      items:pickedLayers().filter(o => o._bounds).map(o => ({ o, s0:{ size:o.size, mh:o.mh, padX:o.padX, padY:o.padY }, ox:o._bounds.x + o._bounds.w / 2, oy:o._bounds.y + o._bounds.h / 2 })) };
    cv.setPointerCapture(ev.pointerId); return;
  }
  if (hd) {
    const L = selL(), b = L._bounds; pushUndo();
    if (resizable(L) && L.mh == null) L.mh = b.h / W();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    RT.drag = { L, mode:hd.k, pt0:pt, cx, cy, d0:Math.max(1, Math.hypot(pt.x - cx, pt.y - cy)), s0:{ size:L.size, mh:L.mh, padX:L.padX, padY:L.padY } };
    cv.setPointerCapture(ev.pointerId); return;
  }
  const L = hitTest(pt);
  if (!L) { if (ev.shiftKey) return; const bg = S.layers.find(l => l.type === 'bg'); if (bg) select(bg.id); return; } // Shift errando o clique não solta a seleção
  if (ev.shiftKey) { toggleSel(L); return; }
  const only = ev.ctrlKey || ev.metaKey, grp = isPicked(L.id) && pickedLayers().length > 1 && !only;
  if (only) select(L.id, true);
  else if (grp) { RT.selected = L.id; renderLayers(); renderProps(); needs = true; } else select(L.id);
  pushUndo();
  if (ev.altKey && L.type === 'image') RT.drag = { L, mode:'pan', pt0:pt, ix0:L.ix || 0, iy0:L.iy || 0, bw:L._bounds.w, bh:L._bounds.h };
  else RT.drag = { L, mode:'move', tap:grp, pxy:[ev.clientX, ev.clientY], ox:pt.x - L.x * W(), oy:pt.y - L.y * H(), others:pickedLayers().filter(o => o !== L).map(o => ({ o, x0:o.x, y0:o.y })), x0:L.x, y0:L.y, ...snapSetup() };
  cv.setPointerCapture(ev.pointerId);
});
// Guias ao arrastar: bordas e centro da seleção contra os elementos fora dela, o quadro e a margem (Ctrl desliga; Shift trava num eixo)
function snapSetup() {
  const mv = pickedLayers().filter(o => o._bounds && o.visible);
  if (!mv.length) return {};
  const x0 = Math.min(...mv.map(o => o._bounds.x)), y0 = Math.min(...mv.map(o => o._bounds.y));
  const b0 = { x:x0, y:y0, w:Math.max(...mv.map(o => o._bounds.x + o._bounds.w)) - x0, h:Math.max(...mv.map(o => o._bounds.y + o._bounds.h)) - y0 };
  const tg = [{ x:0, y:0, w:W(), h:H(), c:'rgba(143,176,255,.9)' }];
  const M = marginBox(); if (M) tg.push({ x:M.x0, y:M.y0, w:M.x1 - M.x0, h:M.y1 - M.y0, c:'rgba(111,211,166,.9)' });
  for (const o of S.layers) if (o.type !== 'bg' && o.visible && o._bounds && !isPicked(o.id) && phase(o, T)) tg.push({ x:o._bounds.x, y:o._bounds.y, w:o._bounds.w, h:o._bounds.h, c:'rgba(255,92,163,.95)' });
  return { b0, tg };
}
function snapMove(D, dx, dy) {
  const U = D.b0, thr = 7 * W() / (cv.getBoundingClientRect().width || 1);
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
  const pt = stagePt(ev);
  if (!RT.drag) {
    const hd = handleAt(pt);
    cv.style.cursor = hd ? { corner:'nwse-resize', w:'ew-resize', h:'ns-resize' }[hd.k] : hitTest(pt) ? (ev.altKey && hitTest(pt).type === 'image' ? 'all-scroll' : 'move') : '';
    return;
  }
  const D = RT.drag, L = D.L;
  if (D.tap && Math.hypot(ev.clientX - D.pxy[0], ev.clientY - D.pxy[1]) > 3) D.tap = false;
  if (D.mode === 'gcorner') {
    const f = Math.max(.05, Math.hypot(pt.x - D.cx, pt.y - D.cy) / D.d0);
    for (const q of D.items) { scaleLayer(q.o, q.s0, f); q.o.x = +((D.cx + (q.ox - D.cx) * f) / W()).toFixed(4); q.o.y = +((D.cy + (q.oy - D.cy) * f) / H()).toFixed(4); }
  } else if (D.mode === 'corner') scaleLayer(L, D.s0, Math.max(.05, Math.hypot(pt.x - D.cx, pt.y - D.cy) / D.d0));
  else if (D.mode === 'w') L.size = clamp(D.s0.size + 2 * (pt.x - D.pt0.x) / W(), .03, 1.6);
  else if (D.mode === 'h') L.mh = clamp(D.s0.mh + 2 * (pt.y - D.pt0.y) / W(), .03, 2.6);
  else if (D.mode === 'pan') { L.ix = clamp(D.ix0 + (pt.x - D.pt0.x) / D.bw, -2, 2); L.iy = clamp(D.iy0 + (pt.y - D.pt0.y) / D.bh, -2, 2); }
  else {
    let x = (pt.x - D.ox) / W(), y = (pt.y - D.oy) / H();
    RT.guide = null;
    // Shift = movimento reto: trava no eixo em que mais andou
    const lock = ev.shiftKey ? (Math.abs(x - D.x0) * W() >= Math.abs(y - D.y0) * H() ? 'y' : 'x') : null;
    const relock = () => { if (lock === 'y') y = D.y0; else if (lock === 'x') x = D.x0; };
    relock();
    if (D.b0 && !ev.ctrlKey && !ev.metaKey) { const sn = snapMove(D, (x - D.x0) * W(), (y - D.y0) * H()); x = D.x0 + sn.dx / W(); y = D.y0 + sn.dy / H(); RT.guide = sn.lines; relock(); }
    if (!freeType(L) && L._bounds) { const f = fitInMargin(x * W(), y * H(), L._bounds.w, L._bounds.h); x = f.ax / W(); y = f.ay / H(); relock(); }
    // um deslocamento só para todos: se um bate no limite, ninguém passa (senão desalinham)
    const its = [{ o:L, x0:D.x0, y0:D.y0 }, ...(D.others || [])];
    const ddx = clamp(x - D.x0, Math.max(...its.map(q => -.2 - q.x0)), Math.min(...its.map(q => 1.2 - q.x0)));
    const ddy = clamp(y - D.y0, Math.max(...its.map(q => -.2 - q.y0)), Math.min(...its.map(q => 1.2 - q.y0)));
    for (const q of its) { q.o.x = +(q.x0 + ddx).toFixed(4); q.o.y = +(q.y0 + ddy).toFixed(4); }
    syncPosFields(L);
  }
  needs = true;
});
// roda do mouse sobre a imagem selecionada: zoom da imagem dentro da máscara
let wheelT = null;
cv.addEventListener('wheel', ev => {
  const L = selL(); if (!L || L.type !== 'image' || !L._bounds) return;
  const pt = stagePt(ev), b = L._bounds; if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) return;
  ev.preventDefault();
  if (!wheelT) pushUndo();
  L.zoom = clamp((L.zoom ?? 1) * (ev.deltaY < 0 ? 1.06 : 1 / 1.06), .2, 5); needs = true;
  clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = null; changed({ props:true }); }, 350);
}, { passive:false });
const endDrag = () => {
  if (!RT.drag) return;
  const mv = RT.drag.mode === 'move', tap = RT.drag.tap && RT.drag.L; // toque sem arrastar num grupo: fica só essa camada
  RT.drag = null; RT.guide = null;
  if (tap) select(tap.id);
  changed({ props:!mv });
};
cv.addEventListener('dblclick', ev => { const L = hitTest(stagePt(ev)); if (L && L.grp) select(L.id, true); });
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
// toque na área cinza em volta do palco: tira a seleção (fica o fundo)
$('.stage').addEventListener('pointerdown', e => {
  if (e.target.closest('#cv') || e.button === 2) return;
  const bg = S.layers.find(l => l.type === 'bg'); if (bg) select(bg.id);
});

/* ============================================================
   Desfazer, salvar automático, projetos
   ============================================================ */
const redoStack = [];
let redoBase = null; // estado logo depois de desfazer/refazer: enquanto nada mudar, o refazer continua valendo
function syncHist() { const u = $('#undo'), r = $('#redo'); if (u) u.disabled = !undoStack.length; if (r) r.disabled = !redoStack.length; }
function pushUndo() {
  try {
    const snap = JSON.stringify(S);
    if (redoStack.length && snap !== redoBase) redoStack.length = 0; // ação nova: o refazer perde o sentido
    // controles chamam pushUndo ao focar/clicar sem mudar nada: não vira passo
    if (undoStack[undoStack.length - 1] !== snap) { undoStack.push(snap); if (undoStack.length > 60) undoStack.shift(); }
  } catch (e) {}
  syncHist();
}
function applyState(s) {
  const prevLogo = JSON.stringify(S.brand.logo);
  S = JSON.parse(s); RT.layout.clear();
  if (!S.layers.find(l => l.id === RT.selected)) RT.selected = S.layers[0]?.id;
  if (JSON.stringify(S.brand.logo) !== prevLogo) refreshLogo();
  ensureFonts(); S.layers.forEach(l => l.src && getImage(l.src));
  redoBase = s;
  renderAll(); needs = true; autosave();
}
function undo() {
  const cur = JSON.stringify(S);
  let s; while ((s = undoStack.pop()) === cur) {} // pula passos idênticos ao estado atual
  if (!s) { syncHist(); return; }
  redoStack.push(cur); applyState(s); syncHist();
}
function redo() {
  const s = redoStack.pop(); if (!s) { syncHist(); return; }
  undoStack.push(JSON.stringify(S)); applyState(s); syncHist();
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
  needs = true; autosave();
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
  FILES.id = id; FILES.name = name; showFileName();
  DB.set('currentId', id);
  undoStack.length = 0; redoStack.length = 0; redoBase = null; syncHist();
  S = st; RT.layout.clear();
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
async function encodeWebCodecs(canvas, ctx, w, hh, N, prog) {
  if (!window.Mp4Muxer) return null;
  const pick = await pickConfig(w, hh); if (!pick) return null;
  const muxer = new Mp4Muxer.Muxer({ target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:pick.mux, width:w, height:hh, frameRate:fps() }, fastStart:'in-memory' });
  let err = null;
  const enc = new VideoEncoder({ output:(chunk, meta) => muxer.addVideoChunk(chunk, meta), error:e => { err = e; } });
  enc.configure(pick.cfg);
  for (let i = 0; i < N; i++) {
    if (cancelExport) { try { enc.close(); } catch (e) {} return 'cancel'; }
    renderFrame(ctx, i / fps(), 1, true);
    const vf = new VideoFrame(canvas, { timestamp:Math.round(i * 1e6 / fps()), duration:Math.round(1e6 / fps()) });
    enc.encode(vf, { keyFrame:i % (fps() * 2) === 0 }); vf.close();
    while (enc.encodeQueueSize > 6) await sleep(1);
    if (err) throw err;
    if (i % 3 === 0) { prog(i / N); await sleep(0); }
  }
  await enc.flush(); if (err) throw err;
  muxer.finalize(); enc.close();
  return { blob:new Blob([muxer.target.buffer], { type:'video/mp4' }), ext:'mp4', codec:(pick.cfg.codec.startsWith('avc1.64') ? 'H.264 High' : pick.cfg.codec.startsWith('avc') ? 'H.264' : 'VP9') + ` · ${(pick.cfg.bitrate / 1e6).toFixed(1)} Mbps` };
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
async function exportVideo() {
  pause(); RT.exporting = true; cancelExport = false;
  const w = W(), hh = H(), N = Math.round(S.duration * fps());
  const m = $('#modal'); m.hidden = false; $('#mTitle').textContent = 'Exportando vídeo';
  $('#mVideo').hidden = true; $('#mSave').hidden = true; $('#mBar').style.width = '0%';
  $('#mMeta').textContent = `${w}×${hh} · ${fps()} fps · ${S.duration}s`;
  $('#mClose').textContent = 'Cancelar';
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = hh;
  const ctx = canvas.getContext('2d');
  const prog = p => { $('#mBar').style.width = (p * 100).toFixed(1) + '%'; };
  let res = null;
  try { res = await encodeWebCodecs(canvas, ctx, w, hh, N, prog); } catch (e) { console.warn('WebCodecs falhou', e); res = null; }
  if (res === 'cancel') { RT.exporting = false; m.hidden = true; needs = true; return; }
  if (!res) { $('#mMeta').textContent += ' · gravando em tempo real'; try { res = await encodeRecorder(canvas, ctx, prog); } catch (e) { res = null; } }
  RT.exporting = false; needs = true; $('#mClose').textContent = 'Fechar';
  if (cancelExport) { m.hidden = true; return; }
  if (!res) { $('#mTitle').textContent = 'Este navegador não exporta vídeo'; $('#mMeta').textContent = 'Use o Chrome ou o Edge atualizados.'; return; }
  prog(1);
  if (lastExport?.url) URL.revokeObjectURL(lastExport.url);
  const fname = `mola-${(S.template || 'anuncio')}-${FORMATS[S.format].label.replace(':', 'x')}.${res.ext}`;
  lastExport = { ...res, url:URL.createObjectURL(res.blob), fname };
  $('#mTitle').textContent = 'Vídeo pronto';
  $('#mMeta').textContent = `${w}×${hh} · ${fps()} fps · ${res.codec} · ${(res.blob.size / 1048576).toFixed(1)} MB`;
  const v = $('#mVideo'); v.src = lastExport.url; v.hidden = false;
  $('#mSave').hidden = false; $('#mSave').textContent = `Salvar ${res.ext.toUpperCase()}`;
}
$('#export').onclick = exportVideo;
$('#mClose').onclick = () => { if (RT.exporting) { cancelExport = true; return; } $('#modal').hidden = true; const v = $('#mVideo'); v.pause(); };
$('#mSave').onclick = () => lastExport && saveFile(lastExport.blob, lastExport.fname);

/* ============================================================
   Interface
   ============================================================ */
const ICONS = {
  eye:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeOff:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 2l12 12M6.5 4Q7.2 3.5 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.8 2.3M10.4 11.7Q9.3 12.5 8 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 0 1 2.5-3"/></svg>',
  up:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10l4-4 4 4"/></svg>',
  down:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg>',
  trash:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
  copy:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5V3.8C3 3.4 3.4 3 3.8 3h6.7"/></svg>',
};
// RT.picks = todas as camadas selecionadas (Shift + clique soma ou tira); RT.selected = a principal (painel de propriedades)
// Grupo: as camadas com o mesmo `grp` se selecionam juntas. Ctrl + clique (`only`) escolhe uma só de dentro do grupo.
const groupOf = L => L && L.grp ? S.layers.filter(l => l.grp === L.grp) : [L];
function select(id, only) {
  RT.selected = id; const L = S.layers.find(l => l.id === id);
  RT.picks = new Set(!only && L && L.grp ? groupOf(L).map(l => l.id) : [id]);
  renderLayers(); renderProps(); needs = true;
}
function selL() { return S.layers.find(l => l.id === RT.selected); }
function isPicked(id) { return id === RT.selected || !!(RT.picks && RT.picks.has(id)); }
function pickedLayers() {
  const out = S.layers.filter(l => l.type !== 'bg' && isPicked(l.id));
  return out.length ? out : [selL()].filter(l => l && l.type !== 'bg');
}
function toggleSel(L) {
  if (L.type === 'bg') return select(L.id);
  const cur = RT.picks && RT.picks.size ? new Set([...RT.picks].filter(id => S.layers.some(l => l.id === id))) : new Set();
  cur.add(RT.selected);
  const mem = groupOf(L).map(l => l.id);
  if (cur.has(L.id) && cur.size > mem.length) { mem.forEach(id => cur.delete(id)); if (!cur.has(RT.selected)) RT.selected = [...cur].pop(); }
  else { mem.forEach(id => cur.add(id)); RT.selected = L.id; }
  const bg = S.layers.find(l => l.type === 'bg'); if (bg && cur.size > 1) cur.delete(bg.id);
  RT.picks = cur; renderLayers(); renderProps(); needs = true;
}

/* ------------ alinhar e agrupar ------------ */
// recalcula a posição de repouso de cada camada (o _bounds só existe para quem está na tela no quadro atual)
function ensureBounds(ls) {
  const miss = ls.filter(l => l.visible);
  if (!miss.length) return;
  const cx = document.createElement('canvas').getContext('2d'); cx.canvas.width = cx.canvas.height = 8;
  for (const L of miss) renderFrame(cx, restTime(L), 8 / W(), false);
  needs = true;
}
// um grupo conta como um bloco só
function selUnits(ls) {
  const map = new Map();
  for (const L of ls) if (L._bounds) { const k = L.grp || L.id; if (!map.has(k)) map.set(k, []); map.get(k).push(L); }
  return [...map.values()].map(m => ({ m,
    x0:Math.min(...m.map(l => l._bounds.x)), y0:Math.min(...m.map(l => l._bounds.y)),
    x1:Math.max(...m.map(l => l._bounds.x + l._bounds.w)), y1:Math.max(...m.map(l => l._bounds.y + l._bounds.h)) }));
}
// mode: l | ch | r | t | cv | b | dh | dv. Um bloco só alinha ao quadro; vários alinham entre si.
function alignLayers(mode) {
  const ls = pickedLayers(); ensureBounds(ls);
  const U = selUnits(ls); if (!U.length) return;
  const ref = U.length > 1 ? { x0:Math.min(...U.map(u => u.x0)), y0:Math.min(...U.map(u => u.y0)), x1:Math.max(...U.map(u => u.x1)), y1:Math.max(...U.map(u => u.y1)) } : (() => { const M = marginBox(); return M ? { x0:M.x0, y0:M.y0, x1:M.x1, y1:M.y1 } : { x0:0, y0:0, x1:W(), y1:H() }; })();
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
    if (horiz) { L.x = +clamp((b.x + b.w / 2 + v) / W(), -.2, 1.2).toFixed(4); b.x += v; }
    else { L.y = +clamp((b.y + b.h / 2 + v) / H(), -.2, 1.2).toFixed(4); b.y += v; }
  } }
  changed({ props:true });
}
function groupSel() {
  const ms = S.layers.filter(l => l.type !== 'bg' && isPicked(l.id)); if (ms.length < 2) return;
  pushUndo(); const gid = 'g' + Math.random().toString(36).slice(2, 7);
  ms.forEach(l => { l.grp = gid; });
  // fica junto na pilha, na altura do que está mais à frente
  const top = Math.max(...ms.map(l => S.layers.indexOf(l)));
  S.layers = [...S.layers.slice(0, top + 1).filter(l => !ms.includes(l)), ...ms, ...S.layers.slice(top + 1)];
  RT.picks = new Set(ms.map(l => l.id)); if (!RT.picks.has(RT.selected)) RT.selected = ms[ms.length - 1].id;
  changed({ layers:true, props:true }); toast(`${ms.length} elementos agrupados. Ctrl+Shift+G desfaz`);
}
function ungroupSel() {
  const ids = new Set(pickedLayers().map(l => l.grp).filter(Boolean)); if (!ids.size) return;
  pushUndo(); S.layers.forEach(l => { if (ids.has(l.grp)) delete l.grp; }); ids.forEach(g => { if (S.groups) delete S.groups[g]; });
  changed({ layers:true, props:true }); toast('Grupo desfeito');
}
const AL = (d, r) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="${d}"/>${r}</svg>`;
const rc = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx=".7"/>`;
Object.assign(ICONS, {
  al_l:AL('M2.5 2v12', rc(5, 3.5, 8, 3.2) + rc(5, 9.3, 5, 3.2)), al_ch:AL('M8 2v12', rc(3, 3.5, 10, 3.2) + rc(4.5, 9.3, 7, 3.2)), al_r:AL('M13.5 2v12', rc(3, 3.5, 8, 3.2) + rc(6, 9.3, 5, 3.2)),
  al_t:AL('M2 2.5h12', rc(3.5, 5, 3.2, 8) + rc(9.3, 5, 3.2, 5)), al_cv:AL('M2 8h12', rc(3.5, 3, 3.2, 10) + rc(9.3, 4.5, 3.2, 7)), al_b:AL('M2 13.5h12', rc(3.5, 3, 3.2, 8) + rc(9.3, 6, 3.2, 5)),
  al_dh:AL('M2.5 2v12M13.5 2v12', rc(6.3, 4, 3.4, 8)), al_dv:AL('M2 2.5h12M2 13.5h12', rc(4, 6.3, 8, 3.4)),
});
// escala a seleção toda (proporcional, em torno do centro do conjunto); devolve apply(f) sobre o tamanho de agora
function beginScaleSel() {
  const ls = pickedLayers(); ensureBounds(ls);
  const its = ls.filter(o => o._bounds); if (!its.length) return null;
  const x0 = Math.min(...its.map(o => o._bounds.x)), y0 = Math.min(...its.map(o => o._bounds.y));
  const cx = (x0 + Math.max(...its.map(o => o._bounds.x + o._bounds.w))) / 2, cy = (y0 + Math.max(...its.map(o => o._bounds.y + o._bounds.h))) / 2;
  const items = its.map(o => ({ o, s0:{ size:o.size, mh:o.mh, padX:o.padX, padY:o.padY }, ox:o._bounds.x + o._bounds.w / 2, oy:o._bounds.y + o._bounds.h / 2 }));
  return f => { for (const q of items) { scaleLayer(q.o, q.s0, f); q.o.x = +((cx + (q.ox - cx) * f) / W()).toFixed(4); q.o.y = +((cy + (q.oy - cy) * f) / H()).toFixed(4); } needs = true; };
}
function scaleBar() {
  const rng = h('input', { type:'range', min:25, max:300, step:1, value:100, 'aria-label':'Escala da seleção' }), out = h('output', { text:'100%' });
  let ap = null;
  rng.addEventListener('pointerdown', () => { pushUndo(); ap = beginScaleSel(); });
  rng.addEventListener('input', () => { if (!ap) { pushUndo(); ap = beginScaleSel(); } if (ap) { ap(+rng.value / 100); out.textContent = rng.value + '%'; } });
  rng.addEventListener('change', () => { ap = null; rng.value = 100; out.textContent = '100%'; changed({ props:true }); });
  const step = (f, t) => h('button', { class:'icon-btn', title:t, 'aria-label':t, text:f > 1 ? '+' : '−', onclick:() => { pushUndo(); const a = beginScaleSel(); if (a) { a(f); changed({ props:true }); } } });
  return h('section', { class:'sec' }, [h('h3', {}, ['Tamanho da seleção', h('small', { text:'todos juntos' })]),
    h('div', { class:'row' }, [step(1 / 1.1, 'Diminuir 10%'), rng, out, step(1.1, 'Aumentar 10%')])]);
}
function alignBar() {
  const ls = pickedLayers(); if (!ls.length) return null;
  const n = new Set(ls.map(l => l.grp || l.id)).size;
  const b = (k, t, off) => h('button', { class:'icon-btn', title:t, 'aria-label':t, html:ICONS['al_' + k], disabled:off || null, onclick:() => alignLayers(k) });
  const oneGrp = ls.every(l => l.grp && l.grp === ls[0].grp);
  return h('section', { class:'sec' }, [
    h('h3', {}, ['Alinhar', h('small', { text:n > 1 ? 'entre a seleção' : ls.length > 1 ? marginBox() ? 'grupo à margem' : 'grupo ao quadro' : marginBox() ? 'à margem' : 'ao quadro' })]),
    h('div', { class:'alrow' }, [b('l', 'Alinhar à esquerda'), b('ch', 'Centralizar na horizontal'), b('r', 'Alinhar à direita'), h('i'),
      b('t', 'Alinhar ao topo'), b('cv', 'Centralizar na vertical'), b('b', 'Alinhar embaixo'), h('i'),
      b('dh', 'Distribuir na horizontal (3 ou mais)', n < 3), b('dv', 'Distribuir na vertical (3 ou mais)', n < 3)]),
    h('div', { class:'row' }, [
      h('button', { class:'btn small', text:'Agrupar', title:'Agrupar (Ctrl+G)', disabled:ls.length < 2 || oneGrp || null, onclick:groupSel }),
      ls.some(l => l.grp) ? h('button', { class:'btn small', text:'Desagrupar', title:'Desagrupar (Ctrl+Shift+G)', onclick:ungroupSel }) : null,
      ls.length > 1 ? h('span', { class:'hint', text:`${ls.length} selecionados` }) : null,
    ]),
  ]);
}

function renderFormats() {
  const box = $('#fmt'); box.innerHTML = '';
  for (const [k, f] of Object.entries(FORMATS)) box.append(h('button', { 'aria-pressed':String(S.format === k), text:f.label, onclick:() => { S.format = k; RT.layout.clear(); renderFormats(); fitStage(); changed(); } }));
  $('#dur').value = S.duration;
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
  const chip = (c, label, onInput, onDel, nameEl) => {
    const sw = colorButton(c, `Cor ${label}`, { cls:'sw', onStart:pushUndo, onInput:x => { onInput(x); needs = true; autosave(); } });
    return h('div', { class:'swcol' }, [h('div', { class:'swwrap' }, [sw, onDel ? h('button', { class:'sw-del', title:'Remover cor', 'aria-label':'Remover cor', text:'×', onclick:() => { pushUndo(); onDel(); redo(); } }) : null]), nameEl]);
  };
  const group = (title, titleEl, chips, onAdd, onDelGroup) => h('div', { class:'pgroup' }, [
    h('div', { class:'pg-head' }, [titleEl || h('span', { class:'pg-name', text:title }), onDelGroup ? h('button', { class:'icon-btn', title:'Apagar grupo', 'aria-label':'Apagar grupo', html:ICONS.trash, onclick:() => { pushUndo(); onDelGroup(); redo(); } }) : null]),
    h('div', { class:'swatches' }, [...chips, h('button', { class:'sw-add', title:'Adicionar cor', 'aria-label':'Adicionar cor', text:'+ Adicionar cor', onclick:() => { pushUndo(); onAdd(); redo(); } })]),
  ]);
  // Marca
  box.append(group('Marca', null, B.colors.map((c, i) => chip(c, B.names[i] || ROLE_NAMES[i] || `Cor ${i + 1}`,
    x => { B.colors[i] = x; }, i >= ROLE_NAMES.length ? () => { B.colors.splice(i, 1); B.names.splice(i, 1); } : null,
    nameIn(B.names[i] || ROLE_NAMES[i] || '', `Cor ${i + 1}`, v => { B.names[i] = v; }, 'sw-lbl'))),
    () => { B.colors.push('#888888'); }));
  // Demais grupos
  groups.forEach((g, gi) => box.append(group(g.name, nameIn(g.name, 'Nome do grupo', v => { g.name = v || 'Grupo'; }, 'pg-name'),
    g.colors.map((x, ci) => chip(x.c, x.n || `Cor ${ci + 1}`, c => { x.c = c; }, () => g.colors.splice(ci, 1), nameIn(x.n, `Cor ${ci + 1}`, v => { x.n = v; }, 'sw-lbl'))),
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
function renderLayers() {
  const box = $('#layers'); box.innerHTML = '';
  const arr = S.layers.map((L, i) => ({ L, i })).reverse(), seen = new Set(), gn = {};
  S.layers.forEach(l => { if (l.grp && !(l.grp in gn)) gn[l.grp] = Object.keys(gn).length + 1; });
  for (const { L, i } of arr) {
    if (L.grp && !seen.has(L.grp)) {
      seen.add(L.grp);
      const mem = groupOf(L), on = mem.every(m => isPicked(m.id));
      box.append(h('div', { class:'lgroup', 'aria-selected':String(on), role:'button', tabindex:'0', title:'Clique para selecionar o grupo. Ctrl + clique num item escolhe só ele',
        onclick:() => select(L.id), onkeydown:e => { if (e.key === 'Enter') select(L.id); } }, [
        h('span', { text:`Grupo ${gn[L.grp]}` }), h('small', { text:`${mem.length} itens` }),
        h('button', { class:'icon-btn', title:'Desagrupar', 'aria-label':'Desagrupar', text:'×', onclick:e => { e.stopPropagation(); select(L.id); ungroupSel(); } })]));
    }
    const row = h('div', { class:'layer' + (L.visible ? '' : ' off') + (L.grp ? ' ingrp' : ''), 'aria-selected':String(isPicked(L.id)), role:'button', tabindex:'0',
      onclick:e => clickOrRename(L, 'list', e), oncontextmenu:e => openMenu(e, L), onkeydown:e => { if (e.key === 'Enter') select(L.id); } }, [
      h('span', { class:'dot', style:`background:${TYPE_COLOR[L.type]}` }),
      h('span', { class:'nm', title:'Clique duas vezes para renomear. Arraste para reordenar' }, [L.name, L.type !== 'bg' ? h('small', { text:`${L.start.toFixed(1)}s` }) : null]),
      h('span', { class:'acts' }, [
        L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Subir', html:ICONS.up, onclick:e => { e.stopPropagation(); move(i, 1); } }) : null,
        L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Descer', html:ICONS.down, onclick:e => { e.stopPropagation(); move(i, -1); } }) : null,
        h('button', { class:'icon-btn', title:L.visible ? 'Ocultar' : 'Mostrar', html:L.visible ? ICONS.eye : ICONS.eyeOff, onclick:e => { e.stopPropagation(); L.visible = !L.visible; changed({ layers:true }); } }),
      ]),
    ]);
    row.dataset.id = L.id; dragReorder(row, L);
    box.append(row);
  }
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
function renameLayer(L, where) {
  const s = document.querySelector(where === 'tl' ? `#tl .tl-row[data-id="${L.id}"] .tl-nm span:last-child` : `#layers .layer[data-id="${L.id}"] .nm`);
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
  el.addEventListener('dragstart', e => { dragLayerId = L.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', L.id); });
  el.addEventListener('dragend', () => { dragLayerId = null; clear(); });
  el.addEventListener('dragover', e => {
    if (!dragLayerId || dragLayerId === L.id) return;
    e.preventDefault(); clear();
    const r = el.getBoundingClientRect();
    el.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
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
  const mvs = dg ? S.layers.filter(l => l.grp === dg) : isPicked(one.id) ? pickedLayers() : [one];
  if (!mvs.includes(one)) mvs.push(one);
  const set = new Set(mvs);
  if (T && set.has(T)) return;
  const members = gid ? S.layers.filter(l => l.grp === gid) : [];
  if (gid && members.every(m => set.has(m))) return;
  const g0 = mvs[0].grp, whole = !!g0 && mvs.every(m => m.grp === g0) && S.layers.filter(l => l.grp === g0).every(m => set.has(m));
  const block = S.layers.filter(l => set.has(l));
  pushUndo();
  S.layers = S.layers.filter(l => !set.has(l));
  // "acima" na tela = índice maior
  const topOf = id => Math.max(...S.layers.map((l, i) => l.grp === id ? i : -1)) + 1;
  let j, ng;
  if (gid) { j = topOf(gid); ng = above ? undefined : gid; }
  else { j = S.layers.indexOf(T) + (above ? 1 : 0); ng = T.grp; }
  if (whole && ng && ng !== g0) { j = topOf(ng); ng = undefined; }  // grupo inteiro não entra em outro grupo
  j = Math.max(1, j);
  S.layers.splice(j, 0, ...block);
  if (!whole) block.forEach(l => { if (ng) l.grp = ng; else delete l.grp; });
  if (S.groups) for (const k of Object.keys(S.groups)) if (!S.layers.some(l => l.grp === k)) delete S.groups[k];
  changed({ layers:true });
}
// cabeçalho do grupo como alvo de soltar
function groupDrop(el, gid) {
  const clear = () => document.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in'));
  el.addEventListener('dragover', e => {
    if (!dragLayerId) return;
    e.preventDefault(); clear();
    const r = el.getBoundingClientRect();
    el.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-in');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-in'));
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
    if (o.grp) {
      if (!gm[o.grp]) { gm[o.grp] = 'g' + Math.random().toString(36).slice(2, 7); const gmt = gmeta(o.grp); if (gmt) (S.groups ||= {})[gm[o.grp]] = JSON.parse(JSON.stringify(gmt)); }
      c.grp = gm[o.grp];
    }
    S.layers.splice(S.layers.indexOf(o) + 1, 0, c); last = c;
  }
  select(last.id); changed({ layers:true });
}
function deleteLayer(L) {
  if (!L || L.type === 'bg') return;
  const grp = isPicked(L.id) ? pickedLayers() : [L];
  pushUndo(); const i = S.layers.indexOf(L);
  grp.forEach(g => S.layers.splice(S.layers.indexOf(g), 1));
  RT.selected = (S.layers[Math.min(i, S.layers.length - 1)] || S.layers[0])?.id; RT.picks = new Set([RT.selected]);
  changed({ layers:true, props:true }); toast(grp.length > 1 ? `${grp.length} camadas apagadas. Ctrl+Z desfaz` : `"${L.name}" apagada. Ctrl+Z desfaz`);
}
/* ------------ menu do botão direito ------------ */
function closeMenu() { document.querySelector('.ctx')?.remove(); }
function openMenu(ev, L) {
  ev.preventDefault(); closeMenu();
  if (!L) return;
  if (!isPicked(L.id)) select(L.id); else RT.selected = L.id;
  const i = S.layers.indexOf(L), isBg = L.type === 'bg';
  const item = (text, fn, o = {}) => h('button', { class:o.danger ? 'danger' : null, disabled:o.off || null, onclick:() => { closeMenu(); fn(); } }, [h('span', { text }), o.kbd ? h('kbd', { text:o.kbd }) : null]);
  const m = h('div', { class:'ctx', role:'menu' }, [
    item('Ir para este elemento', () => seekLayer(L), { off:isBg }),
    h('hr'),
    item('Renomear', () => renameLayer(L), { off:isBg }),
    item('Duplicar', () => duplicateLayer(L), { off:isBg }),
    item('Agrupar', groupSel, { off:isBg || pickedLayers().length < 2, kbd:'Ctrl+G' }),
    item('Desagrupar', ungroupSel, { off:!L.grp, kbd:'Ctrl+Shift+G' }),
    item(L.visible ? 'Ocultar' : 'Mostrar', () => { L.visible = !L.visible; changed({ layers:true }); }),
    item('Trazer para frente', () => move(i, 1), { off:isBg || i >= S.layers.length - 1 }),
    item('Enviar para trás', () => move(i, -1), { off:isBg || i <= 1 }),
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
const tlLabel = L => { const m = L.type === 'text' ? TP : BP; return (m[L.in] || {}).label || ''; };
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
    if (row.dataset.gid) { if (S.layers.some(l => l.grp === row.dataset.gid)) placeBar(bar, gpseudo(row.dataset.gid)); }
    else { const L = S.layers.find(l => l.id === row.dataset.id); if (L) placeBar(bar, L); }
  }
}
function renderTimeline() {
  const tl = $('#tl'); if (!tl || tl.hidden) return;
  const keep = tl.scrollTop; tl.innerHTML = '';
  const d = S.duration, ruler = h('div', { class:'tl-ruler' }, [h('div', { class:'tl-nm', style:'cursor:default' }, [h('span', { text:'Camadas' })])]);
  const scale = h('div', { class:'tl-scale' });
  const step = d > 30 ? 5 : d > 12 ? 2 : 1;
  for (let s = 0; s <= d + 1e-6; s += step) { const x = s / d * 100; scale.append(h('i', { style:`left:${x}%` })); if (s < d - step * .3) scale.append(h('b', { style:`left:${x}%`, text:s + 's' })); }
  const endH = h('div', { class:'tl-end', title:`Duração do vídeo: ${d.toFixed(1)}s. Arraste para mudar` });
  endH.addEventListener('pointerdown', tlDuration);
  scale.append(endH);
  ruler.append(scale); tl.append(ruler);
  const els = S.layers.filter(L => L.type !== 'bg').reverse();
  if (!els.length) tl.append(h('div', { class:'tl-empty', text:'Nenhum elemento ainda. Use Adicionar, na coluna da esquerda.' }));
  const doneG = new Set();
  const groupRow = gid => {
    const g = gmeta(gid, true), mem = S.layers.filter(l => l.grp === gid), on = mem.every(m => isPicked(m.id));
    const bar = h('div', { class:'tl-bar grp', style:`--c:var(--accent)` }, [h('div', { class:'seg in' }), h('div', { class:'seg out' }), h('div', { class:'h l' }), h('div', { class:'h r' })]);
    const tip = () => { const w = gwin(gid); bar.title = `${groupName(gid)}: ${w.start.toFixed(1)}s a ${w.end.toFixed(1)}s. Arraste para mover o grupo todo`; };
    placeBar(bar, gpseudo(gid)); tip();
    const lane = h('div', { class:'tl-lane' }, [bar]);
    lane.addEventListener('pointerdown', e => { if (e.button) return; const m = tlHit(bar, e.clientX); if (m) tlDragGroup(e, gid, bar, m); else tlScrub(e); });
    lane.addEventListener('pointermove', e => {
      if (bar.classList.contains('drag')) return;
      const m = tlHit(bar, e.clientX), c = m === 'l' || m === 'r' ? 'ew-resize' : '';
      lane.style.cursor = c; bar.style.cursor = c; bar.classList.toggle('hl', m === 'l'); bar.classList.toggle('hr', m === 'r');
    });
    lane.addEventListener('pointerleave', () => { if (!bar.classList.contains('drag')) bar.classList.remove('hl', 'hr'); });
    const chev = h('button', { class:'tl-chev', title:g.open === false ? 'Mostrar os itens do grupo' : 'Recolher o grupo', 'aria-label':'Recolher ou expandir o grupo', 'aria-expanded':String(g.open !== false), text:'▾',
      onpointerdown:e => { e.stopPropagation(); if (e.button) return; e.preventDefault(); g.open = g.open === false; renderTimeline(); autosave(); },
      onclick:e => { e.stopPropagation(); if (e.detail === 0) { g.open = g.open === false; renderTimeline(); autosave(); } } });
    chev.style.transform = g.open === false ? 'rotate(-90deg)' : '';
    const nm = h('div', { class:'tl-nm', title:'Clique para selecionar o grupo. Clique duas vezes para renomear', onclick:e => {
      if (e.detail > 1) { const n = prompt('Nome do grupo', groupName(gid)); if (n && n.trim()) { pushUndo(); g.name = n.trim(); changed({ layers:true, props:true }); } return; }
      select(mem[mem.length - 1].id);
    } }, [chev, h('span', { text:groupName(gid) }), h('small', { class:'tl-n', text:String(mem.length) })]);
    groupDrop(nm, gid);
    nm.draggable = true;
    nm.addEventListener('dragstart', e => { dragGroupId = gid; dragLayerId = mem[0].id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', gid); });
    nm.addEventListener('dragend', () => { dragGroupId = null; dragLayerId = null; document.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-in')); });
    const row = h('div', { class:'tl-row grp' + (on ? ' sel' : '') }, [nm, lane]);
    row.dataset.gid = gid;
    tl.append(row);
    return g;
  };
  for (const L of els) {
    if (L.grp) {
      if (!doneG.has(L.grp)) { doneG.add(L.grp); groupRow(L.grp); }
      if (gmeta(L.grp).open === false) continue;
    }
    const bar = h('div', { class:'tl-bar', style:`--c:${TYPE_COLOR[L.type]}`, title:`${L.name}: entra em ${L.start.toFixed(1)}s, sai em ${(L.end ?? d).toFixed(1)}s` }, [
      h('div', { class:'seg in' }), h('div', { class:'seg out' }), h('em', { text:tlLabel(L) }), h('div', { class:'h l' }), h('div', { class:'h r' })]);
    placeBar(bar, L);
    const lane = h('div', { class:'tl-lane' }, [bar]);
    // a faixa inteira decide: perto da borda (dentro ou fora da barra) redimensiona, no meio move, no vazio leva a agulha
    lane.addEventListener('pointerdown', e => {
      if (e.button) return;
      const m = tlHit(bar, e.clientX);
      if (e.shiftKey && m) { e.preventDefault(); e.stopPropagation(); toggleSel(L); return; } // sem stopPropagation o .stage solta a seleção
      if (m) tlDrag(e, L, bar, m); else tlScrub(e);
    });
    lane.addEventListener('pointermove', e => {
      if (bar.classList.contains('drag')) return;
      const m = tlHit(bar, e.clientX), c = m === 'l' || m === 'r' ? 'ew-resize' : '';
      lane.style.cursor = c; bar.style.cursor = c;
      bar.classList.toggle('hl', m === 'l'); bar.classList.toggle('hr', m === 'r');
    });
    lane.addEventListener('pointerleave', () => { if (!bar.classList.contains('drag')) bar.classList.remove('hl', 'hr'); });
    const nm = h('div', { class:'tl-nm', title:'Clique duas vezes para renomear. Arraste para reordenar', onclick:e => clickOrRename(L, 'tl', e) }, [h('span', { class:'dot', style:`background:${TYPE_COLOR[L.type]}` }), h('span', { text:L.name })]);
    dragReorder(nm, L);
    const row = h('div', { class:'tl-row' + (L.grp ? ' ingrp' : '') + (isPicked(L.id) ? ' sel' : '') + (L.visible ? '' : ' off'), oncontextmenu:e => openMenu(e, L) }, [nm, lane]);
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
// arrastar a barra do grupo: mover leva todos os membros; as bordas esticam ou encolhem o conjunto na mesma proporção
function tlDragGroup(e, gid, bar, mode) {
  e.preventDefault(); e.stopPropagation();
  const g = tlGeom(); if (!g) return;
  const mem = S.layers.filter(l => l.grp === gid);
  if (!mem.every(l => isPicked(l.id))) {
    RT.selected = mem[mem.length - 1].id; RT.picks = new Set(mem.map(l => l.id)); renderLayers(); renderProps(); needs = true;
    bar = g.tl.querySelector(`.tl-row[data-gid="${gid}"] .tl-bar`) || bar;
  }
  pushUndo(); pause();
  const d = S.duration, o = mem.map(l => ({ l, s:l.start, e:l.end })), s0 = Math.min(...o.map(x => x.s)), e0 = Math.max(...o.map(x => x.e ?? d));
  const x0 = e.clientX, grid = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000, MIN = .3;
  const pts = [0, d, T]; for (const q of S.layers) if (q.grp !== gid && q.type !== 'bg') pts.push(q.start, q.end ?? d);
  const tol = 7 / g.w * d;
  const near = v => { let b = null; for (const p of pts) if (Math.abs(p - v) <= tol && (b === null || Math.abs(p - v) < Math.abs(b - v))) b = p; return b; };
  const lane = bar.parentElement, tip = h('div', { class:'tl-tip' }), guide = h('div', { class:'tl-snap', hidden:true });
  lane.append(tip); g.tl.append(guide);
  const fmtS = v => v.toFixed(1).replace('.', ',') + 's';
  let moved = false;
  const apply = (s, en) => {
    const k = (en - s) / (e0 - s0);
    for (const x of o) {
      x.l.start = r3(s + (x.s - s0) * k);
      if (x.e != null) x.l.end = r3(s + (x.e - s0) * k); else if (mode === 'r' && en < d - .01) x.l.end = r3(en);
    }
  };
  const mv = ev => {
    const dt = (ev.clientX - x0) / g.w * d; if (Math.abs(ev.clientX - x0) > 2) moved = true;
    if (!moved) return;
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
    bar.classList.remove('drag', 'hl', 'hr'); tip.remove(); guide.remove();
  };
  const up = () => { done(); if (moved) changed({ layers:true, props:true }); };
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
  const grp = isPicked(L.id) ? pickedLayers().filter(o => o !== L).map(o => ({ o, s:o.start, e:o.end })) : [];
  const d = S.duration, s0 = L.start, e0 = L.end ?? d, end0 = L.end, x0 = e.clientX, grid = v => Math.round(v * 10) / 10, MIN = .3;
  // ímã: início, fim, agulha e as bordas das outras camadas (Shift desliga)
  const pts = [0, d, T];
  for (const o of S.layers) if (o !== L && o.type !== 'bg' && !grp.some(q => q.o === o)) pts.push(o.start, o.end ?? d);
  // limites do deslocamento para a seleção toda andar junta (ninguém sai do vídeo, ninguém fica para trás)
  const ext = (s, en) => en != null && en < d - .01 ? en : s + MIN;
  const dLo = Math.max(-s0, ...grp.map(q => -q.s)), dHi = Math.min(d - ext(s0, L.end), ...grp.map(q => d - ext(q.s, q.e)));
  const tol = 7 / g.w * d;
  const near = v => { let best = null; for (const p of pts) if (Math.abs(p - v) <= tol && (best === null || Math.abs(p - v) < Math.abs(best - v))) best = p; return best; };
  const lane = bar.parentElement, tip = h('div', { class:'tl-tip' }), guide = h('div', { class:'tl-snap', hidden:true });
  lane.append(tip); g.tl.append(guide);
  const fmtS = v => v.toFixed(1).replace('.', ',') + 's';
  let moved = false;
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
    const dt = (ev.clientX - x0) / g.w * d; if (Math.abs(ev.clientX - x0) > 2) moved = true;
    if (!moved) return;
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
    else if (mode === 'l') { const f = fit(s0 + dt); L.start = clamp(f.v, 0, e0 - MIN); hit = L.start === f.v ? f.hit : null; }
    else { const f = fit(e0 + dt); L.end = clamp(f.v, s0 + MIN, d); hit = L.end === f.v ? f.hit : null; }
    // mesma diferença para todos os selecionados (mover ou esticar as bordas)
    const r3 = v => Math.round(v * 1000) / 1000;
    for (const q of grp) {
      if (mode === 'm') { q.o.start = r3(q.s + L.start - s0); if (q.e != null && q.e < d - .01) q.o.end = r3(q.e + L.start - s0); }
      else if (mode === 'l') q.o.start = r3(clamp(q.s + L.start - s0, 0, ext(q.s, q.e) - MIN));
      else { const ne = r3(clamp((q.e ?? d) + (L.end ?? d) - e0, q.s + MIN, d)); if (q.e != null || ne < d - .01) q.o.end = ne; }
    }
    show(hit);
    needs = true; // a agulha fica onde está
  };
  const done = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', key, true);
    bar.classList.remove('drag', 'hl', 'hr'); tip.remove(); guide.remove();
  };
  const up = () => { done(); if (moved) changed({ layers:true, props:true }); };
  // Esc devolve a barra para onde estava
  const key = ev => { if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); L.start = s0; L.end = end0; grp.forEach(q => { q.o.start = q.s; q.o.end = q.e; }); placeBar(bar, L); done(); needs = true; };
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
}
function renderMarks() {
  renderTimeline();
  const box = $('#marks'); box.innerHTML = '';
  for (const L of S.layers) if (L.type !== 'bg' && L.visible) box.append(h('i', { style:`left:calc(${(L.start / S.duration * 100).toFixed(2)}% - 1px);background:${TYPE_COLOR[L.type]}`, title:`${L.name} entra em ${L.start.toFixed(1)}s` }));
}

/* ------------ propriedades ------------ */
function fid(L, k) { return `f-${L.id}-${k}`; }
function field(label, ctl, forId, stack) { return h('div', { class:'field' + (stack ? ' stack' : '') }, [h('label', { for:forId, text:label }), ctl]); }
function rangeF(L, k, label, min, max, step, fmt = v => v, opts = {}) {
  const id = fid(L, k);
  // o número ao lado também é digitável; a escala da exibição (×100 em %, ×1 no resto) sai do próprio formato
  const num = v => parseFloat(String(fmt(v)).replace(',', '.'));
  let ref = max; if (!isFinite(num(ref))) ref = (min + max) / 2; if (!ref || !isFinite(num(ref))) ref = min + step;
  const scale = 10 ** Math.round(Math.log10(Math.abs(num(ref) / ref) || 1));
  const unit = (String(fmt(ref)).match(/[^\d.,\s-]+$/) || [''])[0];
  const out = h('input', { type:'text', class:'num', inputmode:'decimal', 'aria-label':`${label} (valor)`, value:fmt(L[k]) });
  const inp = h('input', { type:'range', id, min, max, step, value:L[k] });
  // tamanho, opacidade, ritmo etc. valem para todas as camadas do mesmo tipo selecionadas; posição e tempo ficam só na principal
  const set = v => {
    // posição: a seleção toda se move junto (mesmo deslocamento)
    if (k === 'x' || k === 'y') { const d = v - L[k]; for (const o of peersAny(L)) o[k] = o === L ? v : +clamp(o[k] + d, -.2, 1.2).toFixed(4); if (opts.onInput) opts.onInput(); changed(); return; }
    for (const o of (['start', 'end'].includes(k) ? [L] : ['speed', 'intensity', 'opacity'].includes(k) ? peersAny(L) : peersOf(L))) o[k] = v; if (opts.layout) RT.layout.clear(); if (opts.onInput) opts.onInput(); changed(); };
  inp.addEventListener('pointerdown', pushUndo);
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); out.value = fmt(L[k]); });
  if (opts.after) inp.addEventListener('change', opts.after);
  const shown = () => { const v = L[k] ?? max; return +(v * scale).toFixed(Math.max(0, -Math.floor(Math.log10(step * scale)) + 1)); };
  out.addEventListener('focus', () => { out.value = String(shown()).replace('.', ','); out.select(); });
  const apply = () => {
    const raw = parseFloat(out.value.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (isFinite(raw)) {
      let v = clamp(raw / scale, min, max); if (step >= 1) v = Math.round(v);
      if (v !== L[k]) { pushUndo(); set(v); inp.value = v; if (opts.after) opts.after(); }
    }
    out.value = fmt(L[k]);
  };
  out.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); out.blur(); }
    else if (e.key === 'Escape') { out.value = fmt(L[k]); out.dataset.skip = '1'; out.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseFloat(out.value.replace(',', '.')); if (!isFinite(cur)) return;
      const d = step * scale * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      out.value = String(+(clamp((cur + d) / scale, min, max) * scale).toFixed(4)).replace('.', ',');
      const v = clamp((cur + d) / scale, min, max); if (v !== L[k]) { pushUndo(); set(v); inp.value = v; }
    }
  });
  out.addEventListener('blur', () => { if (out.dataset.skip) { delete out.dataset.skip; out.value = fmt(L[k]); return; } apply(); });
  out.title = `Digite o valor${unit && unit !== 'pílula' ? ' em ' + unit : ''}. Setas ↑↓ ajustam, Shift vai de 10 em 10.`;
  return field(label, h('div', { class:'rng' }, [inp, out]), id);
}
// aceita "#1a2b3c", "1a2b3c", "abc", "#ABC", "rgb(1, 42, 28)"; devolve "#rrggbb" ou null
function parseHex(s) {
  s = String(s || '').trim();
  const m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => clamp(+n, 0, 255).toString(16).padStart(2, '0')).join('');
  s = s.replace(/[^0-9a-f]/gi, '');
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  else if (s.length === 8) s = s.slice(0, 6);
  return s.length === 6 ? '#' + s.toLowerCase() : null;
}
// Seletor de cor próprio: o do navegador abre em RGB; aqui o hex é sempre o primeiro campo.
function hexToHsv(c) {
  const n = parseInt(c.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
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
function colorButton(value, label, { onStart, onInput, cls = '' }) {
  let cur = value;
  const btn = h('button', { type:'button', class:'cpick ' + cls, 'aria-label':label, title:label, style:`background:${cur}` });
  btn.setColor = c => { cur = c; btn.style.background = c; };
  btn.addEventListener('click', () => {
    if (openPicker && openPicker._btn === btn) { closePicker(); return; }
    closePicker();
    let [hh, sat, v] = hexToHsv(cur);
    const sv = h('div', { class:'cp-sv' }, [h('i', { class:'cp-knob' })]);
    const hue = h('div', { class:'cp-hue' }, [h('i', { class:'cp-knob' })]);
    const hexIn = h('input', { type:'text', class:'cp-hex', maxlength:32, spellcheck:'false', 'aria-label':'Hex', title:'Cole ou digite o hex, com ou sem #' });
    const pop = h('div', { class:'cp-pop', role:'dialog', 'aria-label':label }, [
      h('div', { class:'cp-row' }, [h('span', { class:'cp-lbl', text:'HEX' }), h('span', { class:'hexwrap' }, [h('i', { text:'#' }), hexIn])]),
      sv, hue
    ]);
    pop._btn = btn;
    const paint = () => {
      const c = hsvToHex(hh, sat, v);
      sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,${hsvToHex(hh, 1, 1)})`;
      sv.firstChild.style.left = sat * 100 + '%'; sv.firstChild.style.top = (1 - v) * 100 + '%';
      hue.firstChild.style.left = hh / 360 * 100 + '%';
      hexIn.value = c.slice(1).toUpperCase();
      return c;
    };
    const emit = () => { const c = paint(); cur = c; btn.setColor(c); onInput(c); };
    const drag = (el, fn) => el.addEventListener('pointerdown', e => {
      e.preventDefault(); if (onStart) onStart(); el.setPointerCapture(e.pointerId);
      const mv = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)); emit(); };
      mv(e); el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', mv), { once:true });
    });
    drag(sv, (x, y) => { sat = x; v = 1 - y; });
    drag(hue, x => { hh = x * 360; });
    const commit = () => {
      const c = parseHex(hexIn.value);
      if (c && c !== cur) { if (onStart) onStart(); [hh, sat, v] = hexToHsv(c); cur = c; btn.setColor(c); onInput(c); }
      hexIn.value = cur.slice(1).toUpperCase(); paint();
    };
    hexIn.addEventListener('focus', () => hexIn.select());
    hexIn.addEventListener('paste', e => { const c = parseHex(e.clipboardData.getData('text/plain')); if (!c) return; e.preventDefault(); hexIn.value = c.slice(1); commit(); });
    hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); closePicker(); } else if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); } });
    hexIn.addEventListener('blur', commit);
    document.body.append(pop); openPicker = pop; paint();
    const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = clamp(r.left, 8, innerWidth - pw - 8) + 'px';
    pop.style.top = (r.bottom + 6 + ph > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
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
  const inp = colorButton(L[k], `${label} (seletor)`, { onStart:pushUndo, onInput:c => { setAll(c); hex.value = c.slice(1).toUpperCase(); changed(); } });
  inp.id = id;
  const hex = h('input', { type:'text', class:'hex', value:String(L[k]).replace('#', '').toUpperCase(), maxlength:32, spellcheck:'false', 'aria-label':`${label} (hex)`, title:'Cole ou digite o hex, com ou sem #' });
  const put = c => { setAll(c); inp.setColor(c); hex.value = c.slice(1).toUpperCase(); changed(); };
  const commit = () => { const c = parseHex(hex.value); if (c && c !== L[k]) { pushUndo(); put(c); } else hex.value = String(L[k]).replace('#', '').toUpperCase(); };
  hex.addEventListener('focus', () => hex.select());
  hex.addEventListener('paste', e => { const c = parseHex(e.clipboardData.getData('text/plain')); if (!c) return; e.preventDefault(); pushUndo(); put(c); });
  hex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } else if (e.key === 'Escape') { hex.value = String(L[k]).replace('#', '').toUpperCase(); hex.blur(); } });
  hex.addEventListener('blur', commit);
  const sws = allBrandColors().map(c => h('button', { class:'mini-sw', style:`background:${c}`, title:c, 'aria-label':`Usar ${c}`, onclick:() => { pushUndo(); put(c); } }));
  return field(label, h('div', { class:'colorctl' }, [inp, h('span', { class:'hexwrap' }, [h('i', { text:'#' }), hex]), ...sws]), id);
}
function selectF(L, k, label, opts, o = {}) {
  const id = fid(L, k);
  const sel = h('select', { id }, opts.map(([v, t]) => h('option', { value:v, text:t, selected:String(L[k]) === String(v) })));
  sel.addEventListener('change', () => { pushUndo(); for (const p of peersOf(L)) p[k] = o.num ? parseFloat(sel.value) : sel.value; RT.layout.clear(); changed({ props:!!o.props }); });
  return field(label, sel, id);
}
function segF(L, k, label, opts) {
  const wrap = h('div', { class:'segs' + (opts.every(o => String(o[1]).length <= 8) ? ' tight' : ''), role:'group', 'aria-label':label });
  const draw = () => { wrap.innerHTML = ''; opts.forEach(([v, t]) => wrap.append(h('button', { 'aria-pressed':String(L[k] === v), text:t, onclick:() => { pushUndo(); for (const o of peersOf(L)) o[k] = v; RT.layout.clear(); draw(); changed(); if (k === 'mode' || k === 'kind') renderProps(); } }))); };
  draw();
  return field(label, wrap, null, true);
}
function checkF(L, k, label) {
  const id = fid(L, k);
  const inp = h('input', { type:'checkbox', id, checked:!!L[k] });
  inp.addEventListener('change', () => { pushUndo(); for (const o of peersOf(L)) o[k] = inp.checked; RT.layout.clear(); changed(); if (k === 'stroke' || k === 'tint') renderProps(); });
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
  const wSel = h('select', { 'aria-label':'Peso do trecho selecionado' }, [h('option', { value:'', text:'Peso do trecho' }), ...WEIGHTS.map(([v, t]) => h('option', { value:v, text:`${t} ${v}` }))]);
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
  if (k === 'in') return q.type === 'text' ? TEXT_IN : BLOCK_IN[q.type] || [];
  if (k === 'out') return q.type === 'text' ? TEXT_OUT : BLOCK_OUT[q.type] || [];
  return IDLE_BY[q.type] || ['none'];
}
function presetGrid(L, k, keys, map, title) {
  const wrap = h('div', { class:'chips' });
  const lgo = logoOf(L), svgOK = lgo && lgo.isSvg && lgo.parts.length, penOK = lgo && lgo.pen;
  keys.forEach(key => {
    const P = map[key]; const needSvg = P.svg && L.type === 'logo';
    const off = L.type === 'logo' && (P.svg ? !svgOK : P.pen ? !penOK : false);
    const b = h('button', { class:'chip' + (off ? ' dim' : ''), 'aria-pressed':String(L[k] === key), title:off ? (P.svg ? 'Precisa de logo em SVG' : 'Precisa de logo em SVG ou PNG com fundo transparente') : P.label,
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
        wrap.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
        changed(); renderMarks();
        if (k === 'out') seekOut(L); else seekLayer(L);
      } }, [h('span', { text:P.label }), needSvg ? h('em', { text:'SVG' }) : null]);
    wrap.append(b);
  });
  return wrap;
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
  const head = h('section', { class:'sec' }, [
    h('div', { class:'lhead' }, [
      h('span', { class:'type-chip', style:`color:${TYPE_COLOR[L.type]}`, text:TYPE_LABEL[L.type] }),
      (() => { const i = h('input', { type:'text', id:fid(L, 'name'), value:L.name, 'aria-label':'Nome da camada' }); i.addEventListener('input', () => { L.name = i.value; renderLayers(); autosave(); }); return i; })(),
      L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Duplicar', html:ICONS.copy, onclick:() => duplicateLayer(L) }) : null,
      L.type !== 'bg' ? h('button', { class:'icon-btn', title:'Apagar camada (Delete)', html:ICONS.trash, onclick:() => deleteLayer(L) }) : null,
    ]),
  ]);
  if (L.type !== 'bg') box.append(alignBar());
  if (L.type !== 'bg' && pickedLayers().length > 1) box.append(scaleBar());
  box.append(head);

  if (L.type === 'bg') { box.append(bgProps(L)); return; }

  const tabs = h('div', { class:'tabs', role:'tablist' }, [['anim', 'Animação'], ['style', 'Conteúdo e estilo']].map(([k, t]) =>
    h('button', { role:'tab', 'aria-selected':String(propTab === k), text:t, onclick:() => { propTab = k; renderProps(); } })));
  head.append(tabs);

  if (propTab === 'anim') {
    const inKeys = L.type === 'text' ? TEXT_IN : BLOCK_IN[L.type];
    const outKeys = L.type === 'text' ? TEXT_OUT : BLOCK_OUT[L.type];
    const map = L.type === 'text' ? TP : BP;
    box.append(h('section', { class:'sec' }, [h('h3', { text:'Entrada' }), presetGrid(L, 'in', inKeys, map)]));
    box.append(h('section', { class:'sec' }, [h('h3', { text:'Enquanto está na tela' }), idleGrid(L)]));
    box.append(h('section', { class:'sec' }, [h('h3', {}, ['Saída', h('small', { text:(L.end ?? S.duration) >= S.duration - .01 ? 'no fim do vídeo' : `em ${(L.end).toFixed(1)}s` })]), presetGrid(L, 'out', outKeys, map)]));
    box.append(h('section', { class:'sec' }, [
      h('h3', { text:'Ritmo' }),
      rangeF(L, 'speed', 'Velocidade', .4, 6, .05, v => v.toFixed(2) + '×', { after:() => seekLayer(L) }),
      rangeF(L, 'intensity', 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%', { after:() => seekLayer(L) }),
      rangeF(L, 'start', 'Entra em', 0, S.duration - .2, .1, v => v.toFixed(1) + 's', { onInput:() => { if (L.end != null && L.end < L.start + .3) L.end = Math.min(S.duration, L.start + .3); renderMarks(); }, after:() => { renderLayers(); seekLayer(L); } }),
      rangeF(L, 'end', 'Sai em', .3, S.duration, .1, v => (v ?? S.duration).toFixed(1) + 's', { onInput:() => { if (L.end < L.start + .3) L.end = L.start + .3; }, after:() => { renderProps(); seekOut(L); } }),
    ]));
  } else {
    box.append(styleProps(L));
  }
}
function syncPosFields(L) {
  ['x', 'y'].forEach(k => { const i = document.getElementById(fid(L, k)); if (i) { i.value = L[k]; const o = i.parentElement.querySelector('output'); if (o) o.textContent = Math.round(L[k] * 100) + '%'; } });
}
function posFields(L) {
  return [rangeF(L, 'x', 'Horizontal', 0, 1, .005, v => Math.round(v * 100) + '%'), rangeF(L, 'y', 'Vertical', 0, 1, .005, v => Math.round(v * 100) + '%')];
}
function styleProps(L) {
  const sec = h('section', { class:'sec' }), put = (...xs) => sec.append(...xs.filter(Boolean));
  const px = v => Math.round(v) + 'px';
  // tipos misturados: só o que todos têm em comum (opacidade e posição)
  if (peersAny(L).some(o => o.type !== L.type)) {
    put(h('h3', { text:`${peersAny(L).length} elementos` }),
      h('p', { class:'hint', text:'Tipos diferentes: aqui ficam só as opções em comum. Escolha um tipo só para ver as demais.' }),
      rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'),
      h('h3', { text:'Posição (move todos juntos)' }),
      ...posFields(L));
    return sec;
  }
  if (L.type === 'text') {
    put(h('h3', { text:'Texto' }), richF(L, 'Texto (Enter quebra a linha)'), fontF(L),
      selectF(L, 'weight', 'Peso do texto', WEIGHTS.map(([v, t]) => [v, `${t} ${v}`]), { num:true, props:true }),
      h('h3', { text:'Tipografia' }),
      rangeF(L, 'size', 'Tamanho', 16, 400, 1, px, { layout:true }),
      rangeF(L, 'ls', 'Entre letras', -.08, .6, .005, v => v.toFixed(3) + 'em', { layout:true }),
      rangeF(L, 'lh', 'Entrelinha', .8, 1.6, .01, v => v.toFixed(2), { layout:true }),
      rangeF(L, 'maxW', 'Largura máx.', .3, 1, .01, v => Math.round(v * 100) + '%', { layout:true }),
      segF(L, 'align', 'Alinhamento', [['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']]),
      h('div', { class:'checks' }, [checkF(L, 'upper', 'Caixa alta'), checkF(L, 'italic', 'Itálico')]),
      h('h3', { text:'Aparência' }),
      colorF(L, 'color', 'Cor'),
      L.in === 'highlight' || L.out === 'highlight' ? colorF(L, 'hl', 'Marca-texto') : null,
      rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'),
      h('h3', { text:'Posição' }),
      ...posFields(L));
  } else if (L.type === 'cta') {
    put(h('h3', { text:'Texto' }), textF(L, 'text', 'Texto do botão'), fontF(L),
      selectF(L, 'weight', 'Peso', [[400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extrabold']], { num:true }),
      rangeF(L, 'size', 'Tamanho', 16, 120, 1, px),
      h('h3', { text:'Forma' }),
      rangeF(L, 'radius', 'Arredondado', 0, 999, 1, v => v >= 999 ? 'pílula' : px(v)),
      rangeF(L, 'padX', 'Folga lateral', 10, 160, 1, px), rangeF(L, 'padY', 'Folga vertical', 6, 80, 1, px),
      h('h3', { text:'Cores' }),
      colorF(L, 'bg', 'Fundo'), colorF(L, 'color', 'Texto'),
      L.in === 'line' || L.out === 'line' ? colorF(L, 'lineColor', 'Cor da linha') : null,
      h('h3', { text:'Posição' }),
      ...posFields(L));
  } else if (L.type === 'logo') {
    put(
      h('h3', { text:'Logo' }),
      h('p', { class:'hint', text:L.svg ? 'Este SVG é só desta camada. Tem as mesmas animações do logo.' : 'O arquivo do logo é trocado em Marca, na coluna da esquerda.' }),
      rangeF(L, 'size', 'Tamanho', .04, .95, .005, v => Math.round(v * 100) + '%'),
      rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'),
      (L.tintColor || (L.tintColor = S.brand.colors[1]), h('h3', { text:'Cor do logo' })),
      checkF(L, 'tint', 'Pintar o logo de uma cor só'),
      L.tint ? colorF(L, 'tintColor', 'Cor') : null,
      L.tint ? h('p', { class:'hint', text:'Troca todas as cores do logo por esta. Serve para logo preto, branco ou de outra marca.' }) : null,
      (L.in === 'draw' || L.out === 'draw' || L.in === 'assemble' || L.out === 'assemble') ? h('h3', { text:'Traço' }) : null,
      (L.in === 'draw' || L.out === 'draw' || L.in === 'assemble' || L.out === 'assemble') ? checkF(L, 'drawOrig', 'Usar as cores originais do SVG') : null,
      (L.in === 'draw' || L.out === 'draw' || L.in === 'assemble' || L.out === 'assemble') ? rangeF(L, 'drawWidth', 'Espessura', 1, 16, .5, v => v + 'px') : null,
      (L.in === 'draw' || L.out === 'draw' || L.in === 'assemble' || L.out === 'assemble') && !L.drawOrig ? colorF(L, 'drawColor', 'Cor do traço') : null,
      L.in === 'line' || L.out === 'line' ? h('h3', { text:'Linha' }) : null,
      L.in === 'line' || L.out === 'line' ? colorF(L, 'lineColor', 'Cor da linha') : null,
      h('h3', { text:'Posição' }),
      ...posFields(L));
  } else if (L.type === 'shape') {
    const pct = v => Math.round(v * 100) + '%', k = L.kind;
    put(h('h3', { text:'Forma' }),
      segF(L, 'kind', 'Tipo', Object.entries(SHAPE_KINDS)),
      k === 'custom' ? textF(L, 'd', 'Caminho SVG (atributo d do <path>)', true) : null,
      k === 'custom' ? h('p', { class:'hint', text:'Cole o d de qualquer path (Figma, Illustrator, Inkscape). Ele é vetorial: escala sem perder qualidade e "Desenhar traço" percorre o contorno.' }) : null,
      rangeF(L, 'size', k === 'line' || k === 'custom' ? 'Tamanho' : 'Largura', .03, 1.6, .005, pct),
      resizable(L) ? rangeF(L, 'mh', 'Altura', .03, 2.6, .005, pct) : null,
      k === 'rect' ? rangeF(L, 'radius', 'Cantos', 0, 600, 1, px) : null,
      k === 'polygon' || k === 'star' ? rangeF(L, 'points', 'Pontas', 3, 12, 1, v => String(Math.round(v))) : null,
      k === 'star' ? rangeF(L, 'inner', 'Profundidade', .1, .95, .01, pct) : null,
      rangeF(L, 'rot', 'Rotação', -180, 180, 1, v => Math.round(v) + '°'),
      k !== 'line' ? h('h3', { text:'Cor (mesmas animações do fundo)' }) : null);
    if (k !== 'line') fillProps(L, sec);
    put(h('h3', { text:k === 'line' ? 'Traço' : 'Contorno' }),
      k !== 'line' ? checkF(L, 'stroke', 'Contorno') : null,
      k === 'line' || L.stroke ? rangeF(L, 'strokeW', 'Espessura', 1, 80, .5, v => v + 'px') : null,
      k === 'line' || L.stroke ? colorF(L, 'strokeColor', 'Cor do traço') : null,
      L.in === 'draw' && !L.stroke && k !== 'line' ? h('p', { class:'hint', text:'"Desenhar traço" usa a cor 2 como traço de apoio. Ative Contorno para mantê-lo.' }) : null,
      h('h3', { text:'Aparência' }),
      rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, pct),
      h('h3', { text:'Posição' }),
      ...posFields(L));
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
      uploadF(L.src ? 'Trocar imagem' : 'Enviar imagem', 'image/*', async f => { pushUndo(); L.src = await readAs(f, 'readAsDataURL'); await getImage(L.src); changed({ props:true }); }),
      h('h3', { text:'Máscara' }),
      field('Forma', maskSeg, null),
      rangeF(L, 'size', masked(L) ? 'Largura' : 'Tamanho', .03, 1.6, .005, pct),
      masked(L) ? rangeF(L, 'mh', 'Altura', .03, 2.6, .005, pct) : null,
      L.mask !== 'circle' ? rangeF(L, 'radius', 'Cantos', 0, 600, 1, px) : null,
      h('h3', { text:'Imagem dentro da máscara' }),
      rangeF(L, 'zoom', 'Zoom', .2, 5, .01, v => v.toFixed(2) + '×'),
      rangeF(L, 'ix', 'Horizontal', -1, 1, .005, pct),
      rangeF(L, 'iy', 'Vertical', -1, 1, .005, pct),
      h('div', { class:'row' }, [h('button', { class:'btn small', text:'Preencher a máscara', onclick:() => { pushUndo(); L.zoom = 1; L.ix = 0; L.iy = 0; changed({ props:true }); } })]),
      h('p', { class:'hint', text:'A imagem nunca distorce. No palco: a alça do canto aumenta tudo, as das laterais mudam a máscara, a roda do mouse dá zoom na imagem e Alt + arrastar move a imagem dentro.' }),
      h('h3', { text:'Aparência' }),
      rangeF(L, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'),
      L.in === 'line' || L.out === 'line' ? colorF(L, 'lineColor', 'Cor da linha') : null,
      h('h3', { text:'Posição' }),
      ...posFields(L),
      checkF(L, 'keepIn', 'Manter dentro da margem'),
      h('p', { class:'hint', text:'Precisa da margem ligada. Se a imagem não couber, ela encolhe.' }));
  }
  return sec;
}
function bgProps(L) {
  const sec = h('section', { class:'sec' }, [h('h3', { text:'Fundo' })]);
  fillProps(L, sec);
  return sec;
}
// cor animada: o mesmo motor do fundo, também usado nas formas
function fillProps(L, sec) {
  sec.append(segF(L, 'mode', 'Estilo', Object.entries(BG_MODES)));
  const lbl = { mesh:['Base', 'Mancha 1', 'Mancha 2', 'Mancha 3'], linear:['Cor 1', 'Cor 2', 'Cor 3'], spot:['Base', 'Luz'], solid:['Cor'], image:[] }[L.mode] || [];
  lbl.forEach((t, i) => sec.append(colorF(L, 'c' + (i + 1), t)));
  if (L.mode === 'image') {
    sec.append(uploadF(L.src ? 'Trocar imagem' : 'Enviar imagem de fundo', 'image/*', async f => { pushUndo(); L.src = await readAs(f, 'readAsDataURL'); await getImage(L.src); changed(); }));
    sec.append(rangeF(L, 'darken', 'Escurecer', 0, .85, .01, v => Math.round(v * 100) + '%'));
  }
  if (L.mode === 'linear') sec.append(rangeF(L, 'angle', 'Ângulo', 0, 360, 1, v => Math.round(v) + '°'));
  if (L.mode !== 'solid') sec.append(rangeF(L, 'motion', L.mode === 'image' ? 'Zoom lento' : 'Movimento', 0, 3, .05, v => v.toFixed(2) + '×'));
  sec.append(rangeF(L, 'grain', 'Granulado', 0, .4, .01, v => Math.round(v * 100) + '%'));
}
function renderAll() { renderFormats(); renderAdds(); renderBrand(); renderLayers(); renderProps(); $('#loop').checked = S.loop !== false; syncHist(); }

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
$('#dur').addEventListener('change', e => { pushUndo(); setDuration(parseFloat(e.target.value) || S.duration); e.target.value = S.duration; });
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type) || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave().then(() => toast('Tudo salvo. O Mola salva sozinho a cada mudança.')); }
  // espaço sempre toca/pausa (mesmo com um botão focado), menos enquanto digita
  if (e.code === 'Space' && !typing) { e.preventDefault(); if (tag === 'button') e.target.blur(); playing ? pause() : play(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && !typing) { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
  if (e.key === 'Escape') closeMenu();
  // atalhos do Figma: Delete / Backspace apagam a camada selecionada
  if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) { const L = selL(); if (L && L.type !== 'bg') { e.preventDefault(); closeMenu(); deleteLayer(L); } }
});
/* ------------ adicionar elementos prontos ------------ */
const ADD_KINDS = [
  { id:'title', label:'Título', gl:'<b style="font:600 20px serif">Aa</b>', mk:(B, F) => mkText('title', { name:'Título', text:'Seu título aqui', font:F[0], weight:500, size:104, lh:1.02, y:.42, in:'lineMask' }) },
  { id:'sub', label:'Subtítulo', gl:'<span style="font-size:13px">Aa</span>', mk:(B, F) => mkText('sub', { name:'Subtítulo', text:'Uma frase curta de apoio', font:F[1], weight:500, size:40, opacity:.82, y:.56, in:'blurChar' }) },
  { id:'kicker', label:'Chamada', gl:'<span style="font:700 9px var(--f-mono);letter-spacing:.2em">NOVO</span>', mk:(B, F) => mkText('kicker', { name:'Chamada', text:'NOVIDADE', font:F[1], weight:700, size:34, ls:.4, color:B.colors[2], y:.3, in:'track' }) },
  { id:'big', label:'Número', gl:'<b style="font-size:17px">%</b>', mk:(B, F) => mkText('big', { name:'Número grande', text:'-30%', font:F[2], weight:800, size:240, lh:1, y:.38, in:'counter', idle:'float' }) },
  { id:'hl', label:'Destaque', gl:'<span style="background:var(--accent);color:var(--bg);padding:1px 4px;border-radius:2px;font-size:11px;font-weight:700">ab</span>', mk:(B, F) => mkText('offer', { name:'Destaque', text:'frete grátis hoje', font:F[1], weight:700, size:56, color:B.colors[0], hl:B.colors[2], y:.6, in:'highlight' }) },
  { id:'impact', label:'Impacto', gl:'<b style="font-size:15px;font-weight:900">AA</b>', mk:(B, F) => mkText('k1', { name:'Frase de impacto', text:'Sem pressa.', font:F[2], weight:800, size:132, upper:true, lh:1, y:.5, in:'stamp' }) },
  { id:'image', label:'Imagem', gl:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="18" height="14" rx="2"/><path d="M1 12l5-5 4 4 3-3 6 6"/><circle cx="14" cy="5" r="1.5"/></svg>', mk:() => mkImage({ y:.42, idle:'float' }) },
  { id:'logo', label:'Logo', gl:'<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="7.5"/><path d="M5 11c2-5 6-5 8 0"/></svg>', mk:() => { const pen = RT.logo && RT.logo.pen; const alone = !S.layers.some(l => l.type !== 'bg'); return mkLogo(alone ? 'logo' : 'logoSmall', { y:alone ? .42 : .12, size:alone ? .36 : .14, in:pen ? 'handwrite' : 'spring', inDur:pen ? BP.handwrite.dur : BP.spring.dur, idle:'shine' }); } },
  { id:'svg', label:'SVG', gl:'<b style="font:700 10px var(--f-mono)">&lt;/&gt;</b>', mk:null },
  { id:'shape', label:'Forma', gl:'<svg width="20" height="18" viewBox="0 0 20 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="6" width="10" height="10" rx="2"/><circle cx="13" cy="6" r="5"/></svg>', mk:() => mkShape({ y:.5 }) },
  { id:'cta', label:'Botão', gl:'<span style="border:1.5px solid currentColor;border-radius:9px;padding:1px 7px;font-size:10px;font-weight:700">ir</span>', mk:() => mkCta({ y:.74, in:'pop', idle:'pulse' }) },
];
// momento: onde você deixou a agulha (se a moveu de propósito), senão logo depois do último elemento
function nextStart() {
  if (RT.userSeek && T > .05) return Math.min(T, S.duration - .5);
  const els = S.layers.filter(l => l.type !== 'bg');
  if (!els.length) return .2;
  return Math.min(Math.max(...els.map(l => l.start)) + .6, S.duration - .5);
}
// altura: a padrão do tipo, descendo se já houver algo ali ao mesmo tempo
function freeY(y, st) {
  const busy = S.layers.filter(l => l.type !== 'bg' && l.visible && l.start <= st + .1 && (l.end ?? S.duration) > st);
  const free = v => !busy.some(l => Math.abs(l.y - v) < .07);
  for (let k = 0; k <= 8; k++) for (const v of [y + k * .05, y - k * .05]) if (v >= .08 && v <= .9 && free(v)) return v;
  return y;
}
function addLayer(L, opts = {}) {
  pushUndo();
  const st = opts.start ?? nextStart();
  L.start = st; L.end = S.duration;
  if (opts.x != null) { L.x = opts.x; L.y = opts.y; } else L.y = freeY(L.y, st);
  S.layers.push(L); select(L.id); propTab = 'style'; renderProps(); changed({ layers:true }); seekLayer(L); RT.userSeek = false;
  return L;
}
function renderAdds() {
  const box = $('#adds'); box.innerHTML = '';
  for (const k of ADD_KINDS) box.append(h('button', { class:'add', title:'Adicionar ' + k.label.toLowerCase(), onclick:() => {
    if (k.id === 'image') { $('#imgFile').click(); return; }
    if (k.id === 'svg') { $('#svgFile').click(); return; }
    addLayer(k.mk(S.brand, S.brand.fonts));
  } }, [h('span', { class:'gl', html:k.gl }), h('span', { text:k.label })]));
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
async function addSvgText(text, name, pos) {
  let svg, lg;
  try { svg = { kind:'svg', text:normalizeSvg(text), name:name || 'SVG' }; lg = await parseLogo(svg); LGC.set(svg.text, lg); if (!lg.parts.length && !lg.pen) throw new Error('Não achei formas nesse SVG'); }
  catch (e) { toast(e.message || 'Não consegui ler esse SVG', 3200); return; }
  const pen = !!lg.pen;
  addLayer(mkLogo('logoSmall', { name:svg.name, svg, y:.42, size:.4, in:pen ? 'handwrite' : 'draw', inDur:pen ? BP.handwrite.dur : BP.draw.dur, idle:'none' }), pos || {});
  toast('SVG adicionado');
}
async function addImageFile(f, pos) {
  if (isSvgFile(f)) { addSvgText(await readAs(f, 'readAsText'), f.name && f.name.replace(/\.[^.]+$/, ''), pos); return; }
  if (!isImg(f)) return;
  const src = await readAs(f, 'readAsDataURL'); await getImage(src);
  addLayer(mkImage({ y:.42, idle:'float', src, name:f.name ? f.name.replace(/\.[^.]+$/, '') : 'Imagem' }), pos || {});
  toast('Imagem adicionada');
}
$('#imgFile').addEventListener('change', e => { addImageFile(e.target.files[0]); e.target.value = ''; });
$('#svgFile').addEventListener('change', e => { addImageFile(e.target.files[0]); e.target.value = ''; });
{
  const box = $('#stageBox'), dz = $('#dropzone');
  const hasImg = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file' && /^image\//.test(i.type));
  box.addEventListener('dragover', e => { if (!hasImg(e)) return; e.preventDefault(); dz.hidden = false; });
  box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) dz.hidden = true; });
  box.addEventListener('drop', e => {
    dz.hidden = true; const f = [...e.dataTransfer.files].find(isImg); if (!f) return;
    e.preventDefault();
    const r = $('#cv').getBoundingClientRect(), inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    addImageFile(f, inside ? { x:clamp((e.clientX - r.left) / r.width), y:clamp((e.clientY - r.top) / r.height) } : null);
  });
  document.addEventListener('paste', e => {
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    const f = [...(e.clipboardData?.files || [])].find(isImg); if (f) { e.preventDefault(); addImageFile(f); return; }
    const t = (e.clipboardData?.getData('text/plain') || '').trim(); if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t)) { e.preventDefault(); addSvgText(t, 'SVG'); }
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
[...new Set(GOOGLE_SUGGEST)].forEach(f => $('#gfonts').append(h('option', { value:f })));
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
$('#gfont').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(addGoogle, 0); } });
$('#gfont').addEventListener('input', e => { if (e.inputType === 'insertReplacementText' || (!e.inputType && GOOGLE_SUGGEST.includes(e.target.value))) setTimeout(addGoogle, 0); });
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
$('#copyBtn').onclick = saveAsCopy;
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveAsCopy(); }
});
{
  const fn = $('#fileName');
  fn.addEventListener('keydown', e => { if (e.key === 'Enter') fn.blur(); if (e.key === 'Escape') { fn.value = FILES.name; fn.blur(); } });
  fn.addEventListener('blur', () => { const v = fn.value.trim(); if (v && v !== FILES.name) { FILES.name = v; showFileName(); autosave(); } else fn.value = FILES.name; });
}
// antes de fechar a aba ou trocar de janela, grava o que estiver pendente
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) flushSave(); });
addEventListener('beforeunload', e => { if (saveT || saving) { flushSave(); e.preventDefault(); } });
$('#jsonOut').onclick = () => saveFile(JSON.stringify(S), `${FILES.name.replace(/[\\/:*?"<>|]+/g, '-')}.json`);
$('#jsonIn').onclick = () => $('#jsonFile').click();
$('#jsonFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const st = JSON.parse(await readAs(f, 'readAsText')); await loadState(st, f.name.replace(/\.json$/i, '')); toast('Projeto importado como arquivo novo'); } catch (err) { toast('Não consegui ler esse .json'); }
  e.target.value = '';
});

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
  DB.set('currentId', FILES.id); showFileName(); setSaveState('Salvo');
  RT.selected = S.layers.find(l => l.type === 'logo')?.id || S.layers[1]?.id || S.layers[0]?.id;
  renderAll(); updPlay(); fitStage();
  requestAnimationFrame(tick);
  await refreshLogo();
  S.layers.forEach(l => l.src && getImage(l.src));
  ensureFonts();
  pause(); T = heroTime(); needs = true;
  if (fresh) autosave();
})();
