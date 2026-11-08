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
- **Estilo:** `atual` é o padrão (o visual dos posts de nov/2026, ver "Estilo `atual`" na seção 3). `impacto` (listras e verde-limão) e `informativo` são o visual antigo: só quando o Vitor pedir.
- **Gancho de capa:** escolha um dos modelos da seção 3 (identificação, lembrete, o que ninguém avisa, fala de pessoa, pergunta direta, quebra de mito).

## 2. Olhar o que tem funcionado (rápido)

Metricool, brandId `7438613`, fuso `America/Sao_Paulo`.
- Posts: `getAnalyticsDataByMetrics` com `IGPO01, IGPO03, IGPO07, IGPO14, IGPO12, IGPO15, IGPO27, IGPO10` nos últimos 60 dias.
- Anúncios (quando fizer sentido): rede `metaAds`, campos `FACA05, FACA07, FACA12, FACA13, FACA46, FACA47, FACA74`.
- **Indicador principal: (salvamentos + compartilhamentos) ÷ alcance.** É o que a Meta mais pesa. Use pra escolher ângulo e CTA, sem despejar números no roteiro.
- O engajamento que sites como o HypeAuditor mostram (mediana dos últimos 12 posts, só curtidas e comentários) não conta salvamento nem envio. Serve de referência de mercado, não de comparação direta com a métrica da Margem.
- Referência de out/2026: carrossel tem mediana de 8,4% de engajamento contra 3,9% da imagem única. Melhores em salvar+compartilhar: Filmes (8%), Setembro Amarelo crítico (6,1%), Redes de apoio (4%).

## 3. Escrever o roteiro

### Estrutura que funciona (adaptada da Terabrigo, @terabrigo)
1. **Capa = uma tese, não um tema.** Opinião curta e afirmativa ("Descansar virou privilégio"), não rótulo ("Saúde mental e trabalho").
2. **Validação logo no começo:** tirar a culpa de quem lê ("Não é você", "Não é frescura").
3. **Cada slide se sustenta sozinho:** manchete curta + texto curto. Precisa fazer sentido se alguém printar e mandar no direct.
4. **Dado concreto, o mais atual que existir, com fonte confiável** em pelo menos um slide. **Sempre** buscar na web antes de usar (modo `extended`, com o ano corrente na busca), mesmo que o número pareça conhecido: dado de memória fica velho. Use o ano mais recente publicado e diga o ano no slide ("Em 2025, ..."). Confirme o número em duas fontes (órgão oficial ou veículo que cite o órgão) e, se só houver dado antigo, avise o Vitor no roteiro.
5. **Recorte de quem sofre mais** (classe, território, gênero, raça, pessoas LGBTQIAPN+) e **causa estrutural**.
6. **Virada coletiva e esperançosa sem ingenuidade.**
7. **Ponte:** serviço público primeiro, depois a Margem (site, rede de psicólogos e psiquiatras, redes de apoio). Detalhes na seção "A Margem no conteúdo".

Não trazer da Terabrigo: comparações extremas e alarmismo. Confronto político e partidário entra, pelas regras da seção "Pauta política e eleitoral" (fato com fonte, sem ataque pessoal, sem campanha no perfil da Margem).

### Ganchos de capa (estudo de perfis de saúde mental no Instagram, out/2026)

O estudo olhou os posts de maior desempenho de @drjulie, @nedratawwab, @therapyjeff, @dralexgeorge e @the.holistic.psychologist. O que se repete:

| Gancho | Modelo | Origem |
|---|---|---|
| Identificação | "Mais alguém sente [vivência concreta] e acha que tem algo errado?" | Alex George, 524K views |
| Lembrete | "Esse é seu lembrete de que [X] não é falta de força." | padrão recorrente |
| O que ninguém avisa | "O sintoma de [X] que ninguém te avisa." | Julie Smith, ansiedade |
| Fala de pessoa | "'Eu fico [X] quando [situação]'. Se você já disse isso, esse post é pra você." | Therapy Jeff, reel mais visto |
| Pergunta direta | "Quando foi a última vez que você [vivência]?" | padrão recorrente |
| Quebra de mito | "[X] não é preguiça. Olha o que acontece." | padrão recorrente |

