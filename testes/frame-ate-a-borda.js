// Teste no navegador: esticar um frame com texto pela alça do lado leva a borda até a margem e para nela (nem antes, nem depois).
// Com o layout do quadro "No centro", a coluna recentraliza o frame: a borda parava antes da margem (o lado puxado andava metade).
// Rodar: node testes/frame-ate-a-borda.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport:{ width:1500, height:950 } });
  let falhas = 0; p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.size = 50; L.y = .4 + i * .1; L.x = .5; L.start = 0; return L; });
    S.groups = { ga:{ name:'F', open:true, flow:{ dir:'v', gap:30, align:'center', pin:'center' } } }; ls.forEach(l => l.grp = 'ga');
    const fire = (t, cx, cy) => cv.dispatchEvent(new PointerEvent(t, { clientX:cx, clientY:cy, bubbles:true, button:0, buttons:t === 'pointerup' ? 0 : 1, pointerId:1, isPrimary:true }));
    const run = async (flow, side) => {
      S.flow = flow; ls.forEach(l => l.x = .5); delete S.groups.ga.flow.w;
      T = 3; renderAll(); needs = true; selectGroup('ga'); await new Promise(r => setTimeout(r, 400));
      const box = flowNow('ga').box, rc = cv.getBoundingClientRect(), sx = v => rc.left + v / FW() * rc.width, sy = v => rc.top + v / H() * rc.height;
      const x = sx(side < 0 ? box.x0 : box.x1), y = sy((box.y0 + box.y1) / 2), to = side < 0 ? rc.left - 5 : rc.right + 5;
      fire('pointerdown', x, y); let segue = true;
      for (let i = 1; i <= 16; i++) {
        const mx = x + i * (to - x) / 16; fire('pointermove', mx, y); await new Promise(r => setTimeout(r, 20));
        if (i === 4) { const q = flowNow('ga').box; segue = Math.abs((mx - rc.left) / rc.width * FW() - (side < 0 ? q.x0 : q.x1)) < 3; } // a borda acompanha o mouse
      }
      fire('pointerup', to, y); needs = true; await new Promise(r => setTimeout(r, 300));
      const q = flowNow('ga').box, M = marginBox(S.format);
      return { segue, borda:side < 0 ? q.x0 : q.x1, margem:side < 0 ? M.x0 : M.x1 };
    };
    return { centro:await run({ gap:24, auto:false, pin:'start', align:'center' }, -1), esq:await run(null, -1), dir:await run(null, 1) };
  });
  for (const [k, q] of Object.entries(r)) {
    const ok = q.segue && Math.abs(q.borda - q.margem) < 1.5;
    if (!ok) falhas++;
    console.log((ok ? 'ok   ' : 'FALHA') + ` frame esticado (${k}) vai até a margem e para nela ` + JSON.stringify(q));
  }
  await b.close(); process.exit(falhas ? 1 : 0);
})();
