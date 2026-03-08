import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ════════════════════════════════════════
// Mini Donut Chart (SVG, no dependencies)
// ════════════════════════════════════════
const TpDonutChart = ({ breakdown, closedTrades }) => {
  if (!closedTrades || closedTrades === 0) return null;

  const data = [
    { label: "TP1", value: breakdown.tp1, color: "#22c55e" },
    { label: "TP2", value: breakdown.tp2, color: "#3b82f6" },
    { label: "TP3", value: breakdown.tp3, color: "#eab308" },
    { label: "TP4", value: breakdown.tp4, color: "#a855f7" },
    { label: "SL", value: breakdown.sl, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const radius = 40;
  const cx = 50,
    cy = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0"
      >
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const seg = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="transition-all duration-500"
              style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
            />
          );
          offset += dash;
          return seg;
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-white text-[11px] font-bold"
        >
          {closedTrades}
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          className="fill-white/50 text-[7px]"
        >
          closed
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-[10px] text-white/70">{d.label}</span>
            <span className="text-[10px] font-mono font-semibold text-white">
              {d.value}
            </span>
            <span className="text-[9px] text-white/40">
              ({((d.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Stat Card
// ════════════════════════════════════════
const StatCard = ({ label, value, sub, color = "text-white", icon }) => (
  <div className="bg-[#111]/80 rounded-lg p-2.5 border border-white/5 flex-1 min-w-[100px]">
    <div className="flex items-center gap-1.5 mb-1">
      {icon && <span className="text-xs">{icon}</span>}
      <p className="text-[9px] text-white/40 uppercase tracking-wider font-medium">
        {label}
      </p>
    </div>
    <p className={`text-base sm:text-lg font-bold font-mono ${color}`}>
      {value}
    </p>
    {sub && <p className="text-[9px] text-white/50 mt-0.5">{sub}</p>}
  </div>
);

// ════════════════════════════════════════
// Past Call Row
// ════════════════════════════════════════
const PastCallRow = ({ call, onClickSignal, isCurrentSignal }) => {
  const outcomeStyles = {
    tp1: {
      bg: "bg-green-500/10",
      border: "border-green-500/20",
      text: "text-green-400",
      badge: "bg-green-500",
    },
    tp2: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      text: "text-blue-400",
      badge: "bg-blue-500",
    },
    tp3: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
      text: "text-yellow-400",
      badge: "bg-yellow-500",
    },
    tp4: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
      text: "text-purple-400",
      badge: "bg-purple-500",
    },
    sl: {
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      text: "text-red-400",
      badge: "bg-red-500",
    },
  };

  const outcome = call.outcome?.toLowerCase();
  const style = outcomeStyles[outcome] || {
    bg: "bg-white/[0.02]",
    border: "border-white/5",
    text: "text-white/50",
    badge: "bg-gray-500",
  };
  const isOpen = !outcome;

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatPrice = (val) => {
    const p = Number(val);
    if (isNaN(p) || p <= 0) return "-";
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    return p < 100 ? p.toFixed(4) : p.toFixed(2);
  };

  return (
    <div
      onClick={() => !isCurrentSignal && onClickSignal && onClickSignal(call)}
      className={`
        rounded-lg border p-2.5 sm:p-3 transition-all
        ${style.bg} ${style.border}
        ${
          isCurrentSignal
            ? "opacity-50 cursor-default ring-1 ring-gold-primary/30"
            : "cursor-pointer hover:bg-white/[0.04] hover:border-white/15 active:scale-[0.99]"
        }
      `}
    >
      {/* Top Row: Date + Outcome + Gain */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-white/50 font-mono">
            {formatDate(call.created_at)}
          </span>
          {isCurrentSignal && (
            <span className="text-[8px] text-gold-primary bg-gold-primary/10 px-1.5 py-0.5 rounded font-semibold">
              CURRENT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {call.duration && (
            <span className="text-[9px] text-white/30 font-mono">
              ⏱ {call.duration}
            </span>
          )}
          {isOpen ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/20">
              OPEN
            </span>
          ) : (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold text-white ${style.badge}`}
            >
              {outcome?.toUpperCase()}
            </span>
          )}
          {call.gain_pct != null && (
            <span
              className={`text-[10px] font-mono font-bold ${call.gain_pct >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {call.gain_pct >= 0 ? "+" : ""}
              {call.gain_pct}%
            </span>
          )}
        </div>
      </div>

      {/* Bottom Row: Entry + Targets + Risk */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-white/30">Entry</span>
          <span className="text-[10px] font-mono text-white/80">
            ${formatPrice(call.entry)}
          </span>
        </div>
        {call.risk_level && (
          <span
            className={`text-[8px] px-1.5 py-0.5 rounded font-semibold
            ${
              call.risk_level?.toLowerCase() === "high"
                ? "bg-red-500/10 text-red-400 border border-red-500/15"
                : call.risk_level?.toLowerCase() === "low"
                  ? "bg-green-500/10 text-green-400 border border-green-500/15"
                  : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/15"
            }`}
          >
            {call.risk_level}
          </span>
        )}
        {call.market_cap && (
          <span className="text-[8px] text-white/25 font-mono">
            {call.market_cap}
          </span>
        )}

        {/* Mini TP progress dots */}
        <div className="flex items-center gap-0.5 ml-auto">
          {[call.target1, call.target2, call.target3, call.target4].map(
            (tp, i) => {
              if (!tp) return null;
              const tpKey = `tp${i + 1}`;
              const isHit =
                outcome && ["tp1", "tp2", "tp3", "tp4"].indexOf(outcome) >= i;
              return (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${isHit ? "bg-green-400" : "bg-white/10"}`}
                  title={`${tpKey}: ${formatPrice(tp)}`}
                />
              );
            },
          )}
          {call.stop1 && (
            <div
              className={`w-1.5 h-1.5 rounded-full ml-0.5 ${outcome === "sl" ? "bg-red-400" : "bg-white/10"}`}
              title={`SL: ${formatPrice(call.stop1)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Main Component: SignalHistoryTab
// ════════════════════════════════════════
const SignalHistoryTab = ({ signal, onSwitchSignal }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [callLimit, setCallLimit] = useState(5);

  const pair = signal?.pair?.toUpperCase() || "";
  const coinSymbol = pair.replace(/USDT$/i, "");

  const fetchProfile = useCallback(
    async (lim) => {
      if (!pair) return;
      setLoading(true);
      setError(null);
      try {
        const exclude = signal?.signal_id || "";
        const res = await fetch(
          `${API_BASE}/api/v1/coin-profile/${pair}?limit=${lim}&exclude=${exclude}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProfile(data);
      } catch (e) {
        console.error("[CoinProfile] fetch error:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [pair, signal?.signal_id],
  );

  useEffect(() => {
    fetchProfile(callLimit);
  }, [callLimit, fetchProfile]);

  const handleLimitChange = (lim) => {
    setCallLimit(lim);
  };

  const handleClickCall = (call) => {
    if (onSwitchSignal && call.signal_id !== signal?.signal_id) {
      onSwitchSignal(call);
    }
  };

  // ── Loading State ──
  if (loading && !profile) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-1 h-20 bg-white/[0.03] rounded-lg"
                />
              ))}
            </div>
            <div className="h-32 bg-white/[0.03] rounded-lg" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-white/[0.03] rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (error && !profile) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 bg-[#0a0a0a]">
        <div className="text-center">
          <span className="text-3xl mb-3 block">⚠️</span>
          <p className="text-white/60 text-sm mb-2">
            Failed to load history for {coinSymbol}
          </p>
          <p className="text-white/30 text-xs mb-4">{error}</p>
          <button
            onClick={() => fetchProfile(callLimit)}
            className="px-4 py-2 bg-gold-primary/10 text-gold-primary text-xs font-semibold rounded-lg border border-gold-primary/20 hover:bg-gold-primary/20 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const { stats, past_calls } = profile;
  const wrColor =
    stats.win_rate >= 60
      ? "text-green-400"
      : stats.win_rate >= 45
        ? "text-yellow-400"
        : "text-red-400";
  const streakColor =
    stats.streak_type === "win" ? "text-green-400" : "text-red-400";
  const streakIcon = stats.streak_type === "win" ? "🔥" : "❄️";

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-5 pb-4">
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={32} />
          <div>
            <h3 className="text-white font-display text-sm sm:text-base font-semibold">
              {coinSymbol} Signal History
            </h3>
            <p className="text-white/40 text-[10px] sm:text-xs">
              {stats.total_signals} total signals · Since{" "}
              {stats.first_signal
                ? new Date(stats.first_signal).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "numeric",
                  })
                : "-"}
            </p>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            icon="🏆"
            label="Win Rate"
            value={`${stats.win_rate}%`}
            color={wrColor}
            sub={`${stats.closed_trades} closed trades`}
          />
          <StatCard
            icon="📊"
            label="Total Signals"
            value={stats.total_signals}
            sub={
              stats.avg_duration
                ? `Avg duration: ${stats.avg_duration}`
                : `${stats.open_signals} open`
            }
          />
          <StatCard
            icon="📈"
            label="Avg Gain"
            value={
              stats.avg_gain_pct != null
                ? `${stats.avg_gain_pct > 0 ? "+" : ""}${stats.avg_gain_pct}%`
                : "-"
            }
            color={
              stats.avg_gain_pct > 0
                ? "text-green-400"
                : stats.avg_gain_pct < 0
                  ? "text-red-400"
                  : "text-white/60"
            }
            sub={
              stats.best_gain_pct != null && stats.worst_loss_pct != null
                ? `Best +${stats.best_gain_pct}% / Worst ${stats.worst_loss_pct}%`
                : null
            }
          />
          <StatCard
            icon={streakIcon}
            label="Current Streak"
            value={stats.streak ? `${stats.streak} ${stats.streak_type}` : "-"}
            color={stats.streak ? streakColor : "text-white/40"}
            sub={(() => {
              const rd = stats.risk_distribution;
              if (!rd) return null;
              const parts = [];
              if (rd.low > 0) parts.push(`${rd.low} Low`);
              if (rd.normal > 0) parts.push(`${rd.normal} Normal`);
              if (rd.medium > 0) parts.push(`${rd.medium} Med`);
              if (rd.high > 0) parts.push(`${rd.high} High`);
              return parts.length > 0 ? parts.join(" · ") : null;
            })()}
          />
        </div>

        {/* ── TP Breakdown ── */}
        <div className="bg-[#111]/80 rounded-xl p-3 sm:p-4 border border-white/5">
          <p className="text-white/40 text-[9px] uppercase tracking-wider font-medium mb-3">
            🎯 Outcome Distribution
          </p>
          <TpDonutChart
            breakdown={stats.tp_breakdown}
            closedTrades={stats.closed_trades}
          />
        </div>

        {/* ── Past Calls Header + Toggle ── */}
        <div className="flex items-center justify-between">
          <p className="text-gold-primary text-xs sm:text-sm font-semibold flex items-center gap-2">
            📋 Past Calls
            {loading && (
              <span className="inline-block w-3 h-3 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
            )}
          </p>
          <div className="flex items-center bg-[#111] rounded-lg p-0.5 border border-white/10">
            {[3, 5, 10, "All"].map((n) => (
              <button
                key={n}
                onClick={() => handleLimitChange(n === "All" ? 9999 : n)}
                className={`px-2.5 sm:px-3 py-1 rounded text-[10px] sm:text-[11px] font-semibold transition-all
      ${
        callLimit === (n === "All" ? 9999 : n)
          ? "bg-gold-primary text-black"
          : "text-white/40 hover:text-white/70 hover:bg-white/5"
      }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* ── Past Calls List ── */}
        <div className="space-y-2">
          {past_calls.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-2xl mb-2 block">📭</span>
              <p className="text-white/40 text-xs">
                No other signals found for {coinSymbol}
              </p>
            </div>
          ) : (
            past_calls.map((call) => (
              <PastCallRow
                key={call.signal_id}
                call={call}
                onClickSignal={handleClickCall}
                isCurrentSignal={call.signal_id === signal?.signal_id}
              />
            ))
          )}
        </div>

        {/* ── Quick Verdict ── */}
        {stats.closed_trades >= 3 && (
          <div
            className={`rounded-xl p-3 sm:p-4 border ${
              stats.win_rate >= 60
                ? "bg-green-500/5 border-green-500/15"
                : stats.win_rate >= 45
                  ? "bg-yellow-500/5 border-yellow-500/15"
                  : "bg-red-500/5 border-red-500/15"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className="text-lg flex-shrink-0">
                {stats.win_rate >= 60
                  ? "✅"
                  : stats.win_rate >= 45
                    ? "⚠️"
                    : "🚨"}
              </span>
              <div>
                <p
                  className={`text-xs font-semibold mb-1 ${
                    stats.win_rate >= 60
                      ? "text-green-400"
                      : stats.win_rate >= 45
                        ? "text-yellow-400"
                        : "text-red-400"
                  }`}
                >
                  {stats.win_rate >= 60
                    ? "Strong Performer"
                    : stats.win_rate >= 45
                      ? "Average Performer"
                      : "Underperformer"}
                </p>
                <p className="text-[10px] sm:text-[11px] text-white/50 leading-relaxed">
                  {coinSymbol} has a{" "}
                  <span className="text-white/80 font-semibold">
                    {stats.win_rate}%
                  </span>{" "}
                  win rate across{" "}
                  <span className="text-white/80 font-semibold">
                    {stats.closed_trades}
                  </span>{" "}
                  closed trades.
                  {stats.avg_rr > 0 && (
                    <>
                      {" "}
                      Average R:R is{" "}
                      <span className="text-white/80 font-semibold">
                        1:{stats.avg_rr}
                      </span>
                      .
                    </>
                  )}
                  {stats.streak && stats.streak >= 2 && (
                    <>
                      {" "}
                      Currently on a{" "}
                      <span
                        className={
                          stats.streak_type === "win"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {stats.streak}-{stats.streak_type} streak
                      </span>
                      .
                    </>
                  )}
                  {stats.best_gain_pct != null &&
                    stats.worst_loss_pct != null && (
                      <>
                        {" "}
                        Best:{" "}
                        <span className="text-green-400">
                          +{stats.best_gain_pct}%
                        </span>
                        , Worst:{" "}
                        <span className="text-red-400">
                          {stats.worst_loss_pct}%
                        </span>
                        .
                      </>
                    )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalHistoryTab;
