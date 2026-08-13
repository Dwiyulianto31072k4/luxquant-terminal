# -*- coding: utf-8 -*-
"""caption_builder.py — the Telegram caption for the free channel.

The X tweet arrives written to a 220-character limit for crypto-Twitter. Alone
it reads like a pump alert: a win announced after the fact, with nothing to show
a plan ever existed. Telegram allows 1024 characters, and this module spends the
surplus on the one thing the tweet cannot carry: the ladder as it was published.

Everything the tweet already says is left to the tweet. The block is a header, a
ladder and one closing line — an earlier version restated the leverage maths, the
open targets and the win rate underneath a tweet that had just said all three,
which read as clutter and, in the case of the maths, printed two different
numbers for one fact.

Two rules govern every line produced here.

  1. Numbers come from the signal row, never from a model. A hallucinated price
     level reaching a public trading channel is not a cosmetic failure.

  2. An unreached target is a plan, never a forecast. Every phrase that mentions
     one is conditional by construction, so no combination of slots can emit a
     promise about where price is going.

Variation is situational, not cosmetic. Dropping synonyms into a fixed skeleton
still reads as a template by the fifth post, because readers register rhythm
before wording. So eligibility varies with the trade — how fast the move was, how
hard it paid, how much ladder is left — and the header and closing line rotate
independently of each other.
"""

import os
import zlib
from datetime import datetime

# Telegram renders <pre> as a code block with a "copy" button and a header bar,
# which reads as a source snippet rather than a price table. <blockquote> gives
# the ladder its own left rule with no chrome, at the cost of a proportional
# font — so the rows are built with separators instead of column alignment.
LADDER_OPEN = "<blockquote>"
LADDER_CLOSE = "</blockquote>"

_HIT_ORDINAL = {"tp2": 2, "tp3": 3, "tp4": 4, "closed_win": 4}


# ─────────────────────────────── primitives ───────────────────────────────

def esc(s):
    """HTML-escape. The caption is sent as parse_mode=HTML, so model-written
    text has to be escaped or a stray '<' fails the whole send."""
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def fmt_price(v):
    """Render at the coin's own precision: 2.3140 -> 2.314, 0.4500 -> 0.45."""
    try:
        s = f"{float(v):.10f}".rstrip("0").rstrip(".")
        return s or "0"
    except (TypeError, ValueError):
        return ""


