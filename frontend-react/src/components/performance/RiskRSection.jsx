// src/components/performance/RiskRSection.jsx
// ════════════════════════════════════════════════════════════════
// Risk-Adjusted Performance — the full R breakdown the landing teaser
// promises behind "Unlock full breakdown".
//
// Everything here is in R: 1R = entry − stop, the risk each call sets for
// itself. That detaches every figure from account size and leverage, which
// is what makes a Bitcoin call and a micro-cap call comparable at all.
//
// Data: GET /api/v1/performance/r-metrics (signed-in users; cached 15 min
// server-side). Two populations, kept apart on purpose:
//   hit    — every call that reached a target or its stop (tp1..tp4, sl);
//            tp1–tp3 marked at the best target reached so far
//   closed — tp4 + sl only, every R realised. Its "win rate" is a TP4
//            completion rate, so the tile relabels itself in that mode.
//
// Every stat tile carries its own one-line reading, and the methodology
// block at the bottom says how each ratio is built — the numbers are only
// useful if a non-quant can read them.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

const API_BASE = "/api/v1";

const fmtR = (v, dp = 2) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(dp)}R`;
const fmtNum = (v) => (v == null ? "—" : Number(v).toLocaleString());

/* ── tiny building blocks, styled to match AnalyzePage ─────────── */

function Tile({ label, value, sub, tone = "default", big = false }) {
  const toneCls =
    tone === "profit"
      ? "text-profit"
      : tone === "loss"
        ? "text-loss"
        : tone === "gold"
          ? "text-accent-text"
          : "text-text-primary";
  return (
    <div className="rounded-xl border border-ink/[0.07] bg-surface-secondary/60 px-3.5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p
        className={`mt-1.5 font-mono font-bold leading-none tabular-nums ${big ? "text-[24px]" : "text-[19px]"} ${toneCls}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[10px] leading-snug text-text-muted">{sub}</p>}
    </div>
  );
}

function ChartTip({ active, payload, label, unit = "R" }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-ink/12 bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] shadow-lg">
      <div className="text-text-muted">{label}</div>
      <div className="text-text-primary">
        {p.value > 0 ? "+" : ""}
        {Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
        {unit}
      </div>
    </div>
  );
}

/* ── the section ───────────────────────────────────────────────── */

