// ════════════════════════════════════════════════════════════════
// Terminal viz — shared atoms, palette & helpers.
// Used by SignalsAnalytics + DerivTabs. Timeless desk structure.
// ════════════════════════════════════════════════════════════════
import { useState, useContext, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import CoinLogo from "../CoinLogo";
import { SignalStatusContext, STATUS_META, timeAgo } from "../../context/SignalStatusContext";

export const API_BASE = import.meta.env.VITE_API_URL || "";

export const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── chart palette — CSS semantic tokens (follow data-theme luxquant|dark|bright)
// Channel form in index.css: --accent: 212 168 83 → rgb(var(--accent))
// Recharts/SVG accept these strings; Tailwind classes stay for layout (bg-surface…).
// Binance desk palette: yellow accent only for interactive CTAs;
// green/red reserved for PnL & status semantics. Charts keep distinct series hues.
export const GOLD = "rgb(var(--accent))";
export const POS = "rgb(var(--pos))";
export const NEG = "rgb(var(--neg))";
export const CYAN = "rgb(56 189 248)"; // chart series only
export const PURPLE = "rgb(167 139 250)"; // chart series only
export const ORANGE = "rgb(var(--neg))"; // alias warn → loss urgency (no decorative orange)
export const GRAYBAR = "rgb(var(--fg) / 0.18)";
export const GRID = "rgb(var(--ink) / 0.06)";
export const AXIS = "rgb(var(--fg-muted))";
export const MUTED = "rgb(var(--fg-muted))";

// ── Heatmap / treemap colour (Binance-style, solid RGB — no alpha wash) ──
// Alpha-on-dark = pastel pink/mint. Always mix solid stops instead.
// Stops: red #F6465D · mid slate · green #0ECB81
const HEAT_R = [246, 70, 93];
const HEAT_M = [32, 38, 48]; // deep slate (not brown / washed rose)
const HEAT_G = [14, 203, 129];
const _lerp = (a, b, t) => a + (b - a) * t;
const _mix = (c0, c1, t) =>
  `rgb(${Math.round(_lerp(c0[0], c1[0], t))},${Math.round(_lerp(c0[1], c1[1], t))},${Math.round(_lerp(c0[2], c1[2], t))})`;
// Ease toward extremes so mid values aren't muddy
const _ease = (t) => t * t * (3 - 2 * t);

/** t ∈ [0,1]: 0 = max red, 0.5 = neutral, 1 = max green — solid, punchy */
export function heatDiverging(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) {
    const u = _ease(1 - t / 0.5); // 1 at red extreme → 0 at mid
    return _mix(HEAT_M, HEAT_R, Math.max(0.22, u));
  }
  const u = _ease((t - 0.5) / 0.5);
  return _mix(HEAT_M, HEAT_G, Math.max(0.22, u));
}

/**
 * Percent-based heatmap fill (Markets / Pulse / treemap-as-heatmap).
 * Solid RGB only — never rgba. Floor strength keeps small moves readable.
 * @param {number} pct change %
 * @param {number} [maxAbs=8] |pct| that maps to full saturation
 */
export function heatPct(pct, maxAbs = 8) {
  const t = Math.max(-1, Math.min(1, (Number(pct) || 0) / maxAbs));
  // 0.38 floor → even ±1% reads as clear green/red, not white wash
  const strength = 0.38 + _ease(Math.abs(t)) * 0.62;
  if (t >= 0) return _mix(HEAT_M, HEAT_G, strength);
  return _mix(HEAT_M, HEAT_R, strength);
}

/**
 * Side-bias liquidations: shorts rekt → green, longs rekt → red.
 * Solid RGB scaled by |bias| × intensity (tile size).
 */
