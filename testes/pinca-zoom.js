// Teste no navegador: pinça no palco (celular/tablet, pedido do usuário): dois dedos afastando = zoom in, aproximando = zoom out,
// o ponto médio leva o quadro junto; o segundo dedo cancela o arrasto que o primeiro começou (nada se move, a seleção não cai);
// mouse continua como era. Usa toque de verdade (CDP Input.dispatchTouchEvent).
// Rodar: node testes/pinca-zoom.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };

(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport:{ width:1100, height:800 }, hasTouch:true });
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints:pts.map((q, i) => ({ x:q[0], y:q[1], id:i + 1 })) });
  const stage = await p.evaluate(() => { const r = $('#stageScroll').getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2, top:r.top + 12, left:r.left + 12 }; });
  const zoom = () => p.evaluate(() => RT.zoom || 1);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); renderAll(); zoomFit(); });
  const id = await p.evaluate(() => { const L = addLayer(ADD_KINDS.find(k => k.id === 'title').mk(S.brand, S.brand.fonts)); T = Math.max(T, L.start + 2); renderAll(); return L.id; });
  await p.waitForTimeout(200);

  // 1) afastar dois dedos = zoom in
  const cx = stage.x, cy = stage.y;
  await touch('touchStart', [[cx - 40, cy]]); await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 40 - i * 6, cy], [cx + 40 + i * 6, cy]]); await p.waitForTimeout(16); }
  await touch('touchEnd', []); await p.waitForTimeout(300);
  const z1 = await zoom();
  conf(z1 > 2 && z1 < 3.2, 'afastar os dedos aproxima (zoom ' + z1.toFixed(2) + ')');

  // 2) aproximar = zoom out
  await touch('touchStart', [[cx - 120, cy]]); await touch('touchStart', [[cx - 120, cy], [cx + 120, cy]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 120 + i * 9, cy], [cx + 120 - i * 9, cy]]); await p.waitForTimeout(16); }
  await touch('touchEnd', []); await p.waitForTimeout(300);
  const z2 = await zoom();
  conf(z2 < z1 * .6, 'aproximar os dedos afasta (zoom ' + z2.toFixed(2) + ')');

  // 3) ponto médio andando leva o quadro junto
  await p.evaluate(() => { setZoom(2.5); });
  await p.waitForTimeout(200);
  const pos0 = await p.evaluate(() => { const r = cv.getBoundingClientRect(); return { x:r.left, y:r.top }; });
  await touch('touchStart', [[cx - 40, cy]]); await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 40 + i * 5, cy + i * 4], [cx + 40 + i * 5, cy + i * 4]]); await p.waitForTimeout(16); }
  await touch('touchEnd', []); await p.waitForTimeout(200);
  const pos1 = await p.evaluate(() => { const r = cv.getBoundingClientRect(); return { x:r.left, y:r.top }; });
  conf(Math.abs((pos1.x - pos0.x) - 40) < 14 && Math.abs((pos1.y - pos0.y) - 32) < 14, 'dois dedos andando levam o quadro (' + Math.round(pos1.x - pos0.x) + ', ' + Math.round(pos1.y - pos0.y) + ')');
  conf(Math.abs(await zoom() - 2.5) < .05, 'sem mudar a distância o zoom não muda');

  // 4) primeiro dedo em cima do elemento arrasta; o segundo vira pinça e o elemento não anda nem a seleção cai
  await p.evaluate(id => { zoomFit(); select(id); }, id);
  await p.waitForTimeout(300);
  const el = await p.evaluate(id => { const L = S.layers.find(l => l.id === id), B = L._bounds, rc = cv.getBoundingClientRect(); const o = posOf(L);
    return { x:rc.left + (B.x + B.w / 2) / FW() * rc.width, y:rc.top + (B.y + B.h / 2) / H() * rc.height, px:o.x, py:o.y }; }, id);
  await touch('touchStart', [[el.x, el.y]]);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', [[el.x + i * 6, el.y + i * 3]]); await p.waitForTimeout(16); }
  await touch('touchStart', [[el.x + 24, el.y + 12], [el.x + 120, el.y + 12]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[el.x + 24 - i * 8, el.y + 12], [el.x + 120 + i * 8, el.y + 12]]); await p.waitForTimeout(16); }
  await touch('touchEnd', []); await p.waitForTimeout(300);
  const dep = await p.evaluate(id => { const o = posOf(S.layers.find(l => l.id === id)); return { x:o.x, y:o.y, sel:selL() && selL().id, drag:!!RT.drag, z:RT.zoom || 1 }; }, id);
  conf(Math.abs(dep.x - el.px) < 1e-4 && Math.abs(dep.y - el.py) < 1e-4, 'o elemento voltou ao lugar (pinça cancela o arrasto)');
  conf(dep.sel === id && !dep.drag, 'continua selecionado e sem arrasto pendurado');
  conf(dep.z > 1.4, 'e a pinça deu zoom (' + dep.z.toFixed(2) + ')');

  // 5) dedo sozinho no vazio ainda seleciona por área / solta a seleção (um toque no vazio)
  await p.evaluate(() => zoomFit()); await p.waitForTimeout(250);
  await touch('touchStart', [[stage.x, stage.top]]); await touch('touchEnd', []); await p.waitForTimeout(150);
  conf(await p.evaluate(id => selL() && selL().type === 'bg', id), 'um toque no vazio continua soltando a seleção');

  // 6) pinça no vazio não solta a seleção
  await p.evaluate(id => select(id), id); await p.waitForTimeout(150);
  await touch('touchStart', [[stage.left, stage.top]]); await touch('touchStart', [[stage.left, stage.top], [stage.left + 60, stage.top]]);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [[stage.left - i * 2, stage.top], [stage.left + 60 + i * 6, stage.top]]); await p.waitForTimeout(16); }
  await touch('touchEnd', []); await p.waitForTimeout(250);
  conf(await p.evaluate(id => selL() && selL().id === id, id), 'pinça começada no vazio não tira a seleção');

  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
