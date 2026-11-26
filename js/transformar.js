/* ============================================================
   Transformar (pedido do usuário: "preset para formas e textos se transformarem entre si: um quadrado vira um texto, um texto
   vira outro texto", com algumas variações). Carregado antes do app.js, só declara.

   É uma transição entre clipes (B.xin, xfPairs/xfDraw no app.js) que vale para qualquer elemento que desenha: texto, forma,
   logo, botão e imagem/vídeo (mphOk). O par é achado pelo tempo como antes: A termina onde B começa (até XF_TOL s), mesmo slide.
   Na janela [corte − d/2, corte + d/2] o de cima na pilha desenha os dois: A e B ficam em repouso, cada um numa tela à parte
   (a, b), e o preset mistura as duas telas pelas caixas de cada um (ZA, ZB = _bounds em px das telas). Tudo em cima das telas
   prontas: cor, degradê, contorno, sombra e fonte saem certos e, com u = 1, sobra exatamente o B.
   Presets (MPH, entram no XFS com morph:true):
   - Transformar: a caixa de A vira a de B (posição e tamanho), com troca suave e um pouco de desfoque no meio (Smart animate).
   - Letra a letra: texto → texto, as letras iguais deslizam para o lugar novo (as outras trocam em ordem e as que sobram somem/
     surgem); forma → texto, a forma se parte em pedaços no desenho do texto (uma linha por linha, uma coluna por letra) e cada
     pedaço voa até a sua letra; texto → forma, o contrário.
   - Líquido: os dois borrados e com o alfa cortado (filtro SVG #mola-goo): uma gota que muda de forma.
   - Bloco: um bloco da cor de A cobre A, vira pílula, vai até B mudando de cor e sai revelando B (direção).
   - Mosaico: A se parte em ladrilhos que voam embaralhados e montam B.
   - Virar: um cartão que gira (horizontal ou vertical, pela direção) com A na frente e B atrás.
   Peso: só dentro da janela; as duas telas do tamanho do palco que a transição entre clipes já usa, mais uma no Líquido.
   Letra a letra e Mosaico: até ~60 recortes por quadro (drawImage com recorte da origem; só a letra de texto girado usa clip).
   ============================================================ */
const MPH_TYPES = new Set(['text', 'shape', 'logo', 'cta', 'image']);
const mphOk = L => !!L && MPH_TYPES.has(L.type) && !L.capt; // legenda muda de texto com o tempo: fora

// caixa da camada nas telas da transição (px; x/y = centro). Sem caixa medida, a dos dois clipes (Z)
function mphB(G, L, Z, padK = .02) {
  const b = L._bounds, M = G && G.M;
  if (!M || !b || !(b.w > 0 && b.h > 0)) return { x:Z.x + Z.w / 2, y:Z.y + Z.h / 2, w:Z.w, h:Z.h, r:0 };
  const p = 4 + (strokeOn(L) ? skW(L) : 0) + Math.min(b.w, b.h) * padK; // folga: contorno e borda suave
  return { x:M.a * (b.x + b.w / 2) + M.e, y:M.d * (b.y + b.h / 2) + M.f, w:M.a * (b.w + 2 * p), h:M.d * (b.h + 2 * p), r:0 };
}
const mphLerp = (A, B, e) => ({ x:lerp(A.x, B.x, e), y:lerp(A.y, B.y, e), w:lerp(A.w, B.w, e), h:lerp(A.h, B.h, e), r:lerp(A.r || 0, B.r || 0, e) });
const mphScale = (R, s) => ({ ...R, w:R.w * s, h:R.h * s });