export function heatBias(bias, intensity = 0.6) {
  const i = Math.max(0.2, Math.min(1, Number(intensity) || 0.6));
  const b = Number(bias) || 0;
  const mag = Math.min(1, Math.abs(b));
  if (b > 0.08) {
    const s = 0.4 + 0.6 * Math.max(mag, i * 0.55);
    return _mix(HEAT_M, HEAT_G, s);
  }
  if (b < -0.08) {
    const s = 0.4 + 0.6 * Math.max(mag, i * 0.55);
    return _mix(HEAT_M, HEAT_R, s);
  }
  // near-neutral: still slightly tinted by residual bias, never transparent
  if (b > 0) return _mix(HEAT_M, HEAT_G, 0.28);
  if (b < 0) return _mix(HEAT_M, HEAT_R, 0.28);
  return `rgb(${HEAT_M[0]},${HEAT_M[1]},${HEAT_M[2]})`;
}

/** Text colour that stays legible on a heat tile (always white on solid fills) */
export function heatLabelColor() {
  return "#ffffff";
}
// Multi-series (vs BTC lines) — pos/neg first, then distinct chart hues
export const SERIES = [
  "rgb(var(--pos))",
  "rgb(var(--neg))",
  "rgb(56 189 248)",
  "rgb(167 139 250)",
  "rgb(244 114 182)",
  "rgb(var(--accent))",
  "rgb(45 212 191)",
  "rgb(148 163 184)",
  "rgb(251 146 60)",
  "rgb(234 179 8)",
];

export const STATUS_ORDER = ["open", "tp1", "tp2", "tp3", "closed_win", "closed_loss"];
export const STATUS_LABEL = {
  open: "Open",
  tp1: "TP1",
  tp2: "TP2",
  tp3: "TP3",
  closed_win: "TP4",
  closed_loss: "SL",
};
export const STATUS_COLORS = {
  open: "rgb(var(--fg-muted))",
  tp1: POS,
  tp2: POS,
  tp3: POS,
  closed_win: POS,
  closed_loss: NEG,
};
export const RISK_COLORS = { LOW: POS, NORMAL: MUTED, HIGH: NEG };

// ── sector symbols (item: "sektor kasih simbol") ────────────────────
export const SECTOR_EMOJI = {
  infrastructure: "🏗️",
  defi: "🏦",
  ai: "🤖",
  gamefi: "🎮",
  meme: "🐸",
  hype: "🐸",
  payments: "💳",
  rwa: "🏛️",
  privacy: "🛡️",
  socialfi: "💬",
  depin: "📡",
  nft: "🖼️",
  l1: "⛓️",
  l2: "🧩",
  oracle: "🔮",
  dex: "🔁",
  lending: "🏦",
  metaverse: "🌐",
  other: "◈",
  unclassified: "◦",
};
export const SectorGlyph = ({ sector, size = 13 }) => (
  <span className="shrink-0 leading-none" style={{ fontSize: size }} aria-hidden="true">
    {SECTOR_EMOJI[(sector || "").toLowerCase()] || "◈"}
  </span>
);

// signal-status stroke color for a scatter dot (null if the pair has no call).
// Lets every scatter point show its status as a colored ring.
export function statusColorOf(map, pair) {
  const info = map?.[(pair || "").toUpperCase()];
  return info ? STATUS_META[info.status]?.color || null : null;
}

// clean axis tick labels at any zoom/pan — rounds to a sensible precision so
// panned domains never render like "-13.35857808172562%".
export const fmtAxis = (v) => {
  if (v == null || Number.isNaN(v)) return "";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.1) return v.toFixed(2);
  return v.toFixed(3);
};

export const TICK = { fill: AXIS, fontSize: 10, fontFamily: "JetBrains Mono" };
export const TICK_SM = { fill: AXIS, fontSize: 9, fontFamily: "JetBrains Mono" };

