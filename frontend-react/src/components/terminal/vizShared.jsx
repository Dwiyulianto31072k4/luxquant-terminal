// ════════════════════════════════════════════════════════════════
// Terminal viz — shared atoms, palette & helpers.
// Used by SignalsAnalytics + DerivTabs. Dark+gold, Allium structure.
// ════════════════════════════════════════════════════════════════
import { useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import CoinLogo from "../CoinLogo";
import { SignalStatusContext, STATUS_META, timeAgo } from "../../context/SignalStatusContext";

export const API_BASE = import.meta.env.VITE_API_URL || "";

export const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── palette ────────────────────────────────────────────────────────
export const GOLD = "#d4a853";
export const POS = "#4ade80";
export const NEG = "#f87171";
export const CYAN = "#67e8f9";
export const PURPLE = "#a78bfa";
export const ORANGE = "#fb923c";
export const GRAYBAR = "rgba(255,255,255,0.25)";
export const GRID = "rgba(212,168,83,0.06)";
export const AXIS = "#a59585";

export const STATUS_ORDER = ["open", "tp1", "tp2", "tp3", "closed_win", "closed_loss"];
export const STATUS_LABEL = { open: "open", tp1: "tp1", tp2: "tp2", tp3: "tp3", closed_win: "tp4", closed_loss: "sl" };
export const STATUS_COLORS = {
  open: GRAYBAR, tp1: "#2dd4a0", tp2: "#4ade80", tp3: "#86efac",
  closed_win: GOLD, closed_loss: NEG,
};
export const RISK_COLORS = { LOW: POS, NORMAL: GOLD, HIGH: NEG };

// ── sector symbols (item: "sektor kasih simbol") ────────────────────
export const SECTOR_EMOJI = {
  infrastructure: "🏗️", defi: "🏦", ai: "🤖", gamefi: "🎮", hype: "🔥",
  payments: "💳", rwa: "🏛️", privacy: "🛡️", socialfi: "💬", meme: "🐸",
  depin: "📡", nft: "🖼️", l1: "⛓️", l2: "🧩", oracle: "🔮", dex: "🔁",
  lending: "🏦", metaverse: "🌐", other: "◈", unclassified: "◦",
};
export const SectorGlyph = ({ sector, size = 13 }) => (
  <span className="shrink-0 leading-none" style={{ fontSize: size }} aria-hidden="true">
    {SECTOR_EMOJI[(sector || "").toLowerCase()] || "◈"}
  </span>
);

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
    className={`overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(212,168,83,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gold-primary/25 [&::-webkit-scrollbar-track]:bg-transparent ${className}`}
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
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {label}
    </span>
  );
};

// solid landing-page surface + gold top hairline (matches Track Record cards)
export const SectionBand = ({ title, desc }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0805] px-4 py-3.5">
    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
    <div className="text-[14px] text-white/95">{title}</div>
    {desc && <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{desc}</div>}
  </div>
);

export const Kpi = ({ label, value, desc, tone }) => (
  <div className="group relative overflow-hidden rounded-2xl bg-[#0a0805] border border-white/[0.07] px-4 py-4 min-w-0 transition-colors hover:border-gold-primary/25">
    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
    <div className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-text-muted">{label}</div>
    <div className={`font-mono tabular-nums mt-2 text-[26px] leading-none truncate ${tone || "text-white/95"}`}>{value}</div>
    {desc && <div className="text-[10px] text-text-muted mt-2 leading-relaxed">{desc}</div>}
  </div>
);

