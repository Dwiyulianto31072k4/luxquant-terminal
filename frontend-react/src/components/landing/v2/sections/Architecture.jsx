import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Infrastructure map — smart-grid school.
   Three domains, circular nodes, a data bus, a process loop,
   venues as the last rail. Not a plus. Not a fake terminal. */

const MARKET = [
  { id: "price", label: "Price", icon: "price" },
  { id: "volume", label: "Volume", icon: "volume" },
  { id: "book", label: "Order book", icon: "book" },
  { id: "funding", label: "Funding", icon: "funding" },
  { id: "liqs", label: "Liquidations", icon: "liqs" },
  { id: "onchain", label: "On-chain", icon: "chain" },
];

const ENGINE = [
  { id: "sanitize", label: "Sanitize", icon: "filter" },
  { id: "core", label: "LuxQuant", icon: "core" },
  { id: "setup", label: "Trade setup", icon: "signal" },
];

const DESK = [
  { id: "terminal", label: "Terminal", icon: "desk" },
  { id: "size", label: "You size it", icon: "hand" },
  { id: "record", label: "Record", icon: "check" },
];

const PROCESS = [
  { id: "ingest", label: "Ingest" },
  { id: "analyze", label: "Analyze" },
  { id: "write", label: "Write" },
  { id: "place", label: "Place" },
];

const VENUES = [
  { src: "/exchanges/binance.png", name: "Binance" },
  { src: "/exchanges/okx.png", name: "OKX" },
  { src: "/exchanges/bybit.png?v=2", name: "Bybit" },
  { src: "/exchanges/gate.png", name: "Gate" },
  { src: "/exchanges/bitget.png", name: "Bitget" },
  { src: "/exchanges/bingx.png?v=2", name: "BingX" },
];

function Glyph({ type }) {
  const c = {
    className: `lq-g lq-g-${type}`,
    width: 20,
    height: 20,
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
        </svg>
      );
    case "filter":
      return <svg {...c}><path d="M3 4h14l-5.2 6.4V16l-3.6 2v-7.6z" /></svg>;
    case "core":
      return (
        <svg {...c}>
          <path d="M10 2.4 17.2 6.6v6.8L10 17.6 2.8 13.4V6.6z" />
          <circle cx="10" cy="10" r="2.2" />
        </svg>
      );
    case "signal":
      return <svg {...c}><path d="M7.5 17 3 12.5m0 0L7.5 8M3 12.5h10.5m0-9L17.5 8m0 0L13 12.5M17.5 8H7" /></svg>;
    case "desk":
      return (
        <svg {...c}>
          <rect x="2" y="4" width="16" height="10" rx="1.6" />
          <path d="M7 17h6M10 14v3" />
        </svg>
      );
    case "hand":
      return <svg {...c}><path d="M7 11V6.5a1.4 1.4 0 0 1 2.8 0V11M9.8 10V5.6a1.4 1.4 0 0 1 2.8 0V11M12.6 10V7.2a1.4 1.4 0 1 1 2.8 0V12c0 3-1.6 5-5.2 5.4A4.4 4.4 0 0 1 5 13.2V9.2A1.4 1.4 0 0 1 7.8 9" /></svg>;
    case "check":
      return <svg {...c}><path className="lq-g-pulse" d="m4 10 4 4 8-8" /></svg>;
    case "market":
      return <svg {...c}><path d="M3 15h14M5 15V8l5-4 5 4v7" /></svg>;
    case "engine":
      return <svg {...c}><circle cx="10" cy="10" r="6" /><path d="M10 6.5v7M7 10h6" /></svg>;
    case "yours":
      return <svg {...c}><circle cx="10" cy="7" r="2.4" /><path d="M4.5 16c.8-3 2.8-4.4 5.5-4.4S14.7 13 15.5 16" /></svg>;
    default:
      return <svg {...c}><circle cx="10" cy="10" r="6" /></svg>;
  }
}

function Node({ tone, icon, label, hero }) {
  return (
    <div className={`lq-node lq-n-${tone}${hero ? " is-hero" : ""}`}>
      <span className="lq-orb">
        {hero ? <img src="/logo.png" alt="" /> : <Glyph type={icon} />}
      </span>
      <span className="lq-lab">{label}</span>
    </div>
  );
}

