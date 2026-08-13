import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Stripe plus layout, labels a visitor can read as a sentence:
   market in → we publish a plan → it hits your desk → the record stays. */

const WATCH = [
  { id: "price", label: "Price" },
  { id: "book", label: "Order book" },
  { id: "derivs", label: "Derivatives" },
  { id: "onchain", label: "On-chain" },
  { id: "vol", label: "Volatility" },
];

const IN_A_CALL = [
  { id: "entry", label: "Entry" },
  { id: "targets", label: "Targets" },
  { id: "stop", label: "Stop" },
  { id: "agent", label: "Agent?" },
];

const SCENES = [
  { watch: ["price", "book", "derivs", "onchain", "vol"], call: ["entry", "targets", "stop", "agent"] },
  { watch: ["book", "vol"], call: ["entry", "stop"] },
  { watch: ["price", "onchain"], call: ["entry", "targets", "stop"] },
  { watch: ["book", "derivs", "onchain"], call: ["targets", "agent"] },
];

const LOGO = (f) => `/exchanges/${f}`;
const LOGO_CELLS = [
  [null, LOGO("binance.png"), null, LOGO("okx.png")],
  [LOGO("bybit.png?v=2"), LOGO("okx.png"), LOGO("gate.png"), LOGO("mexc.png")],
  [LOGO("bitget.png"), LOGO("bingx.png?v=2"), LOGO("kucoin.png"), LOGO("htx.png")],
  [null, LOGO("coinbase.png"), null, null],
  [LOGO("gate.png"), LOGO("binance.png"), LOGO("bybit.png?v=2"), LOGO("okx.png")],
  [LOGO("bingx.png?v=2"), LOGO("bitget.png"), LOGO("upbit.png"), LOGO("cryptocom.png")],
];

const DW = 1000;
const DH = 448;
const MW = 380;
const MH = 680;
const PH = 32;

function box(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
}

function elbow(from, to, via) {
  if (via === "v") {
    if (Math.abs(from.cx - to.cx) < 1) return `M${from.cx} ${from.b} V${to.y}`;
    const mid = (from.b + to.y) / 2;
    return `M${from.cx} ${from.b} V${mid} H${to.cx} V${to.y}`;
  }
  if (Math.abs(from.cy - to.cy) < 1) return `M${from.r} ${from.cy} H${to.x}`;
  const mid = (from.r + to.x) / 2;
  return `M${from.r} ${from.cy} H${mid} V${to.cy} H${to.x}`;
}

const D = (() => {
  const tw = 100;
  const tg = 8;
  const t0 = (DW - (5 * tw + 4 * tg)) / 2;
  const T = [0, 1, 2, 3, 4].map((i) => box(t0 + i * (tw + tg), 28, tw, PH));
  const tray = box(t0 - 8, 20, 5 * tw + 4 * tg + 16, 48);
  const clean = box(318, 132, 118, PH);
  const plan = box(564, 132, 128, PH);
  const hub = box(460, 188, 80, 80);
  const venues = box(228, 212, 118, PH);
  const record = box(654, 212, 122, PH);
  const logos = box(40, 176, 152, 104);
  const dest = box(900, 208, 40, 40);
  const desk = box(438, 300, 124, PH);
  const ow = 108;
  const og = 14;
  const o0 = (DW - (4 * ow + 3 * og)) / 2;
  const O = [0, 1, 2, 3].map((i) => box(o0 + i * (ow + og), 392, ow, PH));
  const neck = desk.b + 18;
  const routes = [
    elbow(T[1], clean, "v"),
    elbow(T[3], plan, "v"),
    elbow(logos, venues, "h"),
    elbow(venues, hub, "h"),
    elbow(hub, record, "h"),
    elbow(record, dest, "h"),
    `M${hub.cx} ${hub.b} V${desk.y}`,
    ...O.map((o) => `M${desk.cx} ${desk.b} V${neck} H${o.cx} V${o.y}`),
  ];
  return { T, tray, clean, plan, hub, venues, record, logos, dest, desk, O, routes };
})();

