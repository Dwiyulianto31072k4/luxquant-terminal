// ════════════════════════════════════════════════════════════════════
// FollowupTab — redesign batch 5
//
// Follow-up queue: filters, status changes, CRUD via slide-in panel.
// ConfirmModal for delete (object-payload). Full English copy.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { FollowupPanel } from "./FollowupPanel";
import { ConfirmModal } from "../users/ConfirmModal";
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
} from "../Icons";
import { IconBadge } from "../primitives";

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatDateTime = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const timeUntilDue = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (diff < 0) {
    const overdueDays = Math.abs(days);
    if (overdueDays === 0) return { text: "overdue today", overdue: true };
    return { text: `${overdueDays}d overdue`, overdue: true };
  }
  if (hours < 1) return { text: "soon", overdue: false, urgent: true };
  if (hours < 24) return { text: `in ${hours}h`, overdue: false, urgent: true };
  if (days === 1) return { text: "tomorrow", overdue: false };
  if (days < 7) return { text: `in ${days}d`, overdue: false };
  return { text: formatDateShort(dateStr), overdue: false };
};

const PRIORITY_CONFIG = {
  urgent: {
    color: "rgb(var(--neg-text))",
    bg: "rgb(var(--neg) / 0.1)",
    border: "rgb(var(--neg) / 0.3)",
  },
  high: {
    color: "rgb(var(--accent-text))",
    bg: "rgb(var(--accent) / 0.1)",
    border: "rgb(var(--accent) / 0.3)",
  },
  normal: {
    color: "rgb(var(--fg-muted))",
    bg: "rgb(var(--ink) / 0.06)",
    border: "rgb(var(--ink) / 0.14)",
  },
  low: {
    color: "rgb(var(--fg-muted))",
    bg: "rgb(var(--ink) / 0.04)",
    border: "rgb(var(--ink) / 0.1)",
  },
};

const STATUS_CONFIG = {
  pending: { color: "rgb(var(--accent-text))", label: "Pending" },
  in_progress: { color: "rgb(var(--fg-secondary))", label: "In Progress" },
  done: { color: "rgb(var(--pos-text))", label: "Done" },
  cancelled: { color: "rgb(var(--fg-muted))", label: "Cancelled" },
};

const CATEGORY_CONFIG = {
  renewal: { label: "Renewal", emoji: "🔄" },
  winback: { label: "Win-back", emoji: "🎯" },
  payment: { label: "Payment", emoji: "💳" },
  support: { label: "Support", emoji: "🛟" },
  general: { label: "General", emoji: "📝" },
};

/* ── Header ───────────────────────────────────────────────────────── */

