// src/components/PerformanceHub.jsx
// ════════════════════════════════════════════════════════════════
// Unified Performance hub — Stripe/Vercel-style sub-sidebar layout.
//
//   Left: a sub-navigation sidebar (sticky) grouping every view —
//         Overview · Daily (5) · Research (7) — 13 destinations in 3
//         groups. Google-Analytics pattern: the ACTIVE group is always
//         expanded; other groups collapse to their header and expand on
//         click. No stacked tab rows anywhere.
//   Right: the active page, rendered with its in-page tab bar hidden
//          (hideTabBar) and its active sub-tab driven from here.
//
//   URL: ?view=<overview|daily|research>&tab=<subtab> — every view is
//        shareable/bookmarkable. Back/forward works.
//
//   Mobile (<lg): the sidebar collapses to a single dropdown above the
//        content (sidebar doesn't fit a narrow viewport).
// ════════════════════════════════════════════════════════════════
import { Suspense, lazy, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const AnalyzePage = lazy(() => import("./AnalyzePage"));
const DailyPerformancePage = lazy(() => import("./DailyPerformancePage"));
const EdgeLabPage = lazy(() => import("./EdgeLabPage"));

const GROUPS = [
  {
    view: "overview",
    label: "All-Time",
    note: "Lifetime track record",
    items: [{ tab: "_", label: "All-Time" }],
  },
  {
    view: "daily",
    label: "Daily",
    note: "Today's resolved signals",
    items: [
      { tab: "overview", label: "Overview" },
      { tab: "patterns", label: "By Pattern" },
      { tab: "correlation", label: "Correlation" },
      { tab: "sectors", label: "By Sector" },
      { tab: "edge", label: "Today's Edge" },
    ],
  },
  {
    view: "research",
    label: "Research",
    note: "Multi-day patterns",
    items: [
      { tab: "calibration", label: "Calibration" },
      { tab: "btc_heatmap", label: "Pattern × BTC" },
      { tab: "ev", label: "Expected Value" },
      { tab: "calendar", label: "Calendar" },
      { tab: "timing", label: "Timing" },
      { tab: "coins", label: "Coins" },
      { tab: "wrbtc", label: "WR × BTC" },
    ],
  },
];

const DEFAULT_TAB = { overview: "_", daily: "overview", research: "calibration" };

const ViewLoader = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        Loading…
      </span>
    </div>
  </div>
);

