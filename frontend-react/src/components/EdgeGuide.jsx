// Dual-level guide for Edge playbook (beginner + expert).
// Used inside EdgePlaybook when expanded — one feature, full explanation.

import { useState } from "react";

const SECTIONS = [
  {
    id: "what",
    title: "What is this?",
    simple:
      "A map of which signal setups historically worked better — not a buy button. It shows patterns that more often hit higher targets or ran further, based on the last 90 days of closed signals.",
    expert:
      "Descriptive tag intelligence over a rolling 90d hit-date window. Tags are overlapping entry-condition labels (not mutually exclusive strategies). Metrics come from resolved outcomes (signal_updates → tp1–tp4 / sl) joined to important tags on entry snapshots. Confounded late/parabolic tags are excluded from “Runner/Prefer” ranking because their WR is inflated by coins already in flight.",
  },
  {
    id: "graph",
    title: "Knowledge graph",
    simple:
      "The center is “Edge 90d”. Gold nodes = runners (often fill more targets). Green = high win rate. Red = caution. Bigger circle = more samples. Tiny dots around a node = that tag appears often on signals currently on your desk. Drag to pan, scroll to zoom, click a node to read it.",
    expert:
      "Radial Obsidian-style layout: hub = cohort window; spoke weight is visual only. Node radius ∝ √n (and full-TP for runners). Satellite count ∝ co-occurrence of that tag on loaded bulk-7d signals. Soft cross-links encode pairwise co-occurrence (min count 3). Selection dims non-focused nodes. Graph never mutates the table — filters are explicit actions only.",
  },
  {
    id: "runner",
    title: "High runners",
    simple:
      "Setups that historically went further — more often reached TP3/TP4 or saw a higher peak % after the call. Good when you want bigger moves, not just a small first target.",
    expert:
      "Eligibility (clean tags, n≥150): WR≥78% AND (full_tp_rate≥12% OR tp4_rate≥5% OR median_peak_wins≥18%). Ranked by runner score ≈ 0.35·tp4 + 0.30·full_tp + 0.20·peakNorm + 0.15·WR. full_tp = outcome ∈ {tp3,tp4}; peak is median peak_pct on wins. Display shows “% full” and “+peak”.",
  },
  {
    id: "prefer",
    title: "Prefer / Worth it",
    simple:
      "“Prefer” tags win often (any TP counts as a win). “Worth it pairs” are coins whose own history looks solid — fewer red flags, stronger track record.",
    expert:
      "Prefer: non-confound tags with WR≥82%, n≥150, sorted by WR then n. Worth/Avoid is classifyCoin on pair history — orthogonal to tags. For each table row: open uses full prior; closed is leave-one-out (this outcome excluded) so the badge is as-of-entry, not look-ahead. Combining Worth + high-edge tags is a joint filter, not a causal claim.",
  },
  {
    id: "caution",
    title: "Caution",
    simple:
      "Weaker or risky patterns — including late entry / already extended moves. High % here can be misleading (the coin was already flying).",
    expert:
      "Includes WR<78% and confound set {LATE_ENTRY, PARABOLIC, OVEREXTENDED, EXHAUSTION_CANDLE}. These often print high WR because selection is conditional on momentum already underway; forward edge for fresh entries is weaker. Prefer not to screen on these alone.",
  },
  {
    id: "actions",
    title: "Buttons (Screen / Filter)",
    simple:
      "By default the full list stays open. Quick path: “Strongest setups”, “Hunt full TP”, “Caution first”, plus Reset. Use the graph to multi-select tags. Clear / Reset returns the full list.",
    expert:
      "Opt-in only. Recipes map to filter state (open/worth/tags/sort edge_score). Screen runners → worth_it + runner tags OR + sort edge_score. Apply edge → worth_it + top WR tags. Clear resets all. Open ranked uses the same Edge Score as the table column.",
  },
  {
    id: "asof",
    title: "As-of-entry (no look-ahead)",
    simple:
      "Edge Score and Avoid/Worth use history available at call time. Open calls use resolved tags only. Closed rows exclude that call’s own result so the score cannot “know” the outcome.",
    expert:
      "Open: tag-wr is resolved-only (call not in rates). Closed: leave-one-out on tag counts + coin WR before scoring. Walk-forward backtest uses the same expanding-window principle. This is the standard anti-leak / point-in-time practice.",
  },
  {
    id: "limits",
    title: "Limits & honesty",
    simple:
      "Past results ≠ future. Tags describe conditions, they are not a guarantee of TP4. Always manage risk and size yourself.",
    expert:
      "Non-stationary crypto regimes; 90d is the primary window (30d optional later). Tags overlap → multi-tag signals double-count in cohort stats. Peak often continues after trade resolution → median_peak is ceiling context, not bookable PnL. No walk-forward guarantee; use as a prior, not an auto-trader.",
  },
];

export default function EdgeGuide({ compact = false }) {
  const [mode, setMode] = useState("simple"); // simple | expert
  const [openId, setOpenId] = useState(compact ? null : "what");

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-gradient-to-b from-ink/[0.03] to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold tracking-tight text-text-primary">
            How Edge playbook works
          </p>
          <p className="text-[11px] text-text-muted">
            One feature · explained for beginners and power users
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-ink/[0.1] bg-surface-raised p-0.5">
          {[
            { id: "simple", label: "Simple" },
            { id: "expert", label: "Expert" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                mode === m.id
                  ? "bg-ink/[0.08] font-semibold text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick path for beginners */}
      {mode === "simple" && (
        <div className="border-b border-ink/[0.05] bg-accent/[0.04] px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-accent">
            60-second path
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12px] leading-snug text-text-primary/90">
            <li>
              Above the table: tap <strong>Strongest setups</strong> (Quick path).
            </li>
            <li>
              Read the <strong>Edge</strong> column — score + short “why”.
            </li>
            <li>
              Click a pair for detail. Done? <strong>Reset</strong> restores the full list.
            </li>
            <li>
              Drill deeper with the <strong>knowledge graph</strong> and multi-filters below.
            </li>
          </ol>
        </div>
      )}

      {mode === "expert" && (
        <div className="border-b border-ink/[0.05] bg-ink/[0.02] px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-text-muted">
          <span className="text-text-primary/85">Window:</span> 90d hit-date ·{" "}
          <span className="text-text-primary/85">min n:</span> 150 (UI) / 200 (API) ·{" "}
          <span className="text-text-primary/85">Win:</span> tp1–tp4 ·{" "}
          <span className="text-text-primary/85">Full:</span> tp3+tp4 ·{" "}
          <span className="text-text-primary/85">Peak:</span> median peak_pct ·{" "}
          <span className="text-text-primary/85">Filter:</span> opt-in only
        </div>
      )}

      <div className="divide-y divide-ink/[0.05]">
        {SECTIONS.map((s) => {
          const open = openId === s.id;
          const body = mode === "simple" ? s.simple : s.expert;
          return (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.02]"
                aria-expanded={open}
              >
                <span className="text-[12.5px] font-medium text-text-primary">{s.title}</span>
                <span className="font-mono text-[10px] text-text-muted">{open ? "−" : "+"}</span>
              </button>
              {open && (
                <div className="px-3.5 pb-3 text-[12.5px] leading-relaxed text-text-muted">
                  {body}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
