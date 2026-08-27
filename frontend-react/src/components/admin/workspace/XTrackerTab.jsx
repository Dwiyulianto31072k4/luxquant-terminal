// src/components/admin/workspace/XTrackerTab.jsx
//
// LuxQuant — Management System › X Tracker.
//
// One screen for the whole X operation: what is waiting, what went out, what
// happened to it afterwards, and whether the machine still looks like a person.
//
// Three things drive every design decision here.
//
// 1. The desk's question is "what should I do next", not "how did we do".
//    So suggestions sit above the fold, the queue sits above the archive, and
//    the table sorts by room left to run rather than by size of the win.
//
// 2. The queue is read from the publisher's own snapshot, never re-derived.
//    A second implementation of the ladder would drift from the one that
//    actually decides what posts, and the drift would be invisible.
//
// 3. This account only. Posts from before the cutover belong to the suspended
//    account and their links are dead; the backend drops them entirely rather
//    than showing rows nobody can act on.
//
// Data: workspaceApi.getXTracker / getXCandidates / dismissXCandidate
// Backend: /api/v1/admin/x-tracker (admin-only, live Binance USDⓈ-M prices)

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import CoinLogo from "../../CoinLogo";

const REFRESH_MS = 20_000;
const CAND_MS = 5 * 60_000;
const PAGE = 20;

// Bands are about ACTION, not magnitude: 40%+ is worth writing about today,
// 15%+ is worth a look, below that is noise.
const MOVER_AT = 15;
const HOT_AT = 40;

const pct = (v, d = 1) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
const toneOf = (v) =>
  v === null || v === undefined ? "muted" : v > 0 ? "up" : v < 0 ? "dn" : "flat";
const shortPair = (p) => (p || "").replace(/USDT$/, "");

/** Pairs here span five orders of magnitude — 116.8 down to 0.0000937 — so a
 *  fixed number of decimals either wastes width or erases the price. Scale the
 *  precision to the number, then drop the zeros that adds. */
const price = (v) => {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  const trim = (str) => str.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (a >= 1) return trim(v.toFixed(4));
  if (a >= 0.01) return trim(v.toFixed(5));
  if (a >= 0.0001) return trim(v.toFixed(7));
  return v.toExponential(3);
};

const ago = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const dayLabel = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/* ---------------------------------------------------------------- styles --
   Restraint is the brief: hairline rules, one accent, tabular figures, and no
   ornament that does not encode something. Interactive states need a real
   stylesheet — inline styles cannot express :hover or focus rings. */
