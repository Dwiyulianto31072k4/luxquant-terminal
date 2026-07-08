// ════════════════════════════════════════════════════════════════
// Deep Screener — screen ACTIVE signals across EVERY intel metric.
//
// One row per signal, all layers joined server-side by signal_id:
//   core (entry/targets/risk) · enrichment (confidence/rating/regime/
//   MTF/SMC/F&G) · BTC correlation (beta/decoupled/lead-lag/alignment)
//   · coin fundamentals (sector) · live price (Δ from call).
//
// Data:  GET /api/v1/terminal/screener?days=&scope=   (new endpoint)
//        GET /api/v1/market/prices?symbols=           (existing, 30s poll)
// All deep filtering is CLIENT-side and URL-synced (shareable links).
// Row click → Trade Replay deep-link.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const API_BASE = import.meta.env.VITE_API_URL || "";

const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── formatting ─────────────────────────────────────────────────────
const fmtPrice = (val) => {
  const p = Number(val);
  if (Number.isNaN(p) || p <= 0) return "—";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p < 100 ? p.toFixed(4) : p.toFixed(2);
};
const fmtPct = (v, dp = 1) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;
};
const ageHuman = (iso) => {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const h = Math.floor(ms / 3600e3);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60e3))}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ""}`;
};

const STATUS_STYLE = {
  open: "bg-white/[0.06] text-white/70 border-white/[0.1]",
  tp1: "bg-positive/10 text-positive border-positive/25",
  tp2: "bg-positive/10 text-positive border-positive/25",
  tp3: "bg-positive/15 text-positive border-positive/30",
};
const TREND_DOT = {
  BULLISH: "bg-positive",
  BEARISH: "bg-negative",
  RANGING: "bg-warning/70",
};
const REGIME_STYLE = {
  normal: "text-white/70",
  low_vol: "text-cyan-400/80",
  high_vol: "text-orange-400/80",
  skip: "text-negative/80",
};

const betaBucket = (b) => {
  if (b == null) return null;
  if (b < 0.8) return "def";
  if (b <= 1.2) return "neu";
  return "agg";
};

// ── URL-synced filter state ───────────────────────────────────────
const DEFAULTS = {
  q: "", st: "all", risk: "all", conf: "0", mtf: "all", regime: "all",
  smc: "any", beta: "all", dec: "", ext: "", intel: "", sector: "all",
  sort: "newest", d: "7",
};
const parseF = (sp) => {
  const f = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((k) => {
    const v = sp.get(k);
    if (v != null) f[k] = v;
  });
  return f;
};
const toParams = (f) => {
  const p = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((k) => {
    if (f[k] !== DEFAULTS[k]) p.set(k, f[k]);
  });
  return p;
};

// ── small UI atoms ─────────────────────────────────────────────────
const Chip = ({ active, onClick, children, tone = "gold" }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-2.5 py-1 rounded-sm font-mono text-[9.5px] uppercase tracking-wider border transition-colors ${
      active
        ? tone === "gold"
          ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
          : "bg-white/10 text-white border-white/[0.15]"
        : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:bg-white/[0.05]"
    }`}
  >
    {children}
  </button>
);

const Select = ({ value, onChange, options, label }) => (
  <label className="flex items-center gap-1.5 shrink-0">
    <span className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted/70">
      {label}
    </span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#120809] border border-white/[0.08] rounded-sm px-1.5 py-1 font-mono text-[10px] text-white/85 focus:outline-none focus:border-gold-primary/40"
    >
      {options.map(([v, lbl]) => (
        <option key={v} value={v}>{lbl}</option>
      ))}
    </select>
  </label>
);

const Kpi = ({ label, value, tone }) => (
  <div className="relative rounded-lg bg-[#0c0a07] border border-white/[0.07] px-3.5 py-2.5 min-w-0">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
    <div className="text-[8.5px] tracking-[0.18em] font-mono uppercase text-white/40 truncate">{label}</div>
    <div className={`font-mono tabular-nums mt-0.5 text-lg leading-none ${tone || "text-white/95"}`}>{value}</div>
  </div>
);

