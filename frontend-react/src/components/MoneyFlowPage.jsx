// src/components/MoneyFlowPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Money Flow Page (v2, polished)
// 3-tab (zoom: makro → koin → transaksi):
//   - Sectors : macro gauges + ranked sector rotation bars   (Dante)
//   - Coins   : flow intensity bars + visual DEX buy/sell     (Anonymous)
//   - Whale   : feed transaksi (reuse WhaleAlertPage)
//
// Design: Flowscan-minimal mewah — bg #0a0805, aksen gold-primary,
// hairline gradient, font-mono label, tabular-nums, staggered reveal.
// Prinsip "inform, don't decide": semua tag deskriptif (turunan angka).
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import moneyFlowApi from "../services/moneyFlowApi";
import WhaleAlertPage from "./WhaleAlertPage";

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
// Primitives (design system)
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
        <div className="w-6 h-3 bg-white/[0.04] rounded animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/3 animate-pulse" />
          <div className="h-1.5 bg-white/[0.03] rounded w-2/3 animate-pulse" />
        </div>
        <div className="w-16 h-3 bg-white/[0.05] rounded animate-pulse" />
      </div>
    ))}
  </div>
);

// Staggered row wrapper (fade + slide up)
const Row = ({ i, children, onClick }) => (
  <div
    onClick={onClick}
    className="opacity-0 animate-[mfIn_0.4s_ease-out_forwards]"
    style={{ animationDelay: `${Math.min(i * 35, 500)}ms` }}
  >
    {children}
  </div>
);

