// frontend-react/src/components/aiArenaV6/Tooltip.jsx
// Inline tooltip with metric glossary (replaces dedicated methodology page).
// Hover/click ? icon → popup explanation.

import React, { useState, useRef, useEffect } from 'react';
import { COLORS, FONTS } from './constants';

// ════════════════════════════════════════
// Glossary — explanations in Bahasa Indonesia mixed with English terms
// ════════════════════════════════════════

export const GLOSSARY = {
  // Cycle indicators
  'mvrv-z': {
    title: 'MVRV Z-Score',
    desc: 'Rasio Market Cap vs Realized Cap, dinormalisasi pakai standard deviation. Score >7 = top zone, <0 = bottom zone. Level current 0–2 menandakan early-cycle / accumulation.',
  },
  'puell': {
    title: 'Puell Multiple',
    desc: 'Rasio nilai BTC yang dimined dalam USD vs 365-day average. <0.5 = miner capitulation (bottom), >4 = miner profit max (top). Current <1 = undervalued.',
  },
  'mayer': {
    title: 'Mayer Multiple',
    desc: 'Harga BTC dibagi 200-day MA. <1 = below trend (potentially undervalued), >2.4 = overheated. Current ~0.93 = below trend, suggesting consolidation.',
  },
  'pi-cycle': {
    title: 'Pi-Cycle Top Indicator',
    desc: 'Crossover antara 111-day MA dan 350-day MA × 2. Saat signal trigger = historically near cycle top. Saat ini "no signal" = far from top.',
  },
  'reserve-risk': {
    title: 'Reserve Risk',
    desc: 'Confidence index dari long-term holders. Rendah (<0.002) = HODLers belum sell, attractive entry. Tinggi (>0.02) = HODLers profit-taking, late cycle.',
  },

  // Macro liquidity
  'm2-global': {
    title: 'Global M2 Money Supply',
    desc: 'Total uang beredar global (US, EU, China, Japan, dll). Expanding M2 = liquidity tailwind buat risk assets termasuk BTC, biasanya lead BTC dengan delay 8-12 minggu.',
  },
  'm2-yoy': {
    title: 'M2 YoY Change',
    desc: 'Rate of change Global M2 vs setahun lalu. >5% = liquidity expansion bullish, <0% = contraction bearish. Single best macro lead indicator buat crypto.',
  },
  'ssr': {
    title: 'Stablecoin Supply Ratio (SSR)',
    desc: 'Rasio BTC market cap vs stablecoin supply. Low SSR = banyak dry powder (stablecoin) relatif ke BTC, bullish (potential buying power). High SSR = dry powder habis, bearish.',
  },
  'ssr-osc': {
    title: 'SSR Oscillator',
    desc: 'Normalisasi SSR ke -1..+1. Positif = stablecoin growth > BTC mcap growth (more dry powder accumulating). Bullish setup.',
  },

  // Smart money
  'top-traders': {
    title: 'Top Traders Long/Short',
    desc: 'Persentase top trader pakai long position. <40% = top traders bias short (bearish smart money), >60% = bias long (bullish). Useful sebagai contrarian signal di extremes.',
  },
  'funding-rate': {
    title: 'Funding Rate',
    desc: 'Biaya yang dibayar long ke short (atau sebaliknya) di perpetual futures. Positif = longs dominan paying. Negatif = shorts dominan paying. Extreme negative = contrarian bullish setup.',
  },
  'basis': {
    title: 'Futures Basis',
    desc: 'Spread antara futures price dan spot. Positif = contango (futures > spot, bullish bias). Negatif = backwardation (futures < spot, bearish or stress signal).',
  },
  'taker-vol': {
    title: 'Taker Volume Ratio',
    desc: 'Rasio buy taker volume vs sell taker volume. >1 = aggressive buying dominan, <1 = aggressive selling dominan.',
  },

  // On-chain
  'nupl': {
    title: 'Net Unrealized P/L (NUPL)',
    desc: 'Persentase BTC supply yang lagi unrealized profit. <0 = capitulation, 0-0.25 = hope/fear, 0.25-0.5 = optimism/anxiety, 0.5-0.75 = belief, >0.75 = euphoria (top).',
  },
  'sopr': {
    title: 'Spent Output Profit Ratio (SOPR)',
    desc: 'Rasio profit dari coins yang move on-chain. >1 = coins move at profit (selling profitable). <1 = coins move at loss. Level 1.0 = key support — break below = capitulation.',
  },
  'sth-mvrv': {
    title: 'Short-Term Holder MVRV',
    desc: 'MVRV terbatas ke coins held <155 days. <0.95 = STH at loss (bearish stress). >1.5 = STH heavy profit (distribution risk). 1.0 = breakeven, neutral.',
  },
  'miner-flow': {
    title: 'Miner Net Flow',
    desc: 'BTC yang dipindah masuk/keluar miner wallets. Positif net = miners holding/accumulating (bullish). Negatif net = miners selling (bearish stress, watch for capitulation).',
  },
  'exchange-netflow': {
    title: 'Exchange Net Flow',
    desc: 'BTC yang masuk vs keluar dari exchange. Positif inflow = sell pressure building. Negatif outflow (withdrawal) = accumulation, coins moving to cold storage.',
  },
  'hashribbons': {
    title: 'Hash Ribbons',
    desc: 'Crossover antara 30-day dan 60-day hashrate MA. "Down" = hashrate declining (miner stress, watch for capitulation). "Up" cross historically = bullish recovery signal.',
  },

  // Risk
  'volatility': {
    title: 'Realized Volatility',
    desc: '30-day realized volatility annualized. <30% = compressed (potentially impending move). >80% = high vol regime (chop or trend, but unstable).',
  },
  'oi': {
    title: 'Open Interest',
    desc: 'Total outstanding futures contracts. High OI + funding extreme = leveraged setup (potential squeeze). Low OI = unleveraged base (stable but boring).',
  },
  'fear-greed': {
    title: 'Fear & Greed Index',
    desc: 'Composite sentiment 0-100. <25 = extreme fear (contrarian buy zone). >75 = extreme greed (caution). Mid-range 40-60 = neutral.',
  },
  'cycle-score': {
    title: 'Cycle Position Score',
    desc: 'Composite 0-100 dari MVRV-Z, Puell, Mayer, dan Reserve Risk. 0 = cycle bottom, 100 = cycle top. Membantu user identify "where in cycle we are right now".',
  },
  'confluence': {
    title: 'Three-Layer Confluence',
    desc: 'Aggregasi rule-based dari 3 layer (Macro, Smart Money, On-chain). 3↑ = strong bullish, 3↓ = strong bearish, mixed = uncertain. AI verdict harus consider confluence — high confidence butuh confluence.',
  },
};

// ════════════════════════════════════════
// Tooltip Component
// ════════════════════════════════════════

export default function Tooltip({ termKey, children, position = 'top' }) {
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
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const positionStyle =
    position === 'top'
      ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
      : position === 'bottom'
      ? { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
      : { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' };

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          width: 14,
          height: 14,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.goldDim,
          fontSize: 10,
          fontFamily: FONTS.mono,
          fontWeight: 600,
          lineHeight: 1,
          opacity: 0.7,
          transition: 'opacity 0.15s, color 0.15s',
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
            position: 'absolute',
            ...positionStyle,
            zIndex: 1000,
            width: 280,
            padding: '12px 14px',
            background: 'rgba(10, 13, 18, 0.97)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${COLORS.borderStrong}`,
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: 11,
            fontFamily: FONTS.body,
            lineHeight: 1.5,
            color: COLORS.text,
            textAlign: 'left',
            whiteSpace: 'normal',
            pointerEvents: 'auto',
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
