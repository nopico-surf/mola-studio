// Teste no navegador: fala que a legenda não reconheceu (pedido do usuário: apontar onde a IA não reconheceu para ela tentar de
// novo só ali; se não der, criar outros trechos dentro da legenda). Sem a IA: o som é fabricado (tons onde há "fala") e o worker
// é trocado por um falso (legStart/legAsk). Confere:
// - capMissFind acha a voz que nenhuma palavra cobre (e não marca silêncio nem o que já tem palavra);
// - "Procurar fala sem legenda" marca no painel (linha tracejada) e na timeline (.tl-cmiss);
// - ↻ "Ouvir de novo" pede ao worker só aquele pedaço e as palavras novas entram ali, sem mexer nas outras; o aviso some;
// - ↻ num trecho existente troca as palavras dele; trechos editados à mão (bl) continuam;
// - IA sem nada: oferece escrever à mão;
// - lápis "Escrever à mão": trecho novo separado, edição no palco aberta, o texto digitado vira o trecho e o alinhador é chamado;
//   Esc num trecho novo vazio tira ele; "+ Trecho na agulha" no vão; Ctrl+Z desfaz.
// Rodar: node testes/legenda-fala-sem-legenda.js (prints em mola-testes/legenda-falta-*.png)
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
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; setDuration(12); T = 0; changed({ layers:true, props:true });
    // som: "fala" (tom com ruído leve) em 0,5–2,0 / 3,0–4,5 / 6,0–7,2 / 9,0–10,0; o resto quase silêncio
    const sr = 16000, a = new Float32Array(12 * sr), on = [[.5, 2], [3, 4.5], [6, 7.2], [9, 10]];
    for (let i = 0; i < a.length; i++) { const t = i / sr, sp = on.some(([x, y]) => t >= x && t < y); a[i] = (sp ? .25 * Math.sin(2 * Math.PI * 220 * t) * (.7 + .3 * Math.sin(2 * Math.PI * 4 * t)) : 0) + .002 * Math.sin(i * 12.9898) % .002; }
    window.AUD = a;
    capAudio = async () => window.AUD.slice(); // a mistura da timeline
    legHave = async () => true;
    window.ASKS = [];
    legStart = async () => {};
    legAsk = async m => {
      window.ASKS.push({ type:m.type, t0:m.t0, t1:m.t1, n:m.words && m.words.length });
      if (m.type === 'relisten') return { words:window.HEAR ? window.HEAR(m.t0, m.t1) : [] };
      if (m.type === 'realign') { const d = (m.t1 - m.t0) / m.words.length; return { words:m.words.map((w, k) => ({ w:w.w, s:m.t0 + k * d, e:m.t0 + (k + 1) * d - .02, c:.9 })) }; }
      return {};
    };
    // a IA "reconheceu" só as duas primeiras falas
    const mk = (txt, s0, s1) => { const ws = txt.split(' '), d = (s1 - s0) / ws.length; return ws.map((w, k) => ({ w, s:+(s0 + k * d).toFixed(3), e:+(s0 + (k + 1) * d - .03).toFixed(3), c:.95 })); };
    capCreate([...mk('Oi gente tudo bem.', .5, 2), ...mk('Hoje tem novidade.', 3, 4.5)]);
  });
  await p.waitForTimeout(300);

  // conta pura
  const pure = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return capMissFind(capEnergy(window.AUD), L.capt.words, capOff(L)); });
  ok(pure.length === 2 && Math.abs(pure[0].s - 6) < .3 && Math.abs(pure[0].e - 7.2) < .3 && Math.abs(pure[1].s - 9) < .3, 'acha as duas falas sem palavra, não o silêncio nem o que já tem legenda', pure);

  // botão "Procurar fala sem legenda"
  await p.evaluate(() => { const L = S.layers.find(l => l.capt); L.capt = { ...L.capt, miss:undefined }; renderProps(); });
  await p.click('button:has-text("Procurar fala sem legenda")'); await p.waitForTimeout(400);
  const st1 = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { miss:(L.capt.miss || []).length, rows:document.querySelectorAll('.leg-row.miss').length, tl:document.querySelectorAll('.tl-row[data-id="' + L.id + '"] .tl-cmiss').length }; });
  ok(st1.miss === 2 && st1.rows === 2 && st1.tl === 2, 'marcado no painel e na timeline', st1);
  await p.evaluate(() => document.querySelector('.leg-row.miss')?.scrollIntoView({ block:'center' }));
  await p.screenshot({ path:path.join(outDir, 'legenda-falta-1.png') });

  // ↻ na primeira fala sem legenda: o falso ouvido devolve palavras dentro do pedaço
  await p.evaluate(() => { window.HEAR = (t0, t1) => ['Clica', 'no', 'link.'].map((w, k) => ({ w, s:t0 + .1 + k * .35, e:t0 + .4 + k * .35, c:.9 })); });
  const before = await p.evaluate(() => S.layers.find(l => l.capt).capt.words.slice(0, 7).map(w => w.w + w.s).join());
  await p.click('.leg-row.miss >> nth=0 >> button[aria-label="Ouvir de novo com a IA"]'); await p.waitForTimeout(500);
  const st2 = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { words:L.capt.words.map(w => w.w).join(' '), keep:L.capt.words.slice(0, 7).map(w => w.w + w.s).join(), miss:(L.capt.miss || []).length, ask:window.ASKS.filter(a => a.type === 'relisten').pop(), blocks:capBlocks(L).map(b => b.text.replace('\n', ' ')) }; });
  ok(st2.ask && Math.abs(st2.ask.t0 - 6) < .3 && Math.abs(st2.ask.t1 - 7.2) < .3, 'o worker ouve só aquele pedaço', st2.ask);
  ok(/novidade\. Clica no link\./.test(st2.words) && st2.keep === before, 'as palavras novas entram no lugar e as outras não mudam', st2);
  ok(st2.miss === 1, 'o aviso daquele pedaço some', st2);
  ok(st2.blocks.some(t => /Clica no link/.test(t)), 'vira trecho da legenda', st2.blocks);

  // ↻ num trecho que já existe (texto errado): troca só as palavras dele, com os trechos editados à mão (bl)
  await p.evaluate(() => { const L = S.layers.find(l => l.capt); capPut(L, capFz(L)); window.HEAR = (t0, t1) => ['Hoje', 'tem', 'novidade', 'boa.'].map((w, k) => ({ w, s:3 + k * .35, e:3.3 + k * .35, c:.9 })); renderProps(); });
  const k1 = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return capBlocks(L).findIndex(b => /Hoje/.test(b.text)); });
  await p.click(`.leg-row:not(.miss) >> nth=${k1} >> button[aria-label="Ouvir de novo com a IA"]`); await p.waitForTimeout(500);
  const st3 = await p.evaluate(() => { const L = S.layers.find(l => l.capt); return { words:L.capt.words.map(w => w.w).join(' '), fz:!!capFrozen(L), blocks:capBlocks(L).map(b => b.text.replace('\n', ' ')) }; });
  ok(/Hoje tem novidade boa\. Clica/.test(st3.words) && !/novidade\. Clica/.test(st3.words), 'trecho existente: as palavras dele são trocadas', st3);
  ok(st3.fz, 'os trechos editados à mão continuam', st3);

  // IA sem nada: oferece escrever à mão
  await p.evaluate(() => { window.HEAR = () => []; });
  await p.click('.leg-row.miss >> nth=0 >> button[aria-label="Ouvir de novo com a IA"]'); await p.waitForTimeout(500);
  const toastTx = await p.evaluate(() => [...document.querySelectorAll('.toast, #toast')].map(e => e.textContent).join(' '));
  ok(/não achou fala/.test(toastTx) && /Escrever à mão/.test(toastTx), 'sem nada reconhecido: avisa e oferece escrever', toastTx);

  // lápis: escrever à mão no último pedaço
  await p.click('.leg-row.miss >> nth=0 >> button[aria-label="Escrever à mão"]'); await p.waitForTimeout(400);
  const ed = await p.evaluate(() => ({ open:!!document.querySelector('.sedit'), tx:document.querySelector('.sedit')?.textContent, miss:(S.layers.find(l => l.capt).capt.miss || []).length }));
  ok(ed.open && ed.tx === '…', 'abre a edição no palco no trecho novo', ed);
  await p.keyboard.type('Testa grátis por sete dias.'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  const st4 = await p.evaluate(() => { const L = S.layers.find(l => l.capt), b = capBlocks(L).find(b => /grátis/.test(b.text)); return { b:b && { t:b.text.replace('\n', ' '), s:b.s, e:b.e }, words:L.capt.words.map(w => w.w).join(' '), miss:(L.capt.miss || []).length, re:window.ASKS.filter(a => a.type === 'realign').pop() }; });
  ok(st4.b && /Testa grátis por sete dias/.test(st4.b.t) && st4.b.s >= 8.8 && st4.b.s < 9.3, 'o texto digitado vira o trecho, no lugar da fala', st4);
  ok(st4.miss === 0, 'sem avisos sobrando', st4);
  ok(st4.re && st4.re.n === 5, 'o alinhador acerta o tempo das palavras escritas', st4.re);
  await p.screenshot({ path:path.join(outDir, 'legenda-falta-2.png') });

  // "+ Trecho na agulha" num vão e Esc: o trecho vazio sai
  const n0 = await p.evaluate(() => { T = 2.4; const L = S.layers.find(l => l.capt); select(L.id); renderProps(); return capBlocks(L).length; });
  await p.click('button:has-text("+ Trecho na agulha")'); await p.waitForTimeout(300);
  const mid = await p.evaluate(() => ({ open:!!document.querySelector('.sedit'), n:capBlocks(S.layers.find(l => l.capt)).length }));
  ok(mid.open && mid.n === n0 + 1, '+ Trecho na agulha: trecho novo e edição aberta', { n0, ...mid });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(n0 => capBlocks(S.layers.find(l => l.capt)).length === n0 && !S.layers.find(l => l.capt).capt.words.some(w => w.w === CAP_NEW), n0), 'Esc no trecho novo vazio: ele sai');

  // Ctrl+Z desfaz o escrito à mão
  await p.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); undo(); });
  ok(await p.evaluate(() => !S.layers.find(l => l.capt).capt.words.some(w => /grátis/.test(w.w))), 'Ctrl+Z desfaz');

  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); await b.close(); process.exit(falhas ? 1 : 0);
})();
