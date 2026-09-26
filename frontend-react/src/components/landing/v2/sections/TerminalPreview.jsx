// src/components/landing/v2/sections/TerminalPreview.jsx
// Product gallery: real screenshots inside a reversible laptop reveal.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { isPremiumUser } from "../../../../utils/roles";
import { CTA } from "../landingCopy";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";
import "./TerminalPreview.css";

// Where this section's CTA should land someone after the login door. The
// section sells the premium product, so /pricing is the page that answers it —
// /home discarded the interest the ten preceding screens just built.
const SECTION_REDIRECT = "/pricing";

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
  signalDetail: (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v5M8 14h4m-2-2v4" />
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
  flow: (
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
    title: "Algo Signals",
    short: "Find a plan as momentum moves",
    desc: "Explore algorithm-generated calls dating back to 2023. Filter by coin, status, Coin Flow and narratives, then open a call to inspect its entry, targets and stops.",
    img: "/mockups/landing-algo-signals-16x9.webp",
    alt: "Algo Signals showing Coin Flow, narratives, filters and timestamped signal results",
    icon: ICONS.signals,
  },
  {
    id: "signal-detail",
    title: "Signal Plan & Proof",
    short: "Check the levels and the outcome",
    desc: "This QNT/USDT example puts the live chart, published entry, four targets and two stops beside the before-and-after record. Inspect the plan and what happened before acting on another call.",
    img: "/mockups/landing-signal-plan-proof-16x9.webp",
    alt: "QNT/USDT signal detail with live chart, entry, targets, stops and before-and-after proof",
    icon: ICONS.signalDetail,
  },
  {
    id: "flow",
    title: "Coin Flow",
    short: "See where momentum is rotating",
    desc: "Compare coins that woke up, trading activity and narrative performance. Follow capital rotation to decide which coin or theme deserves your attention next.",
    img: "/mockups/landing-coin-flow-16x9.webp",
    alt: "Coin Flow table, narrative comparison and capital rotation charts",
    icon: ICONS.flow,
  },
  {
    id: "ai",
    title: "AI Research",
    short: "Let Bitcoin set the context",
    desc: "Read Bitcoin's current stance, target and invalidation levels, plus why the view changed. Use that context to size altcoin signals more carefully or wait for confirmation.",
    img: "/mockups/landing-ai-btc-research-16x9.webp",
    alt: "AI Research Bitcoin outlook with neutral stance, target, invalidation and update rationale",
    icon: ICONS.ai,
  },
  {
    id: "onchain",
    title: "On-Chain",
    short: "See the activity behind the chart",
    desc: "Filter large positions, whale and smart-money alerts across chains. Add that activity to your trade plan before deciding whether a move is worth following.",
    img: "/mockups/landing-onchain-16x9.webp",
    alt: "On-Chain Intelligence alerts with filters for positions, whales and smart money",
    icon: ICONS.onchain,
  },
  {
    id: "agent",
    title: "Agent",
    short: "Automation you can inspect and control",
    desc: "Connect one exchange, start in dry-run and pause when you choose. Review positions, fills, fees and exits to see what Agent actually did.",
    img: "/mockups/landing-agent-16x9.webp",
    alt: "Agent exchange connection options and detailed trade history with fees and exits",
    icon: ICONS.agent,
  },
];

const MORE_SLIDE = {
  id: "more",
  title: "More",
  short: "Market context and tools beyond the signal",
  desc: "Follow Pulse, Markets, Bitcoin and News. Review decisions in Journal and holdings in Portfolio.",
  isMore: true,
  icon: ICONS.more,
};

