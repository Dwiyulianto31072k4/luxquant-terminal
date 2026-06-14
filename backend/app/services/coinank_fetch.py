"""
CoinAnk liquidation heatmap fetcher through Apify.

The fetch result is explicit about freshness. A failed provider response may
fall back to a recent last-good payload, but missing data is never represented
as a neutral market signal.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

import httpx

from app.core.redis import get_redis
from app.services.heatmap_payload import (
    describe_payload_shape,
    find_liq_heatmap_record,
    has_usable_liq_heatmap_data,
)

logger = logging.getLogger(__name__)

APIFY_ACTOR = "api_merge~coinank-liquidation-heatmap"
APIFY_RUN_SYNC_URL = (
    f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
)
LAST_GOOD_CACHE_KEY = "lq:compass:liquidity:coinank:last_good"
LAST_GOOD_CACHE_TTL_SECONDS = 24 * 60 * 60
DEFAULT_STALE_MAX_AGE_SECONDS = 8 * 60 * 60

LiquidityStatus = Literal["fresh", "stale", "unavailable"]


def _iso_utc(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).isoformat()


def _actor_error_reason(payload: Any) -> str | None:
    """Map actor-reported errors to stable, non-sensitive reason codes."""
    item = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(item, dict) or not item.get("error"):
        return None
    message = str(item["error"]).lower()
    if "upstream request failed" in message or "system error" in message:
        return "actor_upstream_error"
    return "actor_reported_error"


@dataclass(frozen=True)
class HeatmapFetchResult:
    status: LiquidityStatus
    payload: Any | None
    reason: str | None
    checked_at: str
    fetched_at: str | None = None
    age_seconds: float | None = None
    attempts: int = 0
    provider: str = "coinank_via_apify"
    payload_shape: dict | None = None

    @property
    def available(self) -> bool:
        return self.status in ("fresh", "stale") and self.payload is not None

    def metadata(self) -> dict:
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
            "payload_shape": self.payload_shape,
        }


def _save_last_good(payload: Any, fetched_epoch: float) -> None:
    try:
        value = json.dumps(
            {"fetched_epoch": fetched_epoch, "payload": payload},
            separators=(",", ":"),
        )
        get_redis().setex(LAST_GOOD_CACHE_KEY, LAST_GOOD_CACHE_TTL_SECONDS, value)
    except Exception as exc:
        logger.warning(
            "fetch_coinank_heatmap: could not cache last-good payload (%s)",
            type(exc).__name__,
        )


def _load_last_good(now_epoch: float, max_age_seconds: float) -> tuple[Any, float, str] | None:
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
        if not has_usable_liq_heatmap_data(find_liq_heatmap_record(payload)):
            return None
        return payload, age_seconds, _iso_utc(fetched_epoch)
    except Exception as exc:
        logger.warning(
            "fetch_coinank_heatmap: could not read last-good payload (%s)",
            type(exc).__name__,
        )
        return None


def _fallback_result(
    *,
    reason: str,
    checked_epoch: float,
    attempts: int,
    stale_max_age_s: float,
    payload_shape: dict | None = None,
) -> HeatmapFetchResult:
    cached = _load_last_good(checked_epoch, stale_max_age_s)
    if cached is not None:
        payload, age_seconds, fetched_at = cached
        logger.warning(
            "fetch_coinank_heatmap: %s; using last-good payload age=%ss",
            reason,
            round(age_seconds),
        )
        return HeatmapFetchResult(
            status="stale",
            payload=payload,
            reason=reason,
            checked_at=_iso_utc(checked_epoch),
            fetched_at=fetched_at,
            age_seconds=round(age_seconds, 3),
            attempts=attempts,
            payload_shape=payload_shape,
        )
    logger.warning("fetch_coinank_heatmap: unavailable (%s)", reason)
    return HeatmapFetchResult(
        status="unavailable",
        payload=None,
        reason=reason,
        checked_at=_iso_utc(checked_epoch),
        attempts=attempts,
        payload_shape=payload_shape,
    )


async def fetch_coinank_heatmap(
    symbol: str = "BTCUSDT",
    interval: str = "12h",
    *,
    timeout_s: float = 90.0,
    max_attempts: int = 2,
    stale_max_age_s: float = DEFAULT_STALE_MAX_AGE_SECONDS,
) -> HeatmapFetchResult:
    """Fetch a heatmap and return a fresh, stale, or unavailable result."""
    checked_epoch = time.time()
    token = os.getenv("APIFY_TOKEN")
    if not token:
        return _fallback_result(
            reason="missing_apify_token",
            checked_epoch=checked_epoch,
            attempts=0,
            stale_max_age_s=stale_max_age_s,
        )

    payload = {"symbol": symbol, "interval": interval}
    attempts = max(1, max_attempts)
    last_reason = "unknown_error"
    last_shape: dict | None = None
    attempt_count = 0

    for attempt in range(1, attempts + 1):
        attempt_count = attempt
        try:
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                response = await client.post(
                    APIFY_RUN_SYNC_URL,
                    headers={"Authorization": f"Bearer {token}"},
                    json=payload,
                )

            if response.status_code >= 500:
                last_reason = f"apify_http_{response.status_code}"
                if attempt < attempts:
                    await asyncio.sleep(min(2 ** (attempt - 1), 4))
                    continue
                break
            if response.status_code >= 400:
                last_reason = f"apify_http_{response.status_code}"
                break

            try:
                data = response.json()
            except ValueError:
                last_reason = "invalid_json"
                last_shape = {"type": "non_json_response"}
                break

            last_shape = describe_payload_shape(data)
            if not data:
                last_reason = "empty_dataset"
                break
            actor_error = _actor_error_reason(data)
            if actor_error is not None:
                last_reason = actor_error
                break
            record = find_liq_heatmap_record(data)
            if record is None:
                last_reason = "invalid_payload_shape"
                break
            if not has_usable_liq_heatmap_data(record):
                last_reason = "empty_heatmap_data"
                break

            fetched_epoch = time.time()
            _save_last_good(data, fetched_epoch)
            return HeatmapFetchResult(
                status="fresh",
                payload=data,
                reason=None,
                checked_at=_iso_utc(checked_epoch),
                fetched_at=_iso_utc(fetched_epoch),
                age_seconds=0.0,
                attempts=attempt,
                payload_shape=last_shape,
            )
        except httpx.TimeoutException:
            last_reason = "apify_timeout"
            if attempt < attempts:
                await asyncio.sleep(min(2 ** (attempt - 1), 4))
                continue
        except httpx.HTTPError as exc:
            last_reason = f"apify_transport_{type(exc).__name__}"
            if attempt < attempts:
                await asyncio.sleep(min(2 ** (attempt - 1), 4))
                continue
        except Exception as exc:
            last_reason = f"unexpected_{type(exc).__name__}"
            break

    return _fallback_result(
        reason=last_reason,
        checked_epoch=checked_epoch,
        attempts=attempt_count,
        stale_max_age_s=stale_max_age_s,
        payload_shape=last_shape,
    )
