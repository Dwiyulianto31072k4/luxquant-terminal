// src/components/MoneyFlowPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Money Flow Page
// Payung "money flow" 3-tab (zoom: makro → koin → transaksi):
//   - Sectors : rotasi sektor + macro gauge        (req Dante)
//   - Coins   : flow intensity + DEX buy/sell       (req Anonymous)
//   - Whale   : feed transaksi (reuse WhaleAlertPage)
//
// Prinsip "inform, don't decide": semua tag deskriptif (turunan angka),
// bukan rekomendasi. Konsisten design system existing (gold-primary,
// SectionHeader, font-mono, bg #0a0805).
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import moneyFlowApi from "../services/moneyFlowApi";
import WhaleAlertPage from "./WhaleAlertPage";

// ═══════════════════════════════════════════
// Helpers
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

const pctColor = (v) => {
  if (v === null || v === undefined) return "text-text-muted";
  return Number(v) > 0 ? "text-emerald-400" : Number(v) < 0 ? "text-red-400" : "text-white/70";
};

// ── Tag deskriptif → label + warna (fakta, bukan judgment) ──
const TURNOVER_LABEL = {
  high_turnover: "High Turnover",
  elevated_turnover: "Elevated",
  normal_turnover: "Normal",
};
const FLOW_LABEL = {
  net_buying: "Net Buying",
  net_selling: "Net Selling",
  balanced: "Balanced",
};
const flowColor = (tag) =>
  tag === "net_buying"
    ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/10"
    : tag === "net_selling"
    ? "text-red-400 border-red-500/25 bg-red-500/10"
    : "text-white/70 border-white/[0.08] bg-white/[0.04]";

