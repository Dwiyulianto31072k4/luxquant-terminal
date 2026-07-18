// src/components/admin/users/CrmChips.jsx
// ════════════════════════════════════════════════════════════════════
// CRM touch-status filter chips. One click → show only users in that
// state (untouched = no follow-up yet, open = being worked, tracked = done).
// Mirrors AnomalyChips; filters are mutually exclusive with one another.
// ════════════════════════════════════════════════════════════════════
import { palette, tint } from "../designSystem";

const CRM_CHIPS = [
  {
    key: "untouched",
    label: "Untracked",
    hint: "No follow-up yet — needs first outreach",
    color: "rgb(var(--fg-muted))",
  },
  {
    key: "open",
    label: "In progress",
    hint: "Has an active follow-up (pending / in progress)",
    color: "rgb(var(--accent-text))",
  },
  {
    key: "tracked",
    label: "Tracked",
    hint: "Followed up & resolved",
    color: "rgb(var(--pos-text))",
  },
];

export const CrmChips = ({ active, onToggle }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span
      className="text-[10px] uppercase tracking-[0.15em] font-semibold mr-1"
      style={{ color: "rgb(var(--ink) / 0.4)" }}
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
