// src/components/landing/v2/sections/TerminalPreview.jsx
// Product stage — no device chrome. Large real UI, pill tabs, honest copy.
// Pattern: Linear / Vercel / Autopilot — show the product, not the hardware.

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import HeroSignupPill from "./shared/HeroSignupPill";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

const svgProps = {
  className: "h-4 w-4",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.75",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  signals: (
    <svg {...svgProps}>
      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  agent: (
    <svg {...svgProps}>
      <rect x="3.5" y="7" width="11.5" height="9.5" rx="2.5" />
      <path d="M9.25 7V4.5" />
      <circle cx="9.25" cy="3.4" r="0.85" />
      <circle cx="7" cy="11.3" r="1" />
      <circle cx="11.5" cy="11.3" r="1" />
      <path d="M3.5 11H2.2M15 11h1.3" />
      <circle cx="17.8" cy="17.3" r="2.1" />
    </svg>
  ),
  ai: (
    <svg {...svgProps}>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L21 21" />
      <path d="M11 8.5v5M8.5 11h5" strokeOpacity="0.55" />
    </svg>
  ),
  onchain: (
    <svg {...svgProps}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="14" r="2.4" />
      <circle cx="6" cy="20" r="1.8" />
      <circle cx="18" cy="20" r="1.8" />
      <line x1="7.4" y1="7.4" x2="10.4" y2="12.2" />
      <line x1="16.6" y1="7.4" x2="13.6" y2="12.2" />
      <line x1="10.6" y1="15.8" x2="7.2" y2="18.4" />
      <line x1="13.4" y1="15.8" x2="16.8" y2="18.4" />
    </svg>
  ),
  pulse: (
    <svg {...svgProps}>
      <path d="M3 12H7L9 6L13 18L15 12H21" />
    </svg>
  ),
  more: (
    <svg {...svgProps}>
      <path d="M12 3l1.7 5 5 1.7-5 1.7L12 16.4l-1.7-5-5-1.7 5-1.7z" />
    </svg>
  ),
};

const FEATURES = [
  {
    id: "signals",
    title: "Algo Calls",
    short: "Entry · TP · SL on every call",
    desc: "Precise entries, staged take-profits, hard stops — every call timestamped so you can audit it.",
    img: "/mockups/mac-signals.webp",
    icon: ICONS.signals,
  },
  {
    id: "agent",
    title: "Agent",
    short: "Executes under your limits",
    desc: "Connect exchange keys and let Agent follow the plan 24/7 — size, caps, and cooldowns stay yours.",
    img: "/mockups/mac-autotrade.webp",
    icon: ICONS.agent,
  },
  {
    id: "ai",
    title: "AI Research",
    short: "Regime reads in one desk",
    desc: "Price, derivatives, on-chain, and news compressed into a clear market read — not another feed to babysit.",
    img: "/mockups/mac-ai.webp",
    icon: ICONS.ai,
  },
  {
    id: "onchain",
    title: "On-Chain",
    short: "Whale moves, live",
    desc: "Smart-money flows, large wallets, exchange netflow — context before price reacts.",
    img: "/mockups/mac-onchain.webp",
    icon: ICONS.onchain,
  },
  {
    id: "pulse",
    title: "Pulse",
    short: "Market temperature",
    desc: "Bull/bear ratio, momentum, heatmap, and activity — feel the market without five tabs.",
    img: "/mockups/mac-pulse.webp",
    icon: ICONS.pulse,
  },
];

const MORE_SLIDE = {
  id: "more",
  title: "More",
  short: "Markets · Journal · Portfolio…",
  desc: "Markets, Money Flow, Bitcoin, News, Journal, Portfolio & more — one terminal, not three apps.",
  isMore: true,
  icon: ICONS.more,
};

const TABS = [...FEATURES, MORE_SLIDE];

