"""
LuxQuant Coin Metadata Worker
==============================
Worker yang process coins dengan review_status='pending', fetch metadata
dari CoinGecko, auto-categorize berdasarkan categories + market data,
dan update coins table.

Modes:
- --pending: process all pending coins (one-shot, batch)
- --pair <PAIR>: process single pair (debug)
- --listen: real-time LISTEN ke channel 'new_pair_to_categorize' (daemon)
- --refresh-stale: re-fetch coins yang last_fetched_at > 30 hari

CLI Usage:
    # One-shot batch process all pending
    python3 -m app.services.coin_metadata_worker --pending

    # Process single pair (debug)
    python3 -m app.services.coin_metadata_worker --pair BTCUSDT

    # Daemon mode (LISTEN/NOTIFY)
    python3 -m app.services.coin_metadata_worker --listen

    # Refresh stale data (>30 days old)
    python3 -m app.services.coin_metadata_worker --refresh-stale

Place this file at:
    /root/luxquant-terminal/backend/app/services/coin_metadata_worker.py

Author: LuxQuant Team
"""

import argparse
import json
import logging
import os
import select
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import httpx
import psycopg2
import psycopg2.extensions
from sqlalchemy import create_engine, text


# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)

COINGECKO_API_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")  # optional pro key
COINGECKO_RATE_LIMIT_SLEEP = 6.5  # ~10 req/min for free tier (safe margin)

BATCH_LIMIT = int(os.getenv("COIN_META_BATCH", "20"))
LISTEN_CHANNEL = "new_pair_to_categorize"
STALE_THRESHOLD_DAYS = 30

LOG_DIR = os.getenv("LOG_DIR", "/var/log/luxquant-sync")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "coin-metadata-worker.log")),
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger("coin-metadata-worker")

engine = create_engine(DATABASE_URL, future=True)


# ============================================================
# CATEGORIZATION RULES
# ============================================================
# Map CoinGecko categories → our internal token_type & sector.
# Order matters: first match wins.
# ============================================================

CATEGORY_RULES = [
    # ── Stablecoins (highest priority — overrides everything) ──
    {
        "match_keywords": ["stablecoin", "usd stablecoin", "stable coin"],
        "token_type": "stablecoin",
        "sector": "payments",
        "has_utility": True,
        "utility_flags": {"payments": True, "backed_by_asset": True},
    },

    # ── RWA / Tokenized assets ──
    {
        "match_keywords": ["tokenized", "real world asset", "rwa", "tokenized gold", "tokenized stock"],
        "token_type": "rwa",
        "sector": "rwa",
        "has_utility": True,
        "utility_flags": {"backed_by_asset": True, "payments": True},
    },

    # ── Meme coins (low utility) ──
    {
        "match_keywords": ["meme", "dog-themed", "cat-themed", "frog-themed"],
        "token_type": "memecoin",
        "sector": "hype",
        "has_utility": False,
        "utility_flags": {},
    },

    # ── Privacy ──
    {
        "match_keywords": ["privacy coin", "privacy"],
        "token_type": "privacy",
        "sector": "privacy",
        "has_utility": True,
        "utility_flags": {"payments": True},
    },

    # ── DeFi (lending, DEX) ──
    {
        "match_keywords": ["decentralized exchange", "lending", "yield", "defi", "decentralized finance"],
        "token_type": "defi",
        "sector": "defi",
        "has_utility": True,
        "utility_flags": {"governance": True, "staking": True},
    },

    # ── AI ──
    {
        "match_keywords": ["artificial intelligence", "ai", "machine learning"],
        "token_type": "utility",
        "sector": "ai",
        "has_utility": True,
        "utility_flags": {"premium_access": True, "staking": True},
    },

    # ── GameFi ──
    {
        "match_keywords": ["gaming", "play to earn", "metaverse", "game", "gamefi"],
        "token_type": "utility",
        "sector": "gamefi",
        "has_utility": True,
        "utility_flags": {"governance": True, "premium_access": True},
    },

    # ── Layer 1 ──
    {
        "match_keywords": ["layer 1", "layer-1", "smart contract platform", "proof of stake"],
        "token_type": "layer1",
        "sector": "infrastructure",
        "has_utility": True,
        "utility_flags": {"gas_fee": True, "staking": True, "governance": True},
    },

    # ── Layer 2 / Scaling ──
    {
        "match_keywords": ["layer 2", "layer-2", "scaling", "rollup", "zk-rollup"],
        "token_type": "layer2",
        "sector": "infrastructure",
        "has_utility": True,
        "utility_flags": {"gas_fee": True, "governance": True},
    },

    # ── Oracle / Infrastructure ──
    {
        "match_keywords": ["oracle", "data infrastructure", "decentralized storage", "compute"],
        "token_type": "utility",
        "sector": "infrastructure",
        "has_utility": True,
        "utility_flags": {"payments": True, "staking": True},
    },

    # ── Exchange tokens ──
    {
        "match_keywords": ["exchange-based tokens", "centralized exchange"],
        "token_type": "exchange",
        "sector": "defi",
        "has_utility": True,
        "utility_flags": {"premium_access": True, "buyback_burn": True},
    },

    # ── SocialFi ──
    {
        "match_keywords": ["socialfi", "social", "music", "creator economy"],
        "token_type": "utility",
        "sector": "socialfi",
        "has_utility": True,
        "utility_flags": {"governance": True, "premium_access": True},
    },

    # ── Governance ──
    {
        "match_keywords": ["governance", "dao"],
        "token_type": "governance",
        "sector": "defi",
        "has_utility": True,
        "utility_flags": {"governance": True},
    },
]


