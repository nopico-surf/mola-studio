---
name: carrossel-margem
description: Cria carrosséis de Instagram da Margem (roteiro, legenda e .json pronto pra importar no Mola). Use sempre que pedirem carrossel, post em slides ou conteúdo de feed da Margem.
---

# Carrossel da Margem

Entrega, nesta ordem: **roteiro slide a slide + legenda + descrição das fotos** → aprovação → **arquivo .json do Mola** (mola.app.br, "Importar .json"). Quem aprova é o Vitor, sempre antes de gerar o .json.

## 0. Preparar o kit (uma vez por sessão)

O kit (gerador, template, fontes e prévia) mora no repositório do Mola, pasta `kit-carrossel-margem/` (github.com/nopico-surf/mola-studio).
```bash
git clone --depth 1 https://github.com/nopico-surf/mola-studio /home/claude/mola-studio 2>/dev/null || git -C /home/claude/mola-studio pull -q
ls /home/claude/mola-studio/kit-carrossel-margem >/dev/null 2>&1 || { git -C /home/claude/mola-studio fetch -q --depth 1 origin kit-carrossel-margem && git -C /home/claude/mola-studio checkout -q FETCH_HEAD; }
cd /home/claude/mola-studio/kit-carrossel-margem && mkdir -p roteiros saida
```
Se o clone for recusado, use `add_repo` (nopico-surf/mola-studio) antes. **Nunca** leia o `template_mola.json` (240 KB): só os scripts mexem nele.

## 1. Briefing

Campos (os mesmos do prompt do Notion): **tema, público, objetivo, mensagem central**. Se faltar algo essencial, pergunte uma vez só e siga. Decida também:
- **Linha editorial:** `álcool e outras drogas` ou `saúde mental geral` (sem falar de substância).
- **Estilo:** `impacto` (passo a passo, orientação prática, alerta, frases fortes) ou `informativo` (guia, lista de recursos, explicação de serviço).

## 2. Olhar o que tem funcionado (rápido)

Metricool, brandId `7438613`, fuso `America/Sao_Paulo`.
- Posts: `getAnalyticsDataByMetrics` com `IGPO01, IGPO03, IGPO07, IGPO14, IGPO12, IGPO15, IGPO27, IGPO10` nos últimos 60 dias.
- Anúncios (quando fizer sentido): rede `metaAds`, campos `FACA05, FACA07, FACA12, FACA13, FACA46, FACA47, FACA74`.
- **Indicador principal: (salvamentos + compartilhamentos) ÷ alcance.** É o que a Meta mais pesa. Use pra escolher ângulo e CTA, sem despejar números no roteiro.
- Referência de out/2026: carrossel tem mediana de 8,4% de engajamento contra 3,9% da imagem única. Melhores em salvar+compartilhar: Filmes (8%), Setembro Amarelo crítico (6,1%), Redes de apoio (4%).

## 3. Escrever o roteiro

### Estrutura que funciona (adaptada da Terabrigo, @terabrigo)
1. **Capa = uma tese, não um tema.** Opinião curta e afirmativa ("Descansar virou privilégio"), não rótulo ("Saúde mental e trabalho").
2. **Validação logo no começo:** tirar a culpa de quem lê ("Não é você", "Não é frescura").
3. **Cada slide se sustenta sozinho:** manchete curta + texto curto. Precisa fazer sentido se alguém printar e mandar no direct.
4. **Dado concreto, o mais atual que existir, com fonte confiável** em pelo menos um slide. **Sempre** buscar na web antes de usar (modo `extended`, com o ano corrente na busca), mesmo que o número pareça conhecido: dado de memória fica velho. Use o ano mais recente publicado e diga o ano no slide ("Em 2025, ..."). Confirme o número em duas fontes (órgão oficial ou veículo que cite o órgão) e, se só houver dado antigo, avise o Vitor no roteiro.
5. **Recorte de quem sofre mais** (classe, território, gênero, raça, pessoas LGBTQIAPN+) e **causa estrutural**.
6. **Virada coletiva e esperançosa sem ingenuidade.**
7. **Ponte:** serviço público + a Margem (site, rede de psicólogos e psiquiatras, redes de apoio).

Não trazer da Terabrigo: confronto partidário, comparações extremas, alarmismo.

### Tipos de slide e campos

Os slides seguem **módulos** (a ordem importa, porque fotos e fundos atravessam de um slide pro outro): `abertura` + `meio` (0, 1 ou 2 vezes) + `fecho`.

