// Teste no navegador: quem abre o editor pela primeira vez (sem nada salvo) recebe a marca da Mola, e título, botão, fundo etc.
// já nascem no padrão dela (cores, fontes), sem precisar configurar a marca.
// Rodar: node testes/marca-mola.js
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
let falhas = 0;
const ck = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : '  ' + JSON.stringify(info))); };
(async () => {
  const b = await pw.chromium.launch();
  const p = await (await b.newContext({ viewport:{ width:1500, height:950 } })).newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const out = { brand:{ colors:S.brand.colors, fonts:S.brand.fonts, logo:S.brand.logo && S.brand.logo.name } };
    for (const id of ['title', 'sub', 'big', 'cta', 'bg']) {
      const L = id === 'bg' ? S.layers.find(l => l.type === 'bg') : addLayer(mkComp(id));
      out[id] = { font:L.font, color:L.color, bg:L.bg, c1:L.c1, c3:L.c3 };
    }
    return out;
  });
  const up = x => String(x).toUpperCase();
  ck('cores da marca = Mola', up(r.brand.colors[0]) === '#0D1117' && up(r.brand.colors[2]) === '#3FB950', r.brand.colors);
  ck('fontes da marca = Mona Sans / Hubot Sans', r.brand.fonts[0] === 'Mona Sans' && r.brand.fonts[2] === 'Hubot Sans', r.brand.fonts);
  ck('logo da Mola', r.brand.logo === 'mola-logo.svg', r.brand.logo);
  ck('título em Mona Sans, texto claro', r.title.font === 'Mona Sans' && up(r.title.color) === '#F0F6FC', r.title);
  ck('número em Hubot Sans', r.big.font === 'Hubot Sans', r.big);
  ck('botão verde da Mola', up(r.cta.bg) === '#3FB950', r.cta);
  ck('fundo com as cores da Mola', up(r.bg.c1) === '#0D1117' && up(r.bg.c3) === '#3FB950', r.bg);
  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
