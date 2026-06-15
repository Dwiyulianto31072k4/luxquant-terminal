"""Deterministic 24h/72h evidence matrix for BTC Compass.

The matrix exposes how each data layer contributes to a horizon. It is an audit
surface only: it compares with the user-facing verdict but never overrides it.
"""

from __future__ import annotations

import time
from typing import Any, Iterable, Optional


HORIZONS = ("24h", "72h")
BG_GROUPS = {
    "cycle": (
        "mvrv-zscore", "puell-multiple", "mayer-multiple",
        "pi-cycle", "reserve-risk",
    ),
    "macro": ("m2global", "m2yoy-change", "ssr", "ssr-oscillator"),
    "derivatives": (
        "funding-rate", "btc-derivatives-basis-1h", "taker-vol-1h",
    ),
    "smart_money": (
        "top-trader-position-1h", "top-trader-account-1h",
    ),
    "onchain": (
        "nupl", "sopr", "sth-mvrv", "miner-net-flow",
        "exchange-netflow-btc", "hashribbons",
    ),
}
WEIGHTS = {
    "price_action": {"24h": 1.0, "72h": 0.8},
    "liquidity": {"24h": 1.0, "72h": 0.6},
    "derivatives": {"24h": 0.9, "72h": 0.7},
    "smart_money": {"24h": 0.8, "72h": 0.8},
    "macro": {"24h": 0.35, "72h": 0.8},
    "onchain": {"24h": 0.25, "72h": 0.65},
    "cycle_context": {"24h": 0.0, "72h": 0.0},
    "news_event_risk": {"24h": 0.0, "72h": 0.0},
}


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _direction_sign(direction: str) -> int:
    return {"bullish": 1, "bearish": -1}.get(str(direction).lower(), 0)


def _normalize_direction(value: Any) -> str:
    token = str(value or "neutral").strip().lower()
    return token if token in {"bullish", "bearish", "neutral"} else "neutral"


def _source_health(bg_summary: dict, keys: Iterable[str]) -> dict:
    metrics = [bg_summary.get(key) or {} for key in keys]
    available = [metric for metric in metrics if metric.get("ok")]
    if not available:
        return {
            "status": "unavailable",
            "available_count": 0,
            "total_count": len(metrics),
            "age_seconds": None,
        }
    status = "stale" if any(metric.get("is_stale") for metric in available) else "fresh"
    ages = [
        max(0.0, time.time() - float(metric["fetched_at"]))
        for metric in available
        if _safe_float(metric.get("fetched_at")) is not None
    ]
    return {
        "status": status,
        "available_count": len(available),
        "total_count": len(metrics),
        "age_seconds": round(max(ages), 1) if ages else None,
    }


def _horizon(
    direction: str,
    strength: float,
    weight: float,
    *,
    available: bool = True,
) -> dict:
    direction = _normalize_direction(direction) if available else "unavailable"
    safe_strength = max(0.0, min(1.0, float(strength or 0.0)))
    sign = _direction_sign(direction)
    return {
        "available": available,
        "direction": direction,
        "strength": round(safe_strength, 3),
        "weight": weight,
        "weighted_score": round(sign * safe_strength * weight, 4),
    }


def _layer_metrics(confluence: dict, layer_key: str) -> list[dict]:
    layer = ((confluence.get("layers") or {}).get(layer_key) or {})
    return list(layer.get("metrics") or [])


def _subset_signal(metrics: list[dict], keys: set[str]) -> dict:
    selected = [
        metric for metric in metrics
        if metric.get("key") in keys and metric.get("available", True)
    ]
    if not selected:
        return {
            "available": False,
            "direction": "unavailable",
            "strength": 0.0,
            "evidence": [],
            "rationale": "No eligible metric is available.",
        }
    scores = [int(metric.get("score") or 0) for metric in selected]
    average = sum(scores) / len(scores)
    direction = "bullish" if average > 0.33 else "bearish" if average < -0.33 else "neutral"
    evidence = [
        {
            "metric": metric.get("key"),
            "value": metric.get("label") or str(metric.get("raw_value") or "—"),
            "note": metric.get("note") or None,
        }
        for metric in selected[:4]
    ]
    return {
        "available": True,
        "direction": direction,
        "strength": abs(average),
        "evidence": evidence,
        "rationale": (
            f"{sum(score > 0 for score in scores)} bullish, "
            f"{sum(score < 0 for score in scores)} bearish, "
            f"{sum(score == 0 for score in scores)} neutral metrics."
        ),
    }


