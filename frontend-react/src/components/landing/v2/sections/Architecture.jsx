import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Exclusive web3 desk — Hyperliquid / Lighter / Ethena school.
   The product chrome IS the explainer. No mind-map, no plus, no spokes. */

const TAPE = [
  { id: "price", label: "Price", meta: "Multi-venue", icon: "price" },
  { id: "volume", label: "Volume", meta: "Spot + perps", icon: "volume" },
  { id: "book", label: "Order book", meta: "Depth", icon: "book" },
  { id: "funding", label: "Funding", meta: "Perps", icon: "funding" },
  { id: "liqs", label: "Liquidations", meta: "Heat", icon: "liqs" },
  { id: "onchain", label: "On-chain", meta: "Flows", icon: "chain" },
  { id: "vol", label: "Volatility", meta: "Range", icon: "wave" },
  { id: "breadth", label: "Breadth", meta: "Market", icon: "grid" },
];

const SETUPS = [
  { pair: "BTCUSDT", side: "Long", line: "Breadth and book agree." },
  { pair: "ETHUSDT", side: "Short", line: "Funding and heat line up." },
  { pair: "SOLUSDT", side: "Long", line: "Tape is one-sided." },
];

const VENUES = [
  { src: "/exchanges/binance.png", name: "Binance" },
  { src: "/exchanges/okx.png", name: "OKX" },
  { src: "/exchanges/bybit.png?v=2", name: "Bybit" },
  { src: "/exchanges/gate.png", name: "Gate" },
  { src: "/exchanges/bitget.png", name: "Bitget" },
  { src: "/exchanges/bingx.png?v=2", name: "BingX" },
];

const MOTES = [
  { id: "m1", d: "M 28 16 C 46 16 54 30 74 34", dur: "3.4s", delay: "0s" },
  { id: "m2", d: "M 28 38 C 48 34 52 48 74 50", dur: "4.1s", delay: "0.8s" },
  { id: "m3", d: "M 28 58 C 46 62 54 60 74 64", dur: "3.7s", delay: "1.5s" },
  { id: "m4", d: "M 28 80 C 48 74 52 76 74 78", dur: "4.6s", delay: "0.4s" },
];

