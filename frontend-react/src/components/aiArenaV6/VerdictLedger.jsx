// frontend-react/src/components/aiArenaV6/VerdictLedger.jsx
// Compass v2 — target-first evaluation table.
// Pagination + filtering are server-side: every page/filter change refetches
// /scenario-ledger with limit/offset/filter. Stats are global (whole ledger).

import React, { useEffect, useRef, useState } from "react";
import { getScenarioLedger } from "../../services/aiArenaV6Api";
import { formatPrice, formatTimestamp } from "./constants";
import { Card, SectionHeader, StatCard, OutcomeBar, Chip, Donut, GhostButton, COLOR } from "./_ui";

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
  if (["CLEAN_HIT", "LATE_HIT", "RANGE_HELD", "PARTIAL_HIT"].includes(text)) {
    return "border-profit/25 bg-profit/10 text-profit";
  }
  if (["INVALIDATED_FIRST", "RANGE_BREAK_DOWN", "RANGE_BREAK_UP"].includes(text)) {
    return "border-loss/25 bg-loss/10 text-loss";
  }
  if (text.includes("PENDING") || text.includes("ACTIVE")) {
    return "border-gold-primary/25 bg-gold-primary/10 text-gold-light";
  }
  return "border-amber-500/25 bg-amber-500/10 text-amber-400";
}

function biasTone(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("BULL") || text.includes("RISK_ON")) return "text-profit";
  if (text.includes("BEAR") || text.includes("RISK_OFF") || text.includes("DEFENSIVE")) return "text-loss";
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
    return { label: "Pending", meta: "Waiting for first barrier", tone: "PENDING" };
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