def _price_row(btc_price: float, price_context: dict) -> dict:
    change_24h = _safe_float(price_context.get("change_24h_pct"))
    change_72h = _safe_float(price_context.get("change_72h_pct"))
    change_7d = _safe_float(price_context.get("change_7d_pct"))
    swing_change = change_72h if change_72h is not None else change_7d
    high_24h = _safe_float(price_context.get("high_24h"))
    low_24h = _safe_float(price_context.get("low_24h"))

    def classify(change: float, threshold: float, scale: float) -> tuple[str, float]:
        direction = "bullish" if change > threshold else "bearish" if change < -threshold else "neutral"
        return direction, min(abs(change) / scale, 1.0)

    if change_24h is None:
        h24 = _horizon("neutral", 0.0, WEIGHTS["price_action"]["24h"], available=False)
    else:
        dir_24, strength_24 = classify(change_24h, 0.75, 3.0)
        h24 = _horizon(dir_24, strength_24, WEIGHTS["price_action"]["24h"])
    if swing_change is None:
        h72 = _horizon("neutral", 0.0, WEIGHTS["price_action"]["72h"], available=False)
    else:
        dir_72, strength_72 = classify(swing_change, 1.5, 6.0)
        h72 = _horizon(dir_72, strength_72, WEIGHTS["price_action"]["72h"])

    evidence = [{"metric": "BTC price", "value": f"${btc_price:,.0f}", "note": None}]
    if change_24h is not None:
        evidence.append({"metric": "24h change", "value": f"{change_24h:+.2f}%", "note": None})
    if change_72h is not None:
        evidence.append({"metric": "72h change", "value": f"{change_72h:+.2f}%", "note": None})
    elif change_7d is not None:
        evidence.append({
            "metric": "7d change",
            "value": f"{change_7d:+.2f}%",
            "note": "Fallback proxy when 72h change is unavailable",
        })
    if high_24h is not None and low_24h is not None:
        evidence.append({
            "metric": "24h range",
            "value": f"${low_24h:,.0f} – ${high_24h:,.0f}",
            "note": None,
        })
    return {
        "key": "price_action",
        "label": "Price action",
        "role": "directional_evidence",
        "source": "Bybit spot",
        "source_health": {"status": "fresh", "age_seconds": 0},
        "evidence": evidence,
        "rationale": "Observed price momentum and current 24-hour range.",
        "horizons": {
            "24h": h24,
            "72h": h72,
        },
    }


def _liquidity_row(liquidity: dict) -> dict:
    layer = liquidity.get("layer") or {}
    available = bool(liquidity.get("available") and layer)
    direction = _normalize_direction(layer.get("verdict"))
    strength = _safe_float(layer.get("strength")) or 0.0
    magnets = liquidity.get("magnets") or {}
    evidence = []
    dominance = _safe_float(magnets.get("dominance_up"))
    if dominance is not None:
        evidence.append({
            "metric": "Upside liquidity mass",
            "value": f"{dominance * 100:.0f}%",
            "note": None,
        })
    for label, key in (("Magnet above", "nearest_above"), ("Magnet below", "nearest_below")):
        magnet = magnets.get(key) or {}
        price = _safe_float(magnet.get("price"))
        if price is not None:
            evidence.append({"metric": label, "value": f"${price:,.0f}", "note": None})
    model_confidence = _safe_float(liquidity.get("model_confidence"))
    if model_confidence is not None:
        evidence.append({
            "metric": "Model confidence",
            "value": f"{model_confidence * 100:.0f}%",
            "note": "Estimated map",
        })
    status = liquidity.get("status") if available else "unavailable"
    return {
        "key": "liquidity",
        "label": "Liquidation liquidity",
        "role": "directional_evidence",
        "source": liquidity.get("provider") or "Binance estimated map",
        "source_health": {
            "status": status,
            "age_seconds": liquidity.get("age_seconds"),
        },
        "evidence": evidence,
        "rationale": layer.get("rationale") or liquidity.get("reason") or "Liquidity evidence unavailable.",
        "horizons": {
            horizon: _horizon(
                direction,
                strength,
                WEIGHTS["liquidity"][horizon],
                available=available,
            )
            for horizon in HORIZONS
        },
    }


def _confluence_row(
    *,
    key: str,
    label: str,
    source: str,
    signal: dict,
    health: dict,
) -> dict:
    available = bool(signal.get("available") and health.get("status") != "unavailable")
    return {
        "key": key,
        "label": label,
        "role": "directional_evidence",
        "source": source,
        "source_health": health,
        "evidence": signal.get("evidence") or [],
        "rationale": signal.get("rationale") or "No evidence available.",
        "horizons": {
            horizon: _horizon(
                signal.get("direction"),
                signal.get("strength"),
                WEIGHTS[key][horizon],
                available=available,
            )
            for horizon in HORIZONS
        },
    }


