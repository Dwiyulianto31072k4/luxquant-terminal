"""
LuxQuant Terminal - Signal Journey Fetcher
===========================================
Sync OHLCV kline fetcher untuk signal journey worker.

Fallback chain (urutan attempt):
  1. binance_futures   (USDT-M perpetual)
  2. binance_spot
  3. bybit_linear      (USDT perpetual)
  4. bybit_spot

NO DB ACCESS. Pure HTTP fetch + parse.
"""

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple, Callable

import requests

# Avoid hard import of journey_calculator to keep fetcher decoupled
# Kline dataclass duck-typed: {open_time, open, high, low, close}
from app.services.journey_calculator import Kline


log = logging.getLogger(__name__)

# Default timeouts (seconds)
HTTP_TIMEOUT = 10
RATE_LIMIT_SLEEP = 0.1  # 100ms between fetches buat respect rate limits

# Binance: max 1500 klines per call. 1h interval = ~62 days max per call
# Most signals < 30 days, so 1 call cukup
BINANCE_MAX_LIMIT = 1500

# Bybit: max 1000 klines per call. 1h interval = ~41 days max per call
BYBIT_MAX_LIMIT = 1000


# ============================================================
# INTERVAL MAPPING (per-exchange)
# ============================================================

BINANCE_INTERVAL_MAP = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h',
    '12h': '12h', '1d': '1d',
}

BYBIT_INTERVAL_MAP = {
    '1m': '1', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360',
    '12h': '720', '1d': 'D',
}


# ============================================================
# PER-EXCHANGE FETCHERS
# ============================================================

