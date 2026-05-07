"""
LuxQuant Coin Metadata Worker v2
=================================
v2 changes vs v1:
- MANUAL_OVERRIDES enriched with summary, use_cases, key_features, risk_notes
- CoinGecko fetch extracts description, generates summary
- update_coin() handles 4 new detail columns

Place at:
    /root/luxquant-terminal/backend/app/services/coin_metadata_worker.py
"""

import argparse
import json
import logging
import os
import re
import select
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import httpx
import psycopg2
import psycopg2.extensions
from sqlalchemy import create_engine, text


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)
COINGECKO_API_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGECKO_RATE_LIMIT_SLEEP = 6.5
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


CATEGORY_RULES = [
    {
        "match_keywords": ["stablecoin", "usd stablecoin", "stable coin"],
        "token_type": "stablecoin", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Used as a stable medium of exchange pegged to fiat currency",
            "backed_by_asset": "Backed by reserves (cash, treasury bills, or crypto collateral)"
        },
        "default_use_cases": ["Stable store of value", "Cross-border transfers", "Trading pair base"],
        "default_features": ["1:1 fiat peg", "Reserve-backed", "Fast settlement"],
        "default_risk": "Risk depends on reserve transparency. Algorithmic stablecoins have de-peg risk.",
    },
    {
        "match_keywords": ["tokenized", "real world asset", "rwa"],
        "token_type": "rwa", "sector": "rwa", "has_utility": True,
        "utility_flags": {
            "backed_by_asset": "Token represents ownership of a real-world asset",
            "payments": "Can be transferred peer-to-peer like crypto"
        },
        "default_use_cases": ["On-chain ownership", "Fractional investment", "24/7 trading of traditional assets"],
        "default_features": ["Audited reserves", "Regulated custody", "Redeemable"],
        "default_risk": "Custodial risk. Regulatory uncertainty. Liquidity may be limited.",
    },
    {
        "match_keywords": ["meme", "dog-themed", "cat-themed", "frog-themed"],
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "default_use_cases": ["Community speculation", "Cultural narrative trading"],
        "default_features": ["Community-driven", "High volatility", "No fundamental utility"],
        "default_risk": "Pure speculation driven by hype/social media. High risk of total loss.",
    },
    {
        "match_keywords": ["privacy coin", "privacy"],
        "token_type": "privacy", "sector": "privacy", "has_utility": True,
        "utility_flags": {"payments": "Private peer-to-peer transactions with strong anonymity"},
        "default_use_cases": ["Anonymous payments", "Privacy-preserving transfers"],
        "default_features": ["Cryptographic privacy", "Untraceable transactions"],
        "default_risk": "Delisted from many regulated exchanges. Regulatory pressure.",
    },
    {
        "match_keywords": ["decentralized exchange", "lending", "yield", "defi", "decentralized finance"],
        "token_type": "defi", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on protocol parameters, fees, treasury",
            "staking": "Stake tokens to earn protocol fees / rewards"
        },
        "default_use_cases": ["Protocol governance", "Fee sharing via staking", "Liquidity provision"],
        "default_features": ["Permissionless smart contract", "On-chain transparency"],
        "default_risk": "Smart contract exploit risk. Regulatory risk. Impermanent loss for LPs.",
    },
    {
        "match_keywords": ["artificial intelligence", "ai"],
        "token_type": "utility", "sector": "ai", "has_utility": True,
        "utility_flags": {
            "premium_access": "Pay for AI inference, model training, or compute",
            "staking": "Stake to participate in compute network"
        },
        "default_use_cases": ["Pay for AI compute", "Decentralized model marketplace", "Training data licensing"],
        "default_features": ["AI/ML focused infrastructure", "Token-incentivized compute"],
        "default_risk": "Early-stage tech. Many AI tokens speculative without working product.",
    },
    {
        "match_keywords": ["gaming", "play to earn", "metaverse", "game", "gamefi"],
        "token_type": "utility", "sector": "gamefi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on game parameters",
            "premium_access": "In-game currency and item purchases"
        },
        "default_use_cases": ["In-game currency", "NFT trading", "Play-to-earn rewards"],
        "default_features": ["Game economy token", "NFT integration"],
        "default_risk": "Game must sustain user base. P2E hyperinflation common.",
    },
    {
        "match_keywords": ["layer 1", "layer-1", "smart contract platform", "proof of stake"],
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Required to pay transaction fees",
            "staking": "Stake to validate transactions and secure the network",
            "governance": "On-chain voting for protocol upgrades"
        },
        "default_use_cases": ["Settlement layer", "Smart contract execution", "Network staking"],
        "default_features": ["Native blockchain", "Smart contract enabled", "Validator rewards"],
        "default_risk": "Network competition. Validator centralization. Hard fork risk.",
    },
    {
        "match_keywords": ["layer 2", "layer-2", "scaling", "rollup", "zk-rollup"],
        "token_type": "layer2", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay for L2 transactions (cheaper than L1)",
            "governance": "Vote on sequencer rules and upgrades"
        },
        "default_use_cases": ["Cheaper transactions", "Faster confirmation", "DeFi/NFT scaling"],
        "default_features": ["Inherits L1 security", "Lower fees", "Higher throughput"],
        "default_risk": "Centralized sequencer (early stage). Bridge risk.",
    },
    {
        "match_keywords": ["oracle", "data infrastructure", "decentralized storage", "compute"],
        "token_type": "utility", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "payments": "Pay for data/storage/compute services",
            "staking": "Stake to operate nodes and earn fees"
        },
        "default_use_cases": ["Off-chain data to smart contracts", "Decentralized compute/storage"],
        "default_features": ["Node operator rewards", "Service payment token"],
        "default_risk": "Node operator centralization. Cloud provider competition.",
    },
    {
        "match_keywords": ["exchange-based tokens", "centralized exchange"],
        "token_type": "exchange", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "premium_access": "Trading fee discounts, launchpad access",
            "buyback_burn": "Exchange burns tokens using revenue"
        },
        "default_use_cases": ["Trading fee discount", "Launchpad participation", "VIP tier"],
        "default_features": ["Native exchange utility", "Deflationary burns"],
        "default_risk": "Exchange counterparty risk. Regulatory action impact.",
    },
    {
        "match_keywords": ["socialfi", "social", "music", "creator economy"],
        "token_type": "utility", "sector": "socialfi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on platform decisions",
            "premium_access": "Tip creators, unlock premium content"
        },
        "default_use_cases": ["Creator monetization", "Community governance", "Premium access"],
        "default_features": ["Social platform native token", "Creator-fan economy"],
        "default_risk": "Network effect dependent. Adoption risk.",
    },
    {
        "match_keywords": ["governance", "dao"],
        "token_type": "governance", "sector": "defi", "has_utility": True,
        "utility_flags": {"governance": "Vote on protocol decisions, treasury, parameters"},
        "default_use_cases": ["DAO governance voting", "Protocol direction"],
        "default_features": ["1 token = 1 vote (or weighted)", "Treasury access"],
        "default_risk": "Voter apathy. Whale concentration. Governance attacks.",
    },
]


