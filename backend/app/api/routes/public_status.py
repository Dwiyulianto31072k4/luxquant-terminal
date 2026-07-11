# backend/app/api/routes/public_status.py
"""
Public Status Page API + Incident management (status.anthropic.com style).

Two layers, like every top-tier status page (Atlassian, GitHub, Cloudflare):

1. AUTOMATIC health — collapses the live systemd/service state into a handful
   of user-facing COMPONENTS (operational / degraded / major_outage). Reuses the
   admin services_monitor discovery logic. NO internal detail is ever leaked.

2. MANUAL incidents — human-posted announcements with the standard lifecycle
   (Investigating → Identified → Monitoring → Resolved) plus scheduled
   maintenance (Scheduled → In progress → Completed). Admins post updates over
   time; the public page shows the timeline. An active incident escalates the
   components it affects, and the overall banner, so users see it immediately.

INCIDENT STORAGE — why a JSON file, not the DB
----------------------------------------------
The incident you most need to announce is usually "the database / backend is
having trouble". If incidents lived in Postgres, you couldn't post that one when
it mattered most. So incidents live in a small JSON file on disk: readable
without DB or Redis, atomically written, and (optionally) served by nginx as a
static fallback if the API process itself is down.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.redis import cache_get, cache_set, cache_delete_pattern
from app.api.deps import get_admin_user
from app.models.user import User
from app.api.routes.services_monitor import (
    _systemctl_available,
    _discover_units,
    _describe,
    _category,
)

logger = logging.getLogger("luxquant.public_status")

router = APIRouter(prefix="/api/v1/status", tags=["public-status"])
admin_router = APIRouter(
    prefix="/api/v1/status/admin",
    tags=["public-status-admin"],
    dependencies=[Depends(get_admin_user)],
)


# ════════════════════════════════════════════════════════════════════
# Public component groups  (user-facing — never internal plumbing)
# ════════════════════════════════════════════════════════════════════
COMPONENTS: list[dict[str, Any]] = [
    {"key": "platform", "name": "Website & Sign-in", "desc": "Loading the app and signing in to your account.", "cats": ["Core API", "Infrastructure"]},
    {"key": "signals", "name": "Signals", "desc": "Live signals and their status updates.", "cats": ["Signals"]},
    {"key": "market_data", "name": "Market Data & Charts", "desc": "Prices, charts and market analytics.", "cats": ["Market Data"]},
    {"key": "distribution", "name": "Notifications & Alerts", "desc": "Alerts and notifications you receive.", "cats": ["Distribution"]},
    {"key": "autotrade", "name": "AutoTrade", "desc": "Automated trade execution.", "cats": ["AutoTrade / Cryptobot"]},
    {"key": "ai_research", "name": "AI Research", "desc": "AI market analysis and insights.", "cats": ["AI Compass"]},
    {"key": "community", "name": "News & Updates", "desc": "Crypto news and community updates.", "cats": ["Discord", "News"]},
    # Catch-all for the remaining product surface (Pulse, Markets, On-Chain,
    # Journal, Portfolio, Watchlist, Calendar, …). These are all served by the
    # core platform, so this row tracks the same core-infrastructure health.
    {"key": "other", "name": "Other Features", "desc": "Pulse, Markets, On-Chain, Journal, Portfolio & more.", "cats": ["Core API", "Infrastructure"]},
]
_COMPONENT_KEYS = {c["key"] for c in COMPONENTS}
_COMPONENT_META = {c["key"]: c for c in COMPONENTS}

# unit health → public component state ('idle' is normal → OK).
# NOTE: 'unknown' is deliberately NOT here. 'unknown' means a single
# `systemctl show` call couldn't be read in time (e.g. it timed out while the
# box was busy) — that's a transient read miss, not evidence the service is
# unhealthy. Counting it as degraded caused false "degraded" flags, so we ignore
# unknown units entirely when computing a component's state (see _auto_components).
_DEGRADED = {"warn"}
_DOWN = {"down"}

# OS / distro units that can match our discovery keywords by accident
# (e.g. "update-notifier" contains "notif") but are NOT part of the product.
# They must never influence a user-facing component's status.
_NOISE_PREFIXES = ("update-notifier", "systemd", "snap.", "unattended-upgrades", "packagekit")

# severity ranks for roll-up. maintenance is informational (blue), NOT "worse".
_RANK = {"operational": 0, "maintenance": 1, "degraded": 2, "major_outage": 3}
_RANK_INV = {v: k for k, v in _RANK.items()}

OVERALL_LABEL = {
    "operational": "All systems operational",
    "maintenance": "Under maintenance",
    "degraded": "Some systems degraded",
    "major_outage": "Major outage",
}


def _component_state(healths: list[str]) -> str:
    if not healths:
        return "operational"
    if any(h in _DOWN for h in healths):
        return "major_outage"
    if any(h in _DEGRADED for h in healths):
        return "degraded"
    return "operational"


# ════════════════════════════════════════════════════════════════════
# Incident lifecycle vocabulary
# ════════════════════════════════════════════════════════════════════
INCIDENT_STATUSES = {"investigating", "identified", "monitoring", "resolved"}
MAINTENANCE_STATUSES = {"scheduled", "in_progress", "completed"}
ALL_STATUSES = INCIDENT_STATUSES | MAINTENANCE_STATUSES
CLOSED_STATUSES = {"resolved", "completed"}
IMPACTS = {"minor", "major", "critical", "maintenance"}

# impact → how much it escalates an affected component's status.
_IMPACT_ESCALATION = {
    "critical": "major_outage",
    "major": "major_outage",
    "minor": "degraded",
    "maintenance": "maintenance",
}


# ════════════════════════════════════════════════════════════════════
# Incident store — atomic JSON file, safe without DB/Redis
# ════════════════════════════════════════════════════════════════════
_STORE_LOCK = threading.Lock()
INCIDENTS_FILE = os.environ.get(
    "STATUS_INCIDENTS_FILE", "/opt/luxquant/status/incidents.json"
)

# ── Auto-incident engine config ──────────────────────────────────────
# Fully automatic: open an incident when a component stays unhealthy long
# enough, and auto-resolve it once it has recovered and held. Admins can still
# narrate/override; auto only ever touches incidents it created itself.
AUTO_INCIDENTS = os.environ.get("STATUS_AUTO_INCIDENTS", "1").strip().lower() not in ("0", "false", "no", "off")
AUTO_OPEN_SECONDS = int(os.environ.get("STATUS_AUTO_OPEN_SECONDS", "120"))     # unhealthy > 2 min → open
AUTO_RESOLVE_SECONDS = int(os.environ.get("STATUS_AUTO_RESOLVE_SECONDS", "120"))  # healthy > 2 min → resolve


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _age_seconds(iso: Optional[str]) -> Optional[float]:
    dt = _parse_iso(iso)
    if dt is None:
        return None
    return (datetime.now(timezone.utc) - dt).total_seconds()


def _load_store() -> dict[str, Any]:
    try:
        with open(INCIDENTS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and isinstance(data.get("incidents"), list):
            return data
    except FileNotFoundError:
        pass
    except Exception as exc:  # corrupt file must never break the public page
        logger.warning("incidents store unreadable (%s): %s", INCIDENTS_FILE, exc)
    return {"incidents": []}


def _save_store(data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(INCIDENTS_FILE), exist_ok=True)
    # atomic: write temp in same dir, then replace.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(INCIDENTS_FILE), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, INCIDENTS_FILE)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _is_active(inc: dict[str, Any]) -> bool:
    return inc.get("status") not in CLOSED_STATUSES


def _public_incident(inc: dict[str, Any]) -> dict[str, Any]:
    """Shape an incident for public consumption (no internal fields)."""
    return {
        "id": inc.get("id"),
        "title": inc.get("title", ""),
        "impact": inc.get("impact", "minor"),
        "status": inc.get("status", "investigating"),
        "auto": bool(inc.get("auto")),
        "is_maintenance": inc.get("impact") == "maintenance" or inc.get("status") in MAINTENANCE_STATUSES,
        "affected": [k for k in inc.get("affected", []) if k in _COMPONENT_KEYS],
        "created_at": inc.get("created_at"),
        "updated_at": inc.get("updated_at"),
        "scheduled_for": inc.get("scheduled_for"),
        "scheduled_until": inc.get("scheduled_until"),
        "updates": [
            {
                "status": u.get("status"),
                "body": u.get("body", ""),
                "created_at": u.get("created_at"),
            }
            for u in inc.get("updates", [])
        ],
    }


# ════════════════════════════════════════════════════════════════════
# Build public status (auto health + incident overlay)
# ════════════════════════════════════════════════════════════════════
def _auto_components() -> list[dict[str, Any]]:
    """Automatic per-component health from live services. Returns list of
    {key,name,description,status} with status ∈ operational|degraded|major_outage."""
    if not _systemctl_available():
        # Dev / no systemd: the API answered, so platform is up. Show the full
        # list as operational so incidents still have rows to attach to.
        return [
            {"key": c["key"], "name": c["name"], "description": c["desc"], "status": "operational"}
            for c in COMPONENTS
        ]

    units = _discover_units()
    described = [_describe(u, include_log=False) for u in units]
    described = [d for d in described if d.get("load_state") != "not-found"]

    by_cat: dict[str, list[str]] = {}
    for d in described:
        name = d.get("name", "")
        health = d.get("health", "unknown")
        # Ignore OS/distro noise units and transient read misses so neither can
        # flip a user-facing component to "degraded".
        if health == "unknown":
            continue
        if any(name.startswith(p) for p in _NOISE_PREFIXES):
            continue
        # A unit that is merely STARTING UP (active_state == "activating") is
        # transient — e.g. a timer-driven oneshot (arena/compass workers) firing
        # on schedule, which blips through "activating" every run. That is NOT an
        # outage, so we ignore it. The exception is a genuine crash-loop, which
        # shows up as repeated restarts or a non-success result — that we keep.
        if (
            health == "warn"
            and d.get("active_state") == "activating"
            and (d.get("restarts") or 0) < 3
            and d.get("result") in ("success", "", None)
        ):
            continue
        cat = d.get("category") or _category(d.get("unit", name))
        by_cat.setdefault(cat, []).append(health)

    out: list[dict[str, Any]] = []
    for c in COMPONENTS:
        healths: list[str] = []
        for cat in c["cats"]:
            healths.extend(by_cat.get(cat, []))
        if not healths and c["key"] != "platform":
            continue
        out.append({
            "key": c["key"],
            "name": c["name"],
            "description": c["desc"],
            "status": _component_state(healths) if healths else "operational",
        })
    return out


def _severity_of(status: str) -> str:
    """Map a component's auto status → incident impact (worse first)."""
    if status == "major_outage":
        return "major"
    if status == "degraded":
        return "minor"
    return ""  # operational / maintenance → not an incident-worthy state


