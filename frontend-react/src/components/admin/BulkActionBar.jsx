// src/components/admin/BulkActionBar.jsx
//
// Floating bulk-action toolbar. Renders when user selection > 0.
//
// • Hybrid confirmation: revoke uses ConfirmModal via onRequestConfirm
// callback to parent; send-template still uses window.confirm because
// it spawns many browser tabs (kept inline for safety reminder).
// • Full English copy.
// • All action buttons get tooltips.
//
// Props:
// selectedCount : number
// selectedUsers : User[]
// onClear : () => void
// onBulkGrant : (duration: '1_month'|'1_year'|'lifetime') => void
// onBulkRevoke : () => void — actual revoke call
// onBulkExport : () => void
// onBulkSendTemplate : (templateId: string) => void
// templates : Template[]
// onRequestConfirm : ({ title, message, confirmText, cancelText, variant, onConfirm }) => void
// Parent should show its ConfirmModal with the payload.

import { useState } from 'react';
import {
 DownloadIcon,
 StarIcon,
 BanIcon,
 SendIcon,
 CloseIcon,
 ChevronDownIcon,
} from './Icons';

export const BulkActionBar = ({
 selectedCount,
 selectedUsers,
 onClear,
 onBulkGrant,
 onBulkRevoke,
 onBulkExport,
 onBulkSendTemplate,
 templates,
 onRequestConfirm,
}) => {
 const [showGrantMenu, setShowGrantMenu] = useState(false);
 const [showSendMenu, setShowSendMenu] = useState(false);
 const [busy, setBusy] = useState(false);

 if (selectedCount === 0) return null;

 const subscriberCount = selectedUsers.filter((u) => u.role === 'subscriber').length;
 const reachableCount = selectedUsers.filter((u) => {
 const hasTG = u.admin_telegram_username || u.telegram_username;
 const hasDC = u.admin_discord_handle || u.discord_id;
 const hasReal =
 u.email &&
 !u.email.endsWith('@telegram.luxquant.tw') &&
 !u.email.endsWith('@discord.luxquant.tw');
 return hasTG || hasDC || hasReal;
 }).length;

 // Wrap async actions with busy flag + menu close.
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

 // ─── Bulk revoke → ConfirmModal via parent ───
 const handleRevokeClick = () => {
 if (!onRequestConfirm) {
 // Defensive fallback if parent forgot to wire the prop.
 if (
 window.confirm(
 `Revoke subscription for ${subscriberCount} user(s)? This cannot be undone.`
 )
 ) {
 run(async () => onBulkRevoke());
 }
 return;
 }
 onRequestConfirm({
 title: 'Revoke Subscriptions',
 message: `Revoke subscription for ${subscriberCount} user(s)? They will be moved back to the free role. This cannot be undone.`,
 confirmText: `Revoke ${subscriberCount}`,
 cancelText: 'Keep them',
 variant: 'danger',
 onConfirm: async () => {
 await run(async () => onBulkRevoke());
 },
 });
 };

 // ─── Send template → still window.confirm (it opens many tabs) ───
 const handleSendTemplateClick = (t) => {
 const ok = window.confirm(
 `Send "${t.label}" to ${reachableCount} user(s)?\n\n` +
 `This will open ${Math.min(reachableCount, 10)} browser tab(s) at once ` +
 `(capped at 10 for safety).\n\nProceed?`
 );
 if (!ok) return;
 run(async () => onBulkSendTemplate(t.id));
 };

 return (
 <div
 className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
 style={{
 background: 'rgba(18,9,13,0.95)',
 border: '1px solid rgb(var(--line) / 0.3)',
 boxShadow:
 '0 10px 40px rgb(var(--scrim) / 0.35), 0 0 0 1px rgb(var(--accent) / 0.15)',
 }}
 >
 {/* Selection summary */}
 <div
 className="flex items-center gap-2.5 pr-3"
 style={{ borderRight: '1px solid rgb(var(--ink) / 0.06)' }}
 >
 <span
 className="flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md text-xs font-bold tabular-nums"
 style={{
 background: 'rgb(var(--accent) / 0.18)',
 color: 'rgb(var(--accent))',
 border: '1px solid rgb(var(--line) / 0.3)',
 }}
 >
 {selectedCount}
 </span>
 <div className="text-[11px]">
 <p className="text-text-primary font-semibold leading-tight">selected</p>
 <p className="leading-tight" style={{ color: 'rgb(var(--fg-muted))' }}>
 {subscriberCount} subs · {reachableCount} reachable
 </p>
 </div>
 </div>

 {/* Export CSV */}
 <button
 onClick={() => run(async () => onBulkExport())}
 disabled={busy}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all disabled:opacity-50 hover:scale-[1.02]"
 style={{
 background: 'rgba(138,138,147,0.08)',
 color: '#8a8a93',
 border: '1px solid rgba(138,138,147,0.22)',
 }}
 title="Export selected users as CSV"
 >
 <DownloadIcon size={13} />
 CSV
 </button>

 {/* Bulk grant */}
 <div className="relative">
 <button
 onClick={() => {
 setShowGrantMenu(!showGrantMenu);
 setShowSendMenu(false);
 }}
 disabled={busy}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all disabled:opacity-50 hover:scale-[1.02]"
 style={{
 background: 'rgba(52,211,153,0.08)',
 color: 'rgb(var(--pos))',
 border: '1px solid rgba(52,211,153,0.22)',
 }}
 title="Grant subscription to selected users"
 >
 <StarIcon size={13} />
 Grant
 <ChevronDownIcon size={11} />
 </button>
 {showGrantMenu && (
 <div
 className="absolute bottom-full mb-2 right-0 w-48 rounded-xl overflow-hidden shadow-2xl"
 style={{
 background: 'rgb(var(--surface-secondary))',
 border: '1px solid rgb(var(--line) / 0.25)',
 }}
 >
 {[
 { key: '1_month', label: '1 Month', sub: '30 days each' },
 { key: '1_year', label: '1 Year', sub: '365 days each' },
 { key: 'lifetime', label: 'Lifetime', sub: 'No expiry' },
 ].map((opt, i) => (
 <button
 key={opt.key}
 onClick={() => run(() => onBulkGrant(opt.key))}
 className="w-full px-3 py-2.5 text-left text-xs text-text-primary hover:bg-ink/5 transition-colors"
 style={i > 0 ? { borderTop: '1px solid rgb(var(--ink) / 0.04)' } : {}}
 >
 <span className="font-semibold">{opt.label}</span>
 <span className="block text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 {opt.sub}
 </span>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Bulk revoke */}
 {subscriberCount > 0 && (
 <button
 onClick={handleRevokeClick}
 disabled={busy}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all disabled:opacity-50 hover:scale-[1.02]"
 style={{
 background: 'rgba(248,113,113,0.08)',
 color: 'rgb(var(--neg))',
 border: '1px solid rgba(248,113,113,0.22)',
 }}
 title="Revoke subscription from selected subscribers"
 >
 <BanIcon size={13} />
 Revoke ({subscriberCount})
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
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all disabled:opacity-50 hover:scale-[1.02]"
 style={{
 background: 'rgb(var(--accent) / 0.08)',
 color: 'rgb(var(--accent))',
 border: '1px solid rgb(var(--line) / 0.22)',
 }}
 title="Send a template message to selected users"
 >
 <SendIcon size={13} />
 Send ({reachableCount})
 <ChevronDownIcon size={11} />
 </button>
 {showSendMenu && (
 <div
 className="absolute bottom-full mb-2 right-0 w-64 rounded-xl overflow-hidden shadow-2xl"
 style={{
 background: 'rgb(var(--surface-secondary))',
 border: '1px solid rgb(var(--line) / 0.25)',
 }}
 >
 <div
 className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold"
 style={{
 color: 'rgb(var(--fg-muted))',
 background: 'rgb(var(--ink) / 0.02)',
 }}
 >
 Pick template — opens browser tabs
 </div>
 {templates
 .filter((t) => t.id !== 'custom')
 .map((t, idx) => (
 <button
 key={t.id}
 onClick={() => handleSendTemplateClick(t)}
 className="w-full px-3 py-2 text-left text-xs text-text-primary hover:bg-ink/5 transition-colors"
 style={
 idx > 0
 ? { borderTop: '1px solid rgb(var(--ink) / 0.04)' }
 : {}
 }
 >
 <span className="font-semibold">{t.label}</span>
 <span className="block text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 {t.description}
 </span>
 </button>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Clear selection */}
 <button
 onClick={onClear}
 disabled={busy}
 className="ml-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 hover:bg-ink/5"
 style={{ background: 'rgb(var(--ink) / 0.04)', color: 'rgb(var(--fg-muted))' }}
 title="Clear selection"
 >
 <CloseIcon size={13} />
 </button>
 </div>
 );
};

/* ─────────────────────────────────────────────────────────────────────
 CSV Export helper
 ───────────────────────────────────────────────────────────────────── */

/** Convert user array to CSV + trigger download. */
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
