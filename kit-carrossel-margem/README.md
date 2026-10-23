# Kit carrossel da Margem

Gera carrosséis do Instagram da Margem como `.json` que o Mola importa ("Importar .json"). Usado pela skill `carrossel-margem` do Claude.

- `gerar_mola.py roteiro.json template_mola.json saida.json`: monta o carrossel a partir de um roteiro simples (tipo de slide + textos). Avisa quando um texto passa da margem de 280 px, encosta numa foto ou em outro bloco, e bloqueia travessão.
- `previa_mola.js saida.json previa.png`: abre o próprio Mola deste repositório num Chromium, importa o `.json` e salva o quadro inteiro (precisa de `playwright`).
- `template_mola.json`: os módulos de slide tirados de dois carrosséis reais ("Guia de redes de apoio" = estilo `informativo`; "Alguém passou mal no rolê" = estilo `impacto`). Não editar à mão: refazer com `_extrair_template.py guia.json passou_mal.json template_mola.json`.
- `fonts/`: Urbanist (latin 500 a 800, @fontsource, licença OFL) para medir a quebra de linha igual ao Mola.

Mudou o formato do JSON do Mola ou o visual dos carrosséis? Exporte um carrossel exemplo, ajuste os índices de camada em `_extrair_template.py` e gere o template de novo.

## Ajustes do Vitor viram template
`_aplicar_ajustes.py roteiro.json template_mola.json ajustado_no_mola.json template_novo.json` leva para o template as posições, larguras, alinhamentos, mesclagem das fotos, `flow` dos frames de dentro e camadas novas que ele mexeu num carrossel gerado. Não copia texto, foto espelhada nem ajuste de cor. Estilo atual: impacto (ajustado em 23/10/2026, "Descansar virou privilégio").
