"""
AI Arena v6 — Context-Aware Multi-Query Search
================================================
Evolusi dari v5: lepas dari fixed analyst list, pake dynamic query 
berdasarkan kondisi market aktual (price, RSI, Fear&Greed, etc).

Pipeline:
  L1 Market Snapshot → L2 Dynamic Query Builder → L3 Multi-Query Fetch
  → L4 Relevance Re-Ranking → L5 LLM Classifier (with relevance gate)
  → L6 Worker Synthesis

Budget: 5 queries × 15 tweets × 4 fetches/hari × 30 hari = 9,000/bulan
(fit Basic tier 10k cap)
"""

import os
import json
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from collections import defaultdict

import requests
import os

def _get_x_auth():
    """Pakai credential yang sama dengan v5"""
    return {
        "consumer_key": os.getenv("X_CONSUMER_KEY"),
        "consumer_secret": os.getenv("X_CONSUMER_SECRET"),
        "access_token": os.getenv("X_ACCESS_TOKEN"),
        "access_token_secret": os.getenv("X_ACCESS_TOKEN_SECRET"),
    }

# ═══════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════

MAX_RESULTS_PER_QUERY = 10
CACHE_TTL_SEC = 86400  # 24 jam (1x/hari + anomaly override)
LOOKBACK_HOURS = 24
FINAL_TOP_N = 15
MIN_FAVES_QUALITY_GATE = 20
RELEVANCE_GATE = 0.5  # drop tweet dengan relevance < ini

BOT_PATTERNS = [
    "fear and greed index is",
    "btc/usdt technical outlook",
    "bitcoin technical outlook:",
    "current price: $",
    "join our",
    "click the link",
    "use code",
    "good morning fam",
    "sees opportunity in extreme fear",
    "just in: #bitcoin falls",
    "📊 fear",
    "🤖 extrem",
]

def _is_bot_content(text: str) -> bool:
    t = text.lower()
    if any(p in t for p in BOT_PATTERNS):
        return True
    emoji_count = sum(1 for ch in text if ord(ch) > 0x1F000)
    if emoji_count > 5:
        return True
    return False



# ═══════════════════════════════════════════
# IN-MEMORY CACHE
# ═══════════════════════════════════════════

_cache: Dict[str, tuple] = {}


def _cache_get(key: str) -> Optional[list]:
    if key not in _cache:
        return None
    ts, data = _cache[key]
    if time.time() - ts > CACHE_TTL_SEC:
        del _cache[key]
        return None
    return data


def _cache_set(key: str, data: list) -> None:
    _cache[key] = (time.time(), data)


# ═══════════════════════════════════════════
# L2: DYNAMIC QUERY BUILDER
# ═══════════════════════════════════════════

NOISE_EXCLUSIONS = "-giveaway -airdrop -presale -nft -mint -whitelist -shill"
BASE_FILTERS = f"-is:retweet -is:reply -is:quote lang:en {NOISE_EXCLUSIONS}"


def build_dynamic_queries(snapshot: Dict) -> Dict[str, str]:
    """
    Generate 5 context-aware queries berdasarkan market snapshot.
    
    Expected snapshot fields:
      price, rsi_1d, fear_greed, trend_1d, trend_4h,
      key_level_above, key_level_below, funding_rate
    """
    price = snapshot.get("price", 70000)
    rsi_1d = snapshot.get("rsi_1d", 50)
    fg = snapshot.get("fear_greed", 50)
    key_above = snapshot.get("key_level_above", price * 1.03)
    key_below = snapshot.get("key_level_below", price * 0.97)

    price_k = int(price / 1000)
    above_k = int(key_above / 1000)
    below_k = int(key_below / 1000)

    queries = {}

    # ── A. Price Level Discussion (UNIQUE value vs quant data) ──
    queries["price_level"] = (
        f"(bitcoin OR btc) "
        f"({price_k}k OR \"{below_k}k support\" OR \"{above_k}k resistance\" "
        f"OR \"{below_k},000\" OR \"{above_k},000\") "
        f"{BASE_FILTERS}"
    )

    # ── B. Sentiment (UNIQUE value — mood market vs numbers) ──
    if fg < 30:
        sent_keywords = "(fear OR oversold OR capitulation OR bottom OR \"buy the dip\" OR discount)"
    elif fg > 70:
        sent_keywords = "(greed OR overbought OR \"take profit\" OR euphoria OR top OR distribution)"
    else:
        sent_keywords = "(consolidation OR range OR \"wait and see\" OR neutral OR indecision)"
    queries["sentiment"] = f"(bitcoin OR btc) {sent_keywords} {BASE_FILTERS}"

    # NOTE: technical/derivatives/macro archetypes dropped to fit $15/mo budget
    # (already covered by quant data: RSI, OI, funding, on-chain)

    return queries


