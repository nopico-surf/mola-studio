// Teste no navegador: abrir e fechar seção é só pela seta (pedido do usuário: nunca "+" para abrir/fechar), e a barra flutuante não existe.
// Desde o painel na ordem do Figma, Contorno, Efeitos, Preenchimento e Exportar são seções de lista: o "+" ACRESCENTA uma linha
// (não abre nem fecha nada) e o cabeçalho não tem seta. As seções comuns (Tipografia, Aparência…) continuam com a seta.
// Rodar: node testes/secoes-com-seta.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
const head = (p, t) => p.locator('#props h3.fold-h', { hasText:t }).first();
const shut = (p, t) => head(p, t).evaluate(e => e.classList.contains('shut'));
const list = (p, t) => p.locator('#props h3.nofold', { hasText:t }).first();

(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => localStorage.removeItem('mola-fold'));
  await p.reload(); await p.waitForTimeout(1200);
  const id = await p.evaluate(() => { const L = addLayer(mkText('title', { text:'Olá' })); select(L.id); propTab = 'style'; renderProps(); return L.id; });
  await p.waitForTimeout(200);

  conf(await p.locator('#fbar, .fbar').count() === 0, 'sem barra flutuante no palco');
  conf(await p.locator('#props .opt-btn').count() === 0, 'nenhum botão antigo de abrir/fechar com + / −');
  for (const t of ['Contorno', 'Efeitos', 'Exportar'])
    conf(await list(p, t).locator('.list-b').count() === 1 && await list(p, t).locator('.fold-btn').count() === 0, `"${t}": só o "+" (acrescenta), sem seta`);
  conf(await head(p, 'Tipografia').locator('.fold-btn').count() === 1, '"Tipografia" tem a seta');

  // o "+" acrescenta e não abre/fecha; desfazer
  await list(p, 'Contorno').locator('.list-b').click(); await p.waitForTimeout(200);
  conf(await p.evaluate(id => S.layers.find(l => l.id === id).stroke, id) === true, 'o "+" acrescenta o contorno');
  conf(await p.locator('#props .field > label:text-is("Espessura")').count() === 1, 'campos do contorno aparecem');
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  conf(!(await p.evaluate(id => S.layers.find(l => l.id === id).stroke, id)), 'Ctrl+Z desfaz');
  // a seta continua abrindo e fechando as seções comuns
  await head(p, 'Tipografia').locator('.fold-btn').click(); await p.waitForTimeout(350); // fechar/abrir agora é animado
  conf(await shut(p, 'Tipografia'), 'a seta fecha a Tipografia');
  await head(p, 'Tipografia').locator('.fold-btn').click(); await p.waitForTimeout(350); // fechar/abrir agora é animado
  conf(!(await shut(p, 'Tipografia')), 'a seta abre de novo');

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
