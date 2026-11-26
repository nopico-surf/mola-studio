// Teste no navegador: presets "Colunas elásticas" e "Linhas elásticas" (Enquanto está na tela, só texto).
// Pedido do usuário: animação de tipografia como o "Room to grow" (letras que esticam e dividem a coluna), como preset.
// Caminho real: adiciona um título pelo botão, abre "Enquanto está na tela", clica no preset e confere as opções;
// depois confere as contas (ewPlan): coluna com altura constante, linha com largura constante, onda que anda, sem salto
// na entrada, determinístico e parado na imagem estática.
// Rodar: node testes/colunas-elasticas.js
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
  await p.locator('#adds button[title="Adicionar título"]').click(); await p.waitForTimeout(300);
  await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); pushUndo(); L.text = 'ROOM\nGROW'; L.lh = .85; L.upper = true; RT.layout.clear(); changed(); propTab = 'anim'; renderProps(); });
  await p.waitForTimeout(200);
  const open = p.locator('button[aria-label="Abrir Enquanto está na tela"]');
  if (await open.count()) { await open.click(); await p.waitForTimeout(400); }
  await p.locator('button.chip.pt[data-key="cols"]').click(); await p.waitForTimeout(300);
  const ui = await p.evaluate(() => ({ idle:S.layers.find(l => l.type === 'text').idle, onda:!!document.querySelector('.ew-opts [aria-label="Onda"]'), ritmo:!!document.querySelector('.ew-opts [aria-label="Ritmo"]') }));
  confere('clique no preset liga as Colunas elásticas', ui.idle === 'cols', ui.idle);
  confere('opções Onda e Ritmo aparecem embaixo da grade', ui.onda && ui.ritmo);
  await p.locator('.ew-opts button[aria-label="Do meio para fora"]').click(); await p.waitForTimeout(200);
  confere('escolher a onda grava na camada', await p.evaluate(() => S.layers.find(l => l.type === 'text').ewDir) === 'c');

  const r = await p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'text'); L.ewDir = 'r'; L.end = 8; S.duration = 8; RT.layout.clear();
    const lay = layoutText(L, caseTxt(L, L.text)), B = ewBands(lay), ph0 = phase(L, L.start + 3);
    const at = t => ewPlan(L, lay, t - L.start, phase(L, t));
    // coluna: o alto da linha de cima e o pé da de baixo não se mexem; as alturas variam
    let topErr = 0, botErr = 0, smin = 9, smax = 0, colErr = 0;
    for (const t of [L.start + 2.5, L.start + 3.1, L.start + 3.9]) {
      const P = at(t);
      for (const line of lay.lines) for (const g of line.glyphs) { if (g.space) continue; const e = P.get(g), bb = B[line.li];
        if (line.li === 0) topErr = Math.max(topErr, Math.abs(e.ny - bb.top)); else botErr = Math.max(botErr, Math.abs(e.ny + e.sy * bb.h - bb.bot));
        smin = Math.min(smin, e.sy); smax = Math.max(smax, e.sy); }
      // no mesmo x as duas letras somam a altura da coluna: a de baixo começa onde a de cima termina + a emenda
      const g0 = lay.lines[0].glyphs[0], e0 = P.get(g0), cx = lay.lines[0].x0 + g0.x + g0.w / 2;
      const P1 = ewPlan(L, lay, t - L.start, phase(L, t)); // a de baixo calculada no x da de cima
      const B1 = B[1], hTop = e0.sy * B[0].h, want = B[1].bot - B[0].top - B.gap - hTop;
      const g1 = lay.lines[1].glyphs.find(g => !g.space && Math.abs(lay.lines[1].x0 + g.x + g.w / 2 - cx) < g.w / 2) || null;
      if (g1) { const e1 = P1.get(g1); colErr = Math.max(colErr, Math.abs(e1.sy * B1.h - want) / B1.h); }
    }
    // onda anda: o estado muda com o tempo
    const sig = t => { const P = at(t); return [...P.values()].map(e => e.sy.toFixed(3)).join(); };
    const anda = sig(L.start + 2.6) !== sig(L.start + 3.2);
    // entrada: nada estica; logo depois dela entra aos poucos
    const inPh = phase(L, L.start + .05), noIn = inPh.mode !== 'in' || ewPlan(L, lay, .05, inPh) === null;
    const tIn = L.start + ph0.inD + .05, Pin = at(tIn), soft = [...Pin.values()].every(e => Math.abs(e.sy - 1) < .2);
    // linhas: cada linha mantém a largura
    L.idle = 'rows'; let rowErr = 0, sxMax = 0;
    for (const t of [L.start + 2.7, L.start + 3.5]) { const P = at(t);
      for (const line of lay.lines) { const gs = line.glyphs.filter(g => !g.space), g = gs[gs.length - 1], e = P.get(g);
        const end = e.nx + e.sx * (Math.max(line.width, g.x + g.w) - g.x); rowErr = Math.max(rowErr, Math.abs(end - (line.x0 + Math.max(line.width, g.x + g.w))));
        for (const q of gs) sxMax = Math.max(sxMax, P.get(q).sx); } }
    L.idle = 'cols';
    // determinístico e imagem estática
    const c = document.createElement('canvas'); c.width = 270; c.height = 337; const x = c.getContext('2d', { willReadFrequently:true });
    const shot = t => { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 270, 337); x.setTransform(.25, 0, 0, .25, 0, 0); renderFrame(x, t, .25, true); const d = x.getImageData(0, 0, 270, 337).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; };
    const det = shot(L.start + 3.3) === shot(L.start + 3.3), muda = shot(L.start + 2.6) !== shot(L.start + 3.3);
    S.still = true; const still = ewPlan(L, lay, 3, phase(L, 3)) === null; S.still = false;
    return { topErr, botErr, smin, smax, colErr, anda, noIn, soft, rowErr, sxMax, det, muda, still };
  });
  confere('alto da linha de cima parado', r.topErr < .5, r.topErr.toFixed(3));
  confere('pé da linha de baixo parado', r.botErr < .5, r.botErr.toFixed(3));
  confere('a de cima e a de baixo dividem a coluna (centros das letras quase no mesmo x)', r.colErr < .06, r.colErr.toFixed(4));
  confere('as letras esticam e encolhem de verdade', r.smax / r.smin > 1.6, (r.smax / r.smin).toFixed(2));
  confere('a onda anda com o tempo', r.anda);
  confere('na entrada nada estica', r.noIn);
  confere('logo depois da entrada começa suave (sem salto)', r.soft);
  confere('Linhas elásticas: cada linha mantém a largura', r.rowErr < .5, r.rowErr.toFixed(3));
  confere('Linhas elásticas: as letras alargam', r.sxMax > 1.2, r.sxMax.toFixed(2));
  confere('mesmo tempo = mesmo quadro (determinístico)', r.det);
  confere('o desenho muda com o tempo', r.muda);
  confere('imagem estática: parado', r.still);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