# ═══════════════════════════════════════════
# L3: MULTI-QUERY FETCH
# ═══════════════════════════════════════════

def _search_x(auth, query: str, max_results: int = 15) -> List[Dict]:
    """Hit X API v2 search/recent untuk satu query."""
    start_time = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS))\
        .strftime("%Y-%m-%dT%H:%M:%SZ")

    # Budget check: query length
    if len(query) > 500:
        print(f"[arena-v6] query too long ({len(query)}), skipping")
        return []

    try:
        # Budget mode: NO user expansion (saves $0.010 per unique user)
        r = requests.get(
            "https://api.twitter.com/2/tweets/search/recent",
            auth=auth,
            params={
                "query": query,
                "max_results": max_results,
                "start_time": start_time,
                "tweet.fields": "created_at,author_id,public_metrics",
            },
            timeout=20,
        )
        if r.status_code == 429:
            print(f"[arena-v6] rate limit (429)")
            return []
        if r.status_code != 200:
            print(f"[arena-v6] HTTP {r.status_code}: {r.text[:200]}")
            return []

        data = r.json()
        out = []
        for t in data.get("data", []):
            author_id = t.get("author_id", "")
            m = t.get("public_metrics", {})
            # Budget mode: author = short ID placeholder (no user lookup)
            author_label = f"user_{author_id[-6:]}" if author_id else "unknown"
            out.append({
                "text": t.get("text", ""),
                "author": author_label,
                "author_id": author_id,
                "author_followers": 0,  # not fetched in budget mode
                "verified": False,
                "created_at": t.get("created_at", ""),
                "likes": m.get("like_count", 0),
                "retweets": m.get("retweet_count", 0),
                "replies": m.get("reply_count", 0),
                "quotes": m.get("quote_count", 0),
            })
        return out
    except Exception as e:
        print(f"[arena-v6] search failed: {e}")
        return []


# ═══════════════════════════════════════════
# L4: RELEVANCE RE-RANKING
# ═══════════════════════════════════════════

def _relevance_score(tweet: Dict, snapshot: Dict) -> float:
    """Composite score: engagement × time_decay + content boost + author boost."""
    likes = tweet.get("likes", 0)
    rts = tweet.get("retweets", 0)
    replies = tweet.get("replies", 0)

    # Base engagement
    base = likes * 1.5 + rts * 3.5 + replies * 2.0  # boosted (compensate no author data)

    # Time decay
    try:
        created = datetime.fromisoformat(tweet["created_at"].replace("Z", "+00:00"))
        hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        decay = max(0.2, 1.0 - hours / 48.0)
    except Exception:
        decay = 0.5

    base *= decay

    # Content boost: market term density
    text = tweet.get("text", "").lower()
    price_k = int(snapshot.get("price", 70000) / 1000)
    boost_terms = [
        "btc", "bitcoin", f"{price_k}k", f"${price_k}",
        "support", "resistance", "funding", "oi ", "open interest",
        "fed", "rsi", "breakout", "reclaim", "rejection",
    ]
    term_hits = sum(1 for t in boost_terms if t in text)
    content_boost = term_hits * 15

    # Author credibility boost
    followers = tweet.get("author_followers", 0)
    if followers > 100000:
        author_boost = 50
    elif followers > 20000:
        author_boost = 25
    elif followers > 5000:
        author_boost = 10
    else:
        author_boost = 0

    # Penalties
    penalty = 0
    if len(text.strip()) < 50:
        penalty += 50
    if text.count("http") >= 2:
        penalty += 30

    return base + content_boost + author_boost - penalty


def _dedup_and_rank(all_tweets: List[Dict], snapshot: Dict) -> List[Dict]:
    """Score, dedup by tweet text, keep top-N."""
    # Dedup by text (first 60 chars) — different queries might return same tweet
    seen_texts = set()
    unique = []
    for t in all_tweets:
        text = t.get("text", "")
        if _is_bot_content(text):
            continue
        key = text[:60].lower().strip()
        if key and key not in seen_texts:
            seen_texts.add(key)
            unique.append(t)

    # Score + sort
    for t in unique:
        t["_score"] = _relevance_score(t, snapshot)

    unique.sort(key=lambda x: x["_score"], reverse=True)

    # Also dedup by author: max 2 per author (even from different queries)
    by_author = defaultdict(int)
    final = []
    for t in unique:
        author = t["author"].lower()
        if by_author[author] < 2:
            final.append(t)
            by_author[author] += 1
        if len(final) >= FINAL_TOP_N:
            break

    for t in final:
        t.pop("_score", None)
    return final


