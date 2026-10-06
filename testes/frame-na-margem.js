// Teste no navegador: todo frame nasce com "Manter dentro da margem" e a caixa dele (com espaço interno e largura fixa) não passa da
// margem por nenhum caminho: campo de largura, espaço interno, arrastar com o mouse. Desmarcando, o campo passa.
// Bug relatado: pela alça parava na margem, pelo slider e pelo mouse passava.
// Rodar: node testes/frame-na-margem.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage({ viewport:{ width:1500, height:950 } });
  let falhas = 0; p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  const ok = (c, msg, d) => { if (!c) falhas++; console.log((c ? 'ok   ' : 'FALHA') + ' ' + msg + (d ? ' ' + JSON.stringify(d) : '')); };
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(async () => {
    S.margin = { on:true, top:80, right:80, bottom:80, left:80 };
    const k = ADD_KINDS.find(k => k.id === 'sub');
    const ls = [0, 1].map(i => { const L = addLayer(k.mk(S.brand, S.brand.fonts)); L.size = 60; L.y = .4 + i * .1; L.x = .5; L.start = 0; return L; });
    S.groups = { ga:{ name:'F', open:true, flow:{ dir:'v', gap:30, align:'center', pin:'center', w:400 } } }; ls.forEach(l => l.grp = 'ga');
    T = 3; renderAll(); needs = true; selectGroup('ga'); await new Promise(r => setTimeout(r, 300));
  });
  const caixa = () => p.evaluate(() => { const r = flowNow('ga'), M = marginBox(); return { x0:Math.round(r.box.x0), x1:Math.round(r.box.x1), y0:Math.round(r.box.y0), y1:Math.round(r.box.y1), M:{ x0:M.x0, x1:M.x1, y0:M.y0, y1:M.y1 } }; });
  const dentro = c => c.x0 >= c.M.x0 - 1 && c.x1 <= c.M.x1 + 1 && c.y0 >= c.M.y0 - 1 && c.y1 <= c.M.y1 + 1;
  const marcado = await p.evaluate(() => { const i = document.getElementById('frameKeep-ga'); return i ? i.checked : null; });
  ok(marcado === true, 'frame nasce com "Manter dentro da margem" marcado', { marcado });
  // slider de largura no máximo
  const slide = (id, v) => p.evaluate(([id, v]) => { const i = document.getElementById(id); i.dispatchEvent(new Event('pointerdown')); i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return +i.max; }, [id, v]);
  const mx = await slide('f-flow-ga-w', 5000); await p.waitForTimeout(150);
  let c = await caixa(); ok(dentro(c), 'largura pelo slider para na margem', { mx, ...c });
  await p.evaluate(() => { flowOf('ga').w = 400; changed({ props:true }); }); await p.waitForTimeout(150);
  // arrastar o frame com o mouse bem para a direita
  const pt = await p.evaluate(() => { const bb = flowNow('ga').box, rc = cv.getBoundingClientRect(); const L = gleaves('ga')[0]._bounds;
    return { x:rc.left + (L.x + L.w / 2) / FW() * rc.width, y:rc.top + (L.y + L.h / 2) / H() * rc.height, s:rc.width / FW() }; });
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(pt.x + i * 60, pt.y + i * 5); await p.mouse.up(); await p.waitForTimeout(200);
  c = await caixa(); ok(dentro(c), 'arrastar o frame para na margem', c);
  // espaço interno nas laterais no máximo (frame abraçando)
  await p.evaluate(() => { delete flowOf('ga').w; changed({ props:true }); renderAll(); }); await p.waitForTimeout(150);
  await p.evaluate(() => { const i = [...document.querySelectorAll('#props input[type=range]')].find(i => i.id.startsWith('f-flow-ga-pl')); i.dispatchEvent(new Event('pointerdown')); i.value = 400; i.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(150);
  c = await caixa(); ok(dentro(c), 'espaço interno pelo slider para na margem', c);
  // desmarcado: a largura passa
  await p.evaluate(() => { const i = document.getElementById('frameKeep-ga'); i.checked = false; i.dispatchEvent(new Event('change')); flowOf('ga').pl = flowOf('ga').pr = undefined; flowOf('ga').w = 400; changed({ props:true }); renderAll(); });
  await p.waitForTimeout(200);
  await slide('f-flow-ga-w', 2000); await p.waitForTimeout(150);
  c = await caixa(); ok(!dentro(c), 'desmarcado: a largura passa da margem', c);
  if (process.env.SHOT) await p.screenshot({ path:process.env.SHOT });
  await b.close(); process.exit(falhas ? 1 : 0);
})();
