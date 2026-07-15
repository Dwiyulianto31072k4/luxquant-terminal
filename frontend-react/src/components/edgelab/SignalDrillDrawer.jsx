// src/components/edgelab/SignalDrillDrawer.jsx
// ════════════════════════════════════════════════════════════════
// Level-2 drill — MASTER-DETAIL MODAL (v5).
// Same export/props as before — EdgeLabPage needs no change.
//
//   ① header     → bucket label · WR · outcome distribution · BTC that day
//   ② left pane  → filter/sort + compact list (peak under-bar, α vs BTC)
//   ③ right pane → identity · TRADE vs MARKET (signal peak set against the
//                  BTC move over the SAME holding window, + alpha) · TRADE
//                  JOURNEY (MFE/MAE excursion + realized vs missed, from
//                  signal_journey) · peak field strip · timeline facts · CTA
//
// New in v5: drill payload signals may carry mfe_pct / mae_pct /
// realized_pct / missed_pct (backend LEFT JOINs signal_journey). All four
// are optional — the journey block renders only when MFE/MAE are present,
// so dimensions/rows without journey data are unaffected.
//
// bucket.btc       (optional): { chg, open, close } — intraday BTC for the
//                  bucket day. Header stat + timeline row.
// bucket.btcSeries (optional): { 'YYYY-MM-DD': {o, c} } — daily BTC open/
//                  close map passed by the WR×BTC tab. Enables per-signal
//                  BTC change across each signal's own created→resolved
//                  window, the alpha column, and the trade-vs-market block.
//                  Tabs that don't pass it render exactly as before.
//
// Desktop: two panes. Mobile: list → tap → detail (back button).
// Keyboard: ↑/↓ selection · Enter opens full breakdown · Esc closes.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "../CoinLogo";
import edgeLabApi from "../../services/edgeLabApi";

const OUTCOME_STYLE = {
  tp4: { label: "TP4", c: "#10b981", bg: "rgba(16,185,129,0.16)" },
  tp3: { label: "TP3", c: "#34d399", bg: "rgba(16,185,129,0.13)" },
  tp2: { label: "TP2", c: "#6ee7b7", bg: "rgba(16,185,129,0.10)" },
  tp1: { label: "TP1", c: "#a7f3d0", bg: "rgba(16,185,129,0.08)" },
  sl:  { label: "SL",  c: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};
const DIST_ORDER = ["tp4", "tp3", "tp2", "tp1", "sl"];

const OutcomeBadge = ({ outcome, size = 9 }) => {
  const s = OUTCOME_STYLE[outcome] || { label: outcome || "—", c: "#888", bg: "rgba(255,255,255,0.06)" };
  return (
    <span
      className="inline-flex items-center rounded-sm font-mono uppercase tracking-wider"
      style={{ color: s.c, background: s.bg, border: `1px solid ${s.c}40`, padding: "1px 7px", fontSize: size }}
    >
      {s.label}
    </span>
  );
};

const fmtPair = (pair) => (pair || "").replace(/USDT$/i, "");

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 16);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const fmtUsd = (v) =>
  v == null ? "—" : v >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`;

// Peak gains can be enormous (memecoins +5000%). Compact display.
const fmtPeak = (p) => {
  if (p == null) return null;
  const sign = p >= 0 ? "+" : "−";
  const a = Math.abs(p);
  let body;
  if (a >= 1000) body = `${(a / 1000).toFixed(1)}k`;
  else if (a >= 100) body = Math.round(a).toLocaleString();
  else body = a.toFixed(1);
  return `${sign}${body}%`;
};

const fmtSignedPct = (v, dp = 2) => {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`;
};

const fmtHold = (createdAt, hitDate) => {
  if (!createdAt || !hitDate) return null;
  const a = new Date(createdAt), b = new Date(hitDate);
  if (isNaN(a) || isNaN(b)) return null;
  const ms = b - a;
  if (ms < 0) return null;
  const h = ms / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
};

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// UTC day key — matches the backend's created_ts::date grouping
const isoDay = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
};

