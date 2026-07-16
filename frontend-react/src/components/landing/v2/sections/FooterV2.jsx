// src/components/landing/v2/sections/FooterV2.jsx
// Clean product footer + restored ecosystem logo tiles
// (Telegram, X, IG, partners) under brand.

import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";

export default function FooterV2({ onNav }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const goFeature = (path) =>
    isAuthenticated
      ? navigate(path)
      : navigate(`/login?redirect=${encodeURIComponent(path)}`);

  const openTerminal = () => navigate(isAuthenticated ? "/home" : "/login");

  const COLUMNS = [
    {
      title: "Product",
      links: [
        { label: "Signals", type: "feature", to: "/signals" },
        { label: "AutoTrade", type: "feature", to: "/autotrade" },
        { label: "AI Research", type: "feature", to: "/ai-arena" },
        { label: "Market Pulse", type: "feature", to: "/market-pulse" },
        { label: "On-Chain", type: "feature", to: "/onchain" },
        { label: "Performance", type: "feature", to: "/performance" },
      ],
    },
    {
      title: "Markets",
      links: [
        { label: "Markets", type: "feature", to: "/markets" },
        { label: "Bitcoin", type: "feature", to: "/bitcoin" },
        { label: "Order Book", type: "feature", to: "/orderbook" },
        { label: "Money Flow", type: "feature", to: "/money-flow" },
        { label: "Crypto News", type: "feature", to: "/crypto-news" },
        { label: "Calendar", type: "feature", to: "/calendar" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Pricing", type: "public", to: "/pricing" },
        { label: "Blog", type: "public", to: "/blog" },
        { label: "Learn", type: "public", to: "/learn" },
        { label: "Status", type: "public", to: "/status" },
        { label: "Referral", type: "feature", to: "/referral" },
        { label: "Open terminal", type: "terminal" },
      ],
    },
  ];

  // Ecosystem — brand-colored app icons (socials + partners)
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

  const renderLink = (link) => {
    const cls =
      "text-[13px] text-text-primary/40 transition-colors duration-150 hover:text-text-primary/85";
    if (link.type === "external") {
      return (
        <a href={link.to} target="_blank" rel="noopener noreferrer" className={cls}>
          {link.label}
        </a>
      );
    }
    if (link.type === "public") {
      return (
        <Link to={link.to} className={cls}>
          {link.label}
        </Link>
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

  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-transparent">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-6 lg:px-8 lg:pt-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          {/* Brand + ecosystem logos */}
          <div className="max-w-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-md opacity-95" />
              <span className="text-[15px] font-semibold tracking-tight text-text-primary">
                LuxQuant
              </span>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-text-primary/40">
              Market intelligence for crypto — signals, execution, on-chain context,
              and research in one terminal.
            </p>

            {/* Compact icon row — Stripe / OpenAI scale (~28–32px), tight gap */}
            <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Ecosystem">
              {ECOSYSTEM.map((e) => (
                <a
                  key={e.label}
                  href={e.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${e.label} — ${e.handle}`}
                  title={e.handle}
                  role="listitem"
                  className={`group flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border transition duration-150 ${
                    e.light
                      ? "border-white/[0.08] hover:border-white/20"
                      : "border-white/[0.08] hover:border-white/18"
                  } opacity-90 hover:opacity-100 hover:brightness-110`}
                  style={{ background: e.bg }}
                >
                  {e.img ? (
                    <img
                      src={e.img}
                      alt=""
                      className="h-full w-full object-contain p-1.5"
                      onError={(ev) => {
                        ev.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="#ffffff"
                      aria-hidden="true"
                    >
                      {e.glyph}
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:max-w-xl">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="mb-3.5 text-[12px] font-medium tracking-wide text-text-primary/70">
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label} className="flex">
                      {renderLink(link)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] text-text-primary/25">
            © {new Date().getFullYear()} LuxQuant · Since 2023
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-primary/25">
            <Link to="/pricing" className="transition-colors hover:text-text-primary/50">
              Pricing
            </Link>
            <Link to="/status" className="transition-colors hover:text-text-primary/50">
              Status
            </Link>
            <Link to="/learn" className="transition-colors hover:text-text-primary/50">
              Learn
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
