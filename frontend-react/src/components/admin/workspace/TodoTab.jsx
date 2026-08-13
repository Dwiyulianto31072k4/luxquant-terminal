// ════════════════════════════════════════════════════════════════════
// TodoTab — redesign batch 5
//
// Brand TODOs with switchable List ↔ Kanban view (List is the default).
// Kanban: drag card column to column. ConfirmModal for delete. English copy.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { TodoPanel } from "./TodoPanel";
import { ConfirmModal } from "../users/ConfirmModal";
import {
  PlusIcon,
  SearchIcon,
  CheckCircleIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  ClockIcon,
  SparklesIcon,
} from "../Icons";
import { IconBadge } from "../primitives";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

const CATEGORY_CONFIG = {
  product: { label: "Product", emoji: "⚙️", color: "rgb(var(--fg-muted))" },
  marketing: { label: "Marketing", emoji: "📣", color: "rgb(var(--accent-text))" },
  ops: { label: "Ops", emoji: "🔧", color: "rgb(var(--pos-text))" },
  bug: { label: "Bug", emoji: "🐛", color: "rgb(var(--neg-text))" },
  idea: { label: "Idea", emoji: "💡", color: "rgb(var(--accent-text))" },
  other: { label: "Other", emoji: "📌", color: "rgb(var(--fg-muted))" },
};

const STATUS_COLUMNS = [
  { id: "backlog", label: "Backlog", color: "rgb(var(--fg-muted))", Icon: ClockIcon },
  { id: "in_progress", label: "In Progress", color: "rgb(var(--fg-secondary))", Icon: SparklesIcon },
  { id: "done", label: "Done", color: "rgb(var(--pos-text))", Icon: CheckCircleIcon },
];

/* ── TODO card ────────────────────────────────────────────────────── */

