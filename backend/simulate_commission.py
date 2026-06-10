"""
Simulate payment confirmation for testing Layer 4 commission hook.

Usage: 
  cd /root/luxquant-terminal/backend
  ./venv/bin/python simulate_commission.py 32

Args:
  payment_id (positional): The pending payment to confirm.

What it does:
  1. Load Payment by ID
  2. Mark as confirmed (status, verified_at, wallet_from=SIMULATED)
  3. Upgrade user → subscriber + set subscription_expires_at + source=payment
  4. Call process_commission_for_payment → credits referrer + creates ledger
  5. Commit transaction
  6. Print full audit trail

What it SKIPS:
  - On-chain BSCScan verification (no real USDT moved)
  - bscscan_data dump (set to {"simulated": True})
"""
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Path setup
sys.path.insert(0, '/root/luxquant-terminal/backend')

from app.core.database import SessionLocal
from app.models.user import User
from app.models.subscription import Payment, SubscriptionPlan
from app.models.referral import ReferralUse, ReferralCode
from app.models.credit import CreditLedger
from app.services.commission_service import process_commission_for_payment


def simulate(payment_id: int):
    db = SessionLocal()

    try:
        # ── 1. Load payment ──
        payment = db.query(Payment).filter(Payment.id == payment_id).first()
        if not payment:
            print(f"❌ Payment #{payment_id} not found")
            return

        print("═" * 70)
        print("BEFORE")
        print("═" * 70)
        print(f"Payment #{payment.id}")
        print(f"  user_id={payment.user_id} plan_id={payment.plan_id}")
        print(f"  amount_usdt={payment.amount_usdt}")
        print(f"  discount_amount={payment.discount_amount}")
        print(f"  final_amount={payment.final_amount}")
        print(f"  referral_use_id={payment.referral_use_id}")
        print(f"  status={payment.status}")

        if payment.status == "confirmed":
            print(f"\n⚠️  Payment already confirmed. Skipping.")
            return

        # ── 2. Load user (referee) ──
        user = db.query(User).filter(User.id == payment.user_id).first()
        print(f"\nReferee user #{user.id}")
        print(f"  username={user.username}")
        print(f"  role={user.role}")
        print(f"  subscription_source={getattr(user, 'subscription_source', 'N/A')}")

        # ── 3. Load referral_use ──
        if payment.referral_use_id:
            use = db.query(ReferralUse).filter(ReferralUse.id == payment.referral_use_id).first()
            referrer = db.query(User).filter(User.id == use.referrer_id).first()

            print(f"\nReferralUse #{use.id}")
            print(f"  status={use.status}")
            print(f"  total_commission_earned={use.total_commission_earned}")
            print(f"  total_payments={use.total_payments}")

            print(f"\nReferrer user #{referrer.id}")
            print(f"  username={referrer.username}")
            print(f"  referral_credit_usdt={referrer.referral_credit_usdt}")
            print(f"  lifetime_credit_earned={referrer.lifetime_credit_earned}")
        else:
            print("\n⚠️  No referral_use_id linked to payment. Commission will skip.")
            referrer = None

        # ── 4. Mark payment as confirmed (simulated) ──
        print("\n" + "═" * 70)
        print("SIMULATING CONFIRMATION...")
        print("═" * 70)

        now = datetime.now(timezone.utc)
        payment.status = "confirmed"
        payment.verified_at = now
        payment.wallet_from = "0xSIMULATED_TEST_WALLET"
        payment.bscscan_data = {"simulated": True, "note": "Layer 4 commission hook test"}
        payment.tx_hash = f"0xSIMULATED_{payment.id}_{int(now.timestamp())}"

        # ── 5. Upgrade user ──
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.plan_id).first()

        user.role = "subscriber"
        user.subscription_granted_at = now
        if hasattr(user, "subscription_source"):
            user.subscription_source = "payment"

        if plan and plan.duration_days:
            user.subscription_expires_at = now + timedelta(days=plan.duration_days)
        else:
            user.subscription_expires_at = None

        user.subscription_note = f"Plan: {plan.label if plan else 'unknown'} (SIMULATED)"

        # ── 6. Trigger commission ──
        result = process_commission_for_payment(payment, db)

        # ── 7. Commit ──
        db.commit()
        db.refresh(payment)
        if referrer:
            db.refresh(referrer)
        if payment.referral_use_id:
            use = db.query(ReferralUse).filter(ReferralUse.id == payment.referral_use_id).first()

        # ── 8. Show after ──
        print("\n" + "═" * 70)
        print("AFTER")
        print("═" * 70)
        print(f"Payment #{payment.id}")
        print(f"  status={payment.status}")
        print(f"  verified_at={payment.verified_at}")
        print(f"  tx_hash={payment.tx_hash}")

        print(f"\nReferee user #{user.id}")
        print(f"  role={user.role}")
        print(f"  subscription_source={getattr(user, 'subscription_source', 'N/A')}")
        print(f"  subscription_expires_at={user.subscription_expires_at}")

        if referrer:
            print(f"\nReferrer user #{referrer.id} (yosua_b)")
            print(f"  referral_credit_usdt={referrer.referral_credit_usdt}")
            print(f"  lifetime_credit_earned={referrer.lifetime_credit_earned}")

            print(f"\nReferralUse #{use.id}")
            print(f"  status={use.status}")
            print(f"  total_commission_earned={use.total_commission_earned}")
            print(f"  total_payments={use.total_payments}")
            print(f"  last_payment_at={use.last_payment_at}")

            # Show ledger entry
            ledger = db.query(CreditLedger)\
                .filter(CreditLedger.ref_payment_id == payment.id)\
                .first()
            if ledger:
                print(f"\nCreditLedger #{ledger.id}")
                print(f"  user_id={ledger.user_id}")
                print(f"  type={ledger.type}")
                print(f"  amount={ledger.amount}")
                print(f"  balance_after={ledger.balance_after}")
                print(f"  note={ledger.note}")

        print("\n" + "═" * 70)
        if result:
            print(f"✅ COMMISSION CREDITED: +{result['commission_amount']} USDT to user #{result['referrer_id']}")
        else:
            print(f"⚠️  No commission credited (user not referred or already processed)")
        print("═" * 70)

    except Exception as e:
        db.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python simulate_commission.py <payment_id>")
        sys.exit(1)

    payment_id = int(sys.argv[1])
    simulate(payment_id)
