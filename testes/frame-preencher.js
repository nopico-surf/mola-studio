// Teste no navegador: frame em "Preencher" (F.fillW / F.fillH), como o Fill container do Figma.
// Frame de cima: a caixa vira a margem. Frame de dentro: ocupa a largura útil do de fora (outro eixo) ou o que sobra da fila (mesmo eixo).
// Rodar: node testes/frame-preencher.js
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
  const monta = flows => p.evaluate(flows => {
    S.layers = S.layers.filter(l => !/^T\d$/.test(l.name)); S.groups = {};
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = 'T' + i; L.y = .3 + i * .12; L.x = .5; L.start = 0; return L; });
    ls[0].grp = 'gf'; ls[1].grp = ls[2].grp = 'ga';
    S.groups.gf = { name:'Frame', open:true, flow:flows.gf };
    S.groups.ga = { name:'Caixa', open:true, parent:'gf', flow:flows.ga };
    T = 3; changed({ layers:true, props:true });
  }, flows);
  const caixa = gid => p.evaluate(gid => { const r = flowNow(gid), k = r.kk || 1; return { x0:Math.round(r.box.x0), x1:Math.round(r.box.x1), y0:Math.round(r.box.y0), y1:Math.round(r.box.y1), k }; }, gid);
  const margem = () => p.evaluate(() => { const M = marginBox(S.format); return M ? { x0:Math.round(M.x0), x1:Math.round(M.x1), y0:Math.round(M.y0), y1:Math.round(M.y1) } : { x0:0, x1:W(), y0:0, y1:H() }; });

  // 1) frame de cima em Preencher nos dois eixos = a margem
  await monta({ gf:{ dir:'v', gap:24, fillW:true, fillH:true }, ga:{ dir:'v', gap:24 } });
  await p.waitForTimeout(200);
  let c = await caixa('gf'), m = await margem();
  confere('frame de cima: largura e altura = a margem', [c.x0, c.x1, c.y0, c.y1], [m.x0, m.x1, m.y0, m.y1]);

  // 2) só a largura: a altura continua do conteúdo (menor que a margem)
  await monta({ gf:{ dir:'v', gap:24, fillW:true }, ga:{ dir:'v', gap:24 } });
  await p.waitForTimeout(200);
  c = await caixa('gf');
  confere('só a largura: x = margem, altura menor que a margem', [c.x0, c.x1, c.y1 - c.y0 < m.y1 - m.y0], [m.x0, m.x1, true]);

  // 3) frame de dentro em Preencher na largura: igual à largura útil do de fora (fixo 1000 px, padding 40)
  await monta({ gf:{ dir:'v', gap:24, w:1000, pl:40, pr:40 }, ga:{ dir:'v', gap:24, fillW:true } });
  await p.waitForTimeout(200);
  let g = await caixa('gf'), a = await caixa('ga');
  confere('frame de dentro: largura = largura útil do de fora', [a.x1 - a.x0, g.x1 - g.x0 - 80 * g.k], [Math.round(g.x1 - g.x0 - 80 * g.k), Math.round(g.x1 - g.x0 - 80 * g.k)]);

  // 4) de fora abraça: o de dentro também abraça (não cresce sem limite)
  await monta({ gf:{ dir:'v', gap:24 }, ga:{ dir:'v', gap:24, fillW:true } });
  await p.waitForTimeout(200);
  g = await caixa('gf'); a = await caixa('ga');
  confere('de fora abraça: o de dentro não passa dele', a.x1 - a.x0 <= g.x1 - g.x0 + 1, true);

  // 5) no eixo da fila (em coluna, altura): o de dentro ocupa o que sobra
  await monta({ gf:{ dir:'v', gap:24, h:1000 }, ga:{ dir:'v', gap:24, fillH:true } });
  await p.waitForTimeout(200);
  g = await caixa('gf'); a = await caixa('ga');
  const t0 = await p.evaluate(() => Math.round(flowNow('gf').items.find(i => i.L.name === 'T0').h));
  confere('altura: de dentro + irmão + espaço = altura do de fora', Math.abs((a.y1 - a.y0) + t0 + 24 * g.k - (g.y1 - g.y0)) <= 3, true);

  // 6) alça no palco troca Preencher por tamanho fixo
  await p.evaluate(() => { S.groups.gf.flow.fillW = true; });
  await p.evaluate(() => { const F = S.groups.gf.flow; F.w = 600; F.fillW = undefined; });
  confere('depois de fixar, fillW some', await p.evaluate(() => !S.groups.gf.flow.fillW), true);

  // 7) com o layout do quadro ligado e outro elemento na tela junto (bug relatado: a coluna empurrava o frame para baixo do título
  //    com a altura da margem inteira e ele passava da margem): o frame ocupa o que sobra na coluna
  for (const lado of ['em cima', 'embaixo']) {
    const r = await p.evaluate(lado => {
      S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {};
      const t = addLayer(mkComp('title')); t.text = '-30%'; t.y = lado === 'em cima' ? .1 : .9; t.start = 0; t.end = S.duration;
      const s = addLayer(mkComp('sub')); s.y = .5; s.start = 0; s.end = S.duration; s.grp = 'gq';
      S.groups.gq = { name:'Frame', open:true, flow:{ dir:'v', gap:24, fillW:true, fillH:true } };
      S.flow = { gap:24 }; T = 3; changed({ layers:true, props:true }); RT.frameNo++; placeOf(s);
      const b = flowNow('gq').box, M = marginBox(S.format) || { x0:0, x1:W(), y0:0, y1:H() }, ty = placeOf(t).y * H();
      const res = { dentro:b.y0 >= M.y0 - 1 && b.y1 <= M.y1 + 1 && b.x0 >= M.x0 - 1 && b.x1 <= M.x1 + 1, encosta:lado === 'em cima' ? Math.abs(b.y1 - M.y1) <= 1 : Math.abs(b.y0 - M.y0) <= 1, separado:lado === 'em cima' ? b.y0 > ty : b.y1 < ty };
      delete S.flow; return res;
    }, lado);
    confere('layout do quadro, título ' + lado + ': frame dentro da margem e ocupa o resto', r, { dentro:true, encosta:true, separado:true });
  }

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
