import { useState, useEffect } from "react";
import HeroSignupPill from "../shared/HeroSignupPill";

// ════════════════════════════════════════════════════════════════
// Hero video — sits INSIDE the page canvas (same grammar as
// RecentWinnersMarquee edge mask + Global Reach globe mask).
//
// Critical rule: never paint a solid dark shelf at the bottom.
// The media stack dissolves to TRANSPARENT so LandingPageV2's
// continuous maroon canvas shows through. That is what makes
// Real calls feel "inside" the same world, not under a cut.
// ════════════════════════════════════════════════════════════════

const HEADLINE_TOP = "Read the Market.";
const HEADLINE_BOTTOM = "Move With Conviction.";

const HERO_DESCRIPTION =
  "Real time market intelligence, capital flow insight, and quantified risk analysis powered by a 24/7 engine with a transparent track record since 2023.";

const VIDEO_DESKTOP = "/hero-video.mp4";
const VIDEO_MOBILE = "/hero-video-mobile.mp4";

// Aggressive bottom dissolve — media is fully gone by the last ~18%.
// Starts earlier than a soft vignette so there is no dark "bar" band.
const MEDIA_MASK = {
  WebkitMaskImage: `linear-gradient(
    to bottom,
    #000 0%,
    #000 42%,
    rgb(var(--scrim) / 0.94) 52%,
    rgb(var(--scrim) / 0.72) 62%,
    rgb(var(--scrim) / 0.35) 74%,
    rgb(var(--ink) / 0.18) 86%,
    rgb(var(--ink) / 0.05) 94%,
    transparent 100%
  )`,
  maskImage: `linear-gradient(
    to bottom,
    #000 0%,
    #000 42%,
    rgb(var(--scrim) / 0.94) 52%,
    rgb(var(--scrim) / 0.72) 62%,
    rgb(var(--scrim) / 0.35) 74%,
    rgb(var(--ink) / 0.18) 86%,
    rgb(var(--ink) / 0.05) 94%,
    transparent 100%
  )`,
};

export default function HeroSlideVideo() {
  const [hideHeadline, setHideHeadline] = useState(false);
  useEffect(() => {
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches;
    if (!isMobile) return;
    const t = setTimeout(() => setHideHeadline(true), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full min-h-[640px] sm:min-h-[710px] lg:min-h-[780px] xl:min-h-[820px]">
      {/* ── MEDIA LAYER (masked → transparent into page canvas) ── */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={MEDIA_MASK}
        aria-hidden="true"
      >
        {/* Mobile portrait */}
        <video
          className="absolute inset-0 h-full w-full object-cover object-center sm:hidden"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src={VIDEO_MOBILE} type="video/mp4" />
          <source src={VIDEO_DESKTOP} type="video/mp4" />
        </video>

        {/* Desktop / tablet landscape */}
        <video
          className="absolute inset-0 hidden h-full w-full scale-[1.06] object-cover sm:block"
          style={{ objectPosition: "50% 58%" }}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src={VIDEO_DESKTOP} type="video/mp4" />
        </video>

        {/* Top nav readability only (does not touch bottom) */}
        <div
          className="absolute inset-x-0 top-0 h-[28%]"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,5,6,0.55) 0%, rgba(10,5,6,0.22) 45%, transparent 100%)",
          }}
        />

        {/* Side vignette — horizontal only, bottom stays open */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(
                90deg,
                rgba(10,5,6,0.72) 0%,
                rgba(10,5,6,0.28) 14%,
                transparent 32%,
                transparent 68%,
                rgba(10,5,6,0.28) 86%,
                rgba(10,5,6,0.72) 100%
              )
            `,
          }}
        />

        {/* Soft gold atmosphere mid-frame (additive, not a shelf) */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(
                ellipse 55% 42% at 50% 34%,
                rgba(255,214,102,0.12) 0%,
                rgba(212,168,83,0.04) 42%,
                transparent 72%
              )
            `,
          }}
        />
      </div>

      {/* ── CONTENT (not masked — stays readable as media dissolves) ── */}
      <div className="relative z-10 mx-auto flex min-h-[640px] max-w-6xl flex-col items-center px-4 pb-16 pt-[6.5rem] text-center sm:min-h-[710px] sm:px-8 sm:pb-20 sm:pt-[11rem] lg:min-h-[780px] lg:px-10 lg:pb-24 lg:pt-[13rem] xl:min-h-[820px] xl:pb-28 xl:pt-[14.5rem]">
        <div
          className={`relative flex w-full flex-col items-center transition-all duration-700 ease-out ${
            hideHeadline
              ? "pointer-events-none -translate-y-2 opacity-0 sm:pointer-events-auto sm:translate-y-0 sm:opacity-100"
              : "translate-y-0 opacity-100"
          }`}
        >
          {/* Local scrim ONLY behind headline (ellipse, not full-width bar) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[160%] w-[110%] max-w-[1180px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse 58% 52% at 50% 48%, rgba(10,5,6,0.48) 0%, rgba(10,5,6,0.22) 48%, transparent 78%)",
              filter: "blur(14px)",
            }}
          />

          <h1
            className="relative z-10 max-w-6xl font-bold leading-[1.02] tracking-[-0.03em] text-[2.55rem] sm:leading-[1.05] sm:text-[3.5rem] md:text-[4.2rem] lg:text-[5.1rem] xl:text-[5.7rem]"
            style={{
              textShadow:
                "0 2px 30px rgb(var(--scrim) / 0.35), 0 1px 4px rgb(var(--scrim) / 0.3)",
            }}
          >
            <span className="block text-balance text-text-primary sm:whitespace-nowrap">
              {HEADLINE_TOP}
            </span>
            <span
              className="mt-1 block text-balance sm:whitespace-nowrap"
              style={{
                color: "rgb(var(--warn))",
                textShadow:
                  "0 0 18px rgba(255, 203, 46, 0.5), 0 6px 16px rgb(var(--scrim) / 0.28)",
              }}
            >
              {HEADLINE_BOTTOM}
            </span>
          </h1>
        </div>

        <div className="flex-1 sm:hidden" />

        <div className="relative z-10 w-full sm:mt-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[150%] w-[118%] max-w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-md sm:max-w-[42rem]"
            style={{
              background:
                "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(8,4,5,0.55) 0%, rgba(8,4,5,0.22) 55%, transparent 80%)",
            }}
          />
          <p
            className="mx-auto max-w-[23rem] text-balance px-1 text-[0.8rem] leading-snug text-text-primary/80 sm:max-w-2xl sm:px-0 sm:text-base sm:leading-relaxed sm:text-text-primary/82 lg:max-w-3xl lg:text-lg"
            style={{ textShadow: "0 1px 14px rgb(var(--scrim) / 0.78)" }}
          >
            {HERO_DESCRIPTION}
          </p>
        </div>

        <div className="hidden flex-1 sm:block" />

        <div className="relative w-full pb-1 pt-9 sm:pb-2 sm:pt-10 lg:pt-10">
          {/* Local glow under CTA only — never a full-width floor */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[180%] w-[min(100%,28rem)] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 55%, rgba(10,5,6,0.5) 0%, rgba(10,5,6,0.18) 50%, transparent 78%)",
              filter: "blur(10px)",
            }}
          />
          <HeroSignupPill
            text="Access LuxQuant Terminal"
            className="!max-w-[290px] sm:!max-w-[400px]"
          />
        </div>
      </div>
    </div>
  );
}
