// src/components/DailyPerformancePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Daily Performance
// Per-day breakdown by HIT date (UTC) with BTC context, sector
// breakdown, important tags, and 14-day trend strip.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../services/analyticsApi";

// ─── Helpers ─────────────────────────────────────────────────────

const todayUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const fmtDateLong = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const fmtPct = (v, digits = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
};

const fmtDelta = (v) => {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
};

// ─── Token / Color helpers ───────────────────────────────────────

const outcomeToken = (outcome) => {
  switch (outcome) {
    case "tp4":
      return {
        label: "TP4",
        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      };
    case "tp3":
      return {
        label: "TP3",
        cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
      };
    case "tp2":
      return {
        label: "TP2",
        cls: "bg-emerald-500/8 text-emerald-400/90 border-emerald-500/20",
      };
    case "tp1":
      return {
        label: "TP1",
        cls: "bg-emerald-500/5 text-emerald-400/80 border-emerald-500/15",
      };
    case "sl":
      return {
        label: "SL",
        cls: "bg-red-500/15 text-red-300 border-red-500/30",
      };
    default:
      return {
        label: "—",
        cls: "bg-white/[0.04] text-white/50 border-white/[0.08]",
      };
  }
};

const ratingToken = (rating) => {
  const r = (rating || "").toUpperCase();
  if (r === "HIGH" || r === "STRONG") {
    return "text-gold-primary";
  }
  if (r === "MEDIUM" || r === "NORMAL") {
    return "text-white/70";
  }
  if (r === "AVOID" || r === "LOW") {
    return "text-white/40";
  }
  return "text-white/40";
};

const regimeColor = (regime) => {
  switch (regime) {
    case "strong":
      return "bg-gold-primary";
    case "neutral":
      return "bg-white/30";
    case "weak":
      return "bg-red-500/60";
    default:
      return "bg-white/10";
  }
};

const btcTrendDot = (trend) => {
  switch (trend) {
    case "BULLISH":
      return "bg-emerald-400";
    case "BEARISH":
      return "bg-red-400";
    case "RANGING":
      return "bg-white/40";
    default:
      return "bg-white/20";
  }
};

const fngColor = (avg) => {
  if (avg === null || avg === undefined) return "text-white/40";
  if (avg <= 25) return "text-red-300";
  if (avg <= 45) return "text-orange-300";
  if (avg <= 55) return "text-white/70";
  if (avg <= 75) return "text-emerald-300";
  return "text-emerald-200";
};

// ─── Subcomponents ───────────────────────────────────────────────

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 my-8">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-primary/40" />
    <div className="text-[11px] tracking-[0.25em] text-gold-primary/80 font-mono">
      · {label} ·
    </div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-primary/40" />
  </div>
);

