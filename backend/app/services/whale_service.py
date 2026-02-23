"""
Whale Alert Service v2
Focused on BTC + ETH with reliable free APIs.

BTC: blockchain.com Blockchain Data API (free, no key, 1 req/10s)
     - /rawblock/{hash} → parse large transactions from latest blocks
     - /latestblock → get latest block hash
ETH: Etherscan API v2 proxy (free key, 100K calls/day)
     - eth_getBlockByNumber → parse large ETH transfers
"""
import json
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.redis import get_redis

# ── Config ──
BLOCKCHAIN_COM_BASE = "https://blockchain.info"
ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"

CACHE_TTL = 120  # 2 minutes
BTC_PRICE_CACHE_KEY = "whale:btc_price"
ETH_PRICE_CACHE_KEY = "whale:eth_price"
WHALE_CACHE_KEY = "whale:transactions"

# Known exchange addresses (BTC - partial match on addr tags)
KNOWN_EXCHANGE_ADDRS_BTC = {
    # Binance
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": "Binance",
    "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": "Binance",
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": "Binance",
    # Coinbase
    "3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq64": "Coinbase",
    "bc1q7cyrfmck2ffu2ud3rn5l5a8yv6f0chkp0zpemf": "Coinbase",
    # Bitfinex
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": "Bitfinex",
    # Kraken
    "bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9": "Kraken",
}

KNOWN_EXCHANGE_ADDRS_ETH = {
    "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 36",
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance 8",
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "Binance 16",
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": "Coinbase 10",
    "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase 2",
    "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "Coinbase 3",
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": "Kraken 13",
    "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": "Kraken 4",
    "0xcffad3200574698b78f32232aa9d63eabd290703": "Crypto.com",
    "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": "Crypto.com 2",
    "0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98": "Bitfinex 1",
    "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e": "Bitfinex 2",
}


def _shorten(addr: str) -> str:
    if not addr or len(addr) < 12:
        return addr or "unknown"
    return f"{addr[:8]}...{addr[-6:]}"


def _classify_transfer(from_label: str, to_label: str) -> str:
    from_is_ex = bool(from_label and from_label != "unknown")
    to_is_ex = bool(to_label and to_label != "unknown")
    if from_is_ex and to_is_ex:
        return "exchange_to_exchange"
    elif from_is_ex:
        return "exchange_outflow"
    elif to_is_ex:
        return "exchange_inflow"
    return "wallet_to_wallet"


# ════════════════════════════════════════
# Price fetcher (CoinGecko simple/price)
# ════════════════════════════════════════
async def _get_prices() -> dict:
    """Get BTC & ETH prices. Cache for 2 min."""
    redis = get_redis()
    btc_price = 0.0
    eth_price = 0.0

    if redis:
        try:
            bp = redis.get(BTC_PRICE_CACHE_KEY)
            ep = redis.get(ETH_PRICE_CACHE_KEY)
            if bp and ep:
                return {"btc": float(bp), "eth": float(ep)}
        except Exception:
            pass

    # Try to get from existing market cache first
    if redis:
        try:
            cached_global = redis.get("market:global")
            if cached_global:
                g = json.loads(cached_global)
                btc_price = g.get("btc_price", 0) or 0
        except Exception:
            pass

    # Fallback: fetch from CoinGecko
    if not btc_price:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": "bitcoin,ethereum", "vs_currencies": "usd"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    btc_price = data.get("bitcoin", {}).get("usd", 95000)
                    eth_price = data.get("ethereum", {}).get("usd", 1950)
        except Exception:
            btc_price = 95000  # fallback
            eth_price = 1950

    if not eth_price:
        eth_price = 1950

    if redis:
        try:
            redis.setex(BTC_PRICE_CACHE_KEY, CACHE_TTL, str(btc_price))
            redis.setex(ETH_PRICE_CACHE_KEY, CACHE_TTL, str(eth_price))
        except Exception:
            pass

    return {"btc": btc_price, "eth": eth_price}


