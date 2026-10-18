// Teste no navegador: dois frames com texto dentro escolhidos (clique duplo no A, Shift + clique no B) continuam com a aba Animação
// do frame (antes virava a do texto de dentro), e escolher um preset ali vale para os dois frames, sem mexer nos textos.
// Rodar: node testes/animacao-de-varios-frames.js
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
    S.groups.ga = { name:'Cartão A', parent:'gc', flow:f(), fill:'#a8f0c6', in:'fade' }; S.groups.gb = { name:'Cartão B', parent:'gc', flow:f(), fill:'#a8f0c6', in:'fade' };
    S.groups.gc = { name:'Fora', open:true, flow:{ dir:'v', gap:30, auto:false, align:'center', pin:'start' }, fill:'#0a9060' };
    T = 3; RT.selected = null; RT.picks = new Set(); propTab = 'anim'; changed({ layers:true });
  });
  await p.waitForTimeout(800);
  const ponto = g => p.evaluate(g => {
    const R = frameRect(g), r = cv.getBoundingClientRect(); if (!R) return null;
    for (let y = R.y + 40; y < R.y + R.h; y += 5) for (let x = R.x + 40; x < R.x + R.w; x += 5) {
      const q = { x, y }; if (!hitTest(q) && !handleAt(q) && (frameHitG(q) || {}).g === g) return { x:r.left + x / FW() * r.width, y:r.top + y / H() * r.height };
    }
    return null;
  }, g);
  const painel = () => p.evaluate(() => ({
    chip:document.querySelector('#props .type-chip')?.textContent,
    entrada:[...document.querySelectorAll('#props h3')].some(h => /Entrada do grupo/.test(h.textContent)),
  }));
  const pa = await ponto('ga'), pb = await ponto('gb');
  confere('acha o fundo dos dois cartões', !!(pa && pb), true);
  await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(150);
  await p.mouse.dblclick(pa.x, pa.y); await p.waitForTimeout(250);
  confere('cartão A: aba Animação do frame', await painel(), { chip:'Grupo', entrada:true });
  await p.keyboard.down('Shift'); await p.mouse.click(pb.x, pb.y); await p.keyboard.up('Shift'); await p.waitForTimeout(700);
  confere('A + B: continua a Animação de frame', await painel(), { chip:'Frames', entrada:true });
  // escolher um preset de entrada vale para os dois frames, e os textos ficam como estavam
  const antes = await p.evaluate(() => S.layers.filter(l => l.grp === 'ga' || l.grp === 'gb').map(l => l.in));
  await p.evaluate(() => { const c = [...document.querySelectorAll('#props .chip[data-key]')].find(c => c.dataset.key === 'pop' || c.dataset.key === 'up'); RT.k = c.dataset.key; c.click(); });
  const r = await p.evaluate(() => ({ a:S.groups.ga.in === RT.k, b:S.groups.gb.in === RT.k, fora:S.groups.gc.in === RT.k, textos:S.layers.filter(l => l.grp === 'ga' || l.grp === 'gb').map(l => l.in) }));
  confere('preset vale para os dois frames', [r.a, r.b, r.fora], [true, true, false]);
  confere('textos de dentro não mudam', r.textos, antes);
  confere('painel continua o de frames', await painel(), { chip:'Frames', entrada:true });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
