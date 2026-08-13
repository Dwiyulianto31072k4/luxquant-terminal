// UsersOpsSection — single Gate shell for all ops/insights noise.
// Collapsed by default so Member Directory stays the focus.
// Sub-tabs: Queues · Ending soon · Reach · Agent

import { useMemo, useState } from "react";
import { OpsQueueBar } from "./OpsQueueBar";
import { ExpiringSoonPanel } from "./ExpiringSoonPanel";
import { ContactReachPanel } from "./ContactReachPanel";
import { AutoTradeHealthPanel } from "./AutoTradeHealthPanel";
import { ChevronDownIcon } from "../Icons";

const TABS = [
  { id: "queues", label: "Queues" },
  { id: "ending", label: "Ending soon" },
  { id: "reach", label: "Reach" },
  { id: "agent", label: "Agent" },
];

/**
 * @param {object} props
 * @param {object|null} props.stats
 * @param {object|null} props.contactStats
 * @param {Array} props.expiringUsers
 * @param {string|null} props.anomaly
 * @param {string|null} props.crm
 * @param {string|null} props.reach
 * @param {(key: string|null) => void} props.onAnomalyToggle
 * @param {(key: string|null) => void} props.onCrmToggle
 * @param {(reach: string|null) => void} props.onFilterReach
 * @param {(user: object) => void} [props.onExtend]
 * @param {(user: object) => void} [props.onDm]
 * @param {(id: number) => void} [props.onInspectUser]
 */
export function UsersOpsSection({
  stats,
  contactStats,
  expiringUsers = [],
  anomaly,
  crm,
  reach,
  onAnomalyToggle,
  onCrmToggle,
  onFilterReach,
  onExtend,
  onDm,
  onInspectUser,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("queues");

  const badges = useMemo(() => {
    const exp = expiringUsers?.length || stats?.expiring_soon || 0;
    const paidOut = stats?.anomaly_paid_outside || 0;
    const paidNoTg = stats?.anomaly_paid_no_tg || 0;
    const expiredIn = stats?.anomaly_expired_inside || 0;
    const anomalyTotal = paidOut + paidNoTg + expiredIn;
    return {
      ending: exp,
      anomalies: anomalyTotal,
      urgent: exp + anomalyTotal,
    };
  }, [stats, expiringUsers]);

  const summaryBits = [];
  if (badges.anomalies > 0) summaryBits.push(`${badges.anomalies} anomalies`);
  if (badges.ending > 0) summaryBits.push(`${badges.ending} ending soon`);
  if (contactStats?.total != null) {
    const pct = Math.round(
      ((contactStats.total - (contactStats.unreachable || 0)) / Math.max(1, contactStats.total)) *
        100
    );
    summaryBits.push(`${pct}% reachable`);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
      {/* Compact header — only this shows when collapsed */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight text-text-primary">
              Ops & insights
            </span>
            {badges.urgent > 0 && (
              <span className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-accent">
                {badges.urgent} need attention
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-text-muted">
            {summaryBits.length > 0
              ? summaryBits.join(" · ")
              : "Queues, expiring subs, reach & agent health"}
          </p>
        </div>
        <ChevronDownIcon
          size={16}
          className="shrink-0 text-text-muted transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div className="border-t border-ink/[0.06]">
          {/* Sub-tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-ink/[0.06] px-3 py-2.5">
            {TABS.map((t) => {
              const on = tab === t.id;
              const count =
                t.id === "ending"
                  ? badges.ending
                  : t.id === "queues"
                    ? badges.anomalies || null
                    : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    on
                      ? "bg-ink/[0.08] text-text-primary"
                      : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
                  }`}
                >
                  {t.label}
                  {count != null && count > 0 && (
                    <span
                      className={`rounded px-1 font-mono text-[10px] tabular-nums ${
                        on ? "text-text-primary/70" : "text-text-muted/70"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel body — nested panels lose outer chrome (we strip via class override) */}
          <div className="p-3 sm:p-3.5 [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none [&_>div]:rounded-none">
            {tab === "queues" && (
              <OpsQueueBar
                stats={stats}
                anomaly={anomaly}
                crm={crm}
                onAnomalyToggle={onAnomalyToggle}
                onCrmToggle={onCrmToggle}
              />
            )}
            {tab === "ending" && (
              <ExpiringSoonPanel
                expiringUsers={expiringUsers}
                onExtend={onExtend}
                onDm={onDm}
                forceOpen
              />
            )}
            {tab === "reach" && (
              <ContactReachPanel
                contactStats={contactStats}
                filterReach={reach}
                onFilterReach={onFilterReach}
                defaultOpen
                forceOpen
              />
            )}
            {tab === "agent" && (
              <AutoTradeHealthPanel
                defaultOpen
                forceOpen
                onInspectUser={onInspectUser}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UsersOpsSection;
