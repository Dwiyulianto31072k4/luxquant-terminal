# backend/app/api/routes/services_monitor.py
"""
Admin Workspace — VPS Service Health Monitor.

Exposes the live state of every LuxQuant systemd unit (services + timers) plus
core infrastructure (postgres / redis / nginx) so admins can see, from the
Management System UI, whether each worker is running, failed, or idle — and
restart it without SSHing into the box.

Design notes
------------
* Discovery is dynamic. Any unit file whose name starts with ``luxquant`` OR
  contains one of KEYWORDS is picked up automatically, so newly-added workers
  (injector, telegram forwarder, etc.) show up without editing this file.
  Extra exact unit names can be added via env ``WORKSPACE_MONITOR_EXTRA_UNITS``.
* Everything is read through ``systemctl show`` / ``journalctl`` with argument
  lists (never ``shell=True``) and short timeouts, so a hung systemd call can
  never wedge the API worker.
* Control actions (start/stop/restart) are restricted to units that discovery
  already returned — an admin cannot drive systemctl against an arbitrary unit.

Requires: the FastAPI process runs as a user allowed to query/drive systemd
(root on this VPS). If it ever runs unprivileged, grant read via polkit or a
scoped sudoers entry.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_admin_user
from app.models.user import User

logger = logging.getLogger("luxquant.services_monitor")

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace-services"])

# ════════════════════════════════════════════════════════════════════
# Discovery configuration
# ════════════════════════════════════════════════════════════════════

# Any unit whose name contains one of these substrings is treated as a
# LuxQuant-stack unit even if it is not prefixed "luxquant-". This is what
# keeps the cryptobot-* trading engine, the discord/news bots and the various
# forwarders visible regardless of their unit naming.
KEYWORDS = (
    "luxquant", "cryptobot", "crypto-news", "discord",
    "compass", "arena", "autotrade", "inject", "forward",
    "telegram", "binance", "liquidation", "journey", "correlation",
    "coin-metadata", "coin_metadata", "signal", "scraper", "pnl", "worker",
    "poster", "relay", "chart", "notif", "realtime", "delivery",
    "enrichment", "leverage", "money-flow",
)

# Core infrastructure to always include if the unit exists on the host.
# Postgres is matched by pattern too, so version-specific instances like
# postgresql@16-main.service are picked up automatically.
INFRA_EXACT = {
    "postgresql.service", "redis-server.service", "redis.service", "nginx.service",
}
_POSTGRES_RE = re.compile(r"^postgresql@[^.]+\.service$")

# Optional exact unit names from env, comma-separated. Example:
#   WORKSPACE_MONITOR_EXTRA_UNITS="tg-injector.service,signal-forwarder.service"
EXTRA_UNITS = tuple(
    u.strip()
    for u in os.getenv("WORKSPACE_MONITOR_EXTRA_UNITS", "").split(",")
    if u.strip()
)

# Units to never show / never touch (safety hard-block).
BLOCKLIST = {"systemd-", "dbus", "ssh", "sshd"}

_UNIT_RE = re.compile(r"^[a-zA-Z0-9_.:@\-]+\.(service|timer)$")
_ALLOWED_ACTIONS = {"start", "stop", "restart"}
_SHOW_PROPS = (
    "Id,LoadState,ActiveState,SubState,UnitFileState,Description,Type,"
    "Result,NRestarts,MainPID,MemoryCurrent,ActiveEnterTimestampMonotonic,"
    "LastTriggerUSec,NextElapseUSecRealtime,TriggersUnit"
)


# ════════════════════════════════════════════════════════════════════
# Low-level systemctl helpers
# ════════════════════════════════════════════════════════════════════

def _systemctl_available() -> bool:
    return shutil.which("systemctl") is not None


def _run(cmd: list[str], timeout: float = 8.0) -> tuple[int, str, str]:
    """Run a command with no shell. Returns (rc, stdout, stderr)."""
    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except FileNotFoundError:
        return 127, "", "command not found"
    except Exception as exc:  # pragma: no cover - defensive
        return 1, "", str(exc)


def _first_token(line: str) -> str:
    # list-units may prefix a failed unit with a "●" bullet even with --plain.
    line = line.lstrip("●* \t")
    parts = line.split()
    return parts[0] if parts else ""


def _catalog(unit_type: str) -> list[str]:
    """Union of installed unit files and currently-loaded units of a type.

    list-unit-files catches installed-but-idle units; list-units --all catches
    loaded template instances (e.g. postgresql@16-main.service) that never
    appear as a plain unit file.
    """
    names: list[str] = []
    for cmd in (
        ["systemctl", "list-unit-files", f"--type={unit_type}", "--no-legend", "--no-pager", "--plain"],
        ["systemctl", "list-units", "--all", f"--type={unit_type}", "--no-legend", "--no-pager", "--plain"],
    ):
        rc, out, _ = _run(cmd)
        if rc != 0:
            continue
        for line in out.splitlines():
            tok = _first_token(line)
            if tok:
                names.append(tok)
    return names


def _is_luxquant_unit(name: str) -> bool:
    low = name.lower()
    return low.startswith("luxquant") or any(k in low for k in KEYWORDS)


def _is_infra_unit(name: str) -> bool:
    return name in INFRA_EXACT or bool(_POSTGRES_RE.match(name))


def _discover_units() -> list[str]:
    """Return the ordered, de-duplicated set of units to monitor."""
    found: list[str] = []
    seen: set[str] = set()

    def add(name: str) -> None:
        if not name or name in seen or not _UNIT_RE.match(name):
            return
        if any(b in name for b in BLOCKLIST):
            return
        seen.add(name)
        found.append(name)

    for unit_type in ("service", "timer"):
        for name in _catalog(unit_type):
            if _is_luxquant_unit(name) or _is_infra_unit(name):
                add(name)

    for name in EXTRA_UNITS:
        add(name)

    return found


def _parse_show(raw: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in raw.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            props[k] = v
    return props


def _mem_bytes(value: str | None) -> int | None:
    if not value or value in ("[not set]", ""):
        return None
    try:
        n = int(value)
    except ValueError:
        return None
    # 2**64-1 means "unknown / no accounting"
    if n >= 18446744073709551615:
        return None
    return n


def _uptime_seconds(props: dict[str, str]) -> float | None:
    mono = props.get("ActiveEnterTimestampMonotonic")
    if not mono:
        return None
    try:
        started_us = int(mono)
    except ValueError:
        return None
    if started_us <= 0:
        return None
    try:
        now_us = time.clock_gettime(time.CLOCK_MONOTONIC) * 1_000_000
    except Exception:
        return None
    secs = (now_us - started_us) / 1_000_000
    return round(secs, 1) if secs >= 0 else None


def _category(name: str) -> str:
    low = name.lower()
    if _is_infra_unit(name):
        return "Infrastructure"
    if "backend" in low:
        return "Core API"
    if "compass" in low or "arena" in low:
        return "AI Compass"
    if "cryptobot" in low or "autotrade" in low or "leverage" in low or "reconcil" in low:
        return "AutoTrade / Cryptobot"
    if "discord" in low:
        return "Discord"
    if "news" in low:
        return "News"
    if any(k in low for k in ("forward", "inject", "relay", "poster", "delivery", "telegram", "tg-", "drc", "x-poster", "notif")):
        return "Distribution"
    if any(k in low for k in ("binance", "liquidation", "correlation", "coin", "money-flow", "realtime", "chart", "pnl", "price")):
        return "Market Data"
    if any(k in low for k in ("journey", "signal", "enrichment", "call", "sync", "scraper")):
        return "Signals"
    return "Other"


def _health(active_state: str, sub_state: str, result: str) -> str:
    """Collapse systemd states into a UI status: ok | warn | down | idle."""
    if active_state == "active":
        if sub_state in ("running", "waiting", "listening", "mounted", "exited"):
            return "ok"
        return "warn"
    if active_state == "activating":
        return "warn"  # (re)starting
    if active_state == "failed" or result not in ("success", "", None):
        return "down"
    # inactive / dead — oneshot units and disabled timers sit here normally
    return "idle"


def _log_tail(unit: str, lines: int = 8) -> list[str]:
    rc, out, _ = _run([
        "journalctl", "-u", unit, "-n", str(lines),
        "--no-pager", "--output=short-iso",
    ], timeout=6.0)
    if rc != 0:
        return []
    return [ln for ln in out.splitlines() if ln.strip()][-lines:]


def _describe(unit: str, include_log: bool = False) -> dict[str, Any]:
    rc, out, err = _run([
        "systemctl", "show", unit, "--no-pager", f"--property={_SHOW_PROPS}",
    ])
    if rc != 0:
        return {
            "unit": unit,
            "name": unit.rsplit(".", 1)[0],
            "kind": unit.rsplit(".", 1)[-1],
            "category": _category(unit),
            "health": "unknown",
            "error": err.strip() or f"systemctl show rc={rc}",
        }

    p = _parse_show(out)
    kind = unit.rsplit(".", 1)[-1]
    active_state = p.get("ActiveState", "")
    sub_state = p.get("SubState", "")
    result = p.get("Result", "")
    health = _health(active_state, sub_state, result)

    info: dict[str, Any] = {
        "unit": unit,
        "name": (p.get("Id") or unit).rsplit(".", 1)[0],
        "kind": kind,
        "category": _category(unit),
        "description": p.get("Description", ""),
        "health": health,
        "load_state": p.get("LoadState", ""),
        "active_state": active_state,
        "sub_state": sub_state,
        "unit_file_state": p.get("UnitFileState", ""),
        "result": result,
        "uptime_seconds": _uptime_seconds(p),
        "restarts": int(p["NRestarts"]) if p.get("NRestarts", "").isdigit() else 0,
        "memory_bytes": _mem_bytes(p.get("MemoryCurrent")),
        "main_pid": int(p["MainPID"]) if p.get("MainPID", "").isdigit() and p["MainPID"] != "0" else None,
    }

    if kind == "timer":
        info["last_trigger_usec"] = p.get("LastTriggerUSec", "")
        info["next_elapse"] = p.get("NextElapseUSecRealtime", "")
        info["triggers_unit"] = p.get("TriggersUnit", "")

    # Attach a short log tail for anything not clearly healthy.
    if include_log and health in ("down", "warn"):
        info["log_tail"] = _log_tail(unit)

    return info


# ════════════════════════════════════════════════════════════════════
# Schemas
# ════════════════════════════════════════════════════════════════════

class ServiceActionRequest(BaseModel):
    action: str  # start | stop | restart


# ════════════════════════════════════════════════════════════════════
# Endpoints
# ════════════════════════════════════════════════════════════════════

@router.get("/services")
def list_services(admin: User = Depends(get_admin_user)) -> dict[str, Any]:
    """Live health of every monitored LuxQuant + infra unit."""
    if not _systemctl_available():
        return {
            "available": False,
            "reason": "systemctl not found on this host (dev environment?)",
            "services": [],
            "summary": {"total": 0, "ok": 0, "warn": 0, "down": 0, "idle": 0},
        }

    units = _discover_units()
    services = [_describe(u, include_log=True) for u in units]
    # Drop units systemd doesn't actually know (avoids ghost cards).
    services = [s for s in services if s.get("load_state") != "not-found"]

    # sort: unhealthy first, then by category, then name
    order = {"down": 0, "warn": 1, "unknown": 2, "ok": 3, "idle": 4}
    services.sort(key=lambda s: (order.get(s.get("health"), 5), s.get("category", ""), s.get("name", "")))

    summary = {"total": len(services), "ok": 0, "warn": 0, "down": 0, "idle": 0}
    for s in services:
        h = s.get("health")
        if h in summary:
            summary[h] += 1

    return {"available": True, "services": services, "summary": summary}


@router.post("/services/{unit}/action")
def control_service(
    unit: str,
    body: ServiceActionRequest,
    admin: User = Depends(get_admin_user),
) -> dict[str, Any]:
    """Start / stop / restart a monitored unit. Restricted to discovered units."""
    action = (body.action or "").strip().lower()
    if action not in _ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail=f"action must be one of {sorted(_ALLOWED_ACTIONS)}")

    if not _UNIT_RE.match(unit):
        raise HTTPException(status_code=400, detail="invalid unit name")

    # Only allow acting on units discovery already exposes — never arbitrary.
    allowed = set(_discover_units())
    if unit not in allowed:
        raise HTTPException(status_code=403, detail="unit is not in the monitored set")

    logger.warning(
        "SERVICE CONTROL: admin=%s (id=%s) action=%s unit=%s",
        getattr(admin, "username", "?"), getattr(admin, "id", "?"), action, unit,
    )

    rc, out, err = _run(["systemctl", action, unit], timeout=25.0)
    ok = rc == 0

    # Re-read state so the UI updates immediately.
    state = _describe(unit, include_log=not ok)

    if not ok:
        logger.error("SERVICE CONTROL FAILED: unit=%s action=%s rc=%s err=%s", unit, action, rc, err.strip())

    return {
        "ok": ok,
        "action": action,
        "unit": unit,
        "returncode": rc,
        "message": (err or out).strip()[:500],
        "state": state,
        "actor": getattr(admin, "username", None),
    }
