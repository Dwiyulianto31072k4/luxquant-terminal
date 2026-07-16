// src/components/admin/users/SetRoleModal.jsx
// Full admin assigns staff (admin / co_admin / founder) or member roles.

import { useState } from 'react';
import Modal, { ModalFooter } from '../../ui/Modal';
import { GoldButton, GhostButton } from '../../autotrade/AutoTradeUI';
import { Avatar } from '../primitives';
import { ASSIGNABLE_ROLES, ROLE_LABELS, isStaffRole } from '../../../utils/roles';

const ROLE_OPTIONS = [
  {
    value: 'admin',
    label: ROLE_LABELS.admin,
    desc: 'Full access — grant, delete, edit, all actions',
    tone: '#a855f7',
  },
  {
    value: 'co_admin',
    label: ROLE_LABELS.co_admin,
    desc: 'View-only — open admin panel, no write/delete',
    tone: '#60a5fa',
  },
  {
    value: 'founder',
    label: ROLE_LABELS.founder,
    desc: 'View-only — same as co-admin (founder badge)',
    tone: '#fbbf24',
  },
  {
    value: 'subscriber',
    label: ROLE_LABELS.subscriber,
    desc: 'Paid member access (lifetime if no expiry set)',
    tone: '#34d399',
  },
  {
    value: 'free',
    label: ROLE_LABELS.free,
    desc: 'No subscription / remove staff access',
    tone: '#8a7a6e',
  },
];

export const SetRoleModal = ({ user, onClose, onSetRole }) => {
  const [role, setRole] = useState(user?.role || 'free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const unchanged = role === user?.role;
  const selected = ROLE_OPTIONS.find((o) => o.value === role) || ROLE_OPTIONS[4];

  const handleSubmit = async () => {
    if (unchanged || !ASSIGNABLE_ROLES.includes(role)) return;
    setLoading(true);
    setError(null);
    try {
      await onSetRole(user.id, role);
      onClose();
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to update role';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title="Set role">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar src={user?.avatar_url} name={user?.username} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{user?.username}</p>
            <p className="text-[11px] font-mono truncate" style={{ color: 'rgb(var(--fg-muted))' }}>
              {user?.email}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--fg-muted))' }}>
              Current:{' '}
              <span className="font-semibold uppercase tracking-wider text-text-primary/70">
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
              {isStaffRole(user?.role) ? ' · staff' : ''}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {ROLE_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className="w-full text-left rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  background: active ? `${opt.tone}14` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${active ? `${opt.tone}55` : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[12px] font-bold uppercase tracking-wider"
                    style={{ color: active ? opt.tone : '#fff' }}
                  >
                    {opt.label}
                  </span>
                  {opt.value === user?.role && (
                    <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgb(var(--fg-muted))' }}>
                      current
                    </span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgb(var(--fg-muted))' }}>
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>

        {isStaffRole(role) && (
          <p className="text-[11px] leading-relaxed rounded-md px-3 py-2" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#c4b5fd' }}>
            {selected.value === 'admin'
              ? 'This user will be able to grant, revoke, ban, and manage the platform like you.'
              : 'This user can open the management system but cannot write, delete, or send actions.'}
          </p>
        )}

        {error && (
          <p className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <ModalFooter>
        <GhostButton onClick={onClose} disabled={loading} className="flex-1">
          Cancel
        </GhostButton>
        <GoldButton
          onClick={handleSubmit}
          disabled={loading || unchanged}
          className="flex-1"
        >
          {loading ? 'Saving…' : unchanged ? 'No change' : `Set as ${selected.label}`}
        </GoldButton>
      </ModalFooter>
    </Modal>
  );
};

export default SetRoleModal;
