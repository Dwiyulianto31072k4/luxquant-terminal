# backend/app/services/notification_worker.py
"""
LuxQuant Terminal - Notification Worker
Generates notifications from:
  1. channel_messages → price_pump, daily_results
  2. signals → BTCDOM calls only
  3. signal_updates + watchlist → TP/SL hit on watchlisted signals
  4. users → subscription expiry warnings
Runs as background loop inside FastAPI lifespan.
"""

import asyncio
import json
import time
import traceback
from datetime import datetime, timedelta
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.redis import cache_get, cache_set, is_redis_available


# ============================================
# NOTIFICATION GENERATOR
# ============================================

def generate_channel_message_notifications(db):
    """
    Check channel_messages for new price_pump and daily_results
    that haven't been converted to notifications yet.
    Uses source_type='channel_message' and source_id=channel_messages.id
    """
    created = 0

    # Get channel messages not yet converted to notifications
    rows = db.execute(text("""
        SELECT cm.id, cm.message_type, cm.pair, cm.percentage, cm.direction,
               cm.summary_data, cm.message_date
        FROM channel_messages cm
        WHERE cm.message_type IN ('price_pump', 'daily_results')
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.source_type = 'channel_message'
            AND n.source_id = CAST(cm.id AS TEXT)
        )
        ORDER BY cm.message_date ASC
    """)).fetchall()

    for r in rows:
        cm_id, msg_type, pair, pct, direction, summary_data, msg_date = r

        if msg_type == 'price_pump':
            dir_word = "surged" if direction == 'up' else "dropped"
            sign = "+" if pct and pct > 0 else ""
            title = f"{pair} Price Alert"
            body = f"{pair} price {dir_word} {sign}{pct}% in the last 15 minutes."
            data = {"pair": pair, "percentage": float(pct) if pct else None, "direction": direction}

        elif msg_type == 'daily_results':
            sd = summary_data if isinstance(summary_data, dict) else {}
            date_range = sd.get('date_range', '')
            total = sd.get('total_signals', 0)
            tp = sd.get('tp_count', 0)
            sl = sd.get('sl_count', 0)
            title = f"Daily Results {date_range}"
            body = f"{tp} TP hits, {sl} SL · {total} signals total"
            data = {"date_range": date_range, "total_signals": total, "tp_count": tp, "sl_count": sl}
        else:
            continue

        # Insert as broadcast (user_id=NULL → all users see it)
        db.execute(text("""
            INSERT INTO notifications (user_id, type, title, body, data, source_type, source_id, created_at)
            VALUES (NULL, :type, :title, :body, :data, 'channel_message', :source_id, :created_at)
        """), {
            "type": msg_type,
            "title": title,
            "body": body,
            "data": json.dumps(data),
            "source_id": str(cm_id),
            "created_at": msg_date or datetime.utcnow(),
        })
        created += 1

    if created > 0:
        db.commit()
    return created


def generate_btcdom_notifications(db):
    """
    Check for new BTCDOM signals that haven't been notified yet.
    Uses source_type='signal' and source_id=signal_id
    """
    created = 0

    rows = db.execute(text("""
        SELECT s.signal_id, s.pair, s.entry, s.risk_level, s.created_at
        FROM signals s
        WHERE s.pair LIKE 'BTCDOM%'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.source_type = 'signal'
            AND n.source_id = s.signal_id
            AND n.type = 'btcdom_call'
        )
        ORDER BY s.call_message_id ASC
    """)).fetchall()

    for r in rows:
        signal_id, pair, entry, risk_level, created_at = r

        entry_str = f"{float(entry):.2f}" if entry else "N/A"
        title = "BTCDOM Signal Called"
        body = f"BTC Dominance signal at entry {entry_str}. Risk: {risk_level or 'N/A'}. Check the action plan."
        data = {"signal_id": signal_id, "pair": pair, "entry": float(entry) if entry else None, "risk_level": risk_level}

        db.execute(text("""
            INSERT INTO notifications (user_id, type, title, body, data, source_type, source_id, created_at)
            VALUES (NULL, 'btcdom_call', :title, :body, :data, 'signal', :source_id, :created_at)
        """), {
            "title": title,
            "body": body,
            "data": json.dumps(data),
            "source_id": signal_id,
            "created_at": created_at or datetime.utcnow(),
        })
        created += 1

    if created > 0:
        db.commit()
    return created


