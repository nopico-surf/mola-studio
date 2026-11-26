// Teste no navegador: Transformar (pedido do usuário: presets para formas e textos se transformarem entre si: um quadrado vira
// um texto, um texto vira outro texto). Um quadrado verde e um texto branco na tela juntos: escolhe os dois com cliques no palco
// (clique + Shift + clique), botão direito → "Transformar um no outro". Confere que o quadrado passa a terminar onde o texto
// começa e o texto ganha B.xin, o painel do texto mostra "Transformar a partir do anterior" com as variações, cada variação
// mistura no meio da janela e termina só no texto (e começa só no quadrado), a timeline marca a janela, Ctrl+Z desfaz, texto →
// texto (Letra a letra) e "Transformar a partir de" num elemento sem nada colado.
// Rodar: node testes/transformar.js (prints na pasta temporária, mola-testes/transformar-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const near = (a, b, e = .02) => Math.abs(a - b) <= e;
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); });
  p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); const bg = S.layers[0]; bg.mode = 'solid'; bg.c1 = '#000000'; bg.grain = 0; S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 4; S.slides = 1; S.margin = { on:false, top:0, right:0, bottom:0, left:0 }; T = 1; RT.selected = null; RT.picks = new Set(); changed({ layers:true, props:true }); renderTimeline(); });

  const ids = await p.evaluate(() => {
    const sq = mkShape({ name:'Quadrado', kind:'rect', size:.3, mh:.3, radius:0, mode:'solid', c1:'#00ff00', c2:'#00ff00', c3:'#00ff00', c4:'#00ff00', in:'cut', out:'cut', inDur:0, outDur:0, idle:'none', x:.5, y:.3 });
    const tx = mkText('title', { name:'Texto', text:'OLÁ', size:150, color:'#ffffff', in:'cut', out:'cut', inDur:0, outDur:0, idle:'none', x:.5, y:.72 });
    for (const L of [sq, tx]) { L.start = 0; L.end = 4; S.layers.push(L); }
    changed({ layers:true }); renderTimeline(); needs = true; return { a:sq.id, b:tx.id };
  });
  await p.waitForTimeout(400);
  // centro de uma camada na tela (px da página)
  const at = id => p.evaluate(id => { const L = S.layers.find(l => l.id === id), b = L._bounds, r = $('#cv').getBoundingClientRect(); return { x:r.left + (b.x + b.w / 2) / FW() * r.width, y:r.top + (b.y + b.h / 2) / H() * r.height }; }, id);
  const A0 = await at(ids.a), B0 = await at(ids.b);
  await p.mouse.click(A0.x, A0.y);
  await p.keyboard.down('Shift'); await p.mouse.click(B0.x, B0.y); await p.keyboard.up('Shift');
  ok(await p.evaluate(() => pickedLayers().length) === 2, 'clique + Shift + clique escolhe o quadrado e o texto');
  await p.mouse.click(B0.x, B0.y, { button:'right' }); await p.waitForTimeout(200);
  const item = p.locator('.ctx:not(.pop-out) >> text=Transformar um no outro');
  ok(await item.count() === 1, 'o botão direito oferece "Transformar um no outro"');
  await item.first().click(); await p.waitForTimeout(300);
  const st = await p.evaluate(({ a, b }) => { const A = S.layers.find(l => l.id === a), B = S.layers.find(l => l.id === b); return { ae:A.end, bs:B.start, be:B.end, xin:B.xin && { ...B.xin } }; }, ids);
  ok(near(st.ae, 2, .001) && near(st.bs, 2, .001) && st.xin && st.xin.k === 'morph', 'o quadrado termina onde o texto começa (2 s) e o texto ganha a transformação', st);
  const pr = await p.evaluate(() => { const q = [...xfPairs(true).inn.values()][0]; return q && { a:q.A.name, b:q.B.name, t0:q.t0, t1:q.t1 }; });
  ok(pr && pr.a === 'Quadrado' && pr.b === 'Texto' && near(pr.t0, 1.65, .001) && near(pr.t1, 2.35, .001), 'o par se forma com a janela no meio da emenda', pr);
  const secs = await p.evaluate(() => [...document.querySelectorAll('#props section h3')].map(h => h.firstChild && h.firstChild.textContent));
  ok(secs.includes('Transformar a partir do anterior'), 'o painel do texto mostra "Transformar a partir do anterior"', secs);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#props section')].find(s => s.querySelector('h3')?.firstChild?.textContent === 'Transformar a partir do anterior')?.querySelectorAll('.chip').length);
  ok(chips === 1 + MPH_KEYS_N, 'as variações aparecem como chips (Nenhuma + ' + MPH_KEYS_N + ')', chips);
  ok(await p.evaluate(() => [...document.querySelectorAll('#props .chip[aria-pressed="true"]')].some(c => c.textContent === 'Transformar')), '"Transformar" vem marcado');
  const mk = await p.evaluate(({ a, b }) => [a, b].map(id => document.querySelectorAll(`.tl-row[data-id="${id}"] .tl-xf`).length), ids);
  ok(mk[0] === 1 && mk[1] === 1, 'a timeline marca a janela na faixa dos dois', mk);

  // cor média de uma área pequena do quadro: verde do quadrado, branco do texto
  const stats = t => p.evaluate(t => {
    const c = document.createElement('canvas'); c.width = Math.round(W() * .25); c.height = Math.round(H() * .25);
    const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, .25);
    const d = x.getImageData(0, 0, c.width, c.height).data; let g = 0, w = 0, any = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2]; if (gg > 80 && r < 60 && bb < 60) g++; if (r > 150 && gg > 150 && bb > 150) w++; if (r + gg + bb > 60) any++; }
    return { g, w, any };
  }, t);
  const chip = name => p.locator('#props .chip', { hasText:new RegExp('^' + name + '$') }).first().click();
  const before = await stats(1.6), after = await stats(2.4);
  ok(before.g > 50 && before.w === 0, 'antes da janela: só o quadrado', before);
  ok(after.w > 20 && after.g === 0, 'depois da janela: só o texto', after);
  for (const name of ['Transformar', 'Letra a letra', 'Líquido', 'Bloco', 'Mosaico', 'Virar']) {
    if (name !== 'Transformar') await chip(name);
    await p.waitForTimeout(50);
    const k = await p.evaluate(id => S.layers.find(l => l.id === id).xin.k, ids.b);
    const s0 = await stats(1.651), s1 = await stats(2.349), m = await stats(name === 'Virar' ? 1.9 : 2);
    ok(s0.g > 50 && s0.w <= 2, `${name} (${k}): começa no quadrado`, s0);
    ok(s1.w > 20 && s1.g <= 2, `${name}: termina no texto`, s1);
    ok(m.any > 30 && (m.any !== before.any || m.w !== after.w), `${name}: no meio aparece a mistura`, m);
    await p.evaluate(() => { pause(); T = 2; needs = true; }); await p.waitForTimeout(250);
    await p.screenshot({ path:path.join(outDir, `transformar-${k}.png`), clip:await p.evaluate(() => { const r = $('#cv').getBoundingClientRect(); return { x:r.left, y:r.top, width:r.width, height:r.height }; }) });
  }
  // Ctrl+Z volta para a variação anterior; desfazer até antes de ligar devolve os tempos
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.mouse.click(5, 940);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok(await p.evaluate(id => S.layers.find(l => l.id === id).xin.k, ids.b) === 'tiles', 'Ctrl+Z volta à variação anterior (Mosaico)');

  // texto → texto: Letra a letra, as letras iguais deslizam
  const t2 = await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg');
    const a = mkText('title', { name:'T1', text:'MOLA', size:140, color:'#ffffff', in:'cut', out:'cut', inDur:0, outDur:0, idle:'none', x:.5, y:.3 });
    const b = mkText('title', { name:'T2', text:'ALMOÇO', size:140, color:'#ffffff', in:'cut', out:'cut', inDur:0, outDur:0, idle:'none', x:.5, y:.7 });
    a.start = 0; a.end = 2; b.start = 2; b.end = 4; b.xin = { k:'letters', d:1 }; S.layers.push(a, b); changed({ layers:true }); renderTimeline();
    renderFrame(document.createElement('canvas').getContext('2d'), 2, .1);
    const G = { M:new DOMMatrix([1, 0, 0, 1, 0, 0]) };
    const ua = mphGlyphs(G, a), ub = mphGlyphs(G, b), P = mphPairs(ua, ub, mphB(G, a, {}), mphB(G, b, {}));
    return { na:ua && ua.length, nb:ub && ub.length, moved:P.filter(q => q.s && q.d && q.s.ch === q.d.ch).length, fades:P.filter(q => !q.s || !q.d).length };
  });
  ok(t2.na === 4 && t2.nb === 6, 'as letras dos dois textos são medidas (4 e 6)', t2);
  ok(t2.moved === 2 && t2.fades === 2, 'M e O casam (deslizam), L e A trocam em ordem e 2 letras surgem', t2);
  const tm = await stats(2);
  ok(tm.w > 10, 'texto → texto: no meio as letras aparecem', tm);
  await p.evaluate(() => { pause(); T = 2.1; needs = true; }); await p.waitForTimeout(250);
  await p.screenshot({ path:path.join(outDir, 'transformar-texto-texto.png'), clip:await p.evaluate(() => { const r = $('#cv').getBoundingClientRect(); return { x:r.left, y:r.top, width:r.width, height:r.height }; }) });

  // sem nada colado: "Transformar a partir de" lista os outros e liga com um clique
  const iD = await p.evaluate(() => { const L = S.layers.find(l => l.name === 'T2'); delete L.xin; L.start = 0; S.layers.find(l => l.name === 'T1').end = 4; changed({ layers:true }); select(L.id, true); propTab = 'anim'; renderProps(); return L.id; });
  const sec = p.locator('#props section', { has:p.locator('h3', { hasText:'Transformar a partir de' }) });
  ok(await sec.count() === 1, 'sem nada colado o texto mostra "Transformar a partir de"');
  const h3 = sec.locator('h3').first(); if (await sec.locator('.chip').first().isHidden()) { await h3.click(); await p.waitForTimeout(400); }
  await sec.locator('.chip', { hasText:'T1' }).first().click(); await p.waitForTimeout(200);
  const l2 = await p.evaluate(id => { const B = S.layers.find(l => l.id === id), A = S.layers.find(l => l.name === 'T1'); return { k:B.xin && B.xin.k, ae:A.end, bs:B.start }; }, iD);
  ok(l2.k === 'morph' && near(l2.ae, l2.bs, .001) && l2.bs > .5, 'clicar em T1 liga a transformação na emenda', l2);

  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); console.log('prints em', outDir);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
const MPH_KEYS_N = 6;
