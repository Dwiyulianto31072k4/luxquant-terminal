# backend/app/models/user.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, BigInteger, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Auth provider
    auth_provider = Column(String(50), default="local")

    # Google OAuth
    google_id = Column(String(255), unique=True, nullable=True)
    avatar_url = Column(Text, nullable=True)

    # Telegram
    telegram_id = Column(BigInteger, unique=True, nullable=True, index=True)
    telegram_username = Column(String(100), nullable=True)
    # ─── Telegram VIP sync ───
    # Apakah user saat ini ada di VIP group (disinkron, BUKAN penentu akses)
    telegram_in_group = Column(Boolean, nullable=False, default=False)
    # Deadline kick dari group setelah subscription expired (grace period)
    telegram_grace_until = Column(DateTime(timezone=True), nullable=True)

    # ─── Discord OAuth ───
    discord_id = Column(BigInteger, unique=True, nullable=True, index=True)
    discord_username = Column(String(100), nullable=True)

    # Subscription
    role = Column(String(20), default="free", nullable=False)
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)
    subscription_granted_by = Column(Integer, nullable=True)
    subscription_granted_at = Column(DateTime(timezone=True), nullable=True)
    subscription_note = Column(Text, nullable=True)

    # ─── v2.1: Subscription source (cross-OAuth provider protection) ───
    # Values: lifetime | admin | payment | telegram_vip | discord_premium | legacy | NULL
    subscription_source = Column(String(30), nullable=True)

    # ─── Bot DM readiness ───
    # Set the first time the bot successfully DMs the user (which is only
    # possible after they've /started the bot). Lets admin tell apart
    # "linked Telegram" from "we can actually message them".
    telegram_bot_started_at = Column(DateTime(timezone=True), nullable=True)

    # ─── Admin enrichment (CRM-style, manually curated for outreach) ───
    admin_telegram_username = Column(String(100), nullable=True)
    admin_discord_handle = Column(String(100), nullable=True)
    admin_notes = Column(Text, nullable=True)
    admin_enriched_by = Column(Integer, nullable=True)
    admin_enriched_at = Column(DateTime(timezone=True), nullable=True)

    # ─── Referral (legacy fields, masih dipake buat backref cepat) ───
    referred_by = Column(Integer, nullable=True)
    referral_code_used = Column(String(20), nullable=True)

    # ─── Referral v2: Credit balance ───
    referral_credit_usdt = Column(Numeric(10, 2), default=0, nullable=False)
    lifetime_credit_earned = Column(Numeric(10, 2), default=0, nullable=False)

    # ─── Login tracking (untuk funnel analytics referrer) ───
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    first_login_at = Column(DateTime(timezone=True), nullable=True)
    login_count = Column(Integer, default=0, nullable=False)
    country_code = Column(String(2), nullable=True)
    currency_code = Column(String(3), default="USD", nullable=True)

    # ─── UI preferences (per-user, remembered client settings) ───
    # Flexible key-value bag, mis. {"chart_indicators": true}. Dipakai
    # SignalModal buat "always show indicators", dst. Absence = default.
    ui_prefs = Column(JSONB, nullable=True)

    # ─── Activity tracking (Growth dashboard) ───
    # Updated passively by ActivityTrackerMiddleware (NOT login).
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    total_sessions = Column(Integer, default=0, nullable=False)
    last_feature_touched = Column(String(50), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def is_premium(self) -> bool:
        if self.role == 'admin':
            return True
        if self.role != 'premium':
            return False
        if self.subscription_expires_at is None:
            return True
        from datetime import datetime, timezone
        return self.subscription_expires_at > datetime.now(timezone.utc)

    @property
    def has_active_access(self) -> bool:
        """True jika punya akses VIP aktif (admin / lifetime / belum expired).

        Beda dengan is_premium: ini menerima role 'premium' MAUPUN 'subscriber'
        supaya konsisten dengan user lama yang rolenya masih 'subscriber'.
        """
        if self.role == 'admin':
            return True
        if self.role in ('premium', 'subscriber'):
            if self.subscription_expires_at is None:
                return True  # lifetime
            from datetime import datetime, timezone
            return self.subscription_expires_at > datetime.now(timezone.utc)
        return False

    @property
    def is_admin(self) -> bool:
        return self.role == 'admin'

    @property
    def has_credit(self) -> bool:
        return self.referral_credit_usdt and float(self.referral_credit_usdt) > 0

    @property
    def effective_telegram_username(self):
        """Telegram handle for display/contact. Priority: real oauth username > admin note.
        (Real username refreshes on each login; admin note is only a fallback.)"""
        if self.telegram_username:
            v = self.telegram_username.strip().lstrip('@')
            if v:
                return v
        if self.admin_telegram_username:
            return self.admin_telegram_username.strip().lstrip('@') or None
        return None

    @property
    def effective_discord_handle(self):
        """Discord handle/id for outreach. Priority: admin override > oauth discord_id."""
        if self.admin_discord_handle:
            v = self.admin_discord_handle.strip()
            return v or None
        if self.discord_id:
            return str(self.discord_id)
        return None

    def __repr__(self):
        return f"<User {self.username} role={self.role} source={self.subscription_source}>"
