// src/components/landing/v2/sections/Architecture.jsx
// ════════════════════════════════════════════════════════════════
// SECTION — Quantitative Pipeline.
//   LIVE MARKET DATA → DATA SANITIZER → PREDICTIVE ALPHA → TERMINAL
//
// Desktop: premium pipeline (animated gold connectors, orbited engine,
// terminal panel) — ported from the reference, recoloured to LuxQuant
// gold (no violet). Mobile: compact numbered stepper.
// Terminal-feature icons match the More menu for consistency.
// ════════════════════════════════════════════════════════════════

import { useState, useLayoutEffect, useRef } from "react";

/* ── filled gold glyphs (data sources + nodes) ── */
const ICONS = {
  ohlc: (
    <g fill="url(#lqGold)">
      <rect x="5.2" y="3.5" width="1" height="17" rx="0.5" />
      <rect x="3.4" y="7.5" width="4.6" height="8.5" rx="1.3" />
      <rect x="15.8" y="2.8" width="1" height="18.4" rx="0.5" />
      <rect x="14" y="6.5" width="4.6" height="9.5" rx="1.3" />
    </g>
  ),
  depth: (
    <g fill="url(#lqGold)">
      <rect x="3" y="3.5" width="12" height="2.7" rx="1.35" />
      <rect x="3" y="8.8" width="18" height="2.7" rx="1.35" />
      <rect x="3" y="14.1" width="9" height="2.7" rx="1.35" />
      <rect x="3" y="19.4" width="15" height="2.7" rx="1.35" />
    </g>
  ),
  deriv: (
    <g fill="url(#lqGold)">
      <rect x="4" y="7.5" width="11" height="11" rx="2.6" opacity="0.4" />
      <rect x="9" y="4.5" width="11" height="11" rx="2.6" />
    </g>
  ),
  chain: (
    <>
      <g stroke="url(#lqGold)" strokeWidth="1.9" fill="none" strokeLinecap="round">
        <path d="M8 6h8M7.6 8.4l3 7.2M16.4 8.4l-3 7.2" />
      </g>
      <g fill="url(#lqGold)">
        <circle cx="6" cy="6" r="2.7" />
        <circle cx="18" cy="6" r="2.7" />
        <circle cx="12" cy="18" r="2.9" />
      </g>
    </>
  ),
  volatility: <path fill="url(#lqGold)" d="M3 21V15l4-5 3.2 4L14 6l4 7 3-3v11z" />,
  dominance: (
    <>
      <circle cx="12" cy="12" r="8.2" fill="url(#lqGold)" opacity="0.3" />
      <path fill="url(#lqGold)" d="M12 3.8a8.2 8.2 0 017.72 5.4L12 12z" />
      <circle cx="12" cy="12" r="3.4" fill="#0c0807" />
    </>
  ),

  /* refined node icons */
  sanitizer: (
    <>
      <path fill="url(#lqGold)" d="M3.4 4.4h17.2a1 1 0 01.78 1.63L14.6 13.7v4.8a1 1 0 01-1.45.9l-2.9-1.45a1 1 0 01-.55-.9V13.7L2.62 6.03a1 1 0 01.78-1.63z" opacity="0.9" />
      <circle cx="18.6" cy="17.2" r="3.2" fill="url(#lqGold)" />
      <path d="M17.2 17.2l1 1 1.9-2.2" stroke="#0c0807" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  core: (
    <>
      <path fill="url(#lqGold)" opacity="0.22" d="M12 1.8l8.7 5v10.4L12 22.2 3.3 17.2V6.8z" />
      <path fill="url(#lqGold)" d="M12 6l5.1 2.95v5.9L12 17.8l-5.1-2.95v-5.9z" />
      <circle cx="12" cy="12" r="2.2" fill="#0c0807" />
      <circle cx="12" cy="12" r="1" fill="url(#lqGold)" />
      <circle cx="12" cy="3.9" r="0.85" fill="url(#lqGold)" />
      <circle cx="19.2" cy="16.4" r="0.85" fill="url(#lqGold)" />
      <circle cx="4.8" cy="16.4" r="0.85" fill="url(#lqGold)" />
    </>
  ),

  /* terminal features — match the More menu (gold stroke) */
  mSignals: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </g>
  ),
  mAi: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6" /><path d="M15.5 15.5L21 21" />
      <path d="M11 8.5v5M8.5 11h5" strokeOpacity="0.55" />
    </g>
  ),
  mFlow: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
      <path d="M3 14c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
    </g>
  ),
  mBell: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a5 5 0 00-5 5c0 4.5-2 6-2 6h14s-2-1.5-2-6a5 5 0 00-5-5z" />
      <path d="M10 19a2 2 0 004 0" />
    </g>
  ),
  mAgent: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="7" width="11.5" height="9.5" rx="2.5" />
      <path d="M9.25 7V4.5" /><circle cx="9.25" cy="3.4" r="0.85" />
      <circle cx="7" cy="11.3" r="1" /><circle cx="11.5" cy="11.3" r="1" />
      <path d="M3.5 11H2.2M15 11h1.3" />
      <circle cx="17.8" cy="17.3" r="2.1" />
      <path d="M17.8 14.6v0.8M17.8 20v-0.8M15.1 17.3h0.8M20.5 17.3h-0.8M16 15.5l0.55 0.55M19.6 19.1l-0.55-0.55M19.6 15.5l-0.55 0.55M16 19.1l0.55-0.55" />
    </g>
  ),
  mPerf: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 6-6" /><path d="M17 8h4v4" />
    </g>
  ),
};

