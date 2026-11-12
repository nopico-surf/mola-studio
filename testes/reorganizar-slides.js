// Teste no navegador: reorganizar e apagar slides do carrossel (pedido do usuário: "reorganizar os slides do carrossel e deletar um específico").
// Caminho real: arrastar o nome do slide no palco, botão direito no nome (menu) e Delete com o slide escolhido pelo nome.
// Cada slide leva as camadas dele (grupo inteiro), o nome, a duração e a posição presa nos outros formatos; Ctrl+Z desfaz.
// Rodar: node testes/reorganizar-slides.js
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
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  // 3 slides: A no 1, B (grupo de 2 textos, um deles com posição presa no 9:16) no 2, C no 3; nomes e durações diferentes
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.slides = 3; S.duration = 8; S.sdur = [4, 8, 0]; S.snames = ['Capa', null, 'Fim'];
    const t = (name, x) => { const L = mkText('title', { text:name }); L.name = name; L.x = x; L.y = .5; L.start = 0; L.end = null; S.layers.push(L); return L; };
    t('A', .5); const b1 = t('B1', 1.4), b2 = t('B2', 1.6); t('C', 2.5);
    b1.grp = b2.grp = 'gB'; S.groups = { ...(S.groups || {}), gB:{ name:'B', open:true } };
    b2.fpos = { '9x16':{ x:1.7, y:.4 } };
    RT.picks = null; selectBg(); RT.layout.clear(); changed({ props:true, layers:true }); renderFormats(); zoomFit();
  });
  await p.waitForTimeout(400);
  const estado = () => p.evaluate(() => ({
    n:slides(), nomes:[...Array(slides()).keys()].map(slideName), dur:[...Array(slides()).keys()].map(slideDur),
    ond:Object.fromEntries(S.layers.filter(l => l.type === 'text').map(l => [l.name, slideOfX(l.x)])),
    grupo:S.layers.filter(l => l.grp === 'gB').length, preso:(S.layers.find(l => l.name === 'B2')?.fpos || {})['9x16']?.x,
  }));
  // ponto do nome do slide s na tela (6 px acima do quadro, logo depois do começo do slide)
  const nome = s => p.evaluate(s => { const r = cv.getBoundingClientRect(), k = H() / r.height; return { x:r.left + s * W() / k + 14, y:r.top - 10 }; }, s);

  let e = await estado();
  confere('começa com 3 slides', [e.n, e.nomes, e.ond], [3, ['Capa', 'Slide 2', 'Fim'], { A:0, B1:1, B2:1, C:2 }]);

  // 1) botão direito no nome do slide 1 → "Mover para a direita"
  let q = await nome(0);
  await p.mouse.click(q.x, q.y, { button:'right' }); await p.waitForTimeout(250);
  const itens = await p.$$eval('.ctx:not(.pop-out) button', bs => bs.map(b => b.textContent));
  confere('menu do slide tem mover e apagar', ['Mover para a direita', 'Apagar slide'].every(t => itens.some(i => i.startsWith(t))), true);
  await p.click('.ctx:not(.pop-out) button:has-text("Mover para a direita")'); await p.waitForTimeout(300);
  e = await estado();
  confere('Capa foi para o 2º lugar com o que é dela (o sem nome vira "Slide 1")', [e.nomes, e.ond, e.dur], [['Slide 1', 'Capa', 'Fim'], { A:1, B1:0, B2:0, C:2 }, [8, 4, 0]]);
  confere('posição presa no 9:16 andou junto com o slide', e.preso, .7);

  // 2) Ctrl+Z volta
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  e = await estado();
  confere('desfazer devolve a ordem', [e.nomes, e.ond], [['Capa', 'Slide 2', 'Fim'], { A:0, B1:1, B2:1, C:2 }]);

  // 3) arrastar o nome "Fim" (slide 3) para antes do slide 1
  q = await nome(2); const d = await nome(0);
  await p.mouse.move(q.x, q.y); await p.mouse.down();
  await p.mouse.move(q.x - 40, q.y, { steps:4 }); await p.mouse.move(d.x - 20, q.y, { steps:8 }); await p.waitForTimeout(100);
  const linha = await p.evaluate(() => RT.slideDrag && RT.slideDrag.to);
  confere('arrastando, a linha aponta o começo', linha, 0);
  await p.screenshot({ path:path.join(__dirname, 'reorganizar-slides.png') });
  await p.mouse.up(); await p.waitForTimeout(300);
  e = await estado();
  confere('arrastar levou Fim para o começo', [e.nomes, e.ond, e.dur], [['Fim', 'Capa', 'Slide 3'], { A:1, B1:2, B2:2, C:0 }, [0, 4, 8]]);
  confere('o grupo continua inteiro', e.grupo, 2);

  // 4) escolher o slide pelo nome e apertar Delete apaga só ele (e o que está nele)
  q = await nome(2);
  await p.mouse.click(q.x, q.y); await p.waitForTimeout(150);
  await p.keyboard.press('Delete'); await p.waitForTimeout(300);
  e = await estado();
  confere('Delete apagou o slide 3 com o grupo', [e.n, e.nomes, e.ond], [2, ['Fim', 'Capa'], { A:1, C:0 }]);
  confere('a timeline encolheu para o slide mais longo que sobrou', await p.evaluate(() => S.duration), 4);

  // 5) apagar pelo menu até sobrar um: volta a ser um quadro só
  q = await nome(0);
  await p.mouse.click(q.x, q.y, { button:'right' }); await p.waitForTimeout(250);
  await p.click('.ctx:not(.pop-out) button:has-text("Apagar slide")'); await p.waitForTimeout(300);
  e = await estado();
  confere('com um slide só, o arquivo deixa de ser carrossel', [e.n, Object.keys(e.ond), await p.evaluate(() => !!S.sdur || !!S.still)], [1, ['A'], false]);

  // 6) desfazer tudo
  for (let i = 0; i < 2; i++) { await p.keyboard.press('Control+z'); await p.waitForTimeout(250); }
  e = await estado();
  confere('desfazer traz os slides apagados de volta', [e.n, e.nomes], [3, ['Fim', 'Capa', 'Slide 3']]);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
