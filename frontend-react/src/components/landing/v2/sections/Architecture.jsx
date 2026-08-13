import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Konten.com hero: loose V→L→V spokes into a flat brand tile.
   Data in → LuxQuant → trade setup → desk → execute on your exchange. */

const FEEDS = [
  { id: "price", label: "Price", icon: "price" },
  { id: "volume", label: "Volume", icon: "volume" },
  { id: "book", label: "Order book", icon: "book" },
  { id: "funding", label: "Funding", icon: "funding" },
  { id: "liqs", label: "Liquidations", icon: "liqs" },
  { id: "onchain", label: "On-chain", icon: "chain" },
  { id: "vol", label: "Volatility", icon: "wave" },
  { id: "breadth", label: "Breadth", icon: "grid" },
];

const VENUE_LOGOS = [
  "/exchanges/binance.png",
  "/exchanges/okx.png",
  "/exchanges/bybit.png?v=2",
  "/exchanges/gate.png",
  "/exchanges/bitget.png",
  "/exchanges/bingx.png?v=2",
];

const DW = 1120;
const DH = 620;

function box(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
}

/** Konten.com: V → diagonal L → V (or H → L → H from the side). */
function spokeIn(from, hub) {
  if (from.b < hub.y - 8) {
    const drop = from.b + 34;
    const approach = hub.y - 26;
    return `M${from.cx} ${from.b} V${drop} L${hub.cx} ${approach} V${hub.y}`;
  }
  if (from.r < hub.x) {
    const out = from.r + 42;
    const inn = hub.x - 22;
    return `M${from.r} ${from.cy} H${out} L${inn} ${hub.cy} H${hub.x}`;
  }
  const out = from.x - 42;
  const inn = hub.r + 22;
  return `M${from.x} ${from.cy} H${out} L${inn} ${hub.cy} H${hub.r}`;
}

function spokeOut(from, to) {
  const leave = from.b + 26;
  const approach = to.y - 22;
  return `M${from.cx} ${from.b} V${leave} L${to.cx} ${approach} V${to.y}`;
}

function Glyph({ type }) {
  const c = {
    className: `lq-glyph lq-glyph-${type}`,
    width: 15,
    height: 15,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
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
    case "plan":
      return (
        <svg {...c}>
          <circle cx="10" cy="10" r="6.5" />
          <circle className="lq-g-pulse" cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "desk":
      return (
        <svg {...c}>
          <rect x="2" y="4" width="16" height="10" rx="1.6" />
          <path d="M7 17h6M10 14v3" />
        </svg>
      );
    case "check":
      return <svg {...c}><path className="lq-g-pulse" d="m4 10 4 4 8-8" /></svg>;
    case "exchange":
      return <svg {...c}><path d="M4 8h12M4 12h12M8 4v12M12 4v12" /></svg>;
    default:
      return <svg {...c}><circle cx="10" cy="10" r="6" /></svg>;
  }
}

function useFitScale(ref, designWidth) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / designWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [designWidth, ref]);
  return scale;
}

const D = (() => {
  const hub = box(500, 228, 120, 120);
  const left = [
    box(36, 48, 148, 40),
    box(72, 148, 148, 40),
    box(36, 248, 148, 40),
    box(72, 348, 148, 40),
  ];
  const right = [
    box(936, 48, 148, 40),
    box(900, 148, 148, 40),
    box(936, 248, 148, 40),
    box(900, 348, 148, 40),
  ];
  const setup = box(472, 420, 176, 40);
  const desk = box(280, 532, 156, 40);
  const exec = box(500, 532, 200, 40);
  const record = box(748, 532, 156, 40);
  const feeds = [...left, ...right];
  const intoHub = feeds.map((f) => spokeIn(f, hub));
  const outHub = [spokeOut(hub, setup), spokeOut(setup, desk), spokeOut(setup, exec), spokeOut(setup, record)];
  return { hub, left, right, feeds, setup, desk, exec, record, intoHub, outHub };
})();

