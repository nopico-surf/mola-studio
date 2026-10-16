// Teste no navegador: Shift/Ctrl + clique na BARRA de um frame na timeline soma o frame à seleção (antes trocava a seleção),
// e alinhar trata cada frame como uma peça. Rodar: node testes/varios-frames-timeline.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : `\n      esperado ${JSON.stringify(esperado)}\n      veio     ${JSON.stringify(real)}`));
};
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    S.groups = S.groups || {};
    [['ga', .2, .2, 0], ['gb', .5, .45, 1], ['gc', .7, .7, 2]].forEach(([g, x, y, t]) => [0, 1].forEach(i => {
      const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = g + i; L.x = x; L.y = y + i * .05; L.start = t; L.end = t + 2; L.grp = g;
    }));
    ['ga', 'gb', 'gc'].forEach(g => { S.groups[g] = { name:'Frame ' + g, open:true, flow:{ dir:'v', gap:10, auto:false, align:'start', pin:'start' } }; });
    T = 0; RT.selected = null; RT.picks = new Set(); changed({ layers:true });
  });
  await p.waitForTimeout(800);
  const bar = g => p.evaluate(g => { const r = document.querySelector(`#tl .tl-row[data-gid="${g}"] .tl-bar`).getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; }, g);
  const estado = () => p.evaluate(() => ({ frames:selFrames().slice().sort(), whole:wholeGroup(),
    tl:['ga', 'gb', 'gc'].filter(g => document.querySelector(`#tl .tl-row[data-gid="${g}"]`).classList.contains('sel')) }));
  let q = await bar('ga'); await p.mouse.click(q.x, q.y); await p.waitForTimeout(200);
  let e = await estado(); confere('clique na barra do A: só o A', [e.frames, e.whole], [['ga'], 'ga']);
  q = await bar('gb'); await p.keyboard.down('Shift'); await p.mouse.click(q.x, q.y); await p.keyboard.up('Shift'); await p.waitForTimeout(200);
  q = await bar('gc'); await p.keyboard.down('Shift'); await p.mouse.click(q.x, q.y); await p.keyboard.up('Shift'); await p.waitForTimeout(200);
  e = await estado(); confere('Shift + clique nas barras do B e do C: os três', [e.frames, e.whole, e.tl], [['ga', 'gb', 'gc'], null, ['ga', 'gb', 'gc']]);
  const t0 = await p.evaluate(() => S.layers.filter(l => l.grp).map(l => [l.start, l.end]));
  confere('Shift + clique não mexe no tempo', t0, [[0, 2], [0, 2], [1, 3], [1, 3], [2, 4], [2, 4]]);
  const al = await p.evaluate(() => { alignLayers('l'); ensureBounds(S.layers.filter(l => l.grp)); return ['ga', 'gb', 'gc'].map(g => Math.round(Math.min(...gleaves(g).map(l => l._bounds.x)))); });
  confere('alinhar à esquerda: os três na mesma borda', new Set(al).size, 1);
  q = await bar('gb'); await p.keyboard.down('Shift'); await p.mouse.click(q.x, q.y); await p.keyboard.up('Shift'); await p.waitForTimeout(200);
  e = await estado(); confere('Shift + clique no B de novo: tira o B', e.frames, ['ga', 'gc']);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
  process.exit(falhas ? 1 : 0);
})();
