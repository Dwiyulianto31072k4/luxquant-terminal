"""The one body every call-related Telegram post shares.

The reference is the main call post (`/root/tg_call_poster.py`, LuxQuant Call
topic): facts line, risk note, Entry, the Targets & Stop Loss table, the coin's
track record, Sentiment/Coinglass, and the link to the call. Other posts about a
call — Runners, Custom-screen alerts — used to invent their own layout, so the
same call read differently depending on where you met it. They now put their
own head on top and this body underneath, line for line the same.

That poster writes Telegram Markdown; this writes HTML (what the other senders
use). The visible text is identical — keep it that way when either changes.
"""

from __future__ import annotations

import html
import re

from sqlalchemy import text

SIGNAL_URL = "https://luxquant.tw/signals?signal={signal_id}"
CAPTION_LIMIT = 1024          # Telegram's limit for a photo caption, visible text

TRACK_LABEL = {"tp1": "TARGET 1 HIT", "tp2": "TARGET 2 HIT", "tp3": "TARGET 3 HIT",
               "tp4": "TARGET 4 HIT", "closed_win": "TARGET 4 HIT",
               "sl": "STOP LOSS HIT", "closed_loss": "STOP LOSS HIT"}

_e = html.escape


def fmt_num(v):
    if v is None:
        return None
    s = f"{float(v):.10f}".rstrip("0").rstrip(".")
    return s or "0"


def pct(entry, target) -> float:
    try:
        e, t = float(entry), float(target)
        return 0.0 if e == 0 else (t - e) / e * 100.0
    except (TypeError, ValueError):
        return 0.0


def pure(pair: str) -> str:
    return pair[:-4] if pair.endswith("USDT") else pair


def visible_len(html_text: str) -> int:
    """Characters Telegram counts toward the caption limit (markup removed)."""
    return len(html.unescape(re.sub(r"<[^>]+>", "", html_text)))


# ───────────────────────────── track record ─────────────────────────────
# Same query as tg_call_poster.fetch_coin_history (which mirrors the site's
# History tab), so a coin's record reads the same in every post.
_OUTCOME_CTE = """
signal_outcomes AS (
    SELECT signal_id, outcome FROM (
        SELECT signal_id,
            CASE
                WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
                WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
                WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
                WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
                WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 'sl'
                ELSE NULL END AS outcome,
            ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY
                CASE
                    WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                    WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                    WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                    WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                    WHEN LOWER(update_type) LIKE '%sl%'  OR LOWER(update_type) LIKE '%stop%'     THEN 0
                    ELSE -1 END DESC) AS rn
        FROM signal_updates WHERE update_type IS NOT NULL
    ) ranked WHERE rn = 1 AND outcome IS NOT NULL
)
"""


def coin_history(db, pair, exclude_signal_id=None):
    """Closed-trade record for one pair, or None. Never raises — a stats failure
    must not stop the post it decorates."""
    params = {"pair": (pair or "").upper(), "excl": exclude_signal_id}
    try:
        r = db.execute(text(f"""
            WITH {_OUTCOME_CTE}
            SELECT COUNT(so.outcome) AS closed,
                   SUM(CASE WHEN so.outcome='tp1' THEN 1 ELSE 0 END) AS tp1,
                   SUM(CASE WHEN so.outcome='tp2' THEN 1 ELSE 0 END) AS tp2,
                   SUM(CASE WHEN so.outcome='tp3' THEN 1 ELSE 0 END) AS tp3,
                   SUM(CASE WHEN so.outcome='tp4' THEN 1 ELSE 0 END) AS tp4,
                   SUM(CASE WHEN so.outcome='sl'  THEN 1 ELSE 0 END) AS sl,
                   MIN(s.created_at::timestamptz) AS first_at
            FROM signals s
            LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE UPPER(s.pair) = :pair AND (CAST(:excl AS text) IS NULL OR s.signal_id <> :excl)
        """), params).fetchone()
        if not r or not r.closed:
            return None
        outcomes = [x[0] for x in db.execute(text(f"""
            WITH {_OUTCOME_CTE}
            SELECT so.outcome FROM signals s
            JOIN signal_outcomes so ON s.signal_id = so.signal_id
            WHERE UPPER(s.pair) = :pair AND (CAST(:excl AS text) IS NULL OR s.signal_id <> :excl)
            ORDER BY s.created_at DESC LIMIT 20
        """), params).fetchall()]
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None
    wins = (r.tp1 or 0) + (r.tp2 or 0) + (r.tp3 or 0) + (r.tp4 or 0)
    streak, kind0 = 0, None
    for o in outcomes:
        kind = "win" if o in ("tp1", "tp2", "tp3", "tp4") else "loss"
        if kind0 is None:
            kind0, streak = kind, 1
        elif kind == kind0:
            streak += 1
        else:
            break
    return {"closed": r.closed, "win_rate": wins / r.closed * 100.0,
            "tp1": r.tp1 or 0, "tp2": r.tp2 or 0, "tp3": r.tp3 or 0, "tp4": r.tp4 or 0,
            "sl": r.sl or 0, "streak": streak, "streak_type": kind0, "first_at": r.first_at}


def history_block(pair, hist) -> str:
    if not hist or not hist["closed"]:
        return ""
    since = f" since {hist['first_at'].strftime('%b %Y')}" if hist.get("first_at") else ""
    s = hist["streak"]
    streak_txt = f"{s}{'W' if hist['streak_type'] == 'win' else 'L'} streak" if s else "—"
    n = hist["closed"] or 1
    pc = lambda k: f"{hist[k] / n * 100:.0f}%"  # noqa: E731
    return (f"\n📜 ${_e(pure(pair))} track record · {hist['closed']} closed{since}\n"
            f"WR {hist['win_rate']:.1f}% · {streak_txt}\n"
            f"TP1 {pc('tp1')} · TP2 {pc('tp2')} · TP3 {pc('tp3')} · TP4 {pc('tp4')} · SL {pc('sl')}\n")


