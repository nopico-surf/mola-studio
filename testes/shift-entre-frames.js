// Teste no navegador: Shift + clique soma/tira frames irmãos (os cartões de dentro de uma coluna), com o mouse de verdade.
// Clique duplo no fundo pintado de um frame desce até ele. Rodar: node testes/shift-entre-frames.js
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
    const k = ADD_KINDS.find(k => k.id === 'sub'), f = () => ({ dir:'v', gap:20, auto:false, align:'center', pin:'start', pt:60, pr:60, pb:60, pl:60 });
    S.groups = S.groups || {};
    [['ga', 'A', .2], ['gb', 'B', .4], ['gd', 'C', .6]].forEach(([g, nm, y]) => [0, 1].forEach(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = nm + i; L.y = y + i * .05; L.x = .5; L.start = 0; L.grp = g; L.fixW = true; L.maxW = .3; }));
    S.groups.ga = { name:'Cartão A', parent:'gc', flow:f(), fill:'#a8f0c6' }; S.groups.gb = { name:'Cartão B', parent:'gc', flow:f(), fill:'#a8f0c6' };
    S.groups.gd = { name:'Cartão C', parent:'gc', flow:f(), fill:'#a8f0c6' }; S.groups.gc = { name:'Fora', open:true, flow:{ dir:'v', gap:30, auto:false, align:'center', pin:'start' }, fill:'#0a9060' };
    T = 3; RT.selected = null; RT.picks = new Set(); changed({ layers:true });
  });
  await p.waitForTimeout(800);
  // ponto na tela no fundo do frame (sem item embaixo e sem alça da seleção)
  const ponto = g => p.evaluate(g => {
    const R = frameRect(g), r = cv.getBoundingClientRect(); if (!R) return null;
    for (let y = R.y + 40; y < R.y + R.h; y += 5) for (let x = R.x + 40; x < R.x + R.w; x += 5) {
      const q = { x, y }; if (!hitTest(q) && !handleAt(q) && (frameHitG(q) || {}).g === g) return { x:r.left + x / FW() * r.width, y:r.top + y / H() * r.height };
    }
    return null;
  }, g);
  const nomes = () => p.evaluate(() => [...new Set(pickedLayers().map(l => l.name[0]))].sort().join(''));
  const pa = await ponto('ga'), pb = await ponto('gb'), pc = await ponto('gd');
  confere('acha o fundo dos três cartões', !!(pa && pb && pc), true);
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(150);
  confere('clique no fundo: a coluna inteira', await nomes(), 'ABC');
  await p.mouse.dblclick(pa.x, pa.y); await p.waitForTimeout(250);
  confere('clique duplo no fundo: o cartão A', await nomes(), 'A');
  await p.keyboard.down('Shift'); await p.mouse.click(pb.x, pb.y); await p.keyboard.up('Shift'); await p.waitForTimeout(250);
  confere('Shift + clique no cartão B: A e B', await nomes(), 'AB');
  // a caixa da seleção é a dos cartões (com o espaço interno), não só a do texto de dentro
  confere('caixa de A + B cobre os dois cartões', await p.evaluate(() => {
    const u = selUnion(), a = frameRect('ga'), b = frameRect('gb'); if (!u || !a || !b) return false;
    const e = 1; return u.x <= Math.min(a.x, b.x) + e && u.y <= Math.min(a.y, b.y) + e && u.x + u.w >= Math.max(a.x + a.w, b.x + b.w) - e && u.y + u.h >= Math.max(a.y + a.h, b.y + b.h) - e;
  }), true);
  await p.keyboard.down('Shift'); await p.mouse.click(pc.x, pc.y); await p.keyboard.up('Shift'); await p.waitForTimeout(700);
  confere('Shift + clique no cartão C: os três', await nomes(), 'ABC');
  await p.keyboard.down('Shift'); await p.mouse.click(pb.x, pb.y); await p.keyboard.up('Shift'); await p.waitForTimeout(700);
  confere('Shift + clique no B de novo: tira só o B', await nomes(), 'AC');
  // seleção por área: começa fora da coluna e toca só pedaços dos cartões A e B -> os dois cartões (não a coluna toda)
  const tela = (x, y) => p.evaluate(([x, y]) => { const r = cv.getBoundingClientRect(); return { x:r.left + x / FW() * r.width, y:r.top + y / H() * r.height }; }, [x, y]);
  const R = await p.evaluate(() => { const c = frameRect('gc'), a = frameRect('ga'), bb = frameRect('gb'); return { c, a, bb }; });
  const arrasta = async (x0, y0, x1, y1, shift) => {
    const s = await tela(x0, y0), e = await tela(x1, y1);
    if (shift) await p.keyboard.down('Shift');
    await p.mouse.move(s.x, s.y); await p.mouse.down(); await p.mouse.move((s.x + e.x) / 2, (s.y + e.y) / 2, { steps:4 }); await p.mouse.move(e.x, e.y, { steps:4 }); await p.mouse.up();
    if (shift) await p.keyboard.up('Shift');
    await p.waitForTimeout(250);
  };
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderLayers(); needs = true; });
  await arrasta(R.c.x - 40, R.a.y + R.a.h / 2, R.c.x + 70, R.bb.y + 30);
  confere('área tocando pedaços de A e B: os dois cartões', await nomes(), 'AB');
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderLayers(); needs = true; });
  await arrasta(R.c.x - 40, R.c.y - 40, R.c.x + R.c.w + 40, R.c.y + R.c.h + 40);
  confere('área que cobre a coluna inteira: a coluna', await nomes(), 'ABC');
  // com A escolhido, Shift + clique no B logo abaixo (perto da zona de giro do canto do A) soma, não gira
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderLayers(); needs = true; });
  await p.mouse.click(pa.x, pa.y); await p.mouse.dblclick(pa.x, pa.y); await p.waitForTimeout(250);
  const rot0 = await p.evaluate(() => S.groups.ga.rot || 0);
  await p.keyboard.down('Shift'); await p.mouse.move(pb.x, pb.y); await p.mouse.down(); await p.mouse.move(pb.x + 30, pb.y + 30, { steps:4 }); await p.mouse.up(); await p.keyboard.up('Shift'); await p.waitForTimeout(250);
  confere('Shift + clique/arrasto sobre o B não gira o A', await p.evaluate(() => S.groups.ga.rot || 0), rot0);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
