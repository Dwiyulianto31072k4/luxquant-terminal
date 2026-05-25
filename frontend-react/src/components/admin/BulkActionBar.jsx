// src/components/admin/BulkActionBar.jsx
import { useState } from 'react';

/**
 * Floating bulk action toolbar.
 *
 * Props:
 *   selectedCount: number
 *   selectedUsers: User[]
 *   onClear: () => void
 *   onBulkGrant: (duration) => Promise<void>
 *   onBulkRevoke: () => Promise<void>
 *   onBulkExport: () => void
 *   onBulkSendTemplate: (templateId) => Promise<void>
 *   templates: Array<{id, label}>
 */
export const BulkActionBar = ({
  selectedCount,
  selectedUsers,
  onClear,
  onBulkGrant,
  onBulkRevoke,
  onBulkExport,
  onBulkSendTemplate,
  templates,
}) => {
  const [showGrantMenu, setShowGrantMenu] = useState(false);
  const [showSendMenu, setShowSendMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  if (selectedCount === 0) return null;

  // Quick analysis of selection
  const subscriberCount = selectedUsers.filter((u) => u.role === 'subscriber').length;
  const reachableCount = selectedUsers.filter((u) => {
    const hasTG = u.admin_telegram_username || u.telegram_username;
    const hasDC = u.admin_discord_handle || u.discord_id;
    const hasReal =
      u.email && !u.email.endsWith('@telegram.luxquant.tw') && !u.email.endsWith('@discord.luxquant.tw');
    return hasTG || hasDC || hasReal;
  }).length;

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setShowGrantMenu(false);
      setShowSendMenu(false);
    }
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
      style={{
        background: 'rgba(18,9,13,0.95)',
        border: '1px solid rgba(212,168,83,0.3)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.15)',
      }}
    >
      {/* Selection summary */}
      <div className="flex items-center gap-2 pr-3" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <span
          className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
          style={{ background: 'rgba(212,168,83,0.2)', color: '#d4a853' }}
        >
          {selectedCount}
        </span>
        <div className="text-xs">
          <p className="text-white font-semibold">selected</p>
          <p style={{ color: '#6b5c52' }}>
            {subscriberCount} subs · {reachableCount} reachable
          </p>
        </div>
      </div>

      {/* Export CSV */}
      <button
        onClick={() => run(async () => onBulkExport())}
        disabled={busy}
        className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
        style={{
          background: 'rgba(96,165,250,0.1)',
          color: '#60a5fa',
          border: '1px solid rgba(96,165,250,0.25)',
        }}
        title="Export selected users as CSV"
      >
        📥 CSV
      </button>

      {/* Bulk grant — dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setShowGrantMenu(!showGrantMenu);
            setShowSendMenu(false);
          }}
          disabled={busy}
          className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: 'rgba(52,211,153,0.1)',
            color: '#34d399',
            border: '1px solid rgba(52,211,153,0.25)',
          }}
        >
          ⭐ Grant Sub ▾
        </button>
        {showGrantMenu && (
          <div
            className="absolute bottom-full mb-2 right-0 w-48 rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: '#12090d',
              border: '1px solid rgba(212,168,83,0.25)',
            }}
          >
            <button
              onClick={() => run(() => onBulkGrant('1_month'))}
              className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-white/5 transition-colors"
            >
              <span className="font-semibold">1 Month</span>
              <span className="block text-[10px]" style={{ color: '#6b5c52' }}>
                30 days each
              </span>
            </button>
            <button
              onClick={() => run(() => onBulkGrant('1_year'))}
              className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-white/5 transition-colors"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span className="font-semibold">1 Year</span>
              <span className="block text-[10px]" style={{ color: '#6b5c52' }}>
                365 days each
              </span>
            </button>
            <button
              onClick={() => run(() => onBulkGrant('lifetime'))}
              className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-white/5 transition-colors"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span className="font-semibold">Lifetime</span>
              <span className="block text-[10px]" style={{ color: '#6b5c52' }}>
                No expiry
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bulk revoke */}
      {subscriberCount > 0 && (
        <button
          onClick={() =>
            run(async () => {
              if (
                window.confirm(
                  `Revoke subscription for ${subscriberCount} user(s)?\n\nThis cannot be undone.`
                )
              ) {
                await onBulkRevoke();
              }
            })
          }
          disabled={busy}
          className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: 'rgba(248,113,113,0.1)',
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.25)',
          }}
        >
          ⛔ Revoke ({subscriberCount})
        </button>
      )}

      {/* Bulk send template */}
      {reachableCount > 0 && templates && templates.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              setShowSendMenu(!showSendMenu);
              setShowGrantMenu(false);
            }}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'rgba(212,168,83,0.1)',
              color: '#d4a853',
              border: '1px solid rgba(212,168,83,0.25)',
            }}
          >
            📨 Send ({reachableCount}) ▾
          </button>
          {showSendMenu && (
            <div
              className="absolute bottom-full mb-2 right-0 w-64 rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: '#12090d',
                border: '1px solid rgba(212,168,83,0.25)',
              }}
            >
              <div
                className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: '#6b5c52', background: 'rgba(255,255,255,0.02)' }}
              >
                Pick template — opens browser tabs
              </div>
              {templates
                .filter((t) => t.id !== 'custom')
                .map((t, idx) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      run(async () => {
                        const ok = window.confirm(
                          `Send "${t.label}" to ${reachableCount} user(s)?\n\n` +
                            `This will open ${Math.min(reachableCount, 10)} browser tab(s) at once ` +
                            `(capped at 10 for safety).\n\nProceed?`
                        );
                        if (ok) await onBulkSendTemplate(t.id);
                      })
                    }
                    className="w-full px-3 py-2 text-left text-xs text-white hover:bg-white/5 transition-colors"
                    style={idx > 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}}
                  >
                    <span className="font-semibold">{t.label}</span>
                    <span className="block text-[10px]" style={{ color: '#6b5c52' }}>
                      {t.description}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={busy}
        className="ml-1 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5c52' }}
        title="Clear selection"
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Helper: convert user array to CSV string + trigger download.
 */
export function exportUsersToCsv(users, filename = 'users.csv') {
  if (!users || users.length === 0) return;

  const headers = [
    'id',
    'username',
    'email',
    'role',
    'is_active',
    'auth_provider',
    'telegram_username',
    'admin_telegram_username',
    'discord_id',
    'admin_discord_handle',
    'subscription_expires_at',
    'subscription_source',
    'last_login_at',
    'first_login_at',
    'login_count',
    'admin_notes',
    'created_at',
  ];

  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [headers.join(',')];
  for (const u of users) {
    const row = headers.map((h) => escape(u[h]));
    rows.push(row.join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
