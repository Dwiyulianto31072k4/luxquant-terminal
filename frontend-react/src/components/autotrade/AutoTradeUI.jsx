// src/components/autotrade/AutoTradeUI.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade shared UI primitives
// One source of truth so every AutoTrade panel matches the rest of
// the terminal (SignalsPage / SignalsTable design language):
//   • #0a0805 cards with a gold hairline accent
//   • mono / tabular-nums numerics, uppercase tracked labels
//   • gold gradient primary action, ghost secondary
// ════════════════════════════════════════════════════════════════

import { useState } from "react";

// ────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────
export function fmtUsd(value, { compact = false } = {}) {
  const amount = Number(value || 0);
  if (compact && Math.abs(amount) >= 1000) {
    if (Math.abs(amount) >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
    if (Math.abs(amount) >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
    return `$${(amount / 1e3).toFixed(1)}K`;
  }
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function fmtNum(value, digits = 4) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(value, { sign = true } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "—";
  const n = Number(value);
  const s = sign && n > 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ────────────────────────────────────────────────────────────────
// SectionHeader — the canonical "— LABEL ————" divider
// ────────────────────────────────────────────────────────────────
export function SectionHeader({ label, hint, right }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-gold-primary/40" />
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 whitespace-nowrap">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
      {hint ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted whitespace-nowrap">
          {hint}
        </span>
      ) : null}
      {right}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Card — base surface with gold hairline. `hover` adds lift.
// ────────────────────────────────────────────────────────────────
export function Card({ children, className = "", hover = false, padded = true }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805] ${
        padded ? "p-4 lg:p-5" : ""
      } ${
        hover
          ? "transition-all duration-200 hover:border-gold-primary/25 hover:-translate-y-0.5"
          : ""
      } ${className}`}
    >
      <span className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// StatCard — label · hairline · big tabular value · sub
// ────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  valueColor = "text-text-primary",
  accent = false,
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border bg-[#0a0805] p-4 lg:p-5 transition-all duration-200 hover:-translate-y-0.5 ${
        accent
          ? "border-gold-primary/25 hover:border-gold-primary/40"
          : "border-white/[0.06] hover:border-gold-primary/20"
      }`}
    >
      <span className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-2 truncate">
        {label}
      </p>
      <div className="h-px bg-white/[0.06] mb-3" />
      <p
        className={`font-mono text-2xl lg:text-3xl font-light tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-2 truncate">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Binance-grade up/down colors (used for PnL, side, status)
// ────────────────────────────────────────────────────────────────
export const UP = "#0ECB81";
export const DOWN = "#F6465D";

const DOT_HEX = {
  good: UP,
  warn: "#d4a853",
  bad: DOWN,
  info: "#5B8DEF",
  neutral: "#848E9C",
};

const DOT_TEXT = {
  good: "text-[#0ECB81]",
  warn: "text-gold-primary",
  bad: "text-[#F6465D]",
  info: "text-[#5B8DEF]",
  neutral: "text-text-muted",
};

// StatusDot — colored dot + plain label, no background. Binance status line.
export function StatusDot({ tone = "neutral", children, pulse = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: DOT_HEX[tone] || DOT_HEX.neutral }}
      />
      <span className={DOT_TEXT[tone] || DOT_TEXT.neutral}>{children}</span>
    </span>
  );
}

// StatusBadge — small squared tag (restrained, Binance-style). No pill, no
// uppercase tracking. Subtle tinted background, normal-case medium label.
const TAG_TONES = {
  good: "bg-[#0ECB81]/10 text-[#0ECB81]",
  warn: "bg-gold-primary/10 text-gold-primary",
  bad: "bg-[#F6465D]/10 text-[#F6465D]",
  info: "bg-[#5B8DEF]/12 text-[#5B8DEF]",
  neutral: "bg-white/[0.05] text-text-secondary",
};

export function StatusBadge({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium leading-none ${
        TAG_TONES[tone] || TAG_TONES.neutral
      }`}
    >
      {children}
    </span>
  );
}

// Alias for semantic clarity at call sites (Long/Short, leverage, etc.)
export const Tag = StatusBadge;

// ────────────────────────────────────────────────────────────────
// Toggle — smooth switch, label + hint on the left
// ────────────────────────────────────────────────────────────────
export function Toggle({ label, hint, checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-md border px-4 py-3 text-left transition-colors ${
        checked
          ? "border-gold-primary/20 bg-gold-primary/[0.04]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
        ) : null}
      </span>
      <span
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-gold-primary" : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Buttons
// ────────────────────────────────────────────────────────────────
const GOLD_GRADIENT =
  "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)";

export function GoldButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ background: GOLD_GRADIENT }}
      className={`rounded-md px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  tone = "neutral",
  className = "",
}) {
  const tones = {
    neutral:
      "border-white/[0.08] text-text-muted hover:text-text-primary hover:border-white/[0.16]",
    gold: "border-gold-primary/25 text-gold-primary hover:bg-gold-primary/[0.08]",
    danger: "border-red-500/25 text-red-400 hover:bg-red-500/[0.08]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tones[tone] || tones.neutral
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Form fields
// ────────────────────────────────────────────────────────────────
export function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-muted/70">{hint}</p> : null}
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-text-primary transition-colors focus:outline-none focus:border-gold-primary/40";

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={INPUT_CLASS}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#0a0805]">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  placeholder,
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} font-mono tabular-nums ${
          suffix ? "pr-12" : ""
        }`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${INPUT_CLASS} placeholder:text-text-muted/30`}
    />
  );
}

// ────────────────────────────────────────────────────────────────
// Segmented control — choose one from a small set (e.g. TP/SL level)
// ────────────────────────────────────────────────────────────────
export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] p-1">
      {options.map((option) => {
        const active = String(value) === String(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded px-3 py-1.5 font-mono text-xs tabular-nums transition-colors ${
              active
                ? "bg-gold-primary/15 text-gold-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Pill toggle group (e.g. allowed risk levels)
// ────────────────────────────────────────────────────────────────
export function PillToggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
        active
          ? "border-gold-primary/30 bg-gold-primary/10 text-gold-primary"
          : "border-white/[0.08] bg-white/[0.02] text-text-muted hover:border-white/[0.16] hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Notices — inline feedback (error / success / warn / info)
// ────────────────────────────────────────────────────────────────
export function Notice({ tone = "info", children }) {
  const tones = {
    error: "border-red-500/25 bg-red-500/[0.05] text-red-400",
    success: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-400",
    warn: "border-gold-primary/20 bg-gold-primary/[0.04] text-gold-primary/90",
    info: "border-white/[0.08] bg-white/[0.02] text-text-muted",
  };
  return (
    <div
      className={`rounded-md border p-3 text-sm ${tones[tone] || tones.info}`}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// EmptyState — centered icon + title + hint (+ optional action)
// ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, hint, action }) {
  return (
    <Card className="text-center" padded>
      <div className="flex flex-col items-center gap-3 py-6">
        {icon ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-2xl">
            {icon}
          </div>
        ) : null}
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {hint ? (
          <p className="max-w-sm text-xs text-text-muted">{hint}</p>
        ) : null}
        {action}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────
// Spinner — centered loading state
// ────────────────────────────────────────────────────────────────
export function Spinner({ label = "Loading…" }) {
  return (
    <Card className="text-center" padded>
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-primary/20 border-t-gold-primary" />
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-text-muted">
          {label}
        </p>
      </div>
    </Card>
  );
}


const RED_GRADIENT =
  "linear-gradient(135deg, #ff5c6c 0%, #f6465d 50%, #d9344a 100%)";

export function DangerButton({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ background: RED_GRADIENT }}
      className={`rounded-md px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-text-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