def _auto_reconcile(components: list[dict[str, Any]]) -> None:
    """Fully-automatic incident open/resolve, based on how long each component
    has been unhealthy / healthy. Only ever touches auto-created incidents.

    Runs on each status build (≈ every 20s under any traffic). State is kept in
    the same JSON store so it survives restarts and needs no background worker.
    """
    if not AUTO_INCIDENTS:
        return

    status_by_key = {c["key"]: c["status"] for c in components}

    with _STORE_LOCK:
        store = _load_store()
        track: dict[str, Any] = store.setdefault("auto_track", {})
        incidents: list[dict] = store["incidents"]
        changed = False

        # index of the currently-open auto incident per component
        open_auto = {
            inc.get("auto_component"): inc
            for inc in incidents
            if inc.get("auto") and _is_active(inc) and inc.get("auto_component")
        }

        for key, status in status_by_key.items():
            severity = _severity_of(status)
            t = track.setdefault(key, {"unhealthy_since": None, "healthy_since": None})
            inc = open_auto.get(key)

            if severity:  # component is unhealthy
                t["healthy_since"] = None
                if t["unhealthy_since"] is None:
                    t["unhealthy_since"] = _now_iso()
                    changed = True
                if inc is None:
                    age = _age_seconds(t["unhealthy_since"]) or 0
                    if age >= AUTO_OPEN_SECONDS:
                        name = _COMPONENT_META.get(key, {}).get("name", key)
                        now = _now_iso()
                        new_inc = {
                            "id": uuid.uuid4().hex[:12],
                            "title": f"{name} — service disruption detected",
                            "impact": severity,
                            "status": "investigating",
                            "affected": [key],
                            "auto": True,
                            "auto_component": key,
                            "created_at": now,
                            "updated_at": now,
                            "resolved_at": None,
                            "created_by": "auto-monitor",
                            "updates": [{
                                "id": uuid.uuid4().hex[:8],
                                "status": "investigating",
                                "body": f"We've automatically detected a problem affecting {name} and are investigating.",
                                "created_at": now,
                                "by": "auto-monitor",
                            }],
                        }
                        incidents.append(new_inc)
                        open_auto[key] = new_inc
                        changed = True
                        logger.warning("AUTO-INCIDENT OPEN component=%s severity=%s", key, severity)
                else:
                    # already open — escalate impact if it got worse (minor→major)
                    if _IMPACT_ESCALATION.get(severity) and severity == "major" and inc.get("impact") == "minor":
                        inc["impact"] = "major"
                        inc["updated_at"] = _now_iso()
                        inc.setdefault("updates", []).append({
                            "id": uuid.uuid4().hex[:8],
                            "status": inc.get("status", "investigating"),
                            "body": "Impact has increased to a major outage.",
                            "created_at": _now_iso(),
                            "by": "auto-monitor",
                        })
                        changed = True
            else:  # component is healthy
                t["unhealthy_since"] = None
                if inc is not None:
                    if t["healthy_since"] is None:
                        t["healthy_since"] = _now_iso()
                        changed = True
                    age = _age_seconds(t["healthy_since"]) or 0
                    if age >= AUTO_RESOLVE_SECONDS:
                        name = _COMPONENT_META.get(key, {}).get("name", key)
                        now = _now_iso()
                        inc["status"] = "resolved"
                        inc["resolved_at"] = now
                        inc["updated_at"] = now
                        inc.setdefault("updates", []).append({
                            "id": uuid.uuid4().hex[:8],
                            "status": "resolved",
                            "body": f"{name} has recovered and is operating normally. Resolved automatically.",
                            "created_at": now,
                            "by": "auto-monitor",
                        })
                        t["healthy_since"] = None
                        changed = True
                        logger.warning("AUTO-INCIDENT RESOLVE component=%s", key)
                else:
                    t["healthy_since"] = None

        if changed:
            _save_store(store)


