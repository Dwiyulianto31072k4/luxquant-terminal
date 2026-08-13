// src/components/landing/v2/sections/FreeTierV2.jsx
// ════════════════════════════════════════════════════════════════
// FREE-TIER / "Try Before You Subscribe" — MEXC "Trade Anywhere"-style
// band. Centered title on top, then a black card (Top-Gainers theme)
// with the hero PhoneMockup rising from INSIDE the card on the left, then
// finishing above its top edge for depth. A stationary clipping window keeps
// the bottom tucked into the card throughout the animation.
// ════════════════════════════════════════════════════════════════
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { isPremiumUser } from "../../../../utils/roles";
import { CTA } from "../landingCopy";
import PhoneMockup from "./shared/PhoneMockup";
import { PrimaryButton, SecondaryLink } from "./shared/LandingButtons";

const TG_LINK = "https://t.me/LuxQuantSignal";

export default function FreeTierV2() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  // A paying member does not need the free tier explained to them.
  const isPremium = isPremiumUser(user);

  const goAccount = () => {
    if (isPremium) {
      trackFunnel("cta_click", { source: "free_tier_terminal", path: "/" });
      navigate("/terminal");
      return;
    }
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    trackFunnel("cta_click", { source: "free_tier_account", path: "/" });
    navigate(loginUrl("/home", { source: "free_tier_account" }));
  };

  return (
    <section
      id="free-features"
      className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="absolute left-1/2 top-1/2 -z-10 h-[440px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-secondary blur-[150px]" />

      {/* Centered title (MEXC pattern) */}
      <div className="mb-16 text-center lg:mb-48">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          {CTA.freeEyebrow}
        </p>
        <h2 className="mt-7 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:text-[38px] lg:text-[48px]">
          {CTA.freeTitleLead}{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            {CTA.freeTitleGold}
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] font-medium leading-[1.64] text-text-muted sm:text-[17px] lg:text-[20px]">
          {CTA.freeBody}
        </p>
        <p className="mx-auto mt-2 max-w-md text-[12px] text-text-muted">
          {CTA.freePremiumNote}
        </p>
      </div>

      {/* Card — the phone itself rises inside a stationary clipping window.
          It starts below the panel edge, finishes above it, and its bottom
          remains clipped exactly at the card boundary throughout. */}
      <div className="relative mx-auto max-w-5xl">
        <div className="relative rounded-3xl lq-card">
          <span className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-ink/45 to-transparent" />

          {/* PHONE — the outer wrapper never moves and owns the clipping. On
              lg it extends above the card but ends exactly at its bottom. The
              inner `lq-rise` starts 112px lower (inside the panel), then rises
              into the protruding final position.
 NOTE: px-3 gives the phone's side buttons breathing room so they
 aren't clipped by overflow-hidden (clip happens at the padding box). */}
          {/* Bloom behind the device. It sits outside the phone's wrapper on
 purpose — that wrapper is `overflow-hidden` to clip the phone into the
 panel, and a glow inside it would be clipped with it. */}
          <div
            aria-hidden="true"
            className="lq-phone-glow pointer-events-none absolute left-1/2 top-4 z-0 h-[340px] w-[330px] -translate-x-1/2 sm:h-[380px] sm:w-[360px] lg:left-[4%] lg:top-[-130px] lg:-ml-[81px] lg:h-[520px] lg:w-[430px] lg:translate-x-0"
          />

          <div className="relative z-10 mx-auto mt-8 h-[300px] w-[212px] overflow-hidden px-3 [mask-image:linear-gradient(to_bottom,#000_74%,transparent)] sm:h-[340px] sm:w-[232px] lg:absolute lg:bottom-0 lg:left-[4%] lg:top-[-100px] lg:mx-0 lg:mt-0 lg:h-auto lg:w-[268px] lg:[mask-image:none]">
            <div className="lq-rise">
              <PhoneMockup
                src="/telegram-ss.png?v=3"
                alt="LuxQuant Telegram channel — limited shared analysis"
                className="w-full"
              />
            </div>
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
                  className="group relative flex-shrink-0 rounded-2xl bg-white p-3 transition-transform duration-300 hover:-translate-y-0.5"
                  aria-label="Scan or open the LuxQuant Telegram channel"
                >
                  <QRCodeSVG
                    value={TG_LINK}
                    size={124}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#0a0a0a"
                  />
                  {/* center logo chip */}
                  <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-white ring-2 ring-white">
                    <img src="/logo.png" alt="" className="h-7 w-7 rounded-[5px] object-cover" />
                  </span>
                </a>

                {/* heading + desc */}
                <div className="min-w-0">
                  <p className="text-lg font-bold text-text-primary sm:text-xl">
                    {CTA.freeChannelTitle}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-text-primary/55">
                    {CTA.freeChannelBody}
                  </p>
                </div>
              </div>

              {/* CTAs — account (primary) + Telegram channel (secondary).
                  Channel alone was leaking intent off-site without conversion. */}
              <div className="mt-8 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:mt-9 lg:justify-start">
                <PrimaryButton size="lg" width="fullMobile" onClick={goAccount}>
                  {isPremium
                    ? CTA.openTerminal
                    : isAuthenticated
                      ? CTA.freePrimaryAuthed
                      : CTA.freePrimary}
                </PrimaryButton>
                <SecondaryLink
                  href={TG_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="lg"
                  width="fullMobile"
                  onClick={() =>
                    trackFunnel("cta_click", { source: "free_tier_telegram", path: "/" })
                  }
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  <span className="tracking-wide">{CTA.freeChannelCta}</span>
                </SecondaryLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
