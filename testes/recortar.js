// Teste no navegador: Ctrl+X recorta a seleção (some do palco, vai para a área de transferência, Ctrl+V cola de volta).
// Bug relatado: "control + x não tá recortando". O Chrome não dispara o evento `cut` sem texto editável selecionado
// (o `copy` dispara), então o recorte passou a ser tratado no keydown.
// Rodar: node testes/recortar.js
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
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const n = () => p.evaluate(() => S.layers.length);
  await p.evaluate(() => {
    const t = mkText('title', { text:'Recorta', size:90 }); t.start = 0; t.end = S.duration; addLayer(t, { x:.5, y:.5 });
    RT.picks = new Set([t.id]); RT.selected = t.id; renderLayers(); renderProps(); document.activeElement && document.activeElement.blur();
  });
  confere('antes: fundo + texto', await n(), 2);
  await p.keyboard.press('Control+X'); await p.waitForTimeout(300);
  confere('Ctrl+X tira o texto', await n(), 1);
  confere('a área de transferência leva o elemento', (await p.evaluate(() => navigator.clipboard.readText())).startsWith('mola-camadas:'), true);
  await p.keyboard.press('Control+V'); await p.waitForTimeout(400);
  confere('Ctrl+V cola de volta', await n(), 2);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
