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

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useTheme } from "../../../../context/ThemeContext";
import MoreMenuDropdown from "../../../MoreMenuDropdown";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { isPremiumUser } from "../../../../utils/roles";
import { PREMIUM_REQUIRED } from "../../../../utils/routeAccess";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { CTA, DEST } from "../landingCopy";
import { PrimaryButton, SecondaryButton } from "./shared/LandingButtons";

// Compact appearance picker for the landing header (admin-gated while theming
// is in preview). Three swatches — click to switch the whole site live.
const THEME_SWATCH = {
  luxquant: "linear-gradient(145deg,#1a0a0c 0%,#3d1a12 55%,#e0b25c 150%)",
  dark: "linear-gradient(145deg,#050506 0%,#18181b 60%,#8a8a96 165%)",
  bright: "linear-gradient(145deg,#ffffff 0%,#eceef2 45%,#f0b90b 170%)",
};
function LandingThemePicker() {
  const { theme, setTheme, canSwitchTheme, themes } = useTheme();
  if (!canSwitchTheme) return null;
  const opts = (themes || ["luxquant", "dark", "bright"]).map((k) => ({
    k,
    label: k === "luxquant" ? "Luxquant" : k === "dark" ? "Dark" : "Bright",
  }));
  return (
    <div
      className="hidden items-center gap-1 rounded-full border border-ink/[0.1] bg-ink/[0.03] p-1 lg:flex"
      role="radiogroup"
      aria-label="Appearance"
    >
      {opts.map((o) => {
        const on = theme === o.k;
        return (
          <button
            key={o.k}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.label}
            aria-label={o.label}
            onClick={() => setTheme(o.k)}
            className={`relative h-5 w-5 rounded-full border transition-transform before:absolute before:-inset-2 before:content-[''] ${
              on
                ? "border-accent scale-110"
                : "border-ink/15 opacity-70 hover:opacity-100 hover:scale-105"
            }`}
            style={{ background: THEME_SWATCH[o.k] }}
          />
        );
      })}
    </div>
  );
}

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
  const { isAuthenticated, user } = useAuth();
  const isPremium = isPremiumUser(user);

  const [scrolled, setScrolled] = useState(false);
  // The hero carries its own CTA in the first screen. Showing the header's copy
  // beside it asks the same thing twice; it takes over once the hero's is gone.
  const [pastHero, setPastHero] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({}); // mobile accordion — collapsed by default

  const toggleGroup = (name) => setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));

  // Closing the drawer makes it inert, so focus sitting inside it would be
  // stranded in a subtree nothing can reach. Hand it back to the control that
  // opened it — the same thing a well-behaved dialog does on dismiss.
  const drawerRef = useRef(null);
  const burgerRef = useRef(null);
  useEffect(() => {
    if (mobileOpen) return;
    const drawer = drawerRef.current;
    if (drawer && drawer.contains(document.activeElement)) burgerRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
      setPastHero(window.scrollY > window.innerHeight * 0.6);
    };
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
      trackFunnel("cta_click", { source: "header_feature", path });
      navigate(loginUrl(path, { source: "header_feature" }));
    } else {
      navigate(path);
    }
  };

  const goLogin = () => {
    setMobileOpen(false);
    trackFunnel("cta_click", { source: "header_login", path: "/" });
    navigate(loginUrl("/home", { source: "header_login" }));
  };
  const goSignup = () => {
    setMobileOpen(false);
    trackFunnel("cta_click", { source: "header_signup", path: "/" });
    navigate(loginUrl(DEST.free, { source: "header_signup" }));
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 lg:px-6">
      <div
        className={[
          "mx-auto w-full border transition-all duration-500 ease-out",
          scrolled
            ? "mt-3 max-w-[1280px] rounded-full border-ink/[0.08] bg-surface/80 backdrop-blur-xl"
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
                {/* Was isPremium={false} with premiumPaths={[]} — the menu had
                    no idea what costs money, so it marked nothing PRO for a
                    free account and, just as wrong, would have marked things
                    PRO for a member who already pays. Same two inputs the app
                    shell passes. */}
                <MoreMenuDropdown
                  label="More"
                  isActive={() => false}
                  isPremium={isPremium}
                  isAdmin={false}
                  premiumPaths={PREMIUM_REQUIRED}
                  onNavigate={goFeature}
                  moreHasActive={false}
                />
              </div>
            </div>
          </nav>

          {/* Right side, one cell at every width: the lg-only cluster, the CTA
              and the hamburger. Keeping them in a single cell is what stops the
              CTA being auto-placed into another column on desktop. */}
          <div className="col-start-3 flex items-center justify-self-end gap-1.5 lg:gap-2 2xl:gap-3">
          {/* Appearance · Language · Log In */}
          <div className="hidden shrink-0 items-center gap-2 lg:flex 2xl:gap-3">
            <LandingThemePicker />
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
                className="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-text-primary/80 transition-colors hover:text-text-primary lg:inline-flex"
              >
                {CTA.logIn}
              </button>
            )}

          </div>

          {/* Desktop-only gold CTA. Mobile: sticky "Continue" owns conversion after
              scroll; menu holds Start Free — avoids two competing gold primaries. */}
            <PrimaryButton
              size="sm"
              onClick={isAuthenticated ? () => navigate("/home") : goSignup}
              className={`hidden lg:inline-flex ${
                isAuthenticated || pastHero
                  ? "lg:pointer-events-auto lg:opacity-100"
                  : "lg:pointer-events-none lg:opacity-0"
              }`}
            >
              {isAuthenticated ? CTA.openAppHeader : CTA.signUp}
            </PrimaryButton>

          {/* Mobile hamburger */}
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="-mr-1 flex h-11 w-11 items-center justify-center text-text-primary/70 transition-colors hover:text-text-primary lg:hidden"
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
      </div>

      {/* Mobile / tablet menu
          `max-h-0 + opacity-0 + overflow-hidden` hides this from the eye but
          not from the machine: overflow clips paint, not layout, so every
          control inside kept its box, its place in the tab order and its voice
          in the accessibility tree. Measured while closed: 44 focusable
          elements inside opacity-0 containers, and 32 tab stops before a
          keyboard could reach the hero's primary CTA.
          `inert` removes focus and AT exposure in one attribute.

          It is deliberately NOT paired with aria-hidden. Tapping a button in
          here closes the drawer while that button still holds focus, and the
          browser then refuses the attribute outright: "Blocked aria-hidden on
          an element because its descendant retained focus." Chrome's own advice
          in that message is to use inert instead — which is what this does, and
          which already hides the subtree from assistive tech. The paired
          aria-hidden was belt-and-braces that only ever produced the warning. */}
      <div
        ref={drawerRef}
        {...(mobileOpen ? {} : { inert: "" })}
        className={[
          "absolute left-3 right-3 top-full mt-2 overflow-hidden rounded-2xl",
          "bg-surface/95 backdrop-blur-3xl transition-all duration-500 ease-in-out",
          mobileOpen
            ? "max-h-[82vh] border border-ink/[0.08] opacity-100"
            : "pointer-events-none max-h-0 border border-transparent opacity-0",
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
                  {/* Same trap one level down: a collapsed group still held
                      focusable buttons even while the drawer itself was open.
                      inert only — see the note on the drawer above. */}
                  <div
                    {...(open ? {} : { inert: "" })}
                    className={[
                      "overflow-hidden transition-all duration-300 ease-in-out",
                      open ? "max-h-96 opacity-100" : "pointer-events-none max-h-0 opacity-0",
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
              <SecondaryButton
                size="sm"
                width="full"
                onClick={goLogin}
              >
                {CTA.logIn}
              </SecondaryButton>
            )}
            <PrimaryButton
              size="sm"
              width="full"
              onClick={
                isAuthenticated
                  ? () => {
                      setMobileOpen(false);
                      navigate("/home");
                    }
                  : goSignup
              }
            >
              {isAuthenticated ? CTA.openAppHeader : CTA.signUp}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </header>
  );
}
