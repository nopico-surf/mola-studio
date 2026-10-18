// Teste no navegador: controles no jeito do Figma (fase 1, pedido do usuário). Número sem slider que muda arrastando o ícone,
// dois campos de número por linha com o nome em cima, valores prontos do tamanho da fonte, menu Abraçar | Fixa | Preencher dentro do
// campo do frame, linha de cor com olho (sem cor) e o seletor de cor abrindo ao lado do painel.
// Rodar: node testes/controles-figma.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };

(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:1000 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const tab = () => p.evaluate(() => document.querySelectorAll('#props .tabs button').forEach(t => { if (/Conte/.test(t.textContent) && t.getAttribute('aria-selected') !== 'true') t.click(); }));

  // título
  await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'title'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); renderProps(); });
  await tab(); await p.waitForTimeout(300);
  conf(await p.locator('#props input[type=range]').count() === 0, 'nenhum slider no painel');
  // todo número tem ícone para arrastar (pedido do usuário: sem ícone a área de pegar era pequena demais), nas duas abas
  const semIco = () => p.evaluate(() => [...document.querySelectorAll('#props .nf-ic')].filter(i => !i.querySelector('svg') && !i.textContent.trim()).map(i => i.closest('.field').querySelector('label').textContent));
  let sem = await semIco();
  await p.evaluate(() => document.querySelectorAll('#props .tabs button').forEach(t => { if (/Anima/.test(t.textContent)) t.click(); })); await p.waitForTimeout(300);
  sem = sem.concat(await semIco());
  conf(sem.length === 0, 'todo campo de número tem ícone ' + JSON.stringify(sem));
  await tab(); await p.waitForTimeout(200);
  const fld = n => p.locator(`#props .field.nfield:has(> label:text-is("${n}"))`);
  const tb = await fld('Tamanho').boundingBox(), eb = await fld('Entrelinha').boundingBox();
  conf(tb && eb && Math.abs(tb.y - eb.y) < 2 && eb.x > tb.x + 40, 'Tamanho e Entrelinha na mesma linha, lado a lado');
  const lb = await fld('Tamanho').locator('label').boundingBox(), nb = await fld('Tamanho').locator('.nf').boundingBox();
  conf(lb.y + lb.height <= nb.y + 1, 'nome em cima do campo');

  // valores prontos
  await fld('Tamanho').locator('.nf-chev').click();
  await p.locator('.ctx.nfmenu button', { hasText:'48px' }).click(); await p.waitForTimeout(150);
  conf(await p.evaluate(() => pickedLayers()[0].size) === 48, 'valores prontos: 48px no menu muda o tamanho');

  // arrastar o ícone 20 px para a direita = +20 (1 px por passo)
  const ic = await fld('Tamanho').locator('.nf-ic').boundingBox();
  await p.mouse.move(ic.x + 10, ic.y + 10); await p.mouse.down(); await p.mouse.move(ic.x + 20, ic.y + 10, { steps:3 }); await p.mouse.move(ic.x + 30, ic.y + 10, { steps:3 }); await p.mouse.up();
  conf(await p.evaluate(() => pickedLayers()[0].size) === 68, 'arrastar o ícone 20 px muda o tamanho em 20 (' + await p.evaluate(() => pickedLayers()[0].size) + ')');
  conf(await fld('Tamanho').locator('input.num').inputValue() === '68px', 'o número acompanha o arrasto');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  conf(await p.evaluate(() => pickedLayers()[0].size) === 48, 'o arrasto inteiro desfaz de uma vez');
  await p.evaluate(() => renderProps()); await tab();

  // digitar continua valendo
  const inp = fld('Tamanho').locator('input.num');
  await inp.click(); await inp.fill('72'); await inp.press('Enter'); await p.waitForTimeout(150);
  conf(await p.evaluate(() => pickedLayers()[0].size) === 72, 'digitar 72 + Enter');

  // largura do texto: Abraçar | Largura fixa no menu dentro do campo
  await p.locator('#props .nf-chev[aria-label="Largura máx.: modo"]').click();
  await p.locator('.ctx.nfmenu button', { hasText:'Largura fixa' }).click(); await p.waitForTimeout(200);
  conf(await p.evaluate(() => !!pickedLayers()[0].fixW), 'menu da largura liga a largura fixa');

  // cor: olho = sem cor; seletor ao lado do painel
  const cor = p.locator('#props .field:has(> label:text-is("Cor"))').first();
  await cor.locator('.prop-eye').click(); await p.waitForTimeout(150);
  conf(await p.evaluate(() => noCol(pickedLayers()[0].color)), 'olho deixa a cor sem cor');
  await p.locator('#props .field:has(> label:text-is("Cor"))').first().locator('.prop-eye').click(); await p.waitForTimeout(150);
  conf(await p.evaluate(() => !noCol(pickedLayers()[0].color)), 'olho de novo devolve a cor');
  await p.locator('#props .field:has(> label:text-is("Cor"))').first().locator('.cpick').click(); await p.waitForTimeout(250);
  const pop = await p.locator('.cp-pop').boundingBox(), pr = await p.locator('#props').boundingBox();
  conf(pop && pop.x + pop.width <= pr.x + 1, 'seletor de cor abre ao lado (à esquerda) do painel');
  await p.keyboard.press('Escape');

  // frame: W/H com Abraçar | Fixa | Preencher dentro do campo
  await p.evaluate(() => { RT.picks = new Set(); S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {};
    const k = ADD_KINDS.find(k => k.id === 'sub'); const ls = [0, 1].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.y = .3 + i * .15; L.x = .5; return L; });
    RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[1].id; flowToggle(); renderProps(); });
  await tab(); await p.waitForTimeout(300);
  const gid = await p.evaluate(() => pickedLayers()[0].grp);
  const w = p.locator('#props .field.nfield:has(> label:text-is("Largura"))');
  conf(await w.locator('input.num').inputValue() === 'Abraçar', 'frame abraçando mostra "Abraçar" no campo');
  await w.locator('.nf-chev').click(); await p.locator('.ctx.nfmenu button', { hasText:'Preencher' }).click(); await p.waitForTimeout(200);
  conf(await p.evaluate(g => !!S.groups[g].flow.fillW, gid), 'menu: Preencher liga o preencher');
  const w2 = p.locator('#props .field.nfield:has(> label:text-is("Largura")) input.num');
  conf(await w2.inputValue() === 'Preencher', 'campo mostra "Preencher"');
  await w2.click(); await w2.fill('500'); await w2.press('Enter'); await p.waitForTimeout(200);
  conf(await p.evaluate(g => { const F = S.groups[g].flow; return !F.fillW && F.w === 500; }, gid), 'digitar um número passa para Fixa (500)');

  await b.close();
  console.log(falhas ? `${falhas} FALHA(S)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
