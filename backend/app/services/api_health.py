"""External API inventory — key status, balance, and quota in one place.

Every third-party provider LuxQuant depends on is declared here once, with the
probe that answers "is this key alive, and how much is left?".  Providers differ
in what they will tell us, so each one is tagged with the best signal available:

  ``balance``  the provider returns real money left (DeepSeek).
  ``quota``    the provider returns usage against a cap (Apify, BGeometrics,
               Tavily, Discord) — usually in rate-limit headers.
  ``validity`` the provider has no billing endpoint at all, so the only honest
               signal is whether the key is still accepted.
  ``usage``    the provider tells us nothing, so we read our own meter instead
               (X / Twitter, via the x_api_usage table).

Keys live in eight different env files across 29 systemd units, not just
backend/.env — see ``_EXTRA_ENV_FILES``.

Not covered: the Binance keys in /root/cryptobot/.env. Validating them requires
a signed account read, which is a trading-account balance lookup; a read-only
health dashboard should not be performing one.

Nothing here ever returns a key value.  Callers get ``configured`` plus a
masked tail so the admin can tell two keys apart without the secret leaking
into a browser, a log line, or a screenshot.

Results are cached in Redis because this is a dashboard, not a monitor: an
admin refreshing the page must never be able to spend a provider's quota.  See
``_MIN_INTERVAL`` for the floor that even a forced refresh respects.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Awaitable

import httpx

from app.core.redis import get_redis

# A browser UA: several providers sit behind Cloudflare, which answers the
# default urllib/httpx agent with an "error code: 1010" block page that looks
# exactly like an auth failure.
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

_CACHE_PREFIX = "lq:apihealth:"
_DEFAULT_TTL = 900          # 15 min — normal dashboard freshness
_MIN_INTERVAL = 60          # a forced refresh still cannot probe faster than this

_TIMEOUT = 12.0

OK = "ok"
WARN = "warn"
DOWN = "down"
UNCONFIGURED = "unconfigured"
ERROR = "error"


@dataclass
class ProbeResult:
    status: str = ERROR
    detail: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)
    latency_ms: int | None = None


@dataclass
class Provider:
    id: str
    label: str
    signal: str            # balance | quota | validity | usage | reachability
    powers: str            # which LuxQuant feature dies if this key dies
    env_keys: tuple[str, ...]
    probe: Callable[[httpx.AsyncClient, dict[str, str]], Awaitable[ProbeResult]]
    docs: str = ""
    # Per-provider freshness. bitcoin-data.com allows only 15 requests a DAY, so
    # probing it on the normal cadence would consume the very budget the row is
    # meant to protect. Anything with a tight allowance gets a long interval.
    min_interval: int = 0  # 0 = use the global default


# Most providers are owned by a sibling service, not the backend: systemd feeds
# this process only backend/.env, so keys like ANTHROPIC_API_KEY (X poster) or
# ALERT_BOT_TOKEN (delivery worker) are absent from our environment even though
# they are live.  Reading those files keeps the inventory honest instead of
# reporting a working key as "not set".  Values are used for probing only and
# never returned.
#
# Deliberately NOT read: /root/cryptobot/.env.  Its Binance keys can only be
# validated with a signed account read, which this dashboard has no business
# performing — see the note on the Binance gap in the module docs.
_EXTRA_ENV_FILES = (
    "/root/luxquant-terminal/backend/.env.social-posts",   # xAI, Tavily, image gen
    "/root/luxquant-x-poster/.env",                        # Anthropic, X, TG poster bot
    "/root/.luxquant_alertbot_env",                        # alert delivery bot
)

_extra_env: dict[str, str] | None = None


def _load_extra_env() -> dict[str, str]:
    global _extra_env
    if _extra_env is not None:
        return _extra_env
    found: dict[str, str] = {}
    for path in _EXTRA_ENV_FILES:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    found.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue
    _extra_env = found
    return found


def _env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if value:
        return value
    return _load_extra_env().get(name, "").strip()


def _mask(value: str) -> str:
    """Enough to tell two keys apart, never enough to use one."""
    if not value:
        return ""
    return f"…{value[-4:]}" if len(value) > 8 else "…"


def _quota_headers(headers: Any) -> dict[str, str]:
    wanted = ("ratelimit", "quota", "remaining")
    return {
        k.lower(): v
        for k, v in dict(headers).items()
        if any(w in k.lower() for w in wanted)
    }


# ─── Probes ───────────────────────────────────────────────────────────
# Each probe picks the cheapest endpoint that still proves the key works, and
# returns DOWN only when the provider actually rejected us — a network blip is
# ERROR, so a flaky link never reads as "your key is dead".


async def _probe_deepseek(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.deepseek.com/user/balance",
        headers={"Authorization": f"Bearer {k['DEEPSEEK_API_KEY']}"},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    r.raise_for_status()
    data = r.json()
    infos = data.get("balance_infos") or [{}]
    total = float(infos[0].get("total_balance") or 0)
    available = bool(data.get("is_available"))
    metrics = {
        "balance_usd": round(total, 4),
        "currency": infos[0].get("currency", "USD"),
        "is_available": available,
    }
    if not available or total <= 0:
        return ProbeResult(DOWN, "out of credit — calls will 402", metrics)
    if total < 2:
        return ProbeResult(WARN, f"low balance ${total:.2f}", metrics)
    return ProbeResult(OK, f"${total:.2f} available", metrics)


async def _probe_apify(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.apify.com/v2/users/me/limits",
        headers={"Authorization": f"Bearer {k['APIFY_TOKEN']}"},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"token rejected (HTTP {r.status_code})")
    r.raise_for_status()
    d = r.json().get("data", {})
    used = float((d.get("current") or {}).get("monthlyUsageUsd") or 0)
    cap = float((d.get("limits") or {}).get("maxMonthlyUsageUsd") or 0)
    pct = (used / cap * 100) if cap else 0.0
    metrics = {
        "used_usd": round(used, 4),
        "limit_usd": cap,
        "used_pct": round(pct, 1),
        "cycle_ends": ((d.get("monthlyUsageCycle") or {}).get("endAt") or "")[:10],
    }
    detail = f"${used:.4f} of ${cap:.0f} this cycle"
    if pct >= 90:
        return ProbeResult(DOWN, f"monthly cap nearly gone — {detail}", metrics)
    if pct >= 70:
        return ProbeResult(WARN, detail, metrics)
    return ProbeResult(OK, detail, metrics)


async def _probe_bgeometrics(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """Auth is a ``token`` query param on api.bgeometrics.com — matching
    bg_advanced.py.  The hourly allowance only appears in the headers, so this
    probe is the one place the remaining quota is observable at all."""
    r = await client.get(
        "https://api.bgeometrics.com/v1/hashrate/last",
        params={"token": k["BGEOMETRICS_API_KEY"]},
    )
    h = _quota_headers(r.headers)
    limit = h.get("x-ratelimit-limit-hour")
    remaining = h.get("x-ratelimit-remaining-hour")
    day_limit = h.get("x-ratelimit-limit-day")
    day_left = h.get("x-ratelimit-remaining-day")
    metrics = {
        "limit_hour": limit, "remaining_hour": remaining,
        "limit_day": day_limit, "remaining_day": day_left,
    }
    if r.status_code == 429:
        # Two ceilings, and the daily one is invisible unless you read for it.
        # Naming the wrong window sends the reader off to wait an hour for
        # something that will not clear until tomorrow.
        window = "daily" if str(day_left).strip() == "0" else "hourly"
        cap = day_limit if window == "daily" else limit
        return ProbeResult(
            DOWN,
            f"{window} quota exhausted (0 of {cap or '?'}) — BTC Compass pipeline is failing",
            metrics,
        )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})", metrics)
    r.raise_for_status()
    try:
        left = int(remaining) if remaining is not None else None
        cap = int(limit) if limit is not None else None
    except (TypeError, ValueError):
        left = cap = None
    detail = f"{remaining or '?'}/{limit or '?'} per hr · {day_left or '?'}/{day_limit or '?'} per day"
    try:
        d_left, d_cap = int(day_left), int(day_limit)
    except (TypeError, ValueError):
        d_left = d_cap = None
    if (left is not None and cap and left < cap * 0.2) or \
       (d_left is not None and d_cap and d_left < d_cap * 0.2):
        return ProbeResult(WARN, detail, metrics)
    return ProbeResult(OK, detail, metrics)


async def _probe_discord(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://discord.com/api/v10/users/@me",
        headers={"Authorization": f"Bot {k['DISCORD_BOT_TOKEN']}"},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"bot token rejected (HTTP {r.status_code})")
    r.raise_for_status()
    h = _quota_headers(r.headers)
    body = r.json()
    metrics = {
        "bot_username": body.get("username"),
        "limit": h.get("x-ratelimit-limit"),
        "remaining": h.get("x-ratelimit-remaining"),
    }
    return ProbeResult(OK, f"bot @{body.get('username')} authenticated", metrics)


async def _probe_openai(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """Probe what the work needs, not just what the key is.

    This used to check `GET /v1/models` alone. That endpoint answers **200 with
    all 126 models on an account whose credit balance is zero** — so through the
    whole four-day August 2026 outage this dashboard read "OK — key valid" while
    every completion in the product returned 429 credit_balance_exhausted. The
    reports stopped, Ask AI's cache stopped, and the one screen built to notice
    showed green.

    So the probe now spends one token. A billing wall is invisible to any
    endpoint that does not bill, and a health check that cannot fail the way
    production fails is decoration.
    """
    headers = {"Authorization": f"Bearer {k['OPENAI_API_KEY']}"}

    r = await client.get("https://api.openai.com/v1/models", headers=headers)
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code != 429:
        r.raise_for_status()
    n = len(r.json().get("data", [])) if r.status_code == 200 else 0

    # The real question: can this key still buy a completion? One token, so the
    # check costs about two ten-millionths of a dollar.
    c = await client.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "."}],
            "max_tokens": 1,
        },
    )
    if c.status_code == 200:
        return ProbeResult(OK, f"key valid, billing live — {n} models", {"models": n})

    code = ""
    try:
        code = ((c.json() or {}).get("error") or {}).get("code") or ""
    except ValueError:
        pass

    # Out of credit is not a transient rate limit. It stays broken until a human
    # pays, so it must read DOWN and not WARN.
    if code in ("credit_balance_exhausted", "insufficient_quota"):
        return ProbeResult(DOWN, "OUT OF CREDIT — completions refused, top up billing",
                           {"models": n, "error_code": code})
    if c.status_code == 429:
        return ProbeResult(WARN, "rate limited", {"models": n})
    if c.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected on completion (HTTP {c.status_code})")
    return ProbeResult(WARN, f"completions unhealthy (HTTP {c.status_code})", {"models": n})


async def _probe_anthropic(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.anthropic.com/v1/models",
        headers={
            "x-api-key": k["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        },
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code == 429:
        return ProbeResult(WARN, "rate limited")
    r.raise_for_status()
    n = len(r.json().get("data", []))
    return ProbeResult(OK, f"key valid — {n} models", {"models": n})


def _mk_telegram_bot(env_key: str):
    """LuxQuant runs three separate Telegram bots on three separate tokens.

    getMe is the only identity check Telegram offers; it also proves which bot a
    token actually belongs to, which is how the three were told apart.
    """
    async def _run(c: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
        r = await c.get(f"https://api.telegram.org/bot{k[env_key]}/getMe")
        if r.status_code in (401, 404):
            return ProbeResult(DOWN, "bot token rejected")
        r.raise_for_status()
        res = r.json().get("result", {})
        return ProbeResult(
            OK, f"bot @{res.get('username')} authenticated",
            {"bot_username": res.get("username")},
        )
    return _run


def _x_usage_rows() -> tuple[int, int, float]:
    """Last 24h of X API calls from our own meter. Sync — call via to_thread."""
    from sqlalchemy import text as _sql
    from app.core.database import SessionLocal

    with SessionLocal() as db:
        row = db.execute(_sql("""
            SELECT COALESCE(SUM(CASE WHEN ok THEN 1 ELSE 0 END), 0) AS ok_n,
                   COALESCE(SUM(CASE WHEN ok THEN 0 ELSE 1 END), 0) AS bad_n,
                   COALESCE(SUM(cost_usd), 0)                       AS usd
            FROM x_api_usage
            WHERE ts > now() - interval '24 hours'
        """)).one()
    return int(row[0]), int(row[1]), float(row[2])


async def _probe_x(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """X is measured from our own meter, not by calling X.

    Validating the OAuth 1.0a credentials would mean signing a request, which a
    read-only dashboard has no business doing. The x_api_usage table the poster
    already writes is a better signal anyway: it shows whether posting actually
    works right now, and what it cost — neither of which a key check reveals.
    """
    try:
        ok_n, bad_n, usd = await asyncio.to_thread(_x_usage_rows)
    except Exception as e:
        return ProbeResult(ERROR, f"usage table unreadable: {type(e).__name__}"[:120])

    total = ok_n + bad_n
    metrics = {"calls_24h": total, "ok_24h": ok_n, "failed_24h": bad_n,
               "cost_usd_24h": round(usd, 4)}
    if total == 0:
        return ProbeResult(WARN, "no X API calls logged in 24h", metrics)
    fail_pct = bad_n / total * 100
    detail = f"{ok_n} ok / {bad_n} failed in 24h · ${usd:.2f}"
    if fail_pct >= 50:
        return ProbeResult(DOWN, f"most calls failing — {detail}", metrics)
    if fail_pct >= 15:
        return ProbeResult(WARN, detail, metrics)
    return ProbeResult(OK, detail, metrics)


async def _probe_xai(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.x.ai/v1/models",
        headers={"Authorization": f"Bearer {k['XAI_API_KEY']}"},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code == 429:
        return ProbeResult(WARN, "rate limited or out of credit")
    r.raise_for_status()
    n = len(r.json().get("data", []))
    return ProbeResult(OK, f"key valid — {n} models", {"models": n})


async def _probe_tavily(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """/usage reports plan consumption without spending a search credit."""
    r = await client.get(
        "https://api.tavily.com/usage",
        headers={"Authorization": f"Bearer {k['TAVILY_API_KEY']}"},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    r.raise_for_status()
    acct = r.json().get("account", {}) or {}
    used = acct.get("plan_usage")
    cap = acct.get("plan_limit")
    metrics = {"plan": acct.get("current_plan"), "used": used, "limit": cap}
    if isinstance(used, int) and isinstance(cap, int) and cap:
        pct = used / cap * 100
        metrics["used_pct"] = round(pct, 1)
        detail = f"{used} of {cap} credits ({acct.get('current_plan')})"
        if pct >= 90:
            return ProbeResult(DOWN, f"plan nearly exhausted — {detail}", metrics)
        if pct >= 70:
            return ProbeResult(WARN, detail, metrics)
        return ProbeResult(OK, detail, metrics)
    return ProbeResult(OK, f"key valid ({acct.get('current_plan') or 'unknown plan'})", metrics)


async def _probe_etherscan(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """V2 multichain, chainid=1 — the shape whale_service.py actually calls."""
    r = await client.get(
        "https://api.etherscan.io/v2/api",
        params={
            "chainid": 1, "module": "stats", "action": "ethsupply",
            "apikey": k["ETHERSCAN_API_KEY"],
        },
    )
    r.raise_for_status()
    body = r.json()
    if str(body.get("status")) == "1":
        return ProbeResult(OK, "key valid (V2 chainid=1)")
    msg = str(body.get("result") or body.get("message") or "")[:120]
    if "invalid" in msg.lower() or "rate limit" in msg.lower():
        return ProbeResult(DOWN, msg)
    return ProbeResult(WARN, msg)


async def _probe_bscscan(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.etherscan.io/v2/api",
        params={
            "chainid": 56, "module": "stats", "action": "bnbsupply",
            "apikey": k["BSCSCAN_API_KEY"],
        },
    )
    r.raise_for_status()
    body = r.json()
    if str(body.get("status")) == "1":
        return ProbeResult(OK, "key valid (V2 chainid=56)")
    msg = str(body.get("result") or body.get("message") or "")[:140]
    # A free key simply does not cover BSC on V2; that is a plan ceiling, not a
    # dead key, so it must not read as an outage.
    if "upgrade" in msg.lower() or "not supported" in msg.lower():
        return ProbeResult(WARN, f"plan does not cover BSC on V2 — {msg}")
    return ProbeResult(WARN, msg)


def _mk_coingecko(env_key: str):
    """Both CoinGecko rows share one probe shape but read different env keys.

    The account is on the Demo tier, whose ``/key`` credit endpoint is PRO-only,
    so ``/ping`` is the most the provider will confirm.
    """
    async def _run(c: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
        r = await c.get(
            "https://api.coingecko.com/api/v3/ping",
            headers={"x-cg-demo-api-key": k[env_key]},
        )
        if r.status_code in (401, 403):
            return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
        if r.status_code == 429:
            return ProbeResult(WARN, "rate limited (Demo tier)")
        r.raise_for_status()
        return ProbeResult(OK, "key valid (Demo tier — no credit endpoint)")
    return _run


async def _probe_coinalyze(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.coinalyze.net/v1/exchanges",
        headers={"api_key": k["COINALYZE_API_KEY"]},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code == 429:
        return ProbeResult(WARN, "rate limited")
    r.raise_for_status()
    return ProbeResult(OK, f"key valid — {len(r.json())} exchanges")


async def _probe_coinglass(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """Coinglass answers HTTP 200 with an error *code in the body*, so the
    status line alone would wrongly report a healthy key."""
    r = await client.get(
        "https://open-api-v4.coinglass.com/api/futures/supported-coins",
        headers={"CG-API-KEY": k["COINGLASS_API_KEY"]},
    )
    r.raise_for_status()
    body = r.json()
    code = str(body.get("code", "0"))
    if code in ("0", "200"):
        return ProbeResult(OK, "key valid")
    msg = str(body.get("msg") or "")[:120]
    if "upgrade" in msg.lower():
        return ProbeResult(WARN, f"plan ceiling — {msg}")
    return ProbeResult(DOWN, msg or f"code {code}")


async def _probe_sosovalue(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    """The open API is POST-only; a GET returns 405 before auth is even read."""
    r = await client.post(
        "https://api.sosovalue.xyz/openapi/v1/data/default/coin/list",
        headers={"x-soso-api-key": k["SOSOVALUE_API_KEY"], "Content-Type": "application/json"},
        json={},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code == 429:
        return ProbeResult(WARN, "rate limited")
    if r.status_code >= 500:
        return ProbeResult(ERROR, f"provider error HTTP {r.status_code}")
    return ProbeResult(OK, f"key accepted (HTTP {r.status_code})")


async def _probe_dune(client: httpx.AsyncClient, k: dict[str, str]) -> ProbeResult:
    r = await client.get(
        "https://api.dune.com/api/v1/query/1/results",
        headers={"X-Dune-Api-Key": k["DUNEAPIKEY_TERMINAL"]},
    )
    if r.status_code in (401, 403):
        return ProbeResult(DOWN, f"key rejected (HTTP {r.status_code})")
    if r.status_code == 429:
        return ProbeResult(WARN, "credits exhausted or rate limited")
    # 404 / 400 mean the probe query is not ours but the key itself passed auth.
    return ProbeResult(OK, f"key accepted (HTTP {r.status_code})")


def _mk_reachable(url: str, expect: str = "", parse: Callable[[str], str] | None = None):
    """Liveness probe for a dependency that has no key to validate.

    These hosts are unauthenticated, so "is the key accepted" is meaningless —
    the only question worth asking is whether the host is still answering and
    how slowly. Each URL is the cheapest public endpoint that proves the service
    is really serving data rather than just terminating TLS.
    """
    async def _run(c: httpx.AsyncClient, _k: dict[str, str]) -> ProbeResult:
        r = await c.get(url)
        if r.status_code == 429:
            return ProbeResult(WARN, "rate limited")
        if r.status_code >= 500:
            return ProbeResult(DOWN, f"provider error HTTP {r.status_code}")
        if r.status_code >= 400:
            return ProbeResult(DOWN, f"HTTP {r.status_code}")
        body = r.text or ""
        if expect and expect not in body[:400]:
            return ProbeResult(WARN, f"reachable but unexpected body ({len(body)}B)")
        detail = "reachable"
        if parse:
            try:
                detail = parse(body) or detail
            except Exception:
                pass
        return ProbeResult(OK, detail, {"bytes": len(body)})
    return _run


def _first_line(body: str) -> str:
    return f"tip {body.strip().splitlines()[0][:24]}"


PROVIDERS: list[Provider] = [
    Provider("deepseek", "DeepSeek", "balance",
             "BTC Compass verdict (R1) + AI Assistant + Shariah screening",
             ("DEEPSEEK_API_KEY",), _probe_deepseek,
             "https://platform.deepseek.com/usage"),
    Provider("apify", "Apify", "quota",
             "CoinAnk scraping", ("APIFY_TOKEN",), _probe_apify,
             "https://console.apify.com/billing"),
    Provider("bgeometrics", "BGeometrics", "quota",
             "BTC Compass 2.0 / AI Research — all 23 metrics", ("BGEOMETRICS_API_KEY",),
             _probe_bgeometrics, "https://bgeometrics.com"),
    # DISCORD_TOKEN (cryptobot, relay) and DISCORD_BOT_TOKEN (backend) resolve to
    # the same bot id, so this is one provider, not three.
    Provider("discord", "Discord", "quota",
             "Discord relay + Premium+ entitlement", ("DISCORD_BOT_TOKEN",), _probe_discord),
    Provider("openai", "OpenAI", "validity",
             "Embeddings (semantic cache), image generation", ("OPENAI_API_KEY",),
             _probe_openai, "https://platform.openai.com/usage"),
    Provider("anthropic", "Anthropic", "validity",
             "X poster copy (luxquant-x-poster)", ("ANTHROPIC_API_KEY",), _probe_anthropic,
             "https://console.anthropic.com/settings/billing"),
    Provider("x_twitter", "X / Twitter", "usage",
             "Signal tweets + Gainers/Proof bundles", ("X_API_KEY",), _probe_x,
             "https://developer.x.com/en/portal/dashboard"),
    Provider("xai", "xAI (Grok)", "validity",
             "Social post editorial copy", ("XAI_API_KEY",), _probe_xai,
             "https://console.x.ai"),
    Provider("tavily", "Tavily", "quota",
             "News/web search for Social Posts", ("TAVILY_API_KEY",), _probe_tavily,
             "https://app.tavily.com"),
    Provider("telegram", "Telegram — Terminal Bot", "validity",
             "Mini App front door, onboarding", ("TELEGRAM_BOT_TOKEN",),
             _mk_telegram_bot("TELEGRAM_BOT_TOKEN")),
    Provider("telegram_alert", "Telegram — Alert Bot", "validity",
             "Saved-signal & entry alert delivery", ("ALERT_BOT_TOKEN",),
             _mk_telegram_bot("ALERT_BOT_TOKEN")),
    Provider("telegram_poster", "Telegram — Poster Bot", "validity",
             "Free channel posts (luxquant-x-poster)", ("TG_BOT_TOKEN",),
             _mk_telegram_bot("TG_BOT_TOKEN")),
    Provider("etherscan", "Etherscan", "validity",
             "Whale tracking / ETH on-chain", ("ETHERSCAN_API_KEY",), _probe_etherscan),
    Provider("bscscan", "BscScan", "validity",
             "BSC on-chain", ("BSCSCAN_API_KEY",), _probe_bscscan),
    Provider("coingecko", "CoinGecko", "validity",
             "Market data, coin metadata", ("COINGECKO_API_KEY",),
             _mk_coingecko("COINGECKO_API_KEY")),
    Provider("coingecko_currency", "CoinGecko (FX)", "validity",
             "Currency / FX conversion", ("COINGECKO_API_KEY_CURRENCY",),
             _mk_coingecko("COINGECKO_API_KEY_CURRENCY")),
    Provider("coinalyze", "Coinalyze", "validity",
             "Derivatives & funding data", ("COINALYZE_API_KEY",), _probe_coinalyze),
    Provider("coinglass", "Coinglass", "validity",
             "Derivatives data", ("COINGLASS_API_KEY",), _probe_coinglass),
    Provider("sosovalue", "SosoValue", "validity",
             "ETF flow data", ("SOSOVALUE_API_KEY",), _probe_sosovalue),
    Provider("dune", "Dune Analytics", "validity",
             "Token flow queries", ("DUNEAPIKEY_TERMINAL",), _probe_dune),

    # ── Keyless dependencies ──────────────────────────────────────────
    # No credential to check, but the product breaks if these stop answering.
    # env_keys is empty, so `configured` is always true for them.
    Provider("bybit", "Bybit (public)", "reachability",
             "Order book, funding, OI, klines", (),
             _mk_reachable("https://api.bybit.com/v5/market/time", expect='"retCode":0')),
    Provider("mempool", "mempool.space", "reachability",
             "BTC fees, hashrate, mempool", (),
             _mk_reachable("https://mempool.space/api/blocks/tip/height", parse=_first_line)),
    Provider("alternative_me", "Alternative.me", "reachability",
             "Fear & Greed index", (),
             _mk_reachable("https://api.alternative.me/fng/?limit=1", expect="Fear and Greed")),
    Provider("blockchain_info", "Blockchain.info", "reachability",
             "BTC chain stats", (),
             _mk_reachable("https://blockchain.info/q/getblockcount", parse=_first_line)),
    Provider("geckoterminal", "GeckoTerminal", "reachability",
             "DEX pool data", (),
             _mk_reachable("https://api.geckoterminal.com/api/v2/networks", expect='"data"')),
    Provider("cointelegraph", "Cointelegraph RSS", "reachability",
             "News pipeline feed", (),
             _mk_reachable("https://cointelegraph.com/rss/tag/bitcoin", expect="<rss")),
    Provider("google_news", "Google News RSS", "reachability",
             "News pipeline feed", (),
             _mk_reachable(
                 "https://news.google.com/rss/search?q=bitcoin&hl=en-US&gl=US&ceid=US:en",
                 expect="<rss")),
    # BGeometrics' free tier — a SECOND, separate dependency from the paid
    # api.bgeometrics.com row above. 15 requests a day, so probe twice daily.
    Provider("bitcoin_data", "BGeometrics (free)", "reachability",
             "Extra on-chain metrics (onchain_extra)", (),
             _mk_reachable("https://bitcoin-data.com/v1/hashrate/last", expect="hashrate"),
             docs="https://bitcoin-data.com", min_interval=12 * 3600),
]


# ─── Cache + orchestration ────────────────────────────────────────────


def _cache_key(pid: str) -> str:
    return f"{_CACHE_PREFIX}{pid}"


def _read_cache(pid: str) -> dict | None:
    try:
        raw = get_redis().get(_cache_key(pid))
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _write_cache(pid: str, payload: dict) -> None:
    try:
        get_redis().set(_cache_key(pid), json.dumps(payload, default=str), ex=_DEFAULT_TTL * 4)
    except Exception:
        pass


async def _run_one(client: httpx.AsyncClient, p: Provider) -> dict:
    keys = {name: _env(name) for name in p.env_keys}
    missing = [n for n, v in keys.items() if not v]

    base = {
        "id": p.id,
        "label": p.label,
        "signal": p.signal,
        "powers": p.powers,
        "docs": p.docs,
        "env_keys": list(p.env_keys),
        "configured": not missing,
        # Keyless dependencies have no env_keys at all — do not index into it.
        "key_hint": _mask(keys.get(p.env_keys[0], "")) if p.env_keys else "",
        "checked_at": time.time(),
    }

    if missing:
        base.update(status=UNCONFIGURED, detail=f"not set: {', '.join(missing)}",
                    metrics={}, latency_ms=None)
        return base

    started = time.perf_counter()
    try:
        res = await asyncio.wait_for(p.probe(client, keys), timeout=_TIMEOUT + 3)
    except asyncio.TimeoutError:
        res = ProbeResult(ERROR, f"probe timed out after {_TIMEOUT + 3:.0f}s")
    except httpx.HTTPStatusError as e:
        res = ProbeResult(ERROR, f"HTTP {e.response.status_code}")
    except Exception as e:  # a bad probe must never take the page down
        res = ProbeResult(ERROR, f"{type(e).__name__}: {e}"[:160])
    res.latency_ms = int((time.perf_counter() - started) * 1000)

    base.update(asdict(res))
    return base


async def collect(force: bool = False) -> dict:
    """Probe every provider whose cached result has aged out.

    ``force`` shortens the window to ``_MIN_INTERVAL`` rather than removing it:
    the refresh button must not become a way to burn a provider's quota.
    """
    now = time.time()

    fresh: dict[str, dict] = {}
    stale: list[Provider] = []
    for p in PROVIDERS:
        # A provider's own floor always wins, even on a forced refresh — that
        # floor exists because the provider cannot afford to be asked often.
        floor = p.min_interval or _MIN_INTERVAL
        window = floor if force else max(_DEFAULT_TTL, floor)
        cached = _read_cache(p.id)
        if cached and (now - float(cached.get("checked_at") or 0)) < window:
            fresh[p.id] = cached
        else:
            stale.append(p)

    if stale:
        limits = httpx.Limits(max_connections=10)
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, headers={"User-Agent": _UA}, limits=limits, follow_redirects=True
        ) as client:
            done = await asyncio.gather(
                *(_run_one(client, p) for p in stale), return_exceptions=True
            )
        for p, row in zip(stale, done):
            if isinstance(row, BaseException):
                row = {
                    "id": p.id, "label": p.label, "signal": p.signal, "powers": p.powers,
                    "docs": p.docs, "env_keys": list(p.env_keys), "configured": True,
                    "key_hint": "", "status": ERROR,
                    "detail": f"{type(row).__name__}: {row}"[:160],
                    "metrics": {}, "latency_ms": None, "checked_at": time.time(),
                }
            _write_cache(p.id, row)
            fresh[p.id] = row

    rows = [fresh[p.id] for p in PROVIDERS if p.id in fresh]
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    return {
        "providers": rows,
        "counts": counts,
        "total": len(rows),
        "probed_now": len(stale),
        "generated_at": now,
        "cache_ttl_s": _DEFAULT_TTL,
    }
