// src/components/WatchlistTabs.jsx
// Exchange-style mode switch (Pro/Lite pattern):
// compact segmented control — Watching | Tracking
// Solid yellow active segment, theme-tokenized.

import { useState } from "react";
import WatchingTab from "./WatchingTab";
import WatchlistPage from "./WatchlistPage";

const STORAGE_KEY = "lq-watchlist-mode";
const DEFAULT_TAB = "watching"; // "watching" | "tracking"

const MODES = [
  {
    key: "watching",
    label: "Watching",
    title: "Waiting for calls",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    ),
  },
  {
    key: "tracking",
    label: "Tracking",
    title: "Active signals",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    ),
  },
];

function readStoredMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "watching" || v === "tracking" ? v : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

const WatchlistTabs = () => {
  const [tab, setTab] = useState(readStoredMode);

  const select = (key) => {
    setTab(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Mode switch — Binance/exchange segmented control */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Watchlist mode"
          className="inline-flex rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5"
        >
          {MODES.map((mode) => {
            const active = tab === mode.key;
            return (
              <button
                key={mode.key}
                type="button"
                role="tab"
                aria-selected={active}
                title={mode.title}
                onClick={() => select(mode.key)}
                className={`inline-flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "bg-accent text-accent-fg shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <svg
                  className={`h-3.5 w-3.5 shrink-0 ${active ? "text-accent-fg" : "text-text-muted"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  {mode.icon}
                </svg>
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Active mode hint — desk mono caption */}
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted sm:block">
          {tab === "watching" ? "Notify on call" : "Starred signals"}
        </p>
      </div>

      {tab === "watching" ? <WatchingTab /> : <WatchlistPage />}
    </>
  );
};

export default WatchlistTabs;
