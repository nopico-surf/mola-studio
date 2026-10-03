/* ============================================================
   Importar SVG como camadas de verdade (pedido do usuário: o que é vetor entra como vetor, contorno como contorno, texto como texto,
   com as propriedades que o arquivo tem; a exportação devolve isso: ver "SVG" em vetor.js).
   Carregado depois do vetor.js e antes do app.js: só declara funções (usa `mkShape`, `parseLogo` etc. na hora da chamada).
   O SVG é desenhado escondido e o navegador resolve o que é difícil (CSS, herança, <style>, matrizes, unidades); cada forma
   (path, rect, circle, ellipse, line, polyline, polygon) vira uma forma Vetor (retângulo e elipse só esticados viram Retângulo e Círculo)
   com preenchimento, degradê linear, regra par-ímpar, contorno (espessura, ponta, junção, tracejado), opacidade e mesclagem; cada <text>
   vira um texto (fonte, peso, itálico, tamanho, cor, espaçamento, alinhamento, linhas e trechos de cor). O que não dá para representar
   (degradê radial, padrão, filtro, máscara, recorte de verdade, <use>, <image>, texto em caminho ou girado) continua um logo SVG só daquele
   pedaço (`svgiIsolate`: o mesmo arquivo sem as outras camadas), como era antes.
   ============================================================ */
const SVGI_SKIP = /^(defs|clipPath|mask|symbol|pattern|marker|linearGradient|radialGradient|style|title|desc|metadata|filter|script|font|switch)$/i;
const SVGI_LEAF = /^(path|rect|circle|ellipse|line|polyline|polygon)$/i;
const SVGI_MAX = 200; // mais camadas que isso: vale o jeito antigo (um logo por grupo)
const SVGI_SYS = /^(arial|helvetica|times|georgia|verdana|courier|tahoma|trebuchet|impact|comic|segoe|sf pro|system-ui|ui-|-apple|sans-serif|serif|monospace|cursive|fantasy|inherit|initial)/i;

