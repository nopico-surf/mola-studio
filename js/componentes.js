/* ============================================================
   Componentes: o padrão de cada elemento de "Adicionar" (título, botão…)
   Carregado antes do app.js: só declara; usa S, h, mkText, rangeF etc. na hora da chamada.

   S.brand.comps[id] = o que mudou em relação ao padrão de fábrica (COMP_DEF[id].p).
   Valor ligado à marca é uma referência: '@f0'..'@f2' = fonte da marca (Título, Texto, Impacto),
   '@cN' = cor N da marca (B.colors), '@cN:aa' = a mesma cor com outra opacidade (aa = hex).
   Ligado acompanha a marca quando ela muda; valor solto (nome de fonte, #hex) fica fixo.
   Inserir sempre parte do padrão; mexer no elemento depois não muda o padrão.
   ============================================================ */
const COMP_DEF = {
  title:  { type:'text', role:'title', label:'Título', y:.42, p:{ text:'Seu título aqui', font:'@f0', weight:500, size:104, lh:1.02, color:'@c1', hl:'@c2', in:'lineMask' } },
  sub:    { type:'text', role:'sub', label:'Subtítulo', y:.56, p:{ text:'Uma frase curta de apoio', font:'@f1', weight:500, size:40, opacity:.82, color:'@c1', hl:'@c2', in:'blurChar' } },
  kicker: { type:'text', role:'kicker', label:'Chamada', y:.3, p:{ text:'NOVIDADE', font:'@f1', weight:700, size:34, ls:.4, color:'@c2', hl:'@c2', in:'track' } },
  big:    { type:'text', role:'big', label:'Número', name:'Número grande', y:.38, p:{ text:'-30%', font:'@f2', weight:800, size:240, lh:1, color:'@c1', hl:'@c2', in:'counter', idle:'float' } },
  hl:     { type:'text', role:'offer', label:'Destaque', y:.6, p:{ text:'frete grátis hoje', font:'@f1', weight:700, size:56, color:'@c0', hl:'@c2', in:'highlight' } },
  impact: { type:'text', role:'k1', label:'Impacto', name:'Frase de impacto', y:.5, p:{ text:'Sem pressa.', font:'@f2', weight:800, size:132, upper:true, lh:1, color:'@c1', hl:'@c2', in:'stamp' } },
  cta:    { type:'cta', role:'cta', label:'Botão', y:.74, p:{ text:'Peça agora  →', font:'@f1', weight:700, size:40, color:'@c0', bg:'@c2', lineColor:'@c2', in:'pop', idle:'pulse' } },
  // sizeA/sizeS = largura do logo sozinho no quadro / com outros elementos (fração da largura); viram L.size ao inserir
  logo:   { type:'logo', label:'Logo', p:{ sizeA:.36, sizeS:.14, drawColor:'@c2', lineColor:'@c2', tintColor:'@c1', idle:'shine' } },
  image:  { type:'image', label:'Imagem', y:.42, p:{ idle:'float', lineColor:'@c2' } },
  shape:  { type:'shape', label:'Forma', y:.5, p:{ c1:'@c2', c2:'@c0', c3:'@c3', c4:'@c4', strokeColor:'@c1' } },
  // quadro e cena (pedido do usuário: margem, fundo e o resto que faz sentido). Fundo, margem e formato valem para o arquivo novo
  bg:     { type:'bg', label:'Fundo', grp:'Quadro', p:{ mode:'mesh', c1:'@c0', c2:'@c3', c3:'@c2', c4:'@c4', motion:1, angle:135, darken:.25, grain:.08 } },
  margin: { type:'margin', label:'Margem', grp:'Quadro', p:{ on:true, top:64, right:64, bottom:64, left:64 } },
  file:   { type:'file', label:'Formato e tempo', grp:'Quadro', p:{ format:'4x5', duration:8, fps:30, loop:true, slides:1 } },
  fx:     { type:'fx', label:'Transição', pl:'transições', fem:true, grp:'Cena', p:{ fx:'bars', intensity:.5, opacity:1, c1:'@c2', c2:'@c1', c3:'@c3' } },
  camera: { type:'camera', label:'Câmera', fem:true, grp:'Cena', p:{ cam:'push', intensity:.5, speed:1 } },
};
COMP_DEF.cta.pl = 'botões'; COMP_DEF.image.pl = 'imagens'; COMP_DEF.title.pl = 'títulos'; COMP_DEF.sub.pl = 'subtítulos'; COMP_DEF.big.pl = 'números';
const compPl = id => COMP_DEF[id].pl || COMP_DEF[id].label.toLowerCase() + 's';
// não são camadas: só o arquivo (margem, formato/tempo)
const COMP_FILE = new Set(['margin', 'file']);
const compSkip = (id, k) => COMP_SKIP.has(k) && !(id === 'bg' && k === 'src'); // imagem do fundo entra no padrão (é mídia, não pesa)
const FONT_SLOTS = ['Título', 'Texto', 'Impacto'];
// papel antigo (roteiros, preço) → componente, para "Usar como padrão" em elementos que não vieram de Adicionar
const ROLE_COMP = { title:'title', brand:'title', sub:'sub', kicker:'kicker', tag:'kicker', big:'big', offer:'hl', k1:'impact', k2:'impact', k3:'impact', cta:'cta', logo:'logo', logoSmall:'logo', image:'image', shape:'shape' };
// o que é do elemento e não do estilo: não entra no padrão
const COMP_SKIP = new Set(['id', 'type', 'role', 'name', 'comp', 'start', 'end', 'x', 'y', 'fpos', 'grp', 'locked', 'visible', 'flowFree', 'fsz',
  'text', 'runs', 'src', 'video', 'vdur', 'vIn', 'vOut', 'cut', 'svg', 'zoom', 'ix', 'iy']);

