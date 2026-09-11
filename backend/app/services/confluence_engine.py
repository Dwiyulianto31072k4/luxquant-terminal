"""
Confluence Engine — rule-based pre-AI synthesis.

Computes per-layer verdicts (Macro / Smart Money / On-chain) using heuristic
thresholds, then aggregates into a confluence indicator.

This is the deterministic skeleton the AI Stage 2 (DeepSeek R1) reasoning chain
builds upon. Having rule-based verdicts ensures:
1. AI can't "hallucinate" verdict that contradicts raw thresholds
2. UI can render layer states even if AI fails
3. Confluence math is reproducible & testable

Layers covered here (3 of 4):
- Macro Liquidity   (BG: m2global, m2yoy-change, ssr, ssr-oscillator)
- Smart Money       (BG: top-trader-position-1h, funding-rate, basis, taker-vol-1h)
- On-chain Behavior (BG: nupl, sopr, sth-mvrv, miner-net-flow, exchange-netflow-btc, hashribbons)

The 4th "Cycle Position" layer is computed by cycle_position.py.

Smart Money layer also takes external inputs (ETF flows, Coinbase Premium) from
CoinGlass — those are merged in by the worker before calling .compute_all().
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

logger = logging.getLogger(__name__)

Verdict = Literal["BULLISH", "BEARISH", "NEUTRAL"]
ConfluenceStrength = Literal["STRONG", "MODERATE", "WEAK", "MIXED"]


# ─── Data structures ──────────────────────────────────────────────────
@dataclass
class MetricSignal:
    """Single metric's contribution to a layer verdict."""
    key: str
    raw_value: Any
    score: float              # -1 (bearish) .. +1 (bullish); continuous where ranked
    label: str                # short human label e.g. "+6.93% YoY"
    note: str = ""            # optional one-liner explanation
    available: bool = True
    # Carried for context, never scored — m2global is a level, not a direction.
    # Marked explicitly so the operational-health feature check can tell a
    # deliberately silent metric from a broken one. Without this it reported
    # m2global as "never contributes" alongside genuinely dead features, and a
    # check that cries wolf is a check people stop reading.
    informational: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class LayerVerdict:
    """Per-layer aggregated verdict."""
    layer: str
    verdict: Verdict
    strength: float           # 0.0 to 1.0 — how strong the directional signal
    metrics: list[MetricSignal] = field(default_factory=list)
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "layer": self.layer,
            "verdict": self.verdict,
            "strength": round(self.strength, 2),
            "metrics": [m.to_dict() for m in self.metrics],
            "rationale": self.rationale,
        }


@dataclass
class Confluence:
    """Aggregated confluence across all layers."""
    bullish_count: int
    bearish_count: int
    neutral_count: int
    total_layers: int
    strength: ConfluenceStrength
    dominant_direction: Verdict
    summary: str
    layers: dict[str, LayerVerdict] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "bullish_count": self.bullish_count,
            "bearish_count": self.bearish_count,
            "neutral_count": self.neutral_count,
            "total_layers": self.total_layers,
            "strength": self.strength,
            "dominant_direction": self.dominant_direction,
            "summary": self.summary,
            "layers": {k: v.to_dict() for k, v in self.layers.items()},
        }


# ─── Helpers ──────────────────────────────────────────────────────────
def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _aggregate_layer(layer_name: str, metrics: list[MetricSignal]) -> LayerVerdict:
    """Combine per-metric scores into layer verdict."""
    available = [m for m in metrics if m.available]
    if not available:
        return LayerVerdict(
            layer=layer_name, verdict="NEUTRAL", strength=0.0,
            metrics=metrics, rationale="No data available",
        )

    # Average score across available metrics → -1 to +1
    avg = sum(m.score for m in available) / len(available)
    strength = abs(avg)

    if avg > 0.33:
        verdict: Verdict = "BULLISH"
    elif avg < -0.33:
        verdict = "BEARISH"
    else:
        verdict = "NEUTRAL"

    # Rationale: count signals
    bull = sum(1 for m in available if m.score > 0)
    bear = sum(1 for m in available if m.score < 0)
    neut = sum(1 for m in available if m.score == 0)
    rationale = f"{bull} bullish, {bear} bearish, {neut} neutral signals across {len(available)} metrics"

    return LayerVerdict(
        layer=layer_name, verdict=verdict, strength=strength,
        metrics=metrics, rationale=rationale,
    )


