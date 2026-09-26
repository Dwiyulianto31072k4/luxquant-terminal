"""Browser crash reports.

The React error boundary only ever wrote to the visitor's own console, so the
server learned about a crash when somebody sent a screenshot — which is how
the coin-modal crash of September 2026 was found. The browser now posts a
short report here.

  • POST /api/v1/client-errors          anyone; per-IP rate limit, fails open
  • GET  /api/v1/admin/client-errors    admins; the last reports, grouped

Reports live in Redis (newest 1,000, two weeks) — this is a tripwire, not an
archive. Each one is logged. The first time a new kind of full-screen crash
(`kind="boundary"`) shows up, the admins get a Telegram DM; at most a few an
hour, and the same crash does not alert again for a week. Stray window errors
and unhandled rejections are kept and logged but never page anyone: extensions
and old browsers produce a steady trickle of those that no user ever saw.
"""
from __future__ import annotations

import hashlib
import html
import json
import logging
import os
import re
import secrets
import time
import urllib.request
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Literal, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.api.deps import get_admin_user
from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.core.security import decode_token
from app.services.geo_helpers import client_ip_from_request

logger = logging.getLogger(__name__)

router = APIRouter(tags=["client-errors"])

LIST_KEY = "lq:client-errors"
KEEP = 1000
TTL_S = 14 * 24 * 3600
PER_IP_PER_MIN = 20
ALERT_REPEAT_S = 7 * 24 * 3600
ALERTS_PER_HOUR = 3


class ClientErrorReport(BaseModel):
    kind: Literal["boundary", "error", "rejection"] = "error"
    message: str = Field("", max_length=1000)
    stack: Optional[str] = Field(None, max_length=8000)
    component_stack: Optional[str] = Field(None, max_length=8000)
    url: Optional[str] = Field(None, max_length=1000)
    build: Optional[str] = Field(None, max_length=64)


# Vite names chunks `Name-<8 char hash>.js`; the hash changes every deploy,
# the line:col with every edit. Neither makes it a different crash.
_CHUNK_HASH = re.compile(r"-[A-Za-z0-9_-]{8}(\.m?js)")
_LINE_COL = re.compile(r":\d+(?::\d+)?")
_ORIGIN = re.compile(r"https?://[^/\s)]+")


def _frames(stack: Optional[str], n: int = 3) -> list[str]:
    lines = [ln.strip() for ln in (stack or "").splitlines() if ln.strip()]
    # V8 puts the message on line 1; Firefox and Safari start with a frame.
    frames = [ln for ln in lines if ln.startswith("at ") or "@" in ln]
    return frames[:n]


def fingerprint(kind: str, message: str, stack: Optional[str]) -> str:
    """Same crash, same print — across deploys, origins and line shifts."""
    parts = [kind, (message or "")[:200]]
    for frame in _frames(stack):
        frame = _ORIGIN.sub("", frame)
        frame = _CHUNK_HASH.sub(r"\1", frame)
        parts.append(_LINE_COL.sub("", frame))
    return hashlib.sha1("\n".join(parts).encode("utf-8", "replace")).hexdigest()[:16]


