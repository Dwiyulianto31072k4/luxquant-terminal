import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "./CoinLogo";

/**
 * BTCCorrelationModal
 * --------------------
 * Full overlay popup showing complete BTC correlation analysis.
 * Shell matches SignalModal / DeepAnalysis: dynamic width on desktop,
 * full-screen sheet on mobile, gold hairline + glow, coin logo header.
 *
 * Usage:
 *   <BTCCorrelationModal
 *     signalId={signal.signal_id}
 *     pair={signal.pair}
 *     isOpen={showBtcCorrelation}
 *     onClose={() => setShowBtcCorrelation(false)}
 *   />
 */
export default function BTCCorrelationModal({ signalId, pair, isOpen, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  // Escape to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch data
  useEffect(() => {
    if (!isOpen || !signalId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const token   = localStorage.getItem("access_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/v1/signals/${signalId}/btc-correlation`, { headers })
      .then((r) => {
        if (r.status === 404) {
          if (!cancelled) setError("Correlation analysis is still being computed by the worker. Try again in a moment.");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (d && !cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, signalId]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!isOpen) return null;

  const content = (
    <>
      <div className={`btc-corr-overlay ${isClosing ? "btc-corr-closing" : ""}`}>
        <div className="btc-corr-backdrop" onClick={handleClose} />
        <div className="btc-corr-container">
          <div className="btc-corr-content">
            {/* Drag handle mobile */}
            <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* HEADER */}
            <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-3 sm:px-4 py-2.5 z-10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CoinLogo pair={pair} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-display text-sm font-semibold truncate">{pair}</h2>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 bg-gold-primary/10 text-gold-primary border border-gold-primary/30">
                        vs BTC
                      </span>
                    </div>
                    <p className="text-text-muted text-[10px] truncate">
                      BTC Correlation · snapshot at signal entry
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* BODY */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-[#0a0a0a]">
              <div className="max-w-6xl mx-auto px-3 py-4 sm:px-5 sm:py-5">
                {loading && <LoadingSkeleton />}
                {!loading && error && <ErrorState message={error} />}
                {!loading && data && <AnalysisBody data={data} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .btc-corr-overlay { position: fixed; inset: 0; z-index: 100100; display: flex; align-items: center; justify-content: center; isolation: isolate; }
        .btc-corr-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.85); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: bcBI .25s ease-out; }
        .btc-corr-container { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 0; }
        .btc-corr-content { position: relative; width: 100%; max-width: 1100px; height: 100%; background: #0a0506; border: 1px solid rgba(212,168,83,.4); display: flex; flex-direction: column; overflow: hidden; animation: bcCI .3s cubic-bezier(.16,1,.3,1); }

        @media(min-width:640px) {
          .btc-corr-container { padding: 12px; }
          .btc-corr-content { max-height: calc(100vh - 24px); border-radius: 16px; box-shadow: 0 25px 50px rgba(0,0,0,.5), 0 0 40px rgba(212,168,83,.1); }
        }
        @media(min-width:1024px) { .btc-corr-container { padding: 20px; } .btc-corr-content { max-height: 880px; } }
        @media(max-width:639px)  { .btc-corr-content { max-height: 100%; border-radius: 0; border: none; } }
        @supports(height:100dvh) { .btc-corr-overlay { height: 100dvh; } }

        .btc-corr-closing .btc-corr-backdrop { animation: bcBO .2s ease-in forwards; }
        .btc-corr-closing .btc-corr-content { animation: bcCO .2s ease-in forwards; }
        @keyframes bcBI { from{opacity:0} to{opacity:1} }
        @keyframes bcBO { from{opacity:1} to{opacity:0} }
        @keyframes bcCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes bcCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @media(max-width:639px) {
          .btc-corr-content { animation: bcUp .3s cubic-bezier(.16,1,.3,1); }
          .btc-corr-closing .btc-corr-content { animation: bcDn .2s ease-in forwards; }
          @keyframes bcUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
          @keyframes bcDn { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(40px)} }
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }
      `}</style>
    </>
  );

  return createPortal(content, document.body);
}

/* ============================================================
   Loading state
   ============================================================ */
function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-24 bg-gold-primary/5 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[1,2,3,4,5].map((i) => (
          <div key={i} className="h-16 bg-white/[0.03] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="h-16 bg-white/[0.03] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-32 bg-white/[0.03] rounded-lg" />
        <div className="h-32 bg-white/[0.03] rounded-lg" />
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-gold-primary/10 border border-gold-primary/25 flex items-center justify-center mb-3">
        <span className="text-xl">⏳</span>
      </div>
      <p className="text-white text-sm font-medium mb-1">Analysis Pending</p>
      <p className="text-text-muted text-xs max-w-xs">{message}</p>
    </div>
  );
}

/* ============================================================
   Main analysis body
   ============================================================ */
function AnalysisBody({ data }) {
  const { metrics, btc_context, interpretation, is_decoupled, is_extended,
          confidence, sample_size, data_source, snapshot_at } = data;

  const insufficient = confidence === "insufficient_data";
  const hasObservations = interpretation?.key_observations?.length > 0;

  return (
    <div className="space-y-4">
      {/* === HEADLINE BLOCK (hero) === */}
      <HeadlineBlock
        interpretation={interpretation}
        confidence={confidence}
        is_decoupled={is_decoupled}
        is_extended={is_extended}
        btc_context={btc_context}
      />

      {/* === MAPPING WARNING === */}
      {interpretation?.mapping_warning && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <p className="text-amber-300 text-[11px] font-semibold">Data Quality Notice</p>
            <p className="text-amber-200/80 text-[10px] mt-0.5">{interpretation.mapping_warning}</p>
          </div>
        </div>
      )}

      {/* === SUMMARY === */}
      {interpretation?.summary && (
        <div className="bg-[#0d0d0d] border border-white/5 rounded-lg p-3">
          <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-1.5">Summary</p>
          <p className="text-white/85 text-xs leading-relaxed">{interpretation.summary}</p>
        </div>
      )}

      {/* === METRICS (full width — uses horizontal space) === */}
      {!insufficient && <CoreMetricsGrid metrics={metrics} />}
      {!insufficient && <AdvancedMetricsGrid metrics={metrics} />}

      {/* === OBSERVATIONS + GUIDANCE (side-by-side on desktop) === */}
      {(hasObservations || !insufficient) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hasObservations && (
            <KeyObservations observations={interpretation.key_observations} />
          )}
          {!insufficient && <ActionableHints interpretation={interpretation} />}
        </div>
      )}

      {/* === BTC CONTEXT === */}
      <BtcContextBlock btc_context={btc_context} />

      {/* === META FOOTER === */}
      <MetaFooter
        sample_size={sample_size}
        confidence={confidence}
        data_source={data_source}
        snapshot_at={snapshot_at}
      />
    </div>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */
function HeadlineBlock({ interpretation, confidence, is_decoupled, is_extended, btc_context }) {
  const score = interpretation?.alignment_score;
  const risk  = interpretation?.risk_level || "unknown";

  const riskStyles = {
    low:     "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    medium:  "text-amber-400 bg-amber-500/10 border-amber-500/25",
    high:    "text-rose-400 bg-rose-500/10 border-rose-500/25",
    unknown: "text-gray-400 bg-gray-500/10 border-gray-500/25",
  };

  const regimeLabel = {
    risk_on_healthy:    "Risk-On (Healthy)",
    risk_on_overheated: "Risk-On (Overheated)",
    risk_off:           "Risk-Off",
    risk_off_oversold:  "Risk-Off (Oversold)",
    neutral:            "Neutral",
    insufficient_data:  "Unknown",
  }[btc_context?.regime] || btc_context?.regime || "Unknown";

  const scoreColor =
    score == null  ? "text-gray-400"    :
    score >= 70    ? "text-emerald-400" :
    score >= 50    ? "text-amber-400"   :
                     "text-rose-400";

  return (
    <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-xl border border-gold-primary/30 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-gold-primary/70 text-[9px] uppercase tracking-wider font-semibold mb-1">
            BTC Alignment
          </p>
          <p className="text-white font-medium text-sm sm:text-base leading-tight">
            {interpretation?.headline || "Analysis pending"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl sm:text-4xl font-bold font-mono ${scoreColor}`}>
            {score ?? "—"}
          </div>
          <div className="text-[9px] text-text-muted uppercase tracking-wider">Score</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border ${riskStyles[risk]}`}>
          <span className="w-1 h-1 rounded-full bg-current" />
          {risk.toUpperCase()} RISK
        </span>
        {is_decoupled && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border border-purple-500/30 text-purple-300 bg-purple-500/10">
            ⚡ DECOUPLED
          </span>
        )}
        {is_extended && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border border-orange-500/30 text-orange-300 bg-orange-500/10">
            🔥 EXTENDED
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium border border-white/10 text-white/60 bg-white/[0.03]">
          {regimeLabel}
        </span>
        {confidence && confidence !== "insufficient_data" && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium border border-white/10 text-white/40 bg-white/[0.03]">
            {confidence} confidence
          </span>
        )}
      </div>
    </div>
  );
}

function CoreMetricsGrid({ metrics }) {
  return (
    <div>
      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Core Metrics</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        <MetricCard label="ρ 1h/7d"  value={metrics.corr_1h_7d}    hint="Short-term"   digits={2} signed />
        <MetricCard label="ρ 4h/30d" value={metrics.corr_4h_30d}   hint="Long-term"    digits={2} signed />
        <MetricCard label="Beta"     value={metrics.beta_30d}      hint="vs BTC"       digits={2} />
        <MetricCard label="R²"       value={metrics.r_squared_30d} hint="Explained"    digits={2} />
        <MetricCard label="Z-Score"  value={metrics.corr_zscore}   hint="Deviation"    digits={2} signed />
      </div>
    </div>
  );
}

function AdvancedMetricsGrid({ metrics }) {
  return (
    <div>
      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Advanced Metrics</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        <MetricCard label="Tail ρ (BTC ↓)" value={metrics.tail_corr_btc_down}     hint="BTC-down corr"   digits={2} signed />
        <MetricCard label="Tail ρ (BTC ↑)" value={metrics.tail_corr_btc_up}       hint="BTC-up corr"     digits={2} signed />
        <MetricCard label="Downside β"     value={metrics.downside_beta}          hint="vs BTC-down"     digits={2} />
        <MetricCard label="Lead/Lag"       value={metrics.lead_lag_hours}         hint="Hours"           digits={0} signed suffix="h" />
        <MetricCard label="Vol Ratio"      value={metrics.volatility_ratio}       hint="× BTC"           digits={2} suffix="×" />
        <MetricCard label="7d Δ vs BTC"    value={metrics.momentum_divergence_7d} hint="Outperformance"  digits={1} signed suffix="%" />
      </div>
      {metrics.coin_volatility_pct != null && (
        <p className="text-text-muted text-[10px] mt-1.5 text-center">
          Coin annualized volatility: <span className="text-white font-mono font-medium">{metrics.coin_volatility_pct.toFixed(0)}%</span>
        </p>
      )}
    </div>
  );
}

function KeyObservations({ observations }) {
  return (
    <div>
      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Key Observations</p>
      <div className="space-y-1.5">
        {observations.map((obs, i) => (
          <div key={i} className="bg-[#0d0d0d] border border-white/5 rounded-lg px-3 py-2">
            <p className="text-white/85 text-[11px] leading-relaxed">{obs}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionableHints({ interpretation }) {
  const items = [
    { icon: "📏", label: "Sizing",   text: interpretation.sizing_hint },
    { icon: "🛡️", label: "Hedge",    text: interpretation.hedge_hint },
    { icon: "🎯", label: "Bias",     text: interpretation.trade_bias },
  ].filter((i) => i.text);

  if (interpretation.regime_warning) {
    items.push({ icon: "⚠️", label: "Warning",  text: interpretation.regime_warning, className: "text-amber-300" });
  }
  if (interpretation.decoupling_note) {
    items.push({ icon: "⚡", label: "Catalyst", text: interpretation.decoupling_note, className: "text-purple-300" });
  }

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Trade Guidance</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="bg-[#0d0d0d] border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="text-sm mt-0.5">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] leading-relaxed ${item.className || "text-white/80"}`}>
                <span className="text-text-muted font-semibold mr-1">{item.label}:</span>
                {item.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BtcContextBlock({ btc_context }) {
  if (!btc_context) return null;

  const fmt = (n, digits = 2) => n == null ? "—" : Number(n).toFixed(digits);
  const fmtPrice = (n) => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct   = (n) => n == null ? "—" : (n > 0 ? "+" : "") + Number(n).toFixed(2) + "%";

  const changeColor = (btc_context.change_24h_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div>
      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">BTC Context (at signal time)</p>
      <div className="bg-[#0d0d0d] border border-white/5 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SnapshotItem label="Price"     value={fmtPrice(btc_context.price)} />
        <SnapshotItem label="RSI 14"    value={fmt(btc_context.rsi_14, 1)} />
        <SnapshotItem label="24h Δ"     value={fmtPct(btc_context.change_24h_pct)} valueClass={changeColor} />
        <SnapshotItem label="Dominance" value={btc_context.dominance ? `${btc_context.dominance.toFixed(1)}%` : "—"} />
      </div>
    </div>
  );
}

function MetaFooter({ sample_size, confidence, data_source, snapshot_at }) {
  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="pt-2 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
      <div>
        <p className="text-text-muted">Sample size</p>
        <p className="text-white/70 font-mono">{sample_size ?? 0} samples</p>
      </div>
      <div>
        <p className="text-text-muted">Confidence</p>
        <p className="text-white/70 capitalize">{(confidence || "—").replace("_", " ")}</p>
      </div>
      <div>
        <p className="text-text-muted">Source</p>
        <p className="text-white/70 capitalize">{data_source || "—"}</p>
      </div>
      <div>
        <p className="text-text-muted">Snapshot</p>
        <p className="text-white/70">{formatDate(snapshot_at)}</p>
      </div>
    </div>
  );
}

/* ---- atoms ---- */
function MetricCard({ label, value, hint, digits = 2, signed = false, suffix = "" }) {
  let display = "—";
  if (value != null && !Number.isNaN(value)) {
    const num = Number(value);
    display = num.toFixed(digits);
    if (signed && num > 0) display = "+" + display;
    display = display + suffix;
  }
  return (
    <div className="bg-[#0d0d0d] border border-white/5 rounded-lg p-2">
      <div className="text-[8px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-semibold text-white mt-0.5">{display}</div>
      <div className="text-[8px] text-white/30">{hint}</div>
    </div>
  );
}

function SnapshotItem({ label, value, valueClass = "text-white/85" }) {
  return (
    <div>
      <p className="text-text-muted text-[10px]">{label}</p>
      <p className={`font-mono font-medium text-xs ${valueClass}`}>{value}</p>
    </div>
  );
}