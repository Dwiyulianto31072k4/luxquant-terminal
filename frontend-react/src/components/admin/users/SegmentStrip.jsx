// src/components/admin/users/SegmentStrip.jsx
// ════════════════════════════════════════════════════════════════════
// Prominent segment tabs above the users table. Unlike the collapsible
// FilterPanel, this is always visible — one click jumps to a customer
// segment (resets other filters for focus). Reuses the existing table.
// ════════════════════════════════════════════════════════════════════
import { palette, tint } from '../designSystem';

// Each segment maps to a filter combination. `match` builds the filter
// patch applied on click (starting from DEFAULT_FILTERS for focus).
const SEGMENTS = [
  { key: 'all',           label: 'All',           filter: {} ,                        statKey: 'total_users' },
  { key: 'subscriber',    label: 'Subscriber',    filter: { role: 'subscriber' },      statKey: 'active_subscribers' },
  { key: 'ex_subscriber', label: 'Ex-Subscriber', filter: { exSubscriber: '1' },       statKey: 'ex_subscribers' },
  { key: 'free',          label: 'Free',          filter: { role: 'free' },            statKey: 'free_users' },
  { key: 'lifetime',      label: 'Lifetime',      filter: { plan: 'lifetime' },        statKey: 'lifetime_subscribers' },
  { key: 'recurring',     label: 'Non-Lifetime',  filter: { plan: 'recurring' },       statKey: null },
];

// Determine which segment is currently active from the filters object.
const activeSegment = (filters) => {
  if (filters.exSubscriber) return 'ex_subscriber';
  if (filters.plan === 'lifetime') return 'lifetime';
  if (filters.plan === 'recurring') return 'recurring';
  if (filters.role === 'subscriber') return 'subscriber';
  if (filters.role === 'free') return 'free';
  // "all" only when nothing meaningful is set
  const anySet = ['role', 'plan', 'status', 'provider', 'activity', 'reach', 'vipState', 'anomaly', 'source', 'exSubscriber']
    .some((k) => filters[k]);
  return anySet ? null : 'all';
};

export const SegmentStrip = ({ filters, stats, defaults, onSelect }) => {
  const active = activeSegment(filters);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SEGMENTS.map((seg) => {
        const isActive = active === seg.key;
        const count = seg.statKey && stats ? stats[seg.statKey] : null;
        return (
          <button
            key={seg.key}
            onClick={() => onSelect({ ...defaults, ...seg.filter })}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'border border-ink/20 bg-ink/[0.1] text-text-primary'
                : 'border border-ink/[0.07] bg-ink/[0.025] text-text-muted hover:border-ink/12 hover:text-text-primary'
            }`}
          >
            {seg.label}
            {count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                  isActive ? 'bg-ink/[0.12] text-text-primary/80' : 'bg-ink/[0.05] text-text-muted/70'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentStrip;