// recorte S da tela src desenhado no retângulo D (centro, w, h, giro). Origem sem giro = drawImage com recorte (rápido);
// origem girada (letra de texto girado) = clip no espaço dela
function mphPiece(c, src, S, D, a = 1, bl = 0) {
  if (a <= .003 || !S || !D || !(S.w > .5 && S.h > .5) || !(Math.abs(D.w) > .3 && Math.abs(D.h) > .3)) return;
  c.save(); c.globalAlpha = Math.min(1, a);
  if (bl > .3) c.filter = `blur(${bl.toFixed(2)}px)`;
  if (!S.r) {
    if (D.r) { c.translate(D.x, D.y); c.rotate(D.r); c.drawImage(src, S.x - S.w / 2, S.y - S.h / 2, S.w, S.h, -D.w / 2, -D.h / 2, D.w, D.h); }
    else c.drawImage(src, S.x - S.w / 2, S.y - S.h / 2, S.w, S.h, D.x - D.w / 2, D.y - D.h / 2, D.w, D.h);
  } else {
    c.translate(D.x, D.y); if (D.r) c.rotate(D.r); c.scale(D.w / S.w, D.h / S.h);
    c.beginPath(); c.rect(-S.w / 2, -S.h / 2, S.w, S.h); c.clip();
    c.rotate(-S.r); c.translate(-S.x, -S.y); c.drawImage(src, 0, 0);
  }
  c.restore();
}
// nas pontas da janela, as telas inteiras por cima: o que ficou fora dos recortes (sombra, fundo atrás do texto) não pisca
function mphEnds(c, a, b, u, w = .06) { xfPut(c, a, 1 - xfSm(u / w)); xfPut(c, b, xfSm((u - 1 + w) / w)); }

