// src/components/MoneyFlowPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Money Flow Page (v5 — rail nav + signal modal)
// Nav: left vertical rail (Performance-style) on desktop, tab strip on mobile.
//   - Sectors : macro gauges + ranked sector rotation
//   - Coins   : unified filterable flow table (logo + calls highlight),
//               desktop 2-col Flow ↔ DEX (aligned), call rows → SignalModal
//   - Whale   : feed transaksi (reuse WhaleAlertPage)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import moneyFlowApi from "../services/moneyFlowApi";
import WhaleAlertPage from "./WhaleAlertPage";
import CoinLogo from "./CoinLogo";
import SignalModal from "./SignalModal";
import AssistantWidget from "./assistant/AssistantWidget";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ═══════════════════════════════════════════
// Format helpers
// ═══════════════════════════════════════════
const fmtUSD = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const pctColor = (v) =>
  v === null || v === undefined
    ? "text-text-muted"
    : Number(v) > 0
    ? "text-emerald-400"
    : Number(v) < 0
    ? "text-red-400"
    : "text-white/70";

const TURNOVER_LABEL = {
  high_turnover: "High",
  elevated_turnover: "Elevated",
  normal_turnover: "Normal",
};
const FLOW_LABEL = { net_buying: "Net Buying", net_selling: "Net Selling", balanced: "Balanced" };

// ═══════════════════════════════════════════
// Primitives
// ═══════════════════════════════════════════
const SectionHeader = ({ label, right }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className="font-mono uppercase tracking-[0.25em] text-gold-primary/80 text-[11px] whitespace-nowrap">
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
    {right}
  </div>
);

const Card = ({ children, className = "", glow = false }) => (
  <div
    className={`relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-lg ${
      glow ? "shadow-[0_0_40px_-12px_rgba(212,175,55,0.15)]" : ""
    } ${className}`}
  >
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

const Skeleton = ({ rows = 6 }) => (
  <div className="divide-y divide-white/[0.04]">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-6 h-6 bg-white/[0.04] rounded-full animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/3 animate-pulse" />
          <div className="h-1.5 bg-white/[0.03] rounded w-2/3 animate-pulse" />
        </div>
        <div className="w-16 h-3 bg-white/[0.05] rounded animate-pulse" />
      </div>
    ))}
  </div>
);

const Row = ({ i, children }) => (
  <div
    className="opacity-0 animate-[mfIn_0.4s_ease-out_forwards]"
    style={{ animationDelay: `${Math.min(i * 24, 360)}ms` }}
  >
    {children}
  </div>
);

