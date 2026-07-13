// src/components/landing/v2/sections/Architecture.jsx
// ════════════════════════════════════════════════════════════════
// SECTION — Quantitative Pipeline (timeless / solid).
//   LIVE MARKET DATA → DATA SANITIZER → PREDICTIVE ALPHA → TERMINAL
//
// Redesigned: flat solid cards, hairline borders, static connectors,
// solid gold icons — no glow, no animated wires, no PCB art. Reads clean
// like the Top-Gainers cards. Desktop row + mobile numbered stepper.
// ════════════════════════════════════════════════════════════════

/* ── solid gold glyphs (data sources + nodes) ── */
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
    </>
  ),
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
    <span className={`flex ${size} flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035]`}>
      <Icon name={name} className={ic} />
    </span>
  );
}

const Chevron = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const Connector = () => (
  <span className="hidden shrink-0 items-center xl:flex" aria-hidden="true">
    <span className="h-px w-5 bg-white/[0.12]" />
    <Chevron className="h-4 w-4 text-white/25" />
  </span>
);

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

const CARD = "rounded-2xl border border-white/[0.08] bg-[#0d0b09]";

/* ════════════════════ DESKTOP PIECES ════════════════════ */

function InputCard({ item }) {
  return (
    <div className={`group flex items-center gap-3 p-3.5 transition-colors duration-200 hover:border-white/20 ${CARD}`}>
      <IconChip name={item.icon} size="h-11 w-11" ic="h-[20px] w-[20px]" />
      <div className="min-w-0">
        <h4 className="text-[12.5px] font-semibold uppercase tracking-wide text-white">{item.title}</h4>
        <p className="mt-0.5 whitespace-nowrap text-[11px] leading-tight text-text-muted">{item.desc}</p>
      </div>
      <Chevron className="ml-auto h-4 w-4 flex-shrink-0 text-white/25 transition-colors group-hover:text-gold-primary/70" />
    </div>
  );
}

function StageNode({ icon, title, subtitle, accent = false }) {
  return (
    <div className={`flex min-h-[220px] w-[190px] flex-col items-center justify-center px-5 text-center ${CARD} ${accent ? "border-gold-primary/25" : ""}`}>
      <IconChip name={icon} size="h-14 w-14" ic="h-7 w-7" />
      <h3 className="mt-4 text-[13.5px] font-semibold uppercase tracking-[0.08em] text-white">{title}</h3>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">{subtitle}</p>
    </div>
  );
}

function TerminalPanel() {
  return (
    <div className={`w-[360px] p-5 ${CARD}`}>
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] pb-4">
        <img src="/logo.png" alt="" className="h-6 w-6 rounded" onError={hideOnError} />
        <span className="text-[13px] font-semibold tracking-[0.13em] text-white">LUXQUANT TERMINAL</span>
      </div>
      <div className="mt-3 divide-y divide-white/[0.05]">
        {FEATURES.map((f) => (
          <div key={f.t} className="group flex items-center gap-3 py-2.5 transition-colors">
            <IconChip name={f.icon} size="h-9 w-9" ic="h-[18px] w-[18px]" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">{f.t}</p>
              <p className="truncate text-[11px] text-text-muted">{f.s}</p>
            </div>
            <Chevron className="ml-auto h-4 w-4 flex-shrink-0 text-white/25 transition-colors group-hover:text-gold-primary/70" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="text-[10.5px] text-text-muted">Markets · Portfolio · Journal · News · Calendar</span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-gold-primary/90">
          &amp; more <Chevron className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

/* ── mobile stepper ── */
function Step({ n, accent = false, line = true, children }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border bg-[#0d0b09] font-mono text-[13px] font-medium ${accent ? "border-gold-primary/40 text-gold-primary" : "border-white/15 text-white/55"}`}>{n}</span>
        {line && <span className="my-1.5 w-px flex-1 bg-white/10" />}
      </div>
      <div className="flex-1 pb-6">{children}</div>
    </li>
  );
}

export default function Architecture() {
  return (
    <section id="how-it-works" className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-6 pb-20 lg:px-8 lg:pt-10 lg:pb-28">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="lqGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0dca0" /><stop offset="0.5" stopColor="#d9b968" /><stop offset="1" stopColor="#b8893c" />
          </linearGradient>
        </defs>
      </svg>

      {/* header */}
      <div className="mb-14 text-center lg:mb-20">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">
          <span className="h-px w-7 bg-gold-primary/40" />
          How It Works
          <span className="h-px w-7 bg-gold-primary/40" />
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-white lg:text-5xl">
          From market data to <span className="text-gold-primary">your terminal</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
          A 24/7 quant engine turns live market data into precise calls — and a complete trading terminal you can act on.
        </p>
      </div>

      {/* DESKTOP — clean solid pipeline */}
      <div className="mx-auto hidden w-full max-w-[1320px] items-center justify-center gap-4 lg:flex xl:gap-6">
        <div className="flex w-[300px] shrink-0 flex-col gap-2.5">
          <p className="mb-1 ml-1 font-mono text-[10px] uppercase tracking-[0.29em] text-gold-primary/75">Live Market Data</p>
          {INPUTS.map((i) => <InputCard key={i.title} item={i} />)}
        </div>
        <Connector />
        <StageNode icon="sanitizer" title="Data Sanitizer" subtitle="Sanitization" />
        <Connector />
        <StageNode icon="core" title="Predictive Alpha" subtitle="Quant Engine" accent />
        <Connector />
        <TerminalPanel />
      </div>

      {/* MOBILE — compact vertical stepper */}
      <ol className="mx-auto max-w-md lg:hidden">
        <Step n={1}>
          <div className={`p-4 ${CARD}`}>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-white">Live Market Data</p>
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
          <div className={`flex items-center gap-3 p-3.5 ${CARD}`}>
            <IconChip name="sanitizer" />
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wide text-white">Data Sanitizer</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Sanitization</p>
            </div>
          </div>
        </Step>

        <Step n={3} accent>
          <div className={`flex items-center gap-3 p-3.5 ${CARD} border-gold-primary/25`}>
            <IconChip name="core" />
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wide text-white">Predictive Alpha</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Quant Engine</p>
            </div>
          </div>
        </Step>

        <Step n={4} line={false}>
          <div className={`p-4 ${CARD}`}>
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
              <img src="/logo.png" alt="" className="h-5 w-5 rounded" onError={hideOnError} />
              <span className="text-[12px] font-medium uppercase tracking-wide text-white">LuxQuant Terminal</span>
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
    </section>
  );
}
