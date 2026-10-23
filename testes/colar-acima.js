// Teste no navegador: colar (Ctrl+V) entra logo acima da camada escolhida na lista de Camadas; sem seleção, acima de tudo.
// Pedido do usuário. Vale para camadas copiadas, imagem colada e SVG colado (antes imagem e SVG iam sempre para o topo).
// Rodar: node testes/colar-acima.js
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
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  // ordem da pilha, de baixo para cima, pelos nomes (o fundo fora)
  const ordem = () => p.evaluate(() => S.layers.filter(l => l.type !== 'bg').map(l => l.name));
  const pick = nome => p.evaluate(n => { const L = S.layers.find(l => l.name === n); RT.picks = new Set([L.id]); RT.selected = L.id; renderLayers(); renderProps(); document.activeElement && document.activeElement.blur(); }, nome);
  await p.evaluate(() => {
    for (const n of ['A', 'B', 'C']) { const t = mkText('title', { text:n, size:60 }); t.name = n; addLayer(t, { x:.5, y:.3 + .15 * 'ABC'.indexOf(n) }); }
  });
  confere('antes', await ordem(), ['A', 'B', 'C']);

  // camada copiada: colada logo acima da escolhida
  await pick('C'); await p.keyboard.press('Control+C'); await p.waitForTimeout(200);
  await p.evaluate(() => { const c = S.layers.find(l => l.name === 'C'); c.name = 'C0'; });
  await pick('A'); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  confere('colar com A escolhida: acima de A', await ordem(), ['A', 'C', 'B', 'C0']);

  // nada escolhido (Esc deixa o fundo): no topo
  await p.evaluate(() => { S.layers.forEach(l => { if (l.name === 'C') l.name = 'X'; }); });
  await p.evaluate(() => selectBg()); await p.waitForTimeout(100);
  await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  confere('sem seleção: no topo', await ordem(), ['A', 'X', 'B', 'C0', 'C']);

  // imagem colada (arquivo na área de transferência): acima da escolhida
  await pick('A');
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'Foto.png', { type:'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData:dt, bubbles:true }));
  });
  await p.waitForTimeout(800);
  confere('imagem colada: acima de A', await ordem(), ['A', 'Foto', 'X', 'B', 'C0', 'C']);

  // SVG colado como texto: acima da escolhida
  await pick('B');
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData:dt, bubbles:true }));
  });
  await p.waitForTimeout(1200);
  const o = await ordem();
  confere('SVG colado: logo acima de B', o.indexOf('B') + 1 === o.length - 3 && o.length === 7, true);

  // "Adicionar" continua no topo (só o colar mudou)
  await pick('A');
  await p.evaluate(() => { const t = mkText('title', { text:'Novo', size:60 }); t.name = 'Novo'; addLayer(t); });
  const o2 = await ordem();
  confere('Adicionar depois do colar: no topo', o2[o2.length - 1], 'Novo');

  // item de um grupo escolhido sozinho: a cópia entra no mesmo grupo, logo acima dele
  await p.evaluate(() => {
    const g = 'gtest'; const ls = ['A', 'X'].map(n => S.layers.find(l => l.name === n));
    S.layers = S.layers.filter(l => !ls.includes(l)); S.layers.push(...ls); ls.forEach(l => { l.grp = g; }); gmeta(g, true).name = 'Grupo';
    changed({ layers:true });
  });
  await pick('C0'); await p.keyboard.press('Control+C'); await p.waitForTimeout(200);
  await pick('A'); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const ls = S.layers.filter(l => l.type !== 'bg'); const i = ls.findIndex(l => l.name === 'A'); return { acima:ls[i + 1].name, grp:ls[i + 1].grp, x:ls[i + 2].name }; });
  confere('item do grupo: cópia logo acima dele, no grupo', r, { acima:'C0', grp:'gtest', x:'X' });

  await p.screenshot({ path:path.resolve(__dirname, 'colar-acima.png') });
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
