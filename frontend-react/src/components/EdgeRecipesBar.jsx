// EdgeRecipesBar — compact Hunt / Strongest chips. Stats live in the explain modal.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildRunnerTagSet } from "./EdgePlaybook";
import RecipeExplainModal, { HuntResults } from "./RecipeExplainModal";
import { SegGroup } from "./ui/SegGroup";
import edgeLabApi from "../services/edgeLabApi";

const HUNT_WINDOWS = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "0", label: "All time" },
];

function prettyDay(iso) {
  if (!iso) return "10 Mar 2026";
  const p = String(iso).split("-");
  if (p.length !== 3) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(p[2], 10)} ${months[parseInt(p[1], 10) - 1] || p[1]} ${p[0]}`;
}

const SAVED_KEY = "lq:edge-recipes:v1";
const ACTIVE_KEY = "lq:edge-active-recipe:v1";

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

function loadActiveId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

function persistActiveId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

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
  filteredCount = null,
  onApplyState,
  onReset,
  onScrollToPlaybook: _onScrollToPlaybook,
}) {
  const [saved, setSaved] = useState(() => loadSaved());
  const [activeId, setActiveId] = useState(() => loadActiveId());
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [explainId, setExplainId] = useState(null);
  const [readOpen, setReadOpen] = useState(false);
  const [huntDays, setHuntDays] = useState("0");
  const [huntByDays, setHuntByDays] = useState({});
  const huntByDaysRef = useRef(huntByDays);
  huntByDaysRef.current = huntByDays;
  const [huntLoading, setHuntLoading] = useState(false);
  const [huntError, setHuntError] = useState(false);

  const huntStats = huntByDays[huntDays] || huntByDays["0"] || null;

  useEffect(() => {
    const key = readOpen ? huntDays : "0";
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
  }, [readOpen, huntDays]);

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

  const applyBuiltin = (r) => {
    onApplyState?.(r.build());
    setActiveId(r.id);
    persistActiveId(r.id);
  };

  const applySaved = (r) => {
    if (!r?.state) return;
    onApplyState?.(r.state);
    setActiveId(r.id);
    persistActiveId(r.id);
  };

  const handleReset = () => {
    onReset?.();
    setActiveId(null);
    persistActiveId(null);
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
    setActiveId(id);
    persistActiveId(id);
    setSaveName("");
    setShowSave(false);
  };

  const removeSaved = (id) => {
    const next = saved.filter((x) => x.id !== id);
    setSaved(next);
    persistSaved(next);
    if (activeId === id) {
      setActiveId(null);
      persistActiveId(null);
    }
  };

  const toneBorder = (tone, active) => {
    if (active) {
      if (tone === "warn") return "border-loss/40 bg-loss/10 text-text-primary";
      if (tone === "positive") return "border-positive/40 bg-positive/10 text-text-primary";
      return "border-accent/45 bg-accent/15 text-text-primary shadow-[0_0_0_1px_rgb(var(--accent)/0.1)]";
    }
    return "border-ink/[0.1] bg-surface-raised/80 text-text-primary/90 hover:border-ink/20 hover:bg-ink/[0.03]";
  };

  const firstScreen = builtins.filter((r) => r.id === "full_tp" || r.id === "strongest");
  const era = huntStats?.tag_era_start || huntStats?.tags_selected_from?.start;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {firstScreen.map((r) => {
          const active = activeId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              title={r.hint}
              onClick={() => applyBuiltin(r)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all ${toneBorder(
                r.tone,
                active
              )}`}
            >
              <span aria-hidden className="font-mono text-[11px] text-text-muted">
                {r.icon}
              </span>
              {r.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={readOpen}
          aria-label="Read Hunt explanation and results"
          onClick={() => setReadOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-all ${
            readOpen
              ? "border-positive/40 bg-positive/10 text-text-primary"
              : "border-ink/[0.1] bg-surface-raised/80 text-text-primary/90 hover:border-ink/20"
          }`}
        >
          Read
          <span
            className={`text-[10px] text-text-muted transition-transform ${readOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {filteredCount != null && activeId ? (
          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            {filteredCount} shown
          </span>
        ) : null}
        {activeId ? (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
          >
            Reset
          </button>
        ) : null}

        {saved.map((r) => (
          <span
            key={r.id}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
              activeId === r.id
                ? "border-accent/40 bg-accent/12 text-text-primary"
                : "border-ink/[0.1] text-text-muted"
            }`}
          >
            <button type="button" onClick={() => applySaved(r)} className="hover:text-accent">
              {r.name}
            </button>
            <button
              type="button"
              onClick={() => removeSaved(r.id)}
              className="text-text-muted hover:text-loss"
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
            className="rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-accent"
          >
            + View
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setShowSave(false);
              }}
              placeholder="Name…"
              maxLength={40}
              className="w-28 rounded-md border border-ink/15 bg-surface-raised px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent/40"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="font-mono text-[10px] uppercase tracking-wider text-accent disabled:opacity-40"
            >
              Save
            </button>
          </span>
        )}
      </div>

      {readOpen ? (
        <div className="mt-2.5 rounded-xl border border-positive/25 bg-surface-raised p-3 sm:p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 max-w-2xl">
              <p className="text-[13px] font-semibold text-text-primary">Hunt full TP</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-primary/90">
                Shortlist of setups whose <span className="font-medium">entry tags</span> historically
                reached TP3/TP4 more often. Tags are on the call when it is published — not added
                after it already won. Numbers are <span className="font-medium">closed calls only</span>{" "}
                (hit TP or SL), same as Performance. Open calls are not counted.
              </p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-text-muted">
                Evaluated since tags exist ({prettyDay(era)}). All time = that full history. 7d and 30d use
                the <span className="text-text-primary/80">same Hunt tags</span>, scored only on
                closes in that window — so you can see if the edge is still there recently.
              </p>
            </div>
            <SegGroup
              size="sm"
              aria-label="Hunt results window"
              value={huntDays}
              onChange={setHuntDays}
              options={HUNT_WINDOWS}
            />
          </div>
          <div className="mt-3">
            <HuntResults
              stats={huntByDays[huntDays] || null}
              loading={huntLoading}
              error={huntError}
            />
          </div>
          <button
            type="button"
            onClick={() => setExplainId("full_tp")}
            className="mt-2 font-mono text-[10px] uppercase tracking-wider text-accent hover:underline"
          >
            More detail
          </button>
        </div>
      ) : null}

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
