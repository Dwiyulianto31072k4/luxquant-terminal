// src/components/admin/users/OpsQueueBar.jsx
//
// Compact ERP-style ops strip above the directory workspace.
// Surfaces cross-domain queues (finance payment gaps) + anomaly/CRM chips
// without stacking full panels that push the table down.
//

import { useState, useEffect } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { palette, tint } from '../designSystem';
import { AlertTriangleIcon, DollarIcon } from '../Icons';

const ANOMALY_CHIPS = [
  {
    key: 'paid_outside',
    statKey: 'anomaly_paid_outside',
    label: 'Paid, outside group',
    hint: 'Active access + linked Telegram, but not in VIP group → send invite',
    color: palette.gold[300],
  },
  {
    key: 'paid_no_tg',
    statKey: 'anomaly_paid_no_tg',
    label: 'Paid, no Telegram',
    hint: 'Active access but no Telegram linked → ask them to connect TG',
    color: '#5aa9e6',
  },
  {
    key: 'expired_inside',
    statKey: 'anomaly_expired_inside',
    label: 'Expired, still in group',
    hint: 'Subscription expired but still inside VIP group → should be kicked',
    color: palette.red[400],
  },
];

const CRM_CHIPS = [
  {
    key: 'untouched',
    label: 'Untracked',
    hint: 'No follow-up yet — needs first outreach',
    color: '#8a7a6e',
  },
  {
    key: 'open',
    label: 'In progress',
    hint: 'Has an active follow-up (pending / in progress)',
    color: palette.amber?.[400] || '#fbbf24',
  },
  {
    key: 'tracked',
    label: 'Tracked',
    hint: 'Followed up & resolved',
    color: palette.green[400],
  },
];

const Chip = ({ active, color, disabled, title, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
    style={{
      background: active ? tint(color, 0.18) : tint(color, 0.06),
      color,
      border: `1px solid ${tint(color, active ? 0.45 : 0.18)}`,
      opacity: disabled ? 0.4 : 1,
      cursor: disabled ? 'default' : 'pointer',
      transition: 'all 0.15s ease',
    }}
  >
    {children}
  </button>
);

/**
 * Jump to Finance tab + expand payment-gap queue (ERP domain separation).
 * AdminWorkspacePage only reads known tab hashes, so we keep #finance and
 * hand off intent via sessionStorage for PaymentAuditPanel to pick up.
 */
const goFinancePaymentAudit = () => {
  try {
    sessionStorage.setItem('luxquant.openPaymentAudit', '1');
  } catch {
    /* ignore */
  }
  window.location.hash = 'finance';
};

export const OpsQueueBar = ({
  stats,
  anomaly,
  crm,
  onAnomalyToggle,
  onCrmToggle,
}) => {
  const [payGap, setPayGap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await workspaceApi.getPaymentAudit();
        if (!cancelled) setPayGap(data?.summary?.pending ?? data?.users?.length ?? 0);
      } catch {
        if (!cancelled) setPayGap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="rounded-xl px-3 py-2.5 flex flex-col gap-2.5"
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Cross-domain queue → Finance */}
      {payGap != null && payGap > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[9.5px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Finance queue
          </span>
          <button
            type="button"
            onClick={goFinancePaymentAudit}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold"
            style={{
              background: tint(palette.red[400], 0.1),
              color: palette.red[400],
              border: `1px solid ${tint(palette.red[400], 0.3)}`,
            }}
            title="Open Finance → Payment gap queue"
          >
            <span className="relative inline-flex">
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-40"
                style={{ background: palette.red[400] }}
              />
              <DollarIcon size={12} className="relative" />
            </span>
            {payGap} user tanpa record bayar
            <span style={{ opacity: 0.7 }}>→ Finance</span>
          </button>
        </div>
      )}

      {/* Anomalies + CRM in one compact row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="text-[9.5px] uppercase tracking-[0.14em] font-semibold mr-0.5"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Anomalies
          </span>
          {ANOMALY_CHIPS.map((chip) => {
            const count = stats?.[chip.statKey] ?? 0;
            const isActive = anomaly === chip.key;
            return (
              <Chip
                key={chip.key}
                active={isActive}
                color={chip.color}
                disabled={count === 0}
                title={chip.hint}
                onClick={() => onAnomalyToggle(isActive ? null : chip.key)}
              >
                <AlertTriangleIcon size={11} />
                <span>{chip.label}</span>
                <span
                  className="tabular-nums font-bold px-1 py-px rounded-full text-[10px]"
                  style={{ background: tint(chip.color, 0.2) }}
                >
                  {count}
                </span>
              </Chip>
            );
          })}
        </div>

        <span
          className="hidden sm:inline-block w-px h-4"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="text-[9.5px] uppercase tracking-[0.14em] font-semibold mr-0.5"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            CRM
          </span>
          {CRM_CHIPS.map((chip) => {
            const isActive = crm === chip.key;
            return (
              <Chip
                key={chip.key}
                active={isActive}
                color={chip.color}
                title={chip.hint}
                onClick={() => onCrmToggle(isActive ? null : chip.key)}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 5, height: 5, background: chip.color }}
                />
                {chip.label}
              </Chip>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OpsQueueBar;
