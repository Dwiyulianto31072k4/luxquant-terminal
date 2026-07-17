// src/components/admin/users/GrantModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell <Modal> + GoldButton/GhostButton.
// designSystem.js (palette/surface/tint/elevation/motion) replaced with
// literal gold values. Icons.jsx & Avatar (primitives) still used.
// Logic (quick/custom mode, preview, grant) intact.
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import {
  ClockIcon,
  StarIcon,
  SparklesIcon,
  AlertTriangleIcon,
  CalendarIcon,
  ArrowRightIcon,
  CrownIcon,
} from "../Icons";
import { Avatar } from "../primitives";
import Modal from "../../ui/Modal";
import { GoldButton, GhostButton } from "../../autotrade/AutoTradeUI";

const GOLD = "rgb(var(--accent))";
const todayISO = () => new Date().toISOString().split("T")[0];
const fmt = (date) =>
  date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

// ── Mode toggle ──
const ModeTab = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className="flex-1 rounded py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors"
    style={{
      background: active ? "rgb(var(--accent) / 0.18)" : "transparent",
      color: active ? GOLD : "rgb(var(--fg-muted))",
      border: `1px solid ${active ? "rgb(var(--accent) / 0.3)" : "transparent"}`,
    }}
  >
    {children}
  </button>
);

// ── Duration option ──
const DurationOption = ({ Icon, label, desc, selected, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-1.5 rounded-lg p-3 transition-colors"
    style={{
      background: selected ? "rgb(var(--accent) / 0.1)" : "rgb(var(--ink) / 0.02)",
      border: `1px solid ${selected ? "rgb(var(--accent) / 0.45)" : "rgb(var(--ink) / 0.06)"}`,
    }}
  >
    <Icon size={16} style={{ color: selected ? GOLD : "rgb(var(--fg-muted))" }} />
    <span
      className="text-[11px] font-bold tracking-tight"
      style={{ color: selected ? GOLD : "rgb(var(--fg))" }}
    >
      {label}
    </span>
    <span className="text-[9px] text-text-muted">{desc}</span>
  </button>
);

// ── Date input ──
const DateInput = ({ label, required, value, onChange, min, helper }) => (
  <div>
    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-primary/45">
      {label}
      {required && <span style={{ color: GOLD }}> *</span>}
    </label>
    <div className="relative">
      <CalendarIcon
        size={12}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: "rgb(var(--fg-muted))" }}
      />
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg py-2 pl-8 pr-3 font-mono text-xs text-text-primary outline-none focus:border-ink/15"
        style={{
          background: "rgb(var(--surface-secondary))",
          border: `1px solid ${required ? "rgb(var(--accent) / 0.2)" : "rgb(var(--ink) / 0.06)"}`,
          colorScheme: "dark",
        }}
      />
    </div>
    {helper && <p className="mt-1 text-[10px] text-text-muted/70">{helper}</p>}
  </div>
);

// ── Preview card ──
const PreviewCard = ({ start, end, days }) => (
  <div
    className="relative overflow-hidden rounded-lg"
    style={{ background: "rgb(var(--accent) / 0.04)", border: "1px solid rgb(var(--line) / 0.22)" }}
  >
    <span
      className="pointer-events-none absolute inset-x-0 top-0 h-px"
      style={{
        background: "linear-gradient(to right, transparent, rgb(var(--accent) / 0.4), transparent)",
      }}
    />
    <div
      className="flex items-center justify-between px-3 py-1.5"
      style={{ background: "rgb(var(--accent) / 0.06)" }}
    >
      <span
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: GOLD }}
      >
        <SparklesIcon size={11} /> Preview
      </span>
      <span
        className="rounded px-2 py-0.5 text-[10px] font-bold tabular-nums"
        style={{ background: "rgb(var(--accent) / 0.18)", color: GOLD }}
      >
        {days === "∞" ? "∞ Lifetime" : `${days} days`}
      </span>
    </div>
    <div className="flex items-center justify-between px-3 py-2.5 text-[11px]">
      <div className="text-left">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
          Starts
        </p>
        <p className="font-medium tabular-nums text-text-primary">{start || "Today"}</p>
      </div>
      <ArrowRightIcon size={12} style={{ color: "rgb(var(--fg-muted))" }} />
      <div className="text-right">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
          Ends
        </p>
        <p className="font-medium tabular-nums text-text-primary">{end}</p>
      </div>
    </div>
  </div>
);

