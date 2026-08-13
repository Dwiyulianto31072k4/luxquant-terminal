import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

const SOURCES = [
  { label: "Price & volume", meta: "Multi-exchange OHLCV", icon: "pulse" },
  { label: "Order book", meta: "Liquidity & imbalance", icon: "book" },
  { label: "Derivatives", meta: "Funding · OI · liquidations", icon: "bars" },
  { label: "On-chain flows", meta: "Whales & exchange netflows", icon: "chain" },
  { label: "Volatility", meta: "ATR · ranges · compression", icon: "wave" },
  { label: "Market breadth", meta: "Dominance & correlation", icon: "grid" },
];

const OUTPUTS = [
  { label: "Algo calls", meta: "Entry · TP · SL", icon: "signal" },
  { label: "AI research", meta: "Regime intelligence", icon: "spark" },
  { label: "Money flow", meta: "Capital rotation", icon: "flow" },
  { label: "On-chain alerts", meta: "Whale moves", icon: "bell" },
  { label: "Agent", meta: "Trade assistance", icon: "agent" },
  { label: "Track record", meta: "Public & timestamped", icon: "check" },
];

const DESKTOP_W = 1120;
const DESKTOP_H = 690;
const MOBILE_W = 380;
const MOBILE_H = 800;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const BuildContext = createContext(false);

function useFitScale(ref, designWidth) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / designWidth));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [designWidth, ref]);
  return scale;
}

