# backend/app/services/wallet_pool.py
"""
Wallet Pool Service — Smart selection algorithm for multi-wallet rotation.

Privacy goal: prevent revenue/operation doxxing via single-wallet BSCScan trace.
Strategy: rotate per-invoice across N CEX deposit addresses with anti-correlation logic.

Selection Algorithm:
  1. Filter active wallets where last_used_at < NOW() - cooldown (default 1 hour)
  2. If candidates exist:
       - Sort by last_used_at ASC (LRU — least recently used first)
       - Take top 3
       - Random pick within top 3 (anti-prediction)
  3. If no candidates (all in cooldown):
       - Fallback: any active wallet, LRU sorted
  4. If table empty:
       - Fallback to settings.RECEIVING_WALLET_BSC (legacy env var)
  5. If env var empty:
       - Raise HTTPException 500 (misconfiguration)

Idempotency:
  - increment_usage() must be called AFTER db.commit() of the payment that
    uses the wallet. We don't auto-increment in pick_wallet to avoid
    double-counting if the caller decides to roll back.

Concurrency:
  - For LuxQuant's scale (10-100 invoice/day), simple SELECT then UPDATE
    is fine. No row-level locking needed.
  - If scale grows to 1000+ concurrent invoices/sec, switch to
    SELECT ... FOR UPDATE SKIP LOCKED for deterministic distribution.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.config import settings
from app.models.wallet import ReceivingWallet, NETWORK_BSC

logger = logging.getLogger(__name__)

# Cooldown: prevent same wallet appearing twice within this window
COOLDOWN_MINUTES = 60

# Top-N candidates for random tiebreaker (smaller = more LRU pure, larger = more random)
TOP_N_CANDIDATES = 3


def pick_wallet(
    db: Session,
    network: str = NETWORK_BSC,
    cooldown_minutes: int = COOLDOWN_MINUTES,
) -> str:
    """
    Select an address from the wallet pool for assigning to a new payment invoice.

    Returns: BSC address string (mixed case as stored, e.g. '0xAbCd...').
             Caller should preserve case when writing to payment.wallet_to;
             verification logic is case-insensitive.

    Side effects: NONE on read. Caller MUST call increment_usage(db, address)
                  after the invoice is committed.

    Fallback chain (high → low):
      1. Active wallet past cooldown → top-N LRU → random pick
      2. Any active wallet → LRU pick (cooldown ignored)
      3. settings.RECEIVING_WALLET_BSC (legacy env var)
      4. Raise (misconfiguration)
    """
    now = datetime.now(timezone.utc)
    cooldown_cutoff = now - timedelta(minutes=cooldown_minutes)

    # ── Tier 1: cooldown-respecting LRU pick ──
    eligible = db.query(ReceivingWallet).filter(
        ReceivingWallet.is_active == True,
        ReceivingWallet.network == network,
    ).filter(
        (ReceivingWallet.last_used_at == None) |
        (ReceivingWallet.last_used_at < cooldown_cutoff)
    ).order_by(
        ReceivingWallet.last_used_at.asc().nulls_first()
    ).limit(TOP_N_CANDIDATES).all()

    if eligible:
        wallet = secrets.choice(eligible)
        logger.info(
            f"💼 Wallet selected (cooldown-respecting): "
            f"{wallet.label} ({wallet.exchange_name}) [{len(eligible)} candidates]"
        )
        return wallet.address

    # ── Tier 2: ignore cooldown, pick any active LRU ──
    any_active = db.query(ReceivingWallet).filter(
        ReceivingWallet.is_active == True,
        ReceivingWallet.network == network,
    ).order_by(
        ReceivingWallet.last_used_at.asc().nulls_first()
    ).first()

    if any_active:
        logger.warning(
            f"⚠️  All wallets in cooldown. Using LRU fallback: "
            f"{any_active.label} ({any_active.exchange_name})"
        )
        return any_active.address

    # ── Tier 3: fallback to env var ──
    env_wallet = (settings.RECEIVING_WALLET_BSC or "").strip()
    if env_wallet:
        logger.warning(
            f"⚠️  receiving_wallets table empty for network={network}. "
            f"Falling back to RECEIVING_WALLET_BSC env var."
        )
        return env_wallet

    # ── Tier 4: catastrophic misconfiguration ──
    logger.error(
        f"❌ No wallet available: table empty AND RECEIVING_WALLET_BSC not set"
    )
    raise RuntimeError(
        "No receiving wallet configured. "
        "Seed receiving_wallets table or set RECEIVING_WALLET_BSC env var."
    )


def increment_usage(db: Session, address: str) -> Optional[ReceivingWallet]:
    """
    Mark a wallet as used: update last_used_at + bump total_received_count.

    Call this AFTER db.commit() of the payment row, in a separate transaction.
    This way, if commit() rollbacks, we don't increment usage.

    Address lookup is case-insensitive (Ethereum addresses are case-insensitive
    but EIP-55 checksum encodes mixed case; we normalize via LOWER()).

    Returns: updated ReceivingWallet, or None if address not found (fallback case).
    """
    if not address:
        return None

    wallet = db.query(ReceivingWallet).filter(
        ReceivingWallet.address.ilike(address)
    ).first()

    if not wallet:
        # Address not in pool (probably legacy env var fallback). Skip silently.
        logger.debug(
            f"increment_usage: address {address[:10]}... not in pool, skipping"
        )
        return None

    wallet.last_used_at = datetime.now(timezone.utc)
    wallet.total_received_count = (wallet.total_received_count or 0) + 1
    db.commit()
    db.refresh(wallet)

    logger.debug(
        f"💼 Wallet usage incremented: {wallet.label} "
        f"→ total_received_count={wallet.total_received_count}"
    )
    return wallet


def get_pool_stats(db: Session) -> dict:
    """
    Return current pool stats. Useful for admin dashboard / debugging.
    """
    wallets = db.query(ReceivingWallet).order_by(
        ReceivingWallet.id
    ).all()

    return {
        "total": len(wallets),
        "active": sum(1 for w in wallets if w.is_active),
        "inactive": sum(1 for w in wallets if not w.is_active),
        "wallets": [
            {
                "id": w.id,
                "label": w.label,
                "exchange": w.exchange_name,
                "network": w.network,
                "is_active": w.is_active,
                "last_used_at": w.last_used_at.isoformat() if w.last_used_at else None,
                "total_received_count": w.total_received_count,
            }
            for w in wallets
        ]
    }
