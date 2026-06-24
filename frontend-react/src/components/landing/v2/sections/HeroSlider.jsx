// src/components/landing/v2/sections/HeroSlider.jsx
// ════════════════════════════════════════════════════════════════
// Hero — 2-slide carousel.
//   Slide 1: HeroSlideAlgo     (data/algo)
//   Slide 2: HeroSlideStandard (statement)
// Geser otomatis (8s) + swipe di mobile. Dots indikator kecil.
// TANPA tombol panah kiri-kanan (sesuai permintaan).
// Hormati prefers-reduced-motion. Animasi float/fly didefinisi sekali di sini.
//
// Props: onNav(id), gainers
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import HeroSlideAlgo from "./slides/HeroSlideAlgo";
import HeroSlideStandard from "./slides/HeroSlideStandard";

const ROTATE_MS = 8000;
const SLIDES = [HeroSlideAlgo, HeroSlideStandard];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HeroSlider({ onNav, gainers = [] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);

  // auto-advance
  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const iv = setInterval(() => setActive((a) => (a + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(iv);
  }, [paused, active]);

  // swipe (mobile)
  const onTouchStart = (e) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -50) setActive((a) => (a + 1) % SLIDES.length);
    else if (dx > 50) setActive((a) => (a - 1 + SLIDES.length) % SLIDES.length);
    touchX.current = null;
  };

  const Active = SLIDES[active];

  return (
    <section
      id="hero"
      className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-12 lg:pt-24 xl:pt-28 pb-10 lg:pb-14 overflow-visible"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ambient gold glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] pointer-events-none -z-10">
        <div className="absolute inset-0 bg-gold-primary/[0.03] rounded-full blur-[160px]" />
      </div>

      {/* slide stage — min-height stabil biar gak loncat antar slide */}
      <div className="relative flex items-center min-h-[560px] lg:min-h-[660px]">
        <div key={active} className="w-full" style={{ animation: "v2HeroFade .6s ease-out both" }}>
          <Active onNav={onNav} gainers={gainers} />
        </div>
      </div>

      {/* dots saja — TANPA panah kiri-kanan */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-1.5 rounded-sm transition-all duration-300 ${
              i === active ? "w-8 bg-gold-primary" : "w-1.5 bg-white/15 hover:bg-white/30"
            }`}
          />
        ))}
      </div>

      {/* shared animations */}
      <style>{`
        @keyframes v2Float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes v2HeroFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes v2FlyLeft {
          0%{opacity:0;transform:translate(-50%,-50%) scale(.4);}
          20%{opacity:1;transform:translate(-60px,-40px) scale(.95);}
          80%{opacity:1;transform:translate(-150px,-80px) scale(.95);}
          100%{opacity:0;transform:translate(-170px,-100px) scale(.85);}
        }
        @keyframes v2FlyRight {
          0%{opacity:0;transform:translate(-50%,-50%) scale(.4);}
          20%{opacity:1;transform:translate(60px,-40px) scale(.95);}
          80%{opacity:1;transform:translate(150px,-80px) scale(.95);}
          100%{opacity:0;transform:translate(170px,-100px) scale(.85);}
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="v2Float"],[style*="v2Fly"],[style*="v2HeroFade"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}