const compsOf = () => (S.brand.comps ||= {});
const compCustom = id => !!(S.brand.comps && S.brand.comps[id] && Object.keys(S.brand.comps[id]).length);
const compRaw = id => ({ ...COMP_DEF[id].p, ...(S.brand.comps && S.brand.comps[id]) });
function brandRef(v) {
  if (typeof v !== 'string' || v[0] !== '@') return v;
  const B = S.brand, m = /^@([fc])(\d+)(?::([0-9a-f]{2}))?$/i.exec(v); if (!m) return v;
  if (m[1] === 'f') return B.fonts[+m[2]] ?? B.fonts[1];
  const c = B.colors[+m[2]] ?? B.colors[1];
  return m[3] ? withA(c, parseInt(m[3], 16) / 255) : c;
}
function compProps(id) { const o = compRaw(id); for (const k in o) o[k] = brandRef(o[k]); return o; }
// valor solto → referência à marca, quando bate com uma fonte/cor dela (hint = a referência que o padrão já usava, desempata)
function toBrandRef(k, v, hint) {
  if (typeof v !== 'string') return v;
  const B = S.brand, hm = /^@[fc](\d+)/.exec(hint || '');
  if (k === 'font') {
    if (hm && hint[1] === 'f' && B.fonts[+hm[1]] === v) return hint.slice(0, 3);
    const i = B.fonts.indexOf(v); return i >= 0 ? '@f' + i : v;
  }
  const c = /^#[0-9a-f]{3,8}$/i.test(v) && parseHex(v); if (!c) return v;
  const rgb = x => (parseHex(x) || '').slice(0, 7);
  const idx = B.colors.map((x, i) => rgb(x) === c.slice(0, 7) ? i : -1).filter(i => i >= 0);
  if (!idx.length) return v;
  const i = hm && hint[1] === 'c' && idx.includes(+hm[1]) ? +hm[1] : idx[0];
  return Math.abs(colA(B.colors[i]) - colA(c)) < .003 ? '@c' + i : '@c' + i + ':' + Math.round(colA(c) * 255).toString(16).padStart(2, '0');
}
// que componente esse elemento é (para "Usar como padrão" e "Aplicar o padrão")
function compKindOf(L) {
  if (!L || (L.type === 'image' && L.video) || (L.type === 'logo' && L.svg)) return null;
  if (L.type === 'bg' || L.type === 'fx' || L.type === 'camera') return L.type;
  const id = COMP_DEF[L.comp] ? L.comp : ROLE_COMP[L.role];
  return id && COMP_DEF[id].type === L.type ? id : null;
}
// o elemento novo, já com o padrão (marca resolvida)
function mkComp(id) {
  if (COMP_FILE.has(id)) return compProps(id);
  const d = COMP_DEF[id], o = { name:d.name || d.label, comp:id };
  if (d.type === 'bg') return mkBg(Object.assign(o, compProps(id)));
  if (d.type === 'fx' || d.type === 'camera') return base(d.type, d.type, { in:'cut', out:'cut', inDur:0, outDur:0, intensity:.5, speed:1 }, Object.assign(o, compProps(id)));
  if (d.y != null) o.y = d.y;
  let role = d.role;
  if (d.type === 'logo') { // sozinho no quadro = logo grande; com outros = logo pequeno no topo. Escreve com a caneta se o logo permitir
    const pen = RT.logo && RT.logo.pen, alone = !S.layers.some(l => l.type !== 'bg');
    role = alone ? 'logo' : 'logoSmall';
    Object.assign(o, { y:alone ? .42 : .12, in:pen ? 'handwrite' : 'spring', inDur:pen ? BP.handwrite.dur : BP.spring.dur });
  }
  const p = compProps(id);
  if (d.type === 'logo') { o.size = role === 'logo' ? p.sizeA : p.sizeS; delete p.sizeA; delete p.sizeS; }
  if (p.in && p.inDur == null) delete o.inDur; // preset trocado no padrão: duração do preset
  Object.assign(o, p);
  return d.type === 'text' ? mkText(role, o) : d.type === 'cta' ? mkCta(o) : d.type === 'logo' ? mkLogo(role, o) : d.type === 'image' ? mkImage(o) : mkShape(o);
}
// o estilo de um elemento vira o padrão (fonte/cor que batem com a marca ficam ligadas a ela)
function compCapture(L, id) {
  const raw = compRaw(id), out = {};
  for (const k in L) {
    if (compSkip(id, k) || k[0] === '_' || L[k] === undefined || typeof L[k] === 'function') continue;
    const v = L[k] && typeof L[k] === 'object' ? JSON.parse(JSON.stringify(L[k])) : L[k];
    out[k] = toBrandRef(k, v, raw[k]);
  }
  // tamanho do logo: vai para o de sozinho ou o de com outros, conforme o papel do selecionado
  if (COMP_DEF[id].type === 'logo') { if (out.size > 0) out[L.role === 'logo' ? 'sizeA' : 'sizeS'] = out.size; delete out.size; delete out.drawOrig; }
  // guarda só o que difere da fábrica (o resto continua seguindo a fábrica e a marca)
  const fac = COMP_DEF[id].p, keep = S.brand.comps && S.brand.comps[id];
  if (S.brand.comps) delete S.brand.comps[id];
  const L0 = mkComp(id);
  if (keep) S.brand.comps[id] = keep;
  const off = !strokeOn(L); // os campos do contorno ficam na camada mesmo desligado (o painel preenche): sem contorno, não contam
  for (const k in out) {
    if ((k === 'sizeA' || k === 'sizeS') && out[k] === raw[k]) { delete out[k]; continue; }
    if (L0[k] === undefined && (!out[k] || out[k] === 'none' || off && /^stroke[A-Z]/.test(k))) { delete out[k]; continue; }
    const same = JSON.stringify(brandRef(out[k])) === JSON.stringify(L0[k]);
    if (same && (out[k] === fac[k] || !(typeof fac[k] === 'string' && fac[k][0] === '@'))) delete out[k];
  }
  return out;
}
// margem e formato/tempo: o do arquivo aberto vira o padrão (só o que difere da fábrica)
function compFileNow(id) {
  if (id === 'margin') return marginSides();
  return { format:baseFmt(), duration:S.duration, fps:S.fps || 30, loop:S.loop !== false, slides:slides() };
}
function compFromFile(id) {
  const now = compFileNow(id), fac = COMP_DEF[id].p, out = {};
  for (const k in fac) if (now[k] !== undefined && now[k] !== fac[k]) out[k] = now[k];
  pushUndo(); compsOf()[id] = out; autosave(); renderComps();
  toast(id === 'margin' ? 'Arquivo novo entra com esta margem' : 'Arquivo novo entra com este formato e tempo', 4000);
}
// arquivo novo: formato, tempo e margem do padrão (o fundo já vem de mkComp('bg'), no roteiro "Do zero")
function compNewFile() {
  const f = compProps('file'), m = compProps('margin'), n = v => Math.max(0, +v || 0);
  if (FORMATS[f.format]) S.format = f.format;
  if (FPS_OPTS.includes(+f.fps)) S.fps = +f.fps;
  S.loop = f.loop !== false;
  if (f.slides > 1) S.slides = Math.min(SLIDES_MAX, Math.round(f.slides)); else delete S.slides;
  S.margin = { on:!!m.on, top:n(m.top), right:n(m.right), bottom:n(m.bottom), left:n(m.left) };
  const d = clamp(+f.duration || 8, 2, 60); S.duration = d;
  for (const L of S.layers) L.end = d;
}
// a margem do padrão num estado (o aberto ou outro arquivo)
function compMarginTo(st) { const m = compProps('margin'), n = v => Math.max(0, +v || 0); st.margin = { on:!!m.on, top:n(m.top), right:n(m.right), bottom:n(m.bottom), left:n(m.left) }; }
function compFromLayer(L, id = compKindOf(L)) {
  if (!L || !id) return;
  pushUndo();
  const keepText = compsOf()[id] && compsOf()[id].text;
  compsOf()[id] = compCapture(L, id);
  if (keepText != null) compsOf()[id].text = keepText;
  autosave(); renderComps();
  toast(`"${COMP_DEF[id].label}" agora entra com esse estilo`, 5000, { label:'Editar', fn:() => openComps(id) });
}
// o padrão de volta num elemento que já está no arquivo (texto, posição e tempo ficam)
function compApply(ls, id, D = S.duration) { // D = duração do arquivo dessas camadas
  const p = compProps(id); delete p.text;
  const M = COMP_DEF[id].type === 'text' ? TP : BP, sz = COMP_DEF[id].type === 'logo' && { A:p.sizeA, S:p.sizeS };
  if (sz) { delete p.sizeA; delete p.sizeS; }
  for (const L of ls) {
    const fx0 = L.fx;
    Object.assign(L, p);
    if (sz) L.size = L.role === 'logo' ? sz.A : sz.S; // logo grande (sozinho) ou pequeno (com outros)
    if (p.in && compRaw(id).inDur == null && M[p.in]) L.inDur = M[p.in].dur;
    // outra transição: mantém o meio e usa a duração dela (como no painel)
    if (L.type === 'fx' && L.fx !== fx0 && FXS[L.fx] && FXS[L.fx].dur) {
      const mid = (L.start + (L.end ?? D)) / 2, d = FXS[L.fx].dur;
      L.start = +clamp(mid - d / 2, 0, Math.max(0, D - d)).toFixed(2); L.end = +(L.start + d).toFixed(2);
    }
    L.comp = id;
  }
  RT.layout.clear();
}
function compResetAll() {
  const ids = Object.keys(S.brand.comps || {}); if (!ids.length) return;
  pushUndo(); S.brand.comps = {}; autosave(); renderComps();
}