function useBuildOnSight(ref) {
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setBuilt(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setBuilt(entry.isIntersecting),
      { rootMargin: "-8% 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return built;
}

function Plane({ width, height, children }) {
  const hostRef = useRef(null);
  const scale = useFitScale(hostRef, width);
  const built = useBuildOnSight(hostRef);
  return (
    <div ref={hostRef} className="relative w-full" style={{ height: height * scale }}>
      <div
        className={`arch-plane absolute top-0 overflow-visible ${
          built ? "is-built" : ""
        }`}
        style={{
          width,
          height,
          left: "50%",
          marginLeft: -width / 2,
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        <div className="arch-grid absolute inset-0" aria-hidden="true" />
        <div className="arch-aurora arch-aurora-a" aria-hidden="true" />
        <div className="arch-aurora arch-aurora-b" aria-hidden="true" />
        <BuildContext.Provider value={built}>{children}</BuildContext.Provider>
      </div>
    </div>
  );
}

function Glyph({ type }) {
  const common = {
    className: `arch-glyph arch-glyph-${type}`,
    width: 17,
    height: 17,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (type) {
    case "pulse":
      return <svg {...common}>
        <path className="arch-glyph-main" d="M2 9.5h2.5L6.4 4l3 9.2 2.3-6.1 1.8 2.4H18" />
        <path className="arch-glyph-bars" d="M3.5 17v-2M6.8 17v-3.2M10 17v-2M13.2 17v-4M16.5 17v-2.7" />
      </svg>;
    case "book":
      return <svg {...common}>
        <path className="arch-glyph-book-left" d="M3 4h5.5c1 0 1.5.5 1.5 1.4V17c0-1-.7-1.6-1.7-1.6H3z" />
        <path className="arch-glyph-book-right" d="M17 4h-5.5c-1 0-1.5.5-1.5 1.4V17c0-1 .7-1.6 1.7-1.6H17z" />
      </svg>;
    case "bars":
      return <svg {...common}>
        <path className="arch-bar arch-bar-1" d="M4 15V9" />
        <path className="arch-bar arch-bar-2" d="M8 15V5" />
        <path className="arch-bar arch-bar-3" d="M12 15v-3" />
        <path className="arch-bar arch-bar-4" d="M16 15V7" />
      </svg>;
    case "chain":
      return <svg {...common}>
        <path d="M7.7 12.3 6 14a3 3 0 0 1-4.2-4.2l2.3-2.3A3 3 0 0 1 8.3 7M12.3 7.7 14 6a3 3 0 1 1 4.2 4.2l-2.3 2.3a3 3 0 0 1-4.2.5M6.8 10h6.4" />
        <circle className="arch-glyph-packet" cx="7" cy="10" r="1.15" fill="currentColor" stroke="none" />
      </svg>;
    case "wave":
      return <svg {...common}><path d="M2 11c2.2 0 2.2-5 4.4-5s2.2 8 4.4 8 2.2-6 4.4-6c1.1 0 1.7 1 2.8 2" /></svg>;
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg>;
    case "signal":
      return <svg {...common}><path d="M3 15V9M7 15V6M11 15v-4M15 15V3M2 17h16" /></svg>;
    case "spark":
      return <svg {...common}><path d="m10 2 1.3 4.2L16 8l-4.7 1.8L10 14l-1.3-4.2L4 8l4.7-1.8zM16 13l.6 1.8 1.9.7-1.9.7L16 18l-.6-1.8-1.9-.7 1.9-.7z" /></svg>;
    case "flow":
      return <svg {...common}><path d="M3 5h8M8 2l3 3-3 3M17 15H9M12 12l-3 3 3 3" /></svg>;
    case "bell":
      return <svg {...common}><path d="M5 14h10l-1.3-2V8a3.7 3.7 0 0 0-7.4 0v4zM8.5 16.5h3" /></svg>;
    case "agent":
      return <svg {...common}><rect x="3" y="5" width="14" height="11" rx="3" /><path d="M10 2v3M7 10h.01M13 10h.01M7 13h6" /></svg>;
    default:
      return <svg {...common}><path d="m4 10 4 4 8-8" /><circle cx="10" cy="10" r="8" /></svg>;
  }
}

function GlassNode({ item, x, y, w, h, delay = 0, compact = false, output = false }) {
  return (
    <div
      className={`arch-node arch-node-${item.icon} absolute flex items-center ${compact ? "gap-2 px-3" : "gap-3 px-4"} ${
        output ? "arch-output" : ""
      }`}
      style={{ left: x, top: y, width: w, height: h, "--delay": `${delay}ms` }}
    >
      <span className="arch-node-icon"><Glyph type={item.icon} /></span>
      <span className="min-w-0">
        <span className={`block truncate font-semibold text-text-primary ${compact ? "text-[11px]" : "text-[12px]"}`}>
          {item.label}
        </span>
        {!compact && <span className="mt-0.5 block truncate text-[9.5px] text-text-muted">{item.meta}</span>}
      </span>
      <span className="arch-health" aria-hidden="true" />
    </div>
  );
}

function SystemNode({ x, y, w, h, delay, eyebrow, title, note, tone = "glass", children }) {
  return (
    <div
      className={`arch-system-node arch-system-${tone} absolute flex flex-col justify-center`}
      style={{ left: x, top: y, width: w, height: h, "--delay": `${delay}ms` }}
    >
      {children}
      {eyebrow && <span className="arch-eyebrow">{eyebrow}</span>}
      <span className="arch-system-title">{title}</span>
      {note && <span className="arch-system-note">{note}</span>}
    </div>
  );
}

function FlowRoutes({ routes, width, height, prefix }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      {routes.map((route, index) => (
        <g
          key={`${prefix}-${index}`}
          style={{
            "--route-start": `${route.start || 0}s`,
            "--route-duration": `${route.duration || 1.2}s`,
            "--route-arrive": `${(route.start || 0) + (route.duration || 1.2)}s`,
            "--flow-start": `${route.flowStart || route.start || 0}s`,
            "--flow-duration": `${route.ambientDuration || (route.major ? 4.4 : 5.8)}s`,
            "--ambient-start": `${route.ambientAt || 8.2 + (route.delay || index * 0.11)}s`,
          }}
        >
          <path
            className="arch-route"
            d={route.d}
            pathLength="1"
          />
          <path className="arch-route-sequence-aura" d={route.d} pathLength="1" />
          <path className="arch-route-sequence-tail" d={route.d} pathLength="1" />
          <path className="arch-route-sequence-tip" d={route.d} pathLength="1" />
          <path className="arch-route-flow-glow" d={route.d} pathLength="1" />
          <path className="arch-route-flow-tail" d={route.d} pathLength="1" />
          <path className="arch-route-flow-core" d={route.d} pathLength="1" />
        </g>
      ))}
    </svg>
  );
}

const INPUT_X = [75, 238, 401, 564, 727, 890];
const OUTPUT_X = INPUT_X;
const INPUT_CENTERS = INPUT_X.map((x) => x + 77.5);
const DESKTOP_ROUTES = [
  /* One continuous route per source, all terminating at the exact same
     centre junction.  This mirrors the mobile topology and avoids the tiny
     branch-to-bus gap that a separately drawn shared rail introduced. */
  ...INPUT_CENTERS.map((center, i) => ({
    d: center < 560
      ? `M${center} 122 V142 Q${center} 156 ${center + 14} 156 H546 Q560 156 560 170 V184`
      : `M${center} 122 V142 Q${center} 156 ${center - 14} 156 H574 Q560 156 560 170 V184`,
    start: 0.58 + i * 0.08,
    duration: 1.6 - i * 0.08,
    ambientDuration: 3.15 + i * 0.14,
    delay: i * 0.46,
  })),
  { d: "M560 242 V264 Q560 276 548 276 H544", major: true, start: 2.48, duration: 0.68 },
  /* Side cards connect at their true geometric boundary and vertical centre.
     The previous paths stopped 2px short, then turned down, which created a
     visible hanging seam on both sides at desktop scale. */
  { d: "M420 347 H340", start: 3.36, duration: 0.66 },
  { d: "M700 347 H780", start: 3.42, duration: 0.66 },
  { d: "M560 418 V444 Q560 456 548 456 H544", major: true, start: 4.22, duration: 0.7 },
  /* Delivery fans out from the same centre line.  Each destination owns one
     uninterrupted path, so there is no bus-to-branch seam at either edge. */
  ...INPUT_CENTERS.map((center, i) => ({
    d: center < 560
      ? `M560 514 V598 Q560 614 544 614 H${center + 14} Q${center} 614 ${center} 628 V632`
      : `M560 514 V598 Q560 614 576 614 H${center - 14} Q${center} 614 ${center} 628 V632`,
    start: 5.06 + i * 0.04,
    duration: 1.28 - i * 0.04,
    ambientDuration: 3.7 + i * 0.15,
    delay: 1.1 + i * 0.43,
  })),
];

function DesktopDiagram() {
  return (
    <Plane width={DESKTOP_W} height={DESKTOP_H}>
      <FlowRoutes routes={DESKTOP_ROUTES} width={DESKTOP_W} height={DESKTOP_H} prefix="desktop" />

      <div className="arch-zone arch-stage absolute left-[50px] top-[42px] h-[108px] w-[1020px]" style={{ "--delay": "80ms" }}>
        <span className="arch-zone-label">01 · MARKET INPUTS</span>
      </div>
      {SOURCES.map((item, index) => (
        <GlassNode key={item.label} item={item} x={INPUT_X[index]} y={72} w={155} h={50} delay={220 + index * 95} />
      ))}

      <SystemNode
        x={445} y={184} w={230} h={58} delay={2280}
        eyebrow="02 · NORMALIZATION LAYER" title="Market data sanitizer" note="Freshness · quality · consistency"
      />

      <SystemNode
        x={105} y={309} w={235} h={76} delay={4050}
        eyebrow="POLICY ENGINE" title="Risk geometry" note="Entry · profit targets · exit level"
      />
      <SystemNode
        x={780} y={309} w={235} h={76} delay={4130}
        eyebrow="EVIDENCE LAYER" title="Public track record" note="Timestamped · preserved · auditable"
      />

      <SystemNode x={420} y={276} w={280} h={142} delay={3200} tone="core" title="Predictive intelligence core">
        <div className="arch-core-top">
          <span className="arch-core-mark"><img src="/logo.png" alt="LuxQuant" /></span>
          <span className="arch-core-status"><i /> ALWAYS ON</span>
        </div>
        <span className="arch-core-kicker">03 · DECISION ENGINE</span>
      </SystemNode>

      <SystemNode
        x={455} y={456} w={210} h={58} delay={4960} tone="terminal"
        eyebrow="DELIVERY LAYER" title="Your LuxQuant terminal" note="One decision surface"
      />

      <div className="arch-zone arch-stage absolute left-[50px] top-[566px] h-[124px] w-[1020px]" style={{ "--delay": "6380ms" }}>
        <span className="arch-zone-label">04 · ACTIONABLE OUTPUTS</span>
      </div>
      {OUTPUTS.map((item, index) => (
        <GlassNode key={item.label} item={item} x={OUTPUT_X[index]} y={632} w={155} h={46} delay={6700 + index * 70} output />
      ))}
    </Plane>
  );
}

const MOBILE_ROUTES = [
  { d: "M104 102 H176 Q190 102 190 116 V198 Q190 210 202 210", start: 0.55, duration: 0.82 },
  { d: "M276 102 H204 Q190 102 190 116 V198 Q190 210 202 210", start: 0.62, duration: 0.82 },
  { d: "M104 141 H176 Q190 141 190 155 V198 Q190 210 202 210", start: 0.69, duration: 0.76 },
  { d: "M276 141 H204 Q190 141 190 155 V198 Q190 210 202 210", start: 0.76, duration: 0.76 },
  { d: "M104 180 H176 Q190 180 190 194 V198 Q190 210 202 210", start: 0.83, duration: 0.7 },
  { d: "M276 180 H204 Q190 180 190 194 V198 Q190 210 202 210", start: 0.9, duration: 0.7 },
  { d: "M190 264 V288 Q190 300 178 300", major: true, start: 2.3, duration: 0.62 },
  { d: "M190 432 V444 Q190 456 178 456 H99 Q87 456 87 468", start: 3.35, duration: 0.72 },
  { d: "M190 432 V444 Q190 456 202 456 H281 Q293 456 293 468", start: 3.42, duration: 0.72 },
  { d: "M190 512 V540 Q190 552 202 552", major: true, start: 4.15, duration: 0.68 },
  { d: "M190 606 V620 Q190 632 202 632", major: true, start: 5.05, duration: 0.68 },
  { d: "M190 632 V650 Q190 660 178 660 H104 V668", start: 5.82, duration: 0.72 },
  { d: "M190 632 V650 Q190 660 202 660 H276 V668", start: 5.9, duration: 0.72 },
  { d: "M190 632 V690 Q190 700 178 700 H104 V708", start: 5.98, duration: 0.78 },
  { d: "M190 632 V690 Q190 700 202 700 H276 V708", start: 6.06, duration: 0.78 },
  { d: "M190 632 V730 Q190 740 178 740 H104 V748", start: 6.14, duration: 0.84 },
  { d: "M190 632 V730 Q190 740 202 740 H276 V748", start: 6.22, duration: 0.84 },
];

function MobileDiagram() {
  return (
    <Plane width={MOBILE_W} height={MOBILE_H}>
      <FlowRoutes routes={MOBILE_ROUTES} width={MOBILE_W} height={MOBILE_H} prefix="mobile" />

      <div className="arch-zone arch-stage absolute left-[10px] top-[42px] h-[148px] w-[360px]" style={{ "--delay": "80ms" }}>
        <span className="arch-zone-label">01 · MARKET INPUTS</span>
      </div>
      {SOURCES.map((item, index) => (
        <GlassNode
          key={item.label} item={item} compact
          x={index % 2 === 0 ? 25 : 197}
          y={70 + Math.floor(index / 2) * 39}
          w={158} h={32} delay={180 + index * 95}
        />
      ))}

      <SystemNode
        x={85} y={210} w={210} h={54} delay={1650}
        eyebrow="02 · NORMALIZATION" title="Market data sanitizer" note="Fresh · consistent · clean"
      />

      <SystemNode x={60} y={300} w={260} h={132} delay={2990} tone="core" title="Predictive intelligence">
        <div className="arch-core-top">
          <span className="arch-core-mark"><img src="/logo.png" alt="LuxQuant" /></span>
          <span className="arch-core-status"><i /> ALWAYS ON</span>
        </div>
        <span className="arch-core-kicker">03 · DECISION ENGINE</span>
      </SystemNode>

      <SystemNode x={14} y={458} w={170} h={54} delay={4100} eyebrow="RISK POLICY" title="Entry · TP · exit" />
      <SystemNode x={196} y={458} w={170} h={54} delay={4180} eyebrow="EVIDENCE" title="Public record" />

      <SystemNode
        x={90} y={552} w={200} h={54} delay={4890} tone="terminal"
        eyebrow="DELIVERY" title="Your LuxQuant terminal" note="One decision surface"
      />

      <div className="arch-zone arch-stage absolute left-[10px] top-[632px] h-[158px] w-[360px]" style={{ "--delay": "5760ms" }}>
        <span className="arch-zone-label">04 · ACTIONABLE OUTPUTS</span>
      </div>
      {OUTPUTS.map((item, index) => (
        <GlassNode
          key={item.label} item={item} compact output
          x={index % 2 === 0 ? 25 : 197}
          y={668 + Math.floor(index / 2) * 40}
          w={158} h={34} delay={6560 + index * 105}
        />
      ))}
    </Plane>
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
      className="relative z-10 mx-auto w-full max-w-7xl scroll-mt-28 overflow-hidden px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">How LuxQuant thinks</p>
        <h2 className="mt-7 text-[30px] font-extrabold leading-[1.27] tracking-[-0.025em] text-text-primary sm:text-[38px] lg:text-[48px]">
          From market noise to a decision{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            you can verify.
          </span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-[14px] font-medium leading-[1.7] text-text-muted sm:text-[17px] lg:text-[19px]">
          A live intelligence network turns fragmented market data into risk-defined calls—then preserves every published decision on the public record.
        </p>
      </div>

      <div className="mx-auto mt-11 hidden w-full max-w-[1120px] lg:block">
        <DesktopDiagram />
      </div>
      <div className="mx-auto mt-9 w-full max-w-[430px] lg:hidden">
        <MobileDiagram />
      </div>

      <p className="mx-auto mt-7 max-w-3xl text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[14.5px] lg:mt-8">
        Observe the whole market, filter stale data, and define entry, targets, and exit before publication—then deliver the call and preserve its proof.
      </p>

      <div className="mt-5 flex flex-col items-center gap-2.5 lg:mt-6">
        <PrimaryButton size="md" width="fullMobile" onClick={goVerify} className="group">
          {isAuthenticated ? "See the full record" : "Verify the track record"}
          <BtnArrow />
        </PrimaryButton>
        <p className="text-center text-[10.5px] leading-relaxed text-text-muted">
          Every call preserved. No selective screenshots.
        </p>
      </div>

      <style>{`
        .arch-plane {
          isolation: isolate;
          background: transparent;
          --arch-zone: #161719;
          --arch-zone-border: #302f2c;
          --arch-node: #242527;
          --arch-node-hover: #2b2925;
          --arch-node-border: #3a3936;
          --arch-system: #292a2c;
          --arch-system-border: #464641;
          --arch-core: #342d23;
          --arch-core-border: #806526;
          --arch-gold: #d7a916;
          --arch-gold-hi: #f0c84a;
          --arch-route: #4b4f54;
        }
        .arch-grid {
          opacity: .14;
          background-image: radial-gradient(circle, rgba(189, 153, 55, .17) .65px, transparent .75px);
          background-size: 18px 18px;
          mask-image: radial-gradient(ellipse 78% 76% at 50% 48%, #000 24%, transparent 84%);
          -webkit-mask-image: radial-gradient(ellipse 78% 76% at 50% 48%, #000 24%, transparent 84%);
        }
        .arch-aurora { display: none; }
        .arch-zone {
          z-index: 1;
          border: 1px solid var(--arch-zone-border);
          border-radius: 18px;
          background: var(--arch-zone);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
        }
        .arch-stage {
          opacity: 0;
          transform: translateY(8px) scale(.985);
          transition: opacity 520ms ${EASE} var(--delay), transform 520ms ${EASE} var(--delay);
        }
        .is-built .arch-stage { opacity: 1; transform: none; }
        .arch-zone-label {
          position: absolute; left: 16px; top: 10px;
          color: #e3b63b; font-size: 8px; font-weight: 720; letter-spacing: .18em;
        }
        .arch-node, .arch-system-node {
          z-index: 5;
          border: 1px solid var(--arch-node-border);
          border-radius: 11px;
          background: var(--arch-node);
          opacity: 0; transform: translateY(9px) scale(.975);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
          transition: opacity 580ms ${EASE} var(--delay), transform 580ms ${EASE} var(--delay), border-color 220ms ease, background 220ms ease;
        }
        .is-built .arch-node, .is-built .arch-system-node { opacity: 1; transform: none; }
        .arch-node:hover { border-color: #67572d; background: var(--arch-node-hover); }
        .arch-node-icon {
          position: relative; display: grid; flex: 0 0 auto; place-items: center; width: 27px; height: 27px; overflow: hidden; border-radius: 7px;
          color: #171304; background: var(--arch-gold); border: 1px solid var(--arch-gold-hi);
        }
        .arch-glyph { overflow: visible; transform-box: fill-box; transform-origin: center; }
        .arch-glyph path, .arch-glyph rect, .arch-glyph circle {
          transform-box: fill-box; transform-origin: center;
        }
        /* Each data family keeps the original pictogram but makes the data
           behaviour legible at a glance: tick + volume, book pressure,
           changing derivatives bars, packet flow, volatility and breadth. */
        .is-built .arch-node-pulse .arch-glyph-main { animation: archPriceWave 2.7s ease-in-out infinite; }
        .is-built .arch-node-pulse .arch-glyph-bars { animation: archVolumeBars 1.45s steps(4, end) infinite; }
        .is-built .arch-node-book .arch-glyph-book-left { animation: archBookBid 2.4s ease-in-out infinite; }
        .is-built .arch-node-book .arch-glyph-book-right { animation: archBookAsk 2.4s ease-in-out infinite; }
        .is-built .arch-node-bars .arch-bar-1 { animation: archBarPulse 1.8s ease-in-out -.2s infinite; }
        .is-built .arch-node-bars .arch-bar-2 { animation: archBarPulse 1.8s ease-in-out -.9s infinite; }
        .is-built .arch-node-bars .arch-bar-3 { animation: archBarPulse 1.8s ease-in-out -1.3s infinite; }
        .is-built .arch-node-bars .arch-bar-4 { animation: archBarPulse 1.8s ease-in-out -.55s infinite; }
        .is-built .arch-node-chain .arch-glyph-packet { animation: archPacket 1.9s cubic-bezier(.4,0,.2,1) infinite; }
        .is-built .arch-node-wave .arch-glyph { animation: archVolatility 2.1s ease-in-out infinite; }
        .is-built .arch-node-grid .arch-glyph rect:nth-of-type(1) { animation: archBreadth 2.4s ease-in-out 0s infinite; }
        .is-built .arch-node-grid .arch-glyph rect:nth-of-type(2) { animation: archBreadth 2.4s ease-in-out .3s infinite; }
        .is-built .arch-node-grid .arch-glyph rect:nth-of-type(3) { animation: archBreadth 2.4s ease-in-out .6s infinite; }
        .is-built .arch-node-grid .arch-glyph rect:nth-of-type(4) { animation: archBreadth 2.4s ease-in-out .9s infinite; }
        .is-built .arch-node-signal .arch-glyph { animation: archSignal 2s ease-in-out infinite; }
        .is-built .arch-node-spark .arch-glyph { animation: archSpark 3.4s ease-in-out infinite; }
        .is-built .arch-node-flow .arch-glyph { animation: archCapitalFlow 2.2s ease-in-out infinite; }
        .is-built .arch-node-bell .arch-glyph { animation: archBell 3.1s cubic-bezier(.36,.07,.19,.97) infinite; }
        .is-built .arch-node-agent .arch-glyph { animation: archAgent 2.6s ease-in-out infinite; }
        .is-built .arch-node-check .arch-glyph { animation: archProof 2.8s ease-in-out infinite; }
        .arch-output { background: #242527; border-color: #3a3936; }
        .arch-output .arch-node-icon { color: #171304; background: var(--arch-gold); }
        .arch-health { position: absolute; right: 8px; top: 8px; width: 4px; height: 4px; border-radius: 99px; background: var(--arch-gold-hi); animation: archHealth 2.8s ease-in-out infinite; }
        .arch-node:nth-of-type(3n) .arch-health { animation-delay: -1.4s; }
        .arch-system-node { padding: 0 18px; background: var(--arch-system); border-color: var(--arch-system-border); }
        .arch-eyebrow { color: #e3b63b; font-size: 8px; line-height: 1; font-weight: 720; letter-spacing: .16em; }
        .arch-system-title { margin-top: 7px; color: #f6f8fc; font-size: 13px; line-height: 1.05; font-weight: 650; letter-spacing: -.01em; }
        .arch-system-note { margin-top: 6px; color: #9a9ca1; font-size: 9.5px; line-height: 1; }
        .arch-system-core {
          overflow: hidden; padding: 22px 24px;
          border-color: var(--arch-core-border);
          background: var(--arch-core);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
        }
        .arch-system-core::before {
          content: none;
        }
        .arch-system-core::after {
          content: none;
        }
        .arch-core-top, .arch-core-kicker, .arch-system-core .arch-system-title { position: relative; z-index: 2; }
        .arch-core-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .arch-core-mark { display: grid; place-items: center; width: 37px; height: 37px; border-radius: 9px; background: #181714; border: 1px solid #6d5722; }
        .arch-core-mark img { width: 29px; height: 29px; border-radius: 6px; object-fit: cover; }
        .arch-core-status { display: flex; align-items: center; gap: 6px; color: #d6d0c1; font-size: 8px; font-weight: 700; letter-spacing: .14em; }
        .arch-core-status i { width: 5px; height: 5px; border-radius: 99px; background: var(--arch-gold-hi); animation: archHealth 2s ease-in-out infinite; }
        .arch-core-kicker { display: block; color: #e3b63b; font-size: 8px; line-height: 1; font-weight: 700; letter-spacing: .19em; }
        .arch-system-core .arch-system-title { margin-top: 9px; color: #ffffff; font-size: 19px; line-height: 1.1; font-weight: 700; letter-spacing: -.025em; }
        .arch-system-terminal { border-color: var(--arch-gold-hi); background: var(--arch-gold); box-shadow: 0 14px 34px rgba(213, 164, 23, .12); }
        .arch-system-terminal .arch-eyebrow { color: #473705; }
        .arch-system-terminal .arch-system-title { color: #171304; }
        .arch-system-terminal .arch-system-note { color: #594609; }
        .arch-route {
          stroke: var(--arch-route);
          stroke-width: .9;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0;
          transition: opacity 260ms ease var(--route-start);
        }
        .is-built .arch-route { opacity: .78; }
        .arch-route-sequence-aura,
        .arch-route-sequence-tail,
        .arch-route-sequence-tip,
        .arch-route-flow-glow,
        .arch-route-flow-tail,
        .arch-route-flow-core {
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dashoffset: 1;
          opacity: 0;
        }
        .arch-route-sequence-aura,
        .arch-route-flow-glow {
          --flow-alpha: .12;
          stroke: #e7b72d;
          stroke-width: 8;
          stroke-dasharray: .18 .82;
          filter: blur(2.8px) drop-shadow(0 0 6px rgba(231, 183, 45, .46));
        }
        .arch-route-sequence-tail,
        .arch-route-flow-tail {
          --flow-alpha: .62;
          stroke: #c08c18;
          stroke-width: 2.5;
          stroke-dasharray: .14 .86;
          filter: drop-shadow(0 0 3px rgba(210, 157, 29, .52));
        }
        .arch-route-sequence-tip,
        .arch-route-flow-core {
          --flow-alpha: 1;
          stroke: #fff7db;
          stroke-width: 1.45;
          stroke-dasharray: .026 .974;
          filter: drop-shadow(0 0 2px #fff0b7) drop-shadow(0 0 5px rgba(240, 200, 74, .9));
        }
        .is-built .arch-route-sequence-aura {
          animation: archRouteSequenceAura var(--route-duration) cubic-bezier(.35,.02,.22,1) var(--route-start) 1 both;
        }
        .is-built .arch-route-sequence-tail {
          animation: archRouteSequenceTail var(--route-duration) cubic-bezier(.35,.02,.22,1) var(--route-start) 1 both;
        }
        .is-built .arch-route-sequence-tip {
          animation: archRouteSequenceTip var(--route-duration) cubic-bezier(.35,.02,.22,1) var(--route-start) 1 both;
        }
        .is-built .arch-route-flow-glow,
        .is-built .arch-route-flow-tail,
        .is-built .arch-route-flow-core {
          animation: archRouteFlow var(--flow-duration) linear var(--ambient-start) infinite;
        }
        .arch-live-dot { display: inline-block; width: 6px; height: 6px; border-radius: 99px; background: rgb(var(--accent)); animation: archHealth 2.4s ease-in-out infinite; }
        @keyframes archRouteSequenceAura {
          0% { opacity: 0; stroke-dashoffset: 1; }
          7%, 88% { opacity: .12; }
          100% { opacity: 0; stroke-dashoffset: -.18; }
        }
        @keyframes archRouteSequenceTail {
          0% { opacity: 0; stroke-dashoffset: 1; }
          7%, 88% { opacity: .62; }
          100% { opacity: 0; stroke-dashoffset: -.14; }
        }
        @keyframes archRouteSequenceTip {
          0% { opacity: 0; stroke-dashoffset: 1; }
          7%, 88% { opacity: 1; }
          100% { opacity: 0; stroke-dashoffset: -.026; }
        }
        @keyframes archRouteFlow {
          0% { opacity: 0; stroke-dashoffset: 1; }
          6%, 88% { opacity: var(--flow-alpha); }
          100% { opacity: 0; stroke-dashoffset: -.16; }
        }
        @keyframes archHealth { 0%, 100% { opacity: .42; transform: scale(.82); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes archPriceWave { 0%,100% { transform: translateX(-.8px); } 50% { transform: translateX(.8px) scaleY(1.08); } }
        @keyframes archVolumeBars { 0%,100% { transform: scaleY(.58); opacity: .62; } 50% { transform: scaleY(1); opacity: 1; } }
        @keyframes archBookBid { 0%,100% { transform: scaleX(.92); } 50% { transform: scaleX(1.08); } }
        @keyframes archBookAsk { 0%,100% { transform: scaleX(1.08); } 50% { transform: scaleX(.92); } }
        @keyframes archBarPulse { 0%,100% { transform: scaleY(.58); } 50% { transform: scaleY(1.08); } }
        @keyframes archPacket { 0% { transform: translateX(-4px); opacity: 0; } 28%,72% { opacity: 1; } 100% { transform: translateX(7px); opacity: 0; } }
        @keyframes archVolatility { 0%,100% { transform: scaleY(.72) translateX(-.6px); } 50% { transform: scaleY(1.16) translateX(.6px); } }
        @keyframes archBreadth { 0%,100% { opacity: .48; transform: scale(.78); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes archSignal { 0%,100% { transform: scaleY(.72); } 50% { transform: scaleY(1.06); } }
        @keyframes archSpark { 0%,78%,100% { transform: rotate(0) scale(1); } 88% { transform: rotate(15deg) scale(1.16); } }
        @keyframes archCapitalFlow { 0%,100% { transform: translateX(-1px); } 50% { transform: translateX(1px); } }
        @keyframes archBell { 0%,84%,100% { transform: rotate(0); } 88% { transform: rotate(-8deg); } 92% { transform: rotate(8deg); } 96% { transform: rotate(-4deg); } }
        @keyframes archAgent { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
        @keyframes archProof { 0%,100% { opacity: .72; transform: scale(.94); } 45% { opacity: 1; transform: scale(1.04); } }
        @media (prefers-reduced-motion: reduce) {
          .arch-route-sequence-aura, .arch-route-sequence-tail, .arch-route-sequence-tip,
          .arch-route-flow-glow, .arch-route-flow-tail, .arch-route-flow-core { display: none !important; }
          .arch-health, .arch-live-dot, .arch-core-status i, .arch-glyph, .arch-glyph * { animation: none !important; }
          .arch-node, .arch-system-node, .arch-route, .arch-stage { transition-duration: 1ms !important; transition-delay: 0ms !important; }
        }
      `}</style>
    </section>
  );
}
