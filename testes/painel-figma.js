// Teste no navegador: painel da direita na ordem do Figma (fase 2, pedido do usuário). Ordem das seções; o "+" acrescenta uma linha
// (Contorno, Efeitos, Exportar, Preenchimento) e nunca abre/fecha seção; olho esconde sem tirar; "−" tira; detalhes na janelinha ao lado.
// Rodar: node testes/painel-figma.js   (precisa do playwright)
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
  const L = () => p.evaluate(() => { const l = pickedLayers()[0]; return JSON.parse(JSON.stringify(l, (k, v) => k.startsWith('_') ? undefined : v)); });
  const heads = () => p.evaluate(() => [...document.querySelectorAll('#props h3')].map(h => (h.firstChild && h.firstChild.nodeType === 3 ? h.firstChild.textContent : h.textContent).trim()));
  const plus = t => p.locator(`#props h3.nofold:has-text("${t}") .list-b[aria-label^="Acrescentar"]`).first();
  const row = lbl => p.locator(`#props .field:has(> label:text-is("${lbl}")) .prop`).first();

  await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'shape'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); renderProps(); });
  await tab(); await p.waitForTimeout(300);
  const hs = await heads(), ord = ['Posição', 'Layout', 'Layout automático', 'Aparência', 'Forma', 'Preenchimento', 'Contorno', 'Efeitos', 'Exportar'];
  const idx = ord.map(t => hs.indexOf(t));
  conf(idx.every(i => i >= 0) && idx.every((v, i) => !i || v > idx[i - 1]), 'forma: ordem do Figma ' + JSON.stringify(hs));
  conf(await p.locator('#props .field.nfield:has(> label:text-is("X"))').count() === 1 && await p.locator('#props .field.nfield:has(> label:text-is("Cantos"))').count() === 1, 'X em px e Cantos em Aparência');

  // Contorno +
  conf(await p.locator('#props h3.nofold:has-text("Contorno")').evaluate(h => !h.classList.contains('fold-h')), 'o "+" não fica num cabeçalho que abre/fecha');
  await plus('Contorno').click(); await p.waitForTimeout(200);
  conf((await L()).stroke === true, '"+" do Contorno liga o contorno');
  conf(await row('Cor do traço').count() === 1, 'linha do contorno aparece (amostra, hex, %)');
  await row('Cor do traço').locator('.prop-eye').click(); await p.waitForTimeout(200);
  let l = await L(); conf(!l.stroke && l.strokeOff, 'olho esconde o contorno sem tirar a linha');
  conf(await p.locator('#props .field:has(> label:text-is("Cor do traço")) .prop.off').count() === 1, 'a linha continua, apagada');
  await row('Cor do traço').locator('.prop-eye').click(); await p.waitForTimeout(200);
  conf((await L()).stroke === true, 'olho de novo mostra');
  // detalhes na janelinha
  await row('Cor do traço').locator('.prop-det').click(); await p.waitForTimeout(250);
  const pop = await p.locator('.pop:not(.pop-out)').boundingBox(), pr = await p.locator('#props').boundingBox();
  conf(pop && pop.x + pop.width <= pr.x + 1, 'detalhes do contorno abrem ao lado do painel');
  await p.locator('.pop:not(.pop-out) .field:has(> label:text-is("Estilo")) .segs button').nth(1).click(); await p.waitForTimeout(250);
  conf((await L()).strokeDash !== 'solid', 'trocar o estilo na janelinha muda o traço (' + (await L()).strokeDash + ')');
  conf(await p.locator('.pop:not(.pop-out) .field:has(> label:text-is("Espaçamento"))').count() === 1, 'a janelinha se refaz (Espaçamento aparece)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await row('Cor do traço').locator('.prop-rm').click(); await p.waitForTimeout(200);
  l = await L(); conf(!l.stroke && !l.strokeOff, '"−" tira o contorno');

  // Efeitos +
  await plus('Efeitos').click(); await p.waitForTimeout(150);
  await p.locator('.ctx.nfmenu:not(.pop-out) button', { hasText:'Sombra' }).click(); await p.waitForTimeout(200);
  conf((await L()).shadow && (await L()).shadow !== 'none', '"+" de Efeitos → Sombra liga a sombra');
  await plus('Efeitos').click(); await p.waitForTimeout(150);
  await p.locator('.ctx.nfmenu:not(.pop-out) button', { hasText:'Desfoque' }).first().click(); await p.waitForTimeout(200);
  conf((await L()).lblur > 0, 'Desfoque acrescentado');
  conf(await p.locator('#props .prop[data-fx]').count() === 2, 'duas linhas de efeito');
  await p.locator('#props .prop[data-fx="lblur"] .fx-nm').click(); await p.waitForTimeout(250);
  const inp = p.locator('.pop:not(.pop-out) input.num').first();
  await inp.click(); await inp.fill('33'); await inp.press('Enter'); await p.waitForTimeout(200);
  conf((await L()).lblur === 33, 'desfoque mudado na janelinha (33)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.locator('#props .prop[data-fx="shadow"] .prop-eye').click(); await p.waitForTimeout(200);
  l = await L(); conf(l.shadow === 'none' && l.shOff, 'olho esconde a sombra e guarda');
  await p.locator('#props .prop[data-fx="shadow"] .prop-eye').click(); await p.waitForTimeout(200);
  conf((await L()).shadow === l.shOff, 'olho devolve a mesma sombra');
  await p.locator('#props .prop[data-fx="lblur"] .prop-rm').click(); await p.waitForTimeout(200);
  conf(!((await L()).lblur > 0) && await p.locator('#props .prop[data-fx]').count() === 1, '"−" tira o desfoque');

  // Preenchimento: "−" tira, "+" devolve
  await row('Preenchimento').locator('.prop-rm').click(); await p.waitForTimeout(200);
  conf(await p.evaluate(() => fillVoid(pickedLayers()[0])), '"−" tira o preenchimento');
  await plus('Preenchimento').click(); await p.waitForTimeout(200);
  conf(await p.evaluate(() => !fillVoid(pickedLayers()[0])), '"+" devolve o preenchimento');

  // Exportar +
  await plus('Exportar').click(); await p.waitForTimeout(200);
  conf(await p.locator('#props .exp-box').count() === 1 && await p.locator('#props button', { hasText:'Exportar Forma' }).count() === 1, '"+" de Exportar acrescenta uma linha e o botão');

  // frame: Layout automático com "−" e grade 3 × 3
  await p.evaluate(() => { RT.picks = new Set(); S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {};
    const k = ADD_KINDS.find(k => k.id === 'sub'); const ls = [0, 1].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.y = .3 + i * .15; L.x = .5; return L; });
    RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[1].id; flowToggle(); renderProps(); });
  await tab(); await p.waitForTimeout(300);
  const gid = await p.evaluate(() => pickedLayers()[0].grp);
  await p.locator('#props .algrid .alg').nth(8).click(); await p.waitForTimeout(200);
  conf(await p.evaluate(g => { const F = S.groups[g].flow; return F.align === 'end' && F.pin === 'end'; }, gid), 'grade 3 × 3: canto de baixo à direita = alinhar à direita + fixo embaixo');
  await p.locator('#props h3.nofold:has-text("Layout automático") .list-b[aria-label^="Tirar"]').click(); await p.waitForTimeout(250);
  conf(await p.evaluate(g => !S.groups[g].flow, gid), '"−" do Layout automático desliga');
  // texto solto: "+" do Layout automático põe num frame
  await p.evaluate(() => { RT.picks = new Set(); S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; const k = ADD_KINDS.find(k => k.id === 'title'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); renderProps(); });
  await tab(); await p.waitForTimeout(250);
  await plus('Layout automático').click(); await p.waitForTimeout(250);
  conf(await p.evaluate(() => { const l = S.layers.find(l => l.type === 'text'); return !!(l.grp && S.groups[l.grp].flow); }), '"+" do Layout automático num texto solto cria o frame');

  await b.close();
  console.log(falhas ? `${falhas} FALHA(S)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
