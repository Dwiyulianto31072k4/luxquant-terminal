// src/components/ThemeToggle.jsx
//
// Appearance picker for the profile dropdown (admin-gated while theming is in
// preview). Header chrome no longer mounts a standalone LUX/DARK chip —
// theme lives next to the avatar menu, like Linear / Stripe settings.

import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const SWATCH = {
  luxquant: 'linear-gradient(145deg, #1a0a0c 0%, #3d1a12 55%, #d4a853 160%)',
  dark: 'linear-gradient(145deg, #050506 0%, #141416 60%, #8a8a96 160%)',
};

/**
 * Segmented appearance control for the user menu panel.
 * Returns null when the current user cannot switch themes.
 * Does not close the parent menu — lets admins preview live.
 */
export function ThemeAppearancePicker({ className = '' }) {
  const { t } = useTranslation();
  const { theme, setTheme, canSwitchTheme } = useTheme();
  if (!canSwitchTheme) return null;

  const options = [
    {
      key: 'luxquant',
      label: t('userMenu.theme_lux', { defaultValue: 'Luxquant' }),
      hint: t('userMenu.theme_lux_hint', { defaultValue: 'Warm gold' }),
      swatch: SWATCH.luxquant,
    },
    {
      key: 'dark',
      label: t('userMenu.theme_dark', { defaultValue: 'Dark' }),
      hint: t('userMenu.theme_dark_hint', { defaultValue: 'Neutral' }),
      swatch: SWATCH.dark,
    },
  ];

  return (
    <div className={className}>
      <p className="mb-2 px-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {t('userMenu.appearance', { defaultValue: 'Appearance' })}
      </p>
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1"
        role="radiogroup"
        aria-label={t('userMenu.appearance', { defaultValue: 'Appearance' })}
      >
        {options.map((o) => {
          const on = theme === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(o.key)}
              className={[
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
                on
                  ? 'bg-white/[0.1] text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                  : 'text-text-muted hover:bg-white/[0.04] hover:text-text-primary',
              ].join(' ')}
            >
              <span
                className={[
                  'h-7 w-7 shrink-0 rounded-full border shadow-inner',
                  on ? 'border-white/30' : 'border-white/10',
                ].join(' ')}
                style={{ background: o.swatch }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium leading-tight">{o.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-text-muted/70">{o.hint}</span>
              </span>
              {on ? (
                <svg
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-text-primary/70"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M3.5 8.5 6.5 11.5 12.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Kept for any legacy import — always hidden; use ThemeAppearancePicker in menus.
export default function ThemeToggle() {
  return null;
}
