// frontend-react/src/components/aiArenaV6/VerdictLedger.jsx
// Compass v2 — target-first evaluation table.
// Pagination + filtering are server-side: every page/filter change refetches
// /scenario-ledger with limit/offset/filter. Stats are global (whole ledger).

import React, { useEffect, useRef, useState } from "react";
import { getScenarioLedger } from "../../services/aiArenaV6Api";
import { formatPrice, formatTimestamp } from "./constants";
import {
  Card,
  Donut,
  GhostButton,
  highlightPrices,
  COLOR,
} from "./_ui";

const DEFAULT_PAGE_SIZE = 8;

const MODE_SHORT = {
  ALTCOIN_FRIENDLY: "Risk-on",
  SELECTIVE_RISK_ON: "Selective",
  BTC_ONLY_RISK_ON: "BTC-led",
  DEFENSIVE: "Defensive",
  EMERGENCY_DE_RISK: "Protect",
  CHOPPY_RANGE: "Range",
};

const RESULT_SHORT = {
  CLEAN_HIT: "Hit",
  LATE_HIT: "Late",
  RANGE_HELD: "Held",
  PARTIAL_HIT: "Partial",
  INVALIDATED_FIRST: "Miss",
  RANGE_BREAK_DOWN: "Broke ↓",
  RANGE_BREAK_UP: "Broke ↑",
  SUPERSEDED: "Replaced",
  PENDING: "Live",
};

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

function shortBias(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("BULL")) return "Bullish";
  if (text.includes("BEAR")) return "Bearish";
  if (text.includes("RISK_ON")) return "Risk-on";
  if (text.includes("RISK_OFF") || text.includes("DEFENSIVE")) return "Defensive";
  return prettyToken(value).replace(/ Continuation$/i, "") || "—";
}

function shortMode(value) {
  const key = String(value || "").toUpperCase();
  return MODE_SHORT[key] || prettyToken(value);
}

function outcomeTone(value) {
  const text = String(value || "PENDING").toUpperCase();
  if (["CLEAN_HIT", "LATE_HIT", "RANGE_HELD", "PARTIAL_HIT"].includes(text)) {
    return "border-profit/25 bg-profit/10 text-profit";
  }
  if (["INVALIDATED_FIRST", "RANGE_BREAK_DOWN", "RANGE_BREAK_UP"].includes(text)) {
    return "border-loss/25 bg-loss/10 text-loss";
  }
  if (text.includes("SUPERSEDED")) {
    return "border-ink/[0.08] bg-ink/[0.03] text-text-muted";
  }
  if (text.includes("PENDING") || text.includes("ACTIVE")) {
    return "border-ink/12 bg-ink/[0.06] text-text-primary";
  }
  return "border-accent/25 bg-accent/10 text-accent";
}

function biasTone(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("BULL") || text.includes("RISK_ON")) return "text-profit";
  if (text.includes("BEAR") || text.includes("RISK_OFF") || text.includes("DEFENSIVE"))
    return "text-loss";
  return "text-accent";
}

function asPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function compactTime(iso) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  const ageMin = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (ageMin < 60) return `${Math.max(1, ageMin)}m`;
  if (ageMin < 60 * 24) return `${Math.round(ageMin / 60)}h`;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function buildProjected(item) {
  const touch = item.primary_touch?.level;
  return {
    title: touch ? formatPrice(touch) : shortBias(item.primary_bias),
    meta: [shortBias(item.primary_bias), shortMode(item.market_mode)].filter(Boolean).join(" · "),
  };
}

function buildResult(item) {
  const resolution = item.resolution;
  if (!resolution) {
    if (String(item.status || "").toUpperCase() === "SUPERSEDED") {
      return { label: "Replaced", meta: "Not scored", tone: "SUPERSEDED" };
    }
    return { label: "Live", meta: null, tone: "PENDING" };
  }
  const key = String(resolution.outcome || "").toUpperCase();
  const move = asPercent(resolution.mfe_pct ?? resolution.mae_pct);
  return {
    label: RESULT_SHORT[key] || prettyToken(resolution.outcome),
    meta: [
      resolution.first_barrier ? prettyToken(resolution.first_barrier) : null,
      resolution.first_barrier_price ? formatPrice(resolution.first_barrier_price) : null,
      move,
    ]
      .filter(Boolean)
      .join(" · "),
    tone: resolution.outcome,
  };
}

