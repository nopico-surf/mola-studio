// Teste no navegador: nenhum campo do painel tem um botão extra competindo na mesma linha (pedido do usuário: "Abraçar" ao lado
// da Largura ficava ruim). O modo (Abraçar | Largura fixa, Em px | Auto, Em pares | Cada lado) tem linha própria e funciona no clique.
// Rodar: node testes/linha-unica.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = process.env.SHOTS;
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
// campo com mais de um controle: label + controle + botão solto no fim
const extras = p => p.evaluate(() => [...document.querySelectorAll('#props .field:not(.stack)')].filter(f => f.children.length > 2 || f.classList.contains('flowgap'))
  .map(f => f.querySelector('label')?.textContent));
const openSecs = p => p.evaluate(() => document.querySelectorAll('#props section.sec h3').forEach(h => { if (h.closest('.folded') || h.classList.contains('folded')) h.click(); }));
const segBtn = (p, label, text) => p.locator(`#props .field:has(> label:text-is("${label}")) .segs button:text-is("${text}")`).first();

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  // texto: Caixa = Abraçar | Largura fixa, numa linha só dela
  const id = await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'sub'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); renderProps(); return L.id; });
  await openSecs(p);
  conf((await extras(p)).length === 0, 'texto: nenhum campo com botão no fim da linha ' + JSON.stringify(await extras(p)));
  await segBtn(p, 'Caixa', 'Largura fixa').click();
  conf(await p.evaluate(id => !!S.layers.find(l => l.id === id).fixW, id), 'texto: "Largura fixa" liga a largura fixa');
  conf(await p.locator('#props .field > label:text-is("Largura")').count() === 1, 'texto: campo "Largura" aparece');
  if (shots) await p.locator('#props').screenshot({ path:path.join(shots, 'texto.png') });
  await segBtn(p, 'Caixa', 'Abraçar').click();
  conf(await p.evaluate(id => !S.layers.find(l => l.id === id).fixW, id), 'texto: "Abraçar" volta a abraçar');

  // frame com layout automático: Espaço, Interno, Largura e Altura
  const gid = await p.evaluate(() => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.y = .3 + i * .15; L.x = .5; return L; });
    RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[1].id; flowToggle(); renderProps(); return ls[0].grp;
  });
  await openSecs(p);
  conf((await extras(p)).length === 0, 'frame: nenhum campo com botão no fim da linha ' + JSON.stringify(await extras(p)));
  await segBtn(p, 'Largura', 'Fixa').click();
  conf(await p.evaluate(g => S.groups[g].flow.w > 0, gid), 'frame: "Fixa" fixa a largura');
  await openSecs(p);
  await segBtn(p, 'Interno', 'Cada lado').click();
  conf(await p.evaluate(g => !!S.groups[g].flow.padSep, gid), 'frame: "Cada lado" separa o espaço interno');
  await openSecs(p);
  await segBtn(p, 'Espaço', 'Auto').click();
  conf(await p.evaluate(g => !!S.groups[g].flow.auto, gid), 'frame: "Auto" espalha');
  await openSecs(p);
  conf((await extras(p)).length === 0, 'frame (Auto, cada lado, fixa): nenhum campo com botão no fim da linha');
  if (shots) await p.locator('#props').screenshot({ path:path.join(shots, 'frame.png') });

  // layout do quadro (nada selecionado)
  await p.evaluate(() => { selectBg(); if (!S.flow) frameToggle(); renderProps(); });
  await openSecs(p);
  conf((await extras(p)).length === 0, 'quadro: nenhum campo com botão no fim da linha');
  await segBtn(p, 'Espaço', 'Auto').click();
  conf(await p.evaluate(() => !!(S.flow && S.flow.auto)), 'quadro: "Auto" espalha');

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
