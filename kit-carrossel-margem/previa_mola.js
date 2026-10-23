// Previa REAL de um carrossel: abre o proprio Mola (index.html deste repositorio) num Chromium,
// importa o .json como o botao "Importar .json" faz (loadState) e salva o quadro inteiro em PNG.
// Uso: node previa_mola.js carrossel.json previa.png
// Precisa do pacote playwright (npm i playwright) e de um Chromium.
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const [, , entrada, saida = 'previa.png'] = process.argv;
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const st = JSON.parse(fs.readFileSync(entrada, 'utf8'));
function chromium() {
  const base = '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base)) for (const s of ['chrome-linux64/chrome', 'chrome-linux/chrome']) { const p = path.join(base, d, s); if (/^chromium-\d/.test(d) && fs.existsSync(p)) return p; } } catch (e) {}
  return undefined;
}
(async () => {
  const b = await pw.chromium.launch({ executablePath: chromium() });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForTimeout(2000);
  const r = await p.evaluate(async st => {
    await loadState(st, 'previa'); await new Promise(r => setTimeout(r, 2500));
    const k = 0.5, c = document.createElement('canvas'); c.width = FW() * k; c.height = H() * k;
    renderFrame(c.getContext('2d'), 0, k, true);
    return { slides: S.slides || 1, camadas: S.layers.length, png: c.toDataURL('image/png') };
  }, st);
  fs.writeFileSync(saida, Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(JSON.stringify({ ok: !erros.length, slides: r.slides, camadas: r.camadas, erros }));
  await b.close(); process.exit(erros.length ? 1 : 0);
})();
