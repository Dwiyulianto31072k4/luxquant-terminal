"""
Market Overview Router — New endpoints for Markets Page
Supplements existing market.py with:
  - DeFi TVL (DefiLlama, free)
  - Stablecoins (DefiLlama, free)
  - Liquidations (Binance Futures, free)
  - ETF Flows (SoSoValue, free key)
  - Crypto News general (RSS, free)
  - Heatmap data helper
  - Combined /markets-page endpoint
"""
from fastapi import APIRouter, HTTPException, Query
import httpx
import asyncio
import os
import time
import hashlib
from datetime import datetime, timezone
from typing import Optional, List
from xml.etree import ElementTree
import re
import html as html_mod

from app.core.redis import cache_get, cache_set, cache_get_with_stale
from app.config import settings

router = APIRouter(tags=["market-overview"])

TIMEOUT = 15.0

# ── External API base URLs ──
DEFILLAMA_API = "https://api.llama.fi"
STABLECOINS_API = "https://stablecoins.llama.fi"
BINANCE_FUTURES = "https://fapi.binance.com"
SOSOVALUE_API = "https://openapi.sosovalue.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"

CG_API_KEY = settings.COINGECKO_API_KEY
CG_HEADERS = {"accept": "application/json"}
if CG_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_API_KEY

SOSO_API_KEY = settings.SOSOVALUE_API_KEY
SOSO_HEADERS = {}
if SOSO_API_KEY:
    SOSO_HEADERS["x-soso-api-key"] = SOSO_API_KEY


# ════════════════════════════════════════════
# 1. DEFI TVL — DefiLlama (free, no key)
# ════════════════════════════════════════════

