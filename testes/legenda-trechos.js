// Teste no navegador: trechos da legenda na timeline (pedido do usuário: a legenda chega cortada, dá para apagar um trecho e
// arrastar a borda para ele ficar mais ou menos tempo na tela). Sem a IA: as palavras entram por capCreate. Confere:
// - um pedaço (.tl-cb) por trecho dentro da barra da legenda;
// - arrastar a borda direita de um trecho (com o mouse) aumenta o tempo dele na tela e o desenho acompanha;
// - borda colada no vizinho anda com ele (o corte entre os dois);
// - arrastar o meio leva o trecho e as palavras dele;
// - clicar num trecho e apertar Delete apaga só ele (palavras e pedaço); Ctrl+Z volta;
// - lixeira na lista do painel apaga o trecho; mudar "Palavras por vez" volta ao corte automático.
// Rodar: node testes/legenda-trechos.js (prints em mola-testes/legenda-trechos-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; setDuration(12); T = 0; changed({ layers:true, props:true });
    // três frases bem separadas (três trechos que não se encostam) e duas emendadas no fim
    const txt = 'Oi gente. Hoje tem novidade. Clica no link agora mesmo';
    let t = .5; const words = txt.split(' ').map(w => { const d = .3, o = { w, s:+t.toFixed(3), e:+(t + d).toFixed(3), c:.95 }; t += d + (/[.]$/.test(w) ? 1.2 : .05); return o; });
    S.layers.find(l => l.type === 'bg'); capCreate(words);
    const L = S.layers.find(l => l.capt); L.capWords = 3; RT.layout.clear(); changed({ layers:true, props:true }); renderTimeline(); renderProps();
  });
  await p.waitForTimeout(300);
  const info = () => p.evaluate(() => { const L = S.layers.find(l => l.capt); return L ? { bl:capBlocks(L).map(b => ({ t:b.text.replace('\n', ' '), s:+b.s.toFixed(2), e:+b.e.toFixed(2) })), dom:document.querySelectorAll('.tl-row[data-id="' + L.id + '"] .tl-cb').length, words:L.capt.words.length, sel:document.querySelectorAll('.tl-cb.on').length } : null; });
  const r0 = await info();
  ok(r0.bl.length >= 3 && r0.dom === r0.bl.length, 'um pedaço por trecho na barra da legenda', r0);
  await p.screenshot({ path:path.join(outDir, 'legenda-trechos-1.png') });

  // posição de cada pedaço na tela
  const box = k => p.evaluate(k => { const L = S.layers.find(l => l.capt), el = document.querySelectorAll('.tl-row[data-id="' + L.id + '"] .tl-cb')[k].getBoundingClientRect(); return { l:el.left, r:el.right, y:el.top + el.height / 2 }; }, k);
  const px2s = await p.evaluate(() => { const g = tlGeom(); return S.duration / g.w; });

  // borda direita do 1º trecho (separado do 2º): +0,5 s
  let bx = await box(0); const e0 = r0.bl[0].e;
  await p.mouse.move(bx.r - 1, bx.y); await p.mouse.down(); await p.mouse.move(bx.r + 10, bx.y, { steps:3 }); await p.mouse.move(bx.r - 1 + .5 / px2s, bx.y, { steps:6 });
  await p.mouse.up(); await p.waitForTimeout(200);
  let r = await info();
  ok(Math.abs(r.bl[0].e - (e0 + .5)) < .08 && Math.abs(r.bl[0].s - r0.bl[0].s) < .01, 'arrastar a borda direita: o trecho fica mais tempo na tela', { antes:r0.bl[0], depois:r.bl[0] });
  const shown = await p.evaluate(t => { const L = S.layers.find(l => l.capt); return capAt(capBlocks(L), t)?.text || null; }, e0 + .3);
  ok(shown && /gente/.test(shown), 'no tempo novo o trecho continua na tela', shown);
  ok(r.sel === 1, 'o trecho arrastado fica marcado', r);

  // borda esquerda do 2º para antes: não passa do fim do 1º
  bx = await box(1);
  await p.mouse.move(bx.l + 1, bx.y); await p.mouse.down(); await p.mouse.move(bx.l - 400, bx.y, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(200);
  r = await info();
  ok(r.bl[1].s >= r.bl[0].e - .01, 'a borda não entra no trecho vizinho', r.bl.slice(0, 2));

  // meio do 1º trecho: volta 0,3 s com as palavras (o 3º está colado no 4º, não tem para onde ir)
  const w0 = await p.evaluate(() => { const L = S.layers.find(l => l.capt), b = capBlocks(L)[0]; return b.ws[0].s; });
  const r1 = await info(); bx = await box(0);
  const mx = (bx.l + bx.r) / 2; await p.mouse.move(mx, bx.y); await p.mouse.down(); await p.mouse.move(mx - 8, bx.y, { steps:2 }); await p.mouse.move(mx - .3 / px2s, bx.y, { steps:6 }); await p.mouse.up(); await p.waitForTimeout(200);
  r = await info();
  const w1 = await p.evaluate(() => { const L = S.layers.find(l => l.capt), b = capBlocks(L)[0]; return b.ws[0].s; });
  ok(Math.abs(r.bl[0].s - r1.bl[0].s + .3) < .08 && Math.abs(w1 - w0 - (r.bl[0].s - r1.bl[0].s)) < .01, 'arrastar o meio leva o trecho e as palavras dele', { antes:r1.bl[0], depois:r.bl[0], w0, w1 });

  // borda colada (3º e 4º emendados): o corte anda e os dois continuam encostados
  const rj = await info();
  if (Math.abs(rj.bl[2].e - rj.bl[3].s) < .01) {
    bx = await box(2);
    await p.mouse.move(bx.r - 1, bx.y); await p.mouse.down(); await p.mouse.move(bx.r - 10, bx.y, { steps:3 }); await p.mouse.move(bx.r - 1 - .2 / px2s, bx.y, { steps:5 }); await p.mouse.up(); await p.waitForTimeout(200);
    r = await info();
    ok(r.bl[2].e < rj.bl[2].e - .1 && Math.abs(r.bl[2].e - r.bl[3].s) < .01, 'borda colada: o corte anda e o vizinho acompanha', { antes:rj.bl.slice(2, 4), depois:r.bl.slice(2, 4) });
  } else ok(false, 'o 3º e o 4º deviam estar emendados', rj.bl);

  // clicar no 2º e Delete: apaga só ele
  const before = await info(); bx = await box(1);
  await p.mouse.click((bx.l + bx.r) / 2, bx.y); await p.waitForTimeout(150);
  await p.keyboard.press('Delete'); await p.waitForTimeout(250);
  r = await info();
  ok(r && r.bl.length === before.bl.length - 1 && !r.bl.some(x => x.t === before.bl[1].t) && r.dom === r.bl.length, 'clique + Delete apaga só o trecho', { antes:before.bl.map(x => x.t), depois:r && r.bl.map(x => x.t) });
  ok(r.words < before.words, 'as palavras do trecho saem junto', { antes:before.words, depois:r.words });
  ok(await p.evaluate(() => S.layers.some(l => l.capt)), 'a camada da legenda continua');
  await p.screenshot({ path:path.join(outDir, 'legenda-trechos-2.png') });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
  r = await info();
  ok(r.bl.length === before.bl.length && r.bl[1].t === before.bl[1].t, 'Ctrl+Z traz o trecho de volta', r.bl.map(x => x.t));

  // lixeira na lista do painel
  await p.evaluate(() => { const L = S.layers.find(l => l.capt); select(L.id); renderProps(); document.querySelectorAll('.leg-row').forEach(r => r.closest('section')?.classList.remove('folded')); });
  const n0 = (await info()).bl.length;
  await p.evaluate(() => document.querySelectorAll('.leg-row button[aria-label="Apagar este trecho"]')[0].click()); await p.waitForTimeout(250);
  r = await info();
  ok(r.bl.length === n0 - 1, 'lixeira na lista apaga o trecho', { n0, n:r.bl.length });

  // mudar Palavras por vez volta ao corte automático
  await p.evaluate(() => { const L = S.layers.find(l => l.capt); L.capWords = 1; changed({ props:true }); renderTimeline(); });
  r = await info();
  ok(r.bl.length === r.words && r.dom === r.bl.length, 'Palavras por vez = 1: um trecho por palavra', r);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
