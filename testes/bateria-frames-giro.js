// Bateria no navegador: frames (com e sem layout, um dentro do outro), giro, seleção e edição, com cliques e teclas de verdade.
// Cada cenário abre o editor limpo. "FALHA" = comportamento errado; "nota" = limitação (não conta como falha).
// Rodar: node testes/bateria-frames-giro.js   (prints em testes/bateria-frames-giro/)
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOTS = path.resolve(__dirname, 'bateria-frames-giro'); fs.mkdirSync(SHOTS, { recursive:true });
let falhas = 0, notas = [], cenario = '';
const confere = (nome, real, esperado) => {
  const ok = typeof esperado === 'function' ? esperado(real) : JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : `\n      esperado ${typeof esperado === 'function' ? esperado.toString() : JSON.stringify(esperado)}\n      veio     ${JSON.stringify(real)}`));
  return ok;
};
const nota = t => { notas.push(cenario + ': ' + t); console.log('nota  ' + t); };

// funções que vivem na página
const HELP = () => {
  window.__T = {
    scr(q) { const r = cv.getBoundingClientRect(); return { x:r.left + q.x / FW() * r.width, y:r.top + q.y / H() * r.height }; },
    L(n) { return S.layers.find(l => l.name === n); },
    // centro de uma camada como aparece (com giro de grupo e câmera), na tela
    cen(n) { const L = this.L(n), b = L && L._bounds; if (!b) return null; return this.scr(camFwd(camOf(L), { x:b.x + b.w / 2, y:b.y + b.h / 2 })); },
    st() { const pk = pickedLayers().map(l => l.name).sort(); return { pk, whole:wholeGroup() || null, frs:frSel() || null, item:itemSel(), sel:(selL() || {}).name || null }; },
    gname(g) { return g && (S.groups[g] || {}).name; },
    // ponto logo fora da quina NE da seleção (onde o Figma gira) e o que o editor faz ali
    rotSpot(k = 'ne') {
      const hs = handlesOf(selL()), t = rotTarget();
      const cs = hs.filter(h => h.hx && h.hy); if (cs.length < 4) return { t:!!t, hs:hs.length };
      const c = { x:cs.reduce((n, h) => n + h.x, 0) / 4, y:cs.reduce((n, h) => n + h.y, 0) / 4 }, q0 = cs.find(h => h.k === k);
      const dx = q0.x - c.x, dy = q0.y - c.y, d = Math.hypot(dx, dy), o = hRad() * 1.9;
      const q = { x:q0.x + dx / d * o, y:q0.y + dy / d * o }, hit = handleAt(q);
      return { t:!!t, hs:hs.length, q, c, hit:hit ? hit.k : null, sq:this.scr(q), sc:this.scr(c) };
    },
    rotNow() { const t = rotTarget(); if (!t) return null; return t.gid ? +(S.groups[t.gid].rot || 0) : +(t.L.rot || 0); },
    gidOf(n) { return this.L(n).grp; },
  };
};

