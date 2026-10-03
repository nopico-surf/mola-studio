/* ============================================================
   Vetor: contorno e texto viram formas Vetor; o quadro e a seleção saem em SVG
   ============================================================
   Carregado antes do app.js (só declara funções; usa S, RT, h, toast, geomNow, shapePts etc. na hora da chamada).
   - Contorno (stroke) de forma, botão e foto com máscara -> `outlineStroke`: as pontas, os cantos, o tracejado e dentro/centro/fora saem de
     contas próprias; polygon-clipping (vendor/polygon-clipping.min.js) junta os pedaços numa silhueta só, sem sobreposição.
   - Texto -> `textToVector`: o desenho das letras vem do arquivo da fonte (fontkit, vendor/fontkit.min.js, carregado só na hora de usar).
     Google Fonts: o arquivo TTF vem do repositório google/fonts (o METADATA.pb diz qual); fonte enviada: do próprio arquivo.
   - SVG -> `exportSvg`: o quadro da agulha (ou a seleção) em repouso, sem animação. Texto sai em curvas. */

/* ------------ contorno: curvas -> linhas -> traço com espessura ------------ */
const VEC_EPS = 1e-4;
const dedupPts = P => { const o = []; for (const q of P) { const l = o[o.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > VEC_EPS) o.push(q); } return o; };
// quantos pedaços para a linha não se afastar da curva mais que FLAT_TOL nem virar mais que ~6° por pedaço (o ajuste de curvas no fim
// precisa da curva bem amostrada para achar os cantos de verdade)
const FLAT_TOL = .02;
function bezSteps(a, b) {
  const L = Math.max(Math.hypot(a.x - 2 * a.ox + b.ix, a.y - 2 * a.oy + b.iy), Math.hypot(a.ox - 2 * b.ix + b.x, a.oy - 2 * b.iy + b.y));
  const legs = [[a.ox - a.x, a.oy - a.y], [b.ix - a.ox, b.iy - a.oy], [b.x - b.ix, b.y - b.iy]].filter(v => Math.hypot(v[0], v[1]) > 1e-6);
  let turn = 0;
  for (let i = 1; i < legs.length; i++) { const u = legs[i - 1], v = legs[i]; turn += Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); }
  return clamp(Math.max(Math.ceil(Math.sqrt(.75 * L / FLAT_TOL)), Math.ceil(turn / .1)), 2, 400);
}
// caminhos com curvas (vec) -> polilinhas [{ pts:[[x, y]...], closed }]
function flatSubs(vec) {
  const out = [];
  for (const sp of vec) {
    const P = sp.pts, n = P.length; if (n < 2) continue;
    const m = sp.closed ? n : n - 1, pts = [[P[0].x, P[0].y]];
    for (let j = 0; j < m; j++) {
      const a = P[j], b = P[(j + 1) % n];
      if (hasH(a, 'o') || hasH(b, 'i')) {
        const N = bezSteps(a, b);
        for (let i = 1; i < N; i++) { const q = bezAt(a, b, i / N); pts.push([q.x, q.y]); }
      }
      pts.push([b.x, b.y]);
    }
    const d = dedupPts(pts);
    if (sp.closed && d.length > 1 && Math.hypot(d[0][0] - d[d.length - 1][0], d[0][1] - d[d.length - 1][1]) <= VEC_EPS) d.pop();
    if (d.length > 1) out.push({ pts:d, closed:!!sp.closed && d.length > 2 });
  }
  return out;
}
// corta o caminho em pedaços abertos pelo padrão traço/vão (o mesmo do canvas); devolve null se o padrão é fino demais
function dashSplit(sp, pat) {
  const P = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts, pt = pat.length % 2 ? pat.concat(pat) : pat, out = [];
  let idx = 0, rem = Math.max(pt[0], 1e-3), on = true, cur = [P[0]];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-9) continue;
    let pos = 0;
    while (len - pos > rem) {
      pos += rem; const f = pos / len, q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      if (on) { cur.push(q); out.push(cur); cur = null; } else cur = [q];
      on = !on; idx = (idx + 1) % pt.length; rem = Math.max(pt[idx], 1e-3);
      if (out.length > 8000) return null;
    }
    rem -= len - pos; if (on && cur) cur.push(b);
  }
  if (on && cur && cur.length > 1) out.push(cur);
  return out;
}
// o polygon-clipping às vezes se perde com muitos pedaços quase colados: tenta de novo com os pontos mais arredondados e, por último, um pedaço por vez
function unionPolys(pcs) {
  const snap = (v, q) => Math.round(v * q) / q;
  for (const q of [0, 100, 20, 4]) {
    const use = q ? pcs.map(p => p.map(r => r.map(c => [snap(c[0], q), snap(c[1], q)]))) : pcs;
    try { return unionPolys0(use); } catch (e) { if (q === 4) console.warn(e); }
  }
  let acc = []; // um por vez, pulando quem não entra
  for (const p of pcs) { try { acc = acc.length ? polygonClipping.union(acc, p) : [p]; } catch (e) { /* pedaço pequeno que não cabe: fica de fora */ } }
  return acc;
}
function unionPolys0(pcs) {
  if (!pcs.length) return [];
  const parts = [];
  for (let i = 0; i < pcs.length; i += 300) { const c = pcs.slice(i, i + 300); parts.push(polygonClipping.union(c[0], ...c.slice(1))); }
  return parts.length > 1 ? polygonClipping.union(...parts) : parts[0];
}
// o traço de largura o.w sobre as polilinhas, como o canvas desenha (cantos round | miter | bevel, pontas round | butt | square, tracejado).
// Como o Skia/Figma: cada caminho vira um anel só (lado esquerdo pra frente, ponta, lado direito pra trás, ponta); no lado de dentro de uma
// curva o anel passa pelo ponto do meio e se cruza, e a união (polygon-clipping, que conta as voltas: dentro = volta diferente de 0) desfaz os
// cruzamentos. Antes era um polígono por trecho e por canto: centenas de bordas quase coincidentes, e a união deixava lascas e buracos
function strokeMulti(subs, o) {
  const h = o.w / 2, pcs = [], r3 = v => Math.round(v * 1000) / 1000;
  const da = clamp(2 * Math.acos(clamp(1 - FLAT_TOL / Math.max(h, .05), -1, 1)), .02, .1);
  const off = (v, d, s) => [v[0] - s * d[1] * h, v[1] + s * d[0] * h]; // s = 1: lado esquerdo (normal [-dy, dx]); -1: direito
  const arcIn = (c, a0, dl, out) => { const n = Math.ceil(Math.abs(dl) / da); for (let i = 1; i < n; i++) { const a = a0 + dl * i / n; out.push([c[0] + Math.cos(a) * h, c[1] + Math.sin(a) * h]); } };
  const ang = p => Math.atan2(p[1], p[0]);
  // canto do lado s em v (chegada d0, saída d1): o lado de fora ganha o canto (redondo, vivo ou chanfrado); o de dentro passa pelo meio
  // (l0/l1 = tamanho dos trechos: se os dois lados de dentro se cruzam antes da metade de cada um, fica só o cruzamento, sem voltas a desfazer)
  const join = (v, d0, d1, s, out, wedge, l0, l1) => {
    const o0 = off(v, d0, s), o1 = off(v, d1, s), cr = d0[0] * d1[1] - d0[1] * d1[0], dt = d0[0] * d1[0] + d0[1] * d1[1];
    if (Math.abs(cr) < 1e-9 && dt > 0) { out.push(o0); return; }
    const outer = Math.abs(cr) < 1e-9 || cr * s < 0;
    if (!outer) {
      if (wedge) return;
      const t = h * Math.abs(cr) / (1 + dt); // do ponto deslocado até o cruzamento = h·tan(virada/2)
      if (dt > 0 && l0 && t <= l0 / 2 && t <= l1 / 2) out.push([(o0[0] + o1[0]) / 2 + ((o0[0] + o1[0]) / 2 - v[0]) * (1 - dt) / (1 + dt), (o0[1] + o1[1]) / 2 + ((o0[1] + o1[1]) / 2 - v[1]) * (1 - dt) / (1 + dt)]);
      else out.push(o0, v, o1);
      return;
    }
    out.push(o0);
    if (o.join === 'round') {
      let dl = Math.abs(cr) < 1e-9 ? -s * Math.PI : ang([o1[0] - v[0], o1[1] - v[1]]) - ang([o0[0] - v[0], o0[1] - v[1]]); // volta em cima de si: meio círculo pela frente
      while (dl > Math.PI) dl -= TAU; while (dl < -Math.PI) dl += TAU;
      arcIn(v, ang([o0[0] - v[0], o0[1] - v[1]]), dl, out);
    } else if (o.join === 'miter' && dt > -.99 && 1 / Math.sqrt((1 + dt) / 2) <= 10) out.push([(o0[0] + o1[0]) / 2 + ((o0[0] + o1[0]) / 2 - v[0]) * (1 - dt) / (1 + dt), (o0[1] + o1[1]) / 2 + ((o0[1] + o1[1]) / 2 - v[1]) * (1 - dt) / (1 + dt)]);
    out.push(o1);
  };
  const dirs = P => { const D = []; for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], l = Math.hypot(dx, dy); D.push([dx / l, dy / l]); } return D; };
  const side = (P, D, s) => {
    const m = D.length, out = [off(P[0], D[0], s)], len = j => Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]);
    for (let j = 1; j < m; j++) join(P[j], D[j - 1], D[j], s, out, false, len(j - 1), len(j));
    out.push(off(P[m], D[m - 1], s)); return out;
  };
  // ponta em p, saindo na direção d, do lado esquerdo para o direito
  const cap = (p, d, cp, out) => {
    if (cp === 'square') out.push([p[0] - d[1] * h + d[0] * h, p[1] + d[0] * h + d[1] * h], [p[0] + d[1] * h + d[0] * h, p[1] - d[0] * h + d[1] * h]);
    else if (cp === 'round') arcIn(p, ang([-d[1], d[0]]), -Math.PI, out);
  };
  const add = ring => { if (ring.length > 2) pcs.push([ring.map(q => [r3(q[0]), r3(q[1])])]); };
  const ring = (P, cp) => {
    const D = dirs(P), m = D.length, L = side(P, D, 1), R = side(P, D, -1).reverse();
    cap(P[m], D[m - 1], cp, L); L.push(...R); cap(P[0], [-D[0][0], -D[0][1]], cp, L);
    add(L);
  };
  const line = (P, closed) => {
    if (!closed) { ring(P, o.cap); return; }
    // fechado: abre no ponto que menos vira (pontas retas que se encontram) e o canto que falta nesse ponto vira uma cunha à parte
    const n = P.length, D = dirs([...P, P[0]]);
    let k = 0, best = Infinity;
    for (let j = 0; j < n; j++) { const d0 = D[(j - 1 + n) % n], d1 = D[j], t = Math.abs(Math.atan2(d0[0] * d1[1] - d0[1] * d1[0], d0[0] * d1[0] + d0[1] * d1[1])); if (t < best - 1e-9) { best = t; k = j; } }
    const Q = [...P.slice(k), ...P.slice(0, k), P[k]];
    ring(Q, 'butt');
    for (const s of [1, -1]) { const w = []; join(P[k], D[(k - 1 + n) % n], D[k], s, w, true); if (w.length > 1) add([P[k], ...w]); }
  };
  for (const sp of subs) {
    const parts = o.dash && o.dash.length ? dashSplit(sp, o.dash) : null;
    if (parts) parts.forEach(pp => { const q = dedupPts(pp); if (q.length > 1) line(q, false); });
    else line(sp.pts, sp.closed);
  }
  return unionPolys(pcs);
}
/* ------------ polígono -> curvas, como o "Outline stroke" do Figma: poucos pontos, curva lisa onde a borda é lisa, canto onde é canto ------------ */
const ringArea = P => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// tira pontos repetidos e pontas de largura zero (o caminho vai e volta pela mesma linha)
function despike(P) {
  let out = []; // pontos a menos de 0,02 px um do outro: sobra de arredondamento (a direção do pedacinho entre eles é ruído)
  for (const q of P) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > .02) out.push(q); }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= .02) out.pop();
  for (let pass = 0, hit = true; hit && pass < 20 && out.length > 3; pass++) {
    hit = false; const n = out.length, keep = [];
    for (let i = 0; i < n; i++) {
      const a = out[(i - 1 + n) % n], q = out[i], b = out[(i + 1) % n], ux = q[0] - a[0], uy = q[1] - a[1], vx = b[0] - q[0], vy = b[1] - q[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < VEC_EPS || (lv > VEC_EPS && (ux * vx + uy * vy) / (lu * lv) < -.985 && Math.abs(ux * vy - uy * vx) / Math.max(lu, lv) < .05)) { hit = true; continue; }
      keep.push(q);
    }
    out = keep;
  }
  return out;
}
const v2n = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const bez3 = (c, t) => { const u = 1 - t; return [u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0], u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]]; };
// uma cúbica por pts[first..last] (mínimos quadrados de Schneider, Graphics Gems; o mesmo do paper.js), ou null se não fica a menos de
// tol (tol2 = ao quadrado) de todos os pontos. t1 = direção saindo de first, t2 = chegando em last (apontando para trás)
function fit1(pts, first, last, t1, t2, tol2) {
  const p0 = pts[first], p3 = pts[last], ch = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  if (last - first === 1 && ch > 1e-9) { // dois pontos: reta só se as direções das pontas seguem a corda; senão é um pedaço da curva
    const cx = (p3[0] - p0[0]) / ch, cy = (p3[1] - p0[1]) / ch, d = ch / 3;
    if (t1[0] * cx + t1[1] * cy > .9998 && -(t2[0] * cx + t2[1] * cy) > .9998) return [p0, p0, p3, p3];
    return [p0, [p0[0] + t1[0] * d, p0[1] + t1[1] * d], [p3[0] + t2[0] * d, p3[1] + t2[1] * d], p3];
  }
  // uma curva não vira mais que ~95° (como os arcos do Figma: um círculo = 4 curvas); com mais, cabia na tolerância neste tamanho mas
  // ficava ovalada ao aumentar a forma depois
  if (last - first > 1 && -(t1[0] * t2[0] + t1[1] * t2[1]) < -.09) return null;
  let straight = ch > 1e-9;
  for (let i = first + 1; i < last && straight; i++) straight = Math.pow((pts[i][0] - p0[0]) * (p3[1] - p0[1]) - (pts[i][1] - p0[1]) * (p3[0] - p0[0]), 2) / (ch * ch) <= tol2;
  if (straight || last - first === 1) return [p0, p0, p3, p3]; // reta: sem alças
  let u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = u[u.length - 1] || 1; u = u.map(v => v / tot);
  const gen = () => {
    const C = [[0, 0], [0, 0]], X = [0, 0];
    for (let i = 0; i <= last - first; i++) {
      const t = u[i], s = 1 - t, b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t, a1 = [t1[0] * b1, t1[1] * b1], a2 = [t2[0] * b2, t2[1] * b2];
      const q = pts[first + i], tx = q[0] - p0[0] * (b0 + b1) - p3[0] * (b2 + b3), ty = q[1] - p0[1] * (b0 + b1) - p3[1] * (b2 + b3);
      C[0][0] += a1[0] * a1[0] + a1[1] * a1[1]; C[0][1] += a1[0] * a2[0] + a1[1] * a2[1]; C[1][1] += a2[0] * a2[0] + a2[1] * a2[1];
      X[0] += a1[0] * tx + a1[1] * ty; X[1] += a2[0] * tx + a2[1] * ty;
    }
    C[1][0] = C[0][1];
    const det = C[0][0] * C[1][1] - C[1][0] * C[0][1];
    let al1, al2;
    if (Math.abs(det) > 1e-12) { al1 = (X[0] * C[1][1] - X[1] * C[0][1]) / det; al2 = (C[0][0] * X[1] - C[1][0] * X[0]) / det; }
    else { const c0 = C[0][0] + C[0][1], c1 = C[1][0] + C[1][1]; al1 = al2 = Math.abs(c0) > 1e-12 ? X[0] / c0 : Math.abs(c1) > 1e-12 ? X[1] / c1 : 0; }
    const eps = 1e-12 * ch, lx = p3[0] - p0[0], ly = p3[1] - p0[1];
    if (al1 < eps || al2 < eps || (t1[0] * al1 - t2[0] * al2) * lx + (t1[1] * al1 - t2[1] * al2) * ly > ch * ch) al1 = al2 = ch / 3;
    return [p0, [p0[0] + t1[0] * al1, p0[1] + t1[1] * al1], [p3[0] + t2[0] * al2, p3[1] + t2[1] * al2], p3];
  };
  let prevErr = Infinity;
  for (let it = 0; it <= 12; it++) {
    const c = gen(); let err = 0;
    for (let i = first + 1; i < last; i++) { const p = bez3(c, u[i - first]), d = (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2; if (d > err) err = d; }
    if (err <= tol2) return c;
    if (err > 100 * tol2 || (err >= prevErr * .995 && it > 2)) break; // longe demais ou parou de melhorar
    prevErr = err;
    // Newton-Raphson: aproxima o parâmetro de cada ponto do ponto mais perto na curva
    const d1 = [0, 1, 2].map(k => [3 * (c[k + 1][0] - c[k][0]), 3 * (c[k + 1][1] - c[k][1])]), d2 = [0, 1].map(k => [2 * (d1[k + 1][0] - d1[k][0]), 2 * (d1[k + 1][1] - d1[k][1])]);
    let ok = true;
    for (let i = 1; i < u.length - 1; i++) {
      const t = u[i], s = 1 - t, p = bez3(c, t), q = pts[first + i];
      const v1 = [s * s * d1[0][0] + 2 * s * t * d1[1][0] + t * t * d1[2][0], s * s * d1[0][1] + 2 * s * t * d1[1][1] + t * t * d1[2][1]];
      const v2 = [s * d2[0][0] + t * d2[1][0], s * d2[0][1] + t * d2[1][1]], dx = p[0] - q[0], dy = p[1] - q[1];
      const den = v1[0] * v1[0] + v1[1] * v1[1] + dx * v2[0] + dy * v2[1];
      if (Math.abs(den) > 1e-12) u[i] = clamp(t - (dx * v1[0] + dy * v1[1]) / den, 0, 1);
      if (u[i] <= u[i - 1]) ok = false;
    }
    if (!ok) break;
  }
  return null;
}
// trecho liso pts[0..m] -> cúbicas em out: do começo, o maior pedaço que cabe numa curva (busca binária), e segue dali. Dividir no ponto de
// maior erro (o Schneider clássico) partia um semicírculo em 5; assim sai com o mínimo de pontos. t1/t2 como em fit1
function fitRun(pts, t1, t2, tol2, out) {
  const m = pts.length - 1, tan = i => v2n(pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]);
  let s = 0, ts = t1;
  while (s < m) {
    const c = fit1(pts, s, m, ts, t2, tol2);
    if (c) { out.push(c); return; }
    let lo = s + 1, hi = m, best = null; // lo sempre cabe (dois pontos), hi não
    while (hi - lo > 1) { const mid = (lo + hi) >> 1, tm = tan(mid), cm = fit1(pts, s, mid, ts, [-tm[0], -tm[1]], tol2); if (cm) { lo = mid; best = cm; } else hi = mid; }
    const tl = tan(lo);
    out.push(best || fit1(pts, s, lo, ts, [-tl[0], -tl[1]], Infinity)); ts = tl; s = lo;
  }
}
// direção da curva saindo de A (B e C = os pontos seguintes): derivada da parábola que passa pelos três. Só o primeiro pedaço (A -> B) erra
// meio passo da tangente de verdade, e o ajuste acabava dividindo um arco simples em vários pedaços
function endTan(A, B, C) {
  const t1 = Math.hypot(B[0] - A[0], B[1] - A[1]), ch = v2n(B[0] - A[0], B[1] - A[1]);
  if (!C) return ch;
  const t2 = t1 + Math.hypot(C[0] - B[0], C[1] - B[1]); if (t2 - t1 < 1e-9) return ch;
  const a = t2 / (t1 * (t2 - t1)), b = t1 / (t2 * (t2 - t1)), d = v2n((B[0] - A[0]) * a - (C[0] - A[0]) * b, (B[1] - A[1]) * a - (C[1] - A[1]) * b);
  return d[0] * ch[0] + d[1] * ch[1] > .94 ? d : ch; // mais de ~20° da corda: ruído, fica a corda
}
// anel fechado (polígono denso) -> pontos do vetor; tol em px
function fitRing(P, tol) {
  const n = P.length; if (n < 3) return null;
  const dir = i => { const a = P[i], b = P[(i + 1) % n]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const T = P.map((_, i) => { const d = dir(i) - dir((i - 1 + n) % n); return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); });
  // canto: virada de mais de ~14° (curva e arco saem amostrados a no máximo ~6° por pedaço, `bezSteps`/`da`), ou bem maior que a dos vizinhos
  const cs = [];
  T.forEach((t, i) => { if (t > .25 || (t > .12 && t > 3 * Math.max(T[(i - 1 + n) % n], T[(i + 1) % n]))) cs.push(i); });
  const out = [], tol2 = tol * tol;
  if (!cs.length) {
    const pts = [...P, P[0]], t = v2n(P[1][0] - P[n - 1][0], P[1][1] - P[n - 1][1]);
    fitRun(pts, t, [-t[0], -t[1]], tol2, out);
  } else {
    for (let k = 0; k < cs.length; k++) {
      const a = cs[k], b = cs[(k + 1) % cs.length], pts = [];
      for (let i = a; ; i = (i + 1) % n) { pts.push(P[i]); if (i === b && pts.length > 1) break; }
      const m = pts.length - 1;
      fitRun(pts, endTan(pts[0], pts[1], m > 1 && pts[2]), endTan(pts[m], pts[m - 1], m > 1 && pts[m - 2]), tol2, out);
    }
  }
  const V = [];
  for (const c of out) {
    if (!V.length) V.push(vecPt(c[0][0], c[0][1]));
    const l = V[V.length - 1]; l.ox = c[1][0]; l.oy = c[1][1];
    V.push({ x:c[3][0], y:c[3][1], ix:c[2][0], iy:c[2][1], ox:c[3][0], oy:c[3][1] });
  }
  const f = V[0], z = V.pop(); f.ix = z.ix; f.iy = z.iy; // o último é o primeiro de novo
  return V.length > 1 ? V : null;
}
// resultado do polygon-clipping (MultiPolygon) -> subcaminhos do vetor em curvas. f = ponto do cálculo -> tela; w = espessura do traço na tela
// (lasca: anel com área de nada ou mais fino que um vigésimo do traço, sobra da união dos pedaços)
function ringsToVec(res, f, w) {
  const subs = [], tol = clamp(w / 80, .05, .12);
  for (const poly of res) for (const ring of poly) {
    const P = despike(ring.slice(0, -1).map(q => f(q[0], q[1])));
    if (P.length < 3) continue;
    const A = Math.abs(ringArea(P)), per = P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
    if (A < .01 || 2 * A / per < w * .05) continue;
    const pts = fitRing(P, tol) || P.map(q => vecPt(q[0], q[1]));
    subs.push({ closed:true, pts });
  }
  return subs;
}
// pontos da forma no espaço dela (centro em 0, sem escala nem giro); null se o caminho tem arcos
function localVec(L, G) {
  if (L.kind !== 'custom') return shapePts(L, G);
  const vec = vecOf(L), b = G.cust; if (!vec || !b) return null;
  const s = G.w / b.w, bx = b.x + b.w / 2, by = b.y + b.h / 2, f = (x, y) => [(x - bx) * s, (y - by) * s];
  return vec.map(sp => ({ closed:sp.closed, pts:sp.pts.map(p => { const q = f(p.x, p.y), i = f(p.ix, p.iy), o = f(p.ox, p.oy); return { x:q[0], y:q[1], ix:i[0], iy:i[1], ox:o[0], oy:o[1] }; }) }));
}
const canOutline = L => !!L && (L.type === 'shape' || L.type === 'cta' || (L.type === 'image' && masked(L)));

