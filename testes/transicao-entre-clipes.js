// Teste no navegador: transição entre clipes (pedido do usuário: "presets de transição entre vídeos").
// Duas fotos coladas na timeline (vermelha 0–2 s, azul 2–4 s): escolhe a transição no painel do clipe de cima com cliques de
// verdade, confere a mistura no quadro (dissolver, empurrar nas duas direções, escurecer), o marcador nas duas faixas da timeline,
// "Corte seco", Ctrl+Z, que separar os clipes desliga e que o painel do de baixo mostra "para o próximo". Depois um vídeo com som
// dividido na agulha: o vídeo continua com o resto do arquivo na janela, dividir de novo não copia a transição e o som cruza.
// Rodar: node testes/transicao-entre-clipes.js (prints na pasta temporária, mola-testes/transicao-*.png)
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
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); const bg = S.layers[0]; bg.mode = 'solid'; bg.c1 = '#000000'; bg.grain = 0; S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 4; S.slides = 1; T = 0; RT.selected = null; RT.picks = new Set(); changed({ layers:true, props:true }); renderTimeline(); });

  // duas fotos do tamanho do quadro, sem animação, uma depois da outra
  const ids = await p.evaluate(async () => {
    const mk = async (col, name, s, e) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 64, 64);
      const L = mkImage({ src:c.toDataURL(), name, in:'cut', out:'cut', inDur:0, outDur:0, size:1, mh:H() / SU, radius:0, x:.5, y:.5 });
      await getImage(L.src); S.layers.push(L); L.start = s; L.end = e; return L.id;
    };
    const a = await mk('#ff0000', 'Vermelha', 0, 2), b = await mk('#0000ff', 'Azul', 2, 4);
    changed({ layers:true }); renderTimeline(); return { a, b };
  });
  // um quadro pequeno, fora do palco; px = cor em (fx, fy) do quadro
  const px = (t, fx = .5, fy = .5) => p.evaluate(({ t, fx, fy }) => {
    const c = document.createElement('canvas'); c.width = Math.round(W() * .1); c.height = Math.round(H() * .1);
    const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, .1);
    const d = x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data; return [d[0], d[1], d[2]];
  }, { t, fx, fy });
  const xin = () => p.evaluate(id => { const L = S.layers.find(l => l.id === id); return L && L.xin ? { ...L.xin } : null; }, ids.b);
  const chip = name => p.locator('#props .chip', { hasText:new RegExp('^' + name + '$') }).first().click();

  // o painel do clipe de cima (Azul) tem a transição do anterior
  await p.evaluate(id => { select(id, true); propTab = 'anim'; renderProps(); }, ids.b);
  const secs = await p.evaluate(() => [...document.querySelectorAll('#props section h3')].map(h => h.firstChild && h.firstChild.textContent));
  ok(secs.includes('Transição do clipe anterior') && !secs.includes('Transição para o próximo'), 'o clipe que entra mostra "Transição do clipe anterior"', secs);
  ok(await p.evaluate(() => [...document.querySelectorAll('#props .chip[aria-pressed="true"]')].some(c => c.textContent === 'Corte seco')), 'sem transição, "Corte seco" vem marcado');
  ok(near((await px(1.99))[0], 255, 3) && near((await px(2.01))[2], 255, 3), 'sem transição o corte é seco (vermelho até 2 s, azul depois)', [await px(1.99), await px(2.01)]);

  await chip('Dissolver');
  ok((await xin())?.k === 'dissolve', 'clicar em Dissolver grava a transição no clipe que entra', await xin());
  // duração pelo campo digitável
  const num = p.locator('#props .field', { hasText:'Duração' }).locator('input.num');
  await num.click(); await num.fill('1'); await num.press('Enter'); await p.waitForTimeout(100);
  ok(near((await xin()).d, 1, .001), 'a duração digitada vale (1 s)', await xin());
  const pr = await p.evaluate(() => { const X = xfPairs(true), q = [...X.inn.values()][0]; return q && { a:q.A.name, b:q.B.name, t0:q.t0, t1:q.t1 }; });
  ok(pr && pr.a === 'Vermelha' && pr.b === 'Azul' && near(pr.t0, 1.5, .001) && near(pr.t1, 2.5, .001), 'a janela fica centrada no corte (1,5 s a 2,5 s)', pr);
  const ph = await p.evaluate(({ a, b }) => { const A = S.layers.find(l => l.id === a), B = S.layers.find(l => l.id === b); return { a:phase(A, 2.3)?.mode, b:phase(B, 1.7)?.mode, a2:phase(A, 2.6), b2:phase(B, 1.4) }; }, ids);
  ok(ph.a === 'hold' && ph.b === 'hold' && !ph.a2 && !ph.b2, 'na janela o que sai continua e o que entra começa antes; fora dela não', ph);
  const m = [await px(1.45), await px(2), await px(2.55)];
  ok(near(m[0][0], 255, 3) && m[0][2] < 4, 'antes da janela: só o vermelho', m[0]);
  ok(near(m[1][0], 128, 12) && near(m[1][2], 128, 12), 'no meio do dissolver: metade de cada', m[1]);
  ok(near(m[2][2], 255, 3) && m[2][0] < 4, 'depois da janela: só o azul', m[2]);
  // marcador nas duas faixas da timeline
  const mk = await p.evaluate(({ a, b }) => [a, b].map(id => document.querySelectorAll(`.tl-row[data-id="${id}"] .tl-xf`).length), ids);
  ok(mk[0] === 1 && mk[1] === 1, 'a timeline marca a janela na faixa dos dois clipes', mk);
  await p.evaluate(() => { pause(); T = 2; needs = true; }); await p.waitForTimeout(300);
  await p.screenshot({ path:path.join(outDir, 'transicao-dissolver.png') });

  // empurrar: na metade, o vermelho à esquerda e o azul à direita; para a direita, o contrário
  await chip('Empurrar');
  ok((await xin()).k === 'push' && near((await xin()).d, 1, .001), 'trocar o preset mantém a duração escolhida', await xin());
  let l = await px(2, .25), r = await px(2, .75);
  ok(l[0] > 200 && r[2] > 200, 'empurrar para a esquerda: o que sai à esquerda, o que entra à direita', { l, r });
  await p.locator('#props .segs.ico button[title="Para a direita"]').click();
  l = await px(2, .25); r = await px(2, .75);
  ok((await xin()).dir === 'r' && l[2] > 200 && r[0] > 200, 'para a direita: o contrário', { l, r, x:await xin() });
  await p.screenshot({ path:path.join(outDir, 'transicao-empurrar.png') });

  // escurecer: no corte, preto
  await chip('Escurecer');
  const k = await px(1.99);
  ok(k[0] < 20 && k[1] < 20 && k[2] < 20, 'escurecer: no meio da janela o quadro fica preto', k);
  // todos os presets desenham sem erro em vários pontos da janela
  const errs = await p.evaluate(async id => {
    const B = S.layers.find(l => l.id === id), out = [], c = document.createElement('canvas'); c.width = 108; c.height = 135; const x = c.getContext('2d');
    for (const k of XF_KEYS) { B.xin = { k, d:1 }; RT.rev++; for (const t of [1.5, 1.7, 2, 2.3, 2.5]) { try { renderFrame(x, t, .1); } catch (e) { out.push(k + ' ' + t + ' ' + e.message); } } }
    B.xin = { k:'black', d:1 }; RT.rev++; return out;
  }, ids.b);
  ok(!errs.length, `os ${await p.evaluate(() => XF_KEYS.length)} presets desenham em toda a janela`, errs);
  // com u = 1 sobra só o clipe que entra, inteiro (em todos os presets)
  const ends = await p.evaluate(async id => {
    const B = S.layers.find(l => l.id === id), out = {}, c = document.createElement('canvas'); c.width = 108; c.height = 135; const x = c.getContext('2d', { willReadFrequently:true });
    for (const k of XF_KEYS) { B.xin = { k, d:1 }; RT.rev++; renderFrame(x, 2.5, .1); const d = x.getImageData(54, 67, 1, 1).data; out[k] = [d[0], d[1], d[2]]; }
    B.xin = { k:'black', d:1 }; RT.rev++; return out;
  }, ids.b);
  ok(Object.values(ends).every(c => c[2] > 245 && c[0] < 10), 'no fim da janela todo preset termina no clipe que entra', ends);

  // corte seco tira; Ctrl+Z volta
  await chip('Corte seco');
  ok(!(await xin()), '"Corte seco" tira a transição');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok((await xin())?.k === 'black', 'Ctrl+Z traz a transição de volta', await xin());
  ok(await p.evaluate(() => [...document.querySelectorAll('#props .chip[aria-pressed="true"]')].some(c => c.textContent === 'Escurecer')), 'o painel acompanha o desfazer');

  // o de baixo mostra "para o próximo" e a mesma transição; a nota na saída
  await p.evaluate(id => { select(id, true); propTab = 'anim'; renderProps(); }, ids.a);
  const sa = await p.evaluate(() => ({ h:[...document.querySelectorAll('#props section h3')].map(h => h.firstChild && h.firstChild.textContent), on:[...document.querySelectorAll('#props .chip[aria-pressed="true"]')].map(c => c.textContent), note:document.querySelector('#props').textContent.includes('substitui esta saída') }));
  ok(sa.h.includes('Transição para o próximo') && sa.on.includes('Escurecer') && sa.note, 'o clipe que sai mostra "Transição para o próximo", com a mesma escolha', sa);
  await chip('Círculo');
  ok((await xin())?.k === 'circle', 'escolher pelo clipe que sai grava no que entra', await xin());

  // separar os clipes desliga a transição (fica guardada)
  await p.evaluate(id => { const B = S.layers.find(l => l.id === id); B.start = 2.6; changed({ layers:true }); renderTimeline(); }, ids.b);
  const sep = await p.evaluate(({ a, b }) => ({ n:xfPairs(true).n, ph:phase(S.layers.find(l => l.id === b), 2.4), mk:document.querySelectorAll('.tl-xf').length, keep:!!S.layers.find(l => l.id === b).xin }), ids);
  ok(sep.n === 0 && !sep.ph && sep.mk === 0 && sep.keep, 'clipes separados: sem transição e sem marcador (a escolha fica guardada)', sep);
  await p.evaluate(id => { const B = S.layers.find(l => l.id === id); B.start = 2; changed({ layers:true }); renderTimeline(); }, ids.b);
  ok(await p.evaluate(() => xfPairs(true).n === 1), 'colar de novo volta a transição');

  // palco com zoom (o canvas cobre só a parte vista): o que entra de fora da vista aparece igual ao quadro inteiro
  const zd = {};
  for (const k of ['push', 'whip', 'spin', 'blur', 'zoomout']) {
    await p.evaluate(({ id, k }) => { const B = S.layers.find(l => l.id === id); B.xin = { k, d:1, dir:'l' }; changed(); setZoom(4); pause(); T = 2.1; needs = true; }, { id:ids.b, k });
    await p.waitForTimeout(600);
    zd[k] = await p.evaluate(() => {
      const a = pctx.canvas, v = a._vo, full = document.createElement('canvas'); full.width = Math.round(FW() * RS); full.height = Math.round(H() * RS);
      renderFrame(full.getContext('2d'), T, RS);
      const x = document.createElement('canvas').getContext('2d', { willReadFrequently:true }); x.canvas.width = 2; x.canvas.height = 1; let mx = 0;
      for (let i = 0; i < 40; i++) { const px = Math.floor(a.width * ((i * .37) % 1)), py = Math.floor(a.height * ((i * .61) % 1)); x.clearRect(0, 0, 2, 1); x.drawImage(a, px, py, 1, 1, 0, 0, 1, 1); x.drawImage(full, px + (v ? v.x : 0), py + (v ? v.y : 0), 1, 1, 1, 0, 1, 1); const d = x.getImageData(0, 0, 2, 1).data; mx = Math.max(mx, Math.abs(d[0] - d[4]), Math.abs(d[1] - d[5]), Math.abs(d[2] - d[6])); }
      return v ? mx : 'sem recorte';
    });
  }
  await p.evaluate(() => setZoom(1));
  ok(Object.values(zd).every(v => typeof v === 'number' && v <= 24), 'com zoom no palco, o que entra de fora da vista sai igual ao quadro inteiro', zd);

  // vídeo com som: dividido na agulha, a transição usa o resto do arquivo e o som cruza
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.duration = 8; T = 0; RT.selected = null; RT.picks = new Set(); changed({ layers:true, props:true }); renderTimeline(); });
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
  const f = path.join(outDir, 'transicao-video.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64'));
  const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await chs.setFiles(f);
  await p.waitForFunction(() => S.layers.some(l => l.video), null, { timeout:15000 }); await p.waitForTimeout(600);
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => { t.hidden = true; }); const V = S.layers.find(l => l.video); V.start = 0; vidFitEnd(V); select(V.id, true); pause(); T = 1.5; needs = true; changed({ layers:true, props:true }); renderTimeline(); });
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('s'); await p.waitForTimeout(300);
  const vs = await p.evaluate(() => S.layers.filter(l => l.video).map(v => ({ id:v.id, start:v.start, end:v.end })));
  ok(vs.length === 2 && near(vs[1].start, 1.5, .02), 'o vídeo foi dividido em 1,5 s', vs);
  await p.evaluate(id => { select(id, true); propTab = 'anim'; renderProps(); }, vs[1].id);
  await chip('Dissolver');
  const vt = await p.evaluate(([a, b]) => { const A = S.layers.find(l => l.id === a), B = S.layers.find(l => l.id === b); return { a:vidTime(A, 1.7), b:vidTime(B, 1.3), a0:vidTime(A, 1.0), b0:vidTime(B, 2.0) }; }, [vs[0].id, vs[1].id]);
  ok(near(vt.a, 1.7, .03) && near(vt.b, 1.3, .03) && near(vt.a0, 1.0, .03) && near(vt.b0, 2.0, .03), 'na janela cada metade mostra o resto do vídeo (a 1ª continua, a 2ª começa antes)', vt);
  const fr = await p.evaluate(async () => { try { await seekVideos(1.6); const c = document.createElement('canvas'); c.width = 108; c.height = 135; renderFrame(c.getContext('2d'), 1.6, .1); return 'ok'; } catch (e) { return e.message; } });
  ok(fr === 'ok', 'o quadro da janela com os dois vídeos desenha (como na exportação)', fr);
  // a cor do quadro: o vídeo de teste gira 120° de matiz por segundo; em 1,6 s os dois clipes mostram o mesmo trecho do arquivo
  const col = await p.evaluate(async () => {
    const one = async t => { await seekVideos(t); const c = document.createElement('canvas'); c.width = 108; c.height = 135; const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, .1); return [...x.getImageData(54, 67, 1, 1).data].slice(0, 3); };
    return { mid:await one(1.6), before:await one(1.0) };
  });
  ok(Math.max(...col.mid) - Math.min(...col.mid) > 60 && Math.max(...col.before) - Math.min(...col.before) > 60, 'na janela aparece o vídeo, colorido (não o cinza de espera)', col);
  // som: a mistura tem som em toda a janela (sem buraco no corte) e o pedaço de cada metade passa do corte
  const au = await p.evaluate(async () => {
    const buf = await buildMix(8000, 3), ch = buf.getChannelData(0), rms = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * 8000); i < Math.floor(b * 8000); i++) { s += ch[i] * ch[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
    return { pre:rms(.8, 1.1), mid:rms(1.45, 1.55), post:rms(2, 2.3) };
  });
  ok(au.mid > au.pre * .5 && au.post > au.pre * .5, 'o som não some no corte (os dois cruzam)', au);
  // dividir de novo a 2ª metade: a 3ª parte não herda a transição
  await p.evaluate(id => { select(id, true); pause(); T = 2.4; needs = true; }, vs[1].id);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('s'); await p.waitForTimeout(300);
  const v3 = await p.evaluate(() => S.layers.filter(l => l.video).map(v => ({ start:v.start, xin:v.xin ? v.xin.k : null })).sort((a, b) => a.start - b.start));
  ok(v3.length === 3 && v3[1].xin === 'dissolve' && !v3[2].xin && !v3[0].xin, 'dividir de novo: a transição fica com a 1ª metade, a 2ª não herda', v3);
  await p.evaluate(() => { pause(); T = 1.5; needs = true; }); await p.waitForTimeout(500);
  await p.screenshot({ path:path.join(outDir, 'transicao-video.png') });

  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); console.log('prints em', outDir);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
