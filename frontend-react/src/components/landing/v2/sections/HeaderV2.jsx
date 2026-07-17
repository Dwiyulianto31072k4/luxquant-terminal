// src/components/landing/v2/sections/HeaderV2.jsx
// ════════════════════════════════════════════════════════════════
// HeaderV2 — MEXC-style landing header.
// • Left : logo (back-to-top)
// • Center : landing-section anchors (prioritised) + a "More" mega-menu
// that exposes EVERY in-app feature (reuses the app's
// MoreMenuDropdown, same groups/icons).
// • Right : language · Log In · Sign Up
//
// Auth flow (mirrors App.jsx handleNav): clicking an app feature while
// logged-out routes to /login?redirect=<path> so the user lands back on
// that feature after authenticating. Premium gating then happens inside
// the app exactly as before.
//
// Floating capsule on scroll is preserved from the previous header.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import MoreMenuDropdown from "../../../MoreMenuDropdown";

const GOLD_BTN = {
  background:
    "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
  color: "rgb(var(--surface))",
};

// Landing-section anchors — best-practice: no redundant "Home" (the logo
// goes home), lead with proof, close with FAQ.
const NAV = [
  { label: "Top Gainers", id: "signals-preview" },
  { label: "How It Works", id: "how-it-works" },
  { label: "Terminal", id: "terminal-preview" },
  { label: "Track Record", id: "performance" },
  { label: "Coins", id: "coin-spotlight" },
  { label: "FAQ", id: "faq" },
];

// Compact feature list for the MOBILE menu (desktop uses MoreMenuDropdown).
const MOBILE_FEATURES = [
  {
    group: "Trading",
    items: [
      { path: "/signals", label: "Algo Calls" },
      { path: "/autotrade", label: "Agent" },
      { path: "/ai-arena", label: "AI Research" },
      { path: "/orderbook", label: "Order Book" },
    ],
  },
  {
    group: "Market & Data",
    items: [
      { path: "/markets", label: "Markets" },
      { path: "/market-pulse", label: "Pulse" },
      { path: "/onchain", label: "On-Chain" },
      { path: "/money-flow", label: "Money Flow" },
      { path: "/bitcoin", label: "Bitcoin" },
      { path: "/crypto-news", label: "Crypto News" },
      { path: "/calendar", label: "Calendar" },
    ],
  },
  {
    group: "Performance",
    items: [
      { path: "/performance", label: "Performance" },
      { path: "/journal", label: "Journal" },
      { path: "/portfolio", label: "Portfolio" },
    ],
  },
  {
    group: "Personal",
    items: [
      { path: "/watchlist", label: "Watchlist" },
      { path: "/tips", label: "Tips & Modules" },
      { path: "/referral", label: "Referral" },
      { path: "/api-keys", label: "API Keys" },
    ],
  },
];

