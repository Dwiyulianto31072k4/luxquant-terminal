// src/components/aiArenaV6/_ui.jsx
// ────────────────────────────────────────────────────────────────
// Compass v2 — shared UI primitives for the BTC Compass (AI Research).
// Design language: full-width research desk (exchange-grade).
//   • Panel  : bg-[#0d0709], border-white/[0.07], rounded-xl, gold hairline top
//   • Tile   : bg-[#140b0d], border-white/[0.05], rounded-lg
//   • Numbers: font-mono tabular-nums
//   • Semantics: profit #56c996 · loss #e07288 · gold #d4a853 (single accent)
// Back-compat: every export that existed in v1 still exists here.
// New visuals: StanceGauge, LevelRail, SignalBar, OutcomeBar, StatCard.
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

export const normDir = (d) => {
  const s = String(d || "").toLowerCase();
  if (/(bull|long|up|positive|risk[_-]?on)/.test(s)) return "up";
  if (/(bear|short|down|negative|de[_-]?risk)/.test(s)) return "down";
  return "flat";
};

export const COLOR = {
  profit: "#56c996",
  loss: "#e07288",
  gold: "#d4a853",
  goldLight: "#f5c451",
  flat: "#fbbf24",
  muted: "#a59585",
};

export const dirMeta = (direction) => {
  const k = normDir(direction);
  if (k === "up")
    return { k, label: "Bullish", arrow: "↑", text: "text-profit", hex: COLOR.profit,
      tag: "bg-profit/10 text-profit border-profit/25", bar: "bg-profit" };
  if (k === "down")
    return { k, label: "Bearish", arrow: "↓", text: "text-loss", hex: COLOR.loss,
      tag: "bg-loss/10 text-loss border-loss/25", bar: "bg-loss" };
  return { k, label: "Neutral", arrow: "→", text: "text-amber-400", hex: COLOR.flat,
    tag: "bg-amber-500/10 text-amber-400 border-amber-500/20", bar: "bg-amber-500" };
};

export const confLevel = (c) => {
  const v = Number(c) || 0;
  if (v >= 65) return { label: "High confidence", short: "High" };
  if (v >= 45) return { label: "Moderate confidence", short: "Moderate" };
  return { label: "Low confidence", short: "Low" };
};

/* ═══════════════ layout primitives ═══════════════ */

