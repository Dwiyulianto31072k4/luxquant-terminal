// frontend-react/src/components/aiArenaV6/HeaderStatStrip.jsx
//
// Header Stat Strip v2 — 4 unique stats (additive, no duplicates with VerdictHero)
// =================================================================
// Adopted from AI Arena v4, redesigned to be ADDITIVE.
// No provider names exposed (LuxQuant brand only).
// No internal cost metrics surfaced (kept private).
//
// Sits between VerdictHero and CycleCompass.
// Reads exact paths from `data` prop (full v6/latest response).
// Each cell gracefully hides when its data is null.
//
// Fields displayed (all sourced from inspection of actual response):
//   1. Fear & Greed       ← data.report.bg_snapshot_summary['fear-greed'].value
//   2. Confluence         ← data.report.confluence (strength + counts)
//   3. AI Verdict         ← data.critique_decision (top-level)
//   4. Pipeline           ← data.generated_in_seconds (top-level)
//
// Why these 4 (not BTC Price/Cycle Phase/Cycle Score):
//   Those are already shown in VerdictHero's built-in stat row below the
//   horizon cards. Showing them again here would be redundant.
//   These 4 add NEW information about the verdict's confidence + quality.

// ── Helpers ───────────────────────────────────────────
const fmtSec = (s) => {
  if (s == null || isNaN(s)) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
};

// ── Fear & Greed ──────────────────────────────────────
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

// ── Confluence strength ──────────────────────────────
const confluenceColor = (strength) => {
  const s = (strength || "").toUpperCase();
  if (s === "STRONG") return "text-green-400";
  if (s === "MODERATE") return "text-amber-300";
  if (s === "WEAK") return "text-orange-400";
  if (s === "MIXED") return "text-text-muted";
  return "text-white";
};

// ── Critique decision ────────────────────────────────
const critiqueColor = (decision) => {
  switch (decision) {
    case "approved":
      return "text-green-400";
    case "approved_with_caveat":
      return "text-amber-300";
    case "needs_revision":
      return "text-red-400";
    default:
      return "text-text-muted";
  }
};

const critiqueLabel = (decision) => {
  switch (decision) {
    case "approved":
      return "Approved ✓";
    case "approved_with_caveat":
      return "Caveat ⚠";
    case "needs_revision":
      return "Revise ⟳";
    default:
      return "—";
  }
};

const critiqueSubLabel = (decision) => {
  switch (decision) {
    case "approved":
      return "no caveats";
    case "approved_with_caveat":
      return "with caveat";
    case "needs_revision":
      return "needs revision";
    default:
      return "—";
  }
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
export default function HeaderStatStrip({ data }) {
  if (!data) return null;

  const cells = [];

  // 1. Fear & Greed — bg_snapshot_summary['fear-greed'].value
  const fgRaw = data?.report?.bg_snapshot_summary?.["fear-greed"];
  const fgVal = fgRaw?.value;
  const fgNum = fgVal != null ? Number(fgVal) : null;
  if (fgNum != null && !isNaN(fgNum)) {
    cells.push({
      key: "fg",
      label: "Fear & Greed",
      value: Math.round(fgNum).toString(),
      sublabel: fgLabel(fgNum),
      valueClass: fgColor(fgNum),
    });
  }

  // 2. Confluence — strength + counts
  const conf = data?.report?.confluence;
  if (conf) {
    const bull = conf.bullish_count ?? 0;
    const bear = conf.bearish_count ?? 0;
    const neut = conf.neutral_count ?? 0;
    const strength = conf.strength || "—";
    cells.push({
      key: "conf",
      label: "Confluence",
      value: strength,
      sublabel: `${bull}↑ ${bear}↓ ${neut}→`,
      valueClass: confluenceColor(strength),
      mono: false,
    });
  }

  // 3. AI Verdict (Critique decision)
  const decision = data?.critique_decision;
  if (decision) {
    cells.push({
      key: "critique",
      label: "AI Verdict",
      value: critiqueLabel(decision),
      sublabel: critiqueSubLabel(decision),
      valueClass: critiqueColor(decision),
      mono: false,
    });
  }

  // 4. Pipeline runtime
  const genSec = data?.generated_in_seconds;
  if (genSec != null && !isNaN(genSec)) {
    cells.push({
      key: "gen",
      label: "Pipeline",
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
          gridTemplateColumns: `repeat(${Math.min(cells.length, 4)}, minmax(0, 1fr))`,
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
