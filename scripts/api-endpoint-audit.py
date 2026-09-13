"""
Walk every GET route in the app and call it, with auth stubbed.

    ssh luxquant-vps
    cd /root/luxquant-terminal/backend && set -a && . ./.env && set +a
    ./venv/bin/python /root/luxquant-terminal/scripts/api-endpoint-audit.py

Read-only: GET only, never POST/PUT/PATCH/DELETE. It runs the real handlers
against the real database, which is the only way to catch the class of bug that
put four endpoints at a permanent 500 — a route calling another route's
function directly, so FastAPI's Query()/Depends() defaults arrive as objects
instead of values. Nothing static finds that; you have to execute the line.
"""
import asyncio, sys, warnings
warnings.filterwarnings("ignore")

sys.path.insert(0, "/root/luxquant-terminal/backend")
import httpx  # noqa: E402
from app.main import app  # noqa: E402
from app.api import deps as _deps  # noqa: E402
from app.api import deps_public as _deps_public  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.http_client import init_clients  # noqa: E402
from app.models.user import User  # noqa: E402

# A real subscriber from the database: the point is to exercise the paid path,
# and a hand-made object would not carry the relationships handlers walk.
db = SessionLocal()
user = (
    db.query(User)
    .filter(User.is_active == True)  # noqa: E712
    .order_by(User.id.asc())
    .all()
)
user = next((u for u in user if getattr(u, "has_active_access", False)), None)
if user is None:
    print("!! no active subscriber found — cannot exercise paid routes")
    sys.exit(2)
print(f"acting as user id={user.id} role={getattr(user, 'role', '?')}\n")

for dep in (
    getattr(_deps, "get_current_user", None),
    getattr(_deps, "get_current_user_optional", None),
    getattr(_deps, "require_subscription", None),
    getattr(_deps, "get_admin_user", None),
    getattr(_deps_public, "get_api_key_user", None),
):
    if dep is not None:
        app.dependency_overrides[dep] = lambda: user

SAMPLES = {
    "pair": "BTCUSDT", "symbol": "BTC", "coin": "BTC", "base": "BTC",
    "signal_id": "1", "user_id": str(user.id), "id": "1",
    "date": "2026-09-12", "day": "2026-09-12", "slug": "bitcoin",
    "period": "7d", "tf": "4h", "timeframe": "4h", "key": "btc",
    "category": "layer-1", "name": "bitcoin", "provider": "binance",
}

rows, skipped = [], []
targets = []
for r in app.routes:
    methods = getattr(r, "methods", set()) or set()
    path = getattr(r, "path", "")
    if "GET" not in methods or not path.startswith("/api"):
        continue
    url, missing = path, []
    while "{" in url:
        a = url.index("{"); b = url.index("}", a)
        raw = url[a + 1 : b]
        nm = raw.split(":")[0]
        if nm not in SAMPLES:
            missing.append(nm)
            break
        url = url[:a] + SAMPLES[nm] + url[b + 1 :]
    if missing:
        skipped.append((path, missing[0]))
        continue
    targets.append((path, url))


# THIS SWEEP SHARES A DATABASE WITH LIVE TRAFFIC.
#
# Run back to back on 2026-09-13 it exhausted the connection pool and took a
# paying partner's API down with it: 19 requests answered 500 inside a 56-second
# window, all of them ours to own. It also poisons its own result — the tail of
# a starved sweep reports 500s that answer 200 when called alone, which is how
# three healthy admin routes briefly looked broken.
#
# So it paces itself. PAUSE is not politeness, it is the difference between an
# audit and an outage. Raise it, never lower it, and if something looks broken
# here, call it on its own before believing the sweep.
PAUSE = 0.25


async def run():
    # The shared HTTP clients are created in the app lifespan, which an ASGI
    # transport does not run — without this every Binance-backed route answers
    # 502 "HTTP clients not initialized" and the audit reports a fault that only
    # exists in the harness. The rest of the lifespan is deliberately NOT run:
    # it does idempotent DDL on `users`, and taking an ACCESS EXCLUSIVE lock on
    # a live table to test read endpoints is not a trade worth making.
    init_clients()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        for path, url in targets:
            try:
                resp = await c.get(url, timeout=90)
                code = resp.status_code
                body = resp.text[:200].replace("\n", " ")
            except Exception as exc:
                code, body = "EXC", f"{type(exc).__name__}: {exc}"
            rows.append((code, path, url, body))
            await asyncio.sleep(PAUSE)


asyncio.run(run())

bad = [r for r in rows if r[0] == "EXC" or (isinstance(r[0], int) and r[0] >= 500)]
warn = [r for r in rows if isinstance(r[0], int) and 400 <= r[0] < 500]
ok = [r for r in rows if isinstance(r[0], int) and r[0] < 400]

print(f"GET routes exercised : {len(rows)}   (paced at {PAUSE}s — see the note above)")
print(f"  2xx/3xx            : {len(ok)}")
print(f"  4xx                : {len(warn)}")
print(f"  5xx / exception    : {len(bad)}")
print(f"  skipped (path arg) : {len(skipped)}\n")

if bad:
    print("=" * 78)
    print("BROKEN")
    print("=" * 78)
    for code, path, url, body in sorted(bad, key=lambda x: str(x[1])):
        print(f"\n{code}  {path}")
        print(f"      {body}")
if warn:
    print("\n" + "=" * 78)
    print("4xx (may be correct — auth, validation, or genuinely absent data)")
    print("=" * 78)
    for code, path, url, body in sorted(warn, key=lambda x: str(x[1])):
        print(f"{code}  {path:<58} {body[:70]}")
if skipped:
    print("\nskipped, unknown path parameter:")
    for path, nm in skipped:
        print(f"      {path}   (no sample for {{{nm}}})")
