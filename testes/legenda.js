// Teste no navegador: camada de legenda (js/legenda.js), sem a IA (2,2 GB: baixar no teste não dá).
// As palavras com tempo entram como a IA entrega ({ w, s, e, c }) por capCreate. Confere:
// - blocos (fim de frase, limite de palavras, palavra sozinha no fim de frase vai junto com a anterior);
// - desenho: o bloco certo em cada tempo, a palavra falada na cor do destaque (pixel), nada fora das falas;
// - estilo trocado pelo clique no chip do painel; "Uma palavra" mostra uma palavra só;
// - correção digitada no painel: mesmo número de palavras mantém o tempo; outro número divide o tempo do trecho;
// - palavra duvidosa marcada (mark) e o filtro "só os trechos para conferir";
// - .srt; Ctrl+Z; "Só a primeira letra em caixa alta" (L.cap) continua funcionando no texto comum;
// - "Legenda" sem som no arquivo só avisa.
// Rodar: node testes/legenda.js (prints em mola-testes/legenda-*.png)
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
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; setDuration(12); T = 0; changed({ layers:true, props:true }); renderTimeline(); });

  // sem som no arquivo: o botão só avisa
  await p.click('button[title="Adicionar legenda"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !S.layers.some(l => l.capt) && /vídeo com som/.test(document.querySelector('.toast, #toast')?.textContent || document.body.textContent)), 'sem som: avisa e não cria nada');

  // palavras como a IA entrega (s/e em segundos da timeline, c = confiança)
  await p.evaluate(() => {
    const txt = 'Oi, gente! Hoje eu vou mostrar como o Mola deixa seus anúncios prontos. Clica no link e testa grátis por sete dias.';
    let t = .5; const words = txt.split(' ').map((w, i) => { const d = .18 + w.length * .045, o = { w, s:+t.toFixed(3), e:+(t + d).toFixed(3), c:w === 'Mola' ? .2 : .95 }; t += d + (/[.!?]$/.test(w) ? .7 : .06); return o; });
    window.W0 = words; capCreate(words);
  });
  const st = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { n:S.layers.filter(l => l.capt).length, sel:RT.selected === L.id, blocks:capBlocks(L).map(b => b.text.replace('\n', ' / ')), text:L.text, tab:propTab }; });
  ok(st.n === 1 && st.sel, 'capCreate: uma camada de legenda, escolhida', st);
  ok(st.blocks[0] === 'Oi gente!', 'primeiro bloco termina no fim da frase', st.blocks);
  ok(!st.blocks.some(t => /^\S+$/.test(t) && !/!$/.test(t)), 'nenhuma palavra sozinha no fim de frase', st.blocks);
  ok(st.blocks.includes('sete dias') || st.blocks.some(t => /sete dias$/.test(t.replace(' / ', ' '))), '"dias" vai junto com "sete"', st.blocks);
  ok(st.blocks.every(t => t.replace(' / ', ' ').split(' ').length <= 5), 'Karaokê: até 5 palavras por bloco', st.blocks);
  ok(st.blocks.some(t => t === st.text.replace('\n', ' / ')), 'L.text = o bloco mais longo', { text:st.text });

  // desenho: o bloco certo no tempo e a palavra falada na cor do destaque
  const px = await p.evaluate(() => {
    const L = S.layers.find(l => l.capt), w = W(), hh = H(), c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d', { willReadFrequently:true });
    const hx = capHlOf(L).slice(1, 7), hl = [0, 2, 4].map(i => parseInt(hx.slice(i, i + 2), 16)), at = t => { x.clearRect(0, 0, w, hh); renderFrame(x, t, 1, true); const B = L._bounds, d = x.getImageData(Math.max(0, B.x | 0), Math.max(0, B.y | 0), Math.max(1, B.w | 0), Math.max(1, B.h | 0)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - hl[0]) < 30 && Math.abs(d[i + 1] - hl[1]) < 30 && Math.abs(d[i + 2] - hl[2]) < 30) n++; return n; };
    const ws = W0, mid = k => (ws[k].s + ws[k].e) / 2;
    return { speaking:at(mid(3)), gap:(() => { x.clearRect(0, 0, w, hh); renderFrame(x, .2, 1, true); return !!(L._bounds && true); })() };
  });
  ok(px.speaking > 50, 'a palavra falada aparece na cor do destaque', px);
  const vis = await p.evaluate(() => { const L = S.layers.find(l => l.capt), bl = capBlocks(L); return { before:!!capAt(bl, .2), during:capAt(bl, W0[4].s + .05)?.text, after:!!capAt(bl, 11.8) }; });
  ok(!vis.before && !vis.after && /mostrar/i.test(vis.during || ''), 'fora das falas não mostra nada; na fala mostra o bloco dela', vis);
  await p.evaluate(() => { T = W0[5].s + .05; needs = true; }); await p.waitForTimeout(300);
  await p.screenshot({ path:path.join(outDir, 'legenda-karaoke.png') });

  // estilo pelo clique no chip
  await p.click('.leg-styles button:has-text("Uma palavra")'); await p.waitForTimeout(200);
  const one = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { style:L.capStyle, blocks:capBlocks(L).length, words:W0.length, max:Math.max(...capBlocks(L).map(b => b.ws.length)) }; });
  ok(one.style === 'one' && one.max === 1, 'chip "Uma palavra": um bloco por palavra', one);
  await p.click('.leg-styles button:has-text("Caixa na palavra")'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => S.layers.find(l => l.capt).capStyle === 'box' && !!document.getElementById(fid(S.layers.find(l => l.capt), 'capInk'))), 'chip "Caixa na palavra": campo da cor da palavra na caixa');
  await p.evaluate(() => { T = W0[5].s + .05; needs = true; }); await p.waitForTimeout(300);
  await p.screenshot({ path:path.join(outDir, 'legenda-caixa.png') });
  await p.click('.leg-styles button:has-text("Karaokê")'); await p.waitForTimeout(200);

  // palavra duvidosa marcada e filtro
  const dub = await p.evaluate(() => ({ marks:[...document.querySelectorAll('.leg-tx mark')].map(m => m.textContent), rows:document.querySelectorAll('.leg-row').length }));
  ok(dub.marks.length === 1 && dub.marks[0] === 'Mola', 'palavra com confiança baixa marcada na lista', dub);
  await p.click('label:has-text("Mostrar só os trechos para conferir")'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.querySelectorAll('.leg-row').length) === 1, 'filtro: só o trecho com a palavra para conferir');
  // correção digitada: mesmo número de palavras (o tempo fica)
  const row = p.locator('.leg-tx').first();
  await row.click(); await p.keyboard.press('Control+a');
  const before = await p.evaluate(() => S.layers.find(l => l.capt).capt.words.find(w => w.w === 'Mola'));
  const old = await row.textContent();
  await p.keyboard.type(old.replace('Mola', 'Molla')); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const fix = await p.evaluate(() => { const ws = S.layers.find(l => l.capt).capt.words; return ws.find(w => w.w === 'Molla'); });
  ok(fix && fix.s === before.s && fix.e === before.e && fix.c === 1, 'troca de palavra: mesmo tempo, confiança 1 (conferida)', { fix, before });
  ok(await p.evaluate(() => document.querySelectorAll('.leg-tx mark').length) === 0, 'depois de corrigir não fica nada marcado');
  // outro número de palavras: divide o tempo do trecho (o alinhador acerta depois, quando existe)
  await p.evaluate(() => { RT.capOnlyDub = false; renderProps(); });
  const r2 = p.locator('.leg-tx').nth(1), t2 = (await r2.textContent()).trim();
  const span0 = await p.evaluate(t => { const L = S.layers.find(l => l.capt), b = capBlocks(L).find(b => b.ws.map(w => w.w).join(' ') === t); return b && [b.ws[0].s, b.ws[b.ws.length - 1].e]; }, t2);
  await r2.click(); await p.keyboard.press('Control+a'); await p.keyboard.type(t2 + ' agora'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const span1 = await p.evaluate(t => { const ws = S.layers.find(l => l.capt).capt.words, i = ws.findIndex(w => w.w === 'agora'); const n = t.split(' ').length; return i < 0 ? null : [ws[i - n].s, ws[i].e]; }, t2);
  ok(span0 && span1 && Math.abs(span0[0] - span1[0]) < .002 && Math.abs(span0[1] - span1[1]) < .002, 'palavra a mais: o trecho continua no mesmo tempo, dividido entre as palavras', { span0, span1 });
  // desfazer
  await p.mouse.click(700, 120); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !S.layers.find(l => l.capt).capt.words.some(w => w.w === 'agora')), 'Ctrl+Z desfaz a correção');

  // .srt
  const srt = await p.evaluate(() => { let txt = ''; const o = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(t => window.SRT = t); return o.call(URL, b); }; capSrt(S.layers.find(l => l.capt)); URL.createObjectURL = o; return new Promise(r => setTimeout(() => r(window.SRT), 200)); });
  ok(/^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\nOI GENTE!/.test(srt || ''), '.srt com tempo e texto (caixa alta do estilo)', (srt || '').slice(0, 80));

  // a opção "Só a primeira letra em caixa alta" (L.cap) do texto comum não foi afetada
  const cap = await p.evaluate(() => { const L = mkText('title', { text:'OLÁ MUNDO', cap:true }); return caseTxt(L, L.text); });
  ok(cap === 'Olá mundo', 'texto comum: L.cap (primeira letra) continua valendo', cap);

  // clique duplo no palco leva ao trecho na lista
  await p.evaluate(() => { const L = S.layers.find(l => l.capt); select(L.id); T = W0[8].s + .05; needs = true; editText(L); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('leg-tx')), 'editar a legenda pelo palco foca o trecho da agulha');

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
