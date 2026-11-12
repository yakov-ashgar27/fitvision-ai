"""Report files (US-14): PDF through headless Chromium (RTL-correct), Excel through openpyxl (right-to-left)."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

from ..config import settings

_env = Environment(loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "templates"),
                   autoescape=select_autoescape(["html"]))
STATUS_HE = {"Done": "הושלם", "Aborted": "הופסק", "InProgress": "בתהליך"}


def render_html(ctx: dict) -> str:
    s = ctx["summary"]
    return _env.get_template("report.html").render(
        r=ctx, s=s, trainee_name=ctx["trainee_name"], notes=ctx["notes"],
        started=str(ctx["started_at"])[:16].replace("T", " "), generated=str(ctx["generated_at"])[:16].replace("T", " "),
        status_he=STATUS_HE.get(s.get("status", ""), s.get("status", "")))


class _Chromium:
    """One long-lived Chromium per worker process (R-04): launching a browser per report is too slow."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pw = None
        self._browser = None

    def pdf(self, html: str, out: Path) -> None:
        with self._lock:
            if self._browser is None:
                from playwright.sync_api import sync_playwright
                self._pw = sync_playwright().start()
                self._browser = self._pw.chromium.launch(args=["--no-sandbox"])
            ctx = self._browser.new_context()
            try:
                page = ctx.new_page()
                page.set_content(html, wait_until="load")
                page.pdf(path=str(out), format="A4", print_background=True)
            finally:
                ctx.close()


chromium = _Chromium()


def _out_dir() -> Path:
    p = Path(settings.reports_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def export_pdf(ctx: dict) -> str:
    out = _out_dir() / f"report_{ctx['report_id']}.pdf"
    html = render_html(ctx)
    if settings.pdf_engine == "none":  # test mode without a browser: keep the HTML next to the path
        out.write_bytes(b"%PDF-1.4\n% placeholder (PDF_ENGINE=none)\n")
        (out.with_suffix(".html")).write_text(html, encoding="utf-8")
    else:
        chromium.pdf(html, out)
    return str(out)


def export_xlsx(ctx: dict) -> str:
    s = ctx["summary"]
    wb = Workbook()
    ws = wb.active
    ws.title = "סיכום"
    ws.sheet_view.rightToLeft = True
    bold = Font(bold=True)
    head_fill = PatternFill("solid", fgColor="E8EEF7")
    rows = [
        ("דוח סיכום אימון", ctx["trainee_name"]),
        ("תאריך האימון", str(ctx["started_at"])[:16].replace("T", " ")),
        ("סטטוס", STATUS_HE.get(s.get("status", ""), s.get("status", ""))),
        ("חזרות", s["total_reps"]),
        ("חזרות תקינות", s["valid_reps"]),
        ("ציון טכניקה", s["avg_score"]),
        ("מגמה מול 3 אימונים קודמים (%)", s["improvement_pct"] if s["improvement_pct"] is not None else "אין מספיק נתונים"),
    ]
    for r in rows:
        ws.append(list(r))
        ws.cell(ws.max_row, 1).font = bold
    ws.column_dimensions["A"].width = 32
    ws.column_dimensions["B"].width = 24

    sets_ws = wb.create_sheet("סטים")
    sets_ws.sheet_view.rightToLeft = True
    sets_ws.append(["תרגיל", "סט", "חזרות", "תקינות", "ציון", "טווח תנועה ממוצע"])
    for ex in s["exercises"]:
        for st in ex["sets"]:
            sets_ws.append([ex["name"], st["set_number"], st["total_reps"], st["valid_reps"],
                            st["technique_score"], st["avg_rom_deg"]])
    fp_ws = wb.create_sheet("נקודות כשל")
    fp_ws.sheet_view.rightToLeft = True
    fp_ws.append(["תרגיל", "כלל", "הודעה", "אחוז חזרות", "סט"])
    for ex in s["exercises"]:
        for f in ex["failure_points"]:
            fp_ws.append([ex["name"], f["rule_name"], f["message"], f["pct"], f["set_number"]])
    notes_ws = wb.create_sheet("הערות מאמן")
    notes_ws.sheet_view.rightToLeft = True
    notes_ws.append(["מאמן", "תאריך", "הערה"])
    for n in ctx["notes"]:
        notes_ws.append([n["trainer_name"], str(n["created_at"])[:16], n["note_text"]])
    for sheet in (sets_ws, fp_ws, notes_ws):
        for c in sheet[1]:
            c.font = bold
            c.fill = head_fill
        for col in "ABCDEF":
            sheet.column_dimensions[col].width = 22
        for row in sheet.iter_rows(min_row=2):
            for c in row:
                c.alignment = Alignment(wrap_text=True, vertical="top")
    out = _out_dir() / f"report_{ctx['report_id']}.xlsx"
    wb.save(out)
    return str(out)


def export_json(ctx: dict) -> str:
    out = _out_dir() / f"report_{ctx['report_id']}.json"
    out.write_text(json.dumps({k: v for k, v in ctx.items()}, default=str, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(out)


EXPORTERS = {"pdf": export_pdf, "xlsx": export_xlsx, "json": export_json}
MIME = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "json": "application/json"}


def file_for(report_id: int, fmt: str) -> str | None:
    p = _out_dir() / f"report_{report_id}.{fmt}"
    return str(p) if os.path.exists(p) else None