Regras do gancho:
- Começa na **vivência da pessoa**, não no conceito ("barriga embrulhada antes de conversar" vence "o que é ansiedade").
- **A Margem nunca aparece na capa nem no gancho.**
- Fala de pessoa real: sempre anônima e genérica, sem caso identificável.
- Gancho polarizador rende comentário (um post do Therapy Jeff teve 3x mais), mas em tema vulnerável não combina com a Margem. Prefira terminar com uma pergunta de comentário em vez de provocar briga.

### Padrões de conteúdo que se confirmaram nos posts reais
- **Uma ideia por post.** Se aparecer a segunda, vira outro post. Um post de uma frase da Nedra teve 16,3K curtidas contra 1,5K de um texto longo (11x).
- **Imagem concreta para explicar algo abstrato** (objeto, comparação do dia a dia). O reel mais visto da Julie Smith (15,4M) usa um objeto físico. Exemplo: "o corpo liga o alarme como um alarme de carro que toca com o vento".
- **Normalizar o que dá vergonha** ("Isso é muito mais comum do que parece") antes de explicar.
- **Pedido explícito de salvar**, com o momento de uso ("Salva pra próxima vez que...").
- **Termos técnicos só na legenda**, se a equipe clínica quiser. Nunca na tela.
- **Alcance não é utilidade.** O maior reel do Alex George foi conteúdo leve de TV. Escolha ângulo por salvamento e envio, não por views.

### Tipos de slide e campos

Os slides seguem **módulos** (a ordem importa, porque fotos e fundos atravessam de um slide pro outro): `abertura` + `extra` (0 ou 1 vez, logo depois da abertura) + `meio` (0, 1 ou 2 vezes) + `fecho`. O `extra` é um slide só de texto que repete o último tipo da abertura (`alerta` no impacto, `canais` no informativo). Ele foi conferido na prévia do Mola e não desalinha fotos nem fundos.

**Regras fixas do Vitor (nov/2026):**
- **Sempre 10 slides.** Atual = abertura (3) + meio 1x (4, com a dupla de foto que vaza) + fecho (3), sem extra. Impacto = abertura (3) + `alerta` extra + meio 1x (3) + fecho (3). Informativo = abertura (3) + `canais` extra + meio 2x (4) + fecho (2). O gerador avisa quando o carrossel não tem 10.
- **Visual dos posts mais recentes.** Quando o Vitor mudar o visual, peça o .json do carrossel novo (no Mola, "Exportar .json", ou a pasta `Documentos/Mola_Design/Mola Studio/arquivos` no computador dele, só leitura) e refaça o estilo com um script como `_estilo_atual.py`.
- **Psicólogos e psiquiatras da Margem aparecem sempre** no carrossel, em um slide próprio ou dividindo o slide com o fecho (frase padrão da seção "A Margem no conteúdo"), depois do serviço público.
- **Capa sem CTA.** O campo `chamada` da capa fica de fora (omitir remove a camada). Os gatilhos de salvar e enviar entram ao longo dos slides e no `cta` final.

**Estilo `atual`** (o padrão; 10 slides: capa, virada, card, dupla_esq, dupla_dir, card_lista, foto_baixo, impacto, foto_cheia, cta)

