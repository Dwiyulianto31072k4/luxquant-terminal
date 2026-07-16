// src/components/subscription/PricingPage.jsx
// Calm, product-grade pricing — OpenAI / Anthropic / SpaceXAI tone.
// Seamless with global luxury-bg (no grid “page-in-page”). No pill badges.
// Keeps invoice / upgrade / Telegram admin flows.

import Seo from "../Seo";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";

const Check = ({ className = "h-3.5 w-3.5", tone = "rgba(212,168,83,0.85)" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const TelegramIcon = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-medium tracking-tight text-text-primary/90">{q}</span>
        <span className={`shrink-0 text-text-primary/30 transition-transform duration-200 ${open ? "rotate-45" : ""}`} aria-hidden>
          +
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <p className="pb-5 text-[14px] leading-relaxed text-text-primary/45">{a}</p>
        </div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="mx-auto grid max-w-5xl gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[380px] animate-pulse bg-[#0a0805]/80" />
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

  // Backend rejects subscribe without is_upgrade when user already has access.
  // Prefer /subscription/me, fall back to auth role so invoice creation still works.
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
        // Auto-retry as upgrade when backend says subscription already active.
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

  const handleSubscribeViaAdmin = (plan) => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: "/pricing" } });
      return;
    }
    if (isPremium && plan.name === currentPlanName) return;
    setAdminModalPlan(plan);
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
    if (!isPremium) return t("pricing.continue_payment");
    if (plan.name === currentPlanName) return t("pricing.current_plan");
    const currentPlan = plans.find((p) => p.name === currentPlanName);
    if (currentPlan && plan.sort_order > currentPlan.sort_order) return t("pricing.upgrade_pay");
    if (currentPlan && plan.sort_order < currentPlan.sort_order) return t("pricing.downgrade");
    return t("pricing.switch_pay");
  };

  const getCurrentPlanLabel = () =>
    getPlanLabel({ name: subStatus?.plan_name, label: subStatus?.plan_label }) || t("pricing.premium");

  const getFeatures = (plan) => [
    t("pricing.feat_signals"),
    t("pricing.feat_autotrade"),
    t("pricing.feat_analytics"),
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
  ];

  // Dynamic inclusion matrix — values drive the interactive “What’s included” (no wide table).
  const compareMatrix = useMemo(
    () => [
      { id: "signals", label: t("pricing.compare_signals"), free: false, monthly: true, yearly: true, lifetime: true },
      { id: "autotrade", label: t("pricing.compare_autotrade"), free: false, monthly: true, yearly: true, lifetime: true },
      { id: "analytics", label: t("pricing.compare_analytics"), free: "partial", monthly: true, yearly: true, lifetime: true },
      { id: "onchain", label: t("pricing.compare_onchain"), free: false, monthly: true, yearly: true, lifetime: true },
      { id: "ai", label: t("pricing.compare_ai"), free: false, monthly: true, yearly: true, lifetime: true },
      { id: "performance", label: t("pricing.compare_performance"), free: "partial", monthly: true, yearly: true, lifetime: true },
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

  /* Shared card surface — soft, blends with terminal (no heavy fill contrast) */
  const cardBase =
    "relative flex flex-col px-6 py-8 sm:px-7 sm:py-9 bg-transparent";

  return (
    <div className="relative min-h-screen">
      <Seo
        title="Pricing & Plans — LuxQuant Terminal"
        description="LuxQuant Terminal plans. Free to start; paid access unlocks signals, AutoTrade, on-chain intelligence, and research."
        path="/pricing"
        keywords="luxquant pricing, crypto signals subscription, quant terminal plans"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://luxquant.tw/" },
              { "@type": "ListItem", position: 2, name: "Pricing", item: "https://luxquant.tw/pricing" },
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

      {/* No local grid / second background — inherits global luxury-bg like other pages */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-28 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
        {/* Hero — typography first */}
        <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-text-primary/35">
            {t("pricing.hero_eyebrow")}
          </p>
          <h1
            className="text-[2rem] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary sm:text-[2.75rem] lg:text-[3.15rem]"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {t("pricing.hero_title_line1")}
            <br />
            <span className="text-text-primary/55">{t("pricing.hero_title_line2")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-text-primary/45 sm:text-base">
            {isPremium
              ? `${t("pricing.subscribing_to")} ${getCurrentPlanLabel()}${
                  subStatus?.days_remaining != null
                    ? ` · ${subStatus.days_remaining} ${t("pricing.days_remaining")}`
                    : ` · ${t("pricing.lifetime_label")}`
                }`
              : t("pricing.hero_subtitle")}
          </p>
        </header>

        {loading ? (
          <SkeletonCards />
        ) : loadError ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-sm text-text-primary/50">{t("pricing.load_error")}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-5 text-sm text-gold-primary/90 underline-offset-4 hover:underline"
            >
              {t("pricing.retry")}
            </button>
          </div>
        ) : (
          <>
            {/* Plans — one continuous panel (Anthropic / OpenAI style), not floating boxes */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015] backdrop-blur-[2px]">
              <div className="grid divide-y divide-white/[0.06] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
                {/* Free */}
                <article className={cardBase}>
                  <div className="mb-8">
                    <h2 className="text-[15px] font-medium text-text-primary/90">{t("pricing.free_name")}</h2>
                    <p className="mt-1 text-[13px] text-text-primary/35">{t("pricing.free_desc")}</p>
                  </div>
                  <div className="mb-8">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-sm text-text-primary/30">$</span>
                      <span
                        className="text-[2.75rem] font-semibold tracking-tight text-text-primary tabular-nums leading-none"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {t("pricing.free_price")}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-text-primary/30">{t("pricing.free_forever")}</p>
                  </div>
                  <ul className="mb-10 flex-1 space-y-3">
                    {freeFeatures.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[13px] leading-snug text-text-primary/45">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" tone="rgba(255,255,255,0.25)" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate(isAuthenticated ? "/" : "/login")}
                    className="mt-auto w-full rounded-lg border border-white/[0.1] py-2.5 text-[13px] font-medium text-text-primary/70 transition hover:border-white/20 hover:text-text-primary"
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
                        recommended ? "bg-white/[0.025] ring-1 ring-inset ring-gold-primary/25" : ""
                      } ${current ? "bg-emerald-500/[0.03]" : ""}`}
                    >
                      <div className="mb-8">
                        <div className="flex items-baseline justify-between gap-2">
                          <h2 className="text-[15px] font-medium text-text-primary/90">{getPlanLabel(plan)}</h2>
                          {recommended && !current && (
                            <span className="text-[11px] font-medium text-gold-primary/80">
                              {t("pricing.recommended")}
                            </span>
                          )}
                          {current && (
                            <span className="text-[11px] font-medium text-emerald-400/90">
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
                            className="text-[2.75rem] font-semibold tracking-tight text-text-primary tabular-nums leading-none"
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
                            <span className="text-text-primary/40"> · {t("pricing.yearly_save")}</span>
                          ) : null}
                        </p>
                      </div>

                      <ul className="mb-10 flex-1 space-y-3">
                        {features.map((f) => (
                          <li key={f} className="flex gap-2.5 text-[13px] leading-snug text-text-primary/55">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto space-y-2">
                        <button
                          type="button"
                          onClick={() => handleSubscribe(plan)}
                          disabled={creating || current}
                          className={`w-full rounded-lg py-2.5 text-[13px] font-medium transition disabled:cursor-default active:scale-[0.99] ${
                            current
                              ? "border border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-400/90"
                              : recommended
                                ? "bg-white text-[#0a0506] hover:bg-white/90"
                                : "border border-white/[0.12] text-text-primary/85 hover:border-white/25 hover:bg-white/[0.03]"
                          }`}
                        >
                          {creating && selectedPlan === plan.id
                            ? t("pricing.processing")
                            : getButtonLabel(plan)}
                        </button>

                        {!current && (
                          <button
                            type="button"
                            onClick={() => handleSubscribeViaAdmin(plan)}
                            className="flex w-full items-center justify-center gap-1.5 py-2 text-[12px] text-text-primary/35 transition hover:text-text-primary/60"
                          >
                            <TelegramIcon className="h-3 w-3 opacity-70" />
                            {t("pricing.subscribe_via_admin")}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Payment — quiet footer line, not a card box */}
            <p className="mx-auto mt-10 max-w-xl text-center text-[13px] leading-relaxed text-text-primary/30">
              {t("pricing.payment_desc")}{" "}
              <span className="text-text-primary/40">
                {t("pricing.usdt_bep20")} · {t("pricing.auto_verify")} · {t("pricing.instant_act")}
              </span>
            </p>

            {/* What’s included — dynamic plan tabs, no horizontal scroll */}
            <section className="mx-auto mt-20 max-w-lg sm:mt-24">
              <h2
                className="mb-2 text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.compare_title")}
              </h2>
              <p className="mb-8 text-center text-[14px] text-text-primary/35">{t("pricing.compare_subtitle")}</p>

              {/* Segmented control — wraps on narrow screens, no swipe table */}
              <div
                className="mb-6 grid grid-cols-4 gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
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
                          ? "bg-white text-[#0a0506] shadow-sm"
                          : "text-text-primary/45 hover:text-text-primary/75"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] px-1">
                {compareMatrix.map((row) => {
                  const raw = row[includeTab];
                  const v = formatIncludeValue(raw);
                  return (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
                    >
                      <span className="text-[13px] text-text-primary/60 sm:text-[14px]">{row.label}</span>
                      <span className="shrink-0 text-right">
                        {v.kind === "yes" && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-gold-primary/90">
                            <Check className="h-3.5 w-3.5" />
                            <span className="sr-only">Included</span>
                          </span>
                        )}
                        {v.kind === "no" && (
                          <span className="text-[13px] text-text-primary/20">—</span>
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

              <p className="mt-4 text-center text-[12px] leading-relaxed text-text-primary/25">
                {t("pricing.compare_note")}
              </p>
            </section>

            {/* FAQ */}
            <section className="mx-auto mt-20 max-w-xl sm:mt-24">
              <h2
                className="mb-8 text-center text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.faq_title")}
              </h2>
              <div className="border-t border-white/[0.06]">
                {faqs.map((f) => (
                  <FaqItem key={f.q} q={f.q} a={f.a} />
                ))}
              </div>
            </section>

            <div className="mt-16 text-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-[13px] text-text-primary/30 transition hover:text-text-primary/60"
              >
                {t("pricing.cta_secondary")}
              </button>
            </div>
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
