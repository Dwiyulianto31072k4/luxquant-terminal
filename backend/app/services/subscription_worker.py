# backend/app/services/subscription_worker.py
"""
Subscription Background Worker
- Expire users whose subscription_expires_at has passed (role -> free)
- Manage Telegram VIP grace period + auto-kick after grace
- Expire pending payments past their window
- Runs every 5 minutes

Telegram VIP lifecycle on expiry:
  T+0  (just expired)      : role -> free, set grace deadline (now + GRACE_DAYS),
                             send DM reminder #1 (best-effort)
  T+(GRACE-1d)             : send DM reminder #2 (best-effort, final warning)
  T>=grace_until           : kick from group (if still inside), clear grace

Lifetime / legacy (subscription_expires_at IS NULL) is never touched.

Single-flight: uvicorn jalanin 4 worker process, masing-masing register loop ini.
Untuk hindari DM/kick dobel, tiap cycle ambil Redis lock (SET NX EX) — hanya
process pemegang lock yang jalanin cycle. Kalau Redis down, lock di-skip dan
semua process jalan (fallback aman: expiry tetap idempoten).
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.redis import get_redis, is_redis_available
from app.services.telegram_group import is_in_group, kick_member, send_dm

logger = logging.getLogger(__name__)

INTERVAL = 300  # 5 minutes
GRACE_DAYS = int(os.getenv("VIP_GRACE_DAYS", "3"))
SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://luxquant.tw")

# Window (in hours) before kick to send the final reminder.
FINAL_REMINDER_BEFORE_HOURS = 24

# Single-flight lock — TTL lebih pendek dari INTERVAL biar lepas sebelum cycle berikut.
LOCK_KEY = "lq:subworker:lock"
LOCK_TTL = INTERVAL - 60  # 240s

MSG_EXPIRED = (
    "Your LuxQuant subscription has ended.\n\n"
    f"Renew within {GRACE_DAYS} days to keep your spot in the VIP group.\n"
    f"Renew here: {SITE_URL}"
)
MSG_FINAL = (
    "Final reminder: you'll be removed from the LuxQuant VIP group within 24 hours "
    "unless you renew your subscription.\n"
    f"Renew here: {SITE_URL}"
)
MSG_KICKED = (
    "You've been removed from the LuxQuant VIP group because your subscription ended. "
    f"Renew anytime to rejoin: {SITE_URL}"
)


def _acquire_cycle_lock() -> bool:
    """True kalau process ini boleh jalanin cycle.

    Pakai Redis SET NX EX. Kalau Redis ga available, return True (fallback:
    semua process jalan — expiry tetap idempoten, paling DM bisa dobel).
    """
    if not is_redis_available():
        return True
    try:
        client = get_redis()
        # nx=True: hanya set kalau belum ada. ex=LOCK_TTL: auto-expire.
        got = client.set(LOCK_KEY, str(os.getpid()), nx=True, ex=LOCK_TTL)
        return bool(got)
    except Exception as e:
        logger.warning(f"Sub worker lock error (fallback to run): {e}")
        return True


async def _expire_and_start_grace(db, now):
    """T+0: users yang baru expired -> free + set grace + DM reminder #1."""
    rows = db.execute(
        text("""
            SELECT id, telegram_id, telegram_in_group
            FROM users
            WHERE role IN ('premium', 'subscriber')
              AND subscription_expires_at IS NOT NULL
              AND subscription_expires_at < :now
        """),
        {"now": now},
    ).fetchall()

    if not rows:
        return 0

    grace_until = now + timedelta(days=GRACE_DAYS)
    ids = [r.id for r in rows]

    db.execute(
        text("""
            UPDATE users
            SET role = 'free',
                subscription_source = NULL,
                telegram_grace_until = CASE
                    WHEN telegram_in_group = TRUE THEN CAST(:grace AS timestamptz)
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE id = ANY(:ids)
        """),
        {"grace": grace_until, "ids": ids},
    )
    db.commit()

    for r in rows:
        if r.telegram_in_group and r.telegram_id:
            try:
                await send_dm(r.telegram_id, MSG_EXPIRED)
            except Exception as e:
                logger.warning(f"DM reminder#1 failed for user {r.id}: {e}")

    return len(ids)


async def _send_final_reminders(db, now):
    """Kirim reminder #2 buat user yang mendekati deadline kick (best-effort)."""
    threshold = now + timedelta(hours=FINAL_REMINDER_BEFORE_HOURS)
    rows = db.execute(
        text("""
            SELECT id, telegram_id
            FROM users
            WHERE telegram_grace_until IS NOT NULL
              AND telegram_grace_until > :now
              AND telegram_grace_until <= :threshold
              AND telegram_in_group = TRUE
              AND telegram_id IS NOT NULL
        """),
        {"now": now, "threshold": threshold},
    ).fetchall()

    sent = 0
    for r in rows:
        try:
            ok = await send_dm(r.telegram_id, MSG_FINAL)
            if ok:
                sent += 1
        except Exception as e:
            logger.warning(f"DM final reminder failed for user {r.id}: {e}")
    return sent


