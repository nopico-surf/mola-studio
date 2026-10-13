// Teste no navegador: pausa no vídeo (pedido do usuário: dois vídeos na tela, um para e o outro continua).
// Dois vídeos lado a lado; no 1º "Pausar na agulha" (o quadro fica parado 1 s e o vídeo continua de onde parou, a barra cresce),
// no 2º "Congelar até o fim" (para no quadro da agulha até o fim da barra, que não muda). Confere o quadro desenhado (o parado
// não muda, o outro anda), a faixa na timeline, o som (silêncio na pausa), o campo do tempo parado, o corte pela borda da barra,
// "Tirar as pausas" e Ctrl+Z. O vídeo de teste é gravado no próprio navegador (cor mudando com o tempo + tom de 440 Hz).
// Rodar: node testes/pausa-no-video.js (prints na pasta temporária, mola-testes/pausa-*.png)
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

  // vídeo de teste: 3 s, a cor gira 120° por segundo (cada quadro diferente) e um tom contínuo
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
  const f = path.join(outDir, 'pausa-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  console.log('vídeo de teste:', rec.type);
  const addVideo = async () => {
    const n = await p.evaluate(() => S.layers.filter(l => l.video).length);
    const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await chs.setFiles(f);
    await p.waitForFunction(n => S.layers.filter(l => l.video).length > n, n, { timeout:15000 }); await p.waitForTimeout(400);
  };
  await addVideo(); await p.evaluate(() => { RT.selected = null; RT.picks = new Set(); renderProps(); }); await addVideo();
  // lado a lado, os dois começando em 0
  await p.evaluate(() => {
    S.duration = 6;
    S.layers.filter(l => l.video).forEach((V, i) => { V.start = 0; V.size = .4; V.mask = 'rect'; V.mh = .4; setPos(V, i ? .74 : .26, .5); vidFitEnd(V); });
    document.querySelectorAll('.toast').forEach(t => { t.hidden = true; });
    changed({ layers:true, props:true }); renderTimeline();
  });
  const ids = await p.evaluate(() => S.layers.filter(l => l.video).map(l => l.id));
  const st = () => p.evaluate(ids => ids.map(id => { const V = S.layers.find(l => l.id === id), A = S.layers.find(l => l.type === 'audio' && l.link === id); return { start:V.start, end:V.end, vIn:V.vIn, vOut:V.vOut, ps:V.vPause || null, aps:A ? A.vPause || null : 'sem som' }; }), ids);
  const s0 = await st();
  ok(s0.every(s => s.start === 0 && s.end > 2.5 && !s.ps), 'dois vídeos na tela, sem pausa', s0);

  // cor no centro de cada vídeo no tempo t (o mesmo caminho do PNG: o quadro exato de cada vídeo)
  const colors = t => p.evaluate(async ({ t, ids }) => {
    T = t; await seekVideos(t);
    const k = .25, c = document.createElement('canvas'); c.width = Math.round(FW() * k); c.height = Math.round(H() * k);
    const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, k, false);
    return ids.map(id => { const L = S.layers.find(l => l.id === id), b = L._bounds; return [...x.getImageData(Math.round((b.x + b.w / 2) * k), Math.round((b.y + b.h / 2) * k), 1, 1).data].slice(0, 3); });
  }, { t, ids });
  const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

  // 1º vídeo: agulha em 1 s, "Pausar na agulha" (botão do painel)
  await p.evaluate(id => { select(id); pause(); T = 1; needs = true; renderProps(); }, ids[0]);
  await p.locator('#props button', { hasText:'Pausar na agulha' }).click(); await p.waitForTimeout(300);
  const s1 = await st();
  ok(s1[0].ps && s1[0].ps.length === 1 && near(s1[0].ps[0].at, 1, .05) && s1[0].ps[0].len === 1, '"Pausar na agulha" cria uma pausa de 1 s no quadro da agulha', s1[0]);
  ok(near(s1[0].end, s0[0].end + 1, .01), 'a barra do vídeo cresce o tempo da pausa', { antes:s0[0].end, depois:s1[0].end });
  ok(JSON.stringify(s1[0].aps) === JSON.stringify(s1[0].ps), 'o som do vídeo ganha a mesma pausa', s1[0]);
  ok(!s1[1].ps && s1[1].end === s0[1].end, 'o outro vídeo não muda', s1[1]);
  const vt = await p.evaluate(id => { const V = S.layers.find(l => l.id === id); return [.5, 1.2, 1.8, 2.5].map(t => +vidTime(V, t).toFixed(3)); }, ids[0]);
  ok(near(vt[0], .5) && near(vt[1], 1) && near(vt[2], 1) && near(vt[3], 1.5), 'tempo do vídeo: anda, fica parado de 1 s a 2 s, continua de onde parou', vt);
  const c12 = await colors(1.2), c18 = await colors(1.8), c25 = await colors(2.5);
  ok(dist(c12[0], c18[0]) <= 6, 'o 1º vídeo mostra o mesmo quadro durante a pausa', [c12[0], c18[0]]);
  ok(dist(c12[1], c18[1]) > 30, 'o 2º vídeo continua andando no mesmo tempo', [c12[1], c18[1]]);
  ok(dist(c18[0], c25[0]) > 30, 'depois da pausa o 1º volta a andar', [c18[0], c25[0]]);
  const tl1 = await p.evaluate(ids => ids.map(id => document.querySelectorAll(`#tl .tl-row[data-id="${id}"] .tl-vp`).length), ids);
  ok(tl1[0] === 1 && tl1[1] === 0, 'a timeline mostra a pausa na barra do 1º vídeo', tl1);
  await p.screenshot({ path:path.join(outDir, 'pausa-1-pausar.png') });

  // som: o 2º fica mudo (volume 0) para medir só o do 1º; silêncio dentro da pausa, tom antes e depois
  const mix = await p.evaluate(ids => {
    const A2 = S.layers.find(l => l.type === 'audio' && l.link === ids[1]); if (A2) A2.vol = 0;
    return buildMix(48000, S.duration).then(m => { const d = m.getChannelData(0), rms = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * 48000); i < b * 48000; i++) { s += d[i] * d[i]; n++; } return +Math.sqrt(s / n).toFixed(4); }; if (A2) A2.vol = 1; return { antes:rms(.3, .9), pausa:rms(1.1, 1.9), depois:rms(2.1, 2.8) }; });
  }, ids);
  ok(mix.antes > .05 && mix.pausa < .005 && mix.depois > .05, 'o som para durante a pausa e volta depois', mix);

  // o campo da pausa: digitar 0,5 s encurta a pausa e a barra
  const fld = p.locator('#props .field', { hasText:'Pausa 1,0s' });
  ok(await fld.count() === 1, 'o painel tem um campo para o tempo parado', await fld.count());
  await fld.locator('input.num').click(); await fld.locator('input.num').fill('0,5'); await fld.locator('input.num').press('Enter'); await p.waitForTimeout(200);
  const s2 = await st();
  ok(s2[0].ps && s2[0].ps[0].len === .5 && near(s2[0].end, s0[0].end + .5, .01), 'mudar o tempo parado muda a pausa e a barra', s2[0]);

  // 2º vídeo: agulha em 2 s, "Congelar até o fim": a barra não muda e o quadro fica parado até o fim
  await p.evaluate(id => { select(id); pause(); T = 2; needs = true; renderProps(); }, ids[1]);
  await p.locator('#props button', { hasText:'Congelar até o fim' }).click(); await p.waitForTimeout(300);
  const s3 = await st();
  ok(s3[1].end === s0[1].end && near(s3[1].vOut, 2, .05) && s3[1].ps && s3[1].ps.length === 1 && near(s3[1].ps[0].at, s3[1].vOut, .001) && near(s3[1].ps[0].len, s0[1].end - 2, .01),
    '"Congelar até o fim" corta o trecho na agulha e congela até o fim da barra (a barra fica igual)', s3[1]);
  const c21 = await colors(2.1), c28 = await colors(Math.min(2.8, s3[1].end - .05));
  ok(dist(c21[1], c28[1]) <= 6, 'o 2º vídeo fica congelado', [c21[1], c28[1]]);
  ok(dist(c21[0], c28[0]) > 30, 'enquanto o 1º continua tocando', [c21[0], c28[0]]);
  ok(await p.locator('#props .field', { hasText:'Congelado' }).count() === 1, 'o campo do congelado aparece no painel');
  await p.screenshot({ path:path.join(outDir, 'pausa-2-congelar.png') });

  // borda direita da barra do congelado: puxar para a direita estica o congelado (o trecho não muda)
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.hidden = true; }); S.duration = 8; changed({ layers:true }); renderTimeline(); });
  const bb = await p.evaluate(id => { const bar = document.querySelector(`#tl .tl-row[data-id="${id}"] .tl-bar`); bar.scrollIntoView({ block:'center' }); const r = bar.getBoundingClientRect(); return { x:r.right - 3, y:r.top + r.height / 2, w:document.querySelector('#tl .tl-scale').getBoundingClientRect().width }; }, ids[1]);
  await p.mouse.move(bb.x, bb.y); await p.mouse.down(); await p.keyboard.down('Shift'); /* sem ímã (Shift no clique escolhe em vez de arrastar) */ await p.mouse.move(bb.x + 10, bb.y, { steps:3 }); await p.mouse.move(bb.x + bb.w / 8, bb.y, { steps:6 }); await p.mouse.up();
  await p.keyboard.up('Shift'); await p.waitForTimeout(300);
  const s4 = await st();
  ok(s4[1].end > s3[1].end + .5 && s4[1].vOut === s3[1].vOut && near(s4[1].ps[0].len, s4[1].end - 2, .02), 'esticar a barra estica o congelado', { antes:s3[1], depois:s4[1] });
  // puxar para a esquerda até antes do congelado corta o vídeo e tira o congelado
  await p.evaluate(id => { const V = S.layers.find(l => l.id === id), v = vidSnap(V, S.duration); V.end = 1.5; vidTrim(V, v, 'r'); }, ids[1]);
  const s5 = await st();
  ok(near(s5[1].vOut, 1.5, .01) && !s5[1].ps, 'cortar antes do congelado tira o congelado', s5[1]);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);

  // corte pela esquerda com pausa: o vídeo fica parado no tempo e a pausa cortada fica com o resto
  const lc = await p.evaluate(() => {
    const L = { start:0, end:3.5, vdur:3, vPause:[{ at:1, len:1 }], type:'image' }, v = vidSnap(L, 8);
    L.start = 1.4; vidCutP(L, v, true, false); const a = { vIn:L.vIn, ps:L.vPause, t:+vidTime(L, 2.2).toFixed(3) };
    const L2 = { start:0, end:3.5, vdur:3, vPause:[{ at:1, len:1 }], type:'image' }, v2 = vidSnap(L2, 8);
    L2.start = .5; vidCutP(L2, v2, true, false); return { a, b:{ vIn:L2.vIn, ps:L2.vPause, t:+vidTime(L2, 1.5).toFixed(3) } };
  });
  ok(lc.a.vIn === 1 && lc.a.ps[0].len === .6 && near(lc.a.t, 1.2), 'cortar pela esquerda dentro da pausa deixa o resto dela', lc.a);
  ok(lc.b.vIn === .5 && lc.b.ps[0].len === 1 && near(lc.b.t, 1), 'cortar pela esquerda antes da pausa mantém a pausa no mesmo tempo', lc.b);

  // "Tirar as pausas" no 1º vídeo: a barra volta ao tamanho do trecho
  await p.evaluate(id => { select(id); renderProps(); }, ids[0]);
  await p.locator('#props button', { hasText:'Tirar as pausas' }).click(); await p.waitForTimeout(200);
  const s6 = await st();
  ok(!s6[0].ps && near(s6[0].end, s0[0].end, .01) && s6[0].aps === null, '"Tirar as pausas" tira a pausa do vídeo e do som e a barra volta', s6[0]);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  const s7 = await st();
  ok(s7[0].ps && s7[0].ps[0].len === .5, 'Ctrl+Z traz a pausa de volta', s7[0]);

  // sem limite de tempo (pedido do usuário): pausa maior que o arquivo faz o arquivo crescer junto
  const D0 = await p.evaluate(() => S.duration);
  await p.evaluate(id => { select(id); renderProps(); }, ids[0]);
  const fp = p.locator('#props .field', { hasText:'Pausa' }).first();
  await fp.locator('input.num').click(); await fp.locator('input.num').fill('20'); await fp.locator('input.num').press('Enter'); await p.waitForTimeout(250);
  const s8 = await st(), D1 = await p.evaluate(() => S.duration);
  ok(s8[0].ps && s8[0].ps[0].len === 20, 'a pausa digitada passa da duração do arquivo (sem teto)', { len:s8[0].ps && s8[0].ps[0].len, D0 });
  ok(D1 > D0 && D1 >= s8[0].end - .01 && near(s8[0].end, s0[0].end + 20, .01), 'o arquivo cresce para caber a pausa e a barra vai até o fim dela', { D0, D1, end:s8[0].end });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  const D2 = await p.evaluate(() => S.duration);
  ok(D2 === D0, 'Ctrl+Z devolve também a duração do arquivo', { D0, D2 });

  // tocar com as pausas não dá erro
  await p.keyboard.press('Escape'); await p.evaluate(() => { T = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(1500); await p.keyboard.press('Space');
  await p.screenshot({ path:path.join(outDir, 'pausa-3-final.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
