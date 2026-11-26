// Teste no navegador: Distorção (Efeitos "+" → Distorção) em texto, forma e grupo inteiro.
// Pelo painel: a linha aparece, liga em L.warp, cada tipo muda os pixels perto do elemento (e nada longe dele), o mesmo quadro sai
// igual duas vezes, parada fica igual de um quadro para o outro e com movimento não, Derreter escorre abaixo da caixa, o olho esconde
// (volta ao desenho sem distorção), "−" tira, e no grupo vale para o conjunto sem dar distorção própria aos itens.
// Rodar: node testes/distorcao.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); const bg = S.layers[0]; bg.mode = 'solid'; bg.c1 = '#203040'; bg.grain = 0;
    S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.slides = 1; S.duration = 4; T = 0; RT.selected = null; RT.picks = new Set();
    window.__px = (t, rs = .4) => { const c = document.createElement('canvas'); c.width = Math.round(W() * rs); c.height = Math.round(H() * rs); renderFrame(c.getContext('2d'), t, rs, true); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
    window.__diff = (a, b2) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b2[i]) > 2) n++; return n; };
    // pixels que mudaram dentro da caixa (com folga) e longe dela; abaixo = quantos ficam abaixo da caixa
    window.__where = (a, b2, bx, pad) => {
      const rs = .4, w = Math.round(W() * rs); let inn = 0, out = 0, below = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b2[i]) > 2 || Math.abs(a[i + 1] - b2[i + 1]) > 2) {
        const x = (i / 4) % w / rs, y = Math.floor(i / 4 / w) / rs;
        if (x >= bx.x - pad && x <= bx.x + bx.w + pad && y >= bx.y - pad && y <= bx.y + bx.h + pad) { inn++; if (y > bx.y + bx.h + 4) below++; } else out++;
      }
      return { inn, out, below };
    };
    changed({ layers:true, props:true });
  });
  const add = async word => { await p.evaluate(w => [...document.querySelectorAll('#adds button.add')].find(x => (x.title || x.textContent || '').toLowerCase().includes(w)).click(), word); await p.waitForTimeout(300); };
  const plusFx = async name => {
    const tab = p.locator('#props button', { hasText:'Conteúdo e estilo' }); if (await tab.count()) { await tab.first().click(); await p.waitForTimeout(150); }
    const plus = p.locator('#props button[aria-label="Acrescentar efeito"]'); await plus.scrollIntoViewIfNeeded(); await plus.click(); await p.waitForTimeout(250);
    await p.locator('.ctx.nfmenu:not(.pop-out) button', { hasText:name }).click(); await p.waitForTimeout(300);
  };

  await add('título');
  await p.evaluate(() => {
    const t = S.layers.find(l => l.type === 'text'); t.text = 'ONDA'; t.size = 220; t.color = '#f0c040'; t.idle = 'none'; t.in = 'fade'; t.inDur = .3; t.start = 0; t.end = 4;
    select(t.id); changed({ layers:true, props:true });
  });
  ok(await p.evaluate(() => !!warpGL()), 'WebGL2 da distorção disponível');
  await plusFx('Distorção');
  const r1 = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); return { warp:L.warp, row:!!document.querySelector('#props [data-fx="warp"]') }; });
  ok(r1.row && r1.warp === 'wave', 'Efeitos "+" → Distorção liga Onda no texto', r1);

  // abre os detalhes pelo nome da linha: a grade com os tipos aparece
  await p.locator('#props [data-fx="warp"] .fx-nm').click(); await p.waitForTimeout(300);
  const grid = await p.evaluate(() => [...document.querySelectorAll('.pop .tex-k')].map(b => b.title));
  ok(grid.length === 10 && grid.includes('Derreter'), 'janelinha mostra os tipos', grid);
  await p.locator('.pop .tex-k[title="Líquido"]').click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => S.layers.find(l => l.type === 'text').warp === 'liquid'), 'clicar em Líquido troca o tipo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  // cada tipo muda os pixels perto do texto e nada longe dele
  const r2 = await p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'text'), res = {};
    L.warp = 'wave'; __px(1); const bx = { ...L._bounds };
    delete L.warp; const off = __px(1);
    for (const k of Object.keys(WARP_KINDS)) { L.warp = k; delete L.warpA; delete L.warpS; delete L.warpF; L.warpV = 0; const on = __px(1); res[k] = __where(on, off, bx, warpReach(L, bx) + 40); }
    L.warp = 'wave'; delete L.warpV; return res;
  });
  for (const [k, v] of Object.entries(r2)) ok(v.inn > 50 && v.out === 0, `tipo ${k}: muda o texto e nada longe dele`, v);

  const r3 = await p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'text'), res = {};
    L.warp = 'melt'; delete L.warpA; delete L.warpS; L.warpV = 0; __px(1); const bx = { ...L._bounds }; delete L.warp; const off = __px(1); L.warp = 'melt';
    res.melt = __where(__px(1), off, bx, 400).below;
    L.warp = 'wave'; L.warpV = 0; res.same = __diff(__px(1), __px(1)); res.still = __diff(__px(1), __px(1.2));
    L.warpV = 1; res.moving = __diff(__px(1), __px(1.2));
    L.warpHide = true; res.hidden = __diff(__px(1), off); delete L.warpHide;
    return res;
  });
  ok(r3.melt > 30, 'Derreter escorre abaixo da caixa do texto', r3);
  ok(r3.same === 0, 'o mesmo quadro sai igual duas vezes (determinístico)', r3);
  ok(r3.still === 0, 'Movimento 0: parado entre quadros', r3);
  ok(r3.moving > 0, 'com movimento, muda entre quadros', r3);
  ok(r3.hidden === 0, 'olho fechado = desenho sem distorção', r3);

  // olho pelo painel e "−" tira
  await p.evaluate(() => changed({ layers:true, props:true })); await p.waitForTimeout(200);
  const row = p.locator('#props [data-fx="warp"]');
  await row.locator('button.prop-eye').first().click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => S.layers.find(l => l.type === 'text').warpHide === true), 'olho do painel esconde a distorção');
  await p.locator('#props [data-fx="warp"] button.prop-rm').first().click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !S.layers.find(l => l.type === 'text').warp && !document.querySelector('#props [data-fx="warp"]')), '"−" tira a distorção');

  // forma: pelo painel também
  await add('forma');
  await p.evaluate(() => { const s = S.layers.find(l => l.type === 'shape'); s.idle = 'none'; s.in = 'fade'; s.inDur = .3; s.start = 0; s.end = 4; s.y = .8; select(s.id); changed({ layers:true, props:true }); });
  await plusFx('Distorção');
  const r4 = await p.evaluate(() => { const s = S.layers.find(l => l.type === 'shape'); const on = __px(1); s.warpHide = true; const off = __px(1); delete s.warpHide; return { warp:s.warp, d:__diff(on, off) }; });
  ok(r4.warp === 'wave' && r4.d > 50, 'forma distorce pelo painel', r4);
  await p.evaluate(() => { const s = S.layers.find(l => l.type === 'shape'); delete s.warp; changed({ layers:true, props:true }); });

  // grupo inteiro
  await p.evaluate(() => { RT.picks = new Set(S.layers.filter(l => l.type !== 'bg').map(l => l.id)); RT.selected = S.layers.find(l => l.type === 'text').id; groupSel(); changed({ layers:true, props:true }); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !!wholeGroup()), 'grupo escolhido inteiro');
  await plusFx('Distorção');
  const r5 = await p.evaluate(() => {
    const gid = wholeGroup(), m = S.groups[gid], on = __px(1); m.warpHide = true; const off = __px(1); delete m.warpHide;
    return { warp:m.warp, styleOn:gStyleOn(gid), d:__diff(on, off), leaf:S.layers.filter(l => l.type !== 'bg').map(l => l.warp || '') , row:!!document.querySelector('#props [data-fx="warp"]') };
  });
  ok(r5.row && r5.warp === 'wave' && r5.styleOn, 'Efeitos "+" → Distorção liga no grupo', r5);
  ok(r5.d > 50, 'a distorção do grupo muda o conjunto', r5);
  ok(r5.leaf.every(v => !v), 'os itens de dentro não ganham distorção própria', r5);

  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo'); process.exit(falhas ? 1 : 0);
})();
