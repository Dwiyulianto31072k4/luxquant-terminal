import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";
import { EXCHANGE_LIST, VenueLogo } from "../../../autotrade/exchangeVenues";

/* Stripe plus, one story:
   tape in → sanitize → engine. Products drop out. Exchange is the dest. */

const SYSTEMS = [
  { id: "price", label: "Price", icon: "price", hint: "Last, mark and volume across venues" },
  { id: "book", label: "Order book", icon: "book", hint: "Depth, imbalance and liquidity" },
  { id: "derivs", label: "Derivatives", icon: "funding", hint: "Funding, open interest, liquidations" },
  { id: "onchain", label: "On-chain", icon: "chain", hint: "Exchange netflows and whale prints" },
  { id: "vol", label: "Volatility", icon: "wave", hint: "ATR, compression and ranges" },
];

const OUTPUTS = [
  { id: "calls", label: "Algo calls", icon: "signal", hint: "Timestamped entry, targets and stops" },
  { id: "ai", label: "AI research", icon: "spark", hint: "Regime notes you can read" },
  { id: "flow", label: "Money flow", icon: "flow", hint: "Where capital is rotating" },
  { id: "agent", label: "Agent", icon: "agent", hint: "Assistance on your desk" },
];

const SCENES = [
  { systems: ["price", "book", "derivs", "onchain", "vol"], outputs: ["calls", "ai", "flow", "agent"] },
  { systems: ["price", "book", "vol"], outputs: ["calls", "agent"] },
  { systems: ["book", "derivs", "onchain"], outputs: ["calls", "ai", "flow"] },
  { systems: ["price", "onchain", "vol", "derivs"], outputs: ["ai", "flow", "agent"] },
];

const DW = 1040;
const DH = 448;
const MW = 380;
const MH = 520;
const PH = 36;

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
  if (g.logos.x < g.hub.r) err.push(`${name} exchange dest must sit right of hub`);
  if (err.length) throw new Error(err.join(" | "));
}

function sceneCaption(scene) {
  const a = SYSTEMS.filter((s) => scene.systems.includes(s.id))
    .map((s) => s.label)
    .join(" · ");
  const b = OUTPUTS.filter((o) => scene.outputs.includes(o.id))
    .map((o) => o.label)
    .join(" · ");
  return `${a}  →  ${b}`;
}

/* Desktop — tape in, products out, exchange is the dest */
const D = (() => {
  const hub = box((DW - 90) / 2, 186, 90, 90);
  const tw = 132;
  const tg = 10;
  const tSpan = 5 * tw + 4 * tg;
  const t0 = (DW - tSpan) / 2;
  const T = [0, 1, 2, 3, 4].map((i) => box(t0 + i * (tw + tg), 38, tw, PH));
  const tray = box(t0 - 10, 28, tSpan + 20, 56);
  const sanitize = box(hub.cx - 60, 124, 120, PH);
  const logos = box(hub.r + 28, hub.cy - 54, 172, 108);

  const ow = 138;
  const og = 14;
  const oSpan = 4 * ow + 3 * og;
  const o0 = (DW - oSpan) / 2;
  const O = [0, 1, 2, 3].map((i) => box(o0 + i * (ow + og), 376, ow, PH));
  const neck = hub.b + 18;

  const routes = [
    ...T.map((t, i) => ({ d: elbow(t, sanitize, "v"), kind: "in", key: SYSTEMS[i].id })),
    { d: `M${sanitize.cx} ${sanitize.b} V${hub.y}`, kind: "core", key: "engine" },
    { d: elbow(hub, logos, "h"), kind: "dest", key: "dest" },
    ...O.map((o, i) => ({
      d: `M${hub.cx} ${hub.b} V${neck} H${o.cx} V${o.y}`,
      kind: "out",
      key: OUTPUTS[i].id,
    })),
  ];

  const tags = [{ x: tray.x, y: 8, w: tray.w, label: "Market tape" }];

  const g = {
    T,
    tray,
    sanitize,
    hub,
    logos,
    O,
    routes,
    tags,
    junctions: [
      [sanitize.cx, sanitize.b],
      [hub.cx, hub.y],
      [hub.cx, hub.b],
      [hub.r, hub.cy],
      ...O.map((o) => [o.cx, neck]),
    ],
  };
  assertLayout("desktop", g);
  return g;
})();

