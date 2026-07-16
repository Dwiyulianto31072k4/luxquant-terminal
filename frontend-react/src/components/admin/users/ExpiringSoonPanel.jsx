// src/components/admin/users/ExpiringSoonPanel.jsx
//
// Surfaces subscribers whose access is about to lapse. Collapsible
// (collapsed by default to keep the page calm). Each row has a quick
// "DM" shortcut (opens the send-message flow) and an "Extend" action
// that opens the GrantModal.
//

import { useState } from 'react';
import { Surface, Avatar } from '../primitives';
import { palette, tint } from '../designSystem';
import { AlertTriangleIcon, ClockIcon, SendIcon, ChevronDownIcon } from '../Icons';

export const ExpiringSoonPanel = ({ expiringUsers, onExtend, onDm }) => {
  const [open, setOpen] = useState(false); // collapsed by default
  if (!expiringUsers || expiringUsers.length === 0) return null;

  return (
    <Surface variant="premium" hover={false} padding="p-0">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="relative inline-flex">
          {!open && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-40"
              style={{ background: palette.orange[400] }}
            />
          )}
          <AlertTriangleIcon size={14} style={{ color: palette.orange[400] }} className="relative" />
        </span>
        <h3 className="text-xs font-bold tracking-tight" style={{ color: palette.orange[400] }}>
          Subscriptions ending soon
        </h3>
        <span
          className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
          style={{
            background: tint(palette.orange[400], 0.15),
            color: palette.orange[400],
            border: `1px solid ${tint(palette.orange[400], 0.3)}`,
          }}
        >
          {expiringUsers.length}
        </span>
        <ChevronDownIcon
          size={15}
          className="ml-auto transition-transform duration-200"
          style={{ color: 'rgba(255,255,255,0.4)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {/* List (only when expanded) */}
      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {expiringUsers.slice(0, 5).map(({ user: u, days_remaining }) => {
            const urgency = days_remaining <= 3 ? palette.red[400] : palette.orange[400];
            return (
              <div
                key={u.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={u.username} tone={urgency} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{u.username}</p>
                    <p className="text-[10px] truncate font-mono" style={{ color: '#6b5c52' }}>
                      {u.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums px-2 py-0.5 rounded"
                    style={{
                      background: tint(urgency, 0.1),
                      color: urgency,
                      border: `1px solid ${tint(urgency, 0.25)}`,
                    }}
                  >
                    <ClockIcon size={9} />
                    {days_remaining}d left
                  </span>
                  {onDm && (
                    <button
                      onClick={() => onDm(u)}
                      title={`Message ${u.username}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{
                        background: tint(palette.blue[400], 0.1),
                        color: palette.blue[400],
                        border: `1px solid ${tint(palette.blue[400], 0.25)}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = tint(palette.blue[400], 0.18); }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = tint(palette.blue[400], 0.1); }}
                    >
                      <SendIcon size={10} />
                      DM
                    </button>
                  )}
                  {onExtend && (
                    <button
                      onClick={() => onExtend(u)}
                      className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{
                        background: tint(palette.green[400], 0.1),
                        color: palette.green[400],
                        border: `1px solid ${tint(palette.green[400], 0.25)}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = tint(palette.green[400], 0.18); }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = tint(palette.green[400], 0.1); }}
                    >
                      Extend
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {expiringUsers.length > 5 && (
            <p className="text-[10px] text-center pt-1" style={{ color: '#6b5c52' }}>
              +{expiringUsers.length - 5} more — use filter to see all
            </p>
          )}
        </div>
      )}
    </Surface>
  );
};
