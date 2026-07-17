import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import TheRead from "./aiArenaV6/TheRead";
import LongerView from "./aiArenaV6/LongerView";
import {
  getEventRisk,
  getLatestReport,
  getOperationalHealth,
  getReportArchive,
  getReportPdfBlob,
  getScenarioLedger,
} from "../services/aiArenaV6Api";

import CompassBrief from "./aiArenaV6/CompassBrief";
import PriceChart from "./aiArenaV6/PriceChart";
import VerdictLedger from "./aiArenaV6/VerdictLedger";
import BrainPanel from "./aiArenaV6/BrainPanel";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";

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
    return "border-red-400/20 bg-red-400/10 text-loss";
  }
  if (value === "degraded" || value === "stale") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-200";
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
    return { label: "Bullish", arrow: "↑", cls: "border-profit/25 bg-profit/10 text-profit" };
  if (value === "bearish")
    return { label: "Bearish", arrow: "↓", cls: "border-loss/25 bg-loss/10 text-loss" };
  return {
    label: "Neutral",
    arrow: "→",
    cls: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  };
}

function ProductSwitcher({ active = "research" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors";
  const on = "bg-ink/[0.1] text-text-primary shadow-sm";
  const off = "text-text-muted hover:text-text-primary hover:bg-ink/[0.04]";
  return (
    <div
      className="inline-flex items-center rounded-lg border border-ink/[0.08] bg-ink/[0.02] p-0.5"
      role="navigation"
      aria-label="Product"
    >
      <Link to="/signals" className={`${base} ${active === "trades" ? on : off}`}>
        Trades
      </Link>
      <Link to="/terminal/scan" className={`${base} ${active === "terminal" ? on : off}`}>
        Terminal
      </Link>
      <span className={`${base} ${active === "research" ? on : off}`} aria-current="page">
        AI Research
      </span>
    </div>
  );
}

function PageHeader({ report, healthStatus, onRefresh, refreshing, activeLabel }) {
  const healthy = healthStatus === "healthy";
  const tactical =
    report?.verdict_summary?.tactical_24h || report?.report?.verdict?.tactical_24h || {};
  const stance = stanceMeta(tactical.direction);
  const btcPrice = Number(report?.btc_price);
  const stanceText =
    stance.cls.split(" ").find((c) => c.startsWith("text-")) || "text-text-primary";

  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <h1 className="shrink-0 font-display text-[15px] font-semibold tracking-tight text-text-primary sm:text-base">
              AI Research
            </h1>
            {activeLabel ? (
              <>
                <span className="text-text-primary/15">/</span>
                <span className="truncate font-medium text-text-primary/80">{activeLabel}</span>
              </>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-text-secondary">
            BTC Compass — 24h outlook, projection levels, confluence & risk for alt exposure
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ProductSwitcher active="research" />
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${
              healthy
                ? "border-profit/25 bg-profit/10 text-profit"
                : "border-accent/30 bg-accent/10 text-accent"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-profit" : "bg-accent"}`} />
            {healthy ? "Healthy" : "Check"}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-surface-secondary px-3.5 text-[12px] font-semibold text-text-primary transition hover:border-ink/18 hover:bg-ink/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              width="13"
              height="13"
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
      </div>

      {/* Ticker strip — Terminal KPI language */}
      <div className="flex flex-wrap items-stretch divide-x divide-ink/[0.06] overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
        {Number.isFinite(btcPrice) && btcPrice > 0 && (
          <div className="min-w-[120px] flex-1 px-4 py-3 sm:flex-none">
            <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted">
              BTC / USDT
            </div>
            <div className="mt-1.5 font-mono text-[18px] font-semibold tabular-nums leading-none tracking-tight text-text-primary">
              ${btcPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          </div>
        )}
        <div className="min-w-[120px] flex-1 px-4 py-3 sm:flex-none">
          <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted">
            24h stance
          </div>
          <div
            className={`mt-1.5 font-display text-[16px] font-semibold leading-none ${stanceText}`}
          >
            {stance.arrow} {stance.label}
            {tactical.confidence != null ? (
              <span className="ml-1.5 font-mono text-[12px] font-semibold text-text-muted">
                {tactical.confidence}%
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-w-[100px] flex-1 px-4 py-3 sm:flex-none">
          <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted">
            Updated
          </div>
          <div className="mt-1.5 font-mono text-[14px] font-semibold leading-none text-text-primary">
            {formatAge(report?.timestamp)}
          </div>
        </div>
      </div>
    </header>
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
      <div className="max-w-md rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-6 text-center">
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

// Terminal-style side navigation — SVG glyphs (not numeric "01")
const WORKSPACE_GROUPS = [
  { g: "Compass", keys: ["read", "longer", "chart"] },
  { g: "Audit", keys: ["evaluation", "brain"] },
  { g: "Library", keys: ["archive"] },
];

const TAB_ICON_PATHS = {
  read: (
    <>
      <path d="M4 5.5h16v13H4z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 9h10M7 12.5h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
  longer: (
    <>
      <path
        d="M3 17l5-5 4 3 8-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 5h5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  chart: (
    <>
      <rect x="3" y="11" width="4" height="9" rx="1" />
      <rect x="10" y="6" width="4" height="14" rx="1" opacity="0.7" />
      <rect x="17" y="9" width="4" height="11" rx="1" opacity="0.45" />
    </>
  ),
  evaluation: (
    <>
      <path
        d="M9 11l2.2 2.2L16 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity="0.7"
      />
    </>
  ),
  brain: (
    <>
      <circle cx="9" cy="10" r="3.2" opacity="0.55" />
      <circle cx="15" cy="10" r="3.2" opacity="0.55" />
      <path
        d="M8 16c1.2 1.5 2.6 2.2 4 2.2S14.8 17.5 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </>
  ),
  archive: (
    <>
      <path d="M4 7.5h16v11H4z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 7.5 6.5 4h11L20 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
};

const TabGlyph = ({ id }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-[15px] w-[15px] shrink-0"
    aria-hidden="true"
  >
    {TAB_ICON_PATHS[id] || <rect x="4" y="4" width="16" height="16" rx="2" />}
  </svg>
);

function WorkspaceSideNav({ activeTab, onChange, tabs }) {
  const byKey = Object.fromEntries(tabs.map((t) => [t.key, t]));

  return (
    <>
      {/* Mobile — horizontal chips with glyphs */}
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const on = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              title={tab.description}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                on
                  ? "bg-ink/[0.1] text-text-primary"
                  : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
              }`}
            >
              <span className={on ? "text-text-primary" : "text-text-muted"}>
                <TabGlyph id={tab.key} />
              </span>
              {tab.short || tab.label}
            </button>
          );
        })}
      </div>

      {/* Desktop — Terminal-identical slim rail */}
      <aside className="hidden w-[172px] shrink-0 overflow-y-auto lg:block [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/10">
        <nav className="space-y-2.5 pr-1" aria-label="AI Research sections">
          {WORKSPACE_GROUPS.map(({ g, keys }) => (
            <div key={g}>
              <div className="mb-1 px-2 font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted/55">
                {g}
              </div>
              <div className="space-y-px">
                {keys.map((key) => {
                  const tab = byKey[key];
                  if (!tab) return null;
                  const on = activeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onChange(key)}
                      title={tab.description}
                      aria-current={on ? "page" : undefined}
                      className={`relative flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-left text-[12px] font-medium transition-colors ${
                        on
                          ? "bg-ink/[0.07] text-text-primary"
                          : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
                      }`}
                    >
                      {on && (
                        <span className="absolute bottom-1.5 left-0 top-1.5 w-[2.5px] rounded-full bg-accent" />
                      )}
                      <span className={on ? "text-text-primary" : "text-text-muted"}>
                        <TabGlyph id={key} />
                      </span>
                      <span className="truncate leading-tight">{tab.short || tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

function ChartPanel({ report }) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/[0.06] px-4 py-3.5 md:px-5">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Price context
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary md:text-xl">
            BTC projection chart
          </h2>
          <p className="mt-0.5 max-w-3xl text-[12px] leading-5 text-text-muted">
            Live candles with Compass magnets, zones, and invalidation levels.
          </p>
        </div>
        <div className="rounded-md border border-ink/[0.08] bg-surface-secondary px-3 py-2 text-right font-mono text-[10px] text-text-muted">
          <div className="uppercase tracking-[0.14em]">Basis</div>
          <div className="mt-1 font-semibold text-text-primary">BTC + report</div>
        </div>
      </div>
      <div className="p-3 md:p-4">
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
  return "border-amber-500/20 bg-amber-500/10 text-amber-400";
}

function readableLabel(value) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ReportArchivePanel({ archive, loadingId, error, onOpenPdf }) {
  const items = archive?.items || [];
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
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
        <div className="border-b border-ink/[0.07] p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Report library
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
                Saved Compass PDFs
              </h2>
              <p className="mt-1.5 max-w-3xl text-[13px] leading-6 text-text-secondary">
                Each card shows stance, price, magnets, and risk — open the themed reader for the
                full archive.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right font-mono text-xs">
              <div className="rounded-md border border-ink/[0.08] bg-surface-secondary px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Reports
                </div>
                <div className="mt-1 text-sm font-semibold text-text-primary">{items.length}</div>
              </div>
              <div className="rounded-md border border-profit/20 bg-profit/[0.07] px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  PDF ready
                </div>
                <div className="mt-1 text-sm font-semibold text-profit">{readyCount}</div>
              </div>
              <div className="rounded-md border border-ink/[0.08] bg-surface-secondary px-3 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Latest
                </div>
                <div className="mt-1 text-sm font-semibold text-text-primary">
                  {latest ? formatAge(latest.timestamp) : "—"}
                </div>
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-loss/25 bg-loss/[0.06] px-4 py-3 text-sm text-loss">
              {error}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.07] bg-surface-secondary/50 px-4 py-2.5 md:px-5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Showing{" "}
              <span className="text-text-primary">
                {pageStart + 1}–{pageEnd}
              </span>{" "}
              of <span className="text-text-primary">{items.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className={pageBtn}
              >
                Prev
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`h-8 min-w-8 rounded-md border px-2 font-mono text-[10px] font-semibold transition ${
                    pageNumber === page
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={page >= pageCount}
                className={pageBtn}
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
          {pagedItems.map((item, index) => {
            const loading = loadingId === item.report_id;
            const direction = item.tactical_24h?.direction;
            const confidence = item.tactical_24h?.confidence;
            const bearish = String(direction || "").toLowerCase() === "bearish";
            const bullish = String(direction || "").toLowerCase() === "bullish";
            const ringClass = bullish
              ? "hover:border-profit/35"
              : bearish
                ? "hover:border-loss/35"
                : "hover:border-ink/20";
            return (
              <article
                key={item.report_id}
                className={`group relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-secondary p-4 transition ${ringClass} hover:bg-surface-raised`}
              >
                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-ink/[0.08] bg-surface-raised px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                        #{pageStart + index + 1}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                        {formatDateTime(item.timestamp)}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${directionClasses(direction)}`}
                      >
                        {readableLabel(direction)} {confidence ?? "—"}%
                      </span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-[16px] font-semibold leading-snug text-text-primary">
                      {item.headline || "Compass report"}
                    </h3>
                  </div>
                  <div className="shrink-0 text-right font-mono">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      BTC
                    </div>
                    <div className="mt-1 text-sm font-semibold text-text-primary">
                      {formatMoney(item.btc_price)}
                    </div>
                  </div>
                </div>

                <p className="relative mt-3 line-clamp-3 text-[13px] leading-6 text-text-secondary">
                  {item.summary ||
                    item.tactical_24h?.rationale ||
                    "Archived Compass report with full breakdown."}
                </p>

                <div className="relative mt-4 grid gap-2 text-xs md:grid-cols-3">
                  <div className="rounded-md border border-ink/[0.08] bg-surface-raised p-2.5">
                    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Below magnet
                    </div>
                    <div className="mt-1 font-mono font-semibold text-loss">
                      {formatMoney(item.nearest_magnet_below)}
                    </div>
                  </div>
                  <div className="rounded-md border border-ink/[0.08] bg-surface-raised p-2.5">
                    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Above magnet
                    </div>
                    <div className="mt-1 font-mono font-semibold text-profit">
                      {formatMoney(item.nearest_magnet_above)}
                    </div>
                  </div>
                  <div className="rounded-md border border-ink/[0.08] bg-surface-raised p-2.5">
                    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Event risk
                    </div>
                    <div className="mt-1 font-mono font-semibold text-text-primary">
                      {readableLabel(item.event_risk)}
                    </div>
                  </div>
                </div>

                <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] pt-3.5">
                  <span
                    className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      item.pdf_ready
                        ? "border-profit/25 bg-profit/10 text-profit"
                        : "border-accent/30 bg-accent/10 text-accent"
                    }`}
                  >
                    {item.pdf_ready
                      ? `${formatBytes(item.pdf_size_bytes)} ready`
                      : item.pdf_error || "Pending"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenPdf(item)}
                    disabled={loading}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-accent px-3.5 text-[12px] font-semibold leading-none text-accent-fg transition hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                  >
                    {loading ? "Opening…" : "Open reader →"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {items.length === 0 && (
          <div className="p-8 text-center text-sm text-text-primary/40">
            No archived Compass reports yet. The next scheduled report will create the first PDF.
          </div>
        )}
      </section>
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
      className="fixed inset-0 z-[100000] flex items-end justify-center overflow-hidden p-0 text-text-primary sm:items-center sm:p-3 lg:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Compass PDF preview"
    >
      {/* Backdrop — scrim only, works on every theme */}
      <button
        type="button"
        aria-label="Close reader"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/70 backdrop-blur-sm"
      />

      <div className="relative z-10 flex h-[min(94dvh,100%)] max-h-[min(94dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl sm:h-[min(920px,calc(100dvh-32px))] sm:max-h-[calc(100dvh-32px)] sm:w-[min(1540px,calc(100vw-32px))] sm:rounded-2xl">
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

  const activeLabel =
    workspaceTabs.find((t) => t.key === activeWorkspace)?.label || "Market Outlook";

  return (
    <div
      className="min-h-screen overflow-x-clip text-text-primary"
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1760px] px-4 py-6 md:px-6 xl:px-10">
        <PageHeader
          report={report}
          healthStatus={healthStatus}
          onRefresh={() => loadAll(true)}
          refreshing={refreshing}
          activeLabel={activeLabel}
        />

        {/* Terminal-style shell: side nav + scroll content */}
        <div className="mt-5 flex flex-col gap-3 lg:h-[calc(100vh-11rem)] lg:flex-row lg:items-stretch lg:gap-3 lg:overflow-hidden">
          <WorkspaceSideNav
            activeTab={activeWorkspace}
            onChange={setWorkspace}
            tabs={workspaceTabs}
          />

          <main className="min-w-0 flex-1 space-y-5 lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin] [scrollbar-color:rgb(var(--ink)_/_0.12)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15">
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

            <footer className="border-t border-ink/[0.06] pb-4 pt-5 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] leading-relaxed text-text-muted/45">
                LuxQuant BTC Compass · decision support only, not financial advice
              </p>
            </footer>
          </main>
        </div>

        <ReportPdfModal modal={pdfModal} onClose={closePdfModal} />
      </div>

      <AssistantWidget pageId="ai-research" />
    </div>
  );
}
