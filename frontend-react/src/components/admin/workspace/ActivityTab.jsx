// ════════════════════════════════════════════════════════════════════
// ActivityTab — engagement, retention, and who is on the desk right now.
//
// Reads /api/v1/workspace/growth/* and renders one operating surface:
//   header + KPIs with real deltas
//   activity series (users / events / signups)
//   when-they-show-up heatmap
//   live feed + most-active (click opens the user drawer)
//   feature reach (stacked sub vs free, click filters the feed)
//   hot leads + at-risk
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { growthApi } from "../../../services/growthApi";
import { cssChannelHex } from "../../../utils/themeColors";
import { palette, tint, surface, semantic } from "../designSystem";
import { StatTile, Surface, Avatar, EmptyState, Spinner, IconBadge } from "../primitives";
import {
  ActivityIcon,
  TrendingUpIcon,
  UsersIcon,
  FlameIcon,
  AlertTriangleIcon,
  ClockIcon,
  ZapIcon,
  RefreshIcon,
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  SparklesIcon,
} from "../Icons";
import { UserDetailDrawer } from "../UserDetailDrawer";

const FEATURE_LABELS = {
  signals: "Signals",
  terminal: "Terminal",
  performance: "Performance",
  analytics: "Daily Performance",
  autotrade: "Agent",
  assistant: "AI Research",
  markets: "Markets",
  market_pulse: "Market Pulse",
  bitcoin: "Bitcoin",
  ai_arena: "AI Arena",
  onchain: "On-chain",
  delistings: "Delistings",
  news: "News",
  macro_calendar: "Macro Calendar",
  watchlist: "Watchlist",
  journal: "Journal",
  tips: "Tips",
  referral: "Referral",
  profile: "Profile",
  chat: "Chat",
  notifications: "Notifications",
  resources: "Resources",
  api_keys: "API Keys",
  billing: "Billing",
  whale_alert: "Whale Alert",
};

// Distinct per-feature identity for charts — chrome stays gold/neutral.
const FEATURE_COLORS = {
  signals: "#c9a227",
  terminal: "#1d4ed8",
  performance: "#b45309",
  analytics: "#ca8a04",
  autotrade: "#3d9a6a",
  assistant: "#7c3aed",
  markets: "#4f7cff",
  market_pulse: "#2a9d8f",
  bitcoin: "#f7931a",
  ai_arena: "#8b6cff",
  onchain: "#0d9488",
  delistings: "#be123c",
  news: "#64748b",
  macro_calendar: "#7c3aed",
  watchlist: "#db2777",
  journal: "#65a30d",
  tips: "#d97706",
  referral: "#ea580c",
  profile: "#78716c",
  chat: "#5865f2",
  notifications: "#0ea5e9",
  resources: "#0f766e",
  api_keys: "#57534e",
  billing: "#c2410c",
  whale_alert: "#0891b2",
};

const FEATURE_CATALOG = Object.keys(FEATURE_LABELS);

