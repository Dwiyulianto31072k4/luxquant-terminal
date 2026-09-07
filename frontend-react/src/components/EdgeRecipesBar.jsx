// EdgeRecipesBar — desk mode rail: All · Hunt · Strongest · Watchlist.
// Stats live in the explain panel. Hunt is a mode; day/search are slices.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildRunnerTagSet } from "./EdgePlaybook";
import RecipeExplainModal from "./RecipeExplainModal";
import ModeGuideModal, { isModeGuideMuted } from "./ModeGuideModal";
import { SegGroup, deskGhostClass } from "./ui/SegGroup";
import edgeLabApi from "../services/edgeLabApi";

const SAVED_KEY = "lq:edge-recipes:v1";

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function persistSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* ignore quota */
  }
}

/** Desk default: no Hunt / Strongest / watchlist. Day and search are slices — not here. */
export const ALL_MODE_STATE = {
  selectedTags: [],
  tagMatchMode: "any",
  verdictFilter: "all",
  statusFilter: "all",
  riskFilter: "all",
  streakFilter: "all",
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
    verdictFilter: s.verdictFilter || "all",
    statusFilter: s.statusFilter || "all",
    riskFilter: s.riskFilter || "all",
    streakFilter: s.streakFilter || "all",
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
 * while Hunt was on made the bar go dark and claim Hunt was off, while every
 * one of its filters was still applied and still listed in the chip bar. Dates
 * are not even captured — they are a slice, so Today then Hunt must stay on
 * Today. The recipe is defined by the filters it sets — tags, verdict, status,
 * risk, streak, correlation and the sort chain — so only those decide.
 *
 * The bar used to STORE which recipe was clicked, and persist it. That made the
 * highlight drift the moment anything else touched the filters: "Clear all"
 * wiped every filter while the bar kept insisting "Hunt is on", and localStorage
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
    a.verdictFilter === b.verdictFilter &&
    a.statusFilter === b.statusFilter &&
    a.riskFilter === b.riskFilter &&
    a.streakFilter === b.streakFilter &&
    a.corrDecoupled === b.corrDecoupled &&
    a.corrHighAlign === b.corrHighAlign
  );
}

