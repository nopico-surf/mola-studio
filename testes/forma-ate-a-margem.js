// Teste no navegador: forma e imagem com "Manter dentro da margem" crescem pelas alças de lado até encostar na margem e param nela,
// na largura e na altura (reclamação do usuário: travava antes de chegar). Com o layout do quadro "No centro"/"No meio" a coluna
// recentraliza o elemento e a borda puxada andava só metade (o mesmo que já tinha acontecido com o frame). Vale também para a
// largura do texto, para o frame na altura, fora do formato principal e no carrossel.
// Rodar: node testes/forma-ate-a-margem.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport:{ width:1500, height:950 } });
  let falhas = 0; p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const pump = () => { const c = document.createElement('canvas').getContext('2d'); c.canvas.width = c.canvas.height = 8; renderFrame(c, T, 8 / W(), false); };
    const fire = (t, cx, cy) => cv.dispatchEvent(new PointerEvent(t, { clientX:cx, clientY:cy, bubbles:true, button:0, buttons:t === 'pointerup' ? 0 : 1, pointerId:1, isPrimary:true }));
    const rcv = () => { const rc = cv.getBoundingClientRect(); return { rc, sx:v => rc.left + v / FW() * rc.width, sy:v => rc.top + v / H() * rc.height }; };
    // arrasta de (x, y) até passar da borda do palco, em passos, redesenhando a cada um (como o tick faria)
    const pull = (x, y, hx, hy, rc) => {
      const tx = hx ? (hx > 0 ? rc.right + 40 : rc.left - 40) : x, ty = hy ? (hy > 0 ? rc.bottom + 40 : rc.top - 40) : y;
      fire('pointerdown', x, y); if (!RT.drag) return false;
      for (let i = 1; i <= 40; i++) { fire('pointermove', x + i * (tx - x) / 40, y + i * (ty - y) / 40); pump(); }
      fire('pointerup', tx, ty); pump(); return true;
    };
    const edge = (B, M, hx, hy, pd = 0) => hx > 0 ? [B.x + B.w - pd, M.x1] : hx < 0 ? [B.x + pd, M.x0] : hy > 0 ? [B.y + B.h - pd, M.y1] : [B.y + pd, M.y0];
    const reset = flow => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = flow; };
    const one = (kind, flow, hx, hy, si = 0) => {
      reset(flow);
      const L = mkComp(kind === 'text' ? 'title' : kind);
      if (kind === 'image') L.mask = 'rect';
      if (kind === 'shape') L.kind = 'rect';
      if (kind === 'text') L.text = 'Texto de teste';
      Object.assign(L, { x:si + .5, y:.5, start:0, end:null }, kind === 'text' ? {} : { size:.3, mh:.3, keepIn:true }); S.layers.push(L);
      T = 1; renderAll(); select(L.id); pump(); pump();
      const hd = handlesOf(L).find(q => q.hx === hx && q.hy === hy); if (!hd) return 'sem alça';
      const { rc, sx, sy } = rcv(); if (!pull(sx(hd.x), sy(hd.y), hx, hy, rc)) return 'não pegou';
      return edge(L._bounds, marginBox(S.format, si), hx, hy, selPad(L));
    };
    const frame = (flow, hx, hy) => {
      reset(flow);
      const ls = [0, 1].map(i => { const L = mkComp('sub'); Object.assign(L, { size:50, x:.5, y:.4 + i * .1, start:0, end:null, grp:'ga' }); S.layers.push(L); return L; });
      S.groups = { ga:{ name:'F', open:true, flow:{ dir:'v', gap:30, align:'center', pin:'center' } } };
      T = 1; renderAll(); selectGroup('ga'); pump(); pump();
      const box = flowNow('ga').box, { rc, sx, sy } = rcv();
      const x = sx(hx ? (hx < 0 ? box.x0 : box.x1) : (box.x0 + box.x1) / 2), y = sy(hy ? (hy < 0 ? box.y0 : box.y1) : (box.y0 + box.y1) / 2);
      if (!pull(x, y, hx, hy, rc)) return 'não pegou';
      const q = flowNow('ga').box; return edge({ x:q.x0, y:q.y0, w:q.x1 - q.x0, h:q.y1 - q.y0 }, marginBox(S.format), hx, hy);
    };
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]], res = {};
    const flows = { livre:null, 'centro/em cima':{ gap:24, auto:false, pin:'start', align:'center' }, 'manter/no meio':{ gap:24, auto:false, pin:'center', align:'keep' }, 'centro/no meio':{ gap:24, auto:false, pin:'center', align:'center' } };
    for (const kind of ['shape', 'image']) for (const [nm, f] of Object.entries(flows)) for (const [hx, hy] of sides) res[`${kind} ${nm} ${hx},${hy}`] = one(kind, f, hx, hy);
    for (const [nm, f] of Object.entries(flows)) for (const hx of [1, -1]) res[`texto (largura) ${nm} ${hx}`] = one('text', f, hx, 0);
    for (const [hx, hy] of sides) res[`frame centro/no meio ${hx},${hy}`] = frame(flows['centro/no meio'], hx, hy);
    // fora do formato principal
    const base = S.format; setFormat(base === '1x1' ? '4x5' : '1x1');
    for (const [hx, hy] of sides) res[`shape outro formato ${hx},${hy}`] = one('shape', null, hx, hy);
    setFormat(base);
    // carrossel: forma no slide 2
    setSlides(3); for (const [hx, hy] of sides) res[`shape carrossel slide 2 ${hx},${hy}`] = one('shape', null, hx, hy, 1);
    setSlides(1);
    return res;
  });
  for (const [k, q] of Object.entries(r)) {
    const ok = Array.isArray(q) && Math.abs(q[0] - q[1]) < 2;
    if (!ok) falhas++;
    console.log((ok ? 'ok   ' : 'FALHA') + ` ${k} vai até a margem: ` + JSON.stringify(Array.isArray(q) ? q.map(v => +v.toFixed(1)) : q));
  }
  await b.close(); process.exit(falhas ? 1 : 0);
})();
