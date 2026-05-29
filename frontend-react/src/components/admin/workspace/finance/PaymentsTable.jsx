// ════════════════════════════════════════════════════════════════════
// Payments Table — hybrid layout
//
// Desktop (≥ md): grid-based table row.
// Mobile  (<  md): stacked card list.
// Self-contained Pill / IconButton internals to avoid API drift with primitives.
// v2: + ExchangeBadge (Binance/Indodax/etc) on wallet_to.
// ════════════════════════════════════════════════════════════════════

import { Avatar } from '../../primitives';
import {
  CheckCircleIcon,
  CloseIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  CopyIcon,
} from '../../Icons';
import { ChevronRightIcon } from './icons-supplement';
import {
  formatUSDT,
  formatRelative,
  formatDateTime,
  shortHash,
  getStatusConfig,
  exchangeColor,
} from './helpers';

/* ── Inline Pill (small status chip) ──────────────────────────────── */

const Pill = ({ label, color, bg, border, Icon, dense = false, pulse = false }) => (
  <span
    className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded ${
      dense ? 'text-[9px] px-1.5 py-0.5' : 'text-[9.5px] px-2 py-0.5'
    }`}
    style={{
      background: bg,
      color,
      border: `1px solid ${border}`,
    }}
  >
    {Icon && (
      <span className={pulse ? 'animate-pulse' : ''}>
        <Icon size={9} />
      </span>
    )}
    {label}
  </span>
);

/* ── Exchange badge — wallet_to provider (Binance/Indodax/etc) ──── */

const ExchangeBadge = ({ exchange, dense = false }) => {
  if (!exchange) return null;
  const c = exchangeColor(exchange);
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded ${
        dense ? 'text-[9px] px-1.5 py-0.5' : 'text-[9.5px] px-2 py-0.5'
      }`}
      style={{
        background: `${c}14`,
        color: c,
        border: `1px solid ${c}33`,
      }}
      title={`Received into ${exchange}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: c }}
      />
      {exchange}
    </span>
  );
};

/* ── Inline IconButton ────────────────────────────────────────────── */

const TONE = {
  success: { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.22)' },
  danger:  { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)' },
  gold:    { color: '#d4a853', bg: 'rgba(212,168,83,0.08)',  border: 'rgba(212,168,83,0.22)' },
  muted:   { color: '#8a7a6e', bg: 'transparent',            border: 'transparent' },
};

const IconButton = ({ Icon, tone = 'gold', title, onClick, size = 'sm' }) => {
  const t = TONE[tone] || TONE.gold;
  const dim = size === 'xs' ? 22 : 26;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-md flex items-center justify-center transition-all hover:scale-110"
      style={{
        width: dim,
        height: dim,
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <Icon size={size === 'xs' ? 10 : 11} />
    </button>
  );
};

/* ── Status pill ──────────────────────────────────────────────────── */

const StatusPill = ({ status, isStale, ageHours, dense = false }) => {
  const cfg = getStatusConfig(status);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Pill
        label={cfg.label}
        color={cfg.color}
        bg={cfg.bg}
        border={cfg.border}
        dense={dense}
      />
      {isStale && (
        <Pill
          label={ageHours ? `Stale ${ageHours}h` : 'Stale'}
          color="#f87171"
          bg="rgba(248,113,113,0.08)"
          border="rgba(248,113,113,0.28)"
          Icon={AlertTriangleIcon}
          dense={dense}
          pulse
        />
      )}
    </div>
  );
};

/* ── TX hash cell ─────────────────────────────────────────────────── */

const TxHashCell = ({ hash, onCopy, dense = false }) => {
  if (!hash) {
    return (
      <span className="text-[11px]" style={{ color: '#4a3f39' }}>
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <a
        href={`https://bscscan.com/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`font-mono hover:underline truncate ${dense ? 'text-[10.5px]' : 'text-[11px]'}`}
        style={{ color: '#60a5fa' }}
      >
        {shortHash(hash)}
      </a>
      <IconButton
        Icon={CopyIcon}
        tone="muted"
        size="xs"
        title="Copy TX hash"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hash);
        }}
      />
    </div>
  );
};

/* ── Quick actions ────────────────────────────────────────────────── */

const QuickActions = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel }) => {
  const isPending = payment.status === 'pending';
  return (
    <div className="flex items-center gap-1 justify-end">
      {isPending && (
        <>
          <IconButton
            Icon={CheckCircleIcon}
            tone="success"
            title="Quick approve"
            onClick={(e) => {
              e.stopPropagation();
              onQuickApprove(payment);
            }}
          />
          <IconButton
            Icon={CloseIcon}
            tone="danger"
            title="Quick cancel"
            onClick={(e) => {
              e.stopPropagation();
              onQuickCancel(payment);
            }}
          />
        </>
      )}
      <IconButton
        Icon={ExternalLinkIcon}
        tone="gold"
        title="View detail"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail(payment);
        }}
      />
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   Desktop row
   ════════════════════════════════════════════════════════════════════ */

