// src/components/edgelab/CalendarHeatmapTab.jsx
// v2 UX: insight band (best/worst day, streak) + larger cells, no redundant KPI strip
import { useMemo } from "react";
import { wrColor, WR_LEGEND, Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CELL = 15; // px per day cell
const GAP = 3;

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

const CalendarHeatmapTab = ({ data }) => {
  const { weeks, monthLabels, insights } = useMemo(() => {
    if (!data?.length) return { weeks: [], monthLabels: [], insights: [] };

    const byDate = {};
    for (const d of data) byDate[d.date] = d;

    const startDate = new Date(data[0].date + "T00:00:00Z");
    const endDate = new Date(data[data.length - 1].date + "T00:00:00Z");
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
          date: iso, inRange,
          total: cell?.total || 0, wins: cell?.wins || 0,
          win_rate: cell?.win_rate ?? null,
          month: cur.getUTCMonth(),
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      weekCols.push(week);
    }

    const labels = [];
    let lastMonth = -1;
    weekCols.forEach((week, idx) => {
      const first = week.find((d) => d.inRange) || week[0];
      if (first.month !== lastMonth) {
        labels.push({ colIdx: idx, label: MONTH_LABELS[first.month] });
        lastMonth = first.month;
      }
    });

    // insights: best & worst trading day (n>=3), longest green streak
    const active = data.filter((d) => d.total >= 3 && d.win_rate != null);
    const best = [...active].sort((a, b) => b.win_rate - a.win_rate)[0];
    const worst = [...active].sort((a, b) => a.win_rate - b.win_rate)[0];

    let streak = 0, bestStreak = 0, streakEnd = null;
    for (const d of data) {
      if (d.total > 0 && d.win_rate >= 75) {
        streak++;
        if (streak > bestStreak) { bestStreak = streak; streakEnd = d.date; }
      } else if (d.total > 0) streak = 0;
    }

    const ins = [];
    if (best)
      ins.push({ kind: "good", label: "Best day", value: `${fmtDate(best.date)} · ${best.win_rate.toFixed(0)}%`, sub: `${best.wins}/${best.total} resolved` });
    if (worst && best && worst.date !== best.date)
      ins.push({ kind: "bad", label: "Worst day", value: `${fmtDate(worst.date)} · ${worst.win_rate.toFixed(0)}%`, sub: `${worst.wins}/${worst.total} resolved` });
    if (bestStreak >= 2)
      ins.push({ kind: "neutral", label: "Longest hot streak", value: `${bestStreak} days`, sub: `consecutive days ≥75% WR, ending ${fmtDate(streakEnd)}` });

    return { weeks: weekCols, monthLabels: labels, insights: ins };
  }, [data]);

  if (!data?.length) return <EmptyState title="No calendar data" />;

  const gridWidth = weeks.length * (CELL + GAP);

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Each cell is one day; color intensity = that day's win rate (green strong, red weak). Scan left-to-right
        for streaks, regime shifts, or anomalous red days. Empty cells = no resolved signals.
      </Methodology>

      <Panel title="Daily win rate" meta={`${data.length} days`}>
        <div className="overflow-x-auto pb-1">
          <div style={{ minWidth: gridWidth + 30 }}>
            {/* month labels */}
            <div className="relative h-4 mb-1.5" style={{ marginLeft: 22 }}>
              {monthLabels.map((m, i) => (
                <div
                  key={i}
                  className="absolute text-[10px] font-mono uppercase tracking-wider text-white/40"
                  style={{ left: m.colIdx * (CELL + GAP) }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            <div className="flex items-start" style={{ gap: GAP }}>
              {/* dow labels */}
              <div className="flex flex-col" style={{ gap: GAP }}>
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={i}
                    className="text-[9px] font-mono uppercase text-white/30 flex items-center justify-center"
                    style={{ width: 18, height: CELL }}
                  >
                    {i % 2 === 1 ? d : ""}
                  </div>
                ))}
              </div>
              {/* week columns */}
              <div className="flex" style={{ gap: GAP }}>
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col" style={{ gap: GAP }}>
                    {week.map((cell, dIdx) => (
                      <div
                        key={dIdx}
                        className="rounded-[3px] transition hover:ring-1 hover:ring-white/40"
                        style={{
                          width: CELL, height: CELL,
                          background: cell.inRange ? wrColor(cell.win_rate, cell.total) : "transparent",
                          border: cell.inRange ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}
                        title={
                          cell.inRange
                            ? cell.total > 0
                              ? `${cell.date} · ${cell.wins}/${cell.total} · ${cell.win_rate?.toFixed(1)}%`
                              : `${cell.date} · no signals`
                            : ""
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-white/40">
          {WR_LEGEND.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3 rounded-[2px] border border-white/10" style={{ background: s.c }} />
              {s.l}
            </span>
          ))}
          <span className="ml-2 text-white/25 normal-case tracking-normal">· hover a cell for the day</span>
        </div>
      </Panel>
    </div>
  );
};

export default CalendarHeatmapTab;