// ═══════════════════════════════════════════
// MACRO — gauge cards
// ═══════════════════════════════════════════
const Gauge = ({ value, label, sub, subColor, accent = "gold" }) => {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const bar =
    accent === "gold"
      ? "bg-gold-primary"
      : accent === "emerald"
      ? "bg-emerald-400"
      : "bg-white/60";
  return (
    <Card className="p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70 mb-2">
        {label}
      </div>
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

  const maxMcap = Math.max(...sectors.map((s) => s.market_cap || 0), 1);

  return (
    <div className="space-y-6">
      <SectionHeader label="Market Compass" />
      <MacroBlock macro={macro} />

      <SectionHeader label="Sector Rotation" />
      <Card glow>
        <div className="grid grid-cols-[2rem_1fr_5rem_5rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem] gap-3 px-4 py-3 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70">
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
              const barPct = ((s.market_cap || 0) / maxMcap) * 100;
              const isLeader = i < 3;
              return (
                <Row key={s.category_id} i={i}>
                  <div className="group relative grid grid-cols-[2rem_1fr_5rem_5rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_7rem] gap-3 items-center px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                    <div className="absolute inset-y-0 left-0 bg-gold-primary/[0.04] pointer-events-none" style={{ width: `${barPct}%` }} />
                    <span className={`relative font-mono text-xs tabular-nums ${isLeader ? "text-gold-primary" : "text-text-muted/50"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="relative flex items-center gap-2.5 min-w-0">
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
                    <span className={`relative font-mono text-sm tabular-nums text-right font-semibold ${pctColor(s.mcap_change_24h)}`}>
                      {fmtPct(s.mcap_change_24h)}
                    </span>
                    <span className={`relative font-mono text-xs tabular-nums text-right hidden sm:block ${pctColor(s.mcap_change_7d)}`}>
                      {s.mcap_change_7d != null ? fmtPct(s.mcap_change_7d) : <span className="text-text-muted/30">—</span>}
                    </span>
                    <span className="relative font-mono text-xs tabular-nums text-right text-text-muted">{fmtUSD(s.market_cap)}</span>
                  </div>
                </Row>
              );
            })}
          </div>
        )}
      </Card>
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
        7d delta terisi seiring snapshot terkumpul · bar = market cap relatif · Data: CoinGecko
      </p>
    </div>
  );
};

// ═══════════════════════════════════════════
// TAB 2 — COINS
// ═══════════════════════════════════════════
const CoinsTab = () => {
  const [coins, setCoins] = useState([]);
  const [dex, setDex] = useState(null);
  const [luxOnly, setLuxOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dexLoading, setDexLoading] = useState(true);

  const loadCoins = useCallback(async (lux) => {
    setLoading(true);
    try {
      const c = await moneyFlowApi.getCoins({ limit: 30, luxquant_only: lux });
      setCoins(c.coins || []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCoins(luxOnly); }, [luxOnly, loadCoins]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const d = await moneyFlowApi.getDex(); if (alive) setDex(d); }
      catch { /* noop */ } finally { if (alive) setDexLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const maxIntensity = Math.max(...coins.map((c) => c.flow_intensity || 0), 0.5);

  return (
    <div className="space-y-8">
      {/* ── Flow intensity ── */}
      <div className="space-y-4">
        <SectionHeader
          label="Coin Flow Intensity"
          right={
            <button
              onClick={() => setLuxOnly((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.1em] border transition-all ${
                luxOnly ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40" : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
              }`}
            >
              LuxQuant Only
            </button>
          }
        />
        <Card glow>
          <div className="grid grid-cols-[1fr_4.5rem_5.5rem] sm:grid-cols-[1fr_6rem_6rem_6rem] gap-3 px-4 py-3 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70">
            <span>Coin</span>
            <span className="text-right">24h</span>
            <span className="text-right hidden sm:block">Vol/Mcap</span>
            <span className="text-right">Turnover</span>
          </div>

          {loading && <Skeleton rows={10} />}
          {!loading && coins.length === 0 && (
            <div className="p-10 text-center text-text-muted text-sm font-mono">
              {luxOnly ? "Belum ada koin LuxQuant di top snapshot" : "No data"}
            </div>
          )}

          {!loading && (
            <div className="divide-y divide-white/[0.04]">
              {coins.map((c, i) => {
                const barPct = ((c.flow_intensity || 0) / maxIntensity) * 100;
                const hi = c.turnover_tag === "high_turnover";
                return (
                  <Row key={c.coin_id} i={i}>
                    <div className="group relative grid grid-cols-[1fr_4.5rem_5.5rem] sm:grid-cols-[1fr_6rem_6rem_6rem] gap-3 items-center px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="absolute inset-y-0 left-0 bg-gold-primary/[0.035] pointer-events-none" style={{ width: `${barPct}%` }} />
                      <div className="relative flex items-center gap-2 min-w-0">
                        <span className="text-white text-sm font-semibold">{c.symbol}</span>
                        {c.is_luxquant_signal && (
                          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary/80 border border-gold-primary/25">
                            LUX
                          </span>
                        )}
                      </div>
                      <span className={`relative font-mono text-sm tabular-nums text-right font-semibold ${pctColor(c.price_change_24h)}`}>
                        {fmtPct(c.price_change_24h)}
                      </span>
                      <span className="relative font-mono text-xs tabular-nums text-right hidden sm:block text-text-muted">
                        {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
                      </span>
                      <span className="relative text-right">
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
              })}
            </div>
          )}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
          Flow intensity = volume 24h ÷ market cap · bar = intensitas relatif · LUX = lagi di-call LuxQuant
        </p>
      </div>

      {/* ── DEX buy/sell pressure (visual bar) ── */}
      <div className="space-y-4">
        <SectionHeader label="DEX Buy / Sell Pressure" />
        <Card glow>
          {dexLoading && <Skeleton rows={8} />}
          {!dexLoading && (!dex || (dex.pools || []).length === 0) && (
            <div className="p-10 text-center text-text-muted text-sm font-mono">DEX data unavailable</div>
          )}
          {!dexLoading && dex && (
            <div className="divide-y divide-white/[0.04]">
              {(dex.pools || []).map((p, i) => {
                const b = p.buys_24h || 0;
                const s = p.sells_24h || 0;
                const total = b + s || 1;
                const buyPct = (b / total) * 100;
                return (
                  <Row key={p.pool_address} i={i}>
                    <div className="group relative px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
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
              })}
            </div>
          )}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/40 px-1">
          Trending DEX pools (incl. meme/alt) · bar = proporsi beli vs jual 24h · Data: GeckoTerminal
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
const TABS = [
  { key: "sectors", label: "Sectors" },
  { key: "coins", label: "Coins" },
  { key: "whale", label: "Whale Alert" },
];

export default function MoneyFlowPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("sectors");

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      <style>{`@keyframes mfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <SectionHeader label="Money Flow" />
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Money Flow</h1>
        <p className="text-text-muted text-sm mt-1.5 font-mono">
          Where capital is rotating — sectors, coins, and whale transactions
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`relative px-4 py-3 text-[13px] font-mono uppercase tracking-[0.12em] transition-colors ${
                active ? "text-white" : "text-text-muted hover:text-white"
              }`}
            >
              {tb.label}
              {active && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-gold-primary" />}
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
  );
}