// ── formatting / math ──────────────────────────────────────────────
export const fmtPct = (v, dp = 1) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;
};
export const fmtMoney = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};
export const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const parseMcap = (mc) => {
  if (!mc) return null;
  if (typeof mc === "number") return mc;
  const str = String(mc).toUpperCase();
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  if (!num) return null;
  if (str.includes("T")) return num * 1e12;
  if (str.includes("B")) return num * 1e9;
  if (str.includes("M")) return num * 1e6;
  if (str.includes("K")) return num * 1e3;
  return num;
};
export const csv = (s) => (s ? s.split(",").filter(Boolean) : []);

export function makeBins(values, size, min, max) {
  const bins = [];
  for (let lo = min; lo < max; lo += size) bins.push({ lo, hi: lo + size, count: 0 });
  values.forEach((v) => {
    if (v == null || Number.isNaN(v)) return;
    const c = Math.min(Math.max(v, min), max - 1e-9);
    const idx = Math.min(bins.length - 1, Math.floor((c - min) / size));
    if (idx >= 0) bins[idx].count += 1;
  });
  return bins.map((b) => ({ x: `${b.lo}`, mid: (b.lo + b.hi) / 2, count: b.count }));
}

// live/entry plausibility band — outside ⇒ quarantined
export const PLAUSIBLE_LO = 0.05;
export const PLAUSIBLE_HI = 5;

// ── atoms ──────────────────────────────────────────────────────────

// bounded scroll region — keeps panels from growing forever (thin gold bar)
export const ScrollArea = ({ children, max = 460, className = "" }) => (
  <div
    className={`overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgb(var(--accent)_/_0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/20 [&::-webkit-scrollbar-track]:bg-transparent ${className}`}
    style={{ maxHeight: max }}
  >
    {children}
  </div>
);

