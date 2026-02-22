"""
Whale Alert Service
Multi-source whale transaction tracker
Primary: Blockchair API (free, no key needed, 1000 calls/day)
Secondary: Etherscan API (free key, 100K calls/day, ETH only)
"""
import time
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.redis import get_redis

# ── Config ──
BLOCKCHAIR_BASE = "https://api.blockchair.com"
ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"

CACHE_TTL = 120  # 2 minutes
CACHE_KEY_TRANSACTIONS = "whale:transactions"

# Blockchair supported chains for whale tracking
BLOCKCHAIR_CHAINS = {
    "bitcoin": {
        "symbol": "BTC",
        "color": "#F7931A",
        "icon": "₿",
        "decimals": 8,
        "min_whale_usd": 1000000,
    },
    "ethereum": {
        "symbol": "ETH",
        "color": "#627EEA",
        "icon": "Ξ",
        "decimals": 18,
        "min_whale_usd": 500000,
    },
    "litecoin": {
        "symbol": "LTC",
        "color": "#BFBBBB",
        "icon": "Ł",
        "decimals": 8,
        "min_whale_usd": 200000,
    },
    "dogecoin": {
        "symbol": "DOGE",
        "color": "#C3A634",
        "icon": "Ð",
        "decimals": 8,
        "min_whale_usd": 200000,
    },
    "bitcoin-cash": {
        "symbol": "BCH",
        "color": "#8DC351",
        "icon": "Ƀ",
        "decimals": 8,
        "min_whale_usd": 200000,
    },
    "dash": {
        "symbol": "DASH",
        "color": "#008CE7",
        "icon": "D",
        "decimals": 8,
        "min_whale_usd": 100000,
    },
    "zcash": {
        "symbol": "ZEC",
        "color": "#ECB244",
        "icon": "Z",
        "decimals": 8,
        "min_whale_usd": 100000,
    },
}

# Known exchange names for classification
KNOWN_EXCHANGES = {
    "binance", "coinbase", "kraken", "bitfinex", "huobi", "okex", "okx",
    "kucoin", "bybit", "bittrex", "gemini", "bitstamp", "poloniex",
    "gate.io", "crypto.com", "upbit", "bithumb", "bitflyer",
    "mexc", "lbank", "htx", "deribit", "cex.io", "bitget",
}


def _classify_transfer(from_owner: str, to_owner: str) -> str:
    """Classify transaction type based on from/to owners."""
    from_lower = (from_owner or "").lower()
    to_lower = (to_owner or "").lower()
    from_is_ex = any(ex in from_lower for ex in KNOWN_EXCHANGES)
    to_is_ex = any(ex in to_lower for ex in KNOWN_EXCHANGES)

    if from_is_ex and to_is_ex:
        return "exchange_to_exchange"
    elif from_is_ex and not to_is_ex:
        return "exchange_outflow"
    elif not from_is_ex and to_is_ex:
        return "exchange_inflow"
    return "wallet_to_wallet"


def _shorten(addr: str) -> str:
    if not addr or len(addr) < 12:
        return addr or "unknown"
    return f"{addr[:8]}...{addr[-6:]}"