const Mobi = (() => {
  const tw = 168;
  const T = [
    box(16, 24, tw, PH),
    box(196, 24, tw, PH),
    box(16, 64, tw, PH),
    box(196, 64, tw, PH),
    box(106, 104, tw, PH),
  ];
  const clean = box(20, 164, 160, PH);
  const plan = box(200, 164, 160, PH);
  const hub = box(150, 228, 80, 80);
  const venues = box(12, 252, 120, PH);
  const record = box(248, 252, 120, PH);
  const logos = box(114, 336, 152, 88);
  const desk = box(122, 452, 136, PH);
  const O = [
    box(16, 516, 168, PH),
    box(196, 516, 168, PH),
    box(16, 560, 168, PH),
    box(196, 560, 168, PH),
  ];
  const routes = [
    `M${T[1].cx} ${T[1].b} V${clean.y}`,
    `M${T[3].cx} ${T[3].b} V${plan.y}`,
    `M${clean.r} ${clean.cy} H${hub.x}`,
    `M${plan.x} ${plan.cy} H${hub.r}`,
    `M${venues.r} ${venues.cy} H${hub.x}`,
    `M${hub.r} ${hub.cy} H${record.x}`,
    `M${hub.cx} ${hub.b} V${logos.y}`,
    `M${logos.cx} ${logos.b} V${desk.y}`,
    ...O.map((o) => {
      const mid = (desk.b + o.y) / 2;
      return `M${desk.cx} ${desk.b} V${mid} H${o.cx} V${o.y}`;
    }),
  ];
  return { T, clean, plan, hub, venues, record, logos, dest: null, desk, O, routes };
})();

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
    <svg className="pointer-events-none absolute inset-0 z-[1]" viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      {routes.map((d, i) => (
        <path key={i} d={d} className="lq-flow" />
      ))}
    </svg>
  );
}

function Pill({ node, children }) {
  return (
    <div className="lq-pill" style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      {children}
    </div>
  );
}

function Slot({ node, label, on, init }) {
  return (
    <div className={`lq-slot${on ? " is-on" : ""}${init ? " is-init" : ""}`} style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      <span>{label}</span>
    </div>
  );
}