# ─── Layer 1: Macro Liquidity ─────────────────────────────────────────
def evaluate_macro_liquidity(
    m2global: Any = None,
    m2yoy_change: Any = None,
    ssr: Any = None,
    ssr_oscillator: Any = None,
) -> LayerVerdict:
    """
    M2 expansion + dry powder accumulation = bullish setup.
    Lead time: ~10 weeks per historical correlation studies.
    """
    metrics: list[MetricSignal] = []

    # M2 Global: trend signal (compared to baseline expectation of 4-8% YoY growth)
    m2_val = _safe_float(m2global)
    if m2_val is not None:
        # M2global is total liquidity — magnitude varies. Use as informational.
        metrics.append(MetricSignal(
            key="m2global", raw_value=m2_val, score=0, informational=True,
            label=f"${m2_val/1e12:.1f}T" if m2_val > 1e12 else f"{m2_val:.2f}",
            note="Total global money supply (informational)",
        ))
    else:
        metrics.append(MetricSignal(
            key="m2global", raw_value=None, score=0, label="—", available=False,
        ))

    # M2 YoY: the directional signal — historically 5%+ supports BTC
    m2yoy = _safe_float(m2yoy_change)
    if m2yoy is not None:
        score, note = _ranked(
            "m2yoy_change", m2yoy, +1,
            lambda v: 1 if v > 4 else (-1 if v < 0 else 0),
            ("Liquidity expanding", "Contracting", "Stagnant"),
        )
        metrics.append(MetricSignal(
            key="m2yoy_change", raw_value=m2yoy, score=score,
            label=f"{m2yoy:+.2f}%", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="m2yoy_change", raw_value=None, score=0, label="—", available=False,
        ))

    # SSR and its oscillator, ranked against their own trailing window for the
    # same reason funding and basis already are: their fixed cut-offs sit
    # outside the range the metrics actually occupy, so neither could return
    # anything but +1.
    #
    # Measured across 908 reports: SSR ranged 4.59-6.27 against "below 7 is
    # bullish", and the oscillator 0.21-0.43 against "above 0.1 is bullish".
    # Both scored +1 in every single report — two permanent bullish votes in a
    # three-metric layer, which is part of why 99.4% of SELECTIVE_RISK_ON reads
    # were BULLISH_CONTINUATION. The cut-offs were written for a level the
    # metric left behind as stablecoin supply grew.
    #
    # Falls back to the old constants until the window fills, so behaviour is
    # unchanged until there is history to rank against — "no data" must not
    # look like "neutral".
    # SSR is inverted — a low reading means dry powder is accumulating, which is
    # why the old rule scored +1 below 7 — so a low percentile has to come out
    # positive. Its oscillator runs the other way and passes through unchanged.
    for _key, _raw, _lbl, _fallback, _notes, _sign in (
        ("ssr", _safe_float(ssr), lambda v: f"{v:.2f}",
         lambda v: 1 if v < 7 else (-1 if v > 12 else 0),
         ("Dry powder accumulating", "Exhausted", "Neutral for its recent range"), -1),
        ("ssr_oscillator", _safe_float(ssr_oscillator), lambda v: f"{v:+.2f}",
         lambda v: 1 if v > 0.1 else (-1 if v < -0.1 else 0),
         ("Accumulating", "Depleting", "Neutral for its recent range"), +1),
    ):
        if _raw is None:
            metrics.append(MetricSignal(key=_key, raw_value=None, score=0,
                                        label="—", available=False))
            continue
        _score, _note = _ranked(_key, _raw, _sign, _fallback, _notes)
        metrics.append(MetricSignal(key=_key, raw_value=_raw, score=_score,
                                    label=_lbl(_raw), note=_note))

    return _aggregate_layer("macro_liquidity", metrics)


