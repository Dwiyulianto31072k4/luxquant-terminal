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
  AlertTriangleIcon,
  CheckCircleIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
  ClockIcon,
  SparklesIcon,
} from "../Icons";
import { IconBadge } from "../primitives";

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
    color: "rgb(var(--neg))",
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

const CATEGORY_CONFIG = {
  product: { label: "Product", emoji: "⚙️", color: "#8a8a93" },
  marketing: { label: "Marketing", emoji: "📣", color: "rgb(var(--accent-text))" },
  ops: { label: "Ops", emoji: "🔧", color: "rgb(var(--pos))" },
  bug: { label: "Bug", emoji: "🐛", color: "rgb(var(--neg))" },
  idea: { label: "Idea", emoji: "💡", color: "rgb(var(--warn))" },
  other: { label: "Other", emoji: "📌", color: "rgb(var(--fg-muted))" },
};

const STATUS_COLUMNS = [
  { id: "backlog", label: "Backlog", color: "rgb(var(--fg-muted))", Icon: ClockIcon },
  { id: "in_progress", label: "In Progress", color: "#8a8a93", Icon: SparklesIcon },
  { id: "done", label: "Done", color: "rgb(var(--pos))", Icon: CheckCircleIcon },
];

/* ── TODO card ────────────────────────────────────────────────────── */

