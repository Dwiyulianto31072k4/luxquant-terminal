// EdgeActiveFilters — the ONE bar that says what the desk is currently showing.
//
// It used to be one of two. A second strip above it listed narratives, the
// search, the day span and the Edge cut as its own chips, so "Edge top 30" and
// "Top 30% Edge" were the same filter printed twice in two casings, under two
// different counts, beside two different Clear alls. A reader had no way to
// tell which was authoritative, and removing a filter from one bar silently
// changed the other. They are merged here.
//
// Three rules from the way a filter bar is actually read:
//
//  1. THE COUNT IS THE HEADLINE. The bar exists to answer "what did I narrow
//     this to", and that was a ten-pixel mono footnote. It leads now.
//  2. SORT IS NOT A FILTER. A sort chain changes the ORDER of a set, not its
//     membership, and mixing the two in one run of chips invites people to
//     remove a sort expecting rows back. They are separate groups, labelled.
//  3. THE ACTION ON THE RESULT BELONGS BESIDE THE RESULT. Visualize sits with
//     the count it operates on, and carries the accent, because a ghost button
//     in a grey bar is a button nobody finds.

const nice = (tag) => String(tag || "").replace(/_/g, " ").toLowerCase();

import { SORT_LABELS, isDefaultSorts, normalizeSorts } from "../utils/signalSort";

/**
 * @param {object} props
 * @param {'bar'|'card'} [props.variant]
 */