# ─── Layer 2: Smart Money ─────────────────────────────────────────────
def _percentile_score(feature: str, value: float):
    """Rank against the trailing window, or None when history is too thin."""
    try:
        from app.services.compass_percentile import score as _score
        return _score(feature, value)
    except Exception:
        return None


def _ranked(key: str, raw: float, sign: int, fallback, notes: tuple[str, str, str]):
    """Score a metric against its own trailing window, or fall back to its rule.

    Every fixed cut-off in this file was written for a level the metric has
    since drifted away from, and the failure is silent: the metric keeps
    returning the same score and stops carrying information. Measured across
    908 reports — `ssr` and `ssr_oscillator` returned +1 every single time,
    `nupl` 99.1%, `m2yoy_change` 90.7%, `top_trader_account` 89.3%.

    Two of those feed the direction score, so the bias was not confined to
    prose. A percentile rank asks "high or low for this metric lately", which
    is what an absolute number was approximating before the level moved.

    `sign` is mandatory and carries which end is bullish. SSR, STH-MVRV and
    NUPL invert — a low SSR is dry powder, a low STH-MVRV is capitulation, and
    within the band NUPL actually occupies a high reading is closer to euphoria
    than to belief. Getting this wrong silently flips the metric, which is
    exactly what happened to SSR on the first attempt and was only caught by
    scoring a live value against the old rule afterwards. Do that check for any
    metric added here.

    Returns None when history is too thin, so the caller keeps its old rule —
    "not enough data" must never be published as "neutral".
    """
    p = _percentile_score(key, raw)
    if p is None:
        score = fallback(raw)
        return score, (notes[0] if score > 0 else (notes[1] if score < 0 else notes[2]))
    score = round(sign * p, 3)
    return score, (notes[0] if score > 0 else (notes[1] if score < 0 else notes[2]))