const TodoCard = ({ todo, onEdit, onStatusChange, onDelete, dragMode = false }) => {
  const pri = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.normal;
  const cat = CATEGORY_CONFIG[todo.category] || CATEGORY_CONFIG.other;
  const isDone = todo.status === "done" || todo.status === "cancelled";
  const due = formatDate(todo.due_date);

  return (
    <div
      className={`rounded-lg p-3 transition-colors ${dragMode ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        background: "rgb(var(--surface-raised))",
        border: "1px solid rgb(var(--ink) / 0.07)",
        opacity: isDone ? 0.7 : 1,
      }}
      draggable={dragMode}
      onDragStart={(e) => {
        if (dragMode) {
          e.dataTransfer.setData("text/plain", String(todo.id));
          e.dataTransfer.effectAllowed = "move";
        }
      }}
    >
      <div className="flex items-start gap-2 mb-2">
        <span
          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ background: pri.color }}
          title={`Priority: ${todo.priority}`}
        />
        <h4
          className="text-xs font-semibold tracking-tight flex-1 leading-tight"
          style={{
            color: isDone ? "#8a7a6e" : "#fff",
            textDecoration: todo.status === "cancelled" ? "line-through" : "none",
          }}
        >
          {todo.title}
        </h4>
      </div>

      {todo.description && (
        <p
          className="text-[11px] mb-2 line-clamp-2"
          style={{ color: "rgb(var(--fg-secondary))", lineHeight: "1.5" }}
        >
          {todo.description}
        </p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[10px]">
        <span
          className="px-1.5 py-0.5 rounded font-semibold"
          style={{
            background: `${cat.color}10`,
            color: cat.color,
            border: `1px solid ${cat.color}25`,
          }}
        >
          {cat.emoji} {cat.label}
        </span>
        <span
          className="px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
          style={{ background: pri.bg, color: pri.color, border: `1px solid ${pri.border}` }}
        >
          {todo.priority}
        </span>
        {due && (
          <span
            className="px-1.5 py-0.5 rounded tabular-nums flex items-center gap-1"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              color: "rgb(var(--fg-muted))",
              border: "1px solid rgb(var(--ink) / 0.04)",
            }}
          >
            <ClockIcon size={9} /> {due}
          </span>
        )}
      </div>

      {todo.tags && todo.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          {todo.tags.map((tag, i) => (
            <span
              key={i}
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "rgb(var(--accent) / 0.05)",
                color: "rgb(var(--accent-text))",
                border: "1px solid rgb(var(--line) / 0.15)",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
          {todo.creator && <>@{todo.creator.username}</>}
        </p>
        <div className="flex items-center gap-1">
          {todo.status === "backlog" && (
            <button
              onClick={() => onStatusChange(todo.id, "in_progress")}
              title="Start"
              className="p-1 rounded transition-colors"
              style={{
                color: "#8a8a93",
                background: "rgba(138,138,147,0.08)",
                border: "1px solid rgba(138,138,147,0.2)",
              }}
            >
              <SparklesIcon size={10} />
            </button>
          )}
          {todo.status === "in_progress" && (
            <button
              onClick={() => onStatusChange(todo.id, "done")}
              title="Mark done"
              className="p-1 rounded transition-colors"
              style={{
                color: "rgb(var(--pos))",
                background: "rgba(52,211,153,0.08)",
                border: "1px solid rgba(52,211,153,0.2)",
              }}
            >
              <CheckCircleIcon size={10} />
            </button>
          )}
          {(todo.status === "done" || todo.status === "cancelled") && (
            <button
              onClick={() => onStatusChange(todo.id, "backlog")}
              title="Reopen"
              className="p-1 rounded transition-colors"
              style={{
                color: "rgb(var(--warn))",
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <ClockIcon size={10} />
            </button>
          )}
          <button
            onClick={() => onEdit(todo)}
            title="Edit"
            className="p-1 rounded transition-colors"
            style={{
              color: "rgb(var(--accent-text))",
              background: "rgb(var(--accent) / 0.08)",
              border: "1px solid rgb(var(--line) / 0.2)",
            }}
          >
            <EditIcon size={10} />
          </button>
          <button
            onClick={() => onDelete(todo)}
            title="Delete"
            className="p-1 rounded transition-colors"
            style={{
              color: "rgb(var(--neg))",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
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
      className="flex flex-col rounded-xl"
      style={{
        background: isDragOver ? `${column.color}10` : "rgb(var(--ink) / 0.015)",
        border: `1px solid ${isDragOver ? `${column.color}45` : "rgb(var(--ink) / 0.05)"}`,
        minHeight: 200,
      }}
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
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: "1px solid rgb(var(--ink) / 0.04)" }}
      >
        <div className="flex items-center gap-2">
          <Icon size={12} style={{ color: column.color }} />
          <span
            className="text-[10px] uppercase tracking-wider font-bold"
            style={{ color: column.color }}
          >
            {column.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
            style={{ background: `${column.color}12`, color: column.color }}
          >
            {todos.length}
          </span>
          {column.id === "backlog" && (
            <button
              onClick={() => onAdd("backlog")}
              title="Add to backlog"
              className="p-0.5 rounded transition-colors"
              style={{ color: column.color, background: `${column.color}10` }}
            >
              <PlusIcon size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {todos.length === 0 ? (
          <div
            className="text-center py-6 text-[10px] rounded-lg"
            style={{ border: "1px dashed rgb(var(--ink) / 0.06)", color: "rgb(var(--fg-muted))" }}
          >
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
    try {
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
    } catch (err) {
      throw err;
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
      await workspaceApi.updateTodo(id, { status: newStatus });
      if (onRefreshStats) onRefreshStats();
    } catch (e) {
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

  const fieldStyle = (active) => ({
    background: "rgb(var(--scrim) / 0.28)",
    border: `1px solid ${active ? "rgb(var(--accent) / 0.35)" : "rgb(var(--ink) / 0.06)"}`,
  });

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <IconBadge Icon={SparklesIcon} color="#fb923c" size={38} iconSize={18} />
          <div className="min-w-0">
            <p
              className="text-[9.5px] uppercase tracking-[0.18em] font-bold"
              style={{ color: "rgba(251,146,60,0.7)" }}
            >
              Internal Work
            </p>
            <h2 className="text-lg font-semibold text-text-primary tracking-tight">Brand TODOs</h2>
            <p className="text-[11px] mt-0.5 max-w-md" style={{ color: "rgb(var(--fg-muted))" }}>
              Internal task list — product, marketing, ops, bugs, and ideas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-lg p-0.5"
            style={{
              background: "rgb(var(--scrim) / 0.3)",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            {[
              { id: "list", label: "List" },
              { id: "kanban", label: "Kanban" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all"
                style={{
                  background: view === v.id ? "rgb(var(--accent) / 0.18)" : "transparent",
                  color: view === v.id ? "rgb(var(--accent))" : "#6b5c52",
                  border:
                    view === v.id ? "1px solid rgb(var(--accent) / 0.3)" : "1px solid transparent",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleCreate()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent)))",
              color: "rgb(var(--surface))",
            }}
          >
            <PlusIcon size={13} />
            New TODO
          </button>
        </div>
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
            placeholder="Search title or description…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none"
            style={fieldStyle(!!search)}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-xs text-text-primary focus:outline-none cursor-pointer"
          style={fieldStyle(!!categoryFilter)}
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
              setCategoryFilter("");
              setPriorityFilter("");
            }}
            className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5"
            style={{
              color: "rgb(var(--neg))",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
          >
            <CloseIcon size={11} />
            Clear all
          </button>
        )}
      </div>

      {/* Content */}
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
      ) : todos.length === 0 ? (
        <div
          className="relative text-center py-16 rounded-2xl overflow-hidden"
          style={{
            background: "rgb(var(--ink) / 0.015)",
            border: "1px dashed rgb(var(--ink) / 0.08)",
          }}
        >
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "rgba(251,146,60,0.08)", filter: "blur(40px)" }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
              style={{
                background: "rgba(251,146,60,0.10)",
                border: "1px solid rgba(251,146,60,0.22)",
                color: "#fb923c",
              }}
            >
              <SparklesIcon size={20} />
            </div>
            <p className="text-sm font-semibold text-text-primary mb-1">
              {hasFilters ? "No todos match these filters" : "No todos yet"}
            </p>
            <p className="text-[11.5px] mb-4" style={{ color: "rgb(var(--fg-muted))" }}>
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
                  <PlusIcon size={11} /> Add first task
                </>
              )}
            </button>
          </div>
        </div>
      ) : view === "kanban" ? (
        <>
          <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
            💡 Drag a card between columns to change its status.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        <div className="space-y-2">
          {todos.map((t) => (
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