export default function RiskRSection() {
  const [population, setPopulation] = useState("hit");
  const [reports, setReports] = useState({}); // population -> report
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (reports[population]) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    const token = localStorage.getItem("access_token");
    fetch(`${API_BASE}/performance/r-metrics?population=${population}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 401 || r.status === 403) throw new Error("auth");
        if (!r.ok) throw new Error("fetch");
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        setReports((prev) => ({ ...prev, [population]: j }));
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [population, reports]);

  const r = reports[population];
  const closedMode = population === "closed";

  const monthly = useMemo(() => {
    if (!r?.monthly) return [];
    return r.monthly.map((m) => ({
      period: m.period,
      total_r: m.total_r,
      cumulative_r: m.cumulative_r,
    }));
  }, [r]);

  const outcomeRows = useMemo(() => {
    if (!r?.by_outcome) return [];
    const order = ["tp4", "tp3", "tp2", "tp1", "sl"];
    return order
      .filter((k) => r.by_outcome[k])
      .map((k) => ({ key: k.toUpperCase(), ...r.by_outcome[k] }));
  }, [r]);
  const maxAbsOutcome = Math.max(...outcomeRows.map((o) => Math.abs(o.total_r || 0)), 1);

  if (err === "auth") {
    return (
      <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-6 text-center">
        <p className="text-sm text-text-primary/70">Sign in to view the R breakdown.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised p-5">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-normal tracking-tight text-text-primary">
            Risk-Adjusted Performance
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
            every result in R · 1R = entry − stop
          </p>
        </div>
        {/* population toggle */}
        <div className="flex gap-1 rounded-sm border border-ink/[0.04] bg-surface-secondary p-1">
          {[
            { id: "hit", label: "Every hit" },
            { id: "closed", label: "Realized only" },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPopulation(p.id)}
              className={`rounded-sm px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                population === p.id
                  ? "bg-accent font-semibold text-accent-fg"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!r || loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-xl bg-ink/[0.04]" />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-text-muted">
            {closedMode
              ? "Realized only: calls that ran the whole ladder (TP4) or died at the stop. Every R here was actually bookable — nothing is marked at a level still in play."
              : "Every call that reached a target or its stop. Calls still sitting between targets are marked at the best level reached so far — an honest running score, not yet all realized."}
          </p>

          {/* verdict row */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile
              big
              label="Expectancy"
              value={fmtR(r.expectancy_r)}
              tone={r.expectancy_r > 0 ? "profit" : "loss"}
              sub="avg R returned per call — the number that decides if the edge is real"
            />
            <Tile
              big
              label={closedMode ? "TP4 completion" : "Win rate"}
              value={r.win_rate_pct != null ? `${r.win_rate_pct.toFixed(1)}%` : "—"}
              tone="gold"
              sub={
                closedMode
                  ? "tp4 ÷ (tp4 + sl) — not a win rate; TP1–TP3 wins are excluded here"
                  : `needs only ${r.breakeven_win_rate_pct?.toFixed(1)}% to break even — the gap is the edge`
              }
            />
            <Tile
              big
              label="Profit factor"
              value={r.profit_factor != null ? r.profit_factor.toFixed(2) : "—"}
              tone="profit"
              sub={`${fmtNum(Math.round(r.gross_win_r))}R won vs ${fmtNum(Math.round(r.gross_loss_r))}R lost`}
            />
            <Tile
              big
              label="Max drawdown"
              value={fmtR(r.max_drawdown_r, 0)}
              tone="loss"
              sub="deepest peak-to-trough of the R curve — size positions so you can sit through this"
            />
          </div>

          {/* ratio row */}
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Tile
              label="Sharpe (monthly)"
              value={r.monthly_sharpe_annualised != null ? r.monthly_sharpe_annualised.toFixed(2) : "—"}
              sub="mean ÷ stdev of monthly R, ×√12 — consistency, not size"
            />
            <Tile
              label="SQN"
              value={r.sqn != null ? r.sqn.toFixed(0) : "—"}
              sub="Van Tharp system-quality number — inflated by big samples, read as 'stable'"
            />
            <Tile
              label="Avg win / avg loss"
              value={`${fmtR(r.avg_win_r)} / ${fmtR(r.avg_loss_r)}`}
              sub="losses are capped at −1R by the stop; only the win side varies"
            />
            <Tile
              label="Total R"
              value={fmtR(r.total_r, 0)}
              sub={`${fmtNum(r.trades)} calls since ${r.window?.first_call?.slice(0, 10) || "—"}`}
            />
          </div>

          {/* cumulative R curve */}
          <div className="mt-4 rounded-xl border border-ink/[0.07] bg-surface-secondary/40 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Cumulative R
              </p>
              <p className="font-mono text-[10px] text-text-muted">
                {monthly.length} months
              </p>
            </div>
            <div className="h-44">
              <ResponsiveContainer>
                <AreaChart data={monthly} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rCumFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 9, fill: "rgb(var(--fg-muted))" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "rgb(var(--fg-muted))" }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip content={<ChartTip unit="R" />} />
                  <Area
                    type="monotone"
                    dataKey="cumulative_r"
                    stroke="rgb(var(--accent))"
                    strokeWidth={2}
                    fill="url(#rCumFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* monthly R + outcome contribution, side by side */}
          <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
            <div className="rounded-xl border border-ink/[0.07] bg-surface-secondary/40 p-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                R per month
              </p>
              <div className="h-36">
                <ResponsiveContainer>
                  <BarChart data={monthly} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 9, fill: "rgb(var(--fg-muted))" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "rgb(var(--fg-muted))" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip content={<ChartTip unit="R" />} />
                    <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.15)" />
                    <Bar dataKey="total_r" radius={[2, 2, 0, 0]} maxBarSize={14}>
                      {monthly.map((m) => (
                        <Cell
                          key={m.period}
                          fill={m.total_r >= 0 ? "rgb(var(--pos))" : "rgb(var(--neg))"}
                          fillOpacity={0.75}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-ink/[0.07] bg-surface-secondary/40 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Where the R comes from
              </p>
              <div className="space-y-2">
                {outcomeRows.map((o) => {
                  const neg = (o.total_r || 0) < 0;
                  const w = (Math.abs(o.total_r || 0) / maxAbsOutcome) * 100;
                  return (
                    <div key={o.key} className="flex items-center gap-2.5">
                      <span className="w-8 shrink-0 font-mono text-[10px] text-text-muted">
                        {o.key}
                      </span>
                      <div className="relative h-3 flex-1 overflow-hidden rounded-[3px] bg-ink/[0.05]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-[3px]"
                          style={{
                            width: `${w}%`,
                            background: neg ? "rgb(var(--neg) / 0.8)" : "rgb(var(--accent) / 0.8)",
                          }}
                        />
                      </div>
                      <span
                        className={`w-20 shrink-0 text-right font-mono text-[10px] tabular-nums ${neg ? "text-loss" : "text-text-primary"}`}
                      >
                        {fmtR(o.total_r, 0)}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[9px] text-text-muted">
                        {o.share_of_gross_win_pct != null ? `${o.share_of_gross_win_pct.toFixed(0)}%` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 border-t border-ink/[0.06] pt-2 text-[10px] leading-relaxed text-text-muted">
                Right column = share of gross R won. The back targets carry the book — exiting
                everything at TP1 would forfeit most of the edge.
              </p>
            </div>
          </div>

          {/* methodology */}
          <div className="mt-2.5 rounded-xl border border-ink/[0.06] bg-surface-secondary/30 p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              How to read these
            </p>
            <div className="grid gap-x-6 gap-y-1.5 text-[11px] leading-relaxed text-text-muted sm:grid-cols-2">
              <p>
                <span className="text-text-primary/85">R</span> — the risk each call sets for
                itself: 1R = entry − stop. +2R means the call paid twice what it risked.
              </p>
              <p>
                <span className="text-text-primary/85">Expectancy</span> — average R per call.
                Positive means the edge survives its losses; no position sizing can rescue a
                negative one.
              </p>
              <p>
                <span className="text-text-primary/85">Break-even win rate</span> — what this
                reward:risk shape demands just to stay flat. The distance between it and the
                actual rate is the whole edge.
              </p>
              <p>
                <span className="text-text-primary/85">Profit factor</span> — gross R won per 1R
                lost. Above 2 is strong; below 1 loses money.
              </p>
              <p>
                <span className="text-text-primary/85">Max drawdown</span> — worst run, in
                multiples of your per-call risk. Computed trade-by-trade in sequence; with many
                calls open at once the felt drawdown can run deeper.
              </p>
              <p>
                <span className="text-text-primary/85">Sharpe / SQN</span> — result ÷ volatility.
                High here partly reflects the huge sample and stops capping losses at −1R, so
                read them as "consistent", not as hedge-fund comparables.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
