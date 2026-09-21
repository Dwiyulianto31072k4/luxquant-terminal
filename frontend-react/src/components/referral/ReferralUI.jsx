// src/components/referral/ReferralUI.jsx
// ════════════════════════════════════════════════════════════════════
// The pieces /referral is built from, on the same bones as /payment:
// max-w-7xl column, an eyebrow + h1 header, a row of stat tiles, then
// content in two columns.
//
// Everything here is presentational. The page owns the data.
//
// Charts follow the house palette (--viz-1..6, validated: worst adjacent
// CVD dE 9.2 light / 9.4 dark) rather than inventing hues. Every series
// carries a visible label, which --viz-3 requires on a light surface
// where it sits under 3:1.
// ════════════════════════════════════════════════════════════════════
import { useId, useState } from "react";

export const PANEL = {
  background: "rgb(var(--surface-raised))",
  border: "1px solid rgb(var(--line) / 0.10)",
};

export const Eyebrow = ({ children, live = false }) => (
  <div className="mb-3 flex items-center gap-2">
    <div
      className={"h-1.5 w-1.5 rounded-full" + (live ? " animate-pulse" : "")}
      style={{ background: "rgb(var(--accent))" }}
    />
    <span
      className="text-[10px] font-bold uppercase tracking-[0.2em]"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      {children}
    </span>
  </div>
);

export const Panel = ({ label, action, children, className = "" }) => (
  <section className={"rounded-2xl p-4 sm:p-5 " + className} style={PANEL}>
    {(label || action) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        <p
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "rgb(var(--fg-muted))" }}
        >
          {label}
        </p>
        {action}
      </div>
    )}
    {children}
  </section>
);

// A number that is the headline of its own tile. `hint` is the one line of
// context that stops a bare figure being ambiguous.
export const StatTile = ({ label, value, unit, hint, tone }) => (
  <div className="rounded-xl p-4 sm:p-5" style={PANEL}>
    <p
      className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      {label}
    </p>
    <p className="flex items-baseline gap-1.5">
      <span
        className="font-mono text-2xl font-bold tabular-nums sm:text-[28px]"
        style={{ color: tone || "rgb(var(--fg))" }}
      >
        {value}
      </span>
      {unit && (
        <span className="text-xs font-semibold" style={{ color: "rgb(var(--fg-muted))" }}>
          {unit}
        </span>
      )}
    </p>
    {hint && (
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "rgb(var(--fg-muted))" }}>
        {hint}
      </p>
    )}
  </div>
);

const STATUS = {
  subscribed: { label: "Subscribed", fg: "rgb(var(--pos))", bg: "rgb(var(--pos) / 0.10)" },
  active: { label: "Active", fg: "rgb(var(--accent-text))", bg: "rgb(var(--accent) / 0.12)" },
  pending: { label: "Pending", fg: "rgb(var(--fg-muted))", bg: "rgb(var(--ink) / 0.06)" },
  churned: { label: "Churned", fg: "rgb(var(--fg-muted))", bg: "rgb(var(--ink) / 0.06)" },
  cancelled: { label: "Cancelled", fg: "rgb(var(--neg))", bg: "rgb(var(--neg) / 0.10)" },
};

export const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};

