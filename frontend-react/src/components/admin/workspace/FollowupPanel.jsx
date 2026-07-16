// src/components/admin/workspace/FollowupPanel.jsx
// Slide-in form create/edit followup. Wrapper SidePanel (→ Modal).
// v2: emoji kategori → ikon SVG custom; tombol footer → Gold/GhostButton.

import { useState, useEffect } from 'react';
import { SidePanel } from './SidePanel';
import { adminApi } from '../../../services/adminApi';
import { ClockIcon, AlertTriangleIcon, UserIcon, SearchIcon, CloseIcon } from '../Icons';
import { RenewalIcon, PaymentCardIcon, SupportIcon, NoteIcon } from './CategoryIcons';
import { GoldButton, GhostButton } from '../../autotrade/AutoTradeUI';

// ── User picker ──
const UserPicker = ({ selectedUser, onChange }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!search || search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await adminApi.getUsers({ search, pageSize: 8 });
        setResults(data.users || []);
        setShowResults(true);
      } catch (e) { console.error(e); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  if (selectedUser) {
    return (
      <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(138,138,147,0.06)', border: '1px solid rgba(138,138,147,0.22)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <UserIcon size={12} style={{ color: '#8a8a93' }} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-text-primary">@{selectedUser.username}</p>
            <p className="truncate font-mono text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>#{selectedUser.id}</p>
          </div>
        </div>
        <button type="button" onClick={() => { onChange(null); setSearch(''); }} className="rounded p-1.5 transition-colors" style={{ color: 'rgb(var(--fg-muted))', background: 'rgba(255,255,255,0.04)' }}>
          <CloseIcon size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <SearchIcon size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgb(var(--fg-muted))' }} />
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => setShowResults(true)} placeholder="Search user (min 2 chars)…"
        className="w-full rounded-lg py-2 pl-9 pr-3 text-xs text-text-primary focus:outline-none" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }} />
      {showResults && results.length > 0 && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg shadow-2xl" style={{ background: 'rgb(var(--surface-secondary))', border: '1px solid rgb(var(--line) / 0.22)' }}>
          {results.map((u, i) => (
            <button key={u.id} type="button" onClick={() => { onChange(u); setSearch(''); setShowResults(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5" style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: 'rgba(212,168,83,0.15)', color: 'rgb(var(--accent))' }}>{u.username?.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">@{u.username}</p>
                <p className="truncate font-mono text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>{u.email}</p>
              </div>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: u.role === 'subscriber' ? 'rgba(52,211,153,0.12)' : 'rgba(107,92,82,0.12)', color: u.role === 'subscriber' ? '#34d399' : '#8a7a6e' }}>{u.role}</span>
            </button>
          ))}
        </div>
      )}
      {searching && <p className="mt-1 text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>Searching…</p>}
    </div>
  );
};

const Field = ({ label, hint, required, children }) => (
  <div>
    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
      {label}{required && <span style={{ color: 'rgb(var(--neg))' }}> *</span>}
      {hint && <span className="ml-1 lowercase tracking-normal" style={{ color: 'rgb(var(--fg-muted))' }}>{hint}</span>}
    </label>
    {children}
  </div>
);

const PickOption = ({ value, currentValue, onClick, label, Icon, color }) => {
  const selected = value === currentValue;
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-tight transition-all"
      style={{ background: selected ? `${color}18` : 'rgba(255,255,255,0.02)', color: selected ? color : 'rgb(var(--fg-muted))', border: `1px solid ${selected ? `${color}45` : 'rgba(255,255,255,0.06)'}` }}>
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
};