@router.get("/defi")
async def get_defi_overview():
    """
    DeFi overview:
    - Top chains by TVL
    - Top protocols by TVL
    - Total DeFi TVL
    All from DefiLlama free API.
    Cached 300s.
    """
    cached = cache_get("lq:mkt:defi")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            chains_res, protocols_res = await asyncio.gather(
                client.get(f"{DEFILLAMA_API}/v2/chains"),
                client.get(f"{DEFILLAMA_API}/protocols"),
                return_exceptions=True,
            )

            # ── Chains ──
            chains = []
            total_tvl = 0
            if not isinstance(chains_res, Exception) and chains_res.status_code == 200:
                raw_chains = chains_res.json()
                # Sort by TVL desc
                raw_chains.sort(key=lambda x: x.get("tvl", 0) or 0, reverse=True)
                for c in raw_chains[:20]:
                    tvl = c.get("tvl", 0) or 0
                    total_tvl += tvl
                    chains.append({
                        "name": c.get("name", ""),
                        "tvl": tvl,
                        "tokenSymbol": c.get("tokenSymbol"),
                        "gecko_id": c.get("gecko_id"),
                    })

            # ── Protocols ──
            protocols = []
            if not isinstance(protocols_res, Exception) and protocols_res.status_code == 200:
                raw_protocols = protocols_res.json()
                # Sort by TVL desc
                raw_protocols.sort(key=lambda x: x.get("tvl", 0) or 0, reverse=True)
                for p in raw_protocols[:20]:
                    protocols.append({
                        "name": p.get("name", ""),
                        "tvl": p.get("tvl", 0) or 0,
                        "change_1d": p.get("change_1d"),
                        "change_7d": p.get("change_7d"),
                        "category": p.get("category", ""),
                        "chains": (p.get("chains") or [])[:3],
                        "logo": p.get("logo", ""),
                        "symbol": p.get("symbol", ""),
                    })

            result = {
                "totalTvl": total_tvl,
                "chains": chains,
                "protocols": protocols,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            cache_set("lq:mkt:defi", result, ttl=300)
            return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DeFi API error: {str(e)}")


# ════════════════════════════════════════════
# 2. STABLECOINS — DefiLlama (free, no key)
# ════════════════════════════════════════════

@router.get("/stablecoins")
async def get_stablecoins():
    """
    Stablecoin market data:
    - Total stablecoin market cap
    - Top stablecoins by mcap (USDT, USDC, DAI, etc.)
    From DefiLlama stablecoins API (free).
    Cached 300s.
    """
    cached = cache_get("lq:mkt:stablecoins")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{STABLECOINS_API}/stablecoins?includePrices=true")
            res.raise_for_status()
            data = res.json()

            stables = []
            total_mcap = 0
            for s in data.get("peggedAssets", []):
                mcap = 0
                chains_data = s.get("chainCirculating", {})
                for chain_val in chains_data.values():
                    mcap += chain_val.get("current", {}).get("peggedUSD", 0) or 0

                if mcap < 1_000_000:
                    continue

                total_mcap += mcap
                stables.append({
                    "name": s.get("name", ""),
                    "symbol": s.get("symbol", ""),
                    "mcap": mcap,
                    "gecko_id": s.get("gecko_id"),
                    "pegType": s.get("pegType", ""),
                    "pegMechanism": s.get("pegMechanism", ""),
                    "chains": len(chains_data),
                })

            # Sort by mcap
            stables.sort(key=lambda x: x["mcap"], reverse=True)

            result = {
                "totalMcap": total_mcap,
                "stablecoins": stables[:15],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            cache_set("lq:mkt:stablecoins", result, ttl=300)
            return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stablecoins API error: {str(e)}")


# ════════════════════════════════════════════
# 3. LIQUIDATIONS — OKX Public API (free, no key)
# ════════════════════════════════════════════

OKX_API = "https://www.okx.com"

@router.get("/liquidations")
async def get_liquidations():
    """
    Recent forced liquidation orders from OKX.
    Public endpoint, no key needed.
    Cached 30s.
    """
    cached = cache_get("lq:mkt:liquidations")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            all_liqs = []
            underlyings = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "DOGE-USDT",
                           "BNB-USDT", "ADA-USDT", "AVAX-USDT", "LINK-USDT", "SUI-USDT"]

            tasks = []
            for uly in underlyings:
                tasks.append(
                    client.get(
                        f"{OKX_API}/api/v5/public/liquidation-orders",
                        params={"instType": "SWAP", "uly": uly, "state": "filled", "limit": "5"},
                    )
                )
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, res in enumerate(results):
                if isinstance(res, Exception) or res.status_code != 200:
                    continue
                body = res.json()
                if body.get("code") != "0":
                    continue
                symbol = underlyings[i].split("-")[0]  # BTC, ETH, etc.
                for item in body.get("data", []):
                    for detail in item.get("details", []):
                        sz = float(detail.get("sz", 0))
                        bk_px = float(detail.get("bkPx", 0))
                        pos_side = detail.get("posSide", "")  # long or short
                        side = detail.get("side", "")  # buy = short liq, sell = long liq
                        usd_val = round(sz * bk_px, 2)
                        ts = int(detail.get("ts", 0))

                        all_liqs.append({
                            "symbol": symbol,
                            "side": side.upper(),  # BUY or SELL
                            "posSide": pos_side,
                            "qty": sz,
                            "price": bk_px,
                            "usd": usd_val,
                            "time": ts,
                        })

            # Sort by time desc
            all_liqs.sort(key=lambda x: x["time"], reverse=True)

            # Summary
            total_liq_usd = sum(l["usd"] for l in all_liqs)
            # side=sell means long got liquidated, side=buy means short got liquidated
            long_liqs = sum(l["usd"] for l in all_liqs if l["side"] == "SELL")
            short_liqs = sum(l["usd"] for l in all_liqs if l["side"] == "BUY")

            result = {
                "recent": all_liqs[:30],
                "summary": {
                    "total_usd": total_liq_usd,
                    "long_liquidated": long_liqs,
                    "short_liquidated": short_liqs,
                    "count": len(all_liqs),
                },
                "source": "OKX",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            cache_set("lq:mkt:liquidations", result, ttl=30)
            return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Liquidations error: {str(e)}")


# ════════════════════════════════════════════
# 4. ETF FLOWS — SoSoValue (free beta key)
# ════════════════════════════════════════════

@router.get("/etf-flows")
async def get_etf_flows():
    """
    Bitcoin & Ethereum ETF flows from SoSoValue API v2.
    POST to api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart
    Cached 600s (10min).
    """
    if not SOSO_API_KEY:
        return {"error": "SoSoValue API key not configured", "btc": None, "eth": None}

    cached = cache_get("lq:mkt:etf-flows")
    if cached:
        return cached

    SOSO_BASE = "https://api.sosovalue.xyz"
    headers = {
        "x-soso-api-key": SOSO_API_KEY,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_res, eth_res = await asyncio.gather(
                client.post(
                    f"{SOSO_BASE}/openapi/v2/etf/historicalInflowChart",
                    json={"type": "us-btc-spot"},
                    headers=headers,
                ),
                client.post(
                    f"{SOSO_BASE}/openapi/v2/etf/historicalInflowChart",
                    json={"type": "us-eth-spot"},
                    headers=headers,
                ),
                return_exceptions=True,
            )

            def parse_etf(res):
                if isinstance(res, Exception) or res.status_code != 200:
                    return None
                body = res.json()
                if body.get("code") != 0:
                    return None
                # API returns data as direct array (not data.list)
                items = body.get("data", [])
                if isinstance(items, dict):
                    items = items.get("list", [])
                return {
                    "total": len(items),
                    "records": [
                        {
                            "date": r.get("date", ""),
                            "netFlow": r.get("totalNetInflow"),
                            "totalAum": r.get("totalNetAssets"),
                            "volume": r.get("totalValueTraded"),
                            "cumNetInflow": r.get("cumNetInflow"),
                        }
                        for r in items[:10]
                    ],
                }

            result = {
                "btc": parse_etf(btc_res),
                "eth": parse_etf(eth_res),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            cache_set("lq:mkt:etf-flows", result, ttl=600)
            return result

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ETF flows error: {str(e)}")


# ════════════════════════════════════════════
# 5. CRYPTO NEWS — RSS (free, no key)
# ════════════════════════════════════════════

RSS_FEEDS = [
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "source": "CoinDesk"},
    {"url": "https://cointelegraph.com/rss", "source": "CoinTelegraph"},
    {"url": "https://decrypt.co/feed", "source": "Decrypt"},
]

def _extract_image(entry_xml):
    """Extract image from RSS item."""
    # Try media:content
    for ns in ["http://search.yahoo.com/mrss/", "media"]:
        for tag in entry_xml.findall(f".//{{{ns}}}content"):
            url = tag.get("url", "")
            if url and any(ext in url.lower() for ext in [".jpg", ".png", ".webp", ".jpeg"]):
                return url
    # Try media:thumbnail
    for ns in ["http://search.yahoo.com/mrss/", "media"]:
        for tag in entry_xml.findall(f".//{{{ns}}}thumbnail"):
            url = tag.get("url", "")
            if url:
                return url
    # Try enclosure
    for enc in entry_xml.findall("enclosure"):
        if "image" in (enc.get("type", "")):
            return enc.get("url", "")
    # Try content:encoded for <img> tag
    for ns in ["http://purl.org/rss/1.0/modules/content/"]:
        encoded = entry_xml.find(f"{{{ns}}}encoded")
        if encoded is not None and encoded.text:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', encoded.text)
            if m:
                return m.group(1)
    # Description img
    desc = entry_xml.find("description")
    if desc is not None and desc.text:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc.text)
        if m:
            return m.group(1)
    return None


def _time_ago(pub_str):
    """Convert pubDate to '2h ago' format."""
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub_str)
        diff = datetime.now(timezone.utc) - dt
        mins = int(diff.total_seconds() / 60)
        if mins < 60:
            return f"{mins}m ago"
        hours = mins // 60
        if hours < 24:
            return f"{hours}h ago"
        return f"{hours // 24}d ago"
    except:
        return ""


@router.get("/crypto-news")
async def get_crypto_news():
    """
    General crypto news aggregated from RSS feeds.
    Cached 300s.
    """
    cached = cache_get("lq:mkt:crypto-news")
    if cached:
        return cached

    articles = []
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        tasks = [client.get(f["url"]) for f in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, res in enumerate(results):
            if isinstance(res, Exception) or res.status_code != 200:
                continue
            try:
                root = ElementTree.fromstring(res.content)
                items = root.findall(".//item")[:10]
                for item in items:
                    title = item.find("title")
                    link = item.find("link")
                    desc = item.find("description")
                    pub = item.find("pubDate")
                    author_el = item.find("{http://purl.org/dc/elements/1.1/}creator")

                    desc_text = ""
                    if desc is not None and desc.text:
                        clean = re.sub(r"<[^>]+>", "", desc.text)
                        desc_text = html_mod.unescape(clean).strip()[:200]

                    articles.append({
                        "title": title.text.strip() if title is not None and title.text else "",
                        "link": link.text.strip() if link is not None and link.text else "",
                        "description": desc_text,
                        "source": RSS_FEEDS[i]["source"],
                        "author": author_el.text.strip() if author_el is not None and author_el.text else None,
                        "pubDate": pub.text.strip() if pub is not None and pub.text else "",
                        "time_ago": _time_ago(pub.text.strip()) if pub is not None and pub.text else "",
                        "image": _extract_image(item),
                    })
            except:
                continue

    # Sort by pubDate desc
    def _parse_date(a):
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(a["pubDate"]).timestamp()
        except:
            return 0
    articles.sort(key=_parse_date, reverse=True)

    result = {"articles": articles[:30], "total": len(articles)}
    cache_set("lq:mkt:crypto-news", result, ttl=300)
    return result


# ════════════════════════════════════════════
# 6. HEATMAP DATA — from existing coins
# ════════════════════════════════════════════

@router.get("/heatmap")
async def get_heatmap_data():
    """
    Top 50 coins formatted for treemap/heatmap visualization.
    Size = market_cap, Color = price_change_24h.
    Uses CoinGecko coins/markets.
    Cached 120s, stale fallback on rate-limit.
    """
    cached = cache_get("lq:mkt:heatmap")
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(
                f"{COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 50,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "1h,24h,7d",
                },
                headers=CG_HEADERS,
            )
            if res.status_code == 429:
                stale, _ = cache_get_with_stale("lq:mkt:heatmap")
                if stale:
                    return stale
                raise HTTPException(status_code=429, detail="CoinGecko rate limited")
            res.raise_for_status()
            coins = res.json()

            heatmap = []
            for c in coins:
                mcap = c.get("market_cap", 0) or 0
                if mcap < 1:
                    continue
                heatmap.append({
                    "id": c.get("id"),
                    "symbol": (c.get("symbol") or "").upper(),
                    "name": c.get("name", ""),
                    "image": c.get("image", ""),
                    "price": c.get("current_price", 0),
                    "mcap": mcap,
                    "change_1h": c.get("price_change_percentage_1h_in_currency"),
                    "change_24h": c.get("price_change_percentage_24h"),
                    "change_7d": c.get("price_change_percentage_7d_in_currency"),
                    "volume": c.get("total_volume", 0),
                })

            result = {"coins": heatmap, "count": len(heatmap)}
            cache_set("lq:mkt:heatmap", result, ttl=120)
            return result

    except HTTPException:
        raise
    except Exception as e:
        # Stale fallback on any error
        stale, _ = cache_get_with_stale("lq:mkt:heatmap")
        if stale:
            return stale
        raise HTTPException(status_code=502, detail=f"Heatmap error: {str(e)}")


# ════════════════════════════════════════════
# 7. COMBINED — All Markets Page data
# ════════════════════════════════════════════

@router.get("/markets-page")
async def get_markets_page_data():
    """
    Combined endpoint: fetch all Markets Page sections in parallel.
    Returns cached data where available, fetches fresh otherwise.
    Frontend calls this once on page load.
    """
    # Try to get each section from cache first, fetch if missing
    sections = {
        "defi": cache_get("lq:mkt:defi"),
        "stablecoins": cache_get("lq:mkt:stablecoins"),
        "liquidations": cache_get("lq:mkt:liquidations"),
        "etfFlows": cache_get("lq:mkt:etf-flows"),
        "cryptoNews": cache_get("lq:mkt:crypto-news"),
        "heatmap": cache_get("lq:mkt:heatmap"),
    }

    # Find which sections need fetching
    fetch_tasks = {}
    if not sections["defi"]:
        fetch_tasks["defi"] = get_defi_overview()
    if not sections["stablecoins"]:
        fetch_tasks["stablecoins"] = get_stablecoins()
    if not sections["liquidations"]:
        fetch_tasks["liquidations"] = get_liquidations()
    if not sections["etfFlows"]:
        fetch_tasks["etfFlows"] = get_etf_flows()
    if not sections["cryptoNews"]:
        fetch_tasks["cryptoNews"] = get_crypto_news()
    if not sections["heatmap"]:
        fetch_tasks["heatmap"] = get_heatmap_data()

    if fetch_tasks:
        keys = list(fetch_tasks.keys())
        results = await asyncio.gather(
            *[fetch_tasks[k] for k in keys],
            return_exceptions=True,
        )
        for i, key in enumerate(keys):
            if not isinstance(results[i], Exception):
                sections[key] = results[i]
            else:
                sections[key] = None

    # Also include data from existing market.py endpoints (via cache)
    sections["global"] = cache_get("lq:market:global")
    sections["trending"] = cache_get("lq:market:trending")
    sections["categories"] = cache_get("lq:market:categories")
    sections["derivativesPulse"] = cache_get("lq:market:deriv-pulse")

    return sections