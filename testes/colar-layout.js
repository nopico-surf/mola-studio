// Teste no navegador: duplicar/colar um item de um frame com layout automático (espaçamento Auto ou número):
// a cópia fica no mesmo frame e já entra organizada na fila, sem cair em cima de outro elemento.
// Rodar: node testes/colar-layout.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
async function cenario(b, auto, como) {
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(({ auto, como }) => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = 'T' + i; L.y = .3 + i * .12; L.x = .5; L.start = 0; return L; });
    RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[2].id; flowToggle();
    const gid = ls[0].grp, F = S.groups[gid].flow; F.auto = auto; if (!auto) F.gap = 30; changed({ layers:true });
    RT.picks = new Set([ls[1].id]); RT.selected = ls[1].id;
    if (como === 'duplicar') duplicateLayer(ls[1]); else pasteLayers(clipPayload());
    renderFrame(pctx, 0, RS, false); flowBake(); renderFrame(pctx, 0, RS, false);
    const its = S.layers.filter(l => l.type !== 'bg');
    return { grp:its.every(l => l.grp === gid), ys:its.map(l => Math.round(placeOf(l).y * H())) };
  }, { auto, como });
  const ys = [...r.ys].sort((a, c) => a - c), ok = r.grp && r.ys.length === 4 && ys.every((y, i) => !i || y - ys[i - 1] > 20);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ` ${como} auto=${auto} ${JSON.stringify(r)}`);
  await p.close();
}
(async () => {
  const b = await pw.chromium.launch();
  for (const auto of [true, false]) for (const como of ['duplicar', 'colar']) await cenario(b, auto, como);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
