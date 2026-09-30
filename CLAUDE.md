# Mola Studio

Editor de animação por **presets** para anúncios de Facebook e Instagram. Roda 100% no navegador, sem build e sem backend.

## Objetivo do produto

- Uso inicial: só o Vitor (ferramenta pessoal para produzir anúncios).
- Tudo baseado em presets contemporâneos: fade, lettering animado, logo se desenhando, revelações orgânicas.
- **Decisão:** sem keyframes. O usuário escolhe presets e ajusta velocidade, intensidade e o momento em que a camada entra e sai. Existe uma timeline de camadas (embaixo do palco, `renderTimeline`) que só mostra e edita início/fim de cada camada (arrastar barra ou bordas). Não adicionar editor de keyframes sem pedido explícito.
- Interface escura (tema único, decisão do usuário).
- Idioma da interface: português do Brasil.

## Como rodar

```
npx serve .
```
Abrir http://localhost:3000. Também funciona abrindo `index.html` direto no Chrome/Edge.
Exportação de vídeo exige Chrome ou Edge (WebCodecs).

## Estrutura

- `index.html`: marcação da interface (três colunas: biblioteca, palco, propriedades).
- `css/app.css`: estilos. Tokens de cor e fonte no `:root`.
- `js/app.js`: toda a lógica, script clássico (sem módulos, sem framework).
- `vendor/mp4-muxer.js`: mp4-muxer 5.2.2 (global `Mp4Muxer`), empacota os quadros do WebCodecs em MP4.

## Arquitetura de `js/app.js`

Seções, na ordem do arquivo:

1. **Utilidades**: `h()` cria elementos, `clamp`, `rand(i,j)` determinístico (importante para exportar quadros idênticos à prévia).
2. **Curvas (`Ease`)**: `spring(p, k)` é a mola orgânica; `k` = intensidade. `easeOutPhase` espelha a curva para saídas.
3. **Presets**
   - `TP`: presets de texto. Cada um tem `unit` (`char` | `word` | `line` | `all`), `s` (espalhamento do stagger, 0..1), `ease`, `dur` (segundos padrão) e `fn({e, p, I, size, lineH, dir, i, n, seed, W})`, que devolve o estado da unidade: `dx, dy, sc, sx, sy, rot, a, blur, clip, track, scr, split, bar, count`.
   - `BP`: presets de bloco (logo, botão, imagem). O `fn` devolve `dx, dy, sc, sx, rot, a, blur, clip ('bounds' | 'circle' | 'wipe'), ce, cdir, cdy`. `draw`, `assemble`, `handwrite` e `line` são especiais, tratados em `drawBlock`/`drawBlockContent`.
   - `handwrite` ("Escrever letra a letra", seção **Caneta** logo depois de `parseLogo`): `buildPen` transforma o logo num **mapa de tempos** (cada pixel guarda quando a caneta passa por ele) e `drawPen` recorta a própria imagem do logo com a máscara `tempo ≤ agora`. Por isso cores, degradês, serifas e cantos saem certos e o último quadro é exatamente o logo (sem crossfade). Etapas: rasteriza cada forma numa grade de `PEN_RES` px (PNG com fundo transparente também serve; `<text>`, `<image>` e `<use>` entram como mais uma fonte) → separa as ilhas (letras, pingos, peças do símbolo) → `penOrder` (corte XY: moldura primeiro, linhas de texto de cima para baixo, colunas cortadas no maior vão, o resto da esquerda para a direita; pingo/acento/sublinhado logo depois da letra ou palavra) → ilha fina: esqueleto Zhang-Suen (`penStrokesFast` reduz a grade em traço grosso) → grafo → `penStrokes` liga as pontas em cada nó do par mais reto para o mais torto e `penOrient` escolhe o início (sem canto vivo começa por cima, com canto pela esquerda, ponta solta conta como mais alta; laços anti-horários); ilha cheia (`area/raio² < 10`): contorno e depois colunas subindo e descendo (`penRunMass`); pingo cresce do centro → `penStamp` passa um disco com a largura local pelo traço e `penFill` completa o que ele não alcança. Formas sobrepostas de cores diferentes viram camadas (até 4), cada uma com imagem própria (`snap` esconde as outras formas).
   - Forma (`shape`): vetorial (`shapeVec` devolve `Path2D` + comprimento; tipos em `SHAPE_KINDS`, `custom` aceita o `d` de um path SVG). A cor usa `paintFill`, o mesmo motor do fundo (mesh, linear, holofote, sólido, imagem, com movimento), recortado pelo path. Usa os presets de bloco, mais `draw` (o contorno se desenha e o preenchimento entra) e o idle `spin`. Sem margem (como imagem/fundo).
   - `dir` = 1 na entrada e -1 na saída. Qualquer preset de entrada serve de saída: a saída roda a curva ao contrário.
   - Com `e=1, p=1` todo `fn` precisa devolver o estado de repouso (identidade).
   - Listas por tipo: `TEXT_IN`, `TEXT_OUT`, `BLOCK_IN`, `BLOCK_OUT`, `IDLE_BY`.