// letras do texto em px das telas (mesma conta do drawText: layoutText + restRect, girado em volta do centro). Cada letra é
// a faixa da linha dela de uma ponta à outra da letra, a primeira/última da linha e a 1ª/última linha com folga para fora.
// Texto em curva, legenda ou vazio: null (vira uma peça só)
function mphGlyphs(G, L) {
  if (!G || !G.M || L.type !== 'text' || L.capt || tpKind(L)) return null;
  const txt = caseTxt(L, L.text || ''); if (!txt.trim()) return null;
  const lay = layoutText(L, txt), q = restRect(L); if (!q) return null;
  const b = q.b, k = b.k || 1, M = G.M, cx = b.x + b.w / 2, cy = b.y + b.h / 2, ra = rotOf(L), co = Math.cos(ra), si = Math.sin(ra);
  const out = [], n = lay.lines.length, ex = lay.size * .25;
  lay.lines.forEach((l, li) => {
    const gs = l.glyphs.filter(g => !g.space); if (!gs.length) return;
    const mid = l.baseline - lay.size * .34, top = mid - lay.lineH / 2 - (li === 0 ? ex : 0), bot = mid + lay.lineH / 2 + (li === n - 1 ? ex : 0);
    gs.forEach((g, j) => {
      const x0 = l.x0 + g.x - (j === 0 ? ex : 0), x1 = l.x0 + g.x + g.w + (j === gs.length - 1 ? ex : 0), lx = (x0 + x1) / 2, ly = (top + bot) / 2;
      const fx = cx + (lx * co - ly * si) * k, fy = cy + (lx * si + ly * co) * k;
      out.push({ x:M.a * fx + M.e, y:M.d * fy + M.f, w:M.a * (x1 - x0) * k, h:M.d * (bot - top) * k, r:ra, ch:g.ch.toLowerCase(), li });
    });
  });
  return out.length ? out : null;
}
// a caixa R repartida no desenho das letras U: uma linha por linha de texto, colunas da largura de cada letra (cobre R inteira)
function mphTileLike(R, U) {
  const rows = []; for (const u of U) (rows[u.li] = rows[u.li] || []).push(u);
  const rs = rows.filter(Boolean), nr = rs.length, at = new Map();
  rs.forEach((row, ri) => {
    const tot = row.reduce((s, u) => s + u.w, 0) || 1, hh = R.h / nr; let acc = 0;
    row.forEach(u => { const w = R.w * u.w / tot; at.set(u, { x:R.x - R.w / 2 + acc + w / 2, y:R.y - R.h / 2 + (ri + .5) * hh, w, h:hh, r:R.r || 0 }); acc += w; });
  });
  return U.map(u => at.get(u));
}
// letras iguais na mesma ordem (maior sequência em comum)
function mphLcs(x, y) {
  const n = x.length, m = y.length; if (!n || !m || n * m > 160000) return [];
  const D = Array.from({ length:n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = x[i] === y[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { out.push([i, j]); i++; j++; } else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++; }
  return out;
}
// peças da Letra a letra: { s, sa } = de onde sai e o recorte em a; { d, sb } = aonde chega e o recorte em b (null = só some/surge)
function mphPairs(UA, UB, A, B) {
  if (!UA && !UB) return [{ s:A, sa:A, d:B, sb:B }];
  if (!UA) { const t = mphTileLike(A, UB); return UB.map((u, i) => ({ s:t[i], sa:t[i], d:u, sb:u })); }
  if (!UB) { const t = mphTileLike(B, UA); return UA.map((u, i) => ({ s:u, sa:u, d:t[i], sb:t[i] })); }
  const to = new Map(), usedA = new Set();
  for (const [i, j] of mphLcs(UA.map(u => u.ch), UB.map(u => u.ch))) { to.set(j, i); usedA.add(i); }
  const restA = UA.map((u, i) => i).filter(i => !usedA.has(i)), restB = UB.map((u, j) => j).filter(j => !to.has(j));
  restB.forEach((j, n) => { if (n < restA.length) to.set(j, restA[n]); }); // as diferentes trocam em ordem
  const out = UB.map((d, j) => to.has(j) ? { s:UA[to.get(j)], sa:UA[to.get(j)], d, sb:d } : { s:null, d, sb:d });
  for (const i of restA.slice(restB.length)) out.push({ s:UA[i], sa:UA[i], d:null });
  return out;
}
// cor principal (Bloco): texto = a cor dele, botão = o fundo, forma = 1ª cor do preenchimento ou o contorno
function mphColor(L) {
  const hx = v => typeof v === 'string' && /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : null, brand = (S.brand && S.brand.colors) || [];
  if (L.type === 'text') return hx(L.color) || '#ffffff';
  if (L.type === 'cta') return hx(L.bg) || hx(L.color) || '#ffffff';
  if (L.type === 'shape') return (shFilled(L) ? hx(L.c1) : null) || hx(L.strokeColor) || '#ffffff';
  if (L.type === 'logo') return hx(L.tint) || hx(L.color) || hx(brand[2]) || '#ffffff';
  return hx(brand[2]) || '#888888';
}
function mphMix(c1, c2, f) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], f)).toString(16).padStart(2, '0')).join('');
}
function mphRR(c, R, col, rad) {
  if (R.w < .5 || R.h < .5) return;
  c.save(); c.fillStyle = col; c.translate(R.x, R.y); if (R.r) c.rotate(R.r);
  c.beginPath(); c.roundRect(-R.w / 2, -R.h / 2, R.w, R.h, Math.max(0, Math.min(rad, R.w / 2, R.h / 2))); c.fill(); c.restore();
}
// parte f da caixa R coberta a partir do lado de onde o movimento vem (in) ou o que sobra dela saindo pelo outro lado (out)
function mphPart(R, f, vx, vy, out) {
  const x0 = R.x - R.w / 2, y0 = R.y - R.h / 2, g = out ? 1 - f : f;
  if (vx) { const w = R.w * g, x = (vx > 0) === !out ? x0 : x0 + R.w - w; return { x:x + w / 2, y:R.y, w, h:R.h, r:0 }; }
  const hh = R.h * g, y = (vy > 0) === !out ? y0 : y0 + R.h - hh; return { x:R.x, y:y + hh / 2, w:R.w, h:hh, r:0 };
}
// filtro do Líquido: alfa cortado em ~45% (o desfoque vira uma gota de borda firme). Um <svg> escondido, criado uma vez
let MPH_GOO = null;
function mphGooOk() {
  if (MPH_GOO !== null) return MPH_GOO;
  try {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    s.innerHTML = '<filter id="mola-goo" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -7"/></filter>';
    document.body.appendChild(s); MPH_GOO = true;
  } catch (e) { MPH_GOO = false; }
  return MPH_GOO;
}