def _user_id(request: Request) -> Optional[int]:
    """Who crashed, from the bearer token alone — no database round trip."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    payload = decode_token(auth[7:].strip())
    if not payload or payload.get("type") != "access" or payload.get("scope"):
        return None
    try:
        return int(payload.get("sub"))
    except (TypeError, ValueError):
        return None


def _rate_ok(r, ip: str) -> bool:
    key = f"rl:client-errors:{ip or 'unknown'}"
    now_ms = int(time.time() * 1000)
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now_ms - 60_000)
    pipe.zcard(key)
    _, used = pipe.execute()
    if used >= PER_IP_PER_MIN:
        return False
    pipe = r.pipeline()
    pipe.zadd(key, {f"{now_ms}-{secrets.token_hex(4)}": now_ms})
    pipe.expire(key, 60)
    pipe.execute()
    return True


def _should_alert(r, fp: str) -> bool:
    if not r.set(f"lq:client-errors:alerted:{fp}", "1", nx=True, ex=ALERT_REPEAT_S):
        return False
    hour_key = f"lq:client-errors:alerts:{int(time.time() // 3600)}"
    sent = r.incr(hour_key)
    r.expire(hour_key, 3600)
    return sent <= ALERTS_PER_HOUR


def _page(url: Optional[str]) -> str:
    """Path and query of the page, never the origin a report claims."""
    if not url:
        return "unknown page"
    try:
        parts = urlsplit(url)
        page = parts.path + (f"?{parts.query}" if parts.query else "")
    except ValueError:
        page = url
    return (page or "/")[:200]


def _admin_chats() -> list[str]:
    db = SessionLocal()
    try:
        rows = db.execute(text(
            "SELECT DISTINCT telegram_id FROM users "
            "WHERE role = 'admin' AND is_active = true AND telegram_id IS NOT NULL"
        )).fetchall()
        return [str(row[0]) for row in rows if row[0]]
    finally:
        db.close()


def _alert_admins(report: dict) -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return
    try:
        chats = _admin_chats()
    except Exception as e:
        logger.warning("client-error alert: admin lookup failed: %s", e)
        return
    # Everything in the report came from a browser, so it goes in <code>:
    # no link in an admin's DM should be one a stranger chose.
    where = _page(report.get("url"))
    who = f"user {report['user_id']}" if report.get("user_id") else "signed-out visitor"
    frame = (_frames(report.get("stack"), 1) or [""])[0]
    lines = [
        "<b>New crash on the site</b>",
        f"<code>{html.escape(report['message'][:300] or '(no message)')}</code>",
        f"Page: <code>{html.escape(where)}</code>",
        f"Seen by: {who} · build <code>{html.escape(report.get('build') or '?')}</code>",
    ]
    if frame:
        lines.append(f"<code>{html.escape(frame[:200])}</code>")
    lines.append(f"Fingerprint {report['fp']} · won't alert again for 7 days")
    body = "\n".join(lines)
    for chat in chats:
        try:
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{token}/sendMessage",
                data=json.dumps({
                    "chat_id": chat,
                    "text": body,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                }).encode(),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=10)  # noqa: S310 (fixed host)
        except Exception as e:
            logger.warning("client-error alert to %s failed: %s", chat, e)


@router.post("/api/v1/client-errors", status_code=status.HTTP_204_NO_CONTENT)
def report_client_error(
    body: ClientErrorReport,
    request: Request,
    background: BackgroundTasks,
):
    ip = client_ip_from_request(request) or ""
    try:
        r = get_redis()
        if not _rate_ok(r, ip):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many reports")
    except HTTPException:
        raise
    except Exception as e:
        # A Redis outage must not turn crash reports into a second error.
        logger.warning("client-error intake: redis unavailable: %s", e)
        r = None

    fp = fingerprint(body.kind, body.message, body.stack)
    report = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fp": fp,
        "kind": body.kind,
        "message": body.message,
        "stack": body.stack,
        "component_stack": body.component_stack,
        "url": body.url,
        "build": body.build,
        "user_id": _user_id(request),
        "ua": (request.headers.get("user-agent") or "")[:300],
        "country": request.headers.get("cf-ipcountry"),
    }
    logger.warning(
        "client-error kind=%s fp=%s user=%s url=%s msg=%s",
        body.kind, fp, report["user_id"], (body.url or "")[:200], body.message[:200],
    )
    if r is not None:
        try:
            pipe = r.pipeline()
            pipe.lpush(LIST_KEY, json.dumps(report))
            pipe.ltrim(LIST_KEY, 0, KEEP - 1)
            pipe.expire(LIST_KEY, TTL_S)
            pipe.execute()
            if body.kind == "boundary" and _should_alert(r, fp):
                background.add_task(_alert_admins, report)
        except Exception as e:
            logger.warning("client-error store failed: %s", e)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/v1/admin/client-errors")
def list_client_errors(
    limit: int = 50,
    _admin=Depends(get_admin_user),
):
    """The stored reports grouped by fingerprint, most recent first."""
    try:
        raw = get_redis().lrange(LIST_KEY, 0, KEEP - 1)
    except Exception as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Redis unavailable: {e}")
    groups: "OrderedDict[str, dict]" = OrderedDict()
    for item in raw:
        try:
            rep = json.loads(item)
        except Exception:
            continue
        g = groups.get(rep.get("fp"))
        if g is None:
            groups[rep.get("fp")] = g = {
                "fp": rep.get("fp"),
                "kind": rep.get("kind"),
                "message": rep.get("message"),
                "last_seen": rep.get("ts"),
                "first_seen": rep.get("ts"),
                "count": 0,
                "users": set(),
                "urls": set(),
                "sample": rep,
            }
        g["count"] += 1
        g["first_seen"] = rep.get("ts")  # the list is newest first
        if rep.get("user_id"):
            g["users"].add(rep["user_id"])
        if rep.get("url"):
            g["urls"].add(rep["url"][:200])
    out = []
    for g in list(groups.values())[: max(1, min(limit, 200))]:
        g["users"] = len(g["users"])
        g["urls"] = sorted(g["urls"])[:5]
        out.append(g)
    return {"total_reports": len(raw), "groups": out}


# ════════════════════════════════════════════════════════════════════
# Content-Security-Policy violation reports (audit #10, 2026-09-26)
# ════════════════════════════════════════════════════════════════════
# The site shipped no CSP at all. One written blind would break things
# nobody listed — three.js from cdnjs on the landing globe, the TradingView
# widget, two inline scripts in index.html — so it goes out as
# Content-Security-Policy-Report-Only first and browsers report here what an
# enforced policy WOULD block. Once this stays quiet, the same policy is
# switched to enforcing.
#
# Reports are counted, not stored whole: `lq:csp:counts` maps
# "<directive> <blocked origin>" to hits, and the newest 200 raw reports are
# kept for context. Both live 14 days.
CSP_COUNTS_KEY = "lq:csp:counts"
CSP_SAMPLES_KEY = "lq:csp:samples"
CSP_PER_IP_PER_MIN = 60


def _csp_items(payload) -> list[dict]:
    """Both report formats: report-uri's {"csp-report": {...}} and the
    Reporting API's [{"type": "csp-violation", "body": {...}}]."""
    if isinstance(payload, dict) and isinstance(payload.get("csp-report"), dict):
        r = payload["csp-report"]
        return [{
            "directive": r.get("effective-directive") or r.get("violated-directive") or "",
            "blocked": r.get("blocked-uri") or "",
            "page": r.get("document-uri") or "",
            "source": r.get("source-file") or "",
            "sample": r.get("script-sample") or "",
        }]
    items = []
    for rep in payload if isinstance(payload, list) else []:
        body = rep.get("body") if isinstance(rep, dict) else None
        if not isinstance(body, dict) or rep.get("type") not in (None, "csp-violation"):
            continue
        items.append({
            "directive": body.get("effectiveDirective") or body.get("violatedDirective") or "",
            "blocked": body.get("blockedURL") or body.get("blockedURI") or "",
            "page": body.get("documentURL") or "",
            "source": body.get("sourceFile") or "",
            "sample": body.get("sample") or "",
        })
    return items


