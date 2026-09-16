// Finance report — pick a period, read the recap, take the file.
//
// Two things here are decisions rather than layout:
//
// BASIS. "Date paid" counts money on the day it landed (verified_at); "date
// invoiced" counts it on the day the invoice was raised (created_at). Four
// confirmed payments differ between the two, and one lifetime is verified eight
// days BEFORE it was created — an admin recording money received earlier. So
// the basis genuinely moves revenue between months, and the report says which
// one it used rather than leaving the reader to assume.
//
// ROUTE. Derived per PAYMENT server-side, not from the account: the existing
// payments table flags "manual" from user.subscription_source, which marks
// every payment a once-manual user ever makes. The three routes are disjoint —
// claim link, recorded by admin, self-serve checkout.
import { useCallback, useMemo, useState } from "react";
import api from "../../../../services/authApi";
import { financeApi } from "../../../../services/financeApi";

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const monthStart = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
};
const monthEnd = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
};

const PRESETS = [
  { key: "30d", label: "Last 30 days", range: () => [daysAgo(29), today()] },
  { key: "90d", label: "Last 90 days", range: () => [daysAgo(89), today()] },
  { key: "mtd", label: "This month", range: () => [monthStart(), today()] },
  { key: "lastmo", label: "Last month", range: () => [monthStart(-1), monthEnd(-1)] },
  { key: "ytd", label: "Year to date", range: () => [new Date(new Date().getFullYear(), 0, 1), today()] },
];

const STATUS_CHOICES = [
  { key: "confirmed", label: "Confirmed only", hint: "What was actually earned" },
  { key: "confirmed,refunded", label: "Confirmed + refunded", hint: "Net of reversals" },
  { key: "all", label: "Every status", hint: "Includes pending, expired, cancelled" },
];

