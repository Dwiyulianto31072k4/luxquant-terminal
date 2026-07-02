// src/components/aiArenaV6/CompassSnapshot.jsx
// ────────────────────────────────────────────────────────────────
// Compact BTC Compass strip for the Signals / Potential Trades page.
// Short-term (24h) focus only: stance + confidence, LIVE spot price on a
// horizontal level meter (invalidation → spot → target), alt-exposure mode,
// and a plain-language explanation of the read.
// Spot price polls the backend every 15s and the marker glides in realtime.
// Collapsible (big chevron), open by default, state kept in localStorage.
// Fail-silent: if the report can't load, renders nothing.
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLatestReport } from "../../services/aiArenaV6Api";
import { getBTCData } from "../../services/marketApi";
import { dirMeta, fmtUsd, fmtPct, timeAgo, COLOR } from "./_ui";

const STORAGE_KEY = "lux_compass_snapshot_collapsed";
const PRICE_POLL_MS = 15000;

const MODE_LABEL = {
  ALTCOIN_FRIENDLY: "Risk-on",
  SELECTIVE_RISK_ON: "Selective risk-on",
  BTC_ONLY_RISK_ON: "BTC-led only",
  DEFENSIVE: "Defensive",
  EMERGENCY_DE_RISK: "Protect capital",
  CHOPPY_RANGE: "Range only",
};

const MODE_HINT = {
  ALTCOIN_FRIENDLY: "Alt entries allowed after confirmation — don't chase first resistance.",
  SELECTIVE_RISK_ON: "Only the cleanest setups. Keep size controlled while BTC respects the level.",
  BTC_ONLY_RISK_ON: "BTC is the cleaner expression — keep altcoin exposure lighter.",
  DEFENSIVE: "Reduce fresh exposure. Wait for a reclaim before adding high-beta.",
  EMERGENCY_DE_RISK: "No new high-beta exposure. Stops, cash, next stable structure.",
  CHOPPY_RANGE: "Trade level-to-level with smaller size until the range breaks.",
};

/* ── horizontal level meter: invalidation ── spot(live) ── target ── */
function LevelMeter({ spot, target, invalidation }) {
  const s = Number(spot), t = Number(target), i = Number(invalidation);
  if (!isFinite(s) || !isFinite(t) || !isFinite(i)) return null;
  const lo = Math.min(s, t, i);
  const hi = Math.max(s, t, i);
  const span = hi - lo || 1;
  const pad = span * 0.1;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const x = (p) => `${(clamp01((p - lo + pad) / (span + pad * 2)) * 100).toFixed(2)}%`;
  const pct = (p) => fmtPct(((p - s) / s) * 100);

  return (
    <div className="w-full">
      <div className="relative mx-2 h-[56px]">
        {/* track */}
        <div className="absolute inset-x-0 top-[30px] h-[4px] rounded-full bg-white/[0.06]" />
        {/* gradient zone invalidation → target */}
        <div
          className="absolute top-[30px] h-[4px] rounded-full"
          style={{
            left: x(Math.min(t, i)),
            width: `calc(${x(Math.max(t, i))} - ${x(Math.min(t, i))})`,
            background: `linear-gradient(90deg, ${t > i ? COLOR.loss : COLOR.profit}, ${t > i ? COLOR.profit : COLOR.loss})`,
            opacity: 0.45,
          }}
        />

        {/* invalidation + target: static end markers */}
        {[
          { key: "inv", price: i, hex: COLOR.loss, label: "INVALIDATION", sub: pct(i) },
          { key: "tgt", price: t, hex: COLOR.profit, label: "TARGET", sub: pct(t) },
        ].map((m) => (
          <div
            key={m.key}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: x(m.price) }}
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: `${m.hex}AA` }}>
              {m.label}
            </span>
            <span className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums leading-none" style={{ color: m.hex }}>
              {fmtUsd(m.price)}
            </span>
            <span className="mt-[7px] h-[11px] w-[11px] rounded-full border-2 bg-[#0d0709]" style={{ borderColor: m.hex }} />
            <span className="mt-1 font-mono text-[9px] tabular-nums text-text-muted/60">{m.sub}</span>
          </div>
        ))}

        {/* spot: LIVE marker — position transitions as price moves */}
        <div
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-1000 ease-out"
          style={{ left: x(s) }}
        >
          <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] text-white/70">
            <span className="relative flex h-[5px] w-[5px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
              <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-profit" />
            </span>
            LIVE
          </span>
          <span className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums leading-none text-white">
            {fmtUsd(s)}
          </span>
          <span className="mt-[6px] h-[13px] w-[13px] rounded-full border-2 border-white bg-[#0d0709] shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
        </div>
      </div>
    </div>
  );
}

