// src/components/aiArenaV6/CompassSnapshot.jsx
// ────────────────────────────────────────────────────────────────
// Compact BTC Compass strip for other pages (Signals / Potential Trades).
// One glance: 24h stance + confidence, trade geometry (invalidation → spot
// → target), alt-exposure mode, and shortcuts into the full AI Research tabs.
// Collapsible; open by default; state persisted in localStorage.
// Self-fetching and fail-silent: if the report can't load, renders nothing.
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLatestReport } from "../../services/aiArenaV6Api";
import { dirMeta, fmtUsd, fmtPct, timeAgo, COLOR } from "./_ui";

const STORAGE_KEY = "lux_compass_snapshot_collapsed";

const MODE_LABEL = {
  ALTCOIN_FRIENDLY: "Risk-on",
  SELECTIVE_RISK_ON: "Selective risk-on",
  BTC_ONLY_RISK_ON: "BTC-led only",
  DEFENSIVE: "Defensive",
  EMERGENCY_DE_RISK: "Protect capital",
  CHOPPY_RANGE: "Range only",
};

const MODE_HINT = {
  ALTCOIN_FRIENDLY: "Alt entries allowed after confirmation.",
  SELECTIVE_RISK_ON: "Only the cleanest setups, size controlled.",
  BTC_ONLY_RISK_ON: "Keep altcoin exposure lighter.",
  DEFENSIVE: "Reduce fresh exposure, wait for reclaim.",
  EMERGENCY_DE_RISK: "No new high-beta exposure.",
  CHOPPY_RANGE: "Level-to-level only, smaller size.",
};

const LINKS = [
  { tab: "read", label: "Full outlook" },
  { tab: "chart", label: "Projection chart" },
  { tab: "evaluation", label: "Audit" },
  { tab: "longer", label: "Longer view" },
];

/* Horizontal level meter: invalidation ── spot ── target */
function LevelMeter({ spot, target, invalidation }) {
  const s = Number(spot), t = Number(target), i = Number(invalidation);
  if (!isFinite(s) || !isFinite(t) || !isFinite(i)) return null;
  const lo = Math.min(s, t, i);
  const hi = Math.max(s, t, i);
  const span = hi - lo || 1;
  const pad = span * 0.08;
  const x = (p) => `${(((p - lo + pad) / (span + pad * 2)) * 100).toFixed(2)}%`;
  const pct = (p) => fmtPct(((p - s) / s) * 100);

  const marks = [
    { key: "inv", price: i, hex: COLOR.loss, label: "INVALID", sub: pct(i) },
    { key: "spot", price: s, hex: "#ffffff", label: "SPOT", sub: null },
    { key: "tgt", price: t, hex: COLOR.profit, label: "TARGET", sub: pct(t) },
  ];

  return (
    <div className="w-full">
      <div className="relative mx-1 h-[46px]">
        {/* track */}
        <div className="absolute inset-x-0 top-[26px] h-[3px] rounded-full bg-white/[0.07]" />
        {/* filled zone between invalidation and target */}
        <div
          className="absolute top-[26px] h-[3px] rounded-full"
          style={{
            left: x(Math.min(t, i)),
            width: `calc(${x(Math.max(t, i))} - ${x(Math.min(t, i))})`,
            background: `linear-gradient(90deg, ${t > i ? COLOR.loss : COLOR.profit}, ${t > i ? COLOR.profit : COLOR.loss})`,
            opacity: 0.5,
          }}
        />
        {marks.map((m) => (
          <div
            key={m.key}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: x(m.price) }}
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: `${m.hex}AA` }}>
              {m.label}
            </span>
            <span className="mt-0.5 font-mono text-[11px] font-medium tabular-nums leading-none" style={{ color: m.hex }}>
              {fmtUsd(m.price)}
            </span>
            <span
              className="mt-[5px] h-[11px] w-[11px] rounded-full border-2 bg-[#0d0709]"
              style={{ borderColor: m.hex }}
            >
              {m.key === "spot" && (
                <span className="block h-full w-full scale-[0.5] animate-pulse rounded-full" style={{ background: m.hex }} />
              )}
            </span>
            {m.sub && (
              <span className="mt-1 font-mono text-[9px] tabular-nums text-text-muted/60">{m.sub}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompassSnapshot({ className = "" }) {
  const [report, setReport] = useState(null);
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    getLatestReport()
      .then((res) => { if (!cancelled) setReport(res); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
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
      spot: Number(report?.btc_price) || null,
      target: Number(contract?.primary_touch?.level) || null,
      invalidation: Number(contract?.invalidation?.level) || null,
      mode: MODE_LABEL[modeKey] || "Selective",
      modeHint: MODE_HINT[modeKey] || "Keep exposure measured until BTC confirms.",
      updated: report?.timestamp,
    };
  }, [report]);

  if (failed || (!report && !view)) return null;
  if (!view) return null;

  const { dir, conf, spot, target, invalidation, mode, modeHint, updated } = view;

  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#0d0709] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

      {/* ── header row (always visible) ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`text-[10px] text-gold-primary/70 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
          >
            ▸
          </span>
          <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/80">
            BTC Compass · 24h
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${dir.tag}`}>
            {dir.arrow} {dir.label}
            {isFinite(conf) ? <span className="opacity-80">{conf}%</span> : null}
          </span>
          {spot ? (
            <span className="hidden font-mono text-[11px] tabular-nums text-white/70 sm:inline">
              {fmtUsd(spot)}
            </span>
          ) : null}
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted/50 md:inline">
            {timeAgo(updated)}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto">
          {LINKS.map((l) => (
            <Link
              key={l.tab}
              to={`/ai-arena?tab=${l.tab}`}
              className="whitespace-nowrap rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted/70 transition hover:border-gold-primary/35 hover:text-gold-primary"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      </div>

      {/* ── body (collapsible) ── */}
      {!collapsed && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 md:px-5">
          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
            {/* level meter */}
            {target && invalidation && spot ? (
              <LevelMeter spot={spot} target={target} invalidation={invalidation} />
            ) : (
              <p className="text-[12px] text-text-muted/70">
                Projection levels are not available in the latest read.
              </p>
            )}

            {/* mode + quick numbers */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="min-w-[150px] flex-1 rounded-lg border border-gold-primary/20 bg-gold-primary/[0.06] px-3 py-2">
                <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-gold-primary/70">Alt exposure</div>
                <div className="font-display text-[14px] font-semibold leading-tight text-gold-light">{mode}</div>
                <div className="mt-0.5 line-clamp-1 text-[10.5px] text-text-muted/70">{modeHint}</div>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-white/[0.05] bg-[#140b0d] px-3 py-2">
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/60">Target</div>
                  <div className="font-mono text-[13px] font-medium tabular-nums text-profit">{fmtUsd(target)}</div>
                </div>
                <div className="rounded-lg border border-white/[0.05] bg-[#140b0d] px-3 py-2">
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/60">Invalidation</div>
                  <div className="font-mono text-[13px] font-medium tabular-nums text-loss">{fmtUsd(invalidation)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
