"""Leva para o template (estilo impacto) os ajustes que o Vitor fez no Mola num carrossel gerado.
Uso: python3 _aplicar_ajustes.py roteiro.json template_mola.json ajustado_no_mola.json template_novo.json
Copia, por camada: x, y, maxW, align (texto) e blend (foto); o flow do frame de dentro;
tira o flow dos frames de fora (frame dentro de frame); acrescenta camadas novas (ex.: mancha atras do logo).
Nao copia texto digitado, foto espelhada nem ajuste de cor (so daquele post)."""
import json, sys, copy, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gerar_mola as G

rot, tplp, ajp, outp = sys.argv[1:5]
roteiro = json.load(open(rot, encoding="utf-8"))
tpl = json.load(open(tplp, encoding="utf-8"))
B = json.load(open(ajp, encoding="utf-8"))
fd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
G.FONT_DIR = fd
est = roteiro.get("estilo", "impacto")
E = tpl["estilos"][est]
tipos = [s["tipo"] for s in roteiro["slides"]]
for t in tipos:
    for i, L in enumerate(E["slides"][t]["camadas"]):
        L["_ti"] = i
A, _, _ = G.gerar(roteiro, tpl)

def sl(L): return -1 if L["type"] == "bg" else int(L["x"])
used = set(); n = 0
for La in A["layers"]:
    if La["type"] == "bg" or "_ti" not in La:
        continue
    s = sl(La); best = None
    for ib, M in enumerate(B["layers"]):
        if ib in used or M["type"] != La["type"] or sl(M) != s or M.get("name") != La.get("name"):
            continue
        sc = abs(M["x"] - La["x"]) + abs(M["y"] - La["y"])
        if best is None or sc < best[0]: best = (sc, ib)
    if not best: continue
    used.add(best[1]); M = B["layers"][best[1]]
    T = E["slides"][tipos[s]]["camadas"][La["_ti"]]
    T["y"] = M["y"]; T["x"] = round(M["x"] - s, 5)
    if T["type"] == "text":
        for k in ("maxW", "align"):
            if k in M: T[k] = M[k]
        T["text"] = M["text"]; T["fsz"] = None
    if T["type"] == "image":
        T["blend"] = M.get("blend")
        if not T["blend"]: T.pop("blend", None)
    n += 1
    # frame de dentro: copia o flow do ajustado
    ga = (B["groups"].get(M.get("grp")) or {}).get("flow")
    gt = E["slides"][tipos[s]]["grupos"].get(T.get("grp"))
    if ga and gt is not None:
        gt["flow"] = {k: v for k, v in ga.items()}
# camadas novas (nao existiam na gerada): entram no template, na posicao relativa ao slide
for ib, M in enumerate(B["layers"]):
    if ib in used or M["type"] == "bg": continue
    s = sl(M)
    if s < 0 or s >= len(tipos): continue
    if M["type"] == "shape" and M.get("lblur", 0) > 100:
        new = copy.deepcopy(M); new.pop("id", None); new.pop("grp", None); new.pop("_bounds", None); new.pop("fpos", None)
        G.mover(new, -s)
        foto = next((L for L in E["slides"][tipos[s]]["camadas"] if L.get("_foto")), None)
        new["_z"] = (foto["_z"] if foto else 0) + 0.5
        E["slides"][tipos[s]]["camadas"].append(new)
        print("camada nova no slide", tipos[s], new.get("name"), "blur", new["lblur"])
# frames de fora: sem layout (so o frame de dentro segura o layout)
for t, sd in E["slides"].items():
    pais = {g["parent"] for g in sd["grupos"].values() if g.get("parent")}
    for g in pais:
        if g in sd["grupos"]:
            sd["grupos"][g].pop("flow", None); sd["grupos"][g].pop("fill", None)
    for L in sd["camadas"]:
        L.pop("_ti", None)
# fotos: sempre mesclagem normal
for sd in E["slides"].values():
    for L in sd["camadas"]:
        if L["type"] == "image": L.pop("blend", None)
json.dump(tpl, open(outp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("camadas ajustadas:", n)
