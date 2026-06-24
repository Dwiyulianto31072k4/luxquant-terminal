// src/components/landing/v2/sections/HeaderV2.jsx
// ════════════════════════════════════════════════════════════════
// HeaderV2 — Synex-style nav + Ternak-Klip floating pill on scroll.
//   • At top:     wide, transparent, spans the page.
//   • On scroll:  condenses into a floating rounded-full capsule
//                 (detached from edges, glass bg, border, shadow) —
//                 the Ternak-Klip effect.
//   • position: FIXED (not sticky) — sticky breaks when any ancestor
//     has overflow-x-hidden (the floating-mockup wrappers do), so the
//     header would vanish on deep scroll. fixed is immune to that.
//   • CTA "lozenge" uses a LAUNCH (↗) icon, not a download icon.
//
// Props: onNav(id), activeId
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
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goPlatform = () => navigate(isAuthenticated ? "/home" : "/login");
  const handleNav = (id) => {
    setMobileOpen(false);
    onNav?.(id);
  };

  // CTA lozenge — Synex "Launch app" shape (icon in a circle + label).
  // Icon = launch/open (↗), NOT download.
  const LozengeCTA = ({ full = false }) => (
    <button
      onClick={goPlatform}
      className={`group flex items-center gap-2.5 rounded-full pl-1.5 pr-5 py-1.5 font-semibold text-sm transition-all hover:-translate-y-0.5 shadow-[0_4px_16px_rgba(212,168,83,0.25)] hover:shadow-[0_6px_20px_rgba(212,168,83,0.35)] ${full ? "w-full justify-center" : ""}`}
      style={GOLD_BTN}
    >
      <span className="w-8 h-8 rounded-full bg-black/15 flex items-center justify-center flex-shrink-0">
        {/* launch / open arrow ↗ */}
        <svg className="w-4 h-4 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
      <span className="tracking-wide">{isAuthenticated ? "Open Terminal" : "Launch App"}</span>
    </button>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3 lg:px-6">
      {/* Floating bar — wide & transparent at top, pill-capsule on scroll */}
      <div
        className={`mx-auto transition-all duration-500 ease-out border ${
          scrolled
            ? "max-w-5xl mt-3 rounded-full border-white/[0.08] bg-[#0a0506]/80 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            : "max-w-7xl mt-0 rounded-none border-transparent bg-transparent"
        }`}
      >
        <div
          className={`relative flex items-center justify-between transition-all duration-500 ${
            scrolled ? "h-14 px-4 lg:px-6" : "h-16 lg:h-20 px-1 lg:px-2"
          }`}
        >
          {/* ── Logo (kiri) ── */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 group flex-shrink-0"
          >
            <img
              src="/logo.png"
              alt="LuxQuant"
              className="w-8 h-8 lg:w-9 lg:h-9 object-cover rounded-md group-hover:opacity-80 transition-opacity"
            />
            <span className="font-display text-lg lg:text-xl font-bold text-white tracking-wide group-hover:text-gold-primary transition-colors">
              LuxQuant
            </span>
          </button>

          {/* ── Nav (tengah, uppercase — Synex) ── */}
          <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-1">
            {NAV.map((item) => {
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`px-3 py-2 rounded-md text-[12px] font-medium uppercase tracking-[0.14em] transition-colors ${
                    active
                      ? "text-gold-primary bg-white/[0.04]"
                      : "text-white/55 hover:text-white hover:bg-white/[0.03]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ── Kanan: language + CTA ── */}
          <div className="hidden lg:flex items-center gap-4 flex-shrink-0">
            <button className="flex items-center gap-1.5 text-white/65 hover:text-white text-[13px] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
              </svg>
              <span>English</span>
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <LozengeCTA />
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 text-white/70 hover:text-white"
            aria-label="Toggle menu"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-[7px] text-gold-primary" : ""}`} />
              <span className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-[7px] text-gold-primary" : ""}`} />
            </div>
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown — floating panel below the bar ── */}
      <div
        className={`lg:hidden absolute top-full left-3 right-3 mt-2 bg-[#0a0506]/95 backdrop-blur-3xl rounded-2xl overflow-hidden transition-all duration-500 ease-in-out ${
          mobileOpen ? "max-h-[440px] opacity-100 border border-white/[0.08] shadow-2xl" : "max-h-0 opacity-0 border border-transparent"
        }`}
      >
        <div className="px-4 py-4 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className="block w-full text-left text-white/70 hover:text-gold-primary hover:bg-white/[0.03] px-4 py-3 rounded-md text-[13px] font-medium uppercase tracking-[0.12em] transition-colors"
            >
              {item.label}
            </button>
          ))}
          <div className="pt-4 mt-2 border-t border-white/5">
            <LozengeCTA full />
          </div>
        </div>
      </div>
    </header>
  );
}