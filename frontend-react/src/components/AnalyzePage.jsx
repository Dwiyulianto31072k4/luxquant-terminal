import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  Tooltip,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
  ComposedChart,
} from "recharts";
import { useTranslation } from "react-i18next";
import SignalModal from "./SignalModal";
import CoinLogo from "./CoinLogo";

const API_BASE = "/api/v1";

/* ──────────────────────────────────────────────────────────────
   AnalyzePage — Web3 Flowscan-minimal reskin
   • Gold accent retained (LuxQuant brand)
   • profit (#56c996) / loss (#e07288) muted functional only
   • Flat hairline cards, sharp rounded-md, font-mono font-light numbers
   • Chart colors muted (no neon green/lime/yellow/orange rainbow)
   • Line-label-line section headers + SVG icons
   ────────────────────────────────────────────────────────────── */

// Muted Flowscan color palette
const C = {
  profit: "#56c996",
  loss: "#e07288",
  gold: "#d4a853",
  goldLight: "#f0d890",
  white: "#ffffff",
  muted: "#9a8a7d",
  // gold opacity gradient (for outcome/RR bars)
  goldStep: ["rgba(212, 168, 83, 1)", "rgba(212, 168, 83, 0.85)", "rgba(212, 168, 83, 0.7)", "rgba(212, 168, 83, 0.55)"],
};

