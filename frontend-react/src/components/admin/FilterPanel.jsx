// src/components/admin/FilterPanel.jsx
import { useState } from 'react';

const FilterSelect = ({ label, value, onChange, options, icon }) => (
  <div>
    <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b5c52' }}>
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </label>
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none cursor-pointer transition-all"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${value ? 'rgba(212,168,83,0.4)' : 'rgba(255,255,255,0.06)'}`,
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
 *   onChange: (newFilters) => void
 *   onReset: () => void
 *   stats?: optional contact stats object for showing counts in reach options
 */
export const FilterPanel = ({ filters, onChange, onReset, stats }) => {
  const [expanded, setExpanded] = useState(false);

  // Count active filters (excludes sort which is always set)
  const activeCount = ['role', 'status', 'provider', 'activity', 'reach'].filter(
    (k) => filters[k]
  ).length;

  const update = (key) => (value) => onChange({ ...filters, [key]: value });

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: '#8a7a6e' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-semibold text-white">Filters</span>
          {activeCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(212,168,83,0.2)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.3)' }}
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
              className="text-[11px] px-2 py-1 rounded font-medium transition-colors"
              style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              Reset
            </button>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            style={{ color: '#8a7a6e' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Panel body */}
      {expanded && (
        <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <FilterSelect
              label="Role"
              icon="🛡️"
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
              icon="🟢"
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
              icon="🔐"
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
              icon="⚡"
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
              icon="📡"
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
              icon="↕"
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
              icon="🔃"
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
