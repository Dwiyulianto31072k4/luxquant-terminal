// src/components/edgelab/CalendarHeatmapTab.jsx
import { useMemo } from "react";

const cellColor = (wr, total) => {
  if (!total) return "rgba(255,255,255,0.03)";
  if (wr === null || wr === undefined) return "rgba(255,255,255,0.05)";
  if (wr >= 90) return "rgba(16,185,129,0.65)";
  if (wr >= 75) return "rgba(16,185,129,0.45)";
  if (wr >= 60) return "rgba(16,185,129,0.28)";
  if (wr >= 50) return "rgba(255,255,255,0.1)";
  if (wr >= 35) return "rgba(239,68,68,0.28)";
  return "rgba(239,68,68,0.5)";
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun-Sat
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CalendarHeatmapTab = ({ data }) => {
  // Build columns of weeks. Each cell = 1 day.
  const { weeks, totals, summary } = useMemo(() => {
    if (!data?.length) return { weeks: [], totals: 0, summary: null };

    // Index by date for fast lookup
    const byDate = {};
    let agg = { total: 0, wins: 0 };
    for (const d of data) {
      byDate[d.date] = d;
      agg.total += d.total;
      agg.wins += d.wins;
    }

    // Build calendar grid: column = week (Sun start), row = day-of-week
    const startStr = data[0].date;
    const endStr = data[data.length - 1].date;
    const startDate = new Date(startStr + "T00:00:00Z");
    const endDate = new Date(endStr + "T00:00:00Z");

    // Find Sunday on or before startDate
    const firstSunday = new Date(startDate);
    firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay());

    const weekCols = [];
    let cur = new Date(firstSunday);

    while (cur <= endDate) {
      const week = [];
      for (let dow = 0; dow < 7; dow++) {
        const iso = cur.toISOString().slice(0, 10);
        const inRange = cur >= startDate && cur <= endDate;
        const cell = byDate[iso];
        week.push({
          date: iso,
          inRange,
          total: cell?.total || 0,
          wins: cell?.wins || 0,
          win_rate: cell?.win_rate ?? null,
          month: cur.getUTCMonth(),
          day: cur.getUTCDate(),
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      weekCols.push(week);
    }

    const avgWr = agg.total > 0 ? (agg.wins / agg.total) * 100 : null;
    return {
      weeks: weekCols,
      totals: agg.total,
      summary: { ...agg, avg_wr: avgWr },
    };
  }, [data]);

  if (!data?.length) {
    return (
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No calendar data
        </div>
      </div>
    );
  }

  // Month label positions (above grid)
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((week, idx) => {
      const firstDayOfWeek = week.find((d) => d.inRange) || week[0];
      if (firstDayOfWeek.month !== lastMonth) {
        labels.push({ colIdx: idx, label: MONTH_LABELS[firstDayOfWeek.month] });
        lastMonth = firstDayOfWeek.month;
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="space-y-5">
      {/* Methodology */}
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-4 relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-2">
          · Calendar WR Heatmap ·
        </div>
        <p className="text-xs text-white/65 leading-relaxed">
          Daily win rate over the selected window. Each cell = one day, intensity = WR. Quickly
          spot streaks, regime shifts, or anomalous days.
        </p>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md bg-[#0a0805] border border-white/[0.06] px-4 py-3 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              Days
            </div>
            <div className="font-mono tabular-nums text-xl text-white/90 mt-1">{data.length}</div>
          </div>
          <div className="rounded-md bg-[#0a0805] border border-white/[0.06] px-4 py-3 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              Resolved
            </div>
            <div className="font-mono tabular-nums text-xl text-white/90 mt-1">{summary.total}</div>
          </div>
          <div className="rounded-md bg-[#0a0805] border border-white/[0.06] px-4 py-3 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              Wins
            </div>
            <div className="font-mono tabular-nums text-xl text-emerald-400 mt-1">
              {summary.wins}
            </div>
          </div>
          <div className="rounded-md bg-[#0a0805] border border-white/[0.06] px-4 py-3 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              Avg WR
            </div>
            <div className="font-mono tabular-nums text-xl text-white/95 mt-1">
              {summary.avg_wr !== null ? `${summary.avg_wr.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
      )}

      {/* Heatmap grid */}
      <div className="relative rounded-md bg-[#0a0805] border border-white/[0.06] p-5 overflow-x-auto">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        {/* Month labels */}
        <div className="relative h-4 mb-1.5 ml-7" style={{ minWidth: weeks.length * 14 }}>
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute text-[9px] font-mono uppercase tracking-wider text-white/40"
              style={{ left: m.colIdx * 14 }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Grid: dow rows on left, week columns flowing right */}
        <div className="flex items-start gap-1">
          {/* Day-of-week labels column */}
          <div className="flex flex-col gap-[2px] mr-1.5">
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                className="w-3 h-3 text-[8px] font-mono uppercase text-white/30 flex items-center justify-center"
              >
                {i % 2 === 1 ? d : ""}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex gap-[2px]">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-[2px]">
                {week.map((cell, dIdx) => {
                  const color = cell.inRange
                    ? cellColor(cell.win_rate, cell.total)
                    : "transparent";
                  const tooltip = cell.inRange
                    ? cell.total > 0
                      ? `${cell.date} · ${cell.wins}/${cell.total} · ${cell.win_rate?.toFixed(1)}%`
                      : `${cell.date} · no signals`
                    : null;
                  return (
                    <div
                      key={dIdx}
                      className="w-3 h-3 rounded-[2px] transition hover:ring-1 hover:ring-white/30"
                      style={{
                        background: color,
                        border: cell.inRange ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}
                      title={tooltip || ""}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-5 pt-4 border-t border-white/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-white/45">
          <span>Less</span>
          {[
            "rgba(239,68,68,0.5)",
            "rgba(239,68,68,0.28)",
            "rgba(255,255,255,0.1)",
            "rgba(16,185,129,0.28)",
            "rgba(16,185,129,0.45)",
            "rgba(16,185,129,0.65)",
          ].map((c, i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-[2px] border border-white/10"
              style={{ background: c }}
            />
          ))}
          <span>More</span>
          <span className="ml-3 text-white/30">· hover cell for details</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarHeatmapTab;
