# backend/app/services/subscription_worker.py
"""
Subscription Background Worker
- Expire users whose subscription_expires_at has passed
- Expire pending payments past 24h window
- Runs every 5 minutes
"""
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import text
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

INTERVAL = 300  # 5 minutes


async def subscription_expiry_loop():
    """Check and expire subscriptions + payments"""
    logger.info(f"🔄 Subscription expiry worker started (interval: {INTERVAL}s)")
    await asyncio.sleep(10)

    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)

                # 1. Expire subscriber/premium users past their subscription_expires_at
                result = db.execute(
                    text("""
                        UPDATE users
                        SET role = 'free', updated_at = NOW()
                        WHERE role IN ('premium', 'subscriber')
                        AND subscription_expires_at IS NOT NULL
                        AND subscription_expires_at < :now
                    """),
                    {"now": now}
                )
                expired_users = result.rowcount

                # 2. Expire pending payments past their window
                result2 = db.execute(
                    text("""
                        UPDATE payments
                        SET status = 'expired', updated_at = NOW()
                        WHERE status = 'pending'
                        AND expires_at IS NOT NULL
                        AND expires_at < :now
                    """),
                    {"now": now}
                )
                expired_payments = result2.rowcount

                db.commit()

                if expired_users > 0 or expired_payments > 0:
                    logger.info(
                        f"♻️ Subscription worker: expired {expired_users} users, {expired_payments} payments"
                    )

            finally:
                db.close()

        except Exception as e:
            logger.error(f"❌ Subscription worker error: {e}")

        await asyncio.sleep(INTERVAL)


def start_subscription_worker():
    """Start the subscription expiry background task"""
    asyncio.ensure_future(subscription_expiry_loop())
    logger.info("✅ Subscription expiry worker scheduled")