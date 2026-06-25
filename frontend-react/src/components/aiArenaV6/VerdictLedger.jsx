// frontend-react/src/components/aiArenaV6/VerdictLedger.jsx
// Compass 2.0 target-first evaluation ledger.

import React, { useEffect, useMemo, useState } from "react";
import { formatPrice, formatTimestamp } from "./constants";

const PAGE_SIZE = 6;

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return `${Math.round(Number(value) * 100)}%`;
}

function minutesLabel(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function biasTone(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("BULL") || text.includes("RISK_ON")) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (text.includes("BEAR") || text.includes("RISK_OFF")) {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }
  return "border-amber-300/20 bg-amber-300/10 text-amber-200";
}

function outcomeTone(value) {
  const text = String(value || "PENDING").toUpperCase();
  if (["CLEAN_HIT", "RANGE_HELD", "PARTIAL_HIT"].includes(text)) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  }
  if (["INVALIDATED_FIRST", "RANGE_BREAK_DOWN", "RANGE_BREAK_UP"].includes(text)) {
    return "border-red-400/25 bg-red-400/10 text-red-300";
  }
  if (text.includes("STALE") || text.includes("DATA")) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  }
  return "border-white/10 bg-white/[0.05] text-white/55";
}

function prettyToken(value) {
  if (!value) return "Pending";
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatCard({ label, value, sub, tone = "neutral" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/20 bg-emerald-400/[0.06]"
      : tone === "red"
        ? "border-red-400/20 bg-red-400/[0.06]"
        : tone === "gold"
          ? "border-[#d4a853]/25 bg-[#d4a853]/[0.07]"
          : "border-white/[0.07] bg-white/[0.025]";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-white">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-5 text-white/45">{sub}</div>}
    </div>
  );
}

function LevelTile({ label, level, trigger, tone = "neutral" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/18 bg-emerald-400/[0.055]"
      : tone === "red"
        ? "border-red-400/18 bg-red-400/[0.055]"
        : tone === "gold"
          ? "border-[#d4a853]/20 bg-[#d4a853]/[0.06]"
          : "border-white/[0.06] bg-white/[0.025]";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="mb-1 text-[9px] font-mono uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className="font-mono text-base font-semibold tabular-nums text-white">
        {formatPrice(level)}
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.08em] text-white/35">
        {prettyToken(trigger)}
      </div>
    </div>
  );
}

