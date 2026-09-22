"""Post each new Runners call into the VIP group's "Runners Call Selected" topic.

Runners is not a label stored on a signal. It is the Signals desk's `full_tp`
mode, and membership is computed live from two things:

  * the call carries one of the current runner tags — tags are stored per call
    in signal_enrichment, but WHICH tags count as runner tags is re-derived from
    outcome statistics (hunt_recipe.select_runner_tags), so the set can move;
  * its Edge score sits in the top 20% of the last seven days' book — a relative
    rank that is never stored and changes as new calls arrive.

So this does not invent a second definition. It asks the one evaluator of the
rule, `signal_screen.live_runner_ids`, and decides each call ONCE: the first
time its enrichment has been written long enough for the cached Edge book to
include it. That is the rule the desk itself states ("classification is at
publish") — a post in the topic is never taken back because a later call
out-ranked it.

This decision is also the source of truth for every other surface: the
Signals desk's Runners tab, saved alerts and Custom previews read it back
through `signal_screen.runner_members` (runner_call_posts.matched), so what a
member sees as Runners is exactly what this topic posted.

Runs as a oneshot on a one-minute timer: nothing stays in memory between runs,
so a restart cannot replay anything and a crash cannot leave a half-state.

    python -m app.workers.runner_call_poster            # decide + post
    python -m app.workers.runner_call_poster --dry-run  # last 24h, no writes
"""

from __future__ import annotations

import html
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

import httpx
from sqlalchemy import text

from app.core.database import SessionLocal

CHAT_ID = int(os.getenv("RUNNER_CHAT_ID", "-1002670915863"))
TOPIC_ID = int(os.getenv("RUNNER_TOPIC_ID", "855639"))
# The call assistant, so Runners posts come from the same sender as the calls.
BOT_TOKEN = os.getenv("RUNNER_BOT_TOKEN") or os.getenv("TG_BOT_TOKEN") or ""
PROXY = os.getenv("TELEGRAM_PROXY") or None

# An entry call is only useful while the entry is still in reach. Enrichment
# lands a median ~4 min after the call (p90 ~11), so an hour is generous; past
# it the call is recorded as decided and never posted.
MAX_AGE_MIN = int(os.getenv("RUNNER_MAX_AGE_MIN", "60"))
# live_runner_ids caches the Edge book for 30s and its own answer for 20s. A call
# enriched seconds ago may be missing from both, and deciding then would record
# a false "not a runner" forever. 30 + 20 is the longest either can be stale,
# so waiting that long after enrichment rules it out and not a second more.
SETTLE_SEC = int(os.getenv("RUNNER_SETTLE_SEC", "50"))
MAX_ATTEMPTS = 5

SIGNAL_URL = "https://luxquant.tw/signals?signal={sid}"


def _log(msg: str) -> None:
    print(f"[runner-poster] {msg}", flush=True)


# ─────────────────────────────── storage ────────────────────────────────

def ensure_tables(db) -> None:
    """Created by this worker, never on an API import path — DDL there once held
    a lock on users long enough to time out every request (2026-07-31)."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS runner_call_posts (
            signal_id      TEXT PRIMARY KEY,
            decided_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            matched        BOOLEAN NOT NULL,
            reason         TEXT,
            runner_tags    TEXT[],
            tg_message_id  BIGINT,
            attempts       INT NOT NULL DEFAULT 0,
            last_error     TEXT,
            posted_at      TIMESTAMPTZ
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS runner_call_updates (
            signal_id      TEXT NOT NULL,
            event_type     TEXT NOT NULL,
            tg_message_id  BIGINT,
            attempts       INT NOT NULL DEFAULT 0,
            last_error     TEXT,
            posted_at      TIMESTAMPTZ,
            PRIMARY KEY (signal_id, event_type)
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS runner_call_config (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        )
    """))
    # The first run marks where the topic starts. Without this the backlog of
    # the last hour would be posted in one burst the moment the timer starts.
    db.execute(text("""
        INSERT INTO runner_call_config (key, value) VALUES ('start_ts', now()::text)
        ON CONFLICT (key) DO NOTHING
    """))
    db.commit()


def start_ts(db):
    row = db.execute(text("SELECT value FROM runner_call_config WHERE key='start_ts'")).fetchone()
    return row[0] if row else None


# ────────────────────────────── selection ───────────────────────────────

