// ════════════════════════════════════════════════════════════════════
// GrowthTab — revenue, retention & attribution intelligence.
// Read-only; all figures derived from payments/subscriptions/referrals.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { growthApi } from "../../../services/growthApi";
import { StatTile, Surface, Bar3D, Avatar, Spinner, EmptyState } from "../primitives";
import { TrendingUpIcon, UsersIcon, CrownIcon, ClockIcon, RefreshIcon, ShieldIcon } from "../Icons";

/* ── Helpers ──────────────────────────────────────────────────────── */

const usd = (n) => `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const usd2 = (n) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString("en-US");
const signedPct = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const monthLabel = (m) => {
  if (!m) return "";
  const d = new Date(`${m}-01T00:00:00Z`);
  return d.toLocaleDateString("en", { month: "short" });
};
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
    : "—";

const SOURCE_LABEL = {
  payment: "On-chain payment",
  legacy: "Legacy member",
  lifetime: "Lifetime",
  admin: "Admin grant",
  telegram_vip: "Telegram VIP",
  discord_premium: "Discord premium",
  manual: "Manual payment",
};

/* ── Revenue trend (inline 12-month bars) ─────────────────────────── */

const RevenueTrend = ({ trend }) => {
  const max = Math.max(...trend.map((t) => t.revenue), 1);
  if (!trend.length) {
    return <p className="py-6 text-center text-[11px] text-text-muted">No revenue recorded yet.</p>;
  }
  return (
    <div className="flex h-40 items-end gap-1.5 pt-2">
      {trend.map((t) => {
        const h = Math.max((t.revenue / max) * 100, 2);
        return (
          <div key={t.month} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-ink/30 transition-all"
                style={{ height: `${h}%` }}
                title={`${t.month}: ${usd(t.revenue)} · ${t.count} payments`}
              />
            </div>
            <span className="text-[8.5px] tabular-nums text-text-muted/70">
              {monthLabel(t.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* ── Attribution / referral tables ────────────────────────────────── */

const SourceTable = ({ bySource }) => {
  const maxRev = Math.max(...bySource.map((s) => s.revenue), 1);
  if (!bySource.length)
    return <p className="py-4 text-center text-[11px] text-text-muted">No source data.</p>;
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

const ReferralTable = ({ referral }) => {
  const rows = referral?.top_referrers || [];
  if (!rows.length)
    return <p className="py-4 text-center text-[11px] text-text-muted">No referrals yet.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div
          key={r.username + i}
          className="flex items-center gap-2.5 rounded-xl border border-ink/[0.06] bg-surface-secondary/30 px-2.5 py-2.5"
        >
          <span className="w-4 text-center font-mono text-[11px] font-bold tabular-nums text-text-muted">
            {i + 1}
          </span>
          <Avatar name={r.username} tone="rgb(var(--fg-muted))" size="xs" />
          <span className="flex-1 truncate text-[12px] font-medium text-text-primary">
            @{r.username}
          </span>
          <span className="text-[11px] tabular-nums text-text-muted">{num(r.referred)} ref</span>
          <span className="w-16 text-right text-[11px] font-semibold tabular-nums text-profit">
            {usd2(r.commission)}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── Churn-risk list ──────────────────────────────────────────────── */

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
              <p className="truncate text-xs font-medium text-text-primary">@{u.username}</p>
              <p className="text-[10px] text-text-muted">Renews {fmtDate(u.expires_at)}</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-loss/25 bg-loss/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-loss">
            <ClockIcon size={9} />
            {u.days_inactive == null ? "never active" : `${u.days_inactive}d quiet`}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── Panel wrapper ────────────────────────────────────────────────── */

const Panel = ({ title, sub, children, right, className = "" }) => (
  <Surface variant="premium" hover={false} padding="p-5" className={className}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[14px] font-semibold tracking-tight text-text-primary">{title}</h3>
        {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </Surface>
);

/* ════════════════════════════════════════════════════════════════════
 Main
 ════════════════════════════════════════════════════════════════════ */

export const GrowthTab = () => {
  const [data, setData] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGrowth = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [growth, conv] = await Promise.all([
        workspaceApi.getGrowth(),
        growthApi.getConversion(30).catch(() => null),
      ]);
      setData(growth);
      setConversion(conv);
    } catch (e) {
      console.error("Failed to load growth analytics:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGrowth();
  }, [fetchGrowth]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} />
      </div>
    );
  }

  const rev = data?.revenue || {};
  const rec = data?.recurring || {};
  const churn = data?.churn || {};
  const attr = data?.attribution || {};
  const u = conversion?.users || {};
  const fun = conversion?.funnel_events || {};
  const rates = conversion?.rates || {};
  const act = conversion?.activity || {};
  const pct = (n) => (n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Growth · Revenue, retention &amp; attribution
          </p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Growth &amp; Revenue
          </h2>
          <p className="mt-0.5 max-w-lg text-[12px] text-text-muted">
            Revenue, recurring run-rate, churn, and where your paying members come from.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchGrowth(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-ink/14 disabled:opacity-50"
        >
          <RefreshIcon size={12} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Login conversion (30d) */}
      {conversion && (
        <Panel
          title="Login conversion · 30d"
          sub="Landing funnel events + account quality (one-shot vs multi-login)."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Signups" value={num(u.signups)} Icon={UsersIcon} accent="muted" />
            <StatTile
              label="One-shot rate"
              value={pct(u.one_shot_rate)}
              Icon={ClockIcon}
              accent="muted"
              sub={`${num(u.signups_one_shot)} users`}
            />
            <StatTile
              label="Multi-login rate"
              value={pct(u.multi_login_rate)}
              Icon={TrendingUpIcon}
              accent="muted"
              sub={`${num(u.signups_multi_login)} users`}
            />
            <StatTile label="WAU (activity)" value={num(act.wau)} Icon={UsersIcon} accent="muted" />
            <StatTile
              label="Landing views"
              value={num(fun.landing_view)}
              Icon={UsersIcon}
              accent="muted"
            />
            <StatTile
              label="CTA → auth start"
              value={pct(rates.auth_start_per_cta)}
              Icon={TrendingUpIcon}
              accent="muted"
              sub={`${num(fun.cta_click)} CTAs · ${num(fun.auth_start)} starts`}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Auth providers</p>
              <p className="mt-1 text-[12px] text-text-primary">
                Google {num(u.by_provider?.google)} · TG {num(u.by_provider?.telegram)} · Discord{" "}
                {num(u.by_provider?.discord)}
              </p>
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Client funnel</p>
              <p className="mt-1 text-[12px] text-text-primary">
                Views {num(fun.landing_view)} → CTA {num(fun.cta_click)} → Auth{" "}
                {num(fun.auth_start)} → OK {num(fun.auth_success)}
              </p>
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Soft gates</p>
              <p className="mt-1 text-[12px] text-text-primary">
                Shown {num(fun.soft_gate_shown)} · Login click {num(fun.soft_gate_login_click)}
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* Revenue KPIs */}
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
          sub={rev.mom_pct == null ? "vs prev 30d" : `${signedPct(rev.mom_pct)} vs prev 30d`}
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

      {/* Revenue trend + churn */}
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
            <MiniStat label="Active Subs" value={num(churn.active_subs)} tone="profit" />
            <MiniStat label="Lapsed · 30d" value={num(churn.lapsed_30d)} tone="loss" />
            <MiniStat
              label="Churn Rate"
              value={`${(churn.churn_rate ?? 0).toFixed(1)}%`}
              tone="accent"
            />
            <MiniStat label="Payments · 30d" value={num(churn.payments_30d)} tone="muted" />
          </div>
        </Panel>
      </div>

      {/* Attribution + referral */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue by source" sub="Where paying members come from">
          <SourceTable bySource={attr.by_source || []} />
        </Panel>
        <Panel
          title="Referral leaderboard"
          sub="Top advocates by referrals brought in"
          right={
            <span className="text-[10px] tabular-nums text-text-muted">
              {num(attr.referral?.total_referred)} total
            </span>
          }
        >
          <ReferralTable referral={attr.referral} />
        </Panel>
      </div>

      {/* Churn risk */}
      <Panel
        title="Churn risk"
        sub="Paying members who've gone quiet — reach out before they lapse"
      >
        <ChurnRisk risk={data?.health?.churn_risk || []} />
      </Panel>
    </div>
  );
};

const MiniStat = ({ label, value, tone = "muted" }) => {
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
      <p className="text-xl font-bold leading-none tabular-nums text-text-primary">{value}</p>
      <span className={`mt-2 inline-block h-0.5 w-6 rounded-full ${bar}`} />
    </div>
  );
};

export default GrowthTab;
