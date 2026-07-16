// src/components/landing/v2/sections/TerminalPreview.jsx
// ════════════════════════════════════════════════════════════════
// TERMINAL PREVIEW — V2.
//   • Realistic iMac mockup (silver chin + Apple logo + stand).
//   • Top 5 flagship features, named + iconed to MATCH the More menu
//     (icons copied 1:1 from MoreMenuDropdown for consistency).
//   • "signal" → "algo call"; AutoTrade → "Agent".
//   • Last slide = "...and much more" panel rendered INSIDE the iMac,
//     containing the Access-LuxQuant sign-up pill.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import HeroSignupPill from "./shared/HeroSignupPill";

/* ── Icons — copied from MoreMenuDropdown so the section matches the menu ── */
const svgProps = {
  className: "h-[22px] w-[22px] sm:h-6 sm:w-6",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
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
      <path d="M9.25 7 V4.5" /><circle cx="9.25" cy="3.4" r="0.85" />
      <circle cx="7" cy="11.3" r="1" /><circle cx="11.5" cy="11.3" r="1" />
      <path d="M3.5 11 H2.2 M15 11 H16.3" />
      <circle cx="17.8" cy="17.3" r="2.1" />
      <path d="M17.8 14.6 v0.8 M17.8 20 v-0.8 M15.1 17.3 h0.8 M20.5 17.3 h-0.8 M16 15.5 l0.55 0.55 M19.6 19.1 l-0.55 -0.55 M19.6 15.5 l-0.55 0.55 M16 19.1 l0.55 -0.55" />
    </svg>
  ),
  ai: (
    <svg {...svgProps}>
      <circle cx="11" cy="11" r="6" /><path d="M15.5 15.5 L21 21" />
      <path d="M11 8.5 v5 M8.5 11 h5" strokeOpacity="0.55" />
    </svg>
  ),
  onchain: (
    <svg {...svgProps}>
      <circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="14" r="2.4" /><circle cx="6" cy="20" r="1.8" /><circle cx="18" cy="20" r="1.8" />
      <line x1="7.4" y1="7.4" x2="10.4" y2="12.2" /><line x1="16.6" y1="7.4" x2="13.6" y2="12.2" /><line x1="10.6" y1="15.8" x2="7.2" y2="18.4" /><line x1="13.4" y1="15.8" x2="16.8" y2="18.4" />
    </svg>
  ),
  pulse: (
    <svg {...svgProps}>
      <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />
    </svg>
  ),
  more: (
    <svg {...svgProps}>
      <path d="M12 3l1.7 5 5 1.7-5 1.7L12 16.4l-1.7-5-5-1.7 5-1.7z" />
      <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" strokeOpacity="0.6" />
    </svg>
  ),
};

/* ── Top 5 features (names match the More menu) + the closing slide ── */
const FEATURES = [
  {
    id: "signals",
    title: "Algo Calls",
    desc: "Precise entries, multiple take-profit targets, and strict stop-loss levels — every algo call auto-delivered 24/7 with risk scoring and volume ranking.",
    macImg: "/mockups/mac-signals.png",
    icon: ICONS.signals,
  },
  {
    id: "agent",
    title: "Agent",
    desc: "Agentic trading that executes for you — connect your exchange and let the agent act on every algo call 24/7 with strict, smart risk management.",
    macImg: "/mockups/mac-autotrade.png",
    icon: ICONS.agent,
  },
  {
    id: "ai",
    title: "AI Research",
    desc: "A dedicated AI analyst processing millions of data points per hour — price action, derivatives flow, on-chain metrics, sentiment, and news — into one clear market verdict.",
    macImg: "/mockups/mac-ai.png",
    icon: ICONS.ai,
  },
  {
    id: "onchain",
    title: "On-Chain",
    desc: "Real-time on-chain metrics, smart-money flows, large wallet movements, and exchange netflow — see what whales are doing before price reacts.",
    macImg: "/mockups/mac-onchain.png",
    icon: ICONS.onchain,
  },
  {
    id: "pulse",
    title: "Market Pulse",
    desc: "A real-time market overview — bull/bear ratio, momentum, activity feed, heatmap, and the most active coins. Feel the pulse of the market at a glance.",
    macImg: "/mockups/mac-pulse.png",
    icon: ICONS.pulse,
  },
];

