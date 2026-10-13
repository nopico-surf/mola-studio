// Teste no navegador: dois frames irmãos escolhidos (os dois únicos filhos de um frame) continuam sendo os dois, não viram o frame de fora.
// Vale para Shift + clique no palco, Shift + clique no cabeçalho da lista, seleção por área, alinhar e agrupar (Ctrl+G).
// Rodar: node testes/dois-frames-sem-o-de-fora.js
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
    [['ga', 'A', .25], ['gb', 'B', .55]].forEach(([g, nm, y]) => [0, 1].forEach(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.name = nm + i; L.y = y + i * .05; L.x = .5; L.start = 0; L.grp = g; L.fixW = true; L.maxW = .3; }));
    S.groups.ga = { name:'Cartão A', parent:'gc', flow:f(), fill:'#a8f0c6' }; S.groups.gb = { name:'Cartão B', parent:'gc', flow:f(), fill:'#a8f0c6' };
    S.groups.gc = { name:'Fora', open:true, flow:{ dir:'v', gap:30, auto:false, align:'center', pin:'start' }, fill:'#0a9060' };
    T = 3; RT.selected = null; RT.picks = new Set(); changed({ layers:true });
  });
  await p.waitForTimeout(800);
  const ponto = g => p.evaluate(g => {
    const R = frameRect(g), r = cv.getBoundingClientRect(); if (!R) return null;
    for (let y = R.y + 40; y < R.y + R.h; y += 5) for (let x = R.x + 40; x < R.x + R.w; x += 5) {
      const q = { x, y }; if (!hitTest(q) && !handleAt(q) && (frameHitG(q) || {}).g === g) return { x:r.left + x / FW() * r.width, y:r.top + y / H() * r.height };
    }
    return null;
  }, g);
  const estado = () => p.evaluate(() => ({
    nomes:[...new Set(pickedLayers().map(l => l.name[0]))].sort().join(''), whole:wholeGroup(), frames:selFrames().slice().sort(), unidades:selUnits(pickedLayers().filter(l => (ensureBounds([l]), l._bounds))).length,
    lista:Object.fromEntries(['gc', 'ga', 'gb'].map(g => [g, (document.querySelector(`#layers [data-gid="${g}"]`) || {}).ariaSelected || document.querySelector(`#layers [data-gid="${g}"]`)?.getAttribute('aria-selected')])),
  }));
  const pa = await ponto('ga'), pb = await ponto('gb');
  confere('acha o fundo dos dois cartões', !!(pa && pb), true);
  // 1) palco: A, depois Shift + clique no B
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(150);
  await p.mouse.dblclick(pa.x, pa.y); await p.waitForTimeout(250);
  let e = await estado();
  confere('clique duplo: o cartão A', [e.nomes, e.whole], ['A', 'ga']);
  await p.keyboard.down('Shift'); await p.mouse.click(pb.x, pb.y); await p.keyboard.up('Shift'); await p.waitForTimeout(700); // passa dos 500 ms do "segundo clique do duplo"
  e = await estado();
  confere('Shift + clique no B: A e B, não o frame de fora', [e.nomes, e.whole, e.frames], ['AB', null, ['ga', 'gb']]);
  confere('alinhar trata A e B como duas peças', e.unidades, 2);
  confere('lista: A e B marcados, o de fora não', e.lista, { gc:'false', ga:'true', gb:'true' });
  // 2) Shift + clique de novo no B tira só o B
  await p.keyboard.down('Shift'); await p.mouse.click(pb.x, pb.y); await p.keyboard.up('Shift'); await p.waitForTimeout(700); // passa dos 500 ms do "segundo clique do duplo"
  e = await estado();
  confere('Shift + clique no B de novo: só o A', [e.nomes, e.whole], ['A', 'ga']);
  // 3) lista: Shift + clique no cabeçalho do B soma, de novo tira
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderLayers(); needs = true; });
  await p.click('#layers [data-gid="ga"]'); await p.waitForTimeout(150);
  await p.click('#layers [data-gid="gb"]', { modifiers:['Shift'] }); await p.waitForTimeout(250);
  e = await estado();
  confere('lista: Shift + clique no cabeçalho do B: A e B', [e.nomes, e.whole, e.frames, e.lista], ['AB', null, ['ga', 'gb'], { gc:'false', ga:'true', gb:'true' }]);
  await p.click('#layers [data-gid="gb"]', { modifiers:['Shift'] }); await p.waitForTimeout(250);
  e = await estado();
  confere('lista: Shift + clique no B de novo tira o B', [e.nomes, e.whole], ['A', 'ga']);
  // 4) clique no cabeçalho de fora continua escolhendo o frame de fora
  await p.click('#layers [data-gid="gc"]'); await p.waitForTimeout(250);
  e = await estado();
  confere('clique no cabeçalho de fora: o frame de fora', [e.nomes, e.whole], ['AB', 'gc']);
  // 5) área que começa dentro do frame de fora e cobre os dois cartões
  // frame de fora sem cor e com espaço interno: dá para começar a área nele sem pegar o fundo (que escolheria o frame)
  await p.evaluate(() => { const F = S.groups.gc; delete F.fill; Object.assign(F.flow, { pt:50, pr:50, pb:50, pl:50 }); changed({ layers:true }); T = 3; });
  await p.waitForTimeout(600);
  const R = await p.evaluate(() => ({ c:frameRect('gc'), a:frameRect('ga'), bb:frameRect('gb') }));
  const tela = (x, y) => p.evaluate(([x, y]) => { const r = cv.getBoundingClientRect(); return { x:r.left + x / FW() * r.width, y:r.top + y / H() * r.height }; }, [x, y]);
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderLayers(); needs = true; });
  const s = await tela(R.c.x + 8, R.c.y + 8), f = await tela(R.c.x + R.c.w - 8, R.c.y + R.c.h - 8);
  await p.mouse.move(s.x, s.y); await p.mouse.down(); await p.mouse.move((s.x + f.x) / 2, (s.y + f.y) / 2, { steps:4 }); await p.mouse.move(f.x, f.y, { steps:4 }); await p.mouse.up(); await p.waitForTimeout(250);
  e = await estado();
  confere('área começando dentro do frame de fora: os dois cartões', [e.nomes, e.whole, e.frames], ['AB', null, ['ga', 'gb']]);
  // 6) Ctrl+G com os dois escolhidos: o grupo novo nasce dentro do frame de fora, com A e B
  await p.keyboard.press('Control+g'); await p.waitForTimeout(300);
  const g = await p.evaluate(() => { const ng = Object.keys(S.groups).find(k => !['ga', 'gb', 'gc'].includes(k)); return ng && { pai:S.groups[ng].parent, a:S.groups.ga.parent === ng, b:S.groups.gb.parent === ng, fora:S.groups.gc.parent || null, whole:wholeGroup() === ng }; });
  confere('Ctrl+G: grupo novo dentro do frame de fora com A e B', g && { pai:g.pai, a:g.a, b:g.b, fora:g.fora }, { pai:'gc', a:true, b:true, fora:null });
  confere('depois do Ctrl+G o grupo novo é a seleção', g && g.whole, true);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