// ── Funnel ──────────────────────────────────────────────────────────
// One measure (people) across three stages, so one hue and no legend.
// Bars are proportional to the first stage, which keeps the drop-off
// readable; each bar carries its own number, so nothing depends on
// estimating a length.
export const FunnelBars = ({ invited = 0, active = 0, subscribed = 0 }) => {
  const rows = [
    { key: "invited", label: "Invited", n: invited },
    { key: "active", label: "Signed in", n: active },
    { key: "subscribed", label: "Subscribed", n: subscribed },
  ];
  const base = Math.max(invited, 1);

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pct = Math.min(100, (r.n / base) * 100);
        const share = invited > 0 && i > 0 ? Math.round((r.n / invited) * 100) : null;
        return (
          <div key={r.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-text-secondary">{r.label}</span>
              <span className="font-mono text-xs tabular-nums text-text-primary">
                {r.n}
                {share !== null && (
                  <span className="ml-1.5 text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    {share}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 w-full rounded-full" style={{ background: "rgb(var(--ink) / 0.06)" }}>
              <div
                className="h-2 rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  background: "rgb(var(--accent))",
                  opacity: 1 - i * 0.22,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Share breakdown ─────────────────────────────────────────────────
// Identity, not magnitude: which platform. Categorical hues in fixed
// order from the house palette, never cycled, and every row is named in
// text so colour is never the only channel.
const VIZ = ["--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-5", "--viz-6"];

export const ChannelBars = ({ channels = [], labelOf = (c) => c }) => {
  const [hover, setHover] = useState(null);
  const total = channels.reduce((a, c) => a + c.count, 0) || 1;

  return (
    <div className="space-y-2.5">
      {channels.map((c, i) => {
        const pct = (c.count / total) * 100;
        const hue = `rgb(var(${VIZ[i % VIZ.length]}))`;
        return (
          <div
            key={c.channel}
            onMouseEnter={() => setHover(c.channel)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: hue }} />
                {labelOf(c.channel)}
              </span>
              <span className="font-mono text-xs tabular-nums text-text-primary">
                {c.count}
                <span
                  className="ml-1.5 text-[11px]"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  {Math.round(pct)}%
                </span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full" style={{ background: "rgb(var(--ink) / 0.06)" }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: hue,
                  opacity: hover && hover !== c.channel ? 0.45 : 1,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Network ─────────────────────────────────────────────────────────
// Only worth drawing once there are enough people for the shape to say
// something; below that the list is the better form and the page shows
// that instead. Colour is status, which is reserved and always paired
// with the legend underneath.
export const ReferralNetwork = ({ centre = "You", referees = [], total = null, size = 320 }) => {
  const [hover, setHover] = useState(null);
  const gid = useId();
  const n = referees.length;
  // The hub states the real total, not how many happen to be loaded. The
  // referee list is paginated, so drawing n in the middle put a 20 beside a
  // stat tile reading 111 on the same screen.
  const hubCount = total ?? n;
  const cx = size / 2;
  const cy = size / 2;
  const rHub = Math.max(26, Math.min(40, 26 + n / 8));
  const rRing = size / 2 - 26;

  const nodes = referees.map((r, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      ...r,
      x: cx + Math.cos(a) * rRing,
      y: cy + Math.sin(a) * rRing,
      paid: r.status === "subscribed",
    };
  });

  return (
    <div className="flex flex-col items-center">
      {/* A square viewBox at width:100% takes its height from the column, so
          in a full-width panel this rendered 1174px tall and pushed the rest
          of the page off the bottom. Cap it and centre it: past ~420px the
          extra size adds no readable detail, only scroll. */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        className="w-full"
        style={{ maxWidth: 420, height: "auto" }}
        aria-label={`${hubCount} people invited, ${nodes.filter((d) => d.paid).length} subscribed`}
      >
        {nodes.map((d) => (
          <line
            key={`l${d.user_id}`}
            x1={cx} y1={cy} x2={d.x} y2={d.y}
            stroke={d.paid ? "rgb(var(--pos))" : "rgb(var(--accent))"}
            strokeWidth={hover === d.user_id ? 2 : 1}
            opacity={hover && hover !== d.user_id ? 0.18 : d.paid ? 0.75 : 0.35}
          />
        ))}
        {nodes.map((d) => (
          <circle
            key={`c${d.user_id}`}
            cx={d.x} cy={d.y} r={hover === d.user_id ? 7 : 5}
            fill={d.paid ? "rgb(var(--pos))" : "rgb(var(--accent))"}
            opacity={hover && hover !== d.user_id ? 0.3 : 1}
            stroke="rgb(var(--surface-raised))" strokeWidth="2"
            onMouseEnter={() => setHover(d.user_id)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <circle cx={cx} cy={cy} r={rHub} fill="rgb(var(--accent))" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              className="font-mono font-bold" fontSize="15"
              fill="rgb(var(--accent-fg))">
          {hubCount}
        </text>
        <title id={gid}>{centre}</title>
      </svg>

      <p className="mt-1 text-center text-xs font-medium text-text-primary">
        {hover ? nodes.find((d) => d.user_id === hover)?.username : centre}
      </p>
      {hubCount > n && (
        <p className="mt-0.5 text-center text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
          showing your {n} most recent
        </p>
      )}

      <div className="mt-3 flex items-center justify-center gap-4">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: "rgb(var(--accent))" }} />
          Invited
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: "rgb(var(--pos))" }} />
          Subscribed
        </span>
      </div>
    </div>
  );
};

// Two counts against two targets. FunnelBars was reused for this at first and
// its labels (Invited / Signed in / Subscribed) described a different thing
// entirely, which made the panel read as a second, contradictory funnel.
export const UnlockProgress = ({ rows = [] }) => (
  <div className="space-y-3">
    {rows.map((r) => {
      const pct = Math.min(100, (r.have / Math.max(r.need, 1)) * 100);
      const done = r.have >= r.need;
      return (
        <div key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-text-secondary">{r.label}</span>
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {r.have}
              <span className="mx-0.5" style={{ color: "rgb(var(--fg-muted))" }}>/</span>
              {r.need}
            </span>
          </div>
          <div className="h-2 w-full rounded-full" style={{ background: "rgb(var(--ink) / 0.06)" }}>
            <div
              className="h-2 rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: done ? "rgb(var(--pos))" : "rgb(var(--accent))",
              }}
            />
          </div>
        </div>
      );
    })}
  </div>
);

export default Panel;
