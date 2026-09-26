"""Browser crash reports reach the server, once per kind of crash.

Until 26 Sep 2026 the error boundary only wrote to the visitor's console; the
coin-modal crash was found from a user's screenshot.
"""
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import client_errors as ce


class FakePipe:
    def __init__(self, r):
        self.r, self.ops = r, []

    def __getattr__(self, name):
        def queue(*a, **k):
            self.ops.append((name, a, k))
            return self
        return queue

    def execute(self):
        return [getattr(self.r, name)(*a, **k) for name, a, k in self.ops]


class FakeRedis:
    def __init__(self):
        self.z, self.lists, self.kv = {}, {}, {}

    def pipeline(self):
        return FakePipe(self)

    def zremrangebyscore(self, key, lo, hi):
        z = self.z.setdefault(key, {})
        for m in [m for m, s in z.items() if lo <= s <= hi]:
            del z[m]

    def zcard(self, key):
        return len(self.z.get(key, {}))

    def zadd(self, key, mapping):
        self.z.setdefault(key, {}).update(mapping)

    def expire(self, *a):
        return True

    def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, value)

    def ltrim(self, key, start, stop):
        self.lists[key] = self.lists.get(key, [])[start: stop + 1]

    def lrange(self, key, start, stop):
        return self.lists.get(key, [])[start: stop + 1]

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.kv:
            return None
        self.kv[key] = value
        return True

    def incr(self, key):
        self.kv[key] = int(self.kv.get(key, 0)) + 1
        return self.kv[key]


def _client(monkeypatch):
    fake = FakeRedis()
    alerts = []
    monkeypatch.setattr(ce, "get_redis", lambda: fake)
    monkeypatch.setattr(ce, "_alert_admins", lambda report: alerts.append(report["fp"]))
    app = FastAPI()
    app.include_router(ce.router)
    app.dependency_overrides[deps.get_admin_user] = lambda: object()
    return TestClient(app), fake, alerts


V8 = (
    "TypeError: Cannot read properties of undefined (reading 'toFixed')\n"
    "    at SignalModal (https://luxquant.tw/assets/SignalModal-{h}.js:1:{c})\n"
    "    at Lh (https://luxquant.tw/assets/vendor-react-{h}.js:30:{c})\n"
)


def test_same_crash_same_print_across_deploys_and_origins():
    a = ce.fingerprint("boundary", "x", V8.format(h="Ab12Cd34", c=2345))
    b = ce.fingerprint("boundary", "x", V8.format(h="Zz98_y-7", c=9981).replace(
        "https://luxquant.tw", "http://localhost:5173"))
    assert a == b
    assert a != ce.fingerprint("boundary", "y", V8.format(h="Ab12Cd34", c=2345))
    assert a != ce.fingerprint("error", "x", V8.format(h="Ab12Cd34", c=2345))


def test_firefox_frames_count_too():
    ff = "SignalModal@https://luxquant.tw/assets/SignalModal-Ab12Cd34.js:1:2345\n"
    assert ce._frames(ff) == [ff.strip()]


def test_admin_dm_never_shows_a_reported_origin():
    assert ce._page("https://evil.example/phish?x=1") == "/phish?x=1"
    assert ce._page(None) == "unknown page"


def test_report_is_kept_and_a_new_boundary_crash_alerts_once(monkeypatch):
    client, fake, alerts = _client(monkeypatch)
    body = {"kind": "boundary", "message": "boom", "stack": V8.format(h="Ab12Cd34", c=1),
            "url": "https://luxquant.tw/signals", "build": "b1"}
    assert client.post("/api/v1/client-errors", json=body).status_code == 204
    assert client.post("/api/v1/client-errors", json=body).status_code == 204
    stored = [json.loads(x) for x in fake.lists[ce.LIST_KEY]]
    assert len(stored) == 2 and stored[0]["message"] == "boom"
    assert len(alerts) == 1

    # Stray window errors are kept but never page anyone.
    client.post("/api/v1/client-errors", json={**body, "kind": "error", "message": "other"})
    assert len(alerts) == 1

    listing = client.get("/api/v1/admin/client-errors").json()
    assert listing["total_reports"] == 3
    boom = next(g for g in listing["groups"] if g["message"] == "boom")
    assert boom["count"] == 2 and boom["urls"] == ["https://luxquant.tw/signals"]


