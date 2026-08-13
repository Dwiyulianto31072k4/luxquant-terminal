// EdgeActiveFilters — sticky “current drill” strip.
// Shows every active edge/filter dimension as a removable chip (×) + Clear all.
// Deep, always-visible summary so users never lose track of what’s filtering the table.

const nice = (tag) => String(tag || "").replace(/_/g, " ").toLowerCase();

import { SORT_LABELS, isDefaultSorts, normalizeSorts } from "../utils/signalSort";

/**
 * @param {object} props
 * @param {'bar'|'card'} [props.variant]
 */
export default function EdgeActiveFilters({
  variant = "bar",
  selectedTags = [],
  tagMatchMode = "any",
  verdictFilter = "all",
  statusFilter = "all",
  riskFilter = "all",
  streakFilter = "all",
  corrDecoupled = false,
  corrHighAlign = false,
  sortBy = "created_at",
  sortOrder = "desc",
  sorts = null,
  selectedDates = [],
  searchPair = "",
  filteredCount = null,
  totalUnfiltered = null,
  onRemoveTag,
  onTagMatchMode,
  onVerdictFilter,
  onStatusFilter,
  onRiskFilter,
  onStreakFilter,
  onCorrDecoupled,
  onCorrHighAlign,
  onSortReset,
  onRemoveSortLevel,
  onToggleSortLevel,
  onClearDates,
  onClearSearch,
  onClearAll,
  sticky = true,
}) {
  const chips = [];
  const sortChain = normalizeSorts(
    Array.isArray(sorts) && sorts.length
      ? sorts
      : [{ field: sortBy, order: sortOrder }]
  );

  if (searchPair?.trim()) {
    chips.push({
      key: "search",
      group: "search",
      label: `Search: ${searchPair.trim()}`,
      tone: "neutral",
      clear: () => onClearSearch?.(),
    });
  }

  if (selectedDates?.length > 0) {
    chips.push({
      key: "dates",
      group: "date",
      label:
        selectedDates.length === 1
          ? `Day: ${selectedDates[0]}`
          : `Days: ${selectedDates.length}`,
      tone: "neutral",
      clear: () => onClearDates?.(),
    });
  }

  if (selectedTags.length > 0) {
    chips.push({
      key: "match",
      group: "mode",
      label: tagMatchMode === "all" ? "Match: ALL (AND)" : "Match: ANY (OR)",
      tone: "mode",
      // cycle mode on chip click body; × still clears to default any + no tags? 
      // For mode chip, × resets mode to any without removing tags
      clear: () => onTagMatchMode?.("any"),
      onClick: () => onTagMatchMode?.(tagMatchMode === "all" ? "any" : "all"),
    });
    selectedTags.forEach((tag) => {
      chips.push({
        key: `tag:${tag}`,
        group: "tag",
        label: nice(tag),
        tone: "tag",
        clear: () => onRemoveTag?.(tag),
      });
    });
  }

  if (verdictFilter !== "all") {
    chips.push({
      key: "verdict",
      group: "verdict",
      label: `Verdict: ${verdictFilter.replace(/_/g, " ")}`,
      tone: verdictFilter === "worth_it" ? "good" : "bad",
      clear: () => onVerdictFilter?.("all"),
    });
  }

  if (statusFilter !== "all") {
    chips.push({
      key: "status",
      group: "status",
      label: `Status: ${statusFilter}`,
      tone: "neutral",
      clear: () => onStatusFilter?.("all"),
    });
  }

  if (riskFilter !== "all") {
    chips.push({
      key: "risk",
      group: "risk",
      label: `Risk: ${riskFilter}`,
      tone: "neutral",
      clear: () => onRiskFilter?.("all"),
    });
  }

  if (streakFilter !== "all") {
    chips.push({
      key: "streak",
      group: "streak",
      label: "Hot streak",
      tone: "neutral",
      clear: () => onStreakFilter?.("all"),
    });
  }

  if (corrDecoupled) {
    chips.push({
      key: "decoupled",
      group: "corr",
      label: "BTC decoupled",
      tone: "neutral",
      clear: () => onCorrDecoupled?.(false),
    });
  }

  if (corrHighAlign) {
    chips.push({
      key: "align",
      group: "corr",
      label: "BTC aligned",
      tone: "neutral",
      clear: () => onCorrHighAlign?.(false),
    });
  }

  if (!isDefaultSorts(sortChain)) {
    if (sortChain.length === 1) {
      const s = sortChain[0];
      const sl = SORT_LABELS[s.field] || s.field;
      chips.push({
        key: "sort",
        group: "sort",
        label: `Sort: ${sl} ${s.order === "desc" ? "↓" : "↑"}`,
        tone: "sort",
        clear: () => onSortReset?.(),
        onClick: () => onToggleSortLevel?.(s.field),
      });
    } else {
      sortChain.forEach((s, i) => {
        const sl = SORT_LABELS[s.field] || s.field;
        chips.push({
          key: `sort:${s.field}`,
          group: "sort",
          label: `${i + 1} ${sl} ${s.order === "desc" ? "↓" : "↑"}`,
          tone: "sort",
          clear: () => onRemoveSortLevel?.(s.field),
          onClick: () => onToggleSortLevel?.(s.field),
        });
      });
      chips.push({
        key: "sort-reset",
        group: "sort",
        label: "Reset sort",
        tone: "sort",
        clear: () => onSortReset?.(),
      });
    }
  }

  if (chips.length === 0) return null;

  const toneCls = {
    tag: "border-accent/30 bg-accent/12 text-text-primary",
    mode: "border-ink/15 bg-ink/[0.05] text-text-primary",
    good: "border-positive/30 bg-positive/10 text-text-primary",
    bad: "border-loss/25 bg-loss/10 text-text-primary",
    sort: "border-ink/12 bg-ink/[0.04] text-text-primary",
    neutral: "border-ink/12 bg-ink/[0.05] text-text-primary",
  };

  const shell =
    variant === "card"
      ? "rounded-2xl border border-ink/[0.1] bg-surface-raised p-3.5 shadow-sm"
      : `rounded-xl border border-accent/20 bg-accent/[0.06] px-3 py-2.5 sm:px-3.5 ${
          sticky ? "sticky top-0 z-30 backdrop-blur-md supports-[backdrop-filter]:bg-accent/[0.08]" : ""
        }`;

  return (
    <div className={`${shell} mb-3`} role="region" aria-label="Current filters">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent">
              Current filters
            </span>
            <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
              {chips.length} active
            </span>
            {filteredCount != null && (
              <span className="font-mono text-[11px] tabular-nums text-text-primary">
                {filteredCount}
                {totalUnfiltered != null && totalUnfiltered !== filteredCount
                  ? ` / ${totalUnfiltered}`
                  : ""}{" "}
                <span className="text-text-muted">signals</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className={`inline-flex max-w-full items-center gap-0.5 rounded-lg border pl-2 pr-0.5 py-0.5 font-mono text-[11px] ${
                  toneCls[chip.tone] || toneCls.neutral
                }`}
              >
                <button
                  type="button"
                  onClick={chip.onClick || chip.clear}
                  className="min-w-0 truncate normal-case tracking-normal text-left hover:opacity-90"
                  title={chip.onClick ? "Click to toggle" : "Click × to remove"}
                >
                  {chip.group === "tag" && (
                    <span className="mr-1 text-[9px] uppercase tracking-wider text-accent/80">
                      tag
                    </span>
                  )}
                  {chip.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    chip.clear?.();
                  }}
                  aria-label={`Remove ${chip.label}`}
                  className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-ink/10 hover:text-text-primary"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onClearAll?.()}
          className="shrink-0 rounded-lg border border-ink/15 bg-surface-raised px-3 py-1.5 text-[11.5px] font-semibold text-text-primary shadow-sm transition-colors hover:border-ink/25 hover:bg-ink/[0.04]"
        >
          Clear all
        </button>
      </div>

      {selectedTags.length > 1 && (
        <p className="mt-2 text-[10.5px] leading-snug text-text-muted">
          Tags use{" "}
          <button
            type="button"
            onClick={() => onTagMatchMode?.(tagMatchMode === "all" ? "any" : "all")}
            className="font-medium text-text-primary/85 underline-offset-2 hover:underline"
          >
            {tagMatchMode === "all" ? "AND (must have every tag)" : "OR (any selected tag)"}
          </button>
          . Click the match chip or this text to switch.
        </p>
      )}
    </div>
  );
}
