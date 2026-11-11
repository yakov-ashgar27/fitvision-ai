"""Build the combined Word document (RTL) from docs/*.md.

Usage:  python3 tools/build_docx.py [output.docx]
Needs pandoc. Run from the repository root.
"""
import glob, os, re, shutil, subprocess, sys, tempfile, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "docs", "FitVision-AI-מסמך-אפיון.docx"))
PAGE = '\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n'

def chapters():
    files = sorted(f for f in glob.glob(os.path.join(ROOT, "docs", "[0-9][0-9]-*.md")) if not os.path.basename(f).startswith("00"))
    for f in files:
        s = open(f, encoding="utf-8").read()
        s = s.replace('<div dir="ltr">', '::: {dir="ltr"}').replace("</div>", ":::")
        yield s

def build_markdown():
    front = open(os.path.join(ROOT, "tools", "docx", "front-matter.md"), encoding="utf-8").read().rstrip() + "\n"
    return front + "".join(PAGE + c.strip() + "\n" for c in chapters())

BORDERS = ('<w:tblBorders>' + ''.join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>'
           for s in ("top", "left", "bottom", "right", "insideH", "insideV")) + '</w:tblBorders>')
TABLE_STYLE = ('<w:style w:type="table" w:styleId="Table"><w:name w:val="Table"/><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>'
               '<w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:tblPr>' + BORDERS +
               '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/>'
               '<w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr>'
               '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E8EEF7"/></w:tcPr></w:tblStylePr></w:style>')

TOC_STYLES = "".join(
    f'<w:style w:type="paragraph" w:styleId="TOC{n}"><w:name w:val="toc {n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
    f'<w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:bidi/><w:tabs><w:tab w:val="left" w:leader="dot" w:pos="9350"/></w:tabs>'
    f'<w:spacing w:after="60"/><w:ind w:start="{(n - 1) * 360}"/><w:jc w:val="start"/></w:pPr></w:style>' for n in (1, 2))

def fix_tblpr(m):
    body = m.group(1)
    style = re.search(r'<w:tblStyle [^>]*/>', body)
    width = re.search(r'<w:tblW [^>]*/>', body)
    look = re.search(r'<w:tblLook [^>]*/>', body)
    parts = [style.group(0) if style else '<w:tblStyle w:val="Table"/>', '<w:bidiVisual/>',
             width.group(0) if width else '<w:tblW w:type="pct" w:w="5000"/>', '<w:jc w:val="start"/>', BORDERS]
    if look:
        parts.append(look.group(0))
    return "<w:tblPr>" + "".join(parts) + "</w:tblPr>"

def postprocess(docx):
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(docx) as z:
        z.extractall(tmp)
    p = os.path.join(tmp, "word", "document.xml")
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"<w:tblPr>(.*?)</w:tblPr>", fix_tblpr, s, flags=re.S)
    s = s.replace("<w:sdt>", '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:sdt>', 1)  # TOC on its own page
    open(p, "w", encoding="utf-8").write(s)
    p = os.path.join(tmp, "word", "styles.xml")
    s = open(p, encoding="utf-8").read()
    s = re.sub(r'<w:style w:type="table"[^>]*w:styleId="Table".*?</w:style>', "", s, flags=re.S)
    s = re.sub(r'<w:style w:type="paragraph"[^>]*w:styleId="TOC[12]".*?</w:style>', "", s, flags=re.S)
    s = s.replace("</w:styles>", TABLE_STYLE + TOC_STYLES + "</w:styles>")
    open(p, "w", encoding="utf-8").write(s)
    p = os.path.join(tmp, "word", "settings.xml")
    s = open(p, encoding="utf-8").read()
    if "updateFields" not in s:
        s = re.sub(r"(<w:zoom[^>]*/>)", r'\1<w:updateFields w:val="true"/>', s, count=1)
    open(p, "w", encoding="utf-8").write(s)
    os.remove(docx)
    with zipfile.ZipFile(docx, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(tmp):
            for f in files:
                full = os.path.join(base, f)
                z.write(full, os.path.relpath(full, tmp))
    shutil.rmtree(tmp)

def main():
    md = build_markdown()
    src = os.path.join(ROOT, "docs", ".combined.md")
    open(src, "w", encoding="utf-8").write(md)
    try:
        subprocess.run(["pandoc", src, "-f", "markdown-implicit_figures", "-o", OUT,
                        "--reference-doc", os.path.join(ROOT, "tools", "docx", "reference.docx"),
                        "--toc", "--toc-depth=2", "--resource-path", os.path.join(ROOT, "docs")],
                       check=True, cwd=os.path.join(ROOT, "docs"))
    finally:
        os.remove(src)
    postprocess(OUT)
    print("wrote", OUT)

if __name__ == "__main__":
    main()
