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

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
