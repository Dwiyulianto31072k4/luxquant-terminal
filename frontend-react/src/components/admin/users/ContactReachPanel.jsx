// src/components/admin/users/ContactReachPanel.jsx
//
// Channel reach breakdown. Collapsed by default (ERP progressive disclosure).
// Each tile is click-to-filter the user table.
//

import { useState } from 'react';
import { Surface } from '../primitives';
import { palette, tint } from '../designSystem';
import {
 TelegramIcon,
 DiscordIcon,
 EmailIcon,
 SparklesIcon,
 AlertTriangleIcon,
 BroadcastIcon,
 ChevronDownIcon,
} from '../Icons';
import { IntentTile } from '../primitives';

export const ContactReachPanel = ({
 contactStats,
 filterReach,
 onFilterReach,
 defaultOpen = false,
}) => {
 const [open, setOpen] = useState(defaultOpen);
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
 <Surface variant="premium" hover={false} padding="p-0">
 <button
 type="button"
 onClick={() => setOpen((o) => !o)}
 className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
 >
 <div className="flex items-center gap-2 min-w-0">
 <BroadcastIcon size={14} style={{ color: palette.gold[300] }} />
 <h3 className="text-xs font-bold text-text-primary tracking-tight">Contact Reach</h3>
 <span
 className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
 style={{
 background: tint(palette.gold[300], 0.12),
 color: palette.gold[300],
 border: `1px solid ${tint(palette.gold[300], 0.25)}`,
 }}
 >
 {reachPct}% reachable
 </span>
 {filterReach && (
 <span
 className="text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
 style={{
 background: tint(palette.blue[400], 0.12),
 color: palette.blue[400],
 }}
 >
 filter on
 </span>
 )}
 </div>
 <ChevronDownIcon
 size={15}
 style={{
 color: 'rgb(var(--ink) / 0.4)',
 transform: open ? 'rotate(180deg)' : 'none',
 transition: 'transform .2s',
 }}
 />
 </button>

 {open && (
 <div className="px-4 pb-4">
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
 </div>
 )}
 </Surface>
 );
};
