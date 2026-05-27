// src/components/admin/workspace/FinanceTab.jsx
//
// Finance dashboard: revenue stats + payment management table.
// Hybrid UI — quick action buttons in row + slide-in panel for advanced.

import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../../../services/financeApi';
import { PaymentDetailPanel } from './PaymentDetailPanel';
import {
  SearchIcon,
  CloseIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  TrendingUpIcon,
  UserIcon,
  ExternalLinkIcon,
  CopyIcon,
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
  });
};

const formatRelative = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 7) return `${days}d ago`;
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${mins % 60}m ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
};

const shortHash = (hash) => {
  if (!hash) return '—';
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
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
// Stat Card (click-to-filter)
// ════════════════════════════════════════════════════════════════════

const StatCard = ({ label, value, sub, accent, Icon, active, onClick }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`relative overflow-hidden text-left rounded-xl px-4 py-3 transition-all ${onClick ? 'hover:scale-[1.01] cursor-pointer' : 'cursor-default'}`}
    style={{
      background: active ? `${accent}12` : 'rgba(255,255,255,0.018)',
      border: `1px solid ${active ? `${accent}50` : 'rgba(255,255,255,0.06)'}`,
    }}
  >
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none"
      style={{
        background: `linear-gradient(to right, transparent, ${accent}40, transparent)`,
      }}
    />
    <div className="flex items-center justify-between mb-1.5">
      <span
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {label}
      </span>
      {Icon && <Icon size={12} style={{ color: accent, opacity: 0.7 }} />}
    </div>
    <p
      className="text-2xl font-light tracking-tight tabular-nums leading-none"
      style={{ color: accent }}
    >
      {value ?? '—'}
    </p>
    {sub && (
      <p
        className="text-[10px] mt-1 tabular-nums"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {sub}
      </p>
    )}
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Payment Row — table format with inline quick actions
// ════════════════════════════════════════════════════════════════════

const PaymentRow = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel, onCopyHash }) => {
  const stat = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
  const isPending = payment.status === 'pending';

  return (
    <div
      onClick={() => onOpenDetail(payment)}
      className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: `1px solid ${payment.is_stale ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.05)'}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.018)';
      }}
    >
      {/* User */}
      <div className="col-span-3 min-w-0 flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}
        >
          {payment.user?.username?.charAt(0).toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">
            @{payment.user?.username || 'unknown'}
          </p>
          <p className="text-[10px] truncate" style={{ color: '#6b5c52' }}>
            #{payment.user_id}
          </p>
        </div>
      </div>

      {/* Plan + amount */}
      <div className="col-span-2 min-w-0">
        <p className="text-xs font-semibold text-white truncate">
          {payment.plan?.name || `Plan #${payment.plan_id}`}
        </p>
        <p className="text-[11px] font-mono tabular-nums" style={{ color: '#d4a853' }}>
          {formatUSDT(payment.final_amount)}
        </p>
      </div>

      {/* Status */}
      <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: stat.bg, color: stat.color, border: `1px solid ${stat.border}` }}
        >
          {stat.label}
        </span>
        {payment.is_stale && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5"
            style={{
              background: 'rgba(248,113,113,0.08)',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.25)',
            }}
            title={`Pending ${payment.age_hours}h`}
          >
            <AlertTriangleIcon size={9} /> STALE
          </span>
        )}
      </div>

      {/* TX hash */}
      <div className="col-span-2 min-w-0 flex items-center gap-1.5">
        {payment.tx_hash ? (
          <>
            <a
              href={`https://bscscan.com/tx/${payment.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-mono hover:underline truncate"
              style={{ color: '#60a5fa' }}
            >
              {shortHash(payment.tx_hash)}
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyHash(payment.tx_hash);
              }}
              title="Copy"
              className="p-0.5 rounded transition-colors shrink-0"
              style={{ color: '#6b5c52' }}
            >
              <CopyIcon size={9} />
            </button>
          </>
        ) : (
          <span className="text-[10px]" style={{ color: '#4a3f39' }}>—</span>
        )}
      </div>

      {/* Date */}
      <div className="col-span-2 min-w-0">
        <p className="text-[11px] truncate" style={{ color: '#c9b59e' }}>
          {formatRelative(payment.created_at)}
        </p>
        <p className="text-[10px] truncate" style={{ color: '#4a3f39' }}>
          {formatDateTime(payment.created_at)}
        </p>
      </div>

      {/* Quick actions */}
      <div className="col-span-1 flex items-center justify-end gap-1">
        {isPending && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickApprove(payment);
              }}
              title="Quick approve"
              className="p-1.5 rounded-md transition-colors"
              style={{
                color: '#34d399',
                background: 'rgba(52,211,153,0.08)',
                border: '1px solid rgba(52,211,153,0.2)',
              }}
            >
              <CheckCircleIcon size={11} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickCancel(payment);
              }}
              title="Quick cancel"
              className="p-1.5 rounded-md transition-colors"
              style={{
                color: '#f87171',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.2)',
              }}
            >
              <CloseIcon size={11} />
            </button>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(payment);
          }}
          title="View detail"
          className="p-1.5 rounded-md transition-colors"
          style={{
            color: '#d4a853',
            background: 'rgba(212,168,83,0.08)',
            border: '1px solid rgba(212,168,83,0.2)',
          }}
        >
          <ExternalLinkIcon size={11} />
        </button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Main Tab
// ════════════════════════════════════════════════════════════════════

export const FinanceTab = ({ onRefreshStats }) => {
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (msg, type = 'success') => setToast({ msg, type });

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const data = await financeApi.getStats();
      setStats(data);
    } catch (e) {
      console.error('Stats fetch failed:', e);
    }
  }, []);

  // ── Fetch payments ──
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        page: pagination.page,
        page_size: 25,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (statusFilter) filters.status = statusFilter;
      if (search) filters.search = search;

      const data = await financeApi.listPayments(filters);
      setPayments(data.items || []);
      setPagination({
        page: data.page,
        total: data.total,
        total_pages: data.total_pages,
      });
    } catch (e) {
      console.error('Payments fetch failed:', e);
      showToast('Gagal load payments', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, sortBy, sortOrder, pagination.page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Reset page when filter changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [statusFilter, search, sortBy, sortOrder]);

  // ── Actions ──
  const handleOpenDetail = (payment) => {
    setSelectedPayment(payment);
    setPanelOpen(true);
  };

  const handleQuickApprove = async (payment) => {
    if (!window.confirm(
      `Approve payment #${payment.id} dari @${payment.user?.username}?\n\nIni akan auto-grant subscription ke user.`
    )) return;
    try {
      await financeApi.approvePayment(payment.id);
      showToast(`Payment #${payment.id} approved`);
      fetchStats();
      fetchPayments();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast(e.response?.data?.detail || 'Approve gagal', 'error');
    }
  };

  const handleQuickCancel = async (payment) => {
    if (!window.confirm(
      `Cancel payment #${payment.id} dari @${payment.user?.username}?`
    )) return;
    try {
      await financeApi.cancelPayment(payment.id);
      showToast(`Payment #${payment.id} cancelled`);
      fetchStats();
      fetchPayments();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast(e.response?.data?.detail || 'Cancel gagal', 'error');
    }
  };

  const handleCopyHash = (hash) => {
    navigator.clipboard.writeText(hash).then(() => {
      showToast('TX hash copied');
    }).catch(() => {
      showToast('Copy gagal', 'error');
    });
  };

  const handlePanelAction = () => {
    // Called after any action in panel succeeds
    fetchStats();
    fetchPayments();
    if (onRefreshStats) onRefreshStats();
  };

  const handleBulkCancelStale = async () => {
    if (!stats?.stale_count) return;
    if (!window.confirm(
      `Cancel SEMUA ${stats.stale_count} stale pending payments (> 24 jam)?\n\nValue locked: ${formatUSDT(stats.stale_value)}\n\nIni gak bisa di-undo.`
    )) return;
    try {
      const result = await financeApi.bulkCancelStale(24);
      showToast(`${result.cancelled} stale payments cancelled`);
      fetchStats();
      fetchPayments();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast(e.response?.data?.detail || 'Bulk cancel gagal', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl animate-in fade-in slide-in-from-top-2"
          style={{
            background: toast.type === 'error' ? 'rgba(248,113,113,0.18)' : 'rgba(52,211,153,0.18)',
            color: toast.type === 'error' ? '#f87171' : '#34d399',
            border: `1px solid ${toast.type === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white tracking-tight">
            Finance Hub
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: '#6b5c52' }}>
            Monitor revenue, approve pending payments, manage subscriptions.
          </p>
        </div>
        {stats && stats.stale_count > 0 && (
          <button
            onClick={handleBulkCancelStale}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
            style={{
              background: 'rgba(248,113,113,0.1)',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.3)',
            }}
          >
            <AlertTriangleIcon size={12} />
            Bulk Cancel {stats.stale_count} Stale
          </button>
        )}
      </div>

      {/* Overview stats — primary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          label="Total Revenue"
          value={formatUSDT(stats?.total_revenue)}
          sub={stats?.revenue_this_month != null ? `+${formatUSDT(stats.revenue_this_month)} this month` : null}
          accent="#34d399"
          Icon={TrendingUpIcon}
        />
        <StatCard
          label="Pending Value"
          value={formatUSDT(stats?.pending_value)}
          sub={stats?.pending_count != null ? `${stats.pending_count} payment(s)` : null}
          accent="#fbbf24"
          Icon={ClockIcon}
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')}
        />
        <StatCard
          label="Stale > 24h"
          value={stats?.stale_count ?? '—'}
          sub={stats?.stale_value > 0 ? formatUSDT(stats.stale_value) + ' locked' : null}
          accent="#f87171"
          Icon={AlertTriangleIcon}
          active={statusFilter === 'stale'}
          onClick={() => setStatusFilter(statusFilter === 'stale' ? '' : 'stale')}
        />
        <StatCard
          label="Failed"
          value={stats?.failed_count ?? '—'}
          sub={stats?.failed_value > 0 ? formatUSDT(stats.failed_value) : null}
          accent="#a78bfa"
          active={statusFilter === 'failed'}
          onClick={() => setStatusFilter(statusFilter === 'failed' ? '' : 'failed')}
        />
      </div>

      {/* Secondary stats — smaller info row */}
      {stats && (
        <div className="flex items-center gap-3 flex-wrap text-[10px]" style={{ color: '#6b5c52' }}>
          <span>Today: <span style={{ color: '#34d399' }} className="tabular-nums">{formatUSDT(stats.revenue_today)}</span></span>
          <span>·</span>
          <span>Total payments: <span style={{ color: '#c9b59e' }} className="tabular-nums">{stats.total_count}</span></span>
          <span>·</span>
          <span>Cancelled: <span className="tabular-nums">{stats.cancelled_count}</span></span>
          {stats.total_credit_redeemed > 0 && (
            <>
              <span>·</span>
              <span>Credit redeemed: <span style={{ color: '#d4a853' }} className="tabular-nums">{formatUSDT(stats.total_credit_redeemed)}</span></span>
            </>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#6b5c52' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari username, email, tx hash..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-white focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${statusFilter ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="stale">Stale (Pending &gt; 24h)</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="refunded">Refunded</option>
        </select>

        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [sb, so] = e.target.value.split(':');
            setSortBy(sb);
            setSortOrder(so);
          }}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="amount:desc">Highest amount</option>
          <option value="amount:asc">Lowest amount</option>
          <option value="verified_at:desc">Recently verified</option>
        </select>

        {(search || statusFilter) && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
            }}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            style={{
              color: '#f87171',
              background: 'rgba(248,113,113,0.06)',
              border: '1px solid rgba(248,113,113,0.2)',
            }}
          >
            <CloseIcon size={11} />
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2 text-xs" style={{ color: '#6b5c52' }}>
            <div
              className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }}
            />
            Loading payments...
          </div>
        </div>
      ) : payments.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.015)',
            border: '1px dashed rgba(255,255,255,0.06)',
          }}
        >
          <TrendingUpIcon size={28} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
          <p className="text-sm font-medium text-white mb-1">No payments</p>
          <p className="text-[11px]" style={{ color: '#6b5c52' }}>
            {search || statusFilter
              ? 'Coba reset filter atau ubah pencarian.'
              : 'Belum ada payment data.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div
            className="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] uppercase tracking-wider font-semibold"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <div className="col-span-3">User</div>
            <div className="col-span-2">Plan / Amount</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">TX Hash</div>
            <div className="col-span-2">Created</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="space-y-1.5">
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                onOpenDetail={handleOpenDetail}
                onQuickApprove={handleQuickApprove}
                onQuickCancel={handleQuickCancel}
                onCopyHash={handleCopyHash}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                Page {pagination.page} of {pagination.total_pages} · {pagination.total} total
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  disabled={pagination.page <= 1}
                  className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#c9b59e',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.total_pages, p.page + 1) }))}
                  disabled={pagination.page >= pagination.total_pages}
                  className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#c9b59e',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail panel */}
      <PaymentDetailPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setSelectedPayment(null);
        }}
        paymentSummary={selectedPayment}
        onActionDone={handlePanelAction}
      />
    </div>
  );
};