def evaluate_smart_money(
    top_trader_position: Any = None,        # ratio 0-1 (1.0 = 100% long)
    top_trader_account: Any = None,
    funding_rate: Any = None,                # decimal e.g. 0.0001 = 0.01%
    basis: Any = None,                       # bps or absolute number
    taker_vol_buy: Any = None,
    taker_vol_sell: Any = None,
    etf_flow_today_usd: Any = None,          # external from CoinGlass
    etf_flow_streak_days: Any = None,
    coinbase_premium_pct: Any = None,        # external from CoinGlass
) -> LayerVerdict:
    """
    Sophisticated traders' positioning. Often contrarian in accumulation phase
    — but at face value: long traders + buying pressure = bullish.
    """
    metrics: list[MetricSignal] = []

    # Top trader position ratio: > 0.55 lean long, < 0.45 lean short
    pos = _safe_float(top_trader_position)
    if pos is not None:
        pct_long = pos * 100 if pos <= 1 else pos
        # Crowd positioning is meaningful as a deviation, not a level: retail
        # sits net long as a matter of course, and 59% is this metric's median,
        # not a signal. The 55 line therefore read bullish 72% of the time.
        # Sign kept positive — the contrarian reading measured in 2e31eb0d is a
        # partial correlation after momentum and is not settled enough to flip a
        # live metric on.
        score, _n = _ranked(
            "top_trader_position", pct_long, +1,
            lambda v: 1 if v > 55 else (-1 if v < 45 else 0),
            ("Crowd leaning long", "Crowd leaning short", "Crowd near its usual lean"),
        )
        metrics.append(MetricSignal(
            key="top_trader_position", raw_value=pos, score=score,
            label=f"{pct_long:.1f}% long", note=_n,
        ))
    else:
        metrics.append(MetricSignal(
            key="top_trader_position", raw_value=None, score=0, label="—", available=False,
        ))

    # Top trader account count — secondary confirmation
    acc = _safe_float(top_trader_account)
    if acc is not None:
        pct_long_acc = acc * 100 if acc <= 1 else acc
        # Median 61% against a 52 line: the metric spent 89% of 908 reports
        # scoring +1, a near-constant bullish vote inside the layer that feeds
        # the 72h direction.
        score, _n = _ranked(
            "top_trader_account", pct_long_acc, +1,
            lambda v: 1 if v > 52 else (-1 if v < 48 else 0),
            ("More accounts long than usual", "Fewer accounts long than usual",
             "Accounts near their usual lean"),
        )
        metrics.append(MetricSignal(
            key="top_trader_account", raw_value=acc, score=score,
            label=f"{pct_long_acc:.1f}% accounts long", note=_n,
        ))
    else:
        metrics.append(MetricSignal(
            key="top_trader_account", raw_value=None, score=0, label="—", available=False,
        ))

    # Funding rate and basis are ranked against their own recent history rather
    # than tested against constants, because both constants had stopped
    # matching the data:
    #
    #   funding: `> 0.01%` fired 0 times in 494 reports. 0.01%/8h is the
    #            BASELINE rate perpetual exchanges clamp toward, so the test sat
    #            on the modal value of its own input — with a strict `>`, so the
    #            most common observation always scored zero.
    #
    #   basis:   bullish test `> +50` against an observed range of -60.96 to
    #            -1.45 across 795 stored observations. Never reachable. Basis
    #            could score 0 or -1 and never +1, which made the whole
    #            derivatives input structurally incapable of a bullish
    #            contribution — deriv_s lived in [-0.5, 0] and could only ever
    #            push the call DOWN.
    #
    # That last one was not cosmetic. Over 436 reports, derivatives changed the
    # direction 37 times (8.5%) and **every one was downward**, because upward
    # was impossible: 17 calls became bearish (measured at -0.548%/call,
    # p=0.0011) and 20 bullish calls were dampened to neutral (bullish measures
    # +0.963%/call). A one-sided input with a known direction of harm.
    #
    # Percentile scoring was split-half tested before this change and is
    # statistically indistinguishable from the constants on accuracy — 58.3% vs
    # 58.0% in the first half, 60.8% vs 63.5% in the second. It is shipped for
    # the failure mode, not for the hit rate: a rank cannot silently fall
    # outside its own data the way a constant did, twice.
    for _key, _raw, _label in (
        ("funding_rate", _safe_float(funding_rate),
         lambda v: f"{(v * 100 if abs(v) < 0.01 else v):+.4f}%"),
        ("basis", _safe_float(basis), lambda v: f"{v:+.0f}"),
    ):
        if _raw is None:
            metrics.append(MetricSignal(key=_key, raw_value=None, score=0,
                                        label="—", available=False))
            continue
        _pct = _percentile_score(_key, _raw)
        if _pct is None:
            # Not enough history yet (a fresh install, or a new feature). Fall
            # back to the old constants rather than emitting a fake neutral —
            # "no data" and "neutral" must not look the same.
            if _key == "funding_rate":
                _fp = _raw * 100 if abs(_raw) < 0.01 else _raw
                _score = 1 if _fp > 0.01 else (-1 if _fp < -0.005 else 0)
            else:
                _score = 1 if _raw > 50 else (-1 if _raw < -30 else 0)
        else:
            # Continuous, so magnitude survives; the old ternary made funding at
            # +0.5% and +0.011% identical.
            _score = round(_pct, 3)
        metrics.append(MetricSignal(key=_key, raw_value=_raw, score=_score,
                                    label=_label(_raw)))

    # Taker volume — net direction of aggressive flow
    buy = _safe_float(taker_vol_buy)
    sell = _safe_float(taker_vol_sell)
    if buy is not None and sell is not None and (buy + sell) > 0:
        net_pct = (buy - sell) / (buy + sell) * 100
        score = 1 if net_pct > 5 else (-1 if net_pct < -5 else 0)
        metrics.append(MetricSignal(
            key="taker_volume", raw_value={"buy": buy, "sell": sell}, score=score,
            label=f"net {net_pct:+.1f}%",
        ))
    else:
        metrics.append(MetricSignal(
            key="taker_volume", raw_value=None, score=0, label="—", available=False,
        ))

    # ETF flow (external input)
    etf = _safe_float(etf_flow_today_usd)
    if etf is not None:
        score = 1 if etf > 50e6 else (-1 if etf < -100e6 else 0)
        metrics.append(MetricSignal(
            key="etf_flow", raw_value=etf, score=score,
            label=f"${etf/1e6:+.0f}M",
        ))

    # Coinbase Premium (external input)
    cb = _safe_float(coinbase_premium_pct)
    if cb is not None:
        score = 1 if cb > 0.05 else (-1 if cb < -0.05 else 0)
        metrics.append(MetricSignal(
            key="coinbase_premium", raw_value=cb, score=score,
            label=f"{cb:+.3f}%",
        ))

    return _aggregate_layer("smart_money", metrics)


