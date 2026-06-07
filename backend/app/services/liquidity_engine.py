"""
Liquidity Engine — liquidation-heatmap layer for the Compass confluence stack.
=============================================================================
Additive companion to confluence_engine.py. Provides:

  parse_liq_heatmap(raw, current_price)  -> dict   (pure parser: magnets, dominance)
  evaluate_liquidity(parsed)             -> LayerVerdict  (confluence-compatible layer)

Design notes
------------
- Mirrors the MetricSignal / LayerVerdict / _aggregate_layer pattern so it slots
  straight into the existing engine without changing any tested code.
- Direction encoding (honest): a DENSE liquidation cluster ABOVE price tends to
  pull price UP (short liquidations get hunted) -> bullish *pull*; a dense cluster
  BELOW pulls DOWN -> bearish *pull*. A magnet is a pull, NOT a conviction signal,
  so thresholds are deliberately conservative and "sandwiched" => NEUTRAL (range).
- This layer is short-horizon. Feed it to the 24h/72h verdict, NOT the long-term
  cycle backdrop. (Wiring is decided in the worker, behind the deterministic flag.)
"""

from __future__ import annotations

from typing import Any

# Reuse the exact primitives from the existing engine (DRY, consistent output).
from app.services.confluence_engine import (  # type: ignore
    MetricSignal,
    LayerVerdict,
    _aggregate_layer,
)


def parse_liq_heatmap(
    raw: Any,
    current_price: float,
    *,
    window_pct: float = 8.0,
) -> dict | None:
    """
    Parse a CoinAnk liquidation-heatmap payload into structured magnets.

    `raw` is the Apify/CoinAnk output: a list (or dict) with
    liqHeatMap.{data, priceArray, chartTimeArray, maxLiqValue}.
    `data` rows are [timeIdx, priceIdx, liqValue] (strings ok).

    Returns a dict with magnets above/below, nearest magnets, and the
    upside-mass dominance ratio — or None if the payload is unusable.
    """
    rec = raw[0] if isinstance(raw, list) and raw else raw
    if not isinstance(rec, dict):
        return None
    lh = rec.get("liqHeatMap") or {}
    prices = [float(p) for p in lh.get("priceArray", []) if p is not None]
    data = lh.get("data", []) or []
    if not prices or not data:
        return None

    nP = len(prices)
    mass = [0.0] * nP
    for row in data:
        try:
            pi = int(row[1])
            v = float(row[2])
        except (IndexError, ValueError, TypeError):
            continue
        if 0 <= pi < nP:
            mass[pi] += v

    levels = [{"price": prices[i], "value": mass[i]} for i in range(nP) if mass[i] > 0]
    if not levels:
        return None

    cur = float(current_price)
    hi = cur * (1 + window_pct / 100.0)
    lo = cur * (1 - window_pct / 100.0)

    above = sorted([l for l in levels if l["price"] > cur], key=lambda x: -x["value"])
    below = sorted([l for l in levels if l["price"] < cur], key=lambda x: -x["value"])
    above_win = [l for l in above if l["price"] <= hi]
    below_win = [l for l in below if l["price"] >= lo]

    mass_above = sum(l["value"] for l in above_win)
    mass_below = sum(l["value"] for l in below_win)
    total = mass_above + mass_below
    dom_up = (mass_above / total) if total > 0 else 0.5

    def _nearest(side: list[dict]) -> dict | None:
        if not side:
            return None
        top = sorted(side, key=lambda x: -x["value"])[:5]  # strongest few
        return min(top, key=lambda x: abs(x["price"] - cur))  # of those, the closest

    return {
        "current_price": cur,
        "magnets_above": above[:3],
        "magnets_below": below[:3],
        "nearest_above": _nearest(above_win or above),
        "nearest_below": _nearest(below_win or below),
        "mass_above": mass_above,
        "mass_below": mass_below,
        "dominance_up": dom_up,          # 0..1  (>0.5 = upside heavier)
        "window_pct": window_pct,
        "tick_size": rec.get("tickSize"),
        "max_liq": lh.get("maxLiqValue"),
    }


def evaluate_liquidity(parsed: dict | None) -> LayerVerdict:
    """Wrap parsed heatmap into a confluence LayerVerdict (score -1/0/+1)."""
    metrics: list[MetricSignal] = []

    if not parsed:
        metrics.append(MetricSignal(
            key="liq_data", raw_value=None, score=0, label="—", available=False,
        ))
        return _aggregate_layer("liquidity", metrics)

    cur = parsed["current_price"]
    dom_up = parsed["dominance_up"]

    # Metric 1 — mass dominance near price (which side holds more liquidation fuel)
    if dom_up >= 0.58:
        s1, n1 = 1, f"Upside liquidity heavier ({dom_up*100:.0f}%) — pull up"
    elif dom_up <= 0.42:
        s1, n1 = -1, f"Downside liquidity heavier ({(1-dom_up)*100:.0f}%) — pull down"
    else:
        s1, n1 = 0, f"Balanced ({dom_up*100:.0f}% up) — range"
    metrics.append(MetricSignal(
        key="liq_dominance", raw_value=round(dom_up, 3),
        score=s1, label=f"{dom_up*100:.0f}% up", note=n1,
    ))

    # Metric 2 — nearest dominant magnet side (immediate pull)
    nu, nd = parsed["nearest_above"], parsed["nearest_below"]
    du = abs(nu["price"] - cur) / cur if nu else 1e9
    dd = abs(nd["price"] - cur) / cur if nd else 1e9
    if nu and nd:
        if du < 0.005 and dd < 0.005:
            s2, n2 = 0, "Sandwiched between magnets — range"
        elif du < dd * 0.7:
            s2, n2 = 1, f"Nearest magnet ${nu['price']:,.0f} above (+{du*100:.1f}%)"
        elif dd < du * 0.7:
            s2, n2 = -1, f"Nearest magnet ${nd['price']:,.0f} below (-{dd*100:.1f}%)"
        else:
            s2, n2 = 0, "Magnets roughly equidistant"
    elif nu:
        s2, n2 = 1, f"Magnet ${nu['price']:,.0f} above only"
    elif nd:
        s2, n2 = -1, f"Magnet ${nd['price']:,.0f} below only"
    else:
        s2, n2 = 0, "No clear magnet"
    metrics.append(MetricSignal(
        key="liq_nearest_magnet", raw_value={"above": nu, "below": nd},
        score=s2, label=n2[:40], note=n2,
    ))

    return _aggregate_layer("liquidity", metrics)