// a gota do Líquido desenhada em c com opacidade al (g = quanto do meio é gota). O desfoque cresce junto com g: enquanto a gota ainda divide a tela com o
// desenho nítido ela é quase igual a ele (borrada demais, a letra fina sumia na gota e o elemento apagava por 2 ou 3 quadros).
// Desfoque moderado e cada um desenhado duas vezes (reforça o alfa): letra fina não some na gota
function mphGoo(c, a, b, A, B, M, w, q, g, G, al = g) {
  const r = (2 + .045 * Math.min(Math.abs(M.w), Math.abs(M.h))) * Math.pow(q, .6) * g * g, T = xfTmp(G, 'xc'), t = T.getContext('2d');
  for (let j = 0; j < 2; j++) { mphPiece(t, a, A, M, 1 - w, r); mphPiece(t, b, B, M, w, r); }
  // o Chrome aplica o globalAlpha antes do filtro, e o filtro corta o alfa abaixo de ~44%: com g pequeno a gota sumia inteira.
  // Gota meio transparente = a gota pronta (filtro com alfa 1) numa tela à parte, e só depois a opacidade
  let src = T;
  if (al < .999) { const E = xfTmp(G, 'xe'), e = E.getContext('2d'); e.filter = 'url(#mola-goo)'; e.drawImage(T, 0, 0); e.filter = 'none'; src = E; }
  c.save(); c.globalAlpha = al; if (src === T) c.filter = 'url(#mola-goo)'; c.drawImage(src, 0, 0); c.restore();
}

