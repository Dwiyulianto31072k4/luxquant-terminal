// frontend-react/src/components/aiArenaV6/VerdictLedger.jsx
// Compass 2.0 target-first evaluation table.
// Pagination + filtering are server-side: every page/filter change refetches
// /scenario-ledger with limit/offset/filter. Stats are global (whole ledger).

import React, { useEffect, useRef, useState } from "react";
import { getScenarioLedger } from "../../services/aiArenaV6Api";
import { formatPrice, formatTimestamp } from "./constants";

const DEFAULT_PAGE_SIZE = 8;

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function prettyToken(value) {
  if (!value) return "Pending";
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function outcomeTone(value) {
  const text = String(value || "PENDING").toUpperCase();
  if (["CLEAN_HIT", "RANGE_HELD", "PARTIAL_HIT"].includes(text)) {
    return "border-profit/25 bg-profit/10 text-profit";
  }
  if (["INVALIDATED_FIRST", "RANGE_BREAK_DOWN", "RANGE_BREAK_UP"].includes(text)) {
    return "border-loss/25 bg-loss/10 text-loss";
  }
  if (text.includes("PENDING") || text.includes("ACTIVE")) {
    return "border-gold-primary/20 bg-gold-primary/10 text-gold-primary/90";
  }
  return "border-amber-500/25 bg-amber-500/10 text-amber-400";
}

function biasTone(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("BULL") || text.includes("RISK_ON")) {
    return "text-profit";
  }
  if (text.includes("BEAR") || text.includes("RISK_OFF") || text.includes("DEFENSIVE")) {
    return "text-loss";
  }
  return "text-amber-400";
}

function asPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function buildProjected(item) {
  const bias = prettyToken(item.primary_bias);
  const touch = item.primary_touch?.level;
  const trigger = item.primary_touch?.trigger;
  const mode = prettyToken(item.market_mode);
  return {
    title: touch ? `${bias} toward ${formatPrice(touch)}` : `${bias} scenario`,
    meta: `${mode}${trigger ? ` · ${prettyToken(trigger)}` : ""}`,
  };
}

function buildResult(item) {
  const resolution = item.resolution;
  if (!resolution) {
    return {
      label: "Pending",
      meta: "Waiting for first barrier",
      tone: "PENDING",
    };
  }
  const move = asPercent(resolution.mfe_pct ?? resolution.mae_pct);
  return {
    label: prettyToken(resolution.outcome),
    meta: [
      resolution.first_barrier ? prettyToken(resolution.first_barrier) : null,
      resolution.first_barrier_price ? formatPrice(resolution.first_barrier_price) : null,
      move,
    ].filter(Boolean).join(" · "),
    tone: resolution.outcome,
  };
}

function buildExplanation(item) {
  const resolution = item.resolution;
  if (resolution?.interpretation) return resolution.interpretation;
  if (resolution?.reason_codes?.length) return resolution.reason_codes.map(prettyToken).join(", ");

  const touch = item.primary_touch?.level;
  const invalidation = item.invalidation?.level;
  const confirmation = item.confirmation?.level;
  if (!resolution) {
    return [
      touch ? `Projected touch is ${formatPrice(touch)}` : null,
      confirmation ? `confirmation near ${formatPrice(confirmation)}` : null,
      invalidation ? `invalidation near ${formatPrice(invalidation)}` : null,
    ].filter(Boolean).join("; ") || "Scenario is still active; result appears after a target, confirmation, or invalidation barrier resolves.";
  }

  return "Resolved by the first touched scenario barrier.";
}

function StatCard({ label, value, detail, tone = "neutral" }) {
  const toneClass =
    tone === "green"
      ? "border-profit/20 bg-profit/[0.05]"
      : tone === "red"
        ? "border-loss/20 bg-loss/[0.05]"
        : tone === "gold"
          ? "border-gold-primary/20 bg-gold-primary/[0.06]"
          : "border-white/[0.04] bg-[#120809]";

  return (
    <div className={cx("rounded-sm border p-4", toneClass)}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-light tabular-nums tracking-tight text-white">
        {value}
      </div>
      {detail && <div className="mt-1 text-xs leading-5 text-text-muted/60">{detail}</div>}
    </div>
  );
}