# ─── Layer 3: On-chain Behavior ───────────────────────────────────────
def evaluate_onchain(
    nupl: Any = None,
    sopr: Any = None,
    sth_mvrv: Any = None,
    miner_net_flow: Any = None,
    exchange_netflow: Any = None,
    hashribbons: Any = None,
) -> LayerVerdict:
    """
    Network behavior — what holders/miners actually doing on-chain.
    Mix of bottom signals (STH-MVRV<1) and trend signals (SOPR>1).
    """
    metrics: list[MetricSignal] = []

    # NUPL: 0-0.5 = belief (healthy), >0.75 = euphoria, <0 = capitulation
    nupl_val = _safe_float(nupl)
    if nupl_val is not None:
        # The published bands describe a full cycle — capitulation below 0,
        # belief to 0.5, euphoria above 0.75 — but NUPL has ranged 0.10 to 0.35
        # across 908 reports, entirely inside belief. Both outer branches are
        # unreachable and the metric returned +1 in 99.1% of them.
        #
        # Ranked inside the band it actually occupies, and inverted: more
        # unrealised profit is closer to euphoria than to belief, so a high
        # reading is the less bullish end. The cycle bands stay as the fallback
        # for a market that eventually visits them.
        def _nupl_fallback(v):
            if 0 <= v <= 0.5:
                return 1
            if v > 0.75:
                return -1
            if v < 0:
                return 1
            return 0

        score, note = _ranked(
            "nupl", nupl_val, -1, _nupl_fallback,
            ("Unrealised profit low for the band", "Unrealised profit high for the band",
             "Mid-band"),
        )
        metrics.append(MetricSignal(
            key="nupl", raw_value=nupl_val, score=score,
            label=f"{nupl_val:.2f}", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="nupl", raw_value=None, score=0, label="—", available=False,
        ))

    # SOPR: > 1 = profit-taking, < 1 = loss-takers (weak hands selling)
    sopr_val = _safe_float(sopr)
    if sopr_val is not None:
        score, note = _ranked(
            "sopr", sopr_val, +1,
            lambda v: 1 if v > 1.005 else (-1 if v < 0.99 else 0),
            ("Profit-taking", "Loss-takers active", "Equilibrium"),
        )
        metrics.append(MetricSignal(
            key="sopr", raw_value=sopr_val, score=score,
            label=f"{sopr_val:.3f}", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="sopr", raw_value=None, score=0, label="—", available=False,
        ))

    # STH-MVRV, ranked against its own window for the same reason as SSR: the
    # distribution-risk branch at >1.30 is unreachable. Across 908 reports the
    # metric ranged 0.81-1.14, so it could only ever say bullish or nothing, and
    # the operational health check has been reporting it silent for 120 reports
    # straight. Falls back to the fixed levels until the window fills.
    sth = _safe_float(sth_mvrv)
    if sth is not None:
        _p = _percentile_score("sth_mvrv", sth)
        if _p is None:
            if sth < 0.85:
                score, note = 1, "Deep STH capitulation (bottom signal)"
            elif sth < 0.95:
                score, note = 1, "STH underwater (bottom-ish)"
            elif sth > 1.30:
                score, note = -1, "STH heavily in profit (distribution risk)"
            else:
                score, note = 0, "STH neutral"
        else:
            # Inverted: a low STH-MVRV is the bullish end of this metric, so a
            # low percentile must score positive.
            score = round(-_p, 3)
            note = ("STH low for its recent range" if score > 0 else
                    ("STH high for its recent range" if score < 0 else
                     "STH mid-range"))
        metrics.append(MetricSignal(
            key="sth_mvrv", raw_value=sth, score=score,
            label=f"{sth:.2f}", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="sth_mvrv", raw_value=None, score=0, label="—", available=False,
        ))

    # Miner net flow: + = accumulating, - = distributing (stress)
    mnf = _safe_float(miner_net_flow)
    if mnf is not None:
        score = 1 if mnf > 50 else (-1 if mnf < -100 else 0)
        note = "Miners accumulating" if score > 0 else ("Miners selling" if score < 0 else "Steady")
        metrics.append(MetricSignal(
            key="miner_net_flow", raw_value=mnf, score=score,
            label=f"{mnf:+.0f} BTC", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="miner_net_flow", raw_value=None, score=0, label="—", available=False,
        ))

    # Exchange netflow: + = deposits (sell intent, bearish), - = withdrawals (HODL, bullish)
    exf = _safe_float(exchange_netflow)
    if exf is not None:
        score = -1 if exf > 1000 else (1 if exf < -1000 else 0)
        note = "Withdrawals (HODL)" if score > 0 else ("Deposits (sell intent)" if score < 0 else "Neutral")
        metrics.append(MetricSignal(
            key="exchange_netflow", raw_value=exf, score=score,
            label=f"{exf:+.0f} BTC", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="exchange_netflow", raw_value=None, score=0, label="—", available=False,
        ))

    # Hashribbons: "Up" = recovery (bullish), "Down" = stress (bearish but paradoxical)
    if hashribbons is not None:
        hr_str = str(hashribbons).strip().lower()
        if hr_str in ("up", "recovery", "bullish", "1"):
            score, note = 1, "Miner network healthy"
        elif hr_str in ("down", "stress", "capitulation", "-1"):
            score, note = -1, "Miner stress (watch closely)"
        else:
            score, note = 0, f"Status: {hashribbons}"
        metrics.append(MetricSignal(
            key="hashribbons", raw_value=hashribbons, score=score,
            label=hr_str.title(), note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="hashribbons", raw_value=None, score=0, label="—", available=False,
        ))

    return _aggregate_layer("onchain", metrics)


