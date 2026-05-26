// src/components/admin/FilterPanel.jsx
import { useState } from 'react';
import { FilterIcon, ChevronDownIcon } from './Icons';

const FilterSelect = ({ label, value, onChange, options }) => (
  <div>
    <label
      className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {label}
    </label>
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none cursor-pointer transition-colors"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${value ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value || '__all'} value={opt.value || ''}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

/**
 * Collapsible filter panel.
 *
 * Props:
 *   filters: { role, status, provider, activity, reach, sortBy, sortOrder }
 *   onChange, onReset, stats?
 */
export const FilterPanel = ({ filters, onChange, onReset, stats }) => {
  const [expanded, setExpanded] = useState(false);

  const activeCount = ['role', 'status', 'provider', 'activity', 'reach'].filter(
    (k) => filters[k]
  ).length;

  const update = (key) => (value) => onChange({ ...filters, [key]: value });

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2.5">
          <FilterIcon size={14} style={{ color: '#8a7a6e' }} />
          <span className="text-xs font-semibold text-white tracking-tight">Filters</span>
          {activeCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{
                background: 'rgba(212,168,83,0.15)',
                color: '#d4a853',
                border: '1px solid rgba(212,168,83,0.3)',
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
              className="text-[10px] px-2 py-1 rounded font-semibold transition-colors uppercase tracking-wider"
              style={{
                color: '#f87171',
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.18)',
              }}
            >
              Reset
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
          className="px-4 pb-4 pt-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
            <FilterSelect
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
            <FilterSelect
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
            <FilterSelect
              label="Auth Provider"
              value={filters.provider}
              onChange={update('provider')}
              options={[
                { value: null, label: 'All Providers' },
                { value: 'google', label: 'Google' },
                { value: 'telegram', label: 'Telegram' },
                { value: 'discord', label: 'Discord' },
                { value: 'local', label: 'Local / Email' },
              ]}
            />
            <FilterSelect
              label="Activity"
              value={filters.activity}
              onChange={update('activity')}
              options={[
                { value: null, label: 'All' },
                { value: 'active_7d', label: 'Active (7 days)' },
                { value: 'dormant_30d', label: 'Dormant (>30d)' },
                { value: 'never_logged_in', label: 'Never logged in' },
              ]}
            />
            <FilterSelect
              label="Contact Reach"
              value={filters.reach}
              onChange={update('reach')}
              options={[
                { value: null, label: 'All' },
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
            <FilterSelect
              label="Sort By"
              value={filters.sortBy}
              onChange={update('sortBy')}
              options={[
                { value: 'created_at', label: 'Date Joined' },
                { value: 'last_login_at', label: 'Last Login' },
                { value: 'username', label: 'Username' },
                { value: 'subscription_expires_at', label: 'Expiry Date' },
                { value: 'role', label: 'Role' },
              ]}
            />
            <FilterSelect
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