# Manual override for top coins (skip CoinGecko fetch + apply directly).
# Useful for known popular pairs to save API quota.
MANUAL_OVERRIDES = {
    "BTC":  {"token_type": "layer1", "sector": "infrastructure", "has_utility": True,
             "utility_flags": {"store_of_value": True, "payments": True},
             "coingecko_id": "bitcoin"},
    "ETH":  {"token_type": "layer1", "sector": "infrastructure", "has_utility": True,
             "utility_flags": {"gas_fee": True, "staking": True, "governance": True},
             "coingecko_id": "ethereum"},
    "BNB":  {"token_type": "exchange", "sector": "defi", "has_utility": True,
             "utility_flags": {"gas_fee": True, "buyback_burn": True, "premium_access": True},
             "coingecko_id": "binancecoin"},
    "SOL":  {"token_type": "layer1", "sector": "infrastructure", "has_utility": True,
             "utility_flags": {"gas_fee": True, "staking": True},
             "coingecko_id": "solana"},
    "USDT": {"token_type": "stablecoin", "sector": "payments", "has_utility": True,
             "utility_flags": {"payments": True, "backed_by_asset": True},
             "coingecko_id": "tether"},
    "USDC": {"token_type": "stablecoin", "sector": "payments", "has_utility": True,
             "utility_flags": {"payments": True, "backed_by_asset": True},
             "coingecko_id": "usd-coin"},
    "DOGE": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
             "utility_flags": {},
             "coingecko_id": "dogecoin"},
    "SHIB": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
             "utility_flags": {},
             "coingecko_id": "shiba-inu"},
    "PEPE": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
             "utility_flags": {},
             "coingecko_id": "pepe"},
    "BONK": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
             "utility_flags": {},
             "coingecko_id": "bonk"},
    "1000PEPE": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
                 "utility_flags": {}, "coingecko_id": "pepe"},
    "1000BONK": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
                 "utility_flags": {}, "coingecko_id": "bonk"},
    "1000SATS": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
                 "utility_flags": {}, "coingecko_id": "sats-ordinals"},
    "1000RATS": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
                 "utility_flags": {}, "coingecko_id": "rats-ordinals"},
    "MEME": {"token_type": "memecoin", "sector": "hype", "has_utility": False,
             "utility_flags": {}, "coingecko_id": "memecoin-2"},
}


# ============================================================
# HTTP CLIENT
# ============================================================

