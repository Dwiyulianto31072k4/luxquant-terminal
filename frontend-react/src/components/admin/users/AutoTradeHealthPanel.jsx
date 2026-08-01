// src/components/admin/users/AutoTradeHealthPanel.jsx
//
// Agent fleet health, collapsed by default like the other Users panels.
//
// Agent runs as a separate application against its own database, so until
// now "is this user's bot working?" could only be answered over SSH. This shows
// every linked bot, worst first, and opens the per-user detail (including the
// actual error text) in the user drawer.
//

import { useEffect, useState } from "react";
import { Surface } from "../primitives";
import { ChevronDownIcon, AlertTriangleIcon } from "../Icons";
import { adminApi } from "../../../services/adminApi";

const STATUS_STYLE = {
  error: { label: "Error", dot: "#F6465D", bg: "rgba(246,70,93,0.10)", fg: "#F6465D" },
  warn: { label: "Warning", dot: "#F0B90B", bg: "rgba(240,185,11,0.10)", fg: "#B8860B" },
  ok: { label: "Healthy", dot: "#0ECB81", bg: "rgba(14,203,129,0.10)", fg: "#0B9E65" },
  paused: { label: "Paused", dot: "#8B92A5", bg: "rgba(139,146,165,0.10)", fg: "#6B7280" },
  unlinked: { label: "Not linked", dot: "#C7CBD4", bg: "rgba(199,203,212,0.10)", fg: "#8B92A5" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.unlinked;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-black/[0.015] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-400">{label}</p>
      <p
        className="mt-1 text-[19px] font-semibold leading-none"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export const AutoTradeHealthPanel = ({ defaultOpen = false, onInspectUser }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    adminApi
      .getAutoTradeOverview()
      .then(setData)
      .catch((e) => setError(e?.message || "Could not load Agent health"))
      .finally(() => setLoading(false));
  }, [open, data, loading]);

  const totals = data?.totals || {};
  const problems = (totals.errors || 0) + (totals.warnings || 0);

  return (
    <Surface className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <AlertTriangleIcon
            size={16}
            style={{ color: totals.errors ? "#F6465D" : "#8B92A5" }}
          />
          <span className="text-[15px] font-semibold text-neutral-800">Agent health</span>
          {data?.available === false ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
              unavailable
            </span>
          ) : totals.errors ? (
            <span className="rounded-full bg-[rgba(246,70,93,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#F6465D]">
              {totals.errors} need attention
            </span>
          ) : data ? (
            <span className="rounded-full bg-[rgba(14,203,129,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#0B9E65]">
              all healthy
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          size={16}
          className={`text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-black/[0.06] px-5 py-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-[#F6465D]">{error}</p>
          ) : data?.available === false ? (
            <p className="text-sm text-neutral-500">
              The Agent database is not reachable from here, so bot health cannot be shown.
              Everything else on this page is unaffected.
            </p>
          ) : data ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <Metric label="Linked" value={totals.linked ?? 0} />
                <Metric label="Live bots" value={totals.live ?? 0} />
                <Metric
                  label="Errors"
                  value={totals.errors ?? 0}
                  tone={totals.errors ? "#F6465D" : undefined}
                />
                <Metric
                  label="Warnings"
                  value={totals.warnings ?? 0}
                  tone={totals.warnings ? "#B8860B" : undefined}
                />
                <Metric
                  label="Stuck positions"
                  value={totals.stuck_positions ?? 0}
                  tone={totals.stuck_positions ? "#F6465D" : undefined}
                />
                <Metric
                  label="Invalid keys"
                  value={totals.invalid_keys ?? 0}
                  tone={totals.invalid_keys ? "#F6465D" : undefined}
                />
              </div>

              {problems === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Every linked bot is running normally.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left">
                    <thead>
                      <tr className="border-b border-black/[0.06] font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-400">
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 pr-3 font-medium">User</th>
                        <th className="pb-2 pr-3 font-medium">Mode</th>
                        <th className="pb-2 pr-3 font-medium">Key</th>
                        <th className="pb-2 pr-3 text-right font-medium">Open</th>
                        <th className="pb-2 pr-3 text-right font-medium">Errors 24h</th>
                        <th className="pb-2 font-medium">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users
                        .filter((u) => u.status === "error" || u.status === "warn")
                        .map((u) => (
                          <tr
                            key={u.subject}
                            onClick={() => onInspectUser?.(u.luxquant_user_id)}
                            className={`border-b border-black/[0.04] text-[13px] ${
                              onInspectUser ? "cursor-pointer hover:bg-black/[0.02]" : ""
                            }`}
                          >
                            <td className="py-2.5 pr-3">
                              <StatusPill status={u.status} />
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-[12px] text-neutral-600">
                              {u.cryptobot_email || `lq:${u.luxquant_user_id}`}
                            </td>
                            <td className="py-2.5 pr-3 text-neutral-600">
                              {u.is_active ? (u.dry_run ? "Dry run" : "Live") : "Paused"}
                              {u.markets?.length ? (
                                <span className="text-neutral-400"> · {u.markets.join("+")}</span>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-3 text-neutral-600">{u.key_status || "—"}</td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-600">
                              {u.open_positions}
                            </td>
                            <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-600">
                              {u.recent_errors}
                            </td>
                            <td className="py-2.5 text-[12px] text-neutral-500">{u.reasons?.[0]}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {onInspectUser ? (
                    <p className="mt-3 text-[11px] text-neutral-400">
                      Click a row to open that user and read the full error detail.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
};

export default AutoTradeHealthPanel;
