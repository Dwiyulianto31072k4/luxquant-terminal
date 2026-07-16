// src/components/landing/v2/sections/slides/HeroSlideAlgo.jsx
// ════════════════════════════════════════════════════════════════
// SLIDE 2 — Data + algorithm product proof.
//
// Showcase: realistic silver iMac (center) + iPhone (front-right) on a
// cinematic stage (gold light-rays + spotlight + floor glow), sitting on
// the shared LuxQuant warm background.
//
// Hardware frames are pure CSS so any screenshot drops straight in.
// ════════════════════════════════════════════════════════════════
import HeroSignupPill from "../shared/HeroSignupPill";

const hideOnError = (event) => {
  event.currentTarget.style.display = "none";
};

function ScreenFallback({ size = "h-12 w-12", opacity = "opacity-20" }) {
  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0a0506]">
      <img
        src="/logo.png"
        alt=""
        className={`${size} rounded-xl ${opacity}`}
        onError={hideOnError}
      />
    </div>
  );
}

function AppleLogo({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.35 1.206-3.08.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

// ── Realistic 27" iMac: silver aluminium edge, BLACK glass bezel on
//    top/sides, silver chin (black Apple logo), continuous aluminium
//    stand (neck flows into foot — one SVG piece, no seams) ──
function IMacMockup({ src, alt, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      {/* Black glass front — top + sides all black; only the chin is silver */}
      <div className="relative overflow-hidden rounded-[13px] bg-black shadow-[0_44px_92px_rgba(0,0,0,0.62),0_0_70px_rgba(212,168,83,0.12)] ring-1 ring-white/[0.07] lg:rounded-[16px]">
        {/* thin black bezel around the screen */}
        <div className="p-[7px] sm:p-[8px] lg:p-[11px]">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2px] bg-black ring-1 ring-white/[0.05] lg:rounded-[3px]">
            <ScreenFallback size="h-14 w-14" opacity="opacity-25" />
            <img
              src={src}
              alt={alt}
              className="relative z-10 h-full w-full object-cover object-top"
              onError={hideOnError}
            />
            {/* screen glare */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06]"
            />
          </div>
        </div>

        {/* Silver chin with proportional deep-black Apple logo */}
        <div className="flex h-[30px] items-center justify-center bg-gradient-to-b from-[#e8e9eb] via-[#d8dadd] to-[#c4c6ca] sm:h-[34px] lg:h-[44px]">
          <AppleLogo className="h-[15px] w-[15px] text-[#070708] sm:h-[17px] sm:w-[17px] lg:h-[22px] lg:w-[22px]" />
        </div>
      </div>

      {/* Continuous aluminium stand (neck → foot, single curved shape) —
          wider + fuller, proportional to the real 27" iMac */}
      <div className="relative mx-auto -mt-px w-[39%] max-w-[256px]">
        <svg
          viewBox="0 0 150 50"
          className="block h-auto w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="imacStand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e2e4e7" />
              <stop offset="0.5" stopColor="#c3c5c9" />
              <stop offset="1" stopColor="#9fa1a5" />
            </linearGradient>
            <linearGradient id="imacStandShade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
            </linearGradient>
          </defs>
          <path
            d="M52,0 L98,0 Q95,12 92,22 Q102,33 126,42 Q132,44 132,46.5 Q132,49 128,49 L22,49 Q18,49 18,46.5 Q18,44 24,42 Q48,33 58,22 Q55,12 52,0 Z"
            fill="url(#imacStand)"
          />
          {/* soft cross-light for an aluminium feel */}
          <path
            d="M52,0 L98,0 Q95,12 92,22 Q102,33 126,42 Q132,44 132,46.5 Q132,49 128,49 L22,49 Q18,49 18,46.5 Q18,44 24,42 Q48,33 58,22 Q55,12 52,0 Z"
            fill="url(#imacStandShade)"
          />
        </svg>
      </div>

      {/* floor contact shadow */}
      <div
        aria-hidden="true"
        className="mx-auto -mt-1.5 h-3.5 w-[36%] rounded-[50%] bg-black/50 blur-md"
      />
    </div>
  );
}

// ── iPhone — original titanium look (rim + island + side buttons) ──
function PhoneMockup({ src, alt, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      {/* Silver aluminium side rail — ultra thin */}
      <div className="rounded-[0.95rem] bg-gradient-to-b from-[#eceef0] via-[#b8babe] to-[#e4e5e7] p-[1px] shadow-[0_24px_56px_rgba(0,0,0,0.85),0_0_34px_rgba(212,168,83,0.12)] sm:rounded-[1.15rem] lg:rounded-[1.5rem] lg:p-[1.5px]">
        {/* Thin black display bezel */}
        <div className="overflow-hidden rounded-[0.9rem] bg-black p-[1.5px] sm:rounded-[1.1rem] lg:rounded-[1.44rem] lg:p-[2px]">
          {/* Screen — height follows the screenshot's own ratio (no crop),
              with a realistic ~14% corner radius so the status bar / battery
              is never clipped */}
          <div className="relative overflow-hidden rounded-[0.8rem] bg-bg-primary sm:rounded-[1rem] lg:rounded-[1.32rem]">
            <img
              src={src}
              alt={alt}
              className="relative z-10 block h-auto w-full"
              onError={hideOnError}
            />
            {/* Dynamic Island — black pill centered in the status bar */}
            <div className="absolute inset-x-0 top-[5px] z-30 flex justify-center sm:top-[6px] lg:top-[9px]">
              <div className="h-[8px] w-[30%] rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:h-[9px] lg:h-[13px]" />
            </div>
          </div>
        </div>
      </div>

      {/* side buttons — aluminium */}
      <span
        aria-hidden="true"
        className="absolute left-[-1.5px] top-[20%] h-[6%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]"
      />
      <span
        aria-hidden="true"
        className="absolute left-[-1.5px] top-[30%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]"
      />
      <span
        aria-hidden="true"
        className="absolute left-[-1.5px] top-[42%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]"
      />
      <span
        aria-hidden="true"
        className="absolute right-[-1.5px] top-[28%] h-[12%] w-[2px] rounded-r bg-gradient-to-b from-[#d2d4d7] to-[#a6a8ac]"
      />

      {/* contact shadow */}
      <div
        aria-hidden="true"
        className="mx-auto mt-1.5 h-2.5 w-[74%] rounded-[50%] bg-black/45 blur-md"
      />
    </div>
  );
}

export default function HeroSlideAlgo() {
  return (
    <div className="flex w-full flex-col items-center text-center">
      {/* Headline — white + gold accent (matches other sections) */}
      <h1
        className="font-display font-bold leading-[1.05] tracking-[-0.03em] text-text-primary text-[2.05rem] sm:text-[2.8rem] lg:whitespace-nowrap lg:text-[3.2rem] xl:text-[3.8rem]"
        style={{ textShadow: "0 2px 30px rgba(0,0,0,0.35)" }}
      >
        Data Meets{" "}
        <span className="bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b] bg-clip-text text-transparent">
          Algorithmic Precision.
        </span>
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-primary/60 sm:mt-5 sm:text-base lg:text-lg">
        One live intelligence layer for market structure, flow, momentum,
        and risk.
      </p>

      {/* ════════ Product proof — iMac + iPhone showcase ════════ */}
      <div className="relative mt-6 w-full max-w-[1040px] px-3 pb-3 sm:mt-8 sm:px-6 sm:pb-5 lg:mt-9">
        {/* Cinematic stage — light rays + spotlight + floor glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-24 -top-28 bottom-[-10%] -z-10"
        >
          {/* central spotlight behind the device */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_54%_50%_at_50%_40%,rgba(212,168,83,0.20),transparent_70%)] blur-2xl" />
          {/* soft diagonal light rays (left + right) */}
          <div
            className="absolute -top-10 left-[18%] h-[125%] w-[26%] rotate-[19deg] opacity-50 blur-[44px]"
            style={{
              background:
                "linear-gradient(180deg, rgba(240,216,144,0.16) 0%, rgba(212,168,83,0.05) 46%, transparent 74%)",
            }}
          />
          <div
            className="absolute -top-10 right-[18%] h-[125%] w-[24%] -rotate-[19deg] opacity-45 blur-[46px]"
            style={{
              background:
                "linear-gradient(180deg, rgba(240,216,144,0.13) 0%, rgba(212,168,83,0.04) 46%, transparent 74%)",
            }}
          />
          {/* warm floor glow */}
          <div className="absolute bottom-[7%] left-1/2 h-28 w-[64%] -translate-x-1/2 rounded-[50%] bg-gold-primary/[0.10] blur-[80px]" />
          {/* horizon line */}
          <div className="absolute bottom-[11%] left-1/2 h-px w-[78%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>

        {/* Devices standing on the same floor */}
        <div className="relative mx-auto flex items-end justify-center">
          {/* iMac — center hero */}
          <IMacMockup
            src="/mockups/hero-mac-dashboard.png"
            alt="LuxQuant live market intelligence dashboard"
            className="z-10 w-[82%] max-w-[460px] shrink-0 sm:w-[76%] sm:max-w-[500px] lg:w-[560px] xl:w-[620px]"
          />

          {/* iPhone — front-right */}
          <PhoneMockup
            src="/mockup-hp.png"
            alt="LuxQuant mobile application"
            className="z-30 w-[92px] shrink-0 -ml-[6%] mb-[8px] sm:w-[116px] lg:-ml-[4%] lg:mb-[12px] lg:w-[140px] xl:w-[156px]"
          />
        </div>
      </div>

      {/* Access / Sign-up CTA — extra bottom room so Real calls never collides */}
      <div className="mt-1 w-full pb-10 sm:mt-3 sm:pb-14 lg:pb-16">
        <HeroSignupPill text="Access LuxQuant Terminal" className="!max-w-[360px] sm:!max-w-[400px]" />
      </div>
    </div>
  );
}
