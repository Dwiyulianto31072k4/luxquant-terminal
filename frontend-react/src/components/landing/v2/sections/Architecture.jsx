import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Stripe craft + infra stack.
   Ingest → sanitize → engine → written call → your exchange.
   Gold pills, packet traces, dotted field. Solid gold hub. No plus. */

const FEEDS = [
  { id: "price", label: "Price", icon: "price" },
  { id: "volume", label: "Volume", icon: "volume" },
  { id: "book", label: "Book", icon: "book" },
  { id: "funding", label: "Funding", icon: "funding" },
  { id: "liqs", label: "Liqs", icon: "liqs" },
  { id: "onchain", label: "On-chain", icon: "chain" },
  { id: "vol", label: "Range", icon: "wave" },
  { id: "breadth", label: "Breadth", icon: "grid" },
];

const SCENES = [
  { feeds: FEEDS.map((f) => f.id), pair: "BTCUSDT", side: "Long" },
  { feeds: ["price", "book", "vol", "breadth"], pair: "ETHUSDT", side: "Short" },
  { feeds: ["funding", "liqs", "onchain", "volume"], pair: "SOLUSDT", side: "Long" },
  { feeds: ["price", "book", "funding", "onchain", "vol"], pair: "BTCUSDT", side: "Long" },
];

const VENUES = [
  { src: "/exchanges/binance.png", name: "Binance" },
  { src: "/exchanges/okx.png", name: "OKX" },
  { src: "/exchanges/bybit.png?v=2", name: "Bybit" },
  { src: "/exchanges/gate.png", name: "Gate" },
  { src: "/exchanges/bitget.png", name: "Bitget" },
  { src: "/exchanges/bingx.png?v=2", name: "BingX" },
];

const TRACES = [
  "M 50 4 C 50 36 400 36 400 76",
  "M 150 4 C 150 34 400 40 400 76",
  "M 250 4 C 250 32 400 44 400 76",
  "M 350 4 C 350 28 400 48 400 76",
  "M 450 4 C 450 28 400 48 400 76",
  "M 550 4 C 550 32 400 44 400 76",
  "M 650 4 C 650 34 400 40 400 76",
  "M 750 4 C 750 36 400 36 400 76",
];

function Glyph({ type }) {
  const c = {
    className: `lq-glyph lq-glyph-${type}`,
    width: 13,
    height: 13,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
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
      return null;
  }
}

function Pill({ label, icon, on, always }) {
  return (
    <div className={`lq-pill${on || always ? " is-on" : ""}${always ? " is-hold" : ""}`}>
      <span>
        {icon ? <Glyph type={icon} /> : null}
        {label}
      </span>
    </div>
  );
}

function Drop() {
  return (
    <svg className="lq-drop" viewBox="0 0 20 36" preserveAspectRatio="none" aria-hidden="true">
      <path d="M10 0v36" />
      <circle r="2.2" fill="#d4a017">
        <animateMotion dur="1.6s" repeatCount="indefinite" path="M10 0v36" />
      </circle>
    </svg>
  );
}

