// BubbleField — floating bubbles, Crypto Bubbles style.
//
// Generic on purpose: narratives size by coins called and colour by move against
// the market, coins size by turnover and colour by 24h. Both want the same
// physics, the same "stop when nobody is looking" rules and the same labelling,
// so the caller supplies items and this owns the behaviour.
//
// The physics is hand-written rather than pulled from d3-force: forty circles
// need repulsion, a weak pull to centre and a wall bounce, which is about thirty
// lines, against a dependency that ships a whole layout engine. It runs on
// requestAnimationFrame and STOPS when it is off screen or the tab is hidden —
// an animation nobody is looking at is just battery.
//
// It also stops for prefers-reduced-motion, where the bubbles are laid out once
// and left still. Perpetual motion is the exact thing WCAG 2.2.2 is about, and
// the chart reads fine without it.

import { useEffect, useMemo, useRef, useState } from "react";

const W = 620;

/** Deterministic jitter, so a re-render does not reshuffle the whole field. */
const seeded = (i) => {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * @param items  [{ id, label, size, delta, raw }] — size is any positive number,
 *               delta drives hue and the printed figure.
 */
export default function BubbleField({
  items = [],
  activeIds = [],
  onOpen,
  suffix = "pp",
  deltaScale = 12,
  height = 340,
}) {
  const H = height;
  const hostRef = useRef(null);
  const nodesRef = useRef([]);
  const rafRef = useRef(0);
  const [, force] = useState(0);

  const seeds = useMemo(() => {
    const rows = items.filter((x) => x.size > 0 && x.delta != null);
    const maxSize = Math.max(...rows.map((x) => x.size), 1);
    return rows.map((x, i) => {
      const rs = x.delta;
      // sqrt so AREA tracks the value — radius would exaggerate the big ones.
      const r = 15 + Math.sqrt(x.size / maxSize) * 34;
      return {
        id: x.id,
        name: x.label,
        short: x.label.length > 15 ? `${x.label.slice(0, 14).trim()}…` : x.label,
        rs,
        sub: x.sub,
        raw: x.raw,
        r,
        x: 40 + seeded(i) * (W - 80),
        y: 40 + seeded(i + 99) * (H - 80),
        vx: (seeded(i + 7) - 0.5) * 0.07,
        vy: (seeded(i + 13) - 0.5) * 0.07,
      };
    });
  }, [items, H]);

  useEffect(() => {
    nodesRef.current = seeds.map((s) => ({ ...s }));
    force((n) => n + 1);
  }, [seeds]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Settle the layout even when motion is off, so nothing overlaps.
    const step = (damp) => {
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + b.r + 3;
          if (d < min) {
            // Gentle separation. At 0.5 this shoved pairs apart hard enough to
            // keep injecting energy every frame, and the whole field stayed
            // agitated — the drift you see is mostly collisions, not velocity.
            const push = ((min - d) / d) * 0.14;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
        // weak pull home, so the field never drifts into a corner
        a.vx += (W / 2 - a.x) * 0.00006;
        a.vy += (H / 2 - a.y) * 0.00006;
        // Friction. Without it the collision impulses accumulate and the motion
        // accelerates the longer the panel is open.
        a.vx *= 0.975;
        a.vy *= 0.975;
        a.x += a.vx * damp;
        a.y += a.vy * damp;
        if (a.x < a.r) { a.x = a.r; a.vx = Math.abs(a.vx); }
        if (a.x > W - a.r) { a.x = W - a.r; a.vx = -Math.abs(a.vx); }
        if (a.y < a.r) { a.y = a.r; a.vy = Math.abs(a.vy); }
        if (a.y > H - a.r) { a.y = H - a.r; a.vy = -Math.abs(a.vy); }
      }
    };

    if (reduced) {
      for (let k = 0; k < 220; k += 1) step(0);
      force((n) => n + 1);
      return undefined;
    }

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    if (hostRef.current) io.observe(hostRef.current);

    const loop = () => {
      if (visible && !document.hidden) {
        step(1);
        force((n) => n + 1);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      io.disconnect();
    };
  }, [seeds, H]);

  const nodes = nodesRef.current;
  if (!nodes.length) return null;
  const active = new Set(activeIds || []);

  return (
    <div ref={hostRef} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-manipulation" role="img"
        aria-label="Bubbles sized by value, coloured by change">
        {nodes.map((n) => {
          const pos = n.rs >= 0;
          const on = active.has(n.id);
          // Intensity carries magnitude, hue carries direction — so a small
          // mover and a big one are not the same green.
          const strength = Math.min(1, Math.abs(n.rs) / deltaScale);
          const fill = pos
            ? `rgb(var(--pos) / ${(0.34 + strength * 0.46).toFixed(2)})`
            : `rgb(var(--neg) / ${(0.32 + strength * 0.44).toFixed(2)})`;
          const stroke = pos ? "rgb(var(--pos))" : "rgb(var(--neg))";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
              className="cursor-pointer"
              onClick={() => onOpen?.(n.raw)}
            >
              <circle
                r={n.r}
                fill={fill}
                stroke={on ? "rgb(var(--accent))" : stroke}
                strokeWidth={on ? 3 : 1.8}
              />
              {n.r > 26 ? (
                <>
                  <text
                    textAnchor="middle"
                    y={-2}
                    className="pointer-events-none fill-text-primary"
                    style={{ fontSize: Math.min(11.5, n.r / 3.4), fontWeight: 600 }}
                  >
                    {n.short}
                  </text>
                  <text
                    textAnchor="middle"
                    y={Math.min(11, n.r / 3.6) + 4}
                    className="pointer-events-none"
                    /* Green-on-green vanished once the fill went solid. The
                       circle already carries direction; the number only has to
                       be legible. */
                    style={{
                      fontSize: Math.min(10.5, n.r / 3.9),
                      fontFamily: "monospace",
                      fontWeight: 600,
                      fill: "rgb(var(--fg))",
                    }}
                  >
                    {n.rs >= 0 ? "+" : ""}
                    {n.rs.toFixed(1)}
                    {suffix}
                  </text>
                </>
              ) : null}
              <title>{`${n.name}\n${n.rs >= 0 ? "+" : ""}${n.rs.toFixed(1)}${suffix}${n.sub ? ` · ${n.sub}` : ""}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
