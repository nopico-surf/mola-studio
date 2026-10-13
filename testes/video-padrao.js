// Teste no navegador: o vídeo tem padrão editável em Componentes, como o texto e a imagem (pedido do usuário: "assim como textos e
// imagens eu consigo editar o padrão de como entra e anima, preciso da mesma coisa com vídeos").
// - Componentes lista "Vídeo" e o botão Vídeo de Adicionar ganha o lápis do padrão;
// - o vídeo que entra sai com o padrão (de fábrica: fade, cantos 24, 80% da largura, altura pela proporção do vídeo);
// - editar a entrada/saída/cantos/largura na janela vale para o próximo vídeo e não mexe nos que já estão no arquivo nem no padrão da imagem;
// - "Usar como padrão de Vídeo" (botão direito) e "Aplicar nos vídeos que já existem" reconhecem o vídeo.
// Rodar: node testes/video-padrao.js (o vídeo de teste é gravado no próprio navegador, canvas)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; if (S.brand.comps) delete S.brand.comps; T = 0; changed({ layers:true, props:true }); renderTimeline(); });

  // vídeo de teste 320×240 (4:3), gravado no navegador
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(c.captureStream(30), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t / 10 % 360},70%,50%)`; x.fillRect(0, 0, 320, 240); if (t > 1500) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done;
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const f = path.join(outDir, 'padrao-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  const addVideo = async () => {
    const n = await p.evaluate(() => S.layers.filter(l => l.video).length);
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await ch.setFiles(f);
    await p.waitForFunction(k => S.layers.filter(l => l.video).length >= k, n + 1, { timeout:15000 });
    await p.waitForTimeout(300);
    return p.evaluate(() => { const V = S.layers.filter(l => l.video).pop(); return { id:V.id, comp:V.comp, in:V.in, inDur:V.inDur, mask:V.mask, radius:V.radius, size:V.size, mh:V.mh, out:V.out, idle:V.idle, kind:compKindOf(V) }; });
  };

  // 1) o componente existe e o lápis aparece em Adicionar
  const r0 = await p.evaluate(() => ({ def:!!COMP_DEF.video, pen:!![...document.querySelectorAll('#adds button.add')].find(b => b.textContent.includes('Vídeo') && b.querySelector('.ed')) }));
  ok(r0.def, 'COMP_DEF tem o Vídeo', r0);
  ok(r0.pen, 'o botão Vídeo de Adicionar tem o lápis do padrão', r0);

  // 2) padrão de fábrica = o que o vídeo já tinha
  const v1 = await addVideo();
  ok(v1.comp === 'video' && v1.kind === 'video', 'o vídeo novo é o componente Vídeo', v1);
  ok(v1.in === 'fade' && v1.mask === 'rect' && v1.radius === 24 && Math.abs(v1.size - .8) < 1e-6, 'padrão de fábrica: fade, cantos 24, 80% da largura', v1);
  ok(Math.abs(v1.mh - .8 * 240 / 320) < .002, 'altura pela proporção do vídeo (4:3)', v1);

  // 3) edita o padrão pela janela (os mesmos campos da imagem): Entrada, Saída e Cantos
  await p.locator('#adds button.add', { hasText:'Vídeo' }).locator('.ed').click();
  await p.waitForSelector('.comp-card');
  const head = await p.textContent('.comp-body .comp-h');
  ok(/Vídeo/.test(head), 'a janela abre no Vídeo', head);
  const sel = p.locator('.comp-body select');
  const n = await sel.count();
  ok(n === 3, 'Entrada, Saída e Na tela', n);
  await sel.nth(0).selectOption('circle');
  await sel.nth(1).selectOption('fade');
  await p.waitForTimeout(150);
  const comps = await p.evaluate(() => JSON.parse(JSON.stringify(S.brand.comps)));
  ok(comps.video && comps.video.in === 'circle' && comps.video.out === 'fade', 'a janela grava o padrão do vídeo', comps);
  ok(!comps.image, 'o padrão da imagem não mexeu', comps);
  await p.evaluate(() => { const c = S.brand.comps.video; c.radius = 60; c.size = .5; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  // 4) o próximo vídeo parte do padrão novo; o que já estava no arquivo não muda
  const v2 = await addVideo();
  ok(v2.in === 'circle' && v2.out === 'fade' && v2.radius === 60 && Math.abs(v2.size - .5) < 1e-6, 'o próximo vídeo entra com o padrão editado', v2);
  ok(v2.inDur > 0, 'com a duração da entrada escolhida', v2);
  ok(Math.abs(v2.mh - .5 * 240 / 320) < .002, 'altura continua pela proporção com a largura nova', v2);
  const v1b = await p.evaluate(id => { const L = S.layers.find(l => l.id === id); return { in:L.in, radius:L.radius, size:L.size }; }, v1.id);
  ok(v1b.in === 'fade' && v1b.radius === 24 && v1b.size === .8, 'o vídeo que já estava no arquivo não mudou', v1b);

  // 5) a imagem continua sendo imagem
  const img = await p.evaluate(() => { const L = mkComp('image'); L.src = 'x'; return { kind:compKindOf(L), in:L.in }; });
  ok(img.kind === 'image' && img.in === 'circle', 'imagem continua no componente Imagem, sem o padrão do vídeo (fade/saída)', img);

  // 6) botão direito: "Usar como padrão de Vídeo" e "Aplicar" pegam o vídeo
  const r6 = await p.evaluate(id => {
    const V = S.layers.find(l => l.id === id); V.in = 'wipe'; V.out = 'cut'; V.idle = 'float';
    compFromLayer(V, compKindOf(V));
    const saved = JSON.parse(JSON.stringify(S.brand.comps.video));
    const W2 = S.layers.filter(l => l.video).find(l => l.id !== id), mh0 = W2.mh, s0 = W2.size;
    compsOf().video.size = .4; compApply([W2], 'video');
    return { saved, size:W2.size, mh:W2.mh, ratio:(W2.mh / W2.size).toFixed(3), r0:(mh0 / s0).toFixed(3), mhKeep:'mh' in S.brand.comps.video };
  }, v1.id);
  ok(r6.saved.in === 'wipe' && r6.saved.idle === 'float', 'Usar como padrão de Vídeo copia a animação do vídeo', r6);
  ok(!r6.mhKeep, 'a altura do vídeo não entra no padrão', r6);
  ok(r6.size === .4 && r6.ratio === r6.r0, 'Aplicar muda a largura e mantém a proporção', r6);

  // 7) Voltar ao de fábrica
  await p.evaluate(() => { delete S.brand.comps.video; });
  const v3 = await addVideo();
  ok(v3.in === 'fade' && v3.radius === 24, 'de fábrica de novo', v3);
  // 8) a prévia da janela mostra o vídeo de mentira e toca a entrada (antes só havia um aviso escrito)
  await p.evaluate(() => openComps('video'));
  await p.waitForSelector('.comp-pv'); await p.waitForTimeout(500);
  const pv = await p.evaluate(() => {
    const c = document.querySelector('.comp-pv'), x = c.getContext('2d'), bg = x.getImageData(4, 4, 1, 1).data, mid = x.getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return { bg:[...bg], mid:[...mid], play:!document.querySelector('.comp-play').hidden };
  });
  ok(pv.play, 'o botão "Ver entrada" aparece para o vídeo', pv);
  ok(pv.bg.some((v, i) => Math.abs(v - pv.mid[i]) > 12), 'a prévia desenha o vídeo no meio, sobre o fundo da marca', pv);
  await p.screenshot({ path:path.join(outDir, 'padrao-video.png') });
  await p.locator('.comp-play').click(); await p.waitForTimeout(250);
  await p.screenshot({ path:path.join(outDir, 'padrao-video-entrada.png') });
  await p.evaluate(() => COMPWIN && document.querySelector('.comp-sheet .btn.primary')?.click());
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
