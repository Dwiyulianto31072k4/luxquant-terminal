// src/components/landing/v2/sections/FooterV2.jsx
// Minimal product footer — OpenAI / Anthropic / SpaceXAI tone.
// Clean columns, quiet socials, no noisy 3D icon grid.

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

  const SOCIALS = [
    { label: "X", href: "https://x.com/luxquantcrypto" },
    { label: "Telegram", href: "https://t.me/LuxQuantSignal" },
    { label: "Instagram", href: "https://instagram.com/luxquant.tw" },
  ];

  const renderLink = (link) => {
    const cls =
      "text-[13px] text-white/40 transition-colors duration-150 hover:text-white/85";
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
        {/* Top: brand + blurb + socials */}
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-sm">
            <div className="mb-4 flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-md opacity-95" />
              <span className="text-[15px] font-semibold tracking-tight text-white">
                LuxQuant
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-white/40">
              Market intelligence for crypto — signals, execution, on-chain context,
              and research in one terminal.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-white/35 transition-colors hover:text-white/80"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:max-w-xl">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="mb-3.5 text-[12px] font-medium tracking-wide text-white/70">
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

        {/* Partners — quiet text row, not app-icon tiles */}
        <div className="mt-12 border-t border-white/[0.06] pt-8">
          <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-white/25">
            Partners
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-white/30">
            <a
              href="https://cryptonewscanada.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white/60"
            >
              CryptoNewsCanada
            </a>
            <a
              href="https://cryptoleb.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white/60"
            >
              CryptoLeb
            </a>
            <a
              href="https://www.instagram.com/dailyrekomcrypto/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white/60"
            >
              Daily Rekom Crypto
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] text-white/25">
            © {new Date().getFullYear()} LuxQuant · Since 2023
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/25">
            <Link to="/pricing" className="transition-colors hover:text-white/50">
              Pricing
            </Link>
            <Link to="/status" className="transition-colors hover:text-white/50">
              Status
            </Link>
            <Link to="/learn" className="transition-colors hover:text-white/50">
              Learn
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