def get_http_client() -> httpx.Client:
    """Build HTTP client with optional CoinGecko Pro headers."""
    headers = {"accept": "application/json"}
    if COINGECKO_API_KEY:
        headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
    return httpx.Client(timeout=15.0, headers=headers)


# ============================================================
# COINGECKO FETCHING
# ============================================================

def coingecko_search(symbol: str, client: httpx.Client) -> Optional[str]:
    """Search CoinGecko for symbol → return coingecko_id of best match."""
    try:
        url = f"{COINGECKO_API_BASE}/search"
        r = client.get(url, params={"query": symbol})
        if r.status_code != 200:
            logger.warning(f"CoinGecko search {symbol}: HTTP {r.status_code}")
            return None
        data = r.json()
        coins = data.get("coins", [])
        if not coins:
            return None
        # Match by symbol exact (case-insensitive)
        for c in coins:
            if c.get("symbol", "").upper() == symbol.upper():
                return c.get("id")
        # Fallback to first result
        return coins[0].get("id")
    except Exception as e:
        logger.error(f"CoinGecko search failed for {symbol}: {e}")
        return None


def coingecko_fetch_coin(coingecko_id: str, client: httpx.Client) -> Optional[Dict[str, Any]]:
    """Fetch full coin metadata from CoinGecko."""
    try:
        url = f"{COINGECKO_API_BASE}/coins/{coingecko_id}"
        params = {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "false",
            "developer_data": "false",
        }
        r = client.get(url, params=params)
        if r.status_code != 200:
            logger.warning(f"CoinGecko fetch {coingecko_id}: HTTP {r.status_code}")
            return None
        return r.json()
    except Exception as e:
        logger.error(f"CoinGecko fetch failed for {coingecko_id}: {e}")
        return None


# ============================================================
# CATEGORIZATION LOGIC
# ============================================================

def categorize_from_coingecko(coin_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply CATEGORY_RULES to CoinGecko response.
    Returns dict: {token_type, sector, has_utility, utility_flags, categories_raw}
    """
    categories = [c.lower() for c in (coin_data.get("categories") or []) if c]

    for rule in CATEGORY_RULES:
        for kw in rule["match_keywords"]:
            if any(kw in cat for cat in categories):
                return {
                    "token_type": rule["token_type"],
                    "sector": rule["sector"],
                    "has_utility": rule["has_utility"],
                    "utility_flags": rule["utility_flags"],
                    "categories_raw": categories,
                }

    # Default fallback if no rule matched
    return {
        "token_type": "utility",
        "sector": "other",
        "has_utility": True,  # benefit of the doubt; admin can review
        "utility_flags": {},
        "categories_raw": categories,
    }


# ============================================================
# DATABASE OPERATIONS
# ============================================================

def get_pending_coins(limit: int = BATCH_LIMIT) -> List[Dict[str, Any]]:
    """Fetch coins with review_status='pending'."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol
            FROM coins
            WHERE review_status = 'pending'
            ORDER BY pair
            LIMIT :limit
        """), {"limit": limit}).fetchall()
        return [{"pair": r[0], "base_symbol": r[1], "quote_symbol": r[2]} for r in rows]


def get_stale_coins(days: int = STALE_THRESHOLD_DAYS, limit: int = BATCH_LIMIT) -> List[Dict[str, Any]]:
    """Coins yang udah lama gak di-refresh."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol, coingecko_id
            FROM coins
            WHERE last_fetched_at IS NULL OR last_fetched_at < :cutoff
            ORDER BY last_fetched_at NULLS FIRST
            LIMIT :limit
        """), {"cutoff": cutoff, "limit": limit}).fetchall()
        return [{"pair": r[0], "base_symbol": r[1], "quote_symbol": r[2],
                 "coingecko_id": r[3]} for r in rows]


def get_coin_by_pair(pair: str) -> Optional[Dict[str, Any]]:
    """Fetch single coin row."""
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol, coingecko_id, review_status
            FROM coins
            WHERE pair = :pair
        """), {"pair": pair}).fetchone()
        if not row:
            return None
        return {"pair": row[0], "base_symbol": row[1], "quote_symbol": row[2],
                "coingecko_id": row[3], "review_status": row[4]}


