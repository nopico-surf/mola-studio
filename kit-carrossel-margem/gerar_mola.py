#!/usr/bin/env python3
"""Gera um carrossel .json importavel no Mola (mola.app.br) a partir de um roteiro simples.

Uso:
  python3 gerar_mola.py roteiro.json template_mola.json saida.json

Roteiro (exemplo minimo):
{
  "estilo": "impacto",                      # "impacto" ou "informativo"
  "slides": [
    {"tipo": "capa", "titulo": "...", "subtitulo": "...", "chamada": "..."},
    {"tipo": "passo", "destaque": "Primeiro", "texto": "...", "foto": "descricao da foto"},
    ...
  ]
}
- A sequencia de "tipo" precisa ser uma combinacao de modulos do estilo
  (abertura + meio x0..2 + fecho). O script avisa quando nao for.
- Campo omitido = camada removida do slide.
- **trecho** = trecho em negrito (peso 800).
- "foto": vira um espaco de imagem com nome "FOTO: <descricao>" para colar a imagem no Mola.
- "link" (slides cta/link): "somosmargem.com.br/caminho".
Sai com codigo 1 se houver ERRO (ex.: travessao). AVISOS nao bloqueiam, mas devem ser lidos.
"""
import base64, copy, io, json, random, re, string, sys

W, H = 1080, 1440            # 3x4
SAFE_TOP, SAFE_BOTTOM = 90, 280

# largura media de caractere / tamanho da fonte (Urbanist), calibrada nos arquivos de referencia
K_PESO = {400: 0.435, 500: 0.452, 600: 0.47, 700: 0.487, 800: 0.509, 900: 0.52}


def _rid(n=8, pre=""):
    return pre + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def _k(weight):
    w = int(weight or 500)
    return K_PESO.get(w, 0.54)


FONT_DIR = None          # pasta com urbanist-latin-<peso>-normal.woff (npm pack @fontsource/urbanist)
_fcache = {}


def _fonte(size, weight):
    if not FONT_DIR:
        return None
    import os
    w = min((500, 600, 700, 800), key=lambda p: abs(p - int(weight or 500)))
    key = (int(size), w)
    if key not in _fcache:
        path = os.path.join(FONT_DIR, f"urbanist-latin-{w}-normal.woff")
        try:
            from PIL import ImageFont
            _fcache[key] = ImageFont.truetype(path, int(size))
        except Exception:
            _fcache[key] = None
    return _fcache[key]


def linhas_estimadas(texto, size, weight, ls, larg_px):
    """Simula a quebra de linha por palavra (medida real com a Urbanist, se disponivel)."""
    f = _fonte(size, weight)
    if f is not None:
        sp = (ls or 0) * size

        def larg(t):
            return f.getlength(t) + sp * max(0, len(t) - 1)
        total = 0
        for par in texto.split("\n"):
            linha, n = "", 1
            for p in par.split(" "):
                t = (linha + " " + p) if linha else p
                if linha and larg(t) > larg_px:
                    n += 1
                    linha = p
                else:
                    linha = t
            total += n
        return total
    cw = size * (_k(weight) + (ls or 0))
    max_chars = max(1, int(larg_px / cw))
    total = 0
    for par in texto.split("\n"):
        palavras = par.split(" ")
        linha, n = 0, 1
        for p in palavras:
            add = len(p) + (1 if linha else 0)
            if linha and linha + add > max_chars:
                n += 1
                linha = len(p)
            else:
                linha += add
        total += n
    return total


def altura_estimada(L, texto):
    size = L["size"]
    lh = L.get("lh") or 1.2
    larg = (L.get("maxW") or 0.8) * W
    n = linhas_estimadas(texto, size, L.get("weight"), L.get("ls"), larg)
    return n * size * lh, n


def runs_de_markup(texto):
    if "**" not in texto:
        return texto, None
    partes = re.split(r"(\*\*.+?\*\*)", texto)
    runs, limpo = [], ""
    for p in partes:
        if not p:
            continue
        if p.startswith("**") and p.endswith("**"):
            t = p[2:-2]
            runs.append({"t": t, "w": 800})
        else:
            t = p
            runs.append({"t": t})
        limpo += t
    return limpo, runs


