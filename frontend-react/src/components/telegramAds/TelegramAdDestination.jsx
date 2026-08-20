import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import TopPerformers from "../TopPerformers";
import { TELEGRAM_AD_CREATIVES } from "../../utils/telegramAdsLaunchPlan";
import { trackFunnel } from "../../utils/funnelAnalytics";

const EXPERIENCES = {
  "proof-timestamps": {
    eyebrow: "Resolved call proof",
    title: "Audit a resolved call from entry to final outcome.",
    description:
      "Open any resolved row below to inspect the published entry, tracked updates and recorded outcome.",
    modules: [
      ["Published", "Timestamped call and entry"],
      ["Tracked", "Targets, stop and updates"],
      ["Resolved", "Final recorded outcome"],
    ],
    primaryLabel: "Browse resolved proof",
    primaryPath: "#resolved-proof",
  },
  "signal-process": {
    eyebrow: "Signal process",
    title: "Inspect the process before following a signal.",
    description:
      "LuxQuant keeps the call journey together so the entry, targets, stop, updates and outcome can be inspected in context.",
    modules: [
      ["Entry", "Original level and publish time"],
      ["Targets", "Planned take-profit levels"],
      ["Stop", "Recorded invalidation level"],
      ["Updates", "Journey after publication"],
      ["Outcome", "Resolved result, not a promise"],
    ],
    primaryLabel: "Inspect resolved journeys",
    primaryPath: "#resolved-proof",
  },
  "terminal-context": {
    eyebrow: "LuxQuant Terminal",
    title: "Put every signal in broader market context.",
    description:
      "Review calls alongside market flow, on-chain data, Bitcoin metrics and research in one Telegram Mini App.",
    modules: [
      ["Calls", "Published and resolved signals"],
      ["Market flow", "Liquidity and market structure"],
      ["On-chain", "Network and exchange activity"],
      ["Bitcoin", "BTC-specific market metrics"],
      ["Research", "News, data and AI-assisted context"],
    ],
    primaryLabel: "See the resolved track record",
    primaryPath: "#resolved-proof",
  },
};

function scrollToProof() {
  document.getElementById("resolved-proof")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function TelegramAdDestination({ variant }) {
  const navigate = useNavigate();
  const experience = EXPERIENCES[variant] || EXPERIENCES["proof-timestamps"];
  const creative = useMemo(
    () => TELEGRAM_AD_CREATIVES.find((item) => item.id === variant),
    [variant]
  );

  useEffect(() => {
    trackFunnel("landing_view", {
      source: `telegram_ad:${variant}`,
      path: "/terminal",
      meta: { campaign: "tg-proof-scale-aug26", content: variant },
    });
  }, [variant]);

  const handleAction = (source, path) => {
    trackFunnel("cta_click", {
      source: `telegram_ad:${variant}:${source}`,
      path: "/terminal",
      meta: { campaign: "tg-proof-scale-aug26", content: variant },
    });
    if (path === "#resolved-proof") scrollToProof();
    else navigate(path);
  };

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary">
      <header className="sticky top-0 z-40 border-b border-ink/[0.07] bg-bg-primary/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-mark.png" alt="LuxQuant" className="h-9 w-9 rounded-lg" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">LuxQuant</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
                Telegram Mini App
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAction("product_overview", "/")}
            className="shrink-0 rounded-xl border border-ink/10 bg-surface-raised px-3 py-2 text-[12px] font-medium text-text-primary transition hover:border-ink/20"
          >
            Product overview
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
        <section className="overflow-hidden rounded-3xl border border-ink/[0.08] bg-surface-raised p-5 shadow-[0_24px_80px_rgb(var(--scrim)/0.18)] sm:p-8 lg:p-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
              {experience.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {experience.title}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-text-muted sm:text-base">
              {experience.description}
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {experience.modules.map(([label, detail], index) => (
              <article
                key={label}
                className="rounded-2xl border border-ink/[0.07] bg-bg-primary/55 p-4"
              >
                <p className="font-mono text-[10px] text-accent">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-2 text-[14px] font-semibold">{label}</h2>
                <p className="mt-1 text-[12px] leading-5 text-text-muted">{detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => handleAction("primary", experience.primaryPath)}
              className="rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-accent-fg transition hover:opacity-90"
            >
              {experience.primaryLabel}
            </button>
            <p className="text-[11px] leading-5 text-text-muted">
              Data is informational and historical. It is not financial advice or a guarantee.
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-ink/[0.07] bg-surface-raised/70 p-4 sm:p-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
            Sponsored-message promise
          </p>
          <p className="mt-2 text-[13px] leading-6 text-text-primary/85">
            {creative?.text || experience.description}
          </p>
        </section>

        <section id="resolved-proof" className="scroll-mt-24 pt-10">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
                Inspectable data
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Open a resolved row to inspect the call proof
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleAction("full_overview", "/")}
              className="self-start text-[12px] font-medium text-accent hover:underline sm:self-auto"
            >
              Read the full product overview →
            </button>
          </div>
          <TopPerformers />
        </section>
      </div>
    </main>
  );
}
