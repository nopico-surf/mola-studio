# Identidade visual da Mola

Inspirada no GitHub (tema escuro do Primer): fundo quase preto, texto branco-azulado, logo monocromático num círculo, verde para a ação principal e as cores de estado do GitHub como paleta de apoio.

Arquivos desta pasta:

| Arquivo | O que é |
|---|---|
| [mola-identidade.json](./mola-identidade.json) | Arquivo para importar no Mola (Arquivo → Importar .json). Traz logo, fontes, paleta completa e um anúncio de exemplo. |
| [mola-logo.svg](./mola-logo.svg) | Assinatura (símbolo + "Mola"), clara, para fundo escuro. É o logo de dentro do .json. |
| [mola-logo-claro.svg](./mola-logo-claro.svg) | Mesma assinatura em `#1F2328`, para fundo claro. |
| [mola-simbolo.svg](./mola-simbolo.svg) | Só o símbolo (avatar, favicon, marca d'água). |

## 1. Logo

- **Símbolo**: círculo cheio com uma mola vazada no meio (a cor do fundo aparece por dentro), como o Octocat do GitHub.
- **Nome**: "Mola" em Mona Sans Bold (700), convertido em curvas (não depende da fonte instalada).
- **Cor**: uma só. `#F0F6FC` no escuro, `#1F2328` no claro. Nada de degradê nem de duas cores.
- **Respiro mínimo**: metade da altura do símbolo em volta.
- **Tamanho mínimo**: símbolo com 16 px; assinatura com 80 px de largura.
- No Mola, para trocar a cor do logo num anúncio use **Pintar o logo de uma cor só** na camada do logo (não precisa de outro arquivo).

Construção (unidades do SVG, para refazer igual se precisar):

| Peça | Medida |
|---|---|
| Círculo | raio 50, centro (0, 0) |
| Mola | 4 anéis elípticos (raio 8 × 21, traço 6,5), a 13 de distância, inclinados 18°, girados 90° (empilhados na vertical) |
| Nome | altura das maiúsculas = 50, linha de base em y = 25 (maiúsculas centradas no círculo), começa 24 depois do círculo |

## 2. Cores

Todos os valores são os oficiais do tema escuro do GitHub (Primer). Cor com opacidade está em `#rrggbbaa` (o Mola aceita direto).

### Marca (as 5 que o Mola usa como padrão)

| Papel no Mola | Nome | Hex | Primer | Uso |
|---|---|---|---|---|
| Fundo | Fundo | `#0D1117` | `bgColor-default` | fundo dos anúncios |
| Texto | Texto | `#F0F6FC` | `fgColor-default` | títulos, logo |
| Destaque | Verde | `#3FB950` | `fgColor-success` | palavra em destaque, linhas, contorno do logo se desenhando |
| Apoio | Cartão | `#151B23` | `bgColor-muted` | cartões, caixas, luz do fundo |
| Profundo | Noite | `#010409` | `bgColor-inset` | fundo mais fundo, faixas, vinheta |

### Paleta de marca (primária, secundária e apoio)

A primária é o verde do GitHub. Para **anúncio** existe uma versão vibrante do mesmo verde (mesmo matiz, mais saturada e mais clara): é ela que chama atenção no feed. O verde calmo (`#3FB950`) fica para texto, contorno e interface.

| Papel | Nome | Hex | Uso |
|---|---|---|---|
| Primária | Primária | `#3FB950` | destaque do dia a dia, linhas, selos |
| Primária forte | Primária forte | `#238636` | botão com texto branco |
| Primária vibrante | Vibrante (anúncio) | `#2EE06A` | **só em anúncio**: palavra de impacto, preço, botão no feed |
| Secundária | Secundária | `#4493F8` | segunda cor do anúncio, links, dados |
| Terciária | Terciária | `#AB7DF8` | variação de peça, categorias |
| Acento | Acento | `#D29922` | aviso, estrela, destaque pontual |

### Escala do verde

| Nível | Hex | Nota |
|---|---|---|
| 100 | `#D3F9DF` | fundo claro, selo em fundo claro |
| 200 | `#A2F2BC` | |
| 300 | `#6BEA97` | |
| 400 | `#2EE06A` | **vibrante (anúncio)** |
| 500 | `#3FB950` | **marca (primária)** |
| 600 | `#2EA043` | |
| 700 | `#238636` | primária forte |
| 800 | `#1A6A2D` | |
| 900 | `#124A21` | |
| 950 | `#0A2E15` | fundo esverdeado escuro |

### Vibrantes (anúncio)

Versões mais saturadas das cores de apoio, para quando a peça precisa saltar no feed. Uma vibrante por peça, no máximo duas; o resto continua nas cores calmas.

| Cor | Hex |
|---|---|
| Verde | `#2EE06A` |
| Limão | `#C6F135` |
| Amarelo | `#FFD23F` |
| Laranja | `#FF8A3D` |
| Vermelho | `#FF4D4D` |
| Rosa | `#FF4FA3` |
| Roxo | `#9B6BFF` |
| Azul | `#3B9EFF` |

Texto sobre cor vibrante: `#010409` (escuro), nunca branco (o contraste do branco cai em verde, limão e amarelo).

### Cinzas

| Nome | Hex | Primer |
|---|---|---|
| Noite | `#010409` | `bgColor-inset` |
| Fundo | `#0D1117` | `bgColor-default` |
| Cartão | `#151B23` | `bgColor-muted` |
| Elevado | `#212830` | botão secundário |
| Borda | `#3D444D` | `borderColor-default` |
| Neutro | `#656C76` | `bgColor-neutral-emphasis` |
| Texto apagado | `#9198A1` | `fgColor-muted` |
| Claro | `#D1D7E0` | escala neutra |
| Texto | `#F0F6FC` | `fgColor-default` |
| Branco | `#FFFFFF` | `fgColor-onEmphasis` |

### Cores de estado (5 níveis por cor)

| | Cores (texto/ícone) | Fortes (fundo com texto branco) | Suaves (fundo de selo) | Contornos (borda de selo) |
|---|---|---|---|---|
| Azul | `#4493F8` | `#1F6FEB` | `#388BFD1A` | `#388BFD66` |
| Verde | `#3FB950` | `#238636` | `#2EA04326` | `#2EA04366` |
| Amarelo | `#D29922` | `#9E6A03` | `#BB800926` | `#BB800966` |
| Laranja | `#DB6D28` | `#BD561D` | `#DB6D281A` | `#DB6D2866` |
| Vermelho | `#F85149` | `#DA3633` | `#F851491A` | `#F8514966` |
| Roxo | `#AB7DF8` | `#8957E5` | `#AB7DF826` | `#AB7DF866` |
| Rosa | `#DB61A2` | `#BF4B8A` | `#DB61A21A` | `#DB61A266` |

Regras:
- **Verde é a cor da marca**: ação principal (botão) e destaque. As outras cores são de apoio (selos, gráficos, categorias), uma por peça.
- **Calmo × vibrante**: o editor (interface) e peças institucionais usam as cores calmas; anúncio de performance usa a vibrante da mesma família.
- Texto em cima de cor forte é sempre `#FFFFFF`.
- Selo = fundo Suave + texto na Cor da mesma linha (ex.: `#2EA04326` + `#3FB950`, como o "Preview" do GitHub).
- Texto secundário em `#9198A1`, nunca o branco com opacidade.

## 3. Tipografia

Fontes livres (OFL) do próprio GitHub, todas no Google Fonts (o Mola carrega sozinho).

| Papel no Mola | Fonte | Pesos | Uso |
|---|---|---|---|
| Títulos | Mona Sans | 700–800 | chamadas grandes, espaçamento −3% (`ls -0.03`), entrelinha 1,02 |
| Textos | Mona Sans | 500–600 | subtítulo (500), botão e selo (600), entrelinha 1,2 |
| Números / impacto | Hubot Sans | 700–800 | número grande, preço, palavra de impacto |
| (extra) | JetBrains Mono | 400–700 | código, dados, etiquetas técnicas (o GitHub usa Monaspace, que não está no Google Fonts) |

Tamanhos de referência no vídeo (largura 1080): título 96–120, subtítulo 36–44, botão 36–40, selo 26–30, legal/rodapé 24.

## 4. Peças nos anúncios

| Peça | Como fica |
|---|---|
| Fundo | `#0D1117` liso ou Holofote com `#151B23` (bem sutil), granulado 0–3% |
| Botão principal | fundo `#238636`, texto `#FFFFFF`, Mona Sans 600, cantos 16, respiro 48 × 24 |
| Botão secundário | fundo `#212830`, texto `#F0F6FC`, mesmos cantos |
| Selo ("Novo") | fundo `#2EA04326`, texto `#3FB950`, Mona Sans 600, cantos totalmente arredondados |
| Cartão | forma retângulo `#151B23`, contorno `#3D444D` de 2 px, cantos 24 |
| Destaque no título | trecho do título na cor `#3FB950` |
| Animação | calma: entrada por máscara/desfoque, botão sem pulsar, logo se desenhando em `#F0F6FC` |

## 5. Na interface do Mola

Aplicado em `css/app.css` (`:root`). A interface é **neutra** (cinza sem tom), com contraste suave, e o verde só aparece onde há seleção ou foco. As regras estão no `CLAUDE.md` (Aparência da interface).

| Token | Valor | Nota |
|---|---|---|
| `--bg` / `--panel` / `--raised` / `--raised-2` | `#0C0C0D` / `#161617` / `#1F1F21` / `#29292B` | superfícies, do mais fundo ao mais alto |
| `--line` / `--line-2` | `#2A2A2C` / `#3B3B3E` | bordas |
| `--fg` / `--muted` / `--faint` | `#DDDDDD` / `#9C9C9C` / `#6F6F6F` | texto (sem branco puro) |
| `--accent` | `#6A9C79` | verde calmo: seleção e foco (palco, campo, chip marcado, caixa marcada) |
| `--btn` / `--btn-ink` | `#CBCBCB` / `#141414` | botão principal e avisos com ação |
| `--margin-rgb` / `--frame-rgb` | `160,140,230` / `122,160,230` | guias do palco: margem roxa, quadro azul |
| `--c-*` | por tipo de camada | texto `#6B9FE8`, logo `#C79B3A`, botão `#78A98A`, imagem `#D07AA8`, forma `#A68DE8`, fundo `#8A9199`, grupo `#D07A3F` |
| Fontes | Mona Sans (UI e títulos), JetBrains Mono | |

O logo da barra de cima e o favicon ainda podem trocar pelo [mola-simbolo.svg](./mola-simbolo.svg) (pendente).
