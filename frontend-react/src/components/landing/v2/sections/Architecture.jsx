// src/components/landing/v2/sections/Architecture.jsx
// ════════════════════════════════════════════════════════════════
// SECTION — Quantitative Pipeline (clean).
//
//   MARKET DATA  →  DATA FILTER  →  PREDICTIVE ALPHA  →  TERMINAL
//
// Engine = clean centerpiece. Output = the LuxQuant terminal with
// its real features. Solid gold-gradient (3D-ish) SVG glyphs, white
// + gold theme. No internal worker detail.
// ════════════════════════════════════════════════════════════════

/* ── solid, gold-gradient glyphs (filled, not thin strokes) ── */
const ICONS = {
  depth: (
    <g fill="url(#lqGold)">
      <rect x="3" y="3.5" width="12" height="2.7" rx="1.35" />
      <rect x="3" y="8.8" width="18" height="2.7" rx="1.35" />
      <rect x="3" y="14.1" width="9" height="2.7" rx="1.35" />
      <rect x="3" y="19.4" width="15" height="2.7" rx="1.35" />
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
  volatility: (
    <path fill="url(#lqGold)" d="M3 21V15l4-5 3.2 4L14 6l4 7 3-3v11z" />
  ),
  funding: (
    <g fill="url(#lqGold)">
      <circle cx="7.5" cy="7.5" r="2.9" />
      <circle cx="16.5" cy="16.5" r="2.9" />
      <rect x="2.4" y="10.8" width="19.2" height="2.4" rx="1.2" transform="rotate(-45 12 12)" />
    </g>
  ),
  ohlc: (
    <g fill="url(#lqGold)">
      <rect x="5.2" y="3.5" width="1" height="17" rx="0.5" />
      <rect x="3.4" y="7.5" width="4.6" height="8.5" rx="1.3" />
      <rect x="15.8" y="2.8" width="1" height="18.4" rx="0.5" />
      <rect x="14" y="6.5" width="4.6" height="9.5" rx="1.3" />
    </g>
  ),
  deriv: (
    <g fill="url(#lqGold)">
      <rect x="4" y="7.5" width="11" height="11" rx="2.6" opacity="0.4" />
      <rect x="9" y="4.5" width="11" height="11" rx="2.6" />
    </g>
  ),
  dominance: (
    <>
      <circle cx="12" cy="12" r="8.2" fill="url(#lqGold)" opacity="0.3" />
      <path fill="url(#lqGold)" d="M12 3.8a8.2 8.2 0 017.72 5.4L12 12z" />
      <circle cx="12" cy="12" r="3.4" fill="#0c0807" />
    </>
  ),
  funnel: (
    <path fill="url(#lqGold)" d="M3.6 4.5h16.8a1 1 0 01.78 1.63L14 14v5.1a1 1 0 01-1.45.9l-2.2-1.12a1 1 0 01-.55-.9V14L2.82 6.13A1 1 0 013.6 4.5z" />
  ),
  trades: (
    <g fill="url(#lqGold)">
      <rect x="3.4" y="11" width="3.3" height="9" rx="1.3" />
      <rect x="10.35" y="7" width="3.3" height="13" rx="1.3" />
      <rect x="17.3" y="3.5" width="3.3" height="16.5" rx="1.3" />
    </g>
  ),
  ai: (
    <g fill="url(#lqGold)">
      <path d="M10.5 3l1.7 4.6 4.6 1.7-4.6 1.7L10.5 15.6 8.8 11 4.2 9.3 8.8 7.6z" />
      <path d="M18 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </g>
  ),
  flow: (
    <g fill="url(#lqGold)">
      <path d="M4 8h10V4.8L20 9l-6 4.2V10H4z" />
      <path d="M20 16H10v3.2L4 15l6-4.2V14h10z" />
    </g>
  ),
  bell: (
    <g fill="url(#lqGold)">
      <path d="M12 2.4A5.6 5.6 0 006.4 8v3L4.5 14a1 1 0 00.85 1.5h13.3a1 1 0 00.85-1.5L17.6 11V8A5.6 5.6 0 0012 2.4z" />
      <path d="M9.8 17.4a2.2 2.2 0 004.4 0z" />
    </g>
  ),
  bolt: (
    <path fill="url(#lqGold)" d="M13.3 2L4.7 13.5a.8.8 0 00.64 1.27H10l-1.05 6.9a.5.5 0 00.9.37l8.5-11.4a.8.8 0 00-.64-1.28H13l1.15-6.85A.5.5 0 0013.3 2z" />
  ),
  agent: (
    <>
      <path fill="url(#lqGold)" d="M12 2.5l8 4.6v9.8L12 21.5 4 16.9V7.1z" />
      <path fill="#0c0807" d="M12 6.9l1.2 3.1 3.1 1.2-3.1 1.2L12 15.5l-1.2-3.1L7.7 11.2l3.1-1.2z" />
      <circle cx="17.6" cy="6.4" r="1.15" fill="url(#lqGold)" />
    </>
  ),
  shield: (
    <>
      <path fill="url(#lqGold)" d="M12 2.3l7.5 2.8v5.6c0 4.7-3.2 8.6-7.5 10.5-4.3-1.9-7.5-5.8-7.5-10.5V5.1z" />
      <path d="M8.7 12.2l2.3 2.3 4.4-4.5" stroke="#0c0807" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  core: (
    <>
      <path fill="url(#lqGold)" opacity="0.22" d="M12 2.4l8.3 4.8v9.6L12 21.6 3.7 16.8V7.2z" />
      <path fill="url(#lqGold)" d="M12 7l4.4 2.55v5.1L12 17.2l-4.4-2.55v-5.1z" />
      <circle cx="12" cy="12" r="1.5" fill="#0c0807" />
    </>
  ),
};

function Icon({ name, className = "h-[18px] w-[18px]" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// embossed gold chip → subtle 3D feel
function IconChip({ name, size = "h-9 w-9", ic = "h-[18px] w-[18px]" }) {
  return (
    <span
      className={`flex ${size} flex-shrink-0 items-center justify-center rounded-xl border border-gold-primary/25 bg-gradient-to-br from-gold-primary/[0.16] to-gold-primary/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`}
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
  { icon: "trades", t: "Potential Trades", s: "Entry, TP & SL on every call" },
  { icon: "ai", t: "AI Research", s: "BTC Compass regime reads" },
  { icon: "flow", t: "Money Flow", s: "Where capital is rotating" },
  { icon: "bell", t: "On-Chain Alerts", s: "Whale moves, in real time" },
  { icon: "agent", t: "Trading Agent", s: "Executes & manages your trades" },
  { icon: "shield", t: "Verified Performance", s: "Full, timestamped track record" },
];

const hideOnError = (e) => {
  e.currentTarget.style.display = "none";
};

/* ── input card ── */
function InputCard({ item }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0c0807] p-3.5 transition-all duration-300 hover:border-gold-primary/30 hover:bg-white/[0.015]">
      <IconChip name={item.icon} />
      <div className="min-w-0">
        <h4 className="text-[12.5px] font-bold uppercase tracking-wide text-white">{item.title}</h4>
        <p className="mt-0.5 text-[11px] leading-tight text-text-muted">{item.desc}</p>
      </div>
    </div>
  );
}

/* ── stage box (Data Filter) ── */
function StageBox() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#0c0807] px-5 py-7 text-center transition-transform duration-300 hover:-translate-y-0.5">
      <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      <IconChip name="funnel" size="h-12 w-12" ic="h-6 w-6" />
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Data Filter</p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Sanitization</p>
    </div>
  );
}

/* ── engine (centerpiece) ── */
function Engine() {
  return (
    <div className="relative flex items-center justify-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-[180px] w-[180px] rounded-full bg-gold-primary/[0.10] blur-[55px]"
        style={{ animation: "archPulse 4s ease-in-out infinite" }}
      />
      <div className="absolute h-[195px] w-[195px] rounded-[26px] border border-white/[0.05]" />
      <div className="absolute h-[160px] w-[160px] rounded-[22px] border border-gold-primary/15" />

      <div className="relative flex h-[150px] w-[150px] flex-col items-center justify-center overflow-hidden rounded-[22px] border border-white/10 bg-[#0c0807]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-gold-primary/12 to-transparent"
          style={{ animation: "archScan 3.4s linear infinite" }}
        />
        <IconChip name="core" size="h-12 w-12" ic="h-7 w-7" />
        <h3 className="mt-3 text-[12px] font-bold tracking-[0.12em] text-white">PREDICTIVE ALPHA</h3>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-gold-primary/60">
          Quant Engine
        </p>
      </div>
    </div>
  );
}

/* ── output = LuxQuant Terminal with its features ── */
function TerminalPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold-primary/20 bg-[#0a0805] p-5">
      <span className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />
      <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
        <img src="/logo.png" alt="" className="h-5 w-5 rounded" onError={hideOnError} />
        <span className="text-[12px] font-bold tracking-[0.12em] text-white">LUXQUANT TERMINAL</span>
      </div>

      <div className="space-y-2">
        {FEATURES.map((f) => (
          <div
            key={f.t}
            className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-gold-primary/25"
          >
            <IconChip name={f.icon} size="h-8 w-8" ic="h-[17px] w-[17px]" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">{f.t}</p>
              <p className="truncate text-[11px] text-text-muted">{f.s}</p>
            </div>
            <svg className="ml-auto h-4 w-4 flex-shrink-0 text-text-muted transition-colors group-hover:text-gold-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        ))}

        {/* curiosity row — there are many more tools inside */}
        <div className="group flex items-center justify-between rounded-lg border border-dashed border-white/[0.12] px-3 py-2.5 transition-colors hover:border-gold-primary/30">
          <span className="text-[11px] text-text-muted">
            Markets · Portfolio · Journal · News · Calendar
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gold-primary">
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

/* ── connector (horizontal, desktop) ── */
function FlowX({ delay = "0s" }) {
  return (
    <div className="relative mx-2 h-px min-w-[26px] flex-1 self-center bg-white/10 lg:mx-5">
      <span
        className="absolute -top-[1px] h-[3px] w-7 rounded-full bg-gradient-to-r from-transparent via-gold-primary to-transparent shadow-[0_0_8px_rgba(212,168,83,0.6)]"
        style={{ animation: `archFlowX 2.4s linear infinite ${delay}` }}
      />
    </div>
  );
}

/* ── mobile vertical-stepper item (numbered marker + connecting spine) ── */
function Step({ n, gold = false, line = true, children }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={`relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border bg-[#0c0807] font-mono text-[13px] font-bold ${
            gold
              ? "border-gold-primary/50 text-gold-primary shadow-[0_0_16px_rgba(212,168,83,0.3)]"
              : "border-white/15 text-white/55"
          }`}
        >
          {n}
        </span>
        {line && <span className="my-1.5 w-px flex-1 bg-gradient-to-b from-white/15 to-white/[0.04]" />}
      </div>
      <div className="flex-1 pb-6">{children}</div>
    </li>
  );
}

export default function Architecture() {
  return (
    <section
      id="how-it-works"
      className="relative z-10 mx-auto -mt-10 w-full max-w-7xl px-4 pt-6 pb-20 lg:-mt-16 lg:px-8 lg:pt-10 lg:pb-28"
    >
      {/* shared gold gradient for all glyphs */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="lqGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7e3a6" />
            <stop offset="0.45" stopColor="#e7c373" />
            <stop offset="1" stopColor="#b8893c" />
          </linearGradient>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-gold-primary/[0.04] blur-[120px]"
      />

      {/* header */}
      <div className="mb-14 text-center lg:mb-20">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/75">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/55" />
          How It Works
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-gold-primary/55" />
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-white lg:text-5xl">
          From market data to{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b] bg-clip-text text-transparent">
            your terminal
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
          A 24/7 quant engine turns live market data into precise calls — and a
          complete trading terminal you can act on.
        </p>
      </div>

      {/* DESKTOP — horizontal pipeline */}
      <div className="mx-auto hidden w-full max-w-[1200px] items-center lg:flex">
        <div className="flex w-[245px] flex-shrink-0 flex-col gap-3">
          {INPUTS.map((i) => (
            <InputCard key={i.title} item={i} />
          ))}
        </div>
        <FlowX delay="0s" />
        <div className="w-[155px] flex-shrink-0">
          <StageBox />
        </div>
        <FlowX delay="0.5s" />
        <div className="flex-shrink-0">
          <Engine />
        </div>
        <FlowX delay="1s" />
        <div className="w-[300px] flex-shrink-0 xl:w-[320px]">
          <TerminalPanel />
        </div>
      </div>

      {/* MOBILE — compact vertical stepper (natural top-to-bottom scan) */}
      <ol className="mx-auto max-w-md lg:hidden">
        {/* 1 · data, condensed into one node */}
        <Step n={1}>
          <div className="rounded-xl border border-white/[0.08] bg-[#0c0807] p-4">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-white">
              Live Market Data
            </p>
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

        {/* 2 · filter */}
        <Step n={2}>
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0c0807] p-3.5">
            <IconChip name="funnel" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-white">Data Filter</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Sanitization</p>
            </div>
          </div>
        </Step>

        {/* 3 · engine */}
        <Step n={3} gold>
          <div className="flex items-center gap-3 rounded-xl border border-gold-primary/25 bg-[#0c0807] p-3.5 shadow-[0_0_34px_-14px_rgba(212,168,83,0.5)]">
            <IconChip name="core" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-white">Predictive Alpha</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-gold-primary/60">Quant Engine</p>
            </div>
          </div>
        </Step>

        {/* 4 · terminal — condensed into one card like step 1 */}
        <Step n={4} line={false}>
          <div className="rounded-xl border border-gold-primary/20 bg-[#0c0807] p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
              <img src="/logo.png" alt="" className="h-5 w-5 rounded" onError={hideOnError} />
              <span className="text-[12px] font-bold uppercase tracking-wide text-white">
                LuxQuant Terminal
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {FEATURES.map((f) => (
                <div key={f.t} className="flex items-center gap-2">
                  <Icon name={f.icon} className="h-4 w-4 flex-shrink-0" />
                  <span className="text-[11px] leading-tight text-white/75">{f.t}</span>
                </div>
              ))}
            </div>
            <p className="mt-3.5 border-t border-white/[0.06] pt-3 text-[11px] font-medium text-gold-primary/85">
              + Markets, Portfolio, Journal &amp; more
            </p>
          </div>
        </Step>
      </ol>

      <style>{`
        @keyframes archFlowX {
          0% { left: 0%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { left: calc(100% - 1.75rem); opacity: 0; }
        }
        @keyframes archFlowY {
          0% { top: -30%; opacity: 0; }
          14% { opacity: 1; }
          86% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes archPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.94); }
          50% { opacity: 1; transform: scale(1.06); }
        }
        @keyframes archScan {
          0% { transform: translateY(-120%); }
          100% { transform: translateY(420%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="archFlowX"], [style*="archFlowY"],
          [style*="archPulse"], [style*="archScan"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
