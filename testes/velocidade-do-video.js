// Teste no navegador: velocidade do vídeo (pedido do usuário: acelerar o vídeo).
// Um vídeo de 3 s (cor girando 120° por segundo + tom de 440 Hz). No painel: "2×" na linha Velocidade → a barra fica com a metade,
// o som acelera junto (mesma barra, mesmo vSpeed), o quadro em 0,5 s é o do segundo 1 do vídeo, o som fica 2× mais curto e sem
// mudar o tom. Depois: valor digitado (0,5× = câmera lenta, a barra dobra), corte pela borda direita na velocidade, pausa na
// agulha com velocidade, 1× apaga o campo e Ctrl+Z.
// Rodar: node testes/velocidade-do-video.js (prints na pasta temporária, mola-testes/velocidade-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const near = (a, b, e = .02) => Math.abs(a - b) <= e;
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; T = 0; changed({ layers:true, props:true }); renderTimeline(); });

  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
    const st = c.captureStream(30), tracks = [...st.getVideoTracks()];
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = 440; o.connect(d); o.start(); tracks.push(...d.stream.getAudioTracks());
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(new MediaStream(tracks), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t * .12 % 360},80%,50%)`; x.fillRect(0, 0, 320, 240); if (t > 3000) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done; ac.close();
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const f = path.join(outDir, 'velocidade-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await chs.setFiles(f);
  await p.waitForFunction(() => S.layers.some(l => l.video), null, { timeout:15000 }); await p.waitForTimeout(400);
  await p.evaluate(() => {
    S.duration = 8; const V = S.layers.find(l => l.video); V.start = 0; vidFitEnd(V);
    document.querySelectorAll('.toast').forEach(t => { t.hidden = true; });
    select(V.id); pause(); T = 0; changed({ layers:true, props:true }); renderTimeline(); renderProps();
  });
  const st = () => p.evaluate(() => { const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'); return { end:V.end, sp:V.vSpeed ?? null, vOut:V.vOut ?? null, ps:V.vPause || null, aend:A ? A.end : null, asp:A ? A.vSpeed ?? null : 'sem som' }; });
  const color = t => p.evaluate(async t => {
    T = t; await seekVideos(t);
    const k = .25, c = document.createElement('canvas'); c.width = Math.round(FW() * k); c.height = Math.round(H() * k);
    const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, k, false);
    const b = S.layers.find(l => l.video)._bounds; return [...x.getImageData(Math.round((b.x + b.w / 2) * k), Math.round((b.y + b.h / 2) * k), 1, 1).data].slice(0, 3);
  }, t);
  const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  // som: rms em janelas e frequência (cruzamentos por zero) no meio do trecho
  const sound = () => p.evaluate(() => buildMix(48000, S.duration).then(m => {
    const d = m.getChannelData(0), sr = 48000, rms = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * sr); i < b * sr; i++) { s += d[i] * d[i]; n++; } return +Math.sqrt(s / n).toFixed(4); };
    const hz = (a, b) => { let z = 0; for (let i = Math.floor(a * sr) + 1; i < b * sr; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) z++; return Math.round(z / 2 / (b - a)); };
    return { rms, hz, at:t => rms(t, t + .1) };
  }).then(o => ({ a:o.at(.3), b:o.at(1.2), c:o.at(1.7), d:o.at(2.6), hz:o.hz(.3, 1.2) })));

  const s0 = await st(), c1 = await color(1), m0 = await sound();
  ok(!s0.sp && near(s0.end, 3, .15) && s0.aend === s0.end, 'vídeo de 3 s com o som na mesma barra, 1×', s0);
  ok(near(m0.hz, 440, 15), 'o som de teste tem 440 Hz', m0);

  // "2×" na linha Velocidade
  await p.evaluate(() => { select(S.layers.find(l => l.video).id); renderProps(); });
  const row = p.locator('#props .field', { hasText:'Velocidade' }).first();
  ok(await row.count() === 1, 'o painel do vídeo tem a linha Velocidade');
  await row.locator('button', { hasText:'2×' }).click(); await p.waitForTimeout(300);
  const s1 = await st();
  ok(s1.sp === 2 && near(s1.end, s0.end / 2, .01), '2×: a barra fica com a metade', { antes:s0, depois:s1 });
  ok(s1.asp === 2 && s1.aend === s1.end, 'o som do vídeo acelera junto (mesma barra)', s1);
  const vt = await p.evaluate(() => { const V = S.layers.find(l => l.video); return [.25, .5, 1].map(t => +vidTime(V, t).toFixed(3)); });
  ok(near(vt[0], .5) && near(vt[1], 1) && near(vt[2], 2), 'tempo do vídeo anda 2 s por segundo da timeline', vt);
  const c05 = await color(.5);
  ok(dist(c05, c1) <= 12, 'o quadro em 0,5 s é o do segundo 1 do vídeo', [c05, c1]);
  const m1 = await sound();
  ok(m1.a > .05 && m1.b > .05 && m1.c < .005, 'o som acaba junto com a barra (1,5 s)', m1);
  ok(near(m1.hz, 440, 20), 'o som acelera sem mudar o tom', m1);
  ok(await p.locator('#tl .tl-row .tl-bar').count() >= 2, 'a timeline mostra as barras');
  await p.screenshot({ path:path.join(outDir, 'velocidade-1-2x.png') });

  // valor digitado: 0,5 = câmera lenta, a barra dobra (até 6 s)
  const num = p.locator('#props .field.cont', { hasText:'Velocidade' }).locator('input.num');
  await num.click(); await num.fill('0,5'); await num.press('Enter'); await p.waitForTimeout(300);
  const s2 = await st();
  ok(s2.sp === .5 && near(s2.end, s0.end * 2, .02) && s2.asp === .5, '0,5× digitado: a barra fica com o dobro', s2);
  const m2 = await sound();
  ok(m2.d > .05 && near(m2.hz, 440, 20), 'câmera lenta: o som dura o dobro, sem mudar o tom', m2);

  // corte pela borda direita com velocidade: 1 s da barra a 0,5× = 0,5 s do vídeo
  const cut = await p.evaluate(() => { const V = S.layers.find(l => l.video), v = vidSnap(V, S.duration); V.end = 1; vidTrim(V, v, 'r'); const r = V.vOut; vidUnsnap(V, v); V.end = v.e; return r; });
  ok(near(cut, .5, .01), 'cortar a barra em 1 s a 0,5× corta o vídeo em 0,5 s', cut);
  const head = await p.evaluate(() => { const V = S.layers.find(l => l.video), v = vidSnap(V, S.duration); V.start = 1; vidTrim(V, v, 'l'); const r = V.vIn; vidUnsnap(V, v); V.start = 0; return r; });
  ok(near(head, .5, .01), 'puxar o começo 1 s a 0,5× começa o vídeo em 0,5 s', head);

  // pausa com velocidade: em 2×, pausa na agulha em 0,5 s = segundo 1 do vídeo; parado 1 s e continua de onde parou
  await row.locator('button', { hasText:'2×' }).click(); await p.waitForTimeout(200);
  await p.evaluate(() => { pause(); T = .5; needs = true; renderProps(); });
  await p.locator('#props button', { hasText:'Pausar na agulha' }).click(); await p.waitForTimeout(300);
  const s3 = await st();
  ok(s3.ps && near(s3.ps[0].at, 1, .03) && near(s3.end, s0.end / 2 + 1, .02), 'pausa na agulha: no segundo 1 do vídeo, a barra cresce 1 s', s3);
  const vp = await p.evaluate(() => { const V = S.layers.find(l => l.video); return [.25, 1, 1.75].map(t => +vidTime(V, t).toFixed(3)); });
  ok(near(vp[0], .5) && near(vp[1], 1) && near(vp[2], 1.5), 'anda a 2×, fica parado 1 s e continua a 2×', vp);
  await p.locator('#props button', { hasText:'Tirar as pausas' }).click(); await p.waitForTimeout(200);

  // 1× tira o campo; Ctrl+Z volta a 2×
  await p.locator('#props .field', { hasText:'Velocidade' }).first().locator('button', { hasText:/^1×$/ }).click(); await p.waitForTimeout(200);
  const s4 = await st();
  ok(s4.sp === null && near(s4.end, s0.end, .01) && s4.asp === null, '1× volta ao normal (a barra também)', s4);
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  const s5 = await st();
  ok(s5.sp === 2, 'Ctrl+Z volta a 2×', s5);

  // tocar não dá erro
  await p.evaluate(() => { T = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(1200); await p.keyboard.press('Space');
  await p.screenshot({ path:path.join(outDir, 'velocidade-2-final.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
