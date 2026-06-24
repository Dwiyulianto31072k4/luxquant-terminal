// src/components/admin/users/CrmChips.jsx
// ════════════════════════════════════════════════════════════════════
// CRM touch-status filter chips. One click → show only users in that
// state (untouched = belum dipantau, open = lagi diurus, tracked = sudah).
// Mirrors AnomalyChips; filters are mutually exclusive with one another.
// ════════════════════════════════════════════════════════════════════
import { palette, tint } from '../designSystem';

const CRM_CHIPS = [
  {
    key: 'untouched',
    label: 'Belum dipantau',
    hint: 'Belum pernah ada follow-up — perlu disapa',
    color: '#8a7a6e',
  },
  {
    key: 'open',
    label: 'Lagi diurus',
    hint: 'Ada follow-up aktif (pending / in progress)',
    color: palette.amber?.[400] || '#fbbf24',
  },
  {
    key: 'tracked',
    label: 'Sudah dipantau',
    hint: 'Pernah di-follow-up & sudah selesai',
    color: palette.green[400],
  },
];

export const CrmChips = ({ active, onToggle }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span
      className="text-[10px] uppercase tracking-[0.15em] font-semibold mr-1"
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      CRM
    </span>
    {CRM_CHIPS.map((chip) => {
      const isActive = active === chip.key;
      return (
        <button
          key={chip.key}
          onClick={() => onToggle(isActive ? null : chip.key)}
          title={chip.hint}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: isActive ? tint(chip.color, 0.18) : tint(chip.color, 0.06),
            color: chip.color,
            border: `1px solid ${isActive ? tint(chip.color, 0.4) : tint(chip.color, 0.15)}`,
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{ width: 6, height: 6, background: chip.color }}
          />
          {chip.label}
        </button>
      );
    })}
  </div>
);

export default CrmChips;
