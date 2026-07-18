// src/components/terminal/tagGlossary.js
// ════════════════════════════════════════════════════════════════
// Plain-English meaning for every tag we print on a signal card.
//
// The desk is covered in trader shorthand — FVG, OB, SMC, HTF, MTF, div,
// fib golden zone. That vocabulary is invisible to anyone who hasn't traded
// price action, and an unexplained label is worse than none: it looks like it
// matters but can't be acted on.
//
// Every entry answers two things in one breath: what it IS, and what it MEANS
// for the trade. Surfaced as a tooltip wherever the tag is rendered.
// ════════════════════════════════════════════════════════════════

export const TAG_GLOSSARY = {
  // ── setup quality ─────────────────────────────────────────────
  SMC_GOLDEN_SETUP:
    "Golden setup — several 'smart money' conditions line up at once (order block, fair-value gap, clean structure break). The highest-quality pattern we tag.",
  FVG_NEAR_ENTRY:
    "Fair Value Gap near entry — a price gap left by a fast move. Price often comes back to fill it, so entering near one tends to get a better fill.",
  OB_NEAR_ENTRY:
    "Order Block near entry — the candle zone where large buyers/sellers last stepped in. Price often reacts there again, making it a natural entry area.",
  AT_FIB_GOLDEN_ZONE:
    "In the Fibonacci golden zone (61.8–65% retracement) — the depth a healthy pullback usually reaches before the trend resumes.",
  BROKE_RESISTANCE_RECENT:
    "Just broke above a level that had been capping price. Old resistance often turns into support.",
  BROKE_SUPPORT_RECENT:
    "Just broke below a level that had been holding price up. Old support often turns into resistance.",
  FRESH_BREAKOUT:
    "Breakout just happened — price cleared its range recently, so the move is early rather than mature.",
  DEEP_PULLBACK:
    "Price pulled back deep into the trend. Better entry price, but it has to hold — a deep pullback that fails becomes a reversal.",
  BB_SQUEEZE_H1:
    "1H Bollinger Bands squeezed tight — volatility is coiling. A bigger move is loading, direction not yet decided.",
  BB_EXPANSION_H1: "1H Bollinger Bands opening up — volatility just expanded, so the move is underway.",
  HARMONIC_ALIGNED: "A harmonic price pattern (Gartley/Bat-type geometry) agrees with the trade direction.",
  PATTERN_BULLISH: "The detected chart pattern points up.",
  PATTERN_BEARISH: "The detected chart pattern points down.",

  // ── trend & timeframes ────────────────────────────────────────
  HTF_TREND_STRONG:
    "HTF = Higher TimeFrame (the 4-hour chart). Its trend is strong, so the bigger picture is behind this trade.",
  HTF_TREND_EXHAUSTED:
    "The 4-hour trend looks tired — it has run a long way and is losing strength.",
  MTF_FULL_ALIGNED:
    "MTF = Multi-TimeFrame. All three charts (4H, 1H, 15m) point the same way — the cleanest possible agreement.",
  MTF_LTF_ALIGNED:
    "The lower timeframes agree with each other, but the 4-hour chart hasn't confirmed yet.",
  MTF_AGAINST_HTF:
    "The short-term move is fighting the 4-hour trend — you'd be trading against the bigger picture.",

  // ── momentum ──────────────────────────────────────────────────
  RSI_BULL_DIV_H1:
    "Bullish RSI divergence on 1H — price made a lower low but momentum didn't. Selling pressure is fading; often precedes a bounce.",
  RSI_BEAR_DIV_H1:
    "Bearish RSI divergence on 1H — price made a higher high but momentum didn't. Buying pressure is fading.",
  RSI_HIDDEN_BULL_H1:
    "Hidden bullish divergence on 1H — a continuation signal: the pullback is losing steam and the uptrend likely resumes.",
  RSI_HIDDEN_BEAR_H1: "Hidden bearish divergence on 1H — a continuation signal for a downtrend.",
  RSI_OVERBOUGHT_H1:
    "1H RSI above 70 — stretched short-term. It can stay overbought in a strong trend, but chasing here is late.",
  RSI_OVERBOUGHT_H4: "4H RSI above 70 — stretched on the higher timeframe too.",
  RSI_OVERSOLD_H1: "1H RSI below 30 — washed out short-term, a common bounce area.",

  // ── volume ────────────────────────────────────────────────────
  VOL_SPIKE_2X: "Volume ran roughly 2× its normal pace — real participation, not a quiet drift.",
  VOL_SPIKE_3X: "Volume ran roughly 3× normal — strong participation behind the move.",
  VOL_CLIMAX:
    "Climax volume — an extreme burst. Often marks the END of a move (everyone piling in at once) rather than the start.",

  // ── warnings ──────────────────────────────────────────────────
  LATE_ENTRY: "The call has already travelled a long way. Most of the usual move is behind you.",
  LATE_ENTRY_5C: "Price has already run several candles past the entry — you'd be entering late.",
  OVEREXTENDED: "Price has stretched far from its average. Snapbacks from here are common.",
  PARABOLIC:
    "Price is going near-vertical. Parabolic moves end abruptly and retrace hard — the worst place to enter.",
  EXHAUSTION_CANDLE: "A big candle showing exhaustion — the move may be running out of buyers.",
  LIQ_LOW: "Thin liquidity — fewer orders in the book, so slippage is wider and price moves erratically.",
  LIQ_VERY_LOW: "Very thin liquidity. Hard to get in or out at a fair price; size down or skip it.",
  FUNDING_HEAVY_LONG:
    "Funding is heavily positive — longs are paying to hold, so the crowd is stacked long and exposed to a flush.",
  FUNDING_HEAVY_SHORT:
    "Funding is heavily negative — shorts are paying to hold, which is fuel for a squeeze upward.",
  RISK_OFF_REGIME: "The broader market is risk-off — even good setups fail more often.",
  PATTERN_CONFLICTING:
    "Two chart patterns disagree, so the read is less reliable. Very common — treat it as 'lower confidence', not a veto.",
  HARMONIC_CONFLICTING: "Harmonic patterns disagree with each other — a mixed, lower-confidence read.",
};

/** "SMC_GOLDEN_SETUP" → "smc golden setup" */
export const tagLabel = (tag) => (tag || "").replaceAll("_", " ").toLowerCase();
/** Plain-English explanation, or null if we don't have one. */
export const tagHint = (tag) => TAG_GLOSSARY[tag] || null;

export default TAG_GLOSSARY;
