# backend/app/services/subscription_worker.py
"""
Subscription Background Worker
- Expire users whose subscription_expires_at has passed (role -> free)
- Manage Telegram VIP grace period + auto-kick after grace
- Expire pending payments past their window
- Runs every 5 minutes

Before expiry:
  T-7d / T-3d / T-1d      : renewal reminder (in-app always, DM if linked).
                            Added 2026-08-08 — until then the first contact
                            a customer got was T+0, after access was cut.

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
from app.models.subscription import Payment
from app.models.workspace import AdminFollowup
from app.services.referral_service import refund_redemption
from app.services.notifier import create_notification, notification_exists
from app.services.telegram_group import is_in_group, kick_member, send_dm

logger = logging.getLogger(__name__)

INTERVAL = 300  # 5 minutes
GRACE_DAYS = int(os.getenv("VIP_GRACE_DAYS", "3"))
SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://luxquant.tw")

# A referee is considered churned once their subscription has been expired for
# this long without renewal.
CHURN_AFTER_DAYS = int(os.getenv("REFERRAL_CHURN_DAYS", "30"))

# Window (in hours) before kick to send the final reminder.
FINAL_REMINDER_BEFORE_HOURS = 24

# Open-invoice nudges, in HOURS OF INVOICE LEFT rather than hours elapsed, so
# they stay correct if the checkout window (currently 72h) is ever retuned.
#
# Placed against how people actually pay, not against the shape of the window:
# of 38 confirmed payments, 34 landed within 12 hours of the invoice being
# raised, 1 in the next 12, and NONE after 24 hours. The first version put two
# of its three nudges at T+48h and T+68h — squarely inside the dead zone.
#
# With a 72h window these now land at T+1h, T+6h, T+24h and T+68h: three inside
# the interval where the decision is actually made, plus one deadline notice.
CHECKOUT_MILESTONES = (4, 48, 66, 71)

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
# Before expiry. These ask while the customer still HAS the thing, which is the
# only moment renewing feels like continuity rather than repurchase.
RENEW_URL = f"{SITE_URL}/pricing"
CHECKOUT_URL = f"{SITE_URL}/payment"
RECOVERY_URL = f"{SITE_URL}/pricing?source=invoice_recovery"


def _hours_phrase(hours_left: float) -> str:
    if hours_left >= 47:
        return "in about 2 days"
    if hours_left >= 23:
        return "in about a day"
    if hours_left >= 2:
        return f"in about {int(round(hours_left))} hours"
    return "within the hour"


def _checkout_msg(plan_label: str, amount, hours_left: float) -> str:
    """Nudge for an invoice that was opened and never paid.

    The tone rule from the checkout rebuild holds: this must not read as an
    accusation. Nobody here has done anything wrong — they started something
    and did not finish, which is usually our problem, not theirs. So: state
    what is waiting, when it lapses, and how to finish. No "you failed to".
    """
    return (
        f"Your {plan_label} invoice is still open.\n\n"
        f"Amount: {amount} USDT\n"
        f"It expires {_hours_phrase(hours_left)}.\n\n"
        f"Finish here: {CHECKOUT_URL}\n\n"
        "Already sent it? Paste the transaction hash on that page and it will "
        "unlock straight away."
    )


def _expired_checkout_msg(plan_label: str, amount, recovery_url: str) -> str:
    return (
        f"Your {plan_label} invoice expired before payment was confirmed.\n\n"
        f"Previous amount: {amount} USDT\n"
        "No access was removed and no new charge was created.\n\n"
        f"Restart securely when you are ready: {recovery_url}"
    )


def _queue_payment_followup(db, row, now, reason: str) -> bool:
    """Create one human fallback for an expired high-intent checkout."""
    token = f"payment_id={row['id']}"
    exists = (
        db.query(AdminFollowup.id)
        .filter(
            AdminFollowup.user_id == row["user_id"],
            AdminFollowup.category == "payment",
            AdminFollowup.status.in_(("pending", "in_progress")),
            AdminFollowup.note.ilike(f"%{token}%"),
        )
        .first()
    )
    if exists:
        return False

    creator_id = db.execute(
        text("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    ).scalar()
    if not creator_id:
        logger.warning("Payment recovery follow-up skipped: no admin creator exists")
        return False

    db.add(
        AdminFollowup(
            user_id=row["user_id"],
            title=f"Recover expired {row['plan_label']} invoice #{row['id']}",
            note=(
                f"{token}; amount={row['amount']} USDT; reason={reason}. "
                "The automatic in-app recovery was created. Reach out once, "
                "without urgency or performance claims, if a contact channel is available."
            ),
            category="payment",
            due_date=now,
            priority="high",
            status="pending",
            created_by=creator_id,
        )
    )
    db.commit()
    return True


async def _send_expired_payment_recoveries(db, rows, now):
    """Recover only invoices that expired in this worker cycle.

    There is deliberately no historical blast. The notification source id and
    follow-up token are persistent idempotency guards across worker restarts.
    """
    result = {"notified": 0, "dm_sent": 0, "queued": 0}
    for row in rows:
        source_id = f"checkout:expired:{row['id']}"
        recovery_url = f"{RECOVERY_URL}&payment={row['id']}"
        try:
            if not notification_exists(db, type="checkout_expired", source_id=source_id):
                create_notification(
                    db,
                    type="checkout_expired",
                    title="Your invoice expired — restart when ready",
                    body=(
                        f"{row['plan_label']} — {row['amount']} USDT. "
                        "No new charge was created."
                    ),
                    data={"payment_id": row["id"], "recovery_url": recovery_url},
                    source_type="payment",
                    source_id=source_id,
                    user_id=row["user_id"],
                )
                result["notified"] += 1
        except Exception as exc:
            logger.warning("Expired checkout notification failed for payment %s: %s", row["id"], exc)
            db.rollback()

        dm_sent = False
        if row.get("telegram_id") and row.get("telegram_bot_started_at"):
            try:
                dm_sent = await send_dm(
                    row["telegram_id"],
                    _expired_checkout_msg(row["plan_label"], row["amount"], recovery_url),
                )
            except Exception as exc:
                logger.warning("Expired checkout DM failed for payment %s: %s", row["id"], exc)
        if dm_sent:
            result["dm_sent"] += 1
            continue

        reason = "telegram_not_ready" if not row.get("telegram_bot_started_at") else "dm_failed"
        try:
            if _queue_payment_followup(db, row, now, reason):
                result["queued"] += 1
        except Exception as exc:
            logger.warning("Payment recovery queue failed for payment %s: %s", row["id"], exc)
            db.rollback()

    return result

def _remaining_phrase(days_left: float) -> str:
    """How long is actually left, in the units a person would use."""
    if days_left < 1:
        hours = max(1, round(days_left * 24))
        return "in about 1 hour" if hours == 1 else f"in about {hours} hours"
    days = int(days_left) + (1 if days_left % 1 else 0)  # round up: 1.4 -> 2
    return "in 1 day" if days == 1 else f"in {days} days"


def _renew_msg(days_left: float) -> str:
    """The milestone decides WHEN we speak; the message states what is true.

    Sending "3 days left" to someone with 34 hours is a number the customer can
    check and find wrong — the most expensive kind of small error.
    """
    when = _remaining_phrase(days_left)
    if days_left < 1:
        return (
            f"Last day — your LuxQuant access ends {when}.\n\n"
            "Renew today to keep everything running without a break.\n\n"
            f"Renew here: {RENEW_URL}"
        )
    if days_left <= 3:
        return (
            f"Your LuxQuant subscription ends {when}.\n\n"
            "Renew now and your access simply continues. If you leave it, the VIP "
            "group and live levels close when it lapses.\n\n"
            f"Renew here: {RENEW_URL}"
        )
    return (
        f"Your LuxQuant access ends {when}.\n\n"
        "Renew any time before then and nothing changes — same VIP group, same "
        "terminal, no gap in your signals.\n\n"
        f"Renew here: {RENEW_URL}"
    )


MSG_KICKED = (
    "You've been removed from the LuxQuant VIP group because your subscription ended. "
    f"Renew anytime to rejoin: {SITE_URL}"
)

# SQL predicate: user currently HAS active access (admin, or premium/subscriber
# with lifetime `subscription_expires_at IS NULL` or a future expiry). Such users
# must NEVER receive expiry reminders or be kicked. Requires a :now bind param.
_ACTIVE_ACCESS = """(
    role = 'admin'
    OR (role IN ('premium', 'subscriber')
        AND (subscription_expires_at IS NULL OR subscription_expires_at > :now))
)"""


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


def _mark_final_reminder(user_id, grace_until) -> bool:
    """Dedup guard: return True only the FIRST time a final reminder should be
    sent for this user's current grace deadline. Prevents re-sending every cycle
    (the ~5-min spam). Keyed by (user, grace deadline) so a new grace period can
    remind again."""
    try:
        if not is_redis_available():
            return True  # fallback: allow (a rare dup beats silent failure)
        epoch = int(grace_until.timestamp()) if grace_until else 0
        key = f"lq:vip:finalrem:{user_id}:{epoch}"
        got = get_redis().set(key, "1", nx=True, ex=93600)  # ~26h
        return bool(got)
    except Exception:
        return True


async def _clear_stale_grace(db, now):
    """Self-heal the root cause: when a user renews or is upgraded (incl. to
    LIFETIME), their old `telegram_grace_until` was never cleared — so the
    reminder/kick logic kept treating them as expired. Clear grace for anyone who
    currently has active access."""
    res = db.execute(
        text(f"""
            UPDATE users
            SET telegram_grace_until = NULL, updated_at = NOW()
            WHERE telegram_grace_until IS NOT NULL
              AND {_ACTIVE_ACCESS}
        """),
        {"now": now},
    )
    db.commit()
    return res.rowcount


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
                subscription_tier = NULL,
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
        text(f"""
            SELECT id, telegram_id, telegram_grace_until
            FROM users
            WHERE telegram_grace_until IS NOT NULL
              AND telegram_grace_until > :now
              AND telegram_grace_until <= :threshold
              AND telegram_in_group = TRUE
              AND telegram_id IS NOT NULL
              AND NOT {_ACTIVE_ACCESS}
        """),
        {"now": now, "threshold": threshold},
    ).fetchall()

    sent = 0
    for r in rows:
        # Dedup: send the final reminder only ONCE per grace deadline.
        if not _mark_final_reminder(r.id, r.telegram_grace_until):
            continue
        try:
            ok = await send_dm(r.telegram_id, MSG_FINAL)
            if ok:
                sent += 1
        except Exception as e:
            logger.warning(f"DM final reminder failed for user {r.id}: {e}")
    return sent


def _mark_renewal_reminder(user_id, milestone, expires_at) -> bool:
    """True only the first time this milestone should fire for this expiry.

    Keyed on the expiry timestamp, so renewing re-arms all three milestones for
    the new period. TTL outlives the longest plan we sell.
    """
    try:
        if not is_redis_available():
            return True  # a rare duplicate beats silence
        epoch = int(expires_at.timestamp()) if expires_at else 0
        key = f"lq:renew:rem:{user_id}:{milestone}:{epoch}"
        return bool(get_redis().set(key, "1", nx=True, ex=60 * 60 * 24 * 45))
    except Exception:
        return True


def _mark_checkout_reminder(payment_id, milestone) -> bool:
    """True only the first time this milestone should fire for this invoice.

    Keyed on the invoice id, which is unique per checkout, so a customer who
    opens a second invoice gets its own three nudges and not a silent skip.
    TTL comfortably outlives the checkout window.
    """
    try:
        if not is_redis_available():
            return True  # a rare duplicate beats silence
        key = f"lq:checkout:rem:{payment_id}:{milestone}"
        return bool(get_redis().set(key, "1", nx=True, ex=60 * 60 * 24 * 14))
    except Exception:
        return True


async def _send_checkout_reminders(db, now):
    """Invoices that were opened and never paid, before they lapse.

    Today these are flipped to 'expired' in silence — the customer is never
    told the thing they started is about to close. That is the leak.

    Two exclusions, both deliberate:
      · `tx_hash IS NOT NULL` — they have already sent money and it has not
        confirmed. Telling that person "your invoice is still open" reads as
        being called a liar. It is a different problem and needs a human.
      · anyone who is already a subscriber — a second invoice left open by
        someone who paid on the first must not generate nagging.
    """
    sent = 0
    rows = db.execute(
        text("""
            SELECT p.id, p.user_id, p.expires_at,
                   COALESCE(p.final_amount, p.amount_usdt) AS amount,
                   COALESCE(pl.label, 'LuxQuant') AS plan_label,
                   u.telegram_id,
                   EXTRACT(epoch FROM (p.expires_at - :now)) / 3600.0 AS hours_left
            FROM payments p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN subscription_plans pl ON pl.id = p.plan_id
            WHERE p.status = 'pending'
              AND p.deleted_at IS NULL
              AND p.tx_hash IS NULL
              AND p.expires_at IS NOT NULL
              AND p.expires_at > :now
              AND NOT (u.role IN ('premium', 'subscriber')
                       AND (u.subscription_expires_at IS NULL
                            OR u.subscription_expires_at > :now))
        """),
        {"now": now},
    ).mappings().all()

    for r in rows:
        hours_left = float(r["hours_left"] or 0)
        # The milestone this invoice is currently in — one stage is ever
        # current, so an invoice opened with 5 hours left gets the last call
        # only, never a burst of all three.
        milestone = next((m for m in CHECKOUT_MILESTONES if hours_left <= m), None)
        if milestone is None:
            continue

        src = f"checkout:{r['id']}:{milestone}"
        amount = r["amount"]

        # In-app first: the only channel that reaches someone with no Telegram
        # link, and it survives a failed DM.
        try:
            if not notification_exists(db, type="checkout_pending", source_id=src):
                create_notification(
                    db,
                    type="checkout_pending",
                    title="Your invoice is still open",
                    body=(
                        f"{r['plan_label']} — {amount} USDT. "
                        f"It expires {_hours_phrase(hours_left)}."
                    ),
                    data={
                        "payment_id": r["id"],
                        "hours_left_milestone": milestone,
                        "checkout_url": CHECKOUT_URL,
                    },
                    source_type="payment",
                    source_id=src,
                    user_id=r["user_id"],
                )
        except Exception as e:
            logger.warning(f"Checkout notification failed for payment {r['id']}: {e}")
            db.rollback()

        if not r["telegram_id"]:
            continue
        if not _mark_checkout_reminder(r["id"], milestone):
            continue
        try:
            if await send_dm(r["telegram_id"], _checkout_msg(r["plan_label"], amount, hours_left)):
                sent += 1
        except Exception as e:
            logger.warning(f"Checkout DM failed for payment {r['id']}: {e}")

    return sent


async def _send_renewal_reminders(db, now):
    """7 / 3 / 1 days before expiry — the only contact that reaches a customer
    while they still have access.

    One pass over everyone inside the longest milestone, then each person is
    assigned the milestone they are currently in. An earlier version matched
    disjoint bands ((6,7], (2,3], (0,1]) and lost anyone who happened to sit in
    the gaps between them when a cycle ran.
    """
    sent = 0
    rows = db.execute(
        text("""
            SELECT id, username, telegram_id, subscription_expires_at,
                   EXTRACT(epoch FROM (subscription_expires_at - :now)) / 86400.0 AS days_left
            FROM users
            WHERE role IN ('premium', 'subscriber')
              AND subscription_expires_at IS NOT NULL
              AND subscription_expires_at > :now
              AND subscription_expires_at <= :now + make_interval(days => 7)
        """),
        {"now": now},
    ).mappings().all()

    for r in rows:
        days_left = float(r["days_left"] or 0)
        # The milestone the customer is currently in: 6.5 days -> 7, 2.5 -> 3,
        # 0.5 -> 1. Only one stage is ever current, so someone who subscribes
        # with two days left gets T-3 and then T-1, never a burst of all three.
        milestone = next((m for m in (1, 3, 7) if days_left <= m), None)
        if milestone is None:
            continue

        exp = r["subscription_expires_at"]
        src = f"renew:{r['id']}:{milestone}:{int(exp.timestamp()) if exp else 0}"

        # In-app first: it is the only channel that reaches someone with no
        # Telegram link, and it survives a failed DM.
        try:
            if not notification_exists(db, type="subscription_expiring", source_id=src):
                create_notification(
                    db,
                    type="subscription_expiring",
                    title=f"Your access ends {_remaining_phrase(days_left)}",
                    body=_renew_msg(days_left).split("\n\n")[1],
                    data={"milestone_days": milestone, "renew_url": RENEW_URL},
                    source_type="subscription",
                    source_id=src,
                    user_id=r["id"],
                )
        except Exception as e:
            logger.warning(f"Renewal notification failed for user {r['id']}: {e}")
            db.rollback()

        if not r["telegram_id"]:
            continue
        if not _mark_renewal_reminder(r["id"], milestone, exp):
            continue
        try:
            if await send_dm(r["telegram_id"], _renew_msg(days_left)):
                sent += 1
        except Exception as e:
            logger.warning(f"Renewal DM failed for user {r['id']}: {e}")

    return sent


async def _kick_past_grace(db, now):
    """T>=grace_until: kick dari group kalau masih di dalam, lalu clear grace."""
    rows = db.execute(
        text(f"""
            SELECT id, telegram_id
            FROM users
            WHERE telegram_grace_until IS NOT NULL
              AND telegram_grace_until <= :now
              AND telegram_in_group = TRUE
              AND telegram_id IS NOT NULL
              AND NOT {_ACTIVE_ACCESS}
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

                # Self-heal first: drop stale grace for anyone now active
                # (renewed / upgraded / lifetime) so they aren't reminded/kicked.
                unstuck = await _clear_stale_grace(db, now)

                renewals = await _send_renewal_reminders(db, now)
                checkout_nudges = await _send_checkout_reminders(db, now)
                expired = await _expire_and_start_grace(db, now)
                reminded = await _send_final_reminders(db, now)
                kicked = await _kick_past_grace(db, now)
                reconciled = await _reconcile_in_group(db, now)

                # Refund redeemed credit on invoices about to expire (before we
                # flip them to 'expired'). Otherwise the referee permanently
                # loses balance they already spent on an unpaid invoice.
                expiring_with_credit = (
                    db.query(Payment)
                    .filter(
                        Payment.status == "pending",
                        Payment.expires_at.isnot(None),
                        Payment.expires_at < now,
                        Payment.credit_redeemed > 0,
                    )
                    .all()
                )
                refunded_credit = 0
                for p in expiring_with_credit:
                    try:
                        if refund_redemption(db, p):
                            refunded_credit += 1
                    except Exception as e:
                        logger.warning(f"Credit refund failed for payment #{p.id}: {e}")
                if expiring_with_credit:
                    db.commit()

                # Capture only this cycle's genuinely recoverable checkout
                # intents before the status flip. Historical expired rows are
                # intentionally excluded so deployment cannot cause a blast.
                recovery_rows = db.execute(
                    text("""
                        SELECT p.id, p.user_id,
                               COALESCE(p.final_amount, p.amount_usdt) AS amount,
                               COALESCE(pl.label, 'LuxQuant') AS plan_label,
                               u.telegram_id, u.telegram_bot_started_at
                        FROM payments p
                        JOIN users u ON u.id = p.user_id
                        LEFT JOIN subscription_plans pl ON pl.id = p.plan_id
                        WHERE p.status = 'pending'
                          AND p.deleted_at IS NULL
                          AND p.expires_at IS NOT NULL
                          AND p.expires_at < :now
                          AND NOT (u.role IN ('premium', 'subscriber')
                                   AND (u.subscription_expires_at IS NULL
                                        OR u.subscription_expires_at > :now))
                          AND NOT EXISTS (
                            SELECT 1 FROM payments paid
                            WHERE paid.user_id = p.user_id
                              AND paid.deleted_at IS NULL
                              AND paid.status = 'confirmed'
                          )
                    """),
                    {"now": now},
                ).mappings().all()

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
                recovery = await _send_expired_payment_recoveries(db, recovery_rows, now)

                # Churn: referees whose subscription has been expired for longer
                # than CHURN_AFTER_DAYS without renewal. Reversible — a renewal
                # flips the ReferralUse back to 'subscribed' via commission hook.
                churn_cutoff = now - timedelta(days=CHURN_AFTER_DAYS)
                result_churn = db.execute(
                    text("""
                        UPDATE referral_uses
                        SET status = 'churned'
                        WHERE status = 'subscribed'
                          AND referred_id IN (
                            SELECT id FROM users
                            WHERE role = 'free'
                              AND subscription_expires_at IS NOT NULL
                              AND subscription_expires_at < :cutoff
                          )
                    """),
                    {"cutoff": churn_cutoff},
                )
                churned_refs = result_churn.rowcount
                db.commit()

                if (expired or kicked or reminded or expired_payments or reconciled
                        or unstuck or refunded_credit or churned_refs or checkout_nudges
                        or recovery["notified"] or recovery["dm_sent"] or recovery["queued"]):
                    logger.info(
                        f"♻️ Subscription worker: expired {expired} users, "
                        f"reminded {reminded}, kicked {kicked}, "
                        f"unstuck {unstuck} stale-grace, "
                        f"reconciled {reconciled} in-group, "
                        f"expired {expired_payments} payments, "
                        f"nudged {checkout_nudges} open invoices, "
                        f"recovery notified {recovery['notified']}, "
                        f"DM {recovery['dm_sent']}, queued {recovery['queued']}, "
                        f"refunded {refunded_credit} credit-invoices, "
                        f"churned {churned_refs} referrals"
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