Tirado de dois carrosséis reais de nov/2026 ("Consulta psiquiátrica não deveria ser um privilégio" e "O que o novo estudo sobre duas doses de álcool por dia mostra"; script `_estilo_atual.py`). Fundo verde-menta alternando com verde escuro, cartões verde-escuros de cantos arredondados, fotos documentais com degradê verde, Urbanist, sem listras. Do "Guia de redes de apoio" vem a dupla dos slides 4 e 5 (uma foto só atravessando os dois); do "Redução de danos intranasal", o slide de impacto em verde-limão e os títulos com peso misturado. Ritmo de fotos: 1-2 foto, 3 cartão, 4-5 foto, 6 cartão, 7 foto, 8 limão, 9 foto, 10 CTA (nunca dois slides sem foto seguidos, a não ser o 8 e o 10).
| Módulo | tipo | campos (limite aproximado de caracteres) |
|---|---|---|
| abertura | `capa` | etiqueta (36, pílula verde-menta: o contexto, ex.: "Pra quem convive com alguém que usa"), titulo (3 linhas curtas; quebre com \n onde a frase respira; `**trecho**` sai mais leve em verde-menta). Logo + "Arrasta pro lado ➔" já vêm no slide |
| | `virada` | titulo (20, com fundo verde-escuro atrás), texto (70), foto **larga** (ver Fotos) |
| | `card` | titulo (26), texto (110), cartão verde-escuro |
| meio | `dupla_esq` | titulo (26, 2 linhas), texto (90), foto **larga** que atravessa os slides 4 e 5 |
| | `dupla_dir` | titulo (22, alinhado à direita), texto (90); usa a mesma foto |
| | `card_lista` | titulo (30), subtitulo (30), itens (5 linhas com "• ", até ~28 caracteres cada) |
| | `foto_baixo` | titulo (18, 1 linha), texto (45), foto grande embaixo |
| fecho | `impacto` | titulo (22, letra grande), texto (70); fundo verde-limão |
| | `foto_cheia` | titulo (16), texto (120): apoio público + psicólogos e psiquiatras da Margem |
| | `cta` | link, tema (28), salvar_titulo, salvar_texto, enviar_titulo, enviar_texto |

Títulos com `**trecho**` fora da capa: o resto do título fica regular e o trecho em negrito ("O uso costuma **aliviar algo**"), como no post intranasal. Ainda fora do template (o post intranasal não está no Mola): etiqueta "✕ tema" no topo, ilustração em traço no lugar de foto e caixa só com contorno para "O que fazer".

**Estilo `impacto`** (visual antigo; 10 slides: capa, passo, alerta, alerta extra, dica_foto, lista, dica_foto_b, impacto, frase_foto, cta)
| Módulo | tipo | campos (limite aproximado de caracteres) |
|---|---|---|
| abertura | `capa` | titulo (30), subtitulo (45); `chamada` não se usa mais |
| | `passo` | destaque (12, vai em marca-texto), texto (100), foto |
| | `alerta` | titulo (30), texto (210) |
| meio | `dica_foto` | titulo (28), texto (95), foto |
| | `lista` | sobretitulo (24), titulo (18), itens (5 linhas curtas com "• ") |
| | `dica_foto_b` | titulo (24), texto (95), foto |
| fecho | `impacto` | titulo (35, letra gigante), texto (55) |
| | `frase_foto` | titulo (25), texto (90), foto |
| | `cta` | tema (30), link, salvar_titulo, salvar_texto, enviar_titulo, enviar_texto |

**Estilo `informativo`** (10 slides: capa, texto_foto, canais, canais extra, info_esq, info_dir, info_esq, info_dir, cta, link)
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

### Roteiro de 10 slides com apoio público e Margem como ponte (versão em texto)

Use quando o tema pede passo a passo e encaminhamento. É uma **estrutura de conteúdo**: mapeie cada slide para os tipos acima, sem inventar tipo novo nem mexer no template. São sempre 10 slides, e o slide da Margem (psicólogos e psiquiatras) é obrigatório.

