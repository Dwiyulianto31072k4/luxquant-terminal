// ════════════════════════════════════════════════════════════════════
// Finance domain helpers
// Shared utilities used across FinanceTab + PaymentDetailPanel.
// v2: + exchangeColor helper for wallet exchange badges.
// ════════════════════════════════════════════════════════════════════

/* ── Formatting ─────────────────────────────────────────────────── */

export const formatUSDT = (val) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatUSDTCompact = (val) => {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1000).toFixed(1)}K`;
  return formatUSDT(n);
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTimeLong = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatRelative = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 7) return `${days}d ago`;
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${mins % 60}m ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
};

export const shortHash = (hash) => {
  if (!hash) return '—';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
};

/* ── Status configuration ───────────────────────────────────────── */

export const STATUS_CONFIG = {
  pending:   { color: '#fbbf24', label: 'Pending',   bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.30)' },
  confirmed: { color: '#34d399', label: 'Confirmed', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.30)' },
  cancelled: { color: '#8a7a6e', label: 'Cancelled', bg: 'rgba(138,122,110,0.10)', border: 'rgba(138,122,110,0.30)' },
  failed:    { color: '#f87171', label: 'Failed',    bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)' },
  expired:   { color: '#a78bfa', label: 'Expired',   bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)' },
  refunded:  { color: '#fb923c', label: 'Refunded',  bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.30)' },
};

export const getStatusConfig = (status) =>
  STATUS_CONFIG[status] || STATUS_CONFIG.pending;

/* ── Role tint (for user badge in panel) ────────────────────────── */

export const roleStyle = (role) => {
  const isPaid = role === 'subscriber' || role === 'premium' || role === 'admin';
  return {
    background: isPaid ? 'rgba(52,211,153,0.10)' : 'rgba(107,92,82,0.12)',
    color: isPaid ? '#34d399' : '#8a7a6e',
  };
};

/* ── Exchange badge color ───────────────────────────────────────── */

const EXCHANGE_PALETTE = [
  '#f3ba2f', // amber (Binance-ish)
  '#3375bb', // blue
  '#34d399', // green
  '#a78bfa', // violet
  '#fb923c', // orange
  '#60a5fa', // sky
  '#f87171', // red
  '#d4a853', // gold
];

// Deterministic color from exchange name (stable per name across renders)
export const exchangeColor = (name) => {
  if (!name) return '#8a7a6e';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EXCHANGE_PALETTE[Math.abs(hash) % EXCHANGE_PALETTE.length];
};
