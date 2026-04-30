# backend/app/services/etf_flows.py
"""
LuxQuant AI Arena v5 — ETF Flows Data Layer
=============================================
Institutional spot BTC ETF flow tracking.

Source: Farside Investors (https://farside.co.uk/btc/)
  - Free, public HTML table
  - Daily net flows per ETF (IBIT, FBTC, ARKB, etc)
  - No API key needed

Secondary: Coinbase Premium Index (via Coinbase vs Binance spot)
  - Proxy for US institutional buying pressure
  - Positive premium = US buying, Negative = selling

All functions return None/[] on failure — never raise.
"""

import re
import time
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List

# ═══════════════════════════════════════════
# Config
# ═══════════════════════════════════════════

FARSIDE_URL = "https://farside.co.uk/btc/"
FARSIDE_CACHE_TTL = 1800  # 30 min — Farside updates ~once per day anyway
COINBASE_TICKER = "https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD"
BINANCE_TICKER = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"

TIMEOUT = 15
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0"

# In-memory cache (avoid hammering Farside every run)
_cache = {"data": None, "fetched_at": 0}


def _log(msg):
    print(f"  [etf-flows] {msg}")


# ═══════════════════════════════════════════
# 1. Farside HTML Scraper
# ═══════════════════════════════════════════

def _clean_number(s: str) -> Optional[float]:
    """Parse Farside number format: '123.4', '(45.6)' = negative, '-' = None."""
    if not s or s.strip() in ("-", "", "N/A"):
        return None
    s = s.strip().replace(",", "")
    # Parentheses = negative
    is_neg = s.startswith("(") and s.endswith(")")
    if is_neg:
        s = s[1:-1]
    s = s.replace("$", "").replace("%", "")
    try:
        v = float(s)
        return -v if is_neg else v
    except ValueError:
        return None


def fetch_farside_etf_flows(force_refresh: bool = False) -> Optional[Dict]:
    """
    Scrape Farside Investors BTC ETF flows table.

    Returns:
        {
          "last_date": "2026-04-22",
          "last_total": 234.5,        # millions USD net flow
          "last_per_fund": {"IBIT": 123.4, "FBTC": 50.0, ...},
          "history_7d": [              # last 7 trading days
            {"date": "2026-04-16", "total": 100.0, "per_fund": {...}},
            ...
          ],
          "streak": {"direction": "inflow", "days": 5},  # consecutive same-direction days
          "cumulative_7d": 856.3,
          "cumulative_30d": 2341.8,
        }
        or None on failure.
    """
    global _cache
    now = time.time()

    if not force_refresh and _cache["data"] and (now - _cache["fetched_at"] < FARSIDE_CACHE_TTL):
        _log("using cached data")
        return _cache["data"]

    try:
        r = requests.get(FARSIDE_URL, headers={"User-Agent": UA}, timeout=TIMEOUT)
        if r.status_code != 200:
            _log(f"HTTP {r.status_code}")
            return None

        html = r.text
    except Exception as e:
        _log(f"fetch failed: {e}")
        return None

    # Parse the main table (Farside structure: <table><thead>... <tbody>...</tbody></table>)
    # Each row: <tr><td>DATE</td><td>IBIT</td>...<td>Total</td></tr>
    try:
        # Extract header (fund tickers)
        header_match = re.search(r'<thead.*?</thead>', html, re.DOTALL)
        if not header_match:
            _log("no thead found")
            return None

        # Fund tickers are in th elements
        funds = re.findall(r'<th[^>]*>([A-Z]{3,6})</th>', header_match.group(0))
        if not funds:
            _log("no fund headers parsed")
            return None

        # Last header "Total" is not a fund
        if funds and funds[-1].upper() == "TOTAL":
            funds = funds[:-1]

        # Extract body rows
        body_match = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL)
        if not body_match:
            _log("no tbody found")
            return None

        rows_html = re.findall(r'<tr[^>]*>(.*?)</tr>', body_match.group(1), re.DOTALL)

        parsed_rows = []
        for row_html in rows_html:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.DOTALL)
            if len(cells) < 2:
                continue
            # Strip HTML tags inside cells
            cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]

            # First cell = date, like "22 Apr 2026" or "2026-04-22"
            date_str = cells[0]
            parsed_date = _parse_date(date_str)
            if not parsed_date:
                continue

            # Rest of cells = per fund + total
            numbers = [_clean_number(c) for c in cells[1:]]

            # Match funds with numbers
            per_fund = {}
            for i, fund in enumerate(funds):
                if i < len(numbers):
                    v = numbers[i]
                    if v is not None:
                        per_fund[fund] = v

            # Total is last cell
            total = numbers[-1] if numbers else None

            parsed_rows.append({
                "date": parsed_date,
                "total": total,
                "per_fund": per_fund,
            })

        if not parsed_rows:
            _log("no data rows parsed")
            return None

        # Sort by date ascending
        parsed_rows.sort(key=lambda r: r["date"])

        # Take last 30 trading days
        last_30 = [r for r in parsed_rows if r["total"] is not None][-30:]
        if not last_30:
            _log("no rows with valid totals")
            return None

        latest = last_30[-1]

        # Streak calculation (consecutive inflow or outflow days)
        streak_direction = None
        streak_days = 0
        for row in reversed(last_30):
            if row["total"] is None:
                continue
            direction = "inflow" if row["total"] > 0 else "outflow"
            if streak_direction is None:
                streak_direction = direction
                streak_days = 1
            elif direction == streak_direction:
                streak_days += 1
            else:
                break

        # Cumulative
        last_7 = last_30[-7:]
        cum_7d = sum(r["total"] for r in last_7 if r["total"] is not None)
        cum_30d = sum(r["total"] for r in last_30 if r["total"] is not None)

        # Top contributors in last day
        top_contributors = sorted(
            [(k, v) for k, v in latest["per_fund"].items() if v is not None],
            key=lambda kv: abs(kv[1]),
            reverse=True,
        )[:3]

        data = {
            "last_date": latest["date"],
            "last_total": latest["total"],
            "last_per_fund": latest["per_fund"],
            "top_contributors": [{"fund": f, "flow": v} for f, v in top_contributors],
            "history_7d": last_7,
            "history_30d": last_30,
            "streak": {"direction": streak_direction, "days": streak_days},
            "cumulative_7d": round(cum_7d, 1),
            "cumulative_30d": round(cum_30d, 1),
            "source": "farside.co.uk",
        }

        _cache = {"data": data, "fetched_at": now}
        _log(f"OK last={latest['date']} total=${latest['total']}M "
             f"streak={streak_direction} {streak_days}d cum7d=${cum_7d:.0f}M")
        return data

    except Exception as e:
        _log(f"parse failed: {e}")
        return None