MANUAL_OVERRIDES = {
    "BTC": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "store_of_value": "Digital scarce asset with hard-capped supply, used as inflation hedge",
            "payments": "Peer-to-peer cash without intermediaries (Lightning Network for fast payments)"
        },
        "coingecko_id": "bitcoin",
        "summary": "Bitcoin is the first and largest decentralized cryptocurrency, created in 2009 by Satoshi Nakamoto. It functions as digital scarce money secured by Proof-of-Work mining, with a hard cap of 21 million coins.",
        "use_cases": [
            "Store of value (digital gold)",
            "Inflation hedge",
            "Censorship-resistant peer-to-peer payments",
            "Cross-border value transfer",
            "Treasury reserve asset (corporations, nation-states)"
        ],
        "key_features": [
            "21,000,000 max supply (hard cap)",
            "Proof-of-Work consensus (SHA-256)",
            "~10 minute block time",
            "Halving every 4 years (supply emission cut by 50%)",
            "First-mover network effect, largest market cap",
            "Lightning Network for instant micro-payments"
        ],
        "risk_notes": "High volatility. Energy-intensive mining draws environmental criticism. Not yield-generating natively. Subject to regulatory action in some jurisdictions.",
    },
    "ETH": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Required to pay for any transaction or smart contract execution on Ethereum",
            "staking": "Stake 32 ETH (or via liquid staking) to validate blocks and earn ~3-5% APY",
            "governance": "Influence over Ethereum Improvement Proposals (EIPs) and network upgrades"
        },
        "coingecko_id": "ethereum",
        "summary": "Ethereum is the leading smart contract platform, hosting the largest ecosystem of DeFi, NFTs, and decentralized applications. ETH is used to pay transaction fees (gas) and to stake for network security.",
        "use_cases": [
            "Pay gas fees for smart contract execution",
            "Stake to secure the network and earn rewards",
            "Collateral in DeFi protocols (lending, derivatives)",
            "Settlement layer for L2 rollups",
            "Native asset of the largest smart contract ecosystem"
        ],
        "key_features": [
            "Proof-of-Stake consensus (since The Merge, 2022)",
            "EIP-1559 fee burn (deflationary under high usage)",
            "Smart contract enabled (EVM)",
            "Largest DeFi/NFT ecosystem by TVL",
            "Settlement layer for major L2s (Arbitrum, Optimism, Base, zkSync)"
        ],
        "risk_notes": "High gas fees during congestion. Validator centralization concerns (Lido stakes >30%). Smart contract exploit risk in dApps.",
    },
    "BNB": {
        "token_type": "exchange", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Native token for BNB Chain — pay gas fees",
            "buyback_burn": "Binance burns BNB quarterly using exchange revenue (target: burn 50% of supply)",
            "premium_access": "Trading fee discounts on Binance, Launchpad participation, VIP tiers"
        },
        "coingecko_id": "binancecoin",
        "summary": "BNB is the native token of the Binance ecosystem, used for trading fee discounts on Binance exchange and as gas token on BNB Chain (a major L1/sidechain).",
        "use_cases": [
            "Trading fee discount on Binance (up to 25%)",
            "Gas fees on BNB Chain",
            "Binance Launchpad participation",
            "DeFi on BNB Chain (PancakeSwap, etc.)",
            "Travel/payment partner network"
        ],
        "key_features": [
            "Quarterly burn mechanism (deflationary)",
            "Native to BNB Chain (separate L1 from Ethereum)",
            "Tied to Binance — world's largest exchange by volume",
            "EVM-compatible chain (low fees vs Ethereum)"
        ],
        "risk_notes": "Heavy dependence on Binance. Regulatory pressure on Binance directly impacts BNB. BNB Chain more centralized than Ethereum.",
    },
    "SOL": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay extremely cheap transaction fees (typically <$0.01)",
            "staking": "Delegate to validators, earn ~6-8% APY"
        },
        "coingecko_id": "solana",
        "summary": "Solana is a high-performance Layer 1 blockchain known for fast (~400ms blocks) and cheap transactions. Hosts a major DeFi/NFT ecosystem and emerging consumer apps.",
        "use_cases": [
            "High-throughput DeFi (Jupiter, Raydium, Drift)",
            "NFT marketplaces (Magic Eden, Tensor)",
            "Consumer apps (Helium Mobile, payments)",
            "Gas + staking native asset"
        ],
        "key_features": [
            "Proof-of-History + Proof-of-Stake consensus",
            "~50,000 TPS theoretical, ~3,000 TPS sustained",
            "Sub-cent transaction fees",
            "Single global state (no sharding)",
            "Major mobile/consumer crypto push (Saga, Seeker phones)"
        ],
        "risk_notes": "History of network outages (less frequent recently). High hardware requirements for validators. FTX bankruptcy overhang.",
    },
    "USDT": {
        "token_type": "stablecoin", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Stable digital dollar for trading, remittance, and DeFi",
            "backed_by_asset": "Claimed 1:1 reserve backing (cash equivalents + treasury bills)"
        },
        "coingecko_id": "tether",
        "summary": "Tether (USDT) is the largest stablecoin by market cap, pegged 1:1 to USD. Issued by Tether Limited and used as the dominant trading pair on most exchanges.",
        "use_cases": [
            "Trading pair base on virtually all exchanges",
            "Cross-border remittance (especially in emerging markets)",
            "DeFi collateral & liquidity",
            "Hedge from volatile crypto positions"
        ],
        "key_features": [
            "1:1 USD peg",
            "Multi-chain (Ethereum, Tron, Solana, BNB Chain, etc.)",
            "Largest stablecoin by market cap and volume",
            "Quarterly attestations (not full audit)"
        ],
        "risk_notes": "Reserves not fully audited (only attestations). Centralized issuer can freeze addresses. Tron USDT widely used in illicit/sanctioned activity.",
    },
    "USDC": {
        "token_type": "stablecoin", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Regulated stable digital dollar",
            "backed_by_asset": "1:1 backed by cash and short-term US treasuries, monthly attestations"
        },
        "coingecko_id": "usd-coin",
        "summary": "USD Coin (USDC) is a regulated stablecoin issued by Circle, fully backed by cash and short-term US treasuries. Generally considered the most transparent major stablecoin.",
        "use_cases": [
            "Institutional-grade stablecoin for payments and DeFi",
            "Trading pair (especially on US-friendly venues)",
            "Cross-border B2B payments",
            "Treasury holdings for crypto-native companies"
        ],
        "key_features": [
            "1:1 USD peg",
            "Monthly attestations by Big Four firm",
            "Regulated issuer (Circle, NYDFS BitLicense)",
            "Multi-chain (Ethereum, Solana, Base, Arbitrum, etc.)"
        ],
        "risk_notes": "Bank exposure risk (had brief de-peg during SVB collapse, March 2023). Issuer can freeze addresses. US regulatory dependency.",
    },
    "DOGE": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "dogecoin",
        "summary": "Dogecoin started as a 2013 joke based on the Shiba Inu meme. It has no fundamental utility but maintains a large community and culture-driven adoption, partly fueled by Elon Musk endorsements.",
        "use_cases": [
            "Community tipping",
            "Speculation on hype cycles",
            "Charity drives (occasional)"
        ],
        "key_features": [
            "Inflationary supply (no cap, ~5B new coins/year)",
            "Proof-of-Work (merge-mined with Litecoin)",
            "Strong meme/cultural status",
            "Frequent Elon Musk references"
        ],
        "risk_notes": "Pure speculation. No development roadmap. Price highly correlated with social media sentiment. Inflationary supply dilutes holders.",
    },
    "SHIB": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "shiba-inu",
        "summary": "Shiba Inu is an Ethereum-based meme token launched in 2020. Despite claims of an ecosystem (Shibarium L2, ShibaSwap), the vast majority of activity remains speculative.",
        "use_cases": [
            "Meme speculation",
            "Limited DeFi via ShibaSwap",
            "Burn ceremonies / community ritual"
        ],
        "key_features": [
            "Massive supply (~589 trillion)",
            "Burn mechanism reducing supply over time",
            "Has Shibarium L2 (limited adoption)",
            "Strong online community ('SHIB Army')"
        ],
        "risk_notes": "Speculative meme asset. Token supply manipulation history (Vitalik burned 410T donated tokens). Limited real utility despite ecosystem claims.",
    },
    "PEPE": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "pepe",
        "summary": "Pepe is a meme token launched in April 2023, themed around the Pepe the Frog meme. Pure speculation with no roadmap or utility.",
        "use_cases": ["Pure meme speculation", "Community-driven trading"],
        "key_features": [
            "Fixed supply (~420.69 trillion)",
            "No team / 'fair launch'",
            "Ethereum ERC-20",
            "Strong meme cycle association"
        ],
        "risk_notes": "Pure speculation. No utility, no team, no roadmap. High volatility. Many fake forks/scams use the Pepe brand.",
    },
    "BONK": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "bonk",
        "summary": "Bonk is a Solana-based meme token launched in late 2022. Often credited with sparking the Solana meme coin season.",
        "use_cases": ["Solana ecosystem meme", "Speculation"],
        "key_features": [
            "Solana SPL token",
            "Airdropped to Solana community at launch",
            "First major Solana meme coin"
        ],
        "risk_notes": "Speculative. Tied to Solana ecosystem sentiment. No fundamental utility.",
    },
    "1000PEPE":  {"_alias": "PEPE"},
    "1000BONK":  {"_alias": "BONK"},
    "1000SATS":  {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "sats-ordinals",
        "summary": "1000SATS is a perpetual contract pair representing 1000 SATS Ordinals tokens (BRC-20 on Bitcoin). Speculative meme token within the Bitcoin Ordinals ecosystem.",
        "use_cases": ["Bitcoin Ordinals speculation"],
        "key_features": ["BRC-20 token on Bitcoin", "Ordinals-themed meme"],
        "risk_notes": "Highly speculative. BRC-20 standard is experimental. Liquidity tied to Ordinals hype cycle.",
    },
    "1000RATS":  {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "rats-ordinals",
        "summary": "1000RATS is a perpetual contract pair representing 1000 RATS Ordinals tokens. Pure meme/speculation within the BRC-20 ecosystem.",
        "use_cases": ["Bitcoin Ordinals speculation"],
        "key_features": ["BRC-20 token on Bitcoin"],
        "risk_notes": "Highly speculative meme. No utility. Heavy reliance on Ordinals narrative.",
    },
    "MEME": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "memecoin-2",
        "summary": "MEME is a token from Memeland (9GAG ecosystem). Themed around meme culture with NFT integration but largely speculative.",
        "use_cases": ["Memeland ecosystem", "NFT-related speculation"],
        "key_features": ["Linked to 9GAG / Memeland NFT collection"],
        "risk_notes": "Speculative. NFT market dependent. Limited real utility.",
    },
}


