"""
AI Arena v5 — Tweet Fetch + Classify Module
============================================
Drop-in module buat gantiin logic fetch_analyst_tweets di ai_arena_data.py.

Fitur:
1. Budget-aware fetch (max_results=25, interval 2 jam via cache)
2. No keyword filter — trust analyst curation
3. Time-decay engagement scoring
4. Top-2 per author dedup
5. Tier-2 fallback kalau hasil <5
6. LLM Pass-1 classifier (pre_stance + confidence)

Taruh file ini di: /root/luxquant-terminal/backend/app/services/arena_tweets_v5.py
Import dari ai_arena_data.py:
    from app.services.arena_tweets_v5 import fetch_analyst_tweets_v5
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from collections import defaultdict

import requests

log = logging.getLogger("arena_v5")

# ═══════════════════════════════════════════
# CONFIG — sesuaikan dengan tier X API lo
# ═══════════════════════════════════════════

# BASIC tier ($200/mo, 10k cap):  MAX_RESULTS=25, CACHE_TTL=7200 (2 jam)
# PRO tier   ($5k/mo,  1M cap):   MAX_RESULTS=100, CACHE_TTL=900 (15 menit)
MAX_RESULTS = 25
CACHE_TTL_SEC = 7200  # 2 jam
LOOKBACK_HOURS = 24
MIN_TWEETS_BEFORE_FALLBACK = 5
TOP_N_PER_AUTHOR = 1
FINAL_TOP_N = 15

# ═══════════════════════════════════════════
# ANALYST LISTS
# ═══════════════════════════════════════════

ANALYST_TIER1 = {
    "52kskew": "derivatives",
    "HsakaTrades": "derivatives",
    "Maaborz": "derivatives",
    "CryptoCred": "technical",
    "DonAlt": "technical",
    "Pentosh1": "technical",
    "ki_young_ju": "onchain",
    "woaborz": "onchain",
    "LynAldenContact": "macro",
    "RaoulGMI": "macro",
    "BTC_Archive": "btc_news",
    "CryptoCapo_": "technical",
}

ANALYST_TIER2 = {
    "rektcapital": "technical",
    "CredibleCrypto": "technical",
    "DocumentingBTC": "btc_data",
    "EmberCN": "onchain",
    "TheOneLanceTV": "technical",
}

# ═══════════════════════════════════════════
# IN-MEMORY CACHE (single-process, cukup buat 1 worker)
# ═══════════════════════════════════════════

_cache: Dict[str, tuple] = {}  # key → (timestamp, data)


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
# FETCH LAYER
# ═══════════════════════════════════════════

def _build_query(accounts: List[str]) -> str:
    """Query v5: buang keyword BTC, trust curation, filter noise."""
    acc = " OR ".join(f"from:{a}" for a in accounts)
    noise = "-giveaway -airdrop -presale"
    return f"({acc}) -is:retweet -is:reply {noise}"


def _score_tweet(t: dict) -> float:
    """Engagement × time-decay. Fresh + engaged = top."""
    likes = t.get("likes", 0)
    rts = t.get("retweets", 0)
    replies = t.get("replies", 0)
    engagement = likes + rts * 2.5 + replies * 1.5

    try:
        created = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
        hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        decay = max(0.2, 1.0 - hours / 72.0)
    except Exception:
        decay = 0.5

    return engagement * decay


def _fetch_batch(auth, accounts: List[str], analyst_map: dict) -> List[Dict]:
    """Hit X API v2 search/recent sekali untuk batch akun."""
    query = _build_query(accounts)

    # Query length guard (Basic = 512 char)
    if len(query) > 500:
        mid = len(accounts) // 2
        return _fetch_batch(auth, accounts[:mid], analyst_map) + \
               _fetch_batch(auth, accounts[mid:], analyst_map)

    start_time = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS))\
        .strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        r = requests.get(
            "https://api.twitter.com/2/tweets/search/recent",
            auth=auth,
            params={
                "query": query,
                "max_results": MAX_RESULTS,
                "start_time": start_time,
                "tweet.fields": "created_at,author_id,public_metrics",
                "expansions": "author_id",
                "user.fields": "username",
            },
            timeout=15,
        )
        if r.status_code == 429:
            print(f"[arena-v5] X API rate limit hit (429)")
            return []
        if r.status_code != 200:
            print(f"[arena-v5] X API HTTP {r.status_code}: {r.text[:200]}")
            return []

        data = r.json()
        users = {u["id"]: u.get("username", "unknown")
                 for u in data.get("includes", {}).get("users", [])}

        out = []
        for t in data.get("data", []):
            author = users.get(t.get("author_id", ""), "unknown")
            m = t.get("public_metrics", {})
            out.append({
                "text": t.get("text", ""),
                "author": author,
                "expertise": analyst_map.get(author, "unknown"),
                "created_at": t.get("created_at", ""),
                "likes": m.get("like_count", 0),
                "retweets": m.get("retweet_count", 0),
                "replies": m.get("reply_count", 0),
                "quotes": m.get("quote_count", 0),
            })
        return out
    except Exception as e:
        print(f"[arena-v5] fetch failed: {e}")
        return []


def _dedup_and_rank(tweets: List[Dict]) -> List[Dict]:
    """Top-2 per author by score, then top-N overall, min text length filter."""
    # Filter trash: text terlalu pendek / cuma link
    clean = [t for t in tweets if len(t.get("text", "").strip()) >= 30]

    # Score
    for t in clean:
        t["_score"] = _score_tweet(t)

    # Top-N per author
    by_author = defaultdict(list)
    for t in clean:
        by_author[t["author"].lower()].append(t)

    keep = []
    for author_tweets in by_author.values():
        author_tweets.sort(key=lambda x: x["_score"], reverse=True)
        keep.extend(author_tweets[:TOP_N_PER_AUTHOR])

    # Final sort & trim
    keep.sort(key=lambda x: x["_score"], reverse=True)
    for t in keep:
        t.pop("_score", None)
    return keep[:FINAL_TOP_N]


def fetch_analyst_tweets_v5() -> List[Dict]:
    """
    Public entry point. Cached, budget-aware, dengan tier-2 fallback.
    Drop-in replacement untuk fetch_analyst_tweets() lama.
    """
    # Cache check
    cached = _cache_get("arena_tweets")
    if cached is not None:
        print(f"[arena-v5] cache hit: {len(cached)} tweets")
        return cached

    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        print(f"[arena-v5] requests_oauthlib not installed")
        return []

    ck = os.getenv("X_CONSUMER_KEY", "")
    cs = os.getenv("X_CONSUMER_SECRET", "")
    at = os.getenv("X_ACCESS_TOKEN", "")
    ats = os.getenv("X_ACCESS_TOKEN_SECRET", "")
    if not all([ck, cs, at, ats]):
        print(f"[arena-v5] X API keys missing")
        return []

    auth = OAuth1(ck, cs, at, ats)

    # Tier 1 + Tier 2 combined from the start (sparse tweets per analyst)
    combined_accounts = {**ANALYST_TIER1, **ANALYST_TIER2}
    tier1_raw = _fetch_batch(auth, list(combined_accounts.keys()), combined_accounts)
    print(f"[arena-v5] tier1 raw: {len(tier1_raw)}")

    combined = list(tier1_raw)

    # (fallback removed)

    final = _dedup_and_rank(combined)
    print(f"[arena-v5] {len(combined)} raw → {len(final)} after dedup/rank")

    # Pre-classify via LLM Pass-1
    final = _classify_stance_batch(final)

    _cache_set("arena_tweets", final)
    return final


# ═══════════════════════════════════════════
# LLM PASS-1 CLASSIFIER (cheap model)
# ═══════════════════════════════════════════

CLASSIFY_PROMPT = """You are a crypto-twitter sentiment classifier for BTC/macro trading context.

