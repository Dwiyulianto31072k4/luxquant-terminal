// src/components/NotificationBell.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Notification Bell v3
// Fixes:
//   - Badge overflow (99+ now fits properly, no clash with avatar)
//   - Refresh unread count on dropdown close (catches mark-as-read updates)
//   - Re-fetch when window regains focus (catches background broadcasts)
//   - Cleaner polling lifecycle
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { notificationApi } from "../services/notificationApi";


// ── Type-based token (semantic 3-tier, no emoji) ──
const getTypeToken = (type, data) => {
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

const toneDot = (tone) => {
  if (tone === "gold") return "bg-gold-primary";
  if (tone === "danger") return "bg-red-400";
  return "bg-ink/40";
};


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const NotificationBell = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [preview, setPreview] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const menuRef = useRef(null);

  // ── Centralized fetch helper ──
  const fetchCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationApi.getUnreadCount();
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silent fail — keep last known count
    }
  }, [isAuthenticated]);

  // ── Poll unread count every 30s + on window focus ──
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchCount();
    const interval = setInterval(fetchCount, 30000);

    // Re-fetch when user comes back to tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", fetchCount);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", fetchCount);
    };
  }, [isAuthenticated, fetchCount]);

  // ── Close on outside click ──
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) handleClose();
    };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      // FIX: Re-fetch count when dropdown closes — catches any async mark-as-read
      fetchCount();
    }, 150);
  };

  const handleToggle = async () => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
      setLoadingPreview(true);
      try {
        const data = await notificationApi.getNotifications(1, 5, null, false);
        setPreview(data.items || []);
        setUnreadCount(data.unread_count || 0);
      } catch (err) {
        setPreview([]);
      } finally {
        setLoadingPreview(false);
      }
    }
  };

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    try {
      await notificationApi.markAllAsRead();
      // Refetch from server to get accurate count
      const data = await notificationApi.getNotifications(1, 5, null, false);
      setPreview(data.items || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
  };

  const handleViewAll = () => {
    handleClose();
    navigate("/notifications");
  };

  const handleNotifClick = (notif) => {
    if (!notif.is_read) {
      notificationApi.markAsRead(notif.id).catch(() => {});
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    handleClose();
    if (notif.type === "btcdom_call" || notif.type === "watchlist_update")
      navigate("/signals");
    else if (notif.type === "daily_results") navigate("/analytics");
    else if (notif.type === "sub_expiry") navigate("/pricing");
    else if (notif.type === "coin_called") navigate("/signals");
    else if (notif.type === "market_pulse") navigate("/pulse");
    else if (notif.type && notif.type.startsWith("autotrade")) navigate("/autotrade");
    else navigate("/notifications");
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return "";
    const diffMs = new Date() - new Date(dt);
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}${t("notifications.d_ago") || "d"}`;
    if (hours > 0) return `${hours}${t("notifications.h_ago") || "h"}`;
    if (mins > 0) return `${mins}${t("notifications.m_ago") || "m"}`;
    return t("notifications.just_now") || "now";
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* ── Bell Button ── */}
      <button
        onClick={handleToggle}
        className="relative w-9 h-9 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-ink/[0.04] hover:border-ink/[0.08] border border-transparent transition-all"
        title={t("notifications.title") || "Notifications"}
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {/* FIX: Badge — bigger min-width, proper height for 99+, z-index, ring for separation */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[16px] flex items-center justify-center px-1 bg-gold-primary text-surface-raised text-[9px] font-mono font-bold rounded-full tabular-nums leading-none ring-2 ring-bg-primary z-10"
            style={{ paddingLeft: 4, paddingRight: 4 }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ── */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-80 sm:w-96 z-50 ${
            isClosing
              ? "animate-out fade-out slide-out-to-top-2 duration-150"
              : "animate-in fade-in slide-in-from-top-2 duration-200"
          }`}
        >
          <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.08] rounded-md shadow-[0_20px_60px_rgb(var(--scrim) / 0.35)]">
            {/* Top hairline */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

            {/* ── Header ── */}
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-ink/[0.06]">
              <div className="flex items-center gap-2">
                <h3 className="text-text-primary text-sm font-semibold tracking-tight">
                  {t("notifications.title") || "Notifications"}
                </h3>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-gold-primary/10 text-gold-primary border-line/25 tabular-nums">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-mono uppercase tracking-[0.15em] text-gold-primary/80 hover:text-gold-primary transition-colors"
                >
                  {t("notifications.mark_all_read") || "Mark all"}
                </button>
              )}
            </div>

            {/* ── Preview List ── */}
            <div className="max-h-80 overflow-y-auto">
              {loadingPreview ? (
                <PreviewSkeleton />
              ) : preview.length === 0 ? (
                <EmptyPreview t={t} />
              ) : (
                <div>
                  {preview.map((notif) => (
                    <PreviewRow
                      key={notif.id}
                      notif={notif}
                      onClick={() => handleNotifClick(notif)}
                      formatTimeAgo={formatTimeAgo}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="border-t border-ink/[0.06]">
              <button
                onClick={handleViewAll}
                className="w-full py-2.5 text-center text-[10px] font-mono uppercase tracking-[0.25em] text-gold-primary/80 hover:text-gold-primary hover:bg-gold-primary/[0.04] transition-all"
              >
                {t("notifications.view_all") || "View all"} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// PREVIEW ROW
// ════════════════════════════════════════════════════════════════
const PreviewRow = ({ notif, onClick, formatTimeAgo }) => {
  const token = getTypeToken(notif.type, notif.data);
  const isUnread = !notif.is_read;

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors border-b border-ink/[0.04] last:border-0 ${
        isUnread ? "bg-gold-primary/[0.03] hover:bg-gold-primary/[0.06]" : "hover:bg-ink/[0.02]"
      }`}
    >
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full mt-2 ${toneDot(token.tone)} ${
          isUnread ? "animate-pulse" : "opacity-40"
        }`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5">
          <p
            className={`text-[12px] font-medium leading-tight truncate ${
              isUnread ? "text-text-primary" : "text-text-secondary"
            }`}
          >
            {notif.title}
          </p>
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted/60 whitespace-nowrap shrink-0 tabular-nums">
            {formatTimeAgo(notif.created_at)}
          </span>
        </div>
        {notif.body && (
          <p className="text-[10px] font-mono text-text-muted/70 mt-0.5 line-clamp-1 leading-relaxed">
            {notif.body}
          </p>
        )}
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// PREVIEW STATES
// ════════════════════════════════════════════════════════════════
const PreviewSkeleton = () => (
  <div className="p-4 space-y-3">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="flex gap-2.5 animate-pulse">
        <div className="w-1.5 h-1.5 bg-ink/[0.06] rounded-full mt-1.5 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-ink/[0.05] rounded w-2/3" />
          <div className="h-2 bg-ink/[0.03] rounded w-full" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyPreview = ({ t }) => (
  <div className="flex flex-col items-center py-8 text-center">
    <div className="w-10 h-10 mb-3 rounded-md border border-ink/[0.08] flex items-center justify-center">
      <svg
        className="w-4 h-4 text-text-muted/40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    </div>
    <p className="text-text-muted text-[10px] font-mono uppercase tracking-[0.15em]">
      {t("notifications.no_notifications") || "All caught up"}
    </p>
  </div>
);


export default NotificationBell;
