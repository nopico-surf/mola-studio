// Teste: roteiro de cortes por palavras-chave (js/roteiro.js) na janela Importar trecho.
// 1) Sem navegador: rotPlan com palavras fabricadas (variações das palavras-chave, frases, mínimo/máximo, sem sobreposição,
//    nunca corta dentro de uma palavra, prefere começo de frase).
// 2) No navegador (sem a IA): o som é lido direto do MP4 (AAC → 16 kHz mono) com o tempo certo, também começando no meio;
//    a fala vem de um falso transcritor (window.ROT_DEV) em pedaços cortados no silêncio, fica guardada no IndexedDB e
//    não é ouvida de novo; caminho real: palavras-chave → "Montar o roteiro" → lista → desmarcar/editar → "Usar" → trechos.
// Rodar: node testes/roteiro-de-cortes.js (prints em mola-testes/roteiro-*.png na pasta temporária)
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm');
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };

// ---------- 1. roteiro puro ----------
const ctx = { console, Math, String, Set, Int16Array, Uint8Array, Float32Array, isFinite, window:{} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'js', 'roteiro.js'), 'utf8') + ';this.R={rotPlan,rotKeys,rotTok,rotNorm,rotStem,rotSentences,ROT};', ctx);
const { rotPlan, rotKeys, rotTok, rotNorm } = ctx.R;
const m = (k, w) => rotTok(rotKeys(k)[0].toks[0], rotNorm(w));
ok(['venda', 'vendas', 'Vender', 'vendedor', 'vendedores', 'vendemos', 'vendeu', 'VENDENDO', 'vendido'].every(w => m('venda', w)), 'variações contam: venda/vendas/vender/vendedor/vendemos…');
ok(!['vendaval', 'vento', 'ver'].some(w => m('venda', w)), 'palavra parecida não conta (vendaval, vento, ver)');
ok(m('preço', 'precos') && m('Preço', 'PREÇO') && !m('preço', 'precisa'), 'sem acento e sem maiúscula; preço não pega "precisa"');
ok(m('casa', 'casas') && !m('casa', 'casamento'), 'radical curto (< 4 letras): só a palavra e o plural');
ok(m('promoção', 'promoções') && m('cliente', 'clientes'), 'plural em -ões e -es');
ok(rotKeys('venda, Venda;  tráfego pago ,').length === 2 && rotKeys('tráfego pago')[0].toks.length === 2, 'palavras-chave separadas por vírgula, sem repetir; frase de duas palavras');

