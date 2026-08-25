// GrowthTab — revenue, retention, and referral operating desk.

import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import {
  StatTile,
  Surface,
  Bar3D,
  Avatar,
  Spinner,
  EmptyState,
} from "../primitives";
import {
  TrendingUpIcon,
  UsersIcon,
  CrownIcon,
  ClockIcon,
  RefreshIcon,
  ShieldIcon,
} from "../Icons";
import { CollectionPagination } from "../CollectionPagination";

const usd = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString("en-US");
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const signedPct = (n) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtDate = (iso, withTime = false) => {
  if (!iso) return "—";
  const options = { day: "2-digit", month: "short", year: "2-digit" };
  if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
  return new Date(iso).toLocaleDateString("en-GB", options);
};
const monthLabel = (m) =>
  m
    ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        timeZone: "UTC",
      })
    : "";
const monthYear = (m) =>
  m
    ? `${monthLabel(m)} '${String(
        new Date(`${m}-01T00:00:00Z`).getUTCFullYear(),
      ).slice(-2)}`
    : "";

const niceCeil = (max) => {
  if (max <= 1) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  const n = max / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
};

const SOURCE_LABEL = {
  payment: "On-chain payment",
  legacy: "Legacy member",
  lifetime: "Lifetime",
  admin: "Admin grant",
  telegram_vip: "Telegram VIP",
  discord_premium: "Discord premium",
  manual: "Manual payment",
  referral_reward: "Invite unlock",
};

const REMINDER_STATE = {
  eligible: ["Ready", "border-profit/25 bg-profit/10 text-profit"],
  cooldown: ["Cooldown", "border-ink/15 bg-ink/[0.04] text-text-muted"],
  recently_shared: [
    "Shared recently",
    "border-profit/20 bg-profit/5 text-profit",
  ],
  inactive: ["Inactive", "border-ink/10 bg-ink/[0.03] text-text-muted"],
  unreachable: ["No Telegram", "border-loss/20 bg-loss/5 text-loss"],
  warming: ["Warming", "border-accent/20 bg-accent/5 text-accent-text"],
  capped: ["Safety cap", "border-loss/20 bg-loss/5 text-loss"],
  paused: ["Paused", "border-ink/10 bg-ink/[0.03] text-text-muted"],
};

const NODE_COLOR = {
  subscribed: "rgb(var(--pos))",
  qualified: "rgb(var(--accent))",
  active: "rgb(var(--accent) / 0.7)",
  pending: "rgb(var(--fg-muted))",
  churned: "rgb(var(--neg))",
  cancelled: "rgb(var(--neg))",
  refunded: "rgb(var(--neg))",
};

const nodeFill = (row) => {
  if (row?.payments) return NODE_COLOR.subscribed;
  if (row?.qualified) return NODE_COLOR.qualified;
  return NODE_COLOR[row?.status] || NODE_COLOR.active;
};

const nodeLabel = (row) => {
  if (row?.payments) return "Paid";
  if (row?.qualified) return "Qualified";
  if (row?.status === "pending") return "Pending";
  if (row?.status === "churned" || row?.status === "cancelled") return "Churned";
  return "Active";
};

const useWidth = () => {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) =>
      setW(Math.floor(e.contentRect.width)),
    );
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

const Panel = ({ title, sub, children, right, className = "" }) => (
  <Surface variant="premium" hover={false} padding="p-5" className={className}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
          {title}
        </h3>
        {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </Surface>
);

const MiniStat = ({ label, value, tone = "muted", sub }) => {
  const bar =
    tone === "profit"
      ? "bg-profit"
      : tone === "loss"
        ? "bg-loss"
        : tone === "accent"
          ? "bg-accent"
          : "bg-ink/30";
  return (
    <div className="rounded-xl border border-ink/[0.07] bg-surface-raised px-3 py-2.5">
      <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="text-xl font-bold leading-none tabular-nums text-text-primary">
        {value}
      </p>
      {sub && <p className="mt-1 text-[9px] text-text-muted">{sub}</p>}
      <span className={`mt-2 inline-block h-0.5 w-6 rounded-full ${bar}`} />
    </div>
  );
};

const StateBadge = ({ state }) => {
  const [label, cls] = REMINDER_STATE[state] || [
    state || "Unknown",
    REMINDER_STATE.inactive[1],
  ];
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[9px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
};

const fillMonths = (trend, months = 12) => {
  const map = Object.fromEntries(
    (trend || []).filter((t) => t?.month).map((t) => [t.month, t]),
  );
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const key = d.toISOString().slice(0, 7);
    out.push(
      map[key] || {
        month: key,
        revenue: 0,
        count: 0,
        referred: 0,
        paid: 0,
        qualified: 0,
        activated: 0,
      },
    );
  }
  return out;
};

const RevenueTrend = ({ trend }) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, "");
  const series = fillMonths(trend);
  const max = Math.max(...series.map((t) => Number(t.revenue) || 0), 0);
  const ceil = niceCeil(max || 1);
  const H = 220;
  const PAD = { l: 44, r: 12, t: 22, b: 28 };
  const plotW = Math.max((w || 640) - PAD.l - PAD.r, 40);
  const plotH = H - PAD.t - PAD.b;
  const n = series.length;
  const bw = n ? plotW / n : 0;
  const barW = Math.max(bw * 0.52, 6);
  const xAt = (i) => PAD.l + bw * i + bw / 2;
  const yAt = (v) => PAD.t + plotH - (v / ceil) * plotH;
  const area = series
    .map((t, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(Number(t.revenue) || 0)}`)
    .join(" ");
  const areaClosed = n
    ? `${area} L${xAt(n - 1)},${PAD.t + plotH} L${xAt(0)},${PAD.t + plotH} Z`
    : "";
  const onMove = (e) => {
    if (!n || !bw) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.l;
    const i = Math.floor(x / bw);
    setHover(i >= 0 && i < n ? i : null);
  };
  const hp = hover != null ? series[hover] : null;
  const peak = series.reduce(
    (best, t, i) =>
      Number(t.revenue) > Number(best.revenue) ? { ...t, i } : best,
    { revenue: -1, i: -1 },
  );

  return (
    <div ref={ref} className="relative">
      <svg
        width={w || 640}
        height={H}
        className="block w-full select-none"
        role="img"
        aria-label="Monthly confirmed revenue"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`revFill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = PAD.t + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.l}
                x2={(w || 640) - PAD.r}
                y1={y}
                y2={y}
                stroke="rgb(var(--ink) / 0.08)"
              />
              <text
                x={PAD.l - 8}
                y={y + 3}
                textAnchor="end"
                fill="rgb(var(--fg-muted))"
                fontSize="9"
              >
                {t === 0 ? "0" : usd(ceil * t)}
              </text>
            </g>
          );
        })}
        {areaClosed && (
          <path d={areaClosed} fill={`url(#revFill-${gid})`} />
        )}
        {n > 1 && (
          <path
            d={area}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {series.map((t, i) => {
          const rev = Number(t.revenue) || 0;
          const bh = (rev / ceil) * plotH;
          const x = xAt(i) - barW / 2;
          const y = PAD.t + plotH - bh;
          const active = hover == null || hover === i;
          return (
            <g key={t.month}>
              <rect
                x={x}
                y={rev ? y : PAD.t + plotH - 2}
                width={barW}
                height={rev ? Math.max(bh, 3) : 2}
                rx="3"
                fill="rgb(var(--accent))"
                opacity={rev ? (active ? 0.92 : 0.28) : 0.18}
              />
              {peak.i === i && rev > 0 && hover == null && (
                <text
                  x={xAt(i)}
                  y={y - 6}
                  textAnchor="middle"
                  fill="rgb(var(--fg))"
                  fontSize="10"
                  fontWeight="700"
                >
                  {usd(rev)}
                </text>
              )}
              <text
                x={xAt(i)}
                y={H - 8}
                textAnchor="middle"
                fill="rgb(var(--fg-muted))"
                fontSize="9"
              >
                {monthLabel(t.month)}
              </text>
            </g>
          );
        })}
        {hover != null && hp && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={PAD.t}
            y2={PAD.t + plotH}
            stroke="rgb(var(--ink) / 0.18)"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute right-1 top-0 rounded-md border border-ink/10 bg-surface-raised px-2.5 py-1.5 text-[10px] text-text-primary shadow-sm">
          <p className="font-semibold">{usd(hp.revenue)}</p>
          <p className="text-text-muted">
            {num(hp.count)} pay · {monthYear(hp.month)}
          </p>
        </div>
      )}
    </div>
  );
};

