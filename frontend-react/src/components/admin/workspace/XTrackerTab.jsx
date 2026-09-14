// src/components/admin/workspace/XTrackerTab.jsx
//
// LuxQuant — Management System › X Operations.
//
// Rebuilt from zero on 2026-09-15. The page answers four questions in the order
// an operator asks them, and the layout is that order:
//
//   1. Is it running?          account status, pace against the cap, next run
//   2. Is anything wrong?      a checklist whose "all clear" is evidence, not
//                              the absence of a banner
//   3. What should I do?       hand-post suggestions
//   4. How is it going?        output, account safety, cost, then every post
//                              and what its call did afterwards
//
// Two constraints shape what is NOT here. Reach and engagement are absent on
// purpose: X bills reads against the posting credit and the owner turned reads
// off, so the page says so instead of estimating. And the two accounts are never
// merged into one list — they are judged on whether their output differs.
//
// Data: workspaceApi.getXOverview / getXTracker / getXCandidates
// Backend: /api/v1/admin/x-tracker{,/overview,/candidates} — our DB + systemd only

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import CoinLogo from "../../CoinLogo";
import {
  SERIES, RUNGS, Legend, StackedColumns, Columns, LengthHistogram,
  WeekHourHeatmap, LineArea, BarList, Meter,
} from "./xtracker/charts";

const OVERVIEW_MS = 30_000;
const POSTS_MS = 60_000;
const CAND_MS = 5 * 60_000;
const PAGE = 25;
const MOVER_AT = 15;

/* ------------------------------------------------------------ formatting -- */

const pct = (v, d = 1) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const shortPair = (p) => (p || "").replace(/USDT$/, "");
const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US"));
const usd = (v) => {
  const n = Number(v || 0);
  if (n === 0) return "$0";
  if (Math.abs(n) < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};
const price = (v) => {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  const trim = (s) => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (a >= 1) return trim(v.toFixed(4));
  if (a >= 0.01) return trim(v.toFixed(5));
  if (a >= 0.0001) return trim(v.toFixed(7));
  return v.toExponential(3);
};
const dur = (sec) => {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "—";
  const s = Math.abs(Math.round(sec));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(s / 86400)}d`;
};
const since = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 1000 : null);
const until = (iso) => (iso ? (new Date(iso).getTime() - Date.now()) / 1000 : null);
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayKeyUTC = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const dayLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The last `n` UTC days, oldest first — the cap resets on the UTC date. */
const utcDays = (n) => {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

/* ---------------------------------------------------------------- styles -- */

const CSS = `
.xo { --xo-card: rgb(var(--surface-raised)); --xo-sunk: rgb(var(--ink) / 0.035);
  --xo-line: rgb(var(--ink) / 0.09); --xo-grid: rgb(var(--ink) / 0.07);
  --xo-fg: rgb(var(--fg)); --xo-sec: rgb(var(--fg-secondary)); --xo-muted: rgb(var(--fg-muted));
  --xo-good: rgb(var(--pos-text)); --xo-bad: rgb(var(--neg-text)); --xo-warn: rgb(var(--warn));
  color: var(--xo-fg); font-size: 13.5px; padding: 2px 0 56px; }
.xo * { box-sizing: border-box; }
.xo-num { font-variant-numeric: tabular-nums; }
.xo-mono { font-family: var(--font-mono, "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace); }
.xo-muted { color: var(--xo-muted); }
.xo-sec { color: var(--xo-sec); }

.xo-head { display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; }
.xo-head h2 { margin:0; font-size:22px; font-weight:650; letter-spacing:-.015em; }
.xo-head p { margin:5px 0 0; color:var(--xo-muted); font-size:13.5px; max-width:66ch; line-height:1.5; }
.xo-controls { margin-left:auto; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.xo-updated { font-size:12px; color:var(--xo-muted); display:inline-flex; gap:6px; align-items:center; }

.xo-seg { display:inline-flex; background:var(--xo-sunk); border:1px solid var(--xo-line); border-radius:9px; padding:2px; gap:2px; }
.xo-seg button { border:0; background:transparent; color:var(--xo-muted); padding:5px 11px; border-radius:7px;
  font-size:12.5px; font-weight:550; cursor:pointer; white-space:nowrap; }
.xo-seg button:hover { color:var(--xo-fg); }
.xo-seg button[aria-pressed="true"] { background:var(--xo-card); color:var(--xo-fg); box-shadow:0 1px 2px rgb(0 0 0 / .12); }

.xo-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--xo-line); background:var(--xo-card);
  color:var(--xo-fg); padding:6px 11px; border-radius:8px; font-size:12.5px; font-weight:550; cursor:pointer;
  text-decoration:none; white-space:nowrap; }
.xo-btn:hover:not(:disabled) { border-color: rgb(var(--ink) / .22); background: rgb(var(--surface-hover)); }
.xo-btn:disabled { opacity:.5; cursor:default; }
.xo-btn[aria-pressed="true"] { border-color: rgb(var(--accent) / .55); background: rgb(var(--accent) / .12); }
.xo-link { background:none; border:0; padding:0; color:var(--xo-sec); font-size:12.5px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }

.xo-nav { position:sticky; top:0; z-index:5; margin:18px -2px 0; padding:8px 2px; display:flex; gap:4px; overflow-x:auto;
  background: rgb(var(--surface) / .92); backdrop-filter: blur(6px); border-bottom:1px solid var(--xo-line); }
.xo-nav button { border:0; background:transparent; color:var(--xo-muted); font-size:12.5px; font-weight:550;
  padding:6px 10px; border-radius:7px; cursor:pointer; white-space:nowrap; display:inline-flex; gap:6px; align-items:center; }
.xo-nav button:hover { color:var(--xo-fg); background:var(--xo-sunk); }
.xo-nav .xo-count { font-size:11px; padding:0 6px; border-radius:99px; background: rgb(var(--warn) / .18); color:var(--xo-fg); }

.xo-section { margin-top:30px; scroll-margin-top:60px; }
.xo-section > header { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.xo-section > header h3 { margin:0; font-size:16px; font-weight:650; letter-spacing:-.01em; }
.xo-section > header p { margin:0; color:var(--xo-muted); font-size:12.5px; }

.xo-grid2 { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); }
.xo-grid3 { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
.xo-tiles { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); }

.xo-card { background:var(--xo-card); border:1px solid var(--xo-line); border-radius:12px; padding:16px; min-width:0; }
.xo-card-h { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
.xo-card-h h4 { margin:0; font-size:13.5px; font-weight:650; }
.xo-card-h p { margin:3px 0 0; font-size:12px; color:var(--xo-muted); line-height:1.45; }
.xo-card-h .xo-right { margin-left:auto; display:flex; gap:8px; align-items:center; }

.xo-tile .xo-tile-l { font-size:12px; color:var(--xo-muted); }
.xo-tile .xo-tile-v { font-size:26px; font-weight:650; letter-spacing:-.02em; margin-top:4px; line-height:1.1; }
.xo-tile .xo-tile-v small { font-size:14px; font-weight:550; color:var(--xo-muted); margin-left:3px; }
.xo-tile .xo-tile-n { font-size:12px; color:var(--xo-muted); margin-top:6px; line-height:1.4; }

.xo-acct-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.xo-acct-handle { font-size:15px; font-weight:650; }
.xo-acct-role { font-size:12px; color:var(--xo-muted); }
.xo-hero { display:flex; align-items:baseline; gap:8px; margin-top:14px; flex-wrap:wrap; }
.xo-hero b { font-size:40px; font-weight:650; letter-spacing:-.03em; line-height:1; }
.xo-hero span { color:var(--xo-muted); font-size:14px; }
.xo-facts { display:grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap:10px 16px; margin-top:14px;
  padding-top:12px; border-top:1px solid var(--xo-line); }
.xo-fact dt { font-size:11.5px; color:var(--xo-muted); }
.xo-fact dd { margin:2px 0 0; font-size:13.5px; font-weight:550; }

.xo-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:3px 9px 3px 7px;
  border-radius:99px; border:1px solid var(--xo-line); white-space:nowrap; }
.xo-pill svg { flex:none; }
.xo-pill[data-level="good"] svg { color:var(--xo-good); }
.xo-pill[data-level="warn"] svg { color:var(--xo-warn); }
.xo-pill[data-level="critical"] svg { color:var(--xo-bad); }
.xo-pill[data-level="off"] svg { color:var(--xo-muted); }

.xo-meter { position:relative; height:8px; border-radius:99px; background: color-mix(in oklab, var(--viz-1) 16%, rgb(var(--surface-raised))); overflow:visible; margin-top:10px; }
.xo-meter-fill { position:absolute; left:0; top:0; bottom:0; border-radius:99px; }
.xo-meter-mark { position:absolute; top:-4px; bottom:-4px; width:2px; margin-left:-1px; background:var(--xo-fg); border-radius:1px; }

.xo-checks { display:grid; gap:0; }
.xo-check { display:grid; grid-template-columns: 22px minmax(0,1fr) auto; gap:10px; padding:11px 2px; align-items:start; }
.xo-check + .xo-check { border-top:1px solid var(--xo-line); }
.xo-check-t { font-weight:600; }
.xo-check-d { font-size:12.5px; color:var(--xo-muted); margin-top:2px; line-height:1.45; }
.xo-check-v { font-size:12.5px; color:var(--xo-sec); white-space:nowrap; }
.xo-check svg[data-level="good"] { color:var(--xo-good); }
.xo-check svg[data-level="warn"] { color:var(--xo-warn); }
.xo-check svg[data-level="critical"] { color:var(--xo-bad); }
.xo-check svg[data-level="off"] { color:var(--xo-muted); }
.xo-summary { display:flex; gap:14px; flex-wrap:wrap; align-items:center; font-size:13px; }
.xo-summary span { display:inline-flex; gap:6px; align-items:center; }

.xo-cands { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
.xo-draft { margin-top:10px; padding:10px 12px; border-radius:8px; background:var(--xo-sunk); border:1px solid var(--xo-line);
  font-size:13.5px; line-height:1.5; }

.xo-chart { position:relative; width:100%; }
.xo-chart svg { display:block; overflow:visible; }
.xo-grid { stroke: var(--xo-grid); stroke-width:1; shape-rendering: crispEdges; }
.xo-tick { fill: var(--xo-muted); font-size:10.5px; font-variant-numeric: tabular-nums; }
.xo-tick-html { color: var(--xo-muted); font-size:10.5px; font-variant-numeric: tabular-nums; line-height:1; align-self:center; }
.xo-dlabel { fill: var(--xo-fg); font-size:11px; font-weight:600; font-variant-numeric: tabular-nums; }
.xo-ref { stroke: var(--xo-sec); stroke-width:1.25; }
.xo-ref-label { fill: var(--xo-sec); font-size:10.5px; font-weight:600; }
.xo-cross { stroke: rgb(var(--ink) / .3); stroke-width:1; }
.xo-empty { display:flex; align-items:center; justify-content:center; color:var(--xo-muted); font-size:13px;
  border:1px dashed var(--xo-line); border-radius:9px; }

.xo-tip { position:absolute; z-index:20; pointer-events:none; min-width:150px; max-width:220px; background: rgb(var(--surface-raised));
  border:1px solid rgb(var(--ink) / .16); border-radius:9px; padding:8px 10px; font-size:12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / .22); }
.xo-tip-h { font-weight:650; margin-bottom:5px; }
.xo-tip-r { display:grid; grid-template-columns: 12px 1fr auto; gap:6px; align-items:center; color:var(--xo-sec); padding:1px 0; }
.xo-tip-r b { color:var(--xo-fg); font-variant-numeric: tabular-nums; font-weight:600; }
.xo-tip-total { border-top:1px solid var(--xo-line); margin-top:3px; padding-top:4px; }
.xo-tip-note { color:var(--xo-muted); margin-top:4px; line-height:1.4; }
.xo-swatch { display:inline-block; width:10px; height:10px; border-radius:3px; flex:none; }

.xo-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--xo-sec); }
.xo-legend-i { display:inline-flex; gap:6px; align-items:center; }

