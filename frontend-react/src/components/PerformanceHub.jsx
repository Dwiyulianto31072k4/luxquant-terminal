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
          <nav className="sticky top-20 space-y-5">
            {GROUPS.map((g) => {
              const isActiveGroup = g.view === view;
              const single = g.items.length === 1;
              return (
                <div key={g.view}>
                  <button
                    onClick={() => setNav(g.view, DEFAULT_TAB[g.view])}
                    className="w-full flex items-center gap-2 px-2 mb-1.5 group/header"
                  >
                    <span
                      className={`h-1 w-1 rounded-full flex-shrink-0 transition-colors ${
                        isActiveGroup ? "bg-gold-primary" : "bg-white/25"
                      }`}
                      style={isActiveGroup ? { boxShadow: "0 0 5px rgba(212,168,83,0.5)" } : undefined}
                    />
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
                        isActiveGroup ? "text-gold-primary/85" : "text-white/40 group-hover/header:text-white/70"
                      }`}
                    >
                      {g.label}
                    </span>
                  </button>

                  {isActiveGroup && !single && (
                    <div className="space-y-0.5 pl-1">
                      {g.items.map((it) => {
                        const on = it.tab === tab;
                        return (
                          <button
                            key={it.tab}
                            onClick={() => setNav(g.view, it.tab)}
                            className={`group relative w-full text-left flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-md transition-colors ${
                              on ? "bg-white/[0.05]" : "hover:bg-white/[0.04]"
                            }`}
                          >
                            {on && (
                              <span
                                className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                                style={{ background: "rgb(212,168,83)", boxShadow: "0 0 6px rgba(212,168,83,0.6)" }}
                              />
                            )}
                            <span
                              className={`text-[12.5px] tracking-tight transition-colors ${
                                on ? "text-gold-primary" : "text-white/70 group-hover:text-white"
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
