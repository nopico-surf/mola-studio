// Teste no navegador: texto sobre uma forma, no mesmo grupo (solto, girado), escolhido inteiro.
// Bug relatado: "dois cliques no texto e não consigo editar" — o 1º clique duplo só descia até o texto e era preciso outro.
// Agora um clique duplo no texto de um grupo sem frame em volta já abre a edição; com frame dentro de frame segue por níveis
// (testes/texto-em-frame-de-um-item.js).
// Rodar: node testes/clique-duplo-texto-no-grupo.js
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
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await (await b.newContext({ viewport:{ width:1500, height:950 } })).newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  for (const rot of [0, -5.3]) {
    await p.evaluate(rot => {
      S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
      const mk = (L, x, y) => { L.start = 0; L.end = S.duration; addLayer(L, { x, y }); return L; };
      const sh = mk(mkComp('shape'), .5, .3); sh.kind = 'ellipse'; sh.size = .7; sh.mh = .2;
      const t = mk(mkText('title', { text:'Álcool em casa', size:64 }), .5, .3);
      T = 3; window.__t = t.id;
      RT.picks = new Set([sh.id, t.id]); RT.selected = t.id; groupSel();
      S.groups[t.grp] = S.groups[t.grp] || {}; S.groups[t.grp].rot = rot;
      changed({ layers:true, props:true }); selectBg(); RT.frameNo++; renderFrame(pctx, T, RS, false);
    }, rot);
    const pos = await p.evaluate(() => { const L = S.layers.find(l => l.id === window.__t); RT.frameNo++; renderFrame(pctx, T, RS, false); const r = cv.getBoundingClientRect(), k = r.width / FW(), bb = L._bounds, pt = camFwd(camOf(L), { x:bb.x + bb.w / 2, y:bb.y + bb.h / 2 }); return { x:r.left + pt.x * k, y:r.top + pt.y * k }; });
    await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(150); // grupo inteiro escolhido
    confere(`giro ${rot}: grupo escolhido inteiro`, await p.evaluate(() => !!wholeGroup()), true);
    await p.mouse.dblclick(pos.x, pos.y); await p.waitForTimeout(300);
    confere(`giro ${rot}: um clique duplo abre a edição no palco`, await p.evaluate(() => ({ sed:!!SED.el, so:pickedLayers().length === 1 && pickedLayers()[0].id === window.__t })), { sed:true, so:true });
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  }
  await b.close();
  console.log(falhas ? `${falhas} falha(s)` : 'tudo certo'); process.exit(falhas ? 1 : 0);
})();
