#!/usr/bin/env python3
"""Generate public/geo/country-points.json — a label point for every country.

Why this exists
---------------
The choropleth is drawn from a 110m world, which has polygons for 175
countries. A city-state has no area at that resolution, so Singapore, Hong Kong
and Bahrain simply could not be drawn — real traffic had to be reported in a
footnote instead of on the map.

Raising the polygon resolution is the obvious fix and the wrong one: the 50m
world is 3.1 MB and the 10m world 13.3 MB, versus 173 KB today, and Singapore
is still a speck at world zoom. What actually helps is a *dot* — so this emits
one hand-placed label point per country (~6 KB), and the map draws a marker for
anything it cannot shade.

Sources, in priority order (all Natural Earth, public domain):
  1. ne_50m_admin_0_countries      — 242 sovereign states and territories
  2. ne_50m_admin_0_tiny_countries — POINT features for micro-states
  3. ne_50m_admin_0_map_units      — splits France etc. into its overseas
                                     departments, which is the only place
                                     Réunion, Mayotte and French Guiana appear
  4. ne_10m_admin_0_countries      — has UM
  5. ne_10m_admin_0_map_units      — has BV

Coverage, verified against the canonical ISO 3166-1 list (249 assigned codes):
247 render as a shaded area or a marker, and the remaining two are added by
sources 4 and 5 — so every assigned country code has somewhere to go, whether
or not it has ever appeared in our traffic. XK (Kosovo) is carried too: it is
user-assigned rather than ISO-official, but Cloudflare emits it.

LABEL_X / LABEL_Y are cartographer-placed label anchors, not computed
centroids, so they sit somewhere sensible rather than in the sea off a
crescent-shaped country.

Only ISO fields are read. FIPS-10 reuses two-letter codes for entirely
different places — its CQ is the Northern Marianas while ISO's CQ is Sark —
so accepting a FIPS match would silently plot a country on the wrong continent.
"""
import json, os, subprocess, sys

BASE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
        "master/geojson")
SOURCES = [
    "ne_50m_admin_0_countries",
    "ne_50m_admin_0_tiny_countries",
    "ne_50m_admin_0_map_units",
    # The 10m pair is 27 MB and is downloaded only to resolve the last two
    # codes -- Bouvet Island and the U.S. Minor Outlying Islands, both
    # uninhabited and absent from every 50m file. It is a build-time cost
    # only; the emitted JSON stays ~5 KB. Cached in /tmp between runs.
    "ne_10m_admin_0_countries",
    "ne_10m_admin_0_map_units",
]
ISO_FIELDS = ("ISO_A2_EH", "ISO_A2", "WB_A2")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/country-points.json"
CACHE = "/tmp"


def fetch(name):
    p = os.path.join(CACHE, name + ".geojson")
    if not os.path.exists(p):
        subprocess.run(["curl", "-4", "-sL", "--max-time", "300", "-o", p,
                        f"{BASE}/{name}.geojson"], check=True)
    return p


def iso2(props):
    for k in ISO_FIELDS:
        v = str(props.get(k) or "").strip().upper()
        # Natural Earth writes "-99" for unrecognised entries and "CN-TW" for
        # Taiwan, so require a clean two-letter alphabetic code.
        if len(v) == 2 and v.isalpha():
            return v
    return None


points = {}
for name in SOURCES:
    data = json.load(open(fetch(name)))
    added = 0
    for ft in data["features"]:
        p = ft["properties"]
        code = iso2(p)
        if not code or code in points:
            continue  # earlier source wins
        lx, ly = p.get("LABEL_X"), p.get("LABEL_Y")
        if lx is None or ly is None:
            continue
        points[code] = [round(float(lx), 3), round(float(ly), 3)]
        added += 1
    print(f"  {name}: +{added} (total {len(points)})")

payload = dict(sorted(points.items()))
with open(OUT, "w") as fh:
    json.dump(payload, fh, separators=(",", ":"), ensure_ascii=False)

print(f"\nwrote {OUT}: {len(payload)} countries, {os.path.getsize(OUT)} bytes")
for c in ("SG", "HK", "BH", "RE", "YT", "GF", "UM", "BV", "XK", "ID", "US"):
    print(f"  {c} -> {payload.get(c)}")
