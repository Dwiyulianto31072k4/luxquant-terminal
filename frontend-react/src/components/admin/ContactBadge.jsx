// src/components/admin/ContactBadge.jsx
import { useState } from 'react';
import {
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
} from './Icons';

const CHANNEL_CONFIG = {
  telegram: {
    Icon: TelegramIcon,
    label: 'Telegram',
    short: 'TG',
    color: '#229ED9',
    bg: 'rgba(34,158,217,0.08)',
    border: 'rgba(34,158,217,0.2)',
  },
  discord: {
    Icon: DiscordIcon,
    label: 'Discord',
    short: 'DC',
    color: '#5865F2',
    bg: 'rgba(88,101,242,0.08)',
    border: 'rgba(88,101,242,0.2)',
  },
  email: {
    Icon: EmailIcon,
    label: 'Email',
    short: 'Mail',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.06)',
    border: 'rgba(251,191,36,0.18)',
  },
};

/**
 * Single contact badge (TG / DC / Email).
 *
 * Props:
 *   channel: 'telegram' | 'discord' | 'email'
 *   value, deepLink, source: 'admin' | 'oauth' | null
 *   compact?: boolean — table cell mode (icon-only chip)
 */
export const ContactBadge = ({ channel, value, deepLink, source, botReady, compact = false }) => {
  const [copied, setCopied] = useState(false);
  const cfg = CHANNEL_CONFIG[channel];
  if (!cfg || !value) return null;
  const { Icon } = cfg;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (deepLink) window.open(deepLink, '_blank', 'noopener,noreferrer');
    else handleCopy(e);
  };

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  // ─── COMPACT (table chip) ───
  if (compact) {
    return (
      <button
        onClick={handleOpen}
        title={`${cfg.label}: ${value}${source === 'admin' ? ' (admin-added)' : ''}`}
        className="relative inline-flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 hover:scale-110"
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          color: cfg.color,
        }}
      >
        <Icon size={13} colored />
        {source === 'admin' && (
          <span
            className="absolute -top-[3px] -right-[3px] w-2.5 h-2.5 rounded-full"
            style={{
              background: '#d4a853',
              boxShadow: '0 0 0 1.5px #0a0506',
            }}
            title="Admin-added"
          />
        )}
        {botReady === false && !deepLink && (
          <span
            className="absolute -bottom-[3px] -right-[3px] w-2.5 h-2.5 rounded-full"
            style={{ background: '#fbbf24', boxShadow: '0 0 0 1.5px #0a0506' }}
            title="Bot DM unconfirmed — user may not have started the bot. Reach them via in-app Announcements."
          />
        )}
      </button>
    );
  }

  // ─── FULL (drawer card) ───
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-md shrink-0"
        style={{ background: 'rgba(0,0,0,0.25)', color: cfg.color }}
      >
        <Icon size={18} colored />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          {source === 'admin' && (
            <span
              className="text-[8px] font-bold px-1.5 py-px rounded"
              style={{
                background: 'rgba(212,168,83,0.15)',
                color: '#d4a853',
                border: '1px solid rgba(212,168,83,0.25)',
              }}
            >
              ADMIN
            </span>
          )}
          {source === 'oauth' && (
            <span
              className="text-[8px] font-bold px-1.5 py-px rounded"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#6b5c52',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              OAUTH
            </span>
          )}
          {botReady === false && !deepLink && (
            <span
              className="text-[8px] font-bold px-1.5 py-px rounded"
              style={{
                background: 'rgba(251,191,36,0.12)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.25)',
              }}
              title="The bot hasn't confirmed it can DM this user. Reach them via in-app Announcements."
            >
              DM UNCONFIRMED
            </span>
          )}
        </div>
        <p className="text-xs text-white truncate font-mono tabular-nums">{value}</p>
      </div>
      <div className="flex gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
        {deepLink && (
          <button
            onClick={handleOpen}
            title="Open in new tab"
            className="flex items-center justify-center w-7 h-7 rounded transition-colors"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
          >
            <ExternalLinkIcon size={12} />
          </button>
        )}
        <button
          onClick={handleCopy}
          title="Copy"
          className="flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{
            background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
            color: copied ? '#34d399' : '#8a7a6e',
            border: `1px solid ${copied ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        </button>
      </div>
    </div>
  );
};

/** Row of compact badges (for table cells). */
export const ContactBadgeRow = ({ user, reach }) => {
  const channels = reach || _buildReachFromUser(user);
  const hasAny = channels.telegram?.available || channels.discord?.available || channels.email?.available;

  if (!hasAny) {
    return (
      <span
        className="inline-flex items-center text-[10px] px-2 py-0.5 rounded font-medium"
        style={{
          background: 'rgba(248,113,113,0.07)',
          color: '#f87171',
          border: '1px solid rgba(248,113,113,0.18)',
        }}
        title="No contact channel available"
      >
        Unreachable
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {channels.telegram?.available && (
        <ContactBadge
          channel="telegram"
          value={channels.telegram.value}
          deepLink={channels.telegram.deep_link}
          source={channels.telegram.source}
          botReady={channels.telegram.bot_ready}
          compact
        />
      )}
      {channels.discord?.available && (
        <ContactBadge
          channel="discord"
          value={channels.discord.value}
          deepLink={channels.discord.deep_link}
          source={channels.discord.source}
          compact
        />
      )}
      {channels.email?.available && (
        <ContactBadge
          channel="email"
          value={channels.email.value}
          deepLink={channels.email.deep_link}
          source={channels.email.source}
          compact
        />
      )}
    </div>
  );
};

function _buildReachFromUser(u) {
  if (!u) return { telegram: {}, discord: {}, email: {} };

  let tg = { available: false, value: null, deep_link: null, source: null };
  // Real OAuth username (refreshed on each login) is the source of truth.
  // Admin-entered handle is only a fallback when there's no real username.
  if (u.telegram_username) {
    const v = u.telegram_username.replace(/^@/, '').trim();
    if (v) tg = { available: true, value: v, deep_link: `https://t.me/${v}`, source: 'oauth' };
  } else if (u.admin_telegram_username) {
    const v = u.admin_telegram_username.replace(/^@/, '').trim();
    if (v) tg = { available: true, value: v, deep_link: `https://t.me/${v}`, source: 'admin' };
  } else if (u.telegram_id) {
    // Linked via Telegram login but no public @username → still reachable
    // through the bot (DM by chat id). No t.me deep link without a username.
    tg = { available: true, value: `id:${u.telegram_id}`, deep_link: null, source: 'oauth' };
  }
  // Bot DM readiness: confirmed if they've been DM'd before or are in the VIP
  // group. If not, a bot DM may bounce — use in-app Announcements instead.
  if (tg.available) tg.bot_ready = !!(u.telegram_in_group || u.telegram_bot_started_at);

  let dc = { available: false, value: null, deep_link: null, source: null };
  if (u.admin_discord_handle) {
    const h = u.admin_discord_handle.trim();
    if (h) {
      const dl = /^\d+$/.test(h) ? `https://discord.com/users/${h}` : null;
      dc = { available: true, value: h, deep_link: dl, source: 'admin' };
    }
  } else if (u.discord_id) {
    dc = {
      available: true,
      value: String(u.discord_id),
      deep_link: `https://discord.com/users/${u.discord_id}`,
      source: 'oauth',
    };
  }

  let em = { available: false, value: null, deep_link: null, source: null };
  if (u.email && !u.email.endsWith('@telegram.luxquant.tw') && !u.email.endsWith('@discord.luxquant.tw')) {
    em = { available: true, value: u.email, deep_link: `mailto:${u.email}`, source: 'oauth' };
  }

  return { telegram: tg, discord: dc, email: em };
}