def _build_status() -> dict[str, Any]:
    now_iso = _now_iso()
    components = _auto_components()
    comp_by_key = {c["key"]: c for c in components}

    # Fully-automatic detection: may open/resolve incidents before we overlay.
    if _systemctl_available():
        try:
            _auto_reconcile(components)
        except Exception:
            logger.exception("auto-reconcile failed")

    store = _load_store()
    active = [inc for inc in store["incidents"] if _is_active(inc)]

    # Overlay active incidents onto the components they affect.
    for inc in active:
        esc = _IMPACT_ESCALATION.get(inc.get("impact", "minor"), "degraded")
        for key in inc.get("affected", []):
            if key not in _COMPONENT_KEYS:
                continue
            # Ensure the affected component has a row even in trimmed dev output.
            if key not in comp_by_key:
                meta = _COMPONENT_META[key]
                row = {"key": key, "name": meta["name"], "description": meta["desc"], "status": "operational"}
                components.append(row)
                comp_by_key[key] = row
            cur = comp_by_key[key]["status"]
            if _RANK[esc] > _RANK[cur]:
                comp_by_key[key]["status"] = esc

    # Overall = worst component state.
    worst = 0
    for c in components:
        worst = max(worst, _RANK.get(c["status"], 0))
    overall = _RANK_INV[worst]

    # Recent closed incidents (last 5) for the "Past incidents" section.
    closed = [inc for inc in store["incidents"] if not _is_active(inc)]
    closed.sort(key=lambda i: i.get("updated_at") or "", reverse=True)

    return {
        "overall": overall,
        "overall_label": OVERALL_LABEL.get(overall, "Status unknown"),
        "monitoring": "full" if _systemctl_available() else "limited",
        "components": components,
        "incidents": [_public_incident(i) for i in active],
        "past_incidents": [_public_incident(i) for i in closed[:5]],
        "updated_at": now_iso,
    }