def pct_from(entry, v):
    try:
        e, t = float(entry), float(v)
        return None if e == 0 else (t - e) / e * 100.0
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def parse_ts(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def elapsed(start, end):
    """(human_string, seconds). Both None when either end is unusable."""
    a, b = parse_ts(start), parse_ts(end)
    if not a or not b:
        return "", None
    secs = (b - a).total_seconds()
    if secs <= 0:
        return "", None
    mins = int(secs // 60)
    if mins < 60:
        return f"{mins} min", secs
    hours, mins = divmod(mins, 60)
    if hours < 24:
        return (f"{hours}h {mins}m" if mins else f"{hours}h"), secs
    days, hours = divmod(hours, 24)
    return (f"{days}d {hours}h" if hours else f"{days}d"), secs


def _join(names):
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


# ──────────────────────────── coin track record ───────────────────────────
# Mirrors backend/app/api/routes/coin_profile.py so a number quoted in the
# channel can never contradict the same number on the site's History tab. An
# outcome is the highest target a signal ever reached; a win is any tp1..tp4.

_ENGINE = None

_OUTCOME_CTE = """
signal_outcomes AS (
    SELECT signal_id, outcome FROM (
        SELECT signal_id,
            CASE
                WHEN LOWER(update_type) LIKE '%%tp4%%' OR LOWER(update_type) LIKE '%%target 4%%' THEN 'tp4'
                WHEN LOWER(update_type) LIKE '%%tp3%%' OR LOWER(update_type) LIKE '%%target 3%%' THEN 'tp3'
                WHEN LOWER(update_type) LIKE '%%tp2%%' OR LOWER(update_type) LIKE '%%target 2%%' THEN 'tp2'
                WHEN LOWER(update_type) LIKE '%%tp1%%' OR LOWER(update_type) LIKE '%%target 1%%' THEN 'tp1'
                WHEN LOWER(update_type) LIKE '%%sl%%'  OR LOWER(update_type) LIKE '%%stop%%'     THEN 'sl'
                ELSE NULL END AS outcome,
            ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY
                CASE
                    WHEN LOWER(update_type) LIKE '%%tp4%%' OR LOWER(update_type) LIKE '%%target 4%%' THEN 4
                    WHEN LOWER(update_type) LIKE '%%tp3%%' OR LOWER(update_type) LIKE '%%target 3%%' THEN 3
                    WHEN LOWER(update_type) LIKE '%%tp2%%' OR LOWER(update_type) LIKE '%%target 2%%' THEN 2
                    WHEN LOWER(update_type) LIKE '%%tp1%%' OR LOWER(update_type) LIKE '%%target 1%%' THEN 1
                    WHEN LOWER(update_type) LIKE '%%sl%%'  OR LOWER(update_type) LIKE '%%stop%%'     THEN 0
                    ELSE -1 END DESC) AS rn
        FROM signal_updates WHERE update_type IS NOT NULL
    ) ranked WHERE rn = 1 AND outcome IS NOT NULL
)
"""


def _engine():
    """Built lazily. This module is imported before load_dotenv() runs in the
    caller, so reading DATABASE_URL at import time would capture nothing."""
    global _ENGINE
    if _ENGINE is None:
        url = os.getenv("DATABASE_URL")
        if not url:
            return None
        from sqlalchemy import create_engine
        _ENGINE = create_engine(url, pool_pre_ping=True, pool_size=1, max_overflow=1)
    return _ENGINE


def wr_str(win_rate):
    """Render a win rate exactly as the site does, digit for digit.

    The backend returns `round(win_rate, 2)` and SignalHistoryTab.jsx
    interpolates it raw (`${stats.win_rate}%`), so JavaScript's number-to-string
    drops trailing zeros: 87.5 renders "87.5", 90.0 renders "90", 83.333 renders
    "83.33". Formatting to a fixed width here would print "88%" against the
    site's "87.5%" — and rounding a 87.5 up to 88 overstates the record on a
    button whose entire job is to invite the reader to go and check it.
    """
    try:
        v = round(float(win_rate), 2)
    except (TypeError, ValueError):
        return ""
    return f"{v:.2f}".rstrip("0").rstrip(".")


_REC_CACHE = {}


def coin_record(pair, exclude_signal_id=None):
    """Closed-trade record for one pair, or None when there is nothing solid.

    `exclude_signal_id` exists for the new-call case, where the signal has no
    outcome yet. **Do not pass it when posting a TP hit.** That signal already
    resolves as a win in the CTE, so excluding it shifts the denominator by one
    and the rounded rate drifts 1pp away from the site's on roughly one pair in
    twelve (measured: 2 of 24). The whole point of putting the number on a
    button is that a reader can tap through and check it, so it has to be the
    identical figure `coin_profile.py` computes — which excludes nothing.

    Memoised per (pair, signal): the caption and the buttons both want this for
    the same post, and it is a full-table scan each time. The cache is bounded
    and process-local, so a long-running poster cannot drift far from the DB.
    """
    key = ((pair or "").upper(), str(exclude_signal_id or ""))
    if key in _REC_CACHE:
        return _REC_CACHE[key]
    eng = _engine()
    if not eng or not pair:
        return None
    from sqlalchemy import text
    q = text(f"""
        WITH {_OUTCOME_CTE}
        SELECT COUNT(so.outcome) AS closed,
               SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN so.outcome = 'tp4' THEN 1 ELSE 0 END) AS sweeps
        FROM signals s
        LEFT JOIN signal_outcomes so ON s.signal_id = so.signal_id
        WHERE UPPER(s.pair) = :pair AND (:excl IS NULL OR s.signal_id <> :excl)
    """)
    try:
        with eng.connect() as con:
            r = con.execute(q, {"pair": pair.upper(), "excl": exclude_signal_id}).fetchone()
    except Exception:
        return None            # stats must never block a post
    if not r or not r.closed or r.closed < 3:
        out = None             # under three closed trades there is no record yet
    else:
        wins = r.wins or 0
        out = {"closed": r.closed, "wins": wins, "sweeps": r.sweeps or 0,
               "win_rate": wins / r.closed * 100.0}
    if len(_REC_CACHE) > 500:
        _REC_CACHE.clear()
    _REC_CACHE[key] = out
    return out


# ───────────────────────────── the situation ──────────────────────────────

def situation(signal, event_type, want_record=True):
    """Everything the phrase pools are allowed to reason about. Returns None
    when the row cannot support an honest block — a missing entry or ladder has
    to degrade to the bare narrative, never to a half-filled table that looks
    like something was withheld."""
    if not signal:
        return None
    hit_ord = _HIT_ORDINAL.get((event_type or "").lower())
    if not hit_ord:
        return None
    entry = signal.get("entry")
    entry_s = fmt_price(entry)
    if not entry_s:
        return None

    levels = []
    for i in (1, 2, 3, 4):
        tv = signal.get(f"target{i}")
        if tv in (None, "") or not fmt_price(tv):
            continue
        levels.append({"i": i, "name": f"TP{i}", "price": tv,
                       "price_s": fmt_price(tv), "pct": pct_from(entry, tv),
                       "hit": i <= hit_ord})
    if not levels:
        return None

    hit = next((l for l in levels if l["i"] == hit_ord), None)
    if not hit or hit["pct"] is None:
        return None

    lev = signal.get("pnl_leverage") or 10
    try:
        lev = int(float(lev))
    except (TypeError, ValueError):
        lev = 10
    lev_pct = hit["pct"] * lev

    dur_s, dur_secs = elapsed(signal.get("created_at"), signal.get("hit_time"))
    if dur_secs is None:
        speed = None
    elif dur_secs < 3600:
        speed = "flash"
    elif dur_secs < 6 * 3600:
        speed = "quick"
    elif dur_secs < 24 * 3600:
        speed = "steady"
    else:
        speed = "patient"

    if lev_pct >= 400:
        power = "huge"
    elif lev_pct >= 150:
        power = "big"
    elif lev_pct >= 50:
        power = "solid"
    else:
        power = "modest"

    open_levels = [l for l in levels if not l["hit"] and l["pct"] is not None]
    nxt = open_levels[0] if open_levels else None
    gap = None
    if nxt is not None:
        step = nxt["pct"] - hit["pct"]
        gap = "tight" if step < 5 else ("moderate" if step < 12 else "wide")

    full = next((l["pct"] for l in reversed(levels) if l["pct"] is not None), None)
    pair = (signal.get("pair") or "").upper()
    coin = pair[:-4] if pair.endswith("USDT") else pair

    s = {
        "signal_id": str(signal.get("signal_id") or ""),
        "pair": pair, "coin": coin,
        "entry": entry, "entry_s": entry_s,
        "levels": levels, "open": open_levels, "next": nxt,
        "remaining": len(open_levels),
        "hit_ord": hit_ord, "hit": hit,
        "hit_name": hit["name"], "hit_price_s": hit["price_s"],
        "spot": hit["pct"], "lev": lev, "lev_pct": lev_pct,
        "dur": dur_s, "dur_secs": dur_secs,
        "speed": speed, "power": power, "gap": gap,
        "full": full,
        "published": parse_ts(signal.get("created_at")),
        # No exclusion: must match the site exactly — see coin_record().
        "record": coin_record(pair) if want_record else None,
    }
    return s


# ────────────────────────────── phrase pools ──────────────────────────────
# Each entry is (template, gate). The gate decides whether a phrasing is even
# eligible for this trade, which is what keeps the variation meaningful — a line
# about barely having time to react only exists for trades that were that fast.

ANY = None


def _f(tpl, s):
    """Fill a template. Percentages are pre-rounded so no format spec leaks."""
    nxt = s.get("next") or {}
    return tpl.format(
        coin=s["coin"], entry=s["entry_s"], lev=s["lev"],
        hit=s["hit_name"], hit_price=s["hit_price_s"],
        spot=f"{s['spot']:.1f}", levp=f"{s['lev_pct']:.0f}",
        dur=s["dur"], full=(f"{s['full']:.1f}" if s["full"] is not None else ""),
        n_open=s["remaining"],
        # Agreement helpers, so a phrasing can serve one target or several
        # without needing a near-duplicate entry in the pool for each.
        v_remain=("remains" if s["remaining"] == 1 else "remain"),
        v_sit=("sits" if s["remaining"] == 1 else "sit"),
        v_is=("is" if s["remaining"] == 1 else "are"),
        n_word=("One" if s["remaining"] == 1 else str(s["remaining"])),
        plural=("" if s["remaining"] == 1 else "s"),
        open_list=_join([f"{l['name']} +{l['pct']:.1f}%" for l in s["open"]]),
        open_names=_join([l["name"] for l in s["open"]]),
        next_name=nxt.get("name", ""), next_price=nxt.get("price_s", ""),
        next_pct=(f"{nxt['pct']:.1f}" if nxt.get("pct") is not None else ""),
        step=(f"{nxt['pct'] - s['spot']:.1f}" if nxt.get("pct") is not None else ""),
        top_pct=(f"{s['open'][-1]['pct']:.1f}" if s["open"] else ""),
        time=(s["published"].strftime("%H:%M") if s["published"] else ""),
        date=(s["published"].strftime("%d %b") if s["published"] else ""),
        wr=(wr_str(s["record"]["win_rate"]) if s.get("record") else ""),
    )


# What the realised leg paid. Only appears when the tweet has not already said
# it — see narrative_states_the_maths(). Kept to one clause: the tweet above is
# the storytelling, this is the receipt.
REALISED = [
    ("{hit}: +{spot}% spot · +{levp}% at {lev}x.", ANY),
    ("+{levp}% at {lev}x from {entry}.", ANY),
    ("{hit} in {dur} · +{spot}% spot · +{levp}% at {lev}x.", lambda s: bool(s["dur"])),
    ("This leg: +{levp}% at {lev}x, entry {entry}.", ANY),
]

# Closing line — freemium best practice (honest, no emoji, no urgency spam).
#
# Job order per post (industry standard free→paid ladder):
#   1) STAY  — free feed still valuable: verified results, more hits coming
#   2) TRUST — free posts after TP so the book is checkable (not "you're a sucker")
#   3) UPGRADE — VIP only for what free cannot do: live from entry + fuller
#      data kept current so you can ride runs to max (or past plan)
#
# Never: "all hit max", countdown, spots-left, or making free feel worthless.
# Soft "many / often / plenty" only — peak can exceed plan; not every coin does.
CLOSER = [
    # --- open targets (TP2/TP3): stay-first, upgrade soft ---
    ("Many of these keep running to max — or past it. Stay for the next hits; free is the verified proof feed. Live from entry with fuller data, updated as it moves: VIP.",
     lambda s: s["remaining"] >= 1),
    ("{open_names} still open. A lot push all the way — sometimes beyond. Free shows results after TP so you can trust the book. Full path live from entry: VIP.",
     lambda s: s["remaining"] >= 1),
    ("You see this after {hit} — that is the free proof model. Plenty keep going further. Want the same trade live from {entry} with complete, updating data? VIP.",
     lambda s: s["remaining"] >= 1),
    ("Posted after {hit}. The run often continues. Free = checkable results. VIP = realtime entry + live data so gains can run longer when price keeps going.",
     lambda s: s["remaining"] >= 1),
    ("Free feed proves the plan after TP. Members manage the full path live — fuller data, refreshed as price moves. Stay free to verify; go VIP to execute from entry.",
     lambda s: s["remaining"] >= 1),
    # --- full sweep: peak moment for paid ask (contextual upgrade) ---
    ("Full plan hit. Many runs still print past the last target. Free proved it; VIP had this live from entry with complete, current data.",
     lambda s: s["remaining"] == 0),
    ("All targets done. Plenty of coins overshoot the plan. Next one live from entry — full updating data: VIP.",
     lambda s: s["remaining"] == 0),
    ("Plan complete from {entry}. Free channel is the public record. Realtime VIP keeps fuller data live so you can ride when price keeps going.",
     lambda s: s["remaining"] == 0),
]

HEADER = [
    "<b>Trade plan</b> · {date} {time} UTC",
    "<b>Plan as published</b> · {date} {time} UTC",
    "<b>Entry + targets</b> · {date} {time} UTC",
    "<b>Levels</b> · {date} {time} UTC",
    "<b>The plan</b> · {date} {time} UTC",
]
HEADER_NO_TS = "<b>Trade plan</b>"

# Replies land inside a thread whose first post already carries the ladder, so
# they only need what changed and an invitation to answer.
REPLY_LEFT = [
    ("{open_list} still open — many of these run the full path. Stay tuned.",
     lambda s: s["remaining"] >= 1),
    ("Next: {next_name} at +{next_pct}%. Plenty push further.",
     lambda s: s["remaining"] >= 1),
    ("{open_names} still on the plan. Free feed will post if they hit.",
     lambda s: s["remaining"] >= 1),
    ("{n_open} targets left — out to +{top_pct}%, and some keep going past.",
     lambda s: s["remaining"] > 1),
    ("Last target: {next_name} at +{next_pct}%. Often not the real top.",
     lambda s: s["remaining"] == 1),
]

REPLY_DONE = [
    ("Full plan cleared · +{full}% from entry. Many still overshoot.", ANY),
    ("All four targets · +{full}% from {entry}. Peak often prints higher.", ANY),
    ("Plan complete · +{full}% from entry. Free is the public record.", ANY),
]

# Soft engagement — short, human. Replies help channel ranking without spam energy.
ASK_OPEN = [
    "Still in this one?",
    "Who caught the entry?",
    "Riding it further?",
    "Did you take this?",
    "Who is still holding?",
    "In or out on this?",
]

ASK_DONE = [
    "Did you ride it out?",
    "Who took the full run?",
    "Caught all four?",
    "Who stayed to the end?",
    "Full plan — did you hold?",
]


# ─────────────────────────────── selection ────────────────────────────────
# Seeded on the signal, so a retry after a failed send reproduces the same text
# rather than posting a differently-worded duplicate. Each slot gets its own
# derived seed; sharing one would make the slots move together and collapse the
# combinations back down to a handful of recognisable modes.

_PRIMES = {"comp": 1, "head": 31, "real": 131, "proof": 313, "rest": 739,
           "cta": 1543, "rec": 2371, "ask": 3121, "left": 4441, "swept": 5227}


def _seed(s, slot):
    base = f"{s['signal_id']}|{s['hit_ord']}|{slot}".encode()
    return zlib.crc32(base) * _PRIMES.get(slot, 7)


def _pick(pool, s, slot):
    """Choose among the phrasings this trade actually qualifies for."""
    cands = [tpl for tpl, gate in pool if gate is None or gate(s)]
    if not cands:
        return ""
    return _f(cands[_seed(s, slot) % len(cands)], s)


def _pick_plain(pool, s, slot):
    return pool[_seed(s, slot) % len(pool)]


# ───────────────────────────────── ladder ─────────────────────────────────

def build_ladder(s):
    """Rows use separators rather than column alignment: a blockquote is set in
    a proportional font, so padded columns would come out ragged."""
    # The dropped <pre> table had a "From entry" column head. Without it a bare
    # "+7.7%" reads as distance from the current price, so the reference is
    # folded into the entry row rather than spent on another line.
    rows = [f"Entry {s['entry_s']} · % from here"]
    for l in s["levels"]:
        pct = f"+{l['pct']:.1f}%" if l["pct"] is not None else ""
        if l["hit"]:
            rows.append(f"<b>{l['name']} {l['price_s']} · {pct} · hit</b>")
        else:
            rows.append(f"{l['name']} {l['price_s']} · {pct} · open")
    return LADDER_OPEN + "\n".join(rows) + LADDER_CLOSE


def build_header(s):
    if not s["published"]:
        return HEADER_NO_TS
    return _f(_pick_plain(HEADER, s, "head"), s)


# ────────────────────────────── compositions ──────────────────────────────
# Which lines appear and in what order. Reordering matters more than word
# choice: readers clock a repeated rhythm long before they clock a repeated
# adjective, so the skeleton has to move too.



def narrative_states_the_maths(raw, s):
    """Does the tweet already contain the leveraged figure?

    It usually does — "spot pulled 2.2% while my 75x grabbed 165%" — and adding
    our own line underneath was the single biggest source of bulk in the post.
    Worse, the two disagree: the model rounds the spot percentage before
    multiplying (2.2 x 75 = 165%) while we multiply first (2.155 x 75 = 162%),
    so one message showed two different numbers for one fact. When the tweet has
    said it, we stay quiet.
    """
    if not raw:
        return False
    # Not a substring test: "75 x" and "75×" both name the leverage and both
    # slipped past `"75x" in text`, which is enough to bring the double-number
    # back. A spelled-out "seventy five times" would still miss, but the tweet
    # prompt instructs the model to write the figure, so that stays acceptable.
    import re
    return bool(re.search(rf"\b{re.escape(str(s['lev']))}\s*[x×]", raw, re.I))


def build_block(s, raw=""):
    """Header, ladder, and at most two short lines.

    Everything else that used to sit here — the proof sentence, the remaining-
    targets sentence, the track record, the standalone CTA — was already stated
    somewhere else in the same message and has been removed:

      · "those targets were on the board before price left X"  →  the header
        timestamp says exactly this, and says it in three words instead of ten.
      · "TP3 and TP4 remain on the plan"  →  the ladder already marks them open,
        and the tweet above usually mentions them too. It was the third telling.
      · the pair's win rate  →  now carried by the first button, which is where
        it can actually be clicked and checked.

    What remains is the part nothing else says: the levels as published (plan
    per TP), that free posts go out after a TP hits, and that full plan +
    realtime from entry is VIP.
    """
    lines = []
    if not narrative_states_the_maths(raw, s):
        lines.append(_pick(REALISED, s, "real"))
    lines.append(_pick(CLOSER, s, "close"))
    lines = [x for x in lines if x]
    return "\n\n" + build_header(s) + "\n" + build_ladder(s) + "\n" + "\n".join(
        esc(x) for x in lines)


def build_reply_tail(s):
    pool = REPLY_LEFT if s["remaining"] else REPLY_DONE
    line = _pick(pool, s, "left")
    ask = _pick_plain(ASK_OPEN if s["remaining"] else ASK_DONE, s, "ask")
    parts = [x for x in (line, ask) if x]
    if not parts:
        return ""
    return "\n\n" + "\n".join(esc(x) for x in parts)


# ───────────────────────────────── entry ──────────────────────────────────

def build_caption(text, event_type, signal=None, is_first=True, limit=1024,
                  want_record=True):
    """Return (caption, parse_mode).

    The tweet is passed through verbatim and the block is appended. Assembled in
    tiers and shed from the bottom up if it would blow the caption limit, since
    Telegram splitting the post would strand the inline buttons on the photo.
    """
    raw = (text or "").strip()
    s = situation(signal, event_type, want_record=want_record)
    if not s:
        return raw, None

    body = esc(raw)
    if not is_first:
        tail = build_reply_tail(s)
        cand = body + tail
        return (cand, "HTML") if tail and len(cand) <= limit else (raw, None)

    block = build_block(s, raw)
    if not block:
        return raw, None
    if len(body + block) <= limit:
        return body + block, "HTML"

    # Too long: fall back to the ladder plus the settled number, dropping the
    # discursive lines rather than truncating mid-sentence.
    minimal = ("\n\n" + build_header(s) + "\n" + build_ladder(s) + "\n"
               + esc(_pick(REALISED, s, "real")))
    if len(body + minimal) <= limit:
        return body + minimal, "HTML"
    return raw, None


# ══════════════════════════════════════════════════════════════════════════
#  BUTTONS
# ══════════════════════════════════════════════════════════════════════════
# Measured facts this layout is built on, not a generic CTA playbook:
#
#   · Signup converts to paid after 36 days on average (17 for Google signups).
#     Nothing is closing on this click, so a button that asks for money on every
#     post is spending the highest-volume slot on the least winnable ask. The
#     job here is to capture the account, then reach them over those weeks.
#
#   · /signals is in PREMIUM_REQUIRED, so the old "See This Signal's Breakdown"
#     deep link sent a cold reader to a login wall and then, once they signed up
#     free, to a paywall. The one page it promised was the one they could not
#     reach. Message match, the strongest predictor of landing-page bounce, was
#     broken on the most-shown button in the channel.
#
#   · The pages that ARE login-gated but not premium-gated (/performance,
#     /market-pulse) do exactly what a signup funnel wants: they force an
#     account and then pay it back immediately. Their redirect survives the
#     bounce (/login?redirect=%2Fperformance), unlike /signals whose ?signal=
#     query is dropped.
#
#   · Self-serve checkout has produced 12 conversions ever, against 36 from
#     admin-assisted paths, so the human row earns its place on every post.
#
# What is deliberately NOT here: countdowns, "spots left", "last chance". The
# objection this channel actually faces is that it looks like a pump group.
# Urgency devices are the vocabulary of exactly the thing we are being accused
# of being, so they would buy a click at the cost of the credibility the ladder
# was added to establish.

_UTM = "utm_source=telegram&utm_medium=channel&utm_campaign={c}&utm_content={k}"


def _utm(url, campaign, content):
    """Tag every destination. There is no attribution anywhere in the stack, but
    nginx logs page loads with their query strings, so this makes click volume
    per button countable from the access log without touching the platform."""
    sep = "&" if "?" in url else "?"
    return url + sep + _UTM.format(c=campaign, k=content)


# Row one, the account-capture ask. Every destination is free to a signed-up
# user and gated to an anonymous one, which is the whole point: it forces the
# signup and then immediately honours it.
#
# Three things every label here does deliberately:
#   · carries the word "free", because an unpriced CTA is read as priced;
#   · quotes the pair's own win rate when there is one, since a specific number
#     is the entire credibility play and a generic promise throws it away at the
#     exact moment of decision;
#   · stays under ~32 characters, or Telegram wraps it and the emphasis is lost.
#
# The rate is the same figure the site's History tab shows, computed by the same
# query, so the two can never disagree in front of a reader checking both. Note
# that definition counts TP1 as a win.
# Login capture: free page after signup. "Free" in label is mandatory —
# unpriced CTAs read as paid. Specific win rate beats generic promise.
FREE_CTA_RECORD = [
    ("See full results — free", "/performance", "results"),
    ("${coin} {wr}% win rate — free", "/performance", "wr_coin"),
    ("See how far winners run — free", "/performance", "how_far"),
    ("Open free terminal", "/market-pulse", "terminal"),
]

FREE_CTA_PLAIN = [
    ("See full results — free", "/performance", "results"),
    ("Open track record — free", "/performance", "record"),
    ("See how far winners run — free", "/performance", "how_far"),
    ("Open free terminal", "/market-pulse", "terminal"),
    # Telegram signup is one tap via "Continue with Telegram".
    ("Free account · track record", "/performance", "one_tap"),
]

# Row two on TP2/TP3. A human, not a checkout — see the 12-vs-36 note above.
# Naming the coin matches the post the reader just read and hands the admin
# someone who already knows what they want to ask. Telegram cannot prefill a DM
# to a User account, so the label is the only place that context can live.
ASK_ADMIN_COIN = [
    ("Message us about ${coin}", "ask_coin"),
    ("Ask why we called ${coin}", "why_coin"),
    ("Questions on ${coin}?", "q_coin"),
]

ASK_ADMIN_PLAIN = [
    ("Message us about this", "ask_call"),
    ("Questions? Message us", "ask_admin"),
]

# Full sweep only — proof peaked enough for the paid ask.
# Paid ask only on full sweep (value already realized — PLG timing).
BUY_CTA = [
    ("VIP — live entry + full data", "entries"),
    ("VIP: realtime, data stays live", "full_rt"),
    ("Join VIP — ride the next run", "next_live"),
]


def _btn_seed(signal_id, event_type, slot):
    return zlib.crc32(f"{signal_id}|{event_type}|{slot}".encode())


# A ticker much longer than this pushes the labels past the wrap point, so those
# pairs fall back to the wording that does not carry one.
_MAX_COIN_LEN = 7


def build_buttons(event_type, signal_id, website, pricing, admin, signal=None):
    """Two rows, always: one that captures an account, one that reaches a human.
    Position carries the hierarchy — Telegram renders every button identically,
    so order is the only emphasis available. Labels rotate because a button that
    never changes stops being read at all."""
    et = (event_type or "").lower()
    sid = str(signal_id or "")
    base = (website or "").rstrip("/")

    pair = ((signal or {}).get("pair") or "").upper()
    coin = pair[:-4] if pair.endswith("USDT") else pair
    named = bool(coin) and len(coin) <= _MAX_COIN_LEN

    rec = coin_record(pair) if pair else None
    wr = wr_str(rec["win_rate"]) if rec else None

    if wr and named:
        pool = FREE_CTA_RECORD
    else:
        pool = FREE_CTA_PLAIN
    label, path, key = pool[_btn_seed(sid, et, "free") % len(pool)]
    free_row = [{"text": label.format(wr=wr, coin=coin),
                 "url": _utm(base + path, et or "post", key)}]

    # No UTM on the t.me link: Telegram passes nothing through to the chat and
    # nginx never sees it, so the tag would be decoration on a URL that a stray
    # parameter could plausibly break.
    ask_pool = ASK_ADMIN_COIN if named else ASK_ADMIN_PLAIN
    ask_label, _ = ask_pool[_btn_seed(sid, et, "ask") % len(ask_pool)]
    admin_row = [{"text": ask_label.format(coin=coin), "url": admin}]

    if et in ("closed_win", "tp4"):
        buy_label, buy_key = BUY_CTA[_btn_seed(sid, et, "buy") % len(BUY_CTA)]
        return [[{"text": buy_label, "url": _utm(pricing, et, buy_key)}], admin_row]

    return [free_row, admin_row]
