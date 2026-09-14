// src/components/admin/workspace/xtracker/charts.jsx
//
// The X Operations charts. Plain SVG and CSS grid on purpose: every chart here
// is small, has at most three series, and needs exact control over the few
// marks it draws — a caption ceiling, a daily cap, today's unfinished column.
//
// Rules these follow (the dataviz method): colour comes from the validated
// --viz-* tokens in a fixed order, text never wears a series colour, bars are
// capped at 24px with a 4px rounded data-end and a 2px surface gap, grids are
// solid hairlines, there is one y-axis per chart, and every chart has a table
// view so no value is only reachable by hovering.

import { useEffect, useRef, useState, useCallback } from "react";

export const SERIES = {
  TP2: { label: "TP2", color: "var(--viz-3)" },
  TP3: { label: "TP3", color: "var(--viz-1)" },
  TP4: { label: "TP4", color: "var(--viz-2)" },
};
export const RUNGS = ["TP2", "TP3", "TP4"];

export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** One floating tooltip per chart, positioned inside the chart's own box. */
export function useTip() {
  const box = useRef(null);
  const [tip, setTip] = useState(null);
  const show = useCallback((e, content) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX ?? r.left + r.width / 2;
    const cy = e.clientY ?? r.top;
    setTip({ x: cx - r.left, y: cy - r.top, w: r.width, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div className="xo-tip" role="status"
         style={{ left: Math.max(0, Math.min(tip.x + 14, tip.w - 200)), top: Math.max(0, tip.y - 12) }}>
      {tip.content}
    </div>
  ) : null;
  return { box, show, hide, node };
}

/** Clean axis ticks: 0, a round step, never more than `count` lines. */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}

const roundTop = (x, y, w, h, r) => {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export function Legend({ items }) {
  return (
    <div className="xo-legend">
      {items.map((i) => (
        <span key={i.label} className="xo-legend-i">
          <span className="xo-swatch" style={{ background: i.color, borderRadius: i.line ? 1 : 3,
                                               height: i.line ? 2 : 10 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ stacked columns -- */

/**
 * Columns per day, stacked by series, against one horizontal reference.
 * `columns`: [{ key, label, values: {SERIES_KEY: n}, partial }]
 */
export function StackedColumns({ columns, series, reference, referenceLabel, height = 190, unit = "posts" }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const padL = 34, padR = 8, padT = 18, padB = 24;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const totals = columns.map((c) => series.reduce((s, k) => s + (c.values[k] || 0), 0));
  const { top, ticks } = niceTicks(Math.max(reference || 0, ...totals, 1) * 1.05);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const band = columns.length ? plotW / columns.length : 0;
  const barW = Math.max(3, Math.min(24, band * 0.62));
  const every = Math.max(1, Math.ceil((columns.length * 46) / Math.max(plotW, 1)));
  const lastIdx = columns.length - 1;

  return (
    <div ref={(el) => { ref.current = el; tip.box.current = el; }} className="xo-chart" style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} role="img" aria-label={`${unit} per day`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="xo-grid" />
              <text x={padL - 7} y={y(t)} className="xo-tick" textAnchor="end" dominantBaseline="middle">{t}</text>
            </g>
          ))}
          {columns.map((c, i) => {
            const x = padL + i * band + (band - barW) / 2;
            let acc = 0;
            const segs = series.filter((k) => c.values[k] > 0);
            return (
              <g key={c.key} opacity={c.partial ? 0.55 : 1}>
                {segs.map((k, si) => {
                  const v = c.values[k];
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0));
                  const isTop = si === segs.length - 1;
                  return isTop ? (
                    <path key={k} d={roundTop(x, y1, barW, h, 4)} fill={SERIES[k]?.color || "var(--viz-1)"} />
                  ) : (
                    <rect key={k} x={x} y={y1} width={barW} height={h} fill={SERIES[k]?.color || "var(--viz-1)"} />
                  );
                })}
                {(i % every === 0 && lastIdx - i >= every) || i === lastIdx ? (
                  <text x={x + barW / 2} y={height - 7} className="xo-tick" textAnchor="middle">{c.label}</text>
                ) : null}
                {i === lastIdx && totals[i] > 0 ? (
                  <text x={x + barW / 2} y={y(totals[i]) - 6} className="xo-dlabel" textAnchor="middle">
                    {totals[i]}{c.partial ? " so far" : ""}
                  </text>
                ) : null}
                <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent"
                      onMouseMove={(e) => tip.show(e, (
                        <>
                          <div className="xo-tip-h">{c.tipLabel || c.label}{c.partial ? " · so far" : ""}</div>
                          {series.slice().reverse().map((k) => (
                            <div key={k} className="xo-tip-r">
                              <span className="xo-swatch" style={{ background: SERIES[k]?.color }} />
                              <span>{SERIES[k]?.label || k}</span>
                              <b>{c.values[k] || 0}</b>
                            </div>
                          ))}
                          <div className="xo-tip-r xo-tip-total"><span /><span>Total</span><b>{totals[i]}</b></div>
                        </>
                      ))}
                      onMouseLeave={tip.hide} />
              </g>
            );
          })}
          {reference ? (
            <g pointerEvents="none">
              <line x1={padL} x2={w - padR} y1={y(reference)} y2={y(reference)} className="xo-ref" />
              <text x={padL + 4} y={y(reference) - 5} className="xo-ref-label" textAnchor="start">{referenceLabel}</text>
            </g>
          ) : null}
        </svg>
      ) : null}
      {tip.node}
    </div>
  );
}

/* ------------------------------------------------------------- columns --- */

/** Single-series columns; `mark(i)` can hand one column a status colour. */
export function Columns({ items, height = 150, fmt = (v) => v, color = "var(--viz-1)", colorOf, reference, referenceLabel, labelEvery }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const padL = 40, padR = 8, padT = 16, padB = 22;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const { top, ticks } = niceTicks(Math.max(reference || 0, ...items.map((i) => i.v), 0) * 1.05 || 1);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const band = items.length ? plotW / items.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const every = labelEvery || Math.max(1, Math.ceil((items.length * 46) / Math.max(plotW, 1)));

  return (
    <div ref={(el) => { ref.current = el; tip.box.current = el; }} className="xo-chart" style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="xo-grid" />
              <text x={padL - 7} y={y(t)} className="xo-tick" textAnchor="end" dominantBaseline="middle">{fmt(t, true)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const x = padL + i * band + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(it.v));
            return (
              <g key={it.key} opacity={it.partial ? 0.55 : 1}>
                {h > 0 ? <path d={roundTop(x, y(it.v), barW, h, Math.min(4, barW / 2))}
                               fill={colorOf ? colorOf(it) : color} /> : null}
                {it.label && ((i % every === 0 && items.length - 1 - i >= every) || i === items.length - 1) ? (
                  <text x={x + barW / 2} y={height - 6} className="xo-tick" textAnchor="middle">{it.label}</text>
                ) : null}
                <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent"
                      onMouseMove={(e) => tip.show(e, (
                        <>
                          <div className="xo-tip-h">{it.tipLabel || it.label}</div>
                          <div className="xo-tip-r"><span /><span>{it.tipName || "Value"}</span><b>{fmt(it.v)}</b></div>
                          {it.tipExtra ? <div className="xo-tip-note">{it.tipExtra}</div> : null}
                        </>
                      ))}
                      onMouseLeave={tip.hide} />
              </g>
            );
          })}
          {reference != null ? (
            <g pointerEvents="none">
              <line x1={padL} x2={w - padR} y1={y(reference)} y2={y(reference)} className="xo-ref" />
              {referenceLabel ? <text x={padL + 4} y={y(reference) - 5} className="xo-ref-label" textAnchor="start">{referenceLabel}</text> : null}
            </g>
          ) : null}
        </svg>
      ) : null}
      {tip.node}
    </div>
  );
}

