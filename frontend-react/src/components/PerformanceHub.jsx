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
import { Suspense, lazy, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const AnalyzePage = lazy(() => import("./AnalyzePage"));
const DailyPerformancePage = lazy(() => import("./DailyPerformancePage"));
const EdgeLabPage = lazy(() => import("./EdgeLabPage"));

const GROUPS = [
  {
    view: "overview",
    label: "Overview",
    note: "Lifetime track record",
    items: [{ tab: "_", label: "Track Record" }],
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

  return (
    <div>
      {/* hub eyebrow */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          Performance
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
        {group?.note && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/70">
            {group.note}
          </span>
        )}
      </div>

      {/* mobile: dropdown selector */}
      <div className="lg:hidden mb-5">
        <select
          value={`${view}::${tab}`}
          onChange={(e) => {
            const [v, t] = e.target.value.split("::");
            setNav(v, t);
          }}
          className="w-full bg-[#0a0805] border border-white/[0.1] rounded-md px-3 py-2.5 text-[13px] text-white/90 font-mono focus:outline-none focus:border-gold-primary/40"
        >
          {GROUPS.map((g) => (
            <optgroup key={g.view} label={g.label.toUpperCase()}>
              {g.items.map((it) => (
                <option key={`${g.view}::${it.tab}`} value={`${g.view}::${it.tab}`}>
                  {g.items.length === 1 ? g.label : it.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        {/* desktop sub-sidebar */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <nav className="sticky top-20 space-y-1">
            {GROUPS.map((g) => {
              const isActiveGroup = g.view === view;
              const single = g.items.length === 1;
              const expanded = isActiveGroup && !single;
              return (
                <div key={g.view}>
                  {/* group header — chevron + label + count */}
                  <button
                    onClick={() => setNav(g.view, DEFAULT_TAB[g.view])}
                    className={`group/header w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                      isActiveGroup ? "" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* chevron — rotates when the group is expanded */}
                    <svg
                      className={`w-2.5 h-2.5 flex-shrink-0 transition-all duration-200 ${
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
                    <span
                      className={`font-mono text-[11px] uppercase tracking-[0.18em] font-semibold transition-colors ${
                        isActiveGroup
                          ? "text-gold-primary/90"
                          : "text-white/45 group-hover/header:text-white/70"
                      }`}
                    >
                      {g.label}
                    </span>
                    {!single && (
                      <span
                        className={`ml-auto font-mono text-[10px] transition-colors ${
                          isActiveGroup ? "text-gold-primary/50" : "text-white/25"
                        }`}
                      >
                        {g.items.length}
                      </span>
                    )}
                  </button>

                  {/* items — connected to the parent by a vertical rail */}
                  {expanded && (
                    <div className="mt-0.5 mb-2 ml-[13px] pl-[11px] border-l border-white/[0.08] flex flex-col gap-0.5">
                      {g.items.map((it) => {
                        const on = it.tab === tab;
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
