// ════════════════════════════════════════════════════════════════════
// Payments Table — hybrid layout
//
// Desktop (≥ md): grid-based table row.
// Mobile (< md): stacked card list.
//
// v3: + Manual badge on row (when payment.is_manual)
// v2: + ExchangeBadge (Binance/Indodax/etc) on wallet_to
// ════════════════════════════════════════════════════════════════════

import { Avatar } from "../../primitives";
import {
  CheckCircleIcon,
  CloseIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  CopyIcon,
  StarIcon,
} from "../../Icons";
import { ChevronRightIcon } from "./icons-supplement";
import { formatUSDT, formatRelative, formatDateTime, shortHash, getStatusConfig } from "./helpers";
import { ExchangeBadge } from "./exchangeBranding";

/* ── Pills ────────────────────────────────────────────────────────── */

const Pill = ({ label, color, bg, border, Icon, dense = false, pulse = false }) => (
  <span
    className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded ${
      dense ? "text-[9px] px-1.5 py-0.5" : "text-[9.5px] px-2 py-0.5"
    }`}
    style={{
      background: bg,
      color,
      border: `1px solid ${border}`,
    }}
  >
    {Icon && (
      <span className={pulse ? "animate-pulse" : ""}>
        <Icon size={9} />
      </span>
    )}
    {label}
  </span>
);

const ManualBadge = ({ dense = false }) => (
  <span
    className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded ${
      dense ? "text-[9px] px-1.5 py-0.5" : "text-[9.5px] px-2 py-0.5"
    }`}
    style={{
      background: "rgb(var(--accent) / 0.10)",
      color: "rgb(var(--accent-text))",
      border: "1px solid rgb(var(--line) / 0.28)",
    }}
    title="Manually recorded by admin"
  >
    <StarIcon size={9} />
    Manual
  </span>
);

const METHOD_BADGE = {
  binance_uid: { label: "Binance UID", color: "rgb(var(--warn))" },
  bank_transfer: { label: "Bank", color: "#8a8a93" },
  other: { label: "Other", color: "#8a8a93" },
};

const MethodBadge = ({ method, dense = false }) => {
  const m = METHOD_BADGE[method];
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded ${
        dense ? "text-[9px] px-1.5 py-0.5" : "text-[9.5px] px-2 py-0.5"
      }`}
      style={{ background: `${m.color}14`, color: m.color, border: `1px solid ${m.color}33` }}
      title={`Manual \u2014 ${m.label}`}
    >
      <StarIcon size={9} />
      {m.label}
    </span>
  );
};

/* ── Icon button ──────────────────────────────────────────────────── */

const TONE = {
  success: {
    color: "rgb(var(--pos))",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.22)",
  },
  danger: {
    color: "rgb(var(--neg))",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.22)",
  },
  gold: {
    color: "rgb(var(--accent-text))",
    bg: "rgb(var(--accent) / 0.08)",
    border: "rgb(var(--accent) / 0.22)",
  },
  muted: { color: "rgb(var(--fg-muted))", bg: "transparent", border: "transparent" },
};

const IconButton = ({ Icon, tone = "gold", title, onClick, size = "sm" }) => {
  const t = TONE[tone] || TONE.gold;
  const dim = size === "xs" ? 22 : 26;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-md flex items-center justify-center transition-all hover:scale-110"
      style={{
        width: dim,
        height: dim,
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <Icon size={size === "xs" ? 10 : 11} />
    </button>
  );
};

/* ── Status pill ──────────────────────────────────────────────────── */

const StatusPill = ({ status, isStale, ageHours, dense = false }) => {
  const cfg = getStatusConfig(status);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Pill label={cfg.label} color={cfg.color} bg={cfg.bg} border={cfg.border} dense={dense} />
      {isStale && (
        <Pill
          label={ageHours ? `Stale ${ageHours}h` : "Stale"}
          color="#f87171"
          bg="rgba(248,113,113,0.08)"
          border="rgba(248,113,113,0.28)"
          Icon={AlertTriangleIcon}
          dense={dense}
          pulse
        />
      )}
    </div>
  );
};

/* ── TX hash cell ─────────────────────────────────────────────────── */

const TxHashCell = ({ hash, onCopy, dense = false }) => {
  if (!hash) {
    return (
      <span className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <a
        href={`https://bscscan.com/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`font-mono hover:underline truncate ${dense ? "text-[10.5px]" : "text-[11px]"}`}
        style={{ color: "#8a8a93" }}
      >
        {shortHash(hash)}
      </a>
      <IconButton
        Icon={CopyIcon}
        tone="muted"
        size="xs"
        title="Copy TX hash"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hash);
        }}
      />
    </div>
  );
};

