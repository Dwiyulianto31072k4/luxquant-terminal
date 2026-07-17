// src/components/NotificationSettings.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Notification Settings (Layer 2)
// Toggle in-app / Telegram per tipe notif. Telegram-gated: butuh link TG.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { notificationApi } from "../services/notificationApi";

const GROUP_ORDER = ["autotrade", "signals", "market", "account"];
const GROUP_LABEL = {
  autotrade: "AutoTrade",
  signals: "Signals",
  market: "Market",
  account: "Account",
};


// ── Section header (match NotificationsPage style) ──
const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3">
    <span className="font-mono uppercase tracking-[0.25em] text-gold-primary/80 text-[10px]">
      {label}
    </span>
  </div>
);


// ── Toggle switch ──
const Toggle = ({ on, locked, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-all ${
      on
        ? "bg-gold-primary/80 border-gold-primary"
        : "bg-ink/[0.04] border-ink/[0.1]"
    } ${locked ? "opacity-50 cursor-pointer" : "cursor-pointer hover:border-line/40"}`}
    title={locked ? "Link Telegram first" : undefined}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
        on ? "translate-x-4" : "translate-x-0.5"
      }`}
    />
    {locked && (
      <svg className="absolute -right-3.5 w-2.5 h-2.5 text-text-muted/60" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
      </svg>
    )}
  </button>
);


const NotificationSettings = ({ t, navigate }) => {
  const [items, setItems] = useState([]);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.getPreferences();
      setItems(data.items || []);
      setTelegramLinked(!!data.telegram_linked);
    } catch (err) {
      console.error("Failed to fetch preferences:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const handleToggle = async (item, channel) => {
    // Telegram-gating: belum link -> arahkan ke profile, jangan lanjut
    if (channel === "telegram" && !telegramLinked) {
      navigate("/profile");
      return;
    }

    const next = {
      in_app: channel === "in_app" ? !item.in_app : item.in_app,
      telegram: channel === "telegram" ? !item.telegram : item.telegram,
    };

    // Optimistic update
    const prev = items;
    setItems((arr) =>
      arr.map((x) => (x.type === item.type ? { ...x, ...next } : x))
    );
    setSavingType(item.type);

    try {
      await notificationApi.updatePreference(item.type, next.in_app, next.telegram);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "LINK_TELEGRAM_REQUIRED") {
        navigate("/profile");
      } else {
        console.error("Failed to update preference:", err);
      }
      setItems(prev); // rollback
    } finally {
      setSavingType(null);
    }
  };

  // Group items
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABEL[g] || g,
    rows: items.filter((i) => i.group === g),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Telegram link banner */}
      {!telegramLinked ? (
        <div className="relative overflow-hidden rounded-md border border-line/20 bg-surface-raised p-4">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary mb-1">
                Connect Telegram to receive alerts there
              </p>
              <p className="text-xs text-text-muted leading-relaxed">
                Link your Telegram in profile, then start{" "}
                <span className="font-mono text-gold-primary/80">@LuxQuantAlert_Bot</span>{" "}
                so the bot can message you. Until then, Telegram delivery stays locked.
              </p>
            </div>
            <button
              onClick={() => navigate("/profile")}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-line/30 text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary hover:bg-gold-primary/[0.08] hover:border-line/50 transition-all"
            >
              Link Telegram
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-ink/[0.06] bg-ink/[0.01] p-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Telegram linked. Make sure you've started{" "}
            <span className="font-mono text-gold-primary/80">@LuxQuantAlert_Bot</span>{" "}
            in Telegram, otherwise the bot can't deliver messages to you.
          </p>
        </div>
      )}

      {/* Column legend */}
      <div className="flex items-center justify-end gap-6 px-1 pr-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/70 w-9 text-center">
          In-app
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/70 w-9 text-center">
          Telegram
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-ink/[0.02] border border-ink/[0.05] animate-pulse" />
          ))}
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.group} className="space-y-2.5">
            <SectionHeader label={g.label} />
            <div className="rounded-md border border-ink/[0.06] divide-y divide-ink/[0.04] overflow-hidden">
              {g.rows.map((item) => {
                const tgLocked = !telegramLinked || !item.telegram_eligible;
                return (
                  <div
                    key={item.type}
                    className={`flex items-center justify-between gap-4 px-4 py-3 bg-ink/[0.01] transition-opacity ${
                      savingType === item.type ? "opacity-60" : ""
                    }`}
                  >
                    <span className="text-sm text-text-secondary">{item.label}</span>
                    <div className="flex items-center gap-6">
                      <div className="w-9 flex justify-center">
                        <Toggle on={item.in_app} onClick={() => handleToggle(item, "in_app")} />
                      </div>
                      <div className="w-9 flex justify-center">
                        <Toggle
                          on={item.telegram}
                          locked={tgLocked}
                          onClick={() => handleToggle(item, "telegram")}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default NotificationSettings;
