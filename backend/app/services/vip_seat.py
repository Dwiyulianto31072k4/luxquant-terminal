"""Take the VIP seat back when a Telegram account stops being the paying one.

The group IS the product: an account sitting in it receives every call. But
access is attached to a LuxQuant ACCOUNT, and the two come apart the moment
somebody swaps Telegram accounts — they unlink the old one, link the new one,
and the old account keeps its seat with no row pointing at it any more.

The subscription worker cannot close that hole: every query it runs starts at
`users`, and after an unlink no row holds that Telegram id. So it was never
kicked, never expired, and kept receiving VIP signals for free — for as long as
the group existed. This module is the other half: whenever an id is DETACHED
from an account, we ask whether anyone entitled still owns it, and if nobody
does, the seat goes back.

Rules it keeps:
  • Never kick an id that another account with live access still owns — two
    LuxQuant rows can legitimately point at one person.
  • Never act on a Telegram API failure. `is_in_group` returning None means we
    do not know; guessing would throw a paying member out of the group.
  • Never raise into a request. Losing a seat back is worth a log line, never
    a failed unlink.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# A seat we could not take back yet, because Telegram did not answer or refused.
# Without this the attempt is simply lost and the account keeps the seat for
# good — the exact failure this module exists to prevent, one layer up.
PENDING_KEY = "lq:vip-seat:pending"
MAX_TRIES = 24  # ~a day of worker cycles before we stop asking and log it

# The one definition of "this account has access", shared with
# subscription_worker — two copies of this predicate is how a desk ends up
# kicking people it still bills.
ACTIVE_ACCESS_SQL = """(
    role = 'admin'
    OR (role IN ('premium', 'subscriber')
        AND (subscription_expires_at IS NULL OR subscription_expires_at > :now))
)"""

MSG_SEAT_MOVED = (
    "👋 This Telegram account was removed from the LuxQuant VIP group.\n\n"
    "Your LuxQuant access now sits on a different Telegram account, and a seat "
    "belongs to the account that holds the subscription.\n\n"
    "Nothing was lost — sign in at luxquant.tw and open the VIP group from there "
    "to get an invite for the account you use now."
)

# What happened, in one word. Returned so a caller can log or test it without
# reading the logs.
KICKED = "kicked"
STILL_ENTITLED = "still-entitled"
NOT_IN_GROUP = "not-in-group"
UNKNOWN = "unknown"
FAILED = "failed"
SKIPPED = "skipped"


def _remember(telegram_id: int, reason: str) -> None:
    try:
        r = get_redis()
        raw = r.hget(PENDING_KEY, str(telegram_id))
        tries = (json.loads(raw).get("tries", 0) + 1) if raw else 1
        r.hset(
            PENDING_KEY,
            str(telegram_id),
            json.dumps({"reason": reason, "tries": tries, "at": datetime.now(timezone.utc).isoformat()}),
        )
    except Exception as exc:
        logger.warning("vip_seat: could not queue retry for %s: %s", telegram_id, exc)


def _forget(telegram_id: int) -> None:
    try:
        get_redis().hdel(PENDING_KEY, str(telegram_id))
    except Exception:
        pass


def _owner_with_access(db: Session, telegram_id: int) -> int | None:
    """The id of an account that still holds this Telegram AND has access."""
    row = db.execute(
        text(
            f"""
            SELECT id FROM users
            WHERE telegram_id = :tg AND {ACTIVE_ACCESS_SQL}
            LIMIT 1
            """
        ),
        {"tg": telegram_id, "now": datetime.now(timezone.utc)},
    ).first()
    return row[0] if row else None


def _is_legacy_member(db: Session, telegram_id: int) -> bool:
    """Grandfathered: a Telegram account from the pre-webapp group holds its seat
    by right, with or without a LuxQuant row behind it.

    Without this check the feature eats its own members: somebody from the old
    group links a web account, later swaps Telegram, and the id we detach is one
    that was entitled on its own terms the whole time. `revoked` is the admin's
    way of saying that right is over, so only a live row counts."""
    row = db.execute(
        text(
            """
            SELECT 1 FROM legacy_members
            WHERE telegram_id = :tg AND revoked IS NOT TRUE
            LIMIT 1
            """
        ),
        {"tg": telegram_id},
    ).first()
    return row is not None


async def release_seat(
    db: Session,
    telegram_id: int | None,
    *,
    reason: str,
    notify: bool = True,
    queue: bool = True,
) -> str:
    """Remove a detached Telegram account from the VIP group.

    Call it AFTER the commit that detached the id, so the entitlement check
    reads the world as it now is. Returns one of the module's outcome words and
    never raises.
    """
    try:
        tg = int(telegram_id or 0)
    except (TypeError, ValueError):
        tg = 0
    if not tg:
        return SKIPPED

    try:
        owner = _owner_with_access(db, tg)
    except Exception as exc:  # a broken query must not break an unlink
        logger.warning("vip_seat: entitlement check failed for %s: %s", tg, exc)
        return UNKNOWN
    if owner:
        logger.info("vip_seat: %s kept — user %s still has access", tg, owner)
        _forget(tg)
        return STILL_ENTITLED

    try:
        legacy = _is_legacy_member(db, tg)
    except Exception as exc:
        logger.warning("vip_seat: legacy check failed for %s: %s", tg, exc)
        return UNKNOWN
    if legacy:
        logger.info("vip_seat: %s kept — grandfathered legacy member", tg)
        _forget(tg)
        return STILL_ENTITLED

    from app.services.telegram_group import is_in_group, kick_member, send_dm

    try:
        present = await is_in_group(tg)
    except Exception as exc:
        logger.warning("vip_seat: membership check failed for %s: %s", tg, exc)
        return UNKNOWN
    if present is None:
        # Telegram did not answer. Say nothing rather than guess — and come back
        # to it, because an id nobody owns is a seat nobody pays for.
        if queue:
            _remember(tg, reason)
        return UNKNOWN
    if not present:
        _forget(tg)
        return NOT_IN_GROUP

    try:
        ok = await kick_member(tg)
    except Exception as exc:
        logger.warning("vip_seat: kick failed for %s: %s", tg, exc)
        return FAILED
    if not ok:
        if queue:
            _remember(tg, reason)
        return FAILED

    _forget(tg)
    logger.warning("vip_seat: removed telegram_id=%s from VIP group — %s", tg, reason)
    if notify:
        try:
            await send_dm(tg, MSG_SEAT_MOVED)
        except Exception:
            pass  # the seat is what matters; the courtesy note is best-effort
    return KICKED


async def release_seat_bounded(
    db: Session,
    telegram_id: int | None,
    *,
    reason: str,
    budget: float = 8.0,
) -> str:
    """release_seat with a clock on it, for the request path.

    Taking a seat back is up to four Telegram calls, each with its own ten
    second timeout — a bad minute at Telegram would otherwise be a forty second
    unlink for the person sitting in front of the app. The queue is what makes
    this safe: whatever the clock cuts short, the worker finishes later.
    """
    try:
        return await asyncio.wait_for(
            release_seat(db, telegram_id, reason=reason), timeout=budget
        )
    except asyncio.TimeoutError:
        tg = int(telegram_id or 0)
        if tg:
            _remember(tg, reason)
        logger.warning("vip_seat: %s took too long, queued for the worker", tg)
        return UNKNOWN
    except Exception as exc:  # nothing here may break an unlink
        logger.warning("vip_seat: release failed for %s: %s", telegram_id, exc)
        return UNKNOWN


async def retry_pending(db: Session, *, limit: int = 25) -> dict:
    """Work the queue of seats we could not take back at the time.

    Runs inside the subscription worker's cycle, where a Telegram outage that
    lasted through one request has long since ended. Gives up after MAX_TRIES so
    a permanently odd id (deleted account, bot demoted) cannot spin for ever —
    it leaves a log line instead, which is a thing a human can act on.
    """
    try:
        raw = get_redis().hgetall(PENDING_KEY) or {}
    except Exception:
        return {}
    if not raw:
        return {}

    out = {"tried": 0, "kicked": 0, "dropped": 0, "left": 0}
    for key, value in list(raw.items())[:limit]:
        tg_key = key.decode() if isinstance(key, bytes) else key
        try:
            meta = json.loads(value.decode() if isinstance(value, bytes) else value)
        except Exception:
            meta = {}
        tries = int(meta.get("tries") or 0)
        if tries >= MAX_TRIES:
            logger.error(
                "vip_seat: giving up on telegram_id=%s after %s tries — still in the VIP group",
                tg_key,
                tries,
            )
            _forget(tg_key)
            out["dropped"] += 1
            continue

        out["tried"] += 1
        outcome = await release_seat(db, tg_key, reason=meta.get("reason") or "retry")
        if outcome == KICKED:
            out["kicked"] += 1
        elif outcome in (UNKNOWN, FAILED):
            out["left"] += 1
    return out


def note_on_user(user, telegram_id: int, outcome: str, reason: str) -> None:
    """Leave the trail on the account that gave the id up, in the same field
    identity transfers already write to, so support sees one history."""
    if outcome not in (KICKED, FAILED):
        return
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    said = "dikeluarkan dari VIP group" if outcome == KICKED else "GAGAL dikeluarkan dari VIP group"
    line = f"[{stamp}] Telegram {telegram_id} {said} ({reason})."
    try:
        user.admin_notes = f"{(user.admin_notes or '').rstrip()}\n{line}".strip()
    except Exception:
        pass