/* ── Quick actions ────────────────────────────────────────────────── */

const QuickActions = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel }) => {
  const isPending = payment.status === "pending";
  return (
    <div className="flex items-center gap-1 justify-end">
      {isPending && (
        <>
          <IconButton
            Icon={CheckCircleIcon}
            tone="success"
            title="Quick approve"
            onClick={(e) => {
              e.stopPropagation();
              onQuickApprove(payment);
            }}
          />
          <IconButton
            Icon={CloseIcon}
            tone="danger"
            title="Quick cancel"
            onClick={(e) => {
              e.stopPropagation();
              onQuickCancel(payment);
            }}
          />
        </>
      )}
      <IconButton
        Icon={ExternalLinkIcon}
        tone="gold"
        title="View detail"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail(payment);
        }}
      />
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
 Desktop row
 ════════════════════════════════════════════════════════════════════ */

const DesktopRow = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel, onCopyHash }) => {
  const cfg = getStatusConfig(payment.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(payment)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail(payment);
        }
      }}
      className="group grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
      style={{
        background: "rgb(var(--ink) / 0.018)",
        border: `1px solid ${
          payment.is_stale ? "rgba(248,113,113,0.20)" : "rgb(var(--ink) / 0.05)"
        }`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgb(var(--ink) / 0.035)";
        e.currentTarget.style.borderColor = payment.is_stale
          ? "rgba(248,113,113,0.32)"
          : "rgb(var(--accent) / 0.18)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgb(var(--ink) / 0.018)";
        e.currentTarget.style.borderColor = payment.is_stale
          ? "rgba(248,113,113,0.20)"
          : "rgb(var(--ink) / 0.05)";
      }}
    >
      {/* User */}
      <div className="col-span-3 min-w-0 flex items-center gap-2.5">
        <Avatar name={payment.user?.username} size="sm" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-text-primary truncate">
            @{payment.user?.username || "unknown"}
          </p>
          <p className="text-[10px] truncate" style={{ color: "rgb(var(--fg-muted))" }}>
            ID #{payment.user_id}
          </p>
        </div>
      </div>

      {/* Plan + amount */}
      <div className="col-span-2 min-w-0">
        <p className="text-[11.5px] font-semibold text-text-primary truncate">
          {payment.plan?.name || `Plan #${payment.plan_id}`}
        </p>
        <p
          className="text-[11.5px] font-mono tabular-nums font-semibold"
          style={{ color: cfg.color }}
        >
          {formatUSDT(payment.final_amount)}
        </p>
      </div>

      {/* Status + Manual badge if applicable */}
      <div className="col-span-2 space-y-1">
        <StatusPill
          status={payment.status}
          isStale={payment.is_stale}
          ageHours={payment.age_hours}
        />
        {payment.method && payment.method !== "onchain_bsc" ? (
          <MethodBadge method={payment.method} dense />
        ) : (
          payment.is_manual && <ManualBadge dense />
        )}
      </div>

      {/* TX hash + exchange badge */}
      <div className="col-span-2 min-w-0 space-y-1">
        <TxHashCell hash={payment.tx_hash} onCopy={onCopyHash} />
        {payment.wallet_to_exchange && (
          <ExchangeBadge exchange={payment.wallet_to_exchange} dense />
        )}
      </div>

      {/* Payment Date (prominent) + Recorded (secondary) */}
      <div className="col-span-2 min-w-0">
        {payment.verified_at ? (
          <>
            <p
              className="text-[11px] truncate font-medium"
              style={{ color: "rgb(var(--accent-text))" }}
              title={formatDateTime(payment.verified_at)}
            >
              {formatRelative(payment.verified_at)}
            </p>
            <p className="text-[9.5px] truncate" style={{ color: "rgb(var(--fg-muted))" }}>
              {formatDateTime(payment.verified_at)}
            </p>
            {(() => {
              const diffDays = Math.round(
                (new Date(payment.created_at) - new Date(payment.verified_at)) /
                  (1000 * 60 * 60 * 24)
              );
              return Math.abs(diffDays) >= 1 ? (
                <p
                  className="text-[9px] truncate"
                  style={{ color: "rgb(var(--fg-muted))" }}
                  title={`Recorded: ${formatDateTime(payment.created_at)}`}
                >
                  ↳ recorded {diffDays > 0 ? `+${diffDays}d` : `${diffDays}d`}
                </p>
              ) : null;
            })()}
          </>
        ) : (
          <>
            <p className="text-[11px] truncate" style={{ color: "rgb(var(--fg-secondary))" }}>
              {formatRelative(payment.created_at)}
            </p>
            <p className="text-[9.5px] truncate" style={{ color: "rgb(var(--fg-muted))" }}>
              {formatDateTime(payment.created_at)}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="col-span-1">
        <QuickActions
          payment={payment}
          onOpenDetail={onOpenDetail}
          onQuickApprove={onQuickApprove}
          onQuickCancel={onQuickCancel}
        />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
 Mobile card
 ════════════════════════════════════════════════════════════════════ */

const MobileCard = ({ payment, onOpenDetail, onQuickApprove, onQuickCancel, onCopyHash }) => {
  const cfg = getStatusConfig(payment.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(payment)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail(payment);
        }
      }}
      className="p-3 rounded-xl space-y-2.5 cursor-pointer transition-colors"
      style={{
        background: "rgb(var(--ink) / 0.02)",
        border: `1px solid ${
          payment.is_stale ? "rgba(248,113,113,0.22)" : "rgb(var(--ink) / 0.06)"
        }`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={payment.user?.username} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary truncate">
            @{payment.user?.username || "unknown"}
          </p>
          <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
            {payment.plan?.name || `Plan #${payment.plan_id}`}
          </p>
        </div>
        <ChevronRightIcon size={14} style={{ color: "rgb(var(--fg-muted))" }} />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="text-lg font-light tabular-nums tracking-tight"
          style={{ color: cfg.color }}
        >
          {formatUSDT(payment.final_amount)}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill
            status={payment.status}
            isStale={payment.is_stale}
            ageHours={payment.age_hours}
            dense
          />
          {payment.method && payment.method !== "onchain_bsc" ? (
            <MethodBadge method={payment.method} dense />
          ) : (
            payment.is_manual && <ManualBadge dense />
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 pt-2 text-[10.5px] flex-wrap"
        style={{ borderTop: "1px solid rgb(var(--ink) / 0.04)", color: "rgb(var(--fg-muted))" }}
      >
        <span
          style={{ color: payment.verified_at ? "rgb(var(--accent))" : "#6b5c52" }}
          title={
            payment.verified_at
              ? `Payment: ${formatDateTime(payment.verified_at)}`
              : `Created: ${formatDateTime(payment.created_at)}`
          }
        >
          📅 {formatRelative(payment.verified_at || payment.created_at)}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {payment.wallet_to_exchange && (
            <ExchangeBadge exchange={payment.wallet_to_exchange} dense />
          )}
          <TxHashCell hash={payment.tx_hash} onCopy={onCopyHash} dense />
        </div>
      </div>

      <div className="pt-1.5" style={{ borderTop: "1px solid rgb(var(--ink) / 0.04)" }}>
        <QuickActions
          payment={payment}
          onOpenDetail={onOpenDetail}
          onQuickApprove={onQuickApprove}
          onQuickCancel={onQuickCancel}
        />
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
 Main export
 ════════════════════════════════════════════════════════════════════ */

export const PaymentsTable = ({
  payments,
  onOpenDetail,
  onQuickApprove,
  onQuickCancel,
  onCopyHash,
}) => {
  return (
    <div className="space-y-1.5">
      <div
        className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: "rgb(var(--ink) / 0.4)" }}
      >
        <div className="col-span-3">User</div>
        <div className="col-span-2">Plan / Amount</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">TX Hash / Wallet</div>
        <div className="col-span-2">Payment Date</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>

      <div className="hidden md:block space-y-1.5">
        {payments.map((p) => (
          <DesktopRow
            key={p.id}
            payment={p}
            onOpenDetail={onOpenDetail}
            onQuickApprove={onQuickApprove}
            onQuickCancel={onQuickCancel}
            onCopyHash={onCopyHash}
          />
        ))}
      </div>

      <div className="md:hidden space-y-2">
        {payments.map((p) => (
          <MobileCard
            key={p.id}
            payment={p}
            onOpenDetail={onOpenDetail}
            onQuickApprove={onQuickApprove}
            onQuickCancel={onQuickCancel}
            onCopyHash={onCopyHash}
          />
        ))}
      </div>
    </div>
  );
};
