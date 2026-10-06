// Teste no navegador: tornar outro formato o principal (clique duplo no botão do formato) com um frame de layout automático,
// solto ou no carrossel, não pode deixar "posição presa" nos outros formatos por 1 a 2 px de diferença da adaptação.
// Rodar: node testes/formato-sem-presa.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
async function cenario(b, nsl, flow) {
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(({ nsl, flow }) => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.start = 0; return L; });
    if (nsl > 1) setSlides(nsl);
    if (flow) { RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[1].id; flowToggle(); }
    RT.picks = new Set(); RT.selected = null; changed({ props:true });
  }, { nsl, flow });
  const fmtBtn = f => p.locator('#fmt button', { hasText:f }).first();
  await fmtBtn('1:1').click(); await p.waitForTimeout(300);
  await fmtBtn('1:1').dblclick(); await p.waitForTimeout(400);
  const res = [];
  for (const f of ['9:16', '4:5', '3:4']) {
    await fmtBtn(f).click(); await p.waitForTimeout(400);
    res.push(await p.evaluate(() => [S.format, S.base, S.layers.filter(ownPos).length]));
  }
  const ok = res.every(r => r[1] === '1x1' && r[2] === 0);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ` slides=${nsl} frame=${flow}  ${JSON.stringify(res)}`);
  await p.close();
}
(async () => {
  const b = await pw.chromium.launch();
  for (const nsl of [1, 3]) for (const flow of [false, true]) await cenario(b, nsl, flow);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