def candidates(db, since_ts, max_age_min):
    """Calls old enough to have settled enrichment, young enough to act on."""
    return [dict(r._mapping) for r in db.execute(text("""
        SELECT s.signal_id, s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
               s.stop1, s.stop2, s.status, s.created_at, s.entry_chart_path,
               s.risk_level, s.market_cap, s.volume_rank_num, s.volume_rank_den, s.risk_reasons,
               ARRAY(SELECT DISTINCT t->>'name' FROM jsonb_array_elements(
                   COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                            e.entry_snapshot->'tags_annotated', '[]'::jsonb)) t
                   WHERE (t->>'important')::boolean IS TRUE) AS tags,
               (SELECT p.tg_message_id FROM tg_call_posts p
                 WHERE p.signal_id = s.signal_id AND p.event_type = 'call') AS call_msg_id,
               ARRAY(SELECT DISTINCT su.update_type FROM signal_updates su
                      WHERE su.signal_id = s.signal_id
                        AND su.update_type IN ('tp1','tp2','tp3','tp4')) AS hits_so_far
        FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id
        WHERE s.created_at::timestamptz >= GREATEST(CAST(:since AS timestamptz),
                                                   now() - make_interval(mins => :age))
          AND e.entry_snapshot IS NOT NULL
          AND e.analyzed_at IS NOT NULL
          AND e.analyzed_at::timestamptz <= now() - make_interval(secs => :settle)
        ORDER BY s.created_at::timestamptz ASC
    """), {"since": since_ts, "age": max_age_min, "settle": SETTLE_SEC}).fetchall()]


def runner_set(db):
    """(signal ids the Runners rule selects now, {tag: stats} for the runner tags)."""
    from app.api.routes.edge_lab import get_tag_wr
    from app.services.hunt_recipe import select_runner_tags
    from app.services.signal_screen import live_runner_ids

    ids = set(live_runner_ids(db))
    tags = select_runner_tags(get_tag_wr(days=0, min_n=40, db=db).get("tags") or [])
    return ids, {t["tag"]: t for t in tags if t.get("tag")}


def decide(sig, ids, tag_stats):
    """(matched, reason, top, hit) for a call the topic has not decided yet.

    `tag_stats` is in runner-tag rank order, so its first key is the #1 tag. A
    Top Runner is a Runner carrying it; the label is decided here, with the
    call, so the post and the site never disagree about it later."""
    from app.services.signal_screen import TOP_RUNNER_REASON

    carried = set(sig.get("tags") or [])
    hit = [t for t in tag_stats if t in carried]
    matched, reason = str(sig["signal_id"]) in ids, None
    if matched and (sig.get("status") or "").lower() in ("closed_loss", "closed_win"):
        matched, reason = False, f"already {sig['status']} when decided"
    top_tag = next(iter(tag_stats), None)
    top = matched and top_tag is not None and top_tag in hit
    if top:
        reason = f"{TOP_RUNNER_REASON}: carries {top_tag}, the #1 runner tag"
    return matched, reason, top, hit


# ────────────────────────────── the message ─────────────────────────────

def _num(v):
    if v is None:
        return None
    s = f"{float(v):.10f}".rstrip("0").rstrip(".")
    return s or "0"


def _pct(entry, v):
    try:
        e, t = float(entry), float(v)
        return (t - e) / e * 100.0 if e else None
    except (TypeError, ValueError):
        return None


def _tag_label(tag):
    return tag.replace("_", " ").lower()