export default function TerminalPreview() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const tabRef = useRef(null);

  useEffect(() => {
    if (paused) return undefined;
    const iv = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % TABS.length;
        scrollToTab(next);
        return next;
      });
    }, 6500);
    return () => clearInterval(iv);
  }, [paused]);

  const scrollToTab = (i) => {
    const c = tabRef.current;
    const el = c?.children?.[i];
    if (c && el) {
      c.scrollTo({
        left: el.offsetLeft - c.offsetWidth / 2 + el.offsetWidth / 2,
        behavior: "smooth",
      });
    }
  };

  const handleTab = (i) => {
    setActiveIdx(i);
    scrollToTab(i);
    setPaused(true);
    window.setTimeout(() => setPaused(false), 12000);
  };

  const active = TABS[activeIdx];

  const goFree = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    trackFunnel("cta_click", { source: "terminal_preview", path: "/" });
    navigate(loginUrl("/home", { source: "terminal_preview" }));
  };

  return (
    <section
      id="terminal-preview"
      className="relative z-10 w-full overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-28"
    >
      {/* ambient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[42%] -z-10 h-[420px] w-[min(90%,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.07] blur-[100px]"
      />

      {/* Header — honest, product-first */}
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          The terminal
        </p>
        <h2 className="mt-3 text-[1.85rem] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-4xl lg:text-[2.75rem]">
          One desk.{" "}
          <span className="text-accent">Every tool that matters.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[14px] leading-snug text-text-muted sm:mt-4 sm:text-base sm:leading-relaxed">
          Real product screens — switch a module and see the workspace. Free tools open first;
          live levels &amp; Agent when you upgrade.
        </p>
      </div>

      {/* Pill tabs — wrap on desktop, scroll on narrow without cut-off labels */}
      <div className="mx-auto mt-8 max-w-4xl sm:mt-10">
        <div
          ref={tabRef}
          role="tablist"
          aria-label="Terminal modules"
          className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t, idx) => {
            const on = activeIdx === idx;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => handleTab(idx)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors sm:px-4 ${
                  on
                    ? "bg-surface text-text-primary shadow-sm ring-1 ring-ink/10"
                    : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
                }`}
              >
                <span className={on ? "text-accent" : "opacity-70"}>{t.icon}</span>
                {t.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product stage — floating UI, no Mac chrome */}
      <div className="mx-auto mt-8 max-w-5xl sm:mt-10 lg:mt-12">
        <div
          className="relative overflow-hidden rounded-[1.25rem] border border-ink/[0.08] bg-surface-raised shadow-[0_24px_80px_rgb(var(--scrim)/0.35)] sm:rounded-[1.5rem]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* thin app chrome */}
          <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] bg-ink/[0.02] px-3.5 py-2.5 sm:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo.png"
                alt=""
                className="h-5 w-5 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="truncate text-[12px] font-medium text-text-primary/80 sm:text-[13px]">
                LuxQuant Terminal
              </span>
              <span className="hidden text-[11px] text-text-muted sm:inline">· {active.title}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2 py-0.5 text-[10px] font-medium text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Preview
            </span>
          </div>

          {/* screen */}
          <div className="relative aspect-[16/10] w-full bg-surface">
            {FEATURES.map((f, idx) => (
              <img
                key={f.id}
                src={f.img}
                alt={`${f.title} — LuxQuant Terminal`}
                loading={idx === 0 ? "eager" : "lazy"}
                className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ease-out ${
                  activeIdx === idx ? "z-10 opacity-100" : "z-0 opacity-0"
                }`}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ))}

            {/* More panel */}
            <div
              className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6 text-center transition-opacity duration-500 ${
                active.isMore ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
              style={{
                background:
                  "radial-gradient(ellipse 85% 80% at 50% 42%, rgb(var(--surface-raised)) 0%, rgb(var(--surface)) 70%)",
              }}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
                And more
              </p>
              <h3 className="max-w-md text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                Markets, Journal, Portfolio, News…
              </h3>
              <p className="max-w-sm text-[13px] leading-relaxed text-text-muted sm:text-[14px]">
                Free tools open first. Live levels &amp; Agent when you upgrade.
              </p>
              <div className="mt-1 w-full max-w-[320px]">
                <HeroSignupPill
                  text="Start free — no card"
                  shortText="Start free"
                  className="!max-w-[320px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Caption under stage */}
        <div className="mx-auto mt-5 max-w-xl text-center sm:mt-6">
          <p
            key={activeIdx}
            className="text-[14px] font-medium text-text-primary sm:text-[15px]"
          >
            {active.title}
            <span className="font-normal text-text-muted"> — {active.short}</span>
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted sm:text-[14px]">
            {active.desc}
          </p>
        </div>

        {/* CTA */}
        {!active.isMore && (
          <div className="mt-7 flex justify-center sm:mt-8">
            <PrimaryButton size="lg" width="fullMobile" onClick={goFree} className="group">
              {isAuthenticated ? "Open terminal" : "Create free account"}
              <BtnArrow />
            </PrimaryButton>
          </div>
        )}
      </div>
    </section>
  );
}
