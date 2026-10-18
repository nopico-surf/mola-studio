// Teste no navegador: elemento salvo em Meus elementos (grupo com forma e textos) num arquivo 3:4 e adicionado num arquivo 9:16
// mantém os px entre as peças e o tamanho. Bug relatado: "perde tamanho, espaçamento" ao aplicar em outro arquivo
// (x/y são frações do quadro de origem e o espaço esticava com a altura; fpos de lá com escala própria encolhia uma peça).
// Rodar: node testes/elemento-outro-formato.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  let falhas = 0; p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  const ok = (c, msg, d) => { if (!c) falhas++; console.log((c ? 'ok   ' : 'FALHA') + ' ' + msg + (d ? ' ' + JSON.stringify(d) : '')); };
  await p.goto(url); await p.waitForTimeout(1500);
  // medida: centro de cada peça em px do vídeo e escala, na ordem forma, título, subtítulo
  const medir = () => p.evaluate(() => {
    RT.frameNo++; const ls = S.layers.filter(l => l.type !== 'bg');
    return ls.map(l => { const q = placeOf(l); return { t:l.type, x:Math.round(q.x * W()), y:Math.round(q.y * H()), k:+q.k.toFixed(3) }; });
  });
  await p.evaluate(() => {
    setFormat('3x4');
    const sh = addLayer(mkComp('shape')), t1 = addLayer(mkText('title', { text:'Título' })), t2 = addLayer(mkText('sub', { text:'Subtítulo' }));
    sh.x = .5; sh.y = .5; t1.x = .5; t1.y = .45; t2.x = .5; t2.y = .55;
    // ajuste feito só no 1:1 numa peça (escala), como nos elementos do usuário
    t2.fpos = { '1x1':{ x:.5, y:.6, s:.8 }, '9x16':{ x:1.3, y:.2 } };
    S.groups = { gx:{ name:'Cartão', open:true } }; [sh, t1, t2].forEach(l => l.grp = 'gx');
    renderAll(); selectGroup('gx'); changed({ layers:true });
  });
  const antes = await medir();
  // salvar pelo botão direito no palco
  const pt = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'shape'); ensureBounds([L]); const r = cv.getBoundingClientRect(), bb = L._bounds;
    return { x:r.left + (bb.x + bb.w / 2) / FW() * r.width, y:r.top + (bb.y + bb.h * .9) / H() * r.height }; });
  await p.mouse.click(pt.x, pt.y, { button:'right' }); await p.waitForTimeout(150);
  await p.locator('.ctx button', { hasText:'Salvar em Meus elementos' }).click(); await p.waitForTimeout(400);
  // outro arquivo, com o 9:16 como principal
  await p.evaluate(async () => { await newFile(); setFormat('9x16'); });
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => baseFmt() === '9x16' && S.layers.length === 1), 'arquivo novo em 9:16 vazio');
  await p.locator('.add.my').first().click(); await p.waitForTimeout(400);
  const depois = await medir();
  ok(depois.length === 3, 'as 3 peças entraram', { n:depois.length });
  const rel = a => a.map(q => ({ dx:q.x - a[0].x, dy:q.y - a[0].y }));
  const ra = rel(antes), rd = rel(depois);
  const dist = Math.max(...ra.map((q, i) => Math.max(Math.abs(q.dx - rd[i].dx), Math.abs(q.dy - rd[i].dy))));
  ok(dist <= 2, 'mesma distância em px entre as peças', { antes:ra, depois:rd });
  ok(depois.every(q => q.k === 1), 'nenhuma peça encolheu', depois);
  ok(depois.every(q => q.x > 0 && q.x < 1080 && q.y > 0 && q.y < 1920), 'tudo dentro do quadro', depois);
  ok(await p.evaluate(() => S.layers.every(l => !l.fpos)), 'ajustes por formato de lá não vieram');
  // no mesmo formato principal nada muda (colar no próprio arquivo)
  await p.evaluate(async () => { await newFile(); setFormat('3x4'); });
  await p.waitForTimeout(600);
  await p.locator('.add.my').first().click(); await p.waitForTimeout(400);
  const igual = await medir();
  ok(igual.every((q, i) => Math.abs(q.x - antes[i].x) <= 1 && Math.abs(q.y - antes[i].y) <= 1), 'mesmo principal: mesmas posições', { antes, igual });
  if (process.env.SHOT) await p.screenshot({ path:process.env.SHOT });
  await b.close(); process.exit(falhas ? 1 : 0);
})();
