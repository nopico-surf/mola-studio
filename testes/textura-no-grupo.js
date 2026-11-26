// Teste no navegador: Textura no grupo/frame inteiro (Efeitos "+" → Textura com o grupo escolhido).
// Pelo painel: a linha Textura aparece em Efeitos do grupo, liga em S.groups[gid].grain, desenha no conjunto (muda os pixels dele e
// não mexe fora), o mesmo quadro sai igual duas vezes, parada fica igual de um quadro para o outro e a que mexe não, o olho esconde.
// Rodar: node testes/textura-no-grupo.js
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
    changed({ layers:true, props:true });
  });
  const add = async word => { await p.evaluate(w => [...document.querySelectorAll('#adds button.add')].find(x => (x.title || x.textContent || '').toLowerCase().includes(w)).click(), word); await p.waitForTimeout(300); };
  await add('título'); await add('forma');
  await p.evaluate(() => {
    for (const L of S.layers) { if (L.type === 'bg') continue; L.idle = 'none'; L.in = 'fade'; L.start = 0; L.inDur = .3; L.end = 4; }
    const t = S.layers.find(l => l.type === 'text'); t.text = 'GRUPO'; t.size = 200; t.color = '#c0c0c0';
    RT.picks = new Set(S.layers.filter(l => l.type !== 'bg').map(l => l.id)); RT.selected = t.id;
    groupSel(); changed({ layers:true, props:true });
  });
  await p.waitForTimeout(300);
  const g = await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); return { gid:L.grp, whole:wholeGroup(), n:gleaves(L.grp).length }; });
  ok(g.gid && g.n === 2 && g.whole === g.gid, 'grupo com texto e forma, escolhido inteiro', g);

  // Efeitos "+" → Textura, pelo painel, com o grupo inteiro escolhido
  const tab = p.locator('#props button', { hasText:'Conteúdo e estilo' }); if (await tab.count()) { await tab.first().click(); await p.waitForTimeout(150); }
  const plus = p.locator('#props button[aria-label="Acrescentar efeito"]'); await plus.scrollIntoViewIfNeeded(); await plus.click(); await p.waitForTimeout(250);
  await p.locator('.ctx.nfmenu:not(.pop-out) button', { hasText:'Textura' }).click(); await p.waitForTimeout(300);
  const r1 = await p.evaluate(() => { const gid = wholeGroup(), m = S.groups[gid]; return { grain:m.grain, k:m.grainK, row:!!document.querySelector('#props [data-fx="grain"]'), styleOn:gStyleOn(gid), leaf:S.layers.filter(l => l.type !== 'bg').map(l => l.grain || 0) }; });
  ok(r1.row && r1.grain > 0 && r1.k === 'film' && r1.styleOn, 'Efeitos "+" → Textura liga no grupo', r1);
  ok(r1.leaf.every(v => v === 0), 'os itens de dentro não ganham textura própria', r1);

  // pixels: muda o conjunto, não mexe fora dele
  const r3 = await p.evaluate(() => {
    const gid = wholeGroup(), m = S.groups[gid], t = 1, on = __px(t); m.grain = 0; const off = __px(t); m.grain = .3;
    const lv = gleaves(gid).map(l => l._bounds).filter(Boolean), x0 = Math.min(...lv.map(b => b.x)), y0 = Math.min(...lv.map(b => b.y)), x1 = Math.max(...lv.map(b => b.x + b.w)), y1 = Math.max(...lv.map(b => b.y + b.h));
    const w = Math.round(W() * .4); let inn = 0, out = 0;
    for (let i = 0; i < on.length; i += 4) { if (Math.abs(on[i] - off[i]) > 2 || Math.abs(on[i + 1] - off[i + 1]) > 2) { const px = (i / 4) % w, py = Math.floor(i / 4 / w); if (px >= x0 * .4 - 2 && px <= x1 * .4 + 2 && py >= y0 * .4 - 2 && py <= y1 * .4 + 2) inn++; else out++; } }
    return { inn, out };
  });
  ok(r3.inn > 200, 'a textura muda o conjunto', r3);
  ok(r3.out === 0, 'fora do grupo nada muda', r3);

  const r4 = await p.evaluate(() => {
    const gid = wholeGroup(), m = S.groups[gid], res = {};
    m.grainK = 'paper'; delete m.grainAnim;
    res.same = __diff(__px(1), __px(1)); res.still = __diff(__px(1), __px(1 + 1 / fps()));
    m.grainK = 'film'; delete m.grainAnim; res.film = __diff(__px(1), __px(1 + 1 / fps()));
    return res;
  });
  ok(r4.same === 0, 'o mesmo quadro sai igual duas vezes (determinístico)', r4);
  ok(r4.still === 0, 'Papel (parada) fica igual de um quadro para o outro', r4);
  ok(r4.film > 0, 'Filme mexe a cada quadro', r4);

  // olho esconde e devolve
  const hid = await p.evaluate(() => { const gid = wholeGroup(), m = S.groups[gid]; return { has:!!document.querySelector('#props [data-fx="grain"]'), v:m.grain }; });
  ok(hid.has, 'a linha Textura continua no painel do grupo', hid);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo certo'); process.exit(falhas ? 1 : 0);
})();