export default function VerdictLedger({ ledger, pageSize = DEFAULT_PAGE_SIZE }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(ledger || null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  // Keep in sync when the parent refreshes the initial payload.
  useEffect(() => {
    if (ledger && page === 1 && filter === "all") {
      setData(ledger);
    }
  }, [ledger]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Page 1 + "all" is already provided by the parent fetch on mount.
    const requestId = ++requestRef.current;
    setLoading(true);
    getScenarioLedger({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      filter,
    })
      .then((response) => {
        if (requestRef.current === requestId) setData(response);
      })
      .catch(() => {})
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }, [filter, page, pageSize]);

  const items = data?.items || [];
  const stats = data?.stats || {};
  const filteredTotal = data?.filtered_total ?? items.length;
  const total = data?.total ?? items.length;

  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const start = (page - 1) * pageSize;
  const visible = items.slice(0, pageSize);
  const hitRate = stats.hit_rate;

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <div className="border-b border-white/[0.06] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#d4a853]/75">
              Evaluation
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-white">
              Projection accountability table
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
              Every row is judged by the target-first scenario map: what BTC was projected
              to touch, which barrier resolved first, and why that result matters.
            </p>
          </div>

          <div className="rounded-sm border border-gold-primary/20 bg-gold-primary/[0.07] px-4 py-3 text-right">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#f5c451]">
              Current schema
            </div>
            <div className="mt-1 font-mono text-sm text-white">
              Target-first
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Reports" value={total} detail="All scenario rows" tone="gold" />
          <StatCard label="Pending" value={stats.pending ?? 0} detail="Still live" />
          <StatCard label="Resolved" value={stats.resolved ?? 0} detail="Barrier known" />
          <StatCard label="Clean hits" value={stats.clean_hits ?? 0} detail="Projection respected" tone="green" />
          <StatCard label="Invalidated" value={stats.invalidated_first ?? 0} detail="Thesis broke first" tone="red" />
          <StatCard
            label="Hit rate"
            value={hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}
            detail={`Scored barriers${stats.stale ? ` · ${stats.stale} stale excluded` : ""}`}
            tone="gold"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/15 px-4 py-3 md:px-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
          Showing <span className="text-white/65">{filteredTotal ? start + 1 : 0}-{Math.min(filteredTotal, start + visible.length)}</span> of <span className="text-white/65">{filteredTotal}</span>
          {loading && <span className="ml-2 text-gold-primary/70">loading…</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["resolved", "Resolved"],
            ["hit", "Hits"],
            ["miss", "Invalidated"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cx(
                "rounded-sm px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] transition",
                filter === key
                  ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/40"
                  : "border border-transparent text-white/45 hover:bg-white/[0.06] hover:text-white/75",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left">
              {["No", "Report ID", "Waktu", "Projected", "Result", "Explanation"].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-[10px] font-mono uppercase tracking-[0.16em] text-white/35"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((item, index) => {
              const projected = buildProjected(item);
              const result = buildResult(item);
              return (
                <tr key={item.projection_id || item.report_id} className="border-b border-white/[0.045] transition hover:bg-white/[0.025]">
                  <td className="px-4 py-4 align-top font-mono text-sm tabular-nums text-white/45">
                    {start + index + 1}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-mono text-xs text-white/75">{item.report_id || "-"}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
                      ID {item.projection_id || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top font-mono text-xs text-white/60">
                    {formatTimestamp(item.issued_at)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className={cx("text-sm font-semibold", biasTone(item.primary_bias))}>
                      {projected.title}
                    </div>
                    <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.08em] text-white/35">
                      {projected.meta}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className={cx("inline-flex rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em]", outcomeTone(result.tone))}>
                      {result.label}
                    </span>
                    {result.meta && (
                      <div className="mt-2 max-w-[190px] text-[11px] leading-5 text-white/38">
                        {result.meta}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="max-w-xl text-sm leading-6 text-white/58">
                      {buildExplanation(item)}
                    </p>
                    {!!(item.key_risks || []).length && !item.resolution && (
                      <div className="mt-2 text-[11px] leading-5 text-red-200/55">
                        Watch: {item.key_risks.slice(0, 2).join(" · ")}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!visible.length && (
        <div className="p-10 text-center">
          <div className="text-lg font-semibold text-white/80">No evaluation rows yet</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/45">
            The next BTC Compass scenario will create a projection row here, then the
            resolver will mark it pending, hit, or invalidated based on the first barrier.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-4 md:px-5">
        <p className="max-w-2xl text-[11px] leading-5 text-white/35">
          This table uses the new Compass 2.0 rulebook only. Old fixed-horizon history is not mixed into this scorecard.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
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
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
