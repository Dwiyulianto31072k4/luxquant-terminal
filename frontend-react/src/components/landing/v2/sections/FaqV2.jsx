// FAQ — trust-first accordion. Answers stay in the DOM when collapsed
// so crawlers (and the FAQPage schema) can read them.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FAQ_TAGS, LANDING_FAQ } from "../../../../content/faq";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { useAuth } from "../../../../context/AuthContext";
import { CTA } from "../landingCopy";
import { PrimaryButton, SecondaryButton, BtnArrow } from "./shared/LandingButtons";

const PREVIEW_COUNT = 5;

const TAG_TONE = {
  free: "Free",
  record: "Record",
  risk: "Risk",
  agent: "Agent",
};

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

function Row({ item, open, onToggle, onLink }) {
  const tag = TAG_TONE[item.tag];
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
        {tag ? (
          <span
            className={`mt-0.5 hidden h-7 shrink-0 items-center rounded-full px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] sm:inline-flex ${
              open ? "bg-accent/15 text-accent" : "bg-ink/[0.05] text-text-muted"
            }`}
          >
            {tag}
          </span>
        ) : null}
        <span
          className={`min-w-0 flex-1 pt-0.5 text-[15px] font-semibold leading-snug tracking-tight sm:text-[16px] ${
            open ? "text-text-primary" : "text-text-primary/90"
          }`}
        >
          {item.q}
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
            <div>
              <p className="text-[14px] leading-relaxed text-text-muted sm:text-[15px]">
                {item.lead ? (
                  <>
                    <span className="font-medium text-text-primary">{item.lead}</span>{" "}
                  </>
                ) : null}
                {item.a}
              </p>
              {item.link ? (
                <button
                  type="button"
                  onClick={() => onLink(item.link.href)}
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:text-accent-light"
                >
                  {item.link.label}
                  <span aria-hidden="true">→</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FaqV2() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [tag, setTag] = useState("all");
  const [openIdx, setOpenIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const items = useMemo(
    () => (tag === "all" ? LANDING_FAQ : LANDING_FAQ.filter((item) => item.tag === tag)),
    [tag],
  );
  const hidden = tag === "all" ? Math.max(items.length - PREVIEW_COUNT, 0) : 0;

  const goHash = (href) => {
    if (href?.startsWith("#")) {
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (href) navigate(href);
  };

  const goStart = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    trackFunnel("cta_click", { source: "faq_cta", path: "/" });
    navigate(loginUrl("/home", { source: "faq_cta" }));
  };

  const pickTag = (id) => {
    setTag(id);
    setShowAll(id !== "all");
    setOpenIdx(0);
  };

  return (
    <section
      id="faq"
      className="relative z-10 mx-auto w-full max-w-3xl scroll-mt-32 px-4 py-16 sm:py-20 lg:px-8 lg:py-28"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          Straight answers
        </p>
        <h2 className="mt-3 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:mt-4 sm:text-[38px] lg:text-[48px]">
          Check us before you{" "}
          <span className="whitespace-nowrap bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            trust us.
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] font-medium leading-[1.64] text-text-muted sm:text-[17px] lg:text-[20px]">
          Free vs paid, how a win is counted, what Agent can touch. Written so you
          can verify it — not so we sound bigger.
        </p>
      </div>

      <div
        className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-2"
        role="tablist"
        aria-label="FAQ topics"
      >
        {FAQ_TAGS.map((t) => {
          const on = tag === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickTag(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                on
                  ? "bg-accent text-accent-fg"
                  : "bg-ink/[0.04] text-text-primary/75 hover:bg-ink/[0.08] hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-10 space-y-2.5 sm:mt-12">
        {items.map((item, i) => {
          const shown = i < PREVIEW_COUNT || showAll || tag !== "all";
          return (
            <div
              key={item.q}
              {...(shown ? {} : { inert: "" })}
              className={shown ? "" : "pointer-events-none h-0 overflow-hidden opacity-0"}
            >
              <Row
                item={item}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
                onLink={goHash}
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
            {showAll ? "Show fewer" : `Show all ${items.length} questions`}
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

      <div className="mt-12 flex flex-col items-center gap-4 text-center sm:mt-14">
        <p className="max-w-md text-[14px] leading-relaxed text-text-muted">
          The record is public. A free account just lets you go deeper — Pulse,
          older call levels, and the rest of the book.
        </p>
        <div className="flex w-full flex-col items-center justify-center gap-2.5 sm:w-auto sm:flex-row">
          <PrimaryButton size="lg" width="fullMobile" onClick={goStart} className="group">
            {isAuthenticated ? CTA.primaryAuthed : CTA.primaryGuest}
            <BtnArrow />
          </PrimaryButton>
          <SecondaryButton size="lg" width="fullMobile" onClick={() => goHash("#performance")}>
            See the public record
          </SecondaryButton>
        </div>
      </div>
    </section>
  );
}
