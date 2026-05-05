// frontend-react/src/components/AIArenaPageV6.jsx
/**
 * AI Arena v6 — Main Page
 * =======================
 * Wires together all v6 components into a single page.
 * Fetches: latest report, ledger (14d), track-record (30d).
 *
 * Layout (top to bottom):
 *   1. Header (title + last updated + cost badge)
 *   2. VerdictHero       — dual-horizon BLUF + invalidation
 *   3. CycleCompass      — visual gauge 0-100
 *   4. PriceChart        — [BATCH 2 placeholder]
 *   5. TripleScreen      — [BATCH 2 placeholder]
 *   6. ZonesToWatch      — [BATCH 2 placeholder]
 *   7. ThreeLayerConfluence — Macro / Smart / On-chain
 *   8. AIReasoningWalkthrough — 5-step CoT
 *   9. WhatChanged       — [BATCH 2 placeholder]
 *  10. VerdictLedger     — track record + history
 *  11. RiskWatch         — [BATCH 2 placeholder]
 *
 * v4 page (AIArenaPage.jsx) is left untouched. This page is wired
 * to a separate route /ai-arena/v6 so we can A/B during transition.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  fetchV6Latest,
  fetchV6Ledger,
  fetchV6TrackRecord,
} from "../services/aiArenaV6Api";

// V6 components (Batch 1)
import VerdictHero from "./aiArenaV6/VerdictHero";
import CycleCompass from "./aiArenaV6/CycleCompass";
import ThreeLayerConfluence from "./aiArenaV6/ThreeLayerConfluence";
import AIReasoningWalkthrough from "./aiArenaV6/AIReasoningWalkthrough";
import VerdictLedger from "./aiArenaV6/VerdictLedger";

// ─────────────────────────────────────────────────────────────────────
// Placeholder for Batch 2 components (will be replaced)
// ─────────────────────────────────────────────────────────────────────
function PlaceholderSection({ title, note }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-2xl text-white/90"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-white/40">
          Batch 2
        </span>
      </div>
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-8 text-center">
        <p className="text-white/40 text-sm italic mb-1">
          {note || "Component pending Batch 2 generation"}
        </p>
        <p className="text-[11px] font-mono text-white/25">
          Backend data is ready, UI scaffold incoming
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────
function PageHeader({ report, onRefresh, refreshing }) {
  const lastUpdate = report?.timestamp
    ? new Date(report.timestamp)
    : null;
  const ageMin = lastUpdate
    ? Math.round((Date.now() - lastUpdate.getTime()) / 60000)
    : null;

  const cost = report?.cost_breakdown?.total_usd;

  return (
    <header className="mb-6 pb-4 border-b border-white/5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245, 196, 81, 0.2), rgba(245, 196, 81, 0.05))",
                color: "#f5c451",
                border: "1px solid rgba(245, 196, 81, 0.3)",
              }}
            >
              v6.1
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
              BTC compass
            </span>
          </div>
          <h1
            className="text-3xl md:text-4xl text-white"
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 500,
              letterSpacing: "-0.025em",
            }}
          >
            AI Arena
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Multi-horizon synthesis of macro, derivatives, and on-chain
            intelligence
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          {ageMin !== null && (
            <div className="text-right">
              <div className="text-white/40 uppercase tracking-wider text-[10px]">
                Last update
              </div>
              <div className="text-white/70">
                {ageMin < 60
                  ? `${ageMin}m ago`
                  : `${Math.round(ageMin / 60)}h ago`}
              </div>
            </div>
          )}
          {cost != null && (
            <div className="text-right">
              <div className="text-white/40 uppercase tracking-wider text-[10px]">
                Cost
              </div>
              <div className="text-white/70">${cost.toFixed(4)}</div>
            </div>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-50 text-white/80"
          >
            {refreshing ? "..." : "↻ refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div
          className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-white/10 border-t-gold-primary animate-spin"
          style={{ borderTopColor: "#f5c451" }}
        />
        <p className="text-sm text-white/50 font-mono">
          Loading AI Arena v6...
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────
function ErrorState({ error, onRetry }) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-3">⚠</div>
        <h3 className="text-lg text-white/80 mb-2">Could not load report</h3>
        <p className="text-sm text-white/50 mb-4 font-mono">
          {error || "Unknown error"}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/80 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────
export default function AIArenaPageV6() {
  const [report, setReport] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [trackRecord, setTrackRecord] = useState(null);
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
      // Fetch in parallel
      const [latestRes, ledgerRes, trackRes] = await Promise.allSettled([
        fetchV6Latest(),
        fetchV6Ledger(14),
        fetchV6TrackRecord(30),
      ]);

      if (latestRes.status === "fulfilled") {
        setReport(latestRes.value);
      } else {
        // Latest is critical — surface error if it fails
        throw latestRes.reason || new Error("Failed to load latest report");
      }

      // Ledger and track-record are non-critical; degrade gracefully
      if (ledgerRes.status === "fulfilled") {
        setLedger(ledgerRes.value);
      } else {
        console.warn("[v6] ledger fetch failed:", ledgerRes.reason);
        setLedger({ reports: [] });
      }

      if (trackRes.status === "fulfilled") {
        setTrackRecord(trackRes.value);
      } else {
        console.warn("[v6] track-record fetch failed:", trackRes.reason);
        setTrackRecord({ window_days: 30, by_horizon: {}, total_evaluated: 0 });
      }
    } catch (e) {
      console.error("[v6] load error:", e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  // ───── Render states ─────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
          <ErrorState error={error} onRetry={() => loadAll(false)} />
        </div>
      </div>
    );
  }

  // ───── Pull v6 fields from report ─────
  // The /v6/latest endpoint returns the full report bundle.
  const verdict = report?.verdict || {};
  const layerBriefs = report?.layer_briefs || {};
  const reasoningChain = verdict?.reasoning_chain || [];
  const critique = report?.critique || null;
  const cycle = report?.cycle || {};
  const confluence = report?.confluence || {};
  const horizons = verdict?.horizons || {};
  const invalidation = verdict?.invalidation_levels || null;
  const headline = verdict?.headline || report?.headline || null;
  const narrative = verdict?.narrative || report?.narrative || null;

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      style={{
        fontFamily:
          'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <PageHeader
          report={report}
          onRefresh={() => loadAll(true)}
          refreshing={refreshing}
        />

        {/* 1. Verdict Hero — BLUF + dual horizon + invalidation */}
        <VerdictHero
          headline={headline}
          narrative={narrative}
          horizons={horizons}
          invalidation={invalidation}
          btcPrice={report?.btc_price}
          priceChange24h={report?.btc_change_24h}
        />

        {/* 2. Cycle Compass */}
        <CycleCompass
          score={cycle?.score}
          phase={cycle?.phase}
          confidence={cycle?.confidence}
          rationale={cycle?.rationale}
        />

        {/* 3. Price Chart — Batch 2 */}
        <PlaceholderSection
          title="Price Chart"
          note="BTC chart with EMA/VWAP, zone overlays, and triple-screen markers"
        />

        {/* 4. Triple Screen — Batch 2 */}
        <PlaceholderSection
          title="Triple Screen"
          note="1D / 4H / 1H trend states for multi-timeframe alignment"
        />

        {/* 5. Zones to Watch — Batch 2 */}
        <PlaceholderSection
          title="Zones to Watch"
          note="Demand · Fair · Supply zones derived from the verdict"
        />

        {/* 6. Three-Layer Confluence */}
        <ThreeLayerConfluence
          layerBriefs={layerBriefs}
          confluenceVerdict={confluence?.verdict}
        />

        {/* 7. AI Reasoning Walkthrough */}
        <AIReasoningWalkthrough
          reasoningChain={reasoningChain}
          critique={critique}
        />

        {/* 8. What Changed — Batch 2 */}
        <PlaceholderSection
          title="What Changed"
          note="Diff vs previous report: shifts in confluence, cycle, and verdict"
        />

        {/* 9. Verdict Ledger — KILLER FEATURE */}
        <VerdictLedger trackRecord={trackRecord} ledger={ledger} />

        {/* 10. Risk Watch — Batch 2 */}
        <PlaceholderSection
          title="Risk Watch"
          note="Specific scenarios that would invalidate the current verdict"
        />

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-white/5 text-center">
          <p className="text-[11px] font-mono text-white/30 leading-relaxed">
            LuxQuant AI Arena v6 · Multi-stage pipeline (GPT-4o-mini →
            DeepSeek R1 → GPT-4o) · Auto-refreshed every 6 hours · Not
            financial advice
          </p>
        </footer>
      </div>
    </div>
  );
}
