import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// Escape hatch for a poisoned CDN cache key. Asset filenames are content
// hashed, so a chunk whose source has not changed keeps the same URL — and a
// redeploy therefore cannot rescue it from an edge that has got stuck serving
// 522 for that one key (measured at the Singapore edge, 2026-09-06: the same
// file answered instantly under any other key and from origin).
//   LQ_ASSET_SALT=$(date +%s) npm run build
// renames every asset for that one build, retiring every existing key at once.
// Leave it unset for normal deploys: an incremental build only re-hashes what
// actually changed, which is what keeps the rest of the bundle warm at the edge.
function readAssetSalt() {
  // Env wins, for a one-off. Otherwise the committed `.asset-salt` file decides,
  // so a plain `npm run build` keeps the filenames that are currently healthy at
  // the edge instead of silently reverting to the ones we escaped.
  const fromEnv = process.env.LQ_ASSET_SALT;
  if (fromEnv) return `-${fromEnv.trim()}`;
  try {
    const fromFile = readFileSync(new URL("./.asset-salt", import.meta.url), "utf8").trim();
    return fromFile ? `-${fromFile}` : "";
  } catch {
    return "";
  }
}

const assetSalt = readAssetSalt();

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

        chunkFileNames: `assets/js/[name]-[hash]${assetSalt}.js`,
        entryFileNames: `assets/js/[name]-[hash]${assetSalt}.js`,

        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";

          if (/\.(css)$/i.test(name)) {
            return `assets/css/[name]-[hash]${assetSalt}[extname]`;
          }

          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name)) {
            return `assets/img/[name]-[hash]${assetSalt}[extname]`;
          }

          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return `assets/fonts/[name]-[hash]${assetSalt}[extname]`;
          }

          return `assets/[name]-[hash]${assetSalt}[extname]`;
        },
      },
    },
  },
});