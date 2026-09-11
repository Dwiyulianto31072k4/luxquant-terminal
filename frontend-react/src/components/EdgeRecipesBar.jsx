// EdgeRecipesBar — desk mode rail: All · Runners · Watchlist.
// Stats live in the explain panel. A mode is a mode; day/search are slices.
//
// The Runners key stays `full_tp` — analytics and older links still use it.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildRunnerTagSet } from "./EdgePlaybook";
import RecipeExplainModal, { HuntResults } from "./RecipeExplainModal";
import ModeGuideModal, { isModeGuideMuted } from "./ModeGuideModal";
import Modal from "./ui/Modal";
import { SegGroup, deskChipClass } from "./ui/SegGroup";
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
 * risk, streak, correlation and the sort chain — so only those decide.
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
  const sa = a.sorts || [];
  const sb = b.sorts || [];
  if (sa.length !== sb.length) return false;
  if (sa.some((x, i) => x.field !== sb[i].field || x.order !== sb[i].order)) return false;
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
  watchlistCount = 0,
  watchlistActive = false,
  onWatchlist,
  guideMode: guideModeProp = null,
  onGuideMode,
  onDeskGuide,
  onTutorials,
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

  const runnerTags = useMemo(() => {
    const fromApi = huntStats?.runner_tags;
    if (Array.isArray(fromApi) && fromApi.length) return fromApi;
    const set = buildRunnerTagSet(tagWr);
    return (tagWr || [])
      .filter((t) => set.has(t.tag))
      .sort(
        (a, b) =>
          (Number(b.full_tp_rate) || 0) - (Number(a.full_tp_rate) || 0) ||
          (Number(b.win_rate) || 0) - (Number(a.win_rate) || 0)
      )
      .slice(0, 4)
      .map((t) => t.tag);
  }, [tagWr, huntStats]);

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
        hint: "Runner tags · top 20% Edge",
        tone: "positive",
        // Two conditions, and both are measured. Walk-forward over 8,674
        // scored calls with tag stats and the runner gate rebuilt from past
        // outcomes only at every step:
        //
        //   baseline                        win 85.88%  TP3+ 44.57%  SL 14.12%
        //   runner tag alone, 52.7% of book win 87.49%  TP3+ 48.68%  SL 12.51%
        //   top-20% Edge, NO runner tag     win 85.58%  TP3+ 47.49%  SL 14.42%
        //   runner tag AND top-20% Edge     win 89.53%  TP3+ 51.47%  SL 10.47%
        //
        // The tag alone kept HALF the desk for +1.6pp, which is not a
        // shortlist. And it is not redundant either: the Edge cut on its own
        // buys upside and no downside -- win rate and SL rate both land on the
        // baseline -- while adding the tag lifts win 85.58 -> 89.53 and cuts
        // SL 14.42 -> 10.47. Edge selects; the tag guards.
        //
        // Those numbers are the CLEAN subset on purpose. 47.5% of tag-era
        // entry snapshots were written in a bulk backfill on 6-9 June 2026,
        // up to 90 days after the call, and the enricher reads the latest
        // candles -- so those rows carry June's facts, not the call's. Measured
        // across both populations the same combination reads 90.58 / 50.89 /
        // 9.42; every conclusion holds, the edge is just smaller than the
        // mixed data claims.
        //
        // statusFilter stays `all`: classification is at publish. Open (has
        // not hit yet) is a chip, not this mode — tp1/tp2 stay on the shortlist.
        build: () => ({
          selectedTags: runnerTags.length ? runnerTags : [],
          tagMatchMode: "any",
          statusFilter: "all",
          riskFilter: "all",
          streakFilter: "all",
          edgeTop: 20,
          sortBy: "edge_score",
          sortOrder: "desc",
          sorts: [
            { field: "edge_score", order: "desc" },
            { field: "created_at", order: "desc" },
          ],
          searchPair: "",
          corrDecoupled: false,
          corrHighAlign: false,
        }),
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
    [runnerTags, cautionTags]
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

  const modeValue = watchlistActive
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
      if (modeValue !== "all") onApplyState?.(ALL_MODE_STATE);
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
    <div className="min-w-0 flex-1">
      {/* Three modes on one line; Results is a sibling, not a wrapped leftover. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <SegGroup
            size="sm"
            fill="mobile"
            className="w-full"
            aria-label="Desk mode"
            value={modeValue}
            onChange={onMode}
            options={modeOptions}
          />
        </div>
        {showRecipes ? (
          <button
            type="button"
            className={`${deskChipClass(resultsOpen)} !h-8 !px-2 sm:!h-7 sm:!px-2.5`}
            title="Closed-call record of Runners vs the unfiltered desk"
            onClick={() => setResultsOpen(true)}
          >
            Results
          </button>
        ) : null}
      </div>

      <Modal
        isOpen={resultsOpen}
        onClose={() => setResultsOpen(false)}
        size="lg"
        eyebrow="Runners"
        title="Vs no filter"
        subtitle="Closed calls only. How the runner-tag mix finished, next to the unfiltered desk."
      >
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
