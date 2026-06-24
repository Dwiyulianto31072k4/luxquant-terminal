// src/components/landing/v2/sections/HeaderV2.jsx
// ════════════════════════════════════════════════════════════════
// HeaderV2 — full-width transparent at top; floating capsule on scroll.
// Uses a 3-column grid: logo | navigation | actions.
// This prevents the center nav from overlapping English / Launch App.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";

const GOLD_BTN = {
  background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
  color: "#0a0506",
};

const NAV = [
  { label: "Home", id: "hero" },
  { label: "Performance", id: "performance" },
  { label: "Architecture", id: "how-it-works" },
  { label: "Markets", id: "signals-preview" },
  { label: "FAQ", id: "faq" },
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

  const goPlatform = () => {
    navigate(isAuthenticated ? "/home" : "/login");
  };

  const handleNav = (id) => {
    setMobileOpen(false);
    onNav?.(id);
  };

  const LozengeCTA = ({ full = false }) => (
    <button
      type="button"
      onClick={goPlatform}
      className={[
        "group inline-flex shrink-0 items-center gap-2 rounded-full",
        "py-1.5 pl-1.5 pr-4 text-sm font-semibold",
        "shadow-[0_4px_16px_rgba(212,168,83,0.25)]",
        "transition-all duration-300 hover:-translate-y-0.5",
        "hover:shadow-[0_7px_22px_rgba(212,168,83,0.36)]",
        full ? "w-full justify-center" : "",
      ].join(" ")}
      style={GOLD_BTN}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/15">
        <svg
          className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-px group-hover:-translate-y-px"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 17L17 7M9 7h8v8"
          />
        </svg>
      </span>

      <span className="whitespace-nowrap tracking-wide">
        {isAuthenticated ? "Open Terminal" : "Launch App"}
      </span>
    </button>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 lg:px-6">
      <div
        className={[
          "mx-auto w-full border transition-all duration-500 ease-out",
          scrolled
            ? "mt-3 max-w-[1240px] rounded-full border-white/[0.08] bg-[#0a0506]/80 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
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

            <span className="font-display text-lg font-bold tracking-wide text-white transition-colors group-hover:text-gold-primary lg:text-xl">
              LuxQuant
            </span>
          </button>

          {/* Center: Navigation.
              No absolute positioning: it only occupies the middle grid column. */}
          <nav
            className="hidden min-w-0 xl:block"
            aria-label="Main navigation"
          >
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
                      "tracking-[0.12em] transition-colors 2xl:px-3 2xl:text-[12px] 2xl:tracking-[0.14em]",
                      active
                        ? "bg-white/[0.04] text-gold-primary"
                        : "text-white/55 hover:bg-white/[0.03] hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Right: Language + CTA.
              English appears only on sufficiently wide screens so it never overlaps nav. */}
          <div className="hidden shrink-0 items-center gap-2 xl:flex 2xl:gap-4">
            <button
              type="button"
              className="hidden items-center gap-1.5 whitespace-nowrap text-[13px] text-white/65 transition-colors hover:text-white 2xl:flex"
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <LozengeCTA />
          </div>

          {/* Mobile / tablet hamburger. Header switches to this below xl. */}
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="p-2 text-white/70 transition-colors hover:text-white xl:hidden"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span
                className={[
                  "block h-0.5 rounded-full bg-current transition-all duration-300",
                  mobileOpen
                    ? "translate-y-[7px] rotate-45 text-gold-primary"
                    : "",
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
                  mobileOpen
                    ? "-translate-y-[7px] -rotate-45 text-gold-primary"
                    : "",
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
          "bg-[#0a0506]/95 backdrop-blur-3xl transition-all duration-500 ease-in-out",
          mobileOpen
            ? "max-h-[440px] border border-white/[0.08] opacity-100 shadow-2xl"
            : "max-h-0 border border-transparent opacity-0",
        ].join(" ")}
      >
        <div className="space-y-1 px-4 py-4">
          {NAV.map((item) => {
            const active = item.id === activeId;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={[
                  "block w-full rounded-md px-4 py-3 text-left text-[13px] font-medium uppercase",
                  "tracking-[0.12em] transition-colors",
                  active
                    ? "bg-white/[0.04] text-gold-primary"
                    : "text-white/70 hover:bg-white/[0.03] hover:text-gold-primary",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}

          <div className="mt-2 border-t border-white/5 pt-4">
            <LozengeCTA full />
          </div>
        </div>
      </div>
    </header>
  );
}
