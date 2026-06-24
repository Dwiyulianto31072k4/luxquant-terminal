// src/components/landing/v2/sections/slides/HeroSlideAlgo.jsx
// ════════════════════════════════════════════════════════════════
// SLIDE 2 — Data + algorithm product proof.
//
// No repeated signup CTA here.
// The first slide already owns conversion; this slide exists to show
// LuxQuant as a live market-intelligence and algorithmic platform.
// ════════════════════════════════════════════════════════════════

export default function HeroSlideAlgo() {
  return (
    <div className="flex w-full flex-col items-center text-center">
      {/* Headline */}
      <div className="max-w-4xl">
        <h1 className="font-display text-[2.7rem] font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-[3.75rem] lg:text-[4.8rem]">
          Data Meets
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b]">
            Algorithmic Precision.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/60 sm:mt-6 sm:text-base lg:text-lg">
          One live intelligence layer for market structure, flow, momentum,
          and risk.
        </p>
      </div>

      {/* Product proof — dashboard + mobile app */}
      <div className="relative mt-9 w-full max-w-[980px] px-2 pb-8 sm:mt-11 sm:px-8 sm:pb-12 lg:mt-12 lg:px-10">
        {/* Cinematic product spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-24 -top-20 bottom-[-12%] -z-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_56%_52%_at_50%_39%,rgba(212,168,83,0.17),transparent_70%)] blur-2xl" />
          <div className="absolute left-1/2 top-[22%] h-px w-[62%] -translate-x-1/2 bg-gradient-to-r from-transparent via-gold-primary/35 to-transparent" />
          <div className="absolute bottom-0 left-1/2 h-20 w-[60%] -translate-x-1/2 rounded-full bg-gold-primary/[0.08] blur-[82px]" />
        </div>

        {/* Desktop terminal */}
        <div className="relative mx-auto w-[88%] sm:w-[90%] lg:w-[86%]">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-0 z-20 h-px w-[68%] -translate-x-1/2 bg-gradient-to-r from-transparent via-gold-primary/70 to-transparent"
          />

          <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-bg-primary shadow-[0_34px_84px_rgba(0,0,0,0.70),0_0_48px_rgba(212,168,83,0.12)] lg:rounded-2xl">
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0a0506]">
              <img
                src="/logo.png"
                alt=""
                className="h-14 w-14 rounded-xl opacity-25"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </div>

            <img
              src="/mockups/hero-mac-dashboard.png"
              alt="LuxQuant live market intelligence dashboard"
              className="relative z-10 block w-full object-cover object-top"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </div>
        </div>

        {/* Mobile application — visual ecosystem cue */}
        <div className="absolute bottom-0 right-[2%] z-30 w-[108px] aspect-[9/19.5] sm:right-[4%] sm:w-[148px] lg:right-[5%] lg:w-[182px]">
          {/* Titanium device rim */}
          <div className="absolute inset-0 rounded-[1.85rem] bg-gradient-to-br from-[#67676c] via-[#1b1b1d] to-[#45454a] p-[2.5px] shadow-[0_24px_58px_rgba(0,0,0,0.88),0_0_40px_rgba(212,168,83,0.16)] lg:rounded-[2.6rem] lg:p-[3.5px]">
            <div className="relative h-full w-full overflow-hidden rounded-[1.65rem] bg-black lg:rounded-[2.35rem]">
              {/* Dynamic Island */}
              <div className="absolute inset-x-0 top-1.5 z-30 flex justify-center lg:top-2.5">
                <div className="h-[8px] w-[26%] rounded-full bg-black ring-1 ring-white/[0.06] lg:h-[14px]" />
              </div>

              <div className="absolute inset-[3px] overflow-hidden rounded-[0.9rem] bg-bg-primary lg:inset-[5px] lg:rounded-[1.3rem]">
                <div className="absolute inset-0 z-0 flex items-center justify-center bg-[#0a0506]">
                  <img
                    src="/logo.png"
                    alt=""
                    className="h-9 w-9 rounded-xl opacity-40"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>

                <img
                  src="/mockup-hp.png"
                  alt="LuxQuant mobile application"
                  className="relative z-10 h-full w-full object-cover object-top"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Device side buttons */}
          <span
            aria-hidden="true"
            className="absolute left-[-1.5px] top-[19%] h-[6%] w-[2px] rounded-l bg-gradient-to-b from-[#6a6a6e] to-[#2c2c2e]"
          />
          <span
            aria-hidden="true"
            className="absolute left-[-1.5px] top-[29%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#6a6a6e] to-[#2c2c2e]"
          />
          <span
            aria-hidden="true"
            className="absolute left-[-1.5px] top-[41%] h-[9%] w-[2px] rounded-l bg-gradient-to-b from-[#6a6a6e] to-[#2c2c2e]"
          />
          <span
            aria-hidden="true"
            className="absolute right-[-1.5px] top-[27%] h-[12%] w-[2px] rounded-r bg-gradient-to-b from-[#6a6a6e] to-[#2c2c2e]"
          />
        </div>
      </div>
    </div>
  );
}
