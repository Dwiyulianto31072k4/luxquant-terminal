// frontend-react/src/components/aiArenaV6/MacroPulse.jsx
//
// Macro Pulse — DXY · SPX · Gold · US10Y + regime classification
// =================================================================
// Adopted from AI Arena v4 — adds macro context for BTC.
//
// Data source: GET /api/v1/ai-arena/macro-pulse
// Shape (from macro_data.py / fetch_macro_pulse):
//   {
//     btc: { current, change_1d_pct, change_7d_pct, change_30d_pct },
//     assets: {
//       dxy:   { current, change_1d_pct, change_7d_pct, change_30d_pct, label, correlation_30d, ... },
//       spx:   { ... },
//       gold:  { ... },
//       us10y: { ... }
//     },
//     regime: 'risk_on' | 'risk_off' | 'mixed',
//     regime_detail: 'SPX -0.41%, DXY -0.23%, Gold +1.27%',
//     updated_at, source
//   }
//
// Refresh: live (component-level fetch), 30min server-side cache (FRED data updates daily).

import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── Helpers ───────────────────────────────────────────
const fmtNum = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const fmtPct = (pct, decimals = 2) => {
  if (pct == null || isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
};

const fmtCorr = (c) => {
  if (c == null || isNaN(c)) return "—";
  const sign = c >= 0 ? "+" : "";
  return `${sign}${c.toFixed(2)}`;
};

// Color for change pct
const changeColor = (pct) => {
  if (pct == null || isNaN(pct)) return "text-text-muted";
  if (pct > 0) return "text-green-400";
  if (pct < 0) return "text-red-400";
  return "text-text-muted";
};

// Color & text for correlation strength
const corrInterp = (c) => {
  if (c == null) return { color: "text-text-muted", label: "—" };
  const abs = Math.abs(c);
  let label;
  if (abs >= 0.7) label = "Strong";
  else if (abs >= 0.4) label = "Moderate";
  else if (abs >= 0.2) label = "Weak";
  else label = "Weak";
  const dir = c >= 0 ? "Pos" : "Neg";
  return {
    color: c >= 0 ? "text-green-400" : "text-red-400",
    label: `${label} ${dir}`,
  };
};

// Regime badge colors
const regimeStyle = (regime) => {
  switch (regime) {
    case "risk_on":
      return {
        bg: "bg-green-500/15",
        border: "border-green-500/30",
        text: "text-green-300",
        dot: "bg-green-400",
        label: "Risk On",
      };
    case "risk_off":
      return {
        bg: "bg-red-500/15",
        border: "border-red-500/30",
        text: "text-red-300",
        dot: "bg-red-400",
        label: "Risk Off",
      };
    case "mixed":
    default:
      return {
        bg: "bg-amber-500/15",
        border: "border-amber-500/30",
        text: "text-amber-300",
        dot: "bg-amber-400",
        label: "Mixed",
      };
  }
};

// Asset display config
const ASSET_CONFIG = [
  { key: "spx", short: "S&P 500", icon: "📈", decimals: 2, prefix: "" },
  { key: "dxy", short: "Dollar (DXY)", icon: "💵", decimals: 2, prefix: "" },
  { key: "gold", short: "Gold", icon: "🥇", decimals: 2, prefix: "$" },
  { key: "us10y", short: "US 10Y", icon: "📊", decimals: 2, prefix: "", suffix: "%" },
];

// ── Asset Card ────────────────────────────────────────
const AssetCard = ({ config, asset }) => {
  if (!asset) {
    return (
      <div className="bg-bg-card/50 rounded-xl p-4 border border-white/5">
        <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold mb-1">
          {config.short}
        </div>
        <div className="text-text-muted text-sm">No data</div>
      </div>
    );
  }

  const change1d = asset.change_1d_pct;
  const change30d = asset.change_30d_pct;
  const corr = asset.correlation_30d;
  const corrInfo = corrInterp(corr);

  return (
    <div className="bg-bg-card/50 rounded-xl p-4 border border-white/5 hover:border-gold-primary/15 transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base leading-none">{config.icon}</span>
        <span className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
          {config.short}
        </span>
      </div>

      {/* Current price */}
      <div className="font-mono text-lg font-bold text-white leading-tight mt-1">
        {config.prefix || ""}
        {fmtNum(asset.current, config.decimals)}
        {config.suffix || ""}
      </div>

      {/* 1D change */}
      <div className={`text-[11px] font-mono font-bold mt-1 ${changeColor(change1d)}`}>
        {fmtPct(change1d)}{" "}
        <span className="text-text-muted font-normal">1D</span>
      </div>

      {/* 30D change + correlation */}
      <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-text-muted">30D</span>
          <span className={`font-mono ${changeColor(change30d)}`}>{fmtPct(change30d)}</span>
        </div>
        {corr != null && (
          <div className="flex justify-between text-[10px]">
            <span className="text-text-muted">Corr 30D</span>
            <span className={`font-mono ${corrInfo.color}`} title={corrInfo.label}>
              {fmtCorr(corr)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Regime Badge ──────────────────────────────────────
const RegimeBadge = ({ regime }) => {
  const style = regimeStyle(regime);
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg border ${style.bg} ${style.border} ${style.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`} />
      <span className="font-mono text-[11px] font-bold uppercase tracking-widest">
        {style.label}
      </span>
    </div>
  );
};

// ── Main component ────────────────────────────────────
export default function MacroPulse() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/v1/ai-arena/macro-pulse`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <h2 className="font-display text-xl text-white">Macro Pulse</h2>
        </div>
        <div className="h-32 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Error / no data ──
  if (error || !data || !data.assets) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <h2 className="font-display text-xl text-white">Macro Pulse</h2>
        </div>
        <div className="text-text-muted text-sm py-4">
          {error ? `Could not load macro data: ${error}` : "No macro data available."}
          <button
            onClick={fetchData}
            className="ml-3 px-3 py-1 text-[10px] uppercase tracking-wider rounded border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { btc, assets, regime, regime_detail, updated_at } = data;

  // Build a smart narrative
  const narrative = (() => {
    const spxCorr = assets?.spx?.correlation_30d;
    const dxyCorr = assets?.dxy?.correlation_30d;
    const goldCorr = assets?.gold?.correlation_30d;

    const parts = [];

    if (spxCorr != null && Math.abs(spxCorr) >= 0.7) {
      const dir = spxCorr >= 0 ? "tightly correlated" : "inversely correlated";
      parts.push(`BTC is ${dir} with SPX (${fmtCorr(spxCorr)} 30D)`);
    } else if (spxCorr != null && Math.abs(spxCorr) >= 0.4) {
      parts.push(`BTC shows moderate ${spxCorr >= 0 ? "positive" : "negative"} correlation with SPX (${fmtCorr(spxCorr)})`);
    }

    if (regime === "risk_off") {
      parts.push("equities under pressure suggest BTC could face headwinds");
    } else if (regime === "risk_on") {
      parts.push("risk-on backdrop is supportive for BTC");
    } else {
      parts.push("mixed signals — watch macro for direction");
    }

    if (dxyCorr != null && dxyCorr < -0.5) {
      parts.push("USD weakness historically tailwinds for BTC");
    }

    return parts.join(", ") + ".";
  })();

  return (
    <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <div>
            <h2 className="font-display text-xl text-white leading-tight">Macro Pulse</h2>
            <p className="text-text-muted text-[11px] mt-0.5 tracking-wide">
              Cross-asset context · 30D correlations
            </p>
          </div>
        </div>
        <RegimeBadge regime={regime} />
      </div>

      {/* Asset grid — 4 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {ASSET_CONFIG.map((cfg) => (
          <AssetCard key={cfg.key} config={cfg} asset={assets?.[cfg.key]} />
        ))}
      </div>

      {/* BTC reference + regime detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {/* BTC reference card */}
        {btc && (
          <div className="bg-gold-primary/5 rounded-xl p-3 border border-gold-primary/15">
            <div className="text-[9px] uppercase tracking-widest text-gold-primary/80 font-bold mb-1">
              BTC Reference
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-mono text-base font-bold text-white">
                ${fmtNum(btc.current, 2)}
              </div>
              <div className="flex items-baseline gap-2 text-[10px] font-mono">
                <span className={changeColor(btc.change_1d_pct)}>
                  1D {fmtPct(btc.change_1d_pct)}
                </span>
                <span className={changeColor(btc.change_7d_pct)}>
                  7D {fmtPct(btc.change_7d_pct)}
                </span>
                <span className={changeColor(btc.change_30d_pct)}>
                  30D {fmtPct(btc.change_30d_pct)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Regime detail */}
        <div className="bg-bg-card/50 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
            Regime Snapshot
          </div>
          <div className="text-[11px] text-white/80 font-mono leading-relaxed">
            {regime_detail || "—"}
          </div>
        </div>
      </div>

      {/* Narrative footer */}
      <div className="pt-4 border-t border-white/5">
        <p className="text-[11px] text-text-muted leading-relaxed">{narrative}</p>
        {updated_at && (
          <p className="text-[9px] text-text-muted/60 font-mono mt-2">
            Source: FRED + Binance · Updated {new Date(updated_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
