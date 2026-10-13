// Teste no navegador: clique (e clique duplo) num item de um frame com layout automático não pode mexer em nada.
// Bug relatado: "qualquer dois cliques anda tudo para a direita, o texto também". Num frame com frame dentro e espaço interno, o toque
// parado em um item contava como arrasto (a posição guardada tem 5 casas, a da conta não: diferença de ~1e-6) e `flowCommit` regravava a
// fila com a âncora errada (`flowItems` sem o frame de dentro): tudo saltava 2 × o espaço interno.
// Rodar: node testes/clique-na-fila.js
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
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  for (const aninhado of [true, false]) {
    const r = await p.evaluate(({ aninhado }) => {
      S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
      const mk = (L, x, y) => { L.start = 0; L.end = S.duration; addLayer(L, { x, y }); return L; };
      const a = mk(mkShape({ kind:'rect', size:.2, mh:.2 }), .2, .4), a2 = mk(mkShape({ kind:'ellipse', size:.05, mh:.05 }), .25, .38);
      const t = mk(mkText('title', { text:'Não', size:90 }), .45, .4), h = mk(mkShape({ kind:'ellipse', size:.25, mh:.25 }), .75, .45);
      T = 3;
      if (aninhado) { RT.picks = new Set([a.id, a2.id]); RT.selected = a.id; groupSel(); }
      RT.picks = new Set([a.id, a2.id, t.id, h.id]); RT.selected = a.id; flowToggle();
      Object.values(S.groups).forEach(g => { if (g.flow) Object.assign(g.flow, { dir:'h', gap:46, align:'start', pin:'start', pt:48, pr:48, pb:48, pl:48 }); });
      changed({ layers:true, props:true }); selectBg(); RT.frameNo++; renderFrame(pctx, T, RS, false);
      const xs = () => S.layers.filter(l => l.type !== 'bg').map(l => l.x.toFixed(4)).join(',');
      const pt = L => { const r = cv.getBoundingClientRect(), k = r.width / FW(), q = L._bounds; return { x:r.left + (q.x + q.w / 2) * k, y:r.top + (q.y + q.h / 2) * k }; };
      const dbl = L => {
        const c = pt(L), o = { clientX:c.x, clientY:c.y, button:0, pointerId:1, bubbles:true, cancelable:true, isPrimary:true, pointerType:'mouse' };
        for (let i = 0; i < 2; i++) {
          cv.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons:1 })); window.dispatchEvent(new PointerEvent('pointerup', o));
          cv.dispatchEvent(new PointerEvent('pointerup', o)); cv.dispatchEvent(new MouseEvent('click', { ...o, detail:i + 1 }));
        }
        cv.dispatchEvent(new MouseEvent('dblclick', { ...o, detail:2 })); RT.frameNo++; renderFrame(pctx, T, RS, false);
      };
      const antes = xs(), log = [];
      for (const L of [t, h, a, t, h, a2]) { dbl(L); log.push(xs() === antes); }
      return log;
    }, { aninhado });
    confere(`cliques duplos (${aninhado ? 'frame dentro de frame' : 'frame simples'}): nada anda`, r, [true, true, true, true, true, true]);
  }
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
