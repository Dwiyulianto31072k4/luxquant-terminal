// src/components/subscription/SubscriptionStatus.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import subscriptionApi from "../../services/subscriptionApi";

const SubscriptionStatus = ({ compact = false }) => {
  const { t } = useTranslation();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = await subscriptionApi.getMySubscription();
      setSub(data);
    } catch (err) {
      console.error("Failed to load subscription:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  if (compact) {
    if (sub?.tier === "admin") {
      return (
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            color: "rgb(var(--neg-text))",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          ADMIN
        </span>
      );
    }

    if (sub?.is_subscribed) {
      return (
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "rgb(var(--accent) / 0.15)",
            color: "rgb(var(--accent-text))",
            border: "1px solid rgb(var(--line) / 0.3)",
          }}
        >
          PREMIUM
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => navigate("/pricing")}
        className="rounded px-2 py-0.5 text-[10px] font-bold transition-colors"
        style={{
          background: "rgba(100, 100, 100, 0.15)",
          color: "rgb(var(--fg-muted))",
          border: "1px solid rgba(100, 100, 100, 0.2)",
        }}
      >
        {t("pricing.free_name")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{t("pricing.status_title")}</span>
        {sub?.tier === "admin" ? (
          <span
            className="rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "rgba(239, 68, 68, 0.15)", color: "rgb(var(--neg-text))" }}
          >
            ADMIN
          </span>
        ) : sub?.is_subscribed ? (
          <span
            className="rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "rgb(var(--accent) / 0.15)", color: "rgb(var(--accent-text))" }}
          >
            {t("pricing.premium")}
          </span>
        ) : (
          <span className="rounded bg-ink/[0.08] px-2 py-0.5 text-xs font-bold text-text-muted">
            {t("pricing.free_name")}
          </span>
        )}
      </div>

      {sub?.is_subscribed && sub?.subscription ? (
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">
            {t("pricing.status_plan")}:{" "}
            <span className="text-text-primary">{sub.subscription.plan_label}</span>
          </p>
          {sub.days_remaining !== null && sub.days_remaining !== undefined ? (
            <p className="text-xs text-text-muted">
              <span className={sub.days_remaining <= 7 ? "text-accent" : "text-text-primary"}>
                {t("pricing.status_remaining", { days: sub.days_remaining })}
              </span>
            </p>
          ) : (
            <p className="text-xs" style={{ color: "rgb(var(--pos-text))" }}>
              {t("pricing.status_lifetime")}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs text-text-muted">{t("pricing.status_upgrade_body")}</p>
          <button
            type="button"
            onClick={() => navigate("/pricing")}
            className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-accent-fg transition hover:brightness-105"
          >
            {t("pricing.status_upgrade_cta")}
          </button>
        </div>
      )}
    </div>
  );
};

export default SubscriptionStatus;