# ════════════════════════════════════════
# BTC: blockchain.com API (free, no key)
# Rate limit: 1 req / 10s
# ════════════════════════════════════════
async def _fetch_btc_whales(min_btc: float = 10.0, limit: int = 30) -> list:
    """
    Get large BTC transactions from recent blocks via blockchain.info.
    Endpoint: /rawblock/{hash} returns all transactions in a block.
    We filter for large ones (> min_btc).
    """
    prices = await _get_prices()
    btc_price = prices["btc"]

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # Step 1: get latest block hash
            resp = await client.get(f"{BLOCKCHAIN_COM_BASE}/latestblock")
            resp.raise_for_status()
            latest = resp.json()
            block_hash = latest.get("hash", "")
            block_height = latest.get("height", 0)

            if not block_hash:
                print("❌ BTC: No latest block hash")
                return []

            # Step 2: get block transactions
            # Add a small delay to respect rate limits
            await asyncio.sleep(1)

            resp2 = await client.get(
                f"{BLOCKCHAIN_COM_BASE}/rawblock/{block_hash}",
                params={"cors": "true"},
            )
            resp2.raise_for_status()
            block = resp2.json()

            block_time = block.get("time", 0)
            txs_raw = block.get("tx", [])

            transactions = []
            for tx in txs_raw:
                # Calculate total output value (in satoshi)
                total_out_sat = sum(o.get("value", 0) for o in tx.get("out", []))
                total_out_btc = total_out_sat / 1e8
                total_out_usd = total_out_btc * btc_price

                if total_out_btc < min_btc:
                    continue

                # Get from/to addresses
                inputs = tx.get("inputs", [])
                outputs = tx.get("out", [])

                from_addr = ""
                from_label = "unknown"
                if inputs and inputs[0].get("prev_out"):
                    from_addr = inputs[0]["prev_out"].get("addr", "")
                    from_label = KNOWN_EXCHANGE_ADDRS_BTC.get(from_addr, "unknown")

                to_addr = ""
                to_label = "unknown"
                # Find the largest output as primary recipient
                if outputs:
                    largest_out = max(outputs, key=lambda o: o.get("value", 0))
                    to_addr = largest_out.get("addr", "")
                    to_label = KNOWN_EXCHANGE_ADDRS_BTC.get(to_addr, "unknown")

                transfer_type = _classify_transfer(from_label, to_label)

                transactions.append({
                    "id": tx.get("hash", ""),
                    "hash": tx.get("hash", ""),
                    "blockchain": "bitcoin",
                    "symbol": "BTC",
                    "blockchain_icon": "₿",
                    "blockchain_color": "#F7931A",
                    "type": "transfer",
                    "amount": round(total_out_btc, 4),
                    "amount_usd": round(total_out_usd, 0),
                    "format_amount": f"{total_out_btc:,.4f}",
                    "format_amount_usd": f"${total_out_usd:,.0f}",
                    "from_address": _shorten(from_addr) if from_addr else "multiple",
                    "to_address": _shorten(to_addr) if to_addr else "multiple",
                    "from_owner": from_label,
                    "to_owner": to_label,
                    "transfer_type": transfer_type,
                    "timestamp": block_time,
                    "date": datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat() if block_time else "",
                    "block_height": block_height,
                    "explorer_url": f"https://www.blockchain.com/btc/tx/{tx.get('hash', '')}",
                    "source": "blockchain.com",
                })

            # Sort by amount desc
            transactions.sort(key=lambda t: t.get("amount_usd", 0), reverse=True)
            transactions = transactions[:limit]

            print(f"✅ BTC blockchain.com: {len(transactions)} whale txs (block #{block_height})")
            return transactions

    except Exception as e:
        print(f"❌ BTC blockchain.com error: {e}")
        return []


