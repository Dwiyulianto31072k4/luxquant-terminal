// src/components/admin/workspace/PaymentDetailPanel.jsx
//
// Slide-in panel showing full payment detail with all admin actions:
// approve / mark-failed / cancel / refund / add note + BSCScan data viewer.

import { useState, useEffect } from 'react';
import { SidePanel } from './SidePanel';
import { financeApi } from '../../../services/financeApi';
import {
  TrendingUpIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  ExternalLinkIcon,
  CopyIcon,
  UserIcon,
  ClockIcon,
  EditIcon,
} from '../Icons';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

const formatUSDT = (val) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const STATUS_CONFIG = {
  pending:   { color: '#fbbf24', label: 'Pending',   bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
  confirmed: { color: '#34d399', label: 'Confirmed', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
  cancelled: { color: '#8a7a6e', label: 'Cancelled', bg: 'rgba(138,122,110,0.1)', border: 'rgba(138,122,110,0.3)' },
  failed:    { color: '#f87171', label: 'Failed',    bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
  expired:   { color: '#a78bfa', label: 'Expired',   bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  refunded:  { color: '#fb923c', label: 'Refunded',  bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)' },
};

// ════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════

const Section = ({ title, children }) => (
  <div className="space-y-2">
    <p
      className="text-[9px] uppercase tracking-wider font-bold"
      style={{ color: 'rgba(255,255,255,0.35)' }}
    >
      {title}
    </p>
    {children}
  </div>
);

const InfoRow = ({ label, value, mono = false, copyable = false, onCopy }) => (
  <div className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    <span className="text-[10px] uppercase tracking-wider" style={{ color: '#6b5c52' }}>
      {label}
    </span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`text-xs text-white truncate text-right ${mono ? 'font-mono tabular-nums' : ''}`}
        title={typeof value === 'string' ? value : ''}
      >
        {value ?? '—'}
      </span>
      {copyable && value && (
        <button
          onClick={() => onCopy(value)}
          className="p-1 rounded transition-colors shrink-0"
          style={{ color: '#6b5c52' }}
          title="Copy"
        >
          <CopyIcon size={10} />
        </button>
      )}
    </div>
  </div>
);

const ActionButton = ({ Icon, label, color, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
    style={{
      background: `${color}15`,
      color,
      border: `1px solid ${color}30`,
    }}
  >
    <Icon size={11} />
    {label}
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Main Panel
// ════════════════════════════════════════════════════════════════════

export const PaymentDetailPanel = ({ isOpen, onClose, paymentSummary, onActionDone }) => {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // 'approve' | 'fail' | etc
  const [showBscscan, setShowBscscan] = useState(false);

  // For action note input
  const [showNoteInput, setShowNoteInput] = useState(null); // type of action requiring note
  const [actionNote, setActionNote] = useState('');

  // For "add note only" action
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState('');

  const [error, setError] = useState(null);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setPayment(null);
      setShowBscscan(false);
      setShowNoteInput(null);
      setActionNote('');
      setShowAddNote(false);
      setNewNote('');
      setError(null);
    }
  }, [isOpen]);

  // Fetch full payment detail when panel opens
  useEffect(() => {
    if (!isOpen || !paymentSummary?.id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    financeApi
      .getPayment(paymentSummary.id)
      .then((data) => {
        if (!cancelled) setPayment(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.response?.data?.detail || 'Gagal load detail');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, paymentSummary?.id]);

  // ── Action handlers ──
  const performAction = async (actionType, note = null) => {
    if (!payment) return;
    setActionLoading(actionType);
    setError(null);

    try {
      let result;
      switch (actionType) {
        case 'approve':
          result = await financeApi.approvePayment(payment.id, note);
          break;
        case 'fail':
          result = await financeApi.markFailed(payment.id, note);
          break;
        case 'cancel':
          result = await financeApi.cancelPayment(payment.id, note);
          break;
        case 'refund':
          result = await financeApi.refundPayment(payment.id, note);
          break;
        default:
          throw new Error('Unknown action');
      }
      if (result?.payment) setPayment(result.payment);
      setShowNoteInput(null);
      setActionNote('');
      if (onActionDone) onActionDone();
    } catch (e) {
      setError(e.response?.data?.detail || 'Action gagal');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = () => {
    if (!window.confirm(`Approve payment #${payment.id}?\n\nUser @${payment.user?.username} akan auto-granted subscription.`)) return;
    performAction('approve');
  };

  const handleAddNoteOnly = async () => {
    if (!newNote.trim() || !payment) return;
    setActionLoading('note');
    setError(null);
    try {
      const result = await financeApi.addNote(payment.id, newNote.trim());
      if (result?.payment) setPayment(result.payment);
      setNewNote('');
      setShowAddNote(false);
      if (onActionDone) onActionDone();
    } catch (e) {
      setError(e.response?.data?.detail || 'Gagal add note');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(String(text)).catch(() => {});
  };

  // Use summary while loading full detail
  const p = payment || paymentSummary;
  const stat = p ? STATUS_CONFIG[p.status] || STATUS_CONFIG.pending : null;
  const isPending = p?.status === 'pending';
  const isConfirmed = p?.status === 'confirmed';

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={p ? `Payment #${p.id}` : 'Payment Detail'}
      subtitle={p?.user ? `@${p.user.username}` : ''}
      Icon={TrendingUpIcon}
      width="lg"
    >
      {loading && !payment ? (
        <div className="flex items-center justify-center py-12">
          <div className="inline-flex items-center gap-2 text-xs" style={{ color: '#6b5c52' }}>
            <div
              className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }}
            />
            Loading...
          </div>
        </div>
      ) : !p ? (
        <p className="text-center text-xs py-8" style={{ color: '#6b5c52' }}>
          No payment selected
        </p>
      ) : (
        <div className="space-y-4">
          {/* Hero: status + amount */}
          <div
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${stat.border}`,
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background: `linear-gradient(to right, transparent, ${stat.color}50, transparent)`,
              }}
            />
            <div className="flex items-start justify-between gap-3 mb-2">
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: stat.bg, color: stat.color, border: `1px solid ${stat.border}` }}
              >
                {stat.label}
              </span>
              {p.is_stale && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1"
                  style={{
                    background: 'rgba(248,113,113,0.08)',
                    color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.25)',
                  }}
                >
                  <AlertTriangleIcon size={9} /> STALE {p.age_hours}h
                </span>
              )}
            </div>
            <p
              className="text-3xl font-light tabular-nums tracking-tight"
              style={{ color: '#fff' }}
            >
              {formatUSDT(p.final_amount)}
            </p>
            <p className="text-[10px] mt-1" style={{ color: '#6b5c52' }}>
              {p.network} · {p.plan?.name || `Plan #${p.plan_id}`}
            </p>
          </div>

          {/* Actions row — for pending */}
          {isPending && (
            <Section title="Actions">
              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  Icon={CheckCircleIcon}
                  label="Approve"
                  color="#34d399"
                  onClick={handleApprove}
                  disabled={actionLoading != null}
                />
                <ActionButton
                  Icon={AlertTriangleIcon}
                  label="Mark Failed"
                  color="#f87171"
                  onClick={() => setShowNoteInput('fail')}
                  disabled={actionLoading != null}
                />
                <ActionButton
                  Icon={CloseIcon}
                  label="Cancel"
                  color="#8a7a6e"
                  onClick={() => setShowNoteInput('cancel')}
                  disabled={actionLoading != null}
                />
                <ActionButton
                  Icon={EditIcon}
                  label="Add Note"
                  color="#d4a853"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionLoading != null}
                />
              </div>
            </Section>
          )}

          {/* Actions for confirmed */}
          {isConfirmed && (
            <Section title="Actions">
              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  Icon={CloseIcon}
                  label="Refund"
                  color="#fb923c"
                  onClick={() => setShowNoteInput('refund')}
                  disabled={actionLoading != null}
                />
                <ActionButton
                  Icon={EditIcon}
                  label="Add Note"
                  color="#d4a853"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionLoading != null}
                />
              </div>
            </Section>
          )}

          {/* Actions for terminal status */}
          {!isPending && !isConfirmed && (
            <Section title="Actions">
              <ActionButton
                Icon={EditIcon}
                label="Add Note"
                color="#d4a853"
                onClick={() => setShowAddNote(true)}
                disabled={actionLoading != null}
              />
            </Section>
          )}

          {/* Note input for risky actions */}
          {showNoteInput && (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.25)',
              }}
            >
              <p className="text-xs font-semibold" style={{ color: '#f87171' }}>
                {showNoteInput === 'fail' && 'Mark as Failed — confirm + add note'}
                {showNoteInput === 'cancel' && 'Cancel Payment — confirm + add note'}
                {showNoteInput === 'refund' && 'Refund Payment — confirm + add note'}
              </p>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Alasan (optional)..."
                rows={2}
                className="w-full px-2.5 py-1.5 rounded text-xs text-white focus:outline-none resize-none"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowNoteInput(null);
                    setActionNote('');
                  }}
                  className="flex-1 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => performAction(showNoteInput, actionNote.trim() || null)}
                  disabled={actionLoading != null}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{
                    background: 'rgba(248,113,113,0.25)',
                    color: '#f87171',
                    border: '1px solid rgba(248,113,113,0.4)',
                  }}
                >
                  {actionLoading === showNoteInput ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {/* Add note only */}
          {showAddNote && (
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                background: 'rgba(212,168,83,0.06)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <p className="text-xs font-semibold" style={{ color: '#d4a853' }}>
                Add Note
              </p>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Catatan untuk audit trail..."
                rows={2}
                className="w-full px-2.5 py-1.5 rounded text-xs text-white focus:outline-none resize-none"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAddNote(false);
                    setNewNote('');
                  }}
                  className="flex-1 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNoteOnly}
                  disabled={!newNote.trim() || actionLoading === 'note'}
                  className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #d4a853, #8b6914)',
                    color: '#0a0506',
                  }}
                >
                  {actionLoading === 'note' ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.25)',
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* User info */}
          <Section title="User">
            <div
              className="rounded-lg p-2.5 space-y-1"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}
                >
                  {p.user?.username?.charAt(0).toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    @{p.user?.username || 'unknown'}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: '#6b5c52' }}>
                    {p.user?.email} · ID #{p.user_id}
                  </p>
                </div>
                <span
                  className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: p.user?.role === 'subscriber' || p.user?.role === 'premium'
                      ? 'rgba(52,211,153,0.1)'
                      : 'rgba(107,92,82,0.12)',
                    color: p.user?.role === 'subscriber' || p.user?.role === 'premium'
                      ? '#34d399'
                      : '#8a7a6e',
                  }}
                >
                  {p.user?.role || 'free'}
                </span>
              </div>
            </div>
          </Section>

          {/* Financial breakdown */}
          <Section title="Financial Breakdown">
            <div
              className="rounded-lg px-3 py-1"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <InfoRow label="Plan" value={p.plan?.name || `#${p.plan_id}`} />
              <InfoRow label="Amount USDT" value={formatUSDT(p.amount_usdt)} mono />
              {p.discount_amount > 0 && (
                <InfoRow label="Discount" value={`-${formatUSDT(p.discount_amount)}`} mono />
              )}
              {p.credit_redeemed > 0 && (
                <InfoRow label="Credit redeemed" value={`-${formatUSDT(p.credit_redeemed)}`} mono />
              )}
              <InfoRow label="Final amount" value={formatUSDT(p.final_amount)} mono />
            </div>
          </Section>

          {/* Transaction details */}
          <Section title="Transaction">
            <div
              className="rounded-lg px-3 py-1"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <InfoRow label="Network" value={p.network} />
              <InfoRow
                label="TX Hash"
                value={p.tx_hash || '—'}
                mono
                copyable={!!p.tx_hash}
                onCopy={handleCopy}
              />
              {p.tx_hash && (
                <div className="py-1.5">
                  <a
                    href={`https://bscscan.com/tx/${p.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider hover:underline"
                    style={{ color: '#60a5fa' }}
                  >
                    View on BSCScan <ExternalLinkIcon size={10} />
                  </a>
                </div>
              )}
              <InfoRow
                label="Wallet from"
                value={p.wallet_from || '—'}
                mono
                copyable={!!p.wallet_from}
                onCopy={handleCopy}
              />
              <InfoRow
                label="Wallet to"
                value={p.wallet_to || '—'}
                mono
                copyable={!!p.wallet_to}
                onCopy={handleCopy}
              />
            </div>
          </Section>

          {/* Timestamps */}
          <Section title="Timestamps">
            <div
              className="rounded-lg px-3 py-1"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <InfoRow label="Created" value={formatDateTime(p.created_at)} mono />
              {p.verified_at && (
                <InfoRow label="Verified" value={formatDateTime(p.verified_at)} mono />
              )}
              {p.expires_at && (
                <InfoRow label="Expires" value={formatDateTime(p.expires_at)} mono />
              )}
              <InfoRow label="Updated" value={formatDateTime(p.updated_at)} mono />
            </div>
          </Section>

          {/* BSCScan data viewer (collapsible) */}
          {payment?.bscscan_data && (
            <Section title="BSCScan Verification Data">
              <button
                onClick={() => setShowBscscan(!showBscscan)}
                className="w-full px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider font-semibold transition-colors text-left flex items-center justify-between"
                style={{
                  background: 'rgba(96,165,250,0.06)',
                  color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.22)',
                }}
              >
                <span>{showBscscan ? 'Hide' : 'Show'} raw response</span>
                <span>{showBscscan ? '▲' : '▼'}</span>
              </button>
              {showBscscan && (
                <pre
                  className="rounded-lg p-2.5 text-[10px] font-mono overflow-x-auto max-h-60 overflow-y-auto"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    color: '#c9b59e',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {JSON.stringify(payment.bscscan_data, null, 2)}
                </pre>
              )}
            </Section>
          )}

          {/* Notes / audit trail */}
          {p.notes && (
            <Section title="Notes / Audit Trail">
              <pre
                className="rounded-lg p-2.5 text-[10px] font-mono whitespace-pre-wrap leading-relaxed"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  color: '#c9b59e',
                  border: '1px solid rgba(255,255,255,0.06)',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {p.notes}
              </pre>
            </Section>
          )}
        </div>
      )}
    </SidePanel>
  );
};
