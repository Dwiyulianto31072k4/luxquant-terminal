import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { classifyCoin } from "./coinIntelShared";
import CoinLogo from "./CoinLogo";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { GOLD, GRID, AXIS, TICK_SM, SectorGlyph } from "./terminal/vizShared";
import {
  DEFAULT_FILTERS, parseFilters, filtersToParams, applySignalFilters,
  parseMcap, maxTargetPct,
} from "../utils/signalFilters";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — multi-panel visualization over Potential Trades.
// Data: bulk-7d + coin-intel + money-flow (coins/sectors/macro) + live
// prices. Filters mirror SignalsPage EXACTLY via shared signalFilters util,
// and are read from the URL so the "Terminal" button can carry them over.
// ════════════════════════════════════════════════════════════════

// ── color helpers ──
const lerp = (a, b, t) => a + (b - a) * t;
function heat(t) {
  t = Math.max(0, Math.min(1, t));
  const r = [239, 68, 68], m = [70, 60, 55], g = [16, 185, 129];
  if (t < 0.5) { const u = t / 0.5; return `rgb(${lerp(r[0], m[0], u) | 0},${lerp(r[1], m[1], u) | 0},${lerp(r[2], m[2], u) | 0})`; }
  const u = (t - 0.5) / 0.5; return `rgb(${lerp(m[0], g[0], u) | 0},${lerp(m[1], g[1], u) | 0},${lerp(m[2], g[2], u) | 0})`;
}
function shortNum(v) {
  if (!v && v !== 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return Number(v).toFixed(0);
}

// ── squarified treemap (bounded — rows laid along the shorter side) ──
function tmWorst(row, side) {
  const s = row.reduce((a, b) => a + b.area, 0);
  const mx = Math.max(...row.map((r) => r.area)), mn = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
}
function squarify(items, x0, y0, W0, H0) {
  const rects = [];
  const total = items.reduce((s, i) => s + i.v, 0) || 1;
  const nodes = items.map((i) => ({ d: i.d, area: (i.v / total) * W0 * H0 }));
  let x = x0, y = y0, w = W0, h = H0, i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h) || 1;
    let row = [], best = Infinity, j = i;
    while (j < nodes.length) {
      const cand = [...row, nodes[j]];
      const r = tmWorst(cand, side);
      if (row.length === 0 || r <= best) { row = cand; best = tmWorst(row, side); j++; } else break;
    }
    const rowArea = row.reduce((s, n) => s + n.area, 0) || 1;
    const rowThick = rowArea / side;
    let off = w >= h ? y : x;
    for (const n of row) {
      const len = n.area / rowThick;
      if (w >= h) { rects.push({ d: n.d, x, y: off, w: rowThick, h: len }); off += len; }
      else { rects.push({ d: n.d, x: off, y, w: len, h: rowThick }); off += len; }
    }
    if (w >= h) { x += rowThick; w -= rowThick; } else { y += rowThick; h -= rowThick; }
    i = j;
  }
  return rects;
}

