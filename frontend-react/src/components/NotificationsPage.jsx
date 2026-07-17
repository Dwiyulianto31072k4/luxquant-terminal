// src/components/NotificationsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Notifications Page v4
// v4: top-level tab switcher (Inbox | Settings). Settings = Layer 2 prefs.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notificationApi } from "../services/notificationApi";
import NotificationSettings from "./NotificationSettings";
import { ShimmerStyles } from "./ui/Loaders";

const PAGE_SIZE = 20;


// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span
      className={`font-mono uppercase tracking-[0.25em] text-text-muted ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
  </div>
);


// ════════════════════════════════════════════════════════════════
// TYPE-BASED VISUAL TOKEN — smart pump/dump detection
// ════════════════════════════════════════════════════════════════
const getTypeToken = (type, data) => {
  // SMART: price_pump can be pump OR dump based on data.percentage
  if (type === "price_pump" && data?.percentage !== undefined && data?.percentage !== null) {
    if (data.percentage < 0) {
      return { tone: "danger", label: "DUMP" };
    }
    return { tone: "gold", label: "PUMP" };
  }

  const map = {
    price_pump:       { tone: "gold",    label: "PUMP" },
    daily_results:    { tone: "neutral", label: "DAILY" },
    btcdom_call:      { tone: "gold",    label: "BTCDOM" },
    watchlist_update: { tone: "gold",    label: "WATCH" },
    sub_expiry:       { tone: "danger",  label: "EXPIRY" },
    admin_broadcast:  { tone: "neutral", label: "BROADCAST" },
    coin_called:      { tone: "gold",    label: "CALLED" },
    news:             { tone: "neutral", label: "NEWS" },
    market_pulse:     { tone: "gold",    label: "PULSE" },
    autotrade_position_closed:      { tone: "neutral", label: "AUTO" },
    autotrade_execution_failed:     { tone: "danger",  label: "AUTO" },
    autotrade_risk_limit:           { tone: "gold",    label: "AUTO" },
    autotrade_rate_limit:           { tone: "gold",    label: "AUTO" },
    autotrade_position_unprotected: { tone: "danger",  label: "AUTO" },
  };
  return map[type] || { tone: "neutral", label: "INFO" };
};

const toneStyle = (tone) => {
  if (tone === "gold")
    return "bg-accent/12 text-accent border-ink/12";
  if (tone === "danger")
    return "bg-loss/10 text-loss border-loss/25";
  return "bg-ink/[0.04] text-text-primary/70 border-ink/[0.08]";
};

const toneDot = (tone) => {
  if (tone === "gold") return "bg-accent";
  if (tone === "danger") return "bg-red-400";
  return "bg-ink/40";
};


// ════════════════════════════════════════════════════════════════
// TIME AGO HELPER
// ════════════════════════════════════════════════════════════════
const formatTimeAgo = (dt, t) => {
  if (!dt) return "";
  const then = new Date(dt);
  const diffMs = new Date() - then;
  if (diffMs < 0) return t("notifications.just_now") || "now";
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  if (mins < 1) return t("notifications.just_now") || "now";
  if (hours < 1) return `${mins}${t("notifications.m_ago") || "m"}`;
  if (hours < 24) return `${hours}${t("notifications.h_ago") || "h"}`;
  const sameYear = then.getFullYear() === new Date().getFullYear();
  const opts = sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric" };
  return then.toLocaleDateString(undefined, opts);
};


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const NotificationsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState("inbox"); // 'inbox' | 'settings'
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  // ── Filter options ──
  const typeFilters = [
    { key: null,               label: t("notifications.type_all") || "All Types" },
    { key: "price_pump",       label: t("notifications.type_price_pump") || "Price Alert" },
    { key: "daily_results",    label: t("notifications.type_daily_results") || "Daily Results" },
    { key: "btcdom_call",      label: t("notifications.type_btcdom_call") || "BTCDOM" },
    { key: "watchlist_update", label: t("notifications.type_watchlist_update") || "Watchlist" },
    { key: "coin_called",      label: t("notifications.type_coin_called") || "Watchlist Calls" },
    { key: "news",             label: t("notifications.type_news") || "News" },
    { key: "market_pulse",     label: t("notifications.type_market_pulse") || "Market Pulse" },
    { key: "autotrade",        label: "AutoTrade" },
    { key: "sub_expiry",       label: t("notifications.type_sub_expiry") || "Expiry" },
    { key: "admin_broadcast",  label: t("notifications.type_admin_broadcast") || "Broadcast" },
  ];

  // ── Fetch ──
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.getNotifications(
        page,
        PAGE_SIZE,
        typeFilter,
        activeTab === "unread"
      );
      setNotifications(data.items || []);
      setTotal(data.total || 0);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, activeTab]);

  useEffect(() => {
    if (view === "inbox") fetchNotifications();
  }, [fetchNotifications, view]);

  // ── Handlers ──
  const handleMarkAsRead = async (id) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  // ✅ Re-fetch from server after mark-all (don't trust local state)
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationApi.markAllAsRead();
      await fetchNotifications();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationApi.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) handleMarkAsRead(notif.id);
    if (notif.type === "btcdom_call" || notif.type === "watchlist_update" || notif.type === "coin_called") navigate("/signals");
    else if (notif.type === "daily_results") navigate("/analytics");
    else if (notif.type === "sub_expiry") navigate("/pricing");
    else if (notif.type === "news") navigate("/news");
    else if (notif.type === "market_pulse") navigate("/pulse");
    else if (notif.type && notif.type.startsWith("autotrade")) navigate("/autotrade");
  };

  // ── Group by date ──
  const groupByDate = (items) => {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    items.forEach((item) => {
      const d = new Date(item.created_at);
      const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      let label;
      if (itemDate.getTime() === today.getTime())
        label = t("notifications.today") || "Today";
      else if (itemDate.getTime() === yesterday.getTime())
        label = t("notifications.yesterday") || "Yesterday";
      else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  };

  const groupByCategory = (items, t) => {
    const CAT_OF = (type) => {
      if (!type) return "other";
      if (type.startsWith("autotrade")) return "autotrade";
      if (type === "market_pulse" || type === "price_pump") return "market";
      if (type === "news") return "news";
      if (["daily_results", "btcdom_call", "watchlist_update", "coin_called"].includes(type)) return "signals";
      if (["sub_expiry", "admin_broadcast"].includes(type)) return "account";
      return "other";
    };
    const LABELS = {
      autotrade: t("notifications.type_autotrade") || "AutoTrade",
      market:    t("notifications.type_market_pulse") || "Market",
      signals:   "Signals",
      news:      t("notifications.type_news") || "News",
      account:   "Account",
      other:     "Other",
    };
    const ORDER = ["autotrade", "market", "signals", "news", "account", "other"];
    const buckets = {};
    for (const it of items) {
      const c = CAT_OF(it.type);
      (buckets[c] = buckets[c] || []).push(it);
    }
    return ORDER.filter((c) => buckets[c]?.length).map((c) => [LABELS[c], buckets[c]]);
  };
  const grouped = groupByDate(notifications);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Top-level tabs ──
  const topTabs = [
    { key: "inbox",    label: t("notifications.tab_inbox") || "Inbox" },
    { key: "settings", label: t("notifications.tab_settings") || "Settings" },
  ];

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      {/* Section Header */}
      <SectionHeader label="Notifications" />

      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
              {t("notifications.title") || "Notifications"}
            </h1>
            {view === "inbox" && unreadCount > 0 && (
              <span className="inline-flex items-center text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 rounded border bg-accent/12 text-accent border-ink/12 tabular-nums">
                {unreadCount} new
              </span>
            )}
          </div>
          {view === "inbox" && (
            <p className="text-text-muted text-sm mt-1.5 font-mono tabular-nums">
              {total} {total === 1 ? "notification" : "notifications"} total
            </p>
          )}
          {view === "settings" && (
            <p className="text-text-muted text-sm mt-1.5">
              {t("notifications.settings_desc") || "Choose what you get notified about"}
            </p>
          )}
        </div>

        {view === "inbox" && unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-ink/12 text-[10px] font-mono uppercase tracking-[0.2em] text-accent hover:bg-accent/10 hover:border-ink/15 disabled:opacity-50 transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {markingAll ? "Marking…" : t("notifications.mark_all_read") || "Mark all read"}
          </button>
        )}
      </div>

      {/* ── Top-level tab switcher ── */}
      <div className="flex items-center gap-1 border-b border-ink/[0.06]">
        {topTabs.map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`relative px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] transition-colors ${
                active ? "text-accent" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
              {active && (
                <span className="absolute bottom-0 inset-x-0 h-px bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* SETTINGS VIEW                             */}
      {/* ════════════════════════════════════════ */}
      {view === "settings" && (
        <NotificationSettings t={t} navigate={navigate} />
      )}

      {/* ════════════════════════════════════════ */}
      {/* INBOX VIEW                                */}
      {/* ════════════════════════════════════════ */}
      {view === "inbox" && (
        <div className="space-y-4">
          {/* ── Toolbar: view segmented + type dropdown ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center rounded-md border border-ink/[0.08] bg-ink/[0.02] p-0.5">
              {["all", "unread"].map((tab) => {
                const active = activeTab === tab;
                const count = tab === "unread" ? unreadCount : total;
                return (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setPage(1); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-[0.1em] transition-all ${
                      active
                        ? "bg-accent text-accent-fg"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <span>{tab === "all" ? (t("notifications.all") || "All") : (t("notifications.unread") || "Unread")}</span>
                    <span className={`tabular-nums text-[10px] ${active ? "text-text-muted" : "text-text-muted/50"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <select
                value={typeFilter || ""}
                onChange={(e) => { setTypeFilter(e.target.value || null); setPage(1); }}
                className="appearance-none cursor-pointer rounded-md border border-ink/[0.08] bg-ink/[0.02] pl-3 pr-8 py-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-text-secondary hover:border-ink/[0.15] hover:text-text-primary focus:outline-none focus:border-ink/15 transition-all"
              >
                {typeFilters.map((f) => (
                  <option key={f.key || "all"} value={f.key || ""} className="bg-surface-raised text-text-primary">
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/60">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </div>
          {loading ? (
            <LoadingSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <>
              {groupByCategory(notifications, t).map(([catLabel, items]) => (
                <div key={catLabel} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
                      {catLabel}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-text-muted/50">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {items.map((notif) => (
                      <NotificationCard
                        key={notif.id}
                        notif={notif}
                        onClick={() => handleNotificationClick(notif)}
                        onDelete={() => handleDelete(notif.id)}
                        onMarkRead={() => handleMarkAsRead(notif.id)}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-md border border-ink/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-text-primary hover:border-ink/[0.15] disabled:opacity-30 transition-all"
                  >
                    ← Prev
                  </button>
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    {page}<span className="text-text-muted/40 mx-1">/</span>{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-md border border-ink/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-text-primary hover:border-ink/[0.15] disabled:opacity-30 transition-all"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// NOTIFICATION CARD — smart pump/dump label
// ════════════════════════════════════════════════════════════════
const NotificationCard = ({ notif, onClick, onDelete, onMarkRead, t }) => {
  const token = getTypeToken(notif.type, notif.data);
  const isUnread = !notif.is_read;

  return (
    <div
      onClick={onClick}
      className={`group relative flex items-start gap-3 pl-4 pr-3 py-3 rounded-md border cursor-pointer transition-all ${
        isUnread
          ? "bg-surface-secondary border-ink/[0.06] hover:border-ink/12"
          : "bg-transparent border-ink/[0.04] hover:bg-ink/[0.015] hover:border-ink/[0.10]"
      }`}
    >
      {isUnread && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-[2px] rounded-full bg-accent" />
      )}
      <div className="shrink-0 pt-0.5">
        <span className={`inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-1 rounded border whitespace-nowrap ${toneStyle(token.tone)}`}>
          {token.label}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-text-primary" : "font-medium text-text-secondary"}`}>
            {notif.title}
          </p>
          <span className="text-[10px] font-mono text-text-muted/60 whitespace-nowrap shrink-0 mt-0.5 tabular-nums">
            {formatTimeAgo(notif.created_at, t)}
          </span>
        </div>
        {notif.body && (
          <p className={`text-xs leading-relaxed line-clamp-2 mt-0.5 ${isUnread ? "text-text-secondary" : "text-text-muted"}`}>
            {notif.body}
          </p>
        )}
        {notif.data && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(notif.data.pair || notif.data.symbol) && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-ink/[0.04] border-ink/[0.08] text-text-primary/70 tabular-nums">
                {notif.data.pair || notif.data.symbol}
              </span>
            )}
            {notif.data.percentage !== undefined && notif.data.percentage !== null && (
              <span className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border tabular-nums ${
                notif.data.percentage > 0
                  ? "bg-profit/10 text-profit border-profit/25"
                  : "bg-loss/10 text-loss border-loss/25"
              }`}>
                {notif.data.percentage > 0 ? "+" : ""}{notif.data.percentage}%
              </span>
            )}
            {notif.data.realized_pnl !== undefined && notif.data.realized_pnl !== null && (
              <span className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border tabular-nums ${
                notif.data.realized_pnl >= 0
                  ? "bg-profit/10 text-profit border-profit/25"
                  : "bg-loss/10 text-loss border-loss/25"
              }`}>
                {notif.data.realized_pnl >= 0 ? "+" : ""}{Number(notif.data.realized_pnl).toFixed(2)}
              </span>
            )}
            {notif.data.tp_level && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-accent/12 text-accent border-ink/12">
                {notif.data.tp_level.toUpperCase()} hit
              </span>
            )}
            {notif.data.total_signals && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-ink/[0.04] border-ink/[0.08] text-text-muted tabular-nums">
                {notif.data.total_signals} signals
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 self-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        {isUnread && onMarkRead && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
            className="p-1.5 rounded-md border border-transparent hover:border-ink/12 hover:bg-surface-secondary text-text-muted/40 hover:text-text-primary transition-all"
            title="Mark as read"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md border border-transparent hover:border-loss/25 hover:bg-red-500/[0.05] text-text-muted/40 hover:text-loss transition-all"
          title="Delete"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// LOADING / EMPTY STATES
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="lqsk-group space-y-1.5">
    <ShimmerStyles />
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="bg-surface-raised border border-ink/[0.06] rounded-md p-3.5 flex items-start gap-3"
      >
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-ink/[0.04]" />
          <div className="w-12 h-3 bg-ink/[0.04] rounded" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-ink/[0.05] rounded w-1/2" />
          <div className="h-2.5 bg-ink/[0.03] rounded w-3/4" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ t }) => (
  <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-12 text-center">
    <div className="w-14 h-14 mx-auto mb-4 rounded-md border border-ink/10 flex items-center justify-center">
      <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    </div>
    <p className="text-text-primary text-base font-medium mb-1.5">
      {t("notifications.no_notifications") || "All caught up"}
    </p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em]">
      {t("notifications.no_notifications_desc") || "No new notifications"}
    </p>
  </div>
);


export default NotificationsPage;
