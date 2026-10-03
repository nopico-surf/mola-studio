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
  logo:   { type:'logo', label:'Logo', p:{ drawColor:'@c2', lineColor:'@c2', tintColor:'@c1', idle:'shine' } },
  image:  { type:'image', label:'Imagem', y:.42, p:{ idle:'float', lineColor:'@c2' } },
  shape:  { type:'shape', label:'Forma', y:.5, p:{ c1:'@c2', c2:'@c0', c3:'@c3', c4:'@c4', strokeColor:'@c1' } },
};
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
  if (!L || L.type === 'bg' || (L.type === 'image' && L.video) || (L.type === 'logo' && L.svg)) return null;
  const id = COMP_DEF[L.comp] ? L.comp : ROLE_COMP[L.role];
  return id && COMP_DEF[id].type === L.type ? id : null;
}
// o elemento novo, já com o padrão (marca resolvida)
function mkComp(id) {
  const d = COMP_DEF[id], o = { name:d.name || d.label, comp:id };
  if (d.y != null) o.y = d.y;
  let role = d.role;
  if (d.type === 'logo') { // sozinho no quadro = logo grande; com outros = logo pequeno no topo. Escreve com a caneta se o logo permitir
    const pen = RT.logo && RT.logo.pen, alone = !S.layers.some(l => l.type !== 'bg');
    role = alone ? 'logo' : 'logoSmall';
    Object.assign(o, { y:alone ? .42 : .12, size:alone ? .36 : .14, in:pen ? 'handwrite' : 'spring', inDur:pen ? BP.handwrite.dur : BP.spring.dur });
  }
  const p = compProps(id);
  if (p.in && p.inDur == null) delete o.inDur; // preset trocado no padrão: duração do preset
  Object.assign(o, p);
  return d.type === 'text' ? mkText(role, o) : d.type === 'cta' ? mkCta(o) : d.type === 'logo' ? mkLogo(role, o) : d.type === 'image' ? mkImage(o) : mkShape(o);
}
// o estilo de um elemento vira o padrão (fonte/cor que batem com a marca ficam ligadas a ela)
function compCapture(L, id) {
  const raw = compRaw(id), out = {};
  for (const k in L) {
    if (COMP_SKIP.has(k) || k[0] === '_' || L[k] === undefined || typeof L[k] === 'function') continue;
    const v = L[k] && typeof L[k] === 'object' ? JSON.parse(JSON.stringify(L[k])) : L[k];
    out[k] = toBrandRef(k, v, raw[k]);
  }
  if (COMP_DEF[id].type === 'logo') { delete out.size; delete out.drawOrig; } // tamanho do logo depende de estar sozinho ou não
  // guarda só o que difere da fábrica (o resto continua seguindo a fábrica e a marca)
  const fac = COMP_DEF[id].p, keep = S.brand.comps && S.brand.comps[id];
  if (S.brand.comps) delete S.brand.comps[id];
  const L0 = mkComp(id);
  if (keep) S.brand.comps[id] = keep;
  const off = !strokeOn(L); // os campos do contorno ficam na camada mesmo desligado (o painel preenche): sem contorno, não contam
  for (const k in out) {
    if (L0[k] === undefined && (!out[k] || out[k] === 'none' || off && /^stroke[A-Z]/.test(k))) { delete out[k]; continue; }
    const same = JSON.stringify(brandRef(out[k])) === JSON.stringify(L0[k]);
    if (same && (out[k] === fac[k] || !(typeof fac[k] === 'string' && fac[k][0] === '@'))) delete out[k];
  }
  return out;
}
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
function compApply(ls, id) {
  const p = compProps(id); delete p.text;
  const M = COMP_DEF[id].type === 'text' ? TP : BP;
  for (const L of ls) {
    Object.assign(L, p);
    if (p.in && compRaw(id).inDur == null && M[p.in]) L.inDur = M[p.in].dur;
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
  for (const id in COMP_DEF) {
    const d = COMP_DEF[id], p = compProps(id), custom = compCustom(id);
    const meta = d.type === 'text' || d.type === 'cta' ? `${p.font} · ${Math.round(p.size)}` : '';
    box.append(h('button', { type:'button', class:'comp-it' + (custom ? ' custom' : ''), title:`Editar o padrão de ${d.label}`, onclick:() => openComps(id) }, [
      h('span', { class:'comp-sw', style:`--c:${p.color || p.bg || p.c1 || p.drawColor || p.lineColor || 'var(--muted)'}` }),
      h('b', { text:d.label }), h('small', { text:meta }), custom ? h('i', { title:'Padrão editado', 'aria-label':'Padrão editado' }) : null]));
  }
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
  const pvBox = h('div', { class:'comp-pvbox' }, [pv, h('button', { class:'btn small ghost comp-play', text:'▶ Ver entrada', title:'Toca a entrada uma vez', onclick:() => playPrev() })]);
  const close = () => { cancelAnimationFrame(prevRaf); closePicker(); document.removeEventListener('keydown', onKey); ov.remove(); COMPWIN = null; renderComps(); renderAdds(); needs = true; };
  // Esc também quando o foco caiu fora da janela (os campos são refeitos a cada mudança)
  const onKey = e => { if (e.key === 'Escape' && !openPicker && !typingIn(e.target)) close(); };
  document.addEventListener('keydown', onKey);
  const card = h('div', { class:'files-card comp-card', tabindex:'-1', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'compTitle' }, [
    h('div', { class:'files-head' }, [h('h2', { id:'compTitle', text:'Componentes' }), h('div', { class:'spacer' }),
      h('button', { class:'btn small primary', text:'Pronto', onclick:close })]),
    h('p', { class:'hint', text:'Como cada elemento entra quando você clica em Adicionar. Fonte e cor podem seguir a marca (mudam junto com ela) ou ser outras. Depois de inserido, o elemento é editado normalmente sem mudar o padrão.' }),
    h('div', { class:'comp-wrap' }, [list, h('div', { class:'comp-main' }, [pvBox, body])]),
  ]);
  const ov = h('div', { class:'files comp-sheet', onpointerdown:e => { if (e.target === ov) close(); },
    onkeydown:e => { e.stopPropagation(); if (e.key === 'Escape' && !openPicker && !typingIn(e.target)) close(); } }, [card]);

  // prévia: o elemento como entraria, desenhado sozinho sobre a cor de fundo da marca
  let prevRaf = 0;
  const drawPrev = (t) => {
    const L = prevL || (prevL = mkComp(cur)), x = pv.getContext('2d'), cw = pv.width, ch = pv.height;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none';
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
  const playPrev = () => {
    cancelAnimationFrame(prevRaf);
    const L = prevL || (prevL = mkComp(cur)), end = restTime(L) + .4, t0 = performance.now();
    const step = () => { const t = (performance.now() - t0) / 1000; drawPrev(Math.min(t, end)); if (t < end && COMPWIN) prevRaf = requestAnimationFrame(step); else drawPrev(); };
    step();
  };
  const refresh = () => { prevL = null; cancelAnimationFrame(prevRaf); drawPrev(); drawNav(); };
  let rqf = 0;
  const soon = () => { cancelAnimationFrame(rqf); rqf = requestAnimationFrame(refresh); };

  // camada de mentira: lê o padrão resolvido, escreve no padrão
  const proxy = () => {
    const tgt = mkComp(cur);
    return new Proxy(tgt, { set(o, k, v) {
      o[k] = v;
      if (typeof k === 'string' && !COMP_SKIP.has(k) && k[0] !== '_' || k === 'text') {
        const c = compsOf()[cur] ||= {};
        if (v === undefined) delete c[k]; else c[k] = toBrandRef(k, v, compRaw(cur)[k]);
        if (k === 'in') delete c.inDur; // preset novo: a duração dele
        autosave(); soon();
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
      put(h('p', { class:'hint', text:'O tamanho do logo depende de estar sozinho no quadro (grande) ou com outros elementos (pequeno, no topo).' }),
        colorPick('drawColor', 'Cor do traço'));
    }
    put(h('h3', { class:'sub', text:'Animação' }));
    const M = d.type === 'text' ? TP : BP, ins = d.type === 'text' ? TEXT_IN : BLOCK_IN[d.type], outs = d.type === 'text' ? TEXT_OUT : BLOCK_OUT[d.type];
    put(presetSel(P, 'in', 'Entrada', [...new Set([P.in, ...ins].filter(Boolean))], M),
      presetSel(P, 'out', 'Saída', [...new Set([P.out, ...outs].filter(Boolean))], M),
      presetSel(P, 'idle', 'Na tela', [...new Set([P.idle || 'none', ...(IDLE_BY[d.type] || ['none'])])], M));
    const extra = Object.keys(compsOf()[cur] || {}).filter(k => !SHOWN.has(k)).length;
    if (extra) put(h('p', { class:'hint', text:`Mais ${extra} ajuste${extra > 1 ? 's' : ''} copiado${extra > 1 ? 's' : ''} de um elemento (sombra, contorno, ritmo…). Também entram.` }));
    // ações
    const L = selL(), fit = L && compKindOf(L) && COMP_DEF[compKindOf(L)].type === d.type ? L : (L && L.type === d.type && d.type !== 'bg' ? L : null);
    const same = S.layers.filter(l => compKindOf(l) === cur);
    put(h('div', { class:'comp-acts' }, [
      h('button', { class:'btn small', text:'Usar o estilo do selecionado', disabled:!fit || null, title:fit ? `Copia o estilo de "${fit.name}" para este padrão` : `Selecione um elemento do tipo ${TYPE_LABEL[d.type].toLowerCase()} no palco`,
        onclick:() => { compFromLayer(fit, cur); draw(); refresh(); } }),
      h('button', { class:'btn small', 'aria-haspopup':'menu', html:`Aplicar nos ${(d.label).toLowerCase()}s que já existem <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>`,
        title:'O padrão vale sozinho para o que for inserido. Aqui você passa ele também para os que já estão no projeto ou no arquivo',
        onclick:e => compApplyMenu(e.currentTarget, cur, () => { draw(); }) }),
      h('button', { class:'btn small ghost', text:'Voltar ao de fábrica', disabled:!compCustom(cur) || null,
        onclick:() => { pushUndo(); delete compsOf()[cur]; autosave(); draw(); refresh(); } }),
    ]));
    refresh();
    if (!ov.contains(document.activeElement)) card.focus({ preventScroll:true });
  };
  const SHOWN = new Set(['text', 'font', 'weight', 'size', 'color', 'hl', 'ls', 'lh', 'align', 'upper', 'italic', 'bg', 'radius', 'padX', 'padY', 'kind', 'c1', 'c2', 'mh', 'drawColor', 'in', 'out', 'idle', 'inDur']);
  const drawNav = () => {
    list.innerHTML = '';
    for (const k in COMP_DEF) list.append(h('button', { type:'button', role:'option', class:'comp-nv' + (compCustom(k) ? ' custom' : ''), 'aria-selected':String(k === cur),
      onclick:() => COMPWIN.pick(k) }, [h('span', { text:COMP_DEF[k].label }), compCustom(k) ? h('i', { title:'Padrão editado' }) : null]));
  };
  COMPWIN = { pick:k => { cur = k; draw(); } };
  document.body.append(ov);
  draw();
  list.querySelector('[aria-selected="true"]')?.focus();
}

// o padrão em todos os arquivos do projeto (o aberto com desfazer; os outros são regravados)
async function compApplyProject(id) {
  if (!FILES.project) return;
  const mine = S.layers.filter(l => compKindOf(l) === id);
  if (mine.length) { pushUndo(); compApply(mine, id); changed({ props:true, layers:true }); }
  await flushSave();
  const list = ((await DB.get('files')) || []).filter(f => f.project === FILES.project && f.id !== FILES.id);
  let n = mine.length, files = mine.length ? 1 : 0;
  for (const f of list) {
    let st; try { st = JSON.parse(await DB.get('file:' + f.id)); } catch (e) { continue; }
    if (!st || !st.layers) continue;
    const ls = st.layers.filter(l => compKindOf(l) === id); if (!ls.length) continue;
    st.brand = S.brand; compApply(ls, id); n += ls.length; files++;
    await DB.set('file:' + f.id, JSON.stringify(st));
  }
  toast(n ? `Padrão aplicado em ${n} elemento${n > 1 ? 's' : ''}, em ${files} arquivo${files > 1 ? 's' : ''} do projeto` : 'Nenhum elemento desse tipo no projeto');
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
// quantos elementos desse componente existem no projeto (fora o arquivo aberto, que conta pelo S)
async function compCountProject(id) {
  const list = ((await DB.get('files')) || []).filter(f => f.project === FILES.project && f.id !== FILES.id);
  let n = S.layers.filter(l => compKindOf(l) === id).length, files = n ? 1 : 0;
  for (const f of list) { try { const st = JSON.parse(await DB.get('file:' + f.id)); const k = (st.layers || []).filter(l => compKindOf(l) === id).length; if (k) { n += k; files++; } } catch (e) {} }
  return { n, files };
}
// um menu só: primeiro o projeto, depois só este arquivo; sempre pede confirmação dizendo quantos mudam
function compApplyMenu(anchor, id, after) {
  closeMenu();
  const d = COMP_DEF[id], nm = d.label.toLowerCase(), here = S.layers.filter(l => compKindOf(l) === id);
  const item = (text, sub, fn, off) => h('button', { disabled:off || null, onclick:() => { closeMenu(); fn(); } }, [h('span', {}, [text, h('small', { class:'ctx-sub', text:sub })])]);
  const m = h('div', { class:'ctx', role:'menu' }, [
    item('Em todo o projeto', FILES.project ? `Todos os arquivos de "${PROJ_NAMES.get(FILES.project)}"` : 'Este arquivo não está num projeto', async () => {
      const c = await compCountProject(id);
      if (!c.n) { toast(`Nenhum ${nm} no projeto`); return; }
      if (await askConfirm(`Mudar ${c.n} ${nm}${c.n > 1 ? 's' : ''} do projeto?`, `O estilo e a animação de ${c.n} ${nm}${c.n > 1 ? 's' : ''}, em ${c.files} arquivo${c.files > 1 ? 's' : ''}, passam a seguir o padrão. Texto, posição e tempo ficam. Nos outros arquivos não dá para desfazer.`, 'Aplicar no projeto')) { await compApplyProject(id); after && after(); }
    }, !FILES.project),
    item('Só neste arquivo', here.length ? `${here.length} ${nm}${here.length > 1 ? 's' : ''} aqui` : `Nenhum ${nm} neste arquivo`, async () => {
      if (!(await askConfirm(`Mudar ${here.length} ${nm}${here.length > 1 ? 's' : ''} deste arquivo?`, 'O estilo e a animação passam a seguir o padrão. Texto, posição e tempo ficam. Ctrl+Z desfaz.', 'Aplicar no arquivo'))) return;
      pushUndo(); compApply(here, id); changed({ props:true, layers:true }); toast(`Padrão aplicado em ${here.length} ${nm}${here.length > 1 ? 's' : ''}`, 5000, UNDO_ACT); after && after();
    }, !here.length),
  ]);
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mr.width - 8)) + 'px';
  m.style.top = (r.bottom + 4 + mr.height > innerHeight ? Math.max(8, r.top - mr.height - 4) : r.bottom + 4) + 'px';
}
