// Teste no navegador: Camadas como a árvore do Figma (fase 3, pedido do usuário). Ícone por tipo (texto, forma pelo desenho, imagem,
// botão, frame com layout = direção, grupo = tracejado), recuo por nível, cadeado e olho só com o mouse em cima (menos quando ligados),
// sem subir/descer na lista, e a seta recolhe o frame.
// Rodar: node testes/camadas-arvore.js   (precisa do playwright)
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
  const ids = await p.evaluate(() => {
    const mk = id => { const L = addLayer(ADD_KINDS.find(k => k.id === id).mk(S.brand, S.brand.fonts)); RT.picks = new Set(); return L; };
    const a = mk('title'), c = mk('sub'); a.y = .3; c.y = .45;
    RT.picks = new Set([a.id, c.id]); RT.selected = c.id; flowToggle(); RT.picks = new Set();
    const st = mk('shape'); st.kind = 'star'; const ci = mk('shape'); ci.kind = 'ellipse';
    RT.picks = new Set([st.id, ci.id]); RT.selected = ci.id; groupSel(); RT.picks = new Set();
    const im = mk('image'); ci.visible = false;
    selectBg(); renderAll();
    return { a:a.id, st:st.id, ci:ci.id, im:im.id, fr:a.grp, gr:st.grp };
  });
  await p.waitForTimeout(300);
  const cell = id => p.locator(`#layers .layer[data-id="${id}"]`);
  const ico = id => cell(id).locator('.lic').evaluate(e => e.innerHTML);
  // o navegador reescreve o SVG ao montar: compara com o mesmo ícone montado num elemento
  const I = await p.evaluate(() => { ltIcons(); const n = s => { const d = document.createElement('span'); d.innerHTML = s; return d.innerHTML; }; return { t:n(ICONS.lt_text), star:n(ICONS.sh_star), img:n(ICONS.lt_image), fv:n(ICONS.fl_v), g:n(ICONS.lt_group) }; });
  conf(await ico(ids.a) === I.t, 'texto com o ícone de texto');
  conf(await ico(ids.st) === I.star, 'forma com o desenho dela (estrela)');
  conf(await ico(ids.im) === I.img, 'imagem com o ícone de imagem');
  conf(await p.locator(`#layers .lgroup[data-gid="${ids.fr}"] .gic`).evaluate(e => e.innerHTML) === I.fv, 'frame com layout em coluna = ícone da coluna');
  conf(await p.locator(`#layers .lgroup[data-gid="${ids.gr}"] .gic`).evaluate(e => e.innerHTML) === I.g, 'grupo sem layout = quadrado tracejado');
  const ml = async id => (await cell(id).boundingBox()).x;
  conf(await ml(ids.a) > (await p.locator(`#layers .lgroup[data-gid="${ids.fr}"]`).boundingBox()).x + 8, 'item do frame recuado');
  conf(await p.locator('#layers .icon-btn.ud:visible').count() === 0, 'sem subir/descer na lista');
  // cadeado e olho só no hover
  const vis = id => cell(id).locator('.acts .icon-btn:visible').count();
  await p.mouse.move(5, 5);
  conf(await vis(ids.a) === 0, 'sem o mouse em cima: nem cadeado nem olho');
  await cell(ids.a).hover();
  conf(await vis(ids.a) === 2, 'mouse em cima: cadeado e olho');
  await p.mouse.move(5, 5);
  conf(await cell(ids.ci).locator('.acts .icon-btn.on:visible').count() === 1, 'oculta: o olho fechado fica à vista');
  // olho pelo clique
  await cell(ids.st).hover(); await cell(ids.st).locator('.acts .icon-btn[aria-label^="Ocultar"]').click(); await p.waitForTimeout(150);
  conf(await p.evaluate(id => !S.layers.find(l => l.id === id).visible, ids.st), 'olho oculta a camada');
  // seta recolhe
  await p.locator(`#layers .lgroup[data-gid="${ids.fr}"] .tl-chev`).click(); await p.waitForTimeout(200);
  conf(await cell(ids.a).count() === 0, 'a seta recolhe o frame');
  await b.close();
  console.log(falhas ? `${falhas} FALHA(S)` : 'tudo certo');
  process.exit(falhas ? 1 : 0);
})();