| Slide | Função | O que escrever | Evitar |
|---|---|---|---|
| 1 | Capa, gancho | Pergunta de identificação ou lembrete | Termo técnico, Margem |
| 2 | Normalizar | "Isso acontece com muita gente." + 1 frase de contexto | Sugerir que é raro |
| 3 | O que acontece | Linguagem do dia a dia, com comparação concreta | Jargão |
| 4 | O que a pesquisa mostra | 1 frase com o achado, ano e fonte | Número solto, promessa |
| 5 | Passo pequeno | 1 ação com "se der" | "Basta", "é só" |
| 6 | Limite e contexto | "Nem sempre dá, e o contexto pesa" + o que costuma impedir (tempo, dinheiro, rede) | Culpar a pessoa |
| 7 | Apoio público | UBS, CAPS (e CAPS AD se for uso de álcool e outras drogas) e CVV 188, cada um com o que faz | Prometer o que o serviço não faz |
| 8 | Psicólogo ou psiquiatra? | Quadro "quando procurar qual" (abaixo) | Indicar medicação sem avaliação |
| 9 | Checklist do que fazer hoje | 4 a 5 itens práticos | Mais de 5 itens |
| 10 | Margem como ponte + fecho | Frase de ponte, CTA "Ver psicólogo e psiquiatra parceiros", gatilho de salvar e de enviar | "Saiba mais" |

Sugestão de mapeamento (a ordem dos tipos é fixa; as funções se encaixam nela): no atual, `virada` = validação, `card` = o que acontece, `dupla_esq`/`dupla_dir` = pesquisa e normalização, `card_lista` = passos ou checklist, `foto_baixo` = limite e contexto ou cuidado de si, `impacto` (limão) = segurança ou alerta, `foto_cheia` = apoio público + Margem, `cta` = fecho. No impacto, `alerta` extra = dado da pesquisa ou normalização, `lista` = passos ou checklist, `dica_foto_b` = apoio público, `impacto` = limite ou segurança, `frase_foto` = Margem (psicólogos e psiquiatras), `cta` = fecho. No informativo, `canais` e `canais` extra = apoio público e grupos, `info_dir` = psicólogo ou psiquiatra, `link` = Margem.

**Quadro do slide 8 (psicólogo ou psiquiatra?)**
> Quer entender o que sente e aprender a lidar? **Psicólogo.**
> Sintoma forte, sono ou apetite bem alterados, sem melhora? **Psiquiatra.**
> Muita gente faz os dois. Risco agora? **CVV 188** ou **SAMU 192**.

Psicólogo: espaço pra conversar com regularidade e trabalhar o que pesa, com técnicas que a pesquisa apoia, como a TCC. Psiquiatra: médico que avalia o quadro todo e pode indicar medicação quando fizer sentido, ou não.

**Checklist do slide 9 (modelo):** respirar devagar uma vez; beber água e comer algo; contar pra uma pessoa de confiança; anotar quando e onde acontece; ir à UBS se repetir ou pesar. Ajuste ao tema.

**Estilo impacto para barreira estrutural:** slides do meio com uma frase só, alternando "o que dizem" e "o que acontece de verdade" (ex.: "Dizem: procure ajuda. Na prática: a consulta custa mais que a conta de luz."). Serve pra Setembro Amarelo, acesso desigual e invisibilidade. Apoio público e Margem seguem nos dois últimos slides.

### A Margem no conteúdo (regras de presença)
1. **Nunca no gancho nem na capa.** O começo é a pessoa e a vivência dela.
2. **Ponte, nunca salvadora.** Frase padrão: "A Margem conecta você a psicólogos e psiquiatras parceiros. Cada pessoa no seu tempo." Nunca "a Margem cuida", "a Margem resolve", "a Margem salva". Voz de marca: "a gente".
3. **Ordem dos apoios:** serviço público primeiro (UBS, CAPS, CVV), depois a rede da Margem. Nem todo mundo pode pagar, e a Margem não compete com o SUS.
4. **Sempre os dois:** ao citar a rede, "psicólogos e psiquiatras", nunca só psicólogos.
5. **CTA específico no infinitivo:** "Ver psicólogo e psiquiatra parceiros" (ou "Ver psicólogo parceiro" / "Ver psiquiatra parceiro" quando o post for sobre um só). Nunca "Saiba mais" nem "Ver profissional".
6. **Valor de sessão:** não colocar preço no texto público enquanto o valor social (R$ 60 a 200) não estiver confirmado como ativo. Se estiver, dizer "sessões com valor social".
7. **Regras de publicidade:** psicólogos (CFP) e médicos (CFM) têm regras próprias. Revisar antes de divulgar nomes, títulos ou preços de profissionais.

