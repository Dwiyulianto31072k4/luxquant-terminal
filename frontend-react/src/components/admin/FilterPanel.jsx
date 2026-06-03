// src/components/admin/FilterPanel.jsx
//
// Collapsible filter panel for the Users table.
// Rebuilt on top of design system primitives.
//

import { useState } from 'react';
import { FilterIcon, ChevronDownIcon, XCircleIcon } from './Icons';
import { Select } from './primitives';
import { palette, surface, tint, motion } from './designSystem';

const FILTER_KEYS = ['role', 'status', 'provider', 'activity', 'reach'];

export const FilterPanel = ({ filters, onChange, onReset, stats }) => {
  const [expanded, setExpanded] = useState(false);

  const activeCount = FILTER_KEYS.filter((k) => filters[k]).length;
  const update = (key) => (value) => onChange({ ...filters, [key]: value });

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: surface.base.bg,
        border: `1px solid ${surface.base.border}`,
        borderRadius: '12px',
      }}
    >
      {/* Top hairline */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent)',
        }}
      />

      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ transition: motion.base }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-2.5">
          <FilterIcon size={14} style={{ color: activeCount > 0 ? palette.gold[300] : '#8a7a6e' }} />
          <span className="text-xs font-semibold text-white tracking-tight">Filters</span>
          {activeCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{
                background: tint(palette.gold[300], 0.15),
                color: palette.gold[300],
                border: `1px solid ${tint(palette.gold[300], 0.3)}`,
              }}
            >
              {activeCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider"
              style={{
                color: palette.red[400],
                background: tint(palette.red[400], 0.06),
                border: `1px solid ${tint(palette.red[400], 0.2)}`,
                transition: motion.base,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = tint(palette.red[400], 0.14))}
              onMouseLeave={(e) => (e.currentTarget.style.background = tint(palette.red[400], 0.06))}
            >
              <XCircleIcon size={10} />
              Clear all
            </button>
          )}
          <ChevronDownIcon
            size={14}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            style={{ color: '#8a7a6e' }}
          />
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-3"
          style={{ borderTop: `1px solid ${surface.base.border}` }}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <Select
              label="Role"
              value={filters.role}
              onChange={update('role')}
              options={[
                { value: null, label: 'All Roles' },
                { value: 'free', label: 'Free' },
                { value: 'subscriber', label: 'Subscriber' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
            <Select
              label="Status"
              value={filters.status}
              onChange={update('status')}
              options={[
                { value: null, label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Banned' },
                { value: 'expiring', label: 'Expiring (7d)' },
                { value: 'expired', label: 'Expired' },
              ]}
            />
            <Select
              label="Auth Provider"
              value={filters.provider}
              onChange={update('provider')}
              options={[
                { value: null, label: 'All Providers' },
                { value: 'google', label: 'Google' },
                { value: 'telegram', label: 'Telegram' },
                { value: 'discord', label: 'Discord' },
                { value: 'local', label: 'Email / Local' },
              ]}
            />
            <Select
              label="Activity"
              value={filters.activity}
              onChange={update('activity')}
              options={[
                { value: null, label: 'All Activity' },
                { value: 'active_7d', label: 'Active (last 7d)' },
                { value: 'power_users', label: 'Power users (5+ days/wk)' },
                { value: 'dormant_30d', label: 'Dormant (>30d)' },
                { value: 'never_logged_in', label: 'Never active' },
              ]}
            />
            <Select
              label="Contact Reach"
              value={filters.reach}
              onChange={update('reach')}
              options={[
                { value: null, label: 'All Reach' },
                {
                  value: 'has_tg',
                  label: `Has Telegram${stats ? ` (${stats.telegram_reachable})` : ''}`,
                },
                {
                  value: 'has_dc',
                  label: `Has Discord${stats ? ` (${stats.discord_reachable})` : ''}`,
                },
                {
                  value: 'has_email',
                  label: `Has Email${stats ? ` (${stats.email_reachable})` : ''}`,
                },
                {
                  value: 'admin_enriched',
                  label: `Admin-enriched${stats ? ` (${stats.admin_enriched})` : ''}`,
                },
                {
                  value: 'unreachable',
                  label: `Unreachable${stats ? ` (${stats.unreachable})` : ''}`,
                },
              ]}
            />
            <Select
              label="Sort By"
              value={filters.sortBy}
              onChange={update('sortBy')}
              options={[
                { value: 'created_at', label: 'Date Joined' },
                { value: 'last_active_at', label: 'Last Active' },
                { value: 'last_login_at', label: 'Last Login' },
                { value: 'username', label: 'Username' },
                { value: 'subscription_expires_at', label: 'Expiry Date' },
                { value: 'role', label: 'Role' },
              ]}
            />
            <Select
              label="Order"
              value={filters.sortOrder}
              onChange={update('sortOrder')}
              options={[
                { value: 'desc', label: 'Newest First' },
                { value: 'asc', label: 'Oldest First' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};
