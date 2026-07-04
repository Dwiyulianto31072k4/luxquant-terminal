// ════════════════════════════════════════════════════════════════════
// GrowthTab — revenue, retention & attribution intelligence.
// Read-only; all figures derived from payments/subscriptions/referrals.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { StatTile, Surface, Eyebrow, Bar3D, Avatar, Spinner, EmptyState } from '../primitives';
import { palette, tint } from '../designSystem';
import {
  TrendingUpIcon,
  UsersIcon,
  CrownIcon,
  ClockIcon,
  RefreshIcon,
  ShieldIcon,
} from '../Icons';

/* ── Helpers ──────────────────────────────────────────────────────── */

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString('en-US');
const signedPct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
const monthLabel = (m) => {
  if (!m) return '';
  const d = new Date(`${m}-01T00:00:00Z`);
  return d.toLocaleDateString('en', { month: 'short' });
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

const SOURCE_LABEL = {
  payment: 'On-chain payment',
  legacy: 'Legacy member',
  lifetime: 'Lifetime',
  admin: 'Admin grant',
  telegram_vip: 'Telegram VIP',
  discord_premium: 'Discord premium',
  manual: 'Manual payment',
};

/* ── Revenue trend (inline 12-month bars) ─────────────────────────── */

const RevenueTrend = ({ trend }) => {
  const max = Math.max(...trend.map((t) => t.revenue), 1);
  if (!trend.length) {
    return <p className="text-[11px] py-6 text-center" style={{ color: '#6b5c52' }}>No revenue recorded yet.</p>;
  }
  return (
    <div className="flex items-end gap-1.5 h-40 pt-2">
      {trend.map((t) => {
        const h = Math.max((t.revenue / max) * 100, 2);
        return (
          <div key={t.month} className="flex-1 flex flex-col items-center gap-1.5 group min-w-0">
            <div className="relative w-full flex-1 flex items-end">
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${h}%`,
                  background: 'linear-gradient(180deg, #f0d890, #d4a853 60%, #8b6914)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
                title={`${t.month}: ${usd(t.revenue)} · ${t.count} payments`}
              />
            </div>
            <span className="text-[8.5px] tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
  if (!bySource.length) return <p className="text-[11px] py-4 text-center" style={{ color: '#6b5c52' }}>No source data.</p>;
  return (
    <div className="space-y-2.5">
      {bySource.map((s) => (
        <div key={s.source} className="flex items-center gap-3">
          <div className="w-28 shrink-0 min-w-0">
            <p className="text-[11.5px] font-medium text-white truncate">{SOURCE_LABEL[s.source] || s.source}</p>
            <p className="text-[9px]" style={{ color: '#6b5c52' }}>{num(s.users)} users</p>
          </div>
          <Bar3D pct={(s.revenue / maxRev) * 100} heightClass="h-2" />
          <span className="w-16 text-right text-[12px] font-bold tabular-nums text-white">{usd(s.revenue)}</span>
        </div>
      ))}
    </div>
  );
};

const ReferralTable = ({ referral }) => {
  const rows = referral?.top_referrers || [];
  if (!rows.length) return <p className="text-[11px] py-4 text-center" style={{ color: '#6b5c52' }}>No referrals yet.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.username + i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <span className="w-4 text-[11px] font-bold tabular-nums text-center" style={{ color: i < 3 ? palette.gold[300] : 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
          <Avatar name={r.username} tone={palette.gold[300]} size="xs" />
          <span className="flex-1 text-[12px] font-medium text-white truncate">@{r.username}</span>
          <span className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{num(r.referred)} ref</span>
          <span className="w-16 text-right text-[11px] font-semibold tabular-nums" style={{ color: palette.green[400] }}>{usd2(r.commission)}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Churn-risk list ──────────────────────────────────────────────── */

const ChurnRisk = ({ risk }) => {
  if (!risk.length) {
    return <EmptyState Icon={ShieldIcon} tone={palette.green[400]} title="No at-risk subscribers" description="Every paying member has been active recently." />;
  }
  return (
    <div className="space-y-1.5">
      {risk.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={u.username} tone={palette.red[400]} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">@{u.username}</p>
              <p className="text-[10px]" style={{ color: '#6b5c52' }}>Renews {fmtDate(u.expires_at)}</p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums px-2 py-0.5 rounded shrink-0"
            style={{ background: tint(palette.red[400], 0.1), color: palette.red[400], border: `1px solid ${tint(palette.red[400], 0.25)}` }}
          >
            <ClockIcon size={9} />
            {u.days_inactive == null ? 'never active' : `${u.days_inactive}d quiet`}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── Panel wrapper ────────────────────────────────────────────────── */

const Panel = ({ title, sub, children, right, className = '' }) => (
  <Surface variant="premium" hover={false} padding="p-5" className={className}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="text-[14px] font-semibold text-white tracking-tight">{title}</h3>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: '#8a7a6e' }}>{sub}</p>}
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGrowth = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setData(await workspaceApi.getGrowth());
    } catch (e) {
      console.error('Failed to load growth analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchGrowth(); }, [fetchGrowth]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={18} tone={palette.green[400]} />
      </div>
    );
  }

  const rev = data?.revenue || {};
  const rec = data?.recurring || {};
  const churn = data?.churn || {};
  const attr = data?.attribution || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="mb-2"><Eyebrow>Business Intelligence</Eyebrow></div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Growth &amp; Revenue</h2>
          <p className="text-[11px] mt-0.5 max-w-lg" style={{ color: '#8a7a6e' }}>
            Revenue, recurring run-rate, churn, and where your paying members come from.
          </p>
        </div>
        <button
          onClick={() => fetchGrowth(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
          style={{ background: tint(palette.green[400], 0.08), color: palette.green[400], border: `1px solid ${tint(palette.green[400], 0.25)}` }}
        >
          <RefreshIcon size={12} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Total Revenue" value={usd(rev.total)} Icon={TrendingUpIcon} accent="green" sub={`${num(rev.payment_count)} payments`} />
        <StatTile
          label="Revenue · 30d"
          value={usd(rev.last_30d)}
          Icon={TrendingUpIcon}
          accent="gold"
          sub={rev.mom_pct == null ? 'vs prev 30d' : `${signedPct(rev.mom_pct)} vs prev 30d`}
        />
        <StatTile label="ARPU · 30d" value={usd2(rec.arpu_30d)} Icon={UsersIcon} accent="blue" sub="per active sub" />
        <StatTile label="LTV (proxy)" value={usd(rev.ltv)} Icon={CrownIcon} accent="purple" sub="rev / paying user" />
        <StatTile label="Avg Order" value={usd2(rev.aov)} Icon={TrendingUpIcon} accent="teal" sub="per payment" />
        <StatTile label="Paying Users" value={num(rev.paying_customers)} Icon={UsersIcon} accent="gold" />
      </div>

      {/* Revenue trend + churn */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Revenue trend" sub="Confirmed revenue, last 12 months" className="lg:col-span-2">
          <RevenueTrend trend={rev.trend || []} />
        </Panel>
        <Panel title="Retention" sub="Subscription health, last 30 days">
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStat label="Active Subs" value={num(churn.active_subs)} tone={palette.green[400]} />
            <MiniStat label="Lapsed · 30d" value={num(churn.lapsed_30d)} tone={palette.red[400]} />
            <MiniStat label="Churn Rate" value={`${(churn.churn_rate ?? 0).toFixed(1)}%`} tone={palette.orange[400]} />
            <MiniStat label="Payments · 30d" value={num(churn.payments_30d)} tone={palette.blue[400]} />
          </div>
        </Panel>
      </div>

      {/* Attribution + referral */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Revenue by source" sub="Where paying members come from">
          <SourceTable bySource={attr.by_source || []} />
        </Panel>
        <Panel
          title="Referral leaderboard"
          sub="Top advocates by referrals brought in"
          right={<span className="text-[10px] tabular-nums" style={{ color: '#8a7a6e' }}>{num(attr.referral?.total_referred)} total</span>}
        >
          <ReferralTable referral={attr.referral} />
        </Panel>
      </div>

      {/* Churn risk */}
      <Panel title="Churn risk" sub="Paying members who've gone quiet — reach out before they lapse">
        <ChurnRisk risk={data?.health?.churn_risk || []} />
      </Panel>
    </div>
  );
};

const MiniStat = ({ label, value, tone }) => (
  <div className="rounded-lg px-3 py-2.5" style={{ background: '#0a0805', border: '1px solid rgba(255,255,255,0.07)' }}>
    <p className="text-[9.5px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
    <p className="text-xl font-bold tabular-nums leading-none" style={{ color: '#fff' }}>{value}</p>
    <span className="inline-block w-6 h-0.5 rounded-full mt-2" style={{ background: tone }} />
  </div>
);

export default GrowthTab;
