"""Canonical authenticated growth-milestone writer.

This deliberately does not replace the existing analytics stores. It records
only intent milestones that cannot be reconstructed from domain truth. Payment
rows, watchlists and acquisition columns remain authoritative.

The migration is explicit; this module never runs DDL in a request process.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Mapping, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("growth.measurement")


CLIENT_GROWTH_EVENTS = frozenset(
    {
        "proof_verified",
        "pricing_viewed",
        "plan_selected",
        "checkout_viewed",
        "wallet_address_copied",
        "payment_amount_copied",
        "transaction_submitted",
        "telegram_write_access_shown",
        "telegram_write_access_allowed",
        "telegram_write_access_cancelled",
    }
)

SERVER_GROWTH_EVENTS = frozenset(
    {
        "invoice_created",
        "payment_confirmed",
        "payment_verification_failed",
    }
)

ALL_GROWTH_EVENTS = CLIENT_GROWTH_EVENTS | SERVER_GROWTH_EVENTS

MAX_META_BYTES = 4096


def _clean(value: Optional[Any], max_len: int) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned[:max_len] if cleaned else None


def _meta_json(meta: Optional[Mapping[str, Any]]) -> str:
    payload = dict(meta or {})
    encoded = json.dumps(payload, default=str, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_META_BYTES:
        raise ValueError("growth event metadata is too large")
    return encoded


def record_growth_event(
    db: Session,
    *,
    user_id: int,
    event: str,
    event_id: Optional[str] = None,
    session_id: Optional[str] = None,
    source: Optional[str] = None,
    path: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[Any] = None,
    meta: Optional[Mapping[str, Any]] = None,
    occurred_at: Optional[datetime] = None,
    commit: bool = False,
) -> bool:
    """Insert one milestone. Returns False when event_id was already recorded.

    Callers own the surrounding transaction unless ``commit=True``. Server-side
    payment callers should write the milestone in the same transaction as the
    payment state transition whenever possible.
    """
    normalized_event = _clean(event, 64)
    if normalized_event not in ALL_GROWTH_EVENTS:
        raise ValueError(f"unsupported growth event: {normalized_event!r}")

    result = db.execute(
        text(
            """
            INSERT INTO growth_events
              (event_id, user_id, event, session_id, source, path,
               entity_type, entity_id, meta, occurred_at)
            VALUES
              (:event_id, :user_id, :event, :session_id, :source, :path,
               :entity_type, :entity_id, CAST(:meta AS jsonb),
               COALESCE(:occurred_at, now()))
            ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
            RETURNING id
            """
        ),
        {
            "event_id": _clean(event_id, 80),
            "user_id": int(user_id),
            "event": normalized_event,
            "session_id": _clean(session_id, 80),
            "source": _clean(source, 80),
            "path": _clean(path, 200),
            "entity_type": _clean(entity_type, 40),
            "entity_id": _clean(entity_id, 100),
            "meta": _meta_json(meta),
            "occurred_at": occurred_at,
        },
    ).scalar()
    if commit:
        db.commit()
    return result is not None


def record_growth_event_best_effort(db: Session, **kwargs: Any) -> bool:
    """Never break a product/payment flow because telemetry failed."""
    try:
        return record_growth_event(db, **kwargs)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception(
            "growth milestone write failed event=%s user=%s",
            kwargs.get("event"),
            kwargs.get("user_id"),
        )
        return False