const money = (n) =>
  `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Stat = ({ label, value, sub, strong }) => (
  <div className="rounded-xl border border-ink/10 bg-surface-raised px-3.5 py-3">
    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">{label}</p>
    <p className={`mt-1 tabular-nums ${strong ? "text-[19px] font-bold" : "text-[15px] font-semibold"} text-text-primary`}>
      {value}
    </p>
    {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
  </div>
);

const Breakdown = ({ title, rows, total }) => {
  if (!rows?.length) return null;
  return (
    <div className="rounded-xl border border-ink/10 bg-surface-raised p-3.5">
      <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">{title}</p>
      <div className="space-y-1.5">
        {rows.map((b) => {
          const pct = total > 0 ? (b.net / total) * 100 : 0;
          return (
            <div key={b.key}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="truncate text-text-primary">{b.label}</span>
                <span className="shrink-0 tabular-nums text-text-secondary">
                  {money(b.net)} <span className="text-text-muted">· {b.count}</span>
                </span>
              </div>
              {/* The bar is the point of the breakdown — a column of numbers
                  makes you do the comparison yourself. */}
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/[0.07]">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function FinanceReportPanel({ onToast }) {
  const [start, setStart] = useState(iso(daysAgo(29)));
  const [end, setEnd] = useState(iso(today()));
  const [status, setStatus] = useState("confirmed");
  const [basis, setBasis] = useState("verified");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState(null);

  const applyPreset = (p) => {
    const [a, b] = p.range();
    setStart(iso(a));
    setEnd(iso(b));
    setReport(null);
  };

  const invalid = useMemo(() => new Date(end) < new Date(start), [start, end]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await financeApi.getReport({ start, end, status, basis }));
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Could not build the report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [start, end, status, basis]);

  const download = async (fmt) => {
    setDownloading(fmt);
    setError(null);
    try {
      const url = financeApi.reportExportUrl({ start, end, status, basis, fmt });
      const r = await api.get(url, { responseType: "blob" });
      const href = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = href;
      a.download = `luxquant-finance-${start}_${end}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      onToast?.(`${fmt.toUpperCase()} downloaded`);
    } catch (e) {
      // Never silent: a failed export that looks like a dead button is how
      // these get reported as "it doesn't work" with nothing to go on.
      setError(e?.response?.data?.detail || e?.message || `${fmt.toUpperCase()} export failed`);
    } finally {
      setDownloading(null);
    }
  };

  const s = report?.summary;

  return (
    <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-4">
      <div className="mb-3.5">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
          Reporting
        </p>
        <h3 className="font-display text-[15px] font-semibold text-text-primary">Period report</h3>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Full recap — plan, route, exchange, TX hash and referral — for any date range.
        </p>
      </div>

      {/* presets */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p)}
            className="rounded-full border border-ink/10 px-3 py-1.5 text-[11px] font-semibold text-text-secondary transition hover:border-ink/25 hover:text-text-primary"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* range + options */}
      <div className="mb-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-text-muted">From</span>
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => { setStart(e.target.value); setReport(null); }}
            className="w-full rounded-lg border border-ink/12 bg-surface-raised px-2.5 py-2 text-[13px] text-text-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-text-muted">To (inclusive)</span>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => { setEnd(e.target.value); setReport(null); }}
            className="w-full rounded-lg border border-ink/12 bg-surface-raised px-2.5 py-2 text-[13px] text-text-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-text-muted">Include</span>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setReport(null); }}
            className="w-full rounded-lg border border-ink/12 bg-surface-raised px-2.5 py-2 text-[13px] text-text-primary"
          >
            {STATUS_CHOICES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-wider text-text-muted">Count on</span>
          <select
            value={basis}
            onChange={(e) => { setBasis(e.target.value); setReport(null); }}
            className="w-full rounded-lg border border-ink/12 bg-surface-raised px-2.5 py-2 text-[13px] text-text-primary"
          >
            <option value="verified">Date paid</option>
            <option value="created">Date invoiced</option>
          </select>
        </label>
      </div>

      <p className="mb-3 text-[11px] leading-snug text-text-muted">
        {basis === "verified"
          ? "Counting on the day the money landed. A payment recorded later by an admin lands on its real date, not today's."
          : "Counting on the day the invoice was raised. Use this to match checkout activity, not cash received."}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={loading || invalid}
          className="rounded-lg bg-accent px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-accent-fg transition hover:brightness-[1.04] disabled:opacity-40"
        >
          {loading ? "Building…" : "Generate report"}
        </button>
        <button
          type="button"
          onClick={() => download("xlsx")}
          disabled={!!downloading || invalid}
          className="rounded-lg border border-ink/15 bg-ink/[0.08] px-3.5 py-2 text-[12px] font-semibold text-text-primary transition hover:bg-ink/[0.13] disabled:opacity-40"
        >
          {downloading === "xlsx" ? "Preparing…" : "Download Excel"}
        </button>
        <button
          type="button"
          onClick={() => download("pdf")}
          disabled={!!downloading || invalid}
          className="rounded-lg border border-ink/15 bg-ink/[0.08] px-3.5 py-2 text-[12px] font-semibold text-text-primary transition hover:bg-ink/[0.13] disabled:opacity-40"
        >
          {downloading === "pdf" ? "Preparing…" : "Download PDF"}
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          disabled={!!downloading || invalid}
          className="rounded-lg border border-ink/15 bg-ink/[0.08] px-3.5 py-2 text-[12px] font-semibold text-text-primary transition hover:bg-ink/[0.13] disabled:opacity-40"
        >
          {downloading === "csv" ? "Preparing…" : "CSV"}
        </button>
        {invalid && <span className="text-[11.5px] text-loss">End date is before the start date.</span>}
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-loss/30 bg-loss/10 px-3.5 py-2.5 text-[12.5px] text-text-primary">
          <span className="font-bold text-loss">Report failed</span> <span className="text-text-secondary">{error}</span>
        </div>
      )}

      {s?.split && (
        <div className="mb-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-3.5">
          <p className="mb-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
            Profit split
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-ink/10 bg-surface-raised px-3.5 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
                {s.split.partner_name} · {s.split.partner_pct}%
              </p>
              <p className="mt-1 text-[21px] font-bold tabular-nums text-text-primary">
                {money(s.split.partner_share)} <span className="text-[12px] font-medium text-text-muted">USDT</span>
              </p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-surface-raised px-3.5 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
                LuxQuant · {s.split.house_pct}%
              </p>
              <p className="mt-1 text-[21px] font-bold tabular-nums text-text-primary">
                {money(s.split.house_share)} <span className="text-[12px] font-medium text-text-muted">USDT</span>
              </p>
            </div>
          </div>
          {/* The waterfall, not just the answer — a partner share nobody can
              retrace is a number people argue about. It starts at the money
              received, not the list price: the discount is already out by then,
              and on an admin-recorded payment that field is really
              `plan price - amount actually paid`, so it carries a shortfall
              under a label that reads "discount". */}
          <div className="mt-2.5 space-y-1 border-t border-ink/10 pt-2.5 text-[12px]">
            {[
              ["Received", s.split.net_received],
              ["Less referral commission", -s.split.referral_commission],
              ["Distributable", s.split.distributable],
            ].map(([label, v], i) => (
              <div key={label} className={`flex justify-between ${i === 2 ? "font-bold text-text-primary" : "text-text-secondary"}`}>
                <span>{label}</span>
                <span className="tabular-nums">{v < 0 ? "−" : ""}{money(Math.abs(v))} USDT</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-muted">{s.split.basis_note}</p>
        </div>
      )}

      {s && (
        <div className="space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Net revenue" value={`${money(s.net_usdt)} USDT`} strong
                  sub={`${report.period.start} → ${report.period.end}`} />
            <Stat label="Payments" value={s.count} sub={`${s.unique_users} unique users`} />
            <Stat label="Gross" value={`${money(s.gross_usdt)} USDT`}
                  sub={s.discount_usdt ? `less ${money(s.discount_usdt)} discount` : "no discounts"} />
            <Stat label="Referred" value={`${s.referral.count}`}
                  sub={s.referral.count ? `${money(s.referral.commission_usdt)} commission owed` : "none in period"} />
          </div>

          {s.count === 0 ? (
            <p className="rounded-xl border border-ink/10 bg-surface-raised px-3.5 py-4 text-center text-[12.5px] text-text-muted">
              No payments in this period on this basis. Try a wider range, or switch “Include”.
            </p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <Breakdown title="By plan" rows={s.by_plan} total={s.net_usdt} />
              <Breakdown title="By route" rows={s.by_route} total={s.net_usdt} />
              <Breakdown title="By exchange" rows={s.by_exchange} total={s.net_usdt} />
              <Breakdown title="By method" rows={s.by_method} total={s.net_usdt} />
              <Breakdown title="By status" rows={s.by_status} total={s.net_usdt} />
              <Breakdown title="By network" rows={s.by_network} total={s.net_usdt} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
