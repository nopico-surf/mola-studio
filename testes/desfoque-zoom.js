// Teste no navegador: "desfocar atrás" com o palco ampliado (pedido do usuário: com zoom alto travava, e afastando travava no meio).
// Confere que o palco não desenha mais a faixa de guarda em volta da parte vista (o canvas fica do tamanho de sem o vidro), que o
// resultado é o mesmo do desenho do quadro inteiro em resolução cheia (diferença de poucos /255) e que as telas de apoio grandes
// de um zoom que já passou saem logo da memória.
// Rodar: node testes/desfoque-zoom.js   (precisa do playwright)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const confere = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok || info == null ? '' : `\n      ${JSON.stringify(info)}`)); };

// o mesmo código roda no painel do navegador do Claude (colar em javascript_tool)
const cena = async () => {
  const c = document.createElement('canvas'); c.width = 2000; c.height = 2500; const x = c.getContext('2d');
  for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i * 13) % 50}%)`; x.fillRect((i * 733) % 2000, (i * 397) % 2500, 20 + (i % 7) * 15, 20 + (i % 5) * 20); }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
  await addImageFile(new File([blob], 'foto.jpg', { type:'image/jpeg' }));
  await new Promise(r => setTimeout(r, 1200));
  const img = S.layers.find(l => l.type === 'image');
  Object.assign(img, { mask:'rect', size:1, mh:1.25, x:.5, y:.5, in:'cut', idle:'none', start:0, end:S.duration });
  const sh = mkComp('shape'); Object.assign(sh, { mode:'solid', c1:'#ffffff22', size:.6, mh:.4, x:.5, y:.5, in:'cut', idle:'none', start:0, end:S.duration, bblur:44 });
  const s2 = mkComp('shape'); Object.assign(s2, { mode:'solid', c1:'#ff000033', size:.35, mh:.5, x:.62, y:.42, in:'cut', idle:'none', start:0, end:S.duration, bblur:20, lblur:4 });
  S.layers.push(sh, s2); RT.layout.clear(); pause(); T = 2; selectBg();
};
const mede = async () => {
  const sh = S.layers.filter(l => l.type === 'shape');
  const cmp = async (z, sx, sy) => {
    setZoom(z); await new Promise(r => setTimeout(r, 30));
    const sc = document.getElementById('stageScroll'); sc.scrollLeft = sx * (sc.scrollWidth - sc.clientWidth); sc.scrollTop = sy * (sc.scrollHeight - sc.clientHeight);
    FC.on = false; setView(viewFull()); stageRender();
    const V = VIEW, v = stageVis(); if (!V) return { z, semRecorte:true };
    const px = cvr.width * cvr.height, g = V.g;
    const fw = V.fw, fh = V.fh, ax0 = Math.ceil(Math.max(0, v.x0) * fw), ax1 = Math.floor(Math.min(1, v.x1) * fw), ay0 = Math.ceil(Math.max(0, v.y0) * fh), ay1 = Math.floor(Math.min(1, v.y1) * fh);
    const a = pctx.getImageData(ax0 - V.x, ay0 - V.y, ax1 - ax0, ay1 - ay0).data;
    // o de antes, no quadro inteiro e em resolução cheia (sem recorte, sem tela reduzida)
    RT.bbFull = true; setView(true); renderFrame(pctx, T, RS, false);
    const b = pctx.getImageData(ax0, ay0, ax1 - ax0, ay1 - ay0).data; RT.bbFull = false;
    // o mesmo palco sem nenhum vidro: tamanho do canvas para comparar
    const bb = sh.map(l => l.bblur); sh.forEach(l => { l.bblur = 0; }); setView(viewFull()); const px0 = cvr.width * cvr.height; sh.forEach((l, i) => { l.bblur = bb[i]; });
    FC.on = true;
    let mx = 0, s = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; s += d; }
    return { z, g, cresce:+(px / px0).toFixed(2), max:mx, media:+(s / a.length).toFixed(3) };
  };
  const r = [await cmp(3, .5, .5), await cmp(5, .6, .35), await cmp(3, 0, 0)];
  // telas grandes de um zoom que já passou saem quando o próximo zoom cria as dele
  const big = frameBuf(cvr, 'teste', 0, { x:0, y:0, w:2600, h:2000 }); big._t = performance.now() - 1000;
  frameBuf(cvr, 'teste', 0, { x:0, y:0, w:2610, h:2000 });
  const solta = ![...FBUF.values()].includes(big);
  needs = true;
  return { r, solta };
};

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport:{ width:1500, height:950 }, deviceScaleFactor:2 });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(cena);
  const m = await p.evaluate(mede);
  for (const q of m.r) {
    confere(`zoom ${q.z}: sem faixa de guarda em volta da parte vista`, q.g === 0 && q.cresce <= 1.05, q);
    confere(`zoom ${q.z}: mesmo desenho do quadro inteiro em resolução cheia`, q.max <= 10 && q.media <= 1.5, q);
  }
  confere('telas grandes de um zoom que já passou saem da memória', m.solta, m);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