/* ------------------------------------------------------------ histogram -- */

/** Caption lengths in 10-character bins, with the ceiling drawn where it sits. */
export function LengthHistogram({ values, ceiling = 120, height = 150 }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const BIN = 10;
  const maxLen = Math.max(ceiling + 40, ...values);
  const nBins = Math.ceil((maxLen + 1) / BIN);
  const bins = Array.from({ length: nBins }, (_, i) => ({ lo: i * BIN, hi: i * BIN + BIN - 1, n: 0 }));
  values.forEach((v) => { const b = bins[Math.min(nBins - 1, Math.floor(v / BIN))]; if (b) b.n += 1; });
  const padL = 34, padR = 8, padT = 18, padB = 22;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const { top, ticks } = niceTicks(Math.max(1, ...bins.map((b) => b.n)) * 1.05);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const band = plotW / nBins;
  const xOf = (len) => padL + (len / (nBins * BIN)) * plotW;

  return (
    <div ref={(el) => { ref.current = el; tip.box.current = el; }} className="xo-chart" style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} role="img" aria-label="Caption length distribution">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="xo-grid" />
              <text x={padL - 7} y={y(t)} className="xo-tick" textAnchor="end" dominantBaseline="middle">{t}</text>
            </g>
          ))}
          {bins.map((b, i) => {
            const x = padL + i * band + 1;
            const bw = Math.max(1, band - 2);
            const h = Math.max(0, y(0) - y(b.n));
            const over = b.lo >= ceiling;
            return (
              <g key={b.lo}>
                {h > 0 ? <path d={roundTop(x, y(b.n), bw, h, Math.min(4, bw / 2))}
                               fill={over ? "rgb(var(--warn))" : "var(--viz-1)"} /> : null}
                {b.lo % 40 === 0 ? <text x={padL + i * band} y={height - 6} className="xo-tick" textAnchor="middle">{b.lo}</text> : null}
                <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent"
                      onMouseMove={(e) => tip.show(e, (
                        <>
                          <div className="xo-tip-h">{b.lo}–{b.hi} characters</div>
                          <div className="xo-tip-r"><span /><span>Posts</span><b>{b.n}</b></div>
                          {over ? <div className="xo-tip-note">Over the {ceiling}-character ceiling</div> : null}
                        </>
                      ))}
                      onMouseLeave={tip.hide} />
              </g>
            );
          })}
          <g pointerEvents="none">
            <line x1={xOf(ceiling)} x2={xOf(ceiling)} y1={padT - 4} y2={padT + plotH} className="xo-ref" />
            <text x={xOf(ceiling) + 5} y={padT + 2} className="xo-ref-label">ceiling {ceiling}</text>
          </g>
        </svg>
      ) : null}
      {tip.node}
    </div>
  );
}

