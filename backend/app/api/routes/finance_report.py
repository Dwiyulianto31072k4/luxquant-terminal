# backend/app/api/routes/finance_report.py
"""
Finance reporting — a recap over a chosen period, on screen and as a file.

Everything here was checked against production before it was written, because a
financial report that is quietly wrong is worse than no report:

**The route a payment arrived by is derived per PAYMENT, not per user.**
`finance._serialize_row` exposes `is_manual` from `user.subscription_source`,
which is a property of the ACCOUNT — once someone has ever been recorded by
hand, every payment they make reads as manual. For a recap that is simply
false. The three routes are disjoint and were counted on live data
(2026-09-17): 11 claim-link, 4 admin-recorded, 460 self-serve, 475 total, zero
overlap.

  · claim link   — a manual_payment_offer points at this payment
  · admin manual — notes open with "[Manual payment recorded by @", the stamp
                   finance.create_manual_payment writes
  · self-serve   — everything else: the normal checkout

**Basis is a real choice, not a detail.** `verified_at` is when the money
landed; `created_at` is when the invoice was raised. Four confirmed payments
differ between the two, and one $1,000 lifetime is verified *eight days before*
it was created — an admin recording a payment received earlier. So the basis
moves revenue between months and the caller has to pick. Every confirmed
payment does carry `verified_at` (checked: 0 of 70 missing), so a verified
basis loses nothing.

**Summaries are computed from the same rows that are exported.** They could be
done in SQL more cheaply, but then the totals and the line items are two
different queries that can disagree — which is exactly the sort of thing nobody
notices on a report until it matters. The period is bounded, so the cost is not.
"""

import csv
import io
import logging
from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workspace/finance", tags=["finance"])

# Anything not in this set is a typo, not a status.
KNOWN_STATUSES = ("confirmed", "pending", "expired", "cancelled", "refunded")

ROUTE_LABELS = {
    "self_serve": "Self-serve checkout",
    "claim_link": "Claim link",
    "admin_manual": "Recorded by admin",
}

METHOD_LABELS = {
    "onchain_bsc": "On-chain (BSC)",
    "exchange_transfer": "Exchange transfer",
    "bank_transfer": "Bank transfer",
}

_SQL = """
SELECT
  p.id,
  p.created_at,
  p.verified_at,
  p.status,
  u.id                AS user_id,
  u.username,
  u.email,
  sp.name             AS plan_name,
  sp.label            AS plan_label,
  sp.duration_days,
  p.amount_usdt,
  p.discount_amount,
  p.credit_redeemed,
  p.final_amount,
  p.method,
  p.network,
  p.tx_hash,
  p.wallet_from,
  p.wallet_to,
  rw.exchange_name    AS wallet_exchange,
  rw.label            AS wallet_label,
  p.paid_currency,
  p.paid_amount,
  p.fx_rate,
  p.reference,
  p.partner_source,
  CASE WHEN o.payment_id IS NOT NULL THEN 'claim_link'
       WHEN p.notes LIKE '[Manual payment recorded by @%' THEN 'admin_manual'
       ELSE 'self_serve' END AS route,
  o.id                AS offer_id,
  o.created_by        AS offer_created_by,
  rc.code             AS referral_code,
  ru_user.username    AS referrer_username,
  ru.commission_amount
FROM payments p
LEFT JOIN users u               ON u.id  = p.user_id
LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
LEFT JOIN manual_payment_offers o ON o.payment_id = p.id
LEFT JOIN referral_uses ru      ON ru.id = p.referral_use_id
LEFT JOIN referral_codes rc     ON rc.id = ru.referral_code_id
LEFT JOIN users ru_user         ON ru_user.id = ru.referrer_id
LEFT JOIN receiving_wallets rw  ON lower(rw.address) = lower(p.wallet_to)
WHERE p.deleted_at IS NULL
  AND {basis_col} >= :start_ts
  AND {basis_col} <  :end_ts
  {status_clause}
ORDER BY {basis_col} ASC, p.id ASC
"""


def _f(v) -> float:
    return float(v) if v is not None else 0.0


