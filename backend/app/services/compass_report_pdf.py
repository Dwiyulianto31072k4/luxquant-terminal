"""
Compass report PDF archive.

Generates a polished, user-facing PDF from the same report_json persisted in
ai_arena_reports. The generator is intentionally non-blocking for the worker:
callers should catch failures so report persistence remains the source of truth.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

PDF_DIR = Path(os.getenv("COMPASS_REPORT_PDF_DIR", "/opt/luxquant/compass-report-pdfs"))
PDF_STYLE_VERSION = "v3"


class CompassPdfGenerationError(RuntimeError):
    """Raised when a Compass report cannot be rendered as a PDF."""


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _safe_report_id(report_id: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(report_id or "report")).strip("._-")
    return token[:120] or "report"


def report_pdf_path(report_id: str) -> Path:
    return PDF_DIR / f"compass_{PDF_STYLE_VERSION}_{_safe_report_id(report_id)}.pdf"


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _text(value: Any, fallback: str = "-") -> str:
    if value is None:
        return fallback
    value = str(value).strip()
    return value if value else fallback


def _title(value: Any) -> str:
    return _text(value).replace("_", " ").title()


def _money(value: Any) -> str:
    try:
        return f"${float(value):,.0f}"
    except (TypeError, ValueError):
        return "-"


def _pct(value: Any, scale_one: bool = False) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    if scale_one and abs(number) <= 1:
        number *= 100
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}%"


def _score(value: Any) -> str:
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return "-"


def _p(text: Any, style):
    from reportlab.platypus import Paragraph

    safe = escape(_text(text)).replace("\n", "<br/>")
    return Paragraph(safe, style)


def _bullets(items: list[Any], style, limit: int = 6):
    if not items:
        return [_p("No material items recorded.", style)]
    return [_p(f"- {_text(item)}", style) for item in items[:limit]]


def _row_evidence(row: dict[str, Any]) -> str:
    evidence = row.get("evidence") or []
    if isinstance(evidence, list) and evidence:
        parts = []
        for item in evidence[:2]:
            if not isinstance(item, dict):
                continue
            metric = _text(item.get("metric"), "Metric")
            value = _text(item.get("value"), "-")
            parts.append(f"{metric}: {value}")
        if parts:
            return "; ".join(parts)
    return _text(row.get("rationale") or row.get("summary"), "Evidence available in report JSON.")


def _zone_label(zone: dict[str, Any]) -> str:
    low = zone.get("price_low", zone.get("low"))
    high = zone.get("price_high", zone.get("high"))
    if low is None and high is None:
        return "-"
    return f"{_money(low)} - {_money(high)}"


def _magnet_price(magnet: Any) -> Any:
    if isinstance(magnet, dict):
        return magnet.get("price")
    return magnet


def _distance(current: Any, target: Any) -> str:
    try:
        cur = float(current)
        tgt = float(target)
        if cur == 0:
            return "-"
    except (TypeError, ValueError):
        return "-"
    return _pct((tgt - cur) / cur * 100)


def _projection(report: dict[str, Any]) -> dict[str, str]:
    verdict = _as_dict(report.get("verdict"))
    tactical = _as_dict(verdict.get("tactical_24h"))
    direction = str(tactical.get("direction") or "neutral").lower()
    price = report.get("btc_price")
    liquidity = _as_dict(report.get("liquidity"))
    magnets = _as_dict(liquidity.get("magnets"))
    nearest_above = _magnet_price(magnets.get("nearest_above"))
    nearest_below = _magnet_price(magnets.get("nearest_below"))
    zones = [z for z in verdict.get("zones_to_watch") or [] if isinstance(z, dict)]
    demand = next((z for z in zones if z.get("kind") == "demand"), None)
    fair = next((z for z in zones if z.get("kind") == "fair_value"), None)
    supply = next((z for z in zones if z.get("kind") == "supply"), None)

    if direction == "bearish":
        target = nearest_below or (demand or {}).get("price_high") or (demand or {}).get("price_low")
        reaction = _zone_label(demand or {}) if demand else _money(nearest_below)
        invalidation = (supply or {}).get("price_low") or nearest_above
        why = "Seller control points to the nearest downside magnet first, then demand becomes the reaction area."
    elif direction == "bullish":
        target = nearest_above or (supply or {}).get("price_low") or (supply or {}).get("price_high")
        reaction = _zone_label(supply or {}) if supply else _money(nearest_above)
        invalidation = (demand or {}).get("price_high") or nearest_below
        why = "Bid control points to the nearest upside magnet first, then supply becomes the reaction area."
    else:
        above_distance = abs(float(nearest_above) - float(price)) if nearest_above and price else 10**9
        below_distance = abs(float(price) - float(nearest_below)) if nearest_below and price else 10**9
        target = nearest_above if above_distance <= below_distance else nearest_below
        reaction = _zone_label(fair or {}) if fair else "Range midpoint"
        invalidation = None
        why = "Neutral stance means the first useful read is the nearest magnet touch, not forced direction."

    return {
        "direction": _title(direction),
        "confidence": f"{tactical.get('confidence', '-')}%",
        "target": _money(target),
        "distance": _distance(price, target),
        "reaction": reaction or "-",
        "invalidation": _money(invalidation) if invalidation is not None else "Range break required",
        "why": why,
    }


def _make_styles():
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "CompassTitle",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=27,
            textColor=colors.HexColor("#f8fafc"),
            alignment=TA_LEFT,
            spaceAfter=7,
        ),
        "subtitle": ParagraphStyle(
            "CompassSubtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=13.5,
            textColor=colors.HexColor("#a8a29e"),
            spaceAfter=12,
        ),
        "eyebrow": ParagraphStyle(
            "CompassEyebrow",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#d4a853"),
            spaceAfter=5,
        ),
        "section": ParagraphStyle(
            "CompassSection",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13.5,
            leading=16,
            textColor=colors.HexColor("#f8fafc"),
            spaceBefore=8,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "CompassBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.6,
            leading=12.5,
            textColor=colors.HexColor("#d6d3d1"),
        ),
        "muted": ParagraphStyle(
            "CompassMuted",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10.5,
            textColor=colors.HexColor("#8b8580"),
        ),
        "metric": ParagraphStyle(
            "CompassMetric",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=14.5,
            leading=17,
            textColor=colors.HexColor("#f8fafc"),
        ),
        "small_center": ParagraphStyle(
            "CompassSmallCenter",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#d4a853"),
            alignment=TA_CENTER,
        ),
        "small_right": ParagraphStyle(
            "CompassSmallRight",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#8b8580"),
            alignment=TA_RIGHT,
        ),
    }


def _card(title: str, value: str, detail: str, styles, accent: str = "#d4a853"):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    data = [[_p(title.upper(), styles["eyebrow"])], [_p(value, styles["metric"])], [_p(detail, styles["muted"])]]
    table = Table(data, colWidths=[156], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#120d11")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor(accent)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _table(rows: list[list[Any]], styles, col_widths: list[float] | None = None):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    prepared = []
    for row in rows:
        prepared.append([cell if hasattr(cell, "wrap") else _p(cell, styles["body"]) for cell in row])
    table = Table(prepared, colWidths=col_widths, hAlign="LEFT", repeatRows=1 if len(prepared) > 1 else 0)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#171014")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#e7e5e4")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#2a2023")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#0b090c"), colors.HexColor("#100c0f")]),
    ]))
    return table


def _page(canvas, doc):
    from reportlab.lib import colors

    width, height = doc.pagesize
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#070506"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#0f0a0d"))
    canvas.rect(0, height - 48, width, 48, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#3a1114"))
    canvas.rect(0, height - 48, width, 3, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#2a2023"))
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, height - 48, width - doc.rightMargin, height - 48)
    canvas.setFillColor(colors.HexColor("#d4a853"))
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawString(doc.leftMargin, height - 27, "LUXQUANT BTC COMPASS")
    canvas.setFillColor(colors.HexColor("#8b8580"))
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(width - doc.rightMargin, height - 27, "ARCHIVED MARKET READ")
    canvas.drawRightString(width - doc.rightMargin, 22, f"Page {doc.page}")
    canvas.drawString(doc.leftMargin, 22, "Decision support only. Not financial advice.")
    canvas.restoreState()


def _build_story(report: dict[str, Any], report_id: str, report_timestamp: Any, output_path: Path) -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = _make_styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    verdict = _as_dict(report.get("verdict"))
    critique = _as_dict(report.get("critique"))
    evidence = _as_dict(report.get("evidence_matrix"))
    event_risk = _as_dict(report.get("event_risk"))
    liquidity = _as_dict(report.get("liquidity"))
    shadow = _as_dict(report.get("shadow_deterministic"))
    cycle = _as_dict(report.get("cycle_position"))
    generated_at = _parse_timestamp(report.get("generated_at") or report_timestamp)
    projection = _projection(report)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=19 * mm,
        bottomMargin=17 * mm,
        title=f"BTC Compass Report {report_id}",
        author="LuxQuant",
    )

    story = []
    story.append(_p("BTC COMPASS REPORT", styles["eyebrow"]))
    story.append(_p(_text(verdict.get("headline"), "Market read archived"), styles["title"]))
    story.append(_p(
        f"Report {_text(report_id)} generated {generated_at.strftime('%Y-%m-%d %H:%M UTC')} at BTC {_money(report.get('btc_price'))}. {_text(verdict.get('narrative'), '')}",
        styles["subtitle"],
    ))

    cards = Table([[
        _card("24h trader read", _title((_as_dict(verdict.get("tactical_24h"))).get("direction")), f"{(_as_dict(verdict.get('tactical_24h'))).get('confidence', '-')}% confidence", styles, "#7f1d1d"),
        _card("72h swing", _title((_as_dict(verdict.get("secondary_7d"))).get("direction")), f"{(_as_dict(verdict.get('secondary_7d'))).get('confidence', '-')}% confidence", styles, "#854d0e"),
        _card("Holder context", _title((_as_dict(verdict.get("primary_30d"))).get("direction")), f"{(_as_dict(verdict.get('primary_30d'))).get('confidence', '-')}% confidence", styles, "#065f46"),
    ]], colWidths=[166, 166, 166])
    cards.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(cards)
    story.append(Spacer(1, 12))

    story.append(_p("Trader Projection", styles["section"]))
    story.append(_table([
        ["Field", "Read"],
        ["24h stance", f"{projection['direction']} at {projection['confidence']} confidence"],
        ["Potential touch", f"{projection['target']} ({projection['distance']} from report price)"],
        ["Reaction area", projection["reaction"]],
        ["Invalidation watch", projection["invalidation"]],
        ["Reason", projection["why"]],
    ], styles, [118, 376]))
    story.append(Spacer(1, 10))

    story.append(_p("Price Areas", styles["section"]))
    zone_rows = [["Zone", "Price Area", "Why It Matters"]]
    for zone in verdict.get("zones_to_watch") or []:
        if not isinstance(zone, dict):
            continue
        detail = _text(zone.get("why"))
        if zone.get("liquidity_note"):
            detail += f" Liquidity note: {_text(zone.get('liquidity_note'))}"
        zone_rows.append([_title(zone.get("kind")), _zone_label(zone), detail])
    if len(zone_rows) == 1:
        zone_rows.append(["-", "-", "No zones recorded."])
    story.append(_table(zone_rows, styles, [80, 110, 304]))

    story.append(PageBreak())
    story.append(_p("Reasoning Breakdown", styles["section"]))
    reasoning_rows = [["Step", "Observation", "Interpretation", "Implication"]]
    for step in verdict.get("reasoning_chain") or []:
        if not isinstance(step, dict):
            continue
        reasoning_rows.append([
            f"{step.get('step', '-')}. {_text(step.get('title'))}",
            _text(step.get("observation")),
            _text(step.get("interpretation")),
            _text(step.get("implication")),
        ])
    if len(reasoning_rows) == 1:
        reasoning_rows.append(["-", "-", "-", "No reasoning chain recorded."])
    story.append(_table(reasoning_rows, styles, [95, 130, 130, 139]))
    story.append(Spacer(1, 10))

    story.append(_p("Evidence Matrix", styles["section"]))
    matrix_rows = [["Layer", "24h", "72h", "Score", "Main Evidence"]]
    for row in evidence.get("rows") or []:
        if not isinstance(row, dict):
            continue
        h24 = _as_dict((_as_dict(row.get("horizons"))).get("24h"))
        h72 = _as_dict((_as_dict(row.get("horizons"))).get("72h"))
        matrix_rows.append([
            _title(row.get("label") or row.get("key")),
            f"{_title(h24.get('direction'))} / {_score(h24.get('score'))}",
            f"{_title(h72.get('direction'))} / {_score(h72.get('score'))}",
            _score(row.get("score") or h24.get("score")),
            _row_evidence(row),
        ])
    if len(matrix_rows) == 1:
        matrix_rows.append(["-", "-", "-", "-", "No evidence matrix recorded."])
    story.append(_table(matrix_rows, styles, [88, 70, 70, 42, 224]))

    story.append(Spacer(1, 10))
    story.append(_p("Liquidity And Event Risk", styles["section"]))
    magnets = _as_dict(liquidity.get("magnets"))
    story.append(_table([
        ["Field", "Value"],
        ["Liquidity health", _title(liquidity.get("status") or ("available" if liquidity.get("available") else "unavailable"))],
        ["Model confidence", _pct(liquidity.get("model_confidence") or magnets.get("model_confidence"), scale_one=True)],
        ["Nearest magnet above", f"{_money(_magnet_price(magnets.get('nearest_above')))} ({_distance(report.get('btc_price'), _magnet_price(magnets.get('nearest_above')))})"],
        ["Nearest magnet below", f"{_money(_magnet_price(magnets.get('nearest_below')))} ({_distance(report.get('btc_price'), _magnet_price(magnets.get('nearest_below')))})"],
        ["Event risk", _title(event_risk.get("risk_level"))],
        ["Current warning", _text((event_risk.get("warnings") or [event_risk.get("summary") or "-"])[0])],
    ], styles, [125, 369]))
    story.append(Spacer(1, 10))

    story.append(_p("News And Calendar Preview", styles["section"]))
    news_rows = [["Type", "Item", "Impact"]]
    for item in (event_risk.get("headlines") or [])[:5]:
        if isinstance(item, dict):
            news_rows.append(["Headline", _text(item.get("title") or item.get("headline")), _title(item.get("impact") or item.get("severity") or "context")])
    for item in (event_risk.get("upcoming_events") or [])[:5]:
        if isinstance(item, dict):
            title = _text(item.get("title") or item.get("event"))
            when = _text(item.get("time") or item.get("date") or item.get("datetime"), "time n/a")
            news_rows.append(["Calendar", f"{title} - {when}", _title(item.get("impact") or item.get("importance") or "context")])
    if len(news_rows) == 1:
        news_rows.append(["-", "-", "No news/calendar items archived."])
    story.append(_table(news_rows, styles, [70, 314, 110]))

    story.append(Spacer(1, 10))
    story.append(_p("Quality Audit", styles["section"]))
    audit_rows = [["Check", "Result"]]
    audit_rows.append(["Critique decision", _title(critique.get("decision"))])
    audit_rows.append(["Critique assessment", _text(critique.get("overall_assessment"))])
    audit_rows.append(["Overconfidence flag", "Yes" if critique.get("overconfidence_flag") else "No"])
    audit_rows.append(["Shadow deterministic", json.dumps(shadow.get("comparison") or shadow.get("reason") or shadow, default=str)[:260]])
    audit_rows.append(["Cycle context", f"Score {_score(cycle.get('score'))}; phase {_title(cycle.get('phase'))}"])
    if verdict.get("what_changed"):
        audit_rows.append(["Changed from previous read", _text(verdict.get("what_changed"))])
    story.append(_table(audit_rows, styles, [125, 369]))

    doc.build(story, onFirstPage=_page, onLaterPages=_page)


def ensure_report_pdf(
    report_id: str,
    report_json: Any,
    report_timestamp: Any = None,
    force: bool = False,
) -> Path:
    """Return the PDF path for a report, generating it if needed."""
    report = _as_dict(report_json)
    if not report:
        raise CompassPdfGenerationError("report_json is empty or invalid")

    output_path = report_pdf_path(report_id)
    if output_path.exists() and not force:
        return output_path

    try:
        _build_story(report, report_id, report_timestamp, output_path)
    except ImportError as exc:
        raise CompassPdfGenerationError("reportlab is not installed") from exc
    except Exception as exc:  # reportlab errors are varied; keep caller-facing type stable.
        raise CompassPdfGenerationError(str(exc)) from exc

    return output_path


def report_pdf_status(report_id: str) -> dict[str, Any]:
    path = report_pdf_path(report_id)
    return {
        "pdf_ready": path.exists(),
        "pdf_size_bytes": path.stat().st_size if path.exists() else None,
        "pdf_filename": path.name,
        "pdf_path": str(path),
    }