const featureLabel = (f) => FEATURE_LABELS[f] || f;
const featureColor = (f) => FEATURE_COLORS[f] || "#8a7a6e";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const relativeTime = (iso) => {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

const fmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const deltaRatio = (now, prev) => {
  if (prev == null || prev === 0) return now ? 1 : 0;
  return (now - prev) / prev;
};

const Seg = ({ options, value, onChange, tone = "gold" }) => (
  <div className="flex items-center gap-0.5 rounded-lg border border-ink/[0.08] bg-ink/[0.03] p-0.5">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition ${
            active ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
          }`}
          style={
            active && tone === "gold"
              ? { color: "rgb(var(--accent-text))" }
              : undefined
          }
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const RoleChip = ({ role }) => {
  if (!role) return null;
  const key = role === "premium" || role === "subscriber" ? "subscriber" : role === "admin" || role === "founder" ? "admin" : "free";
  const s = semantic.role[key];
  const label = role === "autotrade" ? "agent" : role;
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
};

const ActivityHeader = ({ onRefresh, refreshing, generatedAt, events1h }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <IconBadge Icon={ActivityIcon} color="rgb(var(--accent))" size={38} iconSize={18} />
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
          Activity · Engagement & growth analytics
        </p>
        <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Growth Dashboard
        </h2>
        <p className="mt-0.5 max-w-lg text-[12px] text-text-muted">
          Who is on the product, which desks they touch, and who is about to slip.
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {events1h != null && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium"
          style={{
            background: "rgb(var(--pos) / 0.08)",
            color: "rgb(var(--pos-text))",
            borderColor: "rgb(var(--pos) / 0.22)",
          }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {events1h} feature {events1h === 1 ? "touch" : "touches"} last hour
        </span>
      )}
      {generatedAt && (
        <span className="text-[10px] text-text-muted">updated {relativeTime(generatedAt)}</span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 rounded-lg border border-ink/[0.1] bg-ink/[0.04] px-3 py-2 text-[11px] font-semibold text-text-primary transition hover:bg-ink/[0.08] disabled:opacity-50"
      >
        {refreshing ? <Spinner size={12} /> : <RefreshIcon size={12} />}
        Refresh
      </button>
    </div>
  </div>
);

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-ink/[0.1] bg-surface-raised px-2.5 py-2 shadow-lg">
      <p className="mb-1 text-[10px] font-medium text-text-muted">{fmtDay(label)}</p>
      <p className="text-[11.5px] tabular-nums text-text-primary">
        <span className="text-text-muted">Active</span> {row.users ?? 0}
      </p>
      <p className="text-[11.5px] tabular-nums text-text-primary">
        <span className="text-text-muted">Touches</span> {row.events ?? 0}
      </p>
      <p className="text-[11.5px] tabular-nums text-text-primary">
        <span className="text-text-muted">Signups</span> {row.signups ?? 0}
      </p>
    </div>
  );
};

const ActivityChart = ({ series, days, onDays, loading }) => {
  const gold = cssChannelHex("--accent", "#c9a227");
  const ink = cssChannelHex("--ink", "#8a7a6e");
  if (loading && !series?.length) {
    return (
      <Surface variant="premium" hover={false} padding="p-5">
        <div className="flex h-56 items-center justify-center">
          <Spinner size={16} />
        </div>
      </Surface>
    );
  }
  const data = series || [];
  const peak = data.reduce((m, d) => Math.max(m, d.users || 0), 0);
  const peakDay = data.find((d) => d.users === peak);

  return (
    <Surface variant="premium" hover={false} padding="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
            Activity over time
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Unique people who touched a feature, and how many touches that day.
            {peakDay ? ` Peak ${peak} on ${fmtDay(peakDay.date)}.` : ""}
          </p>
        </div>
        <Seg
          value={days}
          onChange={onDays}
          options={[
            { value: 7, label: "7d" },
            { value: 30, label: "30d" },
            { value: 90, label: "90d" },
          ]}
        />
      </div>
      <div className="h-56 w-full sm:h-64">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="lqActFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gold} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--ink) / 0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgb(var(--fg-muted))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={Math.ceil(data.length / 7)}
                minTickGap={22}
                tickFormatter={fmtDay}
                dy={6}
              />
              <YAxis
                yAxisId="users"
                stroke="rgb(var(--fg-muted))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis yAxisId="events" orientation="right" hide />
              <Tooltip content={<ChartTip />} cursor={{ stroke: "rgb(var(--ink) / 0.12)" }} />
              <Bar
                yAxisId="events"
                dataKey="events"
                fill={ink}
                fillOpacity={0.12}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Area
                yAxisId="users"
                type="monotone"
                dataKey="users"
                stroke={gold}
                strokeWidth={2}
                fill="url(#lqActFill)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-[12px] text-text-muted">
            No feature activity in this window.
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: gold }} />
          Active people
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-ink/15" />
          Feature touches
        </span>
      </div>
    </Surface>
  );
};

const Heatmap = ({ heatmap, loading }) => {
  const cells = heatmap?.cells || [];
  const peak = heatmap?.peak;
  const max = peak?.events || 0;
  const now = new Date();
  const nowDow = ((now.getUTCDay() + 6) % 7) + 1;
  const nowHour = now.getUTCHours();

  const grid = useMemo(() => {
    const m = new Map();
    cells.forEach((c) => m.set(`${c.dow}-${c.hour}`, c));
    return m;
  }, [cells]);

  if (loading && !cells.length) {
    return (
      <Surface variant="premium" hover={false} padding="p-5">
        <div className="flex h-48 items-center justify-center">
          <Spinner size={16} />
        </div>
      </Surface>
    );
  }

  return (
    <Surface variant="premium" hover={false} padding="p-5" className="h-full">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
          When people show up
        </h3>
        <p className="mt-0.5 text-[11px] text-text-muted">
          Feature touches by UTC hour, last 14 days.
          {peak?.events
            ? ` Busiest: ${DOW[peak.dow - 1]} ${String(peak.hour).padStart(2, "0")}:00 · ${peak.events} touches.`
            : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="mb-1 grid grid-cols-[28px_repeat(24,minmax(0,1fr))] gap-px">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="text-center text-[8px] tabular-nums text-text-muted/70"
              >
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
          </div>
          {DOW.map((name, i) => {
            const dow = i + 1;
            return (
              <div
                key={name}
                className="mb-px grid grid-cols-[28px_repeat(24,minmax(0,1fr))] gap-px"
              >
                <span className="self-center text-[9px] text-text-muted">{name}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const c = grid.get(`${dow}-${hour}`);
                  const ev = c?.events || 0;
                  const t = max > 0 ? ev / max : 0;
                  const here = dow === nowDow && hour === nowHour;
                  return (
                    <div
                      key={hour}
                      title={`${name} ${String(hour).padStart(2, "0")}:00 UTC · ${ev} touches · ${c?.users || 0} people`}
                      className="aspect-square rounded-[2px]"
                      style={{
                        background:
                          ev === 0
                            ? "rgb(var(--ink) / 0.05)"
                            : `rgb(var(--accent) / ${0.14 + t * 0.78})`,
                        outline: here ? "1px solid rgb(var(--accent-text))" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted">
        <span>Less</span>
        <div className="flex items-center gap-0.5">
          {[0, 0.2, 0.4, 0.6, 0.85, 1].map((t) => (
            <span
              key={t}
              className="h-2.5 w-3.5 rounded-[2px]"
              style={{
                background: t === 0 ? "rgb(var(--ink) / 0.05)" : `rgb(var(--accent) / ${0.14 + t * 0.78})`,
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </Surface>
  );
};

const emptyDesk = (id) => ({
  feature: id,
  users_total: 0,
  users_subscribers: 0,
  users_free: 0,
  hits: 0,
  pct_of_subscribers: 0,
  pct_of_free: 0,
  waiting: true,
});

const FeatureFunnel = ({ funnel, loading, days, onDays, activeFeature, onPick }) => {
  const features = useMemo(() => {
    const incoming = (funnel?.features || []).filter((f) => f.feature !== "fx");
    const byId = Object.fromEntries(incoming.map((f) => [f.feature, { ...f, waiting: false }]));
    const rows = FEATURE_CATALOG.map((id) => byId[id] || emptyDesk(id));
    incoming.forEach((f) => {
      if (!FEATURE_LABELS[f.feature]) rows.push({ ...f, waiting: false });
    });
    rows.sort((a, b) => b.users_total - a.users_total || featureLabel(a.feature).localeCompare(featureLabel(b.feature)));
    return rows;
  }, [funnel]);
  const live = features.filter((f) => f.users_total > 0).length;
  const maxUsers = features.reduce((m, f) => Math.max(m, f.users_total), 0) || 1;

  return (
    <Surface variant="premium" hover={false} padding="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">
            Feature reach
          </h3>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Every product desk. Colour = subscribers, ink = free. Click a row to
            filter the live feed. Auth, admin, unread badges, and announcements
            are not counted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">
            {live}/{features.length} desks · {funnel?.subscriber_base ?? 0} subs ·{" "}
            {funnel?.free_base ?? 0} free
          </span>
          <Seg
            value={days}
            onChange={onDays}
            options={[
              { value: 7, label: "7d" },
              { value: 30, label: "30d" },
              { value: 90, label: "90d" },
            ]}
          />
        </div>
      </div>

      {loading && !features.length ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={16} />
        </div>
      ) : features.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">
          No feature activity recorded yet in this window.
        </p>
      ) : (
        <div className="space-y-2.5">
          {features.map((f) => {
            const color = featureColor(f.feature);
            const widthPct = Math.max(4, (f.users_total / maxUsers) * 100);
            const subShare = f.users_total ? (f.users_subscribers / f.users_total) * 100 : 0;
            const active = activeFeature === f.feature;
            return (
              <button
                key={f.feature}
                type="button"
                onClick={() => onPick(active ? null : f.feature)}
                className={`block w-full rounded-lg px-1 py-1 text-left transition ${
                  active ? "bg-ink/[0.04]" : "hover:bg-ink/[0.02]"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[12px] font-medium text-text-primary">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: color }}
                    />
                    {featureLabel(f.feature)}
                  </span>
                  <span className="text-[10px] tabular-nums text-text-muted">
                    {f.waiting
                      ? "waiting for first visit"
                      : `${f.users_total} ${f.users_total === 1 ? "person" : "people"} · ${f.hits} hits`}
                  </span>
                </div>
                <div
                  className="relative h-2.5 overflow-hidden rounded-full"
                  style={{
                    background: "rgb(var(--ink) / 0.07)",
                    width: f.waiting ? "100%" : `${widthPct}%`,
                    opacity: f.waiting ? 0.45 : 1,
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${subShare}%`,
                      background: color,
                    }}
                  />
                  <div
                    className="absolute inset-y-0"
                    style={{
                      left: `${subShare}%`,
                      right: 0,
                      background: "rgb(var(--ink) / 0.22)",
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-text-muted">
                  <span>
                    {f.pct_of_subscribers}% of subs
                    {f.users_free > 0 ? ` · ${f.users_free} free` : ""}
                  </span>
                  {f.pct_of_free > 0 && <span>{f.pct_of_free}% of free</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Surface>
  );
};

const ContactChips = ({ telegram, discord, email }) => {
  const chips = [];
  if (telegram)
    chips.push({ Icon: TelegramIcon, label: `@${telegram}`, color: palette.channels.telegram });
  else if (discord)
    chips.push({ Icon: DiscordIcon, label: discord, color: palette.channels.discord });
  if (
    email &&
    !email.includes("@telegram.luxquant") &&
    !email.includes("@discord.luxquant") &&
    !email.includes("@manual.luxquant")
  ) {
    chips.push({ Icon: EmailIcon, label: email, color: palette.channels.email });
  }
  if (chips.length === 0) {
    return <span className="text-[10px] text-text-muted">no contact</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex max-w-[160px] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[9.5px] font-medium"
          style={{
            background: tint(c.color, 0.1),
            color: c.color,
            border: `1px solid ${tint(c.color, 0.22)}`,
          }}
          title={c.label}
        >
          <c.Icon size={9} />
          {c.label}
        </span>
      ))}
    </div>
  );
};

const TopFeatureTags = ({ features }) => {
  if (!features?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {features.map((f) => (
        <span
          key={f.feature}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium"
          style={{
            background: tint(featureColor(f.feature), 0.12),
            color: featureColor(f.feature),
          }}
        >
          {featureLabel(f.feature)} ·{f.count}
        </span>
      ))}
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  const tone =
    score >= 60 ? "rgb(var(--pos-text))" : score >= 30 ? "rgb(var(--accent-text))" : "rgb(var(--fg-muted))";
  return (
    <div className="flex shrink-0 flex-col items-center">
      <span className="text-base font-light tabular-nums leading-none" style={{ color: tone }}>
        {score}
      </span>
      <span className="text-[8px] uppercase tracking-wider text-text-muted">score</span>
    </div>
  );
};

const HotLeadsPanel = ({ data, loading, onOpen }) => {
  const items = data?.items || [];
  return (
    <Surface variant="premium" hover={false} padding="p-5" className="h-full">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlameIcon size={14} style={{ color: "rgb(var(--accent-text))" }} />
          <h3 className="text-sm font-semibold tracking-tight text-text-primary">Hot leads</h3>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] tabular-nums text-text-muted">{items.length}</span>
        )}
      </div>
      <p className="mb-4 text-[11px] text-text-muted">
        Free users already using the product — the ones worth a conversation.
      </p>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={16} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          Icon={SparklesIcon}
          tone={palette.orange[400]}
          title="No hot leads yet"
          description="Free users who come back several days in a row will show up here."
        />
      ) : (
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {items.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onOpen(u.id)}
              className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-ink/[0.03]"
              style={{ background: surface.base.bg, border: `1px solid ${surface.base.border}` }}
            >
              <Avatar src={u.avatar_url} name={u.username} size="sm" tone={palette.orange[400]} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[12px] font-semibold text-text-primary">
                    @{u.username}
                  </span>
                  <span className="text-[9px] text-text-muted">
                    joined {u.joined_days_ago != null ? `${u.joined_days_ago}d ago` : "—"}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  {u.active_days_30d}d active · {u.events_30d} actions · seen{" "}
                  {relativeTime(u.last_active_at)}
                </div>
                <TopFeatureTags features={u.top_features} />
                <div className="mt-1.5">
                  <ContactChips telegram={u.telegram} discord={u.discord} email={u.email} />
                </div>
              </div>
              <ScoreBadge score={u.engagement_score} />
            </button>
          ))}
        </div>
      )}
    </Surface>
  );
};

const RiskTag = ({ item }) => {
  if (item.last_active_at == null) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted"
        style={{ background: "rgb(var(--ink) / 0.06)", border: "1px solid rgb(var(--ink) / 0.12)" }}
      >
        never logged in
      </span>
    );
  }
  if (item.days_until_expiry != null && item.days_until_expiry <= 14) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{
          background: "rgb(var(--neg) / 0.1)",
          color: "rgb(var(--neg-text))",
          border: "1px solid rgb(var(--neg) / 0.25)",
        }}
      >
        <AlertTriangleIcon size={9} />
        {item.days_until_expiry}d left
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{
        background: "rgb(var(--accent) / 0.1)",
        color: "rgb(var(--accent-text))",
        border: "1px solid rgb(var(--accent) / 0.22)",
      }}
    >
      dormant {item.days_inactive != null ? `${item.days_inactive}d` : ""}
    </span>
  );
};

const AtRiskPanel = ({ data, loading, onOpen }) => {
  const items = data?.items || [];
  const expiring = items.filter((u) => u.days_until_expiry != null && u.days_until_expiry <= 14).length;
  return (
    <Surface variant="premium" hover={false} padding="p-5" className="h-full">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon size={14} style={{ color: "rgb(var(--neg-text))" }} />
          <h3 className="text-sm font-semibold tracking-tight text-text-primary">
            At-risk subscribers
          </h3>
        </div>
        {items.length > 0 && (
          <span className="text-[10px] tabular-nums text-text-muted">
            {items.length}
            {expiring > 0 ? ` · ${expiring} expiring` : ""}
          </span>
        )}
      </div>
      <p className="mb-4 text-[11px] text-text-muted">
        Paying users gone quiet — or a renewal that is close.
      </p>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={16} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          Icon={ZapIcon}
          tone={palette.green[400]}
          title="No one at risk"
          description="Every active subscriber has been seen recently."
        />
      ) : (
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {items.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onOpen(u.id)}
              className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-ink/[0.03]"
              style={{ background: surface.base.bg, border: `1px solid ${surface.base.border}` }}
            >
              <Avatar src={u.avatar_url} name={u.username} size="sm" tone={palette.red[400]} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[12px] font-semibold text-text-primary">
                    @{u.username}
                  </span>
                  <RiskTag item={u} />
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted">
                  {u.role}
                  {u.last_active_at
                    ? ` · last seen ${relativeTime(u.last_active_at)}`
                    : " · no web activity"}
                  {u.subscription_expires_at && u.days_until_expiry != null
                    ? ` · expires in ${u.days_until_expiry}d`
                    : u.subscription_expires_at == null
                      ? " · lifetime"
                      : ""}
                </div>
                <TopFeatureTags features={u.top_features} />
                <div className="mt-1.5">
                  <ContactChips telegram={u.telegram} discord={u.discord} email={u.email} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Surface>
  );
};

const LiveActivityFeed = ({
  events,
  loading,
  feature,
  onFilter,
  lastHour,
  features,
  onOpen,
  onMore,
  hasMore,
  loadingMore,
}) => {
  const filters = useMemo(() => {
    const extra = (features || [])
      .map((f) => f.feature)
      .filter(
        (f) =>
          f &&
          !["signals", "terminal", "performance", "analytics", "watchlist", "markets", "autotrade"].includes(
            f
          )
      );
    const base = [
      { value: null, label: "All" },
      { value: "signals", label: "Signals" },
      { value: "terminal", label: "Terminal" },
      { value: "performance", label: "Performance" },
      { value: "analytics", label: "Daily Perf" },
      { value: "watchlist", label: "Watchlist" },
      { value: "markets", label: "Markets" },
      { value: "autotrade", label: "Agent" },
    ];
    extra.slice(0, 8).forEach((f) => base.push({ value: f, label: featureLabel(f) }));
    return base;
  }, [features]);

  return (
    <Surface variant="premium" hover={false} padding="p-5" className="h-full">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-text-primary">Live activity</h3>
          {lastHour != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]"
              style={{
                background: "rgb(var(--pos) / 0.1)",
                color: "rgb(var(--pos-text))",
              }}
            >
              <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
              {lastHour} last hour
            </span>
          )}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {filters.map((f) => {
          const active = feature === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onFilter(f.value)}
              className="rounded px-2 py-0.5 text-[9.5px] font-medium"
              style={{
                background: active ? "rgb(var(--accent) / 0.12)" : surface.base.bg,
                color: active ? "rgb(var(--accent-text))" : "rgb(var(--fg-muted))",
                border: `1px solid ${active ? "rgb(var(--accent) / 0.25)" : "transparent"}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        Feature touches, newest first. One row per person per feature per hour.
      </p>
      {loading && !events?.length ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={16} />
        </div>
      ) : !events || events.length === 0 ? (
        <EmptyState
          Icon={ActivityIcon}
          tone={palette.gold[300]}
          title="No activity yet"
          description="Feature touches will stream in here."
        />
      ) : (
        <>
          <div className="max-h-[420px] space-y-0.5 overflow-y-auto pr-1">
            {events.map((e) => {
              const accent = featureColor(e.feature);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e.user_id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-ink/[0.03]"
                >
                  <Avatar src={e.avatar_url} name={e.username} size="xs" tone={accent} />
                  <div className="min-w-0 flex-1 text-[11.5px]">
                    <span className="truncate font-medium text-text-primary">
                      {e.username || `#${e.user_id}`}
                    </span>
                    <span className="text-text-muted"> · </span>
                    <span style={{ color: accent }}>{featureLabel(e.feature)}</span>
                    <span className="ml-1.5 align-middle">
                      <RoleChip role={e.role} />
                    </span>
                  </div>
                  <span className="shrink-0 text-[9.5px] tabular-nums text-text-muted">
                    {relativeTime(e.occurred_at)}
                  </span>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={onMore}
              disabled={loadingMore}
              className="mt-3 w-full rounded-lg border border-ink/[0.08] py-1.5 text-[11px] font-medium text-text-muted hover:bg-ink/[0.03] hover:text-text-primary disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          )}
        </>
      )}
    </Surface>
  );
};

const USER_SORTS = [
  { value: "last_seen", label: "Last seen" },
  { value: "event_count", label: "Most events" },
  { value: "feature", label: "Feature" },
];
const USER_WINDOWS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

const ActiveUsersTable = ({
  users,
  loading,
  sortBy,
  window: win,
  onSort,
  onWindow,
  onOpen,
}) => {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = users || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(s) ||
        String(u.user_id).includes(s) ||
        featureLabel(u.last_feature || "").toLowerCase().includes(s)
    );
  }, [users, q]);

  return (
    <Surface variant="premium" hover={false} padding="p-5" className="h-full">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-text-primary">Most active</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={win} onChange={onWindow} options={USER_WINDOWS} tone="neutral" />
          <Seg value={sortBy} onChange={onSort} options={USER_SORTS} />
        </div>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        Who is active, when they were last seen, and the last desk they touched.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by name or feature"
        className="mb-3 w-full rounded-lg border border-ink/[0.08] bg-ink/[0.03] px-2.5 py-1.5 text-[12px] text-text-primary outline-none placeholder:text-text-muted focus:border-ink/20"
      />
      {loading && !users?.length ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={16} />
        </div>
      ) : !filtered.length ? (
        <EmptyState
          Icon={UsersIcon}
          tone={palette.orange[400]}
          title="No active users"
          description="Activity in this window will appear here."
        />
      ) : (
        <div className="max-h-[380px] overflow-y-auto pr-1">
          <div className="sticky top-0 grid grid-cols-[1.6fr_0.9fr_1fr_auto] gap-2 bg-surface-raised px-2 pb-1.5 text-[8.5px] uppercase tracking-wider text-text-muted">
            <span>User</span>
            <span>Last seen</span>
            <span>Feature</span>
            <span className="text-right">Events</span>
          </div>
          <div className="space-y-0.5">
            {filtered.map((u, i) => {
              const accent = featureColor(u.last_feature || "x");
              return (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => onOpen(u.user_id)}
                  className="grid w-full grid-cols-[1.6fr_0.9fr_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-ink/[0.03]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-[9px] tabular-nums text-text-muted/60">
                      {i + 1}
                    </span>
                    <Avatar src={u.avatar_url} name={u.username} size="xs" tone={accent} />
                    <span className="truncate text-[11.5px] font-medium text-text-primary">
                      {u.username || `#${u.user_id}`}
                    </span>
                    <RoleChip role={u.role} />
                  </div>
                  <span className="text-[10.5px] tabular-nums text-text-muted">
                    {relativeTime(u.last_seen)}
                  </span>
                  <span className="truncate text-[10.5px]" style={{ color: accent }}>
                    {u.last_feature ? featureLabel(u.last_feature) : "—"}
                  </span>
                  <span className="text-right text-[11px] tabular-nums text-text-primary">
                    {u.event_count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Surface>
  );
};

const RetentionStrip = ({ retention, nr }) => {
  if (!retention && !nr) return null;
  const cells = [
    { k: "d1", label: "Came back next day", hint: "Signed up yesterday, seen today" },
    { k: "d7", label: "Still here after a week", hint: "Signed up 7 days ago, seen in the last 7" },
    { k: "d14", label: "Still here after 2 weeks", hint: "Signed up 14 days ago, seen in the last 14" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c) => {
        const b = retention?.[c.k];
        return (
          <Surface key={c.k} variant="premium" hover={false} padding="p-4">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
              {c.label}
            </p>
            <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-text-primary">
              {b?.pct == null ? "—" : `${b.pct}%`}
            </p>
            <p className="mt-1 text-[10.5px] text-text-muted">
              {b?.cohort
                ? `${b.returned} of ${b.cohort} · ${c.hint}`
                : `No cohort yet · ${c.hint}`}
            </p>
          </Surface>
        );
      })}
      <Surface variant="premium" hover={false} padding="p-4">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
          On the desk today
        </p>
        <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-text-primary">
          {(nr?.returning_today ?? 0) + (nr?.new_today ?? 0)}
        </p>
        <p className="mt-1 text-[10.5px] text-text-muted">
          <span className="text-text-primary">{nr?.returning_today ?? 0}</span> returning ·{" "}
          <span className="text-text-primary">{nr?.new_today ?? 0}</span> new
        </p>
      </Surface>
    </div>
  );
};

export const ActivityTab = () => {
  const [overview, setOverview] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [funnelDays, setFunnelDays] = useState(30);
  const [hotLeads, setHotLeads] = useState(null);
  const [atRisk, setAtRisk] = useState(null);
  const [feed, setFeed] = useState(null);
  const [feedFeature, setFeedFeature] = useState(null);
  const [activeUsers, setActiveUsers] = useState(null);
  const [auSort, setAuSort] = useState("last_seen");
  const [auWindow, setAuWindow] = useState("30d");
  const [insights, setInsights] = useState(null);
  const [insightDays, setInsightDays] = useState(30);
  const [drawerId, setDrawerId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCore = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [ov, fn, hl, ar, ins] = await Promise.all([
        growthApi.getOverview(),
        growthApi.getFeatureFunnel(funnelDays),
        growthApi.getHotLeads({ minActiveDays: 3, limit: 25 }),
        growthApi.getAtRisk({ dormantDays: 14, limit: 25 }),
        growthApi.getActivityInsights(insightDays),
      ]);
      setOverview(ov);
      setFunnel(fn);
      setHotLeads(hl);
      setAtRisk(ar);
      setInsights(ins);
    } catch (e) {
      console.error("Failed to load growth data:", e);
      setError("Failed to load growth analytics. Try refreshing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [funnelDays, insightDays]);

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const fd = await growthApi.getActivityFeed({ feature: feedFeature, limit: 40 });
      setFeed(fd);
    } catch (e) {
      console.error("Failed to load activity feed:", e);
    } finally {
      setFeedLoading(false);
    }
  }, [feedFeature]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const au = await growthApi.getActiveUsers({ sortBy: auSort, window: auWindow, limit: 40 });
      setActiveUsers(au);
    } catch (e) {
      console.error("Failed to load active users:", e);
    } finally {
      setUsersLoading(false);
    }
  }, [auSort, auWindow]);

  useEffect(() => {
    fetchCore(false);
  }, [fetchCore]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const t = setInterval(() => {
      fetchCore(true);
      fetchFeed();
      fetchUsers();
    }, 30000);
    return () => clearInterval(t);
  }, [fetchCore, fetchFeed, fetchUsers]);

  const loadMore = async () => {
    if (!feed?.next_before_id) return;
    setMoreLoading(true);
    try {
      const next = await growthApi.getActivityFeed({
        feature: feedFeature,
        limit: 40,
        beforeId: feed.next_before_id,
      });
      setFeed((prev) => ({
        ...next,
        events: [...(prev?.events || []), ...(next.events || [])],
      }));
    } finally {
      setMoreLoading(false);
    }
  };

  const pulse = insights?.pulse;
  const series = insights?.series || [];
  const userTrend = series.map((d) => d.users);

  return (
    <div className="space-y-5">
      <ActivityHeader
        onRefresh={() => {
          fetchCore(true);
          fetchFeed();
          fetchUsers();
        }}
        refreshing={refreshing}
        generatedAt={overview?.generated_at}
        events1h={pulse?.events_1h}
      />

      {error && (
        <Surface tone={palette.red[400]} padding="p-3">
          <p className="text-xs" style={{ color: palette.red[400] }}>
            {error}
          </p>
        </Surface>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="DAU"
          value={overview?.dau ?? "—"}
          sub="active today"
          accent="gold"
          Icon={ActivityIcon}
          loading={loading}
          emphasis
          trend={userTrend}
          delta={
            pulse
              ? {
                  pct: deltaRatio(pulse.users_today, pulse.users_yesterday),
                  note: "feature-active vs yesterday",
                }
              : null
          }
        />
        <StatTile
          label="WAU"
          value={overview?.wau ?? "—"}
          sub="last 7 days"
          accent="green"
          Icon={UsersIcon}
          loading={loading}
          delta={
            pulse
              ? {
                  pct: deltaRatio(pulse.users_7d, pulse.users_prev_7d),
                  note: "feature-active vs prior 7 days",
                }
              : null
          }
        />
        <StatTile
          label="MAU"
          value={overview?.mau ?? "—"}
          sub="last 30 days"
          accent="muted"
          Icon={UsersIcon}
          loading={loading}
        />
        <StatTile
          label="Stickiness"
          value={overview ? `${overview.stickiness_pct}%` : "—"}
          sub="DAU / MAU"
          accent="gold"
          Icon={TrendingUpIcon}
          loading={loading}
        />
        <StatTile
          label="Active subs"
          value={overview?.active_subscribers ?? "—"}
          sub={overview ? `${overview.dormant_subscribers} dormant` : ""}
          accent="green"
          Icon={UsersIcon}
          loading={loading}
        />
        <StatTile
          label="Power users"
          value={overview?.power_users ?? "—"}
          sub="5+ active days/wk"
          accent="orange"
          Icon={FlameIcon}
          loading={loading}
        />
      </div>

      {overview && (
        <Surface variant="base" padding="p-3.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon size={11} style={{ color: "rgb(var(--accent-text))" }} />
              Signups
            </span>
            <span>
              <strong className="tabular-nums text-text-primary">{overview.signups_today}</strong>{" "}
              today
            </span>
            <span>
              <strong className="tabular-nums text-text-primary">{overview.signups_7d}</strong> this
              week
            </span>
            <span>
              <strong className="tabular-nums text-text-primary">{overview.signups_30d}</strong> this
              month
            </span>
            {pulse && (
              <span>
                <strong className="tabular-nums text-text-primary">{pulse.events_24h}</strong>{" "}
                touches / 24h
              </span>
            )}
            <span className="ml-auto text-text-muted">
              <strong className="tabular-nums text-text-primary">{overview.total_users}</strong>{" "}
              total users
            </span>
          </div>
        </Surface>
      )}

      <RetentionStrip retention={insights?.retention} nr={insights?.new_vs_returning} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <ActivityChart
          series={series}
          days={insightDays}
          onDays={setInsightDays}
          loading={loading}
        />
        <Heatmap heatmap={insights?.heatmap} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LiveActivityFeed
          events={feed?.events}
          loading={feedLoading}
          feature={feedFeature}
          onFilter={setFeedFeature}
          lastHour={pulse?.events_1h}
          features={funnel?.features}
          onOpen={setDrawerId}
          onMore={loadMore}
          hasMore={!!feed?.next_before_id && (feed?.events?.length || 0) >= 40}
          loadingMore={moreLoading}
        />
        <ActiveUsersTable
          users={activeUsers?.users}
          loading={usersLoading}
          sortBy={auSort}
          window={auWindow}
          onSort={setAuSort}
          onWindow={setAuWindow}
          onOpen={setDrawerId}
        />
      </div>

      <FeatureFunnel
        funnel={funnel}
        loading={loading}
        days={funnelDays}
        onDays={setFunnelDays}
        activeFeature={feedFeature}
        onPick={setFeedFeature}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <HotLeadsPanel data={hotLeads} loading={loading} onOpen={setDrawerId} />
        <AtRiskPanel data={atRisk} loading={loading} onOpen={setDrawerId} />
      </div>

      {drawerId && (
        <UserDetailDrawer userId={drawerId} onClose={() => setDrawerId(null)} canWrite={false} />
      )}
    </div>
  );
};

export default ActivityTab;
