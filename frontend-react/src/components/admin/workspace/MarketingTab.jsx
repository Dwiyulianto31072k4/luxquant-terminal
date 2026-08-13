// ════════════════════════════════════════════════════════════════════
// MarketingTab — redesign batch 5
//
// Campaign list with budget tracking, flexible metadata + line items.
// ConfirmModal for delete. Full English copy.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { CampaignPanel } from "./CampaignPanel";
import { XApiSpendPanel } from "./XApiSpendPanel";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";
import { ConfirmModal } from "../users/ConfirmModal";
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
} from "../Icons";
import { IconBadge } from "../primitives";

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatCurrency = (val) => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const STATUS_CONFIG = {
  planning: {
    color: "rgb(var(--fg-muted))",
    label: "Planning",
    bg: "rgb(var(--ink) / 0.06)",
    border: "rgb(var(--ink) / 0.14)",
  },
  active: {
    color: "rgb(var(--pos-text))",
    label: "Active",
    bg: "rgb(var(--pos) / 0.1)",
    border: "rgb(var(--pos) / 0.3)",
  },
  paused: {
    color: "rgb(var(--accent-text))",
    label: "Paused",
    bg: "rgb(var(--accent) / 0.1)",
    border: "rgb(var(--accent) / 0.3)",
  },
  completed: {
    color: "rgb(var(--fg-secondary))",
    label: "Completed",
    bg: "rgb(var(--ink) / 0.06)",
    border: "rgb(var(--ink) / 0.14)",
  },
  cancelled: {
    color: "rgb(var(--fg-muted))",
    label: "Cancelled",
    bg: "rgb(var(--ink) / 0.04)",
    border: "rgb(var(--ink) / 0.1)",
  },
};

