// EdgeRecipesBar — desk mode rail: All · Runners · Watchlist.
// Stats live in the explain panel. A mode is a mode; day/search are slices.
//
// The Runners key stays `full_tp` — analytics and older links still use it.

import { useEffect, useMemo, useRef, useState } from "react";
import { topRunnerTags } from "./EdgePlaybook";
import { RUNNERS_EDGE_TOP, runnersRecipeState } from "../utils/signalFilters";
import RecipeExplainModal, { HuntResults } from "./RecipeExplainModal";
import RunnersResults from "./runners/RunnersResults";
import ModeGuideModal, { isModeGuideMuted } from "./ModeGuideModal";
import Modal from "./ui/Modal";
import { SegGroup, deskBadgeClass, deskChipClass } from "./ui/SegGroup";
import edgeLabApi from "../services/edgeLabApi";

export const ALL_MODE_STATE = {
  selectedTags: [],
  tagMatchMode: "any",
  statusFilter: "all",
  riskFilter: "all",
  streakFilter: "all",
  edgeTop: null,
  sortBy: "created_at",
  sortOrder: "desc",
  sorts: [{ field: "created_at", order: "desc" }],
  searchPair: "",
  corrDecoupled: false,
  corrHighAlign: false,
};

export function captureRecipeState(s) {
  const sorts =
    Array.isArray(s.sorts) && s.sorts.length
      ? s.sorts.map((x) => ({
          field: x.field,
          order: x.order === "asc" ? "asc" : "desc",
        }))
      : [{ field: s.sortBy || "created_at", order: s.sortOrder === "asc" ? "asc" : "desc" }];
  return {
    selectedTags: [...(s.selectedTags || [])],
    tagMatchMode: s.tagMatchMode === "all" ? "all" : "any",
    statusFilter: s.statusFilter || "all",
    riskFilter: s.riskFilter || "all",
    streakFilter: s.streakFilter || "all",
    edgeTop: s.edgeTop || null,
    sortBy: sorts[0]?.field || "created_at",
    sortOrder: sorts[0]?.order || "desc",
    sorts,
    searchPair: s.searchPair || "",
    corrDecoupled: !!s.corrDecoupled,
    corrHighAlign: !!s.corrHighAlign,
  };
}

/**
 * Is this recipe still the one in force?
 *
 * Equality, not identity: the search box and the day tabs narrow WITHIN a
 * recipe rather than replacing it. Comparing them too meant typing a coin name
 * while a mode was on made the bar go dark and claim the mode was off, while every
 * one of its filters was still applied and still listed in the chip bar. Dates
 * are not even captured — they are a slice, so Today then a mode must stay on
 * Today. The recipe is defined by the filters it sets — tags, status,
 * risk, streak and correlation — so only those decide.
 *
 * THE SORT CHAIN IS NOT PART OF IT, and used to be. A mode is a set of calls;
 * a sort is the order you read that set in. Re-sorting inside Runners changed
 * no membership at all — the table still said "33 / 709 signals" before and
 * after — yet the rail dropped to All and took the dead All button below with
 * it. Note the shape of the argument: `searchPair` genuinely narrows the list
 * and is still allowed to live inside a recipe, so a sort, which narrows
 * nothing whatsoever, cannot be the stricter of the two. A recipe still SETS a
 * sort when you enter it (Runners ranks by Edge, which is the point); it just
 * stops owning it afterwards.
 *
 * The bar used to STORE which recipe was clicked, and persist it. That made the
 * highlight drift the moment anything else touched the filters: "Clear all"
 * wiped every filter while the bar kept insisting the mode was on, and localStorage
 * carried the claim across reloads. Derived, the highlight cannot lie.
 */
export function sameRecipeState(a, b) {
  if (!a || !b) return false;
  const ta = [...(a.selectedTags || [])].sort();
  const tb = [...(b.selectedTags || [])].sort();
  if (ta.length !== tb.length || ta.some((t, i) => t !== tb[i])) return false;
  return (
    a.tagMatchMode === b.tagMatchMode &&
    a.statusFilter === b.statusFilter &&
    a.riskFilter === b.riskFilter &&
    a.streakFilter === b.streakFilter &&
    (a.edgeTop || null) === (b.edgeTop || null) &&
    a.corrDecoupled === b.corrDecoupled &&
    a.corrHighAlign === b.corrHighAlign
  );
}

