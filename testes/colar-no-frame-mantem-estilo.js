// Teste no navegador: copiar um elemento e colar dentro de um frame com layout mantém as propriedades dele.
// Bug relatado: "quando eu colo o acesse no mesmo frame que tá os outros negócios, perde as propriedades"
// (o "acesse" era um cartão/botão verde; colado no frame, sobrava só o texto).
// Rodar: node testes/colar-no-frame-mantem-estilo.js
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
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; delete S.flow;
    const mk = (L, x, y) => { L.start = 0; L.end = S.duration; addLayer(L, { x, y }); return L; };
    selectBg();
    const t1 = mk(mkText('title', { text:'Título', size:80 }), .5, .2), t2 = mk(mkText('body', { text:'Corpo do texto', size:40 }), .5, .35);
    RT.picks = new Set([t1.id, t2.id]); RT.selected = t1.id; flowToggle();
    window.__frame = t1.grp;
    // cartão (Caixa) e botão soltos, fora do frame
    selectBg(); const bx = addBox(); bx.text = 'acesse'; setPos(bx, .5, .8);
    selectBg(); const cta = mk(mkCta({ text:'acesse', bg:'#a6e22e', color:'#003322' }), .5, .9);
    window.__ids = { box:bx.id, boxG:bx.grp, cta:cta.id };
    T = 3; changed({ layers:true, props:true }); selectBg();
  });
  const pickFrame = gid => p.evaluate(gid => { selectGroup(gid); renderLayers(); renderProps(); }, gid);
  const ids = await p.evaluate(() => ({ ...window.__ids, frame:window.__frame }));
  const props = (id, ks) => p.evaluate(([id, ks]) => { const L = S.layers.find(l => l.id === id); return Object.fromEntries(ks.map(k => [k, L[k]])); }, [id, ks]);
  const lastPasted = () => p.evaluate(() => RT.selected);

  // 1) botão copiado e colado com o frame escolhido
  await p.evaluate(id => { RT.picks = new Set([id]); RT.selected = id; renderLayers(); renderProps(); }, ids.cta);
  const antes = await props(ids.cta, ['type', 'bg', 'color', 'radius', 'padX', 'padY', 'size', 'text']);
  await p.keyboard.press('Control+C'); await p.waitForTimeout(150);
  await pickFrame(ids.frame); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  const c1 = await lastPasted();
  confere('botão colado no frame mantém as propriedades', await props(c1, Object.keys(antes)), antes);
  confere('botão colado entrou no frame', await p.evaluate(([id, g]) => ginside(S.layers.find(l => l.id === id).grp, g), [c1, ids.frame]), true);

  // 2) Caixa (frame pintado de um item) copiada e colada no frame
  await p.evaluate(g => { selectGroup(g); renderLayers(); renderProps(); }, ids.boxG);
  const gAntes = await p.evaluate(g => { const m = S.groups[g]; return { fill:m.fill, radius:m.radius, flow:!!m.flow }; }, ids.boxG);
  await p.keyboard.press('Control+C'); await p.waitForTimeout(150);
  await pickFrame(ids.frame); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  const c2 = await lastPasted();
  const gDep = await p.evaluate(id => { const L = S.layers.find(l => l.id === id), m = S.groups[L.grp] || {}; return { fill:m.fill, radius:m.radius, flow:!!m.flow }; }, c2);
  confere('Caixa colada no frame mantém o frame pintado', gDep, gAntes);
  confere('Caixa colada é frame de dentro', await p.evaluate(([id, g]) => { const L = S.layers.find(l => l.id === id); return L.grp !== g && ginside(L.grp, g); }, [c2, ids.frame]), true);
  // 3) algo fora do frame e acima dele na pilha cobre o fim da coluna: a cópia não pode ficar escondida (o frame sobe)
  const cobre = await p.evaluate(() => { selectBg(); const s = mkShape({ kind:'rect', size:.9, mh:.9 }); s.start = 0; s.end = S.duration; addLayer(s, { x:.5, y:.6 }); return s.id; });
  await p.evaluate(id => { RT.picks = new Set([id]); RT.selected = id; renderLayers(); renderProps(); }, ids.cta);
  await p.keyboard.press('Control+C'); await p.waitForTimeout(150);
  await pickFrame(ids.frame); await p.keyboard.press('Control+V'); await p.waitForTimeout(300);
  const c3 = await lastPasted();
  confere('cópia colada fica acima de quem a cobria', await p.evaluate(([id, s]) => S.layers.findIndex(l => l.id === id) > S.layers.findIndex(l => l.id === s), [c3, cobre]), true);
  confere('frame continua com os itens juntos na pilha', await p.evaluate(g => { const ix = gleaves(g).map(l => S.layers.indexOf(l)); return Math.max(...ix) - Math.min(...ix) + 1 === ix.length; }, ids.frame), true);
  await p.keyboard.press('Control+Z'); await p.waitForTimeout(200);
  confere('Ctrl+Z desfaz colar e subir juntos', await p.evaluate(id => !S.layers.some(l => l.id === id), c3), true);
  await b.close();
  console.log(falhas ? falhas + ' falha(s)' : 'tudo ok');
  process.exit(falhas ? 1 : 0);
})();
