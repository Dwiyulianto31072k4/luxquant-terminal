// src/components/ThemeToggle.jsx
//
// Appearance control — Vercel / Linear / Stripe-grade theme cards.
// Full-width stacked rows with live swatch, label, short desc, check mark.
// Lives in the user menu (admin-gated while theming is in preview).

import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

const THEMES = [
  {
    key: "luxquant",
    labelKey: "userMenu.theme_lux",
    labelDefault: "Luxquant",
    hintKey: "userMenu.theme_lux_hint",
    hintDefault: "Warm gold on deep desk",
    // Mini UI mock: top bar + accent CTA
    preview: {
      bg: "#0a0506",
      bar: "#14080a",
      line: "rgba(240,185,11,0.35)",
      cta: "#F0B90B",
      text: "#e8e0d4",
    },
  },
  {
    key: "dark",
    labelKey: "userMenu.theme_dark",
    labelDefault: "Dark",
    hintKey: "userMenu.theme_dark_hint",
    hintDefault: "Binance-neutral monochrome",
    preview: {
      bg: "#0B0E11",
      bar: "#181C22",
      line: "rgba(255,255,255,0.12)",
      cta: "#F0B90B",
      text: "#EAECEF",
    },
  },
  {
    key: "bright",
    labelKey: "userMenu.theme_bright",
    labelDefault: "Bright",
    hintKey: "userMenu.theme_bright_hint",
    hintDefault: "Paper desk · Stripe light",
    preview: {
      bg: "#F5F6F8",
      bar: "#FFFFFF",
      line: "rgba(15,23,42,0.1)",
      cta: "#F0B90B",
      text: "#0B0E11",
    },
  },
];

function ThemePreviewSwatch({ preview, active }) {
  return (
    <span
      className={[
        "relative h-10 w-14 shrink-0 overflow-hidden rounded-md border shadow-sm",
        active ? "border-accent ring-2 ring-accent/30" : "border-ink/[0.1]",
      ].join(" ")}
      style={{ background: preview.bg }}
      aria-hidden
    >
      {/* mini chrome bar */}
      <span
        className="absolute inset-x-0 top-0 h-3 border-b"
        style={{ background: preview.bar, borderColor: preview.line }}
      />
      <span
        className="absolute left-1 top-1 h-1 w-1 rounded-full"
        style={{ background: preview.cta }}
      />
      {/* content lines */}
      <span
        className="absolute left-1.5 right-4 top-4 h-1 rounded-sm opacity-80"
        style={{ background: preview.text }}
      />
      <span
        className="absolute left-1.5 right-6 top-6 h-1 rounded-sm opacity-40"
        style={{ background: preview.text }}
      />
      {/* CTA pill */}
      <span
        className="absolute bottom-1.5 right-1.5 h-2 w-4 rounded-sm"
        style={{ background: preview.cta }}
      />
    </span>
  );
}

function CheckIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8.2l2 2 4-4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Appearance picker for the profile dropdown.
 * Returns null when the current user cannot switch themes.
 */
export function ThemeAppearancePicker({ className = "" }) {
  const { t } = useTranslation();
  const { theme, setTheme, canSwitchTheme, themes } = useTheme();
  if (!canSwitchTheme) return null;
  // Only offer themes selectable in the current context (Bright is in-app only).
  const options = THEMES.filter((o) => (themes || []).includes(o.key));

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {t("userMenu.appearance", { defaultValue: "Appearance" })}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/50">
          {t("userMenu.theme_live", { defaultValue: "Live preview" })}
        </p>
      </div>

      <div
        className="flex flex-col gap-1 rounded-xl border border-ink/[0.08] bg-surface-secondary/80 p-1.5"
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
                "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-all",
                on
                  ? "bg-surface-raised text-text-primary shadow-sm ring-1 ring-ink/[0.08]"
                  : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary",
              ].join(" ")}
            >
              <ThemePreviewSwatch preview={o.preview} active={on} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold leading-tight tracking-tight">
                    {t(o.labelKey, { defaultValue: o.labelDefault })}
                  </span>
                  {on ? (
                    <span className="rounded px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-accent-fg bg-accent">
                      On
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
                  {t(o.hintKey, { defaultValue: o.hintDefault })}
                </span>
              </span>
              <span
                className={[
                  "shrink-0 transition-colors",
                  on ? "text-accent" : "text-ink/20 group-hover:text-ink/40",
                ].join(" ")}
              >
                <CheckIcon className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Legacy stub — header no longer mounts a LUX/DARK chip.
export default function ThemeToggle() {
  return null;
}
