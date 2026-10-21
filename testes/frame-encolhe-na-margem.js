// Teste no navegador: frame com texto largo até a margem (o desenho já vinha encolhido para caber). Puxar a quina para dentro tem que
// encolher a caixa junto com o mouse (reclamação do usuário: "quando está grudado na margem e eu diminuo pela quina, não vai, fica grudado").
// Rodar: node testes/frame-encolhe-na-margem.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const b = await pw.chromium.launch({ channel:'chrome' }).catch(() => pw.chromium.launch());
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  for (const lado of ['se', 'sw']) {
    const r = await p.evaluate(lado => {
      S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow; T = 3;
      const A = mkComp('title'); addLayer(A); const B = mkComp('title'); addLayer(B);
      A.text = 'Conheça os'; B.text = 'Psicólogos e Psiquiatras'; A.size = 60; B.size = 200;
      for (const L of [A, B]) { L.start = 0; L.end = S.duration; L.align = 'left'; }
      RT.picks = new Set([A.id, B.id]); RT.selected = B.id; RT.itemPicks = null; flowToggle();
      changed({ layers:true, props:true }); RT.frameNo++; renderFrame(pctx, T, RS, false);
      RT.picks = new Set([A.id, B.id]); RT.itemPicks = null; RT.frameNo++; renderFrame(pctx, T, RS, false);
      const w0 = B._bounds.w, h = handlesOf(A).find(h => h.k === lado);
      const r = cv.getBoundingClientRect(), k = r.width / FW(), dx = lado === 'se' ? -1 : 1;
      const mk = (t, x, y) => ({ type:t, clientX:x, clientY:y, button:0, pointerId:1, altKey:false, ctrlKey:false, metaKey:false, shiftKey:false, preventDefault(){}, stopPropagation(){} });
      const sx = r.left + h.x * k, sy = r.top + h.y * k; cv.setPointerCapture = () => {};
      const pt = stagePt(mk('d', sx, sy)); startResize(mk('d', sx, sy), pt, handleAt(pt) || h);
      const D = RT.drag, ev = mk('m', sx + dx * 40 * k, sy + 20 * k);
      resizeTo(D, stagePt(ev), ev); RT.frameNo++; renderFrame(pctx, T, RS, false); endDrag();
      return { w0, w1:B._bounds.w };
    }, lado);
    confere(`${lado}: encolher 40 px a partir da margem muda a largura já no primeiro movimento`, r.w1 < r.w0 - 10, r);
  }
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