4. **Estado (`S`)**: `{ format, duration, fps, loop, margin:{on, top, right, bottom, left}, brand:{colors[5], fonts[3], loaded[], logo}, layers[], template }`.
   - Camada: `{ id, type:'bg'|'text'|'logo'|'cta'|'image', role, start, end, in, out, inDur, outDur, speed, intensity, idle, x, y (0..1 normalizados), opacity, ...props do tipo }`.
   - Texto: `runs` opcional (`[{ t, w?, i?, c? }]`) = peso/itálico/cor (`c`, hex) por trecho; a cor vai em cada glyph (`g.c`) e o desenho usa `g.c || L.color`; só vale enquanto `runs.map(t).join('') === text` (`runsOf`). `layoutText` mede trechos seguidos de mesma fonte juntos: posição de cada letra = largura até ela menos a própria letra (senão o kerning do par cai no par seguinte). Editor: `richF` (contenteditable; Ctrl+B / Ctrl+I).
   - Imagem: `mask` (`fit` = forma da imagem | `rect` | `circle`), `size` = largura da máscara, `mh` = altura da máscara (fração da largura do quadro; `null` segue a proporção da imagem), `zoom`/`ix`/`iy` = imagem dentro da máscara. A imagem cobre a máscara em escala uniforme (nunca distorce).
   - Coordenadas em espaço 1080 de largura (1:1 = 1080², 4:5 = 1080×1350, 3:4 = 1080×1440, 9:16 = 1080×1920). `x`/`y` são frações do quadro.
   - Fábricas: `mkText`, `mkLogo`, `mkCta`, `mkImage`, `mkBg` → `base(type, role, defaults, overrides)`.
5. **Roteiros (`TEMPLATES`)**: `build(brand, fonts)` devolve as camadas. **Decisão do usuário:** não há mais painel de roteiros; aplicar um roteiro sobrescrevia o trabalho (perdeu 1h de animação). Todo arquivo novo abre no `blank` ("Do zero", só o fundo) via `newProject`; algo novo = outro arquivo. Nunca reintroduzir uma ação que troque todas as camadas do arquivo aberto. O desfazer também dispara o autosave.
   - **Adicionar (`ADD_KINDS`)**: elementos prontos (título, subtítulo, chamada, número, destaque, impacto, imagem, logo, botão), cada um já com estilo e preset. `addLayer` define o momento (`nextStart`: agulha pausada ou logo depois do último elemento) e a altura (`freeY`: evita sobrepor quem está na tela no mesmo momento). Imagens também entram arrastando no palco ou com Ctrl+V (`addImageFile`).
6. **Fontes**: Google Fonts carregadas dinamicamente (tenta vários intervalos de peso), upload via `FontFace`. Fontes enviadas ficam no projeto como dataURL.
7. **Logo SVG**: `parseLogo` renderiza o SVG escondido, extrai cada forma como `Path2D` com a matriz até o espaço do root, o comprimento (`getTotalLength`), as cores e o bbox (texto, imagem embutida e `<use>` entram no bbox). O logo final é uma imagem do SVG recortada no bbox; os presets `draw`/`assemble` desenham as partes e fazem crossfade para essa imagem. No fim, `buildPen` monta a caneta (`lg.pen`, também para PNG); sem ela, `handwrite` cai para `wipe`.
8. **Render**: `renderFrame(ctx, t, rs, isExport)` desenha tudo em Canvas 2D. Margem (`marginSides`/`marginBox`/`fitInMargin`; valores em px por lado, projetos antigos com `px` usam o mesmo valor nos quatro): a posição de repouso de texto, logo e botão é empurrada para dentro e, se não couber, o elemento encolhe; o texto quebra na largura útil. As animações somam deslocamento por cima, então podem passar. Imagem e fundo ficam livres, a não ser que a imagem tenha `keepIn` ("Manter dentro da margem", `freeType`).
   `renderFrame`: `rs` = escala de render (prévia < 1, exportação = 1). `phase(L, t)` devolve `in` | `hold` | `out` com progresso.
