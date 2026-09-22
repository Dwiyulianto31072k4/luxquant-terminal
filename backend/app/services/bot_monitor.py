"""Telegram bot monitor — backs Management System › Bots.

LuxQuant speaks through four Telegram bots and listens through six Telethon
user sessions. Until this page, "is the bot OK?" meant SSHing in and reading
three journals: Custom-screen alerts failed for weeks with "chat not found"
while the service showed green, and the Alert bot sat with no photo, no
description and no reply to /start. Each bot here is judged on four things:

  * identity  — the token still answers getMe (a revoked token is DOWN)
  * profile   — photo, description, short description, commands
  * plumbing  — the services that run it are up; webhook errors / unread DMs
  * output    — it actually posted recently, and what failed

Tokens are read per file, never merged: two different bots are both called
TG_BOT_TOKEN in two different env files. Values are used only to call the
Bot API and are never returned.
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.redis import cache_get, cache_set

CACHE_KEY = "lq:botmon:v1"
CACHE_TTL = 60
REFRESH_FLOOR = 15          # a forced refresh is still served from cache this young
SEVERITY = {"down": 0, "warn": 1, "ok": 2, "info": 3}   # info never sets a status

BOTS: list[dict[str, Any]] = [
    {
        "key": "terminal", "env": "TELEGRAM_BOT_TOKEN", "file": None,
        "role": "Front door: login, Mini App, onboarding DMs, and the primary sender of personal alerts (Custom screen, watchlist, payments, Compass).",
        "services": ["luxquant-backend.service", "luxquant-tg-delivery.service"],
        "webhook": True,
    },
    {
        "key": "alert", "env": "ALERT_BOT_TOKEN", "file": "/root/.luxquant_alertbot_env",
        "role": "Fallback sender for personal alerts, used only when the Terminal bot cannot open a user's chat.",
        "services": ["luxquant-tg-delivery.service"],
        "webhook": False,
    },
    {
        "key": "assistant", "env": "TG_BOT_TOKEN", "file": "/etc/luxquant/secrets.env",
        "role": "Posts to the VIP group: LuxQuant Call, Call Tracking and Runners topics.",
        "services": ["luxquant-call-poster.service", "luxquant-runner-poster.timer",
                     "luxquant-chart-worker.service"],
        "webhook": False,
    },
    {
        "key": "ai", "env": "TG_BOT_TOKEN", "file": "/root/luxquant-x-poster/.env",
        "role": "Posts to the free channel: call recaps, signal cards and market posts.",
        "services": ["luxquant-x-poster.service"],
        "webhook": False,
    },
]

# Telethon user sessions. They are accounts, not bots, so no profile — the
# question is whether they are alive, and "active" is not enough: a session can
# give up reconnecting while its process keeps running (see luxquantdrc, Sep 1).
SESSIONS: list[dict[str, Any]] = [
    {"unit": "luxquant-realtime.service", "label": "Signal scraper", "role": "Reads the source channel and writes every call and update to the database.", "quiet_h": 2},
    {"unit": "crypto-news-bot.service", "label": "News channel", "role": "Collects news from 5 Telegram channels.", "quiet_h": 6},
    {"unit": "luxquant-forwarder.service", "label": "Forwarder", "role": "Forwards partner content into LuxQuant groups.", "quiet_h": 24},
    {"unit": "luxquant-onchain-forwarder.service", "label": "On-chain forwarder", "role": "Forwards on-chain alerts into the VIP group.", "quiet_h": 12},
    {"unit": "luxquantdrc.service", "label": "DRC Discord mirror", "role": "Mirrors VIP topics to the Daily Rekom Crypto Discord.", "quiet_h": 12},
]


# ─────────────────────────────── helpers ────────────────────────────────

def _token(env: str, path: str | None) -> str:
    if path is None:
        return (os.getenv(env) or "").strip()
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("export "):
                    line = line[7:]
                if line.startswith(env + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def _since(ts) -> float | None:
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return time.time() - float(ts)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds()


def _iso(ts):
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.isoformat()


async def _probe(client: httpx.AsyncClient, token: str) -> dict[str, Any]:
    """Everything the Bot API will say about a bot, in parallel."""
    base = f"https://api.telegram.org/bot{token}"

    async def call(method, payload=None):
        try:
            r = await client.post(f"{base}/{method}", json=payload or {})
            body = r.json()
            return body.get("result") if body.get("ok") else {"_error": body.get("description") or f"HTTP {r.status_code}", "_code": r.status_code}
        except Exception as e:  # network, proxy, JSON
            return {"_error": type(e).__name__, "_code": None}

    me = await call("getMe")
    if not isinstance(me, dict) or me.get("_error"):
        return {"me": me}
    desc, short, cmds, menu, wh, photos = await asyncio.gather(
        call("getMyDescription"), call("getMyShortDescription"), call("getMyCommands"),
        call("getChatMenuButton"), call("getWebhookInfo"),
        call("getUserProfilePhotos", {"user_id": me["id"], "limit": 1}),
    )
    avatar = None
    try:
        # The smallest size (160px, a few KB) inlined as a data URI: the page
        # shows the face each bot actually has, and the token never leaves here.
        sizes = (photos or {}).get("photos", [[]])[0] if isinstance(photos, dict) else []
        if sizes:
            f = await call("getFile", {"file_id": min(sizes, key=lambda x: x.get("width", 0))["file_id"]})
            if isinstance(f, dict) and f.get("file_path"):
                img = await client.get(f"https://api.telegram.org/file/bot{token}/{f['file_path']}")
                if img.status_code == 200 and len(img.content) < 60_000:
                    import base64
                    avatar = "data:image/jpeg;base64," + base64.b64encode(img.content).decode()
    except Exception:
        avatar = None
    return {"me": me, "desc": desc, "short": short, "cmds": cmds, "menu": menu, "wh": wh,
            "photos": photos, "avatar": avatar}


def _unit(unit: str) -> dict[str, Any]:
    from app.api.routes.services_monitor import _describe
    try:
        d = _describe(unit)
    except Exception as e:
        return {"unit": unit, "health": "unknown", "error": type(e).__name__}
    keep = ("unit", "name", "kind", "health", "active_state", "sub_state", "result",
            "uptime_seconds", "restarts", "last_trigger_usec", "error")
    return {k: d.get(k) for k in keep if k in d}


def _last_log_age(unit: str) -> float | None:
    try:
        out = subprocess.run(
            ["journalctl", "-u", unit, "-n", "1", "-o", "short-unix", "--no-pager", "-q"],
            capture_output=True, text=True, timeout=6).stdout.strip()
        m = re.match(r"^(\d+\.\d+)", out)
        return time.time() - float(m.group(1)) if m else None
    except Exception:
        return None


def _delivery_journal(uptime_s: float | None) -> dict[str, Any]:
    """What the delivery worker said since it last started (at most 24h).

    Its DB stamp cannot tell a delivered alert from an undeliverable one, so the
    journal is the record. The window starts at the current process on purpose:
    failures logged by code that has since been replaced describe a bot that no
    longer runs (558 "chat not found" on the day the Terminal bot took over).
    """
    window = int(min(uptime_s or 86400, 86400))
    try:
        out = subprocess.run(
            ["journalctl", "-u", "luxquant-tg-delivery", "--since", f"-{window}s", "-o", "cat", "--no-pager", "-q"],
            capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return {"available": False}
    fails = re.findall(r"fail (?:notif=\d+ )?(?:type=\S+ )?uid=(\d+): (.*)", out)
    reasons: dict[str, int] = {}
    for _, err in fails:
        key = ("blocked" if "blocked" in err else "chat not found" if "chat not found" in err
               else err.split("{")[0].strip()[:40] or "error")
        reasons[key] = reasons.get(key, 0) + 1
    sent = sum(int(x) for x in re.findall(r"instant_personal=(\d+)", out))
    return {
        "available": True,
        "window_s": window,
        "sent_24h": sent,
        "failed_24h": len(fails),
        "undeliverable_24h": out.count("UNDELIVERABLE"),
        "failing_users": len({u for u, _ in fails}),
        "fail_reasons": reasons,
    }


def _activity(db) -> dict[str, dict[str, Any]]:
    q = lambda sql, **p: db.execute(text(sql), p).first()  # noqa: E731
    act: dict[str, dict[str, Any]] = {}

    call = q("""SELECT max(posted_at) FILTER (WHERE event_type='call'),
                       count(*) FILTER (WHERE event_type='call' AND posted_at > now()-interval '24 hours'),
                       max(posted_at) FILTER (WHERE event_type<>'call'),
                       count(*) FILTER (WHERE event_type<>'call' AND posted_at > now()-interval '24 hours')
                FROM tg_call_posts""")
    fail = q("""SELECT count(*), max(updated_at),
                       (array_agg(last_error ORDER BY updated_at DESC))[1]
                FROM tg_call_post_failures WHERE updated_at > now()-interval '24 hours'""")
    unposted = q("""SELECT count(*) FROM signals s
                    WHERE s.created_at::timestamptz BETWEEN now()-interval '6 hours' AND now()-interval '10 minutes'
                      AND s.entry_chart_path IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM tg_call_posts p WHERE p.signal_id=s.signal_id AND p.event_type='call')""")
    runner = q("""SELECT max(posted_at), count(*) FILTER (WHERE posted_at > now()-interval '24 hours'),
                         count(*) FILTER (WHERE matched AND tg_message_id IS NULL AND last_error IS NOT NULL
                                          AND decided_at > now()-interval '24 hours'),
                         (array_agg(last_error ORDER BY decided_at DESC) FILTER (WHERE last_error IS NOT NULL))[1]
                  FROM runner_call_posts""")
    act["assistant"] = {
        "last_call_post": _iso(call[0]), "calls_24h": call[1] or 0,
        "last_tracking_post": _iso(call[2]), "tracking_24h": call[3] or 0,
        "failures_24h": fail[0] or 0, "last_failure": (fail[2] or "")[:200] or None,
        "calls_waiting_6h": unposted[0] or 0,
        "last_runner_post": _iso(runner[0]), "runners_24h": runner[1] or 0,
        "runner_failures_24h": runner[2] or 0, "last_runner_error": (runner[3] or "")[:200] or None,
    }

    notif = q("""SELECT count(*) FILTER (WHERE telegram_sent_at > now()-interval '24 hours'),
                        max(telegram_sent_at),
                        count(*) FILTER (WHERE telegram_sent_at IS NULL AND user_id IS NOT NULL
                                           AND type NOT IN ('news','market_pulse')
                                           AND created_at BETWEEN now()-interval '6 hours' AND now()-interval '5 minutes'
                                           AND EXISTS (SELECT 1 FROM users u JOIN notification_preferences p
                                                         ON p.user_id = u.id AND p.telegram
                                                        AND p.notif_type = CASE WHEN n.type LIKE 'autotrade%' THEN 'autotrade' ELSE n.type END
                                                       WHERE u.id = n.user_id AND u.telegram_id IS NOT NULL))
                 FROM notifications n WHERE created_at > now()-interval '2 days'""")
    compass = q("""SELECT max(sent_at), count(*) FILTER (WHERE sent_at > now()-interval '24 hours') FROM compass_tg_posts""")
    reach = q("""SELECT count(*) FILTER (WHERE telegram_bot_started_at IS NOT NULL), count(*)
                 FROM users WHERE telegram_id IS NOT NULL""")
    act["terminal"] = {
        "alerts_stamped_24h": notif[0] or 0, "last_alert": _iso(notif[1]),
        "alerts_unsent_6h": notif[2] or 0,
        "last_compass_post": _iso(compass[0]), "compass_24h": compass[1] or 0,
        "reachable_accounts": reach[0] or 0, "linked_accounts": reach[1] or 0,
    }
    act["alert"] = {"alerts_stamped_24h": notif[0] or 0}

    xp = q("""SELECT max(created_at) FILTER (WHERE tg_message_id IS NOT NULL),
                     count(*) FILTER (WHERE tg_message_id IS NOT NULL AND created_at > now()-interval '24 hours')
              FROM x_posts WHERE created_at > now()-interval '7 days'""")
    act["ai"] = {"last_channel_post": _iso(xp[0]), "channel_posts_24h": xp[1] or 0}
    return act


# ─────────────────────────────── judging ────────────────────────────────

def _judge(bot: dict, probe: dict, units: list[dict], act: dict, journal: dict) -> dict[str, Any]:
    checks: list[tuple[str, str]] = []   # (level, text)
    me = probe.get("me") or {}
    row: dict[str, Any] = {"key": bot["key"], "role": bot["role"], "env": bot["env"],
                           "env_file": bot["file"] or "backend/.env", "services": units, "activity": act}

    if probe.get("_no_token"):
        checks.append(("down", f"{bot['env']} is not set in {row['env_file']}"))
    elif me.get("_error"):
        code = me.get("_code")
        checks.append(("down", "Token rejected by Telegram (revoked or wrong)" if code in (401, 404)
                       else f"Telegram unreachable: {me['_error']}"))
    else:
        row.update({"username": me.get("username"), "name": me.get("first_name"), "id": me.get("id")})
        desc = (probe.get("desc") or {}).get("description") or ""
        short = (probe.get("short") or {}).get("short_description") or ""
        cmds = [c.get("command") for c in (probe.get("cmds") or []) if isinstance(c, dict)]
        photo = (probe.get("photos") or {}).get("total_count") or 0
        menu = (probe.get("menu") or {}).get("type")
        wh = probe.get("wh") or {}
        row["profile"] = {"photo": bool(photo), "avatar": probe.get("avatar"), "description": desc,
                          "short_description": short, "commands": cmds, "menu_button": menu}
        err_age = _since(wh.get("last_error_date")) if wh.get("last_error_date") else None
        row["webhook"] = {
            "set": bool(wh.get("url")),
            "host": re.sub(r"^https?://([^/]+).*", r"\1", wh.get("url") or "") or None,
            "pending": wh.get("pending_update_count") or 0,
            "last_error": wh.get("last_error_message"),
            "last_error_age_s": round(err_age) if err_age is not None else None,
        }
        missing = [x for x, ok in (("photo", photo), ("description", desc), ("short description", short)) if not ok]
        if missing:
            checks.append(("warn", "Profile incomplete: no " + ", ".join(missing)))
        if bot["webhook"]:
            if not wh.get("url"):
                checks.append(("down", "Webhook is not set — /start, commands and the Mini App button get no reply"))
            elif err_age is not None and err_age < 3600:
                checks.append(("down", f"Webhook failing: {wh.get('last_error_message')}"))
            elif err_age is not None and err_age < 86400:
                checks.append(("warn", f"Webhook error {round(err_age / 3600)}h ago: {wh.get('last_error_message')}"))
        elif (wh.get("pending_update_count") or 0) > 20:
            checks.append(("info", f"{wh['pending_update_count']} messages sent to this bot were never read — nothing handles its DMs"))

    for u in units:
        h = u.get("health")
        if h == "down":
            checks.append(("down", f"{u.get('name') or u['unit']} is {u.get('active_state')}/{u.get('sub_state')}"))
        elif h == "warn":
            checks.append(("warn", f"{u.get('name') or u['unit']} needs attention ({u.get('sub_state')})"))

    k = bot["key"]
    if k == "assistant":
        if act.get("calls_waiting_6h"):
            checks.append(("down" if act["calls_waiting_6h"] >= 3 else "warn",
                           f"{act['calls_waiting_6h']} calls from the last 6h have a chart but were never posted"))
        if act.get("failures_24h"):
            checks.append(("warn", f"{act['failures_24h']} post failures in 24h — last: {act.get('last_failure') or 'n/a'}"))
        if act.get("runner_failures_24h"):
            checks.append(("warn", f"{act['runner_failures_24h']} Runners posts failed in 24h — last: {act.get('last_runner_error') or 'n/a'}"))
    if k == "terminal":
        if act.get("alerts_unsent_6h", 0) >= 5:
            checks.append(("warn", f"{act['alerts_unsent_6h']} personal alerts from the last 6h are still unsent"))
        if journal.get("available") and journal.get("failed_24h"):
            why = ", ".join(f"{n}× {r}" for r, n in sorted(journal["fail_reasons"].items(), key=lambda x: -x[1]))
            hrs = round(journal.get("window_s", 86400) / 3600, 1)
            checks.append(("warn", f"{journal['failed_24h']} delivery failures in the last {hrs}h across {journal['failing_users']} accounts ({why})"))
    if k == "ai":
        age = _since(datetime.fromisoformat(act["last_channel_post"])) if act.get("last_channel_post") else None
        if age is None or age > 12 * 3600:
            checks.append(("warn", "No free-channel post in the last 12h"))

    row["checks"] = [{"level": lvl, "text": t} for lvl, t in checks]
    row["status"] = min((lvl for lvl, _ in checks if lvl != "info"), key=lambda s: SEVERITY[s], default="ok")
    return row


def _sync_part() -> dict[str, Any]:
    units = {u: _unit(u) for b in BOTS for u in b["services"]}
    sessions = []
    for s in SESSIONS:
        d = _unit(s["unit"])
        age = _last_log_age(s["unit"])
        status = "ok"
        note = None
        if d.get("health") == "down":
            status, note = "down", f"{d.get('active_state')}/{d.get('sub_state')}"
        elif age is None or age > s["quiet_h"] * 3600:
            status, note = "warn", ("no log output at all" if age is None else
                                    f"silent for {round(age / 3600, 1)}h — active is not the same as alive")
        elif d.get("health") == "warn":
            status, note = "warn", d.get("sub_state")
        sessions.append({**s, "service": d, "last_log_age_s": round(age) if age is not None else None,
                         "status": status, "note": note})
    db = SessionLocal()
    try:
        act = _activity(db)
    finally:
        db.close()
    uptime = (units.get("luxquant-tg-delivery.service") or {}).get("uptime_seconds")
    return {"units": units, "sessions": sessions, "activity": act, "journal": _delivery_journal(uptime)}


async def collect(force: bool = False) -> dict[str, Any]:
    cached = cache_get(CACHE_KEY)
    if cached and (not force or time.time() - cached.get("checked_at", 0) < REFRESH_FLOOR):
        return cached

    tokens = {b["key"]: _token(b["env"], b["file"]) for b in BOTS}
    proxy = os.getenv("TELEGRAM_PROXY") or None
    async with httpx.AsyncClient(timeout=12.0, proxy=proxy) as client:
        async def one(b):
            t = tokens[b["key"]]
            return {"_no_token": True} if not t else await _probe(client, t)
        probes, sync = await asyncio.gather(
            asyncio.gather(*(one(b) for b in BOTS)), asyncio.to_thread(_sync_part))

    bots = [_judge(b, p, [sync["units"][u] for u in b["services"]], sync["activity"].get(b["key"], {}),
                   sync["journal"])
            for b, p in zip(BOTS, probes)]
    for b in bots:
        if b["key"] in ("terminal", "alert"):
            b["delivery"] = sync["journal"]
    everything = [b["status"] for b in bots] + [s["status"] for s in sync["sessions"]]
    result = {
        "checked_at": time.time(),
        "cache_ttl_s": CACHE_TTL,
        "bots": bots,
        "sessions": sync["sessions"],
        "counts": {s: everything.count(s) for s in ("ok", "warn", "down")},
    }
    cache_set(CACHE_KEY, result, ttl=CACHE_TTL)
    return result
