// Teste no navegador: Texto em curva (círculo, arco, onda e seguir uma forma).
// Pelo caminho real: botão Título, clique em "Círculo" no painel, campos digitáveis, clique no palco (só pega perto das letras),
// arrastar a bolinha de apoio e o texto que segue uma forma (desliza pelo caminho), "Por dentro", "Pôr o texto na forma",
// mover/redimensionar/apagar a forma, outro formato, duplicar texto + forma, desfazer, SVG e Converter em vetor.
// Rodar: node testes/texto-em-curva.js (prints em mola-testes/texto-em-curva-*.png na pasta temporária)
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(require('os').tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; T = 0; changed({ layers:true, props:true }); });
  // ponto do quadro (px do vídeo) -> tela
  const scr = v => p.evaluate(v => { const r = cv.getBoundingClientRect(), k = r.width / FW(); return { x:r.left + v.x * k, y:r.top + v.y * k }; }, v);
  const tab = async t => { const x = p.locator('#props button', { hasText:t }).first(); if (await x.count()) await x.click(); await p.waitForTimeout(150); };

  // 1. título novo e "Círculo" no painel
  await p.evaluate(() => [...document.querySelectorAll('#adds button.add')].find(x => (x.title || x.textContent).toLowerCase().includes('título')).click());
  await p.waitForTimeout(300);
  await p.evaluate(() => { const L = selL(); L.text = 'TEXTO EM VOLTA DO CÍRCULO'; L.in = 'fade'; RT.layout.clear(); T = 4; changed({ props:true }); });
  await tab('Conteúdo e estilo');
  await p.locator('#props button[aria-label="Círculo"]').click(); await p.waitForTimeout(300);
  const r1 = await p.evaluate(() => {
    const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), r = L.tpR * W(), gs = lay.lines[0].glyphs.filter(g => !g.space);
    const dist = gs.map(g => Math.hypot(g.tp.x, g.tp.y)), b = L._bounds;
    const labels = [...document.querySelectorAll('#props .field > label')].map(l => l.textContent.trim());
    return { tpath:L.tpath, r, dmin:Math.min(...dist), dmax:Math.max(...dist), oneLine:lay.nLines, b:{ w:b.w, h:b.h }, sym:Math.abs(lay.blockW - lay.blockH) < r * .2,
      top:gs[Math.floor(gs.length / 2)].tp.y < 0, labels, caixa:labels.includes('Caixa') };
  });
  ok(r1.tpath === 'circle', 'clique em Círculo liga o texto em curva', r1.tpath);
  ok(Math.abs(r1.dmin - r1.r) < 1 && Math.abs(r1.dmax - r1.r) < 1, 'as letras ficam com a base no círculo (raio)', r1);
  ok(r1.oneLine === 1, 'em curva a linha não quebra sozinha', r1.oneLine);
  ok(r1.top && r1.sym, 'o texto fica centrado em cima e a caixa é a do círculo inteiro', r1);
  ok(['Raio', 'Posição', 'Lado', 'Na linha', 'Distância'].every(t => r1.labels.includes(t)) && !r1.caixa, 'campos Raio, Posição, Lado, Na linha e Distância (sem "Caixa")', r1.labels);
  await p.screenshot({ path:path.join(outDir, 'texto-em-curva-circulo.png') });

  // 2. raio e posição pelos campos digitáveis
  const typeIn = async (lbl, v) => { const i = p.locator(`#props input.num[aria-label="${lbl} (valor)"]`); await i.click(); await i.fill(String(v)); await i.press('Enter'); await p.waitForTimeout(200); };
  await typeIn('Raio', 300);
  await typeIn('Posição', 90);
  const r2 = await p.evaluate(() => { const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), s0 = lay.lines[0].tpl.s0, q = tpPt(lay.tp.T, s0); return { R:Math.round(L.tpR * W()), off:L.tpOff, qx:q.x, qy:q.y }; });
  ok(r2.R === 300, 'Raio digitado em px', r2);
  ok(Math.abs(r2.off - .25) < 1e-3 && r2.qx > 290 && Math.abs(r2.qy) < 5, 'Posição 90° leva o apoio para a direita do círculo', r2);
  await typeIn('Posição', 0);

  // 3. clique no meio do círculo não pega o texto; numa letra pega
  const geo = await p.evaluate(() => { const L = selL(), b = L._bounds, lay = layoutText(L, caseTxt(L, L.text)), g = lay.lines[0].glyphs.find(x => !x.space && x.k > 3);
    return { id:L.id, c:{ x:b.x + b.w / 2, y:b.y + b.h / 2 }, g:{ x:b.x + b.w / 2 + g.tp.x - Math.sin(g.tp.a) * -lay.size * .35, y:b.y + b.h / 2 + g.tp.y + Math.cos(g.tp.a) * -lay.size * .35 } }; });
  let s = await scr(geo.c); await p.mouse.click(s.x, s.y); await p.waitForTimeout(200);
  const sel1 = await p.evaluate(() => (selL() || {}).type);
  ok(sel1 !== 'text', 'clique no meio do círculo vazio não escolhe o texto', sel1);
  s = await scr(geo.g); await p.mouse.click(s.x, s.y); await p.waitForTimeout(200);
  ok(await p.evaluate(id => RT.selected === id, geo.id), 'clique numa letra escolhe o texto');

  // 4. arrastar a bolinha de apoio desliza pelo círculo (o centro não sai do lugar)
  const h0 = await p.evaluate(() => { const L = selL(), hd = tpHandle(L); return { hd, c:boxC(L._bounds), off:L.tpOff ?? 0 }; });
  ok(!!h0.hd, 'a bolinha de apoio aparece com o texto escolhido', h0);
  if (h0.hd) {
    const a = await scr(h0.hd), c = await scr(h0.c), rr = Math.hypot(a.x - c.x, a.y - c.y);
    await p.mouse.move(a.x, a.y); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { const t = i / 10 * Math.PI / 2; await p.mouse.move(c.x + Math.sin(t) * rr, c.y - Math.cos(t) * rr); }
    await p.mouse.up(); await p.waitForTimeout(250);
    const h1 = await p.evaluate(() => { const L = selL(); return { off:L.tpOff, c:boxC(L._bounds) }; });
    ok(Math.abs(h1.off - .25) < .03, 'arrastar a bolinha um quarto de volta = 90°', h1);
    ok(Math.abs(h1.c.x - h0.c.x) < 1 && Math.abs(h1.c.y - h0.c.y) < 1, 'o centro do círculo não anda', { h0:h0.c, h1:h1.c });
    await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => (selL().tpOff ?? 0) < .01), 'desfazer volta a posição');
  }

  // 5. "Por dentro": anti-horário e o apoio vai para baixo (o texto de baixo do selo)
  await p.locator('#props button', { hasText:'Por dentro' }).click(); await p.waitForTimeout(250);
  const r5 = await p.evaluate(() => { const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), gs = lay.lines[0].glyphs.filter(g => !g.space), m = gs[Math.floor(gs.length / 2)];
    return { flip:L.tpFlip, off:L.tpOff, midY:m.tp.y, a:m.tp.a, ltr:gs[gs.length - 1].tp.x > gs[0].tp.x }; });
  ok(r5.flip && Math.abs(r5.off - .5) < 1e-6, 'Por dentro liga e o apoio vai para baixo', r5);
  ok(r5.midY > 0 && Math.abs(r5.a) < .2 && r5.ltr, 'embaixo o texto fica de pé, da esquerda para a direita', r5);
  await p.screenshot({ path:path.join(outDir, 'texto-em-curva-por-dentro.png') });

  // 6. arco e onda (caixa medida pelas letras, centrada)
  await p.locator('#props button[aria-label="Arco"]').click(); await p.waitForTimeout(250);
  const r6 = await p.evaluate(() => { const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), gs = lay.lines[0].glyphs.filter(g => !g.space);
    const xs = gs.map(g => g.tp.x), ys = gs.map(g => g.tp.y);
    return { k:L.tpath, ok:!!lay.tp, ends:ys[0] > ys[Math.floor(ys.length / 2)] && ys[ys.length - 1] > ys[Math.floor(ys.length / 2)], cx:(Math.min(...xs) + Math.max(...xs)) / 2, bw:lay.blockW }; });
  ok(r6.k === 'arc' && r6.ok && r6.ends, 'Arco: as pontas descem (arco para cima)', r6);
  ok(Math.abs(r6.cx) < r6.bw * .05, 'Arco: o texto fica no meio da caixa', r6);
  await typeIn('Curvatura', -40);
  const r6b = await p.evaluate(() => { const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), gs = lay.lines[0].glyphs.filter(g => !g.space), ys = gs.map(g => g.tp.y);
    return { bend:L.tpBend, smile:ys[0] < ys[Math.floor(ys.length / 2)] }; });
  ok(Math.abs(r6b.bend + .4) < 1e-6 && r6b.smile, 'Curvatura negativa = sorriso', r6b);
  await p.locator('#props button[aria-label="Onda"]').click(); await p.waitForTimeout(250);
  const r6c = await p.evaluate(() => { const L = selL(), lay = layoutText(L, caseTxt(L, L.text)), ys = lay.lines[0].glyphs.filter(g => !g.space).map(g => g.tp.y);
    return { k:L.tpath, spread:Math.max(...ys) - Math.min(...ys), amp:(L.tpAmp ?? .03) * W(), fin:[lay.blockW, lay.blockH].every(Number.isFinite) }; });
  ok(r6c.k === 'wave' && r6c.fin && r6c.spread > r6c.amp, 'Onda: as letras sobem e descem', r6c);
  await p.locator('#props button[aria-label="Reto"]').click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !selL().tpath && !layoutText(selL(), caseTxt(selL(), selL().text)).tp), 'Reto volta ao texto normal');

  // 7. seguir uma forma: escolher texto + forma e "Pôr o texto na forma"
  await p.evaluate(() => [...document.querySelectorAll('#adds button.add')].find(x => (x.title || x.textContent).toLowerCase().includes('forma')).click());
  await p.waitForTimeout(300);
  const ids = await p.evaluate(() => { const sh = selL(); sh.kind = 'rect'; sh.size = 500 / W(); sh.mh = 400 / W(); sh.x = .5; sh.y = .55; sh.start = 0; sh.end = S.duration; sh.radius = 0;
    const tx = S.layers.find(l => l.type === 'text'); tx.text = 'TEXTO EM VOLTA DA FORMA'; tx.size = 40; RT.layout.clear(); changed({ props:true }); return { sh:sh.id, tx:tx.id }; });
  // texto e forma escolhidos pela lista (Shift + clique)
  await p.evaluate(ids => { RT.picks = new Set([ids.tx, ids.sh]); RT.selected = ids.tx; renderLayers(); renderProps(); }, ids);
  await p.waitForTimeout(200);
  const btn = p.locator('#props button', { hasText:'Pôr o texto na forma' });
  ok(await btn.count() === 1, 'com texto + forma escolhidos aparece "Pôr o texto na forma"');
  await btn.click(); await p.waitForTimeout(300);
  const r7 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh);
    ensureBounds([tx, sh]); const lay = layoutText(tx, caseTxt(tx, tx.text)), m = lay.lines[0].glyphs.filter(g => !g.space)[5];
    return { ref:tx.tpRef, kind:tx.tpath, above:S.layers.indexOf(tx) > S.layers.indexOf(sh), cT:boxC(tx._bounds), cS:boxC(sh._bounds), topY:m.tp.y, pts:(tx.tpPts || []).length }; }, ids);
  ok(r7.ref === ids.sh && r7.kind === 'shape', 'o texto segue a forma', r7);
  ok(r7.above, 'o texto sobe para cima da forma (senão o preenchimento o cobria)', r7);
  ok(Math.abs(r7.cT.x - r7.cS.x) < 1 && Math.abs(r7.cT.y - r7.cS.y) < 1, 'o centro do texto é o da forma', r7);
  ok(Math.abs(r7.topY + 200) < 2, 'as letras ficam na borda de cima do retângulo', r7.topY);
  ok(r7.pts >= 8, 'guarda uma cópia do caminho', r7.pts);
  await p.screenshot({ path:path.join(outDir, 'texto-em-curva-forma.png') });

  // 8. mover e redimensionar a forma leva o texto junto
  const r8 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh);
    pushUndo(); sh.x = .4; sh.y = .5; sh.size = 700 / W(); changed({}); ensureBounds([tx, sh]);
    const lay = layoutText(tx, caseTxt(tx, tx.text)); return { cT:boxC(tx._bounds), cS:boxC(sh._bounds), half:lay.tp.T.box.x1 }; }, ids);
  ok(Math.abs(r8.cT.x - r8.cS.x) < 1 && Math.abs(r8.cT.y - r8.cS.y) < 1, 'mover a forma leva o texto', r8);
  ok(Math.abs(r8.half - 350) < 1, 'mudar o tamanho da forma muda o caminho do texto', r8.half);

  // 9. arrastar o texto que segue a forma desliza pelo caminho (a forma não sai do lugar)
  await p.evaluate(ids => { RT.picks = new Set([ids.tx]); RT.selected = ids.tx; renderLayers(); renderProps(); }, ids);
  const g9 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh), b = tx._bounds, lay = layoutText(tx, caseTxt(tx, tx.text)), g = lay.lines[0].glyphs.filter(x => !x.space)[8];
    return { p:{ x:b.x + b.w / 2 + g.tp.x, y:b.y + b.h / 2 + g.tp.y - 12 }, sx:sh.x, sy:sh.y, off:tx.tpOff ?? 0 }; }, ids);
  s = await scr(g9.p); await p.mouse.move(s.x, s.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(s.x + i * 12, s.y);
  await p.mouse.up(); await p.waitForTimeout(250);
  const r9 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh); return { off:tx.tpOff, sx:sh.x, sy:sh.y, sel:RT.selected === ids.tx }; }, ids);
  ok(r9.sel && r9.off > .02 && r9.off < .2, 'arrastar o texto desliza pelo caminho', r9);
  ok(r9.sx === g9.sx && r9.sy === g9.sy, 'a forma fica parada', r9);

  // 10. outro formato: o texto continua na forma; o texto em círculo não é empurrado pela margem
  await p.evaluate(() => setFormat('1x1')); await p.waitForTimeout(300);
  const r10 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh); ensureBounds([tx, sh]); return { cT:boxC(tx._bounds), cS:boxC(sh._bounds) }; }, ids);
  ok(Math.abs(r10.cT.x - r10.cS.x) < 1 && Math.abs(r10.cT.y - r10.cS.y) < 1, 'no 1:1 o texto continua na forma', r10);
  await p.evaluate(() => setFormat('4x5')); await p.waitForTimeout(300);

  // 11. duplicar texto + forma: a cópia do texto segue a cópia da forma
  const r11 = await p.evaluate(ids => { RT.picks = new Set([ids.tx, ids.sh]); RT.selected = ids.sh; duplicateLayer(selL());
    const tx2 = S.layers.filter(l => l.type === 'text' && l.id !== ids.tx).pop(), sh2 = S.layers.filter(l => l.type === 'shape' && l.id !== ids.sh).pop();
    return { has:!!tx2 && !!sh2, ref:tx2 && tx2.tpRef, sh2:sh2 && sh2.id }; }, ids).catch(e => ({ err:e.message }));
  ok(r11.has && r11.ref === r11.sh2, 'duplicar texto + forma: a cópia do texto segue a cópia da forma', r11);

  // 12. apagar a forma: o texto fica onde estava, com a cópia do caminho
  const r12 = await p.evaluate(ids => { const tx = S.layers.find(l => l.id === ids.tx), sh = S.layers.find(l => l.id === ids.sh); ensureBounds([tx]); const b0 = { ...tx._bounds };
    deleteLayer(sh); ensureBounds([tx]); const b1 = tx._bounds, lay = layoutText(tx, caseTxt(tx, tx.text));
    return { ref:tx.tpRef || null, curve:!!lay.tp, dx:Math.abs(b1.x - b0.x), dy:Math.abs(b1.y - b0.y), dw:Math.abs(b1.w - b0.w) }; }, ids);
  ok(!r12.ref && r12.curve && r12.dx < 1 && r12.dy < 1 && r12.dw < 1, 'apagar a forma: o texto fica no mesmo caminho e lugar', r12);
  await p.keyboard.press('Escape');
  await p.evaluate(() => undo()); await p.waitForTimeout(200);
  ok(await p.evaluate(ids => !!S.layers.find(l => l.id === ids.sh) && S.layers.find(l => l.id === ids.tx).tpRef === ids.sh, ids), 'desfazer traz a forma e a ligação de volta');

  // 13. fundo atrás do texto e duas linhas no círculo; desenho determinístico sem erro
  const r13 = await p.evaluate(() => {
    const L = mkText('title', { text:'linha um\nlinha dois', size:50, x:.5, y:.3, tpath:'circle', tpR:.15, tbg:true, hl:'#E0574F', hlRad:.3 }); S.layers.push(L); changed({});
    const lay = layoutText(L, caseTxt(L, L.text)), d0 = lay.lines[0].tpl.dn, d1 = lay.lines[1].tpl.dn, band = tpBandPts(lay, lay.lines[0], textBg(L));
    const c = document.createElement('canvas'); c.width = 270; c.height = 338; const x = c.getContext('2d');
    renderFrame(x, 4, .25, true); const a = x.getImageData(0, 0, 270, 338).data.join(); renderFrame(x, 4, .25, true); const b2 = x.getImageData(0, 0, 270, 338).data.join();
    return { lines:lay.nLines, inner:d1 > d0, band:band.length > 20 && band.every(q => q.every(Number.isFinite)), same:a === b2 };
  });
  ok(r13.lines === 2 && r13.inner, 'segunda linha fica por dentro, paralela ao círculo', r13);
  ok(r13.band, 'fundo atrás do texto vira uma faixa no caminho', r13);
  ok(r13.same, 'o mesmo quadro sai igual (determinístico)');

  // 14. SVG: as letras saem giradas no caminho
  const r14 = await p.evaluate(async () => { try { const s = await buildSvg(S.layers.filter(l => l.type === 'text')); return { ok:true, n:s.length, curve:/<path d="M/.test(s) || /rotate\(/.test(s) }; } catch (e) { return { ok:false, e:e.message }; } });
  ok(r14.ok && r14.curve, 'Exportar SVG sai com o texto em curva', r14);
  await p.screenshot({ path:path.join(outDir, 'texto-em-curva-fim.png') });

  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
