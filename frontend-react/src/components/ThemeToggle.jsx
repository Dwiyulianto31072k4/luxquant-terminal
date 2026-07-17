// src/components/ThemeToggle.jsx
//
// Appearance picker for the profile dropdown (admin-gated while theming is in
// preview). Header chrome no longer mounts a standalone LUX/DARK chip —
// theme lives next to the avatar menu, like Linear / Stripe settings.

import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

const SWATCH = {
  luxquant: "linear-gradient(145deg, #1a0a0c 0%, #3d1a12 55%, rgb(var(--accent)) 160%)",
  dark: "linear-gradient(145deg, #050506 0%, #141416 60%, #8a8a96 160%)",
  bright: "linear-gradient(145deg, #f6f6f8 0%, #ffffff 45%, #a17a28 160%)",
};

/**
 * Segmented appearance control for the user menu panel.
 * Returns null when the current user cannot switch themes.
 * Does not close the parent menu — lets admins preview live.
 */
export function ThemeAppearancePicker({ className = "" }) {
  const { t } = useTranslation();
  const { theme, setTheme, canSwitchTheme } = useTheme();
  if (!canSwitchTheme) return null;

  const options = [
    {
      key: "luxquant",
      label: t("userMenu.theme_lux", { defaultValue: "Luxquant" }),
      hint: t("userMenu.theme_lux_hint", { defaultValue: "Warm gold" }),
      swatch: SWATCH.luxquant,
    },
    {
      key: "dark",
      label: t("userMenu.theme_dark", { defaultValue: "Dark" }),
      hint: t("userMenu.theme_dark_hint", { defaultValue: "Neutral" }),
      swatch: SWATCH.dark,
    },
    {
      key: "bright",
      label: t("userMenu.theme_bright", { defaultValue: "Bright" }),
      hint: t("userMenu.theme_bright_hint", { defaultValue: "Paper desk" }),
      swatch: SWATCH.bright,
    },
  ];

  return (
    <div className={className}>
      <p className="mb-2 px-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {t("userMenu.appearance", { defaultValue: "Appearance" })}
      </p>
      <div
        className="grid grid-cols-3 gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-1"
        role="radiogroup"
        aria-label={t("userMenu.appearance", { defaultValue: "Appearance" })}
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
                "flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-2 text-center transition-all sm:flex-row sm:items-center sm:gap-2 sm:px-2 sm:text-left",
                on
                  ? "bg-ink/[0.1] text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.1)]"
                  : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary",
              ].join(" ")}
            >
              <span
                className={[
                  "h-6 w-6 shrink-0 rounded-full border shadow-inner sm:h-7 sm:w-7",
                  on ? "border-ink/30" : "border-ink/10",
                ].join(" ")}
                style={{ background: o.swatch }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium leading-tight sm:text-[13px]">
                  {o.label}
                </span>
                <span className="mt-0.5 hidden text-[10px] leading-tight text-text-muted/70 sm:block">
                  {o.hint}
                </span>
              </span>
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