### Pauta política e eleitoral
A Margem tem leitura crítica da realidade: problema tratado como falha individual costuma ser produzido por desigualdade, exploração e exclusão. Pauta política e partidária entra, nestas regras:
1. **Partir da estrutura:** quem perde, quem ganha, que serviço some ou chega, qual orçamento mudou. O recorte de quem sofre mais e a causa estrutural aparecem no roteiro.
2. **Fato primeiro, leitura depois:** o slide do fato (lei, votação, orçamento, número) traz fonte e ano, buscados agora. A leitura crítica vem em seguida, dita como leitura da Margem ("a gente enxerga assim").
3. **Nomear política, lei, partido e gestor pelo que fez e votou**, com fonte. Sem adjetivo, sem ataque à pessoa, sem boato, sem trecho de fala fora de contexto.
4. **Voltar pra pessoa e pro serviço:** o fecho leva a algo que dá pra acessar ou fazer (serviço público, rede de apoio, participação coletiva). Esperança coletiva sem ingenuidade.
5. **Sem campanha no perfil da Margem.** O perfil é de pessoa jurídica, e a regra eleitoral veda propaganda eleitoral em perfil de empresa, mesmo gratuita. Então: não pedir voto, não usar "vote em", não usar nome ou número de candidato como chamada, não promover candidato ou partido. Posicionamento sobre política pública e crítica a gestão pelo que foi feito são permitidos. O apoio a candidato fica nos perfis pessoais das pessoas.
6. **Sem anúncio pago em conteúdo eleitoral.** Impulsionar conteúdo eleitoral só é permitido para a candidatura, partido ou federação que contrata. Não impulsionar, pelo Meta Ads da Margem, post sobre candidato ou eleição. Há ainda vedação de impulsionamento de 48h antes a 24h depois da votação.
7. **Sinalizar o risco e moderar:** no roteiro, incluir a linha "Risco político" com o que pode dar errado. Pauta política atrai mais comentário e denúncia, então lembrar de moderar. Em dúvida sobre legalidade, o Vitor consulta advogado eleitoral antes de publicar.

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
Para cada `foto`, escreva uma descrição pronta pra virar prompt (Gemini ou Google Flow): pessoa(s) real(is), cena do cotidiano brasileiro, fotografia documental realista, luz natural, levemente esverdeada como nos posts, **sem texto na imagem**. Rostos diversos. Nada de seringa, pó, pino, garrafa em destaque ou cena de uso. Para fundos mais abstratos, uma linha por slide (ex.: "mãos em volta de uma xícara, luz de fim de tarde, tons quentes, sem rosto").

**Tamanho de cada espaço de foto no estilo `atual`** (pedir a imagem já nesse formato):
- `virada`: **foto larga que vaza** da capa pro slide 2, 2160 × 1440 (3:2). É uma foto só, composta pra cada metade funcionar sozinha: a metade esquerda é o fundo da capa (título embaixo à esquerda, então deixar o rosto no alto ou no meio) e a direita é o slide 2. Começar a descrição com "FOTO LARGA (vaza da capa pro slide 2)".
- `dupla_esq`: **foto larga** dos slides 4 e 5, 2160 × 1440. Uma pessoa em cada metade, rostos próximos (como o "Guia de redes de apoio"), parte de cima mais escura pros títulos.
- `foto_baixo`: 1080 × 918, do meio pra baixo do slide (o texto fica em cima, no verde).
- `foto_cheia`: 1080 × 1440, slide inteiro, com o texto embaixo à esquerda (deixar a parte de baixo mais escura ou vazia).
O template não espelha foto nenhuma; espelhar é decisão de cada post.

