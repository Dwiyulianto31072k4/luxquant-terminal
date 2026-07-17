// src/components/admin/workspace/PaymentAuditPanel.jsx
//
// Payment-record audit queue (Finance domain).
// Lists active premium/subscriber users (created on/after 2026-06-17) with NO
// confirmed payment record. Admin assigns owner, marks recorded/waived, notes.
// Grandfathered users (before cutoff) are excluded by the backend.
//
// ERP principles:
// • Money ops live under Finance, not Users directory
// • Progressive disclosure — collapsed by default
// • Bulk actions for queue throughput
//
import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { palette, tint } from "../designSystem";
import { AlertTriangleIcon, CheckCircleIcon, RefreshIcon, ChevronDownIcon } from "../Icons";

const STATUS = {
  pending: { label: "Pending", color: palette.amber[400] },
  recorded: { label: "Recorded", color: palette.green[400] },
  waived: { label: "Waived", color: "rgb(var(--fg-muted))" },
};

const daysAgo = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : `${d}d ago`;
};

const SummaryPill = ({ label, value, color }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium tabular-nums"
    style={{
      background: tint(color, 0.1),
      color,
      border: `1px solid ${tint(color, 0.22)}`,
    }}
  >
    <span style={{ opacity: 0.75 }}>{label}</span>
    <span className="font-bold">{value}</span>
  </span>
);

/**
 * @param {object} props
 * @param {boolean} [props.defaultOpen=false] — ERP: queues closed until needed
 * @param {string} [props.id='payment-audit'] — anchor for deep-link from Users
 */
