// Teste no navegador: abas dentro do Mola (js/abas.js). Pedido do usuário: abrir mais de um arquivo ao mesmo tempo e trocar
// de aba em tela cheia (a barra do navegador some), e nenhuma aba pode gravar por cima de outra.
// Confere: barra só com 2+ abas, cada aba com o próprio arquivo e a própria trava, troca por clique e Alt + número, abrir um
// arquivo que outra aba tem leva até ela, apagar/renomear/mover arquivo de outra aba é recusado, fechar a aba salva antes e
// solta o arquivo, recarregar traz as abas de volta, aba do navegador nova não pega o arquivo ocupado, e a janela Arquivos.
// Rodar: node testes/abas.js (prints em mola-testes/abas-*.png na pasta temporária)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = process.env.MOLA_URL || 'file://' + path.resolve(__dirname, '..', 'index.html'); // MOLA_URL=http://localhost:3000/ testa também por servidor
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  const frames = () => p.frames().filter(f => f.url().includes('aba='));
  const info = () => p.evaluate(async () => ({
    bar: !document.getElementById('tabbar').hidden, tabs: [...document.querySelectorAll('.tab')].map(t => ({ nm:t.querySelector('.tab-nm').textContent, on:t.getAttribute('aria-selected') === 'true', id:t.dataset.id })),
    appH: document.getElementById('app').getBoundingClientRect().height, appTop: document.getElementById('app').getBoundingClientRect().top, inert: document.getElementById('app').inert, vh: innerHeight,
    on: [...document.querySelectorAll('.aba-frame')].map(f => f.classList.contains('on')), focusIsFrame: document.activeElement && document.activeElement.tagName === 'IFRAME',
    active: ABAS.active, title: document.title }));

  // 1) uma aba só: nada de barra, o editor ocupa tudo
  let i = await p.evaluate(() => ({ bar: !document.getElementById('tabbar').hidden, appH: document.getElementById('app').getBoundingClientRect().height, vh: innerHeight }));
  ok(!i.bar && Math.abs(i.appH - i.vh) < 1, 'com uma aba só não aparece a barra e o editor ocupa a janela', i);
  const idA = await p.evaluate(() => FILES.id);

  // 2) botão de nova aba: barra com 2 abas, a nova com arquivo próprio (e a trava dele)
  await p.click('#tabBtn');
  await p.waitForFunction(() => document.querySelectorAll('.aba-frame').length === 1);
  const fb = frames()[0];
  await fb.waitForFunction(() => typeof FILES !== 'undefined' && FILES.id && document.getElementById('fileName') && !!S, null, { timeout:15000 });
  await p.waitForTimeout(500);
  const idB = await fb.evaluate(() => FILES.id);
  i = await info();
  ok(i.bar && i.tabs.length === 2, 'a barra aparece com duas abas', i.tabs);
  ok(idB && idB !== idA, 'a aba nova abriu um arquivo próprio', { idA, idB });
  ok(i.tabs[1].on && i.on[0] && i.inert, 'a aba nova fica à frente e o editor de baixo fica inerte', i);
  ok(Math.abs(i.appTop - 34) < 1 && Math.abs(i.appH - (i.vh - 34)) < 1, 'o editor principal cede a altura da barra (34 px)', { top:i.appTop, h:i.appH, vh:i.vh });
  const held = await p.evaluate(async () => (await navigator.locks.query()).held.map(l => l.name).filter(n => n.startsWith('mola-file:')));
  ok(held.includes('mola-file:' + idA) && held.includes('mola-file:' + idB), 'cada aba tem a trava do próprio arquivo', held);
  ok(await fb.evaluate(() => ABAS.embed === true && !document.getElementById('tabbar')), 'a aba interna não monta barra própria');
  await p.screenshot({ path:path.join(outDir, 'abas-2-abas.png') });

  // 3) nome do arquivo na barra: renomear na aba interna aparece no rótulo e no índice
  await fb.fill('#fileName', 'Aba B'); await fb.press('#fileName', 'Enter');
  await p.waitForFunction(() => [...document.querySelectorAll('.tab-nm')].some(n => n.textContent === 'Aba B'), null, { timeout:5000 }).catch(() => {});
  i = await info();
  ok(i.tabs.some(t => t.nm === 'Aba B'), 'o nome do arquivo aparece no rótulo da aba', i.tabs);
  ok(i.title.startsWith('Aba B'), 'o título da página acompanha a aba da frente', i.title);

  // 4) clique troca para a principal; Alt + 2 volta; o foco vai para o iframe
  await p.click('.tab[data-id="main"]'); await p.waitForTimeout(200);
  i = await info();
  ok(i.tabs[0].on && !i.on[0] && !i.inert, 'clicar na primeira aba mostra o editor principal', i);
  await p.keyboard.press('Alt+2'); await p.waitForTimeout(250);
  i = await info();
  ok(i.tabs[1].on && i.on[0] && i.inert, 'Alt + 2 vai para a segunda aba', i);
  ok(i.focusIsFrame, 'o foco do teclado vai para a aba da frente (senão Delete/espaço agiam no editor escondido)');
  await p.keyboard.press('Alt+1'); await p.waitForTimeout(250);
  ok((await info()).active === 'main', 'Alt + 1 volta à principal');
  await p.keyboard.press('Alt+2'); await p.waitForTimeout(250);
  // Alt + número com o foco DENTRO da aba interna também troca
  await fb.evaluate(() => window.focus());
  await p.keyboard.press('Alt+1'); await p.waitForTimeout(250);
  ok((await info()).active === 'main', 'Alt + 1 pressionado dentro da aba interna também troca');

  // 5) a aba que sai da vista para de tocar
  await p.evaluate(() => { play(); });
  await p.click('#tabBtn'); // ainda na principal: abre a terceira aba
  await p.waitForFunction(() => document.querySelectorAll('.aba-frame').length === 2);
  ok(await p.evaluate(() => !playing), 'sair da aba principal pausa o que estava tocando');
  const fc = frames()[1];
  await fc.waitForFunction(() => typeof FILES !== 'undefined' && FILES.id && !!S, null, { timeout:15000 });
  const idC = await fc.evaluate(() => FILES.id);
  i = await info();
  ok(i.tabs.length === 3 && idC && ![idA, idB].includes(idC), 'terceira aba com arquivo próprio', { tabs:i.tabs.length, idC });

  // 6) abrir (pela janela Arquivos) um arquivo que outra aba tem: vai até ela, não abre de novo
  await fc.evaluate(id => openFile(id), idA); await p.waitForTimeout(400);
  i = await info();
  ok(i.active === 'main', 'abrir um arquivo que está em outra aba leva até ela', i.active);
  ok(await fc.evaluate(() => FILES.id) === idC, 'a aba de onde pediu continua no próprio arquivo');
  // arquivo que só outra ABA INTERNA conhece: renomear, mover e apagar são recusados
  await p.evaluate(async ([id]) => { await renameFile(id, 'Nome trocado por fora'); await deleteFile(id); }, [idB]);
  await p.waitForTimeout(300);
  const recB = await p.evaluate(async id => ((await DB.get('files')) || []).find(f => f.id === id), idB);
  ok(recB && recB.name === 'Aba B' && !(await p.evaluate(() => !!document.querySelector('.modal.ask'))) && await p.evaluate(async id => !!(await DB.get('file:' + id)), idB),
    'renomear e apagar um arquivo aberto em outra aba são recusados (sem janela de confirmar)', recB && recB.name);

  // 7) Arquivos mostra "Em outra aba"
  await p.evaluate(() => openFiles('*')); await p.waitForTimeout(500);
  const tags = await p.evaluate(() => [...document.querySelectorAll('.fcard')].map(c => ({ nm:c.querySelector('b').textContent, em:c.querySelector('em') && c.querySelector('em').textContent })));
  ok(tags.filter(t => t.em === 'Em outra aba').length === 2 && tags.filter(t => t.em === 'Aberto').length === 1, 'a janela Arquivos marca o que está em outra aba', tags);
  await p.screenshot({ path:path.join(outDir, 'abas-arquivos.png') });
  await p.evaluate(() => closeFiles());

  // 8) fechar a terceira aba: sai, solta o arquivo; a segunda continua
  await p.click('.tab-x >> nth=2'); // o × da terceira aba (a principal agora tem × também: 0 = principal, 1 = "Aba B")
  await p.waitForTimeout(800);
  i = await info();
  const left = i.tabs.map(t => t.nm);
  ok(i.tabs.length === 2 && left.includes('Aba B'), 'fechar uma aba tira ela da barra e deixa as outras', left);
  const held2 = await p.evaluate(async () => (await navigator.locks.query()).held.map(l => l.name.replace('mola-file:', '')));
  ok(!held2.includes(idC) && held2.includes(idB), 'a trava do arquivo da aba fechada é solta e a da outra continua', held2);
  ok(await p.evaluate(async id => !!(await DB.get('file:' + id)), idC), 'o arquivo da aba fechada continua salvo');

  // 9) recarregar a principal traz as abas de volta, cada uma com o próprio arquivo
  const before = await p.evaluate(() => ({ main:FILES.id, tabs:[...document.querySelectorAll('.tab-nm')].map(n => n.textContent) }));
  await p.reload(); await p.waitForTimeout(2500);
  const fr = frames();
  ok(fr.length === 1, 'recarregar traz a aba de volta', fr.length);
  if (fr[0]) await fr[0].waitForFunction(() => typeof FILES !== 'undefined' && FILES.id && !!S, null, { timeout:15000 });
  const after = await p.evaluate(() => ({ main:FILES.id, tabs:[...document.querySelectorAll('.tab-nm')].map(n => n.textContent), active:ABAS.active }));
  ok(after.main === before.main, 'a principal reabre o mesmo arquivo (não o último que outra aba abriu)', { before:before.main, after:after.main });
  ok(after.tabs.length === 2 && after.tabs.join('|') === before.tabs.join('|'), 'as abas voltam com os mesmos arquivos', { before:before.tabs, after:after.tabs });

  // 10) aba nova do NAVEGADOR: o arquivo padrão está ocupado, então abre um arquivo novo em vez de pegar o mesmo
  const q = await ctx.newPage(); q.on('pageerror', e => { falhas++; console.log('ERRO q', e.message); });
  await q.goto(url); await q.waitForTimeout(1800);
  const idQ = await q.evaluate(() => FILES.id), ocupados = await q.evaluate(async () => (await navigator.locks.query()).held.map(l => l.name.replace('mola-file:', '')));
  ok(idQ !== after.main && ocupados.includes(idQ) && ocupados.length >= 3, 'aba do navegador nova não pega arquivo que já está aberto', { idQ, ocupados });
  ok(await q.evaluate(() => /outra aba/.test(document.body.innerText)), 'avisa que abriu um arquivo novo');
  // e abrir um arquivo ocupado por aba que o hospedeiro desta aba não conhece: oferece cópia
  const dlg = q.evaluate(id => openFile(id), after.main);
  await q.waitForSelector('.modal.ask', { timeout:4000 });
  ok(await q.evaluate(() => /cópia/.test(document.querySelector('.modal.ask').innerText)), 'abrir arquivo de outra aba do navegador oferece abrir uma cópia');
  await q.click('.modal.ask .btn.ghost'); await dlg.catch(() => {});
  ok(await q.evaluate(() => FILES.id) === idQ, 'cancelar não troca de arquivo');
  // o índice sobrevive a duas abas salvando juntas
  await Promise.all([p.evaluate(() => { S.layers[0].x += 0; changed(); return flushSave(); }), q.evaluate(() => { changed(); return flushSave(); })]);
  const idxF = await p.evaluate(async () => (await DB.get('files')).map(f => f.id));
  ok([after.main, idQ].every(x => idxF.includes(x)), 'duas abas salvando ao mesmo tempo não perdem o arquivo uma da outra', idxF);
  await q.close();

  // 11) fechar até sobrar uma aba: a barra some e o editor volta a ocupar tudo
  await p.click('.tab:not([data-id="main"]) .tab-x'); await p.waitForTimeout(800);
  i = await info();
  ok(!i.bar && Math.abs(i.appH - i.vh) < 1 && !i.inert && i.active === 'main', 'com uma aba só a barra some e o editor volta ao tamanho cheio', i);
  ok(await p.evaluate(() => document.querySelectorAll('.aba-frame').length === 0), 'o iframe da aba fechada saiu da página');
  await p.screenshot({ path:path.join(outDir, 'abas-1-aba.png') });


  // 12) a principal também fecha: sai da barra, solta o arquivo, a outra aba vira a única (sem ×) e continua visível
  await p.click('#tabBtn'); await p.waitForTimeout(1500); await p.click('.tab-new'); await p.waitForTimeout(1500);
  const mainFile = await p.evaluate(() => FILES.id);
  await p.click('.tab[data-id="main"] .tab-x'); await p.waitForTimeout(800);
  i = await info();
  ok(i.tabs.length === 2 && !i.tabs.some(t => t.id === 'main'), 'fechar a principal tira ela da barra', i.tabs);
  ok(await p.evaluate(id => navigator.locks.query().then(q => !q.held.some(l => l.name === 'mola-file:' + id)), mainFile), 'a principal solta a trava do arquivo');
  await p.click('.tab-x >> nth=0'); await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.querySelectorAll('.tab-x').length === 0 && !!document.querySelector('.aba-frame.on') && !document.getElementById('tabbar').hidden), 'a última aba não tem × e continua na tela');
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e); process.exit(1); });
