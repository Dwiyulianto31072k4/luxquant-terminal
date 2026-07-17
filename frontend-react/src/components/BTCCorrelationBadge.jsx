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
 .then((d) => { if (!cancelled) setData(d); })
 .catch(() => { if (!cancelled) setData(null); })
 .finally(() => { if (!cancelled) setLoading(false); });

 return () => { cancelled = true; };
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
 className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-500/10 border border-gray-500/20 hover:bg-gray-500/15 transition-all"
 title="BTC correlation analysis (limited data)"
 >
 <span className="flex items-center gap-1 text-[9px] text-gray-400">
 {Ic.warn("w-3 h-3")} BTC corr · limited data
 </span>
 </button>
 );
 }

 // Score color tier
 const scoreColor =
 score == null ? "text-gray-400" :
 score >= 70 ? "text-profit" :
 score >= 50 ? "text-amber-400" :
 "text-rose-400";

 const scoreBg =
 score == null ? "bg-gray-500/10 border-gray-500/20" :
 score >= 70 ? "bg-profit/10 border-profit/25" :
 score >= 50 ? "bg-amber-500/10 border-amber-500/25" :
 "bg-rose-500/10 border-rose-500/25";

 // Flag icon (prioritize the most important)
 const flag = is_extended ? Ic.flame("w-3 h-3 text-orange-400") :
 is_decoupled ? Ic.zap("w-3 h-3 text-purple-400") :
 Ic.bars("w-3 h-3 text-text-primary/60");

 const fmtNum = (n, digits = 2) =>
 n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(digits);

 return (
 <button
 onClick={onClick}
 className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${scoreBg} hover:brightness-125 transition-all group`}
 title="View full BTC correlation analysis"
 >
 <span className="flex items-center">{flag}</span>
 <span className="text-[9px] text-text-primary/60 uppercase tracking-wider font-medium">BTC</span>
 <span className={`text-[10px] font-bold font-mono ${scoreColor}`}>{score ?? "—"}</span>
 <span className="text-[8px] text-text-primary/30">·</span>
 <span className="text-[9px] text-text-primary/70 font-mono">ρ{fmtNum(corr)}</span>
 <span className="text-[9px] text-text-primary/70 font-mono">β{fmtNum(beta)}</span>
 <svg
 className="w-2.5 h-2.5 text-text-primary/40 group-hover:text-text-primary/70 transition-colors"
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 >
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M9 5l7 7-7 7" />
 </svg>
 </button>
 );
}
