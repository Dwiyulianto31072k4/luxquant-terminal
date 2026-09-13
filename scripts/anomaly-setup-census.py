import json, urllib.request, urllib.parse, statistics, psycopg2, re

dsn = None
for line in open("/root/luxquant-terminal/backend/.env"):
    if line.startswith("DATABASE_URL="):
        dsn = line.split("=", 1)[1].strip().strip("\"'")
conn = psycopg2.connect(dsn)
cur = conn.cursor()
cur.execute("""
    SELECT DISTINCT ON (pair) pair, market_cap, status, risk_level
    FROM signals
    WHERE created_at >= (NOW() - INTERVAL '7 days')::text
    ORDER BY pair, created_at DESC
""")
rows = cur.fetchall()
pairs = [r[0] for r in rows]
prices = {}
for i in range(0, len(pairs), 120):
    chunk = ",".join(pairs[i:i + 120])
    url = "http://127.0.0.1:8002/api/v1/market/prices?symbols=" + urllib.parse.quote(chunk)
    prices.update(json.load(urllib.request.urlopen(url, timeout=60)))

def mcap(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace("$", "").replace(",", "")
    m = re.match(r"^([0-9.]+)\s*([KMBT]?)$", s, re.I)
    if not m:
        try: return float(s)
        except Exception: return None
    n = float(m.group(1)); u = m.group(2).upper()
    return n * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[u]

pts = []
for pair, mc, status, risk in rows:
    lv = prices.get(pair); c = mcap(mc)
    if not lv or lv.get("change") is None or not lv.get("volume") or not c or c <= 0:
        continue
    pts.append({"pair": pair, "x": float(lv["change"]),
                "y": min(lv["volume"] / c * 100, 150),
                "risk": risk, "status": status})

print("pairs called 7d      :", len(rows))
print("live prices          :", len(prices))
print("points actually drawn:", len(pts))
if not pts:
    raise SystemExit

ys = sorted(p["y"] for p in pts)
xs = sorted(p["x"] for p in pts)
med = statistics.median(ys)
print()
print("turnover %%: p10=%.2f med=%.2f p90=%.2f max=%.1f" % (
    ys[len(ys)//10], med, ys[len(ys)*9//10], ys[-1]))
print("24h change: p10=%.1f med=%.1f p90=%.1f  min=%.1f max=%.1f" % (
    xs[len(xs)//10], statistics.median(xs), xs[len(xs)*9//10], xs[0], xs[-1]))

HEAVY, LIGHT, UP, DOWN = med * 3, med / 2, 5.0, -5.0
def bucket(p):
    heavy, light = p["y"] > HEAVY, p["y"] < LIGHT
    up, down = p["x"] > UP, p["x"] < DOWN
    if up and heavy:   return "breakout   (up + heavy)"
    if up and light:   return "thin pump  (up + light)"
    if down and heavy: return "capitulate (down + heavy)"
    if down and light: return "quiet bleed(down + light)"
    if heavy:          return "churn      (flat + heavy)"
    if light:          return "dormant    (flat + light)"
    return "ordinary"

c = {}
for p in pts:
    c[bucket(p)] = c.get(bucket(p), 0) + 1
print()
print("PRESET POPULATION  (heavy>%.2f%%  light<%.2f%%  up>+5%%  down<-5%%)" % (HEAVY, LIGHT))
for k in sorted(c, key=lambda k: -c[k]):
    print("  %-26s %4d  %5.1f%%" % (k, c[k], c[k] / len(pts) * 100))
hi = sum(1 for p in pts if str(p["risk"]).upper() == "HIGH")
print("  %-26s %4d  %5.1f%%" % ("risk HIGH", hi, hi / len(pts) * 100))
print("  %-26s %4d  %5.1f%%" % ("open calls", sum(p["status"] == "open" for p in pts),
                                sum(p["status"] == "open" for p in pts) / len(pts) * 100))
