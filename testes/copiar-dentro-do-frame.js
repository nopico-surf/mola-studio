// Teste no navegador: copiar o que está dentro de um frame.
// Bug relatado: "selecionando o que tá dentro do frame e copiando, não copia". Dois furos:
//  - "Copiar" do botão direito usava document.execCommand('copy'), que o Chrome ignora sem texto selecionado (o evento nem dispara);
//  - sobra de seleção de texto só com espaço/quebra de linha (clique duplo fora do palco) fazia o Ctrl+C achar que era para copiar texto.
// Rodar: node testes/copiar-dentro-do-frame.js (conferido só no navegador do app; sem Playwright nesta máquina)
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
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
    const mk = (L, x, y) => { L.start = 0; L.end = S.duration; addLayer(L, { x, y }); return L; };
    const a = mk(mkShape({ kind:'rect', size:.2, mh:.2 }), .3, .4), t = mk(mkText('title', { text:'Dentro', size:90 }), .6, .4);
    T = 3; RT.picks = new Set([a.id, t.id]); RT.selected = a.id; flowToggle();
    changed({ layers:true, props:true }); selectBg(); RT.frameNo++; renderFrame(pctx, T, RS, false);
    window.__ids = { a:a.id, t:t.id };
  });
  const lerClip = () => p.evaluate(() => navigator.clipboard.readText());
  const limpa = () => p.evaluate(() => navigator.clipboard.writeText('nada'));
  const escolhe = (picks, sel) => p.evaluate(([picks, sel]) => { const I = window.__ids; RT.picks = new Set(picks.map(k => I[k])); RT.selected = I[sel]; renderLayers(); renderProps(); }, [picks, sel]);
  const nCopiadas = async () => { const t = await lerClip(); return t.startsWith('mola-camadas:') ? JSON.parse(t.slice('mola-camadas:'.length)).layers.length : 0; };

  // 1) Ctrl+C com o item de dentro escolhido sozinho e com os dois escolhidos
  for (const [nome, picks, sel, n] of [['texto sozinho', ['t'], 't', 1], ['forma sozinha', ['a'], 'a', 1], ['os dois', ['a', 't'], 'a', 2]]) {
    await escolhe(picks, sel); await limpa(); await p.keyboard.press('Control+C'); await p.waitForTimeout(150);
    confere(`Ctrl+C: ${nome}`, await nCopiadas(), n);
  }
  // 2) seleção de texto só com quebra de linha não atrapalha
  await escolhe(['t'], 't'); await limpa();
  await p.evaluate(() => { const d = document.createElement('div'); d.id = '__ws'; d.textContent = '\n'; d.style.cssText = 'position:fixed;left:-99px;white-space:pre'; document.body.appendChild(d); getSelection().selectAllChildren(d); });
  await p.keyboard.press('Control+C'); await p.waitForTimeout(150);
  confere('Ctrl+C com seleção de espaço sobrando', await nCopiadas(), 1);
  await p.evaluate(() => { getSelection().removeAllRanges(); document.getElementById('__ws').remove(); });
  // 3) "Copiar" do botão direito, no item de dentro do frame
  await escolhe(['t'], 't'); await limpa();
  await p.evaluate(() => { const L = S.layers.find(l => l.id === window.__ids.t); openMenu(new MouseEvent('contextmenu', { clientX:300, clientY:300 }), L); });
  await p.locator('.ctx button', { hasText:'Copiar' }).click(); await p.waitForTimeout(300);
  confere('botão direito > Copiar', await nCopiadas() > 0, true);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