.xo-heat { display:grid; grid-template-columns: 30px repeat(24, minmax(0, 1fr)); gap:2px; }
.xo-heat-cell { display:block; aspect-ratio: 1 / 1; min-height:10px; border-radius:3px; }
.xo-heat-scale { display:flex; gap:4px; align-items:center; margin-top:10px; font-size:11px; color:var(--xo-muted); }
.xo-heat-key { width:12px; height:12px; aspect-ratio:auto; min-height:0; }

.xo-barlist { display:grid; gap:7px; }
.xo-barlist-row { display:grid; grid-template-columns: minmax(90px, 46%) minmax(0,1fr) 30px 36px; gap:10px; align-items:center; font-size:12.5px; }
.xo-barlist-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--xo-sec); }
.xo-barlist-track { height:8px; border-radius:99px; background: var(--xo-sunk); overflow:hidden; }
.xo-barlist-track span { display:block; height:100%; border-radius:99px; }
.xo-barlist-n { text-align:right; font-weight:600; }
.xo-barlist-p { text-align:right; color:var(--xo-muted); }

.xo-table-wrap { overflow-x:auto; border:1px solid var(--xo-line); border-radius:12px; background:var(--xo-card); }
.xo-table { width:100%; border-collapse:separate; border-spacing:0; min-width:900px; font-size:13px; }
.xo-table th { position:sticky; top:0; background:var(--xo-card); text-align:left; font-size:11.5px; font-weight:600;
  color:var(--xo-muted); padding:10px 12px; border-bottom:1px solid var(--xo-line); white-space:nowrap; }
.xo-table th.r, .xo-table td.r { text-align:right; }
.xo-table th button { all:unset; cursor:pointer; display:inline-flex; gap:4px; align-items:center; }
.xo-table th button:hover { color:var(--xo-fg); }
.xo-table th[aria-sort] button { color:var(--xo-fg); }
.xo-table td { padding:9px 12px; border-bottom:1px solid var(--xo-line); vertical-align:middle; }
.xo-table tbody tr.xo-row { cursor:pointer; }
.xo-table tbody tr.xo-row:hover td { background: rgb(var(--surface-hover) / .6); }
.xo-table tr.xo-detail td { background: var(--xo-sunk); padding:14px 16px 16px 52px; }
.xo-simple { width:100%; border-collapse:collapse; font-size:12.5px; }
.xo-simple th { text-align:left; font-weight:600; color:var(--xo-muted); padding:6px 8px; border-bottom:1px solid var(--xo-line); font-size:11.5px; }
.xo-simple td { padding:6px 8px; border-bottom:1px solid var(--xo-line); }
.xo-simple .r { text-align:right; }

.xo-coin { display:flex; gap:10px; align-items:center; min-width:0; }
.xo-coin b { font-weight:650; }
.xo-chip { font-size:11px; padding:1px 7px; border-radius:99px; border:1px solid var(--xo-line); color:var(--xo-sec); white-space:nowrap; }
.xo-chip[data-tone="warn"] { border-color: rgb(var(--warn) / .45); background: rgb(var(--warn) / .12); color:var(--xo-fg); }
.xo-up { color: var(--xo-good); }
.xo-dn { color: var(--xo-bad); }

.xo-journey { display:flex; align-items:center; gap:8px; white-space:nowrap; }
.xo-track { position:relative; width:90px; height:6px; border-radius:99px; background:var(--xo-sunk); flex:none; }
.xo-track i { position:absolute; top:0; bottom:0; border-radius:99px; }

.xo-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
.xo-search { border:1px solid var(--xo-line); background:var(--xo-card); color:var(--xo-fg); border-radius:8px;
  padding:6px 10px; font-size:13px; min-width:160px; }
.xo-search:focus { outline:2px solid rgb(var(--accent) / .6); outline-offset:0; }
.xo-pager { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; font-size:12.5px; color:var(--xo-muted); }

.xo-feed { display:grid; gap:8px; }
.xo-feed-row { display:flex; gap:12px; align-items:flex-start; padding:10px 12px; border-radius:9px; background:var(--xo-sunk); border:1px solid var(--xo-line); }
.xo-feed-meta { display:flex; gap:10px; flex-wrap:wrap; margin-top:4px; font-size:11.5px; color:var(--xo-muted); }

