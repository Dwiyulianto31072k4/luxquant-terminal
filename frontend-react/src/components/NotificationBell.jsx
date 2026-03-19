// src/components/NotificationBell.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../services/notificationApi';

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

  // Poll unread count every 30s
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCount = async () => {
      try {
        const data = await notificationApi.getUnreadCount();
        setUnreadCount(data.unread_count || 0);
      } catch (err) {
        // Silent fail
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) handleClose();
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsOpen(false); setIsClosing(false); }, 150);
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

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationApi.markAsRead(id);
      setPreview(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const handleViewAll = () => {
    handleClose();
    navigate('/notifications');
  };

  const handleNotifClick = (notif) => {
    if (!notif.is_read) {
      notificationApi.markAsRead(notif.id).catch(() => {});
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    handleClose();
    if (notif.type === 'btcdom_call' || notif.type === 'watchlist_update') navigate('/signals');
    else if (notif.type === 'daily_results') navigate('/analytics');
    else if (notif.type === 'sub_expiry') navigate('/pricing');
    else navigate('/notifications');
  };

  const getTypeIcon = (type) => {
    const icons = { price_pump: '🔥', daily_results: '📊', btcdom_call: '⚠️', watchlist_update: '⭐', sub_expiry: '⏰', admin_broadcast: '📢' };
    return icons[type] || '🔔';
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const diffMs = new Date() - new Date(dt);
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}${t('notifications.d_ago')}`;
    if (hours > 0) return `${hours}${t('notifications.h_ago')}`;
    if (mins > 0) return `${mins}${t('notifications.m_ago')}`;
    return t('notifications.just_now');
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/[0.06] transition-all"
        title="Notifications"
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 bg-gold-primary text-bg-primary text-[9px] font-bold rounded-full shadow-[0_0_8px_rgba(212,168,83,0.5)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl overflow-hidden z-50 shadow-2xl shadow-black/60 ${isClosing ? 'animate-out fade-out slide-out-to-top-2 duration-150' : 'animate-in fade-in slide-in-from-top-2 duration-200'}`}
          style={{ background: '#0d0a10', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <h3 className="text-white text-sm font-semibold">{t('notifications.title')}</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-gold-primary/15 text-gold-primary text-[9px] font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await notificationApi.markAllAsRead();
                    setPreview(prev => prev.map(n => ({ ...n, is_read: true })));
                    setUnreadCount(0);
                  } catch {}
                }}
                className="text-[10px] text-gold-primary hover:text-gold-light transition-colors font-medium"
              >
                {t('notifications.mark_all_read')}
              </button>
            )}
          </div>

          {/* Preview list */}
          <div className="max-h-80 overflow-y-auto">
            {loadingPreview ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-2.5 animate-pulse">
                    <div className="w-7 h-7 bg-white/5 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-white/5 rounded w-2/3" />
                      <div className="h-2 bg-white/5 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : preview.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <svg className="w-8 h-8 text-text-muted/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <p className="text-text-muted text-xs">{t('notifications.no_notifications')}</p>
              </div>
            ) : (
              <div className="py-1">
                {preview.map(notif => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-all hover:bg-white/[0.03] ${
                      !notif.is_read ? 'bg-gold-primary/[0.03]' : ''
                    }`}
                  >
                    <span className="text-sm mt-0.5 flex-shrink-0">{getTypeIcon(notif.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5">
                        <p className={`text-xs font-medium leading-tight truncate ${notif.is_read ? 'text-text-secondary' : 'text-white'}`}>
                          {notif.title}
                        </p>
                        <span className="text-[9px] text-text-muted whitespace-nowrap flex-shrink-0">
                          {formatTimeAgo(notif.created_at)}
                        </span>
                      </div>
                      {notif.body && (
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{notif.body}</p>
                      )}
                    </div>
                    {!notif.is_read && (
                      <div className="w-1.5 h-1.5 bg-gold-primary rounded-full flex-shrink-0 mt-1.5 shadow-[0_0_4px_rgba(212,168,83,0.5)]" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5">
            <button
              onClick={handleViewAll}
              className="w-full py-2.5 text-center text-xs font-medium text-gold-primary hover:text-gold-light hover:bg-gold-primary/5 transition-all"
            >
              {t('notifications.view_all')} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;