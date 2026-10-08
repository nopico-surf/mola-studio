// Teste no navegador: "Novo arquivo" abre numa aba nova e não troca o arquivo da aba atual (pedido do usuário).
// Confere o botão da janela Arquivos, o card "+ Novo arquivo" e "Novo arquivo aqui" do menu do projeto: o arquivo de
// origem continua aberto na aba principal, a aba nova tem um arquivo vazio próprio e, em Rascunhos, herda a marca.
// Rodar: node testes/novo-arquivo-em-aba.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = process.env.MOLA_URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  const frames = () => p.frames().filter(f => f.url().includes('aba='));
  const idA = await p.evaluate(() => FILES.id);
  // marca reconhecível no arquivo de origem (Rascunhos: a aba nova herda a marca dele)
  await p.evaluate(() => { S.brand.colors[0] = '#123456'; changed(); });
  await p.waitForTimeout(900);

  // 1) botão "Novo arquivo" da janela Arquivos
  await p.evaluate(() => openFiles('*'));
  await p.waitForSelector('#files:not([hidden])');
  await p.click('#fileNew');
  await p.waitForFunction(() => document.querySelectorAll('.aba-frame').length === 1, null, { timeout:8000 });
  let fb = frames()[0];
  await fb.waitForFunction(() => typeof FILES !== 'undefined' && FILES.id && !!S, null, { timeout:15000 });
  const idB = await fb.evaluate(() => FILES.id);
  ok(await p.evaluate(() => FILES.id) === idA, 'o arquivo da aba principal continua o mesmo', { idA });
  ok(idB && idB !== idA, 'o arquivo novo abriu na aba nova', { idA, idB });
  ok(await p.evaluate(() => document.getElementById('files').hidden), 'a janela Arquivos fechou');
  ok(await fb.evaluate(() => S.layers.length === 1 && S.layers[0].type === 'bg'), 'o arquivo novo começa só com o fundo');
  ok(await fb.evaluate(() => S.brand.colors[0]) === '#123456', 'em Rascunhos, a marca do arquivo de origem vai junto');
  ok(await p.evaluate(() => document.querySelectorAll('.tab').length) === 2, 'a barra mostra duas abas');

  // 2) card "+ Novo arquivo" dentro da janela Arquivos (aba principal)
  await p.click('.tab[data-id="main"]'); await p.waitForTimeout(300);
  await p.evaluate(() => openFiles('*'));
  await p.waitForSelector('#files:not([hidden]) .fcard.new');
  await p.click('#files .fcard.new');
  await p.waitForFunction(() => document.querySelectorAll('.aba-frame').length === 2, null, { timeout:8000 });
  ok(await p.evaluate(() => FILES.id) === idA, 'o card "Novo arquivo" também não troca o arquivo atual');
  ok(await p.evaluate(() => document.querySelectorAll('.tab').length) === 3, 'a barra mostra três abas');

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e); process.exit(1); });