# ═══════════════════════════════════════════


def _enrich_authors(auth, tweets):
    """Fetch real usernames for final tweets. Cost: ~$0.01 per unique user."""
    if not tweets:
        return tweets
    unique_ids = list({t.get("author_id") for t in tweets if t.get("author_id")})
    if not unique_ids:
        return tweets
    try:
        r = requests.get(
            "https://api.twitter.com/2/users",
            auth=auth,
            params={"ids": ",".join(unique_ids[:100]), "user.fields": "username"},
            timeout=15,
        )
        if r.status_code != 200:
            print(f"[arena-v6] user lookup HTTP {r.status_code}")
            return tweets
        users = {u["id"]: u.get("username", "unknown") for u in r.json().get("data", [])}
        for t in tweets:
            uname = users.get(t.get("author_id", ""))
            if uname:
                t["author"] = uname
        print(f"[arena-v6] enriched {len(users)} usernames")
    except Exception as e:
        print(f"[arena-v6] enrich failed: {e}")
    return tweets

# L5: LLM PASS-1 CLASSIFIER (with relevance gate)
# ═══════════════════════════════════════════

CLASSIFY_PROMPT = """You are a BTC trading intelligence classifier. For EACH tweet, evaluate:

1. relevance (0-1): How directly does this tweet speak to current BTC market direction, 
   price action, macro conditions affecting BTC, or trader positioning?
   - 0.0-0.3: Off-topic (NFTs, giveaways, personal life, altcoins only, non-market)
   - 0.4-0.6: Tangentially related (general crypto news, partial signal)
   - 0.7-1.0: Directly actionable BTC trading intel

2. stance: "bullish" | "bearish" | "neutral"
   - Use CRYPTO JARGON rules: "short squeeze incoming"=BULLISH, "HL intact"=BULLISH,
     "rejection"=BEARISH, "LH forming"=BEARISH
   - "neutral" is ONLY for pure news/data dumps with no directional lean

3. topic: "price_level" | "sentiment" | "technical" | "derivatives" | "macro" | "other"

4. reason: 1 short sentence explaining the call

TARGET DISTRIBUTION (across relevance>=0.5 tweets): ~40% bullish, ~40% bearish, ~20% neutral.
Never dump to neutral just to play safe.

Return STRICT JSON array (no prose, no code fences):
[
  {"idx": 0, "relevance": 0.85, "stance": "bullish", "topic": "price_level", "reason": "Calls $71k support hold"},
  ...
]

TWEETS:
"""


def _classify_batch(tweets: List[Dict]) -> List[Dict]:
    """Pass-1 LLM classifier. Returns tweets with pre_stance/relevance/topic fields."""
    if not tweets:
        return tweets

    api_key = os.getenv("DEEPSEEK_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        print("[arena-v6] no LLM key for classifier")
        for t in tweets:
            t["pre_stance"] = "neutral"
            t["pre_confidence"] = 0.3
            t["relevance"] = 0.5
            t["topic"] = "other"
            t["pre_reason"] = "no classifier"
        return tweets

    tweet_block = "\n".join(
        f'{i}. @{t["author"]} ({t["likes"]}❤): {t["text"][:280]}'
        for i, t in enumerate(tweets)
    )
    prompt = CLASSIFY_PROMPT + tweet_block

    try:
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        model = os.getenv("DEEPSEEK_CLASSIFY_MODEL", "deepseek-chat")

        r = requests.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 2500,
            },
            timeout=45,
        )
        if r.status_code != 200:
            raise RuntimeError(f"LLM HTTP {r.status_code}: {r.text[:150]}")

        content = r.json()["choices"][0]["message"]["content"].strip()
        print(f"[arena-v6] raw classify (first 200): {content[:200]}")

        # Tolerant JSON extraction
        if "```" in content:
            parts = content.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("["):
                    content = p
                    break
        if not content.startswith("["):
            s, e = content.find("["), content.rfind("]")
            if s >= 0 and e > s:
                content = content[s:e+1]

        classifications = json.loads(content)
        by_idx = {c["idx"]: c for c in classifications if "idx" in c}

        for i, t in enumerate(tweets):
            c = by_idx.get(i, {})
            t["pre_stance"] = c.get("stance", "neutral")
            t["pre_confidence"] = float(c.get("confidence", 0.5))
            t["relevance"] = float(c.get("relevance", 0.5))
            t["topic"] = c.get("topic", "other")
            t["pre_reason"] = c.get("reason", "")[:150]

        dist = defaultdict(int)
        for t in tweets:
            dist[t["pre_stance"]] += 1
        print(f"[arena-v6] classify distribution: {dict(dist)}")

    except Exception as e:
        print(f"[arena-v6] classify failed: {e}")
        for t in tweets:
            t.setdefault("pre_stance", "neutral")
            t.setdefault("pre_confidence", 0.3)
            t.setdefault("relevance", 0.5)
            t.setdefault("topic", "other")
            t.setdefault("pre_reason", f"error: {type(e).__name__}")

    return tweets