/* presets: mix(c, a, b, u, Z, k, x, G, p) como os do XFS; G.M = quadro → px das telas, p = o par (A, B) */
const MPH = {
  morph: { label:'Transformar', dur:.7, morph:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z), B = mphB(G, p.B, Z), e = xfIO(u), q = 1 - Math.abs(2 * u - 1), M = mphLerp(A, B, e), bl = 9 * k * q * q;
    mphPiece(c, a, A, M, 1 - xfSm((u - .2) / .55), bl);
    mphPiece(c, b, B, M, xfSm((u - .25) / .55), bl);
    mphEnds(c, a, b, u);
  } },
  letters: { label:'Letra a letra', dur:1.1, morph:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z), B = mphB(G, p.B, Z), P = mphPairs(mphGlyphs(G, p.A), mphGlyphs(G, p.B), A, B);
    const n = P.length, st = n > 1 ? Math.min(.5, .05 * (n - 1)) : 0;
    P.forEach((q, i) => {
      const v = clamp((u - st * i / Math.max(1, n - 1)) / (1 - st)), e = xfIO(v), arc = Math.sin(Math.PI * e);
      if (q.s && q.d) {
        const R = mphLerp(q.s, q.d, e), hh = (q.s.h + q.d.h) / 2, w = xfSm((v - .25) / .5);
        R.y -= arc * hh * .3 * (rand(i, 3) < .5 ? 1 : -1); R.r += arc * (rand(i, 5) - .5) * .5;
        mphPiece(c, a, q.sa, R, 1 - w); mphPiece(c, b, q.sb, R, w);
      } else if (q.s) mphPiece(c, a, q.sa, mphScale(q.s, 1 - .6 * e), 1 - xfSm(v / .7));
      else mphPiece(c, b, q.sb, mphScale(q.d, .4 + .6 * e), xfSm((v - .3) / .7));
    });
    mphEnds(c, a, b, u);
  } },
  goo: { label:'Líquido', dur:.9, morph:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z), B = mphB(G, p.B, Z), e = xfIO(u), q = 1 - Math.abs(2 * u - 1), M = mphLerp(A, B, e), w = xfSm((u - .3) / .4);
    const ok = mphGooOk(), g = ok ? xfSm(q * 2.2) : 0; // quanto do meio é gota
    const ea = 1 - xfSm(u / .06), eb = xfSm((u - .94) / .06), f = Math.max(0, 1 - ea - eb); // pontas: as telas inteiras
    if (g > .999 && f > .999) mphGoo(c, a, b, A, B, M, w, q, 1, G);
    else {
      // trocas (tela inteira ↔ desenho ↔ gota) somadas ('lighter') numa tela à parte, com pesos que fecham 1: duas camadas
      // meio transparentes uma sobre a outra não chegam a 100% e o elemento piscava (reclamação do usuário)
      const D = xfTmp(G, 'xd'), d = D.getContext('2d'); d.globalCompositeOperation = 'lighter';
      xfPut(d, a, ea); xfPut(d, b, eb);
      mphPiece(d, a, A, M, (1 - w) * (1 - g) * f); mphPiece(d, b, B, M, w * (1 - g) * f);
      if (g * f > .002) mphGoo(d, a, b, A, B, M, w, q, g, G, g * f);
      c.drawImage(D, 0, 0);
    }
  } },
  pill: { label:'Bloco', dur:1, morph:true, dir:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z, .06), B = mphB(G, p.B, Z, .06), [vx, vy] = XF_DIRS[x.dir || 'r'], cA = mphColor(p.A), cB = mphColor(p.B);
    const rad = (R, f = 0) => Math.min(Math.abs(R.w), Math.abs(R.h)) * (.18 + .32 * Math.sin(Math.PI * f));
    if (u < .3) { const f = xfIO(u / .3); xfPut(c, a); mphRR(c, mphPart(A, f, vx, vy, false), cA, rad(A)); }
    else if (u < .7) { const f = xfIO((u - .3) / .4), M = mphLerp(A, B, f); M.w *= 1 - .12 * Math.sin(Math.PI * f); M.h *= 1 - .12 * Math.sin(Math.PI * f); mphRR(c, M, mphMix(cA, cB, f), rad(M, f)); }
    else { const f = xfIO((u - .7) / .3); xfPut(c, b); mphRR(c, mphPart(B, f, vx, vy, true), cB, rad(B)); }
  } },
  tiles: { label:'Mosaico', dur:1.1, morph:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z), B = mphB(G, p.B, Z), asp = Math.sqrt(Math.max(.05, A.w / A.h) * Math.max(.05, B.w / B.h));
    const cols = clamp(Math.round(Math.sqrt(42 * asp)), 3, 12), rows = clamp(Math.round(42 / cols), 2, 10), n = cols * rows;
    const tile = (R, i) => { const cx = i % cols, cy = Math.floor(i / cols), w = R.w / cols, hh = R.h / rows; return { x:R.x - R.w / 2 + (cx + .5) * w, y:R.y - R.h / 2 + (cy + .5) * hh, w:w + .6, h:hh + .6, r:0 }; };
    const to = [...Array(n).keys()].sort((i, j) => rand(i, 9) - rand(j, 9)); // embaralhado (sempre do mesmo jeito)
    for (let i = 0; i < n; i++) {
      const dl = rand(i, 11) * .4, v = clamp((u - dl) / .6), e = xfIO(v), arc = Math.sin(Math.PI * e), s = tile(A, i), d = tile(B, to[i]);
      const R = mphLerp(s, d, e), w = xfSm((v - .3) / .4);
      R.y -= arc * (Z.h * .12) * (rand(i, 13) - .3); R.r = arc * (rand(i, 15) - .5) * 1.4; R.w *= 1 - .25 * arc; R.h *= 1 - .25 * arc;
      mphPiece(c, a, s, R, 1 - w); mphPiece(c, b, d, R, w);
    }
    mphEnds(c, a, b, u);
  } },
  flip: { label:'Virar', dur:.6, morph:true, dir:true, mix:(c, a, b, u, Z, k, x, G, p) => {
    const A = mphB(G, p.A, Z), B = mphB(G, p.B, Z), e = xfIO(u), M = mphLerp(A, B, e), vert = x.dir === 'u' || x.dir === 'd', cs = Math.cos(Math.PI * e);
    const s = Math.abs(cs), z = 1 + .08 * Math.sin(Math.PI * e), D = { ...M, w:M.w * z * (vert ? 1 : s), h:M.h * z * (vert ? s : 1) };
    mphPiece(c, cs >= 0 ? a : b, cs >= 0 ? A : B, D);
  } },
};
const MPH_KEYS = Object.keys(MPH);

