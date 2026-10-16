// Teste no navegador: som solto, volume e fade (pedido do usuário: aumentar/diminuir o som do vídeo ou de um som sozinho, e cortar
// o som sozinho). Um WAV entra pelo botão "Som" de Adicionar (e arrastando para o palco) como camada de Áudio, com onda na timeline e
// o painel com Volume, Entra suave, Sai suave e os campos de corte; volume acima de 100% aumenta a mistura; o fade abaixa o começo e
// o fim; "Termina em" corta (a barra encolhe e a mistura fica em silêncio depois); S divide. O vídeo com som mostra o Volume no
// próprio painel, e com dois vídeos escolhidos o Volume vale para o som dos dois.
// Rodar: node testes/som-solto.js (prints na pasta temporária, mola-testes/solto-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
// WAV de 3 s, tom de 440 Hz com amplitude 0,25 (sobra para dobrar sem distorcer)
function wav(sec, amp = .25, sr = 48000) {
  const n = sec * sr, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * amp * 32767), 44 + i * 2);
  return b;
}
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 6; T = 1; RT.userSeek = true; changed({ layers:true, props:true }); renderTimeline(); });
  const fWav = path.join(outDir, 'solto-tom.wav'); fs.writeFileSync(fWav, wav(3));

  // 1) botão "Som" de Adicionar
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Som' }).click()]);
  await ch.setFiles(fWav);
  await p.waitForFunction(() => S.layers.some(l => l.type === 'audio'), null, { timeout:15000 }); await p.waitForTimeout(400);
  const r1 = await p.evaluate(() => {
    const A = S.layers.find(l => l.type === 'audio'), pr = document.querySelector('#props').textContent;
    return { start:A.start, end:A.end, vdur:A.vdur, link:A.link, grp:A.grp, sel:RT.selected === A.id,
      wave:!!document.querySelector(`#tl .tl-row[data-id="${A.id}"] canvas.tl-awave`), list:!!document.querySelector(`#layers [data-id="${A.id}"]`),
      vol:pr.includes('Volume'), fin:pr.includes('Entra suave'), fout:pr.includes('Sai suave'), cut:pr.includes('Começa em') && pr.includes('Termina em'), mute:pr.includes('deixa o vídeo mudo') };
  });
  ok(Math.abs(r1.start - 1) < .01 && Math.abs(r1.end - 4) < .02 && Math.abs(r1.vdur - 3) < .02, 'o som entra na agulha e a barra tem o tamanho dele', r1);
  ok(!r1.link && !r1.grp && r1.sel, 'som solto: sem vídeo, sem grupo, escolhido', r1);
  ok(r1.wave && r1.list, 'aparece na lista e na timeline com a onda', r1);
  ok(r1.vol && r1.fin && r1.fout && r1.cut && !r1.mute, 'painel: volume, fade e corte (sem o aviso do vídeo mudo)', r1);
  await p.screenshot({ path:path.join(outDir, 'solto-1-painel.png') });

  const rms = (t0, t1) => p.evaluate(async ([t0, t1]) => {
    const m = await buildMix(48000, S.duration), d = m.getChannelData(0); let s = 0, n = 0;
    for (let i = Math.floor(t0 * 48000); i < Math.min(d.length, t1 * 48000); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / Math.max(1, n));
  }, [t0, t1]);
  const base = await rms(2, 3);
  ok(base > .1 && base < .25 && (await rms(.2, .8)) < .001, 'o tom toca no tempo da barra e não antes', { base });

  // 2) volume 200% pelo campo digitável
  const typeIn = async (label, v) => {
    const f = p.locator('#props .field', { hasText:label }).first().locator('input.num');
    await f.click(); await f.fill(v); await f.press('Enter'); await p.waitForTimeout(200);
  };
  await typeIn('Volume', '200');
  const r2 = await p.evaluate(() => S.layers.find(l => l.type === 'audio').vol), loud = await rms(2, 3);
  ok(r2 === 2 && Math.abs(loud / base - 2) < .05, 'volume 200% dobra o som', { vol:r2, ratio:loud / base });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => (S.layers.find(l => l.type === 'audio').vol ?? 1) === 1), 'Ctrl+Z volta o volume');
  await typeIn('Volume', '50');
  ok(Math.abs((await rms(2, 3)) / base - .5) < .05, 'volume 50% abaixa pela metade');
  await typeIn('Volume', '100');

  // 3) fade de 1 s na entrada e na saída
  await typeIn('Entra suave', '1'); await typeIn('Sai suave', '1');
  const r3 = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return [A.afIn, A.afOut]; });
  const head = await rms(1, 1.2), mid = await rms(2.2, 2.8), tail = await rms(3.8, 4);
  ok(r3[0] === 1 && r3[1] === 1 && head < mid * .25 && tail < mid * .25 && Math.abs(mid - base) < .01, 'fade: começo e fim baixos, o meio igual', { r3, head, mid, tail });
  await typeIn('Entra suave', '0');
  ok(await p.evaluate(() => S.layers.find(l => l.type === 'audio').afIn === undefined), 'fade 0 apaga o campo');
  await typeIn('Sai suave', '0');

  // 4) cortar: "Termina em" 1,5 s → a barra encolhe e o resto fica em silêncio
  await typeIn('Termina em', '1,5');
  const r4 = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { vOut:A.vOut, end:A.end }; });
  ok(Math.abs(r4.vOut - 1.5) < .01 && Math.abs(r4.end - 2.5) < .02, 'Termina em corta o som e a barra', r4);
  ok((await rms(1.2, 2.3)) > .1 && (await rms(2.7, 3.5)) < .001, 'depois do corte, silêncio');

  // 5) dividir na agulha com S
  await p.evaluate(() => { T = 1.8; RT.userSeek = true; needs = true; document.activeElement && document.activeElement.blur(); });
  await p.locator('#cv').hover(); await p.keyboard.press('s'); await p.waitForTimeout(300);
  const r5 = await p.evaluate(() => S.layers.filter(l => l.type === 'audio').map(l => [l.start, l.end, l.vIn || 0, l.vOut]));
  ok(r5.length === 2 && Math.abs(r5[0][1] - 1.8) < .02 && Math.abs(r5[1][0] - 1.8) < .02, 'S divide o som na agulha', r5);

  // 6) arrastar um WAV para o palco também vira camada de Áudio (não a Trilha)
  const n0 = await p.evaluate(() => S.layers.filter(l => l.type === 'audio').length);
  const dt = await p.evaluateHandle(async b64 => {
    const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), d = new DataTransfer(); d.items.add(new File([u8], 'arrastado.wav', { type:'audio/wav' })); return d;
  }, wav(1).toString('base64'));
  await p.dispatchEvent('#stageBox', 'drop', { dataTransfer:dt });
  await p.waitForFunction(n => S.layers.filter(l => l.type === 'audio').length > n, n0, { timeout:15000 });
  ok(await p.evaluate(() => !S.audio && S.layers.some(l => l.type === 'audio' && l.name === 'arrastado')), 'arrastar o som para o palco cria a camada, sem mexer na Trilha');

  // 7) vídeo com som: Volume no painel do vídeo; dois vídeos escolhidos = um Volume para os dois
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const x = c.getContext('2d');
    const st = c.captureStream(30), ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.connect(d); o.start();
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(new MediaStream([...st.getVideoTracks(), ...d.stream.getAudioTracks()]), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data); const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now(); await new Promise(res => { const f = () => { x.fillStyle = `hsl(${(performance.now() - t0) / 10 % 360},70%,50%)`; x.fillRect(0, 0, 160, 120); if (performance.now() - t0 > 1500) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done; ac.close();
    const u8 = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), ext:mime.includes('mp4') ? 'mp4' : 'webm' };
  });
  const fVid = path.join(outDir, 'solto-video.' + rec.ext); fs.writeFileSync(fVid, Buffer.from(rec.b64, 'base64'));
  for (let i = 0; i < 2; i++) {
    const n = await p.evaluate(() => S.layers.filter(l => l.video).length);
    await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderProps(); });
    const [c2] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await c2.setFiles(fVid); await p.waitForFunction(n => S.layers.filter(l => l.video).length > n, n, { timeout:15000 }); await p.waitForTimeout(400);
  }
  await p.evaluate(() => { const V = S.layers.filter(l => l.video)[0]; RT.picks = new Set([V.id]); RT.selected = V.id; RT.itemPicks = RT.picks; propTab = 'style'; renderProps(); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.querySelector('#props').textContent.includes('Volume')), 'o painel do vídeo tem o Volume');
  await typeIn('Volume', '150');
  const r7 = await p.evaluate(() => { const [V] = S.layers.filter(l => l.video); return S.layers.filter(a => linkOf(a) === V).map(a => a.vol); });
  ok(r7.length === 1 && r7[0] === 1.5, 'o Volume do painel do vídeo muda o som dele', r7);
  await p.evaluate(() => { const vs = S.layers.filter(l => l.video); RT.picks = new Set(vs.map(v => v.id)); RT.selected = vs[1].id; RT.itemPicks = RT.picks; propTab = 'style'; renderProps(); });
  await p.waitForTimeout(200);
  const nVol = await p.evaluate(() => [...document.querySelectorAll('#props .field')].filter(f => f.textContent.startsWith('Volume')).length);
  ok(nVol === 1, 'dois vídeos escolhidos: um campo Volume só', nVol);
  await typeIn('Volume', '30');
  const r8 = await p.evaluate(() => S.layers.filter(l => l.video).map(V => S.layers.filter(a => linkOf(a) === V).map(a => a.vol)).flat());
  ok(r8.length === 2 && r8.every(v => v === .3), 'o Volume vale para o som dos dois vídeos', r8);
  await p.screenshot({ path:path.join(outDir, 'solto-2-videos.png') });

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
