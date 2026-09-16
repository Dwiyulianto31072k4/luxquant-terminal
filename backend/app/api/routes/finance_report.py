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


def _summarise(rows: list) -> dict:
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

    return {
        "count": len(rows),
        "gross_usdt": round(gross, 2),
        "net_usdt": round(net, 2),
        "discount_usdt": round(discount, 2),
        "credit_usdt": round(credit, 2),
        "unique_users": len({r["user_id"] for r in rows if r["user_id"]}),
        "referral": {
            "count": len(referred),
            "net_usdt": round(sum(_f(r["final_amount"]) or _f(r["amount_usdt"]) for r in referred), 2),
            "commission_usdt": round(sum(_f(r["commission_amount"]) for r in referred), 2),
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
        "summary": _summarise(rows),
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
    fmt: str = Query("xlsx", pattern="^(xlsx|csv)$"),
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
    summary = _summarise(raw)
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
