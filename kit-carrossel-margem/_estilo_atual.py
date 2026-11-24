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
    "card_lista":   (DUAS, 4, {20: "titulo", 21: "subtitulo", 19: "itens"}, {}, []),
    "foto_baixo":   (DUAS, 5, {15: "titulo", 14: "texto"}, {40: "foto"}, []),
    "impacto":      (DUAS, 6, {41: "titulo", 42: "texto"}, {}, []),
    "foto_cheia":   (DUAS, 7, {4: "titulo", 5: "texto"}, {1: "foto"}, []),
    "cta":          (DUAS, 8, {7: "link", 8: "tema", 46: "salvar_titulo", 45: "salvar_texto",
                               49: "enviar_titulo", 48: "enviar_texto"}, {}, []),
}
# 10 slides, sem slide extra: abertura 3 + meio 4 (a dupla com foto que vaza) + fecho 3
MODULOS = {"abertura": ["capa", "virada", "card"],
           "meio": ["dupla_esq", "dupla_dir", "card_lista", "foto_baixo"],
           "fecho": ["impacto", "foto_cheia", "cta"]}
LIMA = "#cdff66"          # verde-limão do post "Redução de danos intranasal" (slide da rede pública)
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

tpl = json.load(open(TPL, encoding="utf-8"))

def camada(nome, pred):
    return next(L for L in slides[nome]["camadas"] if pred(L))

# capa: etiqueta (a pilula verde-menta da capa de "duas doses") em cima do titulo, no mesmo frame
tit = camada("capa", lambda L: L.get("_slot") == "titulo")
pil = copy.deepcopy(docs[DUAS]["layers"][44])
mover(pil, 0)
pil.update({"_slot": "etiqueta", "_z": tit["_z"] + 1, "grp": tit["grp"], "fsz": None, "fpos": None,
            "y": tit["y"] - (tit["fsz"][1] / 2 + 18 + 32) / 1440})
slides["capa"]["camadas"].append(pil)

# borrao do slide 2 que vazava no 3: fica so no slide dele
for L in slides["virada"]["camadas"]:
    if L["type"] == "shape" and L.get("lblur") and L["x"] + (L.get("size") or 0) / 2 > 1:
        L["slideClip"] = True

# foto do slide de foto embaixo maior (sobrava verde vazio entre o texto e a foto)
f = camada("foto_baixo", lambda L: L.get("_foto"))
base = f["y"] * 1440 + f["mh"] * 1080 / 2
f["mh"] = 0.85
f["y"] = (base - f["mh"] * 1080 / 2) / 1440

# slide de impacto em verde-limao
fundo = camada("impacto", lambda L: L["type"] == "shape" and abs((L.get("size") or 0) - 1) < 0.01)
fundo["c1"] = LIMA

# dupla: os slides 4 e 5 do "Guia de redes de apoio" (uma foto so atravessando os dois)
inf = tpl["estilos"]["informativo"]["slides"]
for nome, orig in (("dupla_esq", "info_esq"), ("dupla_dir", "info_dir")):
    slides[nome] = copy.deepcopy(inf[orig])
foto = camada("dupla_esq", lambda L: L.get("_foto"))
foto.update({"x": 1.0, "size": 2.0, "mh": 1440 / 1080, "y": 0.5})
foto.pop("flipX", None); foto.pop("flipY", None)
# a sombra diagonal original vazava 1,3 slide pra tras; vira uma sombra no alto de cada slide da dupla,
# recortada no proprio slide (as duas iguais: a emenda entre os slides nao aparece)
som = camada("dupla_esq", lambda L: L["type"] == "shape" and L.get("lblur"))
for k in ("d", "vec", "vecD"):
    som.pop(k, None)
som.update({"kind": "rect", "rot": 0, "x": 0.5, "y": 0.16, "size": 1.3, "mh": 0.62, "lblur": 260,
            "c1": "#012a1c", "opacity": 0.85, "slideClip": True, "in": "cut"})
gemea = copy.deepcopy(som)
gemea["_z"] = min(L.get("_z", 0) for L in slides["dupla_dir"]["camadas"]) - 1
slides["dupla_dir"]["camadas"].insert(0, gemea)

bg = next(L for L in docs[DUAS]["layers"] if L["type"] == "bg")
tpl["estilos"]["atual"] = {"bg": bg, "slides": slides, "modulos": MODULOS,
                           "brand": docs[DUAS]["brand"], "margin": docs[DUAS]["margin"]}
json.dump(tpl, open(TPL, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("ok", list(slides))
