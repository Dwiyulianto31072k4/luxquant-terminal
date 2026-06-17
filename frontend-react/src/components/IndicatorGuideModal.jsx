import { createPortal } from "react-dom";
import { useEffect } from "react";

// Indicator education modal — content grounded in 2026 crypto TA research.
// Philosophy stays "inform, don't decide": explains how to read signals,
// never tells the user what to trade.

const IndicatorGuideModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const Tag = ({ children, tone = "gold" }) => {
    const tones = {
      gold: "bg-gold-primary/12 text-gold-primary border-gold-primary/25",
      green: "bg-green-500/12 text-green-400 border-green-500/25",
      red: "bg-red-500/12 text-red-400 border-red-500/25",
      blue: "bg-blue-500/12 text-blue-400 border-blue-500/25",
    };
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold border ${tones[tone]}`}>
        {children}
      </span>
    );
  };

  const indicators = [
    {
      name: "MACD",
      tag: "Momentum / Trend",
      tone: "blue",
      setting: "12 / 26 / 9",
      what: "Tracks the relationship between two moving averages to reveal trend direction and momentum shifts.",
      read: [
        "Histogram flipping negative → positive signals buying momentum entering.",
        "An expanding histogram in the crossover direction = conviction; a shrinking one warns of a weak or false signal.",
      ],
    },
    {
      name: "RSI",
      tag: "Momentum Extremes",
      tone: "gold",
      setting: "14 period",
      what: "A 0–100 oscillator measuring whether price is overextended in either direction.",
      read: [
        "Above 70 = overbought (price may cool off). Below 30 = oversold (potential bounce).",
        "The 40–70 band during an uptrend often marks healthy strength without being overbought.",
      ],
    },
    {
      name: "Bollinger Bands",
      tag: "Volatility",
      tone: "green",
      setting: "20 SMA, ±2σ",
      what: "A 20-period average with two standard-deviation bands that expand and contract with volatility.",
      read: [
        "Price near the lower band = stretched down; near the upper band = stretched up.",
        "A 'squeeze' (bands tightening) warns that a larger move is coming — but not which direction.",
      ],
    },
  ];

  const content = (
    <div
      className="fixed inset-0 z-[200001] flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar bg-[#0a0506] border border-gold-primary/40 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212,168,83,0.1)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0a0506]/95 backdrop-blur border-b border-gold-primary/20 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-white font-display text-base font-bold flex items-center gap-2">
              <span className="text-gold-primary">📊</span> Reading the Chart
            </h2>
            <p className="text-text-muted text-[11px] mt-0.5">
              MACD · RSI · Bollinger Bands — how this confluence works
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Intro */}
          <div className="bg-gold-primary/[0.04] border border-gold-primary/15 rounded-xl p-3.5">
            <p className="text-text-secondary text-xs leading-relaxed">
              No single indicator is reliable alone — MACD crossovers and Bollinger squeezes each win
              roughly <Tag tone="red">40–60%</Tag> of the time. The edge comes from{" "}
              <span className="text-gold-primary font-semibold">confluence</span>: waiting until all
              three agree. Backtests in 2026 put the combined setup around{" "}
              <Tag tone="green">73–77%</Tag>, mostly by filtering out false signals — not by predicting
              the future.
            </p>
          </div>

          {/* Each indicator */}
          {indicators.map((ind) => (
            <div key={ind.name} className="bg-[#0d0d0d] border border-white/5 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-sm">{ind.name}</h3>
                  <Tag tone={ind.tone}>{ind.tag}</Tag>
                </div>
                <span className="text-[10px] font-mono text-gold-primary/70 bg-gold-primary/10 px-2 py-0.5 rounded-[3px] border border-gold-primary/20">
                  {ind.setting}
                </span>
              </div>
              <p className="text-text-secondary text-xs leading-relaxed mb-2">{ind.what}</p>
              <ul className="space-y-1.5">
                {ind.read.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-text-muted leading-relaxed">
                    <span className="text-gold-primary/60 flex-shrink-0 mt-0.5">▸</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Confluence framework */}
          <div className="bg-gradient-to-br from-gold-primary/[0.08] to-transparent border border-gold-primary/20 rounded-xl p-3.5">
            <h3 className="text-gold-primary font-bold text-sm mb-2.5 flex items-center gap-2">
              <span>🎯</span> Putting It Together
            </h3>
            <ol className="space-y-2">
              {[
                "Check RSI first — is price oversold (<30) or overbought (>70)?",
                "Confirm with MACD — is the histogram flipping in the same direction?",
                "Verify with Bollinger — is price near a band, or coming out of a squeeze?",
                "Only act when all three line up the same way. If they disagree, wait.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-text-secondary leading-relaxed">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold-primary/15 border border-gold-primary/30 text-gold-primary text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Timeframe */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-xl p-3.5">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
              ⏱ Timeframe
            </h3>
            <p className="text-text-secondary text-xs leading-relaxed">
              This chart defaults to <Tag tone="gold">4H</Tag> — the sweet spot for swing setups: low
              noise, reliable confluence. <span className="text-white/70">1H</span> works for
              intraday; <span className="text-white/70">5m–15m</span> is faster but noisier. Checking
              the same setup across two timeframes filters out more false signals.
            </p>
          </div>

          {/* Disclaimer */}
          <div className="bg-red-500/[0.04] border border-red-500/15 rounded-xl p-3.5">
            <p className="text-text-muted text-[11px] leading-relaxed">
              <span className="text-red-400 font-semibold">A note on reality:</span> these are
              probability filters, not a crystal ball. They lag price, fire false signals in choppy
              markets, and no setup wins every time. LuxQuant surfaces the data — the decision is
              always yours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default IndicatorGuideModal;
