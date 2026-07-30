// src/components/admin/users/AutoTradeTab.jsx
//
// One user's AutoTrade bot, inside the user drawer.
//
// The reason this exists is the error list: "execution failed" told support
// nothing, and the real message lived in a database only reachable over SSH.
// Everything here is read-only.
//

import { useEffect, useState } from "react";
import { adminApi } from "../../../services/adminApi";

const STATUS_STYLE = {
  error: { label: "Error", bg: "rgba(246,70,93,0.10)", fg: "#F6465D" },
  warn: { label: "Warning", bg: "rgba(240,185,11,0.12)", fg: "#B8860B" },
  ok: { label: "Healthy", bg: "rgba(14,203,129,0.10)", fg: "#0B9E65" },
  paused: { label: "Paused", bg: "rgba(139,146,165,0.12)", fg: "#6B7280" },
  unlinked: { label: "Not linked", bg: "rgba(199,203,212,0.12)", fg: "#8B92A5" },
};

// Same wording the user sees on their own Activity tab, so support and customer
// are reading the same explanation.
const BLOCK_LABEL = {
  reconciliation_required: "Position needs reconciliation (blocks everything)",
  subscription_inactive: "Subscription not active (blocks everything)",
  daily_loss_limit: "Daily loss limit reached (blocks everything)",
  max_live_bots: "Server live-bot capacity reached",
  max_open_positions: "Max open positions reached",
  symbol_position_exists: "Already holding this symbol",
  max_trade_notional: "Trade size above per-trade cap",
  minimum_available_balance: "Minimum reserve would be breached",
  max_daily_trades: "Daily trade limit reached",
  loss_cooldown: "Cooling down after a loss",
  error_cooldown: "Cooling down after a failed trade",
  user_order_throttle: "Short-window order throttle",
};

const fmt = (value) => (value ? new Date(value).toLocaleString() : "—");
const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toFixed(2)}`;

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] py-2 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </span>
      <span className="text-right text-[13px] text-neutral-700">{children}</span>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div className="rounded-xl border border-black/[0.07] bg-white p-4">
      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-neutral-800">
        {title}
        {count !== undefined ? (
          <span className="rounded-full bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
            {count}
          </span>
        ) : null}
      </p>
      {children}
    </div>
  );
}

export const AutoTradeTab = ({ userId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    adminApi
      .getAutoTradeUser(userId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e?.message || "Could not load AutoTrade data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <p className="text-sm text-neutral-500">Loading AutoTrade data…</p>;
  if (error) return <p className="text-sm text-[#F6465D]">{error}</p>;
  if (data?.available === false)
    return (
      <p className="text-sm text-neutral-500">
        The AutoTrade database is not reachable from here.
      </p>
    );
  if (!data?.linked)
    return (
      <p className="text-sm text-neutral-500">
        This user has never connected an exchange account to AutoTrade.
      </p>
    );

  const s = data.summary;
  const style = STATUS_STYLE[s.status] || STATUS_STYLE.unlinked;

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl px-4 py-3"
        style={{ background: style.bg, border: `1px solid ${style.fg}33` }}
      >
        <p className="text-[13px] font-semibold" style={{ color: style.fg }}>
          {style.label}
        </p>
        <ul className="mt-1 space-y-0.5">
          {s.reasons?.map((r) => (
            <li key={r} className="text-[12px] leading-5 text-neutral-600">
              {r}
            </li>
          ))}
        </ul>
      </div>

      <Section title="Configuration">
        <Row label="Engine">{s.is_active ? "Active" : "Paused"}</Row>
        <Row label="Mode">{s.dry_run === null ? "—" : s.dry_run ? "Dry run" : "Live"}</Row>
        <Row label="Markets">{s.markets?.length ? s.markets.join(" + ") : "none enabled"}</Row>
        {s.markets?.includes("futures") ? <Row label="Leverage">{s.leverage ?? "—"}×</Row> : null}
        <Row label="API key">
          {s.key_status || "—"}
          <span className="ml-2 text-[11px] text-neutral-400">
            checked {fmt(s.key_checked_at)}
          </span>
        </Row>
      </Section>

      <Section title="Activity">
        <Row label="Open positions">{s.open_positions}</Row>
        <Row label="Awaiting reconciliation">
          <span style={s.stuck_positions ? { color: "#F6465D", fontWeight: 600 } : undefined}>
            {s.stuck_positions}
          </span>
        </Row>
        <Row label="Live entries (24h)">{s.recent_entries}</Row>
        <Row label="Blocked entries (24h)">{s.recent_blocks}</Row>
        <Row label="Realised PnL (all time)">
          <span style={{ color: s.realized_pnl_total >= 0 ? "#0B9E65" : "#F6465D" }}>
            {usd(s.realized_pnl_total)}
          </span>
        </Row>
      </Section>

      {data.errors?.length ? (
        <Section title="Recent errors" count={data.errors.length}>
          <div className="space-y-2">
            {data.errors.map((e, i) => (
              <div
                key={`${e.created_at}-${i}`}
                className="rounded-lg border border-[#F6465D]/20 bg-[#F6465D]/[0.04] px-3 py-2"
              >
                <p className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <span className="font-mono">{fmt(e.created_at)}</span>
                  {e.symbol ? (
                    <span className="rounded bg-black/[0.05] px-1.5 py-0.5 font-mono text-[10px]">
                      {e.symbol}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 break-words font-mono text-[11px] leading-[1.5] text-neutral-700">
                  {e.error || e.action}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {data.blocks?.length ? (
        <Section title="Why entries were blocked (7 days)" count={data.blocks.length}>
          <div className="space-y-1.5">
            {data.blocks.map((b) => (
              <div key={b.code} className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-neutral-700">
                  {BLOCK_LABEL[b.code] || b.code.replaceAll("_", " ")}
                </span>
                <span className="whitespace-nowrap font-mono text-[11px] text-neutral-500">
                  ×{b.hits} · {fmt(b.last_at)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {data.positions?.length ? (
        <Section title="Open positions" count={data.positions.length}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[12px]">
              <thead>
                <tr className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400">
                  <th className="pb-1.5 pr-2 font-medium">Symbol</th>
                  <th className="pb-1.5 pr-2 font-medium">Market</th>
                  <th className="pb-1.5 pr-2 text-right font-medium">Qty</th>
                  <th className="pb-1.5 pr-2 text-right font-medium">Entry</th>
                  <th className="pb-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((p, i) => (
                  <tr key={`${p.symbol}-${i}`} className="border-t border-black/[0.04]">
                    <td className="py-1.5 pr-2 font-medium text-neutral-700">{p.symbol}</td>
                    <td className="py-1.5 pr-2 text-neutral-500">{p.market_type}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-600">
                      {p.quantity}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-600">
                      {p.entry_price ?? "—"}
                    </td>
                    <td className="py-1.5">
                      <span
                        style={
                          p.status === "reconciliation_required"
                            ? { color: "#F6465D", fontWeight: 600 }
                            : undefined
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {data.alerts?.length ? (
        <Section title="Open alerts" count={data.alerts.length}>
          <div className="space-y-1.5">
            {data.alerts.map((a) => (
              <div key={a.alert_key} className="border-b border-black/[0.04] pb-1.5 last:border-0">
                <p className="text-[12px] font-medium text-neutral-700">
                  {a.title}
                  {a.occurrence_count > 1 ? (
                    <span className="ml-1.5 text-[10px] text-neutral-400">×{a.occurrence_count}</span>
                  ) : null}
                </p>
                <p className="text-[11px] leading-[1.5] text-neutral-500">{a.message}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
};

export default AutoTradeTab;