**Estilo `impacto`** (9 slides; 6 sem o meio; 12 com o meio 2x)
| Módulo | tipo | campos (limite aproximado de caracteres) |
|---|---|---|
| abertura | `capa` | titulo (30), subtitulo (45), chamada (36, gatilho de salvar) |
| | `passo` | destaque (12, vai em marca-texto), texto (100), foto |
| | `alerta` | titulo (30), texto (210) |
| meio | `dica_foto` | titulo (28), texto (95), foto |
| | `lista` | sobretitulo (24), titulo (18), itens (5 linhas curtas com "• ") |
| | `dica_foto_b` | titulo (24), texto (95), foto |
| fecho | `impacto` | titulo (35, letra gigante), texto (55) |
| | `frase_foto` | titulo (25), texto (90), foto |
| | `cta` | tema (30), link, salvar_titulo, salvar_texto, enviar_titulo, enviar_texto |

**Estilo `informativo`** (7 slides; 5 sem o meio; 9 com o meio 2x)
| Módulo | tipo | campos |
|---|---|---|
| abertura | `capa` | titulo (50, aceita **negrito**), subtitulo (145) |
| | `texto_foto` | texto (200), foto (a foto cobre capa e este slide) |
| | `canais` | titulo (35), texto (110), coluna1 e coluna2 (3 itens curtos cada, separados por \n), nota (60), rodape (evitar: cai fora da margem) |
| meio | `info_esq` | titulo (40), texto (75), foto |
| | `info_dir` | titulo (40), texto (95) |
| fecho | `cta` | contexto (110), salvar_titulo, salvar_texto, enviar_titulo, enviar_texto |
| | `link` | link, texto (60), foto (print do site) |

Campo omitido = camada removida. `**trecho**` = negrito. Logo + somosmargem.com.br aparece em todo slide (já vem no template).

### Regras de layout aprendidas com os ajustes do Vitor
O template já vem assim (aprendido no carrossel "Descansar virou privilégio"); respeite ao escrever:
- Texto ao lado ou acima de foto: largo (~78% do slide), pra caber em poucas linhas e não encostar na foto. Títulos grandes (capa, alerta, lista, impacto): mais estreitos, quebrando em linhas curtas.
- Foto sempre com mesclagem normal (nunca multiply). Foto nunca por cima de texto: o gerador avisa se o texto chega a 50 px da foto.
- Só o frame de dentro segura o layout; frames de fora (frame dentro de frame) ficam sem layout.
- Mancha escura desfocada atrás do logo quando a foto ocupa o topo do slide (passo).
- "Saúde mental e trabalho" (tema do CTA) centralizado.
- Evite número ou palavra órfã na última linha ("546 / mil"): reescreva a frase pra fechar melhor.
- Foto espelhada, ajuste de cor e retoques de texto são decisão de cada post, não regra.
- Quando o Vitor mandar um .json ajustado: `python3 gerar_mola.py` do mesmo roteiro, compare e rode `_aplicar_ajustes.py roteiro.json template_mola.json ajustado.json template_novo.json`, confirme com ele o que vira regra e suba.

### Fotos
Para cada `foto`, escreva uma descrição pronta pra virar prompt no Gemini: pessoa(s) real(is), cena do cotidiano brasileiro, fotografia documental realista, luz natural, **sem texto na imagem**. Rostos diversos. Nada de seringa, pó, pino, garrafa em destaque ou cena de uso.

### CTA: sempre um gatilho de salvar e um de enviar no direct
- **Salvar** diz QUANDO a pessoa vai precisar: "pra ter na mão no próximo rolê", "pra reler quando a culpa bater", "pra consultar quando precisar", "antes que se perca no feed".
- **Enviar** diz PRA QUEM, específico: "pra quem anda cansado demais", "no grupo de quem vai com você", "pra quem está tentando ajudar alguém", "pra aquela pessoa que sempre diz que tá tudo bem".
- Títulos: "Salve este post" / "Envie no direct" (ou "Mande pra alguém"). Varie os textos de apoio entre posts; não repita o mesmo par duas vezes seguidas.
- Na capa, a `chamada` já puxa o salvamento.

### Legenda
Pessoa falando com pessoa, parágrafos curtos, presente do indicativo, "a gente". Abre com a tese em outras palavras, desenvolve em 2 ou 3 parágrafos, termina com **uma** pergunta pra comentário **ou** um convite pro direct ("Manda pra quem..."). Se houver dado: `📚 Fonte: ...` no fim. Link: "link na bio ou somosmargem.com.br/<caminho>". Sem hashtags em excesso (no máximo 3).

## 4. Revisão antes de mostrar (não pular)

Tom de voz (guia completo no PDF do projeto `Tom_de_Voz_Margem_Completo.pdf`):
- **Zero travessão** (— ou –). O gerador bloqueia.
- Pessoa antes da situação: "pessoas que fazem uso", nunca "usuário de drogas", "viciado", "drogado", "dependente" como rótulo.
- Nada que culpe ("é só procurar ajuda", "basta se organizar", "quem quer consegue") e nada que prometa resultado.
- Sem linguagem corporativa vazia (soluções, gerar impacto, transformar realidades, jornada de cuidado, empoderar).
- Não presumir que todo mundo quer parar; redução de danos é cuidado.
- Reconhecer barreiras reais ("nem sempre dá", "se conseguir").
- Imperativo como convite (salve, envie, conheça, conte), nunca ordem.
- Uma ideia principal por post.

