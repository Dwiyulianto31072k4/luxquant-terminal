import React, { useState } from "react";

const STAGE_STYLE = {
 collecting: {
 label: "Collecting",
 color: "#94a3b8",
 bg: "rgba(148,163,184,0.10)",
 },
 initial_review: {
 label: "Initial review",
 color: "rgb(var(--accent))",
 bg: "rgba(245,196,81,0.10)",
 },
 hold: {
 label: "Hold",
 color: "#ef4444",
 bg: "rgba(239,68,68,0.10)",
 },
 manual_review_ready: {
 label: "Manual review ready",
 color: "#22c55e",
 bg: "rgba(34,197,94,0.10)",
 },
};

function formatRate(value) {
 return value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;
}

function formatPp(value) {
 if (value == null) return "—";
 const number = Number(value);
 return `${number > 0 ? "+" : ""}${number.toFixed(1)} pp`;
}

function MetricCard({ label, value, note, tone = "#f5c451" }) {
 return (
 <div className="rounded-lg border border-ink/[0.06] bg-scrim/20 p-3">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/35 mb-2">
 {label}
 </div>
 <div
 className="text-xl font-semibold font-mono tabular-nums"
 style={{ color: tone }}
 >
 {value}
 </div>
 <div className="text-[10px] text-text-primary/40 mt-1">{note}</div>
 </div>
 );
}

function GateRow({ gate }) {
 const color = gate.passed ? "#22c55e" : "#94a3b8";
 let value = gate.value;
 if (value == null) value = "—";
 else if (gate.key === "baseline_edge" || gate.key === "calibration") {
 value = `${Number(value).toFixed(1)} pp`;
 } else {
 value = `${value}/${gate.target}`;
 }

 return (
 <div className="flex items-center justify-between gap-3 py-2 border-b border-ink/[0.04] last:border-0">
 <div className="flex items-center gap-2 min-w-0">
 <span
 className="w-4 h-4 rounded-full border flex items-center justify-center text-[9px] shrink-0"
 style={{
 color,
 borderColor: `${color}70`,
 backgroundColor: `${color}12`,
 }}
 >
 {gate.passed ? "✓" : "·"}
 </span>
 <span className="text-[11px] text-text-primary/60 truncate">{gate.label}</span>
 </div>
 <span className="text-[10px] font-mono text-text-primary/45 whitespace-nowrap">
 {value}
 </span>
 </div>
 );
}

