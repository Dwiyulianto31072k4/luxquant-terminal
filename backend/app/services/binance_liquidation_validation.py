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
STREAM_HEARTBEAT_KEY = "lq:compass:liquidity:binance_estimated:stream_heartbeat"
FORECAST_TTL_SECONDS = 8 * 60 * 60
RECENT_EVENTS_TTL_SECONDS = 7 * 24 * 60 * 60
STREAM_HEARTBEAT_TTL_SECONDS = 90
MIN_VALIDATION_EVENTS = 20
ROBUST_VALIDATION_EVENTS = 100
MATCH_TOLERANCE_PCT = 0.0075
STATE_FILE = Path(
    os.getenv(
        "COMPASS_LIQUIDATION_VALIDATION_FILE",
        "/var/lib/luxquant/binance_liquidation_validation.json",
    )
)
EVENTS_FILE = Path(
    os.getenv(
        "COMPASS_LIQUIDATION_EVENTS_FILE",
        "/var/lib/luxquant/binance_liquidation_events.jsonl",
    )
)
MAX_PERSISTED_EVENTS = 5_000


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


def save_stream_heartbeat(
    status: str,
    *,
    connected_at: str | None = None,
    error: str | None = None,
) -> dict:
    """Publish collector liveness without depending on systemd access."""
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": status,
        "updated_at": now_iso,
        "connected_at": connected_at,
        "error": error,
    }
    get_redis().setex(
        STREAM_HEARTBEAT_KEY,
        STREAM_HEARTBEAT_TTL_SECONDS,
        json.dumps(payload, separators=(",", ":")),
    )
    return payload


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


def _append_event_file(record: dict) -> None:
    try:
        EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with EVENTS_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")

        if EVENTS_FILE.stat().st_size > 10 * 1024 * 1024:
            lines = EVENTS_FILE.read_text(encoding="utf-8").splitlines()
            temporary = EVENTS_FILE.with_suffix(".tmp")
            temporary.write_text(
                "\n".join(lines[-MAX_PERSISTED_EVENTS:]) + "\n",
                encoding="utf-8",
            )
            temporary.replace(EVENTS_FILE)
    except OSError:
        pass


def _read_event_file(limit: int) -> list[dict]:
    try:
        lines = EVENTS_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []

    events = []
    for line in reversed(lines[-MAX_PERSISTED_EVENTS:]):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            events.append(value)
        if len(events) >= limit:
            break
    return events


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