export const GrantModal = ({ user, onClose, onGrant }) => {
  const [mode, setMode] = useState("quick");
  const [duration, setDuration] = useState("1_month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const preview = (() => {
    if (mode === "quick") {
      if (duration === "lifetime") return { start: null, end: "No expiry", days: "∞" };
      const start = startDate ? new Date(startDate) : new Date();
      const days = duration === "1_month" ? 30 : 365;
      const end = new Date(start.getTime() + days * 86400000);
      return { start: startDate ? fmt(start) : "Today", end: fmt(end), days };
    }
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / 86400000);
    if (days <= 0) return null;
    return { start: fmt(start), end: fmt(end), days };
  })();

  const handleGrant = async () => {
    setError(null);
    if (mode === "custom") {
      if (!startDate) return setError("Start date is required for Custom mode");
      if (!endDate) return setError("End date is required for Custom mode");
      if (new Date(endDate) <= new Date(startDate))
        return setError("End date must be after start date");
    }
    setLoading(true);
    try {
      if (mode === "custom") await onGrant(user.id, "custom", note || null, startDate, endDate);
      else await onGrant(user.id, duration, note || null, startDate || null, null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to grant");
    } finally {
      setLoading(false);
    }
  };

  const durations = [
    { value: "1_month", label: "1 Month", desc: "30 days", Icon: ClockIcon },
    { value: "1_year", label: "1 Year", desc: "365 days", Icon: StarIcon },
    { value: "lifetime", label: "Lifetime", desc: "No expiry", Icon: SparklesIcon },
  ];

  const header = (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0">
        <div
          className="absolute inset-0 rounded-full opacity-40 blur-md"
          style={{ background: GOLD }}
        />
        <div
          className="relative flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            background: "rgb(var(--accent) / 0.12)",
            border: "1px solid rgb(var(--line) / 0.3)",
          }}
        >
          <CrownIcon size={18} style={{ color: GOLD }} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold tracking-tight text-text-primary">Grant Subscription</h3>
        <div className="mt-0.5 flex items-center gap-2">
          <Avatar name={user.username} size="xs" />
          <span className="text-[11px] text-text-muted">
            <span className="font-medium text-text-primary">{user.username}</span>
            {user.role === "subscriber" && user.subscription_expires_at && (
              <span className="ml-1.5 text-[10px] text-amber-400">· extends existing</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="flex gap-2">
      <GhostButton onClick={onClose} disabled={loading} className="flex-1">
        Cancel
      </GhostButton>
      <GoldButton
        onClick={handleGrant}
        disabled={loading || (mode === "custom" && (!startDate || !endDate))}
        className="flex-1"
      >
        {loading ? "Processing…" : "Grant Access"}
      </GoldButton>
    </div>
  );

  return (
    <Modal isOpen={true} onClose={onClose} size="sm" padded={false} header={header} footer={footer}>
      <div className="space-y-4 px-5 py-5">
        {/* Mode toggle */}
        <div
          className="flex rounded-lg p-0.5"
          style={{
            background: "rgb(var(--surface-secondary))",
            border: "1px solid rgb(var(--ink) / 0.06)",
          }}
        >
          <ModeTab
            active={mode === "quick"}
            onClick={() => {
              setMode("quick");
              setError(null);
            }}
          >
            Quick Preset
          </ModeTab>
          <ModeTab
            active={mode === "custom"}
            onClick={() => {
              setMode("custom");
              setError(null);
            }}
          >
            Custom Range
          </ModeTab>
        </div>

        {mode === "quick" && (
          <>
            <DateInput
              label="Start date"
              value={startDate}
              onChange={setStartDate}
              helper={!startDate ? "Leave empty to start today" : undefined}
            />
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-primary/45">
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

        {mode === "custom" && (
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

        {preview && <PreviewCard {...preview} />}

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-primary/45">
            Note <span className="lowercase tracking-normal text-text-muted">(optional)</span>
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Payment via BCA, promo code XYZ"
            className="w-full rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-ink/15"
            style={{
              background: "rgb(var(--surface-secondary))",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          />
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              background: "rgba(248,113,113,0.08)",
              color: "rgb(var(--neg-text))",
              border: "1px solid rgba(248,113,113,0.25)",
            }}
          >
            <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