def runs_link(L_orig, texto):
    """Mantem o estilo do link original: dominio leve + caminho em negrito."""
    orig = L_orig.get("runs") or []
    dom_style = {k: v for k, v in (orig[0] if orig else {}).items() if k != "t"}
    path_style = {k: v for k, v in (orig[-1] if len(orig) > 1 else {"w": 800}).items() if k != "t"}
    if "/" in texto:
        dom, path = texto.split("/", 1)
        return [dict(t=dom, **dom_style), dict(t="/" + path, **path_style)]
    return [dict(t=texto, **dom_style)]


def placeholder_jpeg(w_rel, h_rel, cor=(3, 66, 44)):
    """Espaco de foto semitransparente (o texto por baixo continua visivel)."""
    from PIL import Image, ImageDraw
    w = 240
    h = max(40, int(w * h_rel / max(w_rel, 0.01)))
    im = Image.new("RGBA", (w, h), cor + (110,))
    dr = ImageDraw.Draw(im)
    for i in range(-h, w, 24):
        dr.line([(i, 0), (i + h, h)], fill=(175, 255, 70, 90), width=3)
    dr.rectangle([w // 2 - 46, h // 2 - 14, w // 2 + 46, h // 2 + 14], fill=(175, 255, 70, 255))
    dr.text((w // 2 - 22, h // 2 - 6), "FOTO", fill=(1, 42, 28, 255))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


NUM = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?")


def _shift_path(d, dx):
    """Desloca as coordenadas x (pares x y) de um path absoluto."""
    out, idx = [], [0]

    def rep(m):
        v = float(m.group(0))
        i = idx[0]
        idx[0] += 1
        return f"{v + dx:.2f}" if i % 2 == 0 else m.group(0)
    return NUM.sub(rep, d)


def mover(L, dx_slides):
    dx_px = dx_slides * W
    L["x"] = L["x"] + dx_slides
    b = L.get("_bounds")
    if b and "x" in b:
        b["x"] = b["x"] + dx_px
    if L.get("comp") == "pen":                    # caneta usa coordenadas absolutas da tela
        for k in ("d", "vecD"):
            if L.get(k):
                L[k] = _shift_path(L[k], dx_px)
        for v in L.get("vec") or []:
            for p in v.get("pts", []):
                for a in ("x", "ix", "ox"):
                    if a in p:
                        p[a] += dx_px


def validar_sequencia(tipos, modulos):
    ab, meio, fe = modulos["abertura"], modulos["meio"], modulos["fecho"]
    n = len(tipos)
    if tipos[:len(ab)] != ab or tipos[n - len(fe):] != fe:
        return False
    corpo = tipos[len(ab):n - len(fe)]
    while corpo:
        if corpo[:len(meio)] != meio:
            return False
        corpo = corpo[len(meio):]
    return True


def gerar(roteiro, tpl):
    erros, avisos = [], []
    estilo = roteiro.get("estilo", "impacto")
    if estilo not in tpl["estilos"]:
        raise SystemExit(f"ERRO: estilo '{estilo}' nao existe. Use: {list(tpl['estilos'])}")
    E = tpl["estilos"][estilo]
    slides_in = roteiro["slides"]
    tipos = [s["tipo"] for s in slides_in]
    for t in tipos:
        if t not in E["slides"]:
            raise SystemExit(f"ERRO: tipo '{t}' nao existe no estilo {estilo}. Tipos: {list(E['slides'])}")
    m = E["modulos"]
    if not validar_sequencia(tipos, m):
        avisos.append("Sequencia fora dos modulos do template "
                      f"(abertura={m['abertura']}, meio={m['meio']} 0 a 2x, fecho={m['fecho']}). "
                      "Fotos e fundos que atravessam slides podem ficar desalinhados.")

    camadas, grupos = [], {}
    for pos, s in enumerate(slides_in):
        base = E["slides"][s["tipo"]]
        gmap = {g: _rid(6, "g") for g in base["grupos"]}
        for g, gdef in base["grupos"].items():
            gd = copy.deepcopy(gdef)
            if gd.get("parent"):
                if gd["parent"] in gmap:
                    gd["parent"] = gmap[gd["parent"]]
                else:
                    gd.pop("parent")
            grupos[gmap[g]] = gd
        novas = []
        for L0 in base["camadas"]:
            L = copy.deepcopy(L0)
            L["id"] = _rid()
            if L.get("grp"):
                L["grp"] = gmap[L["grp"]]
            mover(L, pos)
            slot = L.pop("_slot", None)
            foto = L.pop("_foto", None)
            if slot:
                txt = s.get(slot)
                if txt is None or str(txt).strip() == "":
                    continue                      # campo omitido: remove a camada
                txt = str(txt)
                if "—" in txt or "–" in txt:
                    erros.append(f"slide {pos + 1} ({s['tipo']}.{slot}): tem travessao. Reescreva sem.")
                h_old = (L.get("fsz") or [0, 0])[1] or altura_estimada(L, L["text"])[0]
                if slot == "link":
                    L["text"], L["runs"] = txt, runs_link(L0, txt)
                else:
                    L["text"], L["runs"] = runs_de_markup(txt)
                h_new, nlin = altura_estimada(L, L["text"])
                L["_dh"] = h_new - h_old
                L["_bot0"] = L["y"] * H + h_old / 2      # base do texto no desenho original
                L["_h"] = h_new
                L["_ref"] = f"slide {pos + 1} ({s['tipo']}.{slot})"
                L["fsz"] = None
                L["fpos"] = None
            if foto:
                desc = s.get(foto)
                L["name"] = ("FOTO: " + desc)[:120] if desc else "FOTO: escolher imagem"
                L["src"] = placeholder_jpeg(L.get("size") or 1, L.get("mh") or 1)
            novas.append(L)
        # remove icones de grupos que ficaram sem texto
        com_texto = {L.get("grp") for L in novas if L["type"] == "text" and L.get("grp")}
        novas = [L for L in novas if not (L.get("grp") and L["type"] != "text" and L["grp"] not in com_texto)]
        _reposicionar(novas, grupos)
        camadas.extend(novas)

    # checagem de margens
    for L in camadas:
        if L["type"] != "text" or "_h" not in L:
            continue
        cy = L["y"] * H
        top, bot = cy - L["_h"] / 2, cy + L["_h"] / 2
        if bot > H - SAFE_BOTTOM + 8:
            avisos.append(f"{L['_ref']}: texto passa da margem inferior (280px). Encurte.")
        if top < SAFE_TOP - 8:
            avisos.append(f"{L['_ref']}: texto passa da margem superior. Encurte.")
        # foto parcial (nao de fundo) no mesmo slide: texto nao pode encostar nela
        tl, tr = (L["x"] - L["maxW"] / 2) * W, (L["x"] + L["maxW"] / 2) * W
        for F in camadas:
            if F["type"] != "image":
                continue
            fw, fh = F["size"] * W, (F.get("mh") or F["size"]) * W
            fl, fr = F["x"] * W - fw / 2, F["x"] * W + fw / 2
            ft, fb = F["y"] * H - fh / 2, F["y"] * H + fh / 2
            # foto que ocupa o slide inteiro (fundo, atras do texto de proposito) nao conta
            if ft <= 0.05 * H and fb >= 0.95 * H and fl <= (int(F["x"]) + 0.05) * W and fr >= (int(F["x"]) + 0.95) * W:
                continue
            # so conta foto que pega o slide do texto (a que sangra de outro slide entra pela borda)
            sl0, sl1 = int(L["x"]) * W, (int(L["x"]) + 1) * W
            if fr <= sl0 or fl >= sl1:
                continue
            if tl < fr and tr > fl and top < fb and bot > ft - 50:
                avisos.append(f"{L['_ref']}: texto encosta na foto. Encurte.")
    # texto x texto no mesmo slide (frame com fundo colorido conta pela caixa inteira)
    def cadeia(g):
        out = []
        while g:
            out.append(g)
            g = (grupos.get(g) or {}).get("parent")
        return out

    def rect_de(L):
        if L["type"] == "text":
            h = L.get("_h") or altura_estimada(L, L["text"])[0]
            w = (L.get("maxW") or 0.8) * W
        else:
            w = (L.get("size") or 0.05) * W
            h = (L.get("mh") or L.get("size") or 0.05) * W
        cx, cy = L["x"] * W, L["y"] * H
        return [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2]

    pint = {}
    for L in camadas:
        for g in cadeia(L.get("grp")):
            gd = grupos.get(g) or {}
            if gd.get("fill") and not str(gd["fill"]).lower().endswith("00"):
                r = rect_de(L)
                f = gd.get("flow") or {}
                r = [r[0] - f.get("pl", 0), r[1] + f.get("pr", 0), r[2] - f.get("pt", 0), r[3] + f.get("pb", 0)]
                o = pint.get(g)
                pint[g] = r if not o else [min(o[0], r[0]), max(o[1], r[1]), min(o[2], r[2]), max(o[3], r[3])]
    caixas = []
    for L in camadas:
        if L["type"] != "text":
            continue
        r = next((pint[g] for g in cadeia(L.get("grp")) if g in pint), None) or rect_de(L)
        caixas.append((int(L["x"]), r[0], r[1], r[2], r[3], L))
    for i, a in enumerate(caixas):
        for b in caixas[i + 1:]:
            ca, cb = set(cadeia(a[5].get("grp"))), set(cadeia(b[5].get("grp")))
            if a[0] != b[0] or (ca & cb and (a[5].get("grp") in cb or b[5].get("grp") in ca or a[5].get("grp") == b[5].get("grp"))):
                continue
            if any(g in pint for g in ca & cb):     # mesmo frame pintado: o layout do Mola organiza
                continue
            if a[1] < b[2] and a[2] > b[1] and a[3] < b[4] - 4 and a[4] > b[3] + 4:
                quem = a[5].get("_ref") or b[5].get("_ref") or f"slide {a[0] + 1}"
                avisos.append(f"{quem}: texto encosta em outro bloco de texto do slide. Encurte.")
    for L in camadas:
        for k in ("_dh", "_h", "_ref", "_bot0"):
            L.pop(k, None)

    camadas.sort(key=lambda L: L.pop("_z", 0))   # mantem a ordem de empilhamento do original
    bg = copy.deepcopy(E["bg"])
    bg["id"] = _rid()
    n = len(slides_in)
    doc = {
        "v": 1, "format": "3x4", "duration": 8, "fps": 30, "loop": True,
        "margin": E["margin"], "template": "blank", "base": "3x4",
        "slides": n, "still": True,
        "export": {"fmts": ["3x4"], "vars": False, "sl": list(range(n))},
        "grpFix": 1,
        "brand": tpl["brand"], "groups": grupos,
        "layers": [bg] + camadas,
    }
    return doc, erros, avisos


def _reposicionar(novas, grupos):
    """Ajusta a posicao vertical quando o texto novo e maior ou menor que o original.
    Respeita o 'pin' do grupo: start = topo fixo, end = base fixa, center = centro fixo."""
    por_grupo = {}
    for L in novas:
        por_grupo.setdefault(L.get("grp"), []).append(L)
    for g, itens in por_grupo.items():
        flow = (grupos.get(g) or {}).get("flow", {}) if g else {}
        pin = flow.get("pin", "start") if g else "start"
        vertical = flow.get("dir", "v") == "v"
        textos = [L for L in itens if "_dh" in L]
        for T in textos:
            dh = T["_dh"]
            if abs(dh) < 1:
                continue
            if pin == "end":
                T["y"] -= dh / 2 / H
            elif pin == "start" or not g:
                T["y"] += dh / 2 / H
            if not (g and vertical):
                continue
            for O in itens:                      # empurra os vizinhos do mesmo grupo
                if O is T:
                    continue
                if pin == "end" and O["y"] < T["y"]:
                    O["y"] -= dh / H
                elif pin in ("start",) and O["y"] > T["y"]:
                    O["y"] += dh / H
                elif pin == "center":
                    O["y"] += (dh / 2 / H) * (1 if O["y"] > T["y"] else -1)


if __name__ == "__main__":
    import os
    _fd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
    if os.path.isdir(_fd):
        FONT_DIR = _fd
    else:
        print("AVISO: pasta fonts/ nao encontrada; medindo texto por estimativa (menos preciso).")
    rot, tplp, outp = sys.argv[1:4]
    roteiro = json.load(open(rot, encoding="utf-8"))
    tpl = json.load(open(tplp, encoding="utf-8"))
    doc, erros, avisos = gerar(roteiro, tpl)
    for a in avisos:
        print("AVISO:", a)
    for e in erros:
        print("ERRO:", e)
    if erros:
        sys.exit(1)
    json.dump(doc, open(outp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"ok: {outp} ({len(roteiro['slides'])} slides, {len(doc['layers'])} camadas)")
