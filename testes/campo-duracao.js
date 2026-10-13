// Teste no navegador: o campo Duração (minutos:segundos) tem que refletir o que foi digitado e avisar quando muda o valor.
// Bug relatado: "o número que coloco em minutos e segundos para mudar o tamanho da timeline não reflete a realidade".
// Antes: 1.30 virava 2 s, 1m30 era ignorado, 15:00 virava 10:00 e campo vazio virava imagem estática, tudo sem aviso.
// Rodar: node testes/campo-duracao.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : `\n      esperado ${JSON.stringify(esperado)}\n      veio     ${JSON.stringify(real)}`));
};
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  // digita de verdade no campo e confirma com Enter, como o usuário
  const digita = async txt => {
    await p.click('#dur', { clickCount:3 }); await p.keyboard.type(txt); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    return p.evaluate(() => ({ campo:$('#dur').value, D:S.duration, still:!!S.still, aviso:(document.querySelector('.toast') || {}).textContent || '' }));
  };
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); delete S.slides; delete S.sdur; delete S.still; S.duration = 8; changed({ props:true, layers:true }); updDur(true); });

  confere('1:30 = 90 s', (await digita('1:30')).D, 90);
  confere('a régua acompanha o total', await p.evaluate(() => S.layers[0].end), 90);
  confere('1m30 = 90 s', (await digita('1m30')).D, 90);
  confere('2min = 120 s', (await digita('2min')).D, 120);
  confere('45s = 45 s', (await digita('45s')).D, 45);
  confere('01:05 = 65 s', (await digita('01:05')).D, 65);

  let r = await digita('15:00');
  confere('15:00 vai ao máximo (10:00) e avisa', [r.D, r.campo, /máxima/.test(r.aviso)], [600, '10:00', true]);
  r = await digita('1.30');
  confere('1.30 (1,3 s) vai ao mínimo e avisa', [r.D, r.campo, /mínima/.test(r.aviso)], [2, '00:02', true]);
  await digita('1:30');
  r = await digita('130');
  confere('130 = 130 s e avisa como digitar 1:30', [r.D, /1:30/.test(r.aviso)], [130, true]);
  await digita('1:30');
  r = await digita('abc');
  confere('texto sem sentido não muda nada e avisa', [r.D, r.campo, /Não entendi/.test(r.aviso)], [90, '01:30', true]);
  r = await digita('');
  confere('campo vazio não vira imagem estática', [r.D, r.still, r.campo], [90, false, '01:30']);
  r = await digita('0');
  confere('0 continua sendo imagem estática', r.still, true);

  // Bug relatado: "coloco 9 minutos e um vídeo que tem menos de 1 min ocupa a timeline toda". O vídeo entrou cortado pelo fim da
  // timeline e, ao aumentar a duração, ia até o fim novo repetindo. Tem que crescer só até o tamanho dele.
  await digita('0:02');
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType:'video/webm' }), parts = []; rec.ondataavailable = e => parts.push(e.data);
    let f = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${f++ * 9},70%,50%)`; g.fillRect(0, 0, 160, 120); }, 33);
    rec.start(); await new Promise(r => setTimeout(r, 4000)); rec.stop(); await new Promise(r => rec.onstop = r); clearInterval(iv);
    await addVideoFile(new File(parts, 'teste.webm', { type:'video/webm' }));
  });
  await p.waitForTimeout(1500);
  const vid = () => p.evaluate(() => { const L = S.layers.find(l => l.video); return L && { s:L.start, e:L.end, cyc:+vidPlan(L).cyc.toFixed(3) }; });
  let v = await vid();
  confere('o vídeo entrou cortado pela timeline de 2 s', !!v && v.e <= 2 + 1e-3 && v.cyc > 3, true);
  await digita('9:00');
  v = await vid();
  confere('9:00: o vídeo cresce até o tamanho dele, não até o fim', +(v.e - v.s).toFixed(2), +v.cyc.toFixed(2));
  // esticado de propósito (repetindo) até o fim: continua acompanhando o fim
  await p.evaluate(() => { const L = S.layers.find(l => l.video); L.end = S.duration; changed({ layers:true }); });
  await digita('9:30');
  v = await vid();
  confere('vídeo que já repetia até o fim acompanha o fim novo', v.e, 570);
  await digita('0:30');
  v = await vid();
  confere('diminuir corta o vídeo no fim novo', v.e, 30);

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
