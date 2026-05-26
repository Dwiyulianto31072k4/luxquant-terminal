// src/components/admin/workspace/FollowupTab.jsx
//
// Follow-up queue with filters, status changes, and CRUD via slide-in panel.

import { useState, useEffect, useCallback } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { FollowupPanel } from './FollowupPanel';
import {
  PlusIcon,
  SearchIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  EditIcon,
  TrashIcon,
  UserIcon,
  CloseIcon,
} from '../Icons';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

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

const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const timeUntilDue = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (diff < 0) {
    const overdueDays = Math.abs(days);
    if (overdueDays === 0) return { text: 'overdue today', overdue: true };
    return { text: `${overdueDays}d overdue`, overdue: true };
  }
  if (hours < 1) return { text: 'soon', overdue: false, urgent: true };
  if (hours < 24) return { text: `in ${hours}h`, overdue: false, urgent: true };
  if (days === 1) return { text: 'tomorrow', overdue: false };
  if (days < 7) return { text: `in ${days}d`, overdue: false };
  return { text: formatDateShort(dateStr), overdue: false };
};

const PRIORITY_CONFIG = {
  urgent: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
  high: { color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)' },
  normal: { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.22)' },
  low: { color: '#8a7a6e', bg: 'rgba(138,122,110,0.08)', border: 'rgba(138,122,110,0.22)' },
};

const STATUS_CONFIG = {
  pending: { color: '#fbbf24', label: 'Pending' },
  in_progress: { color: '#60a5fa', label: 'In Progress' },
  done: { color: '#34d399', label: 'Done' },
  cancelled: { color: '#6b5c52', label: 'Cancelled' },
};

const CATEGORY_CONFIG = {
  renewal: { label: 'Renewal', emoji: '🔄' },
  payment: { label: 'Payment', emoji: '💳' },
  support: { label: 'Support', emoji: '🛟' },
  general: { label: 'General', emoji: '📝' },
};

// ════════════════════════════════════════════════════════════════════
// Stat card
// ════════════════════════════════════════════════════════════════════