Classify each tweet into ONE of: "bullish", "bearish", or "neutral".

CRYPTO JARGON RULES (critical — don't take words literally):
- "short squeeze incoming" = BULLISH (not bearish despite the word "short")
- "down bad", "rekt", "blood in streets" = BEARISH context, but can be contrarian bullish
- "HL intact" / "higher low" / "reclaim" / "demand response" = BULLISH structure
- "LH" / "lower high" / "rejection" / "distribution" / "bull trap" = BEARISH structure
- "funding reset" / "OI flushed" / "liquidations cleansed" = BULLISH (clean slate)
- Pure news/data dumps with NO directional take = NEUTRAL

DISTRIBUTION TARGET:
- Aim for ~40% bullish, ~40% bearish, ~20% neutral.
- "neutral" is ONLY for genuinely informational posts (news, raw data, announcements).
- ANY tweet with directional lean — even subtle ("support holds", "watching this level") — MUST go to bullish or bearish. Don't dump to neutral just to play safe.

Return STRICT JSON array, one object per tweet, in the same order:
[
  {"idx": 0, "stance": "bullish", "confidence": 0.85, "reason": "HTF reclaim signal"},
  ...
]

No prose, no markdown, no code fences. JSON only.

TWEETS TO CLASSIFY:
"""


def _classify_stance_batch(tweets: List[Dict]) -> List[Dict]:
    """
    Pass-1 LLM classifier. Pake DeepSeek (sudah ada di env lo).
    Kalau gagal, fallback ke 'neutral' + confidence 0.3 biar Pass-2 handle.
    """
    if not tweets:
        return tweets

    api_key = os.getenv("DEEPSEEK_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        print(f"[arena-v5] no LLM key for classifier, skipping pre-stance")
        for t in tweets:
            t["pre_stance"] = "neutral"
            t["pre_confidence"] = 0.3
            t["pre_reason"] = "no classifier"
        return tweets

    # Bangun input: index + text doang (hemat token)
    tweet_block = "\n".join(
        f'{i}. @{t["author"]}: {t["text"][:280]}'
        for i, t in enumerate(tweets)
    )
    prompt = CLASSIFY_PROMPT + tweet_block

    try:
        # DeepSeek-compatible endpoint (OpenAI format)
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
        model = os.getenv("DEEPSEEK_CLASSIFY_MODEL", "deepseek-chat")

        r = requests.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "max_tokens": 1500,
            },
            timeout=30,
        )
        if r.status_code != 200:
            raise RuntimeError(f"LLM HTTP {r.status_code}: {r.text[:150]}")

        content = r.json()["choices"][0]["message"]["content"].strip()
        print(f"[arena-v5] raw classify response (first 300): {content[:300]}")
        # Strip markdown fences if model ignores instruction
        if "```" in content:
            # Extract between fences
            parts = content.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("["):
                    content = p
                    break
        # Extract JSON array from surrounding prose
        if not content.startswith("["):
            start = content.find("[")
            end = content.rfind("]")
            if start >= 0 and end > start:
                content = content[start:end+1]

        classifications = json.loads(content)
        by_idx = {c["idx"]: c for c in classifications}

        for i, t in enumerate(tweets):
            c = by_idx.get(i, {})
            t["pre_stance"] = c.get("stance", "neutral")
            t["pre_confidence"] = float(c.get("confidence", 0.3))
            t["pre_reason"] = c.get("reason", "")[:120]

        # Distribusi log
        dist = defaultdict(int)
        for t in tweets:
            dist[t["pre_stance"]] += 1
        print(f"[arena-v5] pass-1 classify: {dict(dist)}")

    except Exception as e:
        print(f"[arena-v5] classify failed: {e}")
        for t in tweets:
            t.setdefault("pre_stance", "neutral")
            t.setdefault("pre_confidence", 0.3)
            t.setdefault("pre_reason", f"classify_error: {type(e).__name__}")

    return tweets
