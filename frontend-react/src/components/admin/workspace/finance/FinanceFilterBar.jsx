// ════════════════════════════════════════════════════════════════════
// Finance Filter Bar — self-contained
// v2: + exchange dropdown (filter by receiving wallet provider)
// ════════════════════════════════════════════════════════════════════

import { SearchIcon, CloseIcon } from '../../Icons';

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'pending',   label: 'Pending' },
  { value: 'stale',     label: 'Stale (Pending > 24h)' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed',    label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired',   label: 'Expired' },
  { value: 'refunded',  label: 'Refunded' },
];

const SORT_OPTIONS = [
  { value: 'created_at:desc',  label: 'Newest first' },
  { value: 'created_at:asc',   label: 'Oldest first' },
  { value: 'amount:desc',      label: 'Highest amount' },
  { value: 'amount:asc',       label: 'Lowest amount' },
  { value: 'verified_at:desc', label: 'Recently verified' },
];

/* ── Inline primitives ────────────────────────────────────────────── */

const fieldBg = 'rgba(0,0,0,0.28)';
const fieldBorder = 'rgba(255,255,255,0.06)';
const fieldBorderActive = 'rgba(212,168,83,0.35)';

const Input = ({ value, onChange, placeholder, hasIcon, onClear }) => (
  <div className="relative w-full">
    {hasIcon && (
      <SearchIcon
        size={13}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: '#6b5c52' }}
      />
    )}
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full ${onClear ? 'pr-8' : 'pr-3'} py-2 rounded-lg text-xs text-white focus:outline-none focus:ring-1 transition-all ${hasIcon ? 'pl-9' : 'pl-3'}`}
      style={{
        background: fieldBg,
        border: `1px solid ${value ? fieldBorderActive : fieldBorder}`,
      }}
    />
    {onClear && value && (
      <button
        onClick={onClear}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/5"
        style={{ color: '#8a7a6e' }}
        title="Clear search"
        aria-label="Clear search"
      >
        <CloseIcon size={11} />
      </button>
    )}
  </div>
);

const SelectBox = ({ value, onChange, options, highlight, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`px-3 py-2 rounded-lg text-xs text-white focus:outline-none cursor-pointer ${className}`}
    style={{
      background: fieldBg,
      border: `1px solid ${highlight ? fieldBorderActive : fieldBorder}`,
    }}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value} style={{ background: '#1a0f0d', color: '#fff' }}>
        {opt.label}
      </option>
    ))}
  </select>
);

/* ── Main ─────────────────────────────────────────────────────────── */

export const FinanceFilterBar = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sortBy,
  sortOrder,
  onSortChange,
  resultCount,
  // v2: exchange filter
  exchangeFilter = '',
  onExchangeChange,
  exchangeOptions = [],
}) => {
  const hasFilters = !!(search || statusFilter || exchangeFilter);
  const sortValue = `${sortBy}:${sortOrder}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Input
            value={search}
            onChange={onSearchChange}
            placeholder="Search by username, email, or TX hash…"
            hasIcon
            onClear={() => onSearchChange('')}
          />
        </div>

        <SelectBox
          value={statusFilter}
          onChange={onStatusChange}
          options={STATUS_OPTIONS}
          highlight={!!statusFilter}
          className="min-w-[180px]"
        />

        {exchangeOptions.length > 0 && onExchangeChange && (
          <SelectBox
            value={exchangeFilter}
            onChange={onExchangeChange}
            options={[
              { value: '', label: 'All Exchanges' },
              ...exchangeOptions.map((e) => ({ value: e, label: e })),
            ]}
            highlight={!!exchangeFilter}
            className="min-w-[150px]"
          />
        )}

        <SelectBox
          value={sortValue}
          onChange={(v) => {
            const [sb, so] = v.split(':');
            onSortChange(sb, so);
          }}
          options={SORT_OPTIONS}
          className="min-w-[160px]"
        />

        {hasFilters && (
          <button
            onClick={() => {
              onSearchChange('');
              onStatusChange('');
              if (onExchangeChange) onExchangeChange('');
            }}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap"
            style={{
              color: '#f87171',
              background: 'rgba(248,113,113,0.06)',
              border: '1px solid rgba(248,113,113,0.22)',
            }}
          >
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {resultCount != null && (
        <p className="text-[10.5px]" style={{ color: '#6b5c52' }}>
          {hasFilters ? (
            <>
              <span style={{ color: '#c9b59e' }} className="tabular-nums font-semibold">
                {resultCount.toLocaleString()}
              </span>{' '}
              {resultCount === 1 ? 'payment matches' : 'payments match'} your filters
            </>
          ) : (
            <>
              <span style={{ color: '#c9b59e' }} className="tabular-nums font-semibold">
                {resultCount.toLocaleString()}
              </span>{' '}
              {resultCount === 1 ? 'payment' : 'payments'} total
            </>
          )}
        </p>
      )}
    </div>
  );
};