# ═══════════════════════════════════════════
# Blockchair fetcher (primary, multi-chain)
# Free: 1,000 calls/day without API key
# ═══════════════════════════════════════════
async def _fetch_blockchair(
    blockchain: str = "bitcoin",
    limit: int = 25,
) -> list:
    config = BLOCKCHAIR_CHAINS.get(blockchain)
    if not config:
        return []

    url = f"{BLOCKCHAIR_BASE}/{blockchain}/transactions"
    params = {
        "s": "output_total(desc)",
        "limit": limit,
    }

    # Optional: use API key if configured (raises daily limit)
    try:
        from app.config import settings
        bk = getattr(settings, "BLOCKCHAIR_API_KEY", None)
        if bk:
            params["key"] = bk
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        raw_txs = data.get("data", [])
        transactions = []

        for tx in raw_txs:
            output_total = tx.get("output_total", 0)
            output_usd = tx.get("output_total_usd", 0)
            amount_coin = output_total / (10 ** config["decimals"])

            tx_time = tx.get("time", "")
            timestamp = 0
            if tx_time:
                try:
                    timestamp = int(datetime.fromisoformat(
                        tx_time.replace("Z", "+00:00") if "Z" in tx_time else tx_time
                    ).timestamp())
                except Exception:
                    pass

            transactions.append({
                "id": tx.get("hash", ""),
                "hash": tx.get("hash", ""),
                "blockchain": blockchain,
                "symbol": config["symbol"],
                "blockchain_icon": config["icon"],
                "blockchain_color": config["color"],
                "type": "transfer",
                "amount": round(amount_coin, 4),
                "amount_usd": round(output_usd, 0) if output_usd else 0,
                "format_amount": f"{amount_coin:,.4f}",
                "format_amount_usd": f"{output_usd:,.0f}" if output_usd else "0",
                "from_address": _shorten("multiple inputs"),
                "to_address": _shorten("multiple outputs"),
                "from_owner": "unknown",
                "to_owner": "unknown",
                "transfer_type": "wallet_to_wallet",
                "timestamp": timestamp,
                "date": tx_time,
                "explorer_url": f"https://blockchair.com/{blockchain}/transaction/{tx.get('hash', '')}",
                "source": "blockchair",
            })

        print(f"✅ Blockchair [{blockchain}]: {len(transactions)} whale txs")
        return transactions

    except Exception as e:
        print(f"❌ Blockchair [{blockchain}] error: {e}")
        return []


# ═══════════════════════════════════════════
# Etherscan fetcher (secondary, ETH only)
# Free: 100,000 calls/day with API key
# ═══════════════════════════════════════════
async def _fetch_etherscan(limit: int = 25) -> list:
    try:
        from app.config import settings
        api_key = getattr(settings, "ETHERSCAN_API_KEY", None)
    except Exception:
        api_key = None

    if not api_key:
        print("⚠️ ETHERSCAN_API_KEY not set — skipping Etherscan source")
        return []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Step 1: get latest block number
            resp = await client.get(ETHERSCAN_BASE, params={
                "chainid": "1",
                "module": "proxy",
                "action": "eth_blockNumber",
                "apikey": api_key,
            })
            resp.raise_for_status()
            latest_block = int(resp.json().get("result", "0x0"), 16)

            if latest_block == 0:
                return []

            # Step 2: scan last 3 blocks for large ETH transfers
            transactions = []
            for offset in range(3):
                block_hex = hex(latest_block - offset)
                block_resp = await client.get(ETHERSCAN_BASE, params={
                    "chainid": "1",
                    "module": "proxy",
                    "action": "eth_getBlockByNumber",
                    "tag": block_hex,
                    "boolean": "true",
                    "apikey": api_key,
                })
                block_resp.raise_for_status()
                block_result = block_resp.json().get("result", {})

                if not block_result or not block_result.get("transactions"):
                    continue

                block_time = int(block_result.get("timestamp", "0x0"), 16)

                for tx in block_result.get("transactions", []):
                    value_wei = int(tx.get("value", "0x0"), 16)
                    value_eth = value_wei / 1e18

                    # Only whale txs (> 50 ETH)
                    if value_eth < 50:
                        continue

                    # Estimate USD (fallback price)
                    eth_price = 1950
                    redis = get_redis()
                    if redis:
                        try:
                            cached_price = redis.get("eth_price_usd")
                            if cached_price:
                                eth_price = float(cached_price)
                        except Exception:
                            pass

                    amount_usd = value_eth * eth_price
                    from_addr = tx.get("from", "")
                    to_addr = tx.get("to", "") or "contract"

                    transactions.append({
                        "id": tx.get("hash", ""),
                        "hash": tx.get("hash", ""),
                        "blockchain": "ethereum",
                        "symbol": "ETH",
                        "blockchain_icon": "Ξ",
                        "blockchain_color": "#627EEA",
                        "type": "transfer",
                        "amount": round(value_eth, 4),
                        "amount_usd": round(amount_usd, 0),
                        "format_amount": f"{value_eth:,.4f}",
                        "format_amount_usd": f"{amount_usd:,.0f}",
                        "from_address": _shorten(from_addr),
                        "to_address": _shorten(to_addr),
                        "from_owner": "unknown",
                        "to_owner": "unknown",
                        "transfer_type": "wallet_to_wallet",
                        "timestamp": block_time,
                        "date": datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat() if block_time else "",
                        "explorer_url": f"https://etherscan.io/tx/{tx.get('hash', '')}",
                        "source": "etherscan",
                    })

        transactions.sort(key=lambda t: t.get("amount_usd", 0), reverse=True)
        transactions = transactions[:limit]
        print(f"✅ Etherscan: {len(transactions)} whale ETH txs")
        return transactions

    except Exception as e:
        print(f"❌ Etherscan error: {e}")
        return []