/* ------------ Marca → Componentes (coluna da esquerda) ------------ */
function renderComps() {
  const box = document.getElementById('compList'); if (!box || !S) return;
  box.innerHTML = '';
  let grp = null;
  for (const id in COMP_DEF) {
    const d = COMP_DEF[id], p = compProps(id), custom = compCustom(id);
    if (d.grp && d.grp !== grp) box.append(h('div', { class:'comp-grp', text:grp = d.grp }));
    const meta = compMeta(id, p);
    box.append(h('button', { type:'button', class:'comp-it' + (custom ? ' custom' : ''), title:`Editar o padrão de ${d.label}`, onclick:() => openComps(id) }, [
      h('span', { class:'comp-sw', style:`--c:${p.color || p.bg || p.c1 || p.drawColor || p.lineColor || 'var(--muted)'}` }),
      h('b', { text:d.label }), h('small', { text:meta }), custom ? h('i', { title:'Padrão editado', 'aria-label':'Padrão editado' }) : null]));
  }
}

// o resumo de cada componente (lista da esquerda)
function compMeta(id, p = compProps(id)) {
  const t = COMP_DEF[id].type;
  if (t === 'text' || t === 'cta') return `${p.font} · ${Math.round(p.size)}`;
  if (t === 'bg') return BG_MODES[p.mode] || '';
  if (t === 'margin') return !p.on ? 'Sem margem' : new Set([p.top, p.right, p.bottom, p.left]).size === 1 ? `${Math.round(p.top)} px` : 'Lados diferentes';
  if (t === 'file') return `${fmtLabel(p.format)} · ${String(p.duration).replace('.', ',')} s` + (p.slides > 1 ? ` · ${p.slides} slides` : '');
  if (t === 'fx') return (FXS[p.fx] || {}).label || '';
  if (t === 'camera') return (CAMS[p.cam] || {}).label || '';
  if (t === 'logo') return `${Math.round(p.sizeA * 100)}% · ${Math.round(p.sizeS * 100)}%`;
  return '';
}

/* ------------ janela de edição ------------
   Os campos são os mesmos do painel (rangeF, selectF…) apontando para uma camada de mentira (Proxy):
   cada valor escrito vai para S.brand.comps[id]. Fonte e cores têm controle próprio, para escolher entre "da marca" e "outra". */
