// src/components/admin/workspace/TodoPanel.jsx
// Slide-in form create/edit todo + tags. Wrapper SidePanel (→ Modal).
// v2: emoji kategori → ikon SVG custom; tombol footer → Gold/GhostButton.

import { useState, useEffect } from 'react';
import { SidePanel } from './SidePanel';
import { AlertTriangleIcon, CloseIcon, SparklesIcon } from '../Icons';
import { GearIcon, MegaphoneIcon, WrenchIcon, BugIcon, BulbIcon, PinIcon } from './CategoryIcons';
import { GoldButton, GhostButton } from '../../autotrade/AutoTradeUI';

const Field = ({ label, hint, required, children }) => (
  <div>
    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--ink) / 0.4)' }}>
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
      style={{ background: selected ? `${color}18` : 'rgb(var(--ink) / 0.02)', color: selected ? color : 'rgb(var(--fg-muted))', border: `1px solid ${selected ? `${color}45` : 'rgb(var(--ink) / 0.06)'}` }}>
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
};

const CATEGORIES = [
  { value: 'product', label: 'Product', Icon: GearIcon, color: '#8a8a93' },
  { value: 'marketing', label: 'Marketing', Icon: MegaphoneIcon, color: 'rgb(var(--accent))' },
  { value: 'ops', label: 'Ops', Icon: WrenchIcon, color: 'rgb(var(--pos))' },
  { value: 'bug', label: 'Bug', Icon: BugIcon, color: 'rgb(var(--neg))' },
  { value: 'idea', label: 'Idea', Icon: BulbIcon, color: 'rgb(var(--warn))' },
  { value: 'other', label: 'Other', Icon: PinIcon, color: 'rgb(var(--fg-muted))' },
];

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'rgb(var(--neg))' },
  { value: 'high', label: 'High', color: '#fb923c' },
  { value: 'normal', label: 'Normal', color: '#8a8a93' },
  { value: 'low', label: 'Low', color: 'rgb(var(--fg-muted))' },
];

const STATUSES = [
  { value: 'backlog', label: 'Backlog', color: 'rgb(var(--fg-muted))' },
  { value: 'in_progress', label: 'In Progress', color: '#8a8a93' },
  { value: 'done', label: 'Done', color: 'rgb(var(--pos))' },
  { value: 'cancelled', label: 'Cancelled', color: 'rgb(var(--fg-muted))' },
];

const TagsInput = ({ tags, onChange }) => {
  const [input, setInput] = useState('');
  const addTag = (raw) => {
    const t = (raw || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]); setInput('');
  };
  const removeTag = (t) => onChange(tags.filter((x) => x !== t));
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
    else if (e.key === 'Backspace' && input === '' && tags.length > 0) removeTag(tags[tags.length - 1]);
  };
  return (
    <div className="flex min-h-[40px] flex-wrap gap-1.5 rounded-lg p-2" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }}>
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px]" style={{ background: 'rgba(212,168,83,0.08)', color: 'rgb(var(--accent))', border: '1px solid rgb(var(--line) / 0.22)' }}>
          #{t}
          <button type="button" onClick={() => removeTag(t)} className="hover:text-red-400" style={{ color: 'rgb(var(--fg-muted))' }}><CloseIcon size={9} /></button>
        </span>
      ))}
      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} onBlur={() => addTag(input)}
        placeholder={tags.length === 0 ? 'Type a tag + Enter (e.g. frontend, v2)' : ''} className="min-w-[120px] flex-1 bg-transparent px-1 text-xs text-text-primary focus:outline-none" />
    </div>
  );
};

export const TodoPanel = ({ isOpen, onClose, editingItem, defaultStatus, onSave }) => {
  const isEdit = !!editingItem;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('normal');
  const [status, setStatus] = useState('backlog');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setTitle(editingItem.title || '');
      setDescription(editingItem.description || '');
      setCategory(editingItem.category || 'other');
      setPriority(editingItem.priority || 'normal');
      setStatus(editingItem.status || 'backlog');
      setDueDate(editingItem.due_date || '');
      setTags(editingItem.tags || []);
    } else {
      setTitle(''); setDescription(''); setCategory('other'); setPriority('normal');
      setStatus(defaultStatus || 'backlog'); setDueDate(''); setTags([]);
    }
    setError(null);
  }, [isOpen, editingItem, defaultStatus]);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) return setError('Title is required');
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category, priority,
      due_date: dueDate || null,
      tags,
    };
    if (isEdit) payload.status = status;
    setSaving(true);
    try { await onSave(payload); }
    catch (err) { setError(err.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <SidePanel
      isOpen={isOpen} onClose={onClose}
      title={isEdit ? 'Edit TODO' : 'New TODO'}
      subtitle={isEdit ? `#${editingItem?.id}` : 'Internal task for the LuxQuant team'}
      Icon={SparklesIcon} width="md"
      footer={
        <div className="flex gap-2">
          <GhostButton onClick={onClose} disabled={saving} className="flex-1">Cancel</GhostButton>
          <GoldButton onClick={handleSubmit} disabled={saving || !title.trim()} className="flex-1">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create TODO'}
          </GoldButton>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Implement AI Arena v6 frontend" maxLength={200}
            className="w-full rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
        </Field>

        <Field label="Description" hint="(optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Detail, context, acceptance criteria…"
            className="w-full resize-none rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
        </Field>

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

        {isEdit && (
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <PickOption key={s.value} value={s.value} currentValue={status} onClick={() => setStatus(s.value)} label={s.label} color={s.color} />
              ))}
            </div>
          </Field>
        )}

        <Field label="Due Date" hint="(optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 font-mono text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)', colorScheme: 'dark' }} />
        </Field>

        <Field label="Tags" hint="(Enter or comma to add)">
          <TagsInput tags={tags} onChange={setTags} />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.08)', color: 'rgb(var(--neg))', border: '1px solid rgba(248,113,113,0.25)' }}>
            <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {isEdit && editingItem && (
          <div className="space-y-0.5 rounded-md px-3 py-2 text-[10px]" style={{ background: 'rgb(var(--ink) / 0.02)', border: '1px solid rgb(var(--ink) / 0.04)', color: 'rgb(var(--fg-muted))' }}>
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
