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
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";

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
  <div className="animate-[lqFadeIn_.25s_ease]" role="status" aria-label="Loading view">
    <ShimmerStyles />
    <div className="mb-5 space-y-2">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-6 w-48 max-w-[60%]" />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-lg border border-white/[0.06] p-4 space-y-2.5">
          <Skeleton className="h-2 w-14" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
    <Skeleton className="h-[300px] w-full" />
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

  return (
    <div>
      {/* mobile: group segmented control + horizontally-scrollable sub-tabs */}
      <div className="lg:hidden sticky top-16 z-30 -mx-4 px-4 pt-2 pb-3 mb-4 bg-[#0a0506]/95 backdrop-blur border-b border-white/[0.06] space-y-2.5">
        {/* group segmented */}
        <div className="flex gap-1 p-0.5 bg-[#0d0a08] rounded-lg border border-white/[0.06]">
          {GROUPS.map((g) => {
            const on = g.view === view;
            return (
              <button
                key={g.view}
                onClick={() => setNav(g.view, DEFAULT_TAB[g.view])}
                className={`flex-1 rounded-[7px] py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-all ${
                  on
                    ? "bg-gold-primary text-[#1a1206] font-semibold shadow-[0_2px_10px_-2px_rgba(212,168,83,0.5)]"
                    : "text-text-muted active:bg-white/[0.04]"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* sub-tabs — scrollable pills (only when the group has >1 destination) */}
        {group.items.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {group.items.map((it) => {
              const on = it.tab === tab;
              return (
                <button
                  key={it.tab}
                  onClick={() => setNav(view, it.tab)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 font-mono text-[11px] whitespace-nowrap border transition-all ${
                    on
                      ? "border-gold-primary/40 bg-gold-primary/[0.12] text-gold-light font-medium"
                      : "border-white/[0.07] bg-white/[0.02] text-white/55 active:text-white"
                  }`}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

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

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="performance" />
    </div>
  );
};

export default PerformanceHub;