# ════════════════════════════════════════════════════════════════════
# Public endpoints
# ════════════════════════════════════════════════════════════════════
@router.get("/ping")
def status_ping() -> dict[str, Any]:
    """Ultra-light liveness probe. Zero work (no systemctl / DB / Redis) so it
    answers instantly. Lets the status page tell 'API alive' from 'API down'."""
    return {"ok": True, "time": _now_iso()}


@router.get("")
@router.get("/")
def public_status() -> dict[str, Any]:
    """Public, unauthenticated platform status. Cached 20s (incidents bust the
    cache on write) so a refresh storm during an incident adds no load."""
    cached = cache_get("public:status")
    if cached is not None:
        return cached
    try:
        result = _build_status()
    except Exception:  # never 500 the status page, and never leak why
        logger.exception("public status build failed")
        result = {
            "overall": "unknown",
            "overall_label": "Status unavailable",
            "monitoring": "error",
            "note": "Could not read service status.",
            "components": [],
            "incidents": [],
            "past_incidents": [],
            "updated_at": _now_iso(),
        }
    cache_set("public:status", result, ttl=20)
    return result


# ════════════════════════════════════════════════════════════════════
# Admin: incident management  (all endpoints require admin)
# ════════════════════════════════════════════════════════════════════
class IncidentCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    impact: str = "minor"              # minor|major|critical|maintenance
    status: str = "investigating"      # lifecycle start
    affected: list[str] = []           # component keys
    message: str = ""                  # first update body
    scheduled_for: Optional[str] = None
    scheduled_until: Optional[str] = None


