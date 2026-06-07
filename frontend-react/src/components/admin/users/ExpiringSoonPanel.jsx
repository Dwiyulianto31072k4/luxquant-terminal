// src/components/admin/users/ExpiringSoonPanel.jsx
//
// Surfaces subscribers whose access is about to lapse, with a quick
// "Extend" action that opens the GrantModal.
//

import { Surface, Avatar } from '../primitives';
import { palette, tint } from '../designSystem';
import { AlertTriangleIcon, ClockIcon } from '../Icons';

export const ExpiringSoonPanel = ({ expiringUsers, onExtend }) => {
  if (!expiringUsers || expiringUsers.length === 0) return null;

  return (
    <Surface tone={palette.orange[400]} padding="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="relative inline-flex">
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-40"
            style={{ background: palette.orange[400] }}
          />
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
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {expiringUsers.slice(0, 5).map(({ user: u, days_remaining }) => {
          const urgency = days_remaining <= 3 ? palette.red[400] : palette.orange[400];
          return (
            <div
              key={u.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.22)' }}
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
                <button
                  onClick={() => onExtend(u)}
                  className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                  style={{
                    background: tint(palette.green[400], 0.1),
                    color: palette.green[400],
                    border: `1px solid ${tint(palette.green[400], 0.25)}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tint(palette.green[400], 0.18);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = tint(palette.green[400], 0.1);
                  }}
                >
                  Extend
                </button>
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
    </Surface>
  );
};
