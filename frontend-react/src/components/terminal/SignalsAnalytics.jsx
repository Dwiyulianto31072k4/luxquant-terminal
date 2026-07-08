// ════════════════════════════════════════════════════════════════
// Signals Analytics — Allium-style VISUAL screening over active signals.
//
// NOT a table (the Potential Trades table already exists) — this is the
// chart-first layer: page tabs → global filter chips → KPI cards →
// grid of chart cards. Clicking chart segments narrows the filters,
// so users screen hundreds of coins visually.
//
//   Tabs:  Overview · Live · Intelligence · BTC Correlation · Sectors
//   Data:  GET /api/v1/terminal/screener?days=&scope=active
//          GET /api/v1/market/prices?symbols=          (live Δ from call)
//   Charts: recharts (already used across the codebase)
//   Filters URL-synced (shareable), tab in ?tab=
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, PieChart, Pie, ScatterChart, Scatter, ReferenceLine,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "";

const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── palette (dark + gold house style) ──────────────────────────────
const GOLD = "#d4a853";
const POS = "#4ade80";
const NEG = "#f87171";
const CYAN = "#67e8f9";
const PURPLE = "#a78bfa";
const ORANGE = "#fb923c";
const GRAYBAR = "rgba(255,255,255,0.25)";
const GRID = "rgba(212,168,83,0.06)";
const AXIS = "#a59585";

const STATUS_COLORS = { open: GRAYBAR, tp1: "#2dd4a0", tp2: "#4ade80", tp3: "#86efac" };
const RISK_COLORS = { LOW: POS, NORMAL: GOLD, HIGH: NEG };
const REGIME_COLORS = { normal: GOLD, low_vol: CYAN, high_vol: ORANGE, skip: NEG };

const fmtPct = (v, dp = 1) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;
};

// ── URL-synced global filters ──────────────────────────────────────
const DEFAULTS = { tab: "overview", d: "7", st: "all", risk: "all", sector: "all", regime: "all", beta: "all", dec: "", intel: "", q: "" };
const parseF = (sp) => {
  const f = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((k) => { const v = sp.get(k); if (v != null) f[k] = v; });
  return f;
};
const toParams = (f) => {
  const p = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((k) => { if (f[k] !== DEFAULTS[k]) p.set(k, f[k]); });
  return p;
};

const betaBucket = (b) => {
  if (b == null) return null;
  if (b < 0.8) return "def";
  if (b <= 1.2) return "neu";
  return "agg";
};

// ── shared UI atoms ────────────────────────────────────────────────
const Card = ({ title, desc, children, className = "" }) => (
  <div className={`rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden ${className}`}>
    <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="px-4 pt-3 pb-2 border-b border-white/[0.05]">
      <div className="text-[13px] text-white/90">{title}</div>
      {desc && <div className="text-[10.5px] text-text-muted mt-0.5 leading-relaxed">{desc}</div>}
    </div>
    <div className="p-3">{children}</div>
  </div>
);

