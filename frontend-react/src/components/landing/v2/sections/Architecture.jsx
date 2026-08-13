import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Centered Stripe plus. Tape → sanitize → hub → terminal → venues.
   Every pill has a glyph. Geometry is validated below. */

const SYSTEMS = [
  { id: "price", label: "Price", icon: "price" },
  { id: "book", label: "Order book", icon: "book" },
  { id: "derivs", label: "Derivatives", icon: "funding" },
  { id: "onchain", label: "On-chain", icon: "chain" },
  { id: "vol", label: "Volatility", icon: "wave" },
];

const OUTPUTS = [
  { id: "calls", label: "Algo calls", icon: "signal" },
  { id: "ai", label: "AI research", icon: "spark" },
  { id: "flow", label: "Money flow", icon: "flow" },
  { id: "agent", label: "Agent", icon: "agent" },
];

const SCENES = [
  { systems: ["price", "book", "derivs", "onchain", "vol"], outputs: ["calls", "ai", "flow", "agent"] },
  { systems: ["price", "book", "vol"], outputs: ["calls", "agent"] },
  { systems: ["book", "derivs", "onchain"], outputs: ["calls", "ai", "flow"] },
  { systems: ["price", "onchain", "vol", "derivs"], outputs: ["ai", "flow", "agent"] },
];

const VENUES = [
  { src: "/exchanges/binance.png", name: "Binance" },
  { src: "/exchanges/okx.png", name: "OKX" },
  { src: "/exchanges/bybit.png?v=2", name: "Bybit" },
  { src: "/exchanges/gate.png", name: "Gate" },
  { src: "/exchanges/bitget.png", name: "Bitget" },
  { src: "/exchanges/bingx.png?v=2", name: "BingX" },
];

const DW = 1000;
const DH = 420;
const MW = 380;
const MH = 680;
const PH = 34;

function box(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
}

function elbow(from, to, via) {
  if (via === "v") {
    const mid = (from.b + to.y) / 2;
    if (Math.abs(from.cx - to.cx) < 1) return `M${from.cx} ${from.b} V${to.y}`;
    return `M${from.cx} ${from.b} V${mid} H${to.cx} V${to.y}`;
  }
  if (Math.abs(from.cy - to.cy) < 1) return `M${from.r} ${from.cy} H${to.x}`;
  const mid = (from.r + to.x) / 2;
  return `M${from.r} ${from.cy} H${mid} V${to.cy} H${to.x}`;
}

function assertLayout(name, g) {
  const err = [];
  const near = (a, b, n) => Math.abs(a - b) > 1 && err.push(`${n}: ${a} ≠ ${b}`);
  near(g.sanitize.cx, g.hub.cx, `${name} sanitize not over hub`);
  if (g.tray) near(g.tray.cx, g.hub.cx, `${name} tray not centered on hub`);
  if (g.O) {
    const mid = (g.O[0].x + g.O[g.O.length - 1].r) / 2;
    near(mid, g.hub.cx, `${name} outputs not centered on hub`);
  }
  if (g.terminal.x < g.hub.r) err.push(`${name} terminal must sit right of hub`);
  if (g.logos.x < g.terminal.r) err.push(`${name} venues must sit after terminal`);
  if (err.length) throw new Error(err.join(" | "));
}

/* Desktop — hub dead-center, like Stripe */
const D = (() => {
  const hub = box((DW - 80) / 2, 176, 80, 80);
  const tw = 118;
  const tg = 8;
  const tSpan = 5 * tw + 4 * tg;
  const t0 = (DW - tSpan) / 2;
  const T = [0, 1, 2, 3, 4].map((i) => box(t0 + i * (tw + tg), 16, tw, PH));
  const tray = box(t0 - 8, 8, tSpan + 16, 50);
  const sanitize = box(hub.cx - 54, 116, 108, PH);
  const terminal = box(hub.r + 28, hub.cy - PH / 2, 108, PH);
  const logos = box(terminal.r + 24, hub.cy - 40, 128, 80);

  const ow = 122;
  const og = 12;
  const oSpan = 4 * ow + 3 * og;
  const o0 = (DW - oSpan) / 2;
  const O = [0, 1, 2, 3].map((i) => box(o0 + i * (ow + og), 364, ow, PH));
  const neck = hub.b + 20;

  const routes = [
    ...T.map((t) => elbow(t, sanitize, "v")),
    `M${sanitize.cx} ${sanitize.b} V${hub.y}`,
    elbow(hub, terminal, "h"),
    elbow(terminal, logos, "h"),
    ...O.map((o) => `M${hub.cx} ${hub.b} V${neck} H${o.cx} V${o.y}`),
  ];

  const g = { T, tray, sanitize, hub, terminal, logos, O, routes };
  assertLayout("desktop", g);
  return g;
})();

