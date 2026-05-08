-- ============================================================
-- Manual Categorization for fetch_failed Coins
-- ============================================================
-- Run this directly on VPS:
--   sudo -u postgres psql -d luxquant < manual-fix-failed-coins.sql
--
-- Categorizes 16 of 22 failed coins:
-- - 5 important: RNDR, LUNA2, 1000LUNC, BEAMX, NULS (proper utility/L1)
-- - 7 memes: BOB, MOG, WHY, BROCCOLI x2, NEIROETH, SPORTFUN
-- - 3 indices: BTCDOM, NATGAS (synthetic, no utility)
-- - 1 stablecoin: VIDT
--
-- Remaining 6 unknowns (9F, AVAAI, BLUEBIRD, DODOX, RAYSOL, STPT, TUSDT):
-- → silently hidden (badge won't show), can be added later when known.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- IMPORTANT TOKENS — Manual override for properly-known coins
-- ════════════════════════════════════════════════════════════

-- Render Token (RNDR — renamed to RENDER but old pair still exists)
UPDATE coins SET
    token_type = 'utility',
    sector = 'ai',
    has_utility = TRUE,
    utility_details = '{"payments": "Pay for distributed GPU rendering and AI compute", "staking": "Stake to participate in render network"}'::jsonb,
    summary = 'Render Network is a decentralized GPU rendering platform for digital content creation, animation, and AI compute. The original RNDR token has been migrated to RENDER on Solana, but RNDRUSDT pairs still trade as legacy contracts.',
    use_cases = '["Distributed GPU rendering for animation/VFX", "AI/ML compute marketplace", "3D rendering for metaverse and games", "Decentralized motion graphics"]'::jsonb,
    key_features = '["Decentralized GPU network", "Pay-per-render economy", "Migrated to Solana (RENDER)", "Used by major studios"]'::jsonb,
    risk_notes = 'Token migrated to RENDER on Solana. Legacy RNDR pairs may have liquidity issues. AI/GPU narrative dependent.',
    coingecko_id = 'render-token',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'RNDRUSDT';

-- Terra 2.0 (LUNA)
UPDATE coins SET
    token_type = 'layer1',
    sector = 'infrastructure',
    has_utility = TRUE,
    utility_details = '{"gas_fee": "Pay transaction fees on Terra 2.0", "staking": "Stake LUNA to validate"}'::jsonb,
    summary = 'Terra 2.0 (LUNA) is a Cosmos-based Layer 1 blockchain launched in 2022 after the original Terra (now LUNC) collapse. Native asset for the new Terra ecosystem with smart contract capabilities.',
    use_cases = '["Smart contracts via CosmWasm", "Native asset for Terra 2.0 ecosystem", "Staking for network security", "DeFi protocols"]'::jsonb,
    key_features = '["Cosmos SDK based", "IBC interoperability", "Proof-of-Stake", "Reborn after Terra/LUNA collapse"]'::jsonb,
    risk_notes = 'Tied to original Terra collapse history. Limited ecosystem adoption vs other Cosmos chains. Confusion with LUNC.',
    coingecko_id = 'terra-luna-2',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'LUNA2USDT';

-- Terra Classic (LUNC) — 1000 prefix
UPDATE coins SET
    token_type = 'layer1',
    sector = 'infrastructure',
    has_utility = TRUE,
    utility_details = '{"gas_fee": "Pay gas on Terra Classic", "staking": "Stake LUNC to validate (high inflation)"}'::jsonb,
    summary = 'Terra Classic (LUNC) is the original Terra blockchain that experienced a catastrophic collapse in May 2022 when its UST stablecoin de-pegged. The chain continues to operate with community governance but with massive inflation.',
    use_cases = '["Speculation on community recovery", "Burn campaigns to reduce supply", "Legacy Terra ecosystem"]'::jsonb,
    key_features = '["Pre-collapse Terra blockchain", "Massive supply post-collapse (~6 trillion)", "Community-driven", "Active burn mechanism"]'::jsonb,
    risk_notes = 'Highly speculative due to historical collapse. Massive token supply leads to dilution. Community split between LUNC and LUNA 2.0.',
    coingecko_id = 'terra-luna',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = '1000LUNCUSDT';

-- Beam Network (BEAM)
UPDATE coins SET
    token_type = 'utility',
    sector = 'gamefi',
    has_utility = TRUE,
    utility_details = '{"gas_fee": "Pay gas on Beam Network", "premium_access": "Used in gaming dApps within ecosystem"}'::jsonb,
    summary = 'Beam is a gaming-focused subnet on the Avalanche network, designed for Web3 games and NFT applications. BEAMX is the perpetual contract pair on exchanges.',
    use_cases = '["Web3 gaming infrastructure", "NFT trading", "GameFi protocols"]'::jsonb,
    key_features = '["Avalanche subnet", "Gaming-optimized", "Low fees", "EVM-compatible"]'::jsonb,
    risk_notes = 'GameFi adoption uncertain. Subnet dependent on Avalanche ecosystem health.',
    coingecko_id = 'beam-2',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'BEAMXUSDT';

-- NULS Layer 1
UPDATE coins SET
    token_type = 'layer1',
    sector = 'infrastructure',
    has_utility = TRUE,
    utility_details = '{"gas_fee": "Pay gas on NULS chain", "staking": "Stake NULS to validate"}'::jsonb,
    summary = 'NULS is a customizable Layer 1 blockchain platform that enables developers to build their own modular blockchains and dApps with cross-chain capabilities.',
    use_cases = '["Custom blockchain creation", "Cross-chain interoperability", "Smart contracts"]'::jsonb,
    key_features = '["Modular blockchain architecture", "Cross-chain bridges", "Proof-of-Credit consensus"]'::jsonb,
    risk_notes = 'Lower adoption vs other L1s. Long-running but small ecosystem.',
    coingecko_id = 'nuls',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'NULSUSDT';


-- ════════════════════════════════════════════════════════════
-- MEMECOINS — Default categorization for known meme tokens
-- ════════════════════════════════════════════════════════════

-- Bob meme (1M units pair)
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'BOB is a memecoin traded as 1000000 BOB perpetual contract on exchanges. Pure speculation with no fundamental utility, driven by hype and community sentiment.',
    use_cases = '["Pure meme speculation", "Community-driven trading"]'::jsonb,
    key_features = '["Memecoin", "1M unit perpetual contract", "Community-driven"]'::jsonb,
    risk_notes = 'Pure speculation. No utility, no roadmap. High volatility. May be delisted.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = '1000000BOBUSDT';

-- Mog Coin (1M units pair)
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'Mog Coin (MOG) is a cat-themed memecoin traded as 1000000 MOG perpetual contract. Pure speculation with viral meme appeal but no fundamental utility.',
    use_cases = '["Meme speculation", "Cat-themed crypto culture"]'::jsonb,
    key_features = '["Cat-themed meme", "Ethereum ERC-20", "Viral marketing"]'::jsonb,
    risk_notes = 'Pure speculation. Highly volatile. Driven by social media trends.',
    coingecko_id = 'mog-coin',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = '1000000MOGUSDT';

-- WHY meme
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'WHY is a memecoin traded as 1000 WHY perpetual contract. Speculation-driven without fundamental utility.',
    use_cases = '["Pure meme speculation"]'::jsonb,
    key_features = '["Memecoin", "1000 unit perpetual contract"]'::jsonb,
    risk_notes = 'Pure speculation. No utility. High volatility.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = '1000WHYUSDT';

-- Broccoli memes (Trump-themed broccoli memes from 2025)
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'Broccoli is a memecoin variant traded on perpetual contracts. Pure meme speculation with no fundamental utility.',
    use_cases = '["Meme speculation"]'::jsonb,
    key_features = '["Memecoin variant", "Pure speculation"]'::jsonb,
    risk_notes = 'Pure speculation. No utility. Highly volatile meme cycle.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair IN ('BROCCOLI714USDT', 'BROCCOLIF3BUSDT');

-- Neiro Ethereum meme
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'Neiro Ethereum (NEIROETH) is a Shiba Inu-themed memecoin on Ethereum, named after Neiro the dog. Pure speculation driven by viral meme culture.',
    use_cases = '["Meme speculation", "Dog-themed crypto"]'::jsonb,
    key_features = '["Ethereum ERC-20", "Shiba Inu meme theme", "Community-driven"]'::jsonb,
    risk_notes = 'Pure speculation. No utility. High volatility from meme cycles.',
    coingecko_id = 'neiro-ethereum',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'NEIROETHUSDT';

-- SportFun meme
UPDATE coins SET
    token_type = 'memecoin',
    sector = 'hype',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'SportFun (SPORTFUN) is a sports-themed memecoin. Pure speculation tied to sports/entertainment narrative.',
    use_cases = '["Sports-themed speculation"]'::jsonb,
    key_features = '["Sports meme theme", "Community-driven"]'::jsonb,
    risk_notes = 'Pure speculation. No fundamental utility.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'SPORTFUNUSDT';


-- ════════════════════════════════════════════════════════════
-- INDICES & SYNTHETICS — Special category for derivatives
-- ════════════════════════════════════════════════════════════

-- Bitcoin Dominance Index (BTCDOM)
UPDATE coins SET
    token_type = 'utility',
    sector = 'other',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'BTCDOM is a synthetic perpetual index tracking Bitcoin Dominance (BTC market cap as % of total crypto market cap). Not an actual token, but a derivative index for traders.',
    use_cases = '["Hedge against altcoin season risk", "Speculate on BTC dominance trends", "Index trading"]'::jsonb,
    key_features = '["Synthetic index (not a real token)", "Tracks BTC market cap dominance %", "Perpetual contract on Binance"]'::jsonb,
    risk_notes = 'Not a real token — synthetic index. Cannot be held in wallet. Trading-only instrument with funding rate exposure.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'BTCDOMUSDT';

-- Natural Gas Index (NATGAS)
UPDATE coins SET
    token_type = 'rwa',
    sector = 'rwa',
    has_utility = FALSE,
    utility_details = '{}'::jsonb,
    summary = 'NATGAS is a synthetic perpetual contract tracking the price of Natural Gas (commodity). Allows crypto traders to speculate on energy markets without traditional brokers.',
    use_cases = '["Speculate on natural gas prices", "Hedge energy exposure", "Commodity trading via crypto"]'::jsonb,
    key_features = '["Tracks natural gas commodity price", "Perpetual contract", "Synthetic exposure to traditional commodity"]'::jsonb,
    risk_notes = 'Not a real cryptocurrency — synthetic commodity exposure. Tracks external market that may not align with crypto cycles.',
    metadata_source = 'manual',
    review_status = 'manual_reviewed',
    fetch_error = NULL,
    last_fetched_at = NOW(),
    updated_at = NOW()
WHERE pair = 'NATGASUSDT';


-- ════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════

SELECT 
    review_status,
    COUNT(*) AS count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM coins
GROUP BY review_status
ORDER BY count DESC;

COMMIT;