// Panel — the single card surface for Compass v2.
export const Card = ({ className = "", children, accent, hairline = true }) => {
  const border =
    accent === "gold" ? "border-gold-primary/25"
    : accent === "up" ? "border-profit/25"
    : accent === "down" ? "border-loss/25"
    : "border-white/[0.07]";
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${border} bg-[#0d0709] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.25)] ${className}`}
    >
      {hairline && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// Section header: rule — LABEL — rule + optional right slot.
export const SectionHeader = ({ label, right, className = "" }) => (
  <div className={`mb-4 flex items-center gap-3 ${className}`}>
    <span className="h-px w-8 shrink-0 bg-gold-primary/40" />
    <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
      {label}
    </span>
    <span className="h-px flex-1 bg-white/[0.06]" />
    {right && <div className="flex-shrink-0">{right}</div>}
  </div>
);

export const Eyebrow = ({ children, className = "" }) => (
  <p className={`font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70 ${className}`}>
    {children}
  </p>
);

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
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${tones[tone] || tones.muted} ${className}`}
    >
      {children}
    </span>
  );
};

export const Tile = ({ label, children, className = "" }) => (
  <div className={`rounded-lg border border-white/[0.05] bg-[#140b0d] px-3.5 py-3 ${className}`}>
    {label && (
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/70">{label}</p>
    )}
    <div className="mt-1.5">{children}</div>
  </div>
);

export const Num = ({ children, className = "" }) => (
  <span className={`font-mono tabular-nums tracking-tight ${className}`}>{children}</span>
);

// Hi — inline "stabilo" highlight for the numbers/phrases that matter.
// Use sparingly: one glance should land on price, direction, target, stop.
export const Hi = ({ children, tone = "gold", className = "" }) => {
  const tones = {
    gold: "bg-gold-primary/[0.16] text-gold-light",
    up: "bg-profit/[0.14] text-profit",
    down: "bg-loss/[0.14] text-loss",
    white: "bg-white/[0.1] text-white",
  };
  return (
    <mark
      className={`whitespace-nowrap rounded-[5px] px-1.5 py-[1.5px] font-semibold ${tones[tone] || tones.gold} ${className}`}
    >
      {children}
    </mark>
  );
};

// highlightPrices — wraps every $12,345-style token in a gold stabilo.
// For dynamic sentences where we can't hand-place <Hi> markers.
export const highlightPrices = (text) => {
  const parts = String(text ?? "").split(/(\$[\d][\d,]*(?:\.\d+)?)/g);
  return parts.map((part, i) =>
    /^\$[\d]/.test(part) ? (
      <mark
        key={i}
        className="whitespace-nowrap rounded-[5px] bg-gold-primary/[0.16] px-1 py-[1px] font-mono font-semibold tabular-nums text-gold-light"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
};

// KPI stat card (used on audit + library headers).
export const StatCard = ({ label, value, detail, tone = "neutral", big = false }) => {
  const tones = {
    neutral: "border-white/[0.05] bg-[#140b0d]",
    gold: "border-gold-primary/25 bg-gold-primary/[0.06]",
    up: "border-profit/20 bg-profit/[0.05]",
    down: "border-loss/20 bg-loss/[0.05]",
  };
  const valueTone =
    tone === "up" ? "text-profit" : tone === "down" ? "text-loss" : tone === "gold" ? "text-gold-light" : "text-white";
  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.neutral}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/70">{label}</div>
      <div className={`mt-1.5 font-mono ${big ? "text-3xl" : "text-2xl"} font-light tabular-nums tracking-tight ${valueTone}`}>
        {value}
      </div>
      {detail && <div className="mt-1 text-[11px] leading-4 text-text-muted/60">{detail}</div>}
    </div>
  );
};

/* ═══════════════ data visuals ═══════════════ */

// Confidence bar with Low/Moderate/High zones (kept for back-compat).
export const ConfidenceMeter = ({ value = 0, dir = "up" }) => {
  const meta = dirMeta(dir);
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03]">
        <span className="absolute bottom-0 top-0 w-px bg-white/[0.1]" style={{ left: "45%" }} />
        <span className="absolute bottom-0 top-0 w-px bg-white/[0.1]" style={{ left: "65%" }} />
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meta.hex}66, ${meta.hex})` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted/50">
        <span>Low</span><span>Moderate</span><span>High</span>
      </div>
    </div>
  );
};

// StanceGauge — 180° SVG arc with the confidence value in the middle.
export const StanceGauge = ({ value = 0, dir = "up", size = 168 }) => {
  const meta = dirMeta(dir);
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h - 6;
  const r = w / 2 - 10;
  const angle = (p) => Math.PI * (1 - p / 100);
  const px = (p) => cx + r * Math.cos(angle(p));
  const py = (p) => cy - r * Math.sin(angle(p));
  // Max sweep is 180° (semicircle), so the large-arc flag must always be 0.
  // With `to - from > 50 ? 1 : 0` SVG drew the complementary 200°+ arc the
  // wrong way around the circle — the "broken gauge" bug.
  const arc = (from, to) =>
    `M ${px(from)} ${py(from)} A ${r} ${r} 0 0 1 ${px(to)} ${py(to)}`;
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <svg width={w} height={h} className="block">
        <path d={arc(0, 100)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" strokeLinecap="round" />
        {/* zone ticks */}
        {[45, 65].map((z) => (
          <line
            key={z}
            x1={cx + (r - 9) * Math.cos(angle(z))}
            y1={cy - (r - 9) * Math.sin(angle(z))}
            x2={cx + (r + 9) * Math.cos(angle(z))}
            y2={cy - (r + 9) * Math.sin(angle(z))}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1.5"
          />
        ))}
        {pct > 0.5 && (
          <path
            d={arc(0, pct)}
            fill="none"
            stroke={meta.hex}
            strokeWidth="9"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${meta.hex}55)` }}
          />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
        <div className={`font-mono text-3xl font-light tabular-nums ${meta.text}`}>
          {isFinite(Number(value)) ? `${Math.round(pct)}%` : "—"}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/60">
          {confLevel(pct).short} confidence
        </div>
      </div>
    </div>
  );
};

