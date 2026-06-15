"""
Estimated BTC liquidation map built from Binance public futures data.

This is deliberately labelled as an estimate. Binance does not expose every
trader's entry price and leverage, so the model reconstructs likely liquidation
clusters from changes in open interest, price, taker flow, and top-trader
positioning.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

import httpx

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

FAPI_BASE = "https://fapi.binance.com"
FUTURES_DATA_BASE = f"{FAPI_BASE}/futures/data"
PROVIDER = "binance_estimated_liquidation_v1"
SCHEMA = "estimated_liquidation_map.v1"
UNVALIDATED_CONFIDENCE_CAP = 0.68
VALIDATED_CONFIDENCE_CAP = 0.82

LAST_GOOD_CACHE_KEY = "lq:compass:liquidity:binance_estimated:last_good"
LAST_GOOD_CACHE_TTL_SECONDS = 24 * 60 * 60
DEFAULT_STALE_MAX_AGE_SECONDS = 8 * 60 * 60

LEVERAGE_WEIGHTS = {
    5: 0.05,
    10: 0.14,
    20: 0.24,
    25: 0.20,
    50: 0.22,
    100: 0.15,
}
MAINTENANCE_MARGIN_RATE = 0.004
POSITION_HALF_LIFE_HOURS = 12.0
BUCKET_PCT = 0.0025

LiquidityStatus = Literal["fresh", "stale", "unavailable"]


def _iso_utc(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).isoformat()


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _lookback_points(lookback: str, period_minutes: int = 5) -> int:
    normalized = (lookback or "12h").strip().lower()
    try:
        if normalized.endswith("h"):
            minutes = float(normalized[:-1]) * 60
        elif normalized.endswith("d"):
            minutes = float(normalized[:-1]) * 24 * 60
        else:
            minutes = 12 * 60
    except ValueError:
        minutes = 12 * 60
    return max(24, min(499, int(minutes / period_minutes)))


def _bucket_timestamp(timestamp: Any, period_ms: int) -> int | None:
    value = _safe_float(timestamp)
    if value is None:
        return None
    return int(value) // period_ms * period_ms


def _index_rows(
    rows: list,
    *,
    timestamp_key: str | None,
    timestamp_index: int | None,
    period_ms: int,
) -> dict[int, Any]:
    indexed: dict[int, Any] = {}
    for row in rows:
        raw_timestamp = None
        if timestamp_key is not None and isinstance(row, dict):
            raw_timestamp = row.get(timestamp_key)
        elif timestamp_index is not None and isinstance(row, (list, tuple)):
            if len(row) > timestamp_index:
                raw_timestamp = row[timestamp_index]
        bucket = _bucket_timestamp(raw_timestamp, period_ms)
        if bucket is not None:
            indexed[bucket] = row
    return indexed


def _round_price(price: float, bucket_size: float) -> float:
    return round(round(price / bucket_size) * bucket_size, 2)


def _scale_clusters(clusters: dict[tuple[float, str], float], factor: float) -> None:
    for key in list(clusters):
        value = clusters[key] * factor
        if value < 1.0:
            del clusters[key]
        else:
            clusters[key] = value


def _remove_crossed_clusters(
    clusters: dict[tuple[float, str], float],
    *,
    high: float,
    low: float,
) -> None:
    for price, side in list(clusters):
        if side == "long" and low <= price:
            del clusters[(price, side)]
        elif side == "short" and high >= price:
            del clusters[(price, side)]


def _flow_side_probability(
    *,
    price_return: float,
    taker_ratio: float | None,
    top_ratio: float | None,
    previous_top_ratio: float | None,
) -> tuple[float, float]:
    price_score = _clamp(price_return / 0.003, -1.0, 1.0)
    taker_score = 0.0
    if taker_ratio is not None and taker_ratio > 0:
        taker_score = _clamp(math.log(taker_ratio) / 0.35, -1.0, 1.0)

    top_score = 0.0
    if top_ratio is not None and previous_top_ratio not in (None, 0):
        top_score = _clamp(
            (top_ratio - float(previous_top_ratio)) / 0.08,
            -1.0,
            1.0,
        )

    directional_score = (
        0.45 * price_score
        + 0.35 * taker_score
        + 0.20 * top_score
    )
    long_probability = _clamp(0.5 + 0.35 * directional_score, 0.15, 0.85)
    return long_probability, abs(directional_score)


def estimate_liquidation_map(
    *,
    symbol: str,
    oi_rows: list[dict],
    kline_rows: list[list],
    taker_rows: list[dict] | None = None,
    top_position_rows: list[dict] | None = None,
    current_price: float | None = None,
    period_minutes: int = 5,
) -> dict | None:
    """Build a normalized estimated liquidation map from aligned market rows."""
    if len(oi_rows) < 3 or len(kline_rows) < 3:
        return None

    period_ms = period_minutes * 60 * 1000
    klines = _index_rows(
        kline_rows,
        timestamp_key=None,
        timestamp_index=0,
        period_ms=period_ms,
    )
    takers = _index_rows(
        taker_rows or [],
        timestamp_key="timestamp",
        timestamp_index=None,
        period_ms=period_ms,
    )
    top_positions = _index_rows(
        top_position_rows or [],
        timestamp_key="timestamp",
        timestamp_index=None,
        period_ms=period_ms,
    )

    sorted_oi = sorted(
        (
            row
            for row in oi_rows
            if _bucket_timestamp(row.get("timestamp"), period_ms) is not None
        ),
        key=lambda row: int(row["timestamp"]),
    )
    if len(sorted_oi) < 3:
        return None

    latest_kline = max(klines.values(), key=lambda row: int(row[0]), default=None)
    inferred_price = _safe_float(latest_kline[4]) if latest_kline else None
    model_price = _safe_float(current_price, inferred_price)
    if model_price is None or model_price <= 0:
        return None

    bucket_size = max(25.0, round(model_price * BUCKET_PCT / 25.0) * 25.0)
    clusters: dict[tuple[float, str], float] = {}
    positive_events = 0
    aligned_rows = 0
    directional_certainty: list[float] = []
    previous_top_ratio: float | None = None
    previous_close: float | None = None

    decay_per_step = math.exp(
        -math.log(2) * period_minutes / (POSITION_HALF_LIFE_HOURS * 60)
    )

    for index in range(1, len(sorted_oi)):
        previous_oi = sorted_oi[index - 1]
        oi_row = sorted_oi[index]
        timestamp = _bucket_timestamp(oi_row.get("timestamp"), period_ms)
        if timestamp is None:
            continue
        kline = klines.get(timestamp)
        if not kline or len(kline) < 5:
            continue

        open_price = _safe_float(kline[1])
        high = _safe_float(kline[2])
        low = _safe_float(kline[3])
        close = _safe_float(kline[4])
        if None in (open_price, high, low, close) or close <= 0:
            continue

        aligned_rows += 1
        _scale_clusters(clusters, decay_per_step)
        _remove_crossed_clusters(clusters, high=float(high), low=float(low))

        previous_contracts = _safe_float(previous_oi.get("sumOpenInterest"))
        current_contracts = _safe_float(oi_row.get("sumOpenInterest"))
        if previous_contracts is None or current_contracts is None:
            continue
        delta_contracts = current_contracts - previous_contracts
        delta_notional = abs(delta_contracts) * float(close)

        if delta_contracts <= 0:
            active_notional = sum(clusters.values())
            if active_notional > 0 and delta_notional > 0:
                close_fraction = _clamp(delta_notional / active_notional, 0.0, 1.0)
                _scale_clusters(clusters, 1.0 - close_fraction)
            previous_close = float(close)
            top_row = top_positions.get(timestamp)
            previous_top_ratio = _safe_float(
                top_row.get("longShortRatio") if top_row else None,
                previous_top_ratio,
            )
            continue

        positive_events += 1
        price_base = previous_close or float(open_price)
        price_return = (float(close) - price_base) / price_base if price_base else 0.0
        taker_row = takers.get(timestamp)
        top_row = top_positions.get(timestamp)
        taker_ratio = _safe_float(
            taker_row.get("buySellRatio") if taker_row else None
        )
        top_ratio = _safe_float(
            top_row.get("longShortRatio") if top_row else None
        )
        long_probability, certainty = _flow_side_probability(
            price_return=price_return,
            taker_ratio=taker_ratio,
            top_ratio=top_ratio,
            previous_top_ratio=previous_top_ratio,
        )
        directional_certainty.append(certainty)

        for leverage, leverage_weight in LEVERAGE_WEIGHTS.items():
            long_notional = delta_notional * long_probability * leverage_weight
            short_notional = delta_notional * (1.0 - long_probability) * leverage_weight
            long_liquidation = float(close) * (
                1.0 - 1.0 / leverage + MAINTENANCE_MARGIN_RATE
            )
            short_liquidation = float(close) * (
                1.0 + 1.0 / leverage - MAINTENANCE_MARGIN_RATE
            )
            long_bucket = _round_price(long_liquidation, bucket_size)
            short_bucket = _round_price(short_liquidation, bucket_size)
            clusters[(long_bucket, "long")] = (
                clusters.get((long_bucket, "long"), 0.0) + long_notional
            )
            clusters[(short_bucket, "short")] = (
                clusters.get((short_bucket, "short"), 0.0) + short_notional
            )

        previous_close = float(close)
        if top_ratio is not None:
            previous_top_ratio = top_ratio

    if not clusters:
        return None

    levels = [
        {
            "price": price,
            "value": round(value, 2),
            "side": side,
        }
        for (price, side), value in clusters.items()
        if value >= 10_000
    ]
    if not levels:
        return None
    levels.sort(key=lambda item: item["price"])

    expected_rows = max(1, len(sorted_oi) - 1)
    coverage = _clamp(aligned_rows / expected_rows, 0.0, 1.0)
    event_score = _clamp(positive_events / 12.0, 0.0, 1.0)
    certainty_score = (
        sum(directional_certainty) / len(directional_certainty)
        if directional_certainty
        else 0.0
    )
    optional_coverage = (
        (1.0 if takers else 0.0) + (1.0 if top_positions else 0.0)
    ) / 2.0
    data_confidence = _clamp(
        0.25
        + 0.25 * coverage
        + 0.20 * event_score
        + 0.15 * certainty_score
        + 0.15 * optional_coverage,
        0.0,
        1.0,
    )
    confidence = min(data_confidence, UNVALIDATED_CONFIDENCE_CAP)
    confidence_label = (
        "high" if confidence >= 0.72 else "medium" if confidence >= 0.52 else "low"
    )

    return {
        "schema": SCHEMA,
        "provider": PROVIDER,
        "symbol": symbol,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "current_price": round(model_price, 2),
        "bucket_size": bucket_size,
        "levels": levels,
        "model_confidence": round(confidence, 3),
        "data_confidence": round(data_confidence, 3),
        "confidence_label": confidence_label,
        "model": {
            "label": "estimated_not_exchange_reported",
            "maintenance_margin_rate": MAINTENANCE_MARGIN_RATE,
            "position_half_life_hours": POSITION_HALF_LIFE_HOURS,
            "leverage_weights": LEVERAGE_WEIGHTS,
            "unvalidated_confidence_cap": UNVALIDATED_CONFIDENCE_CAP,
            "validated_confidence_cap": VALIDATED_CONFIDENCE_CAP,
        },
        "data_quality": {
            "oi_rows": len(sorted_oi),
            "aligned_rows": aligned_rows,
            "positive_oi_events": positive_events,
            "taker_rows": len(takers),
            "top_position_rows": len(top_positions),
            "coverage": round(coverage, 3),
            "directional_certainty": round(certainty_score, 3),
        },
    }


@dataclass(frozen=True)
class EstimatedHeatmapFetchResult:
    status: LiquidityStatus
    payload: dict | None
    reason: str | None
    checked_at: str
    fetched_at: str | None = None
    age_seconds: float | None = None
    attempts: int = 0
    provider: str = PROVIDER

    @property
    def available(self) -> bool:
        return self.status in ("fresh", "stale") and self.payload is not None

    def metadata(self) -> dict:
        confidence = (
            self.payload.get("model_confidence")
            if isinstance(self.payload, dict)
            else None
        )
        return {
            "provider": self.provider,
            "status": self.status,
            "available": self.available,
            "is_stale": self.status == "stale",
            "reason": self.reason,
            "checked_at": self.checked_at,
            "fetched_at": self.fetched_at,
            "age_seconds": self.age_seconds,
            "attempts": self.attempts,
            "model_confidence": confidence,
            "data_kind": "estimated_liquidation_map",
        }


def _save_last_good(payload: dict, fetched_epoch: float) -> None:
    try:
        value = json.dumps(
            {"fetched_epoch": fetched_epoch, "payload": payload},
            separators=(",", ":"),
        )
        get_redis().setex(LAST_GOOD_CACHE_KEY, LAST_GOOD_CACHE_TTL_SECONDS, value)
    except Exception as exc:
        logger.warning(
            "binance liquidation map: could not cache last-good payload (%s)",
            type(exc).__name__,
        )


def _load_last_good(
    now_epoch: float,
    max_age_seconds: float,
) -> tuple[dict, float, str] | None:
    try:
        cached = get_redis().get(LAST_GOOD_CACHE_KEY)
        if not cached:
            return None
        value = json.loads(cached)
        fetched_epoch = float(value["fetched_epoch"])
        payload = value["payload"]
        age_seconds = max(0.0, now_epoch - fetched_epoch)
        if age_seconds > max_age_seconds:
            return None
        if not isinstance(payload, dict) or payload.get("schema") != SCHEMA:
            return None
        if not payload.get("levels"):
            return None
        return payload, age_seconds, _iso_utc(fetched_epoch)
    except Exception as exc:
        logger.warning(
            "binance liquidation map: could not read last-good payload (%s)",
            type(exc).__name__,
        )
        return None


def _fallback_result(
    *,
    reason: str,
    checked_epoch: float,
    attempts: int,
    stale_max_age_s: float,
) -> EstimatedHeatmapFetchResult:
    cached = _load_last_good(checked_epoch, stale_max_age_s)
    if cached is not None:
        payload, age_seconds, fetched_at = cached
        return EstimatedHeatmapFetchResult(
            status="stale",
            payload=payload,
            reason=reason,
            checked_at=_iso_utc(checked_epoch),
            fetched_at=fetched_at,
            age_seconds=round(age_seconds, 3),
            attempts=attempts,
        )
    return EstimatedHeatmapFetchResult(
        status="unavailable",
        payload=None,
        reason=reason,
        checked_at=_iso_utc(checked_epoch),
        attempts=attempts,
    )


async def _get_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
) -> Any:
    response = await client.get(url, params=params)
    response.raise_for_status()
    return response.json()


async def fetch_binance_estimated_heatmap(
    symbol: str = "BTCUSDT",
    lookback: str = "12h",
    *,
    current_price: float | None = None,
    timeout_s: float = 20.0,
    max_attempts: int = 2,
    stale_max_age_s: float = DEFAULT_STALE_MAX_AGE_SECONDS,
) -> EstimatedHeatmapFetchResult:
    """Fetch public Binance inputs and return a fresh, stale, or unavailable map."""
    checked_epoch = time.time()
    points = _lookback_points(lookback)
    limit = min(500, points + 1)
    attempts = max(1, max_attempts)
    last_reason = "unknown_error"
    attempt_count = 0

    requests = (
        (
            f"{FUTURES_DATA_BASE}/openInterestHist",
            {"symbol": symbol, "period": "5m", "limit": limit},
        ),
        (
            f"{FAPI_BASE}/fapi/v1/klines",
            {"symbol": symbol, "interval": "5m", "limit": limit},
        ),
        (
            f"{FUTURES_DATA_BASE}/takerlongshortRatio",
            {"symbol": symbol, "period": "5m", "limit": limit},
        ),
        (
            f"{FUTURES_DATA_BASE}/topLongShortPositionRatio",
            {"symbol": symbol, "period": "5m", "limit": limit},
        ),
    )

    for attempt in range(1, attempts + 1):
        attempt_count = attempt
        try:
            async with httpx.AsyncClient(
                timeout=timeout_s,
                headers={"User-Agent": "LuxQuant/2.0", "Accept": "application/json"},
            ) as client:
                results = await asyncio.gather(
                    *(_get_json(client, url, params) for url, params in requests),
                    return_exceptions=True,
                )

            oi_rows, kline_rows, taker_rows, top_rows = results
            if isinstance(oi_rows, Exception):
                raise oi_rows
            if isinstance(kline_rows, Exception):
                raise kline_rows
            taker_rows = [] if isinstance(taker_rows, Exception) else taker_rows
            top_rows = [] if isinstance(top_rows, Exception) else top_rows
            if not isinstance(oi_rows, list) or not isinstance(kline_rows, list):
                last_reason = "invalid_required_payload"
                break

            payload = estimate_liquidation_map(
                symbol=symbol,
                oi_rows=oi_rows,
                kline_rows=kline_rows,
                taker_rows=taker_rows if isinstance(taker_rows, list) else [],
                top_position_rows=top_rows if isinstance(top_rows, list) else [],
                current_price=current_price,
            )
            if payload is None:
                last_reason = "insufficient_model_data"
                break

            try:
                from app.services.binance_liquidation_validation import (
                    apply_validation_confidence,
                    save_forecast_snapshot,
                )
                payload = apply_validation_confidence(payload)
                save_forecast_snapshot(payload)
            except Exception as exc:
                logger.warning(
                    "binance liquidation map: validation metadata unavailable (%s)",
                    type(exc).__name__,
                )

            fetched_epoch = time.time()
            _save_last_good(payload, fetched_epoch)
            return EstimatedHeatmapFetchResult(
                status="fresh",
                payload=payload,
                reason=None,
                checked_at=_iso_utc(checked_epoch),
                fetched_at=_iso_utc(fetched_epoch),
                age_seconds=0.0,
                attempts=attempt,
            )
        except httpx.TimeoutException:
            last_reason = "binance_timeout"
        except httpx.HTTPStatusError as exc:
            last_reason = f"binance_http_{exc.response.status_code}"
            if exc.response.status_code < 500:
                break
        except httpx.HTTPError as exc:
            last_reason = f"binance_transport_{type(exc).__name__}"
        except Exception as exc:
            last_reason = f"binance_unexpected_{type(exc).__name__}"

        if attempt < attempts:
            await asyncio.sleep(min(2 ** (attempt - 1), 4))

    return _fallback_result(
        reason=last_reason,
        checked_epoch=checked_epoch,
        attempts=attempt_count,
        stale_max_age_s=stale_max_age_s,
    )
