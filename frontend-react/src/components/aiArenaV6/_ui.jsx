// src/components/aiArenaV6/_ui.jsx
// ────────────────────────────────────────────────────────────────
// Shared UI primitives for the BTC Compass (AI Research) rebuild.
// Visual language = LuxQuant "Flowscan" reskin (see MarketsPage / MarketPulsePage):
//   • card:  bg-[#0a0805] + white/[0.06] border + top hairline + inset shadow
//   • tile:  bg-[#120809] + white/[0.04] border
//   • numbers: font-mono font-light tabular-nums tracking-tight
//   • accent: gold-primary (#d4a853) · profit (#56c996) · loss (#e07288)
// All classes resolve in the existing Tailwind build (gold-primary / profit /
// loss / text-muted are already defined project-wide).
// ────────────────────────────────────────────────────────────────

/* ═══════════════ formatting helpers ═══════════════ */

export const fmtPrice = (n) => {
  const p = Number(n);
  if (!isFinite(p) || p <= 0) return "—";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

export const fmtUsd = (n) => {
  const p = Number(n);
  if (!isFinite(p) || p <= 0) return "—";
  return "$" + fmtPrice(p);
};

export const fmtPct = (n, withSign = true) => {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  const s = withSign && v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
};

export const timeAgo = (iso) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

/* ═══════════════ direction + confidence meta ═══════════════ */

// Normalise any backend direction string → up | down | flat
export const normDir = (d) => {
  const s = String(d || "").toLowerCase();
  if (/(bull|long|up|positive|risk[_-]?on)/.test(s)) return "up";
  if (/(bear|short|down|negative|de[_-]?risk)/.test(s)) return "down";
  return "flat";
};

export const dirMeta = (direction) => {
  const k = normDir(direction);
  if (k === "up")
    return { k, label: "Bullish", arrow: "↑", text: "text-profit",
      tag: "bg-profit/10 text-profit border-profit/25", bar: "bg-profit" };
  if (k === "down")
    return { k, label: "Bearish", arrow: "↓", text: "text-loss",
      tag: "bg-loss/10 text-loss border-loss/25", bar: "bg-loss" };
  return { k, label: "Neutral", arrow: "→", text: "text-amber-400",
    tag: "bg-amber-500/10 text-amber-400 border-amber-500/20", bar: "bg-amber-500" };
};

// Confidence → level label (thresholds tunable in one place)
export const confLevel = (c) => {
  const v = Number(c) || 0;
  if (v >= 65) return { label: "High confidence", short: "High" };
  if (v >= 45) return { label: "Moderate confidence", short: "Moderate" };
  return { label: "Low confidence", short: "Low" };
};

/* ═══════════════ primitive components ═══════════════ */

// Flowscan card: hairline-top + inset shadow, optional accent border colour.
export const Card = ({ className = "", children, accent }) => {
  const border =
    accent === "gold" ? "border-gold-primary/20"
    : accent === "up" ? "border-profit/20"
    : accent === "down" ? "border-loss/20"
    : "border-white/[0.06]";
  return (
    <div
      className={`relative overflow-hidden rounded-md border ${border} bg-[#0a0805] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] ${className}`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// line — label — line section header + LIVE-style right slot
export const SectionHeader = ({ label, right }) => (
  <div className="mb-4 flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 whitespace-nowrap">
      {label}
    </span>
    <span className="h-px flex-1 bg-white/[0.06]" />
    {right && <div className="flex-shrink-0">{right}</div>}
  </div>
);

// inline mono eyebrow
export const Eyebrow = ({ children, className = "" }) => (
  <p className={`font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70 ${className}`}>
    {children}
  </p>
);

// rectangular status badge (MINOR RISE / TP2 / HIGH style)
export const Tag = ({ children, tone = "muted", className = "" }) => {
  const tones = {
    up: "bg-profit/10 text-profit border-profit/25",
    down: "bg-loss/10 text-loss border-loss/25",
    neutral: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    gold: "bg-gold-primary/10 text-gold-primary border-gold-primary/25",
    muted: "bg-white/[0.03] text-text-muted border-white/[0.08]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${tones[tone] || tones.muted} ${className}`}
    >
      {children}
    </span>
  );
};

// data tile (bg-[#120809])
export const Tile = ({ label, children, className = "" }) => (
  <div className={`rounded-sm border border-white/[0.04] bg-[#120809] px-3 py-2.5 ${className}`}>
    {label && (
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/70">{label}</p>
    )}
    <div className="mt-1.5">{children}</div>
  </div>
);

// big mono number
export const Num = ({ children, className = "" }) => (
  <span className={`font-mono font-light tabular-nums tracking-tight ${className}`}>{children}</span>
);

// horizontal confidence meter with Low/Moderate/High zones
export const ConfidenceMeter = ({ value = 0, dir = "up" }) => {
  const meta = dirMeta(dir);
  const fill = meta.k === "down" ? "bg-loss" : meta.k === "flat" ? "bg-amber-500" : "bg-profit";
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-sm border border-white/[0.06] bg-white/[0.03]">
        {/* zone ticks at 45 / 65 */}
        <span className="absolute top-0 bottom-0 w-px bg-white/[0.08]" style={{ left: "45%" }} />
        <span className="absolute top-0 bottom-0 w-px bg-white/[0.08]" style={{ left: "65%" }} />
        <div className={`h-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted/50">
        <span>Low</span><span>Moderate</span><span>High</span>
      </div>
    </div>
  );
};

// segmented toggle (Swing / Holder · timeframe etc.)
export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex gap-0.5 rounded-md border border-white/[0.06] bg-white/[0.03] p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`rounded-sm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-all ${
          value === o.value
            ? "bg-gold-primary/15 text-gold-primary"
            : "text-text-muted/60 hover:text-white"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// filter chip / pill
export const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-all ${
      active
        ? "border-gold-primary/40 bg-gold-primary/15 text-white"
        : "border-white/[0.06] bg-white/[0.03] text-text-muted/70 hover:border-white/[0.14] hover:text-white"
    }`}
  >
    {children}
  </button>
);

// weight bar (used in breakdown tables)
export const WeightBar = ({ pct }) => (
  <span className="mr-2 inline-block h-[6px] w-[70px] overflow-hidden rounded-sm border border-white/[0.06] bg-white/[0.04] align-middle">
    <span className="block h-full bg-gold-primary/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </span>
);

// page-level loading / empty / error
export const StateBox = ({ icon = "spin", text }) => (
  <div className="flex items-center justify-center gap-2 py-16 font-mono text-[11px] uppercase tracking-[0.15em] text-text-muted">
    {icon === "spin" && (
      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )}
    {text}
  </div>
);
