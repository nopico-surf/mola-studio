// Teste no navegador: importar trecho de vídeo longo (js/trecho.js), duração até 10 min e zoom da timeline.
// O vídeo de teste (4 min, H.264 + AAC) é gravado no próprio navegador com o número do quadro em três faixas de cinza,
// então dá para conferir no palco se o quadro que aparece é o do tempo certo do original. Sai em duas versões:
// moov no fim (como câmera/OBS) e MP4 fragmentado (como gravação do navegador).
// Caminho real: botão Vídeo → janela de trechos → teclas (← → I O) e campos de tempo → Importar → camadas na timeline.
// Rodar: node testes/importar-trecho.js (prints na pasta temporária, mola-testes/trecho-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const FPS = 10, DUR = 240;
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; T = 0; setDuration(8); changed({ layers:true, props:true }); renderTimeline(); });

  // grava o vídeo de teste: quadro n = três faixas (n % 16, n / 16 % 16, n / 256 % 16) × 16 de cinza; som = tom de 440 Hz
  const mk = frag => p.evaluate(async ({ FPS, DUR, frag }) => {
    const w = 160, hh = 96, N = FPS * DUR, c = new OffscreenCanvas(w, hh), x = c.getContext('2d');
    const sr = 48000, aCfg = { codec:'mp4a.40.2', sampleRate:sr, numberOfChannels:2, bitrate:128000 };
    const hasA = !!window.AudioEncoder && (await AudioEncoder.isConfigSupported(aCfg)).supported;
    const mux = new Mp4Muxer.Muxer({ target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:'avc', width:w, height:hh }, audio:hasA ? { codec:'aac', sampleRate:sr, numberOfChannels:2 } : undefined, fastStart:frag ? 'fragmented' : false, firstTimestampBehavior:'strict' });
    const enc = new VideoEncoder({ output:(ch, m) => mux.addVideoChunk(ch, m), error:e => { throw e; } });
    enc.configure({ codec:'avc1.42001f', width:w, height:hh, bitrate:300000, framerate:FPS });
    let ae = null;
    if (hasA) { ae = new AudioEncoder({ output:(ch, m) => mux.addAudioChunk(ch, m), error:e => { throw e; } }); ae.configure(aCfg); }
    const aChunk = 4800; let aPos = 0;
    for (let n = 0; n < N; n++) {
      [n % 16, (n >> 4) % 16, (n >> 8) % 16].forEach((v, i) => { const g = v * 16 + 8; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(i * w / 3, 0, w / 3 + 1, hh); });
      const vf = new VideoFrame(c, { timestamp:Math.round(n * 1e6 / FPS), duration:Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame:n % (FPS * 2) === 0 }); vf.close();
      // som até o tempo do quadro
      while (ae && aPos < (n + 1) / FPS * sr) {
        const d = new Float32Array(aChunk * 2); for (let i = 0; i < aChunk; i++) d[i] = d[i + aChunk] = .3 * Math.sin(2 * Math.PI * 440 * (aPos + i) / sr);
        const ad = new AudioData({ format:'f32-planar', sampleRate:sr, numberOfFrames:aChunk, numberOfChannels:2, timestamp:Math.round(aPos / sr * 1e6), data:d });
        ae.encode(ad); ad.close(); aPos += aChunk;
      }
      if (n % 200 === 0) { await enc.flush(); if (ae) await ae.flush(); }
    }
    await enc.flush(); if (ae) await ae.flush(); mux.finalize();
    const u8 = new Uint8Array(mux.target.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), hasA };
  }, { FPS, DUR, frag });
  const g1 = await mk(false), g2 = await mk(true);
  const fEnd = path.join(outDir, 'trecho-longo.mp4'), fFrag = path.join(outDir, 'trecho-longo-frag.mp4');
  fs.writeFileSync(fEnd, Buffer.from(g1.b64, 'base64')); fs.writeFileSync(fFrag, Buffer.from(g2.b64, 'base64'));
  console.log('vídeo de teste:', (fs.statSync(fEnd).size / 1e6).toFixed(1) + ' MB', g1.hasA ? 'com som' : 'sem som (AudioEncoder sem AAC)');

  // número do quadro desenhado no palco, no meio da camada (render da exportação, sem cache)
  const frameAt = (id, t) => p.evaluate(async ({ id, t }) => {
    const L = S.layers.find(l => l.id === id); T = t; await seekVideos(t);
    const c = softCv(FW(), H()), x = c.getContext('2d'); renderFrame(x, t, 1, true);
    const b = L._bounds, y = b.y + b.h / 2, px = i => { const d = x.getImageData(Math.round(b.x + b.w * (i * 2 + 1) / 6), Math.round(y), 1, 1).data; return Math.round((d[0] - 8) / 16); };
    return px(0) + px(1) * 16 + px(2) * 256;
  }, { id, t });

  // ---------- 1. entra pelo botão Vídeo: a janela de trechos abre (vídeo de 4 min) ----------
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch.setFiles(fEnd);
  await p.waitForSelector('.tr-win', { timeout:10000 });
  await p.waitForFunction(() => TRECHOWIN && TRECHOWIN.ix, null, { timeout:10000 });
  await p.waitForTimeout(600);
  const w0 = await p.evaluate(() => ({ meta:document.querySelector('.tr-win .cut-meta').textContent, n:document.querySelectorAll('.tr-item').length, ok:document.querySelector('.tr-win .btn.primary').textContent,
    keys:overlayOpen(), err:!document.querySelector('.tr-err').hidden, thumbs:document.querySelectorAll('.tr-thumbs canvas').length }));
  ok(w0.meta.includes('4:00') && w0.n === 1 && w0.ok === 'Importar trecho' && !w0.err, 'vídeo de 4 min abre a janela de trechos, com um trecho e o botão Importar', w0);
  ok(w0.keys, 'com a janela aberta os atalhos do editor ficam parados (overlayOpen)');
  // teclas: Home, 10 × → (10 s), I; Shift + → (20 s), O → trecho 10 s a 20 s
  await p.keyboard.press('Home');
  for (let i = 0; i < 10; i++) await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(300); await p.keyboard.press('i');
  await p.keyboard.press('Shift+ArrowRight'); await p.waitForTimeout(300); await p.keyboard.press('o');
  const s1 = await p.evaluate(() => TRECHOWIN.segs.map(s => [s.a, s.b]));
  ok(Math.abs(s1[0][0] - 10) < .05 && Math.abs(s1[0][1] - 20) < .05, 'teclas ← → I O marcam o trecho na agulha (10 s a 20 s)', s1);
  await p.screenshot({ path:path.join(outDir, 'trecho-1-janela.png') });
  // trecho 2 pelos campos: N cria na agulha, os campos mudam começo e fim (2:00 a 2:30,5)
  await p.keyboard.press('n');
  const inputs = p.locator('.tr-item').nth(1).locator('input.tr-t');
  await inputs.nth(0).fill('2:00'); await inputs.nth(0).press('Enter');
  await inputs.nth(1).fill('2:30,5'); await inputs.nth(1).press('Enter');
  const s2 = await p.evaluate(() => ({ segs:TRECHOWIN.segs.map(s => [s.a, s.b]), ok:document.querySelector('.tr-win .btn.primary').textContent, sum:document.querySelector('.tr-sum').textContent }));
  ok(s2.segs.length === 2 && Math.abs(s2.segs[1][0] - 120) < .01 && Math.abs(s2.segs[1][1] - 150.5) < .01 && s2.ok === 'Importar 2 trechos', 'N cria outro trecho e os campos de tempo aceitam 2:00 e 2:30,5', s2);
  // a barra mostra os dois trechos; Ctrl + roda dá zoom nela
  const bb = await p.locator('.tr-bar').boundingBox();
  await p.mouse.move(bb.x + bb.width * .5, bb.y + bb.height / 2); await p.keyboard.down('Control'); await p.mouse.wheel(0, -400); await p.keyboard.up('Control');
  const z1 = await p.evaluate(() => ({ v0:TRECHOWIN.v0, v1:TRECHOWIN.v1, segs:document.querySelectorAll('.tr-seg').length }));
  ok(z1.v1 - z1.v0 < 240 && z1.segs === 2, 'Ctrl + roda aproxima a barra do vídeo', z1);
  await p.screenshot({ path:path.join(outDir, 'trecho-2-dois.png') });

  // ---------- 2. importar: dois vídeos um depois do outro, o arquivo cresce para caber, um desfazer só ----------
  const d0 = await p.evaluate(() => S.duration);
  await p.locator('.tr-win .btn.primary').click();
  await p.waitForFunction(() => S.layers.filter(l => l.video).length === 2, null, { timeout:30000 });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const vs = S.layers.filter(l => l.video).sort((a, b) => a.start - b.start), au = S.layers.filter(l => l.type === 'audio');
    return { win:!!document.querySelector('.tr-win'), vs:vs.map(l => ({ id:l.id, s:l.start, e:l.end, vIn:l.vIn, vOut:l.vOut, vdur:l.vdur, name:l.name })), au:au.length, D:S.duration, undo:undoStack.length };
  });
  console.log('   camadas:', JSON.stringify(r.vs));
  const [A, B] = r.vs;
  ok(!r.win && r.vs.length === 2, 'a janela fecha e os dois trechos viram dois vídeos', r);
  ok(A && Math.abs((A.vOut - A.vIn) - 10) < .02 && Math.abs((B.vOut - B.vIn) - 30.5) < .02, 'cada vídeo tem a duração do trecho (10 s e 30,5 s)', r.vs);
  ok(A && A.vdur < 15 && B.vdur < 35, 'só o trecho foi copiado (o arquivo guardado tem segundos, não 4 min)', r.vs.map(v => v.vdur));
  ok(A && Math.abs(B.s - A.e) < .01 && Math.abs((A.e - A.s) - 10) < .02 && Math.abs((B.e - B.s) - 30.5) < .02, 'na timeline um depois do outro, cada barra do tamanho do trecho', r.vs);
  ok(r.D > d0 && r.D >= B.e - .01, `o arquivo cresceu para caber (${d0} s → ${r.D} s)`, r);
  if (g1.hasA) ok(r.au === 2, 'cada trecho trouxe o som numa camada separada', r.au);
  // o quadro no palco é o do tempo certo do original (10 s + x e 120 s + x)
  // depois da entrada (fade) e antes do fim
  for (const [L, a, xs] of [[A, 10, [1, 3.3, 8.5]], [B, 120, [1, 15.05, 28.4]]]) for (const x of xs) {
    const n = await frameAt(L.id, L.s + x + .001), want = Math.floor((a + x) * FPS + 1e-6);
    ok(Math.abs(n - want) <= 0, `palco em ${(L.s + x).toFixed(2)} s mostra o quadro ${want} do original (${a + x} s)`, { n, want });
  }
  await p.evaluate(() => { T = S.layers.filter(l => l.video).sort((a, b) => a.start - b.start)[1].start + 1; needs = true; });
  await p.waitForTimeout(500);
  await p.screenshot({ path:path.join(outDir, 'trecho-3-importado.png') });
  // um Ctrl+Z desfaz tudo (os dois vídeos, os sons e a duração)
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  const u = await p.evaluate(() => ({ v:S.layers.filter(l => l.video).length, a:S.layers.filter(l => l.type === 'audio').length, D:S.duration }));
  ok(u.v === 0 && u.a === 0 && u.D === d0, 'um Ctrl+Z desfaz os dois trechos e a duração', u);
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);

  // ---------- 3. MP4 fragmentado e "Cancelar" ----------
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch2.setFiles(fFrag);
  await p.waitForSelector('.tr-win'); await p.waitForFunction(() => TRECHOWIN && (TRECHOWIN.ix || TRECHOWIN.ixErr), null, { timeout:10000 });
  const fr = await p.evaluate(() => ({ err:TRECHOWIN.ixErr, n:TRECHOWIN.ix && TRECHOWIN.ix.V.s.length }));
  ok(!fr.err && fr.n === FPS * DUR, 'MP4 fragmentado: o índice lê todos os quadros dos moof', fr);
  const inp = p.locator('.tr-item').nth(0).locator('input.tr-t');
  await inp.nth(0).fill('3:05,3'); await inp.nth(0).press('Enter'); await inp.nth(1).fill('3:12'); await inp.nth(1).press('Enter');
  await p.locator('.tr-win .btn.primary').click();
  await p.waitForFunction(() => S.layers.filter(l => l.video).length === 3, null, { timeout:30000 }); await p.waitForTimeout(500);
  const C = await p.evaluate(() => { const l = S.layers.filter(l => l.video).sort((a, b) => b.start - a.start)[0]; return { id:l.id, s:l.start, vIn:l.vIn, vOut:l.vOut }; });
  for (const x of [1, 5.5]) { const n = await frameAt(C.id, C.s + x + .001), want = Math.floor((185.3 + x) * FPS + 1e-6); ok(Math.abs(n - want) <= 0, `fragmentado: quadro ${want} em ${185.3 + x} s`, { n, want }); }
  const [ch3] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch3.setFiles(fEnd); await p.waitForSelector('.tr-win');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const cn = await p.evaluate(() => ({ win:!!document.querySelector('.tr-win'), v:S.layers.filter(l => l.video).length, open:TRECHOWIN }));
  ok(!cn.win && cn.v === 3 && !cn.open, 'Esc cancela sem adicionar nada', cn);

  // ---------- 4. duração até 10 min ----------
  const dur = async v => { await p.locator('#dur').fill(String(v)); await p.locator('#dur').press('Enter'); await p.waitForTimeout(150); return p.evaluate(() => ({ D:S.duration, tc:$('#tc').textContent })); };
  const dA = await dur(600), dB = await dur(900);
  ok(dA.D === 600 && dA.tc.includes('10:00'), 'Duração aceita 600 s (10 min) e o tempo total aparece em minutos', dA);
  ok(dB.D === 600, 'mais de 10 min fica em 10 min', dB);

  // ---------- 5. zoom da timeline (Ctrl + roda), agulha e clique continuam no tempo certo ----------
  await p.evaluate(() => { RT.tlz = 1; renderTimeline(); });
  const tb = await p.locator('#tl .tl-ruler .tl-scale').boundingBox();
  await p.mouse.move(tb.x + tb.width * .3, tb.y + 10);
  await p.keyboard.down('Control'); for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -300); await p.keyboard.up('Control');
  await p.waitForTimeout(200);
  const zt = await p.evaluate(() => { const tl = $('#tl'); return { z:RT.tlz, cls:tl.classList.contains('zoomed'), sw:tl.scrollWidth, cw:tl.clientWidth, sl:tl.scrollLeft, fit:!!tl.querySelector('.tl-fit'), labels:[...tl.querySelectorAll('.tl-ruler b')].slice(0, 4).map(b => b.textContent) }; });
  ok(zt.z > 3 && zt.cls && zt.sw > zt.cw * 2 && zt.sl > 0 && zt.fit, 'Ctrl + roda na timeline aproxima, ela rola para os lados e aparece "Ajustar"', zt);
  // o tempo sob o ponteiro ficou parado (30% de 600 s = 180 s)
  const tUnder = await p.evaluate(x => { const g = tlGeom(); return (x - g.x0) / g.w * S.duration; }, tb.x + tb.width * .3);
  ok(Math.abs(tUnder - 180) < 1, 'o tempo sob o ponteiro continua no mesmo lugar depois do zoom', tUnder);
  // clicar na régua leva a agulha ao tempo do clique e a agulha é desenhada ali
  const tb2 = await p.locator('#tl').boundingBox(); // a régua passa da tela com zoom: o que se vê é a caixa da timeline
  await p.mouse.click(tb2.x + tb2.width - 200, tb2.y + 10); await p.waitForTimeout(150);
  const hd = await p.evaluate(x => { const g = tlGeom(), head = $('#tl .tl-head'), hr = head.getBoundingClientRect(); return { T, want:(x - g.x0) / g.w * S.duration, hx:hr.left, x, vis:head.style.visibility }; }, tb2.x + tb2.width - 200);
  ok(Math.abs(hd.T - hd.want) < .05 && Math.abs(hd.hx - hd.x) < 2.5 && hd.vis !== 'hidden', 'com zoom, clicar na régua leva a agulha ao tempo certo e ela aparece embaixo do ponteiro', hd);
  // os nomes ficam parados à esquerda
  const nm = await p.evaluate(() => { const tl = $('#tl'), a = tl.querySelector('.tl-row .tl-nm'); return a ? Math.round(a.getBoundingClientRect().left - tl.getBoundingClientRect().left) : null; });
  ok(nm !== null && Math.abs(nm) <= 1, 'os nomes das camadas não rolam junto', nm);
  await p.screenshot({ path:path.join(outDir, 'trecho-4-zoom-timeline.png') });
  await p.locator('#tl .tl-fit').click(); await p.waitForTimeout(150);
  const zf = await p.evaluate(() => ({ z:RT.tlz, cls:$('#tl').classList.contains('zoomed'), sw:$('#tl').scrollWidth, cw:$('#tl').clientWidth }));
  ok(zf.z === 1 && !zf.cls && zf.sw <= zf.cw + 1, '"Ajustar" volta a mostrar o arquivo inteiro', zf);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