// latest signal status tag (open / tp1-3 / tp4 / sl) — reuses palette
export const StatusTag = ({ status }) => {
  if (!status) return null;
  const label = STATUS_LABEL[status] || status;
  const color = STATUS_COLORS[status] || GRAYBAR;
  return (
    <span
      className="px-1.5 py-0.5 rounded-sm font-mono text-[8.5px] uppercase tracking-wider border"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
};

// Compact section header — Aero-style title row (no heavy card chrome)
export const SectionBand = ({ title, desc, badge }) => (
  <div className="flex items-end justify-between gap-3 px-0.5 py-0.5">
    <div className="min-w-0">
      <div className="text-[15px] font-medium tracking-tight text-text-primary/95">{title}</div>
      {desc && (
        <div className="text-[11px] text-text-muted mt-0.5 leading-snug line-clamp-1 max-w-3xl">
          {desc}
        </div>
      )}
    </div>
    {badge}
  </div>
);

// Metric tile — large number, tiny label, optional sub (Aero Economics density)
// Binance desk KPI: monochrome numbers by default.
// `tone` only for semantic PnL (text-positive / text-negative). `accent` bar dropped (decorative).
export const Kpi = ({ label, value, desc, tone, sub, accent, compact }) => {
  // Strip leftover decorative multi-color tones (cyan/gold/purple/orange)
  const safeTone =
    tone &&
    (tone.includes("positive") ||
      tone.includes("negative") ||
      tone.includes("profit") ||
      tone.includes("loss"))
      ? tone
      : "text-text-primary";
  return (
    <div
      className={`group relative min-w-0 rounded-xl border border-ink/[0.08] bg-surface-raised transition-colors hover:border-ink/[0.12] ${
        compact ? "px-3 py-2.5" : "px-3.5 py-3"
      }`}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </div>
      <div
        className={`font-mono tabular-nums mt-1.5 leading-none truncate font-semibold ${compact ? "text-[22px]" : "text-[26px]"} ${safeTone}`}
      >
        {value}
      </div>
      {sub != null && sub !== "" && (
        <div className="font-mono text-[10.5px] tabular-nums mt-1 text-text-muted truncate">
          {sub}
        </div>
      )}
      {desc && !compact && (
        <div className="text-[10px] text-text-muted mt-1.5 leading-snug line-clamp-1">{desc}</div>
      )}
    </div>
  );
};

// Active chip = solid yellow + dark ink (Binance filter pattern)
export const Chip = ({ active, onClick, children, size = "sm" }) => (
  <button
    type="button"
    onClick={onClick}
    className={`shrink-0 rounded-md font-mono uppercase tracking-wider border transition-colors ${
      size === "xs" ? "px-1.5 py-0.5 text-[8.5px]" : "px-2 py-1 text-[9px]"
    } ${
      active
        ? "border-accent bg-accent font-semibold text-accent-fg"
        : "border-ink/[0.1] bg-transparent text-text-muted hover:border-ink/20 hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

// Segmented control (TradingView / exchange-style filter group)
export const SegControl = ({ options, value, onChange, className = "" }) => (
  <div
    className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-ink/[0.03] border border-ink/[0.06] ${className}`}
  >
    {options.map((o) => {
      const id = typeof o === "string" ? o : o.id;
      const label = typeof o === "string" ? o : o.label;
      const active = value === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-2 py-1 rounded-md font-mono text-[9px] uppercase tracking-wide transition-colors whitespace-nowrap ${
            active
              ? "bg-ink/[0.1] text-text-primary font-semibold shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export const IconBtn = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="w-7 h-7 flex items-center justify-center rounded-lg border border-ink/[0.08] bg-ink/[0.02] text-text-muted hover:text-text-primary hover:border-ink/16 hover:bg-ink/[0.04] transition-colors font-mono text-[12px] leading-none"
  >
    {children}
  </button>
);

// Dropdown multi-select — exchange filter style (Sector / Risk)
export function FilterMulti({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (v) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const summary =
    selected.length === 0
      ? "All"
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
          selected.length
            ? "bg-ink/[0.06] border-ink/15 text-text-primary"
            : "bg-ink/[0.02] border-ink/[0.07] text-text-muted hover:border-ink/12 hover:text-text-primary"
        }`}
      >
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted/80">
          {label}
        </span>
        <span className="font-mono text-[10px] max-w-[7rem] truncate">{summary}</span>
        <svg
          className={`w-2.5 h-2.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M6 9 L12 15 L18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 left-0 min-w-[176px] max-h-64 overflow-y-auto rounded-lg bg-surface border border-ink/[0.1] shadow-2xl shadow-black/50 p-1.5">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-2 py-1.5 rounded-md font-mono text-[9.5px] uppercase tracking-wider text-text-muted hover:text-negative hover:bg-ink/[0.04]"
              >
                Clear
              </button>
            )}
            {options.map((o) => (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink/[0.04] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                  className="accent-[rgb(var(--accent))] w-3 h-3"
                />
                <span className="font-mono text-[11px] text-text-primary/85 capitalize">
                  {String(o).replace(/_/g, " ")}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const DarkTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-surface-secondary border border-ink/12 px-3 py-2 font-mono text-[10px] shadow-lg">
      {label != null && <div className="text-text-primary/50 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-sm"
            style={{ background: p.color || p.fill || GOLD }}
          />
          <span className="text-text-primary/80">{p.name}:</span>
          <span className="text-text-primary tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function ScatterTip({ active, payload, xLabel = "x", yLabel = "y" }) {
  const ctx = useContext(SignalStatusContext);
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const info = ctx?.map && p.pair ? ctx.map[p.pair.toUpperCase()] : null;
  const meta = info
    ? STATUS_META[info.status] || {
        label: (info.status || "—").toUpperCase(),
        color: "rgb(var(--fg-secondary))",
      }
    : null;
  const ago = info ? timeAgo(info.created) : null;
  return (
    <div className="rounded-md bg-surface-secondary border border-ink/12 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="text-text-primary mb-0.5 flex items-center gap-2">
        <span>{p.pair}</span>
        {meta && (
          <span className="font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        )}
      </div>
      {ago && <div className="text-text-primary/45 mb-0.5">called {ago}</div>}
      <div className="text-text-primary/60">
        {xLabel}: <span className="text-text-primary/90">{Number(p.x).toFixed(2)}</span>
      </div>
      <div className="text-text-primary/60">
        {yLabel}: <span className="text-text-primary/90">{Number(p.y).toFixed(2)}</span>
      </div>
    </div>
  );
}

export const LegendChips = ({ entries, activeKey, onPick }) => (
  <div className="flex flex-wrap gap-1.5 justify-center mt-1">
    {entries.map((e) => (
      <button
        key={e.key}
        onClick={onPick ? () => onPick(e.key) : undefined}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[9px] uppercase tracking-wider transition-colors ${
          activeKey === e.key
            ? "border-ink/15 bg-accent/12 text-accent"
            : "border-ink/[0.06] text-text-muted hover:text-text-primary"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-sm" style={{ background: e.color }} />
        {e.label} · {e.value}
      </button>
    ))}
  </div>
);

// Expandable metric/chart panel — desk card + fullscreen via portal (above app header)
export function XCard({ title, desc, render, zoom, hint, height = 360 }) {
  const { t } = useTranslation();
  const [big, setBig] = useState(false);

  // Escape + lock body scroll while expanded — never sit under sticky chrome
  useEffect(() => {
    if (!big) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setBig(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [big]);

  const zoomBtns = zoom && (
    <>
      <IconBtn onClick={zoom.zoomOut} title="zoom out">
        −
      </IconBtn>
      <IconBtn onClick={zoom.zoomIn} title="zoom in">
        +
      </IconBtn>
      <IconBtn onClick={zoom.reset} title="reset">
        ⟲
      </IconBtn>
    </>
  );
  const body = (h) => (
    <>
      <div
        ref={zoom?.ref}
        onPointerDown={zoom?.onPointerDown}
        onPointerMove={zoom?.onPointerMove}
        onPointerUp={zoom?.onPointerUp}
        onPointerLeave={zoom?.onPointerUp}
        onClickCapture={zoom?.onClickCapture}
        style={zoom ? { touchAction: "none", cursor: "grab" } : undefined}
      >
        {render(h)}
      </div>
      {hint && (
        <div className="mt-1.5 text-center font-mono text-[8.5px] uppercase tracking-wider text-text-muted/55">
          {zoom ? "drag · scroll zoom · ⟲ reset · " : ""}
          {hint}
        </div>
      )}
    </>
  );

  const overlay = big
    ? createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-scrim/80 p-3 backdrop-blur-md sm:p-6 md:p-8"
          style={{ zIndex: 200000 }}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : "Expanded chart"}
          onClick={() => setBig(false)}
        >
          <div
            className="relative flex h-[min(94vh,960px)] w-full max-w-[1480px] flex-col overflow-hidden rounded-2xl border border-ink/[0.1] bg-surface shadow-2xl shadow-black/70"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ink/[0.06] bg-ink/[0.02] px-5 py-4">
              <div className="min-w-0">
                <div className="text-[17px] font-medium tracking-tight text-text-primary">
                  {title}
                </div>
                {desc && (
                  <div className="mt-1 max-w-3xl text-[12px] leading-relaxed text-text-muted">
                    {desc}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {zoomBtns}
                <IconBtn onClick={() => setBig(false)} title="close">
                  ✕
                </IconBtn>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6">
              <div className="min-h-0 flex-1">
                {body(Math.max(520, Math.round(window.innerHeight * 0.74)))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-ink/[0.06] bg-ink/[0.02]">
        <div className="flex items-start justify-between gap-2 border-b border-ink/[0.04] px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium leading-snug text-text-primary/90">
              {title}
            </div>
            {desc && (
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-text-muted/75">
                {desc}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {zoomBtns}
            <IconBtn onClick={() => setBig(true)} title={t("terminal.viz.expand")}>
              ↗
            </IconBtn>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-2.5 sm:p-3">{body(height)}</div>
      </div>
      {overlay}
    </>
  );
}

// Domain-based pan + zoom for scatter charts (best practice — keeps SVG,
// tooltips and clicks accurate, unlike CSS transforms). Free pan in any
// direction, unlimited zoom in/out, wheel zooms toward the cursor, drag pans.
// Backward-compatible API (domX/domY/zoomIn/zoomOut/reset/onWheel) plus the
// pointer handlers + ref that XCard wires onto the chart body.
export function useZoom(x0, x1, y0, y1) {
  const [dom, setDom] = useState({ x0, x1, y0, y1 });
  const elRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const baseRef = useRef({ x0, x1, y0, y1 });
  baseRef.current = { x0, x1, y0, y1 };

  // soft-clamp the view to ~6× the base domain: roomy enough to pan out to
  // outliers, but never a 700,000% void from infinite zoom-out (best practice).
  const ZMAX = 6;
  const clampDom = (d) => {
    const b = baseRef.current;
    const bw = b.x1 - b.x0,
      bh = b.y1 - b.y0;
    const maxW = bw * ZMAX,
      maxH = bh * ZMAX;
    const padX = (maxW - bw) / 2,
      padY = (maxH - bh) / 2;
    const LX0 = b.x0 - padX,
      LX1 = b.x1 + padX,
      LY0 = b.y0 - padY,
      LY1 = b.y1 + padY;
    let { x0: a, x1: c, y0: e, y1: f } = d;
    if (c - a > maxW) {
      const m = (a + c) / 2;
      a = m - maxW / 2;
      c = m + maxW / 2;
    }
    if (f - e > maxH) {
      const m = (e + f) / 2;
      e = m - maxH / 2;
      f = m + maxH / 2;
    }
    if (a < LX0) {
      c += LX0 - a;
      a = LX0;
    }
    if (c > LX1) {
      a -= c - LX1;
      c = LX1;
    }
    if (e < LY0) {
      f += LY0 - e;
      e = LY0;
    }
    if (f > LY1) {
      e -= f - LY1;
      f = LY1;
    }
    return { x0: a, x1: c, y0: e, y1: f };
  };

  const reset = useCallback(() => setDom({ x0, x1, y0, y1 }), [x0, x1, y0, y1]);
  // follow the base domain when it changes (autoscaled charts) → refit data
  useEffect(() => {
    setDom({ x0, x1, y0, y1 });
  }, [x0, x1, y0, y1]);

  // zoom keeping the point at fraction (fx,fy) of the plot fixed under cursor
  const zoomAt = useCallback(
    (fx, fy, factor) =>
      setDom((d) => {
        const w = d.x1 - d.x0,
          h = d.y1 - d.y0;
        const px = d.x0 + fx * w; // data-x under cursor
        const py = d.y1 - fy * h; // data-y under cursor (screen-top = y1)
        const nw = w / factor,
          nh = h / factor;
        return clampDom({
          x0: px - fx * nw,
          x1: px + (1 - fx) * nw,
          y1: py + fy * nh,
          y0: py - (1 - fy) * nh,
        });
      }),
    []
  );

  const fracOf = useCallback((cx, cy) => {
    const r = elRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0.5, 0.5];
    return [
      Math.min(1, Math.max(0, (cx - r.left) / r.width)),
      Math.min(1, Math.max(0, (cy - r.top) / r.height)),
    ];
  }, []);

  // native, NON-passive wheel listener — React's onWheel is passive so
  // preventDefault() would be ignored and the page would scroll instead.
  const onWheelNative = useCallback(
    (e) => {
      e.preventDefault();
      const [fx, fy] = fracOf(e.clientX, e.clientY);
      zoomAt(fx, fy, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    },
    [fracOf, zoomAt]
  );

  // callback ref — attaches/detaches the wheel listener as the chart body
  // element mounts (works for both the inline card and the fullscreen modal)
  const ref = useCallback(
    (node) => {
      if (elRef.current) elRef.current.removeEventListener("wheel", onWheelNative);
      elRef.current = node;
      if (node) node.addEventListener("wheel", onWheelNative, { passive: false });
    },
    [onWheelNative]
  );

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    moved.current = false;
    // NOTE: do NOT setPointerCapture here — capturing on a plain click makes
    // some browsers retarget the click to this element, swallowing the child
    // dot's onClick (drill/open). Capture only once an actual drag starts.
    drag.current = { sx: e.clientX, sy: e.clientY, dom, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const r = elRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const dx = e.clientX - drag.current.sx,
      dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      if (!moved.current) {
        try {
          elRef.current?.setPointerCapture?.(drag.current.id);
        } catch {
          /* ignore */
        }
      }
      moved.current = true;
    }
    const d0 = drag.current.dom;
    const w = d0.x1 - d0.x0,
      h = d0.y1 - d0.y0;
    const shiftX = -(dx / r.width) * w,
      shiftY = (dy / r.height) * h;
    setDom(
      clampDom({ x0: d0.x0 + shiftX, x1: d0.x1 + shiftX, y0: d0.y0 + shiftY, y1: d0.y1 + shiftY })
    );
  };
  const onPointerUp = (e) => {
    drag.current = null;
    try {
      elRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  // swallow the click that ends a drag so it doesn't open a signal
  const onClickCapture = (e) => {
    if (moved.current) {
      e.stopPropagation();
      moved.current = false;
    }
  };

  return {
    ref,
    domX: [dom.x0, dom.x1],
    domY: [dom.y0, dom.y1],
    zoomIn: () => zoomAt(0.5, 0.5, 1.4),
    zoomOut: () => zoomAt(0.5, 0.5, 1 / 1.4),
    reset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClickCapture,
  };
}

// coin pill: logo + pair. Hovering the NAME (not just the logo) shows signal
// status + when it was called; the logo carries the status dot + click-modal.
export const CoinPill = ({ pair, onPair, className = "" }) => {
  const ctx = useContext(SignalStatusContext);
  const info = ctx?.map && pair ? ctx.map[pair.toUpperCase()] : null;
  const meta = info
    ? STATUS_META[info.status] || {
        label: (info.status || "—").toUpperCase(),
        color: "rgb(var(--fg-secondary))",
      }
    : null;
  const ago = info ? timeAgo(info.created) : null;
  const tip = info ? `${pair} · ${meta.label}${ago ? ` · called ${ago}` : ""}` : pair;
  return (
    <button
      onClick={onPair ? () => onPair(pair) : undefined}
      className={`flex items-center gap-1.5 min-w-0 group ${className}`}
      title={tip}
    >
      <CoinLogo pair={pair} size={16} />
      <span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary truncate transition-colors">
        {pair}
      </span>
    </button>
  );
};

// ranked horizontal bars with coin pills.
// align="center" (default) = diverging around mid (gains/losses).
// align="start" = left-fill bars for always-positive rankings (spikes, squeeze).
// When d.color is set, value text follows it (no red-bar / green-number mismatch).
export function RankBars({ data, fmt, suffix, onPair, align = "center" }) {
  if (!data.length)
    return (
      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
        —
      </div>
    );
  const max = Math.max(...data.map((d) => Math.abs(d.v))) || 1;
  const start = align === "start";
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d, i) => {
        const color = d.color || (d.v >= 0 ? POS : NEG);
        const pct = (Math.abs(d.v) / max) * (start ? 100 : 50);
        const valueTone = d.color
          ? undefined
          : start
            ? "text-text-primary"
            : d.v >= 0
              ? "text-positive"
              : "text-negative";
        return (
          <div key={d.pair} className="flex items-center gap-2 group/row">
            <span className="w-4 shrink-0 text-right font-mono text-[9px] tabular-nums text-text-muted/50">
              {i + 1}
            </span>
            <span className="w-28 shrink-0">
              <CoinPill pair={d.pair} onPair={onPair} />
            </span>
            <span
              className={`relative flex-1 overflow-hidden rounded-md ${start ? "h-[18px] bg-ink/[0.07]" : "h-4 bg-ink/[0.05]"}`}
            >
              <span
                className="absolute bottom-0 top-0 rounded-md transition-[width] duration-300"
                style={
                  start
                    ? {
                        width: `${Math.max(pct, 3)}%`,
                        left: 0,
                        background: color,
                        opacity: 0.72 + (1 - i / Math.max(data.length - 1, 1)) * 0.28,
                      }
                    : {
                        width: `${pct}%`,
                        left: d.v >= 0 ? "50%" : `${50 - pct}%`,
                        background: color,
                        opacity: 0.9,
                      }
                }
              />
              {!start && <span className="absolute bottom-0 top-0 left-1/2 w-px bg-ink/15" />}
            </span>
            <span
              className={`w-[4.25rem] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums ${valueTone || ""}`}
              style={d.color ? { color: d.color } : undefined}
            >
              {fmt ? fmt(d.v) : fmtPct(d.v)}
              {suffix || ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SectorBars({ data, dataKey, color, fmt, onPick, diverging = false }) {
  if (!data.length)
    return (
      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
        —
      </div>
    );
  const max = Math.max(...data.map((d) => Math.abs(d[dataKey] || 0))) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d, i) => {
        const v = d[dataKey] || 0;
        const w = (Math.abs(v) / max) * 100;
        const c = color(v);
        // Ranked opacity so bars stay solid/punchy (no washed pastel on bright)
        const op = 0.78 + (1 - i / Math.max(data.length - 1, 1)) * 0.22;
        return (
          <button
            key={d.sector}
            onClick={() => onPick(d.sector)}
            className="group flex w-full items-center gap-2"
            title={d.sector}
          >
            <span className="flex w-28 shrink-0 items-center gap-1.5 text-left font-mono text-[10px] font-medium text-text-secondary transition-colors group-hover:text-text-primary">
              <SectorGlyph sector={d.sector} />
              <span className="truncate">{d.sector}</span>
            </span>
            <span className="relative h-[18px] flex-1 overflow-hidden rounded-md bg-ink/[0.07]">
              {diverging ? (
                <span
                  className="absolute bottom-0 top-0 rounded-md"
                  style={{
                    background: c,
                    opacity: op,
                    left: v >= 0 ? "50%" : `${50 - w / 2}%`,
                    width: `${Math.max(w / 2, 2)}%`,
                  }}
                />
              ) : (
                <span
                  className="absolute bottom-0 left-0 top-0 rounded-md"
                  style={{ background: c, opacity: op, width: `${Math.max(w, 3)}%` }}
                />
              )}
              {diverging && <span className="absolute bottom-0 top-0 left-1/2 w-px bg-ink/20" />}
            </span>
            <span
              className="w-14 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: c }}
            >
              {fmt(v)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Donut({ data, active, onPick, h = 190 }) {
  const clean = data.filter((d) => d.value > 0);
  return (
    <>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={clean}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="none"
            >
              {clean.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={active === d.key ? 1 : 0.75} />
              ))}
            </Pie>
            <Tooltip content={<DarkTip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendChips
        entries={clean.map((d) => ({ key: d.key, label: d.name, value: d.value, color: d.color }))}
        activeKey={active}
        onPick={onPick}
      />
    </>
  );
}

// "warming up" placeholder — shown while the backend blob is precomputing
export const Warming = ({ text }) => (
  <div className="py-12 flex flex-col items-center gap-2">
    <div className="w-5 h-5 border border-ink/12 border-t-accent rounded-full animate-spin" />
    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-center leading-relaxed max-w-xs">
      {text}
    </span>
  </div>
);
