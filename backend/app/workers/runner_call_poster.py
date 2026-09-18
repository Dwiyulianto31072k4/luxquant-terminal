"""Post each new Runners call into the VIP group's "Runners Call Selected" topic.

Runners is not a label stored on a signal. It is the Signals desk's `full_tp`
mode, and membership is computed live from two things:

  * the call carries one of the current runner tags — tags are stored per call
    in signal_enrichment, but WHICH tags count as runner tags is re-derived from
    outcome statistics (hunt_recipe.select_runner_tags), so the set can move;
  * its Edge score sits in the top 20% of the last seven days' book — a relative
    rank that is never stored and changes as new calls arrive.

So this does not invent a second definition. It asks the desk's own evaluator,
`signal_screen.match_screen({"runners": True})`, the same one saved-filter
alerts use, and decides each call ONCE: the first time its enrichment has been
written long enough for the cached Edge book to include it. That is the rule
the desk itself states ("classification is at publish") — a post in the topic
is never taken back because a later call out-ranked it.

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
# match_screen caches the Edge book for 30s and its own answer for 20s. A call
# enriched seconds ago may be missing from both, and deciding then would record
# a false "not a runner" forever. Waiting this long after enrichment rules it out.
SETTLE_SEC = int(os.getenv("RUNNER_SETTLE_SEC", "90"))
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
               s.risk_level, s.market_cap,
               ARRAY(SELECT DISTINCT t->>'name' FROM jsonb_array_elements(
                   COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                            e.entry_snapshot->'tags_annotated', '[]'::jsonb)) t
                   WHERE (t->>'important')::boolean IS TRUE) AS tags,
               (SELECT p.tg_message_id FROM tg_call_posts p
                 WHERE p.signal_id = s.signal_id AND p.event_type = 'call') AS call_msg_id
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
    """(signal ids the desk calls Runners now, {tag: stats} for the runner tags)."""
    from app.api.routes.edge_lab import get_tag_wr
    from app.services.hunt_recipe import select_runner_tags
    from app.services.signal_screen import match_screen

    ids = set(match_screen({"runners": True}, db))
    tags = select_runner_tags(get_tag_wr(days=0, min_n=40, db=db).get("tags") or [])
    return ids, {t["tag"]: t for t in tags if t.get("tag")}


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


def build_message(sig, hit_tags, tag_stats) -> str:
    """HTML caption, kept under Telegram's 1024-character photo caption limit.

    The levels use the same monospace board as the free channel's plan, so the
    columns line up; the call topic above carries the long version with the
    coin's track record, linked at the bottom."""
    e = html.escape
    pair = sig["pair"]
    created = datetime.fromisoformat(str(sig["created_at"]).replace("Z", "+00:00"))
    age_min = max(0, int((datetime.now(timezone.utc) - created).total_seconds() // 60))

    lines = [f"🏃 <b>RUNNERS CALL</b> · "
             f"<a href=\"https://www.tradingview.com/symbols/{e(pair)}.P/\">{e(pair)}</a>"]

    why = []
    for t in hit_tags:
        st = tag_stats.get(t) or {}
        rate = st.get("full_tp_rate")
        why.append(f"{_tag_label(t)} (TP3+ {float(rate):.0f}%)" if rate is not None else _tag_label(t))
    lines.append("Runner tag: " + e(" · ".join(why)) if why else "Runner tag")
    lines.append("Edge score: top 20% of the last 7 days")
    lines.append(f"Called {created.strftime('%H:%M')} UTC · {age_min} min ago")
    lines.append("")

    # One precision for the whole column: 0.049 under 0.0474 reads as a typo,
    # not as the same coin (the free channel's ladder learned this first).
    levels = [("Entry", sig["entry"])]
    levels += [(f"TP{i}", sig.get(f"target{i}")) for i in (1, 2, 3, 4)]
    levels += [(f"SL{i}", sig.get(f"stop{i}")) for i in (1, 2)]
    levels = [(n, v) for n, v in levels if v is not None]
    dec = max((len(_num(v).split(".")[1]) if "." in _num(v) else 0) for _, v in levels)
    rows = [(n, f"{float(v):.{dec}f}", None if n == "Entry" else _pct(sig["entry"], v))
            for n, v in levels]
    pw = max(len(p or "") for _, p, _ in rows)
    for name, price, pct in rows:
        pct_s = "" if pct is None else f"{pct:+.2f}%"
        row = f"{name:<5}  {(price or ''):<{pw}}  {pct_s:>7}".rstrip()
        lines.append(f"<code>{e(row)}</code>")

    facts = [x for x in (f"Risk {sig['risk_level']}" if sig.get("risk_level") else None,
                         f"MCap {sig['market_cap']}" if sig.get("market_cap") else None) if x]
    if facts:
        lines.append("")
        lines.append(e(" · ".join(facts)))

    lines.append("")
    if sig.get("call_msg_id"):
        internal = str(CHAT_ID).replace("-100", "", 1)
        lines.append(f"📍 <a href=\"https://t.me/c/{internal}/{sig['call_msg_id']}\">Original call</a>"
                     f" · 👉 <a href=\"{SIGNAL_URL.format(sid=e(str(sig['signal_id'])))}\">Open on LuxQuant</a>")
    else:
        lines.append(f"👉 <a href=\"{SIGNAL_URL.format(sid=e(str(sig['signal_id'])))}\">Open this call on LuxQuant</a>")
    lines.append("<i>Runners reach TP3 more often than other calls, not always. Size for the stop.</i>")
    return "\n".join(lines)


# ─────────────────────────────── sending ────────────────────────────────

def send(caption: str, photo: str | None) -> int:
    api = f"https://api.telegram.org/bot{BOT_TOKEN}"
    base = {"chat_id": str(CHAT_ID), "message_thread_id": str(TOPIC_ID), "parse_mode": "HTML"}
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
                SELECT signal_id, matched, tg_message_id, attempts FROM runner_call_posts
                WHERE signal_id = ANY(:ids)
            """), {"ids": [str(c["signal_id"]) for c in cands]}).fetchall()}
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

        for sig in cands:
            sid = str(sig["signal_id"])
            hit = [t for t in (sig.get("tags") or []) if t in tag_stats]
            prior = decided.get(sid)
            if prior is not None:
                _sid, matched, mid, attempts = prior
                if not matched or mid is not None or attempts >= MAX_ATTEMPTS:
                    continue
            else:
                matched = sid in ids
                reason = None
                if matched and (sig.get("status") or "").lower() in ("closed_loss", "closed_win"):
                    matched, reason = False, f"already {sig['status']} when decided"
                if dry_run:
                    _log(f"{'RUNNER' if matched else '      '} {sig['pair']:<14} "
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
                mid = send(build_message(sig, hit, tag_stats), sig.get("entry_chart_path"))
                db.execute(text("""
                    UPDATE runner_call_posts SET tg_message_id = :mid, posted_at = now(),
                           attempts = attempts + 1, last_error = NULL WHERE signal_id = :sid
                """), {"mid": mid, "sid": sid})
                _log(f"posted {sig['pair']} {sid} -> msg {mid} tags={hit}")
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
