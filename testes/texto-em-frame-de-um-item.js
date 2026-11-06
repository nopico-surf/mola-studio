// Teste no navegador: texto num frame de um item só (largura fixa) dentro de outro frame com layout, como no carrossel do usuário.
// Bugs relatados: "texto dentro de um grupo de frame, quando dou dois cliques não seleciona pra editar" e "às vezes preciso
// recarregar a página pra conseguir copiar um texto que tá dentro de um frame".
//  - o 1º clique do clique duplo subia do frame de dentro (já escolhido) para o de fora e o clique duplo descia de novo: nunca editava;
//  - com a edição no palco aberta e o foco no painel, Esc no painel deixava o campo aberto sem cursor; o próximo clique no texto
//    caía nele e o Ctrl+C copiava um trecho vazio em vez da camada.
// Rodar: node testes/texto-em-frame-de-um-item.js
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
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
    const mk = (L, x, y) => { L.start = 0; L.end = S.duration; addLayer(L, { x, y }); return L; };
    const t = mk(mkText('title', { text:'Consulta psiquiátrica não deveria ser um privilégio', size:64 }), .5, .45);
    const a = mk(mkText('body', { text:'MARGEM', size:30 }), .25, .62), c = mk(mkText('body', { text:'Arrasta pro lado', size:30 }), .7, .62);
    T = 3;
    RT.picks = new Set([t.id]); RT.selected = t.id; flowToggle(); // o título num frame só dele
    RT.picks = new Set([a.id, c.id]); RT.selected = a.id; flowToggle(); // a linha de baixo
    RT.picks = new Set([t.id, a.id, c.id]); RT.selected = t.id; flowToggle(); // a coluna com os dois frames
    changed({ layers:true, props:true }); selectBg(); RT.frameNo++; renderFrame(pctx, T, RS, false);
    window.__t = t.id;
  });
  const pos = await p.evaluate(() => { const L = S.layers.find(l => l.id === window.__t); RT.frameNo++; renderFrame(pctx, T, RS, false); const r = cv.getBoundingClientRect(), k = r.width / FW(), bb = L._bounds; return { x:r.left + (bb.x + bb.w * .4) * k, y:r.top + (bb.y + bb.h * .3) * k }; });
  const st = () => p.evaluate(() => ({ n:RT.picks.size, t:RT.picks.has(window.__t), sed:!!SED.el }));
  const nivel = () => p.evaluate(() => { const g = S.layers.find(l => l.id === window.__t).grp; return { dentro:wholeGroup() === g, fora:wholeGroup() === gpar(g) }; });

  // 1) clique pega a coluna, clique duplo desce até o frame do título, o próximo clique duplo edita
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(400);
  confere('clique: a coluna inteira', await nivel(), { dentro:false, fora:true });
  await p.mouse.dblclick(pos.x, pos.y); await p.waitForTimeout(400);
  confere('clique duplo: o frame do título', await nivel(), { dentro:true, fora:false });
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(400);
  confere('clique de novo: continua no frame do título', await nivel(), { dentro:true, fora:false });
  await p.mouse.dblclick(pos.x, pos.y); await p.waitForTimeout(400);
  confere('2º clique duplo: edita o texto', await st(), { n:1, t:true, sed:true });

  // 2) com a edição aberta, mexer no painel e dar Esc nele conclui a edição; o Ctrl+C copia a camada
  await p.evaluate(() => { if (!SED.el) stageEdit(S.layers.find(l => l.id === window.__t)); }); // independente da parte 1
  await p.locator('#props input.num').first().click(); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  confere('Esc no painel conclui a edição', (await st()).sed, false);
  await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(400);
  confere('clicar no texto depois não reabre a edição', (await st()).sed, false);
  await p.evaluate(() => navigator.clipboard.writeText('nada'));
  await p.keyboard.press('Control+C'); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  confere('Ctrl+C copia a camada', clip.startsWith('mola-camadas:') && JSON.parse(clip.slice(13)).layers.some(l => (l.text || '').startsWith('Consulta')), true);

  await p.screenshot({ path:path.join(__dirname, 'texto-em-frame-de-um-item.png') });
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
