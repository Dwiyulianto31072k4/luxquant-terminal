import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/index.css";
import "./i18n"; // <--- Baris pemanggil kamus bahasa
import { captureAcqFromUrl } from "./utils/acqAttribution";

// First-touch UTM / social referrer (before React tree mounts)
try {
  captureAcqFromUrl();
} catch {
  /* ignore */
}

// ── Stale-bundle recovery ──────────────────────────────────────────────
// After a deploy, a tab that's still open may try to load a lazy JS/CSS chunk
// whose hashed file was replaced — the app then breaks (blank page / login
// buttons dead). Detect that specific failure and reload ONCE to fetch the
// fresh index.html + bundles, so users never get stuck. A short sessionStorage
// guard prevents any reload loop if the error somehow persists.
(function () {
  const isChunkError = (msg = "") =>
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \S+ failed|Loading CSS chunk \S+ failed/i.test(
      String(msg || "")
    );
  const reloadOnce = () => {
    try {
      const KEY = "lq_chunk_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };
  window.addEventListener("error", (e) => {
    if (isChunkError(e && (e.message || (e.error && e.error.message)))) reloadOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e && e.reason;
    if (isChunkError(reason && (reason.message || reason))) reloadOnce();
  });
})();

// ── New-deploy pickup ──────────────────────────────────────────────────
// Old hashed bundles are kept on disk so an open tab does not 404. That also
// means a user can sit on yesterday's UI forever. Poll /build.json (never
// cached) and reload when the running bundle is behind — on tab focus, after
// bfcache restore, and every 10 minutes. Skip while they are typing.
(function () {
  const mine = import.meta.env.VITE_BUILD_ID;
  if (!mine) return;
  const ping = () => {
    if (document.visibilityState && document.visibilityState !== "visible") return;
    try {
      const ae = document.activeElement;
      if (
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.tagName === "SELECT" ||
          ae.isContentEditable)
      ) {
        return;
      }
    } catch {
      /* ignore */
    }
    fetch("/build.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.id || d.id === mine) return;
        try {
          const KEY = "lq_build_reload_at";
          const last = Number(sessionStorage.getItem(KEY) || 0);
          if (Date.now() - last < 20000) return;
          sessionStorage.setItem(KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        window.location.reload();
      })
      .catch(() => {});
  };
  document.addEventListener("visibilitychange", ping);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) ping();
  });
  setInterval(ping, 10 * 60 * 1000);
  ping();
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
