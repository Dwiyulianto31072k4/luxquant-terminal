// src/components/NotificationsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Notifications Page v3 (Flowscan reskin)
// Fix: responsive layout, smart pump/dump label, re-fetch after mark-all
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notificationApi } from "../services/notificationApi";

const PAGE_SIZE = 20;


// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span
      className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
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
  };
  return map[type] || { tone: "neutral", label: "INFO" };
};

const toneStyle = (tone) => {
  if (tone === "gold")
    return "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
  if (tone === "danger")
    return "bg-red-500/10 text-red-400 border-red-500/25";
  return "bg-white/[0.04] text-white/70 border-white/[0.08]";
};

const toneDot = (tone) => {
  if (tone === "gold") return "bg-gold-primary";
  if (tone === "danger") return "bg-red-400";
  return "bg-white/40";
};


// ════════════════════════════════════════════════════════════════
// TIME AGO HELPER
// ════════════════════════════════════════════════════════════════
const formatTimeAgo = (dt, t) => {
  if (!dt) return "";
  const diffMs = new Date() - new Date(dt);
  if (diffMs < 0) return t("notifications.just_now") || "now";
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}${t("notifications.d_ago") || "d"}`;
  if (hours > 0) return `${hours}${t("notifications.h_ago") || "h"}`;
  if (mins > 0) return `${mins}${t("notifications.m_ago") || "m"}`;
  return t("notifications.just_now") || "now";
};


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const NotificationsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    fetchNotifications();
  }, [fetchNotifications]);

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

  // ✅ FIX: Re-fetch from server after mark-all (don't trust local state)
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationApi.markAllAsRead();
      // Re-fetch from server to get accurate count
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
    if (notif.type === "btcdom_call" || notif.type === "watchlist_update") navigate("/signals");
    else if (notif.type === "daily_results") navigate("/analytics");
    else if (notif.type === "sub_expiry") navigate("/pricing");
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

  const grouped = groupByDate(notifications);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ════════════════════════════════════════
  // RENDER — adaptive 2-col layout (lg+) / single col (mobile/md)
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      {/* Section Header */}
      <SectionHeader label="Notifications" />

      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              {t("notifications.title") || "Notifications"}
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 rounded border bg-gold-primary/10 text-gold-primary border-gold-primary/25 tabular-nums">
                {unreadCount} new
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm mt-1.5 font-mono tabular-nums">
            {total} {total === 1 ? "notification" : "notifications"} total
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gold-primary/25 text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary hover:bg-gold-primary/[0.08] hover:border-gold-primary/40 disabled:opacity-50 transition-all"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {markingAll ? "Marking…" : t("notifications.mark_all_read") || "Mark all read"}
          </button>
        )}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* RESPONSIVE 2-COL LAYOUT                   */}
      {/* ════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Sidebar (lg+): filters ── */}
        <aside className="lg:col-span-3 space-y-4">
          {/* View tabs */}
          <div className="space-y-2">
            <SectionHeader label="View" small />
            <div className="flex lg:flex-col gap-1.5">
              {["all", "unread"].map((tab) => {
                const active = activeTab === tab;
                const count = tab === "unread" ? unreadCount : total;
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setPage(1);
                    }}
                    className={`flex-1 lg:flex-initial flex items-center justify-between px-3 py-2 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border ${
                      active
                        ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                        : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                    }`}
                  >
                    <span>
                      {tab === "all"
                        ? t("notifications.all") || "All"
                        : t("notifications.unread") || "Unread"}
                    </span>
                    <span className={`tabular-nums ${active ? "text-gold-primary/70" : "text-text-muted/60"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type filter chips */}
          <div className="space-y-2">
            <SectionHeader label="Type" small />
            <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-1 lg:pb-0 -mx-1 px-1 scrollbar-hide">
              {typeFilters.map((f) => {
                const active = typeFilter === f.key;
                return (
                  <button
                    key={f.key || "all"}
                    onClick={() => {
                      setTypeFilter(f.key);
                      setPage(1);
                    }}
                    className={`shrink-0 lg:shrink lg:text-left px-3 py-2 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                      active
                        ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                        : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Main: Notification List ── */}
        <main className="lg:col-span-9 space-y-5">
          {loading ? (
            <LoadingSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <>
              {Object.entries(grouped).map(([dateLabel, items]) => (
                <div key={dateLabel} className="space-y-2">
                  {/* Date group header */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/70">
                      {dateLabel}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.04]" />
                    <span className="font-mono text-[10px] tabular-nums text-text-muted/50">
                      {items.length}
                    </span>
                  </div>

                  {/* Notifications in group */}
                  <div className="space-y-1.5">
                    {items.map((notif) => (
                      <NotificationCard
                        key={notif.id}
                        notif={notif}
                        onClick={() => handleNotificationClick(notif)}
                        onDelete={() => handleDelete(notif.id)}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-md border border-white/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-white hover:border-white/[0.15] disabled:opacity-30 transition-all"
                  >
                    ← Prev
                  </button>
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">
                    {page}<span className="text-text-muted/40 mx-1">/</span>{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-md border border-white/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-white hover:border-white/[0.15] disabled:opacity-30 transition-all"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// NOTIFICATION CARD — smart pump/dump label
// ════════════════════════════════════════════════════════════════
const NotificationCard = ({ notif, onClick, onDelete, t }) => {
  const token = getTypeToken(notif.type, notif.data);
  const isUnread = !notif.is_read;

  return (
    <div
      onClick={onClick}
      className={`group relative flex items-start gap-3 p-3.5 rounded-md border cursor-pointer transition-all ${
        isUnread
          ? "bg-[#0a0805] border-gold-primary/15 hover:border-gold-primary/30"
          : "bg-white/[0.01] border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {/* Top hairline accent (only unread) */}
      {isUnread && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      )}

      {/* Type indicator (dot + label, no emoji) */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${toneDot(token.tone)} ${isUnread ? "animate-pulse" : "opacity-50"}`} />
        <span className={`text-[8px] font-mono uppercase tracking-[0.1em] px-1 py-0.5 rounded border whitespace-nowrap ${toneStyle(token.tone)}`}>
          {token.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className={`text-sm font-semibold leading-snug ${isUnread ? "text-white" : "text-text-secondary"}`}>
            {notif.title}
          </p>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted/60 whitespace-nowrap shrink-0 mt-0.5 tabular-nums">
            {formatTimeAgo(notif.created_at, t)}
          </span>
        </div>

        {notif.body && (
          <p className={`text-xs leading-relaxed line-clamp-2 ${isUnread ? "text-text-secondary" : "text-text-muted"}`}>
            {notif.body}
          </p>
        )}

        {/* Data badges */}
        {notif.data && (
          <div className="flex flex-wrap gap-1 mt-2">
            {notif.data.pair && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/70 tabular-nums">
                {notif.data.pair}
              </span>
            )}
            {notif.data.percentage !== undefined && notif.data.percentage !== null && (
              <span className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border tabular-nums ${
                notif.data.percentage > 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-red-500/10 text-red-400 border-red-500/25"
              }`}>
                {notif.data.percentage > 0 ? "+" : ""}{notif.data.percentage}%
              </span>
            )}
            {notif.data.tp_level && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-gold-primary/10 text-gold-primary border-gold-primary/25">
                {notif.data.tp_level.toUpperCase()} hit
              </span>
            )}
            {notif.data.total_signals && (
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-text-muted tabular-nums">
                {notif.data.total_signals} signals
              </span>
            )}
          </div>
        )}
      </div>

      {/* Delete button (hover reveal) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-md border border-transparent hover:border-red-500/25 hover:bg-red-500/[0.05] text-text-muted/40 hover:text-red-400 transition-all"
        title="Delete"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// LOADING / EMPTY STATES
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="space-y-1.5">
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="bg-[#0a0805] border border-white/[0.06] rounded-md p-3.5 flex items-start gap-3"
      >
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-white/[0.04] animate-pulse" />
          <div className="w-12 h-3 bg-white/[0.04] rounded animate-pulse" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/2 animate-pulse" />
          <div className="h-2.5 bg-white/[0.03] rounded w-3/4 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ t }) => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="w-14 h-14 mx-auto mb-4 rounded-md border border-gold-primary/20 flex items-center justify-center">
      <svg className="w-6 h-6 text-gold-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    </div>
    <p className="text-white text-base font-medium mb-1.5">
      {t("notifications.no_notifications") || "All caught up"}
    </p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em]">
      {t("notifications.no_notifications_desc") || "No new notifications"}
    </p>
  </div>
);


export default NotificationsPage;
