// src/components/autotrade/AutoTradeUI.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade shared UI primitives
// Binance monochrome desk (works luxquant / dark / bright):
// • solid cards, no washed gold hairlines
// • mono labels, medium-weight tabular numbers
// • CTA = solid #F0B90B + dark ink text (accent / accent-fg)
// • green/red only for PnL & risk semantics
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
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
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
// SectionHeader — monochrome desk label
// ────────────────────────────────────────────────────────────────
export function SectionHeader({ label, hint, right }) {
  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      {hint ? (
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
          {hint}
        </span>
      ) : null}
      {right}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Card — flat surface, no gold wash hairline
// ────────────────────────────────────────────────────────────────
export function Card({ children, className = "", hover = false, padded = true }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised ${
        padded ? "p-4 lg:p-5" : ""
      } ${
        hover ? "transition-all duration-200 hover:border-ink/15 hover:-translate-y-0.5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// StatCard — label · big tabular value · sub
// ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, valueColor = "text-text-primary", accent = false }) {
  return (
    <div
      className={`rounded-lg border bg-surface-raised p-4 transition-all duration-200 hover:-translate-y-0.5 lg:p-5 ${
        accent ? "border-ink/12 hover:border-ink/18" : "border-ink/[0.08] hover:border-ink/14"
      }`}
    >
      <p className="mb-2 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <p
        className={`font-mono text-2xl font-semibold tabular-nums leading-none tracking-tight lg:text-[28px] ${valueColor}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-2 truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
export const ACCENT = "#F0B90B"; // Binance yellow CTA only

const DOT_HEX = {
  good: UP,
  warn: ACCENT,
  bad: DOWN,
  info: "#5B8DEF",
  neutral: "#848E9C",
};

const DOT_TEXT = {
  good: "text-profit",
  warn: "text-accent",
  bad: "text-negative",
  info: "text-[#5B8DEF]",
  neutral: "text-text-muted",
};

// StatusDot — colored dot + plain label, no background. Binance status line.
export function StatusDot({ tone = "neutral", children, pulse = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: DOT_HEX[tone] || DOT_HEX.neutral }}
      />
      <span className={DOT_TEXT[tone] || DOT_TEXT.neutral}>{children}</span>
    </span>
  );
}

// StatusBadge — small squared tag. Subtle tinted background, medium label.
const TAG_TONES = {
  good: "bg-[#0ECB81]/12 text-profit",
  warn: "bg-accent/12 text-accent",
  bad: "bg-[#F6465D]/12 text-negative",
  info: "bg-[#5B8DEF]/12 text-[#5B8DEF]",
  neutral: "bg-ink/[0.06] text-text-secondary",
};

export function StatusBadge({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
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
      className={`flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
        checked
          ? "border-accent/30 bg-accent/[0.06]"
          : "border-ink/[0.08] bg-surface-secondary hover:border-ink/14"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-text-muted">{hint}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-ink/[0.16]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────
// Buttons — solid Binance yellow CTA (not washed gradient)
// ────────────────────────────────────────────────────────────────
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
      className={`rounded-lg bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
      "border-ink/[0.1] bg-surface-secondary text-text-secondary hover:border-ink/18 hover:text-text-primary",
    gold: "border-accent/35 bg-accent/[0.08] text-accent hover:bg-accent/15",
    danger: "border-[#F6465D]/30 bg-[#F6465D]/[0.06] text-negative hover:bg-[#F6465D]/12",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
      <label className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

const INPUT_CLASS =
  "w-full rounded-lg border border-ink/[0.1] bg-surface-secondary px-3.5 py-2.5 text-sm font-medium text-text-primary transition-colors placeholder:text-text-muted/45 focus:outline-none focus:border-ink/25 focus:ring-2 focus:ring-ink/[0.06]";

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={INPUT_CLASS}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-surface-raised">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix, placeholder }) {
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
        className={`${INPUT_CLASS} font-mono tabular-nums ${suffix ? "pr-12" : ""}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
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
      className={INPUT_CLASS}
    />
  );
}

// ────────────────────────────────────────────────────────────────
// Segmented control — choose one from a small set (e.g. TP/SL level)
// ────────────────────────────────────────────────────────────────
export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-lg border border-ink/[0.08] bg-surface-secondary p-1">
      {options.map((option) => {
        const active = String(value) === String(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
              active
                ? "bg-accent text-accent-fg shadow-sm"
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
      className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-accent/40 bg-accent text-accent-fg"
          : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
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
    error: "border-[#F6465D]/30 bg-[#F6465D]/[0.08] text-negative",
    success: "border-[#0ECB81]/30 bg-[#0ECB81]/[0.08] text-profit",
    warn: "border-accent/30 bg-accent/[0.08] text-accent",
    info: "border-ink/[0.1] bg-surface-secondary text-text-secondary",
  };
  return (
    <div
      className={`rounded-lg border p-3 text-sm font-medium leading-relaxed ${tones[tone] || tones.info}`}
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
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/[0.1] bg-surface-secondary text-2xl text-text-secondary">
            {icon}
          </div>
        ) : null}
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        {hint ? <p className="max-w-sm text-xs text-text-muted">{hint}</p> : null}
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {label}
        </p>
      </div>
    </Card>
  );
}

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
      className={`rounded-lg bg-[#F6465D] px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