// fala fabricada: frases de palavras de 0,3 s com 0,08 s entre elas e 0,9 s entre frases; algumas palavras-chave
const mkTalk = (sents, t0 = 1) => {
  const ws = []; let t = t0;
  sents.forEach(s => { s.split(' ').forEach((w, i, a) => { ws.push({ w, s:+t.toFixed(3), e:+(t + .3).toFixed(3), c:.9, ...(i === 0 ? { seg:1 } : {}) }); t += i < a.length - 1 ? .38 : 1.2; }); });
  return ws;
};
const filler = n => Array.from({ length:n }, (_, i) => `hoje eu queria falar com vocês sobre um assunto importante número ${i}.`);
const talk = mkTalk([
  ...filler(6),
  'a venda começa no primeiro contato com o cliente.', 'quem vende bem escuta antes de falar.', 'o cliente percebe quando você só quer vender.', 'por isso a venda boa é conversa.',
  ...filler(10),
  'e o preço não é o problema.', 'o cliente paga o preço quando entende o valor.', 'mostre o valor antes de falar de preço.',
  ...filler(10),
  'vendas', ...filler(12),
]);
const plan = rotPlan(talk, { keys:'venda, cliente, preço', min:6, max:14, n:3, dur:1e4 });
console.log('   roteiro:', JSON.stringify(plan.map(p => ({ a:p.a, b:p.b, keys:p.keys, sc:p.score, txt:talk.slice(p.i0, p.i1 + 1).map(w => w.w).join(' ').slice(0, 60) }))));
ok(plan.length === 3, 'três cortes pedidos, três propostos', plan.length);
ok(plan.every(p => p.b - p.a >= 6 - 1e-6 && p.b - p.a <= 14 + 1e-6), 'cada corte entre o mínimo e o máximo', plan.map(p => p.b - p.a));
ok(plan.every((p, i) => !i || p.a >= plan[i - 1].b), 'em ordem de tempo e sem sobreposição', plan.map(p => [p.a, p.b]));
ok(plan.every(p => talk.every(w => !(w.s < p.a - 1e-6 && w.e > p.a + 1e-6) && !(w.s < p.b - 1e-6 && w.e > p.b + 1e-6))), 'nenhum corte começa ou termina dentro de uma palavra');
ok(plan.every(p => Math.abs(p.a - (talk[p.i0].s - .15)) < 1e-3 && Math.abs(p.b - (talk[p.i1].e + .25)) < 1e-3), 'começa 0,15 s antes da 1ª palavra e termina 0,25 s depois da última');
ok(plan.every(p => p.i0 === 0 || /[.!?]$/.test(talk[p.i0 - 1].w)), 'cada corte começa no começo de uma frase', plan.map(p => talk[p.i0].w));
const best = plan.find(p => p.keys.length >= 2);
ok(best && talk.slice(best.i0, best.i1 + 1).some(w => /^vend/.test(w.w)) && best.keys.includes('cliente'), 'o trecho com venda + cliente juntos está no roteiro', plan.map(p => p.keys));
ok(plan.some(p => p.keys.includes('preço')), 'o trecho do preço está no roteiro');
// janela com "e…" no começo perde para a frase seguinte
const ws2 = mkTalk(['e o cliente gostou muito.', 'o cliente voltou no outro dia.', ...filler(3)]);
const p2 = rotPlan(ws2, { keys:'cliente', min:1.5, max:3.5, n:1 });
ok(p2.length === 1 && ws2[p2[0].i0].w === 'o', 'não começa com "e…" (meio de uma ideia) se há opção melhor', p2.map(p => ws2[p.i0].w));
// palavras perto demais: o corte fica no meio do vão, sem entrar na palavra vizinha
const ws3 = [{ w:'antes.', s:0, e:.5 }, { w:'Cliente', s:.55, e:1, seg:1 }, { w:'feliz.', s:1.05, e:1.6 }, { w:'depois', s:1.65, e:2 }];
const p3 = rotPlan(ws3, { keys:'cliente', min:.5, max:2, n:1 });
ok(p3.length === 1 && p3[0].a >= .5 && p3[0].a <= .55 && p3[0].b >= 1.6 && p3[0].b <= 1.65, 'vão curto: corta no meio do vão, nunca dentro da vizinha', p3);
ok(rotPlan(talk, { keys:'', min:6, max:14, n:3 }).length === 0 && rotPlan(talk, { keys:'xyzw', min:6, max:14, n:3 }).length === 0, 'sem palavra-chave ou sem achar: nenhum corte');
const pAll = rotPlan(talk, { keys:'venda, cliente, preço, assunto', min:6, max:14, n:50 });
ok(pAll.length > 5 && pAll.every((p, i) => !i || p.a >= pAll[i - 1].b), 'pedindo muitos: todos os que cabem, sem sobreposição', pAll.length);
// 1 h de fala: rápido
const big = mkTalk(Array.from({ length:900 }, (_, i) => (i % 37 === 0 ? 'a venda para o cliente ' : 'hoje eu falo de um assunto ') + `que é o número ${i} da lista.`));
const t0 = Date.now(), pb = rotPlan(big, { keys:'venda, cliente', min:20, max:45, n:5 }), ms = Date.now() - t0;
ok(pb.length === 5 && ms < 1500, `1 h de fala (${big.length} palavras, ${Math.round(big[big.length - 1].e / 60)} min): roteiro em ${ms} ms`, { n:pb.length, ms });