def get_http_client() -> httpx.Client:
    headers = {"accept": "application/json"}
    if COINGECKO_API_KEY:
        headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
    return httpx.Client(timeout=15.0, headers=headers)


def coingecko_search(symbol: str, client: httpx.Client) -> Optional[str]:
    try:
        r = client.get(f"{COINGECKO_API_BASE}/search", params={"query": symbol})
        if r.status_code != 200:
            logger.warning(f"CoinGecko search {symbol}: HTTP {r.status_code}")
            return None
        coins = r.json().get("coins", [])
        if not coins:
            return None
        for c in coins:
            if c.get("symbol", "").upper() == symbol.upper():
                return c.get("id")
        return coins[0].get("id")
    except Exception as e:
        logger.error(f"CoinGecko search failed for {symbol}: {e}")
        return None


def coingecko_fetch_coin(coingecko_id: str, client: httpx.Client) -> Optional[Dict[str, Any]]:
    try:
        params = {"localization": "false", "tickers": "false", "market_data": "true",
                  "community_data": "false", "developer_data": "false"}
        r = client.get(f"{COINGECKO_API_BASE}/coins/{coingecko_id}", params=params)
        if r.status_code != 200:
            logger.warning(f"CoinGecko fetch {coingecko_id}: HTTP {r.status_code}")
            return None
        return r.json()
    except Exception as e:
        logger.error(f"CoinGecko fetch failed for {coingecko_id}: {e}")
        return None


