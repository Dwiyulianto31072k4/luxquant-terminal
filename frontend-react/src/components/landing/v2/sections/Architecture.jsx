import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Family / ether.fi / Linear school: three editorial acts.
   Density tells the story — loud tape, one quiet call, then the venue.
   Not a diagram. Not a fake terminal. */

const TAPE = [
  { id: "price", label: "Price", icon: "price" },
  { id: "volume", label: "Volume", icon: "volume" },
  { id: "book", label: "Order book", icon: "book" },
  { id: "funding", label: "Funding", icon: "funding" },
  { id: "liqs", label: "Liquidations", icon: "liqs" },
  { id: "onchain", label: "On-chain", icon: "chain" },
  { id: "vol", label: "Volatility", icon: "wave" },
  { id: "breadth", label: "Breadth", icon: "grid" },
];

const CALLS = [
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

function Glyph({ type }) {
  const c = {
    className: `lq-glyph lq-glyph-${type}`,
    width: 15,
    height: 15,
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

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [idx, setIdx] = useState(0);
  const [on, setOn] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return undefined;
    const t = setInterval(() => {
      setOn(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % CALLS.length);
        setOn(true);
      }, 260);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const call = CALLS[idx];

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

        <div className="lq-acts">
          <article className="lq-act">
            <div className="lq-copy">
              <h3>The market is loud.</h3>
              <p>Eight live feeds. Always on.</p>
            </div>
            <div className="lq-stage" aria-label="Market tape">
              <ul className="lq-chips">
                {TAPE.map((row, i) => (
                  <li key={row.id} style={{ animationDelay: `${i * 0.18}s` }}>
                    <Glyph type={row.icon} />
                    {row.label}
                    <i />
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="lq-act lq-act-flip">
            <div className="lq-stage">
              <div className={`lq-note ${on ? "is-on" : ""}`} aria-live="polite">
                <span className={`lq-side lq-side-${call.side.toLowerCase()}`}>{call.side}</span>
                <strong>{call.pair}</strong>
                <em>{call.line}</em>
                <span className="lq-note-foot">You decide size</span>
              </div>
            </div>
            <div className="lq-copy">
              <h3>One written call.</h3>
              <p>Size and invalidation stay yours.</p>
            </div>
          </article>

          <article className="lq-act">
            <div className="lq-copy">
              <h3>You take it there.</h3>
              <p>You place it. We don&apos;t.</p>
            </div>
            <div className="lq-stage" aria-label="Venues">
              <ul className="lq-seals">
                {VENUES.map((v) => (
                  <li key={v.name}>
                    <img src={v.src} alt="" />
                    <span>{v.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>

        <div className="mt-12 flex justify-center">
          <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
            {isAuthenticated ? "See the full record" : "Verify the track record"}
            <BtnArrow />
          </PrimaryButton>
        </div>
      </div>

      <style>{`
        .lq-acts {
          display: flex;
          flex-direction: column;
          gap: 52px;
          margin-top: 48px;
        }
        .lq-act {
          display: grid;
          gap: 22px;
        }
        .lq-copy h3 {
          margin: 0;
          font-size: 22px;
          font-weight: 650;
          letter-spacing: -.03em;
          color: rgb(var(--ink) / 0.94);
        }
        .lq-copy p {
          margin: 8px 0 0;
          max-width: 28ch;
          font-size: 15.5px;
          line-height: 1.5;
          color: rgb(var(--ink) / 0.48);
        }
        .lq-chips {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .lq-chips li {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 10px 0 8px;
          border: 1px solid rgb(var(--ink) / 0.08);
          border-radius: 999px;
          background: rgb(var(--surface-raised) / 0.7);
          font-size: 12.5px;
          font-weight: 600;
          color: rgb(var(--ink) / 0.84);
          animation: lqFloat 3.6s ease-in-out infinite;
        }
        .lq-chips li i {
          width: 5px; height: 5px; border-radius: 99px;
          background: rgb(var(--accent));
          box-shadow: 0 0 7px rgb(var(--accent) / .7);
        }
        .lq-note {
          width: 100%;
          max-width: 340px;
          padding: 26px 26px 22px;
          border: 1px solid rgb(var(--ink) / 0.1);
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgb(var(--accent) / 0.07), transparent 42%),
            rgb(var(--surface-raised) / 0.92);
          box-shadow: 0 18px 50px -32px rgba(0,0,0,.28);
          opacity: 0;
          transform: translateY(8px);
          transition: opacity .3s ease, transform .3s ease;
        }
        .lq-note.is-on { opacity: 1; transform: none; }
        .lq-side {
          display: inline-flex;
          height: 22px;
          padding: 0 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .lq-side-long { background: #d4a017; color: #171304; }
        .lq-side-short {
          border: 1px solid rgb(var(--accent) / .55);
          color: rgb(var(--accent));
        }
        .lq-note strong {
          display: block;
          margin-top: 14px;
          font-size: 28px;
          font-weight: 750;
          letter-spacing: -.04em;
          color: rgb(var(--ink) / 0.94);
        }
        .lq-note em {
          display: block;
          margin-top: 8px;
          font-style: normal;
          font-size: 15px;
          line-height: 1.45;
          color: rgb(var(--ink) / 0.58);
        }
        .lq-note-foot {
          display: block;
          margin-top: 22px;
          padding-top: 14px;
          border-top: 1px solid rgb(var(--ink) / 0.08);
          font-size: 12px;
          font-weight: 600;
          color: rgb(var(--ink) / 0.4);
        }
        .lq-seals {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px 10px;
          max-width: 360px;
        }
        .lq-seals li {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .lq-seals img {
          width: 44px; height: 44px;
          border-radius: 99px;
          object-fit: cover;
          border: 1px solid rgb(var(--ink) / 0.1);
          background: rgb(var(--surface));
        }
        .lq-seals span {
          font-size: 11px;
          font-weight: 600;
          color: rgb(var(--ink) / 0.5);
        }
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

        @media (min-width: 860px) {
          .lq-acts { gap: 72px; margin-top: 64px; }
          .lq-act {
            grid-template-columns: 1fr 1fr;
            align-items: center;
            gap: 48px;
            min-height: 200px;
          }
          .lq-act-flip .lq-copy { order: 2; }
          .lq-act-flip .lq-stage { order: 1; }
          .lq-copy h3 { font-size: 28px; }
          .lq-copy p { font-size: 16.5px; }
          .lq-note { max-width: 360px; padding: 30px 30px 24px; }
          .lq-note strong { font-size: 34px; }
          .lq-seals { max-width: 400px; gap: 18px 12px; }
          .lq-seals img { width: 52px; height: 52px; }
        }

        @keyframes lqFloat {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes lqWave { 0%,100% { transform: translateX(-.5px); } 50% { transform: translateX(.5px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqDrop { 0% { transform: translateY(-2px); opacity: .4; } 60%,100% { transform: none; opacity: 1; } }
        @keyframes lqPkt { 0% { transform: translateX(-4px); opacity: 0; } 30%,70% { opacity: 1; } 100% { transform: translateX(6px); opacity: 0; } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7); } 50% { transform: scaleY(1.12); } }
        @keyframes lqSq { 0%,100% { opacity: .4; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

        @media (prefers-reduced-motion: reduce) {
          .lq-chips li, .lq-glyph path, .lq-glyph rect, .lq-glyph circle { animation: none !important; }
          .lq-note { opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}
