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
    score: int                # -1 (bearish) / 0 (neutral) / +1 (bullish)
    label: str                # short human label e.g. "+6.93% YoY"
    note: str = ""            # optional one-liner explanation
    available: bool = True

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
            key="m2global", raw_value=m2_val, score=0,
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
        score = 1 if m2yoy > 4 else (-1 if m2yoy < 0 else 0)
        note = "Liquidity expanding" if score > 0 else ("Contracting" if score < 0 else "Stagnant")
        metrics.append(MetricSignal(
            key="m2yoy_change", raw_value=m2yoy, score=score,
            label=f"{m2yoy:+.2f}%", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="m2yoy_change", raw_value=None, score=0, label="—", available=False,
        ))

    # SSR: lower = more dry powder vs BTC market cap
    ssr_val = _safe_float(ssr)
    if ssr_val is not None:
        # Below historical median ~7 = bullish, above 12 = bearish (dry powder exhausted)
        score = 1 if ssr_val < 7 else (-1 if ssr_val > 12 else 0)
        note = "Dry powder accumulating" if score > 0 else ("Exhausted" if score < 0 else "Neutral")
        metrics.append(MetricSignal(
            key="ssr", raw_value=ssr_val, score=score,
            label=f"{ssr_val:.2f}", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="ssr", raw_value=None, score=0, label="—", available=False,
        ))

    # SSR Oscillator: momentum filter on SSR
    ssr_osc = _safe_float(ssr_oscillator)
    if ssr_osc is not None:
        # Positive oscillator = accumulating, negative = depleting
        score = 1 if ssr_osc > 0.1 else (-1 if ssr_osc < -0.1 else 0)
        metrics.append(MetricSignal(
            key="ssr_oscillator", raw_value=ssr_osc, score=score,
            label=f"{ssr_osc:+.2f}",
        ))
    else:
        metrics.append(MetricSignal(
            key="ssr_oscillator", raw_value=None, score=0, label="—", available=False,
        ))

    return _aggregate_layer("macro_liquidity", metrics)


# ─── Layer 2: Smart Money ─────────────────────────────────────────────
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
        score = 1 if pct_long > 55 else (-1 if pct_long < 45 else 0)
        metrics.append(MetricSignal(
            key="top_trader_position", raw_value=pos, score=score,
            label=f"{pct_long:.1f}% long",
        ))
    else:
        metrics.append(MetricSignal(
            key="top_trader_position", raw_value=None, score=0, label="—", available=False,
        ))

    # Top trader account count — secondary confirmation
    acc = _safe_float(top_trader_account)
    if acc is not None:
        pct_long_acc = acc * 100 if acc <= 1 else acc
        score = 1 if pct_long_acc > 52 else (-1 if pct_long_acc < 48 else 0)
        metrics.append(MetricSignal(
            key="top_trader_account", raw_value=acc, score=score,
            label=f"{pct_long_acc:.1f}% accounts long",
        ))
    else:
        metrics.append(MetricSignal(
            key="top_trader_account", raw_value=None, score=0, label="—", available=False,
        ))

    # Funding rate: > 0.01% = longs aggressive (bullish bias), < -0.005% = shorts (bearish)
    fr = _safe_float(funding_rate)
    if fr is not None:
        # Detect if input is decimal (0.0001) vs percent (0.01)
        fr_pct = fr * 100 if abs(fr) < 0.01 else fr
        score = 1 if fr_pct > 0.01 else (-1 if fr_pct < -0.005 else 0)
        metrics.append(MetricSignal(
            key="funding_rate", raw_value=fr, score=score,
            label=f"{fr_pct:+.4f}%",
        ))
    else:
        metrics.append(MetricSignal(
            key="funding_rate", raw_value=None, score=0, label="—", available=False,
        ))

    # Basis: futures premium over spot
    bs = _safe_float(basis)
    if bs is not None:
        score = 1 if bs > 50 else (-1 if bs < -30 else 0)
        metrics.append(MetricSignal(
            key="basis", raw_value=bs, score=score,
            label=f"{bs:+.0f}",
        ))
    else:
        metrics.append(MetricSignal(
            key="basis", raw_value=None, score=0, label="—", available=False,
        ))

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
        if 0 <= nupl_val <= 0.5:
            score, note = 1, "Belief zone (healthy uptrend)"
        elif nupl_val > 0.75:
            score, note = -1, "Euphoria zone (overheated)"
        elif nupl_val < 0:
            # Paradox: capitulation often = bottom signal
            score, note = 1, "Capitulation (contrarian bullish)"
        else:
            score, note = 0, "Mid range"
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
        score = 1 if sopr_val > 1.005 else (-1 if sopr_val < 0.99 else 0)
        note = "Profit-taking" if score > 0 else ("Loss-takers active" if score < 0 else "Equilibrium")
        metrics.append(MetricSignal(
            key="sopr", raw_value=sopr_val, score=score,
            label=f"{sopr_val:.3f}", note=note,
        ))
    else:
        metrics.append(MetricSignal(
            key="sopr", raw_value=None, score=0, label="—", available=False,
        ))

    # STH-MVRV: < 0.95 = STH underwater (classical bottom signal)
    sth = _safe_float(sth_mvrv)
    if sth is not None:
        if sth < 0.85:
            score, note = 1, "Deep STH capitulation (bottom signal)"
        elif sth < 0.95:
            score, note = 1, "STH underwater (bottom-ish)"
        elif sth > 1.30:
            score, note = -1, "STH heavily in profit (distribution risk)"
        else:
            score, note = 0, "STH neutral"
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
