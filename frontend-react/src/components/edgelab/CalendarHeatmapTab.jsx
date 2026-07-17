// src/components/edgelab/CalendarHeatmapTab.jsx
// ════════════════════════════════════════════════════════════════
// v3 UX rebuild — large monthly calendar grid (drill-enabled)
//   · Real calendar months (not a 53-week strip)
//   · In-cell WR% as the hero metric, day number secondary
//   · Click a day with signals → onDrill({dimension:'calendar_day', ...})
//   · Reuses wrColor / WR_LEGEND from _shared for scale consistency
// ════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { wrColor, WR_LEGEND, Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmtShort = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const fmtFull = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });

// ─── Build calendar-month blocks from the continuous daily series ───
const buildMonths = (data, todayIso) => {
  if (!data?.length) return [];
  const map = {};
  for (const d of data) map[d.date] = d;

  const start = data[0].date;
  const end = data[data.length - 1].date;
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");

  const months = [];
  let y = startD.getUTCFullYear();
  let m = startD.getUTCMonth();
  const endY = endD.getUTCFullYear();
  const endM = endD.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null); // leading blanks
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const entry = map[iso] || null;
      const inRange = iso >= start && iso <= end;
      cells.push({ iso, day, entry, inRange, isToday: iso === todayIso });
    }
    months.push({ key: `${y}-${m}`, label: `${MONTH_LABELS[m]} ${y}`, cells });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return months;
};

const CalendarHeatmapTab = ({ data, onDrill }) => {
  const todayIso = new Date().toISOString().slice(0, 10);

  const { months, insights, monthTotals } = useMemo(() => {
    if (!data?.length) return { months: [], insights: [], monthTotals: {} };

    const ms = buildMonths(data, todayIso);

    // per-month aggregate for the card header
    const mt = {};
    for (const mo of ms) {
      let t = 0, w = 0;
      for (const c of mo.cells) {
        if (c?.entry) { t += c.entry.total; w += c.entry.wins; }
      }
      mt[mo.key] = { total: t, wins: w, wr: t ? (w / t) * 100 : null };
    }

    // insights: best & worst day (n>=3), longest hot streak (>=75% WR)
    const active = data.filter((d) => d.total >= 3 && d.win_rate != null);
    const best = [...active].sort((a, b) => b.win_rate - a.win_rate)[0];
    const worst = [...active].sort((a, b) => a.win_rate - b.win_rate)[0];

    let streak = 0, bestStreak = 0, streakEnd = null;
    for (const d of data) {
      if (d.total > 0 && d.win_rate >= 75) {
        streak += 1;
        if (streak > bestStreak) { bestStreak = streak; streakEnd = d.date; }
      } else if (d.total > 0) streak = 0;
    }

    const ins = [];
    if (best)
      ins.push({ kind: "good", label: "Best day", value: `${fmtShort(best.date)} · ${best.win_rate.toFixed(0)}%`, sub: `${best.wins}/${best.total} resolved` });
    if (worst && best && worst.date !== best.date)
      ins.push({ kind: "bad", label: "Worst day", value: `${fmtShort(worst.date)} · ${worst.win_rate.toFixed(0)}%`, sub: `${worst.wins}/${worst.total} resolved` });
    if (bestStreak >= 2)
      ins.push({ kind: "neutral", label: "Longest hot streak", value: `${bestStreak} days`, sub: `≥75% WR, ending ${fmtShort(streakEnd)}` });

    return { months: ms, insights: ins, monthTotals: mt };
  }, [data, todayIso]);

  if (!data?.length) return <EmptyState title="No calendar data" />;

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Each cell is one day; the big number is that day's win rate and the tint follows the same green→red
        scale as the heatmaps. The small figure is wins/resolved. <span className="text-gold-primary/70">Click any
        day with signals</span> to open the list of trades resolved that day, then click a trade to inspect its
        full analysis. Faint cells = no resolved signals.
      </Methodology>

      <Panel title="Daily win rate" meta={`${data.length} days`}>
        <div className="flex flex-wrap gap-5">
          {months.map((mo) => {
            const agg = monthTotals[mo.key];
            return (
              <div key={mo.key} className="flex-1 min-w-[300px]">
                {/* month header */}
                <div className="flex items-baseline justify-between mb-2.5 px-0.5">
                  <span className="text-sm font-display text-text-primary/90 tracking-tight">{mo.label}</span>
                  {agg?.total > 0 && (
                    <span className="text-[10px] font-mono tabular-nums text-text-primary/40">
                      <span className={agg.wr >= 60 ? "text-emerald-400/80" : agg.wr >= 50 ? "text-text-primary/55" : "text-red-400/80"}>
                        {agg.wr.toFixed(0)}%
                      </span>{" "}
                      · {agg.wins}/{agg.total}
                    </span>
                  )}
                </div>

                {/* dow header */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DOW_LABELS.map((d, i) => (
                    <div key={i} className="text-center text-[9px] font-mono uppercase tracking-wider text-text-primary/25">{d}</div>
                  ))}
                </div>

                {/* day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {mo.cells.map((cell, i) => {
                    if (!cell) return <div key={i} />;
                    const e = cell.entry;
                    const has = !!e && e.total > 0;
                    const wr = e?.win_rate ?? null;
                    const bg = cell.inRange && has ? wrColor(wr, e.total) : "transparent";

                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!has}
                        onClick={() =>
                          has &&
                          onDrill?.({
                            dimension: "calendar_day",
                            key: cell.iso,
                            label: fmtFull(cell.iso),
                            total: e.total,
                            wins: e.wins,
                            win_rate: wr,
                          })
                        }
                        title={
                          cell.inRange
                            ? has
                              ? `${cell.iso} · ${e.wins}/${e.total} · ${wr?.toFixed(1)}%`
                              : `${cell.iso} · no signals`
                            : ""
                        }
                        className={`relative aspect-square rounded-md border flex flex-col items-center justify-center px-0.5 transition ${
                          has
                            ? "cursor-pointer border-ink/[0.06] hover:ring-1 hover:ring-gold-primary/60 hover:border-line/30"
                            : "cursor-default border-ink/[0.03]"
                        } ${cell.isToday ? "ring-1 ring-gold-primary/70" : ""}`}
                        style={{ background: bg, opacity: cell.inRange ? 1 : 0.25 }}
                      >
                        <span className="absolute top-1 left-1.5 text-[9px] font-mono tabular-nums text-text-primary/35 leading-none">
                          {cell.day}
                        </span>
                        {has ? (
                          <>
                            <span className={`font-mono tabular-nums text-[15px] leading-none mt-1 ${wr >= 50 ? "text-text-primary/95" : "text-text-primary/90"}`}>
                              {wr?.toFixed(0)}%
                            </span>
                            <span className="text-[9px] font-mono tabular-nums text-text-primary/45 mt-1 leading-none">
                              {e.wins}/{e.total}
                            </span>
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* legend */}
        <div className="mt-5 pt-3.5 border-t border-ink/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
          {WR_LEGEND.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3 rounded-[2px] border border-ink/10" style={{ background: s.c }} />
              {s.l}
            </span>
          ))}
          <span className="ml-2 text-text-primary/25 normal-case tracking-normal">· click a day to drill into its signals</span>
        </div>
      </Panel>
    </div>
  );
};

export default CalendarHeatmapTab;