const DesktopRow = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel, onCopyHash }) => {
  const cfg = getStatusConfig(payment.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(payment)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(payment);
        }
      }}
      className="group grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: `1px solid ${
          payment.is_stale ? 'rgba(248,113,113,0.20)' : 'rgba(255,255,255,0.05)'
        }`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.035)';
        e.currentTarget.style.borderColor = payment.is_stale
          ? 'rgba(248,113,113,0.32)'
          : 'rgba(212,168,83,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.018)';
        e.currentTarget.style.borderColor = payment.is_stale
          ? 'rgba(248,113,113,0.20)'
          : 'rgba(255,255,255,0.05)';
      }}
    >
      {/* User */}
      <div className="col-span-3 min-w-0 flex items-center gap-2.5">
        <Avatar name={payment.user?.username} size="sm" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white truncate">
            @{payment.user?.username || 'unknown'}
          </p>
          <p className="text-[10px] truncate" style={{ color: '#6b5c52' }}>
            ID #{payment.user_id}
          </p>
        </div>
      </div>

      {/* Plan + amount */}
      <div className="col-span-2 min-w-0">
        <p className="text-[11.5px] font-semibold text-white truncate">
          {payment.plan?.name || `Plan #${payment.plan_id}`}
        </p>
        <p
          className="text-[11.5px] font-mono tabular-nums font-semibold"
          style={{ color: cfg.color }}
        >
          {formatUSDT(payment.final_amount)}
        </p>
      </div>

      {/* Status */}
      <div className="col-span-2">
        <StatusPill
          status={payment.status}
          isStale={payment.is_stale}
          ageHours={payment.age_hours}
        />
      </div>

      {/* TX hash + exchange badge stacked */}
      <div className="col-span-2 min-w-0 space-y-1">
        <TxHashCell hash={payment.tx_hash} onCopy={onCopyHash} />
        {payment.wallet_to_exchange && (
          <ExchangeBadge exchange={payment.wallet_to_exchange} dense />
        )}
      </div>

      {/* Date */}
      <div className="col-span-2 min-w-0">
        <p className="text-[11px] truncate" style={{ color: '#c9b59e' }}>
          {formatRelative(payment.created_at)}
        </p>
        <p className="text-[9.5px] truncate" style={{ color: '#4a3f39' }}>
          {formatDateTime(payment.created_at)}
        </p>
      </div>

      {/* Actions */}
      <div className="col-span-1">
        <QuickActions
          payment={payment}
          onOpenDetail={onOpenDetail}
          onQuickApprove={onQuickApprove}
          onQuickCancel={onQuickCancel}
        />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   Mobile card
   ════════════════════════════════════════════════════════════════════ */

const MobileCard = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel, onCopyHash }) => {
  const cfg = getStatusConfig(payment.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(payment)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(payment);
        }
      }}
      className="p-3 rounded-xl space-y-2.5 cursor-pointer transition-colors"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${
          payment.is_stale ? 'rgba(248,113,113,0.22)' : 'rgba(255,255,255,0.06)'
        }`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={payment.user?.username} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate">
            @{payment.user?.username || 'unknown'}
          </p>
          <p className="text-[10px]" style={{ color: '#6b5c52' }}>
            {payment.plan?.name || `Plan #${payment.plan_id}`}
          </p>
        </div>
        <ChevronRightIcon size={14} style={{ color: '#6b5c52' }} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span
          className="text-lg font-light tabular-nums tracking-tight"
          style={{ color: cfg.color }}
        >
          {formatUSDT(payment.final_amount)}
        </span>
        <StatusPill
          status={payment.status}
          isStale={payment.is_stale}
          ageHours={payment.age_hours}
          dense
        />
      </div>

      <div
        className="flex items-center justify-between gap-2 pt-2 text-[10.5px] flex-wrap"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: '#6b5c52' }}
      >
        <span>{formatRelative(payment.created_at)}</span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {payment.wallet_to_exchange && (
            <ExchangeBadge exchange={payment.wallet_to_exchange} dense />
          )}
          <TxHashCell hash={payment.tx_hash} onCopy={onCopyHash} dense />
        </div>
      </div>

      <div
        className="pt-1.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <QuickActions
          payment={payment}
          onOpenDetail={onOpenDetail}
          onQuickApprove={onQuickApprove}
          onQuickCancel={onQuickCancel}
        />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   Main export
   ════════════════════════════════════════════════════════════════════ */

export const PaymentsTable = ({
  payments,
  onOpenDetail,
  onQuickApprove,
  onQuickCancel,
  onCopyHash,
}) => {
  return (
    <div className="space-y-1.5">
      <div
        className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        <div className="col-span-3">User</div>
        <div className="col-span-2">Plan / Amount</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">TX Hash / Wallet</div>
        <div className="col-span-2">Created</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>

      <div className="hidden md:block space-y-1.5">
        {payments.map((p) => (
          <DesktopRow
            key={p.id}
            payment={p}
            onOpenDetail={onOpenDetail}
            onQuickApprove={onQuickApprove}
            onQuickCancel={onQuickCancel}
            onCopyHash={onCopyHash}
          />
        ))}
      </div>

      <div className="md:hidden space-y-2">
        {payments.map((p) => (
          <MobileCard
            key={p.id}
            payment={p}
            onOpenDetail={onOpenDetail}
            onQuickApprove={onQuickApprove}
            onQuickCancel={onQuickCancel}
            onCopyHash={onCopyHash}
          />
        ))}
      </div>
    </div>
  );
};