// LevelRail — vertical price ladder: invalidation → spot → target.
// The signature visual of the read: shows the whole trade geometry at a glance.
export const LevelRail = ({ spot, target, invalidation, dir = "up" }) => {
  const s = Number(spot), t = Number(target), i = Number(invalidation);
  if (!isFinite(s) || !isFinite(t) || !isFinite(i)) return null;
  const meta = dirMeta(dir);
  const hi = Math.max(s, t, i);
  const lo = Math.min(s, t, i);
  const span = hi - lo || 1;
  const pad = span * 0.14;
  const top = hi + pad;
  const range = span + pad * 2;
  const y = (price) => `${((top - price) / range) * 100}%`;
  const pct = (price) => fmtPct(((price - s) / s) * 100);

  const rows = [
    { key: "target", price: t, label: "TARGET", hex: COLOR.profit, sub: `${pct(t)} from spot` },
    { key: "spot", price: s, label: "SPOT", hex: "#ffffff", sub: "live price" },
    { key: "invalidation", price: i, label: "INVALIDATION", hex: COLOR.loss, sub: `read breaks ${pct(i)}` },
  ].sort((a, b) => b.price - a.price);

  return (
    <div className="relative h-[260px] w-full">
      {/* rail track */}
      <div className="absolute bottom-0 left-[9px] top-0 w-px bg-white/[0.08]" />
      {/* filled span between invalidation and target */}
      <div
        className="absolute left-[7px] w-[5px] rounded-full opacity-80"
        style={{
          top: y(Math.max(t, i)),
          height: `calc(${y(Math.min(t, i))} - ${y(Math.max(t, i))})`,
          background: `linear-gradient(180deg, ${t > i ? COLOR.profit : COLOR.loss}, ${t > i ? COLOR.loss : COLOR.profit})`,
          opacity: 0.35,
        }}
      />
      {rows.map((row) => (
        <div
          key={row.key}
          className="absolute left-0 right-0 flex -translate-y-1/2 items-center gap-3"
          style={{ top: y(row.price) }}
        >
          <span
            className="relative z-10 h-[19px] w-[19px] shrink-0 rounded-full border-2 bg-[#0d0709]"
            style={{ borderColor: row.hex }}
          >
            {row.key === "spot" && (
              <span className="absolute inset-[3px] animate-pulse rounded-full" style={{ background: row.hex }} />
            )}
          </span>
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-lg border border-white/[0.05] bg-[#140b0d] px-3 py-2">
            <div className="min-w-0">
              <div className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: `${row.hex}99` }}>
                {row.label}
              </div>
              <div className="font-mono text-[15px] font-medium tabular-nums" style={{ color: row.hex }}>
                {fmtUsd(row.price)}
              </div>
            </div>
            <div className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted/70">{row.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// SignalBar — diverging driver bar (bearish ← 0 → bullish), width = strength.
export const SignalBar = ({ label, direction, strength = 0, weight, detail }) => {
  const meta = dirMeta(direction);
  const pct = Math.max(0, Math.min(100, Math.round((Number(strength) || 0) * 100)));
  const half = pct / 2; // % of half-track
  return (
    <div className="rounded-lg border border-white/[0.05] bg-[#140b0d] px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-white/90">{label}</span>
        <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${meta.text}`}>
          {meta.label} · {pct}%
        </span>
      </div>
      <div className="relative mt-2 h-[7px] overflow-hidden rounded-full bg-white/[0.05]">
        <span className="absolute bottom-0 left-1/2 top-0 w-px bg-white/[0.14]" />
        {meta.k !== "flat" && pct > 0 && (
          <span
            className="absolute bottom-0 top-0 rounded-full"
            style={
              meta.k === "up"
                ? { left: "50%", width: `${half}%`, background: `linear-gradient(90deg, ${meta.hex}55, ${meta.hex})` }
                : { right: "50%", width: `${half}%`, background: `linear-gradient(270deg, ${meta.hex}55, ${meta.hex})` }
            }
          />
        )}
        {meta.k === "flat" && (
          <span
            className="absolute bottom-0 top-0 rounded-full bg-amber-500/70"
            style={{ left: `calc(50% - ${Math.max(half, 2) / 2}%)`, width: `${Math.max(half, 2)}%` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] text-text-muted/60">{detail || ""}</span>
        {weight != null && (
          <span className="shrink-0 font-mono text-[10px] text-text-muted/50">w {Number(weight).toFixed(2)}</span>
        )}
      </div>
    </div>
  );
};

// OutcomeBar — stacked distribution (audit outcomes).
export const OutcomeBar = ({ segments = [] }) => {
  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03]">
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.label}
              className="h-full transition-all duration-700"
              style={{ width: `${(s.value / total) * 100}%`, background: s.hex }}
              title={`${s.label}: ${s.value}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-text-muted/70">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: s.hex }} />
            {s.label} <span className="text-white/75">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════ landing-grade controls ═══════════════ */

// Solid gold CTA — exchange-grade: compact fixed height, 8px radius, flat.
// (Binance/Bybit convention: h-8/h-9, medium weight, solid accent, no capsule.)
export const GoldButton = ({ children, className = "", size = "md", ...rest }) => {
  const sizes = {
    sm: "h-8 px-3 text-[12px]",
    md: "h-9 px-4 text-[13px]",
  };
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 self-center rounded-lg bg-gold-primary font-semibold leading-none text-[#1a0f08] transition hover:bg-gold-light active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size] || sizes.md} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

// Quiet counterpart — same metrics, outline style.
export const GhostButton = ({ children, className = "", size = "md", ...rest }) => {
  const sizes = {
    sm: "h-8 px-3 text-[12px]",
    md: "h-9 px-4 text-[13px]",
  };
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 self-center rounded-lg border border-white/[0.1] bg-white/[0.03] font-medium leading-none text-white/70 transition hover:border-gold-primary/40 hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size] || sizes.md} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

// Donut — segmented ring with a big center value (landing "Win Rate" style).
export const Donut = ({ segments = [], size = 150, thickness = 13, centerValue, centerLabel }) => {
  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {segments.map((s) => {
          const frac = (Number(s.value) || 0) / total;
          const dash = Math.max(0, frac * circumference - 2);
          const el = frac > 0 ? (
            <circle
              key={s.label}
              cx={c} cy={c} r={r} fill="none"
              stroke={s.hex}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset * circumference}
              style={{ transition: "stroke-dasharray 0.7s ease" }}
            />
          ) : null;
          offset += frac;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[26px] font-bold leading-none text-white">{centerValue}</span>
        {centerLabel && (
          <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted/70">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
};

/* ═══════════════ controls ═══════════════ */

export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex gap-0.5 rounded-lg border border-white/[0.07] bg-black/25 p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`rounded-md px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-all ${
          value === o.value
            ? "bg-gold-primary/15 text-gold-primary shadow-[inset_0_0_0_1px_rgba(212,168,83,0.3)]"
            : "text-text-muted/60 hover:text-white"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-all ${
      active
        ? "border-gold-primary/40 bg-gold-primary/15 text-gold-primary"
        : "border-white/[0.07] bg-white/[0.02] text-text-muted/70 hover:border-white/[0.16] hover:text-white"
    }`}
  >
    {children}
  </button>
);

export const WeightBar = ({ pct }) => (
  <span className="mr-2 inline-block h-[6px] w-[70px] overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04] align-middle">
    <span className="block h-full rounded-full bg-gold-primary/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </span>
);

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
