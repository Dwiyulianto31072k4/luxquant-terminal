// src/components/admin/workspace/CampaignPanel.jsx
// Campaign form: line items + custom metadata. Wrapper SidePanel (→ Modal).
// v2: tombol footer → Gold/GhostButton. (Platform pills tetap brand color.)

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
import { GoldButton, GhostButton } from '../../autotrade/AutoTradeUI';

const Field = ({ label, hint, required, children }) => (
 <div>
 <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--ink) / 0.4)' }}>
 {label}
 {required && <span style={{ color: 'rgb(var(--neg))' }}> *</span>}
 {hint && <span className="ml-1 lowercase tracking-normal" style={{ color: 'rgb(var(--fg-muted))' }}>{hint}</span>}
 </label>
 {children}
 </div>
);

const PickOption = ({ value, currentValue, onClick, label, color, Icon }) => {
 const selected = value === currentValue;
 return (
 <button type="button" onClick={onClick}
 className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-tight transition-all"
 style={{ background: selected ? `${color}18` : 'rgb(var(--ink) / 0.02)', color: selected ? color : 'rgb(var(--fg-muted))', border: `1px solid ${selected ? `${color}45` : 'rgb(var(--ink) / 0.06)'}` }}>
 {Icon && <Icon size={11} />}
 {label}
 </button>
 );
};

const TwitterIcon = ({ size = 14, ...props }) => (
 <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...props}>
 <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
 </svg>
);

const PLATFORMS = [
 { value: 'twitter', label: 'Twitter/X', color: 'rgb(var(--fg))', Icon: TwitterIcon },
 { value: 'telegram', label: 'Telegram', color: '#229ED9', Icon: TelegramIcon },
 { value: 'discord', label: 'Discord', color: '#5865F2', Icon: DiscordIcon },
 { value: 'influencer', label: 'Influencer', color: 'rgb(var(--accent))', Icon: SparklesIcon },
 { value: 'other', label: 'Other', color: 'rgb(var(--fg-muted))', Icon: TrendingUpIcon },
];

const STATUSES = [
 { value: 'planning', label: 'Planning', color: '#8a8a93' },
 { value: 'active', label: 'Active', color: 'rgb(var(--pos))' },
 { value: 'paused', label: 'Paused', color: 'rgb(var(--warn))' },
 { value: 'completed', label: 'Completed', color: '#8a8a93' },
 { value: 'cancelled', label: 'Cancelled', color: 'rgb(var(--fg-muted))' },
];

const inputCls = "w-full rounded-md px-2.5 py-1.5 text-xs text-text-primary focus:outline-none";
const inputStyle = { background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.08)' };

