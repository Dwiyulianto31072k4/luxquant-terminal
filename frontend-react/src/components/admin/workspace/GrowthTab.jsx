// GrowthTab — signals-led revenue, retention, and referral operating system.

import { useState, useEffect, useCallback, useMemo } from "react";
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
    ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en", { month: "short" })
    : "";

const SOURCE_LABEL = {
  payment: "On-chain payment",
  legacy: "Legacy member",
  lifetime: "Lifetime",
  admin: "Admin grant",
  telegram_vip: "Telegram VIP",
  discord_premium: "Discord premium",
  manual: "Manual payment",
};

const REMINDER_STATE = {
  eligible: ["Ready", "border-profit/25 bg-profit/10 text-profit"],
  cooldown: ["Cooldown", "border-blue-500/20 bg-blue-500/10 text-blue-600"],
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

const Panel = ({ title, sub, children, right, className = "" }) => (
  <Surface variant="premium" hover={false} padding="p-5" className={className}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
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

const RevenueTrend = ({ trend }) => {
  const max = Math.max(...trend.map((t) => t.revenue), 1);
  if (!trend.length)
    return (
      <p className="py-6 text-center text-[11px] text-text-muted">
        No revenue recorded yet.
      </p>
    );
  return (
    <div className="flex h-40 items-end gap-1.5 pt-2">
      {trend.map((t) => (
        <div
          key={t.month}
          className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
        >
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-ink/30 transition-all group-hover:bg-accent/50"
              style={{ height: `${Math.max((t.revenue / max) * 100, 2)}%` }}
              title={`${t.month}: ${usd(t.revenue)} · ${t.count} payments`}
            />
          </div>
          <span className="text-[8.5px] tabular-nums text-text-muted/70">
            {monthLabel(t.month)}
          </span>
        </div>
      ))}
    </div>
  );
};

const SourceTable = ({ bySource }) => {
  const maxRev = Math.max(...bySource.map((s) => s.revenue), 1);
  if (!bySource.length)
    return (
      <p className="py-4 text-center text-[11px] text-text-muted">
        No source data.
      </p>
    );
  return (
    <div className="space-y-2.5">
      {bySource.map((s) => (
        <div key={s.source} className="flex items-center gap-3">
          <div className="w-28 min-w-0 shrink-0">
            <p className="truncate text-[11.5px] font-medium text-text-primary">
              {SOURCE_LABEL[s.source] || s.source}
            </p>
            <p className="text-[9px] text-text-muted">{num(s.users)} users</p>
          </div>
          <Bar3D pct={(s.revenue / maxRev) * 100} heightClass="h-2" />
          <span className="w-16 text-right text-[12px] font-bold tabular-nums text-text-primary">
            {usd(s.revenue)}
          </span>
        </div>
      ))}
    </div>
  );
};

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

const Overview = ({ data }) => {
  const rev = data?.revenue || {};
  const rec = data?.recurring || {};
  const churn = data?.churn || {};
  const attr = data?.attribution || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Total Revenue"
          value={usd(rev.total)}
          Icon={TrendingUpIcon}
          accent="muted"
          sub={`${num(rev.payment_count)} payments`}
        />
        <StatTile
          label="Revenue · 30d"
          value={usd(rev.last_30d)}
          Icon={TrendingUpIcon}
          accent="muted"
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
          accent="muted"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Revenue trend"
          sub="Confirmed revenue, last 12 months"
          className="lg:col-span-2"
        >
          <RevenueTrend trend={rev.trend || []} />
        </Panel>
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
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue by source" sub="Where paying members come from">
          <SourceTable bySource={attr.by_source || []} />
        </Panel>
        <Panel
          title="Referral pulse"
          sub="The detailed engine now lives beside this overview"
        >
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStat
              label="Advocates"
              value={num(attr.referral?.summary?.advocates)}
            />
            <MiniStat
              label="Referred"
              value={num(attr.referral?.summary?.referred)}
              tone="accent"
            />
            <MiniStat
              label="Paid"
              value={num(attr.referral?.summary?.subscribed)}
              tone="profit"
            />
            <MiniStat
              label="Referral Revenue"
              value={usd(attr.referral?.summary?.revenue)}
              tone="profit"
            />
          </div>
        </Panel>
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

const ReferralFunnel = ({ summary }) => {
  const stages = [
    ["Tracked shares", summary.tracked_shares, null],
    [
      "Referred accounts",
      summary.referred,
      summary.tracked_shares
        ? (summary.referred / summary.tracked_shares) * 100
        : 0,
    ],
    ["Activated", summary.activated, summary.activation_rate],
    ["Paid", summary.subscribed, summary.paid_rate],
  ];
  const max = Math.max(...stages.map((s) => s[1]), 1);
  return (
    <div className="space-y-3">
      {stages.map(([label, value, rate], i) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-text-muted">
              {label}
            </span>
            <span className="font-bold tabular-nums text-text-primary">
              {num(value)}{" "}
              {rate != null && (
                <span className="ml-1 font-normal text-text-muted">
                  · {pct(rate)}
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/[0.05]">
            <div
              className={`h-full rounded-full ${i === 3 ? "bg-profit" : "bg-accent/65"}`}
              style={{
                width: `${Math.max((value / max) * 100, value ? 3 : 0)}%`,
              }}
            />
          </div>
        </div>
      ))}
      <p className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-3 py-2 text-[10px] leading-relaxed text-text-muted">
        Share is an intent event from the referral page; referred, activated,
        and paid are server-side relationships. Paid rate uses referred accounts
        as its denominator.
      </p>
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
              ["premium", "Premium"],
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
        <table className="w-full min-w-[930px] text-left">
          <thead className="bg-ink/[0.025] text-[8.5px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="w-12 px-3 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">Advocate</th>
              <th>Code</th>
              <th className="text-right">Shares</th>
              <th className="text-right">Referred</th>
              <th className="text-right">Active</th>
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
                <td colSpan="10" className="py-12 text-center text-[11px] text-text-muted">
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
        <table className="w-full min-w-[720px] text-left">
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
                    </p>
                  </div>
                </td>
                <td>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold ${r.status === "refunded" ? "border-loss/20 bg-loss/10 text-loss" : r.payments ? "border-profit/20 bg-profit/10 text-profit" : "border-accent/20 bg-accent/5 text-accent-text"}`}
                  >
                    {r.status}
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
  const quality = referral?.data_quality || {};
  const anomalyCount =
    Number(quality.user_without_use || 0) +
    Number(quality.referrer_mismatch || 0) +
    Number(quality.code_use_mismatch || 0) +
    Number(quality.refunded_commission || 0);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/[0.07] via-surface-raised to-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-accent-text">
              Referral growth loop
            </p>
            <h3 className="mt-1 text-[17px] font-semibold text-text-primary">
              Turn trusted users into measurable distribution
            </h3>
            <p className="mt-1 max-w-2xl text-[10.5px] text-text-muted">
              Shares create acquisition; relationships measure activation and
              paid value; guarded reminders reactivate advocates without
              blasting everyone.
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
          accent="muted"
          sub="server-side links"
        />
        <StatTile
          label="Activated"
          value={num(summary.activated)}
          Icon={TrendingUpIcon}
          accent="muted"
          sub={pct(summary.activation_rate)}
        />
        <StatTile
          label="Paid"
          value={num(summary.subscribed)}
          Icon={CrownIcon}
          accent="muted"
          sub={`${pct(summary.paid_rate)} of referred`}
        />
        <StatTile
          label="Referral Revenue"
          value={usd(summary.revenue)}
          Icon={TrendingUpIcon}
          accent="muted"
          sub="confirmed payments"
        />
        <StatTile
          label="Rewards Earned"
          value={usd2(summary.commission)}
          Icon={CrownIcon}
          accent="muted"
          sub="advocate credit"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Referral funnel"
          sub="From share intent to confirmed payment"
        >
          <ReferralFunnel summary={summary} />
        </Panel>
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
      </div>
      <ReminderCenter
        reminders={referral?.reminders}
        onSend={onSend}
        onPause={onPause}
        sending={sending}
      />
      <AdvocateTable
        selectedId={selected?.user_id}
        onSelect={(advocate) =>
          setSelected(selected?.user_id === advocate.user_id ? null : advocate)
        }
        onResume={(a) => onPause(a, false)}
        refreshToken={referral}
      />
      <RelationshipLedger
        relationships={referral?.relationships || []}
        advocate={selected}
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
        <Overview data={data} />
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