export default function CompassSnapshot({ className = "" }) {
  const [report, setReport] = useState(null);
  const [failed, setFailed] = useState(false);
  const [livePrice, setLivePrice] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Latest Compass report (levels + stance)
  useEffect(() => {
    let cancelled = false;
    getLatestReport()
      .then((res) => { if (!cancelled) setReport(res); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // Live BTC price — poll backend every 15s
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      try {
        const data = await getBTCData();
        if (!cancelled && data?.price) setLivePrice(Number(data.price));
      } catch { /* keep last price */ }
      if (!cancelled) timer = setTimeout(tick, PRICE_POLL_MS);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const view = useMemo(() => {
    if (!report) return null;
    const verdict = report?.report?.verdict || {};
    const tactical = report?.verdict_summary?.tactical_24h || verdict.tactical_24h || {};
    const contract = verdict.scenario_contract || {};
    const modeKey = String(contract?.market_mode || "").toUpperCase();
    return {
      dir: dirMeta(tactical.direction),
      conf: Number(tactical.confidence),
      reportSpot: Number(report?.btc_price) || null,
      target: Number(contract?.primary_touch?.level) || null,
      invalidation: Number(contract?.invalidation?.level) || null,
      mode: MODE_LABEL[modeKey] || "Selective",
      modeHint: MODE_HINT[modeKey] || "Keep exposure measured until BTC confirms the read.",
      updated: report?.timestamp,
    };
  }, [report]);

  if (failed || !view) return null;

  const { dir, conf, reportSpot, target, invalidation, mode, modeHint, updated } = view;
  const spot = livePrice || reportSpot;

  const explanation = (() => {
    const parts = [];
    parts.push(`The 24h read is ${dir.label.toLowerCase()}${isFinite(conf) ? ` at ${conf}% confidence` : ""}`);
    if (target && spot) parts.push(`path points toward ${fmtUsd(target)} (${fmtPct(((target - spot) / spot) * 100)})`);
    if (invalidation && spot) parts.push(`the read breaks below ${fmtUsd(invalidation)} (${fmtPct(((invalidation - spot) / spot) * 100)})`);
    return parts.join("; ") + ".";
  })();

  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#0d0709] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

      {/* ── header (stacks on mobile: toggle row, then shortcut row) ── */}
      <div className="flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between md:px-5 md:py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="group flex min-w-0 items-center gap-2.5 overflow-hidden text-left md:gap-3"
        >
          {/* big solid chevron */}
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-primary text-[#1a0f08] shadow-[0_2px_12px_rgba(212,168,83,0.4)] transition-all duration-200 group-hover:bg-gold-light ${collapsed ? "" : "rotate-180"}`}
            aria-hidden="true"
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M3.2 5.8 8 10.6l4.8-4.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/80">
              BTC Compass · 24h
            </span>
            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${dir.tag}`}>
              {dir.arrow} {dir.label}
              {isFinite(conf) ? <span className="opacity-80">{conf}%</span> : null}
            </span>
            {spot ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[12px] tabular-nums text-white/80">
                <span className="relative flex h-[5px] w-[5px]">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
                  <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-profit" />
                </span>
                {fmtUsd(spot)}
              </span>
            ) : null}
            <span className="hidden whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted/50 lg:inline">
              report {timeAgo(updated)}
            </span>
          </span>
        </button>

        {/* short-term shortcuts only */}
        <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:flex sm:items-center">
          <Link
            to="/ai-arena?tab=read"
            className="whitespace-nowrap rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-gold-primary transition hover:border-gold-primary/50 hover:bg-gold-primary/15"
          >
            Full outlook →
          </Link>
          <Link
            to="/ai-arena?tab=chart"
            className="whitespace-nowrap rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted/70 transition hover:border-gold-primary/35 hover:text-gold-primary"
          >
            Projection chart →
          </Link>
        </div>
      </div>

      {/* ── body (collapsible) ── */}
      {!collapsed && (
        <div className="border-t border-white/[0.06] px-3 pb-4 pt-3 md:px-5">
          <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,1fr)]">
            {/* meter + explanation */}
            <div className="min-w-0">
              {target && invalidation && spot ? (
                <LevelMeter spot={spot} target={target} invalidation={invalidation} />
              ) : (
                <p className="text-[12px] text-text-muted/70">
                  Projection levels are not available in the latest read.
                </p>
              )}
              <p className="mt-2.5 text-[12px] leading-5 text-text-muted">
                <span className={`font-semibold ${dir.text}`}>{dir.arrow} What this means: </span>
                {explanation}
              </p>
            </div>

            {/* alt exposure card */}
            <div className="flex items-stretch">
              <div className="w-full rounded-lg border border-gold-primary/20 bg-gold-primary/[0.06] px-4 py-3">
                <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-gold-primary/70">
                  Alt exposure — how to trade the signals below
                </div>
                <div className="mt-1 font-display text-[16px] font-semibold leading-tight text-gold-light">{mode}</div>
                <p className="mt-1 text-[11.5px] leading-4 text-text-muted">{modeHint}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