const AnalyzePage = () => {
  const { t } = useTranslation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [timeRange, setTimeRange] = useState("all");
  const [trendMode, setTrendMode] = useState("weekly");

  const [signals, setSignals] = useState([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigPage, setSigPage] = useState(1);
  const [sigTotalPages, setSigTotalPages] = useState(1);
  const [sigTotal, setSigTotal] = useState(0);
  const [sigSearch, setSigSearch] = useState("");
  const [sigStatus, setSigStatus] = useState("all");
  const [sigRisk, setSigRisk] = useState("all");
  const [sigSort, setSigSort] = useState("created_at");
  const [sigOrder, setSigOrder] = useState("desc");
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [showSigFilters, setShowSigFilters] = useState(false);

  useEffect(() => {
    fetchAnalyzeData();
  }, [timeRange, trendMode]);
  useEffect(() => {
    fetchSignals();
  }, [sigPage, sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);
  useEffect(() => {
    setSigPage(1);
  }, [sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);

  const fetchAnalyzeData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (timeRange !== "all") params.append("time_range", timeRange);
      params.append("trend_mode", trendMode);
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE}/signals/analyze?${params}`, { headers });
      if (!response.ok) throw new Error("Failed to fetch");
      setData(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignals = useCallback(async () => {
    try {
      setSigLoading(true);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateTo = sevenDaysAgo.toISOString().split("T")[0];

      const params = new URLSearchParams({
        page: sigPage.toString(),
        page_size: "20",
        sort_by: sigSort,
        sort_order: sigOrder,
        date_to: dateTo,
      });
      if (sigSearch) params.append("pair", sigSearch.toUpperCase());
      if (sigStatus !== "all") params.append("status", sigStatus);
      if (sigRisk !== "all") params.append("risk_level", sigRisk);
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/signals/?${params}`, { headers });
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      setSignals(d.items || []);
      setSigTotalPages(d.total_pages || 1);
      setSigTotal(d.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setSigLoading(false);
    }
  }, [sigPage, sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);

  const timeRangeOptions = [
    { value: "all", label: t("perf.all_time"), short: t("perf.all_time") },
    { value: "ytd", label: t("perf.ytd"), short: t("perf.ytd") },
    { value: "30d", label: t("perf.days_30"), short: t("perf.days_30") },
    { value: "7d", label: t("perf.days_7"), short: t("perf.days_7") },
  ];

  if (loading) return <LoadingSkeleton t={t} />;
  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-12 h-12 rounded-md bg-loss/10 border border-loss/25 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-loss" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-mono text-[12px] uppercase tracking-wider text-loss mb-2">Failed to load analysis</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-4">{error}</p>
        <button
          onClick={fetchAnalyzeData}
          className="px-4 py-2 bg-gold-primary/10 text-gold-primary rounded-sm hover:bg-gold-primary/15 transition-colors font-mono text-[11px] uppercase tracking-wider border border-gold-primary/25"
        >
          Retry
        </button>
      </div>
    );
  if (!data) return null;

  const sigActiveFilters = [
    sigSearch !== "",
    sigStatus !== "all",
    sigRisk !== "all",
  ].filter(Boolean).length;

  const rrToMax = (() => {
    const tpLevels = (data.risk_reward || []).filter((d) => d.level !== "SL");
    if (tpLevels.length === 0) return 0;
    const totalCount = tpLevels.reduce((s, d) => s + d.count, 0);
    if (totalCount === 0) return 0;
    const weightedSum = tpLevels.reduce((s, d) => s + d.avg_rr * d.count, 0);
    return weightedSum / totalCount;
  })();

  const maxTpRR = (() => {
    const tpLevels = (data.risk_reward || []).filter((d) => d.level !== "SL");
    if (tpLevels.length === 0) return { level: "-", rr: 0 };
    const maxTP = tpLevels[tpLevels.length - 1];
    return { level: maxTP.level, rr: maxTP.avg_rr };
  })();

  return (
    <div className="space-y-5">
      {/* ── PAGE HEADER — eyebrow + title + tagline, with integrated time range ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/70">
            Verified Track Record
          </span>
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1.5">
            All-Time Performance
          </h1>
          <p className="text-sm text-text-primary/45 mt-2">
            Lifetime track record across{" "}
            <span className="text-text-primary/85 font-mono tabular-nums">
              {data.stats.total_signals.toLocaleString()}
            </span>{" "}
            resolved signals
          </p>
        </div>

        {/* Time range — segmented control */}
        <div className="inline-flex gap-0.5 p-0.5 bg-surface-raised rounded-lg border border-white/[0.06] self-start sm:self-auto shrink-0">
          {timeRangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={`px-3.5 py-1.5 rounded-[7px] font-mono text-[10px] uppercase tracking-wider transition-all ${
                timeRange === opt.value
                  ? "bg-gold-primary text-surface-hover font-semibold shadow-[0_2px_10px_-2px_rgba(212,168,83,0.55)]"
                  : "text-text-muted hover:text-text-primary hover:bg-white/[0.04]"
              }`}
            >
              <span className="sm:hidden">{opt.short}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <KPICard
          label={t("perf.win_rate")}
          value={`${data.stats.win_rate.toFixed(1)}%`}
          color={
            data.stats.win_rate >= 75 ? "profit"
              : data.stats.win_rate >= 55 ? "gold"
                : "loss"
          }
          accent
        />
        <KPICard
          label={t("perf.closed_trades")}
          value={data.stats.closed_trades.toLocaleString()}
          sub={`of ${data.stats.total_signals.toLocaleString()}`}
        />
        <KPICard
          label={t("perf.winners")}
          value={data.stats.total_winners.toLocaleString()}
          color="profit"
        />
        <KPICard
          label={t("perf.losses")}
          value={data.stats.sl_count.toLocaleString()}
          color="loss"
        />
        <KPICard
          label={`${t("perf.avg_rr")} (${maxTpRR.level})`}
          value={`${maxTpRR.rr.toFixed(2)}R`}
          color="gold"
        />
        <KPICard
          label={t("perf.not_hit")}
          value={data.stats.open_signals.toLocaleString()}
          sub={`${data.stats.active_pairs} ${t("perf.pairs")}`}
          color="muted"
        />
      </div>

      {/* ── WIN RATE TREND ── */}
      <div className="bg-surface-raised rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <IconTrend />
            <div>
              <h3 className="text-text-primary text-sm font-normal tracking-tight">
                {t("perf.wr_trend")}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                {t("perf.wr_trend_desc")}
              </p>
            </div>
          </div>
          <div className="flex gap-1 p-1 bg-surface-secondary rounded-sm border border-white/[0.04]">
            {["daily", "weekly"].map((m) => (
              <button
                key={m}
                onClick={() => setTrendMode(m)}
                className={`px-3 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  trendMode === m
                    ? "bg-white/10 text-text-primary border border-white/[0.08]"
                    : "text-text-muted hover:text-text-primary border border-transparent"
                }`}
              >
                {m === "daily" ? t("perf.daily") : t("perf.weekly")}
              </button>
            ))}
          </div>
        </div>
        <WinRateTrendChart data={data.win_rate_trend} mode={trendMode} t={t} />
      </div>

      {/* ── OUTCOME & R:R ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-surface-raised rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <IconOutcome />
            <div>
              <h3 className="text-text-primary text-sm font-normal tracking-tight">
                {t("perf.outcome_dist")}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5 tabular-nums">
                {data.stats.closed_trades.toLocaleString()} {t("perf.closed_trades")}
              </p>
            </div>
          </div>
          <OutcomeDistribution data={data.stats} t={t} />
        </div>

        <div className="bg-surface-raised rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <IconRR />
            <div>
              <h3 className="text-text-primary text-sm font-normal tracking-tight">
                {t("perf.risk_reward")}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                {t("perf.rr_desc")} · Best{" "}
                <span className="text-gold-primary tabular-nums">{maxTpRR.rr.toFixed(2)}R</span>
              </p>
            </div>
          </div>
          <RiskRewardChart data={data.risk_reward} t={t} />
        </div>
      </div>

      {/* ── RISK LEVEL ANALYSIS ── */}
      <div className="bg-surface-raised rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="flex items-center gap-2 mb-4">
          <IconRisk />
          <div>
            <h3 className="text-text-primary text-sm font-normal tracking-tight">
              {t("perf.risk_analysis")}
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
              {t("perf.risk_desc")}
            </p>
          </div>
        </div>

        {!data.risk_distribution || data.risk_distribution.length === 0 ? (
          <div className="text-center py-8 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            No risk data available
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {data.risk_distribution.map((rd) => {
                const colorMap = {
                  Low: {
                    border: "border-profit/20",
                    bg: "from-profit/[0.05] to-transparent",
                    text: "text-profit",
                    dot: "bg-profit",
                  },
                  Normal: {
                    border: "border-gold-primary/20",
                    bg: "from-gold-primary/[0.05] to-transparent",
                    text: "text-gold-primary",
                    dot: "bg-gold-primary",
                  },
                  High: {
                    border: "border-loss/20",
                    bg: "from-loss/[0.05] to-transparent",
                    text: "text-loss",
                    dot: "bg-loss",
                  },
                };
                const c = colorMap[rd.risk_level] || colorMap["Normal"];
                const winPct = rd.closed_trades > 0 ? (rd.winners / rd.closed_trades) * 100 : 0;
                const totalSig = data.risk_distribution.reduce(
                  (s, r) => s + r.total_signals, 0
                );
                const pct = totalSig > 0 ? ((rd.total_signals / totalSig) * 100).toFixed(1) : "0";
                const safeRiskKey = rd.risk_level ? String(rd.risk_level).toLowerCase() : "normal";

                return (
                  <div
                    key={rd.risk_level}
                    className={`rounded-sm p-4 bg-gradient-to-b ${c.bg} border ${c.border}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        <span className={`font-mono text-[11px] uppercase tracking-wider ${c.text}`}>
                          {t(`perf.${safeRiskKey}`)}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-text-muted tabular-nums">
                        {pct}%
                      </span>
                    </div>

                    <p className={`text-3xl font-mono font-light tabular-nums leading-none ${c.text}`}>
                      {rd.win_rate.toFixed(1)}%
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1 mb-3">
                      {t("perf.win_rate")}
                    </p>

                    <div className="h-1 rounded-sm overflow-hidden flex bg-white/[0.04] mb-2">
                      <div
                        className="h-full bg-profit/70 transition-all duration-700"
                        style={{ width: `${winPct}%` }}
                      />
                      <div
                        className="h-full bg-loss/70 transition-all duration-700"
                        style={{ width: `${100 - winPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[10px] tabular-nums mb-3">
                      <span className="text-profit/80">
                        {rd.winners.toLocaleString()} W
                      </span>
                      <span className="text-loss/80">
                        {rd.losers.toLocaleString()} L
                      </span>
                    </div>

                    <div className="pt-3 border-t border-white/[0.04] grid grid-cols-2 gap-2">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                          {t("perf.signals")}
                        </p>
                        <p className="font-mono text-sm text-text-primary font-light tabular-nums mt-0.5">
                          {rd.total_signals.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                          {t("perf.avg_rr")}
                        </p>
                        <p className="font-mono text-sm text-text-primary font-light tabular-nums mt-0.5">
                          {rd.avg_rr > 0 ? `${rd.avg_rr.toFixed(2)}R` : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Distribution bar */}
            {(() => {
              const totalSig = data.risk_distribution.reduce(
                (s, r) => s + r.total_signals, 0
              );
              const colors = {
                Low: C.profit,
                Normal: C.gold,
                High: C.loss,
              };
              if (totalSig === 0) return null;
              return (
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-4 p-3 rounded-sm bg-surface-secondary border border-white/[0.04]">
                  <div className="w-full sm:w-64 h-1 rounded-sm overflow-hidden flex bg-white/[0.04] flex-shrink-0">
                    {data.risk_distribution.map((rd, i) => (
                      <div
                        key={i}
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${(rd.total_signals / totalSig) * 100}%`,
                          backgroundColor: colors[rd.risk_level],
                          opacity: 0.75,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {data.risk_distribution.map((rd) => {
                      const safeRiskKey = rd.risk_level ? String(rd.risk_level).toLowerCase() : "normal";
                      return (
                        <div key={rd.risk_level} className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: colors[rd.risk_level] }}
                          />
                          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                            {t(`perf.${safeRiskKey}`)}
                          </span>
                          <span className="font-mono text-[10px] text-text-primary tabular-nums">
                            {((rd.total_signals / totalSig) * 100).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* ── WIN RATE TREND BY RISK LEVEL ── */}
      {data.risk_trend && data.risk_trend.length > 0 && (
        <div className="bg-surface-raised rounded-xl p-5 border border-white/[0.07] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-center gap-2 mb-4">
            <IconRiskTrend />
            <div>
              <h3 className="text-text-primary text-sm font-normal tracking-tight">
                {t("perf.wr_by_risk")}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                {t("perf.wr_by_risk_desc")}
              </p>
            </div>
          </div>
          <RiskTrendChart data={data.risk_trend} mode={trendMode} t={t} />
        </div>
      )}

      {/* ── TOP PERFORMING PAIRS ── */}
      {data.pair_metrics && data.pair_metrics.length > 0 && (
        <div className="bg-surface-raised rounded-xl border border-white/[0.07] relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="p-5 pb-0">
            <div className="flex items-center gap-2">
              <IconPairs />
              <div>
                <h3 className="text-text-primary text-sm font-normal tracking-tight">
                  {t("perf.top_pairs")}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                  {t("perf.top_pairs_desc")}
                </p>
              </div>
            </div>
          </div>
          <TopPairsTable pairs={data.pair_metrics} t={t} />
        </div>
      )}

      {/* ── FULL SIGNAL HISTORY ── */}
      <div className="bg-surface-raised rounded-xl border border-white/[0.07] relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="p-5 pb-0">
          <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <IconHistory />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-text-primary text-sm font-normal tracking-tight">
                    {t("perf.sig_history")}
                  </h3>
                  <span className="px-2 py-0.5 rounded-sm bg-gold-primary/10 border border-gold-primary/25 text-gold-primary font-mono text-[10px] uppercase tracking-wider">
                    Proof of Calls
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-1 tabular-nums">
                  {sigTotal.toLocaleString()} {t("perf.total_signals")} · {t("perf.history_desc")}
                </p>
              </div>
            </div>

            <a
              href="/signals"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-gold-primary/10 border border-gold-primary/25 text-gold-primary font-mono text-[10px] uppercase tracking-wider hover:bg-gold-primary/15 transition-colors group"
            >
              <IconBolt />
              {t("perf.view_latest")}
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm bg-gold-primary/15 text-gold-primary/80 border border-gold-primary/20">
                PRO
              </span>
            </a>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5">
          <button
            onClick={() => setShowSigFilters(!showSigFilters)}
            className="lg:hidden w-full flex items-center justify-between py-2.5 mb-2"
          >
            <div className="flex items-center gap-2">
              <IconFilter />
              <span className="font-mono text-[11px] uppercase tracking-wider text-text-primary">Filters</span>
              {sigActiveFilters > 0 && (
                <span className="bg-gold-primary/15 text-gold-primary border border-gold-primary/30 font-mono text-[9px] tabular-nums px-1.5 py-0.5 rounded-sm">
                  {sigActiveFilters}
                </span>
              )}
            </div>
            <svg
              className={`w-3.5 h-3.5 text-text-muted transition-transform ${showSigFilters ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className={`${showSigFilters ? "block" : "hidden"} lg:block pb-4 border-b border-white/[0.04]`}>
            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-2">
              <FilterField label={t("perf.search_pair")} className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[160px]">
                <input
                  type="text"
                  placeholder="BTC, ETH, SOL..."
                  value={sigSearch}
                  onChange={(e) => setSigSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-secondary border border-white/[0.06] rounded-sm text-text-primary text-sm font-mono placeholder-text-muted/70 focus:outline-none focus:border-gold-primary/40 transition-colors"
                />
              </FilterField>
              <FilterField label={t("perf.status")} className="w-full sm:w-auto">
                <select
                  value={sigStatus}
                  onChange={(e) => setSigStatus(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-surface-secondary border border-white/[0.06] rounded-sm text-text-primary text-sm font-mono focus:outline-none focus:border-gold-primary/40"
                >
                  <option value="all">{t("perf.all_status")}</option>
                  <option value="open">Not Hit</option>
                  <option value="tp1">TP1</option>
                  <option value="tp2">TP2</option>
                  <option value="tp3">TP3</option>
                  <option value="closed_win">TP4 (Win)</option>
                  <option value="closed_loss">Loss</option>
                </select>
              </FilterField>
              <FilterField label={t("perf.risk")} className="w-full sm:w-auto">
                <select
                  value={sigRisk}
                  onChange={(e) => setSigRisk(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-surface-secondary border border-white/[0.06] rounded-sm text-text-primary text-sm font-mono focus:outline-none focus:border-gold-primary/40"
                >
                  <option value="all">{t("perf.all_risk")}</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </FilterField>
              <FilterField label={t("perf.sort")} className="w-full sm:w-auto">
                <select
                  value={sigSort}
                  onChange={(e) => setSigSort(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-surface-secondary border border-white/[0.06] rounded-sm text-text-primary text-sm font-mono focus:outline-none focus:border-gold-primary/40"
                >
                  <option value="created_at">{t("perf.date")}</option>
                  <option value="pair">Pair</option>
                  <option value="entry">Entry</option>
                  <option value="risk_level">Risk</option>
                </select>
              </FilterField>
              <button
                onClick={() => setSigOrder(sigOrder === "desc" ? "asc" : "desc")}
                className="px-3 py-2 bg-surface-secondary border border-white/[0.06] rounded-sm text-text-primary text-sm hover:border-gold-primary/30 transition-colors flex items-center gap-1.5"
              >
                {sigOrder === "desc" ? <IconArrowDown /> : <IconArrowUp />}
                <span className="font-mono text-[11px] uppercase tracking-wider">
                  {sigOrder === "desc" ? t("perf.newest") : "Oldest"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <FullSignalTable
            signals={signals}
            loading={sigLoading}
            onSelect={setSelectedSignal}
            t={t}
          />
        </div>

        {sigTotalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
              <span className="hidden sm:inline">{t("table.page")} </span>
              {sigPage} / {sigTotalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setSigPage((p) => Math.max(1, p - 1))}
                disabled={sigPage <= 1}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  sigPage <= 1
                    ? "text-text-muted/30 cursor-not-allowed bg-white/[0.02] border border-white/[0.04]"
                    : "text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                }`}
              >
                <IconChevronLeft />
                {t("table.prev")}
              </button>
              <button
                onClick={() => setSigPage((p) => Math.min(sigTotalPages, p + 1))}
                disabled={sigPage >= sigTotalPages}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  sigPage >= sigTotalPages
                    ? "text-text-muted/30 cursor-not-allowed bg-white/[0.02] border border-white/[0.04]"
                    : "text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                }`}
              >
                {t("table.next")}
                <IconChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>

      <SignalModal
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   FILTER FIELD WRAPPER
   ────────────────────────────────────────────────────────────── */

const FilterField = ({ label, children, className }) => (
  <div className={className}>
    <label className="font-mono text-[10px] uppercase tracking-wider text-text-muted/80 mb-1.5 block">
      {label}
    </label>
    {children}
  </div>
);

/* ──────────────────────────────────────────────────────────────
   KPI CARD — Flowscan flat hairline pattern
   ────────────────────────────────────────────────────────────── */

const KPICard = ({ label, value, sub, color = "default", accent = false }) => {
  const colorStyles = {
    profit: "text-profit",
    loss: "text-loss",
    gold: "text-gold-primary",
    muted: "text-text-secondary",
    default: "text-text-primary",
  };

  return (
    <div
      className={`group relative rounded-md p-4 border transition-all overflow-hidden ${
        accent
          ? "bg-gradient-to-b from-gold-primary/[0.07] to-transparent border-gold-primary/25"
          : "bg-surface-raised border-white/[0.06] hover:border-white/[0.13]"
      }`}
    >
      {accent && (
        <span className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-gold-primary/80" />
      )}
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/65 mb-2.5 truncate">
        {label}
      </p>
      <p className={`font-mono text-[26px] font-light tabular-nums leading-none ${colorStyles[color]}`}>
        {value}
      </p>
      {sub && (
        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/55 mt-2 tabular-nums truncate">
          {sub}
        </p>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   OUTCOME DISTRIBUTION — Gold opacity gradient + loss
   (consistent with OverviewPage outcome bars pattern)
   ────────────────────────────────────────────────────────────── */

const OutcomeDistribution = ({ data, t }) => {
  const total =
    data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  if (total === 0)
    return (
      <div className="h-40 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
        No closed trades
      </div>
    );

  // Gold opacity gradient for TPs, loss for SL
  const items = [
    { label: "TP1", count: data.tp1_count, color: "rgba(212, 168, 83, 1)" },
    { label: "TP2", count: data.tp2_count, color: "rgba(212, 168, 83, 0.85)" },
    { label: "TP3", count: data.tp3_count, color: "rgba(212, 168, 83, 0.7)" },
    { label: "TP4", count: data.tp4_count, color: "rgba(212, 168, 83, 0.55)" },
    { label: "SL", count: data.sl_count, color: C.loss },
  ];

  return (
    <div className="space-y-3">
      {/* Stack bar */}
      <div className="h-2 rounded-sm overflow-hidden flex bg-white/[0.04] border border-white/[0.04]">
        {items
          .filter((i) => i.count > 0)
          .map((item, idx) => (
            <div
              key={idx}
              style={{
                width: `${(item.count / total) * 100}%`,
                backgroundColor: item.color,
              }}
              className="h-full transition-all duration-700 relative group"
            >
              {(item.count / total) * 100 > 10 && (
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-text-primary/80 tabular-nums">
                  {((item.count / total) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
      </div>

      {/* Detail rows */}
      <div className="space-y-2">
        {items.map((item) => {
          const pct = (item.count / total) * 100;
          const isLoss = item.label === "SL";
          return (
            <div key={item.label} className="flex items-center gap-2.5">
              <span
                className={`font-mono text-[10px] uppercase tracking-wider w-7 ${
                  isLoss ? "text-loss" : "text-gold-primary"
                }`}
              >
                {item.label}
              </span>
              <div className="flex-1 h-1 rounded-sm bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${Math.max(pct, 1)}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 min-w-[80px] justify-end font-mono tabular-nums">
                <span className="text-text-primary text-[11px]">
                  {item.count.toLocaleString()}
                </span>
                <span className="text-text-muted/70 text-[10px] w-[36px] text-right">
                  {pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   WIN RATE TREND CHART — muted profit color
   ────────────────────────────────────────────────────────────── */

const WinRateTrendChart = ({ data, mode, t }) => {
  if (!data || data.length === 0)
    return (
      <div className="h-72 lg:h-96 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
        No trend data available
      </div>
    );

  const chartData = data.map((item) => {
    const d = (() => {
      try {
        const dt = new Date(item.period);
        return isNaN(dt)
          ? item.period
          : dt.toLocaleDateString("en", { month: "short", day: "numeric" });
      } catch {
        return item.period;
      }
    })();
    return {
      period: d,
      fullDate: item.period,
      winRate: item.win_rate,
      winners: item.winners,
      losers: item.losers,
      total: item.total_closed,
    };
  });

  const validRates = chartData.map((d) => d.winRate).filter((v) => v > 0);
  const avgWR = validRates.length > 0
    ? validRates.reduce((s, v) => s + v, 0) / validRates.length
    : 0;

  const maxVol = Math.max(...chartData.map((d) => d.total), 1);

  const bestPeriod = chartData.reduce(
    (best, d) => (d.winRate > (best?.winRate || 0) ? d : best),
    chartData[0]
  );
  const worstPeriod = chartData
    .filter((d) => d.winRate > 0)
    .reduce(
      (worst, d) => (d.winRate < (worst?.winRate || 100) ? d : worst),
      chartData[0]
    );

  const currentWR = chartData.length > 0 ? chartData[chartData.length - 1].winRate : 0;
  const prevWR = chartData.length > 1 ? chartData[chartData.length - 2].winRate : currentWR;
  const wrTrend = currentWR > prevWR ? "up" : currentWR < prevWR ? "down" : "flat";

  const currentColor = currentWR >= 70 ? "text-profit" : currentWR >= 55 ? "text-gold-primary" : "text-loss";

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap font-mono text-[11px] uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <span className="inline-block w-5 h-px bg-profit" />
          <span className="text-text-muted/80">{t("perf.win_rate")}</span>
          <span className={`tabular-nums ${currentColor}`}>{currentWR.toFixed(1)}%</span>
          {wrTrend !== "flat" && (
            <span className={wrTrend === "up" ? "text-profit" : "text-loss"}>
              {wrTrend === "up" ? <IconArrowUpMini /> : <IconArrowDownMini />}
            </span>
          )}
        </div>
        <span className="text-text-muted/40">·</span>
        <span className="text-text-muted/80">
          Avg <span className="text-text-primary tabular-nums">{avgWR.toFixed(1)}%</span>
        </span>
      </div>

      {/* Chart */}
      <div className="h-64 lg:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="winRateArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.profit} stopOpacity={0.18} />
                <stop offset="50%" stopColor={C.profit} stopOpacity={0.05} />
                <stop offset="100%" stopColor={C.profit} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="volBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.gold} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.gold} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="2 4"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />

            <XAxis
              dataKey="period"
              stroke="#6b5c52"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              tickLine={false}
              axisLine={false}
              interval={Math.max(
                0,
                Math.floor(chartData.length / (typeof window !== 'undefined' && window.innerWidth < 640 ? 5 : 10))
              )}
              dy={4}
            />

            <YAxis
              yAxisId="rate"
              stroke="#6b5c52"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
              width={36}
            />

            <YAxis
              yAxisId="vol"
              orientation="right"
              domain={[0, maxVol * 5]}
              hide
            />

            <ReferenceLine
              yAxisId="rate"
              y={avgWR}
              stroke="rgba(212,168,83,0.2)"
              strokeDasharray="4 4"
            />

            <Bar
              yAxisId="vol"
              dataKey="total"
              fill="url(#volBarGrad)"
              radius={[0, 0, 0, 0]}
              maxBarSize={6}
              isAnimationActive={false}
            />

            <Area
              yAxisId="rate"
              type="monotone"
              dataKey="winRate"
              stroke="none"
              fill="url(#winRateArea)"
              fillOpacity={1}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />

            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="winRate"
              stroke={C.profit}
              strokeWidth={1.5}
              dot={false}
              activeDot={{
                r: 4,
                fill: C.profit,
                stroke: "#0a0805",
                strokeWidth: 2,
              }}
              connectNulls
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload.find((p) => p.dataKey === "winRate")?.payload || payload[0]?.payload;
                if (!d) return null;
                const wrColor = d.winRate >= 70 ? "text-profit" : d.winRate >= 55 ? "text-gold-primary" : "text-loss";
                return (
                  <div className="bg-surface border border-white/[0.06] rounded-sm p-3 min-w-[180px] relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
                    <p className="font-mono text-[10px] uppercase tracking-wider text-gold-primary/80 mb-2 pb-2 border-b border-white/[0.04]">
                      {d.fullDate || label}
                    </p>
                    <div className="flex items-center justify-between mb-1.5 font-mono text-[10px] uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-profit" />
                        <span className="text-text-muted">{t("perf.win_rate")}</span>
                      </div>
                      <span className={`tabular-nums ${wrColor}`}>{d.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.04] font-mono text-[10px] tabular-nums">
                      <span className="text-text-muted uppercase tracking-wider">{d.total} {t("perf.trades")}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-profit/80">{d.winners}W</span>
                        <span className="text-text-muted/40">·</span>
                        <span className="text-loss/80">{d.losers}L</span>
                      </div>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: "rgba(212,168,83,0.2)", strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider tabular-nums">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted/70">{t("perf.best")}</span>
            <span className="text-profit">{bestPeriod.winRate.toFixed(0)}%</span>
            <span className="text-text-muted/50">({bestPeriod.period})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted/70">{t("perf.worst")}</span>
            <span className="text-loss">{worstPeriod.winRate.toFixed(0)}%</span>
            <span className="text-text-muted/50">({worstPeriod.period})</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted/70">{chartData.length} periods</span>
          <span className="text-text-muted/40">·</span>
          <span className="text-text-muted/70">
            {chartData.reduce((s, d) => s + d.total, 0).toLocaleString()} {t("perf.trades")}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   RISK:REWARD CHART — Gold opacity gradient (Flowscan-consistent)
   ────────────────────────────────────────────────────────────── */

const RiskRewardChart = ({ data, t }) => {
  if (!data || data.length === 0)
    return (
      <div className="h-44 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
        No data
      </div>
    );

  const allItems = data.filter((d) => d.level !== "SL");
  const maxRR = Math.max(...allItems.map((d) => d.avg_rr), 1);

  // Gold opacity gradient (TP1 most opaque → TP4 most faded)
  const goldOpacity = [1, 0.85, 0.7, 0.55];

  return (
    <div className="space-y-3">
      {allItems.map((item, idx) => {
        const pct = (item.avg_rr / maxRR) * 100;
        const alpha = goldOpacity[idx] || 0.5;
        return (
          <div key={item.level}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: `rgba(212, 168, 83, ${alpha})` }}
                />
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-primary">
                  {item.level}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
                  ({item.count.toLocaleString()} {t("perf.trades")})
                </span>
              </div>
              <span className="font-mono text-sm text-text-primary font-light tabular-nums">
                {item.avg_rr.toFixed(2)}R
              </span>
            </div>
            <div className="h-1.5 rounded-sm bg-white/[0.04] overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  backgroundColor: `rgba(212, 168, 83, ${alpha})`,
                }}
              />
            </div>
          </div>
        );
      })}

      {data.find((d) => d.level === "SL") && (
        <div className="pt-2 border-t border-white/[0.04]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-loss" />
              <span className="font-mono text-[11px] uppercase tracking-wider text-loss">SL</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
                ({data.find((d) => d.level === "SL").count.toLocaleString()} {t("perf.trades")})
              </span>
            </div>
            <span className="font-mono text-sm text-loss font-light tabular-nums">
              -1.00R
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   RISK TREND CHART — muted profit/gold/loss palette
   ────────────────────────────────────────────────────────────── */

const RiskTrendChart = ({ data, mode, t }) => {
  if (!data || data.length === 0)
    return (
      <div className="h-48 lg:h-64 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
        Not enough data
      </div>
    );

  const chartData = data.map((item) => ({
    period: (() => {
      try {
        const d = new Date(item.period);
        return isNaN(d)
          ? item.period
          : d.toLocaleDateString("en", { month: "short", day: "numeric" });
      } catch {
        return item.period;
      }
    })(),
    fullDate: item.period,
    low: item.low_wr,
    normal: item.normal_wr,
    high: item.high_wr,
    lowCount: item.low_count,
    normalCount: item.normal_count,
    highCount: item.high_count,
  }));

  const allRates = chartData
    .flatMap((d) => [d.low, d.normal, d.high])
    .filter((v) => v != null && v > 0);
  const minR = allRates.length > 0 ? Math.min(...allRates) : 0;
  const maxR = allRates.length > 0 ? Math.max(...allRates) : 100;
  const pad = Math.max((maxR - minR) * 0.15, 5);
  const yMin = Math.max(0, Math.floor((minR - pad) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((maxR + pad) / 5) * 5);

  return (
    <div className="h-48 lg:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="period"
            stroke="#6b5c52"
            fontSize={9}
            fontFamily="JetBrains Mono, monospace"
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 10))}
          />
          <YAxis
            stroke="#6b5c52"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
            domain={[yMin, yMax]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div className="bg-surface border border-white/[0.06] rounded-sm p-3 relative overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-gold-primary/80 mb-1.5">
                    {d?.fullDate || label}
                  </p>
                  {d?.low != null && (
                    <p className="font-mono text-[11px] text-profit tabular-nums">
                      <span className="uppercase tracking-wider text-[10px]">{t("perf.low")}</span>: {d.low.toFixed(1)}%{" "}
                      <span className="text-text-muted/70">({d.lowCount})</span>
                    </p>
                  )}
                  {d?.normal != null && (
                    <p className="font-mono text-[11px] text-gold-primary tabular-nums">
                      <span className="uppercase tracking-wider text-[10px]">{t("perf.normal")}</span>: {d.normal.toFixed(1)}%{" "}
                      <span className="text-text-muted/70">({d.normalCount})</span>
                    </p>
                  )}
                  {d?.high != null && (
                    <p className="font-mono text-[11px] text-loss tabular-nums">
                      <span className="uppercase tracking-wider text-[10px]">{t("perf.high")}</span>: {d.high.toFixed(1)}%{" "}
                      <span className="text-text-muted/70">({d.highCount})</span>
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{
              fontSize: "10px",
              paddingTop: "8px",
              fontFamily: "JetBrains Mono, monospace",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          />
          <Line
            type="monotone"
            dataKey="low"
            name={t("perf.low")}
            stroke={C.profit}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: C.profit, stroke: "#0a0805", strokeWidth: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="normal"
            name={t("perf.normal")}
            stroke={C.gold}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: C.gold, stroke: "#0a0805", strokeWidth: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="high"
            name={t("perf.high")}
            stroke={C.loss}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: C.loss, stroke: "#0a0805", strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   TOP PAIRS TABLE — Flowscan table pattern
   ────────────────────────────────────────────────────────────── */

const TopPairsTable = ({ pairs, t }) => {
  const filtered = pairs
    .filter((p) => p.closed_trades >= 5)
    .sort(
      (a, b) =>
        b.win_rate - a.win_rate || b.performance_score - a.performance_score
    )
    .slice(0, 10);

  if (filtered.length === 0)
    return (
      <div className="p-6 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted">
        Not enough data (min 5 closed trades per pair)
      </div>
    );

  // Best TP → gold opacity hierarchy (no rainbow)
  const bestTpAlpha = { TP1: 1, TP2: 0.85, TP3: 0.7, TP4: 0.55 };

  return (
    <div className="px-5 py-4">
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {[t("perf.rank"), t("perf.pair"), t("perf.win_rate"), t("perf.closed"), t("perf.wl"), t("perf.best_tp"), t("perf.score")].map((h) => (
                <th key={h} className="py-2.5 px-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const pair = (p.pair || "").replace("USDT", "");
              const winPct = p.closed_trades > 0 ? p.win_rate : 0;
              const bestTp =
                p.tp4_count > 0 ? "TP4"
                  : p.tp3_count > 0 ? "TP3"
                    : p.tp2_count > 0 ? "TP2"
                      : p.tp1_count > 0 ? "TP1"
                        : "-";
              const tpAlpha = bestTpAlpha[bestTp] || 0.5;
              const winners = p.tp1_count + p.tp2_count + p.tp3_count + p.tp4_count;
              const wrColor = winPct >= 80 ? "text-profit" : winPct >= 60 ? "text-gold-primary" : "text-loss";
              return (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-text-muted/70 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={p.pair} size={18} />
                      <span className="text-text-primary text-[12px]">{pair}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 rounded-sm bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full bg-profit/70 transition-all duration-500"
                          style={{ width: `${winPct}%` }}
                        />
                      </div>
                      <span className={`font-mono text-[12px] tabular-nums ${wrColor}`}>
                        {winPct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-text-primary tabular-nums">
                    {p.closed_trades}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] tabular-nums">
                    <span className="text-profit/80">{winners}</span>
                    <span className="text-text-muted/40 mx-1">/</span>
                    <span className="text-loss/80">{p.sl_count}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className="font-mono text-[11px] uppercase tracking-wider"
                      style={{ color: bestTp === "-" ? C.muted : `rgba(212, 168, 83, ${tpAlpha})` }}
                    >
                      {bestTp}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono text-[12px] text-gold-primary tabular-nums">
                      {p.performance_score.toFixed(0)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-2">
        {filtered.map((p, i) => {
          const pair = (p.pair || "").replace("USDT", "");
          const winPct = p.closed_trades > 0 ? p.win_rate : 0;
          const winners = p.tp1_count + p.tp2_count + p.tp3_count + p.tp4_count;
          const wrColor = winPct >= 80 ? "text-profit" : winPct >= 60 ? "text-gold-primary" : "text-loss";
          return (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.03]">
              <span className="font-mono text-[10px] text-text-muted/70 tabular-nums w-5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <CoinLogo pair={p.pair} size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-[12px]">{pair}</p>
                <p className="font-mono text-[10px] text-text-muted/70 tabular-nums">
                  {p.closed_trades} trades ·{" "}
                  <span className="text-profit/80">{winners}W</span>{" "}
                  <span className="text-loss/80">{p.sl_count}L</span>
                </p>
              </div>
              <span className={`font-mono text-sm font-light tabular-nums ${wrColor}`}>
                {winPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   FULL SIGNAL TABLE — Flowscan pattern (consistent with SignalsTable)
   ────────────────────────────────────────────────────────────── */

const FullSignalTable = ({ signals, loading, onSelect, t }) => {
  const formatPrice = (p) => {
    if (!p) return "-";
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4);
    return p < 100 ? p.toFixed(4) : p.toFixed(2);
  };
  const formatDate = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    return `${dt.getDate()} ${dt.toLocaleDateString("en", { month: "short" })} '${dt.getFullYear().toString().slice(2)} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const getMaxTarget = (s) => {
    const targ = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
    if (!targ.length || !s.entry) return { value: null, pct: null };
    return {
      value: targ[0],
      pct: (((targ[0] - s.entry) / s.entry) * 100).toFixed(2),
    };
  };

  // Flowscan-consistent: all TPs → profit, OPEN → gold, loss → loss
  const statusBadge = (st) => {
    const key = st?.toLowerCase();
    const isProfit = ["tp1", "tp2", "tp3", "closed_win"].includes(key);
    const isLoss = key === "closed_loss";
    const isOpen = key === "open";
    const classes = isProfit
      ? "bg-profit/10 text-profit border-profit/25"
      : isLoss
        ? "bg-loss/10 text-loss border-loss/25"
        : isOpen
          ? "bg-gold-primary/10 text-gold-primary border-gold-primary/25"
          : "bg-white/[0.04] text-text-muted border-white/[0.06]";
    const labels = {
      open: t("perf.not_hit_badge"),
      tp1: "TP1",
      tp2: "TP2",
      tp3: "TP3",
      closed_win: "TP4",
      closed_loss: "LOSS",
    };
    return (
      <span className={`${classes} font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border whitespace-nowrap`}>
        {labels[key] || st}
      </span>
    );
  };

  const riskBadge = (r) => {
    const rl = r?.toLowerCase() || "";
    if (rl.startsWith("low"))
      return "bg-profit/10 text-profit border-profit/25";
    if (rl.startsWith("nor") || rl.startsWith("med"))
      return "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
    if (rl.startsWith("high"))
      return "bg-loss/10 text-loss border-loss/25";
    return "bg-white/[0.04] text-text-muted border-white/[0.06]";
  };

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-white/[0.03] rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  if (!signals || signals.length === 0) {
    return (
      <div className="text-center py-8 font-mono text-[11px] uppercase tracking-wider text-text-muted">
        No signals found
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {[t("perf.pair"), t("perf.entry"), t("perf.max_target"), t("perf.stop_loss"), t("perf.risk"), t("perf.status"), t("perf.mcap"), t("perf.date")].map((h) => (
                <th key={h} className="py-2.5 px-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => {
              const mt = getMaxTarget(s);
              const pair = (s.pair || "").replace("USDT", "");
              return (
                <tr
                  key={i}
                  onClick={() => onSelect(s)}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={s.pair} size={20} />
                      <span className="text-text-primary text-[12px] group-hover:text-gold-primary transition-colors">
                        {pair}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-text-primary tabular-nums">
                    ${formatPrice(s.entry)}
                  </td>
                  <td className="py-2.5 px-3">
                    {mt.value ? (
                      <div className="font-mono tabular-nums">
                        <span className="text-text-primary text-[12px]">${formatPrice(mt.value)}</span>
                        <span className="text-profit/80 text-[10px] ml-1.5">+{mt.pct}%</span>
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.stop1 ? (
                      <div className="font-mono tabular-nums">
                        <span className="text-text-primary text-[12px]">${formatPrice(s.stop1)}</span>
                        {s.entry && (
                          <span className="text-loss/80 text-[10px] ml-1.5">
                            {(((s.stop1 - s.entry) / s.entry) * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.risk_level ? (
                      <span className={`px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-wider border ${riskBadge(s.risk_level)}`}>
                        {s.risk_level}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-text-muted">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">{statusBadge(s.status)}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-text-muted">
                    {s.market_cap || "-"}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] uppercase tracking-wider text-text-muted/70 tabular-nums">
                    {formatDate(s.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-2">
        {signals.map((s, i) => {
          const mt = getMaxTarget(s);
          const pair = (s.pair || "").replace("USDT", "");
          return (
            <div
              key={i}
              onClick={() => onSelect(s)}
              className="bg-surface-raised rounded-md p-3 border border-white/[0.06] active:border-gold-primary/25 transition-all cursor-pointer relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CoinLogo pair={s.pair} size={28} />
                  <div>
                    <p className="text-text-primary text-[12px]">
                      {pair}<span className="text-text-muted/70 font-mono text-[10px] ml-0.5">/USDT</span>
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70 tabular-nums">
                      {formatDate(s.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.risk_level && (
                    <span className={`px-1.5 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-wider border ${riskBadge(s.risk_level)}`}>
                      {s.risk_level}
                    </span>
                  )}
                  {statusBadge(s.status)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/[0.04]">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                    {t("perf.entry")}
                  </p>
                  <p className="font-mono text-[10px] text-text-primary font-light tabular-nums mt-0.5">
                    ${formatPrice(s.entry)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">Target</p>
                  {mt.value ? (
                    <p className="font-mono text-[10px] font-light tabular-nums mt-0.5">
                      <span className="text-text-primary">${formatPrice(mt.value)}</span>{" "}
                      <span className="text-profit/80">+{mt.pct}%</span>
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] text-text-muted">-</p>
                  )}
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">SL</p>
                  {s.stop1 ? (
                    <p className="font-mono text-[10px] font-light tabular-nums mt-0.5">
                      <span className="text-text-primary">${formatPrice(s.stop1)}</span>{" "}
                      <span className="text-loss/80">
                        {s.entry ? (((s.stop1 - s.entry) / s.entry) * 100).toFixed(1) : ""}%
                      </span>
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] text-text-muted">-</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

/* ──────────────────────────────────────────────────────────────
   SVG ICONS — Lucide-style minimal
   ────────────────────────────────────────────────────────────── */

const IconTrend = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 6-6" />
    </svg>
  </div>
);

const IconOutcome = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="14" width="4" height="7" />
      <rect x="10" y="9" width="4" height="12" />
      <rect x="17" y="5" width="4" height="16" />
    </svg>
  </div>
);

const IconRR = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  </div>
);

const IconRisk = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  </div>
);

const IconRiskTrend = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 12l3-3 3 3 7-7" />
      <path d="M14 5h6v6" />
    </svg>
  </div>
);

const IconPairs = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15L5 8h14l-7 7z" />
      <circle cx="12" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="19" cy="8" r="1.5" />
    </svg>
  </div>
);

const IconHistory = () => (
  <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-gold-primary/[0.06] border border-gold-primary/15 text-gold-primary">
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  </div>
);

const IconBolt = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3 L4 14 H11 L9 21 L20 10 H13 L13 3 Z" />
  </svg>
);

const IconFilter = () => (
  <svg className="w-3.5 h-3.5 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const IconArrowUp = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const IconArrowDown = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const IconArrowUpMini = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const IconArrowDownMini = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const IconChevronLeft = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const IconChevronRight = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

/* ──────────────────────────────────────────────────────────────
   LOADING SKELETON
   ────────────────────────────────────────────────────────────── */

const LoadingSkeleton = ({ t }) => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.04}50%{opacity:.12}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(255,255,255,.06);border-radius:2px}`}</style>
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-gold-primary/40" />
      <div className="skel w-40 h-3" />
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-sm p-4 bg-surface-raised border border-white/[0.06]">
          <div className="skel w-16 h-3 mb-2" />
          <div className="skel w-20 h-5" />
        </div>
      ))}
    </div>
    <div className="bg-surface-raised rounded-md p-5 h-72 border border-white/[0.06]">
      <div className="skel w-32 h-3 mb-2" />
      <div className="skel w-48 h-3" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-5 h-56 border border-white/[0.06]" />
      ))}
    </div>
  </div>
);

export default AnalyzePage;