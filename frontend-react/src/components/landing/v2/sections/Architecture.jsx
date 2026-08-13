import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Stripe plus, but the flow is a sentence and every real feed is on the tray.
   Many inputs merge into one plan, then the desk, then what you actually get. */

const FEEDS = [
  "Price",
  "Volume",
  "Order book",
  "Funding",
  "Liquidations",
  "On-chain",
  "Volatility",
  "Breadth",
];

const YOU_GET = ["The call", "Alerts", "The record", "Agent optional"];

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
const DH = 540;
const MW = 380;
const MH = 760;
const PH = 32;

function box(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
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

function Lines({ routes, width, height }) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-[1]" viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      {routes.map((d, i) => (
        <path key={i} d={d} className="lq-flow" />
      ))}
    </svg>
  );
}

function Pill({ node, children, tone = "gold" }) {
  return (
    <div className={`lq-pill is-${tone}`} style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      {children}
    </div>
  );
}

function Label({ x, y, w, children }) {
  return (
    <div className="lq-tag" style={{ left: x, top: y, width: w }}>
      {children}
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

/* ── Desktop: 8 feeds merge into one plan ───────────────────────── */
const D = (() => {
  const tw = 112;
  const tg = 8;
  const t0 = (DW - (8 * tw + 7 * tg)) / 2;
  const T = FEEDS.map((_, i) => box(t0 + i * (tw + tg), 36, tw, PH));
  const busY = 92;
  const bus = { x: T[0].cx, y: busY, r: T[7].cx, w: T[7].cx - T[0].cx };
  const plan = box(390, 148, 300, PH);
  const hub = box(500, 216, 80, 80);
  const venues = box(268, 240, 124, PH);
  const record = box(688, 240, 124, PH);
  const logos = box(72, 204, 160, 108);
  const dest = box(968, 236, 40, 40);
  const desk = box(478, 336, 124, PH);
  const ow = 150;
  const og = 16;
  const o0 = (DW - (4 * ow + 3 * og)) / 2;
  const O = YOU_GET.map((_, i) => box(o0 + i * (ow + og), 472, ow, PH));
  const neck = desk.b + 22;

  const routes = [
    ...T.map((t) => `M${t.cx} ${t.b} V${busY}`),
    `M${bus.x} ${busY} H${bus.r}`,
    `M${(bus.x + bus.r) / 2} ${busY} V${plan.y}`,
    `M${plan.cx} ${plan.b} V${hub.y}`,
    `M${logos.r} ${hub.cy} H${venues.x}`,
    `M${venues.r} ${hub.cy} H${hub.x}`,
    `M${hub.r} ${hub.cy} H${record.x}`,
    `M${record.r} ${hub.cy} H${dest.x}`,
    `M${hub.cx} ${hub.b} V${desk.y}`,
    ...O.map((o) => `M${desk.cx} ${desk.b} V${neck} H${o.cx} V${o.y}`),
  ];

  return { T, plan, hub, venues, record, logos, dest, desk, O, routes, busY };
})();

const Mobi = (() => {
  const tw = 176;
  const T = FEEDS.map((_, i) =>
    box(i % 2 === 0 ? 12 : 192, 36 + Math.floor(i / 2) * 40, tw, 32),
  );
  const last = T[T.length - 1];
  const busY = last.b + 16;
  const plan = box(70, busY + 28, 240, PH);
  const hub = box(150, plan.b + 36, 80, 80);
  const venues = box(12, hub.cy - 16, 120, PH);
  const record = box(248, hub.cy - 16, 120, PH);
  const logos = box(114, hub.b + 24, 152, 88);
  const desk = box(122, logos.b + 28, 136, PH);
  const O = YOU_GET.map((_, i) =>
    box(i % 2 === 0 ? 12 : 192, desk.b + 36 + Math.floor(i / 2) * 40, 176, PH),
  );
  const routes = [
    ...T.map((t) => `M${t.cx} ${t.b} V${busY}`),
    `M${T[0].cx} ${busY} H${T[1].cx}`,
    `M${(T[0].cx + T[1].cx) / 2} ${busY} V${plan.y}`,
    `M${plan.cx} ${plan.b} V${hub.y}`,
    `M${venues.r} ${hub.cy} H${hub.x}`,
    `M${hub.r} ${hub.cy} H${record.x}`,
    `M${hub.cx} ${hub.b} V${logos.y}`,
    `M${logos.cx} ${logos.b} V${desk.y}`,
    ...O.map((o) => {
      const mid = (desk.b + o.y) / 2;
      return `M${desk.cx} ${desk.b} V${mid} H${o.cx} V${o.y}`;
    }),
  ];
  return { T, plan, hub, venues, record, logos, dest: null, desk, O, routes, busY };
})();

function Diagram({ g, width, height, scene, running }) {
  return (
    <Plane width={width} height={height}>
      <Lines routes={g.routes} width={width} height={height} />

      <Label x={g.T[0].x} y={12} w={420}>
        1 · Every feed we actually read
      </Label>
      {g.T.map((n, i) => (
        <Pill key={FEEDS[i]} node={n}>
          {FEEDS[i]}
        </Pill>
      ))}

      <Label x={g.plan.x} y={g.plan.y - 22} w={g.plan.w}>
        2 · They become one plan
      </Label>
      <Pill node={g.plan} tone="plan">
        Entry · TP1–TP4 · Stop
      </Pill>

      <div className="lq-apps" style={{ left: g.logos.x, top: g.logos.y, width: g.logos.w, height: g.logos.h }}>
        {LOGO_CELLS.map((items, i) => (
          <FlipLogo key={i} items={items} scene={scene} delay={i * 80} running={running} />
        ))}
      </div>
      <Pill node={g.venues}>Your exchange</Pill>
      <div className="lq-hub" style={{ left: g.hub.x, top: g.hub.y, width: g.hub.w, height: g.hub.h }}>
        <img src="/logo.png" alt="" />
        <span>luxquant</span>
      </div>
      <Pill node={g.record}>Public record</Pill>
      {g.dest ? (
        <div className="lq-dest" style={{ left: g.dest.x, top: g.dest.y, width: g.dest.w, height: g.dest.h }}>
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="m5 11 4 4 8-8" stroke="#171304" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
      ) : null}

      <Label x={g.desk.x - 8} y={g.desk.y - 22} w={200}>
        3 · It lands on your desk
      </Label>
      <Pill node={g.desk}>Your terminal</Pill>

      <Label x={g.O[0].x} y={g.O[0].y - 22} w={280}>
        4 · What you walk away with
      </Label>
      {g.O.map((n, i) => (
        <Pill key={YOU_GET[i]} node={n}>
          {YOU_GET[i]}
        </Pill>
      ))}
    </Plane>
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
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
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
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">How LuxQuant thinks</p>
        <h2 className="mt-5 max-w-4xl text-[28px] font-semibold leading-[1.28] tracking-[-0.025em] sm:text-[34px] lg:text-[40px]">
          <span className="text-text-primary">Lots of market data. One written plan. </span>
          <span className="text-text-muted">Then it shows up on your desk — and stays on the record.</span>
        </h2>
      </div>

      <div ref={root} className="lq-sys relative mx-auto mt-8 w-full max-w-[1120px] px-3 sm:mt-10 sm:px-6">
        <div className="lq-sys-dots" aria-hidden="true" />
        <div className="relative hidden lg:block">
          <Diagram g={D} width={DW} height={DH} scene={scene} running={live} />
        </div>
        <div className="relative lg:hidden">
          <Diagram g={Mobi} width={MW} height={MH} scene={scene} running={live} />
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
          background-size: 10px 10px; opacity: .42; pointer-events: none;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 16%, #737373 84%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 16%, #737373 84%, transparent);
        }
        .lq-flow { stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 2 3; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .lq-pill, .lq-hub, .lq-apps, .lq-dest, .lq-tag { position: absolute; z-index: 4; box-sizing: border-box; }
        .lq-tag {
          z-index: 6;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgb(var(--accent));
          line-height: 1;
          pointer-events: none;
        }
        .lq-pill {
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px; background: var(--pill); color: var(--ink);
          font-size: 12px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
        }
        .lq-pill.is-plan { font-size: 13px; }
        .lq-hub {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 7;
          border-radius: 10px;
          background: linear-gradient(288deg, #3a2a0c -7%, #d4a017 106%);
          box-shadow: 0 16px 28px -16px rgb(var(--scrim) / 0.45);
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
        .lq-dest {
          display: grid; place-items: center; border-radius: 8px; background: #f4f1ea;
          box-shadow: 0 10px 18px -12px rgb(var(--scrim) / 0.35);
        }
        @media (prefers-reduced-motion: reduce) {
          .lq-app-flip { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