const StatCard = ({ label, value, accent, Icon, active, onClick }) => (
  <button
    onClick={onClick}
    className="relative overflow-hidden text-left rounded-xl px-4 py-3 transition-all hover:scale-[1.01]"
    style={{
      background: active ? `${accent}15` : 'rgba(255,255,255,0.018)',
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
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Followup Card
// ════════════════════════════════════════════════════════════════════

const FollowupCard = ({ followup, onEdit, onStatusChange, onDelete }) => {
  const due = timeUntilDue(followup.due_date);
  const pri = PRIORITY_CONFIG[followup.priority] || PRIORITY_CONFIG.normal;
  const stat = STATUS_CONFIG[followup.status] || STATUS_CONFIG.pending;
  const cat = CATEGORY_CONFIG[followup.category] || CATEGORY_CONFIG.general;
  const isOpen = followup.status === 'pending' || followup.status === 'in_progress';

  return (
    <div
      className="rounded-xl p-3 transition-colors"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: `1px solid ${
          due?.overdue && isOpen ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.05)'
        }`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Priority indicator stripe */}
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: pri.color, opacity: isOpen ? 1 : 0.3 }}
        />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h4
              className="text-sm font-semibold tracking-tight"
              style={{
                color: isOpen ? '#fff' : '#8a7a6e',
                textDecoration: followup.status === 'cancelled' ? 'line-through' : 'none',
              }}
            >
              {followup.title}
            </h4>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}
              >
                {followup.priority}
              </span>
              <span
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: `${stat.color}15`,
                  color: stat.color,
                  border: `1px solid ${stat.color}30`,
                }}
              >
                {stat.label}
              </span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] mb-2">
            <span className="flex items-center gap-1" style={{ color: '#8a7a6e' }}>
              <span>{cat.emoji}</span>
              {cat.label}
            </span>

            {followup.user && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono"
                style={{
                  background: 'rgba(96,165,250,0.06)',
                  color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.18)',
                }}
              >
                <UserIcon size={10} />@{followup.user.username}
              </span>
            )}

            {due && (
              <span
                className="flex items-center gap-1 font-semibold tabular-nums"
                style={{
                  color: due.overdue
                    ? '#f87171'
                    : due.urgent
                    ? '#fb923c'
                    : '#8a7a6e',
                }}
              >
                <ClockIcon size={10} />
                {due.text}
              </span>
            )}
          </div>

          {/* Note */}
          {followup.note && (
            <p
              className="text-xs mb-2 whitespace-pre-wrap"
              style={{ color: '#c9b59e', opacity: isOpen ? 1 : 0.6 }}
            >
              {followup.note}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] flex items-center gap-2 flex-wrap" style={{ color: '#6b5c52' }}>
              <span>Due: {formatDateTime(followup.due_date)}</span>
              {followup.creator && <span>· by @{followup.creator.username}</span>}
              {followup.completer && (
                <span style={{ color: '#34d399' }}>
                  · ✓ by @{followup.completer.username}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isOpen && (
                <>
                  {followup.status === 'pending' && (
                    <button
                      onClick={() => onStatusChange(followup.id, 'in_progress')}
                      title="Mark as in progress"
                      className="p-1.5 rounded-md transition-colors"
                      style={{
                        color: '#60a5fa',
                        background: 'rgba(96,165,250,0.08)',
                        border: '1px solid rgba(96,165,250,0.2)',
                      }}
                    >
                      <ClockIcon size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => onStatusChange(followup.id, 'done')}
                    title="Mark as done"
                    className="p-1.5 rounded-md transition-colors"
                    style={{
                      color: '#34d399',
                      background: 'rgba(52,211,153,0.08)',
                      border: '1px solid rgba(52,211,153,0.2)',
                    }}
                  >
                    <CheckCircleIcon size={11} />
                  </button>
                </>
              )}
              {!isOpen && (
                <button
                  onClick={() => onStatusChange(followup.id, 'pending')}
                  title="Reopen"
                  className="p-1.5 rounded-md transition-colors"
                  style={{
                    color: '#fbbf24',
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.2)',
                  }}
                >
                  <ClockIcon size={11} />
                </button>
              )}
              <button
                onClick={() => onEdit(followup)}
                title="Edit"
                className="p-1.5 rounded-md transition-colors"
                style={{
                  color: '#d4a853',
                  background: 'rgba(212,168,83,0.08)',
                  border: '1px solid rgba(212,168,83,0.2)',
                }}
              >
                <EditIcon size={11} />
              </button>
              <button
                onClick={() => onDelete(followup)}
                title="Delete"
                className="p-1.5 rounded-md transition-colors"
                style={{
                  color: '#f87171',
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                }}
              >
                <TrashIcon size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Main Tab
// ════════════════════════════════════════════════════════════════════

export const FollowupTab = ({ onRefreshStats }) => {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' | 'pending' | 'in_progress' | 'done' | 'cancelled' | 'all' | 'overdue'
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null = create mode

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const fetchFollowups = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (statusFilter && statusFilter !== 'all') filters.status = statusFilter;
      if (categoryFilter) filters.category = categoryFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (search) filters.search = search;

      const data = await workspaceApi.listFollowups(filters);
      setFollowups(data.items || []);
    } catch (e) {
      console.error(e);
      showToast('Gagal load follow-ups', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  const handleCreate = () => {
    setEditingItem(null);
    setPanelOpen(true);
  };

  const handleEdit = (f) => {
    setEditingItem(f);
    setPanelOpen(true);
  };

  const handleSave = async (payload) => {
    try {
      if (editingItem) {
        await workspaceApi.updateFollowup(editingItem.id, payload);
        showToast('Follow-up updated');
      } else {
        await workspaceApi.createFollowup(payload);
        showToast('Follow-up created');
      }
      setPanelOpen(false);
      setEditingItem(null);
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Gagal save';
      showToast(msg, 'error');
      throw err;
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await workspaceApi.updateFollowup(id, { status: newStatus });
      showToast(`Status: ${newStatus}`);
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast('Gagal update status', 'error');
    }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete "${f.title}"?`)) return;
    try {
      await workspaceApi.deleteFollowup(f.id);
      showToast('Follow-up deleted');
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast('Gagal delete', 'error');
    }
  };

  // Compute counts from current list (for stat cards)
  const counts = {
    open: followups.filter((f) => f.status === 'pending' || f.status === 'in_progress').length,
    overdue: followups.filter(
      (f) =>
        (f.status === 'pending' || f.status === 'in_progress') &&
        new Date(f.due_date) < new Date()
    ).length,
    today: followups.filter((f) => {
      if (f.status !== 'pending' && f.status !== 'in_progress') return false;
      const d = new Date(f.due_date);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length,
    done: followups.filter((f) => f.status === 'done').length,
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl animate-in fade-in slide-in-from-top-2"
          style={{
            background:
              toast.type === 'error' ? 'rgba(248,113,113,0.18)' : 'rgba(52,211,153,0.18)',
            color: toast.type === 'error' ? '#f87171' : '#34d399',
            border: `1px solid ${
              toast.type === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'
            }`,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white tracking-tight">
            Follow-up Queue
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: '#6b5c52' }}>
            Penagihan, renewal reminder, support tickets — semua terjadwal di sini.
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #d4a853, #8b6914)',
            color: '#0a0506',
          }}
        >
          <PlusIcon size={13} />
          Add Follow-up
        </button>
      </div>

      {/* Stat cards (click to filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Open"
          value={counts.open}
          accent="#60a5fa"
          Icon={ClockIcon}
          active={statusFilter === 'open'}
          onClick={() => setStatusFilter('open')}
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          accent="#f87171"
          Icon={AlertTriangleIcon}
          active={statusFilter === 'overdue'}
          onClick={() => setStatusFilter('overdue')}
        />
        <StatCard
          label="Today"
          value={counts.today}
          accent="#fb923c"
          Icon={ClockIcon}
          active={false}
          onClick={() => {}}
        />
        <StatCard
          label="Done"
          value={counts.done}
          accent="#34d399"
          Icon={CheckCircleIcon}
          active={statusFilter === 'done'}
          onClick={() => setStatusFilter('done')}
        />
      </div>

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
            placeholder="Cari title atau note..."
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
            border: `1px solid ${
              statusFilter && statusFilter !== 'open'
                ? 'rgba(212,168,83,0.35)'
                : 'rgba(255,255,255,0.06)'
            }`,
          }}
        >
          <option value="open">Open (Pending + In Progress)</option>
          <option value="overdue">Overdue Only</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${
              categoryFilter ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.06)'
            }`,
          }}
        >
          <option value="">All Categories</option>
          <option value="renewal">🔄 Renewal</option>
          <option value="payment">💳 Payment</option>
          <option value="support">🛟 Support</option>
          <option value="general">📝 General</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${
              priorityFilter ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.06)'
            }`,
          }}
        >
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>

        {(search || categoryFilter || priorityFilter || statusFilter !== 'open') && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('open');
              setCategoryFilter('');
              setPriorityFilter('');
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

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: '#6b5c52' }}
          >
            <div
              className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }}
            />
            Loading...
          </div>
        </div>
      ) : followups.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.015)',
            border: '1px dashed rgba(255,255,255,0.06)',
          }}
        >
          <ClockIcon size={28} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
          <p className="text-sm font-medium text-white mb-1">Tidak ada follow-up</p>
          <p className="text-[11px] mb-4" style={{ color: '#6b5c52' }}>
            {search || categoryFilter || priorityFilter
              ? 'Coba reset filter atau ubah pencarian.'
              : 'Klik "Add Follow-up" untuk mulai jadwalkan penagihan/reminder.'}
          </p>
          {!search && !categoryFilter && !priorityFilter && (
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: 'rgba(212,168,83,0.12)', color: '#d4a853' }}
            >
              <PlusIcon size={11} /> Add First
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {followups.map((f) => (
            <FollowupCard
              key={f.id}
              followup={f}
              onEdit={handleEdit}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Slide-in panel */}
      <FollowupPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        onSave={handleSave}
      />
    </div>
  );
};
