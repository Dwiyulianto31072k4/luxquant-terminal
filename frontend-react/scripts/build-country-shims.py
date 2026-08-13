"""Emit country-shims.json — a small polygon for every country the 110m world
cannot draw.

A marker was the cheap answer and it looked like one: a circle floating on a
map of shapes reads as an annotation, not as a country. So instead of pointing
AT the place, give it an area — a small square centred on its label point,
which the choropleth then shades exactly like any other country. One visual
language, one code path, no scatter series.

Why a square and not the real coastline: the real coastline is the problem.
Singapore at world zoom is under a pixel; drawing it accurately means drawing
nothing. The square is deliberately larger than life so the country can be
seen and clicked, which is the entire purpose of putting it on the map.

The shims are NOT merged into the base map file. A grey square sitting in the
ocean for every micro-state we have never heard from would be debris; the panel
registers only the shims it actually needs, per dataset.
"""
import json, math, os, sys

POINTS = sys.argv[1] if len(sys.argv) > 1 else "public/geo/country-points.json"
WORLD = sys.argv[2] if len(sys.argv) > 2 else "public/geo/world-iso2.json"
OUT = sys.argv[3] if len(sys.argv) > 3 else "public/geo/country-shims.json"

points = json.load(open(POINTS))
world = json.load(open(WORLD))
have = {f["properties"]["name"] for f in world["features"]}
labels = {f["properties"]["name"]: f["properties"].get("label")
          for f in world["features"]}

# Half-width in degrees of longitude. At the panel's zoom the world is roughly
# 2 px per degree, so 1.6 gives a ~6 px block: big enough to see and hover,
# small enough not to swamp its neighbours.
HALF = 1.6

try:
    import subprocess
    out = subprocess.run(
        ["node", "-e",
         'const r=new Intl.DisplayNames(["en"],{type:"region"});'
         'console.log(JSON.stringify(Object.fromEntries('
         'process.argv[1].split(",").map(c=>[c,r.of(c)]))));',
         ",".join(sorted(points))],
        capture_output=True, text=True, check=True)
    names = json.loads(out.stdout)
except Exception as e:  # node missing -> fall back to the bare code
    print("  (no node, using codes as labels: %s)" % e)
    names = {}

features = []
for code, (lon, lat) in sorted(points.items()):
    if code in have:
        continue  # a real coastline already exists
    # Longitude degrees shrink towards the poles; widening them keeps the
    # block looking square instead of a sliver at Svalbard's latitude.
    stretch = 1.0 / max(math.cos(math.radians(lat)), 0.2)
    dx, dy = HALF * stretch, HALF
    features.append({
        "type": "Feature",
        "properties": {
            "name": code,
            "label": names.get(code) or code,
            "shim": True,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [round(lon - dx, 3), round(lat - dy, 3)],
                [round(lon + dx, 3), round(lat - dy, 3)],
                [round(lon + dx, 3), round(lat + dy, 3)],
                [round(lon - dx, 3), round(lat + dy, 3)],
                [round(lon - dx, 3), round(lat - dy, 3)],
            ]]
        },
    })

json.dump({"type": "FeatureCollection", "features": features},
          open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)

print("real polygons      : %d" % len(have))
print("shim polygons      : %d" % len(features))
print("total drawable     : %d" % (len(have) + len(features)))
print("wrote %s (%d bytes)" % (OUT, os.path.getsize(OUT)))
for c in ("SG", "HK", "BH", "MT", "MC"):
    f = next((x for x in features if x["properties"]["name"] == c), None)
    if f:
        ring = f["geometry"]["coordinates"][0]
        print("  %s %-22s x %.2f..%.2f  y %.2f..%.2f"
              % (c, f["properties"]["label"], ring[0][0], ring[1][0], ring[0][1], ring[2][1]))
