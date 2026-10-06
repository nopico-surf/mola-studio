// Teste no navegador: Ondulação da forma (borda em escamas/selo/onda/zigue-zague, com "Irregular").
// Liga pelo painel com cliques de verdade e confere: a onda fica dentro da caixa da forma, os cantos do retângulo continuam no
// lugar, o irregular é determinístico e muda com "Sortear outra", e Contorno em vetor, Pathfinder, SVG e "Aplicar a ondulação"
// usam o mesmo desenho. Rodar: node testes/ondulacao.js (prints na pasta temporária, mola-testes/ondulacao-*.png)
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(require('os').tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; T = 0; changed({ layers:true, props:true }); });
  // adiciona a forma pelo botão e liga a Ondulação no painel
  await p.evaluate(() => [...document.querySelectorAll('#adds button.add')].find(b => (b.title || '').toLowerCase().includes('forma')).click());
  await p.waitForTimeout(300);
  await p.evaluate(() => { const L = selL(); L.size = 800 / W(); L.mh = 900 / W(); L.radius = 0; changed({ props:true }); renderProps(); });
  const chk = p.locator('#props label.check', { hasText:'Ondulação' });
  await chk.scrollIntoViewIfNeeded(); await chk.click(); await p.waitForTimeout(200);
  const r1 = await p.evaluate(() => {
    const L = selL(), G = geomNow(L), wv = waveGet(L, G), P = wv.vec[0].pts;
    const inBox = P.every(q => Math.abs(q.x) <= G.w / 2 + .5 && Math.abs(q.y) <= G.h / 2 + .5);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => P.some(q => Math.hypot(q.x - sx * G.w / 2, q.y - sy * G.h / 2) < .5));
    const deep = Math.max(...P.map(q => Math.min(G.w / 2 - Math.abs(q.x), G.h / 2 - Math.abs(q.y))));
    return { on:waveOn(L), kind:L.waveKind, n:P.length, closed:wv.closed, inBox, corners, deep, fields:[...document.querySelectorAll('#props .field label, #props label')].map(l => l.textContent.trim()).filter(t => ['Formato', 'Onda ↔', 'Onda ↕', 'Irregular'].includes(t)) };
  });
  ok(r1.on && r1.closed && r1.n > 40, 'Ondulação liga pelo painel', r1);
  ok(r1.inBox, 'a onda fica dentro da caixa da forma', r1);
  ok(r1.corners, 'os quatro cantos do retângulo continuam no lugar (alto de uma onda)', r1);
  ok(Math.abs(r1.deep - 16) < 1, 'a onda entra a altura escolhida (16 px)', r1.deep);
  ok(['Formato', 'Onda ↔', 'Onda ↕', 'Irregular'].every(t => r1.fields.includes(t)), 'campos Formato, Onda ↔, Onda ↕ e Irregular no painel', r1.fields);
  // Irregular pelo campo digitável
  const irr = p.locator('#props input.num[aria-label="Irregular (valor)"]');
  await irr.click(); await irr.fill('60'); await irr.press('Enter'); await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => {
    const L = selL(), G = geomNow(L), a = JSON.stringify(waveBuild(L, localVec(L, G), G)), b2 = JSON.stringify(waveBuild(L, localVec(L, G), G));
    const reg = JSON.stringify(waveBuild({ ...L, waveIrr:0 }, localVec(L, G), G)), P = JSON.parse(a)[0].pts;
    return { irr:L.waveIrr, same:a === b2, diff:a !== reg, inBox:P.every(q => Math.abs(q.x) <= G.w / 2 + .5 && Math.abs(q.y) <= G.h / 2 + .5), btn:!![...document.querySelectorAll('#props button')].find(x => x.textContent === 'Sortear outra') };
  });
  ok(Math.abs(r2.irr - .6) < 1e-6 && r2.diff, 'Irregular 60% muda o desenho', r2);
  ok(r2.same, 'irregular é determinístico (mesmo desenho a cada quadro)', r2);
  ok(r2.inBox, 'irregular continua dentro da caixa', r2);
  ok(r2.btn, '"Sortear outra" aparece com irregular', r2);
  const before = await p.evaluate(() => JSON.stringify(waveGet(selL(), geomNow(selL())).vec));
  await p.locator('#props button', { hasText:'Sortear outra' }).click(); await p.waitForTimeout(200);
  const after = await p.evaluate(() => JSON.stringify(waveGet(selL(), geomNow(selL())).vec));
  ok(before !== after, '"Sortear outra" troca o desenho irregular');
  // cada formato, em várias formas (sem erro, fechado, dentro da caixa)
  const r3 = await p.evaluate(() => {
    const L = selL(), out = [];
    for (const kind of ['rect', 'ellipse', 'star', 'triangle', 'polygon']) for (const wk of Object.keys(WAVE_KINDS)) {
      const o = { ...L, kind, waveKind:wk, radius:kind === 'rect' ? 40 : 0 }, G = geomNow(L), v = waveBuild(o, localVec(o, G), G);
      const fin = v.length && v[0].pts.every(q => [q.x, q.y, q.ix, q.iy, q.ox, q.oy].every(Number.isFinite));
      if (!fin || !v[0].closed) out.push(kind + '/' + wk);
    }
    return out;
  });
  ok(!r3.length, 'todos os formatos em retângulo, círculo, estrela, triângulo e polígono', r3);
  // linha (caminho aberto) ondula também
  const r4 = await p.evaluate(() => { const L = selL(), o = { ...L, kind:'line' }, G = { w:600, h:8 }, v = waveBuild(o, localVec(o, G), G); return { n:v[0].pts.length, closed:v[0].closed, ys:Math.max(...v[0].pts.map(q => Math.abs(q.y))) }; });
  ok(r4.n > 10 && !r4.closed && r4.ys > 10, 'linha ondula (caminho aberto)', r4);
  // Contorno em vetor, Pathfinder e SVG com a onda
  const r5 = await p.evaluate(async () => {
    const L = selL(); L.stroke = true; L.strokeW = 10; L.strokeColor = '#f2df8a'; changed({ props:true });
    const n0 = S.layers.length, pf = pfSubpaths(L), wn = waveGet(L, geomNow(L)).vec[0].pts.length;
    ensureBounds([L]); const svg = await svgShape(L, newSvgCtx());
    const okOut = outlineStroke(L), nv = S.layers.length;
    undo(); select(S.layers.find(l => l.type === 'shape').id);
    return { pf:pf && pf[0].pts.length === wn, svg:/<path d="M[^"]*C/.test(svg), okOut, nv:nv - n0 };
  });
  ok(r5.pf, 'Pathfinder recebe a forma com a onda', r5);
  ok(r5.svg, 'SVG sai com o caminho da onda', r5);
  ok(r5.okOut && r5.nv >= 0, 'Contorno em vetor funciona com a onda', r5);
  // print: moldura amarela em escamas, irregular, sem preenchimento (como a referência do usuário)
  await p.evaluate(() => {
    const L = selL(); L.mode = 'solid'; L.c1 = withA(L.c1 || '#000000', 0); L.stroke = true; L.strokeW = 9; L.strokeColor = '#efdc8b';
    L.waveKind = 'arc'; L.waveSize = 70; L.waveH = 22; L.waveIrr = .45; L.radius = 0;
    const bg = S.layers.find(l => l.type === 'bg'); bg.mode = 'solid'; bg.c1 = '#0b1730';
    changed({ props:true }); renderProps();
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path:path.join(outDir, 'ondulacao-escamas.png') });
  for (const wk of ['stamp', 'sine', 'zig']) {
    await p.evaluate(k => { const L = selL(); L.waveKind = k; L.waveIrr = 0; changed({ props:true }); }, wk); await p.waitForTimeout(250);
    await p.locator('#stageBox').screenshot({ path:path.join(outDir, `ondulacao-${wk}.png`) });
  }
  // "Desenhar traço" percorre a onda; custo por quadro (a onda fica pronta em cache)
  const r8 = await p.evaluate(() => {
    const L = selL(); L.in = 'draw'; L.inDur = 1.2; changed({ props:true });
    const c = document.createElement('canvas'); c.width = 540; c.height = 675; const x = c.getContext('2d');
    for (const t of [L.start + .3, L.start + .7, L.start + 1.5]) renderFrame(x, t, .5, false);
    const time = on => { L.wave = on; renderFrame(x, L.start + 2, .5, false); const t0 = performance.now(); for (let i = 0; i < 30; i++) renderFrame(x, L.start + 2, .5, false); x.getImageData(0, 0, 1, 1); return (performance.now() - t0) / 30; };
    const off = time(false), on = time(true);
    return { off:+off.toFixed(2), on:+on.toFixed(2) };
  });
  console.log('     quadro sem onda', r8.off, 'ms, com onda', r8.on, 'ms');
  ok(r8.on < r8.off + 4, 'a onda não pesa por quadro', r8);
  const r9 = await p.evaluate(async () => { openComps('shape'); await new Promise(r => setTimeout(r, 300)); const has = [...document.querySelectorAll('label')].some(l => l.textContent.trim() === 'Ondulação' && !l.closest('#props')); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return has; });
  ok(r9, 'janela Componentes (Forma) tem a Ondulação');
  await p.keyboard.press('Escape'); await p.evaluate(() => { const L = S.layers.find(l => l.type === 'shape'); select(L.id); renderProps(); });
  // "Aplicar a ondulação" vira Vetor com a onda nos pontos, no mesmo lugar
  const r6 = await p.evaluate(() => { const L = selL(); L.waveKind = 'arc'; L.waveIrr = .45; changed({ props:true }); renderProps(); ensureBounds([L]); return { b:{ ...L._bounds }, n:waveGet(L, geomNow(L)).vec[0].pts.length }; });
  await p.locator('#props button', { hasText:'Aplicar a ondulação' }).click(); await p.waitForTimeout(300);
  const r7 = await p.evaluate(() => { const L = selL(); L._bounds = null; ensureBounds([L]); return { kind:L.kind, wave:L.wave, n:vecOf(L) && vecOf(L)[0].pts.length, b:{ ...L._bounds } }; });
  const near = (a, c) => ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - c[k]) < 3);
  ok(r7.kind === 'custom' && !r7.wave && r7.n === r6.n, '"Aplicar a ondulação" vira Vetor com os pontos da onda', { r6, r7 });
  ok(near(r6.b, r7.b), '"Aplicar a ondulação" deixa a forma no mesmo lugar', { a:r6.b, c:r7.b });
  await b.close(); process.exit(falhas ? 1 : 0);
})();
