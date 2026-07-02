"""
LuxQuant BTC Compass 2.0 — Projection Resolver
================================================
First-barrier evaluator for target-first scenario contracts.

This is the missing half of the Compass 2.0 accountability loop. Contracts are
persisted by ai_arena_v6_persist.py as ACTIVE and, until this service runs,
nothing ever writes compass_projection_resolutions — which is why the audit
table shows every row as PENDING.

For each unresolved contract the resolver:
  1. Builds the evaluation window: active_from -> min(now, active_from + stale_after_minutes)
  2. Fetches Bybit 1m spot klines for that window (shared cache across contracts,
     so a full backfill costs only a handful of HTTP calls)
  3. Walks candles chronologically and finds the FIRST barrier touched:
       - primary_touch level  (target)
       - invalidation level
     honoring the stored trigger semantics (touch / close_above / close_below /
     wick_above / wick_below).
  4. Writes:
       - compass_projection_events   (TARGET_TOUCHED / INVALIDATION_TOUCHED /
                                      CONFIRMATION_TOUCHED / STALE_MARKED)
       - compass_projection_resolutions (one row per projection, idempotent)
       - compass_projection_contracts.status -> RESOLVED / STALE

Outcomes (aligned with what the frontend already renders):
  Directional bias (BULLISH*/BEARISH*/RISK_ON/RISK_OFF):
      CLEAN_HIT          target touched first
      INVALIDATED_FIRST  invalidation touched first
      AMBIGUOUS_BAR      both barriers inside the same 1m candle
      STALE_NO_TOUCH     stale window elapsed, neither barrier touched
  Range bias (RANGE*/NEUTRAL_RANGE/MEAN_REVERSION):
      RANGE_HELD         stayed inside the range until stale window elapsed
      RANGE_BREAK_UP     broke above the upper band first
      RANGE_BREAK_DOWN   broke below the lower band first

Manual run / backfill (evaluates ALL unresolved history, including reports
from days ago):
    python3 -m app.services.compass_projection_resolver --backfill --verbose

Dry run (no DB writes, prints what would resolve):
    python3 -m app.services.compass_projection_resolver --backfill --dry-run

Scheduled run (recommended, every 5 minutes):
    systemd: luxquant-compass-resolver.timer
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from app.core.database import SessionLocal

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

EVALUATOR_VERSION = "compass_resolver_v1.1"
POLICY_VERSION = "target_first_v1"

BYBIT_KLINE_URL = "https://api.bybit.com/v5/market/kline"
KLINE_INTERVAL = "1"          # 1-minute candles
KLINE_PAGE_LIMIT = 1000       # Bybit max per request
MAX_WINDOW_DAYS = 30          # safety guard for pathological stale windows
DEFAULT_STALE_MINUTES = 1440  # fallback when contract has no stale window

RANGE_BIAS_PREFIXES = ("RANGE", "NEUTRAL_RANGE", "MEAN_REVERSION")


# ════════════════════════════════════════════════════════════════════════
# Data containers
# ════════════════════════════════════════════════════════════════════════

@dataclass
class Candle:
    ts: datetime
    open: float
    high: float
    low: float
    close: float


@dataclass
class BarrierHit:
    kind: str                 # TARGET / INVALIDATION / CONFIRMATION / RANGE_UP / RANGE_DOWN
    at: datetime
    price: float
    rule: str                 # which trigger rule fired


@dataclass
class ResolutionDraft:
    projection_id: str
    outcome: str
    first_barrier: Optional[str]
    first_barrier_at: Optional[datetime]
    first_barrier_price: Optional[float]
    mfe_pct: Optional[float]
    mae_pct: Optional[float]
    time_to_confirmation_seconds: Optional[int]
    time_to_target_seconds: Optional[int]
    time_to_invalidation_seconds: Optional[int]
    reason_codes: list[str]
    observed_facts: dict[str, Any]
    interpretation: str
    resolved_at: datetime
    events: list[BarrierHit] = field(default_factory=list)
    new_status: str = "RESOLVED"


# ════════════════════════════════════════════════════════════════════════
# Kline cache — one fetch pass shared by every contract in the run
# ════════════════════════════════════════════════════════════════════════

class KlineCache:
    """Fetches and caches Bybit 1m candles across the whole resolver run."""

    def __init__(self) -> None:
        self._candles: list[Candle] = []
        self._covered_from: Optional[datetime] = None
        self._covered_to: Optional[datetime] = None

    async def ensure(self, start: datetime, end: datetime) -> None:
        """Make sure [start, end] is covered by the cache."""
        start = start.replace(second=0, microsecond=0)
        if self._covered_from is not None and self._covered_from <= start and self._covered_to is not None and self._covered_to >= end:
            return
        fetch_from = start if self._covered_from is None else min(start, self._covered_from)
        fetch_to = end if self._covered_to is None else max(end, self._covered_to)
        self._candles = await self._fetch_range(fetch_from, fetch_to)
        self._covered_from = fetch_from
        self._covered_to = fetch_to

    def window(self, start: datetime, end: datetime) -> list[Candle]:
        return [c for c in self._candles if start <= c.ts <= end]

    @staticmethod
    async def _fetch_range(start: datetime, end: datetime) -> list[Candle]:
        """
        Bybit anchors kline responses to `end` and returns the NEWEST `limit`
        candles in [start, end] (newest first). So pagination must walk
        BACKWARD: keep the same start, move `end` to just before the oldest
        candle of the previous page until the start boundary is reached.
        """
        candles: dict[int, Candle] = {}
        start_ms = int(start.timestamp() * 1000)
        cursor_end_ms = int(end.timestamp() * 1000)

        async with httpx.AsyncClient(timeout=15) as client:
            while cursor_end_ms >= start_ms:
                params = {
                    "category": "spot",
                    "symbol": "BTCUSDT",
                    "interval": KLINE_INTERVAL,
                    "start": start_ms,
                    "end": cursor_end_ms,
                    "limit": KLINE_PAGE_LIMIT,
                }
                resp = await client.get(BYBIT_KLINE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                if data.get("retCode") != 0:
                    raise RuntimeError(f"Bybit kline error: {data.get('retMsg')}")
                rows = data.get("result", {}).get("list", [])
                if not rows:
                    break  # exchange has no more data this far back
                for row in rows:
                    ts_ms = int(row[0])
                    candles[ts_ms] = Candle(
                        ts=datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc),
                        open=float(row[1]),
                        high=float(row[2]),
                        low=float(row[3]),
                        close=float(row[4]),
                    )
                oldest_ms = min(int(row[0]) for row in rows)
                if oldest_ms <= start_ms:
                    break  # window covered down to start
                cursor_end_ms = oldest_ms - 60_000
                await asyncio.sleep(0.15)  # be polite to the rate limiter

        ordered = [candles[k] for k in sorted(candles)]
        logger.info(
            "Kline cache: %d candles %s -> %s",
            len(ordered),
            ordered[0].ts.isoformat() if ordered else "-",
            ordered[-1].ts.isoformat() if ordered else "-",
        )
        return ordered


# ════════════════════════════════════════════════════════════════════════
# Barrier logic
# ════════════════════════════════════════════════════════════════════════

def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _level_hit(candle: Candle, level: float, trigger: str, direction: str) -> Optional[str]:
    """
    Check whether `candle` satisfies `trigger` against `level`.

    direction: "up" means the barrier lies above the path origin (breach = go up),
               "down" means below (breach = go down). Used for bare "touch"
               triggers where trigger text carries no side information.

    Returns the rule name that fired, or None.
    """
    t = (trigger or "").strip().lower()

    if "close" in t and "above" in t:
        return "close_above" if candle.close >= level else None
    if "close" in t and "below" in t:
        return "close_below" if candle.close <= level else None
    if "above" in t:  # wick_above / break_above / above
        return "wick_above" if candle.high >= level else None
    if "below" in t:  # wick_below / break_below / below
        return "wick_below" if candle.low <= level else None

    # bare "touch" (or unknown) — use direction to decide which side counts
    if direction == "up":
        return "touch_above" if candle.high >= level else None
    if direction == "down":
        return "touch_below" if candle.low <= level else None
    # unknown direction: any intrabar touch
    return "touch" if (candle.low <= level <= candle.high) else None


def _is_range_bias(bias: str) -> bool:
    return (bias or "").upper().startswith(RANGE_BIAS_PREFIXES)


def _bias_is_bullish(bias: str) -> bool:
    b = (bias or "").upper()
    return b.startswith(("BULLISH", "RISK_ON"))


def _excursions(candles: list[Candle], reference: float, bullish: bool) -> tuple[Optional[float], Optional[float]]:
    """MFE/MAE in % relative to reference, signed by scenario direction."""
    if not candles or not reference:
        return None, None
    highest = max(c.high for c in candles)
    lowest = min(c.low for c in candles)
    up_pct = (highest / reference - 1.0) * 100.0
    down_pct = (lowest / reference - 1.0) * 100.0
    if bullish:
        return round(up_pct, 4), round(down_pct, 4)
    return round(abs(down_pct), 4) if down_pct < 0 else round(-down_pct, 4), round(-up_pct, 4)


def evaluate_contract(contract: dict[str, Any], candles: list[Candle], now: datetime) -> Optional[ResolutionDraft]:
    """
    Pure first-barrier evaluation. Returns a ResolutionDraft when the contract
    can be resolved, or None when it must stay pending (window still open and
    no barrier touched yet).
    """
    projection_id = contract["projection_id"]
    bias = (contract.get("primary_bias") or "").upper()
    reference = _num(contract.get("reference_price")) or 0.0
    target_level = _num(contract.get("primary_touch_level"))
    target_trigger = contract.get("primary_touch_trigger") or "touch"
    inval_level = _num(contract.get("invalidation_level"))
    inval_trigger = contract.get("invalidation_trigger") or "touch"
    conf_level = _num(contract.get("confirmation_level"))
    conf_trigger = contract.get("confirmation_trigger") or "touch"
    ext_high = _num(contract.get("extension_high"))

    active_from = contract["active_from"]
    if active_from.tzinfo is None:
        active_from = active_from.replace(tzinfo=timezone.utc)
    stale_minutes = int(contract.get("stale_after_minutes") or DEFAULT_STALE_MINUTES)
    window_end = active_from + timedelta(minutes=stale_minutes)
    window_closed = now >= window_end
    eval_end = min(now, window_end)

    is_range = _is_range_bias(bias)
    bullish = _bias_is_bullish(bias)

    # Directions for bare-touch triggers
    if is_range:
        upper_level = max(v for v in (target_level, ext_high) if v is not None) if (target_level or ext_high) else None
        lower_level = inval_level
        target_dir, inval_dir = "up", "down"
    else:
        target_dir = "up" if bullish else "down"
        inval_dir = "down" if bullish else "up"
        upper_level = lower_level = None

    scoped = [c for c in candles if active_from <= c.ts <= eval_end]

    # Data-coverage guard: a barrier HIT can be trusted from partial data,
    # but "nothing was touched" (STALE / RANGE_HELD) is only a valid verdict
    # when candles actually cover the whole evaluation window. Without this,
    # missing kline history silently turns into fake stale/held outcomes.
    coverage_tolerance = timedelta(minutes=5)
    data_covers_window = bool(scoped) and (
        (scoped[0].ts - active_from) <= coverage_tolerance
        and (eval_end - scoped[-1].ts) <= coverage_tolerance
    )

    first_target: Optional[BarrierHit] = None
    first_inval: Optional[BarrierHit] = None
    first_conf: Optional[BarrierHit] = None
    ambiguous = False

    for candle in scoped:
        if first_conf is None and conf_level:
            rule = _level_hit(candle, conf_level, conf_trigger, target_dir)
            if rule:
                first_conf = BarrierHit("CONFIRMATION", candle.ts, conf_level, rule)

        if is_range:
            t_rule = _level_hit(candle, upper_level, "wick_above", "up") if upper_level else None
            i_rule = _level_hit(candle, lower_level, inval_trigger, "down") if lower_level else None
        else:
            t_rule = _level_hit(candle, target_level, target_trigger, target_dir) if target_level else None
            i_rule = _level_hit(candle, inval_level, inval_trigger, inval_dir) if inval_level else None

        if t_rule and first_target is None:
            first_target = BarrierHit("TARGET", candle.ts, target_level if not is_range else upper_level, t_rule)
        if i_rule and first_inval is None:
            first_inval = BarrierHit("INVALIDATION", candle.ts, inval_level, i_rule)

        if first_target and first_inval:
            if first_target.at == first_inval.at:
                ambiguous = True
            break
        if first_target or first_inval:
            break

    first_barrier_at = min(
        (hit.at for hit in (first_target, first_inval) if hit),
        default=None,
    )
    excursion_scope = (
        [c for c in scoped if c.ts <= first_barrier_at] if first_barrier_at else scoped
    )
    mfe, mae = _excursions(excursion_scope, reference, bullish if not is_range else True)

    def seconds_since_start(dt: Optional[datetime]) -> Optional[int]:
        if dt is None:
            return None
        return int((dt - active_from).total_seconds())

    base_facts = {
        "bias": bias,
        "reference_price": reference,
        "target_level": target_level,
        "target_trigger": target_trigger,
        "invalidation_level": inval_level,
        "invalidation_trigger": inval_trigger,
        "window_start": active_from.isoformat(),
        "window_end": window_end.isoformat(),
        "candles_evaluated": len(scoped),
        "stale_after_minutes": stale_minutes,
    }

    def build(outcome: str, barrier: Optional[BarrierHit], reasons: list[str], interp: str, status: str) -> ResolutionDraft:
        events = [e for e in (first_conf, first_target, first_inval) if e]
        return ResolutionDraft(
            projection_id=projection_id,
            outcome=outcome,
            first_barrier=barrier.kind if barrier else None,
            first_barrier_at=barrier.at if barrier else None,
            first_barrier_price=barrier.price if barrier else None,
            mfe_pct=mfe,
            mae_pct=mae,
            time_to_confirmation_seconds=seconds_since_start(first_conf.at if first_conf else None),
            time_to_target_seconds=seconds_since_start(first_target.at if first_target else None),
            time_to_invalidation_seconds=seconds_since_start(first_inval.at if first_inval else None),
            reason_codes=reasons,
            observed_facts=base_facts,
            interpretation=interp,
            resolved_at=now,
            events=events,
            new_status=status,
        )

    if ambiguous:
        return build(
            "AMBIGUOUS_BAR",
            first_target,
            ["both_barriers_same_1m_bar"],
            "Target and invalidation were both touched inside the same 1-minute candle; "
            "resolution is recorded but excluded from hit/miss scoring.",
            "RESOLVED",
        )

    if is_range:
        if first_target and (first_inval is None or first_target.at < first_inval.at):
            return build(
                "RANGE_BREAK_UP",
                first_target,
                [f"upper_band_breached_{first_target.rule}"],
                f"Price broke above the projected range band at {first_target.price:,.0f} "
                f"before holding through the review window.",
                "RESOLVED",
            )
        if first_inval:
            return build(
                "RANGE_BREAK_DOWN",
                first_inval,
                [f"lower_band_breached_{first_inval.rule}"],
                f"Price broke below the projected range floor at {first_inval.price:,.0f} "
                f"before holding through the review window.",
                "RESOLVED",
            )
        if window_closed and data_covers_window:
            return build(
                "RANGE_HELD",
                None,
                ["range_respected_through_stale_window"],
                "Price stayed inside the projected range for the full review window. "
                "The range read was respected.",
                "RESOLVED",
            )
        if window_closed and not data_covers_window:
            logger.warning(
                "Skipping %s: window closed but kline data does not cover it "
                "(%d candles).", projection_id, len(scoped),
            )
        return None

    # Directional scenario
    if first_target and (first_inval is None or first_target.at < first_inval.at):
        return build(
            "CLEAN_HIT",
            first_target,
            [f"target_first_{first_target.rule}"],
            f"BTC touched the projected level {first_target.price:,.0f} before the "
            f"invalidation barrier. The projection was respected"
            + (f" (confirmation seen {seconds_since_start(first_conf.at)//60}m in)." if first_conf else "."),
            "RESOLVED",
        )
    if first_inval:
        return build(
            "INVALIDATED_FIRST",
            first_inval,
            [f"invalidation_first_{first_inval.rule}"],
            f"BTC broke the invalidation barrier {first_inval.price:,.0f} before "
            f"reaching the projected touch. The thesis broke first.",
            "RESOLVED",
        )
    if window_closed and data_covers_window:
        return build(
            "STALE_NO_TOUCH",
            None,
            ["stale_window_elapsed_no_barrier"],
            f"Neither the projected touch nor the invalidation barrier was reached "
            f"within the {stale_minutes}-minute review window. Scored as stale, "
            f"not as a hit or a miss.",
            "STALE",
        )
    if window_closed and not data_covers_window:
        logger.warning(
            "Skipping %s: window closed but kline data does not cover it "
            "(%d candles).", projection_id, len(scoped),
        )
    return None  # still live, keep pending


# ════════════════════════════════════════════════════════════════════════
# DB access
# ════════════════════════════════════════════════════════════════════════

UNRESOLVED_SQL = text("""
    SELECT
        c.projection_id,
        c.primary_bias,
        c.reference_price,
        c.primary_touch_level,
        c.primary_touch_trigger,
        c.invalidation_level,
        c.invalidation_trigger,
        c.confirmation_level,
        c.confirmation_trigger,
        c.extension_low,
        c.extension_high,
        c.stale_after_minutes,
        c.status,
        c.active_from
    FROM compass_projection_contracts c
    LEFT JOIN compass_projection_resolutions r ON r.projection_id = c.projection_id
    WHERE r.projection_id IS NULL
      AND c.active_from >= NOW() - (:max_age_days || ' days')::interval
    ORDER BY c.active_from ASC
    LIMIT :limit
