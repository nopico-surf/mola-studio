// Teste no navegador: corte longo pela borda esquerda (puxar da esquerda para a direita) num vídeo cuja barra já é mais longa
// que ele (repetindo). Antes o começo do trecho grudava no fim do vídeo e sobrava 0,1 s repetindo e piscando na barra toda
// (reclamação do usuário: "corte longo, não dá certo, quebra"). Agora o trecho começa no quadro que estava ali, pela barra do
// vídeo e pela do grupo (vídeo + som). Também confere que, parado, o palco não fica redesenhando quando a agulha anda dentro do
// mesmo quadro do vídeo (a prévia decodificada pedia o quadro de novo a cada tick).
// Rodar: node testes/corte-longo.js (prints na pasta temporária, mola-testes/corte-longo-*.png)
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

  // vídeo de teste com som (4 s), gravado no próprio navegador
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
    const st = c.captureStream(30), ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = 440; o.connect(d); o.start();
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(new MediaStream([...st.getVideoTracks(), ...d.stream.getAudioTracks()]), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t / 10 % 360},70%,50%)`; x.fillRect(0, 0, 320, 240); if (t > 4000) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done; ac.close();
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const file = path.join(outDir, 'corte-longo.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(file, Buffer.from(rec.b64, 'base64'));

  const st = () => p.evaluate(() => {
    const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'), c = vidCut(V);
    return { s:V.start, e:V.end, vIn:V.vIn ?? null, vOut:V.vOut ?? null, a:c.a, b:c.b, as:A.start, aIn:A.vIn ?? null, grp:V.grp };
  });
  // quadro do vídeo (segundos) em cada tempo da barra
  const frames = (from, to) => p.evaluate(([from, to]) => { const V = S.layers.find(l => l.video), out = []; for (let t = from; t < to - 1e-3; t += .1) out.push(vidTime(V, t)); return out; }, [from, to]);
  const bar = sel => p.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block:'center' }); const r = el.getBoundingClientRect(); return { l:r.left, r:r.right, y:r.top + r.height / 2, pps:document.querySelector('#tl .tl-scale').getBoundingClientRect().width / S.duration }; }, sel);
  const drag = async (x, y, dx) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + Math.sign(dx) * 10, y, { steps:3 }); await p.mouse.move(x + dx, y, { steps:20 }); await p.mouse.up(); await p.waitForTimeout(300); };

  for (const via of ['vídeo', 'grupo']) {
    await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 14; T = 0; changed({ layers:true, props:true }); renderTimeline(); });
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await ch.setFiles(file);
    await p.waitForFunction(() => S.layers.some(l => l.video) && S.layers.some(l => l.type === 'audio'), null, { timeout:15000 });
    await p.waitForTimeout(500);
    await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.style.pointerEvents = 'none'; }); });
    const s0 = await st();
    const vsel = await p.evaluate(() => `#tl .tl-row[data-id="${S.layers.find(l => l.video).id}"] .tl-bar`), gsel = `#tl .tl-row[data-gid="${s0.grp}"] .tl-bar`;

    // a borda direita do vídeo para fora, até perto do fim: a barra fica mais longa que o vídeo (repete)
    let vb = await bar(vsel);
    await drag(vb.r - 3, vb.y, vb.pps * (13.6 - s0.e));
    const s1 = await st();
    ok(s1.e - s1.s > (s1.b - s1.a) * 2, `[${via}] a barra repete o vídeo`, s1);
    const len = s1.b - s1.a, cut = len * 2.4; // corte longo: passa da 2ª volta do vídeo
    const before = await frames(s1.s + cut, s1.e);

    // corte longo da esquerda para a direita
    vb = await bar(via === 'vídeo' ? vsel : gsel);
    await drag(vb.l + 3, vb.y, vb.pps * cut);
    const s2 = await st();
    ok(s2.s > s1.s + cut - .3, `[${via}] a borda esquerda andou`, { antes:s1, depois:s2 });
    ok(s2.b - s2.a > .3, `[${via}] não sobra um pedacinho de vídeo repetindo`, s2);
    const after = await frames(s2.s, s2.e), d = s2.s - (s1.s + cut);
    const want = await frames(s1.s + cut + d, s1.e);
    // o vídeo fica parado no tempo até a volta: o mesmo quadro de antes no mesmo tempo
    const n = Math.min(after.length, want.length, Math.floor((s2.b - s2.a) / .1) - 1), dif = [];
    for (let i = 0; i < n; i++) if (Math.abs(after[i] - want[i]) > .02) dif.push([i, after[i], want[i]]);
    ok(n >= 3 && dif.length === 0, `[${via}] o vídeo continua o mesmo nos tempos que ficaram`, { n, dif:dif.slice(0, 5), antes:before.slice(0, 5) });
    const distinct = new Set(after.map(v => v.toFixed(2))).size;
    ok(distinct > after.length / 2, `[${via}] o vídeo anda (não pisca entre dois quadros)`, { distinct, total:after.length });
    ok(s2.aIn === s2.vIn && s2.as === s2.s, `[${via}] o som corta junto`, s2);
    await p.screenshot({ path:path.join(outDir, `corte-longo-${via === 'vídeo' ? 'video' : 'grupo'}.png`) });
  }

  // parado, a agulha andando dentro do mesmo quadro do vídeo não deixa o palco redesenhando sem parar
  const idle = await p.evaluate(async () => {
    const V = S.layers.find(l => l.video), v = VIDS.get(V.id), wait = ms => new Promise(r => setTimeout(r, ms));
    pause(); T = V.start + .5; needs = true; await wait(800);
    if (!v.dec || !v.dec.cur) return { pv:!!v.pv, draws:0, semDec:true };
    // agulha logo depois do começo do quadro que está na tela: outro tempo, mesmo quadro
    const a = vidCut(V, v.el).a, ts = v.dec.cur.timestamp / 1e6;
    T = V.start + ts + .002 - VID_EPS - a; needs = true; await wait(400);
    const f0 = RT.frameNo; await wait(1000);
    return { pv:!!v.pv, draws:RT.frameNo - f0 };
  });
  ok(idle.draws <= 3, 'parado, o palco não redesenha sem parar', idle);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