export const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-2.5 py-1.5 rounded-md font-mono text-[9.5px] uppercase tracking-wider border transition-colors ${
      active
        ? "bg-gold-primary text-[#17110a] border-gold-primary font-semibold shadow-sm shadow-gold-primary/20"
        : "bg-[#0c0a07] text-text-muted border-white/[0.1] hover:text-white hover:border-white/20"
    }`}
  >
    {children}
  </button>
);

export const IconBtn = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="w-6 h-6 flex items-center justify-center rounded-sm border border-white/[0.08] bg-white/[0.02] text-text-muted hover:text-gold-primary hover:border-gold-primary/30 transition-colors font-mono text-[11px] leading-none"
  >
    {children}
  </button>
);

// Allium-style dropdown multi-select chip
export function FilterMulti({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (v) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors ${
          selected.length
            ? "bg-gold-primary/20 border-gold-primary/45"
            : "bg-[#0c0a07] border-white/[0.1] hover:border-white/20"
        }`}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted">{label}</span>
        {selected.length === 0 ? (
          <span className="font-mono text-[10px] text-white/60">All</span>
        ) : (
          <>
            {selected.slice(0, 2).map((v) => (
              <span key={v} className="px-1.5 py-0.5 rounded-sm bg-gold-primary/15 text-gold-primary font-mono text-[9px]">
                {v}
              </span>
            ))}
            {selected.length > 2 && (
              <span className="font-mono text-[9px] text-gold-primary">+{selected.length - 2}</span>
            )}
          </>
        )}
        <svg className={`w-3 h-3 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M6 9 L12 15 L18 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 left-0 min-w-[180px] max-h-64 overflow-y-auto rounded-md bg-[#120809] border border-gold-primary/20 shadow-xl p-1.5">
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-2 py-1.5 rounded-sm font-mono text-[9.5px] uppercase tracking-wider text-negative/80 hover:bg-white/[0.04]"
              >
                × Clear
              </button>
            )}
            {options.map((o) => (
              <label key={o} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/[0.04] cursor-pointer">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="accent-[#d4a853] w-3 h-3" />
                <span className="font-mono text-[10.5px] text-white/80">{o}</span>
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
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      {label != null && <div className="text-white/50 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-sm" style={{ background: p.color || p.fill || GOLD }} />
          <span className="text-white/80">{p.name}:</span>
          <span className="text-white tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function ScatterTip({ active, payload, xLabel = "x", yLabel = "y" }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="text-white mb-0.5">{p.pair}</div>
      <div className="text-white/60">{xLabel}: <span className="text-white/90">{Number(p.x).toFixed(2)}</span></div>
      <div className="text-white/60">{yLabel}: <span className="text-white/90">{Number(p.y).toFixed(2)}</span></div>
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
            ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
            : "border-white/[0.06] text-text-muted hover:text-white"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-sm" style={{ background: e.color }} />
        {e.label} · {e.value}
      </button>
    ))}
  </div>
);

// expandable chart card (fullscreen) + optional zoom controls
export function XCard({ title, desc, render, zoom, hint }) {
  const { t } = useTranslation();
  const [big, setBig] = useState(false);
  const zoomBtns = zoom && (
    <>
      <IconBtn onClick={zoom.zoomOut} title="zoom out">−</IconBtn>
      <IconBtn onClick={zoom.zoomIn} title="zoom in">+</IconBtn>
      <IconBtn onClick={zoom.reset} title="reset">⟲</IconBtn>
    </>
  );
  const body = (h) => (
    <>
      <div onWheel={zoom?.onWheel}>{render(h)}</div>
      {hint && (
        <div className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70">{hint}</div>
      )}
    </>
  );
  return (
    <>
      <div className="relative rounded-2xl bg-[#0a0805] border border-white/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        <div className="px-4 py-2.5 bg-gold-primary/[0.05] border-b border-gold-primary/[0.12] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] text-white/90">{title}</div>
            {desc && <div className="text-[10px] text-text-muted mt-0.5 leading-relaxed">{desc}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {zoomBtns}
            <IconBtn onClick={() => setBig(true)} title={t("terminal.viz.expand")}>⤢</IconBtn>
          </div>
        </div>
        <div className="p-3">{body(240)}</div>
      </div>

      {big && (
        <div
          className="fixed inset-x-0 bottom-0 top-16 z-[60] bg-black/80 backdrop-blur-sm p-3 md:p-5 flex items-start justify-center"
          onClick={() => setBig(false)}
        >
          <div
            className="relative flex flex-col w-[94vw] max-w-[1600px] h-full max-h-[calc(100vh-5.5rem)] rounded-2xl bg-[#0a0805] border border-gold-primary/25 shadow-2xl shadow-black/60 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
            <div className="shrink-0 px-5 py-3.5 bg-gold-primary/[0.05] border-b border-gold-primary/[0.12] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] text-white/95">{title}</div>
                {desc && <div className="text-[11.5px] text-text-muted mt-0.5 leading-relaxed">{desc}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {zoomBtns}
                <IconBtn onClick={() => setBig(false)} title="close">✕</IconBtn>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-5 flex flex-col">
              <div className="flex-1 min-h-0">{body(Math.max(420, Math.round(window.innerHeight * 0.74)))}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// wheel/button zoom over fixed base domains (scatters)
export function useZoom(x0, x1, y0, y1) {
  const [scale, setScale] = useState(1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2 / scale, ry = (y1 - y0) / 2 / scale;
  return {
    domX: [cx - rx, cx + rx],
    domY: [cy - ry, cy + ry],
    zoomIn: () => setScale((s) => Math.min(10, s * 1.4)),
    zoomOut: () => setScale((s) => Math.max(1, s / 1.4)),
    reset: () => setScale(1),
    onWheel: (e) => {
      if (e.deltaY < 0) setScale((s) => Math.min(10, s * 1.15));
      else setScale((s) => Math.max(1, s / 1.15));
    },
  };
}

// coin pill: logo + pair. Hovering the NAME (not just the logo) shows signal
// status + when it was called; the logo carries the status dot + click-modal.
export const CoinPill = ({ pair, onPair, className = "" }) => {
  const ctx = useContext(SignalStatusContext);
  const info = ctx?.map && pair ? ctx.map[pair.toUpperCase()] : null;
  const meta = info ? (STATUS_META[info.status] || { label: (info.status || "—").toUpperCase(), color: "#9ca3af" }) : null;
  const ago = info ? timeAgo(info.created) : null;
  const tip = info ? `${pair} · ${meta.label}${ago ? ` · called ${ago}` : ""}` : pair;
  return (
    <button
      onClick={onPair ? () => onPair(pair) : undefined}
      className={`flex items-center gap-1.5 min-w-0 group ${className}`}
      title={tip}
    >
      <CoinLogo pair={pair} size={16} />
      <span className="font-mono text-[10.5px] text-white/85 group-hover:text-gold-primary truncate transition-colors">
        {pair}
      </span>
    </button>
  );
};

// ranked horizontal diverging bars with coin pills
export function RankBars({ data, fmt, suffix, onPair }) {
  if (!data.length)
    return <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">—</div>;
  const max = Math.max(...data.map((d) => Math.abs(d.v))) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d) => (
        <div key={d.pair} className="flex items-center gap-2">
          <span className="w-28 shrink-0"><CoinPill pair={d.pair} onPair={onPair} /></span>
          <span className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden relative">
            <span
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                width: `${(Math.abs(d.v) / max) * 50}%`,
                left: d.v >= 0 ? "50%" : `${50 - (Math.abs(d.v) / max) * 50}%`,
                background: d.color || (d.v >= 0 ? POS : NEG),
                opacity: 0.75,
              }}
            />
            <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/15" />
          </span>
          <span className={`w-20 shrink-0 text-right font-mono text-[10.5px] tabular-nums ${d.v >= 0 ? "text-positive" : "text-negative"}`}>
            {fmt ? fmt(d.v) : fmtPct(d.v)}{suffix || ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SectorBars({ data, dataKey, color, fmt, onPick, diverging = false }) {
  if (!data.length)
    return <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">—</div>;
  const max = Math.max(...data.map((d) => Math.abs(d[dataKey] || 0))) || 1;
  return (
    <div className="space-y-1.5 py-1">
      {data.map((d) => {
        const v = d[dataKey] || 0;
        const w = (Math.abs(v) / max) * 100;
        const c = color(v);
        return (
          <button key={d.sector} onClick={() => onPick(d.sector)} className="w-full flex items-center gap-2 group" title={d.sector}>
            <span className="w-28 shrink-0 flex items-center gap-1.5 text-left font-mono text-[10px] text-text-muted group-hover:text-white transition-colors">
              <SectorGlyph sector={d.sector} />
              <span className="truncate">{d.sector}</span>
            </span>
            <span className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden relative">
              {diverging ? (
                <span
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{ background: c, opacity: 0.75, left: v >= 0 ? "50%" : `${50 - w / 2}%`, width: `${w / 2}%` }}
                />
              ) : (
                <span className="absolute top-0 bottom-0 left-0 rounded-sm" style={{ background: c, opacity: 0.75, width: `${w}%` }} />
              )}
              {diverging && <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/15" />}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums" style={{ color: c }}>
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
            <Pie data={clean} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
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
    <div className="w-5 h-5 border border-gold-primary/25 border-t-gold-primary rounded-full animate-spin" />
    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted text-center leading-relaxed max-w-xs">{text}</span>
  </div>
);
