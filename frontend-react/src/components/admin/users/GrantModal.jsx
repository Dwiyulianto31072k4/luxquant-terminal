// src/components/admin/users/GrantModal.jsx
//
// Subscription grant modal. Two modes:
//   • Quick preset — 1 month / 1 year / lifetime
//   • Custom range — pick start + end date
//
// Live preview card shows the computed start, end, and duration.
//

import { useState } from 'react';
import { palette, surface, tint, elevation, radius, motion } from '../designSystem';
import {
  CloseIcon,
  ClockIcon,
  StarIcon,
  SparklesIcon,
  AlertTriangleIcon,
  CalendarIcon,
  ArrowRightIcon,
  CrownIcon,
} from '../Icons';
import { Avatar } from '../primitives';

const todayISO = () => new Date().toISOString().split('T')[0];

const fmt = (date) =>
  date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// ════════════════════════════════════════════════════════════════════
// Mode toggle
// ════════════════════════════════════════════════════════════════════

const ModeTab = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className="flex-1 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider"
    style={{
      background: active ? tint(palette.gold[300], 0.18) : 'transparent',
      color: active ? palette.gold[300] : '#6b5c52',
      border: `1px solid ${active ? tint(palette.gold[300], 0.3) : 'transparent'}`,
      transition: motion.base,
    }}
  >
    {children}
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Duration option card
// ════════════════════════════════════════════════════════════════════

