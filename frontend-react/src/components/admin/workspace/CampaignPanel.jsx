// src/components/admin/workspace/CampaignPanel.jsx
//
// Flexible campaign form: line items editor + custom metadata fields.
// User bisa add/edit/delete line item, plus add custom key-value fields.

import { useState, useEffect } from 'react';
import { SidePanel } from './SidePanel';
import {
  SparklesIcon,
  AlertTriangleIcon,
  PlusIcon,
  TrashIcon,
  TelegramIcon,
  DiscordIcon,
  TrendingUpIcon,
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

// ════════════════════════════════════════════════════════════════════
// PickOption (radio-style buttons)
// ════════════════════════════════════════════════════════════════════

const PickOption = ({ value, currentValue, onClick, label, color, Icon }) => {
  const selected = value === currentValue;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold tracking-tight transition-all"
      style={{
        background: selected ? `${color}18` : 'rgba(255,255,255,0.02)',
        color: selected ? color : '#8a7a6e',
        border: `1px solid ${selected ? `${color}45` : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {Icon && <Icon size={11} />}
      {label}
    </button>
  );
};

// ════════════════════════════════════════════════════════════════════
// Twitter icon (reused from MarketingTab)
// ════════════════════════════════════════════════════════════════════

const TwitterIcon = ({ size = 14, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const PLATFORMS = [
  { value: 'twitter', label: 'Twitter/X', color: '#fff', Icon: TwitterIcon },
  { value: 'telegram', label: 'Telegram', color: '#229ED9', Icon: TelegramIcon },
  { value: 'discord', label: 'Discord', color: '#5865F2', Icon: DiscordIcon },
  { value: 'influencer', label: 'Influencer', color: '#d4a853', Icon: SparklesIcon },
  { value: 'other', label: 'Other', color: '#8a7a6e', Icon: TrendingUpIcon },
];

const STATUSES = [
  { value: 'planning', label: 'Planning', color: '#a78bfa' },
  { value: 'active', label: 'Active', color: '#34d399' },
  { value: 'paused', label: 'Paused', color: '#fbbf24' },
  { value: 'completed', label: 'Completed', color: '#60a5fa' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b5c52' },
];

// ════════════════════════════════════════════════════════════════════
// LineItemRow — single line item editor
// ════════════════════════════════════════════════════════════════════

const LineItemRow = ({ item, onChange, onDelete }) => (
  <div
    className="rounded-lg p-2.5 space-y-2"
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <div className="grid grid-cols-2 gap-2">
      <input
        type="text"
        value={item.label || ''}
        onChange={(e) => onChange({ ...item, label: e.target.value })}
        placeholder="Label (e.g. Boost post #1)"
        className="px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <input
        type="number"
        step="0.01"
        min="0"
        value={item.amount ?? ''}
        onChange={(e) => onChange({ ...item, amount: parseFloat(e.target.value) || 0 })}
        placeholder="Amount ($)"
        className="px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none tabular-nums"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </div>
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={item.date || ''}
        onChange={(e) => onChange({ ...item, date: e.target.value })}
        className="flex-1 px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
          colorScheme: 'dark',
        }}
      />
      <input
        type="text"
        value={item.note || ''}
        onChange={(e) => onChange({ ...item, note: e.target.value })}
        placeholder="Note (optional)"
        className="flex-[2] px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <button
        type="button"
        onClick={onDelete}
        className="p-1.5 rounded-md transition-colors"
        style={{
          color: '#f87171',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.2)',
        }}
      >
        <TrashIcon size={11} />
      </button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// MetadataRow — custom key-value pair editor
// ════════════════════════════════════════════════════════════════════

const MetadataRow = ({ k, v, onChange, onDelete }) => (
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={k}
      onChange={(e) => onChange(e.target.value, v)}
      placeholder="Key (e.g. impressions)"
      className="flex-1 px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    />
    <input
      type="text"
      value={typeof v === 'string' ? v : JSON.stringify(v)}
      onChange={(e) => {
        const val = e.target.value;
        // Try parse as number if numeric, otherwise keep string
        const num = Number(val);
        const parsed = val !== '' && !isNaN(num) ? num : val;
        onChange(k, parsed);
      }}
      placeholder="Value (e.g. 50000)"
      className="flex-[2] px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    />
    <button
      type="button"
      onClick={onDelete}
      className="p-1.5 rounded-md transition-colors"
      style={{
        color: '#f87171',
        background: 'rgba(248,113,113,0.08)',
        border: '1px solid rgba(248,113,113,0.2)',
      }}
    >
      <TrashIcon size={11} />
    </button>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Panel
// ════════════════════════════════════════════════════════════════════

export const CampaignPanel = ({ isOpen, onClose, editingItem, onSave }) => {
  const isEdit = !!editingItem;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState('twitter');
  const [budgetUsd, setBudgetUsd] = useState('');
  const [spentUsd, setSpentUsd] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('planning');
  const [lineItems, setLineItems] = useState([]);
  const [metadata, setMetadata] = useState([]); // [{key, value}] tuples

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    if (editingItem) {
      setName(editingItem.name || '');
      setDescription(editingItem.description || '');
      setPlatform(editingItem.platform || 'twitter');
      setBudgetUsd(String(editingItem.budget_usd || ''));
      setSpentUsd(String(editingItem.spent_usd || ''));
      setStartDate(editingItem.start_date || '');
      setEndDate(editingItem.end_date || '');
      setStatus(editingItem.status || 'planning');
      setLineItems(editingItem.line_items || []);
      // Convert metadata object to [{key, value}] tuples
      const meta = editingItem.metadata || {};
      setMetadata(Object.entries(meta).map(([k, v]) => ({ key: k, value: v })));
    } else {
      setName('');
      setDescription('');
      setPlatform('twitter');
      setBudgetUsd('');
      setSpentUsd('');
      setStartDate('');
      setEndDate('');
      setStatus('planning');
      setLineItems([]);
      setMetadata([]);
    }
    setError(null);
  }, [isOpen, editingItem]);

  // Auto-calculate spent from line items if user wants
  const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Nama campaign wajib diisi');
      return;
    }
    const budget = parseFloat(budgetUsd) || 0;
    const spent = parseFloat(spentUsd) || 0;
    if (budget < 0 || spent < 0) {
      setError('Budget/spent tidak boleh negatif');
      return;
    }

    // Build metadata dict
    const metadataDict = {};
    for (const { key, value } of metadata) {
      const trimKey = key.trim();
      if (trimKey) metadataDict[trimKey] = value;
    }

    // Clean line items
    const cleanLineItems = lineItems
      .filter((li) => (li.label || '').trim() || (Number(li.amount) || 0) > 0)
      .map((li) => ({
        label: (li.label || '').trim(),
        amount: Number(li.amount) || 0,
        date: li.date || null,
        note: (li.note || '').trim() || null,
      }));

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      platform,
      budget_usd: budget,
      spent_usd: spent,
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      line_items: cleanLineItems,
      metadata: metadataDict,
    };

    setSaving(true);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Campaign' : 'New Campaign'}
      subtitle={isEdit ? `#${editingItem?.id}` : 'Track budget + custom fields'}
      Icon={SparklesIcon}
      width="lg"
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
            disabled={saving || !name.trim()}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #d4a853, #8b6914)',
              color: '#0a0506',
            }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Campaign'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <Field label="Campaign Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Twitter Promo Q2 2026"
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </Field>

        {/* Description */}
        <Field label="Description" hint="(opsional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Goal, target audience, atau strategy summary..."
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none resize-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </Field>

        {/* Platform */}
        <Field label="Platform">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <PickOption
                key={p.value}
                value={p.value}
                currentValue={platform}
                onClick={() => setPlatform(p.value)}
                label={p.label}
                color={p.color}
                Icon={p.Icon}
              />
            ))}
          </div>
        </Field>

        {/* Status */}
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

        {/* Budget + Spent */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Budget (USD)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none tabular-nums"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
          </Field>
          <Field label="Spent (USD)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={spentUsd}
              onChange={(e) => setSpentUsd(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none tabular-nums"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
            {lineItemsTotal > 0 && lineItemsTotal !== parseFloat(spentUsd) && (
              <button
                type="button"
                onClick={() => setSpentUsd(String(lineItemsTotal))}
                className="text-[10px] mt-1 hover:underline"
                style={{ color: '#d4a853' }}
              >
                Sync from line items: ${lineItemsTotal.toFixed(2)}
              </button>
            )}
          </Field>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Start Date" hint="(opsional)">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none font-mono"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                colorScheme: 'dark',
              }}
            />
          </Field>
          <Field label="End Date" hint="(opsional)">
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none font-mono"
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                colorScheme: 'dark',
              }}
            />
          </Field>
        </div>

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Line Items
              <span className="normal-case tracking-normal lowercase ml-1" style={{ color: '#4a3f39' }}>
                ({lineItems.length})
              </span>
            </label>
            <button
              type="button"
              onClick={() =>
                setLineItems([
                  ...lineItems,
                  { label: '', amount: 0, date: '', note: '' },
                ])
              }
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider"
              style={{
                color: '#d4a853',
                background: 'rgba(212,168,83,0.08)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <PlusIcon size={10} />
              Add Item
            </button>
          </div>
          {lineItems.length === 0 ? (
            <div
              className="text-center py-4 rounded-lg text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px dashed rgba(255,255,255,0.06)',
                color: '#6b5c52',
              }}
            >
              Belum ada line item. Klik "Add Item" untuk track breakdown spending.
            </div>
          ) : (
            <div className="space-y-1.5">
              {lineItems.map((item, i) => (
                <LineItemRow
                  key={i}
                  item={item}
                  onChange={(updated) => {
                    const next = [...lineItems];
                    next[i] = updated;
                    setLineItems(next);
                  }}
                  onDelete={() => setLineItems(lineItems.filter((_, idx) => idx !== i))}
                />
              ))}
              <p className="text-[10px] text-right tabular-nums" style={{ color: '#8a7a6e' }}>
                Line items total: ${lineItemsTotal.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* Custom Metadata */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Custom Fields
              <span className="normal-case tracking-normal lowercase ml-1" style={{ color: '#4a3f39' }}>
                ({metadata.length})
              </span>
            </label>
            <button
              type="button"
              onClick={() => setMetadata([...metadata, { key: '', value: '' }])}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider"
              style={{
                color: '#d4a853',
                background: 'rgba(212,168,83,0.08)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <PlusIcon size={10} />
              Add Field
            </button>
          </div>
          {metadata.length === 0 ? (
            <div
              className="text-center py-4 rounded-lg text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px dashed rgba(255,255,255,0.06)',
                color: '#6b5c52',
              }}
            >
              Custom fields: tambah KPI/metric apa aja (impressions, conversions, ROI, tags, dll).
            </div>
          ) : (
            <div className="space-y-1.5">
              {metadata.map((m, i) => (
                <MetadataRow
                  key={i}
                  k={m.key}
                  v={m.value}
                  onChange={(newKey, newVal) => {
                    const next = [...metadata];
                    next[i] = { key: newKey, value: newVal };
                    setMetadata(next);
                  }}
                  onDelete={() => setMetadata(metadata.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          )}
        </div>

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

        {/* Audit info (edit mode) */}
        {isEdit && editingItem && (
          <div
            className="text-[10px] px-3 py-2 rounded-md"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
              color: '#6b5c52',
            }}
          >
            <p>
              Created{' '}
              {new Date(editingItem.created_at).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {editingItem.creator && <> by @{editingItem.creator.username}</>}
            </p>
          </div>
        )}
      </div>
    </SidePanel>
  );
};
