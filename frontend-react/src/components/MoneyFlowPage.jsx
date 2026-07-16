// src/components/MoneyFlowPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Money Flow Page (v6 — Delistings-style shell)
// Layout parity with Exchange Delistings:
//   · full-width container (px-4 lg:px-8)
//   · eyebrow + title + description header
//   · horizontal underline tab bar (icon + label) with contextual search
//   · responsive <table> rows w/ sortable headers + mobile column priority
// Tabs:
//   - Sectors : macro gauges + sortable sector-rotation table
//   - Coins   : sortable coin-flow table (calls highlighted, row → SignalModal)
//               + DEX buy/sell pressure block
//   - Whale   : large-transaction feed (reuse WhaleAlertPage)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import moneyFlowApi from "../services/moneyFlowApi";
import WhaleAlertPage from "./WhaleAlertPage";
import CoinLogo from "./CoinLogo";
import SignalModal from "./SignalModal";
import SectorCoinsModal from "./SectorCoinsModal";
import AssistantWidget from "./assistant/AssistantWidget";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ═══════════════════════════════════════════
// Resolve a LuxQuant-called coin → its ACTIVE signal object (or null).
// Source of truth for active signals = same feed Potential Trades uses:
// GET /api/v1/signals/bulk-7d. Shared by Coins tab & Sector drill-down.
// ═══════════════════════════════════════════
async function resolveActiveSignal(sym, pair) {
  const S = String(sym || "").toUpperCase();
  const P = (pair || `${S}USDT`).toUpperCase();
  const token = localStorage.getItem("access_token");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: authHeaders });
  if (!r.ok) return null;
  const d = await r.json();
  const items = Array.isArray(d.items) ? d.items
    : Array.isArray(d.signals) ? d.signals
    : Array.isArray(d.data) ? d.data
    : Array.isArray(d) ? d : [];
  if (!items.length) return null;
  const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wantPair = norm(P), wantSym = norm(S);
  const cand = items.filter((x) => {
    const xp = norm(x.pair || x.symbol);
    return xp === wantPair || xp === wantSym || xp === wantSym + "USDT";
  });
  if (!cand.length) return null;
  const ts = (x) => {
    const v = x.created_at || x.createdAt || x.called_at || x.entry_at || x.opened_at || x.updated_at || x.last_update_at;
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const isClosed = (x) => /closed|cancel|expired|stopped/i.test(String(x.status || ""));
  cand.sort((a, b) => {
    const ca = isClosed(a) ? 1 : 0, cb = isClosed(b) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return ts(b) - ts(a);
  });
  const sig = cand[0];
  return sig && sig.signal_id ? { ...sig, pair: sig.pair || P } : null;
}

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
    : "text-text-primary/70";

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
    className={`relative overflow-hidden bg-surface-raised border border-white/[0.06] rounded-lg ${
      glow ? "shadow-[0_0_40px_-12px_rgba(212,175,55,0.15)]" : ""
    } ${className}`}
  >
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

