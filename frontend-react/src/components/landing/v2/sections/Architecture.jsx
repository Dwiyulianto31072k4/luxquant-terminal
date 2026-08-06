// src/components/landing/v2/sections/Architecture.jsx
// ════════════════════════════════════════════════════════════════
// How it works — clear pipeline that builds trust.
// LIVE DATA → SANITIZE → QUANT ENGINE → TERMINAL
//
// Design: Autopilot-style hierarchy (one story, open surfaces, less chrome).
// Desktop keeps the animated gold wire network; mobile is a readable
// vertical narrative with why-each-step-matters copy.
// ════════════════════════════════════════════════════════════════

import { useState, useLayoutEffect, useRef } from "react";

/* ── solid gold glyphs ── */
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
      <circle cx="12" cy="12" r="3.4" fill="rgb(var(--surface-raised))" />
    </>
  ),
  sanitizer: (
    <>
      <path
        fill="url(#lqGold)"
        d="M3.4 4.4h17.2a1 1 0 01.78 1.63L14.6 13.7v4.8a1 1 0 01-1.45.9l-2.9-1.45a1 1 0 01-.55-.9V13.7L2.62 6.03a1 1 0 01.78-1.63z"
        opacity="0.9"
      />
      <circle cx="18.6" cy="17.2" r="3.2" fill="url(#lqGold)" />
      <path
        d="M17.2 17.2l1 1 1.9-2.2"
        stroke="rgb(var(--surface-raised))"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  core: (
    <>
      <path fill="url(#lqGold)" opacity="0.22" d="M12 1.8l8.7 5v10.4L12 22.2 3.3 17.2V6.8z" />
      <path fill="url(#lqGold)" d="M12 6l5.1 2.95v5.9L12 17.8l-5.1-2.95v-5.9z" />
      <circle cx="12" cy="12" r="2.2" fill="rgb(var(--surface-raised))" />
      <circle cx="12" cy="12" r="1" fill="url(#lqGold)" />
    </>
  ),
  mSignals: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </g>
  ),
  mAi: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L21 21" />
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
      <path d="M9.25 7V4.5" />
      <circle cx="9.25" cy="3.4" r="0.85" />
      <circle cx="7" cy="11.3" r="1" />
      <circle cx="11.5" cy="11.3" r="1" />
      <path d="M3.5 11H2.2M15 11h1.3" />
      <circle cx="17.8" cy="17.3" r="2.1" />
    </g>
  ),
  mPerf: (
    <g fill="none" stroke="url(#lqGold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 6-6" />
      <path d="M17 8h4v4" />
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

function IconChip({ name, size = "h-10 w-10", ic = "h-[18px] w-[18px]" }) {
  return (
    <span
      className={`flex ${size} flex-shrink-0 items-center justify-center rounded-2xl bg-ink/[0.04]`}
    >
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

// Trust narrative — what each stage does (plain language, no jargon dump).
const STAGES = [
  {
    n: "01",
    id: "data",
    icon: "ohlc",
    title: "Live market data",
    lead: "We never invent prices.",
    body: "Multi-source feeds in real time — so every decision starts from what the market actually is.",
  },
  {
    n: "02",
    id: "sanitize",
    icon: "sanitizer",
    title: "Data sanitizer",
    lead: "Noise never reaches the model.",
    body: "Outliers, stale ticks, and exchange glitches filtered before scoring.",
  },
  {
    n: "03",
    id: "engine",
    icon: "core",
    title: "Predictive alpha",
    lead: "Only setups that clear the rules ship.",
    body: "Scored 24/7 against risk geometry — entry, targets, stop. No override after the fact.",
  },
  {
    n: "04",
    id: "terminal",
    icon: "mSignals",
    title: "Your terminal",
    lead: "Act on it. Audit every call.",
    body: "Every call lands with entry, TP & SL you can check — plus research and a public track record.",
  },
];

const TRUST_PILLS = [
  { k: "24/7", v: "engine, always on" },
  { k: "Timestamped", v: "every call on record" },
  { k: "Risk-defined", v: "entry · TP · SL" },
  { k: "Auditable", v: "public track record" },
];

const hideOnError = (e) => {
  e.currentTarget.style.display = "none";
};

const SURFACE = "rounded-[1.5rem] border border-ink/[0.06] bg-surface-raised/80";

/* ════════════════════ DESKTOP ════════════════════ */

function InputCard({ item }) {
  return (
    <div
      className={`group relative flex items-center gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-ink/[0.02] ${SURFACE}`}
    >
      <IconChip name={item.icon} size="h-10 w-10" ic="h-[18px] w-[18px]" />
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold tracking-tight text-text-primary">{item.title}</h4>
        <p className="mt-0.5 text-[12px] leading-tight text-text-muted">{item.desc}</p>
      </div>
      <span
        data-wire="in"
        aria-hidden="true"
        className="absolute -right-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent/80"
      />
    </div>
  );
}

function StageNode({ icon, title, subtitle, blurb, dataWire, accent = false }) {
  return (
    <div
      data-wire={dataWire}
      className={`relative flex min-h-[240px] w-full flex-col items-center justify-center px-5 py-8 text-center ${SURFACE} ${
        accent ? "ring-1 ring-accent/25" : ""
      }`}
    >
      <IconChip name={icon} size="h-14 w-14" ic="h-7 w-7" />
      <h3 className="mt-5 text-[15px] font-semibold tracking-tight text-text-primary">{title}</h3>
      <p className="mt-1 text-[12px] text-text-muted">{subtitle}</p>
      {blurb && (
        <p className="mt-4 max-w-[200px] text-[12.5px] leading-relaxed text-text-primary/55">
          {blurb}
        </p>
      )}
    </div>
  );
}

function TerminalPanel() {
  return (
    <div className={`w-full p-6 ${SURFACE}`}>
      <div className="flex items-center gap-2.5 pb-4">
        <img src="/logo.png" alt="" className="h-6 w-6 rounded-md" onError={hideOnError} />
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-text-primary">
            LuxQuant Terminal
          </p>
          <p className="text-[12px] text-text-muted">Where the call becomes action</p>
        </div>
      </div>
      <div className="divide-y divide-ink/[0.05]">
        {FEATURES.map((f) => (
          <div key={f.t} data-wire="out" className="flex items-center gap-3 py-3">
            <IconChip name={f.icon} size="h-9 w-9" ic="h-[16px] w-[16px]" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">{f.t}</p>
              <p className="truncate text-[12px] text-text-muted">{f.s}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-ink/[0.06] pt-4 text-[12px] text-text-muted">
        Plus Markets, Portfolio, Journal, News &amp; Calendar
      </p>
    </div>
  );
}

/* ════════════════════ ANIMATED GOLD LAYER ════════════════════ */

function EdgeArt({ side }) {
  const gid = `archEdgeGlow-${side}`;
  const sid = `archEdgeStream-${side}`;
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
      className={`pointer-events-none absolute top-[20%] bottom-[10%] z-0 hidden w-[min(13vw,230px)] opacity-[0.28] [mask-image:linear-gradient(to_right,#000_42%,transparent)] lg:block ${
        side === "left" ? "-left-2" : "-right-2 -scale-x-100"
      }`}
    >
      <svg viewBox="0 0 380 800" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <filter id={gid} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={sid} x1="0" x2="1">
            <stop offset="0" stopColor="#f7cf76" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffe9b0" stopOpacity="1" />
            <stop offset="1" stopColor="#e6a43d" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="none" strokeWidth="1.05">
          {TRACES.map((t, i) => (
            <path
              key={`b${i}`}
              stroke={t.dim ? "rgba(232,181,72,0.16)" : "rgba(232,181,72,0.30)"}
              d={t.d}
            />
          ))}
        </g>
        <g fill="none" strokeWidth="2.4" strokeLinecap="round" filter={`url(#${gid})`}>
          {TRACES.filter((t) => !t.dim).map((t, i) => (
            <path
              key={`s${i}`}
              stroke={`url(#${sid})`}
              d={t.d}
              strokeDasharray="14 230"
              style={{
                animation: "archEdgeFlow 3.4s linear infinite",
                animationDelay: `${t.delay}s`,
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function PipelineWires({ geo }) {
  if (!geo) return null;
  const { W, H, ins, outs, san, eng } = geo;
  const n = ins.length || 1;
  const entryY = (i) => san.top + (san.bot - san.top) * (n === 1 ? 0.5 : i / (n - 1));
  const inPath = (p, i) => {
    const ex = san.l.x;
    const ey = entryY(i);
    const c1 = p.x + (ex - p.x) * 0.55;
    const c2 = ex - (ex - p.x) * 0.45;
    return `M${p.x} ${p.y} C ${c1} ${p.y} ${c2} ${ey} ${ex} ${ey}`;
  };
  const outPath = (p) => {
    const sx = eng.r.x;
    const sy = eng.r.y;
    const c1 = sx + (p.x - sx) * 0.45;
    const c2 = p.x - (p.x - sx) * 0.55;
    return `M${sx} ${sy} C ${c1} ${sy} ${c2} ${p.y} ${p.x} ${p.y}`;
  };
  const beam = `M${san.r.x} ${san.r.y} L ${eng.l.x} ${eng.l.y}`;
  const Wire = ({
    d,
    w = 1.4,
    sw = 2.8,
    dash = "9 150",
    dur = 2.8,
    delay = 0,
    base = "rgba(239,187,84,0.32)",
  }) => (
    <g>
      <path d={d} fill="none" stroke={base} strokeWidth={w} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="url(#archStream)"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={dash}
        filter="url(#archGlow)"
        style={{ animation: `archDash ${dur}s linear infinite`, animationDelay: `${delay}s` }}
      />
    </g>
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="archStream" x1="0" x2="1">
          <stop offset="0" stopColor="#f7cf76" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffe4a0" stopOpacity="1" />
          <stop offset="1" stopColor="#e6a43d" stopOpacity="0" />
        </linearGradient>
        <filter id="archGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ins.map((p, i) => (
        <Wire
          key={`in${i}`}
          d={inPath(p, i)}
          sw={3}
          dash="10 150"
          dur={2.6}
          delay={i * 0.18}
          base="rgba(239,187,84,0.36)"
        />
      ))}
      <Wire d={beam} w={1.6} sw={3.2} dash="10 110" dur={2.4} base="rgba(239,187,84,0.42)" />
      {outs.map((p, i) => (
        <Wire key={`out${i}`} d={outPath(p)} dur={2.8} delay={i * 0.16} />
      ))}
    </svg>
  );
}

function useArchGeometry(wrapRef) {
  const [geo, setGeo] = useState(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
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
    const t = setTimeout(measure, 350);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [wrapRef]);
  return geo;
}

/* ── mobile accordion: clean when closed, visual + detail when opened ── */
function StepVisual({ stageId }) {
  if (stageId === "data") {
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {INPUTS.map((inp) => (
          <span
            key={inp.title}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-[11.5px] text-text-primary/80"
          >
            <Icon name={inp.icon} className="h-3.5 w-3.5" />
            {inp.title}
          </span>
        ))}
      </div>
    );
  }
  if (stageId === "sanitize") {
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Outliers", "Stale ticks", "Exchange glitches"].map((t) => (
          <span
            key={t}
            className="rounded-full border border-ink/[0.08] px-2.5 py-1 text-[11.5px] text-text-muted"
          >
            {t} · filtered
          </span>
        ))}
      </div>
    );
  }
  if (stageId === "engine") {
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "Entry", v: "Defined" },
          { k: "TP", v: "1–4" },
          { k: "SL", v: "Hard" },
        ].map((x) => (
          <div
            key={x.k}
            className="rounded-xl bg-ink/[0.04] px-2 py-2.5 text-center"
          >
            <p className="text-[10px] uppercase tracking-wide text-text-muted">{x.k}</p>
            <p className="mt-0.5 text-[13px] font-semibold text-accent">{x.v}</p>
          </div>
        ))}
      </div>
    );
  }
  if (stageId === "terminal") {
    return (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {FEATURES.slice(0, 4).map((f) => (
          <span
            key={f.t}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-[11.5px] text-text-primary/80"
          >
            <Icon name={f.icon} className="h-3.5 w-3.5" />
            {f.t}
          </span>
        ))}
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] text-text-muted">
          + more
        </span>
      </div>
    );
  }
  return null;
}