// ── metric registry ──
const METRICS = {
  market_cap: { lbl: "Market Cap", get: (d) => d.market_cap, fmt: (v) => "$" + shortNum(v) },
  volume_24h: { lbl: "Volume 24h", get: (d) => d.volume_24h, fmt: (v) => "$" + shortNum(v) },
  flow_intensity: { lbl: "Vol/MCap", get: (d) => d.flow_intensity * 100, fmt: (v) => v.toFixed(1) + "%" },
  price_change_24h: { lbl: "Price Δ 24h", get: (d) => d.price_change_24h, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", diverge: true },
  from_call: { lbl: "% From Call", get: (d) => d.from_call, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", diverge: true },
  win_rate: { lbl: "Win Rate", get: (d) => d.win_rate, fmt: (v) => (v == null ? "—" : v.toFixed(0) + "%") },
  max_target: { lbl: "Max Target %", get: (d) => d.max_target, fmt: (v) => "+" + v.toFixed(0) + "%" },
  btc_align: { lbl: "BTC Align", get: (d) => d.btc_align ?? 0, fmt: (v) => (v ? v.toFixed(0) : "—") },
};
function colorByMetric(d, mk, rows) {
  const m = METRICS[mk], vals = rows.map(m.get).filter((v) => v != null && !isNaN(v));
  const mn = Math.min(...vals), mx = Math.max(...vals), v = m.get(d) ?? 0;
  if (m.diverge) { const a = Math.max(Math.abs(mn), Math.abs(mx)) || 1; return heat((v / a + 1) / 2); }
  return heat((v - mn) / ((mx - mn) || 1));
}

// ════════════════════════════════════════════════════════════════
export default function SignalTerminalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [signals, setSignals] = useState([]);
  const [coinIntel, setCoinIntel] = useState({});
  const [flowCoins, setFlowCoins] = useState({}); // {SYMBOL: coin}
  const [sectors, setSectors] = useState([]);
  const [macro, setMacro] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // which market-map view — now driven by the left nav (?view=)
  const view = searchParams.get("view") || "treemap";

  // filters initialized from URL (carried from Potential Trades)
  const [filters, setFilters] = useState(() => parseFilters(searchParams));
  const setF = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const p = filtersToParams(next);
    p.set("view", view); // preserve which view the nav selected
    setSearchParams(p, { replace: true });
  };

  const [sizeBy, setSizeBy] = useState("market_cap");
  const [colorBy, setColorBy] = useState(() => (searchParams.get("view") === "bubble" ? "price_change_24h" : "max_target"));

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = useCallback(async (showLoad = true) => {
    if (showLoad) setLoading(true);
    const h = authHeaders();
    const [sigR, intelR, flowR, secR, macR] = await Promise.allSettled([
      fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: h }),
      fetch(`${API_BASE}/api/v1/signals/coin-intel`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/coins?luxquant_only=true&limit=200`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/sectors?limit=12`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/macro`, { headers: h }),
    ]);
    try {
      if (sigR.status === "fulfilled" && sigR.value.ok) {
        const d = await sigR.value.json();
        setSignals(d.items || []);
      }
      if (intelR.status === "fulfilled" && intelR.value.ok) {
        const intel = await intelR.value.json();
        const all = [...(intel.top_coins || []), ...(intel.rest_coins || [])];
        const map = {};
        for (const c of all) if (c && c.pair) map[c.pair] = c;
        setCoinIntel(map);
      }
      if (flowR.status === "fulfilled" && flowR.value.ok) {
        const fd = await flowR.value.json();
        const map = {};
        for (const c of (fd.coins || [])) if (c.symbol) map[c.symbol.toUpperCase()] = c;
        setFlowCoins(map);
      }
      if (secR.status === "fulfilled" && secR.value.ok) {
        const sd = await secR.value.json();
        setSectors(sd.sectors || []);
      }
      if (macR.status === "fulfilled" && macR.value.ok) {
        setMacro(await macR.value.json());
      }
    } catch (e) { /* best-effort */ }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll(true);
    const iv = setInterval(() => fetchAll(false), 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // (live-price polling is defined below, after `filteredSignals`, so it fetches
  //  prices ONLY for the pairs currently in view — not all 7-day signals.)

  // verdict per pair
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) map[pair] = classifyCoin(coinIntel[pair]);
    return map;
  }, [coinIntel]);

  // filtered signals — SAME logic as Potential Trades
  const filteredSignals = useMemo(
    () => applySignalFilters(signals, filters, { coinIntel, verdictByPair }),
    [signals, filters, coinIntel, verdictByPair]
  );

  // Live prices — ONLY for the pairs currently in view (filtered), refreshed
  // every 30s. Previously this fetched all 700+ 7-day pairs every 15s, which
  // piled avoidable load on the shared /market/prices proxy during peak windows.
  const pricePairs = useMemo(
    () => [...new Set(filteredSignals.map((s) => s.pair).filter(Boolean))],
    [filteredSignals]
  );
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
        } catch (_) {}
      }
      // Merge (never replace) so switching filters doesn't blank prices we already have.
      if (alive) setPrices((prev) => ({ ...prev, ...acc }));
    };
    run();
    const iv = setInterval(run, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [pricePairs]);

  // build per-pair model joining every source
  const model = useMemo(() => {
    return filteredSignals.map((s) => {
      const sym = (s.pair || "").replace(/USDT$/i, "").toUpperCase();
      const flow = flowCoins[sym];
      const ci = coinIntel[s.pair];
      const priceObj = prices[s.pair];
      const livePrice = priceObj ? (typeof priceObj === "number" ? priceObj : priceObj.price) : (flow?.price ?? null);
      const liveVol = priceObj && typeof priceObj !== "number" ? priceObj.volume : (flow?.volume_24h ?? 0);
      const liveChange = priceObj && typeof priceObj !== "number" && priceObj.change != null ? priceObj.change : null;
      const mcap = flow?.market_cap ?? parseMcap(s.market_cap);
      const entry = parseFloat(s.entry) || 0;
      return {
        signal_id: s.signal_id,
        pair: s.pair, sym,
        status: (s.status || "open").toLowerCase(),
        risk: (s.risk_level || "").toLowerCase(),
        market_cap: mcap,
        volume_24h: liveVol || flow?.volume_24h || 0,
        flow_intensity: flow?.flow_intensity ?? (mcap ? (liveVol || 0) / mcap : 0),
        price_change_24h: liveChange ?? flow?.price_change_24h ?? 0,
        from_call: entry && livePrice ? ((livePrice - entry) / entry) * 100 : 0,
        win_rate: ci?.win_rate ?? null,
        streak: ci?.current_streak ? (ci.current_streak.type === "win" ? ci.current_streak.length : -ci.current_streak.length) : 0,
        btc_align: s.btc_align_score ?? null,
        decoupled: !!s.btc_decoupled,
        max_target: maxTargetPct(s),
        verdict: verdictByPair[s.pair] || "neutral",
        entry, price: livePrice, _sig: s,
      };
    });
  }, [filteredSignals, flowCoins, coinIntel, prices, verdictByPair]);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-4 pb-6">
      {/* Filter bar (parity with Potential Trades) */}
      <FilterBar filters={filters} setF={setF} coinIntel={coinIntel} verdictByPair={verdictByPair} signals={signals} />

      {/* encoders — view itself is chosen from the left nav now */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold-primary/80">{view}</span>
        <div className="flex-1" />
        {view === "treemap" && <Enc label="Size" value={sizeBy} onChange={setSizeBy} />}
        <Enc label="Color" value={colorBy} onChange={setColorBy} />
      </div>

      {/* Macro strip — market context, shown on the treemap overview */}
      {view === "treemap" && <MacroStrip macro={macro} sectors={sectors} model={model} />}

      {/* Main stage */}
      <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] p-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        {model.length === 0 ? (
          <div className="h-[360px] flex items-center justify-center font-mono text-xs text-white/40">
            {loading ? "Loading signals…" : "No signals match the current filters."}
          </div>
        ) : view === "treemap" ? (
          <Treemap model={model} sizeBy={sizeBy} colorBy={colorBy} onPick={(d) => openSignal(d, navigate, filters)} />
        ) : view === "bubble" ? (
          <Bubble model={model} colorBy={colorBy} onPick={(d) => openSignal(d, navigate, filters)} />
        ) : view === "matrix" ? (
          <Matrix model={model} onPick={(d) => openSignal(d, navigate, filters)} />
        ) : (
          <SectorView model={model} colorBy={colorBy} onPick={(d) => openSignal(d, navigate, filters)} />
        )}
      </div>

      {/* Screener */}
      <Screener model={model} onPick={(d) => openSignal(d, navigate, filters)} />

      <p className="font-mono text-[10px] text-white/30 leading-relaxed border-t border-white/[0.06] pt-3">
        Filters mirror Potential Trades (shared <span className="text-white/50">signalFilters</span> util). Live data via Binance Futures proxy.
        Derivative panels (funding heatmap, open interest, long/short) light up once the per-pair fapi endpoints are extended (Tier 2).
      </p>
    </div>
  );
}

// open the SignalModal on Potential Trades (deep-link), preserving filters
function openSignal(d, navigate, filters) {
  const p = filtersToParams(filters);
  p.set("signal", String(d.signal_id));
  navigate(`/signals?${p.toString()}`);
}

// ── Encoder select ──
function Enc({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-[#0a0506] border border-white/[0.1] rounded-lg font-mono text-[11px] text-white/80 px-2.5 py-1.5 pr-6 focus:outline-none focus:border-gold-primary/40 cursor-pointer">
        {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k} className="bg-[#0a0506]">{m.lbl}</option>)}
      </select>
    </label>
  );
}

// ── Filter bar ──
function FilterBar({ filters, setF }) {
  const chip = (on) => `font-mono text-[10px] uppercase tracking-wide px-3 py-2 rounded-lg border transition-colors cursor-pointer ${on ? "text-[#17110a] border-gold-primary bg-gold-primary font-semibold" : "text-white/55 border-white/[0.1] bg-[#0c0a07] hover:border-white/20"}`;
  const sel = "appearance-none bg-[#0c0a07] border border-white/[0.1] rounded-lg font-mono text-xs text-white/80 px-3 py-2 pr-7 focus:outline-none focus:border-gold-primary/40 cursor-pointer";
  return (
    <div className="sticky top-0 z-30 bg-[#0a0806] border border-white/[0.08] rounded-lg p-3 flex flex-wrap gap-2.5 items-center shadow-lg shadow-black/30">
      <div className="relative">
        <svg className="w-4 h-4 absolute left-2.5 top-2.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input value={filters.searchPair} onChange={(e) => setF({ searchPair: e.target.value })} placeholder="Search pair…"
          className="bg-[#0a0506] border border-white/[0.1] rounded-lg font-mono text-xs text-white pl-8 pr-3 py-2 w-40 focus:outline-none focus:border-gold-primary/40" />
      </div>
      <select className={sel} value={filters.statusFilter} onChange={(e) => setF({ statusFilter: e.target.value })}>
        <option value="all">All Status</option><option value="open">Open</option><option value="tp1">TP1</option><option value="tp2">TP2</option><option value="tp3">TP3</option><option value="closed_win">TP4 / Win</option><option value="closed_loss">Loss</option>
      </select>
      <select className={sel} value={filters.riskFilter} onChange={(e) => setF({ riskFilter: e.target.value })}>
        <option value="all">All Risk</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
      </select>
      <div className={chip(filters.streakFilter === "hot")} onClick={() => setF({ streakFilter: filters.streakFilter === "hot" ? "all" : "hot" })}>🔥 Hot Streak</div>
      <div className={chip(filters.corrDecoupled)} onClick={() => setF({ corrDecoupled: !filters.corrDecoupled })}>BTC Decoupled</div>
      <div className={chip(filters.corrHighAlign)} onClick={() => setF({ corrHighAlign: !filters.corrHighAlign })}>High BTC Align</div>
      <div className={chip(filters.verdictFilter === "worth_it")} onClick={() => setF({ verdictFilter: filters.verdictFilter === "worth_it" ? "all" : "worth_it" })}>✓ Worth It</div>
      <div className={chip(filters.verdictFilter === "avoid")} onClick={() => setF({ verdictFilter: filters.verdictFilter === "avoid" ? "all" : "avoid" })}>⛔ Avoid</div>
      <div className="flex-1" />
      <button onClick={() => setF({ ...DEFAULT_FILTERS })} className="font-mono text-[10px] uppercase tracking-wide text-white/50 hover:text-red-400 px-2 py-2">✕ Reset</button>
    </div>
  );
}

// ── Macro strip: dominance gauges + altseason + sector rotation + long/short-ish ──
function MacroStrip({ macro, sectors, model }) {
  const gauge = (v, color, lbl) => {
    const R = 22, C = 2 * Math.PI * R, frac = Math.min(1, (v || 0) / 100);
    return (
      <div className="text-center">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
          <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 28 28)" />
          <text x="28" y="32" textAnchor="middle" fontFamily="monospace" fontSize="12" fontWeight="700" fill="#fff">{v == null ? "—" : v.toFixed(0)}</text>
        </svg>
        <div className="font-mono text-[9px] uppercase tracking-widest text-white/35 mt-0.5">{lbl}</div>
      </div>
    );
  };
  const topSectors = [...(sectors || [])].sort((a, b) => (b.mcap_change_24h ?? -9) - (a.mcap_change_24h ?? -9)).slice(0, 6);
  const maxAbs = Math.max(...topSectors.map((s) => Math.abs(s.mcap_change_24h ?? 0)), 1);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] p-4">
        <div className="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-3">Dominance & Altseason</div>
        <div className="flex justify-around">
          {gauge(macro?.btc_dominance, "#F7931A", "BTC Dom")}
          {gauge(macro?.eth_dominance, "#627EEA", "ETH Dom")}
          {gauge(macro?.altseason_index, "#d4af37", "Altseason")}
        </div>
      </div>
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 lg:col-span-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-3">Sector Rotation · Δ Market Cap 24h</div>
        <div className="space-y-1.5">
          {topSectors.length === 0 && <div className="font-mono text-[11px] text-white/30">No sector snapshot yet.</div>}
          {topSectors.map((s) => {
            const c = s.mcap_change_24h ?? 0;
            return (
              <div key={s.category_id || s.name} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-white/70 w-32 flex items-center gap-1.5"><SectorGlyph sector={s.name} /><span className="truncate">{s.name}</span></span>
                <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(Math.abs(c) / maxAbs) * 100}%`, background: c >= 0 ? "linear-gradient(90deg,#059669,#34d399)" : "linear-gradient(90deg,#dc2626,#f87171)" }} />
                </div>
                <span className="font-mono text-[10px] w-14 text-right" style={{ color: c >= 0 ? "#34d399" : "#f87171" }}>{c >= 0 ? "+" : ""}{c.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Treemap ──
function Treemap({ model, sizeBy, colorBy, onPick }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 380;
  const sm = METRICS[sizeBy];
  // √-scale the size metric so a few mega-caps (BTC/ETH) don't swallow the
  // canvas and small caps stay legible — you can actually SEE the smallest.
  const items = model
    .map((d) => ({ v: Math.sqrt(Math.max(sm.get(d) || 0, 0)) + 0.5, d }))
    .sort((a, b) => b.v - a.v);
  const rects = squarify(items, 0, 0, w, H);
  return (
    <>
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg" style={{ height: H }}>
      {rects.map((r) => {
        const d = r.d, big = r.w > 58 && r.h > 34, fs = Math.max(9, Math.min(14, r.w / 6));
        return (
          <div key={d.signal_id} onClick={() => onPick(d)} title={`${d.sym} · ${METRICS[colorBy].fmt(METRICS[colorBy].get(d))}`}
            className="absolute rounded-md overflow-hidden cursor-pointer border border-black/40 hover:outline hover:outline-1 hover:outline-white/60 transition-transform hover:-translate-y-0.5"
            style={{ left: r.x, top: r.y, width: r.w - 3, height: r.h - 3, background: colorByMetric(d, colorBy, model) }}>
            <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
              <div className="flex items-center gap-1 min-w-0">
                {big && <CoinLogo pair={d.pair} size={Math.min(18, Math.max(12, fs))} />}
                <div className="font-mono font-bold leading-none text-white truncate" style={{ fontSize: fs, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{d.sym}</div>
              </div>
              {big && <div className="font-mono leading-none text-white/90" style={{ fontSize: Math.max(8, fs - 3), textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{METRICS[colorBy].fmt(METRICS[colorBy].get(d))}</div>}
            </div>
          </div>
        );
      })}
    </div>
    <div className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1">
      tile size = {sm.lbl} (√-scaled) · color = {METRICS[colorBy].lbl} · click → latest call
    </div>
    </>
  );
}

// ── Bubble (recharts ScatterChart — log-x so it isn't crammed; bubble = mcap) ──
function BubbleTip({ active, payload, colorBy }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload?.d;
  if (!d) return null;
  return (
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1"><CoinLogo pair={d.pair} size={16} /><span className="text-white">{d.sym}</span></div>
      <div className="text-white/55">Win rate: <span className="text-white/90">{d.win_rate == null ? "—" : d.win_rate.toFixed(0) + "%"}</span></div>
      <div className="text-white/55">Vol/MCap: <span className="text-white/90">{(d.flow_intensity * 100).toFixed(2)}%</span></div>
      <div className="text-white/55">MCap: <span className="text-white/90">${shortNum(d.market_cap)}</span></div>
      <div className="text-white/55">{METRICS[colorBy].lbl}: <span className="text-white/90">{METRICS[colorBy].get(d) == null ? "—" : METRICS[colorBy].fmt(METRICS[colorBy].get(d))}</span></div>
    </div>
  );
}
const fmtLogTick = (v) => {
  if (v == null) return "";
  if (v >= 100) return Math.round(v) + "%";
  if (v >= 10) return v.toFixed(0) + "%";
  if (v >= 1) return v.toFixed(1) + "%";
  return v.toFixed(2) + "%";
};
function Bubble({ model, colorBy, onPick }) {
  const data = model.map((d) => ({
    x: Math.min(Math.max((d.flow_intensity || 0) * 100, 0.05), 5000), // clamp for log scale
    y: d.win_rate ?? 0,
    z: Math.max(d.market_cap || 1, 1),
    d,
  }));
  return (
    <div style={{ height: 480 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 14, right: 22, left: 8, bottom: 28 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
          <XAxis
            type="number" dataKey="x" scale="log" domain={[0.05, "auto"]} allowDataOverflow
            tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={fmtLogTick}
            label={{ value: "VOLUME / MARKET CAP  (log scale — turnover)", position: "insideBottom", offset: -12, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }}
          />
          <YAxis
            type="number" dataKey="y" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={(v) => v + "%"}
            label={{ value: "WIN RATE", angle: -90, position: "insideLeft", offset: 16, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }}
          />
          <ZAxis type="number" dataKey="z" range={[26, 460]} />
          <ReferenceLine y={50} stroke="rgba(212,168,83,0.35)" strokeDasharray="4 4" />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: GOLD }} content={<BubbleTip colorBy={colorBy} />} />
          <Scatter data={data} onClick={(p) => { const o = p?.payload || p; if (o?.d) onPick(o.d); }}>
            {data.map((p, i) => (
              <Cell key={i} cursor="pointer" fill={colorByMetric(p.d, colorBy, model)} fillOpacity={0.55} stroke="rgba(0,0,0,0.55)" strokeWidth={0.5} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1">
        each bubble = one coin · size = market cap · color = {METRICS[colorBy].lbl} · gold line = 50% win rate · click → latest call
      </div>
    </div>
  );
}

// ── Matrix (koin × metrik) ──
const MX_COLS = ["win_rate", "flow_intensity", "btc_align", "max_target", "from_call", "price_change_24h"];
function Matrix({ model, onPick }) {
  const [sortK, setSortK] = useState("win_rate");
  const [dir, setDir] = useState(-1);
  const rows = [...model].sort((a, b) => ((METRICS[sortK].get(a) ?? -1e9) - (METRICS[sortK].get(b) ?? -1e9)) * dir);
  return (
    <div className="overflow-auto max-h-[440px]">
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="sticky left-0 bg-[#0a0506] text-left font-mono text-[8.5px] uppercase tracking-wide text-white/50 font-medium px-2 py-1.5 z-10">Pair</th>
            {MX_COLS.map((k) => (
              <th key={k} onClick={() => { setDir(sortK === k ? -dir : -1); setSortK(k); }}
                className="font-mono text-[8.5px] uppercase tracking-wide text-white/50 font-medium px-1 py-1.5 text-center cursor-pointer hover:text-gold-primary whitespace-nowrap">
                {METRICS[k].lbl}{sortK === k ? (dir < 0 ? " ▼" : " ▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.signal_id}>
              <td onClick={() => onPick(d)} className="sticky left-0 bg-[#0a0506] font-mono text-[11px] font-bold text-white px-2 py-1 cursor-pointer hover:text-gold-primary z-10">
                <span className="flex items-center gap-1.5"><CoinLogo pair={d.pair} size={15} /><span>{d.sym}</span></span>
              </td>
              {MX_COLS.map((k) => (
                <td key={k} className="p-0 text-center">
                  <div onClick={() => onPick(d)} className="m-0.5 h-6 rounded flex items-center justify-center font-mono text-[10px] font-semibold cursor-pointer hover:outline hover:outline-1 hover:outline-white" style={{ background: colorByMetric(d, k, model), color: "#0a0506" }}>
                    {METRICS[k].get(d) == null ? "—" : METRICS[k].fmt(METRICS[k].get(d))}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sector view (group signals by verdict/risk since sector needs category join) ──
function SectorView({ model, colorBy, onPick }) {
  const groups = {};
  model.forEach((d) => { const k = d.risk ? d.risk.toUpperCase() : "UNKNOWN"; (groups[k] = groups[k] || []).push(d); });
  const order = ["LOW", "NORMAL", "MEDIUM", "HIGH", "UNKNOWN"];
  const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {keys.map((k) => {
        const list = [...groups[k]].sort((a, b) => (METRICS[colorBy].get(b) ?? 0) - (METRICS[colorBy].get(a) ?? 0));
        const mx = Math.max(...list.map((d) => Math.abs(METRICS[colorBy].get(d) ?? 0)), 1);
        return (
          <div key={k} className="bg-[#0a0506] border border-white/[0.06] rounded-xl p-3">
            <div className="font-mono text-xs font-semibold text-white mb-0.5">{k} risk</div>
            <div className="font-mono text-[9px] uppercase tracking-wide text-white/35 mb-2">{list.length} signals</div>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gold-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
              {list.map((d) => {
                const v = METRICS[colorBy].get(d) ?? 0;
                return (
                  <div key={d.signal_id} onClick={() => onPick(d)} className="flex items-center gap-2 cursor-pointer group">
                    <span className="flex items-center gap-1.5 w-20 shrink-0">
                      <CoinLogo pair={d.pair} size={15} />
                      <span className="font-mono text-[11px] text-white/70 group-hover:text-gold-primary truncate">{d.sym}</span>
                    </span>
                    <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(Math.abs(v) / mx) * 100}%`, background: colorByMetric(d, colorBy, model) }} />
                    </div>
                    <span className="font-mono text-[10px] w-14 text-right text-white/70">{METRICS[colorBy].fmt(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Screener table ──
const SCR = [["sym", "Pair"], ["status", "Status"], ["price_change_24h", "Δ24h"], ["from_call", "From Call"], ["win_rate", "WR"], ["flow_intensity", "Vol/MC"], ["btc_align", "BTC"], ["max_target", "Max Tgt"], ["market_cap", "MCap"]];
function Screener({ model, onPick }) {
  const [sortK, setSortK] = useState("market_cap");
  const [dir, setDir] = useState(-1);
  const val = (d, k) => (k === "sym" ? d.sym : k === "status" ? d.status : (METRICS[k]?.get(d) ?? 0));
  const rows = [...model].sort((a, b) => {
    const va = val(a, sortK), vb = val(b, sortK);
    if (typeof va === "string") return String(va).localeCompare(vb) * dir;
    return ((va ?? -1e9) - (vb ?? -1e9)) * dir;
  });
  const stColor = (s) => ({ open: "#60a5fa", tp1: "#34d399", tp2: "#34d399", tp3: "#34d399", closed_win: "#34d399", closed_loss: "#f87171" }[s] || "#9ca3af");
  return (
    <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <div className="px-4 py-2.5 bg-gold-primary/[0.05] border-b border-gold-primary/[0.12] flex items-center justify-between">
        <span className="text-[12.5px] text-white/90">Signal Screener</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{model.length} pairs</span>
      </div>
      <div className="overflow-auto max-h-[440px] p-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gold-primary/25">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr>{SCR.map(([k, l], i) => (
              <th key={k} onClick={() => { setDir(sortK === k ? -dir : -1); setSortK(k); }}
                className={`${i === 0 ? "text-left" : "text-right"} font-medium text-[9px] uppercase tracking-wide text-white/40 px-2 py-2 border-b border-white/[0.08] cursor-pointer hover:text-gold-primary whitespace-nowrap`}>
                {l}{sortK === k ? (dir < 0 ? " ▼" : " ▲") : ""}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.signal_id} onClick={() => onPick(d)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="text-left px-2 py-1.5 border-b border-white/[0.04]">
                  <span className="flex items-center gap-1.5">
                    <CoinLogo pair={d.pair} size={16} />
                    <span className="font-bold text-white">{d.sym}</span>
                  </span>
                </td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04]"><span className="px-1.5 py-0.5 rounded text-[9px] uppercase" style={{ color: stColor(d.status), border: `1px solid ${stColor(d.status)}` }}>{d.status}</span></td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04]" style={{ color: d.price_change_24h >= 0 ? "#34d399" : "#f87171" }}>{d.price_change_24h >= 0 ? "+" : ""}{d.price_change_24h.toFixed(1)}%</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04]" style={{ color: d.from_call >= 0 ? "#34d399" : "#f87171" }}>{d.from_call >= 0 ? "+" : ""}{d.from_call.toFixed(1)}%</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04] text-gold-primary">{d.win_rate == null ? "—" : d.win_rate.toFixed(0) + "%"}</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04] text-white/80">{(d.flow_intensity * 100).toFixed(1)}%</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04] text-white/80">{d.btc_align ?? "—"}</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04] text-emerald-400/90">+{d.max_target.toFixed(0)}%</td>
                <td className="text-right px-2 py-1.5 border-b border-white/[0.04] text-white/80">${shortNum(d.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
