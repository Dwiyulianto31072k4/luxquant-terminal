// src/components/PerformanceHub.jsx
// ════════════════════════════════════════════════════════════════
// Unified Performance hub — mirrors the LuxQuant Terminal (/terminal/scan)
// "Allium-style" shell so the whole app shares ONE navigation language:
//
// • bordered shell panel, fixed viewport height, internal scroll
// • breadcrumb strip (Performance · <active view>)
// • desktop: grouped icon+label sidebar with a gold active rail
// • mobile: horizontal icon-chip scroller
//
// Groups: All-Time · Daily (5) · Research (7) — 13 destinations.
// URL: ?view=<overview|daily|research>&tab=<subtab> (shareable, back/fwd).
// ════════════════════════════════════════════════════════════════
import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";
import { SegGroup } from "./ui/SegGroup";
import { RouteErrorBoundary } from "./ErrorBoundary";

const AnalyzePage = lazy(() => import("./AnalyzePage"));
const DailyPerformancePage = lazy(() => import("./DailyPerformancePage"));
const EdgeLabPage = lazy(() => import("./EdgeLabPage"));

// ── destinations, grouped like the Terminal sidebar ──────────────
const GROUPS = [
  {
    g: "All-Time",
    note: "Lifetime track record",
    items: [{ id: "alltime", view: "overview", tab: "_", label: "All-Time" }],
  },
  {
    g: "Daily",
    note: "Today's resolved signals",
    items: [
      { id: "d_overview", view: "daily", tab: "overview", label: "Overview" },
      { id: "d_patterns", view: "daily", tab: "patterns", label: "By Pattern" },
      { id: "d_correlation", view: "daily", tab: "correlation", label: "Correlation" },
      { id: "d_sectors", view: "daily", tab: "sectors", label: "By Sector" },
      { id: "d_edge", view: "daily", tab: "edge", label: "Today's Edge" },
    ],
  },
  {
    g: "Research",
    note: "Multi-day patterns",
    items: [
      { id: "r_calibration", view: "research", tab: "calibration", label: "Calibration" },
      { id: "r_btc", view: "research", tab: "btc_heatmap", label: "Pattern × BTC" },
      { id: "r_ev", view: "research", tab: "ev", label: "Expected Value" },
      { id: "r_calendar", view: "research", tab: "calendar", label: "Calendar" },
      { id: "r_timing", view: "research", tab: "timing", label: "Timing" },
      { id: "r_coins", view: "research", tab: "coins", label: "Coins" },
      { id: "r_wrbtc", view: "research", tab: "wrbtc", label: "WR × BTC" },
    ],
  },
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const DEFAULT_TAB = { overview: "_", daily: "overview", research: "calibration" };

// ── per-destination glyphs (gold via currentColor), Terminal-consistent ──
const ICON_PATHS = {
  alltime: (
    <>
      <path d="M6 4h12v3.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" />
      <path
        d="M6 5.2H4.4a1.8 1.8 0 0 0 0 3.6H6M18 5.2h1.6a1.8 1.8 0 0 1 0 3.6H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M11 11.2h2v3.4h-2z" />
      <rect x="8" y="18.5" width="8" height="2.2" rx="0.6" />
    </>
  ),
  d_overview: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" opacity="0.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" opacity="0.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" />
    </>
  ),
  d_patterns: (
    <>
      <rect x="4" y="8" width="3" height="8" rx="1" />
      <path
        d="M5.5 5v3M5.5 16v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="10.5" y="6" width="3" height="11" rx="1" opacity="0.6" />
      <path
        d="M12 3v3M12 17v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <rect x="17" y="10" width="3" height="6" rx="1" />
      <path
        d="M18.5 7v3M18.5 16v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  d_correlation: (
    <>
      <circle cx="6" cy="8" r="2" />
      <circle cx="12" cy="15" r="2" opacity="0.7" />
      <circle cx="18" cy="6" r="2" />
      <path
        d="M3 20 21 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="2 2"
        opacity="0.5"
      />
    </>
  ),
  d_sectors: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" opacity="0.55" />
      <path d="M11 3v8H3a9 9 0 0 1 8-8z" />
    </>
  ),
  d_edge: <path d="M13 2 3 14h7l-1 8 10-12h-7z" />,
  r_calibration: (
    <>
      <circle
        cx="12"
        cy="12"
        r="8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
      />
      <circle cx="12" cy="12" r="2.3" />
      <path
        d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  r_btc: (
    <>
      <circle cx="12" cy="12" r="9.2" opacity="0.5" />
      <path d="M10 7h3.2c1.6 0 2.6 1 2.6 2.3 0 1-.6 1.7-1.4 2 1 .3 1.7 1.1 1.7 2.2 0 1.5-1.1 2.5-2.9 2.5H10zm2 2v2h1.1c.7 0 1.1-.4 1.1-1s-.4-1-1.1-1zm0 3.6V15h1.3c.8 0 1.2-.4 1.2-1.1s-.5-1.1-1.3-1.1zM11 5h1.5v2H11zm0 12h1.5v2H11z" />
    </>
  ),
  r_ev: (
    <>
      <rect x="3" y="14" width="3" height="6" rx="0.8" />
      <rect x="8" y="9" width="3" height="11" rx="0.8" opacity="0.6" />
      <rect x="13" y="5" width="3" height="15" rx="0.8" />
      <rect x="18" y="11" width="3" height="9" rx="0.8" opacity="0.6" />
    </>
  ),
  r_calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" opacity="0.5" />
      <path d="M3 9.5h18" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 2.5v4M16 2.5v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="6.5" y="12.5" width="3" height="3" rx="0.6" />
      <rect x="11" y="12.5" width="3" height="3" rx="0.6" opacity="0.7" />
    </>
  ),
  r_timing: (
    <>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        opacity="0.6"
      />
      <path
        d="M12 7v5l3.4 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  r_coins: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path
        d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 12v3c0 1.7 3.1 3 7 3s7-1.3 7-3v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.6"
      />
    </>
  ),
  r_wrbtc: (
    <>
      <path
        d="M3 17l5-5 4 3 8-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 5h5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};
const TabIcon = ({ id }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-[15px] h-[15px] shrink-0"
    aria-hidden="true"
  >
    {ICON_PATHS[id] || <rect x="4" y="4" width="16" height="16" rx="2" />}
  </svg>
);

const ViewLoader = () => (
  <div className="animate-[lqFadeIn_.25s_ease]" role="status" aria-label="Loading view">
    <ShimmerStyles />
    <div className="mb-5 space-y-2">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-6 w-48 max-w-[60%]" />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-ink/[0.07] p-4 space-y-2.5">
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
  const view = GROUPS.some((g) => g.items.some((i) => i.view === rawView)) ? rawView : "overview";
  const group = GROUPS.find((g) => g.items[0].view === view) || GROUPS[0];

  const rawTab = params.get("tab");
  const validTabs = group.items.map((i) => i.tab);
  const tab = validTabs.includes(rawTab) ? rawTab : DEFAULT_TAB[view];

  const activeItem = ALL_ITEMS.find((i) => i.view === view && i.tab === tab) || ALL_ITEMS[0];
  const activeId = activeItem.id;

  const go = (item) => {
    const next = new URLSearchParams(params);
    next.set("view", item.view);
    if (item.tab && item.tab !== "_") next.set("tab", item.tab);
    else next.delete("tab");
    setParams(next, { replace: false });
  };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden">
      {/* ── breadcrumb strip ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted truncate">
            Performance
          </span>
          <span className="text-text-primary/20">·</span>
          <span className="text-[13px] text-text-primary/90 truncate">{activeItem.label}</span>
        </div>
        <div className="hidden lg:block font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">
          {group.note}
        </div>
      </div>

      {/* ── mobile: desk SegGroup scroller ── */}
      <div className="shrink-0 lg:hidden -mx-3 mb-3 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <SegGroup
          size="sm"
          aria-label="Performance views"
          value={activeId}
          onChange={(id) => {
            const item = ALL_ITEMS.find((i) => i.id === id);
            if (item) go(item);
          }}
          options={ALL_ITEMS.map((item) => ({
            key: item.id,
            label: item.label,
            icon: <TabIcon id={item.id} />,
          }))}
        />
      </div>

      <div className="flex gap-4 items-stretch lg:flex-1 lg:min-h-0">
        {/* ── slim left nav (no boxed panel — Terminal desk language) ── */}
        <aside className="hidden lg:block w-[180px] shrink-0 lg:overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-ink/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          <nav className="space-y-2.5 pr-1">
            {GROUPS.map(({ g, items }) => (
              <div key={g}>
                <div className="mb-1 px-2 font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted/55">
                  {g}
                </div>
                <div className="space-y-px">
                  {items.map((item) => {
                    const on = item.id === activeId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => go(item)}
                        className={`relative flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-2 text-left text-[12px] font-medium transition-colors ${
                          on
                            ? "bg-ink/[0.07] text-text-primary"
                            : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
                        }`}
                      >
                        {on && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-accent" />
                        )}
                        <span className={on ? "text-accent" : "text-text-muted"}>
                          <TabIcon id={item.id} />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── content — own scroll region so the sidebar stays put ── */}
        <main className="flex-1 min-w-0 lg:overflow-y-auto lg:pr-1.5 [scrollbar-width:thin] [scrollbar-color:rgb(var(--accent) / 0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent/25">
          <RouteErrorBoundary>
            <Suspense fallback={<ViewLoader />}>
              {view === "overview" && <AnalyzePage />}
              {view === "daily" && (
                <DailyPerformancePage
                  activeTab={tab}
                  onTabChange={(t) => go({ view: "daily", tab: t })}
                  hideTabBar
                />
              )}
              {view === "research" && (
                <EdgeLabPage
                  activeTab={tab}
                  onTabChange={(t) => go({ view: "research", tab: t })}
                  hideTabBar
                />
              )}
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="performance" />
    </div>
  );
};

export default PerformanceHub;
