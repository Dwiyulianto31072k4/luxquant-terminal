// src/components/landing/v2/sections/FreeTierV2.jsx
// ════════════════════════════════════════════════════════════════
// FREE-TIER / "Try Before You Subscribe" — MEXC "Trade Anywhere"-style
// band. Centered title on top, then a black card (Top-Gainers theme)
// with the hero PhoneMockup EMERGING out of the card on the left
// (~3/4 visible, sticking above the top edge) and a QR code + short
// copy + Telegram link on the right.
// ════════════════════════════════════════════════════════════════
import { QRCodeSVG } from "qrcode.react";
import PhoneMockup from "./shared/PhoneMockup";

const TG_LINK = "https://t.me/LuxQuantSignal";

export default function FreeTierV2() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
      <div className="absolute left-1/2 top-1/2 -z-10 h-[440px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-primary/[0.05] blur-[150px]" />

      {/* Centered title (MEXC pattern) */}
      <div className="mb-16 text-center lg:mb-48">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/60" />
          100% Free Tier
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-gold-primary/60" />
        </span>
        <h2 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-text-primary lg:text-[2.6rem]">
          Try Before You{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark bg-clip-text text-transparent">
            Subscribe.
          </span>
        </h2>
      </div>

      {/* Card — phone EMERGES from the top of the card while its bottom is
          clipped (tucked into the panel), MEXC-style. The phone wrapper does
          the clipping: top reaches above the card, bottom ends at the card. */}
      <div className="relative mx-auto max-w-5xl">
        <div className="relative rounded-3xl border border-ink/[0.08] bg-surface-raised shadow-[0_18px_50px_rgb(var(--scrim) / 0.35)]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />

          {/* PHONE — mobile: sits inside the card, top peeking, bottom fades
              into the panel (soft mask, no hard cut); lg: absolute, top emerges
              above the card and bottom is clipped at the card edge.
              NOTE: px-3 gives the phone's side buttons breathing room so they
              aren't clipped by overflow-hidden (clip happens at the padding box). */}
          <div className="relative z-10 mx-auto mt-8 h-[300px] w-[212px] overflow-hidden px-3 [mask-image:linear-gradient(to_bottom,#000_74%,transparent)] sm:h-[340px] sm:w-[232px] lg:absolute lg:left-[4%] lg:top-[-100px] lg:bottom-0 lg:mx-0 lg:mt-0 lg:h-auto lg:w-[268px] lg:[mask-image:none]">
            <PhoneMockup
              src="/telegram-ss.png?v=3"
              alt="LuxQuant Telegram channel — limited shared analysis"
              className="w-full"
            />
          </div>

          <div className="grid items-center gap-8 p-6 pt-0 sm:p-8 sm:pt-0 lg:min-h-[320px] lg:grid-cols-2 lg:gap-12 lg:p-12 lg:px-14">
            {/* left half reserved for the emerging phone on lg */}
            <div className="hidden lg:block" aria-hidden="true" />

            {/* right — QR + copy + link */}
            <div className="text-center lg:text-left">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-7 lg:items-center lg:gap-8">
                {/* QR */}
                <a
                  href={TG_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex-shrink-0 rounded-2xl bg-white p-3 shadow-[0_8px_24px_rgb(var(--scrim) / 0.35)] transition-transform duration-300 hover:-translate-y-0.5"
                  aria-label="Scan or open the LuxQuant Telegram channel"
                >
                  <QRCodeSVG value={TG_LINK} size={124} level="H" bgColor="#ffffff" fgColor="#0a0506" />
                  {/* center logo chip */}
                  <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-white ring-2 ring-white">
                    <img src="/logo.png" alt="" className="h-7 w-7 rounded-[5px] object-cover" />
                  </span>
                </a>

                {/* heading + desc */}
                <div className="min-w-0">
                  <p className="text-lg font-bold text-text-primary sm:text-xl">Scan to join the channel</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-text-primary/55">
                    Enjoy our limited shared analysis — a free look at some of our algo calls, on Telegram.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div className="mt-8 flex justify-center lg:mt-9 lg:justify-start">
                <a
                  href={TG_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2.5 rounded-full border border-ink/15 bg-ink/[0.03] px-6 py-3 text-sm font-semibold text-text-primary transition-all duration-300 hover:border-line/40 hover:bg-ink/[0.06] hover:text-gold-primary"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  <span className="tracking-wide">Join Free Channel</span>
                  <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