// texto e forma (ou dois elementos quaisquer) escolhidos: o que aparece primeiro vira o outro
function mphPair() {
  const ls = pickedLayers(); if (ls.length !== 2 || !ls.every(mphOk)) return null;
  const [p, q] = ls, ip = S.layers.indexOf(p), iq = S.layers.indexOf(q);
  const first = p.start !== q.start ? p.start < q.start : ip < iq; // empate: o de baixo na pilha vira o de cima
  return first ? { A:p, B:q } : { A:q, B:p };
}
// A passa a terminar onde B começa e B ganha a transformação. Corte = o começo de B, se ele já vem depois de A; senão um ponto
// no meio de A (B começa ali). B não acaba antes de dar tempo de ser visto. Um desfazer
function mphLink(A, B, k = 'morph') {
  if (!A || !B || A === B) return;
  if (A.locked || B.locked) { toast('Desbloqueie os dois elementos antes'); return; }
  if (slides() > 1 && slideOfL(A) !== slideOfL(B)) { toast('Os dois precisam estar no mesmo slide'); return; }
  pushUndo();
  const dur = S.duration, ae = A.end ?? dur, P = XFS[k] || XFS.morph;
  let cut = B.start >= A.start + .4 && B.start <= ae + .5 ? B.start : A.start + Math.max(.8, Math.min(2, (ae - A.start) / 2));
  cut = +clamp(cut, A.start + .3, Math.max(A.start + .3, dur - .4)).toFixed(3);
  A.end = cut; B.start = cut;
  if ((B.end ?? dur) < cut + .5) B.end = +Math.min(dur, cut + Math.max(1.5, ae - A.start)).toFixed(3);
  B.xin = { k:XFS[k] ? k : 'morph', d:P.dur };
  changed({ layers:true, props:true }); renderTimeline();
  pause(); T = clamp(cut - P.dur * .1, 0, dur); RT.userSeek = true; needs = true;
  toast(`“${A.name}” se transforma em “${B.name}”`, 5000, UNDO_ACT);
}
// aba Animação, sem nada colado antes: escolher quem vira este elemento (os mais perto no tempo primeiro)
function mphFromSec(L) {
  if (!mphOk(L) || S.still || layerStill(L) || L.locked) return null;
  const dur = S.duration;
  const cs = S.layers.filter(o => o !== L && mphOk(o) && o.visible && !o.locked && !(slides() > 1 && slideOfL(o) !== slideOfL(L)))
    .sort((p, q) => Math.abs((p.end ?? dur) - L.start) - Math.abs((q.end ?? dur) - L.start)).slice(0, 8);
  if (!cs.length) return null;
  const wrap = h('div', { class:'chips' });
  for (const o of cs) wrap.append(h('button', { class:'chip', title:`“${o.name}” vira este elemento`, onclick:() => mphLink(o, L, 'morph') }, [h('span', { text:o.name })]));
  return h('section', { class:'sec' }, [h('h3', { text:'Transformar a partir de' }),
    h('p', { class:'hint', text:'Escolha o elemento que vira este. Ele passa a terminar onde este começa e a transformação fica na emenda (depois dá para trocar a variação).' }), wrap]);
}