def update_coin(pair: str, updates: Dict[str, Any]) -> bool:
    """Update coin row with categorization + metadata."""
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE coins SET
                    token_type      = :token_type,
                    sector          = :sector,
                    has_utility     = :has_utility,
                    utility_details = CAST(:utility_details AS JSONB),
                    coingecko_id    = COALESCE(:coingecko_id, coingecko_id),
                    market_cap_rank = :market_cap_rank,
                    market_cap_usd  = :market_cap_usd,
                    description     = :description,
                    website         = :website,
                    categories_raw  = CAST(:categories_raw AS JSONB),
                    review_status   = :review_status,
                    metadata_source = :metadata_source,
                    last_fetched_at = NOW(),
                    fetch_error     = NULL,
                    updated_at      = NOW()
                WHERE pair = :pair
            """), {
                "pair": pair,
                "token_type": updates.get("token_type"),
                "sector": updates.get("sector"),
                "has_utility": updates.get("has_utility"),
                "utility_details": json.dumps(updates.get("utility_flags", {})),
                "coingecko_id": updates.get("coingecko_id"),
                "market_cap_rank": updates.get("market_cap_rank"),
                "market_cap_usd": updates.get("market_cap_usd"),
                "description": updates.get("description"),
                "website": updates.get("website"),
                "categories_raw": json.dumps(updates.get("categories_raw", [])),
                "review_status": updates.get("review_status", "auto_categorized"),
                "metadata_source": updates.get("metadata_source", "coingecko"),
            })
        return True
    except Exception as e:
        logger.error(f"Failed to update coin {pair}: {e}")
        return False


def mark_fetch_error(pair: str, error_msg: str):
    """Mark a coin as failed-to-fetch (will retry next batch)."""
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE coins SET
                    fetch_error = :err,
                    last_fetched_at = NOW()
                WHERE pair = :pair
            """), {"pair": pair, "err": error_msg[:500]})
    except Exception as e:
        logger.error(f"Failed to mark error for {pair}: {e}")


# ============================================================
# CORE PROCESSING
# ============================================================

def process_coin(coin: Dict[str, Any], client: httpx.Client) -> bool:
    """
    Process single coin:
    1. Check manual overrides → apply directly
    2. Otherwise search CoinGecko → fetch → categorize → update DB
    """
    pair = coin["pair"]
    base_symbol = coin["base_symbol"].upper()

    # ── Step 1: Manual override? ──
    if base_symbol in MANUAL_OVERRIDES:
        logger.info(f"[{pair}] Applying manual override")
        override = MANUAL_OVERRIDES[base_symbol]
        updates = {
            **override,
            "categories_raw": ["manual_override"],
            "review_status": "auto_categorized",
            "metadata_source": "manual",
        }
        return update_coin(pair, updates)

    # ── Step 2: Search CoinGecko ──
    logger.info(f"[{pair}] Searching CoinGecko for {base_symbol}")
    coingecko_id = coin.get("coingecko_id") or coingecko_search(base_symbol, client)

    if not coingecko_id:
        logger.warning(f"[{pair}] No CoinGecko match found")
        mark_fetch_error(pair, "no_coingecko_match")
        return False

    # Rate limit
    time.sleep(COINGECKO_RATE_LIMIT_SLEEP)

    # ── Step 3: Fetch full data ──
    coin_data = coingecko_fetch_coin(coingecko_id, client)
    if not coin_data:
        mark_fetch_error(pair, f"fetch_failed:{coingecko_id}")
        return False

    # ── Step 4: Categorize ──
    cat = categorize_from_coingecko(coin_data)

    # ── Step 5: Build update payload ──
    market_data = coin_data.get("market_data") or {}
    updates = {
        **cat,
        "coingecko_id": coingecko_id,
        "market_cap_rank": coin_data.get("market_cap_rank"),
        "market_cap_usd": (market_data.get("market_cap") or {}).get("usd"),
        "description": ((coin_data.get("description") or {}).get("en") or "")[:1000],
        "website": ((coin_data.get("links") or {}).get("homepage") or [None])[0],
        "review_status": "auto_categorized",
        "metadata_source": "coingecko",
    }

    success = update_coin(pair, updates)
    if success:
        logger.info(
            f"[{pair}] OK — type={cat['token_type']} sector={cat['sector']} "
            f"utility={cat['has_utility']} rank={updates['market_cap_rank']}"
        )
    return success


