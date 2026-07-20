// ════════════════════════════════════════════════════════════════════
// PaymentDetailPanel — redesigned
//
// • Hero card with focal amount + status indicator
// • Required note for Fail / Cancel / Refund (audit trail)
// • Optional standalone "Add note" action
// • Tidy info sections with copyable values
// • BSCScan raw data viewer (collapsible)
// • Full English copy
// • v2: + "Received Into" row showing wallet_to exchange (Binance/Indodax/etc)
// • v3: Payment date promoted as primary timestamp (was "Verified")
// Gap indicator if there's >1 day between payment_date and record_date
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { SidePanel } from "./SidePanel";
import { financeApi } from "../../../services/financeApi";
import {
  TrendingUpIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  ExternalLinkIcon,
  CopyIcon,
  EditIcon,
} from "../Icons";
import { XCircleIcon, TrashIcon, RotateCcwIcon, ArchiveIcon } from "./finance/icons-supplement";
import { CalendarDotIcon, TimerIcon, ChevronDownIcon } from "./CategoryIcons";
import { formatUSDT, formatDateTimeLong, roleStyle } from "./finance/helpers";
import { ExchangePaymentHero, ExchangeLogo, brandColor } from "./finance/exchangeBranding";

/* ── Layout primitives — solid Terminal language ─────────────────── */

const PANEL = {
  card: "rgb(var(--surface-raised))",
  inset: "rgb(var(--surface-raised))",
  raised: "#100c08",
  border: "rgb(var(--ink) / 0.08)",
  borderSoft: "rgb(var(--ink) / 0.06)",
  hairline: "linear-gradient(to right, transparent, rgb(var(--accent) / 0.45), transparent)",
  label: "rgb(var(--ink) / 0.42)",
  muted: "rgb(var(--fg-muted))",
  text: "rgb(var(--fg))",
};

const Section = ({ title, action, children }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <p
        className="text-[9.5px] uppercase tracking-[0.13em] font-bold font-mono"
        style={{ color: PANEL.label }}
      >
        {title}
      </p>
      {action}
    </div>
    {children}
  </div>
);

const InfoBlock = ({ children }) => (
  <div
    className="relative overflow-hidden rounded-xl px-3 py-1"
    style={{
      background: PANEL.card,
      border: `1px solid ${PANEL.border}`,
    }}
  >
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none"
      style={{ background: PANEL.hairline }}
    />
    {children}
  </div>
);