function ScenarioCard({ item }) {
  const outcome = item.resolution?.outcome || "PENDING";
  const probabilities = item.probabilities || {};
  const review = item.review_policy || {};

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-[#09090d]/75 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/35">
              {formatTimestamp(item.issued_at)}
            </span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${biasTone(item.primary_bias)}`}>
              {prettyToken(item.primary_bias)}
            </span>
            <span className="rounded-md border border-[#d4a853]/20 bg-[#d4a853]/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[#f5c451]">
              {prettyToken(item.market_mode)}
            </span>
          </div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-white md:text-2xl">
            {item.headline || "BTC scenario contract"}
          </h3>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
            <span>BTC at read: <span className="font-mono text-white/70">{formatPrice(item.reference_price)}</span></span>
            <span>Primary probability: <span className="font-mono text-white/70">{pct((probabilities.primary ?? 0) / 100)}</span></span>
            <span>Events logged: <span className="font-mono text-white/70">{item.events?.count ?? 0}</span></span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 text-left md:items-end md:text-right">
          <span className={`rounded-lg border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] ${outcomeTone(outcome)}`}>
            {prettyToken(outcome)}
          </span>
          <span className="text-[11px] text-white/35">
            First barrier decides the result
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-4">
        <LevelTile
          label="Projected touch"
          level={item.primary_touch?.level}
          trigger={item.primary_touch?.trigger}
          tone="gold"
        />
        <LevelTile
          label="Confirmation"
          level={item.confirmation?.level}
          trigger={item.confirmation?.trigger}
          tone="neutral"
        />
        <LevelTile
          label="Support / reaction"
          level={item.support?.level}
          trigger={item.support?.trigger}
          tone="green"
        />
        <LevelTile
          label="Invalidation"
          level={item.invalidation?.level}
          trigger={item.invalidation?.trigger}
          tone="red"
        />
      </div>

      <div className="grid gap-3 border-t border-white/[0.06] p-4 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/70">
            What must happen
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {(item.key_conditions || []).slice(0, 4).map((condition, index) => (
              <div key={`${condition}-${index}`} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-white/60">
                {condition}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-red-300/70">
            Risk watch
          </div>
          <div className="space-y-2">
            {(item.key_risks || []).slice(0, 3).map((risk, index) => (
              <div key={`${risk}-${index}`} className="rounded-xl border border-red-400/[0.12] bg-red-400/[0.045] p-3 text-xs leading-5 text-white/55">
                {risk}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 text-[11px] text-white/35">
        <div className="font-mono uppercase tracking-[0.12em]">
          Review: soft {minutesLabel(review.soft_review_after_minutes)} / stale {minutesLabel(review.stale_after_minutes)}
        </div>
        <div className="font-mono uppercase tracking-[0.12em]">
          ID {item.projection_id}
        </div>
      </div>
    </article>
  );
}

export default function VerdictLedger({ ledger }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const items = ledger?.items || [];
  const stats = ledger?.stats || {};

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "active") return items.filter((item) => item.status === "ACTIVE");
    if (filter === "resolved") return items.filter((item) => item.resolution);
    if (filter === "pending") return items.filter((item) => !item.resolution);
    if (filter === "hit") {
      return items.filter((item) => ["CLEAN_HIT", "RANGE_HELD", "PARTIAL_HIT"].includes(item.resolution?.outcome));
    }
    if (filter === "invalidated") {
      return items.filter((item) => item.resolution?.outcome === "INVALIDATED_FIRST");
    }
    return items;
  }, [filter, items]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter, items.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="space-y-5 rounded-3xl border border-white/[0.08] bg-[#0b0b10]/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#d4a853]/75">
            Compass 2.0 Evaluation
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">
            Scenario resolution, not old horizon scorekeeping
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            The old 24h/72h/7d/30d history has been retired because the schema changed.
            This page now tracks the live contract: projected touch, confirmation,
            invalidation, and which barrier resolves first.
          </p>
        </div>

        <div className="rounded-2xl border border-[#d4a853]/20 bg-[#d4a853]/[0.07] px-4 py-3 text-right">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#f5c451]">
            Reset
          </div>
          <div className="mt-1 font-mono text-sm text-white">
            Jun 25, 2026
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label="Contracts" value={ledger?.count ?? 0} sub="Compass 2.0 only" tone="gold" />
        <StatCard label="Active" value={stats.active ?? 0} sub="Still being watched" />
        <StatCard label="Resolved" value={stats.resolved ?? 0} sub="First barrier known" />
        <StatCard label="Clean hits" value={stats.clean_hits ?? 0} sub="Target/range respected" tone="green" />
        <StatCard label="Invalidated" value={stats.invalidated_first ?? 0} sub="Thesis broke first" tone="red" />
      </div>

      <div className="rounded-2xl border border-[#d4a853]/15 bg-[#d4a853]/[0.045] p-4">
        <div className="mb-2 text-sm font-medium text-white">
          New rulebook
        </div>
        <div className="grid gap-3 text-xs leading-5 text-white/55 md:grid-cols-3">
          <p>
            <span className="font-mono uppercase tracking-[0.12em] text-[#f5c451]">Target-first:</span>{" "}
            the read is judged by levels, not by waiting for a fixed final price.
          </p>
          <p>
            <span className="font-mono uppercase tracking-[0.12em] text-[#f5c451]">First barrier wins:</span>{" "}
            target/confirmation/invalidation order determines the result.
          </p>
          <p>
            <span className="font-mono uppercase tracking-[0.12em] text-[#f5c451]">Time is review:</span>{" "}
            stale time triggers a re-check, not an automatic miss.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/35">
              Scenario ledger
            </div>
            <div className="mt-1 text-sm text-white/70">
              {filtered.length} contract{filtered.length === 1 ? "" : "s"} shown
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              ["all", "All"],
              ["active", "Active"],
              ["pending", "Pending"],
              ["resolved", "Resolved"],
              ["hit", "Hits"],
              ["invalidated", "Invalidated"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] transition ${
                  filter === key
                    ? "bg-[#d4a853]/15 text-[#f5c451]"
                    : "text-white/45 hover:bg-white/[0.06] hover:text-white/75"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 p-4">
          {visible.length > 0 ? (
            visible.map((item) => <ScenarioCard key={item.projection_id} item={item} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-10 text-center">
              <div className="text-lg font-semibold text-white/80">
                No Compass 2.0 scenario history yet
              </div>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/45">
                The old horizon ledger has been cleared. The next scheduled BTC Compass
                read will create a new target-first contract here.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
          <p className="text-[11px] leading-5 text-white/35">
            Legacy retained audit is no longer shown here because it was judged by the old schema.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
            >
              Prev
            </button>
            <span className="font-mono text-[11px] text-white/40">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
