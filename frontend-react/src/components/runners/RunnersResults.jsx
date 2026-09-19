import { useMemo, useState } from "react";
import EChart, { inkAlpha, useChartTokens, useTooltipStyle } from "../charts/EChart";
import { SegGroup } from "../ui/SegGroup";
import {
  diff,
  fmtDay,
  fmtHours,
  fmtPct,
  fmtPp,
  perHundred,
  pointRates,
  rates,
} from "../../utils/runnerStats";

/**
 * Runners results — the page a member opens to judge the mode for themselves.
 *
 * Laid out the way exchange copy-trading profiles and TradingView's strategy
 * report teach traders to read a track record: one period filter above
 * everything, a headline number, a KPI strip, the outcome split as donuts
 * (TradingView's "trades distribution"), a trend over time (the exchanges'
 * cumulative-performance chart), how fast calls get there (their "holding
 * time"), then the detail an expert wants — per-tag, the live record, the full
 * table with 95% ranges and the method.
 *
 * Every number comes from the walk-forward replay (hunt-full-tp `dashboard`):
 * each day decided with only what was known that day, by the same code the
 * Runners topic runs. Counts arrive from the server; rates, ranges and labels
 * are derived in utils/runnerStats, once, so a tooltip and the table cannot
 * disagree.
 *
 * Colour: Every call is the grey context, Runners and Top Runners the first two
 * validated categorical slots (--viz-1, --viz-2), outcomes the validated
 * SL/TP ramp. Text always wears text tokens, never a series colour.
 */

// Tooltips are HTML strings; anything that came from data is escaped first.
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Below this many finished calls a rate is mostly noise; say so instead.
const MIN_READ = 10;
const readable = (r) => (r && r.n >= MIN_READ ? r : null);

const LBL = "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";

const GROUPS = [
  { key: "every", label: "Every call", token: "viz-muted" },
  { key: "runner", label: "Runners", token: "viz-1" },
  { key: "top", label: "Top Runners", token: "viz-2" },
];

const OUTCOME_META = [
  { key: "sl", label: "Stopped out", short: "SL", token: "neg" },
  { key: "tp1", label: "Ended at TP1", short: "TP1", token: "viz-tp1" },
  { key: "tp2", label: "Ended at TP2", short: "TP2", token: "viz-tp2" },
  { key: "tp3", label: "Ended at TP3", short: "TP3", token: "viz-tp3" },
  { key: "tp4", label: "Reached TP4", short: "TP4", token: "viz-tp4" },
];

const LEVELS = [
  { key: "tp1", label: "TP1 or more" },
  { key: "tp2", label: "TP2 or more" },
  { key: "tp3", label: "TP3 or more" },
  { key: "tp4", label: "TP4 (all targets)" },
  { key: "sl", label: "Stopped out" },
];

// ─────────────────────────────── pieces ───────────────────────────────

