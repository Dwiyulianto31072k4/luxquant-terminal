// frontend-react/src/components/landing/FeatureSliderSection.jsx
import { useState, useEffect, useRef } from "react";

/* ================================================================
 FEATURES DATA — 10 core features (asli, restored from commit 8084951)
 ================================================================ */
const FEATURES = [
  {
    id: "signals",
    title: "Algorithmic Signals",
    desc: "Precise entry, multiple take-profit targets, and strict stop-loss levels — auto-delivered 24/7 with risk scoring and volume ranking on every single call.",
    macImg: "/mockups/mac-signals.png",
    phoneImg: "/mockups/phone-signals.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
        />
      </svg>
    ),
  },
  {
    id: "ai-researcher",
    title: "AI Researcher",
    desc: "A dedicated AI analyst processing millions of data points per hour — price action, derivatives flow, on-chain metrics, sentiment, and breaking news — compressed into one clear market verdict.",
    macImg: "/mockups/mac-ai.png",
    phoneImg: "/mockups/phone-ai.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
        />
      </svg>
    ),
  },
  {
    id: "onchain",
    title: "On-Chain Intelligence",
    desc: "Real-time on-chain metrics, smart money flows, large wallet movements, and exchange netflow — see what whales are doing before price reacts.",
    macImg: "/mockups/mac-onchain.png",
    phoneImg: "/mockups/phone-onchain.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-9.193a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244"
        />
      </svg>
    ),
  },
  {
    id: "whale",
    title: "Whale Surveillance",
    desc: "See what the big players are doing before the crowd reacts. Real-time tracking of massive transfers and exchange flows across major blockchains.",
    macImg: "/mockups/mac-whale.png",
    phoneImg: "/mockups/phone-whale.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M22 12h-2M12 2v2M4 12H2M12 22v-2"
        />
      </svg>
    ),
  },
  {
    id: "orderbook",
    title: "Order Book Heatmap",
    desc: "Spot hidden liquidity walls and know exactly where the real support and resistance sit — straight from live order flow data.",
    macImg: "/mockups/mac-orderbook.png",
    phoneImg: "/mockups/phone-orderbook.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 18v-6h3v-3h3v9H3zm18 0v-8h-3v-4h-3v12h6zM12 22V2M3 22h18"
        />
      </svg>
    ),
  },
  {
    id: "proof",
    title: "Visual Trade Proof",
    desc: "We don't just call trades — we prove them. Branded before-and-after chart captures with a step-by-step journey timeline from entry to each TP hit.",
    macImg: "/mockups/mac-proof.png",
    phoneImg: "/mockups/phone-proof.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 4H6a2 2 0 00-2 2v2m16 0V6a2 2 0 00-2-2h-2M8 20H6a2 2 0 01-2-2v-2m16 0v2a2 2 0 01-2 2h-2M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
  {
    id: "portfolio",
    title: "Portfolio & Analytics",
    desc: "Real-time PnL tracking, equity curve, win rate, risk-adjusted performance, and complete trade history — all in one powerful dashboard.",
    macImg: "/mockups/mac-portfolio.png",
    phoneImg: "/mockups/phone-portfolio.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
        />
      </svg>
    ),
  },
  {
    id: "pulse",
    title: "Market Pulse",
    desc: "Real-time market overview with bull/bear ratio, event tracking, activity feed, heatmap, and most active coins — feel the pulse of the market.",
    macImg: "/mockups/mac-pulse.png",
    phoneImg: "/mockups/phone-pulse.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
  {
    id: "news",
    title: "Crypto News",
    desc: "Real-time crypto news aggregator with live feed, featured stories, trending topics, and multi-source coverage — stay informed 24/7.",
    macImg: "/mockups/mac-news.png",
    phoneImg: "/mockups/phone-news.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
        />
      </svg>
    ),
  },
  {
    id: "autotrade",
    title: "AutoTrade",
    desc: "Coming Soon — Automated execution with smart risk management. Connect your exchange and let the system trade for you 24/7.",
    macImg: "/mockups/mac-autotrade.png",
    phoneImg: "/mockups/phone-autotrade.png",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 002.572 1.065c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

const FeatureSliderSection = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveIdx((prev) => {
        const nextIdx = (prev + 1) % FEATURES.length;
        scrollToActiveTab(nextIdx);
        return nextIdx;
      });
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  const scrollNav = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const scrollToActiveTab = (index) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const tabElement = container.children[index];
      if (tabElement) {
        const scrollPosition =
          tabElement.offsetLeft - container.offsetWidth / 2 + tabElement.offsetWidth / 2;
        container.scrollTo({ left: scrollPosition, behavior: "smooth" });
      }
    }
  };

  const handleTabClick = (idx) => {
    setActiveIdx(idx);
    scrollToActiveTab(idx);
  };

  return (
    <section
      id="features"
      className="relative z-10 w-full pt-20 lg:pt-28 pb-16 lg:pb-24 overflow-hidden"
    >
      {/* HEADER */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-ink/10 bg-accent/10 rounded-full mb-4">
          <span className="text-accent font-mono text-[9px] uppercase tracking-[0.3em]">
            Core Technology
          </span>
        </div>
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-text-primary mb-4">
          Interactive{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-ink to-accent">
            Terminal Preview
          </span>
        </h2>
        <p className="text-text-secondary text-sm lg:text-base max-w-2xl mx-auto">
          Explore the analytical tools that give you a clear quantitative edge, now unified in one
          dashboard.
        </p>
      </div>

      {/* 1. SEAMLESS HORIZONTAL NAVIGATION TABS */}
      <div className="w-full relative max-w-7xl mx-auto mb-8 px-4 lg:px-12">
        {/* Transparent Left Controller */}
        <button
          onClick={() => scrollNav("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden lg:flex items-center justify-center text-text-primary/30 hover:text-text-primary transition-all bg-transparent focus:outline-none"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* CONTAINER SCROLL MENU */}
        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-6 lg:gap-8 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-4 py-2"
        >
          {FEATURES.map((feat, idx) => (
            <button
              key={feat.id}
              onClick={() => handleTabClick(idx)}
              className={`flex flex-col items-center justify-center gap-2 px-2 py-3 flex-shrink-0 snap-center transition-all duration-300 relative focus:outline-none [-webkit-tap-highlight-color:transparent] ${
                activeIdx === idx
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-primary/80"
              }`}
            >
              <div
                className={`transition-all duration-300 ${activeIdx === idx ? "text-accent drop-shadow-[0_0_8px_rgb(var(--accent) / 0.5)] scale-110" : "text-current opacity-60"}`}
              >
                {feat.icon}
              </div>
              <span className="font-semibold text-sm tracking-wide whitespace-nowrap">
                {feat.title}
              </span>

              {/* Elegant Bottom Underline Indicator for Active Tab */}
              {activeIdx === idx && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[2px] bg-gradient-to-r from-transparent via-ink to-transparent shadow-[0_0_10px_rgb(var(--accent) / 0.8)]" />
              )}
            </button>
          ))}
        </div>

        {/* Transparent Right Controller */}
        <button
          onClick={() => scrollNav("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden lg:flex items-center justify-center text-text-primary/30 hover:text-text-primary transition-all bg-transparent focus:outline-none"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 2. ACTIVE DESCRIPTION TEXT */}
      <div className="max-w-3xl mx-auto px-4 text-center mb-10 lg:mb-12 h-[80px] sm:h-[60px] flex items-center justify-center">
        <p
          key={activeIdx}
          className="text-text-secondary text-sm lg:text-base leading-relaxed animate-[fadeIn_0.5s_ease-out]"
        >
          {FEATURES[activeIdx].desc}
        </p>
      </div>

      {/* ════════════════════════════════════════
 3. MOCKUPS — Hanya Mac (iPhone dihapus)
 ════════════════════════════════════════ */}
      <div className="relative max-w-5xl mx-auto px-4 lg:px-8 mt-4 mb-16 lg:mb-24">
        {/* Ambient gold glow di belakang */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-accent/12 blur-[120px] rounded-full pointer-events-none -z-10" />

        {/* MAC MOCKUP — Full centered */}
        <div className="relative w-full max-w-[360px] sm:max-w-[500px] lg:max-w-[850px] mx-auto aspect-[16/10] bg-surface-raised rounded-xl sm:rounded-2xl lg:rounded-3xl border border-ink/10 shadow-[0_20px_40px_rgb(var(--scrim) / 0.35)] lg:shadow-[0_30px_80px_rgb(var(--scrim) / 0.8)] overflow-hidden z-10 transition-all duration-500">
          {/* Browser chrome */}
          <div className="h-6 lg:h-8 bg-surface-secondary flex items-center px-4 gap-2 border-b border-ink/5 w-full absolute top-0 z-20">
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-negative/80" />
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-accent/80" />
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-positive/80" />
            <div className="mx-auto bg-scrim/40 px-6 py-0.5 rounded text-[8px] lg:text-[10px] text-text-primary/30 font-mono tracking-widest">
              luxquant.tw
            </div>
          </div>

          {/* Screen content */}
          <div className="relative w-full h-full pt-6 lg:pt-8 bg-surface">
            <div className="absolute inset-0 flex flex-col items-center justify-center z-0 text-text-primary/10 text-xs font-mono">
              Awaiting Screenshots...
            </div>
            {FEATURES.map((feat, idx) => (
              <img
                key={`mac-${feat.id}`}
                src={feat.macImg}
                alt={`${feat.title} Desktop`}
                className={`absolute top-6 lg:top-8 left-0 w-full h-[calc(100%-1.5rem)] lg:h-[calc(100%-2rem)] object-cover object-top transition-all duration-700 ease-in-out ${
                  activeIdx === idx ? "opacity-100 z-10 scale-100" : "opacity-0 z-0 scale-[1.02]"
                }`}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 4. SEAMLESS "...AND MUCH MORE" FOOTER (diperbaiki) */}
      <div className="max-w-4xl mx-auto px-4 relative z-20 text-center">
        <div className="w-16 h-px bg-gradient-to-r from-transparent via-ink/15 to-transparent mx-auto mb-6" />

        <h3 className="font-display text-xl lg:text-2xl font-bold text-text-primary mb-2">
          ...and much <span className="text-accent">more</span>
        </h3>
        <p className="text-text-secondary text-sm lg:text-base leading-relaxed max-w-2xl mx-auto">
          Everything else a serious market participant needs, already built in and waiting for you
          inside the terminal. No extra plugins, no hidden fees.
        </p>
      </div>
    </section>
  );
};

export default FeatureSliderSection;