const Kpi = ({ label, value, sub, tone }) => (
  <div className="relative rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3 min-w-0">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
    <div className="text-[9px] tracking-[0.18em] font-mono uppercase text-white/40 truncate">{label}</div>
    <div className={`font-mono tabular-nums mt-1 text-xl lg:text-2xl leading-none truncate ${tone || "text-white/95"}`}>{value}</div>
    {sub && <div className="text-[9.5px] font-mono text-text-muted mt-1.5 truncate">{sub}</div>}
  </div>
);

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-2.5 py-1 rounded-sm font-mono text-[9.5px] uppercase tracking-wider border transition-colors ${
      active
        ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
        : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:bg-white/[0.05]"
    }`}
  >
    {children}
  </button>
);

const DarkTip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      {label != null && <div className="text-white/50 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: p.color || p.fill || GOLD }} />
          <span className="text-white/80">{p.name}:</span>
          <span className="text-white tabular-nums">{fmt ? fmt(p.value, p) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// clickable legend chips under donuts
const LegendChips = ({ entries, activeKey, onPick }) => (
  <div className="flex flex-wrap gap-1.5 justify-center mt-1">
    {entries.map((e) => (
      <button
        key={e.key}
        onClick={() => onPick(e.key)}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[9px] uppercase tracking-wider transition-colors ${
          activeKey === e.key
            ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
            : "border-white/[0.06] text-text-muted hover:text-white"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-sm" style={{ background: e.color }} />
        {e.label} · {e.value}
      </button>
    ))}
  </div>
);

// histogram helper → [{x, count, mid}]
function makeBins(values, size, min, max) {
  const bins = [];
  for (let lo = min; lo < max; lo += size) bins.push({ lo, hi: lo + size, count: 0 });
  values.forEach((v) => {
    if (v == null || Number.isNaN(v)) return;
    const c = Math.min(Math.max(v, min), max - 1e-9);
    const idx = Math.min(bins.length - 1, Math.floor((c - min) / size));
    if (idx >= 0) bins[idx].count += 1;
  });
  return bins.map((b) => ({ x: `${b.lo}`, label: `${b.lo}…${b.hi}`, mid: (b.lo + b.hi) / 2, count: b.count }));
}

const CHART_H = 240;

// ════════════════════════════════════════════════════════════════
export default function SignalsAnalytics() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => parseF(searchParams));
  const setF = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSearchParams(toParams(next), { replace: true });
  };
  const resetF = () => setF({ ...DEFAULTS, tab: filters.tab, d: filters.d });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState({});

  const fetchData = useCallback(async (days) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/screener?days=${days}&scope=active`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`http ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchData(filters.d); }, [filters.d, fetchData]);
  useEffect(() => {
    const iv = setInterval(() => fetchData(filters.d), 60000);
    return () => clearInterval(iv);
  }, [filters.d, fetchData]);

  const items = data?.items || [];

  // live prices for every pair in the dataset (batched, 30s)
  const allPairs = useMemo(() => [...new Set(items.map((s) => s.pair).filter(Boolean))], [items]);
  const pairsKey = allPairs.join(",");
  useEffect(() => {
    if (!allPairs.length) return;
    let alive = true;
    const run = async () => {
      const acc = {};
      for (let i = 0; i < allPairs.length; i += 100) {
        const batch = allPairs.slice(i, i + 100);
        try {
          const r = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${batch.join(",")}`);
          if (r.ok) Object.assign(acc, await r.json());
        } catch { /* noop */ }
      }
      if (alive) setPrices((prev) => ({ ...prev, ...acc }));
    };
    run();
    const iv = setInterval(run, 30000);
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);

  const fc = useCallback((s) => {
    const p = prices[s.pair]?.price;
    if (!p || !s.entry) return null;
    return ((p - s.entry) / s.entry) * 100;
  }, [prices]);

  // ── global-filtered set (drives EVERY tab) ───────────────────
  const view = useMemo(() => {
    let out = items;
    const f = filters;
    if (f.q) {
      const q = f.q.trim().toUpperCase();
      out = out.filter((s) => (s.pair || "").toUpperCase().includes(q));
    }
    if (f.st !== "all") out = out.filter((s) => s.status === f.st);
    if (f.risk !== "all") out = out.filter((s) => s.risk_norm === f.risk);
    if (f.sector !== "all") out = out.filter((s) => s.sector === f.sector);
    if (f.regime !== "all") out = out.filter((s) => s.regime === f.regime);
    if (f.beta !== "all") out = out.filter((s) => betaBucket(s.beta_30d) === f.beta);
    if (f.dec === "1") out = out.filter((s) => s.is_decoupled);
    if (f.intel === "1") out = out.filter((s) => s.has_intel);
    return out;
  }, [items, filters]);

  // ── aggregations ─────────────────────────────────────────────
  const agg = useMemo(() => {
    const byDay = {};
    const statusMix = { open: 0, tp1: 0, tp2: 0, tp3: 0 };
    const riskMix = { LOW: 0, NORMAL: 0, HIGH: 0 };
    const regimeMix = {};
    const bySector = {};
    const mtfMatrix = {}; // `${h4}|${m15}` -> count
    let withIntel = 0, confSum = 0, bullAligned = 0, warnCount = 0;
    let smcFvg = 0, smcOb = 0, smcSweep = 0, smcGolden = 0;
    let decoupled = 0, extended = 0, leads = 0, betaSum = 0, betaN = 0;
    let inProfit = 0, fcSum = 0, fcN = 0;
    let best = null, worst = null;
    const fcVals = [], confVals = [], betaVals = [], alignVals = [];
    const scatterOpp = [], scatterBeta = [];
    const decoupledList = [], moversArr = [];

    view.forEach((s) => {
      const day = (s.created_at || "").slice(5, 10);
      if (day) {
        byDay[day] = byDay[day] || { day, open: 0, tp1: 0, tp2: 0, tp3: 0 };
        if (byDay[day][s.status] != null) byDay[day][s.status] += 1;
      }
      if (statusMix[s.status] != null) statusMix[s.status] += 1;
      if (s.risk_norm && riskMix[s.risk_norm] != null) riskMix[s.risk_norm] += 1;
      if (s.regime) regimeMix[s.regime] = (regimeMix[s.regime] || 0) + 1;
      const sec = s.sector || "unclassified";
      bySector[sec] = bySector[sec] || { sector: sec, count: 0, fcSum: 0, fcN: 0, tgtSum: 0, tgtN: 0 };
      bySector[sec].count += 1;

      if (s.has_intel) {
        withIntel += 1;
        confSum += s.confidence_score || 0;
        confVals.push(s.confidence_score || 0);
        const { h4, h1, m15 } = s.mtf || {};
        if (h4 === "BULLISH" && h1 === "BULLISH" && m15 === "BULLISH") bullAligned += 1;
        if (h4 && m15) {
          const k = `${h4}|${m15}`;
          mtfMatrix[k] = (mtfMatrix[k] || 0) + 1;
        }
        if ((s.warnings || []).length) warnCount += 1;
        if ((s.smc?.fvg || 0) > 0) smcFvg += 1;
        if ((s.smc?.ob || 0) > 0) smcOb += 1;
        if ((s.smc?.sweep || 0) > 0) smcSweep += 1;
        if (s.smc?.golden) smcGolden += 1;
      }

      if (s.is_decoupled) decoupled += 1;
      if (s.is_extended) extended += 1;
      if (s.lead_lag_hours != null && s.lead_lag_hours < 0) leads += 1;
      if (s.beta_30d != null) { betaSum += s.beta_30d; betaN += 1; betaVals.push(s.beta_30d); }
      if (s.alignment_score != null) alignVals.push(s.alignment_score);

      const v = fc(s);
      if (v != null) {
        fcVals.push(v);
        moversArr.push({ pair: s.pair, v });
        fcSum += v; fcN += 1;
        if (v > 0) inProfit += 1;
        if (!best || v > best.v) best = { pair: s.pair, v };
        if (!worst || v < worst.v) worst = { pair: s.pair, v };
        if (s.max_target_pct != null)
          scatterOpp.push({ x: v, y: Math.max(0, s.max_target_pct - v), pair: s.pair, risk: s.risk_norm });
        if (s.beta_30d != null)
          scatterBeta.push({ x: s.beta_30d, y: v, pair: s.pair, dec: s.is_decoupled });
        bySector[sec].fcSum += v; bySector[sec].fcN += 1;
        if (s.is_decoupled) decoupledList.push({ pair: s.pair, v });
      }
      if (s.max_target_pct != null) { bySector[sec].tgtSum += s.max_target_pct; bySector[sec].tgtN += 1; }
    });

    const days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
    const sectors = Object.values(bySector)
      .map((x) => ({
        sector: x.sector, count: x.count,
        avgFc: x.fcN ? x.fcSum / x.fcN : null,
        avgTgt: x.tgtN ? x.tgtSum / x.tgtN : null,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      days, statusMix, riskMix, regimeMix, sectors, mtfMatrix,
      withIntel, avgConf: withIntel ? Math.round(confSum / withIntel) : null,
      bullAligned, warnCount, smc: { fvg: smcFvg, ob: smcOb, sweep: smcSweep, golden: smcGolden },
      decoupled, extended, leads,
      avgBeta: betaN ? betaSum / betaN : null,
      inProfit, avgFc: fcN ? fcSum / fcN : null, fcN,
      best, worst, fcVals, confVals, betaVals, alignVals,
      scatterOpp, scatterBeta,
      decoupledList: decoupledList.sort((a, b) => b.v - a.v),
      movers: moversArr,
    };
  }, [view, fc]);

  const gainers = useMemo(
    () => [...new Map(agg.movers.map((m) => [m.pair, m])).values()].sort((a, b) => b.v - a.v).slice(0, 8),
    [agg.movers],
  );
  const losers = useMemo(
    () => [...new Map(agg.movers.map((m) => [m.pair, m])).values()].sort((a, b) => a.v - b.v).slice(0, 8),
    [agg.movers],
  );

  const TABS = [
    ["overview", t("terminal.viz.tabOverview")],
    ["live", t("terminal.viz.tabLive")],
    ["intel", t("terminal.viz.tabIntel")],
    ["btc", t("terminal.viz.tabBtc")],
    ["sectors", t("terminal.viz.tabSectors")],
  ];
  const tab = filters.tab;

  const hasDrill = ["st", "risk", "sector", "regime", "beta", "dec", "intel", "q"].some((k) => filters[k] !== DEFAULTS[k]);

  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* ── page tabs (Allium-style) ── */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setF({ tab: id })}
            className={`relative shrink-0 px-3.5 py-2 text-[12.5px] transition-colors ${
              tab === id ? "text-gold-primary" : "text-text-muted hover:text-white"
            }`}
          >
            {label}
            {tab === id && <span className="absolute left-3 right-3 bottom-0 h-[2px] bg-gold-primary rounded-full" />}
          </button>
        ))}
        <div className="ml-auto hidden sm:flex items-center gap-2 pr-1">
          {data?.generated_at && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
              {view.length} {t("terminal.viz.signals")} · {new Date(data.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── global filter chips ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={filters.q}
          onChange={(e) => setF({ q: e.target.value })}
          placeholder={t("terminal.viz.searchPair")}
          className="w-36 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[11.5px] text-white placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 font-mono"
        />
        <div className="flex gap-1">
          {["3", "7", "14", "30"].map((d) => (
            <Chip key={d} active={filters.d === d} onClick={() => setF({ d })}>{d}D</Chip>
          ))}
        </div>
        <span className="h-4 w-px bg-white/[0.08]" />
        <div className="flex gap-1">
          {["all", "open", "tp1", "tp2", "tp3"].map((s) => (
            <Chip key={s} active={filters.st === s} onClick={() => setF({ st: s })}>
              {s === "all" ? t("terminal.viz.all") : s}
            </Chip>
          ))}
        </div>
        <span className="h-4 w-px bg-white/[0.08]" />
        <Chip active={filters.dec === "1"} onClick={() => setF({ dec: filters.dec === "1" ? "" : "1" })}>
          ⚡ {t("terminal.viz.decoupled")}
        </Chip>
        <Chip active={filters.intel === "1"} onClick={() => setF({ intel: filters.intel === "1" ? "" : "1" })}>
          ◎ {t("terminal.viz.intelOnly")}
        </Chip>
        {/* drill chips set by chart clicks */}
        {filters.risk !== "all" && (
          <Chip active onClick={() => setF({ risk: "all" })}>risk: {filters.risk} ✕</Chip>
        )}
        {filters.sector !== "all" && (
          <Chip active onClick={() => setF({ sector: "all" })}>{filters.sector} ✕</Chip>
        )}
        {filters.regime !== "all" && (
          <Chip active onClick={() => setF({ regime: "all" })}>{filters.regime} ✕</Chip>
        )}
        {filters.beta !== "all" && (
          <Chip active onClick={() => setF({ beta: "all" })}>β: {filters.beta} ✕</Chip>
        )}
        {hasDrill && (
          <button
            onClick={resetF}
            className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-text-muted hover:text-negative transition-colors"
          >
            × {t("terminal.viz.reset")}
          </button>
        )}
      </div>

      {/* ── loading / error ── */}
      {loading && !data && (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-24 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.loading")}</span>
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-negative/25 bg-negative/[0.06] px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-[11px] text-negative">⚠ {t("terminal.viz.error")}</span>
          <button
            onClick={() => fetchData(filters.d)}
            className="px-3 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-negative/15 text-negative border border-negative/30"
          >
            ↻
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ═══════════ TAB: OVERVIEW ═══════════ */}
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Kpi label={t("terminal.viz.kActive")} value={view.length} sub={`${filters.d}D ${t("terminal.viz.window")}`} />
                <Kpi
                  label={t("terminal.viz.kInProfit")}
                  value={agg.fcN ? `${Math.round((agg.inProfit / agg.fcN) * 100)}%` : "—"}
                  sub={agg.fcN ? `${agg.inProfit}/${agg.fcN} ${t("terminal.viz.live")}` : undefined}
                  tone="text-positive"
                />
                <Kpi label={t("terminal.viz.kAvgConf")} value={agg.avgConf ?? "—"} sub={`${agg.withIntel} ${t("terminal.viz.withIntel")}`} tone="text-gold-primary" />
                <Kpi label={t("terminal.viz.kDecoupled")} value={agg.decoupled} tone={agg.decoupled ? "text-cyan-400" : undefined} />
                <Kpi label={t("terminal.viz.kSectors")} value={agg.sectors.filter((s) => s.sector !== "unclassified").length} />
              </div>

              <Card title={t("terminal.viz.flowTitle")} desc={t("terminal.viz.flowDesc")}>
                <div style={{ height: CHART_H }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agg.days} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                      {["open", "tp1", "tp2", "tp3"].map((k) => (
                        <Bar key={k} dataKey={k} stackId="s" fill={STATUS_COLORS[k]} radius={k === "tp3" ? [2, 2, 0, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <LegendChips
                  entries={["open", "tp1", "tp2", "tp3"].map((k) => ({ key: k, label: k, value: agg.statusMix[k], color: STATUS_COLORS[k] }))}
                  activeKey={filters.st}
                  onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                />
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card title={t("terminal.viz.statusTitle")} desc={t("terminal.viz.statusDesc")}>
                  <Donut
                    data={Object.entries(agg.statusMix).map(([k, v]) => ({ name: k, value: v, color: STATUS_COLORS[k] }))}
                    active={filters.st}
                    onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                  />
                </Card>
                <Card title={t("terminal.viz.riskTitle")} desc={t("terminal.viz.riskDesc")}>
                  <Donut
                    data={Object.entries(agg.riskMix).map(([k, v]) => ({ name: k, value: v, color: RISK_COLORS[k] }))}
                    active={filters.risk}
                    onPick={(k) => setF({ risk: filters.risk === k ? "all" : k })}
                  />
                </Card>
                <Card title={t("terminal.viz.regimeTitle")} desc={t("terminal.viz.regimeDesc")}>
                  <Donut
                    data={Object.entries(agg.regimeMix).map(([k, v]) => ({ name: k, value: v, color: REGIME_COLORS[k] || GRAYBAR }))}
                    active={filters.regime}
                    onPick={(k) => setF({ regime: filters.regime === k ? "all" : k })}
                  />
                </Card>
              </div>

              <Card title={t("terminal.viz.sectorCountTitle")} desc={t("terminal.viz.sectorCountDesc")}>
                <SectorBars
                  data={agg.sectors.slice(0, 12)}
                  dataKey="count"
                  color={() => GOLD}
                  fmt={(v) => v}
                  onPick={(sec) => setF({ sector: filters.sector === sec ? "all" : sec })}
                />
              </Card>
            </>
          )}

          {/* ═══════════ TAB: LIVE ═══════════ */}
          {tab === "live" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label={t("terminal.viz.kAvgFc")} value={fmtPct(agg.avgFc)} tone={agg.avgFc > 0 ? "text-positive" : "text-negative"} sub={`${agg.fcN} ${t("terminal.viz.live")}`} />
                <Kpi label={t("terminal.viz.kInProfit")} value={agg.fcN ? `${agg.inProfit}` : "—"} sub={agg.fcN ? `${Math.round((agg.inProfit / agg.fcN) * 100)}% of ${agg.fcN}` : undefined} tone="text-positive" />
                <Kpi label={t("terminal.viz.kBest")} value={agg.best ? fmtPct(agg.best.v) : "—"} sub={agg.best?.pair} tone="text-positive" />
                <Kpi label={t("terminal.viz.kWorst")} value={agg.worst ? fmtPct(agg.worst.v) : "—"} sub={agg.worst?.pair} tone="text-negative" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.fcDistTitle")} desc={t("terminal.viz.fcDistDesc")}>
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={makeBins(agg.fcVals, 2, -20, 20)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                        <ReferenceLine x="0" stroke={GOLD} strokeDasharray="3 3" />
                        <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                          {makeBins(agg.fcVals, 2, -20, 20).map((b, i) => (
                            <Cell key={i} fill={b.mid >= 0 ? POS : NEG} fillOpacity={0.75} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title={t("terminal.viz.oppTitle")} desc={t("terminal.viz.oppDesc")}>
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} />
                        <XAxis type="number" dataKey="x" name="Δ call %" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} unit="%" />
                        <YAxis type="number" dataKey="y" name="upside left %" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                        <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                        <Scatter data={agg.scatterOpp} fillOpacity={0.8}>
                          {agg.scatterOpp.map((p, i) => (
                            <Cell key={i} fill={RISK_COLORS[p.risk] || GRAYBAR} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                    {t("terminal.viz.oppHint")}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.topGainers")} desc={t("terminal.viz.topGainersDesc")}>
                  <MoverBars data={gainers} positive />
                </Card>
                <Card title={t("terminal.viz.topLosers")} desc={t("terminal.viz.topLosersDesc")}>
                  <MoverBars data={losers} />
                </Card>
              </div>
            </>
          )}

          {/* ═══════════ TAB: INTELLIGENCE ═══════════ */}
          {tab === "intel" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label={t("terminal.viz.kWithIntel")} value={`${agg.withIntel}/${view.length}`} />
                <Kpi label={t("terminal.viz.kAvgConf")} value={agg.avgConf ?? "—"} tone="text-gold-primary" />
                <Kpi label={t("terminal.viz.kBullAligned")} value={agg.bullAligned} tone={agg.bullAligned ? "text-positive" : undefined} />
                <Kpi label={t("terminal.viz.kWarnings")} value={agg.warnCount} tone={agg.warnCount ? "text-warning" : undefined} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.confDistTitle")} desc={t("terminal.viz.confDistDesc")}>
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={makeBins(agg.confVals, 10, 0, 100)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                        <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                          {makeBins(agg.confVals, 10, 0, 100).map((b, i) => (
                            <Cell key={i} fill={b.mid >= 70 ? POS : b.mid >= 40 ? GOLD : GRAYBAR} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title={t("terminal.viz.mtfTitle")} desc={t("terminal.viz.mtfDesc")}>
                  <MtfMatrix matrix={agg.mtfMatrix} />
                </Card>
              </div>

              <Card title={t("terminal.viz.smcTitle")} desc={t("terminal.viz.smcDesc")}>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: "FVG", v: agg.smc.fvg, c: CYAN },
                        { name: "Order Block", v: agg.smc.ob, c: PURPLE },
                        { name: "Liquidity Sweep", v: agg.smc.sweep, c: ORANGE },
                        { name: "Golden Setup", v: agg.smc.golden, c: GOLD },
                      ]}
                      margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                      <Bar dataKey="v" name="signals" radius={[2, 2, 0, 0]}>
                        {[CYAN, PURPLE, ORANGE, GOLD].map((c, i) => <Cell key={i} fill={c} fillOpacity={0.8} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}

          {/* ═══════════ TAB: BTC CORRELATION ═══════════ */}
          {tab === "btc" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label={t("terminal.viz.kAvgBeta")} value={agg.avgBeta != null ? agg.avgBeta.toFixed(2) : "—"} />
                <Kpi label={t("terminal.viz.kDecoupled")} value={agg.decoupled} tone={agg.decoupled ? "text-cyan-400" : undefined} />
                <Kpi label={t("terminal.viz.kExtended")} value={agg.extended} tone={agg.extended ? "text-orange-400" : undefined} />
                <Kpi label={t("terminal.viz.kLeads")} value={agg.leads} tone={agg.leads ? "text-purple-400" : undefined} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.betaDistTitle")} desc={t("terminal.viz.betaDistDesc")}>
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={makeBins(agg.betaVals, 0.25, 0, 2.5)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                        <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                          {makeBins(agg.betaVals, 0.25, 0, 2.5).map((b, i) => (
                            <Cell key={i} fill={b.mid < 0.8 ? POS : b.mid <= 1.2 ? GOLD : NEG} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <LegendChips
                    entries={[
                      { key: "def", label: t("terminal.viz.betaDef"), value: agg.betaVals.filter((b) => b < 0.8).length, color: POS },
                      { key: "neu", label: t("terminal.viz.betaNeu"), value: agg.betaVals.filter((b) => b >= 0.8 && b <= 1.2).length, color: GOLD },
                      { key: "agg", label: t("terminal.viz.betaAgg"), value: agg.betaVals.filter((b) => b > 1.2).length, color: NEG },
                    ]}
                    activeKey={filters.beta}
                    onPick={(k) => setF({ beta: filters.beta === k ? "all" : k })}
                  />
                </Card>

                <Card title={t("terminal.viz.betaPerfTitle")} desc={t("terminal.viz.betaPerfDesc")}>
                  <div style={{ height: CHART_H }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} />
                        <XAxis type="number" dataKey="x" name="β 30d" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                        <YAxis type="number" dataKey="y" name="Δ call %" tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                        <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                        <ReferenceLine x={1} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                        <Scatter data={agg.scatterBeta} fillOpacity={0.8}>
                          {agg.scatterBeta.map((p, i) => (
                            <Cell key={i} fill={p.dec ? CYAN : GRAYBAR} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                    {t("terminal.viz.betaPerfHint")}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.alignTitle")} desc={t("terminal.viz.alignDesc")}>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={makeBins(agg.alignVals, 10, 0, 100)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="x" tick={{ fill: AXIS, fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                        <Bar dataKey="count" name="signals" fill={PURPLE} fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title={t("terminal.viz.decListTitle")} desc={t("terminal.viz.decListDesc")}>
                  {agg.decoupledList.length === 0 ? (
                    <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {t("terminal.viz.none")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 py-2">
                      {agg.decoupledList.slice(0, 24).map((d) => (
                        <span key={d.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-cyan-400/25 bg-cyan-400/[0.06] font-mono text-[10px]">
                          <span className="text-cyan-300">{d.pair}</span>
                          <span className={d.v >= 0 ? "text-positive" : "text-negative"}>{fmtPct(d.v)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}

          {/* ═══════════ TAB: SECTORS ═══════════ */}
          {tab === "sectors" && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Card title={t("terminal.viz.sectorCountTitle")} desc={t("terminal.viz.sectorCountDesc")}>
                  <SectorBars
                    data={agg.sectors.slice(0, 12)}
                    dataKey="count"
                    color={() => GOLD}
                    fmt={(v) => v}
                    onPick={(sec) => setF({ sector: filters.sector === sec ? "all" : sec })}
                  />
                </Card>
                <Card title={t("terminal.viz.sectorFcTitle")} desc={t("terminal.viz.sectorFcDesc")}>
                  <SectorBars
                    data={agg.sectors.filter((s) => s.avgFc != null).slice(0, 12)}
                    dataKey="avgFc"
                    color={(v) => (v >= 0 ? POS : NEG)}
                    fmt={(v) => fmtPct(v)}
                    onPick={(sec) => setF({ sector: filters.sector === sec ? "all" : sec })}
                    diverging
                  />
                </Card>
              </div>
              <Card title={t("terminal.viz.sectorTgtTitle")} desc={t("terminal.viz.sectorTgtDesc")}>
                <SectorBars
                  data={agg.sectors.filter((s) => s.avgTgt != null).slice(0, 12)}
                  dataKey="avgTgt"
                  color={() => GOLD}
                  fmt={(v) => fmtPct(v, 0)}
                  onPick={(sec) => setF({ sector: filters.sector === sec ? "all" : sec })}
                />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── donut with clickable legend ────────────────────────────────────
function Donut({ data, active, onPick }) {
  const clean = data.filter((d) => d.value > 0);
  return (
    <>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={clean}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="none"
            >
              {clean.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={active === d.name ? 1 : 0.75} />
              ))}
            </Pie>
            <Tooltip content={<DarkTip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendChips
        entries={clean.map((d) => ({ key: d.name, label: d.name, value: d.value, color: d.color }))}
        activeKey={active}
        onPick={onPick}
      />
    </>
  );
}

// ── horizontal sector bars (custom divs — crisp, clickable) ────────
function SectorBars({ data, dataKey, color, fmt, onPick, diverging = false }) {
  if (!data.length)
    return <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">—</div>;
  const max = Math.max(...data.map((d) => Math.abs(d[dataKey] || 0))) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d) => {
        const v = d[dataKey] || 0;
        const w = (Math.abs(v) / max) * 100;
        const c = color(v);
        return (
          <button
            key={d.sector}
            onClick={() => onPick(d.sector)}
            className="w-full flex items-center gap-2 group"
            title={d.sector}
          >
            <span className="w-28 shrink-0 text-left font-mono text-[10px] text-text-muted group-hover:text-white truncate transition-colors">
              {d.sector}
            </span>
            <span className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden relative">
              {diverging ? (
                <span
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{
                    background: c, opacity: 0.75,
                    left: v >= 0 ? "50%" : `${50 - w / 2}%`,
                    width: `${w / 2}%`,
                  }}
                />
              ) : (
                <span className="absolute top-0 bottom-0 left-0 rounded-sm" style={{ background: c, opacity: 0.75, width: `${w}%` }} />
              )}
              {diverging && <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/15" />}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums" style={{ color: c }}>
              {fmt(v)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── top movers ranked bars ─────────────────────────────────────────
function MoverBars({ data, positive = false }) {
  if (!data.length)
    return <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">—</div>;
  const max = Math.max(...data.map((d) => Math.abs(d.v))) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d) => (
        <div key={d.pair} className="flex items-center gap-2">
          <span className="w-24 shrink-0 font-mono text-[10.5px] text-white/85 truncate">{d.pair}</span>
          <span className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden">
            <span
              className="block h-full rounded-sm"
              style={{ width: `${(Math.abs(d.v) / max) * 100}%`, background: d.v >= 0 ? POS : NEG, opacity: 0.7 }}
            />
          </span>
          <span className={`w-16 shrink-0 text-right font-mono text-[10.5px] tabular-nums ${d.v >= 0 ? "text-positive" : "text-negative"}`}>
            {fmtPct(d.v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── MTF alignment matrix (H4 rows × M15 cols) ──────────────────────
function MtfMatrix({ matrix }) {
  const TR = ["BULLISH", "RANGING", "BEARISH"];
  const max = Math.max(1, ...Object.values(matrix));
  const cellColor = (h4, m15, n) => {
    if (!n) return "rgba(255,255,255,0.02)";
    const a = 0.15 + (n / max) * 0.65;
    if (h4 === "BULLISH" && m15 === "BULLISH") return `rgba(74,222,128,${a})`;
    if (h4 === "BEARISH" && m15 === "BEARISH") return `rgba(248,113,113,${a})`;
    return `rgba(212,168,83,${a})`;
  };
  return (
    <div className="py-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: "70px repeat(3, 1fr)" }}>
        <div />
        {TR.map((c) => (
          <div key={c} className="text-center font-mono text-[8.5px] uppercase tracking-wider text-text-muted">
            M15 {c.slice(0, 4)}
          </div>
        ))}
        {TR.map((h4) => (
          <Fragment key={h4}>
            <div className="flex items-center font-mono text-[8.5px] uppercase tracking-wider text-text-muted">
              H4 {h4.slice(0, 4)}
            </div>
            {TR.map((m15) => {
              const n = matrix[`${h4}|${m15}`] || 0;
              return (
                <div
                  key={`${h4}|${m15}`}
                  className="h-12 rounded-md flex items-center justify-center font-mono text-[13px] text-white/90 tabular-nums"
                  style={{ background: cellColor(h4, m15, n) }}
                  title={`H4 ${h4} × M15 ${m15}: ${n}`}
                >
                  {n || ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
        H4 trend × M15 trend — darker = more signals
      </div>
    </div>
  );
}

// scatter tooltip showing pair
function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="text-white mb-0.5">{p.pair}</div>
      <div className="text-white/60">x: <span className="text-white/90">{Number(p.x).toFixed(2)}</span></div>
      <div className="text-white/60">y: <span className="text-white/90">{Number(p.y).toFixed(2)}</span></div>
    </div>
  );
}
