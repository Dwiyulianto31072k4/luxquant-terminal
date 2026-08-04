import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "./CoinLogo";
import EChart, { useChartTokens, inkAlpha } from "./charts/EChart";

// ═══════════════════════════════════════════
// SHARED COIN INTELLIGENCE LOGIC + DETAIL MODAL
// Extracted from CoinIntelligence.jsx so SignalsTable can reuse the exact same
// verdict classification and the deep-analysis modal WITHOUT duplicating logic.
// CoinIntelligence.jsx now imports these from here.
//
// THEME NOTE: structural surfaces (frame, header, cards, section labels,
// scrollbar, table borders) follow the SignalModal gold design language.
// Colors that ENCODE DATA (verdict / severity / market condition / win-loss /
// score gauge / outcome bars / best-worst markers / correlated-SL) are kept
// intentionally — they are meaning, not decoration.
// ═══════════════════════════════════════════

// MARKET CONDITIONS (Good, Neutral, Bad) — semantic, do not goldify
export const FC = {
  good: { bg: "rgba(34,197,94,0.10)", border: "#22c55e", text: "#22c55e", label: "Good" },
  neutral: { bg: "rgba(234,179,8,0.10)", border: "#eab308", text: "#eab308", label: "Neutral" },
  bad: { bg: "rgba(239,68,68,0.10)", border: "#ef4444", text: "#ef4444", label: "Bad" },
};

export const mapMarketCondition = (flow) =>
  ({ high: "good", mid: "neutral", low: "bad" })[flow] || "neutral";

export const SEV = {
  danger: { border: "#ef4444", bg: "rgba(239,68,68,0.06)", text: "#ef4444" },
  warning: { border: "#eab308", bg: "rgba(234,179,8,0.06)", text: "#eab308" },
  positive: { border: "#22c55e", bg: "rgba(34,197,94,0.06)", text: "#22c55e" },
  info: {
    border: "rgb(var(--accent))",
    bg: "rgb(var(--accent) / 0.06)",
    text: "rgb(var(--accent))",
  },
};

export const OC = {
  tp4: { bg: "rgba(34,197,94,0.15)", tx: "#22c55e", l: "TP4" },
  tp3: { bg: "rgba(132,204,22,0.15)", tx: "#84cc16", l: "TP3" },
  tp2: { bg: "rgba(234,179,8,0.15)", tx: "#eab308", l: "TP2" },
  tp1: { bg: "rgba(96,165,250,0.15)", tx: "#60a5fa", l: "TP1" },
  sl: { bg: "rgba(239,68,68,0.15)", tx: "#ef4444", l: "SL" },
};

// Solid fills for donut / legend (no alpha — must read bold on light surfaces)
export const JC = {
  tp4: "#16a34a",
  tp3: "#65a30d",
  tp2: "#ca8a04",
  tp1: "#2563eb",
  sl: "#dc2626",
};

export const wrc = (w) => (w >= 70 ? "#16a34a" : w >= 50 ? "#ca8a04" : "#dc2626");
export const scoreColor = (s) =>
  s >= 80 ? "#16a34a" : s >= 65 ? "#65a30d" : s >= 45 ? "#ca8a04" : s >= 25 ? "#ea580c" : "#dc2626";
export const scoreGrade = (s) =>
  s >= 80 ? "Excellent" : s >= 65 ? "Good" : s >= 45 ? "Average" : s >= 25 ? "Poor" : "Very Poor";
export const primarySev = (f) => {
  for (const s of ["danger", "warning", "positive", "info"])
    if (f?.some((x) => x.severity === s)) return s;
  return "info";
};
export const parseBold = (t) =>
  t
    ? t.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
        p.startsWith("**") ? (
          <span key={i} className="font-semibold text-text-primary drop-shadow-md">
            {p.slice(2, -2)}
          </span>
        ) : (
          p
        )
      )
    : t;
export const fmtDate = (d) => {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3
    ? `${parseInt(p[2])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(p[1]) - 1]}`
    : d;
};

