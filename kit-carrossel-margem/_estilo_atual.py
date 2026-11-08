"""Acrescenta (ou refaz) o estilo "atual" no template, a partir de dois carrosseis reais do Mola.

Uso: python3 _estilo_atual.py psiquiatria.json duas_doses.json template_mola.json

- psiquiatria.json = "Consulta psiquiatrica nao deveria ser um privilegio" (07/11/2026; no Mola, arquivo "carrossel-chensex")
- duas_doses.json  = "O que o novo estudo sobre duas doses de alcool por dia mostra" (01/11/2026, "carrossel-duas-doses")

O estilo "atual" e o visual dos posts de nov/2026: fundo menta e verde escuro, cartoes verde-escuros,
fotos documentais com degrade verde, capa com foto que vaza para o slide 2, logo + "Arrasta pro lado".
Sempre 10 slides: capa, virada, card, card extra, foto_baixo, card_lista, foto_baixo_b, impacto, foto_cheia, cta.
"""
import json, sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_mola import mover

PSIQ, DUAS, TPL = sys.argv[1:4]

# tipo -> (arquivo, slide de origem, {indice da camada: campo}, {indice: campo de foto}, [indices a descartar])
SLIDES = {
    "capa":         (PSIQ, 0, {30: "titulo"}, {}, []),
    "virada":       (PSIQ, 1, {26: "titulo", 40: "texto"}, {18: "foto"}, []),
    "card":         (PSIQ, 2, {28: "titulo", 27: "texto"}, {}, []),
    "foto_baixo":   (DUAS, 3, {22: "titulo", 23: "texto"}, {38: "foto"}, [39]),
    "card_lista":   (DUAS, 4, {20: "titulo", 21: "subtitulo", 19: "itens"}, {}, []),
    "foto_baixo_b": (DUAS, 5, {15: "titulo", 14: "texto"}, {40: "foto"}, []),
    "impacto":      (DUAS, 6, {41: "titulo", 42: "texto"}, {}, []),
    "foto_cheia":   (DUAS, 7, {4: "titulo", 5: "texto"}, {1: "foto"}, []),
    "cta":          (DUAS, 8, {7: "link", 8: "tema", 46: "salvar_titulo", 45: "salvar_texto",
                               49: "enviar_titulo", 48: "enviar_texto"}, {}, []),
}
MODULOS = {"abertura": ["capa", "virada", "card"], "extra": "card",
           "meio": ["foto_baixo", "card_lista", "foto_baixo_b"],
           "fecho": ["impacto", "foto_cheia", "cta"]}
Z_OFF = {PSIQ: 0, DUAS: 1000}       # ordem de empilhamento: cada arquivo no seu bloco

docs = {p: json.load(open(p, encoding="utf-8")) for p in (PSIQ, DUAS)}
slides = {}
for nome, (arq, orig, slots, fotos, fora) in SLIDES.items():
    d = docs[arq]
    sl = {"camadas": [], "grupos": {}}
    for i, L in enumerate(d["layers"]):
        if L["type"] == "bg" or int(L["x"] // 1) != orig or i in fora:
            continue
        L = copy.deepcopy(L)
        L["_z"] = Z_OFF[arq] + i
        if i in slots:
            L["_slot"] = slots[i]
        if i in fotos:
            L["_foto"] = fotos[i]
            L["src"] = None
            L.pop("flipX", None); L.pop("flipY", None)    # espelhar a foto é decisão de cada post
        mover(L, -orig)
        g = L.get("grp")
        while g and g in d["groups"]:
            sl["grupos"][g] = d["groups"][g]
            g = d["groups"][g].get("parent")
        sl["camadas"].append(L)
    slides[nome] = sl

bg = next(L for L in docs[DUAS]["layers"] if L["type"] == "bg")
tpl = json.load(open(TPL, encoding="utf-8"))
tpl["estilos"]["atual"] = {"bg": bg, "slides": slides, "modulos": MODULOS,
                           "brand": docs[DUAS]["brand"], "margin": docs[DUAS]["margin"]}
json.dump(tpl, open(TPL, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ok", list(slides))
