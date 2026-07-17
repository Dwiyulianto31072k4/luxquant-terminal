// src/components/admin/users/UsersTable.jsx
//
// Hybrid layout:
// - md and up → traditional table with sticky-look header
// - below md → vertical card stack
//
// Both layouts share the same row-action handlers and selection model.
//

import { ContactBadgeRow } from "../ContactBadge";
import { Avatar, Badge, LoadingState, EmptyState } from "../primitives";
import { palette, surface, tint, motion } from "../designSystem";
import {
  ProviderIcon,
  SparklesIcon,
  EyeIcon,
  PlusIcon,
  MinusIcon,
  BanIcon,
  SendIcon,
  CheckCircleIcon,
  UsersIcon,
  ShieldIcon,
} from "../Icons";
import { formatDate, relativeTime, subscriptionStatus } from "./helpers";

// ════════════════════════════════════════════════════════════════════
// Sub-helpers
// ════════════════════════════════════════════════════════════════════

const SubscriptionPill = ({ user }) => {
  const s = subscriptionStatus(user);
  const map = {
    admin: { color: palette.violet[400], label: "∞ Admin" },
    co_admin: { color: palette.blue[400], label: "View Co-Admin" },
    founder: { color: palette.amber[400], label: "View Founder" },
    free: { color: "rgb(var(--fg-muted))", label: "—" },
    lifetime: { color: palette.amber[400], label: "Lifetime" },
    expired: { color: palette.red[400], label: "Expired" },
    expiring: { color: palette.orange[400], label: s.label },
    active: { color: palette.green[400], label: s.label },
  };
  const cfg = map[s.type] || map.free;
  return (
    <span className="text-[10px] font-semibold tabular-nums" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
};

const RoleChip = ({ role, onClick }) => {
  const map = {
    admin: {
      color: palette.violet[400],
      bg: tint(palette.violet[400], 0.12),
      border: tint(palette.violet[400], 0.3),
      label: "admin",
    },
    co_admin: {
      color: palette.blue[400],
      bg: tint(palette.blue[400], 0.12),
      border: tint(palette.blue[400], 0.3),
      label: "co-admin",
    },
    founder: {
      color: palette.amber[400],
      bg: tint(palette.amber[400], 0.12),
      border: tint(palette.amber[400], 0.3),
      label: "founder",
    },
    subscriber: {
      color: palette.green[400],
      bg: tint(palette.green[400], 0.12),
      border: tint(palette.green[400], 0.3),
      label: "subscriber",
    },
    premium: {
      color: palette.green[400],
      bg: tint(palette.green[400], 0.12),
      border: tint(palette.green[400], 0.3),
      label: "premium",
    },
    free: {
      color: "rgb(var(--fg-muted))",
      bg: "rgba(107,92,82,0.12)",
      border: "rgba(107,92,82,0.3)",
      label: "free",
    },
  };
  const c = map[role] || map.free;
  const className =
    "text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded inline-flex items-center gap-1";
  const style = {
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    cursor: onClick ? "pointer" : "default",
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title="Change role (admin / co-admin / founder / member)"
        className={`${className} hover:opacity-90`}
        style={style}
      >
        {c.label}
        <span className="text-[8px] opacity-70">✎</span>
      </button>
    );
  }
  return (
    <span className={className} style={style}>
      {c.label}
    </span>
  );
};

const UserCell = ({ user, onClick }) => (
  <button onClick={onClick} className="flex items-center gap-2.5 text-left min-w-0 w-full">
    <Avatar src={user.avatar_url} name={user.username} size="sm" />
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-primary truncate flex items-center gap-1.5">
        {user.username}
        <ProviderIcon provider={user.auth_provider} size={11} />
        {!user.is_active && (
          <span
            className="text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded"
            style={{
              background: tint(palette.red[400], 0.12),
              color: palette.red[400],
            }}
          >
            Banned
          </span>
        )}
        {user.admin_enriched_at && (
          <span title="Admin-enriched contact info">
            <SparklesIcon size={10} style={{ color: palette.gold[300] }} />
          </span>
        )}
        <CrmBadge status={user.crm_status} lastAt={user.last_followup_at} />
      </p>
      <p className="text-[10px] truncate font-mono" style={{ color: "rgb(var(--fg-muted))" }}>
        {user.email}
      </p>
    </div>
  </button>
);

