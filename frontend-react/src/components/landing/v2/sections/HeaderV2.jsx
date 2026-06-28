// src/components/landing/v2/sections/HeaderV2.jsx
// ════════════════════════════════════════════════════════════════
// HeaderV2 — MEXC-style landing header.
//   • Left   : logo (back-to-top)
//   • Center : landing-section anchors (prioritised) + a "More" mega-menu
//              that exposes EVERY in-app feature (reuses the app's
//              MoreMenuDropdown, same groups/icons).
//   • Right  : language · Log In · Sign Up
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
  background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
  color: "#0a0506",
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
  { group: "Trading", items: [
    { path: "/signals", label: "Algo Calls" },
    { path: "/autotrade", label: "Agent" },
    { path: "/ai-arena", label: "AI Research" },
    { path: "/orderbook", label: "Order Book" },
  ] },
  { group: "Market & Data", items: [
    { path: "/markets", label: "Markets" },
    { path: "/market-pulse", label: "Pulse" },
    { path: "/onchain", label: "On-Chain" },
    { path: "/money-flow", label: "Money Flow" },
    { path: "/bitcoin", label: "Bitcoin" },
    { path: "/crypto-news", label: "Crypto News" },
    { path: "/calendar", label: "Calendar" },
  ] },
  { group: "Performance", items: [
    { path: "/performance", label: "Performance" },
    { path: "/journal", label: "Journal" },
    { path: "/portfolio", label: "Portfolio" },
  ] },
  { group: "Personal", items: [
    { path: "/watchlist", label: "Watchlist" },
    { path: "/tips", label: "Tips & Modules" },
    { path: "/referral", label: "Referral" },
    { path: "/api-keys", label: "API Keys" },
  ] },
];

export default function HeaderV2({ onNav, activeId = "hero" }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
            ? "mt-3 max-w-[1280px] rounded-full border-white/[0.08] bg-[#0a0506]/80 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
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
            <span className="text-lg font-bold tracking-wide text-white transition-colors group-hover:text-gold-primary lg:text-xl">
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
                      "shrink-0 rounded-md px-2 py-2 text-[11px] font-medium uppercase",
                      "tracking-[0.1em] transition-colors 2xl:px-2.5 2xl:text-[12px] 2xl:tracking-[0.12em]",
                      active
                        ? "bg-white/[0.04] text-gold-primary"
                        : "text-white/55 hover:bg-white/[0.03] hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}

              {/* More → all in-app features (reuses the app's mega-menu).
                  Uppercase ONLY the trigger (direct div>button), so the
                  dropdown item labels keep their normal app casing. */}
              <div className="ml-0.5 [&>div>button]:text-[11px] [&>div>button]:uppercase [&>div>button]:tracking-[0.1em]">
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
              className="hidden items-center gap-1.5 whitespace-nowrap text-[13px] text-white/65 transition-colors hover:text-white 2xl:flex"
              aria-label="Language: English"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
              </svg>
              <span>English</span>
              <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={goLogin}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:text-white"
            >
              {isAuthenticated ? "Terminal" : "Log In"}
            </button>

            <button
              type="button"
              onClick={isAuthenticated ? () => navigate("/home") : goSignup}
              className="rounded-full px-4 py-2 text-[13px] font-semibold shadow-[0_4px_16px_rgba(212,168,83,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_7px_22px_rgba(212,168,83,0.36)]"
              style={GOLD_BTN}
            >
              {isAuthenticated ? "Open App" : "Sign Up"}
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="col-start-3 justify-self-end p-2 text-white/70 transition-colors hover:text-white lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span className={["block h-0.5 rounded-full bg-current transition-all duration-300", mobileOpen ? "translate-y-[7px] rotate-45 text-gold-primary" : ""].join(" ")} />
              <span className={["block h-0.5 rounded-full bg-current transition-all duration-200", mobileOpen ? "opacity-0" : ""].join(" ")} />
              <span className={["block h-0.5 rounded-full bg-current transition-all duration-300", mobileOpen ? "-translate-y-[7px] -rotate-45 text-gold-primary" : ""].join(" ")} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      <div
        className={[
          "absolute left-3 right-3 top-full mt-2 overflow-hidden rounded-2xl",
          "bg-[#0a0506]/95 backdrop-blur-3xl transition-all duration-500 ease-in-out",
          mobileOpen
            ? "max-h-[82vh] border border-white/[0.08] opacity-100 shadow-2xl"
            : "max-h-0 border border-transparent opacity-0",
        ].join(" ")}
      >
        <div className="max-h-[82vh] space-y-1 overflow-y-auto px-4 py-4">
          {/* Landing anchors */}
          {NAV.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={[
                  "block w-full rounded-md px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.1em] transition-colors",
                  active ? "bg-white/[0.04] text-gold-primary" : "text-white/70 hover:bg-white/[0.03] hover:text-gold-primary",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}

          {/* All app features */}
          {MOBILE_FEATURES.map((grp) => (
            <div key={grp.group} className="pt-3">
              <div className="px-4 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/75">
                {grp.group}
              </div>
              {grp.items.map((it) => (
                <button
                  key={it.path}
                  type="button"
                  onClick={() => goFeature(it.path)}
                  className="block w-full rounded-md px-4 py-2 text-left text-[13px] text-white/70 transition-colors hover:bg-white/[0.03] hover:text-white"
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}

          {/* Auth */}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={goLogin}
              className="rounded-full border border-white/15 px-4 py-2.5 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.04]"
            >
              {isAuthenticated ? "Terminal" : "Log In"}
            </button>
            <button
              type="button"
              onClick={isAuthenticated ? () => { setMobileOpen(false); navigate("/home"); } : goSignup}
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