def csp_bucket(item: dict) -> str:
    """'<directive> <what was blocked>' with URLs cut to their origin."""
    blocked = str(item.get("blocked") or "")
    if blocked.startswith(("http://", "https://", "wss://", "ws://")):
        parts = urlsplit(blocked)
        blocked = f"{parts.scheme}://{parts.netloc}"
    return f"{str(item.get('directive') or '?')[:40]} {blocked[:120] or '?'}"


def _store_csp(items: list[dict], ip: str) -> None:
    r = get_redis()
    if not _rate_ok_named(r, "csp", ip, CSP_PER_IP_PER_MIN):
        return
    pipe = r.pipeline()
    for it in items[:20]:
        pipe.hincrby(CSP_COUNTS_KEY, csp_bucket(it), 1)
        pipe.lpush(CSP_SAMPLES_KEY, json.dumps({
            "ts": int(time.time()),
            "directive": str(it.get("directive"))[:60],
            "blocked": str(it.get("blocked"))[:300],
            "page": _page(it.get("page")),
            "source": str(it.get("source"))[:300],
            "sample": str(it.get("sample"))[:120],
        }))
    pipe.ltrim(CSP_SAMPLES_KEY, 0, 199)
    pipe.expire(CSP_COUNTS_KEY, TTL_S)
    pipe.expire(CSP_SAMPLES_KEY, TTL_S)
    pipe.execute()


def _rate_ok_named(r, name: str, ip: str, per_min: int) -> bool:
    key = f"rl:{name}:{ip or 'unknown'}"
    now_ms = int(time.time() * 1000)
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, now_ms - 60_000)
    pipe.zcard(key)
    _, used = pipe.execute()
    if used >= per_min:
        return False
    pipe = r.pipeline()
    pipe.zadd(key, {f"{now_ms}-{secrets.token_hex(4)}": now_ms})
    pipe.expire(key, 60)
    pipe.execute()
    return True


@router.post("/api/v1/csp-report", status_code=status.HTTP_204_NO_CONTENT)
async def report_csp_violation(request: Request):
    """Browsers post CSP violations here (report-uri and report-to)."""
    from fastapi.concurrency import run_in_threadpool

    raw = await request.body()
    if len(raw) > 64_000:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        items = _csp_items(json.loads(raw or b"null"))
    except ValueError:
        items = []
    if items:
        try:
            await run_in_threadpool(_store_csp, items, client_ip_from_request(request) or "")
        except Exception as e:
            logger.warning("csp-report store failed: %s", e)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/v1/admin/csp-report")
def list_csp_violations(_admin=Depends(get_admin_user)):
    """What an enforced policy would have blocked, most frequent first."""
    try:
        r = get_redis()
        counts = r.hgetall(CSP_COUNTS_KEY) or {}
        samples = [json.loads(x) for x in r.lrange(CSP_SAMPLES_KEY, 0, 49)]
    except Exception as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Redis unavailable: {e}")
    ranked = sorted(((k, int(v)) for k, v in counts.items()), key=lambda kv: -kv[1])
    return {"buckets": [{"bucket": k, "count": v} for k, v in ranked], "recent": samples}
