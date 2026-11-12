// Teste no navegador: o anel do "Pulsar" do botão não pode parecer um contorno fixo.
// Reclamação do usuário: "o botão tem uma linha que não consigo tirar". Era o anel do Pulsar (a animação na tela que
// todo botão traz de fábrica), desenhado o ciclo inteiro: com a agulha parada parecia um contorno, mas não estava em Contorno.
// Agora o anel só aparece logo depois de cada pulso (menos da metade do ciclo) e nunca na imagem estática.
// Rodar: node testes/botao-sem-linha.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (info != null ? '  (' + info + ')' : '')); };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await (await b.newContext({ viewport:{ width:1400, height:900 } })).newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.locator('button[title="Adicionar botão"]').click(); await p.waitForTimeout(300);
  // anel = pixels em volta do botão que mudam entre Pulsar e "Sem animação" fora do pico do pulso (o pulso só escala perto do pico)
  const r = await p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'cta'), c = document.createElement('canvas'); c.width = W(); c.height = H();
    const x = c.getContext('2d', { willReadFrequently:true });
    const ring = t => {
      const d = []; let B;
      for (const idle of ['pulse', 'none']) {
        L.idle = idle; renderFrame(x, t, 1, true); B = B || { ...L._bounds };
        d.push(x.getImageData(Math.round(B.x - 60), Math.round(B.y - 40), Math.round(B.w + 120), Math.round(B.h + 80)).data);
      }
      L.idle = 'pulse'; let n = 0; for (let i = 0; i < d[0].length; i += 4) if (Math.abs(d[0][i + 1] - d[1][i + 1]) > 6) n++; return n;
    };
    const inEnd = L.start + L.inDur + .05, ts = []; for (let t = inEnd; t < inEnd + 3.2; t += .05) ts.push(t);
    const vis = ts.filter(t => ring(t) > 0).length / ts.length;
    S.still = true; const still = ring(inEnd + 1); S.still = false;
    return { vis, still, idle:L.idle };
  });
  confere('botão novo continua com Pulsar', r.idle === 'pulse', r.idle);
  confere('anel + pulso visíveis em bem menos que o ciclo inteiro (antes: 100%)', r.vis < .65, Math.round(r.vis * 100) + '%');
  confere('imagem estática: sem anel', r.still === 0, r.still);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