const MORE_SLIDE = {
  id: "more",
  title: "…and much more",
  desc: "Markets, Pulse, Money Flow, Bitcoin, News, Journal, Portfolio & more — everything a serious trader needs, already built into the terminal.",
  isMore: true,
  icon: ICONS.more,
};

const TABS = [...FEATURES, MORE_SLIDE];

function AppleLogo({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.35 1.206-3.08.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

export default function TerminalPreview() {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % TABS.length;
        scrollToTab(next);
        return next;
      });
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  const scrollNav = (dir) => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -280 : 280, behavior: "smooth" });
  };
  const scrollToTab = (i) => {
    const c = scrollRef.current;
    const el = c?.children[i];
    if (c && el) c.scrollTo({ left: el.offsetLeft - c.offsetWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  };
  const handleTab = (i) => { setActiveIdx(i); scrollToTab(i); };

  const active = TABS[activeIdx];

  return (
    <section id="terminal-preview" className="relative z-10 w-full overflow-hidden pb-16 pt-20 lg:pb-24 lg:pt-28">
      {/* HEADER */}
      <div className="mx-auto mb-10 max-w-7xl px-4 text-center lg:px-8">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-text-primary lg:text-[2.6rem]">
          Interactive{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark bg-clip-text text-transparent">
            Terminal Preview
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-text-primary/55 lg:text-base">
          Explore the analytical tools that give you a clear quantitative edge, now unified in one dashboard.
        </p>
      </div>

      {/* TABS */}
      <div className="relative mx-auto mb-8 w-full max-w-4xl px-4 lg:px-12">
        <button
          onClick={() => scrollNav("left")}
          className="absolute left-0 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-text-primary/30 transition-all hover:text-gold-primary lg:flex"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>

        <div ref={scrollRef} className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-7 lg:gap-9 [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => handleTab(idx)}
              className={`relative flex flex-shrink-0 snap-center flex-col items-center justify-center gap-2 px-2 py-3 transition-all duration-300 ${
                activeIdx === idx ? "text-text-primary" : "text-text-muted hover:text-text-primary/80"
              }`}
            >
              <div className={`transition-all duration-300 ${activeIdx === idx ? "scale-110 text-gold-primary drop-shadow-[0_0_8px_rgba(212,168,83,0.5)]" : "text-current opacity-60"}`}>
                {t.icon}
              </div>
              <span className="whitespace-nowrap text-[13px] font-semibold tracking-wide sm:text-sm">{t.title}</span>
              {activeIdx === idx && (
                <div className="absolute bottom-0 left-1/2 h-[2px] w-[60%] -translate-x-1/2 bg-gradient-to-r from-transparent via-gold-primary to-transparent shadow-[0_0_10px_rgba(212,168,83,0.8)]" />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => scrollNav("right")}
          className="absolute right-0 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-text-primary/30 transition-all hover:text-gold-primary lg:flex"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* ACTIVE DESCRIPTION */}
      <div className="mx-auto mb-10 flex h-[78px] max-w-3xl items-center justify-center px-4 text-center sm:h-[58px] lg:mb-12">
        <p key={activeIdx} className="animate-[fadeIn_0.5s_ease-out] text-sm leading-relaxed text-text-primary/60 lg:text-base">
          {active.desc}
        </p>
      </div>

      {/* iMAC MOCKUP */}
      <div className="relative mx-auto max-w-5xl px-4 lg:px-8">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-primary/10 blur-[120px]" />

        <div className="relative mx-auto w-full max-w-[420px] sm:max-w-[560px] lg:max-w-[800px]">
          {/* iMac body: black glass + silver chin */}
          <div className="relative overflow-hidden rounded-[12px] bg-black shadow-[0_40px_90px_rgba(0,0,0,0.6),0_0_70px_rgba(212,168,83,0.1)] ring-1 ring-white/[0.07] lg:rounded-[16px]">
            <div className="p-[7px] sm:p-[8px] lg:p-[11px]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[2px] bg-surface ring-1 ring-white/[0.05] lg:rounded-[3px]">
                {/* feature screenshots — cross-fade */}
                {FEATURES.map((f, idx) => (
                  <img
                    key={f.id}
                    src={f.macImg}
                    alt={`${f.title} preview`}
                    className={`absolute inset-0 h-full w-full object-cover object-top transition-all duration-700 ease-in-out ${
                      activeIdx === idx ? "z-10 scale-100 opacity-100" : "z-0 scale-[1.02] opacity-0"
                    }`}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ))}

                {/* closing "…and much more" panel + Access pill */}
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center transition-all duration-700 ${
                    active.isMore ? "z-20 opacity-100" : "z-0 opacity-0"
                  }`}
                  style={{ background: "radial-gradient(ellipse 80% 80% at 50% 40%, #140a0b 0%, #0a0506 60%, #050302 100%)" }}
                >
                  <span className="h-px w-14 bg-gradient-to-r from-transparent via-gold-primary/60 to-transparent" />
                  <h3 className="text-xl font-bold text-text-primary sm:text-2xl lg:text-3xl">
                    …and much <span className="bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark bg-clip-text text-transparent">more</span>
                  </h3>
                  <p className="hidden max-w-md text-xs leading-relaxed text-text-primary/55 sm:block sm:text-sm">
                    Everything else a serious trader needs — already built into the terminal.
                  </p>
                  <div className="mt-1 w-full max-w-[340px]">
                    <HeroSignupPill text="Access LuxQuant Terminal" className="!max-w-[340px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* silver chin + Apple logo */}
            <div className="flex h-[26px] items-center justify-center bg-gradient-to-b from-text-primary via-[#d8dadd] to-[#c4c6ca] sm:h-[32px] lg:h-[44px]">
              <AppleLogo className="h-[13px] w-[13px] text-surface sm:h-[15px] sm:w-[15px] lg:h-[20px] lg:w-[20px]" />
            </div>
          </div>

          {/* aluminium stand */}
          <div className="relative mx-auto -mt-px w-[39%] max-w-[240px]">
            <svg viewBox="0 0 150 50" className="block h-auto w-full" aria-hidden="true">
              <defs>
                <linearGradient id="tpImacStand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e2e4e7" /><stop offset="0.5" stopColor="#c3c5c9" /><stop offset="1" stopColor="#9fa1a5" />
                </linearGradient>
                <linearGradient id="tpImacStandShade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" /><stop offset="0.5" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity="0.16" />
                </linearGradient>
              </defs>
              <path d="M52,0 L98,0 Q95,12 92,22 Q102,33 126,42 Q132,44 132,46.5 Q132,49 128,49 L22,49 Q18,49 18,46.5 Q18,44 24,42 Q48,33 58,22 Q55,12 52,0 Z" fill="url(#tpImacStand)" />
              <path d="M52,0 L98,0 Q95,12 92,22 Q102,33 126,42 Q132,44 132,46.5 Q132,49 128,49 L22,49 Q18,49 18,46.5 Q18,44 24,42 Q48,33 58,22 Q55,12 52,0 Z" fill="url(#tpImacStandShade)" />
            </svg>
          </div>
          <div aria-hidden="true" className="mx-auto -mt-1.5 h-3.5 w-[36%] rounded-[50%] bg-black/50 blur-md" />
        </div>
      </div>
    </section>
  );
}