const CSS = `
.xt { --xt-up:#16a34a; --xt-dn:#dc2626; --xt-warm:#ca8a04; --xt-line:var(--border-subtle); }
.xt-mono { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.xt-num { font-variant-numeric: tabular-nums; }
.xt-lbl { font-size:10.5px; letter-spacing:.11em; text-transform:uppercase; color:var(--text-muted); }

.xt-seg { display:inline-flex; background:var(--bg-subtle, rgba(120,113,108,.09));
  border-radius:9px; padding:3px; gap:2px; }
.xt-seg button { padding:5px 12px; border-radius:6px; border:none; background:transparent;
  color:var(--text-muted); font-weight:500; font-size:12.5px; cursor:pointer;
  white-space:nowrap; transition:background .12s, color .12s; }
.xt-seg button:hover { color:var(--text-primary); }
.xt-seg button[data-on="1"] { background:var(--bg-elevated,#fff); color:var(--text-primary);
  font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.08); }

.xt-toggle { padding:6px 13px; border-radius:9px; border:1px solid var(--xt-line);
  background:transparent; color:var(--text-muted); font-weight:500; font-size:12.5px;
  cursor:pointer; white-space:nowrap; transition:background .12s,border-color .12s,color .12s; }
.xt-toggle:hover { color:var(--text-primary); }
.xt-toggle[data-on="1"] { border-color:rgba(22,163,74,.4); background:rgba(22,163,74,.10);
  color:var(--xt-up); font-weight:600; }

.xt-live { display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--text-muted); }
.xt-dot { width:6px; height:6px; border-radius:999px; background:var(--xt-up); flex:none; }
@media (prefers-reduced-motion: no-preference) {
  .xt-dot { animation: xtpulse 2.4s ease-in-out infinite; }
  @keyframes xtpulse { 0%,100% { opacity:1 } 50% { opacity:.25 } }
}

.xt-panel { background:var(--bg-elevated); border:1px solid var(--xt-line); border-radius:12px; }
.xt-phead { display:flex; align-items:baseline; gap:10px; padding:14px 17px 0; }
.xt-phead h3 { margin:0; font-size:15px; font-weight:600; letter-spacing:-.01em; }

.xt-table { border-collapse:separate; border-spacing:0; width:100%; min-width:940px; font-size:13.5px; }
.xt-table th { padding:10px 14px; font-size:10.5px; letter-spacing:.09em; text-transform:uppercase;
  color:var(--text-muted); white-space:nowrap; background:var(--bg-elevated);
  position:sticky; top:0; z-index:2; border-bottom:1px solid var(--xt-line); text-align:left; }
.xt-table th.r { text-align:right; }
.xt-table td { padding:9px 14px; border-bottom:1px solid var(--xt-line); }
.xt-row { transition:background .12s; cursor:pointer; }
.xt-row:hover { background:var(--bg-subtle, rgba(120,113,108,.055)); }
.xt-rail { width:3px; padding:0 !important; }
.xt-paircell { display:flex; align-items:center; gap:10px; min-width:0; }
.xt-ticker { font-weight:600; letter-spacing:-.01em; line-height:1.2; }
.xt-px { font-size:11px; color:var(--text-muted); line-height:1.2; margin-top:2px; }
.xt-ladder { display:grid; grid-template-columns:auto auto auto 1fr; gap:4px 18px;
  align-items:baseline; margin-top:12px; font-size:13px; }
.xt-ladder .k { font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--text-muted); }
.xt-ladder .n { font-variant-numeric:tabular-nums; }

.xt-chip { font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; padding:2px 6px;
  border-radius:4px; white-space:nowrap; }
.xt-chip-warm { background:rgba(202,138,4,.15); color:var(--xt-warm); }

.xt-open { display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:7px;
  border:1px solid var(--xt-line); color:var(--text-primary); text-decoration:none;
  font-size:12px; font-weight:500; white-space:nowrap;
  transition:background .12s,border-color .12s,transform .12s; }
.xt-open:hover { background:var(--text-primary); color:var(--bg-elevated,#fff); border-color:var(--text-primary); }
.xt-open:active { transform:translateY(1px); }

.xt-journey { display:flex; align-items:center; gap:7px; white-space:nowrap; }
.xt-track { position:relative; height:4px; border-radius:2px; width:78px; flex:none;
  background:var(--bg-subtle, rgba(120,113,108,.16)); overflow:hidden; }
.xt-fill { position:absolute; top:0; bottom:0; border-radius:2px; }

.xt-cand { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); }
.xt-card { background:var(--bg-elevated); border:1px solid var(--xt-line);
  border-left:3px solid var(--xt-up); border-radius:12px; padding:15px 16px; min-width:0; }
.xt-draft { margin-top:10px; padding:10px 12px; border-radius:8px;
  background:var(--bg-subtle, rgba(120,113,108,.08)); font-size:13px; line-height:1.45; }
.xt-btn { padding:5px 11px; border-radius:7px; border:1px solid var(--xt-line);
  background:transparent; color:var(--text-primary); font-size:12px; font-weight:500;
  cursor:pointer; white-space:nowrap; transition:background .12s,border-color .12s; }
.xt-btn:hover:not(:disabled) { background:var(--text-primary); color:var(--bg-elevated,#fff); border-color:var(--text-primary); }
.xt-btn:disabled { opacity:.45; cursor:default; }

.xt-grp { cursor:pointer; background:var(--bg-subtle, rgba(120,113,108,.05)); }
.xt-grp:hover { background:var(--bg-subtle, rgba(120,113,108,.10)); }
.xt-grp td { font-weight:600; }
.xt-chev { display:inline-block; width:12px; color:var(--text-muted); font-size:10px; transition:transform .12s; }
.xt-chev[data-open="1"] { transform:rotate(90deg); }
.xt-sub td:first-child { padding-left:34px !important; }

.xt-detail td { background:var(--bg-subtle, rgba(120,113,108,.05)); padding:14px 18px 16px 46px !important; }
.xt-quote { font-size:14.5px; line-height:1.55; max-width:70ch; }
.xt-meta { display:flex; flex-wrap:wrap; gap:7px; margin-top:11px; }
.xt-tag { font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; padding:3px 8px;
  border-radius:5px; border:1px solid var(--xt-line); color:var(--text-muted); white-space:nowrap; }

.xt-qrow { display:grid; grid-template-columns:22px 1fr auto auto; align-items:center; gap:10px;
  padding:7px 17px; font-size:13px; }
.xt-qrow + .xt-qrow { border-top:1px solid var(--xt-line); }
.xt-qpos { font-size:11px; color:var(--text-muted); text-align:right; }

.xt-pager { display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:11px 15px; border-top:1px solid var(--xt-line); font-size:12.5px; color:var(--text-muted); }

a:focus-visible, button:focus-visible, .xt-row:focus-visible { outline:2px solid var(--xt-up); outline-offset:1px; }

@media (max-width: 980px) { .xt-hide-sm { display:none; } }
`;

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="xt-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} data-on={o.value === value ? "1" : "0"}
                aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A number with its meaning under it, and — where the number is a share of
 *  something fixed — the share drawn as well as stated. */