def _period_bounds(start: date, end: date):
    """End is INCLUSIVE for the person reading it: "1st to 30th" means the 30th
    is in. Half-open in SQL, so a payment at 23:59 on the last day counts."""
    start_ts = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_ts = datetime.combine(end, time.max, tzinfo=timezone.utc)
    return start_ts, end_ts


def _collect(db: Session, start: date, end: date, statuses: list, basis: str):
    basis_col = "p.verified_at" if basis == "verified" else "p.created_at"
    status_clause = ""
    params = {}
    if statuses:
        status_clause = "AND p.status = ANY(:statuses)"
        params["statuses"] = statuses
    start_ts, end_ts = _period_bounds(start, end)
    params["start_ts"] = start_ts
    params["end_ts"] = end_ts
    sql = _SQL.format(basis_col=basis_col, status_clause=status_clause)
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


# The partner share. A parameter rather than a constant because the number is a
# commercial term, not a fact about the code.
DEFAULT_PARTNER_PCT = 20.0
PARTNER_NAME = "BigStar"


def _split(net: float, commission: float, partner_pct: float) -> dict:
    """Revenue received, less what is already owed out, then divided.

    The base is net-of-commission on purpose. Referral commission is money
    promised to a third party at the moment the payment lands — paying a partner
    a share of it would be paying out the same USDT twice. It is shown as its
    own line rather than folded in, so the deduction is visible.

    HONEST LIMIT, and it belongs on the document: the only costs this can see
    are the ones recorded against a payment. Infrastructure, model/API spend,
    exchange and network fees are nowhere in this database, so this is profit
    net of RECORDED deductions, not true net profit. Anyone settling with a
    partner on it should know which of the two they are holding.
    """
    distributable = round(net - commission, 2)
    partner = round(distributable * partner_pct / 100.0, 2)
    return {
        "partner_name": PARTNER_NAME,
        "partner_pct": partner_pct,
        "house_pct": round(100.0 - partner_pct, 2),
        "net_received": round(net, 2),
        "referral_commission": round(commission, 2),
        "distributable": distributable,
        "partner_share": partner,
        # Subtract rather than multiply, so the two halves always add back to
        # the distributable figure even when the percentage does not divide it
        # cleanly.
        "house_share": round(distributable - partner, 2),
        "basis_note": "Net received less referral commission. Excludes infrastructure, API and network costs, which are not recorded per payment.",
    }


def _summarise(rows: list, partner_pct: float = DEFAULT_PARTNER_PCT) -> dict:
    """Totals, and every breakdown, from the rows themselves — see the note at
    the top of this file on why this is not done in SQL."""
    def bucket(key_fn, label_fn=None):
        out = {}
        for r in rows:
            k = key_fn(r) or "—"
            b = out.setdefault(k, {"key": k, "label": (label_fn(k) if label_fn else k),
                                   "count": 0, "gross": 0.0, "net": 0.0})
            b["count"] += 1
            b["gross"] += _f(r["amount_usdt"])
            b["net"] += _f(r["final_amount"]) or _f(r["amount_usdt"])
        return sorted(out.values(), key=lambda b: -b["net"])

    gross = sum(_f(r["amount_usdt"]) for r in rows)
    net = sum(_f(r["final_amount"]) or _f(r["amount_usdt"]) for r in rows)
    discount = sum(_f(r["discount_amount"]) for r in rows)
    credit = sum(_f(r["credit_redeemed"]) for r in rows)
    referred = [r for r in rows if r["referral_code"]]

    commission = sum(_f(r["commission_amount"]) for r in referred)
    return {
        "count": len(rows),
        "split": _split(net, commission, partner_pct),
        "gross_usdt": round(gross, 2),
        "net_usdt": round(net, 2),
        "discount_usdt": round(discount, 2),
        "credit_usdt": round(credit, 2),
        "unique_users": len({r["user_id"] for r in rows if r["user_id"]}),
        "referral": {
            "count": len(referred),
            "net_usdt": round(sum(_f(r["final_amount"]) or _f(r["amount_usdt"]) for r in referred), 2),
            "commission_usdt": round(commission, 2),
        },
        "by_plan": bucket(lambda r: r["plan_label"] or r["plan_name"]),
        "by_route": bucket(lambda r: r["route"], lambda k: ROUTE_LABELS.get(k, k)),
        "by_method": bucket(lambda r: r["method"], lambda k: METHOD_LABELS.get(k, k)),
        # Casing is inconsistent in the column itself (BSC 474 / bsc 1), and an
        # uppercase split would have put one payment in a network of its own.
        "by_network": bucket(lambda r: (r["network"] or "").upper() or None),
        "by_exchange": bucket(lambda r: r["wallet_exchange"]),
        "by_status": bucket(lambda r: r["status"]),
    }