# ═══════════════════════════════════════════
# Stats computation
# ═══════════════════════════════════════════
def _compute_stats(transactions: list) -> dict:
    if not transactions:
        return {
            "total_volume_usd": 0,
            "total_transactions": 0,
            "avg_transaction_usd": 0,
            "largest_transaction": None,
            "by_blockchain": {},
            "by_transfer_type": {
                "exchange_inflow": {"count": 0, "volume_usd": 0},
                "exchange_outflow": {"count": 0, "volume_usd": 0},
                "exchange_to_exchange": {"count": 0, "volume_usd": 0},
                "wallet_to_wallet": {"count": 0, "volume_usd": 0},
            },
            "top_senders": [],
            "top_receivers": [],
        }

    total_usd = sum(tx.get("amount_usd", 0) for tx in transactions)
    largest = max(transactions, key=lambda t: t.get("amount_usd", 0))

    by_chain = {}
    for tx in transactions:
        chain = tx.get("blockchain", "unknown")
        if chain not in by_chain:
            by_chain[chain] = {
                "count": 0, "volume_usd": 0,
                "symbol": tx.get("symbol", "?"),
                "icon": tx.get("blockchain_icon", "?"),
                "color": tx.get("blockchain_color", "#888"),
            }
        by_chain[chain]["count"] += 1
        by_chain[chain]["volume_usd"] += tx.get("amount_usd", 0)

    by_type = {
        "exchange_inflow": {"count": 0, "volume_usd": 0},
        "exchange_outflow": {"count": 0, "volume_usd": 0},
        "exchange_to_exchange": {"count": 0, "volume_usd": 0},
        "wallet_to_wallet": {"count": 0, "volume_usd": 0},
    }
    for tx in transactions:
        tt = tx.get("transfer_type", "wallet_to_wallet")
        if tt in by_type:
            by_type[tt]["count"] += 1
            by_type[tt]["volume_usd"] += tx.get("amount_usd", 0)

    senders = {}
    receivers = {}
    for tx in transactions:
        fo = tx.get("from_address", "unknown")
        to = tx.get("to_address", "unknown")
        senders[fo] = senders.get(fo, 0) + tx.get("amount_usd", 0)
        receivers[to] = receivers.get(to, 0) + tx.get("amount_usd", 0)

    top_senders = sorted(senders.items(), key=lambda x: x[1], reverse=True)[:10]
    top_receivers = sorted(receivers.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_volume_usd": total_usd,
        "total_transactions": len(transactions),
        "avg_transaction_usd": total_usd / len(transactions) if transactions else 0,
        "largest_transaction": largest,
        "by_blockchain": by_chain,
        "by_transfer_type": by_type,
        "top_senders": [{"owner": s[0], "volume_usd": s[1]} for s in top_senders],
        "top_receivers": [{"owner": r[0], "volume_usd": r[1]} for r in top_receivers],
    }


