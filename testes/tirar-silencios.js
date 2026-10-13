// Teste no navegador: botão "Tirar silêncios" (pedido do usuário: cortes secos num botão, não como regra).
// Vídeo de teste de 20 s gravado no navegador: número do quadro em faixas horizontais de cinza e "fala" (tom modulado como sílabas)
// com silêncios conhecidos: 0–0,5 (começo), 3–4,5 (pausa), 7–7,3 (respiro curto, fica), 10–12 (pausa), 15–20 (fim).
// Esperado: o trecho vai de ~0,4 a ~15,15 s e o vídeo pula duas vezes (depois de ~3,15 e de ~10,15); o som pula junto; o arquivo
// (que era só o vídeo) encurta; as bordas da barra cortam respeitando os pulos; "Devolver os silêncios" tira os pulos.
// Caminho real: botão Vídeo → camada escolhida → botão "Tirar silêncios" no painel → timeline / palco / mistura do som.
// Rodar: node testes/tirar-silencios.js (prints na pasta temporária, mola-testes/silencios-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const near = (a, b, e = .06) => Math.abs(a - b) <= e;
const FPS = 10, DUR = 20, TALK = [[.5, 3], [4.5, 7], [7.3, 10], [12, 15]];
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; T = 0; setDuration(20); changed({ layers:true, props:true }); renderTimeline(); });

  const g = await p.evaluate(async ({ FPS, DUR, TALK }) => {
    const w = 160, hh = 96, N = FPS * DUR, c = new OffscreenCanvas(w, hh), x = c.getContext('2d');
    const sr = 48000, aCfg = { codec:'mp4a.40.2', sampleRate:sr, numberOfChannels:2, bitrate:128000 };
    if (!window.AudioEncoder || !(await AudioEncoder.isConfigSupported(aCfg)).supported) return { noA:true };
    const mux = new Mp4Muxer.Muxer({ target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:'avc', width:w, height:hh }, audio:{ codec:'aac', sampleRate:sr, numberOfChannels:2 }, fastStart:'in-memory', firstTimestampBehavior:'strict' });
    const enc = new VideoEncoder({ output:(ch, m) => mux.addVideoChunk(ch, m), error:e => { throw e; } });
    enc.configure({ codec:'avc1.42001f', width:w, height:hh, bitrate:300000, framerate:FPS });
    const ae = new AudioEncoder({ output:(ch, m) => mux.addAudioChunk(ch, m), error:e => { throw e; } }); ae.configure(aCfg);
    // fala: 220 Hz com sílabas de 4 Hz; fundo: chiado baixo (determinístico)
    const talk = t => TALK.some(([a, b]) => t >= a && t < b);
    const smp = i => { const t = i / sr, n = Math.sin(i * 12.9898) * 43758.5453; const noise = (n - Math.floor(n) - .5) * .004; return noise + (talk(t) ? .35 * (.55 + .45 * Math.sin(2 * Math.PI * 4 * t)) * Math.sin(2 * Math.PI * 220 * t) : 0); };
    const aChunk = 4800; let aPos = 0;
    for (let n = 0; n < N; n++) {
      [n % 16, (n >> 4) % 16, (n >> 8) % 16].forEach((v, i) => { const g = v * 16 + 8; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(0, i * hh / 3, w, hh / 3 + 1); });
      const vf = new VideoFrame(c, { timestamp:Math.round(n * 1e6 / FPS), duration:Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame:n % (FPS * 2) === 0 }); vf.close();
      while (aPos < (n + 1) / FPS * sr) {
        const d = new Float32Array(aChunk * 2); for (let i = 0; i < aChunk; i++) d[i] = d[i + aChunk] = smp(aPos + i);
        const ad = new AudioData({ format:'f32-planar', sampleRate:sr, numberOfFrames:aChunk, numberOfChannels:2, timestamp:Math.round(aPos / sr * 1e6), data:d });
        ae.encode(ad); ad.close(); aPos += aChunk;
      }
    }
    await enc.flush(); await ae.flush(); mux.finalize();
    const u8 = new Uint8Array(mux.target.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s) };
  }, { FPS, DUR, TALK });
  if (g.noA) { console.log('este Chrome não grava AAC: teste pulado'); await b.close(); return; }
  const fVid = path.join(outDir, 'silencios.mp4'); fs.writeFileSync(fVid, Buffer.from(g.b64, 'base64'));

  // ---------- entra pelo botão Vídeo; o vídeo ocupa o arquivo inteiro (como um corte) ----------
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch.setFiles(fVid);
  await p.waitForFunction(() => S.layers.some(l => l.video) && S.layers.some(l => l.type === 'audio'), null, { timeout:20000 });
  await p.evaluate(() => { const V = S.layers.find(l => l.video); V.start = 0; V.end = 20; V.in = 'cut'; V.inDur = 0; select(V.id, true); changed({ layers:true, props:true }); renderTimeline(); renderProps(); });
  await p.evaluate(() => videosReady()); await p.waitForTimeout(400);

  const frameAt = t => p.evaluate(async t => {
    T = t; await seekVideos(t);
    const c = softCv(FW(), H()), x = c.getContext('2d'); renderFrame(x, t, 1, true);
    const b = S.layers.find(l => l.video)._bounds;
    const px = i => { const d = x.getImageData(Math.round(b.x + b.w / 2), Math.round(b.y + b.h * (i * 2 + 1) / 6), 1, 1).data; return Math.round((d[0] - 8) / 16); };
    return px(0) + px(1) * 16 + px(2) * 256;
  }, t);

  // os números abaixo são do modo Suave (pausas de 0,5 s ou mais, folga de 0,1 s antes e 0,15 s depois)
  await p.evaluate(() => { localStorage.setItem('mola-sil', 'soft'); Object.assign(SIL, SIL_MODES.soft); renderProps(); });

  // ---------- o botão no painel do vídeo ----------
  const btn = p.locator('#props button', { hasText:'Tirar silêncios' });
  ok(await btn.count() === 1, 'o painel do vídeo tem o botão "Tirar silêncios"');
  await btn.scrollIntoViewIfNeeded(); await btn.click();
  await p.waitForFunction(() => { const V = S.layers.find(l => l.video); return V && V.vSkip; }, null, { timeout:20000 });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio');
    return { vIn:V.vIn, vOut:V.vOut, sk:V.vSkip, end:V.end, dur:S.duration, aSk:A.vSkip, aEnd:A.end, cyc:vidPlan(V).cyc,
      marks:document.querySelectorAll('#tl .tl-vj').length, btn:[...document.querySelectorAll('#props button')].map(b => b.textContent).filter(t => /silêncio|Refazer no modo/i.test(t)),
      toast:(document.querySelector('.toast') || {}).textContent || '' };
  });
  console.log('resultado:', JSON.stringify(r));
  ok(near(r.vIn, .4, .08) && near(r.vOut, 15.15, .08), 'silêncio do começo e do fim vira corte das bordas (≈0,4 s a ≈15,15 s)', r);
  ok(r.sk && r.sk.length === 2 && near(r.sk[0].at, 3.15, .08) && near(r.sk[0].len, 1.25, .12) && near(r.sk[1].at, 10.15, .08) && near(r.sk[1].len, 1.75, .12),
    'duas pausas viram cortes secos; o respiro curto (0,3 s) fica', r.sk);
  ok(JSON.stringify(r.aSk) === JSON.stringify(r.sk) && near(r.aEnd, r.end, .001), 'o som do vídeo pula junto (mesmos cortes, mesma barra)', { aSk:r.aSk, aEnd:r.aEnd });
  ok(near(r.end, r.cyc, .01) && near(r.dur, r.end, .02), 'a barra encurta e o arquivo, que era só o vídeo, acaba junto', r);
  ok(r.marks >= 2, 'cada corte seco é um risco na barra da timeline', r.marks);
  ok(r.btn.some(t => /^Refazer no modo/.test(t)) && r.btn.includes('Devolver os silêncios'), 'o painel mostra "Refazer no modo…" e "Devolver os silêncios"', r.btn);
  ok(/silêncios tirados/.test(r.toast), 'o aviso diz quanto saiu', r.toast);
  await p.screenshot({ path:path.join(outDir, 'silencios-1.png') });

  // ---------- o palco mostra o quadro certo depois de cada pulo ----------
  const a0 = r.vIn, j1 = r.sk[0], j2 = r.sk[1], p1 = j1.at - a0, p2 = p1 + (j2.at - (j1.at + j1.len));
  const want = u => Math.floor((u < p1 ? a0 + u : u < p2 ? j1.at + j1.len + u - p1 : j2.at + j2.len + u - p2) * FPS + 1e-6);
  const us = [1, p1 - .3, p1 + .3, p2 + .3, r.end - .2];
  const got = []; for (const u of us) got.push([await frameAt(u), want(u)]);
  ok(got.every(([a, w]) => Math.abs(a - w) <= 1), 'o palco mostra o quadro do original de antes e de depois de cada pulo', got);

  // ---------- o som da mistura: sem silêncio longo no meio ----------
  const gap = await p.evaluate(async () => {
    const buf = await buildMix(16000, S.duration, null, true), d = buf.getChannelData(0), hop = 160, F = Math.floor(d.length / hop);
    let run = 0, best = 0;
    for (let f = 20; f < F - 20; f++) { let s = 0; for (let i = f * hop; i < f * hop + hop; i++) s += d[i] * d[i]; if (Math.sqrt(s / hop) < .02) { run++; best = Math.max(best, run); } else run = 0; }
    return best / 100;
  });
  ok(gap < .5, `o som da mistura não tem mais pausas longas (maior silêncio: ${gap.toFixed(2)} s)`, gap);

  // ---------- bordas da barra com cortes secos (vidCutP) ----------
  const tr = await p.evaluate(() => {
    const V = S.layers.find(l => l.video), keep = JSON.stringify(V), out = {};
    let v = vidSnap(V, S.duration); V.end = +(V.end - 2).toFixed(3); vidTrim(V, v, 'r'); out.r = { vOut:V.vOut, sk:(V.vSkip || []).length };
    Object.assign(V, JSON.parse(keep)); delete V.vOut; Object.assign(V, JSON.parse(keep));
    v = vidSnap(V, S.duration); V.start = 3.5; vidTrim(V, v, 'l'); out.l = { vIn:V.vIn, sk:(V.vSkip || []).length };
    const K = JSON.parse(keep); for (const k of Object.keys(V)) if (!(k in K)) delete V[k]; Object.assign(V, K); changed();
    return out;
  });
  const wantR = r.sk[1].at + r.sk[1].len + (r.end - 2 - p2), wantL = r.sk[0].at + r.sk[0].len + (3.5 - p1);
  ok(near(tr.r.vOut, wantR, .02) && tr.r.sk === 2, 'borda direita: o fim do trecho cai no tempo certo depois dos pulos', { tr:tr.r, wantR });
  ok(near(tr.l.vIn, wantL, .02) && tr.l.sk === 1, 'borda esquerda: o começo pula o primeiro corte e ele sai da lista', { tr:tr.l, wantL });

  // ---------- modos Suave | Normal | Apertado: a linha do painel muda o que o próximo clique corta ----------
  await p.evaluate(() => { select(S.layers.find(l => l.video).id, true); renderProps(); });
  const modes = await p.locator('#props .field:has(> label:text-is("Quão apertado")) .segs button').allTextContents();
  ok(modes.join('|') === 'Suave|Normal|Apertado', 'o painel tem a linha "Quão apertado" com Suave | Normal | Apertado', modes);
  await p.locator('#props .field:has(> label:text-is("Quão apertado")) .segs button', { hasText:'Apertado' }).click();
  const tight = await p.evaluate(() => ({ ls:localStorage.getItem('mola-sil'), min:SIL.min, pressed:[...document.querySelectorAll('#props .field:has(> label) .segs button[aria-pressed="true"]')].map(b => b.textContent) }));
  ok(tight.ls === 'tight' && tight.min === .18 && tight.pressed.includes('Apertado'), 'escolher Apertado vale já (SIL, localStorage e botão marcado)', tight);
  ok((await p.locator('#props .sil-go').textContent()).includes('Apertado'), 'o botão diz qual modo vai usar (Apertado)');
  ok(await p.locator('#props .sil-card .field .segs').count() === 1 && await p.locator('#props .sil-card .sil-go').count() === 1, 'modo, botão e resultado ficam no mesmo cartão');
  await p.locator('#props button', { hasText:'Refazer no modo' }).click();
  await p.waitForTimeout(800);
  const tg = await p.evaluate(() => { const V = S.layers.find(l => l.video); return { n:(V.vSkip || []).length, cut:vidPlan(V).cut }; });
  ok(tg.n >= 3 && tg.cut > 3.1, 'Apertado corta também a pausa curta (0,3 s) que o Suave deixou', tg);
  await p.evaluate(() => { localStorage.setItem('mola-sil', 'normal'); Object.assign(SIL, SIL_MODES.normal); });

  // ---------- Devolver os silêncios ----------
  await p.evaluate(() => { select(S.layers.find(l => l.video).id, true); renderProps(); });
  await p.locator('#props button', { hasText:'Devolver os silêncios' }).click();
  const back = await p.evaluate(() => { const V = S.layers.find(l => l.video), A = S.layers.find(l => l.type === 'audio'); return { sk:V.vSkip, aSk:A.vSkip, marks:document.querySelectorAll('#tl .tl-vj').length }; });
  ok(!back.sk && !back.aSk && back.marks === 0, '"Devolver os silêncios" tira os cortes do vídeo e do som', back);
  // desfazer volta cada passo: Apertado (3 cortes) → Suave (2 cortes) → vídeo inteiro
  const ud = async () => { await p.evaluate(() => undo()); return p.evaluate(() => { const V = S.layers.find(l => l.video); return { n:(V.vSkip || []).length, vIn:V.vIn, dur:S.duration }; }); };
  const u1 = await ud(), u2 = await ud(), u3 = await ud();
  ok(u1.n === 3 && u2.n === 2 && u3.n === 0 && !u3.vIn && near(u3.dur, 20, .01), 'desfazer devolve cada passo (3 cortes, 2 cortes, depois o vídeo inteiro e a duração)', { u1, u2, u3 });

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