const TodoCard = ({ todo, onEdit, onStatusChange, onDelete, dragMode = false }) => {
  const pri = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.normal;
  const cat = CATEGORY_CONFIG[todo.category] || CATEGORY_CONFIG.other;
  const isDone = todo.status === "done" || todo.status === "cancelled";
  const due = formatDate(todo.due_date);

  return (
    <div
      className={`rounded-xl border border-ink/[0.07] bg-surface-raised p-3 transition-colors ${
        dragMode ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDone ? "opacity-70" : ""}`}
      draggable={dragMode}
      onDragStart={(e) => {
        if (dragMode) {
          e.dataTransfer.setData("text/plain", String(todo.id));
          e.dataTransfer.effectAllowed = "move";
        }
      }}
    >
      <div className="mb-2 flex items-start gap-2.5">
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: pri.color }}
          title={`Priority: ${todo.priority}`}
        />
        <h4
          className={`flex-1 text-xs font-semibold leading-tight tracking-tight ${
            isDone ? "text-text-muted" : "text-text-primary"
          } ${todo.status === "cancelled" ? "line-through" : ""}`}
        >
          {todo.title}
        </h4>
      </div>

      {todo.description && (
        <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-text-secondary">
          {todo.description}
        </p>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="rounded-md border border-ink/[0.08] bg-surface-secondary/50 px-1.5 py-0.5 font-semibold text-text-muted">
          {cat.emoji} {cat.label}
        </span>
        <span
          className="rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wider"
          style={{ background: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}
        >
          {todo.priority}
        </span>
        {due && (
          <span className="flex items-center gap-1 rounded-md border border-ink/[0.07] bg-surface-raised px-1.5 py-0.5 tabular-nums text-text-muted">
            <ClockIcon size={9} /> {due}
          </span>
        )}
      </div>

      {todo.tags && todo.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {todo.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-md border border-ink/[0.08] bg-surface-secondary/40 px-1.5 py-0.5 font-mono text-[9px] text-text-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5">
        <p className="text-[10px] text-text-muted">{todo.creator && <>@{todo.creator.username}</>}</p>
        <div className="flex items-center gap-1.5">
          {todo.status === "backlog" && (
            <button
              onClick={() => onStatusChange(todo.id, "in_progress")}
              title="Start"
              className="rounded-xl border border-ink/[0.08] bg-surface-raised p-1.5 text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary"
            >
              <SparklesIcon size={10} />
            </button>
          )}
          {todo.status === "in_progress" && (
            <button
              onClick={() => onStatusChange(todo.id, "done")}
              title="Mark done"
              className="rounded-xl border border-profit/20 bg-profit/10 p-1.5 text-profit transition-colors"
            >
              <CheckCircleIcon size={10} />
            </button>
          )}
          {(todo.status === "done" || todo.status === "cancelled") && (
            <button
              onClick={() => onStatusChange(todo.id, "backlog")}
              title="Reopen"
              className="rounded-xl border border-accent/20 bg-accent/10 p-1.5 text-accent transition-colors"
            >
              <ClockIcon size={10} />
            </button>
          )}
          <button
            onClick={() => onEdit(todo)}
            title="Edit"
            className="rounded-xl border border-ink/[0.08] bg-surface-raised p-1.5 text-text-muted transition-colors hover:border-ink/14 hover:text-text-primary"
          >
            <EditIcon size={10} />
          </button>
          <button
            onClick={() => onDelete(todo)}
            title="Delete"
            className="rounded-xl border border-loss/20 bg-loss/10 p-1.5 text-loss transition-colors"
          >
            <TrashIcon size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Kanban column ────────────────────────────────────────────────── */

const KanbanColumn = ({ column, todos, onEdit, onStatusChange, onDelete, onDrop, onAdd }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const Icon = column.Icon;

  return (
    <div
      className={`flex min-h-[200px] flex-col rounded-xl border bg-surface-raised transition-colors ${
        isDragOver ? "border-ink/14 bg-surface-secondary/40" : "border-ink/[0.07]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const todoId = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (todoId) onDrop(todoId, column.id);
      }}
    >
      <div className="flex items-center justify-between border-b border-ink/[0.07] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-text-muted" style={{ color: column.color }} />
          <span
            className="text-[10px] font-bold uppercase tracking-wider text-text-muted"
            style={{ color: column.color }}
          >
            {column.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-ink/[0.08] bg-surface-secondary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-text-muted">
            {todos.length}
          </span>
          {column.id === "backlog" && (
            <button
              onClick={() => onAdd("backlog")}
              title="Add to backlog"
              className="rounded-xl p-0.5 text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
            >
              <PlusIcon size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {todos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/[0.08] py-6 text-center text-[10px] text-text-muted">
            Drop a card here
          </div>
        ) : (
          todos.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              dragMode
            />
          ))
        )}
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

export const TodoTab = ({ onRefreshStats }) => {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // List is the default
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [defaultStatus, setDefaultStatus] = useState("backlog");

  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);
  const todoPages = useCollectionPagination(todos, 12);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (categoryFilter) filters.category = categoryFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (search) filters.search = search;

      const data = await workspaceApi.listTodos(filters);
      setTodos(data.items || []);
    } catch (e) {
      console.error(e);
      showToast("Failed to load todos", "error");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, priorityFilter, search]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const handleCreate = (status = "backlog") => {
    setEditingItem(null);
    setDefaultStatus(status);
    setPanelOpen(true);
  };

  const handleEdit = (t) => {
    setEditingItem(t);
    setPanelOpen(true);
  };

  const handleSave = async (payload) => {
    if (editingItem) {
      await workspaceApi.updateTodo(editingItem.id, payload);
      showToast("Todo updated");
    } else {
      await workspaceApi.createTodo(payload);
      showToast("Todo created");
    }
    setPanelOpen(false);
    setEditingItem(null);
    fetchTodos();
    if (onRefreshStats) onRefreshStats();
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
      await workspaceApi.updateTodo(id, { status: newStatus });
      if (onRefreshStats) onRefreshStats();
    } catch {
      showToast("Failed to update status", "error");
      fetchTodos();
    }
  };

  const handleDelete = (t) => {
    setConfirmModal({
      title: "Delete Todo",
      message: `Delete "${t.title}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Keep it",
      variant: "danger",
      onConfirm: async () => {
        try {
          await workspaceApi.deleteTodo(t.id);
          showToast("Todo deleted");
          fetchTodos();
          if (onRefreshStats) onRefreshStats();
        } catch (e) {
          showToast("Failed to delete", "error");
          throw e;
        }
      },
    });
  };

  const groupedTodos = {
    backlog: todos.filter((t) => t.status === "backlog"),
    in_progress: todos.filter((t) => t.status === "in_progress"),
    done: todos.filter((t) => t.status === "done" || t.status === "cancelled"),
  };

  const hasFilters = search || categoryFilter || priorityFilter;

  const fieldCls = (active) =>
    `rounded-xl border bg-surface-raised px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-ink/15 transition-colors ${
      active ? "border-ink/14" : "border-ink/[0.08]"
    }`;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconBadge Icon={SparklesIcon} color="rgb(var(--fg-muted))" size={38} iconSize={18} />
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Internal Work
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-text-primary">Brand TODOs</h2>
            <p className="mt-0.5 max-w-md text-[11px] text-text-muted">
              Internal task list — product, marketing, ops, bugs, and ideas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-ink/[0.08] bg-surface-raised p-0.5">
            {[
              { id: "list", label: "List" },
              { id: "kanban", label: "Kanban" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  view === v.id
                    ? "bg-surface-secondary text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleCreate()}
            className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent-fg transition-colors hover:opacity-90"
          >
            <PlusIcon size={13} />
            New TODO
          </button>
        </div>
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
            onChange={(e) => {
              setSearch(e.target.value);
              todoPages.resetPage();
            }}
            placeholder="Search title or description…"
            className={`w-full pl-9 pr-3 ${fieldCls(!!search)}`}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            todoPages.resetPage();
          }}
          className={`cursor-pointer ${fieldCls(!!categoryFilter)}`}
        >
          <option value="">All Categories</option>
          <option value="product">⚙️ Product</option>
          <option value="marketing">📣 Marketing</option>
          <option value="ops">🔧 Ops</option>
          <option value="bug">🐛 Bug</option>
          <option value="idea">💡 Idea</option>
          <option value="other">📌 Other</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            todoPages.resetPage();
          }}
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="inline-flex items-center gap-2.5 text-xs text-text-muted">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
            Loading…
          </div>
        </div>
      ) : todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/[0.08] bg-surface-raised py-16 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-ink/[0.08] bg-surface-secondary text-text-muted">
            <SparklesIcon size={20} />
          </div>
          <p className="mb-1 text-sm font-semibold text-text-primary">
            {hasFilters ? "No todos match these filters" : "No todos yet"}
          </p>
          <p className="mb-4 text-[11.5px] text-text-muted">
            {hasFilters
              ? "Try adjusting the filters or search."
              : "Capture the first task for the LuxQuant team."}
          </p>
          <button
            onClick={
              hasFilters
                ? () => {
                    setSearch("");
                    setCategoryFilter("");
                    setPriorityFilter("");
                  }
                : () => handleCreate()
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-text-primary transition-colors hover:border-ink/14"
          >
            {hasFilters ? (
              "Reset filters"
            ) : (
              <>
                <PlusIcon size={11} /> Add first task
              </>
            )}
          </button>
        </div>
      ) : view === "kanban" ? (
        <>
          <p className="text-[10px] text-text-muted">
            💡 Drag a card between columns to change its status.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {STATUS_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                todos={groupedTodos[col.id]}
                onEdit={handleEdit}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onDrop={handleStatusChange}
                onAdd={handleCreate}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2.5">
          {todoPages.pagedItems.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              onEdit={handleEdit}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {view === "list" && (
        <CollectionPagination
          page={todoPages.page}
          totalPages={todoPages.totalPages}
          total={todoPages.total}
          pageSize={todoPages.pageSize}
          onPageChange={todoPages.setPage}
          onPageSizeChange={todoPages.setPageSize}
          pageSizeOptions={[12, 24, 48]}
          itemLabel="tasks"
        />
      )}

      <TodoPanel
        isOpen={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
        defaultStatus={defaultStatus}
        onSave={handleSave}
      />

      {confirmModal && <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />}
    </div>
  );
};