// ════════════════════════════════════════════════════════════════════
// CRM touch indicator — has this user been followed up on?
// ════════════════════════════════════════════════════════════════════
const CRM_BADGE = {
  untouched: { color: "rgb(var(--fg-muted))", text: "NEW", label: "Never contacted" },
  open: { color: palette.amber?.[400] || "#fbbf24", text: "OPEN", label: "Follow-up in progress" },
  tracked: { color: palette.green[400], text: "SEEN", label: "Tracked" },
};
const CrmBadge = ({ status, lastAt }) => {
  const cfg = CRM_BADGE[status] || CRM_BADGE.untouched;
  const when = lastAt ? relativeTime(lastAt) : null;
  const title = when ? `${cfg.label} · last touched ${when}` : cfg.label;
  return (
    <span
      title={title}
      className="text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded shrink-0"
      style={{
        background: tint(cfg.color, 0.12),
        color: cfg.color,
        border: `1px solid ${tint(cfg.color, 0.25)}`,
      }}
    >
      {cfg.text}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════
// Row Actions
// ════════════════════════════════════════════════════════════════════

const RowActionButton = ({ Icon, tone, title, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-1.5 rounded-md"
    style={{
      color: tone,
      background: tint(tone, 0.08),
      border: `1px solid ${tint(tone, 0.2)}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = tint(tone, 0.16);
      e.currentTarget.style.borderColor = tint(tone, 0.35);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = tint(tone, 0.08);
      e.currentTarget.style.borderColor = tint(tone, 0.2);
    }}
  >
    <Icon size={12} />
  </button>
);

const STAFF_ROLES = new Set(["admin", "co_admin", "founder"]);

const RowActions = ({
  user,
  canWrite = true,
  canManageRoles = false,
  onView,
  onGrant,
  onRevoke,
  onToggleActive,
  onSendMessage,
  onSetRole,
}) => (
  <div className="flex items-center justify-end gap-1">
    <RowActionButton
      Icon={EyeIcon}
      tone={palette.blue[400]}
      title="View Details"
      onClick={onView}
    />
    {canManageRoles && onSetRole && (
      <button
        type="button"
        onClick={onSetRole}
        title="Set role: Admin / Co-Admin / Founder / Subscriber / Free"
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider"
        style={{
          color: palette.violet[400],
          background: tint(palette.violet[400], 0.1),
          border: `1px solid ${tint(palette.violet[400], 0.3)}`,
          transition: motion.base,
        }}
      >
        <ShieldIcon size={11} />
        Role
      </button>
    )}
    {canWrite && user.telegram_id && onSendMessage && (
      <RowActionButton
        Icon={SendIcon}
        tone={palette.teal[400]}
        title="Send message via bot"
        onClick={onSendMessage}
      />
    )}
    {canWrite && !STAFF_ROLES.has(user.role) && (
      <>
        <RowActionButton
          Icon={PlusIcon}
          tone={palette.green[400]}
          title="Grant Subscription (paid access only — not staff role)"
          onClick={onGrant}
        />
        {(user.role === "subscriber" || user.role === "premium") && (
          <RowActionButton
            Icon={MinusIcon}
            tone={palette.red[400]}
            title="Revoke Subscription"
            onClick={onRevoke}
          />
        )}
        <RowActionButton
          Icon={user.is_active ? BanIcon : CheckCircleIcon}
          tone={user.is_active ? palette.orange[400] : palette.green[400]}
          title={user.is_active ? "Ban User" : "Unban User"}
          onClick={onToggleActive}
        />
      </>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Desktop table
// ════════════════════════════════════════════════════════════════════

const DesktopTable = ({
  users,
  selectedIds,
  allVisibleSelected,
  toggleSelect,
  toggleSelectAll,
  canWrite = true,
  canManageRoles = false,
  onView,
  onGrant,
  onRevoke,
  onToggleActive,
  onSendMessage,
  onSetRole,
}) => (
  <table className="w-full text-sm">
    <thead>
      <tr style={{ background: "rgb(var(--ink) / 0.018)" }}>
        <th
          className="px-3 py-2.5 w-10"
          style={{ borderBottom: `1px solid ${surface.base.border}` }}
        >
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
          />
        </th>
        {["User", "Contact", "Role", "Subscription", "Activity", ""].map((h, i) => (
          <th
            key={i}
            className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider ${
              i === 5 ? "text-right" : "text-left"
            } ${i === 1 || i === 3 ? "hidden md:table-cell" : ""} ${i === 4 ? "hidden lg:table-cell" : ""}`}
            style={{
              color: "rgb(var(--ink) / 0.4)",
              borderBottom: `1px solid ${surface.base.border}`,
            }}
          >
            {h || "Actions"}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {users.map((u) => {
        const isSelected = selectedIds.has(u.id);
        return (
          <tr
            key={u.id}
            style={{
              background: isSelected ? tint(palette.gold[300], 0.04) : "transparent",
              borderTop: `1px solid ${surface.base.border}`,
              transition: motion.base,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = "rgb(var(--ink) / 0.015)";
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = "transparent";
            }}
          >
            <td className="px-3 py-2.5">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(u.id)}
                className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
              />
            </td>
            <td className="px-3 py-2.5">
              <UserCell user={u} onClick={() => onView(u.id)} />
            </td>
            <td className="px-3 py-2.5 hidden md:table-cell">
              <ContactBadgeRow user={u} />
            </td>
            <td className="px-3 py-2.5">
              <RoleChip
                role={u.role}
                onClick={canManageRoles && onSetRole ? () => onSetRole(u) : undefined}
              />
            </td>
            <td className="px-3 py-2.5 hidden md:table-cell">
              <SubscriptionPill user={u} />
              {u.subscription_expires_at && u.role === "subscriber" && (
                <p
                  className="text-[9px] mt-0.5 tabular-nums"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  {formatDate(u.subscription_expires_at)}
                </p>
              )}
            </td>
            <td className="px-3 py-2.5 hidden lg:table-cell">
              <span
                className="text-[10px]"
                style={{ color: u.last_active_at ? "#8a7a6e" : "#4a3f39" }}
              >
                {relativeTime(u.last_active_at)}
              </span>
              <p className="text-[9px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                {u.total_sessions > 0 ? `${u.total_sessions} sessions` : "no sessions"}
                {u.last_feature_touched ? ` · ${u.last_feature_touched}` : ""}
              </p>
            </td>
            <td className="px-3 py-2.5">
              <RowActions
                user={u}
                canWrite={canWrite}
                canManageRoles={canManageRoles}
                onView={() => onView(u.id)}
                onGrant={() => onGrant(u)}
                onRevoke={() => onRevoke(u.id, u.username)}
                onToggleActive={() => onToggleActive(u.id, u.username, u.is_active)}
                onSendMessage={() => onSendMessage && onSendMessage(u)}
                onSetRole={() => onSetRole && onSetRole(u)}
              />
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// ════════════════════════════════════════════════════════════════════
// Mobile card stack
// ════════════════════════════════════════════════════════════════════

const MobileCardStack = ({
  users,
  selectedIds,
  toggleSelect,
  canWrite = true,
  canManageRoles = false,
  onView,
  onGrant,
  onRevoke,
  onToggleActive,
  onSendMessage,
  onSetRole,
}) => (
  <div className="divide-y" style={{ "--tw-divide-opacity": 1 }}>
    {users.map((u) => {
      const isSelected = selectedIds.has(u.id);
      return (
        <div
          key={u.id}
          className="p-4 space-y-3"
          style={{
            background: isSelected ? tint(palette.gold[300], 0.04) : "transparent",
            borderTop: `1px solid ${surface.base.border}`,
          }}
        >
          {/* Top row — checkbox + user + role */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(u.id)}
              className="w-4 h-4 mt-1 rounded cursor-pointer accent-amber-500"
            />
            <div className="flex-1 min-w-0">
              <UserCell user={u} onClick={() => onView(u.id)} />
            </div>
            <RoleChip
              role={u.role}
              onClick={canManageRoles && onSetRole ? () => onSetRole(u) : undefined}
            />
          </div>

          {/* Mid row — contact + subscription */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-[10px]">
            <ContactBadgeRow user={u} />
            <div className="text-right">
              <SubscriptionPill user={u} />
              {u.subscription_expires_at && u.role === "subscriber" && (
                <p className="text-[9px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                  {formatDate(u.subscription_expires_at)}
                </p>
              )}
            </div>
          </div>

          {/* Bottom row — last login + actions */}
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
              {u.last_active_at ? `Active ${relativeTime(u.last_active_at)}` : "No web activity"}
              {u.last_feature_touched ? ` · ${u.last_feature_touched}` : ""}
            </span>
            <RowActions
              user={u}
              canWrite={canWrite}
              canManageRoles={canManageRoles}
              onView={() => onView(u.id)}
              onGrant={() => onGrant(u)}
              onRevoke={() => onRevoke(u.id, u.username)}
              onToggleActive={() => onToggleActive(u.id, u.username, u.is_active)}
              onSendMessage={() => onSendMessage && onSendMessage(u)}
              onSetRole={() => onSetRole && onSetRole(u)}
            />
          </div>
        </div>
      );
    })}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main export
// ════════════════════════════════════════════════════════════════════

export const UsersTable = ({
  users,
  loading,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  canWrite = true,
  canManageRoles = false,
  onView,
  onGrant,
  onRevoke,
  onToggleActive,
  onSendMessage,
  onSetRole,
  onResetFilters,
}) => {
  const allVisibleSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        background: surface.base.bg,
        border: `1px solid ${surface.base.border}`,
        boxShadow: "inset 0 1px 0 0 rgb(var(--ink) / 0.04)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(to right, transparent, rgb(var(--ink) / 0.08), transparent)",
        }}
      />

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center">
          <LoadingState label="Loading users..." />
        </div>
      )}

      {/* Empty */}
      {!loading && users.length === 0 && (
        <EmptyState
          Icon={UsersIcon}
          title="No users match these filters"
          description="Try widening your search or clearing some filters."
          action={onResetFilters && { label: "Reset filters", onClick: onResetFilters }}
        />
      )}

      {/* Data — Desktop */}
      {!loading && users.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto">
            <DesktopTable
              users={users}
              selectedIds={selectedIds}
              allVisibleSelected={allVisibleSelected}
              toggleSelect={toggleSelect}
              toggleSelectAll={toggleSelectAll}
              canWrite={canWrite}
              canManageRoles={canManageRoles}
              onView={onView}
              onGrant={onGrant}
              onRevoke={onRevoke}
              onToggleActive={onToggleActive}
              onSendMessage={onSendMessage}
              onSetRole={onSetRole}
            />
          </div>
          <div className="md:hidden">
            <MobileCardStack
              users={users}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              canWrite={canWrite}
              canManageRoles={canManageRoles}
              onView={onView}
              onGrant={onGrant}
              onRevoke={onRevoke}
              onToggleActive={onToggleActive}
              onSendMessage={onSendMessage}
              onSetRole={onSetRole}
            />
          </div>
        </>
      )}
    </div>
  );
};
