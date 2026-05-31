// ════════════════════════════════════════════════════════════════════
// PaymentDetailPanel — redesigned
//
// • Hero card with focal amount + status indicator
// • Required note for Fail / Cancel / Refund (audit trail)
// • Optional standalone "Add note" action
// • Tidy info sections with copyable values
// • BSCScan raw data viewer (collapsible)
// • Full English copy
// • v2: + "Received Into" row showing wallet_to exchange (Binance/Indodax/etc)
// • v3: Payment date promoted as primary timestamp (was "Verified")
//      Gap indicator if there's >1 day between payment_date and record_date
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { SidePanel } from './SidePanel';
import { financeApi } from '../../../services/financeApi';
import {
  TrendingUpIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  ExternalLinkIcon,
  CopyIcon,
  EditIcon,
} from '../Icons';
import { XCircleIcon } from './finance/icons-supplement';
import {
  formatUSDT,
  formatDateTimeLong,
  getStatusConfig,
  roleStyle,
  exchangeColor,
} from './finance/helpers';

/* ── Layout primitives (panel-local) ──────────────────────────────── */

const Section = ({ title, action, children }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <p
        className="text-[9.5px] uppercase tracking-[0.13em] font-bold"
        style={{ color: 'rgba(255,255,255,0.38)' }}
      >
        {title}
      </p>
      {action}
    </div>
    {children}
  </div>
);

const InfoBlock = ({ children }) => (
  <div
    className="rounded-lg px-3 py-1"
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    {children}
  </div>
);

const InfoRow = ({ label, value, mono = false, copyable = false, onCopy, valueColor }) => (
  <div
    className="flex items-center justify-between gap-3 py-2"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
  >
    <span
      className="text-[10px] uppercase tracking-wider shrink-0"
      style={{ color: '#6b5c52' }}
    >
      {label}
    </span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`text-[11.5px] truncate text-right ${mono ? 'font-mono tabular-nums' : ''}`}
        style={{ color: valueColor || '#fff' }}
        title={typeof value === 'string' ? value : ''}
      >
        {value ?? '—'}
      </span>
      {copyable && value && value !== '—' && (
        <button
          onClick={() => onCopy(value)}
          className="p-1 rounded transition-colors shrink-0 hover:bg-white/5"
          style={{ color: '#8a7a6e' }}
          title="Copy"
          aria-label={`Copy ${label}`}
        >
          <CopyIcon size={10} />
        </button>
      )}
    </div>
  </div>
);

/* ── Exchange row (special — shows dot + colored name) ────────────── */

const ExchangeRow = ({ exchangeName, walletLabel }) => {
  if (!exchangeName) return null;
  const c = exchangeColor(exchangeName);
  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <span
        className="text-[10px] uppercase tracking-wider shrink-0"
        style={{ color: '#6b5c52' }}
      >
        Received Into
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: c }}
        />
        <span
          className="text-[11.5px] font-semibold truncate text-right"
          style={{ color: c }}
        >
          {exchangeName}
        </span>
        {walletLabel && (
          <span
            className="text-[10px] truncate"
            style={{ color: '#8a7a6e' }}
            title={`Internal wallet label: ${walletLabel}`}
          >
            ({walletLabel})
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Action button (panel-local) ──────────────────────────────────── */

const TONE = {
  success: { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  bgHover: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,0.28)' },
  danger:  { color: '#f87171', bg: 'rgba(248,113,113,0.10)', bgHover: 'rgba(248,113,113,0.18)', border: 'rgba(248,113,113,0.28)' },
  warn:    { color: '#fb923c', bg: 'rgba(251,146,60,0.10)',  bgHover: 'rgba(251,146,60,0.18)',  border: 'rgba(251,146,60,0.28)' },
  muted:   { color: '#8a7a6e', bg: 'rgba(138,122,110,0.10)', bgHover: 'rgba(138,122,110,0.18)', border: 'rgba(138,122,110,0.25)' },
  gold:    { color: '#d4a853', bg: 'rgba(212,168,83,0.10)',  bgHover: 'rgba(212,168,83,0.18)',  border: 'rgba(212,168,83,0.28)' },
};

const ActionBtn = ({ Icon, label, tone = 'gold', onClick, disabled, busy }) => {
  const t = TONE[tone] || TONE.gold;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02]"
      style={{
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = t.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = t.bg;
      }}
    >
      {busy ? (
        <span
          className="w-3 h-3 border-2 rounded-full animate-spin"
          style={{ borderColor: `${t.color}40`, borderTopColor: t.color }}
        />
      ) : (
        <Icon size={11} />
      )}
      {label}
    </button>
  );
};

