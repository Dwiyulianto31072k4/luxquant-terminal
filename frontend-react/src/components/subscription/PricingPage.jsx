// src/components/subscription/PricingPage.jsx
// Efficient pricing: short cards, mobile one-plan picker, Agent as Annual+ request.

import Seo from "../Seo";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";
import { trackGrowth } from "../../utils/growthAnalytics";

const Check = ({ className = "h-3.5 w-3.5", tone = "rgb(var(--accent) / 0.85)" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke={tone}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
);

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-[14px] font-medium tracking-tight text-text-primary/90 sm:text-[15px]">
          {q}
        </span>
        <span
          className={`shrink-0 text-text-primary/30 transition-transform duration-200 ${open ? "rotate-45" : ""}`}
          aria-hidden
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="pb-4 text-[13px] leading-relaxed text-text-primary/50 sm:text-[14px]">{a}</p>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  desc,
  price,
  suffix,
  meta,
  features,
  inherits,
  cta,
  ctaNote,
  onCta,
  disabled,
  recommended,
  current,
  busy,
  mutedChecks,
}) {
  // Each plan is its own rounded card with air around it, the way the pricing
  // pages people compare us against are built. The old grid was one hard-edged
  // block cut by dividers, which made four plans read as one table and left
  // nowhere to lift the recommended one.
  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl border px-5 py-6 transition-shadow sm:px-6 ${
        current
          ? "border-profit/30 bg-profit/[0.03]"
          : recommended
            ? "border-accent/45 bg-accent/[0.035] shadow-[0_8px_30px_-12px_rgb(var(--accent)/0.35)] lg:-mt-3 lg:pb-8 lg:pt-8"
            : "border-ink/[0.09] bg-surface-raised"
      }`}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
          {recommended && !current && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-fg">
              {meta?.recommendedLabel}
            </span>
          )}
          {current && (
            <span className="text-[11px] font-medium text-profit/90">{meta?.currentLabel}</span>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-text-primary/45">{desc}</p>
      </div>

      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] text-text-primary/30">$</span>
          <span
            className="text-[2.35rem] font-semibold leading-none tracking-tight text-text-primary tabular-nums sm:text-[2.5rem]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {price}
          </span>
          {suffix ? (
            <span className="ml-0.5 text-[11px] text-text-primary/35">{suffix}</span>
          ) : null}
        </div>
        {meta?.line ? (
          <p className="mt-1.5 text-[12px] text-text-primary/40">{meta.line}</p>
        ) : null}
      </div>

      {/* A line of text per benefit was the whole list. What a reader wants to
          know is what each one gives them, so every item carries one plain
          sentence under it. `inherits` names the tier below instead of
          repeating its items. */}
      {inherits ? (
        <p className="mb-3 border-t border-ink/[0.07] pt-4 text-[12px] font-medium text-text-primary/60">
          {inherits}
        </p>
      ) : (
        <div className="mb-3 border-t border-ink/[0.07] pt-4" />
      )}

      <ul className="mb-6 flex-1 space-y-3">
        {features.map((f) => {
          const label = typeof f === "string" ? f : f.t;
          const detail = typeof f === "string" ? null : f.d;
          return (
            <li key={label} className="flex gap-2.5">
              <Check
                className="mt-[3px] h-3.5 w-3.5 shrink-0"
                tone={mutedChecks ? "rgb(var(--ink) / 0.3)" : "rgb(var(--accent) / 0.9)"}
              />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-text-primary/85">{label}</p>
                {detail ? (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-text-primary/40">{detail}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={onCta}
        disabled={disabled || busy}
        className={`mt-auto w-full rounded-xl py-3 text-[13.5px] font-semibold transition disabled:cursor-default active:scale-[0.99] ${
          current
            ? "border border-profit/25 bg-profit/[0.06] text-profit/90"
            : recommended
              ? "bg-accent text-accent-fg hover:brightness-105"
              : "border border-ink/[0.14] text-text-primary hover:border-ink/30 hover:bg-ink/[0.03]"
        }`}
      >
        {cta}
      </button>
      {ctaNote ? (
        <p className="mt-2 text-center text-[11px] text-text-primary/35">{ctaNote}</p>
      ) : null}
    </article>
  );
}

const PricingPage = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [adminModalPlan, setAdminModalPlan] = useState(null);
  const [adminIntent, setAdminIntent] = useState("pay");
  const [mobileId, setMobileId] = useState("yearly");
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const embedded = location.pathname.startsWith("/account/subscription");

  useEffect(() => {
    trackGrowth("pricing_viewed", {
      source: embedded ? "account_subscription" : "pricing_page",
      once: embedded ? "pricing:account" : "pricing:view",
    });
  }, [embedded]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [plansData, statusData] = await Promise.all([
        subscriptionApi.getPlans(),
        isAuthenticated ? subscriptionApi.getMySubscription().catch(() => null) : null,
      ]);
      setPlans(Array.isArray(plansData) ? plansData : []);
      setSubStatus(statusData);
    } catch (err) {
      console.error("Failed to load pricing data:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const isPremium =
    (Boolean(subStatus?.is_subscribed) && subStatus?.tier !== "admin") ||
    Boolean(subStatus?.is_premium) ||
    ["premium", "subscriber"].includes(String(user?.role || "").toLowerCase());
  const currentPlanName = subStatus?.plan_name;

  const sortedPlans = useMemo(() => {
    const order = { monthly: 1, yearly: 2, lifetime: 3 };
    return [...plans].sort(
      (a, b) => (order[a.name] ?? a.sort_order ?? 99) - (order[b.name] ?? b.sort_order ?? 99)
    );
  }, [plans]);

  const handleSubscribe = async (plan) => {
    trackGrowth("plan_selected", {
      source: "pricing_page:onchain",
      entity_type: "subscription_plan",
      entity_id: plan.id,
      meta: { plan_name: plan.name, price_usdt: Number(plan.price_usdt) },
    });
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/pricing" } });
      return;
    }
    if (isPremium && plan.name === currentPlanName) return;
    setSelectedPlan(plan.id);
    setCreating(true);
    try {
      let invoice;
      try {
        invoice = await subscriptionApi.createInvoice(plan.id, isPremium);
      } catch (err) {
        const detail = String(err.response?.data?.detail || "");
        if (err.response?.status === 400 && /is_upgrade|sudah punya subscription/i.test(detail)) {
          invoice = await subscriptionApi.createInvoice(plan.id, true);
        } else {
          throw err;
        }
      }
      navigate("/payment", { state: { invoice, plan } });
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create invoice");
    } finally {
      setCreating(false);
      setSelectedPlan(null);
    }
  };

  const openAssisted = (plan, intent = "pay") => {
    trackGrowth("plan_selected", {
      source: intent === "agent" ? "pricing_page:agent" : "pricing_page:assisted",
      entity_type: "subscription_plan",
      entity_id: plan?.id,
      meta: { plan_name: plan?.name, price_usdt: Number(plan?.price_usdt), intent },
    });
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/pricing" } });
      return;
    }
    setAdminIntent(intent);
    setAdminModalPlan(plan || sortedPlans.find((p) => p.name === "yearly") || sortedPlans[0]);
  };

  const isRecommended = (name) => name === "yearly";
  const isCurrentPlan = (plan) => isPremium && plan.name === currentPlanName;

  const getPlanLabel = (plan) => {
    switch (plan?.name) {
      case "monthly":
        return t("pricing.monthly");
      case "yearly":
        return t("pricing.yearly");
      case "lifetime":
        return t("pricing.lifetime");
      default:
        return plan?.label;
    }
  };

  const getPlanDesc = (plan) => {
    switch (plan.name) {
      case "monthly":
        return t("pricing.monthly_desc");
      case "yearly":
        return t("pricing.yearly_desc");
      case "lifetime":
        return t("pricing.lifetime_desc");
      default:
        return plan.description;
    }
  };

  const getPriceSuffix = (plan) => {
    if (plan.name === "yearly") return "USDT";
    if (plan.name === "monthly") return "USDT";
    return "USDT";
  };

  const getMetaLine = (plan) => {
    if (plan.name === "yearly") {
      const m = Number(plan.price_usdt) / 12;
      const equiv = Number.isFinite(m) ? (m % 1 === 0 ? String(m) : m.toFixed(1)) : null;
      return [
        t("pricing.per_year"),
        equiv ? t("pricing.equiv_month", { price: equiv }) : null,
        t("pricing.yearly_save"),
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (plan.name === "monthly") return t("pricing.per_month");
    return t("pricing.one_time");
  };

  const getButtonLabel = (plan) => {
    if (!isPremium) {
      if (plan.name === "monthly") return t("pricing.get_monthly");
      if (plan.name === "yearly") return t("pricing.get_yearly");
      if (plan.name === "lifetime") return t("pricing.get_lifetime");
      return t("pricing.continue_payment");
    }
    if (plan.name === currentPlanName) return t("pricing.current_plan");
    const currentPlan = plans.find((p) => p.name === currentPlanName);
    if (currentPlan && plan.sort_order > currentPlan.sort_order) return t("pricing.upgrade_pay");
    if (currentPlan && plan.sort_order < currentPlan.sort_order) return t("pricing.downgrade");
    return t("pricing.switch_pay");
  };

  const getCurrentPlanLabel = () =>
    getPlanLabel({ name: subStatus?.plan_name, label: subStatus?.plan_label }) ||
    t("pricing.premium");

  // Each tier lists only what IT adds; `getInherits` names the tier below.
  // Repeating "Everything in Monthly" as a bullet spent the first line of
  // every card saying nothing about that card.
  const getFeatures = (plan) => {
    if (plan.name === "monthly") {
      return [
        { t: t("pricing.feat_signals"), d: t("pricing.featd_signals") },
        { t: t("pricing.feat_market"), d: t("pricing.featd_market") },
        { t: t("pricing.feat_onchain_ai"), d: t("pricing.featd_onchain_ai") },
        { t: t("pricing.feat_basic_support"), d: t("pricing.featd_basic_support") },
      ];
    }
    if (plan.name === "yearly") {
      return [
        { t: t("pricing.feat_support"), d: t("pricing.featd_support") },
        { t: t("pricing.feat_requests"), d: t("pricing.featd_requests") },
      ];
    }
    return [
      { t: t("pricing.feat_vip_support"), d: t("pricing.featd_vip_support") },
      { t: t("pricing.feat_lifetime"), d: t("pricing.featd_lifetime") },
    ];
  };

  const getInherits = (plan) =>
    plan.name === "yearly"
      ? t("pricing.inherits_monthly")
      : plan.name === "lifetime"
        ? t("pricing.inherits_yearly")
        : null;

  const freeFeatures = [
    { t: t("pricing.free_feat_1"), d: t("pricing.free_featd_1") },
    { t: t("pricing.free_feat_2"), d: t("pricing.free_featd_2") },
    { t: t("pricing.free_feat_3"), d: t("pricing.free_featd_3") },
  ];

  const faqs = [
    { q: t("pricing.faq_q1"), a: t("pricing.faq_a1") },
    { q: t("pricing.faq_q2"), a: t("pricing.faq_a2") },
    { q: t("pricing.faq_q3"), a: t("pricing.faq_a3") },
    { q: t("pricing.faq_q4"), a: t("pricing.faq_a4") },
    { q: t("pricing.faq_q5"), a: t("pricing.faq_a5") },
    { q: t("pricing.faq_q6"), a: t("pricing.faq_a6") },
    { q: t("pricing.faq_q9"), a: t("pricing.faq_a9") },
    { q: t("pricing.faq_q10"), a: t("pricing.faq_a10") },
    { q: t("pricing.faq_q7"), a: t("pricing.faq_a7") },
    { q: t("pricing.faq_q8"), a: t("pricing.faq_a8") },
  ];

  const compareMatrix = useMemo(
    () => [
      {
        id: "signals",
        label: t("pricing.compare_signals"),
        hint: t("pricing.compare_signals_hint"),
        free: false,
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "called",
        label: t("pricing.compare_called"),
        hint: t("pricing.compare_called_hint"),
        free: false,
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "onchain",
        label: t("pricing.compare_onchain"),
        hint: t("pricing.compare_onchain_hint"),
        free: false,
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "ai",
        label: t("pricing.compare_ai"),
        hint: t("pricing.compare_ai_hint"),
        free: false,
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "analytics",
        label: t("pricing.compare_analytics"),
        hint: t("pricing.compare_analytics_hint"),
        free: "partial",
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "autotrade",
        label: t("pricing.compare_autotrade"),
        hint: t("pricing.compare_autotrade_hint"),
        free: false,
        monthly: false,
        yearly: t("pricing.compare_requests_yes"),
        lifetime: t("pricing.compare_requests_yes"),
      },
      {
        id: "support",
        label: t("pricing.compare_support"),
        free: false,
        monthly: t("pricing.compare_support_std"),
        yearly: t("pricing.compare_support_prio"),
        lifetime: t("pricing.compare_support_vip"),
      },
    ],
    [t]
  );

  const includeTabs = useMemo(
    () => [
      { id: "free", label: t("pricing.free_name") },
      { id: "monthly", label: t("pricing.monthly") },
      { id: "yearly", label: t("pricing.yearly") },
      { id: "lifetime", label: t("pricing.lifetime") },
    ],
    [t]
  );

  const [includeTab, setIncludeTab] = useState("yearly");

  const formatIncludeValue = (v) => {
    if (v === true) return { kind: "yes" };
    if (v === false || v === "—") return { kind: "no" };
    if (v === "partial") return { kind: "partial", text: t("pricing.limited") };
    return { kind: "text", text: String(v) };
  };

  const trustChips = [
    t("pricing.trust_since"),
    t("pricing.trust_pay"),
    t("pricing.trust_norenew"),
    t("pricing.trust_speed"),
  ];

  const howSteps = [
    { n: "1", title: t("pricing.how_1_title"), body: t("pricing.how_1_body") },
    { n: "2", title: t("pricing.how_2_title"), body: t("pricing.how_2_body") },
    { n: "3", title: t("pricing.how_3_title"), body: t("pricing.how_3_body") },
  ];

  const yearlyPlan = sortedPlans.find((p) => p.name === "yearly");
  const cardMeta = {
    recommendedLabel: t("pricing.recommended"),
    currentLabel: t("pricing.current_plan"),
  };

  const freeCard = (
    <PlanCard
      title={t("pricing.free_name")}
      desc={t("pricing.free_desc")}
      price={t("pricing.free_price")}
      features={freeFeatures}
      ctaNote={t("pricing.cta_note_free")}
      cta={t("pricing.free_cta")}
      onCta={() => navigate(isAuthenticated ? "/" : "/login")}
      mutedChecks
      meta={{ line: t("pricing.free_forever"), ...cardMeta }}
    />
  );

  const renderPaid = (plan) => {
    const recommended = isRecommended(plan.name);
    const current = isCurrentPlan(plan);
    return (
      <PlanCard
        key={plan.id}
        title={getPlanLabel(plan)}
        desc={getPlanDesc(plan)}
        price={plan.price_usdt}
        suffix={getPriceSuffix(plan)}
        features={getFeatures(plan)}
        inherits={getInherits(plan)}
        ctaNote={t("pricing.cta_note_paid")}
        cta={
          creating && selectedPlan === plan.id ? t("pricing.processing") : getButtonLabel(plan)
        }
        onCta={() => handleSubscribe(plan)}
        disabled={creating || current}
        busy={creating && selectedPlan === plan.id}
        recommended={recommended}
        current={current}
        meta={{ line: getMetaLine(plan), ...cardMeta }}
      />
    );
  };

  const paidCards = sortedPlans.map((plan) => renderPaid(plan));

  const mobilePlan =
    mobileId === "free" ? null : sortedPlans.find((p) => p.name === mobileId) || yearlyPlan;

  const shellPad = embedded
    ? "relative z-10 mx-auto max-w-5xl px-0 pb-8 pt-1"
    : "relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:pt-16";

  return (
    <div className={embedded ? "relative" : "relative min-h-screen"}>
      {!embedded && (
        <Seo
          title={t("pricing.seo_title")}
          description={t("pricing.seo_desc")}
          path="/pricing"
          keywords="luxquant pricing, crypto signals subscription, quant terminal plans"
          jsonLd={[
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://luxquant.tw/" },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Pricing",
                  item: "https://luxquant.tw/pricing",
                },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "Product",
              name: "LuxQuant Terminal",
              brand: { "@type": "Brand", name: "LuxQuant" },
              url: "https://luxquant.tw/pricing",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "0",
                priceCurrency: "USD",
                offerCount: "4",
                availability: "https://schema.org/InStock",
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]}
        />
      )}

      <div className={shellPad}>
        <header className={`mx-auto max-w-2xl text-center ${embedded ? "mb-6" : "mb-10 sm:mb-12"}`}>
          <p className="mb-3 text-[12px] font-medium tracking-wide text-text-primary/40">
            {t("pricing.hero_eyebrow")}
          </p>
          {/* One colour, one weight, balanced wrap. The two-tone split greyed
              out half the sentence and pushed a lone "pay." onto its own line;
              `text-balance` keeps the two lines even at any width instead. */}
          <h1
            className={`text-balance font-semibold leading-[1.1] tracking-[-0.03em] text-text-primary ${
              embedded ? "text-[1.55rem] sm:text-[1.85rem]" : "text-[2rem] sm:text-[2.6rem] lg:text-[3rem]"
            }`}
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {t("pricing.hero_title_line1")} {t("pricing.hero_title_line2")}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-balance text-[14.5px] leading-relaxed text-text-primary/50 sm:text-[15.5px]">
            {isPremium
              ? `${t("pricing.subscribing_to")} ${getCurrentPlanLabel()}${
                  subStatus?.days_remaining != null
                    ? ` · ${subStatus.days_remaining} ${t("pricing.days_remaining")}`
                    : ` · ${t("pricing.lifetime_label")}`
                }`
              : t("pricing.hero_subtitle")}
          </p>
          {!isPremium && (
            /* Sentence case, like every other label on the product now. The
               all-caps mono row read as a system banner above a headline. */
            <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[12.5px] text-text-primary/40">
              {trustChips.map((c, i) => (
                <span key={c} className="inline-flex items-center gap-2.5">
                  {i > 0 ? <span className="text-text-primary/20">·</span> : null}
                  {c}
                </span>
              ))}
            </p>
          )}
        </header>

        {loading ? (
          <div className="mx-auto h-[340px] max-w-5xl animate-pulse rounded-2xl border border-ink/[0.06] bg-ink/[0.04]" />
        ) : loadError ? (
          <div className="mx-auto max-w-sm py-12 text-center">
            <p className="text-sm text-text-primary/50">{t("pricing.load_error")}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 text-sm text-accent underline-offset-4 hover:underline"
            >
              {t("pricing.retry")}
            </button>
          </div>
        ) : (
          <>
            {/* Mobile — one plan at a time */}
            <div className="lg:hidden">
              <div
                className="mb-3 grid grid-cols-4 gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-1"
                role="tablist"
                aria-label={t("pricing.hero_eyebrow")}
              >
                {includeTabs.map((tab) => {
                  const active = mobileId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMobileId(tab.id)}
                      className={`rounded-lg py-2.5 text-[11px] font-medium ${
                        active
                          ? "bg-ink text-ink-inv shadow-sm"
                          : "text-text-primary/45 hover:text-text-primary/75"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-ink/[0.015]">
                {mobileId === "free" ? freeCard : mobilePlan ? renderPaid(mobilePlan) : null}
              </div>
            </div>

            {/* Desktop — four cards with air between them, so the recommended
                one can lift out of the row. Extra top padding because that card
                is pulled up by -mt-3 and would otherwise clip its own badge. */}
            <div className="hidden lg:block lg:pt-3">
              <div className="grid grid-cols-4 items-stretch gap-4">
                {freeCard}
                {paidCards}
              </div>
            </div>

            <p className="mx-auto mt-4 max-w-xl text-center text-[12px] leading-relaxed text-text-primary/35">
              {t("pricing.same_product")} {t("pricing.payment_desc")}
            </p>

            <div className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-2 rounded-xl border border-ink/[0.07] px-4 py-3.5 text-center sm:px-6">
              <p className="text-[13px] leading-relaxed text-text-primary/60">{t("pricing.agent_note")}</p>
              <button
                type="button"
                onClick={() => openAssisted(yearlyPlan, "agent")}
                className="text-[13px] font-medium text-accent underline-offset-4 hover:underline"
              >
                {t("pricing.agent_note_cta")}
                <span className="ml-1.5 text-[11px] font-normal text-text-primary/35">
                  {t("pricing.agent_yearly_only")}
                </span>
              </button>
            </div>

            <section className={`mx-auto max-w-3xl ${embedded ? "mt-12" : "mt-14 sm:mt-16"}`}>
              <h2
                className="mb-1 text-center text-lg font-semibold tracking-tight text-text-primary sm:text-xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.how_title")}
              </h2>
              <p className="mb-6 text-center text-[13px] text-text-primary/40">
                {t("pricing.how_subtitle")}
              </p>
              <ol className="grid gap-5 sm:grid-cols-3 sm:gap-6">
                {howSteps.map((s) => (
                  <li key={s.n} className="flex gap-3 sm:block">
                    <span className="font-mono text-[11px] text-text-primary/30" aria-hidden>
                      {s.n}
                    </span>
                    <div>
                      <p className="text-[14px] font-medium text-text-primary/85">{s.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-primary/40 sm:text-[13px]">
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-center text-[13px] text-text-primary/40">
                {t("pricing.pay_other_title")}{" "}
                <button
                  type="button"
                  onClick={() => openAssisted(yearlyPlan, "pay")}
                  className="font-medium text-accent underline-offset-4 hover:underline"
                >
                  {t("pricing.pay_other_cta")}
                </button>
              </p>
            </section>

            <section className={`mx-auto max-w-lg ${embedded ? "mt-12" : "mt-14 sm:mt-16"}`}>
              <h2
                className="mb-1 text-center text-lg font-semibold tracking-tight text-text-primary sm:text-xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.compare_title")}
              </h2>
              <p className="mb-5 text-center text-[13px] text-text-primary/40">
                {t("pricing.compare_subtitle")}
              </p>

              <div
                className="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-1"
                role="tablist"
                aria-label={t("pricing.compare_title")}
              >
                {includeTabs.map((tab) => {
                  const active = includeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setIncludeTab(tab.id)}
                      className={`rounded-lg py-2 text-[11px] font-medium transition sm:text-[12px] ${
                        active
                          ? "bg-ink text-ink-inv shadow-sm"
                          : "text-text-primary/45 hover:text-text-primary/75"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <ul className="divide-y divide-ink/[0.06] rounded-xl border border-ink/[0.07] px-1">
                {compareMatrix.map((row) => {
                  const raw = row[includeTab];
                  const v = formatIncludeValue(raw);
                  return (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] text-text-primary/70 sm:text-[14px]">
                          {row.label}
                        </span>
                        {row.hint ? (
                          <span className="mt-0.5 hidden text-[12px] leading-snug text-text-primary/35 sm:block">
                            {row.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        {v.kind === "yes" && (
                          <span className="inline-flex items-center text-accent">
                            <Check className="h-3.5 w-3.5" />
                            <span className="sr-only">{t("pricing.included")}</span>
                          </span>
                        )}
                        {v.kind === "no" && (
                          <span
                            className="text-[13px] text-text-primary/20"
                            aria-label={t("pricing.not_included")}
                          >
                            —
                          </span>
                        )}
                        {v.kind === "partial" && (
                          <span className="text-[12px] text-text-primary/40">{v.text}</span>
                        )}
                        {v.kind === "text" && (
                          <span className="text-[12px] text-text-primary/55">{v.text}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-center text-[12px] leading-relaxed text-text-primary/30">
                {t("pricing.compare_note")}
              </p>
            </section>

            {/* NOT READY YET — the page's missing third of the audience.
                Measured over 60 days: 162 people came back to this page two or
                more times and never paid, against 21 who did pay (median: two
                visits, under a day). For everyone still deciding, the page
                offered nothing but a buy button. These are the free ways to
                keep watching the record until the answer is yes. */}
            {!isPremium && (
              <section className={`mx-auto max-w-3xl ${embedded ? "mt-12" : "mt-14 sm:mt-16"}`}>
                <h2
                  className="mb-1 text-center text-lg font-semibold tracking-tight text-text-primary sm:text-xl"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {t("pricing.notready_title")}
                </h2>
                <p className="mb-6 text-center text-[13.5px] leading-relaxed text-text-primary/50">
                  {t("pricing.notready_sub")}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      k: "free",
                      title: t("pricing.notready_free_t"),
                      body: t("pricing.notready_free_b"),
                      cta: t("pricing.notready_free_c"),
                      onClick: () => navigate(isAuthenticated ? "/home" : "/register"),
                    },
                    {
                      k: "tg",
                      title: t("pricing.notready_tg_t"),
                      body: t("pricing.notready_tg_b"),
                      cta: t("pricing.notready_tg_c"),
                      href: "https://t.me/LuxQuantSignal",
                    },
                    {
                      k: "x",
                      title: t("pricing.notready_x_t"),
                      body: t("pricing.notready_x_b"),
                      cta: t("pricing.notready_x_c"),
                      href: "https://x.com/luxquantalgo",
                    },
                  ].map((c) => {
                    const inner = (
                      <>
                        <p className="text-[14px] font-semibold text-text-primary">{c.title}</p>
                        <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-text-primary/50">
                          {c.body}
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">
                          {c.cta}
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </span>
                      </>
                    );
                    const cls =
                      "flex h-full flex-col rounded-xl border border-ink/[0.07] bg-surface-raised px-4 py-4 text-left transition-colors hover:border-ink/[0.14]";
                    return c.href ? (
                      <a key={c.k} href={c.href} target="_blank" rel="noopener noreferrer" className={cls}>
                        {inner}
                      </a>
                    ) : (
                      <button key={c.k} type="button" onClick={c.onClick} className={cls}>
                        {inner}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className={`mx-auto max-w-xl ${embedded ? "mt-12" : "mt-14 sm:mt-16"}`}>
              <h2
                className="mb-5 text-center text-lg font-semibold tracking-tight text-text-primary sm:text-xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.faq_title")}
              </h2>
              <div className="border-t border-ink/[0.06]">
                {faqs.map((f) => (
                  <FaqItem key={f.q} q={f.q} a={f.a} />
                ))}
              </div>
            </section>

            {!embedded && (
              <div className="mt-12 text-center">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-[13px] text-text-primary/30 transition hover:text-text-primary/60"
                >
                  {t("pricing.cta_secondary")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <SubscribeViaAdminModal
        isOpen={!!adminModalPlan}
        onClose={() => setAdminModalPlan(null)}
        plan={adminModalPlan}
        intent={adminIntent}
      />
    </div>
  );
};

export default PricingPage;