async function abre(b) {
  const ctx = await b.newContext({ viewport:{ width:1500, height:950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => {
    const pilha = String(e.stack || '').split('\n').slice(1, 4).join(' | ');
    if (/googletagmanager|gtm\.js|clarity\.ms/.test(pilha)) { console.log('aviso (script de análise de fora, não é do Mola) ' + e.message); return; }
    falhas++; console.log('ERRO (página) ' + e.message + '  @ ' + pilha);
  });
  p.on('console', m => { if (m.type() === 'error' && !/favicon|net::|Failed to load resource|fonts\.g/i.test(m.text())) console.log('console.error ' + m.text().slice(0, 200)); });
  await p.goto(url); await p.waitForTimeout(1300);
  await p.evaluate(HELP);
  return p;
}
const ev = (p, f, a) => p.evaluate(f, a);
const add = async (p, titulo) => { await p.click(`button.add[title="${titulo}"]`); await p.waitForTimeout(350); };
const nomeia = (p, n) => ev(p, n => { const L = selL(); L.name = n; changed({ layers:true }); }, n);
const todos0 = p => ev(p, () => { S.layers.forEach(l => { if (l.type !== 'bg') { l.start = 0; } }); T = 2.5; RT.userSeek = true; changed({ layers:true }); });
const clique = async (p, q, mods = []) => { for (const m of mods) await p.keyboard.down(m); await p.mouse.click(q.x, q.y); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(260); };
const duplo = async (p, q) => { await p.mouse.dblclick(q.x, q.y); await p.waitForTimeout(320); };
const esc = async p => { await p.mouse.move(5, 5); await p.keyboard.press('Escape'); await p.waitForTimeout(200); };
const st = p => ev(p, () => __T.st());
const cen = (p, n) => ev(p, n => __T.cen(n), n);
// gira arrastando da zona de giro em volta do centro visual da seleção, `graus` no sentido horário
async function gira(p, graus) {
  const s = await ev(p, () => __T.rotSpot());
  if (s.hit !== 'rot') return { ok:false, s };
  const r0 = await ev(p, () => __T.rotNow());
  const { sq, sc } = s, a0 = Math.atan2(sq.y - sc.y, sq.x - sc.x), R = Math.hypot(sq.x - sc.x, sq.y - sc.y);
  await p.mouse.move(sq.x, sq.y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { const a = a0 + graus * Math.PI / 180 * i / 10; await p.mouse.move(sc.x + Math.cos(a) * R, sc.y + Math.sin(a) * R); }
  await p.mouse.up(); await p.waitForTimeout(250);
  const r1 = await ev(p, () => __T.rotNow());
  return { ok:true, d:r1 == null || r0 == null ? null : r1 - r0, r1 };
}
const shot = (p, n) => p.screenshot({ path:path.join(SHOTS, n + '.png') });
const perto = (a, b, tol = 4) => !!a && !!b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

const CENARIOS = {
  // 1. Caixa (texto dentro de um frame com layout)
  async caixa(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'TxtCaixa'); await todos0(p); await esc(p);
    const c = await cen(p, 'TxtCaixa');
    await clique(p, c);
    let s = await st(p); confere('clique no texto da caixa escolhe a Caixa (frame)', [s.pk.join(), await ev(p, g => __T.gname(g), s.whole)], ['TxtCaixa', 'Caixa']);
    const g = await gira(p, 30);
    confere('a Caixa gira pela quina (30°)', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    const c2 = await cen(p, 'TxtCaixa');
    await clique(p, c2); s = await st(p);
    confere('Caixa girada: clique no texto ainda escolhe a Caixa', !!s.whole, true);
    await duplo(p, c2);
    const ed = await ev(p, () => !!SED.el);
    confere('Caixa girada: clique duplo abre a edição do texto', ed, true);
    if (ed) {
      const geo = await ev(p, () => { const r = SED.el.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2, tf:getComputedStyle(SED.el).transform }; });
      confere('campo de edição fica em cima do texto girado', perto(geo, c2, 10), true) || console.log('       campo', geo, 'texto', c2);
      await shot(p, 'caixa-girada-editando');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    }
    // arrastar a Caixa girada: anda junto com o mouse
    await esc(p); await clique(p, c2);
    const a0 = await cen(p, 'TxtCaixa');
    await p.mouse.move(a0.x, a0.y); await p.mouse.down(); await p.mouse.move(a0.x + 40, a0.y + 30, { steps:6 }); await p.mouse.move(a0.x + 80, a0.y + 60, { steps:6 }); await p.mouse.up(); await p.waitForTimeout(300);
    const a1 = await cen(p, 'TxtCaixa');
    confere('Caixa girada anda com o mouse (80, 60)', a1 && [Math.round(a1.x - a0.x), Math.round(a1.y - a0.y)], v => v && Math.abs(v[0] - 80) < 6 && Math.abs(v[1] - 60) < 6);
    // desfazer o arrasto e o giro
    await p.keyboard.press('Control+z'); await p.waitForTimeout(200); await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
    confere('Ctrl+Z duas vezes volta o giro a 0', await ev(p, () => +(S.groups[__T.gidOf('TxtCaixa')].rot || 0)), 0);
    await shot(p, 'caixa-fim');
  },

  // 2. Dois textos -> Shift+A (frame com layout), giro do frame e do item
  async doisTextos(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'T1');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'T2'); await todos0(p); await esc(p);
    const c1 = await cen(p, 'T1'), c2 = await cen(p, 'T2');
    await clique(p, c1); await clique(p, c2, ['Shift']);
    confere('Shift + clique escolhe os dois textos', (await st(p)).pk, ['T1', 'T2']);
    const g0 = await gira(p, 20);
    if (!g0.ok) nota('dois elementos soltos escolhidos não giram (no Figma giram juntos)');
    else if (g0.ok) await p.keyboard.press('Control+z');
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400);
    let s = await st(p); confere('Shift+A põe os dois num frame (seleção = frame)', !!s.whole, true);
    await esc(p); await clique(p, await cen(p, 'T1'));
    s = await st(p); confere('clique num texto do frame escolhe o frame', [s.pk.join(), !!s.whole], ['T1,T2', true]);
    const g = await gira(p, -25); confere('frame com layout gira (-25°)', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (-25)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    const q1 = await cen(p, 'T1'); await duplo(p, q1);
    s = await st(p); confere('clique duplo entra no texto (só T1)', [s.pk.join(), s.whole], ['T1', null]);
    const ed = await ev(p, () => !!SED.el);
    if (ed) { nota('clique duplo no item do frame já abriu a edição (esperado: só escolher)'); await p.keyboard.press('Escape'); }
    const gi = await gira(p, 15); confere('texto de dentro do frame girado também gira (15°)', gi.ok && Math.round(gi.d), v => typeof v === 'number' && Math.abs(v - 15) <= 1.5) || console.log('      ', JSON.stringify(gi.s || gi));
    confere('girar o texto não mexe no giro do frame', await ev(p, () => Math.round(S.groups[__T.gidOf('T1')].rot || 0)), -25);
    // alças do frame: os lados existem (mudam o tamanho)
    await esc(p); await clique(p, await cen(p, 'T2'));
    confere('frame escolhido tem 8 alças (lados = tamanho)', await ev(p, () => handlesOf(selL()).length), 8);
    await shot(p, 'dois-textos-fim');
  },

  // 3. Frame dentro de frame: duas Caixas + Shift+A
  async aninhado(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'A'); await esc(p);
    await add(p, 'Adicionar caixa'); await nomeia(p, 'B'); await todos0(p); await esc(p);
    // separa as caixas para não se sobreporem
    await ev(p, () => { const a = __T.L('A'), b = __T.L('B'); a.y = .35; b.y = .6; a.x = b.x = .5; changed({ layers:true }); });
    await p.waitForTimeout(300);
    await clique(p, await cen(p, 'A')); await clique(p, await cen(p, 'B'), ['Shift']);
    confere('Shift + clique nas duas Caixas', (await st(p)).pk, ['A', 'B']);
    const gab = await gira(p, 10);
    if (!gab.ok) nota('duas Caixas escolhidas (Shift + clique) não giram juntas');
    else await p.keyboard.press('Control+z');
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400);
    const outer = await ev(p, () => gpar(__T.gidOf('A')));
    confere('Shift+A com duas Caixas: elas viram filhas de um frame novo', !!outer && outer === (await ev(p, () => gpar(__T.gidOf('B')))), true);
    await esc(p); await clique(p, await cen(p, 'A'));
    let s = await st(p); confere('clique escolhe o frame de fora', s.whole, outer);
    let g = await gira(p, 12); confere('frame de fora gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (12)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await duplo(p, await cen(p, 'A'));
    s = await st(p); confere('clique duplo desce para a Caixa A', [s.pk.join(), await ev(p, g => __T.gname(g), s.whole)], ['A', 'Caixa']);
    g = await gira(p, 20); confere('Caixa A (dentro do frame girado) gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (20)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // Shift + clique na Caixa B: duas Caixas sem o frame de fora
    await clique(p, await cen(p, 'B'), ['Shift']);
    s = await st(p); confere('Shift + clique soma a Caixa B (sem o de fora)', [s.pk.join(), (s.frs || []).length], ['A,B', 2]);
    const g2 = await gira(p, 10);
    if (!g2.ok) nota('duas Caixas irmãs escolhidas (sem o de fora) não giram');
    await esc(p); await clique(p, await cen(p, 'A'));
    await duplo(p, await cen(p, 'A')); await duplo(p, await cen(p, 'A'));
    s = await st(p); confere('segundo clique duplo: o texto A sozinho', [s.pk.join(), s.whole], ['A', null]);
    const edA = await ev(p, () => !!SED.el);
    confere('Caixa de um texto só: o 2º clique duplo já abre a edição', edA, true);
    if (edA) { const geo = await ev(p, () => { const r = SED.el.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; });
      confere('campo de edição em cima do texto (dois giros somados)', perto(geo, await cen(p, 'A'), 10), true) || console.log('       campo', geo, 'texto', await cen(p, 'A'));
      await shot(p, 'aninhado-editando'); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    g = await gira(p, -10); confere('texto dentro de Caixa dentro de frame (ambos girados) gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (-10)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // o clique continua acertando o texto depois de tudo girado
    await esc(p); await esc(p);
    const qa = await cen(p, 'A'); await clique(p, qa);
    s = await st(p); confere('depois de girar tudo, clique no texto A ainda pega o frame de fora', s.whole, outer);
    await shot(p, 'aninhado-fim');
  },

  // 4. Grupo sem layout (Ctrl+G)
  async grupo(p) {
    await add(p, 'Adicionar forma'); await nomeia(p, 'F1');
    await add(p, 'Adicionar forma'); await nomeia(p, 'F2'); await todos0(p);
    await ev(p, () => { const a = __T.L('F1'), b = __T.L('F2'); a.x = .35; b.x = .65; a.y = b.y = .5; a.size = b.size = .2; a.mh = b.mh = .2; changed({ layers:true }); });
    await esc(p); await p.waitForTimeout(250);
    await clique(p, await cen(p, 'F1')); await clique(p, await cen(p, 'F2'), ['Shift']);
    await p.keyboard.press('Control+g'); await p.waitForTimeout(300);
    await esc(p); await clique(p, await cen(p, 'F1'));
    let s = await st(p); confere('clique numa forma do grupo escolhe o grupo', [s.pk.join(), !!s.whole], ['F1,F2', true]);
    let g = await gira(p, 45); confere('grupo sem layout gira (45°)', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (45)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await duplo(p, await cen(p, 'F2'));
    s = await st(p); confere('clique duplo: só a forma F2', [s.pk.join(), s.whole], ['F2', null]);
    g = await gira(p, 30); confere('forma dentro do grupo girado gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // escalar o grupo girado pela quina: a quina oposta fica parada
    await esc(p); await clique(p, await cen(p, 'F1'));
    const hs = await ev(p, () => { const h = handlesOf(selL()); const f = k => { const q = h.find(o => o.k === k); return __T.scr(q); }; return { se:f('se'), nw:f('nw') }; });
    await p.mouse.move(hs.se.x, hs.se.y); await p.mouse.down(); await p.mouse.move(hs.se.x + 30, hs.se.y + 30, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(300);
    const nw2 = await ev(p, () => { const h = handlesOf(selL()).find(o => o.k === 'nw'); return h && __T.scr(h); });
    confere('grupo girado escalado pela quina: a quina oposta fica parada', perto(nw2, hs.nw, 3), true) || console.log('       antes', hs.nw, 'depois', nw2);
    await shot(p, 'grupo-fim');
  },

  // 5. Frame de um item só (Shift+A numa forma) e imagem/botão/logo
  async umItemETipos(p) {
    await add(p, 'Adicionar forma'); await nomeia(p, 'Só'); await todos0(p);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400);
    let s = await st(p); confere('Shift+A numa forma: frame de um item', !!s.whole, true);
    let g = await gira(p, 30); confere('frame de um item gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await duplo(p, await cen(p, 'Só'));
    s = await st(p); confere('clique duplo: a forma de dentro', [s.pk.join(), s.whole], ['Só', null]);
    g = await gira(p, 30); confere('forma dentro do frame de um item gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await esc(p);
    for (const [t, n] of [['Adicionar botão', 'Botão'], ['Adicionar imagem', null], ['Adicionar logo', 'Logo']]) {
      if (!n) continue;
      const has = await p.$(`button.add[title="${t}"]`); if (!has) continue;
      await add(p, t); await todos0(p);
      const r = await ev(p, () => ({ t:!!rotTarget(), type:selL() && selL().type }));
      if (!r.t) nota(`${n} (${r.type}) sozinho não tem giro (só forma, texto e grupo giram)`);
      await esc(p);
    }
    // imagem: camada de imagem sem arquivo
    const ri = await ev(p, () => { const L = addLayer(mkComp('image')); return { t:!!rotTarget(), type:L.type }; });
    if (!ri.t) nota('imagem sozinha não tem giro');
    await shot(p, 'um-item-fim');
  },

  // 6. Frame com item bloqueado / oculto
  async bloqueado(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'B1');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'B2'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'B1')); await clique(p, await cen(p, 'B2'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400);
    await ev(p, () => { __T.L('B2').locked = true; changed({ layers:true }); });
    await esc(p); await clique(p, await cen(p, 'B1'));
    const s = await st(p);
    const g = await gira(p, 20);
    if (!g.ok) nota(`frame com um item bloqueado não gira (seleção ${JSON.stringify(s.pk)}, sem aviso)`);
    await esc(p);
    await ev(p, () => { __T.L('B2').locked = false; __T.L('B2').visible = false; changed({ layers:true }); });
    await clique(p, await cen(p, 'B1'));
    const g2 = await gira(p, 20);
    confere('frame com item oculto ainda gira', g2.ok && Math.round(g2.d), v => typeof v === 'number' && Math.abs(v - 20) <= 1.5) || console.log('      ', JSON.stringify(g2.s || g2), JSON.stringify(await st(p)));
  },

  // 7. Item que já saiu da tela (agulha depois do fim dele)
  async foraDoTempo(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'Cedo');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'Tarde'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Cedo')); await clique(p, await cen(p, 'Tarde'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400);
    await ev(p, () => { __T.L('Cedo').end = 1.5; T = 3; changed({ layers:true }); });
    await esc(p); await p.waitForTimeout(250);
    await clique(p, await cen(p, 'Tarde'));
    const s = await st(p); confere('agulha depois do fim de um item: clique escolhe o frame', !!s.whole, true);
    const g = await gira(p, 20);
    confere('frame com um item fora do tempo gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (20)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // só um item sozinho visível: as alças ainda são do frame?
    confere('frame com um item fora do tempo tem alças', await ev(p, () => handlesOf(selL()).length), n => n >= 4);
  },

  // 8. Outro formato (não é o principal)
  async outroFormato(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Fmt'); await todos0(p); await esc(p);
    const fmts = null, alvo = await ev(p, () => S.format === '1x1' ? '9:16' : '1:1');
    await p.click(`#fmt button:text-is("${alvo}")`); await p.waitForTimeout(600);
    confere('formato trocado pelo botão', await ev(p, () => FORMATS[S.format].label), alvo);
    await clique(p, await cen(p, 'Fmt'));
    const s = await st(p); confere(`no ${alvo} clique escolhe a Caixa`, !!s.whole, true);
    const g = await gira(p, 30); confere(`no ${alvo} a Caixa gira`, g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g), fmts);
    // arrastar no formato secundário e voltar ao principal: o principal não se mexe
    const base = await ev(p, () => S.base);
    const a0 = await cen(p, 'Fmt');
    await p.mouse.move(a0.x, a0.y); await p.mouse.down(); await p.mouse.move(a0.x + 50, a0.y, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(300);
    const a1 = await cen(p, 'Fmt');
    confere(`no ${alvo} a Caixa girada anda com o mouse`, a1 && Math.round(a1.x - a0.x), v => Math.abs(v - 50) < 6);
    await shot(p, 'outro-formato');
  },

  // 9. Carrossel: Caixa no slide 2
  async carrossel(p) {
    await ev(p, () => setSlides(2)); await p.waitForTimeout(400);
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Car'); await todos0(p);
    await ev(p, () => { const L = __T.L('Car'); L.x = 1.5; changed({ layers:true }); zoomFit(); }); await esc(p); await p.waitForTimeout(400);
    await clique(p, await cen(p, 'Car'));
    const s = await st(p); confere('carrossel: clique na Caixa do slide 2 escolhe o frame', !!s.whole, true);
    const g = await gira(p, 30); confere('carrossel: Caixa do slide 2 gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await duplo(p, await cen(p, 'Car'));
    const ed = await ev(p, () => !!SED.el);
    confere('carrossel: clique duplo na Caixa girada abre a edição', ed, true);
    if (ed) {
      const geo = await ev(p, () => { const r = SED.el.getBoundingClientRect(); return { x:r.left + r.width / 2, y:r.top + r.height / 2 }; });
      confere('carrossel: campo de edição em cima do texto', perto(geo, await cen(p, 'Car'), 10), true) || console.log('       campo', geo);
      await p.keyboard.press('Escape');
    }
    await shot(p, 'carrossel');
  },

  // 10. Zoom no palco
  async zoom(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Zm'); await todos0(p); await esc(p);
    const zc = await cen(p, 'Zm'); await ev(p, c => setZoom(3, c.x, c.y), zc); await p.waitForTimeout(700);
    await clique(p, await cen(p, 'Zm'));
    const s = await st(p); confere('zoom 3: clique escolhe a Caixa', !!s.whole, true);
    const g = await gira(p, 30); confere('zoom 3: Caixa gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await shot(p, 'zoom');
  },

  // 11. Copiar/colar e duplicar uma Caixa girada
  async copiaGirada(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Cp'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Cp')); await gira(p, 30);
    await p.keyboard.press('Control+d'); await p.waitForTimeout(400);
    const r = await ev(p, () => { const gs = S.layers.filter(l => l.type === 'text').map(l => l.grp); return gs.map(g => Math.round(S.groups[g].rot || 0)); });
    confere('Ctrl+D na Caixa girada: a cópia continua girada', r, v => v.length === 2 && v.every(x => x === 30));
    await esc(p); await clique(p, await cen(p, 'Cp'));
    const n0 = await ev(p, () => S.layers.length);
    await p.keyboard.press('Control+c'); await p.waitForTimeout(150); await p.keyboard.press('Control+v'); await p.waitForTimeout(500);
    const r2 = await ev(p, () => S.layers.filter(l => l.type === 'text').map(l => Math.round(S.groups[l.grp].rot || 0)));
    confere('Ctrl+C / Ctrl+V da Caixa girada: entra mais uma girada', [await ev(p, () => S.layers.length) - n0, r2.every(x => x === 30)], [1, true]);
  },

  // 12. Inserir no frame girado e mexer no item de dentro
  async inserirNoGirado(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'In'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'In')); await gira(p, 30);
    const gid = await ev(p, () => __T.gidOf('In'));
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'In2');
    confere('Adicionar com a Caixa girada escolhida: entra dentro dela', await ev(p, () => __T.L('In2').grp), gid);
    await todos0(p);
    // o novo item aparece girado junto (centro do item novo segue o giro do frame)
    const ang = await ev(p, () => { const L = __T.L('In2'), c = camOf(L); return c ? Math.round(c.ga * 180 / Math.PI) : 0; });
    confere('item novo no frame girado aparece girado junto', ang, 30);
    // setas: com o item de dentro sozinho escolhido, setas trocam a ordem (não giram nada)
    await esc(p); await clique(p, await cen(p, 'In')); await duplo(p, await cen(p, 'In2'));
    const s = await st(p); confere('clique duplo no item novo escolhe só ele', s.pk, ['In2']);
    await shot(p, 'inserir-girado');
  },

  // 14. Uso natural (sem acertar o tempo): Caixa e depois Título (entra dentro da Caixa escolhida), agulha onde o app deixa
  async natural(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Nc');
    await add(p, 'Adicionar título'); await nomeia(p, 'Nt');
    const gid = await ev(p, () => __T.gidOf('Nc'));
    confere('título adicionado com a Caixa escolhida entra nela', await ev(p, () => __T.L('Nt').grp), gid);
    const info = await ev(p, () => ({ T, nc:phase(__T.L('Nc'), T), nt:phase(__T.L('Nt'), T) }));
    await esc(p);
    const ct = await cen(p, 'Nt');
    if (!ct) { confere('título visível na agulha em que o app deixou', info, () => false); return; }
    await clique(p, ct);
    let s = await st(p); confere('clique no título (agulha natural) escolhe a Caixa', [s.pk.join(), !!s.whole], ['Nc,Nt', true]) || console.log('       ', JSON.stringify(info));
    let g = await gira(p, 30); confere('Caixa com 2 itens gira na agulha natural', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (30)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g), JSON.stringify(info));
    await duplo(p, await cen(p, 'Nt'));
    s = await st(p); confere('clique duplo no título: só ele', s.pk.join(), 'Nt');
    if (await ev(p, () => !!SED.el)) { nota('clique duplo no título de uma Caixa com 2 itens já abre a edição (o CLAUDE.md diz que só escolhe)'); await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    g = await gira(p, 20); confere('título dentro da Caixa girada gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (20)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await shot(p, 'natural');
  },

  // 15. Escolher pela lista de Camadas e pela timeline, e girar no palco
  async listaETimeline(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'L1');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'L2'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'L1')); await clique(p, await cen(p, 'L2'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400); await esc(p);
    // item pela lista
    await p.click('.layer.lcell:has(.lnm:text-is("L2"))'); await p.waitForTimeout(250);
    let s = await st(p); confere('lista: clique no item escolhe só ele (como na timeline)', [s.pk.join(), s.whole], ['L2', null]);
    if (s.whole) { await p.click('.layer.lcell:has(.lnm:text-is("L2"))', { modifiers:['Control'] }); await p.waitForTimeout(250); }
    let g = await gira(p, 15); confere('item escolhido pela lista gira no palco', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (15)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // frame pela lista
    await p.click('.lgroup.lcell >> nth=0'); await p.waitForTimeout(250);
    s = await st(p); confere('lista: clique no cabeçalho escolhe o frame', [s.pk.join(), !!s.whole], ['L1,L2', true]);
    g = await gira(p, 15); confere('frame escolhido pela lista gira no palco', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (15)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    // item pela timeline (barra)
    await esc(p);
    const bar = await p.$('.tl-row:not(.grp):has(.lnm:text-is("L1")) .tl-bar');
    if (bar) {
      const bb = await bar.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(250);
      s = await st(p); confere('timeline: clique na barra do item escolhe só ele', [s.pk.join(), s.whole], ['L1', null]);
      g = await gira(p, 15); confere('item escolhido pela timeline gira no palco', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (15)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    } else confere('acha a barra do item na timeline', false, true);
    await shot(p, 'lista-timeline');
  },

  // 16. No meio da entrada da Caixa (ela entra com "pop")
  async meioDaEntrada(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Me'); await esc(p);
    await ev(p, () => { const L = __T.L('Me'); L.start = 1; const g = S.groups[L.grp]; T = 1 + (g.inDur || .8) * .4; RT.userSeek = true; changed({ layers:true }); });
    await p.waitForTimeout(300);
    const c = await cen(p, 'Me'); await clique(p, c);
    const s = await st(p); confere('no meio da entrada: clique escolhe a Caixa', !!s.whole, true);
    const g = await gira(p, 20); confere('no meio da entrada: a Caixa gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (20)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
  },

  // 17. Alça de lado de um frame girado: o lado oposto fica parado na tela
  async ladoDoGirado(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Ld'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Ld'));
    { // sem giro, o mesmo arrasto (base de comparação)
      const a = await ev(p, () => { const h = handlesOf(selL()), f = k => __T.scr(h.find(o => o.k === k)); return { e:f('e'), w:f('w') }; });
      await p.mouse.move(a.e.x, a.e.y); await p.mouse.down(); await p.mouse.move(a.e.x + 30, a.e.y, { steps:5 }); await p.mouse.move(a.e.x + 60, a.e.y, { steps:5 }); await p.mouse.up(); await p.waitForTimeout(300);
      const b = await ev(p, () => { const h = handlesOf(selL()), f = k => __T.scr(h.find(o => o.k === k)); return { e:f('e'), w:f('w') }; });
      confere('frame sem giro: lado direito acompanha e o esquerdo fica', [perto(b.e, { x:a.e.x + 60, y:a.e.y }, 4), perto(b.w, a.w, 3)], [true, true]) || console.log('       ', a, b);
      await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
    }
    await gira(p, 30);
    const h0 =await ev(p, () => { const h = handlesOf(selL()), f = k => __T.scr(h.find(o => o.k === k)); return { e:f('e'), w:f('w') }; });
    const ang = 30 * Math.PI / 180, d = 60;
    await p.mouse.move(h0.e.x, h0.e.y); await p.mouse.down();
    await p.mouse.move(h0.e.x + Math.cos(ang) * d / 2, h0.e.y + Math.sin(ang) * d / 2, { steps:5 }); await p.mouse.move(h0.e.x + Math.cos(ang) * d, h0.e.y + Math.sin(ang) * d, { steps:5 });
    await p.mouse.up(); await p.waitForTimeout(300);
    const h1 = await ev(p, () => { const h = handlesOf(selL()), f = k => __T.scr(h.find(o => o.k === k)); return { e:f('e'), w:f('w') }; });
    confere('frame girado: puxar o lado direito para fora não mexe no lado esquerdo', perto(h1.w, h0.w, 3), true) || console.log('       w antes', h0.w, 'depois', h1.w);
    confere('frame girado: o lado direito acompanha o mouse', perto(h1.e, { x:h0.e.x + Math.cos(ang) * d, y:h0.e.y + Math.sin(ang) * d }, 6), true) || console.log('       e', h1.e);
    await shot(p, 'lado-do-girado');
  },

  // 18. Reordenar dentro do frame (arrastar e setas), apagar e desfazer
  async reordenar(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'R1');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'R2'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'R1')); await clique(p, await cen(p, 'R2'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400); await esc(p);
    const ys = () => ev(p, () => [__T.cen('R1').y, __T.cen('R2').y]);
    const y0 = await ys(); confere('R1 em cima de R2 no começo', y0[0] < y0[1], true);
    await clique(p, await cen(p, 'R2'), ['Control']);
    confere('Ctrl + clique escolhe só R2', (await st(p)).pk, ['R2']);
    const c2 = await cen(p, 'R2'), c1 = await cen(p, 'R1');
    await p.mouse.move(c2.x, c2.y); await p.mouse.down(); await p.mouse.move(c2.x, (c2.y + c1.y) / 2, { steps:6 }); await p.mouse.move(c2.x, c1.y - 30, { steps:6 }); await p.mouse.up(); await p.waitForTimeout(400);
    const y1 = await ys(); confere('arrastar R2 para cima troca a ordem no frame', y1[1] < y1[0], true);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(300);
    const y2 = await ys(); confere('seta para baixo com R2 sozinho volta a ordem', y2[0] < y2[1], true);
    await p.keyboard.press('Delete'); await p.waitForTimeout(300);
    confere('Delete apaga só R2', await ev(p, () => S.layers.filter(l => l.type === 'text').map(l => l.name)), ['R1']);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
    confere('Ctrl+Z traz R2 de volta para dentro do frame', await ev(p, () => !!__T.L('R2') && __T.L('R2').grp === __T.L('R1').grp), true);
    await esc(p); await clique(p, await cen(p, 'R1'));
    confere('depois do desfazer, clique ainda escolhe o frame inteiro', (await st(p)).pk, ['R1', 'R2']);
  },

  // 19. Espaço interno da Caixa: clique e clique duplo no fundo pintado
  async fundoDaCaixa(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Fd'); await todos0(p); await esc(p);
    const q = await ev(p, () => { const g = __T.gidOf('Fd'), R = frameRect(g); if (!R) return null;
      for (let y = R.y + 6; y < R.y + R.h; y += 3) for (let x = R.x + 6; x < R.x + R.w; x += 3) { const o = { x, y }; if (!hitTest(o) && (frameHitG(o) || {}).g === g) return __T.scr(o); } return null; });
    confere('acha o fundo pintado da Caixa', !!q, true); if (!q) return;
    await clique(p, q);
    confere('clique no fundo da Caixa escolhe a Caixa', !!(await st(p)).whole, true);
    const g = await gira(p, 10); confere('Caixa escolhida pelo fundo gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - (10)) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await p.keyboard.down('Control'); await p.mouse.click((await cen(p, 'Fd')).x, (await cen(p, 'Fd')).y); await p.keyboard.up('Control'); await p.waitForTimeout(250);
    const s = await st(p); confere('Ctrl + clique no texto: só o texto', [s.pk.join(), s.whole], ['Fd', null]);
  },

  // 20. Cartão com foto + texto (frame com layout)
  async fotoNoFrame(p) {
    await ev(p, () => { const L = addLayer(mkComp('image')); L.name = 'Foto'; L.size = .4; L.mh = .25; changed({ layers:true }); });
    await add(p, 'Adicionar título'); await nomeia(p, 'Leg'); await todos0(p);
    await ev(p, () => { __T.L('Foto').y = .35; __T.L('Leg').y = .62; __T.L('Foto').x = __T.L('Leg').x = .5; changed({ layers:true }); }); await esc(p); await p.waitForTimeout(250);
    await clique(p, await cen(p, 'Foto')); await clique(p, await cen(p, 'Leg'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400); await esc(p);
    await clique(p, await cen(p, 'Foto'));
    let s = await st(p); confere('clique na foto do cartão escolhe o cartão', [s.pk.join(), !!s.whole], ['Foto,Leg', true]);
    let g = await gira(p, 20); confere('cartão com foto gira', g.ok && Math.round(g.d), v => typeof v === 'number' && Math.abs(v - 20) <= 1.5) || console.log('      ', JSON.stringify(g.s || g));
    await duplo(p, await cen(p, 'Foto'));
    s = await st(p); confere('clique duplo na foto: só a foto', s.pk, ['Foto']);
    const t = await ev(p, () => !!rotTarget());
    if (!t) nota('foto dentro do cartão escolhida sozinha não tem giro');
    // a foto escolhida sozinha mostra alças (dá para mudar a máscara) mesmo com o cartão girado
    confere('foto sozinha no cartão girado tem alças', await ev(p, () => handlesOf(selL()).length), n => n >= 4);
    await shot(p, 'foto-no-frame');
  },

  // 21. Texto girado 90° dentro de uma coluna: o vizinho abre espaço?
  async textoGiradoNaFila(p) {
    await add(p, 'Adicionar título'); await nomeia(p, 'G1');
    await add(p, 'Adicionar subtítulo'); await nomeia(p, 'G2'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'G1')); await clique(p, await cen(p, 'G2'), ['Shift']);
    await p.keyboard.press('Shift+A'); await p.waitForTimeout(400); await esc(p);
    await clique(p, await cen(p, 'G1'), ['Control']);
    await ev(p, () => { selL().rot = 90; changed({ props:true }); }); await p.waitForTimeout(300);
    const r = await ev(p, () => {
      const a = __T.L('G1'), b = __T.L('G2'), A = a._bounds, B = b._bounds;
      // caixa de G1 girada 90° em volta do centro dela
      const c = { x:A.x + A.w / 2, y:A.y + A.h / 2 }, rot = { y0:c.y - A.w / 2, y1:c.y + A.w / 2 };
      return { g1:[Math.round(rot.y0), Math.round(rot.y1)], g2:[Math.round(B.y), Math.round(B.y + B.h)] };
    });
    const sobre = r.g1[1] > r.g2[0] && r.g2[1] > r.g1[0];
    if (sobre) nota(`texto girado 90° numa coluna não abre espaço: passa por cima do vizinho (G1 ${r.g1}, G2 ${r.g2})`);
    await shot(p, 'texto-girado-na-fila');
  },

  // 22. Grupo sem layout girado: setas e arrasto de um item de dentro
  async itemNoGrupoGirado(p) {
    await add(p, 'Adicionar forma'); await nomeia(p, 'H1');
    await add(p, 'Adicionar forma'); await nomeia(p, 'H2'); await todos0(p);
    await ev(p, () => { const a = __T.L('H1'), b = __T.L('H2'); a.x = .35; b.x = .65; a.y = b.y = .5; a.size = b.size = .2; a.mh = b.mh = .2; changed({ layers:true }); });
    await esc(p); await p.waitForTimeout(250);
    await clique(p, await cen(p, 'H1')); await clique(p, await cen(p, 'H2'), ['Shift']);
    await p.keyboard.press('Control+g'); await p.waitForTimeout(300);
    await gira(p, 90);
    await clique(p, await cen(p, 'H2'), ['Control']);
    confere('Ctrl + clique: só H2', (await st(p)).pk, ['H2']);
    const c0 = await cen(p, 'H2'), o0 = await cen(p, 'H1');
    await p.keyboard.press('Shift+ArrowRight'); await p.waitForTimeout(250);
    const c1 = await cen(p, 'H2'), o1 = await cen(p, 'H1');
    const d = [Math.round(c1.x - c0.x), Math.round(c1.y - c0.y)];
    confere('seta em H2 (grupo girado) não mexe em H1 na tela', perto(o1, o0, 1.5), true) || console.log('       H1 andou', Math.round(o1.x - o0.x), Math.round(o1.y - o0.y), ' H2 andou', d);
    confere('seta → em item de grupo girado anda para a direita na tela', d, v => v[0] > 2 && Math.abs(v[1]) <= 1);
    // arrastar: segue o mouse na tela
    await p.mouse.move(c1.x, c1.y); await p.mouse.down(); await p.mouse.move(c1.x + 30, c1.y, { steps:5 }); await p.mouse.move(c1.x + 60, c1.y + 20, { steps:5 }); await p.mouse.up(); await p.waitForTimeout(300);
    const c2 = await cen(p, 'H2'), o2 = await cen(p, 'H1');
    confere('arrastar item de grupo girado segue o mouse (60, 20)', [Math.round(c2.x - c1.x), Math.round(c2.y - c1.y)], v => Math.abs(v[0] - 60) < 6 && Math.abs(v[1] - 20) < 6);
    confere('arrastar H2 (grupo girado) não leva H1 junto', [Math.round(o2.x - o1.x), Math.round(o2.y - o1.y)], v => Math.abs(v[0]) <= 2 && Math.abs(v[1]) <= 2);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
    const c3 = await cen(p, 'H2'), o3 = await cen(p, 'H1');
    confere('Ctrl+Z desfaz o arrasto: os dois voltam', [perto(c3, c1, 1.5), perto(o3, o1, 1.5)], [true, true]);
    // o mesmo arrasto num formato que não é o principal
    const alvo = await ev(p, () => S.format === '1x1' ? '9:16' : '1:1');
    await p.click(`#fmt button:text-is("${alvo}")`); await p.waitForTimeout(600);
    await clique(p, await cen(p, 'H2'), ['Control']);
    const f1 = await cen(p, 'H2'), g1 = await cen(p, 'H1');
    await p.mouse.move(f1.x, f1.y); await p.mouse.down(); await p.mouse.move(f1.x + 25, f1.y + 10, { steps:5 }); await p.mouse.move(f1.x + 50, f1.y + 20, { steps:5 }); await p.mouse.up(); await p.waitForTimeout(300);
    const f2 = await cen(p, 'H2'), g2 = await cen(p, 'H1');
    confere(`no ${alvo}: H2 segue o mouse e H1 fica`, [Math.round(f2.x - f1.x), Math.round(f2.y - f1.y), perto(g2, g1, 2)], v => Math.abs(v[0] - 50) < 6 && Math.abs(v[1] - 20) < 6 && v[2]);
  },

  // 24. Caixa girada: o texto cresce (mais uma linha) e a Caixa não escorrega
  async textoCresceNaCaixaGirada(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Tc'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Tc')); await gira(p, 30);
    const nw0 = await ev(p, () => __T.scr(handlesOf(selL()).find(o => o.k === 'nw')));
    // escreve pelo palco: clique duplo (Caixa de um texto só = edita), vai ao fim e acrescenta uma linha
    await duplo(p, await cen(p, 'Tc'));
    if (!(await ev(p, () => !!SED.el))) { confere('abre a edição na Caixa girada', false, true); return; }
    await p.keyboard.press('End'); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('mais uma linha', { delay:10 });
    await p.waitForTimeout(250);
    { const sb = await ev(p, () => { const r = $('#stageScroll').getBoundingClientRect(); return { x:r.left + 8, y:r.top + 8 }; }); await p.mouse.click(sb.x, sb.y); await p.waitForTimeout(350); } // clicar fora confirma (Esc desfaz)
    confere('o texto ganhou a linha nova', await ev(p, () => __T.L('Tc').text.includes('mais uma linha')), true);
    await clique(p, await cen(p, 'Tc'));
    const nw1 = await ev(p, () => __T.scr(handlesOf(selL()).find(o => o.k === 'nw')));
    confere('Caixa girada que cresce para baixo: a quina de cima fica parada', perto(nw1, nw0, 3), true) || console.log('       antes', nw0, 'depois', nw1);
    // digitar e cancelar com Esc: tudo volta como era, inclusive o lugar
    const t0 = await ev(p, () => __T.L('Tc').text);
    await duplo(p, await cen(p, 'Tc'));
    if (await ev(p, () => !!SED.el)) {
      await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('outra linha que some', { delay:10 }); await p.waitForTimeout(250);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      confere('Esc devolve o texto de antes', await ev(p, () => __T.L('Tc').text), t0);
      await esc(p); await clique(p, await cen(p, 'Tc'));
      const nw2 = await ev(p, () => __T.scr(handlesOf(selL()).find(o => o.k === 'nw')));
      confere('Esc na edição da Caixa girada: ela volta ao mesmo lugar', perto(nw2, nw1, 3), true) || console.log('       antes', nw1, 'depois', nw2);
      const semGiro = await ev(p, () => { const g = S.groups[__T.gidOf('Tc')]; return g.rot; });
      confere('o giro continua o mesmo', Math.round(semGiro), 30);
    }
    await shot(p, 'texto-cresce-na-caixa-girada');
  },

  // 23. Quina de um frame com layout girado: a quina oposta fica parada
  async quinaDoFrameGirado(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Qn'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Qn')); await gira(p, 30);
    const hs = await ev(p, () => { const h = handlesOf(selL()); const f = k => __T.scr(h.find(o => o.k === k)); return { se:f('se'), nw:f('nw') }; });
    await p.mouse.move(hs.se.x, hs.se.y); await p.mouse.down(); await p.mouse.move(hs.se.x + 20, hs.se.y + 30, { steps:8 }); await p.mouse.up(); await p.waitForTimeout(300);
    const nw2 = await ev(p, () => { const h = handlesOf(selL()).find(o => o.k === 'nw'); return h && __T.scr(h); });
    confere('frame com layout girado escalado pela quina: a quina oposta fica parada', perto(nw2, hs.nw, 3), true) || console.log('       antes', hs.nw, 'depois', nw2);
  },

  // 25. Caixa girada: primeira edição, digita e cancela com Esc
  async escNaCaixaGirada(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'Ec'); await todos0(p); await esc(p);
    await clique(p, await cen(p, 'Ec')); await gira(p, 30);
    const nw0 = await ev(p, () => __T.scr(handlesOf(selL()).find(o => o.k === 'nw'))), t0 = await ev(p, () => __T.L('Ec').text);
    const pos0 = await ev(p, () => { const L = __T.L('Ec'); return [L.x, L.y, JSON.stringify(L.fsz || null), JSON.stringify(S.groups[L.grp].fsz || null)]; });
    await duplo(p, await cen(p, 'Ec'));
    if (!(await ev(p, () => !!SED.el))) { confere('abre a edição', false, true); return; }
    await p.keyboard.press('End'); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('mais uma linha', { delay:10 });
    await p.waitForTimeout(250); await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    confere('Esc devolve o texto', await ev(p, () => __T.L('Ec').text), t0);
    const pos1 = await ev(p, () => { const L = __T.L('Ec'); return [L.x, L.y, JSON.stringify(L.fsz || null), JSON.stringify(S.groups[L.grp].fsz || null)]; });
    confere('Esc devolve posição e âncora do texto', pos1, pos0);
    await esc(p); await clique(p, await cen(p, 'Ec'));
    const nw1 = await ev(p, () => __T.scr(handlesOf(selL()).find(o => o.k === 'nw')));
    confere('depois do Esc a Caixa girada está no mesmo lugar', perto(nw1, nw0, 3), true) || console.log('       antes', nw0, 'depois', nw1, JSON.stringify(await st(p)));
  },

  // 13. Seleção por área dentro e fora de frame
  async area(p) {
    await add(p, 'Adicionar caixa'); await nomeia(p, 'M1'); await esc(p);
    await add(p, 'Adicionar forma'); await nomeia(p, 'M2'); await todos0(p);
    await ev(p, () => { const a = __T.L('M1'), b = __T.L('M2'); a.y = .3; b.y = .7; b.size = .2; b.mh = .2; changed({ layers:true }); }); await esc(p); await p.waitForTimeout(250);
    const r = await ev(p, () => { const r = cv.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; });
    await p.mouse.move(r.x + 4, r.y + 4); await p.mouse.down(); await p.mouse.move(r.x + r.w - 4, r.y + r.h - 4, { steps:10 }); await p.mouse.up(); await p.waitForTimeout(300);
    const s = await st(p); confere('área no quadro todo: Caixa + forma', s.pk, ['M1', 'M2']);
    const g = await gira(p, 20);
    if (!g.ok) nota('Caixa + forma soltas escolhidas por área não giram juntas');
  },
};

(async () => {
  let b; try { b = await pw.chromium.launch({ channel:'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const so = process.argv[2];
  for (const [n, f] of Object.entries(CENARIOS)) {
    if (so && n !== so) continue;
    cenario = n; console.log(`\n== ${n}`);
    const p = await abre(b);
    try { await f(p); } catch (e) { falhas++; console.log('ERRO no cenário ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); try { await shot(p, n + '-erro'); } catch (e2) {} }
    await p.context().close();
  }
  await b.close();
  if (notas.length) console.log('\nLimitações vistas:\n - ' + notas.join('\n - '));
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