const HairlineCard = ({ children, className = "" }) => (
  <div
    className={`relative rounded-md bg-[#0a0805] border border-white/[0.06] ${className}`}
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

const SmallLabel = ({ children, className = "" }) => (
  <div
    className={`text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 ${className}`}
  >
    {children}
  </div>
);

// Today summary strip — 1-row dense KPI
const TodayStrip = ({ data, selectedDate }) => {
  if (!data) return null;

  const {
    total_resolved,
    wins,
    losses,
    win_rate,
    delta_vs_yesterday,
    regime_label,
    btc_trend_mode,
    fear_greed_avg,
    fear_greed_label,
    hot_sector,
  } = data;

  const deltaPos = (delta_vs_yesterday ?? 0) > 0;
  const deltaNeg = (delta_vs_yesterday ?? 0) < 0;

  return (
    <HairlineCard className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${regimeColor(regime_label)}`}
          />
          <span className="text-[11px] tracking-[0.25em] font-mono uppercase text-white/60">
            {regime_label || "no data"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <SmallLabel>Win Rate</SmallLabel>
          <span className="font-mono tabular-nums text-2xl text-gold-primary">
            {fmtPct(win_rate)}
          </span>
          {delta_vs_yesterday !== null && delta_vs_yesterday !== undefined && (
            <span
              className={`text-[11px] font-mono tabular-nums ${
                deltaPos
                  ? "text-emerald-400"
                  : deltaNeg
                  ? "text-red-400"
                  : "text-white/40"
              }`}
            >
              {deltaPos ? "▲" : deltaNeg ? "▼" : "·"}{" "}
              {fmtDelta(delta_vs_yesterday)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <SmallLabel>Resolved</SmallLabel>
          <span className="font-mono tabular-nums text-white/85">
            {total_resolved ?? 0}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-white/40">
            {wins ?? 0}W / {losses ?? 0}L
          </span>
        </div>

        {btc_trend_mode && (
          <div className="flex items-center gap-2">
            <SmallLabel>BTC</SmallLabel>
            <span
              className={`w-1.5 h-1.5 rounded-full ${btcTrendDot(btc_trend_mode)}`}
            />
            <span className="text-xs font-mono uppercase tracking-wider text-white/70">
              {btc_trend_mode}
            </span>
          </div>
        )}

        {fear_greed_avg !== null && fear_greed_avg !== undefined && (
          <div className="flex items-center gap-2">
            <SmallLabel>F&amp;G</SmallLabel>
            <span
              className={`font-mono tabular-nums ${fngColor(fear_greed_avg)}`}
            >
              {fear_greed_avg}
            </span>
            {fear_greed_label && (
              <span className="text-[11px] uppercase tracking-wider text-white/50 font-mono">
                {fear_greed_label}
              </span>
            )}
          </div>
        )}

        {hot_sector && (
          <div className="flex items-center gap-2">
            <SmallLabel>Hot</SmallLabel>
            <span className="text-xs font-mono uppercase tracking-wider text-gold-primary">
              {hot_sector.sector}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-white/50">
              {fmtPct(hot_sector.win_rate, 0)} ({hot_sector.total})
            </span>
          </div>
        )}

        <div className="ml-auto text-[10px] tracking-[0.2em] font-mono uppercase text-white/30">
          {fmtDateLong(selectedDate)}
        </div>
      </div>
    </HairlineCard>
  );
};

// 14-day trend strip (bars + regime overlay)
const TrendStrip = ({ trend, selectedDate, onPickDate }) => {
  if (!trend || !trend.length) return null;

  const maxTotal = Math.max(...trend.map((d) => d.total), 1);

  return (
    <HairlineCard className="p-5">
      <div className="flex items-end gap-1 h-32">
        {trend.map((d) => {
          const isSelected = d.date === selectedDate;
          const heightPct = d.total > 0 ? (d.total / maxTotal) * 100 : 4;
          const isEmpty = d.total === 0;

          return (
            <button
              key={d.date}
              onClick={() => onPickDate(d.date)}
              className={`flex-1 group flex flex-col items-center justify-end h-full rounded-sm transition ${
                isSelected
                  ? "bg-white/[0.05]"
                  : "hover:bg-white/[0.02]"
              }`}
              title={`${d.date}: ${d.total} resolved · ${d.win_rate}% WR · ${d.regime}`}
            >
              <div className="w-full px-1 flex items-end h-full">
                <div
                  className={`w-full rounded-sm transition ${
                    isEmpty
                      ? "bg-white/[0.04]"
                      : isSelected
                      ? "bg-gold-primary"
                      : d.regime === "strong"
                      ? "bg-gold-primary/60 group-hover:bg-gold-primary/80"
                      : d.regime === "neutral"
                      ? "bg-white/25 group-hover:bg-white/40"
                      : "bg-red-500/50 group-hover:bg-red-500/70"
                  }`}
                  style={{ height: `${heightPct}%`, minHeight: "2px" }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-1">
        {trend.map((d) => {
          const isSelected = d.date === selectedDate;
          return (
            <div
              key={d.date + "-lbl"}
              className={`flex-1 text-center text-[9px] font-mono tabular-nums ${
                isSelected ? "text-gold-primary" : "text-white/30"
              }`}
            >
              {fmtDate(d.date).split(" ")[1]}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[10px] tracking-[0.2em] font-mono uppercase text-white/30">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-gold-primary/60 rounded-sm" /> Strong
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-white/25 rounded-sm" /> Neutral
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-red-500/50 rounded-sm" /> Weak
        </span>
        <span className="ml-auto text-white/30">click bar to inspect day</span>
      </div>
    </HairlineCard>
  );
};

// Day signals table
const DaySignalsTable = ({ signals }) => {
  if (!signals || !signals.length) {
    return (
      <HairlineCard className="p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No resolved signals on this day
        </div>
      </HairlineCard>
    );
  }

  return (
    <HairlineCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Pair
              </th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Outcome
              </th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Rating
              </th>
              <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Conf
              </th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Sector
              </th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Side
              </th>
              <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Peak %
              </th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Flags
              </th>
              <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Hit At
              </th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => {
              const ot = outcomeToken(s.outcome);
              const peakPos = (s.peak_pct ?? 0) > 0;
              const peakNeg = (s.peak_pct ?? 0) < 0;
              const hitTime = s.outcome_at
                ? new Date(s.outcome_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })
                : "—";
              return (
                <tr
                  key={s.signal_id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition"
                >
                  <td className="px-4 py-2.5 font-mono text-white/90">
                    {s.pair}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-sm border text-[10px] font-mono tracking-wider ${ot.cls}`}
                    >
                      {ot.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[11px] font-mono uppercase tracking-wider ${ratingToken(
                        s.rating
                      )}`}
                    >
                      {s.rating || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white/60">
                    {s.confidence_score || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider text-white/50">
                    {s.sector || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.signal_direction === "BULLISH" ? (
                      <span className="text-emerald-400 text-xs">↑</span>
                    ) : s.signal_direction === "BEARISH" ? (
                      <span className="text-red-400 text-xs">↓</span>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      peakPos
                        ? "text-emerald-400"
                        : peakNeg
                        ? "text-red-400"
                        : "text-white/40"
                    }`}
                  >
                    {s.peak_pct !== null && s.peak_pct !== undefined
                      ? `${peakPos ? "+" : ""}${s.peak_pct.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {s.is_decoupled && (
                        <span
                          title="Decoupled from BTC"
                          className="px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary border border-gold-primary/25 text-[9px] font-mono tracking-wider"
                        >
                          DECPL
                        </span>
                      )}
                      {s.is_extended && (
                        <span
                          title="Extended move"
                          className="px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-white/60 border border-white/[0.08] text-[9px] font-mono tracking-wider"
                        >
                          EXT
                        </span>
                      )}
                      {s.important_tag_count > 0 && (
                        <span
                          title="Important tags from enrichment"
                          className="text-[9px] font-mono text-white/50"
                        >
                          {s.important_tag_count}⚑
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white/40 text-xs">
                    {hitTime}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </HairlineCard>
  );
};

// BTC + F&G context card
const BtcContextCard = ({ context }) => {
  const dist = context?.btc_trend_distribution || {};
  const totalDist = Object.values(dist).reduce((a, b) => a + b, 0);
  const bullish = dist.BULLISH || 0;
  const bearish = dist.BEARISH || 0;
  const ranging = dist.RANGING || 0;

  return (
    <HairlineCard className="p-5">
      <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-4">
        · BTC STATE ·
      </div>

      {totalDist > 0 ? (
        <>
          <div className="space-y-2.5 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/60">
                  Bullish
                </span>
              </span>
              <span className="font-mono tabular-nums text-white/80">
                {bullish}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/60">
                  Ranging
                </span>
              </span>
              <span className="font-mono tabular-nums text-white/80">
                {ranging}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/60">
                  Bearish
                </span>
              </span>
              <span className="font-mono tabular-nums text-white/80">
                {bearish}
              </span>
            </div>
          </div>

          <div className="flex h-1.5 rounded-sm overflow-hidden bg-white/[0.04]">
            {bullish > 0 && (
              <div
                className="bg-emerald-400/60"
                style={{ width: `${(bullish / totalDist) * 100}%` }}
              />
            )}
            {ranging > 0 && (
              <div
                className="bg-white/40"
                style={{ width: `${(ranging / totalDist) * 100}%` }}
              />
            )}
            {bearish > 0 && (
              <div
                className="bg-red-400/60"
                style={{ width: `${(bearish / totalDist) * 100}%` }}
              />
            )}
          </div>
        </>
      ) : (
        <div className="text-xs font-mono text-white/30 mb-4">
          No BTC tag data
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            BTC Dominance
          </span>
          <span className="font-mono uppercase tracking-wider text-white/70">
            {context?.btc_dom_trend_mode || "—"}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            Fear &amp; Greed
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`font-mono tabular-nums text-lg ${fngColor(
                context?.fear_greed_avg
              )}`}
            >
              {context?.fear_greed_avg ?? "—"}
            </span>
            {context?.fear_greed_label && (
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">
                {context.fear_greed_label}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            Decoupled / Extended
          </span>
          <span className="font-mono tabular-nums text-white/70">
            {context?.decoupled_count ?? 0} / {context?.extended_count ?? 0}
          </span>
        </div>
      </div>
    </HairlineCard>
  );
};

// Sector breakdown card
const SectorCard = ({ sectors }) => {
  if (!sectors || !sectors.length) return null;
  const maxTotal = Math.max(...sectors.map((s) => s.total), 1);

  return (
    <HairlineCard className="p-5">
      <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-4">
        · SECTOR BREAKDOWN ·
      </div>
      <div className="space-y-2.5">
        {sectors.map((s) => {
          const wrColor =
            s.win_rate >= 75
              ? "text-emerald-400"
              : s.win_rate >= 50
              ? "text-white/80"
              : "text-red-400";
          const barColor =
            s.win_rate >= 75
              ? "bg-emerald-400/40"
              : s.win_rate >= 50
              ? "bg-white/25"
              : "bg-red-500/40";

          return (
            <div key={s.sector}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-mono uppercase tracking-wider text-white/70">
                  {s.sector}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-mono tabular-nums text-white/40">
                    {s.wins}/{s.total}
                  </span>
                  <span
                    className={`font-mono tabular-nums text-xs ${wrColor}`}
                  >
                    {fmtPct(s.win_rate, 0)}
                  </span>
                </span>
              </div>
              <div className="h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                <div
                  className={`h-full ${barColor}`}
                  style={{ width: `${(s.total / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </HairlineCard>
  );
};

// Important tags card
const TagsCard = ({ tags }) => {
  if (!tags || !tags.length) return null;

  return (
    <HairlineCard className="p-5">
      <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-4">
        · TOP SIGNAL TAGS ·
      </div>
      <div className="space-y-2">
        {tags.map((t) => (
          <div
            key={t.tag}
            className="flex items-center justify-between text-xs"
          >
            <span className="font-mono text-white/65 truncate pr-2">
              {t.tag}
            </span>
            <span className="font-mono tabular-nums text-white/45 flex-shrink-0">
              ×{t.count}
            </span>
          </div>
        ))}
      </div>
    </HairlineCard>
  );
};

// Coverage micro-stat
const CoverageHint = ({ coverage, total }) => {
  if (!total) return null;
  const pct = Math.round((coverage / total) * 100);
  return (
    <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/30">
      Enrichment coverage:{" "}
      <span className="text-white/55 font-mono tabular-nums">
        {coverage}/{total}
      </span>{" "}
      ({pct}%)
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────

const DailyPerformancePage = () => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayUTC());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getDailyDashboard(date);
      setData(res);
    } catch (err) {
      console.error("Daily dashboard fetch failed:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Date constraints: today UTC max, 13 days back min
  const dateMax = todayUTC();
  const dateMin = useMemo(() => {
    const d = new Date(dateMax + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 89); // 90-day window
    return d.toISOString().slice(0, 10);
  }, [dateMax]);

  const summary = data?.today_summary;
  const detail = data?.day_detail;
  const trend = data?.trend_14d;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <SectionHeader label="DAILY PERFORMANCE" />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-white/95 tracking-tight">
            Daily Performance
          </h1>
          <p className="text-sm text-white/45 mt-1">
            Per-day breakdown by hit date (UTC) · BTC context · sector analysis
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08]">
            <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              Date
            </span>
            <input
              type="date"
              value={selectedDate}
              min={dateMin}
              max={dateMax}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white/85 font-mono tabular-nums text-sm focus:outline-none [color-scheme:dark]"
            />
          </div>
          <button
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            className="px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08] text-[10px] tracking-[0.2em] font-mono uppercase text-white/60 hover:border-gold-primary/30 hover:text-gold-primary transition disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <HairlineCard className="p-5 mb-6 border-red-500/20">
          <div className="text-sm text-red-300">
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-red-400/80 mb-1">
              · Error ·
            </div>
            {error}
          </div>
        </HairlineCard>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="space-y-4">
          <div className="h-20 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
          <div className="h-44 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          <TodayStrip data={summary} selectedDate={selectedDate} />

          <SectionHeader label="14-DAY TREND" />
          <TrendStrip
            trend={trend}
            selectedDate={selectedDate}
            onPickDate={setSelectedDate}
          />

          <SectionHeader label="DAY DETAIL" />
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
              {detail?.signals?.length || 0} signals · resolved on{" "}
              {fmtDate(selectedDate)}
            </div>
            <CoverageHint
              coverage={detail?.context?.enrichment_coverage}
              total={detail?.context?.enrichment_total}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8">
              <DaySignalsTable signals={detail?.signals} />
            </div>
            <div className="xl:col-span-4 space-y-5">
              <BtcContextCard context={detail?.context} />
              <SectorCard sectors={detail?.context?.sector_breakdown} />
              <TagsCard tags={detail?.context?.important_tags} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyPerformancePage;