function Tag({ node, text }) {
  return (
    <div className="lq-tag" style={{ left: node.x, top: node.y, width: node.w }}>
      {text}
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

  const a = items[front];
  const b = items[back];
  return (
    <div className="lq-app">
      <div ref={wrap} className="lq-app-flip" onTransitionEnd={onEnd}>
        <div className="lq-app-face is-front">{a ? <img src={a} alt="" /> : <i />}</div>
        <div className="lq-app-face is-back">{b ? <img src={b} alt="" /> : <i />}</div>
      </div>
    </div>
  );
}

function LogoCluster({ node, scene, running }) {
  return (
    <div className="lq-apps" style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
      {LOGO_CELLS.map((items, i) => (
        <FlipLogo key={i} items={items} scene={scene} delay={i * 70} running={running} />
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

function Dest({ node }) {
  return (
    <div className="lq-dest" style={{ left: node.x, top: node.y, width: node.w, height: node.h }} title="You can audit it">
      <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="m5 11 4 4 8-8" stroke="#171304" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Diagram({ g, width, height, scene, init, running }) {
  const active = SCENES[scene];
  return (
    <Plane width={width} height={height}>
      <Lines routes={g.routes} width={width} height={height} />
      {g.tray ? (
        <>
          <div className="lq-tray" style={{ left: g.tray.x, top: g.tray.y, width: g.tray.w, height: g.tray.h }} />
          <Tag node={{ x: g.tray.x, y: g.tray.y - 16, w: g.tray.w }} text="1 · What we watch" />
        </>
      ) : (
        <Tag node={{ x: 16, y: 6, w: 200 }} text="1 · What we watch" />
      )}
      {g.T.map((n, i) => (
        <Slot key={WATCH[i].id} node={n} label={WATCH[i].label} on={active.watch.includes(WATCH[i].id)} init={init} />
      ))}
      <Tag node={{ x: g.clean.x, y: g.clean.y - 16, w: 240 }} text="2 · We publish a plan" />
      <Pill node={g.clean}>Clean the noise</Pill>
      <Pill node={g.plan}>Write the call</Pill>
      <LogoCluster node={g.logos} scene={scene} running={running} />
      <Pill node={g.venues}>Your exchange</Pill>
      <Hub node={g.hub} />
      <Pill node={g.record}>Public record</Pill>
      {g.dest ? <Dest node={g.dest} /> : null}
      <Tag node={{ x: g.desk.x - 20, y: g.desk.y - 16, w: 180 }} text="3 · It hits your desk" />
      <Pill node={g.desk}>Your terminal</Pill>
      <Tag node={{ x: g.O[0].x, y: g.O[0].y - 16, w: 220 }} text="4 · What’s in the call" />
      {g.O.map((n, i) => (
        <Slot key={IN_A_CALL[i].id} node={n} label={IN_A_CALL[i].label} on={active.call.includes(IN_A_CALL[i].id)} init={init} />
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
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
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
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">How LuxQuant thinks</p>
        <h2 className="mt-5 max-w-4xl text-[28px] font-semibold leading-[1.28] tracking-[-0.025em] sm:text-[34px] lg:text-[40px]">
          <span className="text-text-primary">From market noise to a decision you can verify. </span>
          <span className="text-text-muted">
            Watch the market, publish a plan, send it to your desk, keep the proof.
          </span>
        </h2>
      </div>

      <div ref={root} className="lq-sys relative mx-auto mt-8 w-full max-w-[1080px] px-3 sm:mt-10 sm:px-6">
        <div className="lq-sys-dots" aria-hidden="true" />
        <div className="relative hidden lg:block">
          <Diagram g={D} width={DW} height={DH} scene={scene} init={init} running={live && !init} />
        </div>
        <div className="relative lg:hidden">
          <Diagram g={Mobi} width={MW} height={MH} scene={scene} init={init} running={live && !init} />
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-2xl px-4 text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[15px]">
        Read it like a sentence: the market comes in → we publish a plan → it lands on your desk → you can check the record.
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
        .lq-sys { --line: rgb(var(--accent) / 0.42); --idle: rgb(var(--accent) / 0.26); --pill: rgb(var(--accent)); --ink: #171304; }
        .lq-sys-dots {
          position: absolute; inset: -40px 0 -48px;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px; opacity: .46; pointer-events: none;
          -webkit-mask-image: linear-gradient(180deg, transparent, #737373 18%, #737373 82%, transparent);
          mask-image: linear-gradient(180deg, transparent, #737373 18%, #737373 82%, transparent);
        }
        .lq-flow { stroke: var(--line); stroke-width: 1.25; stroke-dasharray: 2 3; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .lq-tray { position: absolute; z-index: 1; border-radius: 8px; background: rgb(var(--surface) / 0.28); }
        .lq-pill, .lq-slot, .lq-hub, .lq-apps, .lq-dest, .lq-tag { position: absolute; z-index: 4; box-sizing: border-box; }
        .lq-tag {
          z-index: 5;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: rgb(var(--accent));
          pointer-events: none;
        }
        .lq-pill {
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px; background: var(--pill); color: var(--ink);
          font-size: 12.5px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
        }
        .lq-slot {
          display: flex; align-items: center; justify-content: center;
          border: 1px dashed var(--idle); border-radius: 6px;
          transition: border-color .5s cubic-bezier(.4,0,.2,1);
        }
        .lq-slot span {
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 100%; border-radius: 6px;
          background: var(--pill); color: var(--ink);
          font-size: 12px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap;
          opacity: 0; transform: scale(.78);
          transition: opacity .45s cubic-bezier(.4,0,.2,1), transform .45s cubic-bezier(.4,0,.2,1);
        }
        .lq-slot.is-on { border-color: transparent; }
        .lq-slot.is-on span, .lq-slot.is-init span { opacity: 1; transform: none; }
        .lq-slot.is-init span { transition-duration: 0ms; }
        .lq-hub {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-radius: 10px;
          background: linear-gradient(288deg, #3a2a0c -7%, #d4a017 106%);
          box-shadow: 0 16px 28px -16px rgb(var(--scrim) / 0.45);
        }
        .lq-hub img { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; }
        .lq-hub span { margin-top: 4px; color: #fbf3da; font-size: 9px; font-weight: 750; letter-spacing: -.04em; }
        .lq-apps {
          display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr);
          gap: 6px; padding: 8px; border-radius: 10px;
          background: rgb(var(--surface) / 0.7); border: 1px solid rgb(var(--ink) / 0.06);
        }
        .lq-app { position: relative; border: 1px dashed var(--idle); border-radius: 6px; perspective: 240px; min-height: 0; }
        .lq-app-flip { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform 2s cubic-bezier(.9,0,.1,1); }
        .lq-app-face { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; border-radius: 6px; background: rgb(var(--surface)); backface-visibility: hidden; }
        .lq-app-face.is-back { transform: rotateX(180deg); }
        .lq-app-face img { width: 100%; height: 100%; object-fit: cover; }
        .lq-dest {
          display: grid; place-items: center; border-radius: 8px; background: #f4f1ea;
          box-shadow: 0 10px 18px -12px rgb(var(--scrim) / 0.35);
        }
        @media (prefers-reduced-motion: reduce) {
          .lq-slot span, .lq-app-flip { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