# ─── Confluence aggregation ───────────────────────────────────────────
def aggregate_confluence(layers: dict[str, LayerVerdict]) -> Confluence:
    """
    Combine 3 layer verdicts (Macro / Smart / On-chain) into confluence.
    Cycle Position is computed separately — caller should pass it in if desired.

    Strength rules (3 layers):
    - 3/3 same → STRONG
    - 2/3 same → MODERATE
    - 1/1/1 mixed → MIXED
    - any layer with NEUTRAL drops one count → may downgrade strength
    """
    bullish = sum(1 for lv in layers.values() if lv.verdict == "BULLISH")
    bearish = sum(1 for lv in layers.values() if lv.verdict == "BEARISH")
    neutral = sum(1 for lv in layers.values() if lv.verdict == "NEUTRAL")
    total = len(layers)

    # Determine strength + direction
    if bullish == total:
        strength: ConfluenceStrength = "STRONG"
        direction: Verdict = "BULLISH"
    elif bearish == total:
        strength = "STRONG"
        direction = "BEARISH"
    elif bullish >= 2 and bearish == 0:
        strength = "MODERATE"
        direction = "BULLISH"
    elif bearish >= 2 and bullish == 0:
        strength = "MODERATE"
        direction = "BEARISH"
    elif bullish > bearish:
        strength = "WEAK"
        direction = "BULLISH"
    elif bearish > bullish:
        strength = "WEAK"
        direction = "BEARISH"
    else:
        strength = "MIXED"
        direction = "NEUTRAL"

    # Build human summary
    parts: list[str] = []
    for layer_key, lv in layers.items():
        arrow = {"BULLISH": "↑", "BEARISH": "↓", "NEUTRAL": "→"}[lv.verdict]
        layer_label = layer_key.replace("_", " ").title()
        parts.append(f"{layer_label} {arrow}")
    summary = f"{strength} confluence ({bullish}↑/{bearish}↓/{neutral}→) — " + ", ".join(parts)

    return Confluence(
        bullish_count=bullish,
        bearish_count=bearish,
        neutral_count=neutral,
        total_layers=total,
        strength=strength,
        dominant_direction=direction,
        summary=summary,
        layers=layers,
    )


