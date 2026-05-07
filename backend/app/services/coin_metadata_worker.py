"""
LuxQuant Coin Metadata Worker v3.1
====================================
v3.1 fixes:
- CRITICAL FIX: ecosystem tags filtered out (X ecosystem, X chain)
- Rule order reorganized: specific identifiers first, generic last
- Smarter category matching: priority on first 10 non-ecosystem categories
- Expanded MANUAL_OVERRIDES (LINK, AAVE, UNI, ARB, OP, MATIC, ADA, AVAX, etc.)

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
COINGECKO_KEY_TYPE = os.getenv("COINGECKO_KEY_TYPE", "demo")
COINGECKO_RATE_LIMIT_SLEEP = float(os.getenv(
    "COINGECKO_SLEEP",
    "2.0" if COINGECKO_API_KEY else "12.0"
))
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 30.0
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
# CATEGORY RULES — REORDERED BY SPECIFICITY (most specific first)
# ============================================================
CATEGORY_RULES = [
    # ── Oracle (must come BEFORE rwa/defi because oracle coins often tagged with rwa) ──
    {
        "match_keywords": ["oracle"],
        "token_type": "utility", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "payments": "Pay for off-chain data feeds (price, weather, sports, etc.)",
            "staking": "Stake LINK to operate oracle nodes and earn fees"
        },
        "default_use_cases": ["Provide off-chain data to smart contracts", "Cross-chain communication", "Verifiable randomness (VRF)"],
        "default_features": ["Decentralized oracle network", "Node operator rewards", "Industry-standard for DeFi data feeds"],
        "default_risk": "Node centralization. Cloud provider competition. Relies on data source quality.",
    },
    # ── Stablecoins (very specific category) ──
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
    # ── Privacy (specific identifier) ──
    {
        "match_keywords": ["privacy coin", "anonymous"],
        "token_type": "privacy", "sector": "privacy", "has_utility": True,
        "utility_flags": {"payments": "Private peer-to-peer transactions with strong anonymity"},
        "default_use_cases": ["Anonymous payments", "Privacy-preserving transfers"],
        "default_features": ["Cryptographic privacy", "Untraceable transactions"],
        "default_risk": "Delisted from many regulated exchanges. Regulatory pressure.",
    },
    # ── Layer 2 (must come BEFORE Layer 1 — substring "layer" overlap) ──
    {
        "match_keywords": ["layer 2", "layer-2", "rollup", "zk-rollup", "optimistic rollup"],
        "token_type": "layer2", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay for L2 transactions (cheaper than L1)",
            "governance": "Vote on sequencer rules and upgrades"
        },
        "default_use_cases": ["Cheaper transactions", "Faster confirmation", "DeFi/NFT scaling"],
        "default_features": ["Inherits L1 security", "Lower fees", "Higher throughput"],
        "default_risk": "Centralized sequencer (early stage). Bridge risk.",
    },
    # ── Layer 1 ──
    {
        "match_keywords": ["layer 1", "layer-1", "smart contract platform", "proof of stake", "proof-of-stake"],
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
    # ── Meme (specific) ──
    {
        "match_keywords": ["meme", "dog-themed", "cat-themed", "frog-themed"],
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "default_use_cases": ["Community speculation", "Cultural narrative trading"],
        "default_features": ["Community-driven", "High volatility", "No fundamental utility"],
        "default_risk": "Pure speculation driven by hype/social media. High risk of total loss.",
    },
    # ── AI (specific) ──
    {
        "match_keywords": ["artificial intelligence (ai)", "ai agent"],
        "token_type": "utility", "sector": "ai", "has_utility": True,
        "utility_flags": {
            "premium_access": "Pay for AI inference, model training, or compute",
            "staking": "Stake to participate in compute network"
        },
        "default_use_cases": ["Pay for AI compute", "Decentralized model marketplace", "Training data licensing"],
        "default_features": ["AI/ML focused infrastructure", "Token-incentivized compute"],
        "default_risk": "Early-stage tech. Many AI tokens speculative without working product.",
    },
    # ── Gaming (specific) ──
    {
        "match_keywords": ["gaming", "play to earn", "metaverse", "gamefi"],
        "token_type": "utility", "sector": "gamefi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on game parameters",
            "premium_access": "In-game currency and item purchases"
        },
        "default_use_cases": ["In-game currency", "NFT trading", "Play-to-earn rewards"],
        "default_features": ["Game economy token", "NFT integration"],
        "default_risk": "Game must sustain user base. P2E hyperinflation common.",
    },
    # ── Decentralized storage / compute ──
    {
        "match_keywords": ["decentralized storage", "decentralized compute", "filecoin"],
        "token_type": "utility", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "payments": "Pay for data/storage/compute services",
            "staking": "Stake to operate nodes and earn fees"
        },
        "default_use_cases": ["Decentralized storage", "Distributed compute"],
        "default_features": ["Node operator rewards", "Service payment token"],
        "default_risk": "Cloud provider competition. Adoption dependent.",
    },
    # ── DEX / Lending (DeFi specific) ──
    {
        "match_keywords": ["decentralized exchange", "lending", "yield farming", "yield aggregator"],
        "token_type": "defi", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on protocol parameters, fees, treasury",
            "staking": "Stake tokens to earn protocol fees / rewards"
        },
        "default_use_cases": ["Protocol governance", "Fee sharing via staking", "Liquidity provision"],
        "default_features": ["Permissionless smart contract", "On-chain transparency"],
        "default_risk": "Smart contract exploit risk. Regulatory risk. Impermanent loss for LPs.",
    },
    # ── RWA (real-world asset tokenization — moved DOWN because LINK has rwa tag) ──
    {
        "match_keywords": ["tokenized gold", "tokenized stock", "tokenized treasury", "real world asset", "real-world asset", "rwa protocol"],
        "token_type": "rwa", "sector": "rwa", "has_utility": True,
        "utility_flags": {
            "backed_by_asset": "Token represents ownership of a real-world asset",
            "payments": "Can be transferred peer-to-peer like crypto"
        },
        "default_use_cases": ["On-chain ownership", "Fractional investment", "24/7 trading of traditional assets"],
        "default_features": ["Audited reserves", "Regulated custody", "Redeemable"],
        "default_risk": "Custodial risk. Regulatory uncertainty. Liquidity may be limited.",
    },
    # ── SocialFi ──
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
    # ── Exchange tokens ──
    {
        "match_keywords": ["centralized exchange (cex)", "exchange-based token"],
        "token_type": "exchange", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "premium_access": "Trading fee discounts, launchpad access",
            "buyback_burn": "Exchange burns tokens using revenue"
        },
        "default_use_cases": ["Trading fee discount", "Launchpad participation", "VIP tier"],
        "default_features": ["Native exchange utility", "Deflationary burns"],
        "default_risk": "Exchange counterparty risk. Regulatory action impact.",
    },
    # ── Generic DeFi (fallback for defi tag without DEX/lending specific) ──
    {
        "match_keywords": ["decentralized finance (defi)", "defi"],
        "token_type": "defi", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on protocol parameters",
            "staking": "Stake tokens for protocol rewards"
        },
        "default_use_cases": ["Protocol governance", "Liquidity / staking"],
        "default_features": ["DeFi protocol token", "On-chain governance"],
        "default_risk": "Smart contract risk. Regulatory risk.",
    },
    # ── DAO Governance ──
    {
        "match_keywords": ["governance", "dao"],
        "token_type": "governance", "sector": "defi", "has_utility": True,
        "utility_flags": {"governance": "Vote on protocol decisions, treasury, parameters"},
        "default_use_cases": ["DAO governance voting", "Protocol direction"],
        "default_features": ["1 token = 1 vote (or weighted)", "Treasury access"],
        "default_risk": "Voter apathy. Whale concentration. Governance attacks.",
    },
    # ── Generic infrastructure (catch-all for blockchain projects) ──
    {
        "match_keywords": ["infrastructure"],
        "token_type": "utility", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "payments": "Used in network operations",
        },
        "default_use_cases": ["Network operations", "Service payments"],
        "default_features": ["Infrastructure token"],
        "default_risk": "Adoption dependent. Competition risk.",
    },
]


# ============================================================
# MANUAL OVERRIDES — Top coins (skip CoinGecko, fast + accurate)
# ============================================================

MANUAL_OVERRIDES = {
    # ── Top L1 ──
    "BTC": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "store_of_value": "Digital scarce asset with hard-capped supply, used as inflation hedge",
            "payments": "Peer-to-peer cash without intermediaries (Lightning Network for fast payments)"
        },
        "coingecko_id": "bitcoin",
        "summary": "Bitcoin is the first and largest decentralized cryptocurrency, created in 2009 by Satoshi Nakamoto. It functions as digital scarce money secured by Proof-of-Work mining, with a hard cap of 21 million coins.",
        "use_cases": ["Store of value (digital gold)", "Inflation hedge", "Censorship-resistant peer-to-peer payments", "Cross-border value transfer", "Treasury reserve asset (corporations, nation-states)"],
        "key_features": ["21,000,000 max supply (hard cap)", "Proof-of-Work consensus (SHA-256)", "~10 minute block time", "Halving every 4 years", "Lightning Network for instant micro-payments"],
        "risk_notes": "High volatility. Energy-intensive mining draws environmental criticism. Not yield-generating natively. Subject to regulatory action.",
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
        "use_cases": ["Pay gas fees for smart contract execution", "Stake to secure the network and earn rewards", "Collateral in DeFi protocols", "Settlement layer for L2 rollups"],
        "key_features": ["Proof-of-Stake consensus (since The Merge, 2022)", "EIP-1559 fee burn (deflationary under high usage)", "Smart contract enabled (EVM)", "Largest DeFi/NFT ecosystem by TVL"],
        "risk_notes": "High gas fees during congestion. Validator centralization concerns. Smart contract exploit risk in dApps.",
    },
    "BNB": {
        "token_type": "exchange", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Native token for BNB Chain — pay gas fees",
            "buyback_burn": "Binance burns BNB quarterly using exchange revenue",
            "premium_access": "Trading fee discounts on Binance, Launchpad participation, VIP tiers"
        },
        "coingecko_id": "binancecoin",
        "summary": "BNB is the native token of the Binance ecosystem, used for trading fee discounts on Binance exchange and as gas token on BNB Chain.",
        "use_cases": ["Trading fee discount on Binance", "Gas fees on BNB Chain", "Binance Launchpad participation", "DeFi on BNB Chain"],
        "key_features": ["Quarterly burn mechanism (deflationary)", "Native to BNB Chain", "Tied to Binance — world's largest exchange", "EVM-compatible chain"],
        "risk_notes": "Heavy dependence on Binance. Regulatory pressure on Binance directly impacts BNB.",
    },
    "SOL": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay extremely cheap transaction fees (typically <$0.01)",
            "staking": "Delegate to validators, earn ~6-8% APY"
        },
        "coingecko_id": "solana",
        "summary": "Solana is a high-performance Layer 1 blockchain known for fast (~400ms blocks) and cheap transactions. Hosts a major DeFi/NFT ecosystem and emerging consumer apps.",
        "use_cases": ["High-throughput DeFi (Jupiter, Raydium, Drift)", "NFT marketplaces (Magic Eden, Tensor)", "Consumer apps (Helium Mobile)", "Gas + staking native asset"],
        "key_features": ["Proof-of-History + Proof-of-Stake consensus", "~50,000 TPS theoretical, ~3,000 TPS sustained", "Sub-cent transaction fees", "Single global state"],
        "risk_notes": "History of network outages. High hardware requirements for validators. FTX bankruptcy overhang.",
    },
    "ADA": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay transaction fees on Cardano",
            "staking": "Delegate ADA to stake pools, earn ~3-4% APY",
            "governance": "Voltaire upgrade enables on-chain governance"
        },
        "coingecko_id": "cardano",
        "summary": "Cardano is a research-driven Layer 1 blockchain founded by Charles Hoskinson, emphasizing peer-reviewed academic research and formal methods. Native token ADA is used for staking, governance, and gas.",
        "use_cases": ["Staking", "Smart contracts (Plutus)", "Governance", "Native asset transfer"],
        "key_features": ["Ouroboros Proof-of-Stake", "Peer-reviewed research approach", "UTXO model (extended)", "No slashing for stakers"],
        "risk_notes": "Slow development pace. Lower TVL/dApp activity vs ETH/SOL. Smart contract complexity.",
    },
    "AVAX": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas on Avalanche C-Chain",
            "staking": "Stake to validate, earn ~7-8% APY",
            "governance": "Vote on protocol changes"
        },
        "coingecko_id": "avalanche-2",
        "summary": "Avalanche is a Layer 1 platform supporting custom blockchains called Subnets. Known for fast finality (~1 second) and EVM compatibility.",
        "use_cases": ["EVM-compatible smart contracts", "Subnet creation (custom L1s)", "DeFi", "Gaming infrastructure"],
        "key_features": ["Sub-second finality", "EVM-compatible", "Subnet architecture", "Snowman consensus"],
        "risk_notes": "Subnet adoption uncertain. Competition with other L1s.",
    },
    "XRP": {
        "token_type": "layer1", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Cross-border payment settlement asset",
            "gas_fee": "Tiny fees burned on every transaction"
        },
        "coingecko_id": "ripple",
        "summary": "XRP is the native asset of the XRP Ledger, designed for fast and cheap cross-border payments. Often used by financial institutions through Ripple's payment network.",
        "use_cases": ["Cross-border payment settlement", "Bridge currency between fiats", "Microtransactions"],
        "key_features": ["~3-5 second settlement", "Sub-cent fees (burned)", "Federated consensus (no PoW/PoS)", "Used by financial institutions via Ripple"],
        "risk_notes": "SEC lawsuit history (partially resolved). Centralization concerns (Ripple Labs holds significant supply).",
    },
    "DOT": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay for parachain slot auctions and transactions",
            "staking": "Stake DOT to nominate validators, earn ~10-15% APY",
            "governance": "OpenGov on-chain voting"
        },
        "coingecko_id": "polkadot",
        "summary": "Polkadot is a heterogeneous multi-chain protocol enabling specialized blockchains (parachains) to interoperate via a shared security model from the Relay Chain.",
        "use_cases": ["Parachain slot auctions", "Cross-chain interoperability", "Staking & governance"],
        "key_features": ["Parachain architecture", "Shared security via Relay Chain", "Nominated Proof-of-Stake", "Native cross-chain messaging (XCM)"],
        "risk_notes": "Complex architecture. Parachain adoption slower than expected. Strong competition from Cosmos.",
    },
    "TON": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay transaction fees on TON",
            "staking": "Delegate to validators",
            "premium_access": "Used in Telegram ecosystem (premium, ads, mini-apps)"
        },
        "coingecko_id": "the-open-network",
        "summary": "TON (The Open Network) is a Layer 1 blockchain originally developed by Telegram, now community-driven. Tightly integrated with Telegram messenger for payments and mini-apps.",
        "use_cases": ["Telegram integration (1B+ users potential)", "Payments in mini-apps", "Smart contracts", "Storage / DNS services"],
        "key_features": ["Telegram-native integration", "Sharded architecture", "High throughput potential", "Proof-of-Stake"],
        "risk_notes": "Centralization around Telegram. Regulatory risk follows Telegram. Complex sharded architecture still maturing.",
    },
    "NEAR": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas in human-readable accounts (e.g., user.near)",
            "staking": "Delegate to validators, earn ~9-11% APY"
        },
        "coingecko_id": "near",
        "summary": "NEAR Protocol is a Layer 1 blockchain focused on developer experience and user-friendly account names. Uses sharding for scalability.",
        "use_cases": ["Smart contracts (Rust/AssemblyScript)", "Account abstraction (named accounts)", "AI infrastructure focus (recent pivot)"],
        "key_features": ["Sharded blockchain", "Human-readable accounts", "Storage staking model", "Chain abstraction focus"],
        "risk_notes": "Pivoting toward AI narrative. Sharding complexity. Competition from Ethereum L2s.",
    },
    "APT": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas fees on Aptos",
            "staking": "Stake to validate"
        },
        "coingecko_id": "aptos",
        "summary": "Aptos is a Layer 1 blockchain built by ex-Meta engineers using the Move language, originally from the Diem project. Focuses on high throughput and safety.",
        "use_cases": ["Smart contracts via Move", "DeFi", "Gaming"],
        "key_features": ["Move language (memory-safe)", "Block-STM parallel execution", "High TPS potential"],
        "risk_notes": "Move ecosystem still small. Heavy VC token allocation (unlocking pressure).",
    },
    "SUI": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas on Sui",
            "staking": "Delegate to validators"
        },
        "coingecko_id": "sui",
        "summary": "Sui is a Layer 1 blockchain using the Move language, built by ex-Meta engineers. Object-centric data model enables parallel transaction execution.",
        "use_cases": ["High-throughput dApps", "Gaming", "DeFi"],
        "key_features": ["Object-centric Move", "Parallel transaction execution", "Sub-second finality", "DAG-based consensus"],
        "risk_notes": "Newer ecosystem. VC unlock pressure. Different programming model from EVM.",
    },
    "TRX": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Energy/bandwidth model (TRX freezing for free transactions)",
            "staking": "Freeze TRX for resources or delegate"
        },
        "coingecko_id": "tron",
        "summary": "TRON is a Layer 1 blockchain known for cheap transactions and dominant USDT volume. Founded by Justin Sun.",
        "use_cases": ["USDT transfers (largest USDT chain by volume)", "Stablecoin payments", "Gambling/entertainment dApps"],
        "key_features": ["Delegated Proof-of-Stake", "Resource model (energy/bandwidth)", "Largest USDT issuance volume", "EVM-compatible"],
        "risk_notes": "Founder controversy (Justin Sun, regulatory issues). Centralization concerns. Heavy use in illicit activity (mostly USDT-TRC20).",
    },
    "ATOM": {
        "token_type": "layer1", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas on Cosmos Hub",
            "staking": "Stake ATOM, earn ~15-20% APY",
            "governance": "Vote on Cosmos Hub proposals"
        },
        "coingecko_id": "cosmos",
        "summary": "ATOM is the native token of Cosmos Hub, the central blockchain in the Cosmos ecosystem of interoperable application-specific chains connected via IBC.",
        "use_cases": ["Cosmos Hub security", "IBC interoperability", "Inter-chain accounts"],
        "key_features": ["IBC (Inter-Blockchain Communication)", "Tendermint BFT consensus", "App-chain ecosystem", "High staking yields"],
        "risk_notes": "Complex ecosystem politics. Value capture for ATOM token debated. Competition from other interop protocols.",
    },

    # ── Top L2 ──
    "ARB": {
        "token_type": "layer2", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on Arbitrum DAO proposals (treasury, upgrades)",
        },
        "coingecko_id": "arbitrum",
        "summary": "Arbitrum is the leading Ethereum Layer 2 (Optimistic Rollup) by TVL. ARB token is used for governance of the Arbitrum DAO.",
        "use_cases": ["Arbitrum DAO governance", "Treasury management"],
        "key_features": ["Largest Ethereum L2 by TVL", "Optimistic Rollup with fraud proofs", "EVM-equivalent", "Mature DeFi ecosystem"],
        "risk_notes": "Sequencer still centralized. Token has governance-only utility (no fee accrual yet). Competition with other L2s.",
    },
    "OP": {
        "token_type": "layer2", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on Optimism Citizens House and Token House",
        },
        "coingecko_id": "optimism",
        "summary": "Optimism is an Ethereum Layer 2 (Optimistic Rollup) and the originator of the OP Stack — used by Base, Worldcoin, and others. OP token governs the Superchain ecosystem.",
        "use_cases": ["Optimism governance", "OP Stack ecosystem decisions", "Retroactive Public Goods Funding"],
        "key_features": ["OP Stack = modular L2 framework", "Superchain ecosystem (Base, Worldcoin, etc.)", "Retroactive funding model", "EVM-equivalent"],
        "risk_notes": "Centralized sequencer. Governance-only utility. Token unlock pressure.",
    },
    "MATIC": {
        "token_type": "layer2", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "gas_fee": "Pay gas on Polygon PoS chain",
            "staking": "Stake MATIC to secure Polygon",
            "governance": "Polygon governance"
        },
        "coingecko_id": "matic-network",
        "summary": "MATIC (now migrating to POL) is the native token of Polygon, a popular EVM-compatible scaling solution for Ethereum.",
        "use_cases": ["Gas on Polygon PoS", "Staking", "Governance", "Bridge to Polygon zkEVM"],
        "key_features": ["EVM-compatible", "Major dApp ecosystem (Aave, Uniswap, etc.)", "Migrating MATIC → POL", "Polygon CDK for app-chains"],
        "risk_notes": "MATIC → POL migration adds complexity. zkEVM adoption slow vs Optimistic Rollups.",
    },

    # ── Oracle (CRITICAL — was misclassified before) ──
    "LINK": {
        "token_type": "utility", "sector": "infrastructure", "has_utility": True,
        "utility_flags": {
            "payments": "Pay for oracle services (price feeds, VRF, CCIP cross-chain)",
            "staking": "Stake LINK in v0.2 staking pool to secure network and earn rewards"
        },
        "coingecko_id": "chainlink",
        "summary": "Chainlink is the industry-standard decentralized oracle network, providing real-world data, off-chain compute, and cross-chain interoperability (CCIP) to smart contracts. Powers most major DeFi protocols.",
        "use_cases": [
            "Price feeds for DeFi (used by Aave, Synthetix, etc.)",
            "Verifiable Random Function (VRF) for gaming/NFTs",
            "Cross-Chain Interoperability Protocol (CCIP)",
            "Proof of Reserve for stablecoins/RWA",
            "Automation (smart contract triggers)"
        ],
        "key_features": [
            "Industry-standard oracle (largest by usage)",
            "Multi-chain deployment",
            "v0.2 staking with growing rewards pool",
            "CCIP for cross-chain messaging",
            "Used by every major DeFi protocol"
        ],
        "risk_notes": "Heavy node operator centralization currently. Cloud provider dependency. CCIP competition from Wormhole, LayerZero.",
    },

    # ── Major DeFi ──
    "AAVE": {
        "token_type": "defi", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on Aave protocol parameters, asset listings, treasury",
            "staking": "Stake AAVE in Safety Module — earn rewards, take slashing risk"
        },
        "coingecko_id": "aave",
        "summary": "Aave is the largest decentralized lending protocol by TVL. Users supply assets to earn yield or borrow against collateral. AAVE token governs the protocol.",
        "use_cases": ["Protocol governance", "Safety Module staking (insurance backstop)", "Aave V3 multichain expansion"],
        "key_features": ["Largest DeFi lending protocol", "Multi-chain (Ethereum, Polygon, Arbitrum, etc.)", "Flash loans", "GHO native stablecoin"],
        "risk_notes": "Smart contract risk. Liquidation cascades during volatility. Regulatory pressure on DeFi lending.",
    },
    "UNI": {
        "token_type": "governance", "sector": "defi", "has_utility": True,
        "utility_flags": {"governance": "Vote on Uniswap protocol changes, fee switches, treasury"},
        "coingecko_id": "uniswap",
        "summary": "Uniswap is the largest decentralized exchange (DEX) by volume. UNI token governs the protocol; fee-switch may direct trading fees to UNI stakers in future.",
        "use_cases": ["DEX governance", "Future fee-share (if fee switch activated)", "Treasury management"],
        "key_features": ["Largest DEX by volume", "Multi-chain (V3 deployments)", "Concentrated liquidity (V3)", "Pioneer of AMM model"],
        "risk_notes": "Fee switch repeatedly delayed. SEC scrutiny on UNI labs. Competition from V4 forks, intent-based DEXs.",
    },
    "MKR": {
        "token_type": "governance", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote on MakerDAO / Sky parameters",
            "buyback_burn": "MKR burned from protocol surplus"
        },
        "coingecko_id": "maker",
        "summary": "MKR (now part of Sky ecosystem) governs the Maker/Sky protocol that issues DAI/USDS — the largest decentralized stablecoin. MKR holders set risk parameters and absorb backstop risk.",
        "use_cases": ["Govern DAI/USDS stablecoin", "Risk parameter voting", "Backstop for protocol losses"],
        "key_features": ["Oldest major DeFi protocol", "Backs $5B+ DAI/USDS issuance", "Recently rebranded to Sky", "Endgame plan for SubDAOs"],
        "risk_notes": "Endgame plan adds complexity. RWA collateral exposure (T-Bills) brings counterparty risk.",
    },
    "LDO": {
        "token_type": "governance", "sector": "defi", "has_utility": True,
        "utility_flags": {"governance": "Vote on Lido DAO (largest liquid staking provider)"},
        "coingecko_id": "lido-dao",
        "summary": "Lido is the largest liquid staking protocol — issues stETH (staked ETH receipt). LDO governs node operator selection, fee parameters.",
        "use_cases": ["Lido DAO governance", "stETH ecosystem direction"],
        "key_features": ["Largest ETH staking pool (~30% of all staked ETH)", "stETH used heavily in DeFi", "Multi-chain (also Polygon, Solana)"],
        "risk_notes": "Concentration risk for Ethereum (Lido too big). Slashing risk on validators. Regulatory scrutiny.",
    },
    "CRV": {
        "token_type": "defi", "sector": "defi", "has_utility": True,
        "utility_flags": {
            "governance": "Vote-escrowed CRV (veCRV) for boost + governance",
            "staking": "Lock CRV for veCRV → boosted rewards on Curve LP"
        },
        "coingecko_id": "curve-dao-token",
        "summary": "Curve is a major DEX optimized for stablecoin and like-asset swaps with low slippage. CRV is the protocol token, used in vote-escrow tokenomics that became blueprint for many DeFi protocols.",
        "use_cases": ["Boost LP rewards via veCRV", "Vote on liquidity gauge weights", "Stablecoin trading"],
        "key_features": ["Pioneered vote-escrowed model", "Specialized for stable swaps", "Deep liquidity hub for DeFi", "crvUSD stablecoin"],
        "risk_notes": "Founder-controlled large CRV bag (history of OTC sales). Smart contract complexity.",
    },

    # ── Stablecoins ──
    "USDT": {
        "token_type": "stablecoin", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Stable digital dollar for trading, remittance, and DeFi",
            "backed_by_asset": "Claimed 1:1 reserve backing (cash equivalents + treasury bills)"
        },
        "coingecko_id": "tether",
        "summary": "Tether (USDT) is the largest stablecoin by market cap, pegged 1:1 to USD. Issued by Tether Limited and used as the dominant trading pair on most exchanges.",
        "use_cases": ["Trading pair base on virtually all exchanges", "Cross-border remittance", "DeFi collateral & liquidity", "Hedge from volatile crypto positions"],
        "key_features": ["1:1 USD peg", "Multi-chain (Ethereum, Tron, Solana, BNB Chain, etc.)", "Largest stablecoin by market cap", "Quarterly attestations (not full audit)"],
        "risk_notes": "Reserves not fully audited. Centralized issuer can freeze addresses. Tron USDT widely used in illicit activity.",
    },
    "USDC": {
        "token_type": "stablecoin", "sector": "payments", "has_utility": True,
        "utility_flags": {
            "payments": "Regulated stable digital dollar",
            "backed_by_asset": "1:1 backed by cash and short-term US treasuries, monthly attestations"
        },
        "coingecko_id": "usd-coin",
        "summary": "USD Coin (USDC) is a regulated stablecoin issued by Circle, fully backed by cash and short-term US treasuries. Generally considered the most transparent major stablecoin.",
        "use_cases": ["Institutional-grade stablecoin", "Trading pair", "Cross-border B2B payments", "Treasury holdings for crypto-native companies"],
        "key_features": ["1:1 USD peg", "Monthly attestations by Big Four firm", "Regulated issuer (Circle)", "Multi-chain"],
        "risk_notes": "Bank exposure risk (had brief de-peg during SVB collapse). Issuer can freeze addresses. US regulatory dependency.",
    },

    # ── Memecoins ──
    "DOGE": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "dogecoin",
        "summary": "Dogecoin started as a 2013 joke based on the Shiba Inu meme. It has no fundamental utility but maintains a large community and culture-driven adoption, partly fueled by Elon Musk endorsements.",
        "use_cases": ["Community tipping", "Speculation on hype cycles", "Charity drives (occasional)"],
        "key_features": ["Inflationary supply (no cap, ~5B new coins/year)", "Proof-of-Work (merge-mined with Litecoin)", "Strong meme/cultural status", "Frequent Elon Musk references"],
        "risk_notes": "Pure speculation. No development roadmap. Price highly correlated with social media sentiment. Inflationary supply dilutes holders.",
    },
    "SHIB": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "shiba-inu",
        "summary": "Shiba Inu is an Ethereum-based meme token launched in 2020. Despite claims of an ecosystem (Shibarium L2, ShibaSwap), the vast majority of activity remains speculative.",
        "use_cases": ["Meme speculation", "Limited DeFi via ShibaSwap", "Burn ceremonies"],
        "key_features": ["Massive supply (~589 trillion)", "Burn mechanism", "Has Shibarium L2 (limited adoption)", "Strong online community"],
        "risk_notes": "Speculative meme asset. Token supply manipulation history. Limited real utility despite ecosystem claims.",
    },
    "PEPE": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "pepe",
        "summary": "Pepe is a meme token launched in April 2023, themed around the Pepe the Frog meme. Pure speculation with no roadmap or utility.",
        "use_cases": ["Pure meme speculation", "Community-driven trading"],
        "key_features": ["Fixed supply (~420.69 trillion)", "No team / 'fair launch'", "Ethereum ERC-20", "Strong meme cycle association"],
        "risk_notes": "Pure speculation. No utility, no team, no roadmap. High volatility. Many fake forks/scams use the Pepe brand.",
    },
    "BONK": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "bonk",
        "summary": "Bonk is a Solana-based meme token launched in late 2022. Often credited with sparking the Solana meme coin season.",
        "use_cases": ["Solana ecosystem meme", "Speculation"],
        "key_features": ["Solana SPL token", "Airdropped to Solana community at launch", "First major Solana meme coin"],
        "risk_notes": "Speculative. Tied to Solana ecosystem sentiment. No fundamental utility.",
    },
    "WIF": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "dogwifcoin",
        "summary": "dogwifhat (WIF) is a Solana-based meme token themed around a Shiba Inu wearing a hat. Major hit during the 2024 Solana meme coin cycle.",
        "use_cases": ["Pure meme speculation"],
        "key_features": ["Solana SPL token", "Highly viral memetic identity", "Reached top-50 by market cap during peak"],
        "risk_notes": "Pure speculation. No utility. Rides Solana meme cycle.",
    },
    "FLOKI": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {},
        "coingecko_id": "floki",
        "summary": "FLOKI is a meme token inspired by Elon Musk's dog. Has built peripheral utility (Valhalla MMORPG, FlokiFi, education platform) but core value is meme-driven.",
        "use_cases": ["Meme speculation", "Peripheral ecosystem (Valhalla game)"],
        "key_features": ["Multi-chain (ETH + BNB)", "Aggressive marketing", "Ecosystem expansion attempts"],
        "risk_notes": "Primarily speculation despite ecosystem. Marketing-heavy approach.",
    },

    # ── 1000-prefix variants ──
    "1000PEPE":  {"_alias": "PEPE"},
    "1000BONK":  {"_alias": "BONK"},
    "1000FLOKI": {"_alias": "FLOKI"},
    "1000SHIB":  {"_alias": "SHIB"},
    "1000SATS":  {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "sats-ordinals",
        "summary": "1000SATS is a perpetual contract pair representing 1000 SATS Ordinals tokens (BRC-20 on Bitcoin). Speculative meme token within the Bitcoin Ordinals ecosystem.",
        "use_cases": ["Bitcoin Ordinals speculation"],
        "key_features": ["BRC-20 token on Bitcoin", "Ordinals-themed meme"],
        "risk_notes": "Highly speculative. BRC-20 standard is experimental.",
    },
    "1000RATS":  {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "rats-ordinals",
        "summary": "1000RATS is a perpetual contract pair representing 1000 RATS Ordinals tokens. Pure meme/speculation within the BRC-20 ecosystem.",
        "use_cases": ["Bitcoin Ordinals speculation"],
        "key_features": ["BRC-20 token on Bitcoin"],
        "risk_notes": "Highly speculative meme. No utility.",
    },
    "MEME": {
        "token_type": "memecoin", "sector": "hype", "has_utility": False,
        "utility_flags": {}, "coingecko_id": "memecoin-2",
        "summary": "MEME is a token from Memeland (9GAG ecosystem). Themed around meme culture with NFT integration but largely speculative.",
        "use_cases": ["Memeland ecosystem", "NFT-related speculation"],
        "key_features": ["Linked to 9GAG / Memeland NFT collection"],
        "risk_notes": "Speculative. NFT market dependent.",
    },
}


# ============================================================
# HTTP CLIENT
# ============================================================

def get_http_client() -> httpx.Client:
    headers = {"accept": "application/json"}
    if COINGECKO_API_KEY:
        if COINGECKO_KEY_TYPE == "pro":
            headers["x-cg-pro-api-key"] = COINGECKO_API_KEY
        else:
            headers["x-cg-demo-api-key"] = COINGECKO_API_KEY
        logger.info(f"Using CoinGecko {COINGECKO_KEY_TYPE} API key")
    else:
        logger.info("No CoinGecko API key — using free public tier")
    return httpx.Client(timeout=15.0, headers=headers)


def _request_with_retry(client: httpx.Client, url: str, params: dict = None) -> Optional[httpx.Response]:
    for attempt in range(MAX_RETRIES):
        try:
            r = client.get(url, params=params)
            if r.status_code == 200:
                return r
            elif r.status_code == 429:
                wait = RETRY_BACKOFF_BASE * (2 ** attempt)
                logger.warning(f"HTTP 429 (rate limit) — backoff {wait:.0f}s (attempt {attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
                continue
            else:
                logger.warning(f"HTTP {r.status_code} for {url}")
                return None
        except Exception as e:
            logger.error(f"Request error: {e}")
            time.sleep(5)
    logger.error(f"All {MAX_RETRIES} retries exhausted for {url}")
    return None


def coingecko_search(symbol: str, client: httpx.Client) -> Optional[str]:
    r = _request_with_retry(client, f"{COINGECKO_API_BASE}/search", {"query": symbol})
    if not r:
        return None
    try:
        coins = r.json().get("coins", [])
        if not coins:
            return None
        for c in coins:
            if c.get("symbol", "").upper() == symbol.upper():
                return c.get("id")
        return coins[0].get("id")
    except Exception as e:
        logger.error(f"Search parse error for {symbol}: {e}")
        return None


def coingecko_fetch_coin(coingecko_id: str, client: httpx.Client) -> Optional[Dict[str, Any]]:
    params = {"localization": "false", "tickers": "false", "market_data": "true",
              "community_data": "false", "developer_data": "false"}
    r = _request_with_retry(client, f"{COINGECKO_API_BASE}/coins/{coingecko_id}", params)
    if not r:
        return None
    try:
        return r.json()
    except Exception as e:
        logger.error(f"Fetch parse error for {coingecko_id}: {e}")
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


def _is_ecosystem_tag(category: str) -> bool:
    """Skip tags like 'X ecosystem', 'X chain' that just mean 'deployed on X'."""
    return (
        " ecosystem" in category or
        category.endswith(" chain") or
        category.endswith(" index") or
        category.endswith(" portfolio") or
        category.endswith(" native")
    )


def categorize_from_coingecko(coin_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Smart categorization:
    1. Extract categories, filter out ecosystem tags.
    2. Match against rules in priority order.
    3. First substantive match wins.
    """
    raw_categories = [c.lower() for c in (coin_data.get("categories") or []) if c]
    # Filter ecosystem/chain noise
    filtered_categories = [c for c in raw_categories if not _is_ecosystem_tag(c)]

    for rule in CATEGORY_RULES:
        for kw in rule["match_keywords"]:
            for cat in filtered_categories:
                if kw == cat or kw in cat:  # exact match preferred, substring fallback
                    return {
                        "token_type": rule["token_type"], "sector": rule["sector"],
                        "has_utility": rule["has_utility"],
                        "utility_flags": rule["utility_flags"],
                        "categories_raw": raw_categories,  # keep raw for debugging
                        "default_use_cases": rule.get("default_use_cases", []),
                        "default_features": rule.get("default_features", []),
                        "default_risk": rule.get("default_risk", ""),
                    }

    return {
        "token_type": "utility", "sector": "other", "has_utility": True,
        "utility_flags": {}, "categories_raw": raw_categories,
        "default_use_cases": ["See project description"],
        "default_features": ["Categorization pending manual review"],
        "default_risk": "This token has not been auto-categorized. Review project fundamentals carefully.",
    }