.xo-notice { display:flex; gap:10px; align-items:flex-start; padding:11px 13px; border-radius:10px; border:1px solid var(--xo-line);
  background:var(--xo-sunk); font-size:12.5px; color:var(--xo-sec); line-height:1.5; }
.xo-notice svg { flex:none; margin-top:1px; color:var(--xo-muted); }
.xo-error { border-color: rgb(var(--neg) / .4); background: rgb(var(--neg) / .08); color:var(--xo-fg); }

.xo button:focus-visible, .xo a:focus-visible, .xo tr:focus-visible { outline:2px solid rgb(var(--accent)); outline-offset:1px; }
.xo-stale { opacity:.6; transition: opacity .2s; }
@media (max-width: 760px) { .xo-hide-sm { display:none; } .xo-hero b { font-size:32px; } }
`;

/* ----------------------------------------------------------------- atoms -- */

const ICON = {
  good: <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  warn: <><path d="M8 2.2l6.2 11H1.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6.5v3M8 11.4v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  critical: <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  off: <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  info: <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 7.3v3.6M8 5.1v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
};
const LEVEL_WORD = { good: "Passing", warn: "Needs a look", critical: "Action needed", off: "Off by choice" };

function StatusIcon({ level, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" data-level={level} aria-label={LEVEL_WORD[level] || level} role="img">
      {ICON[level] || ICON.info}
    </svg>
  );
}

function Pill({ level, children }) {
  return <span className="xo-pill" data-level={level}><StatusIcon level={level} size={14} />{children}</span>;
}

function Seg({ options, value, onChange, label }) {
  return (
    <div className="xo-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Tile({ label, value, unit, note, children }) {
  return (
    <div className="xo-card xo-tile">
      <div className="xo-tile-l">{label}</div>
      <div className="xo-tile-v">{value}{unit ? <small>{unit}</small> : null}</div>
      {children}
      {note ? <div className="xo-tile-n">{note}</div> : null}
    </div>
  );
}

/** A chart card with a table twin, so no value hides behind a hover. */
function ChartCard({ title, sub, legend, table, children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="xo-card">
      <div className="xo-card-h">
        <div style={{ minWidth: 0 }}>
          <h4>{title}</h4>
          {sub ? <p>{sub}</p> : null}
        </div>
        {table ? (
          <div className="xo-right">
            <button className="xo-link" onClick={() => setAsTable((v) => !v)}>{asTable ? "Chart" : "Table"}</button>
          </div>
        ) : null}
      </div>
      {legend && !asTable ? <div style={{ marginBottom: 10 }}>{legend}</div> : null}
      {asTable ? <div style={{ maxHeight: 260, overflowY: "auto" }}>{table}</div> : children}
    </div>
  );
}

function XLogo({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z" />
    </svg>
  );
}

function OpenPost({ url, pair }) {
  if (!url) return <span className="xo-muted">—</span>;
  return (
    <a className="xo-btn" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
       aria-label={`Open the ${shortPair(pair)} post on X`}>
      <XLogo /> Open
    </a>
  );
}

/* --------------------------------------------------------- derived state -- */

function quietNow(start, end, hour) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Posts in the last few hours, extrapolated to the end of the UTC day. */
function paceOf(posts, used, cap) {
  const now = Date.now() / 1000;
  const windowH = 6;
  const recent = posts.filter((p) => p.t >= now - windowH * 3600).length;
  const perHour = recent / windowH;
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const hoursLeft = (midnight.getTime() / 1000 - now) / 3600;
  const projected = Math.round(used + perHour * hoursLeft);
  let capAt = null;
  if (used < cap && perHour > 0 && projected >= cap) {
    capAt = new Date((now + ((cap - used) / perHour) * 3600) * 1000);
  }
  return { perHour, projected: Math.min(projected, Math.max(cap, used)), rawProjected: projected, capAt, midnight };
}

function accountState({ enabled, timer, used, cap, lastPostAt, minGap, quiet }) {
  if (!enabled) return { level: "off", label: "Paused" };
  if (timer && timer.known && (!timer.enabled || !timer.active)) return { level: "critical", label: "Timer stopped" };
  if (used >= cap) return { level: "good", label: "Cap reached for today" };
  if (quiet) return { level: "good", label: "Quiet hours" };
  const age = since(lastPostAt);
  if (age !== null && age > Math.max(90, minGap * 3) * 60) return { level: "warn", label: "No recent post" };
  return { level: "good", label: "Posting" };
}

function buildChecks(ov) {
  if (!ov) return [];
  const f = ov.feed, c = ov.commentary, s = ov.safety, r = ov.reach;
  const nowH = new Date().getUTCHours();
  const out = [];

  const pub = f.timer || {};
  const lastRunAge = since(pub.last_run);
  out.push({
    id: "publisher", title: "Feed publisher is running",
    level: !f.enabled ? "off" : !pub.known ? "warn" : !pub.enabled || !pub.active ? "critical"
      : lastRunAge !== null && lastRunAge > 45 * 60 ? "warn" : "good",
    detail: !f.enabled ? "X_PUB_ENABLED is off, so nothing posts to the feed."
      : pub.known ? `Timer ${pub.enabled ? "enabled" : "disabled"}; last run ${dur(lastRunAge)} ago, next in ${dur(until(pub.next_run))}.`
      : "Could not read the timer from systemd.",
    value: pub.last_run ? `${dur(lastRunAge)} ago` : "",
  });

  out.push({
    id: "double", title: "Only one feed poster is switched on",
    level: f.enabled && f.legacy_enabled ? "critical" : "good",
    detail: f.enabled && f.legacy_enabled
      ? "X_POST_ENABLED and X_PUB_ENABLED are both on — every milestone will post twice."
      : "The retired poster (X_POST_ENABLED) is off.",
  });

  const feedAge = since(f.last_post_at);
  const feedQuiet = quietNow(f.quiet_start_utc, f.quiet_end_utc, nowH);
  const expectedGap = Math.max(60, f.min_gap_min * 3) * 60;
  out.push({
    id: "recent", title: "The feed posted recently",
    level: !f.enabled || f.posted_today >= f.daily_cap || feedQuiet ? "off"
      : feedAge === null ? "warn" : feedAge > expectedGap * 2 ? "critical" : feedAge > expectedGap ? "warn" : "good",
    detail: f.posted_today >= f.daily_cap ? "Today's cap is used up, so silence is expected."
      : feedQuiet ? "Inside quiet hours." : `Last post ${dur(feedAge)} ago. More than ${dur(expectedGap)} without one is unusual.`,
    value: f.last_post_at ? `${dur(feedAge)} ago` : "never",
  });

  const pace = paceOf(f.posts, f.posted_today, f.daily_cap);
  const capEarly = pace.capAt && (pace.midnight - pace.capAt) / 3600000 > 5;
  out.push({
    id: "pace", title: "Posts are spread across the whole day",
    level: capEarly ? "warn" : "good",
    detail: capEarly
      ? `At ${pace.perHour.toFixed(1)}/h the cap of ${f.daily_cap} is reached around ${clock(pace.capAt)} (${dur((pace.midnight - pace.capAt) / 1000)} before the UTC reset), leaving the rest of the day silent.`
      : `${pace.perHour.toFixed(1)} posts/h over the last 6h; on pace for about ${pace.projected} of ${f.daily_cap} by the reset.`,
    value: `${f.posted_today}/${f.daily_cap}`,
  });

  const postFails = ov.failures.filter((x) => x.source !== "x_metrics_fetcher");
  const credit = postFails.some((x) => /402|credit/i.test(`${x.note || ""}`));
  out.push({
    id: "failures", title: "Posting calls are succeeding",
    level: credit ? "critical" : postFails.length ? "warn" : "good",
    detail: credit ? "X answered 402 — the credit is empty and nothing can post until it is topped up."
      : postFails.length ? `${postFails.length} failed posting call${postFails.length === 1 ? "" : "s"} in the last 48 hours.`
      : "No failed posting call in the last 48 hours.",
    value: postFails.length ? `${postFails.length} failed` : "0 failed",
  });

  const readAge = since(r.last_read_at);
  const readsOn = r.metrics_timer?.enabled;
  out.push({
    id: "reads", title: "No paid reads are running",
    level: readsOn ? "warn" : readAge !== null && readAge < 3600 * 6 ? "warn" : "good",
    detail: readsOn ? "The reach fetcher timer is enabled — every run reads from X and spends credit."
      : `The reach fetcher is disabled${r.last_read_at ? `; last read ${dur(readAge)} ago` : ""}.`,
  });

  const dupes = s.sample - s.unique_captions;
  out.push({
    id: "dupes", title: "No two feed posts share a caption",
    level: dupes > 0 ? "critical" : "good",
    detail: dupes > 0 ? `${dupes} caption${dupes === 1 ? " was" : "s were"} published more than once in 7 days. Both suspensions cited duplicative posts.`
      : `${s.unique_captions} unique captions across ${s.sample} posts in 7 days.`,
    value: s.sample ? `${Math.round((s.unique_captions / s.sample) * 100)}% unique` : "",
  });

  const topOpener = s.top_openers[0];
  const openerShare = topOpener && s.sample ? topOpener.n / s.sample : 0;
  out.push({
    id: "openers", title: "Captions don't start the same way",
    level: openerShare > 0.15 ? "warn" : "good",
    detail: topOpener ? `Most common opening, “${topOpener.opener}…”, starts ${topOpener.n} of ${s.sample} posts (${Math.round(openerShare * 100)}%). Above 15% reads as a template.`
      : "Not enough posts to judge.",
    value: topOpener ? `${Math.round(openerShare * 100)}% top` : "",
  });

  const overShare = s.sample ? s.over_ceiling / s.sample : 0;
  out.push({
    id: "length", title: `Feed posts stay under ${f.length_ceiling} characters`,
    level: overShare > 0.25 ? "warn" : "good",
    detail: `${s.over_ceiling} of ${s.sample} posts (${Math.round(overShare * 100)}%) ran over. Short posts measured 2.7x the reach of long ones.`,
    value: `${Math.round(overShare * 100)}% over`,
  });

  out.push({
    id: "clock", title: "Post times don't cluster on the hour",
    level: s.on_the_clock > Math.max(4, s.on_the_clock_expected * 2) ? "warn" : "good",
    detail: `${s.on_the_clock} posts landed within a minute of :00 or :30; a random timer would put about ${s.on_the_clock_expected} there.`,
  });

  const lag = c.min_lag_seen;
  out.push({
    id: "lag", title: `@${c.handle} waits for the feed`,
    level: !c.enabled ? "off" : lag === null ? "good" : lag < c.min_lag_min ? "warn" : "good",
    detail: lag === null ? "No commentary post in this window follows a feed post."
      : `Shortest gap after the feed post: ${lag} min (rule: at least ${c.min_lag_min}).`,
    value: lag !== null ? `${lag} min` : "",
  });

  const mentions = c.posts.filter((p) => p.mentioned).length;
  const mShare = c.posts.length ? mentions / c.posts.length : 0;
  out.push({
    id: "mentions", title: `@${c.handle} doesn't over-mention the feed`,
    level: !c.enabled ? "off" : mShare > 1 / c.mention_every + 0.1 ? "warn" : "good",
    detail: `${mentions} of ${c.posts.length} posts mention @${f.handle} (target about 1 in ${c.mention_every}).`,
    value: `${Math.round(mShare * 100)}%`,
  });

  const lastDepth = ov.ticks.length ? ov.ticks[ov.ticks.length - 1].depth : null;
  out.push({
    id: "queue", title: "The queue is not piling up",
    level: lastDepth === null ? "warn" : lastDepth > 200 ? "warn" : "good",
    detail: lastDepth === null ? "The publisher has not recorded a queue snapshot in this window."
      : `${lastDepth} candidates waiting. Items expire after the publisher's TTL, so a large queue means material is being dropped, not delayed.`,
    value: lastDepth !== null ? `${lastDepth} queued` : "",
  });

  const order = { critical: 0, warn: 1, good: 2, off: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* ------------------------------------------------------------- sections -- */

function AccountCard({ role, handle, enabled, timer, used, cap, lastPostAt, posts, minGap, quiet, extraFacts }) {
  const state = accountState({ enabled, timer, used, cap, lastPostAt, minGap, quiet });
  const pace = paceOf(posts, used, cap);
  return (
    <div className="xo-card">
      <div className="xo-acct-top">
        <XLogo size={14} />
        <a className="xo-acct-handle" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer"
           style={{ color: "inherit", textDecoration: "none" }}>@{handle}</a>
        <span className="xo-acct-role">{role}</span>
        <span style={{ marginLeft: "auto" }}><Pill level={state.level}>{state.label}</Pill></span>
      </div>
      <div className="xo-hero">
        <b className="xo-num">{used}</b>
        <span>of {cap} posts today (UTC)</span>
      </div>
      <Meter value={used} max={cap} marker={enabled && used < cap ? pace.projected : null}
             label={`${used} of ${cap} posts used`} />
      <div className="xo-muted" style={{ fontSize: 12, marginTop: 8 }}>
        {!enabled ? "Paused — nothing will post."
          : used >= cap ? `Cap reached. Resets at ${clock(pace.midnight)} your time.`
          : pace.capAt ? `On pace to hit the cap around ${clock(pace.capAt)} your time.`
          : `On pace for about ${pace.projected} by the reset at ${clock(pace.midnight)} (the tick on the bar).`}
      </div>
      <dl className="xo-facts">
        <div className="xo-fact"><dt>Last post</dt><dd>{lastPostAt ? `${dur(since(lastPostAt))} ago` : "never"}</dd></div>
        <div className="xo-fact"><dt>Next run</dt><dd>{timer?.next_run ? `in ${dur(until(timer.next_run))}` : "—"}</dd></div>
        <div className="xo-fact"><dt>Last 6 hours</dt><dd>{pace.perHour.toFixed(1)} / hour</dd></div>
        <div className="xo-fact"><dt>Min gap</dt><dd>{minGap} min</dd></div>
        {extraFacts}
      </dl>
    </div>
  );
}

function Checks({ checks }) {
  const [showPassing, setShowPassing] = useState(false);
  const bad = checks.filter((c) => c.level === "critical" || c.level === "warn");
  const rest = checks.filter((c) => !(c.level === "critical" || c.level === "warn"));
  const counts = checks.reduce((m, c) => ({ ...m, [c.level]: (m[c.level] || 0) + 1 }), {});
  const Row = (c) => (
    <div className="xo-check" key={c.id}>
      <StatusIcon level={c.level} size={18} />
      <div style={{ minWidth: 0 }}>
        <div className="xo-check-t">{c.title}</div>
        <div className="xo-check-d">{c.detail}</div>
      </div>
      <div className="xo-check-v xo-num">{c.value}</div>
    </div>
  );
  return (
    <div className="xo-card">
      <div className="xo-summary" style={{ marginBottom: bad.length || showPassing ? 6 : 0 }}>
        {counts.critical ? <span><StatusIcon level="critical" /> {counts.critical} action needed</span> : null}
        {counts.warn ? <span><StatusIcon level="warn" /> {counts.warn} to look at</span> : null}
        <span><StatusIcon level="good" /> {counts.good || 0} passing</span>
        {counts.off ? <span className="xo-muted"><StatusIcon level="off" /> {counts.off} not applicable now</span> : null}
        <button className="xo-link" style={{ marginLeft: "auto" }} onClick={() => setShowPassing((v) => !v)}>
          {showPassing ? "Hide passing checks" : `Show all ${checks.length} checks`}
        </button>
      </div>
      {!bad.length && !showPassing ? (
        <div className="xo-check-d" style={{ marginTop: 6 }}>
          Every check passes — the publisher is running, nothing failed, captions are distinct and no paid reads are on.
        </div>
      ) : null}
      <div className="xo-checks">
        {bad.map(Row)}
        {showPassing ? rest.map(Row) : null}
      </div>
    </div>
  );
}

function Candidate({ c, onDone }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };
  const done = async () => {
    setBusy(true);
    try {
      await workspaceApi.dismissXCandidate(c.signal_id, c.kind, "handled");
      onDone(c);
    } finally { setBusy(false); }
  };
  return (
    <div className="xo-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CoinLogo pair={c.pair} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>{shortPair(c.pair)}</div>
          <div className="xo-muted" style={{ fontSize: 12 }}>{c.headline}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="xo-up" style={{ fontSize: 20, fontWeight: 650 }}>{pct(c.metric)}</div>
          <div className="xo-muted" style={{ fontSize: 11.5 }}>{c.metric_label}</div>
        </div>
      </div>
      <div className="xo-draft">{c.draft}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="xo-btn" onClick={copy}>{copied ? "Copied" : "Copy text"}</button>
        {c.quote_url ? (
          <a className="xo-btn" href={c.quote_url} target="_blank" rel="noreferrer"><XLogo /> Quote the post</a>
        ) : (
          <span className="xo-muted" style={{ fontSize: 12 }}>Not on X yet — write it fresh</span>
        )}
        <button className="xo-btn" onClick={done} disabled={busy} style={{ marginLeft: "auto" }}>
          {busy ? "Saving…" : "Mark done"}
        </button>
      </div>
    </div>
  );
}