const MORE_TOOLS = [
  {
    name: "Pulse",
    detail: "What's moving",
    icon: <path d="M2 12h4l2-5 4 10 3-7 2 2h5" />,
  },
  {
    name: "Markets",
    detail: "Compare coins",
    icon: <path d="M4 20v-5m5 5V9m5 11V4m5 16v-9" />,
  },
  {
    name: "Bitcoin",
    detail: "BTC context",
    icon: <path d="M9 4v16m5-16v16M7 7h7a3 3 0 0 1 0 6H7m0 0h8a3 3 0 0 1 0 6H7" />,
  },
  {
    name: "News",
    detail: "What changed",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h4v4H7zm7 0h3M14 12h3M7 16h10" />
      </>
    ),
  },
  {
    name: "Journal",
    detail: "Review decisions",
    icon: (
      <>
        <path d="M12 6c-2.2-1.3-5-1.7-9-1v14c4-.7 6.8-.3 9 1 2.2-1.3 5-1.7 9-1V5c-4-.7-6.8-.3-9 1z" />
        <path d="M12 6v14" />
      </>
    ),
  },
  {
    name: "Portfolio",
    detail: "Track holdings",
    icon: (
      <>
        <path d="M11 3a9 9 0 1 0 10 10h-10z" />
        <path d="M14 3v7h7a9 9 0 0 0-7-7z" />
      </>
    ),
  },
];

const TABS = [...FEATURES, MORE_SLIDE];

