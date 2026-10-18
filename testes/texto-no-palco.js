// Teste no navegador: edição do texto direto na tela (pedido do usuário: "o texto possa ser editado direto na tela" e, na legenda,
// "basta selecionar o trecho, sem precisar ir pro lado direito"). Confere, com cliques e teclas de verdade:
// - clique duplo num texto do palco abre o campo (.sedit) em cima do texto, com a mesma fonte e tamanho na tela;
// - digitar troca o texto da camada na hora (o canvas é quem desenha: o campo é transparente);
// - Esc volta ao texto de antes; clicar fora confirma e fecha;
// - botão (cta) também abre na tela e Enter conclui;
// - legenda: clicar num trecho na timeline abre o campo com as palavras daquele trecho e corrigir grava nas palavras.
// Rodar: node testes/texto-no-palco.js (prints em mola-testes/texto-no-palco-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive: true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel: 'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  // um título só no arquivo
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; setDuration(8); T = 0;
    changed({ layers: true, props: true });
    addLayer(mkComp('title'));
    const L = S.layers.find(l => l.type === 'text');
    L.text = 'Oferta de hoje'; L.in = 'cut'; L.out = 'cut'; L.start = 0; L.end = 8;
    ensureBounds([L]); changed({ layers: true, props: true });
  });
  await p.waitForTimeout(400);

  const mid = sel => p.evaluate(sel => {
    const L = S.layers.find(l => l.type === sel), r = cv.getBoundingClientRect(), s = r.width / FW(), b = L._bounds;
    return { x: r.left + (b.x + b.w / 2) * s, y: r.top + (b.y + b.h / 2) * s };
  }, sel);
  let c = await mid('text');
  await p.mouse.dblclick(c.x, c.y);
  await p.waitForTimeout(300);
  const st = () => p.evaluate(() => {
    const el = document.querySelector('.sedit'); if (!el) return null;
    const r = el.getBoundingClientRect(), L = S.layers.find(l => l.type === 'text' || l.type === 'cta'), cs = getComputedStyle(el);
    return { txt: el.innerText, cx: r.left + r.width / 2, cy: r.top + r.height / 2, fs: parseFloat(cs.fontSize),
      focus: document.activeElement === el, color: cs.webkitTextFillColor || cs.color, layer: L.text };
  });
  const s1 = await st();
  ok(!!s1, 'clique duplo no texto abre o campo no palco', s1);
  if (s1) {
    const far = Math.hypot(s1.cx - c.x, s1.cy - c.y);
    ok(far < 14, 'o campo fica em cima do texto (centro a menos de 14 px)', { far, campo: [s1.cx, s1.cy], texto: [c.x, c.y] });
    const px = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'), r = cv.getBoundingClientRect(); return L.size * (L._bounds.k || 1) * r.width / FW(); });
    ok(Math.abs(s1.fs - px) < 1.5, 'o tamanho da letra no campo é o do texto na tela', { campo: s1.fs, palco: px });
    ok(/rgba\(0, 0, 0, 0\)|transparent/.test(s1.color), 'a letra do campo é transparente (quem desenha é o canvas)', s1.color);
    ok(s1.focus && s1.txt === 'Oferta de hoje', 'o campo abre com o texto da camada e o foco nele', s1);
  }
  await p.screenshot({ path: path.join(outDir, 'texto-no-palco-1.png') });

  // digitar troca o texto na hora (o texto todo já vem selecionado)
  await p.keyboard.type('Promo nova');
  await p.waitForTimeout(250);
  const s2 = await st();
  ok(s2 && s2.layer === 'Promo nova', 'digitar no palco já troca o texto da camada', s2 && s2.layer);
  await p.screenshot({ path: path.join(outDir, 'texto-no-palco-2.png') });

  // Esc volta ao de antes e fecha
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => ({ el: !!document.querySelector('.sedit'), txt: S.layers.find(l => l.type === 'text').text }));
  ok(!r3.el && r3.txt === 'Oferta de hoje', 'Esc fecha e volta ao texto de antes', r3);

  // abrir de novo, digitar e clicar fora: confirma
  c = await mid('text');
  await p.mouse.dblclick(c.x, c.y);
  await p.waitForTimeout(250);
  await p.keyboard.type('So hoje');
  await p.waitForTimeout(200);
  const grey = await p.evaluate(() => { const r = document.getElementById('stageBox').getBoundingClientRect(); return { x: r.left + 8, y: r.top + 8 }; });
  await p.mouse.click(grey.x, grey.y);
  await p.waitForTimeout(400);
  const r4 = await p.evaluate(() => ({ el: !!document.querySelector('.sedit'), txt: S.layers.find(l => l.type === 'text').text }));
  ok(!r4.el && r4.txt === 'So hoje', 'clicar fora confirma o texto digitado', r4);

  // palavras selecionadas: Ctrl+B e o peso do painel valem só para elas (pedido do usuário)
  await p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'text');
    L.text = 'tres palavras aqui'; L.runs = null; L.weight = 500; ensureBounds([L]); changed({ layers: true, props: true });
  });
  await p.waitForTimeout(300);
  c = await mid('text');
  await p.mouse.dblclick(c.x, c.y);
  await p.waitForTimeout(300);
  // clique duplo dentro do campo escolhe a palavra do meio
  const w2 = await p.evaluate(() => {
    const el = document.querySelector('.sedit'), r = document.createRange(), t = el.firstChild;
    r.setStart(t, 6); r.setEnd(t, 14); const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await p.mouse.dblclick(w2.x, w2.y);
  await p.waitForTimeout(250);
  const selTxt = await p.evaluate(() => String(getSelection()));
  ok(selTxt.trim() === 'palavras', 'clique duplo no campo escolhe a palavra', selTxt);
  await p.keyboard.press('Control+b');
  await p.waitForTimeout(300);
  const neg = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); return { runs: (L.runs || []).map(r => [r.t, r.w || null]), weight: L.weight, aberto: !!document.querySelector('.sedit') }; });
  ok(neg.weight === 500 && neg.runs.some(r => r[0].trim() === 'palavras' && r[1] === 700) && neg.runs.length === 3,
    'Ctrl+B deixa só a palavra escolhida em negrito (L.runs), sem mexer no peso da camada', neg);
  ok(neg.aberto, 'a edição continua aberta depois de mudar a propriedade do trecho');
  await p.screenshot({ path: path.join(outDir, 'texto-no-palco-5.png') });

  // o peso do painel (com o trecho ainda escolhido) também vale só para o trecho e não fecha a edição
  const wid = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); const el = document.getElementById('f-' + L.id + '-weight'); return el ? '#f-' + L.id + '-weight' : null; });
  ok(!!wid, 'o painel tem o peso da fonte à mão', wid);
  if (wid) {
    const vals = await p.evaluate(sel => [...document.querySelector(sel).options].map(o => o.value), wid);
    const alvo = vals.includes('300') ? '300' : vals.find(v => v !== '500');
    await p.selectOption(wid, alvo);
    await p.waitForTimeout(400);
    const r6 = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); return { runs: (L.runs || []).map(r => [r.t, r.w || null]), weight: L.weight, aberto: !!document.querySelector('.sedit') }; });
    ok(r6.weight === 500 && r6.runs.some(r => r[0].trim() === 'palavras' && String(r[1]) === alvo),
      'o Peso do painel vale só para o trecho escolhido no palco', { r6, alvo });
    ok(r6.aberto, 'mexer no painel não fecha a edição no palco');
  }
  await p.evaluate(() => seditClose());
  await p.waitForTimeout(200);

  // botão: clique duplo abre na tela, em uma linha
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); changed({ layers: true, props: true });
    addLayer(mkComp('cta'));
    const L = S.layers.find(l => l.type === 'cta'); L.in = 'cut'; L.out = 'cut'; L.start = 0; L.end = 8;
    ensureBounds([L]); changed({ layers: true, props: true });
  });
  await p.waitForTimeout(400);
  const cb = await mid('cta');
  await p.mouse.dblclick(cb.x, cb.y);
  await p.waitForTimeout(300);
  const s5 = await p.evaluate(() => { const el = document.querySelector('.sedit'); return el ? { txt: el.innerText, one: el.classList.contains('one') } : null; });
  ok(s5 && s5.one, 'botão também edita na tela, em uma linha', s5);
  await p.keyboard.type('Quero agora');
  await p.waitForTimeout(200);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);
  const r5 = await p.evaluate(() => ({ el: !!document.querySelector('.sedit'), txt: S.layers.find(l => l.type === 'cta').text }));
  ok(!r5.el && r5.txt === 'Quero agora', 'Enter conclui a edição do botão', r5);
  await p.screenshot({ path: path.join(outDir, 'texto-no-palco-3.png') });

  // legenda: clicar num trecho na timeline abre a edição na tela
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); setDuration(12); T = 0; changed({ layers: true, props: true });
    const txt = 'Oi gente. Hoje tem novidade. Clica no link agora';
    let t = .5;
    const words = txt.split(' ').map(w => { const d = .3, o = { w, s: +t.toFixed(3), e: +(t + d).toFixed(3), c: .95 }; t += d + (/[.]$/.test(w) ? 1.2 : .05); return o; });
    capCreate(words);
    const L = S.layers.find(l => l.capt); L.capWords = 3; RT.layout.clear();
    changed({ layers: true, props: true }); renderTimeline(); renderProps();
  });
  await p.waitForTimeout(500);
  const cb1 = await p.evaluate(() => {
    const L = S.layers.find(l => l.capt), el = document.querySelectorAll('.tl-row[data-id="' + L.id + '"] .tl-cb')[1];
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  ok(!!cb1, 'a barra da legenda tem um pedaço por trecho', cb1);
  if (cb1) {
    await p.mouse.click(cb1.x, cb1.y);
    await p.waitForTimeout(500);
    const s6 = await p.evaluate(() => {
      const el = document.querySelector('.sedit'), L = S.layers.find(l => l.capt);
      return { txt: el ? el.innerText : null, bl: capBlocks(L).map(b => b.text.replace('\n', ' ')), k: capSelK(L) };
    });
    const w0 = s6.txt ? s6.txt.split(' ')[0].replace(/[.,]/g, '').toLowerCase() : '';
    ok(!!s6.txt && !!s6.bl[1] && s6.bl[1].toLowerCase().includes(w0), 'clicar no trecho abre a edição na tela com as palavras dele', s6);
    await p.screenshot({ path: path.join(outDir, 'texto-no-palco-4.png') });
    // corrigir o trecho: o que foi digitado entra nas palavras da legenda
    await p.keyboard.press('Control+a');
    await p.keyboard.type('Hoje tem promocao');
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(600);
    const s7 = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { el: !!document.querySelector('.sedit'), ws: L.capt.words.map(w => w.w).join(' ') }; });
    ok(!s7.el && s7.ws.includes('promocao'), 'o que foi digitado entra nas palavras da legenda', s7);
  }

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\ntudo ok');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