const M = (() => {
  const tw = 168;
  const T = [
    box(16, 22, tw, PH),
    box(196, 22, tw, PH),
    box(16, 64, tw, PH),
    box(196, 64, tw, PH),
    box(106, 106, tw, PH),
  ];
  const sanitize = box(120, 160, 140, PH);
  const hub = box(150, 216, 80, 80);
  const O = [
    box(16, 326, 168, PH),
    box(196, 326, 168, PH),
    box(16, 370, 168, PH),
    box(196, 370, 168, PH),
  ];
  const logos = box(24, 428, 332, 80);
  const neck = hub.b + 14;
  const routes = [
    ...T.map((t, i) => ({
      d: `M${t.cx} ${t.b} V${(t.b + sanitize.y) / 2} H${sanitize.cx} V${sanitize.y}`,
      kind: "in",
      key: SYSTEMS[i].id,
    })),
    { d: `M${sanitize.cx} ${sanitize.b} V${hub.y}`, kind: "core", key: "engine" },
    ...O.map((o, i) => ({
      d: `M${hub.cx} ${hub.b} V${neck} H${o.cx} V${o.y}`,
      kind: "out",
      key: OUTPUTS[i].id,
    })),
    { d: `M${hub.cx} ${hub.b} V${logos.y}`, kind: "dest", key: "dest" },
  ];
  const tags = [{ x: 16, y: 4, w: 348, label: "Market tape" }];
  return {
    T,
    sanitize,
    hub,
    logos,
    O,
    routes,
    tags,
    junctions: [
      [sanitize.cx, sanitize.b],
      [hub.cx, hub.y],
      [hub.cx, hub.b],
    ],
  };
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

function routeOn(route, active, hover, init) {
  if (init) return true;
  const inScene =
    route.kind === "core" ||
    route.kind === "dest" ||
    (route.kind === "in" && active.systems.includes(route.key)) ||
    (route.kind === "out" && active.outputs.includes(route.key));
  if (!hover) return inScene;
  if (hover.type === "hub") return inScene;
  if (hover.type === "sanitize") {
    return route.kind === "core" || (route.kind === "in" && inScene);
  }
  if (hover.type === "dest") return route.kind === "dest" || route.kind === "core";
  if (hover.type === "in") return route.key === hover.id || route.kind === "core";
  if (hover.type === "out") return route.key === hover.id;
  return inScene;
}

function Plane({ width, height, onPause, children }) {
  const host = useRef(null);
  const scale = useFitScale(host, width);
  return (
    <div
      ref={host}
      className="relative w-full"
      style={{ height: height * scale }}
      onMouseEnter={() => onPause?.(true)}
      onMouseLeave={() => onPause?.(false)}
    >
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

function Lines({ routes, width, height, running, lit, junctions, uid }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      {routes.map((route, i) => {
        const d = typeof route === "string" ? route : route.d;
        const on = !lit || lit[i] !== false;
        const id = `${uid}-r${i}`;
        return (
          <g key={id} className={on ? "lq-flow-wrap" : "lq-flow-wrap is-dim"}>
            <path id={id} d={d} className="lq-flow" />
            <path d={d} className="lq-flow-run" />
            {running && on ? (
              <circle r="2.4" className="lq-pkt">
                <animateMotion dur={`${1.7 + (i % 4) * 0.28}s`} begin={`${(i * 0.18) % 1.2}s`} repeatCount="indefinite">
                  <mpath href={`#${id}`} />
                </animateMotion>
              </circle>
            ) : null}
          </g>
        );
      })}
      {(junctions || []).map(([x, y], i) => (
        <circle key={`j${i}`} cx={x} cy={y} r="2.1" className="lq-junc" />
      ))}
    </svg>
  );
}

function Tip({ node, title, hint, place, planeW }) {
  if (!node || !hint) return null;
  const above = place !== "below";
  const tipW = 196;
  const left = Math.max(tipW / 2 + 8, Math.min(planeW - tipW / 2 - 8, node.cx));
  return (
    <div
      className="lq-tip"
      style={{
        left,
        top: above ? node.y - 12 : node.b + 12,
        transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
      role="tooltip"
    >
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
}

function Pill({ node, icon, children, hint }) {
  return (
    <div
      className="lq-pill"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      aria-label={hint ? `${children}. ${hint}` : undefined}
    >
      {icon ? <Glyph type={icon} /> : null}
      {children}
    </div>
  );
}

function Slot({ node, label, icon, on, init, hint, onHover }) {
  return (
    <div
      className={`lq-slot${on ? " is-on" : ""}${init ? " is-init" : ""}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      tabIndex={0}
      aria-label={hint ? `${label}. ${hint}` : label}
      onMouseEnter={() => onHover?.(true)}
      onFocus={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(null)}
      onBlur={() => onHover?.(null)}
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
    <div
      className="lq-dest"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      aria-label="Your exchange"
    >
      <span className="lq-dest-kicker">Your exchange</span>
      <div className="lq-dest-marks">
        {EXCHANGE_LIST.map((v) => (
          <span key={v.id} title={v.name}>
            <VenueLogo venue={v} className="h-8 w-8" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Hub({ node }) {
  return (
    <div
      className="lq-hub"
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      aria-label="LuxQuant engine"
    >
      <img src="/logo.png" alt="" />
      <span>luxquant</span>
    </div>
  );
}

function Diagram({ g, width, height, scene, init, running, onPause }) {
  const active = SCENES[scene];
  const [hover, setHover] = useState(null);

  const lit = g.routes.map((route) =>
    routeOn(
      route,
      active,
      hover
        ? {
            type: hover.type,
            id: hover.itemId,
          }
        : null,
      init,
    ),
  );

  const setItemHover = (next) => {
    if (!next) {
      setHover(null);
      return;
    }
    setHover(next);
  };

  const tipPlace = hover?.type === "in" ? "below" : "above";

  return (
    <Plane width={width} height={height} onPause={onPause}>
      <div
        className="lq-hub-glow"
        style={{
          left: g.hub.cx - 130,
          top: g.hub.cy - 130,
          width: 260,
          height: 260,
        }}
      />
      <Lines
        routes={g.routes}
        width={width}
        height={height}
        running={running}
        lit={lit}
        junctions={g.junctions}
        uid={`lq${width}`}
      />
      {g.tags?.map((t) => (
        <div key={t.label} className="lq-tag" style={{ left: t.x, top: t.y, width: t.w }}>
          {t.label}
        </div>
      ))}
      {g.tray ? <div className="lq-tray" style={{ left: g.tray.x, top: g.tray.y, width: g.tray.w, height: g.tray.h }} /> : null}
      {g.T.map((n, i) => (
        <Slot
          key={SYSTEMS[i].id}
          node={n}
          label={SYSTEMS[i].label}
          icon={SYSTEMS[i].icon}
          hint={SYSTEMS[i].hint}
          on={init || active.systems.includes(SYSTEMS[i].id)}
          init={init}
          onHover={(h) =>
            setItemHover(
              h
                ? { type: "in", itemId: SYSTEMS[i].id, node: n, title: SYSTEMS[i].label, hint: SYSTEMS[i].hint }
                : null,
            )
          }
        />
      ))}
      <Pill
        node={g.sanitize}
        icon="filter"
        hint="Noise, outliers and broken prints are stripped before the engine"
      >
        Sanitize
      </Pill>
      <Hub node={g.hub} />
      <DestVenues node={g.logos} />
      {g.O.map((n, i) => (
        <Slot
          key={OUTPUTS[i].id}
          node={n}
          label={OUTPUTS[i].label}
          icon={OUTPUTS[i].icon}
          hint={OUTPUTS[i].hint}
          on={init || active.outputs.includes(OUTPUTS[i].id)}
          init={init}
          onHover={(h) =>
            setItemHover(
              h
                ? { type: "out", itemId: OUTPUTS[i].id, node: n, title: OUTPUTS[i].label, hint: OUTPUTS[i].hint }
                : null,
            )
          }
        />
      ))}
      {hover ? (
        <Tip node={hover.node} title={hover.title} hint={hover.hint} place={tipPlace} planeW={width} />
      ) : null}
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
  const [paused, setPaused] = useState(false);
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
    if (!live || !init) return undefined;
    const first = setTimeout(() => {
      setInit(false);
      setScene((s) => (s + 1) % SCENES.length);
    }, 1400);
    return () => clearTimeout(first);
  }, [live, init]);

  useEffect(() => {
    if (!live || paused || init) return undefined;
    const tick = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4200);
    return () => clearInterval(tick);
  }, [live, paused, init]);

  const goVerify = () => {
    trackFunnel("cta_click", { source: "how_it_works", path: "/" });
    if (isAuthenticated) {
      navigate("/performance");
      return;
    }
    navigate(loginUrl("/performance", { source: "how_it_works" }));
  };

  const goScene = (i) => {
    setInit(false);
    setScene(i);
  };

  return (
    <section
      id="how-it-works"
      data-lq-self=""
      className="relative z-10 w-full scroll-mt-32 overflow-hidden py-16 pb-28 lg:py-24"
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
          <Diagram
            g={D}
            width={DW}
            height={DH}
            scene={scene}
            init={init}
            running={live && !init}
            onPause={setPaused}
          />
        </div>
        <div className="relative lg:hidden">
          <Diagram
            g={M}
            width={MW}
            height={MH}
            scene={scene}
            init={init}
            running={live && !init}
            onPause={setPaused}
          />
        </div>
      </div>

      <div className="lq-livebar mx-auto mt-5 flex max-w-[720px] flex-col items-center gap-3 px-4 sm:mt-6">
        <div className="flex items-center gap-2">
          <span className={`lq-live-dot${live && !paused ? " is-on" : ""}`} aria-hidden="true" />
          <p className="text-center text-[12.5px] font-medium leading-snug tracking-[-0.01em] text-text-secondary sm:text-[13.5px]">
            {sceneCaption(SCENES[scene])}
          </p>
        </div>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Live tape paths">
          {SCENES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === scene}
              aria-label={`Show path ${i + 1}`}
              className={`lq-scene-dot${i === scene ? " is-on" : ""}`}
              onClick={() => goScene(i)}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 flex max-w-[1120px] flex-col items-center gap-2.5 px-4 lg:mt-10 lg:px-8">
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
        .lq-sys {
          --line: rgb(var(--accent) / 0.38);
          --idle: rgb(var(--accent) / 0.22);
          --gold: rgb(var(--accent));
          --gold-ink: rgb(var(--accent-fg));
        }
        .lq-sys-dots {
          position: absolute; inset: -36px 8px -28px;
          border-radius: 28px;
          background-image: radial-gradient(circle, rgb(var(--accent) / 0.38) 0.7px, transparent 0.85px);
          background-size: 14px 14px;
          opacity: .28;
          pointer-events: none;
          -webkit-mask-image: radial-gradient(ellipse 78% 72% at 50% 48%, #737373 35%, transparent 78%);
          mask-image: radial-gradient(ellipse 78% 72% at 50% 48%, #737373 35%, transparent 78%);
        }
        .lq-hub-glow {
          position: absolute; z-index: 0; pointer-events: none; border-radius: 999px;
          background: radial-gradient(circle, rgb(var(--accent) / 0.22), transparent 68%);
        }
        .lq-flow { stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 2 3.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .lq-flow-run {
          fill: none;
          stroke: rgb(var(--accent-light));
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-dasharray: 10 18;
          animation: lqDash 1.15s linear infinite;
        }
        .lq-pkt {
          fill: rgb(var(--accent-light));
          filter: drop-shadow(0 0 5px rgb(var(--accent) / 0.9));
        }
        .lq-junc { fill: rgb(var(--accent) / 0.85); }
        .lq-flow-wrap { transition: opacity .45s cubic-bezier(.4,0,.2,1); }
        .lq-flow-wrap.is-dim { opacity: .18; }
        .lq-flow-wrap.is-dim .lq-flow-run, .lq-flow-wrap.is-dim .lq-pkt { opacity: 0; }
        @keyframes lqDash { to { stroke-dashoffset: -28; } }
        .lq-tray {
          position: absolute; z-index: 1; border-radius: 12px;
          background: rgb(var(--surface-raised) / 0.35);
          border: 1px solid rgb(var(--accent) / 0.08);
        }
        .lq-tag {
          position: absolute; z-index: 2;
          font-size: 9.5px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase;
          color: rgb(var(--fg-muted)); text-align: center; pointer-events: none;
        }
        .lq-pill, .lq-slot, .lq-hub, .lq-dest {
          position: absolute; z-index: 4; box-sizing: border-box;
        }
        .lq-pill {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: 8px;
          background: radial-gradient(63% 56% at 22% -11%, #fff2bd 0%, rgb(var(--accent-light)) 30%, rgb(var(--accent)) 62%, rgb(var(--accent-dark)) 100%);
          color: var(--gold-ink);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -3px 5px rgb(var(--scrim) / 0.16);
          font-size: 12.5px; font-weight: 650; letter-spacing: -0.015em; white-space: nowrap;
          outline: none;
        }
        .lq-pill:focus-visible, .lq-slot:focus-visible, .lq-hub:focus-visible {
          box-shadow: 0 0 0 2px rgb(var(--surface)), 0 0 0 4px rgb(var(--accent) / 0.55);
        }
        .lq-slot {
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px; outline: none;
        }
        .lq-slot span {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; height: 100%; border-radius: 8px;
          background: rgb(var(--accent) / 0.1);
          border: 1px solid rgb(var(--accent) / 0.24);
          color: rgb(var(--accent-text) / 0.78);
          font-size: 12.5px; font-weight: 650; letter-spacing: -0.015em; white-space: nowrap;
          transition: background .4s cubic-bezier(.4,0,.2,1), color .4s cubic-bezier(.4,0,.2,1), border-color .4s cubic-bezier(.4,0,.2,1), box-shadow .4s cubic-bezier(.4,0,.2,1);
        }
        .lq-slot.is-on span, .lq-slot.is-init span {
          background: radial-gradient(63% 56% at 22% -11%, #fff2bd 0%, rgb(var(--accent-light)) 30%, rgb(var(--accent)) 62%, rgb(var(--accent-dark)) 100%);
          border-color: transparent;
          color: var(--gold-ink);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -3px 5px rgb(var(--scrim) / 0.16);
        }
        .lq-slot.is-init span { transition-duration: 0ms; }
        .lq-slot:hover span { filter: brightness(1.06); }
        .lq-hub {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-radius: 16px;
          background: radial-gradient(63% 56% at 22% -11%, #fff2bd 0%, rgb(var(--accent-light)) 30%, rgb(var(--accent)) 62%, rgb(var(--accent-dark)) 100%);
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.38),
            inset 0 -4px 8px rgb(var(--scrim) / 0.18),
            0 18px 36px -18px rgb(var(--accent) / 0.55);
          outline: none;
        }
        .lq-hub img { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; }
        .lq-hub span {
          margin-top: 5px; color: var(--gold-ink);
          font-size: 9px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase;
        }
        .lq-dest {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgb(var(--surface-raised) / 0.62);
          border: 1px solid rgb(var(--ink) / 0.08);
          box-shadow: inset 0 1px 0 rgb(var(--ink) / 0.04);
        }
        .lq-dest-kicker {
          font-size: 9px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase;
          color: rgb(var(--fg-muted));
        }
        .lq-dest-marks {
          display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 7px;
        }
        .lq-tip {
          position: absolute; z-index: 8; width: 196px;
          padding: 8px 10px; border-radius: 10px;
          background: rgb(var(--surface-raised));
          border: 1px solid rgb(var(--ink) / 0.1);
          box-shadow: 0 12px 28px -12px rgb(var(--scrim) / 0.55);
          pointer-events: none;
        }
        @media (hover: none) {
          .lq-tip { display: none; }
        }
        .lq-tip strong {
          display: block; font-size: 11.5px; font-weight: 650; color: rgb(var(--fg));
          letter-spacing: -0.01em;
        }
        .lq-tip span {
          display: block; margin-top: 2px; font-size: 11px; line-height: 1.4; color: rgb(var(--fg-muted));
        }
        .lq-live-dot {
          width: 6px; height: 6px; border-radius: 99px; background: rgb(var(--fg-muted) / 0.45);
        }
        .lq-live-dot.is-on {
          background: rgb(var(--accent));
          box-shadow: 0 0 0 4px rgb(var(--accent) / 0.16);
          animation: lqPulse 1.8s ease-in-out infinite;
        }
        .lq-scene-dot {
          width: 7px; height: 7px; border-radius: 99px; padding: 0; border: 0;
          background: rgb(var(--ink) / 0.18); cursor: pointer;
          transition: width .25s ease, background .25s ease;
        }
        .lq-scene-dot.is-on { width: 18px; background: rgb(var(--accent)); }
        .lq-scene-dot:focus-visible { outline: 2px solid rgb(var(--accent) / 0.55); outline-offset: 2px; }
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
        @keyframes lqPulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        [data-theme="bright"] .lq-sys-dots { opacity: .16; }
        [data-theme="bright"] .lq-hub-glow { opacity: .55; }
        [data-theme="bright"] .lq-dest {
          background: rgb(var(--surface-raised));
          border-color: rgb(var(--ink) / 0.1);
        }
        [data-theme="bright"] .lq-tray { background: rgb(var(--surface-secondary) / 0.7); }
        [data-theme="bright"] .lq-slot span {
          background: rgb(var(--surface-raised));
          color: rgb(var(--accent-text));
        }
        [data-theme="bright"] .lq-slot.is-on span,
        [data-theme="bright"] .lq-slot.is-init span {
          background: radial-gradient(63% 56% at 22% -11%, #fff2bd 0%, rgb(var(--accent-light)) 30%, rgb(var(--accent)) 62%, rgb(var(--accent-dark)) 100%);
          border-color: transparent;
          color: var(--gold-ink);
        }
        @media (prefers-reduced-motion: reduce) {
          .lq-slot span, .lq-ico path, .lq-ico rect, .lq-flow-run, .lq-live-dot { transition: none !important; animation: none !important; }
          .lq-pkt { display: none !important; }
        }
      `}</style>
    </section>
  );
}
