// FAQ — one editorial list. Answers stay in the DOM when collapsed
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

function Chevron({ open }) {
  return (
    <svg
      className={`mt-1 h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${
        open ? "rotate-180 text-accent" : "text-text-muted/70"
      }`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ item, open, onToggle, onLink }) {
  return (
    <div className={`lq-faq-row${open ? " is-open" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-5 py-5 text-left sm:py-[1.35rem]"
      >
        <span
          className={`min-w-0 flex-1 text-[16px] font-medium leading-snug tracking-[-0.018em] sm:text-[17.5px] ${
            open ? "text-text-primary" : "text-text-primary/88"
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
          <div className="pb-6 pr-8 sm:pr-10">
            <p className="max-w-[54ch] text-[14.5px] leading-[1.7] text-text-muted sm:text-[15.5px]">
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
                className="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:text-accent-light"
              >
                {item.link.label}
                <span aria-hidden="true">→</span>
              </button>
            ) : null}
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
      className="relative z-10 mx-auto w-full max-w-[760px] scroll-mt-32 px-4 py-16 sm:py-20 lg:px-8 lg:py-28"
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
        className="lq-faq-seg mx-auto mt-8 flex w-full max-w-xl flex-wrap items-center justify-center gap-1 p-0 sm:w-fit sm:gap-0.5 sm:p-1"
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
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-3.5 ${
                on
                  ? "bg-ink/[0.08] text-text-primary sm:bg-surface"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="lq-faq-list mt-10 sm:mt-12">
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
        <div className="mt-2 flex justify-center border-t border-ink/[0.07] pt-5">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-text-muted transition-colors hover:text-text-primary"
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
          </button>
        </div>
      )}

      <div className="mt-14 flex flex-col items-center gap-4 text-center">
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

      <style>{`
        .lq-faq-seg {
          background: transparent;
          border: 0;
        }
        @media (min-width: 640px) {
          .lq-faq-seg {
            border-radius: 999px;
            background: rgb(var(--ink) / 0.045);
            border: 1px solid rgb(var(--ink) / 0.06);
          }
        }
        .lq-faq-list {
          border-top: 1px solid rgb(var(--ink) / 0.08);
        }
        .lq-faq-row {
          border-bottom: 1px solid rgb(var(--ink) / 0.08);
        }
        .lq-faq-row.is-open button span:first-of-type {
          color: rgb(var(--fg));
        }
        @media (hover: hover) {
          .lq-faq-row:not(.is-open) button:hover span:first-of-type {
            color: rgb(var(--fg));
          }
        }
      `}</style>
    </section>
  );
}
