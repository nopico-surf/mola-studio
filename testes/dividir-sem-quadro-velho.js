// Teste no navegador: dividir e duplicar um vídeo não mostram quadros de outro tempo (reclamação do usuário: "aparecem uns
// frames do que ficou para trás no da frente"). Três causas: (1) a camada nova tem um <video> novo, parado no 0, que o palco
// desenhava até o decodificador entregar o quadro (agora nasce com o quadro de outra camada do mesmo arquivo, vidSeed);
// (2) com a agulha no fim exato da 1ª metade a conta dava a volta e pedia o começo do trecho (vidLap); (3) tocando de novo,
// a 2ª metade entrava com o último quadro da passada anterior (o 1º quadro agora fica pronto antes, VID_PREROLL); (4) o mesmo
// na volta do Repetir, com a 1ª metade (vidAhead).
// O vídeo de teste vai do preto ao vermelho em 4 s: a cor diz o tempo. Rodar: node testes/dividir-sem-quadro-velho.js
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require("playwright"); } catch (e) { pw = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright"); }
const url = "file://" + path.resolve(__dirname, "..", "index.html");
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log("ok   " + msg); else { falhas++; console.log("FALHA " + msg, extra !== undefined ? JSON.stringify(extra) : ""); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.duration = 8; T = 0; changed({ layers:true, props:true }); renderTimeline(); });
  const rec = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d');
    const st = c.captureStream(30);
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8'].find(m => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(st, { mimeType:mime }), ch = [];
    r.ondataavailable = e => e.data.size && ch.push(e.data);
    const done = new Promise(res => r.onstop = res); r.start(100);
    const t0 = performance.now();
    await new Promise(res => { const f = () => { const t = performance.now() - t0; x.fillStyle = `rgb(${Math.min(255, t / 4000 * 255) | 0},0,0)`; x.fillRect(0, 0, 320, 240); if (t > 4000) return res(); requestAnimationFrame(f); }; f(); });
    r.stop(); await done;
    const blob = new Blob(ch, { type:mime.split(';')[0] }), u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64:btoa(s), type:blob.type };
  });
  const f = path.join(outDir, 'repro-div.' + (rec.type.includes('mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(f, Buffer.from(rec.b64, 'base64')); console.log(rec.type);
  const [chs] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Vídeo' }).click()]);
  await chs.setFiles(f);
  await p.waitForFunction(() => S.layers.some(l => l.video), null, { timeout:15000 }); await p.waitForTimeout(800);
  await p.evaluate(() => { const V = S.layers.find(l => l.video); V.start = 0; vidFitEnd(V); changed({ layers:true, props:true }); renderTimeline(); });
  // monitor: a cada quadro, a cor (R) do que o palco usa para cada camada de vídeo, comparada com a esperada
  await p.evaluate(() => {
    window.LOG = [];
    const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d', { willReadFrequently:true });
    const red = src => { try { x.drawImage(src, 0, 0, 4, 4); return x.getImageData(1, 1, 1, 1).data[0]; } catch (e) { return -1; } };
    const f = () => {
      for (const L of S.layers.filter(l => l.video)) {
        if (!phase(L, T)) continue;
        const src = videoEl(L); if (!src) { LOG.push({ T:+T.toFixed(3), id:L.id, vIn:L.vIn||0, exp:+vidTime(L, T).toFixed(3), red:-2, kind:"vazio" }); continue; }
        const v = VIDS.get(L.id);
        LOG.push({ T:+T.toFixed(3), id:L.id, vIn:L.vIn || 0, exp:+vidTime(L, T).toFixed(3), red:red(src), kind:src === v.el ? 'el' : 'grab', elT:+v.el.currentTime.toFixed(3) });
      }
      requestAnimationFrame(f);
    };
    f();
  });
  await p.evaluate(() => { const V = S.layers.find(l => l.video); select(V.id, true); pause(); T = 2; needs = true; renderProps(); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { LOG.length = 0; document.activeElement && document.activeElement.blur(); });
  await p.keyboard.press('s'); await p.waitForTimeout(1500);
  const l1 = await p.evaluate(() => LOG.splice(0));
  // a divisão não muda o tempo: em todas as camadas o quadro de T é o segundo T do vídeo (vermelho = T / 4 × 255). Folga de ~0,4 s
  // para o atraso normal de um quadro tocando; quadro vazio (-2) também é erro
  const bad = l => l.filter(e => e.red === -2 || (e.red >= 0 && Math.abs(e.red - Math.min(e.T, 4) / 4 * 255) > 25));
  ok(l1.length > 20 && !bad(l1).length, 'dividir parado: as duas metades mostram o quadro da agulha (a 1ª não volta ao começo do trecho no fim dela, a 2ª não mostra o começo do arquivo nem fica vazia)', bad(l1).slice(0, 4));
  // tocar de 1,5 até 3,5 e de novo: na 2ª vez a 2ª metade não pode mostrar o último quadro da passada anterior ao entrar
  await p.evaluate(() => { T = 1.5; needs = true; }); await p.waitForTimeout(600); await p.evaluate(() => LOG.length = 0);
  await p.keyboard.press(' '); await p.waitForTimeout(2000); await p.keyboard.press(' ');
  const l2a = await p.evaluate(() => LOG.splice(0));
  ok(l2a.some(e => e.vIn > 0) && !bad(l2a).length, 'tocando pela divisão: só o quadro certo nas duas metades', bad(l2a).slice(0, 4));
  await p.evaluate(() => { T = 1.5; needs = true; }); await p.waitForTimeout(600); await p.evaluate(() => LOG.length = 0);
  await p.keyboard.press(' '); await p.waitForTimeout(1500); await p.keyboard.press(' ');
  const l2 = await p.evaluate(() => LOG.splice(0));
  ok(l2.some(e => e.vIn > 0) && !bad(l2).length, 'tocando de novo pela divisão: a 2ª metade não mostra o quadro da passada anterior', bad(l2).slice(0, 4));
  // Repetir: o arquivo acaba no fim do vídeo e a reprodução volta ao 0; a 1ª metade não pode entrar com o último quadro dela
  const D0 = await p.evaluate(() => { const D = S.duration, e = Math.max(...S.layers.filter(l => l.video).map(l => l.end ?? S.duration)); S.duration = +e.toFixed(3); S.loop = true; T = S.duration - 1.2; needs = true; return D; });
  await p.waitForTimeout(600); await p.evaluate(() => LOG.length = 0);
  await p.keyboard.press(' '); await p.waitForTimeout(2200); await p.keyboard.press(' ');
  const l2b = await p.evaluate(() => LOG.splice(0)), wrap = l2b.filter(e => e.T < 1);
  // depois da volta: o vídeo de teste não é linear no 1º segundo (a gravação engasga), então ali só se exige nada do fim da
  // 1ª metade (≈ 2 s, vermelho ≈ 127); depois de 1 s, a regra de sempre
  const badW = l => l.filter(e => e.T < 1 ? e.red === -2 || e.red > 100 : bad([e]).length);
  ok(wrap.length > 10 && !badW(l2b).length, 'Repetir: depois da volta ao 0 a 1ª metade mostra o começo dela, não o último quadro da passada anterior', badW(l2b).slice(0, 4));
  await p.evaluate(D => { S.duration = D; }, D0);
  await p.evaluate(() => { const V = S.layers.filter(l => l.video)[1]; select(V.id, true); pause(); T = 3; needs = true; renderProps(); });
  await p.waitForTimeout(800); await p.evaluate(() => { LOG.length = 0; document.activeElement && document.activeElement.blur(); });
  await p.keyboard.press("Control+d"); await p.waitForTimeout(1200);
  const l3 = await p.evaluate(() => LOG.splice(0));
  const ids = await p.evaluate(() => S.layers.filter(l => l.video).map(l => l.id));
  const nw = ids.filter(i => !l1.concat(l2a, l2).some(e => e.id === i));
  ok(nw.length === 1, 'Ctrl+D duplica o vídeo', ids);
  const mine = l3.filter(e => nw.includes(e.id)), wr = mine.filter(e => e.red === -2 || (e.red >= 0 && Math.abs(e.red - e.exp / 4 * 255) > 14));
  ok(mine.length > 20 && !wr.length, 'a cópia mostra o quadro certo desde o 1º quadro (sem o começo do arquivo, sem vazio)', wr.slice(0, 4));
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo'); process.exit(falhas ? 1 : 0);
})();
