// Teste no navegador: efeitos sonoros como camadas (pedido do usuário: sons melhores nas animações e apagar de onde quiser, cada um
// numa camada separada). Trilha → "Sutis" põe um som em cada animação de entrada (sopro no deslize, pop por palavra na mola,
// digitação), no grupo "Efeitos sonoros" da timeline; a mistura (a mesma da prévia e do MP4) tem som onde eles estão e silêncio no
// resto. Clicar no som na timeline abre o painel dele; Delete apaga só ele (e ele não volta sozinho); trocar o som pelo painel;
// o som anda junto com o elemento, arrastar a barra do som adianta/atrasa só ele; apagar o elemento leva o som; Ctrl+Z volta;
// "Efeito sonoro" em Adicionar põe um solto na agulha; "Desligados" tira só os automáticos; arquivo antigo com os sons ligados
// ganha as camadas ao abrir; adicionar com um som escolhido não entra no grupo dos sons.
// Rodar: node testes/efeitos-sonoros.js (prints na pasta temporária, mola-testes/sfx-*.png)
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
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; S.sfx = 'off'; S.still = false; S.duration = 8; T = 0;
    changed({ layers:true, props:true }); renderTimeline();
    const a = addLayer(mkComp('title')); Object.assign(a, { name:'Título', in:'slide', inDur:1, start:.5 });
    const c = addLayer(mkComp('sub')); Object.assign(c, { name:'Subtítulo', in:'springWord', text:'Três palavras aqui', start:2 });
    const d = addLayer(mkComp('kicker')); Object.assign(d, { name:'Chamada', in:'type', text:'NOVIDADE', start:4 });
    RT.picks = new Set(); RT.selected = null; changed({ layers:true, props:true }); renderTimeline(); renderAudio();
    foldReveal($('#audioBox'));
  });
  const fx = () => p.evaluate(() => S.layers.filter(l => l.type === 'sfx').map(l => ({ id:l.id, sk:l.sk, name:l.name, s:l.start, e:l.end, sn:l.sn, links:l.links, grp:l.grp, auto:l.auto })));

  // 1) Trilha → Sutis
  await p.locator('#audioBox button', { hasText:'Sutis' }).click(); await p.waitForTimeout(300);
  let L = await fx();
  const by = k => L.find(o => o.sk === k);
  ok(L.length === 3 && by('whoosh') && by('pop') && by('tick'), 'Sutis: um som para cada entrada (sopro, pop, digitação)', L);
  ok(by('pop') && by('pop').sn === 3, 'Mola por palavra: um pop por palavra', by('pop'));
  ok(by('tick') && by('tick').sn >= 5, 'digitação: uma batida por letra', by('tick'));
  ok(L.every(o => o.grp && o.grp === L[0].grp) && await p.evaluate(g => S.groups[g].name, L[0].grp) === 'Efeitos sonoros', 'todos no grupo "Efeitos sonoros"', L);
  const vis = await p.evaluate(ids => ids.map(id => !!document.querySelector(`#tl .tl-row[data-id="${id}"] .tl-bar`) && !!document.querySelector(`#layers [data-id="${id}"]`)), L.map(o => o.id));
  ok(vis.every(Boolean), 'cada som tem barra na timeline e linha na lista de camadas', vis);
  const st = await p.evaluate(() => { const g = Object.keys(S.groups).find(k => S.groups[k].sfx); return S.sfx + '|' + !!g; });
  ok(st === 'soft|true', 'S.sfx = soft', st);
  await p.screenshot({ path:path.join(outDir, 'sfx-timeline.png') });

  // a mistura: som onde estão, silêncio no resto, igual nas duas vezes
  const mix = () => p.evaluate(async () => {
    const m = await buildMix(48000, S.duration), d = m.getChannelData(0), r = (a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * 48000); i < b * 48000; i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); };
    let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    return { whoosh:+r(.45, 1.2).toFixed(4), pop:+r(2, 2.9).toFixed(4), tick:+r(4, 5).toFixed(4), quiet:+r(6.8, 7.9).toFixed(5), pk:+pk.toFixed(3), sum:+d.reduce((a, v) => a + Math.abs(v), 0).toFixed(3) };
  });
  const m1 = await mix(), m1b = await mix();
  ok(m1.whoosh > .005 && m1.pop > .005 && m1.tick > .003, 'a mistura tem som onde estão os efeitos', m1);
  ok(m1.quiet < 1e-4, 'e silêncio onde não há nenhum', m1);
  ok(m1.pk < 1, 'sem estourar', m1);
  ok(m1.sum === m1b.sum, 'a mistura sai igual nas duas vezes (determinística)', [m1.sum, m1b.sum]);

  // 2) clicar no pop na timeline: painel do efeito
  const pop = by('pop');
  // (o aviso de baixo cobre a timeline por uns segundos: o clique do Playwright espera ele sair)
  await p.locator(`#tl .tl-row[data-id="${pop.id}"] .tl-bar`).click({ timeout:9000 }); await p.waitForTimeout(250);
  const pan = await p.evaluate(() => ({ sel:selL() && selL().type, txt:$('#props').textContent }));
  ok(pan.sel === 'sfx' && pan.txt.includes('Efeito sonoro') && pan.txt.includes('Batidas') && pan.txt.includes('Ouvir') && pan.txt.includes('Seguir o elemento'), 'clicar no som na timeline abre o painel dele', pan.txt.slice(0, 120));
  await p.screenshot({ path:path.join(outDir, 'sfx-painel.png') });

  // 3) Delete apaga só ele, e ele não volta sozinho
  await p.keyboard.press('Delete'); await p.waitForTimeout(250);
  L = await fx();
  ok(L.length === 2 && !by('pop'), 'Delete apaga só aquele som', L.map(o => o.sk));
  const sub = await p.evaluate(() => { const s = S.layers.find(l => l.name === 'Subtítulo'); changed(); return { has:!!s, no:s && s.nosfx, n:S.layers.filter(l => l.type === 'sfx').length }; });
  ok(sub.has && sub.no && sub.n === 2, 'o texto continua e o som apagado não volta sozinho', sub);
  const m2 = await mix();
  ok(m2.pop < 1e-4 && m2.whoosh > .005, 'a mistura fica sem o pop e com os outros', m2);

  // 4) trocar o som pelo painel: Sopro → Brilho
  const wh = by('whoosh');
  await p.evaluate(id => { RT.picks = new Set([id]); RT.selected = id; renderProps(); }, wh.id);
  await p.locator('#props .chip', { hasText:'Brilho' }).click(); await p.waitForTimeout(250);
  const sw = await p.evaluate(id => { const A = S.layers.find(l => l.id === id); return { sk:A.sk, name:A.name, fix:A.skFix }; }, wh.id);
  ok(sw.sk === 'shine' && sw.name.startsWith('Brilho') && sw.fix, 'o painel troca o som (e o nome junto)', sw);

  // 5) o som anda junto com o elemento; arrastar a barra do som mexe só nele
  const mv = await p.evaluate(id => {
    const A = S.layers.find(l => l.id === id), T_ = S.layers.find(l => l.name === 'Título'), s0 = A.start;
    pushUndo(); T_.start += .5; changed(); return { d:+(A.start - s0).toFixed(3) };
  }, wh.id);
  ok(Math.abs(mv.d - .5) < .002, 'mexer o elemento leva o som junto', mv);
  const b2 = await p.locator(`#tl .tl-row[data-id="${wh.id}"] .tl-bar`).boundingBox();
  const t0 = await p.evaluate(id => [S.layers.find(l => l.id === id).start, S.layers.find(l => l.name === 'Título').start], wh.id);
  await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await p.mouse.down();
  await p.mouse.move(b2.x + b2.width / 2 + 25, b2.y + b2.height / 2, { steps:6 }); await p.mouse.move(b2.x + b2.width / 2 + 50, b2.y + b2.height / 2, { steps:6 }); await p.mouse.up(); await p.waitForTimeout(250);
  const t1 = await p.evaluate(id => [S.layers.find(l => l.id === id).start, S.layers.find(l => l.name === 'Título').start], wh.id);
  ok(t1[0] > t0[0] + .05 && Math.abs(t1[1] - t0[1]) < 1e-6, 'arrastar a barra do som atrasa só o som', { t0, t1 });
  const mv2 = await p.evaluate(id => { const A = S.layers.find(l => l.id === id), T_ = S.layers.find(l => l.name === 'Título'), off = A.start - T_.start; pushUndo(); T_.start += .3; changed(); return +(A.start - T_.start - off).toFixed(3); }, wh.id);
  ok(Math.abs(mv2) < .002, 'depois de arrastado, o som continua seguindo o elemento com o mesmo atraso', mv2);

  // 6) apagar o elemento leva o som; Ctrl+Z volta os dois
  await p.evaluate(() => { const T_ = S.layers.find(l => l.name === 'Título'); select(T_.id); });
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Delete'); await p.waitForTimeout(250);
  L = await fx();
  ok(!L.some(o => o.id === wh.id), 'apagar o elemento leva o som dele', L.map(o => o.name));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  L = await fx();
  ok(L.some(o => o.id === wh.id) && await p.evaluate(() => S.layers.some(l => l.name === 'Título')), 'Ctrl+Z traz o elemento e o som de volta', L.map(o => o.name));

  // 7) Adicionar → Efeito sonoro: um solto na agulha
  await p.evaluate(() => { pause(); T = 6.2; RT.userSeek = true; });
  await p.locator('#adds button.add', { hasText:'Efeito sonoro' }).click(); await p.waitForTimeout(300);
  const lo = await p.evaluate(() => { const A = selL(); return A && { type:A.type, start:A.start, links:A.links, auto:A.auto, grp:A.grp && S.groups[A.grp].sfx }; });
  ok(lo && lo.type === 'sfx' && Math.abs(lo.start - 6.2) < .01 && !lo.links && !lo.auto && lo.grp, 'Efeito sonoro em Adicionar entra solto na agulha, no grupo dos sons', lo);
  // adicionar outra coisa com um som escolhido não entra no grupo dos sons
  const ins = await p.evaluate(() => { const L_ = addLayer(mkComp('sub')); return { grp:L_.grp || null }; });
  ok(!ins.grp, 'adicionar com um som escolhido não entra no grupo "Efeitos sonoros"', ins);

  // 8) Desligados tira só os automáticos
  await p.locator('#audioBox button', { hasText:'Desligados' }).click(); await p.waitForTimeout(300);
  L = await fx();
  ok(L.length === 1 && !L[0].auto, 'Desligados tira os automáticos e deixa o que foi posto à mão', L.map(o => o.name));
  // e o texto novo não ganha som enquanto está desligado
  ok(await p.evaluate(() => { changed(); return S.layers.filter(l => l.type === 'sfx').length; }) === 1, 'desligado, nada ganha som sozinho');

  // 9) arquivo antigo com "Sons nas entradas" ligado: as camadas aparecem ao abrir
  const mig = await p.evaluate(async () => {
    const old = JSON.parse(JSON.stringify(S)); old.layers = old.layers.filter(l => l.type !== 'sfx'); for (const l of old.layers) delete l.nosfx; old.sfx = 'punchy';
    for (const g of Object.keys(old.groups || {})) if (old.groups[g].sfx) delete old.groups[g];
    await openState(old, newFileId(), 'antigo');
    return S.layers.filter(l => l.type === 'sfx').map(l => l.sk);
  });
  ok(mig.length >= 3 && mig.includes('pop') && mig.includes('tick'), 'arquivo antigo com sons ligados ganha as camadas ao abrir', mig);

  // 10) cada som renderiza sem erro e sem NaN
  const all = await p.evaluate(async () => {
    const out = {};
    for (const k of Object.keys(SFXK)) { const b = await sfxRender({ sk:k, start:0, end:.8, sn:3, sseed:5 }, 48000), c = b.getChannelData(0); let pk = 0, bad = 0; for (const v of c) { if (!isFinite(v)) bad++; pk = Math.max(pk, Math.abs(v)); } out[k] = { pk:+pk.toFixed(3), bad }; }
    return out;
  });
  ok(Object.values(all).every(o => o.bad === 0 && o.pk > .02 && o.pk < 1.2), 'todos os sons saem (sem NaN, sem estourar)', all);

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
