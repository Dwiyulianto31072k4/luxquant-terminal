"""Regression tests for the BTC Compass data-quality foundation."""

from __future__ import annotations

import asyncio
import json

from app.services import coinank_fetch
from app.services.coinank_fetch import HeatmapFetchResult
from app.services.heatmap_payload import (
    describe_payload_shape,
    find_liq_heatmap_record,
    has_usable_liq_heatmap_data,
)
from app.services.liquidity_engine import evaluate_liquidity, parse_liq_heatmap
from app.services.verdict_schema import (
    CycleBrief,
    HorizonVerdict,
    LayerBrief,
    RiskScenario,
    SelfCritique,
    TripleScreenItem,
)


def _sample_record() -> dict:
    return {
        "tickSize": 100,
        "liqHeatMap": {
            "priceArray": [90_000, 95_000, 100_000, 105_000, 110_000],
            "data": [
                [0, 0, 2],
                [0, 1, 3],
                [0, 3, 8],
                [0, 4, 4],
            ],
            "maxLiqValue": 8,
        },
    }


def test_nested_and_json_encoded_heatmap_is_discovered():
    raw = {"data": {"items": [json.dumps(_sample_record())]}}

    record = find_liq_heatmap_record(raw)

    assert record is not None
    assert record["liqHeatMap"]["maxLiqValue"] == 8
    assert describe_payload_shape(raw) == {"type": "object", "keys": ["data"]}


def test_empty_heatmap_is_not_cache_eligible():
    record = {"liqHeatMap": {"priceArray": [], "data": []}}

    assert find_liq_heatmap_record(record) is not None
    assert has_usable_liq_heatmap_data(record) is False


def test_liquidity_parser_accepts_wrapped_payload():
    raw = {"result": {"datasetItems": [_sample_record()]}}

    parsed = parse_liq_heatmap(raw, current_price=100_000)
    verdict = evaluate_liquidity(parsed)

    assert parsed is not None
    assert parsed["dominance_up"] > 0.5
    assert parsed["nearest_above"]["price"] == 105_000
    assert verdict.metrics


def test_missing_liquidity_is_unavailable_not_evidence():
    verdict = evaluate_liquidity(None)

    assert verdict.verdict == "NEUTRAL"
    assert verdict.metrics[0].available is False


def test_missing_token_returns_explicit_unavailable(monkeypatch):
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.setattr(coinank_fetch, "_load_last_good", lambda *_: None)

    result = asyncio.run(coinank_fetch.fetch_coinank_heatmap())

    assert isinstance(result, HeatmapFetchResult)
    assert result.status == "unavailable"
    assert result.available is False
    assert result.reason == "missing_apify_token"


def test_recent_last_good_payload_is_marked_stale(monkeypatch):
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.setattr(
        coinank_fetch,
        "_load_last_good",
        lambda *_: ([_sample_record()], 120.0, "2026-06-14T00:00:00+00:00"),
    )

    result = asyncio.run(coinank_fetch.fetch_coinank_heatmap())

    assert result.status == "stale"
    assert result.available is True
    assert result.age_seconds == 120.0
    assert result.reason == "missing_apify_token"


def test_fresh_fetch_uses_auth_header_and_caches_payload(monkeypatch):
    calls = []
    cached = []

    class FakeResponse:
        status_code = 201

        @staticmethod
        def json():
            return [_sample_record()]

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return FakeResponse()

    monkeypatch.setenv("APIFY_TOKEN", "secret-token")
    monkeypatch.setattr(coinank_fetch.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        coinank_fetch,
        "_save_last_good",
        lambda payload, epoch: cached.append((payload, epoch)),
    )

    result = asyncio.run(coinank_fetch.fetch_coinank_heatmap())

    assert result.status == "fresh"
    assert result.attempts == 1
    assert calls[0][0] == coinank_fetch.APIFY_RUN_SYNC_URL
    assert calls[0][1]["headers"] == {"Authorization": "Bearer secret-token"}
    assert "params" not in calls[0][1]
    assert cached and cached[0][0] == [_sample_record()]


def test_invalid_provider_shape_uses_recent_last_good(monkeypatch):
    class FakeResponse:
        status_code = 201

        @staticmethod
        def json():
            return [{"status": "SUCCEEDED", "data": []}]

    class FakeClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setenv("APIFY_TOKEN", "secret-token")
    monkeypatch.setattr(coinank_fetch.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        coinank_fetch,
        "_load_last_good",
        lambda *_: ([_sample_record()], 300.0, "2026-06-14T00:00:00+00:00"),
    )

    result = asyncio.run(coinank_fetch.fetch_coinank_heatmap())

    assert result.status == "stale"
    assert result.reason == "invalid_payload_shape"
    assert result.payload_shape == {
        "type": "array",
        "length": 1,
        "first_keys": ["data", "status"],
    }


def test_actor_upstream_error_has_stable_reason(monkeypatch):
    class FakeResponse:
        status_code = 201

        @staticmethod
        def json():
            return [{"error": "Upstream request failed with status 200: system error!"}]

    class FakeClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setenv("APIFY_TOKEN", "secret-token")
    monkeypatch.setattr(coinank_fetch.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(coinank_fetch, "_load_last_good", lambda *_: None)

    result = asyncio.run(coinank_fetch.fetch_coinank_heatmap())

    assert result.status == "unavailable"
    assert result.reason == "actor_upstream_error"
    assert result.payload_shape == {
        "type": "array",
        "length": 1,
        "first_keys": ["error"],
    }


def test_production_enum_aliases_are_normalized():
    cycle = CycleBrief(
        score=20,
        phase="bottom",
        confidence="HIGH",
        interpretation="Cycle conditions are depressed.",
    )
    screen = TripleScreenItem(
        timeframe="4h",
        state="RANGE-BOUND",
        note="Price is rotating inside a range.",
    )

    assert cycle.phase == "DEEP_BOTTOM"
    assert cycle.confidence == "high"
    assert screen.timeframe == "4H"
    assert screen.state == "RANGING"


def test_common_ai_enum_casing_is_normalized():
    layer = LayerBrief(
        layer="MACRO",
        direction="BULLISH",
        strength=0.6,
        headline="Macro conditions are improving.",
        key_points=["Point one", "Point two"],
    )
    horizon = HorizonVerdict(
        direction="BEARISH",
        confidence=55,
        rationale="Liquidity below price remains material.",
    )
    risk = RiskScenario(
        title="Macro release",
        severity="HIGH",
        threshold="Inflation surprises above consensus",
    )
    critique = SelfCritique(
        decision="APPROVED-WITH-CAVEAT",
        overall_assessment="The conclusion is usable with explicit caveats.",
    )

    assert layer.layer == "macro"
    assert layer.direction == "bullish"
    assert horizon.direction == "bearish"
    assert risk.severity == "high"
    assert critique.decision == "approved_with_caveat"
