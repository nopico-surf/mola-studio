// Teste no navegador: Importar trecho → "Um arquivo cada" com gordura (pedido do usuário: cortes de um vídeo longo, cada um no seu
// arquivo, com sobra antes e depois para transição). O vídeo de teste (200 s, H.264 + AAC) é gravado no próprio navegador com o
// número do quadro em três faixas horizontais de cinza: com o vídeo cobrindo um quadro vertical (laterais cortadas) dá para conferir
// no palco se o quadro que aparece é o do tempo certo do original.
// Caminho real: botão Vídeo → janela de trechos → "Um arquivo cada" → Gordura → campos de tempo → Criar 2 arquivos → abrir o arquivo.
// Rodar: node testes/trecho-em-arquivos.js (prints na pasta temporária, mola-testes/arquivos-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const FPS = 10, DUR = 200;
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; T = 0; setDuration(8); changed({ layers:true, props:true }); renderTimeline(); });
  await p.evaluate(() => flushSave());

  // vídeo de teste: quadro n = três faixas horizontais (n % 16, n / 16 % 16, n / 256 % 16) × 16 de cinza; som = tom de 440 Hz
  const g = await p.evaluate(async ({ FPS, DUR }) => {
    const w = 160, hh = 96, N = FPS * DUR, c = new OffscreenCanvas(w, hh), x = c.getContext('2d');
    const sr = 48000, aCfg = { codec:'mp4a.40.2', sampleRate:sr, numberOfChannels:2, bitrate:128000 };
    const hasA = !!window.AudioEncoder && (await AudioEncoder.isConfigSupported(aCfg)).supported;
    const mux = new Mp4Muxer.Muxer({ target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:'avc', width:w, height:hh }, audio:hasA ? { codec:'aac', sampleRate:sr, numberOfChannels:2 } : undefined, fastStart:false, firstTimestampBehavior:'strict' });
    const enc = new VideoEncoder({ output:(ch, m) => mux.addVideoChunk(ch, m), error:e => { throw e; } });
    enc.configure({ codec:'avc1.42001f', width:w, height:hh, bitrate:300000, framerate:FPS });
    let ae = null;
    if (hasA) { ae = new AudioEncoder({ output:(ch, m) => mux.addAudioChunk(ch, m), error:e => { throw e; } }); ae.configure(aCfg); }
    const aChunk = 4800; let aPos = 0;
    for (let n = 0; n < N; n++) {
      [n % 16, (n >> 4) % 16, (n >> 8) % 16].forEach((v, i) => { const g = v * 16 + 8; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(0, i * hh / 3, w, hh / 3 + 1); });
      const vf = new VideoFrame(c, { timestamp:Math.round(n * 1e6 / FPS), duration:Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame:n % (FPS * 2) === 0 }); vf.close();
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
  }, { FPS, DUR });
  const fVid = path.join(outDir, 'arquivos-longo.mp4'); fs.writeFileSync(fVid, Buffer.from(g.b64, 'base64'));
  console.log('vídeo de teste:', (fs.statSync(fVid).size / 1e6).toFixed(1) + ' MB', g.hasA ? 'com som' : 'sem som (AudioEncoder sem AAC)');

  // número do quadro no meio da camada de vídeo (faixas horizontais), render da exportação sem cache
  const frameAt = t => p.evaluate(async t => {
    T = t; await seekVideos(t);
    const c = softCv(FW(), H()), x = c.getContext('2d'); renderFrame(x, t, 1, true);
    const b = S.layers.find(l => l.video)._bounds;
    const px = i => { const d = x.getImageData(Math.round(b.x + b.w / 2), Math.round(b.y + b.h * (i * 2 + 1) / 6), 1, 1).data; return Math.round((d[0] - 8) / 16); };
    return px(0) + px(1) * 16 + px(2) * 256;
  }, t);
  const openWin = async () => {
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await ch.setFiles(fVid);
    await p.waitForSelector('.tr-win', { timeout:10000 });
    await p.waitForFunction(() => TRECHOWIN && TRECHOWIN.ix, null, { timeout:10000 });
    await p.waitForTimeout(300);
  };
  const setSeg = async (i, a, bb) => {
    const ins = p.locator('.tr-item').nth(i).locator('input.tr-t');
    await ins.nth(0).fill(a); await ins.nth(0).press('Enter');
    await ins.nth(1).fill(bb); await ins.nth(1).press('Enter');
  };

  // ---------- 1. janela: "Como entram" com Neste arquivo | Um arquivo cada, e Gordura ----------
  const before = await p.evaluate(async () => ({ id:FILES.id, n:S.layers.length, files:((await DB.get('files')) || []).length }));
  await openWin();
  const w0 = await p.evaluate(() => ({ segs:[...document.querySelectorAll('.tr-out .segs button')].map(b => [b.textContent, b.getAttribute('aria-pressed')]),
    fat:document.querySelector('.tr-fat') && document.querySelector('.tr-fat').value, ok:document.querySelector('.tr-win .btn.primary').textContent }));
  ok(w0.segs.length === 2 && w0.segs[0][0] === 'Neste arquivo' && w0.segs[0][1] === 'true' && w0.fat === '1 s' && w0.ok === 'Importar trecho',
    'a janela mostra "Neste arquivo | Um arquivo cada" (começa em Neste arquivo) e a Gordura de 1 s', w0);
  await p.locator('.tr-out .segs button', { hasText:'Um arquivo cada' }).click();
  await p.locator('.tr-fat').fill('2'); await p.locator('.tr-fat').press('Enter');
  await setSeg(0, '0:10', '0:20');
  await p.keyboard.press('n');
  await setSeg(1, '2:00', '2:30,5');
  const w1 = await p.evaluate(() => ({ ok:document.querySelector('.tr-win .btn.primary').textContent, fat:document.querySelector('.tr-fat').value, own:TRECHOWIN.own, fatV:TRECHOWIN.fat,
    how:document.querySelector('.tr-out .hint').textContent, pref:localStorage.getItem('mola-trecho') }));
  ok(w1.ok === 'Criar 2 arquivos' && w1.own && w1.fatV === 2 && w1.fat === '2 s', '"Um arquivo cada" + gordura 2 s: o botão vira "Criar 2 arquivos"', w1);
  ok(/arquivo novo/.test(w1.how) && /gordura/i.test(w1.how), 'o texto da seção explica o que acontece', w1.how);
  ok(JSON.parse(w1.pref || '{}').own === true && JSON.parse(w1.pref || '{}').fat === 2, 'a escolha fica guardada para a próxima vez', w1.pref);
  await p.screenshot({ path:path.join(outDir, 'arquivos-1-janela.png') });

  // ---------- 2. Criar: dois arquivos novos, o aberto não muda ----------
  await p.locator('.tr-win .btn.primary').click();
  await p.waitForSelector('.tr-win', { state:'detached', timeout:20000 });
  let made = null;
  for (let k = 0; k < 100 && !made; k++) {
    await p.waitForTimeout(200);
    made = await p.evaluate(async n0 => { const l = (await DB.get('files')) || []; return l.length >= n0 + 2 ? l : null; }, before.files);
  }
  ok(!!made, 'dois arquivos novos no índice', made && made.map(f => f.name));
  if (!made) { await b.close(); process.exit(1); }
  const after = await p.evaluate(() => ({ id:FILES.id, n:S.layers.length }));
  ok(after.id === before.id && after.n === before.n, 'o arquivo aberto continua o mesmo, sem camada nova', { before, after });
  const news = made.filter(f => /arquivos-longo/.test(f.name)).sort((a, b2) => b2.updatedAt - a.updatedAt);
  ok(news.length === 2 && news[0].name !== news[1].name && news.every(f => f.thumb && f.thumb.startsWith('data:image/jpeg')), 'os dois têm nome próprio e miniatura', news.map(f => f.name));
  ok(/0\.10/.test(news[0].name) && /2\.00/.test(news[1].name), 'o 1º trecho fica no topo da lista (mais recente)', news.map(f => f.name));
  const st = await p.evaluate(async ids => Promise.all(ids.map(async id => JSON.parse(await DB.get('file:' + id)))), news.map(f => f.id));
  const info = st.map(s => { const V = s.layers.find(l => l.video), A = s.layers.find(l => l.type === 'audio');
    return { dur:s.duration, fmt:s.format, n:s.layers.length, vIn:V && V.vIn, vOut:V && V.vOut, vdur:V && V.vdur, start:V && V.start, end:V && V.end, size:V && V.size, mh:V && V.mh, inP:V && V.in,
      aud:!!A, link:A && A.link === V.id, grp:!!(A && V.grp && A.grp === V.grp) }; });
  console.log('arquivos:', JSON.stringify(info));
  const [c1, c2] = info;
  ok(Math.abs(c1.dur - 10) < .01 && Math.abs(c2.dur - 30.5) < .01, 'cada arquivo dura o trecho (10 s e 30,5 s)', [c1.dur, c2.dur]);
  ok(c1.start === 0 && Math.abs(c1.end - 10) < .01 && c1.inP === 'cut', 'o vídeo ocupa o arquivo todo, sem animação de entrada', c1);
  ok(Math.abs(c1.vIn - 2) < .06 && Math.abs(c1.vOut - c1.vIn - 10) < .01 && c1.vdur - c1.vOut > 1.9, 'trecho 1: 2 s de gordura antes (vIn) e depois (sobra no fim do vídeo)', c1);
  ok(Math.abs(c2.vIn - 2) < .06 && c2.vdur - c2.vOut > 1.9, 'trecho 2: gordura antes e depois', c2);
  if (g.hasA) ok(c1.aud && c1.link && c1.grp, 'o som entra numa camada ligada ao vídeo, no mesmo grupo', c1);
  ok(c1.size > 0 && Math.abs(c1.mh / c1.size - ({ '4x5':1350, '9x16':1920, '1x1':1080, '3x4':1440 }[c1.fmt] || c1.mh / c1.size * 1080) / 1080) < .01, 'o vídeo cobre o quadro do formato do arquivo', c1);

  // ---------- 3. abrir o arquivo: o quadro do palco é o do tempo certo do original ----------
  await p.evaluate(id => openFile(id), news[0].id);
  await p.waitForFunction(id => FILES.id === id, news[0].id, { timeout:10000 });
  await p.evaluate(() => videosReady());
  await p.waitForTimeout(500);
  const f0 = await frameAt(.05), f5 = await frameAt(5.05), f9 = await frameAt(9.85);
  ok(f0 === 100 && f5 === 150 && f9 === 198, 'no arquivo do trecho 1 o palco mostra os quadros 100, 150 e 198 do original (10 s a 20 s)', { f0, f5, f9 });
  await p.screenshot({ path:path.join(outDir, 'arquivos-2-aberto.png') });
  // a gordura: puxar o fim da barra além do corte mostra o que vem depois (o fim do arquivo cresce, a borda direita corta mais longe)
  const ext = await p.evaluate(() => { const V = S.layers.find(l => l.video); setDuration(12); V.vOut = +(V.vOut + 2).toFixed(3); vidFitEnd(V); changed(); return { end:V.end, vOut:V.vOut }; });
  const f11 = await frameAt(11.85);
  ok(Math.abs(ext.end - 12) < .01 && f11 === 218, 'com a gordura do fim, o vídeo continua até o quadro 218 (21,8 s do original)', { ext, f11 });

  // ---------- 4. "Neste arquivo" com gordura: o vídeo entra no arquivo aberto, cortado no ponto marcado ----------
  await p.evaluate(() => { undo(); S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; T = 0; changed({ layers:true, props:true }); renderTimeline(); });
  await openWin();
  const w2 = await p.evaluate(() => ({ own:TRECHOWIN.own, fat:TRECHOWIN.fat, pressed:document.querySelector('.tr-out .segs button[aria-pressed="true"]').textContent }));
  ok(w2.own && w2.fat === 2 && w2.pressed === 'Um arquivo cada', 'na próxima vez a janela abre com a escolha anterior', w2);
  await p.locator('.tr-out .segs button', { hasText:'Neste arquivo' }).click();
  await setSeg(0, '0:30', '0:35');
  const okTxt = await p.locator('.tr-win .btn.primary').textContent();
  ok(okTxt === 'Importar trecho', 'Neste arquivo: o botão volta a ser "Importar trecho"', okTxt);
  await p.locator('.tr-win .btn.primary').click();
  await p.waitForSelector('.tr-win', { state:'detached', timeout:20000 });
  await p.waitForFunction(() => S.layers.some(l => l.video), null, { timeout:20000 });
  await p.evaluate(() => videosReady()); await p.waitForTimeout(400);
  const L3 = await p.evaluate(() => { const V = S.layers.find(l => l.video); return { id:V.id, start:V.start, vIn:V.vIn, vOut:V.vOut, vdur:V.vdur }; });
  const g0 = await frameAt(L3.start + 1.55); // depois do fade de entrada
  ok(Math.abs(L3.vIn - 2) < .06 && L3.vdur - L3.vOut > 1.9 && g0 === 315, 'Neste arquivo: gordura de 2 s guardada e o vídeo começa nos 30 s (quadro 315 aos 1,5 s)', { L3, g0 });

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