function Card({ title, hint, children, className = "", right = null }) {
  return (
    <section className={`rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5 sm:p-4 ${className}`}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-semibold leading-snug text-text-primary">{title}</h3>
          {hint ? <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{hint}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span
            aria-hidden
            className={it.line ? "h-[2px] w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Delta({ value, goodWhen = "higher" }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-text-muted">—</span>;
  const good = goodWhen === "higher" ? value > 0 : value < 0;
  return (
    <span className={`font-mono text-[11px] font-medium ${Math.abs(value) < 0.05 ? "text-text-muted" : good ? "text-positive" : "text-loss"}`}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {fmtPp(value)}
    </span>
  );
}

function Tile({ label, value, sub, delta, goodWhen, foot }) {
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
      <p className="text-[11.5px] leading-snug text-text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none text-text-primary">{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] leading-snug text-text-muted">{sub}</p> : null}
      {delta !== undefined ? (
        <p className="mt-1">
          <Delta value={delta} goodWhen={goodWhen} />
        </p>
      ) : null}
      {foot ? <p className="mt-1 text-[10.5px] leading-snug text-text-muted">{foot}</p> : null}
    </div>
  );
}

// ─────────────────────────────── charts ───────────────────────────────

function Donut({ r, label, t, tooltip }) {
  const option = useMemo(() => {
    if (!r) return null;
    return {
      animationDuration: 400,
      tooltip: {
        ...tooltip,
        confine: false,
        appendTo: "body",
        trigger: "item",
        formatter: (p) =>
          `<b>${p.data.pct.toFixed(1)}%</b> · ${p.data.count} calls<br/><span style="opacity:.75">${label} · ${p.name}</span>`,
      },
      series: [
        {
          type: "pie",
          radius: ["60%", "86%"],
          center: ["50%", "50%"],
          padAngle: 1.2,
          itemStyle: { borderRadius: 3, borderColor: t["surface-raised"], borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: true, scaleSize: 3 },
          data: OUTCOME_META.map((o) => ({
            name: o.label,
            value: r.count[o.key],
            count: r.count[o.key],
            pct: r.share[o.key],
            itemStyle: { color: t[o.token] },
          })),
        },
      ],
    };
  }, [r, label, t, tooltip]);
  return (
    <figure className="flex min-w-0 flex-col items-center">
      <div className="relative w-full max-w-[160px]">
        {option ? <EChart option={option} height={140} /> : <div className="h-[140px]" />}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-semibold leading-none text-text-primary">
            {r ? `${Math.round(r.tp3)}%` : "—"}
          </span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">TP3+</span>
        </div>
      </div>
      <figcaption className="mt-1.5 text-center">
        <span className="block text-[12px] font-medium text-text-primary">{label}</span>
        <span className="font-mono text-[10.5px] text-text-muted">
          {r ? `${r.n.toLocaleString()} finished` : "no finished calls yet"}
        </span>
      </figcaption>
    </figure>
  );
}

function barAxes(t, { categories, horizontal = true, valueFormatter, max }) {
  const cat = {
    type: "category",
    data: categories,
    inverse: horizontal,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t["fg-secondary"], fontSize: 11 },
  };
  const val = {
    type: "value",
    max,
    // A percent axis reads cleanest in quarters; free axes pick their own.
    ...(max === 100 ? { interval: 25 } : { splitNumber: 4 }),
    axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: valueFormatter, hideOverlap: true },
    splitLine: { lineStyle: { color: inkAlpha(t, 0.07), width: 1 } },
  };
  return horizontal ? { xAxis: val, yAxis: cat } : { xAxis: cat, yAxis: val };
}

function LevelBars({ rs, t, tooltip }) {
  const option = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 108, right: 54, top: 6, bottom: 22 },
      tooltip: {
        ...tooltip,
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: inkAlpha(t, 0.04) } },
        formatter: (ps) =>
          `${ps[0].name}<br/>` +
          ps
            .map((p) => `${p.marker} <b>${fmtPct(p.value)}</b> <span style="opacity:.75">${p.seriesName}</span>`)
            .join("<br/>"),
      },
      ...barAxes(t, { categories: LEVELS.map((l) => l.label), valueFormatter: "{value}%", max: 100 }),
      series: GROUPS.map((g) => ({
        name: g.label,
        type: "bar",
        barMaxWidth: 9,
        barGap: "35%",
        itemStyle: { color: t[g.token], borderRadius: [0, 4, 4, 0] },
        // Direct labels on the series the page is about; the rest live in the
        // tooltip and the table.
        label:
          g.key === "runner"
            ? { show: true, position: "right", color: t.fg, fontSize: 10, formatter: (p) => fmtPct(p.value, 0) }
            : { show: false },
        data: LEVELS.map((l) => (rs[g.key] ? Number(rs[g.key][l.key].toFixed(2)) : null)),
      })),
    }),
    [rs, t, tooltip]
  );
  return <EChart option={option} height={236} />;
}

const SPEED_LEVELS = ["tp1", "tp2", "tp3", "tp4"];

