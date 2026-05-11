# backend/app/models/wallet.py
"""
ReceivingWallet model — pool of CEX deposit addresses for USDT BEP-20.

Used by wallet_pool service to rotate receiving wallet per-invoice
for privacy (anti-doxxing).
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, CheckConstraint
)
from sqlalchemy.sql import func

from app.core.database import Base


# Allowed networks (mirrors DB CHECK constraint)
NETWORK_BSC = "BSC"
NETWORK_ETH = "ETH"
NETWORK_TRON = "TRON"
NETWORK_POLYGON = "POLYGON"

VALID_NETWORKS = {NETWORK_BSC, NETWORK_ETH, NETWORK_TRON, NETWORK_POLYGON}


class ReceivingWallet(Base):
    """
    A CEX deposit address used for receiving USDT subscription payments.

    The wallet_pool service assigns one of these to each payment invoice
    using a smart LRU + 1h cooldown algorithm to maximize privacy.
    """
    __tablename__ = "receiving_wallets"

    id = Column(Integer, primary_key=True, index=True)

    # Identifiers
    label = Column(String(50), unique=True, nullable=False)             # internal name: 'binance_main'
    address = Column(String(50), unique=True, nullable=False)           # 0x + 40 hex
    exchange_name = Column(String(50), nullable=False)                  # display name: 'Binance'
    network = Column(String(20), nullable=False, default=NETWORK_BSC)

    # State
    is_active = Column(Boolean, nullable=False, default=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    total_received_count = Column(Integer, nullable=False, default=0)

    notes = Column(Text, nullable=True)

    # Audit
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "address ~ '^0x[0-9a-fA-F]{40}$'",
            name="chk_wallet_address_format"
        ),
        CheckConstraint(
            "total_received_count >= 0",
            name="chk_wallet_count_nonneg"
        ),
        CheckConstraint(
            "network IN ('BSC', 'ETH', 'TRON', 'POLYGON')",
            name="chk_wallet_network"
        ),
    )

    def __repr__(self):
        return (
            f"<ReceivingWallet {self.label} ({self.exchange_name}/{self.network}) "
            f"active={self.is_active} used={self.total_received_count}>"
        )
