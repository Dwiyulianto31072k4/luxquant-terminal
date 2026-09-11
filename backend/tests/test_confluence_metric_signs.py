"""Every ranked metric must map a low reading to the end its meaning calls for.

Eight confluence metrics were moved off fixed cut-offs onto a percentile rank
of their own trailing window, because the cut-offs had been written for levels
the metrics have since left — `ssr` and `ssr_oscillator` returned +1 in all 908
stored reports, `nupl` in 99.1%, `top_trader_account` in 89.3%.

A rank carries no opinion about which end is bullish, so `_ranked` takes an
explicit sign. Getting that sign wrong flips the metric and nothing complains:
the score still moves, the layer still has a verdict, and the report still
reads plausibly. SSR was shipped inverted on the first attempt and was caught
only because someone happened to score a live value against the old rule
afterwards.

This is that check, run every time instead of when someone remembers. It needs
no database and no network — the percentile scorer is replaced with a stub, so
what is under test is purely the sign each metric was given.
"""
import pytest

from app.services import confluence_engine as ce


# Each metric with the reading its own semantics call bullish, and why.
# Values sit inside the range the metric actually occupies in production, taken
# from 908 stored reports, so the fallback rules cannot fire and mask the sign.
LOW_IS_BULLISH = {
    # a low SSR is dry powder waiting to buy
    "ssr": (4.6, 6.3, ce.evaluate_macro_liquidity, "ssr"),
    # a low STH-MVRV is short-term holders underwater — the classic bottom
    "sth_mvrv": (0.85, 1.14, ce.evaluate_onchain, "sth_mvrv"),
    # NUPL only ever occupies the belief band, where more unrealised profit is
    # closer to euphoria than to belief
    "nupl": (0.11, 0.34, ce.evaluate_onchain, "nupl"),
}

HIGH_IS_BULLISH = {
    "ssr_oscillator": (0.22, 0.43, ce.evaluate_macro_liquidity, "ssr_oscillator"),
    "m2yoy_change": (-10.0, 8.3, ce.evaluate_macro_liquidity, "m2yoy_change"),
    "sopr": (0.975, 1.02, ce.evaluate_onchain, "sopr"),
    "top_trader_position": (41.0, 69.0, ce.evaluate_smart_money, "top_trader_position"),
    "top_trader_account": (35.0, 75.0, ce.evaluate_smart_money, "top_trader_account"),
}

# The layer functions take different keyword names than the metric keys.
KWARG = {
    "ssr": "ssr",
    "ssr_oscillator": "ssr_oscillator",
    "m2yoy_change": "m2yoy_change",
    "sth_mvrv": "sth_mvrv",
    "nupl": "nupl",
    "sopr": "sopr",
    # these two take a 0-1 ratio and convert internally
    "top_trader_position": "top_trader_position",
    "top_trader_account": "top_trader_account",
}


def _score_with_rank(monkeypatch, layer_fn, key, value, rank):
    """Run one metric through its layer with the percentile pinned to `rank`."""
    monkeypatch.setattr(ce, "_percentile_score", lambda feature, raw: rank)
    kwargs = {KWARG[key]: value / 100 if key.startswith("top_trader") else value}
    result = layer_fn(**kwargs)
    for metric in result.metrics:
        if metric.key == key:
            return metric.score
    pytest.fail(f"{key} did not appear in {layer_fn.__name__}")


@pytest.mark.parametrize("key", sorted(LOW_IS_BULLISH))
def test_low_reading_scores_bullish(monkeypatch, key):
    low, high, layer_fn, metric_key = LOW_IS_BULLISH[key]
    # rank -1 is the bottom of the window, +1 the top
    s_low = _score_with_rank(monkeypatch, layer_fn, metric_key, low, -1.0)
    s_high = _score_with_rank(monkeypatch, layer_fn, metric_key, high, +1.0)
    assert s_low > s_high, (
        f"{key} is inverted: a low reading must score above a high one. "
        f"low={s_low} high={s_high}"
    )
    assert s_low > 0 and s_high < 0


@pytest.mark.parametrize("key", sorted(HIGH_IS_BULLISH))
def test_high_reading_scores_bullish(monkeypatch, key):
    low, high, layer_fn, metric_key = HIGH_IS_BULLISH[key]
    s_low = _score_with_rank(monkeypatch, layer_fn, metric_key, low, -1.0)
    s_high = _score_with_rank(monkeypatch, layer_fn, metric_key, high, +1.0)
    assert s_high > s_low, (
        f"{key} is inverted: a high reading must score above a low one. "
        f"low={s_low} high={s_high}"
    )
    assert s_high > 0 and s_low < 0


@pytest.mark.parametrize("key", sorted({**LOW_IS_BULLISH, **HIGH_IS_BULLISH}))
def test_thin_history_falls_back_rather_than_reading_neutral(monkeypatch, key):
    """No history must reach the old rule, never a fabricated zero.

    "Not enough data" and "neutral" are different claims, and publishing the
    second for the first is how a dead input looks healthy.
    """
    table = {**LOW_IS_BULLISH, **HIGH_IS_BULLISH}
    low, high, layer_fn, metric_key = table[key]
    monkeypatch.setattr(ce, "_percentile_score", lambda feature, raw: None)
    kwargs = {KWARG[metric_key]:
              high / 100 if metric_key.startswith("top_trader") else high}
    result = layer_fn(**kwargs)
    metric = next(m for m in result.metrics if m.key == metric_key)
    assert metric.available is True
    assert metric.score in (-1, 0, 1), (
        f"{key} fell back to something other than its fixed rule: {metric.score}"
    )