def _parse_iso_epoch(value: Any) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def summarize_validation_monitor(
    *,
    forecast: dict | None,
    forecast_ttl_seconds: int,
    stats: dict,
    events: list[dict],
    heartbeat: dict | None,
    heartbeat_ttl_seconds: int,
    now_epoch: float | None = None,
) -> dict:
    """Build the Phase 2 monitoring contract from already-loaded state."""
    now_epoch = now_epoch if now_epoch is not None else time.time()
    forecast = forecast if isinstance(forecast, dict) else {}
    heartbeat = heartbeat if isinstance(heartbeat, dict) else {}

    generated_epoch = _parse_iso_epoch(forecast.get("generated_at"))
    forecast_age_seconds = (
        max(0.0, now_epoch - generated_epoch)
        if generated_epoch is not None
        else None
    )
    heartbeat_epoch = _parse_iso_epoch(heartbeat.get("updated_at"))
    heartbeat_age_seconds = (
        max(0.0, now_epoch - heartbeat_epoch)
        if heartbeat_epoch is not None
        else None
    )

    collector_healthy = (
        heartbeat.get("status") == "connected"
        and heartbeat_ttl_seconds > 0
        and heartbeat_age_seconds is not None
        and heartbeat_age_seconds <= STREAM_HEARTBEAT_TTL_SECONDS
    )
    forecast_fresh = (
        bool(forecast.get("levels"))
        and forecast_ttl_seconds > 0
        and forecast_age_seconds is not None
        and forecast_age_seconds <= FORECAST_TTL_SECONDS
    )

    sample_size = int(stats.get("sample_size") or 0)
    matched_events = int(stats.get("matched_events") or 0)
    missed_events = max(0, sample_size - matched_events)
    if sample_size < MIN_VALIDATION_EVENTS:
        stage = "collecting"
    elif sample_size < ROBUST_VALIDATION_EVENTS:
        stage = "calibration_ready"
    else:
        stage = "evaluation_ready"

    side_counts = {"long": 0, "short": 0}
    recent_matched = 0
    recent_notional = 0.0
    distances: list[float] = []
    normalized_events = []
    for event in events:
        if not isinstance(event, dict):
            continue
        side = event.get("side")
        if side in side_counts:
            side_counts[side] += 1
        notional = _safe_float(event.get("notional")) or 0.0
        recent_notional += notional
        match = event.get("forecast_match") or {}
        if match.get("matched"):
            recent_matched += 1
        distance = _safe_float(match.get("distance_pct"))
        if distance is not None:
            distances.append(distance)
        normalized_events.append({
            "event_time_iso": event.get("event_time_iso"),
            "side": side,
            "price": _safe_float(event.get("price")),
            "notional": notional,
            "matched": bool(match.get("matched")),
            "match_reason": match.get("reason"),
            "distance_pct": distance,
            "nearest_level": match.get("nearest_level"),
        })

    model_confidence = _safe_float(forecast.get("model_confidence"))
    data_confidence = _safe_float(forecast.get("data_confidence"))
    initial_progress = min(1.0, sample_size / MIN_VALIDATION_EVENTS)
    robust_progress = min(1.0, sample_size / ROBUST_VALIDATION_EVENTS)
    gates = [
        {
            "key": "collector",
            "label": "Collector heartbeat",
            "passed": collector_healthy,
            "detail": (
                "Binance liquidation stream is connected."
                if collector_healthy
                else "Collector heartbeat is missing or stale."
            ),
        },
        {
            "key": "forecast",
            "label": "Fresh forecast",
            "passed": forecast_fresh,
            "detail": (
                "An active estimated map is available."
                if forecast_fresh
                else "No usable forecast is active."
            ),
        },
        {
            "key": "initial_sample",
            "label": f"Initial sample ({MIN_VALIDATION_EVENTS})",
            "passed": sample_size >= MIN_VALIDATION_EVENTS,
            "detail": f"{sample_size}/{MIN_VALIDATION_EVENTS} actual liquidation events.",
        },
        {
            "key": "robust_sample",
            "label": f"Robust sample ({ROBUST_VALIDATION_EVENTS})",
            "passed": sample_size >= ROBUST_VALIDATION_EVENTS,
            "detail": f"{sample_size}/{ROBUST_VALIDATION_EVENTS} events for stable evaluation.",
        },
    ]

    return {
        "phase": 2,
        "mode": "shadow_validation",
        "stage": stage,
        "activation_allowed": False,
        "activation_note": (
            "Phase 2 is observation-only. Deterministic verdict activation "
            "requires a separate baseline and stability review."
        ),
        "collector": {
            "healthy": collector_healthy,
            "status": heartbeat.get("status") or "unknown",
            "updated_at": heartbeat.get("updated_at"),
            "connected_at": heartbeat.get("connected_at"),
            "age_seconds": (
                round(heartbeat_age_seconds, 3)
                if heartbeat_age_seconds is not None
                else None
            ),
            "error": heartbeat.get("error"),
        },
        "forecast": {
            "available": bool(forecast),
            "fresh": forecast_fresh,
            "provider": forecast.get("provider"),
            "generated_at": forecast.get("generated_at"),
            "age_seconds": (
                round(forecast_age_seconds, 3)
                if forecast_age_seconds is not None
                else None
            ),
            "ttl_seconds": max(0, forecast_ttl_seconds),
            "current_price": _safe_float(forecast.get("current_price")),
            "level_count": len(forecast.get("levels") or []),
            "model_confidence": model_confidence,
            "data_confidence": data_confidence,
            "confidence_label": forecast.get("confidence_label"),
            "data_quality": forecast.get("data_quality") or {},
        },
        "validation": {
            **stats,
            "missed_events": missed_events,
            "minimum_sample": MIN_VALIDATION_EVENTS,
            "robust_sample": ROBUST_VALIDATION_EVENTS,
            "initial_progress": round(initial_progress, 4),
            "robust_progress": round(robust_progress, 4),
            "match_tolerance_pct": MATCH_TOLERANCE_PCT,
        },
        "recent_window": {
            "count": len(normalized_events),
            "matched": recent_matched,
            "long_events": side_counts["long"],
            "short_events": side_counts["short"],
            "notional_usd": round(recent_notional, 2),
            "average_distance_pct": (
                round(sum(distances) / len(distances), 6)
                if distances
                else None
            ),
        },
        "gates": gates,
        "recent_events": normalized_events,
    }


def get_validation_monitor(limit: int = 25) -> dict:
    """Load Phase 2 monitoring data from Redis and persistent counters."""
    redis_client = get_redis()

    def _decode(raw: Any) -> Any:
        try:
            return json.loads(raw) if raw else None
        except (TypeError, json.JSONDecodeError):
            return None

    forecast = _decode(redis_client.get(FORECAST_KEY))
    heartbeat = _decode(redis_client.get(STREAM_HEARTBEAT_KEY))
    raw_events = redis_client.lrange(RECENT_EVENTS_KEY, 0, max(0, limit - 1))
    redis_events = [value for value in (_decode(raw) for raw in raw_events) if value]
    file_events = _read_event_file(limit)
    events = []
    seen = set()
    for event in [*redis_events, *file_events]:
        identity = (
            event.get("event_time"),
            event.get("side"),
            event.get("price"),
            event.get("quantity"),
        )
        if identity in seen:
            continue
        seen.add(identity)
        events.append(event)
        if len(events) >= limit:
            break
    return summarize_validation_monitor(
        forecast=forecast,
        forecast_ttl_seconds=redis_client.ttl(FORECAST_KEY),
        stats=load_validation_stats(),
        events=events,
        heartbeat=heartbeat,
        heartbeat_ttl_seconds=redis_client.ttl(STREAM_HEARTBEAT_KEY),
    )


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
    _append_event_file(record)
    return record