const IntensityBar = ({ value, max, gold = false }) => {
  const pct = Math.max(4, Math.min(100, ((value || 0) / (max || 1)) * 100));
  return (
    <div className="h-1 w-full rounded-full bg-white/[0.05] overflow-hidden mt-1">
      <div
        className={`h-full rounded-full transition-all duration-700 ${gold ? "bg-gold-primary/70" : "bg-white/30"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

const ShowMore = ({ expanded, total, onClick }) => (
  <button
    onClick={onClick}
    className="w-full py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted hover:text-gold-primary border-t border-white/[0.04] transition-colors"
  >
    {expanded ? "Show less" : `Show all ${total}`}
  </button>
);

const Spinner = ({ className = "" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
  </svg>
);

// ═══════════════════════════════════════════
// Tab icons
// ═══════════════════════════════════════════
const IconSectors = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9l7 5" />
  </svg>
);
const IconCoins = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);
const IconWhale = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 8h12l-3-3" />
    <path d="M17 16H5l3 3" />
  </svg>
);

// ═══════════════════════════════════════════
// MACRO — gauge cards
// ═══════════════════════════════════════════
const Gauge = ({ value, label, sub, subColor, accent = "gold" }) => {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const bar =
    accent === "gold" ? "bg-gold-primary" : accent === "emerald" ? "bg-emerald-400" : "bg-white/60";
  return (
    <Card className="p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70 mb-2">{label}</div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-mono text-2xl tabular-nums text-white leading-none">
          {value != null ? (typeof value === "number" ? value.toFixed(1) : value) : "—"}
        </span>
        {sub && <span className={`font-mono text-[10px] tabular-nums ${subColor || "text-text-muted/60"}`}>{sub}</span>}
      </div>
      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
};

const MacroBlock = ({ macro }) => {
  if (!macro || macro.note) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Gauge
        label="BTC Dominance"
        value={macro.btc_dominance}
        sub={macro.btc_dominance_change_7d != null ? `${macro.btc_dominance_change_7d > 0 ? "+" : ""}${macro.btc_dominance_change_7d}pp 7d` : null}
        subColor={pctColor(macro.btc_dominance_change_7d)}
        accent="gold"
      />
      <Gauge label="ETH Dominance" value={macro.eth_dominance} accent="white" />
      <Gauge
        label="Stablecoin Dom"
        value={macro.stablecoin_dominance}
        sub={macro.stablecoin_dominance_change_7d != null ? `${macro.stablecoin_dominance_change_7d > 0 ? "+" : ""}${macro.stablecoin_dominance_change_7d}pp 7d` : null}
        subColor={macro.stablecoin_dominance_change_7d != null ? pctColor(-macro.stablecoin_dominance_change_7d) : ""}
        accent="white"
      />
      <Gauge
        label={`Altseason ${macro.altseason_window || "30d"}`}
        value={macro.altseason_index}
        sub={macro.altseason_index != null ? "/ 100" : null}
        accent="emerald"
      />
    </div>
  );
};

// ═══════════════════════════════════════════
// TAB 1 — SECTORS
// ═══════════════════════════════════════════
const SectorsTab = () => {
  const [macro, setMacro] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [m, s] = await Promise.all([moneyFlowApi.getMacro(), moneyFlowApi.getSectors({ limit: 20 })]);
        if (!alive) return;
        setMacro(m);
        setSectors(s.sectors || []);
      } catch {
        if (alive) setErr("Failed to load sector data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader label="Market Compass" />
      <MacroBlock macro={macro} />

      <SectionHeader label="Sector Rotation" />
      <Card glow>
        <div className="grid grid-cols-[2rem_1fr_5rem_6rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem] gap-3 px-4 py-3 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70">
          <span>#</span>
          <span>Sector</span>
          <span className="text-right">24h</span>
          <span className="text-right hidden sm:block">7d</span>
          <span className="text-right">Mcap</span>
        </div>

        {loading && <Skeleton rows={10} />}
        {err && !loading && <div className="p-8 text-center text-red-400 text-sm font-mono">{err}</div>}

        {!loading && !err && (
          <div className="divide-y divide-white/[0.04]">
            {sectors.map((s, i) => {
              const isLeader = i < 3;
              return (
                <Row key={s.category_id} i={i}>
                  <div className="grid grid-cols-[2rem_1fr_5rem_6rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem] gap-3 items-center px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                    <span className={`font-mono text-xs tabular-nums ${isLeader ? "text-gold-primary" : "text-text-muted/50"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex -space-x-1.5 shrink-0">
                        {(s.top_3_coins || []).slice(0, 3).map((url, k) => (
                          <img key={k} src={url} alt="" className="w-5 h-5 rounded-full border border-[#0a0805] bg-white/5" onError={(e) => (e.target.style.display = "none")} />
                        ))}
                      </div>
                      <span className="text-white text-sm truncate">{s.name}</span>
                      {isLeader && (
                        <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary/80 border border-gold-primary/25">
                          Leader
                        </span>
                      )}
                    </div>
                    <span className={`font-mono text-sm tabular-nums text-right font-semibold ${pctColor(s.mcap_change_24h)}`}>
                      {fmtPct(s.mcap_change_24h)}
                    </span>
                    <span className={`font-mono text-xs tabular-nums text-right hidden sm:block ${pctColor(s.mcap_change_7d)}`}>
                      {s.mcap_change_7d != null ? fmtPct(s.mcap_change_7d) : <span className="text-text-muted/30">—</span>}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-right text-text-muted">{fmtUSD(s.market_cap)}</span>
                  </div>
                </Row>
              );
            })}
          </div>
        )}
      </Card>
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
        7d delta terisi seiring snapshot terkumpul · Data: CoinGecko
      </p>
    </div>
  );
};

// ═══════════════════════════════════════════
// TAB 2 — COINS
// ═══════════════════════════════════════════
const FlowFilterChip = ({ active, gold, onClick, children }) => (
  <button
    onClick={onClick}
    className={`font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
      active
        ? gold
          ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
          : "bg-white/[0.08] text-white border-white/20"
        : "bg-white/[0.04] text-text-muted border-white/[0.1] hover:text-white hover:border-white/20"
    }`}
  >
    {children}
  </button>
);

