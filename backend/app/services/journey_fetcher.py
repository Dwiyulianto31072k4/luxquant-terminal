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

# Interval duration in seconds — buat align start_time ke kline boundary
INTERVAL_SECONDS = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600,
    '12h': 43200, '1d': 86400,
}


def _require_binance_ok() -> None:
    """Raise if a shared Binance ban is active, before spending the request.

    Binance escalates a 418 every time it is hit DURING one — 2 minutes to 3
    days — so calling blind while banned deepens the ban for everything else on
    this IP. Raising here lets the existing Bybit fallback take over exactly as
    it would for any other failure.

    Deliberately NOT routed through http_client.binance_get_sync: the tests
    patch app.services.journey_fetcher.requests.get, and moving the call behind
    another module's helper silently escaped that mock — two tests started
    reaching the real network before I noticed. The guard belongs here; the call
    seam stays where the tests can see it.
    """
    try:
        from app.services.terminal_worker import _fapi_ok
    except Exception:
        return
    if not _fapi_ok():
        raise RuntimeError("binance ban active")


def _record_binance_weight(resp) -> None:
    """Log this call against the per-minute weight budget, and note any ban."""
    try:
        from app.services.terminal_worker import _note_ban
        if getattr(resp, "status_code", 0) in (418, 429):
            _note_ban(resp, 600 if resp.status_code == 418 else 120)
    except Exception:
        pass
    # The path used to be hardcoded to /fapi/v1/klines, so the spot fetch below
    # was filed under futures — which made the endpoint breakdown wrong in the
    # one place it was supposed to be authoritative. Deriving it from the
    # response also attributes the call to this module by name.
    try:
        from app.core.http_client import note_binance_response
        note_binance_response(resp, "journey_fetcher")
    except Exception:
        pass


