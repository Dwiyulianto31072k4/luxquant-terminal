// src/components/BTCCorrelationModal.jsx
// ════════════════════════════════════════════════════════════════
// BTCCorrelationModal — refactor ke <Modal> primitive.
// Shell standar (overlay, animasi, Esc, portal, sticky header, scroll,
// responsif 100dvh) dari Modal. Emoji dasar diganti ikon SVG bersih
// dalam badge solid (gaya dropdown menu). Logika data tidak diubah.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { Z } from "../constants/zIndex";
import CoinLogo from "./CoinLogo";

// ── Ikon SVG (line, bersih) ─────────────────────────────────────
function Icon({ d, className = "h-3.5 w-3.5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
const IC = {
  ruler: <><path d="M3 17 17 3l4 4L7 21z" /><path d="m7 11 1.5 1.5M11 7l1.5 1.5M11 15l1 1M15 11l1 1" /></>,
  shield: <path d="M12 3l8 3v5c0 4-3 7-8 9-5-2-8-5-8-9V6l8-3z" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  flame: <path d="M12 2c1.2 3 4 4.5 4 8.5A4 4 0 0 1 8 11c0-1.6.7-2.6 1.3-3.3.2 1.4.9 2.3 1.7 2.6-.4-3 .4-5.3 1-8.3z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
};

// ── Badge ikon solid (tinted bg + ring) ─────────────────────────
function IconBadge({ d, color, size = 24 }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        background: `${color}1f`,
        color,
        boxShadow: `inset 0 0 0 1px ${color}40`,
      }}
    >
      <Icon d={d} className="h-3.5 w-3.5" />
    </span>
  );
}

export default function BTCCorrelationModal({ signalId, pair, isOpen, onClose, zIndex = Z.nestedModal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !signalId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const token = localStorage.getItem("access_token");
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

  const header = (
    <div className="flex items-center gap-2.5 min-w-0">
      <CoinLogo pair={pair} size={30} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-white">{pair}</h2>
          <span className="flex-shrink-0 rounded border border-gold-primary/30 bg-gold-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-gold-primary">
            vs BTC
          </span>
        </div>
        <p className="truncate text-[10px] text-text-muted">BTC Correlation · snapshot at signal entry</p>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" padded={false} header={header} zIndex={zIndex}>
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-5">
        {loading && <LoadingSkeleton />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && data && <AnalysisBody data={data} />}
      </div>
    </Modal>
  );
}

/* ============================================================ */
function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-24 rounded-xl bg-gold-primary/5" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-lg bg-white/[0.03]" />)}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-16 rounded-lg bg-white/[0.03]" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-32 rounded-lg bg-white/[0.03]" />
        <div className="h-32 rounded-lg bg-white/[0.03]" />
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-primary/10 text-gold-primary ring-1 ring-gold-primary/25">
        <Icon d={IC.clock} className="h-5 w-5" />
      </span>
      <p className="mb-1 text-sm font-medium text-white">Analysis Pending</p>
      <p className="max-w-xs text-xs text-text-muted">{message}</p>
    </div>
  );
}

/* ============================================================ */
function AnalysisBody({ data }) {
  const { metrics, btc_context, interpretation, is_decoupled, is_extended,
          confidence, sample_size, data_source, snapshot_at } = data;

  const insufficient = confidence === "insufficient_data";
  const hasObservations = interpretation?.key_observations?.length > 0;

  return (
    <div className="space-y-4">
      <HeadlineBlock
        interpretation={interpretation}
        confidence={confidence}
        is_decoupled={is_decoupled}
        is_extended={is_extended}
        btc_context={btc_context}
      />

      {interpretation?.mapping_warning && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5">
          <IconBadge d={IC.alert} color="#e0a82e" size={22} />
          <div>
            <p className="text-[11px] font-semibold text-amber-300">Data Quality Notice</p>
            <p className="mt-0.5 text-[10px] text-amber-200/80">{interpretation.mapping_warning}</p>
          </div>
        </div>
      )}

      {interpretation?.summary && (
        <div className="rounded-lg border border-white/5 bg-[#0d0b09] p-3">
          <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-text-muted">Summary</p>
          <p className="text-xs leading-relaxed text-white/85">{interpretation.summary}</p>
        </div>
      )}

      {!insufficient && <CoreMetricsGrid metrics={metrics} />}
      {!insufficient && <AdvancedMetricsGrid metrics={metrics} />}

      {(hasObservations || !insufficient) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hasObservations && <KeyObservations observations={interpretation.key_observations} />}
          {!insufficient && <ActionableHints interpretation={interpretation} />}
        </div>
      )}

      <BtcContextBlock btc_context={btc_context} />

      <MetaFooter
        sample_size={sample_size}
        confidence={confidence}
        data_source={data_source}
        snapshot_at={snapshot_at}
      />
    </div>
  );
}

