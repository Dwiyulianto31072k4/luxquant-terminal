import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TheRead from "./aiArenaV6/TheRead";
import LongerView from "./aiArenaV6/LongerView";
import {
  getChartData,
  getEventRisk,
  getLatestReport,
  getOperationalHealth,
  getReportArchive,
  getReportPdfBlob,
  getScenarioLedger,
} from "../services/aiArenaV6Api";

import PriceChart from "./aiArenaV6/PriceChart";
import VerdictLedger from "./aiArenaV6/VerdictLedger";
import BrainPanel from "./aiArenaV6/BrainPanel";
import AssistantWidget from "./assistant/AssistantWidget";
import CoinLogo from "./CoinLogo";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";
import { fmtUsd, fmtPct, humanizeTrigger } from "./aiArenaV6/_ui";

let pdfJsRuntimePromise;

function loadPdfJsRuntime() {
  if (!pdfJsRuntimePromise) {
    pdfJsRuntimePromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
    ]).then(([pdfjsLib, workerModule]) => {
      const PdfWorker = workerModule.default;
      if (pdfjsLib.GlobalWorkerOptions.workerPort) {
        pdfjsLib.GlobalWorkerOptions.workerPort.terminate?.();
      }
      pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
      return pdfjsLib;
    });
  }
  return pdfJsRuntimePromise;
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "healthy") {
    return "border-profit/20 bg-profit/10 text-profit";
  }
  if (value === "critical" || value === "unavailable") {
    return "border-negative/20 bg-negative/10 text-loss";
  }
  if (value === "degraded" || value === "stale") {
    return "border-accent/20 bg-accent/10 text-accent";
  }
  return "border-ink/10 bg-ink/5 text-text-primary/45";
}