// log compression keeps memecoin outliers from flattening everything
const signedLog = (p) => Math.sign(p || 0) * Math.log10(Math.abs(p || 0) + 1);
const logBarPct = (peak, maxPeak) => {
  const a = Math.abs(peak ?? 0);
  return maxPeak > 0
    ? Math.min(100, Math.max(3, (Math.log10(a + 1) / Math.log10(maxPeak + 1)) * 100))
    : 3;
};

// ─── per-signal BTC over the signal's own holding window ─────────
// open of the created day → close of the resolved day.
const btcOverHold = (s, btcSeries) => {
  if (!btcSeries) return null;
  const d0 = isoDay(s.created_at);
  const d1 = isoDay(s.hit_date);
  if (!d0 || !d1) return null;
  const a = btcSeries[d0];
  const b = btcSeries[d1];
  if (!a || !b || a.o == null || b.c == null || a.o <= 0) return null;
  return {
    chg: +(((b.c - a.o) / a.o) * 100).toFixed(2),
    from: a.o,
    to: b.c,
    sameDay: d0 === d1,
  };
};

// ─── BTC day chip (header) ───────────────────────────────────────
const BtcDayStat = ({ btc }) => {
  if (!btc || btc.chg == null) return null;
  const up = btc.chg >= 0;
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">BTC that day</div>
      <div className="font-mono tabular-nums text-base leading-tight">
        <span className={up ? "text-emerald-400/90" : "text-red-400/90"}>
          {up ? "+" : ""}{btc.chg}%
        </span>
        <span className="text-white/30 text-[11px] ml-2">
          {fmtUsd(btc.open)} → {fmtUsd(btc.close)}
        </span>
      </div>
    </div>
  );
};

// ─── trade vs market (signature) ─────────────────────────────────
// Signal peak and the BTC move over the SAME holding window, drawn as two
// bars from a shared zero baseline on a signed-log scale, with alpha
// (peak − BTC) called out. Answers: did this trade beat just holding BTC?
const TradeVsMarket = ({ s, btcHold }) => {
  if (!btcHold || s.peak_pct == null) return null;
  const peak = s.peak_pct;
  const btc = btcHold.chg;
  const alpha = +(peak - btc).toFixed(1);

  const lp = signedLog(peak);
  const lb = signedLog(btc);
  const maxMag = Math.max(Math.abs(lp), Math.abs(lb)) || 1;
  // each side of the zero line gets 50% of the track
  const w = (v) => Math.max(1.5, (Math.abs(v) / maxMag) * 48);

  const Row = ({ label, value, log, color }) => (
    <div className="flex items-center gap-2.5">
      <span className="w-[72px] shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <div className="relative flex-1 h-[14px]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.14]" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[6px] rounded-full"
          style={
            log >= 0
              ? { left: "50%", width: `${w(log)}%`, background: color }
              : { right: "50%", width: `${w(log)}%`, background: color }
          }
        />
      </div>
      <span
        className="w-[64px] shrink-0 text-right font-mono tabular-nums text-[12px]"
        style={{ color }}
      >
        {fmtPeak(value)}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3.5 py-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
          Trade vs market · same window
        </span>
        <span className="text-[9px] font-mono text-white/25">log scale</span>
      </div>
      <div className="space-y-2">
        <Row
          label="This trade"
          value={peak}
          log={lp}
          color={peak >= 0 ? "#34d399" : "#f87171"}
        />
        <Row
          label="BTC held"
          value={btc}
          log={lb}
          color="rgba(255,255,255,0.45)"
        />
      </div>
      <div className="mt-3 pt-2.5 border-t border-white/[0.05] flex items-baseline justify-between">
        <span
          className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/35"
          title="Signal peak minus the BTC move over the same created→resolved window"
        >
          α vs holding BTC
        </span>
        <span
          className="font-mono tabular-nums text-[15px]"
          style={{ color: alpha >= 0 ? "#34d399" : "#f87171" }}
        >
          {alpha >= 0 ? "+" : "−"}{Math.abs(alpha).toFixed(1)}pp
        </span>
      </div>
    </div>
  );
};

