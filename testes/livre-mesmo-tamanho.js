// Teste no navegador: trocar de um formato pronto (1080 de largura) para o livre (outra largura) não muda o tamanho, em px,
// de forma, imagem, logo e largura de texto (pedido do usuário: "precisa ser tudo exatamente igual").
// Rodar: node testes/livre-mesmo-tamanho.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow; delete S.custom; delete S.base; S.format = '4x5'; RT.layout.clear();
    const sh = mkShape({ kind:'rect', size:.4, mh:.2, fill:true }); addLayer(sh, { x:.5, y:.4 });
    const out = {};
    for (const f of ['4x5', 'custom']) {
      S.format = f; RT.layout.clear();
      const G = blockGeom(S.layers.find(l => l.id === sh.id)); out[f] = [Math.round(G.w), Math.round(G.h)];
    }
    return out;
  });
  conf(r['4x5'][0] === 432 && r['4x5'][1] === 216, 'no 4:5 a forma tem 432×216 px (' + r['4x5'] + ')');
  conf(r.custom[0] === r['4x5'][0] && r.custom[1] === r['4x5'][1], 'no livre (1920 de largura) tem os mesmos px (' + r.custom + ')');
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo'); process.exit(falhas ? 1 : 0);
})();
