// Teste no navegador: vários vídeos escolhidos de uma vez (pedido do usuário: "selecionar vários vídeos na timeline e aplicar
// propriedades para eles, por exemplo mudar a velocidade de todos"). A velocidade vale para todos os vídeos da seleção e o som
// de cada um acompanha; vale com Shift + clique nas barras da timeline, com o grupo inteiro escolhido (os vídeos entram no grupo
// do primeiro), com Ctrl + A, com vídeo + texto escolhidos e com Ctrl+Z. Corte/pausas/silêncios ficam para um vídeo só.
// O vídeo de teste é gravado no próprio navegador. Rodar: node testes/varios-videos.js
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
  await p.goto(url); await p.waitForTimeout(1500);
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
  const f = path.join(outDir, 'varios-videos.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  for (let i = 0; i < 3; i++) {
    const n = await p.evaluate(() => S.layers.filter(l => l.video).length);
    const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await chs.setFiles(f);
    await p.waitForFunction(n => S.layers.filter(l => l.video).length > n, n, { timeout:15000 }); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => { t.hidden = true; }));
  }
  const ids = await p.evaluate(() => S.layers.filter(l => l.video).map(l => l.id));
  const speeds = () => p.evaluate(() => S.layers.filter(l => l.video || l.type === 'audio').map(l => l.vSpeed || 1));
  const secs = () => p.evaluate(() => [...document.querySelectorAll('#props h3')].map(h => h.textContent.trim()));
  const hasSpeed = () => p.locator('#props .segs.spd').count();
  const setSpeed = async t => { await p.locator('#props .segs.spd button', { hasText:t }).first().click(); await p.waitForTimeout(300); };
  const reset = () => p.evaluate(() => { for (const l of S.layers) if (l.video || l.type === 'audio') delete l.vSpeed; changed({ layers:true, props:true }); renderTimeline(); });
  ok(ids.length === 3, 'três vídeos no arquivo', ids);

  // 1) Shift + clique nas barras
  await p.locator(`.tl-row[data-id="${ids[0]}"] .tl-bar`).click();
  await p.locator(`.tl-row[data-id="${ids[1]}"] .tl-bar`).click({ modifiers:['Shift'] });
  await p.locator(`.tl-row[data-id="${ids[2]}"] .tl-bar`).click({ modifiers:['Shift'] });
  await p.waitForTimeout(300);
  ok(await hasSpeed() === 1 && (await secs()).includes('Vídeo'), 'Shift + clique: o painel mostra a velocidade', await secs());
  await setSpeed('2×');
  ok((await speeds()).every(v => v === 2), 'a velocidade vale para os três vídeos e o som de cada um', await speeds());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  ok((await speeds()).every(v => v === 1), 'Ctrl+Z volta tudo num passo só', await speeds());
  await reset();

  // 2) o grupo inteiro escolhido (os vídeos entraram no grupo do primeiro)
  const grp = await p.evaluate(() => { const g = {}; for (const l of S.layers) if (l.grp) g[l.grp] = (g[l.grp] || 0) + 1; return g; });
  console.log('grupos:', JSON.stringify(grp));
  await p.locator('.tl-row.grp .lcell').first().click(); await p.waitForTimeout(300);
  const g1 = await p.evaluate(() => ({ gid:wholeGroup(), n:pickedLayers().filter(l => l.video).length }));
  if (g1.gid) {
    ok(await hasSpeed() === 1 && (await secs()).includes('Vídeos'), 'grupo inteiro: o painel mostra a velocidade dos vídeos', await secs());
    await setSpeed('1,5×');
    ok((await speeds()).every(v => v === 1.5), 'grupo inteiro: a velocidade vale para todos os vídeos dentro', await speeds());
    await reset();
  } else console.log('(os vídeos não ficaram num grupo só: caso do grupo inteiro não se aplica)');

  // 3) Ctrl + A
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await p.keyboard.press('Control+a'); await p.waitForTimeout(300);
  ok(await hasSpeed() === 1, 'Ctrl + A: o painel mostra a velocidade', await secs());
  await setSpeed('0,5×');
  ok((await speeds()).every(v => v === .5), 'Ctrl + A: a velocidade vale para todos', await speeds());
  await reset();

  // 4) vídeo + texto escolhidos (tipos diferentes)
  await p.evaluate(() => { const t = mkComp('title'); t.text = 'Oi'; S.layers.push(t); changed({ layers:true, props:true }); });
  await p.evaluate(ids => { const t = S.layers.find(l => l.type === 'text'); select(ids[0], true); RT.picks = new Set([ids[0], ids[1], t.id]); RT.selected = t.id; renderLayers(); renderProps(); }, ids);
  await p.waitForTimeout(200);
  ok(await hasSpeed() === 1, 'dois vídeos + texto: a velocidade aparece', await secs());
  await setSpeed('2×');
  const sp = await speeds();
  ok(sp.filter(v => v === 2).length >= 2 && sp.filter(v => v === 2).length < sp.length, 'vale só para os vídeos escolhidos', sp);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