const CATEGORIES = [
  { value: 'renewal', label: 'Renewal', Icon: RenewalIcon, color: '#8a8a93' },
  { value: 'winback', label: 'Win-back', Icon: RenewalIcon, color: '#8a8a93' },
  { value: 'payment', label: 'Payment', Icon: PaymentCardIcon, color: 'rgb(var(--pos))' },
  { value: 'support', label: 'Support', Icon: SupportIcon, color: 'rgb(var(--warn))' },
  { value: 'general', label: 'General', Icon: NoteIcon, color: 'rgb(var(--fg-muted))' },
];

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'rgb(var(--neg))' },
  { value: 'high', label: 'High', color: '#fb923c' },
  { value: 'normal', label: 'Normal', color: '#8a8a93' },
  { value: 'low', label: 'Low', color: 'rgb(var(--fg-muted))' },
];

const toDateTimeLocal = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};
const fromDateTimeLocal = (localStr) => (localStr ? new Date(localStr).toISOString() : null);

export const FollowupPanel = ({ isOpen, onClose, editingItem, onSave }) => {
  const isEdit = !!editingItem;
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [linkedUser, setLinkedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setTitle(editingItem.title || '');
      setNote(editingItem.note || '');
      setCategory(editingItem.category || 'general');
      setPriority(editingItem.priority || 'normal');
      setDueDate(toDateTimeLocal(editingItem.due_date));
      setLinkedUser(editingItem.user || null);
    } else {
      setTitle(''); setNote(''); setCategory('general'); setPriority('normal');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      setDueDate(toDateTimeLocal(tomorrow.toISOString()));
      setLinkedUser(null);
    }
    setError(null);
  }, [isOpen, editingItem]);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) return setError('Title is required');
    if (!dueDate) return setError('Due date is required');
    const payload = {
      title: title.trim(),
      note: note.trim() || null,
      category, priority,
      due_date: fromDateTimeLocal(dueDate),
      user_id: linkedUser?.id || null,
    };
    setSaving(true);
    try { await onSave(payload); }
    catch (err) { setError(err.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <SidePanel
      isOpen={isOpen} onClose={onClose}
      title={isEdit ? 'Edit Follow-up' : 'New Follow-up'}
      subtitle={isEdit ? `#${editingItem?.id}` : 'Schedule a collection / reminder'}
      Icon={ClockIcon} width="md"
      footer={
        <div className="flex gap-2">
          <GhostButton onClick={onClose} disabled={saving} className="flex-1">Cancel</GhostButton>
          <GoldButton onClick={handleSubmit} disabled={saving || !title.trim() || !dueDate} className="flex-1">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Follow-up'}
          </GoldButton>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chase renewal @lianprotrader" maxLength={200}
            className="w-full rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </Field>

        <div className="grid grid-cols-1 gap-3">
          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <PickOption key={c.value} value={c.value} currentValue={category} onClick={() => setCategory(c.value)} label={c.label} Icon={c.Icon} color={c.color} />
              ))}
            </div>
          </Field>
          <Field label="Priority">
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <PickOption key={p.value} value={p.value} currentValue={priority} onClick={() => setPriority(p.value)} label={p.label} color={p.color} />
              ))}
            </div>
          </Field>
        </div>

        <Field label="Due Date" required>
          <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 font-mono text-xs text-text-primary focus:outline-none" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }} />
        </Field>

        <Field label="Link to User" hint="(optional — if this follow-up is tied to a specific user)">
          <UserPicker selectedUser={linkedUser} onChange={setLinkedUser} />
        </Field>

        <Field label="Note" hint="(optional)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Additional detail, context, or action items…"
            className="w-full resize-none rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.08)', color: 'rgb(var(--neg))', border: '1px solid rgba(248,113,113,0.25)' }}>
            <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {isEdit && editingItem && (
          <div className="rounded-md px-3 py-2 text-[10px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'rgb(var(--fg-muted))' }}>
            <p>Created {new Date(editingItem.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {editingItem.creator && <> by @{editingItem.creator.username}</>}</p>
            {editingItem.completer && (
              <p style={{ color: 'rgb(var(--pos))' }}>Completed by @{editingItem.completer.username} on {new Date(editingItem.completed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
};