const CoinFlowRow = ({ c, i, max, called, onOpen, loadingSym }) => {
  const hi = c.turnover_tag === "high_turnover";
  const clickable = called && !!onOpen;
  const isLoading = loadingSym === c.symbol;
  return (
    <Row i={i}>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onOpen(c) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c); } } : undefined}
        className={`group/row grid grid-cols-[1fr_4.5rem_4.5rem] sm:grid-cols-[1fr_6rem_6rem_5rem] gap-3 items-center px-3 sm:px-4 py-3 transition-colors ${
          called ? "border-l-2 border-gold-primary/50" : "border-l-2 border-transparent"
        } ${clickable ? "cursor-pointer hover:bg-gold-primary/[0.06]" : called ? "hover:bg-gold-primary/[0.03]" : "hover:bg-white/[0.02]"}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CoinLogo pair={c.symbol} size={26} className="flex-shrink-0" />
          <span className={`text-sm font-semibold truncate ${called ? "text-gold-primary" : "text-white"}`}>{c.symbol}</span>
          {called && (
            <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary border border-gold-primary/30">
              Call
            </span>
          )}
          {clickable && (
            isLoading ? (
              <Spinner className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/70" />
            ) : (
              <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/40 group-hover/row:text-gold-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            )
          )}
        </div>
        <span className={`font-mono text-sm tabular-nums text-right font-semibold ${pctColor(c.price_change_24h)}`}>
          {fmtPct(c.price_change_24h)}
        </span>
        <div className="hidden sm:block text-right">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
          </span>
          <IntensityBar value={c.flow_intensity} max={max} gold={called} />
        </div>
        <span className="text-right">
          {c.turnover_tag && (
            <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              hi ? "text-gold-primary border-gold-primary/25 bg-gold-primary/10" : "text-text-muted border-white/[0.08] bg-white/[0.03]"
            }`}>
              {TURNOVER_LABEL[c.turnover_tag]}
            </span>
          )}
        </span>
      </div>
    </Row>
  );
};

