// ════════════════════════════════════════════════════════════════════
// FinanceTab — orchestrator
//
// v3: + manual payment modal trigger + source filter (manual/auto/all)
// v2: + exchange filter (Binance/Indodax/etc)
//
// ConfirmModal uses object-payload pattern.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../../../services/financeApi';
import { PaymentDetailPanel } from './PaymentDetailPanel';
import { ManualPaymentModal } from './ManualPaymentModal';
import { ConfirmModal } from '../users/ConfirmModal';

import { FinanceStatsGrid } from './finance/FinanceStatsGrid';
import { FinanceFilterBar } from './finance/FinanceFilterBar';
import { PaymentsTable } from './finance/PaymentsTable';
import { FinancePagination } from './finance/FinancePagination';
import { formatUSDT } from './finance/helpers';
import PaymentAuditPanel from './PaymentAuditPanel';

import {
 AlertTriangleIcon,
 TrendingUpIcon,
 CheckCircleIcon,
 PlusIcon,
} from '../Icons';
import { IconBadge } from '../primitives';
import { palette } from '../designSystem';

const PAGE_SIZE = 25;

/* ── Header ───────────────────────────────────────────────────────── */

const FinanceHeader = ({ stats, onBulkCancelStale, onAddManualPayment }) => {
 const hasStale = (stats?.stale_count ?? 0) > 0;
 return (
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex min-w-0 items-start gap-3">
 <IconBadge Icon={TrendingUpIcon} color="rgb(var(--ink) / 0.45)" size={38} iconSize={18} />

 <div className="min-w-0">
 <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
 Finance · Revenue & payment ops
 </p>
 <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
 Finance Hub
 </h2>
 <p className="mt-0.5 max-w-md text-[12px] text-text-muted">
 Monitor revenue, approve pending payments, and audit the financial trail.
 </p>
 </div>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 <button
 type="button"
 onClick={onAddManualPayment}
 className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-ink/[0.1] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-primary transition hover:bg-ink/[0.14]"
 title="Record a payment that was made out-of-band"
 >
 <PlusIcon size={12} />
 Manual Payment
 </button>

 {hasStale && (
 <button
 onClick={onBulkCancelStale}
 className="group flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-[1.02]"
 style={{
 background: 'rgba(248,113,113,0.10)',
 color: 'rgb(var(--neg))',
 border: '1px solid rgba(248,113,113,0.30)',
 }}
 >
 <span className="animate-pulse">
 <AlertTriangleIcon size={12} />
 </span>
 Bulk Cancel {stats.stale_count} Stale
 </button>
 )}
 </div>
 </div>
 );
};

/* ── Loading + empty + toast ─────────────────────────────────────── */

const LoadingRows = () => (
 <div className="flex items-center justify-center py-20">
 <div className="inline-flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--fg-muted))' }}>
 <div
 className="w-4 h-4 border-2 rounded-full animate-spin"
 style={{ borderColor: 'rgb(var(--accent) / 0.3)', borderTopColor: 'rgb(var(--accent))' }}
 />
 Loading payments…
 </div>
 </div>
);

const EmptyPayments = ({ hasFilters, onReset }) => (
 <div
 className="relative text-center py-16 rounded-2xl overflow-hidden"
 style={{
 background: 'rgb(var(--ink) / 0.015)',
 border: '1px dashed rgb(var(--ink) / 0.08)',
 }}
 >
 <div
 className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
 style={{ background: 'rgba(52,211,153,0.08)', filter: 'blur(40px)' }}
 />
 <div className="relative">
 <div
 className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
 style={{
 background: 'rgba(52,211,153,0.10)',
 border: '1px solid rgba(52,211,153,0.22)',
 color: 'rgb(var(--pos))',
 }}
 >
 <TrendingUpIcon size={20} />
 </div>
 <p className="text-sm font-semibold text-text-primary mb-1">
 {hasFilters ? 'No payments match these filters' : 'No payments yet'}
 </p>
 <p className="text-[11.5px] mb-4" style={{ color: 'rgb(var(--fg-muted))' }}>
 {hasFilters
 ? 'Try adjusting the search or status filter.'
 : 'Payments will appear here as users subscribe.'}
 </p>
 {hasFilters && (
 <button
 onClick={onReset}
 className="px-4 py-2 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider transition-colors"
 style={{
 background: 'rgb(var(--accent) / 0.10)',
 color: 'rgb(var(--accent))',
 border: '1px solid rgb(var(--line) / 0.28)',
 }}
 >
 Reset filters
 </button>
 )}
 </div>
 </div>
);