# ============================================================
# DATABASE OPERATIONS
# ============================================================

def get_pending_count() -> int:
    with engine.begin() as conn:
        return conn.execute(text("SELECT COUNT(*) FROM coins WHERE review_status='pending'")).scalar()


def get_total_count() -> int:
    with engine.begin() as conn:
        return conn.execute(text("SELECT COUNT(*) FROM coins")).scalar()


def get_pending_coins(limit: int = BATCH_LIMIT) -> List[Dict[str, Any]]:
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, base_symbol, quote_symbol FROM coins
            WHERE review_status='pending' ORDER BY pair LIMIT :limit
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
            FROM coins WHERE pair=:pair
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
        logger.info(f"[{pair}] Manual override (instant)")
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

    logger.info(f"[{pair}] CoinGecko search: {base_symbol}")
    coingecko_id = coin.get("coingecko_id") or coingecko_search(base_symbol, client)
    if not coingecko_id:
        logger.warning(f"[{pair}] No CoinGecko match")
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
            f"util={cat['has_utility']} rank={updates['market_cap_rank']}"
        )
    return success


def run_pending_batch():
    logger.info("=" * 70)
    logger.info("MODE: PENDING BATCH")
    logger.info(f"Sleep between requests: {COINGECKO_RATE_LIMIT_SLEEP}s")
    total_pending = get_pending_count()
    total_all = get_total_count()
    logger.info(f"Pending: {total_pending}  |  Total in coins table: {total_all}")
    logger.info("=" * 70)

    if total_pending == 0:
        logger.info("Nothing to do — all coins already categorized.")
        return

    client = get_http_client()
    processed = success = failed = 0
    start_time = time.time()

    while True:
        coins = get_pending_coins(BATCH_LIMIT)
        if not coins:
            logger.info("No more pending coins.")
            break

        for coin in coins:
            ok = process_coin(coin, client)
            processed += 1
            if ok:
                success += 1
            else:
                failed += 1

            if processed % 10 == 0:
                elapsed = time.time() - start_time
                rate = processed / elapsed if elapsed > 0 else 0
                remaining_est = (total_pending - processed) / rate if rate > 0 else 0
                logger.info(
                    f"PROGRESS — {processed}/{total_pending} done "
                    f"({success} ok, {failed} failed) | "
                    f"rate={rate:.2f}/s | "
                    f"eta={remaining_est/60:.1f}min"
                )

    client.close()
    elapsed_total = time.time() - start_time
    logger.info("=" * 70)
    logger.info(f"BATCH COMPLETE")
    logger.info(f"Processed: {processed}  |  Success: {success}  |  Failed: {failed}")
    logger.info(f"Total time: {elapsed_total/60:.1f} minutes")
    logger.info("=" * 70)


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
    parser = argparse.ArgumentParser(description="LuxQuant Coin Metadata Worker v3.1")
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
