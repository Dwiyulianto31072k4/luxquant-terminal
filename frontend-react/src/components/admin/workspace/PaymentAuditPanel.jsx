// src/components/admin/workspace/PaymentAuditPanel.jsx
//
// Payment-record audit banner for the Users page. Lists active
// premium/subscriber users (created on/after 2026-06-17) that still have NO
// confirmed payment record, lets an admin be assigned and the case marked
// recorded/waived. Grandfathered users (before the cutoff) are excluded by the
// backend. Self-contained; drop <PaymentAuditPanel/> at the top of Users.
//
import { useState, useEffect, useCallback } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { palette, tint } from '../designSystem';
import { AlertTriangleIcon, CheckCircleIcon, RefreshIcon, ChevronDownIcon } from '../Icons';

const STATUS = {
  pending: { label: 'Pending', color: palette.amber[400] },
  recorded: { label: 'Recorded', color: palette.green[400] },
  waived: { label: 'Waived', color: palette.warm[400] },
};

const daysAgo = (iso) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : `${d}d ago`;
};

const PaymentAuditPanel = () => {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await workspaceApi.getPaymentAudit()); }
    catch (e) { console.error('payment-audit load failed', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (userId, patch) => {
    setSaving((s) => ({ ...s, [userId]: true }));
    // optimistic
    setData((d) => d && ({ ...d, users: d.users.map((u) => u.user_id === userId ? { ...u, ...patch } : u) }));
    try { await workspaceApi.assignPaymentAudit(userId, patch); }
    catch (e) { window.alert('Save failed: ' + (e?.response?.data?.detail || e.message)); await load(); }
    finally { setSaving((s) => { const n = { ...s }; delete n[userId]; return n; }); }
  }, [load]);

  if (loading || !data) return null;
  const users = data.users || [];
  const admins = data.admins || [];
  const pending = data.summary?.pending || 0;

  // Nothing to flag → quiet green confirmation strip.
  if (users.length === 0) {
    return (
      <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2" style={{ background: '#0a0805', border: `1px solid ${tint(palette.green[400], 0.2)}` }}>
        <CheckCircleIcon size={14} style={{ color: palette.green[400] }} />
        <span className="text-[12px]" style={{ color: palette.warm[200] }}>Semua premium/subscriber (sejak 17 Jun 2026) sudah punya record bayar.</span>
      </div>
    );
  }

  const accent = pending > 0 ? palette.red[400] : palette.amber[400];

  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ background: '#0a0805', border: `1px solid ${tint(accent, 0.35)}` }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative inline-flex shrink-0">
            <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: accent }} />
            <AlertTriangleIcon size={15} style={{ color: accent }} />
          </span>
          <span className="text-[13px] font-semibold text-white">
            {users.length} user belum ada record bayar
          </span>
          <span className="text-[11px]" style={{ color: palette.warm[400] }}>
            · {pending} pending · wajib diisi admin (aturan sejak 17 Jun 2026)
          </span>
        </div>
        <ChevronDownIcon size={16} style={{ color: palette.warm[400], transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="flex justify-end mb-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px]" style={{ color: palette.warm[400], border: `1px solid ${tint(palette.warm[100], 0.12)}` }}>
              <RefreshIcon size={11} /> Refresh
            </button>
          </div>
          <div className="space-y-2">
            {users.map((u) => {
              const st = STATUS[u.status] || STATUS.pending;
              return (
                <div key={u.user_id} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tint(st.color, 0.18)}` }}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.color }} />
                        <span className="text-[12.5px] font-semibold text-white truncate">{u.username || u.email || `user #${u.user_id}`}</span>
                        <span className="text-[9.5px] uppercase tracking-wide px-1.5 rounded" style={{ background: tint(palette.gold[300], 0.12), color: palette.gold[300] }}>{u.role}</span>
                      </div>
                      <div className="text-[10.5px] mt-0.5" style={{ color: palette.warm[400] }}>
                        joined {daysAgo(u.created_at)}{u.subscription_source ? ` · src: ${u.subscription_source}` : ''}
                      </div>
                    </div>

                    <select
                      value={u.assigned_admin_id || ''}
                      onChange={(e) => save(u.user_id, { assigned_admin_id: e.target.value ? Number(e.target.value) : null })}
                      className="text-[11px] rounded-md px-2 py-1.5 outline-none"
                      style={{ background: '#12090d', border: `1px solid ${tint(palette.warm[100], 0.14)}`, color: palette.warm[100] }}
                    >
                      <option value="">— assign admin —</option>
                      {admins.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                    </select>

                    <select
                      value={u.status}
                      onChange={(e) => save(u.user_id, { status: e.target.value })}
                      className="text-[11px] rounded-md px-2 py-1.5 outline-none"
                      style={{ background: '#12090d', border: `1px solid ${tint(st.color, 0.3)}`, color: st.color }}
                    >
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k} style={{ color: '#fff', background: '#12090d' }}>{v.label}</option>)}
                    </select>

                    <input
                      defaultValue={u.note || ''}
                      onBlur={(e) => { if (e.target.value !== (u.note || '')) save(u.user_id, { note: e.target.value }); }}
                      placeholder="note (tx / metode / catatan)"
                      className="text-[11px] rounded-md px-2 py-1.5 outline-none flex-1 min-w-[160px]"
                      style={{ background: '#12090d', border: `1px solid ${tint(palette.warm[100], 0.12)}`, color: palette.warm[100] }}
                    />
                    {saving[u.user_id] && <span className="text-[10px]" style={{ color: palette.warm[500] }}>saving…</span>}
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
