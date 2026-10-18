// Teste no navegador: menus e janelinhas abrem e fecham com movimento (pedido do usuário: "hoje tá meio seco",
// "deveria ser um smart animate"). O painel nasce da caixa de quem o abriu (campo, botão, ponto do clique) e cresce
// até o tamanho dele; ao fechar encolhe para quem fechou (o item clicado) ou de volta para quem abriu.
// Rodar: node testes/dropdown-animado.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
const perto = (a, b, t = 1.5) => Math.abs(a - b) <= t;

(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:1000 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  // percorre a animação na mão (currentTime), então não depende do relógio nem da aba estar à vista
  const olhar = (sel, from) => p.evaluate(([s, f]) => {
    const el = document.querySelector(s);
    if (!el) return { erro:'sem elemento ' + s };
    const a = el.getAnimations().find(x => /pop(In|Out)/.test(x.animationName));
    if (!a) return { erro:'sem animação' };
    a.pause();
    const dur = a.effect.getTiming().duration, xs = [];
    for (const u of [0, .5, 1]) { a.currentTime = dur * u; const c = getComputedStyle(el); xs.push({ u, clip:c.clipPath, op:+(+c.opacity).toFixed(2) }); }
    a.play();
    const num = k => parseFloat(el.style.getPropertyValue(k)) || 0;
    const r = el.getBoundingClientRect();
    const o = { nome:a.animationName, dur, classe:el.className, xs,
      caixa:{ t:num('--pop-t'), rr:num('--pop-rr'), b:num('--pop-b'), l:num('--pop-l') },
      pop:{ top:r.top, left:r.left, w:r.width, h:r.height } };
    if (f) { // a caixa que o painel deveria ter no começo, calculada do elemento de origem
      const q = document.querySelector(f).getBoundingClientRect();
      const lim = (v, max) => Math.max(0, Math.min(v, Math.max(0, max)));
      const t = lim(q.top - r.top, r.height - 2), bb = lim(r.bottom - q.bottom, r.height - 2 - t);
      const l = lim(q.left - r.left, r.width - 2), rr = lim(r.right - q.right, r.width - 2 - l);
      o.esperado = { t, rr, b:bb, l };
    }
    return o;
  }, [sel, from || null]);
  // quanto ainda falta aparecer, do lado de cima ou do de baixo (em % do painel)
  const resto = (clip, up) => {
    if (clip === 'none') return 0;
    const m = clip.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/);
    if (!m) return null;
    return +(up ? m[1] : m[3]);
  };

  // 1) lista própria do select: nasce da caixa do campo
  await p.locator('#fps').click(); await p.waitForTimeout(40);
  let a = await olhar('.sel-pop', '#fps');
  conf(a.nome === 'popIn', 'select: abre com popIn ' + JSON.stringify(a.nome || a.erro));
  conf(a.esperado && perto(a.caixa.t, a.esperado.t) && perto(a.caixa.b, a.esperado.b) &&
       perto(a.caixa.l, a.esperado.l) && perto(a.caixa.rr, a.esperado.rr),
    'select: começa na caixa do campo ' + JSON.stringify([a.caixa, a.esperado]));
  let r = a.xs ? a.xs.map(x => resto(x.clip, false)) : [];
  conf(r[0] > a.pop.h * .5 && r[1] > 2 && r[1] < r[0] && r[2] === 0, 'select: cresce até o tamanho todo ' + JSON.stringify(r));
  conf(a.xs[0].op < .2 && a.xs[2].op === 1, 'select: aparece enquanto cresce');

  // 2) clicar numa opção encolhe o painel para ela
  const op = p.locator('.sel-pop button').nth(3);
  const ob = await op.boundingBox();
  await op.click(); await p.waitForTimeout(20);
  let f = await olhar('.sel-pop.pop-out');
  conf(f.nome === 'popOut', 'select: fecha com popOut ' + JSON.stringify(f.nome || f.erro));
  conf(perto(f.caixa.t, ob.y - f.pop.top, 2) && perto(f.caixa.b, f.pop.top + f.pop.h - (ob.y + ob.height), 2),
    'select: encolhe para a opção clicada ' + JSON.stringify([f.caixa.t, f.caixa.b, Math.round(ob.y - f.pop.top)]));
  await p.waitForTimeout(400);
  conf(await p.locator('.sel-pop').count() === 0, 'select: sai do DOM depois da animação');

  // 3) menu do botão direito: nasce do ponto do clique
  const cvb = await p.locator('#cv').boundingBox();
  await p.locator('#cv').click({ button:'right', position:{ x:120, y:80 } });
  await p.waitForTimeout(40);
  a = await olhar('.ctx');
  const py = cvb.y + 80;
  conf(a.nome === 'popIn' && perto(a.caixa.t, Math.max(0, py - a.pop.top), 3) && a.caixa.b > a.pop.h * .5,
    'menu do botão direito: nasce do ponto do clique ' + JSON.stringify([a.caixa.t, Math.round(py - a.pop.top)]));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // 4) menu que não cabe embaixo abre para cima, a partir do botão
  await p.evaluate(() => { const k = ADD_KINDS.find(k => k.id === 'title'); const L = addLayer(k.mk(S.brand, S.brand.fonts)); select(L.id); renderProps(); });
  await p.evaluate(() => document.querySelectorAll('#props .tabs button').forEach(t => { if (/Conte/.test(t.textContent)) t.click(); }));
  await p.waitForTimeout(300);
  await p.locator('.blendbtn').first().click(); await p.waitForTimeout(40);
  a = await olhar('.ctx.blendmenu', '.blendbtn');
  conf(/pop-up/.test(a.classe || '') && a.nome === 'popInUp', 'mesclagem: abre para cima ' + JSON.stringify([a.nome, a.classe]));
  conf(a.esperado && perto(a.caixa.t, a.esperado.t, 2) && perto(a.caixa.b, a.esperado.b, 2),
    'mesclagem: começa na caixa do botão ' + JSON.stringify([a.caixa, a.esperado]));
  r = a.xs ? a.xs.map(x => resto(x.clip, true)) : [];
  conf(r[0] > a.pop.h * .5 && r[2] === 0, 'mesclagem: desdobra de baixo para cima ' + JSON.stringify(r));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  conf(await p.locator('.ctx').count() === 0, 'mesclagem: sai do DOM');

  // 5) seção do painel (o "dropdown" da coluna): dá para ver fechando e abrindo, e o que está embaixo desliza
  const secState = clicar => p.evaluate(async cl => {
    const h = [...document.querySelectorAll('#props h3.fold-h')].find(x => /Tipografia/.test(x.textContent));
    if (!h) return { erro:'sem a seção Tipografia' };
    const sec = h.closest('section.sec');
    const abaixo = () => { let n = h.nextElementSibling; while (n && n.tagName !== 'H3') n = n.nextElementSibling; return n; }; // o próximo título, que anda quando este abre ou fecha
    const y0 = abaixo().getBoundingClientRect().top;
    const campo = () => [...sec.children].find(n => !n.classList.contains('folded') && !n.hidden && n.previousElementSibling === h);
    const antes = campo();
    if (cl) h.click();
    const alvo = antes || campo();                                // ao abrir, o campo só existe depois do clique
    const sumindo = alvo ? alvo.getAnimations().length : 0;       // o conteúdo saindo/entrando
    const parado = Math.abs(abaixo().getBoundingClientRect().top - y0) < 2; // nada pula no primeiro quadro
    // espera o deslize do que está embaixo (no fechar ele só começa quando o conteúdo acaba de sumir)
    const a = await new Promise(res => { const t0 = performance.now(); const ver = () => {
      const x = abaixo().getAnimations()[0];
      if (x || performance.now() - t0 > 1500) return res(x || null);
      requestAnimationFrame(ver); }; ver(); });
    let meio = null, dur = null, desloc = null;
    if (a) {
      dur = a.effect.getTiming().duration;
      desloc = a.effect.getKeyframes().map(k => k.transform).join(' → ');
      a.pause(); a.currentTime = dur * .5; meio = abaixo().getBoundingClientRect().top;
      a.finish();
    }
    document.querySelectorAll('#props *').forEach(n => n.getAnimations().forEach(x => x.finish()));
    return { y0, sumindo, parado, meio, dur, desloc, fim:abaixo().getBoundingClientRect().top };
  }, clicar);

  let s5 = await secState(true); // fechar
  conf(!s5.erro && s5.sumindo > 0, 'seção: ao fechar, o conteúdo some à vista ' + JSON.stringify(s5.erro || s5.sumindo));
  conf(s5.parado, 'seção: nada pula no primeiro quadro do fechar');
  conf(s5.meio != null && s5.fim < s5.y0 - 20 && s5.meio > s5.fim + 10 && s5.meio < s5.y0 - 10,
    'seção: o que está embaixo sobe deslizando ' + JSON.stringify([s5.y0, s5.meio, s5.fim].map(Math.round)) + ' ' + s5.desloc);
  await p.waitForTimeout(150);

  s5 = await secState(true); // abrir
  conf(s5.sumindo > 0, 'seção: ao abrir, o conteúdo entra junto ' + JSON.stringify(s5.sumindo));
  conf(s5.meio != null && s5.fim > s5.y0 + 20 && s5.meio > s5.y0 + 10 && s5.meio < s5.fim - 10,
    'seção: o que está embaixo desce deslizando ' + JSON.stringify([s5.y0, s5.meio, s5.fim].map(Math.round)));
  const preso = await p.evaluate(() => {
    const n = [...document.querySelectorAll('#props *')].filter(x => x.style.transform || x.style.opacity || x.style.height || x.style.overflow);
    return n.map(x => x.className + ':' + x.style.cssText.slice(0, 40));
  });
  conf(!preso.length, 'seção: não deixa estilo preso ' + JSON.stringify(preso.slice(0, 3)));

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