Curadoria clínica (psicólogo TCC, psiquiatra, assistente social, pessoa que já passou por isso, pessoa espiritualizada): a orientação está correta e segura? Sinais de emergência estão certos? Serviço indicado existe e atende esse caso? Alguém em sofrimento se reconheceria sem se sentir julgado?

Critérios de linguagem (Notion, "Critérios para avaliar decisões"): culpa ou humilha alguém? Reduz a pessoa ao problema? Impõe uma única resposta? Pessoas afetadas se reconheceriam?

Dados: todo número do roteiro e da legenda saiu de uma busca feita agora? É o ano mais recente disponível? A fonte está na legenda (`📚 Fonte: órgão, dados de <ano>`)?

Rede da Margem: **psicólogos e psiquiatras** com valor social (somosmargem.com.br/profissionais). Sempre falar dos dois quando citar a rede ("a rede de psicólogos e psiquiatras da Margem"), nunca só psicólogos.

Telefones e serviços já usados pela Margem: CVV 188 (24h, gratuito), SAMU 192, CAPS e CAPS AD (SUS, portas abertas), UBS (porta de entrada do SUS), Disque Social 121. Qualquer número ou serviço fora dessa lista: confirmar com busca na web antes.

Temas de saúde mental com risco (suicídio, autolesão, crise): sem detalhes de método, sempre com CVV 188 e SAMU 192, foco em pedir ajuda.

## 5. Mostrar o roteiro

Formato no chat: estilo, linha editorial, e uma tabela slide | tipo | texto de cada campo | foto. Depois a legenda. Sem gerar o .json ainda.

## 6. Gerar o .json (depois do ok)

1. Escreva o roteiro em `roteiros/<slug>.json` (dentro da pasta do kit; `roteiros/` e `saida/` não vão para o repositório):
```json
{"estilo": "impacto", "slides": [
  {"tipo": "capa", "titulo": "...", "subtitulo": "...", "chamada": "..."},
  {"tipo": "passo", "destaque": "...", "texto": "...", "foto": "descrição"},
  ...
  {"tipo": "cta", "tema": "...", "link": "somosmargem.com.br/profissionais", "salvar_titulo": "Salve este post", "salvar_texto": "...", "enviar_titulo": "Envie no direct", "enviar_texto": "..."}
]}
```
2. Rode: `python3 gerar_mola.py roteiros/<slug>.json template_mola.json saida/<slug>.json`
3. **Todo AVISO precisa ser resolvido** (encurtar o texto e gerar de novo). Se encurtar mudar o sentido, avise o Vitor.
4. **Prévia real no Mola** (sempre, antes de entregar): `npm i playwright --silent` numa pasta à parte (uma vez) e `NODE_PATH=<pasta>/node_modules node previa_mola.js saida/<slug>.json previa.png`. Abra o PNG (Read): é o carrossel inteiro renderizado pelo próprio Mola. Confira texto cortado, sobreposto ou escondido atrás de foto; corrija e gere de novo. Os espaços de foto aparecem como retângulos verdes translúcidos.
5. Entregue com `SendUserFile` (display `attach`) e diga: importar no Mola, colar as fotos nos espaços marcados (o nome da camada traz a descrição), exportar PNG.

## 7. Depois de publicado (quando pedirem)

Horário: `getBestTimeToPostByNetwork` (instagram, próxima semana). Referência de out/2026: pico às 10h de terça a sexta (sexta é o maior), segunda opção 18h a 19h de terça a quinta, fim de semana rende metade; agendar uns 15 min antes do pico. Agendar no Metricool só com as imagens finais (o Vitor exporta do Mola). Uma semana depois, comparar (salvamentos + compartilhamentos) ÷ alcance com a mediana dos carrosséis.

## Notas técnicas do Mola (pra manutenção)
- Formato 3x4 (1080x1440), margem 90 nas laterais e no topo, **280 embaixo**.
- Camadas em uma tela larga: parte inteira de `x` = slide, decimal = posição. `x`/`y` são o centro.
- `size` e `mh` = largura e altura em larguras de slide. Formas "caneta" (`comp: pen`) usam coordenadas absolutas no path.
- O template vem de dois carrosséis reais: "Guia de redes de apoio" (informativo) e "Alguém passou mal no rolê" (impacto). Pra um estilo novo, peça um carrossel exemplo exportado do Mola, ajuste os índices de camada em `_extrair_template.py`, gere o template e suba a mudança no repositório (com o ok do Vitor).