# ============================================================
# MODES
# ============================================================

def run_pending_batch():
    """Process all pending coins in batches."""
    logger.info("=" * 60)
    logger.info("Mode: PENDING BATCH")
    logger.info("=" * 60)

    client = get_http_client()
    total_processed = 0
    total_success = 0
    total_failed = 0

    while True:
        coins = get_pending_coins(BATCH_LIMIT)
        if not coins:
            logger.info("No more pending coins.")
            break

        logger.info(f"Fetched batch of {len(coins)} pending coins")
        for coin in coins:
            ok = process_coin(coin, client)
            total_processed += 1
            if ok:
                total_success += 1
            else:
                total_failed += 1

    client.close()
    logger.info(
        f"DONE — processed={total_processed} success={total_success} failed={total_failed}"
    )


def run_single_pair(pair: str):
    """Process single pair (debug mode)."""
    logger.info(f"Mode: SINGLE PAIR — {pair}")
    coin = get_coin_by_pair(pair)
    if not coin:
        logger.error(f"Pair {pair} not found in coins table. Did you run the migration + seed?")
        return
    client = get_http_client()
    ok = process_coin(coin, client)
    client.close()
    logger.info(f"Result: {'SUCCESS' if ok else 'FAILED'}")


def run_listen_daemon():
    """LISTEN to new_pair_to_categorize channel and process incoming."""
    logger.info("=" * 60)
    logger.info(f"Mode: DAEMON — LISTEN {LISTEN_CHANNEL}")
    logger.info("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute(f"LISTEN {LISTEN_CHANNEL};")
    logger.info(f"Listening on '{LISTEN_CHANNEL}'...")

    client = get_http_client()
    try:
        while True:
            if select.select([conn], [], [], 60) == ([], [], []):
                # Timeout — keepalive log
                logger.debug("Heartbeat (no notifications)")
                continue
            conn.poll()
            while conn.notifies:
                notify = conn.notifies.pop(0)
                pair = notify.payload
                logger.info(f"NOTIFY received: {pair}")
                coin = get_coin_by_pair(pair)
                if coin and coin["review_status"] == "pending":
                    process_coin(coin, client)
                else:
                    logger.debug(f"Skipping {pair} (not pending or not found)")
    except KeyboardInterrupt:
        logger.info("Shutting down daemon...")
    finally:
        client.close()
        cur.close()
        conn.close()


def run_refresh_stale():
    """Refresh coins yang last_fetched_at > STALE_THRESHOLD_DAYS days."""
    logger.info(f"Mode: REFRESH STALE (>{STALE_THRESHOLD_DAYS} days)")
    client = get_http_client()
    coins = get_stale_coins()
    logger.info(f"Found {len(coins)} stale coins")
    for coin in coins:
        process_coin(coin, client)
    client.close()


# ============================================================
# CLI ENTRYPOINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="LuxQuant Coin Metadata Worker")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pending", action="store_true", help="Process all pending coins (one-shot)")
    group.add_argument("--pair", type=str, help="Process single pair (debug)")
    group.add_argument("--listen", action="store_true", help="Daemon mode: LISTEN/NOTIFY")
    group.add_argument("--refresh-stale", action="store_true", help="Refresh coins >30 days old")

    args = parser.parse_args()

    if args.pending:
        run_pending_batch()
    elif args.pair:
        run_single_pair(args.pair)
    elif args.listen:
        run_listen_daemon()
    elif args.refresh_stale:
        run_refresh_stale()


if __name__ == "__main__":
    main()
