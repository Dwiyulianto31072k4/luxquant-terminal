import { useState, useEffect } from "react";
import HeroSignupPill from "../shared/HeroSignupPill";

const PAGE_BG = "#0a0506";
// Warm maroon the hero bottom fades INTO — matches the page's continuous
// canvas below, so the hero→next-section transition has no black seam.
const NEXT_BG = "#1d0c0d";

const HEADLINE_TOP = "Read the Market."; // white
const HEADLINE_BOTTOM = "Move With Conviction."; // gold

const HERO_DESCRIPTION =
  "Real time market intelligence, capital flow insight, and quantified risk analysis powered by a 24/7 engine with a transparent track record since 2023.";

// Art-direction (responsive video):
//   < sm  → portrait 9:16 clip, full-bleed, kedua wajah ter-frame tegak.
//   ≥ sm  → landscape 16:9 clip (cinematic, framing diturunkan).
// Taruh file portrait di: public/hero-video-mobile.mp4
const VIDEO_DESKTOP = "/hero-video.mp4";
const VIDEO_MOBILE = "/hero-video-mobile.mp4";

export default function HeroSlideVideo() {
  // Mobile-only: reveal the headline for 5s, then fade it out so the cinematic
  // video reads clean. Desktop keeps the headline visible at all times.
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
    <div
      className="relative isolate min-h-[640px] w-full overflow-hidden bg-bg-primary sm:min-h-[710px] lg:min-h-[780px] xl:min-h-[820px]"
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* ── VIDEO: mobile portrait (full-bleed, no empty bands) ── */}
      <video
        className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.97] sm:hidden"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src={VIDEO_MOBILE} type="video/mp4" />
        {/* fallback ke landscape kalau file mobile belum ada */}
        <source src={VIDEO_DESKTOP} type="video/mp4" />
      </video>

      {/* ── VIDEO: desktop / tablet landscape (full-bleed) ── */}
      <video
        className="absolute inset-0 hidden h-full w-full scale-[1.05] object-cover opacity-[0.97] sm:block"
        style={{ objectPosition: "50% 62%" }}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src={VIDEO_DESKTOP} type="video/mp4" />
      </video>

      {/* ═══════════════════ OVERLAYS (shared) ═══════════════════ */}

      {/* Soft top blend for navbar readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[120px] sm:h-[130px] lg:h-[145px]"
        style={{
          background: `
            linear-gradient(
              180deg,
              rgba(10, 5, 6, 0.42) 0%,
              rgba(10, 5, 6, 0.24) 38%,
              rgba(10, 5, 6, 0.08) 72%,
              transparent 100%
            )
          `,
        }}
      />

      {/* Main cinematic vertical fade → menyatu ke section berikutnya */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(
              180deg,
              rgba(10, 5, 6, 0.08) 0%,
              rgba(10, 5, 6, 0.05) 20%,
              rgba(10, 5, 6, 0.04) 44%,
              rgba(10, 5, 6, 0.05) 64%,
              rgba(29, 12, 13, 0.12) 80%,
              rgba(29, 12, 13, 0.4) 92%,
              rgba(29, 12, 13, 0.8) 98%,
              ${NEXT_BG} 100%
            )
          `,
        }}
      />

      {/* Side vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(
              90deg,
              rgba(10, 5, 6, 0.7) 0%,
              rgba(10, 5, 6, 0.34) 12%,
              rgba(10, 5, 6, 0.1) 26%,
              transparent 50%,
              rgba(10, 5, 6, 0.1) 74%,
              rgba(10, 5, 6, 0.34) 88%,
              rgba(10, 5, 6, 0.7) 100%
            )
          `,
        }}
      />

      {/* Gold atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse 58% 46% at 50% 32%,
              rgba(255, 214, 102, 0.13) 0%,
              rgba(236, 181, 57, 0.07) 34%,
              rgba(212, 168, 83, 0.02) 58%,
              transparent 78%
            )
          `,
        }}
      />

      {/* Text readability scrim — ringan (warm) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse 60% 38% at 50% 30%,
              rgba(12, 5, 6, 0.34) 0%,
              rgba(12, 5, 6, 0.2) 40%,
              rgba(12, 5, 6, 0.08) 64%,
              transparent 82%
            )
          `,
        }}
      />

      {/* Bottom luxury glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%]"
        style={{
          background: `
            radial-gradient(
              ellipse 42% 38% at 50% 78%,
              rgba(214, 154, 31, 0.1) 0%,
              rgba(120, 56, 23, 0.04) 46%,
              transparent 76%
            )
          `,
        }}
      />

      {/* ═══════════════════ CONTENT ═══════════════════ */}
      <div className="relative z-10 mx-auto flex min-h-[640px] max-w-6xl flex-col items-center px-4 pb-16 pt-[6.5rem] text-center sm:min-h-[710px] sm:px-8 sm:pb-10 sm:pt-[11rem] lg:min-h-[780px] lg:px-10 lg:pb-12 lg:pt-[13rem] xl:min-h-[820px] xl:pt-[14.5rem]">
        {/* Headline group — localized readability gradient behind text.
            Mobile: fades out after 5s (see hideHeadline). Desktop: always shown. */}
        <div
          className={`relative flex w-full flex-col items-center transition-all duration-700 ease-out ${
            hideHeadline
              ? "pointer-events-none -translate-y-2 opacity-0 sm:translate-y-0 sm:opacity-100 sm:pointer-events-auto"
              : "translate-y-0 opacity-100"
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[150%] w-[112%] max-w-[1180px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background: `
                radial-gradient(
                  ellipse 60% 56% at 50% 48%,
                  rgba(12, 5, 6, 0.42) 0%,
                  rgba(12, 5, 6, 0.28) 36%,
                  rgba(12, 5, 6, 0.12) 60%,
                  transparent 82%
                )
              `,
              filter: "blur(12px)",
            }}
          />

          <h1
            className="relative z-10 max-w-6xl font-bold leading-[1.02] tracking-[-0.03em] text-[2.55rem] sm:leading-[1.05] sm:text-[3.5rem] md:text-[4.2rem] lg:text-[5.1rem] xl:text-[5.7rem]"
            style={{
              textShadow:
                "0 2px 30px rgba(0,0,0,0.42), 0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            <span className="block text-balance text-white sm:whitespace-nowrap">
              {HEADLINE_TOP}
            </span>

            <span
              className="mt-1 block text-balance sm:whitespace-nowrap"
              style={{
                color: "#ffcb2e",
                textShadow:
                  "0 0 18px rgba(255, 203, 46, 0.5), 0 6px 16px rgba(0,0,0,0.28)",
              }}
            >
              {HEADLINE_BOTTOM}
            </span>
          </h1>
        </div>

        {/* MOBILE: spacer pushes description + CTA down to the bottom.
            DESKTOP: hidden, so description stays directly under the headline. */}
        <div className="flex-1 sm:hidden" />

        <div className="relative z-10 w-full sm:mt-7">
          {/* mobile-only soft dark scrim so the copy stays legible over video */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[150%] w-[118%] max-w-[27rem] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-md sm:hidden"
            style={{
              background:
                "radial-gradient(ellipse 60% 58% at 50% 50%, rgba(8,4,5,0.6) 0%, rgba(8,4,5,0.34) 52%, transparent 80%)",
            }}
          />
          <p
            className="mx-auto max-w-[23rem] text-balance px-1 text-[0.8rem] leading-snug text-white/80 sm:max-w-2xl sm:px-0 sm:text-base sm:leading-relaxed sm:text-white/82 lg:max-w-3xl lg:text-lg"
            style={{ textShadow: "0 1px 14px rgba(0,0,0,0.78)" }}
          >
            {HERO_DESCRIPTION}
          </p>
        </div>

        <div className="hidden flex-1 sm:block" />

        <div className="w-full pb-2 pt-9 sm:pb-8 sm:pt-10 lg:pb-10">
          <HeroSignupPill
            text="Access LuxQuant Terminal"
            className="!max-w-[290px] sm:!max-w-[400px]"
          />
        </div>
      </div>

      {/* Smooth transition to next section */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[160px]"
        style={{
          background: `
            linear-gradient(
              180deg,
              transparent 0%,
              rgba(29, 12, 13, 0.18) 34%,
              rgba(29, 12, 13, 0.64) 76%,
              ${NEXT_BG} 100%
            )
          `,
        }}
      />
    </div>
  );
}
