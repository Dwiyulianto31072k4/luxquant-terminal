// frontend-react/src/components/aiArenaV6/Tooltip.jsx
// Inline tooltip with metric glossary (replaces dedicated methodology page).
// Hover/click ? icon → popup explanation.

import React, { useState, useRef, useEffect } from "react";
import { COLORS, FONTS } from "./constants";

// ════════════════════════════════════════
// Glossary — explanations in Bahasa Indonesia mixed with English terms
// ════════════════════════════════════════

export const GLOSSARY = {
  // Cycle indicators
  "mvrv-z": {
    title: "MVRV Z-Score",
    desc: "Market Cap vs Realized Cap ratio, normalized by standard deviation. Score >7 = top zone, <0 = bottom zone. A current level of 0–2 indicates early-cycle / accumulation.",
  },
  puell: {
    title: "Puell Multiple",
    desc: "Ratio of the USD value of mined BTC vs its 365-day average. <0.5 = miner capitulation (bottom), >4 = peak miner profit (top). Current <1 = undervalued.",
  },
  mayer: {
    title: "Mayer Multiple",
    desc: "Harga BTC dibagi 200-day MA. <1 = below trend (potentially undervalued), >2.4 = overheated. Current ~0.93 = below trend, suggesting consolidation.",
  },
  "pi-cycle": {
    title: "Pi-Cycle Top Indicator",
    desc: 'Crossover antara 111-day MA dan 350-day MA × 2. Saat signal trigger = historically near cycle top. Saat ini "no signal" = far from top.',
  },
  "reserve-risk": {
    title: "Reserve Risk",
    desc: "Confidence index of long-term holders. Low (<0.002) = HODLers aren't selling, an attractive entry. High (>0.02) = HODLers taking profit, late cycle.",
  },

  // Macro liquidity
  "m2-global": {
    title: "Global M2 Money Supply",
    desc: "Total global money supply (US, EU, China, Japan, etc.). Expanding M2 is a liquidity tailwind for risk assets including BTC, and usually leads BTC by 8–12 weeks.",
  },
  "m2-yoy": {
    title: "M2 YoY Change",
    desc: "Rate of change in global M2 vs a year ago. >5% = bullish liquidity expansion, <0% = bearish contraction. The single best macro lead indicator for crypto.",
  },
  ssr: {
    title: "Stablecoin Supply Ratio (SSR)",
    desc: "Rasio BTC market cap vs stablecoin supply. Low SSR = banyak dry powder (stablecoin) relatif ke BTC, bullish (potential buying power). High SSR = dry powder habis, bearish.",
  },
  "ssr-osc": {
    title: "SSR Oscillator",
    desc: "Normalisasi SSR ke -1..+1. Positif = stablecoin growth > BTC mcap growth (more dry powder accumulating). Bullish setup.",
  },

  // Smart money
  "top-traders": {
    title: "Top Traders Long/Short",
    desc: "Persentase top trader pakai long position. <40% = top traders bias short (bearish smart money), >60% = bias long (bullish). Useful sebagai contrarian signal di extremes.",
  },
  "funding-rate": {
    title: "Funding Rate",
    desc: "The fee longs pay shorts (or vice versa) on perpetual futures. Positive = longs are paying. Negative = shorts are paying. Extremely negative = a contrarian bullish setup.",
  },
  basis: {
    title: "Futures Basis",
    desc: "Spread antara futures price dan spot. Positif = contango (futures > spot, bullish bias). Negatif = backwardation (futures < spot, bearish or stress signal).",
  },
  "taker-vol": {
    title: "Taker Volume Ratio",
    desc: "Rasio buy taker volume vs sell taker volume. >1 = aggressive buying dominan, <1 = aggressive selling dominan.",
  },

  // On-chain
  nupl: {
    title: "Net Unrealized P/L (NUPL)",
    desc: "Share of BTC supply sitting in unrealized profit. <0 = capitulation, 0–0.25 = hope/fear, 0.25–0.5 = optimism/anxiety, 0.5–0.75 = belief, >0.75 = euphoria (top).",
  },
  sopr: {
    title: "Spent Output Profit Ratio (SOPR)",
    desc: "Profit ratio of coins moving on-chain. >1 = coins moving at a profit (profitable selling). <1 = coins moving at a loss. 1.0 is key support — breaking below = capitulation.",
  },
  "sth-mvrv": {
    title: "Short-Term Holder MVRV",
    desc: "MVRV terbatas ke coins held <155 days. <0.95 = STH at loss (bearish stress). >1.5 = STH heavy profit (distribution risk). 1.0 = breakeven, neutral.",
  },
  "miner-flow": {
    title: "Miner Net Flow",
    desc: "BTC moving in and out of miner wallets. Net positive = miners holding/accumulating (bullish). Net negative = miners selling (bearish stress, watch for capitulation).",
  },
  "exchange-netflow": {
    title: "Exchange Net Flow",
    desc: "BTC flowing into vs out of exchanges. Net inflow = sell pressure building. Net outflow (withdrawals) = accumulation, coins moving to cold storage.",
  },
  hashribbons: {
    title: "Hash Ribbons",
    desc: 'Crossover antara 30-day dan 60-day hashrate MA. "Down" = hashrate declining (miner stress, watch for capitulation). "Up" cross historically = bullish recovery signal.',
  },

  // Risk
  volatility: {
    title: "Realized Volatility",
    desc: "30-day realized volatility annualized. <30% = compressed (potentially impending move). >80% = high vol regime (chop or trend, but unstable).",
  },
  oi: {
    title: "Open Interest",
    desc: "Total outstanding futures contracts. High OI + funding extreme = leveraged setup (potential squeeze). Low OI = unleveraged base (stable but boring).",
  },
  "fear-greed": {
    title: "Fear & Greed Index",
    desc: "Composite sentiment 0-100. <25 = extreme fear (contrarian buy zone). >75 = extreme greed (caution). Mid-range 40-60 = neutral.",
  },
  "cycle-score": {
    title: "Cycle Position Score",
    desc: 'Composite 0–100 of MVRV-Z, Puell, Mayer and Reserve Risk. 0 = cycle bottom, 100 = cycle top. Helps you identify "where in the cycle we are right now".',
  },
  "verdict-evaluation": {
    title: "How Compass outcomes are judged",
    desc: "Compass compares the BTC price at the call with the price when its horizon ends. Bullish is a hit at +1% or more; bearish is a hit at -1% or less; neutral is a hit only when the final move stays inside ±2%. A neutral miss means BTC moved more than 2% in either direction, so the market was not actually range-bound.",
  },
  confluence: {
    title: "Three-Layer Confluence",
    desc: "Rule-based aggregation of 3 layers (Macro, Smart Money, On-chain). 3↑ = strong bullish, 3↓ = strong bearish, mixed = uncertain. The AI verdict must consider confluence — high confidence requires it.",
  },
};

