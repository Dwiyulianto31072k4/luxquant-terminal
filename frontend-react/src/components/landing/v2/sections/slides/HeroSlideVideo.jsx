// src/components/landing/v2/sections/slides/HeroSlideVideo.jsx

import HeroSignupPill from "../shared/HeroSignupPill";

const PAGE_BG = "#0a0506";

export default function HeroSlideVideo() {
  return (
    <div
      className="relative isolate min-h-[650px] w-full overflow-hidden bg-bg-primary sm:min-h-[700px] lg:min-h-[760px] xl:min-h-[800px]"
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* Full-bleed cinematic video */}
      <video
        className="absolute inset-0 h-full w-full scale-[1.015] object-cover object-[center_54%] opacity-[0.9]"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      {/* Fade atas-bawah: video menyatu ke background halaman */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(
              180deg,
              ${PAGE_BG} 0%,
              rgba(10, 5, 6, 0.96) 6%,
              rgba(10, 5, 6, 0.62) 17%,
              rgba(10, 5, 6, 0.13) 38%,
              rgba(10, 5, 6, 0.08) 57%,
              rgba(10, 5, 6, 0.42) 76%,
              rgba(10, 5, 6, 0.82) 91%,
              ${PAGE_BG} 100%
            )
          `,
        }}
      />

      {/* Fade kiri-kanan */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(
              90deg,
              ${PAGE_BG} 0%,
              rgba(10, 5, 6, 0.93) 7%,
              rgba(10, 5, 6, 0.55) 18%,
              rgba(10, 5, 6, 0.14) 34%,
              transparent 50%,
              rgba(10, 5, 6, 0.14) 67%,
              rgba(10, 5, 6, 0.60) 85%,
              ${PAGE_BG} 100%
            )
          `,
        }}
      />

      {/* Warm LuxQuant ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse 52% 46% at 50% 48%,
              rgba(212, 168, 83, 0.15) 0%,
              rgba(212, 168, 83, 0.06) 38%,
              transparent 74%
            )
          `,
        }}
      />

      {/* Extra dark layer near navbar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px]"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(10, 5, 6, 0.82) 0%,
              rgba(10, 5, 6, 0.30) 55%,
              transparent 100%
            )
          `,
        }}
      />

      {/* Hero content */}
      <div className="relative z-10 mx-auto flex min-h-[650px] max-w-6xl flex-col items-center px-5 pb-10 pt-24 text-center sm:min-h-[700px] sm:px-8 sm:pt-28 lg:min-h-[760px] lg:px-10 lg:pb-12 lg:pt-32 xl:min-h-[800px] xl:pt-36">
        <h1 className="max-w-5xl font-bold leading-[0.96] tracking-[-0.05em] text-[2.75rem] text-white sm:text-[4rem] lg:text-[5.4rem] xl:text-[6rem]">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f0cc7a] via-gold-primary to-[#b8860b]">
            Precision
          </span>
          <span className="text-white">, in Motion.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/65 sm:mt-6 sm:text-base lg:text-lg">
          A quantitative engine continuously reading market structure,
          momentum, and opportunity around the clock.
        </p>

        {/* Memastikan CTA duduk di area bawah video */}
        <div className="flex-1" />

        {/* Replaces: Quantitative Intelligence */}
        <div className="w-full pb-6 pt-10 sm:pb-8">
          <HeroSignupPill
            text="Start using LuxQuant today"
            className="!max-w-[360px] sm:!max-w-[400px]"
          />
        </div>
      </div>

      {/* Seamless transition into next section */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px]"
        style={{
          background: `linear-gradient(to bottom, transparent 0%, ${PAGE_BG} 100%)`,
        }}
      />
    </div>
  );
}