// ---------- 2. navegador ----------
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); } catch (e2) { pw = null; } }
if (!pw) { console.log('(sem Playwright: parte do navegador não rodou)'); process.exit(falhas ? 1 : 0); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
const DUR = 200, FPS = 5, TONES = [[8, 11], [95.5, 98.5], [167.5, 170.5]]; // segundos com tom de 440 Hz (cobrem as frases com palavra-chave do falso transcritor); o resto é silêncio
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; T = 0; changed({ layers:true, props:true }); renderTimeline(); });
  // vídeo de 200 s (abre a janela de trechos): imagem cinza, som = silêncio com tons de 440 Hz em TONES
  const g = await p.evaluate(async ({ DUR, FPS, TONES }) => {
    const w = 64, hh = 36, c = new OffscreenCanvas(w, hh), x = c.getContext('2d'), sr = 48000;
    const aCfg = { codec:'mp4a.40.2', sampleRate:sr, numberOfChannels:2, bitrate:96000 };
    if (!window.AudioEncoder || !(await AudioEncoder.isConfigSupported(aCfg)).supported) return { noA:true };
    const mux = new Mp4Muxer.Muxer({ target:new Mp4Muxer.ArrayBufferTarget(), video:{ codec:'avc', width:w, height:hh }, audio:{ codec:'aac', sampleRate:sr, numberOfChannels:2 }, fastStart:false, firstTimestampBehavior:'strict' });
    const enc = new VideoEncoder({ output:(ch, m) => mux.addVideoChunk(ch, m), error:e => { throw e; } });
    enc.configure({ codec:'avc1.42001f', width:w, height:hh, bitrate:50000, framerate:FPS });
    const ae = new AudioEncoder({ output:(ch, m) => mux.addAudioChunk(ch, m), error:e => { throw e; } }); ae.configure(aCfg);
    const on = t => TONES.some(([a, b]) => t >= a && t < b), CH = 4800; let ap = 0;
    for (let n = 0; n < DUR * FPS; n++) {
      x.fillStyle = `rgb(${n % 255},90,90)`; x.fillRect(0, 0, w, hh);
      const vf = new VideoFrame(c, { timestamp:Math.round(n * 1e6 / FPS), duration:Math.round(1e6 / FPS) }); enc.encode(vf, { keyFrame:n % (FPS * 2) === 0 }); vf.close();
      while (ap < (n + 1) / FPS * sr) {
        const d = new Float32Array(CH * 2); for (let i = 0; i < CH; i++) { const t = (ap + i) / sr; d[i] = d[i + CH] = on(t) ? .4 * Math.sin(2 * Math.PI * 440 * t) : 0; }
        const ad = new AudioData({ format:'f32-planar', sampleRate:sr, numberOfFrames:CH, numberOfChannels:2, timestamp:Math.round(ap / sr * 1e6), data:d }); ae.encode(ad); ad.close(); ap += CH;
      }
      if (n % 100 === 0) { await enc.flush(); await ae.flush(); }
    }
    await enc.flush(); await ae.flush(); mux.finalize();
    const u8 = new Uint8Array(mux.target.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s) };
  }, { DUR, FPS, TONES });
  if (g.noA) { console.log('(este Chrome não grava AAC: parte do som não rodou)'); await b.close(); process.exit(falhas ? 1 : 0); }
  const fv = path.join(outDir, 'roteiro-video.mp4'); fs.writeFileSync(fv, Buffer.from(g.b64, 'base64'));

  // ---------- 2a. som direto do arquivo ----------
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch.setFiles(fv);
  await p.waitForSelector('.tr-win', { timeout:15000 });
  await p.waitForFunction(() => TRECHOWIN && TRECHOWIN.ix, null, { timeout:15000 });
  const au = await p.evaluate(async ({ TONES }) => {
    const st = TRECHOWIN, f = st.ui.file, out = {};
    // onde o som acende/apaga (janelas de 5 ms) e a frequência (cruzamentos por zero) no meio de cada tom
    const scan = (a, off) => {
      const hop = 80, ev = []; let on = false;
      for (let i = 0; i + hop <= a.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += a[j] * a[j]; const lv = Math.sqrt(s / hop) > .05; if (lv !== on) { ev.push(+(off + i / 16000).toFixed(3)); on = lv; } }
      return ev;
    };
    const hz = (a, t) => { const i0 = Math.round(t * 16000), n = 8000; let z = 0; for (let i = i0 + 1; i < i0 + n; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) z++; return z / 2 / (n / 16000); };
    const t0 = performance.now(), rd = await rotAudio(f, st.ix, 0); const a = await rd.read(16000 * 230); rd.close();
    out.ms = Math.round(performance.now() - t0); out.len = a.length / 16000; out.ev = scan(a, 0); out.hz = hz(a, 10.25);
    let pk = 0; for (let i = 10.2 * 16000; i < 10.8 * 16000; i++) pk = Math.max(pk, Math.abs(a[i])); out.pk = pk;
    // começando no meio (como ao continuar depois de parar): 90 s
    const rd2 = await rotAudio(f, st.ix, 90); const a2 = await rd2.read(16000 * 20); rd2.close(); out.ev2 = scan(a2, 90);
    // lendo aos poucos (pedaços de tamanhos diferentes) = o mesmo que de uma vez
    const rd3 = await rotAudio(f, st.ix, 0), parts = []; let tot = 0; for (const n of [12345, 160000, 999, 1600000, 2000000]) { const x = await rd3.read(n); parts.push(x); tot += x.length; } rd3.close();
    const a3 = new Float32Array(tot); let o = 0; for (const x of parts) { a3.set(x, o); o += x.length; }
    let md = 0; for (let i = 0; i < a3.length; i++) md = Math.max(md, Math.abs(a3[i] - a[i])); out.md = md;
    return out;
  }, { TONES });
  console.log('   som:', JSON.stringify(au));
  const want = TONES.flat();
  ok(Math.abs(au.len - DUR) < .2, `o som lido tem a duração do vídeo (${au.len.toFixed(2)} s), em ${au.ms} ms`, au.len);
  // o codificador AAC do Chrome atrasa o som alguns ms (sem edit list no arquivo de teste): vale o mesmo atraso do começo ao fim