# ─────────────────────────────── pieces ─────────────────────────────────

def cta(signal_id) -> str:
    return f"👉 <a href=\"{_e(SIGNAL_URL.format(signal_id=signal_id))}\">Open this call on LuxQuant</a>"


def pair_link(pair) -> str:
    return f"<a href=\"https://www.tradingview.com/symbols/{_e(pair)}.P/\">{_e(pair)}</a>"


def call_body(sig: dict, db=None, history=True) -> str:
    """Everything under a call post's head. `sig` carries the signals columns."""
    pair = sig["pair"]
    t = ""
    facts = []
    if sig.get("volume_rank_num") and sig.get("volume_rank_den"):
        facts.append(f"Vol #{sig['volume_rank_num']}/{sig['volume_rank_den']}")
    if sig.get("market_cap"):
        facts.append(f"MCap {sig['market_cap']}")
    if sig.get("risk_level"):
        facts.append(f"Risk {sig['risk_level']}")
    if facts:
        t += "📊 " + _e(" · ".join(facts)) + "\n"
    if sig.get("risk_reasons"):
        raw = str(sig["risk_reasons"]).replace("|", "\n")
        reasons = [r.strip(" -•\t.") for r in raw.split("\n") if r.strip(" -•\t.")]
        if reasons:
            t += "⚠️ " + _e(" · ".join(reasons)) + "\n"
    t += "\n"
    t += f"<b>Entry: {_e(fmt_num(sig['entry']))}</b>\n\n"
    t += "🎯 Targets &amp; Stop Loss\n"
    t += "---------------------------------------\n"
    t += "Level         Price       % Change from Entry\n"
    t += "---------------------------------------\n"
    for i in range(1, 5):
        tv = sig.get(f"target{i}")
        if tv is not None:
            t += f"Target {i}      {_e(fmt_num(tv))}      +{pct(sig['entry'], tv):.2f}%\n"
    for i in range(1, 3):
        sv = sig.get(f"stop{i}")
        if sv is not None:
            p = pct(sig["entry"], sv)
            t += f"Stop Loss {i}   {_e(fmt_num(sv))}      {'+' if p >= 0 else ''}{p:.2f}%\n"
    t += "---------------------------------------\n"
    if history and db is not None:
        t += history_block(pair, coin_history(db, pair, sig.get("signal_id")))
    t += "\n"
    p = _e(pure(pair))
    t += f"<a href=\"https://x.com/search?q=%24{p}&amp;src=typed_query\">📈 Sentiment ${p}</a>\n"
    t += f"<a href=\"https://www.coinglass.com/currencies/{p}\">📊 Coinglass ${p}</a>"
    t += "\n\n" + cta(sig["signal_id"])
    return t


def tracking_line(pair, event_type, price) -> str:
    """The call-tracking line, as the LuxQuant Call Tracking topic prints it."""
    label = TRACK_LABEL.get(event_type, str(event_type).upper())
    emoji = "🛑" if event_type in ("sl", "closed_loss") else "✅"
    return f"{emoji} {label}: {_e(pair)} ({_e(fmt_num(price) or '')}) {emoji}"


def elapsed(start, end) -> str:
    from datetime import datetime
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


def update_message(pair, event_type, price, entry, called_at, hit_at, signal_id, call_url=None) -> str:
    """A TP/SL update, as Runners has always printed it and Call Tracking now does.

    One line of what hit, where, how far from entry and how long it took, then
    the link. Text only — no link preview card under it.

    `call_url` (a t.me link to the call post) turns the pair into a jump to the
    call. Telegram accepts a reply to a message in another forum topic but the
    apps do not draw it (checked 2026-09-22), so the link is what actually
    takes a reader from the update to the call.
    """
    et = {"closed_loss": "sl", "closed_win": "tp4"}.get(event_type, event_type)
    try:
        p = (float(price) - float(entry)) / float(entry) * 100.0 if float(entry) else None
    except (TypeError, ValueError):
        p = None
    pct_s = f" ({p:+.2f}%)" if p is not None else ""
    when = elapsed(called_at, hit_at) if called_at and hit_at else ""
    after = f" · {when} after the call" if when else ""
    if et == "sl":
        head = "🛑 <b>STOP LOSS HIT</b>"
    elif et == "tp4":
        head = "🏁 <b>TP4 HIT · plan complete</b>"
    else:
        head = f"✅ <b>{_e(str(et).upper())} HIT</b>"
    link = _e(SIGNAL_URL.format(signal_id=signal_id))
    name = f"<a href=\"{_e(call_url)}\">{_e(pair)}</a>" if call_url else _e(pair)
    return (f"{head} · {name} {_e(fmt_num(price) or '')}{pct_s}{after}\n"
            f"👉 <a href=\"{link}\">Open on LuxQuant</a>")


def fit_caption(head: list[tuple[str, int]], body: str) -> str:
    """Head + body under the caption limit.

    `head` is (line, drop_rank) in display order; rank 0 is never dropped, and
    higher ranks go first when the caption is too long. The body is never cut:
    it is the part that must read the same everywhere.
    """
    lines = list(head)
    while True:
        caption = "\n".join(ln for ln, _ in lines) + "\n\n" + body
        droppable = [i for i, (_, r) in enumerate(lines) if r > 0]
        if visible_len(caption) <= CAPTION_LIMIT or not droppable:
            return caption
        worst = max(droppable, key=lambda i: lines[i][1])
        lines.pop(worst)
