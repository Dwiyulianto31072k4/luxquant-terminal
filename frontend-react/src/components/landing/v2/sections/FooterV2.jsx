// src/components/landing/v2/sections/FooterV2.jsx
// Clean product footer + restored ecosystem logo tiles
// (Telegram, X, IG, partners) under brand.

import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { isPremiumUser } from "../../../../utils/roles";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { CTA } from "../landingCopy";

export default function FooterV2({ onNav }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isPremium = isPremiumUser(user);

  const goFeature = (path) => {
    if (isAuthenticated) {
      navigate(path);
      return;
    }
    trackFunnel("cta_click", { source: "footer_feature", path });
    navigate(loginUrl(path, { source: "footer_feature" }));
  };

  // Same defect the section CTA had: a link labelled "Open terminal" that sent
  // everyone to /home, while /terminal is premium-gated — so it was a promise
  // for a paying member and a dead end for everyone else.
  const terminalLabel = isPremium
    ? CTA.openTerminal
    : isAuthenticated
      ? CTA.seePlans
      : CTA.primaryGuest;

  const openTerminal = () => {
    if (isPremium) {
      trackFunnel("cta_click", { source: "footer_terminal:open", path: "/" });
      navigate("/terminal");
      return;
    }
    if (isAuthenticated) {
      trackFunnel("cta_click", { source: "footer_terminal:plans", path: "/" });
      navigate("/pricing");
      return;
    }
    trackFunnel("cta_click", { source: "footer_terminal", path: "/" });
    navigate(loginUrl("/pricing", { source: "footer_terminal" }));
  };

  const COLUMNS = [
    {
      title: "Product",
      links: [
        { label: "Signals", type: "feature", to: "/signals" },
        { label: "Agent", type: "feature", to: "/autotrade" },
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
        { label: terminalLabel, type: "terminal" },
      ],
    },
  ];

  // One tile for every destination — same size, radius, border, ink. Glyphs
  // are monochrome; partner marks sit on the same chrome so the row is a set,
  // not six different app icons.
  const ECOSYSTEM = [
    {
      label: "Telegram",
      handle: "Free signals group",
      href: "https://t.me/LuxQuantSignal",
      glyph: (
        <path d="M21.2 3.4 2.9 10.5c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 10.8-6.8c.5-.3 1-.1.6.2l-8.8 7.9-.3 4.7c.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9l3.3-15.5c.3-1.4-.5-2-1.5-1.6z" />
      ),
    },
    {
      label: "X",
      handle: "@luxquantalgo",
      href: "https://x.com/luxquantalgo",
      glyph: (
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      ),
    },
    {
      label: "Instagram",
      handle: "@luxquant.tw",
      href: "https://instagram.com/luxquant.tw",
      glyph: (
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM5.838 12a6.162 6.162 0 1112.324 0 6.162 6.162 0 01-12.324 0zM12 16a4 4 0 110-8 4 4 0 010 8zm4.965-10.405a1.44 1.44 0 112.881.001 1.44 1.44 0 01-2.881-.001z" />
      ),
    },
    {
      label: "Daily Rekom Crypto",
      handle: "Look on LQ Premium+ Highlight",
      href: "https://www.instagram.com/dailyrekomcrypto/",
      img: "/DRC%20LOGO.webp",
    },
    {
      label: "CryptoNewsCanada",
      handle: "cryptonewscanada.com",
      href: "https://cryptonewscanada.com",
      img: "/CryptoNewsCanadaLogo.webp",
    },
    {
      label: "CryptoLeb",
      handle: "cryptoleb.ai",
      href: "https://cryptoleb.ai",
      img: "/CryptoLebLogo.webp",
    },
  ];

  const renderLink = (link) => {
    const cls =
      "text-[13px] text-text-muted transition-colors duration-150 hover:text-text-primary";
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
    <footer className="lq-app-footer relative z-10 border-t border-ink/[0.08] bg-surface-raised">
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
            <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
              Market intelligence for crypto — signals, execution, on-chain context, and research in
              one terminal.
            </p>

            <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Follow LuxQuant">
              {ECOSYSTEM.map((e) => (
                <a
                  key={e.label}
                  href={e.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${e.label} — ${e.handle}`}
                  title={`${e.label} · ${e.handle}`}
                  role="listitem"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink/12 bg-ink/[0.04] text-text-primary transition-colors hover:border-ink/20 hover:bg-ink/[0.08]"
                >
                  {e.img ? (
                    <img
                      src={e.img}
                      alt=""
                      className="h-[18px] w-[18px] object-contain"
                      onError={(ev) => {
                        ev.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
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
                <p className="mb-3.5 text-[12px] font-semibold tracking-wide text-text-secondary">
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
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-ink/[0.08] pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] text-text-muted">
            © {new Date().getFullYear()} LuxQuant · Since 2023
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            <Link to="/pricing" className="transition-colors hover:text-text-primary">
              Pricing
            </Link>
            <Link to="/status" className="transition-colors hover:text-text-primary">
              Status
            </Link>
            <Link to="/learn" className="transition-colors hover:text-text-primary">
              Learn
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
