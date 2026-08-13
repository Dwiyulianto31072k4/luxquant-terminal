// EdgePlaybook — high-runner insight + graph + dynamic multi-filter drill.
// Tags combine (multi-select). Verdict / status / risk / sort stack freely.
// Match mode: any (OR) | all (AND). Default table stays full until user opts in.

import { useMemo, useState } from "react";
import EdgeBrainGraph from "./EdgeBrainGraph";
import EdgeGuide from "./EdgeGuide";
import EdgeActiveFilters from "./EdgeActiveFilters";
import {
  MULTI_SORT_PRESETS,
  formatSortChain,
  isDefaultSorts,
  normalizeSorts,
} from "../utils/signalSort";

const CONFOUND_TAGS = new Set([
  "LATE_ENTRY",
  "PARABOLIC",
  "OVEREXTENDED",
  "EXHAUSTION_CANDLE",
]);

const nice = (tag) => String(tag || "").replace(/_/g, " ").toLowerCase();

function runnerScore(t) {
  const wr = Number(t.win_rate) || 0;
  const tp4 = Number(t.tp4_rate) || 0;
  const full = Number(t.full_tp_rate) || 0;
  const peak = Number(t.median_peak_wins ?? t.median_peak) || 0;
  const peakNorm = Math.min(100, Math.max(0, peak * 2.5));
  return 0.35 * tp4 + 0.3 * full + 0.2 * peakNorm + 0.15 * wr;
}