/* ------------ forma Vetor nova a partir de pontos na tela do formato aberto ------------ */
// o que a forma nova herda: tempo, animação e aparência (o resto é do tipo de quem foi convertido)
const VEC_KEEP = ['name', 'visible', 'locked', 'grp', 'start', 'end', 'in', 'out', 'inDur', 'outDur', 'inSpeed', 'inInt', 'outSpeed', 'outInt', 'idleSpeed', 'idleInt', 'idle',
  'inSlide', 'outSlide', 'speed', 'intensity', 'opacity', 'blend', 'shadow', 'shColor', 'lblur', 'bblur', 'lineColor', 'flowFree'];
function vecLayerFrom(src, subs, over = {}) {
  const d0 = vecD(subs), vec0 = d0 && vecParse(d0); if (!vec0) return null;
  const d = vecD(vec0), b = customBox(d);
  const n = mkShape({ kind:'custom', d, vec:vec0, vecD:d, size:b.w / W(), mh:null, rot:0, fill:true, stroke:false, mode:'solid' });
  for (const k of VEC_KEEP) if (src[k] !== undefined) n[k] = JSON.parse(JSON.stringify(src[k]));
  if (!BLOCK_IN.shape.includes(n.in)) n.in = 'fade';
  if (!BLOCK_OUT.shape.includes(n.out)) n.out = 'cut';
  if (!IDLE_BY.shape.includes(n.idle)) n.idle = 'none';
  Object.assign(n, over);
  return { n, cx:(b.x + b.w / 2) / W(), cy:(b.y + b.h / 2) / H() };
}
// põe as formas novas na pilha em `at`; fora do principal a forma nasce com a escala da adaptação: desfaz, o desenho fica como foi medido
function insertVecLayers(items, at) {
  items.forEach(({ n, cx, cy }, i) => { n.x = cx; n.y = cy; S.layers.splice(at + i, 0, n); });
  if (!fmtOwn()) return;
  items.forEach(({ n, cx, cy }) => setPos(n, cx, cy));
  RT.frameNo = (RT.frameNo || 0) + 1;
  items.forEach(({ n }) => { const k = placement().get(n.id)?.k; if (k && Math.abs(k - 1) > .001) setFmt(n, { s:1 / k }); });
}
const solidOver = c => ({ mode:'solid', c1:c, c2:c, c3:c, c4:c });

