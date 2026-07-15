// src/components/landing/v2/sections/HeroSlider.jsx
// ════════════════════════════════════════════════════════════════
// Hero carousel
//
// Slide 1 : Full-bleed cinematic video hero
// Slide 2 : Algo / data slide
//
// Semua slider navigation selalu horizontal di bawah.
// Tidak ada dots vertikal di sisi kanan.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import HeroSlideVideo from "./slides/HeroSlideVideo";
import HeroSlideAlgo from "./slides/HeroSlideAlgo";

const ROTATE_MS = 11000;

const SLIDES = [
  HeroSlideVideo,
  HeroSlideAlgo,
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HeroSlider({ onNav, gainers = [], onSlideChange }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  const ActiveSlide = SLIDES[active];
  const isVideoSlide = ActiveSlide === HeroSlideVideo;

  // Tell parent which slide is up so Real calls can pull into the video
  // dissolve only — never under the algo product mockup (overlap bug).
  useEffect(() => {
    onSlideChange?.(active, { isVideoSlide });
  }, [active, isVideoSlide, onSlideChange]);

  const goToSlide = (index) => {
    const total = SLIDES.length;
    setActive((index + total) % total);
  };

  // Auto-advance every ROTATE_MS. `active` is a dependency so the timer RESETS
  // whenever the slide changes (incl. manual swipe / dot click) — i.e. each
  // slide always gets a full 10s before advancing, "unless swiped".
  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;

    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, ROTATE_MS);

    return () => window.clearTimeout(timer);
  }, [paused, active]);

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;

    const currentX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = currentX - touchStartX.current;

    if (distance < -55) {
      goToSlide(active + 1);
    } else if (distance > 55) {
      goToSlide(active - 1);
    }

    touchStartX.current = null;
  };

  const handleTouchCancel = () => {
    touchStartX.current = null;
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToSlide(active + 1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToSlide(active - 1);
    }
  };

  return (
    <section
      id="hero"
      role="region"
      aria-label="LuxQuant featured experiences"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="relative z-[1] w-full outline-none"
    >
      {/* Ambient gold — additive only, never a plate under the seam */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[70%]"
      >
        <div className="absolute left-1/2 top-[12%] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-gold-primary/[0.04] blur-[160px]" />
      </div>

      {/* Hero stage */}
      <div
        className={`relative z-10 flex items-start ${
          isVideoSlide
            ? "w-full"
            : "mx-auto min-h-[620px] w-full max-w-7xl px-4 pb-14 pt-28 sm:px-6 sm:pt-32 lg:min-h-[680px] lg:px-8 lg:pb-16 lg:pt-36 xl:pt-44"
        }`}
      >
        <div
          key={active}
          className="w-full"
          style={{
            animation: "v2HeroFade 700ms cubic-bezier(.22,.8,.2,1) both",
          }}
        >
          <ActiveSlide onNav={onNav} gainers={gainers} />
        </div>
      </div>

      {/* Dots in normal flow + high z-index so Real calls pull-up never covers them */}
      <div
        className={[
          "relative z-40 flex w-full items-center justify-center gap-2.5",
          isVideoSlide
            ? "-mt-10 pb-2 pt-1 sm:-mt-12 sm:pb-3"
            : "mt-1 pb-4 sm:pb-5",
        ].join(" ")}
        aria-label="Hero slide controls"
      >
        {SLIDES.map((_, index) => {
          const isActive = active === index;

          return (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => goToSlide(index)}
              className={[
                "rounded-full transition-all duration-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-primary/80",
                "shadow-[0_2px_10px_rgba(0,0,0,0.45)]",
                isActive
                  ? "h-2 w-8 bg-gold-primary shadow-[0_0_14px_rgba(212,168,83,0.55)]"
                  : "h-2 w-2 bg-white/45 hover:bg-white/75",
              ].join(" ")}
            />
          );
        })}
      </div>

      <style>{`
        @keyframes v2HeroFade {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes v2Float {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-12px);
          }
        }

        @keyframes v2FlyLeft {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(.4);
          }

          20% {
            opacity: 1;
            transform: translate(-60px, -40px) scale(.95);
          }

          80% {
            opacity: 1;
            transform: translate(-150px, -80px) scale(.95);
          }

          100% {
            opacity: 0;
            transform: translate(-170px, -100px) scale(.85);
          }
        }

        @keyframes v2FlyRight {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(.4);
          }

          20% {
            opacity: 1;
            transform: translate(60px, -40px) scale(.95);
          }

          80% {
            opacity: 1;
            transform: translate(150px, -80px) scale(.95);
          }

          100% {
            opacity: 0;
            transform: translate(170px, -100px) scale(.85);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          [style*="v2Float"],
          [style*="v2Fly"],
          [style*="v2HeroFade"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}