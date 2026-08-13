import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { loginUrl } from "../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../utils/funnelAnalytics";
import { PrimaryButton, BtnArrow } from "./shared/LandingButtons";

/* Live Stripe homepage (DeveloperSystemsAnimation, chunk 55849):
   4 scenes / 4s, 1s first tick, pause when hidden.
   Top slots + bottom PSPs fill (opacity+scale). Method nodes stay on.
   Logo cells flip rotateX 180deg / 2s. PSP paths draw via stroke-dashoffset. */

const SYSTEMS = [
  { id: "price", label: "Price & volume" },
  { id: "book", label: "Order book" },
  { id: "derivs", label: "Derivatives" },
  { id: "onchain", label: "On-chain" },
  { id: "vol", label: "Volatility" },
];

const OUTPUTS = [
  { id: "calls", label: "Algo calls" },
  { id: "ai", label: "AI research" },
  { id: "flow", label: "Money flow" },
  { id: "agent", label: "Agent" },
];

const SCENES = [
  { systems: ["price", "book", "derivs", "onchain", "vol"], outputs: ["calls", "ai", "flow", "agent"] },
  { systems: ["book", "vol"], outputs: [] },
  { systems: ["book", "derivs", "onchain"], outputs: ["calls", "agent"] },
  { systems: ["price", "onchain", "vol"], outputs: ["ai", "flow", "agent"] },
];

const LOGO = (file) => `/exchanges/${file}`;

const LOGO_CELLS = [
  [null, LOGO("binance.png"), null, LOGO("okx.png")],
  [LOGO("bybit.png?v=2"), LOGO("okx.png"), LOGO("gate.png"), LOGO("mexc.png")],
  [LOGO("bitget.png"), LOGO("bingx.png?v=2"), LOGO("kucoin.png"), LOGO("htx.png")],
  [null, LOGO("coinbase.png"), null, null],
  [LOGO("gate.png"), LOGO("binance.png"), LOGO("bybit.png?v=2"), LOGO("okx.png")],
  [LOGO("bingx.png?v=2"), LOGO("bitget.png"), LOGO("upbit.png"), LOGO("cryptocom.png")],
];

const DEST_ICONS = ["tiles", "chart", "flow", "check"];

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
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

function Slot({ label, active, initial }) {
  return (
    <div
      className={`lq-sys-slot${active ? " is-on" : ""}${initial ? " is-init" : ""}`}
    >
      <span className="lq-sys-slot-fill">{label}</span>
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
      const even = scene % 2 === 0;
      const next = (scene + 1) % items.length;
      if (even) setBack(next);
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
    <div className="lq-sys-app" aria-hidden="true">
      <div ref={wrap} className="lq-sys-app-flip" onTransitionEnd={onEnd}>
        <div className="lq-sys-app-face is-front">
          {a ? <img src={a} alt="" /> : <span className="lq-sys-app-empty" />}
        </div>
        <div className="lq-sys-app-face is-back">
          {b ? <img src={b} alt="" /> : <span className="lq-sys-app-empty" />}
        </div>
      </div>
    </div>
  );
}

function DestIcon({ kind }) {
  if (kind === "chart") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M3 17V9M8 17V5M13 17v-5M18 17V7" stroke="#171304" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "flow") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M3 6h9M9 3l3 3-3 3M19 16H10M13 13l-3 3 3 3" stroke="#171304" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "check") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="m5 11 4 4 8-8" stroke="#171304" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.6" fill="#F0B90B" />
      <rect x="12.5" y="1.5" width="8" height="8" rx="1.6" fill="#C9A227" />
      <rect x="1.5" y="12.5" width="8" height="8" rx="1.6" fill="#8A6A22" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.6" fill="#1B1E2E" />
    </svg>
  );
}

function Method({ label, wide }) {
  return <div className={`lq-sys-method${wide ? " is-wide" : ""}`}>{label}</div>;
}