let COMPWIN = null;
function openComps(id = 'title') {
  if (!COMP_DEF[id]) id = 'title';
  if (COMPWIN) { COMPWIN.pick(id); return; }
  pause();
  let cur = id, prevT = 0, prevL = null;
  const list = h('div', { class:'comp-nav', role:'listbox', 'aria-label':'Componentes' });
  const body = h('div', { class:'comp-body' });
  const pv = h('canvas', { class:'comp-pv', width:1280, height:600 });
  const playB = h('button', { class:'btn small ghost comp-play', text:'▶ Ver entrada', title:'Toca a entrada uma vez', onclick:() => playPrev() });
  const pvBox = h('div', { class:'comp-pvbox' }, [pv, playB]);
  const close = () => { cancelAnimationFrame(prevRaf); closePicker(); document.removeEventListener('keydown', onKey); ov.remove(); COMPWIN = null; renderComps(); renderAdds(); needs = true; };
  // Esc também quando o foco caiu fora da janela (os campos são refeitos a cada mudança)
  const onKey = e => { if (e.key === 'Escape' && !openPicker && !typingIn(e.target)) close(); };
  document.addEventListener('keydown', onKey);
  const card = h('div', { class:'files-card comp-card', tabindex:'-1', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'compTitle' }, [
    h('div', { class:'files-head' }, [h('h2', { id:'compTitle', text:'Componentes' }), h('div', { class:'spacer' }),
      h('button', { class:'btn small primary', text:'Pronto', onclick:close })]),
    h('p', { class:'hint', text:'Como cada elemento entra quando você clica em Adicionar, e como começa um arquivo novo (fundo, margem, formato). Fonte e cor podem seguir a marca (mudam junto com ela) ou ser outras. Depois de inserido, tudo é editado normalmente sem mudar o padrão.' }),
    h('div', { class:'comp-wrap' }, [list, h('div', { class:'comp-main' }, [pvBox, body])]),
  ]);
  const ov = h('div', { class:'files comp-sheet', onpointerdown:e => { if (e.target === ov) close(); },
    onkeydown:e => { e.stopPropagation(); if (e.key === 'Escape' && !openPicker && !typingIn(e.target)) close(); } }, [card]);

  // prévia: o elemento como entraria, desenhado sozinho sobre a cor de fundo da marca
  let prevRaf = 0;
  const drawPrev = (t) => {
    const L = prevL || (prevL = mkComp(cur)), x = pv.getContext('2d'), cw = pv.width, ch = pv.height;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none';
    if (COMP_DEF[cur].grp) { x.clearRect(0, 0, cw, ch); drawScene(x, L, t, cw, ch); return; }
    x.fillStyle = S.brand.colors[0]; x.fillRect(0, 0, cw, ch);
    if (L.type === 'image') {
      x.fillStyle = S.brand.colors[1]; x.globalAlpha = .5; x.font = '500 40px ' + getComputedStyle(document.body).fontFamily; x.textAlign = 'center';
      x.fillText('A foto entra com essa animação e moldura', cw / 2, ch / 2); x.globalAlpha = 1;
      return;
    }
    L.x = .5; L.y = .5; L.start = 0; L.end = 9999;
    const R = { rs:1, export:true }, tt = t ?? restTime(L);
    const draw = k => {
      R.rs = k; x.setTransform(k, 0, 0, k, cw / 2 - W() / 2 * k, ch / 2 - H() / 2 * k);
      try { if (L.type === 'text') drawText(x, L, tt, R); else drawBlock(x, L, tt, R); } catch (e) { console.warn(e); }
    };
    // mede no tamanho real fora da tela e ajusta a escala para caber
    const m = document.createElement('canvas').getContext('2d'); m.canvas.width = 2; m.canvas.height = 2;
    if (t == null || !L._fitK) {
      try { if (L.type === 'text') drawText(m, L, restTime(L), R); else drawBlock(m, L, restTime(L), R); } catch (e) {}
      const b = L._bounds; L._fitK = b && b.w > 0 ? Math.min(.9 * cw / b.w, .8 * ch / b.h, cw / W() * 1.6) : cw / W();
    }
    draw(L._fitK);
  };
  // fundo, margem, formato, transição, câmera: um quadro em miniatura (fundo do padrão + o título do padrão)
  let sceneTitle = null;
  const drawScene = (x, L, t, cw, ch) => {
    const d = COMP_DEF[cur], fmt = d.type === 'file' ? L.format : S.format, F = FORMATS[fmt] || FORMATS['4x5'];
    const n = d.type === 'file' ? clamp(Math.round(L.slides || 1), 1, SLIDES_MAX) : 1, gap = 24;
    const k = Math.min(.86 * ch / F.h, (.92 * cw - gap * (n - 1)) / (F.w * n)), fw = F.w * k, fh = F.h * k;
    const ox0 = (cw - fw * n - gap * (n - 1)) / 2, oy = (ch - fh) / 2;
    const bgL = d.type === 'bg' ? L : mkComp('bg'), tt = t ?? 0;
    for (let i = 0; i < n; i++) {
      const ox = ox0 + i * (fw + gap);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.beginPath(); x.rect(ox, oy, fw, fh); x.clip();
      x.setTransform(k, 0, 0, k, ox, oy);
      // câmera (e transição que mexe no quadro): o quadro inteiro anda em torno do centro
      let cm = null;
      if (d.type === 'camera' && CAMS[L.cam]) { const u = t == null ? .6 : clamp(t / 3); cm = CAMS[L.cam].fn(u, u * 3, L.intensity ?? .5, L.speed || 1); }
      if (d.type === 'fx' && FXS[L.fx] && FXS[L.fx].cam) { const c = FXS[L.fx].cam(fxU(L, t), L.intensity ?? .5); cm = { s:c.s, dx:(c.whip || 0) * F.w }; }
      if (cm) {
        const s = cm.s ?? 1, bs = Math.max(s, 1 + 2 * Math.max(Math.abs(cm.dx || 0) / F.w, Math.abs(cm.dy || 0) / F.h) + Math.abs(cm.r || 0) * 2.2);
        x.save(); x.translate(F.w / 2 + (cm.dx || 0), F.h / 2 + (cm.dy || 0)); if (cm.r) x.rotate(cm.r); x.scale(bs, bs); x.translate(-F.w / 2, -F.h / 2);
        paintFill(x, bgL, tt, F.w, F.h); x.restore();
        x.translate(F.w / 2 + (cm.dx || 0), F.h / 2 + (cm.dy || 0)); if (cm.r) x.rotate(cm.r); x.scale(s, s); x.translate(-F.w / 2, -F.h / 2);
      } else paintFill(x, bgL, tt, F.w, F.h);
      if (d.type === 'margin') drawMarginPv(x, L, F, k);
      else if (d.type === 'file') {
        x.fillStyle = S.brand.colors[1]; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = `600 ${Math.round(F.w * .11)}px ${getComputedStyle(document.body).fontFamily}`;
        x.fillText(n > 1 ? `${i + 1}/${n}` : fmtLabel(fmt), F.w / 2, F.h / 2);
        if (i === 0) { x.globalAlpha = .7; x.font = `500 ${Math.round(F.w * .045)}px ${getComputedStyle(document.body).fontFamily}`;
          x.fillText(`${F.w}×${F.h} · ${String(L.duration).replace('.', ',')} s · ${L.fps} fps`, F.w / 2, F.h / 2 + F.w * .1); x.globalAlpha = 1; }
      } else if (fmt === S.format) { // o título do padrão por cima, para ver o fundo, a câmera ou a transição com algo na tela
        const T0 = sceneTitle || (sceneTitle = mkComp('title'));
        T0.x = .5; T0.y = .5; T0.start = 0; T0.end = 9999;
        x.save(); try { drawText(x, T0, restTime(T0), { rs:k, export:true }); } catch (e) {} x.restore();
      }
      if (d.type === 'fx' && FXS[L.fx] && FXS[L.fx].draw) {
        x.save(); x.globalAlpha = L.opacity ?? 1; try { FXS[L.fx].draw(x, L, fxU(L, t)); } catch (e) {} x.restore();
      }
      x.restore();
      x.setTransform(1, 0, 0, 1, 0, 0); x.strokeStyle = uiA('frame', .6); x.lineWidth = 1; x.strokeRect(ox + .5, oy + .5, fw - 1, fh - 1);
    }
  };
  // transição: parada no começo (dá para ver as cores e o que está atrás); tocando, passa inteira
  const fxU = (L, t) => t == null ? .14 : clamp((t - .3) / ((FXS[L.fx] || {}).dur || .8));
  // margem: o que fica fora dela escurece, linha tracejada na cor da margem do palco e os valores de cada lado
  const drawMarginPv = (x, m, F, k) => {
    if (!m.on) return;
    const n = v => Math.max(0, +v || 0), x0 = Math.min(n(m.left), F.w - 1), y0 = Math.min(n(m.top), F.h - 1);
    const x1 = Math.max(x0 + 1, F.w - n(m.right)), y1 = Math.max(y0 + 1, F.h - n(m.bottom));
    x.save();
    x.fillStyle = uiA('margin', .22); x.beginPath(); x.rect(0, 0, F.w, F.h); x.rect(x0, y0, x1 - x0, y1 - y0); x.fill('evenodd');
    x.strokeStyle = uiA('margin', .95); x.lineWidth = 2 / k; x.setLineDash([8 / k, 6 / k]); x.strokeRect(x0, y0, x1 - x0, y1 - y0); x.setLineDash([]);
    x.fillStyle = uiA('margin', 1); x.font = `600 ${Math.round(13 / k)}px ${getComputedStyle(document.body).fontFamily}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const lab = (v, px, py) => { if (v > 0) x.fillText(Math.round(v), px, py); };
    lab(n(m.top), F.w / 2, y0 / 2); lab(n(m.bottom), F.w / 2, (y1 + F.h) / 2); lab(n(m.left), x0 / 2, F.h / 2); lab(n(m.right), (x1 + F.w) / 2, F.h / 2);
    // blocos de mentira dentro da margem: título, texto e botão
    x.fillStyle = withA(S.brand.colors[1], .55);
    const bw = x1 - x0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    [[.8, .08, -.16], [.62, .08, -.05], [.5, .035, .06], [.32, .06, .16]].forEach(([w, hh, dy]) => {
      const ww = bw * w, h2 = (y1 - y0) * hh; x.beginPath(); rrect(x, cx - ww / 2, cy + dy * (y1 - y0) - h2 / 2, ww, h2, Math.min(h2 / 2, 12)); x.fill();
    });
    x.restore();
  };
  const playLen = L => {
    const t = COMP_DEF[cur].type;
    return t === 'bg' ? 5 : t === 'camera' ? 3 : t === 'fx' ? ((FXS[L.fx] || {}).dur || .8) + .6 : restTime(L) + .4;
  };
  const playPrev = () => {
    cancelAnimationFrame(prevRaf);
    const L = prevL || (prevL = mkComp(cur)), end = playLen(L), t0 = performance.now();
    const step = () => { const t = (performance.now() - t0) / 1000; drawPrev(Math.min(t, end)); if (t < end && COMPWIN) prevRaf = requestAnimationFrame(step); else drawPrev(); };
    step();
  };
  const refresh = () => {
    prevL = null; sceneTitle = null; cancelAnimationFrame(prevRaf);
    const t = COMP_DEF[cur].type;
    playB.hidden = t === 'margin' || t === 'file' || t === 'image';
    // quadro em pé precisa de mais altura que um elemento solto
    const ph = COMP_DEF[cur].grp ? 900 : 600; if (pv.height !== ph) { pv.height = ph; pv.style.aspectRatio = `${pv.width} / ${ph}`; }
    playB.textContent = t === 'bg' ? '▶ Ver movimento' : t === 'camera' ? '▶ Ver câmera' : t === 'fx' ? '▶ Ver transição' : '▶ Ver entrada';
    playB.title = t === 'bg' ? 'Toca alguns segundos do fundo' : t === 'camera' ? 'Toca o movimento da câmera' : t === 'fx' ? 'Toca a transição uma vez' : 'Toca a entrada uma vez';
    drawPrev(); drawNav();
  };
  let rqf = 0;
  const soon = () => { cancelAnimationFrame(rqf); rqf = requestAnimationFrame(refresh); };

  // camada de mentira: lê o padrão resolvido, escreve no padrão
  const REDRAW = new Set(['mode', 'fx', 'cam', 'on']); // mudam quais campos aparecem
  const proxy = () => {
    const tgt = mkComp(cur);
    if (COMP_DEF[cur].type === 'logo') { const p = compProps(cur); tgt.sizeA = p.sizeA; tgt.sizeS = p.sizeS; } // mkComp já trocou por size
    if (COMP_FILE.has(cur)) tgt.id = 'comp-' + cur; // margem/formato não são camadas: id só para os campos
    return new Proxy(tgt, { set(o, k, v) {
      o[k] = v;
      if (typeof k === 'string' && !compSkip(cur, k) && k[0] !== '_' || k === 'text') {
        const c = compsOf()[cur] ||= {};
        if (v === undefined) delete c[k]; else c[k] = toBrandRef(k, v, compRaw(cur)[k]);
        if (k === 'in') delete c.inDur; // preset novo: a duração dele
        autosave();
        if (REDRAW.has(k)) { cancelAnimationFrame(rqf); rqf = requestAnimationFrame(draw); } else soon();
      }
      return true;
    } });
  };
  const setRaw = (k, v) => { pushUndo(); const c = compsOf()[cur] ||= {}; c[k] = v; if (v === undefined) delete c[k]; autosave(); draw(); };

  // fonte: as três da marca (ligadas) ou outra (fixa)
  const fontPick = () => {
    const B = S.brand, raw = compRaw(cur).font, fams = allFonts(), ref = /^@f\d$/.test(raw);
    if (!ref && raw && !fams.includes(raw)) fams.push(raw);
    const sel = h('select', { id:'comp-font' }, [
      h('optgroup', { label:'Da marca (muda junto)' }, FONT_SLOTS.map((n, i) => h('option', { value:'@f' + i, text:`${n} · ${B.fonts[i]}` }))),
      h('optgroup', { label:'Outra fonte' }, fams.map(f => h('option', { value:f, text:f }))),
    ]);
    sel.value = raw || '@f1';
    sel.addEventListener('change', () => setRaw('font', sel.value));
    return field('Fonte', sel, 'comp-font');
  };
  // cor: amostras da marca (ligadas) + "outra" (seletor normal, fixa)
  const colorPick = (k, label) => {
    const B = S.brand, raw = String(compRaw(cur)[k] ?? ''), m = /^@c(\d+)/.exec(raw), names = i => B.names?.[i] || ROLE_NAMES[i] || `Cor ${i + 1}`;
    const sws = B.colors.map((c, i) => h('button', { type:'button', class:'cpick comp-csw', style:`--c:${c}`, title:`${names(i)} (da marca)`, 'aria-label':`${label}: ${names(i)}`,
      'aria-pressed':String(!!m && +m[1] === i), onclick:() => setRaw(k, m && +m[1] === i ? raw : '@c' + i) }));
    const own = colorButton(m ? brandRef(raw) : raw || '#888888', `${label}: outra cor`, { cls:'comp-own', onStart:pushUndo,
      onInput:c => { const o = compsOf()[cur] ||= {}; o[k] = c; autosave(); soon(); sws.forEach(b => b.setAttribute('aria-pressed', 'false')); own.setAttribute('aria-pressed', 'true'); tag.textContent = 'Outra'; } });
    own.setAttribute('aria-pressed', String(!m));
    const tag = h('small', { class:'comp-tag', text:m ? names(+m[1]) : 'Outra' });
    return field(label, h('div', { class:'comp-colors' }, [...sws, h('span', { class:'comp-or', text:'ou' }), own, tag]), null);
  };
  const presetSel = (P, k, label, keys, M) => selectF(P, k, label, keys.filter(key => k === 'idle' || M[key]).map(key => [key, k === 'idle' ? IDLE[key] : M[key].label]));

  const draw = () => {
    closePicker();
    const d = COMP_DEF[cur], P = proxy(), px = v => Math.round(v) + 'px', put = (...xs) => body.append(...xs.filter(Boolean));
    body.innerHTML = '';
    put(h('h3', { class:'comp-h', text:d.label }, [compCustom(cur) ? h('small', { text:'editado' }) : null]));
    if (d.type === 'text' || d.type === 'cta') {
      put(textF(P, 'text', d.type === 'cta' ? 'Texto inicial do botão' : 'Texto inicial'), fontPick(),
        selectF(P, 'weight', 'Peso', weightsOf(P.font).map(([v, t]) => [v, `${t} ${v}`]), { num:true }),
        rangeF(P, 'size', 'Tamanho', 16, d.type === 'cta' ? 120 : 400, 1, px), colorPick('color', d.type === 'cta' ? 'Cor do texto' : 'Cor'));
      if (d.type === 'text') put(P.in === 'highlight' || cur === 'hl' ? colorPick('hl', 'Marca-texto') : null,
        rangeF(P, 'ls', 'Entre letras', -.08, .6, .005, v => v.toFixed(3) + 'em'),
        rangeF(P, 'lh', 'Entrelinha', .8, 1.6, .01, v => v.toFixed(2)),
        segF(P, 'align', 'Alinhamento', [['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.']]),
        h('div', { class:'checks' }, [checkF(P, 'upper', 'Caixa alta'), checkF(P, 'italic', 'Itálico')]));
      else put(colorPick('bg', 'Fundo'), rangeF(P, 'radius', 'Arredondado', 0, 999, 1, v => v >= 999 ? 'pílula' : px(v)),
        rangeF(P, 'padX', 'Folga lateral', 10, 160, 1, px), rangeF(P, 'padY', 'Folga vertical', 6, 80, 1, px));
    } else if (d.type === 'shape') {
      put(selectF(P, 'kind', 'Forma', Object.entries(SHAPE_KINDS).filter(([k]) => k !== 'custom' || P.kind === 'custom')),
        colorPick('c1', 'Cor 1'), colorPick('c2', 'Cor 2'), rangeF(P, 'size', 'Largura', .02, 1.6, .01, v => Math.round(v * 100) + '%'),
        rangeF(P, 'mh', 'Altura', .02, 2.6, .01, v => Math.round(v * 100) + '%'), rangeF(P, 'radius', 'Cantos', 0, 600, 1, px));
    } else if (d.type === 'image') {
      put(rangeF(P, 'size', 'Largura', .1, 1.6, .01, v => Math.round(v * 100) + '%'), rangeF(P, 'radius', 'Cantos', 0, 600, 1, px));
    } else if (d.type === 'logo') {
      const pct = v => Math.round(v * 100) + '%';
      put(rangeF(P, 'sizeA', 'Sozinho', .05, .95, .005, pct, { cap:3 }), rangeF(P, 'sizeS', 'Com outros', .03, .6, .005, pct, { cap:3 }),
        h('p', { class:'hint', text:'Largura do logo em % do quadro. "Sozinho" vale quando ele é o único elemento (fica grande, no meio); "Com outros", quando já tem algo no quadro (fica no topo).' }),
        colorPick('drawColor', 'Cor do traço'));
    } else if (d.type === 'bg') {
      // as mesmas cores e estilos do painel do fundo (fillProps), ligados à marca
      put(h('p', { class:'hint', text:'Todo arquivo novo começa com este fundo.' }), segF(P, 'mode', 'Estilo', Object.entries(BG_MODES)));
      const lbl = { mesh:['Base', 'Mancha 1', 'Mancha 2', 'Mancha 3'], linear:['Cor 1', 'Cor 2', 'Cor 3'], spot:['Base', 'Luz'], solid:['Cor'], image:[] }[P.mode] || [];
      lbl.forEach((t, i) => put(colorPick('c' + (i + 1), t)));
      if (P.mode === 'image') put(uploadF(P.src ? 'Trocar imagem' : 'Enviar imagem de fundo', 'image/*', async f => { const src = await imageSrc(f); await getImage(src); setRaw('src', src); }),
        rangeF(P, 'darken', 'Escurecer', 0, .85, .01, v => Math.round(v * 100) + '%'));
      if (P.mode === 'linear') put(rangeF(P, 'angle', 'Ângulo', 0, 360, 1, v => Math.round(v) + '°'));
      if (P.mode !== 'solid') put(rangeF(P, 'motion', P.mode === 'image' ? 'Zoom lento' : 'Movimento', 0, 3, .05, v => v.toFixed(2) + '×'));
      put(rangeF(P, 'grain', 'Granulado', 0, .4, .01, v => Math.round(v * 100) + '%'));
    } else if (d.type === 'margin') {
      put(h('p', { class:'hint', text:'Todo arquivo novo começa com esta margem. Em pixels do vídeo (1080 de largura): texto, logo e botão param dentro dela.' }),
        checkF(P, 'on', 'Usar margem'));
      if (P.on) {
        const four = ['top', 'right', 'bottom', 'left'];
        put(rangeF(P, 'all', 'Todos', 0, 300, 4, px, { cap:800, get:() => P.top, after:draw,
          put:v => { for (const k of four) P[k] = v; } }),
          ...four.map((k, i) => rangeF(P, k, ['Superior', 'Direita', 'Inferior', 'Esquerda'][i], 0, 300, 4, px, { cap:800 })));
      }
    } else if (d.type === 'file') {
      put(h('p', { class:'hint', text:'Vale para arquivo novo. Os arquivos que já existem continuam como estão.' }),
        segF(P, 'format', 'Formato', Object.keys(FORMATS).map(f => [f, fmtLabel(f)])),
        rangeF(P, 'duration', 'Duração', 2, 60, .5, v => String(v).replace('.', ',') + ' s'),
        selectF(P, 'fps', 'FPS', FPS_OPTS.map(v => [v, v + ' quadros/s']), { num:true }),
        rangeF(P, 'slides', 'Slides', 1, SLIDES_MAX, 1, v => v <= 1 ? 'Um' : v + '', { after:refresh }),
        checkF(P, 'loop', 'Repetir'));
    } else if (d.type === 'fx') {
      put(selectF(P, 'fx', 'Transição', Object.entries(FXS).map(([k, v]) => [k, v.label])),
        rangeF(P, 'intensity', 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%'));
      if (FXS[P.fx] && FXS[P.fx].draw) put(rangeF(P, 'opacity', 'Opacidade', .1, 1, .01, v => Math.round(v * 100) + '%'));
      const cols = FXCOLS[P.fx] || [];
      cols.forEach((k, i) => put(colorPick(k, cols.length === 1 ? 'Cor da luz' : i === 0 ? 'Cor da frente' : `Cor ${i + 1}`)));
    } else if (d.type === 'camera') {
      put(selectF(P, 'cam', 'Movimento', Object.entries(CAMS).map(([k, v]) => [k, v.label])),
        rangeF(P, 'intensity', 'Intensidade', 0, 1, .01, v => Math.round(v * 100) + '%'),
        ['punch', 'shake', 'hand'].includes(P.cam) ? rangeF(P, 'speed', 'Velocidade', .4, 3, .05, v => v.toFixed(2) + '×') : null);
    }
    if (!d.grp) {
      put(h('h3', { class:'sub', text:'Animação' }));
      const M = d.type === 'text' ? TP : BP, ins = d.type === 'text' ? TEXT_IN : BLOCK_IN[d.type], outs = d.type === 'text' ? TEXT_OUT : BLOCK_OUT[d.type];
      put(presetSel(P, 'in', 'Entrada', [...new Set([P.in, ...ins].filter(Boolean))], M),
        presetSel(P, 'out', 'Saída', [...new Set([P.out, ...outs].filter(Boolean))], M),
        presetSel(P, 'idle', 'Na tela', [...new Set([P.idle || 'none', ...(IDLE_BY[d.type] || ['none'])])], M));
    }
    const extra = Object.keys(compsOf()[cur] || {}).filter(k => !(d.grp ? SHOWN_G : SHOWN).has(k)).length;
    if (extra) put(h('p', { class:'hint', text:`Mais ${extra} ajuste${extra > 1 ? 's' : ''} copiado${extra > 1 ? 's' : ''} de um elemento (sombra, contorno, ritmo…). Também entram.` }));
    // ações
    const L = selL(), lb = d.label.toLowerCase(), o_ = d.fem ? 'a' : 'o';
    let fit = L && compKindOf(L) && COMP_DEF[compKindOf(L)].type === d.type ? L : (L && L.type === d.type && !d.grp ? L : null), useTxt = 'Copiar do elemento selecionado';
    if (!fit && d.grp && !COMP_FILE.has(cur)) { fit = S.layers.find(l => l.type === d.type) || null; useTxt = `Copiar ${o_} ${lb} deste arquivo`; } // fundo, transição, câmera: a que está no arquivo
    const useB = COMP_FILE.has(cur)
      ? h('button', { class:'btn small', text:cur === 'margin' ? 'Usar a margem deste arquivo' : 'Usar o deste arquivo', title:'O que o arquivo aberto usa vira o padrão',
          onclick:() => { compFromFile(cur); draw(); } })
      : h('button', { class:'btn small', text:useTxt, disabled:!fit || null, title:fit ? `O estilo e a animação de "${fit.name}" viram este padrão` : `Selecione no palco ${d.fem ? 'uma' : 'um'} ${lb} já arrumad${o_} para copiar o estilo ${d.fem ? 'dela' : 'dele'}`,
          onclick:() => { compFromLayer(fit, cur); draw(); refresh(); } });
    put(h('div', { class:'comp-acts' }, [
      useB,
      cur === 'file' ? null : h('button', { class:'btn small', 'aria-haspopup':'menu', html:`${cur === 'margin' ? 'Aplicar nos arquivos que já existem' : `Aplicar n${o_}s ${compPl(cur)} que já existem`} <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>`,
        title:'O padrão vale sozinho para o que for inserido. Aqui você passa ele também para os que já estão no projeto ou no arquivo',
        onclick:e => compApplyMenu(e.currentTarget, cur, () => { draw(); }) }),
      h('button', { class:'btn small ghost', text:'Voltar ao de fábrica', disabled:!compCustom(cur) || null,
        onclick:() => { pushUndo(); delete compsOf()[cur]; autosave(); draw(); refresh(); } }),
    ]));
    if (!COMP_FILE.has(cur) && !d.grp) put(h('p', { class:'hint', text:`Atalho: em vez de ajustar aqui, arrume ${d.fem ? 'uma' : 'um'} ${lb} no palco (cor, animação, sombra…), deixe selecionad${o_} e clique em "Copiar do elemento selecionado". Tudo o que ${d.fem ? 'ela' : 'ele'} tem vira o padrão.` }));
    refresh();
    if (!ov.contains(document.activeElement)) card.focus({ preventScroll:true });
  };
  const SHOWN = new Set(['text', 'font', 'weight', 'size', 'color', 'hl', 'ls', 'lh', 'align', 'upper', 'italic', 'bg', 'radius', 'padX', 'padY', 'kind', 'c1', 'c2', 'mh', 'sizeA', 'sizeS', 'drawColor', 'in', 'out', 'idle', 'inDur']);
  const SHOWN_G = new Set(['mode', 'c1', 'c2', 'c3', 'c4', 'src', 'darken', 'angle', 'motion', 'grain', 'on', 'top', 'right', 'bottom', 'left',
    'format', 'duration', 'fps', 'slides', 'loop', 'fx', 'cam', 'intensity', 'speed', 'opacity']);
  const drawNav = () => {
    list.innerHTML = '';
    let grp = null;
    for (const k in COMP_DEF) {
      if (COMP_DEF[k].grp && COMP_DEF[k].grp !== grp) list.append(h('div', { class:'comp-grp', role:'presentation', text:grp = COMP_DEF[k].grp }));
      list.append(h('button', { type:'button', role:'option', class:'comp-nv' + (compCustom(k) ? ' custom' : ''), 'aria-selected':String(k === cur),
      onclick:() => COMPWIN.pick(k) }, [h('span', { text:COMP_DEF[k].label }), compCustom(k) ? h('i', { title:'Padrão editado' }) : null]));
    }
  };
  COMPWIN = { pick:k => { cur = k; draw(); } };
  document.body.append(ov);
  draw();
  list.querySelector('[aria-selected="true"]')?.focus();
}

// o padrão em todos os arquivos do projeto (o aberto com desfazer; os outros são regravados). Margem: a do arquivo inteiro
async function compApplyProject(id) {
  if (!FILES.project) return;
  const marg = id === 'margin', mine = marg ? [] : S.layers.filter(l => compKindOf(l) === id);
  if (marg) { pushUndo(); compMarginTo(S); renderFormats(); RT.layout.clear(); changed({ props:true }); }
  else if (mine.length) { pushUndo(); compApply(mine, id); changed({ props:true, layers:true }); }
  await flushSave();
  const list = ((await DB.get('files')) || []).filter(f => f.project === FILES.project && f.id !== FILES.id);
  let n = mine.length, files = marg || mine.length ? 1 : 0;
  for (const f of list) {
    let st; try { st = JSON.parse(await DB.get('file:' + f.id)); } catch (e) { continue; }
    if (!st || !st.layers) continue;
    if (marg) { compMarginTo(st); files++; }
    else {
      const ls = st.layers.filter(l => compKindOf(l) === id); if (!ls.length) continue;
      compApply(ls, id, st.duration); n += ls.length; files++;
    }
    st.brand = S.brand;
    await DB.set('file:' + f.id, JSON.stringify(st));
  }
  const fl = `${files} arquivo${files > 1 ? 's' : ''}`;
  toast(marg ? `Margem aplicada em ${fl} do projeto` : n ? `Padrão aplicado em ${n} elemento${n > 1 ? 's' : ''}, em ${fl} do projeto` : 'Nenhum elemento desse tipo no projeto');
}

// confirmação no estilo do editor (Promise<boolean>)
function askConfirm(title, msg, ok = 'Confirmar', danger = false) {
  return new Promise(res => {
    const end = v => { ov.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); end(true); } };
    const okB = h('button', { class:'btn small ' + (danger ? 'danger' : 'primary'), text:ok, onclick:() => end(true) });
    const ov = h('div', { class:'modal ask', onpointerdown:e => { if (e.target === ov) end(false); } }, [h('div', { class:'modal-card', role:'alertdialog', 'aria-modal':'true' }, [
      h('h2', { text:title }), h('p', { class:'ask-msg', text:msg }),
      h('div', { class:'row', style:'justify-content:flex-end' }, [h('button', { class:'btn small ghost', text:'Cancelar', onclick:() => end(false) }), okB])])]);
    document.body.append(ov); document.addEventListener('keydown', key, true); okB.focus();
  });
}
// quantos elementos desse componente existem no projeto (fora o arquivo aberto, que conta pelo S). Margem: quantos arquivos
async function compCountProject(id) {
  const list = ((await DB.get('files')) || []).filter(f => f.project === FILES.project && f.id !== FILES.id);
  if (id === 'margin') return { n:list.length + 1, files:list.length + 1 };
  let n = S.layers.filter(l => compKindOf(l) === id).length, files = n ? 1 : 0;
  for (const f of list) { try { const st = JSON.parse(await DB.get('file:' + f.id)); const k = (st.layers || []).filter(l => compKindOf(l) === id).length; if (k) { n += k; files++; } } catch (e) {} }
  return { n, files };
}
// um menu só: primeiro o projeto, depois só este arquivo; sempre pede confirmação dizendo quantos mudam
function compApplyMenu(anchor, id, after) {
  closeMenu();
  const d = COMP_DEF[id], marg = id === 'margin', one = d.label.toLowerCase(), many = compPl(id), nm = k => k > 1 ? many : one;
  const here = marg ? [] : S.layers.filter(l => compKindOf(l) === id), um = d.fem ? 'Nenhuma' : 'Nenhum';
  const item = (text, sub, fn, off) => h('button', { disabled:off || null, onclick:() => { closeMenu(); fn(); } }, [h('span', {}, [text, h('small', { class:'ctx-sub', text:sub })])]);
  const fls = k => `${k} arquivo${k > 1 ? 's' : ''}`, scene = d.grp != null; // fundo, transição e câmera: sem animação de entrada nem texto
  const what = scene ? 'O estilo' : 'O estilo e a animação', verb = scene ? 'passa' : 'passam', keeps = scene ? 'O tempo fica.' : 'Texto, posição e tempo ficam.';
  const m = h('div', { class:'ctx', role:'menu' }, [
    item('Em todo o projeto', FILES.project ? `Todos os arquivos de "${PROJ_NAMES.get(FILES.project)}"` : 'Este arquivo não está num projeto', async () => {
      const c = await compCountProject(id);
      if (marg) {
        if (await askConfirm(`Mudar a margem de ${fls(c.files)}?`, `Todos os arquivos do projeto passam a usar esta margem. O que fica dentro dela se reorganiza. Nos outros arquivos não dá para desfazer.`, 'Aplicar no projeto')) { await compApplyProject(id); after && after(); }
        return;
      }
      if (!c.n) { toast(`${um} ${one} no projeto`); return; }
      if (await askConfirm(`Mudar ${c.n} ${nm(c.n)} do projeto?`, `${what} de ${c.n} ${nm(c.n)}, em ${fls(c.files)}, ${verb} a seguir o padrão. ${keeps} Nos outros arquivos não dá para desfazer.`, 'Aplicar no projeto')) { await compApplyProject(id); after && after(); }
    }, !FILES.project),
    item('Só neste arquivo', marg ? 'A margem do arquivo aberto' : here.length ? `${here.length} ${nm(here.length)} aqui` : `${um} ${one} neste arquivo`, async () => {
      if (marg) {
        pushUndo(); compMarginTo(S); renderFormats(); RT.layout.clear(); changed({ props:true }); toast('Margem aplicada neste arquivo', 5000, UNDO_ACT); after && after();
        return;
      }
      if (!(await askConfirm(`Mudar ${here.length} ${nm(here.length)} deste arquivo?`, `${what} ${verb} a seguir o padrão. ${keeps} Ctrl+Z desfaz.`, 'Aplicar no arquivo'))) return;
      pushUndo(); compApply(here, id); changed({ props:true, layers:true }); toast(`Padrão aplicado em ${here.length} ${nm(here.length)}`, 5000, UNDO_ACT); after && after();
    }, !marg && !here.length),
  ]);
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mr.width - 8)) + 'px';
  m.style.top = (r.bottom + 4 + mr.height > innerHeight ? Math.max(8, r.top - mr.height - 4) : r.bottom + 4) + 'px';
}