def _clean_description(raw_desc: str, max_chars: int = 600) -> str:
    if not raw_desc:
        return ""
    text_clean = re.sub(r'<[^>]+>', '', raw_desc)
    text_clean = re.sub(r'\s+', ' ', text_clean).strip()
    if len(text_clean) > max_chars:
        cutoff = text_clean[:max_chars].rfind('. ')
        if cutoff > max_chars * 0.6:
            text_clean = text_clean[:cutoff + 1]
        else:
            text_clean = text_clean[:max_chars] + "..."
    return text_clean


def categorize_from_coingecko(coin_data: Dict[str, Any]) -> Dict[str, Any]:
    categories = [c.lower() for c in (coin_data.get("categories") or []) if c]
    for rule in CATEGORY_RULES:
        for kw in rule["match_keywords"]:
            if any(kw in cat for cat in categories):
                return {
                    "token_type": rule["token_type"], "sector": rule["sector"],
                    "has_utility": rule["has_utility"],
                    "utility_flags": rule["utility_flags"],
                    "categories_raw": categories,
                    "default_use_cases": rule.get("default_use_cases", []),
                    "default_features": rule.get("default_features", []),
                    "default_risk": rule.get("default_risk", ""),
                }
    return {
        "token_type": "utility", "sector": "other", "has_utility": True,
        "utility_flags": {}, "categories_raw": categories,
        "default_use_cases": ["See project description"],
        "default_features": ["Categorization pending manual review"],
        "default_risk": "This token has not been auto-categorized. Review project fundamentals carefully.",
    }


