import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

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

const YOU_GET = [
  { id: "call", label: "The call", icon: "signal" },
  { id: "alerts", label: "Alerts", icon: "bell" },
  { id: "record", label: "The record", icon: "check" },
  { id: "agent", label: "Agent optional", icon: "agent" },
];

const LOGO = (f) => `/exchanges/${f}`;
const LOGO_SET_A = [
  LOGO("binance.png"),
  LOGO("okx.png"),
  LOGO("bybit.png?v=2"),
  LOGO("gate.png"),
  LOGO("bitget.png"),
  LOGO("bingx.png?v=2"),
];
const LOGO_SET_B = [
  LOGO("mexc.png"),
  LOGO("kucoin.png"),
  LOGO("coinbase.png"),
  LOGO("htx.png"),
  LOGO("cryptocom.png"),
  LOGO("upbit.png"),
];
const LOGO_CELLS = LOGO_SET_A.map((a, i) => [a, LOGO_SET_B[i], a, LOGO_SET_B[i]]);

const DW = 1080;
const DH = 600;
const PH = 36;

function box(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
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
      return (
        <svg {...c}>
          <path className="lq-g-main" d="M2 13h2.2L6.2 6l2.6 9 2-5.4 1.6 2.2H18" />
        </svg>
      );
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
      return (
        <svg {...c}>
          <path d="M10 3v14M7 6.5c.8-1.4 5.4-2 5.4.8 0 3.2-6 1.6-6 4.6 0 2.4 4.2 2.2 5.6.6" />
        </svg>
      );
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
      return (
        <svg {...c}>
          <path className="lq-g-main" d="M2 11c2.2 0 2.2-5 4.4-5s2.2 8 4.4 8 2.2-6 4.4-6c1.2 0 1.8 1 2.8 2" />
        </svg>
      );
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
    case "signal":
      return (
        <svg {...c}>
          <path className="lq-g-b1" d="M4 16V10" />
          <path className="lq-g-b2" d="M8 16V6" />
          <path className="lq-g-b3" d="M12 16v-5" />
          <path className="lq-g-b4" d="M16 16V4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...c}>
          <path className="lq-g-bell" d="M5 14h10l-1.3-2V8a3.7 3.7 0 0 0-7.4 0v4zM8.5 16.5h3" />
        </svg>
      );
    case "check":
      return (
        <svg {...c}>
          <path className="lq-g-pulse" d="m4 10 4 4 8-8" />
        </svg>
      );
    case "agent":
      return (
        <svg {...c}>
          <rect className="lq-g-bot" x="3" y="5" width="14" height="11" rx="3" />
          <path d="M10 2v3M7 10h.01M13 10h.01M7 13h6" />
        </svg>
      );
    case "exchange":
      return (
        <svg {...c}>
          <path d="M4 8h12M4 12h12M8 4v12M12 4v12" />
        </svg>
      );
    default:
      return (
        <svg {...c}>
          <circle cx="10" cy="10" r="6" />
        </svg>
      );
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

function Plane({ width, height, children }) {
  const host = useRef(null);
  const scale = useFitScale(host, width);
  return (
    <div ref={host} className="relative w-full" style={{ height: height * scale }}>
      <div
        className="absolute top-0"
        style={{
          width,
          height,
          left: "50%",
          marginLeft: -width / 2,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FlipLogo({ items, scene, delay, running }) {
  const wrap = useRef(null);
  const flips = useRef(0);
  const prev = useRef(-1);
  const timer = useRef(null);
  const [front, setFront] = useState(0);
  const [back, setBack] = useState(1);

  const onEnd = useCallback(
    (e) => {
      if (e.propertyName !== "transform") return;
      const next = (scene + 1) % items.length;
      if (scene % 2 === 0) setBack(next);
      else setFront(next);
    },
    [scene, items.length],
  );

  useEffect(() => {
    if (!running || scene === prev.current) return undefined;
    prev.current = scene;
    const n = flips.current;
    if (n !== 0) {
      timer.current = setTimeout(() => {
        if (wrap.current) wrap.current.style.transform = `rotateX(${180 * n}deg)`;
      }, delay);
    }
    flips.current += 1;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scene, delay, running]);

  return (
    <div className="lq-app">
      <div ref={wrap} className="lq-app-flip" onTransitionEnd={onEnd}>
        <div className="lq-app-face is-front">
          <img src={items[front]} alt="" />
        </div>
        <div className="lq-app-face is-back">
          <img src={items[back]} alt="" />
        </div>
      </div>
    </div>
  );
}

function LogoGrid({ scene, running, compact }) {
  return (
    <div className={`lq-apps${compact ? " is-compact" : ""}`}>
      {LOGO_CELLS.map((items, i) => (
        <FlipLogo key={i} items={items} scene={scene} delay={i * 80} running={running} />
      ))}
    </div>
  );
}

const D = (() => {
  const tw = 122;
  const tg = 6;
  const t0 = (DW - (8 * tw + 7 * tg)) / 2;
  const T = FEEDS.map((_, i) => box(t0 + i * (tw + tg), 40, tw, PH));
  const hub = box(486, 196, 108, 108);
  const drop = 92;
  const venues = box(248, 234, 136, PH);
  const record = box(696, 234, 136, PH);
  const logos = box(56, 198, 160, 108);
  const dest = box(980, 230, 40, 40);
  const plan = box(360, 344, 360, 56);
  const desk = box(472, 434, 136, PH);
  const ow = 168;
  const og = 14;
  const o0 = (DW - (4 * ow + 3 * og)) / 2;
  const O = YOU_GET.map((_, i) => box(o0 + i * (ow + og), 534, ow, PH));
  const neck = desk.b + 20;
  const intoHub = T.map((t) => `M${t.cx} ${t.b} V${drop} H${hub.cx} V${hub.y}`);
  const outHub = [
    `M${logos.r} ${hub.cy} H${venues.x}`,
    `M${venues.r} ${hub.cy} H${hub.x}`,
    `M${hub.r} ${hub.cy} H${record.x}`,
    `M${record.r} ${hub.cy} H${dest.x}`,
    `M${hub.cx} ${hub.b} V${plan.y}`,
    `M${plan.cx} ${plan.b} V${desk.y}`,
    ...O.map((o) => `M${desk.cx} ${desk.b} V${neck} H${o.cx} V${o.y}`),
  ];
  return { T, plan, hub, venues, record, logos, dest, desk, O, intoHub, outHub };
})();

function Desktop({ scene, running }) {
  return (
    <Plane width={DW} height={DH}>
      <svg className="pointer-events-none absolute inset-0 z-[1]" viewBox={`0 0 ${DW} ${DH}`} fill="none" aria-hidden="true">
        {[...D.intoHub, ...D.outHub].map((d, i) => (
          <path key={`base-${i}`} d={d} className="lq-flow" />
        ))}
        {D.intoHub.map((d, i) => (
          <path key={`in-${i}`} d={d} className="lq-flow-move is-in" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
        {D.outHub.map((d, i) => (
          <path key={`out-${i}`} d={d} className="lq-flow-move is-out" style={{ animationDelay: `${0.4 + i * 0.08}s` }} />
        ))}
      </svg>
      <div className="lq-tag" style={{ left: D.T[0].x, top: 14, width: 360 }}>
        1 · Every feed we actually read
      </div>
      {D.T.map((n, i) => (
        <div key={FEEDS[i].id} className="lq-pill" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
          <Glyph type={FEEDS[i].icon} />
          {FEEDS[i].label}
        </div>
      ))}
      <div className="lq-tag" style={{ left: D.plan.x, top: D.plan.y - 22, width: D.plan.w }}>
        2 · Trade projection setup
      </div>
      <div className="lq-plan" style={{ left: D.plan.x, top: D.plan.y, width: D.plan.w, height: D.plan.h }}>
        <Glyph type="plan" />
        <span>
          <strong>Trade projection setup</strong>
          <em>Entry · TP1–TP4 · Stop</em>
        </span>
      </div>
      <div className="lq-apps" style={{ left: D.logos.x, top: D.logos.y, width: D.logos.w, height: D.logos.h }}>
        {LOGO_CELLS.map((items, i) => (
          <FlipLogo key={i} items={items} scene={scene} delay={i * 80} running={running} />
        ))}
      </div>
      <div className="lq-pill" style={{ left: D.venues.x, top: D.venues.y, width: D.venues.w, height: D.venues.h }}>
        <Glyph type="exchange" />
        Your exchange
      </div>
      <div className="lq-hub" style={{ left: D.hub.x, top: D.hub.y, width: D.hub.w, height: D.hub.h }}>
        <img src="/logo.png" alt="" />
        <span>luxquant</span>
      </div>
      <div className="lq-pill" style={{ left: D.record.x, top: D.record.y, width: D.record.w, height: D.record.h }}>
        <Glyph type="check" />
        Public record
      </div>
      <div className="lq-dest" style={{ left: D.dest.x, top: D.dest.y, width: D.dest.w, height: D.dest.h }}>
        <Glyph type="check" />
      </div>
      <div className="lq-tag" style={{ left: D.desk.x - 10, top: D.desk.y - 22, width: 220 }}>
        3 · It lands on your desk
      </div>
      <div className="lq-pill" style={{ left: D.desk.x, top: D.desk.y, width: D.desk.w, height: D.desk.h }}>
        <Glyph type="desk" />
        Your terminal
      </div>
      <div className="lq-tag" style={{ left: D.O[0].x, top: D.O[0].y - 22, width: 280 }}>
        4 · What you walk away with
      </div>
      {D.O.map((n, i) => (
        <div key={YOU_GET[i].id} className="lq-pill" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
          <Glyph type={YOU_GET[i].icon} />
          {YOU_GET[i].label}
        </div>
      ))}
    </Plane>
  );
}

function Mobile({ scene, running }) {
  return (
    <div className="lq-m">
      <p className="lq-m-tag">1 · Every feed we actually read</p>
      <div className="lq-m-feeds">
        {FEEDS.map((f) => (
          <span key={f.id} className="lq-chip">
            <Glyph type={f.icon} />
            {f.label}
          </span>
        ))}
      </div>

      <span className="lq-m-line" aria-hidden="true" />

      <p className="lq-m-tag">2 · Trade projection setup</p>
      <div className="lq-plan lq-plan-m">
        <Glyph type="plan" />
        <span>
          <strong>Trade projection setup</strong>
          <em>Entry · TP1–TP4 · Stop</em>
        </span>
      </div>

      <span className="lq-m-line" aria-hidden="true" />

      <div className="lq-m-mid">
        <LogoGrid scene={scene} running={running} compact />
        <div className="lq-hub lq-hub-m">
          <img src="/logo.png" alt="" />
          <span>luxquant</span>
        </div>
        <div className="lq-m-side">
          <span className="lq-chip">
            <Glyph type="exchange" />
            Exchange
          </span>
          <span className="lq-chip">
            <Glyph type="check" />
            Record
          </span>
        </div>
      </div>

      <span className="lq-m-line" aria-hidden="true" />

      <p className="lq-m-tag">3 · It lands on your desk</p>
      <div className="lq-chip lq-chip-lg">
        <Glyph type="desk" />
        Your terminal
      </div>

      <span className="lq-m-line" aria-hidden="true" />

      <p className="lq-m-tag">4 · What you walk away with</p>
      <div className="lq-m-out">
        {YOU_GET.map((o) => (
          <span key={o.id} className="lq-chip">
            <Glyph type={o.icon} />
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const root = useRef(null);
  const [scene, setScene] = useState(0);
  const [pageOn, setPageOn] = useState(() => typeof document === "undefined" || !document.hidden);
  const [inView, setInView] = useState(false);
  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageOn(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const live = inView && pageOn && !reduce;
  useEffect(() => {
    if (!live) return undefined;
    const tick = setInterval(() => setScene((s) => (s + 1) % 4), 4000);
    return () => clearInterval(tick);
  }, [live]);

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
          <span className="text-text-primary">Lots of market data. One written plan. </span>
          <span className="text-text-muted">Then it shows up on your desk — and stays on the record.</span>
        </h2>
      </div>

      <div ref={root} className="lq-sys relative mx-auto mt-8 w-full max-w-[1120px] px-3 sm:mt-10 sm:px-6">
        <div className="lq-sys-dots" aria-hidden="true" />
        <div className="relative hidden lg:block">
          <Desktop scene={scene} running={live} />
        </div>
        <div className="relative lg:hidden">
          <Mobile scene={scene} running={live} />
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-2xl px-4 text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[15px]">
        Eight feeds go in. One call comes out — entry, targets, and a stop. You follow it in the terminal, or let Agent help.
      </p>

      <div className="mt-6 flex flex-col items-center gap-2.5 px-4">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
        <p className="text-center text-[10.5px] leading-relaxed text-text-muted">
          Every call preserved. No selective screenshots.
        </p>
      </div>

      <style>{`
        .lq-sys { --line: rgb(var(--accent) / 0.45); --pill: rgb(var(--accent)); --ink: #171304; }
        .lq-sys-dots {
          position: absolute; inset: -36px 0 -44px;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px; opacity: .4; pointer-events: none;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 16%, #737373 84%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 16%, #737373 84%, transparent);
        }
        .lq-flow { stroke: rgb(var(--accent) / 0.28); stroke-width: 1.15; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .lq-flow-move {
          fill: none; stroke-linecap: round; stroke-linejoin: round;
          stroke: #f0c84a; stroke-width: 1.7;
          stroke-dasharray: 10 22;
          filter: drop-shadow(0 0 3px rgba(240, 200, 74, .7));
          animation: lqTravel 1.7s linear infinite;
        }
        .lq-flow-move.is-in { animation-duration: 1.55s; }
        .lq-flow-move.is-out { animation-duration: 2.1s; stroke: #e7b72d; }
        @keyframes lqTravel { to { stroke-dashoffset: -32; } }
        .lq-plan {
          position: absolute; z-index: 5;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          border-radius: 10px; background: var(--pill); color: var(--ink);
          box-shadow: 0 16px 28px -18px rgb(var(--scrim) / 0.4);
        }
        .lq-plan span { display: flex; flex-direction: column; line-height: 1.15; }
        .lq-plan strong { font-size: 13.5px; font-weight: 750; letter-spacing: -0.02em; }
        .lq-plan em { margin-top: 2px; font-style: normal; font-size: 11.5px; font-weight: 650; opacity: .72; }
        .lq-plan-m { position: relative; width: min(100%, 300px); height: 56px; }
        .lq-pill, .lq-hub, .lq-apps, .lq-dest, .lq-tag { position: absolute; z-index: 4; box-sizing: border-box; }
        .lq-tag {
          z-index: 6; font-size: 10px; font-weight: 700; letter-spacing: .14em;
          text-transform: uppercase; color: rgb(var(--accent)); line-height: 1; pointer-events: none;
        }
        .lq-pill, .lq-chip {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: 8px; background: var(--pill); color: var(--ink);
          font-size: 12px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
        }
        .lq-pill { position: absolute; }
        .lq-glyph { flex: 0 0 auto; overflow: visible; }
        .lq-glyph path, .lq-glyph rect, .lq-glyph circle { transform-box: fill-box; transform-origin: center; }
        .lq-hub {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 7; border-radius: 10px;
          background: linear-gradient(288deg, #3a2a0c -7%, #d4a017 106%);
          box-shadow: 0 0 0 8px rgb(var(--accent) / 0.08), 0 22px 40px -16px rgb(var(--scrim) / 0.55);
        }
        .lq-hub::after {
          content: "";
          position: absolute; inset: -28px; z-index: -1; border-radius: 28px;
          background: radial-gradient(circle, rgb(var(--accent) / 0.28), transparent 68%);
          pointer-events: none;
        }
        .lq-hub img { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; }
        .lq-hub span { margin-top: 4px; color: #fbf3da; font-size: 9px; font-weight: 750; letter-spacing: -.04em; }
        .lq-apps {
          display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr);
          gap: 6px; padding: 8px; border-radius: 10px;
          background: rgb(var(--surface) / 0.75); border: 1px solid rgb(var(--ink) / 0.06);
        }
        .lq-app { position: relative; border-radius: 6px; perspective: 240px; min-height: 0; overflow: hidden; }
        .lq-app-flip { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform 2s cubic-bezier(.9,0,.1,1); }
        .lq-app-face { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; border-radius: 6px; background: #111; backface-visibility: hidden; }
        .lq-app-face.is-back { transform: rotateX(180deg); }
        .lq-app-face img { width: 100%; height: 100%; object-fit: cover; }
        .lq-dest { display: grid; place-items: center; border-radius: 8px; background: #f4f1ea; color: #171304; }

        /* Mobile: native vertical story, not a scaled desktop plane */
        .lq-m { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; padding: 8px 4px 12px; }
        .lq-m-tag {
          margin: 0 0 8px; font-size: 10px; font-weight: 700; letter-spacing: .14em;
          text-transform: uppercase; color: rgb(var(--accent)); text-align: center;
        }
        .lq-m-feeds, .lq-m-out {
          display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%;
        }
        .lq-chip { position: relative; height: 34px; padding: 0 10px; }
        .lq-chip-lg { height: 38px; padding: 0 16px; font-size: 13px; }
        .lq-m-line {
          width: 1px; height: 18px; margin: 8px 0;
          background: repeating-linear-gradient(to bottom, rgb(var(--accent) / 0.5) 0 2px, transparent 2px 5px);
        }
        .lq-m-mid { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
        .lq-apps.is-compact { position: relative; width: 168px; height: 108px; }
        .lq-hub-m { position: relative; width: 72px; height: 72px; }
        .lq-m-side { display: flex; gap: 8px; }

        /* Icon motion — same idea as the old architecture glyphs */
        .lq-glyph-price .lq-g-main { animation: lqWave 2.6s ease-in-out infinite; }
        .lq-glyph-volume .lq-g-b1 { animation: lqBar 1.6s ease-in-out -.1s infinite; }
        .lq-glyph-volume .lq-g-b2 { animation: lqBar 1.6s ease-in-out -.5s infinite; }
        .lq-glyph-volume .lq-g-b3 { animation: lqBar 1.6s ease-in-out -.9s infinite; }
        .lq-glyph-volume .lq-g-b4 { animation: lqBar 1.6s ease-in-out -.3s infinite; }
        .lq-glyph-book .lq-g-bl { animation: lqBookL 2.4s ease-in-out infinite; }
        .lq-glyph-book .lq-g-br { animation: lqBookR 2.4s ease-in-out infinite; }
        .lq-glyph-funding { animation: lqPulse 2s ease-in-out infinite; }
        .lq-glyph-liqs .lq-g-drop { animation: lqDrop 1.6s cubic-bezier(.4,0,.2,1) infinite; }
        .lq-glyph-chain .lq-g-pkt { animation: lqPkt 1.8s cubic-bezier(.4,0,.2,1) infinite; }
        .lq-glyph-wave .lq-g-main { animation: lqVol 2.1s ease-in-out infinite; }
        .lq-glyph-grid .lq-g-s1 { animation: lqSq 2.4s ease-in-out 0s infinite; }
        .lq-glyph-grid .lq-g-s2 { animation: lqSq 2.4s ease-in-out .3s infinite; }
        .lq-glyph-grid .lq-g-s3 { animation: lqSq 2.4s ease-in-out .6s infinite; }
        .lq-glyph-grid .lq-g-s4 { animation: lqSq 2.4s ease-in-out .9s infinite; }
        .lq-glyph-plan .lq-g-pulse { animation: lqPulse 1.8s ease-in-out infinite; }
        .lq-glyph-signal .lq-g-b1 { animation: lqBar 1.8s ease-in-out 0s infinite; }
        .lq-glyph-signal .lq-g-b2 { animation: lqBar 1.8s ease-in-out -.4s infinite; }
        .lq-glyph-signal .lq-g-b3 { animation: lqBar 1.8s ease-in-out -.8s infinite; }
        .lq-glyph-signal .lq-g-b4 { animation: lqBar 1.8s ease-in-out -.2s infinite; }
        .lq-glyph-bell .lq-g-bell { animation: lqBell 3s cubic-bezier(.36,.07,.19,.97) infinite; }
        .lq-glyph-check .lq-g-pulse { animation: lqPulse 2.4s ease-in-out infinite; }
        .lq-glyph-agent .lq-g-bot { animation: lqBot 2.6s ease-in-out infinite; }

        @keyframes lqWave { 0%,100% { transform: translateX(-.6px); } 50% { transform: translateX(.6px) scaleY(1.08); } }
        @keyframes lqBar { 0%,100% { transform: scaleY(.55); } 50% { transform: scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqPulse { 0%,100% { opacity: .55; transform: scale(.86); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes lqDrop { 0% { transform: translateY(-2px); opacity: .4; } 55%,100% { transform: none; opacity: 1; } }
        @keyframes lqPkt { 0% { transform: translateX(-4px); opacity: 0; } 30%,70% { opacity: 1; } 100% { transform: translateX(7px); opacity: 0; } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7) translateX(-.5px); } 50% { transform: scaleY(1.14) translateX(.5px); } }
        @keyframes lqSq { 0%,100% { opacity: .45; transform: scale(.78); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes lqBell { 0%,82%,100% { transform: rotate(0); } 86% { transform: rotate(-10deg); } 90% { transform: rotate(8deg); } 94% { transform: rotate(-4deg); } }
        @keyframes lqBot { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.2px); } }

        @media (prefers-reduced-motion: reduce) {
          .lq-glyph path, .lq-glyph rect, .lq-glyph circle, .lq-glyph,
          .lq-flow-move { animation: none !important; }
          .lq-app-flip { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
