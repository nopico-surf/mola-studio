// Teste no navegador: layout automático do quadro com uma forma grande (cartão) e vários textos em cima dela.
// Os textos têm que se empilhar um embaixo do outro com o espaço do layout (antes ficavam onde caíram, sobrepostos,
// porque a forma prendia todos numa linha rígida). Rodar: node testes/forma-e-textos.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = { gap:24, auto:false, pin:'start', align:'center' };
    const sh = mkComp('shape'); sh.x = .5; sh.y = .5; sh.size = .9; sh.mh = .7; sh.start = 0; sh.end = null; S.layers.push(sh);
    for (const y of [400, 430, 470]) { const L = mkComp('title'); L.x = .5; L.y = y / 1350; L.start = 0; L.end = null; S.layers.push(L); }
    const pos = () => { const R = flowLayout(false); return { sh:R.pos.get(sh.id).cy, tx:S.layers.filter(l => l.type === 'text').map(l => R.pos.get(l.id).cy) }; };
    const a = pos(); changed({ layers:true, props:true }); changed({ layers:true, props:true });
    return { a, c:pos() };
  });
  // forma acrescentada DEPOIS dos textos (fica por cima na pilha): entra na coluna, embaixo, sem cobrir nenhum texto
  const r2 = await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === "bg"); S.groups = {}; S.flow = null;
    for (let i = 0; i < 5; i++) { const L = mkComp("title"); L.x = .5; L.y = (117 + 130 * i) / 1350; L.start = 0; L.end = null; S.layers.push(L); }
    S.flow = { gap:24, auto:false, pin:"start", align:"center" }; changed({ layers:true, props:true });
    const sh = mkComp("shape"); sh.x = .5; sh.y = 742 / 1350; sh.start = 0; sh.end = null; S.layers.push(sh); changed({ layers:true, props:true });
    const R = flowLayout(false), it = l => flowItem(l, placeRaw(l), H());
    const ts = S.layers.filter(l => l.type === "text").map(l => R.pos.get(l.id).cy + it(l).h / 2);
    return { fundo:Math.max(...ts), topo:R.pos.get(sh.id).cy - it(sh).h / 2 };
  });
  if (!(r2.topo >= r2.fundo)) { falhas++; console.log("FALHA forma nova cobre o texto", r2); } else console.log("ok   forma nova entra embaixo dos textos");
  // layout ligado e elementos adicionados pelo botão Adicionar (título, forma, imagem, título): cada um no fim da coluna, sem sobrepor
  const r3 = await p.evaluate(async () => {
    S.layers = S.layers.filter(l => l.type === "bg"); S.groups = {}; S.flow = { gap:24, auto:false, pin:"start", align:"center" }; T = 0; changed({ layers:true, props:true });
    const btn = id => [...document.querySelectorAll("#adds button.add")].find(b => (b.title || "").toLowerCase().includes(id));
    const c = document.createElement("canvas"); c.width = 800; c.height = 600; c.getContext("2d").fillRect(0, 0, 800, 600);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    btn("título").click(); btn("forma").click(); await addImageFile(new File([blob], "foto.png", { type:"image/png" })); btn("título").click();
    const R = flowLayout(false);
    return S.layers.filter(l => l.type !== "bg").map(l => { const q = R.pos.get(l.id), it = flowItem(l, placeRaw(l), H()); return q ? [q.cy - it.h / 2, q.cy + it.h / 2] : null; });
  });
  const ord = r3.every(Boolean) && r3.every((b, i) => !i || b[0] >= r3[i - 1][1] - .5);
  if (!ord) { falhas++; console.log("FALHA adicionados com layout se sobrepõem", JSON.stringify(r3)); } else console.log("ok   título, forma, imagem e título entram em coluna");
  const passo = ys => ys.slice(1).map((y, i) => Math.round(y - ys[i]));
  const ok1 = passo(r.a.tx).every(d => d >= 100 && d === passo(r.a.tx)[0]);
  const ok2 = JSON.stringify(r.a.tx.map(Math.round)) === JSON.stringify(r.c.tx.map(Math.round)) && Math.round(r.a.sh) === Math.round(r.c.sh);
  if (!ok1) { falhas++; console.log('FALHA textos não empilham com espaço igual', r.a.tx); } else console.log('ok   textos empilhados em cima da forma');
  if (!ok2) { falhas++; console.log('FALHA mudou depois de gravar', r); } else console.log('ok   estável depois de gravar');
  await b.close(); process.exit(falhas ? 1 : 0);
})();