function Desktop() {
  const host = useRef(null);
  const scale = useFitScale(host, DW);
  return (
    <div ref={host} className="relative w-full" style={{ height: DH * scale }}>
      <div
        className="absolute top-0"
        style={{
          width: DW,
          height: DH,
          left: "50%",
          marginLeft: -DW / 2,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        <svg className="pointer-events-none absolute inset-0 z-[1] overflow-visible" viewBox={`0 0 ${DW} ${DH}`} fill="none">
          {[...D.intoHub, ...D.outHub].map((d, i) => (
            <path key={`b${i}`} d={d} className="lq-flow" />
          ))}
          {D.intoHub.map((d, i) => (
            <path key={`i${i}`} d={d} className="lq-flow-move" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
          {D.outHub.map((d, i) => (
            <path key={`o${i}`} d={d} className="lq-flow-move is-out" style={{ animationDelay: `${0.3 + i * 0.15}s` }} />
          ))}
        </svg>

        {D.left.map((n, i) => (
          <div key={FEEDS[i].id} className="lq-pill" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
            <Glyph type={FEEDS[i].icon} />
            {FEEDS[i].label}
          </div>
        ))}
        {D.right.map((n, i) => (
          <div key={FEEDS[i + 4].id} className="lq-pill" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
            <Glyph type={FEEDS[i + 4].icon} />
            {FEEDS[i + 4].label}
          </div>
        ))}

        <div className="lq-hub" style={{ left: D.hub.x, top: D.hub.y, width: D.hub.w, height: D.hub.h }}>
          <img src="/logo.png" alt="LuxQuant" />
        </div>

        <div className="lq-pill" style={{ left: D.setup.x, top: D.setup.y, width: D.setup.w, height: D.setup.h }}>
          <Glyph type="plan" />
          Trade setup
        </div>
        <div className="lq-pill" style={{ left: D.desk.x, top: D.desk.y, width: D.desk.w, height: D.desk.h }}>
          <Glyph type="desk" />
          Your terminal
        </div>
        <div className="lq-exec" style={{ left: D.exec.x, top: D.exec.y, width: D.exec.w, height: D.exec.h }}>
          <Glyph type="exchange" />
          <span>Execute</span>
          <span className="lq-exec-logos">
            {VENUE_LOGOS.map((src) => (
              <img key={src} src={src} alt="" />
            ))}
          </span>
        </div>
        <div className="lq-pill" style={{ left: D.record.x, top: D.record.y, width: D.record.w, height: D.record.h }}>
          <Glyph type="check" />
          Public record
        </div>
      </div>
    </div>
  );
}

function Mobile() {
  return (
    <div className="lq-m">
      <div className="lq-m-feeds">
        {FEEDS.map((f) => (
          <span key={f.id} className="lq-chip">
            <Glyph type={f.icon} />
            {f.label}
          </span>
        ))}
      </div>
      <span className="lq-m-line" aria-hidden="true" />
      <div className="lq-hub lq-hub-m">
        <img src="/logo.png" alt="LuxQuant" />
      </div>
      <span className="lq-m-line" aria-hidden="true" />
      <span className="lq-chip lq-chip-lg">
        <Glyph type="plan" />
        Trade setup
      </span>
      <span className="lq-m-line" aria-hidden="true" />
      <span className="lq-chip lq-chip-lg">
        <Glyph type="desk" />
        Your terminal
      </span>
      <span className="lq-m-line" aria-hidden="true" />
      <div className="lq-m-end">
        <span className="lq-chip">
          <Glyph type="check" />
          Public record
        </span>
        <span className="lq-exec lq-exec-m">
          <Glyph type="exchange" />
          Execute
          <span className="lq-exec-logos">
            {VENUE_LOGOS.map((src) => (
              <img key={src} src={src} alt="" />
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

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
      <div className="mx-auto w-full max-w-[1120px] px-4 lg:px-8">
        <h2 className="max-w-4xl text-[28px] font-semibold leading-[1.28] tracking-[-0.025em] sm:text-[34px] lg:text-[40px]">
          <span className="text-text-primary">Market data in. A setup out. </span>
          <span className="text-text-muted">You execute on your exchange — the record stays public.</span>
        </h2>
      </div>

      <div className="lq-sys relative mx-auto mt-10 w-full max-w-[1160px] px-3 sm:mt-12 sm:px-6">
        <div className="lq-sys-dots" aria-hidden="true" />
        <div className="relative hidden lg:block">
          <Desktop />
        </div>
        <div className="relative lg:hidden">
          <Mobile />
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2.5 px-4">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
      </div>

      <style>{`
        .lq-sys { --pill: rgb(var(--accent)); --ink: #171304; }
        .lq-sys-dots {
          position: absolute; inset: -48px 0 -56px;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px; opacity: .38; pointer-events: none;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 14%, #737373 86%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 14%, #737373 86%, transparent);
        }
        .lq-flow {
          stroke: rgb(var(--accent) / 0.32);
          stroke-width: 1.35;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }
        .lq-flow-move {
          fill: none;
          stroke: #e8b84a;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 14 28;
          filter: drop-shadow(0 0 4px rgba(232, 184, 74, .55));
          animation: lqTravel 2.4s linear infinite;
        }
        .lq-flow-move.is-out { animation-duration: 2.8s; }
        @keyframes lqTravel { to { stroke-dashoffset: -42; } }

        .lq-pill, .lq-exec {
          position: absolute; z-index: 4;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border-radius: 10px; background: var(--pill); color: var(--ink);
          font-size: 13px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
        }
        .lq-exec { padding: 0 12px; }
        .lq-exec-logos { display: inline-flex; gap: 3px; margin-left: 4px; }
        .lq-exec-logos img { width: 16px; height: 16px; border-radius: 4px; object-fit: cover; }

        .lq-hub {
          position: absolute; z-index: 8;
          display: grid; place-items: center;
          border-radius: 28px;
          background: #d4a017;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.38),
            inset 0 -10px 18px rgba(90,55,0,.16),
            0 18px 36px -18px rgba(212,160,23,.5);
        }
        .lq-hub img { width: 48px; height: 48px; border-radius: 12px; object-fit: cover; }

        .lq-glyph { flex: 0 0 auto; overflow: visible; }
        .lq-glyph path, .lq-glyph rect, .lq-glyph circle { transform-box: fill-box; transform-origin: center; }
        .lq-glyph-price .lq-g-main { animation: lqWave 2.6s ease-in-out infinite; }
        .lq-glyph-volume .lq-g-b1 { animation: lqBar 1.6s ease-in-out -.1s infinite; }
        .lq-glyph-volume .lq-g-b2 { animation: lqBar 1.6s ease-in-out -.5s infinite; }
        .lq-glyph-volume .lq-g-b3 { animation: lqBar 1.6s ease-in-out -.9s infinite; }
        .lq-glyph-volume .lq-g-b4 { animation: lqBar 1.6s ease-in-out -.3s infinite; }
        .lq-glyph-book .lq-g-bl { animation: lqBookL 2.4s ease-in-out infinite; }
        .lq-glyph-book .lq-g-br { animation: lqBookR 2.4s ease-in-out infinite; }
        .lq-glyph-liqs .lq-g-drop { animation: lqDrop 1.6s cubic-bezier(.4,0,.2,1) infinite; }
        .lq-glyph-chain .lq-g-pkt { animation: lqPkt 1.8s cubic-bezier(.4,0,.2,1) infinite; }
        .lq-glyph-wave .lq-g-main { animation: lqVol 2.1s ease-in-out infinite; }
        .lq-glyph-grid .lq-g-s1 { animation: lqSq 2.4s ease-in-out 0s infinite; }
        .lq-glyph-grid .lq-g-s2 { animation: lqSq 2.4s ease-in-out .3s infinite; }
        .lq-glyph-grid .lq-g-s3 { animation: lqSq 2.4s ease-in-out .6s infinite; }
        .lq-glyph-grid .lq-g-s4 { animation: lqSq 2.4s ease-in-out .9s infinite; }
        .lq-glyph-plan .lq-g-pulse, .lq-glyph-check .lq-g-pulse { animation: lqPulse 2s ease-in-out infinite; }

        .lq-m { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 0; padding: 8px 4px 16px; }
        .lq-m-feeds { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
        .lq-chip {
          display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
          border-radius: 10px; background: var(--pill); color: var(--ink);
          font-size: 12.5px; font-weight: 700;
        }
        .lq-chip-lg { height: 40px; padding: 0 16px; }
        .lq-m-line {
          width: 1.5px; height: 22px; margin: 10px 0;
          background: repeating-linear-gradient(to bottom, #e8b84a 0 4px, transparent 4px 8px);
        }
        .lq-hub-m { position: relative; width: 96px; height: 96px; margin: 4px 0; }
        .lq-m-end { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
        .lq-exec-m { position: relative; height: 40px; }

        @keyframes lqWave { 0%,100% { transform: translateX(-.6px); } 50% { transform: translateX(.6px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqPulse { 0%,100% { opacity: .55; transform: scale(.86); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes lqDrop { 0% { transform: translateY(-2px); opacity: .4; } 55%,100% { transform: none; opacity: 1; } }
        @keyframes lqPkt { 0% { transform: translateX(-4px); opacity: 0; } 30%,70% { opacity: 1; } 100% { transform: translateX(7px); opacity: 0; } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7); } 50% { transform: scaleY(1.14); } }
        @keyframes lqSq { 0%,100% { opacity: .45; transform: scale(.78); } 40% { opacity: 1; transform: scale(1); } }

        @media (prefers-reduced-motion: reduce) {
          .lq-glyph path, .lq-glyph rect, .lq-glyph circle, .lq-glyph, .lq-flow-move { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
