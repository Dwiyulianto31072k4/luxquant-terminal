#!/usr/bin/env python3
"""Read Cloudflare 5xx/522 counts for luxquant.tw.

Needs Zone → Analytics → Read on the API token in /root/.cloudflare_env.
The current token can GET the zone but GraphQL/analytics return 401/403
until that permission is added in the Cloudflare dash (not in this repo).

Exit: 0 = query ok or permission missing (printed, not a deploy failure)
      2 = 522s seen in the window
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone, timedelta

ENV_FILE = "/root/.cloudflare_env"
GQL = "https://api.cloudflare.com/client/v4/graphql"


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


def gql(token: str, query: str, variables: dict) -> dict:
    # Token is IP-allowlisted to the VPS IPv4. urllib may dial IPv6 → 401.
    import subprocess

    payload = json.dumps({"query": query, "variables": variables})
    p = subprocess.run(
        [
            "curl",
            "-4",
            "-sS",
            "-m",
            "20",
            "-X",
            "POST",
            GQL,
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "--data",
            payload,
        ],
        capture_output=True,
        text=True,
        timeout=25,
    )
    body = p.stdout or p.stderr or ""
    try:
        parsed = json.loads(body) if body else {}
    except json.JSONDecodeError:
        parsed = {"raw": body[:500], "_http": p.returncode}
        return parsed
    if p.returncode != 0 and not parsed.get("data"):
        parsed["_http"] = p.returncode
    return parsed


QUERY_STATUS = """
query ($zone: String!, $since: Time!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1hGroups(
        limit: 24
        filter: { datetime_geq: $since }
        orderBy: [datetime_DESC]
      ) {
        dimensions { datetime }
        sum {
          requests
          responseStatusMap {
            edgeResponseStatus
            requests
          }
        }
      }
    }
  }
}
"""

QUERY_ADAPTIVE_522 = """
query ($zone: String!, $since: Time!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequestsAdaptiveGroups(
        limit: 50
        filter: {
          datetime_geq: $since
          AND: [{ edgeResponseStatus_geq: 520 }, { edgeResponseStatus_leq: 530 }]
        }
      ) {
        count
        dimensions { edgeResponseStatus coloCode }
      }
    }
  }
}
"""


def permission_hint(payload: dict) -> bool:
    """True if this looks like missing Analytics:Read."""
    if payload.get("_http") in (401, 403):
        return True
    for err in payload.get("errors") or []:
        msg = str(err.get("message") or "").lower()
        if "auth" in msg or "permission" in msg or "not allowed" in msg:
            return True
    return False


def print_token_howto():
    print("   ⚠️  Cloudflare Analytics API: token has no Analytics:Read")
    print("   Edit token (dash, not this repo):")
    print("     1. https://dash.cloudflare.com/profile/api-tokens")
    print("     2. Edit the token stored in /root/.cloudflare_env")
    print("     3. Permissions — add:")
    print("          Zone · Analytics · Read")
    print("          Zone · Cache Purge · Purge   (for ./deploy.sh purge-url)")
    print("        Zone resources: Include · luxquant.tw only")
    print("     4. Save. If Cloudflare issues a NEW token string, replace")
    print("        CF_API_TOKEN in /root/.cloudflare_env (keep CF_ZONE_ID).")
    print("   Until then, 522s are visible only in the dash:")
    print("     luxquant.tw → Analytics & Logs → Traffic")
    print("     (Free plan: totals. Edge-status filter is Pro+ in the UI;")
    print("      GraphQL can still return 522 after Analytics:Read is added.)")


def main() -> int:
    token, zone = load_env()
    if not token or not zone:
        print("   ⚠️  No CF_API_TOKEN/CF_ZONE_ID in /root/.cloudflare_env")
        return 0
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    payload = gql(token, QUERY_STATUS, {"zone": zone, "since": since})
    if permission_hint(payload):
        print_token_howto()
        return 0
    if payload.get("errors"):
        print("   ⚠️  GraphQL error:", json.dumps(payload.get("errors"))[:400])
        # Adaptive fallback (often richer on 522 + colo)
        payload = gql(token, QUERY_ADAPTIVE_522, {"zone": zone, "since": since})
        if permission_hint(payload):
            print_token_howto()
            return 0
        if payload.get("errors"):
            print("   ⚠️  Adaptive query also failed:", json.dumps(payload.get("errors"))[:400])
            return 0
        rows = ((payload.get("data") or {}).get("viewer") or {}).get("zones") or []
        groups = rows[0].get("httpRequestsAdaptiveGroups") if rows else []
        total = 0
        by = {}
        for g in groups or []:
            n = int(g.get("count") or 0)
            total += n
            dim = g.get("dimensions") or {}
            key = f"{dim.get('edgeResponseStatus')}/{dim.get('coloCode')}"
            by[key] = by.get(key, 0) + n
        print(f"   → Cloudflare 52x last 24h (adaptive): {total}")
        for k, n in sorted(by.items(), key=lambda x: -x[1])[:12]:
            print(f"      {k}: {n}")
        return 2 if total else 0

    zones = ((payload.get("data") or {}).get("viewer") or {}).get("zones") or []
    groups = zones[0].get("httpRequests1hGroups") if zones else []
    by_status = {}
    req_sum = 0
    for g in groups or []:
        s = (g.get("sum") or {})
        req_sum += int(s.get("requests") or 0)
        for m in s.get("responseStatusMap") or []:
            st = str(m.get("edgeResponseStatus"))
            by_status[st] = by_status.get(st, 0) + int(m.get("requests") or 0)
    print(f"   → Cloudflare HTTP last 24h: {req_sum} requests")
    interesting = {k: v for k, v in by_status.items() if k.startswith("5") or k == "522"}
    if not interesting:
        print("   → no 5xx in GraphQL status map (window 24h)")
        return 0
    for k, v in sorted(interesting.items()):
        print(f"      HTTP {k}: {v}")
    return 2 if by_status.get("522") else 0


if __name__ == "__main__":
    sys.exit(main())
