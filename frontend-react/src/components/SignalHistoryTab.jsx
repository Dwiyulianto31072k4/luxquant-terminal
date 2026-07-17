import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import JourneyInsightsSection from "./JourneyInsightsSection";
import { Ic } from "./signalIcons";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Quiet monochrome-friendly outcome palette (token-aligned)
const OUTCOME_COLOR = {
  tp1: "rgb(var(--pos))",
  tp2: "rgb(74 222 128)",
  tp3: "rgb(var(--warn))",
  tp4: "rgb(var(--accent))",
  sl: "rgb(var(--neg))",
};

const TpDonutChart = ({ breakdown, closedTrades }) => {
  if (!closedTrades || closedTrades === 0) return null;

  const data = [
    { label: "TP1", value: breakdown.tp1, color: OUTCOME_COLOR.tp1 },
    { label: "TP2", value: breakdown.tp2, color: OUTCOME_COLOR.tp2 },
    { label: "TP3", value: breakdown.tp3, color: OUTCOME_COLOR.tp3 },
    { label: "TP4", value: breakdown.tp4, color: OUTCOME_COLOR.tp4 },
    { label: "SL", value: breakdown.sl, color: OUTCOME_COLOR.sl },
  ].filter((d) => d.value > 0);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const radius = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0">
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
              strokeWidth="11"
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
            />
          );
          offset += dash;
          return seg;
        })}
        <text x={cx} y={cy - 3} textAnchor="middle" fill="rgb(var(--fg))" fontSize="12" fontWeight="600" fontFamily="JetBrains Mono, monospace">
          {closedTrades}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="rgb(var(--fg-muted))" fontSize="7" fontFamily="JetBrains Mono, monospace">
          closed
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-[10px] text-text-muted">{d.label}</span>
            <span className="text-[10px] font-mono tabular-nums text-text-primary font-medium">{d.value}</span>
            <span className="text-[9px] text-text-muted tabular-nums">
              ({((d.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, sub, color = "text-text-primary", icon }) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 flex-1 min-w-[100px]">
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon && <span className="text-text-muted opacity-70">{icon}</span>}
      <p className="text-[9px] text-text-muted uppercase tracking-[0.12em] font-medium">{label}</p>
    </div>
    <p className={`text-lg sm:text-xl font-semibold font-mono tabular-nums leading-none ${color}`}>{value}</p>
    {sub && <p className="text-[10px] text-text-muted mt-1.5 leading-snug">{sub}</p>}
  </div>
);