function Glyph({ type }) {
  const c = {
    className: `lq-glyph lq-glyph-${type}`,
    width: 16,
    height: 16,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (type) {
    case "price":
      return <svg {...c}><path className="lq-g-main" d="M2 13h2.2L6.2 6l2.6 9 2-5.4 1.6 2.2H18" /></svg>;
    case "volume":
      return (
        <svg {...c}>
          <path className="lq-g-b1" d="M4 16V10" />
          <path className="lq-g-b2" d="M8 16V5" />
          <path className="lq-g-b3" d="M12 16v-4" />
          <path className="lq-g-b4" d="M16 16V7" />
        </svg>
      );
    case "book":
      return (
        <svg {...c}>
          <path className="lq-g-bl" d="M3 4h6c1 0 1.5.5 1.5 1.4V17c0-1-.7-1.6-1.7-1.6H3z" />
          <path className="lq-g-br" d="M17 4H11c-1 0-1.5.5-1.5 1.4V17c0-1 .7-1.6 1.7-1.6H17z" />
        </svg>
      );
    case "funding":
      return <svg {...c}><path d="M10 3v14M7 6.5c.8-1.4 5.4-2 5.4.8 0 3.2-6 1.6-6 4.6 0 2.4 4.2 2.2 5.6.6" /></svg>;
    case "liqs":
      return (
        <svg {...c}>
          <path className="lq-g-drop" d="M10 3v10M6 9l4 4 4-4" />
          <path d="M4 17h12" />
        </svg>
      );
    case "chain":
      return (
        <svg {...c}>
          <path d="M7.6 12.4 6 14A3 3 0 1 1 1.8 9.8l2.2-2.2A3 3 0 0 1 8.2 7M12.4 7.6 14 6a3 3 0 1 1 4.2 4.2l-2.2 2.2a3 3 0 0 1-4.2.4M7 10h6" />
          <circle className="lq-g-pkt" cx="7" cy="10" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "wave":
      return <svg {...c}><path className="lq-g-main" d="M2 11c2.2 0 2.2-5 4.4-5s2.2 8 4.4 8 2.2-6 4.4-6c1.2 0 1.8 1 2.8 2" /></svg>;
    case "grid":
      return (
        <svg {...c}>
          <rect className="lq-g-s1" x="3" y="3" width="5" height="5" rx="1" />
          <rect className="lq-g-s2" x="12" y="3" width="5" height="5" rx="1" />
          <rect className="lq-g-s3" x="3" y="12" width="5" height="5" rx="1" />
          <rect className="lq-g-s4" x="12" y="12" width="5" height="5" rx="1" />
        </svg>
      );
    default:
      return <svg {...c}><circle cx="10" cy="10" r="6" /></svg>;
  }
}

function utcClock(date) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [setupIdx, setSetupIdx] = useState(0);
  const [ticketOn, setTicketOn] = useState(true);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return undefined;
    const cycle = setInterval(() => {
      setTicketOn(false);
      window.setTimeout(() => {
        setSetupIdx((i) => (i + 1) % SETUPS.length);
        setTicketOn(true);
      }, 280);
    }, 7500);
    return () => clearInterval(cycle);
  }, []);

  const setup = SETUPS[setupIdx];

  const goVerify = () => {
    trackFunnel("cta_click", { source: "how_it_works", path: "/" });
    if (isAuthenticated) {
      navigate("/performance");
      return;
    }
    navigate(loginUrl("/performance", { source: "how_it_works" }));
  };

  return (
    <section
      id="how-it-works"
      data-lq-self=""
      className="relative z-10 w-full scroll-mt-32 overflow-hidden py-16 lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 lg:px-8">
        <h2 className="max-w-3xl text-[28px] font-semibold leading-[1.25] tracking-[-0.03em] text-text-primary sm:text-[36px] lg:text-[44px]">
          The desk reads the tape.
          <span className="mt-2 block text-text-muted">You take the setup to your exchange.</span>
        </h2>
      </div>

      <div className="mx-auto mt-10 max-w-[1120px] px-4 lg:mt-14 lg:px-8">
        <div className="lq-chrome">
          <div className="lq-bar">
            <img src="/logo.png" alt="" width="18" height="18" />
            <strong>LuxQuant</strong>
            <span className="lq-dot" />
            <em>Desk</em>
            <span className="lq-spacer" />
            <time dateTime={now.toISOString()} className="lq-clock">
              {utcClock(now)}
              <abbr title="Coordinated Universal Time"> UTC</abbr>
            </time>
            <span className="lq-livepill">
              <i />
              Live
            </span>
          </div>

          <div className="lq-body">
            <aside className="lq-tape" aria-label="Market tape">
              <p className="lq-kicker">Tape</p>
              <div className="lq-scan" aria-hidden="true" />
              <ul>
                {TAPE.map((row) => (
                  <li key={row.id}>
                    <Glyph type={row.icon} />
                    <span className="lq-tape-name">{row.label}</span>
                    <span className="lq-tape-meta">{row.meta}</span>
                    <i className="lq-pip" />
                  </li>
                ))}
              </ul>
            </aside>

            <article className={`lq-ticket ${ticketOn ? "is-on" : ""}`} aria-live="polite">
              <p className="lq-kicker">Setup</p>
              <header className="lq-ticket-head">
                <h3>{setup.pair}</h3>
                <span className={`lq-side lq-side-${setup.side.toLowerCase()}`}>{setup.side}</span>
              </header>
              <p className="lq-thesis">{setup.line}</p>
              <dl className="lq-fields">
                <div>
                  <dt>Size</dt>
                  <dd>You decide</dd>
                </div>
                <div>
                  <dt>Invalidation</dt>
                  <dd>Yours</dd>
                </div>
              </dl>
              <div className="lq-exec">
                <p>Take it to your exchange</p>
                <div className="lq-venues" aria-label="Venues">
                  {VENUES.map((v) => (
                    <img key={v.name} src={v.src} alt={v.name} title={v.name} />
                  ))}
                </div>
              </div>
            </article>
          </div>

          <svg className="lq-motes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {MOTES.map((m) => (
              <g key={m.id}>
                <path id={m.id} d={m.d} fill="none" />
                <circle r="0.7" fill="#f0c84a">
                  <animateMotion dur={m.dur} begin={m.delay} repeatCount="indefinite">
                    <mpath href={`#${m.id}`} />
                  </animateMotion>
                </circle>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <p className="mx-auto mt-5 max-w-[1120px] px-4 text-center text-[13px] leading-relaxed text-text-muted lg:px-8">
        Eight live feeds in. One written call out. You place it.
      </p>

      <div className="mt-8 flex justify-center px-4">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
      </div>

      <style>{`
        .lq-chrome {
          position: relative;
          overflow: hidden;
          border: 1px solid rgb(var(--ink) / 0.1);
          border-radius: 22px;
          background: rgb(var(--surface-raised) / 0.92);
          box-shadow:
            inset 0 1px 0 rgb(var(--ink) / 0.04),
            0 28px 70px -36px rgba(0,0,0,.22);
        }
        .lq-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 46px;
          padding: 0 16px;
          border-bottom: 1px solid rgb(var(--ink) / 0.08);
        }
        .lq-bar img {
          width: 18px; height: 18px;
          border-radius: 5px;
          object-fit: cover;
        }
        .lq-bar strong {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: -.02em;
          color: rgb(var(--ink) / 0.92);
        }
        .lq-dot {
          width: 3px; height: 3px; border-radius: 99px;
          background: rgb(var(--ink) / 0.28);
        }
        .lq-bar em {
          font-style: normal;
          font-size: 13px;
          font-weight: 500;
          color: rgb(var(--ink) / 0.42);
        }
        .lq-spacer { flex: 1; }
        .lq-clock {
          font-variant-numeric: tabular-nums;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: .04em;
          color: rgb(var(--ink) / 0.46);
        }
        .lq-clock abbr { text-decoration: none; letter-spacing: .08em; }
        .lq-livepill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 22px;
          padding: 0 8px 0 7px;
          border-radius: 99px;
          background: rgb(var(--accent) / 0.16);
          color: rgb(var(--accent));
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .lq-livepill i {
          width: 6px; height: 6px; border-radius: 99px;
          background: rgb(var(--accent));
          box-shadow: 0 0 8px rgb(var(--accent) / .85);
          animation: lqPulse 1.8s ease-in-out infinite;
        }
        .lq-body {
          display: flex;
          flex-direction: column;
        }
        .lq-kicker {
          margin: 0 0 12px;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .2em;
          text-transform: uppercase;
          color: rgb(var(--accent));
        }
        .lq-tape {
          position: relative;
          padding: 18px 16px 14px;
          border-bottom: 1px solid rgb(var(--ink) / 0.08);
        }
        .lq-tape ul, .lq-tape li { list-style: none; margin: 0; padding: 0; }
        .lq-tape ul {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .lq-tape ul::-webkit-scrollbar { display: none; }
        .lq-tape li {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          height: 36px;
          padding: 0 10px 0 8px;
          border: 1px solid rgb(var(--ink) / 0.08);
          border-radius: 10px;
          background: rgb(var(--surface) / 0.35);
          font-size: 12.5px;
          font-weight: 600;
          color: rgb(var(--ink) / 0.88);
          animation: lqRow 7.5s ease-in-out infinite;
        }
        .lq-tape li:nth-child(2) { animation-delay: .75s; }
        .lq-tape li:nth-child(3) { animation-delay: 1.5s; }
        .lq-tape li:nth-child(4) { animation-delay: 2.25s; }
        .lq-tape li:nth-child(5) { animation-delay: 3s; }
        .lq-tape li:nth-child(6) { animation-delay: 3.75s; }
        .lq-tape li:nth-child(7) { animation-delay: 4.5s; }
        .lq-tape li:nth-child(8) { animation-delay: 5.25s; }
        .lq-tape-meta {
          display: none;
          font-size: 11px;
          font-weight: 500;
          color: rgb(var(--ink) / 0.38);
        }
        .lq-pip {
          width: 5px; height: 5px; border-radius: 99px;
          background: rgb(var(--accent));
          box-shadow: 0 0 7px rgb(var(--accent) / .75);
          animation: lqPulse 1.8s ease-in-out infinite;
        }
        .lq-scan { display: none; }
        .lq-ticket {
          position: relative;
          padding: 20px 18px 18px;
          background:
            radial-gradient(ellipse 70% 50% at 78% 28%, rgb(var(--accent) / 0.1), transparent 70%);
          opacity: 0;
          transform: translateY(6px);
          transition: opacity .35s ease, transform .35s ease;
        }
        .lq-ticket.is-on { opacity: 1; transform: none; }
        .lq-ticket-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .lq-ticket-head h3 {
          margin: 0;
          font-size: 28px;
          font-weight: 750;
          letter-spacing: -.04em;
          color: rgb(var(--ink) / 0.94);
        }
        .lq-side {
          display: inline-flex;
          align-items: center;
          height: 26px;
          padding: 0 10px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .lq-side-long {
          background: #d4a017;
          color: #171304;
        }
        .lq-side-short {
          background: transparent;
          color: rgb(var(--accent));
          border: 1px solid rgb(var(--accent) / 0.55);
        }
        .lq-thesis {
          margin: 14px 0 0;
          max-width: 28ch;
          font-size: 16px;
          line-height: 1.4;
          font-weight: 550;
          letter-spacing: -.02em;
          color: rgb(var(--ink) / 0.72);
        }
        .lq-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 22px 0 0;
        }
        .lq-fields dt {
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: rgb(var(--ink) / 0.36);
        }
        .lq-fields dd {
          margin: 5px 0 0;
          font-size: 15px;
          font-weight: 650;
          letter-spacing: -.02em;
          color: rgb(var(--ink) / 0.88);
        }
        .lq-exec {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid rgb(var(--ink) / 0.08);
        }
        .lq-exec p {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 600;
          color: rgb(var(--ink) / 0.48);
        }
        .lq-venues { display: flex; gap: 8px; }
        .lq-venues img {
          width: 26px; height: 26px;
          border-radius: 99px;
          object-fit: cover;
          border: 1px solid rgb(var(--ink) / 0.1);
          background: rgb(var(--surface));
        }
        .lq-motes { display: none; }
        .lq-glyph { color: rgb(var(--accent)); flex: 0 0 auto; }
        .lq-glyph path, .lq-glyph rect, .lq-glyph circle {
          transform-box: fill-box;
          transform-origin: center;
        }
        .lq-glyph-price .lq-g-main { animation: lqWave 2.6s ease-in-out infinite; }
        .lq-glyph-volume .lq-g-b1 { animation: lqBar 1.6s ease-in-out -.1s infinite; }
        .lq-glyph-volume .lq-g-b2 { animation: lqBar 1.6s ease-in-out -.5s infinite; }
        .lq-glyph-volume .lq-g-b3 { animation: lqBar 1.6s ease-in-out -.9s infinite; }
        .lq-glyph-volume .lq-g-b4 { animation: lqBar 1.6s ease-in-out -.3s infinite; }
        .lq-glyph-book .lq-g-bl { animation: lqBookL 2.4s ease-in-out infinite; }
        .lq-glyph-book .lq-g-br { animation: lqBookR 2.4s ease-in-out infinite; }
        .lq-glyph-liqs .lq-g-drop { animation: lqDrop 1.6s ease-in-out infinite; }
        .lq-glyph-chain .lq-g-pkt { animation: lqPkt 1.8s cubic-bezier(.4,0,.2,1) infinite; }
        .lq-glyph-wave .lq-g-main { animation: lqVol 2.1s ease-in-out infinite; }
        .lq-glyph-grid .lq-g-s1 { animation: lqSq 2.4s ease-in-out 0s infinite; }
        .lq-glyph-grid .lq-g-s2 { animation: lqSq 2.4s ease-in-out .3s infinite; }
        .lq-glyph-grid .lq-g-s3 { animation: lqSq 2.4s ease-in-out .6s infinite; }
        .lq-glyph-grid .lq-g-s4 { animation: lqSq 2.4s ease-in-out .9s infinite; }

        @media (min-width: 900px) {
          .lq-bar { padding: 0 22px; }
          .lq-body {
            display: grid;
            grid-template-columns: 38% 1fr;
            min-height: 460px;
          }
          .lq-tape {
            padding: 22px 8px 18px 22px;
            border-bottom: 0;
            border-right: 1px solid rgb(var(--ink) / 0.08);
          }
          .lq-tape ul {
            display: block;
            overflow: visible;
          }
          .lq-tape li {
            display: grid;
            grid-template-columns: 18px 1fr auto 8px;
            width: 100%;
            height: 44px;
            padding: 0 10px 0 6px;
            border: 0;
            border-radius: 10px;
            background: transparent;
            font-size: 14px;
          }
          .lq-tape-meta { display: inline; }
          .lq-scan {
            display: block;
            position: absolute;
            left: 12px; right: 10px;
            height: 40px;
            border-radius: 10px;
            background: linear-gradient(180deg, transparent, rgb(var(--accent) / .1), transparent);
            pointer-events: none;
            animation: lqScan 7.5s ease-in-out infinite;
          }
          .lq-ticket { padding: 28px 32px 26px 34px; }
          .lq-ticket-head h3 { font-size: 40px; }
          .lq-thesis { font-size: 18px; margin-top: 18px; }
          .lq-fields { margin-top: 32px; max-width: 360px; }
          .lq-exec { margin-top: 36px; }
          .lq-motes {
            display: block;
            position: absolute;
            inset: 46px 0 0;
            width: 100%;
            height: calc(100% - 46px);
            pointer-events: none;
            opacity: .7;
          }
        }

        @keyframes lqPulse { 0%,100% { opacity: .45; transform: scale(.82); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes lqWave { 0%,100% { transform: translateX(-.5px); } 50% { transform: translateX(.5px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqDrop { 0% { transform: translateY(-2px); opacity: .4; } 60%,100% { transform: none; opacity: 1; } }
        @keyframes lqPkt { 0% { transform: translateX(-4px); opacity: 0; } 30%,70% { opacity: 1; } 100% { transform: translateX(6px); opacity: 0; } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7); } 50% { transform: scaleY(1.12); } }
        @keyframes lqSq { 0%,100% { opacity: .4; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes lqRow {
          0%, 10%, 100% { background: transparent; }
          5% { background: rgb(var(--accent) / .08); }
        }
        @keyframes lqScan {
          0% { top: 44px; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { top: calc(100% - 52px); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lq-livepill i, .lq-pip, .lq-scan, .lq-tape li,
          .lq-glyph path, .lq-glyph rect, .lq-glyph circle { animation: none !important; }
          .lq-motes { display: none !important; }
          .lq-ticket { opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}
