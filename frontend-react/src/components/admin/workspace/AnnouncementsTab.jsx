// ════════════════════════════════════════════════════════════════════
// AnnouncementsTab — admin CRUD for user-facing announcement modals
//   List existing announcements + create/edit form (content, image
//   upload-or-URL, CTA, audience targeting, frequency, schedule, status).
//   Backend: /api/v1/admin/announcements (+ /upload-image)
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { announcementApi } from '../../../services/announcementApi';
import { palette, surface, semantic } from '../designSystem';
import { Surface, SectionHeader, Badge, StatusBadge } from '../primitives';
import { PlusIcon, EditIcon, TrashIcon, CloseIcon } from '../Icons';

const AUDIENCES = [
  { value: 'all',          label: 'Everyone' },
  { value: 'role',         label: 'By subscription role' },
  { value: 'user',         label: 'Specific user (ID)' },
  { value: 'no_telegram',  label: 'Users without Telegram linked' },
  { value: 'paid_outside', label: 'Paid users outside VIP group' },
];
const ROLES = ['free', 'subscriber', 'premium', 'admin'];
const STATUSES = ['draft', 'active', 'archived'];

const EMPTY = {
  title: '', body: '', image_url: '', cta_label: '', cta_url: '',
  audience: 'all', target_role: 'subscriber', target_user_id: '',
  max_shows: 3, cooldown_hours: 72, status: 'draft',
  starts_at: '', ends_at: '',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const inputCls =
  'w-full px-3 py-2 rounded-md bg-ink/[0.03] border border-ink/[0.08] text-text-primary text-xs ' +
  'placeholder:text-text-primary/30 focus:outline-none focus:border-ink/20 transition-colors';
const labelCls = 'block text-[10px] uppercase tracking-wider text-text-primary/40 font-mono mb-1.5';

export const AnnouncementsTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list view; object = form
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await announcementApi.list();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY); setEditing('new'); setErr(''); };
  const openEdit = (a) => {
    setForm({
      ...EMPTY, ...a,
      target_user_id: a.target_user_id ?? '',
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : '',
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : '',
    });
    setEditing(a.id);
    setErr('');
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); setErr(''); };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const res = await announcementApi.uploadImage(file);
      if (res?.image_url) set('image_url', res.image_url);
    } catch {
      setErr('Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) { setErr('Title is required.'); return; }
    setSaving(true); setErr('');
    const payload = {
      ...form,
      target_user_id: form.audience === 'user' && form.target_user_id ? Number(form.target_user_id) : null,
      target_role: form.audience === 'role' ? form.target_role : null,
      max_shows: Number(form.max_shows) || 1,
      cooldown_hours: Number(form.cooldown_hours) || 1,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };
    try {
      if (editing === 'new') await announcementApi.create(payload);
      else await announcementApi.update(editing, payload);
      cancel();
      load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try { await announcementApi.remove(id); load(); } catch { /* ignore */ }
  };

  // ── FORM VIEW ──
  if (editing) {
    const showImg = !!form.image_url;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader title={editing === 'new' ? 'New Announcement' : `Edit Announcement #${editing}`} />
          <button onClick={cancel} className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-text-primary transition-colors">
            <CloseIcon size={16} />
          </button>
        </div>

        <Surface className="p-5 space-y-4">
          {err && (
            <div className="px-3 py-2 rounded-md text-[11px]" style={{ background: 'rgba(248,113,113,0.08)', color: palette.red[300], border: '1px solid rgba(248,113,113,0.2)' }}>
              {err}
            </div>
          )}

          <div>
            <label className={labelCls}>Title *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Announcement title" />
          </div>

          <div>
            <label className={labelCls}>Body</label>
            <textarea className={inputCls} rows={3} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Message body (optional)" />
          </div>

          {/* image: upload OR url */}
          <div>
            <label className={labelCls}>Image (optional)</label>
            <div className="flex items-center gap-2">
              <input className={inputCls} value={form.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="Paste image URL or upload →" />
              <label className="shrink-0 px-3 py-2 rounded-md bg-ink/[0.04] border border-ink/[0.08] text-text-primary/70 text-[10px] uppercase tracking-wider font-mono cursor-pointer hover:bg-ink/[0.07] transition-colors">
                {uploading ? '...' : 'Upload'}
                <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
            </div>
            {showImg && (
              <img src={form.image_url} alt="" className="mt-2 rounded-md max-h-28 object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Button label</label>
              <input className={inputCls} value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} placeholder="e.g. Learn more" />
            </div>
            <div>
              <label className={labelCls}>Button link</label>
              <input className={inputCls} value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} placeholder="/pricing or https://..." />
            </div>
          </div>

          {/* audience */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Audience</label>
              <select className={inputCls} value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            {form.audience === 'role' && (
              <div>
                <label className={labelCls}>Target role</label>
                <select className={inputCls} value={form.target_role} onChange={(e) => set('target_role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            {form.audience === 'user' && (
              <div>
                <label className={labelCls}>User ID</label>
                <input className={inputCls} type="number" value={form.target_user_id} onChange={(e) => set('target_user_id', e.target.value)} placeholder="e.g. 5" />
              </div>
            )}
          </div>

          {/* frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Max shows / user</label>
              <input className={inputCls} type="number" min={1} value={form.max_shows} onChange={(e) => set('max_shows', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Cooldown (hours)</label>
              <input className={inputCls} type="number" min={1} value={form.cooldown_hours} onChange={(e) => set('cooldown_hours', e.target.value)} />
            </div>
          </div>

          {/* schedule + status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Starts</label>
              <input className={inputCls} type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Ends</label>
              <input className={inputCls} type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-md text-[11px] uppercase tracking-wider font-bold font-mono transition-all disabled:opacity-50"
              style={{ background: palette.gold[300], color: 'rgb(var(--surface))' }}>
              {saving ? 'Saving...' : (editing === 'new' ? 'Create' : 'Save changes')}
            </button>
            <button onClick={cancel}
              className="px-4 py-2 rounded-md text-[11px] uppercase tracking-wider font-mono text-text-primary/50 hover:text-text-primary transition-colors">
              Cancel
            </button>
          </div>
        </Surface>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Announcements" subtitle="Modal messages shown to users in-app" />
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] uppercase tracking-wider font-bold font-mono transition-all"
          style={{ background: palette.gold[300], color: 'rgb(var(--surface))' }}>
          <PlusIcon size={14} /> New
        </button>
      </div>

      {loading ? (
        <div className="lqsk-group space-y-2">
          {[...Array(4)].map((_, i) => (
            <Surface key={i} className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-ink/[0.05]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-ink/[0.05]" />
                <div className="h-2.5 w-2/3 rounded bg-ink/[0.03]" />
              </div>
            </Surface>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Surface className="p-8 text-center text-text-primary/40 text-xs">No announcements yet. Click “New” to create one.</Surface>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Surface key={a.id} className="p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary text-sm font-medium truncate">{a.title}</span>
                  <StatusBadge status={a.status} label={a.status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-text-primary/40">
                  <span>{AUDIENCES.find((x) => x.value === a.audience)?.label || a.audience}</span>
                  <span>·</span>
                  <span>{a.view_count || 0} seen</span>
                  <span>·</span>
                  <span>max {a.max_shows} / {a.cooldown_hours}h</span>
                  {a.ends_at && <><span>·</span><span>ends {fmtDate(a.ends_at)}</span></>}
                </div>
              </div>
              <button onClick={() => openEdit(a)} className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-text-primary transition-colors">
                <EditIcon size={14} />
              </button>
              <button onClick={() => del(a.id)} className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-red-400 transition-colors">
                <TrashIcon size={14} />
              </button>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnouncementsTab;
