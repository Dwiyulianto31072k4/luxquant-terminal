"""Regression tests for the BTC Compass data-quality foundation."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services import coinank_fetch
from app.services import binance_liquidation_validation as liq_validation
from app.services.compass_event_risk import (
    apply_event_risk_to_verdict,
    build_event_risk_snapshot,
)
from app.services.compass_evidence_matrix import build_evidence_matrix
from app.services.binance_liquidation_map import estimate_liquidation_map
from app.services.binance_liquidation_validation import (
    match_event_to_forecast,
    normalize_force_order_event,
    summarize_validation_monitor,
)
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


def _binance_model_rows():
    start = 1_750_000_000_000
    oi_rows = []
    klines = []
    taker_rows = []
    top_rows = []
    open_interest = 10_000.0
    price = 100_000.0
    for index in range(30):
        timestamp = start + index * 300_000
        if index % 4 == 0:
            open_interest += 18.0
            next_price = price * 1.002
            taker_ratio = 1.25
            top_ratio = 1.08 + index * 0.001
        elif index % 7 == 0:
            open_interest -= 10.0
            next_price = price * 0.999
            taker_ratio = 0.9
            top_ratio = 1.06
        else:
            open_interest += 5.0
            next_price = price * 1.0004
            taker_ratio = 1.05
            top_ratio = 1.07 + index * 0.0005
        oi_rows.append({
            "symbol": "BTCUSDT",
            "sumOpenInterest": str(open_interest),
            "sumOpenInterestValue": str(open_interest * next_price),
            "timestamp": timestamp,
        })
        klines.append([
            timestamp,
            str(price),
            str(max(price, next_price) * 1.001),
            str(min(price, next_price) * 0.999),
            str(next_price),
            "100",
        ])
        taker_rows.append({
            "buySellRatio": str(taker_ratio),
            "timestamp": timestamp,
        })
        top_rows.append({
            "longShortRatio": str(top_ratio),
            "timestamp": timestamp,
        })
        price = next_price
    return oi_rows, klines, taker_rows, top_rows, price


def test_binance_estimator_builds_explicit_estimated_map():
    oi_rows, klines, taker_rows, top_rows, price = _binance_model_rows()

    payload = estimate_liquidation_map(
        symbol="BTCUSDT",
        oi_rows=oi_rows,
        kline_rows=klines,
        taker_rows=taker_rows,
        top_position_rows=top_rows,
        current_price=price,
    )
    parsed = parse_liq_heatmap(payload, current_price=price)
    verdict = evaluate_liquidity(parsed)

    assert payload is not None
    assert payload["schema"] == "estimated_liquidation_map.v1"
    assert payload["provider"] == "binance_estimated_liquidation_v1"
    assert payload["model"]["label"] == "estimated_not_exchange_reported"
    assert 0.0 < payload["model_confidence"] <= 0.68
    assert payload["data_confidence"] >= payload["model_confidence"]
    assert payload["levels"]
    assert parsed is not None
    assert parsed["source"] == "binance_estimated_liquidation_v1"
    assert verdict.strength <= payload["model_confidence"]


def test_binance_estimator_rejects_insufficient_rows():
    payload = estimate_liquidation_map(
        symbol="BTCUSDT",
        oi_rows=[],
        kline_rows=[],
    )

    assert payload is None


def test_force_order_event_matches_same_side_forecast_level():
    raw = {
        "E": 1_750_000_000_000,
        "o": {
            "s": "BTCUSDT",
            "S": "SELL",
            "ap": "99520",
            "z": "0.25",
        },
    }
    event = normalize_force_order_event(raw)
    match = match_event_to_forecast(
        event,
        {
            "levels": [
                {"price": 99_500, "value": 2_000_000, "side": "long"},
                {"price": 101_000, "value": 1_000_000, "side": "short"},
            ],
        },
    )

    assert event is not None
    assert event["side"] == "long"
    assert event["notional"] == 24_880.0
    assert match["matched"] is True
    assert match["nearest_level"]["price"] == 99_500


def test_phase2_monitor_reports_health_progress_and_shadow_gate():
    now_epoch = 1_750_000_100.0
    monitor = summarize_validation_monitor(
        forecast={
            "provider": "binance_estimated_liquidation_v1",
            "generated_at": "2025-06-15T15:34:00+00:00",
            "current_price": 100_000,
            "levels": [{"price": 99_500, "value": 2_000_000, "side": "long"}],
            "model_confidence": 0.68,
            "data_confidence": 0.91,
            "confidence_label": "medium",
            "data_quality": {"coverage": 1.0},
        },
        forecast_ttl_seconds=20_000,
        stats={
            "sample_size": 12,
            "matched_events": 8,
            "event_hit_rate": 0.6667,
            "notional_hit_rate": 0.7,
            "updated_at": "2025-06-15T15:35:00+00:00",
        },
        events=[{
            "event_time_iso": "2025-06-15T15:35:00+00:00",
            "side": "long",
            "price": 99_520,
            "notional": 25_000,
            "forecast_match": {
                "matched": True,
                "distance_pct": 0.0002,
                "nearest_level": {"price": 99_500, "side": "long"},
            },
        }],
        heartbeat={
            "status": "connected",
            "updated_at": "2025-06-15T15:34:55+00:00",
            "connected_at": "2025-06-15T15:00:00+00:00",
        },
        heartbeat_ttl_seconds=80,
        now_epoch=1_750_000_100.0,
    )

    assert monitor["phase"] == 2
    assert monitor["mode"] == "shadow_validation"
    assert monitor["activation_allowed"] is False
    assert monitor["collector"]["healthy"] is True
    assert monitor["forecast"]["fresh"] is True
    assert monitor["stage"] == "collecting"
    assert monitor["validation"]["initial_progress"] == 0.6
    assert monitor["recent_window"]["matched"] == 1
    assert monitor["gates"][2]["passed"] is False


def test_liquidation_event_audit_survives_redis_flush(tmp_path, monkeypatch):
    events_file = tmp_path / "liquidation-events.jsonl"
    monkeypatch.setattr(liq_validation, "EVENTS_FILE", events_file)
    record = {
        "event_time": 1_750_000_000_000,
        "side": "long",
        "price": 99_500,
        "quantity": 0.5,
    }

    liq_validation._append_event_file(record)

    assert liq_validation._read_event_file(10) == [record]


def test_event_risk_deduplicates_news_and_flags_near_macro_event():
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    published = now - timedelta(hours=2)
    news = {
        "fetched_at": (now - timedelta(minutes=5)).isoformat(),
        "status": "fresh",
        "successful_sources": 3,
        "articles": [
            {
                "title": "Bitcoin ETF inflows accelerate - CoinDesk",
                "link": "https://example.com/one",
                "source": "CoinDesk",
                "published": published.isoformat(),
            },
            {
                "title": "Bitcoin ETF inflows accelerate - Reuters",
                "link": "https://example.com/two",
                "source": "Google News",
                "published": published.isoformat(),
            },
        ],
    }
    events = [{
        "title": "US CPI m/m",
        "country": "USD",
        "date": (now + timedelta(hours=4)).isoformat(),
        "impact": "High",
        "forecast": "0.2%",
        "previous": "0.3%",
    }]

    snapshot = build_event_risk_snapshot(
        news,
        events,
        calendar_health={
            "provider": "forexfactory",
            "status": "fresh",
            "available": True,
            "fetched_at": now.isoformat(),
            "age_seconds": 0,
            "event_count": 1,
            "covers_72h": True,
        },
        now=now,
    )

    assert snapshot["direction_authority"] is False
    assert snapshot["risk_level"] == "high"
    assert snapshot["confidence_adjustment"]["penalty_points"] == 8
    assert len(snapshot["headlines"]) == 1
    assert snapshot["upcoming_events"][0]["risk_window"] == "imminent"
    assert snapshot["windows"]["next_24h"]["high_impact_count"] == 1


def test_event_risk_only_reduces_confidence_not_direction():
    verdict = SimpleNamespace(
        tactical_24h=SimpleNamespace(direction="bullish", confidence=68),
        secondary_7d=SimpleNamespace(direction="neutral", confidence=61),
    )
    snapshot = {
        "confidence_adjustment": {
            "penalty_points": 8,
            "can_increase_confidence": False,
            "can_change_direction": False,
        },
    }

    audit = apply_event_risk_to_verdict(verdict, snapshot)

    assert verdict.tactical_24h.direction == "bullish"
    assert verdict.secondary_7d.direction == "neutral"
    assert verdict.tactical_24h.confidence == 60
    assert verdict.secondary_7d.confidence == 53
    assert audit["directions_unchanged"] is True


def test_event_risk_marks_both_sources_unavailable():
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)

    snapshot = build_event_risk_snapshot(
        {},
        [],
        calendar_health={
            "provider": "forexfactory",
            "status": "unavailable",
            "available": False,
            "fetched_at": None,
            "age_seconds": None,
            "event_count": 0,
            "covers_72h": False,
        },
        now=now,
    )

    assert snapshot["risk_level"] == "unavailable"
    assert snapshot["confidence_adjustment"]["penalty_points"] == 0
    assert snapshot["source_health"]["news"]["status"] == "unavailable"


def test_exploit_headline_is_market_stress_not_regulation():
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    snapshot = build_event_risk_snapshot(
        {
            "fetched_at": now.isoformat(),
            "status": "fresh",
            "articles": [{
                "title": "Aztec Connect smart contract exploited for $2.1M",
                "description": "Security incident prompts a regulatory discussion.",
                "source": "CoinTelegraph",
                "published": now.isoformat(),
            }],
        },
        [],
        calendar_health={
            "status": "fresh",
            "available": True,
            "event_count": 0,
            "covers_72h": True,
        },
        now=now,
    )

    assert snapshot["headlines"][0]["topic"] == "market_stress"


def _matrix_bg_summary():
    now = datetime.now(timezone.utc).timestamp()
    keys = {
        "mvrv-zscore", "puell-multiple", "mayer-multiple", "pi-cycle",
        "reserve-risk", "m2global", "m2yoy-change", "ssr",
        "ssr-oscillator", "funding-rate", "btc-derivatives-basis-1h",
        "taker-vol-1h", "top-trader-position-1h",
        "top-trader-account-1h", "nupl", "sopr", "sth-mvrv",
        "miner-net-flow", "exchange-netflow-btc", "hashribbons",
    }
    return {
        key: {
            "ok": True,
            "fetched_at": now,
            "is_stale": False,
        }
        for key in keys
    }


def _matrix_confluence():
    return {
        "layers": {
            "macro_liquidity": {
                "verdict": "BULLISH",
                "strength": 0.5,
                "rationale": "Macro liquidity is expanding.",
                "metrics": [
                    {
                        "key": "m2yoy_change",
                        "score": 1,
                        "label": "+5.2%",
                        "available": True,
                    },
                ],
            },
            "smart_money": {
                "verdict": "BEARISH",
                "strength": 0.5,
                "rationale": "Positioning is cautious.",
                "metrics": [
                    {
                        "key": "funding_rate",
                        "score": -1,
                        "label": "-0.01%",
                        "available": True,
                    },
                    {
                        "key": "basis",
                        "score": 0,
                        "label": "+12",
                        "available": True,
                    },
                    {
                        "key": "top_trader_position",
                        "score": 1,
                        "label": "58% long",
                        "available": True,
                    },
                ],
            },
            "onchain": {
                "verdict": "NEUTRAL",
                "strength": 0.0,
                "rationale": "On-chain signals are balanced.",
                "metrics": [
                    {
                        "key": "sopr",
                        "score": 0,
                        "label": "1.00",
                        "available": True,
                    },
                ],
            },
        },
    }


def test_evidence_matrix_is_transparent_and_non_authoritative():
    verdict = SimpleNamespace(
        tactical_24h=SimpleNamespace(direction="bearish"),
        secondary_7d=SimpleNamespace(direction="neutral"),
    )
    matrix = build_evidence_matrix(
        btc_price=65_000,
        price_context={
            "change_24h_pct": 1.5,
            "change_72h_pct": -2.5,
            "change_7d_pct": -3.0,
            "high_24h": 66_000,
            "low_24h": 63_500,
        },
        confluence=_matrix_confluence(),
        cycle={
            "score": 45,
            "phase": "ACCUMULATION",
            "phase_label": "Accumulation",
            "confidence": "medium",
        },
        liquidity={
            "provider": "binance_estimated_liquidation_v1",
            "status": "fresh",
            "available": True,
            "age_seconds": 120,
            "layer": {
                "verdict": "BEARISH",
                "strength": 0.6,
                "rationale": "Downside liquidity is heavier.",
            },
            "magnets": {
                "dominance_up": 0.35,
                "nearest_above": {"price": 66_500},
                "nearest_below": {"price": 63_000},
            },
            "model_confidence": 0.68,
        },
        event_risk={
            "risk_level": "elevated",
            "summary": "Two high-impact events fall inside 72 hours.",
            "confidence_adjustment": {"penalty_points": 4},
            "windows": {"next_72h": {"high_impact_count": 2}},
            "source_health": {
                "news": {"status": "fresh"},
                "calendar": {"status": "fresh"},
            },
        },
        bg_summary=_matrix_bg_summary(),
        verdict=verdict,
    )

    rows = {row["key"]: row for row in matrix["rows"]}
    assert matrix["decision_authority"] is False
    assert len(rows) == 8
    assert rows["news_event_risk"]["horizons"]["24h"]["weight"] == 0
    assert rows["cycle_context"]["role"] == "context_only"
    assert matrix["horizons"]["24h"]["verdict_direction"] == "bearish"
    assert matrix["horizons"]["24h"]["coverage"] > 0.9


def test_evidence_matrix_marks_missing_derivatives_unavailable():
    bg_summary = _matrix_bg_summary()
    for key in (
        "funding-rate", "btc-derivatives-basis-1h", "taker-vol-1h",
    ):
        bg_summary[key] = {"ok": False, "error": "upstream"}
    confluence = _matrix_confluence()
    confluence["layers"]["smart_money"]["metrics"] = [
        {
            "key": "top_trader_position",
            "score": 1,
            "label": "58% long",
            "available": True,
        },
    ]
    verdict = SimpleNamespace(
        tactical_24h=SimpleNamespace(direction="neutral"),
        secondary_7d=SimpleNamespace(direction="neutral"),
    )

    matrix = build_evidence_matrix(
        btc_price=65_000,
        price_context={"change_24h_pct": 0, "change_7d_pct": 0},
        confluence=confluence,
        cycle={"score": 50, "phase": "MID_BULL", "confidence": "medium"},
        liquidity={},
        event_risk={},
        bg_summary=bg_summary,
        verdict=verdict,
    )
    derivatives = next(
        row for row in matrix["rows"] if row["key"] == "derivatives"
    )

    assert derivatives["source_health"]["status"] == "unavailable"
    assert derivatives["horizons"]["24h"]["direction"] == "unavailable"


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
