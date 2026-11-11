"""Convert the combined .docx to PDF with LibreOffice, refreshing the table of contents first.

Usage: python3 tools/docx_to_pdf.py input.docx output.pdf   (needs LibreOffice + python3-uno)
"""
import os, subprocess, sys, time
import uno
from com.sun.star.beans import PropertyValue

def prop(n, v):
    p = PropertyValue(); p.Name, p.Value = n, v; return p

src, dst = map(os.path.abspath, sys.argv[1:3])
proc = subprocess.Popen(["soffice", "--headless", "--invisible", "--norestore",
                         "--accept=socket,host=127.0.0.1,port=2002;urp;"])
try:
    ctx = None
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
    for _ in range(60):
        try:
            ctx = resolver.resolve("uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext"); break
        except Exception:
            time.sleep(0.5)
    desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(src), "_blank", 0, (prop("Hidden", True),))
    idx = doc.getDocumentIndexes()
    for i in range(idx.getCount()):
        idx.getByIndex(i).update()
    doc.storeToURL(uno.systemPathToFileUrl(dst), (prop("FilterName", "writer_pdf_Export"),))
    doc.close(True)
finally:
    proc.terminate()
print("wrote", dst)