def _parse_statuses(status: str) -> list:
    if not status or status == "all":
        return []
    wanted = [s.strip() for s in status.split(",") if s.strip()]
    bad = [s for s in wanted if s not in KNOWN_STATUSES]
    if bad:
        raise HTTPException(400, f"unknown status: {', '.join(bad)}")
    return wanted


def _validate_period(start: date, end: date):
    if end < start:
        raise HTTPException(400, "end date is before start date")
    if (end - start).days > 400:
        raise HTTPException(400, "period is longer than 400 days — narrow it down")


@router.get("/report")
def finance_report(
    start: date = Query(..., description="First day, inclusive (YYYY-MM-DD)"),
    end: date = Query(..., description="Last day, inclusive (YYYY-MM-DD)"),
    status: str = Query("confirmed", description="Comma list, or 'all'"),
    basis: str = Query("verified", pattern="^(verified|created)$"),
    partner_pct: float = Query(DEFAULT_PARTNER_PCT, ge=0, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """The recap on screen: summary, every breakdown, and the line items."""
    _validate_period(start, end)
    statuses = _parse_statuses(status)
    rows = _collect(db, start, end, statuses, basis)
    return {
        "period": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "basis": basis,
            "basis_label": "Date paid" if basis == "verified" else "Date invoiced",
            "status": statuses or list(KNOWN_STATUSES),
        },
        "summary": _summarise(rows, partner_pct),
        "rows": [_public_row(r) for r in rows],
    }


def _public_row(r: dict) -> dict:
    paid_on = r["verified_at"] or r["created_at"]
    return {
        "id": r["id"],
        "created_at": r["created_at"],
        "verified_at": r["verified_at"],
        "date": paid_on.date().isoformat() if paid_on else None,
        "status": r["status"],
        "user_id": r["user_id"],
        "username": r["username"],
        "email": r["email"],
        "plan": r["plan_label"] or r["plan_name"],
        "plan_name": r["plan_name"],
        "duration_days": r["duration_days"],
        "gross_usdt": _f(r["amount_usdt"]),
        "discount_usdt": _f(r["discount_amount"]),
        "credit_usdt": _f(r["credit_redeemed"]),
        "net_usdt": _f(r["final_amount"]) or _f(r["amount_usdt"]),
        "route": r["route"],
        "route_label": ROUTE_LABELS.get(r["route"], r["route"]),
        "method": r["method"],
        "method_label": METHOD_LABELS.get(r["method"], r["method"]),
        "network": (r["network"] or "").upper() or None,
        "tx_hash": r["tx_hash"],
        "wallet_from": r["wallet_from"],
        "wallet_to": r["wallet_to"],
        "exchange": r["wallet_exchange"],
        "wallet_label": r["wallet_label"],
        "paid_currency": r["paid_currency"],
        "paid_amount": _f(r["paid_amount"]) if r["paid_amount"] is not None else None,
        "fx_rate": _f(r["fx_rate"]) if r["fx_rate"] is not None else None,
        "reference": r["reference"],
        "offer_id": r["offer_id"],
        "referral_code": r["referral_code"],
        "referrer": r["referrer_username"],
        "commission_usdt": _f(r["commission_amount"]) if r["commission_amount"] is not None else None,
    }


# Column order is the reading order of the request: who, what plan, how much,
# by which route, through which venue, and the hash that proves it.
EXPORT_COLUMNS = [
    ("date", "Date"),
    ("id", "Payment ID"),
    ("status", "Status"),
    ("username", "User"),
    ("email", "Email"),
    ("plan", "Plan"),
    ("duration_days", "Duration (days)"),
    ("gross_usdt", "Gross USDT"),
    ("discount_usdt", "Discount USDT"),
    ("credit_usdt", "Credit USDT"),
    ("net_usdt", "Net USDT"),
    ("route_label", "Route"),
    ("method_label", "Method"),
    ("exchange", "Exchange"),
    ("wallet_label", "Receiving wallet"),
    ("network", "Network"),
    ("tx_hash", "TX hash"),
    ("wallet_from", "From address"),
    ("wallet_to", "To address"),
    ("paid_currency", "Paid currency"),
    ("paid_amount", "Paid amount"),
    ("fx_rate", "FX rate"),
    ("reference", "Reference"),
    ("offer_id", "Claim offer ID"),
    ("referral_code", "Referral code"),
    ("referrer", "Referrer"),
    ("commission_usdt", "Commission USDT"),
    ("created_at", "Invoiced at"),
    ("verified_at", "Paid at"),
]


def _cell(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M UTC")
    return v


@router.get("/report/export")
def finance_report_export(
    start: date = Query(...),
    end: date = Query(...),
    status: str = Query("confirmed"),
    basis: str = Query("verified", pattern="^(verified|created)$"),
    fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"),
    partner_pct: float = Query(DEFAULT_PARTNER_PCT, ge=0, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """The same report as a file. xlsx carries the summary on its own sheet;
    csv is the line items only, because a CSV with two shapes in it is a CSV
    that no spreadsheet opens correctly."""
    _validate_period(start, end)
    statuses = _parse_statuses(status)
    raw = _collect(db, start, end, statuses, basis)
    rows = [_public_row(r) for r in raw]
    summary = _summarise(raw, partner_pct)
    stem = f"luxquant-finance-{start.isoformat()}_{end.isoformat()}"

    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([label for _, label in EXPORT_COLUMNS])
        for r in rows:
            w.writerow([_cell(r.get(key)) for key, _ in EXPORT_COLUMNS])
        data = buf.getvalue().encode("utf-8-sig")  # BOM: Excel opens UTF-8 correctly
        return StreamingResponse(
            io.BytesIO(data), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'})

    if fmt == "pdf":
        return _pdf(stem, rows, summary, start, end, basis, statuses)

    return _xlsx(stem, rows, summary, start, end, basis, statuses)


def _xlsx(stem, rows, summary, start, end, basis, statuses):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        # Declared in requirements.txt, but say so plainly rather than 500.
        raise HTTPException(
            503, "Excel export is unavailable on this server (openpyxl missing). Use fmt=csv.")

    wb = Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="1F2937")
    money = '#,##0.00'

    ws = wb.active
    ws.title = "Summary"
    ws.append(["LuxQuant — finance report"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    ws.append(["Period", f"{start.isoformat()} to {end.isoformat()} (inclusive)"])
    ws.append(["Counted on", "Date paid (verified_at)" if basis == "verified" else "Date invoiced (created_at)"])
    ws.append(["Statuses", ", ".join(statuses) if statuses else "all"])
    ws.append(["Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")])
    ws.append([])
    ws.append(["Payments", summary["count"]])
    ws.append(["Unique users", summary["unique_users"]])
    ws.append(["Gross USDT", summary["gross_usdt"]])
    ws.append(["Discount USDT", summary["discount_usdt"]])
    ws.append(["Credit USDT", summary["credit_usdt"]])
    ws.append(["Net USDT", summary["net_usdt"]])
    ws.append([])
    ws.append(["Referred payments", summary["referral"]["count"]])
    ws.append(["Referred net USDT", summary["referral"]["net_usdt"]])
    ws.append(["Commission owed USDT", summary["referral"]["commission_usdt"]])

    for title, key in (("By plan", "by_plan"), ("By route", "by_route"),
                       ("By method", "by_method"), ("By exchange", "by_exchange"),
                       ("By network", "by_network"), ("By status", "by_status")):
        ws.append([])
        ws.append([title, "Count", "Gross USDT", "Net USDT"])
        for c in range(1, 5):
            cell = ws.cell(row=ws.max_row, column=c)
            cell.font = head_font
            cell.fill = head_fill
        for b in summary[key]:
            ws.append([b["label"], b["count"], round(b["gross"], 2), round(b["net"], 2)])
    ws.column_dimensions["A"].width = 30
    for col in "BCD":
        ws.column_dimensions[col].width = 16

    ds = wb.create_sheet("Payments")
    ds.append([label for _, label in EXPORT_COLUMNS])
    for c in range(1, len(EXPORT_COLUMNS) + 1):
        cell = ds.cell(row=1, column=c)
        cell.font = head_font
        cell.fill = head_fill
        cell.alignment = Alignment(vertical="center")
    for r in rows:
        ds.append([_cell(r.get(key)) for key, _ in EXPORT_COLUMNS])
    for idx, (key, label) in enumerate(EXPORT_COLUMNS, start=1):
        letter = get_column_letter(idx)
        # The hash is 66 characters and nobody reads it in the grid; it is here
        # to be copied, so give it a usable width rather than a full one.
        ds.column_dimensions[letter].width = 22 if key in ("tx_hash", "wallet_from", "wallet_to", "email") else max(12, len(label) + 3)
        if key.endswith("_usdt"):
            for row in range(2, ds.max_row + 1):
                ds.cell(row=row, column=idx).number_format = money
    ds.freeze_panes = "A2"

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{stem}.xlsx"'})


def _pdf(stem, rows, summary, start, end, basis, statuses):
    """A4 statement: the split first, then the breakdowns, then the ledger.

    Reuses billing_pdf's document identity rather than inventing a second
    LuxQuant look — same gold rule, same mono for every figure, same footer,
    and the same reason it is a LIGHT page: an invoice gets printed and
    forwarded to an accountant, and so will this.

    The split leads because it is what the document is FOR. Everything below it
    exists so the two numbers at the top can be checked rather than trusted.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
        TableStyle,
    )
    from app.services.billing_pdf import (
        BAND, GOLD, HAIR, INK, MONO, MONO_B, MUTED, SANS, SANS_B,
        SocialRow, _amount_band, _header, _kv, _money, _muted, _section,
    )
    from reportlab.pdfbase.pdfmetrics import stringWidth

    def footer(canvas, doc):
        """Local, because billing_pdf's `_page_furniture` paints its separator
        9 mm INSIDE the text frame. An invoice never reaches that far down so it
        never showed; a report whose ledger fills the page put a payment row
        through the rule on the first try. Same furniture, drawn entirely below
        the frame instead."""
        canvas.saveState()
        left = doc.leftMargin
        right = doc.pagesize[0] - doc.rightMargin
        base = doc.bottomMargin - 15 * mm
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.4)
        canvas.line(left, base + 12 * mm, right, base + 12 * mm)
        SocialRow().paint(canvas, left, base + 6 * mm)
        canvas.setFont(SANS, 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(left, base + 1.5 * mm, "LuxQuant — market intelligence for crypto.")
        tail = f"Page {canvas.getPageNumber()}"
        canvas.drawString(right - stringWidth(tail, SANS, 7.5), base + 1.5 * mm, tail)
        canvas.restoreState()

    period_label = f"{start.isoformat()} to {end.isoformat()}"
    sp = summary["split"]

    story = [
        _header("FINANCE REPORT", period_label),
        Spacer(1, 7 * mm),
    ]

    # ── The two figures the document exists to state ──────────────────
    partner_band = _amount_band(
        f"{sp['partner_name']} share ({_money(sp['partner_pct'])}%)",
        f"{_money(sp['partner_share'])} USDT",
        f"of {_money(sp['distributable'])} distributable")
    house_band = _amount_band(
        f"LuxQuant share ({_money(sp['house_pct'])}%)",
        f"{_money(sp['house_share'])} USDT",
        f"{summary['count']} payments · {summary['unique_users']} users")
    pair = Table([[partner_band, house_band]], colWidths=[None, None])
    pair.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 4 * mm),
        ("LEFTPADDING", (1, 0), (1, 0), 4 * mm),
        ("RIGHTPADDING", (1, 0), (-1, -1), 0),
    ]))
    story += [pair, Spacer(1, 6 * mm)]

    # ── How those two numbers were reached, line by line ──────────────
    story += [_section("How this was calculated"), Spacer(1, 2 * mm)]
    story += [_kv([
        ("Gross billed", f"{_money(summary['gross_usdt'])} USDT"),
        ("Less discounts", f"-{_money(summary['discount_usdt'])} USDT"),
        ("Net received", f"{_money(sp['net_received'])} USDT"),
        ("Less referral commission", f"-{_money(sp['referral_commission'])} USDT"),
        ("Distributable", f"{_money(sp['distributable'])} USDT"),
    ], strong_last_row=True)]
    story += [
        Spacer(1, 2 * mm),
        Paragraph(sp["basis_note"], _muted),
        Spacer(1, 5 * mm),
    ]

    story += [_section("Period"), Spacer(1, 2 * mm)]
    story += [_kv([
        ("Dates", f"{period_label} (inclusive)"),
        ("Counted on", "Date paid" if basis == "verified" else "Date invoiced"),
        ("Statuses", ", ".join(statuses) if statuses else "all"),
        ("Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")),
    ])]
    story += [Spacer(1, 6 * mm)]

    # ── Breakdowns ────────────────────────────────────────────────────
    def block(title, key):
        data = summary.get(key) or []
        if not data:
            return []
        head = ["", "Payments", "Net USDT"]
        body = [[b["label"], str(b["count"]), _money(b["net"])] for b in data]
        t = Table([head] + body, colWidths=[None, 24 * mm, 30 * mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), SANS_B),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
            ("FONTNAME", (1, 1), (-1, -1), MONO),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, HAIR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BAND]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (0, -1), 0),
        ]))
        return [KeepTogether([_section(title), Spacer(1, 2 * mm), t]), Spacer(1, 5 * mm)]

    for title, key in (("By plan", "by_plan"), ("By route", "by_route"),
                       ("By exchange", "by_exchange"), ("By method", "by_method"),
                       ("By status", "by_status")):
        story += block(title, key)

    # ── The ledger, landscape, because a TX hash is 66 characters ─────
    if rows:
        story += [PageBreak(), _section("Payments"), Spacer(1, 2 * mm)]
        head = ["Date", "ID", "User", "Plan", "Net", "Route", "Exchange", "TX hash"]
        body = []
        for r in rows:
            h = r.get("tx_hash") or ""
            body.append([
                r.get("date") or "",
                str(r["id"]),
                (r.get("username") or r.get("email") or "")[:22],
                r.get("plan") or "",
                _money(r.get("net_usdt")),
                r.get("route_label") or "",
                r.get("exchange") or "",
                # Enough to identify it against the explorer without wrapping
                # the row into three lines; the full hash is in the CSV/Excel.
                (h[:10] + "…" + h[-6:]) if len(h) > 20 else h,
            ])
        t = Table([head] + body, repeatRows=1,
                  colWidths=[20*mm, 12*mm, 38*mm, 20*mm, 20*mm, 34*mm, 24*mm, 42*mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), SANS_B),
            ("FONTSIZE", (0, 0), (-1, -1), 7.2),
            ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
            ("FONTNAME", (4, 1), (4, -1), MONO),
            ("FONTNAME", (7, 1), (7, -1), MONO),
            ("ALIGN", (4, 0), (4, -1), "RIGHT"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, HAIR),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BAND]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (0, -1), 0),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story += [t]

    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"LuxQuant finance report {period_label}", author="LuxQuant")
    doc.bottomMargin += 20 * mm   # the footer is painted in this band
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    out.seek(0)
    return StreamingResponse(
        out, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'})
