import React, { useCallback, useEffect, useState } from "react";
import {
  getEventRisk,
  getLatestReport,
  getLedger,
  getOperationalHealth,
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
              className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${statusTone(healthStatus)}`}
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
    <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/70 p-2 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="grid gap-2 md:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              activeTab === tab.key
                ? "border-[#d4a853]/35 bg-[#d4a853]/10 text-white"
                : "border-white/[0.06] bg-black/10 text-white/45 hover:bg-white/[0.04] hover:text-white/70"
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
              {tab.eyebrow}
            </div>
            <div className="mt-1 text-sm font-semibold">{tab.label}</div>
            <div className="mt-1 text-xs leading-5 text-white/40">{tab.description}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChartPanel() {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] md:p-5">
      <div className="mb-4">
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
          Price context
        </div>
        <h2 className="mt-1 text-xl font-medium text-white/90 md:text-2xl">
          BTC chart
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/40">
          Use the chart after reading the stance, not before. It is here to
          confirm context, not to overload the first impression.
        </p>
      </div>
      <PriceChart />
    </section>
  );
}

export default function AIArenaPageV6() {
  const [report, setReport] = useState(null);
  const [eventRisk, setEventRisk] = useState(null);
  const [operationalHealth, setOperationalHealth] = useState(null);
  const [trackRecord, setTrackRecord] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState("read");
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
      const [latestRes, eventRiskRes, operationalRes, trackRecordRes, ledgerRes] = await Promise.allSettled([
        getLatestReport(),
        getEventRisk(),
        getOperationalHealth(),
        getTrackRecord({ days: 30 }),
        getLedger({ days: 1 }),
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
      eyebrow: "Today",
      label: "Market Read",
      description: "24h stance, drivers, levels, risk, and holder context.",
    },
    {
      key: "evaluation",
      eyebrow: "Reset",
      label: "Evaluation",
      description: "Hit, miss, and pending table starting from today.",
    },
    {
      key: "chart",
      eyebrow: "Context",
      label: "BTC Chart",
      description: "Price confirmation after the read, not before it.",
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

        {activeWorkspace === "chart" && <ChartPanel />}

        <footer className="border-t border-white/[0.06] pt-6 text-center">
          <p className="text-[11px] font-mono leading-relaxed text-white/30">
            LuxQuant BTC Compass. Decision support only, not financial advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