def _full_layer_signal(confluence: dict, layer_key: str) -> dict:
    layer = ((confluence.get("layers") or {}).get(layer_key) or {})
    metrics = [metric for metric in layer.get("metrics") or [] if metric.get("available", True)]
    return {
        "available": bool(metrics),
        "direction": _normalize_direction(layer.get("verdict")),
        "strength": _safe_float(layer.get("strength")) or 0.0,
        "evidence": [
            {
                "metric": metric.get("key"),
                "value": metric.get("label") or str(metric.get("raw_value") or "—"),
                "note": metric.get("note") or None,
            }
            for metric in metrics[:4]
        ],
        "rationale": layer.get("rationale") or "No layer rationale available.",
    }


def _context_rows(cycle: dict, event_risk: dict, bg_summary: dict) -> list[dict]:
    cycle_health = _source_health(bg_summary, BG_GROUPS["cycle"])
    cycle_evidence = [
        {"metric": "Cycle score", "value": f"{_safe_float(cycle.get('score')) or 0:.1f}/100", "note": None},
        {"metric": "Phase", "value": cycle.get("phase_label") or cycle.get("phase") or "—", "note": None},
        {"metric": "Confidence", "value": str(cycle.get("confidence") or "—"), "note": None},
    ]
    cycle_row = {
        "key": "cycle_context",
        "label": "Cycle context",
        "role": "context_only",
        "source": "BGeometrics cycle composite",
        "source_health": cycle_health,
        "evidence": cycle_evidence,
        "rationale": "Slow market-cycle backdrop; not a direct 24h or 72h direction.",
        "horizons": {
            horizon: _horizon("neutral", 0.0, 0.0, available=cycle_health["status"] != "unavailable")
            for horizon in HORIZONS
        },
    }

    risk_level = event_risk.get("risk_level") or "unavailable"
    risk_strength = {
        "low": 0.0,
        "elevated": 0.5,
        "high": 1.0,
        "unavailable": 0.0,
    }.get(risk_level, 0.0)
    source_health = event_risk.get("source_health") or {}
    statuses = [
        (source_health.get("news") or {}).get("status"),
        (source_health.get("calendar") or {}).get("status"),
    ]
    event_status = (
        "unavailable" if not any(status in {"fresh", "stale"} for status in statuses)
        else "stale" if "stale" in statuses
        else "fresh"
    )
    event_row = {
        "key": "news_event_risk",
        "label": "News and event risk",
        "role": "confidence_guardrail",
        "source": "RSS news + ForexFactory",
        "source_health": {"status": event_status, "age_seconds": None},
        "evidence": [
            {"metric": "Risk level", "value": risk_level, "note": None},
            {
                "metric": "Confidence penalty",
                "value": f"-{(event_risk.get('confidence_adjustment') or {}).get('penalty_points', 0)} pts",
                "note": "Cannot change direction",
            },
            {
                "metric": "72h high-impact events",
                "value": str(((event_risk.get("windows") or {}).get("next_72h") or {}).get("high_impact_count", 0)),
                "note": None,
            },
        ],
        "rationale": event_risk.get("summary") or "Event-risk context unavailable.",
        "horizons": {
            horizon: _horizon(
                "neutral",
                risk_strength,
                0.0,
                available=event_status != "unavailable",
            )
            for horizon in HORIZONS
        },
    }
    return [cycle_row, event_row]


def _attach_changes(rows: list[dict], previous_matrix: Optional[dict]) -> int:
    previous_rows = {
        row.get("key"): row
        for row in (previous_matrix or {}).get("rows") or []
    }
    changed_rows = 0
    for row in rows:
        previous = previous_rows.get(row["key"])
        row_changes = {}
        row_changed = False
        for horizon in HORIZONS:
            current_h = row["horizons"][horizon]
            previous_h = ((previous or {}).get("horizons") or {}).get(horizon) or {}
            direction_from = previous_h.get("direction")
            strength_from = _safe_float(previous_h.get("strength"))
            strength_delta = (
                round(current_h["strength"] - strength_from, 3)
                if strength_from is not None
                else None
            )
            changed = bool(
                previous
                and (
                    direction_from != current_h["direction"]
                    or (strength_delta is not None and abs(strength_delta) >= 0.1)
                )
            )
            row_changes[horizon] = {
                "changed": changed,
                "direction_from": direction_from,
                "strength_delta": strength_delta,
            }
            row_changed = row_changed or changed
        current_status = (row.get("source_health") or {}).get("status")
        previous_status = ((previous or {}).get("source_health") or {}).get("status")
        if previous and current_status != previous_status:
            row_changed = True
        row["changes"] = {
            "changed": row_changed,
            "source_status_from": previous_status,
            "horizons": row_changes,
        }
        changed_rows += int(row_changed)
    return changed_rows