/* ── Note input panel (required) ──────────────────────────────────── */

const ACTION_META = {
  fail: {
    title: 'Mark as Failed',
    desc: 'Mark this payment as failed. Required to log the reason for audit.',
    tone: 'danger',
    confirm: 'Mark Failed',
  },
  cancel: {
    title: 'Cancel Payment',
    desc: 'Cancel this pending payment. Required to log the reason for audit.',
    tone: 'muted',
    confirm: 'Cancel Payment',
  },
  refund: {
    title: 'Refund Payment',
    desc: 'Refund this confirmed payment. The subscription will be revoked. Required to log the reason.',
    tone: 'warn',
    confirm: 'Refund Payment',
  },
};

const NoteInput = ({ actionType, note, onChange, onCancel, onSubmit, busy }) => {
  const meta = ACTION_META[actionType];
  if (!meta) return null;
  const t = TONE[meta.tone];
  const canSubmit = note.trim().length >= 3;

  return (
    <div
      className="rounded-xl p-3.5 space-y-2.5"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <div>
        <p className="text-[12px] font-bold" style={{ color: t.color }}>
          {meta.title}
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {meta.desc}
        </p>
      </div>

      <div>
        <label
          className="block text-[9.5px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: t.color }}
        >
          Reason <span style={{ color: '#f87171' }}>*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Why are you taking this action? (min. 3 characters)"
          rows={3}
          autoFocus
          className="w-full px-2.5 py-2 rounded text-[11.5px] text-white focus:outline-none resize-none"
          style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
        <p
          className="text-[9.5px] mt-1 text-right tabular-nums"
          style={{
            color:
              note.trim().length >= 3 ? '#34d399' : 'rgba(255,255,255,0.4)',
          }}
        >
          {note.length} chars
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2 rounded-md text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"
          style={{
            color: '#8a7a6e',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          className="flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          style={{
            background: `linear-gradient(135deg, ${t.color}55, ${t.color}30)`,
            color: '#fff',
            border: `1px solid ${t.color}`,
          }}
        >
          {busy && (
            <span
              className="w-3 h-3 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
            />
          )}
          {busy ? 'Processing…' : meta.confirm}
        </button>
      </div>
    </div>
  );
};

/* ── Add note (standalone) ────────────────────────────────────────── */

const AddNoteInput = ({ note, onChange, onCancel, onSubmit, busy }) => {
  const canSubmit = note.trim().length >= 1;
  return (
    <div
      className="rounded-xl p-3.5 space-y-2.5"
      style={{
        background: TONE.gold.bg,
        border: `1px solid ${TONE.gold.border}`,
      }}
    >
      <div>
        <p className="text-[12px] font-bold" style={{ color: '#d4a853' }}>
          Add Note to Audit Trail
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Append a free-form note. Useful for context, follow-ups, or manual corrections.
        </p>
      </div>
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your note…"
        rows={3}
        autoFocus
        className="w-full px-2.5 py-2 rounded text-[11.5px] text-white focus:outline-none resize-none"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2 rounded-md text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: '#8a7a6e',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          className="flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, #d4a853, #8b6914)',
            color: '#0a0506',
          }}
        >
          {busy ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </div>
  );
};

/* ── Payment Date row (special — prominent gold) ──────────────────── */

