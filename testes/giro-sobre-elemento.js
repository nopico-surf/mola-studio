// Teste no navegador: a zona de giro logo fora da quina aparece também quando há outro elemento por baixo (dentro do palco),
// e gira de verdade com o mouse. Com Shift o clique continua indo para o de baixo. Rodar: node testes/giro-sobre-elemento.js
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
    const big = mkComp('shape'); big.name = 'Grande'; big.size = 1.2; big.mh = 1.6; big.x = .5; big.y = .5; addLayer(big);
    const sm = mkComp('shape'); sm.name = 'Pequena'; sm.size = .3; sm.mh = .3; sm.x = .5; sm.y = .5; sm.in = 'none'; addLayer(sm);
    RT.picks = new Set(); RT.selected = null; changed({ layers:true });
  });
  await p.waitForTimeout(600);
  const tela = q => p.evaluate(q => { const r = cv.getBoundingClientRect(); return { x:r.left + q.x / FW() * r.width, y:r.top + q.y / H() * r.height }; }, q);
  const centro = await p.evaluate(() => { const L = S.layers.find(l => l.name === 'Pequena'), b = L._bounds; return { x:b.x + b.w / 2, y:b.y + b.h / 2 }; });
  const c = await tela(centro);
  await p.mouse.click(c.x, c.y); await p.waitForTimeout(250);
  confere('clique escolhe a forma pequena', await p.evaluate(() => selL() && selL().name), 'Pequena');
  const fora = await p.evaluate(() => { const q = handlesOf(selL()).find(h => h.k === 'ne'); return { x:q.x + hRad() * 1.8, y:q.y - hRad() * 1.8 }; });
  confere('a forma grande está debaixo da zona de giro', await p.evaluate(q => (hitTest(q) || {}).name, fora), 'Grande');
  const f = await tela(fora);
  await p.mouse.move(f.x, f.y); await p.waitForTimeout(150);
  confere('cursor de girar sobre a forma grande', await p.evaluate(() => cv.style.cursor.includes('alias')), true);
  // gira arrastando da quina para baixo, em volta do centro
  await p.mouse.down(); await p.mouse.move(f.x + 60, f.y + 120, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(250);
  confere('arrastar gira a forma pequena', await p.evaluate(() => Math.abs(S.layers.find(l => l.name === 'Pequena').rot || 0) > 5), true);
  confere('a seleção continua a forma pequena', await p.evaluate(() => selL() && selL().name), 'Pequena');
  // com Shift, o mesmo lugar é clique na forma de baixo (soma à seleção), não giro
  const fora2 = await p.evaluate(() => { const q = handlesOf(selL()).find(h => h.k === 'ne'); return { x:q.x + hRad() * 1.8, y:q.y - hRad() * 1.8 }; });
  const f2 = await tela(fora2);
  const rot0 = await p.evaluate(() => S.layers.find(l => l.name === 'Pequena').rot);
  await p.keyboard.down('Shift'); await p.mouse.click(f2.x, f2.y); await p.keyboard.up('Shift'); await p.waitForTimeout(250);
  confere('Shift + clique soma a forma de baixo', await p.evaluate(() => pickedLayers().map(l => l.name).sort().join(',')), 'Grande,Pequena');
  confere('Shift + clique não gira', await p.evaluate(() => S.layers.find(l => l.name === 'Pequena').rot), rot0);
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