export default function EdgeRecipesBar({
  tagWr = [],
  selectedTags = [],
  tagMatchMode = "any",
  statusFilter = "all",
  riskFilter = "all",
  streakFilter = "all",
  edgeTop = null,
  sortBy = "created_at",
  sortOrder = "desc",
  sorts = null,
  searchPair = "",
  corrDecoupled = false,
  corrHighAlign = false,
  onApplyState,
  showRecipes = true,
  customActive = false,
  watchlistCount = 0,
  watchlistActive = false,
  onWatchlist,
  /** Runners narrowed to the day's Top Runners. A refinement of the Runners
   *  mode, not a fourth mode — a Top Runner IS a Runner — so it rides beside
   *  the rail and only exists while Runners is the mode. */
  topRunnersOnly = false,
  topRunnersCount = 0,
  onToggleTopRunners,
  guideMode: guideModeProp = null,
  onGuideMode,
  onDeskGuide,
  onTutorials,
  deskRunnerTags = null,
  deskRunnerEdgeTop = null,
}) {
  const [explainId, setExplainId] = useState(null);
  // Controlled by SignalsPage when it wants the ? on the search row to open
  // the briefing; otherwise this component keeps its own.
  const [guideModeLocal, setGuideModeLocal] = useState(null);
  const guideMode = onGuideMode ? guideModeProp : guideModeLocal;
  const setGuideMode = onGuideMode || setGuideModeLocal;
  const [resultsOpen, setResultsOpen] = useState(false);
  const [huntDays, setHuntDays] = useState("0");
  const [huntByDays, setHuntByDays] = useState({});
  const huntByDaysRef = useRef(huntByDays);
  huntByDaysRef.current = huntByDays;
  const [huntLoading, setHuntLoading] = useState(false);
  const [huntError, setHuntError] = useState(false);

  const huntStats = huntByDays[huntDays] || huntByDays["0"] || null;

  useEffect(() => {
    if (!showRecipes) return undefined;
    if (guideMode !== "full_tp" && explainId !== "full_tp" && !resultsOpen) {
      return undefined;
    }
    const key = huntDays;
    if (huntByDaysRef.current[key]) return undefined;
    let cancelled = false;
    setHuntLoading(true);
    setHuntError(false);
    edgeLabApi
      .getHuntFullTp(Number(key))
      .then((d) => {
        if (cancelled) return;
        if (d?.ok) {
          setHuntByDays((prev) => ({ ...prev, [key]: d }));
        } else setHuntError(true);
      })
      .catch(() => {
        if (!cancelled) setHuntError(true);
      })
      .finally(() => {
        if (!cancelled) setHuntLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guideMode, explainId, resultsOpen, huntDays, showRecipes]);

  // The server's tags first (/signals/desk-edge): they are the ones the
  // Runners topic and the desk's membership were decided with, so selecting
  // the mode lands exactly on that set. Never the briefing's 7d/30d picker —
  // a window chosen for reading stats must not change what the mode selects.
  const runnerTags = useMemo(() => {
    if (Array.isArray(deskRunnerTags) && deskRunnerTags.length) return deskRunnerTags;
    const fromApi = huntByDays["0"]?.runner_tags;
    if (Array.isArray(fromApi) && fromApi.length) return fromApi;
    return topRunnerTags(tagWr);
  }, [tagWr, huntByDays, deskRunnerTags]);

  const runnerEdgeTop = Number(deskRunnerEdgeTop) || RUNNERS_EDGE_TOP;

  const cautionTags = useMemo(() => {
    const CONFOUND = new Set([
      "LATE_ENTRY",
      "PARABOLIC",
      "OVEREXTENDED",
      "EXHAUSTION_CANDLE",
    ]);
    return (tagWr || [])
      .filter((t) => t && CONFOUND.has(t.tag))
      .map((t) => t.tag)
      .slice(0, 4);
  }, [tagWr]);

  const builtins = useMemo(
    () => [
      {
        id: "full_tp",
        icon: "▲",
        label: "Runners",
        hint: `Runner tags · top ${runnerEdgeTop}% Edge`,
        tone: "positive",
        // Two conditions, both measured, and re-chosen on 2026-09-19 from a
        // point-in-time walk-forward of the whole rule (workers/
        // runner_walkforward: 9,819 calls, 10 Jun - 18 Sep, each day decided
        // with only what was known that day):
        //
        //   desk                         TP3+ 45.6%  SL 13.4%   ~97/day
        //   top-4 tags + Edge top 20%    TP3+ 51.1%  SL  9.7%   ~14/day (old)
        //   top-2 tags + Edge top 30%    TP3+ 53.7%  SL  8.5%   ~14/day (now)
        //
        // Top-2 won every month at the same volume, and choosing on earlier
        // months alone picked it in Jul, Aug and Sep. Calls let in only by
        // tags #3/#4 did worse than the desk. The Edge score carries no TP3+
        // signal on its own (AUC 0.50) — the tags do; the cut trims stops.
        //
        // statusFilter stays `all`: classification is at publish. Open (has
        // not hit yet) is a chip, not this mode — tp1/tp2 stay on the shortlist.
        //
        // Membership is not re-derived from this state: SignalsPage sees the
        // state IS Runners (isRunnersSelection) and shows the calls the
        // Runners topic chose. The same state is what "Screen runners" in the
        // playbook applies.
        build: () => runnersRecipeState(runnerTags, runnerEdgeTop),
      },
      {
        id: "caution",
        icon: "!",
        label: "Caution first",
        hint: "Open · Edge↑ (weak first) · Called",
        tone: "warn",
        build: () => ({
          selectedTags: cautionTags.length ? cautionTags : [],
          tagMatchMode: "any",
          statusFilter: "open",
          riskFilter: "all",
          streakFilter: "all",
          sortBy: "edge_score",
          sortOrder: "asc",
          sorts: [
            { field: "edge_score", order: "asc" },
            { field: "created_at", order: "desc" },
          ],
          searchPair: "",
          corrDecoupled: false,
          corrHighAlign: false,
        }),
      },
    ],
    [runnerTags, cautionTags, runnerEdgeTop]
  );

  const liveState = useMemo(
    () =>
      captureRecipeState({
        selectedTags,
        tagMatchMode,
        statusFilter,
        riskFilter,
        streakFilter,
        edgeTop,
        sortBy,
        sortOrder,
        sorts,
        searchPair,
        corrDecoupled,
        corrHighAlign,
      }),
    [
      selectedTags,
      tagMatchMode,
      statusFilter,
      riskFilter,
      streakFilter,
      edgeTop,
      sortBy,
      sortOrder,
      sorts,
      searchPair,
      corrDecoupled,
      corrHighAlign,
    ]
  );

  const activeId = useMemo(() => {
    if (watchlistActive) return null;
    for (const r of builtins) {
      if (sameRecipeState(liveState, captureRecipeState(r.build()))) return r.id;
    }
    return null;
  }, [liveState, builtins, watchlistActive]);

  const applyBuiltin = (r) => {
    onApplyState?.(r.build());
  };

  const modeValue = customActive ? "custom" : watchlistActive
    ? "watchlist"
    : activeId === "full_tp"
      ? activeId
      : "all";

  const modeOptions = [
    { key: "all", label: "All", title: "Every call in the selected day" },
    ...(showRecipes
      ? [
          {
            key: "full_tp",
            label: "Runners",
            title: "Tagged at publish: setups that historically ran to later targets more often",
          },
        ]
      : []),
    {
      key: "watchlist",
      label: "Watchlist",
      title: "Starred calls — any day, not just the last 7",
      badge: watchlistCount > 0 ? watchlistCount : null,
      badgeClass: "hidden sm:inline-flex",
    },
  ];

  const applyModeKey = (key) => {
    if (key === "watchlist") {
      // Re-applying Watchlist would wipe tags/sort for no reason — it is already the source.
      if (!watchlistActive) onWatchlist?.();
      return;
    }
    if (key === "all") {
      // `modeValue` falls back to "all" whenever no recipe matches, so it is
      // NOT evidence that the desk is actually clear. Guarding on it meant that
      // with eight filters applied and no recipe matching, All was highlighted
      // and pressing it did nothing — the one control whose whole job is "give
      // me everything back" was dead exactly when it was needed, and only
      // Clear all still worked. Ask the state instead of the label.
      //
      // A sort is deliberately not a reason to fire: sameRecipeState ignores
      // the chain, so All stays a no-op when only the ordering differs. The
      // chip bar's own "Reset sort" owns that axis.
      const alreadyClear =
        !customActive &&
        !watchlistActive &&
        sameRecipeState(liveState, captureRecipeState(ALL_MODE_STATE));
      if (!alreadyClear) onApplyState?.(ALL_MODE_STATE);
      return;
    }
    const r = builtins.find((x) => x.id === key);
    if (r) applyBuiltin(r);
  };

  const onMode = (key) => {
    applyModeKey(key);
    if (!isModeGuideMuted()) setGuideMode(key);
  };

  return (
    <div className="contents sm:block sm:min-w-0 sm:flex-1">
      {/* Three modes on one line; the record button is a sibling, not a wrapped
          leftover. It says Runners record, not "Results": this bar sits over a
          table behind a filter, where "results" is read as the rows that
          matched, and the modal is only ever about Runners even while another
          mode is selected. "Performance" is taken — it is a whole nav hub — and
          in trading it promises a P&L the page does not show. Same words on a
          phone: "Record" on its own reads like a button that starts recording,
          and the label measures ~110px against a ~118px column at 320px. */}
      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:items-center sm:gap-1.5">
        <div className="col-span-3 min-w-0 sm:flex-1">
          <SegGroup
            size="touch"
            fill="mobile"
            // !p-px, not the shell's default 2px: a 40/28px segment inside a
            // 1px track and a 1px border is exactly the 44/32 every other
            // control in this console is, so the mode rail sits on the same
            // top and bottom line as the buttons beside it. Local, because the
            // shell is shared with eleven other pages.
            className="w-full !p-px"
            aria-label="Desk mode"
            value={modeValue}
            onChange={onMode}
            options={modeOptions}
          />
        </div>
        {/* Only while Runners is on, because outside it the words mean
            nothing and a dead control is worse than a missing one. */}
        {showRecipes && modeValue === "full_tp" && onToggleTopRunners ? (
          <button
            type="button"
            aria-pressed={topRunnersOnly}
            className={`${deskChipClass(topRunnersOnly)} justify-center !px-2 sm:!px-2.5`}
            title="Only the Runners carrying the day's leading runner tag when they were posted"
            onClick={onToggleTopRunners}
          >
            <span aria-hidden="true">★</span>
            <span>Top only</span>
            {topRunnersCount > 0 ? (
              <span className={deskBadgeClass(topRunnersOnly)}>{topRunnersCount}</span>
            ) : null}
          </button>
        ) : null}
        {showRecipes ? (
          <button
            type="button"
            className={`${deskChipClass(resultsOpen)} justify-center !px-2 sm:!px-2.5`}
            title="Closed-call record of Runners vs the unfiltered desk"
            onClick={() => setResultsOpen(true)}
          >
            Runners record
          </button>
        ) : null}
      </div>

      <Modal
        isOpen={resultsOpen}
        onClose={() => setResultsOpen(false)}
        size="desk"
        eyebrow="Signals desk"
        title="Runners record"
        subtitle="How Runners finished next to every call — each day replayed with only what was known that day."
      >
        <RunnersResults
          stats={huntByDays[huntDays] || huntStats}
          loading={huntLoading}
          error={huntError}
          windowValue={huntDays}
          onWindow={setHuntDays}
          windowOptions={[
            { key: "7", label: "7d" },
            { key: "30", label: "30d" },
            { key: "0", label: "All since Jun" },
          ]}
          fallback={
            <HuntResults
              stats={huntByDays[huntDays] || huntStats}
              loading={huntLoading}
              error={huntError}
              windowValue={huntDays}
              onWindow={setHuntDays}
              windowOptions={[
                { key: "7", label: "7d" },
                { key: "30", label: "30d" },
                { key: "0", label: "All time" },
              ]}
            />
          }
        />
      </Modal>

      <ModeGuideModal
        // "__browse" opens the guide from the Mode label: same briefings,
        // steppable through All / Runners / Watchlist without applying a mode.
        mode={
          guideMode && guideMode !== "__current" && guideMode !== "__browse"
            ? guideMode
            : modeValue
        }
        browse={guideMode === "__browse"}
        showRecipes={showRecipes}
        isOpen={!!guideMode}
        onClose={() => setGuideMode(null)}
        huntStats={huntByDays[huntDays] || huntStats}
        huntLoading={huntLoading}
        huntError={huntError}
        huntDays={huntDays}
        onHuntDays={setHuntDays}
        onDeskGuide={onDeskGuide}
        onTutorials={onTutorials}
        onMoreDetail={
          showRecipes
            ? () => {
                // One sheet at a time — hand off to the deep explainer.
                setGuideMode(null);
                setExplainId("full_tp");
              }
            : undefined
        }
      />

      {explainId ? (
        <RecipeExplainModal
          recipeId={explainId}
          onChangeRecipe={setExplainId}
          onClose={() => setExplainId(null)}
          huntStats={huntByDays[huntDays] || huntStats}
          huntLoading={huntLoading}
          huntError={huntError}
          onApply={(id) => {
            const r = builtins.find((x) => x.id === id);
            if (r) applyBuiltin(r);
            setExplainId(null);
          }}
        />
      ) : null}
    </div>
  );
}