""")


def _fetch_unresolved(db, limit: int, max_age_days: int) -> list[dict[str, Any]]:
    rows = db.execute(UNRESOLVED_SQL, {"limit": limit, "max_age_days": max_age_days}).mappings().all()
    return [dict(row) for row in rows]


def _persist_resolution(db, draft: ResolutionDraft) -> None:
    for event in draft.events:
        db.execute(text("""
            INSERT INTO compass_projection_events (
                projection_id, event_time, event_type, price, source, evidence_json
            )
            SELECT :projection_id, :event_time, :event_type, :price,
                   'compass_projection_resolver', CAST(:evidence AS JSONB)
            WHERE NOT EXISTS (
                SELECT 1 FROM compass_projection_events
                WHERE projection_id = :projection_id AND event_type = :event_type
            )
        """), {
            "projection_id": draft.projection_id,
            "event_time": event.at,
            "event_type": f"{event.kind}_TOUCHED",
            "price": event.price,
            "evidence": json.dumps({"rule": event.rule}, sort_keys=True),
        })

    if draft.first_barrier is None:
        db.execute(text("""
            INSERT INTO compass_projection_events (
                projection_id, event_time, event_type, price, source, evidence_json
            )
            SELECT :projection_id, :event_time, 'STALE_MARKED', NULL,
                   'compass_projection_resolver', CAST(:evidence AS JSONB)
            WHERE NOT EXISTS (
                SELECT 1 FROM compass_projection_events
                WHERE projection_id = :projection_id AND event_type = 'STALE_MARKED'
            )
        """), {
            "projection_id": draft.projection_id,
            "event_time": draft.resolved_at,
            "evidence": json.dumps({"reason_codes": draft.reason_codes}, sort_keys=True),
        })

    db.execute(text("""
        INSERT INTO compass_projection_resolutions (
            projection_id, outcome, first_barrier, first_barrier_at,
            first_barrier_price, max_favorable_excursion_pct,
            max_adverse_excursion_pct, time_to_confirmation_seconds,
            time_to_target_seconds, time_to_invalidation_seconds,
            reason_codes, observed_facts, interpretation,
            evaluator_version, policy_version, resolved_at
        ) VALUES (
            :projection_id, :outcome, :first_barrier, :first_barrier_at,
            :first_barrier_price, :mfe, :mae, :ttc, :ttt, :tti,
            CAST(:reason_codes AS JSONB), CAST(:observed_facts AS JSONB),
            :interpretation, :evaluator_version, :policy_version, :resolved_at
        )
        ON CONFLICT (projection_id) DO NOTHING
    """), {
        "projection_id": draft.projection_id,
        "outcome": draft.outcome,
        "first_barrier": draft.first_barrier,
        "first_barrier_at": draft.first_barrier_at,
        "first_barrier_price": draft.first_barrier_price,
        "mfe": draft.mfe_pct,
        "mae": draft.mae_pct,
        "ttc": draft.time_to_confirmation_seconds,
        "ttt": draft.time_to_target_seconds,
        "tti": draft.time_to_invalidation_seconds,
        "reason_codes": json.dumps(draft.reason_codes, sort_keys=True),
        "observed_facts": json.dumps(draft.observed_facts, sort_keys=True, default=str),
        "interpretation": draft.interpretation,
        "evaluator_version": EVALUATOR_VERSION,
        "policy_version": POLICY_VERSION,
        "resolved_at": draft.resolved_at,
    })

    db.execute(text("""
        UPDATE compass_projection_contracts
        SET status = :status
        WHERE projection_id = :projection_id
          AND status NOT IN ('RESOLVED', 'STALE')
    """), {"status": draft.new_status, "projection_id": draft.projection_id})


def _supersede_stale_actives(db) -> int:
    """
    Every contract except the newest one should not stay ACTIVE. Mark older
    ACTIVE contracts as SUPERSEDED (they remain auditable and resolvable).
    """
    result = db.execute(text("""
        UPDATE compass_projection_contracts
        SET status = 'SUPERSEDED',
            superseded_at = NOW()
        WHERE status = 'ACTIVE'
          AND projection_id <> (
              SELECT projection_id FROM compass_projection_contracts
              ORDER BY active_from DESC LIMIT 1
          )
    """))
    return result.rowcount or 0


# ════════════════════════════════════════════════════════════════════════
# Main entrypoint
# ════════════════════════════════════════════════════════════════════════

async def resolve_pending(
    limit: int = 200,
    max_age_days: int = MAX_WINDOW_DAYS,
    dry_run: bool = False,
    verbose: bool = False,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    summary: dict[str, Any] = {"checked": 0, "resolved": 0, "still_pending": 0, "outcomes": {}, "superseded": 0}

    try:
        contracts = _fetch_unresolved(db, limit=limit, max_age_days=max_age_days)
        summary["checked"] = len(contracts)
        if not contracts:
            logger.info("No unresolved contracts found.")
            return summary

        earliest = min(c["active_from"] for c in contracts)
        if earliest.tzinfo is None:
            earliest = earliest.replace(tzinfo=timezone.utc)

        cache = KlineCache()
        await cache.ensure(earliest, now)
        candles = cache.window(earliest, now)

        for contract in contracts:
            draft = evaluate_contract(contract, candles, now)
            if draft is None:
                summary["still_pending"] += 1
                if verbose:
                    logger.info("PENDING   %s (%s, active_from=%s)",
                                contract["projection_id"], contract["primary_bias"],
                                contract["active_from"])
                continue

            summary["resolved"] += 1
            summary["outcomes"][draft.outcome] = summary["outcomes"].get(draft.outcome, 0) + 1
            logger.info(
                "%s %s -> %s (barrier=%s at %s, mfe=%s%%, mae=%s%%)%s",
                "DRY-RUN " if dry_run else "RESOLVED",
                draft.projection_id,
                draft.outcome,
                draft.first_barrier or "-",
                draft.first_barrier_at.isoformat() if draft.first_barrier_at else "-",
                draft.mfe_pct,
                draft.mae_pct,
                "" if not verbose else f" :: {draft.interpretation}",
            )
            if not dry_run:
                _persist_resolution(db, draft)

        if not dry_run:
            summary["superseded"] = _supersede_stale_actives(db)
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Resolver run failed")
        raise
    finally:
        db.close()

    logger.info(
        "Resolver summary: checked=%d resolved=%d pending=%d superseded=%d outcomes=%s",
        summary["checked"], summary["resolved"], summary["still_pending"],
        summary["superseded"], summary["outcomes"],
    )
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description="Compass 2.0 first-barrier projection resolver")
    parser.add_argument("--backfill", action="store_true",
                        help="Evaluate the full unresolved history (up to --max-age-days).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max contracts per run (default: 100, backfill: 1000).")
    parser.add_argument("--max-age-days", type=int, default=MAX_WINDOW_DAYS,
                        help=f"Ignore contracts older than this many days (default {MAX_WINDOW_DAYS}).")
    parser.add_argument("--dry-run", action="store_true", help="Evaluate without writing to the DB.")
    parser.add_argument("--verbose", action="store_true", help="Log every contract, including still-pending ones.")
    args = parser.parse_args()

    limit = args.limit if args.limit is not None else (1000 if args.backfill else 100)
    summary = asyncio.run(resolve_pending(
        limit=limit,
        max_age_days=args.max_age_days,
        dry_run=args.dry_run,
        verbose=args.verbose,
    ))
    print(json.dumps(summary, indent=2, default=str))
    raise SystemExit(0)


if __name__ == "__main__":
    cli()