9. **Prévia**: loop em `requestAnimationFrame`, arrastar camadas no palco com guias de centro. Alças na seleção (`handlesOf`): canto escala a camada (`scaleLayer`), laterais mudam a máscara da imagem; roda do mouse = zoom da imagem, Alt + arrastar = mover a imagem dentro da máscara. Timeline: borda de cima muda a altura, alça no fim da régua muda a duração (`setDuration`). Barras: `tlHit` decide na faixa inteira (borda com 8 px de folga para fora = redimensionar, meio = mover, vazio = agulha); `tlDrag` tem ímã (0, fim, agulha, bordas das outras camadas; Shift desliga), balão com o tempo e Esc cancela.
   **Alinhar e agrupar** (seção antes de `renderFormats`): `alignLayers(modo)` (l, ch, r, t, cv, b, dh, dv) usa o `_bounds` de repouso (`ensureBounds` renderiza um quadro mínimo para quem não está na tela). Um bloco só alinha ao quadro, vários alinham entre si; distribuir pede 3 ou mais. Grupo = mesmo `L.grp` nas camadas (`groupSel`/`ungroupSel`, Ctrl+G / Ctrl+Shift+G, plano só, sem aninhar); `select` expande para o grupo inteiro, Ctrl+clique (ou duplo clique no palco) escolhe uma só. `selUnion` = caixa da seleção com alça de canto que escala todos (`gcorner`). Barra `alignBar` no topo das propriedades.
   **Grupo na timeline**: `S.groups[gid] = { name?, open }` (lazy, `gmeta`) só organiza a timeline: linha do grupo (barra tracejada do primeiro que entra ao último que sai, seta recolhe/expande) com os itens recuados abaixo. Arrastar a barra do grupo (`tlDragGroup`) move todos ou estica/encolhe o conjunto; a barra de um item mexe só nele. Não existe animação própria do grupo (decisão do usuário): com o grupo selecionado o painel é o normal e preset, velocidade, intensidade e opacidade valem para todos os itens (`peersAny`, `presetKeys`); selecionando um item, só ele.
10. **Arquivos** (como no Figma, tudo salva sozinho): IndexedDB `mola-studio` / `kv`. `files` = índice `[{ id, name, createdAt, updatedAt, thumb }]`, `file:<id>` = projeto em JSON, `currentId` = arquivo aberto. `changed()` → `autosave()` (700 ms) → `flushSave()` grava o projeto, a miniatura (`renderFrame` em `heroTime`) e o índice. Nome e id ficam em `FILES`, fora de `S` (o desfazer não mexe). Tela Arquivos (`openFiles`/`renderFiles`): abrir, novo (mantém a marca), duplicar, renomear (clique duplo), apagar. Importar `.json` cria arquivo novo. `migrateFiles` converte `current` e `projects` das versões antigas.
11. **Exportação**: `VideoEncoder` H.264 High com nível escolhido por `avcLevel` (4.0 / 4.2 / 5.1 pela carga de macroblocos) → fallbacks → VP9, + mp4-muxer com fast start (moov no início). FPS do projeto (`fps()`: 24, 25, 30, 50, 60). Bitrate variável, prioridade qualidade, ~0,2 bit/pixel/quadro entre 8 e 20 Mbps (`exportBitrate`), quadro-chave a cada 2 s. Um quadro por vez (determinístico). Fallback: `MediaRecorder` em tempo real.
12. **Interface**: painéis gerados a partir do estado. Os controles escrevem direto na camada e chamam `changed()`. `rangeF`: o número ao lado da barra é um campo digitável (vírgula ou ponto, Enter confirma, Esc cancela, setas ±passo, Shift ×10); a escala da exibição (×100 para %) é deduzida do próprio `fmt`.

## Convenções

- **Nada toca sozinho.** A animação só roda com a barra de espaço ou o botão ▶. Ações (adicionar, trocar preset, aplicar roteiro, arrastar na timeline) só levam a agulha pausada a um quadro útil (`seekLayer`, `seekOut`, `heroTime`). Não chamar `play()` em outro lugar.

- Todo quadro precisa ser determinístico a partir de `t` (nada de `Math.random()` no render; use `rand(i, j)`).
- Novos presets: adicione em `TP`/`BP` e na lista do tipo correspondente. Respeite a regra da identidade em `e=1, p=1`.
- Textos da interface em pt-BR, frases curtas.
- Sem dependências novas sem necessidade; se precisar, vendorizar em `vendor/`.

## Histórico

- Existe também uma versão publicada como artifact no claude.ai (arquivo único, download via capability `downloads` do Claude). Esta pasta é a versão local: o download usa `<a download>`.

## Próximos passos considerados

- Trilha sonora (upload de MP3 → `AudioEncoder` AAC → faixa de áudio no MP4).
- Exportar 1:1, 4:5 e 9:16 de uma vez.
- Mais roteiros e presets (transições entre cenas, destaque de preço, contagem regressiva).
- Posições por formato (hoje `x`/`y` são os mesmos em todos os formatos).
