// Teste no navegador: puxar a alça lateral de um frame com texto (a Caixa) deixa o texto mais estreito, quebrando em mais linhas, sem mudar o
// tamanho da fonte (pedido do usuário: "diminuir a extensão para a lateral, sem diminuir o tamanho"). Voltar a puxar para fora devolve a largura de antes.
// Rodar: node testes/frame-lateral-quebra-texto.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, ok, info) => {
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : '\n      ' + JSON.stringify(info)));
};
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  // monta uma Caixa e puxa a alça de lado do frame (grupo inteiro escolhido) como o mouse faria; devolve o estado a cada passo
  const puxa = (frame, lado, dxs) => p.evaluate(({ frame, lado, dxs }) => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
    const L = addBox(); L.text = 'Seu texto aqui com algumas palavras para quebrar linha'; L.start = 0; L.end = S.duration; T = 3;
    Object.assign(S.groups[L.grp].flow, frame);
    changed({ layers:true, props:true }); RT.frameNo++; selectGroup(L.grp); renderFrame(pctx, T, RS, false);
    const info = () => { const q = flowNow(L.grp).box; return { box:[Math.round(q.x0), Math.round(q.x1)], size:L.size, fixW:!!L.fixW, lines:layoutText(L, caseTxt(L, L.text)).nLines }; };
    const antes = info(), fs = flowFrameSel(), hx = lado === 'e' ? 1 : -1;
    const hd = { k:lado, hx, hy:0, x:hx > 0 ? fs.x + fs.w : fs.x, y:fs.y + fs.h / 2, lx:hx > 0 ? fs.x + fs.w : fs.x, ly:fs.y + fs.h / 2, grp:true, a:0 };
    const r = cv.getBoundingClientRect(), k = r.width / FW();
    const mk = (t, x, y) => ({ type:t, clientX:x, clientY:y, button:0, pointerId:1, altKey:false, ctrlKey:false, metaKey:false, shiftKey:false, preventDefault(){}, stopPropagation(){} });
    const sx = r.left + hd.x * k, sy = r.top + hd.y * k, pt = stagePt(mk('pointerdown', sx, sy));
    cv.setPointerCapture = () => {};
    startResize(mk('pointerdown', sx, sy), pt, hd);
    const D = RT.drag, res = [];
    for (const d of dxs) { const fim = stagePt(mk('pointermove', sx + d * k, sy)); resizeTo(D, fim, mk('pointermove', sx + d * k, sy)); RT.frameNo++; renderFrame(pctx, T, RS, false); res.push(info()); }
    RT.drag = null; changed({ props:true });
    return { how:D.how, antes, res };
  }, { frame, lado, dxs });

  for (const [nome, frame, lado, dxs] of [['largura fixa, alça direita', { w:900 }, 'e', [-300, -500, 0]], ['largura fixa, alça esquerda', { w:900 }, 'w', [300, 500, 0]], ['abraçando, alça direita', {}, 'e', [-300, -500, 0]]]) {
    const r = await puxa(frame, lado, dxs), [a, c, v] = r.res;
    confere(nome + ': a alça muda o frame', r.how === 'frame', r.how);
    confere(nome + ': o frame encolhe', a.box[1] - a.box[0] < r.antes.box[1] - r.antes.box[0] && c.box[1] - c.box[0] < a.box[1] - a.box[0], r);
    confere(nome + ': a fonte não muda', a.size === r.antes.size && c.size === r.antes.size, r);
    confere(nome + ': o texto quebra em mais linhas', c.lines > r.antes.lines, r);
    confere(nome + ': voltando, a largura de antes', JSON.stringify(v.box) === JSON.stringify(r.antes.box) && v.lines === r.antes.lines && v.fixW === r.antes.fixW, r);
  }
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
