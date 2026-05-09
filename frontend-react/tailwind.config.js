/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'gold-glow': '0 4px 20px rgba(212, 168, 83, 0.4)',
        'positive-glow': '0 0 20px rgba(74, 222, 128, 0.3)',
        'negative-glow': '0 0 20px rgba(248, 113, 113, 0.3)',
      },
    },
  },
  plugins: [],
}
