// src/components/admin/workspace/EmailTab.jsx
//
// The sending domain, seen from the outside.
//
// Three questions, in the order they matter: is sending even on, is anything
// coming back bad, and who are we no longer allowed to write to. A dashboard
// that leads with volume flatters itself — the number that decides whether a
// young domain survives is the bounce rate, so that is the one with a
// threshold drawn on it.

import { useCallback, useEffect, useState } from "react";
import { workspaceApi } from "../../../services/workspaceApi";

// Mailbox providers act on complaint and bounce rates, not on absolute counts.
// Above ~2% a domain is being watched; above 5% it gets suspended. Those two
// numbers are why this is a threshold and not a colour picked by feel.
const BOUNCE_WARN = 2;
const BOUNCE_BAD = 5;

const STATUS_TONE = {
  sent: "text-text-primary",
  delivered: "text-accent",
  failed: "text-loss",
  bounced: "text-loss",
  complained: "text-loss",
  delayed: "text-text-muted",
};

function Stat({ label, value, sub, tone = "text-text-primary" }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-surface-raised p-3.5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <p className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-1 font-mono text-[10px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

function Switch({ on, label, hint }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${on ? "bg-accent" : "bg-loss"}`}
        aria-hidden="true"
      />
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-primary">
          {label} <span className={on ? "text-accent" : "text-loss"}>{on ? "on" : "off"}</span>
        </p>
        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-text-muted">{hint}</p>
      </div>
    </div>
  );
}

function when(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function EmailTab() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      setData(await workspaceApi.getEmailOverview(d));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load email overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days]);

  if (loading && !data) {
    return <p className="font-mono text-xs text-text-primary/50">Reading the send log…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-loss/20 bg-loss/[0.04] p-4">
        <p className="font-mono text-xs text-loss">{error}</p>
      </div>
    );
  }

  const rate = data?.bounce_rate ?? 0;
  const rateTone =
    rate >= BOUNCE_BAD ? "text-loss" : rate >= BOUNCE_WARN ? "text-accent" : "text-text-primary";
  const sup = data?.suppressions || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">
            Email delivery
          </h3>
          <p className="mt-1 font-mono text-[10px] text-text-primary/45">
            Last {data?.window_days || days} days · every send is logged, successes included
          </p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                days === d
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-ink/10 text-text-muted hover:bg-ink/[0.04]"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Sending is two switches. An operator staring at zero sends needs to
          know which one is off before looking anywhere else. */}
      <div className="grid gap-4 rounded-xl border border-ink/10 bg-surface-raised p-4 sm:grid-cols-2">
        <Switch
          on={!!data?.configured}
          label="Provider key"
          hint="RESEND_API_KEY on the VPS. Off means nothing can send at all."
        />
        <Switch
          on={!!data?.lifecycle_enabled}
          label="Lifecycle sending"
          hint="EMAIL_LIFECYCLE_ENABLED. Off means mail is built and then dropped."
        />
      </div>

      {/* Did any of it work. The sends were always visible and the outcome
          was not, which is how a channel keeps getting fed on faith. */}
      {data?.outreach ? (
        <div className="rounded-xl border border-ink/10 bg-surface-raised p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Outreach — did it come back
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Contacted" value={data.outreach.contacted ?? 0} sub="payment follow-ups" />
            <Stat label="Reopened" value={data.outreach.reopened ?? 0} sub="new invoice after contact" />
            <Stat
              label="Paid"
              value={data.outreach.paid ?? 0}
              sub="confirmed after contact"
              tone={data.outreach.paid ? "text-accent" : "text-text-primary"}
            />
            <Stat label="Still queued" value={data.outreach.waiting ?? 0} sub={`of ${data.outreach.total ?? 0}`} />
            <Stat label="Referral DMs" value={data.referral?.sent ?? 0} sub={`${data.referral?.failed ?? 0} failed`} />
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-text-muted">
            First contact {when(data.outreach.first_contact)}. A zero under Paid
            this soon means too early, not failed — signup to paid on this
            product lags weeks, so judge it against that clock rather than this
            week&apos;s.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sent" value={data?.sent ?? 0} sub="accepted by the provider" />
        <Stat
          label="Bounced / complained"
          value={data?.problem ?? 0}
          sub="reported back afterwards"
          tone={data?.problem ? "text-loss" : "text-text-primary"}
        />
        <Stat
          label="Bounce rate"
          value={`${rate}%`}
          sub={`warn ${BOUNCE_WARN}% · suspend ${BOUNCE_BAD}%`}
          tone={rateTone}
        />
        <Stat
          label="Suppressed"
          value={sup.total ?? 0}
          sub="never mailed again"
        />
      </div>

      {data?.by_kind?.length ? (
        <div className="overflow-x-auto rounded-xl border border-ink/10">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-ink/10 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 text-right font-medium">Sent</th>
                <th className="px-3 py-2 text-right font-medium">Failed</th>
                <th className="px-3 py-2 text-right font-medium">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {data.by_kind.map((r) => (
                <tr key={`${r.kind}-${r.category}`} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-3 py-2 font-mono text-[11px] text-text-primary">{r.kind}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-muted">{r.category}</td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums">{r.sent}</td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums text-text-muted">
                    {r.failed}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-[11px] tabular-nums ${
                      r.bounced + r.complained ? "text-loss" : "text-text-muted"
                    }`}
                  >
                    {r.bounced + r.complained}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="font-mono text-[11px] text-text-muted">
          Nothing sent in this window.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink/10 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Recent sends
          </p>
          <div className="mt-3 space-y-1.5">
            {(data?.recent || []).slice(0, 14).map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-[11px] text-text-primary">{r.email}</span>
                <span className="shrink-0 font-mono text-[10px] text-text-muted">{r.kind}</span>
                <span className={`shrink-0 font-mono text-[10px] ${STATUS_TONE[r.status] || ""}`}>
                  {r.status}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-text-muted">
                  {when(r.created_at)}
                </span>
              </div>
            ))}
            {!data?.recent?.length && (
              <p className="font-mono text-[11px] text-text-muted">Nothing yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-ink/10 p-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Suppression list
          </p>
          <p className="mt-1 font-mono text-[10px] text-text-muted">
            Unsubscribes and hard bounces. Receipts are still sent to these
            addresses — proof of a purchase is not something to opt out of.
          </p>
          <div className="mt-3 space-y-1.5">
            {(sup.recent || []).slice(0, 14).map((r) => (
              <div key={r.email} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-mono text-[11px] text-text-primary">{r.email}</span>
                <span className="shrink-0 font-mono text-[10px] text-text-muted">{r.reason}</span>
                <span className="shrink-0 font-mono text-[10px] text-text-muted">
                  {when(r.created_at)}
                </span>
              </div>
            ))}
            {!sup.recent?.length && (
              <p className="mt-2 font-mono text-[11px] text-text-muted">Nobody. Good.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