function formatAge(timestamp) {
  if (!timestamp) return "not updated";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "not updated";
  const minutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function stanceMeta(direction) {
  const value = String(direction || "").toLowerCase();
  if (value === "bullish")
    return {
      label: "Bullish",
      arrow: "↑",
      pill: "bg-profit/12 text-profit",
      text: "text-profit",
    };
  if (value === "bearish")
    return {
      label: "Bearish",
      arrow: "↓",
      pill: "bg-negative/12 text-loss",
      text: "text-loss",
    };
  return {
    label: "Neutral",
    arrow: "→",
    pill: "bg-ink/[0.06] text-text-secondary",
    text: "text-text-secondary",
  };
}

const MODE_LABEL = {
  ALTCOIN_FRIENDLY: "Risk-on",
  SELECTIVE_RISK_ON: "Selective",
  BTC_ONLY_RISK_ON: "BTC-led",
  DEFENSIVE: "Defensive",
  EMERGENCY_DE_RISK: "Protect capital",
  CHOPPY_RANGE: "Range only",
};

/** Claude/ChatGPT chrome — quiet title, no product switcher, no card soup */
function PageHeader({ healthStatus, onRefresh, refreshing }) {
  const healthy = healthStatus === "healthy";
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="font-display text-[22px] font-semibold tracking-tight text-text-primary sm:text-2xl">
        AI Research
      </h1>
      <div className="flex items-center gap-2">
        <span
          className={`hidden items-center gap-1.5 text-[12px] sm:inline-flex ${
            healthy ? "text-profit" : "text-accent"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-profit" : "bg-accent"}`} />
          {healthy ? "Healthy" : "Check"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-secondary transition hover:bg-ink/[0.05] hover:text-text-primary disabled:opacity-50"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className={refreshing ? "animate-spin" : ""}
          >
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
    </header>
  );
}

/** Mini sparkline from close prices */
/** Theme-safe sparkline — uses --pos/--neg channels (works in luxquant/dark/bright) */
function Sparkline({ points, up, className = "" }) {
  const geom = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const w = 320;
    const h = 88;
    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 12) - 6;
      return [x, y];
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, w, h };
  }, [points]);

  if (!geom) {
    return <div className={`h-[88px] w-full rounded-lg bg-ink/[0.03] ${className}`} aria-hidden />;
  }

  // CSS channels — same tokens every theme uses for PnL
  const stroke = up ? "rgb(var(--pos))" : "rgb(var(--neg))";
  const fill = up ? "rgb(var(--pos) / 0.12)" : "rgb(var(--neg) / 0.12)";

  return (
    <svg
      viewBox={`0 0 ${geom.w} ${geom.h}`}
      className={`h-[88px] w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={geom.area} fill={fill} stroke="none" />
      <path
        d={geom.line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * BTC visual card — real CoinLogo, theme-safe surfaces, spark + levels.
 * Readable on luxquant / dark / bright (no hard-coded white/black fills).
 */
function BtcVisualPanel({ report }) {
  const [spark, setSpark] = useState([]);
  const tactical =
    report?.verdict_summary?.tactical_24h || report?.report?.verdict?.tactical_24h || {};
  const stance = stanceMeta(tactical.direction);
  const conf = Number(tactical.confidence);
  const btc = Number(report?.btc_price);
  const contract = report?.report?.verdict?.scenario_contract || {};
  const target = Number(contract?.primary_touch?.level) || null;
  const invalidation = Number(contract?.invalidation?.level) || null;

  useEffect(() => {
    let cancelled = false;
    getChartData("4H")
      .then((data) => {
        if (cancelled) return;
        const candles = data?.candles || data?.ohlc || data?.bars || [];
        const closes = candles
          .map((c) => Number(c.close ?? c.c ?? c[4]))
          .filter((n) => Number.isFinite(n) && n > 0);
        setSpark(closes.slice(-48));
      })
      .catch(() => {
        if (!cancelled) setSpark([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stance color for spark; fallback to price path if neutral
  const pathUp =
    stance.label === "Bullish"
      ? true
      : stance.label === "Bearish"
        ? false
        : spark.length >= 2
          ? spark[spark.length - 1] >= spark[0]
          : true;

  const washClass =
    stance.label === "Bearish"
      ? "bg-[rgb(var(--neg)/0.08)]"
      : stance.label === "Bullish"
        ? "bg-[rgb(var(--pos)/0.08)]"
        : "bg-ink/[0.03]";

  const lo = [btc, target, invalidation].filter((n) => Number.isFinite(n) && n > 0);
  const minL = lo.length ? Math.min(...lo) : 0;
  const maxL = lo.length ? Math.max(...lo) : 1;
  const span = maxL - minL || 1;
  // Keep markers away from edges so labels don't clip
  const xOf = (p) =>
    Number.isFinite(p)
      ? `${Math.max(8, Math.min(92, ((p - minL) / span) * 100))}%`
      : "50%";

  const levels = [
    target != null && Number.isFinite(target)
      ? {
          p: target,
          label: "Tgt",
          priceCls: "text-profit",
          dotCls: "border-profit bg-profit",
        }
      : null,
    Number.isFinite(btc) && btc > 0
      ? {
          p: btc,
          label: "Now",
          priceCls: "text-text-primary",
          dotCls: "border-ink/50 bg-surface-raised ring-2 ring-ink/10",
        }
      : null,
    invalidation != null && Number.isFinite(invalidation)
      ? {
          p: invalidation,
          label: "Inv",
          priceCls: "text-loss",
          dotCls: "border-loss bg-loss",
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink/[0.08] bg-surface-raised shadow-sm">
      {/* Theme-safe wash (pos/neg channels, not hard-coded hex) */}
      <div className={`pointer-events-none absolute inset-0 ${washClass}`} aria-hidden />
      <div
        className="pointer-events-none absolute -right-8 -top-10 opacity-[0.12] grayscale"
        aria-hidden
      >
        <CoinLogo pair="BTCUSDT" size={140} className="rounded-full" />
      </div>

      <div className="relative p-5 sm:p-6">
        {/* Header — real logo */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-ink/10 shadow-sm">
              <CoinLogo pair="BTCUSDT" size={44} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-text-muted">Bitcoin</p>
              <p className="font-mono text-[22px] font-semibold tabular-nums leading-tight text-text-primary sm:text-[24px]">
                {Number.isFinite(btc) && btc > 0 ? fmtUsd(btc) : "—"}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${stance.pill}`}
          >
            <span aria-hidden>{stance.arrow}</span>
            {stance.label}
            {isFinite(conf) ? (
              <span className="font-mono font-medium tabular-nums opacity-80">{conf}%</span>
            ) : null}
          </span>
        </div>

        {/* Spark */}
        <div className="mt-5">
          <Sparkline points={spark} up={pathUp} />
        </div>

        {/* Level strip — price order on axis, clear dots */}
        {levels.length >= 2 ? (
          <div className="relative mt-6 pb-1 pt-5">
            <div className="absolute inset-x-1 top-[1.65rem] h-px bg-ink/15" />
            {levels.map((m) => (
              <div
                key={m.label}
                className="absolute top-0 flex w-16 -translate-x-1/2 flex-col items-center"
                style={{ left: xOf(m.p) }}
              >
                <span
                  className={`font-mono text-[10px] font-medium tabular-nums leading-none ${m.priceCls}`}
                >
                  {fmtUsd(m.p)}
                </span>
                <span
                  className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${m.dotCls}`}
                />
                <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-text-muted">
                  {m.label}
                </span>
              </div>
            ))}
            {/* spacer for absolute markers */}
            <div className="h-10" aria-hidden />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Thesis + BTC visual — full-width split on desktop.
 */
function ThesisBoard({ report }) {
  const [whyOpen, setWhyOpen] = useState(false);
  if (!report) return null;

  const verdict = report?.report?.verdict || {};
  const tactical =
    report?.verdict_summary?.tactical_24h || verdict.tactical_24h || {};
  const stance = stanceMeta(tactical.direction);
  const conf = Number(tactical.confidence);
  const btc = Number(report?.btc_price);
  const contract = verdict.scenario_contract || {};
  const target = Number(contract?.primary_touch?.level) || null;
  const invalidation = Number(contract?.invalidation?.level) || null;
  const modeKey = String(contract?.market_mode || "").toUpperCase();
  const mode = MODE_LABEL[modeKey] || "Selective";

  const whatChanged = verdict.what_changed || report?.report?.what_changed || "";
  const isAnomaly = Boolean(report?.is_anomaly_triggered || report?.report?.is_anomaly_triggered);
  const triggerHuman = humanizeTrigger(
    report?.anomaly_reason || report?.report?.anomaly_reason || ""
  );

  const TACTICAL = new Set(["price_action", "liquidity", "derivatives", "smart_money"]);
  const drivers = [...(report?.report?.evidence_matrix?.rows || [])]
    .filter((r) => TACTICAL.has(r.key) && r.role !== "context_only")
    .slice(0, 2);

  const targetPct =
    Number.isFinite(btc) && btc > 0 && target
      ? fmtPct(((target - btc) / btc) * 100)
      : null;
  const invPct =
    Number.isFinite(btc) && btc > 0 && invalidation
      ? fmtPct(((invalidation - btc) / btc) * 100)
      : null;

  const whyFull = [whatChanged, triggerHuman].filter(Boolean).join(" ");

  return (
    <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
      {/* Left — thesis prose */}
      <div className="min-w-0 space-y-4 lg:col-span-7">
        <div>
          <h2
            className={`font-display text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[42px] ${stance.text}`}
          >
            <span className="mr-2 opacity-70" aria-hidden>
              {stance.arrow}
            </span>
            {stance.label}
            {isFinite(conf) ? (
              <span className="ml-2.5 font-mono text-[20px] font-medium tabular-nums text-text-muted sm:text-[22px]">
                {conf}%
              </span>
            ) : null}
          </h2>
          <p className="mt-2 text-[14px] text-text-muted">
            {Number.isFinite(btc) && btc > 0 ? (
              <span className="font-mono tabular-nums text-text-primary">{fmtUsd(btc)}</span>
            ) : null}
            <span className="mx-1.5 text-text-muted/40">·</span>
            <span>{formatAge(report?.timestamp)}</span>
            <span className="mx-1.5 text-text-muted/40">·</span>
            <span>{mode}</span>
          </p>
        </div>

        <div className="max-w-[42rem] space-y-3 text-[15.5px] leading-[1.75] text-text-secondary">
          <p>
            The 24-hour read is{" "}
            <span className={`font-medium ${stance.text}`}>
              {stance.label.toLowerCase()}
              {isFinite(conf) ? ` at ${conf}% confidence` : ""}
            </span>
            {drivers.length > 0 ? (
              <>
                , driven mainly by{" "}
                {drivers.map((r, i) => (
                  <span key={r.key}>
                    {i > 0 ? (i === drivers.length - 1 ? " and " : ", ") : ""}
                    {r.label?.toLowerCase()}
                  </span>
                ))}
              </>
            ) : null}
            .
          </p>
          {(target || invalidation) && (
            <p>
              {target ? (
                <>
                  Path toward{" "}
                  <span className="font-mono font-medium tabular-nums text-text-primary">
                    {fmtUsd(target)}
                  </span>
                  {targetPct ? (
                    <span className="text-text-muted"> ({targetPct})</span>
                  ) : null}
                </>
              ) : null}
              {target && invalidation ? "; " : null}
              {invalidation ? (
                <>
                  the read breaks under{" "}
                  <span className="font-mono font-medium tabular-nums text-text-primary">
                    {fmtUsd(invalidation)}
                  </span>
                  {invPct ? <span className="text-text-muted"> ({invPct})</span> : null}
                </>
              ) : null}
              .
            </p>
          )}
        </div>

        {whyFull ? (
          <div className="max-w-[42rem]">
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              className="group text-left text-[13.5px] leading-relaxed text-text-muted transition hover:text-text-secondary"
            >
              <span className="font-medium text-text-secondary group-hover:text-text-primary">
                {isAnomaly ? "Why this updated" : "What changed"}
              </span>
              <span className="mx-1.5 text-text-muted/50">·</span>
              {whyOpen ? (
                <span className="text-text-secondary">{whyFull}</span>
              ) : (
                <span>
                  {whyFull.slice(0, 110)}
                  {whyFull.length > 110 ? "…" : ""}{" "}
                  <span className="text-text-primary/70 underline-offset-2 group-hover:underline">
                    more
                  </span>
                </span>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* Right — visual fills the void */}
      <div className="min-w-0 lg:col-span-5">
        <BtcVisualPanel report={report} />
      </div>
    </section>
  );
}

/** Quiet one-line context when not on Outlook — avoids repeating full hero */
function MiniContextStrip({ report, onOpenOutlook }) {
  if (!report) return null;
  const tactical =
    report?.verdict_summary?.tactical_24h || report?.report?.verdict?.tactical_24h || {};
  const stance = stanceMeta(tactical.direction);
  const conf = Number(tactical.confidence);
  const btc = Number(report?.btc_price);
  const modeKey = String(
    report?.report?.verdict?.scenario_contract?.market_mode || ""
  ).toUpperCase();
  const mode = MODE_LABEL[modeKey] || "Selective";

  return (
    <button
      type="button"
      onClick={onOpenOutlook}
      className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink/[0.07] bg-surface-raised px-4 py-3 text-left text-[13px] transition hover:border-ink/12"
    >
      <span className={`font-semibold ${stance.text}`}>
        {stance.arrow} {stance.label}
        {isFinite(conf) ? ` ${conf}%` : ""}
      </span>
      {Number.isFinite(btc) && btc > 0 ? (
        <>
          <span className="text-text-muted/40">·</span>
          <span className="font-mono tabular-nums text-text-primary">{fmtUsd(btc)}</span>
        </>
      ) : null}
      <span className="text-text-muted/40">·</span>
      <span className="text-text-muted">{mode}</span>
      <span className="text-text-muted/40">·</span>
      <span className="text-text-muted">{formatAge(report?.timestamp)}</span>
      <span className="ml-auto text-[12px] font-medium text-text-muted">Outlook →</span>
    </button>
  );
}

/** Text tabs — ChatGPT/Claude style, not a fat pill bar */
function WorkspacePills({ activeTab, onChange, tabs }) {
  return (
    <div
      className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto border-b border-ink/[0.08] px-1"
      role="tablist"
      aria-label="AI Research sections"
    >
      {tabs.map((tab) => {
        const on = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={tab.description}
            onClick={() => onChange(tab.key)}
            className={`relative shrink-0 px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              on
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.short || tab.label}
            {on ? (
              <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-text-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="animate-[lqFadeIn_.25s_ease]"
      role="status"
      aria-label="Building the latest Compass read"
    >
      <ShimmerStyles />

      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-40" />
          <Skeleton className="h-8 w-64 max-w-[70vw]" />
        </div>
        <Skeleton className="hidden h-9 w-28 sm:block" />
      </div>

      {/* Verdict hero */}
      <div className="mb-5 rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Skeleton className="h-14 w-14 !rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-52 max-w-[60vw]" />
          </div>
          <Skeleton className="ml-auto h-9 w-24 shrink-0" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-ink/[0.05] p-3">
              <Skeleton className="h-2 w-14" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Workspace tab strip */}
      <div className="mb-5 flex gap-2 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-32 shrink-0 sm:w-40" />
        ))}
      </div>

      {/* Chart + side panel */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[320px]" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      </div>

      {/* Status caption — Compass is generating, keep the context */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-ink/40 animate-pulse" />
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-primary/40">
          Building the latest Compass read…
        </span>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-negative/15 bg-negative/[0.04] p-6 text-center">
        <h3 className="text-lg font-medium text-text-primary/85">Compass read could not load</h3>
        <p className="mt-2 text-sm leading-6 text-text-primary/45">
          {error || "The latest market read is temporarily unavailable."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-ink/10 bg-ink/[0.04] px-4 py-2 text-sm text-text-primary/75 hover:bg-ink/[0.08]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function ChartPanel({ report }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-text-primary">BTC projection</h2>
        <p className="text-[12px] text-text-muted">Candles · magnets · zones · levels</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
        <PriceChart report={report} />
      </div>
    </section>
  );
}

function formatDateTime(timestamp) {
  if (!timestamp) return "not dated";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "not dated";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `$${number.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`;
  return `${(number / (1024 * 1024)).toFixed(1)} MB`;
}

function directionClasses(direction) {
  const value = String(direction || "neutral").toLowerCase();
  if (value === "bullish") return "border-profit/20 bg-profit/10 text-profit";
  if (value === "bearish") return "border-loss/20 bg-loss/10 text-loss";
  return "border-accent/20 bg-accent/10 text-accent";
}

function readableLabel(value) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ReportArchivePanel({ archive, loadingId, error, onOpenPdf }) {
  const items = useMemo(() => archive?.items || [], [archive]);
  const readyCount = items.filter((item) => item.pdf_ready).length;
  const latest = items[0];
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const pageEnd = Math.min(items.length, pageStart + pageSize);
  const pagedItems = useMemo(
    () => items.slice(pageStart, pageStart + pageSize),
    [items, pageStart]
  );

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [pageCount]);

  if (!archive) {
    return (
      <section className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Report library
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-text-primary">
          PDF archive is unavailable
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          The report itself is still saved in the database. The PDF catalog endpoint may need
          subscription auth or the PDF generator dependency on the server.
        </p>
      </section>
    );
  }

  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageBtn =
    "rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] font-semibold text-text-secondary transition hover:border-ink/18 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-text-primary">
            Report library
          </h2>
          <p className="mt-1 text-[14px] text-text-muted">
            {items.length} reports · {readyCount} PDF ready
            {latest ? ` · latest ${formatAge(latest.timestamp)}` : ""}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className={pageBtn}
            >
              Prev
            </button>
            <span className="px-2 text-[12px] text-text-muted">
              {pageStart + 1}–{pageEnd} / {items.length}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={page >= pageCount}
              className={pageBtn}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-loss/20 bg-loss/[0.06] px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pagedItems.map((item) => {
          const loading = loadingId === item.report_id;
          const direction = item.tactical_24h?.direction;
          const confidence = item.tactical_24h?.confidence;
          const d = String(direction || "").toLowerCase();
          const stanceCls =
            d === "bearish"
              ? "bg-negative/10 text-loss"
              : d === "bullish"
                ? "bg-profit/10 text-profit"
                : "bg-ink/[0.05] text-text-secondary";
          return (
            <article
              key={item.report_id}
              className="flex flex-col rounded-2xl border border-ink/[0.08] bg-surface-raised p-5 transition hover:border-ink/14"
            >
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                <span>{formatDateTime(item.timestamp)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stanceCls}`}
                >
                  {readableLabel(direction)} {confidence ?? "—"}%
                </span>
              </div>
              <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-text-primary">
                {item.headline || "Compass report"}
              </h3>
              <p className="mt-1 font-mono text-[13px] tabular-nums text-text-secondary">
                BTC {formatMoney(item.btc_price)}
              </p>
              <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-relaxed text-text-muted">
                {item.summary ||
                  item.tactical_24h?.rationale ||
                  "Archived Compass report with full breakdown."}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink/[0.06] pt-3">
                <span className="text-[12px] text-text-muted">
                  {item.pdf_ready
                    ? `${formatBytes(item.pdf_size_bytes)} ready`
                    : item.pdf_error || "Pending"}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenPdf(item)}
                  disabled={loading}
                  className="text-[13px] font-medium text-accent transition hover:opacity-80 disabled:opacity-50"
                >
                  {loading ? "Opening…" : "Open →"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="py-12 text-center text-sm text-text-muted">
          No archived Compass reports yet.
        </div>
      )}
    </div>
  );
}

function ReportPdfModal({ modal, onClose }) {
  if (!modal) return null;

  const item = modal.item || {};
  const direction = item.tactical_24h?.direction;
  const confidence = item.tactical_24h?.confidence;
  const generatedLabel = formatDateTime(item.timestamp);

  // Full chrome uses theme tokens (bright / dark / luxquant) — no fixed dark wash
  const modalContent = (
    <div
      className="lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center overflow-hidden p-0 text-text-primary sm:items-center sm:p-3 lg:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Compass PDF preview"
    >
      {/* Backdrop — scrim only, works on every theme */}
      <button
        type="button"
        aria-label="Close reader"
        onClick={onClose}
        className="lq-scrim"
      />

      <div className="lq-sheet relative z-10 flex h-[min(var(--lq-modal-maxh),100%)] max-h-[min(var(--lq-modal-maxh),100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl sm:h-[min(920px,var(--lq-modal-maxh))] sm:max-h-[var(--lq-modal-maxh)] sm:w-[min(1540px,calc(100vw-32px))] sm:rounded-2xl">
        <div className="flex shrink-0 justify-center pb-0 pt-2.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        <header className="shrink-0 border-b border-ink/[0.08] bg-surface-raised px-3 py-3 md:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-accent/12 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Compass reader
                </span>
                <span
                  className={`rounded-md border px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${directionClasses(direction)}`}
                >
                  {readableLabel(direction)} {confidence ?? "-"}%
                </span>
                <span className="rounded-md border border-ink/[0.1] bg-surface-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  {generatedLabel}
                </span>
              </div>
              <h3 className="mt-1.5 max-w-[min(68vw,720px)] truncate text-[15px] font-semibold tracking-tight text-text-primary md:text-lg">
                {modal.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={modal.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-ink/[0.1] bg-surface-secondary px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-ink/18 hover:text-text-primary"
              >
                New tab
              </a>
              <a
                href={modal.url}
                download={modal.filename || "compass-report.pdf"}
                className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition hover:opacity-90"
              >
                Download
              </a>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-ink/[0.12] bg-surface-secondary text-text-primary transition hover:border-ink/20 hover:bg-ink/[0.06]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth={2.75}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-ink/[0.08] bg-surface-secondary/40 p-3 lg:block">
            <div className="flex h-full flex-col gap-2.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5">
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Reading brief
                </div>
                <p className="mt-2 text-[13px] leading-6 text-text-secondary">
                  {item.summary ||
                    item.tactical_24h?.rationale ||
                    "Full Compass breakdown is archived in this report."}
                </p>
              </div>

              <div className="grid gap-2">
                <ReaderMetric label="BTC at report" value={formatMoney(item.btc_price)} />
                <ReaderMetric
                  label="Magnet below"
                  value={formatMoney(item.nearest_magnet_below)}
                  tone="down"
                />
                <ReaderMetric
                  label="Magnet above"
                  value={formatMoney(item.nearest_magnet_above)}
                  tone="up"
                />
                <ReaderMetric label="Event risk" value={readableLabel(item.event_risk)} />
              </div>

              <div className="mt-auto rounded-lg border border-ink/[0.08] bg-surface-raised p-3">
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Reader mode
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-text-muted">
                  Scroll only this panel — the app behind stays locked. Theme follows your desk
                  setting.
                </p>
              </div>
            </div>
          </aside>

          <main className="min-h-0 bg-surface-secondary p-2 md:p-3">
            <CompassPdfViewer url={modal.url} title={modal.title || "Compass report PDF"} />
          </main>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function CompassPdfViewer({ url, title }) {
  const shellRef = useRef(null);
  const scrollRef = useRef(null);
  const pageRefs = useRef({});
  const [availableWidth, setAvailableWidth] = useState(760);
  const [pdfJsLib, setPdfJsLib] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    const target = shellRef.current;
    if (!target) return undefined;

    const measure = () => {
      const rect = target.getBoundingClientRect();
      const sidePadding = rect.width >= 1200 ? 36 : rect.width >= 760 ? 28 : 18;
      const maxReadableWidth = rect.width >= 1600 ? 1320 : rect.width >= 1200 ? 1180 : 1040;
      const nextWidth = Math.max(300, Math.min(rect.width - sidePadding, maxReadableWidth));
      setAvailableWidth(nextWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPdfJsLib(null);
    setStatus("loading");
    setError(null);

    loadPdfJsRuntime()
      .then((runtime) => {
        if (!cancelled) setPdfJsLib(runtime);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[compass-pdf] runtime load error", err);
        setError(err?.message || "PDF renderer could not load.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!url || !pdfJsLib) return undefined;
    let cancelled = false;
    setPdf(null);
    setPageCount(0);
    setCurrentPage(1);
    setStatus("loading");
    setError(null);

    const task = pdfJsLib.getDocument({ url });
    task.promise
      .then((document) => {
        if (cancelled) return;
        setPdf(document);
        setPageCount(document.numPages);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[compass-pdf] load error", err);
        setError(err?.message || "PDF could not be rendered.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url, pdfJsLib]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !pageCount) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.dataset?.page) {
          setCurrentPage(Number(visible.target.dataset.page));
        }
      },
      { root, threshold: [0.35, 0.55, 0.75] }
    );

    Object.values(pageRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pageCount, pdf]);

  const scrollToPage = useCallback((pageNumber) => {
    pageRefs.current[pageNumber]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const goToPage = useCallback(
    (offset) => {
      const nextPage = Math.min(pageCount, Math.max(1, currentPage + offset));
      scrollToPage(nextPage);
    },
    [currentPage, pageCount, scrollToPage]
  );

  const zoomOut = () => setZoom((value) => Math.max(0.72, Number((value - 0.1).toFixed(2))));
  const zoomIn = () => setZoom((value) => Math.min(1.45, Number((value + 0.1).toFixed(2))));

  const toolbarBtn =
    "rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 py-1.5 font-mono text-[11px] font-semibold text-text-secondary transition hover:border-ink/18 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-raised shadow-sm"
      ref={shellRef}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink/[0.08] bg-surface-raised px-3 py-2 md:px-4">
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Fit reader
          </div>
          <div className="mt-0.5 max-w-[54vw] truncate text-xs font-semibold text-text-primary md:text-sm">
            {title}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => goToPage(-1)}
            disabled={currentPage <= 1}
            className={toolbarBtn}
          >
            Prev
          </button>
          <span className="rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 py-1.5 font-mono text-[11px] font-semibold tabular-nums text-text-primary">
            {currentPage} / {pageCount || "—"}
          </span>
          <button
            type="button"
            onClick={() => goToPage(1)}
            disabled={!pageCount || currentPage >= pageCount}
            className={toolbarBtn}
          >
            Next
          </button>
          <span className="mx-0.5 hidden h-5 w-px bg-ink/10 sm:block" />
          <button type="button" onClick={zoomOut} className={toolbarBtn}>
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold text-accent-fg transition hover:opacity-90"
          >
            Fit {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={zoomIn} className={toolbarBtn}>
            +
          </button>
        </div>
      </div>

      {/* Page well — theme surface, not fixed dark wash */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-ink/[0.04] px-2 py-3 md:px-4 md:py-4"
      >
        {status === "loading" && (
          <div className="flex h-full min-h-[420px] items-center justify-center text-center">
            <div>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Rendering PDF
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto mt-10 max-w-md rounded-lg border border-loss/25 bg-loss/[0.06] p-5 text-center">
            <h4 className="text-base font-semibold text-text-primary">PDF preview failed</h4>
            <p className="mt-2 text-sm leading-6 text-loss">{error}</p>
          </div>
        )}

        {status === "ready" && pdf && (
          <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-4 pb-6">
            {Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  key={pageNumber}
                  data-page={pageNumber}
                  ref={(element) => {
                    pageRefs.current[pageNumber] = element;
                  }}
                  className="w-full scroll-mt-4"
                >
                  <PdfPageCanvas
                    pdf={pdf}
                    pageNumber={pageNumber}
                    pageCount={pageCount}
                    availableWidth={availableWidth}
                    zoom={zoom}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function PdfPageCanvas({ pdf, pageNumber, pageCount, availableWidth, zoom }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pageSize, setPageSize] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !availableWidth) return undefined;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setError(null);

    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return null;
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = availableWidth / baseViewport.width;
        const scale = Math.max(0.42, Math.min(fitScale * zoom, 2.65));
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        // PDF artboard is dark-designed; keep a neutral dark pad under glyphs only
        // (UI chrome around the page follows theme tokens)
        context.fillStyle = "#0c0c0e";
        context.fillRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        setPageSize({ width: viewport.width, height: viewport.height });
        return renderTask.promise;
      })
      .catch((err) => {
        if (cancelled || err?.name === "RenderingCancelledException") return;
        console.error("[compass-pdf] page render error", err);
        setError(err?.message || "Page could not render.");
      });

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, availableWidth, zoom]);

  return (
    <article
      className="mx-auto overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-raised shadow-md"
      style={{ width: pageSize?.width ? Math.floor(pageSize.width) : Math.floor(availableWidth) }}
    >
      <div className="flex items-center justify-between border-b border-ink/[0.08] bg-surface-secondary px-3 py-2 font-mono text-[10px] font-semibold text-text-muted">
        <span>Page {pageNumber}</span>
        <span className="tabular-nums">
          {pageNumber} / {pageCount}
        </span>
      </div>
      <div className="relative bg-surface-raised">
        {!pageSize && !error && (
          <div className="flex h-[520px] items-center justify-center font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Rendering page
          </div>
        )}
        {error && <div className="p-8 text-center text-sm text-loss">{error}</div>}
        <canvas
          ref={canvasRef}
          className="block max-w-full"
          aria-label={`PDF page ${pageNumber}`}
        />
      </div>
    </article>
  );
}

function ReaderMetric({ label, value, tone }) {
  const valueCls =
    tone === "up" ? "text-profit" : tone === "down" ? "text-loss" : "text-text-primary";
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${valueCls}`}>
        {value || "—"}
      </div>
    </div>
  );
}

export default function AIArenaPageV6() {
  const [report, setReport] = useState(null);
  const [eventRisk, setEventRisk] = useState(null);
  const [operationalHealth, setOperationalHealth] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [reportArchive, setReportArchive] = useState(null);
  // Deep-linkable tabs: /ai-arena?tab=read|longer|evaluation|chart|archive
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get("tab");
      return ["read", "longer", "evaluation", "chart", "archive", "brain"].includes(tab)
        ? tab
        : "read";
    } catch {
      return "read";
    }
  });
  const [pdfModal, setPdfModal] = useState(null);
  const pdfUrlRef = useRef(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [latestRes, eventRiskRes, operationalRes, ledgerRes, archiveRes] =
        await Promise.allSettled([
          getLatestReport(),
          getEventRisk(),
          getOperationalHealth(),
          getScenarioLedger({ limit: 8, offset: 0, filter: "all" }),
          getReportArchive({ limit: 18 }),
        ]);

      if (latestRes.status !== "fulfilled") {
        throw latestRes.reason || new Error("Failed to load latest report");
      }

      setReport(latestRes.value);
      setEventRisk(eventRiskRes.status === "fulfilled" ? eventRiskRes.value : null);
      setOperationalHealth(operationalRes.status === "fulfilled" ? operationalRes.value : null);
      setLedger(ledgerRes.status === "fulfilled" ? ledgerRes.value : null);
      setReportArchive(archiveRes.status === "fulfilled" ? archiveRes.value : null);
    } catch (err) {
      console.error("[v6] load error:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const openReportPdf = useCallback(async (item) => {
    if (!item?.report_id) return;
    setPdfLoadingId(item.report_id);
    setPdfError(null);
    try {
      const blob = await getReportPdfBlob(item.report_id);
      const pdfBlob = blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = url;
      setPdfModal({
        url,
        title: item.headline || item.report_id,
        filename: item.pdf_filename || `compass-${item.report_id}.pdf`,
        item,
      });
    } catch (err) {
      console.error("[v6] pdf open error:", err);
      setPdfError(err?.response?.data?.detail || err?.message || "PDF report could not be opened.");
    } finally {
      setPdfLoadingId(null);
    }
  }, []);

  const closePdfModal = useCallback(() => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = null;
    setPdfModal(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!pdfModal) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closePdfModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pdfModal, closePdfModal]);

  useEffect(() => {
    if (!pdfModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pdfModal]);

  // MUST stay before any early return — Rules of Hooks
  const setWorkspace = useCallback((key) => {
    setActiveWorkspace(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const workspaceTabs = useMemo(
    () => [
      {
        key: "read",
        short: "Outlook",
        label: "Market Outlook",
        description: "24h direction, exposure guide, levels, and risk.",
      },
      {
        key: "longer",
        short: "Longer View",
        label: "Longer View",
        description: "Swing context and holder backdrop.",
      },
      {
        key: "chart",
        short: "Chart",
        label: "Projection Chart",
        description: "Live candles with projection overlay.",
      },
      {
        key: "evaluation",
        short: "Audit",
        label: "Projection Audit",
        description: "Projected level, result, and explanation.",
      },
      {
        key: "brain",
        short: "AI Brain",
        label: "AI Brain",
        description: "Lessons the AI learned from its own audited calls.",
      },
      {
        key: "archive",
        short: "Library",
        label: "Report Library",
        description: "Archived outlooks and PDF guide.",
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="min-h-screen text-text-primary">
        <div className="mx-auto max-w-[1760px] px-4 py-8 md:px-6 xl:px-10">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="min-h-screen text-text-primary">
        <div className="mx-auto max-w-[1760px] px-4 py-8 md:px-6 xl:px-10">
          <ErrorState error={error} onRetry={() => loadAll(false)} />
        </div>
      </div>
    );
  }

  const dashboardHealth = report?.dashboard_health || null;
  const healthStatus =
    operationalHealth?.status === "healthy" && dashboardHealth?.status === "healthy"
      ? "healthy"
      : operationalHealth?.status || dashboardHealth?.status || "unknown";

  return (
    <div
      className="min-h-screen overflow-x-clip text-text-primary"
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-10">
        <PageHeader
          healthStatus={healthStatus}
          onRefresh={() => loadAll(true)}
          refreshing={refreshing}
        />

        {/* Full thesis only on Outlook; other tabs get a quiet one-line context */}
        {activeWorkspace === "read" ? (
          <ThesisBoard report={report} />
        ) : (
          <MiniContextStrip report={report} onOpenOutlook={() => setWorkspace("read")} />
        )}

        <WorkspacePills
          activeTab={activeWorkspace}
          onChange={setWorkspace}
          tabs={workspaceTabs}
        />

        <main className="min-w-0 space-y-8">
          {activeWorkspace === "read" && <TheRead data={report} />}
          {activeWorkspace === "longer" && <LongerView data={report} />}
          {activeWorkspace === "evaluation" && <VerdictLedger ledger={ledger} pageSize={8} />}
          {activeWorkspace === "chart" && <ChartPanel report={report} />}
          {activeWorkspace === "brain" && <BrainPanel />}
          {activeWorkspace === "archive" && (
            <ReportArchivePanel
              archive={reportArchive}
              report={report}
              loadingId={pdfLoadingId}
              error={pdfError}
              onOpenPdf={openReportPdf}
            />
          )}

          <footer className="pb-10 pt-2">
            <p className="text-[12px] leading-relaxed text-text-muted/55">
              Decision support only — not financial advice.
            </p>
          </footer>
        </main>

        <ReportPdfModal modal={pdfModal} onClose={closePdfModal} />
      </div>

      <AssistantWidget pageId="ai-research" />
    </div>
  );
}