function SpeedBars({ speed, t, tooltip }) {
  const option = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 44, right: 58, top: 6, bottom: 22 },
      tooltip: {
        ...tooltip,
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: inkAlpha(t, 0.04) } },
        formatter: (ps) =>
          `Time to ${ps[0].name} (median)<br/>` +
          ps.map((p) => `${p.marker} <b>${fmtHours(p.value)}</b> <span style="opacity:.75">${p.seriesName}</span>`).join("<br/>"),
      },
      ...barAxes(t, {
        categories: SPEED_LEVELS.map((l) => l.toUpperCase()),
        valueFormatter: (v) => `${v}h`,
      }),
      series: GROUPS.map((g) => ({
        name: g.label,
        type: "bar",
        barMaxWidth: 9,
        barGap: "35%",
        itemStyle: { color: t[g.token], borderRadius: [0, 4, 4, 0] },
        label:
          g.key === "runner"
            ? { show: true, position: "right", color: t.fg, fontSize: 10, formatter: (p) => fmtHours(p.value) }
            : { show: false },
        data: SPEED_LEVELS.map((l) => speed?.[g.key]?.[l] ?? null),
      })),
    }),
    [speed, t, tooltip]
  );
  return <EChart option={option} height={196} />;
}

function WeeklyTrend({ weekly, d, t, tooltip }) {
  const { labels, lines, lift, area } = useMemo(() => {
    const labels = weekly.map((w) => fmtDay(w.week));
    const series = {
      every: weekly.map((w) => pointRates(w.every, 20)),
      runner: weekly.map((w) => pointRates(w.runner, 10)),
      top: weekly.map((w) => pointRates(w.top, 8)),
    };
    const lift = weekly.map((w, i) => {
      const a = series.runner[i];
      const b = series.every[i];
      return a && b ? Number((a.tp3 - b.tp3).toFixed(2)) : null;
    });
    // The chosen period, shaded on the whole replay.
    let area = null;
    if (d.days) {
      const from = weekly.findIndex((w) => w.week >= addDays(d.first_day, -6));
      if (from >= 0) area = [labels[Math.max(0, from)], labels[labels.length - 1]];
    }
    return { labels, lines: series, lift, area };
  }, [weekly, d]);

  const lineOption = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 40, right: 14, top: 10, bottom: 24 },
      tooltip: {
        ...tooltip,
        confine: true,
        formatter: (ps) =>
          `Week of ${ps[0].name}<br/>` +
          ps
            .filter((p) => p.value != null)
            .map((p) => {
              const pt = lines[GROUPS[p.seriesIndex].key][p.dataIndex];
              return `${p.marker} <b>${fmtPct(p.value)}</b> <span style="opacity:.75">${p.seriesName} · ${pt?.n ?? 0} finished</span>`;
            })
            .join("<br/>"),
      },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: inkAlpha(t, 0.12) } },
        axisTick: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: "{value}%" },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
        scale: true,
      },
      series: GROUPS.map((g, i) => ({
        name: g.label,
        type: "line",
        data: lines[g.key].map((p) => (p ? Number(p.tp3.toFixed(2)) : null)),
        connectNulls: false,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: labels.length <= 20,
        lineStyle: { width: 2, color: t[g.token] },
        itemStyle: { color: t[g.token], borderColor: t["surface-raised"], borderWidth: 2 },
        emphasis: { focus: "series" },
        z: i === 1 ? 3 : 2,
        ...(i === 0 && area
          ? { markArea: { silent: true, itemStyle: { color: inkAlpha(t, 0.05) }, data: [[{ xAxis: area[0] }, { xAxis: area[1] }]] } }
          : {}),
      })),
    }),
    [labels, lines, area, t, tooltip]
  );

  const liftOption = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 40, right: 14, top: 8, bottom: 22 },
      tooltip: {
        ...tooltip,
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: inkAlpha(t, 0.04) } },
        formatter: (ps) =>
          ps[0].value == null
            ? `Week of ${ps[0].name}<br/>too few finished calls`
            : `Week of ${ps[0].name}<br/><b>${fmtPp(ps[0].value)}</b> <span style="opacity:.75">Runners vs every call, TP3+</span>`,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: inkAlpha(t, 0.18) } },
        axisTick: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: (v) => `${v > 0 ? "+" : ""}${v}` },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 14,
          data: lift.map((v) =>
            v == null
              ? null
              : {
                  value: v,
                  itemStyle: {
                    color: v >= 0 ? t.pos : t.neg,
                    borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
                  },
                }
          ),
        },
      ],
    }),
    [labels, lift, t, tooltip]
  );

  const above = lift.filter((v) => v != null && v > 0).length;
  const counted = lift.filter((v) => v != null).length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Legend items={GROUPS.map((g) => ({ label: g.label, color: t[g.token], line: true }))} />
        {d.days ? <span className="font-mono text-[10px] text-text-muted">Shaded: the period you picked</span> : null}
      </div>
      <EChart option={lineOption} height={220} />
      <p className={`${LBL} mb-1 mt-3`}>Runners minus every call, TP3+ (points)</p>
      <EChart option={liftOption} height={120} />
      <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
        Runners were ahead of every call in <b className="text-text-primary">{above} of {counted}</b> weeks with
        enough finished calls to count. Green above the line is a week they did better.
      </p>
    </div>
  );
}