export const classifyCoin = (c) => {
  const f = c.anomaly_flags || [],
    ft = f.map((x) => x.type),
    hd = f.some((x) => x.severity === "danger"),
    hw = f.some((x) => x.severity === "warning"),
    hp = f.some((x) => x.severity === "positive");
  if (hd) return "avoid";
  if (ft.includes("wr_decline") && c.win_rate < 70) return "avoid";
  if (ft.includes("flow_underperformer")) return "avoid";
  if (c.sl_rate >= 30 && c.closed_trades >= 5) return "avoid";
  if (hw && !hp && c.win_rate < 75) return "avoid";
  if (c.win_rate >= 80 && c.closed_trades >= 5) return "worth_it";
  if (hp && !hd) return "worth_it";
  if (ft.includes("hot_streak") && c.current_streak?.length >= 5) return "worth_it";
  if (c.win_rate >= 85) return "worth_it";
  if (c.win_rate < 65 && c.closed_trades >= 5) return "avoid";
  return hp ? "worth_it" : "neutral";
};

// ═══════════════════════════════════════════
// MICRO COMPONENTS
// ═══════════════════════════════════════════

export const RiskGauge = ({ score, size = "sm" }) => {
  const c = scoreColor(score),
    pct = Math.min(score, 100),
    isSm = size === "sm";
  return (
    <div className={`relative ${isSm ? "w-8 h-8" : "w-16 h-16"}`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="rgb(var(--ink) / 0.04)"
          strokeWidth={isSm ? "3" : "2.5"}
        />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={c}
          strokeWidth={isSm ? "3" : "2.5"}
          strokeDasharray={`${pct * 0.94} 100`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`font-mono font-bold ${isSm ? "text-[8px]" : "text-[15px]"}`}
          style={{ color: c }}
        >
          {score}
        </span>
      </div>
    </div>
  );
};

/** Monthly WR trend — ECharts area line (theme-aware). */
export const MonthlyLineChart = ({ data }) => {
  const tokens = useChartTokens();
  const option = useMemo(() => {
    if (!data || data.length < 2) return null;
    const labels = data.map((d) => d.month?.slice(5) || d.month || "");
    const values = data.map((d) => d.wr);
    // Bold solid gold line (not washed accent); points use WR green/amber/red
    const lineColor = "#d97706";
    const muted = tokens["fg-muted"] || tokens.fgMuted || "#888";
    const surface = tokens["surface-raised"] || tokens.surfaceRaised || "#141414";
    return {
      grid: { left: 28, right: 10, top: 28, bottom: 22 },
      tooltip: {
        trigger: "axis",
        backgroundColor: surface,
        borderColor: inkAlpha(tokens, 0.12),
        textStyle: { color: tokens.fg || "#eee", fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        formatter: (p) => {
          const i = p?.[0]?.dataIndex;
          const row = data[i];
          if (!row) return "";
          return `${row.month}<br/>WR <b>${row.wr}%</b>${row.closed != null ? ` · ${row.closed} tr` : ""}`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
      },
      yAxis: {
        type: "value",
        min: (v) => Math.max(0, Math.floor(v.min - 8)),
        max: (v) => Math.min(100, Math.ceil(v.max + 5)),
        splitLine: { lineStyle: { color: inkAlpha(tokens, 0.08), type: "dashed" } },
        axisLabel: {
          color: muted,
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          formatter: (v) => `${v}%`,
        },
      },
      series: [
        {
          type: "line",
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: wrc(v),
              borderColor: surface,
              borderWidth: 2,
              shadowBlur: 0,
            },
            label: { color: wrc(v) },
          })),
          smooth: 0.28,
          symbol: "circle",
          symbolSize: 9,
          lineStyle: {
            width: 3.5,
            color: lineColor,
            shadowColor: "rgba(217, 119, 6, 0.35)",
            shadowBlur: 6,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(217, 119, 6, 0.42)" },
                { offset: 0.55, color: "rgba(217, 119, 6, 0.12)" },
                { offset: 1, color: "rgba(217, 119, 6, 0)" },
              ],
            },
          },
          label: {
            show: true,
            position: "top",
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 800,
            formatter: (p) => `${p.value}%`,
          },
        },
      ],
    };
  }, [data, tokens]);
  if (!option) return null;
  return <EChart option={option} height={148} className="w-full" />;
};