const M = (() => {
  const tw = 168;
  const T = [
    box(16, 16, tw, PH),
    box(196, 16, tw, PH),
    box(16, 56, tw, PH),
    box(196, 56, tw, PH),
    box(106, 96, tw, PH),
  ];
  const sanitize = box(120, 154, 140, PH);
  const hub = box(150, 214, 80, 80);
  const terminal = box(106, 324, 168, PH);
  const logos = box(126, 382, 128, 80);
  const O = [
    box(16, 500, 168, PH),
    box(196, 500, 168, PH),
    box(16, 544, 168, PH),
    box(196, 544, 168, PH),
  ];
  const routes = [
    ...T.map((t) => `M${t.cx} ${t.b} V${(t.b + sanitize.y) / 2} H${sanitize.cx} V${sanitize.y}`),
    `M${sanitize.cx} ${sanitize.b} V${hub.y}`,
    `M${hub.cx} ${hub.b} V${terminal.y}`,
    `M${terminal.cx} ${terminal.b} V${logos.y}`,
    ...O.map((o) => `M${logos.cx} ${logos.b} V${(logos.b + o.y) / 2} H${o.cx} V${o.y}`),
  ];
  const g = { T, sanitize, hub, terminal, logos, O, routes };
  if (g.terminal.x > g.hub.r) {
    /* mobile stacks under the hub; skip desktop-only asserts */
  }
  return g;
})();

