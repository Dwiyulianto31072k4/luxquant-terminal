// src/components/ThemeToggle.jsx
//
// Compact 3-way theme switch. Renders ONLY for users allowed to switch themes
// (admin staff while the feature is gated). Members never see it.

import { useTheme } from '../context/ThemeContext';

// Bright is temporarily hidden while Dark is being polished across all features.
// Re-add { key: 'bright', label: 'Bright' } to expose it again.
const OPTIONS = [
  { key: 'luxquant', label: 'Lux' },
  { key: 'dark', label: 'Dark' },
];

export default function ThemeToggle() {
  const { theme, setTheme, canSwitchTheme } = useTheme();
  if (!canSwitchTheme) return null;

  return (
    <div
      className="hidden sm:inline-flex items-center rounded-sm border border-white/[0.08] bg-white/[0.03] p-0.5"
      role="group"
      aria-label="Theme (admin preview)"
      title="Theme preview (admin only)"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setTheme(o.key)}
            aria-pressed={active}
            className={
              'px-2 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ' +
              (active
                ? 'bg-gold-primary/20 text-gold-light'
                : 'text-text-muted hover:text-text-primary')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
