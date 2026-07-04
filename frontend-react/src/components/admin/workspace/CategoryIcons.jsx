// src/components/admin/workspace/CategoryIcons.jsx
// ════════════════════════════════════════════════════════════════
// Custom icon set (duotone Binance-style): clean lines + one solid-fill
// accent per icon. Inherits currentColor. Props: size (default 14).
// Used inside the badge / PickOption workspace panel.
// ════════════════════════════════════════════════════════════════

const wrap = (size, p) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...p,
});
const SOLID = { fill: "currentColor", stroke: "none" };

/* ── Followup categories ── */
export const RenewalIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <path d="M20.5 9A8.5 8.5 0 0 0 5.5 6.5L3 9" />
    <path d="M3.5 15A8.5 8.5 0 0 0 18.5 17.5L21 15" />
    <path {...SOLID} d="M3 3.5 8.5 9 3 9z" />
    <path {...SOLID} d="M21 20.5 15.5 15 21 15z" />
  </svg>
);
export const PaymentCardIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <rect {...SOLID} x="3.2" y="9" width="17.6" height="2.6" />
    <path d="M6 15h4" />
  </svg>
);
export const SupportIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6 9 9M18.4 5.6 15 9M5.6 18.4 9 15M18.4 18.4 15 15" />
    <circle {...SOLID} cx="12" cy="12" r="3.1" />
  </svg>
);
export const NoteIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M9 12h6M9 16h4" />
    <rect {...SOLID} x="9" y="7" width="6" height="2.1" rx="1.05" />
  </svg>
);

/* ── Todo categories ── */
export const GearIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <circle cx="12" cy="12" r="6.2" />
    <path d="M12 2v3M12 19v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" />
    <circle {...SOLID} cx="12" cy="12" r="2.2" />
  </svg>
);
export const MegaphoneIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z" />
    <path d="M16.5 9a4 4 0 0 1 0 6" />
    <path {...SOLID} d="M4 9.6h3L13 5.6v5.2H4z" opacity="0.55" />
  </svg>
);
export const WrenchIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <path d="M15 6.5a3.6 3.6 0 0 0-4.9 4.9l-6 6a1.6 1.6 0 0 0 2.3 2.3l6-6A3.6 3.6 0 0 0 17.3 8.8l-2.2 2.2-2-.1-.1-2L15 6.5z" />
    <circle {...SOLID} cx="6.2" cy="17.8" r="1.5" />
  </svg>
);
export const BugIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <rect x="8" y="7" width="8" height="11" rx="4" />
    <path d="M12 7V4.5M8 11H4.5M16 11h3.5M8.4 15.5 5.5 18M15.6 15.5 18.5 18M9 6.5 7 4.8M15 6.5 17 4.8" />
    <circle {...SOLID} cx="10.4" cy="11" r="1" />
    <circle {...SOLID} cx="13.6" cy="11" r="1" />
  </svg>
);
export const BulbIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <path d="M12 2.5a6.5 6.5 0 0 0-3.7 11.8c.5.4.7.9.7 1.5V18h6v-2.2c0-.6.2-1.1.7-1.5A6.5 6.5 0 0 0 12 2.5z" />
    <path d="M10 21.5h4" />
    <rect {...SOLID} x="9" y="17.6" width="6" height="2" rx="1" />
  </svg>
);
export const PinIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <path d="M6.5 3.5h11l-1 6 2.5 3v1.5h-14V12l2.5-3-1-5.5z" />
    <path d="M12 14v6.5" />
    <path {...SOLID} d="M12 6.2 14 9l-2 2-2-2z" />
  </svg>
);

/* ── shared ── */
export const ChevronDownIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}><path {...SOLID} d="M6 9h12l-6 6.5z" /></svg>
);
export const CalendarDotIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M8 2.5v4M16 2.5v4" />
    <path {...SOLID} d="M3.4 8.6h17.2v1.8H3.4z" />
    <circle {...SOLID} cx="12" cy="14.5" r="1.5" />
  </svg>
);
export const TimerIcon = ({ size = 14, ...p }) => (
  <svg {...wrap(size, p)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M9.5 2.5h5M12 6V2.5" />
    <path d="M12 9.5v4l2.5 1.5" />
    <circle {...SOLID} cx="12" cy="13.5" r="1.5" />
  </svg>
);

export default {
  RenewalIcon, PaymentCardIcon, SupportIcon, NoteIcon,
  GearIcon, MegaphoneIcon, WrenchIcon, BugIcon, BulbIcon, PinIcon,
  ChevronDownIcon, CalendarDotIcon, TimerIcon,
};
