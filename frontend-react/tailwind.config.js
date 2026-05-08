/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ============================================================
           ORIGINAL LUXQUANT TOKENS — JANGAN DIUBAH
           Semua 51 file existing pake ini, harus tetap jalan.
           ============================================================ */
        bg: {
          primary: '#0a0506',
          secondary: '#120809',
          card: 'rgba(20, 8, 10, 0.8)',
          hover: 'rgba(30, 12, 15, 0.9)',
        },
        gold: {
          primary: '#d4a853',
          light: '#f0d890',
          dark: '#8b6914',
        },
        red: {
          primary: '#8b1a1a',
          light: '#c42020',
          dark: '#2a0a0a',
        },
        text: {
          primary: '#ffffff',
          secondary: '#b8a89a',
          muted: '#6b5c52',
        },
        positive: '#4ade80',
        negative: '#f87171',
        warning: '#fbbf24',

        /* ============================================================
           NEW: FLOWSCAN TOKENS (namespace "flow-")
           Dipakai untuk halaman/komponen yang udah dimigrasi.
           Class-nya jadi: bg-flow-bg, text-flow-accent, border-flow-border, dst.
           ============================================================ */
        flow: {
          bg: 'hsl(222 30% 6%)',            // page background
          surface: 'hsl(220 28% 8%)',        // card surface
          'surface-2': 'hsl(220 25% 11%)',   // nested card / table row
          ink: 'hsl(220 35% 4%)',            // deepest dark (modal backdrop, nav)
          fg: 'hsl(210 20% 92%)',            // main text
          steel: 'hsl(215 16% 55%)',         // muted gray text
          muted: 'hsl(215 16% 50%)',         // muted-foreground (lebih redup)
          accent: 'hsl(168 76% 64%)',        // Hyperliquid teal — accent utama
          border: 'hsl(220 20% 18%)',        // subtle border
        },
      },
      fontFamily: {
        /* EXISTING — jangan diubah */
        display: ['Playfair Display', 'serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        /* NEW — Space Grotesk untuk halaman Flowscan-styled */
        grotesk: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        /* EXISTING */
        'gold-glow': '0 4px 20px rgba(212, 168, 83, 0.4)',
        'positive-glow': '0 0 20px rgba(74, 222, 128, 0.3)',
        'negative-glow': '0 0 20px rgba(248, 113, 113, 0.3)',
        /* NEW — shadow halus khas Flowscan */
        'flow-card': 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 1px 2px 0 rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
}