export default function EdgeActiveFilters({
  variant = "bar",
  narratives = [],
  topRunnersOnly = false,
  onRemoveNarrative,
  onClearTopRunners,
  onVisualize,
  selectedTags = [],
  tagMatchMode = "any",
  statusFilter = "all",
  riskFilter = "all",
  streakFilter = "all",
  corrDecoupled = false,
  corrHighAlign = false,
  edgeTop = null,
  sortBy = "created_at",
  sortOrder = "desc",
  sorts = null,
  selectedDates = [],
  searchPair = "",
  watchlistActive = false,
  filteredCount = null,
  totalUnfiltered = null,
  onRemoveTag,
  onTagMatchMode,
  onStatusFilter,
  onRiskFilter,
  onStreakFilter,
  onCorrDecoupled,
  onCorrHighAlign,
  onEdgeTop,
  onSortReset,
  onRemoveSortLevel,
  onToggleSortLevel,
  onClearDates,
  onClearSearch,
  onClearWatchlist,
  onClearAll,
  sticky = true,
}) {
  const chips = [];

  // Narratives and the Top Runners refinement came from the strip this bar
  // replaced. They lead, because they are the widest cut: a narrative pick
  // decides which coins are even eligible.
  for (const n of narratives) {
    chips.push({
      key: `narrative:${n.category_id}`,
      label: n.name,
      group: "narrative",
      tone: "accent",
      clear: () => onRemoveNarrative?.(n),
    });
  }
  if (topRunnersOnly) {
    chips.push({
      key: "toprunners",
      label: "Top Runners only",
      group: "toprunners",
      tone: "accent",
      clear: () => onClearTopRunners?.(),
    });
  }

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

  if (watchlistActive) {
    chips.push({
      key: "watchlist",
      group: "watchlist",
      label: "Watchlist",
      tone: "neutral",
      clear: () => onClearWatchlist?.(),
    });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (!selectedDates?.length) {
      chips.push({
        key: "dates",
        group: "date",
        label: "All days",
        tone: "neutral",
        clear: () => onClearDates?.(),
      });
    } else if (selectedDates.length === 1) {
      // Today is stated too. Skipping it left "8 of 736" with no span on the
      // one day people look at most — the count is a different claim over a
      // day than over the week, and the bar exists to say which.
      chips.push({
        key: "dates",
        group: "date",
        label: selectedDates[0] === today ? "Today" : `Day: ${selectedDates[0]}`,
        tone: "neutral",
        clear: () => onClearDates?.(),
      });
    } else if (selectedDates.length > 1) {
      chips.push({
        key: "dates",
        group: "date",
        label: `Days: ${selectedDates.length}`,
        tone: "neutral",
        clear: () => onClearDates?.(),
      });
    }
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

  if (edgeTop) {
    chips.push({
      key: "edgetop",
      group: "edge",
      label: `Top ${edgeTop}% Edge`,
      tone: "good",
      clear: () => onEdgeTop?.(null),
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

  // Two runs, because they are two kinds of state.
  const filterChips = chips.filter((c) => c.group !== "sort");
  const sortChips = chips.filter((c) => c.group === "sort");

  const shell =
    variant === "card"
      ? "rounded-2xl border border-ink/[0.1] bg-surface-raised p-3.5 shadow-sm"
      : `rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 sm:px-3.5 ${
          sticky
            ? "lg:sticky lg:top-0 lg:z-30 lg:backdrop-blur-md lg:supports-[backdrop-filter]:bg-surface-raised/90"
            : ""
        }`;

  const canVisualize = Boolean(onVisualize) && filteredCount > 1;
  const visualizeIcon = (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="4.5" cy="11" r="1.9" />
      <circle cx="11" cy="5" r="1.9" />
      <path d="M2 14 14 2" strokeDasharray="2 2" opacity="0.55" />
    </svg>
  );

  return (
    <div className={`${shell} mb-3`} role="region" aria-label="Current filters">
      {/* The count leads. This bar exists to answer "what did I narrow this
          to", and that answer used to be a ten-pixel footnote beside the word
          Filters. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[19px] font-medium leading-none tabular-nums text-text-primary">
            {filteredCount != null ? filteredCount.toLocaleString() : "—"}
          </span>
          {totalUnfiltered != null && totalUnfiltered !== filteredCount ? (
            <span className="font-mono text-[11.5px] tabular-nums text-text-muted">
              of {totalUnfiltered.toLocaleString()}
            </span>
          ) : null}
          <span className="text-[11.5px] text-text-muted">signals</span>
        </span>
        {/* Counts what FILTERS. The sort chips sit in their own group below
            and are not filters, so counting them here contradicted the layout
            two lines under it. */}
        <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-muted">
          {filterChips.length} filter{filterChips.length === 1 ? "" : "s"}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onClearAll?.()}
            className="inline-flex h-8 items-center rounded-lg border border-ink/[0.12] px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-ink/25 hover:text-text-primary sm:h-auto sm:py-1.5"
          >
            Clear all
          </button>
          {/* The action on the result, beside the result, in the accent — a
              ghost button in a grey bar is a button nobody finds. On a phone
              it leaves this row for a full-width bar under the chips: squeezed
              in here it wrapped onto a line of its own, pushed to the right
              edge with nothing beside it. */}
          {canVisualize ? (
            <button
              type="button"
              onClick={onVisualize}
              title="Compare these calls on how far past the entry they are and what is left to target"
              className="hidden items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent-dark sm:inline-flex"
            >
              {visualizeIcon}
              Visualize
              <span className="rounded bg-black/15 px-1 font-mono text-[10px] tabular-nums">
                {filteredCount}
              </span>
            </button>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_18rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterChips.map((chip) => (
              <span
                key={chip.key}
                className={`inline-flex max-w-full items-center gap-0.5 rounded-lg border py-0.5 pl-2.5 pr-0.5 font-mono text-[11.5px] sm:pl-2 sm:text-[11px] ${
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
                  className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[14px] text-text-muted transition-colors hover:bg-ink/10 hover:text-text-primary sm:h-5 sm:w-5 sm:text-[12px]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Sort is NOT a filter: it changes the order of a set, not its
            membership. Mixed into the same run of chips it invited people to
            remove a sort expecting rows back. */}
        {sortChips.length ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 border-ink/[0.08] sm:w-auto sm:shrink-0 sm:border-l sm:pl-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              Order
            </span>
            {sortChips.map((chip) => (
              <span
                key={chip.key}
                className={`inline-flex max-w-full items-center gap-0.5 rounded-lg border py-0.5 pl-2.5 pr-0.5 font-mono text-[11.5px] sm:pl-2 sm:text-[11px] ${
                  toneCls[chip.tone] || toneCls.neutral
                }`}
              >
                <button
                  type="button"
                  onClick={chip.onClick || chip.clear}
                  className="min-w-0 truncate text-left normal-case tracking-normal hover:opacity-90"
                >
                  {chip.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    chip.clear?.();
                  }}
                  aria-label={`Remove ${chip.label}`}
                  className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[14px] text-text-muted transition-colors hover:bg-ink/10 hover:text-text-primary sm:h-5 sm:w-5 sm:text-[12px]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
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

      {/* Phone: the result's action as the bar's last line, full width and at
          thumb height — the "Show 119 results" button every filter sheet ends
          on, because that is what it is. */}
      {canVisualize ? (
        <button
          type="button"
          onClick={onVisualize}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-accent-fg shadow-sm transition-colors active:bg-accent-dark sm:hidden"
        >
          {visualizeIcon}
          Visualize {filteredCount.toLocaleString()} calls
        </button>
      ) : null}
    </div>
  );
}