# ═══════════════════════════════════════════
# Public API functions
# ═══════════════════════════════════════════
async def get_whale_transactions(
    blockchain: Optional[str] = None,
    min_usd: int = 500000,
    transfer_type: Optional[str] = None,
    size: int = 50,
) -> dict:
    """Get whale transactions with caching."""
    redis = get_redis()

    cache_key = f"{CACHE_KEY_TRANSACTIONS}:{blockchain or 'all'}:{min_usd}:{size}"
    if redis:
        try:
            cached = redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                if transfer_type:
                    data["transactions"] = [
                        tx for tx in data["transactions"]
                        if tx.get("transfer_type") == transfer_type
                    ]
                    data["total"] = len(data["transactions"])
                print(f"🟢 Whale cache hit: {cache_key}")
                return data
        except Exception as e:
            print(f"⚠️ Whale cache read error: {e}")

    # Fetch from sources concurrently
    tasks = []

    if blockchain and blockchain in BLOCKCHAIR_CHAINS:
        tasks.append(_fetch_blockchair(blockchain=blockchain, limit=size))
        if blockchain == "ethereum":
            tasks.append(_fetch_etherscan(limit=20))
    elif blockchain is None:
        for chain in ["bitcoin", "ethereum", "litecoin", "dogecoin"]:
            tasks.append(_fetch_blockchair(blockchain=chain, limit=15))
        tasks.append(_fetch_etherscan(limit=20))
    else:
        tasks.append(_fetch_blockchair(blockchain=blockchain, limit=size))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_transactions = []
    sources_used = set()
    for result in results:
        if isinstance(result, list):
            all_transactions.extend(result)
            for tx in result:
                sources_used.add(tx.get("source", "unknown"))

    # Deduplicate by hash
    seen = set()
    unique = []
    for tx in all_transactions:
        h = tx.get("hash", "")
        if h and h in seen:
            continue
        if h:
            seen.add(h)
        unique.append(tx)

    # Filter by min_usd
    unique = [tx for tx in unique if tx.get("amount_usd", 0) >= min_usd]

    # Sort by amount_usd desc
    unique.sort(key=lambda t: t.get("amount_usd", 0), reverse=True)
    unique = unique[:size]

    stats = _compute_stats(unique)

    data = {
        "transactions": unique,
        "total": len(unique),
        "stats": stats,
        "sources": list(sources_used),
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }

    if redis:
        try:
            redis.setex(cache_key, CACHE_TTL, json.dumps(data, default=str))
            print(f"✅ Whale cache set: {len(unique)} txs")
        except Exception as e:
            print(f"⚠️ Whale cache write error: {e}")

    if transfer_type:
        data["transactions"] = [
            tx for tx in data["transactions"]
            if tx.get("transfer_type") == transfer_type
        ]
        data["total"] = len(data["transactions"])

    return data


async def get_whale_stats() -> dict:
    result = await get_whale_transactions(min_usd=1000000, size=100)
    return result.get("stats", {})


async def get_exchange_flows() -> dict:
    result = await get_whale_transactions(min_usd=500000, size=100)
    stats = result.get("stats", {})

    inflow = stats.get("by_transfer_type", {}).get("exchange_inflow", {})
    outflow = stats.get("by_transfer_type", {}).get("exchange_outflow", {})
    net_flow = outflow.get("volume_usd", 0) - inflow.get("volume_usd", 0)

    return {
        "inflow": inflow,
        "outflow": outflow,
        "net_flow_usd": net_flow,
        "sentiment": "bullish" if net_flow > 0 else "bearish" if net_flow < 0 else "neutral",
        "description": (
            "More crypto leaving exchanges (bullish — accumulation)"
            if net_flow > 0
            else "More crypto entering exchanges (bearish — potential sell pressure)"
            if net_flow < 0
            else "Balanced exchange flows"
        ),
    }