### CTA: sempre um gatilho de salvar e um de enviar no direct
- **Salvar** diz QUANDO a pessoa vai precisar: "pra ter na mão no próximo rolê", "pra reler quando a culpa bater", "pra consultar quando precisar", "pra quando o corpo disparar", "antes que se perca no feed".
- **Enviar** diz PRA QUEM, específico: "pra quem anda cansado demais", "no grupo de quem vai com você", "pra quem está tentando ajudar alguém", "pra aquela pessoa que sempre diz que tá tudo bem", "pra quem anda tenso demais".
- Títulos: "Salve este post" / "Envie no direct" (ou "Mande pra alguém"). Varie os textos de apoio entre posts; não repita o mesmo par duas vezes seguidas.
- A capa não leva CTA. Os gatilhos ficam ao longo dos slides e no `cta` final.

### Legenda
**Sempre uma frase e os quatro CTAs, nesta ordem.** Nada de parágrafos explicando o post: o conteúdo está nos slides.

```
<uma frase: a tese em outras palavras, pessoa falando com pessoa>

👉 Salve este post <quando vai precisar>.
👉 Mande no direct <pra quem, específico>.
👉 Comente: <uma pergunta aberta sobre a vivência>
👉 Siga a Margem <pra quê>.

📚 Fonte: <órgão ou estudo, ano>   (só quando o post tem dado)
```
A frase segue o tom de voz (sem travessão, sem culpa, sem promessa). Os textos de salvar e de enviar não repetem os do slide `cta`. Sem hashtags em excesso (no máximo 3).

**Comentário fixado (modelo):** "Se esse post fez sentido, salva. Pra conversar com um psicólogo ou psiquiatra parceiro, o caminho está em somosmargem.com.br."

**Resposta a comentário de quem pede ajuda:** nunca só "obrigado". Leve o serviço certo. Modelo: "Obrigada por contar. Pra conversar com alguém, a UBS do seu bairro e o CVV (188) são um começo. E a Margem conecta você a psicólogos e psiquiatras parceiros em somosmargem.com.br." Se houver sinal de risco imediato: CVV 188 e SAMU 192 primeiro.

### Formatos irmãos (só texto; esta skill gera .json apenas de carrossel)
Quando pedirem reel ou post de frase única, use as mesmas regras de gancho, de Margem e de revisão:
- **Post de frase única:** até 12 palavras, sem termo técnico, uma afirmação de reconhecimento, sem culpa e sem promessa. Fórmulas: reconhecimento ("Cansaço que o sono não resolve também é um sinal."), normalização ("Pedir ajuda é difícil pra quase todo mundo."), contexto ("Nem todo mundo começa do mesmo lugar."), desculpabilização ("Não é falta de esforço. É falta de apoio."), convite ("Você pode ir no seu tempo."), pergunta ("Quem te escuta quando está difícil?"). Legenda em 4 parágrafos curtos: identificação, o que se sabe, apoio público, Margem.
- **Reel (36 a 42s), bloco a bloco:** 0 a 3s gancho (sem Margem); 3 a 8s normalização; 8 a 16s mecanismo com imagem concreta; 16 a 26s no máximo dois passos com "se der" (proibido "basta", "é só", "tem que"); 26 a 30s "Nem sempre dá pra fazer isso na hora, e tudo bem"; 30 a 34s serviço público; 34 a 38s ponte Margem com CTA "Ver psicólogo e psiquiatra parceiros"; 38 a 42s fecho com os dois gatilhos, falados e escritos na tela. Quem fala é alguém da equipe, sem jaleco e sem tom de aula.

## 4. Revisão antes de mostrar (não pular)