export default function EdgeRecipesBar({
  tagWr = [],
  selectedTags = [],
  tagMatchMode = "any",
  verdictFilter = "all",
  statusFilter = "all",
  riskFilter = "all",
  streakFilter = "all",
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
  /** "modes" is the desk rail; "views" is just the saved-view list, which the
   *  filter sheet renders. Same component so the list has one owner. */
  variant = "modes",
  guideMode: guideModeProp = null,
  onGuideMode,
  onDeskGuide,
  onTutorials,
}) {
  const [saved, setSaved] = useState(() => loadSaved());
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [explainId, setExplainId] = useState(null);
  // Controlled by SignalsPage when it wants the ? on the search row to open
  // the briefing; otherwise this component keeps its own.
  const [guideModeLocal, setGuideModeLocal] = useState(null);
  const guideMode = onGuideMode ? guideModeProp : guideModeLocal;
  const setGuideMode = onGuideMode || setGuideModeLocal;
  const [huntDays, setHuntDays] = useState("0");
  const [huntByDays, setHuntByDays] = useState({});
  const huntByDaysRef = useRef(huntByDays);
  huntByDaysRef.current = huntByDays;
  const [huntLoading, setHuntLoading] = useState(false);
  const [huntError, setHuntError] = useState(false);

  const huntStats = huntByDays[huntDays] || huntByDays["0"] || null;

  useEffect(() => {
    if (!showRecipes) return undefined;
    if (guideMode !== "full_tp" && explainId !== "full_tp") return undefined;
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
  }, [guideMode, explainId, huntDays, showRecipes]);

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
        id: "strongest",
        icon: "◆",
        label: "Strongest setups",
        hint: "Open · Worth · Verdict→Edge→Called",
        tone: "accent",
        build: () => ({
          selectedTags: [],
          tagMatchMode: "any",
          verdictFilter: "worth_it",
          statusFilter: "open",
          riskFilter: "all",
          streakFilter: "all",
          sortBy: "verdict",
          sortOrder: "desc",
          sorts: [
            { field: "verdict", order: "desc" },
            { field: "edge_score", order: "desc" },
            { field: "created_at", order: "desc" },
          ],
          searchPair: "",
          corrDecoupled: false,
          corrHighAlign: false,
        }),
      },
      {
        id: "full_tp",
        icon: "▲",
        label: "Hunt full TP",
        hint: "Runner tags · Worth · Edge→Called",
        tone: "positive",
        build: () => ({
          selectedTags: runnerTags.length ? runnerTags : [],
          tagMatchMode: "any",
          verdictFilter: "worth_it",
          statusFilter: "all",
          riskFilter: "all",
          streakFilter: "all",
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
          verdictFilter: "all",
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
        verdictFilter,
        statusFilter,
        riskFilter,
        streakFilter,
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
      verdictFilter,
      statusFilter,
      riskFilter,
      streakFilter,
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
    for (const r of saved) {
      if (r?.state && sameRecipeState(liveState, captureRecipeState(r.state))) return r.id;
    }
    return null;
  }, [liveState, builtins, saved, watchlistActive]);

  const applyBuiltin = (r) => {
    onApplyState?.(r.build());
  };

  const applySaved = (r) => {
    if (!r?.state) return;
    onApplyState?.(r.state);
  };

  const handleSave = () => {
    const name = (saveName || "").trim().slice(0, 40);
    if (!name) return;
    const state = captureRecipeState({
      selectedTags,
      tagMatchMode,
      verdictFilter,
      statusFilter,
      riskFilter,
      streakFilter,
      sortBy,
      sortOrder,
      sorts,
      searchPair,
      corrDecoupled,
      corrHighAlign,
    });
    const id = `user_${Date.now().toString(36)}`;
    const next = [{ id, name, state, savedAt: new Date().toISOString() }, ...saved].slice(0, 12);
    setSaved(next);
    persistSaved(next);
    setSaveName("");
    setShowSave(false);
  };

  const removeSaved = (id) => {
    const next = saved.filter((x) => x.id !== id);
    setSaved(next);
    persistSaved(next);
  };

  const modeValue = watchlistActive
    ? "watchlist"
    : activeId === "full_tp" || activeId === "strongest"
      ? activeId
      : "all";

  const modeOptions = [
    { key: "all", label: "All", title: "Every call in the selected day" },
    ...(showRecipes
      ? [
          { key: "full_tp", label: "Hunt", title: "Setups that historically ran to later targets" },
          {
            key: "strongest",
            label: "Strongest",
            title: "Open Worth calls, ranked by the pair’s track record",
          },
        ]
      : []),
    {
      key: "watchlist",
      label: "Watchlist",
      title: "Starred calls — any day, not just the last 7",
      badge: watchlistCount > 0 ? watchlistCount : null,
      // Four equal segments have exactly enough room for "STRONGEST" on a
      // 360px phone and not a pixel more. The count is the one piece of
      // content only one segment carries — Apple's "keep segment content
      // consistent" — and the results line under the console already says
      // "4 / 727 signals", so it costs nothing to hold it back until sm.
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

  const onGuideSelect = (key) => {
    applyModeKey(key);
    setGuideMode(key);
  };

  // Saved views moved into the filter sheet, where their subject is. Rendering
  // them from here keeps one owner of the localStorage list and of activeId.
  const savedViews = (
    <div className="flex flex-wrap items-center gap-1">
      {saved.map((r) => (
        <span key={r.id} className="inline-flex items-center">
          <button
            type="button"
            onClick={() => applySaved(r)}
            className={`${deskGhostClass({ bordered: true })} ${
              !watchlistActive && activeId === r.id ? "bg-surface-secondary text-text-primary" : ""
            }`}
          >
            {r.name}
          </button>
          <button
            type="button"
            onClick={() => removeSaved(r.id)}
            className="px-1 font-mono text-[11px] text-text-muted hover:text-loss"
            aria-label={`Delete ${r.name}`}
          >
            ×
          </button>
        </span>
      ))}
      {!showSave ? (
        <button
          type="button"
          onClick={() => setShowSave(true)}
          className={deskGhostClass({ bordered: true })}
        >
          + Save this view
        </button>
      ) : (
        <span className="inline-flex items-center gap-1">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setShowSave(false);
            }}
            placeholder="Name…"
            maxLength={40}
            className="h-10 w-28 rounded-md border border-ink/[0.1] bg-surface-secondary px-2 font-mono text-[11px] text-text-primary outline-none focus:border-ink/20 sm:h-8"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!saveName.trim()}
            className={deskGhostClass({ bordered: true })}
          >
            Save
          </button>
        </span>
      )}
    </div>
  );

  if (variant === "views") return savedViews;

  return (
    <div>
      {/* Mode is the primary control on this desk, so it gets the full width of
          the card and four equal segments — the count Apple caps a phone
          segmented control at. Nothing else shares this rail any more: help
          moved to the search row, saved views into the filter sheet. */}
      <SegGroup
        size="touch"
        fill="mobile"
        aria-label="Desk mode"
        value={modeValue}
        onChange={onMode}
        options={modeOptions}
      />

      <ModeGuideModal
        mode={guideMode && guideMode !== "__current" ? guideMode : modeValue}
        isOpen={!!guideMode}
        onClose={() => setGuideMode(null)}
        onSelectMode={onGuideSelect}
        showRecipes={showRecipes}
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