const PaymentAuditPanel = ({ defaultOpen = false, id = "payment-audit" }) => {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkAdmin, setBulkAdmin] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await workspaceApi.getPaymentAudit());
      setSelected(new Set());
    } catch (e) {
      console.error("payment-audit load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link from Users ops bar (sessionStorage) or rare hash intent
  useEffect(() => {
    let shouldOpen = false;
    try {
      if (sessionStorage.getItem("luxquant.openPaymentAudit") === "1") {
        sessionStorage.removeItem("luxquant.openPaymentAudit");
        shouldOpen = true;
      }
    } catch {
      /* ignore */
    }
    const hash = window.location.hash.replace("#", "");
    if (hash === "payment-audit" || hash === "finance-payment-audit") {
      shouldOpen = true;
    }
    if (!shouldOpen) return;
    setOpen(true);
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [id]);

  const save = useCallback(
    async (userId, patch) => {
      setSaving((s) => ({ ...s, [userId]: true }));
      // optimistic
      setData(
        (d) =>
          d && {
            ...d,
            users: d.users.map((u) => (u.user_id === userId ? { ...u, ...patch } : u)),
          }
      );
      try {
        await workspaceApi.assignPaymentAudit(userId, patch);
      } catch (e) {
        window.alert("Save failed: " + (e?.response?.data?.detail || e.message));
        await load();
      } finally {
        setSaving((s) => {
          const n = { ...s };
          delete n[userId];
          return n;
        });
      }
    },
    [load]
  );

  const users = data?.users || [];
  const admins = data?.admins || [];
  const summary = data?.summary || {};
  const pending = summary.pending || 0;

  const allSelected = users.length > 0 && users.every((u) => selected.has(u.user_id));
  const someSelected = selected.size > 0;

  const toggleOne = (userId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(users.map((u) => u.user_id)));
  };

  const runBulk = async () => {
    if (!someSelected) return;
    const patch = {};
    if (bulkAdmin !== "") {
      patch.assigned_admin_id = bulkAdmin ? Number(bulkAdmin) : null;
    }
    if (bulkStatus) patch.status = bulkStatus;
    if (Object.keys(patch).length === 0) {
      window.alert("Pilih assign admin dan/atau status untuk bulk update.");
      return;
    }
    setBulkBusy(true);
    const ids = [...selected];
    let ok = 0;
    let fail = 0;
    for (const userId of ids) {
      try {
        await workspaceApi.assignPaymentAudit(userId, patch);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setBulkAdmin("");
    setBulkStatus("");
    await load();
    if (fail > 0) window.alert(`Bulk: ${ok} ok, ${fail} failed`);
  };

  // Quiet success when fully clean
  if (!loading && data && users.length === 0) {
    return (
      <div
        id={id}
        className="rounded-xl px-4 py-2.5 mb-1 flex items-center gap-2"
        style={{
          background: "rgb(var(--surface-raised))",
          border: `1px solid ${tint(palette.green[400], 0.2)}`,
        }}
      >
        <CheckCircleIcon size={14} style={{ color: palette.green[400] }} />
        <span className="text-[12px]" style={{ color: "rgb(var(--fg-secondary))" }}>
          Semua premium/subscriber (sejak 17 Jun 2026) sudah punya record bayar.
        </span>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div
        id={id}
        className="rounded-xl px-4 py-3 mb-1 flex items-center gap-2"
        style={{
          background: "rgb(var(--surface-raised))",
          border: "1px solid rgb(var(--ink) / 0.06)",
        }}
      >
        <div
          className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
          style={{ borderColor: "rgb(var(--accent) / 0.25)", borderTopColor: palette.gold[300] }}
        />
        <span className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
          Checking payment gaps…
        </span>
      </div>
    );
  }

  const accent = pending > 0 ? palette.red[400] : palette.amber[400];

  return (
    <div
      id={id}
      className="rounded-xl mb-1 overflow-hidden scroll-mt-4"
      style={{
        background: "rgb(var(--surface-raised))",
        border: `1px solid ${tint(accent, 0.35)}`,
      }}
    >
      {/* Header — always visible; body collapsed by default */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="relative inline-flex shrink-0">
            {pending > 0 && !open && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-50"
                style={{ background: accent }}
              />
            )}
            <AlertTriangleIcon size={15} style={{ color: accent }} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-text-primary">Payment gap queue</span>
              <span
                className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                style={{
                  background: tint(accent, 0.15),
                  color: accent,
                  border: `1px solid ${tint(accent, 0.3)}`,
                }}
              >
                {users.length}
              </span>
            </div>
            <p className="text-[10.5px] mt-0.5" style={{ color: "rgb(var(--fg-muted))" }}>
              Subscriber/premium aktif tanpa confirmed payment · aturan sejak 17 Jun 2026
            </p>
          </div>
          <div className="flex items-center gap-1.5 ml-1 flex-wrap">
            <SummaryPill
              label="pending"
              value={summary.pending ?? pending}
              color={palette.amber[400]}
            />
            <SummaryPill label="assigned" value={summary.assigned ?? 0} color={palette.blue[400]} />
            <SummaryPill
              label="waived"
              value={summary.waived ?? 0}
              color={"rgb(var(--fg-muted))"}
            />
          </div>
        </div>
        <ChevronDownIcon
          size={16}
          style={{
            color: "rgb(var(--fg-muted))",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: "rgb(var(--ink) / 0.05)" }}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <label
                className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none"
                style={{ color: "rgb(var(--fg-secondary))" }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-ink/20"
                />
                {someSelected ? `${selected.size} selected` : "Select all"}
              </label>

              {someSelected && (
                <>
                  <select
                    value={bulkAdmin}
                    onChange={(e) => setBulkAdmin(e.target.value)}
                    className="text-[11px] rounded-md px-2 py-1.5 outline-none"
                    style={{
                      background: "rgb(var(--surface-secondary))",
                      border: `1px solid ${tint(palette.warm[100], 0.14)}`,
                      color: "rgb(var(--fg))",
                    }}
                  >
                    <option value="">— bulk assign admin —</option>
                    <option value="0">Unassign</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.username}
                      </option>
                    ))}
                  </select>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="text-[11px] rounded-md px-2 py-1.5 outline-none"
                    style={{
                      background: "rgb(var(--surface-secondary))",
                      border: `1px solid ${tint(palette.warm[100], 0.14)}`,
                      color: "rgb(var(--fg))",
                    }}
                  >
                    <option value="">— bulk status —</option>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={runBulk}
                    className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-md disabled:opacity-50"
                    style={{
                      background: tint(palette.gold[300], 0.14),
                      color: palette.gold[300],
                      border: `1px solid ${tint(palette.gold[300], 0.35)}`,
                    }}
                  >
                    {bulkBusy ? "Applying…" : "Apply bulk"}
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px]"
              style={{
                color: "rgb(var(--fg-muted))",
                border: `1px solid ${tint(palette.warm[100], 0.12)}`,
              }}
            >
              <RefreshIcon size={11} /> Refresh
            </button>
          </div>

          {/* Column header (desktop) */}
          <div
            className="hidden md:grid gap-2 px-2.5 pb-1.5 text-[9.5px] uppercase tracking-wider font-semibold"
            style={{
              gridTemplateColumns: "28px minmax(140px,1.4fr) 130px 110px minmax(160px,1.2fr)",
              color: "rgb(var(--ink) / 0.35)",
            }}
          >
            <span />
            <span>Member</span>
            <span>Owner</span>
            <span>Status</span>
            <span>Note / TX</span>
          </div>

          <div className="space-y-1.5">
            {users.map((u) => {
              const st = STATUS[u.status] || STATUS.pending;
              const isSel = selected.has(u.user_id);
              return (
                <div
                  key={u.user_id}
                  className="rounded-lg p-2.5 md:px-2.5 md:py-2"
                  style={{
                    background: isSel ? tint(palette.gold[300], 0.04) : "rgb(var(--ink) / 0.02)",
                    border: `1px solid ${isSel ? tint(palette.gold[300], 0.25) : tint(st.color, 0.18)}`,
                  }}
                >
                  <div
                    className="flex flex-wrap md:grid items-center gap-x-3 gap-y-2 md:gap-2"
                    style={{
                      gridTemplateColumns:
                        "28px minmax(140px,1.4fr) 130px 110px minmax(160px,1.2fr)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(u.user_id)}
                      className="rounded border-ink/20 shrink-0"
                      aria-label={`Select ${u.username || u.user_id}`}
                    />

                    <div className="min-w-0 flex-1 md:flex-none">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: st.color }}
                        />
                        <span className="text-[12.5px] font-semibold text-text-primary truncate">
                          {u.username || u.email || `user #${u.user_id}`}
                        </span>
                        <span
                          className="text-[9.5px] uppercase tracking-wide px-1.5 rounded shrink-0"
                          style={{
                            background: tint(palette.gold[300], 0.12),
                            color: palette.gold[300],
                          }}
                        >
                          {u.role}
                        </span>
                      </div>
                      <div
                        className="text-[10.5px] mt-0.5"
                        style={{ color: "rgb(var(--fg-muted))" }}
                      >
                        joined {daysAgo(u.created_at)}
                        {u.subscription_source ? ` · src: ${u.subscription_source}` : ""}
                        {u.assigned_admin_name ? ` · owner: ${u.assigned_admin_name}` : ""}
                      </div>
                    </div>

                    <select
                      value={u.assigned_admin_id || ""}
                      onChange={(e) =>
                        save(u.user_id, {
                          assigned_admin_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="text-[11px] rounded-md px-2 py-1.5 outline-none w-full md:w-auto"
                      style={{
                        background: "rgb(var(--surface-secondary))",
                        border: `1px solid ${tint(palette.warm[100], 0.14)}`,
                        color: "rgb(var(--fg))",
                      }}
                    >
                      <option value="">— assign admin —</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.username}
                        </option>
                      ))}
                    </select>

                    <select
                      value={u.status}
                      onChange={(e) => save(u.user_id, { status: e.target.value })}
                      className="text-[11px] rounded-md px-2 py-1.5 outline-none w-full md:w-auto"
                      style={{
                        background: "rgb(var(--surface-secondary))",
                        border: `1px solid ${tint(st.color, 0.3)}`,
                        color: st.color,
                      }}
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option
                          key={k}
                          value={k}
                          style={{
                            color: "rgb(var(--fg))",
                            background: "rgb(var(--surface-secondary))",
                          }}
                        >
                          {v.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2 flex-1 min-w-[160px] md:min-w-0">
                      <input
                        defaultValue={u.note || ""}
                        key={`${u.user_id}-${u.note || ""}`}
                        onBlur={(e) => {
                          if (e.target.value !== (u.note || "")) {
                            save(u.user_id, { note: e.target.value });
                          }
                        }}
                        placeholder="note (tx / metode / catatan)"
                        className="text-[11px] rounded-md px-2 py-1.5 outline-none flex-1 w-full"
                        style={{
                          background: "rgb(var(--surface-secondary))",
                          border: `1px solid ${tint(palette.warm[100], 0.12)}`,
                          color: "rgb(var(--fg))",
                        }}
                      />
                      {saving[u.user_id] && (
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: "rgb(var(--fg-muted))" }}
                        >
                          saving…
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentAuditPanel;
