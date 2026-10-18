// Teste no navegador: passar o mouse num preset mostra a animação no palco (troca o preset e toca o trecho) e, ao sair,
// tudo volta (preset, duração, agulha), sem passo no desfazer nem gravação no arquivo; clicar durante a prévia escolhe de verdade.
// Rodar: node testes/previa-no-mouse.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  const id = await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'sub'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); propTab = 'anim'; renderProps(); return L.id; });
  await p.waitForTimeout(900); // deixa o autosave da inserção passar
  const st = () => p.evaluate(id => { const L = S.layers.find(l => l.id === id); return { on:!!PV.on, inp:L.in, dur:L.inDur, playing, T:+T.toFixed(3), undo:undoStack.length }; }, id);
  const before = await st();
  // abre a categoria Revelação e acha um preset que não é o atual
  await p.evaluate(() => { const c = [...document.querySelectorAll('#props .chip-cat')].find(x => x.textContent.startsWith('Revelação') && x.classList.contains('shut')); if (c) c.click(); });
  await p.waitForTimeout(200);
  const chip = p.locator('#props .chip[data-key="blinds"]').first();
  await chip.scrollIntoViewIfNeeded();

  await chip.hover(); await p.waitForTimeout(500);
  const mid = await st();
  conf(mid.on && mid.inp === 'blinds' && mid.playing, 'mouse em cima: o preset entra na prévia e toca ' + JSON.stringify(mid));
  conf(mid.undo === before.undo, 'prévia não cria passo no desfazer');
  // o autosave não grava o preset da prévia
  await p.evaluate(() => autosave()); await p.waitForTimeout(1100);
  const saved = await p.evaluate(async id => { const s = JSON.parse(await DB.get('file:' + FILES.id)); return s.layers.find(l => l.id === id).in; }, id);
  conf(saved === before.inp, `arquivo gravado com o preset de verdade (${saved})`);

  await p.mouse.move(700, 300); await p.waitForTimeout(400);
  const after = await st();
  conf(!after.on && after.inp === before.inp && after.dur === before.dur && !after.playing && Math.abs(after.T - before.T) < 1e-3,
    'mouse saiu: preset, duração e agulha voltam ' + JSON.stringify(after));

  // clicar durante a prévia escolhe de verdade, e o desfazer guarda o de antes
  await chip.hover(); await p.waitForTimeout(500);
  await chip.click(); await p.waitForTimeout(300);
  const pick = await st();
  conf(!pick.on && pick.inp === 'blinds' && pick.undo === before.undo + 1, 'clique na prévia escolhe o preset ' + JSON.stringify(pick));
  await p.keyboard.press('Control+z'); await p.mouse.move(700, 300); await p.waitForTimeout(400);
  const un = await p.evaluate(id => S.layers.find(l => l.id === id).in, id);
  conf(un === before.inp, `desfazer volta ao preset de antes da prévia (${un})`);

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
