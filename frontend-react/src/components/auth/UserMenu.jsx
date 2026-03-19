// src/components/auth/UserMenu.jsx
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // <-- 1. Import i18n

const UserMenu = () => {
  const { t, i18n } = useTranslation(); // <-- 2. Panggil i18n
  const { user, logout, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        handleClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsOpen(false); setIsClosing(false); }, 150);
  };

  const handleToggle = () => {
    if (isOpen) { handleClose(); } else { setIsOpen(true); }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => navigate('/login')}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/10 transition-all whitespace-nowrap"
        >
          {t('userMenu.login')}
        </button>
        <button
          onClick={() => navigate('/register')}
          className="hidden sm:block px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all whitespace-nowrap"
        >
          {t('userMenu.register')}
        </button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    handleClose();
    navigate('/');
  };

  const handleNavClick = (path) => {
    if (path.startsWith('/')) {
      navigate(path);
    } else {
      window.dispatchEvent(new CustomEvent('navigate', { detail: path }));
    }
    handleClose();
  };

  // ── Derive subscription info from actual user data ──
  const getSubscriptionInfo = () => {
    const role = user?.role || 'free';
    const expiresAt = user?.subscription_expires_at;

    if (role === 'admin') {
      return { plan: t('userMenu.plan_admin'), status: 'active', expires_at: null, days_left: null };
    }

    if (role === 'premium' || role === 'subscriber') {
      if (!expiresAt) {
        // Lifetime
        return { plan: t('userMenu.plan_lifetime'), status: 'active', expires_at: null, days_left: null };
      }

      const now = new Date();
      const exp = new Date(expiresAt);
      const daysLeft = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));

      if (daysLeft <= 0) {
        return { plan: t('userMenu.plan_premium'), status: 'expired', expires_at: expiresAt, days_left: 0 };
      }

      // Determine plan label from note or duration
      let planLabel = t('userMenu.plan_premium');
      const note = user?.subscription_note || '';
      if (note.toLowerCase().includes('lifetime')) planLabel = t('userMenu.plan_lifetime');
      else if (note.toLowerCase().includes('yearly') || note.includes('1 Tahun') || daysLeft > 60) planLabel = t('userMenu.plan_yearly');
      else planLabel = t('userMenu.plan_monthly');

      return { plan: planLabel, status: 'active', expires_at: expiresAt, days_left: daysLeft };
    }

    return { plan: t('userMenu.plan_free'), status: 'free', expires_at: null, days_left: null };
  };

  const subscription = getSubscriptionInfo();

  const getPlanBadge = () => {
    switch (subscription.status) {
      case 'active':
        return { label: subscription.plan, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
      case 'expired':
        return { label: t('userMenu.status_expired'), color: 'bg-red-500/15 text-red-400 border-red-500/20' };
      default:
        return { label: t('userMenu.plan_free'), color: 'bg-white/10 text-text-muted border-white/10' };
    }
  };

  const badge = getPlanBadge();
  const initial = user?.username?.charAt(0).toUpperCase() || 'U';
  const avatarUrl = user?.avatar_url;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'id-ID'; // Menggunakan format bahasa aktif
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Subscription sublabel for menu item
  const getSubLabel = () => {
    if (subscription.status === 'active') return `${subscription.plan} ${t('userMenu.subs_plan_suffix')}`;
    if (subscription.status === 'expired') return t('userMenu.subs_expired');
    return t('userMenu.upgrade_premium');
  };

  return (
    <div className="relative" ref={menuRef}>
      <style>{`
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(-8px) scale(.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes menuOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(.97); }
        }
        .user-menu-enter { animation: menuIn .2s cubic-bezier(.16,1,.3,1) forwards; }
        .user-menu-exit { animation: menuOut .15s ease forwards; }
      `}</style>

      {/* ── Trigger Button ── */}
      <button
        onClick={handleToggle}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
          isOpen
            ? 'ring-2 ring-gold-primary/40 ring-offset-2 ring-offset-bg-primary'
            : 'hover:ring-2 hover:ring-white/10 hover:ring-offset-1 hover:ring-offset-bg-primary'
        }`}
      >
        {avatarUrl ? (
          <div className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark" style={{ boxShadow: '0 0 10px rgba(212,168,83,0.5), 0 0 20px rgba(212,168,83,0.2)' }}>
            <img 
              src={avatarUrl} 
              alt={user?.username} 
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => { e.target.parentElement.style.display = 'none'; e.target.parentElement.nextSibling.style.display = 'flex'; }}
            />
          </div>
        ) : null}
        <div 
          className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark items-center justify-center"
          style={{ display: avatarUrl ? 'none' : 'flex', boxShadow: '0 0 10px rgba(212,168,83,0.5), 0 0 20px rgba(212,168,83,0.2)' }}
        >
          <span className="text-sm font-bold text-bg-primary leading-none">{initial}</span>
        </div>
      </button>

      {/* ── Dropdown Panel ── */}
      {isOpen && (
        <div className={`absolute right-0 mt-2 w-72 rounded-2xl overflow-hidden z-50 shadow-2xl shadow-black/60 ${isClosing ? 'user-menu-exit' : 'user-menu-enter'}`}
          style={{ background: '#0d0a10', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

          {/* ─── Section 1: User Info + Subscription ─── */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              {avatarUrl ? (
                <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark flex-shrink-0" style={{ boxShadow: '0 0 12px rgba(212,168,83,0.5), 0 0 24px rgba(212,168,83,0.2)' }}>
                  <img 
                    src={avatarUrl} 
                    alt={user?.username}
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { 
                      e.target.parentElement.style.display = 'none'; 
                      e.target.parentElement.nextSibling.style.display = 'flex'; 
                    }}
                  />
                </div>
              ) : null}
              <div 
                className="w-11 h-11 rounded-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark items-center justify-center flex-shrink-0"
                style={{ display: avatarUrl ? 'none' : 'flex', boxShadow: '0 0 12px rgba(212,168,83,0.5), 0 0 24px rgba(212,168,83,0.2)' }}
              >
                <span className="text-lg font-bold text-bg-primary leading-none">{initial}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold text-sm truncate">{user?.username}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.color} flex-shrink-0`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-text-muted text-[11px] truncate mt-0.5">{user?.email}</p>
                
                {/* Subscription status line */}
                {subscription.status === 'active' && subscription.expires_at && (
                  <p className="text-text-muted text-[10px] mt-1">
                    {t('userMenu.active_until')} <span className="text-text-secondary">{formatDate(subscription.expires_at)}</span>
                    {subscription.days_left !== null && (
                      <span className={subscription.days_left <= 7 ? ' text-amber-400' : ''}>
                        {' '}· {subscription.days_left} {t('userMenu.days')}
                      </span>
                    )}
                  </p>
                )}
                {subscription.status === 'active' && !subscription.expires_at && subscription.plan !== t('userMenu.plan_admin') && (
                  <p className="text-emerald-400/70 text-[10px] mt-1">{t('userMenu.lifetime_badge')}</p>
                )}
                {subscription.status === 'active' && subscription.plan === t('userMenu.plan_admin') && (
                  <p className="text-red-400/70 text-[10px] mt-1">{t('userMenu.admin_badge')}</p>
                )}
                {subscription.status === 'expired' && (
                  <p className="text-red-400/70 text-[10px] mt-1">{t('userMenu.subs_expired')}</p>
                )}
                {subscription.status === 'free' && (
                  <p className="text-text-muted text-[10px] mt-1">
                    <span className="text-gold-primary cursor-pointer hover:underline" onClick={() => { handleClose(); navigate('/pricing'); }}>
                      {t('userMenu.upgrade_premium')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mx-3 h-px bg-white/[0.05]" />

          {/* ─── Section 2: Account Menu ─── */}
          <div className="py-1.5 px-1.5">
            <MenuItem
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />}
              label={t('userMenu.profile_settings')}
              sublabel={t('userMenu.profile_desc')}
              onClick={() => handleNavClick('/profile')}
            />
            <MenuItem
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />}
              label={t('userMenu.subs_billing')}
              sublabel={getSubLabel()}
              onClick={() => handleNavClick('/pricing')}
              badge={subscription.status === 'free' ? { label: t('userMenu.upgrade_badge'), color: 'bg-gold-primary/15 text-gold-primary' } : null}
            />
            <MenuItem
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />}
              label={t('userMenu.notif')}
              sublabel={t('userMenu.notif_desc')}
              onClick={() => handleNavClick('/notifications')}
            />
          </div>

          <div className="mx-3 h-px bg-white/[0.05]" />

          {/* ─── Section 3: Quick Links ─── */}
          <div className="py-1.5 px-1.5">
            <MenuItem
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />}
              label={t('userMenu.my_watchlist')}
              onClick={() => handleNavClick('/watchlist')}
            />
            <MenuItem
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />}
              label={t('userMenu.help_support')}
              onClick={() => handleNavClick('/support')}
            />
          </div>

          <div className="mx-3 h-px bg-white/[0.05]" />

          {/* ─── Section 4: Logout ─── */}
          <div className="py-1.5 px-1.5">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all group"
            >
              <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="text-[13px] font-medium">{t('userMenu.logout')}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

const MenuItem = ({ icon, label, sublabel, onClick, badge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-secondary hover:text-white hover:bg-white/[0.05] transition-all group"
  >
    <svg className="w-[18px] h-[18px] flex-shrink-0 text-text-muted group-hover:text-gold-primary/70 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icon}
    </svg>
    <div className="flex-1 text-left min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        {badge && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge.color}`}>{badge.label}</span>
        )}
      </div>
      {sublabel && (
        <p className="text-[10px] text-text-muted group-hover:text-text-muted/80 truncate mt-0.5">{sublabel}</p>
      )}
    </div>
    <svg className="w-3.5 h-3.5 text-text-muted/30 group-hover:text-text-muted/50 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

export default UserMenu;