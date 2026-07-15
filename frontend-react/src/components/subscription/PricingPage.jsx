// src/components/subscription/PricingPage.jsx
// Full redesign — Linear / Vercel / Stripe–inspired pricing UX.
// Keeps all subscription API flows (invoice, upgrade, admin Telegram).

import Seo from "../Seo";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";

/* ─── tiny icons ─── */
const Check = ({ className = "h-3.5 w-3.5", tone = "#d4a853" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const Shield = () => (
  <svg className="h-4 w-4 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
  </svg>
);

const TelegramIcon = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-[14px] font-medium text-white/90 sm:text-[15px]">{q}</span>
        <Chevron open={open} />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-250 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="pb-4 text-[13px] leading-relaxed text-text-muted sm:text-sm">{a}</p>
        </div>
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[420px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
        />
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
  const { isAuthenticated } = useAuth();
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

  const isPremium = subStatus?.is_subscribed && subStatus?.tier !== "admin";
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
    if (isPremium && plan.name === currentPlanName) {
      alert(t("pricing.youre_subscribed"));
      return;
    }
    setSelectedPlan(plan.id);
    setCreating(true);
    try {
      const invoice = await subscriptionApi.createInvoice(plan.id, isPremium);
      navigate("/payment", { state: { invoice, plan } });
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to create invoice";
      alert(msg);
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
    if (isPremium && plan.name === currentPlanName) {
      alert(t("pricing.youre_subscribed"));
      return;
    }
    setAdminModalPlan(plan);
  };

  const getPlanHighlight = (name) => name === "yearly";
  const getSavingBadge = (plan) => {
    if (plan.name === "yearly") return t("pricing.yearly_save");
    if (plan.name === "lifetime") return t("pricing.best_value");
    return null;
  };

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

  const isCurrentPlan = (plan) => isPremium && plan.name === currentPlanName;

  const getCurrentPlanLabel = () =>
    getPlanLabel({ name: subStatus?.plan_name, label: subStatus?.plan_label }) ||
    t("pricing.premium");

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

  const compareRows = [
    { label: t("pricing.compare_signals"), free: false, monthly: true, yearly: true, lifetime: true },
    { label: t("pricing.compare_autotrade"), free: false, monthly: true, yearly: true, lifetime: true },
    { label: t("pricing.compare_analytics"), free: "partial", monthly: true, yearly: true, lifetime: true },
    { label: t("pricing.compare_onchain"), free: false, monthly: true, yearly: true, lifetime: true },
    { label: t("pricing.compare_ai"), free: false, monthly: true, yearly: true, lifetime: true },
    { label: t("pricing.compare_performance"), free: "partial", monthly: true, yearly: true, lifetime: true },
    {
      label: t("pricing.compare_support"),
      free: "—",
      monthly: t("pricing.compare_support_std"),
      yearly: t("pricing.compare_support_prio"),
      lifetime: t("pricing.compare_support_vip"),
    },
    {
      label: t("pricing.compare_updates"),
      free: "—",
      monthly: t("pricing.compare_updates_sub"),
      yearly: t("pricing.compare_updates_sub"),
      lifetime: t("pricing.compare_updates_life"),
    },
  ];

  const cell = (v) => {
    if (v === true) return <Check tone="#d4a853" className="mx-auto h-4 w-4" />;
    if (v === false) return <span className="text-white/20">—</span>;
    if (v === "partial") return <span className="text-[11px] text-white/40">Limited</span>;
    return <span className="text-[11px] text-white/55">{v}</span>;
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Seo
        title="Pricing & Plans — LuxQuant Terminal"
        description="Compare LuxQuant Terminal plans. Free tier to start; premium unlocks algorithmic signals, AutoTrade, on-chain intelligence, and AI research."
        path="/pricing"
        keywords="luxquant pricing, crypto signals subscription, quant terminal plans, autotrade pricing"
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
            description:
              "Quantitative crypto trading terminal with algorithmic signals, AutoTrade, on-chain intelligence, and AI research.",
            brand: { "@type": "Brand", name: "LuxQuant" },
            image: "https://luxquant.tw/logo-512.png",
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

      <style>{`
        @keyframes lqPriceIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lqShimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .lq-price-in { animation: lqPriceIn .5s cubic-bezier(.16,1,.3,1) both; }
        .lq-price-in-1 { animation-delay: .04s; }
        .lq-price-in-2 { animation-delay: .1s; }
        .lq-price-in-3 { animation-delay: .16s; }
        .lq-price-in-4 { animation-delay: .22s; }
        .lq-admin-cta {
          background: linear-gradient(110deg, rgba(212,168,83,.06) 0%, rgba(212,168,83,.16) 50%, rgba(212,168,83,.06) 100%);
          background-size: 200% 100%;
          animation: lqShimmer 3.2s linear infinite;
        }
        .lq-grid-bg {
          background-image:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,168,83,0.12), transparent 55%),
            radial-gradient(ellipse 40% 30% at 100% 20%, rgba(127,29,29,0.12), transparent 50%),
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: auto, auto, 48px 48px, 48px 48px;
        }
      `}</style>

      {/* Ambient canvas */}
      <div className="pointer-events-none absolute inset-0 lq-grid-bg" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16 lg:pt-20">
        {/* ── Hero ── */}
        <header className="lq-price-in mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-primary/25 bg-gold-primary/[0.07] px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/90">
              {t("pricing.hero_eyebrow")}
            </span>
          </div>

          <h1
            className="text-[2.15rem] font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {t("pricing.hero_title_line1")}
            <br />
            <span className="bg-gradient-to-r from-[#f0d78c] via-[#d4a853] to-[#a07c2e] bg-clip-text text-transparent">
              {t("pricing.hero_title_line2")}
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-text-muted sm:mt-5 sm:text-base">
            {isPremium
              ? `${t("pricing.subscribing_to")} ${getCurrentPlanLabel()}${
                  subStatus?.days_remaining != null
                    ? ` — ${subStatus.days_remaining} ${t("pricing.days_remaining")}`
                    : ` — ${t("pricing.lifetime_label")}`
                }`
              : t("pricing.hero_subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              t("pricing.hero_chip_signals"),
              t("pricing.hero_chip_autotrade"),
              t("pricing.hero_chip_onchain"),
              t("pricing.hero_chip_ai"),
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] text-white/55"
              >
                {chip}
              </span>
            ))}
          </div>

          <p className="mt-5 text-[12px] text-white/30 sm:text-[13px]">{t("pricing.social_proof")}</p>
        </header>

        {/* ── Plans ── */}
        {loading ? (
          <SkeletonCards />
        ) : loadError ? (
          <div className="mx-auto max-w-md rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-8 text-center">
            <p className="text-sm text-red-300/90">{t("pricing.load_error")}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.04]"
            >
              {t("pricing.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
              {/* Free / Starter */}
              <article className="lq-price-in lq-price-in-1 group relative flex flex-col rounded-2xl border border-white/[0.07] bg-[#0c0908]/90 p-5 sm:p-6">
                <div className="mb-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                    {t("pricing.free_name")}
                  </p>
                  <h2 className="mt-1.5 text-lg font-semibold text-white">{t("pricing.free_name")}</h2>
                  <p className="mt-1 text-xs text-text-muted">{t("pricing.free_desc")}</p>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-white/35">$</span>
                    <span
                      className="text-4xl font-semibold tracking-tight text-white"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {t("pricing.free_price")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/30">{t("pricing.free_forever")}</p>
                </div>
                <ul className="mb-8 flex-1 space-y-2.5">
                  {freeFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/55">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.04]">
                        <Check tone="rgba(255,255,255,0.35)" className="h-2.5 w-2.5" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate(isAuthenticated ? "/" : "/login")}
                  className="mt-auto w-full rounded-xl border border-white/[0.1] bg-white/[0.03] py-3 text-sm font-medium text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  {t("pricing.free_cta")}
                </button>
              </article>

              {/* Paid plans */}
              {sortedPlans.map((plan, idx) => {
                const highlighted = getPlanHighlight(plan.name);
                const badge = getSavingBadge(plan);
                const current = isCurrentPlan(plan);
                const features = getFeatures(plan);
                const equiv = getMonthlyEquiv(plan);
                const delayClass = `lq-price-in-${Math.min(idx + 2, 4)}`;

                return (
                  <article
                    key={plan.id}
                    className={`lq-price-in ${delayClass} group relative flex flex-col rounded-2xl p-5 sm:p-6 ${
                      highlighted ? "lg:-mt-2 lg:mb-2 lg:scale-[1.02]" : ""
                    }`}
                    style={{
                      background: current
                        ? "linear-gradient(165deg, rgba(34,197,94,0.12) 0%, #0c0908 42%)"
                        : highlighted
                          ? "linear-gradient(165deg, rgba(212,168,83,0.14) 0%, #0c0908 48%)"
                          : "rgba(12,9,8,0.9)",
                      border: current
                        ? "1px solid rgba(34,197,94,0.35)"
                        : highlighted
                          ? "1px solid rgba(212,168,83,0.4)"
                          : "1px solid rgba(255,255,255,0.07)",
                      boxShadow: highlighted
                        ? "0 20px 50px -20px rgba(212,168,83,0.25), 0 0 0 1px rgba(212,168,83,0.06)"
                        : undefined,
                    }}
                  >
                    {/* top hairline */}
                    {(highlighted || current) && (
                      <div
                        className="pointer-events-none absolute inset-x-6 top-0 h-px"
                        style={{
                          background: current
                            ? "linear-gradient(90deg, transparent, rgba(34,197,94,0.6), transparent)"
                            : "linear-gradient(90deg, transparent, rgba(212,168,83,0.7), transparent)",
                        }}
                      />
                    )}

                    {/* badge */}
                    {(current || badge) && (
                      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                        <span
                          className="inline-flex whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                          style={
                            current
                              ? {
                                  background: "linear-gradient(135deg,#22c55e,#16a34a)",
                                  color: "#fff",
                                  boxShadow: "0 4px 14px rgba(34,197,94,0.35)",
                                }
                              : {
                                  background: "linear-gradient(135deg,#f0d78c,#d4a853,#a07c2e)",
                                  color: "#0a0506",
                                  boxShadow: "0 4px 14px rgba(212,168,83,0.35)",
                                }
                          }
                        >
                          {current ? t("pricing.current_plan") : badge || t("pricing.most_popular")}
                        </span>
                      </div>
                    )}

                    <div className="mb-5 pt-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary/70">
                        {getPlanLabel(plan)}
                      </p>
                      <h2 className="mt-1.5 text-lg font-semibold text-white">{getPlanLabel(plan)}</h2>
                      <p className="mt-1 text-xs text-text-muted">{getPlanDesc(plan)}</p>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-white/35">$</span>
                        <span
                          className="text-4xl font-semibold tracking-tight text-white tabular-nums"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {plan.price_usdt}
                        </span>
                        <span className="ml-0.5 text-xs text-white/35">USDT</span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/30">
                        {getPriceSuffix(plan)}
                        {equiv ? (
                          <span className="ml-1.5 text-gold-primary/70">
                            · {t("pricing.equiv_month", { price: equiv })}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <ul className="mb-6 flex-1 space-y-2.5">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/65">
                          <span
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                            style={{
                              background: current ? "rgba(34,197,94,0.12)" : "rgba(212,168,83,0.1)",
                            }}
                          >
                            <Check
                              tone={current ? "#22c55e" : "#d4a853"}
                              className="h-2.5 w-2.5"
                            />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto space-y-2.5">
                      <button
                        type="button"
                        onClick={() => handleSubscribe(plan)}
                        disabled={creating || current}
                        className="relative w-full overflow-hidden rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed active:scale-[0.99]"
                        style={
                          current
                            ? {
                                background: "rgba(34,197,94,0.08)",
                                color: "#22c55e",
                                border: "1px solid rgba(34,197,94,0.22)",
                              }
                            : highlighted
                              ? {
                                  background: "linear-gradient(135deg,#f0d78c,#d4a853,#a07c2e)",
                                  color: "#0a0506",
                                  boxShadow: "0 6px 24px rgba(212,168,83,0.28)",
                                }
                              : {
                                  background: "transparent",
                                  color: "#d4a853",
                                  border: "1px solid rgba(212,168,83,0.28)",
                                }
                        }
                      >
                        {creating && selectedPlan === plan.id
                          ? t("pricing.processing")
                          : getButtonLabel(plan)}
                      </button>

                      {!current ? (
                        <>
                          <div className="flex items-center gap-2 px-1">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">
                              {t("pricing.or")}
                            </span>
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSubscribeViaAdmin(plan)}
                            className="lq-admin-cta flex w-full items-center justify-center gap-2 rounded-xl border border-gold-primary/25 py-2.5 text-[12px] font-semibold text-[#e8c578] transition hover:border-gold-primary/40"
                          >
                            <TelegramIcon />
                            {t("pricing.subscribe_via_admin")}
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] py-2.5 text-[12px] font-medium text-emerald-400/90">
                          <Check tone="#22c55e" className="h-3.5 w-3.5" />
                          {t("pricing.youre_subscribed")}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Trust strip */}
            <div className="lq-price-in lq-price-in-4 mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
              {[
                { icon: <Shield />, label: t("pricing.auto_verify") },
                { icon: <span className="font-mono text-[10px] font-bold text-gold-primary">USDT</span>, label: t("pricing.usdt_bep20") },
                { icon: <Check className="h-4 w-4" tone="#d4a853" />, label: t("pricing.instant_act") },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  {item.icon}
                  <span className="text-[12px] text-white/55">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Payment blurb */}
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/[0.06] bg-[#0c0908]/80 px-6 py-6 text-center sm:px-8">
              <div className="mb-2 flex items-center justify-center gap-2">
                <Shield />
                <h3 className="text-sm font-semibold text-white">{t("pricing.payment_title")}</h3>
              </div>
              <p className="text-[12px] leading-relaxed text-text-muted sm:text-[13px]">
                {t("pricing.payment_desc")}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-white/30">
                <span>{t("pricing.trust_cancel")}</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/15 sm:inline-block" />
                <span>{t("pricing.trust_secure")}</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/15 sm:inline-block" />
                <span>{t("pricing.trust_support")}</span>
              </div>
            </div>

            {/* Comparison table — desktop-first */}
            <section className="mx-auto mt-16 max-w-5xl sm:mt-20">
              <div className="mb-8 text-center">
                <h2
                  className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {t("pricing.compare_title")}
                </h2>
                <p className="mt-2 text-sm text-text-muted">{t("pricing.compare_subtitle")}</p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0c0908]/90">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3.5 text-[11px] font-mono uppercase tracking-wider text-white/35 sm:px-5">
                        {t("pricing.compare_feature")}
                      </th>
                      <th className="px-3 py-3.5 text-center text-[11px] font-mono uppercase tracking-wider text-white/35">
                        {t("pricing.free_name")}
                      </th>
                      <th className="px-3 py-3.5 text-center text-[11px] font-mono uppercase tracking-wider text-white/35">
                        {t("pricing.monthly")}
                      </th>
                      <th className="px-3 py-3.5 text-center text-[11px] font-mono uppercase tracking-wider text-gold-primary/80">
                        {t("pricing.yearly")}
                      </th>
                      <th className="px-3 py-3.5 text-center text-[11px] font-mono uppercase tracking-wider text-white/35">
                        {t("pricing.lifetime")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.label} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-3 text-[13px] text-white/70 sm:px-5">{row.label}</td>
                        <td className="px-3 py-3 text-center">{cell(row.free)}</td>
                        <td className="px-3 py-3 text-center">{cell(row.monthly)}</td>
                        <td className="bg-gold-primary/[0.03] px-3 py-3 text-center">{cell(row.yearly)}</td>
                        <td className="px-3 py-3 text-center">{cell(row.lifetime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto mt-16 max-w-2xl sm:mt-20">
              <div className="mb-6 text-center sm:mb-8">
                <h2
                  className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {t("pricing.faq_title")}
                </h2>
                <p className="mt-2 text-sm text-text-muted">{t("pricing.faq_subtitle")}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-[#0c0908]/90 px-5 sm:px-6">
                {faqs.map((f) => (
                  <FaqItem key={f.q} q={f.q} a={f.a} />
                ))}
              </div>
            </section>

            {/* Final CTA */}
            <section className="mx-auto mt-16 max-w-xl text-center sm:mt-20">
              <h2
                className="text-xl font-semibold text-white sm:text-2xl"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {t("pricing.cta_title")}
              </h2>
              <p className="mt-2 text-sm text-text-muted">{t("pricing.cta_subtitle")}</p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-6 text-[12px] text-white/35 transition hover:text-white/70"
              >
                {t("pricing.cta_secondary")}
              </button>
            </section>
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