def _fetch_binance_futures(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Binance USDT-M Futures kline fetch."""
    url = "https://fapi.binance.com/fapi/v1/klines"
    params = {
        'symbol': pair,
        'interval': BINANCE_INTERVAL_MAP[interval],
        'startTime': start_ms,
        'endTime': end_ms,
        'limit': BINANCE_MAX_LIMIT,
    }
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return _parse_binance_klines(resp.json())


def _fetch_binance_spot(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Binance Spot kline fetch."""
    url = "https://api.binance.com/api/v3/klines"
    params = {
        'symbol': pair,
        'interval': BINANCE_INTERVAL_MAP[interval],
        'startTime': start_ms,
        'endTime': end_ms,
        'limit': BINANCE_MAX_LIMIT,
    }
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return _parse_binance_klines(resp.json())


def _fetch_bybit_linear(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Bybit V5 USDT Perpetual kline fetch."""
    url = "https://api.bybit.com/v5/market/kline"
    params = {
        'category': 'linear',
        'symbol': pair,
        'interval': BYBIT_INTERVAL_MAP[interval],
        'start': start_ms,
        'end': end_ms,
        'limit': BYBIT_MAX_LIMIT,
    }
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return _parse_bybit_klines(resp.json())


def _fetch_bybit_spot(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Bybit V5 Spot kline fetch."""
    url = "https://api.bybit.com/v5/market/kline"
    params = {
        'category': 'spot',
        'symbol': pair,
        'interval': BYBIT_INTERVAL_MAP[interval],
        'start': start_ms,
        'end': end_ms,
        'limit': BYBIT_MAX_LIMIT,
    }
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return _parse_bybit_klines(resp.json())


# ============================================================
# RESPONSE PARSERS
# ============================================================

def _parse_binance_klines(raw: list) -> List[Kline]:
    """
    Binance kline format (array per candle):
      [open_time_ms, open, high, low, close, volume, close_time_ms, ...]
    """
    klines = []
    for row in raw:
        if not row or len(row) < 5:
            continue
        try:
            klines.append(Kline(
                open_time=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
            ))
        except (ValueError, TypeError, IndexError) as e:
            log.warning(f"Skip malformed Binance kline {row}: {e}")
            continue
    return klines


def _parse_bybit_klines(raw: dict) -> List[Kline]:
    """
    Bybit V5 response:
      {retCode: 0, result: {list: [[timestamp_ms, open, high, low, close, volume, turnover], ...]}}

    Note: Bybit returns klines in REVERSE chronological order (newest first).
    """
    if not isinstance(raw, dict):
        return []
    if raw.get('retCode') != 0:
        log.warning(f"Bybit error response: {raw.get('retMsg', 'unknown')}")
        return []

    raw_list = raw.get('result', {}).get('list', [])
    klines = []
    for row in raw_list:
        if not row or len(row) < 5:
            continue
        try:
            klines.append(Kline(
                open_time=datetime.fromtimestamp(int(row[0]) / 1000, tz=timezone.utc),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
            ))
        except (ValueError, TypeError, IndexError) as e:
            log.warning(f"Skip malformed Bybit kline {row}: {e}")
            continue

    # Bybit returns newest-first; reverse to chronological
    klines.sort(key=lambda k: k.open_time)
    return klines


# ============================================================
# MAIN ENTRY POINT
# ============================================================

# Fallback chain — order matters
SOURCES: List[Tuple[str, Callable]] = [
    ('binance_futures', _fetch_binance_futures),
    ('binance_spot',    _fetch_binance_spot),
    ('bybit_linear',    _fetch_bybit_linear),
    ('bybit_spot',      _fetch_bybit_spot),
]


def fetch_klines_with_fallback(
    pair: str,
    start_time: datetime,
    end_time: datetime,
    interval: str = '1h',
    sources: Optional[List[Tuple[str, Callable]]] = None,
) -> Tuple[List[Kline], str]:
    """
    Fetch OHLCV kline dengan fallback chain across exchanges.

    Args:
        pair: trading pair, e.g. 'BTCUSDT' (must match exchange convention)
        start_time: range start (timezone-aware datetime)
        end_time: range end (timezone-aware datetime, inclusive)
        interval: '1m', '5m', '15m', '30m', '1h', '4h', '1d', etc
        sources: override fallback chain (untuk testing). Default = SOURCES.

    Returns:
        (klines, source_name)
        - klines: list of Kline objects, chronological order
        - source_name: which exchange provided the data
        - On total failure: ([], 'unavailable')

    Catatan:
      - Kalau pair gak ada di Binance (Indonesia ISP issue, atau pair memang gak listed),
        fallback ke Bybit otomatis
      - Empty result (pair listed tapi gak ada candle di range) treated as failure,
        lanjut ke source berikutnya
      - Validation: start_time < end_time enforced
    """
    if sources is None:
        sources = SOURCES

    # Validation
    if start_time >= end_time:
        log.warning(f"Invalid range: start={start_time} >= end={end_time}")
        return [], 'unavailable'

    if interval not in BINANCE_INTERVAL_MAP:
        raise ValueError(f"Unsupported interval: {interval}")

    # Convert to ms timestamps
    start_ms = int(start_time.timestamp() * 1000)
    end_ms = int(end_time.timestamp() * 1000)

    last_error: Optional[str] = None
    for name, fetcher in sources:
        try:
            klines = fetcher(pair, start_ms, end_ms, interval)
            if klines:
                log.debug(f"Fetched {len(klines)} klines for {pair} from {name}")
                return klines, name
            else:
                last_error = f"{name} returned empty"
                log.debug(f"{name} returned empty for {pair}")
        except requests.HTTPError as e:
            last_error = f"{name} HTTP {e.response.status_code if e.response else '?'}"
            log.debug(f"{name} HTTP error for {pair}: {e}")
        except requests.RequestException as e:
            last_error = f"{name} network error: {type(e).__name__}"
            log.debug(f"{name} network error for {pair}: {e}")
        except Exception as e:
            last_error = f"{name} unexpected: {type(e).__name__}: {e}"
            log.warning(f"{name} unexpected error for {pair}: {e}")

        # Rate limit courtesy between fallback attempts
        time.sleep(RATE_LIMIT_SLEEP)

    log.warning(f"All sources failed for {pair} ({start_time} - {end_time}): {last_error}")
    return [], 'unavailable'


# ============================================================
# CONVENIENCE: derive direction from signal targets
# ============================================================

def derive_direction(entry: float, target1: float) -> str:
    """
    Infer signal direction from entry & target1.

    LONG: target1 > entry (price goes up)
    SHORT: target1 < entry (price goes down)

    Raises ValueError kalau target1 == entry (ambiguous).
    """
    if entry <= 0 or target1 <= 0:
        raise ValueError(f"entry & target1 must be > 0 (got entry={entry}, target1={target1})")
    if target1 == entry:
        raise ValueError(f"Cannot derive direction: target1 ({target1}) == entry ({entry})")
    return 'long' if target1 > entry else 'short'


# ============================================================
# CONVENIENCE: parse signals.created_at (TEXT column with ISO8601)
# ============================================================

def parse_created_at(raw: str) -> datetime:
    """
    Parse signals.created_at (TEXT). Format from DB: '2025-10-01T08:36:14+00:00'.

    Raises ValueError kalau format gak dikenali.
    """
    if not raw or not isinstance(raw, str):
        raise ValueError(f"created_at must be non-empty string, got: {raw!r}")

    # ISO8601 with timezone offset — Python 3.11+ fromisoformat handles this
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as e:
        raise ValueError(f"Cannot parse created_at {raw!r}: {e}")

    # Ensure timezone-aware (default UTC if naive)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def parse_update_at(raw: str) -> datetime:
    """Same format as created_at — alias for clarity."""
    return parse_created_at(raw)


# ============================================================
# COVERAGE WINDOW HELPER
# ============================================================

def compute_coverage_until(
    *,
    last_event_type: Optional[str],
    last_event_at: Optional[datetime],
    now: Optional[datetime] = None,
    freeze_after_days: int = 14,
) -> Tuple[datetime, str]:
    """
    Compute coverage_until + coverage_status berdasarkan signal state.

    Rules (sesuai schema design):
      - No event yet: coverage_until=now, status='live'
      - Intermediate (tp1/tp2/tp3): coverage_until=now, status='live'
      - tp4 hit, age <= freeze_after_days: coverage_until=now, status='live'
      - tp4 hit, age > freeze_after_days: coverage_until=tp4_at + 14d, status='frozen'
      - sl hit: coverage_until=sl_at, status='sl_truncated'
    """
    if now is None:
        now = datetime.now(timezone.utc)

    if last_event_type is None or last_event_at is None:
        return now, 'live'

    if last_event_type == 'sl':
        return last_event_at, 'sl_truncated'

    if last_event_type == 'tp4':
        age = now - last_event_at
        if age > timedelta(days=freeze_after_days):
            return last_event_at + timedelta(days=freeze_after_days), 'frozen'
        return now, 'live'

    # tp1, tp2, tp3 = intermediate
    return now, 'live'
