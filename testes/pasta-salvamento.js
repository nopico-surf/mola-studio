// Teste no navegador: pasta de salvamento (js/pasta.js). Usa o OPFS (mesma API de pasta do showDirectoryPicker, sem janela do sistema).
// Confere: copiar o que está no navegador para a pasta, salvar sozinho nela, mídia na subpasta, reabrir lendo da pasta, apagar.
// Rodar: node testes/pasta-salvamento.js
const path = require('path'), http = require('http'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const root = path.resolve(__dirname, '..');
let falhas = 0;
const ck = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok ? '' : '  ' + JSON.stringify(info))); };
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
(async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type':types[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
  }).listen(0);
  const url = `http://localhost:${srv.address().port}/index.html`;
  const b = await pw.chromium.launch();
  const p = await (await b.newContext({ viewport:{ width:1500, height:950 } })).newPage();
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);

  // 1) copia o que está no navegador para a pasta e passa a salvar nela
  const r1 = await p.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    try { await opfs.removeEntry('mola-teste', { recursive:true }); } catch (e) {}
    const dir = await opfs.getDirectoryHandle('mola-teste', { create:true });
    addLayer(mkComp('title')); changed(); await flushSave(); // arquivo com algo, ainda no navegador
    const id = FILES.id, before = await DB.get('file:' + id);
    const blob = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type:'image/png' });
    const mid = await putMedia(blob);
    const copied = await DISK.copyIn(dir);
    DISK.dir = dir; await DB._set('diskHandle', dir);
    const names = async d => { const o = []; for await (const [n] of d.entries()) o.push(n); return o.sort(); };
    return { id, mid, copied, root:await names(dir), arq:await names(await dir.getDirectoryHandle('arquivos')), midia:await names(await dir.getDirectoryHandle('midia')),
      same:(await DB.get('file:' + id)) === before, indexOk:Array.isArray(await DB.get('files')) };
  });
  ck('copiou para a pasta', r1.copied, r1);
  ck('indice, projetos e subpastas na pasta', ['arquivos', 'indice.json', 'midia'].every(n => r1.root.includes(n)), r1.root);
  ck('o arquivo aberto está em arquivos/', r1.arq.includes(r1.id + '.json'), r1.arq);
  ck('a foto está em midia/ com extensão', r1.midia.includes(r1.mid + '.png'), r1.midia);
  ck('ler pelo DB devolve o mesmo conteúdo', r1.same && r1.indexOk, r1);

  // 2) o salvamento automático grava na pasta (e não no navegador)
  const r2 = await p.evaluate(async () => {
    S.layers.find(l => l.type === 'text').text = 'Salvo na pasta XYZ'; changed(); await flushSave();
    const dir = DISK.dir, f = await (await (await dir.getDirectoryHandle('arquivos')).getFileHandle(FILES.id + '.json')).getFile();
    return { naPasta:(await f.text()).includes('Salvo na pasta XYZ'), noNavegador:String(await DB._get('file:' + FILES.id)).includes('Salvo na pasta XYZ'), estado:$('#saveState').textContent };
  });
  ck('autosave grava na pasta', r2.naPasta, r2);
  ck('não grava de novo no navegador', !r2.noNavegador, r2);
  ck('estado "Salvo"', r2.estado === 'Salvo', r2);

  // 3) reabrir: lê da pasta (o handle fica guardado)
  await p.reload(); await p.waitForTimeout(1800);
  const r3 = await p.evaluate(async () => ({
    pasta:DISK.dir && DISK.name, texto:S.layers.some(l => l.text === 'Salvo na pasta XYZ'),
    mid:await DB.get('media:' + (window.__mid || '')) === undefined, btn:$('#diskBtn').title }));
  ck('reabriu usando a pasta', r3.pasta === 'mola-teste', r3);
  ck('o texto salvo na pasta voltou', r3.texto, r3);
  ck('botão mostra a pasta', /mola-teste/.test(r3.btn), r3);

  // 4) mídia: lê de volta da pasta e apagar remove o arquivo
  const r4 = await p.evaluate(async id => {
    const b = await DB.get('media:' + id), n = b ? (await b.arrayBuffer()).byteLength : -1;
    await DB.del('media:' + id);
    const dir = await DISK.folder('midia', false), left = []; for await (const [x] of dir.entries()) left.push(x);
    return { n, type:b && b.type, left, depois:await DB.get('media:' + id) };
  }, r1.mid);
  ck('mídia volta da pasta inteira', r4.n === 7, r4);
  ck('apagar tira o arquivo da pasta', !r4.left.length && r4.depois === undefined, r4);

  // 5) menu e voltar ao navegador
  await p.click('#diskBtn');
  const menu = await p.evaluate(() => [...document.querySelectorAll('.ctx.diskmenu button')].map(x => x.textContent));
  ck('menu da pasta', menu.includes('Trocar a pasta…') && menu.includes('Voltar a salvar no navegador'), menu);
  await p.screenshot({ path:path.join(__dirname, 'pasta-menu.png'), clip:{ x:0, y:0, width:700, height:200 } });

  await p.evaluate(async () => { const o = await navigator.storage.getDirectory(); await o.removeEntry('mola-teste', { recursive:true }); await DB._del('diskHandle'); });
  await b.close(); srv.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0);
})();
