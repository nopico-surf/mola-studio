// Teste no navegador: "Dividir na agulha" (pedido do usuário: cortar o vídeo da timeline sem arrastar a borda da barra).
// Um vídeo com som é dividido pelo atalho S, pelo botão do transporte, pelo botão do painel e pelo menu do botão direito. Confere
// que o quadro de cada tempo é o mesmo de antes (com pausa, corte seco, velocidade e barra que repete), que cada metade fica com o
// som dela, em grupo próprio, sem animação de saída na 1ª nem de entrada na 2ª, que o fundo/texto não dividem, bloqueado recusa,
// agulha fora da barra avisa e Ctrl+Z desfaz tudo. O vídeo de teste é gravado no próprio navegador (cor mudando + tom).
// Rodar: node testes/dividir-video.js (prints na pasta temporária, mola-testes/dividir-*.png)
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
  const reset = () => p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 8; T = 0; RT.selected = null; RT.picks = new Set(); changed({ layers:true, props:true }); renderTimeline(); });
  await reset();

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
  const f = path.join(outDir, 'dividir-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  console.log('vídeo de teste:', rec.type);
  const addVideo = async () => {
    const n = await p.evaluate(() => S.layers.filter(l => l.video).length);
    const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
    await chs.setFiles(f);
    await p.waitForFunction(n => S.layers.filter(l => l.video).length > n, n, { timeout:15000 }); await p.waitForTimeout(500);
    await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.hidden = true; }); });
  };
  const vids = () => p.evaluate(() => S.layers.filter(l => l.video).map(V => ({ id:V.id, start:V.start, end:V.end, vIn:V.vIn, vOut:V.vOut, grp:V.grp || null, out:V.out, in:V.in, ps:V.vPause || null, sk:V.vSkip || null, sp:V.vSpeed || 1 })));
  const auds = () => p.evaluate(() => S.layers.filter(l => l.type === 'audio').map(A => ({ id:A.id, link:A.link, start:A.start, end:A.end, vIn:A.vIn, vOut:A.vOut, grp:A.grp || null, ps:A.vPause || null })));
  const toastText = () => p.evaluate(() => [...document.querySelectorAll('.toast')].filter(t => !t.hidden).map(t => t.textContent).join(' | '));
  // o quadro de cada tempo da barra (segundo do vídeo original) antes e depois da divisão
  const times = (ids, us) => p.evaluate(({ ids, us }) => us.map(u => {
    const V = ids.map(id => S.layers.find(l => l.id === id)).filter(Boolean).find(v => u >= v.start - 1e-6 && u < (v.end ?? S.duration) - 1e-6);
    return V ? +vidTime(V, u).toFixed(3) : null;
  }), { ids, us });

  await addVideo();
  await p.evaluate(() => { const V = S.layers.find(l => l.video); V.start = 0; vidFitEnd(V); changed({ layers:true, props:true }); renderTimeline(); });
  const v0 = (await vids())[0], a0 = await auds();
  ok(v0 && a0.length === 1 && a0[0].link === v0.id, 'vídeo com o som dele numa camada de Áudio', { v0, a0 });
  const us = [.1, .6, 1.0, 1.19, 1.21, 1.7, 2.3, 2.8];
  const before = await times([v0.id], us);

  // agulha em 1,2 s, o vídeo escolhido, atalho S
  await p.evaluate(id => { select(id, true); pause(); T = 1.2; needs = true; renderProps(); }, v0.id);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('s'); await p.waitForTimeout(300);
  let vs = await vids(), as = await auds();
  ok(vs.length === 2, 'S divide o vídeo em dois', vs);
  const [A, B] = vs;
  ok(A.id === v0.id && near(A.start, 0, .001) && near(A.end, 1.2, .01), 'a 1ª metade fica com a camada e termina na agulha', A);
  ok(near(B.start, 1.2, .01) && near(B.end, v0.end, .01), 'a 2ª metade começa na agulha e vai até o fim da barra de antes', { B, fim:v0.end });
  ok(near(A.vOut, 1.2, .05) && near(B.vIn, 1.2, .05) && !A.vIn && !B.vOut, 'o trecho de cada metade: 1ª até 1,2 s do vídeo, 2ª a partir dele', { A, B });
  const after = await times([A.id, B.id], us);
  ok(before.every((v, i) => v != null && after[i] != null && near(v, after[i], .001)), 'o quadro de cada tempo é o mesmo de antes de dividir', { before, after });
  ok(as.length === 2 && as.filter(x => x.link === A.id).length === 1 && as.filter(x => x.link === B.id).length === 1, 'cada metade fica com o som dela', as);
  const sa = as.find(x => x.link === A.id), sb = as.find(x => x.link === B.id);
  ok(near(sa.start, 0, .001) && near(sa.end, 1.2, .01) && near(sb.start, 1.2, .01) && near(sb.end, B.end, .01) && near(sb.vIn, 1.2, .05), 'o som de cada metade tem o mesmo tempo e corte do vídeo dela', { sa, sb });
  ok(A.grp && B.grp && A.grp !== B.grp && sa.grp === A.grp && sb.grp === B.grp, 'cada metade tem o grupo de vídeo e som dela', { A:A.grp, B:B.grp, sa:sa.grp, sb:sb.grp });
  ok(await p.evaluate(({ a, b }) => RT.picks.size === 1 && RT.picks.has(b) && RT.selected === b && !RT.picks.has(a), { a:A.id, b:B.id }), 'a 2ª metade fica escolhida, sozinha');
  ok(await p.evaluate(() => { const t = document.querySelector('.toast:not([hidden])'); return !!t; }), 'um aviso com Desfazer aparece');
  await p.evaluate(({ a }) => { select(a); }, { a:A.id });
  ok(await p.evaluate(({ a, b }) => RT.picks.has(a) && !RT.picks.has(b), { a:A.id, b:B.id }), 'clicar numa metade escolhe só ela');
  await p.screenshot({ path:path.join(outDir, 'dividir-1-s.png') });

  // misturar: o som da 1ª metade toca de 0 a 1,2 s e o da 2ª de 1,2 s em diante, sem silêncio no corte
  const mix = await p.evaluate(() => buildMix(48000, S.duration).then(m => { const d = m.getChannelData(0), rms = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * 48000); i < b * 48000; i++) { s += d[i] * d[i]; n++; } return +Math.sqrt(s / n).toFixed(4); }; return { antes:rms(.8, 1.15), corte:rms(1.15, 1.25), depois:rms(1.3, 2.5) }; }));
  ok(mix.antes > .05 && mix.corte > .05 && mix.depois > .05, 'o som continua inteiro pelo corte', mix);

  // Ctrl+Z desfaz o corte e o som
  await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
  vs = await vids(); as = await auds();
  ok(vs.length === 1 && vs[0].id === v0.id && near(vs[0].end, v0.end, .001) && as.length === 1 && as[0].link === v0.id && near(as[0].end, v0.end, .001), 'Ctrl+Z volta ao vídeo inteiro, com o som', { vs, as });

  // animação: a entrada fica na 1ª metade e a saída na 2ª; o corte é seco
  await p.evaluate(id => { const V = S.layers.find(l => l.id === id); V.in = 'fade'; V.inDur = .5; V.out = 'fade'; V.outDur = .5; changed({ layers:true, props:true }); select(id, true); pause(); T = 1.5; needs = true; }, v0.id);
  await p.locator('#splitBtn').click(); await p.waitForTimeout(250);
  vs = await vids();
  ok(vs.length === 2 && vs[0].in === 'fade' && vs[0].out === 'cut' && vs[1].in === 'cut' && vs[1].out === 'fade', 'a entrada fica na 1ª metade e a saída na 2ª (corte seco)', vs);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(250);

  // com pausa (a agulha dentro dela e depois dela), corte seco e velocidade: o quadro de cada tempo não muda
  const mk = (cfg) => p.evaluate(({ id, cfg }) => { const V = S.layers.find(l => l.id === id); delete V.vPause; delete V.vSkip; delete V.vSpeed; delete V.vIn; delete V.vOut; Object.assign(V, cfg); V.start = 0; vidFitEnd(V); changed({ layers:true, props:true }); select(id, true); pause(); renderTimeline(); return { start:V.start, end:V.end }; }, { id:v0.id, cfg });
  const grade = [0, .3, .8, 1.2, 1.6, 1.99, 2.01, 2.4, 2.65, 2.9, 3.4, 3.9, 4.4];
  const casos = [
    ['pausa, agulha dentro dela', { vPause:[{ at:1, len:1 }] }, 1.5],
    ['pausa, agulha depois dela', { vPause:[{ at:1, len:1 }] }, 2.5],
    ['corte seco, agulha depois dele', { vSkip:[{ at:.5, len:.8 }] }, 1.6],
    ['velocidade 2×', { vSpeed:2 }, .7],
    ['trecho cortado (vIn/vOut)', { vIn:.4, vOut:2.6 }, 1.0],
    ['pausa + corte + 1,5×', { vPause:[{ at:.8, len:.6 }], vSkip:[{ at:1.5, len:.5 }], vSpeed:1.5 }, 1.9],
    ['congelado até o fim, agulha dentro do congelado', { vOut:1.5, vPause:[{ at:1.5, len:2 }] }, 2.6],
  ];
  for (const [nome, cfg, t] of casos) {
    const bar = await mk(cfg);
    const tt = Math.min(t, bar.end - .3), antes = await times([v0.id], grade.filter(u => u < bar.end - .02));
    await p.evaluate(t => { T = t; needs = true; }, tt);
    await p.keyboard.press('s'); await p.waitForTimeout(200);
    const pc = await vids(), us2 = grade.filter(u => u < bar.end - .02), dep = await times(pc.map(x => x.id), us2);
    ok(pc.length === 2 && near(pc[0].end, tt, .02) && near(pc[1].start, tt, .02) && near(pc[1].end, bar.end, .001), `${nome}: duas metades que se encontram na agulha`, pc);
    ok(antes.every((v, i) => v != null && dep[i] != null && near(v, dep[i], .005)), `${nome}: o quadro de cada tempo é o mesmo de antes`, { antes, dep, us2 });
    const sa2 = await auds();
    ok(sa2.length === 2 && sa2.every(x => pc.some(v => v.id === x.link && near(v.start, x.start, .001) && near(v.end, x.end, .001))), `${nome}: o som de cada metade acompanha o vídeo dela`, sa2);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  }

  // barra que repete o trecho (o vídeo tem 3 s e a barra 7 s): a 2ª metade começa no quadro que estava ali
  await mk({ vIn:.5, vOut:2.0 });
  await p.evaluate(id => { const V = S.layers.find(l => l.id === id); V.end = 6; changed({ layers:true }); T = 3.2; needs = true; }, v0.id);
  // (a 2ª metade repete o trecho dela, que começa no quadro da agulha: o que vem depois da 1ª passada dela é o mesmo que puxar a
  // borda esquerda faz, então só se confere até o fim dessa passada, 3,2 + 1,3 = 4,5 s)
  const gl = [0, 1, 2.2, 3.1, 3.3, 4.2];
  const antesL = await times([v0.id], gl);
  await p.keyboard.press('s'); await p.waitForTimeout(200);
  const pcL = await vids(), depL = await times(pcL.map(x => x.id), gl);
  ok(pcL.length === 2 && antesL.every((v, i) => near(v, depL[i], .005)), 'barra que repete: cada tempo mostra o mesmo quadro de antes (1ª passada de cada metade)', { antesL, depL, pcL });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);

  // dividir de novo a 2ª metade (S repetido avança): três pedaços, cada um com o som
  await mk({});
  await p.evaluate(() => { T = .8; needs = true; }); await p.keyboard.press('s'); await p.waitForTimeout(150);
  await p.evaluate(() => { T = 1.8; needs = true; }); await p.keyboard.press('s'); await p.waitForTimeout(150);
  vs = await vids(); as = await auds();
  ok(vs.length === 3 && as.length === 3 && vs[0].end <= vs[1].start + .01 && near(vs[1].end, vs[2].start, .01), 'dividir a 2ª metade de novo dá três pedaços, cada um com o som', { vs, as });
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
  ok((await vids()).length === 1, 'dois Ctrl+Z voltam ao vídeo inteiro');

  // botão do painel e menu do botão direito
  await mk({});
  await p.evaluate(id => { select(id, true); T = 1; needs = true; renderProps(); }, v0.id);
  await p.locator('#props button', { hasText:'Dividir na agulha' }).first().click(); await p.waitForTimeout(250);
  ok((await vids()).length === 2, 'o botão "Dividir na agulha" do painel divide');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  await p.evaluate(id => { select(id, true); T = 1; needs = true; const r = document.querySelector(`#tl .tl-row[data-id="${id}"]`); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:200, clientY:200 })); }, v0.id);
  const itm = p.locator('.ctx button', { hasText:'Dividir na agulha' });
  ok(await itm.count() === 1 && !(await itm.isDisabled()), 'o menu do botão direito tem "Dividir na agulha"');
  await itm.click(); await p.waitForTimeout(250);
  ok((await vids()).length === 2, 'o item do menu divide');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);

  // som que segue o vídeo escolhido sozinho: divide o vídeo e o som juntos
  await p.evaluate(id => { const A = S.layers.find(l => l.type === 'audio' && l.link === id); select(A.id, true); T = 1; needs = true; }, v0.id);
  await p.keyboard.press('s'); await p.waitForTimeout(200);
  ok((await vids()).length === 2 && (await auds()).length === 2, 'com o som escolhido, divide o vídeo e o som juntos');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);

  // sem nada escolhido: o vídeo que toca na agulha
  await p.evaluate(() => { selectBg(); T = 1; needs = true; });
  await p.keyboard.press('s'); await p.waitForTimeout(200);
  ok((await vids()).length === 2, 'sem escolher nada, divide o vídeo que está na agulha');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);

  // recusas: fora da barra, bloqueado, outro tipo
  await p.evaluate(id => { select(id, true); T = 7.5; needs = true; }, v0.id);
  await p.keyboard.press('s'); await p.waitForTimeout(150);
  ok((await vids()).length === 1 && /barra do vídeo/.test(await toastText()), 'agulha fora da barra: não divide e avisa', await toastText());
  await p.evaluate(id => { const V = S.layers.find(l => l.id === id); V.locked = true; select(id, true); T = 1; needs = true; }, v0.id);
  await p.keyboard.press('s'); await p.waitForTimeout(150);
  ok((await vids()).length === 1 && /bloqueada/.test(await toastText()), 'bloqueado: não divide e avisa', await toastText());
  await p.evaluate(id => { delete S.layers.find(l => l.id === id).locked; }, v0.id);
  await p.evaluate(() => { const t = mkComp('title'); addLayer(t); T = 1; needs = true; });
  await p.keyboard.press('s'); await p.waitForTimeout(150);
  ok((await vids()).length === 1 && /vídeo e som/.test(await toastText()), 'texto escolhido: não divide e explica', await toastText());

  // imagem estática: o botão some
  await p.evaluate(() => { setStill(true); });
  ok(!(await p.locator('#splitBtn').isVisible()), 'imagem estática: o botão some');
  await p.evaluate(() => { setStill(false); });

  await p.screenshot({ path:path.join(outDir, 'dividir-2-final.png') });
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
