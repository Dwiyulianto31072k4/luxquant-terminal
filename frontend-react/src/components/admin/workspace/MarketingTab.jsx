// ════════════════════════════════════════════════════════════════════
// MarketingTab — redesign batch 5
//
// Campaign list with budget tracking, flexible metadata + line items.
// ConfirmModal for delete. Full English copy.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { CampaignPanel } from './CampaignPanel';
import { ConfirmModal } from '../users/ConfirmModal';
import {
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  ClockIcon,
  TrendingUpIcon,
  TelegramIcon,
  DiscordIcon,
} from '../Icons';

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatCurrency = (val) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const STATUS_CONFIG = {
  planning: { color: '#a78bfa', label: 'Planning', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  active: { color: '#34d399', label: 'Active', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' },
  paused: { color: '#fbbf24', label: 'Paused', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' },
  completed: { color: '#60a5fa', label: 'Completed', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)' },
  cancelled: { color: '#6b5c52', label: 'Cancelled', bg: 'rgba(107,92,82,0.1)', border: 'rgba(107,92,82,0.3)' },
};

const TwitterIcon = ({ size = 14, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const PLATFORM_CONFIG = {
  twitter: { Icon: TwitterIcon, label: 'Twitter/X', color: '#fff' },
  telegram: { Icon: TelegramIcon, label: 'Telegram', color: '#229ED9' },
  discord: { Icon: DiscordIcon, label: 'Discord', color: '#5865F2' },
  influencer: { Icon: SparklesIcon, label: 'Influencer', color: '#d4a853' },
  other: { Icon: TrendingUpIcon, label: 'Other', color: '#8a7a6e' },
};

/* ── Header ───────────────────────────────────────────────────────── */

const MarketingHeader = ({ onCreate }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div className="flex items-start gap-3 min-w-0">
      <div className="relative shrink-0" style={{ width: 38, height: 38 }}>
        <div className="absolute inset-0 rounded-xl" style={{ background: 'rgba(167,139,250,0.18)', filter: 'blur(12px)' }} />
        <div className="relative w-full h-full rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.20), rgba(167,139,250,0.04))', border: '1px solid rgba(167,139,250,0.30)', color: '#a78bfa' }}>
          <SparklesIcon size={18} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold" style={{ color: 'rgba(167,139,250,0.7)' }}>
          Growth & Spend
        </p>
        <h2 className="text-lg font-semibold text-white tracking-tight">Marketing Budget</h2>
        <p className="text-[11px] mt-0.5 max-w-md" style={{ color: '#8a7a6e' }}>
          Track campaign budgets, line items, and custom KPIs per platform.
        </p>
      </div>
    </div>
    <button onClick={onCreate}
      className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
      style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>
      <PlusIcon size={13} />
      New Campaign
    </button>
  </div>
);

/* ── Stat card ────────────────────────────────────────────────────── */

const StatCard = ({ label, value, accent, Icon }) => (
  <div className="relative overflow-hidden rounded-xl px-4 py-3"
    style={{ background: '#0a0805', border: '1px solid rgba(255,255,255,0.07)' }}>
    <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
      style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.2), transparent)' }} />
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </span>
      {Icon && (
        <span className="flex items-center justify-center rounded-md" style={{ width: 22, height: 22, background: `${accent}14`, color: accent }}>
          <Icon size={12} />
        </span>
      )}
    </div>
    <p className="text-2xl font-bold tracking-tight tabular-nums leading-none" style={{ color: '#fff' }}>
      {value ?? '—'}
    </p>
  </div>
);

/* ── Campaign card ────────────────────────────────────────────────── */

const CampaignCard = ({ campaign, onEdit, onDelete }) => {
  const stat = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.planning;
  const platCfg = PLATFORM_CONFIG[campaign.platform] || PLATFORM_CONFIG.other;
  const PlatIcon = platCfg.Icon;

  const budget = Number(campaign.budget_usd) || 0;
  const spent = Number(campaign.spent_usd) || 0;
  const remaining = budget - spent;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const overBudget = spent > budget && budget > 0;

  const lineItemCount = (campaign.line_items || []).length;
  const metadataKeys = Object.keys(campaign.metadata || {}).length;

  return (
    <div className="relative overflow-hidden rounded-xl p-4 transition-colors"
      style={{ background: '#0a0805', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, rgba(212,168,83,0.2), transparent)' }} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,0,0,0.3)', color: platCfg.color, border: '1px solid rgba(255,255,255,0.06)' }}>
            <PlatIcon size={15} {...(campaign.platform === 'telegram' || campaign.platform === 'discord' ? { colored: true } : {})} />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white tracking-tight truncate">{campaign.name}</h4>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: '#6b5c52' }}>{platCfg.label}</p>
          </div>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
          style={{ background: stat.bg, color: stat.color, border: `1px solid ${stat.border}` }}>
          {stat.label}
        </span>
      </div>

      {campaign.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: '#c9b59e', lineHeight: '1.5' }}>
          {campaign.description}
        </p>
      )}

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-light tabular-nums tracking-tight" style={{ color: overBudget ? '#f87171' : '#fff' }}>
              {formatCurrency(spent)}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: '#6b5c52' }}>/ {formatCurrency(budget)}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold tabular-nums"
            style={{ color: overBudget ? '#f87171' : pct > 80 ? '#fb923c' : '#34d399' }}>
            {pct.toFixed(0)}%
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="h-full transition-all"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: overBudget
                ? 'linear-gradient(90deg, #f87171, #fbbf24)'
                : pct > 80
                ? 'linear-gradient(90deg, #d4a853, #fb923c)'
                : 'linear-gradient(90deg, #34d399, #d4a853)',
            }} />
        </div>

        {!overBudget && budget > 0 && (
          <p className="text-[10px] mt-1 tabular-nums" style={{ color: '#6b5c52' }}>{formatCurrency(remaining)} remaining</p>
        )}
        {overBudget && (
          <p className="text-[10px] mt-1 tabular-nums" style={{ color: '#f87171' }}>Over budget by {formatCurrency(spent - budget)}</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3 text-[10px]">
        {(campaign.start_date || campaign.end_date) && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.02)', color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.04)' }}>
            <ClockIcon size={10} />
            {formatDate(campaign.start_date)} → {formatDate(campaign.end_date)}
          </span>
        )}
        {lineItemCount > 0 && (
          <span className="px-2 py-0.5 rounded font-medium"
            style={{ background: 'rgba(96,165,250,0.06)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.18)' }}>
            {lineItemCount} line item{lineItemCount > 1 ? 's' : ''}
          </span>
        )}
        {metadataKeys > 0 && (
          <span className="px-2 py-0.5 rounded font-medium"
            style={{ background: 'rgba(212,168,83,0.06)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.22)' }}>
            {metadataKeys} custom field{metadataKeys > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px]" style={{ color: '#4a3f39' }}>
          {campaign.creator && <>by @{campaign.creator.username} · </>}
          {formatDate(campaign.created_at)}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(campaign)} title="Edit" className="p-1.5 rounded-md transition-colors"
            style={{ color: '#d4a853', background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)' }}>
            <EditIcon size={11} />
          </button>
          <button onClick={() => onDelete(campaign)} title="Delete" className="p-1.5 rounded-md transition-colors"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
            <TrashIcon size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Toast ────────────────────────────────────────────────────────── */

const Toast = ({ toast }) => {
  if (!toast) return null;
  const isError = toast.type === 'error';
  const color = isError ? '#f87171' : '#34d399';
  return (
    <div className="fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-2xl"
      style={{ background: isError ? 'rgba(248,113,113,0.18)' : 'rgba(52,211,153,0.18)', color, border: `1px solid ${color}40`, backdropFilter: 'blur(12px)' }}>
      {toast.msg}
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   Main
   ════════════════════════════════════════════════════════════════════ */

export const MarketingTab = ({ onRefreshStats }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (platformFilter) filters.platform = platformFilter;
      if (search) filters.search = search;

      const data = await workspaceApi.listCampaigns(filters);
      setCampaigns(data.items || []);
    } catch (e) {
      console.error(e);
      showToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter, search]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreate = () => {
    setEditingItem(null);
    setPanelOpen(true);
  };

  const handleEdit = (c) => {
    setEditingItem(c);
    setPanelOpen(true);
  };

  const handleSave = async (payload) => {
    try {
      if (editingItem) {
        await workspaceApi.updateCampaign(editingItem.id, payload);
        showToast('Campaign updated');
      } else {
        await workspaceApi.createCampaign(payload);
        showToast('Campaign created');
      }
      setPanelOpen(false);
      setEditingItem(null);
      fetchCampaigns();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      throw err;
    }
  };

  const handleDelete = (c) => {
    setConfirmModal({
      title: 'Delete Campaign',
      message: `Delete campaign "${c.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Keep it',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await workspaceApi.deleteCampaign(c.id);
          showToast('Campaign deleted');
          fetchCampaigns();
          if (onRefreshStats) onRefreshStats();
        } catch (e) {
          showToast('Failed to delete', 'error');
          throw e;
        }
      },
    });
  };

  const totalBudget = campaigns.reduce((sum, c) => sum + (Number(c.budget_usd) || 0), 0);
  const totalSpent = campaigns.reduce((sum, c) => sum + (Number(c.spent_usd) || 0), 0);
  const activeCount = campaigns.filter((c) => c.status === 'active').length;

  const hasFilters = search || statusFilter || platformFilter;

  const fieldStyle = (active) => ({
    background: 'rgba(0,0,0,0.28)',
    border: `1px solid ${active ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.06)'}`,
  });

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <MarketingHeader onCreate={handleCreate} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Total Campaigns" value={campaigns.length} accent="#60a5fa" Icon={SparklesIcon} />
        <StatCard label="Active" value={activeCount} accent="#34d399" Icon={TrendingUpIcon} />
        <StatCard label="Total Budget" value={formatCurrency(totalBudget)} accent="#d4a853" />
        <StatCard label="Total Spent" value={formatCurrency(totalSpent)} accent={totalSpent > totalBudget ? '#f87171' : '#fb923c'} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#6b5c52' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaign name or description…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-white focus:outline-none" style={fieldStyle(!!search)} />
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none cursor-pointer" style={fieldStyle(!!statusFilter)}>
          <option value="">All Statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-white focus:outline-none cursor-pointer" style={fieldStyle(!!platformFilter)}>
          <option value="">All Platforms</option>
          <option value="twitter">Twitter/X</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
          <option value="influencer">Influencer</option>
          <option value="other">Other</option>
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(''); setStatusFilter(''); setPlatformFilter(''); }}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            style={{ color: '#f87171', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}>
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2 text-xs" style={{ color: '#6b5c52' }}>
            <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }} />
            Loading…
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="relative text-center py-16 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.08)' }}>
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'rgba(167,139,250,0.08)', filter: 'blur(40px)' }} />
          <div className="relative">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.22)', color: '#a78bfa' }}>
              <SparklesIcon size={20} />
            </div>
            <p className="text-sm font-semibold text-white mb-1">
              {hasFilters ? 'No campaigns match these filters' : 'No campaigns yet'}
            </p>
            <p className="text-[11.5px] mb-4" style={{ color: '#8a7a6e' }}>
              {hasFilters ? 'Try adjusting the filters or search.' : 'Start tracking your first marketing campaign.'}
            </p>
            <button onClick={hasFilters ? () => { setSearch(''); setStatusFilter(''); setPlatformFilter(''); } : handleCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider"
              style={{ background: 'rgba(212,168,83,0.10)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.28)' }}>
              {hasFilters ? 'Reset filters' : <><PlusIcon size={11} /> Create first campaign</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <CampaignPanel
        isOpen={panelOpen}
        onClose={() => { setPanelOpen(false); setEditingItem(null); }}
        editingItem={editingItem}
        onSave={handleSave}
      />

      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}
    </div>
  );
};