const SourceMix = ({ bySource }) => {
  const gid = useId().replace(/:/g, "");
  const rows = bySource || [];
  const total = rows.reduce((n, s) => n + Number(s.revenue || 0), 0);
  const maxRev = Math.max(...rows.map((s) => Number(s.revenue) || 0), 1);
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-[11px] text-text-muted">
        No source data.
      </p>
    );
  }
  const r = 54;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const slices = rows.map((s, i) => {
    const share = total ? Number(s.revenue || 0) / total : 0;
    const dash = share * c;
    const offset = acc;
    acc += dash;
    const opacity = 0.95 - i * 0.12;
    return { ...s, share, dash, offset, opacity: Math.max(opacity, 0.35) };
  });

  return (
    <div className="flex items-start gap-4">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="rgb(var(--ink) / 0.08)"
          strokeWidth="16"
        />
        {slices.map((s) => (
          <circle
            key={s.source}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="16"
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeOpacity={s.opacity}
            transform="rotate(-90 70 70)"
          />
        ))}
        <text
          x="70"
          y="66"
          textAnchor="middle"
          fill="rgb(var(--fg))"
          fontSize="13"
          fontWeight="700"
        >
          {usd(total)}
        </text>
        <text
          x="70"
          y="82"
          textAnchor="middle"
          fill="rgb(var(--fg-muted))"
          fontSize="8"
        >
          attributed
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <div key={s.source} className="flex items-center gap-2.5">
            <div className="w-[7.5rem] min-w-0 shrink-0">
              <p className="truncate text-[11px] font-medium text-text-primary">
                {SOURCE_LABEL[s.source] || s.source}
              </p>
              <p className="text-[9px] text-text-muted">
                {num(s.users)} · {pct(s.share * 100)}
              </p>
            </div>
            <Bar3D pct={(Number(s.revenue) / maxRev) * 100} heightClass="h-2" />
            <span className="w-14 text-right text-[11px] font-bold tabular-nums text-text-primary">
              {usd(s.revenue)}
            </span>
          </div>
        ))}
      </div>
      <span className="sr-only">{gid}</span>
    </div>
  );
};

const groupHubs = (relationships) => {
  const map = new Map();
  (relationships || []).forEach((r) => {
    const id = r.referrer_id;
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: r.referrer_username,
        role: r.referrer_role,
        kids: [],
      });
    }
    map.get(id).kids.push(r);
  });
  return [...map.values()].sort((a, b) => b.kids.length - a.kids.length);
};