const svgiNum = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const svgiCx = document.createElement('canvas').getContext('2d');
// qualquer cor do CSS -> [r, g, b, a]
function svgiRGBA(c) {
  svgiCx.fillStyle = '#000000'; svgiCx.fillStyle = String(c);
  const v = svgiCx.fillStyle;
  if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g).map(Number);
  return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
}
// cor (texto ou [r,g,b,a]) -> '#rrggbb' ou '#rrggbbaa', com a opacidade multiplicada por `mul`
function svgiHex(c, mul = 1) {
  const r = Array.isArray(c) ? c : svgiRGBA(c), a = clamp(r[3] * mul, 0, 1), x = v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + x(r[0]) + x(r[1]) + x(r[2]) + (a < 1 ? x(a * 255) : '');
}
const svgiPt = (M, x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
const svgiTf = (M, O, k) => (x, y) => { const p = svgiPt(M, x, y); return [(p[0] - O.x) * k, (p[1] - O.y) * k]; };

/* ------------ caminho -> só M L C Z absolutos ------------ */
// arco (parâmetros do SVG) -> curvas cúbicas; null = arco sem raio (vira reta)
function svgiArc(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return null;
  const c = Math.cos(phi), s = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, px = c * dx + s * dy, py = -s * dx + c * dy;
  const lam = px * px / (rx * rx) + py * py / (ry * ry);
  if (lam > 1) { const q = Math.sqrt(lam); rx *= q; ry *= q; }
  const num = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px, den = rx * rx * py * py + ry * ry * px * px;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den)), cxp = co * rx * py / ry, cyp = -co * ry * px / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const th1 = Math.atan2((py - cyp) / ry, (px - cxp) / rx), th2 = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx);
  let dth = th2 - th1;
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), step = dth / n, t = 4 / 3 * Math.tan(step / 4), out = [];
  const P = a => [cx + rx * Math.cos(a) * c - ry * Math.sin(a) * s, cy + rx * Math.cos(a) * s + ry * Math.sin(a) * c];
  const D = a => [-rx * Math.sin(a) * c - ry * Math.cos(a) * s, -rx * Math.sin(a) * s + ry * Math.cos(a) * c];
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * step, a2 = a1 + step, p1 = P(a1), p2 = P(a2), d1 = D(a1), d2 = D(a2);
    out.push([p1[0] + t * d1[0], p1[1] + t * d1[1], p2[0] - t * d2[0], p2[1] - t * d2[1], i === n - 1 ? x2 : p2[0], i === n - 1 ? y2 : p2[1]]);
  }
  return out;
}
// o `d` de qualquer path (H V S Q T A, relativos) vira M L C Z absolutos; `tf` leva cada ponto do espaço do path para o destino
// (a matriz é afim, então as curvas continuam certas). Devolve { d, bb } (bb = caixa dos pontos e alças já transformados) ou null
function svgiNormD(d, tf) {
  const s = String(d || ''), reN = /[\s,]*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y, reC = /[\s,]*([a-zA-Z])/y, reF = /[\s,]*([01])/y, r = v => +v.toFixed(5);
  const bb = { x0:Infinity, y0:Infinity, x1:-Infinity, y1:-Infinity };
  let i = 0, o = '', cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lc = null, lq = null, ok = true;
  const num = () => { reN.lastIndex = i; const m = reN.exec(s); if (!m) { ok = false; return 0; } i = reN.lastIndex; return +m[1]; };
  const flag = () => { reF.lastIndex = i; const m = reF.exec(s); if (!m) { ok = false; return 0; } i = reF.lastIndex; return +m[1]; };
  const isNum = () => { reN.lastIndex = i; return reN.test(s); };
  const P = (x, y) => { const q = tf(x, y); bb.x0 = Math.min(bb.x0, q[0]); bb.y0 = Math.min(bb.y0, q[1]); bb.x1 = Math.max(bb.x1, q[0]); bb.y1 = Math.max(bb.y1, q[1]); return `${r(q[0])} ${r(q[1])}`; };
  const cub = (a, b, c, d2, e, f) => { o += `C${P(a, b)} ${P(c, d2)} ${P(e, f)}`; };
  while (ok && i < s.length) {
    reC.lastIndex = i; const mc = reC.exec(s);
    if (mc) { cmd = mc[1]; i = reC.lastIndex; }
    else if (!isNum()) break;
    else if (!cmd) { ok = false; break; }
    const C = cmd.toUpperCase(), rel = cmd !== C, ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') { o += 'Z'; cx = sx; cy = sy; lc = lq = null; cmd = ''; continue; }
    if (C === 'M') { const x = num() + ox, y = num() + oy; o += `M${P(x, y)}`; cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if (!o) { ok = false; break; }
    let x = cx, y = cy;
    if (C === 'L') { x = num() + ox; y = num() + oy; o += `L${P(x, y)}`; lc = lq = null; }
    else if (C === 'H') { x = num() + ox; o += `L${P(x, y)}`; lc = lq = null; }
    else if (C === 'V') { y = num() + oy; o += `L${P(x, y)}`; lc = lq = null; }
    else if (C === 'C' || C === 'S') {
      let c1 = [cx, cy]; if (C === 'C') c1 = [num() + ox, num() + oy]; else if (lc) c1 = [2 * cx - lc[0], 2 * cy - lc[1]];
      const c2 = [num() + ox, num() + oy]; x = num() + ox; y = num() + oy;
      cub(c1[0], c1[1], c2[0], c2[1], x, y); lc = c2; lq = null;
    } else if (C === 'Q' || C === 'T') {
      let q = [cx, cy]; if (C === 'Q') q = [num() + ox, num() + oy]; else if (lq) q = [2 * cx - lq[0], 2 * cy - lq[1]];
      x = num() + ox; y = num() + oy;
      cub(cx + (q[0] - cx) * 2 / 3, cy + (q[1] - cy) * 2 / 3, x + (q[0] - x) * 2 / 3, y + (q[1] - y) * 2 / 3, x, y); lq = q; lc = null;
    } else if (C === 'A') {
      const rx = num(), ry = num(), ph = num() * Math.PI / 180, fa = flag(), fs = flag(); x = num() + ox; y = num() + oy;
      if (ok && !(x === cx && y === cy)) { const a = svgiArc(cx, cy, rx, ry, ph, fa, fs, x, y); if (a) a.forEach(q => cub(...q)); else o += `L${P(x, y)}`; }
      lc = lq = null;
    } else { ok = false; break; }
    cx = x; cy = y;
  }
  return ok && o[0] === 'M' && Number.isFinite(bb.x0) ? { d:o, bb } : null;
}

/* ------------ cores: sólida e degradê linear ------------ */
// degradê linear do SVG (valores já lidos do DOM): paradas, vetor, unidades e gradientTransform; null = não dá (radial, repetir, refletir)
function svgiGradData(g, el, live) {
  if (!g || g.localName.toLowerCase() !== 'lineargradient') return null;
  const chain = [];
  for (let n = g, i = 0; n && i < 10; i++) {
    chain.push(n);
    const href = n.getAttribute('href') || n.getAttribute('xlink:href');
    n = href && href[0] === '#' ? live.querySelector('#' + CSS.escape(href.slice(1))) : null;
    if (n && n.localName.toLowerCase() !== 'lineargradient') n = null;
  }
  const attr = nm => { for (const n of chain) if (n.hasAttribute(nm)) return n.getAttribute(nm); return null; };
  if ((attr('spreadMethod') || 'pad') !== 'pad') return null;
  const src = chain.find(n => n.querySelector(':scope > stop')); if (!src) return null;
  const bbox = attr('gradientUnits') !== 'userSpaceOnUse', vb = live.viewBox.baseVal, vw = vb && vb.width || 1, vh = vb && vb.height || 1;
  const len = (nm, def) => {
    const v = attr(nm); if (v == null) return def;
    const n = parseFloat(v); if (!Number.isFinite(n)) return def;
    return /%\s*$/.test(v) ? n / 100 * (bbox ? 1 : /x/.test(nm) ? vw : vh) : n;
  };
  const x1 = len('x1', 0), y1 = len('y1', 0), x2 = len('x2', bbox ? 1 : vw), y2 = len('y2', 0);
  let last = 0;
  const stops = [...src.querySelectorAll(':scope > stop')].map(s => {
    const cs = getComputedStyle(s), ov = s.getAttribute('offset') || '0';
    let o = parseFloat(ov); o = Number.isFinite(o) ? (/%\s*$/.test(ov) ? o / 100 : o) : 0;
    o = Math.max(clamp(o, 0, 1), last); last = o;
    const c = svgiRGBA(cs.stopColor); c[3] *= svgiNum(cs.stopOpacity, 1);
    return { o, c };
  });
  const vx = x2 - x1, vy = y2 - y1, vv = vx * vx + vy * vy;
  if (!vv || stops.length < 2) return { solid:stops[stops.length - 1].c }; // sem direção ou uma parada só: cor da última
  let GT = new DOMMatrix();
  const gn = chain.find(n => n.hasAttribute('gradientTransform'));
  if (gn) { const t = gn.gradientTransform.baseVal.consolidate(); if (t) GT = new DOMMatrix([t.matrix.a, t.matrix.b, t.matrix.c, t.matrix.d, t.matrix.e, t.matrix.f]); }
  let lb = null; try { const b = el.getBBox(); lb = { x:b.x, y:b.y, width:b.width, height:b.height }; } catch (e) {}
  if (bbox && (!lb || !lb.width || !lb.height)) return null;
  return { stops, x1, y1, vx, vy, vv, bbox, GT, lb };
}
// 'none' | { c } (cor) | { g } (degradê linear) | null (não dá: vira logo)
function svgiPaint(v, live, el) {
  v = String(v || '').trim();
  if (!v || v === 'none') return 'none';
  const m = v.match(/^url\(\s*["']?#([^"')]+)["']?\s*\)\s*(.*)$/);
  if (!m) return { c:v };
  const g = live.querySelector('#' + CSS.escape(m[1]));
  if (!g) return m[2] && m[2] !== 'none' ? { c:m[2] } : 'none';
  const gd = svgiGradData(g, el, live);
  return gd ? (gd.solid ? { c:gd.solid } : { g:gd }) : null;
}
// o degradê na caixa da forma (espaço do desenho, `box` = caixa dela): ângulo e paradas na posição certa. O paintFill estica o degradê
// pela diagonal da caixa, então as paradas são recalculadas para esse comprimento (o resto continua o mesmo de um degradê afim)
function svgiGradFill(gd, M, O, k, box, fo) {
  const A = new DOMMatrix().translate(-box.x, -box.y).multiplySelf(new DOMMatrix().scale(k).translate(-O.x, -O.y).multiplySelf(M));
  const Ai = A.inverse(), GTi = gd.GT.inverse();
  if (![Ai.a, Ai.b, Ai.c, Ai.d, GTi.a, GTi.d].every(Number.isFinite)) return null;
  const uAt = (px, py) => {
    const p = Ai.transformPoint(new DOMPoint(px, py));
    let qx = p.x, qy = p.y;
    if (gd.bbox) { qx = (qx - gd.lb.x) / gd.lb.width; qy = (qy - gd.lb.y) / gd.lb.height; }
    const q = GTi.transformPoint(new DOMPoint(qx, qy));
    return ((q.x - gd.x1) * gd.vx + (q.y - gd.y1) * gd.vy) / gd.vv;
  };
  const u0 = uAt(0, 0), gx = uAt(1, 0) - u0, gy = uAt(0, 1) - u0, gl = Math.hypot(gx, gy);
  if (!(gl > 1e-12)) return null;
  const S = gd.stops, mix = (a, b, f) => a.map((v, j) => v + (b[j] - v) * f);
  const at = u => {
    if (u <= S[0].o) return S[0].c;
    for (let i = 1; i < S.length; i++) if (u <= S[i].o) { const a = S[i - 1], b = S[i]; return mix(a.c, b.c, (u - a.o) / ((b.o - a.o) || 1)); }
    return S[S.length - 1].c;
  };
  const dd = Math.hypot(box.w, box.h) / 2, span = gl * 2 * dd, uc = u0 + gx * box.w / 2 + gy * box.h / 2, uOf = v => uc + (v - .5) * span;
  const ps = [[0, at(uOf(0))]];
  for (const s of S) { const v = .5 + (s.o - uc) / span; if (v > 1e-4 && v < 1 - 1e-4) ps.push([v, s.c]); }
  ps.push([1, at(uOf(1))]);
  const atV = v => { for (let i = 1; i < ps.length; i++) if (v <= ps[i][0]) { const a = ps[i - 1], b = ps[i]; return mix(a[1], b[1], (v - a[0]) / ((b[0] - a[0]) || 1)); } return ps[ps.length - 1][1]; };
  const c1 = svgiHex(ps[0][1], fo), c2 = svgiHex(atV(.55), fo), c3 = svgiHex(ps[ps.length - 1][1], fo);
  return { mode:'linear', c1, c2, c3, c4:c3, angle:+(Math.atan2(gy, gx) * 180 / Math.PI).toFixed(3), motion:0,
    gst:{ key:[c1, c2, c3].join('|'), stops:ps.map(([v, c]) => [+v.toFixed(5), svgiHex(c, fo)]) } };
}

/* ------------ o que a camada do SVG é, antes de saber o tamanho final ------------ */
// recorte que não corta nada: um retângulo que cobre o elemento (o que o Figma põe em volta do quadro)
function svgiClipTrivial(el, cp, live) {
  const m = String(cp).match(/url\(\s*["']?#([^"')]+)/), c = m && live.querySelector('#' + CSS.escape(m[1]));
  if (!c || c.localName !== 'clipPath' || c.getAttribute('clipPathUnits') === 'objectBoundingBox' || c.hasAttribute('transform') || c.hasAttribute('clip-path')) return false;
  const k = [...c.children]; if (k.length !== 1 || k[0].localName !== 'rect' || k[0].hasAttribute('transform') || k[0].hasAttribute('clip-path')) return false;
  const r = k[0], x = svgiNum(r.getAttribute('x')), y = svgiNum(r.getAttribute('y')), w = svgiNum(r.getAttribute('width')), hh = svgiNum(r.getAttribute('height'));
  let b; try { b = el.getBBox(); } catch (e) { return false; }
  const e = .5;
  return x <= b.x + e && y <= b.y + e && x + w >= b.x + b.width - e && y + hh >= b.y + b.height - e;
}
// efeito que só o SVG original sabe desenhar: filtro, máscara, recorte de verdade (e, em grupo, mesclagem)
function svgiComplex(el, cs, live, isG) {
  const att = a => { const v = el.getAttribute(a); return v && v !== 'none' ? v : null; };
  if ((att('filter') || (cs.filter && cs.filter !== 'none')) && !svgiFilterOk(el, live)) return true;
  if (att('mask') || (cs.maskImage && cs.maskImage !== 'none')) return true;
  if (isG && cs.mixBlendMode && cs.mixBlendMode !== 'normal') return true;
  const cp = att('clip-path') || (cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : null);
  return !!cp && !svgiClipTrivial(el, cp, live) && !svgiClipKids(cp, live);
}
// filtro só de desfoque/sombra (o que o Figma exporta): a forma entra sem ele (sombra e desfoque se refazem nas opções de Aparência)
function svgiFilterOk(el, live) {
  const m = String(el.getAttribute('filter') || getComputedStyle(el).filter).match(/url\(\s*["']?#([^"')]+)/), f = m && live.querySelector('#' + CSS.escape(m[1]));
  return !!f && f.localName === 'filter' && [...f.children].every(c => /^(feFlood|feColorMatrix|feBlend|feOffset|feGaussianBlur|feComposite|feDropShadow|feMorphology)$/.test(c.localName));
}
// recorte de verdade feito de formas simples: devolve as formas (o conjunto é a união); null = não dá
function svgiClipKids(cp, live) {
  const m = String(cp).match(/url\(\s*["']?#([^"')]+)/), c = m && live.querySelector('#' + CSS.escape(m[1]));
  if (!c || c.localName !== 'clipPath' || c.getAttribute('clipPathUnits') === 'objectBoundingBox' || c.hasAttribute('transform') || c.hasAttribute('clip-path')) return null;
  const k = [...c.children];
  if (!k.length || k.length > 12 || !k.every(e => SVGI_LEAF.test(e.localName) && !e.hasAttribute('transform') && !e.hasAttribute('clip-path'))) return null;
  return k;
}
const svgiLabel = (el, def) => {
  const raw = el.getAttribute('inkscape:label') || el.getAttribute('data-name') || el.getAttribute('id') || '';
  const nm = raw.replace(/_x([0-9a-f]{2,4})_/gi, (m, c) => String.fromCharCode(parseInt(c, 16))).replace(/_+/g, ' ').trim();
  return /^(path|rect|circle|ellipse|line|polygon|polyline|text|tspan|g|use|image|shape|group)[\s\d-]*$/i.test(nm) ? def : nm.slice(0, 40) || def;
};
// contorno: espessura, ponta, junção, tracejado (em px do vídeo, já na escala `f`)
function svgiStrokeProps(cs, sp, sw, f) {
  const so = svgiNum(cs.strokeOpacity, 1), p = { stroke:true, strokeColor:svgiHex(sp.c, so), strokeW:+(sw * f).toFixed(3), strokePos:'center',
    strokeCap:/^(butt|round|square)$/.test(cs.strokeLinecap) ? cs.strokeLinecap : 'butt', strokeJoin:/^(miter|round|bevel)$/.test(cs.strokeLinejoin) ? cs.strokeLinejoin : 'miter', strokeDash:'solid', strokeGap:1 };
  let da = cs.strokeDasharray === 'none' ? [] : String(cs.strokeDasharray).split(/[\s,]+/).map(parseFloat).filter(Number.isFinite);
  if (da.length % 2) da = da.concat(da);
  if (da.length && da.every(v => v >= 0) && da.reduce((a, b) => a + b, 0) > 0) {
    p.strokeDash = da[0] < sw * .25 && p.strokeCap === 'round' ? 'dot' : 'dash'; // o estilo pronto mais perto; o padrão exato vai em strokeArr
    p.strokeArr = { a:da.map(v => +(v * f).toFixed(3)), k:`${p.strokeDash}|1` };
  }
  return p;
}
function svgiShapeItem(el, cs, M, op, live, clips, label) {
  const tn = el.localName.toLowerCase();
  if (/^(hidden|collapse)$/.test(cs.visibility)) return 'skip';
  if ([cs.getPropertyValue('marker-start'), cs.getPropertyValue('marker-mid'), cs.getPropertyValue('marker-end')].some(v => v && v !== 'none')) return null;
  if (['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r'].some(a => /%/.test(el.getAttribute(a) || ''))) return null;
  const fp = tn === 'line' ? 'none' : svgiPaint(cs.fill, live, el), sp = svgiPaint(cs.stroke, live, el), sw = svgiNum(cs.strokeWidth, 1);
  if (fp === null || sp === null || (sp && sp.g)) return null;
  const hasS = sp !== 'none' && sw > 0, hasF = fp !== 'none';
  if (!hasS && !hasF) return 'skip';
  const ms = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1, pad = hasS ? sw * ms / 2 : 0;
  const num = a => svgiNum(el.getAttribute(a)), straight = Math.abs(M.b) + Math.abs(M.c) < 1e-5 * (Math.abs(M.a) + Math.abs(M.d));
  let nat = null, d = null, root;
  const corners = (x, y, w, hh) => { const q = [svgiPt(M, x, y), svgiPt(M, x + w, y), svgiPt(M, x, y + hh), svgiPt(M, x + w, y + hh)]; return [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]; };
  if (!clips.length && straight && tn === 'rect' && num('width') > 0 && num('height') > 0) {
    const w = num('width'), hh = num('height');
    let rx = svgiNum(el.getAttribute('rx'), NaN), ry = svgiNum(el.getAttribute('ry'), NaN);
    if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry; if (Number.isNaN(ry)) ry = rx;
    rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), hh / 2);
    const rpx = rx * Math.abs(M.a), rpy = ry * Math.abs(M.d);
    if (!rx || Math.abs(rpx - rpy) / rpx < .02) nat = { kind:'rect', box:corners(num('x'), num('y'), w, hh), r:Math.min(rpx, rpy) };
  } else if (!clips.length && straight && (tn === 'circle' || tn === 'ellipse')) {
    const rx = tn === 'circle' ? num('r') : num('rx'), ry = tn === 'circle' ? num('r') : num('ry');
    if (rx > 0 && ry > 0) nat = { kind:'ellipse', box:corners(num('cx') - rx, num('cy') - ry, rx * 2, ry * 2), r:0 };
  }
  if (nat) root = { x0:nat.box[0] - pad, y0:nat.box[1] - pad, x1:nat.box[2] + pad, y1:nat.box[3] + pad };
  else {
    d = tn === 'path' ? el.getAttribute('d') : shapeToD(el);
    const nd = svgiNormD(d, (x, y) => svgiPt(M, x, y)); if (!nd) return 'skip';
    root = { x0:nd.bb.x0 - pad, y0:nd.bb.y0 - pad, x1:nd.bb.x1 + pad, y1:nd.bb.y1 + pad };
  }
  if (![root.x0, root.y0, root.x1, root.y1].every(Number.isFinite)) return 'skip';
  const fo = svgiNum(cs.fillOpacity, 1), blend = cs.mixBlendMode !== 'normal' && BLENDS[cs.mixBlendMode] ? cs.mixBlendMode : null;
  const rule = cs.fillRule === 'evenodd' ? 'evenodd' : null, ctx = { fp, sp, sw, hasS, hasF, ms, fo, cs };
  return { t:'shape', name:label, root, make(O, k) {
    let L, box;
    if (nat) {
      box = { x:(nat.box[0] - O.x) * k, y:(nat.box[1] - O.y) * k, w:(nat.box[2] - nat.box[0]) * k, h:(nat.box[3] - nat.box[1]) * k };
      L = mkShape({ kind:nat.kind, size:box.w / W(), mh:box.h / W(), radius:+(nat.r * k).toFixed(3) });
    } else {
      const nd = svgiNormD(d, svgiTf(M, O, k));
      if (nd && clips.length) { const cd = svgiClipD(nd.d, clips, O, k, rule); if (!cd) return null; nd.d = cd; }
      const v0 = nd && vecParse(nd.d), dd = v0 && vecD(v0), vec = dd && vecParse(dd);
      if (!vec) return null;
      const b = customBox(dd); box = { x:b.x, y:b.y, w:b.w, h:b.h };
      L = mkShape({ kind:'custom', d:dd, vec, vecD:dd, size:b.w / W(), mh:null });
    }
    Object.assign(L, { name:label, rot:0, in:'fade', inDur:BP.fade.dur, out:'cut', idle:'none', opacity:+clamp(op, 0, 1).toFixed(3), fill:true, stroke:false, motion:0 });
    if (blend) L.blend = blend;
    if (rule && !clips.length) L.fillRule = rule;
    let paint = null;
    if (ctx.hasF && ctx.fp.c) { const c = svgiHex(ctx.fp.c, fo); paint = { mode:'solid', c1:c, c2:c, c3:c, c4:c }; }
    else if (ctx.hasF && ctx.fp.g) paint = svgiGradFill(ctx.fp.g, M, O, k, box, fo);
    if (!paint) { const c = ctx.hasS ? svgiHex(ctx.sp.c, 0) : '#00000000'; paint = { mode:'solid', c1:c, c2:c, c3:c, c4:c }; } // sem preenchimento = "sem cor", como no Figma
    Object.assign(L, paint);
    if (ctx.hasS) Object.assign(L, svgiStrokeProps(cs, ctx.sp, ctx.sw, ms * k));
    return { L, cx:box.x + box.w / 2, cy:box.y + box.h / 2 };
  } };
}
// texto: linhas (um <tspan> com y ou dy grande começa outra), trechos com cor/peso/itálico próprios
function svgiTextItem(el, cs, M, op, live, label) {
  if (/^(hidden|collapse)$/.test(cs.visibility)) return 'skip';
  if (el.querySelector('textPath') || Math.abs(M.b) + Math.abs(M.c) > 1e-3 * (Math.abs(M.a) + Math.abs(M.d)) || M.a * M.d < 0) return null; // girado, inclinado ou espelhado: logo
  const fp = svgiPaint(cs.fill, live, el), sp = svgiPaint(cs.stroke, live, el), sw = svgiNum(cs.strokeWidth, 1);
  if (fp === null || sp === null || (fp && fp.g) || (sp && sp.g)) return null;
  const hasS = sp !== 'none' && sw > 0, hasF = fp !== 'none';
  if (!hasS && !hasF) return 'skip';
  const fs = svgiNum(cs.fontSize, 16), ms = Math.sqrt(Math.abs(M.a * M.d)) || 1;
  const raw = []; let cur = null;
  const start = node => { cur = { node, ch:[] }; raw.push(cur); };
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (!cur) start(n); cur.ch.push({ t:c.nodeValue, e:n }); }
      else if (c.nodeType === 1 && /^(tspan|a)$/i.test(c.localName)) {
        const brk = c.hasAttribute('y') || Math.abs(svgiNum(c.getAttribute('dy'))) >= fs * .5;
        if (brk && cur && cur.ch.some(x => x.t.trim())) cur = null;
        if (brk && !cur) start(c);
        walk(c);
      }
    }
  };
  walk(el);
  const lines = [];
  for (const ln of raw) {
    let prevSp = true; const ps = [];
    for (const c of ln.ch) { let t = c.t.replace(/\s+/g, ' '); if (prevSp) t = t.replace(/^ /, ''); if (!t) continue; prevSp = t.endsWith(' '); ps.push({ t, e:c.e }); }
    if (ps.length) ps[ps.length - 1].t = ps[ps.length - 1].t.replace(/ $/, '');
    const kept = ps.filter(p => p.t); if (kept.length) lines.push({ node:ln.node, ps:kept });
  }
  if (!lines.length) return 'skip';
  let ys, bb;
  try {
    ys = lines.map(l => { const p = l.node.getStartPositionOfChar(0); return svgiPt(M, p.x, p.y)[1]; });
    const b = el.getBBox(); bb = [svgiPt(M, b.x, b.y), svgiPt(M, b.x + b.width, b.y + b.height)];
  } catch (e) { return null; }
  const n = lines.length, x0 = Math.min(bb[0][0], bb[1][0]), x1 = Math.max(bb[0][0], bb[1][0]), y0 = Math.min(bb[0][1], bb[1][1]), y1 = Math.max(bb[0][1], bb[1][1]);
  const lh = n > 1 ? clamp((ys[n - 1] - ys[0]) / (n - 1) / (fs * ms), .6, 3) : 1.2;
  const pad = hasS ? sw * ms / 2 : 0, root = { x0:x0 - pad, y0:y0 - pad, x1:x1 + pad, y1:y1 + pad };
  if (![root.x0, root.y0, root.x1, root.y1].every(Number.isFinite)) return null;
  const pst = e => { const c = getComputedStyle(e), f = svgiPaint(c.fill, live, e); return { w:svgiNum(c.fontWeight, 400), i:/^(italic|oblique)/.test(c.fontStyle), c:f && f.c ? svgiHex(f.c) : null }; };
  const base = pst(el), runs = []; let any = false;
  lines.forEach((ln, li) => ln.ps.forEach((p, pi) => {
    const s = pst(p.e), r = { t:p.t };
    if (s.w !== base.w) { r.w = s.w; any = true; }
    if (s.i !== base.i) { r.i = s.i; any = true; }
    if (s.c && s.c !== base.c) { r.c = s.c; any = true; }
    const last = runs[runs.length - 1];
    if (last && last.w === r.w && last.i === r.i && last.c === r.c) last.t += r.t; else runs.push(r);
    if (pi === ln.ps.length - 1 && li < n - 1) runs[runs.length - 1].t += '\n';
  }));
  const text = runs.map(r => r.t).join(''), font = String(cs.fontFamily).split(',')[0].replace(/^[\s"']+|[\s"']+$/g, '') || 'sans-serif';
  const fo = svgiNum(cs.fillOpacity, 1), ls = svgiNum(cs.letterSpacing, 0) / fs, align = { middle:'center', end:'right' }[cs.textAnchor] || 'left';
  return { t:'text', name:svgiLabel(el, text.replace(/\s+/g, ' ').slice(0, 30) || label), root, font, make(O, k) {
    const size = fs * ms * k, lineH = size * lh, cx = ((x0 + x1) / 2 - O.x) * k, cy = (ys[0] - O.y) * k + (n - 1) * lineH / 2 - size * .34;
    const L = mkText('sub', { name:svgiLabel(el, text.replace(/\s+/g, ' ').slice(0, 30) || label), text, font, weight:svgiNum(cs.fontWeight, 400), italic:/^(italic|oblique)/.test(cs.fontStyle),
      size:+size.toFixed(2), color:hasF ? svgiHex(fp.c, fo) : svgiHex('#000000', 0), ls:+ls.toFixed(4), lh:+lh.toFixed(3), align, upper:cs.textTransform === 'uppercase',
      maxW:+Math.min(1, Math.max(.1, ((x1 - x0) * k * 1.3 + size * 3) / W())).toFixed(4), in:'fade', inDur:TP.fade.dur, out:'cut', idle:'none', opacity:+clamp(op, 0, 1).toFixed(3) });
    if (any) L.runs = runs.map(r => ({ ...r }));
    if (hasS) Object.assign(L, svgiStrokeProps(cs, sp, sw, ms * k), { strokeDash:'solid', strokeArr:undefined });
    if (cs.mixBlendMode !== 'normal' && BLENDS[cs.mixBlendMode]) L.blend = cs.mixBlendMode;
    return { L, cx, cy };
  } };
}

// forma recortada: interseção (paper.js) da forma com a união das formas do recorte, tudo já no espaço do desenho
function svgiClipD(d, clips, O, k, rule) {
  if (typeof paper === 'undefined') return null;
  const sc = paperScope();
  try {
    let acc = new sc.CompoundPath({ pathData:d, insert:false }); acc.closed = true; acc.fillRule = rule || 'nonzero';
    for (const c of clips) {
      let u = null;
      for (const e of c.ks) {
        const dd = e.localName.toLowerCase() === 'path' ? e.getAttribute('d') : shapeToD(e), nd = dd && svgiNormD(dd, svgiTf(c.M, O, k)); if (!nd) continue;
        const p = new sc.CompoundPath({ pathData:nd.d, insert:false }); p.closed = true; p.fillRule = (getComputedStyle(e).clipRule === 'evenodd') ? 'evenodd' : 'nonzero';
        u = u ? u.unite(p, { insert:false }) : p;
      }
      if (!u) return null;
      acc = acc.intersect(u, { insert:false });
    }
    const out = acc.pathData; return out || null;
  } catch (e) { console.warn(e); return null; } finally { sc.project.clear(); }
}

/* ------------ o que não dá para representar: o mesmo SVG só com esses elementos ------------ */
function svgiIsolate(tagged, tags) {
  const svg = new DOMParser().parseFromString(tagged, 'image/svg+xml').documentElement, want = new Set(tags.map(String)), keep = new Set();
  for (const e of svg.querySelectorAll('*')) if (want.has(e.getAttribute('data-mi'))) for (let n = e; n && n !== svg; n = n.parentNode) keep.add(n);
  const prune = n => {
    for (const c of [...n.children]) {
      if (!SVG_TAGS.test(c.localName) || want.has(c.getAttribute('data-mi'))) continue; // defs, estilos e gradientes ficam
      if (keep.has(c)) prune(c); else c.remove();
    }
  };
  prune(svg);
  [svg, ...svg.querySelectorAll('*')].forEach(e => e.removeAttribute('data-mi'));
  return new XMLSerializer().serializeToString(svg);
}

/* ------------ SVG -> lista de camadas (cada uma com `make(O, k)`: O = centro do conjunto, k = escala para o quadro) ------------ */
// <use> vira uma cópia de verdade do que ele aponta (transform + x/y), para entrar como forma e não como logo
function svgiExpandUse(svg) {
  for (let pass = 0; pass < 6; pass++) {
    const us = [...svg.querySelectorAll('use')]; if (!us.length) return;
    for (const u of us) {
      const ref = (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^#/, ''), t = ref && svg.querySelector('#' + CSS.escape(ref));
      if (!t || t.contains(u) || /^(svg|symbol)$/i.test(t.localName)) { if (pass > 4 || !t || /^(svg|symbol)$/i.test(t.localName)) u.setAttribute('data-nouse', '1'); if (!(t && !t.contains(u) && !/^(svg|symbol)$/i.test(t.localName))) continue; }
      const g = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g'), cl = t.cloneNode(true);
      cl.removeAttribute('id');
      for (const a of [...u.attributes]) if (!/^(href|xlink:href|x|y|width|height|id)$/.test(a.name) && a.name !== 'data-nouse') g.setAttribute(a.name, a.value);
      const x = parseFloat(u.getAttribute('x')) || 0, y = parseFloat(u.getAttribute('y')) || 0;
      if (x || y) g.setAttribute('transform', (g.getAttribute('transform') || '') + ` translate(${x} ${y})`);
      if (u.getAttribute('id')) g.setAttribute('id', u.getAttribute('id'));
      g.appendChild(cl); u.replaceWith(g);
    }
  }
}
async function svgImportItems(norm) {
  const svg = sanitizeSvg(norm); svgiExpandUse(svg);
  [svg, ...svg.querySelectorAll('*')].forEach((e, i) => e.setAttribute('data-mi', i));
  const tagged = new XMLSerializer().serializeToString(svg);
  const host = h('div', { style:'position:fixed;left:-99999px;top:0;width:800px;height:800px;opacity:0;pointer-events:none' }), live = document.importNode(svg, true);
  if (!live.getAttribute('viewBox')) live.setAttribute('viewBox', `0 0 ${parseFloat(live.getAttribute('width')) || 300} ${parseFloat(live.getAttribute('height')) || 150}`);
  live.setAttribute('width', '800'); live.setAttribute('height', '800');
  host.appendChild(live); document.body.appendChild(host);
  const items = [], cnt = {};
  try {
    const rootInv = live.getScreenCTM().inverse();
    const lab = (el, label) => svgiLabel(el, '') || `${label} ${cnt[label] = (cnt[label] || 0) + 1}`;
    const raw = (el, name) => {
      const last = items[items.length - 1], tag = el.getAttribute('data-mi');
      if (last && last.t === 'raw') { last.tags.push(tag); last.name = 'Formas'; } else items.push({ t:'raw', tags:[tag], name:svgiLabel(el, 'Formas') });
    };
    const clipsOf = (el, cs, clips) => {
      const cp = el.getAttribute('clip-path') || (cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : null);
      if (!cp || cp === 'none' || svgiClipTrivial(el, cp, live)) return clips;
      const ks = svgiClipKids(cp, live); if (!ks) return clips;
      const M = rootInv.multiply(el.getScreenCTM());
      return clips.concat([{ ks, M }]);
    };
    const walk = (parent, op, clips) => {
      for (const el of parent.children) {
        const tn = el.localName.toLowerCase();
        if (SVGI_SKIP.test(tn)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const o = op * svgiNum(cs.opacity, 1);
        if (/^(g|a|svg)$/.test(tn)) { if (svgiComplex(el, cs, live, true)) raw(el); else walk(el, o, clipsOf(el, cs, clips)); continue; }
        const isLeaf = SVGI_LEAF.test(tn), isText = tn === 'text';
        if (!isLeaf && !isText && !/^(use|image)$/.test(tn)) continue;
        if (/^(hidden|collapse)$/.test(cs.visibility)) continue;
        let r = null;
        if ((isLeaf || isText) && !svgiComplex(el, cs, live, false)) {
          try {
            const M = rootInv.multiply(el.getScreenCTM());
            const cl = clipsOf(el, cs, clips);
            r = isText ? (cl.length ? null : svgiTextItem(el, cs, M, o, live, lab(el, 'Texto'))) : svgiShapeItem(el, cs, M, o, live, cl, lab(el, tn === 'path' || tn === 'line' || tn === 'polyline' || tn === 'polygon' ? 'Vetor' : tn === 'rect' ? 'Retângulo' : 'Círculo'));
          } catch (e) { console.warn(e); r = null; }
        }
        if (r === 'skip') continue;
        if (r) items.push(r); else raw(el);
      }
    };
    walk(live, 1, []);
  } finally { host.remove(); }
  const out = [];
  for (const it of items) {
    if (it.t !== 'raw') { out.push(it); continue; }
    const text = svgiIsolate(tagged, it.tags), logo = { kind:'svg', text, name:it.name };
    try {
      const lg = await parseLogo(logo);
      if (!lg || !(lg.parts.length || lg.pen || lg.extras)) continue;
      LGC.set(text, lg);
      out.push({ t:'raw', name:it.name, root:{ x0:lg.bx, y0:lg.by, x1:lg.bx + lg.bw, y1:lg.by + lg.bh }, make(O, k) {
        const L = mkLogo('logoSmall', { name:it.name, svg:logo, size:+(lg.bw * k / W()).toFixed(5), in:'fade', inDur:BP.fade.dur, idle:'none' });
        return { L, cx:(lg.bx + lg.bw / 2 - O.x) * k, cy:(lg.by + lg.bh / 2 - O.y) * k };
      } });
    } catch (e) { console.warn(e); }
  }
  return out;
}
// fontes do texto que não estão no arquivo: Google Fonts entram na lista da marca (fonte do sistema fica como está)
async function svgiFonts(list) {
  const fams = [...new Set(list.filter(i => i.t === 'text').map(i => i.font))].filter(f => f && !SVGI_SYS.test(f) && !S.brand.loaded.some(l => l.family.toLowerCase() === f.toLowerCase()));
  for (const f of fams) if (await loadGoogleFont(f)) S.brand.loaded.push({ family:f, src:'google' });
  if (fams.length) renderBrand();
}
// importa o SVG como camadas nativas; false = não deu (quem chamou segue o caminho antigo: um logo por grupo)
async function addSvgNative(norm, name, pos) {
  let list;
  try { list = await svgImportItems(norm); } catch (e) { console.warn(e); return false; }
  if (!list || !list.length || list.length > SVGI_MAX) return false;
  try { await svgiFonts(list); } catch (e) { console.warn(e); }
  const x0 = Math.min(...list.map(i => i.root.x0)), x1 = Math.max(...list.map(i => i.root.x1)), y0 = Math.min(...list.map(i => i.root.y0)), y1 = Math.max(...list.map(i => i.root.y1));
  const bf = baseFmt(), F = FORMATS[bf], O = { x:(x0 + x1) / 2, y:(y0 + y1) / 2 };
  const k = Math.min(.4 * W() / Math.max(x1 - x0, 1e-6), .7 * F.h / Math.max(y1 - y0, 1e-6)); // o conjunto ocupa .4 da largura, como um SVG só
  const made = list.map(i => i.make(O, k)).filter(Boolean);
  if (!made.length) return false;
  if (made.length === 1) { // um elemento só: entra como qualquer elemento novo (centro, altura livre, no frame escolhido)
    const L = made[0].L; L.x = .5; L.y = .42;
    addLayer(L, pos || {}); toast('SVG adicionado');
    return true;
  }
  pushUndo();
  const fr = pos ? null : insertTarget(), win = fr && gwin(fr);
  const st = win ? win.start : S.still ? 0 : nextStart(), end = win ? win.end : S.duration;
  const si = pos || fr ? 0 : curSlide(), cx = pos ? pos.x : .5 + si, cy = pos ? pos.y : freeY(.42, st, si);
  const step = S.still ? 0 : clamp(Math.min((end - .5 - st) / made.length, 1.2 / made.length), 0, .12);
  const Ls = made.map(({ L, cx:dx, cy:dy }, i) => {
    L.start = +(st + i * step).toFixed(3); L.end = end;
    L.x = +(cx + dx / F.w).toFixed(5); L.y = +(cy + dy / F.h).toFixed(5);
    if (pos) setPos(L, L.x, L.y);
    return L;
  });
  S.layers.push(...Ls);
  if (fr) intoFrame(fr, Ls);
  else { const gid = 'g' + Math.random().toString(36).slice(2, 7); Ls.forEach(l => { l.grp = gid; }); gmeta(gid, true).name = name || 'SVG'; }
  RT.picks = new Set(Ls.map(l => l.id)); RT.selected = Ls[Ls.length - 1].id; propTab = 'style';
  renderProps(); changed({ layers:true }); seekLayers(Ls); RT.userSeek = false;
  const nv = Ls.filter(l => l.type === 'shape').length, nt = Ls.filter(l => l.type === 'text').length, nl = Ls.filter(l => l.type === 'logo').length;
  toast(`SVG em ${Ls.length} camadas: ${[nv && `${nv} vetor${nv > 1 ? 'es' : ''}`, nt && `${nt} texto${nt > 1 ? 's' : ''}`, nl && `${nl} logo${nl > 1 ? 's' : ''}`].filter(Boolean).join(', ')}`, 4200);
  return true;
}
