# backend/app/api/routes/admin_x_tracker.py
"""What X published, and what those calls did afterwards.

The signal cards already answer "how did the call do". This answers a different
question the desk had no way to ask: **did it keep running after we posted?**
A coin that gained another 40% since its post is worth a second, hand-written
mention, and nothing surfaced those.

Live prices come from Binance USDⓈ-M — perp-first, matching how the signals
themselves are tracked. Peak figures come from the peak worker, which refreshes
open signals every ten minutes.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user
from app.core.database import get_db
from app.core.x_links import X_CUTOVER, tweet_url
from app.models.user import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/x-tracker", tags=["admin-x-tracker"])

BINANCE_TICKERS = "https://fapi.binance.com/fapi/v1/ticker/price"

# The publisher owns the ceiling and keeps it in its own .env. Reading that file
# rather than duplicating the number here means the dashboard cannot drift out
# of step with what actually governs posting.
POSTER_ENV = os.getenv("X_POSTER_ENV", "/root/luxquant-x-poster/.env")


def _daily_cap(default: int = 48) -> int:
    try:
        with open(POSTER_ENV) as f:
            for line in f:
                if line.startswith("X_PUB_DAILY_CAP="):
                    return int(line.split("=", 1)[1].strip())
    except Exception:
        pass
    return default

# closed_win is the ladder's fourth rung under a different name.
_ORDINAL = {"tp2": 2, "tp3": 3, "tp4": 4, "closed_win": 4}
_LABEL = {2: "TP2", 3: "TP3", 4: "TP4"}


def _live_prices() -> dict[str, float]:
    """Every symbol in one request. Per-pair calls would be dozens of round
    trips for a page that refreshes on a timer."""
    try:
        with httpx.Client(timeout=15) as c:
            data = c.get(BINANCE_TICKERS).json()
        return {d["symbol"]: float(d["price"]) for d in data}
    except Exception as e:                       # a stale page beats a 500
        log.warning("x-tracker: price fetch failed: %s", e)
        return {}


@router.get("")
def x_tracker(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    rows = db.execute(text("""
        SELECT p.signal_id,
               p.event_type,
               p.tweet_id,
               p.style_used, p.hook_category, p.structural_pattern, p.voice_combo,
               COALESCE(p.x_tweet_text, p.tweet_text) AS caption,
               p.x_tweet_text IS NOT NULL AS caption_is_x,
               COALESCE(p.x_posted_at, p.created_at) AS posted_at,
               s.pair, s.entry, s.target2, s.target3, s.target4,
               s.peak_pct, s.peak_price, s.peak_at, s.status,
               -- how far the ladder actually climbed, which can be past the
               -- rung the post was about
               COALESCE((
                   SELECT MAX(CASE u.update_type
                                WHEN 'tp4' THEN 4 WHEN 'tp3' THEN 3
                                WHEN 'tp2' THEN 2 WHEN 'tp1' THEN 1 ELSE 0 END)
                   FROM signal_updates u WHERE u.signal_id = p.signal_id
               ), 0) AS reached
        FROM x_posts p
        JOIN signals s ON s.signal_id = p.signal_id
        WHERE p.tweet_id IS NOT NULL
          AND COALESCE(p.x_posted_at, p.created_at) > :cut
          AND COALESCE(p.x_posted_at, p.created_at)
              >= now() - (CAST(:d AS numeric) * interval '1 day')
        ORDER BY COALESCE(p.x_posted_at, p.created_at) DESC
    """), {"d": days, "cut": X_CUTOVER}).mappings().all()

    px = _live_prices()
    out = []
    for r in rows:
        entry = float(r["entry"] or 0)
        ordinal = _ORDINAL.get(r["event_type"], 0)
        target = float(r["target%d" % ordinal] or 0) if ordinal in (2, 3, 4) else 0.0
        now_px = px.get(r["pair"])

        pct_at_post = ((target - entry) / entry * 100) if entry and target else None
        pct_now = ((now_px - entry) / entry * 100) if entry and now_px else None
        since = (pct_now - pct_at_post) if (pct_now is not None and pct_at_post is not None) else None
        reached = int(r["reached"] or 0)

        # Posts published before the cutover live on the suspended account and
        # died with it. Linking them to @luxquantalgo would hand the reader a
        # 404 dressed as a working link, so tweet_url returns None for those
        # and the row is marked instead.
        posted_at = r["posted_at"]
        if posted_at is not None and posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)
        url = tweet_url(r["tweet_id"], posted_at)

        out.append({
            "signal_id": r["signal_id"],
            "pair": r["pair"],
            "tweet_id": r["tweet_id"],
            "tweet_url": url,
            "current_account": url is not None,
            "posted_at": r["posted_at"].isoformat() if r["posted_at"] else None,
            "posted_at_label": _LABEL.get(ordinal, r["event_type"]),
            "reached_label": _LABEL.get(reached) if reached >= 2 else None,
            "went_further": reached > ordinal,
            "entry": entry or None,
            "target": target or None,
            "price_now": now_px,
            "pct_at_post": pct_at_post,
            "pct_now": pct_now,
            # A high-water mark, never a realised return — the UI must not
            # present this as a result.
            "peak_pct": float(r["peak_pct"]) if r["peak_pct"] is not None else None,
            # The peak worker stores the price it saw, so this is a real
            # observation rather than entry x (1 + peak_pct) rounded back.
            "peak_price": float(r["peak_price"]) if r["peak_price"] is not None else None,
            "peak_at": r["peak_at"].isoformat() if r["peak_at"] else None,
            "since_post": since,
            "status": r["status"],
            "open": r["status"] not in ("closed_win", "closed_loss"),
            # Caption-shape fields. Grouping by these is NOT a growth metric --
            # a voice cannot make a coin run. They are here as a duplication
            # monitor: "duplicative or substantially similar posts" is the rule
            # this account was suspended under, and a collapse in variety is the
            # early warning nothing else would show.
            "style": r["style_used"],
            "hook": r["hook_category"],
            "pattern": r["structural_pattern"],
            "voice": r["voice_combo"],
            # What X actually published. tweet_text still holds Telegram's
            # caption on shared rows, so a row without caption_is_x is showing
            # Telegram copy and must not be read as the tweet.
            "caption": r["caption"],
            "caption_is_x": bool(r["caption_is_x"]),
        })

    out.sort(key=lambda x: (x["since_post"] is None, -(x["since_post"] or 0)))
    priced = sum(1 for o in out if o["price_now"] is not None)

    # ---- the live queue, as the publisher itself ranked it ---------------
    queue, queue_at, queue_total = [], None, 0
    try:
        qrows = db.execute(text(
            "SELECT position, signal_id, pair, highest, rung, pct, captured_at "
            "FROM x_queue_snapshot ORDER BY position")).mappings().all()
        queue_total = len(qrows)
        if qrows:
            queue_at = qrows[0]["captured_at"]
        for q in qrows[:30]:
            px_now = px.get(q["pair"])
            queue.append({
                "position": q["position"], "pair": q["pair"],
                "highest": q["highest"], "rung": q["rung"],
                "pct": float(q["pct"]) if q["pct"] is not None else None,
                "price_now": px_now,
            })
    except Exception as e:
        log.warning("queue read failed: %s", e)

    depth = [
        {"at": r[0].isoformat(), "depth": r[1], "posted": r[2]}
        for r in db.execute(text(
            "SELECT captured_at, depth, posted FROM x_queue_depth "
            "ORDER BY captured_at DESC LIMIT 96")).fetchall()
    ][::-1]

    # ---- cadence: which minute of the hour posts land on -----------------
    # Before the timer was randomised every post landed on :00 or :30. This is
    # the chart that shows whether that fingerprint stays broken.
    cadence = [0] * 60
    for r in db.execute(text(
        "SELECT EXTRACT(MINUTE FROM COALESCE(x_posted_at, created_at))::int AS m, "
        "count(*) FROM x_posts WHERE tweet_id IS NOT NULL AND "
        "COALESCE(x_posted_at, created_at) > :cut GROUP BY 1"), {"cut": X_CUTOVER}).fetchall():
        if r[0] is not None and 0 <= r[0] < 60:
            cadence[r[0]] = r[1]

    daily = [
        {"day": r[0].isoformat(), "posts": r[1]}
        for r in db.execute(text(
            "SELECT date_trunc('day', COALESCE(x_posted_at, created_at))::date AS d, "
            "count(*) FROM x_posts WHERE tweet_id IS NOT NULL AND "
            "COALESCE(x_posted_at, created_at) > :cut GROUP BY 1 ORDER BY 1"),
            {"cut": X_CUTOVER}).fetchall()
    ]

    cap = _daily_cap()
    posted_today = db.execute(text(
        "SELECT count(*) FROM x_posts WHERE tweet_id IS NOT NULL "
        "AND COALESCE(x_posted_at, created_at) >= date_trunc('day', now())"
    )).scalar() or 0
    voices = len({o["voice"] for o in out if o["voice"]})
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "days": days,
        "count": len(out),
        "priced": priced,
        "prices_ok": bool(px),
        "movers": sum(1 for o in out if (o["since_post"] or 0) >= 15),
        "open_count": sum(1 for o in out if o["open"]),
        "current_account_count": len(out),
        "cutover": X_CUTOVER.isoformat(),
        # Budget and duplication, the two things that need watching daily.
        "posted_today": int(posted_today),
        "daily_cap": cap,
        "distinct_voices": voices,
        "queue": queue,
        "queue_total": queue_total,
        "queue_captured_at": queue_at.isoformat() if queue_at else None,
        "depth_history": depth,
        "cadence": cadence,
        "daily": daily,
        "rows": out,
    }


# ============================================================
# Hand-post suggestions
# ============================================================
#
# The automated ladder carries 24 posts a day. In the last seven days 451
# signals reached TP4 and 443 of them never appeared on X, so the desk is not
# short of material — it is short of a way to tell which two or three are worth
# writing about by hand.
#
# Automating this is not an option and was already tried: quote-posting was
# removed from x_poster because bulk automated quoting is named in X's
# Automation Rules, and this account has been suspended twice. So the machine
# ranks and drafts; a person decides and posts.
#
# Thresholds are measured, not guessed. Over the same week, "never reached X"
# at >=25% yields 8 candidates — about one a day. At >=40% it yields 2, which
# is the rare tier worth interrupting someone for.

MOVER_AT = 40.0      # already published here, and it kept going
FRESH_AT = 25.0      # never published here, and the call was large
PAST_AT = 15.0       # the ladder climbed past the rung we posted


def _drafts(kind: str, sym: str, n: float, reached: str) -> str:
    """Captions stay under 120 characters because reach falls off a cliff past
    it, and they quote price, never profit: `since_post` is a live-price delta
    against a target, and nobody realised it."""
    if kind == "still_running":
        return f"${sym} is {n:+.0f}% past the target we posted here."
    if kind == "never_posted":
        return f"${sym} ran {n:+.0f}% from the call and reached {reached}."
    return f"${sym} did not stop at the target we posted. It reached {reached}."


@router.get("/candidates")
def candidates(
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(3, ge=1, le=10),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    px = _live_prices()

    # Suppression is per COIN, not per signal. The same pair often carries
    # several calls in a week, so dismissing one signal used to hand the desk
    # the very next call on the same coin — marked done, back again, different
    # number. Whoever pressed Done meant "I have covered this coin".
    try:
        seen = {r[0] for r in db.execute(text(
            "SELECT signal_id || '|' || kind FROM x_manual_flags")).fetchall()}
        hushed = {r[0] for r in db.execute(text(
            "SELECT DISTINCT pair FROM x_manual_flags "
            "WHERE pair IS NOT NULL AND created_at >= now() - interval '3 days'"
        )).fetchall()}
    except Exception:            # table not created yet — suggest everything
        seen, hushed = set(), set()

    out = []

    # 1. Published here, and it kept running. The strongest kind: there is an
    #    existing post to quote, so the receipt is already public.
    for r in db.execute(text("""
        SELECT p.signal_id, p.event_type, p.tweet_id, s.pair, s.entry,
               s.target2, s.target3, s.target4,
               COALESCE(p.x_posted_at, p.created_at) AS posted_at
        FROM x_posts p JOIN signals s ON s.signal_id = p.signal_id
        WHERE p.tweet_id IS NOT NULL
          AND COALESCE(p.x_posted_at, p.created_at) >= now() - (CAST(:d AS numeric) * interval '1 day')
    """), {"d": days}).mappings():
        if "%s|still_running" % r["signal_id"] in seen or r["pair"] in hushed:
            continue
        posted_at = r["posted_at"]
        if posted_at is not None and posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)
        url = tweet_url(r["tweet_id"], posted_at)
        if not url:                      # the post died with the old account
            continue
        ordinal = _ORDINAL.get(r["event_type"], 0)
        entry = float(r["entry"] or 0)
        target = float(r["target%d" % ordinal] or 0) if ordinal in (2, 3, 4) else 0.0
        now_px = px.get(r["pair"])
        if not (entry and target and now_px):
            continue
        at_post = (target - entry) / entry * 100
        now_pct = (now_px - entry) / entry * 100
        since = now_pct - at_post
        if since < MOVER_AT:
            continue
        sym = r["pair"].replace("USDT", "")
        out.append({
            "signal_id": r["signal_id"], "kind": "still_running", "pair": r["pair"],
            "headline": "Still running", "metric": since,
            "metric_label": "since our post",
            "quote_url": url,
            "draft": _drafts("still_running", sym, since, ""),
        })

    # 2. Never reached X at all. No post to quote, so this one is written fresh.
    for r in db.execute(text("""
        SELECT s.signal_id, s.pair, s.entry, s.target4
        FROM signals s
        WHERE s.created_at::timestamptz >= now() - (CAST(:d AS numeric) * interval '1 day')
          AND EXISTS (SELECT 1 FROM signal_updates u
                       WHERE u.signal_id = s.signal_id AND u.update_type = 'tp4')
          AND NOT EXISTS (SELECT 1 FROM x_posts p
                           WHERE p.signal_id = s.signal_id AND p.tweet_id IS NOT NULL
                             AND COALESCE(p.x_posted_at, p.created_at) >= :cut)
    """), {"d": days, "cut": X_CUTOVER}).mappings():
        if "%s|never_posted" % r["signal_id"] in seen or r["pair"] in hushed:
            continue
        entry, t4 = float(r["entry"] or 0), float(r["target4"] or 0)
        if not (entry and t4):
            continue
        gain = (t4 - entry) / entry * 100
        if gain < FRESH_AT:
            continue
        sym = r["pair"].replace("USDT", "")
        out.append({
            "signal_id": r["signal_id"], "kind": "never_posted", "pair": r["pair"],
            "headline": "Never made it to X", "metric": gain,
            "metric_label": "call to TP4",
            "quote_url": None,
            "draft": _drafts("never_posted", sym, gain, "TP4"),
        })

    # Biggest number first. There is no blended score on purpose: a ranking the
    # desk cannot explain to itself is one it stops trusting.
    out.sort(key=lambda c: -c["metric"])

    # One row per coin. The same pair often carries several calls in a week, and
    # three suggestions about one coin is a worse panel than three coins.
    best, seen_pairs = [], set()
    for c in out:
        if c["pair"] in seen_pairs:
            continue
        seen_pairs.add(c["pair"])
        best.append(c)
    out = best
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prices_ok": bool(px),
        "total": len(out),   # post-dedupe: what the desk would actually see
        "shown": min(limit, len(out)),
        "thresholds": {"still_running": MOVER_AT, "never_posted": FRESH_AT},
        "candidates": out[:limit],
    }


@router.post("/dismiss")
def dismiss(
    payload: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Mark a suggestion handled, so two admins never post the same coin."""
    sid, kind = payload.get("signal_id"), payload.get("kind")
    if not sid or not kind:
        return {"ok": False, "error": "signal_id and kind are required"}
    pair = payload.get("pair") or db.execute(text(
        "SELECT pair FROM signals WHERE signal_id = :s"), {"s": sid}).scalar()
    db.execute(text("""
        INSERT INTO x_manual_flags (signal_id, kind, action, tweet_id, actor, pair)
        VALUES (:s, :k, :a, :t, :who, :pair)
        ON CONFLICT (signal_id, kind) DO UPDATE
        SET action = EXCLUDED.action, tweet_id = EXCLUDED.tweet_id,
            actor = EXCLUDED.actor, pair = EXCLUDED.pair, created_at = now()
    """), {"s": sid, "k": kind, "pair": pair,
           "a": payload.get("action") or "dismissed",
           "t": payload.get("tweet_id"),
           "who": getattr(admin, "email", None) or getattr(admin, "username", None)})
    db.commit()
    return {"ok": True}
