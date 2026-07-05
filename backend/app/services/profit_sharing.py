# backend/app/services/profit_sharing.py
"""
Profit-sharing calculator.

Two schemes, tagged per payment via payments.partner_source:

  • regular  (also Indonesia): owner 80% / bigstar 20% of gross.
  • canada   (Sam Jaber): the external partner takes 35% of gross FIRST, then
             the remaining 65% is split internally 85% owner / 15% bigstar.
             → owner 55.25%, bigstar 9.75%, external 35% of gross.

`gross` is the payment's final_amount when present, else amount_usdt (USDT).
Splits are rounded to 2 dp; the last party absorbs rounding drift so the
three parts always sum back to gross exactly.
"""
from __future__ import annotations

SCHEMES = {
    "regular": {
        "label": "Regular / Indonesia",
        "external_pct": 0.0,
        "external_name": None,
        "owner_pct_of_gross": 0.80,
        "bigstar_pct_of_gross": 0.20,
    },
    "canada": {
        "label": "Canada (Sam Jaber)",
        "external_pct": 0.35,
        "external_name": "Sam Jaber",
        "internal_owner_pct": 0.85,   # of the post-external remainder
        "internal_bigstar_pct": 0.15,
    },
}


def normalize_source(source: str | None) -> str:
    s = (source or "regular").strip().lower()
    if s in ("indonesia", "id", "reguler"):
        return "regular"
    return s if s in SCHEMES else "regular"


def compute_split(gross, source: str | None) -> dict:
    """Return {gross, external, external_name, owner, bigstar, scheme}."""
    g = round(float(gross or 0), 2)
    scheme = normalize_source(source)

    if scheme == "canada":
        cfg = SCHEMES["canada"]
        external = round(g * cfg["external_pct"], 2)
        remainder = round(g - external, 2)
        owner = round(remainder * cfg["internal_owner_pct"], 2)
        bigstar = round(g - external - owner, 2)  # absorbs rounding
        return {
            "gross": g, "external": external, "external_name": cfg["external_name"],
            "owner": owner, "bigstar": bigstar, "scheme": "canada",
        }

    cfg = SCHEMES["regular"]
    owner = round(g * cfg["owner_pct_of_gross"], 2)
    bigstar = round(g - owner, 2)  # absorbs rounding
    return {
        "gross": g, "external": 0.0, "external_name": None,
        "owner": owner, "bigstar": bigstar, "scheme": "regular",
    }