/* -------------------------------------------------------------- heatmap -- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour in the viewer's own timezone. One hue, light to dark. */
export function WeekHourHeatmap({ times }) {
  const tip = useTip();
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  times.forEach((t) => {
    const d = new Date(t * 1000);
    grid[(d.getDay() + 6) % 7][d.getHours()] += 1;
  });
  const max = Math.max(1, ...grid.flat());
  const fill = (n) => n === 0
    ? "rgb(var(--ink) / 0.05)"
    : `color-mix(in oklab, var(--viz-1) ${Math.round(18 + (n / max) * 82)}%, rgb(var(--surface-raised)))`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const steps = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * max));

  return (
    <div ref={tip.box} className="xo-chart">
      <div className="xo-heat" role="img" aria-label={`Posts by weekday and hour, ${tz}`}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="xo-tick-html" style={{ textAlign: "center" }}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
        {grid.map((row, di) => (
          [<span key={`l${di}`} className="xo-tick-html">{WEEKDAYS[di]}</span>,
           ...row.map((n, h) => (
             <span key={`${di}-${h}`} className="xo-heat-cell" style={{ background: fill(n) }}
                   onMouseMove={(e) => tip.show(e, (
                     <>
                       <div className="xo-tip-h">{WEEKDAYS[di]} {String(h).padStart(2, "0")}:00–{String(h).padStart(2, "0")}:59</div>
                       <div className="xo-tip-r"><span /><span>Posts</span><b>{n}</b></div>
                     </>
                   ))}
                   onMouseLeave={tip.hide} />
           ))]
        ))}
      </div>
      <div className="xo-heat-scale">
        <span>{tz}</span>
        <span style={{ marginLeft: "auto" }}>fewer</span>
        {steps.map((s, i) => <span key={i} className="xo-heat-cell xo-heat-key" style={{ background: fill(s) }} title={`${s}`} />)}
        <span>more</span>
      </div>
      {tip.node}
    </div>
  );
}