def test_alerts_are_capped_per_hour(monkeypatch):
    client, _, alerts = _client(monkeypatch)
    for i in range(ce.ALERTS_PER_HOUR + 2):
        client.post("/api/v1/client-errors", json={"kind": "boundary", "message": f"crash {i}"},
                    headers={"cf-connecting-ip": f"10.0.0.{i}"})
    assert len(alerts) == ce.ALERTS_PER_HOUR


def test_one_browser_cannot_flood(monkeypatch):
    client, fake, _ = _client(monkeypatch)
    codes = [
        client.post("/api/v1/client-errors", json={"message": f"m{i}"},
                    headers={"cf-connecting-ip": "1.2.3.4"}).status_code
        for i in range(ce.PER_IP_PER_MIN + 3)
    ]
    assert codes.count(204) == ce.PER_IP_PER_MIN
    assert codes[-1] == 429
    assert len(fake.lists[ce.LIST_KEY]) == ce.PER_IP_PER_MIN


def test_oversized_fields_are_refused(monkeypatch):
    client, _, _ = _client(monkeypatch)
    assert client.post("/api/v1/client-errors", json={"message": "x" * 5000}).status_code == 422


def test_redis_down_still_answers(monkeypatch):
    client, _, _ = _client(monkeypatch)

    def down():
        raise ConnectionError("redis down")

    monkeypatch.setattr(ce, "get_redis", down)
    assert client.post("/api/v1/client-errors", json={"message": "m"}).status_code == 204


# ── CSP violation reports (report-only rollout, 2026-09-26) ──────────────

class CspRedis(FakeRedis):
    def __init__(self):
        super().__init__()
        self.h = {}

    def hincrby(self, key, field, n):
        self.h.setdefault(key, {})
        self.h[key][field] = self.h[key].get(field, 0) + n

    def hgetall(self, key):
        return dict(self.h.get(key, {}))


def _csp_client(monkeypatch):
    fake = CspRedis()
    monkeypatch.setattr(ce, "get_redis", lambda: fake)
    app = FastAPI()
    app.include_router(ce.router)
    app.dependency_overrides[deps.get_admin_user] = lambda: object()
    return TestClient(app), fake


def test_both_report_formats_are_counted_by_directive_and_origin(monkeypatch):
    client, fake = _csp_client(monkeypatch)
    legacy = {"csp-report": {"effective-directive": "script-src-elem",
                             "blocked-uri": "https://s3.tradingview.com/tv.js?x=1",
                             "document-uri": "https://luxquant.tw/signals?signal=1"}}
    modern = [{"type": "csp-violation", "body": {"effectiveDirective": "script-src-elem",
                                                  "blockedURL": "https://s3.tradingview.com/other.js",
                                                  "documentURL": "https://luxquant.tw/"}}]
    for body, ctype in ((legacy, "application/csp-report"), (modern, "application/reports+json")):
        r = client.post("/api/v1/csp-report", content=json.dumps(body), headers={"content-type": ctype})
        assert r.status_code == 204
    assert fake.h[ce.CSP_COUNTS_KEY] == {"script-src-elem https://s3.tradingview.com": 2}
    listing = client.get("/api/v1/admin/csp-report").json()
    assert listing["buckets"][0] == {"bucket": "script-src-elem https://s3.tradingview.com", "count": 2}
    assert listing["recent"][0]["page"] == "/"


def test_inline_and_garbage_reports(monkeypatch):
    client, fake = _csp_client(monkeypatch)
    inline = {"csp-report": {"effective-directive": "script-src-elem", "blocked-uri": "inline"}}
    client.post("/api/v1/csp-report", content=json.dumps(inline))
    assert client.post("/api/v1/csp-report", content=b"not json").status_code == 204
    assert fake.h[ce.CSP_COUNTS_KEY] == {"script-src-elem inline": 1}