function Tile({ label, value, note, tone, fill }) {
  const color = tone === "up" ? "var(--xt-up)" : tone === "warm" ? "var(--xt-warm)" : "inherit";
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                  borderRadius: 12, padding: "15px 17px", minWidth: 0 }}>
      <div className="xt-lbl xt-mono">{label}</div>
      <div className="xt-num" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.15, marginTop: 5, color }}>
        {value}
      </div>
      {fill !== undefined && fill !== null ? (
        <div style={{ height: 3, borderRadius: 2, marginTop: 9,
                      background: "var(--bg-subtle, rgba(120,113,108,.18))", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%",
                        background: fill >= 1 ? "var(--xt-warm)" : "var(--xt-up)" }} />
        </div>
      ) : null}
      {note ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: fill != null ? 7 : 3 }}>{note}</div> : null}
    </div>
  );
}

/** Where the call stood when X carried it, and where it stands now, on one
 *  shared scale so a long run is visible without reading the numbers. */
function Journey({ atPost, now, domain }) {
  if (atPost == null || now == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const clamp = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  const a = clamp(atPost), b = clamp(now), gained = now >= atPost;
  return (
    <div className="xt-journey">
      <span className="xt-mono xt-num" style={{ fontSize: 12, color: "var(--text-muted)" }}>{pct(atPost)}</span>
      <span className="xt-track" title={`${pct(atPost)} → ${pct(now)}`}>
        <span className="xt-fill" style={{ left: `${Math.min(a, b)}%`,
              width: `${Math.max(1.5, Math.abs(b - a))}%`,
              background: gained ? "var(--xt-up)" : "var(--xt-dn)" }} />
      </span>
      <span className="xt-mono xt-num" style={{ fontSize: 12.5, fontWeight: 600,
            color: gained ? "var(--xt-up)" : "var(--xt-dn)" }}>{pct(now)}</span>
    </div>
  );
}

function OpenPost({ url, pair }) {
  if (!url) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>;
  return (
    <a className="xt-open" href={url} target="_blank" rel="noreferrer"
       aria-label={`Open the ${shortPair(pair)} post on X`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231z" />
      </svg>
      Open
    </a>
  );
}

/* ------------------------------------------------------------- charts -- */

/** Which minute of the hour posts land on.
 *
 *  This chart exists for one reason: before the timer was randomised, 48 of 48
 *  posts landed on :00 or :30 — a fingerprint no human account produces, and
 *  the exact pattern named in X's 2026 automation enforcement. Two reference
 *  marks stay drawn so the old clustering would be obvious if it returned. */
function Cadence({ data }) {
  const max = Math.max(1, ...data);
  const W = 100, H = 30;
  return (
    <div style={{ padding: "12px 17px 15px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
           style={{ width: "100%", height: 78, display: "block", overflow: "visible" }}
           role="img" aria-label="Posts by minute of the hour">
        {[0, 30].map((m) => (
          <line key={m} x1={(m / 60) * W} x2={(m / 60) * W} y1={0} y2={H}
                stroke="var(--border-subtle)" strokeWidth=".35" strokeDasharray="1.5 1.5" />
        ))}
        {data.map((v, m) =>
          v ? (
            <rect key={m} x={(m / 60) * W + .18} width={W / 60 - .36}
                  y={H - (v / max) * H} height={(v / max) * H}
                  fill="var(--xt-up)" opacity=".82" rx=".2" />
          ) : null
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {[":00", ":15", ":30", ":45", ":59"].map((t) => (
          <span key={t} className="xt-lbl xt-mono">{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Posts per day against the ceiling. The dashed line is the cap, so a day that
 *  falls short reads as supply running out rather than as a number to fix. */
function Daily({ data, cap }) {
  if (!data.length) return null;
  const max = Math.max(cap, ...data.map((d) => d.posts));
  return (
    <div style={{ padding: "14px 17px 15px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 78 }}>
        {data.map((d) => (
          <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column",
                                    justifyContent: "flex-end", height: "100%", position: "relative" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: `${(cap / max) * 100}%`,
                          borderTop: "1px dashed var(--border-subtle)" }} />
            <div className="xt-mono xt-num" style={{ fontSize: 11, color: "var(--text-muted)",
                                                     textAlign: "center", marginBottom: 4 }}>{d.posts}</div>
            <div style={{ height: `${(d.posts / max) * 100}%`, borderRadius: "3px 3px 0 0",
                          background: d.posts >= cap ? "var(--xt-warm)" : "var(--xt-up)", opacity: .85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
        {data.map((d) => (
          <span key={d.day} className="xt-lbl xt-mono" style={{ flex: 1, textAlign: "center" }}>
            {dayLabel(d.day)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- queue --- */

function Queue({ queue, total, capturedAt }) {
  const RUNG = { 1: "fresh TP4", 2: "fresh TP3", 3: "TP4 upgrade", 4: "TP2" };
  return (
    <div className="xt-panel" style={{ overflow: "hidden" }}>
      <div className="xt-phead">
        <h3>Waiting to go out</h3>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {total} queued{capturedAt ? ` · ranked ${ago(capturedAt)} ago` : ""}
        </span>
      </div>
      <div style={{ marginTop: 10, maxHeight: 268, overflowY: "auto" }}>
        {queue.length === 0 ? (
          <div style={{ padding: "22px 17px", color: "var(--text-muted)", fontSize: 13.5 }}>
            Nothing due. The market has not produced a candidate since the last tick.
          </div>
        ) : (
          queue.map((q) => (
            <div className="xt-qrow" key={q.pair + q.position}>
              <span className="xt-qpos xt-mono">{q.position + 1}</span>
              <span className="xt-paircell">
                <CoinLogo pair={q.pair} size={20} />
                <span style={{ fontWeight: 600 }}>{shortPair(q.pair)}</span>
                <span className="xt-lbl xt-mono xt-hide-sm">{RUNG[q.rung] || `rung ${q.rung}`}</span>
              </span>
              <span className="xt-mono xt-lbl">TP{q.highest}</span>
              <span className="xt-mono xt-num" style={{ fontWeight: 600, color: "var(--xt-up)" }}>
                {pct(q.pct)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- suggestions -- */

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
    <div className="xt-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CoinLogo pair={c.pair} size={28} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{shortPair(c.pair)}</span>
        <span className="xt-chip xt-chip-warm xt-mono">{c.headline}</span>
        <span className="xt-mono xt-num" style={{ marginLeft: "auto", fontSize: 18, fontWeight: 600, color: "var(--xt-up)" }}>
          {pct(c.metric)}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>{c.metric_label}</div>
      <div className="xt-draft">{c.draft}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 11, alignItems: "center", flexWrap: "wrap" }}>
        <button className="xt-btn" onClick={copy}>{copied ? "Copied" : "Copy text"}</button>
        {c.quote_url ? (
          <a className="xt-btn" href={c.quote_url} target="_blank" rel="noreferrer">Open post to quote</a>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>no post yet — write it fresh</span>
        )}
        <button className="xt-btn" onClick={done} disabled={busy} style={{ marginLeft: "auto" }}>
          {busy ? "…" : "Done"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- rows ---- */

function MemberRow({ r, domain, sub, open, onToggle }) {
  const v = r.since_post;
  const hot = (v || 0) >= HOT_AT;
  const warm = (v || 0) >= MOVER_AT && !hot;
  const rail = hot ? "var(--xt-up)" : warm ? "var(--xt-warm)" : "transparent";
  const t = toneOf(v);
  return (
    <Fragment>
      <tr className={`xt-row${sub ? " xt-sub" : ""}`} onClick={onToggle} tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
          style={{ background: hot ? "rgba(22,163,74,.06)" : undefined }}>
        <td className="xt-rail" style={{ background: rail }} />
        <td>
          <span className="xt-paircell">
            <CoinLogo pair={r.pair} size={26} />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span className="xt-ticker">{shortPair(r.pair)}</span>
              <span className="xt-px xt-mono">{price(r.price_now)}</span>
            </span>
            {r.went_further ? (
              <span className="xt-chip xt-chip-warm xt-mono"
                    title="The ladder climbed higher than the target this post was about">ran past</span>
            ) : null}
          </span>
        </td>
        <td className="xt-mono xt-hide-sm" style={{ color: "var(--text-muted)", fontSize: 12 }}>{ago(r.posted_at)}</td>
        <td className="xt-mono" style={{ fontSize: 12 }}>{r.posted_at_label}</td>
        <td className="xt-mono xt-hide-sm" style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.reached_label || "—"}</td>
        <td><Journey atPost={r.pct_at_post} now={r.pct_now} domain={domain} /></td>
        <td className="xt-mono xt-num xt-hide-sm" style={{ textAlign: "right", color: "var(--text-muted)", fontSize: 12.5 }}>
          {pct(r.peak_pct)}
        </td>
        <td className="xt-mono xt-num" style={{ textAlign: "right", fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap",
              color: t === "up" ? "var(--xt-up)" : t === "dn" ? "var(--xt-dn)" : "var(--text-muted)" }}>
          {pct(v)}
        </td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
          <OpenPost url={r.tweet_url} pair={r.pair} />
        </td>
      </tr>
      {open ? (
        <tr className="xt-detail">
          <td />
          <td colSpan={8}>
            <div className="xt-quote">{r.caption ? `“${r.caption}”` : "No caption recorded for this post."}</div>
            {r.caption && !r.caption_is_x ? (
              <div style={{ fontSize: 12, color: "var(--xt-warm)", marginTop: 9 }}>
                This is the Telegram caption — X's own wording was not recorded for this post.
              </div>
            ) : null}
            <div className="xt-ladder xt-mono">
              <span className="k">Entry</span>
              <span className="n">{price(r.entry)}</span>
              <span className="n" style={{ color: "var(--text-muted)" }}>—</span>
              <span />

              <span className="k">Posted at</span>
              <span className="n">{price(r.target)}</span>
              <span className="n" style={{ color: "var(--xt-up)" }}>{pct(r.pct_at_post)}</span>
              <span className="k">{r.posted_at_label} · {ago(r.posted_at)} ago</span>

              <span className="k">Now</span>
              <span className="n" style={{ fontWeight: 600 }}>{price(r.price_now)}</span>
              <span className="n" style={{ color: toneOf(r.pct_now) === "dn" ? "var(--xt-dn)" : "var(--xt-up)" }}>
                {pct(r.pct_now)}
              </span>
              <span className="k" style={{ color: toneOf(r.since_post) === "dn" ? "var(--xt-dn)" : "var(--xt-up)" }}>
                {pct(r.since_post)} since the post
              </span>

              <span className="k">Peak</span>
              <span className="n">{price(r.peak_price)}</span>
              <span className="n" style={{ color: "var(--text-muted)" }}>{pct(r.peak_pct)}</span>
              <span className="k">{r.peak_at ? `${ago(r.peak_at)} ago · high-water mark, not realised` : "high-water mark, not realised"}</span>
            </div>

            <div className="xt-meta">
              {r.caption ? <span className="xt-tag xt-mono">{r.caption.length} chars</span> : null}
              {r.style ? <span className="xt-tag xt-mono">{r.style}</span> : null}
              {r.hook ? <span className="xt-tag xt-mono">hook · {r.hook}</span> : null}
              {r.pattern ? <span className="xt-tag xt-mono">{r.pattern}</span> : null}
              {r.voice ? <span className="xt-tag xt-mono">{r.voice}</span> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/* ------------------------------------------------------------- main ---- */

export function XTrackerTab() {
  const [data, setData] = useState(null);
  const [cands, setCands] = useState(null);
  const [days, setDays] = useState(7);
  const [groupBy, setGroupBy] = useState("none");
  const [onlyMovers, setOnlyMovers] = useState(false);
  const [page, setPage] = useState(0);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [openRows, setOpenRows] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);
  const timer = useRef(null), candTimer = useRef(null), clock = useRef(null);

  const load = useCallback(async (d) => {
    try {
      setErr(null);
      setData(await workspaceApi.getXTracker(d));
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || "Could not load");
    } finally { setLoading(false); }
  }, []);

  const loadCands = useCallback(async () => {
    try { setCands(await workspaceApi.getXCandidates(7, 3)); } catch { setCands(null); }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(days);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => load(days), REFRESH_MS);
    return () => timer.current && clearInterval(timer.current);
  }, [days, load]);

  useEffect(() => {
    loadCands();
    candTimer.current = setInterval(loadCands, CAND_MS);
    return () => candTimer.current && clearInterval(candTimer.current);
  }, [loadCands]);

  // Drives the "updated Ns ago" readout between fetches, so the page reads as
  // live rather than merely being live.
  useEffect(() => {
    clock.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clock.current && clearInterval(clock.current);
  }, []);

  const toggleRow = useCallback((k) => {
    setOpenRows((v) => { const n = new Set(v); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }, []);

  const scoped = useMemo(() => data?.rows || [], [data]);
  const rows = useMemo(
    () => (onlyMovers ? scoped.filter((r) => (r.since_post || 0) >= MOVER_AT) : scoped),
    [scoped, onlyMovers]
  );

  const domain = useMemo(() => {
    const vals = [];
    rows.forEach((r) => {
      if (r.pct_at_post != null) vals.push(r.pct_at_post);
      if (r.pct_now != null) vals.push(r.pct_now);
    });
    if (!vals.length) return [0, 1];
    return [Math.min(0, ...vals), Math.max(1, ...vals)];
  }, [rows]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const keyOf = (r) =>
      groupBy === "coin" ? r.pair
      : groupBy === "rung" ? r.posted_at_label || "—"
      : groupBy === "day" ? (r.posted_at || "").slice(0, 10)
      : r.style || "(unstyled)";
    const m = new Map();
    rows.forEach((r) => { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    const out = [...m.entries()].map(([key, items]) => {
      const v = items.map((i) => i.since_post).filter((x) => x != null).sort((a, b) => a - b);
      return { key, label: groupBy === "coin" ? shortPair(key) : key, items, n: items.length,
               best: v.length ? v[v.length - 1] : null,
               median: v.length ? v[Math.floor(v.length / 2)] : null,
               voices: new Set(items.map((i) => i.voice).filter(Boolean)).size };
    });
    return groupBy === "day"
      ? out.sort((a, b) => (a.key < b.key ? 1 : -1))
      : out.sort((a, b) => (b.best ?? -1e9) - (a.best ?? -1e9));
  }, [rows, groupBy]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const paged = useMemo(
    () => (groups ? [] : rows.slice(page * PAGE, page * PAGE + PAGE)),
    [rows, page, groups]
  );
  useEffect(() => { setPage(0); }, [days, onlyMovers, groupBy]);

  const stats = useMemo(() => ({
    count: scoped.length,
    movers: scoped.filter((r) => (r.since_post || 0) >= MOVER_AT).length,
    top: scoped[0],
  }), [scoped]);

  if (loading && !data) return <div style={{ padding: 28, color: "var(--text-muted)" }}>Loading…</div>;

  const cap = data?.daily_cap || 48;
  const used = data?.posted_today ?? 0;

  return (
    <div className="xt" style={{ padding: "4px 0 44px" }}>
      <style>{CSS}</style>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.01em" }}>
            What happened after we posted
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 14, maxWidth: "62ch" }}>
            Every call X published, against its price right now — sorted by how far it travelled{" "}
            <strong>after</strong> the post went out.
          </p>
          <div className="xt-live" style={{ marginTop: 9 }} data-tick={tick}>
            <span className="xt-dot" />
            live · updated {data?.generated_at ? ago(data.generated_at) : "—"} ago
            {data?.prices_ok === false ? " · Binance did not answer" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Segmented label="Window" value={days} onChange={setDays}
            options={[{ value: 1, label: "1d" }, { value: 7, label: "7d" }, { value: 30, label: "30d" }]} />
          <Segmented label="Group" value={groupBy}
            onChange={(v) => { setGroupBy(v); setOpenGroups(new Set()); }}
            options={[{ value: "none", label: "Flat" }, { value: "coin", label: "Coin" },
                      { value: "rung", label: "Target" }, { value: "day", label: "Day" },
                      { value: "style", label: "Voice" }]} />
          <button className="xt-toggle" data-on={onlyMovers ? "1" : "0"}
                  aria-pressed={onlyMovers} onClick={() => setOnlyMovers((v) => !v)}>
            Movers only
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 9,
                      background: "rgba(220,38,38,.08)", color: "#dc2626", fontSize: 14 }}>{err}</div>
      ) : null}

      {cands?.candidates?.length ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Worth posting by hand</h3>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {cands.total} above the bar · showing {cands.candidates.length}
            </span>
          </div>
          <div className="xt-cand">
            {cands.candidates.map((c) => (
              <Candidate key={`${c.signal_id}-${c.kind}`} c={c}
                onDone={(d) => setCands((v) => ({ ...v, total: Math.max(0, (v?.total || 1) - 1),
                  candidates: (v?.candidates || []).filter((x) => !(x.signal_id === d.signal_id && x.kind === d.kind)) }))} />
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 20 }}>
        <Tile label="Today's budget" value={`${used}/${cap}`} fill={used / cap}
              note="automated posts used" tone={used >= cap ? "warm" : undefined} />
        <Tile label="In the queue" value={data?.queue_total ?? "—"} note="waiting for a slot" />
        <Tile label="Distinct voices" value={data ? `${data.distinct_voices}/${stats.count}` : "—"}
              note={data && data.distinct_voices === stats.count ? "no repeats" : "repeats present"}
              tone={data && data.distinct_voices < stats.count ? "warm" : undefined} />
        <Tile label="Biggest runner" value={stats.top ? pct(stats.top.since_post) : "—"}
              note={stats.top ? `${shortPair(stats.top.pair)} since its post` : ""}
              tone={stats.top && (stats.top.since_post || 0) > 0 ? "up" : undefined} />
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        <Queue queue={data?.queue || []} total={data?.queue_total || 0} capturedAt={data?.queue_captured_at} />
        <div style={{ display: "grid", gap: 12 }}>
          <div className="xt-panel">
            <div className="xt-phead">
              <h3>Posting cadence</h3>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>minute of the hour</span>
            </div>
            <Cadence data={data?.cadence || []} />
          </div>
          <div className="xt-panel">
            <div className="xt-phead">
              <h3>Per day</h3>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>dashed line is the {cap} cap</span>
            </div>
            <Daily data={data?.daily || []} cap={cap} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, border: "1px solid var(--border-subtle)", borderRadius: 12,
                    overflow: "hidden", background: "var(--bg-elevated)" }}>
        <div style={{ overflowX: "auto", maxHeight: "64vh" }}>
          <table className="xt-table">
            <thead>
              <tr>
                <th className="xt-rail" aria-hidden="true" />
                <th>Pair</th>
                <th className="xt-hide-sm">Posted</th>
                <th>At</th>
                <th className="xt-hide-sm">Reached</th>
                <th>At post → now</th>
                <th className="r xt-hide-sm">Peak</th>
                <th className="r">Since post</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {groups
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="xt-grp" onClick={() =>
                        setOpenGroups((v) => { const n = new Set(v); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                        <td className="xt-rail" />
                        <td>
                          <span className="xt-paircell">
                            <span className="xt-chev" data-open={openGroups.has(g.key) ? "1" : "0"}>▶</span>
                            {groupBy === "coin" ? <CoinLogo pair={g.key} size={22} /> : null}
                            <span className="xt-ticker">{g.label}</span>
                          </span>
                        </td>
                        <td className="xt-mono xt-hide-sm" style={{ color: "var(--text-muted)", fontSize: 12 }}>
                          {g.n} post{g.n === 1 ? "" : "s"}
                        </td>
                        <td className="xt-mono xt-hide-sm" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {groupBy === "style" ? `${g.voices} voice${g.voices === 1 ? "" : "s"}` : ""}
                        </td>
                        <td className="xt-hide-sm" />
                        <td style={{ color: "var(--text-muted)", fontSize: 12 }}>median {pct(g.median)}</td>
                        <td className="xt-hide-sm" />
                        <td className="xt-mono xt-num" style={{ textAlign: "right", fontSize: 14,
                              color: (g.best || 0) > 0 ? "var(--xt-up)" : "var(--text-muted)" }}>
                          {pct(g.best)}
                        </td>
                        <td />
                      </tr>
                      {openGroups.has(g.key)
                        ? g.items.map((r) => (
                            <MemberRow key={`${r.tweet_id}-${r.posted_at_label}`} r={r} domain={domain} sub
                              open={openRows.has(r.tweet_id + r.posted_at_label)}
                              onToggle={() => toggleRow(r.tweet_id + r.posted_at_label)} />
                          ))
                        : null}
                    </Fragment>
                  ))
                : paged.map((r) => (
                    <MemberRow key={`${r.tweet_id}-${r.posted_at_label}`} r={r} domain={domain}
                      open={openRows.has(r.tweet_id + r.posted_at_label)}
                      onToggle={() => toggleRow(r.tweet_id + r.posted_at_label)} />
                  ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 30, textAlign: "center", color: "var(--text-muted)" }}>
                    {onlyMovers
                      ? `Nothing has run ${MOVER_AT}%+ since its post in this window.`
                      : "Nothing published in this window yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!groups && rows.length > PAGE ? (
          <div className="xt-pager">
            <span className="xt-mono">
              {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="xt-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                Previous
              </button>
              <span className="xt-mono">{page + 1} / {pageCount}</span>
              <button className="xt-btn" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={page >= pageCount - 1}>
                Next
              </button>
            </span>
          </div>
        ) : null}
      </div>

      <p style={{ marginTop: 14, fontSize: 13, color: "var(--text-muted)", maxWidth: "80ch" }}>
        <strong>At post → now</strong> is where the call stood when X carried it against Binance
        USDⓈ-M right now. <strong>Peak</strong> is the highest the peak worker ever recorded — a
        high-water mark, not a realised return, so never quote it as a result.{" "}
        <strong>Since post</strong> is the gap between the first two, and the only column that
        answers whether a call is worth mentioning again. Click any row for the caption X actually
        published and the voice it was written in.
      </p>
    </div>
  );
}

export default XTrackerTab;
