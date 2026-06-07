// src/components/admin/workspace/TodoPanel.jsx
//
// Slide-in form for create/edit todo with tags editor.

import { useState, useEffect } from 'react';
import { SidePanel } from './SidePanel';
import {
  AlertTriangleIcon,
  CloseIcon,
  PlusIcon,
  SparklesIcon,
} from '../Icons';

// ════════════════════════════════════════════════════════════════════
// Field wrapper
// ════════════════════════════════════════════════════════════════════

const Field = ({ label, hint, required, children }) => (
  <div>
    <label
      className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {label}
      {required && <span style={{ color: '#f87171' }}> *</span>}
      {hint && (
        <span
          className="normal-case tracking-normal lowercase ml-1"
          style={{ color: '#4a3f39' }}
        >
          {hint}
        </span>
      )}
    </label>
    {children}
  </div>
);

const PickOption = ({ value, currentValue, onClick, label, emoji, color }) => {
  const selected = value === currentValue;
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold tracking-tight transition-all"
      style={{
        background: selected ? `${color}18` : 'rgba(255,255,255,0.02)',
        color: selected ? color : '#8a7a6e',
        border: `1px solid ${selected ? `${color}45` : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {emoji && <span className="mr-1">{emoji}</span>}
      {label}
    </button>
  );
};

const CATEGORIES = [
  { value: 'product', label: 'Product', emoji: '⚙️', color: '#60a5fa' },
  { value: 'marketing', label: 'Marketing', emoji: '📣', color: '#d4a853' },
  { value: 'ops', label: 'Ops', emoji: '🔧', color: '#34d399' },
  { value: 'bug', label: 'Bug', emoji: '🐛', color: '#f87171' },
  { value: 'idea', label: 'Idea', emoji: '💡', color: '#fbbf24' },
  { value: 'other', label: 'Other', emoji: '📌', color: '#8a7a6e' },
];

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: '#f87171' },
  { value: 'high', label: 'High', color: '#fb923c' },
  { value: 'normal', label: 'Normal', color: '#60a5fa' },
  { value: 'low', label: 'Low', color: '#8a7a6e' },
];

const STATUSES = [
  { value: 'backlog', label: 'Backlog', color: '#8a7a6e' },
  { value: 'in_progress', label: 'In Progress', color: '#60a5fa' },
  { value: 'done', label: 'Done', color: '#34d399' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b5c52' },
];

// ════════════════════════════════════════════════════════════════════
// Tags Input
// ════════════════════════════════════════════════════════════════════

const TagsInput = ({ tags, onChange }) => {
  const [input, setInput] = useState('');

  const addTag = (raw) => {
    const t = (raw || '').trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
    if (!t) return;
    if (tags.includes(t)) return;
    onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t) => onChange(tags.filter((x) => x !== t));

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className="rounded-lg p-2 flex flex-wrap gap-1.5 min-h-[40px]"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {tags.map((t) => (
        <span
          key={t}
          className="text-[11px] px-2 py-0.5 rounded font-mono flex items-center gap-1"
          style={{
            background: 'rgba(212,168,83,0.08)',
            color: '#d4a853',
            border: '1px solid rgba(212,168,83,0.22)',
          }}
        >
          #{t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            className="hover:text-red-400"
            style={{ color: '#8a7a6e' }}
          >
            <CloseIcon size={9} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => addTag(input)}
        placeholder={tags.length === 0 ? 'Type a tag + Enter (e.g. frontend, v2)' : ''}
        className="flex-1 min-w-[120px] bg-transparent text-xs text-white focus:outline-none px-1"
      />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Main Panel
// ════════════════════════════════════════════════════════════════════

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
      setTitle('');
      setDescription('');
      setCategory('other');
      setPriority('normal');
      setStatus(defaultStatus || 'backlog');
      setDueDate('');
      setTags([]);
    }
    setError(null);
  }, [isOpen, editingItem, defaultStatus]);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      priority,
      due_date: dueDate || null,
      tags,
    };

    // Add status only when editing (create defaults to backlog at backend)
    if (isEdit) payload.status = status;

    setSaving(true);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit TODO' : 'New TODO'}
      subtitle={isEdit ? `#${editingItem?.id}` : 'Internal task for the LuxQuant team'}
      Icon={SparklesIcon}
      width="md"
      footer={
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #d4a853, #8b6914)',
              color: '#0a0506',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create TODO'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Title */}
        <Field label="Title" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement AI Arena v6 frontend"
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </Field>

        {/* Description */}
        <Field label="Description" hint="(optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Detail, context, acceptance criteria…"
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none resize-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </Field>

        {/* Category */}
        <Field label="Category">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <PickOption
                key={c.value}
                value={c.value}
                currentValue={category}
                onClick={() => setCategory(c.value)}
                label={c.label}
                emoji={c.emoji}
                color={c.color}
              />
            ))}
          </div>
        </Field>

        {/* Priority */}
        <Field label="Priority">
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <PickOption
                key={p.value}
                value={p.value}
                currentValue={priority}
                onClick={() => setPriority(p.value)}
                label={p.label}
                color={p.color}
              />
            ))}
          </div>
        </Field>

        {/* Status (edit mode only) */}
        {isEdit && (
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <PickOption
                  key={s.value}
                  value={s.value}
                  currentValue={status}
                  onClick={() => setStatus(s.value)}
                  label={s.label}
                  color={s.color}
                />
              ))}
            </div>
          </Field>
        )}

        {/* Due date */}
        <Field label="Due Date" hint="(optional)">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none font-mono"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              colorScheme: 'dark',
            }}
          />
        </Field>

        {/* Tags */}
        <Field label="Tags" hint="(Enter or comma to add)">
          <TagsInput tags={tags} onChange={setTags} />
        </Field>

        {/* Error */}
        {error && (
          <div
            className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
            style={{
              background: 'rgba(248,113,113,0.08)',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.25)',
            }}
          >
            <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Audit (edit mode) */}
        {isEdit && editingItem && (
          <div
            className="text-[10px] px-3 py-2 rounded-md space-y-0.5"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              color: '#6b5c52',
            }}
          >
            <p>
              Created{' '}
              {new Date(editingItem.created_at).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {editingItem.creator && <> by @{editingItem.creator.username}</>}
            </p>
            {editingItem.completer && (
              <p style={{ color: '#34d399' }}>
                Completed by @{editingItem.completer.username} on{' '}
                {new Date(editingItem.completed_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
};
