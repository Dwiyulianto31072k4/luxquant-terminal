import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/index.css";
import "./i18n"; // <--- Baris pemanggil kamus bahasa

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
    } catch (_e) {
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
