// Teste no navegador: volume da música que sobe num momento (Trilha → "Volume ao longo do vídeo" → "Sobe depois").
// Uma música de teste (tom constante, WAV gerado no próprio navegador) entra pela Trilha; os cliques de verdade ligam a subida,
// a agulha marca o momento ("Subir na agulha") e a mistura (a mesma da prévia e do MP4) fica baixa antes, sobe sem degrau e
// chega ao Volume depois. Ctrl+Z desliga de novo. "Sempre igual" = a mistura de antes.
// Rodar: node testes/volume-que-sobe.js (print em mola-testes/volume-sobe.png, na pasta temporária)
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
  await p.evaluate(async () => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.still = false; S.duration = 8; T = 0;
    changed({ layers:true, props:true }); renderTimeline();
    // WAV de 10 s, 440 Hz, amplitude 0,5
    const sr = 48000, n = sr * 10, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * .5 * 32767), true);
    await setMusicFile(new File([buf], 'tom.wav', { type:'audio/wav' }));
    S.audio.from = 'zero'; S.audio.vol = 1; renderAudio();
    foldReveal($('#audioBox'));
  });
  await p.waitForFunction(() => S.audio && S.audio.id);
  const rmsAt = () => p.evaluate(async () => {
    const m = await buildMix(48000, S.duration), d = m.getChannelData(0);
    const rms = (t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * 48000); i < t1 * 48000; i++) { s += d[i] * d[i]; n++; } return +Math.sqrt(s / n).toFixed(4); };
    // maior salto entre janelas de 20 ms seguidas (degrau = corte seco)
    let jump = 0, prev = rms(.5, .52); for (let t = .52; t < 6; t += .02) { const r = rms(t, t + .02); jump = Math.max(jump, Math.abs(r - prev)); prev = r; }
    return { a:rms(1, 2), mid:rms(3.6, 3.65), b:rms(5, 6), jump:+jump.toFixed(4) };
  });
  const flat = await rmsAt();
  ok(Math.abs(flat.a - flat.b) < .01, 'sem subida o volume é igual o vídeo todo', flat);

  // liga pelo botão, com a agulha em 3 s
  await p.evaluate(() => { T = 3; });
  await p.locator('#audioBox button', { hasText:'Sobe depois' }).click(); await p.waitForTimeout(150);
  const r1 = await p.evaluate(() => ({ rise:S.audio.rise, at:S.audio.riseAt, txt:$('#audioBox').textContent }));
  ok(r1.rise === 'up' && r1.at === 3, '"Sobe depois" liga com o momento na agulha', r1);
  ok(r1.txt.includes('Volume antes') && r1.txt.includes('Sobe em') && r1.txt.includes('Duração da subida'), 'aparecem os campos da subida', r1);
  // move a agulha e marca de novo pelo botão
  await p.evaluate(() => { T = 3.2; });
  await p.locator('#audioBox button', { hasText:'Subir na agulha' }).click(); await p.waitForTimeout(150);
  const at = await p.evaluate(() => S.audio.riseAt);
  ok(at === 3.2, '"Subir na agulha" marca o momento onde está a agulha', at);
  const up = await rmsAt();
  const full = flat.b, lo = .2 * full;
  ok(Math.abs(up.a - lo) < .01, 'antes do momento a música fica no "Volume antes" (20%)', { up, lo });
  ok(Math.abs(up.b - full) < .01, 'depois da subida volta ao Volume', { up, full });
  ok(up.mid > up.a + .02 && up.mid < up.b - .02, 'no meio da subida está entre os dois', up);
  ok(up.jump < .03, 'a subida é suave (sem degrau)', up);
  ok(await p.evaluate(() => audioSig().includes('"lo"')), 'a prévia refaz a mistura quando a subida muda');
  await p.screenshot({ path:path.join(outDir, 'volume-sobe.png') });

  // Ctrl+Z volta (o último passo foi "Subir na agulha", o anterior ligou)
  await p.mouse.click(5, 5);
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  const und = await p.evaluate(() => ({ rise:S.audio && S.audio.rise, ui:$('#audioBox').textContent.includes('Volume antes') }));
  ok(und.rise !== 'up' && !und.ui, 'Ctrl+Z desliga a subida', und);

  // ---- o som dos vídeos: um vídeo com som (tom de 440 Hz) entra pelo botão "Vídeo"; a subida liga pelo painel do vídeo
  await p.evaluate(() => { S.audio = null; changed(); renderAudio(); });
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = 440; o.connect(d); o.start();
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(new MediaStream([...c.captureStream(30).getVideoTracks(), ...d.stream.getAudioTracks()]), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t / 10 % 360},70%,50%)`; x.fillRect(0, 0, 320, 240); if (t > 4000) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done; ac.close();
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const fv = path.join(outDir, 'volume-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm')); fs.writeFileSync(fv, Buffer.from(rec.b64, 'base64'));
  await p.evaluate(() => { T = 0; });
  const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await chs.setFiles(fv);
  await p.waitForFunction(() => S.layers.some(l => l.type === 'audio'), null, { timeout:15000 }); await p.waitForTimeout(400);
  const lay = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { s:A.start, e:A.end ?? S.duration, vid:!!(selL() && selL().video) }; });
  ok(lay.vid, 'o vídeo fica escolhido depois de importar', lay);
  const mixL = () => p.evaluate(async ({ s, e }) => {
    const m = await buildMix(48000, S.duration), d = m.getChannelData(0), m0 = (e - s) / 2 + s;
    const rms = (t0, t1) => { let q = 0, n = 0; for (let i = Math.floor(t0 * 48000); i < t1 * 48000; i++) { q += d[i] * d[i]; n++; } return +Math.sqrt(q / n).toFixed(4); };
    return { a:rms(s + .3, m0 - .3), b:rms(m0 + 1.2, e - .3) };
  }, lay);
  const vflat = await mixL();
  // agulha no meio do clipe, subida de 0,8 s pelo painel do vídeo
  await p.evaluate(({ s, e }) => { T = +(s + (e - s) / 2).toFixed(2); }, lay);
  const vbtn = p.locator('#props button', { hasText:'Sobe depois' });
  ok(await vbtn.count() > 0, 'o painel do vídeo mostra "Volume ao longo do vídeo" para o som dele');
  await p.evaluate(() => { const b = [...document.querySelectorAll('#props button')].find(b => b.textContent === 'Sobe depois'); foldReveal(b); b.scrollIntoView({ block:'center' }); }); await vbtn.first().click(); await p.waitForTimeout(200);
  await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); A.riseDur = .8; changed(); });
  const vr = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { rise:A.rise, at:A.riseAt, T, ui:$('#props').textContent.includes('Volume antes') }; });
  ok(vr.rise === 'up' && Math.abs(vr.at - vr.T) < .01 && vr.ui, 'liga no som do vídeo com o momento na agulha', vr);
  const vup = await mixL();
  ok(vflat.a > .02 && Math.abs(vup.a - .2 * vflat.a) < .01, 'antes do momento o som do vídeo fica em 20%', { vflat, vup });
  ok(Math.abs(vup.b - vflat.b) < .01, 'depois da subida o som do vídeo volta ao Volume', { vflat, vup });
  ok(await p.evaluate(() => audioSig().includes('"lo"')), 'a prévia refaz a mistura quando a subida do som muda');
  // a camada de Áudio escolhida sozinha também tem os campos
  await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); select(A.id, true); renderProps(); });
  await p.waitForTimeout(150);
  ok(await p.evaluate(() => $('#props').textContent.includes('Volume antes')), 'o painel da camada de Áudio também mostra a subida');
  await p.screenshot({ path:path.join(outDir, 'volume-sobe-video.png') });

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