/* ------------ Contorno em vetor (como "Outline stroke" do Figma) ------------ */
function outlineStroke(L) {
  L = L || selL(); if (!canOutline(L)) return false;
  if (lockedNote(L)) return false;
  if (!strokeSee(L)) { toast('Ligue o contorno e escolha uma cor primeiro', 3200); return false; }
  if (typeof polygonClipping === 'undefined') { toast('O módulo de contorno não carregou. Recarregue a página', 4000); return false; }
  ensureBounds([L]);
  const b = L._bounds, G = geomNow(L);
  if (!b || !G || !G.w) { toast('Esse elemento não está na tela', 3000); return false; }
  const lv = L.type === 'shape' ? localVec(L, G) : shapePts({ ...L, kind:L.type === 'image' && L.mask === 'circle' ? 'ellipse' : 'rect' }, G);
  if (!lv) { toast('Este caminho tem arcos (comando A) e não dá para converter. Redesenhe com a caneta (P)', 4500); return false; }
  const subs = flatSubs(lv); if (!subs.length) return false;
  const k = b.w / G.w, a = (L.type === 'shape' ? L.rot || 0 : 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const f = (x, y) => [cx + (x * co - y * si) * k, cy + (x * si + y * co) * k];
  const w = skW(L), pos = subs.every(s => s.closed) ? L.strokePos || 'center' : 'center', lw = pos === 'center' ? w : w * 2;
  let res;
  try {
    res = strokeMulti(subs, { w:lw, join:L.strokeJoin || 'round', cap:strokeCap(L), dash:strokeDash({ ...L, strokeW:lw }, 0, 1) });
    if (pos !== 'center') {
      const area = polygonClipping.xor(...subs.filter(s => s.closed).map(s => [s.pts]));
      res = pos === 'inside' ? polygonClipping.intersection(res, area) : polygonClipping.difference(res, area);
    }
  } catch (e) { console.warn(e); toast('Não consegui calcular o contorno desse elemento', 4000); return false; }
  const rings = ringsToVec(res, f, lw * k);
  if (!rings.length) { toast('O contorno ficou vazio'); return false; }
  const it = vecLayerFrom(L, rings, { name:`${L.name} (contorno)`, ...solidOver(skC(L)) });
  if (!it) { toast('Não consegui criar o vetor'); return false; }
  pushUndo();
  let at = S.layers.indexOf(L);
  if (L.type !== 'shape' || shFilled(L)) { L.stroke = false; at++; } // o preenchimento fica, o contorno vira outra forma
  else S.layers.splice(at, 1); // forma só de contorno (ou linha): o contorno vira a forma
  insertVecLayers([it], at);
  propTab = 'style'; select(it.n.id, true);
  changed({ layers:true, props:true }); seekLayer(it.n);
  toast('O contorno virou uma forma vetorial', 3500, UNDO_ACT);
  return true;
}

/* ------------ fontes: arquivo da fonte -> contornos das letras ------------ */
let FK_P = null;
function needFontkit() {
  if (typeof fontkit !== 'undefined') return Promise.resolve();
  return FK_P || (FK_P = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/fontkit.min.js';
    s.onload = res; s.onerror = () => { FK_P = null; s.remove(); rej(new Error('Não consegui carregar o leitor de fontes')); };
    document.head.append(s);
  }));
}
const FONT_BIN = new Map(), GF_META = new Map(), FACES = new Map();
// bytes do arquivo; os baixados ficam no IndexedDB (a mesma fonte não baixa de novo)
function fontBytes(url) {
  let p = FONT_BIN.get(url); if (p) return p;
  p = (async () => {
    const own = !url.startsWith('data:'), key = 'font:' + url, c = own && await DB.get(key); if (c) return c;
    const r = await fetch(url); if (!r.ok) throw new Error('Não consegui baixar o arquivo da fonte');
    const buf = await r.arrayBuffer(); if (own) DB.set(key, buf);
    return buf;
  })();
  FONT_BIN.set(url, p); p.catch(() => FONT_BIN.delete(url));
  return p;
}
// repositório google/fonts: a pasta é o nome sem espaços, na licença ofl, apache ou ufl. METADATA.pb lista arquivo, estilo e peso
function gfMeta(family) {
  let p = GF_META.get(family); if (p) return p;
  p = (async () => {
    const dir = family.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const lic of ['ofl', 'apache', 'ufl']) {
      const base = `https://raw.githubusercontent.com/google/fonts/main/${lic}/${dir}/`, r = await fetch(base + 'METADATA.pb');
      if (!r.ok) continue;
      const files = [];
      for (const m of (await r.text()).matchAll(/fonts\s*\{([^}]*)\}/g)) {
        const g = k => (m[1].match(new RegExp(k + ':\\s*"?([^"\\n]+)"?')) || [])[1];
        if (g('filename')) files.push({ style:g('style'), weight:+g('weight') || 400, file:g('filename') });
      }
      if (files.length) return { base, files };
    }
    return null;
  })();
  GF_META.set(family, p); p.catch(() => GF_META.delete(family));
  return p;
}
// { font (na variação do peso), base (para achar a letra), upm, synth (itálico que a fonte não tem) }
function faceFor(family, weight, italic) {
  const key = `${family}|${weight}|${italic ? 1 : 0}`; let p = FACES.get(key);
  if (!p) { p = faceLoad(family, weight, italic); FACES.set(key, p); p.catch(() => FACES.delete(key)); }
  return p;
}
async function faceLoad(family, weight, italic) {
  await needFontkit();
  const up = (S.brand.loaded || []).find(f => f.family === family && f.src === 'file');
  let url, synth = false;
  if (up) url = up.data;
  else {
    const meta = await gfMeta(family);
    if (!meta) throw new Error(`Não achei o arquivo da fonte "${family}". Use uma fonte do Google Fonts ou envie o arquivo em Marca`);
    const same = meta.files.filter(f => (f.style === 'italic') === !!italic), pool = same.length ? same : meta.files.filter(f => f.style !== 'italic');
    synth = !!italic && !same.length;
    const pick = pool.find(f => f.file.includes('[')) || pool.reduce((a, c) => Math.abs(c.weight - weight) < Math.abs(a.weight - weight) ? c : a);
    url = meta.base + encodeURIComponent(pick.file);
  }
  let base = fontkit.create(new Uint8Array(await fontBytes(url)));
  if (base.fonts) base = base.fonts[0];
  if (up) synth = !!italic && !base.italicAngle;
  const ax = base.variationAxes && base.variationAxes.wght;
  let font = base;
  if (ax) {
    const set = up ? { wght:clamp(weight, ax.min, ax.max) } : fitAxes(base, family, weight, italic);
    try { font = base.getVariation(set); } catch (e) { font = base; }
  }
  return { font, base, upm:base.unitsPerEm || 1000, synth };
}
// O Google Fonts serve a fonte variável com os eixos que não são o peso (tamanho óptico, largura…) fixos num valor dele, que não é o
// padrão do arquivo (Bricolage Grotesque: arquivo em opsz 96, condensada; no canvas sai em opsz 14, larga). Para o vetor ficar igual ao que
// o canvas desenha, procura o valor de cada eixo cujas larguras de letra (medidas no canvas) mais se aproximam das do arquivo.
const FIT_CH = 'HOnagemWis';
function fitAxes(base, family, weight, italic) {
  const wax = base.variationAxes.wght, set = { wght:clamp(weight, wax.min, wax.max) };
  const axes = Object.entries(base.variationAxes).filter(([k]) => k !== 'wght');
  if (!axes.length) return set;
  for (const [k, a] of axes) set[k] = a.default;
  const cx = document.createElement('canvas').getContext('2d'), upm = base.unitsPerEm || 1000;
  cx.font = `${italic ? 'italic ' : ''}${weight} 100px "${family}"`;
  const ref = [...FIT_CH].map(ch => ({ id:(base.glyphForCodePoint(ch.codePointAt(0)) || {}).id, w:cx.measureText(ch).width }));
  if (ref.some(r => !r.id || !r.w)) return set;
  const err = s => {
    let f; try { f = base.getVariation(s); } catch (e) { return Infinity; }
    return ref.reduce((a, r) => { const g = f.getGlyph(r.id), d = (g.advanceWidth * 100 / upm) / r.w - 1; return a + d * d; }, 0);
  };
  const free = axes.filter(([, a]) => a.max > a.min), def = { ...set };
  // valores de um eixo entre lo e hi; escala logarítmica quando o intervalo é largo (opsz 5..1200)
  const spread = (lo, hi, n) => Array.from({ length:n }, (_, i) => lo > 0 && hi / lo > 6 ? lo * Math.pow(hi / lo, i / (n - 1)) : lo + (hi - lo) * i / (n - 1));
  let best = err(set);
  const tryAxis = (k, vals) => { for (const v of vals) { const e = err({ ...set, [k]:v }); if (e < best - 1e-12) { best = e; set[k] = v; } } };
  if (free.length <= 2) { // grade conjunta (um eixo em cima do outro muda a mesma largura)
    const [a0, a1] = free.map(([k, a]) => [k, spread(a.min, a.max, 17)]);
    for (const v0 of a0 ? a0[1] : [0]) for (const v1 of a1 ? a1[1] : [0]) {
      const s = { ...set }; if (a0) s[a0[0]] = v0; if (a1) s[a1[0]] = v1;
      const e = err(s); if (e < best - 1e-12) { best = e; Object.assign(set, s); }
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const [k, a] of free) {
      const w = (a.max - a.min) / Math.pow(4, pass + 1), lo = Math.max(a.min, set[k] - w), hi = Math.min(a.max, set[k] + w);
      tryAxis(k, free.length <= 2 || pass ? spread(Math.min(lo, hi), hi, 13) : spread(a.min, a.max, 25));
    }
  }
  if (best > ref.length * 4e-4) Object.assign(set, def); // não bateu (fonte do canvas não carregou?): padrão do arquivo
  return set;
}
// letras -> path SVG na tela. items: [{ ch, x, y (linha de base), w, it, c }] em px do texto, T0 = { ax, ay, k } (centro na tela e escala).
// Devolve { map: cor -> d, missing }
async function glyphsD(family, size, items, T0) {
  const map = new Map(); let missing = 0;
  for (const it of items) {
    const face = await faceFor(family, it.w, it.it);
    const gl = face.base.glyphForCodePoint(it.ch.codePointAt(0)), id = gl && gl.id;
    if (!id) { missing++; continue; }
    const g = face.font.getGlyph(id); if (!g) { missing++; continue; }
    const sc = size / face.upm, sk = face.synth ? .25 : 0; // itálico falso: inclinação de 1/4, como o canvas
    const P = (x, y) => `${vr2(T0.ax + (it.x + (x + sk * y) * sc) * T0.k)} ${vr2(T0.ay + (it.y - y * sc) * T0.k)}`;
    let d = '';
    for (const c of g.path.commands) {
      const a = c.args;
      if (c.command === 'moveTo') d += 'M' + P(a[0], a[1]);
      else if (c.command === 'lineTo') d += 'L' + P(a[0], a[1]);
      else if (c.command === 'quadraticCurveTo') d += 'Q' + P(a[0], a[1]) + ' ' + P(a[2], a[3]);
      else if (c.command === 'bezierCurveTo') d += 'C' + P(a[0], a[1]) + ' ' + P(a[2], a[3]) + ' ' + P(a[4], a[5]);
      else if (c.command === 'closePath') d += 'Z';
    }
    if (d) map.set(it.c, (map.get(it.c) || '') + d);
  }
  return { map, missing };
}
// o texto no repouso: cada cor vira um caminho na tela do formato aberto
async function textVecs(L) {
  ensureBounds([L]);
  const bd = L._bounds; if (!bd) throw new Error('Esse texto não está na tela');
  const lay = layoutText(L, L.upper ? L.text.toUpperCase() : L.text), fk = bd.k || bd.w / lay.blockW || 1;
  const T0 = { ax:bd.x + bd.w / 2, ay:bd.y + bd.h / 2, k:fk }, byCol = new Map(); let missing = 0;
  for (const line of lay.lines) {
    const items = line.glyphs.filter(g => !g.space).map(g => { const m = /^(italic )?(\d+)/.exec(g.f) || []; return { ch:g.ch, x:line.x0 + g.x, y:line.baseline, w:+m[2] || L.weight, it:!!m[1], c:g.c || L.color }; });
    const r = await glyphsD(L.font, lay.size, items, T0); missing += r.missing;
    for (const [c, d] of r.map) byCol.set(c, (byCol.get(c) || '') + d);
  }
  const parts = [];
  for (const [color, d] of byCol) { const vec = vecParse(d); if (vec) parts.push({ color, d, vec }); }
  return { parts, missing, fk };
}
/* ------------ Texto em curvas (como "Create outlines" do Figma) ------------ */
async function textToVector(list) {
  const ls = (list || pickedLayers()).filter(l => l.type === 'text'); if (!ls.length) return false;
  if (lockedNote(ls)) return false;
  toast('Lendo o arquivo da fonte…', 12000);
  const res = [];
  try {
    await document.fonts.ready;
    for (const L of ls) res.push(await textVecs(L));
  } catch (e) { console.warn(e); toast(e.message || 'Não consegui ler a fonte', 6000); return false; }
  if (res.every(r => !r.parts.length)) { toast('Nada para converter: o texto está vazio'); return false; }
  pushUndo();
  const made = []; let missing = 0;
  ls.forEach((L, i) => {
    const r = res[i]; if (!r.parts.length) return;
    missing += r.missing;
    const gid = r.parts.length > 1 && !L.grp ? 'g' + Math.random().toString(36).slice(2, 7) : null, see = strokeSee(L);
    const items = r.parts.map((p, j) => {
      const it = vecLayerFrom(L, p.vec, { name:r.parts.length > 1 ? `${L.name} ${j + 1}` : L.name, ...solidOver(p.color),
        ...(see ? { stroke:true, strokeColor:skC(L), strokeW:+(skW(L) * r.fk).toFixed(2), strokePos:L.strokePos === 'outside' ? 'outside' : 'center', strokeJoin:L.strokeJoin || 'round', strokeCap:'round', strokeDash:'solid' } : {}) });
      if (it && gid) it.n.grp = gid;
      return it;
    }).filter(Boolean);
    const at = S.layers.indexOf(L); S.layers.splice(at, 1);
    insertVecLayers(items, at); made.push(...items.map(o => o.n));
  });
  if (!made.length) return false;
  propTab = 'style'; select(made[0].id, true);
  if (made.length > 1) { RT.picks = new Set(made.map(n => n.id)); RT.selected = made[made.length - 1].id; }
  changed({ layers:true, props:true }); seekLayers(made);
  toast(missing ? `Texto em curvas. ${missing} caractere${missing > 1 ? 's' : ''} sem desenho na fonte ficou${missing > 1 ? 'ram' : ''} de fora` : 'O texto virou vetor. A animação agora é do bloco, não de cada letra', 5000, UNDO_ACT);
  return true;
}
// Ctrl + Shift + O: texto em curvas e contorno em vetor, no que está selecionado
function vectorize() {
  const ls = pickedLayers(), tx = ls.filter(l => l.type === 'text');
  if (tx.length) { textToVector(tx); return; }
  const L = ls.find(canOutline);
  if (L) outlineStroke(L); else toast('Selecione um texto ou um elemento com contorno', 3000);
}

