// Teste no navegador: "Aprimorar a voz" (pedido do usuário: um botão com duas coisas que ligam separadas, melhorar a voz como um
// todo e tirar ruído). Um WAV com ruído constante e um tom no meio (a "fala") entra como som solto; no painel, o cartão "Aprimorar a
// voz" tem "Melhorar a voz" e "Tirar ruído" (com Força), cada um liga sozinho. Tirar ruído abaixa o fundo sem comer o tom; melhorar
// a voz sobe uma fala baixa sem estourar; a mistura (a mesma da prévia e do MP4) muda; Ctrl+Z desliga.
// Rodar: node testes/aprimorar-voz.js (prints na pasta temporária, mola-testes/voz-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
// 6 s: ruído branco constante (amplitude nz) o tempo todo e um tom de 440 Hz (amplitude amp) de 2 a 4 s
function wav(nz, amp, sr = 48000) {
  const n = 6 * sr, b = Buffer.alloc(44 + n * 2); let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 * 2 - 1; };
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr, v = rnd() * nz + (t >= 2 && t < 4 ? Math.sin(2 * Math.PI * 440 * t) * amp : 0); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2); }
  return b;
}
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 6; T = 0; RT.userSeek = true; changed({ layers:true, props:true }); renderTimeline(); });
  const fWav = path.join(outDir, 'voz-ruido.wav'); fs.writeFileSync(fWav, wav(.05, .25));
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#adds button.add', { hasText:'Som' }).click()]);
  await ch.setFiles(fWav);
  await p.waitForFunction(() => S.layers.some(l => l.type === 'audio'), null, { timeout:15000 }); await p.waitForTimeout(400);

  const rms = (t0, t1) => p.evaluate(async ([t0, t1]) => {
    const m = await buildMix(48000, S.duration), d = m.getChannelData(0); let s = 0, n = 0;
    for (let i = Math.floor(t0 * 48000); i < Math.min(d.length, t1 * 48000); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / Math.max(1, n));
  }, [t0, t1]);
  const card = p.locator('#props .voice-card');
  const r0 = await p.evaluate(() => { const c = document.querySelector('#props .voice-card'); return { card:!!c, txt:c && c.textContent }; });
  ok(r0.card && r0.txt.includes('Melhorar a voz') && r0.txt.includes('Tirar ruído') && !r0.txt.includes('Força'), 'painel do som: cartão com as duas opções, Força só com o ruído ligado', r0);
  const noise0 = await rms(.5, 1.5), tone0 = await rms(2.5, 3.5);

  // 1) Tirar ruído sozinho
  await card.locator('label.check', { hasText:'Tirar ruído' }).click();
  await p.waitForFunction(() => S.layers.find(l => l.type === 'audio').vDen === 2, null, { timeout:5000 });
  await p.waitForTimeout(300);
  const r1 = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { vDen:A.vDen, vEnh:A.vEnh, forca:document.querySelector('#props .voice-card').textContent.includes('Força') }; });
  ok(r1.vDen === 2 && !r1.vEnh && r1.forca, 'Tirar ruído liga sozinho (Médio) e mostra a Força', r1);
  const t0 = Date.now(), noise1 = await rms(.5, 1.5), ms = Date.now() - t0, tone1 = await rms(2.5, 3.5);
  const dB = 20 * Math.log10(noise1 / noise0);
  ok(dB < -10, 'o ruído do fundo cai mais de 10 dB', { noise0, noise1, dB:+dB.toFixed(1) });
  ok(tone1 > tone0 * .85, 'o tom (a fala) continua', { tone0, tone1 });
  console.log('     limpar 6 s de som + mistura:', ms, 'ms');
  await p.screenshot({ path:path.join(outDir, 'voz-1-ruido.png') });
  await p.locator('#props .voice-card button', { hasText:'Forte' }).click(); await p.waitForTimeout(200);
  const noise3 = await rms(.5, 1.5);
  ok(await p.evaluate(() => S.layers.find(l => l.type === 'audio').vDen) === 3 && noise3 < noise1, 'Forte tira mais que Médio', { noise1, noise3 });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => S.layers.find(l => l.type === 'audio').vDen === undefined) && Math.abs((await rms(.5, 1.5)) - noise0) < 1e-4, 'Ctrl+Z desliga e o som volta ao original');

  // 2) Melhorar a voz sozinho: fala baixa sobe, sem estourar
  await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); A.vol = .15; changed(); renderProps(); });
  await p.waitForTimeout(200);
  const quiet = await rms(2.5, 3.5);
  await p.locator('#props .voice-card label.check', { hasText:'Melhorar a voz' }).click(); await p.waitForTimeout(300);
  const r2 = await p.evaluate(async () => {
    const A = S.layers.find(l => l.type === 'audio'), m = await buildMix(48000, S.duration), d = m.getChannelData(0); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
    return { vEnh:A.vEnh, vDen:A.vDen, pk };
  });
  const loud = await rms(2.5, 3.5);
  ok(r2.vEnh === 2 && r2.vDen === undefined, 'Melhorar a voz liga sozinho (Médio) sem ligar o ruído', r2);
  ok(loud > quiet * 1.5 && r2.pk < 1, 'fala baixa fica mais alta e não estoura', { quiet, loud, pk:r2.pk });
  // força do Melhorar a voz: uma linha só dele, logo abaixo; Leve, Médio e Forte dão sons diferentes, nenhum estoura
  const enhRow = p.locator('#props .voice-card .field', { hasText:'Força' });
  ok(await enhRow.count() === 1, 'só o Melhorar a voz ligado: uma linha de Força', await enhRow.count());
  const lvl = {};
  for (const [nm, v] of [['Leve', 1], ['Forte', 3], ['Médio', 2]]) {
    await enhRow.first().locator('button', { hasText:nm }).click(); await p.waitForTimeout(150);
    lvl[nm] = await p.evaluate(async () => { const A = S.layers.find(l => l.type === 'audio'), m = await buildMix(48000, S.duration), d = m.getChannelData(0);
      let s = 0, pk = 0; for (let i = 0; i < d.length; i++) { pk = Math.max(pk, Math.abs(d[i])); if (i > 2.5 * 48000 && i < 3.5 * 48000) s += d[i] * d[i]; } return { v:A.vEnh, rms:Math.sqrt(s / 48000), pk }; });
    ok(lvl[nm].v === v, `Força ${nm} grava ${v}`, lvl[nm]);
  }
  ok(lvl.Leve.rms !== lvl.Médio.rms && lvl.Médio.rms !== lvl.Forte.rms && Object.values(lvl).every(o => o.pk < 1), 'os três níveis soam diferentes e nenhum estoura', lvl);
  await p.screenshot({ path:path.join(outDir, 'voz-2-melhorar.png') });

  // 3) as duas juntas, e o sinal da prévia muda (refaz a mistura)
  const sig0 = await p.evaluate(() => audioSig());
  await p.locator('#props .voice-card label.check', { hasText:'Tirar ruído' }).click(); await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { vEnh:A.vEnh, vDen:A.vDen, sig:audioSig() }; });
  ok(r3.vEnh === 2 && r3.vDen === 2 && r3.sig !== sig0, 'as duas ligadas juntas e a prévia refaz o som', r3);
  // duas linhas de Força, cada uma mexe só na sua
  const rows = p.locator('#props .voice-card .field', { hasText:'Força' });
  ok(await rows.count() === 2, 'as duas ligadas: uma Força para cada', await rows.count());
  await rows.nth(1).locator('button', { hasText:'Leve' }).click(); await p.waitForTimeout(150);
  const r3b = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return { vEnh:A.vEnh, vDen:A.vDen }; });
  ok(r3b.vEnh === 2 && r3b.vDen === 1, 'a Força do ruído não mexe na da voz', r3b);
  await p.screenshot({ path:path.join(outDir, 'voz-3-as-duas.png') });

  // 4) o vídeo com som mostra o mesmo cartão (painel do vídeo)
  const r4 = await p.evaluate(() => { const A = S.layers.find(l => l.type === 'audio'); return soundFields([A]).some(n => n.classList && n.classList.contains('voice-card')); });
  ok(r4, 'soundFields (som, vídeo e vários vídeos) traz o cartão');
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