/* ----------------------------------------------------------------- line --- */

/** A single series over time with a crosshair. `points`: [{ t, v }] */
export function LineArea({ points, height = 150, fmtT, unit = "", color = "var(--viz-1)", markers }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const [hover, setHover] = useState(null);
  const padL = 34, padR = 10, padT = 12, padB = 22;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  if (!points.length) {
    return <div ref={ref} className="xo-empty" style={{ height }}>No data in this window.</div>;
  }
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const { top, ticks } = niceTicks(Math.max(1, ...points.map((p) => p.v)) * 1.08);
  const x = (t) => padL + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v) => padT + plotH - (v / top) * plotH;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${d}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = t0 + ((e.clientX - r.left - padL) / Math.max(1, plotW)) * (t1 - t0);
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].t < tx) lo = mid; else hi = mid; }
    const p = Math.abs(points[lo].t - tx) < Math.abs(points[hi].t - tx) ? points[lo] : points[hi];
    setHover(p);
    tip.show(e, (
      <>
        <div className="xo-tip-h">{fmtT(p.t, true)}</div>
        <div className="xo-tip-r"><span className="xo-swatch" style={{ background: color }} /><span>{unit}</span><b>{p.v}</b></div>
        {p.note ? <div className="xo-tip-note">{p.note}</div> : null}
      </>
    ));
  };

  return (
    <div ref={(el) => { ref.current = el; tip.box.current = el; }} className="xo-chart" style={{ height }}>
      {w > 0 ? (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => { setHover(null); tip.hide(); }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="xo-grid" />
              <text x={padL - 7} y={y(t)} className="xo-tick" textAnchor="end" dominantBaseline="middle">{t}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={height - 6} className="xo-tick"
                  textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{fmtT(t)}</text>
          ))}
          <path d={area} fill={color} opacity="0.1" />
          <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {markers ? markers.map((m) => (
            <circle key={m.t} cx={x(m.t)} cy={y(m.v)} r="4" fill={m.color || color}
                    stroke="rgb(var(--surface-raised))" strokeWidth="2" />
          )) : null}
          {hover ? (
            <g pointerEvents="none">
              <line x1={x(hover.t)} x2={x(hover.t)} y1={padT} y2={padT + plotH} className="xo-cross" />
              <circle cx={x(hover.t)} cy={y(hover.v)} r="4.5" fill={color}
                      stroke="rgb(var(--surface-raised))" strokeWidth="2" />
            </g>
          ) : null}
        </svg>
      ) : null}
      {tip.node}
    </div>
  );
}

/* ------------------------------------------------------------ bar list --- */

/** Ranked horizontal bars in HTML — the label, the share, the count. */
export function BarList({ items, total, max = 8, color = "var(--viz-1)", fmtLabel = (s) => s }) {
  const shown = items.slice(0, max);
  const rest = items.slice(max).reduce((s, i) => s + i.n, 0);
  const rows = rest ? [...shown, { key: "__other", n: rest, other: true }] : shown;
  const top = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="xo-barlist">
      {rows.map((r) => (
        <div key={r.key} className="xo-barlist-row">
          <span className="xo-barlist-label" title={r.key}>{r.other ? `Other (${items.length - max})` : fmtLabel(r.key)}</span>
          <span className="xo-barlist-track">
            <span style={{ width: `${(r.n / top) * 100}%`, background: r.other ? "var(--viz-muted)" : color }} />
          </span>
          <span className="xo-num xo-barlist-n">{r.n}</span>
          <span className="xo-num xo-barlist-p">{total ? `${Math.round((r.n / total) * 100)}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- meter --- */

export function Meter({ value, max, marker, tone = "accent", label }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const mk = marker != null && max ? Math.max(0, Math.min(100, (marker / max) * 100)) : null;
  const fill = tone === "warn" ? "rgb(var(--warn))" : tone === "critical" ? "rgb(var(--neg))" : "var(--viz-1)";
  return (
    <div className="xo-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span className="xo-meter-fill" style={{ width: `${pct}%`, background: fill }} />
      {mk != null ? <span className="xo-meter-mark" style={{ left: `${mk}%` }} /> : null}
    </div>
  );
}
