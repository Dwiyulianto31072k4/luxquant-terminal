import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * JourneyInsightsSection — Layer 7
 *
 * Fetches /api/v1/signals/journey-insights/{pair} and renders 6 sections:
 *   1. Entry Behavior
 *   2. Time to Each TP
 *   3. Drawdown Before Each TP
 *   4. Hit Rate per TP
 *   5. Peak Potential
 *   6. Risk Profile
 *
 * Designed to be injected between Outcome Distribution and Past Calls
 * in SignalHistoryTab. Renders nothing if insufficient_data / no_data.
 */

const formatPct = (val, withSign = true) => {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (Number.isNaN(n)) return "—";
  const prefix = withSign && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
};

const SectionHeader = ({ icon, title, sample }) => (
  <div className="flex items-center justify-between mb-2">
    <p className="text-white/40 text-[9px] sm:text-[10px] uppercase tracking-wider font-medium flex items-center gap-1.5">
      <span>{icon}</span>
      <span>{title}</span>
    </p>
    {sample !== undefined && sample !== null && (
      <span className="text-[9px] text-white/30 font-mono">n={sample}</span>
    )}
  </div>
);

const StatPill = ({ label, value, valueColor = "text-white", sublabel }) => (
  <div className="flex-1 min-w-[100px] bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-2">
    <p className="text-[9px] text-white/40 uppercase tracking-wider font-medium mb-0.5">
      {label}
    </p>
    <p className={`text-sm sm:text-base font-bold font-mono ${valueColor}`}>
      {value}
    </p>
    {sublabel && (
      <p className="text-[9px] text-white/40 mt-0.5">{sublabel}</p>
    )}
  </div>
);

// Compact table cell
const Cell = ({ children, className = "" }) => (
  <td className={`px-2 py-1.5 ${className}`}>{children}</td>
);

const TableHeader = ({ children, className = "" }) => (
  <th className={`px-2 py-1.5 text-[9px] text-white/40 uppercase tracking-wider font-medium text-left ${className}`}>
    {children}
  </th>
);

