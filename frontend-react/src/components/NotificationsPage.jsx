// src/components/NotificationsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../services/notificationApi';

const NotificationsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // all, unread
  const [typeFilter, setTypeFilter] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const PAGE_SIZE = 20;

  const typeFilters = [
    { key: null, label: t('notifications.type_all'), icon: '📋' },
    { key: 'price_pump', label: t('notifications.type_price_pump'), icon: '🔥' },
    { key: 'daily_results', label: t('notifications.type_daily_results'), icon: '📊' },
    { key: 'btcdom_call', label: t('notifications.type_btcdom_call'), icon: '⚠️' },
    { key: 'watchlist_update', label: t('notifications.type_watchlist_update'), icon: '⭐' },
    { key: 'sub_expiry', label: t('notifications.type_sub_expiry'), icon: '⏰' },
    { key: 'admin_broadcast', label: t('notifications.type_admin_broadcast'), icon: '📢' },
  ];

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.getNotifications(
        page, PAGE_SIZE, typeFilter, activeTab === 'unread'
      );
      setNotifications(data.items || []);
      setTotal(data.total || 0);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, activeTab]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationApi.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setTotal(prev => prev - 1);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const diffMs = new Date() - new Date(dt);
    if (diffMs < 0) return t('notifications.just_now');
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}${t('notifications.d_ago')}`;
    if (hours > 0) return `${hours}${t('notifications.h_ago')}`;
    if (mins > 0) return `${mins}${t('notifications.m_ago')}`;
    return t('notifications.just_now');
  };

  const getTypeIcon = (type) => {
    const icons = {
      price_pump: '🔥', daily_results: '📊', btcdom_call: '⚠️',
      watchlist_update: '⭐', sub_expiry: '⏰', admin_broadcast: '📢',
    };
    return icons[type] || '🔔';
  };

  const getTypeColor = (type) => {
    const colors = {
      price_pump: 'border-l-orange-500',
      daily_results: 'border-l-blue-500',
      btcdom_call: 'border-l-amber-500',
      watchlist_update: 'border-l-gold-primary',
      sub_expiry: 'border-l-red-500',
      admin_broadcast: 'border-l-purple-500',
    };
    return colors[type] || 'border-l-white/20';
  };

  const handleNotificationClick = (notif) => {
    if (!notif.is_read) handleMarkAsRead(notif.id);
    // Navigate based on type
    if (notif.type === 'btcdom_call' || notif.type === 'watchlist_update') navigate('/signals');
    else if (notif.type === 'daily_results') navigate('/analytics');
    else if (notif.type === 'sub_expiry') navigate('/pricing');
  };

  // Group by date
  const groupByDate = (items) => {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

    items.forEach(item => {
      const d = new Date(item.created_at);
      const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      let label;
      if (itemDate.getTime() === today.getTime()) label = t('notifications.today');
      else if (itemDate.getTime() === yesterday.getTime()) label = t('notifications.yesterday');
      else label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
    return groups;
  };

  const grouped = groupByDate(notifications);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">{t('notifications.title')}</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-gold-primary/15 text-gold-primary text-xs font-bold rounded-full border border-gold-primary/20">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gold-primary hover:bg-gold-primary/10 border border-gold-primary/20 transition-all disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {t('notifications.mark_all_read')}
          </button>
        )}
      </div>

      {/* Tabs + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Unread / All toggle */}
        <div className="flex bg-bg-secondary/50 rounded-lg p-0.5 border border-white/5">
          {['all', 'unread'].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(1); }}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === tab
                  ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              {tab === 'all' ? t('notifications.all') : t('notifications.unread')}
              {tab === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-gold-primary/20 text-gold-primary text-[9px] font-bold rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {typeFilters.map(f => (
            <button
              key={f.key || 'all'}
              onClick={() => { setTypeFilter(f.key); setPage(1); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border ${
                typeFilter === f.key
                  ? 'bg-gold-primary/10 text-gold-primary border-gold-primary/30'
                  : 'text-text-muted hover:text-white border-white/5 hover:border-white/10'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-bg-card/50 rounded-xl border border-white/5 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-white/5 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-1/3" />
                  <div className="h-2.5 bg-white/5 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">{t('notifications.no_notifications')}</p>
          <p className="text-text-muted text-sm max-w-sm">{t('notifications.no_notifications_desc')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <p className="text-text-muted text-[10px] uppercase tracking-[0.15em] font-semibold px-1 mb-2">{dateLabel}</p>
              <div className="space-y-1.5">
                {items.map((notif, idx) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`group relative flex items-start gap-3 p-3.5 rounded-xl border-l-[3px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5
                      ${getTypeColor(notif.type)}
                      ${notif.is_read
                        ? 'bg-bg-card/30 border border-l-[3px] border-white/5 hover:border-white/10'
                        : 'bg-bg-card/60 border border-l-[3px] border-gold-primary/10 hover:border-gold-primary/20 shadow-sm shadow-gold-primary/5'
                      }
                    `}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    {/* Unread dot */}
                    {!notif.is_read && (
                      <div className="absolute top-3 right-3 w-2 h-2 bg-gold-primary rounded-full shadow-[0_0_6px_rgba(212,168,83,0.5)]" />
                    )}

                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                      notif.is_read ? 'bg-white/5' : 'bg-gold-primary/10'
                    }`}>
                      {getTypeIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold leading-tight ${notif.is_read ? 'text-text-secondary' : 'text-white'}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-text-muted whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatTimeAgo(notif.created_at)}
                        </span>
                      </div>
                      {notif.body && (
                        <p className={`text-xs mt-0.5 leading-relaxed line-clamp-2 ${notif.is_read ? 'text-text-muted' : 'text-text-secondary'}`}>
                          {notif.body}
                        </p>
                      )}

                      {/* Data badges */}
                      {notif.data && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {notif.data.pair && (
                            <span className="px-1.5 py-0.5 bg-white/5 text-[9px] font-mono font-bold text-white rounded border border-white/10">
                              {notif.data.pair}
                            </span>
                          )}
                          {notif.data.percentage && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded border ${
                              notif.data.percentage > 0
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {notif.data.percentage > 0 ? '+' : ''}{notif.data.percentage}%
                            </span>
                          )}
                          {notif.data.tp_level && (
                            <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-[9px] font-bold rounded border border-green-500/20">
                              {notif.data.tp_level.toUpperCase()} HIT
                            </span>
                          )}
                          {notif.data.total_signals && (
                            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-bold rounded border border-blue-500/20">
                              {notif.data.total_signals} signals
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Delete button (personal only, on hover) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(notif.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all flex-shrink-0"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-white border border-white/10 hover:border-white/20 transition-all disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-text-muted text-xs">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-white border border-white/10 hover:border-white/20 transition-all disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;