function Tab({ tone, icon, title }) {
  return (
    <div className={`lq-tab lq-t-${tone}`}>
      <span className="lq-orb">
        <Glyph type={icon} />
      </span>
      <strong>{title}</strong>
    </div>
  );
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return undefined;
    const t = setInterval(() => setStep((s) => (s + 1) % PROCESS.length), 2400);
    return () => clearInterval(t);
  }, []);

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
      <div className="mx-auto max-w-[1180px] px-4 lg:px-8">
        <h2 className="max-w-3xl text-[28px] font-semibold leading-[1.25] tracking-[-0.03em] text-text-primary sm:text-[36px] lg:text-[44px]">
          The market. The engine. Your exchange.
          <span className="mt-2 block text-text-muted">Data in. A written call out. You place it.</span>
        </h2>

        <div className="lq-map">
          <div className="lq-map-head">
            <Tab tone="cyan" icon="market" title="Market tape" />
            <Tab tone="gold" icon="engine" title="LuxQuant engine" />
            <Tab tone="cyan" icon="yours" title="Your desk" />
            <p className="lq-proc-kicker">Process</p>
          </div>

          <div className="lq-map-grid">
            <section className="lq-zone lq-z-cyan" aria-label="Market tape">
              <div className="lq-zone-nodes lq-zone-market">
                {MARKET.map((n) => (
                  <Node key={n.id} tone="cyan" icon={n.icon} label={n.label} />
                ))}
              </div>
            </section>

            <section className="lq-zone lq-z-gold" aria-label="LuxQuant engine">
              <div className="lq-zone-nodes lq-zone-engine">
                {ENGINE.map((n) => (
                  <Node key={n.id} tone="gold" icon={n.icon} label={n.label} hero={n.id === "core"} />
                ))}
              </div>
            </section>

            <section className="lq-zone lq-z-cyan" aria-label="Your desk">
              <div className="lq-zone-nodes lq-zone-desk">
                {DESK.map((n) => (
                  <Node key={n.id} tone="cyan" icon={n.icon} label={n.label} />
                ))}
              </div>
            </section>

            <ol className="lq-proc" aria-label="Process">
              {PROCESS.map((p, i) => (
                <li key={p.id} className={`${i % 2 ? "is-gold" : "is-cyan"}${step === i ? " is-on" : ""}`}>
                  {p.label}
                </li>
              ))}
            </ol>
          </div>

          <div className="lq-bus" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>

          <section className="lq-rail" aria-label="Your exchange">
            <p>Your exchange</p>
            <ul>
              {VENUES.map((v) => (
                <li key={v.name}>
                  <img src={v.src} alt="" />
                  <span>{v.name}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="lq-legend">
            <span><i className="is-dash" /> Data</span>
            <span><i className="is-solid" /> Call</span>
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
            {isAuthenticated ? "See the full record" : "Verify the track record"}
            <BtnArrow />
          </PrimaryButton>
        </div>
      </div>

      <style>{`
        .lq-map {
          --navy: #071526;
          --navy-2: #0a1d34;
          --line: #16324f;
          --cyan: #2ad4d0;
          --gold: #f0b90b;
          --paper: #f3f7fb;
          --mute: #8ea3bb;
          position: relative;
          margin-top: 36px;
          padding: 22px 16px 16px;
          border-radius: 22px;
          background:
            radial-gradient(ellipse 80% 50% at 0% 0%, rgba(42,212,208,.08), transparent 50%),
            radial-gradient(ellipse 60% 40% at 100% 0%, rgba(240,185,11,.07), transparent 46%),
            var(--navy);
          color: var(--paper);
          overflow: hidden;
        }
        .lq-map-head {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .lq-tab {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          padding: 6px 14px 6px 8px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--navy-2);
        }
        .lq-tab::before {
          content: "";
          position: absolute;
          left: -3px; top: 8px; bottom: 8px;
          width: 4px;
          border-radius: 4px;
        }
        .lq-tab::after {
          content: "";
          position: absolute;
          left: 22px; bottom: -9px;
          border: 7px solid transparent;
        }
        .lq-t-cyan::before { background: var(--cyan); }
        .lq-t-gold::before { background: var(--gold); }
        .lq-t-cyan::after { border-top-color: var(--cyan); }
        .lq-t-gold::after { border-top-color: var(--gold); }
        .lq-tab strong {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: -.02em;
        }
        .lq-tab .lq-orb { width: 28px; height: 28px; }
        .lq-tab .lq-orb svg { width: 14px; height: 14px; }
        .lq-t-cyan .lq-orb { background: var(--cyan); color: #062427; }
        .lq-t-gold .lq-orb { background: var(--gold); color: #171304; }
        .lq-proc-kicker {
          display: none;
          margin: 0;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: var(--mute);
        }
        .lq-map-grid {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }
        .lq-zone {
          position: relative;
          min-height: 168px;
          padding: 16px 12px;
          border-radius: 12px;
          background: rgba(7, 21, 38, .35);
        }
        .lq-z-cyan { border: 1px solid rgba(42,212,208,.45); }
        .lq-z-gold { border: 1px solid rgba(240,185,11,.55); }
        .lq-zone-nodes {
          display: grid;
          gap: 14px 10px;
        }
        .lq-zone-market { grid-template-columns: 1fr 1fr; }
        .lq-zone-engine { grid-template-columns: 1fr; justify-items: center; }
        .lq-zone-desk { grid-template-columns: 1fr; }
        .lq-node {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .lq-orb {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 42px; height: 42px;
          border-radius: 99px;
          box-shadow: 0 8px 18px -10px rgba(0,0,0,.55);
        }
        .lq-n-cyan .lq-orb { background: var(--cyan); color: #062427; }
        .lq-n-gold .lq-orb { background: var(--gold); color: #171304; }
        .lq-node.is-hero .lq-orb {
          width: 58px; height: 58px;
          box-shadow: 0 0 0 4px rgba(240,185,11,.18), 0 12px 24px -12px rgba(240,185,11,.7);
        }
        .lq-node.is-hero img {
          width: 28px; height: 28px;
          border-radius: 8px;
          object-fit: cover;
        }
        .lq-lab {
          font-size: 12px;
          font-weight: 650;
          letter-spacing: -.01em;
          color: var(--paper);
        }
        .lq-proc {
          list-style: none;
          margin: 4px 0 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .lq-proc li {
          display: grid;
          place-items: center;
          height: 64px;
          padding: 6px;
          border-radius: 99px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: -.01em;
          text-align: center;
          line-height: 1.15;
          opacity: .72;
          transition: transform .35s ease, box-shadow .35s ease, opacity .35s ease;
        }
        .lq-proc li.is-cyan { background: var(--cyan); color: #062427; }
        .lq-proc li.is-gold { background: var(--gold); color: #171304; }
        .lq-proc li.is-on {
          opacity: 1;
          transform: scale(1.06);
          box-shadow: 0 10px 22px -10px rgba(0,0,0,.55);
        }
        .lq-bus { display: none; }
        .lq-rail {
          margin-top: 12px;
          padding: 14px 12px 12px;
          border: 1px solid rgba(240,185,11,.55);
          border-radius: 12px;
        }
        .lq-rail p {
          margin: 0 0 10px;
          font-size: 11px;
          font-weight: 750;
          letter-spacing: .16em;
          text-transform: uppercase;
          color: var(--gold);
        }
        .lq-rail ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px 8px;
        }
        .lq-rail li {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .lq-rail img {
          width: 36px; height: 36px;
          border-radius: 99px;
          object-fit: cover;
          border: 2px solid var(--gold);
          background: #fff;
        }
        .lq-rail span {
          font-size: 10.5px;
          font-weight: 650;
          color: var(--mute);
        }
        .lq-legend {
          display: flex;
          gap: 18px;
          margin: 12px 2px 0;
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
        }
        .lq-legend span { display: inline-flex; align-items: center; gap: 8px; }
        .lq-legend i {
          display: block;
          width: 22px; height: 0;
          border-top: 2px solid var(--cyan);
        }
        .lq-legend i.is-dash { border-top-style: dashed; }
        .lq-legend i.is-solid { border-top-color: var(--gold); border-top-style: solid; }
        .lq-g path, .lq-g rect, .lq-g circle {
          transform-box: fill-box;
          transform-origin: center;
        }
        .lq-g-price .lq-g-main { animation: lqWave 2.6s ease-in-out infinite; }
        .lq-g-volume .lq-g-b1 { animation: lqBar 1.6s ease-in-out -.1s infinite; }
        .lq-g-volume .lq-g-b2 { animation: lqBar 1.6s ease-in-out -.5s infinite; }
        .lq-g-volume .lq-g-b3 { animation: lqBar 1.6s ease-in-out -.9s infinite; }
        .lq-g-volume .lq-g-b4 { animation: lqBar 1.6s ease-in-out -.3s infinite; }
        .lq-g-book .lq-g-bl { animation: lqBookL 2.4s ease-in-out infinite; }
        .lq-g-book .lq-g-br { animation: lqBookR 2.4s ease-in-out infinite; }
        .lq-g-liqs .lq-g-drop { animation: lqFall 1.6s ease-in-out infinite; }
        .lq-g-check .lq-g-pulse { animation: lqPulse 2s ease-in-out infinite; }
        .lq-n-cyan .lq-orb { animation: lqGlowC 3.2s ease-in-out infinite; }
        .lq-n-gold .lq-orb { animation: lqGlowG 3.2s ease-in-out infinite; }

        @media (min-width: 980px) {
          .lq-map { padding: 28px 22px 18px 22px; }
          .lq-map-head, .lq-map-grid {
            grid-template-columns: 1fr 1fr 1fr 132px;
            gap: 16px;
            align-items: end;
          }
          .lq-map-grid { align-items: stretch; margin-top: 22px; min-height: 320px; }
          .lq-proc-kicker { display: block; text-align: center; padding-bottom: 4px; }
          .lq-zone { min-height: 320px; padding: 22px 16px; }
          .lq-zone-engine {
            height: 100%;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto;
            align-content: center;
            justify-items: center;
            gap: 28px 18px;
          }
          .lq-zone-engine .lq-node:nth-child(2) {
            grid-column: 1 / -1;
          }
          .lq-zone-desk {
            height: 100%;
            align-content: center;
            gap: 22px;
          }
          .lq-zone-market {
            height: 100%;
            align-content: center;
            gap: 20px 14px;
          }
          .lq-zone-market .lq-node:nth-child(6) { transform: scale(1.06); }
          .lq-proc {
            grid-template-columns: 1fr;
            align-content: center;
            gap: 10px;
            margin: 0;
          }
          .lq-proc li { height: 68px; font-size: 11.5px; }
          .lq-rail {
            margin-top: 16px;
            margin-right: 148px;
            padding: 16px 18px 14px;
          }
          .lq-rail ul {
            grid-template-columns: repeat(6, 1fr);
          }
          .lq-rail img { width: 40px; height: 40px; }
          .lq-bus {
            display: block;
            position: absolute;
            left: 38px;
            right: 170px;
            top: 58%;
            height: 0;
            border-top: 1.5px dashed rgba(42,212,208,.45);
            pointer-events: none;
          }
          .lq-bus i {
            position: absolute;
            top: -4px;
            width: 8px; height: 8px;
            border-radius: 99px;
            background: var(--gold);
            box-shadow: 0 0 10px rgba(240,185,11,.8);
            animation: lqPkt 4.8s linear infinite;
          }
          .lq-bus i:nth-child(2) { animation-delay: 1.6s; }
          .lq-bus i:nth-child(3) { animation-delay: 3.2s; }
          .lq-legend { margin-left: 6px; }
        }

        @keyframes lqWave { 0%,100% { transform: translateX(-.4px); } 50% { transform: translateX(.4px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqFall { 0% { transform: translateY(-2px); opacity: .4; } 60%,100% { transform: none; opacity: 1; } }
        @keyframes lqPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        @keyframes lqGlowC { 0%,100% { box-shadow: 0 8px 18px -10px rgba(0,0,0,.55); } 50% { box-shadow: 0 0 0 4px rgba(42,212,208,.16), 0 8px 18px -10px rgba(0,0,0,.55); } }
        @keyframes lqGlowG { 0%,100% { box-shadow: 0 8px 18px -10px rgba(0,0,0,.55); } 50% { box-shadow: 0 0 0 4px rgba(240,185,11,.16), 0 8px 18px -10px rgba(0,0,0,.55); } }
        @keyframes lqPkt { from { left: 0; } to { left: 100%; } }

        @media (prefers-reduced-motion: reduce) {
          .lq-g path, .lq-g rect, .lq-g circle, .lq-orb, .lq-bus i, .lq-proc li { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