export default function VerdictLedger({ ledger, pageSize = DEFAULT_PAGE_SIZE }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(ledger || null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (ledger && page === 1 && filter === "all") {
      setData(ledger);
    }
  }, [ledger]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    getScenarioLedger({ limit: pageSize, offset: (page - 1) * pageSize, filter })
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

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const outcomeSegments = [
    { label: "Hits", value: Math.max(0, (stats.clean_hits ?? 0) - (stats.late_hits ?? 0)), hex: COLOR.profit },
    { label: "Late hits", value: stats.late_hits ?? 0, hex: "#3a9d76" },
    { label: "Invalidated", value: stats.invalidated_first ?? 0, hex: COLOR.loss },
    { label: "Stale", value: stats.stale ?? 0, hex: "#8a7a6a" },
    { label: "Ambiguous", value: stats.ambiguous ?? 0, hex: COLOR.flat },
    { label: "Tracking", value: stats.pending ?? 0, hex: COLOR.gold },
  ];

  return (
    <Card>
      {/* ── header ── */}
      <div className="border-b border-white/[0.06] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SectionHeader label="Evaluation · target-first" className="mb-2" />
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white md:text-3xl">
              Projection accountability
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Every row is judged by the target-first scenario map: what BTC was projected
              to touch, which barrier resolved first, and why that result matters.
            </p>
          </div>
          {/* landing-style win-rate donut */}
          <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-[#140b0d] px-5 py-3">
            <Donut
              size={118}
              thickness={11}
              centerValue={hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}
              centerLabel="hit rate"
              segments={[
                { label: "Hits", value: stats.clean_hits ?? 0, hex: COLOR.profit },
                { label: "Invalidated", value: stats.invalidated_first ?? 0, hex: COLOR.loss },
                { label: "Tracking", value: stats.pending ?? 0, hex: "rgba(212,168,83,0.45)" },
              ]}
            />
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-center gap-1.5 text-text-muted/80">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR.profit }} />
                Hits <span className="text-white">{stats.clean_hits ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5 text-text-muted/80">
                <span className="h-2 w-2 rounded-full" style={{ background: COLOR.loss }} />
                Invalidated <span className="text-white">{stats.invalidated_first ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5 text-text-muted/80">
                <span className="h-2 w-2 rounded-full bg-gold-primary/50" />
                Tracking <span className="text-white">{stats.pending ?? 0}</span>
              </div>
              <div className="pt-1 text-[9px] uppercase tracking-[0.14em] text-text-muted/50">Target-first schema</div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Reports" value={total} detail="All scenario rows" tone="gold" />
          <StatCard label="Tracking" value={stats.pending ?? 0} detail="Waiting for first barrier" />
          <StatCard label="Resolved" value={stats.resolved ?? 0} detail="Barrier known" />
          <StatCard
            label="Hits"
            value={stats.clean_hits ?? 0}
            detail={stats.late_hits ? `Direction right · ${stats.late_hits} late` : "Projection respected"}
            tone="up"
          />
          <StatCard label="Invalidated" value={stats.invalidated_first ?? 0} detail="Thesis broke first" tone="down" />
        </div>

        {/* outcome distribution */}
        <div className="mt-4">
          <OutcomeBar segments={outcomeSegments} />
        </div>
      </div>

      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-4 py-3 md:px-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/60">
          Showing <span className="text-white/70">{filteredTotal ? start + 1 : 0}-{Math.min(filteredTotal, start + visible.length)}</span> of <span className="text-white/70">{filteredTotal}</span>
          {loading && <span className="ml-2 text-gold-light/70">loading…</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["resolved", "Resolved"],
            ["hit", "Hits"],
            ["miss", "Invalidated"],
          ].map(([key, label]) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {/* ── table ── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left">
              {["No", "Report ID", "Time", "Projected", "Result", "Explanation"].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-[10px] font-mono uppercase tracking-[0.16em] text-text-muted/60"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {visible.map((item, index) => {
              const projected = buildProjected(item);
              const result = buildResult(item);
              return (
                <tr
                  key={item.projection_id || item.report_id}
                  className="border-b border-white/[0.045] transition hover:bg-gold-primary/[0.03]"
                >
                  <td className="px-4 py-4 align-top font-mono text-sm tabular-nums text-text-muted/60">
                    {start + index + 1}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-mono text-xs text-white/80">{item.report_id || "-"}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted/50">
                      {item.projection_id || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top font-mono text-xs text-white/60">
                    {formatTimestamp(item.issued_at)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className={cx("text-sm font-semibold", biasTone(item.primary_bias))}>
                      {projected.title}
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-muted/50">
                      {projected.meta}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className={cx("inline-flex rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em]", outcomeTone(result.tone))}>
                      {result.label}
                    </span>
                    {result.meta && (
                      <div className="mt-2 max-w-[190px] font-mono text-[10.5px] leading-4 text-text-muted/60">
                        {result.meta}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="max-w-xl text-[13px] leading-6 text-white/60">
                      {buildExplanation(item)}
                    </p>
                    {!!(item.key_risks || []).length && !item.resolution && (
                      <div className="mt-2 text-[11px] leading-5 text-loss/70">
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

      {!visible.length && !loading && (
        <div className="p-10 text-center">
          <div className="text-lg font-semibold text-white/80">No evaluation rows yet</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">
            The next BTC Compass scenario will create a projection row here, then the
            resolver will mark it pending, hit, or invalidated based on the first barrier.
          </p>
        </div>
      )}

      {/* ── footer / pagination ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-4 md:px-5">
        <p className="max-w-2xl text-[11px] leading-5 text-text-muted/50">
          This table uses the new Compass 2.0 rulebook only. Old fixed-horizon history is not mixed into this scorecard.
        </p>
        <div className="flex items-center gap-2">
          <GhostButton size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            ← Prev
          </GhostButton>
          <span className="font-mono text-[11px] tabular-nums text-text-muted/70">
            Page {page} / {pageCount}
          </span>
          <GhostButton size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
            Next →
          </GhostButton>
        </div>
      </div>
    </Card>
  );
}
