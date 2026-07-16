import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (value === "critical" || value === "unavailable") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }
  if (value === "degraded" || value === "stale") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  }
  return "border-white/10 bg-white/5 text-text-primary/45";
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
  if (value === "bullish") return { label: "Bullish", arrow: "↑", cls: "border-profit/25 bg-profit/10 text-profit" };
  if (value === "bearish") return { label: "Bearish", arrow: "↓", cls: "border-loss/25 bg-loss/10 text-loss" };
  return { label: "Neutral", arrow: "→", cls: "border-amber-500/20 bg-amber-500/10 text-amber-400" };
}

function PageHeader({ report, healthStatus, onRefresh, refreshing }) {
  const healthy = healthStatus === "healthy";
  const tactical = report?.verdict_summary?.tactical_24h || report?.report?.verdict?.tactical_24h || {};
  const stance = stanceMeta(tactical.direction);
  const btcPrice = Number(report?.btc_price);
  return (
    <header className="space-y-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-px w-8 shrink-0 bg-gold-primary/40" />
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/80 sm:tracking-[0.25em]">
          BTC Compass · AI Research
        </span>
        <span className="hidden h-px flex-1 bg-white/[0.06] sm:block" />
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
            healthy
              ? "border-profit/25 bg-profit/10 text-profit"
              : "border-amber-500/20 bg-amber-500/10 text-amber-400"
          }`}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${healthy ? "bg-profit" : "bg-amber-500"}`} />
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${healthy ? "bg-profit" : "bg-amber-500"}`} />
          </span>
          {healthy ? "Data healthy" : "Data check"}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-[280px]">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary md:text-[40px] md:leading-[1.05]">
            BTC Market Outlook
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Start with the 24h outlook for altcoin exposure, then check the projection,
            key levels, risk, and the longer backdrop in one flow.
          </p>
        </div>

        {/* exchange-style segmented ticker bar + compact refresh */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="flex flex-1 items-stretch divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-surface-raised sm:flex-none">
            {Number.isFinite(btcPrice) && btcPrice > 0 && (
              <div className="flex-1 px-3 py-2 sm:flex-none sm:px-4">
                <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/60">BTC / USDT</div>
                <div className="mt-0.5 font-mono text-[17px] font-medium tabular-nums leading-tight tracking-tight text-text-primary">
                  ${btcPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}
            <div className="flex-1 px-3 py-2 sm:flex-none sm:px-4">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/60">24h stance</div>
              <div className={`mt-0.5 font-display text-[15px] font-semibold leading-tight ${stance.cls.split(" ").find((c) => c.startsWith("text-")) || "text-text-primary"}`}>
                {stance.arrow} {stance.label}
                {tactical.confidence != null ? (
                  <span className="ml-1 font-mono text-[11px] font-normal opacity-75">{tactical.confidence}%</span>
                ) : null}
              </div>
            </div>
            <div className="flex-1 px-3 py-2 sm:flex-none sm:px-4">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/60">Updated</div>
              <div className="mt-0.5 font-mono text-[13px] leading-tight text-text-primary/75">{formatAge(report?.timestamp)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-center rounded-lg bg-gold-primary px-4 text-[13px] font-semibold leading-none text-[#1a0f08] transition hover:bg-gold-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={refreshing ? "animate-spin" : ""}>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="animate-[lqFadeIn_.25s_ease]" role="status" aria-label="Building the latest Compass read">
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
      <div className="mb-5 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6">
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
            <div key={i} className="space-y-2 rounded-lg border border-white/[0.05] p-3">
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
        <span className="h-1.5 w-1.5 rounded-full bg-gold-primary animate-pulse" />
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
        <h3 className="text-lg font-medium text-text-primary/85">
          Compass read could not load
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-primary/45">
          {error || "The latest market read is temporarily unavailable."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-text-primary/75 hover:bg-white/[0.08]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function WorkspaceTabs({ activeTab, onChange, tabs }) {
  const scrollRef = useRef(null);
  const [atEnd, setAtEnd] = useState(false);

  const updateEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth - el.clientWidth;
    setAtEnd(scrollable <= 1 || el.scrollLeft >= scrollable - 2);
  }, []);

  useEffect(() => {
    updateEnd();
    const el = scrollRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateEnd, { passive: true });
    window.addEventListener("resize", updateEnd);
    return () => {
      el.removeEventListener("scroll", updateEnd);
      window.removeEventListener("resize", updateEnd);
    };
  }, [updateEnd]);

  // keep the active tab visible when it changes
  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

  return (
    <nav className="sticky top-0 z-40 -mx-4 border-b border-white/[0.07] bg-surface/92 backdrop-blur-md md:-mx-6 xl:-mx-10">
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex items-center gap-6 overflow-x-auto no-scrollbar pl-4 pr-16 md:pl-6 xl:pl-10"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                data-active={active}
                onClick={() => onChange(tab.key)}
                title={tab.description}
                className={`group flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 -mb-px pb-3 pt-3 text-[15px] font-medium transition-colors ${
                  active
                    ? "border-gold-primary text-text-primary"
                    : "border-transparent text-text-primary/45 hover:text-text-primary/80"
                }`}
              >
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? "text-gold-primary" : "text-text-primary/30 group-hover:text-text-primary/55"
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* fade + scroll arrow — flush to the far right edge, hides at the end */}
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pl-10 pr-2 transition-opacity duration-200 ${
            atEnd ? "opacity-0" : "opacity-100"
          }`}
          style={{ background: "linear-gradient(to right, transparent, #0a0506 42%)" }}
        >
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
            aria-label="Show more tabs"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-surface-secondary text-text-primary/70 transition hover:border-gold-primary/50 hover:text-gold-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}