function useInView(ref) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setOn(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.18 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const stage = useRef(null);
  const visible = useInView(stage);
  const [scene, setScene] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    setReady(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return undefined;
    const t = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4000);
    return () => clearInterval(t);
  }, [visible]);

  const now = SCENES[scene];
  const feedOn = (id) => ready && now.feeds.includes(id);

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
          Market data in. A written call out.
          <span className="mt-2 block text-text-muted">You take it to your exchange.</span>
        </h2>
      </div>

      <div ref={stage} className="lq-pipe mx-auto mt-10 max-w-[1000px] px-4 lg:mt-14 lg:px-6">
        <div className="lq-pipe-dots" aria-hidden="true" />

        <div className="lq-ingest" aria-label="Market feeds">
          {FEEDS.map((f) => (
            <Pill key={f.id} label={f.label} icon={f.icon} on={feedOn(f.id)} />
          ))}
        </div>

        <svg className="lq-fan" viewBox="0 0 800 80" fill="none" aria-hidden="true">
          {TRACES.map((d) => (
            <path key={d} d={d} className="lq-fan-idle" />
          ))}
          {TRACES.map((d, i) => (
            <circle key={`p${i}`} r="2.1" fill="#d4a017" opacity={visible ? 1 : 0}>
              <animateMotion dur={`${1.8 + (i % 3) * 0.25}s`} begin={`${i * 0.18}s`} repeatCount="indefinite" path={d} />
            </circle>
          ))}
        </svg>

        <Pill label="Sanitize" always />

        <Drop />

        <div className="lq-engine" aria-hidden="true">
          <img src="/logo.png" alt="" />
          <span>LuxQuant</span>
        </div>

        <Drop />

        <div className="lq-setup-wrap" aria-live="polite">
          <div className="lq-pill is-on is-hold">
            <span>
              {now.pair}
              <i />
              {now.side}
            </span>
          </div>
        </div>

        <Drop />

        <ul className="lq-venues" aria-label="Venues">
          {VENUES.map((v) => (
            <li key={v.name}>
              <img src={v.src} alt={v.name} title={v.name} />
            </li>
          ))}
        </ul>
      </div>

      <p className="mx-auto mt-6 max-w-[640px] px-4 text-center text-[13px] leading-relaxed text-text-muted">
        Eight live feeds. One engine. You place it.
      </p>

      <div className="mt-8 flex justify-center px-4">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
      </div>

      <style>{`
        .lq-pipe {
          --pill: #d4a017;
          --ink-on: #171304;
          --ease: cubic-bezier(.4, 0, .2, 1);
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 28px 16px 26px;
          border: 1px solid rgb(var(--ink) / 0.08);
          border-radius: 20px;
          background: rgb(var(--surface-raised) / 0.45);
          overflow: hidden;
        }
        .lq-pipe-dots {
          position: absolute;
          inset: -40px 0;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px;
          opacity: .38;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 28%, #737373 72%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 28%, #737373 72%, transparent);
          pointer-events: none;
        }
        .lq-ingest {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          width: min(100%, 720px);
        }
        .lq-pill {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          border: 1px dashed rgb(var(--accent) / 0.28);
          border-radius: 6px;
          transition: border-color .45s var(--ease);
        }
        .lq-pill > span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          height: 32px;
          padding: 0 10px;
          border-radius: 6px;
          background: var(--pill);
          color: var(--ink-on);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -.01em;
          white-space: nowrap;
          opacity: 0;
          transform: scale(.78);
          transition: opacity .45s var(--ease), transform .45s var(--ease);
          box-shadow: 0 14px 21px -14px rgb(var(--scrim) / 0.28);
        }
        .lq-pill.is-on { border-color: transparent; }
        .lq-pill.is-on > span { opacity: 1; transform: none; }
        .lq-pill.is-hold { width: auto; min-width: 132px; }
        .lq-pill i {
          width: 3px; height: 3px; border-radius: 99px;
          background: var(--ink-on);
          opacity: .45;
        }
        .lq-fan {
          display: none;
          width: min(100%, 720px);
          height: 72px;
          margin: 2px 0 6px;
        }
        .lq-fan-idle {
          stroke: rgb(var(--accent) / 0.28);
          stroke-dasharray: 2 3;
          stroke-width: 1.1;
        }
        .lq-drop {
          display: block;
          width: 12px;
          height: 28px;
          color: rgb(var(--accent) / 0.35);
        }
        .lq-drop path {
          stroke: currentColor;
          stroke-dasharray: 2 3;
          stroke-width: 1.2;
        }
        .lq-engine {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 88px;
          height: 88px;
          border-radius: 14px;
          background: #d4a017;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.38),
            0 20px 36px -18px rgba(212,160,23,.55);
        }
        .lq-engine img {
          width: 28px; height: 28px;
          border-radius: 7px;
          object-fit: cover;
        }
        .lq-engine span {
          margin-top: 6px;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: #171304;
        }
        .lq-setup-wrap { position: relative; z-index: 1; }
        .lq-venues {
          position: relative;
          z-index: 1;
          list-style: none;
          margin: 2px 0 0;
          padding: 0;
          display: flex;
          gap: 10px;
        }
        .lq-venues img {
          width: 28px; height: 28px;
          border-radius: 99px;
          object-fit: cover;
          border: 1px solid rgb(var(--ink) / 0.1);
          background: rgb(var(--surface));
        }
        .lq-glyph { color: var(--ink-on); flex: 0 0 auto; }
        .lq-glyph path, .lq-glyph rect {
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
        .lq-glyph-liqs .lq-g-drop { animation: lqFall 1.6s ease-in-out infinite; }
        .lq-glyph-wave .lq-g-main { animation: lqVol 2.1s ease-in-out infinite; }
        .lq-glyph-grid .lq-g-s1 { animation: lqSq 2.4s ease-in-out 0s infinite; }
        .lq-glyph-grid .lq-g-s2 { animation: lqSq 2.4s ease-in-out .3s infinite; }
        .lq-glyph-grid .lq-g-s3 { animation: lqSq 2.4s ease-in-out .6s infinite; }
        .lq-glyph-grid .lq-g-s4 { animation: lqSq 2.4s ease-in-out .9s infinite; }

        @media (min-width: 760px) {
          .lq-pipe { padding: 36px 28px 30px; }
          .lq-fan { display: block; }
          .lq-drop { height: 34px; }
          .lq-engine { width: 96px; height: 96px; border-radius: 16px; }
          .lq-venues img { width: 32px; height: 32px; }
          .lq-pill > span { font-size: 13px; }
        }

        @keyframes lqWave { 0%,100% { transform: translateX(-.4px); } 50% { transform: translateX(.4px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqFall { 0% { transform: translateY(-2px); opacity: .4; } 60%,100% { transform: none; opacity: 1; } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7); } 50% { transform: scaleY(1.12); } }
        @keyframes lqSq { 0%,100% { opacity: .45; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }

        @media (prefers-reduced-motion: reduce) {
          .lq-pill > span { transition: none !important; }
          .lq-fan circle, .lq-drop circle,
          .lq-glyph path, .lq-glyph rect { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
