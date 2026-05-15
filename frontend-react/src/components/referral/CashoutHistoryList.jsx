// frontend-react/src/components/referral/CashoutHistoryList.jsx
import { useState } from 'react';
import { referralApi } from '../../services/referralApi';

/**
 * CashoutHistoryList
 *
 * Displays user's cashout request history with status badges + cancel action for pending.
 *
 * Props:
 *   items: Array of cashout objects
 *   onUpdate: () => void  // Refresh callback after cancel
 *   onEmpty: ReactNode  // Optional custom empty state
 */

const STATUS_CONFIG = {
  pending: {
    bg: 'rgba(251,191,36,0.12)',
    border: 'rgba(251,191,36,0.3)',
    color: '#fbbf24',
    label: 'Pending Review',
    description: 'Admin will contact you on Telegram',
  },
  approved: {
    bg: 'rgba(96,165,250,0.12)',
    border: 'rgba(96,165,250,0.3)',
    color: '#60a5fa',
    label: 'Approved',
    description: 'Admin is processing your payment',
  },
  completed: {
    bg: 'rgba(74,222,128,0.12)',
    border: 'rgba(74,222,128,0.3)',
    color: '#4ade80',
    label: 'Completed',
    description: 'Funds sent successfully',
  },
  rejected: {
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
    color: '#f87171',
    label: 'Rejected',
    description: 'Balance has been refunded',
  },
  cancelled: {
    bg: 'rgba(148,163,184,0.12)',
    border: 'rgba(148,163,184,0.3)',
    color: '#94a3b8',
    label: 'Cancelled',
    description: 'You cancelled this request',
  },
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
};

// ════════════════════════════════════════════════
// Single Cashout Row
// ════════════════════════════════════════════════

const CashoutRow = ({ item, onUpdate }) => {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
  const canCancel = item.status === 'pending';

  const handleCancel = async () => {
    if (!window.confirm('Cancel cashout ini? Saldo akan dikembalikan ke balance kamu.')) {
      return;
    }

    setCancelling(true);
    setError('');

    try {
      await referralApi.cancelCashout(item.id);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal cancel cashout');
      setCancelling(false);
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: 'rgba(15,8,10,0.5)',
        border: '1px solid rgba(212,168,83,0.06)',
      }}
    >
      {/* Main Row */}
      <div
        className="p-4 sm:p-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left: Amount + Date */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-xs" style={{ color: '#6b5c52' }}>$</span>
              <span
                className="text-xl sm:text-2xl font-bold tabular-nums"
                style={{ color: '#e8d9c7', fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {Number(item.amount_usdt).toFixed(2)}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#d4a853' }}>
                USDT
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: '#8a7a6e' }}>
              <span>#{item.id}</span>
              <span style={{ color: '#534a42' }}>·</span>
              <span>{formatRelativeTime(item.requested_at)}</span>
              {item.destination_telegram && (
                <>
                  <span style={{ color: '#534a42' }}>·</span>
                  <span style={{ color: '#d4a853' }}>@{item.destination_telegram}</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Status Badge */}
          <div className="flex flex-col items-end gap-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
              style={{
                background: status.bg,
                border: `1px solid ${status.border}`,
                color: status.color,
              }}
            >
              {status.label}
            </span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              style={{ color: '#6b5c52' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* Status description */}
        <p className="text-[11px] mt-2.5 leading-relaxed" style={{ color: '#8a7a6e' }}>
          {status.description}
        </p>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div
          className="px-4 sm:px-5 py-4 border-t"
          style={{
            borderColor: 'rgba(212,168,83,0.06)',
            background: 'rgba(10,5,6,0.4)',
          }}
        >
          <div className="space-y-3 text-xs">
            {/* Requested at */}
            <DetailRow label="Requested" value={formatDate(item.requested_at)} />

            {/* Reviewed at */}
            {item.reviewed_at && (
              <DetailRow label="Reviewed" value={formatDate(item.reviewed_at)} />
            )}

            {/* Completed at */}
            {item.completed_at && (
              <DetailRow label="Completed" value={formatDate(item.completed_at)} />
            )}

            {/* Method */}
            <DetailRow label="Method" value="Telegram Admin" />

            {/* Destination */}
            {item.destination_telegram && (
              <DetailRow
                label="Telegram"
                value={`@${item.destination_telegram}`}
                mono
              />
            )}

            {/* User note */}
            {item.destination_note && (
              <DetailRow label="Your note" value={item.destination_note} />
            )}

            {/* Admin note */}
            {item.admin_note && (
              <DetailRow
                label="Admin note"
                value={item.admin_note}
                highlight={item.status === 'rejected'}
              />
            )}

            {/* TX hash */}
            {item.tx_hash && (
              <DetailRow label="TX Hash" value={item.tx_hash} mono />
            )}
          </div>

          {/* Cancel Button (only for pending) */}
          {canCancel && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(212,168,83,0.06)' }}>
              {error && (
                <p className="text-[11px] mb-2" style={{ color: '#f87171' }}>
                  {error}
                </p>
              )}
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full py-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Request (refund balance)'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DetailRow = ({ label, value, mono = false, highlight = false }) => (
  <div className="flex items-start justify-between gap-3">
    <span
      className="font-semibold uppercase tracking-wider text-[10px] flex-shrink-0 pt-0.5"
      style={{ color: '#6b5c52' }}
    >
      {label}
    </span>
    <span
      className={`text-right flex-1 min-w-0 break-all ${mono ? 'font-mono' : ''}`}
      style={{
        color: highlight ? '#f87171' : '#a09080',
        fontSize: mono ? '11px' : '12px',
      }}
    >
      {value}
    </span>
  </div>
);

// ════════════════════════════════════════════════
// Main List Component
// ════════════════════════════════════════════════

const CashoutHistoryList = ({ items = [], onUpdate, onEmpty }) => {
  if (!items || items.length === 0) {
    if (onEmpty) return onEmpty;

    return (
      <div className="text-center py-12">
        <div
          className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3"
          style={{
            background: 'rgba(212,168,83,0.06)',
            border: '1px solid rgba(212,168,83,0.12)',
          }}
        >
          <svg
            className="w-5 h-5"
            style={{ color: '#6b5c52' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-sm font-semibold mb-1" style={{ color: '#b8a89a' }}>
          No cashout requests yet
        </p>
        <p className="text-xs" style={{ color: '#6b5c52' }}>
          Submit your first request to withdraw balance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CashoutRow key={item.id} item={item} onUpdate={onUpdate} />
      ))}
    </div>
  );
};

export default CashoutHistoryList;
