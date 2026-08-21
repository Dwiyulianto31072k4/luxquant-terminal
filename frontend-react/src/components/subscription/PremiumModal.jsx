// src/components/subscription/PremiumModal.jsx
// Upsell — same product, three billing cycles. Assisted pay is one quiet link.

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import Modal from "../ui/Modal";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";

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

const PremiumModal = ({ isOpen, onClose, calledPair = null }) => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const [adminPlan, setAdminPlan] = useState(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) loadPlans();
  }, [isOpen]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await subscriptionApi.getPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const sortedPlans = useMemo(() => {
    const order = { monthly: 1, yearly: 2, lifetime: 3 };
    return [...plans].sort(
      (a, b) => (order[a.name] ?? a.sort_order ?? 99) - (order[b.name] ?? b.sort_order ?? 99)
    );
  }, [plans]);

  const handleSubscribe = async (plan) => {
    if (!isAuthenticated) {
      onClose();
      navigate("/login");
      return;
    }
    setSelectedPlan(plan.id);
    setCreating(true);
    try {
      const invoice = await subscriptionApi.createInvoice(plan.id);
      onClose();
      navigate("/payment", { state: { invoice, plan } });
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create invoice");
    } finally {
      setCreating(false);
      setSelectedPlan(null);
    }
  };

  const handleAssisted = () => {
    if (!isAuthenticated) {
      onClose();
      navigate("/login");
      return;
    }
    setAdminPlan(sortedPlans.find((p) => p.name === "yearly") || sortedPlans[0]);
  };

  const isRecommended = (name) => name === "yearly";
  const getPlanLabel = (plan) =>
    ({ monthly: t("pricing.monthly"), yearly: t("pricing.yearly"), lifetime: t("pricing.lifetime") })[
      plan.name
    ] || plan.label;
  const getPlanDesc = (plan) =>
    ({
      monthly: t("pricing.monthly_desc"),
      yearly: t("pricing.yearly_desc"),
      lifetime: t("pricing.lifetime_desc"),
    })[plan.name] || plan.description;
  const getPriceSuffix = (plan) =>
    plan.name === "yearly"
      ? t("pricing.per_year")
      : plan.name === "monthly"
        ? t("pricing.per_month")
        : t("pricing.one_time");
  const getCta = (plan) => {
    if (plan.name === "monthly") return t("pricing.get_monthly");
    if (plan.name === "yearly") return t("pricing.get_yearly");
    if (plan.name === "lifetime") return t("pricing.get_lifetime");
    return t("pricing.select_plan");
  };
  const getFeatures = () => [
    t("pricing.feat_signals"),
    t("pricing.feat_market"),
    t("pricing.feat_autotrade"),
    t("pricing.feat_onchain"),
    t("pricing.feat_ai"),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="mb-7 text-center">
        <h2
          className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.75rem]"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          {t("pricing.upgrade_to")} {t("pricing.premium")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-text-primary/45">
          {t("pricing.modal_subtitle")}
        </p>
        {calledPair && (
          <div className="mx-auto mt-4 inline-flex max-w-md items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3.5 py-2">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <span className="text-left text-xs leading-snug text-text-secondary">
              {t("pricing.called_context", { pair: calledPair })}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-ink/[0.015]">
          <div className="grid divide-y divide-ink/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {sortedPlans.map((plan) => {
              const recommended = isRecommended(plan.name);
              const busy = creating && selectedPlan === plan.id;
              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col px-5 py-7 sm:px-6 ${
                    recommended ? "bg-accent/[0.04] ring-1 ring-inset ring-accent/25" : ""
                  }`}
                >
                  <div className="mb-6">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[15px] font-medium text-text-primary/90">
                        {getPlanLabel(plan)}
                      </h3>
                      {recommended && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                          {t("pricing.recommended")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-text-primary/35">{getPlanDesc(plan)}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-sm text-text-primary/30">$</span>
                      <span
                        className="text-[2.4rem] font-semibold leading-none tracking-tight text-text-primary tabular-nums"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {plan.price_usdt}
                      </span>
                      <span className="ml-1 text-[11px] text-text-primary/30">USDT</span>
                    </div>
                    <p className="mt-2 text-[12px] text-text-primary/30">
                      {getPriceSuffix(plan)}
                      {plan.name === "yearly" ? (
                        <span className="text-text-primary/45"> · {t("pricing.yearly_save")}</span>
                      ) : null}
                    </p>
                  </div>

                  <ul className="mb-7 flex-1 space-y-2.5">
                    {getFeatures().map((f) => (
                      <li
                        key={f}
                        className="flex gap-2.5 text-[12.5px] leading-snug text-text-primary/55"
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={creating}
                    className={`mt-auto w-full rounded-lg py-2.5 text-[13px] font-semibold transition active:scale-[0.99] disabled:cursor-default ${
                      recommended
                        ? "bg-accent text-accent-fg hover:brightness-105"
                        : "border border-ink/[0.12] text-text-primary/85 hover:border-ink/25 hover:bg-ink/[0.03]"
                    }`}
                  >
                    {busy ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                        {t("pricing.processing")}
                      </span>
                    ) : (
                      getCta(plan)
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-[11.5px] text-text-primary/35">
        {[t("pricing.usdt_bep20"), t("pricing.auto_verify"), t("pricing.trust_cancel")].join(" · ")}
      </p>
      <p className="mt-2 text-center">
        <button
          type="button"
          onClick={handleAssisted}
          disabled={!sortedPlans.length}
          className="text-[12px] text-text-primary/35 transition hover:text-text-primary/60 disabled:opacity-40"
        >
          {t("pricing.pay_other_title")}
        </button>
      </p>

      <SubscribeViaAdminModal
        isOpen={!!adminPlan}
        onClose={() => setAdminPlan(null)}
        plan={adminPlan}
      />
    </Modal>
  );
};

export default PremiumModal;