async def _kick_past_grace(db, now):
    """T>=grace_until: kick dari group kalau masih di dalam, lalu clear grace."""
    rows = db.execute(
        text("""
            SELECT id, telegram_id
            FROM users
            WHERE telegram_grace_until IS NOT NULL
              AND telegram_grace_until <= :now
              AND telegram_in_group = TRUE
              AND telegram_id IS NOT NULL
        """),
        {"now": now},
    ).fetchall()

    kicked = 0
    for r in rows:
        present = await is_in_group(r.telegram_id)
        if present is None:
            # API gagal — jangan ambil keputusan, retry cycle berikutnya.
            continue

        if present:
            ok = await kick_member(r.telegram_id)
            if not ok:
                continue
            try:
                await send_dm(r.telegram_id, MSG_KICKED)
            except Exception:
                pass
            kicked += 1

        db.execute(
            text("""
                UPDATE users
                SET telegram_in_group = FALSE,
                    telegram_grace_until = NULL,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": r.id},
        )
        db.commit()

    return kicked


# Max membership checks per cycle (rate-limit safety).
RECONCILE_CAP = 40


async def _reconcile_in_group(db, now):
    """Fix stale telegram_in_group flags.

    Targets users who *should* be in the group (active access + linked TG)
    but are flagged as outside — they may have joined via invite link without
    re-logging into the web app. Re-checks actual membership and flips the
    flag to TRUE when they're really inside.

    Capped + throttled to stay well under Telegram rate limits.
    """
    rows = db.execute(
        text("""
            SELECT id, telegram_id
            FROM users
            WHERE telegram_in_group = FALSE
              AND telegram_id IS NOT NULL
              AND (
                role = 'admin'
                OR (role IN ('premium', 'subscriber')
                    AND (subscription_expires_at IS NULL
                         OR subscription_expires_at > :now))
              )
            ORDER BY updated_at ASC NULLS FIRST
            LIMIT :cap
        """),
        {"now": now, "cap": RECONCILE_CAP},
    ).fetchall()

    fixed = 0
    for r in rows:
        present = await is_in_group(r.telegram_id)
        if present is None:
            # API failure — skip, retry next cycle.
            await asyncio.sleep(0.3)
            continue
        if present:
            db.execute(
                text("""
                    UPDATE users
                    SET telegram_in_group = TRUE,
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {"id": r.id},
            )
            db.commit()
            fixed += 1
        await asyncio.sleep(0.3)

    return fixed


async def subscription_expiry_loop():
    """Check and expire subscriptions + manage VIP grace/kick + payments."""
    print(
        f"🔄 Subscription worker loop running (interval: {INTERVAL}s, grace: {GRACE_DAYS}d)"
    )
    await asyncio.sleep(10)

    while True:
        try:
            # Single-flight: hanya 1 process per cycle (kalau Redis up).
            if not _acquire_cycle_lock():
                await asyncio.sleep(INTERVAL)
                continue

            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)

                expired = await _expire_and_start_grace(db, now)
                reminded = await _send_final_reminders(db, now)
                kicked = await _kick_past_grace(db, now)
                reconciled = await _reconcile_in_group(db, now)

                result_pay = db.execute(
                    text("""
                        UPDATE payments
                        SET status = 'expired', updated_at = NOW()
                        WHERE status = 'pending'
                          AND expires_at IS NOT NULL
                          AND expires_at < :now
                    """),
                    {"now": now},
                )
                expired_payments = result_pay.rowcount
                db.commit()

                if expired or kicked or reminded or expired_payments or reconciled:
                    logger.info(
                        f"♻️ Subscription worker: expired {expired} users, "
                        f"reminded {reminded}, kicked {kicked}, "
                        f"reconciled {reconciled} in-group, "
                        f"expired {expired_payments} payments"
                    )
            finally:
                db.close()

        except Exception as e:
            logger.error(f"❌ Subscription worker error: {e}")

        await asyncio.sleep(INTERVAL)


def start_subscription_worker():
    """Register the subscription expiry + VIP grace/kick background task."""
    loop = asyncio.get_event_loop()
    loop.create_task(subscription_expiry_loop())
    print(f"🔄 Subscription worker registered (interval: {INTERVAL}s, grace: {GRACE_DAYS}d)")