Tom de voz (guia completo no PDF do projeto `Tom_de_Voz_Margem_Completo.pdf`):
- **Zero travessão** (— ou –). O gerador bloqueia.
- Pessoa antes da situação: "pessoas que fazem uso", nunca "usuário de drogas", "viciado", "drogado", "dependente" como rótulo.
- Nada que culpe ("é só procurar ajuda", "basta se organizar", "quem quer consegue") e nada que prometa resultado.
- Sem linguagem corporativa vazia (soluções, gerar impacto, transformar realidades, jornada de cuidado, empoderar).
- Não presumir que todo mundo quer parar; redução de danos é cuidado.
- Reconhecer barreiras reais ("nem sempre dá", "se conseguir").
- **Não empurrar só responsabilidade individual.** Frases do tipo "você tem mais poder do que pensa" (Julie Smith) ignoram o contexto. Sempre equilibre com o limite estrutural.
- **Nenhuma afirmação sem base**, no estilo "sentir vontade de se afastar de todos é o começo de um despertar" (LePera). Isolamento pode ser sinal de depressão ou burnout. Se a equipe clínica não consegue sustentar a frase com fonte, ela sai.
- Imperativo como convite (salve, envie, conheça, conte), nunca ordem.
- Uma ideia principal por post.
- **Pauta política:** o fato tem fonte e ano? Há ataque à pessoa, adjetivo ou boato? Há pedido de voto, nome de candidato como chamada ou promoção de partido no perfil da Margem? O post vai ser impulsionado? Se qualquer resposta preocupar, cortar ou avisar o Vitor.

Curadoria clínica (psicólogo TCC, psiquiatra, assistente social, pessoa que já passou por isso, pessoa espiritualizada): a orientação está correta e segura? Sinais de emergência estão certos? Serviço indicado existe e atende esse caso? Alguém em sofrimento se reconheceria sem se sentir julgado? O que cada um confere em especial:
- **Psicólogo (TCC):** passos práticos seguros e realistas; a linguagem não diagnostica.
- **Psiquiatra:** o mecanismo está correto e sem exagero; o quadro "quando procurar qual" não incentiva medicação sem avaliação nem atrasa cuidado médico.
- **Assistente social:** os serviços existem e atendem do jeito dito; o contexto estrutural aparece.
- **Pessoa em recuperação:** a frase soa verdadeira ou texto de marketing?
- **Pessoa espiritualizada:** há um toque humano, sem religião definida?

Critérios de linguagem (Notion, "Critérios para avaliar decisões"): culpa ou humilha alguém? Reduz a pessoa ao problema? Impõe uma única resposta? Pessoas afetadas se reconheceriam?

Dados: todo número do roteiro e da legenda saiu de uma busca feita agora? É o ano mais recente disponível? A fonte está na legenda (`📚 Fonte: órgão, dados de <ano>`)? Contexto de evidência que pode embasar posts de saúde mental: revisão sistemática da UEA (Carter et al., 2026; 27 estudos e 5.057 posts; desinformação em saúde mental de 0% a 56,9%, maior no TikTok, qualidade geralmente melhor quando o conteúdo é feito por profissionais) e pesquisa da Universidade de Birmingham (menos de 1 em cada 5 perfis de influenciadores de saúde mental informava formação). Por isso, mostrar "revisado pela equipe clínica" é vantagem da Margem.

Rede da Margem: **psicólogos e psiquiatras** com valor social (somosmargem.com.br/profissionais). Sempre falar dos dois quando citar a rede ("a rede de psicólogos e psiquiatras da Margem"), nunca só psicólogos.

Telefones e serviços já usados pela Margem: CVV 188 (24h, gratuito), SAMU 192, CAPS e CAPS AD (SUS, portas abertas), UBS (porta de entrada do SUS, sem encaminhamento), Disque Social 121, grupos como AA e NA (só em temas de uso). Qualquer número ou serviço fora dessa lista: confirmar com busca na web antes.

