// Teste no navegador: vários grupos vídeo + som escolhidos na timeline e a BORDA da barra de um deles puxada: todos os grupos
// escolhidos mudam de tamanho do mesmo tanto (reclamação do usuário: "seleciono dois grupos (vídeo + áudio) e tento aumentar o
// tamanho dos dois, não vai": só o grupo puxado mudava). Vale para a borda direita e a esquerda; Esc devolve todos; com um grupo
// só escolhido, só ele muda. Rodar: node testes/esticar-varios-grupos.js
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
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 20; T = 0; changed({ layers:true, props:true }); renderTimeline(); });

  // vídeo de teste com som (2 s), gravado no próprio navegador
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const x = c.getContext('2d');
    const st = c.captureStream(30), ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = 440; o.connect(d); o.start();
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(new MediaStream([...st.getVideoTracks(), ...d.stream.getAudioTracks()]), { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `hsl(${t / 10 % 360},70%,50%)`; x.fillRect(0, 0, 160, 120); if (t > 2000) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done; ac.close();
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const file = path.join(outDir, 'esticar-grupos.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(file, Buffer.from(rec.b64, 'base64'));
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => { RT.selected = S.layers[0].id; RT.picks = new Set([RT.selected]); T = S.layers.filter(l => l.video).length * 4; renderProps(); });
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await ch.setFiles(file);
    await p.waitForFunction(n => S.layers.filter(l => l.type === 'audio').length >= n, i + 1, { timeout:15000 });
    await p.waitForTimeout(300);
  }
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.style.pointerEvents = 'none'; }); });
  const gids = await p.evaluate(() => [...new Set(S.layers.filter(l => l.video).map(l => l.grp))]);
  ok(gids.length === 3 && gids.every(Boolean), '3 grupos vídeo + som', gids);

  const bar = sel => p.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block:'center' }); const r = el.getBoundingClientRect(); return { x:(r.left + r.right) / 2, y:r.top + r.height / 2, pps:document.querySelector('#tl .tl-scale').getBoundingClientRect().width / S.duration }; }, sel);
  const gsel = g => `#tl .tl-row[data-gid="${g}"] .tl-bar`;
  const edge = async (g, side, secs, esc) => {
    const r = await p.evaluate(([sel, side]) => { const el = document.querySelector(sel); el.scrollIntoView({ block:'center' }); const b = el.getBoundingClientRect(); return { x:side === 'r' ? b.right - 2 : b.left + 2, y:b.top + b.height / 2, pps:document.querySelector('#tl .tl-scale').getBoundingClientRect().width / S.duration }; }, [gsel(g), side]);
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + Math.sign(secs) * 6, r.y, { steps:3 }); await p.mouse.move(r.x + secs * r.pps, r.y, { steps:8 });
    if (esc) await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(250);
  };
  const span = g => p.evaluate(g => { const lv = gleaves(g); return [Math.min(...lv.map(l => l.start)), Math.max(...lv.map(l => l.end ?? S.duration))]; }, g);
  const spans = () => Promise.all(gids.map(span));

  // escolhe os três grupos: clique na barra do 1º, Shift + clique nas outras
  { const r = await bar(gsel(gids[0])); await p.mouse.click(r.x, r.y); }
  for (const g of gids.slice(1)) { const r = await bar(gsel(g)); await p.keyboard.down('Shift'); await p.mouse.click(r.x, r.y); await p.keyboard.up('Shift'); }
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => pickedLayers().filter(l => l.type !== 'bg').length) === 6, 'os 3 grupos escolhidos (6 camadas)');

  const near = (a, b) => Math.abs(a - b) < .051;
  // 1) borda direita do 1º grupo 0,5 s para a esquerda: todos terminam 0,5 s antes, o começo fica
  let s0 = await spans(); await edge(gids[0], 'r', -.5); let s1 = await spans();
  ok(s0.every(([a, e], i) => near(s1[i][0], a) && near(s1[i][1], e - .5)), 'borda direita: os 3 grupos encolhem 0,5 s', { s0, s1 });
  const cut = await p.evaluate(() => S.layers.filter(l => l.video).map(l => l.vOut ?? null));
  ok(cut.every(v => v != null && v < 2), 'o vídeo de cada grupo é cortado no fim (vOut)', cut);
  ok(await p.evaluate(() => pickedLayers().filter(l => l.type !== 'bg').length) === 6, 'a seleção continua com os 3 grupos');

  // 2) borda esquerda do 2º grupo 0,4 s para a direita: todos começam 0,4 s depois e o vídeo começa mais à frente (vIn)
  s0 = s1; await edge(gids[1], 'l', .4); s1 = await spans();
  ok(s0.every(([a, e], i) => near(s1[i][0], a + .4) && near(s1[i][1], e)), 'borda esquerda: os 3 grupos começam 0,4 s depois', { s0, s1 });
  const vin = await p.evaluate(() => S.layers.filter(l => l.video).map(l => l.vIn ?? 0));
  ok(vin.every(v => near(v, .4)), 'o vídeo de cada grupo pula o começo (vIn)', vin);
  const au = await p.evaluate(() => S.layers.filter(l => l.type === 'audio').map(l => { const v = S.layers.find(q => q.id === l.link); return [l.start, v.start, l.vIn ?? 0, v.vIn ?? 0]; }));
  ok(au.every(([a, b, c, d]) => near(a, b) && near(c, d)), 'o som de cada vídeo acompanha', au);

  // 3) Esc devolve todos
  s0 = s1; await edge(gids[2], 'r', -.6, true); s1 = await spans();
  ok(s0.every(([a, e], i) => near(s1[i][0], a) && near(s1[i][1], e)), 'Esc devolve todos', { s0, s1 });

  // 4) Ctrl+Z desfaz a borda esquerda num passo só
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  const s2 = await spans();
  ok(s2.every(([a], i) => near(a, s0[i][0] - .4)), 'Ctrl+Z desfaz os 3 de uma vez', { s0, s2 });

  // 5) um grupo só escolhido: só ele muda
  await p.evaluate(g => { const lv = gleaves(g); RT.selected = lv[lv.length - 1].id; RT.picks = new Set(lv.map(l => l.id)); renderLayers(); renderProps(); }, gids[0]);
  s0 = await spans(); await edge(gids[0], 'r', -.3); s1 = await spans();
  ok(near(s1[0][1], s0[0][1] - .3) && s0.slice(1).every((q, i) => near(s1[i + 1][1], q[1])), 'com um grupo só, só ele muda', { s0, s1 });

  await p.screenshot({ path:path.join(outDir, 'esticar-grupos.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