/* ============================================================ */
function HeadlineBlock({ interpretation, confidence, is_decoupled, is_extended, btc_context }) {
  const score = interpretation?.alignment_score;
  const risk = interpretation?.risk_level || "unknown";

  const riskStyles = {
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/25",
    high: "text-rose-400 bg-rose-500/10 border-rose-500/25",
    unknown: "text-gray-400 bg-gray-500/10 border-gray-500/25",
  };

  const regimeLabel = {
    risk_on_healthy: "Risk-On (Healthy)",
    risk_on_overheated: "Risk-On (Overheated)",
    risk_off: "Risk-Off",
    risk_off_oversold: "Risk-Off (Oversold)",
    neutral: "Neutral",
    insufficient_data: "Unknown",
  }[btc_context?.regime] || btc_context?.regime || "Unknown";

  const scoreColor =
    score == null ? "text-gray-400" :
    score >= 70 ? "text-emerald-400" :
    score >= 50 ? "text-amber-400" :
    "text-rose-400";

  return (
    <div className="rounded-xl border border-gold-primary/30 bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gold-primary/70">BTC Alignment</p>
          <p className="text-sm font-medium leading-tight text-white sm:text-base">
            {interpretation?.headline || "Analysis pending"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-mono text-3xl font-bold sm:text-4xl ${scoreColor}`}>{score ?? "—"}</div>
          <div className="text-[9px] uppercase tracking-wider text-text-muted">Score</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-bold ${riskStyles[risk]}`}>
          <span className="h-1 w-1 rounded-full bg-current" />
          {risk.toUpperCase()} RISK
        </span>
        {is_decoupled && (
          <span className="inline-flex items-center gap-1 rounded border border-gold-primary/30 bg-gold-primary/10 px-2 py-0.5 text-[9px] font-bold text-gold-primary">
            <Icon d={IC.bolt} className="h-2.5 w-2.5" /> DECOUPLED
          </span>
        )}
        {is_extended && (
          <span className="inline-flex items-center gap-1 rounded border border-gold-primary/30 bg-gold-primary/10 px-2 py-0.5 text-[9px] font-bold text-gold-primary">
            <Icon d={IC.flame} className="h-2.5 w-2.5" /> EXTENDED
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium text-white/60">
          {regimeLabel}
        </span>
        {confidence && confidence !== "insufficient_data" && (
          <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium text-white/40">
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
      <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-muted">Core Metrics</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <MetricCard label="ρ 1h/7d" value={metrics.corr_1h_7d} hint="Short-term" digits={2} signed />
        <MetricCard label="ρ 4h/30d" value={metrics.corr_4h_30d} hint="Long-term" digits={2} signed />
        <MetricCard label="Beta" value={metrics.beta_30d} hint="vs BTC" digits={2} />
        <MetricCard label="R²" value={metrics.r_squared_30d} hint="Explained" digits={2} />
        <MetricCard label="Z-Score" value={metrics.corr_zscore} hint="Deviation" digits={2} signed />
      </div>
    </div>
  );
}

function AdvancedMetricsGrid({ metrics }) {
  return (
    <div>
      <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-muted">Advanced Metrics</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Tail ρ (BTC ↓)" value={metrics.tail_corr_btc_down} hint="BTC-down corr" digits={2} signed />
        <MetricCard label="Tail ρ (BTC ↑)" value={metrics.tail_corr_btc_up} hint="BTC-up corr" digits={2} signed />
        <MetricCard label="Downside β" value={metrics.downside_beta} hint="vs BTC-down" digits={2} />
        <MetricCard label="Lead/Lag" value={metrics.lead_lag_hours} hint="Hours" digits={0} signed suffix="h" />
        <MetricCard label="Vol Ratio" value={metrics.volatility_ratio} hint="× BTC" digits={2} suffix="×" />
        <MetricCard label="7d Δ vs BTC" value={metrics.momentum_divergence_7d} hint="Outperformance" digits={1} signed suffix="%" />
      </div>
      {metrics.coin_volatility_pct != null && (
        <p className="mt-1.5 text-center text-[10px] text-text-muted">
          Coin annualized volatility: <span className="font-mono font-medium text-white">{metrics.coin_volatility_pct.toFixed(0)}%</span>
        </p>
      )}
    </div>
  );
}

function KeyObservations({ observations }) {
  return (
    <div>
      <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-muted">Key Observations</p>
      <div className="space-y-1.5">
        {observations.map((obs, i) => (
          <div key={i} className="rounded-lg border border-white/5 bg-[#0d0b09] px-3 py-2">
            <p className="text-[11px] leading-relaxed text-white/85">{obs}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionableHints({ interpretation }) {
  const items = [
    { d: IC.ruler, label: "Sizing", text: interpretation.sizing_hint, color: "#d4a853" },
    { d: IC.shield, label: "Hedge", text: interpretation.hedge_hint, color: "#d4a853" },
    { d: IC.target, label: "Bias", text: interpretation.trade_bias, color: "#d4a853" },
  ].filter((i) => i.text);

  if (interpretation.regime_warning) {
    items.push({ d: IC.alert, label: "Warning", text: interpretation.regime_warning, color: "#e0a82e", textClass: "text-amber-300" });
  }
  if (interpretation.decoupling_note) {
    items.push({ d: IC.bolt, label: "Catalyst", text: interpretation.decoupling_note, color: "#d4a853" });
  }

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-muted">Trade Guidance</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-[#0d0b09] px-3 py-2">
            <span className="mt-0.5">
              <IconBadge d={item.d} color={item.color} size={22} />
            </span>
            <p className={`text-[11px] leading-relaxed ${item.textClass || "text-white/80"}`}>
              <span className="mr-1 font-semibold text-text-muted">{item.label}:</span>
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BtcContextBlock({ btc_context }) {
  if (!btc_context) return null;

  const fmt = (n, digits = 2) => (n == null ? "—" : Number(n).toFixed(digits));
  const fmtPrice = (n) => (n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  const fmtPct = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + Number(n).toFixed(2) + "%");

  const changeColor = (btc_context.change_24h_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div>
      <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-text-muted">BTC Context (at signal time)</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/5 bg-[#0d0b09] p-3 sm:grid-cols-4">
        <SnapshotItem label="Price" value={fmtPrice(btc_context.price)} />
        <SnapshotItem label="RSI 14" value={fmt(btc_context.rsi_14, 1)} />
        <SnapshotItem label="24h Δ" value={fmtPct(btc_context.change_24h_pct)} valueClass={changeColor} />
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
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 text-[10px] sm:grid-cols-4">
      <div>
        <p className="text-text-muted">Sample size</p>
        <p className="font-mono text-white/70">{sample_size ?? 0} samples</p>
      </div>
      <div>
        <p className="text-text-muted">Confidence</p>
        <p className="capitalize text-white/70">{(confidence || "—").replace("_", " ")}</p>
      </div>
      <div>
        <p className="text-text-muted">Source</p>
        <p className="capitalize text-white/70">{data_source || "—"}</p>
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
    <div className="rounded-lg border border-white/5 bg-[#0d0b09] p-2">
      <div className="text-[8px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-white">{display}</div>
      <div className="text-[8px] text-white/30">{hint}</div>
    </div>
  );
}

function SnapshotItem({ label, value, valueClass = "text-white/85" }) {
  return (
    <div>
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className={`font-mono text-xs font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}