def get_pending_coins(limit: int = BATCH_LIMIT) -> List[Dict[str, Any]]:
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol FROM coins
            WHERE review_status = 'pending' ORDER BY pair LIMIT :limit
        """), {"limit": limit}).fetchall()
        return [{"pair": r[0], "base_symbol": r[1], "quote_symbol": r[2]} for r in rows]


def get_stale_coins(days: int = STALE_THRESHOLD_DAYS, limit: int = BATCH_LIMIT) -> List[Dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol, coingecko_id FROM coins
            WHERE last_fetched_at IS NULL OR last_fetched_at < :cutoff
            ORDER BY last_fetched_at NULLS FIRST LIMIT :limit
        """), {"cutoff": cutoff, "limit": limit}).fetchall()
        return [{"pair": r[0], "base_symbol": r[1], "quote_symbol": r[2], "coingecko_id": r[3]} for r in rows]


def get_coin_by_pair(pair: str) -> Optional[Dict[str, Any]]:
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol, coingecko_id, review_status
            FROM coins WHERE pair = :pair
        """), {"pair": pair}).fetchone()
        if not row:
            return None
        return {"pair": row[0], "base_symbol": row[1], "quote_symbol": row[2],
                "coingecko_id": row[3], "review_status": row[4]}


def update_coin(pair: str, updates: Dict[str, Any]) -> bool:
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE coins SET
                    token_type=:token_type, sector=:sector, has_utility=:has_utility,
                    utility_details=CAST(:utility_details AS JSONB),
                    coingecko_id=COALESCE(:coingecko_id, coingecko_id),
                    market_cap_rank=:market_cap_rank, market_cap_usd=:market_cap_usd,
                    description=:description, website=:website,
                    categories_raw=CAST(:categories_raw AS JSONB),
                    summary=:summary,
                    use_cases=CAST(:use_cases AS JSONB),
                    key_features=CAST(:key_features AS JSONB),
                    risk_notes=:risk_notes,
                    review_status=:review_status, metadata_source=:metadata_source,
                    last_fetched_at=NOW(), fetch_error=NULL, updated_at=NOW()
                WHERE pair=:pair
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
                "summary": updates.get("summary"),
                "use_cases": json.dumps(updates.get("use_cases", [])),
                "key_features": json.dumps(updates.get("key_features", [])),
                "risk_notes": updates.get("risk_notes"),
                "review_status": updates.get("review_status", "auto_categorized"),
                "metadata_source": updates.get("metadata_source", "coingecko"),
            })
        return True
    except Exception as e:
        logger.error(f"Failed to update coin {pair}: {e}")
        return False


def mark_fetch_error(pair: str, error_msg: str):
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE coins SET fetch_error=:err, last_fetched_at=NOW() WHERE pair=:pair
            """), {"pair": pair, "err": error_msg[:500]})
    except Exception as e:
        logger.error(f"Failed to mark error for {pair}: {e}")


