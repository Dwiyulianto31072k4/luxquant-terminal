// src/components/admin/ContactBadge.jsx
import { useState } from 'react';

/**
 * Display a single contact channel badge (TG/DC/Email).
 * Click → open deep link in new tab.
 * Shows admin-enriched indicator (✓) if source='admin'.
 *
 * Props:
 *   channel: 'telegram' | 'discord' | 'email'
 *   value: string | null
 *   deepLink: string | null
 *   source: 'admin' | 'oauth' | null
 *   compact?: boolean (table mode)
 */
export const ContactBadge = ({ channel, value, deepLink, source, compact = false }) => {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const config = {
    telegram: {
      icon: '✈️',
      label: 'TG',
      color: '#229ED9',
      bg: 'rgba(34,158,217,0.1)',
      border: 'rgba(34,158,217,0.25)',
    },
    discord: {
      icon: '💬',
      label: 'DC',
      color: '#5865F2',
      bg: 'rgba(88,101,242,0.1)',
      border: 'rgba(88,101,242,0.25)',
    },
    email: {
      icon: '✉️',
      label: 'Email',
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.1)',
      border: 'rgba(251,191,36,0.25)',
    },
  };

  const c = config[channel];
  if (!c) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (deepLink) {
      window.open(deepLink, '_blank', 'noopener,noreferrer');
    } else {
      // No deep link → copy
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (compact) {
    // Compact mode: icon-only badge for table cells
    return (
      <button
        onClick={handleClick}
        title={`${c.label}: ${value}${source === 'admin' ? ' (admin-enriched)' : ''}`}
        className="relative inline-flex items-center justify-center w-7 h-7 rounded-md text-xs transition-all hover:scale-110"
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
        }}
      >
        <span>{c.icon}</span>
        {source === 'admin' && (
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold"
            style={{
              background: '#d4a853',
              color: '#000',
              border: '1px solid #0a0506',
            }}
            title="Admin-enriched"
          >
            ✓
          </span>
        )}
      </button>
    );
  }

  // Full mode: with text + copy button
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      <span style={{ color: c.color }}>{c.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: c.color }}>
            {c.label}
          </span>
          {source === 'admin' && (
            <span
              className="text-[8px] font-bold px-1 py-0.5 rounded"
              style={{ background: 'rgba(212,168,83,0.2)', color: '#d4a853' }}
              title="Manually added by admin"
            >
              ADMIN
            </span>
          )}
          {source === 'oauth' && (
            <span
              className="text-[8px] font-bold px-1 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#6b5c52' }}
              title="From OAuth signup"
            >
              AUTO
            </span>
          )}
        </div>
        <p className="text-xs text-white truncate font-mono">{value}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        {deepLink && (
          <button
            onClick={handleClick}
            title="Open in new tab"
            className="px-2 py-1 rounded text-[10px] font-semibold transition-all hover:scale-105"
            style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
          >
            Open
          </button>
        )}
        <button
          onClick={handleCopy}
          title="Copy"
          className="px-2 py-1 rounded text-[10px] font-semibold transition-all hover:scale-105"
          style={{
            background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
            color: copied ? '#34d399' : '#8a7a6e',
            border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

/**
 * Row of contact badges (compact mode) — for table cells.
 *
 * Props:
 *   reach: { telegram: {...}, discord: {...}, email: {...} } OR
 *          user object with effective_telegram_username + telegram_username + ...
 */
export const ContactBadgeRow = ({ user, reach }) => {
  // Build channel data from either `reach` object OR user object
  const channels = reach || _buildReachFromUser(user);

  const hasAny = channels.telegram?.available || channels.discord?.available || channels.email?.available;

  if (!hasAny) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
        title="No contact channel available"
      >
        Unreachable
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {channels.telegram?.available && (
        <ContactBadge
          channel="telegram"
          value={channels.telegram.value}
          deepLink={channels.telegram.deep_link}
          source={channels.telegram.source}
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

// Helper: build reach summary from user object (for table mode, faster than calling /full)
function _buildReachFromUser(u) {
  if (!u) return { telegram: {}, discord: {}, email: {} };

  // Telegram
  let tg = { available: false, value: null, deep_link: null, source: null };
  if (u.admin_telegram_username) {
    const v = u.admin_telegram_username.replace(/^@/, '').trim();
    if (v) {
      tg = { available: true, value: v, deep_link: `https://t.me/${v}`, source: 'admin' };
    }
  } else if (u.telegram_username) {
    const v = u.telegram_username.replace(/^@/, '').trim();
    if (v) {
      tg = { available: true, value: v, deep_link: `https://t.me/${v}`, source: 'oauth' };
    }
  }

  // Discord
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

  // Email (skip placeholder)
  let em = { available: false, value: null, deep_link: null, source: null };
  if (u.email && !u.email.endsWith('@telegram.luxquant.tw') && !u.email.endsWith('@discord.luxquant.tw')) {
    em = {
      available: true,
      value: u.email,
      deep_link: `mailto:${u.email}`,
      source: 'oauth',
    };
  }

  return { telegram: tg, discord: dc, email: em };
}
