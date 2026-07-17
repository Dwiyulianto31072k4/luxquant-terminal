import React from "react";

const formatPct = (value, digits = 0) => {
 if (value == null || Number.isNaN(Number(value))) return "—";
 return `${(Number(value) * 100).toFixed(digits)}%`;
};

const formatPrice = (value) => {
 if (value == null || Number.isNaN(Number(value))) return "—";
 return `$${Number(value).toLocaleString("en-US", {
 maximumFractionDigits: 0,
 })}`;
};

const formatUsd = (value) => {
 if (value == null || Number.isNaN(Number(value))) return "—";
 const number = Number(value);
 if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
 if (number >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
 return `$${number.toFixed(0)}`;
};

const formatAge = (seconds) => {
 if (seconds == null || Number.isNaN(Number(seconds))) return "—";
 if (seconds < 60) return `${Math.round(seconds)}s`;
 if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
 return `${(seconds / 3600).toFixed(1)}h`;
};

const stageLabel = {
 collecting: "Collecting",
 calibration_ready: "Calibration ready",
 evaluation_ready: "Evaluation ready",
};

function StatCard({ label, value, note, tone = "neutral" }) {
 const toneClass = {
 good: "text-profit",
 warn: "text-amber-300",
 bad: "text-loss",
 neutral: "text-text-primary",
 }[tone];

 return (
 <div className="rounded-xl border border-ink/5 bg-ink/[0.025] p-4">
 <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/40">
 {label}
 </div>
 <div className={`mt-2 text-xl font-mono font-semibold ${toneClass}`}>
 {value}
 </div>
 <div className="mt-1 text-[11px] text-text-primary/40">{note}</div>
 </div>
 );
}

function ProgressBar({ value, color = "#f5c451" }) {
 const safeValue = Math.max(0, Math.min(1, Number(value) || 0));
 return (
 <div className="h-2 rounded-full overflow-hidden bg-ink/5">
 <div
 className="h-full rounded-full transition-all"
 style={{ width: `${safeValue * 100}%`, backgroundColor: color }}
 />
 </div>
 );
}

export default function LiquidityValidationPanel({ data }) {
 if (!data) {
 return (
 <section className="rounded-xl border border-ink/5 bg-ink/[0.02] p-5">
 <div className="text-sm text-text-primary/50">
 Liquidity validation monitoring is temporarily unavailable.
 </div>
 </section>
 );
 }

 const collector = data.collector || {};
 const forecast = data.forecast || {};
 const validation = data.validation || {};
 const recent = data.recent_window || {};
 const events = data.recent_events || [];
 const sampleSize = validation.sample_size || 0;
 const initialTarget = validation.minimum_sample || 20;
 const robustTarget = validation.robust_sample || 100;

 return (
 <section className="rounded-2xl border border-ink/5 bg-ink/[0.015] p-5 md:p-6">
 <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
 <div>
 <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-amber-300/70 mb-1">
 Phase 2 · Shadow validation
 </div>
 <h2 className="text-xl text-text-primary/90 font-medium">
 Liquidity Model Validation
 </h2>
 <p className="text-xs text-text-primary/45 mt-1 max-w-2xl">
 Estimated clusters are compared with actual Binance liquidations.
 This panel observes quality only and cannot activate deterministic
 direction.
 </p>
 </div>
 <span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-200">
 {stageLabel[data.stage] || data.stage}
 </span>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
 <StatCard
 label="Collector"
 value={collector.healthy ? "Connected" : "Attention"}
 note={`heartbeat ${formatAge(collector.age_seconds)} ago`}
 tone={collector.healthy ? "good" : "bad"}
 />
 <StatCard
 label="Forecast"
 value={forecast.fresh ? "Fresh" : "Unavailable"}
 note={`${forecast.level_count || 0} levels · age ${formatAge(forecast.age_seconds)}`}
 tone={forecast.fresh ? "good" : "bad"}
 />
 <StatCard
 label="Actual Sample"
 value={`${sampleSize}/${initialTarget}`}
 note={`${validation.matched_events || 0} matched · ${validation.missed_events || 0} missed`}
 tone={sampleSize >= initialTarget ? "good" : "warn"}
 />
 <StatCard
 label="Model Confidence"
 value={formatPct(forecast.model_confidence)}
 note={`raw data confidence ${formatPct(forecast.data_confidence)}`}
 tone="warn"
 />
 </div>

 <div className="grid lg:grid-cols-2 gap-4 mb-5">
 <div className="rounded-xl border border-ink/5 bg-scrim/10 p-4">
 <div className="flex justify-between text-[11px] font-mono mb-2">
 <span className="text-text-primary/55">Initial calibration sample</span>
 <span className="text-text-primary/80">{sampleSize}/{initialTarget}</span>
 </div>
 <ProgressBar value={validation.initial_progress} />
 <div className="flex justify-between text-[11px] font-mono mt-4 mb-2">
 <span className="text-text-primary/55">Robust evaluation sample</span>
 <span className="text-text-primary/80">{sampleSize}/{robustTarget}</span>
 </div>
 <ProgressBar value={validation.robust_progress} color="#60a5fa" />
 <div className="mt-3 text-[10px] text-text-primary/35">
 Match tolerance: {formatPct(validation.match_tolerance_pct, 2)} from
 the nearest same-side predicted cluster.
 </div>
 </div>

 <div className="rounded-xl border border-ink/5 bg-scrim/10 p-4">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40 mb-3">
 Readiness gates
 </div>
 <div className="space-y-2">
 {(data.gates || []).map((gate) => (
 <div key={gate.key} className="flex items-start gap-2">
 <span
 className={`mt-0.5 text-xs ${
 gate.passed ? "text-profit" : "text-text-primary/25"
 }`}
 >
 {gate.passed ? "PASS" : "WAIT"}
 </span>
 <div>
 <div className="text-xs text-text-primary/75">{gate.label}</div>
 <div className="text-[10px] text-text-primary/35">{gate.detail}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-xs">
 <div>
 <div className="text-text-primary/35">Event hit rate</div>
 <div className="font-mono text-text-primary/80 mt-1">
 {formatPct(validation.event_hit_rate)}
 </div>
 </div>
 <div>
 <div className="text-text-primary/35">Notional hit rate</div>
 <div className="font-mono text-text-primary/80 mt-1">
 {formatPct(validation.notional_hit_rate)}
 </div>
 </div>
 <div>
 <div className="text-text-primary/35">Recent liquidation value</div>
 <div className="font-mono text-text-primary/80 mt-1">
 {formatUsd(recent.notional_usd)}
 </div>
 </div>
 <div>
 <div className="text-text-primary/35">Long / short events</div>
 <div className="font-mono text-text-primary/80 mt-1">
 {recent.long_events || 0} / {recent.short_events || 0}
 </div>
 </div>
 </div>

 {events.length > 0 ? (
 <div className="overflow-x-auto rounded-xl border border-ink/5">
 <table className="w-full min-w-[680px] text-left">
 <thead className="bg-ink/[0.025] text-[9px] font-mono uppercase tracking-wider text-text-primary/35">
 <tr>
 <th className="px-3 py-2">Time</th>
 <th className="px-3 py-2">Side</th>
 <th className="px-3 py-2">Actual price</th>
 <th className="px-3 py-2">Nearest cluster</th>
 <th className="px-3 py-2">Distance</th>
 <th className="px-3 py-2">Result</th>
 </tr>
 </thead>
 <tbody>
 {events.map((event, index) => (
 <tr
 key={`${event.event_time_iso || "event"}-${index}`}
 className="border-t border-ink/5 text-xs"
 >
 <td className="px-3 py-2 font-mono text-text-primary/50">
 {event.event_time_iso
 ? new Date(event.event_time_iso).toLocaleString()
 : "—"}
 </td>
 <td className={`px-3 py-2 font-mono ${
 event.side === "long" ? "text-loss" : "text-profit"
 }`}>
 {event.side || "—"}
 </td>
 <td className="px-3 py-2 font-mono text-text-primary/75">
 {formatPrice(event.price)}
 </td>
 <td className="px-3 py-2 font-mono text-text-primary/75">
 {formatPrice(event.nearest_level?.price)}
 </td>
 <td className="px-3 py-2 font-mono text-text-primary/55">
 {formatPct(event.distance_pct, 2)}
 </td>
 <td className={`px-3 py-2 font-mono ${
 event.matched ? "text-profit" : "text-loss"
 }`}>
 {event.matched ? "MATCHED" : "MISSED"}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <div className="rounded-xl border border-dashed border-ink/10 p-5 text-center">
 <div className="text-sm text-text-primary/50">
 No BTC liquidation event has arrived since collection started.
 </div>
 <div className="mt-1 text-[10px] font-mono text-text-primary/30">
 The collector remains healthy and will populate this table automatically.
 </div>
 </div>
 )}
 </section>
 );
}