// ─── trade journey (signal_journey: MFE / MAE / realized / missed) ───
// MFE = how high the trade ran (max favorable excursion).
// MAE = how deep it sank first (max adverse excursion, ≤0).
// realized vs missed = what the call actually banked vs what it left on
// the table at the peak. Renders only when MFE & MAE are present.
const TradeJourney = ({ s }) => {
  const mfe = s.mfe_pct;
  const mae = s.mae_pct;
  if (mfe == null && mae == null) return null;

  // excursion bars share one magnitude scale so up/down read comparably
  const top = Math.max(Math.abs(mfe ?? 0), Math.abs(mae ?? 0)) || 1;
  const up = mfe != null ? Math.max(2, (Math.abs(mfe) / top) * 100) : 0;
  const dn = mae != null ? Math.max(2, (Math.abs(mae) / top) * 100) : 0;

  const realized = s.realized_pct;
  const missed = s.missed_pct;
  const captureBase = realized != null && missed != null ? realized + missed : null;
  const capture =
    captureBase && captureBase > 0 ? Math.round((realized / captureBase) * 100) : null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3.5 py-3">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
          Trade journey · path to outcome
        </span>
      </div>

      {/* MFE / MAE excursion — two bars from a shared center baseline */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="w-[68px] shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-white/35">
            Ran up
          </span>
          <div className="relative flex-1 h-[12px]">
            <div className="absolute inset-y-0 left-0 w-px bg-white/[0.14]" />
            <div
              className="absolute top-1/2 -translate-y-1/2 left-0 h-[6px] rounded-full"
              style={{ width: `${up}%`, background: "rgba(52,211,153,0.65)" }}
            />
          </div>
          <span className="w-[58px] shrink-0 text-right font-mono tabular-nums text-[12px] text-emerald-400">
            {mfe != null ? fmtPeak(mfe) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-[68px] shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-white/35">
            Drew down
          </span>
          <div className="relative flex-1 h-[12px]">
            <div className="absolute inset-y-0 left-0 w-px bg-white/[0.14]" />
            <div
              className="absolute top-1/2 -translate-y-1/2 left-0 h-[6px] rounded-full"
              style={{ width: `${dn}%`, background: "rgba(248,113,113,0.6)" }}
            />
          </div>
          <span className="w-[58px] shrink-0 text-right font-mono tabular-nums text-[12px] text-red-400">
            {mae != null ? fmtPeak(mae) : "—"}
          </span>
        </div>
      </div>

      {/* realized vs missed potential */}
      {realized != null && missed != null && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/35">
              Banked vs left on table
            </span>
            {capture != null && (
              <span className="text-[10px] font-mono tabular-nums text-white/55">
                {capture}% of peak captured
              </span>
            )}
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]">
            {captureBase > 0 && (
              <>
                <div
                  style={{ width: `${(realized / captureBase) * 100}%`, background: "rgba(52,211,153,0.6)" }}
                  title={`realized ${fmtPeak(realized)}`}
                />
                <div
                  style={{ width: `${(missed / captureBase) * 100}%`, background: "rgba(255,255,255,0.12)" }}
                  title={`missed ${fmtPeak(missed)}`}
                />
              </>
            )}
          </div>
          <div className="flex justify-between mt-1 text-[9px] font-mono tabular-nums">
            <span className="text-emerald-400/80">realized {fmtPeak(realized)}</span>
            <span className="text-white/35">missed {fmtPeak(missed)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── peak field strip ────────────────────────────────────────────
// Every signal of the bucket as a dot on a signed-log axis; the selected
// one is ringed in gold, median ticked. "Where this trade sits in the field."
const PeakField = ({ signals, selectedId }) => {
  const pts = signals.filter((s) => s.peak_pct != null);
  if (pts.length < 3) return null;
  const vals = pts.map((s) => signedLog(s.peak_pct));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (p) => 3 + ((signedLog(p) - min) / span) * 94; // 3%..97%
  const zeroX = min < 0 && max > 0 ? 3 + ((0 - min) / span) * 94 : null;
  const minPeak = Math.min(...pts.map((s) => s.peak_pct));
  const maxPeak = Math.max(...pts.map((s) => s.peak_pct));
  const med = median(pts.map((s) => s.peak_pct));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
          Peak field · all {pts.length} signals
        </span>
        <span className="text-[9px] font-mono text-white/25">log scale</span>
      </div>
      <div className="relative h-11 rounded-md border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        {/* baseline */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/[0.07]" />
        {/* zero tick */}
        {zeroX != null && (
          <div
            className="absolute top-1.5 bottom-1.5 w-px bg-white/[0.12]"
            style={{ left: `${zeroX}%` }}
            title="0%"
          />
        )}
        {/* median tick */}
        {med != null && (
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${x(med)}%`, background: "rgba(212,168,83,0.3)" }}
            title={`median ${fmtPeak(med)}`}
          />
        )}
        {pts.map((s, i) => {
          const sel = s.signal_id === selectedId;
          const win = s.outcome && s.outcome !== "sl";
          const left = `${x(s.peak_pct)}%`;
          const top = `${50 + (sel ? 0 : ((i % 5) - 2) * 11)}%`;
          if (sel) {
            return (
              <div key={s.signal_id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left, top: "50%" }}>
                <div className="w-[11px] h-[11px] rounded-full border-[2px] border-gold-primary bg-[#0a0805]" />
                <div className="absolute left-1/2 -translate-x-1/2 -top-[18px] text-[9px] font-mono tabular-nums text-gold-primary whitespace-nowrap">
                  {fmtPeak(s.peak_pct)}
                </div>
              </div>
            );
          }
          return (
            <div
              key={s.signal_id}
              className="absolute w-[5px] h-[5px] rounded-full -translate-x-1/2 -translate-y-1/2"
              style={{ left, top, background: win ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)" }}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] font-mono tabular-nums text-white/25">
        <span>{fmtPeak(minPeak)}</span>
        <span className="text-gold-primary/45">med {fmtPeak(med)}</span>
        <span>{fmtPeak(maxPeak)}</span>
      </div>
    </div>
  );
};

// ─── ② list row (left pane) ──────────────────────────────────────
const SignalRow = ({ s, maxPeak, btcHold, selected, onSelect }) => {
  const isWin = s.outcome && s.outcome !== "sl";
  const peak = fmtPeak(s.peak_pct);
  const barPct = logBarPct(s.peak_pct, maxPeak);
  const alpha =
    btcHold && s.peak_pct != null ? +(s.peak_pct - btcHold.chg).toFixed(1) : null;
  return (
    <button
      onClick={() => onSelect(s.signal_id)}
      className={`w-full text-left px-3 pt-2.5 pb-2 border-l-2 transition ${
        selected
          ? "border-gold-primary bg-white/[0.045]"
          : "border-transparent hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <CoinLogo pair={s.pair} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[13px] truncate leading-tight ${selected ? "text-white" : "text-white/85"}`}>
              {fmtPair(s.pair)}
            </span>
            <OutcomeBadge outcome={s.outcome} size={8} />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono leading-tight mt-0.5">
            <span className="text-white/30">{fmtDate(s.hit_date)}</span>
            {alpha != null && (
              <span
                className={alpha >= 0 ? "text-emerald-400/55" : "text-red-400/55"}
                title="Peak minus BTC move over this signal's own window"
              >
                vBTC {alpha >= 0 ? "+" : "−"}{Math.abs(alpha).toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <span className={`font-mono tabular-nums text-[12px] shrink-0 ${isWin ? "text-emerald-400" : "text-red-400"}`}>
          {peak || "—"}
        </span>
      </div>
      <div className="mt-1.5 ml-[34px] h-[2px] rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${barPct}%`, background: isWin ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)" }}
        />
      </div>
    </button>
  );
};

// ─── ③ detail pane (right) ───────────────────────────────────────
const DetailPane = ({ s, rank, total, allSignals, btc, btcSeries, opening, onOpenSignal, onBack }) => {
  if (!s) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/25 text-xs font-mono uppercase tracking-wider">
        Select a signal
      </div>
    );
  }
  const peak = fmtPeak(s.peak_pct);
  const hold = fmtHold(s.created_at, s.hit_date);
  const btcHold = btcOverHold(s, btcSeries);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden self-start mx-4 mt-3 px-2.5 py-1 rounded-md border border-white/[0.08] text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white"
        >
          ← List
        </button>
      )}

      <div className="px-5 py-5 flex flex-col gap-5">
        {/* identity */}
        <div className="flex items-center gap-3.5">
          <CoinLogo pair={s.pair} size={46} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl text-white/95 leading-tight truncate">{fmtPair(s.pair)}</div>
            <div className="text-[10px] font-mono text-white/35 mt-1">
              {rank != null && total != null ? `#${rank} of ${total} by peak` : ""}
            </div>
          </div>
          <OutcomeBadge outcome={s.outcome} size={10} />
        </div>

        {/* hero: peak + held */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-1">Peak</div>
            <div
              className="font-mono tabular-nums text-4xl leading-none"
              style={{ color: (s.peak_pct ?? 0) >= 0 ? "#34d399" : "#f87171" }}
            >
              {peak || "—"}
            </div>
          </div>
          {hold && (
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-1">Held</div>
              <div className="font-mono tabular-nums text-xl text-white/80 leading-none">{hold}</div>
            </div>
          )}
        </div>

        {/* signature: did this trade beat just holding BTC? */}
        <TradeVsMarket s={s} btcHold={btcHold} />

        {/* trade journey: how it got to the outcome (MFE/MAE, realized vs missed) */}
        <TradeJourney s={s} />

        {/* where this signal sits in the day's field */}
        <PeakField signals={allSignals} selectedId={s.signal_id} />

        {/* timeline facts */}
        <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Created</span>
            <span className="font-mono tabular-nums text-[12px] text-white/75">{fmtDateTime(s.created_at)}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Resolved</span>
            <span className="font-mono tabular-nums text-[12px] text-white/75">{fmtDate(s.hit_date)}</span>
          </div>
          {btcHold && (
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
                BTC over hold{btcHold.sameDay ? " · same day" : ""}
              </span>
              <span className="font-mono tabular-nums text-[12px] text-white/75">
                <span className={btcHold.chg >= 0 ? "text-emerald-400/90" : "text-red-400/90"}>
                  {fmtSignedPct(btcHold.chg)}
                </span>
                <span className="text-white/30 text-[10px] ml-2">
                  {fmtUsd(btcHold.from)} → {fmtUsd(btcHold.to)}
                </span>
              </span>
            </div>
          )}
          {btc && btc.chg != null && (
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">BTC that day</span>
              <span className={`font-mono tabular-nums text-[12px] ${btc.chg >= 0 ? "text-emerald-400/90" : "text-red-400/90"}`}>
                {btc.chg >= 0 ? "+" : ""}{btc.chg}%
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Outcome</span>
            <OutcomeBadge outcome={s.outcome} size={9} />
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => !opening && onOpenSignal?.(s.signal_id, s)}
          disabled={opening}
          className={`w-full py-2.5 rounded-lg border text-[11px] font-mono uppercase tracking-[0.18em] transition flex items-center justify-center gap-2 ${
            opening
              ? "border-white/[0.08] text-white/30 cursor-wait"
              : "border-gold-primary/35 bg-gold-primary/[0.07] text-gold-primary hover:bg-gold-primary/[0.14]"
          }`}
        >
          {opening ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
              Opening
            </>
          ) : (
            <>Open full breakdown ↗</>
          )}
        </button>
      </div>
    </div>
  );
};

const SignalDrillDrawer = ({ bucket, days, sector, hidden, openingId, onClose, onOpenSignal }) => {
  const open = !!bucket;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [filter, setFilter] = useState("all");   // all | win | sl
  const [sort, setSort] = useState("peak");      // peak | recent
  const [selectedId, setSelectedId] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const load = useCallback(async () => {
    if (!bucket) return;
    setLoading(true);
    setError(null);
    setPayload(null);
    setFilter("all");
    setSort("peak");
    setSelectedId(null);
    setMobileDetail(false);
    try {
      const res = await edgeLabApi.getDrill(bucket.dimension, bucket.key, days, sector);
      setPayload(res);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Couldn't load these signals — try again.");
    } finally {
      setLoading(false);
    }
  }, [bucket, days, sector]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Lock body scroll while open (drawer stays mounted when hidden behind a child modal)
  useEffect(() => {
    if (!open || hidden) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, hidden]);

  const all = payload?.signals || [];
  const btcSeries = bucket?.btcSeries || null;

  const stats = useMemo(() => {
    const counts = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };
    const peaks = [];
    for (const s of all) {
      if (counts[s.outcome] != null) counts[s.outcome] += 1;
      if (s.peak_pct != null) peaks.push(s.peak_pct);
    }
    const wins = counts.tp4 + counts.tp3 + counts.tp2 + counts.tp1;
    return {
      counts,
      wins,
      total: all.length,
      medPeak: median(peaks),
      bestPeak: peaks.length ? Math.max(...peaks) : null,
      maxAbs: peaks.length ? Math.max(...peaks.map((p) => Math.abs(p))) : 0,
    };
  }, [all]);

  const rankById = useMemo(() => {
    const byPeak = [...all].sort((a, b) => (b.peak_pct ?? -1e9) - (a.peak_pct ?? -1e9));
    const m = new Map();
    byPeak.forEach((s, i) => m.set(s.signal_id, i + 1));
    return m;
  }, [all]);

  // per-signal BTC window, memoised once per payload
  const btcHoldById = useMemo(() => {
    const m = new Map();
    if (!btcSeries) return m;
    for (const s of all) m.set(s.signal_id, btcOverHold(s, btcSeries));
    return m;
  }, [all, btcSeries]);

  const view = useMemo(() => {
    let arr = all;
    if (filter === "win") arr = arr.filter((s) => s.outcome && s.outcome !== "sl");
    else if (filter === "sl") arr = arr.filter((s) => s.outcome === "sl");
    arr = [...arr];
    if (sort === "peak") arr.sort((a, b) => (b.peak_pct ?? -1e9) - (a.peak_pct ?? -1e9));
    else arr.sort((a, b) => new Date(b.hit_date) - new Date(a.hit_date));
    return arr;
  }, [all, filter, sort]);

  useEffect(() => {
    if (!view.length) {
      setSelectedId(null);
      return;
    }
    if (!view.some((s) => s.signal_id === selectedId)) {
      setSelectedId(view[0].signal_id);
    }
  }, [view, selectedId]);

  const selected = view.find((s) => s.signal_id === selectedId) || null;

  useEffect(() => {
    if (!open || hidden) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (!view.length) return;
      const idx = view.findIndex((s) => s.signal_id === selectedId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedId(view[Math.min(view.length - 1, idx + 1)].signal_id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedId(view[Math.max(0, idx - 1)].signal_id);
      } else if (e.key === "Enter" && selected) {
        onOpenSignal?.(selected.signal_id, selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, view, selectedId, selected, onClose, onOpenSignal]);

  // While a signal modal is open we hide (but do NOT unmount) so the fetched
  // payload persists and the list is restored instantly on return.
  if (!open || hidden) return null;

  const returned = all.length;
  const aggTotal = bucket.total ?? payload?.count ?? returned;
  const capped = payload != null && returned < aggTotal;
  const wr = bucket.win_rate ?? payload?.win_rate ?? null;

  const FilterChip = ({ id, label, count }) => (
    <button
      onClick={() => setFilter(id)}
      className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition border ${
        filter === id
          ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
          : "border-white/[0.08] text-white/45 hover:text-white/80"
      }`}
    >
      {label}{count != null && <span className="opacity-50 ml-1">{count}</span>}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[150000] flex items-end justify-center sm:items-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px] animate-[dfadeIn_120ms_ease-out]"
        onClick={onClose}
      />

      <div className="relative w-full max-w-5xl max-h-[min(92dvh,100%)] h-[min(92dvh,100%)] sm:h-[88vh] bg-[#0a0805] border-t border-white/[0.08] sm:border rounded-t-3xl sm:rounded-2xl shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:shadow-2xl flex flex-col overflow-hidden animate-[dpop_180ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />

        {/* ① header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] tracking-[0.22em] font-mono uppercase text-gold-primary/60 mb-1">
                Signals · {bucket.dimension.replace(/_/g, " ")}
              </div>
              <div className="text-lg sm:text-xl font-display text-white/95 leading-tight truncate">{bucket.label}</div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-md border border-white/[0.08] text-white/50 hover:text-white hover:border-white/25 transition flex items-center justify-center"
              title="Close (Esc)"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {!loading && !error && all.length > 0 && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
              <div>
                <div className="flex items-center gap-3 mb-1.5 text-[11px] font-mono tabular-nums">
                  <span className="text-white/55">{aggTotal.toLocaleString()} resolved</span>
                  {wr != null && (
                    <span className={wr >= 60 ? "text-emerald-400" : wr >= 50 ? "text-white/70" : "text-red-400"}>
                      {wr.toFixed(0)}% WR
                    </span>
                  )}
                  <span className="text-white/35">{stats.wins}W / {stats.counts.sl}L</span>
                  {capped && <span className="text-amber-400/70">first {returned} of {aggTotal}</span>}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]">
                  {DIST_ORDER.map((k) => {
                    const n = stats.counts[k];
                    if (!n) return null;
                    return (
                      <div
                        key={k}
                        style={{ width: `${(n / stats.total) * 100}%`, background: OUTCOME_STYLE[k].c }}
                        title={`${OUTCOME_STYLE[k].label}: ${n}`}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Median peak</div>
                  <div className="font-mono tabular-nums text-base text-white/85">{fmtPeak(stats.medPeak) || "—"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Best</div>
                  <div className="font-mono tabular-nums text-base text-emerald-400/90">{fmtPeak(stats.bestPeak) || "—"}</div>
                </div>
                <BtcDayStat btc={bucket.btc} />
              </div>
            </div>
          )}
        </div>

        {/* body: master-detail */}
        <div className="flex-1 flex min-h-0">
          {loading && (
            <div className="flex-1 p-5 sm:p-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
              <div className="space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-white/[0.02] border border-white/[0.05] animate-pulse" />
                ))}
              </div>
              <div className="hidden md:block rounded-lg bg-white/[0.02] border border-white/[0.05] animate-pulse" />
            </div>
          )}

          {error && (
            <div className="flex-1 p-5 sm:p-6">
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-300">
                {error}
                <button onClick={load} className="block mt-2 text-[11px] font-mono uppercase tracking-wider text-red-300/70 hover:text-red-300">
                  ↻ Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && all.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm font-mono uppercase tracking-wider">
              No signals
            </div>
          )}

          {!loading && !error && all.length > 0 && (
            <>
              {/* ② left: toolbar + list */}
              <div
                className={`w-full md:w-[300px] md:border-r border-white/[0.06] flex-col min-h-0 ${
                  mobileDetail ? "hidden md:flex" : "flex"
                }`}
              >
                <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center justify-between gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-1.5">
                    <FilterChip id="all" label="All" count={stats.total} />
                    <FilterChip id="win" label="Wins" count={stats.wins} />
                    <FilterChip id="sl" label="SL" count={stats.counts.sl} />
                  </div>
                  <button
                    onClick={() => setSort(sort === "peak" ? "recent" : "peak")}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider text-gold-primary/80 hover:text-gold-primary"
                    title="Toggle sort"
                  >
                    ⇅ {sort}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
                  {view.length === 0 ? (
                    <div className="py-12 text-center text-white/25 text-xs font-mono uppercase tracking-wider">
                      No signals
                    </div>
                  ) : (
                    view.map((s) => (
                      <SignalRow
                        key={s.signal_id}
                        s={s}
                        maxPeak={stats.maxAbs}
                        btcHold={btcHoldById.get(s.signal_id) || null}
                        selected={s.signal_id === selectedId}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setMobileDetail(true);
                        }}
                      />
                    ))
                  )}
                </div>
                <div className="px-3 py-2 border-t border-white/[0.05] text-[9px] font-mono text-white/25 shrink-0 hidden md:block">
                  ↑↓ navigate · Enter opens full breakdown
                </div>
              </div>

              {/* ③ right: detail */}
              <div className={`flex-1 min-h-0 flex-col ${mobileDetail ? "flex" : "hidden md:flex"}`}>
                <DetailPane
                  s={selected}
                  rank={selected ? rankById.get(selected.signal_id) : null}
                  total={stats.total}
                  allSignals={all}
                  btc={bucket.btc}
                  btcSeries={btcSeries}
                  opening={selected && openingId === selected.signal_id}
                  onOpenSignal={onOpenSignal}
                  onBack={() => setMobileDetail(false)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dpop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes dfadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
};

export default SignalDrillDrawer;