const d0 = au.ev[0] - want[0];
ok(au.ev.length === want.length && Math.abs(d0) < .03 && au.ev.every((t, i) => Math.abs(t - want[i] - d0) < .006), 'cada tom acende e apaga no segundo certo, sem ir atrasando ao longo do vídeo (±6 ms)', { ev:au.ev, want });
  ok(Math.abs(au.hz - 440) < 4 && au.pk > .3 && au.pk < .5, `mono 16 kHz: 440 Hz continua 440 Hz (${au.hz.toFixed(1)}), volume mantido (${au.pk.toFixed(2)})`);
  ok(au.ev2.length === 2 && Math.abs(au.ev2[0] - 95.5) < .03 && Math.abs(au.ev2[1] - 98.5) < .03, 'começando em 90 s: o tom de 95,5 s cai no lugar certo', au.ev2);
  ok(au.md < 1e-6, 'lido aos poucos = lido de uma vez', au.md);

  // ---------- 2b. caminho real: palavras-chave → Montar o roteiro (falso transcritor) → lista → Usar ----------
  const calls = await p.evaluate(() => {
    ROT.piece = 60; ROT.slack = 15; window.__rot = [];
    // cada tom = uma frase com a palavra-chave; o resto, frases sem ela. Tempos relativos ao pedaço (como a IA devolve)
    window.ROT_DEV = { run:async (a, off) => {
      window.__rot.push({ off:+off.toFixed(3), len:+(a.length / 16000).toFixed(3) });
      const ws = [], end = off + a.length / 16000;
      for (let t = 0; t < 200; t += 4) {
        if (t < off || t >= end - 3) continue;
        const kw = t === 8 ? ['a', 'venda', 'para', 'o', 'cliente', 'começa', 'aqui.'] : t === 96 ? ['o', 'preço', 'certo', 'vende', 'mais.'] : t === 168 ? ['vendas', 'sobem', 'muito', 'no', 'fim', 'do', 'ano.'] : ['hoje', 'eu', 'falo', 'de', 'outra', 'coisa.'];
        kw.forEach((w, i) => ws.push({ w, s:t - off + i * .4, e:t - off + i * .4 + .3, c:.9, ...(i ? {} : { seg:1 }) }));
      }
      return ws;
    } };
    return document.querySelectorAll('.tr-win .rot').length;
  });
  ok(calls === 1, 'a janela de trechos tem a seção Roteiro');
  const n0 = await p.evaluate(() => document.querySelector('.rot-note').textContent);
  ok(/~\d+ min/.test(n0) && /placa de vídeo/.test(n0) && /à mão/.test(n0), 'avisa o tempo, a placa de vídeo e a alternativa de marcar à mão', n0);
  await p.locator('.rot-keys').fill('venda, preço');
  const nums = p.locator('.rot input.rot-num');
  await nums.nth(0).fill('2'); await nums.nth(0).press('Enter');
  await nums.nth(1).fill('6'); await nums.nth(1).press('Enter');
  await nums.nth(2).fill('3'); await nums.nth(2).press('Enter');
  await p.locator('.rot-go', { hasText:'Montar o roteiro' }).click();
  await p.waitForFunction(() => TRECHOWIN.rot && TRECHOWIN.rot.done && !TRECHOWIN.rot.busy, null, { timeout:60000 });
  const r1 = await p.evaluate(() => ({ calls:window.__rot, plan:TRECHOWIN.rot.plan.map(x => ({ a:x.a, b:x.b, keys:x.keys })), items:document.querySelectorAll('.rot-item').length,
    marks:[...document.querySelectorAll('.rot-item mark')].map(m => m.textContent), use:document.querySelector('.rot-use button').textContent, note:document.querySelector('.rot-note').textContent }));
  console.log('   pedaços:', JSON.stringify(r1.calls), 'roteiro:', JSON.stringify(r1.plan));
  ok(r1.calls.length >= 3 && r1.calls.every((c, i) => !i || Math.abs(c.off - (r1.calls[i - 1].off + r1.calls[i - 1].len)) < 1e-3) && Math.abs(r1.calls.at(-1).off + r1.calls.at(-1).len - DUR) < .2,
    'a fala é ouvida em pedaços seguidos que cobrem o vídeo todo', r1.calls);
  ok(r1.calls.slice(0, -1).every(c => { const e = c.off + c.len; return !TONES.some(([a, b]) => e > a - .05 && e < b + .05); }), 'cada pedaço termina no silêncio, nunca no meio do som', r1.calls);
  ok(r1.items === 3 && r1.plan.map(x => x.keys[0]).join('|') === 'venda|preço|venda', 'três cortes, em ordem de tempo, cada um com a palavra-chave dele', r1.plan);
  ok(Math.abs(r1.plan[0].a - (8 - .15)) < 1e-3 && Math.abs(r1.plan[1].a - (96 - .15)) < 1e-3 && Math.abs(r1.plan[2].a - (168 - .15)) < 1e-3, 'os tempos voltam do pedaço para o vídeo inteiro (8 s, 96 s, 168 s)', r1.plan.map(x => x.a));
  ok(r1.marks.includes('venda') && r1.marks.includes('preço') && r1.marks.includes('vende') && r1.marks.includes('vendas'), 'as palavras-chave (e variações) aparecem marcadas na frase', r1.marks);
  ok(r1.use === 'Usar os 3 marcados' && /já foi ouvida/.test(r1.note), 'botão "Usar os 3 marcados"; o aviso diz que a fala já foi ouvida', r1);
  await p.screenshot({ path:path.join(outDir, 'roteiro-1-lista.png') });
  // desmarca o 2º, muda o fim do 3º pelo campo, toca o 1º clicando na frase
  await p.locator('.rot-item').nth(1).locator('input[type=checkbox]').click();
  const f3 = p.locator('.rot-item').nth(2).locator('input.tr-t').nth(1);
  await f3.fill('2:52'); await f3.press('Enter');
  await p.locator('.rot-item').nth(0).locator('.rot-play').click(); await p.waitForTimeout(400);
  const pl = await p.evaluate(() => { const v = document.querySelector('.tr-vid'); const r = { t:v.currentTime, paused:v.paused }; v.pause(); return r; });
  ok(!pl.paused && pl.t >= 7.8 && pl.t < 9.5, 'clicar na frase toca o corte no vídeo', pl);
  await p.locator('.rot-use button').click(); await p.waitForTimeout(200);
  const r2 = await p.evaluate(() => ({ segs:TRECHOWIN.segs.map(s => [s.a, s.b]), items:document.querySelectorAll('.tr-item').length, bar:document.querySelectorAll('.tr-seg').length, ok:document.querySelector('.tr-win .files-head .btn.primary').textContent }));
  ok(r2.segs.length === 2 && Math.abs(r2.segs[0][0] - 7.85) < 1e-3 && Math.abs(r2.segs[1][0] - 167.85) < 1e-3 && Math.abs(r2.segs[1][1] - 172) < 1e-3, '"Usar" vira os trechos: só os marcados, com o fim editado', r2);
  ok(r2.items === 2 && r2.bar === 2 && /2 trechos|2 arquivos/.test(r2.ok), 'a lista de trechos, a barra e o botão de importar mostram os dois', r2);
  await p.screenshot({ path:path.join(outDir, 'roteiro-2-usar.png') });
  // mudar as palavras não ouve de novo
  await p.locator('.rot-keys').fill('preço'); await p.locator('.rot-keys').press('Enter'); await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => ({ calls:window.__rot.length, plan:TRECHOWIN.rot.plan.map(x => x.keys.join()) }));
  ok(r3.calls === r1.calls.length && r3.plan.length === 1 && r3.plan[0].includes('preço'), 'trocar as palavras refaz o roteiro na hora, sem ouvir de novo', r3);
  // fechar e abrir de novo: a fala guardada aparece sem ouvir
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch2.setFiles(fv); await p.waitForSelector('.tr-win .rot'); await p.waitForFunction(() => TRECHOWIN && TRECHOWIN.rot && TRECHOWIN.rot.words, null, { timeout:10000 });
  const r4 = await p.evaluate(() => ({ calls:window.__rot.length, items:document.querySelectorAll('.rot-item').length, keys:document.querySelector('.rot-keys').value, go:document.querySelector('.rot-go').textContent }));
  ok(r4.calls === r1.calls.length && r4.items === 1 && r4.keys === 'preço' && r4.go === 'Montar de novo', 'abrindo de novo: palavras lembradas e roteiro pronto com a fala guardada', r4);
  // parar no meio guarda o que foi ouvido e continua de onde parou
  await p.evaluate(async () => { await DB.del(rotKey(TRECHOWIN.ui.file)); window.__rot = []; const r = window.ROT_DEV.run; window.ROT_DEV.run = async (a, off) => { const x = await r(a, off); if (window.__rot.length === 1) document.querySelector('.rot-prog button').click(); return x; }; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const [ch3] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await ch3.setFiles(fv); await p.waitForSelector('.tr-win .rot'); await p.waitForTimeout(300);
  await p.locator('.rot-go').click();
  await p.waitForFunction(() => !TRECHOWIN.rot.busy && TRECHOWIN.rot.upto > 0, null, { timeout:30000 });
  const r5 = await p.evaluate(() => ({ calls:window.__rot.length, upto:TRECHOWIN.rot.upto, done:TRECHOWIN.rot.done, note:document.querySelector('.rot-note').textContent, foot:document.querySelector('.rot-foot').textContent }));
  ok(r5.calls === 1 && !r5.done && r5.upto > 40 && r5.upto < 90 && /Continua de onde parou/.test(r5.note), '"Parar" guarda o que já foi ouvido e avisa que continua de onde parou', r5);
  await p.locator('.rot-go').click();
  await p.waitForFunction(() => !TRECHOWIN.rot.busy && TRECHOWIN.rot.done, null, { timeout:30000 });
  const r6 = await p.evaluate(() => ({ calls:window.__rot, words:TRECHOWIN.rot.words.length }));
  ok(Math.abs(r6.calls[1].off - r5.upto) < 1e-3, 'continuar começa onde parou (não ouve o começo de novo)', r6.calls);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const fin = await p.evaluate(() => ({ win:!!document.querySelector('.tr-win'), v:S.layers.filter(l => l.video).length }));
  ok(!fin.win && fin.v === 0, 'Esc fecha sem importar nada', fin);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
