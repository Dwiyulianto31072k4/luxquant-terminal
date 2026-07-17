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
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.3)",
  },
  high: { color: "#fb923c", bg: "rgba(251,146,60,0.1)", border: "rgba(251,146,60,0.3)" },
  normal: { color: "#8a8a93", bg: "rgba(138,138,147,0.08)", border: "rgba(138,138,147,0.22)" },
  low: {
    color: "rgb(var(--fg-muted))",
    bg: "rgba(138,122,110,0.08)",
    border: "rgba(138,122,110,0.22)",
  },
};

const STATUS_CONFIG = {
  pending: { color: "rgb(var(--warn))", label: "Pending" },
  in_progress: { color: "#8a8a93", label: "In Progress" },
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
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <div className="flex items-start gap-3 min-w-0">
      <IconBadge Icon={ClockIcon} color="#8a8a93" size={38} iconSize={18} />
      <div className="min-w-0">
        <p
          className="text-[9.5px] uppercase tracking-[0.18em] font-bold"
          style={{ color: "rgba(138,138,147,0.7)" }}
        >
          Outreach Queue
        </p>
        <h2 className="text-lg font-semibold text-text-primary tracking-tight">Follow-up Queue</h2>
        <p className="text-[11px] mt-0.5 max-w-md" style={{ color: "rgb(var(--fg-muted))" }}>
          Collections, renewal reminders, and support tickets — all scheduled here.
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onGenerate}
        disabled={generating}
        title="Auto-create renewal & win-back follow-ups from the subscription lifecycle"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
        style={{
          background: "rgba(138,138,147,0.10)",
          color: "#8a8a93",
          border: "1px solid rgba(138,138,147,0.28)",
        }}
        onMouseEnter={(e) => {
          if (!generating) e.currentTarget.style.background = "rgba(138,138,147,0.18)";
        }}
        onMouseLeave={(e) => {
          if (!generating) e.currentTarget.style.background = "rgba(138,138,147,0.10)";
        }}
      >
        <SparkIcon size={13} />
        {generating ? "Generating…" : "Generate"}
      </button>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
        style={{
          background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent)))",
          color: "rgb(var(--surface))",
        }}
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
    className="relative overflow-hidden text-left rounded-xl px-4 py-3 transition-all"
    style={{
      background: "rgb(var(--surface-raised))",
      border: `1px solid ${active ? `${accent}80` : "rgb(var(--ink) / 0.07)"}`,
    }}
    onMouseEnter={(e) => {
      if (!active) e.currentTarget.style.borderColor = "rgb(var(--accent) / 0.25)";
    }}
    onMouseLeave={(e) => {
      if (!active) e.currentTarget.style.borderColor = "rgb(var(--ink) / 0.07)";
    }}
  >
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none"
      style={{
        background: `linear-gradient(to right, transparent, rgb(var(--accent) / ${active ? 0.4 : 0.2}), transparent)`,
      }}
    />
    <div className="relative flex items-center justify-between mb-1.5">
      <span
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "rgb(var(--ink) / 0.4)" }}
      >
        {label}
      </span>
      {Icon && (
        <span
          className={`flex items-center justify-center rounded-md ${alert ? "animate-pulse" : ""}`}
          style={{ width: 22, height: 22, background: `${accent}14`, color: accent }}
        >
          <Icon size={12} />
        </span>
      )}
    </div>
    <p
      className="relative text-2xl font-bold tracking-tight tabular-nums leading-none"
      style={{ color: alert ? accent : "rgb(var(--fg))" }}
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
      className="rounded-xl p-3 transition-colors"
      style={{
        background: "rgb(var(--surface-raised))",
        border: `1px solid ${
          due?.overdue && isOpen ? "rgba(248,113,113,0.25)" : "rgb(var(--ink) / 0.07)"
        }`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ background: pri.color, opacity: isOpen ? 1 : 0.3 }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h4
              className="text-sm font-semibold tracking-tight"
              style={{
                color: isOpen ? "rgb(var(--fg))" : "rgb(var(--fg-muted))",
                textDecoration: followup.status === "cancelled" ? "line-through" : "none",
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

          <div className="flex items-center gap-3 flex-wrap text-[11px] mb-2">
            <span className="flex items-center gap-1" style={{ color: "rgb(var(--fg-muted))" }}>
              <span>{cat.emoji}</span>
              {cat.label}
            </span>
            {followup.user && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono"
                style={{
                  background: "rgba(138,138,147,0.06)",
                  color: "#8a8a93",
                  border: "1px solid rgba(138,138,147,0.18)",
                }}
              >
                <UserIcon size={10} />@{followup.user.username}
              </span>
            )}
            {due && (
              <span
                className="flex items-center gap-1 font-semibold tabular-nums"
                style={{
                  color: due.overdue ? "#f87171" : due.urgent ? "#fb923c" : "rgb(var(--fg-muted))",
                }}
              >
                <ClockIcon size={10} />
                {due.text}
              </span>
            )}
          </div>

          {followup.note && (
            <p
              className="text-xs mb-2 whitespace-pre-wrap"
              style={{ color: "rgb(var(--fg-secondary))", opacity: isOpen ? 1 : 0.6 }}
            >
              {followup.note}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div
              className="text-[10px] flex items-center gap-2 flex-wrap"
              style={{ color: "rgb(var(--fg-muted))" }}
            >
              <span>Due {formatDateTime(followup.due_date)}</span>
              {followup.creator && <span>· by @{followup.creator.username}</span>}
              {followup.completer && (
                <span style={{ color: "rgb(var(--pos-text))" }}>
                  · ✓ by @{followup.completer.username}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isOpen && (
                <>
                  {followup.status === "pending" && (
                    <button
                      onClick={() => onStatusChange(followup.id, "in_progress")}
                      title="Mark as in progress"
                      className="p-1.5 rounded-md transition-colors"
                      style={{
                        color: "#8a8a93",
                        background: "rgba(138,138,147,0.08)",
                        border: "1px solid rgba(138,138,147,0.2)",
                      }}
                    >
                      <ClockIcon size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => onStatusChange(followup.id, "done")}
                    title="Mark as done"
                    className="p-1.5 rounded-md transition-colors"
                    style={{
                      color: "rgb(var(--pos-text))",
                      background: "rgba(52,211,153,0.08)",
                      border: "1px solid rgba(52,211,153,0.2)",
                    }}
                  >
                    <CheckCircleIcon size={11} />
                  </button>
                </>
              )}
              {!isOpen && (
                <button
                  onClick={() => onStatusChange(followup.id, "pending")}
                  title="Reopen"
                  className="p-1.5 rounded-md transition-colors"
                  style={{
                    color: "rgb(var(--warn))",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)",
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
                  color: "rgb(var(--accent-text))",
                  background: "rgb(var(--accent) / 0.08)",
                  border: "1px solid rgb(var(--line) / 0.2)",
                }}
              >
                <EditIcon size={11} />
              </button>
              <button
                onClick={() => onDelete(followup)}
                title="Delete"
                className="p-1.5 rounded-md transition-colors"
                style={{
                  color: "rgb(var(--neg-text))",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
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

/* ── Toast ────────────────────────────────────────────────────────── */

const Toast = ({ toast }) => {
  if (!toast) return null;
  const isError = toast.type === "error";
  const color = isError ? "#f87171" : "#34d399";
  return (
    <div
      className="fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-2xl"
      style={{
        background: isError ? "rgba(248,113,113,0.18)" : "rgba(52,211,153,0.18)",
        color,
        border: `1px solid ${color}40`,
        backdropFilter: "blur(12px)",
      }}
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
    } catch (e) {
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

  const fieldStyle = (active) => ({
    background: "rgb(var(--scrim) / 0.28)",
    border: `1px solid ${active ? "rgb(var(--accent) / 0.35)" : "rgb(var(--ink) / 0.06)"}`,
  });

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <FollowupHeader onCreate={handleCreate} onGenerate={handleGenerate} generating={generating} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Open"
          value={counts.open}
          accent="#8a8a93"
          Icon={ClockIcon}
          active={statusFilter === "open"}
          onClick={() => setStatusFilter("open")}
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          accent="#f87171"
          Icon={AlertTriangleIcon}
          active={statusFilter === "overdue"}
          onClick={() => setStatusFilter("overdue")}
          alert={counts.overdue > 0}
        />
        <StatCard
          label="Due Today"
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
          active={statusFilter === "done"}
          onClick={() => setStatusFilter("done")}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgb(var(--fg-muted))" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or note…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none"
            style={fieldStyle(!!search)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none cursor-pointer"
          style={fieldStyle(statusFilter !== "open")}
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
          className="px-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none cursor-pointer"
          style={fieldStyle(!!categoryFilter)}
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
          className="px-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none cursor-pointer"
          style={fieldStyle(!!priorityFilter)}
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
            className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            style={{
              color: "rgb(var(--neg-text))",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
          >
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            <div
              className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
              style={{
                borderColor: "rgb(var(--accent) / 0.3)",
                borderTopColor: "rgb(var(--accent))",
              }}
            />
            Loading…
          </div>
        </div>
      ) : followups.length === 0 ? (
        <div
          className="relative text-center py-16 rounded-2xl overflow-hidden"
          style={{
            background: "rgb(var(--ink) / 0.015)",
            border: "1px dashed rgb(var(--ink) / 0.08)",
          }}
        >
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "rgba(138,138,147,0.08)", filter: "blur(40px)" }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{
                background: "rgba(138,138,147,0.10)",
                border: "1px solid rgba(138,138,147,0.22)",
                color: "#8a8a93",
              }}
            >
              <ClockIcon size={20} />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">
              {hasFilters ? "No follow-ups match these filters" : "No follow-ups yet"}
            </p>
            <p className="text-[11.5px] mb-4" style={{ color: "rgb(var(--fg-muted))" }}>
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10.5px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgb(var(--accent) / 0.10)",
                color: "rgb(var(--accent-text))",
                border: "1px solid rgb(var(--line) / 0.28)",
              }}
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