// ════════════════════════════════════════
// Tooltip Component
// ════════════════════════════════════════

export default function Tooltip({ termKey, children, position = "top" }) {
  const [open, setOpen] = useState(false);
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);

  const entry = GLOSSARY[termKey];

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const positionStyle =
    position === "top"
      ? { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
      : position === "bottom"
        ? { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
        : { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" };

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {children}
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          width: 14,
          height: 14,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.goldDim,
          fontSize: 10,
          fontFamily: FONTS.mono,
          fontWeight: 600,
          lineHeight: 1,
          opacity: 0.7,
          transition: "opacity 0.15s, color 0.15s",
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`More info: ${entry?.title || termKey}`}
      >
        ?
      </button>

      {open && entry && (
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "absolute",
            ...positionStyle,
            zIndex: 1000,
            width: 280,
            padding: "12px 14px",
            background: "rgba(10, 13, 18, 0.97)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${COLORS.borderStrong}`,
            borderRadius: 6,
            boxShadow: "0 8px 24px rgb(var(--scrim) / 0.35)",
            fontSize: 11,
            fontFamily: FONTS.body,
            lineHeight: 1.5,
            color: COLORS.text,
            textAlign: "left",
            whiteSpace: "normal",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.gold,
              marginBottom: 6,
              letterSpacing: 0.2,
            }}
          >
            {entry.title}
          </div>
          <div style={{ color: COLORS.textMuted }}>{entry.desc}</div>
        </span>
      )}
    </span>
  );
}