// ═══════════════════════════════════════════
// Shared bits (match design system)
// ═══════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${small ? "text-[10px]" : "text-[11px]"}`}>
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md ${className}`}>
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

const LoadingRows = ({ n = 6 }) => (
  <div className="space-y-px">
    {[...Array(n)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/3 animate-pulse" />
          <div className="h-2.5 bg-white/[0.03] rounded w-2/3 animate-pulse" />
        </div>
        <div className="w-20 h-3 bg-white/[0.05] rounded animate-pulse" />
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════
// MACRO GAUGE STRIP
// ═══════════════════════════════════════════
const MacroStrip = ({ macro }) => {
  if (!macro || macro.note) return null;
  const Item = ({ label, value, sub, subColor }) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/70">{label}</span>
      <span className="font-mono text-sm tabular-nums text-white">{value}</span>
      {sub !== undefined && sub !== null && (
        <span className={`font-mono text-[10px] tabular-nums ${subColor || "text-text-muted/60"}`}>{sub}</span>
      )}
    </div>
  );

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <Item
          label="BTC Dominance"
          value={macro.btc_dominance != null ? `${macro.btc_dominance.toFixed(1)}%` : "—"}
          sub={macro.btc_dominance_change_7d != null ? `${macro.btc_dominance_change_7d > 0 ? "+" : ""}${macro.btc_dominance_change_7d}pp 7d` : null}
          subColor={pctColor(macro.btc_dominance_change_7d)}
        />
        <Item label="ETH Dominance" value={macro.eth_dominance != null ? `${macro.eth_dominance.toFixed(1)}%` : "—"} />
        <Item
          label="Stablecoin Dom"
          value={macro.stablecoin_dominance != null ? `${macro.stablecoin_dominance.toFixed(1)}%` : "—"}
          sub={macro.stablecoin_dominance_change_7d != null ? `${macro.stablecoin_dominance_change_7d > 0 ? "+" : ""}${macro.stablecoin_dominance_change_7d}pp 7d` : null}
          subColor={macro.stablecoin_dominance_change_7d != null ? pctColor(-macro.stablecoin_dominance_change_7d) : ""}
        />
        <Item
          label={`Altseason (${macro.altseason_window || "30d"})`}
          value={macro.altseason_index != null ? `${macro.altseason_index}/100` : "—"}
        />
        <Item label="Total Mcap" value={fmtUSD(macro.total_market_cap)} />
      </div>
    </Card>
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
        const [m, s] = await Promise.all([
          moneyFlowApi.getMacro(),
          moneyFlowApi.getSectors({ limit: 20 }),
        ]);
        if (!alive) return;
        setMacro(m);
        setSectors(s.sectors || []);
      } catch (e) {
        if (alive) setErr("Failed to load sector data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-5">
      <MacroStrip macro={macro} />

      <div className="space-y-3">
        <SectionHeader label="Sector Rotation" small />
        <Card>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
            <span>Sector</span>
            <span className="text-right">24h</span>
            <span className="text-right hidden sm:block">7d</span>
            <span className="text-right">Mcap</span>
          </div>

          {loading && <LoadingRows n={8} />}
          {err && !loading && <div className="p-6 text-center text-red-400 text-sm font-mono">{err}</div>}
          {!loading && !err && sectors.map((s) => (
            <div key={s.category_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex -space-x-1.5 shrink-0">
                  {(s.top_3_coins || []).slice(0, 3).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-4 h-4 rounded-full border border-[#0a0805] bg-white/5" onError={(e) => { e.target.style.display = "none"; }} />
                  ))}
                </div>
                <span className="text-white text-sm truncate">{s.name}</span>
              </div>
              <span className={`font-mono text-sm tabular-nums text-right ${pctColor(s.mcap_change_24h)}`}>{fmtPct(s.mcap_change_24h)}</span>
              <span className={`font-mono text-xs tabular-nums text-right hidden sm:block ${pctColor(s.mcap_change_7d)}`}>
                {s.mcap_change_7d != null ? fmtPct(s.mcap_change_7d) : <span className="text-text-muted/40">—</span>}
              </span>
              <span className="font-mono text-xs tabular-nums text-right text-text-muted">{fmtUSD(s.market_cap)}</span>
            </div>
          ))}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50 px-1">
          7d/30d delta terisi seiring data snapshot terkumpul · Data: CoinGecko
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// TAB 2 — COINS (flow intensity + DEX pressure)
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
    } catch { /* keep prev */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCoins(luxOnly); }, [luxOnly, loadCoins]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await moneyFlowApi.getDex();
        if (alive) setDex(d);
      } catch { /* noop */ }
      finally { if (alive) setDexLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Flow intensity (snapshot) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader label="Coin Flow Intensity" small />
          <button
            onClick={() => setLuxOnly((v) => !v)}
            className={`shrink-0 ml-3 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.1em] border transition-all ${
              luxOnly
                ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white"
            }`}
          >
            LuxQuant Signals
          </button>
        </div>

        <Card>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
            <span>Coin</span>
            <span className="text-right">24h</span>
            <span className="text-right hidden sm:block">Vol/Mcap</span>
            <span className="text-right">Turnover</span>
          </div>

          {loading && <LoadingRows n={8} />}
          {!loading && coins.length === 0 && (
            <div className="p-8 text-center text-text-muted text-sm font-mono">
              {luxOnly ? "Belum ada koin LuxQuant di top snapshot" : "No data"}
            </div>
          )}
          {!loading && coins.map((c) => (
            <div key={c.coin_id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white text-sm font-medium">{c.symbol}</span>
                {c.is_luxquant_signal && (
                  <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-gold-primary/10 text-gold-primary/80 border border-gold-primary/25">
                    LUX
                  </span>
                )}
              </div>
              <span className={`font-mono text-sm tabular-nums text-right ${pctColor(c.price_change_24h)}`}>{fmtPct(c.price_change_24h)}</span>
              <span className="font-mono text-xs tabular-nums text-right hidden sm:block text-text-muted">
                {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
              </span>
              <span className="text-right">
                {c.turnover_tag && (
                  <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    c.turnover_tag === "high_turnover" ? "text-gold-primary border-gold-primary/25 bg-gold-primary/10" : "text-text-muted border-white/[0.08] bg-white/[0.03]"
                  }`}>
                    {TURNOVER_LABEL[c.turnover_tag]}
                  </span>
                )}
              </span>
            </div>
          ))}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50 px-1">
          Flow intensity = volume 24h ÷ market cap · LUX = lagi di-call LuxQuant
        </p>
      </div>

      {/* ── DEX buy/sell pressure (live, meme/alt) ── */}
      <div className="space-y-3">
        <SectionHeader label="DEX Buy / Sell Pressure" small />
        <Card>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2.5 border-b border-white/[0.06] font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
            <span>Pool</span>
            <span className="text-right">Buys / Sells 24h</span>
            <span className="text-right">Flow</span>
          </div>

          {dexLoading && <LoadingRows n={6} />}
          {!dexLoading && (!dex || (dex.pools || []).length === 0) && (
            <div className="p-8 text-center text-text-muted text-sm font-mono">DEX data unavailable</div>
          )}
          {!dexLoading && dex && (dex.pools || []).map((p) => (
            <div key={p.pool_address} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <div className="min-w-0">
                <div className="text-white text-sm truncate">{p.base_symbol || p.name}</div>
                <div className="font-mono text-[10px] text-text-muted/60 truncate">
                  Vol {fmtUSD(p.volume_24h_usd)} · Liq {fmtUSD(p.reserve_usd)}
                </div>
              </div>
              <div className="text-right font-mono text-xs tabular-nums">
                <span className="text-emerald-400">{(p.buys_24h || 0).toLocaleString()}</span>
                <span className="text-text-muted/40"> / </span>
                <span className="text-red-400">{(p.sells_24h || 0).toLocaleString()}</span>
              </div>
              <span className="text-right">
                {p.flow_tag && (
                  <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${flowColor(p.flow_tag)}`}>
                    {FLOW_LABEL[p.flow_tag]}
                  </span>
                )}
              </span>
            </div>
          ))}
        </Card>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50 px-1">
          Trending DEX pools (incl. meme/alt) · angka transaksi beli vs jual · Data: GeckoTerminal
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// MAIN — tab shell
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
      <SectionHeader label="Money Flow" />

      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Money Flow</h1>
        <p className="text-text-muted text-sm mt-1.5 font-mono">
          Where capital is rotating — sectors, coins, and whale transactions
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.06]">
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`relative px-4 py-2.5 text-[13px] font-mono uppercase tracking-[0.1em] transition-colors ${
                active ? "text-white" : "text-text-muted hover:text-white"
              }`}
            >
              {tb.label}
              {active && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-gold-primary" />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "sectors" && <SectorsTab />}
      {tab === "coins" && <CoinsTab />}
      {tab === "whale" && (
        <div className="-mx-4 -mt-2">
          {/* WhaleAlertPage udah punya container & padding sendiri */}
          <WhaleAlertPage />
        </div>
      )}
    </div>
  );
}