function SegmentTable({ segments }) {
 if (!segments?.length) {
 return <div className="text-xs text-text-primary/35">No segment data yet.</div>;
 }

 return (
 <div className="w-full max-w-full overflow-x-auto">
 <table className="w-full min-w-[440px]">
 <thead>
 <tr className="text-[9px] font-mono uppercase tracking-wider text-text-primary/30">
 <th className="text-left py-2">Liquidity state</th>
 <th className="text-right py-2">Resolved</th>
 <th className="text-right py-2">Shadow n</th>
 <th className="text-right py-2">Baseline</th>
 <th className="text-right py-2">Shadow</th>
 <th className="text-right py-2">Edge</th>
 </tr>
 </thead>
 <tbody>
 {segments.map((segment) => (
 <tr
 key={segment.segment}
 className="border-t border-ink/[0.04] text-[11px]"
 >
 <td className="py-2 text-text-primary/60 capitalize">
 {segment.segment.replaceAll("_", " ")}
 </td>
 <td className="py-2 text-right font-mono text-text-primary/45">
 {segment.resolved_total}
 </td>
 <td className="py-2 text-right font-mono text-text-primary/60">
 {segment.shadow_eligible}
 </td>
 <td className="py-2 text-right font-mono text-text-primary/60">
 {formatRate(segment.baseline_hit_rate)}
 </td>
 <td className="py-2 text-right font-mono text-text-primary/60">
 {formatRate(segment.shadow_hit_rate)}
 </td>
 <td className="py-2 text-right font-mono text-text-primary/60">
 {formatPp(segment.shadow_edge_pp)}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );
}

function HorizonPanel({ horizon, data }) {
 const comparable = data?.comparable || {};
 const baseline = comparable.baseline || {};
 const shadow = comparable.shadow || {};
 const readiness = data?.readiness || {};
 const stage = STAGE_STYLE[readiness.stage] || STAGE_STYLE.collecting;
 const initialTarget = readiness.initial_sample_target || 20;
 const robustTarget = readiness.robust_sample_target || 100;
 const progress = Math.min(
 100,
 ((readiness.eligible_sample || 0) / robustTarget) * 100
 );

 return (
 <div className="min-w-0 rounded-xl border border-ink/[0.06] bg-ink/[0.015] p-4">
 <div className="flex items-start justify-between gap-3 mb-4">
 <div>
 <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-primary/35">
 Horizon
 </div>
 <div className="text-xl text-text-primary/90 font-medium">{horizon}</div>
 </div>
 <span
 className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded"
 style={{ color: stage.color, backgroundColor: stage.bg }}
 >
 {stage.label}
 </span>
 </div>

 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
 <MetricCard
 label="Baseline"
 value={formatRate(baseline.hit_rate)}
 note={`same sample · n=${baseline.total || 0}`}
 tone="#e2e8f0"
 />
 <MetricCard
 label="Shadow"
 value={formatRate(shadow.hit_rate)}
 note={`deterministic · n=${shadow.total || 0}`}
 tone="#f5c451"
 />
 <MetricCard
 label="Shadow edge"
 value={formatPp(comparable.shadow_edge_pp)}
 note="versus baseline"
 tone={
 comparable.shadow_edge_pp == null
 ? "#94a3b8"
 : comparable.shadow_edge_pp >= 3
 ? "#22c55e"
 : "#ef4444"
 }
 />
 <MetricCard
 label="Calibration gap"
 value={
 shadow.calibration_gap_pp == null
 ? "—"
 : `${Number(shadow.calibration_gap_pp).toFixed(1)} pp`
 }
 note={`Brier ${shadow.brier_score ?? "—"}`}
 tone={
 shadow.calibration_gap_pp != null &&
 shadow.calibration_gap_pp <= 10
 ? "#22c55e"
 : "#94a3b8"
 }
 />
 </div>

 <div className="mb-4">
 <div className="flex items-center justify-between text-[10px] font-mono text-text-primary/40 mb-1.5">
 <span>
 Shadow sample {readiness.eligible_sample || 0}/{robustTarget}
 </span>
 <span>initial review at {initialTarget}</span>
 </div>
 <div className="h-1.5 rounded-full bg-ink/[0.05] overflow-hidden">
 <div
 className="h-full rounded-full bg-accent"
 style={{ width: `${progress}%` }}
 />
 </div>
 </div>

 <div className="grid lg:grid-cols-2 gap-4">
 <div className="min-w-0 rounded-lg border border-ink/[0.05] bg-scrim/15 px-3">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/35 pt-3 pb-1">
 Activation gates
 </div>
 {(readiness.gates || []).map((gate) => (
 <GateRow key={gate.key} gate={gate} />
 ))}
 </div>
 <div className="min-w-0 overflow-hidden rounded-lg border border-ink/[0.05] bg-scrim/15 px-3">
 <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/35 pt-3 pb-1">
 Freshness segmentation
 </div>
 <SegmentTable segments={data?.segments?.liquidity_status} />
 </div>
 </div>

 <div className="mt-3 text-[10px] font-mono text-text-primary/30">
 Resolved baseline: {data?.resolved_total || 0} · shadow unavailable:{" "}
 {data?.shadow_ineligible || 0} · agreement{" "}
 {formatRate(data?.agreement?.agreement_rate)}
 </div>
 </div>
 );
}

export default function ModelCalibrationPanel({ data }) {
 const [horizon, setHorizon] = useState("24h");

 if (!data) {
 return (
 <section className="mb-8 rounded-xl border border-ink/[0.06] bg-ink/[0.015] p-5">
 <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent mb-2">
 Phase 5 · Model calibration
 </div>
 <div className="text-sm text-text-primary/45">
 Calibration audit is temporarily unavailable.
 </div>
 </section>
 );
 }

 return (
 <section className="min-w-0 mb-8">
 <div className="min-w-0 rounded-xl border border-ink/[0.06] bg-surface-secondary/80 p-4 md:p-5">
 <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
 <div>
 <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent mb-1">
 Phase 5 · Model calibration
 </div>
 <h2 className="text-xl md:text-2xl text-text-primary/90 font-medium">
 Shadow Model Reliability
 </h2>
 <p className="text-xs text-text-primary/45 mt-1 max-w-2xl leading-relaxed">
 Fair comparison against the user-facing baseline on identical
 outcomes, segmented by source health. This audit cannot activate
 or replace the verdict.
 </p>
 </div>
 <div className="flex gap-1 rounded-lg border border-ink/[0.06] bg-scrim/20 p-1">
 {["24h", "72h"].map((item) => (
 <button
 key={item}
 type="button"
 onClick={() => setHorizon(item)}
 className="px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors"
 style={{
 color: horizon === item ? "#f5c451" : "rgb(var(--ink) / .4)",
 backgroundColor:
 horizon === item ? "rgba(245,196,81,.10)" : "transparent",
 }}
 >
 {item}
 </button>
 ))}
 </div>
 </div>

 <HorizonPanel horizon={horizon} data={data.horizons?.[horizon]} />

 <div className="mt-4 flex items-center justify-between gap-3 flex-wrap text-[10px] font-mono">
 <span className="text-text-primary/30">
 Window {data.window_days}d · decision authority disabled
 </span>
 <span className="text-accent/70">
 Manual review required even after every gate passes
 </span>
 </div>
 </div>
 </section>
 );
}
