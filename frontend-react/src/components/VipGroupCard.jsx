// src/components/VipGroupCard.jsx
// ════════════════════════════════════════════════════════════════
// Telegram VIP Group — Join button + grace-period banner
//   States:
//     - No active access      → prompt subscribe
//     - Active but no Telegram → prompt link Telegram first
//     - Active + linked        → "Join VIP Group" (generate invite link)
//     - Already member         → show connected state
//     - In grace period        → warning banner (renew before kick)
// Matches ProfilePage Section styling.
// ════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/authApi';

const Section = ({ title, badge, children }) => (
  <div className="overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.015]"
    style={{ boxShadow: 'inset 0 1px 2px -1px rgba(0,0,0,0.3)' }}>
    <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-white/[0.05] bg-white/[0.015]">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/70 font-semibold">
        {title}
      </h2>
      {badge}
    </div>
    {children}
  </div>
);

const TelegramIcon = () => (
  <svg className="w-4 h-4 text-brand-telegram" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const VipGroupCard = ({ onToast }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);

  const hasAccess = user?.has_active_access ?? (
    user?.role === 'admin' ||
    user?.role === 'co_admin' ||
    user?.role === 'founder' ||
    user?.role === 'premium' ||
    user?.role === 'subscriber'
  );
  const telegramLinked = !!user?.telegram_id;
  const inGroup = !!user?.telegram_in_group || joined;
  const graceUntil = user?.telegram_grace_until ? new Date(user.telegram_grace_until) : null;
  const inGrace = graceUntil && graceUntil > new Date();

  const daysLeft = inGrace
    ? Math.max(0, Math.ceil((graceUntil - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const toast = (msg, type = 'success') => onToast && onToast(msg, type);

  const handleJoin = async () => {
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/telegram/join-vip');
      if (res.data?.already_member) {
        setJoined(true);
        toast(t('vip.already_member', "You're already in the VIP group."));
        return;
      }
      const link = res.data?.invite_link;
      if (link) {
        toast(t('vip.link_opened', 'Opening Telegram invite link...'));
        window.location.href = link;
      } else {
        toast(t('vip.link_failed', 'Could not get invite link.'), 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || t('vip.join_failed', 'Failed to join VIP group.');
      toast(typeof msg === 'string' ? msg : 'Join failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title={t('vip.section_title', 'Telegram VIP Group')}>
      <div className="p-4 sm:p-5">

        {/* Grace-period warning banner */}
        {inGrace && (
          <div className="mb-4 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-amber-300 text-xs font-semibold">
                  {t('vip.grace_title', 'Subscription expired')}
                </p>
                <p className="text-amber-200/70 text-[11px] mt-0.5 leading-relaxed">
                  {t('vip.grace_desc', "You'll be removed from the VIP group in")} {daysLeft} {daysLeft === 1 ? t('vip.day', 'day') : t('vip.days', 'days')}. {t('vip.grace_renew', 'Renew to keep your access.')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,136,204,0.06)', border: '1px solid rgba(0,136,204,0.2)' }}>
              <TelegramIcon />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-text-primary text-xs font-medium">{t('vip.name', 'VIP Signal Group')}</p>
              {inGroup ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-400/80 text-[10px] font-mono truncate">{t('vip.member', 'Member')}</p>
                </div>
              ) : (
                <p className="text-text-muted/50 text-[10px] font-mono mt-0.5">
                  {t('vip.desc', 'Real-time signals & alerts on Telegram')}
                </p>
              )}
            </div>
          </div>

          {/* Action button — conditional */}
          <div className="flex-shrink-0">
            {!hasAccess ? (
              <span className="px-2.5 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider text-text-muted/50 border border-white/[0.06]">
                {t('vip.need_sub', 'Subscribe')}
              </span>
            ) : inGroup ? (
              <span className="px-2.5 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider text-emerald-400/70 border border-emerald-500/15 bg-emerald-500/5">
                {t('vip.joined', 'Joined')}
              </span>
            ) : !telegramLinked ? (
              <span className="px-2.5 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider text-amber-400/70 border border-amber-500/20 bg-amber-500/5">
                {t('vip.link_first', 'Link TG first')}
              </span>
            ) : (
              <button onClick={handleJoin} disabled={loading}
                className="px-3 py-1.5 rounded-md font-mono text-[9px] uppercase tracking-wider font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0088cc, #006699)', color: 'rgb(var(--fg))', border: '1px solid rgba(0,136,204,0.3)' }}>
                {loading
                  ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mx-3" />
                  : t('vip.join', 'Join Group')}
              </button>
            )}
          </div>
        </div>

        {/* Helper text for "link first" state */}
        {hasAccess && !telegramLinked && !inGroup && (
          <p className="text-text-muted/40 text-[10px] mt-3 leading-relaxed">
            {t('vip.link_first_hint', 'Connect your Telegram account above, then come back to join the VIP group.')}
          </p>
        )}
      </div>
    </Section>
  );
};

export default VipGroupCard;
