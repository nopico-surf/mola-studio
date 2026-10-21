// Teste no navegador: trecho da legenda escolhido fica marcado na lista "Texto da legenda" do painel e a lista rola até ele
// (pedido do usuário). Confere: clique no trecho na timeline (mouse de verdade), edição pelo palco (stageEdit) e foco na lista.
// Rodar: node testes/legenda-trecho-marcado.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; setDuration(60); T = 0; changed({ layers:true, props:true });
    let t = .5; const words = [];
    for (let i = 0; i < 80; i++) { const w = i % 4 === 3 ? 'frase' + i + '.' : 'palavra' + i; words.push({ w, s:+t.toFixed(3), e:+(t + .3).toFixed(3), c:.95 }); t += .3 + (/\.$/.test(w) ? .8 : .05); }
    capCreate(words); RT.layout.clear(); changed({ layers:true, props:true }); renderTimeline(); renderProps();
  });
  await p.waitForTimeout(400);
  const state = () => p.evaluate(() => {
    const L = S.layers.find(l => l.capt), list = document.getElementById(fid(L, 'caplist')), on = [...list.querySelectorAll('.leg-row.on')];
    const lr = list.getBoundingClientRect(), rr = on[0] && on[0].getBoundingClientRect();
    return { k:capSelK(L), n:on.length, onK:on[0] ? +on[0].dataset.k : -1, vis:!!rr && rr.top >= lr.top - 1 && rr.bottom <= lr.bottom + 1 };
  });
  // 1) clique num trecho do fim na timeline
  const c = await p.evaluate(() => { const L = S.layers.find(l => l.capt), r = document.querySelectorAll('.tl-row[data-id="' + L.id + '"] .tl-cb')[30].getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; });
  await p.mouse.click(c.x, c.y); await p.waitForTimeout(300);
  let s = await state();
  ok(s.k === 30 && s.n === 1 && s.onK === 30, 'clique na timeline marca o trecho na lista', s);
  ok(s.vis, 'a lista rola até o trecho escolhido', s);
  // 2) edição pelo palco num trecho do começo
  await p.keyboard.press('Escape');
  await p.evaluate(() => { seditClose(); RT.capSel = null; T = 5; stageEdit(S.layers.find(l => l.capt)); });
  await p.waitForTimeout(300);
  s = await state();
  ok(s.n === 1 && s.onK === s.k && s.k >= 0 && s.k < 5, 'editar pelo palco marca o trecho da agulha', s);
  ok(s.vis, 'a lista volta até o trecho do começo', s);
  // 3) foco num trecho da própria lista
  await p.evaluate(() => { seditClose(); const L = S.layers.find(l => l.capt); document.querySelector('#' + fid(L, 'caplist') + ' .leg-row[data-k="12"] .leg-tx').focus(); });
  await p.waitForTimeout(200);
  s = await state();
  ok(s.k === 12 && s.n === 1 && s.onK === 12, 'clicar num trecho da lista marca ele', s);
  ok(await p.evaluate(() => document.querySelectorAll('.tl-cb.on').length === 1), 'e marca o pedaço na timeline');
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
