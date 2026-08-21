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
  cta,
  onCta,
  disabled,
  recommended,
  current,
  busy,
  mutedChecks,
}) {
  return (
    <article
      className={`relative flex h-full flex-col px-5 py-6 sm:px-6 sm:py-7 ${
        recommended && !current ? "bg-accent/[0.04] ring-1 ring-inset ring-accent/30" : ""
      } ${current ? "bg-profit/[0.03]" : ""}`}
    >
      <div className="mb-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium text-text-primary/90">{title}</h2>
          {recommended && !current && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
              {meta?.recommendedLabel}
            </span>
          )}
          {current && (
            <span className="text-[11px] font-medium text-profit/90">{meta?.currentLabel}</span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-snug text-text-primary/40">{desc}</p>
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

      <ul className="mb-6 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-[13px] leading-snug text-text-primary/55">
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              tone={mutedChecks ? "rgb(var(--ink) / 0.25)" : "rgb(var(--accent) / 0.85)"}
            />
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onCta}
        disabled={disabled || busy}
        className={`mt-auto w-full rounded-lg py-2.5 text-[13px] font-medium transition disabled:cursor-default active:scale-[0.99] ${
          current
            ? "border border-profit/25 bg-profit/[0.06] text-profit/90"
            : recommended
              ? "bg-accent text-accent-fg hover:brightness-105"
              : "border border-ink/[0.12] text-text-primary/85 hover:border-ink/25 hover:bg-ink/[0.03]"
        }`}
      >
        {cta}
      </button>
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

  const getFeatures = (plan) => {
    if (plan.name === "monthly") {
      return [
        t("pricing.feat_signals"),
        t("pricing.feat_market"),
        t("pricing.feat_onchain_ai"),
        t("pricing.feat_basic_support"),
      ];
    }
    if (plan.name === "yearly") {
      return [
        t("pricing.feat_everything_monthly"),
        t("pricing.feat_support"),
        t("pricing.feat_requests"),
      ];
    }
    return [
      t("pricing.feat_everything_yearly"),
      t("pricing.feat_vip_support"),
      t("pricing.feat_lifetime"),
    ];
  };

  const freeFeatures = [
    t("pricing.free_feat_1"),
    t("pricing.free_feat_2"),
    t("pricing.free_feat_3"),
  ];

  const faqs = [
    { q: t("pricing.faq_q1"), a: t("pricing.faq_a1") },
    { q: t("pricing.faq_q2"), a: t("pricing.faq_a2") },
    { q: t("pricing.faq_q3"), a: t("pricing.faq_a3") },
    { q: t("pricing.faq_q4"), a: t("pricing.faq_a4") },
    { q: t("pricing.faq_q5"), a: t("pricing.faq_a5") },
    { q: t("pricing.faq_q6"), a: t("pricing.faq_a6") },
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
    t("pricing.trust_keys"),
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
        <header className={`mx-auto max-w-xl text-center ${embedded ? "mb-6" : "mb-8 sm:mb-10"}`}>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-text-primary/35">
            {t("pricing.hero_eyebrow")}
          </p>
          <h1
            className={`font-semibold leading-[1.12] tracking-[-0.03em] text-text-primary ${
              embedded ? "text-[1.55rem] sm:text-[1.85rem]" : "text-[1.85rem] sm:text-[2.45rem] lg:text-[2.75rem]"
            }`}
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {t("pricing.hero_title_line1")}{" "}
            <span className="text-text-primary/50">{t("pricing.hero_title_line2")}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-text-primary/50 sm:text-[15px]">
            {isPremium
              ? `${t("pricing.subscribing_to")} ${getCurrentPlanLabel()}${
                  subStatus?.days_remaining != null
                    ? ` · ${subStatus.days_remaining} ${t("pricing.days_remaining")}`
                    : ` · ${t("pricing.lifetime_label")}`
                }`
              : t("pricing.hero_subtitle")}
          </p>
          {!isPremium && (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.12em] text-text-primary/35">
              {trustChips.map((c, i) => (
                <span key={c} className="inline-flex items-center gap-3">
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

            {/* Desktop — four compact columns */}
            <div className="hidden overflow-hidden rounded-2xl border border-ink/[0.08] bg-ink/[0.015] lg:block">
              <div className="grid grid-cols-4 divide-x divide-ink/[0.06]">
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
