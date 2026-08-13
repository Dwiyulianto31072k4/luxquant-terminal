"""Print a stored Agent acknowledgement as a dated PDF receipt."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any


def _fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def build_ack_pdf(*, ack: Any, user: Any) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"LuxQuant Agent acknowledgement #{ack.id}",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "AckTitle",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        spaceAfter=4,
        textColor=colors.HexColor("#111827"),
    )
    eyebrow = ParagraphStyle(
        "AckEyebrow",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#6B7280"),
        tracking=1.2,
    )
    body = ParagraphStyle(
        "AckBody",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=13.5,
        alignment=TA_JUSTIFY,
        textColor=colors.HexColor("#374151"),
        spaceAfter=6,
    )
    h2 = ParagraphStyle(
        "AckH2",
        parent=styles["Heading2"],
        fontSize=11,
        leading=14,
        spaceBefore=8,
        spaceAfter=4,
        textColor=colors.HexColor("#111827"),
    )
    small = ParagraphStyle(
        "AckSmall",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#4B5563"),
        alignment=TA_LEFT,
    )
    check = ParagraphStyle(
        "AckCheck",
        parent=styles["Normal"],
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#111827"),
        leftIndent=12,
        spaceAfter=4,
    )

    kind_label = "Assistant disclaimer" if ack.kind == "assistant" else "Live trading acknowledgement"
    username = getattr(user, "username", None) or "—"
    email = getattr(user, "email", None) or "—"
    snapshot = ack.form_snapshot or {}
    sections = snapshot.get("sections") or []
    checks = ack.checks or snapshot.get("checks") or []

    story = [
        Paragraph("LUXQUANT  ·  AGENT RECORD", eyebrow),
        Paragraph(ack.title or kind_label, title),
        Paragraph(
            "This PDF is a copy of the form the user ticked in the Agent screen. "
            "It is stored so support can show when the notice was accepted. "
            "It is not a promise of profit and not a managed-account contract.",
            body,
        ),
        Spacer(1, 4),
    ]

    meta = [
        ["Record ID", str(ack.id)],
        ["Kind", kind_label],
        ["Form version", ack.version or "—"],
        ["Accepted at", _fmt_dt(ack.accepted_at)],
        ["User ID", str(ack.user_id)],
        ["Username", username],
        ["Email", email],
        ["IP address", ack.ip or "—"],
        ["User agent", (ack.user_agent or "—")[:180]],
    ]
    table = Table(meta, colWidths=[38 * mm, 134 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6B7280")),
                ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#111827")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 8))

    if sections:
        story.append(Paragraph("Notice the user was shown", h2))
        for section in sections:
            story.append(Paragraph(str(section.get("title") or ""), h2))
            story.append(Paragraph(str(section.get("body") or ""), body))

    story.append(Paragraph("Boxes the user ticked", h2))
    for item in checks:
        mark = "[YES]" if item.get("checked", True) else "[NO]"
        story.append(Paragraph(f"{mark}  {item.get('label') or item.get('id')}", check))

    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Generated from the LuxQuant user-management log. Do not alter this file "
            "if you need it as an operational record.",
            small,
        )
    )

    doc.build(story)
    return buf.getvalue()