function SectionLabel({ tone = "muted", children, hint }) {
  const toneCls =
    tone === "accent"
      ? "text-accent"
      : tone === "positive"
        ? "text-positive"
        : tone === "loss"
          ? "text-loss"
          : "text-text-muted";
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] ${toneCls}`}
      >
        {children}
      </span>
      {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
    </div>
  );
}

const SORT_PRESETS = [
  { value: "edge_score", label: "Edge Score" },
  { value: "created_at", label: "Called time" },
  { value: "verdict", label: "Verdict score" },
  { value: "win_rate", label: "Win rate" },
  { value: "win_streak", label: "Win streak" },
  { value: "max_target", label: "Max target %" },
  { value: "volume", label: "Volume" },
  { value: "btc_corr", label: "BTC align" },
  { value: "risk_level", label: "Risk" },
  { value: "status", label: "Status" },
];

export default function EdgePlaybook({
  tagWr = [],
  verdictCounts = { worth: 0, avoid: 0 },
  signalTags = {},
  selectedTags = [],
  tagMatchMode = "any",
  verdictFilter = "all",
  statusFilter = "all",
  riskFilter = "all",
  sortBy = "created_at",
  sortOrder = "desc",
  sorts = null,
  edgeFilterActive = false,
  filteredCount = null,
  /** Default collapsed — table-first UX; user expands for graph/filters. */
  defaultOpen = false,
  /** Hide outer chrome when already inside Advanced shell */
  embedded = false,
  onToggleTag,
  onSetTags,
  onTagMatchMode,
  onVerdictFilter,
  onStatusFilter,
  onRiskFilter,
  onSort,
  onSorts,
  onApplyEdge,
  onScreenRunners,
  onFilterTag,
  onClear,
}) {
  const sortChain = normalizeSorts(
    Array.isArray(sorts) && sorts.length
      ? sorts
      : [{ field: sortBy, order: sortOrder }]
  );
  const [open, setOpen] = useState(defaultOpen);
  const [selectedTag, setSelectedTag] = useState(null); // graph focus (inspect)
  const [showGuide, setShowGuide] = useState(false);

  const { prefer, runners, caution } = useMemo(() => {
    const base = (tagWr || []).filter((t) => t && t.n >= 150 && typeof t.win_rate === "number");
    const clean = base.filter((t) => !CONFOUND_TAGS.has(t.tag));

    const prefer = clean
      .filter((t) => t.win_rate >= 82)
      .sort((a, b) => b.win_rate - a.win_rate || b.n - a.n)
      .slice(0, 6);

    const runners = clean
      .filter((t) => {
        const wr = Number(t.win_rate) || 0;
        const full = Number(t.full_tp_rate) || 0;
        const tp4 = Number(t.tp4_rate) || 0;
        const peak = Number(t.median_peak_wins ?? t.median_peak) || 0;
        if (wr < 78) return false;
        return full >= 12 || tp4 >= 5 || peak >= 18;
      })
      .map((t) => ({ ...t, _score: runnerScore(t) }))
      .sort((a, b) => b._score - a._score || b.n - a.n)
      .slice(0, 6);

    const caution = base
      .filter((t) => t.win_rate < 78 || CONFOUND_TAGS.has(t.tag))
      .sort((a, b) => a.win_rate - b.win_rate)
      .slice(0, 4);

    return { prefer, runners, caution };
  }, [tagWr]);

  const topEdgeTags = prefer.slice(0, 3).map((t) => t.tag);
  const topRunnerTags = (runners.length ? runners : prefer).slice(0, 4).map((t) => t.tag);
  const hasData = prefer.length > 0 || runners.length > 0 || verdictCounts.worth > 0;

  const activeChipCount =
    selectedTags.length +
    (verdictFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (riskFilter !== "all" ? 1 : 0) +
    (sortBy !== "created_at" ? 1 : 0);

  if (!hasData) return null;

  const toggleTagChip = (tag) => {
    onToggleTag?.(tag);
    setSelectedTag(tag);
  };

  const pill = (active) =>
    active
      ? "border-accent/40 bg-accent/15 text-text-primary font-semibold"
      : "border-ink/[0.1] bg-surface-raised text-text-muted hover:border-ink/18 hover:text-text-primary";

  const body = (
        <div className={embedded ? "space-y-4" : "space-y-4 border-t border-ink/[0.06] px-3 pb-4 pt-3.5 sm:px-5"}>
          {showGuide && <EdgeGuide />}

          {/* Current filters snapshot inside panel */}
          <EdgeActiveFilters
            variant="card"
            sticky={false}
            selectedTags={selectedTags}
            tagMatchMode={tagMatchMode}
            verdictFilter={verdictFilter}
            statusFilter={statusFilter}
            riskFilter={riskFilter}
            sortBy={sortBy}
            sortOrder={sortOrder}
            sorts={sortChain}
            filteredCount={filteredCount}
            onRemoveTag={(tag) => onToggleTag?.(tag)}
            onTagMatchMode={onTagMatchMode}
            onVerdictFilter={onVerdictFilter}
            onStatusFilter={onStatusFilter}
            onRiskFilter={onRiskFilter}
            onSortReset={() => onSort?.("created_at", "desc")}
            onRemoveSortLevel={(field) => {
              const next = sortChain.filter((s) => s.field !== field);
              onSorts?.(next.length ? next : [{ field: "created_at", order: "desc" }]);
            }}
            onToggleSortLevel={(field) => {
              const next = sortChain.map((s) =>
                s.field === field
                  ? { ...s, order: s.order === "desc" ? "asc" : "desc" }
                  : s
              );
              onSorts?.(next);
            }}
            onClearAll={onClear}
          />

          {/* ═══ Live drill bar — always visible when open ═══ */}
          <div className="space-y-3 rounded-2xl border border-ink/[0.09] bg-gradient-to-b from-ink/[0.03] to-transparent p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold text-text-primary">Build filters</p>
                <p className="text-[11px] text-text-muted">
                  Stack tags + Worth it + status + risk + sort · hero rank = Edge Score
                </p>
              </div>
              {edgeFilterActive && (
                <button
                  type="button"
                  onClick={() => onClear?.()}
                  className="rounded-lg border border-ink/[0.12] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:border-ink/20 hover:text-text-primary"
                >
                  Reset all
                </button>
              )}
            </div>

            {/* Match mode */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                Tags match
              </span>
              {[
                { id: "any", label: "Any (OR)", hint: "Has at least one selected tag" },
                { id: "all", label: "All (AND)", hint: "Must have every selected tag" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => onTagMatchMode?.(m.id)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${pill(
                    tagMatchMode === m.id
                  )}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Verdict */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                Verdict
              </span>
              {[
                { id: "all", label: "All" },
                { id: "worth_it", label: `Worth it${verdictCounts.worth ? ` ${verdictCounts.worth}` : ""}` },
                { id: "avoid", label: `Avoid${verdictCounts.avoid ? ` ${verdictCounts.avoid}` : ""}` },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onVerdictFilter?.(m.id)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${pill(
                    verdictFilter === m.id
                  )}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Status + Risk */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                Status
              </span>
              {[
                { id: "all", label: "All" },
                { id: "open", label: "Open" },
                { id: "tp1", label: "TP1+" },
                { id: "closed_win", label: "Win" },
                { id: "sl", label: "SL" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onStatusFilter?.(m.id)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${pill(
                    statusFilter === m.id
                  )}`}
                >
                  {m.label}
                </button>
              ))}
              <span className="ml-1 font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                Risk
              </span>
              {[
                { id: "all", label: "All" },
                { id: "low", label: "Low" },
                { id: "normal", label: "Normal" },
                { id: "high", label: "High" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onRiskFilter?.(m.id)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${pill(
                    riskFilter === m.id
                  )}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Multi-sort */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                  Sort chain
                </span>
                {!isDefaultSorts(sortChain) && (
                  <span className="font-mono text-[10px] text-text-secondary">
                    {formatSortChain(sortChain)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  Stack
                </span>
                {MULTI_SORT_PRESETS.map((p) => {
                  const active =
                    sortChain.length === p.sorts.length &&
                    sortChain.every(
                      (s, i) => s.field === p.sorts[i].field && s.order === p.sorts[i].order
                    );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.hint}
                      onClick={() => onSorts?.(p.sorts)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors ${pill(
                        active
                      )}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  Primary
                </span>
                {SORT_PRESETS.map((s) => {
                  const inChain = sortChain.some((x) => x.field === s.value);
                  const rank = sortChain.findIndex((x) => x.field === s.value) + 1;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      title="Click = primary · Shift+click table headers to stack"
                      onClick={(e) => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey) {
                          // Additive: append via onSorts if parent supports chain merge
                          const without = sortChain.filter((x) => x.field !== s.value);
                          if (without.length >= 4) without.pop();
                          onSorts?.([...without, { field: s.value, order: "desc" }]);
                        } else if (sortBy === s.value) {
                          onSort?.(s.value, sortOrder === "desc" ? "asc" : "desc");
                        } else {
                          onSort?.(s.value, "desc");
                        }
                      }}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${pill(
                        inChain
                      )}`}
                    >
                      {rank > 1 ? `${rank}·` : ""}
                      {s.label}
                      {sortBy === s.value ? (sortOrder === "desc" ? " ↓" : " ↑") : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active tags chips */}
            <div className="flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-2.5">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                Active tags
              </span>
              {selectedTags.length === 0 ? (
                <span className="text-[11.5px] text-text-muted">
                  None — click graph nodes or chips below to add (multi)
                </span>
              ) : (
                selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagChip(tag)}
                    title="Click to remove"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/35 bg-accent/12 px-2.5 py-1 font-mono text-[11px] text-text-primary"
                  >
                    <span className="normal-case">{nice(tag)}</span>
                    <span className="text-text-muted">×</span>
                  </button>
                ))
              )}
              {selectedTags.length > 0 && (
                <span className="font-mono text-[10px] text-text-muted">
                  {tagMatchMode === "all" ? "AND" : "OR"} · {selectedTags.length} tag
                  {selectedTags.length > 1 ? "s" : ""}
                  {filteredCount != null ? ` · ${filteredCount} signals` : ""}
                </span>
              )}
            </div>

            {/* Quick presets — outcome language (mirrors Quick path recipes) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onScreenRunners?.(topRunnerTags);
                  onSort?.("edge_score", "desc");
                }}
                className="rounded-lg border border-accent/35 bg-accent/15 px-3 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-accent/25"
              >
                Hunt full TP · Worth
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyEdge?.(topEdgeTags);
                  onSort?.("edge_score", "desc");
                }}
                className="rounded-lg border border-ink/15 bg-ink/[0.04] px-3 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-ink/[0.08]"
              >
                High win-rate · Worth
              </button>
              <button
                type="button"
                onClick={() => {
                  onVerdictFilter?.("worth_it");
                  onSort?.("edge_score", "desc");
                }}
                className="rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-ink/[0.05]"
              >
                Worth · Edge Score
              </button>
              <button
                type="button"
                onClick={() => onSort?.("edge_score", "desc")}
                className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-accent/20"
              >
                Sort by Edge Score
              </button>
              <button
                type="button"
                onClick={() => {
                  onStatusFilter?.("open");
                  onVerdictFilter?.("worth_it");
                  onSort?.("edge_score", "desc");
                }}
                className="rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-ink/[0.05]"
              >
                Open · Worth · Edge
              </button>
            </div>
          </div>

          {/* Graph */}
          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold text-text-primary">Knowledge graph</p>
                <p className="text-[11.5px] text-text-muted">
                  Click = inspect · Filter / double-click ={" "}
                  <span className="text-text-primary/85">add or remove tag from drill</span> · ⛶
                  expand
                </p>
              </div>
            </div>
            <EdgeBrainGraph
              runners={runners}
              prefer={prefer}
              caution={caution}
              verdictCounts={verdictCounts}
              signalTags={signalTags}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              onFilterTag={(tag) => {
                // Multi-combine: toggle into active set
                setSelectedTag(tag);
                onFilterTag?.(tag);
              }}
              onClearFilter={() => onClear?.()}
              onScreenRunners={(tags) => onScreenRunners?.(tags)}
              activeFilterTags={selectedTags}
              edgeFilterActive={edgeFilterActive}
            />
          </div>

          {/* Chip rails — multi toggle */}
          {runners.length > 0 && (
            <div>
              <SectionLabel tone="accent" hint="Click to add/remove from drill (combine)">
                High runners
              </SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {runners.map((t) => {
                  const peak = t.median_peak_wins ?? t.median_peak;
                  const full = t.full_tp_rate;
                  const active = selectedTags.includes(t.tag);
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => toggleTagChip(t.tag)}
                      title="Toggle into multi-filter"
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                        active
                          ? "border-accent/45 bg-accent/18 text-text-primary shadow-sm ring-1 ring-accent/20"
                          : "border-accent/20 bg-accent/[0.06] text-text-primary/90 hover:border-accent/35"
                      }`}
                    >
                      {active && <span className="text-accent">✓</span>}
                      <span className="normal-case">{nice(t.tag)}</span>
                      {full != null && (
                        <span className="tabular-nums text-accent">
                          {Number(full).toFixed(0)}% full
                        </span>
                      )}
                      {peak != null && (
                        <span className="tabular-nums text-text-muted">
                          +{Number(peak).toFixed(0)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <SectionLabel tone="positive" hint="Click to add/remove · combine with runners">
              Prefer
            </SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onVerdictFilter?.(verdictFilter === "worth_it" ? "all" : "worth_it")
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                  verdictFilter === "worth_it"
                    ? "border-positive/40 bg-positive/15 text-text-primary"
                    : "border-ink/[0.07] bg-ink/[0.02] text-text-primary/90"
                }`}
              >
                Worth it pairs
                {verdictCounts.worth > 0 && (
                  <span className="tabular-nums text-text-muted">{verdictCounts.worth}</span>
                )}
              </button>
              {prefer.map((t) => {
                const active = selectedTags.includes(t.tag);
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => toggleTagChip(t.tag)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                      active
                        ? "border-positive/40 bg-positive/15 text-text-primary"
                        : "border-ink/[0.07] bg-ink/[0.02] text-text-primary/85 hover:border-ink/16"
                    }`}
                  >
                    {active && <span className="text-positive">✓</span>}
                    <span className="normal-case">{nice(t.tag)}</span>
                    <span className="tabular-nums text-positive">
                      {Number(t.win_rate).toFixed(0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(caution.length > 0 || verdictCounts.avoid > 0) && (
            <div>
              <SectionLabel tone="loss" hint="Optional exclude-awareness · can still multi-select">
                Caution
              </SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onVerdictFilter?.(verdictFilter === "avoid" ? "all" : "avoid")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                    verdictFilter === "avoid"
                      ? "border-loss/35 bg-loss/12 text-text-primary"
                      : "border-ink/[0.06] bg-ink/[0.015] text-text-muted"
                  }`}
                >
                  Avoid pairs
                  {verdictCounts.avoid > 0 && (
                    <span className="tabular-nums">{verdictCounts.avoid}</span>
                  )}
                </button>
                {caution.map((t) => {
                  const active = selectedTags.includes(t.tag);
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => toggleTagChip(t.tag)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                        active
                          ? "border-loss/30 bg-loss/10 text-text-primary"
                          : "border-ink/[0.06] bg-ink/[0.015] text-text-muted hover:border-ink/14"
                      }`}
                    >
                      {active && <span>×</span>}
                      <span className="normal-case">{nice(t.tag)}</span>
                      <span className="tabular-nums">{Number(t.win_rate).toFixed(0)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[10.5px] leading-snug text-text-muted">
            Example: add <span className="text-text-primary/80">smc golden setup</span> +{" "}
            <span className="text-text-primary/80">vol climax</span> (OR or AND) · Worth it · sort{" "}
            <span className="text-text-primary/80">Edge Score</span>. Not financial advice.
          </p>
        </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">Edge playbook</p>
            <p className="text-[11.5px] text-text-muted">
              Knowledge graph · multi-filter · hero rank = Edge Score
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              showGuide
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-ink/[0.1] text-text-muted hover:border-ink/18 hover:text-text-primary"
            }`}
          >
            {showGuide ? "Guide on" : "Guide"}
          </button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section
      id="edge-playbook"
      className="mb-5 scroll-mt-24 overflow-hidden rounded-2xl border border-ink/[0.09] bg-surface-raised shadow-[0_1px_0_rgb(var(--ink)/0.04)]"
    >
      <div className="flex w-full items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold tracking-tight text-text-primary">
              Edge playbook
            </span>
            <span className="rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
              graph · multi-filter · since tags
            </span>
            {activeChipCount > 0 && (
              <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
                {activeChipCount} active
                {filteredCount != null ? ` · ${filteredCount} shown` : ""}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-text-muted">
            Knowledge graph of historical tags · multi-filter · sort by Edge Score. Click a tag to
            add, again to remove. Open Guide inside for Simple/Expert how-to. Opt-in only.
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowGuide((v) => !v);
              if (!open) setOpen(true);
            }}
            className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              showGuide && open
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-ink/[0.1] text-text-muted hover:border-ink/18 hover:text-text-primary"
            }`}
          >
            {showGuide && open ? "Guide on" : "Guide"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-ink/[0.1] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {open && body}
    </section>
  );
}

export function buildRunnerTagSet(tagWr = []) {
  const set = new Set();
  for (const t of tagWr || []) {
    if (!t || t.n < 150 || CONFOUND_TAGS.has(t.tag)) continue;
    const wr = Number(t.win_rate) || 0;
    const full = Number(t.full_tp_rate) || 0;
    const tp4 = Number(t.tp4_rate) || 0;
    const peak = Number(t.median_peak_wins ?? t.median_peak) || 0;
    if (wr < 78) continue;
    if (full >= 12 || tp4 >= 5 || peak >= 18) set.add(t.tag);
  }
  return set;
}
