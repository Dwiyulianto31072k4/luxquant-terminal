// frontend-react/src/components/aiArenaV6/HeaderStatStrip.jsx
//
// Header Stat Strip — Quick-scan dashboard row
// =================================================================
// Adopted from AI Arena v4 — single-glance metrics aligned with verdict timestamp.
//
// Sits between VerdictHero and CycleCompass.
// Data source: `report` prop (verdict-time snapshot, NOT live).
// Reads opportunistically — gracefully renders "—" when fields are absent.
//
// Fields displayed:
//   1. BTC Price      ← report.btc_price (top-level fallback)
//   2. Fear & Greed   ← report.bg_snapshot_summary['fear-greed-index'] OR report.feargreed
//   3. RSI 4H         ← report.confluence.layers.smart_money OR technicals
//   4. Cascade Risk   ← report.liquidation_levels.cascade_risk
//   5. Sources        ← report.sources_count OR derived
//   6. Generated      ← generated_in_seconds (top-level)
//
// Defensive: every stat hidden if its source is null/missing.

// ── Helpers ───────────────────────────────────────────
const fmtPrice = (n) => {
  if (n == null || isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const fmtSec = (s) => {
  if (s == null || isNaN(s)) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${(s / 60).toFixed(1)}m`;
};

const fgColor = (v) => {
  if (v == null) return "text-text-muted";
  if (v <= 24) return "text-red-400";
  if (v <= 49) return "text-orange-400";
  if (v <= 54) return "text-amber-300";
  if (v <= 74) return "text-green-300";
  return "text-green-400";
};

const fgLabel = (v) => {
  if (v == null) return "—";
  if (v <= 24) return "Extreme Fear";
  if (v <= 49) return "Fear";
  if (v <= 54) return "Neutral";
  if (v <= 74) return "Greed";
  return "Extreme Greed";
};

const rsiColor = (v) => {
  if (v == null) return "text-text-muted";
  if (v >= 70) return "text-red-400";
  if (v >= 60) return "text-amber-300";
  if (v >= 40) return "text-text-muted";
  if (v >= 30) return "text-blue-300";
  return "text-blue-400";
};

const rsiLabel = (v) => {
  if (v == null) return "—";
  if (v >= 70) return "Overbought";
  if (v >= 60) return "Strong";
  if (v >= 40) return "Neutral";
  if (v >= 30) return "Weak";
  return "Oversold";
};

const cascadeStyle = (level) => {
  const l = (level || "").toLowerCase();
  if (l === "high")
    return { color: "text-red-400", label: "HIGH", bar: "bg-red-500" };
  if (l === "medium" || l === "med")
    return { color: "text-amber-300", label: "MEDIUM", bar: "bg-amber-500" };
  if (l === "low")
    return { color: "text-green-400", label: "LOW", bar: "bg-green-500" };
  return { color: "text-text-muted", label: "—", bar: "bg-white/10" };
};

// Walk an object tree and look for a value matching a key list (case-insensitive)
const deepFind = (obj, keys, depth = 0) => {
  if (!obj || depth > 6) return null;
  if (typeof obj !== "object") return null;
  for (const k of Object.keys(obj)) {
    const kl = k.toLowerCase();
    for (const target of keys) {
      if (kl === target.toLowerCase() || kl.includes(target.toLowerCase())) {
        const v = obj[k];
        if (v != null && (typeof v !== "object" || (Array.isArray(v) && v.length))) {
          return v;
        }
      }
    }
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = deepFind(v, keys, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
};

// ── Stat Cell ────────────────────────────────────────
const StatCell = ({ label, value, sublabel, valueClass = "text-white", mono = true }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <div className="text-[8.5px] uppercase tracking-[0.15em] text-text-muted font-bold leading-tight">
      {label}
    </div>
    <div
      className={`${
        mono ? "font-mono" : ""
      } text-sm font-bold leading-tight truncate ${valueClass}`}
    >
      {value}
    </div>
    {sublabel && (
      <div className="text-[9px] text-text-muted/80 truncate leading-tight">
        {sublabel}
      </div>
    )}
  </div>
);

// ── Main ─────────────────────────────────────────────
export default function HeaderStatStrip({ report, btcPrice, generatedInSeconds }) {
  if (!report && btcPrice == null && generatedInSeconds == null) return null;

  // 1. BTC price — from prop or report
  const btcPx = btcPrice ?? report?.btc_price ?? deepFind(report, ["btc_price"]);

  // 2. Fear & Greed — search common locations
  const fg =
    deepFind(report, ["fear_greed_value", "fear-greed-value", "fear_greed", "feargreed"]) ??
    null;
  const fgVal =
    typeof fg === "object" && fg != null
      ? fg.value ?? fg.current ?? fg.score
      : fg;
  const fgNum = fgVal != null ? Number(fgVal) : null;

  // 3. RSI 4H — from technicals or layer briefs
  const rsi =
    deepFind(report, ["rsi_4h", "rsi4h"]) ??
    deepFind(report?.confluence, ["rsi_4h", "rsi4h"]) ??
    null;
  const rsiNum =
    typeof rsi === "object" && rsi != null ? rsi.value ?? rsi.current : rsi;
  const rsiVal = rsiNum != null ? Number(rsiNum) : null;

  // 4. Cascade risk
  const cascade =
    deepFind(report, ["cascade_risk"]) ??
    deepFind(report?.liquidation_levels, ["cascade_risk"]) ??
    null;
  const cascadeVal = typeof cascade === "string" ? cascade : cascade?.level;
  const cascadeInfo = cascadeStyle(cascadeVal);

  // 5. Sources count
  const sources =
    deepFind(report, ["sources_count", "source_count", "n_sources"]) ??
    (Array.isArray(deepFind(report, ["sources"]))
      ? deepFind(report, ["sources"]).length
      : null);

  // 6. Generated time
  const genSec =
    generatedInSeconds ?? deepFind(report, ["generated_in_seconds"]) ?? null;

  // Cells: filter out fully-missing
  const cells = [];

  if (btcPx != null) {
    cells.push({
      key: "btc",
      label: "BTC Price",
      value: fmtPrice(btcPx),
      valueClass: "text-white",
    });
  }

  if (fgNum != null) {
    cells.push({
      key: "fg",
      label: "Fear & Greed",
      value: fgNum.toString(),
      sublabel: fgLabel(fgNum),
      valueClass: fgColor(fgNum),
    });
  }

  if (rsiVal != null) {
    cells.push({
      key: "rsi",
      label: "RSI (4H)",
      value: rsiVal.toFixed(1),
      sublabel: rsiLabel(rsiVal),
      valueClass: rsiColor(rsiVal),
    });
  }

  if (cascadeVal) {
    cells.push({
      key: "cascade",
      label: "Cascade Risk",
      value: cascadeInfo.label,
      valueClass: cascadeInfo.color,
      mono: false,
    });
  }

  if (sources != null) {
    cells.push({
      key: "sources",
      label: "Sources",
      value: String(sources),
      sublabel: "data feeds",
      valueClass: "text-white/90",
    });
  }

  if (genSec != null) {
    cells.push({
      key: "gen",
      label: "Generated",
      value: fmtSec(genSec),
      sublabel: "AI runtime",
      valueClass: "text-gold-primary",
    });
  }

  if (cells.length === 0) return null;

  return (
    <div className="glass-card rounded-xl border border-gold-primary/10 px-4 py-3">
      <div
        className="grid gap-x-4 gap-y-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(cells.length, 6)}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((c) => (
          <StatCell
            key={c.key}
            label={c.label}
            value={c.value}
            sublabel={c.sublabel}
            valueClass={c.valueClass}
            mono={c.mono !== false}
          />
        ))}
      </div>
    </div>
  );
}