def _resolve_alias(base_symbol: str) -> Optional[Dict[str, Any]]:
    override = MANUAL_OVERRIDES.get(base_symbol)
    if not override:
        return None
    if "_alias" in override:
        return MANUAL_OVERRIDES.get(override["_alias"])
    return override


def process_coin(coin: Dict[str, Any], client: httpx.Client) -> bool:
    pair = coin["pair"]
    base_symbol = coin["base_symbol"].upper()

    override = _resolve_alias(base_symbol)
    if override:
        logger.info(f"[{pair}] Applying manual override")
        updates = {
            "token_type": override["token_type"],
            "sector": override["sector"],
            "has_utility": override["has_utility"],
            "utility_flags": override["utility_flags"],
            "coingecko_id": override.get("coingecko_id"),
            "summary": override.get("summary"),
            "use_cases": override.get("use_cases", []),
            "key_features": override.get("key_features", []),
            "risk_notes": override.get("risk_notes"),
            "categories_raw": ["manual_override"],
            "review_status": "auto_categorized",
            "metadata_source": "manual",
        }
        return update_coin(pair, updates)

    logger.info(f"[{pair}] Searching CoinGecko for {base_symbol}")
    coingecko_id = coin.get("coingecko_id") or coingecko_search(base_symbol, client)
    if not coingecko_id:
        logger.warning(f"[{pair}] No CoinGecko match found")
        mark_fetch_error(pair, "no_coingecko_match")
        return False

    time.sleep(COINGECKO_RATE_LIMIT_SLEEP)

    coin_data = coingecko_fetch_coin(coingecko_id, client)
    if not coin_data:
        mark_fetch_error(pair, f"fetch_failed:{coingecko_id}")
        return False

    cat = categorize_from_coingecko(coin_data)
    market_data = coin_data.get("market_data") or {}

    raw_description = (coin_data.get("description") or {}).get("en", "")
    cleaned = _clean_description(raw_description, 600)

    coin_name = coin_data.get("name") or base_symbol
    summary = (
        f"{coin_name} ({base_symbol}) is a {cat['token_type']} token in the {cat['sector']} sector. "
        + (cleaned[:300] if cleaned else "Auto-categorized from CoinGecko data.")
    )

    updates = {
        **cat,
        "coingecko_id": coingecko_id,
        "market_cap_rank": coin_data.get("market_cap_rank"),
        "market_cap_usd": (market_data.get("market_cap") or {}).get("usd"),
        "description": cleaned[:1000],
        "website": ((coin_data.get("links") or {}).get("homepage") or [None])[0],
        "summary": summary[:800],
        "use_cases": cat.get("default_use_cases", []),
        "key_features": cat.get("default_features", []),
        "risk_notes": cat.get("default_risk"),
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


def run_pending_batch():
    logger.info("=" * 60)
    logger.info("Mode: PENDING BATCH")
    logger.info("=" * 60)
    client = get_http_client()
    total_processed = total_success = total_failed = 0
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
    logger.info(f"DONE — processed={total_processed} success={total_success} failed={total_failed}")


def run_single_pair(pair: str):
    logger.info(f"Mode: SINGLE PAIR — {pair}")
    coin = get_coin_by_pair(pair)
    if not coin:
        logger.error(f"Pair {pair} not found in coins table.")
        return
    client = get_http_client()
    ok = process_coin(coin, client)
    client.close()
    logger.info(f"Result: {'SUCCESS' if ok else 'FAILED'}")


def run_listen_daemon():
    logger.info(f"Mode: DAEMON — LISTEN {LISTEN_CHANNEL}")
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute(f"LISTEN {LISTEN_CHANNEL};")
    logger.info(f"Listening on '{LISTEN_CHANNEL}'...")
    client = get_http_client()
    try:
        while True:
            if select.select([conn], [], [], 60) == ([], [], []):
                continue
            conn.poll()
            while conn.notifies:
                notify = conn.notifies.pop(0)
                pair = notify.payload
                logger.info(f"NOTIFY received: {pair}")
                coin = get_coin_by_pair(pair)
                if coin and coin["review_status"] == "pending":
                    process_coin(coin, client)
    except KeyboardInterrupt:
        logger.info("Shutting down daemon...")
    finally:
        client.close()
        cur.close()
        conn.close()


def run_refresh_stale():
    logger.info(f"Mode: REFRESH STALE (>{STALE_THRESHOLD_DAYS} days)")
    client = get_http_client()
    coins = get_stale_coins()
    logger.info(f"Found {len(coins)} stale coins")
    for coin in coins:
        process_coin(coin, client)
    client.close()


def main():
    parser = argparse.ArgumentParser(description="LuxQuant Coin Metadata Worker v2")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pending", action="store_true")
    group.add_argument("--pair", type=str)
    group.add_argument("--listen", action="store_true")
    group.add_argument("--refresh-stale", action="store_true")
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
