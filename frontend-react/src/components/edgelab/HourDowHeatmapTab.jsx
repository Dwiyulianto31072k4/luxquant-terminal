// src/components/edgelab/HourDowHeatmapTab.jsx
import { useMemo } from "react";

const cellColor = (wr, total) => {
  if (!total) return "rgba(255,255,255,0.03)";
  if (wr === null || wr === undefined) return "rgba(255,255,255,0.05)";
  if (wr >= 90) return "rgba(16,185,129,0.6)";
  if (wr >= 75) return "rgba(16,185,129,0.42)";
  if (wr >= 60) return "rgba(16,185,129,0.25)";
  if (wr >= 50) return "rgba(255,255,255,0.08)";
  if (wr >= 35) return "rgba(239,68,68,0.25)";
  return "rgba(239,68,68,0.45)";
};

// Day-of-week labels (Postgres DOW: 0=Sun, 6=Sat)
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HourDowHeatmapTab = ({ data }) => {
  const { grid, totals } = useMemo(() => {
    // Build 7x24 lookup grid [dow][hour] = cell or null
    const g = Array.from({ length: 7 }, () => Array(24).fill(null));
    let agg = { total: 0, wins: 0 };
    if (data?.length) {
      for (const cell of data) {
        if (cell.dow >= 0 && cell.dow < 7 && cell.hour >= 0 && cell.hour < 24) {
          g[cell.dow][cell.hour] = cell;
          agg.total += cell.count;
          agg.wins += cell.wins;
        }
      }
    }
    return { grid: g, totals: agg };
  }, [data]);

  // Best & worst (hour, dow) combos with sufficient sample
  const { bestCell, worstCell } = useMemo(() => {
    if (!data?.length) return { bestCell: null, worstCell: null };
    const filtered = data.filter((c) => c.count >= 5);
    if (!filtered.length) return { bestCell: null, worstCell: null };
    const sorted = [...filtered].sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0));
    return { bestCell: sorted[0], worstCell: sorted[sorted.length - 1] };
  }, [data]);

  if (!data?.length) {
    return (
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No timing data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Methodology */}
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-4 relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-2">
          · Hour × Day-of-Week Timing ·
        </div>
        <p className="text-xs text-white/65 leading-relaxed">
          WR by hour (UTC) and day of week when signal was created. Identifies which windows
          produce reliable signals vs which to avoid. Cells with n &lt; 5 are dimmed.
        </p>
      </div>

      {/* Insights strip */}
      {(bestCell || worstCell) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bestCell && (
            <div className="rounded-md bg-emerald-500/[0.04] border border-emerald-500/20 px-4 py-3">
              <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-emerald-400/70">
                ⚡ Best Window
              </div>
              <div className="flex items-baseline gap-3 mt-1.5">
                <span className="font-mono tabular-nums text-lg text-emerald-400">
                  {bestCell.win_rate?.toFixed(1)}%
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-white/65">
                  {DOW_NAMES[bestCell.dow]} · {String(bestCell.hour).padStart(2, "0")}:00 UTC
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white/40">
                  {bestCell.wins}/{bestCell.count}
                </span>
              </div>
            </div>
          )}
          {worstCell && (
            <div className="rounded-md bg-red-500/[0.04] border border-red-500/20 px-4 py-3">
              <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-red-400/70">
                ⚠ Worst Window
              </div>
              <div className="flex items-baseline gap-3 mt-1.5">
                <span className="font-mono tabular-nums text-lg text-red-400">
                  {worstCell.win_rate?.toFixed(1)}%
                </span>
                <span className="text-xs font-mono uppercase tracking-wider text-white/65">
                  {DOW_NAMES[worstCell.dow]} ·{" "}
                  {String(worstCell.hour).padStart(2, "0")}:00 UTC
                </span>
                <span className="text-[10px] font-mono tabular-nums text-white/40">
                  {worstCell.wins}/{worstCell.count}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="relative rounded-md bg-[#0a0805] border border-white/[0.06] p-5 overflow-x-auto">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="flex items-start gap-2">
          {/* Hour labels column */}
          <div className="flex flex-col">
            <div className="h-5" /> {/* spacer for header */}
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="h-5 text-[9px] font-mono tabular-nums text-white/35 flex items-center justify-end pr-1"
                style={{ minWidth: 26 }}
              >
                {h % 3 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
              </div>
            ))}
          </div>

          {/* DOW columns */}
          {DOW_NAMES.map((dowName, dow) => (
            <div key={dow} className="flex flex-col">
              {/* DOW header */}
              <div className="h-5 text-[9px] font-mono uppercase tracking-wider text-white/40 flex items-center justify-center">
                {dowName}
              </div>
              {/* 24 hour cells */}
              {Array.from({ length: 24 }).map((_, hour) => {
                const cell = grid[dow][hour];
                const total = cell?.count || 0;
                const wr = cell?.win_rate ?? null;
                const dim = total > 0 && total < 5;
                const bg = cellColor(wr, total);
                const tooltip = cell
                  ? `${dowName} ${String(hour).padStart(2, "0")}:00 UTC · ${cell.wins}/${cell.count} · ${wr?.toFixed(1)}%`
                  : `${dowName} ${String(hour).padStart(2, "0")}:00 UTC · no data`;
                return (
                  <div
                    key={hour}
                    className="rounded-[2px] mb-[1px] mx-[1px] transition hover:ring-1 hover:ring-white/30"
                    style={{
                      width: 30,
                      height: 18,
                      background: bg,
                      opacity: dim ? 0.4 : 1,
                      border: total > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    }}
                    title={tooltip}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-white/45">
          <span>WR scale:</span>
          {[
            { l: "<35", c: "rgba(239,68,68,0.45)" },
            { l: "35-50", c: "rgba(239,68,68,0.25)" },
            { l: "50-60", c: "rgba(255,255,255,0.08)" },
            { l: "60-75", c: "rgba(16,185,129,0.25)" },
            { l: "75-90", c: "rgba(16,185,129,0.42)" },
            { l: "≥90", c: "rgba(16,185,129,0.6)" },
          ].map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: s.c }} />
              {s.l}%
            </span>
          ))}
          <span className="ml-3 text-white/30">· faint cells = n &lt; 5</span>
        </div>
      </div>
    </div>
  );
};

export default HourDowHeatmapTab;
