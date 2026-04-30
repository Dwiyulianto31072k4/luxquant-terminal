"""
LuxQuant Terminal - Signal Journey Persistor
=============================================
Layer 4b: DB read/write functions untuk signal_journey table.

Pattern: SQLAlchemy 2.0 sync, mirroring app/services/enrichment_worker_v3.py style.
Reuses SessionLocal from app.core.database.

Functions:
  - fetch_signal_for_journey(session, signal_id) -> SignalRow
  - fetch_telegram_events(session, signal_id)    -> List[TelegramEvent]
  - fetch_existing_journey_meta(session, signal_id) -> Optional[dict]
  - upsert_journey(session, journey: dict)       -> None
  - list_signals_for_backfill(session, limit)    -> List[str]
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.journey_calculator import TelegramEvent
from app.services.journey_fetcher import derive_direction, parse_created_at, parse_update_at


log = logging.getLogger(__name__)


# ============================================================
# DATACLASSES
# ============================================================

@dataclass(frozen=True)
class SignalRow:
    """Subset of signals table relevant for journey computation."""
    signal_id: str
    pair: str
    direction: str          # derived from entry vs target1
    entry: float
    target1: Optional[float]
    target2: Optional[float]
    target3: Optional[float]
    target4: Optional[float]
    stop1: Optional[float]
    created_at: datetime    # parsed from TEXT column
    status: Optional[str]


@dataclass(frozen=True)
class JourneyMeta:
    """Lightweight metadata buat skip-if-fresh decision."""
    signal_id: str
    last_event_at: Optional[datetime]
    coverage_status: str
    computed_at: datetime


# ============================================================
# READ: fetch signal core data
# ============================================================

def fetch_signal_for_journey(session: Session, signal_id: str) -> Optional[SignalRow]:
    """
    Fetch 1 signal + derive direction.

    Returns None kalau signal tidak ditemukan, missing pair, missing entry,
    atau missing target1 (semua wajib buat compute journey).
    """
    row = session.execute(text("""
        SELECT signal_id, pair, entry, target1, target2, target3, target4,
               stop1, created_at, status
        FROM signals
        WHERE signal_id = :sid
        LIMIT 1
    """), {"sid": signal_id}).mappings().fetchone()

    if not row:
        log.debug(f"Signal not found: {signal_id}")
        return None

    if not row["pair"]:
        log.warning(f"Signal {signal_id} has no pair")
        return None

    if row["entry"] is None or row["entry"] <= 0:
        log.warning(f"Signal {signal_id} has invalid entry: {row['entry']}")
        return None

    if row["target1"] is None or row["target1"] <= 0:
        log.warning(f"Signal {signal_id} has invalid target1: {row['target1']}")
        return None

    try:
        created_at = parse_created_at(row["created_at"])
    except (ValueError, TypeError) as e:
        log.warning(f"Signal {signal_id} has unparseable created_at: {e}")
        return None

    try:
        direction = derive_direction(float(row["entry"]), float(row["target1"]))
    except ValueError as e:
        log.warning(f"Signal {signal_id} cannot derive direction: {e}")
        return None

    return SignalRow(
        signal_id=row["signal_id"],
        pair=row["pair"],
        direction=direction,
        entry=float(row["entry"]),
        target1=float(row["target1"]),
        target2=float(row["target2"]) if row["target2"] is not None else None,
        target3=float(row["target3"]) if row["target3"] is not None else None,
        target4=float(row["target4"]) if row["target4"] is not None else None,
        stop1=float(row["stop1"]) if row["stop1"] is not None else None,
        created_at=created_at,
        status=row["status"],
    )


# ============================================================
# READ: fetch telegram events (TP/SL announcements)
# ============================================================

def fetch_telegram_events(session: Session, signal_id: str) -> List[TelegramEvent]:
    """
    Fetch all signal_updates rows for a signal, parse timestamps,
    return DEDUPED & chronologically sorted TelegramEvent list.

    Dedupe rule: untuk pair (signal_id, update_type) yang muncul lebih dari sekali
    (e.g. kalau Telegram bot duplicate-broadcast atau retry insert dengan timestamp beda),
    keep yang paling AWAL — itu first announcement asli.

    Skip rows dengan unparseable update_at atau invalid update_type.
    """
    rows = session.execute(text("""
        SELECT update_type, update_at, price
        FROM signal_updates
        WHERE signal_id = :sid
        ORDER BY update_at
    """), {"sid": signal_id}).mappings().all()

    valid_types = {'tp1', 'tp2', 'tp3', 'tp4', 'sl'}
    # Dedupe: dict keyed by update_type, keep earliest only
    earliest_by_type: Dict[str, TelegramEvent] = {}

    for row in rows:
        update_type = (row["update_type"] or "").strip().lower()
        if update_type not in valid_types:
            log.debug(f"Skip unknown update_type for {signal_id}: {row['update_type']}")
            continue

        if row["price"] is None:
            log.debug(f"Skip {update_type} for {signal_id}: null price")
            continue

        try:
            ts = parse_update_at(row["update_at"])
        except (ValueError, TypeError) as e:
            log.debug(f"Skip {update_type} for {signal_id}: unparseable update_at: {e}")
            continue

        candidate = TelegramEvent(
            type=update_type,
            at=ts,
            price=float(row["price"]),
        )

        existing = earliest_by_type.get(update_type)
        if existing is None or candidate.at < existing.at:
            earliest_by_type[update_type] = candidate
        # else: keep existing (it's earlier)

    if len(earliest_by_type) < sum(1 for r in rows if (r["update_type"] or "").strip().lower() in valid_types):
        log.info(f"Deduped telegram events for {signal_id}: kept {len(earliest_by_type)} unique types")

    events = sorted(earliest_by_type.values(), key=lambda e: e.at)
    return events


# ============================================================
# READ: existing journey metadata (skip-if-fresh)
# ============================================================

def fetch_existing_journey_meta(session: Session, signal_id: str) -> Optional[JourneyMeta]:
    """
    Cek apakah journey row udah ada + return metadata buat freshness check.
    Returns None kalau belum ada.
    """
    row = session.execute(text("""
        SELECT signal_id, last_event_at, coverage_status, computed_at
        FROM signal_journey
        WHERE signal_id = :sid
        LIMIT 1
    """), {"sid": signal_id}).mappings().fetchone()

    if not row:
        return None

    return JourneyMeta(
        signal_id=row["signal_id"],
        last_event_at=row["last_event_at"],
        coverage_status=row["coverage_status"],
        computed_at=row["computed_at"],
    )


# ============================================================
# WRITE: UPSERT journey
# ============================================================

# All columns in signal_journey (in INSERT order)
JOURNEY_COLUMNS = [
    'signal_id', 'direction', 'computed_at', 'last_event_at',
    'data_source', 'kline_interval', 'swing_threshold_pct',
    'coverage_from', 'coverage_until', 'coverage_status',
    'events',
    'overall_mae_pct', 'overall_mae_at',
    'overall_mfe_pct', 'overall_mfe_at',
    'initial_mae_pct', 'initial_mae_at', 'initial_mae_before',
    'time_to_tp1_seconds', 'time_to_outcome_seconds',
    'pct_time_above_entry',
    'tp_then_sl', 'tps_hit_before_sl',
    'realized_outcome_pct', 'missed_potential_pct',
]

# Columns updated on conflict (everything except signal_id, which is the conflict key)
_UPDATE_COLUMNS = [c for c in JOURNEY_COLUMNS if c != 'signal_id']


def upsert_journey(session: Session, journey: Dict[str, Any]) -> None:
    """
    INSERT or UPDATE signal_journey row.

    Args:
        session: open SQLAlchemy session (caller manages commit/rollback)
        journey: dict matching signal_journey schema (output of compute_journey)

    Raises:
        ValueError kalau required fields missing.
        sqlalchemy.exc.IntegrityError kalau check constraint violated.
    """
    # Validate required fields
    required = {'signal_id', 'direction', 'data_source', 'coverage_from',
                'coverage_until', 'coverage_status', 'events'}
    missing = required - set(journey.keys())
    if missing:
        raise ValueError(f"Journey dict missing required fields: {missing}")

    # Serialize JSONB columns
    params = dict(journey)
    if 'events' in params and not isinstance(params['events'], str):
        params['events'] = json.dumps(params['events'], default=_json_default)
    if 'tps_hit_before_sl' in params and params['tps_hit_before_sl'] is not None:
        if not isinstance(params['tps_hit_before_sl'], str):
            params['tps_hit_before_sl'] = json.dumps(params['tps_hit_before_sl'])

    # Build placeholders & SET clause
    placeholders = ', '.join(f':{c}' for c in JOURNEY_COLUMNS)
    set_clause = ', '.join(f'{c} = EXCLUDED.{c}' for c in _UPDATE_COLUMNS)

    # Cast events & tps_hit_before_sl to JSONB explicitly
    # (Use CAST(:param AS jsonb) syntax — matches user's learning re: SQLAlchemy named param compat)
    sql = text(f"""
        INSERT INTO signal_journey ({', '.join(JOURNEY_COLUMNS)})
        VALUES ({_build_values_with_jsonb_casts()})
        ON CONFLICT (signal_id) DO UPDATE SET
            {set_clause}
    """)

    session.execute(sql, params)


def _build_values_with_jsonb_casts() -> str:
    """
    Build VALUES clause where JSONB columns get CAST(:param AS jsonb).
    Other columns just use :param.
    """
    jsonb_cols = {'events', 'tps_hit_before_sl'}
    parts = []
    for c in JOURNEY_COLUMNS:
        if c in jsonb_cols:
            parts.append(f'CAST(:{c} AS jsonb)')
        else:
            parts.append(f':{c}')
    return ', '.join(parts)


def _json_default(obj):
    """JSON serializer untuk datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Cannot serialize {type(obj).__name__}")