class IncidentUpdateReq(BaseModel):
    status: str                        # new lifecycle status
    message: str = ""


class IncidentPatch(BaseModel):
    title: Optional[str] = None
    impact: Optional[str] = None
    affected: Optional[list[str]] = None


def _bust_cache() -> None:
    # Clear both the fresh key and its ':stale' fallback so the next public read
    # rebuilds immediately after an incident is posted/updated.
    try:
        cache_delete_pattern("public:status*")
    except Exception:
        pass


def _validate(impact: Optional[str], status: Optional[str], affected: Optional[list[str]]):
    if impact is not None and impact not in IMPACTS:
        raise HTTPException(400, f"impact must be one of {sorted(IMPACTS)}")
    if status is not None and status not in ALL_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ALL_STATUSES)}")
    if affected is not None:
        bad = [k for k in affected if k not in _COMPONENT_KEYS]
        if bad:
            raise HTTPException(400, f"unknown component keys: {bad}. valid: {sorted(_COMPONENT_KEYS)}")


@admin_router.get("/incidents")
def admin_list_incidents(admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    """All incidents (active + closed), newest first — for the admin panel."""
    store = _load_store()
    items = sorted(store["incidents"], key=lambda i: i.get("created_at") or "", reverse=True)
    return {"incidents": items, "components": [{"key": c["key"], "name": c["name"]} for c in COMPONENTS]}


@admin_router.post("/incidents")
def admin_create_incident(body: IncidentCreate, admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    _validate(body.impact, body.status, body.affected)
    now = _now_iso()
    inc = {
        "id": uuid.uuid4().hex[:12],
        "title": body.title.strip(),
        "impact": body.impact,
        "status": body.status,
        "affected": [k for k in body.affected if k in _COMPONENT_KEYS],
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
        "scheduled_for": body.scheduled_for,
        "scheduled_until": body.scheduled_until,
        "created_by": getattr(admin, "username", None),
        "updates": [],
    }
    if body.message.strip() or body.status:
        inc["updates"].append({
            "id": uuid.uuid4().hex[:8],
            "status": body.status,
            "body": body.message.strip(),
            "created_at": now,
            "by": getattr(admin, "username", None),
        })
    with _STORE_LOCK:
        store = _load_store()
        store["incidents"].append(inc)
        _save_store(store)
    _bust_cache()
    logger.warning("INCIDENT CREATE by=%s id=%s title=%s", getattr(admin, "username", "?"), inc["id"], inc["title"])
    return {"ok": True, "incident": inc}


@admin_router.post("/incidents/{incident_id}/updates")
def admin_post_update(incident_id: str, body: IncidentUpdateReq, admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    """Post a lifecycle update — e.g. move Investigating → Monitoring → Resolved.
    This is the main 'change the status' action."""
    _validate(None, body.status, None)
    now = _now_iso()
    with _STORE_LOCK:
        store = _load_store()
        inc = next((i for i in store["incidents"] if i.get("id") == incident_id), None)
        if inc is None:
            raise HTTPException(404, "incident not found")
        inc["status"] = body.status
        inc["updated_at"] = now
        if body.status in CLOSED_STATUSES:
            inc["resolved_at"] = now
        inc.setdefault("updates", []).append({
            "id": uuid.uuid4().hex[:8],
            "status": body.status,
            "body": body.message.strip(),
            "created_at": now,
            "by": getattr(admin, "username", None),
        })
        _save_store(store)
    _bust_cache()
    logger.warning("INCIDENT UPDATE by=%s id=%s -> %s", getattr(admin, "username", "?"), incident_id, body.status)
    return {"ok": True, "incident": inc}


@admin_router.patch("/incidents/{incident_id}")
def admin_patch_incident(incident_id: str, body: IncidentPatch, admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    _validate(body.impact, None, body.affected)
    with _STORE_LOCK:
        store = _load_store()
        inc = next((i for i in store["incidents"] if i.get("id") == incident_id), None)
        if inc is None:
            raise HTTPException(404, "incident not found")
        if body.title is not None:
            inc["title"] = body.title.strip()
        if body.impact is not None:
            inc["impact"] = body.impact
        if body.affected is not None:
            inc["affected"] = [k for k in body.affected if k in _COMPONENT_KEYS]
        inc["updated_at"] = _now_iso()
        _save_store(store)
    _bust_cache()
    return {"ok": True, "incident": inc}


@admin_router.delete("/incidents/{incident_id}")
def admin_delete_incident(incident_id: str, admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    with _STORE_LOCK:
        store = _load_store()
        before = len(store["incidents"])
        store["incidents"] = [i for i in store["incidents"] if i.get("id") != incident_id]
        if len(store["incidents"]) == before:
            raise HTTPException(404, "incident not found")
        _save_store(store)
    _bust_cache()
    logger.warning("INCIDENT DELETE by=%s id=%s", getattr(admin, "username", "?"), incident_id)
    return {"ok": True}