export default function HeaderV2({ onNav, activeId = "hero" }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({}); // mobile accordion — collapsed by default

  const toggleGroup = (name) => setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Landing-section scroll
  const handleNav = (id) => {
    setMobileOpen(false);
    onNav?.(id);
  };

  // App-feature navigation — login-gate when logged out (same as App.jsx).
  const goFeature = (path) => {
    setMobileOpen(false);
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(path)}`);
    } else {
      navigate(path);
    }
  };

  const goLogin = () => {
    setMobileOpen(false);
    navigate("/login");
  };
  const goSignup = () => {
    setMobileOpen(false);
    navigate("/register");
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 lg:px-6">
      <div
        className={[
          "mx-auto w-full border transition-all duration-500 ease-out",
          scrolled
            ? "mt-3 max-w-[1280px] rounded-full border-ink/[0.08] bg-surface/80 shadow-[0_8px_32px_rgb(var(--scrim) / 0.35)] backdrop-blur-xl"
            : "mt-0 max-w-7xl rounded-none border-transparent bg-transparent",
        ].join(" ")}
      >
        <div
          className={[
            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 transition-all duration-500",
            scrolled ? "h-14 px-4 lg:px-6" : "h-16 px-1 lg:h-20 lg:px-2",
          ].join(" ")}
        >
          {/* Left: Logo */}
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="Back to top"
          >
            <img
              src="/logo.png"
              alt="LuxQuant"
              className="h-8 w-8 rounded-md object-cover transition-opacity group-hover:opacity-80 lg:h-9 lg:w-9"
            />
            <span className="text-lg font-bold tracking-wide text-text-primary transition-colors group-hover:text-text-primary lg:text-xl">
              LuxQuant
            </span>
          </button>

          {/* Center: landing anchors + More mega-menu */}
          <nav className="hidden min-w-0 lg:block" aria-label="Main navigation">
            <div className="flex items-center justify-center gap-0.5 whitespace-nowrap 2xl:gap-1">
              {NAV.map((item) => {
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={[
                      "shrink-0 rounded-md px-2.5 py-2 text-[12.5px] font-medium",
                      "tracking-[0.01em] transition-colors 2xl:px-3 2xl:text-[13px]",
                      active
                        ? "bg-ink/[0.04] text-accent"
                        : "text-text-primary/60 hover:bg-ink/[0.03] hover:text-text-primary",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}

              {/* More → all in-app features (reuses the app's mega-menu).
 Uppercase ONLY the trigger (direct div>button), so the
 dropdown item labels keep their normal app casing. */}
              <div className="ml-0.5 [&>div>button]:text-[12.5px] [&>div>button]:tracking-[0.01em]">
                <MoreMenuDropdown
                  label="More"
                  isActive={() => false}
                  isPremium={false}
                  isAdmin={false}
                  premiumPaths={[]}
                  onNavigate={goFeature}
                  moreHasActive={false}
                />
              </div>
            </div>
          </nav>

          {/* Right: Language · Log In · Sign Up */}
          <div className="hidden shrink-0 items-center gap-2 lg:flex 2xl:gap-3">
            <button
              type="button"
              className="hidden items-center gap-1.5 whitespace-nowrap text-[13px] text-text-primary/65 transition-colors hover:text-text-primary 2xl:flex"
              aria-label="Language: English"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.6}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
              </svg>
              <span>English</span>
              <svg
                className="h-3 w-3 opacity-60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!isAuthenticated && (
              <button
                type="button"
                onClick={goLogin}
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-text-primary/80 transition-colors hover:text-text-primary"
              >
                Log In
              </button>
            )}

            <button
              type="button"
              onClick={isAuthenticated ? () => navigate("/home") : goSignup}
              className="rounded-full px-4 py-2 text-[13px] font-semibold shadow-[0_4px_16px_rgb(var(--accent) / 0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_7px_22px_rgb(var(--accent) / 0.36)]"
              style={GOLD_BTN}
            >
              {isAuthenticated ? "Open App" : "Sign Up"}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="col-start-3 justify-self-end p-2 text-text-primary/70 transition-colors hover:text-text-primary lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span
                className={[
                  "block h-0.5 rounded-full bg-current transition-all duration-300",
                  mobileOpen ? "translate-y-[7px] rotate-45 text-accent" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "block h-0.5 rounded-full bg-current transition-all duration-200",
                  mobileOpen ? "opacity-0" : "",
                ].join(" ")}
              />
              <span
                className={[
                  "block h-0.5 rounded-full bg-current transition-all duration-300",
                  mobileOpen ? "-translate-y-[7px] -rotate-45 text-accent" : "",
                ].join(" ")}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      <div
        className={[
          "absolute left-3 right-3 top-full mt-2 overflow-hidden rounded-2xl",
          "bg-surface/95 backdrop-blur-3xl transition-all duration-500 ease-in-out",
          mobileOpen
            ? "max-h-[82vh] border border-ink/[0.08] opacity-100 shadow-2xl"
            : "max-h-0 border border-transparent opacity-0",
        ].join(" ")}
      >
        <div className="max-h-[82vh] space-y-0.5 overflow-y-auto px-3 py-3">
          {/* Primary landing sections — always visible */}
          {NAV.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={[
                  "block w-full rounded-lg px-4 py-3 text-left text-[15px] font-medium transition-colors",
                  active
                    ? "bg-ink/[0.05] text-accent"
                    : "text-text-primary/85 hover:bg-ink/[0.03] hover:text-text-primary",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}

          {/* App features — collapsible groups, collapsed by default */}
          <div className="mt-2 space-y-0.5 border-t border-ink/[0.06] pt-2">
            {MOBILE_FEATURES.map((grp) => {
              const open = !!openGroups[grp.group];
              return (
                <div key={grp.group}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(grp.group)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-[15px] font-medium text-text-primary/75 transition-colors hover:bg-ink/[0.03] hover:text-text-primary"
                  >
                    <span>{grp.group}</span>
                    <svg
                      className={[
                        "h-4 w-4 shrink-0 transition-transform duration-300",
                        open ? "rotate-180 text-accent" : "text-text-primary/40",
                      ].join(" ")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={[
                      "overflow-hidden transition-all duration-300 ease-in-out",
                      open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
                    ].join(" ")}
                  >
                    <div className="space-y-0.5 pb-1 pl-2">
                      {grp.items.map((it) => (
                        <button
                          key={it.path}
                          type="button"
                          onClick={() => goFeature(it.path)}
                          className="block w-full rounded-lg px-4 py-2.5 text-left text-[14px] text-text-primary/60 transition-colors hover:bg-ink/[0.03] hover:text-text-primary"
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Auth */}
          <div
            className={`mt-3 grid ${isAuthenticated ? "grid-cols-1" : "grid-cols-2"} gap-2 border-t border-ink/5 pt-4`}
          >
            {!isAuthenticated && (
              <button
                type="button"
                onClick={goLogin}
                className="rounded-full border border-ink/15 px-4 py-2.5 text-[13px] font-medium text-text-primary/85 transition-colors hover:bg-ink/[0.04]"
              >
                Log In
              </button>
            )}
            <button
              type="button"
              onClick={
                isAuthenticated
                  ? () => {
                      setMobileOpen(false);
                      navigate("/home");
                    }
                  : goSignup
              }
              className="rounded-full px-4 py-2.5 text-[13px] font-semibold"
              style={GOLD_BTN}
            >
              {isAuthenticated ? "Open App" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
