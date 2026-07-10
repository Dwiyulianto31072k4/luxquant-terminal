// src/components/subscription/PremiumModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell <Modal>. Plan cards & logika dipertahankan.
// CTA distandarisasi: plan unggulan = GoldButton solid, lainnya =
// GhostButton gold. Ikon plan SVG dibungkus badge solid gold.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import Modal from "../ui/Modal";
import { GoldButton, GhostButton } from "../autotrade/AutoTradeUI";

const PremiumModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [creating, setCreating] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) loadPlans();
  }, [isOpen]);

  const loadPlans = async () => {
    try {
      const data = await subscriptionApi.getPlans();
      setPlans(data);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoading(false);
    }
  };

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
      const msg = err.response?.data?.detail || "Gagal membuat invoice";
      alert(msg);
    } finally {
      setCreating(false);
      setSelectedPlan(null);
    }
  };

  const getPlanHighlight = (name) => name === "yearly";
  const getSavingBadge = (plan) => {
    if (plan.name === "yearly") return t("pricing.yearly_save");
    if (plan.name === "lifetime") return t("pricing.best_value");
    return null;
  };
  const getPlanLabel = (plan) => {
    switch (plan.name) {
      case "monthly": return t("pricing.monthly");
      case "yearly": return t("pricing.yearly");
      case "lifetime": return t("pricing.lifetime");
      default: return plan.label;
    }
  };
  const getPlanDesc = (plan) => {
    switch (plan.name) {
      case "monthly": return t("pricing.monthly_desc");
      case "yearly": return t("pricing.yearly_desc");
      case "lifetime": return t("pricing.lifetime_desc");
      default: return plan.description;
    }
  };
  const getPriceSuffix = (plan) => {
    if (plan.name === "yearly") return t("pricing.per_year");
    if (plan.name === "monthly") return t("pricing.per_month");
    return t("pricing.one_time");
  };
  const getFeatures = (plan) => {
    const base = [t("pricing.feat_signals"), t("pricing.feat_analytics"), t("pricing.feat_market")];
    if (plan.name !== "monthly") base.push(t("pricing.feat_support"));
    if (plan.name === "lifetime") base.push(t("pricing.feat_lifetime"));
    return base;
  };

  const PlanIcon = ({ name }) => {
    const color = "#d4a853";
    if (name === "monthly") {
      return (
        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="5" width="22" height="18" rx="3" stroke={color} strokeWidth="1.5" />
          <path d="M3 10h22" stroke={color} strokeWidth="1.5" />
          <circle cx="14" cy="17" r="2" fill={color} opacity="0.4" />
        </svg>
      );
    }
    if (name === "yearly") {
      return (
        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
          <path d="M14 3L17.5 10.5L25 11.5L19.5 17L21 24.5L14 20.5L7 24.5L8.5 17L3 11.5L10.5 10.5L14 3Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    if (name === "lifetime") {
      return (
        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
          <path d="M14 4C8.477 4 4 8.477 4 14s4.477 10 10 10 10-4.477 10-10S19.523 4 14 4z" stroke={color} strokeWidth="1.5" />
          <path d="M14 8v6l4 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    return null;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-tight text-white sm:text-3xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("pricing.upgrade_to")} <span className="text-gold-primary">{t("pricing.premium")}</span>
        </h2>
        <p className="mx-auto max-w-md text-xs text-text-muted">{t("pricing.modal_subtitle")}</p>
      </div>

      {/* Plans */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-gold-primary" />
        </div>
      ) : (
        <div className="mb-6 grid gap-3 sm:gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isHighlighted = getPlanHighlight(plan.name);
            const badge = getSavingBadge(plan);
            const features = getFeatures(plan);
            const cta = creating && selectedPlan === plan.id ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                {t("pricing.processing")}
              </span>
            ) : t("pricing.select_plan");

            return (
              <div
                key={plan.id}
                onClick={() => !creating && handleSubscribe(plan)}
                className="group relative cursor-pointer rounded-xl border p-5 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: isHighlighted ? "linear-gradient(168deg, rgba(212,168,83,0.16) 0%, #0c0708 50%)" : "#0c0708",
                  borderColor: isHighlighted ? "rgba(212,168,83,0.3)" : "rgba(255,255,255,0.06)",
                }}
              >
                {badge && (
                  <div className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
                    <div className="rounded-full px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "linear-gradient(135deg, #d4a853, #a07c2e)", color: "#0a0506" }}>
                      {badge}
                    </div>
                  </div>
                )}

                <div className="mb-4 mt-1 flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gold-primary/10 ring-1 ring-gold-primary/25">
                    <PlanIcon name={plan.name} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{getPlanLabel(plan)}</h3>
                    <p className="text-[10px] text-text-muted">{getPlanDesc(plan)}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs text-text-muted">$</span>
                    <span className="text-3xl font-bold tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{plan.price_usdt}</span>
                    <span className="ml-0.5 text-[10px] text-text-muted">USDT {getPriceSuffix(plan)}</span>
                  </div>
                </div>

                <div className="mb-4 h-px" style={{ background: "linear-gradient(90deg, rgba(212,168,83,0.08), transparent)" }} />

                <ul className="mb-5 space-y-2.5">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-xs text-text-secondary">
                      <svg className="h-3 w-3 flex-shrink-0 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                {isHighlighted ? (
                  <GoldButton disabled={creating} className="w-full">{cta}</GoldButton>
                ) : (
                  <GhostButton tone="gold" disabled={creating} className="w-full">{cta}</GhostButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment info */}
      <div className="border-t border-gold-primary/[0.06] pt-5 text-center">
        <div className="flex items-center justify-center gap-6 text-[10px] text-text-muted">
          {[t("pricing.usdt_bep20"), t("pricing.auto_verify"), t("pricing.instant_act")].map((label, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-gold-primary" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default PremiumModal;
