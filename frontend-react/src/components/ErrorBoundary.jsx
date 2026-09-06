// src/components/ErrorBoundary.jsx
// Catches React render/runtime errors so a single page crash cannot blank the whole app
// (desktop + mobile). Includes a solid accent recovery CTA.

import { Component } from "react";
import { isChunkLoadError } from "../utils/lazyWithRetry";

// Shared with the global handler in main.jsx so the two cannot double-reload.
const RELOAD_KEY = "lq_chunk_reload_at";

// A chunk that never arrived is not a bug in this view — it is a dropped asset
// fetch, and by the time it reaches here lazyWithRetry has already tried the
// download four times. The one thing left to try is a fresh index.html, which
// also covers the case where the tab is running a bundle that a deploy replaced.
// Guarded on a timestamp so a genuinely broken build cannot spin the tab.
function reloadOnceForChunkError() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* private mode: no guard available, still worth one reload */
  }
  try {
    window.location.reload();
  } catch {
    window.location.href = "/";
  }
  return true;
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, chunk: false };
  }

  static getDerivedStateFromError(error) {
    return { error, chunk: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (isChunkLoadError(error)) {
      // Returns false if we already spent this tab's one reload — then we fall
      // through to the panel below, which explains it instead of looping.
      if (reloadOnceForChunkError()) return;
    }
    try {
      console.error("[ErrorBoundary]", error, info?.componentStack);
    } catch {
      /* ignore */
    }
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = "/";
    }
  };

  handleHome = () => {
    try {
      window.location.assign("/");
    } catch {
      window.location.href = "/";
    }
  };

  render() {
    const { error, chunk } = this.state;
    if (!error) return this.props.children;

    const fallback = this.props.fallback;
    if (typeof fallback === "function") return fallback({ error, reset: this.handleReload });
    if (fallback) return fallback;

    const msg = error?.message || String(error);
    const compact = this.props.compact;

    return (
      <div
        className={
          compact
            ? "flex min-h-[40vh] flex-col items-center justify-center px-4 py-10 text-center"
            : "flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center"
        }
        role="alert"
      >
        <div className="w-full max-w-md rounded-md border border-ink/[0.1] bg-surface-raised p-6 shadow-desk">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {chunk ? "Connection problem" : "Something went wrong"}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-text-primary">
            {chunk ? "This screen did not finish downloading" : "This view hit an error"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            {chunk
              ? "A page file never arrived from the network. Reload sometimes helps. If it keeps failing, it is not your account — the file is stuck at the CDN."
              : "The rest of LuxQuant is still available. Reload this screen or go back home."}
          </p>
          {msg && !chunk ? (
            <pre className="mt-4 max-h-24 overflow-auto rounded-md border border-ink/[0.08] bg-surface-secondary px-3 py-2 text-left font-mono text-[10px] leading-relaxed text-text-muted">
              {msg}
            </pre>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg shadow-sm transition hover:opacity-90"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="inline-flex items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted transition hover:text-text-primary"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/** Route-level boundary — compact recovery inside AppShell content area */
export function RouteErrorBoundary({ children }) {
  return <ErrorBoundary compact>{children}</ErrorBoundary>;
}
