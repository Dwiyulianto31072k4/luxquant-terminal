// src/components/WatchlistTabs.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Watchlist shell (2-tab)
// Pill horizontal SOLID gold (active) | Watching (waitlist) + Tracking
// Tracking = WatchlistPage apa adanya (gak diutak-atik).
// Ganti DEFAULT_TAB ke "watching" kalau mau anticipation-first.
// ════════════════════════════════════════════════════════════════
import { useState } from "react";
import WatchingTab from "./WatchingTab";
import WatchlistPage from "./WatchlistPage";

const DEFAULT_TAB = "watching"; // "watching" | "tracking"

const GOLD_GRADIENT = "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)";

const TABS = [
  {
    key: "watching",
    label: "Watching",
    sublabel: "Waiting for calls",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    ),
  },
  {
    key: "tracking",
    label: "Tracking",
    sublabel: "Active signals",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    ),
  },
];

const WatchlistTabs = () => {
  const [tab, setTab] = useState(DEFAULT_TAB);

  return (
    <>
      {/* Pill tab bar — solid gold active */}
      <div className="max-w-[1400px] mx-auto px-4 pt-8 -mb-2">
        <div className="flex flex-nowrap gap-2.5 overflow-x-auto scrollbar-hide">
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200 ${
                  active
                    ? "border-line/60 -translate-y-px"
                    : "bg-white/[0.02] border-white/[0.07] hover:border-white/[0.15] hover:bg-white/[0.04]"
                }`}
                style={
                  active
                    ? { background: GOLD_GRADIENT, boxShadow: "0 8px 24px rgba(212,168,83,0.35)" }
                    : undefined
                }
              >
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? "bg-black/15" : "bg-white/[0.04]"
                  }`}
                >
                  <svg
                    className={`w-[18px] h-[18px] ${active ? "text-surface-raised" : "text-text-muted"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {tb.icon}
                  </svg>
                </span>
                <span className="text-left">
                  <span className={`block text-sm font-semibold leading-tight ${active ? "text-surface-raised" : "text-text-secondary"}`}>
                    {tb.label}
                  </span>
                  <span className={`block font-mono text-[10px] uppercase tracking-[0.08em] mt-0.5 ${active ? "text-surface-raised/55" : "text-text-muted/70"}`}>
                    {tb.sublabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab (self-wraps its own max-w container) */}
      {tab === "watching" ? <WatchingTab /> : <WatchlistPage />}
    </>
  );
};

export default WatchlistTabs;
