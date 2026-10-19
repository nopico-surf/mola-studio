// Teste no navegador: frames embrulhados (o de fora tem as mesmas folhas que o de dentro) não prendem o clique duplo.
// Fora > Meio (mesmas folhas) > Dentro A (T0, T1) + Dentro B (T2, T3): clique, clique duplo, clique duplo, clique duplo.
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
    const ls = [0, 1, 2, 3].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = 'T' + i; L.y = .2 + i * .15; L.x = .5; L.start = 0; return L; });
    S.groups = S.groups || {};
    ls[0].grp = ls[1].grp = 'ga'; ls[2].grp = ls[3].grp = 'gb';
    S.groups.ga = { name:'Dentro A', parent:'gc' }; S.groups.gb = { name:'Dentro B', parent:'gc' };
    S.groups.gc = { name:'Meio', parent:'gz' }; S.groups.gz = { name:'Fora' };
    T = 3; RT.selected = null; RT.picks = new Set(); renderLayers(); renderTimeline(); needs = true; window._ls = ls;
  });
  await p.waitForTimeout(300);
  const nomes = () => p.evaluate(() => pickedLayers().map(l => l.name));
  const pt = await p.evaluate(() => { const b = _ls[0]._bounds, r = cv.getBoundingClientRect(); return { x:r.left + (b.x + b.w / 2) / FW() * r.width, y:r.top + (b.y + b.h / 2) / H() * r.height }; });
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  confere('clique: tudo', await nomes(), ['T0', 'T1', 'T2', 'T3']);
  await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(200);
  confere('clique duplo: pula o frame embrulhado e vai ao Dentro A', await nomes(), ['T0', 'T1']);
  await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(200);
  confere('2º clique duplo: o item', await nomes(), ['T0']);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
