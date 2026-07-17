import { useEffect, useState } from "react";
import { Ic } from "./signalIcons";

/**
 * BTCCorrelationBadge
 * --------------------
 * Compact badge in SignalModal header — shows alignment score + ρ/β preview.
 * Click → opens BTCCorrelationModal with full advanced analysis.
 *
 * Pattern matches CoinCategoryBadge (header trigger) + CoinUtilityModal (overlay).
 *
 * Usage:
 * <BTCCorrelationBadge
 * signalId={signal.signal_id}
 * onClick={() => setShowBtcCorrelation(true)}
 * />
 */
export default function BTCCorrelationBadge({ signalId, onClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!signalId) return;
    let cancelled = false;
    setLoading(true);

    const token = localStorage.getItem("access_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/v1/signals/${signalId}/btc-correlation`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signalId]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-ink/[0.02] border border-ink/5">
        <div className="w-2 h-2 rounded-full bg-ink/10 animate-pulse" />
        <span className="text-[9px] text-text-muted">BTC corr…</span>
      </div>
    );
  }

  // No data yet (worker hasn't processed)
  if (!data) {
    return null;
  }

  const { metrics, interpretation, is_decoupled, is_extended, confidence } = data;
  const score = interpretation?.alignment_score;
  const corr = metrics?.corr_4h_30d;
  const beta = metrics?.beta_30d;

  // Insufficient data — show neutral badge
  if (confidence === "insufficient_data") {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-ink/10 border border-line/20 hover:bg-ink/15 transition-all"
        title="BTC correlation analysis (limited data)"
      >
        <span className="flex items-center gap-1 text-[9px] text-text-muted">
          {Ic.warn("w-3 h-3")} BTC corr · limited data
        </span>
      </button>
    );
  }

  // Score color tier — only the NUMBER carries tone (Binance-style metric chip).
  // These text-* tokens auto-remap to WCAG-safe values on the Bright desk.
  const scoreColor =
    score == null
      ? "text-text-muted"
      : score >= 70
        ? "text-positive"
        : score >= 50
          ? "text-accent"
          : "text-negative";

  // Flag icon (prioritize the most important state).
  const flag = is_extended
    ? Ic.flame("w-3 h-3 text-accent")
    : is_decoupled
      ? Ic.zap("w-3 h-3 text-accent")
      : Ic.bars("w-3 h-3 text-text-muted");

  const fmtNum = (n, digits = 2) =>
    n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(digits);

  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-ink/[0.04] px-2 py-0.5 transition-colors hover:border-ink/20 hover:bg-ink/[0.08]"
      title="View full BTC correlation analysis"
    >
      <span className="flex items-center">{flag}</span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted">BTC</span>
      <span className={`font-mono text-[11px] font-bold tabular-nums ${scoreColor}`}>
        {score ?? "—"}
      </span>
      <span className="text-[8px] text-text-muted/50">·</span>
      <span className="font-mono text-[9px] tabular-nums text-text-secondary">ρ{fmtNum(corr)}</span>
      <span className="font-mono text-[9px] tabular-nums text-text-secondary">β{fmtNum(beta)}</span>
      <svg
        className="h-2.5 w-2.5 text-text-muted transition-colors group-hover:text-text-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
