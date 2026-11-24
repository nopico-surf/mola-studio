// Teste no navegador: Texturas (granulado e outras) em todos os elementos.
// Pelo painel, com cliques de verdade: Efeitos "+" → Textura no texto e na forma, escolher o tipo na grade (a janelinha marca o
// escolhido e o Movimento acompanha), olho esconde e devolve. Pixels: a textura muda a camada e não mexe fora dela, o mesmo quadro
// sai igual duas vezes, a parada fica igual de um quadro para o outro e a que mexe não; todos os tipos desenham; o fundo tem a
// seção Textura; arquivo antigo (só grain) continua com o granulado fino. Rodar: node testes/texturas.js (print em mola-testes/texturas.png)
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(require('os').tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); const bg = S.layers[0]; bg.mode = 'solid'; bg.c1 = '#203040'; bg.grain = 0;
    S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.slides = 1; S.duration = 4; T = 0; RT.selected = null; RT.picks = new Set();
    // quadro pequeno, fora do palco, para ler os pixels (nunca getImageData no palco)
    window.__px = (t, rs = .4) => { const c = document.createElement('canvas'); c.width = Math.round(W() * rs); c.height = Math.round(H() * rs); renderFrame(c.getContext('2d'), t, rs, true); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
    window.__diff = (a, b2) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b2[i]) > 2) n++; return n; };
    changed({ layers:true, props:true });
  });
  const add = async word => { await p.evaluate(w => [...document.querySelectorAll('#adds button.add')].find(x => (x.title || x.textContent || '').toLowerCase().includes(w)).click(), word); await p.waitForTimeout(300); };
  // efeito Textura pelo "+" de Efeitos, na aba Conteúdo e estilo
  const addTex = async () => {
    const tab = p.locator('#props button', { hasText:'Conteúdo e estilo' }); if (await tab.count()) { await tab.first().click(); await p.waitForTimeout(150); }
    const plus = p.locator('#props button[aria-label="Acrescentar efeito"]'); await plus.scrollIntoViewIfNeeded(); await plus.click(); await p.waitForTimeout(250);
    await p.locator('.ctx.nfmenu:not(.pop-out) button', { hasText:'Textura' }).click(); await p.waitForTimeout(250);
  };
  const openTex = async () => { const d = p.locator('#props [data-fx="grain"] button[aria-label="Detalhes: textura"]'); await d.scrollIntoViewIfNeeded(); await d.click(); await p.waitForTimeout(400); };
  const pickKind = async name => { await p.locator('.pop .tex-k', { hasText:name }).first().click(); await p.waitForTimeout(400); };

  // ---- texto ----
  await add('título');
  await p.evaluate(() => { const L = selL(); L.text = 'TEXTURA'; L.size = 200; L.color = '#c0c0c0'; L.idle = 'none'; L.in = 'fade'; L.start = 0; L.inDur = .3; L.end = 4; changed({ props:true }); renderProps(); });
  const base = await p.evaluate(() => Array.from(__px(1)));
  await addTex();
  const r1 = await p.evaluate(() => { const L = selL(); return { grain:L.grain, k:L.grainK, row:!!document.querySelector('#props [data-fx="grain"]'), val:document.querySelector('#props [data-fx="grain"] small')?.textContent }; });
  ok(r1.row && r1.grain > 0 && r1.k === 'film', 'Efeitos "+" → Textura liga no texto (Filme)', r1);
  await openTex();
  ok(await p.locator('.pop .tex-k').count() === 11, 'a janelinha mostra os 11 tipos com amostra', await p.locator('.pop .tex-k').count());
  await pickKind('Papel');
  const r2 = await p.evaluate(() => { const L = selL(); return { k:L.grainK, on:document.querySelector('.pop .tex-k[aria-pressed="true"]')?.textContent, mov:[...document.querySelectorAll('.pop .segs button[aria-pressed="true"]')].map(x => x.textContent) }; });
  ok(r2.k === 'paper' && r2.on === 'Papel', 'clicar em Papel escolhe e a janelinha marca o escolhido', r2);
  ok(r2.mov.includes('Parada'), 'Papel fica parado de fábrica (Movimento acompanha o tipo)', r2.mov);
  // força pelo campo digitável da janelinha
  const f = p.locator('.pop input.num[aria-label="Força (valor)"]'); await f.click(); await f.fill('70'); await f.press('Enter'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => Math.abs(selL().grain - .7) < 1e-6), 'Força 70% pelo campo');
  const r3 = await p.evaluate(base => {
    const a = __px(1), a2 = __px(1), a3 = __px(2), L = selL(), b0 = L._bounds;
    // fora da caixa do texto nada muda (a textura só pega os pixels da camada)
    const rs = .4, w = Math.round(W() * rs); let out = 0, inn = 0;
    for (let i = 0; i < a.length; i += 4) {
      const px = (i / 4) % w, py = Math.floor(i / 4 / w), x = px / rs, y = py / rs, d = Math.abs(a[i] - base[i]) + Math.abs(a[i + 1] - base[i + 1]) + Math.abs(a[i + 2] - base[i + 2]);
      const inside = x > b0.x - 4 && x < b0.x + b0.w + 4 && y > b0.y - 4 && y < b0.y + b0.h + 4;
      if (d > 6) { if (inside) inn++; else out++; }
    }
    return { inn, out, same:__diff(a, a2), still:__diff(a, a3), moves:layerMoves(L, phase(L, 2)) };
  }, base);
  ok(r3.inn > 200, 'a textura muda o texto', r3);
  ok(r3.out === 0, 'fora do texto nada muda', r3);
  ok(r3.same === 0, 'o mesmo quadro sai igual duas vezes (determinístico)', r3);
  ok(r3.still === 0 && !r3.moves, 'textura parada: igual de um quadro para o outro e o palco não redesenha à toa', r3);
  await pickKind('Filme');
  const r4 = await p.evaluate(() => { const L = selL(), a = __px(1), b2 = __px(1 + 1 / fps()); return { k:L.grainK, d:__diff(a, b2), moves:layerMoves(L, phase(L, 2)), mov:[...document.querySelectorAll('.pop .segs button[aria-pressed="true"]')].map(x => x.textContent) }; });
  ok(r4.k === 'film' && r4.d > 100 && r4.moves && r4.mov.includes('Mexe'), 'Filme mexe a cada quadro', r4);
  await p.locator('.pop .segs button', { hasText:'Parada' }).click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const L = selL(); return L.grainAnim === false && __diff(__px(1), __px(1 + 1 / fps())) === 0; }), '"Parada" deixa o Filme parado');
  // todos os tipos desenham e mudam o texto
  const r5 = await p.evaluate(() => { const L = selL(), off = { ...L }, bad = []; L.grain = 0; const a0 = __px(1); L.grain = .7; for (const k of Object.keys(TEX_KINDS)) { L.grainK = k; if (__diff(a0, __px(1)) < 50) bad.push(k); } Object.assign(L, off); return bad; });
  ok(r5.length === 0, 'os 11 tipos desenham no texto', r5);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // olho esconde e devolve
  const eye = p.locator('#props [data-fx="grain"] .prop-eye'); await eye.click(); await p.waitForTimeout(250);
  const r6 = await p.evaluate(() => ({ g:selL().grain, off:selL().grainOff }));
  await p.locator('#props [data-fx="grain"] .prop-eye').click(); await p.waitForTimeout(250);
  const r6b = await p.evaluate(() => ({ g:selL().grain, off:selL().grainOff }));
  ok(r6.g === 0 && Math.abs(r6.off - .7) < 1e-6 && Math.abs(r6b.g - .7) < 1e-6 && r6b.off === undefined, 'olho esconde a textura e devolve com a mesma força', [r6, r6b]);

  // ---- forma ----
  await add('forma');
  await p.evaluate(() => { const L = selL(); L.idle = 'none'; changed({ props:true }); renderProps(); });
  const sb = await p.evaluate(() => Array.from(__px(1)));
  await addTex();
  const r7 = await p.evaluate(sb => { const L = selL(); return { k:L.grainK, g:L.grain, d:__diff(sb, __px(1)) }; }, sb);
  ok(r7.g > 0 && r7.d > 200, 'Textura na forma pelo painel', r7);
  const fillHas = await p.evaluate(async () => { const s = h('section', { class:'sec' }); fillProps(selL(), s); return [...s.querySelectorAll('label')].map(l => l.textContent).filter(t => /Granulado|Textura/.test(t)); });
  ok(fillHas.length === 0, 'o preenchimento da forma não repete o granulado (fica em Efeitos)', fillHas);
  // arquivo antigo: forma com grain e sem tipo = granulado fino
  ok(await p.evaluate(() => { const L = selL(); delete L.grainK; delete L.grainAnim; L.grain = .2; return texKind(L) === 'fine' && texAnim(L) && __diff(__px(1), __px(1 + 1 / fps())) > 50; }), 'arquivo antigo (só grain) = granulado fino que mexe');

  // ---- fundo, logo, botão, imagem ----
  const r8 = await p.evaluate(async () => {
    const bg = S.layers.find(l => l.type === 'bg'); select(bg.id); renderProps(); await new Promise(r => setTimeout(r, 100));
    const sub = [...document.querySelectorAll('#props h3')].some(x => x.textContent.startsWith('Textura')), grid = !!document.querySelector('#props .tex-grid');
    const a = __px(1); bg.grain = .5; bg.grainK = 'halftone'; const d = __diff(a, __px(1)); bg.grain = 0;
    return { sub, grid, d };
  });
  ok(r8.sub && r8.grid && r8.d > 1000, 'fundo: seção Textura no painel e a retícula aparece', r8);
  ok(await p.evaluate(() => ['logo', 'cta', 'image', 'text', 'shape', 'bg'].every(t => TEX_TYPES.has(t)) && effectRows({ type:'cta', id:'x' }).some(e => e.textContent.includes('Efeitos'))), 'texto, forma, logo, botão, imagem e fundo aceitam textura');

  await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); select(L.id); L.grainK = 'stone'; L.grain = .8; changed({ props:true }); T = 1; needs = true; });
  await p.waitForTimeout(500);
  await p.screenshot({ path:path.join(outDir, 'texturas.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
