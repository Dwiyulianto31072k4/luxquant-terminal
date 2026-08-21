// src/components/subscription/PricingPage.jsx
// Calm pricing — Claude / ChatGPT / Kimi: one product, three billing cycles.
// Unique invoice / upgrade / Telegram assisted-pay flows unchanged.
// "Pay with admin" is not shown on public cards.

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
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] font-medium tracking-tight text-text-primary/90">{q}</span>
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
          <p className="pb-5 text-[14px] leading-relaxed text-text-primary/50">{a}</p>
        </div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="mx-auto grid max-w-5xl gap-px overflow-hidden rounded-2xl border border-ink/[0.06] bg-ink/[0.04] sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[420px] animate-pulse bg-surface-raised/80" />
      ))}
    </div>
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

  const handlePayAnotherWay = (plan) => {
    trackGrowth("plan_selected", {
      source: "pricing_page:assisted",
      entity_type: "subscription_plan",
      entity_id: plan?.id,
      meta: { plan_name: plan?.name, price_usdt: Number(plan?.price_usdt) },
    });
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/pricing" } });
      return;
    }
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
    if (plan.name === "yearly") return t("pricing.per_year");
    if (plan.name === "monthly") return t("pricing.per_month");
    return t("pricing.one_time");
  };

  const getMonthlyEquiv = (plan) => {
    if (plan.name !== "yearly" || !plan.price_usdt) return null;
    const m = Number(plan.price_usdt) / 12;
    if (!Number.isFinite(m)) return null;
    return m % 1 === 0 ? String(m) : m.toFixed(1);
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

  const getFeatures = (plan) => [
    t("pricing.feat_everything_free"),
    t("pricing.feat_signals"),
    t("pricing.feat_market"),
    t("pricing.feat_autotrade"),
    t("pricing.feat_onchain"),
    t("pricing.feat_ai"),
    plan.name === "monthly"
      ? t("pricing.feat_basic_support")
      : plan.name === "lifetime"
        ? t("pricing.feat_lifetime")
        : t("pricing.feat_support"),
  ];

  const freeFeatures = [
    t("pricing.free_feat_1"),
    t("pricing.free_feat_2"),
    t("pricing.free_feat_3"),
    t("pricing.free_feat_4"),
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
        id: "autotrade",
        label: t("pricing.compare_autotrade"),
        hint: t("pricing.compare_autotrade_hint"),
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
        id: "performance",
        label: t("pricing.compare_performance"),
        hint: t("pricing.compare_performance_hint"),
        free: "partial",
        monthly: true,
        yearly: true,
        lifetime: true,
      },
      {
        id: "support",
        label: t("pricing.compare_support"),
        free: false,
        monthly: t("pricing.compare_support_std"),
        yearly: t("pricing.compare_support_prio"),
        lifetime: t("pricing.compare_support_vip"),
      },
      {
        id: "updates",
        label: t("pricing.compare_updates"),
        free: false,
        monthly: t("pricing.compare_updates_sub"),
        yearly: t("pricing.compare_updates_sub"),
        lifetime: t("pricing.compare_updates_life"),
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

  const trustPillars = [
    { title: t("pricing.trust_since"), body: t("pricing.trust_since_body") },
    { title: t("pricing.trust_pay"), body: t("pricing.trust_pay_body") },
    { title: t("pricing.trust_keys"), body: t("pricing.trust_keys_body") },
  ];

  const howSteps = [
    { n: "1", title: t("pricing.how_1_title"), body: t("pricing.how_1_body") },
    { n: "2", title: t("pricing.how_2_title"), body: t("pricing.how_2_body") },
    { n: "3", title: t("pricing.how_3_title"), body: t("pricing.how_3_body") },
  ];

  const cardBase = "relative flex flex-col px-6 py-8 sm:px-7 sm:py-9 bg-transparent";

  const shellPad = embedded
    ? "relative z-10 mx-auto max-w-5xl px-0 pb-10 pt-1"
    : "relative z-10 mx-auto max-w-5xl px-4 pb-28 pt-14 sm:px-6 sm:pt-20 lg:pt-24";

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
        <header className={`mx-auto max-w-2xl text-center ${embedded ? "mb-8" : "mb-12 sm:mb-16"}`}>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-text-primary/35">
            {t("pricing.hero_eyebrow")}
          </p>
          <h1
            className={`font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary ${
              embedded ? "text-[1.65rem] sm:text-[2rem]" : "text-[2rem] sm:text-[2.75rem] lg:text-[3.15rem]"
            }`}
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {t("pricing.hero_title_line1")}
            <br />
            <span className="text-text-primary/50">{t("pricing.hero_title_line2")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-text-primary/50 sm:text-base">
            {isPremium
              ? `${t("pricing.subscribing_to")} ${getCurrentPlanLabel()}${
                  subStatus?.days_remaining != null
                    ? ` · ${subStatus.days_remaining} ${t("pricing.days_remaining")}`
                    : ` · ${t("pricing.lifetime_label")}`
                }`
              : t("pricing.hero_subtitle")}
          </p>
        </header>

        {!isPremium && (
          <ul
            className={`mx-auto grid max-w-5xl gap-8 sm:grid-cols-3 ${embedded ? "mb-10" : "mb-14 sm:mb-16"}`}
          >
            {trustPillars.map((p) => (
              <li key={p.title} className="text-left sm:text-center">
                <p className="text-[13px] font-medium text-text-primary/85">{p.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary/40">{p.body}</p>
              </li>
            ))}
          </ul>
        )}

        {loading ? (
          <SkeletonCards />
        ) : loadError ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-sm text-text-primary/50">{t("pricing.load_error")}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-5 text-sm text-accent underline-offset-4 hover:underline"
            >
              {t("pricing.retry")}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-[12px] text-text-primary/35">
              {t("pricing.same_product")}
            </p>

            <div className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-ink/[0.015] backdrop-blur-[2px]">
              <div className="grid divide-y divide-ink/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
                <article className={cardBase}>
                  <div className="mb-8">
                    <h2 className="text-[15px] font-medium text-text-primary/90">
                      {t("pricing.free_name")}
                    </h2>
                    <p className="mt-1 text-[13px] text-text-primary/35">{t("pricing.free_desc")}</p>
                  </div>
                  <div className="mb-8">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-sm text-text-primary/30">$</span>
                      <span
                        className="text-[2.75rem] font-semibold leading-none tracking-tight text-text-primary tabular-nums"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {t("pricing.free_price")}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-text-primary/30">{t("pricing.free_forever")}</p>
                  </div>
                  <ul className="mb-10 flex-1 space-y-3">
                    {freeFeatures.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2.5 text-[13px] leading-snug text-text-primary/45"
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          tone="rgb(var(--ink) / 0.25)"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate(isAuthenticated ? "/" : "/login")}
                    className="mt-auto w-full rounded-lg border border-ink/[0.1] py-2.5 text-[13px] font-medium text-text-primary/70 transition hover:border-ink/20 hover:text-text-primary"
                  >
                    {t("pricing.free_cta")}
                  </button>
                </article>

                {sortedPlans.map((plan) => {
                  const recommended = isRecommended(plan.name);
                  const current = isCurrentPlan(plan);
                  const features = getFeatures(plan);
                  const equiv = getMonthlyEquiv(plan);

                  return (
                    <article
                      key={plan.id}
                      className={`${cardBase} ${
                        recommended && !current ? "bg-accent/[0.035] ring-1 ring-inset ring-accent/30" : ""
                      } ${current ? "bg-profit/[0.03]" : ""}`}
                    >
                      <div className="mb-8">
                        <div className="flex items-baseline justify-between gap-2">
                          <h2 className="text-[15px] font-medium text-text-primary/90">
                            {getPlanLabel(plan)}
                          </h2>
                          {recommended && !current && (
                            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                              {t("pricing.recommended")}
                            </span>
                          )}
                          {current && (
                            <span className="text-[11px] font-medium text-profit/90">
                              {t("pricing.current_plan")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] text-text-primary/35">{getPlanDesc(plan)}</p>
                      </div>

                      <div className="mb-8">
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm text-text-primary/30">$</span>
                          <span
                            className="text-[2.75rem] font-semibold leading-none tracking-tight text-text-primary tabular-nums"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          >
                            {plan.price_usdt}
                          </span>
                          <span className="ml-1 text-[12px] text-text-primary/30">USDT</span>
                        </div>
                        <p className="mt-2 text-[12px] text-text-primary/30">
                          {getPriceSuffix(plan)}
                          {equiv ? (
                            <span className="text-text-primary/40">
                              {" "}
                              · {t("pricing.equiv_month", { price: equiv })}
                            </span>
                          ) : null}
                          {plan.name === "yearly" ? (
                            <span className="text-text-primary/45">
                              {" "}
                              · {t("pricing.yearly_save")}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <ul className="mb-10 flex-1 space-y-3">
                        {features.map((f) => (
                          <li
                            key={f}
                            className="flex gap-2.5 text-[13px] leading-snug text-text-primary/55"
                          >
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        onClick={() => handleSubscribe(plan)}
                        disabled={creating || current}
                        className={`mt-auto w-full rounded-lg py-2.5 text-[13px] font-medium transition disabled:cursor-default active:scale-[0.99] ${
                          current
                            ? "border border-profit/25 bg-profit/[0.06] text-profit/90"
                            : recommended
                              ? "bg-accent text-accent-fg hover:brightness-105"
                              : "border border-ink/[0.12] text-text-primary/85 hover:border-ink/25 hover:bg-ink/[0.03]"
                        }`}
                      >
                        {creating && selectedPlan === plan.id
                          ? t("pricing.processing")
                          : getButtonLabel(plan)}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>

            <p className="mx-auto mt-8 max-w-xl text-center text-[13px] leading-relaxed text-text-primary/35">
              {t("pricing.payment_desc")}{" "}
              <span className="text-text-primary/50">
                {t("pricing.trust_cancel")} · {t("pricing.trust_secure")}
              </span>
            </p>

            <section className={`mx-auto max-w-3xl ${embedded ? "mt-14" : "mt-20 sm:mt-24"}`}>
              <h2
                className="mb-2 text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.how_title")}
              </h2>
              <p className="mb-10 text-center text-[14px] text-text-primary/40">
                {t("pricing.how_subtitle")}
              </p>
              <ol className="grid gap-8 sm:grid-cols-3">
                {howSteps.map((s) => (
                  <li key={s.n} className="text-left">
                    <span
                      className="font-mono text-[11px] text-text-primary/30"
                      aria-hidden
                    >
                      {s.n}
                    </span>
                    <p className="mt-2 text-[14px] font-medium text-text-primary/85">{s.title}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary/40">{s.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <div className="mx-auto mt-12 max-w-xl rounded-xl border border-ink/[0.07] px-5 py-4 text-center sm:px-8">
              <p className="text-[14px] font-medium text-text-primary/80">
                {t("pricing.pay_other_title")}
              </p>
              <p className="mt-1 text-[13px] text-text-primary/40">{t("pricing.pay_other_body")}</p>
              <button
                type="button"
                onClick={() => handlePayAnotherWay(sortedPlans.find((p) => p.name === "yearly"))}
                className="mt-3 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
              >
                {t("pricing.pay_other_cta")}
              </button>
            </div>

            <section className={`mx-auto max-w-lg ${embedded ? "mt-14" : "mt-20 sm:mt-24"}`}>
              <h2
                className="mb-2 text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.compare_title")}
              </h2>
              <p className="mb-8 text-center text-[14px] text-text-primary/40">
                {t("pricing.compare_subtitle")}
              </p>

              <div
                className="mb-6 grid grid-cols-4 gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-1"
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
                      className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block text-[13px] text-text-primary/70 sm:text-[14px]">
                          {row.label}
                        </span>
                        {row.hint ? (
                          <span className="mt-0.5 block text-[12px] leading-snug text-text-primary/35">
                            {row.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 pt-0.5 text-right">
                        {v.kind === "yes" && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-accent">
                            <Check className="h-3.5 w-3.5" />
                            <span className="sr-only">{t("pricing.included")}</span>
                          </span>
                        )}
                        {v.kind === "no" && (
                          <span className="text-[13px] text-text-primary/20" aria-label={t("pricing.not_included")}>
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

              <p className="mt-4 text-center text-[12px] leading-relaxed text-text-primary/30">
                {t("pricing.compare_note")}
              </p>
            </section>

            <section className={`mx-auto max-w-xl ${embedded ? "mt-14" : "mt-20 sm:mt-24"}`}>
              <h2
                className="mb-8 text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
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
              <div className="mt-16 text-center">
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
      />
    </div>
  );
};

export default PricingPage;