def _parse_date(s: str) -> Optional[str]:
    """Try multiple date formats, return ISO YYYY-MM-DD."""
    s = s.strip()
    formats = ["%d %b %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%B %d, %Y"]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ═══════════════════════════════════════════
# 2. Coinbase Premium Index
# ═══════════════════════════════════════════

def fetch_coinbase_premium() -> Optional[Dict]:
    """
    Coinbase Premium = (Coinbase BTC-USD - Binance BTCUSDT) / Binance * 100

    Interpretation:
      - Positive premium: US institutional buying pressure (Coinbase paying up)
      - Negative premium: US selling / offshore buying
      - Historical signal: sustained premium 0.1%+ is strong bullish (institutional accumulation)
    """
    try:
        # Coinbase spot price
        cb_r = requests.get(COINBASE_TICKER, timeout=TIMEOUT)
        cb_data = cb_r.json()
        cb_price = float(cb_data.get("price", 0) or 0)
    except Exception as e:
        _log(f"coinbase failed: {e}")
        cb_price = 0

    try:
        # Binance spot price
        bn_r = requests.get(BINANCE_TICKER, timeout=TIMEOUT)
        bn_data = bn_r.json()
        bn_price = float(bn_data.get("price", 0) or 0)
    except Exception as e:
        _log(f"binance failed: {e}")
        bn_price = 0

    if cb_price <= 0 or bn_price <= 0:
        return None

    premium = (cb_price - bn_price) / bn_price * 100

    # Classify
    if premium > 0.1:
        signal = "strong_buying"
    elif premium > 0.02:
        signal = "mild_buying"
    elif premium < -0.1:
        signal = "strong_selling"
    elif premium < -0.02:
        signal = "mild_selling"
    else:
        signal = "neutral"

    return {
        "coinbase_price": round(cb_price, 2),
        "binance_price": round(bn_price, 2),
        "premium_pct": round(premium, 4),
        "signal": signal,
    }


# ═══════════════════════════════════════════
# 3. Combined ETF Report
# ═══════════════════════════════════════════

def fetch_etf_summary() -> Dict:
    """
    Top-level function called by worker. Returns combined ETF + Coinbase Premium data.
    Never raises.
    """
    result = {}

    flows = fetch_farside_etf_flows()
    if flows:
        result["flows"] = flows

    premium = fetch_coinbase_premium()
    if premium:
        result["coinbase_premium"] = premium

    return result
