// Teste no navegador: controles com ícone (pedido do usuário: alinhamento, negrito, itálico e afins são ícone em todo lugar,
// nunca escritos num lugar e desenhados em outro). Clica de verdade nos botões do painel e da janela Componentes.
// Rodar: node testes/icones.js   (precisa do playwright; SHOTS=<pasta> salva prints)
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
const shots = process.env.SHOTS;
let falhas = 0;
const confere = (nome, ok, info) => { if (!ok) falhas++; console.log((ok ? 'ok   ' : 'FALHA') + ' ' + nome + (ok || info == null ? '' : `\n      ${JSON.stringify(info)}`)); };

(async () => {
  const b = await pw.chromium.launch(process.env.PW_CHANNEL ? { channel:process.env.PW_CHANNEL } : {}); // PW_CHANNEL=msedge usa o Edge instalado
  const p = await b.newPage({ viewport:{ width:1500, height:950 } });
  p.on('pageerror', e => { falhas++; console.log('ERRO', e.message); });
  await p.goto(url); await p.waitForTimeout(1500);
  const shot = async (n, sel = '#props') => { if (shots) await p.locator(sel).first().screenshot({ path:path.join(shots, n + '.png') }); };
  // nenhum botão de escolha com o nome escrito de algo que tem ícone ("Sólido" e "Vivo" ficam de fora: estilo do preenchimento e filtro da foto)
  const escritos = () => p.evaluate(() => [...document.querySelectorAll('#props button, .comp-body button')].map(b => b.textContent.trim())
    .filter(t => /^(Esq\.|Dir\.|Centro|Dentro|Fora|Redond[ao]|Reta|Quadrada|Chanfro|Horizontal|Vertical|Retângulo|Círculo|Triângulo|Polígono|Estrela|Linha|Vetor|Tracejado|Longo|Pontilhado|Traço-ponto|Uma por linha|Uma só|B|I|[▶◀▲▼])$/.test(t)));
  const style = () => p.evaluate(() => { propTab = 'style'; renderProps(); });

  // 1) texto: alinhamento e caixa alta/itálico com ícones, clicando
  await p.click('#adds .add[title="Adicionar título"]'); await p.waitForTimeout(300); await style();
  const txt = await p.evaluate(() => ({ al:document.querySelectorAll('#props .segs.ico[aria-label="Alinhamento"] button svg').length,
    letras:document.querySelectorAll('#props .segs.ico[aria-label="Letras"] button svg').length,
    checks:[...document.querySelectorAll('#props .check')].map(c => c.textContent.trim()).filter(t => /Caixa alta|Itálico/.test(t)),
    rich:document.querySelectorAll('#props .richbar .icon-btn svg').length }));
  confere('texto: 3 ícones de alinhamento, 2 de letras, B/I do trecho em ícone e nenhuma caixa "Caixa alta/Itálico"', txt.al === 3 && txt.letras === 2 && txt.rich === 2 && !txt.checks.length, txt);
  await p.click('#props .segs.ico[aria-label="Alinhamento"] button[aria-label="Alinhar à direita"]');
  await p.click('#props .segs.ico[aria-label="Letras"] button[aria-label="Caixa alta"]');
  const st = await p.evaluate(() => ({ align:selL().align, upper:selL().upper, on:document.querySelector('#props .segs.ico[aria-label="Letras"] button[aria-label="Caixa alta"]').getAttribute('aria-pressed'),
    alOn:document.querySelector('#props .segs.ico[aria-label="Alinhamento"] button[aria-label="Alinhar à direita"]').getAttribute('aria-pressed') }));
  confere('texto: clicar no ícone muda a camada e marca o botão', st.align === 'right' && st.upper === true && st.on === 'true' && st.alOn === 'true', st);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  confere('texto: desfazer tira a caixa alta', await p.evaluate(() => !selL().upper));
  await p.evaluate(() => { selL().stroke = true; renderProps(); });
  const tsk = await p.evaluate(() => [...document.querySelectorAll('#props .segs.ico[aria-label="Posição"] button')].map(b => b.getAttribute('aria-label')));
  confere('texto: posição do contorno em ícones, sem "Dentro"', tsk.join() === 'No centro,Fora', tsk);
  confere('texto: nenhum controle escrito que tem ícone', !(await escritos()).length, await escritos());
  await shot('texto');

  // 2) botão: caixa alta/itálico em ícone
  await p.click('#adds .add[title="Adicionar botão"]'); await p.waitForTimeout(300); await style();
  await p.click('#props .segs.ico[aria-label="Letras"] button[aria-label="Itálico"]');
  confere('botão: itálico pelo ícone', await p.evaluate(() => selL().italic === true));
  confere('botão: nenhum controle escrito que tem ícone', !(await escritos()).length, await escritos());

  // 3) forma: tipo, posição, estilo, pontas e cantos do contorno
  await p.click('#adds .add[title="Adicionar forma"]'); await p.waitForTimeout(300);
  await p.evaluate(() => { propTab = 'style'; const L = selL(); L.stroke = true; L.strokeDash = 'dash'; renderProps(); });
  const sh = await p.evaluate(() => Object.fromEntries(['Tipo', 'Posição', 'Estilo', 'Pontas', 'Cantos'].map(k => [k, document.querySelectorAll(`#props .segs.ico[aria-label="${k}"] button svg`).length])));
  confere('forma: tipo (7), posição (3), estilo do traço (5), pontas (3) e cantos (3) com ícones', sh.Tipo === 7 && sh['Posição'] === 3 && sh.Estilo === 5 && sh.Pontas === 3 && sh.Cantos === 3, sh);
  await p.click('#props .segs.ico[aria-label="Pontas"] button[aria-label="Quadrada"]');
  await p.click('#props .segs.ico[aria-label="Tipo"] button[aria-label="Estrela"]');
  confere('forma: clicar muda tipo e pontas', await p.evaluate(() => selL().kind === 'star' && selL().strokeCap === 'square'));
  confere('forma: nenhum controle escrito que tem ícone', !(await escritos()).length, await escritos());
  await shot('forma');

  // 4) imagem: máscara e virar
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#c63'; x.fillRect(0, 0, 64, 48);
    const L = mkImage(S.brand, S.brand.fonts, { src:c.toDataURL() }); await getImage(L.src); addLayer(L); propTab = 'style'; renderProps();
  });
  await p.waitForTimeout(200);
  await p.click('#props .segs.ico[aria-label="Virar"] button[aria-label="Espelhar na horizontal"]');
  await p.click('#props .segs.ico[aria-label="Máscara"] button[aria-label="Círculo"]');
  confere('imagem: virar e máscara pelos ícones', await p.evaluate(() => selL().flipX === true && selL().mask === 'circle'));
  confere('imagem: nenhum controle escrito que tem ícone', !(await escritos()).length, await escritos());
  await shot('imagem');

  // 5) direção do deslize com ícone
  await p.evaluate(() => { const L = S.layers.find(l => l.type === 'text'); select(L.id); L.in = 'slide'; propTab = 'anim'; renderProps(); });
  const dir = await p.evaluate(() => document.querySelectorAll('#props .segs.ico[aria-label="Direção do deslize"] button svg').length);
  confere('animação: direção do deslize com 4 ícones', dir === 4, dir);

  // 6) janela Componentes (Título e Forma) usa os mesmos controles
  await p.evaluate(() => openComps('title')); await p.waitForTimeout(300);
  const cw = await p.evaluate(() => ({ al:document.querySelectorAll('.comp-body .segs.ico[aria-label="Alinhamento"] button svg').length, letras:document.querySelectorAll('.comp-body .segs.ico[aria-label="Letras"] button').length,
    play:!!document.querySelector('.comp-play svg') }));
  confere('componentes: alinhamento, letras e "Ver" com ícone', cw.al === 3 && cw.letras === 2 && cw.play, cw);
  await p.click('.comp-body .segs.ico[aria-label="Letras"] button[aria-label="Itálico"]');
  confere('componentes: o ícone grava no padrão e fica marcado', await p.evaluate(() => (S.brand.comps.title || {}).italic === true
    && document.querySelector('.comp-body .segs.ico[aria-label="Letras"] button[aria-label="Itálico"]').getAttribute('aria-pressed') === 'true'));
  confere('componentes: nenhum controle escrito que tem ícone', !(await escritos()).length, await escritos());
  if (shots) await p.screenshot({ path:path.join(shots, 'componentes.png') });
  await p.evaluate(() => openComps('shape')); await p.waitForTimeout(200);
  confere('componentes: tipo da forma em ícones', await p.evaluate(() => document.querySelectorAll('.comp-body .segs.ico[aria-label="Forma"] button svg').length === 6));

  // 7) desfazer/refazer no topo com ícone
  confere('topo: desfazer e refazer com ícone', await p.evaluate(() => !!document.querySelector('#undo svg') && !!document.querySelector('#redo svg') && !document.querySelector('#undo').textContent.trim()));

  await b.close();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})();