Temas de saúde mental com risco (suicídio, autolesão, crise): sem detalhes de método, sempre com CVV 188 e SAMU 192, foco em pedir ajuda.

Publicidade profissional: psicólogos (CFP) e médicos (CFM) têm regras próprias. Sinalize no roteiro quando citar nome, título ou preço de profissional.

## 5. Mostrar o roteiro

Antes de mostrar, confira: exatamente 10 slides, capa sem CTA, slide com psicólogos e psiquiatras da Margem, legenda com uma frase + os quatro CTAs.

Formato no chat: estilo, linha editorial, gancho escolhido, e uma tabela slide | tipo | texto de cada campo | foto. Depois a legenda, o comentário fixado e o checklist prático. Em pauta política, incluir também a linha "Risco político". Sem gerar o .json ainda.

## 6. Gerar o .json (depois do ok)

1. Escreva o roteiro em `roteiros/<slug>.json` (dentro da pasta do kit; `roteiros/` e `saida/` não vão para o repositório):
```json
{"estilo": "atual", "slides": [
  {"tipo": "capa", "titulo": "texto com **trecho em destaque**"},
  {"tipo": "virada", "titulo": "...", "texto": "...", "foto": "FOTO LARGA (vaza da capa pro slide 2): descrição"},
  ...
  {"tipo": "cta", "tema": "...", "link": "somosmargem.com.br/profissionais", "salvar_titulo": "Salve este post", "salvar_texto": "...", "enviar_titulo": "Envie no direct", "enviar_texto": "..."}
]}
```
2. Rode: `python3 gerar_mola.py roteiros/<slug>.json template_mola.json saida/<slug>.json`
3. **Todo AVISO precisa ser resolvido** (encurtar o texto e gerar de novo). Se encurtar mudar o sentido, avise o Vitor.
4. **Prévia real no Mola** (sempre, antes de entregar): `npm i playwright --silent` numa pasta à parte (uma vez) e `NODE_PATH=<pasta>/node_modules node previa_mola.js saida/<slug>.json previa.png`. Abra o PNG (Read): é o carrossel inteiro renderizado pelo próprio Mola. Confira texto cortado, sobreposto ou escondido atrás de foto; corrija e gere de novo. Os espaços de foto aparecem como retângulos verdes translúcidos.
5. Entregue com `SendUserFile` (display `attach`) e diga: importar no Mola, colar as fotos nos espaços marcados (o nome da camada traz a descrição), exportar PNG.

## 7. Depois de publicado (quando pedirem)

Horário: `getBestTimeToPostByNetwork` (instagram, próxima semana). Referência de out/2026: pico às 10h de terça a sexta (sexta é o maior), segunda opção 18h a 19h de terça a quinta, fim de semana rende metade; agendar uns 15 min antes do pico. Agendar no Metricool só com as imagens finais (o Vitor exporta do Mola). Uma semana depois, comparar (salvamentos + compartilhamentos) ÷ alcance com a mediana dos carrosséis. Teste de gancho: publicar o mesmo conteúdo com dois ganchos em semanas diferentes e comparar. Responda comentários de pedido de ajuda com o serviço certo (modelo na seção de legenda).

## Notas técnicas do Mola (pra manutenção)
- Formato 3x4 (1080x1440), margem 90 nas laterais e no topo, **280 embaixo**.
- Camadas em uma tela larga: parte inteira de `x` = slide, decimal = posição. `x`/`y` são o centro.
- `size` e `mh` = largura e altura em larguras de slide. Formas "caneta" (`comp: pen`) usam coordenadas absolutas no path.
- O template vem de dois carrosséis reais: "Guia de redes de apoio" (informativo) e "Alguém passou mal no rolê" (impacto). Pra um estilo novo, peça um carrossel exemplo exportado do Mola, ajuste os índices de camada em `_extrair_template.py`, gere o template e suba a mudança no repositório (com o ok do Vitor).