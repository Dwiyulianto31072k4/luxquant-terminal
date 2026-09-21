"""
Entitlement audit — who already has the right to LuxQuant access but has never
claimed it.

Two upstream sources grant access without any payment record of ours:

  · Discord "Premium+" in the Daily Rekom Crypto guild  → subscriber
    (DRC is a PARTNER server. Its other ~7,000 members are theirs, not ours —
     only the Premium+ role is a LuxQuant entitlement. Never widen this to the
     whole guild.)
  · legacy_members (pre-webapp Telegram VIP snapshot)   → premium, lifetime

Both are resolved at LOGIN time. Somebody who never signs in therefore never
lands in dwiyulianto at all — which means every count on the admin page is blind to
them. Measured 2026-08-09: 69 on Discord and 139 on Telegram, none of whom
appear anywhere in the member directory.

The reconciliation needs a few hundred third-party calls and takes about a
minute, so it NEVER runs in the request path: a worker computes it and the
endpoint only reads Redis (same contract as the terminal deriv blob).

Telegram asymmetry worth remembering: its Bot API has no method to list group
members, so unclaimed Telegram entitlements are only visible for people we
already hold an id for — i.e. the legacy snapshot. The remainder is knowable as
a COUNT (group size minus matched) but never as names. Discord has no such
limit once the Server Members Intent is on.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import text

from app.core.redis import cache_set, cache_get
from app.core.database import SessionLocal
from app.services.telegram_group import get_member_status

log = logging.getLogger(__name__)

BLOB_KEY = "lq:admin:entitlements"
# 48h, not 12h. The loop below refreshes once a day, so a 12h TTL left the
# cache empty for the other 12 — measured 2026-09-21: expired 12:06 UTC with
# no recompute until 00:00, i.e. the Unclaimed access panel was blank from
# 19:06 to 07:00 WIB every day. Two refreshes of margin also survives one
# failed pass.
TTL = 60 * 60 * 48

# Current Discord Premium+ holders, as a list of Discord user ids (strings).
# This is what "DRC client" means: holds Premium+ in the Daily Rekom Crypto
# server right now. Not the same as subscription_source == 'discord_premium',
# which records how access was first granted — measured, that rule tagged two
# accounts that had since left and missed three real Premium+ holders whose
# access came from legacy, lifetime or an admin grant.
DRC_KEY = "lq:drc:premium_ids"

DISCORD_API = "https://discord.com/api/v10"
GUILD_ID = os.getenv("DISCORD_GUILD_ID", "1199773381097181317")
PREMIUM_ROLE_ID = os.getenv("DISCORD_PREMIUM_ROLE_ID", "1419900487364382810")
BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
VIP_GROUP_ID = os.getenv("VIP_GROUP_CHAT_ID", "-1002670915863")

# Discord rejects the default urllib/httpx UA on some routes; the documented
# bot format is required.
_UA = "DiscordBot (https://luxquant.tw, 1.0)"
_IN_GROUP = {"creator", "administrator", "member", "restricted"}


async def _discord_premium_holders() -> list[dict] | None:
    """Every member of the guild carrying the Premium+ role, or None when the
    member list could not be read in full.

    None, not a short list, because a short list is indistinguishable from
    people losing the role. The loop pages through ~7,000 members; a 429 or
    5xx on page 4 used to `break` and return the first three pages as if they
    were the whole server — and since the DRC badge is built from this list,
    one Discord hiccup at midnight would have stripped it from everyone past
    the failed page.

    Needs the Server Members Intent (Developer Portal → Bot); without it the
    route answers 403, which is also None.
    """
    if not BOT_TOKEN:
        return None
    out, after = [], "0"
    headers = {"Authorization": f"Bot {BOT_TOKEN}", "User-Agent": _UA}
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as c:
        while True:
            r = await c.get(f"{DISCORD_API}/guilds/{GUILD_ID}/members",
                            params={"limit": 1000, "after": after})
            if r.status_code != 200:
                log.warning("entitlement: discord members %s %s", r.status_code, r.text[:120])
                return None
            page = r.json()
            if not page:
                break
            out += page
            after = page[-1]["user"]["id"]
            if len(page) < 1000:
                break
            await asyncio.sleep(0.4)
    return [
        {"platform_id": m["user"]["id"],
         "handle": m["user"].get("username"),
         "name": m["user"].get("global_name") or m["user"].get("username"),
         "joined": (m.get("joined_at") or "")[:10]}
        for m in out if PREMIUM_ROLE_ID in (m.get("roles") or [])
    ]


async def compute() -> dict[str, Any]:
    db = SessionLocal()
    try:
        lux_by_dc = {r["dc"]: dict(r) for r in db.execute(text(
            """SELECT discord_id::text AS dc, username, role,
                      COALESCE(subscription_source,'') AS src, created_at
               FROM users WHERE discord_id IS NOT NULL""")).mappings()}
        lux_by_tg = {r["tg"]: dict(r) for r in db.execute(text(
            """SELECT telegram_id::text AS tg, username, role,
                      COALESCE(subscription_source,'') AS src, created_at
               FROM users WHERE telegram_id IS NOT NULL""")).mappings()}
        # Settlement marks. Keyed by discord_id and deliberately NOT a foreign
        # key — most of these people have no LuxQuant account, which is exactly
        # why they need tracking. 'lynk_form' rows were settled in the Lynk ID
        # era; 'manual' rows were confirmed by an operator, usually after
        # invoicing the DRC partner.
        paid_marks = {(r["platform"], r["discord_id"]): dict(r) for r in db.execute(text(
            """SELECT platform, discord_id, paid, paid_source, checked_at, checked_by, note,
                      form_joined_at, form_submitted_at, form_batch, form_membership
               FROM entitlement_paid""")).mappings()}

        # Every legacy member, claimed or not — the panel shows both sides.
        legacy = [dict(r) for r in db.execute(text(
            """SELECT telegram_id::text AS platform_id, username AS handle,
                      full_name AS name, snapshot_at
               FROM legacy_members"""
        )).mappings()]
    finally:
        db.close()

    ACCESS = {"premium", "subscriber", "admin", "co_admin", "founder"}

    def _lux(u):
        """LuxQuant-side facts, or the absence of them."""
        if not u:
            return {"has_account": False, "lux_username": None, "lux_role": None,
                    "lux_source": None, "has_access": False, "lux_joined": None}
        return {
            "has_account": True,
            "lux_username": u["username"],
            "lux_role": u["role"],
            "lux_source": u["src"] or None,
            "has_access": u["role"] in ACCESS,
            "lux_joined": u["created_at"].date().isoformat() if u.get("created_at") else None,
        }

    rows: list[dict] = []

    dc = await _discord_premium_holders()
    discord_ok = dc is not None
    dc = dc or []
    for m in dc:
        u = lux_by_dc.get(m["platform_id"])
        # `joined` is when they joined the GUILD, not when Premium+ was granted.
        # Discord exposes no timestamp for a role assignment — only the audit
        # log has it, and that expires long before these grants happened.
        pm = paid_marks.get(("discord", m["platform_id"])) or {}
        rows.append({**m, "source": "discord_premium", "platform": "discord",
                     "entitles_to": "subscriber", "still_present": True,
                     "paid": bool(pm.get("paid")),
                     "paid_source": pm.get("paid_source"),
                     "paid_checked_at": (pm["checked_at"].isoformat()
                                         if pm.get("checked_at") else None),
                     "paid_checked_by": pm.get("checked_by"),
                     # Straight off the Lynk-era signup sheet. 14 of the 62 rows
                     # left "Tanggal Join" blank, so this is legitimately null
                     # for some and must sort to the bottom, not to 1970.
                     "form_joined_at": (pm["form_joined_at"].isoformat()
                                        if pm.get("form_joined_at") else None),
                     "form_batch": pm.get("form_batch"),
                     "note": pm.get("note"),
                     **_lux(u)})

    # Telegram: only the legacy snapshot gives us ids to ask about.
    tg_present = 0
    for m in legacy:
        u = lux_by_tg.get(m["platform_id"])
        status = await get_member_status(int(m["platform_id"]))
        present = status in _IN_GROUP
        if present:
            tg_present += 1
        rows.append({
            "platform_id": m["platform_id"], "handle": m["handle"],
            "name": m["name"],
            # Deliberately None. legacy_members.snapshot_at is the moment the
            # snapshot was taken (one single timestamp for all 235 rows), not
            # anything about the person — rendering it in a "joined" column made
            # 139 people look like they all arrived on the same day.
            "joined": None,
            "source": "legacy", "platform": "telegram",
            "entitles_to": "premium (lifetime)", "still_present": present,
            **_lux(u),
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "discord_ok": discord_ok,
        "summary": {
            "legacy_snapshot_at": (legacy[0]["snapshot_at"].date().isoformat()
                                   if legacy and legacy[0].get("snapshot_at") else None),
            "discord_premium_total": len(dc),
            "discord_total": sum(1 for r in rows if r["source"] == "discord_premium"),
            "discord_unclaimed": sum(1 for r in rows
                                     if r["source"] == "discord_premium" and not r["has_account"]),
            "legacy_total": sum(1 for r in rows if r["source"] == "legacy"),
            "legacy_unclaimed": sum(1 for r in rows
                                    if r["source"] == "legacy" and not r["has_account"]),
            "legacy_still_in_group": tg_present,
            "claimed": sum(1 for r in rows if r["has_account"]),
            "with_access": sum(1 for r in rows if r["has_access"]),
            "total_rows": len(rows),
            "discord_paid": sum(1 for r in rows
                                if r["source"] == "discord_premium" and r.get("paid")),
            "discord_unpaid": sum(1 for r in rows
                                  if r["source"] == "discord_premium" and not r.get("paid")),
        },
        "rows": rows,
    }


def _drc_ids_from_blob(blob: dict[str, Any]) -> list[str]:
    return sorted({
        str(r["platform_id"])
        for r in (blob.get("rows") or [])
        if r.get("platform") == "discord" and r.get("platform_id")
    })


async def compute_and_cache() -> dict[str, Any]:
    blob = await compute()
    if blob.get("discord_ok"):
        cache_set(BLOB_KEY, blob, ttl=TTL)
        cache_set(DRC_KEY, _drc_ids_from_blob(blob), ttl=TTL)
    else:
        # The Discord member list did not come back whole. Keep yesterday's
        # picture — its generated_at stays honest about its age — rather than
        # replace it with one that says nobody holds Premium+. Only when there
        # is no picture at all is the partial blob better than nothing, and
        # even then the DRC set is left unset so badges fall back instead of
        # vanishing.
        log.warning("entitlement: Discord member fetch incomplete; keeping previous audit and DRC set")
        if not cache_get(BLOB_KEY):
            cache_set(BLOB_KEY, blob, ttl=TTL)
    log.info("entitlement audit: %s rows, %s unclaimed",
             blob["summary"]["total_rows"], blob["summary"]["discord_unclaimed"] + blob["summary"]["legacy_unclaimed"])
    return blob


async def entitlement_daily_loop() -> None:
    """Recompute once a day at 00:00 UTC.

    Deliberately not more often. One pass is ~250 calls across two third-party
    APIs, and nothing it measures moves faster than daily — role grants and
    group membership are human actions. This is also the only thing that reads
    a PARTNER's Discord member list, so a tighter loop would spend their rate
    limit to learn nothing new.

    On a cold boot with an empty cache it computes immediately rather than
    leaving the panel blank until midnight.
    """
    if not cache_get(BLOB_KEY):
        try:
            await compute_and_cache()
        except Exception:
            log.exception("entitlement: initial compute failed")
    elif cache_get(DRC_KEY) is None:
        # Blob survived a restart but the DRC set predates it (first deploy of
        # this key): derive it now rather than leave every badge off until
        # midnight.
        cache_set(DRC_KEY, _drc_ids_from_blob(cache_get(BLOB_KEY)), ttl=TTL)

    while True:
        now = datetime.now(timezone.utc)
        nxt = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        await asyncio.sleep(max((nxt - now).total_seconds(), 60))
        try:
            await compute_and_cache()
        except Exception:
            log.exception("entitlement: daily refresh failed")


def read_cached() -> dict[str, Any] | None:
    return cache_get(BLOB_KEY)


def drc_premium_ids() -> set[str] | None:
    """Discord ids currently holding Premium+, or None when unknown.

    None is not the same as empty: it means neither the set nor the blob it is
    derived from is in cache, and callers fall back rather than strip every
    badge.
    """
    ids = cache_get(DRC_KEY)
    if ids is not None:
        return set(ids)
    blob = cache_get(BLOB_KEY)
    if blob:
        derived = _drc_ids_from_blob(blob)
        cache_set(DRC_KEY, derived, ttl=TTL)
        return set(derived)
    return None


def is_drc_client(discord_id, subscription_source, ids: set[str] | None) -> bool:
    """Holds Premium+ in the DRC server right now.

    Without a known set, the only signal left is how access was granted — used
    only when a Discord account is still linked, so accounts that have since
    unlinked are not tagged on a guess.
    """
    if ids is None:
        return subscription_source == "discord_premium" and discord_id is not None
    return discord_id is not None and str(discord_id) in ids


def note_discord_premium(discord_id, has_premium: bool | None) -> None:
    """Live detection at Discord login: tag or untag this one person now.

    The daily audit is the full sweep; this closes the gap for someone who
    gains Premium+ during the day, and drops someone who lost it the moment
    they sign in rather than at midnight. Read-modify-write, so two logins in
    the same instant can lose one update — the next daily rebuild restores it.
    """
    if discord_id is None or has_premium is None:
        return  # no id, or Discord could not answer: do not guess either way
    ids = drc_premium_ids()
    if ids is None:
        return  # nothing authoritative to amend; the daily run will set it
    did = str(discord_id)
    if has_premium and did not in ids:
        ids.add(did)
    elif not has_premium and did in ids:
        ids.discard(did)
    else:
        return
    cache_set(DRC_KEY, sorted(ids), ttl=TTL)

