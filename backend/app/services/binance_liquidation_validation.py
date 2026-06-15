"""Validation helpers for the Binance estimated liquidation map."""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.redis import get_redis

FORECAST_KEY = "lq:compass:liquidity:binance_estimated:active_forecast"
VALIDATION_KEY = "lq:compass:liquidity:binance_estimated:validation"
RECENT_EVENTS_KEY = "lq:compass:liquidity:binance_estimated:actual_events"
FORECAST_TTL_SECONDS = 8 * 60 * 60
RECENT_EVENTS_TTL_SECONDS = 7 * 24 * 60 * 60
MIN_VALIDATION_EVENTS = 20
MATCH_TOLERANCE_PCT = 0.0075
STATE_FILE = Path(
    os.getenv(
        "COMPASS_LIQUIDATION_VALIDATION_FILE",
        "/var/lib/luxquant/binance_liquidation_validation.json",
    )
)


def _safe_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def normalize_force_order_event(raw: Any) -> dict | None:
    """Normalize one Binance force-order WebSocket event."""
    if not isinstance(raw, dict):
        return None
    order = raw.get("o")
    if not isinstance(order, dict):
        return None
    symbol = str(order.get("s") or "")
    if symbol != "BTCUSDT":
        return None

    order_side = str(order.get("S") or "").upper()
    liquidation_side = (
        "long" if order_side == "SELL"
        else "short" if order_side == "BUY"
        else None
    )
    price = _safe_float(order.get("ap")) or _safe_float(order.get("p"))
    quantity = _safe_float(order.get("z")) or _safe_float(order.get("q"))
    if liquidation_side is None or price is None or quantity is None:
        return None
    if price <= 0 or quantity <= 0:
        return None

    timestamp = int(_safe_float(raw.get("E")) or time.time() * 1000)
    return {
        "symbol": symbol,
        "side": liquidation_side,
        "price": round(price, 2),
        "quantity": quantity,
        "notional": round(price * quantity, 2),
        "event_time": timestamp,
        "event_time_iso": datetime.fromtimestamp(
            timestamp / 1000,
            timezone.utc,
        ).isoformat(),
    }


def match_event_to_forecast(
    event: dict,
    forecast: dict | None,
    *,
    tolerance_pct: float = MATCH_TOLERANCE_PCT,
) -> dict:
    """Find the nearest same-side forecast level to an actual liquidation."""
    if not isinstance(forecast, dict):
        return {"matched": False, "reason": "missing_forecast"}
    levels = forecast.get("levels")
    if not isinstance(levels, list):
        return {"matched": False, "reason": "missing_levels"}

    price = _safe_float(event.get("price"))
    side = event.get("side")
    if price is None or side not in ("long", "short"):
        return {"matched": False, "reason": "invalid_event"}

    candidates = [
        level
        for level in levels
        if isinstance(level, dict)
        and level.get("side") == side
        and _safe_float(level.get("price")) is not None
    ]
    if not candidates:
        return {"matched": False, "reason": "no_same_side_levels"}

    nearest = min(
        candidates,
        key=lambda level: abs(float(level["price"]) - price),
    )
    distance_pct = abs(float(nearest["price"]) - price) / price
    return {
        "matched": distance_pct <= tolerance_pct,
        "reason": None if distance_pct <= tolerance_pct else "outside_tolerance",
        "nearest_level": nearest,
        "distance_pct": round(distance_pct, 6),
        "tolerance_pct": tolerance_pct,
    }


def save_forecast_snapshot(payload: dict) -> None:
    if not isinstance(payload, dict) or not payload.get("levels"):
        return
    get_redis().setex(
        FORECAST_KEY,
        FORECAST_TTL_SECONDS,
        json.dumps(payload, separators=(",", ":")),
    )


