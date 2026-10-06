// Teste no navegador: cache do palco (mesmos pixels que o desenho completo), fundo atrás do texto, botão com entre letras,
// frame pintado (Caixa), arrastar de volta o que saiu do palco, elemento novo que não some com os outros e renomear Meus elementos.
// Rodar: node testes/edicao-e-cache.js   (precisa do playwright; no Claude Code na nuvem já vem instalado)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok || info == null ? '' : `\n      ${JSON.stringify(info)}`)); };

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);

  // 1) cache do palco: parado, arrastando uma forma do meio e tocando, contra o desenho sem cache
  const cache = await p.evaluate(async () => {
    const fl = document.createElement('canvas').getContext('2d', { willReadFrequently:true }); fl.canvas.width = fl.canvas.height = 1;
    const snap = () => pctx.getImageData(0, 0, cvr.width, cvr.height).data;
    const maxd = (a, c) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - c[i])); return m; };
    const bg = S.layers.find(l => l.type === 'bg'); bg.mode = 'solid'; bg.grain = 0;
    const sh = [];
    for (let i = 0; i < 12; i++) { const L = mkComp('shape'); Object.assign(L, { mode:'solid', c1:i % 2 ? '#ffffff66' : '#00000055', size:.3, mh:.2, x:.2 + (i % 4) * .2, y:.15 + Math.floor(i / 4) * .25, in:'cut', idle:'none', start:0, end:S.duration }); if (i % 2) L.lblur = 12; else L.bblur = 20; S.layers.push(L); sh.push(L); }
    RT.layout.clear(); pause(); T = 2; setView(viewFull());
    const r = {};
    const both = (f) => { FC.on = false; f(); renderFrame(pctx, T, RS, false); renderFrame(pctx, T, RS, false); const a = snap(); FC.on = true; FC.pre = FC.suf = null; FC.sigs = null; renderFrame(pctx, T, RS, false); renderFrame(pctx, T, RS, false); return maxd(a, snap()); };
    r.parado = both(() => {});
    const m = sh[5], x0 = m.x; FC.on = true; renderFrame(pctx, T, RS, false); m.x = x0 + .05; renderFrame(pctx, T, RS, false); const a1 = snap(); FC.on = false; renderFrame(pctx, T, RS, false); renderFrame(pctx, T, RS, false); r.arrastando = maxd(a1, snap()); m.x = x0;
    FC.on = true; T = 2.1; renderFrame(pctx, T, RS, false); T = 2.2; renderFrame(pctx, T, RS, false); const a2 = snap(); FC.on = false; renderFrame(pctx, T, RS, false); renderFrame(pctx, T, RS, false); r.tocando = maxd(a2, snap());
    FC.on = true; return r;
  });
  confere('cache do palco: parado igual ao desenho completo', cache.parado <= 3, cache);
  confere('cache do palco: arrastando igual ao desenho completo', cache.arrastando <= 3, cache);
  confere('cache do palco: tocando igual ao desenho completo', cache.tocando <= 3, cache);

  // 2) fundo atrás do texto conta no tamanho; botão com entre letras fica mais largo
  const tx = await p.evaluate(() => {
    const L = mkComp('hl'); const w0 = (() => { L.tbg = false; RT.layout.clear(); return layoutText(L, L.text).blockW; })();
    L.tbg = true; L.hlPadX = .5; RT.layout.clear(); const w1 = layoutText(L, L.text).blockW;
    const c = mkComp('cta'), g0 = blockGeom(c).w; c.ls = .3; RT.layout.clear(); const g1 = blockGeom(c).w;
    return { w0, w1, pad:L.size, g0, g1 };
  });
  confere('fundo atrás do texto alarga o bloco nos dois lados', Math.abs(tx.w1 - tx.w0 - tx.pad) < 2, tx);
  confere('botão: entre letras alarga o botão', tx.g1 > tx.g0 + 10, tx);

  // 3) Caixa: frame com preenchimento desenhado e clique no fundo escolhe o frame
  const box = await p.evaluate(async () => {
    S.layers = S.layers.filter(l => l.type !== 'shape'); selectBg(); RT.layout.clear();
    const L = addBox(); selectBg(); T = L.start + 2; needs = true; await new Promise(r => setTimeout(r, 300));
    const fr = frameRect(L.grp); return { paint:gPaintOn(L.grp), fr, hit:!!fr && frameHit({ x:fr.x + 6, y:fr.y + 6 }) === L, gid:L.grp };
  });
  confere('Caixa: frame pintado com caixa do layout', box.paint && box.fr && box.fr.w > 50, box);
  confere('Caixa: o fundo do frame pega o clique', box.hit, box);

  // 4) forma escolhida que saiu inteira do quadro: arrastar na mesa traz de volta
  const fora = await p.evaluate(async () => {
    selectBg(); const s = addLayer(mkComp('shape')); s.in = 'cut'; setPos(s, 1.5, .5); select(s.id); needs = true; await new Promise(r => setTimeout(r, 300));
    const b = s._bounds, r = cv.getBoundingClientRect(), sb = document.getElementById('stageBox').getBoundingClientRect();
    const x = Math.min(sb.right - 8, r.left + (b.x + 20) / FW() * r.width), y = r.top + (b.y + b.h / 2) / H() * r.height;
    return { x, y, to:{ x:r.left + r.width / 2, y:r.top + r.height / 2 }, id:s.id, x0:s.x, out:x > r.right };
  });
  if (fora.out) {
    await p.mouse.move(fora.x, fora.y); await p.mouse.down(); await p.mouse.move(fora.to.x, fora.to.y, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(200);
    const x1 = await p.evaluate(id => S.layers.find(l => l.id === id).x, fora.id);
    confere('arrastar de fora do quadro traz a forma de volta', x1 < fora.x0 - .3, { antes:fora.x0, depois:x1 });
  } else confere('arrastar de fora do quadro (a forma ficou na mesa à vista)', false, fora);

  // 5) elemento novo não faz quem está na tela sumir (a agulha não vai para depois da saída dele)
  const vis = await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); RT.layout.clear(); selectBg(); pause();
    const a = addLayer(mkComp('title')); a.start = 3; a.end = 4.2; T = 3.6; RT.userSeek = false;
    const c = addLayer(mkComp('sub')); return { aOn:!!phase(a, T), T, cStart:c.start };
  });
  confere('adicionar não some com quem estava na tela', vis.aOn, vis);

  // 6) Meus elementos: renomear pelo botão direito, sem adicionar
  await p.evaluate(async () => { const L = S.layers.find(l => l.type === 'text'); select(L.id); await saveElement(); });
  await p.waitForTimeout(200);
  const n0 = await p.evaluate(() => S.layers.length);
  await p.click('#adds .add.my', { button:'right' }); await p.keyboard.press('Control+A'); await p.keyboard.type('Nome novo'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const ren = await p.evaluate(async () => ({ nome:MY_ELS[0].name, salvo:((await DB.get('elements')) || [])[0].name, n:S.layers.length }));
  confere('Meus elementos: renomeia e guarda', ren.nome === 'Nome novo' && ren.salvo === 'Nome novo', ren);
  confere('Meus elementos: renomear não adiciona', ren.n === n0, { antes:n0, depois:ren.n });

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