// Sortable table header cell — shared across sector & coin tables (Delistings parity)
const Th = ({ label, sortKey, sort, onSort, align = "right", sortable = true, className = "" }) => {
  const active = sort?.key === sortKey;
  const alignCls = align === "left" ? "text-left" : "text-right";
  if (!sortable) {
    return (
      <th className={`py-2.5 px-2 sm:px-3 ${alignCls} font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35 ${className}`}>
        {label}
      </th>
    );
  }
  return (
    <th className={`py-2.5 px-2 sm:px-3 ${alignCls} ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
          active ? "text-gold-primary" : "text-text-primary/35 hover:text-text-primary/60"
        } ${align === "left" ? "" : "flex-row-reverse"}`}
      >
        {label}
        <span className="text-[7px]">{active ? (sort.dir === "desc" ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );
};

const useSort = (initialKey, initialDir = "desc") => {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const onSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  return [sort, onSort];
};

const sortRows = (rows, sort, valFn) =>
  [...rows].sort((a, b) => {
    const va = valFn(a, sort.key);
    const vb = valFn(b, sort.key);
    const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
    return sort.dir === "asc" ? cmp : -cmp;
  });

const TableSkeleton = ({ rows = 8, cols = 4 }) => (
  <tbody>
    {[...Array(rows)].map((_, i) => (
      <tr key={i} className="border-b border-white/[0.05]">
        {[...Array(cols)].map((__, k) => (
          <td key={k} className="py-3 px-3">
            <div className={`h-3 rounded bg-white/[0.05] animate-pulse ${k === 0 ? "w-2/3" : "w-12 ml-auto"}`} />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

// Mobile card skeleton (shown < sm, in place of the table skeleton)
const CardSkeleton = ({ rows = 6 }) => (
  <div className="divide-y divide-white/[0.05]">
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="px-3 py-3.5">
        <div className="h-3 w-1/2 bg-white/[0.05] rounded animate-pulse mb-3" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-3 bg-white/[0.04] rounded animate-pulse" />
          <div className="h-3 bg-white/[0.04] rounded animate-pulse" />
          <div className="h-3 bg-white/[0.04] rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

// Labeled stat used inside mobile cards
const StatCell = ({ label, value, color = "text-text-primary", align = "left" }) => (
  <div className={`flex flex-col ${align === "right" ? "items-end" : ""}`}>
    <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/50">{label}</span>
    <span className={`font-mono text-[13px] tabular-nums font-semibold ${color}`}>{value}</span>
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

const SearchBox = ({ value, onChange, placeholder = "Search…" }) => (
  <div className="relative flex-shrink-0 w-32 sm:w-56 mb-2">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-3 pr-3 py-1.5 bg-surface border border-white/[0.08] rounded-md text-text-primary placeholder-white/30 font-mono text-[11px] focus:border-gold-primary/40 focus:outline-none"
    />
  </div>
);

// ═══════════════════════════════════════════
// Tab icons
// ═══════════════════════════════════════════
const IconSectors = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9l7 5" />
  </svg>
);
const IconCoins = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);
const IconWhale = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
        <span className="font-mono text-2xl tabular-nums text-text-primary leading-none">
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
const SectorsTab = ({ q }) => {
  const [macro, setMacro] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sort, onSort] = useSort("mcap_change_24h", "desc");

  // Sector drill-down + signal open
  const [selectedSector, setSelectedSector] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [loadingSym, setLoadingSym] = useState(null);

  const openSignal = async (c) => {
    const sym = String(c.symbol || "").toUpperCase();
    const pair = (c.pair || `${sym}USDT`).toUpperCase();
    setLoadingSym(c.symbol);
    try {
      const sig = await resolveActiveSignal(sym, pair);
      if (sig) setSelectedSignal(sig);
    } catch (e) {
      console.error("[MoneyFlow] sector openSignal error", e);
    } finally {
      setLoadingSym(null);
    }
  };

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

  const rows = useMemo(() => {
    let r = sectors;
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter((x) => (x.name || "").toUpperCase().includes(s));
    }
    const val = (x, k) => {
      switch (k) {
        case "name": return x.name || "￿";
        case "mcap_change_24h": return x.mcap_change_24h ?? -Infinity;
        case "mcap_change_7d": return x.mcap_change_7d ?? -Infinity;
        case "market_cap": return x.market_cap ?? -Infinity;
        default: return 0;
      }
    };
    return sortRows(r, sort, val);
  }, [sectors, q, sort]);

  const leaderIds = useMemo(() => {
    // Leaders = top 3 by 24h move, independent of current sort
    return [...sectors]
      .sort((a, b) => (b.mcap_change_24h ?? -Infinity) - (a.mcap_change_24h ?? -Infinity))
      .slice(0, 3)
      .map((s) => s.category_id);
  }, [sectors]);

  return (
    <>
    <div className="space-y-6">
      <SectionHeader label="Market Compass" />
      <MacroBlock macro={macro} />

      <SectionHeader label="Sector Rotation" />
      <Card glow>
        {/* Desktop / tablet table (≥ sm) */}
        <table className="hidden sm:table w-full border-collapse table-fixed">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="py-2.5 px-2 sm:px-3 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35 w-10">#</th>
              <Th label="Sector" sortKey="name" sort={sort} onSort={onSort} align="left" />
              <Th label="24h" sortKey="mcap_change_24h" sort={sort} onSort={onSort} className="w-24" />
              <Th label="7d" sortKey="mcap_change_7d" sort={sort} onSort={onSort} className="hidden md:table-cell w-24" />
              <Th label="Mcap" sortKey="market_cap" sort={sort} onSort={onSort} className="w-28" />
            </tr>
          </thead>

          {loading && <TableSkeleton rows={10} cols={5} />}

          {!loading && !err && (
            <tbody>
              {rows.map((s, i) => {
                const isLeader = leaderIds.includes(s.category_id);
                return (
                  <tr
                    key={s.category_id}
                    onClick={() => setSelectedSector(s)}
                    className="group border-b border-white/[0.05] hover:bg-gold-primary/[0.04] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-2 sm:px-3 font-mono text-xs tabular-nums text-text-muted/50">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="py-3 px-2 sm:px-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex -space-x-1.5 shrink-0">
                          {(s.top_3_coins || []).slice(0, 3).map((url, k) => (
                            <img key={k} src={url} alt="" className="w-5 h-5 rounded-full border border-surface-raised bg-white/5" onError={(e) => (e.target.style.display = "none")} />
                          ))}
                        </div>
                        <span className="text-text-primary text-sm truncate group-hover:text-gold-primary transition-colors">{s.name}</span>
                        {isLeader && (
                          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary/80 border border-line/25">
                            Leader
                          </span>
                        )}
                        <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-text-primary/20 group-hover:text-gold-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </div>
                    </td>
                    <td className={`py-3 px-2 sm:px-3 text-right font-mono text-sm tabular-nums font-semibold ${pctColor(s.mcap_change_24h)}`}>
                      {fmtPct(s.mcap_change_24h)}
                    </td>
                    <td className={`hidden md:table-cell py-3 px-3 text-right font-mono text-xs tabular-nums ${pctColor(s.mcap_change_7d)}`}>
                      {s.mcap_change_7d != null ? fmtPct(s.mcap_change_7d) : <span className="text-text-muted/30">—</span>}
                    </td>
                    <td className="py-3 px-2 sm:px-3 text-right font-mono text-xs tabular-nums text-text-muted whitespace-nowrap">
                      {fmtUSD(s.market_cap)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>

        {/* Mobile cards (< sm) */}
        <div className="sm:hidden">
          {loading && <CardSkeleton rows={8} />}
          {!loading && !err && rows.length > 0 && (
            <div className="divide-y divide-white/[0.05]">
              {rows.map((s, i) => {
                const isLeader = leaderIds.includes(s.category_id);
                return (
                  <div
                    key={s.category_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSector(s)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSector(s); } }}
                    className="px-3 py-3 cursor-pointer active:bg-gold-primary/[0.06]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[11px] tabular-nums text-text-muted/40 w-5 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex -space-x-1.5 shrink-0">
                        {(s.top_3_coins || []).slice(0, 3).map((url, k) => (
                          <img key={k} src={url} alt="" className="w-5 h-5 rounded-full border border-surface-raised bg-white/5" onError={(e) => (e.target.style.display = "none")} />
                        ))}
                      </div>
                      <span className="text-text-primary text-sm truncate flex-1">{s.name}</span>
                      {isLeader && (
                        <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary/80 border border-line/25">
                          Leader
                        </span>
                      )}
                      <svg className="w-3.5 h-3.5 shrink-0 text-text-primary/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <StatCell label="24h" value={fmtPct(s.mcap_change_24h)} color={pctColor(s.mcap_change_24h)} />
                      <StatCell
                        label="7d"
                        value={s.mcap_change_7d != null ? fmtPct(s.mcap_change_7d) : "—"}
                        color={s.mcap_change_7d != null ? pctColor(s.mcap_change_7d) : "text-text-muted/30"}
                      />
                      <StatCell label="Mcap" value={fmtUSD(s.market_cap)} color="text-text-muted" align="right" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {err && !loading && <div className="p-8 text-center text-red-400 text-sm font-mono">{err}</div>}
        {!loading && !err && rows.length === 0 && (
          <div className="p-10 text-center text-text-muted text-sm font-mono">No sectors match "{q}".</div>
        )}
      </Card>

      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
        Leaders = top-3 by 24h move · tap a row to see every coin in the narrative · Data: CoinGecko
      </p>
    </div>

    {/* Drill-down: all coins in the clicked narrative */}
    <SectorCoinsModal
      sector={selectedSector}
      isOpen={!!selectedSector}
      onClose={() => setSelectedSector(null)}
      onOpenSignal={openSignal}
      loadingSym={loadingSym}
    />

    {/* Signal modal for a called coin opened from the drill-down */}
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
// TAB 2 — COINS
// ═══════════════════════════════════════════
const FlowFilterChip = ({ active, gold, onClick, children }) => (
  <button
    onClick={onClick}
    className={`font-mono text-[10px] uppercase tracking-[0.08em] px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
      active
        ? gold
          ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
          : "bg-white/[0.08] text-text-primary border-white/20"
        : "bg-white/[0.04] text-text-muted border-white/[0.1] hover:text-text-primary hover:border-white/20"
    }`}
  >
    {children}
  </button>
);

const DexRow = ({ p }) => {
  const b = p.buys_24h || 0;
  const s = p.sells_24h || 0;
  const total = b + s || 1;
  const buyPct = (b / total) * 100;
  return (
    <div className="px-4 py-3.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.05] last:border-b-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text-primary text-sm font-medium truncate">{p.base_symbol || p.name}</span>
          {p.flow_tag && (
            <span className={`shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              p.flow_tag === "net_buying" ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
              : p.flow_tag === "net_selling" ? "text-red-400 border-red-500/25 bg-red-500/10"
              : "text-text-primary/60 border-white/[0.08] bg-white/[0.03]"
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
  );
};

const COIN_LIMIT = 15;
const DEX_LIMIT = 8;

const CoinsTab = ({ q }) => {
  const [coins, setCoins] = useState([]);
  const [dex, setDex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dexLoading, setDexLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | calls | others
  const [showAll, setShowAll] = useState(false);
  const [dexShowAll, setDexShowAll] = useState(false);
  const [sort, onSort] = useSort("flow_intensity", "desc");

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

  useEffect(() => { setShowAll(false); }, [filter, q, sort]);

  // Resolve a LuxQuant-called coin → its ACTIVE signal, then open SignalModal.
  const openSignal = async (c) => {
    const sym = String(c.symbol || "").toUpperCase();
    const pair = (c.pair || `${sym}USDT`).toUpperCase();
    setLoadingSym(c.symbol);
    try {
      const sig = await resolveActiveSignal(sym, pair);
      if (sig) setSelectedSignal(sig);
      else console.warn("[MoneyFlow] no active signal for", pair);
    } catch (e) {
      console.error("[MoneyFlow] openSignal error", e);
    } finally {
      setLoadingSym(null);
    }
  };

  const maxIntensity = Math.max(...coins.map((c) => c.flow_intensity || 0), 0.5);

  const rows = useMemo(() => {
    const called = coins.filter((c) => c.is_luxquant_signal);
    const others = coins.filter((c) => !c.is_luxquant_signal);
    let base = filter === "calls" ? called : filter === "others" ? others : coins;
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      base = base.filter((c) => String(c.symbol || "").toUpperCase().includes(s));
    }
    const val = (x, k) => {
      switch (k) {
        case "symbol": return String(x.symbol || "￿");
        case "price_change_24h": return x.price_change_24h ?? -Infinity;
        case "flow_intensity": return x.flow_intensity ?? -Infinity;
        default: return 0;
      }
    };
    // Calls always float to the top within the current sort
    const sorted = sortRows(base, sort, val);
    return [...sorted.filter((c) => c.is_luxquant_signal), ...sorted.filter((c) => !c.is_luxquant_signal)];
  }, [coins, filter, q, sort]);

  const calledCount = coins.filter((c) => c.is_luxquant_signal).length;
  const othersCount = coins.length - calledCount;
  const shownCoins = showAll ? rows : rows.slice(0, COIN_LIMIT);

  const dexPools = dex?.pools || [];
  const shownDex = dexShowAll ? dexPools : dexPools.slice(0, DEX_LIMIT);

  return (
    <>
      <div className="space-y-3">
        <SectionHeader label="Coin Flow Intensity" />

        {/* Filter chips */}
        <div className="min-h-[34px] flex flex-wrap items-center gap-1.5">
          <FlowFilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="opacity-60">{coins.length}</span>
          </FlowFilterChip>
          <FlowFilterChip gold active={filter === "calls"} onClick={() => setFilter("calls")}>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-primary" />
              LuxQuant Calls <span className="opacity-70">{calledCount}</span>
            </span>
          </FlowFilterChip>
          <FlowFilterChip active={filter === "others"} onClick={() => setFilter("others")}>
            Others <span className="opacity-60">{othersCount}</span>
          </FlowFilterChip>
        </div>

        <Card glow>
          {/* Desktop / tablet table (≥ sm) */}
          <table className="hidden sm:table w-full border-collapse table-fixed">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <Th label="Coin" sortKey="symbol" sort={sort} onSort={onSort} align="left" />
                <Th label="24h" sortKey="price_change_24h" sort={sort} onSort={onSort} className="w-24" />
                <Th label="Flow / Vol" sortKey="flow_intensity" sort={sort} onSort={onSort} className="hidden md:table-cell w-28" />
                <Th label="Turnover" sortable={false} className="w-28" />
              </tr>
            </thead>

            {loading && <TableSkeleton rows={10} cols={4} />}

            {!loading && rows.length > 0 && (
              <tbody>
                {shownCoins.map((c) => {
                  const called = c.is_luxquant_signal;
                  const clickable = called;
                  const isLoading = loadingSym === c.symbol;
                  const hi = c.turnover_tag === "high_turnover";
                  return (
                    <tr
                      key={c.coin_id}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => openSignal(c) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSignal(c); } } : undefined}
                      className={`group/row border-b border-white/[0.05] transition-colors ${
                        called ? "border-l-2 border-l-gold-primary/50" : "border-l-2 border-l-transparent"
                      } ${clickable ? "cursor-pointer hover:bg-gold-primary/[0.06]" : "hover:bg-white/[0.02]"}`}
                    >
                      {/* Coin */}
                      <td className="py-3 px-2 sm:px-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CoinLogo pair={c.symbol} size={24} className="flex-shrink-0" />
                          <span className={`text-sm font-semibold truncate ${called ? "text-gold-primary" : "text-text-primary"}`}>{c.symbol}</span>
                          {called && (
                            <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary border border-line/30">
                              Call
                            </span>
                          )}
                          {clickable && (
                            isLoading ? (
                              <Spinner className="w-3.5 h-3.5 flex-shrink-0 text-gold-primary/70" />
                            ) : (
                              <svg className="w-3.5 h-3.5 flex-shrink-0 text-gold-primary/40 group-hover/row:text-gold-primary transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 6l6 6-6 6" />
                              </svg>
                            )
                          )}
                        </div>
                      </td>
                      {/* 24h */}
                      <td className={`py-3 px-2 sm:px-3 text-right font-mono text-sm tabular-nums font-semibold ${pctColor(c.price_change_24h)}`}>
                        {fmtPct(c.price_change_24h)}
                      </td>
                      {/* Flow intensity */}
                      <td className="hidden md:table-cell py-3 px-3 text-right align-middle">
                        <span className="font-mono text-xs tabular-nums text-text-muted">
                          {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
                        </span>
                        <IntensityBar value={c.flow_intensity} max={maxIntensity} gold={called} />
                      </td>
                      {/* Turnover */}
                      <td className="py-3 px-2 sm:px-3 text-right">
                        {c.turnover_tag && (
                          <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            hi ? "text-gold-primary border-line/25 bg-gold-primary/10" : "text-text-muted border-white/[0.08] bg-white/[0.03]"
                          }`}>
                            {TURNOVER_LABEL[c.turnover_tag]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>

          {/* Mobile cards (< sm) */}
          <div className="sm:hidden">
            {loading && <CardSkeleton rows={8} />}
            {!loading && rows.length > 0 && (
              <div className="divide-y divide-white/[0.05]">
                {shownCoins.map((c) => {
                  const called = c.is_luxquant_signal;
                  const clickable = called;
                  const isLoading = loadingSym === c.symbol;
                  const hi = c.turnover_tag === "high_turnover";
                  return (
                    <div
                      key={c.coin_id}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => openSignal(c) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSignal(c); } } : undefined}
                      className={`px-3 py-3 ${called ? "border-l-2 border-l-gold-primary/50" : ""} ${clickable ? "cursor-pointer active:bg-gold-primary/[0.06]" : ""}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoinLogo pair={c.symbol} size={26} className="flex-shrink-0" />
                        <span className={`text-sm font-semibold truncate ${called ? "text-gold-primary" : "text-text-primary"}`}>{c.symbol}</span>
                        {called && (
                          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary border border-line/30">
                            Call
                          </span>
                        )}
                        {clickable && (
                          isLoading ? (
                            <Spinner className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/70" />
                          ) : (
                            <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0 text-gold-primary/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          )
                        )}
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 items-start">
                        <StatCell label="24h" value={fmtPct(c.price_change_24h)} color={pctColor(c.price_change_24h)} />
                        <div className="flex flex-col">
                          <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/50">Flow / Vol</span>
                          <span className="font-mono text-[13px] tabular-nums font-semibold text-text-muted">
                            {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
                          </span>
                          <IntensityBar value={c.flow_intensity} max={maxIntensity} gold={called} />
                        </div>
                        <div className="justify-self-end">
                          {c.turnover_tag && (
                            <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              hi ? "text-gold-primary border-line/25 bg-gold-primary/10" : "text-text-muted border-white/[0.08] bg-white/[0.03]"
                            }`}>
                              {TURNOVER_LABEL[c.turnover_tag]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!loading && rows.length === 0 && (
            <div className="p-10 text-center text-text-muted text-sm font-mono">No coins match your filter.</div>
          )}
          {!loading && rows.length > COIN_LIMIT && (
            <ShowMore expanded={showAll} total={rows.length} onClick={() => setShowAll((v) => !v)} />
          )}
        </Card>

        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
          Flow intensity = 24h volume ÷ market cap · gold rows (Call) = tap to open the signal
        </p>
      </div>

      {/* ── DEX buy/sell pressure ── */}
      <div className="space-y-3 mt-8">
        <SectionHeader
          label="DEX Buy / Sell Pressure"
          right={
            <span className="hidden sm:flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/60">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/80" />Buy</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/50" />Sell</span>
              <span className="text-text-muted/35">· 24h</span>
            </span>
          }
        />

        <Card glow>
          {dexLoading && (
            <div className="divide-y divide-white/[0.04]">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-4">
                  <div className="h-3 bg-white/[0.05] rounded w-1/3 animate-pulse mb-2" />
                  <div className="h-1.5 bg-white/[0.03] rounded w-full animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {!dexLoading && dexPools.length === 0 && (
            <div className="p-10 text-center text-text-muted text-sm font-mono">DEX data unavailable</div>
          )}
          {!dexLoading && dexPools.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="divide-y divide-white/[0.04] lg:border-r lg:border-white/[0.05]">
                {shownDex.filter((_, i) => i % 2 === 0).map((p) => <DexRow key={p.pool_address} p={p} />)}
              </div>
              <div className="divide-y divide-white/[0.04]">
                {shownDex.filter((_, i) => i % 2 === 1).map((p) => <DexRow key={p.pool_address} p={p} />)}
              </div>
            </div>
          )}
          {!dexLoading && dexPools.length > DEX_LIMIT && (
            <ShowMore expanded={dexShowAll} total={dexPools.length} onClick={() => setDexShowAll((v) => !v)} />
          )}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
          Trending DEX pools (incl. meme/alt) · bar = buy vs sell 24h · Data: GeckoTerminal
        </p>
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
  { key: "sectors", label: "Sectors", icon: <IconSectors /> },
  { key: "coins", label: "Coins", icon: <IconCoins /> },
  { key: "whale", label: "Whale Alert", icon: <IconWhale /> },
];

export default function MoneyFlowPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("sectors");
  const [q, setQ] = useState("");

  // reset search when switching tabs
  useEffect(() => { setQ(""); }, [tab]);

  const searchable = tab === "sectors" || tab === "coins";

  return (
    <div className="w-full px-4 lg:px-8 py-6">
      <style>{`@keyframes mfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header — eyebrow + title + description (Delistings parity) */}
      <div className="mb-5 max-w-3xl">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Terminal · Flow</span>
        <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">Money Flow</h1>
        <p className="text-[12px] text-text-primary/50 leading-relaxed mt-2">
          Where capital is rotating — <span className="text-gold-primary/85 font-medium">sectors</span>, coins &amp; whale
          transactions. Track macro dominance, per-coin flow intensity, DEX buy/sell pressure and large on-chain moves in one place.
        </p>
      </div>

      {/* Tab bar + contextual search (underline tabs — UX best practice for content nav) */}
      <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] mb-6">
        <div role="tablist" aria-label="Money Flow sections" className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tb.key)}
                className={`group whitespace-nowrap pb-3 pt-1 text-[14px] font-medium border-b-2 -mb-px transition-colors ${
                  active ? "text-text-primary border-gold-primary" : "text-text-primary/50 border-transparent hover:text-text-primary/80"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className={active ? "text-gold-primary" : "text-text-primary/40 group-hover:text-text-primary/70"}>{tb.icon}</span>
                  {tb.label}
                </span>
              </button>
            );
          })}
        </div>
        {searchable && (
          <SearchBox value={q} onChange={setQ} placeholder={tab === "coins" ? "Search coin…" : "Search sector…"} />
        )}
      </div>

      {/* Content */}
      {tab === "sectors" && <SectorsTab q={q} />}
      {tab === "coins" && <CoinsTab q={q} />}
      {tab === "whale" && (
        <div className="-mx-4 lg:-mx-8 -mt-2">
          <WhaleAlertPage />
        </div>
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="money-flow" />
    </div>
  );
}
