// Teste no navegador: vários grupos vídeo + som escolhidos na timeline (Shift + clique nas barras dos grupos) andam todos juntos
// quando se arrasta a barra de um deles, ou a barra de um vídeo de dentro. Antes só o grupo arrastado andava (reclamação do
// usuário: "seleciono mais de dois grupos e movimento pra outra minutagem, não vai todos os selecionados"). Esc devolve todos.
// Rodar: node testes/arrastar-varios-grupos.js
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
  const file = path.join(outDir, 'varios-grupos.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
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

  const times = () => p.evaluate(() => S.layers.filter(l => l.type !== 'bg').map(l => [l.id, l.start, l.end ?? null]));
  const bar = sel => p.evaluate(sel => { const el = document.querySelector(sel); el.scrollIntoView({ block:'center' }); const r = el.getBoundingClientRect(); return { x:(r.left + r.right) / 2, y:r.top + r.height / 2, pps:document.querySelector('#tl .tl-scale').getBoundingClientRect().width / S.duration }; }, sel);
  const drag = async (sel, secs, esc) => { const r = await bar(sel); await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + 10, r.y, { steps:3 }); await p.mouse.move(r.x + secs * r.pps, r.y, { steps:8 }); if (esc) await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(250); };
  const gsel = g => `#tl .tl-row[data-gid="${g}"] .tl-bar`;

  // escolhe os três grupos: clique na barra do 1º, Shift + clique nas outras
  { const r = await bar(gsel(gids[0])); await p.mouse.click(r.x, r.y); }
  for (const g of gids.slice(1)) { const r = await bar(gsel(g)); await p.keyboard.down('Shift'); await p.mouse.click(r.x, r.y); await p.keyboard.up('Shift'); }
  await p.waitForTimeout(200);
  const n = await p.evaluate(() => pickedLayers().filter(l => l.type !== 'bg').length);
  ok(n === 6, 'os 3 grupos escolhidos (6 camadas)', n);

  const shifted = (a, b, ds) => a.every(([id, s, e], i) => Math.abs(b[i][1] - (s + ds)) < .051 && (e == null || Math.abs(b[i][2] - (e + ds)) < .051));
  // 1) arrastar a barra do 1º grupo 2 s para a direita
  let t0 = await times();
  await drag(gsel(gids[0]), 2);
  let t1 = await times();
  ok(shifted(t0, t1, 2), 'barra do grupo: todos andam 2 s', { t0, t1 });
  ok(await p.evaluate(() => pickedLayers().filter(l => l.type !== 'bg').length) === 6, 'a seleção continua com os 3 grupos');

  // 2) arrastar a barra do vídeo do 2º grupo 1 s para a esquerda
  const vsel = await p.evaluate(g => `#tl .tl-row[data-id="${S.layers.find(l => l.video && l.grp === g).id}"] .tl-bar`, gids[1]);
  t0 = t1; await drag(vsel, -1); t1 = await times();
  ok(shifted(t0, t1, -1), 'barra de um vídeo de dentro: todos andam -1 s', { t0, t1 });

  // 3) Esc devolve todos
  t0 = t1; await drag(gsel(gids[2]), 3, true); t1 = await times();
  ok(shifted(t0, t1, 0), 'Esc devolve todos', { t0, t1 });

  // 4) um grupo só escolhido: só ele anda
  await p.evaluate(g => { const lv = gleaves(g); RT.selected = lv[lv.length - 1].id; RT.picks = new Set(lv.map(l => l.id)); renderLayers(); renderProps(); }, gids[0]);
  t0 = await times(); await drag(gsel(gids[0]), 1); t1 = await times();
  const mine = await p.evaluate(g => gleaves(g).map(l => l.id), gids[0]);
  ok(t0.every(([id, s], i) => mine.includes(id) ? Math.abs(t1[i][1] - (s + 1)) < .051 : t1[i][1] === s), 'com um grupo só, só ele anda', { t0, t1 });

  await p.screenshot({ path:path.join(outDir, 'varios-grupos.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