const MtfDots = ({ mtf }) => {
  const cells = [["4H", mtf?.h4], ["1H", mtf?.h1], ["15", mtf?.m15]];
  return (
    <div className="flex items-center gap-1">
      {cells.map(([lbl, tr]) => (
        <span key={lbl} title={`${lbl}: ${tr || "no data"}`} className="flex items-center gap-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${TREND_DOT[tr] || "bg-white/15"}`} />
        </span>
      ))}
    </div>
  );
};

const ConfBar = ({ score }) => {
  if (score == null) return <span className="text-text-muted/60 font-mono text-[10px]">—</span>;
  const tone = score >= 70 ? "bg-positive" : score >= 40 ? "bg-warning" : "bg-white/30";
  return (
    <div className="flex items-center gap-1.5 min-w-[64px]">
      <div className="flex-1 h-1 rounded-full bg-white/[0.07] overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="font-mono text-[10px] text-white/80 tabular-nums w-6 text-right">{score}</span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
export default function DeepScreenerView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState(() => parseF(searchParams));
  const setF = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSearchParams(toParams(next), { replace: true });
  };
  const resetF = () => {
    setFilters({ ...DEFAULTS });
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState({});

  // ── fetch screener rows ──────────────────────────────────────
  const fetchData = useCallback(async (days) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/v1/terminal/screener?days=${days}&scope=active`,
        { headers: authHeaders() },
      );
      if (!r.ok) throw new Error(`http ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(filters.d); }, [filters.d, fetchData]);

  // auto-refresh every 60s (cache TTL server-side)
  useEffect(() => {
    const iv = setInterval(() => fetchData(filters.d), 60000);
    return () => clearInterval(iv);
  }, [filters.d, fetchData]);

  const items = data?.items || [];

  // sector options discovered from data
  const sectors = useMemo(() => {
    const s = new Set(items.map((i) => i.sector).filter(Boolean));
    return [...s].sort();
  }, [items]);

  // ── deep client-side filtering ───────────────────────────────
  const filtered = useMemo(() => {
    let out = items;
    const f = filters;

    if (f.q) {
      const q = f.q.trim().toUpperCase();
      out = out.filter((s) => (s.pair || "").toUpperCase().includes(q));
    }
    if (f.st !== "all") out = out.filter((s) => s.status === f.st);
    if (f.risk !== "all") out = out.filter((s) => (s.risk_norm || "").toLowerCase() === f.risk);
    const confMin = Number(f.conf) || 0;
    if (confMin > 0) out = out.filter((s) => (s.confidence_score ?? -1) >= confMin);
    if (f.mtf === "bull_aligned")
      out = out.filter((s) => s.mtf?.h4 === "BULLISH" && s.mtf?.h1 === "BULLISH" && s.mtf?.m15 === "BULLISH");
    else if (f.mtf === "h4_bull") out = out.filter((s) => s.mtf?.h4 === "BULLISH");
    else if (f.mtf === "not_bear")
      out = out.filter((s) => s.has_intel && s.mtf?.h4 !== "BEARISH" && s.mtf?.h1 !== "BEARISH" && s.mtf?.m15 !== "BEARISH");
    if (f.regime !== "all") out = out.filter((s) => s.regime === f.regime);
    if (f.smc === "active")
      out = out.filter((s) => (s.smc?.fvg || 0) + (s.smc?.ob || 0) + (s.smc?.sweep || 0) > 0);
    else if (f.smc === "golden") out = out.filter((s) => s.smc?.golden);
    if (f.beta !== "all") out = out.filter((s) => betaBucket(s.beta_30d) === f.beta);
    if (f.dec === "1") out = out.filter((s) => s.is_decoupled);
    if (f.ext === "1") out = out.filter((s) => !s.is_extended);
    if (f.intel === "1") out = out.filter((s) => s.has_intel);
    if (f.sector !== "all") out = out.filter((s) => s.sector === f.sector);

    // sorting
    const fromCall = (s) => {
      const p = prices[s.pair]?.price;
      if (!p || !s.entry) return null;
      return ((p - s.entry) / s.entry) * 100;
    };
    const cmp = {
      newest: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      conf: (a, b) => (b.confidence_score ?? -1) - (a.confidence_score ?? -1),
      beta: (a, b) => (b.beta_30d ?? -99) - (a.beta_30d ?? -99),
      align: (a, b) => (b.alignment_score ?? -1) - (a.alignment_score ?? -1),
      tgt: (a, b) => (b.max_target_pct ?? -999) - (a.max_target_pct ?? -999),
      fromcall: (a, b) => (fromCall(b) ?? -999) - (fromCall(a) ?? -999),
    }[f.sort] || null;
    if (cmp) out = [...out].sort(cmp);

    return out;
  }, [items, filters, prices]);

  // ── live prices for pairs in view (batch 100, 30s) ───────────
  const pricePairs = useMemo(
    () => [...new Set(filtered.map((s) => s.pair).filter(Boolean))],
    [filtered],
  );
  const pairsKey = pricePairs.join(",");
  useEffect(() => {
    if (!pricePairs.length) return;
    let alive = true;
    const run = async () => {
      const acc = {};
      for (let i = 0; i < pricePairs.length; i += 100) {
        const batch = pricePairs.slice(i, i + 100);
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

  // ── KPI strip values ─────────────────────────────────────────
  const kpis = useMemo(() => {
    const withIntel = filtered.filter((s) => s.has_intel);
    const avgConf = withIntel.length
      ? Math.round(withIntel.reduce((a, s) => a + (s.confidence_score || 0), 0) / withIntel.length)
      : null;
    return {
      inView: filtered.length,
      avgConf,
      decoupled: filtered.filter((s) => s.is_decoupled).length,
      smcActive: filtered.filter((s) => (s.smc?.fvg || 0) + (s.smc?.ob || 0) + (s.smc?.sweep || 0) > 0).length,
      noIntel: filtered.length - withIntel.length,
    };
  }, [filtered]);

  const goReplay = (id) => navigate(`/terminal/replay/${id}`);

  const fromCallPct = (s) => {
    const p = prices[s.pair]?.price;
    if (!p || !s.entry) return null;
    return ((p - s.entry) / s.entry) * 100;
  };

  const hasActive = toParams(filters).toString().length > 0;

  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Kpi label={t("terminal.scan.inView")} value={kpis.inView} />
        <Kpi label={t("terminal.scan.avgConf")} value={kpis.avgConf ?? "—"} tone="text-gold-primary" />
        <Kpi label={t("terminal.scan.decoupled")} value={kpis.decoupled} tone={kpis.decoupled ? "text-cyan-400" : undefined} />
        <Kpi label={t("terminal.scan.smcActive")} value={kpis.smcActive} tone={kpis.smcActive ? "text-positive" : undefined} />
        <Kpi label={t("terminal.scan.noIntel")} value={kpis.noIntel} tone="text-text-muted" />
      </div>

      {/* ── filter bar ── */}
      <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] p-3 space-y-2.5">
        <div className="h-px -mt-3 -mx-3 mb-2 bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        {/* row 1: search + window + status + quick toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={filters.q}
            onChange={(e) => setF({ q: e.target.value })}
            placeholder={t("terminal.scan.searchPair")}
            className="w-40 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 font-mono"
          />
          <div className="flex gap-1">
            {["3", "7", "14", "30"].map((d) => (
              <Chip key={d} active={filters.d === d} onClick={() => setF({ d })} tone="white">
                {d}D
              </Chip>
            ))}
          </div>
          <span className="h-4 w-px bg-white/[0.08]" />
          <div className="flex gap-1">
            {["all", "open", "tp1", "tp2", "tp3"].map((s) => (
              <Chip key={s} active={filters.st === s} onClick={() => setF({ st: s })}>
                {s === "all" ? t("terminal.scan.all") : s}
              </Chip>
            ))}
          </div>
          <span className="h-4 w-px bg-white/[0.08]" />
          <Chip active={filters.dec === "1"} onClick={() => setF({ dec: filters.dec === "1" ? "" : "1" })}>
            ⚡ {t("terminal.scan.onlyDecoupled")}
          </Chip>
          <Chip active={filters.ext === "1"} onClick={() => setF({ ext: filters.ext === "1" ? "" : "1" })}>
            {t("terminal.scan.hideExtended")}
          </Chip>
          <Chip active={filters.intel === "1"} onClick={() => setF({ intel: filters.intel === "1" ? "" : "1" })}>
            ◎ {t("terminal.scan.intelOnly")}
          </Chip>
          {hasActive && (
            <button
              onClick={resetF}
              className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-text-muted hover:text-negative transition-colors"
            >
              × {t("terminal.scan.reset")}
            </button>
          )}
        </div>

        {/* row 2: metric selects */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            label={t("terminal.scan.risk")}
            value={filters.risk}
            onChange={(v) => setF({ risk: v })}
            options={[["all", t("terminal.scan.all")], ["low", "LOW"], ["normal", "NORMAL"], ["high", "HIGH"]]}
          />
          <Select
            label={t("terminal.scan.confMin")}
            value={filters.conf}
            onChange={(v) => setF({ conf: v })}
            options={[["0", t("terminal.scan.all")], ["40", "40"], ["60", "60"], ["80", "80"]]}
          />
          <Select
            label={t("terminal.scan.mtf")}
            value={filters.mtf}
            onChange={(v) => setF({ mtf: v })}
            options={[
              ["all", t("terminal.scan.mtfAll")],
              ["bull_aligned", t("terminal.scan.mtfBull")],
              ["h4_bull", t("terminal.scan.mtfH4Bull")],
              ["not_bear", t("terminal.scan.mtfNotBear")],
            ]}
          />
          <Select
            label={t("terminal.scan.regime")}
            value={filters.regime}
            onChange={(v) => setF({ regime: v })}
            options={[
              ["all", t("terminal.scan.all")], ["normal", "normal"],
              ["low_vol", "low_vol"], ["high_vol", "high_vol"], ["skip", "skip"],
            ]}
          />
          <Select
            label={t("terminal.scan.smc")}
            value={filters.smc}
            onChange={(v) => setF({ smc: v })}
            options={[
              ["any", t("terminal.scan.smcAny")],
              ["active", t("terminal.scan.smcHas")],
              ["golden", t("terminal.scan.smcGolden")],
            ]}
          />
          <Select
            label={t("terminal.scan.beta")}
            value={filters.beta}
            onChange={(v) => setF({ beta: v })}
            options={[
              ["all", t("terminal.scan.all")],
              ["def", t("terminal.scan.betaDef")],
              ["neu", t("terminal.scan.betaNeu")],
              ["agg", t("terminal.scan.betaAgg")],
            ]}
          />
          {sectors.length > 0 && (
            <Select
              label={t("terminal.scan.sector")}
              value={filters.sector}
              onChange={(v) => setF({ sector: v })}
              options={[["all", t("terminal.scan.all")], ...sectors.map((s) => [s, s])]}
            />
          )}
          <Select
            label={t("terminal.scan.sort")}
            value={filters.sort}
            onChange={(v) => setF({ sort: v })}
            options={[
              ["newest", t("terminal.scan.sortNewest")],
              ["conf", t("terminal.scan.sortConf")],
              ["align", t("terminal.scan.sortAlign")],
              ["beta", t("terminal.scan.sortBeta")],
              ["tgt", t("terminal.scan.sortTgt")],
              ["fromcall", t("terminal.scan.sortFromCall")],
            ]}
          />
        </div>
      </div>

      {/* ── loading / error ── */}
      {loading && !data && (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-20 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t("terminal.scan.loading")}
          </span>
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg border border-negative/25 bg-negative/[0.06] px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-[11px] text-negative">⚠ {t("terminal.scan.error")}</span>
          <button
            onClick={() => fetchData(filters.d)}
            className="px-3 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-negative/15 text-negative border border-negative/30"
          >
            {t("terminal.scan.retry")}
          </button>
        </div>
      )}

      {/* ── desktop table ── */}
      {data && (
        <div className="hidden md:block rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted">
              {filtered.length} {t("terminal.scan.results")}
            </span>
            {data.generated_at && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
                {t("terminal.scan.updated")} {new Date(data.generated_at).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {[
                    t("terminal.scan.thPair"), t("terminal.scan.thStatus"), t("terminal.scan.thEntry"),
                    t("terminal.scan.thFromCall"), t("terminal.scan.thMaxTgt"), t("terminal.scan.thRisk"),
                    t("terminal.scan.thConf"), t("terminal.scan.thMtf"), t("terminal.scan.thSmc"),
                    t("terminal.scan.thRegime"), t("terminal.scan.thBeta"), t("terminal.scan.thFg"),
                    t("terminal.scan.thAge"), "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 font-mono text-[8.5px] uppercase tracking-[0.15em] text-white/35 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {t("terminal.scan.noResults")}
                    </td>
                  </tr>
                )}
                {filtered.map((s) => {
                  const fc = fromCallPct(s);
                  const smcTotal = (s.smc?.fvg || 0) + (s.smc?.ob || 0) + (s.smc?.sweep || 0);
                  return (
                    <tr
                      key={s.signal_id}
                      onClick={() => goReplay(s.signal_id)}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      {/* pair + sector */}
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-[12px] text-white/95">{s.pair}</div>
                        {s.sector && (
                          <div className="text-[8.5px] font-mono uppercase tracking-wider text-text-muted/70 mt-0.5">
                            {s.sector}
                          </div>
                        )}
                      </td>
                      {/* status */}
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider ${STATUS_STYLE[s.status] || STATUS_STYLE.open}`}>
                          {s.status}
                        </span>
                      </td>
                      {/* entry */}
                      <td className="px-3 py-2.5 font-mono text-[11px] text-white/75 tabular-nums">{fmtPrice(s.entry)}</td>
                      {/* Δ from call */}
                      <td className={`px-3 py-2.5 font-mono text-[11px] tabular-nums ${fc == null ? "text-text-muted/60" : fc >= 0 ? "text-positive" : "text-negative"}`}>
                        {fc == null ? "—" : fmtPct(fc)}
                      </td>
                      {/* max target */}
                      <td className="px-3 py-2.5 font-mono text-[11px] text-gold-primary/90 tabular-nums">
                        {s.max_target_pct != null ? fmtPct(s.max_target_pct, 0) : "—"}
                      </td>
                      {/* risk */}
                      <td className="px-3 py-2.5 font-mono text-[9.5px]">
                        <span className={
                          s.risk_norm === "HIGH" ? "text-negative" :
                          s.risk_norm === "LOW" ? "text-positive" : "text-white/60"
                        }>
                          {s.risk_norm || "—"}
                        </span>
                      </td>
                      {/* confidence */}
                      <td className="px-3 py-2.5">
                        {s.has_intel ? (
                          <ConfBar score={s.confidence_score} />
                        ) : (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-text-muted/50 border border-white/[0.06] rounded-sm px-1 py-0.5">
                            {t("terminal.scan.noIntelBadge")}
                          </span>
                        )}
                      </td>
                      {/* mtf */}
                      <td className="px-3 py-2.5">{s.has_intel ? <MtfDots mtf={s.mtf} /> : <span className="text-text-muted/40">—</span>}</td>
                      {/* smc */}
                      <td className="px-3 py-2.5 font-mono text-[10px] text-white/70 whitespace-nowrap">
                        {s.smc?.golden && (
                          <span className="mr-1 px-1 py-0.5 rounded-sm bg-gold-primary/15 text-gold-primary border border-gold-primary/30 text-[8px] uppercase">
                            {t("terminal.scan.goldenBadge")}
                          </span>
                        )}
                        {s.has_intel ? (smcTotal > 0 ? `F${s.smc.fvg}·O${s.smc.ob}·S${s.smc.sweep}` : "0") : "—"}
                      </td>
                      {/* regime */}
                      <td className={`px-3 py-2.5 font-mono text-[10px] ${REGIME_STYLE[s.regime] || "text-text-muted/60"}`}>
                        {s.regime || "—"}
                      </td>
                      {/* beta + badges */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-[11px] text-white/80 tabular-nums">
                          {s.beta_30d != null ? s.beta_30d.toFixed(2) : "—"}
                        </span>
                        {s.is_decoupled && (
                          <span className="ml-1 px-1 py-0.5 rounded-sm bg-cyan-400/10 text-cyan-400 border border-cyan-400/25 font-mono text-[8px] uppercase">
                            {t("terminal.scan.decBadge")}
                          </span>
                        )}
                        {s.is_extended && (
                          <span className="ml-1 px-1 py-0.5 rounded-sm bg-orange-400/10 text-orange-400 border border-orange-400/25 font-mono text-[8px] uppercase">
                            {t("terminal.scan.extBadge")}
                          </span>
                        )}
                        {s.lead_lag_hours != null && s.lead_lag_hours < 0 && (
                          <span className="ml-1 px-1 py-0.5 rounded-sm bg-purple-400/10 text-purple-400 border border-purple-400/25 font-mono text-[8px] uppercase">
                            {t("terminal.scan.leadsBadge")}
                          </span>
                        )}
                      </td>
                      {/* fear & greed */}
                      <td className="px-3 py-2.5 font-mono text-[11px] text-white/70 tabular-nums">
                        {s.fear_greed ?? "—"}
                      </td>
                      {/* age */}
                      <td className="px-3 py-2.5 font-mono text-[10px] text-text-muted tabular-nums">
                        {ageHuman(s.created_at)}
                      </td>
                      {/* replay */}
                      <td className="px-3 py-2.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); goReplay(s.signal_id); }}
                          className="px-2 py-1 rounded-sm font-mono text-[9px] uppercase tracking-wider bg-gold-primary/10 text-gold-primary border border-gold-primary/25 hover:bg-gold-primary/20 transition-colors"
                        >
                          ▶ {t("terminal.scan.replayBtn")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── mobile cards ── */}
      {data && (
        <div className="md:hidden space-y-2">
          {filtered.length === 0 && !loading && (
            <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-12 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {t("terminal.scan.noResults")}
            </div>
          )}
          {filtered.map((s) => {
            const fc = fromCallPct(s);
            return (
              <button
                key={s.signal_id}
                onClick={() => goReplay(s.signal_id)}
                className="w-full text-left rounded-lg bg-[#0c0a07] border border-white/[0.07] p-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[13px] text-white/95 truncate">{s.pair}</span>
                    <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase ${STATUS_STYLE[s.status] || STATUS_STYLE.open}`}>
                      {s.status}
                    </span>
                    {s.is_decoupled && (
                      <span className="px-1 py-0.5 rounded-sm bg-cyan-400/10 text-cyan-400 border border-cyan-400/25 font-mono text-[8px] uppercase">
                        {t("terminal.scan.decBadge")}
                      </span>
                    )}
                  </div>
                  <span className={`font-mono text-[12px] tabular-nums ${fc == null ? "text-text-muted/60" : fc >= 0 ? "text-positive" : "text-negative"}`}>
                    {fc == null ? "—" : fmtPct(fc)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap font-mono text-[9.5px] text-text-muted">
                  <span>TGT <span className="text-gold-primary/90">{s.max_target_pct != null ? fmtPct(s.max_target_pct, 0) : "—"}</span></span>
                  <span>{s.risk_norm || "—"}</span>
                  {s.has_intel ? (
                    <span className="flex items-center gap-1.5">
                      <ConfBar score={s.confidence_score} />
                      <MtfDots mtf={s.mtf} />
                    </span>
                  ) : (
                    <span className="uppercase text-[8.5px] border border-white/[0.06] rounded-sm px-1 py-0.5 text-text-muted/50">
                      {t("terminal.scan.noIntelBadge")}
                    </span>
                  )}
                  <span>β {s.beta_30d != null ? s.beta_30d.toFixed(2) : "—"}</span>
                  <span className="ml-auto">{ageHuman(s.created_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
