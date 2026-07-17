// src/components/WatchlistTabs.jsx
// Terminal desk — solid yellow active tab (theme-token accent)
// Watching (waitlist) + Tracking (starred signals)

import { useState } from "react";
import WatchingTab from "./WatchingTab";
import WatchlistPage from "./WatchlistPage";

const DEFAULT_TAB = "watching"; // "watching" | "tracking"

const TABS = [
  {
    key: "watching",
    label: "Watching",
    sublabel: "Waiting for calls",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    ),
  },
  {
    key: "tracking",
    label: "Tracking",
    sublabel: "Active signals",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    ),
  },
];

const WatchlistTabs = () => {
  const [tab, setTab] = useState(DEFAULT_TAB);

  return (
    <>
      <div className="mb-2 space-y-0 px-0 pt-0 sm:pt-1">
        <div className="flex flex-nowrap gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`flex shrink-0 items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                  active
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-ink/[0.1] bg-surface-raised text-text-muted hover:border-ink/18 hover:text-text-primary"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    active ? "bg-black/15" : "bg-surface-secondary"
                  }`}
                >
                  <svg
                    className={`h-[18px] w-[18px] ${active ? "text-accent-fg" : "text-text-muted"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {tb.icon}
                  </svg>
                </span>
                <span className="text-left">
                  <span
                    className={`block text-sm font-semibold leading-tight ${
                      active ? "text-accent-fg" : "text-text-primary"
                    }`}
                  >
                    {tb.label}
                  </span>
                  <span
                    className={`mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] ${
                      active ? "text-accent-fg/75" : "text-text-muted"
                    }`}
                  >
                    {tb.sublabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "watching" ? <WatchingTab /> : <WatchlistPage />}
    </>
  );
};

export default WatchlistTabs;