const PastCallRow = ({ call, onClickSignal, isCurrentSignal }) => {
  const outcome = call.outcome?.toLowerCase();
  const isOpen = !outcome;
  const isWin = outcome && outcome !== "sl";
  const isSl = outcome === "sl";

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
        rounded-xl border p-3 transition-colors
        border-white/[0.07] bg-white/[0.015]
        ${isCurrentSignal
          ? "opacity-55 cursor-default"
          : "cursor-pointer hover:bg-white/[0.04] hover:border-white/12"}
      `}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-text-muted font-mono tabular-nums">
            {formatDate(call.created_at)}
          </span>
          {isCurrentSignal && (
            <span className="text-[8px] text-text-secondary bg-white/[0.06] border border-white/10 px-1.5 py-0.5 rounded font-medium">
              Current
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {call.duration && (
            <span className="text-[9px] text-text-muted font-mono flex items-center gap-0.5">
              {Ic.clock("w-2.5 h-2.5")} {call.duration}
            </span>
          )}
          {isOpen ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-text-secondary font-medium border border-white/10">
              Open
            </span>
          ) : (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                isSl
                  ? "bg-negative/10 text-negative border-negative/15"
                  : "bg-positive/10 text-positive border-positive/15"
              }`}
            >
              {outcome?.toUpperCase()}
            </span>
          )}
          {call.gain_pct != null && (
            <span
              className={`text-[10px] font-mono tabular-nums font-medium ${
                call.gain_pct >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {call.gain_pct >= 0 ? "+" : ""}
              {call.gain_pct}%
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-text-muted">Entry</span>
          <span className="text-[10px] font-mono tabular-nums text-text-secondary">
            ${formatPrice(call.entry)}
          </span>
        </div>
        {call.risk_level && (
          <span className="text-[8px] px-1.5 py-0.5 rounded font-medium bg-white/[0.04] text-text-muted border border-white/10">
            {call.risk_level}
          </span>
        )}
        {call.market_cap && (
          <span className="text-[8px] text-text-muted font-mono">{call.market_cap}</span>
        )}

        <div className="flex items-center gap-0.5 ml-auto">
          {[call.target1, call.target2, call.target3, call.target4].map((tp, i) => {
            if (!tp) return null;
            const isHit = outcome && ["tp1", "tp2", "tp3", "tp4"].indexOf(outcome) >= i;
            return (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${isHit ? "bg-positive" : "bg-white/10"}`}
                title={`TP${i + 1}: ${formatPrice(tp)}`}
              />
            );
          })}
          {call.stop1 && (
            <div
              className={`w-1.5 h-1.5 rounded-full ml-0.5 ${isSl ? "bg-negative" : "bg-white/10"}`}
              title={`SL: ${formatPrice(call.stop1)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

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
        const token = localStorage.getItem("access_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(
          `${API_BASE}/api/v1/coin-profile/${pair}?limit=${lim}&exclude=${exclude}`,
          { headers },
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

  const handleLimitChange = (lim) => setCallLimit(lim);

  const handleClickCall = (call) => {
    if (onSwitchSignal && call.signal_id !== signal?.signal_id) {
      onSwitchSignal({ ...call, pair: call.pair || signal?.pair });
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 bg-surface">
        <div className="max-w-4xl mx-auto animate-pulse space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-white/[0.03] border border-white/[0.05]" />
            ))}
          </div>
          <div className="h-32 rounded-xl bg-white/[0.03] border border-white/[0.05]" />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 bg-surface">
        <div className="text-center">
          <p className="text-text-secondary text-sm mb-1">Failed to load history for {coinSymbol}</p>
          <p className="text-text-muted text-xs mb-4">{error}</p>
          <button
            type="button"
            onClick={() => fetchProfile(callLimit)}
            className="px-4 py-2 bg-white/[0.05] text-text-primary text-xs font-medium rounded-lg border border-white/10 hover:bg-white/[0.08] transition-colors"
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
    stats.win_rate >= 60 ? "text-positive" : stats.win_rate >= 45 ? "text-text-primary" : "text-negative";
  const streakColor = stats.streak_type === "win" ? "text-positive" : "text-negative";

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-surface">
      <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 pb-4">
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={32} />
          <div>
            <h3 className="text-text-primary text-sm sm:text-base font-semibold tracking-tight">
              {coinSymbol} history
            </h3>
            <p className="text-text-muted text-[11px] sm:text-xs">
              {stats.total_signals} signals
              {stats.first_signal
                ? ` · since ${new Date(stats.first_signal).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard
            icon={Ic.trophy("w-3.5 h-3.5")}
            label="Win rate"
            value={`${stats.win_rate}%`}
            color={wrColor}
            sub={`${stats.closed_trades} closed`}
          />
          <StatCard
            icon={Ic.bars("w-3.5 h-3.5")}
            label="Total signals"
            value={stats.total_signals}
            sub={stats.avg_duration ? `Avg ${stats.avg_duration}` : `${stats.open_signals} open`}
          />
          <StatCard
            icon={Ic.trendUp("w-3.5 h-3.5")}
            label="Avg gain"
            value={
              stats.avg_gain_pct != null
                ? `${stats.avg_gain_pct > 0 ? "+" : ""}${stats.avg_gain_pct}%`
                : "—"
            }
            color={
              stats.avg_gain_pct > 0
                ? "text-positive"
                : stats.avg_gain_pct < 0
                  ? "text-negative"
                  : "text-text-primary"
            }
            sub={
              stats.best_gain_pct != null && stats.worst_loss_pct != null
                ? `Best +${stats.best_gain_pct}% · Worst ${stats.worst_loss_pct}%`
                : null
            }
          />
          <StatCard
            icon={
              stats.streak_type === "win"
                ? Ic.flame("w-3.5 h-3.5")
                : Ic.snowflake("w-3.5 h-3.5")
            }
            label="Streak"
            value={stats.streak ? `${stats.streak} ${stats.streak_type}` : "—"}
            color={stats.streak ? streakColor : "text-text-muted"}
            sub={(() => {
              const rd = stats.risk_distribution;
              if (!rd) return null;
              const parts = [];
              if (rd.low > 0) parts.push(`${rd.low} low`);
              if (rd.normal > 0) parts.push(`${rd.normal} normal`);
              if (rd.medium > 0) parts.push(`${rd.medium} med`);
              if (rd.high > 0) parts.push(`${rd.high} high`);
              return parts.length ? parts.join(" · ") : null;
            })()}
          />
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 sm:p-4">
          <p className="text-text-muted text-[9px] uppercase tracking-[0.12em] font-medium mb-3">
            Outcome distribution
          </p>
          <TpDonutChart breakdown={stats.tp_breakdown} closedTrades={stats.closed_trades} />
        </div>

        <JourneyInsightsSection pair={pair} />

        <div className="flex items-center justify-between gap-2">
          <p className="text-text-secondary text-xs sm:text-sm font-medium flex items-center gap-2">
            Past calls
            {loading && (
              <span className="inline-block w-3 h-3 border-2 border-white/15 border-t-white/50 rounded-full animate-spin" />
            )}
          </p>
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.08]">
            {[3, 5, 10, "All"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleLimitChange(n === "All" ? 9999 : n)}
                className={`px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-medium transition-colors ${
                  callLimit === (n === "All" ? 9999 : n)
                    ? "bg-white/[0.1] text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {past_calls.length === 0 ? (
            <div className="text-center py-10 text-text-muted text-xs">
              No other signals for {coinSymbol}
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
      </div>
    </div>
  );
};

export default SignalHistoryTab;