# ═══════════════════════════════════════════
# PUBLIC ENTRY POINT
# ═══════════════════════════════════════════

def fetch_contextual_tweets_v6(market_snapshot: Optional[Dict] = None, force_refresh: bool = False) -> List[Dict]:
    """
    Main entry. Cached, context-aware, multi-query search.
    
    Args:
        market_snapshot: dict with price, rsi_1d, fear_greed, key_level_above/below
                        If None, uses fallback defaults.
    """
    if not force_refresh:
        cached = _cache_get("arena_v6_tweets")
        if cached is not None:
            print(f"[arena-v6] cache hit: {len(cached)} tweets")
            return cached
    else:
        print(f"[arena-v6] FORCE REFRESH — cache bypassed (anomaly trigger)")

    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        print("[arena-v6] requests_oauthlib not installed")
        return []

    ck = os.getenv("X_CONSUMER_KEY", "")
    cs = os.getenv("X_CONSUMER_SECRET", "")
    at = os.getenv("X_ACCESS_TOKEN", "")
    ats = os.getenv("X_ACCESS_TOKEN_SECRET", "")
    if not all([ck, cs, at, ats]):
        print("[arena-v6] [arena-v6] X API keys missing — using fallback from env. Trying to load from env...")
        return []

    auth = OAuth1(ck, cs, at, ats)

    # Fallback snapshot if caller doesn't provide
    if not market_snapshot:
        market_snapshot = {
            "price": 70000, "rsi_1d": 50, "fear_greed": 50,
            "key_level_above": 72000, "key_level_below": 68000,
        }

    # L2: Build queries
    queries = build_dynamic_queries(market_snapshot)
    print(f"[arena-v6] built {len(queries)} queries: {list(queries.keys())}")

    # L3: Multi-query fetch
    all_raw = []
    for archetype, query in queries.items():
        tweets = _search_x(auth, query, MAX_RESULTS_PER_QUERY)
        for t in tweets:
            t["source_archetype"] = archetype
        all_raw.extend(tweets)
        print(f"[arena-v6]   {archetype}: {len(tweets)} tweets")

    print(f"[arena-v6] total raw: {len(all_raw)}")

    # L4: Dedup + rank
    ranked = _dedup_and_rank(all_raw, market_snapshot)
    print(f"[arena-v6] {len(all_raw)} raw → {len(ranked)} after rank")

    # L5: LLM classify
    ranked = _enrich_authors(auth, ranked)
    classified = _classify_batch(ranked)

    # Apply relevance gate
    filtered = [t for t in classified if t.get("relevance", 0) >= RELEVANCE_GATE]
    dropped = len(classified) - len(filtered)
    if dropped > 0:
        print(f"[arena-v6] dropped {dropped} low-relevance tweets")

    _cache_set("arena_v6_tweets", filtered)
    return filtered


# ═══════════════════════════════════════════
# LEGACY COMPAT SHIM
# ═══════════════════════════════════════════

def fetch_analyst_tweets_v6(market_data=None) -> List[Dict]:
    """Context-aware tweet fetch for AI Arena v6"""
    if market_data is None:
        market_data = {"price": 71400, "fear_greed": 16, "rsi_1d": 45}
    print(f"[arena-v6] Market data received → Price: ${market_data.get('price')}")

    """Drop-in replacement signature for v5. Uses fallback snapshot."""
    return fetch_contextual_tweets_v6(None)