const Toast = ({ toast }) => {
 if (!toast) return null;
 const isError = toast.type === 'error';
 const color = isError ? '#f87171' : '#34d399';
 const Icon = isError ? AlertTriangleIcon : CheckCircleIcon;
 return (
 <div
 className="fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-2xl flex items-center gap-2"
 style={{
 background: isError ? 'rgba(248,113,113,0.18)' : 'rgba(52,211,153,0.18)',
 color,
 border: `1px solid ${color}40`,
 backdropFilter: 'blur(12px)',
 }}
 >
 <Icon size={14} />
 {toast.msg}
 </div>
 );
};

/* ════════════════════════════════════════════════════════════════════
 Main
 ════════════════════════════════════════════════════════════════════ */

export const FinanceTab = ({ onRefreshStats }) => {
 const [stats, setStats] = useState(null);
 const [payments, setPayments] = useState([]);
 const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
 const [loading, setLoading] = useState(true);
 const [statsLoading, setStatsLoading] = useState(true);

 /* Filters */
 const [statusFilter, setStatusFilter] = useState('');
 const [search, setSearch] = useState('');
 const [exchangeFilter, setExchangeFilter] = useState('');
 const [exchangeOptions, setExchangeOptions] = useState([]);
 const [sourceFilter, setSourceFilter] = useState(''); // '' | 'manual' | 'auto'
 const [sortBy, setSortBy] = useState('created_at');
 const [sortOrder, setSortOrder] = useState('desc');

 /* Panels & modals */
 const [selectedPayment, setSelectedPayment] = useState(null);
 const [panelOpen, setPanelOpen] = useState(false);
 const [manualOpen, setManualOpen] = useState(false);
 const [confirmModal, setConfirmModal] = useState(null);

 /* Toast */
 const [toast, setToast] = useState(null);
 useEffect(() => {
 if (!toast) return;
 const t = setTimeout(() => setToast(null), 3000);
 return () => clearTimeout(t);
 }, [toast]);
 const showToast = (msg, type = 'success') => setToast({ msg, type });

 /* Fetchers */
 const fetchStats = useCallback(async () => {
 setStatsLoading(true);
 try {
 const data = await financeApi.getStats();
 setStats(data);
 } catch (e) {
 console.error('Stats fetch failed:', e);
 } finally {
 setStatsLoading(false);
 }
 }, []);

 const fetchPayments = useCallback(async () => {
 setLoading(true);
 try {
 const filters = {
 page: pagination.page,
 page_size: PAGE_SIZE,
 sort_by: sortBy,
 sort_order: sortOrder,
 };
 if (statusFilter) filters.status = statusFilter;
 if (search) filters.search = search;
 if (exchangeFilter) filters.exchange = exchangeFilter;
 if (sourceFilter) filters.source = sourceFilter;

 const data = await financeApi.listPayments(filters);
 setPayments(data.items || []);
 setPagination({
 page: data.page,
 total: data.total,
 total_pages: data.total_pages,
 });
 } catch (e) {
 console.error('Payments fetch failed:', e);
 showToast('Failed to load payments', 'error');
 } finally {
 setLoading(false);
 }
 }, [statusFilter, search, exchangeFilter, sourceFilter, sortBy, sortOrder, pagination.page]);

 useEffect(() => {
 fetchStats();
 }, [fetchStats]);

 useEffect(() => {
 financeApi
 .getExchanges()
 .then((d) => setExchangeOptions(d?.exchanges || []))
 .catch((e) => {
 console.warn('Exchanges fetch failed:', e);
 setExchangeOptions([]);
 });
 }, []);

 useEffect(() => {
 fetchPayments();
 }, [fetchPayments]);

 useEffect(() => {
 setPagination((prev) => ({ ...prev, page: 1 }));
 }, [statusFilter, search, exchangeFilter, sourceFilter, sortBy, sortOrder]);

 /* Action handlers */
 const handleFilterToggle = (status) => {
 setStatusFilter(statusFilter === status ? '' : status);
 };

 const handleOpenDetail = (payment) => {
 setSelectedPayment(payment);
 setPanelOpen(true);
 };

 const handlePanelAction = () => {
 fetchStats();
 fetchPayments();
 if (onRefreshStats) onRefreshStats();
 };

 const handleCopyHash = (hash) => {
 if (navigator.clipboard) {
 navigator.clipboard
 .writeText(hash)
 .then(() => showToast('TX hash copied to clipboard'))
 .catch(() => showToast('Copy failed', 'error'));
 }
 };

 const handleManualPaymentSuccess = (result) => {
 const username = result?.payment?.user?.username || 'user';
 const wasNew = result?.user_was_created;
 showToast(
 wasNew
 ? `✓ Payment recorded — new user @${username} created`
 : `✓ Payment recorded for @${username}`
 );
 fetchStats();
 fetchPayments();
 if (onRefreshStats) onRefreshStats();
 };

 const handleQuickApprove = (payment) => {
 setConfirmModal({
 title: 'Approve Payment',
 message: `Approve payment #${payment.id} from @${payment.user?.username || 'user'}? The subscription will be auto-granted to the user.`,
 confirmText: 'Approve',
 cancelText: 'Cancel',
 variant: 'default',
 onConfirm: async () => {
 try {
 await financeApi.approvePayment(payment.id);
 showToast(`Payment #${payment.id} approved`);
 fetchStats();
 fetchPayments();
 if (onRefreshStats) onRefreshStats();
 } catch (e) {
 showToast(
 e?.response?.data?.detail || 'Approval failed. Please try again.',
 'error'
 );
 throw e;
 }
 },
 });
 };

 const handleQuickCancel = (payment) => {
 setConfirmModal({
 title: 'Cancel Payment',
 message: `Cancel payment #${payment.id} from @${payment.user?.username || 'user'}? This action cannot be undone.`,
 confirmText: 'Cancel Payment',
 cancelText: 'Keep it',
 variant: 'danger',
 onConfirm: async () => {
 try {
 await financeApi.cancelPayment(payment.id);
 showToast(`Payment #${payment.id} cancelled`);
 fetchStats();
 fetchPayments();
 if (onRefreshStats) onRefreshStats();
 } catch (e) {
 showToast(
 e?.response?.data?.detail || 'Cancel failed. Please try again.',
 'error'
 );
 throw e;
 }
 },
 });
 };

 const handleBulkCancelStale = () => {
 if (!stats?.stale_count) return;
 setConfirmModal({
 title: 'Bulk Cancel Stale Payments',
 message: `Cancel ALL ${stats.stale_count} stale pending payments (older than 24 hours)? Value locked: ${formatUSDT(stats.stale_value)}. This action cannot be undone.`,
 confirmText: `Cancel ${stats.stale_count} Payments`,
 cancelText: 'Keep them',
 variant: 'danger',
 onConfirm: async () => {
 try {
 const result = await financeApi.bulkCancelStale(24);
 showToast(`${result.cancelled} stale payments cancelled`);
 fetchStats();
 fetchPayments();
 if (onRefreshStats) onRefreshStats();
 } catch (e) {
 showToast(
 e?.response?.data?.detail || 'Bulk cancel failed. Please try again.',
 'error'
 );
 throw e;
 }
 },
 });
 };

 const hasFilters = !!(search || statusFilter || exchangeFilter || sourceFilter);

 return (
 <div className="space-y-5">
 <Toast toast={toast} />

 <FinanceHeader
 stats={stats}
 onBulkCancelStale={handleBulkCancelStale}
 onAddManualPayment={() => setManualOpen(true)}
 />

 <FinanceStatsGrid
 stats={stats}
 statusFilter={statusFilter}
 onFilterToggle={handleFilterToggle}
 loading={statsLoading}
 />

 {/* ERP: payment-gap queue belongs to Finance (money ops), not Users directory.
 Collapsed by default — expand only when working the backlog. */}
 <PaymentAuditPanel defaultOpen={false} id="payment-audit" />

 <FinanceFilterBar
 search={search}
 onSearchChange={setSearch}
 statusFilter={statusFilter}
 onStatusChange={setStatusFilter}
 sortBy={sortBy}
 sortOrder={sortOrder}
 onSortChange={(sb, so) => {
 setSortBy(sb);
 setSortOrder(so);
 }}
 resultCount={pagination.total}
 exchangeFilter={exchangeFilter}
 onExchangeChange={setExchangeFilter}
 exchangeOptions={exchangeOptions}
 sourceFilter={sourceFilter}
 onSourceChange={setSourceFilter}
 />

 {loading ? (
 <LoadingRows />
 ) : payments.length === 0 ? (
 <EmptyPayments
 hasFilters={hasFilters}
 onReset={() => {
 setSearch('');
 setStatusFilter('');
 setExchangeFilter('');
 setSourceFilter('');
 }}
 />
 ) : (
 <>
 <PaymentsTable
 payments={payments}
 onOpenDetail={handleOpenDetail}
 onQuickApprove={handleQuickApprove}
 onQuickCancel={handleQuickCancel}
 onCopyHash={handleCopyHash}
 />
 <FinancePagination
 page={pagination.page}
 totalPages={pagination.total_pages}
 total={pagination.total}
 onChange={(page) =>
 setPagination((prev) => ({ ...prev, page }))
 }
 />
 </>
 )}

 <PaymentDetailPanel
 isOpen={panelOpen}
 onClose={() => {
 setPanelOpen(false);
 setSelectedPayment(null);
 }}
 paymentSummary={selectedPayment}
 onActionDone={handlePanelAction}
 />

 <ManualPaymentModal
 isOpen={manualOpen}
 onClose={() => setManualOpen(false)}
 onSuccess={handleManualPaymentSuccess}
 />

 {confirmModal && (
 <ConfirmModal
 {...confirmModal}
 onClose={() => setConfirmModal(null)}
 />
 )}
 </div>
 );
};