/* ============================================================
   SVG
   ============================================================ */
const svgEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sn = v => +(+v).toFixed(2);
// '#rrggbbaa' -> cor + opacidade (o SVG não aceita o alfa dentro do hex)
function svgCol(c) {
  let x = String(c || '#000000').replace('#', ''); if (x.length === 3) x = x.split('').map(v => v + v).join('');
  return { c:'#' + x.slice(0, 6), a:x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1 };
}
const svgFill = (c, att = 'fill') => { const o = svgCol(c); return `${att}="${o.c}"${o.a < 1 ? ` ${att}-opacity="${sn(o.a * 100) / 100}"` : ''}`; };
const svgStops = list => list.map(([off, c, a = 1]) => { const o = svgCol(c); return `<stop offset="${off}" stop-color="${o.c}" stop-opacity="${+(o.a * a).toFixed(3)}"/>`; }).join('');
const SVG_BLEND = { lighter:'plus-lighter' };
function newSvgCtx() { let n = 0; return { defs:[], id:() => 'm' + (++n), names:new Set() }; }
const svgUid = (X, raw, fallback) => {
  const nm = String(raw || fallback).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || fallback;
  let id = nm, i = 2;
  while (X.names.has(id)) id = `${nm}-${i++}`;
  X.names.add(id); return id;
};
// grupo (frame) da lista de camadas: um <g> com o nome, a opacidade e a mesclagem dele, e as camadas dentro
function svgGroup(gid, inner, X) {
  const gm = (S.groups && S.groups[gid]) || {}, bm = blendOf(gm), op = gm.opacity ?? 1;
  return `<g id="${svgEsc(svgUid(X, groupName(gid), 'grupo'))}"${op < 1 ? ` opacity="${+op.toFixed(3)}"` : ''}${bm ? ` style="mix-blend-mode:${SVG_BLEND[bm] || bm}"` : ''}>${inner}</g>`;
}
// cada camada vira um <g> com opacidade, mesclagem, sombra e desfoque da camada
function svgWrap(L, inner, X) {
  if (!inner) return '';
  const op = L.opacity ?? 1;
  const bm = blendOf(L), sh = L.shadow && L.shadow !== 'none' ? SHADOWS[L.shadow] : null, fx = [];
  if (sh && !sh.long) {
    const k = shadowK(L), c = svgCol(L.shColor || autoShadowHex(L, L.shadow));
    fx.push(`<feDropShadow dx="${sn((sh.x || 0) * k)}" dy="${sn((sh.y || 0) * k)}" stdDeviation="${sn((sh.blur || 0) * k / 2)}" flood-color="${c.c}" flood-opacity="${+(sh.a * c.a).toFixed(3)}"/>`);
  }
  if (L.lblur > 0) fx.push(`<feGaussianBlur stdDeviation="${sn(L.lblur)}"/>`);
  let fid = '';
  if (fx.length) { const id = X.id(); X.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${fx.join('')}</filter>`); fid = ` filter="url(#${id})"`; }
  const id = svgUid(X, L.name || L.type, L.type);
  return `<g id="${svgEsc(id)}"${op < 1 ? ` opacity="${+op.toFixed(3)}"` : ''}${bm ? ` style="mix-blend-mode:${SVG_BLEND[bm] || bm}"` : ''}${fid}>${inner}</g>`;
}
// contorno (center | inside | outside) em cima de um elemento; el(atributos) devolve o elemento, sc = escala do espaço dele
function svgStroke(L, el, X, o = {}) {
  if (!strokeSee(L)) return '';
  const sc = o.sc || 1, pos = o.closed === false ? 'center' : L.strokePos || 'center', w = skW(L), lw = pos === 'center' ? w : w * 2;
  const dash = strokeDash({ ...L, strokeW:lw }, 0, 1), eo = o.rule === 'evenodd';
  const att = `fill="none" ${svgFill(skC(L), 'stroke')} stroke-width="${sn(lw / sc)}" stroke-linecap="${strokeCap(L)}" stroke-linejoin="${L.strokeJoin || 'round'}"${dash.length ? ` stroke-dasharray="${dash.map(v => sn(v / sc)).join(' ')}"` : ''}`;
  if (pos === 'center') return el(att);
  const id = X.id();
  if (pos === 'inside') { X.defs.push(`<clipPath id="${id}">${el(eo ? 'clip-rule="evenodd"' : '')}</clipPath>`); return `<g clip-path="url(#${id})">${el(att)}</g>`; }
  X.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff"/>${el(`fill="#000" stroke="none"${eo ? ' fill-rule="evenodd"' : ''}`)}</mask>`);
  return `<g mask="url(#${id})">${el(att)}</g>`;
}
// bytes da imagem como dataURL (a original; com ajustes ou vídeo, o quadro de agora)
async function svgImgData(L, img) {
  const adj = L.video ? img : adjImg(L, img);
  if (L.video || adj !== img) {
    const c = document.createElement('canvas'), w = adj.naturalWidth || adj.videoWidth || adj.width, hh = adj.naturalHeight || adj.videoHeight || adj.height;
    c.width = w; c.height = hh; c.getContext('2d').drawImage(adj, 0, 0, w, hh);
    return c.toDataURL(L.cut ? 'image/png' : 'image/jpeg', .92);
  }
  const u = await srcUrl(L.src); if (!u) return null;
  if (u.startsWith('data:')) return u;
  return readAs(await (await fetch(u)).blob(), 'readAsDataURL');
}
const imgNat = im => [im.naturalWidth || im.videoWidth || im.width, im.naturalHeight || im.videoHeight || im.height];
// preenchimento animado (fundo e forma) num retângulo (x, y, w, hh) do espaço de quem chama, no instante T
async function svgPaint(L, x, y, w, hh, X) {
  const m = L.motion ?? 1, t = T, rect = (att, extra = '') => `<rect x="${sn(x)}" y="${sn(y)}" width="${sn(w)}" height="${sn(hh)}" ${att}${extra}/>`;
  const grad = (tag, att, stops) => { const id = X.id(); X.defs.push(`<${tag} id="${id}" gradientUnits="userSpaceOnUse" ${att}>${svgStops(stops)}</${tag}>`); return id; };
  let out = rect(svgFill(L.c1));
  if (L.mode === 'mesh') {
    [L.c2, L.c3, L.c4].forEach((c, i) => {
      const ph = i * 2.1 + .7, px = x + w * (.5 + .42 * Math.sin(t * .33 * m + ph)), py = y + hh * (.5 + .42 * Math.cos(t * .26 * m + ph * 1.3)), r = Math.max(w, hh) * (.62 + .1 * i);
      out += rect(`fill="url(#${grad('radialGradient', `cx="${sn(px)}" cy="${sn(py)}" r="${sn(r)}"`, [[0, c, i === 1 ? .55 : .85], [1, c, 0]])})"`);
    });
  } else if (L.mode === 'linear') {
    const a = ((L.angle ?? 135) + t * 8 * m) * Math.PI / 180, d = Math.hypot(w, hh) / 2, cx = x + w / 2, cy = y + hh / 2;
    out = rect(`fill="url(#${grad('linearGradient', `x1="${sn(cx - Math.cos(a) * d)}" y1="${sn(cy - Math.sin(a) * d)}" x2="${sn(cx + Math.cos(a) * d)}" y2="${sn(cy + Math.sin(a) * d)}"`, gradStops(L) || [[0, L.c1], [.55, L.c2], [1, L.c3]])})"`);
  } else if (L.mode === 'spot') {
    const px = x + w * (.5 + .08 * Math.sin(t * .5 * m)), py = y + hh * (.42 + .05 * Math.cos(t * .4 * m));
    out += rect(`fill="url(#${grad('radialGradient', `cx="${sn(px)}" cy="${sn(py)}" r="${sn(Math.max(w, hh) * .7)}"`, [[0, L.c2, .95], [.55, L.c2, .25], [1, L.c2, 0]])})"`);
  } else if (L.mode === 'image' || L.mode === 'video') { // vídeo: o quadro de agora
    const img = fillMedia(L), vid = L.mode === 'video' && img && img.tagName === 'VIDEO';
    const data = img && await svgImgData({ ...L, src:vid ? L.src : L.mode === 'video' ? L.vsrc : L.src, video:vid, cut:null }, img);
    if (!data) return '';
    const [nw, nh] = imgNat(img), r = fillRect(L, { naturalWidth:nw, naturalHeight:nh }, w, hh, t);
    out = rect(svgFill(L.c1)) + `<image x="${sn(x + r.x)}" y="${sn(y + r.y)}" width="${sn(r.w)}" height="${sn(r.h)}" preserveAspectRatio="none" xlink:href="${data}"/>`;
    if (L.darken > 0) out += rect('fill="#000"', ` fill-opacity="${L.darken}"`);
  }
  return out;
}
async function svgBg(L, X) { return svgWrap(L, (await svgPaint(L, 0, 0, FW(), H(), X)) || '', X); }
// forma: elementos de verdade (retângulo, elipse, polígono, linha, path), como no Figma
async function svgShape(L, X) {
  const b = L._bounds, G = geomNow(L); if (!b || !G) return '';
  const k = b.w / G.w, cx = b.x + b.w / 2, cy = b.y + b.h / 2, rot = L.rot || 0, kind = L.kind;
  const tf = `translate(${sn(cx)} ${sn(cy)})${rot ? ` rotate(${sn(rot)})` : ''}${Math.abs(k - 1) > 1e-4 ? ` scale(${+k.toFixed(5)})` : ''}`;
  let sc = 1, el;
  if (kind === 'ellipse') el = a => `<ellipse cx="0" cy="0" rx="${sn(G.w / 2)}" ry="${sn(G.h / 2)}" ${a}/>`;
  else if (kind === 'line') el = a => `<line x1="${sn(-G.w / 2)}" y1="0" x2="${sn(G.w / 2)}" y2="0" ${a}/>`;
  else if (kind === 'custom') {
    const bb = G.cust; sc = G.w / bb.w;
    el = a => `<path d="${svgEsc(L.d)}" transform="scale(${+sc.toFixed(6)}) translate(${sn(-(bb.x + bb.w / 2))} ${sn(-(bb.y + bb.h / 2))})" ${a}/>`;
  } else if (kind === 'triangle' || kind === 'polygon' || kind === 'star') {
    const pts = shapePts(L, G)[0].pts.map(p => `${sn(p.x)},${sn(p.y)}`).join(' ');
    el = a => `<polygon points="${pts}" ${a}/>`;
  } else {
    const r4 = radii4(radOf(L), G.w, G.h);
    if (r4.every(v => Math.abs(v - r4[0]) < .01)) el = a => `<rect x="${sn(-G.w / 2)}" y="${sn(-G.h / 2)}" width="${sn(G.w)}" height="${sn(G.h)}"${r4[0] > .01 ? ` rx="${sn(r4[0])}"` : ''} ${a}/>`;
    else { const d = vecD(shapePts(L, G)); el = a => `<path d="${d}" ${a}/>`; }
  }
  let body = '';
  const rule = L.fillRule === 'evenodd' ? 'evenodd' : '';
  if (shFilled(L)) {
    if (L.mode === 'solid') body += el(svgFill(L.c1) + ' stroke="none"' + (rule ? ' fill-rule="evenodd"' : ''));
    else {
      const id = X.id(); X.defs.push(`<clipPath id="${id}">${el(rule ? 'clip-rule="evenodd"' : '')}</clipPath>`);
      body += `<g clip-path="url(#${id})">${await svgPaint(L, -G.w / 2, -G.h / 2, G.w, G.h, X)}</g>`;
    }
  }
  body += svgStroke(L, el, X, { sc, closed:kind !== 'line', rule });
  return svgWrap(L, `<g transform="${tf}">${body}</g>`, X);
}
// texto em curvas (se a fonte não vier, <text>)
async function svgText(L, X) {
  let r = null;
  try { r = await textVecs(L); } catch (e) { console.warn(e); }
  if (r && r.parts.length) {
    const see = strokeSee(L), out = r.parts.map(p => {
      const el = a => `<path d="${p.d}" ${a}/>`;
      return el(svgFill(p.color) + ' stroke="none"') + (see ? svgStroke({ ...L, strokeW:skW(L) * r.fk, strokeDash:'solid', strokePos:L.strokePos === 'outside' ? 'outside' : 'center' }, el, X) : '');
    }).join('');
    return svgWrap(L, out, X);
  }
  const b = L._bounds; if (!b) return '';
  const lay = layoutText(L, L.upper ? L.text.toUpperCase() : L.text), fk = b.k || 1, ax = b.x + b.w / 2, ay = b.y + b.h / 2;
  const out = lay.lines.map(line => `<text x="${sn(ax + line.x0 * fk)}" y="${sn(ay + line.baseline * fk)}" font-family="${svgEsc(L.font)}" font-size="${sn(lay.size * fk)}" font-weight="${L.weight}"${L.italic ? ' font-style="italic"' : ''} letter-spacing="${sn((L.ls || 0) * lay.size * fk)}" ${svgFill(L.color)} xml:space="preserve">${svgEsc(line.text)}</text>`).join('');
  return svgWrap(L, out, X);
}
async function svgCta(L, X) {
  const b = L._bounds, G = geomNow(L); if (!b || !G) return '';
  const k = b.w / G.w, cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = clamp(L.radius || 0, 0, Math.min(G.w, G.h) / 2);
  const el = a => `<rect x="${sn(-G.w / 2)}" y="${sn(-G.h / 2)}" width="${sn(G.w)}" height="${sn(G.h)}"${r > .01 ? ` rx="${sn(r)}"` : ''} ${a}/>`;
  let out = `<g transform="translate(${sn(cx)} ${sn(cy)})${Math.abs(k - 1) > 1e-4 ? ` scale(${+k.toFixed(5)})` : ''}">${el(svgFill(L.bg) + ' stroke="none"')}${svgStroke(L, el, X)}</g>`;
  // texto em curvas: cada letra na posição que o canvas mede (largura até ela menos a própria)
  const f = fontStr(L, L.size); MCTX.font = f;
  const chars = [...L.text], items = []; let pre = '';
  const tw = MCTX.measureText(L.text).width;
  for (const ch of chars) { pre += ch; const w = MCTX.measureText(ch).width; if (ch !== ' ') items.push({ ch, x:MCTX.measureText(pre).width - w - tw / 2, y:L.size * .35, w:L.weight, it:false, c:L.color }); }
  try {
    const r2 = await glyphsD(L.font, L.size, items, { ax:cx, ay:cy, k });
    out += [...r2.map].map(([c, d]) => `<path d="${d}" ${svgFill(c)}/>`).join('');
  } catch (e) {
    console.warn(e);
    out += `<text x="${sn(cx)}" y="${sn(cy + L.size * .35 * k)}" text-anchor="middle" font-family="${svgEsc(L.font)}" font-size="${sn(L.size * k)}" font-weight="${L.weight}" ${svgFill(L.color)}>${svgEsc(L.text)}</text>`;
  }
  return svgWrap(L, out, X);
}
async function svgImage(L, X) {
  const b = L._bounds, G = geomNow(L); if (!b || !G || !G.img) return '';
  const data = await svgImgData(L, G.img); if (!data) return '';
  const k = b.w / G.w, cx = b.x + b.w / 2, cy = b.y + b.h / 2, [iw, ih] = imgNat(G.img);
  let body;
  if (masked(L)) {
    const pn = panOf(L), s = Math.max(G.w / iw, G.h / ih) * pn.zoom, dw = iw * s, dh = ih * s;
    const r4 = radii4(radOf(L), G.w, G.h);
    const el = L.mask === 'circle' ? a => `<ellipse cx="0" cy="0" rx="${sn(G.w / 2)}" ry="${sn(G.h / 2)}" ${a}/>`
      : r4.every(v => Math.abs(v - r4[0]) < .01) ? a => `<rect x="${sn(-G.w / 2)}" y="${sn(-G.h / 2)}" width="${sn(G.w)}" height="${sn(G.h)}"${r4[0] > .01 ? ` rx="${sn(r4[0])}"` : ''} ${a}/>`
        : a => `<path d="${vecD(shapePts({ ...L, kind:'rect' }, G))}" ${a}/>`;
    const id = X.id(); X.defs.push(`<clipPath id="${id}">${el('')}</clipPath>`);
    const fl = L.flipX || L.flipY ? ` transform="scale(${L.flipX ? -1 : 1} ${L.flipY ? -1 : 1})"` : '';
    body = `<g clip-path="url(#${id})"><image${fl} x="${sn(-dw / 2 + pn.ix * G.w)}" y="${sn(-dh / 2 + pn.iy * G.h)}" width="${sn(dw)}" height="${sn(dh)}" preserveAspectRatio="none" xlink:href="${data}"/></g>${svgStroke(L, el, X)}`;
  } else body = `<image${L.flipX || L.flipY ? ` transform="scale(${L.flipX ? -1 : 1} ${L.flipY ? -1 : 1})"` : ''} x="${sn(-G.w / 2)}" y="${sn(-G.h / 2)}" width="${sn(G.w)}" height="${sn(G.h)}" preserveAspectRatio="none" xlink:href="${data}"/>`;
  return svgWrap(L, `<g transform="translate(${sn(cx)} ${sn(cy)})${Math.abs(k - 1) > 1e-4 ? ` scale(${+k.toFixed(5)})` : ''}">${body}</g>`, X);
}
// logo SVG entra como SVG de verdade (o desenho continua vetorial); logo PNG, como imagem
async function svgLogo(L, X) {
  const lg = logoOf(L), b = L._bounds; if (!lg || !b) return '';
  const src = L.svg || S.brand.logo; if (!src) return '';
  if (src.kind === 'img') return svgWrap(L, `<image x="${sn(b.x)}" y="${sn(b.y)}" width="${sn(b.w)}" height="${sn(b.h)}" preserveAspectRatio="none" xlink:href="${src.data}"/>`, X);
  const el = sanitizeSvg(src.text).cloneNode(true);
  for (const a of ['x', 'y', 'width', 'height', 'viewBox', 'style', 'id', 'preserveAspectRatio']) el.removeAttribute(a);
  el.setAttribute('x', sn(b.x)); el.setAttribute('y', sn(b.y)); el.setAttribute('width', sn(b.w)); el.setAttribute('height', sn(b.h));
  el.setAttribute('viewBox', `${lg.bx} ${lg.by} ${lg.bw} ${lg.bh}`); el.setAttribute('preserveAspectRatio', 'none'); el.setAttribute('overflow', 'hidden');
  return svgWrap(L, new XMLSerializer().serializeToString(el), X);
}
const SVG_DRAW = { bg:svgBg, shape:svgShape, text:svgText, cta:svgCta, image:svgImage, logo:svgLogo };
// só = lista de camadas (a seleção); sem ela, o quadro inteiro como está na agulha
async function buildSvg(only) {
  const X = newSvgCtx(), all = S.layers.filter(l => l.visible && SVG_DRAW[l.type]);
  const ls = only ? all.filter(l => only.includes(l)) : all.filter(l => l.type === 'bg' || phase(l, T));
  if (!ls.length) throw new Error('Nada na tela neste momento');
  ensureBounds(ls);
  const parts = [];
  for (const L of ls) { try { parts.push({ gid:L.grp, s:await SVG_DRAW[L.type](L, X) }); } catch (e) { console.warn(L.name, e); } }
  // camadas seguidas do mesmo grupo entram num <g> com o nome do grupo
  const out = []; let run = null;
  const flush = () => { if (run) { out.push(svgGroup(run.gid, run.s.filter(Boolean).join('\n'), X)); run = null; } };
  for (const p of parts) {
    if (p.gid && run && run.gid === p.gid) run.s.push(p.s);
    else { flush(); if (p.gid) run = { gid:p.gid, s:[p.s] }; else out.push(p.s); }
  }
  flush();
  let vb = [0, 0, FW(), H()];
  if (only) {
    const bs = ls.map(l => l._bounds).filter(Boolean); if (!bs.length) throw new Error('A seleção não está na tela');
    const x0 = Math.min(...bs.map(o => o.x)), y0 = Math.min(...bs.map(o => o.y)), x1 = Math.max(...bs.map(o => o.x + o.w)), y1 = Math.max(...bs.map(o => o.y + o.h));
    const pad = Math.max(8, ...ls.map(l => (strokeSee(l) ? skW(l) : 0) * 1.2));
    vb = [sn(x0 - pad), sn(y0 - pad), sn(x1 - x0 + pad * 2), sn(y1 - y0 + pad * 2)];
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}">\n<defs>${X.defs.join('\n')}</defs>\n${out.filter(Boolean).join('\n')}\n</svg>\n`;
}
let svgBusy = false;
async function exportSvg(mode) {
  if (svgBusy) return; svgBusy = true;
  try {
    pause(); await document.fonts.ready; await seekVideos(T);
    // com algo selecionado sai a seleção; sem seleção (ou mode 'frame'), o quadro todo
    const sel = mode === 'frame' ? null : pickedLayers().filter(l => l.visible);
    toast('Gerando o SVG…', 12000);
    const svg = await buildSvg(sel && sel.length ? sel : null);
    const one = sel && sel.length;
    await saveFile(new Blob([svg], { type:'image/svg+xml' }), `${outName()}${one ? '-selecao' : `-${T.toFixed(1).replace('.', ',')}s`}.svg`);
    toast(one ? 'SVG da seleção salvo' : 'SVG do quadro salvo. Sai parado, sem animação; texto em curvas', 5000);
  } catch (e) { console.warn(e); toast(e.message || 'Não consegui gerar o SVG', 5000); }
  finally { svgBusy = false; }
}