const LineItemRow = ({ item, onChange, onDelete }) => (
 <div className="space-y-2 rounded-lg p-2.5" style={{ background: 'rgb(var(--ink) / 0.02)', border: '1px solid rgb(var(--ink) / 0.05)' }}>
 <div className="grid grid-cols-2 gap-2">
 <input type="text" value={item.label || ''} onChange={(e) => onChange({ ...item, label: e.target.value })} placeholder="Label (e.g. Boost post #1)" className={inputCls} style={inputStyle} />
 <input type="number" step="0.01" min="0" value={item.amount ?? ''} onChange={(e) => onChange({ ...item, amount: parseFloat(e.target.value) || 0 })} placeholder="Amount ($)" className={`${inputCls} tabular-nums`} style={inputStyle} />
 </div>
 <div className="flex items-center gap-2">
 <input type="date" value={item.date || ''} onChange={(e) => onChange({ ...item, date: e.target.value })} className={`${inputCls} flex-1 font-mono`} style={{ ...inputStyle, colorScheme: 'dark' }} />
 <input type="text" value={item.note || ''} onChange={(e) => onChange({ ...item, note: e.target.value })} placeholder="Note (optional)" className={`${inputCls} flex-[2]`} style={inputStyle} />
 <button type="button" onClick={onDelete} className="rounded-md p-1.5 transition-colors" style={{ color: 'rgb(var(--neg))', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
 <TrashIcon size={11} />
 </button>
 </div>
 </div>
);

const MetadataRow = ({ k, v, onChange, onDelete }) => (
 <div className="flex items-center gap-2">
 <input type="text" value={k} onChange={(e) => onChange(e.target.value, v)} placeholder="Key (e.g. impressions)" className={`${inputCls} flex-1 font-mono`} style={inputStyle} />
 <input type="text" value={typeof v === 'string' ? v : JSON.stringify(v)} onChange={(e) => { const val = e.target.value; const num = Number(val); onChange(k, val !== '' && !isNaN(num) ? num : val); }} placeholder="Value (e.g. 50000)" className={`${inputCls} flex-[2]`} style={inputStyle} />
 <button type="button" onClick={onDelete} className="rounded-md p-1.5 transition-colors" style={{ color: 'rgb(var(--neg))', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
 <TrashIcon size={11} />
 </button>
 </div>
);

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
 const [metadata, setMetadata] = useState([]);
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
 const meta = editingItem.metadata || {};
 setMetadata(Object.entries(meta).map(([k, v]) => ({ key: k, value: v })));
 } else {
 setName(''); setDescription(''); setPlatform('twitter'); setBudgetUsd(''); setSpentUsd('');
 setStartDate(''); setEndDate(''); setStatus('planning'); setLineItems([]); setMetadata([]);
 }
 setError(null);
 }, [isOpen, editingItem]);

 const lineItemsTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

 const handleSubmit = async () => {
 setError(null);
 if (!name.trim()) return setError('Campaign name is required');
 const budget = parseFloat(budgetUsd) || 0;
 const spent = parseFloat(spentUsd) || 0;
 if (budget < 0 || spent < 0) return setError('Budget / spent cannot be negative');

 const metadataDict = {};
 for (const { key, value } of metadata) { const tk = key.trim(); if (tk) metadataDict[tk] = value; }
 const cleanLineItems = lineItems
 .filter((li) => (li.label || '').trim() || (Number(li.amount) || 0) > 0)
 .map((li) => ({ label: (li.label || '').trim(), amount: Number(li.amount) || 0, date: li.date || null, note: (li.note || '').trim() || null }));

 const payload = {
 name: name.trim(), description: description.trim() || null, platform,
 budget_usd: budget, spent_usd: spent,
 start_date: startDate || null, end_date: endDate || null,
 status, line_items: cleanLineItems, metadata: metadataDict,
 };
 setSaving(true);
 try { await onSave(payload); }
 catch (err) { setError(err.response?.data?.detail || 'Failed to save'); }
 finally { setSaving(false); }
 };

 return (
 <SidePanel
 isOpen={isOpen} onClose={onClose}
 title={isEdit ? 'Edit Campaign' : 'New Campaign'}
 subtitle={isEdit ? `#${editingItem?.id}` : 'Track budget + custom fields'}
 Icon={SparklesIcon} width="lg"
 footer={
 <div className="flex gap-2">
 <GhostButton onClick={onClose} disabled={saving} className="flex-1">Cancel</GhostButton>
 <GoldButton onClick={handleSubmit} disabled={saving || !name.trim()} className="flex-1">
 {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
 </GoldButton>
 </div>
 }
 >
 <div className="space-y-4">
 <Field label="Campaign Name" required>
 <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Twitter Promo Q2 2026" maxLength={200}
 className="w-full rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
 </Field>

 <Field label="Description" hint="(optional)">
 <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Goal, target audience, or strategy summary…"
 className="w-full resize-none rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
 </Field>

 <Field label="Platform">
 <div className="flex flex-wrap gap-1.5">
 {PLATFORMS.map((p) => (
 <PickOption key={p.value} value={p.value} currentValue={platform} onClick={() => setPlatform(p.value)} label={p.label} color={p.color} Icon={p.Icon} />
 ))}
 </div>
 </Field>

 <Field label="Status">
 <div className="flex flex-wrap gap-1.5">
 {STATUSES.map((s) => (
 <PickOption key={s.value} value={s.value} currentValue={status} onClick={() => setStatus(s.value)} label={s.label} color={s.color} />
 ))}
 </div>
 </Field>

 <div className="grid grid-cols-2 gap-2.5">
 <Field label="Budget (USD)">
 <input type="number" step="0.01" min="0" value={budgetUsd} onChange={(e) => setBudgetUsd(e.target.value)} placeholder="0.00"
 className="w-full rounded-lg px-3 py-2 text-xs tabular-nums text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
 </Field>
 <Field label="Spent (USD)">
 <input type="number" step="0.01" min="0" value={spentUsd} onChange={(e) => setSpentUsd(e.target.value)} placeholder="0.00"
 className="w-full rounded-lg px-3 py-2 text-xs tabular-nums text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)' }} />
 {lineItemsTotal > 0 && lineItemsTotal !== parseFloat(spentUsd) && (
 <button type="button" onClick={() => setSpentUsd(String(lineItemsTotal))} className="mt-1 text-[10px] hover:underline" style={{ color: 'rgb(var(--accent))' }}>
 Sync from line items: ${lineItemsTotal.toFixed(2)}
 </button>
 )}
 </Field>
 </div>

 <div className="grid grid-cols-2 gap-2.5">
 <Field label="Start Date" hint="(optional)">
 <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
 className="w-full rounded-lg px-3 py-2 font-mono text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)', colorScheme: 'dark' }} />
 </Field>
 <Field label="End Date" hint="(optional)">
 <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
 className="w-full rounded-lg px-3 py-2 font-mono text-xs text-text-primary focus:outline-none" style={{ background: 'rgb(var(--scrim) / 0.3)', border: '1px solid rgb(var(--ink) / 0.1)', colorScheme: 'dark' }} />
 </Field>
 </div>

 {/* Line Items */}
 <div>
 <div className="mb-2 flex items-center justify-between">
 <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--ink) / 0.4)' }}>
 Line Items <span className="ml-1 lowercase tracking-normal" style={{ color: 'rgb(var(--fg-muted))' }}>({lineItems.length})</span>
 </label>
 <button type="button" onClick={() => setLineItems([...lineItems, { label: '', amount: 0, date: '', note: '' }])}
 className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--line) / 0.22)' }}>
 <PlusIcon size={10} /> Add Item
 </button>
 </div>
 {lineItems.length === 0 ? (
 <div className="rounded-lg py-4 text-center text-[10px]" style={{ background: 'rgb(var(--ink) / 0.015)', border: '1px dashed rgb(var(--ink) / 0.06)', color: 'rgb(var(--fg-muted))' }}>
 No line items yet. Click "Add Item" to track a spending breakdown.
 </div>
 ) : (
 <div className="space-y-1.5">
 {lineItems.map((item, i) => (
 <LineItemRow key={i} item={item} onChange={(u) => { const n = [...lineItems]; n[i] = u; setLineItems(n); }} onDelete={() => setLineItems(lineItems.filter((_, idx) => idx !== i))} />
 ))}
 <p className="text-right text-[10px] tabular-nums" style={{ color: 'rgb(var(--fg-muted))' }}>Line items total: ${lineItemsTotal.toFixed(2)}</p>
 </div>
 )}
 </div>

 {/* Custom Metadata */}
 <div>
 <div className="mb-2 flex items-center justify-between">
 <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--ink) / 0.4)' }}>
 Custom Fields <span className="ml-1 lowercase tracking-normal" style={{ color: 'rgb(var(--fg-muted))' }}>({metadata.length})</span>
 </label>
 <button type="button" onClick={() => setMetadata([...metadata, { key: '', value: '' }])}
 className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--line) / 0.22)' }}>
 <PlusIcon size={10} /> Add Field
 </button>
 </div>
 {metadata.length === 0 ? (
 <div className="rounded-lg py-4 text-center text-[10px]" style={{ background: 'rgb(var(--ink) / 0.015)', border: '1px dashed rgb(var(--ink) / 0.06)', color: 'rgb(var(--fg-muted))' }}>
 Custom fields: add any KPI/metric (impressions, conversions, ROI, tags, etc.).
 </div>
 ) : (
 <div className="space-y-1.5">
 {metadata.map((m, i) => (
 <MetadataRow key={i} k={m.key} v={m.value} onChange={(nk, nv) => { const n = [...metadata]; n[i] = { key: nk, value: nv }; setMetadata(n); }} onDelete={() => setMetadata(metadata.filter((_, idx) => idx !== i))} />
 ))}
 </div>
 )}
 </div>

 {error && (
 <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(248,113,113,0.08)', color: 'rgb(var(--neg))', border: '1px solid rgba(248,113,113,0.25)' }}>
 <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />{error}
 </div>
 )}

 {isEdit && editingItem && (
 <div className="rounded-md px-3 py-2 text-[10px]" style={{ background: 'rgb(var(--ink) / 0.02)', border: '1px solid rgb(var(--ink) / 0.04)', color: 'rgb(var(--fg-muted))' }}>
 <p>Created {new Date(editingItem.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
 {editingItem.creator && <> by @{editingItem.creator.username}</>}</p>
 </div>
 )}
 </div>
 </SidePanel>
 );
};
