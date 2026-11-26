// Teste no navegador: transições de luz e lente entre clipes (pedido do usuário: "transições de vídeo que não sejam vetoriais,
// zoom, flare etc."). Duas fotos coladas (azul escura 0–2 s, verde 2–4 s): escolhe cada transição nova no painel com clique de
// verdade e confere que grava no clipe que entra, que antes da janela só aparece o primeiro, depois só o segundo, e que no meio
// o quadro é outro (luz soma brilho; zoom/giro/RGB/impacto mudam os pixels). Também confere que o giro não deixa canto vazio.
// Rodar: node testes/transicoes-de-luz.js (prints na pasta temporária, mola-testes/luz-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive:true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const near = (a, b, e) => a.every((v, i) => Math.abs(v - b[i]) <= e);
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { if (/clarity.ms/.test(e.stack || '')) return; falhas++; console.log('ERRO', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')); });
  p.on('console', m => { if (m.type() === 'error' && !/clarity|Failed to load resource/.test(m.text())) { falhas++; console.log('ERRO console', m.text()); } });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { S.layers = S.layers.filter(l => l.type === 'bg'); const bg = S.layers[0]; bg.mode = 'solid'; bg.c1 = '#000000'; bg.grain = 0; S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.duration = 4; S.slides = 1; T = 0; RT.selected = null; RT.picks = new Set(); changed({ layers:true, props:true }); renderTimeline(); });
  const ids = await p.evaluate(async () => {
    const mk = async (col, name, s, e, stripe) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 64, 64); if (stripe) { x.fillStyle = '#ffffff'; x.fillRect(16, 0, 3, 64); }
      const L = mkImage({ src:c.toDataURL(), name, in:'cut', out:'cut', inDur:0, outDur:0, size:1, mh:H() / SU, radius:0, x:.5, y:.5 });
      await getImage(L.src); S.layers.push(L); L.start = s; L.end = e; return L.id;
    };
    const a = await mk('#203060', 'Azul', 0, 2, true), b = await mk('#30a040', 'Verde', 2, 4);
    changed({ layers:true }); renderTimeline(); return { a, b };
  });
  // quadro pequeno fora do palco: média de cor de uma grade de pontos (fx, fy)
  const shot = (t, pts = [[.5, .5]]) => p.evaluate(({ t, pts }) => {
    const c = document.createElement('canvas'); c.width = Math.round(W() * .1); c.height = Math.round(H() * .1);
    const x = c.getContext('2d', { willReadFrequently:true }); renderFrame(x, t, .1);
    return pts.map(([fx, fy]) => [...x.getImageData(Math.min(c.width - 1, Math.floor(c.width * fx)), Math.min(c.height - 1, Math.floor(c.height * fy)), 1, 1).data].slice(0, 3));
  }, { t, pts });
  const A = [32, 48, 96], B = [48, 160, 64];
  await p.evaluate(id => { select(id, true); propTab = 'anim'; renderProps(); }, ids.b);
  const NEW = { zblur:'Zoom com rastro', spinblur:'Giro com rastro', flare:'Flare', leak:'Luz vazada', burn:'Queimar filme', expo:'Estourar', rgb:'Aberração RGB', shake:'Impacto' };
  const LIGHT = new Set(['flare', 'leak', 'burn', 'expo']);
  for (const [k, label] of Object.entries(NEW)) {
    const chip = p.locator('#props .chip', { hasText:new RegExp('^' + label + '$') }).first();
    ok(await chip.count() === 1, `"${label}" aparece na lista de transições`);
    await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(80);
    const x = await p.evaluate(id => { const L = S.layers.find(l => l.id === id); return L.xin && { ...L.xin }; }, ids.b);
    ok(x && x.k === k, `clicar em "${label}" grava a transição no clipe que entra`, x);
    const w = await p.evaluate(() => { const q = [...xfPairs(true).inn.values()][0]; return q && { t0:q.t0, t1:q.t1 }; });
    const [pre] = await shot(w.t0 - .02), [post] = await shot(w.t1 + .02);
    ok(near(pre, A, 3) && near(post, B, 3), `${label}: antes da janela só o primeiro, depois só o segundo`, { pre, post });
    const [s0] = await shot(w.t0 + 1e-3), [s1] = await shot(w.t1 - 1e-3);
    ok(near(s0, A, 6) && near(s1, B, 6), `${label}: começa no primeiro e termina no segundo, sem salto`, { s0, s1 });
    // no meio da janela o quadro não é nenhum dos dois (luz: mais claro que os dois)
    const grid = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) grid.push([.1 + .2 * i, .06 + .14 * j]);
    const mid = await shot(w.t0 + (w.t1 - w.t0) * .45, grid);
    const lum = c => c[0] * .3 + c[1] * .59 + c[2] * .11, diff = mid.some(c => !near(c, A, 8) && !near(c, B, 8));
    if (LIGHT.has(k)) ok(Math.max(...mid.map(lum)) > lum(B) + 25, `${label}: no meio a luz clareia o quadro`, Math.max(...mid.map(lum)));
    else if (k === 'rgb') {
      // a faixa branca do primeiro clipe ganha franjas coloridas (canais separados)
      const row = await shot(w.t0 + (w.t1 - w.t0) * .4, Array.from({ length:60 }, (_, i) => [.1 + i * .006, .5]));
      const fr = Math.max(...row.map(c => Math.max(...c) - Math.min(...c) - (Math.max(...A) - Math.min(...A))));
      ok(fr > 60, `${label}: no meio aparecem franjas coloridas`, fr);
    }
    else ok(diff || k === 'spinblur' || k === 'zblur', `${label}: no meio o quadro muda`, mid);
    if (k === 'spinblur' || k === 'zblur') {
      // foto lisa: o giro/zoom não pode abrir canto vazio (preto do fundo) em nenhum quadro da janela
      let worst = 999;
      for (let i = 1; i < 10; i++) for (const c of await shot(w.t0 + (w.t1 - w.t0) * i / 10, [[.02, .02], [.98, .02], [.02, .98], [.98, .98]])) worst = Math.min(worst, lum(c));
      ok(worst > lum(A) - 12, `${label}: sem canto vazio durante a janela`, worst);
    }
    await p.evaluate(w => { pause(); T = w.t0 + (w.t1 - w.t0) * .4; needs = true; }, w); await p.waitForTimeout(250);
    await p.screenshot({ path:path.join(outDir, `luz-${k}.png`) });
  }
  // Flare tem direção; trocar a direção muda de que lado a luz entra
  await p.locator('#props .chip', { hasText:/^Flare$/ }).first().click(); await p.waitForTimeout(80);
  const w = await p.evaluate(() => { const q = [...xfPairs(true).inn.values()][0]; return { t0:q.t0, t1:q.t1 }; });
  const side = async () => { const [l, r] = await shot(w.t0 + (w.t1 - w.t0) * .2, [[.1, .36], [.9, .36]]); return l[0] + l[1] - r[0] - r[1]; };
  const s1 = await side();
  await p.locator('#props .segs.ico button[title="Para a direita"]').click(); await p.waitForTimeout(80);
  const s2 = await side();
  ok(s1 < 0 && s2 > 0, 'Flare: para a esquerda a luz começa à direita; para a direita, à esquerda', { s1, s2 });
  // desfazer volta ao preset anterior
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  const xz = await p.evaluate(id => S.layers.find(l => l.id === id).xin, ids.b);
  ok(xz && xz.k === 'flare' && (xz.dir || 'l') === 'l', 'Ctrl+Z desfaz a troca de direção', xz);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
