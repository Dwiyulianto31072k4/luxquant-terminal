"""Print a stored Agent acknowledgement as a dated PDF receipt."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

GOLD = colors.HexColor("#F0B90B")
INK = colors.HexColor("#0B0E11")
INK_2 = colors.HexColor("#181C22")
MUTED = colors.HexColor("#6B7280")
BODY = colors.HexColor("#1F2937")
LINE = colors.HexColor("#E5E7EB")
PAPER = colors.HexColor("#F7F5F0")
UP = colors.HexColor("#0B9E65")

PAGE_W, PAGE_H = A4
HEADER_H = 28 * mm
FOOTER_H = 14 * mm

_LOGO_CANDIDATES = (
    Path("/var/www/luxquantdata/logo-mark.png"),
    Path("/root/luxquant-terminal/frontend-react/public/logo-mark.png"),
    Path(__file__).resolve().parents[3] / "frontend-react" / "public" / "logo-mark.png",
)


def _fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%d %b %Y  ·  %H:%M:%S UTC")


def _logo_path() -> Path | None:
    for path in _LOGO_CANDIDATES:
        if path.is_file():
            return path
    return None


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text or "—")).replace("\n", "<br/>"), style)


class GoldRule(Flowable):
    def __init__(self, width: float, height: float = 1.2):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self) -> None:
        self.canv.setFillColor(GOLD)
        self.canv.rect(0, 0, self.width, self.height, stroke=0, fill=1)


class CheckRow(Flowable):
    def __init__(self, label: str, yes: bool, width: float):
        super().__init__()
        self.label = label
        self.yes = yes
        self.box = 4.2 * mm
        self.width = width
        self.height = 0

    def wrap(self, availWidth, availHeight):
        self.width = min(self.width, availWidth)
        style = ParagraphStyle(
            "ChkLbl",
            fontName="Times-Roman",
            fontSize=9.5,
            leading=13,
            textColor=INK,
        )
        self._para = Paragraph(escape(self.label), style)
        _w, h = self._para.wrap(self.width - self.box - 4 * mm, availHeight)
        self.height = max(self.box + 1 * mm, h + 2 * mm)
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        y = self.height - self.box - 0.4 * mm
        c.setStrokeColor(UP if self.yes else MUTED)
        c.setFillColor(UP if self.yes else colors.white)
        c.setLineWidth(0.8)
        c.roundRect(0, y, self.box, self.box, 1.1, stroke=1, fill=1)
        if self.yes:
            c.setStrokeColor(colors.white)
            c.setLineWidth(1.3)
            c.setLineCap(1)
            c.line(1.1 * mm, y + 2.1 * mm, 1.8 * mm, y + 1.3 * mm)
            c.line(1.8 * mm, y + 1.3 * mm, 3.3 * mm, y + 3.2 * mm)
        self._para.drawOn(c, self.box + 3.2 * mm, self.height - self._para.height)


def _draw_chrome(canvas, doc, *, kind_label: str, record_id: int) -> None:
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - HEADER_H - 1.6 * mm, PAGE_W, 1.6 * mm, stroke=0, fill=1)

    logo = _logo_path()
    text_x = 18 * mm
    if logo:
        try:
            canvas.drawImage(
                str(logo),
                18 * mm,
                PAGE_H - HEADER_H + 7 * mm,
                width=12 * mm,
                height=12 * mm,
                mask="auto",
                preserveAspectRatio=True,
            )
            text_x = 34 * mm
        except Exception:
            pass

    canvas.setFillColor(GOLD)
    canvas.setFont("Times-Bold", 8)
    canvas.drawString(text_x, PAGE_H - 12 * mm, "LUXQUANT")
    canvas.setFillColor(colors.white)
    canvas.setFont("Times-Bold", 13)
    canvas.drawString(text_x, PAGE_H - 18.5 * mm, "Agent acknowledgement")
    canvas.setFillColor(colors.HexColor("#C7CBD4"))
    canvas.setFont("Times-Roman", 8)
    canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 13 * mm, kind_label.upper())
    canvas.setFillColor(GOLD)
    canvas.setFont("Times-Bold", 8)
    canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 18.5 * mm, f"Record #{record_id}")

    canvas.setFillColor(INK)
    canvas.rect(0, 0, PAGE_W, FOOTER_H, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, FOOTER_H, PAGE_W, 0.8 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#C7CBD4"))
    canvas.setFont("Times-Roman", 7.5)
    canvas.drawString(
        18 * mm,
        6 * mm,
        "Official copy of the form accepted in Agent. Not a profit promise. Not a managed-account contract.",
    )
    canvas.drawRightString(PAGE_W - 18 * mm, 6 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_ack_pdf(*, ack: Any, user: Any) -> bytes:
    kind_label = "Assistant disclaimer" if ack.kind == "assistant" else "Live trading acknowledgement"
    username = getattr(user, "username", None) or "—"
    email = getattr(user, "email", None) or "—"
    snapshot = ack.form_snapshot or {}
    sections = snapshot.get("sections") or []
    checks = ack.checks or snapshot.get("checks") or []

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=HEADER_H + 10 * mm,
        bottomMargin=FOOTER_H + 8 * mm,
        title=f"LuxQuant Agent acknowledgement #{ack.id}",
        author="LuxQuant",
        subject=kind_label,
    )

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "AckTitle",
        parent=styles["Heading1"],
        fontName="Times-Bold",
        fontSize=20,
        leading=24,
        spaceAfter=4,
        textColor=INK,
    )
    lede = ParagraphStyle(
        "AckLede",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=10,
        leading=14,
        textColor=BODY,
        alignment=TA_JUSTIFY,
        spaceAfter=8,
    )
    h2 = ParagraphStyle(
        "AckH2",
        parent=styles["Heading2"],
        fontName="Times-Bold",
        fontSize=11.5,
        leading=15,
        spaceBefore=10,
        spaceAfter=4,
        textColor=INK,
    )
    body = ParagraphStyle(
        "AckBody",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=9.8,
        leading=14,
        alignment=TA_JUSTIFY,
        textColor=BODY,
        spaceAfter=6,
    )
    kstyle = ParagraphStyle(
        "AckK",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=7.4,
        leading=10,
        textColor=MUTED,
    )
    vstyle = ParagraphStyle(
        "AckV",
        parent=styles["Normal"],
        fontName="Times-Roman",
        fontSize=9.4,
        leading=12.5,
        textColor=INK,
    )
    small = ParagraphStyle(
        "AckSmall",
        parent=styles["Normal"],
        fontName="Times-Italic",
        fontSize=8,
        leading=11,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
    pill = ParagraphStyle(
        "AckPill",
        parent=styles["Normal"],
        fontName="Times-Bold",
        fontSize=8,
        leading=10,
        textColor=INK,
    )

    content_w = PAGE_W - 36 * mm
    story: list[Any] = [
        Paragraph(escape(ack.title or kind_label), title),
        Table(
            [[_p(kind_label.upper(), pill)]],
            colWidths=[78 * mm],
        ),
    ]
    story[-1].setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), GOLD),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.extend(
        [
            Spacer(1, 6),
            Paragraph(
                "This is a dated copy of the form this member ticked in Agent. "
                "It records acceptance only. It is not a promise of profit and not "
                "a contract for LuxQuant to manage the account.",
                lede,
            ),
            GoldRule(content_w),
            Spacer(1, 8),
        ]
    )

    meta_pairs = [
        ("Record", f"#{ack.id}"),
        ("Form version", ack.version or "—"),
        ("Accepted", _fmt_dt(ack.accepted_at)),
        ("User ID", f"lq:{ack.user_id}"),
        ("Username", username),
        ("Email", email),
        ("IP address", ack.ip or "—"),
        ("Kind", kind_label),
    ]
    cells = []
    row: list[Any] = []
    for label, value in meta_pairs:
        cell = [_p(label.upper(), kstyle), Spacer(1, 1), _p(value, vstyle)]
        row.append(cell)
        if len(row) == 2:
            cells.append(row)
            row = []
    if row:
        row.append("")
        cells.append(row)

    meta = Table(cells, colWidths=[content_w / 2, content_w / 2])
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(meta)

    if sections:
        story.append(Paragraph("Notice shown to the member", h2))
        for section in sections:
            block = [
                Paragraph(escape(str(section.get("title") or "")), h2),
                Paragraph(escape(str(section.get("body") or "")), body),
            ]
            story.append(KeepTogether(block))

    story.append(Paragraph("Boxes the member ticked", h2))
    for item in checks:
        story.append(
            CheckRow(str(item.get("label") or item.get("id") or ""), bool(item.get("checked", True)), content_w)
        )
        story.append(Spacer(1, 3.2))

    if ack.user_agent:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Browser recorded at acceptance", h2))
        story.append(Paragraph(escape(ack.user_agent), small))

    story.append(Spacer(1, 10))
    story.append(GoldRule(content_w, 0.6))
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "Generated from the LuxQuant acknowledgement log. Do not alter this file "
            "if you need it as an operational record.",
            small,
        )
    )

    def chrome(canvas, doc_):
        _draw_chrome(canvas, doc_, kind_label=kind_label, record_id=int(ack.id))

    doc.build(story, onFirstPage=chrome, onLaterPages=chrome)
    return buf.getvalue()
