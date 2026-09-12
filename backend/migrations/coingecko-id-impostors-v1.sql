-- Detach the pairs that were attached to somebody else's coin.
--
-- coingecko_search() ended with `return coins[0].get("id")`: when no ticker
-- matched exactly it accepted CoinGecko's top fuzzy hit, and /search ranks by
-- NAME. Querying COIN returned bit-COIN, THE returned e-THE-reum, LA returned
-- so-LA-na, ARM returned h-ARM-ony, US returned tether. The resolver is fixed
-- separately; this cleans up what it already wrote.
--
-- Selection is evidence-based, not a guess: only ids that ONE id is shared by
-- several pairs, where exactly one of them matches that coin's real CoinGecko
-- ticker. That pair is the owner and keeps it; the rest are impostors. Verified
-- against the live CoinGecko markets API 2026-09-12 — 18 shared ids, 16 rightful
-- owners, 26 impostors, listed below.
--
-- Deliberately NOT touched: pairs whose symbol differs from the CoinGecko ticker
-- but whose mapping is correct — NVDAUSDT -> nvidia-ondo-tokenized-stock
-- (NVDAON), NFLXUSDT -> netflix-xstock (NFLXX) and the rest of the tokenized
-- stocks. A blanket exact-ticker rule applied to existing rows would have broken
-- every one of those.
--
-- market_cap_usd, market_cap_rank and categories_raw came from the same wrong
-- coin, so they go with it — BUSDT was carrying Bitcoin's $1.6T cap, and
-- categories_raw feeds the Narratives row on /signals. review_status='pending'
-- hands each row back to coin_metadata_worker, which will re-resolve it under
-- the exact-ticker rule and leave it empty if there is no honest match.

BEGIN;

CREATE TEMP TABLE _impostors (pair TEXT PRIMARY KEY);
INSERT INTO _impostors (pair) VALUES
  ('AINUSDT'), ('AIUSDT'), ('ALLUSDT'), ('ARMUSDT'), ('BEUSDT'),
  ('BUSDT'), ('COINUSDT'), ('CUSDT'), ('FUSDT'), ('GUSDT'),
  ('HUSDT'), ('IDUSDT'), ('INUSDT'), ('IRENUSDT'), ('LAUSDT'),
  ('LITEUSDT'), ('LLYUSDT'), ('ONUSDT'), ('OUSDT'), ('RNDRUSDT'),
  ('SUSDT'), ('TAUSDT'), ('THEUSDT'), ('TONUSDT'), ('USUSDT'), ('VUSDT');

UPDATE coins c
   SET coingecko_id    = NULL,
       market_cap_usd  = NULL,
       market_cap_rank = NULL,
       categories_raw  = NULL,
       review_status   = 'pending',
       fetch_error     = 'coingecko_id detached 2026-09-12: fuzzy search match',
       updated_at      = now()
  FROM _impostors i
 WHERE c.pair = i.pair;

COMMIT;
