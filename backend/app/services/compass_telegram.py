# backend/app/services/compass_telegram.py
"""
Post each new Compass read to the Telegram group, with its PDF attached.

Why the backend's own bot
-------------------------
Unlike the social-post path — where `@luxquant_ai_bot` owns the public channel
and the backend's bot is not an administrator — `LuxQuantTerminalBot` **is** an
administrator of the member group, checked 2026-08-26 via `getChatMember`. So
this uses `TELEGRAM_BOT_TOKEN` directly and needs no second credential.

The group is a forum, so the topic is addressed with `message_thread_id`. The
on-chain forwarder already posts this way to a different topic in the same
group; this is the same mechanism, not a new integration.

One message, not two
--------------------
The PDF is sent with the preview as its **caption**. A separate text message
followed by a document reads as two posts and doubles the notification count on
a group that already carries several feeds. Telegram caps a document caption at
1024 characters, which the builder respects.

Volume
------
Reports are event-driven and ran ~10/day through August, so this is roughly ten
posts a day at the default. `COMPASS_TG_MIN_INTERVAL_MINUTES` throttles that
without touching report generation — a skipped post is only a skipped post.
"""
from __future__ import annotations

import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

API = "https://api.telegram.org"
CAPTION_LIMIT = 1024

ENABLED = os.getenv("COMPASS_TG_ENABLED", "true").lower() in ("1", "true", "yes", "on")
CHAT_ID = os.getenv("COMPASS_TG_CHAT_ID", "-1002670915863")
THREAD_ID = os.getenv("COMPASS_TG_THREAD_ID", "838645")
MIN_INTERVAL_MIN = float(os.getenv("COMPASS_TG_MIN_INTERVAL_MINUTES", "0"))

# Each report is its own systemd-timer run, so throttling has to survive the
# process. A file, for the same reason the circuit breaker uses one: it must
# work when the database path is what is broken.
_STATE = Path(os.getenv("COMPASS_TG_STATE", "/opt/luxquant/state/compass-tg-last.txt"))

WEB_URL = (os.getenv("FRONTEND_URL") or "https://luxquant.tw").rstrip("/") + "/ai-arena"

_ARROW = {"bullish": "↑", "bearish": "↓", "neutral": "→"}


def _fmt_usd(v: Any) -> str:
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "—"


_RANGE_BIASES = ("RANGE", "NEUTRAL_RANGE")


def _num(v: Any) -> Optional[float]:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _is_range(bias: Any) -> bool:
    return str(bias or "").upper().startswith(_RANGE_BIASES)


def _pct_from(level: Any, ref: Any, decimals: int = 2) -> str:
    """Percent move from the reference price, without brackets.

    Brackets cost two characters in a block measured in single digits, and add
    nothing a sign does not already say.
    """
    try:
        lv, rf = float(level), float(ref)
        if rf <= 0:
            return ""
        return f"{(lv - rf) / rf * 100:+.{decimals}f}%"
    except (TypeError, ValueError):
        return ""


def _throttled() -> bool:
    if MIN_INTERVAL_MIN <= 0:
        return False
    try:
        last = float(_STATE.read_text().strip())
    except (OSError, ValueError):
        return False
    return (time.time() - last) < MIN_INTERVAL_MIN * 60


def _mark_sent() -> None:
    try:
        _STATE.parent.mkdir(parents=True, exist_ok=True)
        _STATE.write_text(str(time.time()))
    except OSError:
        pass  # losing the throttle costs an extra post, not a report


