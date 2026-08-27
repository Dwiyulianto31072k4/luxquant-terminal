import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function readBuildId() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return String(Date.now());
  }
}

const buildId = readBuildId();

function buildIdPlugin() {
  return {
    name: "lq-build-id",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: JSON.stringify({ id: buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildIdPlugin()],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
  },

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