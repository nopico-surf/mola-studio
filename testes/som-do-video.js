// Teste no navegador: som do vídeo. Um vídeo com som entra pelo botão "Vídeo" e ganha uma camada de Áudio separada, no grupo dele;
// o som aparece na lista e na timeline (com a onda), entra na mistura (prévia e MP4), corta junto com o vídeo pela borda da barra,
// pode ser apagado (o grupo que era só dos dois se desfaz, Ctrl+Z traz de volta) e volta pelo botão "Usar o som do vídeo".
// Vídeo sem faixa de som não ganha camada. O vídeo de teste é gravado no próprio navegador (canvas + tom de 440 Hz).
// Rodar: node testes/som-do-video.js (prints na pasta temporária, mola-testes/som-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  // Chrome de verdade (MP4 com H.264/AAC); sem ele, o Chromium do Playwright (WebM)
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; T = 0; changed({ layers:true, props:true }); renderTimeline(); });

  // grava os vídeos de teste: com som (2,5 s) e sem faixa de som
  const rec = await p.evaluate(async () => {
    const mk = async withSound => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
      const st = c.captureStream(30), tracks = [...st.getVideoTracks()];
      let ac = null;
      if (withSound) { ac = new AudioContext(); const o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = 440; o.connect(d); o.start(); tracks.push(...d.stream.getAudioTracks()); }
      const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(new MediaStream(tracks), { mimeType:mime }), ch = [];
      r.ondataavailable = e => e.data.size && ch.push(e.data);
      const done = new Promise(res => r.onstop = res); r.start(100);
      const t0 = performance.now();
      await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t / 10 % 360},70%,50%)`; x.fillRect(0, 0, 320, 240); if (t > 2500) return res(); requestAnimationFrame(f); }; f(); });
      r.stop(); await done; if (ac) ac.close();
      const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return { b64:btoa(s), type:blob.type };
    };
    return { snd:await mk(true), mute:await mk(false) };
  });
  const ext = rec.snd.type.includes('mp4') ? 'mp4' : 'webm';
  const fSnd = path.join(outDir, 'som-com-som.' + ext), fMute = path.join(outDir, 'som-sem-som.' + ext);
  fs.writeFileSync(fSnd, Buffer.from(rec.snd.b64, 'base64')); fs.writeFileSync(fMute, Buffer.from(rec.mute.b64, 'base64'));
  console.log('vídeo de teste:', rec.snd.type);

  // entra pelo botão "Vídeo" de Adicionar (a janela de arquivo do sistema)
  const addVideo = async f => {
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await ch.setFiles(f);
    await p.waitForFunction(n => S.layers.filter(l => l.video).length >= n, 1 + (await p.evaluate(() => S.layers.filter(l => l.video).length)), { timeout:15000 });
    await p.waitForTimeout(400);
  };
  await addVideo(fSnd);
  const r1 = await p.evaluate(() => {
    const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio');
    return { has:!!A, grp:!!(V.grp && A && A.grp === V.grp), link:A && A.link === V.id, sel:RT.selected === V.id, peaks:A && A.peaks && A.peaks.length,
      same:A && A.start === V.start && A.end === V.end, list:!!(A && document.querySelector(`#layers [data-id="${A.id}"]`)),
      wave:!!(A && document.querySelector(`#tl .tl-row[data-id="${A.id}"] canvas.tl-awave`)), grpRow:!!document.querySelector(`#tl .tl-row[data-gid="${V.grp}"]`),
      note:document.querySelector('#props')?.textContent.includes('O som está na camada'), hasAudio:hasAudio() };
  });
  ok(r1.has, 'vídeo com som ganha uma camada de Áudio', r1);
  ok(r1.grp && r1.grpRow, 'vídeo e som ficam no mesmo grupo (com linha de grupo na timeline)', r1);
  ok(r1.link && r1.same, 'o som começa e termina junto com o vídeo', r1);
  ok(r1.sel && r1.note, 'o vídeo continua escolhido e o painel diz onde está o som', r1);
  ok(r1.list && r1.wave && r1.peaks > 10, 'o som aparece na lista de Camadas e na timeline com a onda', r1);
  ok(r1.hasAudio, 'o arquivo passa a ter som (prévia e exportação)');
  await p.screenshot({ path:path.join(outDir, 'som-1-importado.png') });
  // clicar no vídeo no palco escolhe o vídeo (o som não aparece no palco); o cabeçalho do grupo escolhe os dois
  const ctr = await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderProps(); const V = S.layers.find(l => l.video), r = $('#cv').getBoundingClientRect(), b = V._bounds; return { x:r.left + (b.x + b.w / 2) / FW() * r.width, y:r.top + (b.y + b.h / 2) / H() * r.height }; });
  await p.mouse.click(ctr.x, ctr.y); await p.waitForTimeout(200);
  const rc = await p.evaluate(() => ({ t:selL() && selL().type, v:!!(selL() && selL().video), n:pickedLayers().length, g:wholeGroup(), cut:document.querySelector('#props')?.textContent.includes('Começa em') }));
  ok(rc.v && rc.n === 1 && !rc.g && rc.cut, 'clicar no vídeo no palco escolhe o vídeo, com o painel dele', rc);
  await p.evaluate(() => { const V = S.layers.find(l => l.video); document.querySelector(`#layers [data-gid="${V.grp}"]`).click(); });
  await p.waitForTimeout(200);
  const rg = await p.evaluate(() => ({ g:!!wholeGroup(), n:pickedLayers().length, chip:document.querySelector('#props .type-chip')?.textContent }));
  ok(rg.g && rg.n === 2 && rg.chip === 'Grupo', 'o cabeçalho do grupo escolhe o vídeo e o som juntos', rg);

  // a mistura tem o tom dentro do tempo do vídeo e silêncio fora
  const mixAt = () => p.evaluate(async () => {
    const A = S.layers.find(l => l.type === 'audio'), m = await buildMix(48000, S.duration), d = m.getChannelData(0);
    const rms = (t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * 48000); i < Math.min(d.length, t1 * 48000); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
    return { in:A ? rms(A.start + .3, Math.min(A.end, A.start + 1.5)) : 0, out:A ? rms(A.end + .2, Math.min(S.duration, A.end + 1)) : 0, start:A && A.start, end:A && A.end };
  });
  const m1 = await mixAt();
  ok(m1.in > .05, 'a mistura toca o som do vídeo no tempo dele', m1);
  ok(m1.out < .005, 'depois do fim do vídeo, silêncio', m1);

  // corta o vídeo pela borda direita da barra: o som corta junto
  const vb = await p.evaluate(() => {
    document.querySelectorAll('.toast').forEach(t => { t.style.pointerEvents = 'none'; }); // o aviso de "vídeo adicionado" fica por cima da timeline
    const V = S.layers.find(l => l.video), bar = document.querySelector(`#tl .tl-row[data-id="${V.id}"] .tl-bar`); bar.scrollIntoView({ block:'center' });
    const r = bar.getBoundingClientRect(), at = document.elementFromPoint(r.right - 3, r.top + r.height / 2);
    return { x:r.right - 3, y:r.top + r.height / 2, w:document.querySelector('#tl .tl-scale').getBoundingClientRect().width, at:at && at.className, end0:V.end, r:[r.left, r.right, r.top, r.bottom] };
  });  await p.mouse.move(vb.x, vb.y); await p.mouse.down(); await p.mouse.move(vb.x - 20, vb.y, { steps:4 }); await p.mouse.move(vb.x - vb.w * .1, vb.y, { steps:6 }); await p.mouse.up(); await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => { const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'); return { ve:V.end, ae:A.end, vo:V.vOut, ao:A.vOut }; });
  ok(r2.vo != null && Math.abs(r2.ve - r2.ae) < 1e-6 && r2.vo === r2.ao, 'cortar o vídeo na timeline corta o som junto', r2);
  const m2 = await mixAt();
  ok(m2.in > .05 && m2.out < .005, 'a mistura segue o corte', m2);

  // apagar o som: clica no nome dele na timeline e aperta Delete
  await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); document.querySelector(`#tl .tl-row[data-id="${A.id}"] .tl-nm`).scrollIntoView(); });
  const aid = await p.evaluate(() => S.layers.find(l => l.type === 'audio').id);
  await p.locator(`#tl .tl-row[data-id="${aid}"] .tl-nm .lnm`).click(); await p.waitForTimeout(200);
  const pick = await p.evaluate(() => ({ sel:selL() && selL().type, n:pickedLayers().length, props:document.querySelector('#props')?.textContent.includes('Volume') }));
  ok(pick.sel === 'audio' && pick.n === 1 && pick.props, 'clicar no som na timeline escolhe só ele, com o painel de Volume', pick);
  await p.keyboard.press('Delete'); await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => { const V = S.layers.find(l => l.video); return { aud:S.layers.some(l => l.type === 'audio'), vid:!!V, grp:V && V.grp, groups:Object.keys(S.groups || {}).length, hasAudio:hasAudio(), btn:!!V && (select(V.id), [...document.querySelectorAll('#props button')].some(x => x.textContent === 'Usar o som do vídeo')) }; });
  ok(!r3.aud && r3.vid, 'Delete apaga só o som; o vídeo fica', r3);
  ok(!r3.grp && !r3.groups, 'o grupo que era só do vídeo com o som se desfaz', r3);
  ok(!r3.hasAudio, 'sem o som, a exportação sai muda');
  ok(r3.btn, 'o painel do vídeo oferece "Usar o som do vídeo"', r3);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  const r4 = await p.evaluate(() => { const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'); return { aud:!!A, grp:!!(V && A && V.grp && V.grp === A.grp) }; });
  ok(r4.aud && r4.grp, 'Ctrl+Z traz o som de volta, no grupo', r4);
  // apaga de novo e traz pelo botão do painel
  await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); select(A.id, true); deleteLayer(A); select(S.layers.find(l => l.video).id); });
  await p.locator('#props button', { hasText:'Usar o som do vídeo' }).click();
  await p.waitForFunction(() => S.layers.some(l => l.type === 'audio'), null, { timeout:10000 });
  const r5 = await p.evaluate(() => { const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'); return { grp:!!(V.grp && V.grp === A.grp), cut:A.vOut === V.vOut, end:A.end === V.end }; });
  ok(r5.grp && r5.cut && r5.end, '"Usar o som do vídeo" põe o som de volta, com o corte do vídeo', r5);

  // exportação: o MP4 sai com faixa de som e o som não é silêncio
  const ex = await p.evaluate(async () => {
    const res = await renderVideo(() => {}, [0]); if (!res || res === 'cancel') return { res:String(res) };
    let rms = -1; try { const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await res.blob.arrayBuffer()); const d = buf.getChannelData(0); let s = 0; for (const v of d) s += v * v; rms = Math.sqrt(s / d.length); } catch (e) { rms = -2; }
    return { audio:res.audio, codec:res.codec, rms };
  });
  ok(ex.audio, 'o MP4 exportado tem faixa de som', ex);
  ok(ex.rms > .01 || ex.rms === -2, 'o som do MP4 não é silêncio' + (ex.rms === -2 ? ' (este navegador não lê o MP4 de volta)' : ''), ex);

  // apagar o vídeo (escolhido sozinho) leva o som junto; Ctrl+Z traz os dois
  await p.evaluate(() => select(S.layers.find(l => l.video).id)); await p.keyboard.press('Delete'); await p.waitForTimeout(200);
  const r7 = await p.evaluate(() => ({ v:S.layers.some(l => l.video), a:S.layers.some(l => l.type === 'audio'), g:Object.keys(S.groups || {}).length }));
  ok(!r7.v && !r7.a && !r7.g, 'apagar o vídeo apaga o som dele e o grupo', r7);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => S.layers.some(l => l.video) && S.layers.some(l => l.type === 'audio')), 'Ctrl+Z traz vídeo e som');

  // vídeo sem faixa de som: nenhuma camada de áudio nova
  const nA = await p.evaluate(() => S.layers.filter(l => l.type === 'audio').length);
  await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderProps(); });
  await addVideo(fMute);
  const r6 = await p.evaluate(() => S.layers.filter(l => l.type === 'audio').length);
  ok(r6 === nA, 'vídeo sem som não ganha camada de Áudio', { antes:nA, depois:r6 });

  // tocar não dá erro com o som na timeline
  await p.keyboard.press('Escape'); await p.evaluate(() => { T = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(800); await p.keyboard.press('Space');
  await p.screenshot({ path:path.join(outDir, 'som-2-final.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
