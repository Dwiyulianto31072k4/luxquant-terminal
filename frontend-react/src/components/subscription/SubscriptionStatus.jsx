// src/components/subscription/SubscriptionStatus.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import subscriptionApi from "../../services/subscriptionApi";

const SubscriptionStatus = ({ compact = false }) => {
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

  // Compact badge version (for header/menu)
  if (compact) {
    if (sub?.tier === "admin") {
      return (
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold"
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
          className="px-2 py-0.5 rounded text-[10px] font-bold"
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
        onClick={() => navigate("/pricing")}
        className="px-2 py-0.5 rounded text-[10px] font-bold transition-colors"
        style={{
          background: "rgba(100, 100, 100, 0.15)",
          color: "rgb(var(--fg-muted))",
          border: "1px solid rgba(100, 100, 100, 0.2)",
        }}
      >
        FREE
      </button>
    );
  }

  // Full card version (for profile/settings)
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(20, 10, 12, 0.6)", border: "1px solid rgb(var(--line) / 0.15)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-text-primary">Subscription</span>
        {sub?.tier === "admin" ? (
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{ background: "rgba(239, 68, 68, 0.15)", color: "rgb(var(--neg-text))" }}
          >
            ADMIN
          </span>
        ) : sub?.is_subscribed ? (
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{ background: "rgb(var(--accent) / 0.15)", color: "rgb(var(--accent-text))" }}
          >
            PREMIUM
          </span>
        ) : (
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{ background: "rgba(100, 100, 100, 0.15)", color: "rgb(var(--fg-muted))" }}
          >
            FREE
          </span>
        )}
      </div>

      {sub?.is_subscribed && sub?.subscription ? (
        <div className="space-y-1.5">
          <p className="text-xs" style={{ color: "#8a7b6b" }}>
            Paket: <span className="text-text-primary">{sub.subscription.plan_label}</span>
          </p>
          {sub.days_remaining !== null && sub.days_remaining !== undefined ? (
            <p className="text-xs" style={{ color: "#8a7b6b" }}>
              Sisa:{" "}
              <span className={sub.days_remaining <= 7 ? "text-accent" : "text-text-primary"}>
                {sub.days_remaining} hari
              </span>
            </p>
          ) : (
            <p className="text-xs" style={{ color: "rgb(var(--pos-text))" }}>
              Lifetime ∞
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: "rgb(var(--fg-muted))" }}>
            Upgrade untuk akses semua fitur premium
          </p>
          <button
            onClick={() => navigate("/pricing")}
            className="w-full py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(to right, rgb(var(--accent)), rgb(var(--accent)))",
              color: "rgb(var(--surface))",
            }}
          >
            Upgrade Sekarang
          </button>
        </div>
      )}
    </div>
  );
};

export default SubscriptionStatus;