def _lookup_previous() -> Optional[dict]:
    """The last read we posted, and what it said.

    Used for two things at once: the message to reply to, and the "was X"
    comparison. `ai_arena_reports.previous_report_id` exists but has never been
    populated — every row is NULL — so the predecessor is simply the most recent
    entry here. The chain is strictly sequential, which is what "supersedes"
    means in this pipeline.
    """
    try:
        from sqlalchemy import text

        from app.core.database import SessionLocal
    except Exception:
        return None

    db = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT p.report_id, p.message_id, p.sent_at,
                   r.report_json::jsonb->'verdict'->'tactical_24h'->>'direction'  AS direction,
                   r.report_json::jsonb->'verdict'->'tactical_24h'->>'confidence' AS confidence,
                   COALESCE(r.report_json::jsonb->'verdict'->'scenario_contract'->>'reference_price',
                            r.report_json::jsonb->>'btc_price')                        AS price,
                   r.report_json::jsonb->'verdict'->'scenario_contract'->'primary_touch'->>'level' AS target,
                   r.report_json::jsonb->'verdict'->'scenario_contract'->'invalidation'->>'level'  AS stop
              FROM compass_tg_posts p
              LEFT JOIN ai_arena_reports r ON r.report_id = p.report_id
             ORDER BY p.sent_at DESC
             LIMIT 1
        """)).first()
        if not row:
            return None
        return {
            "report_id": row.report_id,
            "message_id": int(row.message_id),
            "sent_at": row.sent_at,
            "direction": (row.direction or "").lower() or None,
            "confidence": row.confidence,
            "price": row.price,
            "target": row.target,
            "stop": row.stop,
        }
    except Exception as e:
        logger.warning("previous post lookup failed: %s", e)
        return None
    finally:
        db.close()


def _record(report_id: str, message_id: int) -> None:
    try:
        from sqlalchemy import text

        from app.core.database import SessionLocal
    except Exception:
        return
    db = SessionLocal()
    try:
        db.execute(text("""
            INSERT INTO compass_tg_posts (report_id, chat_id, thread_id, message_id)
            VALUES (:r, :c, :t, :m)
            ON CONFLICT (report_id) DO UPDATE SET message_id = EXCLUDED.message_id
        """), {"r": report_id, "c": str(CHAT_ID), "t": str(THREAD_ID or ""), "m": message_id})
        db.commit()
    except Exception as e:
        logger.warning("post record failed: %s", e)
        db.rollback()
    finally:
        db.close()


def _gap(then) -> str:
    """How long before this post the previous one went out: "33m", "8h", "2d"."""
    try:
        from datetime import datetime, timezone

        secs = (datetime.now(timezone.utc) - then).total_seconds()
    except Exception:
        return ""
    if secs < 3600:
        return f"{max(1, round(secs / 60))}m"
    if secs < 86400:
        return f"{secs / 3600:.0f}h"
    return f"{secs / 86400:.0f}d"


# what_changed opens with its own clock: "0.5h ago: neutral …", "3h ago: bearish
# …", "Previous call: …". A bare "0.5h ago" reads as the age of THIS report, the
# same misreading as the old header, and the header already says how far back
# the previous report was. So the caption names it instead of timing it.
_PREV_LEAD = re.compile(
    r"^\s*(?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\s+ago"
    r"|previous\s+(?:call|read|report))\s*:\s*",
    re.IGNORECASE,
)


def _plain_changed(text: str) -> str:
    return _PREV_LEAD.sub("Previous report: ", str(text), count=1)


def _trim(text: str, limit: int) -> str:
    """Cut at a sentence boundary, or a word, never mid-word.

    `what_changed` runs to a few hundred characters and reflows to roughly
    seven lines on a phone. Hard-slicing it left sentences amputated — "so range
    remains int…" — which reads as a bug rather than an abbreviation.
    """
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    window = text[: limit + 1]
    for stop in (". ", "; ", " — "):
        cut = window.rfind(stop)
        if cut > limit * 0.5:
            return window[: cut + 1].rstrip(" ;—")
    cut = window.rfind(" ")
    return (window[:cut] if cut > 0 else window[:limit]).rstrip() + "…"


def _range_edge(ref: Any, touch: Any, *, bias: Any = None, support: Any = None,
                lid: Any = None) -> Optional[tuple[str, float]]:
    """The other side of a range read, or None.

    A range read is two-sided, but the card only ever printed the level the AI
    expects to touch first. When that level sat below spot the card read as a
    bearish call under a NEUTRAL verdict, with the lid that made it a range left
    in the database. Measured over 30 days: 130/130 range contracts had a lid
    above spot, and none of them printed it.
    """
    r, t = _num(ref), _num(touch)
    if not _is_range(bias) or r is None:
        return None
    label, level = ("Ceiling", _num(lid)) if (t is not None and t < r) else ("Floor", _num(support))
    # Only when it really is the opposite side; otherwise say nothing.
    if level is None or not ((level > r) if label == "Ceiling" else (level < r)):
        return None
    return label, level


def _level_line(label: str, old: Any, new: Any, ref: Any) -> Optional[str]:
    n = _num(new)
    if n is None:
        return None
    pct = _pct_from(n, ref, decimals=1)
    tail = f" ({pct})" if pct else ""
    o = _num(old)
    if o is None:
        return f"{label}: {_fmt_usd(n)}{tail}"
    if _fmt_usd(o) == _fmt_usd(n):
        return f"{label}: {_fmt_usd(n)}{tail} · unchanged"
    return f"{label}: {_fmt_usd(o)} → {_fmt_usd(n)}{tail}"


def _level_lines(previous: Optional[dict], direction: str, conf: Any, *, ref: Any,
                 touch: Any, inval: Any, bias: Any = None, support: Any = None,
                 lid: Any = None) -> list[str]:
    """Every number on the card, one per line, old → new where it moved.

    Plain lines, not a monospace column. The column was budgeted at 22
    characters because that was where a phone broke it, and it still broke on
    the owner's desktop pane: "+1.6%" dropped onto a line of its own and read as
    a separate row. Prose reflows instead, and listing the old value beside the
    new one is what members asked an update to show.
    """
    prev = previous or {}
    out: list[str] = []
    prev_dir = prev.get("direction")
    if prev_dir and prev_dir != direction:
        out.append(f"Direction: {prev_dir.upper()} → {direction.upper()}")
    pc, nc = _num(prev.get("confidence")), _num(conf)
    if pc is not None and nc is not None and int(pc) != int(nc):
        out.append(f"Confidence: {int(pc)}% → {int(nc)}%")

    if touch or inval:
        r, op = _num(ref), _num(prev.get("price"))
        if r is not None:
            out.append(f"BTC: {_fmt_usd(op)} → {_fmt_usd(r)}" if op is not None and _fmt_usd(op) != _fmt_usd(r)
                       else f"BTC: {_fmt_usd(r)}")
        rows = [_level_line("Target", prev.get("target"), touch, ref)]
        edge = _range_edge(ref, touch, bias=bias, support=support, lid=lid)
        if edge:
            rows.append(_level_line(edge[0], None, edge[1], ref))
        rows.append(_level_line("Stop", prev.get("stop"), inval, ref))
        out += [row for row in rows if row]
    return out


def build_caption(report: dict, previous: Optional[dict] = None) -> str:
    """The read, in the order someone in a group chat actually needs it.

    Ten of these arrive a day and most only nudge a number, so the first line
    has to answer "is this new information?" before anything else — and when the
    direction flips, say so rather than leaving the reader to diff two posts.

    Spacing is deliberately tight. The earlier version put the update reason and
    its timestamp on separate lines and left six blank lines in a message that
    is mostly three numbers and a sentence; on a phone that reads as far longer
    than it is.
    """
    verdict = report.get("verdict") or {}
    tac = verdict.get("tactical_24h") or {}
    sc = verdict.get("scenario_contract") or {}
    ref = sc.get("reference_price") or report.get("btc_price")

    direction = str(tac.get("direction") or "—").lower()
    conf = tac.get("confidence")
    arrow = _ARROW.get(direction, "•")
    conf_txt = f" · {int(conf)}% confidence" if isinstance(conf, (int, float)) else ""

    touch = (sc.get("primary_touch") or {}).get("level")
    inval = (sc.get("invalidation") or {}).get("level")

    lines: list[str] = []

    # An update names the report it replaces, then shows what moved: members
    # asked for exactly "the numbers from N hours ago became these". The header
    # used to say "levels refreshed · 8h ago", and on 26 Sep 2026 a member read
    # a fresh report as eight hours stale: the 8h was the gap to the old one.
    gap = _gap(previous.get("sent_at")) if previous else ""
    if previous:
        lines.append(f"🔄 <b>UPDATE</b>{' · replaces the report from ' + gap + ' ago' if gap else ''}")

    lines.append(f"{arrow} <b>{direction.upper()}</b>{conf_txt}")

    if verdict.get("headline"):
        lines.append(f"<i>{_trim(verdict['headline'], 130)}</i>")

    ext = sc.get("extension_zone") or {}
    level_lines = _level_lines(
        previous, direction, conf, ref=ref, touch=touch, inval=inval,
        bias=sc.get("primary_bias"),
        support=(sc.get("support") or {}).get("level"),
        lid=ext.get("price_high", ext.get("high")),
    )
    if level_lines:
        title = f"{gap} ago → now" if previous and gap else ("Changes" if previous else "Levels")
        lines += ["", f"<b>{title}</b>", *level_lines]

    changed = verdict.get("what_changed")
    if changed:
        # The numbers that moved are listed above; this is the AI's reason.
        # Trim first: the renamed lead is a few characters longer, and must not
        # cost the last sentence of a text that fitted before.
        lines += ["", f"<b>Why</b> · {_plain_changed(_trim(changed, 200))}"]

    lines += ["", f'<a href="{WEB_URL}">Open in LuxQuant →</a>']

    caption = "\n".join(lines)
    if len(caption) > CAPTION_LIMIT:
        caption = caption[: CAPTION_LIMIT - 1].rstrip() + "…"
    return caption


def send_report(report_id: str, report: dict, pdf_path: Optional[str] = None) -> dict:
    """Post one read. Never raises — a delivery problem must not fail a report."""
    if not ENABLED:
        return {"sent": False, "reason": "disabled"}
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not CHAT_ID:
        return {"sent": False, "reason": "no_credentials"}
    if _throttled():
        return {"sent": False, "reason": "throttled"}

    previous = _lookup_previous()
    caption = build_caption(report, previous)
    data: dict[str, Any] = {
        "chat_id": CHAT_ID,
        "caption": caption,
        "parse_mode": "HTML",
    }
    if THREAD_ID:
        data["message_thread_id"] = THREAD_ID
    if previous:
        # Reply to the read this one replaces, so the group can see the
        # revision rather than two unrelated posts. Telegram quotes the parent
        # inline, which makes the lineage readable without opening anything.
        data["reply_to_message_id"] = previous["message_id"]
        # If that message was deleted, still post: a broken reply target must
        # not swallow the report.
        data["allow_sending_without_reply"] = True

    try:
        if pdf_path and Path(pdf_path).exists():
            with Path(pdf_path).open("rb") as fh:
                r = requests.post(
                    f"{API}/bot{token}/sendDocument",
                    data=data,
                    files={"document": (f"{report_id}.pdf", fh, "application/pdf")},
                    timeout=60,
                )
        else:
            # Still post the read. A missing PDF is worth less than a silent gap.
            r = requests.post(
                f"{API}/bot{token}/sendMessage",
                data={**{k: v for k, v in data.items() if k != "caption"},
                      "text": caption,
                      "disable_web_page_preview": True},
                timeout=30,
            )
        payload = r.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("compass telegram send failed: %s", e)
        return {"sent": False, "reason": str(e)[:120]}

    if not payload.get("ok"):
        return {"sent": False, "reason": payload.get("description", "unknown")}

    _mark_sent()
    mid = payload["result"]["message_id"]
    _record(report_id, mid)
    return {"sent": True, "message_id": mid, "with_pdf": bool(pdf_path),
            "replied_to": (previous or {}).get("message_id")}