export default function TerminalPreview() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isPremium = isPremiumUser(user);
  const [activeIdx, setActiveIdx] = useState(0);
  const [displayedIdx, setDisplayedIdx] = useState(0);
  const [readySlideId, setReadySlideId] = useState(null);
  const [laptopRevealing, setLaptopRevealing] = useState(false);
  const [laptopOpened, setLaptopOpened] = useState(false);
  const laptopRef = useRef(null);
  const openedRef = useRef(false);

  useEffect(() => {
    const next = TABS[activeIdx];
    if (!next.img) {
      setDisplayedIdx(activeIdx);
      setReadySlideId(next.id);
      return;
    }

    // Keep the previous screenshot in the display until the next one can paint.
    let cancelled = false;
    const image = new Image();
    const showImage = () => {
      if (cancelled) return;
      setDisplayedIdx(activeIdx);
      setReadySlideId(next.id);
    };
    image.onload = showImage;
    image.src = next.img;
    if (image.complete && image.naturalWidth > 0) showImage();
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [activeIdx]);

  useEffect(() => {
    const laptop = laptopRef.current;
    if (!laptop) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = laptop.getBoundingClientRect();
      const headerBottom = window.innerWidth >= 768 ? 84 : 0;
      const fullyLeaving = rect.top < headerBottom - 8 || rect.top > window.innerHeight - 80;
      const safeToOpen = rect.top >= headerBottom + 12 && rect.top <= window.innerHeight * 0.72;

      // Re-entering from below must wait until the lid clears the fixed header.
      const imageReady = readySlideId === TABS[activeIdx].id;
      if (openedRef.current ? fullyLeaving : safeToOpen && imageReady) {
        openedRef.current = !openedRef.current;
        setLaptopOpened(openedRef.current);
      }
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    setLaptopRevealing(true);
    scheduleUpdate();
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeIdx, readySlideId]);

  // Manual tabs only — auto-rotate competes with reading product UI.
  const handleTab = (i) => {
    setActiveIdx(i);
  };

  const active = TABS[activeIdx];
  const displayed = TABS[displayedIdx];
  const isSignalsPreview = active.id === "signals" || active.id === "signal-detail";

  // Three different people read this button and only one of them can open a
  // terminal. It used to say "Open terminal" to every signed-in visitor and then
  // send them to /home — /terminal is premium-gated, so a free account was being
  // offered a door it could not walk through.
  const ctaLabel = isPremium
    ? isSignalsPreview
      ? "Open Signals"
      : CTA.openTerminal
    : CTA.seePlans;

  const goFree = () => {
    if (isPremium) {
      trackFunnel("cta_click", { source: "terminal_preview:open", path: "/" });
      navigate(isSignalsPreview ? "/signals" : "/terminal");
      return;
    }
    // A guest used to be told "Create free account" and then handed /pricing —
    // the label named one thing and the button did another, which is the same
    // message-match break the button itself was fixed for this morning. And
    // /pricing is public, so the login wall in front of it was buying nothing:
    // it hid the price from exactly the person deciding whether to pay, in a
    // category where a hidden price reads as a reason to be suspicious.
    // Signing up still happens where it has to — /pricing → /payment needs an
    // account — but now with intent behind it.
    trackFunnel("cta_click", {
      source: isAuthenticated ? "terminal_preview:plans" : "terminal_preview",
      path: "/",
    });
    navigate(SECTION_REDIRECT);
  };

  return (
    <section
      id="terminal-preview"
      data-lq-self
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
        <h2 className="mt-3 sm:mt-4 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:text-[38px] lg:text-[48px]">
          Spot the opportunity.{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            Trade with a plan.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] font-medium leading-[1.64] text-text-muted sm:text-[17px] lg:text-[20px]">
          Explore the real tools behind each decision: algorithmic calls, live charts, verifiable
          proof, market context and automation.
        </p>
      </div>

      {/* Keep every module visible on narrow screens; no clipped tabs or sideways scrolling. */}
      <div className="mx-auto mt-8 max-w-5xl sm:mt-10">
        <div
          role="tablist"
          aria-label="Terminal modules"
          className="isolate flex flex-wrap justify-center gap-x-2 gap-y-2 pb-2 pt-1 lg:gap-x-3"
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
                className="lq-terminal-tab inline-flex min-h-9 shrink-0 items-center rounded-full px-2.5 py-1.5 text-[12px] font-semibold lg:gap-1.5 lg:px-4 lg:py-2 lg:text-[13px]"
              >
                <span className={`hidden lg:inline-flex ${on ? "text-accent" : "opacity-70"}`}>
                  {t.icon}
                </span>
                {t.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* The screenshot stays intact; the laptop opens and closes with visibility. */}
      <div className="mx-auto mt-8 max-w-5xl sm:mt-10 lg:mt-12">
        <div
          ref={laptopRef}
          className={`lq-laptop-scene ${laptopRevealing ? "is-revealing" : ""} ${laptopOpened ? "is-open" : ""}`}
        >
          <div className="lq-laptop-lid">
            <div className="lq-laptop-bezel">
              <div className="lq-laptop-screen relative w-full">
                <span className="lq-laptop-camera" aria-hidden="true" />
                <div className="lq-laptop-display relative aspect-video w-full">
                  {displayed.img && (
                    <img
                      key={displayed.id}
                      src={displayed.img}
                      alt={displayed.alt}
                      loading="eager"
                      decoding="sync"
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  )}

                  {displayed.isMore && (
                    <div className="lq-more-panel absolute inset-0 flex flex-col items-center justify-center px-3 py-3 text-center sm:px-8 sm:py-8">
                      <h3 className="lq-more-title">Everything around the trade.</h3>
                      <span className="lq-more-divider" aria-hidden="true" />
                      <div className="lq-more-tools grid w-full grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6 sm:gap-x-4">
                        {MORE_TOOLS.map((tool) => (
                          <div key={tool.name} className="lq-more-tool flex flex-col items-center">
                            <svg {...svgProps} aria-hidden="true">
                              {tool.icon}
                            </svg>
                            <span className="lq-more-tool-name">{tool.name}</span>
                            <span className="lq-more-tool-detail">{tool.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="lq-laptop-base" aria-hidden="true" />
          <div className="lq-laptop-feet" aria-hidden="true">
            <span />
            <span />
          </div>
        </div>

        {/* Caption under stage */}
        <div className="mx-auto mt-5 max-w-xl text-center sm:mt-6">
          <p key={activeIdx} className="text-[14px] font-medium text-text-primary sm:text-[15px]">
            {active.title}
            <span className="font-normal text-text-muted"> — {active.short}</span>
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted sm:text-[14px]">
            {active.desc}
          </p>
          {active.img && (
            <a
              href={active.img}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[13px] font-semibold text-accent underline underline-offset-4 transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              View {active.title} screenshot at full size ↗
            </a>
          )}
        </div>

        {/* CTA */}
        {!active.isMore && (
          <div className="mt-7 flex justify-center sm:mt-8">
            <PrimaryButton size="lg" width="fullMobile" onClick={goFree} className="group">
              {ctaLabel}
              <BtnArrow />
            </PrimaryButton>
          </div>
        )}
      </div>
    </section>
  );
}
