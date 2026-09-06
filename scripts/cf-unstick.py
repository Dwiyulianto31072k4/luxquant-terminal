#!/usr/bin/env python3
"""Unstick Cloudflare cache keys that 522 at a colo while origin is 200.

Andika-class: SIN holds a hashed /assets/ URL as failed; reload does not help.
This reads GraphQL Adaptive (522 × path × colo), checks origin, purges THAT
URL only. Never purge_everything. Never salt.

API 522s are skipped — those are SIN→origin path, not a cache locker.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

ENV_FILE = "/root/.cloudflare_env"
PUBLIC = "https://luxquant.tw"
COOLDOWN_PATH = Path("/var/lib/luxquant/cf-unstick-cooldown.json")
LOG_PATH = Path("/var/log/luxquant-unstick.jsonl")
WINDOW_MIN = int(os.environ.get("LQ_UNSTICK_WINDOW", "40"))
MIN_COUNT = int(os.environ.get("LQ_UNSTICK_MIN", "5"))
MAX_PURGE = 8
COOLDOWN_SEC = 20 * 60


def load_env():
    vals = dict(os.environ)
    if os.path.isfile(ENV_FILE):
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip("\"'")
    return vals.get("CF_API_TOKEN", ""), vals.get("CF_ZONE_ID", "")


def curl4(args, timeout=20):
    p = subprocess.run(
        ["curl", "-4", "-sS", "-m", str(timeout), *args],
        capture_output=True,
        text=True,
        timeout=timeout + 6,
    )
    return p.returncode, p.stdout or "", p.stderr or ""


def gql(token, query, variables):
    rc, out, err = curl4(
        [
            "-X",
            "POST",
            "https://api.cloudflare.com/client/v4/graphql",
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "--data",
            json.dumps({"query": query, "variables": variables}),
        ],
        timeout=25,
    )
    try:
        return json.loads(out) if out else {"errors": [{"message": err or "empty"}]}
    except json.JSONDecodeError:
        return {"errors": [{"message": (out or err)[:200]}]}


def purgeable(path: str) -> bool:
    if not path or not path.startswith("/"):
        return False
    if path.startswith("/api/") or path.startswith("/cryptobot/") or path.startswith("/ws/"):
        return False
    if path.startswith("/assets/"):
        return True
    if path in ("/", "/index.html", "/build.json"):
        return True
    if path.endswith(".html") or path.endswith(".js") or path.endswith(".css"):
        return True
    return False


def origin_ok(path: str) -> bool:
    url = "http://127.0.0.1" + (path if path != "/" else "/")
    rc, out, _ = curl4(
        ["-o", "/dev/null", "-w", "%{http_code}", "-H", "Host: luxquant.tw", url],
        timeout=12,
    )
    return out.strip() == "200"


def load_cooldown():
    try:
        return json.loads(COOLDOWN_PATH.read_text())
    except Exception:
        return {}


def save_cooldown(d):
    COOLDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
    cut = time.time() - COOLDOWN_SEC * 3
    d = {k: v for k, v in d.items() if float(v) > cut}
    COOLDOWN_PATH.write_text(json.dumps(d))


def log_event(obj):
    obj = dict(obj)
    obj["ts"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(obj) + "\n")


def purge_files(token, zone, urls):
    rc, out, err = curl4(
        [
            "-X",
            "POST",
            f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "--data",
            json.dumps({"files": urls}),
        ],
        timeout=20,
    )
    try:
        payload = json.loads(out) if out else {}
    except json.JSONDecodeError:
        payload = {"success": False, "raw": (out or err)[:300]}
    return bool(payload.get("success")), payload


QUERY = """
query ($zone: String!, $since: Time!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequestsAdaptiveGroups(
        limit: 50
        filter: { datetime_geq: $since, edgeResponseStatus: 522 }
        orderBy: [count_DESC]
      ) {
        count
        dimensions { coloCode clientRequestPath }
      }
    }
  }
}
"""


def main() -> int:
    token, zone = load_env()
    if not token or not zone:
        print("unstick: no CF token")
        return 0
    since = (datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MIN)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    payload = gql(token, QUERY, {"zone": zone, "since": since})
    if payload.get("errors"):
        print("unstick: graphql", json.dumps(payload.get("errors"))[:240])
        return 0
    zones = ((payload.get("data") or {}).get("viewer") or {}).get("zones") or []
    groups = zones[0].get("httpRequestsAdaptiveGroups") if zones else []
    snapshot = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_min": WINDOW_MIN,
        "hotspots": [
            {
                "count": int(g.get("count") or 0),
                "colo": (g.get("dimensions") or {}).get("coloCode"),
                "path": (g.get("dimensions") or {}).get("clientRequestPath"),
                "purgeable": purgeable((g.get("dimensions") or {}).get("clientRequestPath") or ""),
            }
            for g in (groups or [])[:30]
        ],
    }
    snap_path = Path("/var/lib/luxquant/cf-sin-snapshot.json")
    snap_path.parent.mkdir(parents=True, exist_ok=True)
    snap_path.write_text(json.dumps(snapshot))
    cool = load_cooldown()
    now = time.time()
    candidates = []
    for g in groups or []:
        dim = g.get("dimensions") or {}
        path = dim.get("clientRequestPath") or ""
        colo = dim.get("coloCode") or ""
        count = int(g.get("count") or 0)
        if count < MIN_COUNT or not purgeable(path):
            continue
        key = f"{colo}:{path}"
        if now - float(cool.get(key, 0)) < COOLDOWN_SEC:
            continue
        candidates.append((count, colo, path, key))
    candidates.sort(reverse=True)
    to_purge = []
    meta = []
    for count, colo, path, key in candidates[:MAX_PURGE]:
        if not origin_ok(path):
            log_event(
                {
                    "action": "skip-origin",
                    "path": path,
                    "colo": colo,
                    "count": count,
                }
            )
            print(f"unstick skip origin-not-200 {colo} {path} n={count}")
            continue
        url = PUBLIC + quote(path, safe="/-._~")
        if path == "/":
            url = PUBLIC + "/"
        to_purge.append(url)
        meta.append((count, colo, path, key, url))
    if not to_purge:
        print("unstick: nothing to purge")
        return 0
    ok, resp = purge_files(token, zone, to_purge)
    for count, colo, path, key, url in meta:
        log_event(
            {
                "action": "purge",
                "ok": ok,
                "path": path,
                "colo": colo,
                "count": count,
                "url": url,
            }
        )
        if ok:
            cool[key] = now
        print(f"unstick {'OK' if ok else 'FAIL'} {colo} n={count} {path}")
    save_cooldown(cool)
    if not ok:
        print("unstick purge API:", json.dumps(resp)[:400])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
