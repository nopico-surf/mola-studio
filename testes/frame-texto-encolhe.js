// Teste no navegador: texto dentro de um frame de tamanho fixo (a Caixa). Encolher a largura do texto pela alça de lado não pode levar o frame
// junto (reclamação do usuário: "diminuo o texto para a esquerda e o frame anda para a esquerda"). Frame que abraça o texto continua
// com o lado oposto parado.
// Rodar: node testes/frame-texto-encolhe.js
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
  // monta uma Caixa (texto num frame com layout) e puxa a alça de lado do texto como o mouse faria; devolve a caixa do frame antes e depois
  const puxa = (frame, lado, dx) => p.evaluate(({ frame, lado, dx }) => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
    const L = addBox(); L.text = 'Seu texto aqui com algumas palavras para quebrar linha'; L.start = 0; L.end = S.duration; T = 3;
    Object.assign(S.groups[L.grp].flow, frame);
    changed({ layers:true, props:true }); RT.frameNo++; select(L.id, true); renderFrame(pctx, T, RS, false);
    const cx = (() => { const q = flowNow(L.grp).box; return [Math.round(q.x0), Math.round(q.x1)]; });
    const antes = cx();
    const h = handlesOf(L).find(h => h.k === lado), r = cv.getBoundingClientRect(), k = r.width / FW();
    const mk = (t, x, y) => ({ type:t, clientX:x, clientY:y, button:0, pointerId:1, altKey:false, ctrlKey:false, metaKey:false, shiftKey:false, preventDefault(){}, stopPropagation(){} });
    const sx = r.left + h.x * k, sy = r.top + h.y * k, pt = stagePt(mk('pointerdown', sx, sy));
    cv.setPointerCapture = () => {};
    startResize(mk('pointerdown', sx, sy), pt, handleAt(pt));
    const D = RT.drag, fim = stagePt(mk('pointermove', sx + dx * k, sy));
    resizeTo(D, fim, mk('pointermove', sx + dx * k, sy)); RT.drag = null; changed({ props:true }); RT.frameNo++; renderFrame(pctx, T, RS, false);
    return { antes, depois:cx(), x:+L.x.toFixed(3), fixW:!!L.fixW };
  }, { frame, lado, dx });

  // 1) frame de largura fixa, texto centralizado: o frame fica onde está, o texto continua no centro dele
  let r = await puxa({ w:900 }, 'e', -150);
  confere('largura fixa, alça direita: frame parado', r.depois, r.antes);
  confere('largura fixa, alça direita: texto no centro', r.x, .5);
  r = await puxa({ w:900 }, 'w', 150);
  confere('largura fixa, alça esquerda: frame parado', r.depois, r.antes);
  // 2) frame que abraça o texto: o lado oposto continua parado
  r = await puxa({}, 'e', -150);
  confere('abraçando, alça direita: lado esquerdo parado', r.depois[0], r.antes[0]);
  confere('abraçando, alça direita: o frame encolhe', r.depois[1] < r.antes[1], true);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