def generate_watchlist_notifications(db):
    """
    Check for TP/SL hits on signals that are in any user's watchlist.
    Creates per-user notifications.
    Uses source_type='signal_update' and source_id='{signal_id}:{update_type}:{update_message_id}'
    """
    created = 0

    # Find signal_updates on watchlisted signals that haven't been notified
    rows = db.execute(text("""
        SELECT DISTINCT w.user_id, su.signal_id, su.update_type, su.price,
               su.update_message_id, su.update_at, s.pair
        FROM signal_updates su
        JOIN watchlist w ON w.signal_id = su.signal_id
        JOIN signals s ON s.signal_id = su.signal_id
        WHERE su.update_type IN ('tp1', 'tp2', 'tp3', 'tp4', 'sl')
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = w.user_id
            AND n.source_type = 'signal_update'
            AND n.source_id = CONCAT(su.signal_id, ':', su.update_type, ':', CAST(su.update_message_id AS TEXT))
        )
        ORDER BY su.update_at ASC
    """)).fetchall()

    for r in rows:
        user_id, signal_id, update_type, price, update_msg_id, update_at, pair = r

        is_sl = update_type == 'sl'
        tp_label = update_type.upper()
        price_str = f"${float(price):,.2f}" if price else ""

        if is_sl:
            title = f"SL Hit: {pair}"
            body = f"Stop loss triggered on your watchlisted {pair}" + (f" at {price_str}" if price_str else "")
        else:
            title = f"{tp_label} Hit: {pair}"
            body = f"{tp_label} reached on your watchlisted {pair}" + (f" at {price_str}" if price_str else "")

        data = {
            "signal_id": signal_id,
            "pair": pair,
            "update_type": update_type,
            "tp_level": update_type if not is_sl else None,
            "price": float(price) if price else None,
        }

        source_id = f"{signal_id}:{update_type}:{update_msg_id}"

        db.execute(text("""
            INSERT INTO notifications (user_id, type, title, body, data, source_type, source_id, created_at)
            VALUES (:user_id, 'watchlist_update', :title, :body, :data, 'signal_update', :source_id, :created_at)
        """), {
            "user_id": user_id,
            "title": title,
            "body": body,
            "data": json.dumps(data),
            "source_id": source_id,
            "created_at": update_at or datetime.utcnow(),
        })
        created += 1

    if created > 0:
        db.commit()
    return created


def generate_subscription_expiry_notifications(db):
    """
    Check users with subscription expiring in 7, 3, or 1 days.
    Only create one notification per user per threshold.
    Uses source_type='system' and source_id='sub_expiry:{user_id}:{days}'
    """
    created = 0
    now = datetime.utcnow()

    for days_left in [7, 3, 1]:
        target_date = now + timedelta(days=days_left)
        window_start = target_date - timedelta(hours=12)
        window_end = target_date + timedelta(hours=12)

        rows = db.execute(text("""
            SELECT u.id, u.username, u.subscription_expires_at
            FROM users u
            WHERE u.role IN ('subscriber', 'premium')
            AND u.subscription_expires_at BETWEEN :start AND :end
            AND NOT EXISTS (
                SELECT 1 FROM notifications n
                WHERE n.user_id = u.id
                AND n.source_type = 'system'
                AND n.source_id = CONCAT('sub_expiry:', CAST(u.id AS TEXT), ':', :days)
            )
        """), {
            "start": window_start,
            "end": window_end,
            "days": str(days_left),
        }).fetchall()

        for r in rows:
            user_id, username, expires_at = r

            title = "Subscription Expiring Soon"
            body = f"Your subscription expires in {days_left} day{'s' if days_left > 1 else ''}. Renew now to keep access."
            data = {"days_left": days_left, "expires_at": expires_at.isoformat() if expires_at else None}

            db.execute(text("""
                INSERT INTO notifications (user_id, type, title, body, data, source_type, source_id, created_at)
                VALUES (:user_id, 'sub_expiry', :title, :body, :data, 'system', :source_id, NOW())
            """), {
                "user_id": user_id,
                "title": title,
                "body": body,
                "data": json.dumps(data),
                "source_id": f"sub_expiry:{user_id}:{days_left}",
            })
            created += 1

    if created > 0:
        db.commit()
    return created


# ============================================
# CLEANUP OLD NOTIFICATIONS
# ============================================

def cleanup_old_notifications(db, max_age_days=30):
    """Delete notifications older than max_age_days"""
    result = db.execute(text("""
        DELETE FROM notifications
        WHERE created_at < NOW() - INTERVAL ':days days'
    """.replace(':days', str(max_age_days))))
    db.commit()
    return result.rowcount


# ============================================
# WORKER LOOP
# ============================================

async def notification_worker_loop():
    """
    Background worker that generates notifications.
    Runs every 60 seconds.
    """
    print("🔔 Notification worker started (interval: 60s)")
    await asyncio.sleep(10)  # Wait for other workers to init

    while True:
        try:
            db = SessionLocal()
            try:
                start = time.time()

                cm_count = generate_channel_message_notifications(db)
                btcdom_count = generate_btcdom_notifications(db)
                wl_count = generate_watchlist_notifications(db)
                sub_count = generate_subscription_expiry_notifications(db)

                total = cm_count + btcdom_count + wl_count + sub_count
                elapsed = round((time.time() - start) * 1000)

                if total > 0:
                    print(f"🔔 Notifications: +{total} new ({cm_count} channel, {btcdom_count} btcdom, {wl_count} watchlist, {sub_count} sub) in {elapsed}ms")

                # Cleanup every hour (check via Redis flag)
                if is_redis_available():
                    last_cleanup = cache_get("lq:notif:last_cleanup")
                    if not last_cleanup:
                        cleaned = cleanup_old_notifications(db, max_age_days=30)
                        if cleaned > 0:
                            print(f"🧹 Cleaned {cleaned} old notifications")
                        cache_set("lq:notif:last_cleanup", {"ts": time.time()}, ttl=3600)

            finally:
                db.close()

        except Exception as e:
            print(f"❌ Notification worker error: {type(e).__name__}: {e}")
            traceback.print_exc()

        await asyncio.sleep(60)


def start_notification_worker():
    """Register notification worker as background task"""
    loop = asyncio.get_event_loop()
    loop.create_task(notification_worker_loop())
    print("🔔 Notification worker registered (60s interval)")