// EdgeRecipesBar — Quick path recipes (English) + saved views + first-visit coach.
// Opt-in only: full signal list stays unfiltered until the user picks a recipe.

import { useEffect, useMemo, useState } from "react";
import { buildRunnerTagSet } from "./EdgePlaybook";

const COACH_KEY = "lq:edge-coach:v1";
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
  onScrollToPlaybook,
}) {
  const [saved, setSaved] = useState(() => loadSaved());
  const [activeId, setActiveId] = useState(() => loadActiveId());
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [coach, setCoach] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COACH_KEY) === "1") return undefined;
    } catch {
      /* show coach */
    }
    setCoach(true);
    const t = setTimeout(() => {
      setCoach(false);
      try {
        localStorage.setItem(COACH_KEY, "1");
      } catch {
        /* ignore */
      }
    }, 15000);
    return () => clearTimeout(t);
  }, []);

  const dismissCoach = () => {
    setCoach(false);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const runnerTags = useMemo(() => {
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
  }, [tagWr]);

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

  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl border border-ink/[0.1] bg-surface-raised shadow-[0_1px_0_rgb(var(--ink)/0.04)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold tracking-tight text-text-primary">
                Quick path
              </h2>
              <span className="rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                Edge Score · since tags
              </span>
              {filteredCount != null && activeId && (
                <span className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-accent">
                  {filteredCount} shown
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-text-muted">
              Pick a recipe to shortlist · table sorts by Edge Score · click any pair. Full list stays
              open until you opt in.{" "}
              <button
                type="button"
                onClick={() => onScrollToPlaybook?.()}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Scroll to graph
              </button>
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 rounded-lg border border-ink/[0.12] bg-ink/[0.02] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-ink/20 hover:text-text-primary"
          >
            Reset
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {builtins.map((r) => {
            const active = activeId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                title={r.hint}
                onClick={() => applyBuiltin(r)}
                className={`group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${toneBorder(
                  r.tone,
                  active
                )} ${active ? "font-semibold" : ""}`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] ${
                    active
                      ? r.tone === "warn"
                        ? "bg-loss/15 text-loss"
                        : r.tone === "positive"
                          ? "bg-positive/15 text-positive"
                          : "bg-accent/20 text-accent"
                      : "bg-ink/[0.05] text-text-muted group-hover:text-text-primary"
                  }`}
                  aria-hidden
                >
                  {r.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight tracking-tight">
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal leading-snug text-text-muted">
                    {r.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/[0.06] pt-2.5">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
            My views
          </span>
          {saved.length === 0 && !showSave && (
            <span className="text-[11.5px] text-text-muted">None yet</span>
          )}
          {saved.map((r) => (
            <span
              key={r.id}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] ${
                activeId === r.id
                  ? "border-accent/40 bg-accent/12 text-text-primary"
                  : "border-ink/[0.1] bg-ink/[0.02] text-text-primary/90"
              }`}
            >
              <button
                type="button"
                onClick={() => applySaved(r)}
                className="font-medium hover:text-accent"
                title="Apply saved view"
              >
                {r.name}
              </button>
              <button
                type="button"
                onClick={() => removeSaved(r.id)}
                className="text-text-muted hover:text-loss"
                title="Delete"
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
              className="rounded-lg border border-dashed border-ink/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:border-accent/30 hover:text-accent"
            >
              + Save current
            </button>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSave(false);
                }}
                placeholder="Name this view…"
                maxLength={40}
                className="w-40 rounded-md border border-ink/15 bg-surface-raised px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent/40"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="rounded-md border border-accent/35 bg-accent/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSave(false);
                  setSaveName("");
                }}
                className="rounded-md border border-ink/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted"
              >
                Cancel
              </button>
            </span>
          )}
        </div>

        <p className="mt-2.5 text-[11px] leading-snug text-text-muted">
          <span className="font-medium text-text-primary/75">Edge Score</span> = long-history prior
          (tags since 2026-03-10 that won / hit full TP), applied to signals when they arrive — not
          “only last 7 days of learning.” Desk list is just what you can act on now. Not a
          guarantee — manage your own risk.
        </p>
      </div>

      {coach && (
        <div className="absolute inset-x-3 top-2 z-20 sm:inset-x-auto sm:left-5 sm:max-w-sm">
          <div className="rounded-xl border border-accent/35 bg-surface-raised p-3.5 shadow-lg shadow-ink/15">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-text-primary">15-second tip</p>
              <button
                type="button"
                onClick={dismissCoach}
                className="font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
              >
                Dismiss
              </button>
            </div>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12px] leading-snug text-text-primary/90">
              <li>
                Tap <strong>Strongest setups</strong> for a ranked open shortlist.
              </li>
              <li>
                Read the <strong>Edge</strong> column — hover for why.
              </li>
              <li>
                Use the <strong>knowledge graph</strong> below to drill tags.{" "}
                <strong>Reset</strong> anytime for the full list.
              </li>
            </ol>
            <button
              type="button"
              onClick={dismissCoach}
              className="mt-2.5 w-full rounded-lg border border-accent/30 bg-accent/12 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-accent/20"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