# ════════════════════════════════════════
# ETH: Etherscan API v2 proxy (free key)
# ════════════════════════════════════════
async def _fetch_eth_whales(min_eth: float = 50.0, limit: int = 30) -> list:
    """
    Get large ETH transactions from recent blocks via Etherscan v2 proxy.
    """
    try:
        from app.config import settings
        api_key = getattr(settings, "ETHERSCAN_API_KEY", None)
    except Exception:
        api_key = None

    if not api_key:
        print("⚠️ ETHERSCAN_API_KEY not set — skipping ETH whale source")
        return []

    prices = await _get_prices()
    eth_price = prices["eth"]

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
            block_data = resp.json()

            # Etherscan v2 proxy returns: {"jsonrpc":"2.0","id":83,"result":"0x..."}
            block_result = block_data.get("result")
            if not block_result or isinstance(block_result, dict):
                print(f"❌ ETH: unexpected blockNumber response: {block_data}")
                return []

            latest_block = int(block_result, 16)
            if latest_block == 0:
                return []

            # Step 2: scan last 2 blocks for large ETH transfers
            transactions = []
            for offset in range(2):
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
                block_json = block_resp.json()

                # Response: {"jsonrpc":"2.0","id":1,"result":{...block data...}}
                block_obj = block_json.get("result")
                if not block_obj or not isinstance(block_obj, dict):
                    continue

                block_txs = block_obj.get("transactions", [])
                block_time_hex = block_obj.get("timestamp", "0x0")
                block_time = int(block_time_hex, 16) if block_time_hex else 0
                block_num = int(block_obj.get("number", "0x0"), 16)

                for tx in block_txs:
                    if not isinstance(tx, dict):
                        continue

                    value_hex = tx.get("value", "0x0")
                    value_wei = int(value_hex, 16) if value_hex else 0
                    value_eth = value_wei / 1e18

                    if value_eth < min_eth:
                        continue

                    amount_usd = value_eth * eth_price

                    from_addr = (tx.get("from") or "").lower()
                    to_addr = (tx.get("to") or "contract").lower()

                    from_label = KNOWN_EXCHANGE_ADDRS_ETH.get(from_addr, "unknown")
                    to_label = KNOWN_EXCHANGE_ADDRS_ETH.get(to_addr, "unknown")
                    transfer_type = _classify_transfer(from_label, to_label)

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
                        "format_amount_usd": f"${amount_usd:,.0f}",
                        "from_address": _shorten(from_addr),
                        "to_address": _shorten(to_addr),
                        "from_owner": from_label,
                        "to_owner": to_label,
                        "transfer_type": transfer_type,
                        "timestamp": block_time,
                        "date": datetime.fromtimestamp(block_time, tz=timezone.utc).isoformat() if block_time else "",
                        "block_height": block_num,
                        "explorer_url": f"https://etherscan.io/tx/{tx.get('hash', '')}",
                        "source": "etherscan",
                    })

            transactions.sort(key=lambda t: t.get("amount_usd", 0), reverse=True)
            transactions = transactions[:limit]

            print(f"✅ ETH Etherscan: {len(transactions)} whale txs")
            return transactions

    except Exception as e:
        print(f"❌ ETH Etherscan error: {e}")
        return []


# ════════════════════════════════════════
# Stats computation
# ════════════════════════════════════════
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
        fo = tx.get("from_owner", "unknown")
        if fo == "unknown":
            fo = tx.get("from_address", "unknown")
        to = tx.get("to_owner", "unknown")
        if to == "unknown":
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


# ════════════════════════════════════════
# Public API functions
# ════════════════════════════════════════
async def get_whale_transactions(
    blockchain: Optional[str] = None,
    min_usd: int = 500000,
    transfer_type: Optional[str] = None,
    size: int = 50,
) -> dict:
    """Get whale transactions with caching."""
    redis = get_redis()

    cache_key = f"{WHALE_CACHE_KEY}:{blockchain or 'all'}:{min_usd}:{size}"
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

    # Fetch from both sources concurrently
    tasks = []
    if blockchain == "bitcoin" or blockchain is None:
        tasks.append(_fetch_btc_whales(min_btc=1.0, limit=30))
    if blockchain == "ethereum" or blockchain is None:
        tasks.append(_fetch_eth_whales(min_eth=10.0, limit=30))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_transactions = []
    sources_used = set()
    for result in results:
        if isinstance(result, list):
            all_transactions.extend(result)
            for tx in result:
                sources_used.add(tx.get("source", "unknown"))
        elif isinstance(result, Exception):
            print(f"⚠️ Whale fetch error: {result}")

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
    result = await get_whale_transactions(min_usd=500000, size=100)
    return result.get("stats", {})


async def get_exchange_flows() -> dict:
    result = await get_whale_transactions(min_usd=100000, size=100)
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