const PaymentDateRow = ({ verifiedAt }) => (
  <div
    className="flex items-center justify-between gap-3 py-2.5"
    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
  >
    <span
      className="text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1.5"
      style={{ color: '#d4a853' }}
    >
      <span>📅</span>
      Payment Date
    </span>
    <span
      className="text-[12.5px] font-mono tabular-nums truncate text-right font-semibold"
      style={{ color: verifiedAt ? '#d4a853' : '#6b5c52' }}
    >
      {verifiedAt ? formatDateTimeLong(verifiedAt) : 'Not yet verified'}
    </span>
  </div>
);

/* ════════════════════════════════════════════════════════════════════
   Main Panel
   ════════════════════════════════════════════════════════════════════ */

export const PaymentDetailPanel = ({
  isOpen,
  onClose,
  paymentSummary,
  onActionDone,
}) => {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [showBscscan, setShowBscscan] = useState(false);

  const [showNoteInput, setShowNoteInput] = useState(null);
  const [actionNote, setActionNote] = useState('');

  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState('');

  const [error, setError] = useState(null);

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
          setError(e?.response?.data?.detail || 'Failed to load payment detail.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, paymentSummary?.id]);

  const p = payment || paymentSummary;
  const cfg = useMemo(
    () => (p ? getStatusConfig(p.status) : null),
    [p]
  );

  const isPending = p?.status === 'pending';
  const isConfirmed = p?.status === 'confirmed';

  /* Compute gap between payment date and record date (in days) */
  const recordGapDays = useMemo(() => {
    if (!p?.verified_at || !p?.created_at) return null;
    const paymentMs = new Date(p.verified_at).getTime();
    const recordMs = new Date(p.created_at).getTime();
    return Math.round((recordMs - paymentMs) / (1000 * 60 * 60 * 24));
  }, [p?.verified_at, p?.created_at]);

  const performAction = async (actionType, note) => {
    if (!payment) return;
    setActionBusy(actionType);
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
      setError(e?.response?.data?.detail || 'Action failed. Please try again.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleApprove = () => {
    if (!payment) return;
    if (
      !window.confirm(
        `Approve payment #${payment.id} from @${payment.user?.username}?\n\nThe subscription will be auto-granted.`
      )
    )
      return;
    performAction('approve', null);
  };

  const handleAddNoteOnly = async () => {
    if (!newNote.trim() || !payment) return;
    setActionBusy('note');
    setError(null);
    try {
      const result = await financeApi.addNote(payment.id, newNote.trim());
      if (result?.payment) setPayment(result.payment);
      setNewNote('');
      setShowAddNote(false);
      if (onActionDone) onActionDone();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save note.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleCopy = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(String(text)).catch(() => {});
    }
  };

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
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2 text-xs" style={{ color: '#6b5c52' }}>
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }}
            />
            Loading payment detail…
          </div>
        </div>
      ) : !p ? (
        <p className="text-center text-xs py-12" style={{ color: '#6b5c52' }}>
          No payment selected.
        </p>
      ) : (
        <div className="space-y-5">
          {/* HERO */}
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${cfg.color}0e 0%, rgba(255,255,255,0.02) 60%)`,
              border: `1px solid ${cfg.border}`,
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: `linear-gradient(to right, transparent, ${cfg.color}60, transparent)`,
              }}
            />
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
              style={{
                background: `${cfg.color}20`,
                filter: 'blur(28px)',
              }}
            />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className="text-[9.5px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded"
                  style={{
                    background: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                  }}
                >
                  {cfg.label}
                </span>
                {p.is_stale && (
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded inline-flex items-center gap-1 animate-pulse"
                    style={{
                      background: 'rgba(248,113,113,0.10)',
                      color: '#f87171',
                      border: '1px solid rgba(248,113,113,0.30)',
                    }}
                  >
                    <AlertTriangleIcon size={9} />
                    Stale {p.age_hours}h
                  </span>
                )}
                {p.is_manual && (
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded inline-flex items-center gap-1"
                    style={{
                      background: 'rgba(212,168,83,0.10)',
                      color: '#d4a853',
                      border: '1px solid rgba(212,168,83,0.28)',
                    }}
                    title="Manually recorded by admin"
                  >
                    ★ Manual
                  </span>
                )}
                {p.wallet_to_exchange && (
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded inline-flex items-center gap-1.5"
                    style={{
                      background: `${exchangeColor(p.wallet_to_exchange)}14`,
                      color: exchangeColor(p.wallet_to_exchange),
                      border: `1px solid ${exchangeColor(p.wallet_to_exchange)}33`,
                    }}
                    title={`Received into ${p.wallet_to_exchange}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: exchangeColor(p.wallet_to_exchange) }}
                    />
                    {p.wallet_to_exchange}
                  </span>
                )}
              </div>

              <p
                className="text-[10px] uppercase tracking-wider mb-1.5"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Final Amount
              </p>
              <p
                className="text-4xl font-light tabular-nums tracking-tight leading-none"
                style={{ color: '#fff' }}
              >
                {formatUSDT(p.final_amount)}
              </p>
              <p className="text-[11px] mt-2" style={{ color: '#8a7a6e' }}>
                {p.network} · {p.plan?.name || `Plan #${p.plan_id}`}
              </p>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div
              className="text-[11.5px] px-3 py-2.5 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(248,113,113,0.10)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.28)',
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ACTIONS */}
          <Section title="Actions">
            {isPending && (
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  Icon={CheckCircleIcon}
                  label="Approve"
                  tone="success"
                  onClick={handleApprove}
                  busy={actionBusy === 'approve'}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={XCircleIcon}
                  label="Mark Failed"
                  tone="danger"
                  onClick={() => {
                    setShowNoteInput('fail');
                    setActionNote('');
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={CloseIcon}
                  label="Cancel"
                  tone="muted"
                  onClick={() => {
                    setShowNoteInput('cancel');
                    setActionNote('');
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={EditIcon}
                  label="Add Note"
                  tone="gold"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionBusy != null}
                />
              </div>
            )}

            {isConfirmed && (
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  Icon={AlertTriangleIcon}
                  label="Refund"
                  tone="warn"
                  onClick={() => {
                    setShowNoteInput('refund');
                    setActionNote('');
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={EditIcon}
                  label="Add Note"
                  tone="gold"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionBusy != null}
                />
              </div>
            )}

            {!isPending && !isConfirmed && (
              <ActionBtn
                Icon={EditIcon}
                label="Add Note"
                tone="gold"
                onClick={() => setShowAddNote(true)}
                disabled={actionBusy != null}
              />
            )}
          </Section>

          {showNoteInput && (
            <NoteInput
              actionType={showNoteInput}
              note={actionNote}
              onChange={setActionNote}
              onCancel={() => {
                setShowNoteInput(null);
                setActionNote('');
              }}
              onSubmit={() => performAction(showNoteInput, actionNote.trim())}
              busy={actionBusy === showNoteInput}
            />
          )}

          {showAddNote && (
            <AddNoteInput
              note={newNote}
              onChange={setNewNote}
              onCancel={() => {
                setShowAddNote(false);
                setNewNote('');
              }}
              onSubmit={handleAddNoteOnly}
              busy={actionBusy === 'note'}
            />
          )}

          {/* USER */}
          <Section title="User">
            <div
              className="rounded-lg p-2.5"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}
                >
                  {p.user?.username?.charAt(0).toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white truncate">
                    @{p.user?.username || 'unknown'}
                  </p>
                  <p className="text-[10.5px] truncate" style={{ color: '#6b5c52' }}>
                    {p.user?.email || '—'} · ID #{p.user_id}
                  </p>
                </div>
                <span
                  className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0"
                  style={roleStyle(p.user?.role)}
                >
                  {p.user?.role || 'free'}
                </span>
              </div>
            </div>
          </Section>

          {/* FINANCIAL */}
          <Section title="Financial Breakdown">
            <InfoBlock>
              <InfoRow label="Plan" value={p.plan?.name || `#${p.plan_id}`} />
              <InfoRow label="Amount USDT" value={formatUSDT(p.amount_usdt)} mono />
              {p.discount_amount > 0 && (
                <InfoRow
                  label="Discount"
                  value={`−${formatUSDT(p.discount_amount)}`}
                  mono
                />
              )}
              {p.discount_amount < 0 && (
                <InfoRow
                  label="Over-payment"
                  value={`+${formatUSDT(Math.abs(p.discount_amount))}`}
                  mono
                  valueColor="#fb923c"
                />
              )}
              {p.credit_redeemed > 0 && (
                <InfoRow
                  label="Credit Redeemed"
                  value={`−${formatUSDT(p.credit_redeemed)}`}
                  mono
                />
              )}
              <InfoRow label="Final Amount" value={formatUSDT(p.final_amount)} mono />
            </InfoBlock>
          </Section>

          {/* TRANSACTION (with exchange row) */}
          <Section
            title="Transaction"
            action={
              p.tx_hash && (
                <a
                  href={`https://bscscan.com/tx/${p.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-semibold hover:underline"
                  style={{ color: '#60a5fa' }}
                >
                  BSCScan <ExternalLinkIcon size={9} />
                </a>
              )
            }
          >
            <InfoBlock>
              <InfoRow label="Network" value={p.network} />
              <InfoRow
                label="TX Hash"
                value={p.tx_hash || '—'}
                mono
                copyable={!!p.tx_hash}
                onCopy={handleCopy}
              />
              <InfoRow
                label="Wallet From"
                value={p.wallet_from || '—'}
                mono
                copyable={!!p.wallet_from}
                onCopy={handleCopy}
              />
              <InfoRow
                label="Wallet To"
                value={p.wallet_to || '—'}
                mono
                copyable={!!p.wallet_to}
                onCopy={handleCopy}
              />
              {p.wallet_to_exchange && (
                <ExchangeRow
                  exchangeName={p.wallet_to_exchange}
                  walletLabel={p.wallet_to_label}
                />
              )}
            </InfoBlock>
          </Section>

          {/* TIMESTAMPS — Payment Date promoted as primary (gold) */}
          <Section title="Timestamps">
            <InfoBlock>
              <PaymentDateRow verifiedAt={p.verified_at} />
              <InfoRow
                label="Record Created"
                value={formatDateTimeLong(p.created_at)}
                mono
              />
              {p.expires_at && (
                <InfoRow
                  label="Expires"
                  value={formatDateTimeLong(p.expires_at)}
                  mono
                />
              )}
              <InfoRow
                label="Last Updated"
                value={formatDateTimeLong(p.updated_at)}
                mono
              />
            </InfoBlock>

            {/* Gap indicator — payment date vs record date */}
            {recordGapDays !== null && Math.abs(recordGapDays) >= 1 && (
              <p
                className="text-[10.5px] mt-1.5 flex items-center gap-1.5 px-2"
                style={{ color: '#8a7a6e' }}
              >
                <span style={{ color: '#d4a853' }}>⏱</span>
                {recordGapDays > 0
                  ? `Recorded ${recordGapDays} day${recordGapDays !== 1 ? 's' : ''} after the payment`
                  : `Record predates the payment by ${Math.abs(recordGapDays)} day${Math.abs(recordGapDays) !== 1 ? 's' : ''} (unusual)`}
              </p>
            )}
          </Section>

          {/* BSCSCAN RAW */}
          {payment?.bscscan_data && (
            <Section title="On-chain Verification">
              <button
                onClick={() => setShowBscscan(!showBscscan)}
                className="w-full px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider font-semibold transition-colors text-left flex items-center justify-between"
                style={{
                  background: 'rgba(96,165,250,0.06)',
                  color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.22)',
                }}
              >
                <span>{showBscscan ? 'Hide' : 'Show'} raw BSCScan response</span>
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

          {/* NOTES */}
          {p.notes && (
            <Section title="Notes / Audit Trail">
              <pre
                className="rounded-lg p-3 text-[10.5px] font-mono whitespace-pre-wrap leading-relaxed"
                style={{
                  background: 'rgba(0,0,0,0.30)',
                  color: '#c9b59e',
                  border: '1px solid rgba(255,255,255,0.06)',
                  maxHeight: 220,
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
