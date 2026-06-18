import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getEventRisk,
  getLatestReport,
  getLedger,
  getOperationalHealth,
  getReportArchive,
  getReportPdfBlob,
  getTrackRecord,
} from "../services/aiArenaV6Api";

import CompassBrief from "./aiArenaV6/CompassBrief";
import PriceChart from "./aiArenaV6/PriceChart";
import VerdictLedger from "./aiArenaV6/VerdictLedger";

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
  return "border-white/10 bg-white/5 text-white/45";
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

function PageHeader({ report, healthStatus, onRefresh, refreshing }) {
  return (
    <header className="border-b border-white/[0.06] pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
              BTC Compass
            </span>
            <span
              className={`rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${statusTone(healthStatus)}`}
            >
              {healthStatus === "healthy" ? "Data healthy" : "Data needs check"}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white md:text-5xl">
            Market read, simplified
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
            Start with the stance, then read the reason, price areas, and
            invalidation. Technical source detail stays behind the scenes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono text-xs">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/30">
              Updated
            </div>
            <div className="text-white/65">{formatAge(report?.timestamp)}</div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2"
          style={{
            borderColor: "rgba(255,255,255,0.1)",
            borderTopColor: "#d4a853",
          }}
        />
        <p className="font-mono text-sm text-white/45">
          Building the latest Compass read...
        </p>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-6 text-center">
        <h3 className="text-lg font-medium text-white/85">
          Compass read could not load
        </h3>
        <p className="mt-2 text-sm leading-6 text-white/45">
          {error || "The latest market read is temporarily unavailable."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75 hover:bg-white/[0.08]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function WorkspaceTabs({ activeTab, onChange, tabs }) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#0d0d12]/70 p-1.5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className={`grid gap-1.5 ${tabs.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`group relative flex min-h-[74px] items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                active
                  ? "border-[#d4a853]/35 bg-[#d4a853]/10 text-white shadow-[0_0_0_1px_rgba(212,168,83,0.05)_inset]"
                  : "border-white/[0.06] bg-black/10 text-white/45 hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-white/70"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border font-mono text-sm ${
                  active
                    ? "border-[#d4a853]/35 bg-[#d4a853]/12 text-[#f5c451]"
                    : "border-white/[0.08] bg-white/[0.02] text-white/35 group-hover:text-white/65"
                }`}
              >
                {tab.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
                  {tab.eyebrow}
                </span>
                <span className="mt-1 block text-sm font-semibold">{tab.label}</span>
                <span className="mt-1 block text-xs leading-5 text-white/40">{tab.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ChartPanel({ report }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
            Price context
          </div>
          <h2 className="mt-1 text-xl font-medium text-white/90 md:text-2xl">
            BTC projection chart
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">
            Candles confirm where price is trading now. Compass projection adds magnets,
            zones, and invalidation so the trader can see why a bearish or bullish read
            may target a specific area.
          </p>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-right font-mono text-[10px] text-white/35">
          <div className="uppercase tracking-[0.14em]">Chart basis</div>
          <div className="mt-1 text-white/60">Live BTC candles + Compass report</div>
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
  if (value === "bullish") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (value === "bearish") return "border-red-400/20 bg-red-400/10 text-red-300";
  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

function readableLabel(value) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ReportArchivePanel({ archive, loadingId, error, onOpenPdf }) {
  const items = archive?.items || [];
  const readyCount = items.filter((item) => item.pdf_ready).length;
  const latest = items[0];

  if (!archive) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 p-6 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
          Report library
        </div>
        <h2 className="mt-1 text-2xl font-medium text-white/90">PDF archive is unavailable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">
          The report itself is still saved in the database. The PDF catalog endpoint may need subscription auth or the PDF generator dependency on the server.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="border-b border-white/[0.06] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
              Report library
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-white md:text-3xl">
              Saved Compass PDFs
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              Every market read is archived as a readable PDF. Open one report to review the stance, projection, magnets, levels, risk, and quality audit without exposing raw data-source plumbing.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right font-mono text-xs">
            <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Reports</div>
              <div className="mt-1 text-white/80">{items.length}</div>
            </div>
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">PDF ready</div>
              <div className="mt-1 text-emerald-300">{readyCount}</div>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-white/30">Latest</div>
              <div className="mt-1 text-white/65">{latest ? formatAge(latest.timestamp) : "-"}</div>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200/85">
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
        {items.map((item) => {
          const loading = loadingId === item.report_id;
          const direction = item.tactical_24h?.direction;
          const confidence = item.tactical_24h?.confidence;
          return (
            <article
              key={item.report_id}
              className="group rounded-xl border border-white/[0.07] bg-black/20 p-4 transition hover:border-[#d4a853]/30 hover:bg-[#d4a853]/[0.035]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/35">
                      {formatDateTime(item.timestamp)}
                    </span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] ${directionClasses(direction)}`}>
                      {readableLabel(direction)} {confidence ?? "-"}%
                    </span>
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-white/40">
                      {formatMoney(item.btc_price)}
                    </span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-white/90">
                    {item.headline || "Compass report"}
                  </h3>
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${
                    item.pdf_ready
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                      : "border-amber-300/20 bg-amber-300/10 text-amber-200"
                  }`}
                >
                  {item.pdf_ready ? "PDF ready" : "PDF pending"}
                </span>
              </div>

              <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/45">
                {item.summary || item.tactical_24h?.rationale || "Archived Compass report with full breakdown."}
              </p>

              <div className="mt-4 grid gap-2 text-xs md:grid-cols-3">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">Magnet below</div>
                  <div className="mt-1 font-mono text-white/70">{formatMoney(item.nearest_magnet_below)}</div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">Magnet above</div>
                  <div className="mt-1 font-mono text-white/70">{formatMoney(item.nearest_magnet_above)}</div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">Risk</div>
                  <div className="mt-1 font-mono text-white/70">{readableLabel(item.event_risk)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <div className="font-mono text-[10px] text-white/35">
                  {item.pdf_ready ? `${formatBytes(item.pdf_size_bytes)} archived` : item.pdf_error || "Generator pending"}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPdf(item)}
                  disabled={loading}
                  className="rounded-lg border border-[#d4a853]/25 bg-[#d4a853]/10 px-4 py-2 text-sm font-semibold text-[#f5c451] transition hover:border-[#d4a853]/45 hover:bg-[#d4a853]/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {loading ? "Opening..." : "Open PDF"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="p-8 text-center text-sm text-white/40">
          No archived Compass reports yet. The next scheduled report will create the first PDF.
        </div>
      )}
    </section>
  );
}

function ReportPdfModal({ modal, onClose }) {
  if (!modal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-3 py-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0b090c] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
              Compass PDF preview
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-white/90 md:text-lg">
              {modal.title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={modal.url}
              download={modal.filename || "compass-report.pdf"}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.08]"
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.08]"
            >
              Close
            </button>
          </div>
        </div>
        <iframe
          title={modal.title || "Compass report PDF"}
          src={modal.url}
          className="h-full w-full bg-white"
        />
      </div>
    </div>
  );
}

export default function AIArenaPageV6() {
  const [report, setReport] = useState(null);
  const [eventRisk, setEventRisk] = useState(null);
  const [operationalHealth, setOperationalHealth] = useState(null);
  const [trackRecord, setTrackRecord] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [reportArchive, setReportArchive] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState("read");
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
        trackRecordRes,
        ledgerRes,
        archiveRes,
      ] = await Promise.allSettled([
        getLatestReport(),
        getEventRisk(),
        getOperationalHealth(),
        getTrackRecord({ days: 30 }),
        getLedger({ days: 1 }),
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
      setTrackRecord(trackRecordRes.status === "fulfilled" ? trackRecordRes.value : null);
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

  if (loading) {
    return (
      <div className="min-h-screen text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="min-h-screen text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
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
  const resetSince = startOfTodayIso();
  const resetLabel = `Today reset · ${todayLabel()}`;
  const workspaceTabs = [
    {
      key: "read",
      icon: "01",
      eyebrow: "Today",
      label: "Market Read",
      description: "24h stance, drivers, levels, risk, and holder context.",
    },
    {
      key: "evaluation",
      icon: "02",
      eyebrow: "Reset",
      label: "Evaluation",
      description: "Hit, miss, and pending table starting from today.",
    },
    {
      key: "chart",
      icon: "03",
      eyebrow: "Context",
      label: "BTC Chart",
      description: "Projection, magnets, zones, and price confirmation.",
    },
    {
      key: "archive",
      icon: "04",
      eyebrow: "Library",
      label: "Report PDFs",
      description: "Saved Compass reads with in-page PDF preview.",
    },
  ];

  return (
    <div
      className="min-h-screen text-white"
      style={{
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 md:px-6">
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

        {activeWorkspace === "read" && (
          <CompassBrief
            report={report}
            dashboardHealth={dashboardHealth}
            operationalHealth={operationalHealth}
            eventRisk={eventRisk}
          />
        )}

        {activeWorkspace === "evaluation" && (
          <VerdictLedger
            trackRecord={trackRecord}
            ledger={ledger}
            resetSince={resetSince}
            resetLabel={resetLabel}
            pageSize={8}
          />
        )}

        {activeWorkspace === "chart" && <ChartPanel report={report} />}

        {activeWorkspace === "archive" && (
          <ReportArchivePanel
            archive={reportArchive}
            loadingId={pdfLoadingId}
            error={pdfError}
            onOpenPdf={openReportPdf}
          />
        )}

        <ReportPdfModal modal={pdfModal} onClose={closePdfModal} />

        <footer className="border-t border-white/[0.06] pt-6 text-center">
          <p className="text-[11px] font-mono leading-relaxed text-white/30">
            LuxQuant BTC Compass. Decision support only, not financial advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
