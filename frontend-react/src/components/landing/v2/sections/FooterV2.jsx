// src/components/landing/v2/sections/FooterV2.jsx
// ════════════════════════════════════════════════════════════════
// FooterV2 — MEXC-style mega footer.
//   • Brand + socials column (left)
//   • Multi-column link directory: Products (every in-app feature),
//     Market Data, Platform (landing anchors), Resources
//   • App-feature links login-gate when logged out (→ /login?redirect=)
//   • Bottom bar: copyright · built in Taiwan · rights
// Content ported from the old landing footer + expanded with the full
// feature set, matching MEXC's directory-style layout in v2 colours.
// ════════════════════════════════════════════════════════════════
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";

export default function FooterV2({ onNav }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const goFeature = (path) =>
    isAuthenticated
      ? navigate(path)
      : navigate(`/login?redirect=${encodeURIComponent(path)}`);

  const openTerminal = () => navigate(isAuthenticated ? "/home" : "/login");

  // type: feature | scroll | external | terminal
  const COLUMNS = [
    {
      title: "Products",
      links: [
        { label: "Algo Calls", type: "feature", to: "/signals" },
        { label: "Agent", type: "feature", to: "/autotrade" },
        { label: "AI Research", type: "feature", to: "/ai-arena" },
        { label: "Order Book", type: "feature", to: "/orderbook" },
        { label: "Markets", type: "feature", to: "/markets" },
        { label: "Market Pulse", type: "feature", to: "/market-pulse" },
        { label: "On-Chain", type: "feature", to: "/onchain" },
        { label: "Money Flow", type: "feature", to: "/money-flow" },
        { label: "Bitcoin", type: "feature", to: "/bitcoin" },
        { label: "Crypto News", type: "feature", to: "/crypto-news" },
        { label: "Macro Calendar", type: "feature", to: "/calendar" },
        { label: "Performance", type: "feature", to: "/performance" },
        { label: "Journal", type: "feature", to: "/journal" },
        { label: "Portfolio", type: "feature", to: "/portfolio" },
      ],
    },
    {
      title: "Platform",
      links: [
        { label: "Home", type: "scroll", to: "hero" },
        { label: "Top Gainers", type: "scroll", to: "signals-preview" },
        { label: "Architecture", type: "scroll", to: "how-it-works" },
        { label: "Terminal Preview", type: "scroll", to: "terminal-preview" },
        { label: "Per-Coin Record", type: "scroll", to: "coin-spotlight" },
        { label: "FAQ", type: "scroll", to: "faq" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Open Terminal", type: "terminal" },
        { label: "View Performance", type: "scroll", to: "performance" },
        { label: "Tips & Modules", type: "feature", to: "/tips" },
        { label: "Referral", type: "feature", to: "/referral" },
        { label: "API Keys", type: "feature", to: "/api-keys" },
        { label: "Try Free Tier", type: "external", to: "https://t.me/LuxQuantSignal" },
      ],
    },
  ];

  const renderLink = (link) => {
    const cls =
      "text-[13px] text-white/50 transition-colors hover:text-white";
    if (link.type === "external") {
      return (
        <a href={link.to} target="_blank" rel="noopener noreferrer" className={cls}>
          {link.label}
        </a>
      );
    }
    const onClick =
      link.type === "feature"
        ? () => goFeature(link.to)
        : link.type === "terminal"
          ? openTerminal
          : () => onNav?.(link.to);
    return (
      <button type="button" onClick={onClick} className={`${cls} text-left`}>
        {link.label}
      </button>
    );
  };

  // Ecosystem — real-brand app icons (3D tiles, hover tilt). Socials reuse the
  // existing links; the two partner sites use logos dropped in /public.
  const ECOSYSTEM = [
    {
      label: "Telegram",
      handle: "Free signals group",
      href: "https://t.me/LuxQuantSignal",
      bg: "linear-gradient(160deg,#38bdf8 0%,#1d93d2 100%)",
      glyph: (
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      ),
    },
    {
      label: "X",
      handle: "@luxquantcrypto",
      href: "https://x.com/luxquantcrypto",
      bg: "linear-gradient(160deg,#2b2b2f 0%,#070707 100%)",
      glyph: (
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      ),
    },
    {
      label: "Instagram",
      handle: "@luxquant.tw",
      href: "https://instagram.com/luxquant.tw",
      bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
      glyph: (
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z" />
      ),
    },
    {
      label: "Daily Rekom Crypto",
      handle: "Look on LQ Premium+ Highlight",
      href: "https://www.instagram.com/dailyrekomcrypto/",
      // LuxQuant theme — red gradient → black so the DRC mark pops
      bg: "radial-gradient(ellipse at 30% 0%, rgba(150,28,28,0.55) 0%, transparent 62%), linear-gradient(155deg,#3a1012 0%,#1c0809 46%,#0a0506 100%)",
      img: "/DRC%20LOGO.png",
      fbColor: "#ffffff",
    },
    {
      label: "CryptoNewsCanada",
      handle: "cryptonewscanada.com",
      href: "https://cryptonewscanada.com",
      bg: "#eef0f3",
      img: "/CryptoNewsCanadaLogo.png",
      fbColor: "#0a0506",
      light: true,
    },
    {
      label: "CryptoLeb",
      handle: "cryptoleb.ai",
      href: "https://cryptoleb.ai",
      bg: "#eef0f3",
      img: "/CryptoLebLogo.png",
      fbColor: "#0a0506",
      light: true,
    },
  ];

  return (
    <footer className="relative z-10 overflow-hidden bg-[#070304]">
      <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      <div className="absolute bottom-0 left-1/2 -z-10 h-[360px] w-[760px] -translate-x-1/2 rounded-full bg-gold-primary/[0.04] blur-[150px]" />

      <div className="mx-auto max-w-7xl px-5 pb-10 pt-14 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1fr] lg:gap-x-12">
          {/* Brand + socials */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              <img src="/logo.png" alt="LuxQuant" className="h-9 w-9 rounded-md" />
              <div>
                <p className="text-base font-bold leading-none tracking-wide text-white">LuxQuant</p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.25em] text-gold-primary/70">
                  Terminal
                </p>
              </div>
            </div>
            <p className="mb-5 max-w-xs text-[13px] leading-relaxed text-white/45">
              A 24/7 quantitative engine plus an AI market researcher — precise entries, strict
              risk, and a fully transparent track record since 2023.
            </p>

            {/* Ecosystem — 3D app-icon tiles (brand colours; hover tilt) */}
            <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Ecosystem
            </p>
            <div className="flex flex-wrap gap-3 [perspective:900px]">
              {ECOSYSTEM.map((e) => (
                <a
                  key={e.label}
                  href={e.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={e.label}
                  className="group relative block [transform-style:preserve-3d]"
                >
                  {/* even gold glow halo — radiates on every side on hover */}
                  <span aria-hidden="true" className="pointer-events-none absolute -inset-2.5 rounded-[22px] opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(circle, rgba(212,168,83,0.5) 0%, rgba(212,168,83,0.16) 48%, transparent 72%)" }} />
                  {/* soft grounding shadow */}
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 -bottom-1 h-3 rounded-full bg-black/45 blur-md transition-all duration-300 ease-out group-hover:-bottom-1.5 group-hover:bg-black/55" />
                  <span
                    className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] ring-1 ring-inset ${e.light ? "ring-black/[0.07]" : "ring-white/10"} transition-[transform,box-shadow] duration-[320ms] ease-[cubic-bezier(.34,1.32,.5,1)] [transform-origin:center] will-change-transform shadow-[0_2px_4px_rgba(0,0,0,0.45),0_9px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.28)] group-hover:shadow-[0_10px_18px_rgba(0,0,0,0.48),0_22px_38px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.4)] motion-safe:group-hover:[transform:translateY(-5px)_scale(1.13)] motion-reduce:group-hover:[transform:translateY(-3px)_scale(1.06)] group-active:[transform:scale(0.96)]`}
                    style={{ background: e.bg }}
                  >
                    {e.img ? (
                      <>
                        <span aria-hidden="true" className="absolute text-[15px] font-bold" style={{ color: e.fbColor || "#0a0506", opacity: 0 }}>{e.label[0]}</span>
                        <img
                          src={e.img}
                          alt={e.label}
                          className="relative h-full w-full object-contain p-2"
                          onError={(ev) => { ev.currentTarget.style.display = "none"; const fb = ev.currentTarget.previousElementSibling; if (fb) fb.style.opacity = "1"; }}
                        />
                      </>
                    ) : (
                      <svg className="h-[25px] w-[25px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                        {e.glyph}
                      </svg>
                    )}
                  </span>

                  {/* hover tooltip — styled, matches LuxQuant theme */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                    style={{ background: "rgba(20,8,9,0.96)", border: "1px solid rgba(212,168,83,0.28)", boxShadow: "0 10px 24px rgba(0,0,0,0.55)" }}
                  >
                    {e.handle}
                    <span aria-hidden="true" className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45" style={{ background: "rgba(20,8,9,0.96)", borderRight: "1px solid rgba(212,168,83,0.28)", borderBottom: "1px solid rgba(212,168,83,0.28)" }} />
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-[13px] font-semibold text-white">{col.title}</p>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label} className="flex">
                    {renderLink(link)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mb-6 mt-12 h-px bg-white/[0.06]" />

        <div className="flex items-center justify-center text-[11px] text-white/40">
          <div className="flex flex-wrap items-center justify-center gap-2 font-mono">
            <span>© {new Date().getFullYear()} LuxQuant</span>
            <span className="text-white/20">·</span>
            <span>Built since 2023</span>
            <span className="hidden text-white/20 sm:inline">·</span>
            <span className="hidden sm:inline">All rights reserved</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
