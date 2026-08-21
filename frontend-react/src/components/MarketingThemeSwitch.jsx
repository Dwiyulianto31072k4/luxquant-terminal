// src/components/MarketingThemeSwitch.jsx
//
// Two-swatch appearance switch for the marketing surfaces (landing / login).
// Marketing routes offer Luxquant (default) and Dark; the choice is stored
// separately from the in-app Bright/Dark preference — see ThemeContext.

import { useTheme } from "../context/ThemeContext";

const SWATCH = {
  luxquant: "linear-gradient(145deg,#1a0a0c 0%,#3d1a12 55%,#e0b25c 150%)",
  dark: "linear-gradient(145deg,#050506 0%,#18181b 60%,#8a8a96 165%)",
  bright: "linear-gradient(145deg,#ffffff 0%,#eceef2 45%,#f0b90b 170%)",
};
const LABEL = { luxquant: "Luxquant", dark: "Dark", bright: "Bright" };

export default function MarketingThemeSwitch({ className = "" }) {
  const { theme, setTheme, canSwitchTheme, themes } = useTheme();
  if (!canSwitchTheme) return null;
  const options = themes && themes.length ? themes : ["luxquant", "dark"];

  return (
    <div
      className={`flex items-center gap-1 rounded-full border border-ink/[0.1] bg-ink/[0.03] p-1 ${className}`}
      role="radiogroup"
      aria-label="Appearance"
    >
      {options.map((key) => {
        const on = theme === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            title={LABEL[key] || key}
            aria-label={LABEL[key] || key}
            onClick={() => setTheme(key)}
            className={`relative h-5 w-5 rounded-full border transition-transform before:absolute before:-inset-2 before:content-[''] ${
              on
                ? "border-accent scale-110"
                : "border-ink/15 opacity-70 hover:opacity-100 hover:scale-105"
            }`}
            style={{ background: SWATCH[key] }}
          />
        );
      })}
    </div>
  );
}
