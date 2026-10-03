// Teste no navegador: frame dentro de frame, descendo com clique duplo no palco (grupos abertos e recolhidos).
// A lista de Camadas e a timeline precisam marcar exatamente o que está escolhido em cada nível.
// Rodar: node testes/selecao-frames.js   (precisa do playwright; no Claude Code na nuvem já vem instalado)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : `\n      esperado ${JSON.stringify(esperado)}\n      veio     ${JSON.stringify(real)}`));
};
async function cenario(b, recolhido) {
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(recolhido => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2, 3].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = 'T' + i; L.y = .2 + i * .15; L.x = .5; L.start = 0; return L; });
    S.groups = S.groups || {};
    ls[0].grp = ls[1].grp = 'ga'; ls[2].grp = ls[3].grp = 'gb';
    S.groups.ga = { name:'Dentro A', parent:'gc' }; S.groups.gb = { name:'Dentro B', parent:'gc' }; S.groups.gc = { name:'Fora', open:!recolhido };
    T = 3; RT.selected = null; RT.picks = new Set(); renderLayers(); renderTimeline(); needs = true; window._ls = ls;
  }, recolhido);
  await p.waitForTimeout(300);
  const marcados = () => p.evaluate(() => ({
    lista:[...document.querySelectorAll('#layers [aria-selected="true"] .lnm')].map(e => e.firstChild.textContent),
    timeline:[...document.querySelectorAll('.tl-row.sel .lnm')].map(e => e.firstChild.textContent),
  }));
  const pt = await p.evaluate(() => { const b = _ls[0]._bounds, r = cv.getBoundingClientRect(); return { x:r.left + (b.x + b.w / 2) / FW() * r.width, y:r.top + (b.y + b.h / 2) / H() * r.height }; });
  const tag = recolhido ? ' (recolhido)' : '';
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200);
  const fora = recolhido ? ['Fora'] : ['Fora', 'Dentro B', 'T3', 'T2', 'Dentro A', 'T1', 'T0'];
  const m0 = await marcados(); confere('clique: frame de fora' + tag, m0, { lista:fora, timeline:fora });
  await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(200);
  const m1 = await marcados(); confere('clique duplo: frame de dentro' + tag, m1, { lista:['Dentro A', 'T1', 'T0'], timeline:['Dentro A', 'T1', 'T0'] });
  await p.mouse.dblclick(pt.x, pt.y); await p.waitForTimeout(200);
  const m2 = await marcados(); confere('2º clique duplo: o item' + tag, m2, { lista:['T0'], timeline:['T0'] });
  await p.click('#layers .lgroup .tl-chev'); await p.waitForTimeout(200); // recolher à mão com algo escolhido dentro: fica recolhido e marcado
  confere('recolher à mão continua valendo' + tag, await p.evaluate(() => [S.groups.gc.open, document.querySelectorAll('#layers .lgroup.has-sel').length]), [false, 1]);
  await p.close();
}
(async () => {
  const b = await pw.chromium.launch();
  await cenario(b, false); await cenario(b, true);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
