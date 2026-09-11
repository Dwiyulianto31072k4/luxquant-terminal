"""A4 invoice and receipt as PDF, for the Telegram bot to hand over.

Built with reportlab rather than rendered from the HTML mail, and the document
is LIGHT where the mail is dark. Both of those are deliberate:

  · The mail is a message — read once, on a screen, in a dark inbox. This is a
    document — kept, forwarded to an accountant, sometimes printed. A dark A4
    page is a page nobody can print and an inbox full of toner complaints.
  · A PDF made by screenshotting a 600px email is a picture of a message, not a
    document: no selectable text, wrong page size, and it reflows into nothing.

What carries across is the brand, not the palette: the same gold, the same mark,
the same mono for every figure, and the same rule that a wallet address is text
you can copy rather than a link you can tap.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

logger = logging.getLogger(__name__)

GOLD = colors.HexColor("#F0B90B")
INK = colors.HexColor("#14181F")
MUTED = colors.HexColor("#6B7280")
HAIR = colors.HexColor("#E5E7EB")
BAND = colors.HexColor("#FAFAFA")

LOGO_PATH = os.getenv(
    "LUXQUANT_LOGO_PATH", "/root/luxquant-terminal/frontend-react/public/logo.png")

# Same glyphs as the mail footer, re-inked for paper: the mail set is a warm
# off-white for a dark ground and would be invisible here.
ICON_DIR = Path(__file__).resolve().parent.parent / "assets" / "billing"
SOCIALS = [
    ("web",       "luxquant.tw",     "https://luxquant.tw"),
    ("telegram",  "@LuxQuantSignal", "https://t.me/LuxQuantSignal"),
    ("x",         "@luxquantalgo",   "https://x.com/luxquantalgo"),
    ("x",         "@luxquantcrypto", "https://x.com/luxquantcrypto"),
    ("instagram", "@luxquant.tw",    "https://instagram.com/luxquant.tw"),
]


SANS, SANS_B = "Helvetica", "Helvetica-Bold"
MONO = "Helvetica"          # replaced below when the DejaVu mono is present


def _register_mono() -> str:
    """Figures want a mono face. DejaVu ships with the distro; if it is missing
    the document still builds, one degree less tidy, rather than failing."""
    global MONO
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"):
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont("LQMono", path))
                bold = path.replace("-Regular", "-Bold").replace(".ttf", "-Bold.ttf")
                if Path(bold).exists():
                    pdfmetrics.registerFont(TTFont("LQMono-Bold", bold))
                MONO = "LQMono"
                return MONO
            except Exception as e:
                logger.warning("mono font register failed: %s", e)
    return MONO


_register_mono()
MONO_B = "LQMono-Bold" if "LQMono-Bold" in pdfmetrics.getRegisteredFontNames() else MONO

_p = ParagraphStyle("p", fontName=SANS, fontSize=9.5, leading=14, textColor=INK)
_muted = ParagraphStyle("m", parent=_p, textColor=MUTED)
_h1 = ParagraphStyle("h1", fontName=SANS_B, fontSize=19, leading=23, textColor=INK)
_kicker = ParagraphStyle("k", fontName=SANS_B, fontSize=8, leading=12,
                         textColor=MUTED, alignment=TA_RIGHT)
_eyebrow = ParagraphStyle("e", fontName=SANS_B, fontSize=7.5, leading=11,
                          textColor=MUTED)


def _money(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return f"{f:,.0f}" if f == int(f) else f"{f:,.2f}"


def _header(kicker: str, number: str | None):
    logo = None
    if Path(LOGO_PATH).exists():
        try:
            logo = Image(LOGO_PATH, width=13 * mm, height=13 * mm)
        except Exception:
            logo = None
    left = Table(
        [[logo or "", Paragraph('<a href="https://luxquant.tw">'
                                '<font color="#14181F">Lux</font>'
                                '<font color="#F0B90B">Quant</font></a>',
                                ParagraphStyle("w", fontName=SANS_B, fontSize=15,
                                               leading=18, textColor=INK))]],
        colWidths=[15 * mm, None])
    left.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    right = Paragraph(kicker.upper() + (f"<br/>{number}" if number else ""), _kicker)
    t = Table([[left, right]], colWidths=[None, 55 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("LINEBELOW", (0, 0), (-1, -1), 1, GOLD),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def _kv(rows, *, mono_last=True, strong_last_row=False):
    """Label left, value right — the same two-column shape as the mail."""
    data = [[Paragraph(str(k), _muted),
             Paragraph(f'<font name="{MONO_B if (strong_last_row and i == len(rows) - 1) else MONO}">'
                       f'{v}</font>' if mono_last else str(v),
                       ParagraphStyle("v", parent=_p, alignment=TA_RIGHT))]
            for i, (k, v) in enumerate(rows)]
    t = Table(data, colWidths=[None, 62 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIR),
    ]))
    return t


def _section(title: str):
    return Paragraph(title.upper(), _eyebrow)


def _amount_band(label: str, value: str, sub: str = ""):
    # Unit a size down from the figure. At the same size mono puts a full em
    # between them and "375  USDT" reads as two separate values.
    fig, unit = (value.split(" ", 1) + [""])[:2]
    tail = (f'<font name="{MONO}" size="12" color="#6B7280"> {unit}</font>') if unit else ""
    inner = [[Paragraph(label.upper(), _eyebrow)],
             [Paragraph(f'<font name="{MONO_B}" size="20">{fig}</font>{tail}',
                        ParagraphStyle("big", parent=_p, fontSize=20, leading=25))]]
    if sub:
        inner.append([Paragraph(sub, _muted)])
    t = Table(inner, colWidths=[None])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BAND),
        ("BOX", (0, 0), (-1, -1), 0.6, HAIR),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
    ]))
    return t


class SocialRow(Flowable):
    """Icon + handle, and the WHOLE pair is the link.

    Not a Paragraph with `<a href><img/></a>`: reportlab builds the link
    annotation around the text run and leaves the inline image outside it — a
    measured fact, not a guess (the rect started 15pt to the right of the
    image). An icon that looks pressable and does nothing is worse than one
    that never looked pressable, so the rectangles are placed by hand.
    """

    SIZE = 9          # glyph box
    GAP = 3.5         # glyph to label
    PAD = 14          # between items
    FONT_SIZE = 8

    def __init__(self, items=None, font=SANS, color=MUTED):
        super().__init__()
        self.items = items or SOCIALS
        self.font = font
        self.color = color
        self._widths = [
            self.SIZE + self.GAP + stringWidth(label, self.font, self.FONT_SIZE)
            for _, label, _ in self.items
        ]

    def wrap(self, availWidth, availHeight):
        self.width = sum(self._widths) + self.PAD * (len(self.items) - 1)
        self.height = self.SIZE + 2
        return self.width, self.height

    def draw(self):
        self.paint(self.canv, 0, 0, relative=1)

    def paint(self, c, ox, oy, relative=0):
        """Draw at an absolute point too, so the page furniture and the
        flowable share one implementation and cannot drift apart."""
        x = ox
        for (slug, label, url), w in zip(self.items, self._widths):
            icon = ICON_DIR / f"{slug}-dark.png"
            if icon.exists():
                # mask='auto' honours the PNG alpha; without it every glyph
                # arrives in a black box.
                c.drawImage(str(icon), x, oy, self.SIZE, self.SIZE, mask="auto")
            c.setFont(self.font, self.FONT_SIZE)
            c.setFillColor(self.color)
            c.drawString(x + self.SIZE + self.GAP, oy + 1.5, label)
            # The link covers glyph AND label, with a little slack so it is
            # comfortable to hit rather than technically clickable.
            c.linkURL(url, (x - 1, oy - 1.5, x + w + 1, oy + self.SIZE + 1.5),
                      relative=relative, thickness=0)
            x += w + self.PAD


def _page_furniture(canvas, doc):
    """The footer is drawn on the page, not appended to the story.

    Flowed, it was one more thing competing for the last inch: an invoice
    carrying a discount and a credit pushed it onto a second page, and a page
    holding nothing but a footer is a document that looks broken. Painted at a
    fixed height it sits at the foot of every page and can never push content
    anywhere.
    """
    canvas.saveState()
    left = doc.leftMargin
    right = doc.pagesize[0] - doc.rightMargin
    y = doc.bottomMargin - 4 * mm

    canvas.setStrokeColor(HAIR)
    canvas.setLineWidth(0.4)
    canvas.line(left, y + 13 * mm, right, y + 13 * mm)

    SocialRow().paint(canvas, left, y + 7 * mm)

    canvas.setFont(SANS, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(left, y + 2.5 * mm,
                      "LuxQuant — market intelligence for crypto.")
    tail = "Questions about this document: t.me/luxquant_support"
    tw = stringWidth(tail, SANS, 7.5)
    canvas.drawString(right - tw, y + 2.5 * mm, tail)
    canvas.linkURL("https://t.me/luxquant_support",
                   (right - tw, y + 1 * mm, right, y + 5.5 * mm), thickness=0)
    canvas.restoreState()


def _build(path: str, story) -> str:
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title="LuxQuant", author="LuxQuant")
    # Room for the furniture, which lives below the text frame.
    doc.bottomMargin += 16 * mm
    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return path


def _duration(days: int | None) -> str:
    return "Lifetime" if days is None else f"{days} days"


def invoice_pdf(path: str, *, plan: str, amount, duration_days: int | None = None,
                invoice_no: str | None = None, issued: str | None = None,
                expires_at: str | None = None, account: str | None = None,
                telegram: str | None = None, wallet_to: str | None = None,
                network: str = "BEP-20", chain: str = "BNB Smart Chain (BSC)",
                covers_from: str | None = None, covers_to: str | None = None,
                list_price=None, discount=0, credit=0) -> str:
    access = _duration(duration_days)
    s = [_header("Invoice", invoice_no), Spacer(1, 5 * mm),
         Paragraph("Invoice", _h1), Spacer(1, 1 * mm),
         Paragraph("Unpaid. This document is the instruction to pay — it is not "
                   "a receipt.", _muted), Spacer(1, 4 * mm),
         _amount_band("Amount due", f"{_money(amount)} USDT",
                      f"{plan} · {access}" if access.lower() != plan.lower() else plan),
         Spacer(1, 5 * mm)]

    who = [(k, v) for k, v in (("Account", account),
                               ("Telegram", f"@{telegram.lstrip('@')}" if telegram else None))
           if v]
    if who:
        s += [_section("Billed to"), Spacer(1, 1.5 * mm), _kv(who), Spacer(1, 4 * mm)]

    plan_rows = [("Plan", plan), ("Access", access)]
    if covers_from and covers_to:
        plan_rows.append(("Covers", f"{covers_from} — {covers_to}"))
    s += [_section("Plan"), Spacer(1, 1.5 * mm), _kv(plan_rows), Spacer(1, 4 * mm)]

    d, c = float(discount or 0), float(credit or 0)
    amt_rows = []
    if d > 0 or c > 0:
        amt_rows.append(("Plan price", f"{_money(list_price if list_price is not None else amount)} USDT"))
        if d > 0:
            amt_rows.append(("Referral discount", f"-{_money(d)} USDT"))
        if c > 0:
            amt_rows.append(("Credit applied", f"-{_money(c)} USDT"))
    amt_rows.append(("Total due", f"{_money(amount)} USDT"))
    s += [_section("Amount"), Spacer(1, 1.5 * mm),
          _kv(amt_rows, strong_last_row=True), Spacer(1, 4 * mm)]

    if wallet_to:
        s += [_section("Send payment to"), Spacer(1, 1.5 * mm),
              _kv([("Token", f"USDT ({network})"), ("Chain", chain),
                   ("Address", wallet_to), ("Exact amount", f"{_money(amount)} USDT")],
                  strong_last_row=True), Spacer(1, 4 * mm)]

    meta = [(k, v) for k, v in (("Issued", issued), ("Invoice expires", expires_at)) if v]
    if meta:
        s += [_section("Invoice"), Spacer(1, 1.5 * mm), _kv(meta)]

    return _build(path, s)


def receipt_pdf(path: str, *, plan: str, amount, duration_days: int | None = None,
                receipt_no: str | None = None, paid_at: str | None = None,
                tx_hash: str | None = None, method: str | None = None,
                network: str = "BEP-20", chain: str = "BNB Smart Chain (BSC)",
                account: str | None = None, telegram: str | None = None,
                access_from: str | None = None, access_to: str | None = None,
                list_price=None, discount=0, credit=0) -> str:
    access = _duration(duration_days)
    until = access_to or ("never — Lifetime" if duration_days is None else "—")
    s = [_header("Receipt", receipt_no), Spacer(1, 5 * mm),
         Paragraph("Payment confirmed", _h1), Spacer(1, 1 * mm),
         Paragraph("Paid in full. Keep this document — it is your receipt.", _muted),
         Spacer(1, 4 * mm),
         _amount_band("Access runs to", until,
                      f"{plan} · {access}" if access.lower() != plan.lower() else plan),
         Spacer(1, 5 * mm)]

    who = [(k, v) for k, v in (("Account", account),
                               ("Telegram", f"@{telegram.lstrip('@')}" if telegram else None))
           if v]
    if who:
        s += [_section("Billed to"), Spacer(1, 1.5 * mm), _kv(who), Spacer(1, 4 * mm)]

    have = [("Plan", plan), ("Access", access)]
    if access_from and access_to:
        have.append(("Covers", f"{access_from} — {access_to}"))
    elif duration_days is None:
        have.append(("Expires", "never"))
    s += [_section("What you have"), Spacer(1, 1.5 * mm), _kv(have), Spacer(1, 4 * mm)]

    d, c = float(discount or 0), float(credit or 0)
    pay = []
    if d > 0 or c > 0:
        pay.append(("Plan price", f"{_money(list_price if list_price is not None else amount)} USDT"))
        if d > 0:
            pay.append(("Referral discount", f"-{_money(d)} USDT"))
        if c > 0:
            pay.append(("Credit applied", f"-{_money(c)} USDT"))
    pay.append(("Paid", f"{_money(amount)} USDT"))
    if method:
        pay.append(("Method", method))
    else:
        pay += [("Token", f"USDT ({network})"), ("Chain", chain)]
    if tx_hash:
        pay.append(("Transaction", tx_hash))
    if paid_at:
        pay.append(("Confirmed", paid_at))
    s += [_section("Payment"), Spacer(1, 1.5 * mm), _kv(pay)]

    return _build(path, s)
