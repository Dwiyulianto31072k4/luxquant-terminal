// src/components/admin/workspace/XApiSpendPanel.jsx
//
// LuxQuant — Management System › Marketing › X API spend & output.
//
// X publishes no billing API (GET /2/usage/tweets only reports the *read* cap,
// which is 0 for us since the posters never read). So spend is metered on our
// side: every create_tweet / media_upload the posters make writes a row into
// x_api_usage, priced from x_api_pricing — rates derived from the credit
// actually consumed between real auto-recharges, not guessed.
//
// The credit balance is a live ledger figure (real top-ups minus metered
// spend), so it moves with every post and is never typed in by hand.
//
// Charts follow the landing page's Performance section: Recharts, gold
// gradient area, dashed grid, dashed average reference line.
//
// Data: workspaceApi.getXUsageSummary(days) / getXUsageRecent / getXUsageTopups
// Backend: /api/v1/workspace/x-usage/* (admin-only)

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { workspaceApi } from "../../../services/workspaceApi";

const RANGES = [7, 30, 90, 180];

// same palette the landing Performance chart uses
const C = {
  gold: "#e7c373",
  goldSolid: "rgb(var(--accent))",
  dim: "#b8893c",
  loss: "#f87171",
  muted: "#8a8f9c",
};

const fmtUSD = (n) => {
  const v = Number(n || 0);
  if (v === 0) return "$0.00";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(5)}`;
  if (Math.abs(v) < 1) return `$${v.toFixed(3)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtDay = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const fmtMonth = (s) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const XIcon = ({ size = 16, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const EVENT_LABELS = {
  tp2: "TP2 hit",
  tp3: "TP3 hit",
  tp4: "TP4 hit",
  closed_win: "Closed win",
  win_streak: "Win streak",
  daily_recap: "Daily recap",
  unknown: "Uncategorised",
};

const Card = ({ label, value, sub, accent, warn }) => (
  <div
    className="rounded-xl p-3.5"
    style={{
      background: warn ? "rgb(var(--neg) / 0.05)" : "rgb(var(--ink) / 0.02)",
      border: `1px solid ${warn ? "rgb(var(--neg) / 0.22)" : "rgb(var(--ink) / 0.06)"}`,
    }}
  >
    <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
      {label}
    </p>
    <p
      className="mt-1.5 font-mono text-xl font-semibold tabular-nums"
      style={{ color: accent || "rgb(var(--fg))" }}
    >
      {value}
    </p>
    {sub && <p className="mt-1 font-mono text-[10px] text-text-primary/40">{sub}</p>}
  </div>
);

/* ── chart tooltip, styled like the landing chart ─────────────────── */

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 font-mono text-[10px]"
      style={{
        background: "rgb(var(--surface-secondary))",
        border: "1px solid rgb(var(--ink) / 0.12)",
        color: "rgb(var(--fg))",
      }}
    >
      <p className="mb-1 text-text-primary/60">{fmtDay(label)}</p>
      <p className="tabular-nums" style={{ color: C.gold }}>
        {fmtUSD(d.cost)} spent
      </p>
      <p className="tabular-nums text-text-primary/70">{fmtNum(d.posts)} posts</p>
      {d.failed > 0 && (
        <p className="tabular-nums" style={{ color: C.loss }}>
          {fmtNum(d.failed)} failed
        </p>
      )}
      {!d.exact && <p className="mt-1 text-text-primary/35">reconstructed</p>}
    </div>
  );
};

/* ── live credit ledger ───────────────────────────────────────────── */

const CreditLedger = ({ runway, burn }) => {
  const bal = runway?.credit_balance;
  if (bal == null) return null;
  const low = runway?.days != null && runway.days < 14;

  return (
    <div
      className="grid gap-3 rounded-xl p-3.5 sm:grid-cols-3"
      style={{
        background: low ? "rgb(var(--neg) / 0.05)" : "rgb(var(--ink) / 0.02)",
        border: `1px solid ${low ? "rgb(var(--neg) / 0.22)" : "rgb(var(--ink) / 0.06)"}`,
      }}
    >
      <div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
          Credit balance · live
        </p>
        <p
          className="mt-1.5 font-mono text-2xl font-semibold tabular-nums"
          style={{ color: low ? "rgb(var(--neg-text))" : "rgb(var(--fg))" }}
        >
          {fmtUSD(bal)}
        </p>
        <p className="mt-1 font-mono text-[10px] text-text-primary/40">
          {fmtUSD(runway.topups_total)} topped up − {fmtUSD(runway.spend_total)} used
        </p>
      </div>
      <div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
          Runway
        </p>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-text-primary">
          {runway.days != null ? `${runway.days}d` : "—"}
        </p>
        <p className="mt-1 font-mono text-[10px] text-text-primary/40">
          at {fmtUSD(burn)}/day
        </p>
      </div>
      <div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
          Next auto-recharge
        </p>
        <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-text-primary">
          {runway.next_topup_on ? fmtDay(runway.next_topup_on) : "—"}
        </p>
        <p className="mt-1 font-mono text-[10px] text-text-primary/40">
          {fmtUSD(runway.recharge_amount)} charged at {fmtUSD(runway.recharge_trigger)}
        </p>
      </div>
    </div>
  );
};

/* ── main panel ───────────────────────────────────────────────────── */

export function XApiSpendPanel() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r, t] = await Promise.all([
        workspaceApi.getXUsageSummary(days),
        workspaceApi.getXUsageRecent(40),
        workspaceApi.getXUsageTopups(40),
      ]);
      setSummary(s);
      setRecent(r.items || []);
      setTopups(t.items || []);
    } catch {
      setError("Failed to load X usage data.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // the posters write continuously — keep the panel live
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const daily = summary?.daily || [];
  const avgCost = useMemo(
    () => (daily.length ? daily.reduce((s, d) => s + d.cost, 0) / daily.length : 0),
    [daily],
  );
  const maxEvent = Math.max(1, ...(summary?.by_event || []).map((e) => e.posts));

  const cyc = summary?.cycle || {};
  const cycPct = cyc.total_days ? Math.min(100, (cyc.elapsed_days / cyc.total_days) * 100) : 0;
  const currentPrice = (summary?.pricing || []).find(
    (p) => p.kind === "PostCreate" && !p.to,
  );

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "rgb(var(--ink) / 0.06)",
              border: "1px solid rgb(var(--ink) / 0.1)",
              color: "rgb(var(--fg))",
            }}
          >
            <XIcon size={16} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "rgba(138,138,147,0.7)" }}
            >
              Live Meter
            </p>
            <h3 className="text-base font-semibold tracking-tight text-text-primary">
              X API Spend &amp; Output
            </h3>
            <p className="mt-0.5 text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
              Priced from the credit X actually consumed — no billing API needed.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-full p-1"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.08)",
            }}
          >
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
                  days === d
                    ? "bg-accent font-semibold text-accent-fg"
                    : "text-text-primary/50 hover:text-text-primary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/60 transition-all hover:bg-ink/5 hover:text-text-primary"
            style={{ border: "1px solid rgb(var(--ink) / 0.08)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-loss">{error}</p>}
      {loading && !summary && (
        <p className="font-mono text-xs text-text-primary/40">Loading X usage…</p>
      )}

      {summary?.available && (
        <>
          {/* headline */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Card
              label="Today"
              value={fmtUSD(summary.today.cost)}
              sub={`${fmtNum(summary.today.posts)} posts`}
              accent="rgb(var(--accent-text))"
            />
            <Card
              label="This cycle"
              value={fmtUSD(cyc.spend)}
              sub={`${fmtNum(cyc.posts)} posts · ${cyc.days_remaining}d left`}
            />
            <Card
              label="Cycle projected"
              value={fmtUSD(cyc.projected)}
              sub={`at ${fmtUSD(cyc.burn_per_day)}/day`}
            />
            <Card
              label="Run rate / mo"
              value={fmtUSD(summary.run_rate_monthly)}
              sub="30d average"
            />
            <Card
              label="Rate / post"
              value={currentPrice ? `$${currentPrice.unit_usd.toFixed(5)}` : "—"}
              sub={currentPrice ? `since ${fmtDay(currentPrice.from)}` : ""}
            />
            <Card
              label="Lifetime"
              value={fmtUSD(summary.lifetime.cost)}
              sub={`${fmtNum(summary.lifetime.posts)} posts since Mar 26`}
            />
          </div>

          <CreditLedger runway={summary.runway} burn={cyc.burn_per_day} />

          {/* cycle progress */}
          <div
            className="rounded-xl p-3.5"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
                Billing cycle {fmtDay(cyc.start)} → {fmtDay(cyc.end)}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-text-primary/50">
                day {cyc.elapsed_days} of {cyc.total_days} · {fmtUSD(cyc.spend)} spent
              </p>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: "rgb(var(--ink) / 0.07)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${cycPct}%`, background: "rgb(var(--accent))" }}
              />
            </div>
          </div>

          {/* daily spend — landing-style area chart */}
          <div
            className="rounded-xl p-3.5"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
                Daily spend — last {days} days
              </p>
              <p className="font-mono text-[9.5px] text-text-primary/35">
                avg {fmtUSD(avgCost)}/day
              </p>
            </div>
            <div className="h-56 w-full lg:h-64">
              {daily.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={daily} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="xSpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.gold} stopOpacity={0.26} />
                        <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgb(var(--ink) / 0.05)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke={C.muted}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.ceil(daily.length / 7)}
                      dy={8}
                      minTickGap={24}
                      tickFormatter={fmtDay}
                    />
                    <YAxis
                      stroke={C.muted}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v.toFixed(1)}`}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: "rgb(var(--ink) / 0.12)" }} />
                    <ReferenceLine
                      y={avgCost}
                      stroke="rgba(231,195,115,0.3)"
                      strokeDasharray="4 4"
                    />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke={C.gold}
                      strokeWidth={1.8}
                      fill="url(#xSpendFill)"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="font-mono text-xs text-text-primary/40">No usage recorded yet.</p>
              )}
            </div>
          </div>

          {/* posts per day */}
          <div
            className="rounded-xl p-3.5"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            <p className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
              Posts published — last {days} days
            </p>
            <div className="h-40 w-full">
              {daily.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgb(var(--ink) / 0.05)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      stroke={C.muted}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.ceil(daily.length / 7)}
                      dy={8}
                      minTickGap={24}
                      tickFormatter={fmtDay}
                    />
                    <YAxis stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgb(var(--ink) / 0.04)" }} />
                    <Bar
                      dataKey="posts"
                      fill={C.dim}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* post mix */}
            <div>
              <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
                What we spend it on — last {days} days
              </p>
              <div
                className="space-y-2 rounded-xl p-3.5"
                style={{
                  background: "rgb(var(--ink) / 0.02)",
                  border: "1px solid rgb(var(--ink) / 0.06)",
                }}
              >
                {(summary.by_event || []).length === 0 ? (
                  <p className="font-mono text-xs text-text-primary/40">No data</p>
                ) : (
                  summary.by_event.map((e) => (
                    <div key={e.event}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[10.5px] text-text-primary/75">
                          {EVENT_LABELS[e.event] || e.event}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-primary/50">
                          {fmtNum(e.posts)} · {fmtUSD(e.cost)}
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full"
                        style={{ background: "rgb(var(--ink) / 0.07)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(e.posts / maxEvent) * 100}%`,
                            background: "rgb(var(--accent) / 0.75)",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* monthly */}
            <div>
              <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
                Monthly history
              </p>
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid rgb(var(--ink) / 0.06)" }}
              >
                <table className="w-full text-left">
                  <thead>
                    <tr
                      className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40"
                      style={{
                        background: "rgb(var(--ink) / 0.02)",
                        borderBottom: "1px solid rgb(var(--ink) / 0.06)",
                      }}
                    >
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Posts</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.monthly || []).map((m) => (
                      <tr
                        key={m.month}
                        className="font-mono text-[11px] text-text-primary/80"
                        style={{ borderBottom: "1px solid rgb(var(--ink) / 0.03)" }}
                      >
                        <td className="px-3 py-2">{fmtMonth(m.month)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.posts)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* rate card */}
          {(summary.pricing || []).length > 0 && (
            <div
              className="rounded-xl p-3.5"
              style={{
                background: "rgb(var(--ink) / 0.02)",
                border: "1px solid rgb(var(--ink) / 0.06)",
              }}
            >
              <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45">
                Rate card in effect
              </p>
              <div className="space-y-1.5">
                {summary.pricing.map((p, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 font-mono text-[10.5px]"
                  >
                    <span className="text-text-primary/70">
                      {p.kind === "PostCreate" ? "Tweet create" : "Media upload"}{" "}
                      <span className="text-text-primary/40">
                        {fmtDay(p.from)} → {p.to ? fmtDay(p.to) : "now"}
                      </span>
                    </span>
                    <span className="tabular-nums text-text-primary/85">
                      ${p.unit_usd.toFixed(6)}
                      {p.unit_usd === 0 && (
                        <span className="ml-1.5 text-text-primary/40">not billed</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* efficiency line */}
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-3.5 py-3"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            <span className="font-mono text-[10px] text-text-primary/45">
              {fmtNum(summary.signals_covered)} signals covered in {days}d
            </span>
            <span className="font-mono text-[10px] text-text-primary/45">
              {fmtUSD(summary.cost_per_signal)} per signal
            </span>
            <span className="font-mono text-[10px] text-text-primary/45">
              {fmtNum(summary.range.media)} media uploads (not billed)
            </span>
            {summary.range.failed > 0 && (
              <span className="font-mono text-[10px]" style={{ color: "rgb(var(--neg-text))" }}>
                {fmtNum(summary.range.failed)} failed calls
              </span>
            )}
          </div>

          {/* logs */}
          <div>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-primary/45 hover:text-text-primary"
            >
              {showLog ? "▾" : "▸"} Live call log ({recent.length}) &amp; top-ups ({topups.length})
            </button>
            {showLog && (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div
                  className="max-h-64 overflow-auto rounded-xl"
                  style={{ border: "1px solid rgb(var(--ink) / 0.06)" }}
                >
                  <table className="w-full text-left">
                    <thead>
                      <tr
                        className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40"
                        style={{
                          background: "rgb(var(--ink) / 0.02)",
                          borderBottom: "1px solid rgb(var(--ink) / 0.06)",
                        }}
                      >
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Endpoint</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-4 text-center font-mono text-xs text-text-primary/40"
                          >
                            No live calls metered yet
                          </td>
                        </tr>
                      ) : (
                        recent.map((c, i) => (
                          <tr
                            key={i}
                            className="font-mono text-[10.5px] text-text-primary/75"
                            style={{ borderBottom: "1px solid rgb(var(--ink) / 0.03)" }}
                          >
                            <td className="px-3 py-1.5 tabular-nums">
                              {new Date(c.ts).toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-3 py-1.5">
                              {c.endpoint}
                              {!c.ok && (
                                <span className="ml-1.5" style={{ color: "rgb(var(--neg-text))" }}>
                                  failed
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {fmtUSD(c.cost)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div
                  className="max-h-64 overflow-auto rounded-xl"
                  style={{ border: "1px solid rgb(var(--ink) / 0.06)" }}
                >
                  <table className="w-full text-left">
                    <thead>
                      <tr
                        className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40"
                        style={{
                          background: "rgb(var(--ink) / 0.02)",
                          borderBottom: "1px solid rgb(var(--ink) / 0.06)",
                        }}
                      >
                        <th className="px-3 py-2">Top-up</th>
                        <th className="px-3 py-2">Kind</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topups.map((t, i) => (
                        <tr
                          key={i}
                          className="font-mono text-[10.5px] text-text-primary/75"
                          style={{ borderBottom: "1px solid rgb(var(--ink) / 0.03)" }}
                        >
                          <td className="px-3 py-1.5 tabular-nums">
                            {new Date(t.ts).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })}
                          </td>
                          <td className="px-3 py-1.5 text-text-primary/50">
                            {t.kind}
                            {t.status !== "succeeded" && (
                              <span className="ml-1.5" style={{ color: "rgb(var(--neg-text))" }}>
                                {t.status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {fmtUSD(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
