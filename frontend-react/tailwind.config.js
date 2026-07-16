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
        },
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
        // Container hairline/border colour — gold in Luxquant, neutral in Dark.
        // Use for static card/panel borders; interactive gold stays gold-primary.
        line: withAlpha("--line"),
        positive: withAlpha("--pos"),
        negative: withAlpha("--neg"),
        warning: withAlpha("--warn"),
        "brand-telegram": withAlpha("--tg"),
        // Flowscan semantic pair — used as text-profit / bg-loss/10 etc.
        // across AI Research. Previously referenced but never defined,
        // which silently stripped all green/red semantics from the UI.
        profit: "#56c996",
        loss: "#e07288",
      },
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "gold-glow": "0 4px 20px rgba(212, 168, 83, 0.4)",
        "positive-glow": "0 0 20px rgba(74, 222, 128, 0.3)",
        "negative-glow": "0 0 20px rgba(248, 113, 113, 0.3)",
      },
    },
  },
  plugins: [],
};
