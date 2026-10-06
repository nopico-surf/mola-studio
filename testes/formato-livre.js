// Teste no navegador: formato livre (pedido do usuário: palco de qualquer tamanho, fora dos padrões do Instagram, que por enquanto
// não se liga aos outros: nada se reorganiza). Botão "Livre", largura × altura no topo (par, com limites, desfazer), arrastar no
// livre não mexe no principal, o principal não reorganiza o livre e vice-versa, nome do arquivo exportado, padrão de arquivo novo.
// Rodar: node testes/formato-livre.js   (SHOTS=pasta salva prints)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = process.env.SHOTS;
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
const near = (a, b, e = 1e-4) => Math.abs(a - b) < e;

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const fresh = () => p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow; delete S.custom; delete S.base; S.format = '4x5'; RT.layout.clear(); renderAll(); fitStage(); });
  const livre = p.locator('#fmt button', { hasText:'Livre' });
  const setDim = async (sel, v) => { await p.fill(sel, String(v)); await p.press(sel, 'Enter'); await p.waitForTimeout(80); };
  // arrasta o elemento pelo centro dele na tela, com o mouse de verdade
  const drag = async (id, dx, dy) => {
    const c = await p.evaluate(id => { const L = S.layers.find(l => l.id === id), B = L._bounds, rc = cv.getBoundingClientRect();
      return { x:rc.left + (B.x + B.w / 2) / FW() * rc.width, y:rc.top + (B.y + B.h / 2) / H() * rc.height }; }, id);
    await p.mouse.move(c.x, c.y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(c.x + dx * i / 8, c.y + dy * i / 8); await p.waitForTimeout(16); }
    await p.mouse.up(); await p.waitForTimeout(120);
  };

  // 1) arquivo vazio: Livre vira o principal e o tamanho é o digitado
  await fresh();
  conf(await livre.count() === 1, 'botão "Livre" na barra de formatos');
  conf(await p.locator('#cdims').isHidden(), 'largura × altura escondidas fora do livre');
  await livre.click(); await p.waitForTimeout(150);
  conf(await p.evaluate(() => S.format === 'custom' && W() === 1920 && H() === 1080), 'Livre abre em 1920×1080');
  conf(await p.locator('#cdims').isVisible(), 'largura × altura aparecem no livre');
  await setDim('#cW', 1200); await setDim('#cH', 801);
  conf(await p.evaluate(() => W() === 1200 && H() === 802), 'largura 1200 e altura ímpar 801 vira 802 (par)');
  conf(await p.evaluate(() => { const rc = cv.getBoundingClientRect(); return Math.abs(rc.width / rc.height - 1200 / 802) < .02; }), 'palco na proporção nova');
  await setDim('#cW', 99999);
  conf(await p.evaluate(() => W() === 4096), 'largura acima do limite fica em 4096');
  await p.keyboard.press('Escape'); await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(120);
  conf(await p.evaluate(() => W() === 1200 && H() === 802), 'Ctrl+Z volta o tamanho');
  conf(await p.evaluate(() => $('#cW').value === '1200'), 'campo acompanha o desfazer');
  conf(await p.evaluate(() => outName().endsWith('-1200x802')), 'nome do arquivo exportado com 1200x802');

  // título no livre (principal): mexer grava em x/y; no 1:1 nada se reorganiza
  const id1 = await p.evaluate(() => { const L = addLayer(ADD_KINDS.find(k => k.id === 'title').mk(S.brand, S.brand.fonts)); T = Math.max(T, L.start + 2); renderAll(); return L.id; });
  conf(await p.evaluate(() => baseFmt() === 'custom'), 'arquivo começado no livre: ele é o principal');
  await p.waitForTimeout(200);
  const x0 = await p.evaluate(id => S.layers.find(l => l.id === id).x, id1);
  await drag(id1, 60, 0);
  const x1 = await p.evaluate(id => S.layers.find(l => l.id === id).x, id1);
  conf(x1 > x0 + .01, 'arrastar no livre (principal) muda x');
  await p.locator('#fmt button', { hasText:'1:1' }).click(); await p.waitForTimeout(150);
  conf(await p.evaluate(id => { const L = S.layers.find(l => l.id === id), q = posOf(L); return Math.abs(q.x - L.x) < 1e-4 && Math.abs(q.y - L.y) < 1e-4; }, id1), '1:1 com o livre de principal: mesma posição, sem reorganizar');
  await p.locator('#fmt button', { hasText:'1:1' }).dblclick(); await p.waitForTimeout(150);
  conf(await p.evaluate(() => baseFmt() === 'custom'), 'clique duplo no 1:1 não troca o principal livre');
  await p.waitForTimeout(150);
  await drag(id1, 0, 40);
  conf(await p.evaluate(([id, x]) => { const L = S.layers.find(l => l.id === id); return Math.abs(L.x - x) < 1e-4 && L.fpos && L.fpos['1x1']; }, [id1, x1]), 'arrastar no 1:1 fica só no 1:1');
  conf(!(await p.locator('#stageHint').textContent()).includes('presa'), 'pílula não avisa "posição presa" fora do livre ligado');

  // 2) arquivo no 4:5 com conteúdo: abrir o livre não reorganiza e mexer no livre não muda o 4:5
  await fresh();
  const ids = await p.evaluate(() => { const a = addLayer(ADD_KINDS.find(k => k.id === 'title').mk(S.brand, S.brand.fonts)); const c = addLayer(ADD_KINDS.find(k => k.id === 'sub').mk(S.brand, S.brand.fonts));
    T = Math.max(a.start, c.start) + 2; renderAll(); return [a.id, c.id]; });
  const before = await p.evaluate(ids => ids.map(id => { const L = S.layers.find(l => l.id === id); return [L.x, L.y]; }), ids);
  await livre.click(); await p.waitForTimeout(200);
  conf(await p.evaluate(() => baseFmt() === '4x5' && S.format === 'custom'), '4:5 continua o principal ao abrir o livre');
  conf(await p.evaluate(ids => ids.every(id => { const L = S.layers.find(l => l.id === id), q = posOf(L); return Math.abs(q.x - L.x) < 1e-4 && Math.abs(q.y - L.y) < 1e-4; }), ids), 'livre: mesma posição relativa do 4:5, sem reorganizar');
  if (shots) await p.screenshot({ path:path.join(shots, 'livre.png') });
  await drag(ids[0], -80, 30);
  const after = await p.evaluate(ids => ids.map(id => { const L = S.layers.find(l => l.id === id); return [L.x, L.y]; }), ids);
  conf(after.every((q, i) => near(q[0], before[i][0]) && near(q[1], before[i][1])), 'arrastar no livre não muda o 4:5');
  conf(await p.evaluate(id => !!(S.layers.find(l => l.id === id).fpos || {}).custom, ids[0]), 'posição do livre fica só nele (fpos.custom)');
  conf(!(await p.locator('#stageHint').textContent()).includes('presa'), 'livre: pílula não avisa "posição presa"');
  await p.evaluate(id => { select(id); renderProps(); }, ids[0]);
  conf(await p.locator('#props .posnote button', { hasText:'Voltar à do 4:5' }).count() === 1, 'painel oferece "Voltar à do 4:5"');
  await p.locator('#fmt button', { hasText:'4:5' }).click(); await p.waitForTimeout(150);
  conf(await p.evaluate(ids => ids.every(id => { const L = S.layers.find(l => l.id === id), q = posOf(L); return Math.abs(q.x - L.x) < 1e-4; }), ids), 'de volta ao 4:5, tudo onde estava');

  // 3) padrão de arquivo novo não leva o livre
  conf(await p.evaluate(() => { S.base = 'custom'; const f = compFileNow('file').format; S.base = '4x5'; return f !== 'custom'; }), 'padrão de arquivo novo não guarda o livre');

  // 4) render no tamanho do livre (o que a exportação usa)
  conf(await p.evaluate(() => { setFormat('custom'); const c = document.createElement('canvas'); c.width = W(); c.height = H(); renderFrame(c.getContext('2d'), T, 1, true); return c.width === W(); }), 'quadro desenha no tamanho do livre sem erro');

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
