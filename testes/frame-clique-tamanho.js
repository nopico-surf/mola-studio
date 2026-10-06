// Teste no navegador: apertar o botão do mouse num item de frame com layout automático (clique duplo no texto)
// não pode mudar o tamanho dele. Frame cheio encolhe os itens (placeOf.k < 1); pegado para arrastar, o item voltava a k = 1.
// Rodar: node testes/frame-clique-tamanho.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport:{ width:1500, height:950 } });
  let falhas = 0; p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1, 2].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.size = 110; L.y = .2 + i * .2; L.x = .5; L.start = 0; return L; });
    S.groups = { ga:{ name:'F', open:true, flow:{ dir:'v', gap:30, align:'center', pin:'center' } } }; ls.forEach(l => l.grp = 'ga');
    T = 3; renderAll(); needs = true; selectGroup('ga');
    pasteLayers({ v:1, dur:S.duration, layers:[JSON.parse(JSON.stringify(mkText('sub', { text:'Texto longo colado dentro do frame pronto para testar', size:100 })))], fonts:[], groups:{} });
    T = 3; needs = true; await new Promise(r => setTimeout(r, 400));
    const n = selL(), antes = placeOf(n).k; select(n.id, true); await new Promise(r => setTimeout(r, 200));
    const bb = n._bounds, rc = cv.getBoundingClientRect(), x = rc.left + (bb.x + bb.w / 2) / FW() * rc.width, y = rc.top + (bb.y + bb.h / 2) / H() * rc.height;
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX:x, clientY:y, bubbles:true, button:0, buttons:1, pointerId:1, isPrimary:true }));
    await new Promise(r => setTimeout(r, 100));
    const durante = placeOf(n).k, pego = RT.drag && RT.drag.flowL === n.id;
    cv.dispatchEvent(new PointerEvent('pointerup', { clientX:x, clientY:y, bubbles:true, button:0, buttons:0, pointerId:1, isPrimary:true }));
    return { antes, durante, pego };
  });
  const ok = r.pego && r.antes < 1 && Math.abs(r.antes - r.durante) < 1e-6;
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' tamanho igual ao apertar o item da fila ' + JSON.stringify(r));
  await b.close(); process.exit(falhas ? 1 : 0);
})();