/** Outcome donut — ECharts pie ring. */
const OutcomeDonut = ({ dist, closed }) => {
  const tokens = useChartTokens();
  const order = ["tp4", "tp3", "tp2", "tp1", "sl"];
  const closedN = closed || 0;
  const reachTp = ["tp1", "tp2", "tp3", "tp4"].reduce((a, k) => a + (dist?.[k] || 0), 0);
  const reachPct = closedN ? Math.round((reachTp / closedN) * 100) : 0;

  const surface = tokens["surface-raised"] || "#f8f8f8";
  const option = useMemo(() => {
    const data = order
      .map((k) => ({
        name: OC[k]?.l || k.toUpperCase(),
        value: dist?.[k] || 0,
        itemStyle: {
          color: JC[k],
          borderColor: surface,
          borderWidth: 2,
        },
      }))
      .filter((d) => d.value > 0);
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: tokens["surface-raised"] || "#1a1a1a",
        borderColor: inkAlpha(tokens, 0.12),
        textStyle: { color: tokens.fg || "#eee", fontSize: 11 },
        formatter: (p) => `${p.name}: <b>${p.value}</b> (${p.percent}%)`,
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "86%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 5,
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.18)" },
          },
          data,
        },
      ],
    };
  }, [dist, closedN, tokens, surface]);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative w-[148px] shrink-0 sm:w-[160px]">
        <EChart option={option} height={160} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[20px] font-extrabold tabular-nums" style={{ color: wrc(reachPct) }}>
            {reachPct}%
          </span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-text-muted">
            Reach TP
          </span>
        </div>
      </div>
      <div className="w-full flex-1 grid grid-cols-1 gap-1.5 font-mono text-[11px]">
        {order.map((k) => {
          const v = dist?.[k] || 0;
          const pct = closedN ? Math.round((v / closedN) * 100) : 0;
          return (
            <div key={k} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-ink/5"
                style={{ background: JC[k] }}
              />
              <span className="font-semibold text-text-primary/85">{OC[k]?.l || k.toUpperCase()}</span>
              <span className="ml-auto tabular-nums font-semibold text-text-secondary">
                {pct}% · {v}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Day-of-week WR bars — ECharts. */
const DowBarChart = ({ breakdown, bestDay, worstDay }) => {
  const tokens = useChartTokens();
  const entries = Object.entries(breakdown || {});
  const option = useMemo(() => {
    if (!entries.length) return null;
    const labels = entries.map(([d]) => d);
    const values = entries.map(([, s]) => Math.round(s.wr));
    const colors = values.map((wr, i) => {
      const day = labels[i];
      if (day === bestDay) return "#16a34a";
      if (day === worstDay) return "#dc2626";
      return wrc(wr);
    });
    return {
      grid: { left: 8, right: 8, top: 28, bottom: 28 },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens["surface-raised"] || "#1a1a1a",
        borderColor: inkAlpha(tokens, 0.12),
        textStyle: { color: tokens.fg || "#eee", fontSize: 11 },
        formatter: (p) => {
          const i = p?.[0]?.dataIndex;
          const [day, s] = entries[i] || [];
          if (!day) return "";
          return `${day}<br/>WR <b>${Math.round(s.wr)}%</b> · ${s.closed} tr`;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: tokens["fg-muted"] || "#888",
          fontSize: 10,
          fontWeight: 700,
        },
      },
      yAxis: {
        type: "value",
        max: 100,
        show: false,
      },
      series: [
        {
          type: "bar",
          data: values.map((v, i) => ({
            value: v,
            // Solid fill — no translucent fade
            itemStyle: {
              color: colors[i],
              borderRadius: [6, 6, 2, 2],
              shadowBlur: 0,
            },
            label: { color: colors[i] },
          })),
          barMaxWidth: 30,
          label: {
            show: true,
            position: "top",
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 800,
            formatter: (p) => `${p.value}%`,
          },
        },
      ],
    };
  }, [entries, bestDay, worstDay, tokens]);
  if (!option) return null;
  return <EChart option={option} height={160} className="w-full" />;
};

const Section = ({ title, right = null, children, className = "" }) => (
  <div
    className={`rounded-2xl border border-ink/[0.06] bg-ink/[0.025] p-3.5 sm:p-4 ${className}`}
  >
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</p>
      {right}
    </div>
    {children}
  </div>
);

const StatBox = ({ label, value, color }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
    <p className="mt-1 font-mono text-[14px] font-bold tabular-nums sm:text-[15px]" style={{ color }}>
      {value}
    </p>
  </div>
);

// ═══════════════════════════════════════════
// FULL PAGE MODAL (deep analysis)
// ═══════════════════════════════════════════
export const CoinDetailModal = ({ coin, currentFlow, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [histPage, setHistPage] = useState(1); // pagination Signal History
  const HIST_PER_PAGE = 10;

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Animated close (mirrors SignalModal)
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  // Escape to close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!coin) return null;

  const verdict = classifyCoin(coin);
  const vc = verdict === "avoid" ? "#ef4444" : "#22c55e";
  const st = SEV[primarySev(coin.anomaly_flags)];
  const rs = coin.risk_score || 0;

  const trendIcon =
    coin.win_rate_30d_trend === "up" ? (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 7L5 4L8 7" stroke="#22c55e" strokeWidth="1.5" />
        <path d="M2 3L5 6L8 3" stroke="#22c55e" strokeWidth="1.5" />
      </svg>
    ) : coin.win_rate_30d_trend === "down" ? (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 3L5 6L8 3" stroke="#ef4444" strokeWidth="1.5" />
        <path d="M2 7L5 4L8 7" stroke="#ef4444" strokeWidth="1.5" />
      </svg>
    ) : null;

  const statCards = [
    { l: "Win Rate", v: `${coin.win_rate}%`, c: wrc(coin.win_rate), i: trendIcon },
    {
      l: "SL Rate",
      v: `${coin.sl_rate}%`,
      c: coin.sl_rate >= 30 ? "#ef4444" : "rgb(var(--fg-muted))",
    },
    {
      l: "Avg Outcome",
      v: coin.avg_outcome,
      c: coin.avg_outcome === "SL" ? "#ef4444" : "rgb(var(--accent))",
    },
    {
      l: "Streak",
      v: `${coin.current_streak?.length || 0}${coin.current_streak?.type === "win" ? "W" : "L"}`,
      c: coin.current_streak?.type === "win" ? "#22c55e" : "#ef4444",
    },
    {
      l: "R:R Ratio",
      v: coin.volatility?.rr_ratio ? `${coin.volatility.rr_ratio}x` : "—",
      c:
        (coin.volatility?.rr_ratio || 0) >= 2
          ? "#22c55e"
          : (coin.volatility?.rr_ratio || 0) >= 1
            ? "#eab308"
            : "#ef4444",
    },
    {
      l: "30d WR",
      v: coin.win_rate_30d != null ? `${coin.win_rate_30d}%` : "—",
      c: coin.win_rate_30d != null ? wrc(coin.win_rate_30d) : "rgb(var(--fg-muted))",
    },
  ];

  const iconBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/[0.08] bg-ink/[0.03] text-text-muted transition hover:bg-ink/[0.07] hover:text-text-primary";

  const content = (
    <>
      <div className={`cdm-overlay ${isClosing ? "cdm-closing" : ""}`}>
        <div className="cdm-backdrop" onClick={handleClose} aria-hidden="true" />
        <div className="cdm-container">
          <div className="cdm-content" style={{ "--vc": vc }}>
            <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-ink/20" />
            </div>

            {/* Header — Signal / Pulse grammar */}
            {/* No verdict-tinted hairline across the top. The verdict already
                shows as a labelled pill next to the pair, where it can be read;
                as a 1px wash on the lip it only made the panel look like it had
                a coloured rim, which is the one thing every other modal in the
                app does not have. */}
            <div className="relative flex shrink-0 items-center gap-2.5 border-b border-ink/[0.06] px-3.5 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
              <CoinLogo pair={coin.pair} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <h2 className="truncate text-[16px] font-semibold tracking-tight text-text-primary sm:text-[18px]">
                    {coin.pair.replace("USDT", "")}
                    <span className="ml-1 text-[12px] font-medium text-text-muted">USDT</span>
                  </h2>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: `${vc}18`, color: vc }}
                  >
                    {verdict === "avoid" ? "Avoid" : "Worth it"}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                  {coin.total_calls} calls · {coin.closed_trades} closed · {coin.open_trades} open
                </p>
              </div>
              <div className="hidden shrink-0 flex-col items-center sm:flex">
                <RiskGauge score={rs} size="sm" />
                <span
                  className="mt-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: scoreColor(rs) }}
                >
                  {scoreGrade(rs)}
                </span>
              </div>
              <button type="button" onClick={handleClose} className={iconBtn} aria-label="Close">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="cdm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-5 sm:py-5">
              <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
                {coin.anomaly_flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coin.anomaly_flags.map((f, i) => (
                      <span
                        key={i}
                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: SEV[f.severity]?.bg,
                          color: SEV[f.severity]?.text,
                          border: `1px solid ${SEV[f.severity]?.border}33`,
                        }}
                      >
                        {f.tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* KPI strip */}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {statCards.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-ink/[0.05] bg-ink/[0.025] px-2 py-3 text-center sm:px-2.5"
                    >
                      <p className="text-[9px] font-medium uppercase tracking-wide text-text-muted">
                        {s.l}
                      </p>
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <p className="font-mono text-[15px] font-bold tabular-nums sm:text-[16px]" style={{ color: s.c }}>
                          {s.v}
                        </p>
                        {s.i}
                      </div>
                    </div>
                  ))}
                </div>

                <Section
                  title="Outcome distribution"
                  right={
                    <span className="font-mono text-[10px] tabular-nums text-text-muted">
                      {coin.closed_trades} closed
                    </span>
                  }
                >
                  <OutcomeDonut dist={coin.outcome_dist} closed={coin.closed_trades} />
                </Section>

                {coin.insight && (
                  <div className="relative overflow-hidden rounded-2xl border border-ink/[0.06] bg-ink/[0.025] p-3.5 pl-4 sm:p-4 sm:pl-5">
                    <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl" style={{ background: st.text }} />
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: st.text }}
                      >
                        AI deep analysis
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-text-secondary">
                      {parseBold(coin.insight)}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Section title="Winrate by market condition">
                    <div className="grid grid-cols-3 gap-2">
                      {["high", "mid", "low"].map((apiFlow) => {
                        const d = coin.flow_perf?.[apiFlow] || {
                          calls: 0,
                          wins: 0,
                          losses: 0,
                          wr: 0,
                        };
                        const marketCond = mapMarketCondition(apiFlow);
                        const fc = FC[marketCond];
                        const isNow = apiFlow === currentFlow;
                        return (
                          <div
                            key={apiFlow}
                            className="rounded-xl px-2 py-3 text-center"
                            style={{
                              background: isNow ? fc.bg : "rgb(var(--ink) / 0.02)",
                              border: `1px solid ${isNow ? fc.border + "40" : "rgb(var(--ink) / 0.06)"}`,
                            }}
                          >
                            <p
                              className="text-[9px] font-bold uppercase tracking-wide"
                              style={{ color: isNow ? fc.text : "rgb(var(--fg-muted))" }}
                            >
                              {fc.label}
                              {isNow ? " · now" : ""}
                            </p>
                            <p
                              className="mt-1 font-mono text-lg font-bold tabular-nums sm:text-xl"
                              style={{ color: d.calls > 0 ? wrc(d.wr) : "rgb(var(--fg-muted))" }}
                            >
                              {d.calls > 0 ? `${d.wr}%` : "—"}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                              {d.wins}W / {d.losses}L
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Trend & target hit rate">
                    {coin.monthly_trend?.length >= 2 ? (
                      <MonthlyLineChart data={coin.monthly_trend} />
                    ) : (
                      <p className="py-6 text-center text-[12px] text-text-muted">Not enough months</p>
                    )}
                    {coin.tp4_streaks?.total_tp4 > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink/[0.06] pt-3 text-center">
                        <div>
                          <p className="text-[9px] font-medium uppercase tracking-wide text-text-muted">TP4</p>
                          <p className="mt-0.5 font-mono text-lg font-bold text-profit">
                            {coin.tp4_streaks.total_tp4}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-medium uppercase tracking-wide text-text-muted">Best streak</p>
                          <p className="mt-0.5 font-mono text-lg font-bold text-text-primary">
                            {coin.tp4_streaks.longest_streak}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-medium uppercase tracking-wide text-text-muted">Current</p>
                          <p
                            className="mt-0.5 font-mono text-lg font-bold"
                            style={{
                              color:
                                coin.tp4_streaks.current_tp4_streak > 0
                                  ? "#22c55e"
                                  : "rgb(var(--fg-muted))",
                            }}
                          >
                            {coin.tp4_streaks.current_tp4_streak}
                          </p>
                        </div>
                      </div>
                    )}
                  </Section>

                  {coin.volatility?.profile !== "unknown" && (
                    <Section title="Volatility Profile">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <StatBox
                          label="Profile"
                          value={coin.volatility.profile}
                          color={
                            coin.volatility.profile === "stable"
                              ? "#22c55e"
                              : coin.volatility.profile === "volatile"
                                ? "#ef4444"
                                : "#eab308"
                          }
                        />
                        <StatBox
                          label="P/L StdDev"
                          value={`${coin.volatility.pl_stddev}%`}
                          color="rgb(var(--fg))"
                        />
                        <StatBox
                          label="Avg Win"
                          value={`+${coin.volatility.avg_win_pl}%`}
                          color="#22c55e"
                        />
                        <StatBox
                          label="Avg Loss"
                          value={`${coin.volatility.avg_loss_pl}%`}
                          color="#ef4444"
                        />
                      </div>
                    </Section>
                  )}

                  {coin.entry_quality?.score !== "unknown" && (
                    <Section title="Entry Quality Metrics">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <StatBox
                          label="Score"
                          value={coin.entry_quality.score}
                          color={
                            coin.entry_quality.score === "excellent"
                              ? "#22c55e"
                              : coin.entry_quality.score === "poor"
                                ? "#ef4444"
                                : "rgb(var(--accent))"
                          }
                        />
                        <StatBox
                          label="Avg TP Level"
                          value={`${coin.entry_quality.avg_tp_level}/4`}
                          color="rgb(var(--fg))"
                        />
                        <StatBox
                          label="Hits > TP1"
                          value={`${coin.entry_quality.reaches_potential}%`}
                          color={coin.entry_quality.reaches_potential >= 60 ? "#22c55e" : "#eab308"}
                        />
                        <StatBox
                          label="Full Target Rate"
                          value={`${coin.entry_quality.full_target_rate}%`}
                          color={
                            coin.entry_quality.full_target_rate >= 20
                              ? "#22c55e"
                              : "rgb(var(--fg-muted))"
                          }
                        />
                      </div>
                    </Section>
                  )}

                  {coin.recovery && (
                    <Section title="Recovery Behavior">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <StatBox
                          label="Avg Signal to Recover"
                          value={`${coin.recovery.avg_signals_to_recover} sig`}
                          color={
                            coin.recovery.speed_label === "fast"
                              ? "#22c55e"
                              : coin.recovery.speed_label === "slow"
                                ? "#ef4444"
                                : "#eab308"
                          }
                        />
                        <StatBox
                          label="Fastest Recovery"
                          value={`${coin.recovery.fastest_recovery} sig`}
                          color="#22c55e"
                        />
                        <StatBox
                          label="Slowest Recovery"
                          value={`${coin.recovery.slowest_recovery} sig`}
                          color="#ef4444"
                        />
                        <StatBox
                          label="Total Recoveries"
                          value={`${coin.recovery.total_recoveries}`}
                          color="rgb(var(--fg-muted))"
                        />
                      </div>
                    </Section>
                  )}

                  {coin.hour_analysis?.has_pattern && (
                    <Section title="Best Entry Timing (UTC)">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <StatBox
                          label="Best Hour"
                          value={`${coin.hour_analysis.best_hour}:00`}
                          color="#22c55e"
                        />
                        <StatBox
                          label="Hour WR"
                          value={`${coin.hour_analysis.best_hour_wr}%`}
                          color={wrc(coin.hour_analysis.best_hour_wr)}
                        />
                        <StatBox
                          label="Best Block"
                          value={coin.hour_analysis.best_block?.split(" ")[0] || "—"}
                          color="rgb(var(--accent))"
                        />
                        <StatBox
                          label="Block WR"
                          value={`${coin.hour_analysis.best_block_wr}%`}
                          color={wrc(coin.hour_analysis.best_block_wr)}
                        />
                      </div>
                    </Section>
                  )}
                </div>

                {coin.dow_analysis?.breakdown &&
                  Object.keys(coin.dow_analysis.breakdown).length > 0 && (
                    <Section title="Win rate by day of week">
                      <DowBarChart
                        breakdown={coin.dow_analysis.breakdown}
                        bestDay={coin.dow_analysis.best_day}
                        worstDay={coin.dow_analysis.worst_day}
                      />
                    </Section>
                  )}

                {coin.correlated_pairs?.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-negative/15 bg-negative/[0.04] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-loss">
                        Correlated SL risk
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-text-muted">
                        These coins tend to hit SL on the same days — avoid stacking them.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {coin.correlated_pairs.map((cp, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-xl border border-negative/20 bg-negative/[0.06] px-2.5 py-1.5"
                        >
                          <CoinLogo pair={cp.pair} size={18} />
                          <span className="font-mono text-[12px] font-semibold text-text-primary">
                            {cp.pair.replace("USDT", "")}
                          </span>
                          <span className="rounded-md bg-negative/10 px-1.5 py-0.5 text-[10px] font-semibold text-loss">
                            {cp.co_sl_count}×
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {coin.signal_history?.length > 0 &&
                  (() => {
                    const total = coin.signal_history.length;
                    const pages = Math.max(1, Math.ceil(total / HIST_PER_PAGE));
                    const page = Math.min(histPage, pages);
                    const start = (page - 1) * HIST_PER_PAGE;
                    const rows = coin.signal_history.slice(start, start + HIST_PER_PAGE);
                    return (
                      <Section
                        title="Signal history"
                        right={
                          <span className="font-mono text-[10px] tabular-nums text-text-muted">
                            {total} total
                          </span>
                        }
                      >
                        <div className="overflow-hidden rounded-xl border border-ink/[0.06]">
                          <div className="cdm-scroll overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-left">
                              <thead>
                                <tr className="border-b border-ink/[0.06] bg-ink/[0.02]">
                                  {["Date", "WR", "Entry", "Result", "P/L"].map((h) => (
                                    <th
                                      key={h}
                                      className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted sm:px-4"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink/[0.04]">
                                {rows.map((s, i) => (
                                  <tr key={start + i} className="hover:bg-ink/[0.02]">
                                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-text-secondary sm:px-4">
                                      {fmtDate(s.date)}
                                    </td>
                                    <td
                                      className="px-3 py-2.5 font-mono text-[12px] font-semibold sm:px-4"
                                      style={{
                                        color: s.platform_wr
                                          ? wrc(s.platform_wr)
                                          : "rgb(var(--fg-muted))",
                                      }}
                                    >
                                      {s.platform_wr != null ? `${s.platform_wr}%` : "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-[11px] text-text-muted sm:px-4">
                                      {s.entry}
                                    </td>
                                    <td className="px-3 py-2.5 sm:px-4">
                                      {OC[s.outcome] && (
                                        <span
                                          className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                                          style={{
                                            background: OC[s.outcome].bg,
                                            color: OC[s.outcome].tx,
                                          }}
                                        >
                                          {OC[s.outcome].l}
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 font-mono text-[12px] font-bold sm:px-4 ${
                                        s.outcome !== "sl" ? "text-profit" : "text-loss"
                                      }`}
                                    >
                                      {s.pl_pct}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {pages > 1 && (
                            <div className="flex items-center justify-between border-t border-ink/[0.06] px-3 py-2.5 sm:px-4">
                              <span className="font-mono text-[10px] text-text-muted">
                                {start + 1}–{Math.min(start + HIST_PER_PAGE, total)} of {total}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setHistPage((p) => Math.max(1, p - 1))}
                                  disabled={page <= 1}
                                  className="rounded-lg border border-ink/10 px-2.5 py-1 text-[11px] font-medium text-text-secondary disabled:opacity-30"
                                >
                                  Prev
                                </button>
                                <span className="px-1 font-mono text-[10px] tabular-nums text-text-muted">
                                  {page}/{pages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setHistPage((p) => Math.min(pages, p + 1))}
                                  disabled={page >= pages}
                                  className="rounded-lg border border-ink/10 px-2.5 py-1 text-[11px] font-medium text-text-secondary disabled:opacity-30"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </Section>
                    );
                  })()}

                <div className="h-1 sm:h-2" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
 /* Full-bleed overlay, clearance on the container. The app header paints above
    every overlay, so the panel has to stop below it — but insetting the whole
    overlay took the backdrop down with it and left the strip under the header
    sharp and undimmed. Padding moves only the panel. */
 .cdm-overlay { position: fixed; inset: 0; z-index: 100050; display: flex; align-items: flex-end; justify-content: center; isolation: isolate; }
 @supports(height:100dvh) { .cdm-overlay { height: 100dvh; } }
 .cdm-backdrop { position: absolute; inset: 0; background: rgb(var(--scrim) / var(--lq-scrim-alpha)); -webkit-backdrop-filter: blur(var(--lq-scrim-blur)); backdrop-filter: blur(var(--lq-scrim-blur)); animation: cdmBI .25s ease-out; }
 .cdm-container { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: var(--lq-modal-top) 0 0 0; pointer-events: none; }
 .cdm-container > * { pointer-events: auto; }
 .cdm-content {
 position: relative; width: 100%; max-width: 1080px;
 height: min(94dvh, 100%); max-height: min(94dvh, 100%);
 background: rgb(var(--surface-raised));
 color: rgb(var(--fg));
 border-top: 1px solid rgb(var(--ink) / 0.08);
 border-radius: 1.35rem 1.35rem 0 0;
 display: flex; flex-direction: column; overflow: hidden;
 animation: cdmUp .32s cubic-bezier(.16,1,.3,1);
 box-shadow: 0 -20px 60px rgb(var(--scrim) / 0.4);
 }
 @media(min-width:640px) {
 .cdm-overlay { align-items: center; }
 .cdm-container { align-items: center; padding: var(--lq-modal-top) 16px 16px; }
 .cdm-content {
 height: auto; max-height: min(92dvh, 900px, var(--lq-modal-maxh));
 border-radius: 1.25rem;
 border: 1px solid rgb(var(--ink) / 0.08);
 box-shadow: 0 24px 80px -18px rgb(var(--scrim) / 0.5);
 animation: cdmCI .28s cubic-bezier(.16,1,.3,1);
 }
 }
 @media(min-width:1024px) {
 .cdm-container { padding: var(--lq-modal-top) 24px 24px; }
 }
 .cdm-closing .cdm-backdrop { animation: cdmBO .2s ease-in forwards; }
 .cdm-closing .cdm-content { animation: cdmDn .2s ease-in forwards; }
 @media(min-width:640px) {
 .cdm-closing .cdm-content { animation: cdmCO .2s ease-in forwards; }
 }
 @keyframes cdmBI { from{opacity:0} to{opacity:1} }
 @keyframes cdmBO { from{opacity:1} to{opacity:0} }
 @keyframes cdmCI { from{opacity:0;transform:scale(.98) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
 @keyframes cdmCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.98)} }
 @keyframes cdmUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
 @keyframes cdmDn { from{transform:translateY(0)} to{transform:translateY(100%)} }
 .cdm-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
 .cdm-scroll::-webkit-scrollbar-track { background: transparent; }
 .cdm-scroll::-webkit-scrollbar-thumb { background: rgb(var(--ink) / 0.14); border-radius: 999px; }
 `}</style>
    </>
  );

  return createPortal(content, document.body);
};