function MobileStory() {
  // First open by default so the section feels alive without clutter.
  const [openId, setOpenId] = useState("data");

  return (
    <div className="mx-auto max-w-md space-y-2 lg:hidden">
      <p className="mb-1 text-center text-[12px] text-text-muted">Tap a step to expand</p>
      {STAGES.map((s) => {
        const open = openId === s.id;
        return (
          <div
            key={s.id}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              open
                ? "border-accent/25 bg-surface-raised/90"
                : "border-ink/[0.06] bg-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : s.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 px-3.5 py-3.5 text-left"
            >
              <span
                className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${
                  open ? "bg-accent/15 text-accent" : "bg-ink/[0.05] text-accent/90"
                }`}
              >
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
                    {s.title}
                  </h3>
                  <svg
                    className={`h-4 w-4 flex-shrink-0 text-text-muted transition-transform duration-200 ${
                      open ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{s.lead}</p>
              </div>
            </button>

            {open && (
              <div className="border-t border-ink/[0.06] px-3.5 pb-4 pt-3">
                <div className="flex items-center gap-3">
                  <IconChip name={s.icon} size="h-11 w-11" ic="h-5 w-5" />
                  <p className="text-[13.5px] leading-relaxed text-text-primary/75">{s.body}</p>
                </div>
                <StepVisual stageId={s.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Architecture() {
  const pipeRef = useRef(null);
  const geo = useArchGeometry(pipeRef);

  return (
    <section
      id="how-it-works"
      className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:py-20 lg:px-8 lg:py-32"
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="lqGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0dca0" />
            <stop offset="0.5" stopColor="#d9b968" />
            <stop offset="1" stopColor="#b8893c" />
          </linearGradient>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-accent/[0.03] blur-[120px]"
      />

      <EdgeArt side="left" />
      <EdgeArt side="right" />

      {/* Hero — compact on mobile, full on desktop */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          How it works
        </p>
        <h2 className="mt-3 text-[1.85rem] font-semibold leading-[1.12] tracking-tight text-text-primary sm:mt-4 sm:text-5xl lg:text-[3.4rem]">
          From live data to a call{" "}
          <span className="text-accent">you can audit.</span>
        </h2>
        {/* Short line on mobile; full copy from sm up */}
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-snug text-text-muted sm:mt-5 sm:text-lg sm:leading-relaxed">
          <span className="sm:hidden">Data in → risk-defined call out. Every level timestamped.</span>
          <span className="hidden sm:inline">
            Four steps. No black box. Market data in, risk-defined calls out — every level
            timestamped so you can verify what happened.
          </span>
        </p>
      </div>

      {/* Trust pills — desktop only (too noisy on phone) */}
      <div className="mx-auto mt-12 hidden max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:flex">
        {TRUST_PILLS.map((p) => (
          <div key={p.k} className="flex items-baseline gap-1.5 text-[13px]">
            <span className="font-semibold text-text-primary">{p.k}</span>
            <span className="text-text-muted">{p.v}</span>
          </div>
        ))}
      </div>

      {/* DESKTOP pipeline */}
      <div className="relative mx-auto mt-16 hidden w-full max-w-[1320px] lg:mt-20 lg:block">
        <div
          ref={pipeRef}
          className="relative grid items-center gap-5 xl:gap-7"
          style={{
            gridTemplateColumns:
              "minmax(260px,300px) minmax(160px,190px) minmax(200px,240px) minmax(320px,1fr)",
          }}
        >
          <PipelineWires geo={geo} />
          <div className="relative z-10 flex flex-col gap-2.5">
            <p className="mb-1 ml-1 text-[12px] font-medium text-text-muted">Live market data</p>
            {INPUTS.map((i) => (
              <InputCard key={i.title} item={i} />
            ))}
          </div>
          <div className="relative z-10">
            <StageNode
              icon="sanitizer"
              title="Data sanitizer"
              subtitle="Clean inputs only"
              blurb="Filters noise before the model scores a setup."
              dataWire="sanitizer"
            />
          </div>
          <div className="relative z-10">
            <StageNode
              icon="core"
              title="Predictive alpha"
              subtitle="Quant engine · 24/7"
              blurb="Only risk-cleared setups become public calls."
              dataWire="engine"
              accent
            />
          </div>
          <div className="relative z-10">
            <TerminalPanel />
          </div>
        </div>

        {/* Desktop caption under pipeline — reinforces understanding */}
        <div className="mt-12 grid grid-cols-4 gap-6 border-t border-ink/[0.06] pt-10">
          {STAGES.map((s) => (
            <div key={s.id}>
              <p className="text-[11px] font-semibold tabular-nums tracking-wide text-accent">
                {s.n}
              </p>
              <p className="mt-2 text-[14px] font-semibold tracking-tight text-text-primary">
                {s.title}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">{s.lead}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MOBILE — tight 4-step list only */}
      <div className="mt-10 sm:mt-12 lg:hidden">
        <MobileStory />
      </div>

      <style>{`
 @keyframes archDash { to { stroke-dashoffset: -160; } }
 @keyframes archEdgeFlow { from { stroke-dashoffset: 244; } to { stroke-dashoffset: -244; } }
 @media (prefers-reduced-motion: reduce) {
 [style*="archDash"], [style*="archEdgeFlow"] { animation: none !important; }
 }
 `}</style>
    </section>
  );
}