function Journey({ atPost, now, domain }) {
  if (atPost == null || now == null) return <span className="xo-muted">—</span>;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const a = pos(atPost), b = pos(now), up = now >= atPost;
  return (
    <span className="xo-journey" title={`${pct(atPost)} when posted → ${pct(now)} now`}>
      <span className="xo-muted xo-num" style={{ fontSize: 12 }}>{pct(atPost)}</span>
      <span className="xo-track">
        <i style={{ left: `${Math.min(a, b)}%`, width: `${Math.max(2, Math.abs(b - a))}%`,
                    background: up ? "rgb(var(--pos))" : "rgb(var(--neg))" }} />
      </span>
      <span className={`xo-num ${up ? "xo-up" : "xo-dn"}`} style={{ fontWeight: 600 }}>{pct(now)}</span>
    </span>
  );
}

const SORTS = {
  since: { label: "Since post", get: (r) => r.since_post },
  now: { label: "Now", get: (r) => r.pct_now },
  peak: { label: "Peak", get: (r) => r.peak_pct },
  posted: { label: "Posted", get: (r) => (r.posted_at ? new Date(r.posted_at).getTime() : null) },
};

function PostsTable({ rows, loading }) {
  const [q, setQ] = useState("");
  const [rung, setRung] = useState("all");
  const [movers, setMovers] = useState(false);
  const [ranPast, setRanPast] = useState(false);
  // One coin often carries several posts in a window; sorted by run size the
  // same coin fills the top of the list. Collapsing keeps each coin's leading
  // post and says how many more there are.
  const [perCoin, setPerCoin] = useState(true);
  const [sort, setSort] = useState({ key: "since", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(() => new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const out = rows.filter((r) =>
      (!needle || shortPair(r.pair).includes(needle)) &&
      (rung === "all" || r.posted_at_label === rung) &&
      (!movers || (r.since_post || 0) >= MOVER_AT) &&
      (!ranPast || r.went_further));
    const get = SORTS[sort.key].get;
    out.sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * sort.dir;
    });
    if (!perCoin) return out.map((r) => ({ ...r, more: 0 }));
    const lead = new Map();
    out.forEach((r) => {
      const hit = lead.get(r.pair);
      if (hit) hit.more += 1; else lead.set(r.pair, { ...r, more: 0 });
    });
    return [...lead.values()];
  }, [rows, q, rung, movers, ranPast, sort, perCoin]);

  useEffect(() => { setPage(0); }, [q, rung, movers, ranPast, sort, perCoin]);

  const domain = useMemo(() => {
    const vals = [];
    filtered.forEach((r) => { if (r.pct_at_post != null) vals.push(r.pct_at_post); if (r.pct_now != null) vals.push(r.pct_now); });
    return vals.length ? [Math.min(0, ...vals), Math.max(1, ...vals)] : [0, 1];
  }, [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const toggle = (k) => setOpen((v) => { const n = new Set(v); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const Th = ({ k, className }) => (
    <th className={className} aria-sort={sort.key === k ? (sort.dir < 0 ? "descending" : "ascending") : undefined}>
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))}>
        {SORTS[k].label}{sort.key === k ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <>
      <div className="xo-filters">
        <input className="xo-search" placeholder="Search coin" value={q} onChange={(e) => setQ(e.target.value)}
               aria-label="Search coin" />
        <Seg label="Target" value={rung} onChange={setRung}
             options={[{ value: "all", label: "All" }, ...RUNGS.map((k) => ({ value: k, label: k }))]} />
        <button className="xo-btn" aria-pressed={movers} onClick={() => setMovers((v) => !v)}>Moved {MOVER_AT}%+ since post</button>
        <button className="xo-btn" aria-pressed={ranPast} onClick={() => setRanPast((v) => !v)}>Climbed past the posted target</button>
        <button className="xo-btn" aria-pressed={perCoin} onClick={() => setPerCoin((v) => !v)}>One row per coin</button>
        <span className="xo-muted" style={{ marginLeft: "auto", fontSize: 12.5 }}>
          {num(filtered.length)} {perCoin ? "coins" : "posts"} · {num(rows.length)} posts in window
        </span>
      </div>
      <div className={`xo-table-wrap${loading ? " xo-stale" : ""}`}>
        <table className="xo-table">
          <thead>
            <tr>
              <th>Coin</th>
              <Th k="posted" />
              <th className="xo-hide-sm">Reached</th>
              <th>Target when posted → now</th>
              <Th k="peak" className="r xo-hide-sm" />
              <Th k="since" className="r" />
              <th className="r"><span className="xo-hide-sm">Post</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const k = `${r.tweet_id}-${r.posted_at_label}`;
              const isOpen = open.has(k);
              return (
                <Fragment key={k}>
                  <tr className="xo-row" tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(k)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}>
                    <td>
                      <span className="xo-coin">
                        <CoinLogo pair={r.pair} size={24} />
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <b>{shortPair(r.pair)}{r.more ? <span className="xo-muted" style={{ fontWeight: 500, fontSize: 11.5 }}> +{r.more} more</span> : null}</b>
                          <span className="xo-muted xo-num" style={{ fontSize: 11.5 }}>{price(r.price_now)}</span>
                        </span>
                      </span>
                    </td>
                    <td className="xo-num" style={{ whiteSpace: "nowrap" }}>
                      <span className="xo-chip">{r.posted_at_label}</span>{" "}
                      <span className="xo-muted">{dur(since(r.posted_at))} ago</span>
                    </td>
                    <td className="xo-hide-sm">
                      {r.went_further ? <span className="xo-chip" data-tone="warn">{r.reached_label}</span>
                        : <span className="xo-muted">{r.reached_label || "—"}</span>}
                    </td>
                    <td><Journey atPost={r.pct_at_post} now={r.pct_now} domain={domain} /></td>
                    <td className="r xo-num xo-muted xo-hide-sm">{pct(r.peak_pct)}</td>
                    <td className={`r xo-num ${r.since_post > 0 ? "xo-up" : r.since_post < 0 ? "xo-dn" : "xo-muted"}`}
                        style={{ fontWeight: 650, fontSize: 14 }}>{pct(r.since_post)}</td>
                    <td className="r"><OpenPost url={r.tweet_url} pair={r.pair} /></td>
                  </tr>
                  {isOpen ? (
                    <tr className="xo-detail">
                      <td colSpan={7}>
                        <div style={{ fontSize: 14, lineHeight: 1.55, maxWidth: "72ch" }}>
                          {r.caption ? `“${r.caption}”` : "No caption recorded for this post."}
                        </div>
                        {r.caption && !r.caption_is_x ? (
                          <div style={{ fontSize: 12, marginTop: 6 }} className="xo-sec">
                            This is the Telegram caption — X's own wording was not recorded for this post.
                          </div>
                        ) : null}
                        <table className="xo-simple" style={{ maxWidth: 560, marginTop: 12 }}>
                          <thead><tr><th /><th className="r">Price</th><th className="r">From entry</th><th>Note</th></tr></thead>
                          <tbody>
                            <tr><td>Entry</td><td className="r xo-num">{price(r.entry)}</td><td className="r">—</td><td /></tr>
                            <tr><td>Posted target ({r.posted_at_label})</td><td className="r xo-num">{price(r.target)}</td><td className="r xo-num">{pct(r.pct_at_post)}</td><td className="xo-muted">{dur(since(r.posted_at))} ago</td></tr>
                            <tr><td>Now</td><td className="r xo-num">{price(r.price_now)}</td><td className="r xo-num">{pct(r.pct_now)}</td><td className="xo-muted">{pct(r.since_post)} since the post</td></tr>
                            <tr><td>Peak</td><td className="r xo-num">{price(r.peak_price)}</td><td className="r xo-num">{pct(r.peak_pct)}</td><td className="xo-muted">high-water mark, not a realised return</td></tr>
                          </tbody>
                        </table>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          {r.caption ? <span className="xo-chip">{r.caption.length} chars</span> : null}
                          {r.style ? <span className="xo-chip">style · {r.style}</span> : null}
                          {r.hook ? <span className="xo-chip">hook · {r.hook}</span> : null}
                          {r.pattern ? <span className="xo-chip">pattern · {r.pattern}</span> : null}
                          {r.voice ? <span className="xo-chip">voice · {r.voice}</span> : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!shown.length ? (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: "center" }} className="xo-muted">
                {rows.length ? "No post matches these filters." : loading ? "Loading posts…" : "Nothing published in this window."}
              </td></tr>
            ) : null}
          </tbody>
        </table>
        {filtered.length > PAGE ? (
          <div className="xo-pager">
            <span className="xo-num">{page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {filtered.length}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="xo-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="xo-num">{page + 1} / {pages}</span>
              <button className="xo-btn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </span>
          </div>
        ) : null}
      </div>
      <p className="xo-muted" style={{ fontSize: 12.5, marginTop: 10, maxWidth: "88ch", lineHeight: 1.55 }}>
        <b className="xo-sec">Since post</b> is where the coin trades now (Binance USDⓈ-M) minus the target the post was
        about — the one column that says whether a call is worth mentioning again. <b className="xo-sec">Peak</b> is the
        highest price ever recorded, a high-water mark and never a result to quote. Click a row for the caption X published.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ page -- */

const NAV = [
  ["status", "Status"], ["checks", "Checks"], ["inbox", "Post by hand"], ["output", "Output"],
  ["safety", "Account safety"], ["cost", "Cost"], ["posts", "Posts"], ["commentary", "Commentary account"],
];

export function XTrackerTab() {
  const [days, setDays] = useState(14);
  const [ov, setOv] = useState(null);
  const [track, setTrack] = useState(null);
  const [cands, setCands] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState({ ov: false, track: false });
  const [, setTick] = useState(0);
  const root = useRef(null);

  const loadOv = useCallback(async (d) => {
    setBusy((b) => ({ ...b, ov: true }));
    try { setOv(await workspaceApi.getXOverview(d)); setErr(null); }
    catch (e) { setErr(e?.response?.data?.detail || e.message || "Could not load the overview"); }
    finally { setBusy((b) => ({ ...b, ov: false })); }
  }, []);
  const loadTrack = useCallback(async (d) => {
    setBusy((b) => ({ ...b, track: true }));
    try { setTrack(await workspaceApi.getXTracker(d)); }
    catch (e) { setErr(e?.response?.data?.detail || e.message || "Could not load posts"); }
    finally { setBusy((b) => ({ ...b, track: false })); }
  }, []);
  const loadCands = useCallback(async () => {
    try { setCands(await workspaceApi.getXCandidates(7, 3)); } catch { setCands(null); }
  }, []);

  useEffect(() => {
    loadOv(days);
    loadTrack(days);
    const a = setInterval(() => loadOv(days), OVERVIEW_MS);
    const b = setInterval(() => loadTrack(days), POSTS_MS);
    return () => { clearInterval(a); clearInterval(b); };
  }, [days, loadOv, loadTrack]);

  useEffect(() => {
    loadCands();
    const t = setInterval(loadCands, CAND_MS);
    return () => clearInterval(t);
  }, [loadCands]);

  // keeps "12s ago" honest between fetches
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => { loadOv(days); loadTrack(days); loadCands(); };
  const jump = (id) => root.current?.querySelector(`#xo-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const checks = useMemo(() => buildChecks(ov), [ov]);
  const attention = checks.filter((c) => c.level === "critical" || c.level === "warn").length;

  const output = useMemo(() => {
    if (!ov) return null;
    const keys = utcDays(days);
    const todayKey = keys[keys.length - 1];
    const byDay = Object.fromEntries(keys.map((k) => [k, { TP2: 0, TP3: 0, TP4: 0 }]));
    ov.feed.posts.forEach((p) => { const k = dayKeyUTC(p.t); if (byDay[k] && byDay[k][p.rung] !== undefined) byDay[k][p.rung] += 1; });
    const columns = keys.map((k) => ({ key: k, label: dayLabel(k), tipLabel: `${dayLabel(k)} (UTC)`, values: byDay[k], partial: k === todayKey }));
    const totals = keys.map((k) => RUNGS.reduce((s, r) => s + byDay[k][r], 0));
    const full = totals.slice(0, -1);
    const mix = RUNGS.map((r) => ({ key: r, n: ov.feed.posts.filter((p) => p.rung === r).length }));
    const lens = ov.feed.posts.map((p) => p.len).sort((a, b) => a - b);
    return {
      columns, keys, byDay, totals, mix,
      total: ov.feed.posts.length,
      avg: full.length ? full.reduce((a, b) => a + b, 0) / full.length : 0,
      best: Math.max(0, ...full),
      medianLen: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
    };
  }, [ov, days]);

  const spend = useMemo(() => {
    if (!ov) return null;
    const keys = utcDays(days);
    const posting = Object.fromEntries(keys.map((k) => [k, 0]));
    const posts = Object.fromEntries(keys.map((k) => [k, 0]));
    let reads = 0, readCalls = 0, failed = 0, calls = 0;
    ov.spend.forEach((s) => {
      if (s.kind === "TweetLookup") { reads += s.cost; readCalls += s.calls; return; }
      if (posting[s.day] !== undefined) posting[s.day] += s.cost;
      if (s.kind === "PostCreate" && posts[s.day] !== undefined) posts[s.day] += s.calls - s.failed;
      failed += s.failed; calls += s.calls;
    });
    const todayKey = keys[keys.length - 1];
    const total = keys.reduce((a, k) => a + posting[k], 0);
    const postCount = keys.reduce((a, k) => a + posts[k], 0);
    return {
      keys, posting, posts, reads, readCalls, failed, calls, total, postCount,
      today: posting[todayKey], perPost: postCount ? total / postCount : 0,
      perDay: total / Math.max(1, keys.length - 1 + (new Date().getUTCHours() / 24)),
    };
  }, [ov, days]);

  const commentary = useMemo(() => {
    if (!ov) return null;
    const c = ov.commentary;
    const keys = utcDays(days);
    const byDay = Object.fromEntries(keys.map((k) => [k, 0]));
    c.posts.forEach((p) => { const k = dayKeyUTC(p.t); if (byDay[k] !== undefined) byDay[k] += 1; });
    const lens = c.posts.map((p) => p.len);
    const mentions = c.posts.filter((p) => p.mentioned).length;
    const lags = c.posts.map((p) => p.lag_min).filter((v) => v != null).sort((a, b) => a - b);
    return {
      keys, byDay, mentions,
      longest: lens.length ? Math.max(...lens) : 0,
      medianLag: lags.length ? lags[Math.floor(lags.length / 2)] : null,
    };
  }, [ov, days]);

  if (!ov && !err) {
    return <div className="xo" style={{ padding: 28 }}><style>{CSS}</style><span className="xo-muted">Loading X operations…</span></div>;
  }

  const f = ov?.feed, c = ov?.commentary, s = ov?.safety;
  const nowH = new Date().getUTCHours();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="xo" ref={root}>
      <style>{CSS}</style>

      <div className="xo-head">
        <div style={{ minWidth: 280 }}>
          <h2>X operations</h2>
          <p>Both X accounts at a glance: whether they are posting, whether anything needs you, and what the
            posts did afterwards. Everything comes from our own database — nothing here reads from X or costs credit.</p>
        </div>
        <div className="xo-controls">
          <span className="xo-updated" aria-live="polite">
            Updated {ov ? `${dur(since(ov.generated_at))} ago` : "—"}
          </span>
          <Seg label="Window" value={days} onChange={setDays}
               options={[{ value: 7, label: "7 days" }, { value: 14, label: "14 days" }, { value: 30, label: "30 days" }]} />
          <button className="xo-btn" onClick={refresh} disabled={busy.ov || busy.track}>
            {busy.ov || busy.track ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <nav className="xo-nav" aria-label="Sections">
        {NAV.map(([id, label]) => (
          <button key={id} onClick={() => jump(id)}>
            {label}
            {id === "checks" && attention ? <span className="xo-count">{attention}</span> : null}
            {id === "inbox" && cands?.candidates?.length ? <span className="xo-count">{cands.candidates.length}</span> : null}
          </button>
        ))}
      </nav>

      {err ? <div className="xo-notice xo-error" style={{ marginTop: 16 }}><StatusIcon level="critical" /> {err}</div> : null}

      {ov ? (
        <>
          {/* ---------------------------------------------------- status */}
          <section className="xo-section" id="xo-status">
            <header><h3>Status</h3><p>Today's budget resets at 00:00 UTC ({clock(new Date(new Date().setUTCHours(24, 0, 0, 0)))} your time).</p></header>
            <div className="xo-grid2">
              <AccountCard role="Signal feed" handle={f.handle} enabled={f.enabled} timer={f.timer}
                used={f.posted_today} cap={f.daily_cap} lastPostAt={f.last_post_at} posts={f.posts}
                minGap={f.min_gap_min} quiet={quietNow(f.quiet_start_utc, f.quiet_end_utc, nowH)}
                extraFacts={<div className="xo-fact"><dt>Queue</dt><dd>{ov.ticks.length ? `${ov.ticks[ov.ticks.length - 1].depth} waiting` : "—"}</dd></div>} />
              <AccountCard role="Commentary on finished calls" handle={c.handle} enabled={c.enabled} timer={c.timer}
                used={c.posted_today} cap={c.daily_cap} lastPostAt={c.last_post_at} posts={c.posts}
                minGap={c.min_gap_min} quiet={quietNow(c.quiet_start_wib, c.quiet_end_wib, (nowH + 7) % 24)}
                extraFacts={<div className="xo-fact"><dt>Quiet hours</dt><dd>{String(c.quiet_start_wib).padStart(2, "0")}–{String(c.quiet_end_wib).padStart(2, "0")} WIB</dd></div>} />
            </div>
            <div className="xo-notice" style={{ marginTop: 12 }}>
              <StatusIcon level="info" />
              <span>
                <b className="xo-sec">Reach isn't measured.</b> X bills every read against the same credit that pays for
                posting, so the reach fetcher stays off{ov.reach.last_read_at ? ` (last read ${dur(since(ov.reach.last_read_at))} ago)` : ""}.
                Without fresh reach data the breaker has nothing new to judge. Check impressions in X's own analytics.
              </span>
            </div>
          </section>

          {/* ---------------------------------------------------- checks */}
          <section className="xo-section" id="xo-checks">
            <header><h3>Checks</h3><p>Re-evaluated every {OVERVIEW_MS / 1000}s. Anything not passing is listed first.</p></header>
            <Checks checks={checks} />
          </section>

          {/* ----------------------------------------------------- inbox */}
          <section className="xo-section" id="xo-inbox">
            <header>
              <h3>Worth posting by hand</h3>
              <p>{cands ? `${cands.total} above the bar · ${cands.candidates.length} shown · quoting is never automated` : "Loading…"}</p>
            </header>
            {cands?.candidates?.length ? (
              <div className="xo-cands">
                {cands.candidates.map((x) => (
                  <Candidate key={`${x.signal_id}-${x.kind}`} c={x}
                    onDone={(d) => setCands((v) => ({ ...v, total: Math.max(0, (v?.total || 1) - 1),
                      candidates: (v?.candidates || []).filter((y) => !(y.signal_id === d.signal_id && y.kind === d.kind)) }))} />
                ))}
              </div>
            ) : (
              <div className="xo-notice"><StatusIcon level="good" /> Nothing waiting. A coin shows up here when it runs 40%+ past a posted target, or a 25%+ call never reached X.</div>
            )}
          </section>

          {/* ---------------------------------------------------- output */}
          <section className="xo-section" id="xo-output">
            <header><h3>Output</h3><p>@{f.handle}, last {days} days.</p></header>
            <div className="xo-tiles">
              <Tile label="Posts published" value={num(output.total)} note={`${days} days, including today`} />
              <Tile label="Per full day" value={output.avg.toFixed(1)} note={`best day ${output.best} · today's cap ${f.daily_cap}`} />
              <Tile label="Median length" value={output.medianLen} unit="chars" note={`ceiling ${f.length_ceiling}`} />
              <Tile label="Target mix" value={`${output.total ? Math.round((output.mix.find((m) => m.key === "TP4").n / output.total) * 100) : 0}%`} unit="TP4"
                    note={output.mix.map((m) => `${m.key} ${m.n}`).join(" · ")} />
            </div>
            <div className="xo-grid2" style={{ marginTop: 12 }}>
              <ChartCard title="Posts per day"
                sub={`UTC days, stacked by the target each post announced. The line is today's cap (${f.daily_cap}); earlier days ran under whatever cap was set then. Today is faded because it isn't over.`}
                legend={<Legend items={RUNGS.slice().reverse().map((k) => ({ label: k, color: SERIES[k].color }))} />}
                table={(
                  <table className="xo-simple">
                    <thead><tr><th>Day (UTC)</th>{RUNGS.map((k) => <th key={k} className="r">{k}</th>)}<th className="r">Total</th></tr></thead>
                    <tbody>
                      {output.keys.slice().reverse().map((k, i) => (
                        <tr key={k}><td>{dayLabel(k)}{i === 0 ? " (so far)" : ""}</td>
                          {RUNGS.map((r) => <td key={r} className="r xo-num">{output.byDay[k][r]}</td>)}
                          <td className="r xo-num"><b>{RUNGS.reduce((a, r) => a + output.byDay[k][r], 0)}</b></td></tr>
                      ))}
                    </tbody>
                  </table>
                )}>
                <StackedColumns columns={output.columns} series={RUNGS} reference={f.daily_cap} referenceLabel={`cap ${f.daily_cap}`} height={210} />
              </ChartCard>
              <ChartCard title="When posts go out"
                sub={`Weekday × hour in your timezone (${tz}), last ${days} days. An even field is what a human-paced account looks like; stripes mean a fixed schedule.`}>
                <WeekHourHeatmap times={f.posts.map((p) => p.t)} />
              </ChartCard>
            </div>
            <div style={{ marginTop: 12 }}>
              <ChartCard title="Queue waiting to post"
                sub={`Candidates the publisher had ranked at each run. ${ov.ticks.filter((t) => t.posted).length} of ${ov.ticks.length} runs in this window published something.`}
                table={(
                  <table className="xo-simple">
                    <thead><tr><th>Run</th><th className="r">Queued</th><th>Result</th></tr></thead>
                    <tbody>
                      {ov.ticks.slice().reverse().slice(0, 200).map((t) => (
                        <tr key={t.t}><td>{new Date(t.t * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="r xo-num">{t.depth}</td><td className="xo-muted">{t.posted ? "posted" : "skipped"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}>
                <LineArea points={ov.ticks.map((t) => ({ t: t.t, v: t.depth, note: t.posted ? "This run posted" : "This run skipped" }))}
                  unit="Queued" height={170}
                  fmtT={(t, long) => new Date(t * 1000).toLocaleString("en-GB", long
                    ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                    : { day: "numeric", month: "short" })} />
              </ChartCard>
            </div>
          </section>

          {/* ---------------------------------------------------- safety */}
          <section className="xo-section" id="xo-safety">
            <header><h3>Account safety</h3><p>Both suspensions cited duplicative or automated-looking posts. Last 7 days of @{f.handle}.</p></header>
            <div className="xo-tiles">
              <Tile label="Unique captions" value={`${s.sample ? Math.round((s.unique_captions / s.sample) * 100) : 100}%`}
                    note={`${s.unique_captions} of ${s.sample} posts`}>
                <Meter value={s.unique_captions} max={s.sample || 1} tone={s.unique_captions < s.sample ? "critical" : "accent"} label="Unique captions" />
              </Tile>
              <Tile label="Voice combinations reused" value={s.repeated_voices}
                    note={`${s.distinct_voices} distinct voices; a reuse is a repeat of tone, not text`} />
              <Tile label={`Over ${f.length_ceiling} characters`} value={`${s.sample ? Math.round((s.over_ceiling / s.sample) * 100) : 0}%`}
                    note={`${s.over_ceiling} of ${s.sample} posts`}>
                <Meter value={s.over_ceiling} max={s.sample || 1} tone={s.over_ceiling / Math.max(1, s.sample) > 0.25 ? "warn" : "accent"} label="Posts over the ceiling" />
              </Tile>
              <Tile label="Within a minute of :00 or :30" value={s.on_the_clock}
                    note={`random timing would give about ${s.on_the_clock_expected}`} />
            </div>
            <div className="xo-grid3" style={{ marginTop: 12 }}>
              <ChartCard title="Caption length"
                sub={`Every feed post in the last ${days} days, in 10-character bins. Bars past the ceiling are marked.`}
                legend={<Legend items={[{ label: `Up to ${f.length_ceiling}`, color: "var(--viz-1)" }, { label: `Over ${f.length_ceiling}`, color: "rgb(var(--warn))" }]} />}>
                <LengthHistogram values={f.posts.map((p) => p.len)} ceiling={f.length_ceiling} height={170} />
              </ChartCard>
              <ChartCard title="Hook categories" sub="How posts open. A few dominant bars means the variety engine is narrowing.">
                <BarList items={s.hooks} total={s.sample} max={12} />
              </ChartCard>
              <ChartCard title="Most repeated openings" sub="The first three words. Repeats here look templated even when the rest differs.">
                {s.top_openers.length ? (
                  <BarList items={s.top_openers.map((o) => ({ key: `${o.opener}…`, n: o.n }))} total={s.sample} max={6} />
                ) : <div className="xo-muted">No captions in the last 7 days.</div>}
              </ChartCard>
            </div>
          </section>

          {/* ------------------------------------------------------ cost */}
          <section className="xo-section" id="xo-cost">
            <header><h3>Cost</h3><p>From our own meter (x_api_usage) — X exposes no billing API. Prices are the metered rates, not an invoice.</p></header>
            <div className="xo-tiles">
              <Tile label="Posting spend today" value={usd(spend.today)} note={`UTC day so far`} />
              <Tile label={`Posting spend, ${days} days`} value={usd(spend.total)} note={`about ${usd(spend.perDay)} a day`} />
              <Tile label="Per published post" value={usd(spend.perPost)} note={`${num(spend.postCount)} posts metered`} />
              <Tile label="Spent on reads" value={usd(spend.reads)} note={spend.readCalls ? `${spend.readCalls} read calls in the window (fetcher now off)` : "no reads in this window"} />
            </div>
            <div className="xo-grid2" style={{ marginTop: 12 }}>
              <ChartCard title="Posting spend per day" sub="UTC days. Today is faded because it isn't over."
                table={(
                  <table className="xo-simple">
                    <thead><tr><th>Day (UTC)</th><th className="r">Posts</th><th className="r">Spend</th></tr></thead>
                    <tbody>{spend.keys.slice().reverse().map((k) => (
                      <tr key={k}><td>{dayLabel(k)}</td><td className="r xo-num">{spend.posts[k]}</td><td className="r xo-num">{usd(spend.posting[k])}</td></tr>
                    ))}</tbody>
                  </table>
                )}>
                <Columns height={180} fmt={(v, axis) => (axis ? `$${v}` : usd(v))}
                  items={spend.keys.map((k, i) => ({ key: k, v: Math.round(spend.posting[k] * 1000) / 1000, label: dayLabel(k),
                    tipLabel: `${dayLabel(k)} (UTC)`, tipName: "Spend", tipExtra: `${spend.posts[k]} posts`, partial: i === spend.keys.length - 1 }))} />
              </ChartCard>
              <div className="xo-card">
                <div className="xo-card-h"><div><h4>Failed calls, last 48 hours</h4><p>Posting failures matter; a 402 means the credit ran out.</p></div></div>
                {ov.failures.length ? (
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    <table className="xo-simple">
                      <thead><tr><th>When</th><th>Source</th><th>Error</th></tr></thead>
                      <tbody>{ov.failures.map((x, i) => (
                        <tr key={i}><td className="xo-num" style={{ whiteSpace: "nowrap" }}>{dur(since(x.at))} ago</td>
                          <td>{x.source === "x_metrics_fetcher" ? "reach fetcher (off)" : x.source}</td>
                          <td className="xo-sec">{(x.note || "").split("\n")[0]}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <div className="xo-notice"><StatusIcon level="good" /> No failed call in the last 48 hours.</div>}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* ------------------------------------------------------- posts */}
      <section className="xo-section" id="xo-posts">
        <header>
          <h3>Posts and what happened next</h3>
          <p>@{f?.handle || "luxquantalgo"}, last {days} days, live prices{track?.prices_ok === false ? " — Binance did not answer, prices are missing" : ""}.</p>
        </header>
        <PostsTable rows={track?.rows || []} loading={busy.track && !track} />
      </section>

      {/* -------------------------------------------------- commentary */}
      {ov ? (
        <section className="xo-section" id="xo-commentary">
          <header><h3>@{c.handle}</h3><p>One short note per finished ladder, posted at least {c.min_lag_min} minutes after the feed covered it. Kept apart from the feed on purpose.</p></header>
          <div className="xo-tiles">
            <Tile label="Posts in window" value={num(c.posts.length)} note={`${days} days · cap ${c.daily_cap}/day`} />
            <Tile label="Mentions the feed" value={`${c.posts.length ? Math.round((commentary.mentions / c.posts.length) * 100) : 0}%`}
                  note={`${commentary.mentions} posts · target 1 in ${c.mention_every}`} />
            <Tile label="Wait after the feed" value={commentary.medianLag !== null ? dur(commentary.medianLag * 60) : "—"}
                  note={`median · shortest ${c.min_lag_seen ?? "—"} min · rule ${c.min_lag_min} min`} />
            <Tile label="Longest post" value={commentary.longest} unit="chars" note={`limit ${c.max_chars}`} />
          </div>
          <div className="xo-grid2" style={{ marginTop: 12 }}>
            <ChartCard title="Posts per day" sub={`UTC days. The line is the cap (${c.daily_cap}).`}
              table={(
                <table className="xo-simple"><thead><tr><th>Day (UTC)</th><th className="r">Posts</th></tr></thead>
                  <tbody>{commentary.keys.slice().reverse().map((k) => (
                    <tr key={k}><td>{dayLabel(k)}</td><td className="r xo-num">{commentary.byDay[k]}</td></tr>))}</tbody></table>
              )}>
              <Columns height={180} reference={c.daily_cap} referenceLabel={`cap ${c.daily_cap}`}
                items={commentary.keys.map((k, i) => ({ key: k, v: commentary.byDay[k], label: dayLabel(k),
                  tipLabel: `${dayLabel(k)} (UTC)`, tipName: "Posts", partial: i === commentary.keys.length - 1 }))} />
            </ChartCard>
            <div className="xo-card">
              <div className="xo-card-h"><div><h4>Latest posts</h4><p>What the account actually said.</p></div></div>
              <CommentaryFeed rows={track?.commentary?.rows || []} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CommentaryFeed({ rows }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <div className="xo-muted">Nothing published yet.</div>;
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div className="xo-feed" style={{ maxHeight: all ? 520 : undefined, overflowY: all ? "auto" : undefined }}>
      {shown.map((r) => (
        <div key={`${r.signal_id}-${r.tweet_id}`} className="xo-feed-row">
          <CoinLogo pair={r.pair} size={22} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ lineHeight: 1.45 }}>{r.caption}</div>
            <div className="xo-feed-meta">
              <span>{r.posted_at ? `${dur(since(r.posted_at))} ago` : ""}</span>
              <span>{r.chars} chars</span>
              {r.mentioned ? <span>mentions the feed</span> : null}
              {r.since_post != null ? <span className={r.since_post >= 0 ? "xo-up" : "xo-dn"}>{pct(r.since_post)} since</span> : null}
            </div>
          </div>
          <OpenPost url={r.tweet_url} pair={r.pair} />
        </div>
      ))}
      {rows.length > 5 ? (
        <button className="xo-link" style={{ justifySelf: "start" }} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

export default XTrackerTab;
