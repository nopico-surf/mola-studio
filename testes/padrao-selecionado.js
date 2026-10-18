// Teste no navegador: o que está marcado aparece igual em todo lugar (borda/contorno verde), o "Tirar silêncios" não é botão
// principal e a régua da timeline refaz os números quando a janela muda de tamanho (antes ficavam uns por cima dos outros).
// Rodar: node testes/padrao-selecionado.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const conf = (ok, msg) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + msg); };
const GREEN = 'rgb(106, 156, 121)';

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  // formato marcado no topo: verde, não mais a pílula branca
  const fmt = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('#fmt button[aria-pressed="true"]')); return { bg:c.backgroundColor, sh:c.boxShadow }; });
  conf(fmt.sh.includes(GREEN) && !fmt.bg.startsWith('rgb(209'), 'formato marcado com contorno verde ' + JSON.stringify(fmt));

  // som com "Tirar silêncios": botão comum, não principal
  await p.evaluate(async () => {
    const sr = 16000, n = sr * 3, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, (i / sr) % 1 < .6 ? Math.sin(i / sr * 2 * Math.PI * 220) * 12000 : 0, true);
    await addAudioFile(new File([buf], 'tom.wav', { type:'audio/wav' }));
  });
  await p.waitForTimeout(600);
  await p.locator('.layers .lcell', { hasText:'tom' }).first().click();
  await p.waitForTimeout(300);
  const go = await p.evaluate(() => { const b = document.querySelector('.sil-go'); return b && { cls:b.className, bg:getComputedStyle(b).backgroundColor }; });
  conf(go && !go.cls.includes('primary') && go.bg !== 'rgb(79, 181, 116)', '"Tirar silêncios" não é botão principal ' + JSON.stringify(go));
  const on = await p.evaluate(() => getComputedStyle(document.querySelector('.sil-card .segs button[aria-pressed="true"]')).borderTopColor);
  conf(on === GREEN, 'modo marcado do cartão com borda verde ' + on);

  // régua: a janela estreita refaz o passo dos números
  const rul = () => p.evaluate(() => [...document.querySelectorAll('.tl-ruler b')].map(b => b.textContent).length);
  const wide = await rul();
  await p.setViewportSize({ width:1300, height:800 }); await p.waitForTimeout(600);
  const narrow = await rul();
  conf(narrow < wide, `régua refeita ao estreitar a janela (${wide} → ${narrow} números)`);

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