const JourneyInsightsSection = ({ pair }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!pair) return;
    let cancelled = false;

    const fetchInsights = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/signals/journey-insights/${pair}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, [pair]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-[#111]/80 rounded-xl p-3 border border-white/5 animate-pulse">
          <div className="h-3 bg-white/5 rounded w-1/3 mb-2" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white/[0.03] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Silent skip if error or insufficient
  if (err) return null;
  if (!data) return null;
  if (data.available === false) {
    if (data.reason === "insufficient_data") {
      return (
        <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
          <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
            <span>📊</span>
            <span>Behavior Insights</span>
          </p>
          <p className="text-white/40 text-xs">
            Need at least {data.min_required} signals to surface patterns.
            Currently {data.sample_size} available.
          </p>
        </div>
      );
    }
    return null;
  }

  const {
    entry_behavior,
    time_to_each_tp,
    drawdown_before_each_tp,
    hit_rate_per_tp,
    peak_potential,
    risk_profile,
    sample_size,
  } = data;

  const showTpThenSlWarning = risk_profile?.tp_then_sl_count > 0;

  return (
    <div className="space-y-3">
      {/* ──────────────────────────────────────── */}
      {/* 1. Entry Behavior                          */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader
          icon="🚪"
          title="Entry Behavior"
          sample={sample_size}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill
            label="Avg DD Before TP1"
            value={
              entry_behavior?.avg_drawdown_before_tp1_pct !== null
                ? formatPct(entry_behavior.avg_drawdown_before_tp1_pct)
                : "—"
            }
            valueColor={
              entry_behavior?.avg_drawdown_before_tp1_pct < -0.5
                ? "text-red-400"
                : "text-emerald-400"
            }
            sublabel={`across ${entry_behavior?.avg_drawdown_before_tp1_sample || 0} hits`}
          />
          <StatPill
            label="Smooth Entry Rate"
            value={
              entry_behavior?.smooth_entry_rate_pct !== null
                ? `${entry_behavior.smooth_entry_rate_pct}%`
                : "—"
            }
            valueColor="text-emerald-400"
            sublabel={`${entry_behavior?.smooth_entry_count || 0}/${entry_behavior?.smooth_entry_total || 0} signals`}
          />
          <StatPill
            label="Avg Time to TP1"
            value={entry_behavior?.avg_time_to_tp1_human || "—"}
            valueColor="text-white"
            sublabel="from entry"
          />
          <StatPill
            label="Fastest TP1"
            value={entry_behavior?.fastest_tp1_human || "—"}
            valueColor="text-emerald-400"
            sublabel="best ever"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 2. Time to Each TP                         */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader icon="⏱️" title="Time to Each TP" />
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="border-b border-white/5">
                <TableHeader>TP</TableHeader>
                <TableHeader>Avg</TableHeader>
                <TableHeader>Fastest</TableHeader>
                <TableHeader>Slowest</TableHeader>
                <TableHeader className="text-right">Sample</TableHeader>
              </tr>
            </thead>
            <tbody>
              {time_to_each_tp?.map((row) => (
                <tr key={row.tp} className="border-b border-white/[0.03] last:border-0">
                  <Cell>
                    <span className="text-[11px] font-bold text-white">{row.tp}</span>
                  </Cell>
                  <Cell>
                    <span className="text-[11px] font-mono text-white">
                      {row.avg_human || "—"}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="text-[11px] font-mono text-emerald-400/90">
                      {row.fastest_human || "—"}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="text-[11px] font-mono text-orange-400/80">
                      {row.slowest_human || "—"}
                    </span>
                  </Cell>
                  <Cell className="text-right">
                    <span className="text-[10px] font-mono text-white/40">
                      {row.sample_size}
                    </span>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 3. Drawdown Before Each TP                */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader icon="📉" title="Drawdown Before Each TP" />
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="border-b border-white/5">
                <TableHeader>Phase</TableHeader>
                <TableHeader>Avg DD</TableHeader>
                <TableHeader>Worst DD</TableHeader>
                <TableHeader className="text-right">Sample</TableHeader>
              </tr>
            </thead>
            <tbody>
              {drawdown_before_each_tp?.map((row) => (
                <tr key={row.phase} className="border-b border-white/[0.03] last:border-0">
                  <Cell>
                    <span className="text-[11px] font-medium text-white/80">{row.phase}</span>
                  </Cell>
                  <Cell>
                    <span className={`text-[11px] font-mono ${row.avg_dd_pct < 0 ? "text-red-400" : "text-white/40"}`}>
                      {row.avg_dd_pct !== null ? formatPct(row.avg_dd_pct) : "—"}
                    </span>
                  </Cell>
                  <Cell>
                    <span className={`text-[11px] font-mono ${row.worst_dd_pct < 0 ? "text-red-500" : "text-white/40"}`}>
                      {row.worst_dd_pct !== null ? formatPct(row.worst_dd_pct) : "—"}
                    </span>
                  </Cell>
                  <Cell className="text-right">
                    <span className="text-[10px] font-mono text-white/40">
                      {row.sample_size}
                    </span>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-white/30 mt-2">
          DD = how far price dipped during each phase (negative = adverse from trader perspective)
        </p>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 4. Hit Rate per TP                         */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader icon="🎯" title="Hit Rate per TP" />
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs min-w-[400px]">
            <thead>
              <tr className="border-b border-white/5">
                <TableHeader>TP</TableHeader>
                <TableHeader>Hit Rate</TableHeader>
                <TableHeader>Count</TableHeader>
                <TableHeader>Avg Exit Gain</TableHeader>
              </tr>
            </thead>
            <tbody>
              {hit_rate_per_tp?.map((row) => {
                const rate = row.hit_rate_pct;
                const isSL = row.tp === "SL";
                const rateColor = isSL
                  ? "text-red-400"
                  : rate >= 70
                    ? "text-emerald-400"
                    : rate >= 40
                      ? "text-yellow-400"
                      : "text-red-400";
                const barColor = isSL
                  ? "bg-red-500"
                  : rate >= 70
                    ? "bg-emerald-500"
                    : rate >= 40
                      ? "bg-yellow-500"
                      : "bg-red-500";
                return (
                  <tr key={row.tp} className="border-b border-white/[0.03] last:border-0">
                    <Cell>
                      <span className={`text-[11px] font-bold ${isSL ? "text-red-300" : "text-white"}`}>{row.tp}</span>
                    </Cell>
                    <Cell>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono font-bold ${rateColor}`}>
                          {rate !== null ? `${rate}%` : "—"}
                        </span>
                        <div className="flex-1 max-w-[60px] h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${Math.min(100, rate || 0)}%` }}
                          />
                        </div>
                      </div>
                    </Cell>
                    <Cell>
                      <span className="text-[11px] font-mono text-white/60">
                        {row.hit_count}/{row.total_count}
                      </span>
                    </Cell>
                    <Cell>
                      <span className={`text-[11px] font-mono ${isSL ? "text-red-400" : "text-emerald-400"}`}>
                        {row.avg_exit_gain_pct !== null ? formatPct(row.avg_exit_gain_pct) : "—"}
                      </span>
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 5. Peak Potential                          */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader icon="🚀" title="Peak Potential" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <StatPill
            label="Avg Peak Excursion"
            value={
              peak_potential?.avg_peak_excursion_pct !== null
                ? formatPct(peak_potential.avg_peak_excursion_pct)
                : "—"
            }
            valueColor="text-cyan-400"
            sublabel="beyond final outcome"
          />
          <StatPill
            label="Best Peak Ever"
            value={
              peak_potential?.best_peak_pct !== null
                ? formatPct(peak_potential.best_peak_pct)
                : "—"
            }
            valueColor="text-emerald-400"
            sublabel="single signal max"
          />
          <StatPill
            label="Avg Max Gain"
            value={
              peak_potential?.avg_max_gain_pct !== null
                ? formatPct(peak_potential.avg_max_gain_pct)
                : "—"
            }
            valueColor="text-emerald-400"
            sublabel="from entry to peak"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 6. Risk Profile                            */}
      {/* ──────────────────────────────────────── */}
      <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
        <SectionHeader icon="⚠️" title="Risk Profile" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <StatPill
            label="Avg Worst DD"
            value={
              risk_profile?.avg_worst_drawdown_pct !== null
                ? formatPct(risk_profile.avg_worst_drawdown_pct)
                : "—"
            }
            valueColor="text-red-400"
            sublabel="during trade"
          />
          <StatPill
            label="Worst DD Ever"
            value={
              risk_profile?.worst_drawdown_pct !== null
                ? formatPct(risk_profile.worst_drawdown_pct)
                : "—"
            }
            valueColor="text-red-500"
            sublabel="single signal max"
          />
          <StatPill
            label="Avg Time in Profit"
            value={
              risk_profile?.avg_time_in_profit_pct !== null
                ? `${risk_profile.avg_time_in_profit_pct}%`
                : "—"
            }
            valueColor="text-emerald-400"
            sublabel="of trade duration"
          />
        </div>

        {/* TP-then-SL warning (conditional) */}
        {showTpThenSlWarning && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-start gap-2">
            <span className="text-orange-400 text-sm flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-[11px] text-orange-300 font-semibold mb-0.5">
                TP-then-SL Risk: {risk_profile.tp_then_sl_count} of {risk_profile.tp_then_sl_total} trades ({risk_profile.tp_then_sl_pct}%)
              </p>
              <p className="text-[10px] text-orange-200/70 leading-snug">
                These trades hit TP1+ but reversed to SL. Consider moving SL to breakeven after TP1.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JourneyInsightsSection;