def _read_state_file() -> dict:
    try:
        value = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_state_file(stats: dict) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_FILE.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(stats, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(STATE_FILE)
    except OSError:
        pass


def _raw_validation_values() -> dict:
    try:
        values = get_redis().hgetall(VALIDATION_KEY)
    except Exception:
        values = {}
    if values:
        return values
    return _read_state_file()


def _restore_validation_state(redis_client: Any) -> None:
    if redis_client.exists(VALIDATION_KEY):
        return
    saved = _read_state_file()
    if not saved:
        return
    redis_client.hset(VALIDATION_KEY, mapping={
        "total_events": saved.get("total_events", 0),
        "matched_events": saved.get("matched_events", 0),
        "total_notional": saved.get("total_notional", 0),
        "matched_notional": saved.get("matched_notional", 0),
        "updated_at": saved.get("updated_at", ""),
    })


def load_validation_stats() -> dict:
    values = _raw_validation_values()
    total_events = int(float(values.get("total_events", 0)))
    matched_events = int(float(values.get("matched_events", 0)))
    total_notional = float(values.get("total_notional", 0))
    matched_notional = float(values.get("matched_notional", 0))
    event_hit_rate = matched_events / total_events if total_events else None
    notional_hit_rate = matched_notional / total_notional if total_notional else None
    return {
        "sample_size": total_events,
        "matched_events": matched_events,
        "event_hit_rate": round(event_hit_rate, 4) if event_hit_rate is not None else None,
        "notional_hit_rate": (
            round(notional_hit_rate, 4) if notional_hit_rate is not None else None
        ),
        "updated_at": values.get("updated_at"),
    }


def apply_validation_confidence(payload: dict) -> dict:
    """Keep confidence moderate until enough actual liquidation events exist."""
    from app.services.binance_liquidation_map import (
        UNVALIDATED_CONFIDENCE_CAP,
        VALIDATED_CONFIDENCE_CAP,
    )

    result = dict(payload)
    stats = load_validation_stats()
    data_confidence = float(
        result.get("data_confidence", result.get("model_confidence", 0.0))
    )
    sample_size = int(stats.get("sample_size") or 0)
    if sample_size >= MIN_VALIDATION_EVENTS:
        hit_rate = stats.get("notional_hit_rate")
        if hit_rate is None:
            hit_rate = stats.get("event_hit_rate")
        validation_score = float(hit_rate or 0.0)
        confidence = min(
            VALIDATED_CONFIDENCE_CAP,
            0.75 * data_confidence + 0.25 * validation_score,
        )
        validation_status = "validated_sample"
    else:
        confidence = min(UNVALIDATED_CONFIDENCE_CAP, data_confidence)
        validation_status = "collecting"

    result["model_confidence"] = round(max(0.0, confidence), 3)
    result["confidence_label"] = (
        "high" if confidence >= 0.72
        else "medium" if confidence >= 0.52
        else "low"
    )
    result["validation"] = {
        **stats,
        "status": validation_status,
        "minimum_sample": MIN_VALIDATION_EVENTS,
    }
    return result


def record_force_order_event(raw: Any) -> dict | None:
    """Persist an actual liquidation event and update forecast hit statistics."""
    event = normalize_force_order_event(raw)
    if event is None:
        return None

    redis_client = get_redis()
    _restore_validation_state(redis_client)
    forecast_raw = redis_client.get(FORECAST_KEY)
    try:
        forecast = json.loads(forecast_raw) if forecast_raw else None
    except (TypeError, json.JSONDecodeError):
        forecast = None
    match = match_event_to_forecast(event, forecast)
    record = {**event, "forecast_match": match}

    pipeline = redis_client.pipeline()
    pipeline.lpush(RECENT_EVENTS_KEY, json.dumps(record, separators=(",", ":")))
    pipeline.ltrim(RECENT_EVENTS_KEY, 0, 999)
    pipeline.expire(RECENT_EVENTS_KEY, RECENT_EVENTS_TTL_SECONDS)
    pipeline.hincrby(VALIDATION_KEY, "total_events", 1)
    pipeline.hincrbyfloat(VALIDATION_KEY, "total_notional", event["notional"])
    if match.get("matched"):
        pipeline.hincrby(VALIDATION_KEY, "matched_events", 1)
        pipeline.hincrbyfloat(
            VALIDATION_KEY,
            "matched_notional",
            event["notional"],
        )
    pipeline.hset(
        VALIDATION_KEY,
        "updated_at",
        datetime.now(timezone.utc).isoformat(),
    )
    pipeline.execute()
    persisted = redis_client.hgetall(VALIDATION_KEY)
    if persisted:
        _write_state_file(persisted)
    return record