const DurationOption = ({ Icon, label, desc, selected, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg"
    style={{
      background: selected ? tint(palette.gold[300], 0.1) : 'rgba(255,255,255,0.02)',
      border: `1px solid ${selected ? tint(palette.gold[300], 0.45) : surface.base.border}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (!selected) {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.borderColor = tint(palette.gold[300], 0.25);
      }
    }}
    onMouseLeave={(e) => {
      if (!selected) {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.borderColor = surface.base.border;
      }
    }}
  >
    <Icon size={16} style={{ color: selected ? palette.gold[300] : '#6b5c52' }} />
    <span
      className="text-[11px] font-bold tracking-tight"
      style={{ color: selected ? palette.gold[300] : '#fff' }}
    >
      {label}
    </span>
    <span className="text-[9px]" style={{ color: '#6b5c52' }}>
      {desc}
    </span>
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Date input
// ════════════════════════════════════════════════════════════════════

const DateInput = ({ label, required, value, onChange, min, helper }) => (
  <div>
    <label
      className="block text-[10px] uppercase tracking-wider font-bold mb-1.5"
      style={{ color: 'rgba(255,255,255,0.45)' }}
    >
      {label}
      {required && <span style={{ color: palette.gold[300] }}> *</span>}
    </label>
    <div className="relative">
      <CalendarIcon
        size={12}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: '#6b5c52' }}
      />
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white focus:outline-none font-mono"
        style={{
          background: surface.sunken.bg,
          border: `1px solid ${required ? tint(palette.gold[300], 0.2) : surface.base.border}`,
          colorScheme: 'dark',
        }}
      />
    </div>
    {helper && (
      <p className="text-[10px] mt-1" style={{ color: '#4a3f39' }}>
        {helper}
      </p>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Preview card
// ════════════════════════════════════════════════════════════════════

const PreviewCard = ({ start, end, days }) => (
  <div
    className="rounded-lg overflow-hidden relative"
    style={{
      background: tint(palette.gold[300], 0.04),
      border: `1px solid ${tint(palette.gold[300], 0.22)}`,
    }}
  >
    <div
      className="absolute inset-x-0 top-0 h-px pointer-events-none"
      style={{
        background: `linear-gradient(to right, transparent, ${tint(palette.gold[300], 0.4)}, transparent)`,
      }}
    />
    <div
      className="px-3 py-1.5 flex items-center justify-between"
      style={{ background: tint(palette.gold[300], 0.06) }}
    >
      <span
        className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5"
        style={{ color: palette.gold[300] }}
      >
        <SparklesIcon size={11} />
        Preview
      </span>
      <span
        className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded"
        style={{
          background: tint(palette.gold[300], 0.18),
          color: palette.gold[300],
        }}
      >
        {days === '∞' ? '∞ Lifetime' : `${days} days`}
      </span>
    </div>
    <div className="px-3 py-2.5 flex items-center justify-between text-[11px]">
      <div className="text-left">
        <p className="text-[9px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: '#6b5c52' }}>
          Starts
        </p>
        <p className="text-white tabular-nums font-medium">{start || 'Today'}</p>
      </div>
      <ArrowRightIcon size={12} style={{ color: '#6b5c52' }} />
      <div className="text-right">
        <p className="text-[9px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: '#6b5c52' }}>
          Ends
        </p>
        <p className="text-white tabular-nums font-medium">{end}</p>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main modal
// ════════════════════════════════════════════════════════════════════

export const GrantModal = ({ user, onClose, onGrant }) => {
  const [mode, setMode] = useState('quick');
  const [duration, setDuration] = useState('1_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Compute preview ──
  const preview = (() => {
    if (mode === 'quick') {
      if (duration === 'lifetime') return { start: null, end: 'No expiry', days: '∞' };
      const start = startDate ? new Date(startDate) : new Date();
      const days = duration === '1_month' ? 30 : 365;
      const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      return { start: startDate ? fmt(start) : 'Today', end: fmt(end), days };
    }
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (days <= 0) return null;
    return { start: fmt(start), end: fmt(end), days };
  })();

  // ── Submit ──
  const handleGrant = async () => {
    setError(null);

    if (mode === 'custom') {
      if (!startDate) return setError('Start date is required for Custom mode');
      if (!endDate) return setError('End date is required for Custom mode');
      if (new Date(endDate) <= new Date(startDate))
        return setError('End date must be after start date');
    }

    setLoading(true);
    try {
      if (mode === 'custom') {
        await onGrant(user.id, 'custom', note || null, startDate, endDate);
      } else {
        await onGrant(user.id, duration, note || null, startDate || null, null);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to grant');
    } finally {
      setLoading(false);
    }
  };

  const durations = [
    { value: '1_month', label: '1 Month', desc: '30 days', Icon: ClockIcon },
    { value: '1_year', label: '1 Year', desc: '365 days', Icon: StarIcon },
    { value: 'lifetime', label: 'Lifetime', desc: 'No expiry', Icon: SparklesIcon },
  ];

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ background: surface.glass.bgOverlay, backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden relative"
        style={{
          background: surface.glass.bg,
          border: `1px solid ${tint(palette.gold[300], 0.25)}`,
          boxShadow: elevation.modal,
        }}
      >
        {/* Top hairline */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, ${tint(palette.gold[300], 0.5)}, transparent)`,
          }}
        />

        {/* Header */}
        <div
          className="flex items-start gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${surface.base.border}` }}
        >
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-full blur-md opacity-40"
              style={{ background: palette.gold[300] }}
            />
            <div
              className="relative w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: tint(palette.gold[300], 0.12),
                border: `1px solid ${tint(palette.gold[300], 0.3)}`,
              }}
            >
              <CrownIcon size={18} style={{ color: palette.gold[300] }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white tracking-tight">Grant Subscription</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Avatar name={user.username} size="xs" />
              <span className="text-[11px]" style={{ color: '#8a7a6e' }}>
                <span className="text-white font-medium">{user.username}</span>
                {user.role === 'subscriber' && user.subscription_expires_at && (
                  <span className="ml-1.5 text-[10px]" style={{ color: palette.orange[400] }}>
                    · extends existing
                  </span>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ color: '#8a7a6e' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto">
          {/* Mode toggle */}
          <div
            className="flex rounded-lg p-0.5"
            style={{
              background: surface.sunken.bg,
              border: `1px solid ${surface.base.border}`,
            }}
          >
            <ModeTab active={mode === 'quick'} onClick={() => { setMode('quick'); setError(null); }}>
              Quick Preset
            </ModeTab>
            <ModeTab active={mode === 'custom'} onClick={() => { setMode('custom'); setError(null); }}>
              Custom Range
            </ModeTab>
          </div>

          {/* Quick mode */}
          {mode === 'quick' && (
            <>
              <DateInput
                label="Start date"
                value={startDate}
                onChange={setStartDate}
                helper={!startDate ? 'Leave empty to start today' : undefined}
              />
              <div>
                <label
                  className="block text-[10px] uppercase tracking-wider font-bold mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {durations.map((opt) => (
                    <DurationOption
                      key={opt.value}
                      {...opt}
                      selected={duration === opt.value}
                      onClick={() => setDuration(opt.value)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Custom mode */}
          {mode === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <DateInput label="Start date" required value={startDate} onChange={setStartDate} />
              <DateInput
                label="End date"
                required
                value={endDate}
                onChange={setEndDate}
                min={startDate || todayISO()}
              />
            </div>
          )}

          {/* Preview */}
          {preview && <PreviewCard {...preview} />}

          {/* Note */}
          <div>
            <label
              className="block text-[10px] uppercase tracking-wider font-bold mb-1.5"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Note <span className="text-zinc-600 lowercase tracking-normal">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Payment via BCA, promo code XYZ"
              className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
              style={{
                background: surface.sunken.bg,
                border: `1px solid ${surface.base.border}`,
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg flex items-start gap-2"
              style={{
                background: tint(palette.red[400], 0.08),
                color: palette.red[400],
                border: `1px solid ${tint(palette.red[400], 0.25)}`,
              }}
            >
              <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 px-5 py-3"
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderTop: `1px solid ${surface.base.border}`,
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
            style={{ color: '#8a7a6e', border: `1px solid ${surface.base.border}` }}
          >
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={loading || (mode === 'custom' && (!startDate || !endDate))}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${palette.gold[300]}, ${palette.gold[500]})`,
              color: palette.maroon[900],
            }}
          >
            {loading ? 'Processing...' : 'Grant Access'}
          </button>
        </div>
      </div>
    </div>
  );
};
