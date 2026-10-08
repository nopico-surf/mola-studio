// Teste no navegador: cortar o vídeo pela borda da barra do GRUPO (vídeo + som). Antes, a borda do grupo só esticava o tempo:
// a barra do vídeo passava do trecho cortado e no fim o vídeo voltava ao começo (reclamação do usuário: "o corte fica bugado,
// cortando"). Agora a borda do grupo corta como a borda da barra do vídeo: a direita anda o fim do trecho, a esquerda o começo
// (o vídeo fica parado no tempo), o som acompanha e Esc desfaz o arrasto.
// Rodar: node testes/corte-pelo-grupo.js (prints na pasta temporária, mola-testes/corte-grupo-*.png)
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
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 8; T = 0; changed({ layers:true, props:true }); renderTimeline(); });

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
  const file = path.join(outDir, 'corte-grupo.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(file, Buffer.from(rec.b64, 'base64'));
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch.setFiles(file);
  await p.waitForFunction(() => S.layers.some(l => l.video) && S.layers.some(l => l.type === 'audio'), null, { timeout:15000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.style.pointerEvents = 'none'; }); });

  const st = () => p.evaluate(() => {
    const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'), c = vidCut(V);
    return { s:V.start, e:V.end, vIn:V.vIn ?? null, vOut:V.vOut ?? null, a:c.a, b:c.b, d:c.d, as:A.start, ae:A.end, aIn:A.vIn ?? null, aOut:A.vOut ?? null, grp:V.grp };
  });
  // o vídeo não volta ao começo dentro da barra: vidTime só anda para a frente
  const noLoop = () => p.evaluate(() => {
    const V = S.layers.find(l => l.video), el = VIDS.get(V.id) && VIDS.get(V.id).el; let last = -1, back = 0;
    for (let t = V.start; t < (V.end ?? S.duration) - 1e-3; t += 1 / 30) { const vt = vidTime(V, t, el); if (vt < last - 1e-6) back++; last = vt; }
    return back === 0;
  });
  const bar = sel => p.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block:'center' }); const r = el.getBoundingClientRect(); return { l:r.left, r:r.right, y:r.top + r.height / 2, pps:document.querySelector('#tl .tl-scale').getBoundingClientRect().width / S.duration }; }, sel);
  const drag = async (x, y, dx, esc) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + Math.sign(dx) * 10, y, { steps:3 }); await p.mouse.move(x + dx, y, { steps:8 }); if (esc) await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(250); };

  const s0 = await st();
  ok(!!s0.grp, 'o vídeo com som entra num grupo', s0);
  const gsel = `#tl .tl-row[data-gid="${s0.grp}"] .tl-bar`, vsel = await p.evaluate(() => `#tl .tl-row[data-id="${S.layers.find(l => l.video).id}"] .tl-bar`);

  // 1) corta o fim pela barra do vídeo (como o usuário faz primeiro): 1 s a menos
  let vb = await bar(vsel);
  await drag(vb.r - 3, vb.y, -vb.pps * 1);
  const s1 = await st();
  ok(s1.vOut != null && Math.abs((s1.e - s1.s) - (s1.b - s1.a)) < .06, 'a borda da barra do vídeo corta o fim', s1);

  // 2) puxa a borda direita do GRUPO para fora: o fim do trecho acompanha, sem repetir
  let gb = await bar(gsel);
  await drag(gb.r - 3, gb.y, vb.pps * .6);
  const s2 = await st();
  ok(s2.e > s1.e + .3, 'a borda direita do grupo alonga a barra', { antes:s1.e, depois:s2.e });
  ok(Math.abs((s2.e - s2.s) - (s2.b - s2.a)) < .06, 'o trecho do vídeo acompanha a barra (não sobra barra sem vídeo)', s2);
  ok(await noLoop(), 'o vídeo não volta ao começo no fim da barra');
  ok(s2.ae === s2.e && s2.aOut === s2.vOut, 'o som acompanha o corte', s2);

  // 3) para dentro: corta de novo
  gb = await bar(gsel);
  await drag(gb.r - 3, gb.y, -vb.pps * 1.2);
  const s3 = await st();
  ok(s3.e < s2.e - .5 && s3.vOut != null && s3.vOut < s2.b - .5 && Math.abs((s3.e - s3.s) - (s3.b - s3.a)) < .06, 'a borda direita do grupo para dentro corta o fim do vídeo', s3);

  // 4) borda esquerda do grupo para a direita: o começo do trecho anda junto, o fim fica
  gb = await bar(gsel);
  await drag(gb.l + 3, gb.y, vb.pps * .5);
  const s4 = await st();
  ok(s4.s > s3.s + .3 && Math.abs(s4.e - s3.e) < 1e-6, 'a borda esquerda do grupo move o começo da barra e deixa o fim', { antes:s3, depois:s4 });
  ok(s4.vIn != null && Math.abs(s4.vIn - (s4.s - s3.s)) < .02 && Math.abs(s4.b - s3.b) < .02, 'o começo do trecho anda junto (o vídeo fica parado no tempo)', s4);
  ok(s4.aIn === s4.vIn, 'o som corta o começo junto', s4);

  // 5) borda esquerda para trás além do começo do vídeo: para no começo do vídeo
  gb = await bar(gsel);
  await drag(gb.l + 3, gb.y, -vb.pps * 1.5);
  const s5 = await st();
  ok(s5.vIn == null && Math.abs(s5.s - (s4.s - s4.vIn)) < .02 && await noLoop(), 'a borda esquerda não passa do começo do vídeo', s5);

  // 6) Esc no meio do arrasto devolve tudo
  gb = await bar(gsel);
  await drag(gb.r - 3, gb.y, -vb.pps * .8, true);
  const s6 = await st();
  ok(s6.e === s5.e && s6.vOut === s5.vOut && s6.vIn === s5.vIn, 'Esc devolve a barra e o corte', { antes:s5, depois:s6 });

  // 7) mover o grupo inteiro (meio da barra) não mexe no corte
  gb = await bar(gsel);
  await drag((gb.l + gb.r) / 2, gb.y, vb.pps * .4);
  const s7 = await st();
  ok(s7.s > s6.s + .2 && s7.vIn === s6.vIn && s7.vOut === s6.vOut, 'mover o grupo não muda o corte', s7);

  await p.screenshot({ path:path.join(outDir, 'corte-grupo-final.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
