// src/components/admin/users/ContactReachPanel.jsx
//
// Channel reach breakdown. Each tile is click-to-filter the user table.
//

import { Surface } from '../primitives';
import { palette } from '../designSystem';
import {
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  SparklesIcon,
  AlertTriangleIcon,
  BroadcastIcon,
} from '../Icons';
import { IntentTile } from '../primitives';

export const ContactReachPanel = ({ contactStats, filterReach, onFilterReach }) => {
  if (!contactStats) return null;

  const reachPct = Math.round(
    ((contactStats.total - contactStats.unreachable) / contactStats.total) * 100
  );

  const items = [
    {
      key: 'has_tg',
      Icon: TelegramIcon,
      label: 'Telegram',
      value: contactStats.telegram_reachable,
      color: palette.channels.telegram,
    },
    {
      key: 'has_dc',
      Icon: DiscordIcon,
      label: 'Discord',
      value: contactStats.discord_reachable,
      color: palette.channels.discord,
    },
    {
      key: 'has_email',
      Icon: EmailIcon,
      label: 'Email',
      value: contactStats.email_reachable,
      color: palette.channels.email,
    },
    {
      key: 'admin_enriched',
      Icon: SparklesIcon,
      label: 'Enriched',
      value: contactStats.admin_enriched,
      color: palette.gold[300],
    },
    {
      key: 'unreachable',
      Icon: AlertTriangleIcon,
      label: 'Unreachable',
      value: contactStats.unreachable,
      color: palette.red[400],
    },
  ];

  return (
    <Surface tone={palette.gold[300]} padding="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-xs font-bold text-white flex items-center gap-2 tracking-tight">
          <BroadcastIcon size={14} style={{ color: palette.gold[300] }} />
          Contact Reach
        </h3>
        <p
          className="text-[10px] tabular-nums"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <span style={{ color: palette.gold[300] }}>{reachPct}%</span>
          {' of '}
          <span className="text-white">{contactStats.total}</span>
          {' reachable'}
        </p>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {items.map((it) => (
          <IntentTile
            key={it.key}
            Icon={it.Icon}
            label={it.label}
            value={it.value}
            color={it.color}
            active={filterReach === it.key}
            onClick={() => onFilterReach(filterReach === it.key ? null : it.key)}
          />
        ))}
      </div>
    </Surface>
  );
};