function Glyph({ type }) {
  const c = {
    className: `lq-ico lq-ico-${type}`,
    width: 14,
    height: 14,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (type) {
    case "price":
      return <svg {...c}><path className="lq-g-main" d="M2 13h2.2L6.2 6l2.6 9 2-5.4 1.6 2.2H18" /></svg>;
    case "book":
      return (
        <svg {...c}>
          <path className="lq-g-bl" d="M3 4h6c1 0 1.5.5 1.5 1.4V17c0-1-.7-1.6-1.7-1.6H3z" />
          <path className="lq-g-br" d="M17 4H11c-1 0-1.5.5-1.5 1.4V17c0-1 .7-1.6 1.7-1.6H17z" />
        </svg>
      );
    case "funding":
      return <svg {...c}><path d="M10 3v14M7 6.5c.8-1.4 5.4-2 5.4.8 0 3.2-6 1.6-6 4.6 0 2.4 4.2 2.2 5.6.6" /></svg>;
    case "chain":
      return (
        <svg {...c}>
          <path d="M7.6 12.4 6 14A3 3 0 1 1 1.8 9.8l2.2-2.2A3 3 0 0 1 8.2 7M12.4 7.6 14 6a3 3 0 1 1 4.2 4.2l-2.2 2.2a3 3 0 0 1-4.2.4M7 10h6" />
        </svg>
      );
    case "wave":
      return <svg {...c}><path className="lq-g-main" d="M2 11c2.2 0 2.2-5 4.4-5s2.2 8 4.4 8 2.2-6 4.4-6c1.2 0 1.8 1 2.8 2" /></svg>;
    case "filter":
      return <svg {...c}><path d="M3 4h14l-5.2 6.4V16l-3.6 2v-7.6z" /></svg>;
    case "desk":
      return (
        <svg {...c}>
          <rect x="2" y="4" width="16" height="10" rx="1.6" />
          <path d="M7 17h6M10 14v3" />
        </svg>
      );
    case "exchange":
      return <svg {...c}><circle cx="10" cy="10" r="6.2" /><path d="M7 10h6M10 7v6" /></svg>;
    case "signal":
      return <svg {...c}><path d="M7.5 17 3 12.5m0 0L7.5 8M3 12.5h10.5m0-9L17.5 8m0 0L13 12.5M17.5 8H7" /></svg>;
    case "spark":
      return <svg {...c}><path d="M10 2.5 11.4 8 17 9.4 11.4 10.8 10 16.4 8.6 10.8 3 9.4 8.6 8z" /></svg>;
    case "flow":
      return <svg {...c}><path d="M3 8c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 4.8 0M3 13c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 4.8 0" /></svg>;
    case "agent":
      return (
        <svg {...c}>
          <rect x="3.4" y="6.4" width="9.6" height="8.2" rx="2.2" />
          <path d="M8.2 6.4V4.4" />
          <circle cx="8.2" cy="3.5" r=".8" />
          <circle cx="6.4" cy="10.2" r=".8" />
          <circle cx="10" cy="10.2" r=".8" />
        </svg>
      );
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

function useInView(ref) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setOn(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
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

function Lines({ routes, width, height }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      {routes.map((d, i) => (
        <path key={i} d={d} className="lq-flow" />
      ))}
    </svg>
  );
}

function Pill({ node, icon, children }) {
  return (
    <div className="lq-pill" style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      {icon ? <Glyph type={icon} /> : null}
      {children}
    </div>
  );
}

function Slot({ node, label, icon, on, init }) {
  return (
    <div
      className={`lq-slot${on ? " is-on" : ""}${init ? " is-init" : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
    >
      <span>
        <Glyph type={icon} />
        {label}
      </span>
    </div>
  );
}

function DestVenues({ node }) {
  return (
    <div className="lq-dest" style={{ left: node.x, top: node.y, width: node.w, height: node.h }} aria-label="Your exchange">
      {VENUES.map((v) => (
        <span key={v.name} title={v.name}>
          <img src={v.src} alt={v.name} />
        </span>
      ))}
    </div>
  );
}

function Hub({ node }) {
  return (
    <div className="lq-hub" style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      <img src="/logo.png" alt="" />
      <span>luxquant</span>
    </div>
  );
}

function Diagram({ g, width, height, scene, init, running }) {
  const active = SCENES[scene];
  return (
    <Plane width={width} height={height}>
      <Lines routes={g.routes} width={width} height={height} />
      {g.tray ? <div className="lq-tray" style={{ left: g.tray.x, top: g.tray.y, width: g.tray.w, height: g.tray.h }} /> : null}
      {g.T.map((n, i) => (
        <Slot
          key={SYSTEMS[i].id}
          node={n}
          label={SYSTEMS[i].label}
          icon={SYSTEMS[i].icon}
          on={active.systems.includes(SYSTEMS[i].id)}
          init={init}
        />
      ))}
      <Pill node={g.sanitize} icon="filter">Sanitize</Pill>
      <Hub node={g.hub} />
      <Pill node={g.terminal} icon="desk">Terminal</Pill>
      <DestVenues node={g.logos} />
      {g.O.map((n, i) => (
        <Slot
          key={OUTPUTS[i].id}
          node={n}
          label={OUTPUTS[i].label}
          icon={OUTPUTS[i].icon}
          on={active.outputs.includes(OUTPUTS[i].id)}
          init={init}
        />
      ))}
    </Plane>
  );
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const root = useRef(null);
  const inView = useInView(root);
  const [scene, setScene] = useState(0);
  const [init, setInit] = useState(true);
  const [pageOn, setPageOn] = useState(() => typeof document === "undefined" || !document.hidden);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const live = inView && pageOn && !reduce;

  useEffect(() => {
    const onVis = () => setPageOn(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!live) return undefined;
    const first = setTimeout(() => {
      setInit(false);
      setScene((s) => (s + 1) % SCENES.length);
    }, 1000);
    const tick = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
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
          <span className="text-text-primary">From market noise to a decision you can verify. </span>
          <span className="text-text-muted">
            A live intelligence network turns fragmented market data into risk-defined
            calls—then preserves every published decision on the public record.
          </span>
        </h2>
      </div>

      <div ref={root} className="lq-sys relative mx-auto mt-10 w-full max-w-[1080px] px-3 sm:mt-12 sm:px-6">
        <div className="lq-sys-dots" aria-hidden="true" />
        <div className="relative hidden lg:block">
          <Diagram g={D} width={DW} height={DH} scene={scene} init={init} running={live && !init} />
        </div>
        <div className="relative lg:hidden">
          <Diagram g={M} width={MW} height={MH} scene={scene} init={init} running={live && !init} />
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1120px] flex-col items-center gap-2.5 px-4 lg:mt-12 lg:px-8">
        <p className="max-w-3xl text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[14.5px]">
          The tape comes in. The engine writes the call. You take it to your exchange.
        </p>
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
        <p className="text-center text-[10.5px] leading-relaxed text-text-muted">
          Every call preserved. No selective screenshots.
        </p>
      </div>

      <style>{`
        .lq-sys { --line: rgb(var(--accent) / 0.42); --idle: rgb(var(--accent) / 0.26); --pill: rgb(var(--accent)); --ink: #171304; }
        .lq-sys-dots {
          position: absolute; inset: -48px 0 -56px;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px; opacity: .46; pointer-events: none;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 22%, #737373 78%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 22%, #737373 78%, transparent);
        }
        .lq-flow { stroke: var(--line); stroke-width: 1.25; stroke-dasharray: 2 3; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .lq-tray { position: absolute; z-index: 1; border-radius: 8px; background: rgb(var(--surface) / 0.28); }
        .lq-pill, .lq-slot, .lq-hub, .lq-dest {
          position: absolute; z-index: 4; box-sizing: border-box;
        }
        .lq-pill {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: 6px; background: var(--pill); color: var(--ink);
          font-size: 12.5px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
        }
        .lq-slot {
          display: flex; align-items: center; justify-content: center;
          border: 1px dashed var(--idle); border-radius: 6px;
          transition: border-color .5s cubic-bezier(.4,0,.2,1);
        }
        .lq-slot span {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; height: 100%; border-radius: 6px;
          background: transparent; color: rgb(var(--accent) / 0.7);
          font-size: 12px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
          transition: background .45s cubic-bezier(.4,0,.2,1), color .45s cubic-bezier(.4,0,.2,1);
        }
        .lq-slot.is-on { border-color: transparent; }
        .lq-slot.is-on span, .lq-slot.is-init span { background: var(--pill); color: var(--ink); }
        .lq-slot.is-init span { transition-duration: 0ms; }
        .lq-hub {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-radius: 12px; background: #d4a017;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 16px 28px -16px rgb(var(--scrim) / 0.45);
        }
        .lq-hub img { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; }
        .lq-hub span { margin-top: 4px; color: #171304; font-size: 9px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
        .lq-dest {
          display: flex;
          flex-wrap: wrap;
          align-content: center;
          justify-content: center;
          gap: 8px;
        }
        .lq-dest span {
          display: grid; place-items: center;
          width: 36px; height: 36px;
          border-radius: 99px;
          background: #fff;
          box-shadow: 0 0 0 1px rgb(var(--ink) / 0.1);
          overflow: hidden;
        }
        .lq-dest img { width: 68%; height: 68%; object-fit: contain; }
        .lq-ico { flex: 0 0 auto; }
        .lq-ico path, .lq-ico rect, .lq-ico circle { transform-box: fill-box; transform-origin: center; }
        .lq-ico-price .lq-g-main { animation: lqWave 2.6s ease-in-out infinite; }
        .lq-ico-book .lq-g-bl { animation: lqBookL 2.4s ease-in-out infinite; }
        .lq-ico-book .lq-g-br { animation: lqBookR 2.4s ease-in-out infinite; }
        .lq-ico-wave .lq-g-main { animation: lqVol 2.1s ease-in-out infinite; }
        @keyframes lqWave { 0%,100% { transform: translateX(-.4px); } 50% { transform: translateX(.4px) scaleY(1.08); } }
        @keyframes lqBookL { 0%,100% { transform: scaleX(.9); } 50% { transform: scaleX(1.08); } }
        @keyframes lqBookR { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.9); } }
        @keyframes lqVol { 0%,100% { transform: scaleY(.7); } 50% { transform: scaleY(1.12); } }
        @media (prefers-reduced-motion: reduce) {
          .lq-slot span, .lq-ico path, .lq-ico rect { transition: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  );
}
