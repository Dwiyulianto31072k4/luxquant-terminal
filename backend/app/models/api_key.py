# backend/app/models/api_key.py
"""
LuxQuant Public API — ApiKey model + key helpers.

Matches database/migration-api-keys-v1.sql exactly.

Key lifecycle:
    full_key  -> ditampilkan ke user SEKALI saat dibuat, TIDAK pernah disimpan
    key_prefix-> potongan depan, aman ditampilkan (buat identifikasi di list)
    key_hash  -> SHA-256 hex, disimpan; ini kolom yang di-lookup tiap request
"""
import hashlib
import secrets

from sqlalchemy import (
    Column, BigInteger, Integer, String, Boolean, Text, DateTime, ForeignKey
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ── Format key ──
KEY_TAG = "lq_live_"                       # penanda env (live). Sisakan ruang buat lq_test_ nanti.
PREFIX_DISPLAY_LEN = len(KEY_TAG) + 6      # tag + 6 char pertama buat display


def hash_api_key(full_key: str) -> str:
    """
    SHA-256 hex dari key utuh.
    Dipakai dua kali: saat generate (buat disimpan) & tiap request (buat lookup).
    SHA-256 (bukan bcrypt) karena key high-entropy: butuh cepat + bisa di-index.
    """
    return hashlib.sha256(full_key.strip().encode()).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """
    Bikin API key baru.

    Returns (full_key, key_prefix, key_hash):
        full_key   -> kasih ke user SEKALI, jangan disimpan
        key_prefix -> simpan, aman ditampilkan
        key_hash   -> simpan, ini yang di-lookup
    """
    token = secrets.token_urlsafe(32)          # ~43 char URL-safe, high entropy
    full_key = f"{KEY_TAG}{token}"
    return full_key, full_key[:PREFIX_DISPLAY_LEN], hash_api_key(full_key)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    key_prefix = Column(Text, nullable=False)
    key_hash = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=True)

    # Single tier = full access. Kolom disiapkan buat tier-ing nanti.
    scopes = Column(ARRAY(String), nullable=False, default=lambda: ["*"])

    # Override per-key opsional; enforcement utama tetap per-user (step c).
    rate_limit_per_min = Column(Integer, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationship (non-invasif: nggak perlu ngubah model User)
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return f"<ApiKey {self.key_prefix}… user={self.user_id} active={self.is_active}>"