function Icon({ name, className = "h-[18px] w-[18px]" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function IconChip({ name, size = "h-9 w-9", ic = "h-[18px] w-[18px]" }) {
  return (
    <span className={`flex ${size} flex-shrink-0 items-center justify-center rounded-xl border border-gold-primary/25 bg-gradient-to-br from-gold-primary/[0.16] to-gold-primary/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`}>
      <Icon name={name} className={ic} />
    </span>
  );
}

const INPUTS = [
  { icon: "ohlc", title: "Price & Volume", desc: "OHLCV · all timeframes" },
  { icon: "depth", title: "Order Book Depth", desc: "Bid / ask liquidity" },
  { icon: "deriv", title: "Derivatives", desc: "Funding · OI · liquidations" },
  { icon: "chain", title: "On-Chain Flows", desc: "Whale transfers & netflows" },
  { icon: "volatility", title: "Volatility", desc: "ATR & Bollinger" },
  { icon: "dominance", title: "Market Breadth", desc: "BTC dominance & correlation" },
];

const FEATURES = [
  { icon: "mSignals", t: "Algo Calls", s: "Entry, TP & SL on every call" },
  { icon: "mAi", t: "AI Research", s: "BTC Compass regime reads" },
  { icon: "mFlow", t: "Money Flow", s: "Where capital is rotating" },
  { icon: "mBell", t: "On-Chain Alerts", s: "Whale moves, in real time" },
  { icon: "mAgent", t: "Agent", s: "Executes & manages your trades" },
  { icon: "mPerf", t: "Verified Performance", s: "Full, timestamped track record" },
];

const hideOnError = (e) => { e.currentTarget.style.display = "none"; };

/* ════════════════════ DESKTOP PIECES ════════════════════ */

function InputCard({ item }) {
  return (
    <div
      className="group relative flex items-center gap-3 rounded-2xl border border-white/[0.08] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_28px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-primary/40 hover:shadow-[0_14px_34px_rgba(0,0,0,0.3),0_0_24px_rgba(212,168,83,0.08)]"
      style={{ background: "linear-gradient(102deg,rgba(255,255,255,0.025),rgba(255,255,255,0.002)),#0c0908" }}
    >
      <IconChip name={item.icon} size="h-11 w-11" ic="h-[20px] w-[20px]" />
      <div className="min-w-0">
        <h4 className="text-[12.5px] font-extrabold uppercase tracking-wide text-white">{item.title}</h4>
        <p className="mt-0.5 whitespace-nowrap text-[11px] leading-tight text-text-muted">{item.desc}</p>
      </div>
      <span className="ml-auto text-[17px] tracking-[-6px] text-gold-primary/45">»»</span>
      {/* output node dot — wire anchor */}
      <span data-wire="in" aria-hidden="true" className="absolute -right-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#ffdb7b] shadow-[0_0_0_4px_rgba(245,192,78,0.11),0_0_14px_rgba(255,210,103,0.8)]" />
    </div>
  );
}

function FilterNode() {
  return (
    <div
      data-wire="sanitizer"
      className="relative flex min-h-[224px] flex-col items-center justify-center overflow-hidden rounded-[26px] border border-gold-primary/50 px-5 text-center shadow-[inset_0_1px_0_rgba(255,242,206,0.18),0_28px_60px_rgba(0,0,0,0.43),0_0_52px_rgba(207,128,36,0.14)]"
      style={{ background: "radial-gradient(circle at 50% 14%,rgba(252,205,99,0.16),transparent 40%),linear-gradient(145deg,rgba(55,37,21,0.97),rgba(14,10,8,0.96) 58%,rgba(7,5,4,0.96))" }}
    >
      {/* dotted inner panel */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-[20px] border border-white/[0.08] opacity-40 [background-image:radial-gradient(rgba(236,185,79,0.38)_0.75px,transparent_0.85px)] [background-size:7px_7px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.72),transparent_72%)]" />
      {/* scan sweep */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-gold-primary/20 to-transparent" style={{ animation: "archScan 4s linear infinite" }} />
      <span className="relative z-10">
        <IconChip name="sanitizer" size="h-[58px] w-[58px]" ic="h-7 w-7" />
      </span>
      <h3 className="relative z-10 mt-4 text-[13.5px] font-extrabold uppercase tracking-[0.1em] text-white">Data Sanitizer</h3>
      <p className="relative z-10 mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-gold-primary/80">Sanitization</p>
    </div>
  );
}

function EngineNode() {
  return (
    <div className="relative flex min-h-[260px] items-center justify-center">
      {/* soft glow (no rings) */}
      <span aria-hidden="true" className="pointer-events-none absolute h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.16),transparent_64%)] blur-[16px]" />
      {/* horizontal energy beam through the core */}
      <span aria-hidden="true" className="pointer-events-none absolute h-[2px] w-[150%] bg-[linear-gradient(90deg,transparent,#f5c35e_18%,#fff0bd_48%,#e7c373_78%,transparent)] opacity-70 shadow-[0_0_22px_rgba(236,183,75,0.7)]" />

      {/* core card */}
      <div
        data-wire="engine"
        className="relative flex h-[206px] w-[188px] flex-col items-center justify-center overflow-hidden rounded-[26px] border border-gold-primary/30 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_30px_70px_rgba(0,0,0,0.5),0_0_64px_rgba(229,174,61,0.16)]"
        style={{ background: "radial-gradient(circle at 50% 18%,rgba(247,227,166,0.16),transparent 40%),linear-gradient(145deg,rgba(47,32,18,0.99),rgba(17,12,9,0.98) 55%,rgba(9,7,6,0.99))" }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-[20px] border border-gold-primary/25" />
        <span aria-hidden="true" className="pointer-events-none absolute -top-2.5 left-1/2 h-8 w-36 -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(251,207,104,0.7),transparent_66%)] opacity-60 blur-[10px]" />
        <span className="relative z-10">
          <IconChip name="core" size="h-16 w-16" ic="h-8 w-8" />
        </span>
        <h3 className="relative z-10 mt-4 text-[14px] font-extrabold tracking-tight text-white">Predictive Alpha</h3>
        <p className="relative z-10 mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/70">Quant Engine</p>
      </div>
    </div>
  );
}

function TerminalPanel() {
  return (
    <div
      className="relative overflow-hidden rounded-[26px] border border-gold-primary/50 p-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_36px_80px_rgba(0,0,0,0.55),0_0_44px_rgba(232,184,87,0.1)]"
      style={{ background: "radial-gradient(circle at 72% -4%,rgba(231,189,98,0.14),transparent 30%),linear-gradient(145deg,rgba(27,20,15,0.98),rgba(8,7,6,0.99))" }}
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
        <img src="/logo.png" alt="" className="h-6 w-6 rounded" onError={hideOnError} />
        <span className="text-[13px] font-extrabold tracking-[0.13em] text-white">LUXQUANT TERMINAL</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {FEATURES.map((f) => (
          <div key={f.t} data-wire="out" className="group relative flex items-center gap-3 overflow-hidden rounded-[14px] border border-white/[0.06] bg-white/[0.012] px-3 py-2.5 transition-all duration-300 hover:border-gold-primary/30 hover:bg-white/[0.03]">
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-gold-light to-gold-primary opacity-0 transition-opacity duration-300 group-hover:opacity-90" />
            <IconChip name={f.icon} size="h-9 w-9" ic="h-[18px] w-[18px]" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white">{f.t}</p>
              <p className="truncate text-[11px] text-text-muted">{f.s}</p>
            </div>
            <svg className="ml-auto h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-gold-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ))}

        <div className="group flex items-center justify-between rounded-[14px] border border-dashed border-white/[0.12] px-3 py-3 transition-colors hover:border-gold-primary/30">
          <span className="text-[10.5px] text-text-muted">Markets · Portfolio · Journal · News · Calendar</span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-gold-primary">
            &amp; more
            <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

/* decorative circuit art on the far edges (desktop only) — gold, both sides.
   Ported from the reference PCB-trace art and recoloured to LuxQuant gold
   (reference used violet on the right; here both edges stay gold). */
function EdgeArt({ side }) {
  const gid = `archEdgeGlow-${side}`;
  const sid = `archEdgeStream-${side}`;
  // animated traces (the brighter ones) carry a flowing light pulse
  const TRACES = [
    { d: "M-10 80H112l23 22h115l38 40h118", dim: true },
    { d: "M-20 110h92l42 43h82l42 44h144", delay: 0.0 },
    { d: "M-20 160h74l24 25h96l35 36h155", dim: true },
    { d: "M-10 246h115l32 33h58l42 42h138", delay: 0.9 },
    { d: "M-18 325h69l42 43h90l24 25h161", dim: true },
    { d: "M-13 518h86l33-34h78l39-40h151", delay: 1.8 },
    { d: "M-14 604h111l28-27h62l33-32h148", dim: true },
    { d: "M-15 690h96l38-38h92l25-26h131", delay: 2.6 },
  ];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-[20%] bottom-[10%] z-0 hidden w-[min(13vw,230px)] opacity-[0.4] [mask-image:linear-gradient(to_right,#000_42%,transparent)] lg:block ${side === "left" ? "-left-2" : "-right-2 -scale-x-100"}`}
    >
      <svg viewBox="0 0 380 800" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <filter id={gid} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id={sid} x1="0" x2="1">
            <stop offset="0" stopColor="#f7cf76" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffe9b0" stopOpacity="1" />
            <stop offset="1" stopColor="#e6a43d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* static base traces */}
        <g fill="none" strokeWidth="1.05">
          {TRACES.map((t, i) => (
            <path key={`b${i}`} stroke={t.dim ? "rgba(232,181,72,0.16)" : "rgba(232,181,72,0.30)"} d={t.d} />
          ))}
        </g>
        {/* flowing light pulse along the brighter traces */}
        <g fill="none" strokeWidth="2.4" strokeLinecap="round" filter={`url(#${gid})`}>
          {TRACES.filter((t) => !t.dim).map((t, i) => (
            <path
              key={`s${i}`}
              stroke={`url(#${sid})`}
              d={t.d}
              strokeDasharray="14 230"
              style={{ animation: "archEdgeFlow 3.4s linear infinite", animationDelay: `${t.delay}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* animated gold connector network — measured from real DOM anchors so every
   wire connects EXACTLY: card dots → sanitizer left edge, sanitizer → engine,
   engine → each terminal row. Pixel-accurate (viewBox = container px), so it
   never drifts across breakpoints. `geo` comes from useArchGeometry(). */
function PipelineWires({ geo }) {
  if (!geo) return null;
  const { W, H, ins, outs, san, eng } = geo;
  const n = ins.length || 1;

  // entry points spread along the sanitizer's left edge (multi-port in-feed)
  const entryY = (i) =>
    san.top + (san.bot - san.top) * (n === 1 ? 0.5 : i / (n - 1));

  const inPath = (p, i) => {
    const ex = san.l.x, ey = entryY(i);
    const c1 = p.x + (ex - p.x) * 0.55; // leave the card horizontally
    const c2 = ex - (ex - p.x) * 0.45; // approach the node horizontally
    return `M${p.x} ${p.y} C ${c1} ${p.y} ${c2} ${ey} ${ex} ${ey}`;
  };
  const outPath = (p) => {
    const sx = eng.r.x, sy = eng.r.y;
    const c1 = sx + (p.x - sx) * 0.45;
    const c2 = p.x - (p.x - sx) * 0.55;
    return `M${sx} ${sy} C ${c1} ${sy} ${c2} ${p.y} ${p.x} ${p.y}`;
  };
  const beam = `M${san.r.x} ${san.r.y} L ${eng.l.x} ${eng.l.y}`;

  const Wire = ({ d, w = 1.4, sw = 2.8, dash = "9 150", dur = 2.8, delay = 0, base = "rgba(239,187,84,0.36)" }) => (
    <g>
      <path d={d} fill="none" stroke={base} strokeWidth={w} strokeLinecap="round" />
      <path d={d} fill="none" stroke="url(#archStream)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} filter="url(#archGlow)" style={{ animation: `archDash ${dur}s linear infinite`, animationDelay: `${delay}s` }} />
    </g>
  );

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="archStream" x1="0" x2="1">
          <stop offset="0" stopColor="#f7cf76" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffe4a0" stopOpacity="1" />
          <stop offset="1" stopColor="#e6a43d" stopOpacity="0" />
        </linearGradient>
        <filter id="archGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* inputs → sanitizer */}
      {ins.map((p, i) => <Wire key={`in${i}`} d={inPath(p, i)} sw={3} dash="10 150" dur={2.6} delay={i * 0.18} base="rgba(239,187,84,0.4)" />)}
      {/* sanitizer → engine */}
      <Wire d={beam} w={1.6} sw={3.2} dash="10 110" dur={2.4} base="rgba(239,187,84,0.45)" />
      {/* engine → terminal rows */}
      {outs.map((p, i) => <Wire key={`out${i}`} d={outPath(p)} dur={2.8} delay={i * 0.16} />)}
    </svg>
  );
}

/* measure DOM anchors relative to the pipeline wrapper (re-runs on resize) */
function useArchGeometry(wrapRef) {
  const [geo, setGeo] = useState(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const cr = wrap.getBoundingClientRect();
      if (!cr.width) return;
      const pt = (el, fx, fy) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - cr.left + r.width * fx, y: r.top - cr.top + r.height * fy };
      };
      const inEls = [...wrap.querySelectorAll('[data-wire="in"]')];
      const outEls = [...wrap.querySelectorAll('[data-wire="out"]')];
      const sanEl = wrap.querySelector('[data-wire="sanitizer"]');
      const engEl = wrap.querySelector('[data-wire="engine"]');
      if (!sanEl || !engEl || !inEls.length || !outEls.length) return;
      const sr = sanEl.getBoundingClientRect();
      setGeo({
        W: cr.width,
        H: cr.height,
        ins: inEls.map((el) => pt(el, 0.5, 0.5)),
        outs: outEls.map((el) => pt(el, 0, 0.5)),
        san: {
          l: pt(sanEl, 0, 0.5),
          r: pt(sanEl, 1, 0.5),
          top: sr.top - cr.top + sr.height * 0.16,
          bot: sr.top - cr.top + sr.height * 0.84,
        },
        eng: { l: pt(engEl, 0, 0.5), r: pt(engEl, 1, 0.5) },
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 350); // re-measure after fonts/images settle
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [wrapRef]);
  return geo;
}

/* ── mobile stepper ── */
function Step({ n, gold = false, line = true, children }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border bg-[#0c0807] font-mono text-[13px] font-bold ${gold ? "border-gold-primary/50 text-gold-primary shadow-[0_0_16px_rgba(212,168,83,0.3)]" : "border-white/15 text-white/55"}`}>{n}</span>
        {line && <span className="my-1.5 w-px flex-1 bg-gradient-to-b from-white/15 to-white/[0.04]" />}
      </div>
      <div className="flex-1 pb-6">{children}</div>
    </li>
  );
}

export default function Architecture() {
  const pipeRef = useRef(null);
  const geo = useArchGeometry(pipeRef);
  return (
    <section id="how-it-works" className="relative z-10 mx-auto -mt-10 w-full max-w-7xl px-4 pt-6 pb-20 lg:-mt-16 lg:px-8 lg:pt-10 lg:pb-28">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="lqGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7e3a6" /><stop offset="0.45" stopColor="#e7c373" /><stop offset="1" stopColor="#b8893c" />
          </linearGradient>
        </defs>
      </svg>

      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-gold-primary/[0.04] blur-[120px]" />

      {/* decorative PCB-trace art on the far edges (desktop only) */}
      <EdgeArt side="left" />
      <EdgeArt side="right" />

      {/* header */}
      <div className="mb-14 text-center lg:mb-20">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/75">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/55" />
          How It Works
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-gold-primary/55" />
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-white lg:text-5xl">
          From market data to{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b] bg-clip-text text-transparent">your terminal</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
          A 24/7 quant engine turns live market data into precise calls — and a complete trading terminal you can act on.
        </p>
      </div>

      {/* DESKTOP — premium pipeline */}
      <div className="relative mx-auto hidden w-full max-w-[1320px] lg:block">
        <div ref={pipeRef} className="relative grid items-center gap-6 xl:gap-9" style={{ gridTemplateColumns: "minmax(280px,310px) minmax(150px,176px) minmax(250px,300px) minmax(340px,1fr)" }}>
          <PipelineWires geo={geo} />
          <div className="relative z-10 flex flex-col gap-3">
            <p className="mb-1 ml-1 font-mono text-[10px] uppercase tracking-[0.29em] text-gold-primary/80">Live Market Data</p>
            {INPUTS.map((i) => <InputCard key={i.title} item={i} />)}
          </div>
          <div className="relative z-10"><FilterNode /></div>
          <div className="relative z-10"><EngineNode /></div>
          <div className="relative z-10"><TerminalPanel /></div>
        </div>
      </div>

      {/* MOBILE — compact vertical stepper */}
      <ol className="mx-auto max-w-md lg:hidden">
        <Step n={1}>
          <div className="rounded-xl border border-white/[0.08] bg-[#0c0807] p-4">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-white">Live Market Data</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {INPUTS.map((i) => (
                <div key={i.title} className="flex items-center gap-2">
                  <Icon name={i.icon} className="h-4 w-4 flex-shrink-0" />
                  <span className="text-[11px] leading-tight text-white/75">{i.title}</span>
                </div>
              ))}
            </div>
          </div>
        </Step>

        <Step n={2}>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0c0807] p-3.5">
            <IconChip name="sanitizer" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-white">Data Sanitizer</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Sanitization</p>
            </div>
          </div>
        </Step>

        <Step n={3} gold>
          <div className="flex items-center gap-3 rounded-xl border border-gold-primary/25 bg-[#0c0807] p-3.5 shadow-[0_0_34px_-14px_rgba(212,168,83,0.5)]">
            <IconChip name="core" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-white">Predictive Alpha</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-gold-primary/60">Quant Engine</p>
            </div>
          </div>
        </Step>

        <Step n={4} line={false}>
          <div className="rounded-xl border border-gold-primary/20 bg-[#0c0807] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
              <img src="/logo.png" alt="" className="h-5 w-5 rounded" onError={hideOnError} />
              <span className="text-[12px] font-bold uppercase tracking-wide text-white">LuxQuant Terminal</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {FEATURES.map((f) => (
                <div key={f.t} className="flex items-center gap-2">
                  <Icon name={f.icon} className="h-4 w-4 flex-shrink-0" />
                  <span className="text-[11px] leading-tight text-white/75">{f.t}</span>
                </div>
              ))}
            </div>
            <p className="mt-3.5 border-t border-white/[0.06] pt-3 text-[11px] font-medium text-gold-primary/85">+ Markets, Portfolio, Journal &amp; more</p>
          </div>
        </Step>
      </ol>

      <style>{`
        @keyframes archDash { to { stroke-dashoffset: -160; } }
        @keyframes archEdgeFlow { from { stroke-dashoffset: 244; } to { stroke-dashoffset: -244; } }
        @keyframes archScan { 0% { transform: translateY(-120%); } 100% { transform: translateY(420%); } }
        @keyframes archSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          [style*="archDash"], [style*="archEdgeFlow"], [style*="archScan"], [style*="archSpin"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
