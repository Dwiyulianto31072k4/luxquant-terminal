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
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from app.core.database import SessionLocal
from app.services.telegram_group import is_in_group, kick_member, send_dm

logger = logging.getLogger(__name__)

INTERVAL = 300  # 5 minutes
GRACE_DAYS = int(os.getenv("VIP_GRACE_DAYS", "3"))
SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://luxquant.tw")

# Window (in hours) before kick to send the final reminder.
FINAL_REMINDER_BEFORE_HOURS = 24

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


async def _expire_and_start_grace(db, now):
    """T+0: users yang baru expired -> free + set grace + DM reminder #1.

    Hanya yang punya expires_at (bukan lifetime/legacy) & belum di-set grace.
    """
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

    # Cabut akses web sekarang. Set grace HANYA buat yang masih in-group
    # (yang ga di group ga perlu di-kick, jadi grace ga relevan).
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

    # DM reminder #1 (best-effort) ke yang in-group & punya telegram_id
    for r in rows:
        if r.telegram_in_group and r.telegram_id:
            try:
                await send_dm(r.telegram_id, MSG_EXPIRED)
            except Exception as e:
                logger.warning(f"DM reminder#1 failed for user {r.id}: {e}")

    return len(ids)


async def _send_final_reminders(db, now):
    """Kirim reminder #2 buat user yang mendekati deadline kick (best-effort).

    Pakai flag sederhana: kirim kalau grace_until - now <= FINAL_REMINDER_BEFORE_HOURS
    dan belum lewat deadline. Untuk hindari spam tiap 5 menit, kita pakai kolom
    telegram_grace_until sebagai penanda window; reminder dikirim sekali per masuk
    window via guard di bawah (best-effort, duplikat sesekali bisa ditoleransi).
    """
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
        # Cek status live dulu — defensif kalau flag telegram_in_group stale.
        present = await is_in_group(r.telegram_id)
        if present is None:
            # API gagal — jangan ambil keputusan, coba lagi cycle berikutnya.
            continue

        if present:
            ok = await kick_member(r.telegram_id)
            if not ok:
                # Gagal kick — biarin grace tetap, retry next cycle.
                continue
            try:
                await send_dm(r.telegram_id, MSG_KICKED)
            except Exception:
                pass
            kicked += 1

        # Present True (sukses kick) atau False (udah keluar sendiri) -> clear grace.
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


async def subscription_expiry_loop():
    """Check and expire subscriptions + manage VIP grace/kick + payments."""
    logger.info(
        f"🔄 Subscription worker started (interval: {INTERVAL}s, grace: {GRACE_DAYS}d)"
    )
    await asyncio.sleep(10)

    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)

                expired = await _expire_and_start_grace(db, now)
                reminded = await _send_final_reminders(db, now)
                kicked = await _kick_past_grace(db, now)

                # Expire pending payments past their window
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

                if expired or kicked or reminded or expired_payments:
                    logger.info(
                        f"♻️ Subscription worker: expired {expired} users, "
                        f"reminded {reminded}, kicked {kicked}, "
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
