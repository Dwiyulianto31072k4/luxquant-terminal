// src/components/landing/v2/sections/FaqV2.jsx
// FAQ — timeless, expandable, trust-first (matches Performance / How it works).
// Accordion stays crawler-friendly: answers remain in the DOM when collapsed.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LANDING_FAQ } from "../../../../content/faq";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { useAuth } from "../../../../context/AuthContext";
import { CTA, DEST, FAQ_INTRO } from "../landingCopy";
import { PrimaryButton, SecondaryButton, BtnArrow } from "./shared/LandingButtons";

const FAQ_DATA = LANDING_FAQ;
const PREVIEW_COUNT = 5;

function Chevron({ open }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 transition-transform duration-300 ${
        open ? "rotate-180 text-accent" : "text-text-muted"
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function Row({ index, q, a, open, onToggle }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
        open
          ? "border-accent/25 bg-surface-raised/90"
          : "border-ink/[0.06] bg-transparent hover:border-ink/12 hover:bg-ink/[0.015]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3.5 px-4 py-4 text-left sm:gap-4 sm:px-5 sm:py-4.5"
      >
        <span
          className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
            open ? "bg-accent/15 text-accent" : "bg-ink/[0.05] text-text-muted"
          }`}
        >
          {index}
        </span>
        <span
          className={`min-w-0 flex-1 pt-0.5 text-[15px] font-semibold leading-snug tracking-tight sm:text-[16px] ${
            open ? "text-text-primary" : "text-text-primary/90"
          }`}
        >
          {q}
        </span>
        <Chevron open={open} />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-ink/[0.06] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <p className="pl-10 text-[14px] leading-relaxed text-text-muted sm:pl-11 sm:text-[15px]">
              {a}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FaqV2() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [openIdx, setOpenIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const hidden = Math.max(FAQ_DATA.length - PREVIEW_COUNT, 0);

  const goStart = () => {
    if (isAuthenticated) {
      navigate(DEST.record);
      return;
    }
    trackFunnel("cta_click", { source: "faq_cta", path: "/" });
    navigate(loginUrl(DEST.record, { source: "faq_cta" }));
  };

  return (
    <section
      id="faq"
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-16 sm:py-20 lg:px-8 lg:py-28"
    >
      {/* Hero */}
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          {FAQ_INTRO.eyebrow}
        </p>
        <h2 className="mt-3 sm:mt-4 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:text-[38px] lg:text-[48px]">
          {FAQ_INTRO.titleLead}{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">{FAQ_INTRO.titleGold}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] font-medium leading-[1.64] text-text-muted sm:text-[17px] lg:text-[20px]">
          {FAQ_INTRO.body}
        </p>
      </div>

      {/* Quick trust chips */}
      <div className="mx-auto mt-8 flex max-w-lg flex-wrap items-center justify-center gap-2">
        {["Track record", "Risk plan", "Free tier", "Agent"].map((t) => (
          <span
            key={t}
            className="rounded-full bg-ink/[0.04] px-3 py-1 text-[12px] font-medium text-text-primary/75"
          >
            {t}
          </span>
        ))}
      </div>

      {/* Accordion list */}
      <div className="mt-10 space-y-2.5 sm:mt-12">
        {FAQ_DATA.map((item, i) => {
          const shown = i < PREVIEW_COUNT || showAll;
          return (
          <div
            key={i}
            // aria-hidden alone was a half-fix, and half is worse than none: it
            // hid these ten rows from a screen reader while leaving their
            // buttons in the tab order, so a keyboard user could focus a
            // control that announces nothing and is not on screen. `inert`
            // takes both away together — and unlike aria-hidden it is not
            // refused when a descendant happens to still hold focus.
            {...(shown ? {} : { inert: "" })}
            className={shown ? "" : "pointer-events-none h-0 overflow-hidden opacity-0"}
          >
            <Row
              index={i + 1}
              q={item.q}
              a={item.a}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="mt-6 flex justify-center">
          <SecondaryButton
            size="md"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
          >
            {showAll ? "Show fewer" : `Show all ${FAQ_DATA.length} questions`}
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </SecondaryButton>
        </div>
      )}

      {/* Soft CTA — curiosity → action */}
      <div className="mt-12 flex flex-col items-center gap-4 text-center sm:mt-14">
        <p className="max-w-sm text-[14px] leading-relaxed text-text-muted">
          Start free — Pulse, track record, and more. Upgrade later for live levels and optional Agent assistance.
        </p>
        <PrimaryButton size="lg" width="fullMobile" onClick={goStart} className="group">
          {isAuthenticated ? CTA.primaryAuthed : CTA.primaryGuest}
          <BtnArrow />
        </PrimaryButton>
      </div>
    </section>
  );
}
