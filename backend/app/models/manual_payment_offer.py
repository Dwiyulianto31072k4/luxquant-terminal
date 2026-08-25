# backend/app/models/manual_payment_offer.py
"""
A subscription an admin has recorded as paid, waiting for the payer to claim it.

Somebody pays in chat — wallet, Binance UID, bank transfer — and an admin
records it. Recording it directly grants access immediately, which means the
admin has to already know the payer's web account and pick it correctly. Get
that wrong and the subscription lands on a stranger.

An offer moves the last step to the person who actually paid: they open the
link while logged in, see exactly what they are about to receive, and accept.
The grant attaches to the account they are really using.

The token is a bearer credential — whoever holds the link can claim it. Four
things keep that honest: single use, an expiry, admin cancellation, and binding
to a `user_id` whenever the admin already knows the account.
"""
from datetime import datetime, timedelta, timezone
import secrets

from sqlalchemy import (
    Column, Integer, String, Text, Numeric, DateTime, ForeignKey,
)

from app.core.database import Base

# Long enough that guessing is not a threat model, short enough to paste into
# a chat message without wrapping.
TOKEN_BYTES = 32

# A link that lives forever is a subscription anyone who finds it can take.
# A week is long enough for someone who paid on a Friday night.
DEFAULT_TTL_DAYS = 7

STATUS_PENDING = "pending"
STATUS_CLAIMED = "claimed"
STATUS_CANCELLED = "cancelled"
STATUS_EXPIRED = "expired"


class ManualPaymentOffer(Base):
    __tablename__ = "manual_payment_offers"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    # NULL = any signed-in holder of the link may claim it. Set = only them.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=False)
    # NULL = follow the plan. Set for discounts and short trials, which no
    # plan row represents.
    duration_days = Column(Integer, nullable=True)

    # What was actually paid — negotiable, so not the plan's price.
    amount_usd = Column(Numeric(18, 2), nullable=False)

    method = Column(String(32), nullable=False)
    method_label = Column(String(64), nullable=True)
    reference = Column(String(128), nullable=True)
    paid_currency = Column(String(8), nullable=True)
    paid_amount = Column(Numeric(24, 8), nullable=True)
    fx_rate = Column(Numeric(24, 8), nullable=True)

    admin_note = Column(Text, nullable=False)

    status = Column(String(16), nullable=False, default=STATUS_PENDING)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    claimed_at = Column(DateTime(timezone=True), nullable=True)
    claimed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    @staticmethod
    def new_token() -> str:
        return secrets.token_urlsafe(TOKEN_BYTES)

    @staticmethod
    def default_expiry(ttl_days: int = DEFAULT_TTL_DAYS) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=ttl_days)

    @property
    def is_open(self) -> bool:
        """No bound account — any signed-in holder of the link can claim."""
        return self.user_id is None

    def claimable_reason(self, now: datetime = None) -> str | None:
        """Why this cannot be claimed, or None if it can.

        Returns the reason rather than a bare bool so the claim page can tell
        the user which of the four it is — 'already used' and 'expired' need
        different next steps from the reader.
        """
        now = now or datetime.now(timezone.utc)
        if self.status == STATUS_CLAIMED:
            return "already_claimed"
        if self.status == STATUS_CANCELLED:
            return "cancelled"
        if self.status == STATUS_EXPIRED or self.expires_at <= now:
            return "expired"
        if self.status != STATUS_PENDING:
            return "unavailable"
        return None
