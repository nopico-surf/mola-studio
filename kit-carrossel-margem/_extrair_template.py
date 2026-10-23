"""Extrai o template (modulos de slides) dos dois carrosseis de referencia do Mola.
Uso: python3 _extrair_template.py guia.json passou_mal.json saida.json"""
import json, sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_mola import mover

GUIA, PASSOU, OUT = sys.argv[1:4]

# indice da camada original -> nome do campo de texto (slot)
DEF = {
 "impacto": {
  "arquivo": PASSOU,
  "slides": {
   "capa":        {"orig": 0, "slots": {44: "titulo", 45: "subtitulo", 47: "chamada"}},
   "passo":       {"orig": 1, "slots": {49: "destaque", 48: "texto"}, "fotos": {34: "foto"}},
   "alerta":      {"orig": 2, "slots": {51: "titulo", 50: "texto"}},
   "dica_foto":   {"orig": 3, "slots": {32: "titulo", 33: "texto"}, "fotos": {52: "foto"}},
   "lista":       {"orig": 4, "slots": {30: "sobretitulo", 29: "titulo", 27: "itens"}},
   "dica_foto_b": {"orig": 5, "slots": {22: "titulo", 21: "texto"}, "fotos": {53: "foto"}},
   "impacto":     {"orig": 6, "slots": {54: "titulo", 55: "texto"}},
   "frase_foto":  {"orig": 7, "slots": {5: "titulo", 6: "texto"}, "fotos": {1: "foto"}},
   "cta":         {"orig": 8, "slots": {15: "tema", 8: "link", 10: "salvar_titulo", 9: "salvar_texto", 13: "enviar_titulo", 12: "enviar_texto"}},
  },
  "modulos": {"abertura": ["capa", "passo", "alerta"], "meio": ["dica_foto", "lista", "dica_foto_b"], "fecho": ["impacto", "frase_foto", "cta"]},
 },
 "informativo": {
  "arquivo": GUIA,
  "slides": {
   "capa":       {"orig": 0, "slots": {18: "titulo", 19: "subtitulo"}},
   "texto_foto": {"orig": 1, "slots": {20: "texto"}, "fotos": {6: "foto"}},
   "canais":     {"orig": 2, "slots": {28: "titulo", 29: "texto", 26: "coluna1", 25: "coluna2", 27: "nota", 17: "rodape"}},
   "info_esq":   {"orig": 3, "slots": {34: "titulo", 35: "texto"}, "fotos": {3: "foto"}},
   "info_dir":   {"orig": 4, "slots": {36: "titulo", 37: "texto"}},
   "cta":        {"orig": 5, "slots": {15: "contexto", 38: "salvar_titulo", 16: "salvar_texto", 41: "enviar_titulo", 40: "enviar_texto"}},
   "link":       {"orig": 6, "slots": {45: "link", 46: "texto"}, "fotos": {2: "foto"}},
  },
  "modulos": {"abertura": ["capa", "texto_foto", "canais"], "meio": ["info_esq", "info_dir"], "fecho": ["cta", "link"]},
 },
}

def owner(L):
    if L["type"] == "bg":
        return None
    return int(L["x"] // 1)

out = {"estilos": {}}
for estilo, cfg in DEF.items():
    d = json.load(open(cfg["arquivo"]))
    if "brand" not in out:
        out["brand"] = d["brand"]
    by_orig = {v["orig"]: k for k, v in cfg["slides"].items()}
    slides = {k: {"camadas": [], "grupos": {}} for k in cfg["slides"]}
    bg = None
    for i, L in enumerate(d["layers"]):
        L = copy.deepcopy(L)
        if L["type"] == "bg":
            bg = L
            continue
        o = owner(L)
        nome = by_orig[o]
        sc = cfg["slides"][nome]
        L["_z"] = i
        if i in sc["slots"]:
            L["_slot"] = sc["slots"][i]
        if i in sc.get("fotos", {}):
            L["_foto"] = sc["fotos"][i]
            L["src"] = None
        mover(L, -o)                  # posicao relativa ao inicio do slide (inclui paths absolutos da caneta)
        g = L.get("grp")
        while g and g in d["groups"]:              # o grupo e todos os de fora (frame dentro de frame)
            slides[nome]["grupos"][g] = d["groups"][g]
            g = d["groups"][g].get("parent")
        slides[nome]["camadas"].append(L)
    out["estilos"][estilo] = {"bg": bg, "slides": slides, "modulos": cfg["modulos"],
                             "margin": {"on": True, "top": 90, "right": 90, "bottom": 280, "left": 90}}
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("ok", {e: list(v["slides"]) for e, v in out["estilos"].items()})
