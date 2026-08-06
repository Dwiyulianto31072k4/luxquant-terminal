// ════════════════════════════════════════════════════════════════════
// ConversionTab — visitor → login acquisition funnel (User Management orbit)
// Backed by GET /api/v1/workspace/growth/conversion
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { growthApi } from "../../../services/growthApi";
import { StatTile, Surface, Spinner } from "../primitives";
import { TrendingUpIcon, UsersIcon, ClockIcon, RefreshIcon } from "../Icons";

const num = (n) => Number(n || 0).toLocaleString("en-US");
const pct = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : `${(Number(n) * 100).toFixed(1)}%`);

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

const FunnelStep = ({ label, value, sub, isLast }) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <div className="min-w-0 flex-1 rounded-xl border border-ink/[0.07] bg-surface-secondary/40 px-3 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-text-primary">{num(value)}</p>
      {sub && <p className="mt-0.5 text-[10px] text-text-muted">{sub}</p>}
    </div>
    {!isLast && (
      <span className="hidden shrink-0 text-text-muted/50 sm:inline" aria-hidden>
        →
      </span>
    )}
  </div>
);

const DailyBars = ({ days = [] }) => {
  if (!days.length) {
    return <p className="py-8 text-center text-[11px] text-text-muted">No signups in this window yet.</p>;
  }
  const max = Math.max(...days.map((d) => d.signups), 1);
  return (
    <div className="flex h-36 items-end gap-0.5 pt-2 sm:gap-1">
      {days.map((d) => {
        const h = Math.max((d.signups / max) * 100, d.signups > 0 ? 4 : 1);
        const label = String(d.day).slice(5); // MM-DD
        return (
          <div key={d.day} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-accent/70 transition-all group-hover:bg-accent"
                style={{ height: `${h}%` }}
                title={`${d.day}: ${d.signups} signups`}
              />
            </div>
            <span className="hidden text-[8px] tabular-nums text-text-muted/70 sm:block">{label}</span>
          </div>
        );
      })}
    </div>
  );
};

const SourceRows = ({ rows = [] }) => {
  if (!rows.length) {
    return <p className="py-4 text-center text-[11px] text-text-muted">No CTA clicks tracked yet.</p>;
  }
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.source} className="flex items-center gap-3">
          <p className="w-36 min-w-0 truncate text-[11.5px] font-medium text-text-primary" title={r.source}>
            {r.source}
          </p>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full bg-accent/60"
              style={{ width: `${Math.max((r.n / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-text-primary">
            {num(r.n)}
          </span>
        </div>
      ))}
    </div>
  );
};

export const ConversionTab = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await growthApi.getConversion(days);
        setData(res);
      } catch (e) {
        console.error("Failed to load conversion:", e);
        setError(e?.response?.data?.detail || e?.message || "Failed to load conversion data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} />
      </div>
    );
  }

  const u = data?.users || {};
  const fun = data?.funnel_events || {};
  const rates = data?.rates || {};
  const act = data?.activity || {};
  const ctaSources = data?.cta_by_source || [];
  const daily = u.daily_signups || [];

  const softShown = fun.soft_gate_shown || 0;
  const softClick = fun.soft_gate_login_click || 0;
  const softCtr = softShown > 0 ? softClick / softShown : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Users · Acquisition quality
          </p>
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Login conversion
          </h2>
          <p className="mt-0.5 max-w-xl text-[12px] text-text-muted">
            Landing → CTA → auth → account quality. Pair with Cloudflare UV for visitor→signup rate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-ink/[0.08] bg-surface-raised p-0.5"
            role="group"
            aria-label="Window"
          >
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  days === d
                    ? "bg-ink/[0.08] text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-ink/14 disabled:opacity-50"
          >
            <RefreshIcon size={12} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-loss/25 bg-loss/10 px-4 py-3 text-[12px] text-loss">
          {error}
        </div>
      )}

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Signups" value={num(u.signups)} Icon={UsersIcon} accent="muted" sub={`${days}d window`} />
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
        <StatTile
          label="Any login"
          value={num(u.any_login_window)}
          Icon={UsersIcon}
          accent="muted"
          sub={`${num(u.login_7d)} in 7d · ${num(u.login_24h)} 24h`}
        />
        <StatTile label="WAU activity" value={num(act.wau)} Icon={UsersIcon} accent="muted" sub={`DAU ${num(act.dau)} · MAU ${num(act.mau)}`} />
        <StatTile
          label="Soft-gate CTR"
          value={pct(softCtr)}
          Icon={TrendingUpIcon}
          accent="muted"
          sub={`${num(softClick)} / ${num(softShown)}`}
        />
      </div>

      {/* Client funnel steps */}
      <Panel
        title="Client funnel"
        sub="Events from landing + login (table funnel_events). Empty until traffic hits the new tracking."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <FunnelStep label="Landing views" value={fun.landing_view} />
          <FunnelStep
            label="CTA clicks"
            value={fun.cta_click}
            sub={rates.cta_per_landing != null ? `${pct(rates.cta_per_landing)} of views` : null}
          />
          <FunnelStep
            label="Auth start"
            value={fun.auth_start}
            sub={rates.auth_start_per_cta != null ? `${pct(rates.auth_start_per_cta)} of CTAs` : null}
          />
          <FunnelStep
            label="Auth success"
            value={fun.auth_success}
            sub={rates.auth_success_per_start != null ? `${pct(rates.auth_success_per_start)} of starts` : null}
            isLast
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Auth page views</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(fun.auth_page_view)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Auth errors</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(fun.auth_error)}
            </p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Post-login land</p>
            <p className="mt-1 text-[13px] font-semibold tabular-nums text-text-primary">
              {num(fun.post_login_land)}
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Daily signups" sub={`New accounts · last ${days} days`}>
          <DailyBars days={daily} />
        </Panel>
        <Panel title="CTA sources" sub="Where landing clicks come from">
          <SourceRows rows={ctaSources} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Signup by provider" sub="Auth method on new accounts">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { k: "google", label: "Google" },
              { k: "telegram", label: "Telegram" },
              { k: "discord", label: "Discord" },
            ].map((p) => (
              <div
                key={p.k}
                className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-3 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-text-muted">{p.label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {num(u.by_provider?.[p.k])}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-text-muted">
            Referred signups: <span className="font-semibold text-text-primary">{num(u.referred)}</span>
          </p>
        </Panel>

        <Panel title="Soft gate" sub="Top Gainers free preview limit (landing)">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Shown</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{num(softShown)}</p>
            </div>
            <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary/40 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Login click</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{num(softClick)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            Target CTR ≥ 25%. Low CTR → improve offer copy; high shown + low signups → auth friction.
          </p>
        </Panel>
      </div>

      <p className="text-center text-[10px] text-text-muted">
        As of {data?.as_of ? new Date(data.as_of).toLocaleString() : "—"} · window {data?.window_days ?? days}d
        · SQL pack: docs/growth/conversion-weekly.sql
      </p>
    </div>
  );
};

export default ConversionTab;