# ============================================================
# READ: list signals for backfill
# ============================================================

def list_signals_for_backfill(
    session: Session,
    limit: Optional[int] = None,
    skip_existing: bool = True,
) -> List[str]:
    """
    List signal_ids yang eligible buat journey computation:
      - Has at least 1 signal_update (gak bener-bener "open")
      - Has valid pair, entry, target1, created_at
      - Optionally skip yang udah punya journey row

    Args:
        skip_existing: kalau True, skip signals yang udah ada di signal_journey

    Returns:
        List of signal_id strings, sorted by created_at DESC (newest first).
    """
    skip_clause = """
        AND s.signal_id NOT IN (SELECT signal_id FROM signal_journey)
    """ if skip_existing else ""

    limit_clause = f"LIMIT {int(limit)}" if limit else ""

    sql = text(f"""
        SELECT DISTINCT s.signal_id, s.created_at
        FROM signals s
        INNER JOIN signal_updates u ON u.signal_id = s.signal_id
        WHERE s.pair IS NOT NULL
          AND s.entry IS NOT NULL AND s.entry > 0
          AND s.target1 IS NOT NULL AND s.target1 > 0
          AND s.created_at IS NOT NULL
          {skip_clause}
        ORDER BY s.created_at DESC
        {limit_clause}
    """)

    rows = session.execute(sql).mappings().all()
    return [r["signal_id"] for r in rows]
