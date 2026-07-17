/** @type {import('tailwindcss').Config} */
// Reference a semantic CSS-var channel while preserving Tailwind opacity
// modifiers: `bg-surface/70` → rgb(var(--surface) / 0.7).
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core families now reference semantic CSS-var channels (see index.css)
        // via rgb(var(--x) / <alpha-value>) so opacity modifiers (/70, /40) keep
        // working AND the colours follow the active theme. Luxquant channel
        // values equal the previous hex, so the default look is unchanged.
        bg: {
          primary: withAlpha("--surface"),
          secondary: withAlpha("--surface-secondary"),
          card: "rgb(var(--surface-raised) / 0.8)",
          hover: "rgb(var(--surface-hover) / 0.9)",
        },
        gold: {
          primary: withAlpha("--accent"),
          light: withAlpha("--accent-light"),
          dark: withAlpha("--accent-dark"),
        },
        // New semantic aliases (preferred names going forward)
        surface: {
          DEFAULT: withAlpha("--surface"),
          secondary: withAlpha("--surface-secondary"),
          raised: withAlpha("--surface-raised"),
          hover: withAlpha("--surface-hover"),
        },
        accent: {
          DEFAULT: withAlpha("--accent"),
          light: withAlpha("--accent-light"),
          dark: withAlpha("--accent-dark"),
          // Text/icon ON solid yellow fills — always dark (Binance CTA pattern)
          fg: withAlpha("--accent-fg"),
        },
        // Alias for gold CTAs: text-accent-fg / bg-gold-primary
        red: {
          primary: "#8b1a1a",
          light: "#c42020",
          dark: "#2a0a0a",
        },
        text: {
          primary: withAlpha("--fg"),
          secondary: withAlpha("--fg-secondary"),
          // Bumped from #6b5c52 (3.16:1 — failed WCAG AA) to #a59585 (6.98:1).
          // Same warm gold-gray, now readable; opacity variants (/70 ≈ 3.85:1)
          // also lift above the old base. Theme/gold/bg unchanged.
          muted: withAlpha("--fg-muted"),
        },
        // Container hairline/border colour — gold in Luxquant, neutral in Dark/Bright.
        // Use for static card/panel borders; interactive gold stays gold-primary.
        line: withAlpha("--line"),
        // Theme-aware overlay ink: WHITE on luxquant/dark, BLACK on bright.
        // Prefer border-ink/10, bg-ink/[0.04] over border-white / bg-white.
        ink: withAlpha("--ink"),
        "ink-inv": withAlpha("--ink-inv"),
        // Modal/page dimmer — always dark so content underneath recedes.
        scrim: withAlpha("--scrim"),
        positive: withAlpha("--pos"),
        negative: withAlpha("--neg"),
        warning: withAlpha("--warn"),
        "brand-telegram": withAlpha("--tg"),
        // Flowscan semantic pair — used as text-profit / bg-loss/10 etc.
        // across AI Research. Theme-aware via pos/neg channels.
        profit: withAlpha("--pos"),
        loss: withAlpha("--neg"),
      },
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "gold-glow": "0 4px 16px rgb(var(--accent) / 0.32)",
        "cta": "0 4px 14px rgb(var(--accent) / 0.35)",
        "positive-glow": "0 0 16px rgb(var(--pos) / 0.25)",
        "negative-glow": "0 0 16px rgb(var(--neg) / 0.25)",
        desk: "0 1px 2px rgb(var(--scrim) / 0.06), 0 8px 24px rgb(var(--scrim) / 0.08)",
      },
    },
  },
  plugins: [],
};
