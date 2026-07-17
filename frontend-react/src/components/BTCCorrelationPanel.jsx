import React, { useEffect, useState } from "react";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";

/**
 * BTCCorrelationPanel
 * -------------------
 * Drop into SignalModal (or wherever you show signal detail).
 *
 * Usage:
 * <BTCCorrelationPanel signalId={signal.id} apiBase="/api/signals" />
 */

const RISK_STYLES = {
  low: "text-profit bg-profit/10 border-profit/25",
  medium: "text-accent bg-accent/10 border-accent/30",
  high: "text-negative bg-negative/10 border-negative/30",
  info: "text-accent bg-accent/10 border-accent/30",
};

const REGIME_LABEL = {
  risk_on_healthy: "Risk-On (Healthy)",
  risk_on_overheated: "Risk-On (Overheated)",
  risk_off: "Risk-Off",
  risk_off_oversold: "Risk-Off (Oversold)",
  neutral: "Neutral",
};

function scoreColor(s) {
  if (s == null) return "text-text-muted";
  if (s >= 70) return "text-profit";
  if (s >= 50) return "text-accent";
  return "text-negative";
}

export default function BTCCorrelationPanel({ signalId, apiBase = "/api/signals" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!signalId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${apiBase}/${signalId}/btc-correlation`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setError("Correlation analysis is still being computed by the worker.");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d && !cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signalId, apiBase]);

  if (loading) {
    return (
      <div className="p-4 space-y-3" role="status" aria-label="Loading BTC correlation analysis">
        <ShimmerStyles />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 !rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-5 w-16" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-text-muted text-sm border border-line/50 rounded-lg bg-ink/30">
        ⏳ {error || "No correlation data available."}
      </div>
    );
  }

  const {
    metrics,
    btc_context,
    interpretation,
    is_decoupled,
    sample_quality,
    data_source,
    computed_at,
  } = data;
  const riskClass = RISK_STYLES[interpretation.risk_level] || RISK_STYLES.medium;

  return (
    <div className="rounded-xl border border-line/50 bg-ink/60 backdrop-blur p-5 space-y-4 text-text-secondary">
      {/* === Header === */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            BTC Correlation Analysis
          </h3>
          <p className="text-text-primary font-medium mt-1 leading-snug">
            {interpretation.headline}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold ${scoreColor(interpretation.alignment_score)}`}>
            {interpretation.alignment_score}
          </div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider">Alignment</div>
        </div>
      </div>

      {/* === Badges === */}
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${riskClass}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {interpretation.risk_level.toUpperCase()} RISK
        </span>
        {is_decoupled && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-accent/30 text-accent bg-accent/10">
            ⚡ DECOUPLED
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-line text-text-muted bg-ink/50">
          {REGIME_LABEL[btc_context.regime] || btc_context.regime}
        </span>
      </div>

      {/* === Summary === */}
      <p className="text-sm text-text-secondary leading-relaxed">{interpretation.summary}</p>

      {/* === Metrics grid === */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MetricCard label="ρ 1h/7d" value={metrics.corr_1h_7d} hint="Short-term" />
        <MetricCard label="ρ 4h/30d" value={metrics.corr_4h_30d} hint="Medium-term" />
        <MetricCard label="Beta" value={metrics.beta_30d} hint="vs BTC" />
        <MetricCard label="R²" value={metrics.r_squared_30d} hint="Explained" />
        <MetricCard label="Z-Score" value={metrics.corr_zscore} hint="Deviation" />
      </div>

      {/* === Actionable hints === */}
      <div className="space-y-2 pt-2 border-t border-line">
        <HintRow icon="📏" label="Sizing" text={interpretation.sizing_hint} />
        <HintRow icon="🛡️" label="Hedge" text={interpretation.hedge_hint} />
        {interpretation.regime_warning && (
          <HintRow
            icon="⚠️"
            label="Warning"
            text={interpretation.regime_warning}
            className="text-accent"
          />
        )}
        {interpretation.decoupling_note && (
          <HintRow
            icon="⚡"
            label="Catalyst"
            text={interpretation.decoupling_note}
            className="text-accent"
          />
        )}
        <HintRow icon="🎯" label="Bias" text={interpretation.trade_bias} />
      </div>

      {/* === BTC snapshot === */}
      <div className="pt-3 border-t border-line grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <SnapshotItem label="BTC Price" value={`$${btc_context.price?.toLocaleString()}`} />
        <SnapshotItem label="RSI 14" value={btc_context.rsi_14} />
        <SnapshotItem
          label="24h Δ"
          value={`${btc_context.change_24h_pct > 0 ? "+" : ""}${btc_context.change_24h_pct}%`}
          valueClass={btc_context.change_24h_pct >= 0 ? "text-profit" : "text-negative"}
        />
        <SnapshotItem
          label="Dominance"
          value={btc_context.dominance ? `${btc_context.dominance}%` : "—"}
        />
      </div>

      {/* === Footer === */}
      <div className="text-[10px] text-text-muted flex justify-between pt-2">
        <span>
          Source: {data_source} · Quality: {sample_quality}
        </span>
        <span>{new Date(computed_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function MetricCard({ label, value, hint }) {
  const display = value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(2);
  return (
    <div className="bg-ink/50 rounded-lg p-2.5 border border-line/40">
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-lg font-mono font-semibold text-text-primary mt-0.5">{display}</div>
      <div className="text-[10px] text-text-muted">{hint}</div>
    </div>
  );
}

function HintRow({ icon, label, text, className = "" }) {
  if (!text) return null;
  return (
    <div className={`flex items-start gap-2 text-sm ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <span className="text-text-muted font-medium">{label}:</span>{" "}
        <span className="text-text-secondary">{text}</span>
      </div>
    </div>
  );
}

function SnapshotItem({ label, value, valueClass = "text-text-secondary" }) {
  return (
    <div>
      <div className="text-text-muted">{label}</div>
      <div className={`font-mono font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
