// Teste no navegador: na edição do texto no palco, as linhas do campo (o que recebe o cursor e a seleção) são as linhas do desenho
// (reclamação do usuário: "não tô conseguindo chegar com a seleção até a primeira linha"). Com uma palavra mais larga que a caixa
// ("somosmargem.com.br"), o campo ficava com a largura dela e quebrava em outros lugares: a 1ª linha do desenho ficava sem campo
// por baixo. Confere, com mouse e teclas de verdade:
// - o campo tem o mesmo número de linhas que o canvas e cada linha começa na mesma letra e na mesma altura;
// - arrastar da 2ª linha até o começo da 1ª escolhe desde a 1ª letra;
// - Backspace no começo da 2ª linha apaga o espaço da quebra, e o campo acompanha a quebra nova.
// Rodar: node testes/selecao-linhas-no-palco.js (prints em mola-testes/selecao-linhas-*.png)
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const outDir = path.join(os.tmpdir(), 'mola-testes'); fs.mkdirSync(outDir, { recursive: true });
let falhas = 0;
const ok = (c, msg, extra) => { if (c) console.log('ok   ' + msg); else { falhas++; console.log('FALHA ' + msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const TXT = 'Para apoio em saúde mental ou no uso de substâncias, acesse: somosmargem.com.br';
(async () => {
  let b; try { b = await pw.chromium.launch({ channel: 'chrome' }); } catch (e) { b = await pw.chromium.launch(); }
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1200);

  await p.evaluate(TXT => {
    S.layers = S.layers.filter(l => l.type === 'bg'); S.groups = {}; S.flow = null; S.audio = null; setDuration(8); T = 0;
    changed({ layers: true, props: true });
    addLayer(mkComp('title'));
    const L = S.layers.find(l => l.type === 'text');
    Object.assign(L, { text: TXT, runs: null, size: 110, align: 'left', in: 'cut', out: 'cut', start: 0, end: 8 });
    RT.layout.clear(); ensureBounds([L]); changed({ layers: true, props: true });
  }, TXT);
  await p.waitForTimeout(400);

  // onde cada linha do canvas está na tela: primeira letra (x, meio da linha) e índice da letra
  const canvasLines = () => p.evaluate(() => {
    const L = S.layers.find(l => l.type === 'text'), r = cv.getBoundingClientRect(), s = r.width / FW(), b = L._bounds, k = b.k || 1;
    const lay = layoutText(L, caseTxt(L, L.text)), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return lay.lines.map(ln => { const g = ln.glyphs.find(g => !g.space) || ln.glyphs[0];
      return { i0: ln.i0, text: ln.text, x: r.left + (cx + (ln.x0 + g.x) * k) * s, y: r.top + (cy + (ln.baseline - lay.size * .34) * k) * s, gw: g.w * k * s }; });
  });
  // linhas do campo: letra em que cada uma começa e a altura do meio dela
  const fieldLines = () => p.evaluate(() => {
    const el = document.querySelector('.sedit'), out = []; let n = 0, lastTop = null;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const cs = [...t.data]; let off = 0;
      for (let j = 0; j < cs.length; j++) {
        const rg = document.createRange(); rg.setStart(t, off); rg.setEnd(t, off + cs[j].length); off += cs[j].length;
        const rr = rg.getBoundingClientRect();
        if (rr.width > 0 && cs[j] !== ' ' && (lastTop === null || rr.top > lastTop + rr.height * .5)) { out.push({ i0: n + j, y: rr.top + rr.height / 2 }); lastTop = rr.top; }
      }
      n += cs.length;
    }
    return out;
  });

  const c0 = await canvasLines();
  ok(c0.length >= 5, 'o canvas quebra o texto em várias linhas', c0.map(l => l.text));
  await p.mouse.dblclick(c0[0].x + 30, c0[0].y);
  await p.waitForTimeout(350);
  ok(await p.evaluate(() => !!document.querySelector('.sedit')), 'clique duplo abre a edição no palco');

  const f0 = await fieldLines();
  ok(f0.length === c0.length, 'o campo tem as mesmas linhas que o desenho', { campo: f0.length, canvas: c0.length });
  ok(f0.every((l, i) => c0[i] && l.i0 === c0[i].i0), 'cada linha do campo começa na mesma letra que a do desenho', { campo: f0.map(l => l.i0), canvas: c0.map(l => l.i0) });
  const dy = Math.max(...f0.map((l, i) => c0[i] ? Math.abs(l.y - c0[i].y) : 99));
  ok(dy < 8, 'cada linha do campo fica na altura da linha desenhada (menos de 8 px)', { dy });
  await p.screenshot({ path: path.join(outDir, 'selecao-linhas-1.png') });

  // arrastar do meio da 2ª linha até o começo da 1ª
  await p.mouse.move(c0[1].x + 150, c0[1].y);
  await p.mouse.down();
  await p.mouse.move(c0[1].x + 60, c0[1].y - 10, { steps: 4 });
  await p.mouse.move(c0[0].x + 2, c0[0].y, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(200);
  const sel = await p.evaluate(() => String(getSelection()));
  ok(sel.startsWith('Para') && /saúde/.test(sel), 'arrastar até o começo da 1ª linha escolhe desde a 1ª letra', sel);
  await p.screenshot({ path: path.join(outDir, 'selecao-linhas-2.png') });

  // Backspace no começo da 2ª linha apaga o espaço da quebra
  await p.mouse.click(c0[1].x + 1, c0[1].y);
  await p.waitForTimeout(150);
  await p.keyboard.press('Backspace');
  await p.waitForTimeout(300);
  const t1 = await p.evaluate(() => S.layers.find(l => l.type === 'text').text);
  ok(t1 === TXT.replace('em saúde', 'emsaúde'), 'Backspace no começo da 2ª linha apaga o espaço da quebra', t1);
  const c1 = await canvasLines(), f1 = await fieldLines();
  ok(f1.length === c1.length && f1.every((l, i) => c1[i] && l.i0 === c1[i].i0), 'depois de digitar o campo acompanha a quebra nova', { campo: f1.map(l => l.i0), canvas: c1.map(l => l.i0) });
  await p.keyboard.type(' ');
  await p.waitForTimeout(300);
  const t2 = await p.evaluate(() => ({ txt: S.layers.find(l => l.type === 'text').text, sel: seditSel(document.querySelector('.sedit')) }));
  ok(t2.txt === TXT && t2.sel && t2.sel[0] === 14, 'o espaço volta e o cursor fica no começo da 2ª linha', t2);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok(await p.evaluate(TXT => !document.querySelector('.sedit') && S.layers.find(l => l.type === 'text').text === TXT, TXT), 'Esc fecha e o texto fica como era');

  await b.close();
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