const TwitterIcon = ({ size = 14, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const PLATFORM_CONFIG = {
  twitter: { Icon: TwitterIcon, label: "Twitter/X", color: "rgb(var(--fg-muted))" },
  telegram: { Icon: TelegramIcon, label: "Telegram", color: "rgb(var(--fg-muted))" },
  discord: { Icon: DiscordIcon, label: "Discord", color: "rgb(var(--fg-muted))" },
  influencer: { Icon: SparklesIcon, label: "Influencer", color: "rgb(var(--accent-text))" },
  other: { Icon: TrendingUpIcon, label: "Other", color: "rgb(var(--fg-muted))" },
};

/* ── Header ───────────────────────────────────────────────────────── */

const MarketingHeader = ({ onCreate }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <IconBadge Icon={SparklesIcon} color="rgb(var(--fg-muted))" size={38} iconSize={18} />
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
          Growth & Spend
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">Marketing Budget</h2>
        <p className="mt-0.5 max-w-md text-[11px] text-text-muted">
          Track campaign budgets, line items, and custom KPIs per platform.
        </p>
      </div>
    </div>
    <button
      onClick={onCreate}
      className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent-fg transition-colors hover:opacity-90"
    >
      <PlusIcon size={13} />
      New Campaign
    </button>
  </div>
);

/* ── Stat card ────────────────────────────────────────────────────── */

const StatCard = ({ label, value, Icon }) => (
  <div className="rounded-xl border border-ink/[0.07] bg-surface-raised px-4 py-3">
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {Icon && (
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-ink/[0.05] text-text-muted">
          <Icon size={12} />
        </span>
      )}
    </div>
    <p className="text-2xl font-bold leading-none tracking-tight tabular-nums text-text-primary">
      {value ?? "—"}
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
    <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-4 transition-colors">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink/[0.08] bg-surface-secondary text-text-muted">
            <PlatIcon size={15} />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold tracking-tight text-text-primary">
              {campaign.name}
            </h4>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">{platCfg.label}</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ background: stat.bg, color: stat.color, border: `1px solid ${stat.border}` }}
        >
          {stat.label}
        </span>
      </div>

      {campaign.description && (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-text-secondary">
          {campaign.description}
        </p>
      )}

      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-light tracking-tight tabular-nums ${
                overBudget ? "text-loss" : "text-text-primary"
              }`}
            >
              {formatCurrency(spent)}
            </span>
            <span className="text-[11px] tabular-nums text-text-muted">
              / {formatCurrency(budget)}
            </span>
          </div>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider tabular-nums ${
              overBudget ? "text-loss" : pct > 80 ? "text-accent" : "text-profit"
            }`}
          >
            {pct.toFixed(0)}%
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${
              overBudget ? "bg-loss" : pct > 80 ? "bg-accent" : "bg-profit"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>

        {!overBudget && budget > 0 && (
          <p className="mt-1 text-[10px] tabular-nums text-text-muted">
            {formatCurrency(remaining)} remaining
          </p>
        )}
        {overBudget && (
          <p className="mt-1 text-[10px] tabular-nums text-loss">
            Over budget by {formatCurrency(spent - budget)}
          </p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px]">
        {(campaign.start_date || campaign.end_date) && (
          <span className="flex items-center gap-1 rounded-md border border-ink/[0.07] bg-surface-secondary/50 px-2 py-0.5 text-text-muted">
            <ClockIcon size={10} />
            {formatDate(campaign.start_date)} → {formatDate(campaign.end_date)}
          </span>
        )}
        {lineItemCount > 0 && (
          <span className="rounded-md border border-ink/[0.08] bg-surface-raised px-2 py-0.5 font-medium text-text-muted">
            {lineItemCount} line item{lineItemCount > 1 ? "s" : ""}
          </span>
        )}
        {metadataKeys > 0 && (
          <span className="rounded-md border border-ink/[0.08] bg-surface-secondary/50 px-2 py-0.5 font-medium text-text-secondary">
            {metadataKeys} custom field{metadataKeys > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2.5">
        <p className="text-[10px] text-text-muted">
          {campaign.creator && <>by @{campaign.creator.username} · </>}
          {formatDate(campaign.created_at)}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onEdit(campaign)}
            title="Edit"
            className="rounded-xl border border-ink/[0.08] bg-surface-raised p-1.5 text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary"
          >
            <EditIcon size={11} />
          </button>
          <button
            onClick={() => onDelete(campaign)}
            title="Delete"
            className="rounded-xl border border-loss/20 bg-loss/10 p-1.5 text-loss transition-colors"
          >
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
  const isError = toast.type === "error";
  return (
    <div
      className={`lq-toast-safe fixed right-4 z-[100000] rounded-xl border px-4 py-2.5 text-[12px] font-medium shadow-2xl backdrop-blur ${
        isError
          ? "border-loss/30 bg-loss/15 text-loss"
          : "border-profit/30 bg-profit/15 text-profit"
      }`}
    >
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);
  const campaignPages = useCollectionPagination(campaigns, 8);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (msg, type = "success") => setToast({ msg, type });

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
      showToast("Failed to load campaigns", "error");
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
    if (editingItem) {
      await workspaceApi.updateCampaign(editingItem.id, payload);
      showToast("Campaign updated");
    } else {
      await workspaceApi.createCampaign(payload);
      showToast("Campaign created");
    }
    setPanelOpen(false);
    setEditingItem(null);
    fetchCampaigns();
    if (onRefreshStats) onRefreshStats();
  };

  const handleDelete = (c) => {
    setConfirmModal({
      title: "Delete Campaign",
      message: `Delete campaign "${c.name}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Keep it",
      variant: "danger",
      onConfirm: async () => {
        try {
          await workspaceApi.deleteCampaign(c.id);
          showToast("Campaign deleted");
          fetchCampaigns();
          if (onRefreshStats) onRefreshStats();
        } catch (e) {
          showToast("Failed to delete", "error");
          throw e;
        }
      },
    });
  };

  const totalBudget = campaigns.reduce((sum, c) => sum + (Number(c.budget_usd) || 0), 0);
  const totalSpent = campaigns.reduce((sum, c) => sum + (Number(c.spent_usd) || 0), 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  const hasFilters = search || statusFilter || platformFilter;

  const fieldCls = (active) =>
    `rounded-xl border bg-surface-raised px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-ink/15 transition-colors ${
      active ? "border-ink/14" : "border-ink/[0.08]"
    }`;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <XApiSpendPanel />

      <div className="h-px w-full bg-ink/[0.07]" />

      <MarketingHeader onCreate={handleCreate} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Total Campaigns" value={campaigns.length} Icon={SparklesIcon} />
        <StatCard label="Active" value={activeCount} Icon={TrendingUpIcon} />
        <StatCard label="Total Budget" value={formatCurrency(totalBudget)} />
        <StatCard label="Total Spent" value={formatCurrency(totalSpent)} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              campaignPages.resetPage();
            }}
            placeholder="Search campaign name or description…"
            className={`w-full pl-9 pr-3 ${fieldCls(!!search)}`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            campaignPages.resetPage();
          }}
          className={`cursor-pointer ${fieldCls(!!statusFilter)}`}
        >
          <option value="">All Statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={platformFilter}
          onChange={(e) => {
            setPlatformFilter(e.target.value);
            campaignPages.resetPage();
          }}
          className={`cursor-pointer ${fieldCls(!!platformFilter)}`}
        >
          <option value="">All Platforms</option>
          <option value="twitter">Twitter/X</option>
          <option value="telegram">Telegram</option>
          <option value="discord">Discord</option>
          <option value="influencer">Influencer</option>
          <option value="other">Other</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setPlatformFilter("");
            }}
            className="flex items-center gap-1.5 rounded-xl border border-loss/20 bg-loss/10 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-loss transition-colors"
          >
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2.5 text-xs text-text-muted">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
            Loading…
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/[0.08] bg-surface-raised py-16 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-ink/[0.08] bg-surface-secondary text-text-muted">
            <SparklesIcon size={20} />
          </div>
          <p className="mb-1 text-sm font-semibold text-text-primary">
            {hasFilters ? "No campaigns match these filters" : "No campaigns yet"}
          </p>
          <p className="mb-4 text-[11.5px] text-text-muted">
            {hasFilters
              ? "Try adjusting the filters or search."
              : "Start tracking your first marketing campaign."}
          </p>
          <button
            onClick={
              hasFilters
                ? () => {
                    setSearch("");
                    setStatusFilter("");
                    setPlatformFilter("");
                  }
                : handleCreate
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-ink/14"
          >
            {hasFilters ? (
              "Reset filters"
            ) : (
              <>
                <PlusIcon size={11} /> Create first campaign
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {campaignPages.pagedItems.map((c) => (
            <CampaignCard key={c.id} campaign={c} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <CollectionPagination
        page={campaignPages.page}
        totalPages={campaignPages.totalPages}
        total={campaignPages.total}
        pageSize={campaignPages.pageSize}
        onPageChange={campaignPages.setPage}
        onPageSizeChange={campaignPages.setPageSize}
        pageSizeOptions={[8, 16, 32]}
        itemLabel="campaigns"
      />

      <CampaignPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        onSave={handleSave}
      />

      {confirmModal && <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />}
    </div>
  );
};