def _needed_candles(start_ms: int, end_ms: int, interval: str, cap: int) -> int:
    """How many candles this range actually spans, capped.

    Binance charges kline weight on the LIMIT PARAMETER, not on the rows it
    returns. Asking for 1500 to cover a two-day signal cost weight 10 for 48
    candles; asking for 48 costs 1 and comes back byte-identical — verified
    against production, same first and last open times both ways.

    Since startTime/endTime already bound the response, limit was only ever
    acting as a ceiling. Sizing it to the range is a straight 10x saving on the
    heaviest consumer of the futures weight budget.
    """
    step = INTERVAL_SECONDS.get(interval)
    if not step:
        return cap
    span = max(0, int(end_ms) - int(start_ms)) // 1000
    # +2: one for the partial candle at each edge
    return max(1, min(cap, span // step + 2))


def _floor_to_interval(dt: datetime, interval: str) -> datetime:
    """
    Floor datetime to interval boundary (UTC).

    Example: dt=2026-04-30T09:50:05Z, interval='1h' -> 2026-04-30T09:00:00Z
    Important: exchange API endTime/startTime expects kline open_time;
    if start_time falls mid-candle, kline containing it must be included.
    """
    seconds = INTERVAL_SECONDS.get(interval)
    if not seconds:
        return dt
    # Use UTC epoch seconds and floor
    epoch = int(dt.timestamp())
    floored = (epoch // seconds) * seconds
    return datetime.fromtimestamp(floored, tz=timezone.utc)


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
        'limit': _needed_candles(start_ms, end_ms, interval, BINANCE_MAX_LIMIT),
    }
    _require_binance_ok()
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    _record_binance_weight(resp)
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
        'limit': _needed_candles(start_ms, end_ms, interval, BINANCE_MAX_LIMIT),
    }
    _require_binance_ok()
    resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
    _record_binance_weight(resp)
    resp.raise_for_status()
    return _parse_binance_klines(resp.json())


def _fetch_bybit_paged(
    category: str,
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Bybit V5 klines covering the SAME window Binance does: forward from start.

    Given start and end, Bybit answers with the NEWEST `limit` candles of the
    range, not the oldest. One capped call therefore handed an old signal the
    last ~41 days before its end — months after the call — and every figure
    built on it (peak, drawdown, time above entry) described the wrong period:
    2,690 journeys, their first candle a median 253 days after entry (measured
    2026-09-26). Binance returns the oldest candles first, so its journeys cover
    entry → +1500 candles; Bybit is now paged in <=1000-candle windows from
    start to cover the same span.
    """
    step_ms = INTERVAL_SECONDS[interval] * 1000
    last_ms = min(end_ms, start_ms + BINANCE_MAX_LIMIT * step_ms - 1)
    url = "https://api.bybit.com/v5/market/kline"
    out: List[Kline] = []
    page_start = start_ms
    while page_start <= last_ms:
        page_end = min(last_ms, page_start + BYBIT_MAX_LIMIT * step_ms - 1)
        params = {
            'category': category,
            'symbol': pair,
            'interval': BYBIT_INTERVAL_MAP[interval],
            'start': page_start,
            'end': page_end,
            'limit': _needed_candles(page_start, page_end, interval, BYBIT_MAX_LIMIT),
        }
        resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        page = _parse_bybit_klines(resp.json())
        if not page:
            break
        out.extend(k for k in page if not out or k.open_time > out[-1].open_time)
        page_start = page_end + 1
    return out


def _fetch_bybit_linear(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Bybit V5 USDT Perpetual kline fetch."""
    return _fetch_bybit_paged('linear', pair, start_ms, end_ms, interval)


def _fetch_bybit_spot(
    pair: str,
    start_ms: int,
    end_ms: int,
    interval: str,
) -> List[Kline]:
    """Bybit V5 Spot kline fetch."""
    return _fetch_bybit_paged('spot', pair, start_ms, end_ms, interval)


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

# A source whose first candle opens this long after the call does not cover
# the trade (the pair was listed there later).
MAX_START_LAG_HOURS = 24

# A signal's entry can sit a few percent to tens of percent from the market
# (limit entries, dip buys); a different instrument is off by 2x to 10^6x.
PRICE_MATCH_BAND = (0.5, 2.0)


def price_matches(first: "Kline", reference_price: Optional[float]) -> bool:
    """Is this candle plausibly the instrument the signal was called on?"""
    if not reference_price or reference_price <= 0 or not first or first.close <= 0:
        return True
    lo, hi = PRICE_MATCH_BAND
    return lo <= first.close / reference_price <= hi


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
    reference_price: Optional[float] = None,
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
      - reference_price (the signal's entry): a source whose first candle sits
        more than 2x away from it is serving ANOTHER instrument under the same
        ticker — DEFIUSDT is Binance's DeFi index (~1,000) and a 0.002 token on
        Bybit spot; 119 journeys were built on such a twin. That source is
        skipped and the next one tried; none matching means 'unavailable',
        which is honest where a twin's price path is not.
    """
    if sources is None:
        sources = SOURCES
    try:
        reference_price = float(reference_price) if reference_price is not None else None
    except (TypeError, ValueError):
        reference_price = None

    # Validation
    if start_time >= end_time:
        log.warning(f"Invalid range: start={start_time} >= end={end_time}")
        return [], 'unavailable'

    if interval not in BINANCE_INTERVAL_MAP:
        raise ValueError(f"Unsupported interval: {interval}")

    # Round start_time down to interval boundary so the kline containing
    # entry timestamp is included (e.g. entry at 09:50 with 1h interval,
    # we need kline at 09:00 not 10:00)
    start_time_aligned = _floor_to_interval(start_time, interval)

    # Convert to ms timestamps
    start_ms = int(start_time_aligned.timestamp() * 1000)
    end_ms = int(end_time.timestamp() * 1000)

    last_error: Optional[str] = None
    for name, fetcher in sources:
        try:
            klines = fetcher(pair, start_ms, end_ms, interval)
            late = (klines[0].open_time - start_time_aligned).total_seconds() / 3600 if klines else 0
            if klines and late > MAX_START_LAG_HOURS:
                # Listed on this venue after the call: its candles describe a
                # later market, not the trade.
                last_error = f"{name} starts {late / 24:.0f}d after the call"
                log.info(f"{pair}: {last_error} — trying the next source")
            elif klines and not price_matches(klines[0], reference_price):
                last_error = f"{name} serves another instrument (x{klines[0].close / reference_price:.3g} the entry)"
                log.warning(f"{pair}: {last_error} — trying the next source")
            elif klines:
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

def derive_direction(
    entry: float,
    target1: float,
    *,
    target2: float | None = None,
    target3: float | None = None,
    target4: float | None = None,
    stop1: float | None = None,
) -> str:
    """
    Infer signal direction from the plan's levels.

    This used to take target1 alone and raise ValueError when target1 == entry,
    calling that ambiguous. It is not ambiguous — TP1 landing on the entry tick
    is a rounding artefact, and the stop and the far targets still say which way
    the plan points.

    The raise was not a visible error either. journey_persistor calls this while
    building the record, so every signal that hit the tie simply never got a
    journey row at all: 70 signals, 48 of them resolved, absent from
    realized_outcome_pct and from every figure derived from it, against 100%
    journey coverage for every other resolved signal.

    Evidence in order of reliability:
      1. stop1, when it differs from the entry — it always sits on the losing
         side. stop2 is not consulted: measured over all 56,026 signals it
         never changes the answer, because it is null exactly where stop1 is
      2. the furthest target that differs from the entry, TP4 first, since the
         furthest level is the least likely to round into the entry tick
      3. long, the only direction this desk has ever published (measured across
         55,989 signals: none carries a stop above its entry)

    Never decides from a level equal to the entry — that equality is exactly the
    artefact this function exists to survive.

    Mirrors /opt/luxquant/signal_side.py, which fixes the same bug in the chart
    and PnL-card workers. The two codebases share no modules; if this rule
    changes, change it there too.
    """
    if entry is None or entry <= 0:
        raise ValueError(f"entry must be > 0 (got entry={entry})")

    def _f(v):
        # asyncpg hands these over as Decimal, and some rows carry None.
        if v is None:
            return None
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if f > 0 else None

    e = float(entry)

    stop = _f(stop1)
    if stop is not None and stop != e:
        return 'long' if stop < e else 'short'

    for tgt in (_f(target4), _f(target3), _f(target2), _f(target1)):
        if tgt is not None and tgt != e:
            return 'long' if tgt > e else 'short'

    return 'long'


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