# ─── Top-level entry point ────────────────────────────────────────────
def compute_all(
    *,
    bg_snapshot: dict | None = None,
    external: dict | None = None,
) -> Confluence:
    """
    Convenience entry point: takes BGClient.fetch_all() snapshot + external
    smart-money inputs (ETF, Coinbase Premium), returns full Confluence.

    Usage:
        bg = BGClient()
        snap = await bg.fetch_all()
        external = {"etf_flow_today_usd": -148e6, "coinbase_premium_pct": -0.04}
        conf = compute_all(bg_snapshot=snap, external=external)
    """
    bg_snapshot = bg_snapshot or {}
    external = external or {}

    def get(key: str) -> Any:
        m = bg_snapshot.get(key)
        if m is None:
            return None
        # Support both BGMetric dataclass and plain dict
        if hasattr(m, "ok") and m.ok:
            return m.value
        if isinstance(m, dict) and m.get("error") is None:
            return m.get("value")
        return None

    macro = evaluate_macro_liquidity(
        m2global=get("m2global"),
        m2yoy_change=get("m2yoy-change"),
        ssr=get("ssr"),
        ssr_oscillator=get("ssr-oscillator"),
    )

    smart = evaluate_smart_money(
        top_trader_position=get("top-trader-position-1h"),
        top_trader_account=get("top-trader-account-1h"),
        funding_rate=get("funding-rate"),
        basis=get("btc-derivatives-basis-1h"),
        taker_vol_buy=external.get("taker_vol_buy"),
        taker_vol_sell=external.get("taker_vol_sell"),
        etf_flow_today_usd=external.get("etf_flow_today_usd"),
        etf_flow_streak_days=external.get("etf_flow_streak_days"),
        coinbase_premium_pct=external.get("coinbase_premium_pct"),
    )

    onchain = evaluate_onchain(
        nupl=get("nupl"),
        sopr=get("sopr"),
        sth_mvrv=get("sth-mvrv"),
        miner_net_flow=get("miner-net-flow"),
        exchange_netflow=get("exchange-netflow-btc"),
        hashribbons=get("hashribbons"),
    )

    return aggregate_confluence({
        "macro_liquidity": macro,
        "smart_money": smart,
        "onchain": onchain,
    })