export default function Architecture() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const root = useRef(null);
  const inView = useInView(root);
  const [scene, setScene] = useState(0);
  const [initial, setInitial] = useState(true);
  const [pageOn, setPageOn] = useState(() => typeof document === "undefined" || !document.hidden);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const live = inView && pageOn && !reduce;
  const active = SCENES[scene];

  useEffect(() => {
    const onVis = () => setPageOn(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!live) return undefined;
    const first = setTimeout(() => {
      setInitial(false);
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

  const outOn = (id) => active.outputs.includes(id);

  return (
    <section
      id="how-it-works"
      data-lq-self=""
      className="relative z-10 w-full scroll-mt-28 overflow-hidden py-16 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1120px] px-4 lg:px-8">
        <p className="text-[12px] font-medium tracking-wide text-text-muted sm:text-[13px]">
          How LuxQuant thinks
        </p>
        <h2 className="lq-sys-kicker mt-5 max-w-4xl text-[28px] font-semibold leading-[1.28] tracking-[-0.025em] sm:text-[34px] lg:text-[40px]">
          <span className="text-text-primary">From market noise to a decision you can verify. </span>
          <span className="text-text-muted">
            A live intelligence network turns fragmented market data into risk-defined
            calls—then preserves every published decision on the public record.
          </span>
        </h2>
      </div>

      <div ref={root} className="lq-sys mx-auto mt-10 w-full max-w-[1120px] px-2 sm:mt-12 sm:px-4 lg:px-8">
        <div className="lq-sys-dots" aria-hidden="true" />

        <figure className="lq-sys-figure" aria-label="How LuxQuant connects market inputs to a published call">
          <div className="lq-sys-left" aria-hidden="true">
            <div className="lq-sys-apps">
              {LOGO_CELLS.map((items, i) => (
                <FlipLogo
                  key={i}
                  items={items}
                  scene={scene}
                  delay={i * 80}
                  running={live && !initial}
                />
              ))}
            </div>
          </div>

          <div className="lq-sys-center">
            <div className="lq-sys-bar" aria-hidden="true">
              <div className="lq-sys-bar-bg" />
              <div className="lq-sys-bar-a">
                {SYSTEMS.slice(0, 3).map((s) => (
                  <Slot
                    key={s.id}
                    label={s.label}
                    active={active.systems.includes(s.id)}
                    initial={initial}
                  />
                ))}
              </div>
              <div className="lq-sys-bar-b">
                {SYSTEMS.slice(3).map((s) => (
                  <Slot
                    key={s.id}
                    label={s.label}
                    active={active.systems.includes(s.id)}
                    initial={initial}
                  />
                ))}
              </div>
            </div>

            <div className="lq-sys-top-row">
              <svg className="lq-sys-fork lq-sys-fork-dt" width="313" height="215" viewBox="0 0 313 215" fill="none" aria-hidden="true">
                <path d="M1 0V96.976C1 101.395 4.582 104.976 9 104.976H118.527H148.372C152.79 104.976 156.372 108.558 156.372 112.976V214.258" stroke="currentColor" strokeDasharray="2 2" />
                <path d="M311.671 0V96.976C311.671 101.395 308.09 104.976 303.671 104.976H194.144H164.3C159.882 104.976 156.3 108.558 156.3 112.976V114.258" stroke="currentColor" strokeDasharray="2 2" />
              </svg>
              <svg className="lq-sys-fork lq-sys-fork-mb" width="190" height="340" viewBox="0 0 190 340" fill="none" aria-hidden="true">
                <path d="M1.00027 0L1 158.584C0.999992 163.002 4.58172 166.584 9 166.584H72.0989H86.9932C91.4114 166.584 94.9932 170.165 94.9932 174.584V340" stroke="currentColor" strokeDasharray="2 2" />
                <path d="M189 0V158.584C189 163.002 185.418 166.584 181 166.584H117.901H103.007C98.5886 166.584 95.0068 170.165 95.0068 174.584V181.313" stroke="currentColor" strokeDasharray="2 2" />
              </svg>
              <div className="lq-sys-methods-top">
                <Method label="Sanitize" />
                <Method label="Signals" wide />
              </div>
            </div>

            <div className="lq-sys-mid-row">
              <Method label="Venues" />
              <Method label="Track record" />
            </div>

            <div className="lq-sys-hub" aria-hidden="true">
              <img src="/logo.png" alt="" />
              <span>luxquant</span>
            </div>

            <svg className="lq-sys-spine lq-sys-spine-dt" viewBox="0 0 1000 386" fill="none" aria-hidden="true">
              <path d="M1000 194H0" stroke="currentColor" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            </svg>
            <svg className="lq-sys-spine lq-sys-spine-mb" viewBox="0 0 592 83" fill="none" aria-hidden="true">
              <path d="M0 1h529.645c4.661 0 8.441 3.582 8.441 8v74" stroke="currentColor" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            </svg>

            <div className="lq-sys-bottom-row">
              <Method label="Terminal" />
            </div>

            <div className="lq-sys-outs" aria-hidden="true">
              <svg
                className="lq-sys-out-lines"
                width="191"
                height="102"
                viewBox="0 0 191 102"
                fill="none"
              >
                {[
                  "M81.0576 0.342323C81.0576 13.3582 81.0576 11.8288 81.0576 18.4909C81.0576 22.9092 77.4759 26.4913 73.0577 26.4913L28.511 26.4915C24.0927 26.4916 20.511 30.0733 20.511 34.4915L20.511 59.9819",
                  "M90.5 0L90.5 41.1113C90.5 45.5393 86.9031 49.125 82.4751 49.1113L78.5874 49.0992C74.1594 49.0854 70.5625 52.6712 70.5625 57.0992L70.5625 59.938",
                  "M100.5 0L100.5 41.1113C100.5 45.5393 104.097 49.125 108.525 49.1113L112.413 49.0992C116.841 49.0854 120.437 52.6712 120.437 57.0992L120.437 59.938",
                  "M109.942 0.342323C109.942 13.3582 109.942 11.8288 109.942 18.4909C109.942 22.9092 113.524 26.4913 117.942 26.4913L162.489 26.4915C166.907 26.4916 170.489 30.0733 170.489 34.4915L170.489 59.9819",
                ].map((d, i) => (
                  <g key={i}>
                    <path d={d} className="lq-sys-out-idle" />
                    <path d={d} className={`lq-sys-out-draw${outOn(OUTPUTS[i].id) ? " is-on" : ""}`} />
                  </g>
                ))}
              </svg>
              {OUTPUTS.map((o) => (
                <Slot key={o.id} label={o.label} active={outOn(o.id)} initial={initial} />
              ))}
            </div>
          </div>

          <div className="lq-sys-right" aria-hidden="true">
            <div className="lq-sys-dest">
              <DestIcon kind={DEST_ICONS[scene]} />
            </div>
          </div>
        </figure>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1120px] flex-col items-center gap-2.5 px-4 lg:mt-12 lg:px-8">
        <p className="max-w-3xl text-center text-[13px] font-medium leading-[1.7] text-text-muted sm:text-[14.5px]">
          Observe the whole market, filter stale data, and define entry, targets, and exit
          before publication—then deliver the call and preserve its proof.
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
          --sys-line: rgb(var(--accent) / 0.55);
          --sys-idle: rgb(var(--accent) / 0.22);
          --sys-pill: rgb(var(--accent));
          --sys-ink: #171304;
          --sys-ease: cubic-bezier(.4, 0, .2, 1);
          position: relative;
          container-type: inline-size;
          container-name: lqsys;
          overflow: hidden;
        }
        .lq-sys-dots {
          position: absolute;
          inset: -70px -8px -80px;
          background-image: url("data:image/svg+xml;utf8,<svg width='10' height='10' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='2' height='2' fill='%238a6a28'/></svg>");
          background-size: 10px 10px;
          opacity: .46;
          -webkit-mask-image: linear-gradient(180deg, hsla(0,0%,85%,0), #737373 50%, hsla(0,0%,85%,0));
          mask-image: linear-gradient(180deg, hsla(0,0%,85%,0), #737373 50%, hsla(0,0%,85%,0));
          pointer-events: none;
        }
        .lq-sys-figure {
          position: relative;
          display: grid;
          grid-template-columns: 1fr;
          max-width: 1000px;
          height: 560px;
          margin: 0 auto;
        }
        .lq-sys-left { position: absolute; top: 52%; left: 8px; z-index: 3; }
        .lq-sys-right { position: absolute; top: 68%; right: 8%; z-index: 3; }
        .lq-sys-center {
          position: relative;
          display: grid;
          grid-template-rows: 88px 75px 266px auto;
        }
        .lq-sys-apps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(2, 1fr);
          gap: 4px;
          padding: 4px;
          width: 112px;
          height: 76px;
          border-radius: 8px;
          background: rgb(var(--surface) / 0.72);
          border: 1px solid rgb(var(--ink) / 0.06);
        }
        .lq-sys-app {
          position: relative;
          width: 32px;
          height: 32px;
          border: 1px dashed var(--sys-idle);
          border-radius: 6px;
          perspective: 250px;
        }
        .lq-sys-app-flip {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          transition: transform 2s cubic-bezier(.9, 0, .1, 1);
        }
        .lq-sys-app-face {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 6px;
          background: rgb(var(--surface));
          backface-visibility: hidden;
        }
        .lq-sys-app-face.is-back { transform: rotateX(180deg); }
        .lq-sys-app-face img { width: 100%; height: 100%; object-fit: cover; }
        .lq-sys-app-empty { display: block; width: 100%; height: 100%; }
        .lq-sys-bar {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: min(100%, 560px);
          margin: 0 auto;
          padding: 8px;
        }
        .lq-sys-bar-bg {
          display: none;
        }
        .lq-sys-bar-a { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .lq-sys-bar-b { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .lq-sys-slot {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          border: 1px dashed var(--sys-idle);
          border-radius: 6px;
          transition: border-color .5s var(--sys-ease);
        }
        .lq-sys-slot-fill {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 32px;
          padding: 0 12px;
          border-radius: 6px;
          background: var(--sys-pill);
          color: var(--sys-ink);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.01em;
          white-space: nowrap;
          opacity: 0;
          scale: .75;
          transition: opacity .5s var(--sys-ease), scale .5s var(--sys-ease);
          box-shadow: 0 14px 21px -14px rgb(var(--scrim) / 0.28);
        }
        .lq-sys-slot.is-on { border-color: transparent; }
        .lq-sys-slot.is-on .lq-sys-slot-fill,
        .lq-sys-slot.is-init .lq-sys-slot-fill { opacity: 1; scale: 1; }
        .lq-sys-slot.is-init .lq-sys-slot-fill { transition-duration: 0ms; }
        .lq-sys-method {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          padding: 0 16px;
          border-radius: 6px;
          background: var(--sys-pill);
          color: var(--sys-ink);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .lq-sys-top-row { position: relative; display: flex; justify-content: center; }
        .lq-sys-methods-top {
          position: absolute;
          bottom: 0;
          display: inline-grid;
          grid-template-columns: repeat(2, 185px);
          z-index: 1;
        }
        .lq-sys-fork { color: var(--sys-line); }
        .lq-sys-fork-dt { display: none; }
        .lq-sys-fork-mb { position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 0; }
        .lq-sys-mid-row { display: none; }
        .lq-sys-hub {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 4;
          display: grid;
          place-items: center;
          width: 80px;
          height: 80px;
          border-radius: 10px;
          background: linear-gradient(288deg, #3a2a0c -7%, #d4a017 106%);
          transform: translate(-50%, -40%);
          box-shadow: 0 16px 32px -16px rgb(var(--scrim) / 0.4);
        }
        .lq-sys-hub img {
          width: 22px;
          height: 22px;
          border-radius: 5px;
          object-fit: cover;
        }
        .lq-sys-hub span {
          margin-top: 4px;
          color: #fbf3da;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: -0.04em;
        }
        .lq-sys-spine { color: var(--sys-line); pointer-events: none; }
        .lq-sys-spine-dt { display: none; }
        .lq-sys-spine-mb { display: block; position: absolute; top: 54%; width: 100%; }
        .lq-sys-bottom-row { display: flex; justify-content: center; align-items: flex-end; }
        .lq-sys-outs {
          position: relative;
          display: flex;
          justify-content: center;
          gap: 8px;
          margin: 12px auto 0;
          align-self: end;
        }
        .lq-sys-outs .lq-sys-slot { width: 40px; min-width: 40px; overflow: hidden; }
        .lq-sys-outs .lq-sys-slot-fill { padding: 0 6px; font-size: 0; }
        .lq-sys-outs .lq-sys-slot.is-on .lq-sys-slot-fill { font-size: 11px; }
        .lq-sys-out-lines {
          position: absolute;
          left: 50%;
          bottom: 32px;
          transform: translateX(-50%);
          pointer-events: none;
        }
        .lq-sys-out-idle { stroke: rgb(var(--accent) / 0.18); stroke-dasharray: 2 2; fill: none; }
        .lq-sys-out-draw {
          fill: none;
          stroke: rgb(var(--accent) / 0.85);
          stroke-dasharray: 120 120;
          stroke-dashoffset: 120;
          transition: stroke-dashoffset 1s cubic-bezier(.66, 0, .34, 1);
        }
        .lq-sys-out-draw.is-on { stroke-dashoffset: 0; transition-duration: 2s; }
        .lq-sys-dest {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: #f4f1ea;
          box-shadow: 0 10px 20px -12px rgb(var(--scrim) / 0.35);
        }
        @container lqsys (min-width: 600px) {
          .lq-sys-figure { height: 386px; }
          .lq-sys-center { max-width: 696px; grid-template-rows: 48px 75px 160px auto; }
          .lq-sys-left { top: 44%; }
          .lq-sys-apps { width: 152px; height: 105px; gap: 8px; padding: 8px; }
          .lq-sys-app { width: 40px; height: 40px; }
          .lq-sys-bar { flex-direction: row; height: 48px; align-items: center; padding: 8px; }
          .lq-sys-bar-bg {
            display: block;
            position: absolute;
            inset: 0;
            border-radius: 8px;
            background: rgb(var(--surface) / 0.35);
          }
          .lq-sys-bar-a, .lq-sys-bar-b { height: 32px; flex: 1; }
          .lq-sys-slot-fill, .lq-sys-method { font-size: 13px; }
          .lq-sys-methods-top { grid-template-columns: repeat(2, 308px); }
          .lq-sys-fork-dt { display: block; position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 0; }
          .lq-sys-fork-mb { display: none; }
          .lq-sys-hub { transform: translate(-50%, -75%); }
          .lq-sys-spine-mb { top: 50%; }
          .lq-sys-outs .lq-sys-slot { width: auto; min-width: 88px; }
          .lq-sys-outs .lq-sys-slot-fill,
          .lq-sys-outs .lq-sys-slot.is-on .lq-sys-slot-fill { font-size: 13px; padding: 0 12px; }
        }
        @container lqsys (min-width: 882px) {
          .lq-sys-figure { grid-template-columns: 152px auto 152px; height: 386px; }
          .lq-sys-left, .lq-sys-right {
            position: relative;
            inset: unset;
            display: flex;
            align-items: center;
          }
          .lq-sys-right { justify-content: flex-end; }
          .lq-sys-center { grid-template-rows: 48px 75px 136px 32px auto; }
          .lq-sys-mid-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 36px;
          }
          .lq-sys-spine-dt { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }
          .lq-sys-spine-mb { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lq-sys-slot-fill, .lq-sys-app-flip, .lq-sys-out-draw { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