def build_message(sig, hit_tags, tag_stats, top: bool = False, db=None) -> str:
    """HTML caption: a Runners head over the same body as the main call post.

    Only the head is Runners' own — why it was picked, when, and what it has
    already hit. Everything under it (facts, Entry, the Targets & Stop Loss
    table, the track record, the links) is app.services.call_format's call
    body, so a Runner reads exactly like the call it came from. Head lines are
    dropped, least useful first, if the photo caption would pass 1024 chars;
    the body never is.
    """
    from app.services import call_format as cf
    from app.services.signal_screen import RUNNERS_EDGE_TOP

    e = html.escape
    pair = sig["pair"]
    created = datetime.fromisoformat(str(sig["created_at"]).replace("Z", "+00:00"))
    age_min = max(0, int((datetime.now(timezone.utc) - created).total_seconds() // 60))

    head = [(f"🏃 <b>RUNNERS CALL</b>{' · ⭐ <b>TOP RUNNER</b>' if top else ''} · "
             f"{cf.pair_link(pair)}", 0)]
    why = []
    for t in hit_tags:
        st = tag_stats.get(t) or {}
        rate = st.get("full_tp_rate")
        why.append(f"{_tag_label(t)} (TP3+ {float(rate):.0f}%)" if rate is not None else _tag_label(t))
    head.append(("Runner tag: " + e(" · ".join(why)) if why else "Runner tag", 0))
    if top:
        head.append(("Top Runner: carries the #1 runner tag", 0))
    head.append((f"Edge score: top {RUNNERS_EDGE_TOP}% of the last 7 days", 3))
    head.append((f"Called {created.strftime('%H:%M')} UTC · {age_min} min ago", 2))
    # A call can reach TP1/TP2 inside the minutes enrichment takes — GUSDT did,
    # TP2 four minutes before its Runners post. Saying so keeps the post from
    # reading as a fresh entry at a price that has already moved.
    hits = sorted(h.upper() for h in (sig.get("hits_so_far") or []))
    if hits:
        head.append(("Already hit: " + ", ".join(hits), 0))
    if sig.get("call_msg_id"):
        internal = str(CHAT_ID).replace("-100", "", 1)
        head.append((f"📍 <a href=\"https://t.me/c/{internal}/{sig['call_msg_id']}\">Original call</a>", 1))
    head.append(("<i>Runners reach TP3 more often than other calls, not always. Size for the stop.</i>", 4))
    return cf.fit_caption(head, cf.call_body(sig, db))


# ─────────────────────────────── sending ────────────────────────────────

# Not `send`: a module-level plain `def send` collides by NAME with the async
# websocket `send` the market workers await, and the repo's await-a-sync-def
# gate can only compare names. One generic name turned that gate red and kept
# it red, which is worse than the name is good.
def post_to_topic(caption: str, photo: str | None, reply_to: int | None = None) -> int:
    api = f"https://api.telegram.org/bot{BOT_TOKEN}"
    base = {"chat_id": str(CHAT_ID), "message_thread_id": str(TOPIC_ID), "parse_mode": "HTML"}
    if reply_to:
        # If the Runners post was deleted, the update still lands in the topic.
        import json as _json
        base["reply_parameters"] = _json.dumps(
            {"message_id": int(reply_to), "allow_sending_without_reply": True})
    with httpx.Client(timeout=90.0, proxy=PROXY) as client:
        if photo and os.path.isfile(photo):
            with open(photo, "rb") as f:
                r = client.post(f"{api}/sendPhoto", data={**base, "caption": caption},
                                files={"photo": (os.path.basename(photo), f)})
        else:
            r = client.post(f"{api}/sendMessage", data={**base, "text": caption,
                                                        "disable_web_page_preview": "true"})
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not body.get("ok"):
        # Never log the URL: the token is in it.
        raise RuntimeError(f"telegram {r.status_code}: {str(body.get('description'))[:200]}")
    return int(body["result"]["message_id"])


# ─────────────────────────────── updates ────────────────────────────────
# Every TP and the stop that land AFTER a Runners post go under it as a reply,
# so the topic reads as one thread per call. Levels hit before the post are
# already named on it ("Already hit"), so they are not replayed.

UPDATE_TYPES = ("tp1", "tp2", "tp3", "tp4", "sl")
UPDATE_WINDOW_DAYS = 14


def pending_updates(db):
    return [dict(r._mapping) for r in db.execute(text("""
        SELECT DISTINCT ON (r.signal_id, su.update_type)
               r.signal_id, r.tg_message_id AS parent_id, s.pair, s.entry, s.created_at,
               su.update_type, su.price, su.update_at
        FROM runner_call_posts r
        JOIN signals s ON s.signal_id = r.signal_id
        JOIN signal_updates su ON su.signal_id = r.signal_id
        LEFT JOIN runner_call_updates u
               ON u.signal_id = r.signal_id AND u.event_type = su.update_type
        WHERE r.matched AND r.tg_message_id IS NOT NULL
          AND r.posted_at > now() - make_interval(days => :days)
          AND su.update_type = ANY(:types)
          AND su.update_at::timestamptz > r.posted_at
          AND (u.signal_id IS NULL OR (u.tg_message_id IS NULL AND u.attempts < :max))
        ORDER BY r.signal_id, su.update_type, su.update_at::timestamptz ASC
    """), {"days": UPDATE_WINDOW_DAYS, "types": list(UPDATE_TYPES), "max": MAX_ATTEMPTS}).fetchall()]


def _elapsed(start, end) -> str:
    try:
        a = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        b = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
    except ValueError:
        return ""
    mins = max(0, int((b - a).total_seconds() // 60))
    if mins < 60:
        return f"{mins}m"
    h, m = divmod(mins, 60)
    return f"{h}h {m}m" if h < 24 else f"{h // 24}d {h % 24}h"


def build_update(u) -> str:
    # Shared with the LuxQuant Call Tracking topic, which now prints the same line.
    from app.services.call_format import update_message
    return update_message(u["pair"], u["update_type"], u["price"], u["entry"],
                          u["created_at"], u["update_at"], u["signal_id"])


def post_updates(db, dry_run: bool = False) -> None:
    for u in pending_updates(db):
        key = {"sid": str(u["signal_id"]), "et": u["update_type"]}
        if dry_run:
            _log(f"update {u['pair']} {u['update_type']} -> reply to {u['parent_id']}")
            continue
        try:
            mid = post_to_topic(build_update(u), None, reply_to=u["parent_id"])
            db.execute(text("""
                INSERT INTO runner_call_updates (signal_id, event_type, tg_message_id, attempts, posted_at)
                VALUES (:sid, :et, :mid, 1, now())
                ON CONFLICT (signal_id, event_type) DO UPDATE
                   SET tg_message_id = :mid, attempts = runner_call_updates.attempts + 1,
                       posted_at = now(), last_error = NULL
            """), {**key, "mid": mid})
            _log(f"update {u['pair']} {u['update_type']} -> msg {mid} (reply to {u['parent_id']})")
        except Exception as exc:
            db.execute(text("""
                INSERT INTO runner_call_updates (signal_id, event_type, attempts, last_error)
                VALUES (:sid, :et, 1, :err)
                ON CONFLICT (signal_id, event_type) DO UPDATE
                   SET attempts = runner_call_updates.attempts + 1, last_error = :err
            """), {**key, "err": str(exc)[:500]})
            _log(f"update failed {u['pair']} {u['update_type']}: {exc}")
        db.commit()


# ──────────────────────────────── run ───────────────────────────────────

def run(dry_run: bool = False) -> None:
    if not BOT_TOKEN and not dry_run:
        _log("no bot token (RUNNER_BOT_TOKEN / TG_BOT_TOKEN); nothing sent")
        return
    db = SessionLocal()
    try:
        if dry_run:
            cands, decided = candidates(db, "1970-01-01", 24 * 60), {}
        else:
            ensure_tables(db)
            cands = candidates(db, start_ts(db), MAX_AGE_MIN)
            decided = {r[0]: r for r in db.execute(text("""
                SELECT signal_id, matched, tg_message_id, attempts, reason FROM runner_call_posts
                WHERE signal_id = ANY(:ids)
            """), {"ids": [str(c["signal_id"]) for c in cands]}).fetchall()}
        if not dry_run:
            post_updates(db)
        if not cands:
            return

        # Only a call with no decision yet needs the live evaluator. A decided
        # one keeps its decision: a retry after a failed send must not be
        # re-judged against a book that has moved on since.
        fresh = [c for c in cands if str(c["signal_id"]) not in decided]
        ids, tag_stats = runner_set(db) if fresh else (set(), {})
        if not fresh and not any(d[1] and d[2] is None and d[3] < MAX_ATTEMPTS
                                 for d in decided.values()):
            return
        if not tag_stats:
            _, tag_stats = runner_set(db)

        from app.services.signal_screen import TOP_RUNNER_REASON

        for sig in cands:
            sid = str(sig["signal_id"])
            prior = decided.get(sid)
            if prior is not None:
                _sid, matched, mid, attempts, reason = prior
                if not matched or mid is not None or attempts >= MAX_ATTEMPTS:
                    continue
                top = (reason or "").startswith(TOP_RUNNER_REASON)
                hit = [t for t in tag_stats if t in set(sig.get("tags") or [])]
            else:
                matched, reason, top, hit = decide(sig, ids, tag_stats)
                if dry_run:
                    _log(f"{'RUNNER' if matched else '      '}{' TOP' if top else '    '} {sig['pair']:<14} "
                         f"{sig['created_at']} tags={hit} {reason or ''}")
                    continue
                db.execute(text("""
                    INSERT INTO runner_call_posts (signal_id, matched, reason, runner_tags)
                    VALUES (:sid, :m, :r, :tags) ON CONFLICT (signal_id) DO NOTHING
                """), {"sid": sid, "m": matched, "r": reason, "tags": hit})
                db.commit()
                if not matched:
                    continue
            try:
                mid = post_to_topic(build_message(sig, hit, tag_stats, top=top, db=db), sig.get("entry_chart_path"))
                db.execute(text("""
                    UPDATE runner_call_posts SET tg_message_id = :mid, posted_at = now(),
                           attempts = attempts + 1, last_error = NULL WHERE signal_id = :sid
                """), {"mid": mid, "sid": sid})
                _log(f"posted {sig['pair']} {sid} -> msg {mid} tags={hit}{' TOP' if top else ''}")
            except Exception as exc:
                db.execute(text("""
                    UPDATE runner_call_posts SET attempts = attempts + 1, last_error = :err
                    WHERE signal_id = :sid
                """), {"err": str(exc)[:500], "sid": sid})
                _log(f"send failed {sig['pair']} {sid}: {exc}")
            db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