function addDays(iso, n) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function DailyVolume({ series, t, tooltip }) {
  const option = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 30, right: 8, top: 8, bottom: 22 },
      tooltip: {
        ...tooltip,
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: inkAlpha(t, 0.04) } },
        formatter: (ps) => {
          const s = series[ps[0].dataIndex];
          return `${ps[0].name}<br/><b>${s.runners}</b> Runners <span style="opacity:.75">(${s.tops} Top)</span><br/><span style="opacity:.75">of ${s.decided} calls decided</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: series.map((s) => fmtDay(s.day)),
        axisLine: { lineStyle: { color: inkAlpha(t, 0.12) } },
        axisTick: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: t["fg-muted"], fontSize: 10 },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      series: [
        {
          name: "Other Runners",
          type: "bar",
          stack: "r",
          barMaxWidth: 14,
          itemStyle: { color: t["viz-1"], borderColor: t["surface-raised"], borderWidth: 1 },
          data: series.map((s) => s.runners - s.tops),
        },
        {
          name: "Top Runners",
          type: "bar",
          stack: "r",
          barMaxWidth: 14,
          itemStyle: { color: t["viz-2"], borderColor: t["surface-raised"], borderWidth: 1, borderRadius: [4, 4, 0, 0] },
          data: series.map((s) => s.tops),
        },
      ],
    }),
    [series, t, tooltip]
  );
  return <EChart option={option} height={200} />;
}

function TagBars({ tags, t, tooltip }) {
  const rows = useMemo(() => tags.map((x) => ({ tag: x.tag, r: rates(x.counts), open: x.counts.open })), [tags]);
  const option = useMemo(
    () => ({
      animationDuration: 400,
      grid: {
        left: Math.min(150, 12 + 6.4 * Math.max(0, ...rows.map((x) => x.tag.length))),
        right: 64,
        top: 6,
        bottom: 22,
      },
      tooltip: {
        ...tooltip,
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: inkAlpha(t, 0.04) } },
        formatter: (ps) => {
          const row = rows[ps[0].dataIndex];
          if (!row.r) return `${esc(ps[0].name)}<br/>no finished calls yet`;
          return `${esc(ps[0].name)}<br/><b>${fmtPct(row.r.tp3)}</b> TP3+ · <b>${fmtPct(row.r.sl)}</b> stopped<br/><span style="opacity:.75">${row.r.n} finished · ${row.open} open</span>`;
        },
      },
      ...barAxes(t, {
        categories: rows.map((x) => x.tag.replace(/_/g, " ").toLowerCase()),
        valueFormatter: "{value}%",
        max: 100,
      }),
      series: [
        {
          type: "bar",
          barMaxWidth: 12,
          itemStyle: { color: t["viz-1"], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: t.fg,
            fontSize: 10,
            formatter: (p) => (p.value == null ? "—" : `${fmtPct(p.value, 0)} · n=${rows[p.dataIndex].r?.n ?? 0}`),
          },
          data: rows.map((x) => (x.r ? Number(x.r.tp3.toFixed(2)) : null)),
        },
      ],
    }),
    [rows, t, tooltip]
  );
  return <EChart option={option} height={Math.max(90, rows.length * 42 + 30)} />;
}

// ─────────────────────────────── sections ─────────────────────────────

function LiveRecord({ live }) {
  const g = live?.groups;
  const r = rates(g?.runner);
  const e = rates(g?.every);
  const top = rates(g?.top);
  const n = r?.n || 0;
  const target = 200;
  return (
    <Card
      title="Live record — the calls actually posted to the Runners topic"
      hint={`Since the topic started (${fmtDay(live?.since)}). The replay above is the long view; this is the real, still-short record.`}
    >
      {r ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Tile label="Reached TP3 or more" value={fmtPct(r.tp3)} sub={`vs ${fmtPct(e?.tp3)} of every call since then`} delta={diff(r.tp3, e?.tp3)} />
            <Tile label="Stopped out" value={fmtPct(r.sl)} sub={`vs ${fmtPct(e?.sl)} of every call since then`} delta={diff(r.sl, e?.sl)} goodWhen="lower" />
            <Tile
              label="Top Runners so far, TP3 or more"
              value={readable(top) ? fmtPct(top.tp3) : "—"}
              sub={
                readable(top)
                  ? `${top.n} finished`
                  : top
                    ? `only ${top.n} finished — too few to read yet`
                    : "none finished yet — labels began with the two-tag rule"
              }
            />
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>
                {n} of {target} finished calls needed before these rates settle
              </span>
              <span className="font-mono">{Math.min(100, Math.round((n / target) * 100))}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (n / target) * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-text-muted">
              At {n} calls a rate can still move by about ±
              {r.ci.tp3 ? Math.round((r.ci.tp3[1] - r.ci.tp3[0]) / 2) : "—"} points. {r.open ? `${r.open} are still open.` : ""}
            </p>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-text-muted">No posted Runner has finished in this period yet.</p>
      )}
    </Card>
  );
}

function ExpertTable({ rs, d }) {
  const rows = [
    ...GROUPS.map((g) => ({ ...g, r: rs[g.key], open: d.groups[g.key]?.open ?? 0 })),
    { key: "rest", label: "Runners without the #1 tag", r: rs.rest, open: d.groups.rest?.open ?? 0 },
  ];
  const thBase = "px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted";
  const th = `${thBase} text-right`;
  const td = "px-2 py-1.5 text-right font-mono text-[12px] tabular-nums text-text-primary";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-ink/[0.08]">
            <th className={`${thBase} text-left`}>Group</th>
            <th className={th}>Finished</th>
            <th className={th}>Open</th>
            {OUTCOME_META.map((o) => (
              <th key={o.key} className={th}>
                {o.short}
              </th>
            ))}
            <th className={th}>TP3+ (95% range)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-ink/[0.05] last:border-0">
              <td className="px-2 py-1.5 text-left text-[12px] text-text-primary">{row.label}</td>
              <td className={td}>{row.r?.n?.toLocaleString() ?? 0}</td>
              <td className={td}>{row.open}</td>
              {OUTCOME_META.map((o) => (
                <td key={o.key} className={td}>
                  {row.r ? fmtPct(row.r.share[o.key]) : "—"}
                </td>
              ))}
              <td className={td}>
                {row.r ? `${fmtPct(row.r.tp3)} (${row.r.ci.tp3[0].toFixed(1)}–${row.r.ci.tp3[1].toFixed(1)})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GLOSSARY = [
  ["TP1 – TP4", "The four take-profit targets of a call, nearest to furthest. TP3 or more is what makes a call a “runner”."],
  ["Stopped out (SL)", "Price hit the stop before TP1. The loss the plan was sized for."],
  ["Runners", "Calls carrying one of the two runner tags that sat in the top 30% of the last seven days’ Edge when they were called."],
  ["Top Runners", "Runners that carry the #1 runner tag — the strongest group in the replay."],
  ["Every call", "All calls the rule looked at, runner or not — the yardstick."],
  ["pp (points)", "Difference between two percentages: 58% vs 50% is +8pp."],
  ["95% range", "Where the true rate most likely sits given how many calls finished. Fewer calls, wider range."],
  ["Walk-forward", "Each day is decided with only what was known that day, by the code the topic runs — no hindsight."],
];

// ─────────────────────────────── page ─────────────────────────────────

export default function RunnersResults({ stats, loading, error, windowValue, onWindow, windowOptions, fallback = null }) {
  const t = useChartTokens();
  const baseTooltip = useTooltipStyle();
  const [showTable, setShowTable] = useState(false);
  const d = stats?.dashboard;

  const rs = useMemo(() => {
    if (!d) return null;
    return {
      every: rates(d.groups.every),
      runner: rates(d.groups.runner),
      top: rates(d.groups.top),
      rest: rates(d.groups.rest),
    };
  }, [d]);

  if (!d || !rs) {
    if (loading) {
      return (
        <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-3 text-[12px] text-text-muted">
          Loading Runner results…
        </div>
      );
    }
    if (fallback) return fallback;
    return (
      <div className="rounded-xl border border-ink/[0.08] px-3 py-3 text-[12px] text-text-muted">
        {error ? "Results could not load. The Runners tab still works — try again in a moment." : "No results yet."}
      </div>
    );
  }

  const runner = rs.runner;
  const every = rs.every;
  const days = d.series.length || 1;
  const perDay = d.series.reduce((a, s) => a + s.runners, 0) / days;
  const topPerDay = d.series.reduce((a, s) => a + s.tops, 0) / days;
  const period = `${fmtDay(d.first_day)} – ${fmtDay(d.last_day)}`;

  return (
    <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onWindow && windowOptions ? (
          <SegGroup size="touch" aria-label="Results period" value={windowValue} onChange={onWindow} options={windowOptions} />
        ) : (
          <span />
        )}
        <p className="font-mono text-[10.5px] text-text-muted">
          Calls made {period} · replayed point-in-time · {every?.n.toLocaleString()} finished
        </p>
      </div>

      {/* Headline + KPI strip */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <section className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
          <p className={LBL}>The headline</p>
          <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight text-text-primary sm:text-[52px]">
            {perHundred(runner?.tp3) ?? "—"}
            <span className="ml-1 text-[18px] font-medium text-text-muted">of 100</span>
          </p>
          <p className="mt-2 text-[13.5px] leading-snug text-text-primary">
            Runners reached <b>TP3 or further</b> on {perHundred(runner?.tp3)} of every 100 calls — against{" "}
            {perHundred(every?.tp3)} for every call in the same period.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-muted">
            <Delta value={diff(runner?.tp3, every?.tp3)} />
            <span>
              likely between {runner?.ci.tp3 ? `${runner.ci.tp3[0].toFixed(0)}% and ${runner.ci.tp3[1].toFixed(0)}%` : "—"} · {runner?.n} finished
            </span>
          </p>
          <p className="mt-3 text-[11.5px] leading-snug text-text-muted">
            Better odds, not a promise: roughly {perHundred(runner?.sl)} in 100 Runners still hit the stop. Size for it.
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile label="Reached TP1 or more" value={fmtPct(runner?.tp1)} sub={`every call ${fmtPct(every?.tp1)}`} delta={diff(runner?.tp1, every?.tp1)} />
          <Tile label="Stopped out" value={fmtPct(runner?.sl)} sub={`every call ${fmtPct(every?.sl)}`} delta={diff(runner?.sl, every?.sl)} goodWhen="lower" />
          <Tile label="All four targets (TP4)" value={fmtPct(runner?.tp4)} sub={`every call ${fmtPct(every?.tp4)}`} delta={diff(runner?.tp4, every?.tp4)} />
          <Tile
            label="Top Runners, TP3 or more"
            value={readable(rs.top) ? fmtPct(rs.top.tp3) : "—"}
            sub={
              readable(rs.top)
                ? `${rs.top.n} finished · other Runners ${fmtPct(rs.rest?.tp3)}`
                : `${rs.top?.n ?? 0} finished — too few to read`
            }
            delta={readable(rs.top) ? diff(rs.top.tp3, rs.rest?.tp3) : undefined}
          />
          <Tile
            label="Time to TP3 (median)"
            value={fmtHours(d.speed.runner.tp3)}
            sub={`every call ${fmtHours(d.speed.every.tp3)}`}
            foot="Among calls that got there"
          />
          <Tile label="Runners per day" value={perDay.toFixed(1)} sub={`${topPerDay.toFixed(1)} of them Top Runners`} foot={`${days} days in this period`} />
        </div>
      </div>

      {/* How calls finished — donuts */}
      <Card
        title="How the calls finished"
        hint="Each ring is 100% of that group's finished calls, split by where they ended: red is stopped out, the greens run TP1 → TP4 as in the key."
        right={<Legend items={OUTCOME_META.map((o) => ({ label: o.short, color: t[o.token] }))} />}
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-6">
          {GROUPS.map((g) => (
            <Donut key={g.key} r={rs[g.key]} label={g.label} t={t} tooltip={baseTooltip} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="How far they got"
          hint="Share of finished calls that reached each level. A TP4 also counts as TP1, TP2 and TP3."
          right={<Legend items={GROUPS.map((g) => ({ label: g.label, color: t[g.token] }))} />}
        >
          <LevelBars rs={rs} t={t} tooltip={baseTooltip} />
        </Card>
        <Card
          title="How fast they got there"
          hint="Median time from the call to each target, among calls that reached it. Shorter is less time exposed."
          right={<Legend items={GROUPS.map((g) => ({ label: g.label, color: t[g.token] }))} />}
        >
          <SpeedBars speed={d.speed} t={t} tooltip={baseTooltip} />
          <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
            When a Runner is stopped, it typically happens after {fmtHours(d.speed.runner.sl)} (every call: {fmtHours(d.speed.every.sl)}).
          </p>
        </Card>
      </div>

      <Card
        title="Week by week — does it hold up?"
        hint="TP3+ rate per week across the whole replay since June. A mode worth using stays above the grey line in most weeks, not just on average."
      >
        <WeeklyTrend weekly={d.weekly} d={d} t={t} tooltip={baseTooltip} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="How many Runners a day"
          hint="Calls the rule chose each day in this period. Busy markets send more, quiet ones fewer — some days none."
          right={<Legend items={[{ label: "Other Runners", color: t["viz-1"] }, { label: "Top Runners", color: t["viz-2"] }]} />}
        >
          <DailyVolume series={d.series} t={t} tooltip={baseTooltip} />
        </Card>
        <Card title="By runner tag" hint="Each of today's two runner tags on its own, within Runners. A call can carry both.">
          <TagBars tags={d.tags} t={t} tooltip={baseTooltip} />
        </Card>
      </div>

      <LiveRecord live={d.live} />

      <Card
        title="The numbers, in full"
        hint="Every group's finish split and its 95% range — the table behind every chart above."
        right={
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="rounded-md border border-ink/[0.12] px-2 py-1 font-mono text-[10.5px] uppercase tracking-wider text-text-secondary hover:bg-ink/[0.04]"
            aria-expanded={showTable}
          >
            {showTable ? "Hide table" : "Show table"}
          </button>
        }
      >
        {showTable ? <ExpertTable rs={rs} d={d} /> : null}
        <details className="group mt-2 rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2">
          <summary className={`flex cursor-pointer list-none items-center justify-between ${LBL} [&::-webkit-details-marker]:hidden`}>
            How this is measured
            <span className="transition-transform group-open:rotate-180" aria-hidden>
              ▾
            </span>
          </summary>
          <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-text-muted">
            <p>
              Every call since 10 Jun is re-decided day by day using only what was known that day — that day's runner
              tags, Edge scores and top-30% cut — by the same code that posts to the Runners topic. It starts in June
              because earlier entry snapshots were written in a bulk backfill, up to 90 days late.
            </p>
            <p>
              Only calls whose tags were stamped within an hour of the call are counted — the ones the topic can decide.
              Open calls are shown apart, never as losses. A call is counted once, at the furthest level it reached.
            </p>
            <p>
              The rule was re-chosen on 19 Sep: two runner tags and the top 30% of Edge beat the earlier four tags and top
              20% in every month at the same volume. The Edge score alone carries no TP3 signal; the tags do, and the
              Edge cut mostly trims stops.
            </p>
          </div>
        </details>
      </Card>

      <Card title="Words on this page">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {GLOSSARY.map(([term, def]) => (
            <div key={term}>
              <dt className="text-[12px] font-semibold text-text-primary">{term}</dt>
              <dd className="text-[12px] leading-snug text-text-muted">{def}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
