// src/components/landing/v2/sections/HeroSlider.jsx
// Mobile: single video hero (no dual-slide attention split).
// Desktop: video + algo slides; auto-rotate until user interacts.

import { useEffect, useRef, useState } from "react";
import HeroSlideVideo from "./slides/HeroSlideVideo";
import HeroSlideAlgo from "./slides/HeroSlideAlgo";

const ROTATE_MS = 11000;
const DESKTOP_SLIDES = [HeroSlideVideo, HeroSlideAlgo];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}

export default function HeroSlider({ onNav, gainers = [], onSlideChange }) {
  const isDesktop = useIsDesktop();
  const slides = isDesktop ? DESKTOP_SLIDES : [HeroSlideVideo];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userLocked, setUserLocked] = useState(false);
  const touchStartX = useRef(null);

  // Reset index if we shrink to one slide.
  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [slides.length, active]);

  const ActiveSlide = slides[active] || HeroSlideVideo;
  const isVideoSlide = ActiveSlide === HeroSlideVideo;

  useEffect(() => {
    onSlideChange?.(active, { isVideoSlide });
  }, [active, isVideoSlide, onSlideChange]);

  const goToSlide = (index, fromUser = false) => {
    const total = slides.length;
    if (total <= 1) return;
    setActive((index + total) % total);
    if (fromUser) setUserLocked(true);
  };

  useEffect(() => {
    if (slides.length <= 1 || paused || userLocked || prefersReducedMotion()) return undefined;

    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % slides.length);
    }, ROTATE_MS);

    return () => window.clearTimeout(timer);
  }, [paused, userLocked, active, slides.length]);

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null || slides.length <= 1) return;

    const currentX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = currentX - touchStartX.current;

    if (distance < -55) {
      goToSlide(active + 1, true);
    } else if (distance > 55) {
      goToSlide(active - 1, true);
    }

    touchStartX.current = null;
  };

  const handleTouchCancel = () => {
    touchStartX.current = null;
  };

  const handleKeyDown = (event) => {
    if (slides.length <= 1) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToSlide(active + 1, true);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToSlide(active - 1, true);
    }
  };

  return (
    <section
      id="hero"
      role="region"
      aria-label="LuxQuant featured experiences"
      aria-roledescription={slides.length > 1 ? "carousel" : undefined}
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[70%]">
        <div className="absolute left-1/2 top-[12%] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-surface-secondary blur-[160px]" />
      </div>

      <div
        className={`relative z-10 flex items-start ${
          isVideoSlide
            ? "w-full"
            : "mx-auto min-h-[620px] w-full max-w-7xl px-4 pb-14 pt-28 sm:px-6 sm:pt-32 lg:min-h-[680px] lg:px-8 lg:pb-16 lg:pt-36 xl:pt-44"
        }`}
      >
        <div
          key={`${isDesktop ? "d" : "m"}-${active}`}
          className="w-full"
          style={{
            animation: "v2HeroFade 700ms cubic-bezier(.22,.8,.2,1) both",
          }}
        >
          <ActiveSlide onNav={onNav} gainers={gainers} />
        </div>
      </div>

      {slides.length > 1 && (
        <div
          className={[
            "relative z-40 flex w-full items-center justify-center gap-2.5",
            isVideoSlide ? "-mt-10 pb-2 pt-1 sm:-mt-12 sm:pb-3" : "mt-1 pb-4 sm:pb-5",
          ].join(" ")}
          aria-label="Hero slide controls"
        >
          {slides.map((_, index) => {
            const isActive = active === index;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => goToSlide(index, true)}
                className={[
                  "rounded-full transition-all duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80",
                  "shadow-[0_2px_10px_rgb(var(--scrim) / 0.35)]",
                  isActive
                    ? "h-2 w-8 bg-accent shadow-[0_0_14px_rgb(var(--accent) / 0.55)]"
                    : "h-2 w-2 bg-ink/45 hover:bg-ink/75",
                ].join(" ")}
              />
            );
          })}
        </div>
      )}

      <style>{`
 @keyframes v2HeroFade {
 from { opacity: 0; transform: translateY(10px); }
 to { opacity: 1; transform: translateY(0); }
 }
 `}</style>
    </section>
  );
}
