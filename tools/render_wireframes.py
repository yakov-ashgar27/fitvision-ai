"""Render pages of a .drawio file (simple vertices + point edges) to PNG via HTML + Playwright."""
import sys, html, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

def style_dict(s):
    d, first = {}, None
    for i, part in enumerate((s or "").split(";")):
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1); d[k] = v
        elif i == 0:
            first = part
    d["_shape"] = first
    return d

def page_html(diagram, skip_notes=True, pad=12):
    model = diagram.find("mxGraphModel")
    cells = model.find("root").findall("mxCell")
    parts, maxx, maxy = [], 0, 0
    z = 0
    for c in cells:
        st = style_dict(c.get("style"))
        g = c.find("mxGeometry")
        if g is None:
            continue
        z += 1
        if c.get("vertex") == "1":
            if skip_notes and st.get("shape") == "note":
                continue
            x, y = float(g.get("x", 0)), float(g.get("y", 0))
            w, h = float(g.get("width", 0)), float(g.get("height", 0))
            maxx, maxy = max(maxx, x + w), max(maxy, y + h)
            shape = st["_shape"]
            fill = st.get("fillColor", "none" if shape == "text" else "#ffffff")
            stroke = st.get("strokeColor", "none" if shape == "text" else "#000000")
            sw = float(st.get("strokeWidth", 1))
            css = [f"left:{x}px;top:{y}px;width:{w}px;height:{h}px;z-index:{z}"]
            css.append(f"background:{'transparent' if fill == 'none' else fill}")
            if stroke != "none":
                css.append(f"border:{sw}px {'dashed' if st.get('dashed') == '1' else 'solid'} {stroke}")
            if shape == "ellipse":
                css.append("border-radius:50%")
            elif st.get("rounded") == "1":
                r = min(w, h) * float(st.get("arcSize", 15)) / 100
                css.append(f"border-radius:{r}px")
            if st.get("shadow") == "1":
                css.append("box-shadow:0 1px 3px rgba(15,23,42,.12)")
            fs = st.get("fontStyle", "0")
            fsi = int(fs) if fs.isdigit() else 0
            al = st.get("align", "center")
            va = {"top": "flex-start", "bottom": "flex-end"}.get(st.get("verticalAlign", "middle"), "center")
            sp = float(st.get("spacing", 2))
            inner = [f"font-size:{st.get('fontSize', 11)}px", f"color:{st.get('fontColor', '#000')}",
                     f"text-align:{al}", f"font-weight:{700 if fsi & 1 else 400}", "width:100%"]
            pr = sp + float(st.get("spacingRight", 0)); pl = sp + float(st.get("spacingLeft", 0))
            box = (f"display:flex;align-items:{va};padding:{sp}px {pr}px {sp}px {pl}px;box-sizing:border-box")
            parts.append(f'<div class="v" style="{";".join(css)};{box}"><div dir="auto" style="{";".join(inner)}">{c.get("value", "")}</div></div>')
        elif c.get("edge") == "1":
            pts = []
            sp_ = g.find("mxPoint[@as='sourcePoint']"); tp = g.find("mxPoint[@as='targetPoint']")
            if sp_ is None or tp is None:
                continue
            pts.append((float(sp_.get("x")), float(sp_.get("y"))))
            arr = g.find("Array")
            if arr is not None:
                pts += [(float(p.get("x")), float(p.get("y"))) for p in arr.findall("mxPoint")]
            pts.append((float(tp.get("x")), float(tp.get("y"))))
            col = st.get("strokeColor", "#000")
            sw = st.get("strokeWidth", "1")
            dash = 'stroke-dasharray="6 4"' if st.get("dashed") == "1" else ""
            me = f'marker-end="url(#a{z})"' if st.get("endArrow", "classic") == "classic" else ""
            ms = f'marker-start="url(#s{z})"' if st.get("startArrow") == "classic" else ""
            pstr = " ".join(f"{a},{b}" for a, b in pts)
            parts.append(
                f'<svg class="e" style="z-index:{z}"><defs>'
                f'<marker id="a{z}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="{col}"/></marker>'
                f'<marker id="s{z}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M10 0L0 5L10 10z" fill="{col}"/></marker></defs>'
                f'<polyline points="{pstr}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" {dash} {me} {ms}/></svg>')
    W, H = int(maxx + pad), int(maxy + pad)
    return W, H, ("<html><head><meta charset='utf-8'><style>body{margin:0;background:#fff;font-family:'DejaVu Sans','Liberation Sans',sans-serif}"
                  f"#c{{position:relative;width:{W}px;height:{H}px;margin:{pad}px}}.v{{position:absolute;overflow:hidden}}"
                  f".e{{position:absolute;left:0;top:0;width:{W}px;height:{H}px;overflow:visible;pointer-events:none}}</style></head>"
                  f"<body><div id='c'>{''.join(parts)}</div></body></html>")

def render(drawio, pages, out, scale=2):
    root = ET.parse(drawio).getroot()
    diagrams = root.findall("diagram")
    with sync_playwright() as p:
        b = p.chromium.launch()
        for idx, path in zip(pages, out):
            W, H, doc = page_html(diagrams[idx])
            pg = b.new_page(viewport={"width": W + 24, "height": H + 24}, device_scale_factor=scale)
            pg.set_content(doc)
            pg.locator("#c").screenshot(path=path)
            pg.close()
        b.close()

if __name__ == "__main__":
    out = sys.argv[2] if len(sys.argv) > 2 else "."
    render(sys.argv[1], [0, 1, 2, 3, 4], [f"{out}/wf{i+1}.png" for i in range(5)])
    print("rendered")
