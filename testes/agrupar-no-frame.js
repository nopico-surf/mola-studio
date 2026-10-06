// Teste no navegador: agrupar (Ctrl+G) e layout automático (Shift+A) com itens de dentro de um frame com layout automático.
// O grupo novo tem que nascer DENTRO do frame em comum (S.groups[novo].parent), também quando a seleção mistura níveis
// (um item de uma Caixa, que é um frame dentro do frame, + um item do frame). Antes ele ia para fora do frame.
// Rodar: node testes/agrupar-no-frame.js
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
  // Frame (layout) = [Caixa (frame com layout) = [T0, T2], T1]
  const monta = () => p.evaluate(() => {
    S.layers = S.layers.filter(l => !/^T\d$/.test(l.name)); S.groups = {};
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = 'T' + i; L.y = .3 + i * .12; L.x = .5; L.start = 0; return L; });
    ls[0].grp = ls[2].grp = 'ga'; ls[1].grp = 'gf';
    S.groups.gf = { name:'Frame', open:true, flow:{ dir:'v', gap:24 } };
    S.groups.ga = { name:'Caixa', open:true, parent:'gf', flow:{ dir:'v', gap:24, pt:20, pb:20, pl:30, pr:30 } };
    T = 3; window._ls = ls; changed({ layers:true, props:true });
  });
  const escolhe = (ids, item) => p.evaluate(([ids, item]) => {
    RT.picks = new Set(ids.map(i => _ls[i].id)); RT.itemPicks = item ? RT.picks : null; RT.selected = _ls[ids[ids.length - 1]].id;
    changed({ props:true }); if (document.activeElement) document.activeElement.blur();
  }, [ids, item]);
  const estado = () => p.evaluate(() => {
    const g = _ls[0].grp, G = S.groups[g] || {};
    return { juntos:_ls[0].grp === _ls[1].grp, pai:G.parent || null, caixa:_ls[2].grp, frame:!!(S.groups.gf && S.groups.gf.flow) };
  });

  await monta(); await p.waitForTimeout(200);
  await escolhe([0, 1], true); await p.keyboard.press('Control+g'); await p.waitForTimeout(300);
  confere('Ctrl+G com item da Caixa + item do Frame: grupo dentro do Frame', await estado(), { juntos:true, pai:'gf', caixa:'ga', frame:true });

  await monta(); await p.waitForTimeout(200);
  await escolhe([1, 2], true); await p.keyboard.press('Control+g'); await p.waitForTimeout(300);
  confere('Ctrl+G com T1 + T2: grupo dentro do Frame', await p.evaluate(() => [_ls[1].grp === _ls[2].grp, (S.groups[_ls[1].grp] || {}).parent || null]), [true, 'gf']);

  await monta(); await p.waitForTimeout(200);
  await escolhe([0, 1], true); await p.keyboard.press('Shift+A'); await p.waitForTimeout(300);
  confere('Shift+A com item da Caixa + item do Frame: frame novo dentro do Frame',
    await p.evaluate(() => { const g = _ls[1].grp, G = S.groups[g] || {}; return [g !== 'gf', G.parent || null, !!G.flow]; }), [true, 'gf', true]);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