const ReferralConstellation = ({
  relationships,
  focusId,
  onFocus,
  compact = false,
}) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const hubs = useMemo(() => groupHubs(relationships), [relationships]);
  const H = compact ? 280 : 390;

  if (!hubs.length) {
    return (
      <p className="py-10 text-center text-[11px] text-text-muted">
        No referral relationships yet. The graph fills as invites convert.
      </p>
    );
  }

  const shown = focusId ? hubs.filter((h) => h.id === focusId) : hubs.slice(0, 8);
  const layoutHubs = shown.length ? shown : hubs.slice(0, 1);
  const width = Math.max(w || 720, 320);
  const totalKids = layoutHubs.reduce((n, h) => n + h.kids.length, 0);
  const dominant = layoutHubs[0];
  const star = !focusId && dominant && dominant.kids.length >= Math.max(totalKids * 0.45, 4);

  const nodes = [];
  if (star) {
    const cx = width * 0.56;
    const cy = H * 0.5;
    const rx = Math.min(width * 0.28, 210);
    const ry = Math.min(H * 0.38, 155);
    nodes.push({
      kind: "hub",
      hub: dominant,
      x: cx,
      y: cy,
      r: 18 + Math.min(Math.sqrt(dominant.kids.length) * 2.2, 10),
    });
    dominant.kids.forEach((kid, i) => {
      const a = -Math.PI / 2 + (i / dominant.kids.length) * Math.PI * 2;
      const ring = 1 + (i % 3) * 0.09;
      nodes.push({
        kind: "kid",
        hub: dominant,
        kid,
        x: cx + rx * ring * Math.cos(a),
        y: cy + ry * ring * Math.sin(a),
        r: kid.payments ? 6.5 : 4.4,
      });
    });
    layoutHubs.slice(1).forEach((hub, hi) => {
      const hx = 78;
      const hy = 48 + hi * Math.min((H - 70) / Math.max(layoutHubs.length - 1, 1), 72);
      nodes.push({ kind: "hub", hub, x: hx, y: hy, r: 8 + Math.min(hub.kids.length, 6) });
      hub.kids.forEach((kid, i) => {
        const a = -0.4 + (i / Math.max(hub.kids.length, 1)) * 1.2;
        nodes.push({
          kind: "kid",
          hub,
          kid,
          x: hx + 36 * Math.cos(a),
          y: hy + 28 * Math.sin(a),
          r: 3.4,
        });
      });
    });
  } else {
    const cols = layoutHubs.length === 1 ? 1 : layoutHubs.length <= 2 ? 2 : 3;
    layoutHubs.forEach((hub, hi) => {
      const col = hi % cols;
      const row = Math.floor(hi / cols);
      const rows = Math.ceil(layoutHubs.length / cols);
      const cx =
        cols === 1 ? width * 0.5 : (width * (col + 0.5)) / cols;
      const cy = (H * (row + 0.5)) / rows;
      const radius = Math.min(
        36 + hub.kids.length * 7,
        cols === 1 ? Math.min(width, H) * 0.36 : 88,
      );
      nodes.push({
        kind: "hub",
        hub,
        x: cx,
        y: cy,
        r: 12 + Math.min(Math.sqrt(hub.kids.length) * 2, 10),
      });
      hub.kids.forEach((kid, i) => {
        const a = -Math.PI / 2 + (i / Math.max(hub.kids.length, 1)) * Math.PI * 2;
        nodes.push({
          kind: "kid",
          hub,
          kid,
          x: cx + radius * Math.cos(a),
          y: cy + radius * 0.78 * Math.sin(a),
          r: kid.payments ? 6 : 4,
        });
      });
    });
  }

  const hubNodes = nodes.filter((n) => n.kind === "hub");
  const kidNodes = nodes.filter((n) => n.kind === "kid");
  const hoverNode =
    hover == null ? null : nodes.find((n, i) => i === hover) || null;
  const dimFor = (node) => {
    if (!hoverNode) return 1;
    if (hoverNode.kind === "hub")
      return node.hub.id === hoverNode.hub.id ? 1 : 0.18;
    if (node.kind === "hub") return node.hub.id === hoverNode.hub.id ? 1 : 0.18;
    return node.kid?.id === hoverNode.kid?.id ||
      node.hub.id === hoverNode.hub.id
      ? 1
      : 0.14;
  };

  return (
    <div>
      {!compact && hubs.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFocus?.(null)}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
              !focusId
                ? "border-accent/30 bg-accent/10 text-text-primary"
                : "border-ink/[0.08] text-text-muted hover:text-text-primary"
            }`}
          >
            All hubs · {num(hubs.length)}
          </button>
          {hubs.slice(0, 8).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onFocus?.(focusId === h.id ? null : h.id)}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                focusId === h.id
                  ? "border-accent/30 bg-accent/10 text-text-primary"
                  : "border-ink/[0.08] text-text-muted hover:text-text-primary"
              }`}
            >
              @{h.name} · {h.kids.length}
            </button>
          ))}
        </div>
      )}
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={H}
          className="block w-full"
          role="img"
          aria-label="Referrer to referee constellation"
        >
          {kidNodes.map((n) => {
            const hub = hubNodes.find((h) => h.hub.id === n.hub.id);
            if (!hub) return null;
            return (
              <path
                key={`e-${n.kid.id}`}
                d={`M ${hub.x} ${hub.y} Q ${(hub.x + n.x) / 2} ${(hub.y + n.y) / 2 - 12}, ${n.x} ${n.y}`}
                fill="none"
                stroke={nodeFill(n.kid)}
                strokeOpacity={0.28 * dimFor(n) + 0.08}
                strokeWidth="1.15"
              />
            );
          })}
          {hubNodes.map((n) => (
            <g
              key={`h-${n.hub.id}`}
              opacity={dimFor(n)}
              onMouseEnter={() => setHover(nodes.indexOf(n))}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFocus?.(focusId === n.hub.id ? null : n.hub.id)}
              className="cursor-pointer"
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r + 7}
                fill="rgb(var(--accent) / 0.12)"
              />
              <circle cx={n.x} cy={n.y} r={n.r} fill="rgb(var(--accent))" />
              <text
                x={n.x}
                y={n.y - n.r - 10}
                textAnchor="middle"
                fill="rgb(var(--fg))"
                fontSize="11"
                fontWeight="700"
              >
                @{n.hub.name}
              </text>
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fill="rgb(var(--surface))"
                fontSize="9"
                fontWeight="700"
              >
                {n.hub.kids.length}
              </text>
            </g>
          ))}
          {kidNodes.map((n) => (
            <g
              key={`k-${n.kid.id}`}
              opacity={dimFor(n)}
              onMouseEnter={() => setHover(nodes.indexOf(n))}
              onMouseLeave={() => setHover(null)}
              className="cursor-default"
            >
              <circle cx={n.x} cy={n.y} r={n.r} fill={nodeFill(n.kid)} />
              {(focusId || n.kid.payments || n.hub.kids.length <= 10) && (
                <text
                  x={n.x + n.r + 5}
                  y={n.y + 3}
                  fill="rgb(var(--fg-muted))"
                  fontSize="8"
                >
                  @{n.kid.referred_username}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hoverNode && (
          <div className="pointer-events-none absolute right-1 top-1 max-w-[220px] rounded-lg border border-ink/10 bg-surface-raised px-2.5 py-2 text-[10px] shadow-sm">
            {hoverNode.kind === "hub" ? (
              <>
                <p className="font-semibold text-text-primary">
                  @{hoverNode.hub.name}
                </p>
                <p className="text-text-muted">
                  {num(hoverNode.hub.kids.length)} invited ·{" "}
                  {num(hoverNode.hub.kids.filter((k) => k.payments).length)} paid
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-text-primary">
                  @{hoverNode.kid.referred_username}
                </p>
                <p className="text-text-muted">
                  via @{hoverNode.hub.name} · {nodeLabel(hoverNode.kid)}
                </p>
                <p className="mt-0.5 tabular-nums text-text-primary">
                  {usd(hoverNode.kid.revenue)} · {usd2(hoverNode.kid.commission)}{" "}
                  reward
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[9px] uppercase tracking-wider text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-accent" /> Advocate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-accent/70" /> Active
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-profit" /> Paid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-full bg-loss" /> Churned
        </span>
      </div>
    </div>
  );
};

const ReferralFunnel = ({ summary }) => {
  const stages = [
    {
      label: "Tracked shares",
      value: summary.tracked_shares || 0,
      sub: "intent events",
    },
    {
      label: "Referred",
      value: summary.referred || 0,
      sub: "server-side links",
    },
    {
      label: "Activated",
      value: summary.activated || 0,
      sub: pct(summary.activation_rate),
    },
    {
      label: "Qualified",
      value: summary.qualified || 0,
      sub: "2 of 3 signals",
    },
    {
      label: "Paid",
      value: summary.subscribed || 0,
      sub: pct(summary.paid_rate),
    },
  ];
  const top = stages[0]?.value || 0;
  return (
    <div>
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1].value;
        const lost = prev == null ? null : Math.max(prev - s.value, 0);
        const width = top > 0 ? Math.max((s.value / top) * 100, s.value > 0 ? 1.5 : 0) : 0;
        return (
          <div
            key={s.label}
            className="flex items-center gap-2 border-t border-ink/[0.05] py-2 first:border-t-0 sm:gap-3"
          >
            <p className="w-24 shrink-0 text-[10px] font-medium uppercase leading-tight tracking-wider text-text-muted sm:w-32">
              {s.label}
            </p>
            <div className="min-w-0 flex-1">
              <div
                className={`h-6 rounded-r-[4px] ${i === stages.length - 1 ? "bg-profit/70" : "bg-accent/75"}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <p className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums text-text-primary sm:w-16">
              {num(s.value)}
            </p>
            <div className="w-20 shrink-0 text-right sm:w-28">
              <p className="text-[10px] leading-tight text-text-muted">{s.sub}</p>
              {lost != null && lost > 0 && (
                <p className="text-[10px] leading-tight text-loss">−{num(lost)} lost</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ActivityTrend = ({ trend }) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const series = fillMonths(trend).map((t) => ({
    month: t.month,
    referred: Number(t.referred) || 0,
    paid: Number(t.paid) || 0,
    qualified: Number(t.qualified) || 0,
  }));
  const max = Math.max(
    ...series.map((t) => Math.max(t.referred, t.paid, t.qualified)),
    1,
  );
  const ceil = niceCeil(max);
  const H = 168;
  const PAD = { l: 28, r: 8, t: 12, b: 24 };
  const plotW = Math.max((w || 480) - PAD.l - PAD.r, 40);
  const plotH = H - PAD.t - PAD.b;
  const n = series.length;
  const bw = n ? plotW / n : 0;
  const xAt = (i) => PAD.l + bw * i + bw / 2;
  const onMove = (e) => {
    if (!n || !bw) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.l;
    const i = Math.floor(x / bw);
    setHover(i >= 0 && i < n ? i : null);
  };
  const hp = hover != null ? series[hover] : null;

  return (
    <div ref={ref} className="relative">
      <svg
        width={w || 480}
        height={H}
        className="block w-full select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((t) => {
          const y = PAD.t + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.l}
                x2={(w || 480) - PAD.r}
                y1={y}
                y2={y}
                stroke="rgb(var(--ink) / 0.08)"
              />
              <text
                x={PAD.l - 6}
                y={y + 3}
                textAnchor="end"
                fill="rgb(var(--fg-muted))"
                fontSize="8"
              >
                {Math.round(ceil * t)}
              </text>
            </g>
          );
        })}
        {series.map((t, i) => {
          const gap = bw > 8 ? 3 : 1;
          const group = Math.max(bw - gap, 2);
          const x = PAD.l + bw * i + gap / 2;
          const referredH = (t.referred / ceil) * plotH;
          const paidH = (t.paid / ceil) * plotH;
          return (
            <g key={t.month} opacity={hover == null || hover === i ? 1 : 0.3}>
              <rect
                x={x}
                y={PAD.t + plotH - referredH}
                width={group * 0.58}
                height={Math.max(referredH, t.referred ? 2 : 0)}
                rx="2"
                fill="rgb(var(--accent) / 0.7)"
              />
              <rect
                x={x + group * 0.6}
                y={PAD.t + plotH - paidH}
                width={group * 0.38}
                height={Math.max(paidH, t.paid ? 2 : 0)}
                rx="2"
                fill="rgb(var(--pos) / 0.85)"
              />
              <text
                x={xAt(i)}
                y={H - 6}
                textAnchor="middle"
                fill="rgb(var(--fg-muted))"
                fontSize="8"
              >
                {monthLabel(t.month)}
              </text>
            </g>
          );
        })}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute right-1 top-0 rounded-md border border-ink/10 bg-surface-raised px-2 py-1 text-[10px] shadow-sm">
          <span className="font-semibold text-text-primary">
            {num(hp.referred)} referred
          </span>
          <span className="ml-1.5 text-profit">{num(hp.paid)} paid</span>
        </div>
      )}
    </div>
  );
};

const ConcentrationBar = ({ concentration, summary }) => {
  const share = Number(concentration?.top1_share || 0);
  if (!concentration?.top1_username) return null;
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.05] px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-text-muted">
          Network is concentrated on{" "}
          <span className="font-semibold text-text-primary">
            @{concentration.top1_username}
          </span>
        </p>
        <p className="text-[11px] font-bold tabular-nums text-text-primary">
          {num(concentration.top1_referred)} / {num(summary.referred)} · {pct(share)}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(Math.min(share, 100), share ? 3 : 0)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">
        Top 3 advocates hold {pct(concentration.top3_share)} of referred accounts
        {concentration.top3_revenue
          ? ` and ${usd(concentration.top3_revenue)} of referral revenue`
          : ""}
        .
      </p>
    </div>
  );
};

const SourceTable = ({ bySource }) => <SourceMix bySource={bySource} />;

const ChurnRisk = ({ risk }) => {
  if (!risk.length) {
    return (
      <EmptyState
        Icon={ShieldIcon}
        tone="rgb(var(--pos-text))"
        title="No at-risk subscribers"
        description="Every paying member has been active recently."
      />
    );
  }
  return (
    <div className="space-y-2">
      {risk.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between gap-2.5 rounded-xl border border-ink/[0.07] bg-surface-raised px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={u.username} tone="rgb(var(--neg-text))" size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text-primary">
                @{u.username}
              </p>
              <p className="text-[10px] text-text-muted">
                Renews {fmtDate(u.expires_at)}
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-loss/25 bg-loss/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-loss">
            <ClockIcon size={9} />
            {u.days_inactive == null
              ? "never active"
              : `${u.days_inactive}d quiet`}
          </span>
        </div>
      ))}
    </div>
  );
};

const Overview = ({ data, onOpenReferrals }) => {
  const rev = data?.revenue || {};
  const rec = data?.recurring || {};
  const churn = data?.churn || {};
  const attr = data?.attribution || {};
  const referral = attr.referral || {};
  const summary = referral.summary || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Total Revenue"
          value={usd(rev.total)}
          Icon={TrendingUpIcon}
          accent="amber"
          emphasis
          sub={`${num(rev.payment_count)} payments`}
          trend={(rev.trend || []).map((t) => Number(t.revenue) || 0)}
        />
        <StatTile
          label="Revenue · 30d"
          value={usd(rev.last_30d)}
          Icon={TrendingUpIcon}
          accent="amber"
          sub={
            rev.mom_pct == null
              ? "vs prev 30d"
              : `${signedPct(rev.mom_pct)} vs prev 30d`
          }
        />
        <StatTile
          label="ARPU · 30d"
          value={usd2(rec.arpu_30d)}
          Icon={UsersIcon}
          accent="muted"
          sub="per active sub"
        />
        <StatTile
          label="LTV (proxy)"
          value={usd(rev.ltv)}
          Icon={CrownIcon}
          accent="muted"
          sub="rev / paying user"
        />
        <StatTile
          label="Avg Order"
          value={usd2(rev.aov)}
          Icon={TrendingUpIcon}
          accent="muted"
          sub="per payment"
        />
        <StatTile
          label="Paying Users"
          value={num(rev.paying_customers)}
          Icon={UsersIcon}
          accent="green"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Revenue trend"
          sub="Confirmed revenue, last 12 months — empty months stay on the axis"
          className="lg:col-span-3"
        >
          <RevenueTrend trend={rev.trend || []} />
        </Panel>
        <Panel
          title="Revenue mix"
          sub="Where paying members come from"
          className="lg:col-span-2"
        >
          <SourceTable bySource={attr.by_source || []} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Referral network"
          sub="Gold hubs are advocates. Orbiting dots are people they invited."
          className="lg:col-span-3"
          right={
            <button
              type="button"
              onClick={onOpenReferrals}
              className="rounded-md border border-ink/[0.08] px-2 py-1 text-[10px] font-semibold text-text-muted hover:text-text-primary"
            >
              Open engine
            </button>
          }
        >
          <ReferralConstellation
            relationships={referral.relationships || []}
            compact
          />
        </Panel>
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Retention" sub="Subscription health, last 30 days">
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat
                label="Active Subs"
                value={num(churn.active_subs)}
                tone="profit"
              />
              <MiniStat
                label="Lapsed · 30d"
                value={num(churn.lapsed_30d)}
                tone="loss"
              />
              <MiniStat
                label="Churn Rate"
                value={pct(churn.churn_rate)}
                tone="accent"
              />
              <MiniStat label="Payments · 30d" value={num(churn.payments_30d)} />
            </div>
          </Panel>
          <Panel title="Referral pulse" sub="Loop health from the live graph">
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat label="Advocates" value={num(summary.advocates)} />
              <MiniStat
                label="Referred"
                value={num(summary.referred)}
                tone="accent"
              />
              <MiniStat
                label="Qualified"
                value={num(summary.qualified)}
                tone="accent"
              />
              <MiniStat
                label="Paid"
                value={num(summary.subscribed)}
                tone="profit"
              />
            </div>
          </Panel>
        </div>
      </div>
      <Panel
        title="Churn risk"
        sub="Paying members who've gone quiet — reach out before they lapse"
      >
        <ChurnRisk risk={data?.health?.churn_risk || []} />
      </Panel>
    </div>
  );
};

const reminderPreview = (a) => {
  if (!a) return "";
  const lead = a.referred
    ? `Your LuxQuant link has already brought in ${a.referred} member${a.referred === 1 ? "" : "s"}${a.commission ? ` and earned ${usd2(a.commission)} in referral credit` : ""}.`
    : a.shares
      ? "You have shared your LuxQuant link before — it is ready whenever you want to use it again."
      : "Your personal LuxQuant referral link is ready, but it has not been shared yet.";
  return `Hi ${a.username},\n\n${lead}\n\nIf someone is already asking you about LuxQuant, you can send them your tracked link. They receive the referral discount and your reward is tracked automatically after payment.\n\nYour link: https://luxquant.tw/?ref=${a.code}\nReferral dashboard: https://luxquant.tw/referral\n\nNo pressure — we only send this referral reminder occasionally. Reply STOP if you do not want referral reminders.`;
};

const ReminderCenter = ({ reminders, onSend, onPause, sending }) => {
  const candidates = useMemo(() => reminders?.candidates || [], [reminders]);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (selected && !candidates.some((c) => c.user_id === selected.user_id))
      setSelected(null);
  }, [candidates, selected]);
  const policy = reminders?.policy || {};
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Panel
        title="Reminder queue"
        sub="Eligibility is recomputed live; nothing is auto-sent"
        className="xl:col-span-3"
        right={
          <span className="rounded-md border border-profit/20 bg-profit/10 px-2 py-1 text-[9px] font-bold text-profit">
            {num(candidates.length)} ready
          </span>
        }
      >
        <div className="mb-3 grid grid-cols-4 gap-2">
          <MiniStat
            label="Ready"
            value={num(reminders?.counts?.eligible)}
            tone="profit"
          />
          <MiniStat label="Cooldown" value={num(reminders?.counts?.cooldown)} />
          <MiniStat
            label="Recent Share"
            value={num(reminders?.counts?.recently_shared)}
            tone="accent"
          />
          <MiniStat label="Paused" value={num(reminders?.counts?.paused)} />
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {candidates.length ? (
            candidates.map((a) => (
              <button
                key={a.user_id}
                type="button"
                onClick={() => setSelected(a)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected?.user_id === a.user_id ? "border-accent/35 bg-accent/[0.06]" : "border-ink/[0.06] bg-surface-raised hover:border-ink/15"}`}
              >
                <Avatar
                  name={a.username}
                  tone="rgb(var(--accent-text))"
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-semibold text-text-primary">
                    @{a.username}
                  </p>
                  <p className="truncate text-[9.5px] text-text-muted">
                    {a.reminder.segment.replace("_", " ")} · {a.referred}{" "}
                    referrals · {a.shares} shares
                  </p>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-accent-text">
                  Review
                </span>
              </button>
            ))
          ) : (
            <p className="py-8 text-center text-[11px] text-text-muted">
              No one is eligible right now. Cooldowns are working.
            </p>
          )}
        </div>
      </Panel>
      <Panel
        title={selected ? `Review · @${selected.username}` : "Safe-send policy"}
        sub={
          selected
            ? "Exact preview before one-time delivery"
            : "Designed to create useful prompts, not spam"
        }
        className="xl:col-span-2"
      >
        {selected ? (
          <div className="space-y-3">
            <pre className="max-h-64 whitespace-pre-wrap overflow-y-auto rounded-xl border border-ink/[0.07] bg-ink/[0.025] p-3 font-sans text-[10.5px] leading-relaxed text-text-primary">
              {reminderPreview(selected)}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sending === selected.user_id}
                onClick={() => onSend(selected)}
                className="flex-1 rounded-xl bg-ink px-3 py-2.5 text-[10px] font-bold text-surface-raised disabled:opacity-50"
              >
                {sending === selected.user_id
                  ? "Sending…"
                  : "Send once via Telegram"}
              </button>
              <button
                type="button"
                onClick={() => onPause(selected, true)}
                className="rounded-xl border border-ink/10 px-3 py-2.5 text-[10px] font-semibold text-text-muted"
              >
                Pause
              </button>
            </div>
            <p className="text-[9px] leading-relaxed text-text-muted">
              The server checks activity, recent shares, cooldown, cap, opt-out,
              and Telegram reach again before sending.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[
              [
                `${policy.cooldown_days || 30}-day cooldown`,
                "No repeat reminder inside the window",
              ],
              [
                `Max ${policy.max_per_180d || 3} / 180 days`,
                "Hard frequency cap per person",
              ],
              [
                `Active in ${policy.active_days || 30} days`,
                "Do not chase dormant accounts",
              ],
              [
                `${policy.min_account_days || 14}-day warm-up`,
                "Let onboarding happen first",
              ],
              [
                "Recent-share suppression",
                "Never nudge someone already sharing",
              ],
              ["Manual approval", "No automatic or bulk-send endpoint"],
            ].map(([title, sub]) => (
              <div
                key={title}
                className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] px-3 py-2"
              >
                <p className="text-[10.5px] font-semibold text-text-primary">
                  {title}
                </p>
                <p className="text-[9.5px] text-text-muted">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

const FILTER_DEFAULTS = {
  page: 1,
  page_size: 25,
  search: "",
  role: "all",
  reminder: "all",
  performance: "all",
  reach: "all",
  sort_by: "referred",
  order: "desc",
};

const FilterSelect = ({ label, value, options, onChange }) => (
  <label className="min-w-[135px] flex-1 sm:flex-none">
    <span className="mb-1 block text-[8px] font-bold uppercase tracking-wider text-text-muted">
      {label}
    </span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-ink/[0.08] bg-surface-raised px-2.5 py-2 text-[10px] font-medium text-text-primary outline-none focus:border-accent/35"
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  </label>
);

const AdvocateTable = ({ selectedId, onSelect, onResume, refreshToken }) => {
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [searchDraft, setSearchDraft] = useState("");
  const [result, setResult] = useState({
    items: [],
    total: 0,
    unfiltered_total: 0,
    page: 1,
    page_size: 25,
    pages: 1,
    from: 0,
    to: 0,
    facets: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === searchDraft
          ? current
          : { ...current, search: searchDraft, page: 1 },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    workspaceApi
      .getReferralAdvocates(filters)
      .then((data) => {
        if (!ignore) setResult(data);
      })
      .catch((error) => console.error("Failed to load referral advocates:", error))
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [filters, refreshToken]);

  const updateFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const resetFilters = () => {
    setSearchDraft("");
    setFilters(FILTER_DEFAULTS);
  };
  const hasFilters =
    filters.search ||
    filters.role !== "all" ||
    filters.reminder !== "all" ||
    filters.performance !== "all" ||
    filters.reach !== "all";

  return (
    <Panel
      title="Advocate directory"
      sub="Server-side search, combined filters, ranking, and paginated results"
      right={
        <span className="text-[10px] tabular-nums text-text-muted">
          {num(result.total)} of {num(result.unfiltered_total)} advocates
        </span>
      }
    >
      <div className="mb-3 rounded-xl border border-ink/[0.06] bg-ink/[0.015] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-[2]">
            <span className="mb-1 block text-[8px] font-bold uppercase tracking-wider text-text-muted">
              Search
            </span>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Username or referral code…"
              className="w-full rounded-lg border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[10px] text-text-primary outline-none focus:border-accent/35"
            />
          </label>
          <FilterSelect
            label="Role"
            value={filters.role}
            onChange={(value) => updateFilter("role", value)}
            options={[
              ["all", "All roles"],
              ["subscriber", "Subscriber"],
              ["free", "Free"],
            ]}
          />
          <FilterSelect
            label="Reminder"
            value={filters.reminder}
            onChange={(value) => updateFilter("reminder", value)}
            options={[
              ["all", "All states"],
              ["eligible", "Ready"],
              ["cooldown", "Cooldown"],
              ["recently_shared", "Shared recently"],
              ["warming", "Warming"],
              ["inactive", "Inactive"],
              ["unreachable", "No Telegram"],
              ["paused", "Paused"],
              ["capped", "Safety cap"],
            ]}
          />
          <FilterSelect
            label="Performance"
            value={filters.performance}
            onChange={(value) => updateFilter("performance", value)}
            options={[
              ["all", "All performance"],
              ["has_referrals", "Has referrals"],
              ["has_paid", "Has paid users"],
              ["shared", "Has shared"],
              ["zero_activity", "Zero activity"],
            ]}
          />
          <FilterSelect
            label="Reach"
            value={filters.reach}
            onChange={(value) => updateFilter("reach", value)}
            options={[
              ["all", "All reach"],
              ["telegram", "Telegram ready"],
              ["no_telegram", "No Telegram"],
            ]}
          />
          <FilterSelect
            label="Sort"
            value={filters.sort_by}
            onChange={(value) => updateFilter("sort_by", value)}
            options={[
              ["referred", "Referrals"],
              ["paid", "Paid users"],
              ["revenue", "Revenue"],
              ["reward", "Rewards"],
              ["shares", "Shares"],
              ["last_active", "Last active"],
              ["username", "Username"],
            ]}
          />
          <button
            type="button"
            onClick={() =>
              setFilters((current) => ({
                ...current,
                order: current.order === "desc" ? "asc" : "desc",
                page: 1,
              }))
            }
            className="rounded-lg border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[10px] font-bold text-text-primary"
            title="Toggle sort direction"
          >
            {filters.order === "desc" ? "↓ Desc" : "↑ Asc"}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-2.5 py-2 text-[9.5px] font-bold text-loss hover:bg-loss/[0.06]"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-ink/[0.06]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-raised/75 backdrop-blur-[1px]">
            <Spinner size={16} />
          </div>
        )}
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-ink/[0.025] text-[8.5px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="w-12 px-3 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">Advocate</th>
              <th>Code</th>
              <th className="text-right">Shares</th>
              <th className="text-right">Referred</th>
              <th className="text-right">Active</th>
              <th className="text-right">Qualified</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Reward</th>
              <th className="px-3">Reminder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.05]">
            {result.items.map((a, index) => (
              <tr
                key={a.user_id}
                onClick={() => onSelect(a)}
                className={`cursor-pointer text-[10.5px] transition-colors hover:bg-ink/[0.02] ${selectedId === a.user_id ? "bg-accent/[0.05]" : ""}`}
              >
                <td className="px-3 text-center font-mono text-[9px] tabular-nums text-text-muted">
                  {(result.page - 1) * result.page_size + index + 1}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={a.username}
                      tone="rgb(var(--fg-muted))"
                      size="xs"
                    />
                    <div>
                      <p className="font-semibold text-text-primary">
                        @{a.username}
                      </p>
                      <p className="text-[8.5px] text-text-muted">{a.role}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="rounded-md bg-ink/[0.04] px-1.5 py-1 font-mono text-[9px] text-text-primary">
                    {a.code}
                  </span>
                </td>
                <td className="text-right tabular-nums text-text-muted">
                  {num(a.shares)}
                </td>
                <td className="text-right font-semibold tabular-nums text-text-primary">
                  {num(a.referred)}
                </td>
                <td className="text-right tabular-nums text-text-muted">
                  {num(a.activated)}
                </td>
                <td className="text-right tabular-nums text-accent-text">
                  {num(a.qualified)}
                </td>
                <td className="text-right font-semibold tabular-nums text-profit">
                  {num(a.subscribed)}
                </td>
                <td className="text-right font-semibold tabular-nums text-text-primary">
                  {usd(a.revenue)}
                </td>
                <td className="text-right tabular-nums text-profit">
                  {usd2(a.commission)}
                </td>
                <td className="px-3">
                  <div className="flex items-center gap-1.5">
                    <StateBadge state={a.reminder?.state} />
                    {a.reminder?.state === "paused" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResume(a);
                        }}
                        className="text-[8.5px] font-bold text-accent-text hover:underline"
                      >
                        Resume
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!result.items.length && !loading && (
              <tr>
                <td colSpan="11" className="py-12 text-center text-[11px] text-text-muted">
                  No advocates match this filter combination.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <CollectionPagination
        page={result.page}
        totalPages={result.pages}
        total={result.total}
        pageSize={filters.page_size}
        onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => updateFilter("page_size", pageSize)}
        itemLabel="advocates"
        loading={loading}
      />
    </Panel>
  );
};

const RelationshipLedger = ({ relationships, advocate }) => {
  const rows = advocate
    ? relationships.filter((r) => r.referrer_id === advocate.user_id)
    : relationships;
  return (
    <Panel
      title={
        advocate
          ? `Referral relationships · @${advocate.username}`
          : "Referral relationships"
      }
      sub="Who referred whom, activation, payment, and value"
      right={
        <span className="text-[10px] text-text-muted">
          {num(rows.length)} relationships
        </span>
      }
    >
      {advocate && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Referred" value={num(advocate.referred)} />
          <MiniStat
            label="Activated"
            value={num(advocate.activated)}
            tone="accent"
          />
          <MiniStat
            label="Paid"
            value={num(advocate.subscribed)}
            tone="profit"
          />
          <MiniStat
            label="Revenue"
            value={usd(advocate.revenue)}
            tone="profit"
          />
        </div>
      )}
      <div className="max-h-80 overflow-auto rounded-xl border border-ink/[0.06]">
        <table className="w-full min-w-[820px] text-left">
          <thead className="sticky top-0 bg-surface-raised text-[8.5px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2.5">Referrer</th>
              <th>Referred user</th>
              <th>Status</th>
              <th>Joined</th>
              <th className="text-right">Payments</th>
              <th className="px-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.05]">
            {rows.map((r) => (
              <tr key={r.id} className="text-[10.5px]">
                <td className="px-3 py-2.5 font-medium text-text-primary">
                  @{r.referrer_username}
                </td>
                <td>
                  <div>
                    <p className="font-medium text-text-primary">
                      @{r.referred_username}
                    </p>
                    <p className="text-[8.5px] text-text-muted">
                      last active {fmtDate(r.last_active_at)}
                      {r.referred_role ? ` · ${r.referred_role}` : ""}
                    </p>
                  </div>
                </td>
                <td>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold ${
                      r.status === "refunded" || r.status === "churned"
                        ? "border-loss/20 bg-loss/10 text-loss"
                        : r.payments
                          ? "border-profit/20 bg-profit/10 text-profit"
                          : r.qualified
                            ? "border-accent/25 bg-accent/10 text-accent-text"
                            : "border-accent/20 bg-accent/5 text-accent-text"
                    }`}
                  >
                    {r.qualified && !r.payments ? "qualified" : r.status}
                  </span>
                </td>
                <td className="text-text-muted">{fmtDate(r.joined_at)}</td>
                <td className="text-right tabular-nums text-text-primary">
                  {num(r.payments)}
                </td>
                <td className="px-3 text-right">
                  <p className="font-semibold tabular-nums text-text-primary">
                    {usd(r.revenue)}
                  </p>
                  <p className="text-[8.5px] tabular-nums text-profit">
                    {usd2(r.commission)} reward
                  </p>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan="6"
                  className="py-8 text-center text-[11px] text-text-muted"
                >
                  No referral relationships in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

const ReferralEngine = ({ referral, onSend, onPause, sending }) => {
  const summary = referral?.summary || {};
  const [selected, setSelected] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const quality = referral?.data_quality || {};
  const velocity = referral?.velocity || {};
  const concentration = referral?.concentration || {};
  const anomalyCount =
    Number(quality.user_without_use || 0) +
    Number(quality.referrer_mismatch || 0) +
    Number(quality.code_use_mismatch || 0) +
    Number(quality.refunded_commission || 0);

  const selectAdvocate = (advocate) => {
    const next =
      selected?.user_id === advocate.user_id ? null : advocate;
    setSelected(next);
    setFocusId(next ? next.user_id : null);
  };
  const focusedHub = (referral?.top_hubs || []).find((h) => h.user_id === focusId);
  const ledgerAdvocate = selected || focusedHub || null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/[0.07] via-surface-raised to-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-accent-text">
              Referral growth loop
            </p>
            <h3 className="mt-1 text-[17px] font-semibold text-text-primary">
              Who invited whom, and what that invitation became
            </h3>
            <p className="mt-1 max-w-2xl text-[10.5px] text-text-muted">
              Gold hubs are advocates. Orbiting dots are referred accounts.
              Paid nodes light green. Click a hub to isolate its graph.
            </p>
          </div>
          <span
            className={`rounded-lg border px-2.5 py-1.5 text-[9.5px] font-bold ${quality.healthy ? "border-profit/20 bg-profit/10 text-profit" : "border-accent/25 bg-accent/10 text-accent-text"}`}
          >
            {quality.healthy
              ? "Data healthy"
              : `Review ${num(anomalyCount)} data anomalies`}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Advocates"
          value={num(summary.advocates)}
          Icon={UsersIcon}
          accent="muted"
          sub={`${num(summary.tracked_shares)} tracked shares`}
        />
        <StatTile
          label="Referred"
          value={num(summary.referred)}
          Icon={UsersIcon}
          accent="amber"
          sub="server-side links"
        />
        <StatTile
          label="Qualified"
          value={num(summary.qualified)}
          Icon={TrendingUpIcon}
          accent="amber"
          sub={`${num(summary.unlock_days)} unlock days`}
        />
        <StatTile
          label="Paid"
          value={num(summary.subscribed)}
          Icon={CrownIcon}
          accent="green"
          sub={`${pct(summary.paid_rate)} of referred`}
        />
        <StatTile
          label="Referral Revenue"
          value={usd(summary.revenue)}
          Icon={TrendingUpIcon}
          accent="amber"
          sub="confirmed payments"
        />
        <StatTile
          label="Rewards Earned"
          value={usd2(summary.commission)}
          Icon={CrownIcon}
          accent="green"
          sub="advocate credit"
        />
      </div>
      <Panel
        title="Referral constellation"
        sub="Each gold hub is an advocate. Dots on the orbit are the people they brought in."
      >
        <ReferralConstellation
          relationships={referral?.relationships || []}
          focusId={focusId}
          onFocus={(id) => {
            setFocusId(id);
            if (!id) setSelected(null);
          }}
        />
      </Panel>
      <ConcentrationBar concentration={concentration} summary={summary} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Referral funnel"
          sub="From share intent to confirmed payment — widths relative to shares"
        >
          <ReferralFunnel summary={summary} />
        </Panel>
        <Panel
          title="Invite activity"
          sub="Referred accounts vs paid conversions, last 12 months"
        >
          <ActivityTrend trend={referral?.activity_trend || []} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat
              label="Days to activate"
              value={
                velocity.median_days_to_activate == null
                  ? "—"
                  : `${velocity.median_days_to_activate}d`
              }
              sub={
                velocity.avg_days_to_activate == null
                  ? "median"
                  : `avg ${velocity.avg_days_to_activate}d`
              }
              tone="accent"
            />
            <MiniStat
              label="Days to pay"
              value={
                velocity.median_days_to_pay == null
                  ? "—"
                  : `${velocity.median_days_to_pay}d`
              }
              sub={
                velocity.avg_days_to_pay == null
                  ? "median"
                  : `avg ${velocity.avg_days_to_pay}d · ${num(velocity.paid_sample)} paid`
              }
              tone="profit"
            />
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="What needs attention"
          sub="The current constraint, calculated from live data"
        >
          <div className="space-y-2.5">
            <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-3">
              <p className="text-[11px] font-semibold text-text-primary">
                Distribution is under-used
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
                Only {num(summary.tracked_shares)} share intents across{" "}
                {num(summary.advocates)} advocates. Grow repeat sharing before
                buying more traffic.
              </p>
            </div>
            <div className="rounded-xl border border-profit/20 bg-profit/[0.05] p-3">
              <p className="text-[11px] font-semibold text-text-primary">
                Activation quality is strong
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
                {pct(summary.activation_rate)} of referred accounts activated.
                The relationship and auth hand-off are working.
              </p>
            </div>
            <div className="rounded-xl border border-loss/20 bg-loss/[0.04] p-3">
              <p className="text-[11px] font-semibold text-text-primary">
                Paid conversion is the next experiment
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
                {num(summary.subscribed)} of {num(summary.referred)} referred
                users paid ({pct(summary.paid_rate)}). Track offer, source
                advocate, and time-to-pay before raising rewards.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Referred mix" sub="Current role of people who joined via invite">
          {(referral?.role_mix || []).length ? (
            <div className="space-y-2.5">
              {(referral.role_mix || []).map((row) => {
                const share = summary.referred
                  ? (row.count / summary.referred) * 100
                  : 0;
                return (
                  <div key={row.role} className="flex items-center gap-3">
                    <p className="w-24 shrink-0 text-[11px] font-medium capitalize text-text-primary">
                      {row.role}
                    </p>
                    <Bar3D pct={share} heightClass="h-2" />
                    <span className="w-16 text-right text-[11px] tabular-nums text-text-muted">
                      {num(row.count)} · {pct(share)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-[11px] text-text-muted">
              No referred accounts yet.
            </p>
          )}
        </Panel>
      </div>
      <ReminderCenter
        reminders={referral?.reminders}
        onSend={onSend}
        onPause={onPause}
        sending={sending}
      />
      <AdvocateTable
        selectedId={selected?.user_id}
        onSelect={selectAdvocate}
        onResume={(a) => onPause(a, false)}
        refreshToken={referral}
      />
      <RelationshipLedger
        relationships={referral?.relationships || []}
        advocate={ledgerAdvocate}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Data quality"
          sub="Integrity checks across users, codes, and relationships"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat
              label="Missing Use"
              value={num(quality.user_without_use)}
              tone={quality.user_without_use ? "loss" : "profit"}
            />
            <MiniStat
              label="Referrer Mismatch"
              value={num(quality.referrer_mismatch)}
              tone={quality.referrer_mismatch ? "loss" : "profit"}
            />
            <MiniStat
              label="Paid-use Counter"
              value={num(quality.code_use_mismatch)}
              tone={quality.code_use_mismatch ? "accent" : "profit"}
            />
            <MiniStat
              label="Refunded Reward"
              value={num(quality.refunded_commission)}
              tone={quality.refunded_commission ? "loss" : "profit"}
            />
          </div>
          <p className="mt-3 text-[9.5px] leading-relaxed text-text-muted">
            The paid-use counter anomaly is surfaced for repair; relationship
            and commission totals still come from the authoritative referral-use
            records.
          </p>
        </Panel>
        <Panel
          title="Reminder audit"
          sub="Latest delivery attempts in the last 180 days"
        >
          <div className="max-h-44 space-y-1.5 overflow-y-auto">
            {(referral?.reminders?.history || []).map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-2 rounded-lg border border-ink/[0.05] px-2.5 py-2"
              >
                <Avatar
                  name={h.username}
                  tone="rgb(var(--fg-muted))"
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium text-text-primary">
                    @{h.username} · {h.segment}
                  </p>
                  <p className="text-[8.5px] text-text-muted">
                    {fmtDate(h.sent_at || h.created_at, true)}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-bold ${h.status === "sent" ? "text-profit" : h.status === "failed" ? "text-loss" : "text-text-muted"}`}
                >
                  {h.status}
                </span>
              </div>
            ))}
            {!(referral?.reminders?.history || []).length && (
              <p className="py-8 text-center text-[11px] text-text-muted">
                No referral reminders have been sent. This rollout starts clean.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
};

export const GrowthTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState("overview");
  const [sending, setSending] = useState(null);
  const [notice, setNotice] = useState(null);

  const fetchGrowth = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setData(await workspaceApi.getGrowth());
    } catch (e) {
      console.error("Failed to load growth analytics:", e);
      setNotice({
        type: "error",
        text: "Growth analytics could not be loaded.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    fetchGrowth();
  }, [fetchGrowth]);

  const handleSend = async (advocate) => {
    setSending(advocate.user_id);
    setNotice(null);
    try {
      const result = await workspaceApi.sendReferralReminder(advocate.user_id);
      setNotice({
        type: result.ok ? "success" : "error",
        text: result.message,
      });
      await fetchGrowth(true);
    } catch (e) {
      setNotice({
        type: "error",
        text: e?.response?.data?.detail || "Reminder could not be sent.",
      });
    } finally {
      setSending(null);
    }
  };
  const handlePause = async (advocate, optedOut) => {
    try {
      const result = await workspaceApi.setReferralReminderPreference(
        advocate.user_id,
        optedOut,
        optedOut ? "Paused from Referral Engine" : null,
      );
      setNotice({ type: "success", text: result.message });
      await fetchGrowth(true);
    } catch (e) {
      setNotice({
        type: "error",
        text: e?.response?.data?.detail || "Preference could not be updated.",
      });
    }
  };

  if (loading && !data)
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} />
      </div>
    );
  const referral = data?.attribution?.referral || {};
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Growth · Revenue, retention &amp; referral operations
          </p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Growth &amp; Revenue
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-text-muted">
            Confirmed revenue, subscriber retention, and the referral loop.
            Signal proof-to-paid activation is measured in Conversion; Agent
            adoption remains in the dedicated Agent operations desk.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchGrowth(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-primary hover:border-ink/14 disabled:opacity-50"
        >
          <RefreshIcon size={12} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="flex w-fit rounded-xl border border-ink/[0.07] bg-surface-raised p-1">
        {[
          ["overview", "Business overview"],
          [
            "referrals",
            `Referral engine · ${num(referral?.summary?.referred)}`,
          ],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${view === id ? "bg-ink text-surface-raised shadow-sm" : "text-text-muted hover:text-text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <div
          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[10.5px] ${notice.type === "success" ? "border-profit/25 bg-profit/10 text-profit" : "border-loss/25 bg-loss/10 text-loss"}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-bold"
          >
            ×
          </button>
        </div>
      )}
      {view === "overview" ? (
        <Overview data={data} onOpenReferrals={() => setView("referrals")} />
      ) : (
        <ReferralEngine
          referral={referral}
          onSend={handleSend}
          onPause={handlePause}
          sending={sending}
        />
      )}
    </div>
  );
};

export default GrowthTab;