const DexRow = ({ p, i }) => {
  const b = p.buys_24h || 0;
  const s = p.sells_24h || 0;
  const total = b + s || 1;
  const buyPct = (b / total) * 100;
  return (
    <Row i={i}>
      <div className="px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-sm font-medium truncate">{p.base_symbol || p.name}</span>
            {p.flow_tag && (
              <span className={`shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                p.flow_tag === "net_buying" ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
                : p.flow_tag === "net_selling" ? "text-red-400 border-red-500/25 bg-red-500/10"
                : "text-white/60 border-white/[0.08] bg-white/[0.03]"
              }`}>
                {FLOW_LABEL[p.flow_tag]}
              </span>
            )}
          </div>
          <div className="shrink-0 font-mono text-[11px] tabular-nums">
            <span className="text-emerald-400">{b.toLocaleString()}</span>
            <span className="text-text-muted/30"> / </span>
            <span className="text-red-400">{s.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-red-500/30">
          <div className="h-full bg-emerald-400/80 transition-all duration-700" style={{ width: `${buyPct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50">
          <span>Vol {fmtUSD(p.volume_24h_usd)}</span>
          <span>Liq {fmtUSD(p.reserve_usd)}</span>
        </div>
      </div>
    </Row>
  );
};

const COIN_LIMIT = 14;
const DEX_LIMIT = 8;

const CoinsTab = () => {
  const [coins, setCoins] = useState([]);
  const [dex, setDex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dexLoading, setDexLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | calls | others
  const [showAll, setShowAll] = useState(false);
  const [dexShowAll, setDexShowAll] = useState(false);

  const [selectedSignal, setSelectedSignal] = useState(null);
  const [loadingSym, setLoadingSym] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const c = await moneyFlowApi.getCoins({ limit: 40 });
        if (alive) setCoins(c.coins || []);
      } catch { /* keep */ } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const d = await moneyFlowApi.getDex(); if (alive) setDex(d); }
      catch { /* noop */ } finally { if (alive) setDexLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Resolve a LuxQuant-called coin → its ACTIVE signal, then open SignalModal.
  //
  // IMPORTANT: the coin object here only has { symbol, is_luxquant_signal, ... }
  // — no signal_id, no pair. And /api/v1/signals/?pair=XXX returns CLOSED signals
  // only (history), so the live signal (status open/tp1..tp4) is never in it.
  //
  // The source of truth for *active* signals is the SAME feed Potential Trades
  // uses: GET /api/v1/signals/bulk-7d → { items: [...] }. We fetch it (with the
  // same Bearer auth as SignalsPage), find this coin's pair, prefer the active /
  // newest one, and hand the FULL object to SignalModal — identical to the path
  // SignalsTable rows take (setSelectedSignal(signal)).
  const openSignal = async (c) => {
    const sym = String(c.symbol || "").toUpperCase();
    const pair = (c.pair || `${sym}USDT`).toUpperCase();
    setLoadingSym(c.symbol);
    try {
      const token = localStorage.getItem("access_token");
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: authHeaders });
      if (!r.ok) {
        console.warn("[MoneyFlow] bulk-7d HTTP", r.status, "for", pair);
        return;
      }
      const d = await r.json();
      const items = Array.isArray(d.items) ? d.items
        : Array.isArray(d.signals) ? d.signals
        : Array.isArray(d.data) ? d.data
        : Array.isArray(d) ? d
        : [];
      if (!items.length) {
        console.warn("[MoneyFlow] bulk-7d empty for", pair);
        return;
      }

      const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const wantPair = norm(pair);
      const wantSym = norm(sym);
      let cand = items.filter((x) => {
        const xp = norm(x.pair || x.symbol);
        return xp === wantPair || xp === wantSym || xp === wantSym + "USDT";
      });
      if (!cand.length) {
        console.warn("[MoneyFlow] no active signal in bulk-7d for", pair);
        return;
      }

      const ts = (x) => {
        const v = x.created_at || x.createdAt || x.called_at || x.entry_at ||
                  x.opened_at || x.updated_at || x.last_update_at;
        const t = v ? Date.parse(v) : NaN;
        return Number.isNaN(t) ? 0 : t;
      };
      const isClosed = (x) => /closed|cancel|expired|stopped/i.test(String(x.status || ""));

      cand.sort((a, b) => {
        // active before closed, then newest first
        const ca = isClosed(a) ? 1 : 0;
        const cb = isClosed(b) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return ts(b) - ts(a);
      });

      const sig = cand[0];
      if (sig && sig.signal_id) {
        // Hand off the FULL item — SignalModal reads everything it needs from the
        // prop (same shape SignalsTable passes). pair guaranteed for safety.
        setSelectedSignal({ ...sig, pair: sig.pair || pair });
      } else {
        console.warn("[MoneyFlow] resolved signal missing signal_id for", pair);
      }
    } catch (e) {
      console.error("[MoneyFlow] openSignal error", e);
    } finally {
      setLoadingSym(null);
    }
  };

  const maxIntensity = Math.max(...coins.map((c) => c.flow_intensity || 0), 0.5);
  const called = coins.filter((c) => c.is_luxquant_signal);
  const others = coins.filter((c) => !c.is_luxquant_signal);
  const ordered = [...called, ...others];
  const base = filter === "calls" ? called : filter === "others" ? others : ordered;
  const shownCoins = showAll ? base : base.slice(0, COIN_LIMIT);

  const dexPools = dex?.pools || [];
  const shownDex = dexShowAll ? dexPools : dexPools.slice(0, DEX_LIMIT);

  const setF = (f) => { setFilter(f); setShowAll(false); };

  const colHeader = (
    <div className="grid grid-cols-[1fr_4.5rem_4.5rem] sm:grid-cols-[1fr_6rem_6rem_5rem] gap-3 px-3 sm:px-4 py-3 border-l-2 border-transparent border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70">
      <span>Coin</span>
      <span className="text-right">24h</span>
      <span className="text-right hidden sm:block">Vol / Mcap</span>
      <span className="text-right">Turnover</span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5 lg:gap-4 items-start">
        {/* ── LEFT: Coin flow intensity ── */}
        <div className="space-y-3">
          <SectionHeader label="Coin Flow Intensity" />

          <div className="min-h-[34px] flex flex-wrap items-center gap-1.5">
            <FlowFilterChip active={filter === "all"} onClick={() => setF("all")}>
              All <span className="opacity-60">{coins.length}</span>
            </FlowFilterChip>
            <FlowFilterChip gold active={filter === "calls"} onClick={() => setF("calls")}>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gold-primary" />
                LuxQuant Calls <span className="opacity-70">{called.length}</span>
              </span>
            </FlowFilterChip>
            <FlowFilterChip active={filter === "others"} onClick={() => setF("others")}>
              Others <span className="opacity-60">{others.length}</span>
            </FlowFilterChip>
          </div>

          {loading && <Card glow><Skeleton rows={10} /></Card>}

          {!loading && base.length === 0 && (
            <Card><div className="p-10 text-center text-text-muted text-sm font-mono">No data</div></Card>
          )}

          {!loading && base.length > 0 && (
            <Card glow>
              {colHeader}
              <div className="divide-y divide-white/[0.04]">
                {shownCoins.map((c, i) => (
                  <CoinFlowRow
                    key={c.coin_id}
                    c={c}
                    i={i}
                    max={maxIntensity}
                    called={c.is_luxquant_signal}
                    onOpen={openSignal}
                    loadingSym={loadingSym}
                  />
                ))}
              </div>
              {base.length > COIN_LIMIT && (
                <ShowMore expanded={showAll} total={base.length} onClick={() => setShowAll((v) => !v)} />
              )}
            </Card>
          )}

          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
            Flow intensity = volume 24h ÷ market cap · baris emas = klik buat buka signal
          </p>
        </div>

        {/* ── RIGHT: DEX buy/sell pressure ── */}
        <div className="space-y-3">
          <SectionHeader label="DEX Buy / Sell Pressure" />

          <div className="min-h-[34px] flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/60">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/80" />Buy</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/50" />Sell</span>
            <span className="text-text-muted/35">· 24h</span>
          </div>

          <Card glow>
            {dexLoading && <Skeleton rows={6} />}
            {!dexLoading && dexPools.length === 0 && (
              <div className="p-10 text-center text-text-muted text-sm font-mono">DEX data unavailable</div>
            )}
            {!dexLoading && dexPools.length > 0 && (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {shownDex.map((p, i) => (
                    <DexRow key={p.pool_address} p={p} i={i} />
                  ))}
                </div>
                {dexPools.length > DEX_LIMIT && (
                  <ShowMore expanded={dexShowAll} total={dexPools.length} onClick={() => setDexShowAll((v) => !v)} />
                )}
              </>
            )}
          </Card>
          <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
            Trending DEX pools (incl. meme/alt) · bar = beli vs jual 24h · Data: GeckoTerminal
          </p>
        </div>
      </div>

      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </>
  );
};

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
const TABS = [
  { key: "sectors", label: "Sectors", sub: "Macro rotation", icon: <IconSectors /> },
  { key: "coins", label: "Coins", sub: "Flow intensity", icon: <IconCoins /> },
  { key: "whale", label: "Whale Alert", sub: "Large transactions", icon: <IconWhale /> },
];

export default function MoneyFlowPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("sectors");

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      <style>{`@keyframes mfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="flex gap-6">
        {/* ── LEFT RAIL (desktop) ── */}
        <aside className="hidden lg:block w-44 flex-shrink-0">
          <div className="sticky top-20">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/70 mb-3 pl-1">
              Money Flow
            </div>
            <nav className="relative pl-3 border-l border-white/[0.08] space-y-1">
              {TABS.map((tb) => {
                const active = tab === tb.key;
                return (
                  <button
                    key={tb.key}
                    onClick={() => setTab(tb.key)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left border transition-colors ${
                      active ? "bg-white/[0.04] border-white/[0.08]" : "border-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <span className={`flex-shrink-0 transition-colors ${active ? "text-gold-primary" : "text-text-muted"}`}>
                      {tb.icon}
                    </span>
                    <span className="leading-tight min-w-0">
                      <span className={`block text-[13px] truncate ${active ? "text-white" : "text-text-secondary"}`}>
                        {tb.label}
                      </span>
                      <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted/50 truncate">
                        {tb.sub}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-6">
          <div>
            <SectionHeader label="Money Flow" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight mt-3">Money Flow</h1>
            <p className="text-text-muted text-sm mt-1.5 font-mono">
              Where capital is rotating — sectors, coins, and whale transactions
            </p>
          </div>

          {/* mobile tab strip */}
          <div className="lg:hidden flex items-stretch gap-1 border-b border-white/[0.06] overflow-x-auto">
            {TABS.map((tb) => {
              const active = tab === tb.key;
              return (
                <button
                  key={tb.key}
                  onClick={() => setTab(tb.key)}
                  className="relative flex items-center gap-2 px-4 py-3 whitespace-nowrap"
                >
                  <span className={active ? "text-gold-primary" : "text-text-muted"}>{tb.icon}</span>
                  <span className={`font-mono text-[12px] uppercase tracking-[0.1em] ${active ? "text-white" : "text-text-muted"}`}>
                    {tb.label}
                  </span>
                  {active && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-gold-primary rounded-full" />}
                </button>
              );
            })}
          </div>

          {tab === "sectors" && <SectorsTab />}
          {tab === "coins" && <CoinsTab />}
          {tab === "whale" && (
            <div className="-mx-4 -mt-2">
              <WhaleAlertPage />
            </div>
          )}
        </div>
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="money-flow" />
    </div>
  );
}