const PerformanceHub = () => {
  const [params, setParams] = useSearchParams();

  const rawView = (params.get("view") || "overview").toLowerCase();
  const view = GROUPS.some((g) => g.view === rawView) ? rawView : "overview";
  const group = GROUPS.find((g) => g.view === view);

  const rawTab = params.get("tab");
  const validTabs = group.items.map((i) => i.tab);
  const tab = validTabs.includes(rawTab) ? rawTab : DEFAULT_TAB[view];

  const setNav = (nextView, nextTab) => {
    const next = new URLSearchParams(params);
    next.set("view", nextView);
    if (nextTab && nextTab !== "_") next.set("tab", nextTab);
    else next.delete("tab");
    setParams(next, { replace: false });
  };

  // Group expand state — independent toggles. All groups start open; the
  // active group is forced open; switching views never collapses others.
  // A group only closes when its chevron is explicitly clicked.
  const [openGroups, setOpenGroups] = useState(() =>
    GROUPS.filter((g) => g.items.length > 1).map((g) => g.view)
  );
  const toggleGroup = (v) =>
    setOpenGroups((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  // keep the active group open whenever the view changes
  useEffect(() => {
    setOpenGroups((prev) => (prev.includes(view) ? prev : [...prev, view]));
  }, [view]);

  // mobile bottom-sheet open/close. Close on Escape; lock body scroll while open.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e) => e.key === "Escape" && setSheetOpen(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sheetOpen]);

  // labels for the mobile trigger button
  const activeItem = group.items.find((i) => i.tab === tab) || group.items[0];
  const triggerCurrent = group.items.length === 1 ? group.label : activeItem.label;

  return (
    <div>
      {/* mobile: sticky trigger button (custom, non-native) */}
      <div className="lg:hidden sticky top-16 z-30 -mx-4 px-4 py-2.5 mb-4 bg-[#0a0506]/95 backdrop-blur border-b border-white/[0.05]">
        <button
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center gap-3 bg-[#15100a] border border-gold-primary/25 rounded-xl px-4 py-3 text-left active:border-gold-primary/40 transition-colors"
        >
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-gold-primary/70">
              {group.label}
            </div>
            <div className="text-[15px] font-semibold text-white truncate mt-0.5">
              {triggerCurrent}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
            <span
              className="h-1.5 w-1.5 rounded-full bg-gold-primary"
              style={{ boxShadow: "0 0 6px rgba(212,168,83,0.7)" }}
            />
            <svg
              className="w-3 h-3 text-gold-primary/70"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </button>
      </div>

      {/* mobile: bottom sheet */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSheetOpen(false)}
          />
          {/* sheet */}
          <div className="absolute left-0 right-0 bottom-0 max-h-[80%] flex flex-col bg-[#0c0908] border-t border-gold-primary/20 rounded-t-[18px] overflow-hidden shadow-2xl">
            <div className="mx-auto mt-2.5 mb-1 h-1 w-9 rounded-full bg-white/20" />
            <div className="px-[18px] pt-1.5 pb-3 border-b border-white/[0.06]">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                Jump to view
              </span>
            </div>
            <div className="overflow-y-auto px-2.5 pb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {GROUPS.map((g) => (
                <div key={g.view}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-gold-primary/60 px-2.5 pt-3.5 pb-1.5">
                    {g.label}
                  </div>
                  {g.items.map((it) => {
                    const on = g.view === view && it.tab === tab;
                    const label = g.items.length === 1 ? g.label : it.label;
                    return (
                      <button
                        key={`${g.view}::${it.tab}`}
                        onClick={() => {
                          setNav(g.view, it.tab);
                          setSheetOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-left transition-colors ${
                          on ? "bg-gold-primary/10" : "active:bg-white/[0.04]"
                        }`}
                      >
                        <span
                          className={`h-[7px] w-[7px] rounded-full border flex-shrink-0 ${
                            on
                              ? "border-gold-primary bg-gold-primary"
                              : "border-white/25"
                          }`}
                          style={
                            on
                              ? { boxShadow: "0 0 6px rgba(212,168,83,0.6)" }
                              : undefined
                          }
                        />
                        <span
                          className={`text-[15px] ${
                            on
                              ? "text-gold-light font-semibold"
                              : "text-white/75"
                          }`}
                        >
                          {label}
                        </span>
                        {on && (
                          <svg
                            className="ml-auto w-4 h-4 text-gold-primary flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* desktop sub-sidebar */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <nav className="sticky top-20 space-y-1">
            {GROUPS.map((g) => {
              const isActiveGroup = g.view === view;
              const single = g.items.length === 1;
              const expanded = !single && openGroups.includes(g.view);
              return (
                <div key={g.view}>
                  {/* group header — chevron toggles open/closed; label navigates */}
                  <div
                    className={`group/header w-full flex items-center gap-1.5 pr-2 rounded-md transition-colors ${
                      isActiveGroup ? "" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* chevron — independent expand/collapse toggle */}
                    {!single ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(g.view);
                        }}
                        className="flex items-center justify-center w-6 h-7 flex-shrink-0 -mr-1"
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        <svg
                          className={`w-2.5 h-2.5 transition-all duration-200 ${
                            expanded ? "rotate-90" : ""
                          } ${
                            isActiveGroup
                              ? "text-gold-primary/70"
                              : "text-white/30 group-hover/header:text-white/50"
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-5 flex-shrink-0" />
                    )}
                    {/* label — navigates into the group's default tab */}
                    <button
                      onClick={() => setNav(g.view, DEFAULT_TAB[g.view])}
                      className="flex-1 text-left py-1.5"
                    >
                      <span
                        className={`font-mono text-[11px] uppercase tracking-[0.18em] font-semibold transition-colors ${
                          isActiveGroup
                            ? "text-gold-primary/90"
                            : "text-white/45 group-hover/header:text-white/70"
                        }`}
                      >
                        {g.label}
                      </span>
                    </button>
                  </div>

                  {/* items — connected to the parent by a vertical rail */}
                  {expanded && (
                    <div className="mt-0.5 mb-2 ml-[19px] pl-[11px] border-l border-white/[0.08] flex flex-col gap-0.5">
                      {g.items.map((it) => {
                        const on = it.tab === tab && isActiveGroup;
                        return (
                          <button
                            key={it.tab}
                            onClick={() => setNav(g.view, it.tab)}
                            className={`group relative w-full text-left flex items-center px-2.5 py-[7px] rounded-md transition-colors ${
                              on
                                ? "bg-gold-primary/[0.1]"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            {on && (
                              <span
                                className="absolute -left-[12px] top-[7px] bottom-[7px] w-[2px] rounded-full"
                                style={{
                                  background: "rgb(212,168,83)",
                                  boxShadow: "0 0 6px rgba(212,168,83,0.6)",
                                }}
                              />
                            )}
                            <span
                              className={`text-[13px] tracking-tight transition-colors ${
                                on
                                  ? "text-gold-light font-medium"
                                  : "text-white/55 group-hover:text-white"
                              }`}
                            >
                              {it.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* content */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={<ViewLoader />}>
            {view === "overview" && <AnalyzePage />}
            {view === "daily" && (
              <DailyPerformancePage
                activeTab={tab}
                onTabChange={(t) => setNav("daily", t)}
                hideTabBar
              />
            )}
            {view === "research" && (
              <EdgeLabPage
                activeTab={tab}
                onTabChange={(t) => setNav("research", t)}
                hideTabBar
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default PerformanceHub;
