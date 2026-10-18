// Teste no navegador: a aba Animação mostra os presets numa galeria com miniaturas (todos à vista, sem abrir categoria),
// pílulas filtram (Todos · Favoritos · categorias, lembradas por grade), favoritos e busca continuam, "Sem animação" vem primeiro,
// a miniatura só se mexe com o mouse em cima e a prévia no palco continua. Vale para texto, logo, forma, imagem, grupo e Componentes.
// Rodar: node testes/galeria-de-animacoes.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };

(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { localStorage.removeItem('mola-pcat'); localStorage.removeItem('mola-favs'); for (const k of Object.keys(PCAT)) delete PCAT[k]; for (const k of Object.keys(FAVS)) delete FAVS[k]; });

  // espera as miniaturas da fila (desenhadas aos poucos) e conta as que ficaram vazias
  const grade = sel => p.evaluate(async sel => {
    for (let i = 0; i < 200 && THUMB.q.length; i++) await new Promise(r => setTimeout(r, 20));
    while (THUMB.q.length) THUMB.q.shift()();
    const g = document.querySelector(sel); if (!g) return null;
    const tiles = [...g.querySelectorAll('.chip.pt')];
    const vazia = tiles.filter(t => { const c = t.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; }).map(t => t.dataset.key);
    return { n:tiles.length, first:tiles[0] && tiles[0].dataset.key, keys:tiles.map(t => t.dataset.key), vazia, cats:!!g.querySelector('.cat-box, button.chip-cat'),
      pills:[...g.querySelectorAll('.pcat')].map(x => x.textContent), on:g.querySelector('.pcat[aria-pressed="true"]')?.textContent };
  }, sel);

  // texto: tudo à vista, sem categoria fechada
  const id = await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'sub'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); propTab = 'anim'; renderProps(); return L.id; });
  await p.waitForTimeout(900);
  let g = await grade('#props .pgal');
  conf(g && g.n === (await p.evaluate(() => TEXT_IN.length)) && !g.cats, `texto: os ${g && g.n} presets de entrada à vista, sem categoria para abrir`);
  conf(g.first === 'cut', '"Sem animação" vem primeiro');
  conf(!g.vazia.filter(k => k !== 'cut').length, 'toda miniatura desenhou algo ' + JSON.stringify(g.vazia));
  conf(g.pills.join(',') === 'Todos,Favoritos,Movimento,Revelação,3D,Efeitos,Só texto' && g.on === 'Todos', 'pílulas: ' + g.pills.join(' · '));

  // filtro Revelação: só os dessa categoria (e "Sem animação" em cima), e fica lembrado
  await p.locator('#props .pgal').first().locator('.pcat', { hasText:/^Revelação$/ }).click();
  g = await grade('#props .pgal');
  const rev = await p.evaluate(keys => keys.filter(k => k !== 'cut').every(k => TP[k].cat === 'rev'), g.keys);
  conf(rev && g.first === 'cut' && g.on === 'Revelação', `filtro Revelação: ${g.n} quadradinhos, todos da categoria`);
  conf(await p.evaluate(() => JSON.parse(localStorage.getItem('mola-pcat')).in === 'rev'), 'filtro guardado no localStorage (mola-pcat, por grade)');

  // miniatura parada; mouse em cima: ela se mexe e o palco mostra o preset (prévia que já existia)
  const chip = p.locator('#props .pgal').first().locator('.chip[data-key="blinds"]');
  const px = () => chip.evaluate(c => c.querySelector('canvas').toDataURL());
  const a0 = await px(); await p.waitForTimeout(300); const a1 = await px();
  conf(a0 === a1, 'sem o mouse, a miniatura fica parada');
  await chip.hover(); await p.waitForTimeout(500);
  const m0 = await px(); await p.waitForTimeout(250); const m1 = await px();
  const st = await p.evaluate(id => ({ on:!!PV.on, inp:S.layers.find(l => l.id === id).in, live:!!THUMB.live }), id);
  conf(m0 !== m1 && st.live, 'mouse em cima: a miniatura anima');
  conf(st.on && st.inp === 'blinds', 'mouse em cima: prévia no palco continua ' + JSON.stringify(st));
  await p.mouse.move(700, 300); await p.waitForTimeout(400);
  const back = await p.evaluate(id => ({ on:!!PV.on, live:!!THUMB.live, inp:S.layers.find(l => l.id === id).in }), id);
  conf(!back.on && !back.live && back.inp !== 'blinds' && (await px()) === a0, 'mouse saiu: miniatura volta ao quadro parado e o preset volta');

  // clique escolhe, marcado em verde (aria-pressed)
  await chip.click(); await p.waitForTimeout(200);
  conf(await p.evaluate(id => S.layers.find(l => l.id === id).in === 'blinds' && document.querySelector('#props .pgal .chip[data-key="blinds"]').getAttribute('aria-pressed') === 'true', id), 'clique escolhe e marca o preset');

  // favorito: a estrela soma e o filtro Favoritos mostra só ele
  await chip.hover(); await p.locator('#props .pgal').first().locator('.chip-w', { has:p.locator('.chip[data-key="blinds"]') }).locator('.fav').click();
  await p.locator('#props .pgal').first().locator('.pcat', { hasText:/^Favoritos$/ }).click();
  g = await grade('#props .pgal');
  conf(g.keys.join(',') === 'cut,blinds', 'Favoritos: "Sem animação" + o favorito ' + g.keys.join(','));

  // busca: a lista toda, sem filtro
  await p.fill('#presetQ', 'pendulo'); await p.waitForTimeout(100);
  g = await grade('#props .pgal');
  conf(g.keys.includes('swing') && !g.pills.length, 'busca "pendulo" acha o Pêndulo, sem as pílulas ' + g.keys.join(','));
  await p.fill('#presetQ', ''); await p.waitForTimeout(100);

  // o filtro de Favoritos ficou lembrado na grade de entrada: volta para Todos
  await p.locator('#props .pgal').first().locator('.pcat', { hasText:/^Todos$/ }).click();
  // outros tipos: logo, forma, imagem, grupo
  for (const [nome, mk] of [
    ['logo', () => ADD_KINDS.find(k => k.id === 'logo').mk(S.brand, S.brand.fonts)],
    ['forma', () => mkShape({ kind:'rect', size:.3, mh:.2 })],
    ['imagem', () => { const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#4a8'; x.fillRect(0, 0, 40, 40); return mkImage({ src:c.toDataURL() }); }],
  ]) {
    await p.evaluate(src => { const L = addLayer(eval('(' + src + ')')()); select(L.id); propTab = 'anim'; renderProps(); }, mk.toString());
    await p.waitForTimeout(200);
    g = await grade('#props .pgal');
    conf(g && g.n > 5 && !g.cats && !g.vazia.filter(k => k !== 'cut').length, `${nome}: galeria com ${g && g.n} miniaturas desenhadas ${g && JSON.stringify(g.vazia)}`);
  }
  // grupo inteiro: a galeria é a do grupo
  await p.evaluate(() => { const ls = S.layers.filter(l => l.type === 'shape' || l.type === 'image'); RT.picks = new Set(ls.map(l => l.id)); RT.selected = ls[0].id; groupSel(); propTab = 'anim'; renderProps(); });
  await p.waitForTimeout(200);
  g = await grade('#props .pgal');
  conf(await p.evaluate(() => !!wholeGroup()) && g && g.n > 5 && !g.vazia.filter(k => k !== 'cut').length, `grupo: galeria com ${g && g.n} miniaturas`);

  // janela Componentes: a mesma galeria, gravando no padrão
  await p.evaluate(() => openComps('title')); await p.waitForTimeout(400);
  g = await grade('.comp-card .pgal');
  conf(g && g.n > 5 && !g.vazia.filter(k => k !== 'cut').length, `Componentes: galeria com ${g && g.n} miniaturas`);
  await p.locator('.comp-card .pgal').first().locator('.pcat', { hasText:/^Todos$/ }).click();
  await p.locator('.comp-card .pgal').first().locator('.chip[data-key="swing"]').click(); await p.waitForTimeout(200);
  conf(await p.evaluate(() => compProps('title').in === 'swing'), 'Componentes: clicar grava a entrada no padrão');

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