function ChartPanel({ report }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-surface-raised p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)] md:p-5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/80">
            Price context
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-text-primary md:text-2xl">
            BTC projection chart
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted/70">
            Candles confirm where price is trading now. Compass projection adds magnets,
            zones, and invalidation so the trader can see why a bearish or bullish read
            may target a specific area.
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2 text-right font-mono text-[10px] text-text-muted/60">
          <div className="uppercase tracking-[0.14em]">Chart basis</div>
          <div className="mt-1 text-text-primary/65">Live BTC candles + Compass report</div>
        </div>
      </div>
      <PriceChart report={report} />
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
    [items, pageStart],
  );

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [pageCount]);

  if (!archive) {
    return (
      <section className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-surface-raised p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
          Report library
        </div>
        <h2 className="mt-1 text-2xl font-medium text-text-primary/90">PDF archive is unavailable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-primary/45">
          The report itself is still saved in the database. The PDF catalog endpoint may need subscription auth or the PDF generator dependency on the server.
        </p>
      </section>
    );
  }

  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-surface-raised shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="border-b border-white/[0.06] p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
                Report library
              </div>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text-primary md:text-3xl">
                Saved Compass PDFs
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-text-primary/45">
                Four reports per page. Each card shows the stance, price, magnets, and risk snapshot before opening the full archived PDF.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right font-mono text-xs">
              <div className="rounded-sm border border-white/[0.04] bg-surface-secondary px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted/60">Reports</div>
                <div className="mt-1 text-text-primary/80">{items.length}</div>
              </div>
              <div className="rounded-sm border border-profit/15 bg-profit/[0.05] px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted/60">PDF ready</div>
                <div className="mt-1 text-profit">{readyCount}</div>
              </div>
              <div className="rounded-sm border border-white/[0.04] bg-surface-secondary px-3 py-2">
                <div className="text-[9px] uppercase tracking-[0.14em] text-text-muted/60">Latest</div>
                <div className="mt-1 text-text-primary/65">{latest ? formatAge(latest.timestamp) : "-"}</div>
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200/85">
              {error}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/15 px-4 py-3 md:px-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-primary/35">
              Showing <span className="text-text-primary/65">{pageStart + 1}-{pageEnd}</span> of <span className="text-text-primary/65">{items.length}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/55 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Prev
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`h-8 min-w-8 rounded-md border px-2 transition ${
                    pageNumber === page
                      ? "border-gold-primary/40 bg-gold-primary/15 text-gold-primary"
                      : "border-white/[0.07] bg-black/20 text-text-primary/40 hover:border-white/[0.14] hover:text-text-primary/70"
                  }`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={page >= pageCount}
                className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/55 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
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
              ? "hover:border-emerald-400/35"
              : bearish
                ? "hover:border-red-400/35"
                : "hover:border-[#d4a853]/35";
            return (
              <article
                key={item.report_id}
                className={`group relative overflow-hidden rounded-sm border border-white/[0.06] bg-surface-secondary p-4 transition ${ringClass} hover:bg-[#d4a853]/[0.035]`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4a853]/45 to-transparent opacity-60" />
                <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#d4a853]/10 blur-3xl transition group-hover:bg-[#d4a853]/15" />

                <div className="relative flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
                        #{pageStart + index + 1}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
                        {formatDateTime(item.timestamp)}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] ${directionClasses(direction)}`}>
                        {readableLabel(direction)} {confidence ?? "-"}%
                      </span>
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-text-primary/90">
                      {item.headline || "Compass report"}
                    </h3>
                  </div>
                  <div className="shrink-0 text-right font-mono">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-text-primary/30">BTC</div>
                    <div className="mt-1 text-sm text-text-primary/80">{formatMoney(item.btc_price)}</div>
                  </div>
                </div>

                <p className="relative mt-3 line-clamp-3 text-sm leading-6 text-text-primary/45">
                  {item.summary || item.tactical_24h?.rationale || "Archived Compass report with full breakdown."}
                </p>

                <div className="relative mt-4 grid gap-2 text-xs md:grid-cols-3">
                  <div className="rounded-sm border border-white/[0.04] bg-black/25 p-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/30">Below magnet</div>
                    <div className="mt-1 font-mono text-text-primary/75">{formatMoney(item.nearest_magnet_below)}</div>
                  </div>
                  <div className="rounded-sm border border-white/[0.04] bg-black/25 p-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/30">Above magnet</div>
                    <div className="mt-1 font-mono text-text-primary/75">{formatMoney(item.nearest_magnet_above)}</div>
                  </div>
                  <div className="rounded-sm border border-white/[0.04] bg-black/25 p-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/30">Event risk</div>
                    <div className="mt-1 font-mono text-text-primary/75">{readableLabel(item.event_risk)}</div>
                  </div>
                </div>

                <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                  <span
                    className={`rounded-sm border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${
                      item.pdf_ready
                        ? "border-profit/20 bg-profit/10 text-profit"
                        : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {item.pdf_ready ? `${formatBytes(item.pdf_size_bytes)} ready` : item.pdf_error || "Pending"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenPdf(item)}
                    disabled={loading}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-gold-primary px-3.5 text-[12px] font-semibold leading-none text-[#1a0f08] transition hover:bg-gold-light active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center overflow-hidden bg-surface-raised/88 p-0 text-text-primary backdrop-blur-2xl sm:p-3 lg:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Compass PDF preview"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_4%,rgba(212,168,83,0.16),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(127,29,29,0.20),transparent_34%),linear-gradient(180deg,rgba(30,5,7,0.72),rgba(2,1,2,0.96))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4a853]/55 to-transparent" />

      <div className="relative flex h-[min(92dvh,100%)] max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-3xl border-t border-[#d4a853]/20 bg-surface-raised/98 shadow-[0_-20px_60px_rgba(0,0,0,0.82)] ring-1 ring-white/[0.06] sm:h-[min(920px,calc(100dvh-32px))] sm:max-h-[calc(100dvh-32px)] sm:w-[min(1540px,calc(100vw-32px))] sm:rounded-[22px] sm:border">
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <header className="shrink-0 border-b border-white/[0.08] bg-surface-raised/98 px-3 py-2.5 md:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-[#d4a853]/20 bg-[#d4a853]/10 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.18em] text-[#f5c451]">
                  Compass reader
                </span>
                <span className={`rounded-md border px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] ${directionClasses(direction)}`}>
                  {readableLabel(direction)} {confidence ?? "-"}%
                </span>
                <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/45">
                  {generatedLabel}
                </span>
              </div>
              <h3 className="mt-1.5 max-w-[68vw] truncate text-sm font-semibold tracking-[-0.01em] text-text-primary/90 md:text-lg">
                {modal.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={modal.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-text-primary/70 transition hover:border-white/[0.16] hover:bg-white/[0.08]"
              >
                New tab
              </a>
              <a
                href={modal.url}
                download={modal.filename || "compass-report.pdf"}
                className="rounded-lg border border-[#d4a853]/25 bg-[#d4a853]/10 px-3 py-2 text-xs font-semibold text-[#f5c451] transition hover:border-[#d4a853]/45 hover:bg-[#d4a853]/15"
              >
                Download
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-text-primary/70 transition hover:border-white/[0.16] hover:bg-white/[0.08]"
              >
                Close
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[clamp(220px,17vw,286px)_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-white/[0.08] bg-surface-raised/92 p-2.5 lg:block">
            <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
              <div className="rounded-2xl border border-[#d4a853]/15 bg-[#d4a853]/[0.045] p-4">
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
                  Reading brief
                </div>
                <p className="mt-2 text-sm leading-6 text-text-primary/62">
                  {item.summary || item.tactical_24h?.rationale || "Full Compass breakdown is archived in this report."}
                </p>
              </div>

              <div className="grid gap-2 xl:grid-cols-1">
                <ReaderMetric label="BTC at report" value={formatMoney(item.btc_price)} />
                <ReaderMetric label="Magnet below" value={formatMoney(item.nearest_magnet_below)} />
                <ReaderMetric label="Magnet above" value={formatMoney(item.nearest_magnet_above)} />
                <ReaderMetric label="Event risk" value={readableLabel(item.event_risk)} />
              </div>

              <div className="mt-auto rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
                  Reader mode
                </div>
                <p className="mt-2 text-xs leading-5 text-text-primary/42">
                  The window stays inside the viewport. Scroll only this reader, not the whole app behind it.
                </p>
              </div>
            </div>
          </aside>

          <main className="min-h-0 bg-[radial-gradient(circle_at_top,rgba(212,168,83,0.08),transparent_30%),linear-gradient(180deg,#130e12,#070507)] p-1.5 md:p-2.5">
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
      { root, threshold: [0.35, 0.55, 0.75] },
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
    [currentPage, pageCount, scrollToPage],
  );

  const zoomOut = () => setZoom((value) => Math.max(0.72, Number((value - 0.1).toFixed(2))));
  const zoomIn = () => setZoom((value) => Math.min(1.45, Number((value + 0.1).toFixed(2))));

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-white/[0.10] bg-surface-raised shadow-[0_18px_70px_rgba(0,0,0,0.45)_inset]" ref={shellRef}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-surface-raised/95 px-3 py-2 md:px-4">
        <div className="min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
            Fit reader
          </div>
          <div className="mt-1 max-w-[54vw] truncate text-xs font-semibold text-text-primary/78 md:text-sm">
            {title}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => goToPage(-1)}
            disabled={currentPage <= 1}
            className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/60 transition hover:bg-white/[0.07] disabled:opacity-35"
          >
            Prev
          </button>
          <span className="rounded-md border border-white/[0.08] bg-black/25 px-2.5 py-1.5 text-text-primary/55">
            {currentPage} / {pageCount || "-"}
          </span>
          <button
            type="button"
            onClick={() => goToPage(1)}
            disabled={!pageCount || currentPage >= pageCount}
            className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/60 transition hover:bg-white/[0.07] disabled:opacity-35"
          >
            Next
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/[0.08] sm:block" />
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/60 transition hover:bg-white/[0.07]"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-md border border-[#d4a853]/20 bg-[#d4a853]/10 px-2.5 py-1.5 text-[#f5c451] transition hover:bg-[#d4a853]/15"
          >
            Fit {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-text-primary/60 transition hover:bg-white/[0.07]"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,#161115,#0c090c)] px-2 py-3 md:px-4 md:py-4"
      >
        {status === "loading" && (
          <div className="flex h-full min-h-[420px] items-center justify-center text-center">
            <div>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#d4a853]" />
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-text-primary/35">
                Rendering PDF
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-5 text-center">
            <h4 className="text-base font-semibold text-text-primary/85">PDF preview failed</h4>
            <p className="mt-2 text-sm leading-6 text-red-100/65">{error}</p>
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

    pdf.getPage(pageNumber)
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
        context.fillStyle = "#070506";
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
    <article className="mx-auto overflow-hidden rounded-xl border border-white/[0.10] bg-surface-raised shadow-[0_22px_90px_rgba(0,0,0,0.55)]" style={{ width: pageSize?.width ? Math.floor(pageSize.width) : Math.floor(availableWidth) }}>
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-surface-raised px-3 py-2 font-mono text-[10px] text-text-primary/35">
        <span>Page {pageNumber}</span>
        <span>{pageNumber} / {pageCount}</span>
      </div>
      <div className="relative bg-surface-raised">
        {!pageSize && !error && (
          <div className="flex h-[520px] items-center justify-center text-[10px] font-mono uppercase tracking-[0.18em] text-text-primary/25">
            Rendering page
          </div>
        )}
        {error && (
          <div className="p-8 text-center text-sm text-red-200/80">
            {error}
          </div>
        )}
        <canvas ref={canvasRef} className="block max-w-full" aria-label={`PDF page ${pageNumber}`} />
      </div>
    </article>
  );
}

function ReaderMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/30">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm text-text-primary/75">{value || "-"}</div>
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
      return ["read", "longer", "evaluation", "chart", "archive", "brain"].includes(tab) ? tab : "read";
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
      const [
        latestRes,
        eventRiskRes,
        operationalRes,
        ledgerRes,
        archiveRes,
      ] = await Promise.allSettled([
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
      setOperationalHealth(
        operationalRes.status === "fulfilled" ? operationalRes.value : null,
      );
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
  const workspaceTabs = [
    {
      key: "read",
      icon: "01",
      eyebrow: "Today",
      label: "Market Outlook",
      description: "24h direction, exposure guide, levels, and risk.",
    },
    {
      key: "longer",
      icon: "02",
      eyebrow: "7d · 30d",
      label: "Longer View",
      description: "Swing context and holder backdrop.",
    },
    {
      key: "evaluation",
      icon: "03",
      eyebrow: "Audit",
      label: "Projection Audit",
      description: "Projected level, result, and explanation.",
    },
    {
      key: "chart",
      icon: "04",
      eyebrow: "Context",
      label: "Projection Chart",
      description: "Live candles with projection overlay.",
    },
    {
      key: "archive",
      icon: "05",
      eyebrow: "Library",
      label: "Report Library",
      description: "Archived outlooks and PDF guide.",
    },
    {
      key: "brain",
      icon: "06",
      eyebrow: "Learning",
      label: "AI Brain",
      description: "Lessons the AI learned from its own audited calls.",
    },
  ];

  return (
    <div
      className="min-h-screen overflow-x-clip text-text-primary"
      style={{
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1760px] space-y-6 px-4 py-8 md:px-6 xl:px-10">
        <PageHeader
          report={report}
          healthStatus={healthStatus}
          onRefresh={() => loadAll(true)}
          refreshing={refreshing}
        />

        <WorkspaceTabs
          activeTab={activeWorkspace}
          onChange={setActiveWorkspace}
          tabs={workspaceTabs}
        />

        {activeWorkspace === "read" && <TheRead data={report} />}

        {activeWorkspace === "longer" && <LongerView data={report} />}

        {activeWorkspace === "evaluation" && (
          <VerdictLedger
            ledger={ledger}
            pageSize={8}
          />
        )}

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

        <ReportPdfModal modal={pdfModal} onClose={closePdfModal} />

        <footer className="border-t border-white/[0.06] pt-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] leading-relaxed text-text-muted/40">
            LuxQuant BTC Compass · decision support only, not financial advice
          </p>
        </footer>
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="ai-research" />
    </div>
  );
}
