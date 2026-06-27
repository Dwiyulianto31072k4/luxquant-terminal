import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    host: true,
    allowedHosts: ["luxquant.tw"],
    proxy: {
      "/api": {
        target: "https://luxquant.tw",
        changeOrigin: true,
        secure: true,
      },
    },
  },

  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,
    minify: "esbuild",

    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["react-router-dom"],
          "vendor-charts": ["recharts", "lightweight-charts"],
          "vendor-i18n": [
            "i18next",
            "react-i18next",
            "i18next-browser-languagedetector",
          ],
          "vendor-axios": ["axios"],
        },

        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",

        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";

          if (/\.(css)$/i.test(name)) {
            return "assets/css/[name]-[hash][extname]";
          }

          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name)) {
            return "assets/img/[name]-[hash][extname]";
          }

          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return "assets/fonts/[name]-[hash][extname]";
          }

          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});