import { createPortal } from "react-dom";
import { useEffect } from "react";

// ════════════════════════════════════════════════════════════════
// Indicator education modal — content grounded in 2026 crypto TA
// research. Philosophy: "inform, don't decide" — explains how to
// read signals, never tells the user what to trade.
// ════════════════════════════════════════════════════════════════

// ─── Inline SVG icon set (solid, theme-gold) ───
const I = {
  chart: (c = "w-5 h-5") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M3 3a1 1 0 0 1 1 1v15h16a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><rect x="6" y="11" width="3" height="6" rx="1"/><rect x="11" y="7" width="3" height="10" rx="1"/><rect x="16" y="9" width="3" height="8" rx="1"/></svg>
  ),
  wave: (c = "w-4 h-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M2 12a1 1 0 0 1 1-1c1.5 0 2.3-1 3.2-2.4C7.3 7 8.5 5 11 5s3.7 2 4.8 3.6C16.7 10 17.5 11 19 11h2a1 1 0 1 1 0 2c-2.5 0-3.7-2-4.8-3.6C15.3 8 14.5 7 13 7s-2.3 1-3.2 2.4C8.7 11 7.5 13 5 13H3a1 1 0 0 1-1-1Z"/><path d="M2 17a1 1 0 0 1 1-1c2.5 0 3.7-2 4.8-3.6C8.7 11 9.5 10 11 10v2c-.5 0-1.3 1-2.2 2.4C7.7 16 6.5 18 4 18H3a1 1 0 0 1-1-1Z" opacity=".5"/></svg>
  ),
  gauge: (c = "w-4 h-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a9 9 0 0 0-9 9 1 1 0 0 0 1 1h2a1 1 0 1 0 0-2h-.9A7 7 0 0 1 11 5.1V6a1 1 0 1 0 2 0v-.9A7 7 0 0 1 18.9 11H18a1 1 0 1 0 0 2h2a1 1 0 0 0 1-1 9 9 0 0 0-9-9Z"/><path d="M15.5 9.5a1 1 0 0 1 .2 1.4l-2.4 3.2a2 2 0 1 1-1.6-1.2l2.4-3.2a1 1 0 0 1 1.4-.2Z"/></svg>
  ),
  bands: (c = "w-4 h-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" opacity=".5"/><path d="M20 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" opacity=".5"/><path d="M12 7a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="2"/></svg>
  ),
  target: (c = "w-5 h-5") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z"/></svg>
  ),
  clock: (c = "w-5 h-5") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 9.6 3.3 1.9a1 1 0 0 1-1 1.7l-3.8-2.2a1 1 0 0 1-.5-.9V7a1 1 0 0 1 2 0Z"/></svg>
  ),
  shield: (c = "w-5 h-5") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 .4.1l7 3A1 1 0 0 1 20 6c0 5.5-2.9 10.4-7.6 12.9a1 1 0 0 1-.8 0C6.9 16.4 4 11.5 4 6a1 1 0 0 1 .6-.9l7-3A1 1 0 0 1 12 2Zm-1.2 12.7 4.5-4.5a1 1 0 0 0-1.4-1.4l-3.8 3.8-1.4-1.4a1 1 0 0 0-1.4 1.4l2.1 2.1a1 1 0 0 0 1.4 0Z"/></svg>
  ),
  close: (c = "w-3.5 h-3.5") => (
    <svg className={c} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
  ),
  arrow: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M9 6a1 1 0 0 1 1.7-.7l5 5a1 1 0 0 1 0 1.4l-5 5A1 1 0 0 1 9 16Z"/></svg>
  ),
};

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
      gold: "bg-gold-primary/12 text-gold-primary border-line/30",
      green: "bg-green-500/12 text-green-400 border-green-500/30",
      red: "bg-red-500/12 text-red-400 border-red-500/30",
      blue: "bg-blue-400/12 text-blue-300 border-blue-400/30",
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold border ${tones[tone]}`}>
        {children}
      </span>
    );
  };

  const indicators = [
    {
      name: "MACD", icon: I.wave, tag: "Momentum / Trend", tone: "blue",
      setting: "12 / 26 / 9",
      what: "Tracks the relationship between two moving averages to reveal trend direction and momentum shifts. It lives in the lower pane as two lines plus a histogram.",
      read: [
        "Histogram flipping from negative to positive signals buying momentum entering the market (and vice-versa).",
        "An expanding histogram in the crossover direction means conviction; a shrinking one warns of a weak or fading signal.",
        "The two lines crossing (the 'signal cross') is the classic trigger — but it lags, so confirm it with the others.",
      ],
    },
    {
      name: "RSI", icon: I.gauge, tag: "Momentum Extremes", tone: "gold",
      setting: "14 period",
      what: "A 0–100 oscillator measuring whether price is overextended in either direction. Sits in its own lower pane with 30 / 70 reference lines.",
      read: [
        "Above 70 = overbought (price may cool off). Below 30 = oversold (a bounce becomes more likely).",
        "The 40–70 band during an uptrend often marks healthy strength without being overbought yet.",
        "Divergence — price making a new high while RSI doesn't — is an early warning the move is tiring.",
      ],
    },
    {
      name: "Bollinger Bands", icon: I.bands, tag: "Volatility", tone: "green",
      setting: "20 SMA, ±2σ",
      what: "A 20-period average with two standard-deviation bands that expand and contract with volatility. Drawn directly over price on the main chart.",
      read: [
        "Price near the lower band = stretched down; near the upper band = stretched up.",
        "A 'squeeze' (bands tightening) warns a larger move is coming — but never which direction on its own.",
        "In a strong trend, price can 'ride' one band for a while — band touch alone isn't a reversal.",
      ],
    },
  ];

  const steps = [
    { t: "Check RSI first", d: "Is price oversold (below 30) or overbought (above 70)? This frames whether you're hunting a bounce or a fade." },
    { t: "Confirm with MACD", d: "Is the histogram flipping in the same direction? Momentum should agree with the RSI read, not fight it." },
    { t: "Verify with Bollinger", d: "Is price near a band, or coming out of a squeeze? This adds the volatility context that times the move." },
    { t: "Only act on alignment", d: "Enter only when all three point the same way. If they disagree, the highest-probability move is to wait." },
  ];

  const content = (
    <div className="lq-guide-root fixed inset-0 flex items-end sm:items-center justify-center" style={{ zIndex: 210000 }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      <div
        className="lq-guide-card relative w-full sm:w-[92vw] sm:max-w-[920px] max-h-[min(92dvh,100%)] overflow-y-auto custom-scrollbar bg-surface border-t border-gold-primary/40 sm:border rounded-t-3xl sm:rounded-2xl shadow-[0_-20px_60px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden sticky top-0 z-30 bg-surface" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        {/* ─── Header ─── */}
        <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-line/20 px-5 sm:px-7 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gold-primary/12 border border-line/30 flex items-center justify-center text-gold-primary flex-shrink-0">
              {I.chart("w-5 h-5")}
            </div>
            <div className="min-w-0">
              <h2 className="text-text-primary font-display text-base sm:text-lg font-bold truncate">Reading the Chart</h2>
              <p className="text-text-muted text-[11px] sm:text-xs truncate">MACD · RSI · Bollinger Bands — how this confluence works</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary bg-surface-raised hover:bg-red-500/20 border border-line/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0">
            {I.close()}
          </button>
        </div>

        {/* ─── Body ─── */}
        <div className="px-5 sm:px-7 py-5 space-y-5">

          {/* Intro / confluence */}
          <div className="relative overflow-hidden bg-gradient-to-br from-gold-primary/[0.07] to-transparent border border-line/20 rounded-xl p-4 sm:p-5">
            <p className="text-text-secondary text-xs sm:text-sm leading-relaxed">
              No single indicator is reliable alone — MACD crossovers and Bollinger squeezes each win roughly{" "}
              <Tag tone="red">40–60%</Tag> of the time. The edge comes from <span className="text-gold-primary font-semibold">confluence</span>:
              waiting until all three agree. Backtests in 2026 put the combined setup around <Tag tone="green">73–77%</Tag>,
              mostly by filtering out false signals — not by predicting the future.
            </p>
          </div>

          {/* Indicator cards grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            {indicators.map((ind) => (
              <div key={ind.name} className="flex flex-col bg-surface-raised border border-white/[0.06] rounded-xl p-4 hover:border-line/20 transition-colors">
                <div className="flex items-start justify-between mb-2.5 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gold-primary flex-shrink-0">{ind.icon("w-4 h-4")}</span>
                    <h3 className="text-text-primary font-bold text-sm truncate">{ind.name}</h3>
                  </div>
                  <span className="text-[9px] font-mono text-gold-primary/80 bg-gold-primary/10 px-1.5 py-0.5 rounded-[3px] border border-line/20 whitespace-nowrap flex-shrink-0">{ind.setting}</span>
                </div>
                <div className="mb-2.5"><Tag tone={ind.tone}>{ind.tag}</Tag></div>
                <p className="text-text-secondary text-[11px] leading-relaxed mb-3">{ind.what}</p>
                <ul className="space-y-2 mt-auto">
                  {ind.read.map((r, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-text-muted leading-relaxed">
                      <span className="text-gold-primary/60 flex-shrink-0 mt-[3px]">{I.arrow("w-2.5 h-2.5")}</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Putting it together */}
          <div className="bg-gradient-to-br from-gold-primary/[0.08] to-transparent border border-line/20 rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="text-gold-primary">{I.target("w-5 h-5")}</span>
              <h3 className="text-gold-primary font-bold text-sm sm:text-base">Putting It Together</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-3 bg-surface/60 border border-line/10 rounded-lg p-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gold-primary/15 border border-line/30 text-gold-primary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <p className="text-text-primary text-xs font-semibold mb-0.5">{s.t}</p>
                    <p className="text-text-muted text-[11px] leading-relaxed">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeframe + Risk — two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-gold-primary">{I.clock("w-4 h-4")}</span>
                <h3 className="text-text-primary font-bold text-sm">Timeframe</h3>
              </div>
              <p className="text-text-secondary text-[11px] sm:text-xs leading-relaxed">
                This chart defaults to <Tag tone="gold">4H</Tag> — the sweet spot for swing setups: low noise, reliable confluence.{" "}
                <span className="text-text-primary/70">1H</span> works for intraday; <span className="text-text-primary/70">5m–15m</span> is faster but noisier.
                Checking the same setup across two timeframes filters out even more false signals.
              </p>
            </div>
            <div className="bg-red-500/[0.04] border border-red-500/15 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-400">{I.shield("w-4 h-4")}</span>
                <h3 className="text-text-primary font-bold text-sm">A Note on Reality</h3>
              </div>
              <p className="text-text-muted text-[11px] sm:text-xs leading-relaxed">
                These are probability filters, not a crystal ball. They lag price, fire false signals in choppy markets, and no setup wins every time.
                LuxQuant surfaces the data — <span className="text-text-primary/70">the decision is always yours.</span>
              </p>
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line/15 px-5 sm:px-7 py-3 flex items-center justify-between">
          <p className="text-text-muted text-[10px] sm:text-[11px]">Inform, don't decide.</p>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-gold-primary/15 text-gold-primary border border-line/30 hover:bg-gold-primary/25 text-xs font-bold transition-all">Got it</button>
        </div>
      </div>

      <style>{`
        @media (min-width: 640px) {
          .lq-guide-card { box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 50px rgba(212,168,83,0.12); animation: lqGuideIn .3s cubic-bezier(.16,1,.3,1); }
        }
        @keyframes lqGuideIn { from { opacity: 0; transform: scale(.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
};

export default IndicatorGuideModal;