function buildExplanation(item) {
  const resolution = item.resolution;
  if (resolution?.interpretation) return resolution.interpretation;
  if (resolution?.reason_codes?.length) return resolution.reason_codes.map(prettyToken).join(", ");
  if (item.headline) return item.headline;
  if (!resolution) {
    if (String(item.status || "").toUpperCase() === "SUPERSEDED") {
      return "Replaced by a newer read before a barrier — not scored.";
    }
    const invalidation = item.invalidation?.level;
    return invalidation
      ? `Waiting on first barrier · invalidation ${formatPrice(invalidation)}`
      : "Waiting on first barrier.";
  }
  return "Resolved by the first touched barrier.";
}

function MixBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  if (!total) return null;
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]"
      role="img"
      aria-label="Outcome mix"
    >
      {segments.map((s) =>
        s.value > 0 ? (
          <span
            key={s.label}
            className="h-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.hex }}
            title={`${s.label}: ${s.value}`}
          />
        ) : null
      )}
    </div>
  );
}

function ResultChip({ result }) {
  return (
    <span
      className={cx(
        "inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        outcomeTone(result.tone)
      )}
    >
      {result.label}
    </span>
  );
}

export default function VerdictLedger({ ledger, pageSize = DEFAULT_PAGE_SIZE }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(ledger || null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
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

  useEffect(() => {
    setPage(1);
    setOpenId(null);
  }, [filter]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const outcomeSegments = [
    {
      label: "Hits",
      value: Math.max(0, (stats.clean_hits ?? 0) - (stats.late_hits ?? 0)),
      hex: COLOR.profit,
    },
    { label: "Late hits", value: stats.late_hits ?? 0, hex: "#3a9d76" },
    { label: "Invalidated", value: stats.invalidated_first ?? 0, hex: COLOR.loss },
    { label: "Stale", value: stats.stale ?? 0, hex: "#8a7a6a" },
    { label: "Ambiguous", value: stats.ambiguous ?? 0, hex: COLOR.flat },
    { label: "Live", value: stats.pending ?? 0, hex: COLOR.gold },
  ];

  const kpis = [
    { label: "Reports", value: total, tone: "text-text-primary" },
    { label: "Live", value: stats.pending ?? 0, tone: "text-text-primary" },
    { label: "Resolved", value: stats.resolved ?? 0, tone: "text-text-primary" },
    { label: "Replaced", value: stats.superseded ?? 0, tone: "text-text-muted" },
    { label: "Hits", value: stats.clean_hits ?? 0, tone: "text-profit" },
    { label: "Miss", value: stats.invalidated_first ?? 0, tone: "text-loss" },
  ];

  const toggleRow = (id) => {
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <Card>
      <div className="border-b border-ink/[0.07] p-3 md:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-text-primary">
              Projection audit
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-text-muted">
              One live row. Hits and misses score · replaced reads do not.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Donut
              size={72}
              thickness={8}
              centerValue={hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}
              centerLabel="hit"
              segments={[
                { label: "Hits", value: stats.clean_hits ?? 0, hex: COLOR.profit },
                { label: "Invalidated", value: stats.invalidated_first ?? 0, hex: COLOR.loss },
                { label: "Live", value: stats.pending ?? 0, hex: COLOR.gold },
              ]}
            />
            <div className="hidden space-y-0.5 font-mono text-[10px] text-text-muted sm:block">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR.profit }} />
                Hits <span className="tabular-nums text-text-primary">{stats.clean_hits ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR.loss }} />
                Miss <span className="tabular-nums text-text-primary">{stats.invalidated_first ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR.gold }} />
                Live <span className="tabular-nums text-text-primary">{stats.pending ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-ink/[0.08] bg-ink/[0.06]">
          <div className="grid grid-cols-3 gap-px sm:grid-cols-6">
            {kpis.map((cell) => (
              <div key={cell.label} className="bg-surface-raised px-2.5 py-2">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {cell.label}
                </p>
                <p className={`mt-0.5 font-mono text-[16px] font-semibold tabular-nums leading-none ${cell.tone}`}>
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2.5">
          <MixBar segments={outcomeSegments} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.07] px-3 py-2 md:px-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          {filteredTotal ? start + 1 : 0}–{Math.min(filteredTotal, start + visible.length)} of{" "}
          {filteredTotal}
          {loading ? <span className="ml-2 text-accent">loading…</span> : null}
        </div>
        <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-ink/[0.08] bg-ink/[0.03] p-0.5">
          {[
            ["all", "All"],
            ["pending", "Live"],
            ["superseded", "Replaced"],
            ["resolved", "Resolved"],
            ["hit", "Hits"],
            ["miss", "Miss"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === key
                  ? "bg-surface-raised text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-10" />
            <col className="w-[9rem]" />
            <col className="w-[4.25rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[6.5rem]" />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-ink/[0.08] bg-surface-secondary/80 text-left">
              {["#", "Report", "Age", "Target", "Result", "Read"].map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted"
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
              const explanation = buildExplanation(item);
              const rowId = item.projection_id || item.report_id;
              const open = openId === rowId;
              return (
                <React.Fragment key={rowId}>
                  <tr
                    className="cursor-pointer border-b border-ink/[0.045] transition hover:bg-ink/[0.03]"
                    onClick={() => toggleRow(rowId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleRow(rowId);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-3 py-2 align-middle font-mono text-[12px] tabular-nums text-text-muted">
                      {start + index + 1}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div
                        className="truncate font-mono text-[12px] text-text-primary"
                        title={item.report_id || undefined}
                      >
                        {item.report_id || "—"}
                      </div>
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 align-middle font-mono text-[12px] tabular-nums text-text-muted"
                      title={formatTimestamp(item.issued_at)}
                    >
                      {compactTime(item.issued_at)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div
                        className={cx(
                          "font-mono text-[13px] font-semibold tabular-nums",
                          biasTone(item.primary_bias)
                        )}
                      >
                        {projected.title}
                      </div>
                      <div className="truncate font-mono text-[10px] text-text-muted" title={projected.meta}>
                        {projected.meta}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <ResultChip result={result} />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <p className="truncate text-[12.5px] leading-snug text-text-secondary" title={explanation}>
                        {highlightPrices(explanation)}
                      </p>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-ink/[0.045] bg-ink/[0.025]">
                      <td colSpan={6} className="px-3 py-2.5">
                        <RowDetail item={item} result={result} explanation={explanation} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={cx("space-y-2 p-3 md:hidden", loading && "opacity-50 transition-opacity")}>
        {visible.map((item, index) => {
          const projected = buildProjected(item);
          const result = buildResult(item);
          const explanation = buildExplanation(item);
          const rowId = item.projection_id || item.report_id;
          const open = openId === rowId;
          return (
            <button
              key={rowId}
              type="button"
              onClick={() => toggleRow(rowId)}
              className="block w-full rounded-xl border border-ink/[0.06] bg-surface-secondary p-3 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    #{start + index + 1}
                  </span>
                  <span className="truncate font-mono text-[11px] text-text-secondary">
                    {item.report_id || "—"}
                  </span>
                </div>
                <span
                  className="shrink-0 font-mono text-[10px] text-text-muted"
                  title={formatTimestamp(item.issued_at)}
                >
                  {compactTime(item.issued_at)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className={cx(
                      "font-mono text-[16px] font-semibold tabular-nums leading-none",
                      biasTone(item.primary_bias)
                    )}
                  >
                    {projected.title}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-text-muted">
                    {projected.meta}
                  </div>
                </div>
                <ResultChip result={result} />
              </div>

              <p className={cx("mt-2 text-[12.5px] leading-snug text-text-secondary", open ? "" : "line-clamp-2")}>
                {highlightPrices(explanation)}
              </p>
              {open ? (
                <div className="mt-2">
                  <RowDetail item={item} result={result} explanation={null} />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {!visible.length && !loading && (
        <div className="p-10 text-center">
          <div className="text-lg font-semibold text-text-primary">No evaluation rows yet</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-muted">
            The next BTC Compass scenario will create a projection row here, then the resolver will
            mark it live, hit, or miss based on the first barrier.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.06] px-3 py-2.5 md:px-4">
        <p className="text-[11px] text-text-muted">Target-first · Compass 2.0. Click a row for levels.</p>
        <div className="flex items-center gap-2">
          <GhostButton
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ← Prev
          </GhostButton>
          <span className="font-mono text-[11px] tabular-nums text-text-muted">
            Page {page} / {pageCount}
          </span>
          <GhostButton
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next →
          </GhostButton>
        </div>
      </div>
    </Card>
  );
}

function RowDetail({ item, result, explanation }) {
  const levels = [
    item.primary_touch?.level ? ["Target", formatPrice(item.primary_touch.level)] : null,
    item.confirmation?.level ? ["Confirm", formatPrice(item.confirmation.level)] : null,
    item.invalidation?.level ? ["Invalid.", formatPrice(item.invalidation.level)] : null,
    item.reference_price ? ["Ref", formatPrice(item.reference_price)] : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      {explanation ? (
        <p className="text-[12.5px] leading-5 text-text-secondary">{highlightPrices(explanation)}</p>
      ) : null}
      {result.meta ? (
        <p className="font-mono text-[11px] text-text-muted">{result.meta}</p>
      ) : null}
      {levels.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
          {levels.map(([label, value]) => (
            <span key={label} className="text-text-muted">
              {label} <span className="text-text-primary">{value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