const InfoRow = ({ label, value, mono = false, copyable = false, onCopy, valueColor }) => (
  <div
    className="flex items-center justify-between gap-3 py-2.5"
    style={{ borderBottom: `1px solid ${PANEL.borderSoft}` }}
  >
    <span
      className="text-[10px] uppercase tracking-wider shrink-0 font-mono"
      style={{ color: PANEL.muted }}
    >
      {label}
    </span>
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`text-[11.5px] truncate text-right ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color: valueColor || PANEL.text }}
        title={typeof value === "string" ? value : ""}
      >
        {value ?? "—"}
      </span>
      {copyable && value && value !== "—" && (
        <button
          onClick={() => onCopy(value)}
          className="p-1 rounded-md transition-colors shrink-0"
          style={{
            color: PANEL.muted,
            background: PANEL.inset,
            border: `1px solid ${PANEL.borderSoft}`,
          }}
          title="Copy"
          aria-label={`Copy ${label}`}
        >
          <CopyIcon size={10} />
        </button>
      )}
    </div>
  </div>
);

/* ── Exchange row (special — logo + brand color) ──────────────────── */

const ExchangeRow = ({ exchangeName, walletLabel }) => {
  if (!exchangeName) return null;
  const c = brandColor(exchangeName);
  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ borderBottom: "1px solid rgb(var(--ink) / 0.04)" }}
    >
      <span
        className="text-[10px] uppercase tracking-wider shrink-0"
        style={{ color: "rgb(var(--fg-muted))" }}
      >
        Received Into
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <ExchangeLogo exchange={exchangeName} size={18} />
        <span
          className="text-[11.5px] font-semibold truncate text-right"
          style={{ color: c === "#FFFFFF" ? "#e8e8e8" : c }}
        >
          {exchangeName}
        </span>
        {walletLabel && (
          <span
            className="text-[10px] truncate"
            style={{ color: "rgb(var(--fg-muted))" }}
            title={`Internal wallet label: ${walletLabel}`}
          >
            ({walletLabel})
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Solid action buttons — Terminal Live / Landing CTA language ──── */

const TONE = {
  // Filled solid — not translucent “raw glass”
  success: {
    color: "#d1fae5",
    bg: "#065f46",
    border: "#047857",
    iconBg: "#047857",
  },
  danger: {
    color: "rgb(var(--neg-text))",
    bg: "#7f1d1d",
    border: "#991b1b",
    iconBg: "#991b1b",
  },
  warn: {
    color: "#ffedd5",
    bg: "#9a3412",
    border: "#c2410c",
    iconBg: "#c2410c",
  },
  muted: {
    color: "rgb(var(--ink) / 0.72)",
    bg: "rgb(var(--surface-raised))",
    border: "rgb(var(--ink) / 0.12)",
    iconBg: "#120f0c",
  },
  gold: {
    color: "rgb(var(--accent-fg))",
    bg: "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
    border: "rgb(var(--accent))",
    iconBg: "transparent",
    solidIcon: true,
  },
};

const ActionBtn = ({ Icon, label, tone = "gold", onClick, disabled, busy, className = "" }) => {
  const t = TONE[tone] || TONE.gold;
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`group flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] ${className}`}
      style={{
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        boxShadow:
          tone === "gold"
            ? "0 4px 14px rgb(var(--accent) / 0.22)"
            : "0 2px 8px rgb(var(--scrim) / 0.35)",
      }}
    >
      {busy ? (
        <span
          className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
          style={{ borderColor: `${t.color}40`, borderTopColor: t.color }}
        />
      ) : (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0"
          style={{
            background: t.solidIcon ? "rgb(var(--ink) / 0.12)" : t.iconBg,
            color: t.color,
          }}
        >
          <Icon size={12} />
        </span>
      )}
      {label}
    </button>
  );
};

/* ── Note input panel (required) ──────────────────────────────────── */

const ACTION_META = {
  fail: {
    title: "Mark as Failed",
    desc: "Mark this payment as failed. Required to log the reason for audit.",
    tone: "danger",
    confirm: "Mark Failed",
  },
  cancel: {
    title: "Cancel Payment",
    desc: "Cancel this pending payment. Required to log the reason for audit.",
    tone: "muted",
    confirm: "Cancel Payment",
  },
  refund: {
    title: "Refund Payment",
    desc: "Refund this confirmed payment. The subscription will be revoked. Required to log the reason.",
    tone: "warn",
    confirm: "Refund Payment",
  },
};

const NoteInput = ({ actionType, note, onChange, onCancel, onSubmit, busy }) => {
  const meta = ACTION_META[actionType];
  if (!meta) return null;
  const t = TONE[meta.tone];
  const canSubmit = note.trim().length >= 3;

  return (
    <div
      className="relative overflow-hidden rounded-xl p-3.5 space-y-2.5"
      style={{
        background: PANEL.card,
        border: `1px solid ${t.border}`,
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.border }} />
      <div className="pl-1">
        <p className="text-[12px] font-bold" style={{ color: t.color }}>
          {meta.title}
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: PANEL.muted }}>
          {meta.desc}
        </p>
      </div>

      <div>
        <label
          className="block text-[9.5px] uppercase tracking-wider font-semibold mb-1 font-mono"
          style={{ color: t.color }}
        >
          Reason <span style={{ color: "rgb(var(--neg-text))" }}>*</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Why are you taking this action? (min. 3 characters)"
          rows={3}
          autoFocus
          className="w-full px-2.5 py-2 rounded-lg text-[11.5px] focus:outline-none resize-none"
          style={{
            background: PANEL.inset,
            border: `1px solid ${PANEL.border}`,
            color: PANEL.text,
          }}
        />
        <p
          className="text-[9.5px] mt-1 text-right tabular-nums font-mono"
          style={{ color: note.trim().length >= 3 ? "rgb(var(--pos-text))" : PANEL.muted }}
        >
          {note.length} chars
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionBtn Icon={CloseIcon} label="Back" tone="muted" onClick={onCancel} disabled={busy} />
        <ActionBtn
          Icon={CheckCircleIcon}
          label={busy ? "Processing…" : meta.confirm}
          tone={meta.tone}
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          busy={busy}
        />
      </div>
    </div>
  );
};

/* ── Add note (standalone) ────────────────────────────────────────── */

const AddNoteInput = ({ note, onChange, onCancel, onSubmit, busy }) => {
  const canSubmit = note.trim().length >= 1;
  return (
    <div
      className="relative overflow-hidden rounded-xl p-3.5 space-y-2.5"
      style={{
        background: PANEL.card,
        border: `1px solid ${PANEL.border}`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: PANEL.hairline }}
      />
      <div>
        <p className="text-[12px] font-bold" style={{ color: "rgb(var(--accent-text))" }}>
          Add Note to Audit Trail
        </p>
        <p className="text-[10.5px] mt-0.5" style={{ color: PANEL.muted }}>
          Append a free-form note. Useful for context, follow-ups, or manual corrections.
        </p>
      </div>
      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your note…"
        rows={3}
        autoFocus
        className="w-full px-2.5 py-2 rounded-lg text-[11.5px] focus:outline-none resize-none"
        style={{
          background: PANEL.inset,
          border: `1px solid ${PANEL.border}`,
          color: PANEL.text,
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <ActionBtn Icon={CloseIcon} label="Back" tone="muted" onClick={onCancel} disabled={busy} />
        <ActionBtn
          Icon={EditIcon}
          label={busy ? "Saving…" : "Save Note"}
          tone="gold"
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          busy={busy}
        />
      </div>
    </div>
  );
};

/* ── Payment Date row (special — prominent gold) ──────────────────── */

const PaymentDateRow = ({ verifiedAt }) => (
  <div
    className="flex items-center justify-between gap-3 py-2.5"
    style={{ borderBottom: "1px solid rgb(var(--ink) / 0.04)" }}
  >
    <span
      className="text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1.5"
      style={{ color: "rgb(var(--accent-text))" }}
    >
      <CalendarDotIcon size={11} />
      Payment Date
    </span>
    <span
      className="text-[12.5px] font-mono tabular-nums truncate text-right font-semibold"
      style={{ color: verifiedAt ? "rgb(var(--accent))" : "rgb(var(--fg-muted))" }}
    >
      {verifiedAt ? formatDateTimeLong(verifiedAt) : "Not yet verified"}
    </span>
  </div>
);

/* ════════════════════════════════════════════════════════════════════
 Main Panel
 ════════════════════════════════════════════════════════════════════ */

export const PaymentDetailPanel = ({ isOpen, onClose, paymentSummary, onActionDone }) => {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [showBscscan, setShowBscscan] = useState(false);

  const [showNoteInput, setShowNoteInput] = useState(null);
  const [actionNote, setActionNote] = useState("");

  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState("");

  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setPayment(null);
      setShowBscscan(false);
      setShowNoteInput(null);
      setActionNote("");
      setShowAddNote(false);
      setNewNote("");
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !paymentSummary?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    financeApi
      .getPayment(paymentSummary.id)
      .then((data) => {
        if (!cancelled) setPayment(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.response?.data?.detail || "Failed to load payment detail.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, paymentSummary?.id]);

  const p = payment || paymentSummary;

  const isPending = p?.status === "pending";
  const isConfirmed = p?.status === "confirmed";

  /* Compute gap between payment date and record date (in days) */
  const recordGapDays = useMemo(() => {
    if (!p?.verified_at || !p?.created_at) return null;
    const paymentMs = new Date(p.verified_at).getTime();
    const recordMs = new Date(p.created_at).getTime();
    return Math.round((recordMs - paymentMs) / (1000 * 60 * 60 * 24));
  }, [p?.verified_at, p?.created_at]);

  const performAction = async (actionType, note) => {
    if (!payment) return;
    setActionBusy(actionType);
    setError(null);
    try {
      let result;
      switch (actionType) {
        case "approve":
          result = await financeApi.approvePayment(payment.id, note);
          break;
        case "fail":
          result = await financeApi.markFailed(payment.id, note);
          break;
        case "cancel":
          result = await financeApi.cancelPayment(payment.id, note);
          break;
        case "refund":
          result = await financeApi.refundPayment(payment.id, note);
          break;
        case "void":
          result = await financeApi.voidPayment(payment.id, note);
          break;
        case "restore":
          result = await financeApi.restorePayment(payment.id, note);
          break;
        default:
          throw new Error("Unknown action");
      }
      if (result?.payment) setPayment(result.payment);
      setShowNoteInput(null);
      setActionNote("");
      if (onActionDone) onActionDone();
    } catch (e) {
      setError(e?.response?.data?.detail || "Action failed. Please try again.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleApprove = () => {
    if (!payment) return;
    if (
      !window.confirm(
        `Approve payment #${payment.id} from @${payment.user?.username}?\n\nThe subscription will be auto-granted.`
      )
    )
      return;
    performAction("approve", null);
  };

  const handleAddNoteOnly = async () => {
    if (!newNote.trim() || !payment) return;
    setActionBusy("note");
    setError(null);
    try {
      const result = await financeApi.addNote(payment.id, newNote.trim());
      if (result?.payment) setPayment(result.payment);
      setNewNote("");
      setShowAddNote(false);
      if (onActionDone) onActionDone();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to save note.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleVoid = () => {
    if (!payment) return;
    if (
      !window.confirm(
        `Void payment #${payment.id} from @${payment.user?.username || "user"}?\n\nIt will be hidden from the list but can be restored later.`
      )
    )
      return;
    performAction("void", null);
  };

  const handleRestore = () => {
    if (!payment) return;
    if (
      !window.confirm(
        `Restore payment #${payment.id}?\n\nIt will reappear in the finance list with its previous status.`
      )
    )
      return;
    performAction("restore", null);
  };

  const handleDelete = async () => {
    if (!payment) return;
    if (
      !window.confirm(
        `PERMANENTLY delete payment #${payment.id} from @${payment.user?.username || "user"}?\n\nThis cannot be undone — the record is removed from the database. The user subscription is not affected.`
      )
    )
      return;
    setActionBusy("delete");
    setError(null);
    try {
      await financeApi.deletePayment(payment.id);
      if (onActionDone) onActionDone();
      if (onClose) onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || "Delete failed. Please try again.");
      setActionBusy(null);
    }
  };

  const handleCopy = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(String(text)).catch(() => {});
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={p ? `Payment #${p.id}` : "Payment Detail"}
      subtitle={p?.user ? `@${p.user.username}` : ""}
      Icon={TrendingUpIcon}
      width="lg"
    >
      {loading && !payment ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{
                borderColor: "rgb(var(--accent) / 0.3)",
                borderTopColor: "rgb(var(--accent))",
              }}
            />
            Loading payment detail…
          </div>
        </div>
      ) : !p ? (
        <p className="text-center text-xs py-12" style={{ color: "rgb(var(--fg-muted))" }}>
          No payment selected.
        </p>
      ) : (
        <div className="space-y-5">
          {/* HERO — brand exchange card with logo, amount, times */}
          <ExchangePaymentHero payment={p} />

          {/* ERROR */}
          {error && (
            <div
              className="text-[11.5px] px-3 py-2.5 rounded-xl flex items-start gap-2"
              style={{
                background: "#7f1d1d",
                color: "rgb(var(--neg-text))",
                border: "1px solid #991b1b",
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ACTIONS */}
          <Section title="Actions">
            {isPending && (
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  Icon={CheckCircleIcon}
                  label="Approve"
                  tone="success"
                  onClick={handleApprove}
                  busy={actionBusy === "approve"}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={XCircleIcon}
                  label="Mark Failed"
                  tone="danger"
                  onClick={() => {
                    setShowNoteInput("fail");
                    setActionNote("");
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={CloseIcon}
                  label="Cancel"
                  tone="muted"
                  onClick={() => {
                    setShowNoteInput("cancel");
                    setActionNote("");
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={EditIcon}
                  label="Add Note"
                  tone="gold"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionBusy != null}
                />
              </div>
            )}

            {isConfirmed && (
              <div className="grid grid-cols-2 gap-2">
                <ActionBtn
                  Icon={AlertTriangleIcon}
                  label="Refund"
                  tone="warn"
                  onClick={() => {
                    setShowNoteInput("refund");
                    setActionNote("");
                  }}
                  disabled={actionBusy != null}
                />
                <ActionBtn
                  Icon={EditIcon}
                  label="Add Note"
                  tone="gold"
                  onClick={() => setShowAddNote(true)}
                  disabled={actionBusy != null}
                />
              </div>
            )}

            {!isPending && !isConfirmed && (
              <ActionBtn
                Icon={EditIcon}
                label="Add Note"
                tone="gold"
                onClick={() => setShowAddNote(true)}
                disabled={actionBusy != null}
              />
            )}

            {/* Danger zone: void (recoverable) / delete (permanent) / restore */}
            <div
              className="mt-2 pt-2 grid grid-cols-2 gap-2"
              style={{ borderTop: "1px solid rgb(var(--ink) / 0.06)" }}
            >
              {p?.is_deleted ? (
                <ActionBtn
                  Icon={RotateCcwIcon}
                  label="Restore"
                  tone="success"
                  onClick={handleRestore}
                  busy={actionBusy === "restore"}
                  disabled={actionBusy != null}
                />
              ) : (
                <ActionBtn
                  Icon={ArchiveIcon}
                  label="Void"
                  tone="muted"
                  onClick={handleVoid}
                  busy={actionBusy === "void"}
                  disabled={actionBusy != null}
                />
              )}
              <ActionBtn
                Icon={TrashIcon}
                label="Delete"
                tone="danger"
                onClick={handleDelete}
                busy={actionBusy === "delete"}
                disabled={actionBusy != null}
              />
            </div>
          </Section>

          {showNoteInput && (
            <NoteInput
              actionType={showNoteInput}
              note={actionNote}
              onChange={setActionNote}
              onCancel={() => {
                setShowNoteInput(null);
                setActionNote("");
              }}
              onSubmit={() => performAction(showNoteInput, actionNote.trim())}
              busy={actionBusy === showNoteInput}
            />
          )}

          {showAddNote && (
            <AddNoteInput
              note={newNote}
              onChange={setNewNote}
              onCancel={() => {
                setShowAddNote(false);
                setNewNote("");
              }}
              onSubmit={handleAddNoteOnly}
              busy={actionBusy === "note"}
            />
          )}

          {/* USER */}
          <Section title="User">
            <div
              className="relative overflow-hidden rounded-xl p-3"
              style={{
                background: PANEL.card,
                border: `1px solid ${PANEL.border}`,
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-px pointer-events-none"
                style={{ background: PANEL.hairline }}
              />
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
                    color: "rgb(var(--accent-fg))",
                    border: "1px solid rgb(var(--accent))",
                  }}
                >
                  {p.user?.username?.charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate" style={{ color: PANEL.text }}>
                    @{p.user?.username || "unknown"}
                  </p>
                  <p className="text-[10.5px] truncate font-mono" style={{ color: PANEL.muted }}>
                    {p.user?.email || "—"} · ID #{p.user_id}
                  </p>
                </div>
                <span
                  className="text-[9px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shrink-0 font-mono"
                  style={{
                    background: PANEL.inset,
                    color: roleStyle(p.user?.role).color,
                    border: `1px solid ${PANEL.border}`,
                  }}
                >
                  {p.user?.role || "free"}
                </span>
              </div>
            </div>
          </Section>

          {/* FINANCIAL */}
          <Section title="Financial Breakdown">
            <InfoBlock>
              <InfoRow label="Plan" value={p.plan?.name || `#${p.plan_id}`} />
              <InfoRow label="Amount USDT" value={formatUSDT(p.amount_usdt)} mono />
              {p.discount_amount > 0 && (
                <InfoRow label="Discount" value={`−${formatUSDT(p.discount_amount)}`} mono />
              )}
              {p.discount_amount < 0 && (
                <InfoRow
                  label="Over-payment"
                  value={`+${formatUSDT(Math.abs(p.discount_amount))}`}
                  mono
                  valueColor="rgb(var(--accent-text))"
                />
              )}
              {p.credit_redeemed > 0 && (
                <InfoRow label="Credit Redeemed" value={`−${formatUSDT(p.credit_redeemed)}`} mono />
              )}
              <InfoRow label="Final Amount" value={formatUSDT(p.final_amount)} mono />
            </InfoBlock>
          </Section>

          {/* TRANSACTION (with exchange row) */}
          <Section
            title="Transaction"
            action={
              p.tx_hash && (
                <a
                  href={`https://bscscan.com/tx/${p.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-semibold hover:underline"
                  style={{ color: "#8a8a93" }}
                >
                  BSCScan <ExternalLinkIcon size={9} />
                </a>
              )
            }
          >
            <InfoBlock>
              <InfoRow label="Network" value={p.network} />
              <InfoRow
                label="TX Hash"
                value={p.tx_hash || "—"}
                mono
                copyable={!!p.tx_hash}
                onCopy={handleCopy}
              />
              <InfoRow
                label="Wallet From"
                value={p.wallet_from || "—"}
                mono
                copyable={!!p.wallet_from}
                onCopy={handleCopy}
              />
              <InfoRow
                label="Wallet To"
                value={p.wallet_to || "—"}
                mono
                copyable={!!p.wallet_to}
                onCopy={handleCopy}
              />
              {p.wallet_to_exchange && (
                <ExchangeRow exchangeName={p.wallet_to_exchange} walletLabel={p.wallet_to_label} />
              )}
            </InfoBlock>
          </Section>

          {/* TIMESTAMPS — Payment Date promoted as primary (gold) */}
          <Section title="Timestamps">
            <InfoBlock>
              <PaymentDateRow verifiedAt={p.verified_at} />
              <InfoRow label="Record Created" value={formatDateTimeLong(p.created_at)} mono />
              {p.expires_at && (
                <InfoRow label="Expires" value={formatDateTimeLong(p.expires_at)} mono />
              )}
              <InfoRow label="Last Updated" value={formatDateTimeLong(p.updated_at)} mono />
            </InfoBlock>

            {/* Gap indicator — payment date vs record date */}
            {recordGapDays !== null && Math.abs(recordGapDays) >= 1 && (
              <p
                className="text-[10.5px] mt-1.5 flex items-center gap-1.5 px-2"
                style={{ color: "rgb(var(--fg-muted))" }}
              >
                <TimerIcon size={11} style={{ color: "rgb(var(--accent-text))" }} />
                {recordGapDays > 0
                  ? `Recorded ${recordGapDays} day${recordGapDays !== 1 ? "s" : ""} after the payment`
                  : `Record predates the payment by ${Math.abs(recordGapDays)} day${Math.abs(recordGapDays) !== 1 ? "s" : ""} (unusual)`}
              </p>
            )}
          </Section>

          {/* BSCSCAN RAW */}
          {payment?.bscscan_data && (
            <Section title="On-chain Verification">
              <button
                onClick={() => setShowBscscan(!showBscscan)}
                className="w-full px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider font-semibold transition-colors text-left flex items-center justify-between"
                style={{
                  background: "rgba(138,138,147,0.06)",
                  color: "#8a8a93",
                  border: "1px solid rgba(138,138,147,0.22)",
                }}
              >
                <span>{showBscscan ? "Hide" : "Show"} raw BSCScan response</span>
                <ChevronDownIcon
                  size={11}
                  style={{
                    transform: showBscscan ? "rotate(180deg)" : "none",
                    transition: "transform .15s",
                  }}
                />
              </button>
              {showBscscan && (
                <pre
                  className="rounded-lg p-2.5 text-[10px] font-mono overflow-x-auto max-h-60 overflow-y-auto"
                  style={{
                    background: "rgb(var(--scrim) / 0.35)",
                    color: "rgb(var(--fg-secondary))",
                    border: "1px solid rgb(var(--ink) / 0.06)",
                  }}
                >
                  {JSON.stringify(payment.bscscan_data, null, 2)}
                </pre>
              )}
            </Section>
          )}

          {/* NOTES */}
          {p.notes && (
            <Section title="Notes / Audit Trail">
              <pre
                className="rounded-lg p-3 text-[10.5px] font-mono whitespace-pre-wrap leading-relaxed"
                style={{
                  background: "rgb(var(--scrim) / 0.3)",
                  color: "rgb(var(--fg-secondary))",
                  border: "1px solid rgb(var(--ink) / 0.06)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {p.notes}
              </pre>
            </Section>
          )}
        </div>
      )}
    </SidePanel>
  );
};