const SparkIcon = ({ size = 13 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

const FollowupHeader = ({ onCreate, onGenerate, generating }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <IconBadge Icon={ClockIcon} color="rgb(var(--fg-muted))" size={38} iconSize={18} />
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
          Outreach Queue
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">Follow-up Queue</h2>
        <p className="mt-0.5 max-w-md text-[11px] text-text-muted">
          Collections, renewal reminders, and support tickets — all scheduled here.
        </p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={onGenerate}
        disabled={generating}
        title="Auto-create renewal & win-back follow-ups from the subscription lifecycle"
        className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary disabled:opacity-50"
      >
        <SparkIcon size={13} />
        {generating ? "Generating…" : "Generate"}
      </button>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent-fg transition-colors hover:opacity-90"
      >
        <PlusIcon size={13} />
        Add Follow-up
      </button>
    </div>
  </div>
);

/* ── Stat card ────────────────────────────────────────────────────── */

const StatCard = ({ label, value, accent, Icon, active, onClick, alert }) => (
  <button
    onClick={onClick}
    className={`rounded-xl border bg-surface-raised px-4 py-3 text-left transition-colors ${
      active ? "border-ink/14" : "border-ink/[0.07] hover:border-ink/12"
    }`}
  >
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {Icon && (
        <span
          className={`flex h-[22px] w-[22px] items-center justify-center rounded-md bg-ink/[0.05] text-text-muted ${alert ? "animate-pulse text-loss" : ""}`}
          style={accent && !alert ? { color: accent } : undefined}
        >
          <Icon size={12} />
        </span>
      )}
    </div>
    <p
      className={`text-2xl font-bold leading-none tracking-tight tabular-nums ${
        alert ? "text-loss" : "text-text-primary"
      }`}
    >
      {value ?? "—"}
    </p>
  </button>
);

/* ── Followup card ────────────────────────────────────────────────── */

const FollowupCard = ({ followup, onEdit, onStatusChange, onDelete }) => {
  const due = timeUntilDue(followup.due_date);
  const pri = PRIORITY_CONFIG[followup.priority] || PRIORITY_CONFIG.normal;
  const stat = STATUS_CONFIG[followup.status] || STATUS_CONFIG.pending;
  const cat = CATEGORY_CONFIG[followup.category] || CATEGORY_CONFIG.general;
  const isOpen = followup.status === "pending" || followup.status === "in_progress";

  return (
    <div
      className={`rounded-xl border bg-surface-raised p-3 transition-colors ${
        due?.overdue && isOpen ? "border-loss/25" : "border-ink/[0.07]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ background: pri.color, opacity: isOpen ? 1 : 0.3 }}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-start justify-between gap-2.5">
            <h4
              className={`text-sm font-semibold tracking-tight ${
                isOpen ? "text-text-primary" : "text-text-muted"
              } ${followup.status === "cancelled" ? "line-through" : ""}`}
            >
              {followup.title}
            </h4>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}
              >
                {followup.priority}
              </span>
              <span
                className="rounded-md border border-ink/[0.1] bg-ink/[0.04] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: stat.color }}
              >
                {stat.label}
              </span>
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2.5 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <span>{cat.emoji}</span>
              {cat.label}
            </span>
            {followup.user && (
              <span className="flex items-center gap-1 rounded-md border border-ink/[0.08] bg-surface-secondary/50 px-1.5 py-0.5 font-mono text-text-secondary">
                <UserIcon size={10} />@{followup.user.username}
              </span>
            )}
            {due && (
              <span
                className={`flex items-center gap-1 font-semibold tabular-nums ${
                  due.overdue
                    ? "text-loss"
                    : due.urgent
                      ? "text-accent"
                      : "text-text-muted"
                }`}
              >
                <ClockIcon size={10} />
                {due.text}
              </span>
            )}
          </div>

          {followup.note && (
            <p
              className={`mb-2 whitespace-pre-wrap text-xs text-text-secondary ${
                isOpen ? "" : "opacity-60"
              }`}
            >
              {followup.note}
            </p>
          )}

          <div className="flex items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
              <span>Due {formatDateTime(followup.due_date)}</span>
              {followup.creator && <span>· by @{followup.creator.username}</span>}
              {followup.completer && (
                <span className="text-profit">
                  · ✓ by @{followup.completer.username}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {isOpen && (
                <>
                  {followup.status === "pending" && (
                    <button
                      onClick={() => onStatusChange(followup.id, "in_progress")}
                      title="Mark as in progress"
                      className="rounded-xl border border-ink/[0.08] bg-surface-raised p-1.5 text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary"
                    >
                      <ClockIcon size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => onStatusChange(followup.id, "done")}
                    title="Mark as done"
                    className="rounded-xl border border-profit/20 bg-profit/10 p-1.5 text-profit transition-colors"
                  >
                    <CheckCircleIcon size={11} />
                  </button>
                </>
              )}
              {!isOpen && (
                <button
                  onClick={() => onStatusChange(followup.id, "pending")}
                  title="Reopen"
                  className="rounded-xl border border-accent/20 bg-accent/10 p-1.5 text-accent transition-colors"
                >
                  <ClockIcon size={11} />
                </button>
              )}
              <button
                onClick={() => onEdit(followup)}
                title="Edit"
                className="rounded-xl border border-ink/[0.08] bg-surface-raised p-1.5 text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary"
              >
                <EditIcon size={11} />
              </button>
              <button
                onClick={() => onDelete(followup)}
                title="Delete"
                className="rounded-xl border border-loss/20 bg-loss/10 p-1.5 text-loss transition-colors"
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

export const FollowupTab = ({ onRefreshStats }) => {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const fetchFollowups = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (statusFilter && statusFilter !== "all") filters.status = statusFilter;
      if (categoryFilter) filters.category = categoryFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (search) filters.search = search;

      const data = await workspaceApi.listFollowups(filters);
      setFollowups(data.items || []);
    } catch (e) {
      console.error(e);
      showToast("Failed to load follow-ups", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await workspaceApi.generateFollowups({ renewal: true, winback: true });
      showToast(res.message || "Follow-ups generated");
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
      showToast(e.response?.data?.detail || "Failed to generate follow-ups", "error");
    } finally {
      setGenerating(false);
    }
  };

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
        showToast("Follow-up updated");
      } else {
        await workspaceApi.createFollowup(payload);
        showToast("Follow-up created");
      }
      setPanelOpen(false);
      setEditingItem(null);
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to save";
      showToast(msg, "error");
      throw err;
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await workspaceApi.updateFollowup(id, { status: newStatus });
      showToast(`Status changed to ${newStatus.replace("_", " ")}`);
      fetchFollowups();
      if (onRefreshStats) onRefreshStats();
    } catch {
      showToast("Failed to update status", "error");
    }
  };

  const handleDelete = (f) => {
    setConfirmModal({
      title: "Delete Follow-up",
      message: `Delete "${f.title}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Keep it",
      variant: "danger",
      onConfirm: async () => {
        try {
          await workspaceApi.deleteFollowup(f.id);
          showToast("Follow-up deleted");
          fetchFollowups();
          if (onRefreshStats) onRefreshStats();
        } catch (e) {
          showToast("Failed to delete", "error");
          throw e;
        }
      },
    });
  };

  const counts = {
    open: followups.filter((f) => f.status === "pending" || f.status === "in_progress").length,
    overdue: followups.filter(
      (f) =>
        (f.status === "pending" || f.status === "in_progress") && new Date(f.due_date) < new Date()
    ).length,
    today: followups.filter((f) => {
      if (f.status !== "pending" && f.status !== "in_progress") return false;
      const d = new Date(f.due_date);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length,
    done: followups.filter((f) => f.status === "done").length,
  };

  const hasFilters = search || categoryFilter || priorityFilter || statusFilter !== "open";

  const fieldCls = (active) =>
    `rounded-xl border bg-surface-raised px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-ink/15 transition-colors ${
      active ? "border-ink/14" : "border-ink/[0.08]"
    }`;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <FollowupHeader onCreate={handleCreate} onGenerate={handleGenerate} generating={generating} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          label="Open"
          value={counts.open}
          accent="rgb(var(--fg-muted))"
          Icon={ClockIcon}
          active={statusFilter === "open"}
          onClick={() => setStatusFilter("open")}
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          accent="rgb(var(--neg-text))"
          Icon={AlertTriangleIcon}
          active={statusFilter === "overdue"}
          onClick={() => setStatusFilter("overdue")}
          alert={counts.overdue > 0}
        />
        <StatCard
          label="Due Today"
          value={counts.today}
          accent="rgb(var(--accent-text))"
          Icon={ClockIcon}
          active={false}
          onClick={() => {}}
        />
        <StatCard
          label="Done"
          value={counts.done}
          accent="rgb(var(--pos-text))"
          Icon={CheckCircleIcon}
          active={statusFilter === "done"}
          onClick={() => setStatusFilter("done")}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or note…"
            className={`w-full pl-9 pr-3 ${fieldCls(!!search)}`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`cursor-pointer ${fieldCls(statusFilter !== "open")}`}
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
          className={`cursor-pointer ${fieldCls(!!categoryFilter)}`}
        >
          <option value="">All Categories</option>
          <option value="renewal">🔄 Renewal</option>
          <option value="winback">🎯 Win-back</option>
          <option value="payment">💳 Payment</option>
          <option value="support">🛟 Support</option>
          <option value="general">📝 General</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className={`cursor-pointer ${fieldCls(!!priorityFilter)}`}
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("open");
              setCategoryFilter("");
              setPriorityFilter("");
            }}
            className="flex items-center gap-1.5 rounded-xl border border-loss/20 bg-loss/10 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-loss transition-colors"
          >
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2.5 text-xs text-text-muted">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
            Loading…
          </div>
        </div>
      ) : followups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/[0.08] bg-surface-raised py-16 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-ink/[0.08] bg-surface-secondary text-text-muted">
            <ClockIcon size={20} />
          </div>
          <p className="mb-1 text-sm font-semibold text-text-primary">
            {hasFilters ? "No follow-ups match these filters" : "No follow-ups yet"}
          </p>
          <p className="mb-4 text-[11.5px] text-text-muted">
            {hasFilters
              ? "Try adjusting the filters or search."
              : "Schedule your first collection or renewal reminder."}
          </p>
          <button
            onClick={
              hasFilters
                ? () => {
                    setSearch("");
                    setStatusFilter("open");
                    setCategoryFilter("");
                    setPriorityFilter("");
                  }
                : handleCreate
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-ink/14"
          >
            {hasFilters ? (
              "Reset filters"
            ) : (
              <>
                <PlusIcon size={11} /> Add first follow-up
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
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

      <FollowupPanel
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