def _summarize_horizon(rows: list[dict], horizon: str, verdict_direction: str) -> dict:
    weighted_sum = 0.0
    eligible_weight = 0.0
    configured_weight = sum(weights[horizon] for weights in WEIGHTS.values())
    directional = []
    unavailable = 0
    stale = 0
    for row in rows:
        item = row["horizons"][horizon]
        status = (row.get("source_health") or {}).get("status")
        unavailable += int(status == "unavailable" or not item["available"])
        stale += int(status == "stale")
        if item["available"] and item["weight"] > 0:
            eligible_weight += item["weight"]
            weighted_sum += item["weighted_score"]
            if item["direction"] in {"bullish", "bearish"} and item["strength"] >= 0.2:
                directional.append(row)

    score = weighted_sum / eligible_weight if eligible_weight else 0.0
    bias = "bullish" if score > 0.15 else "bearish" if score < -0.15 else "neutral"
    directional_sides = {
        row["horizons"][horizon]["direction"] for row in directional
    }
    if bias in {"bullish", "bearish"}:
        conflict_rows = [
            row for row in directional
            if row["horizons"][horizon]["direction"] != bias
        ]
    elif {"bullish", "bearish"}.issubset(directional_sides):
        conflict_rows = directional
    else:
        conflict_rows = []
    conflicts = [{
        "key": row["key"],
        "label": row["label"],
        "direction": row["horizons"][horizon]["direction"],
        "strength": row["horizons"][horizon]["strength"],
    } for row in conflict_rows]
    verdict_direction = _normalize_direction(verdict_direction)
    comparison = (
        "neutral_evidence"
        if bias == "neutral"
        else "aligned"
        if verdict_direction == bias
        else "conflict"
    )
    return {
        "bias": bias,
        "score": round(score, 3),
        "coverage": round(eligible_weight / configured_weight, 3) if configured_weight else 0.0,
        "eligible_weight": round(eligible_weight, 2),
        "configured_weight": round(configured_weight, 2),
        "conflict_count": len(conflicts),
        "conflicts": conflicts,
        "unavailable_rows": unavailable,
        "stale_rows": stale,
        "verdict_direction": verdict_direction,
        "verdict_comparison": comparison,
    }


def build_evidence_matrix(
    *,
    btc_price: float,
    price_context: dict,
    confluence: dict,
    cycle: dict,
    liquidity: Optional[dict],
    event_risk: Optional[dict],
    bg_summary: dict,
    verdict: Any,
    previous_matrix: Optional[dict] = None,
) -> dict:
    """Build the complete evidence matrix from report-cycle inputs."""
    smart_layer = _layer_metrics(confluence, "smart_money")
    rows = [
        _price_row(btc_price, price_context),
        _liquidity_row(liquidity or {}),
        _confluence_row(
            key="derivatives",
            label="Derivatives",
            source="BGeometrics derivatives",
            signal=_subset_signal(
                smart_layer,
                {"funding_rate", "basis", "taker_volume"},
            ),
            health=_source_health(bg_summary, BG_GROUPS["derivatives"]),
        ),
        _confluence_row(
            key="smart_money",
            label="Smart money positioning",
            source="BGeometrics top traders",
            signal=_subset_signal(
                smart_layer,
                {
                    "top_trader_position", "top_trader_account",
                    "etf_flow", "coinbase_premium",
                },
            ),
            health=_source_health(bg_summary, BG_GROUPS["smart_money"]),
        ),
        _confluence_row(
            key="macro",
            label="Macro liquidity",
            source="BGeometrics macro",
            signal=_full_layer_signal(confluence, "macro_liquidity"),
            health=_source_health(bg_summary, BG_GROUPS["macro"]),
        ),
        _confluence_row(
            key="onchain",
            label="On-chain behavior",
            source="BGeometrics on-chain",
            signal=_full_layer_signal(confluence, "onchain"),
            health=_source_health(bg_summary, BG_GROUPS["onchain"]),
        ),
        *_context_rows(cycle, event_risk or {}, bg_summary),
    ]
    changed_rows = _attach_changes(rows, previous_matrix)

    verdict_24h = getattr(getattr(verdict, "tactical_24h", None), "direction", "neutral")
    verdict_72h = getattr(getattr(verdict, "secondary_7d", None), "direction", "neutral")
    return {
        "phase": 4,
        "version": "evidence_matrix.v1",
        "purpose": "transparent_evidence_audit",
        "decision_authority": False,
        "horizons": {
            "24h": _summarize_horizon(rows, "24h", verdict_24h),
            "72h": _summarize_horizon(rows, "72h", verdict_72h),
        },
        "rows": rows,
        "changes": {
            "has_previous": previous_matrix is not None,
            "changed_rows": changed_rows,
        },
    }


__all__ = ["build_evidence_matrix"]
