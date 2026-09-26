// src/services/errorReporter.js
// ════════════════════════════════════════════════════════════════
// Crash reports to the server (POST /api/v1/client-errors).
//
// The error boundary used to write to the visitor's console and nowhere else,
// so a crash reached us only as a screenshot. Now each distinct crash is
// posted once per page load. What is NOT sent, because it is either noise or
// already handled somewhere else:
//   • stale-bundle chunk errors — main.jsx / ErrorBoundary reload the tab
//   • network failures, aborts and HTTP errors — nginx already logs those
//   • errors thrown from browser extensions, ResizeObserver loop notices and
//     the detail-less "Script error." cross-origin scripts produce
//   • anything in local development
// ════════════════════════════════════════════════════════════════
import { isChunkLoadError } from "../utils/lazyWithRetry";

const API_URL = import.meta.env?.VITE_API_URL || "";
const ENDPOINT = `${API_URL}/api/v1/client-errors`;
const MAX_PER_PAGE = 10;

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError when attempting to fetch|^Load failed$|^Network Error$/i,
  /network connection was lost|Internet connection appears to be offline/i,
  /The operation was aborted|signal is aborted|^canceled$/i,
];
const EXTENSION = /(chrome|moz|safari(-web)?)-extension:\/\//i;
// Request failures carry their HTTP status already; they are not crashes.
const REQUEST_ERRORS = new Set(["AbortError", "CanceledError", "AutoTradeApiError", "TimeoutError"]);

let sent = 0;
const seen = new Set();

/** Test hook: forget what this page has already reported. */
export function _resetReporter() {
  sent = 0;
  seen.clear();
}

/** The report for `error`, or null when it should not be sent. */
export function describeError(error, { kind = "error", componentStack = null } = {}) {
  if (error == null) return null;
  if (typeof error === "object" && (error.isAxiosError || REQUEST_ERRORS.has(error.name))) return null;
  if (isChunkLoadError(error)) return null;
  const message = String(
    typeof error === "object" ? (error.message ?? "") : error
  ).slice(0, 1000);
  const stack = typeof error?.stack === "string" ? error.stack.slice(0, 8000) : null;
  if (!message && !stack) return null;
  if (NOISE.some((re) => re.test(message))) return null;
  if (stack && EXTENSION.test(stack)) return null;
  return {
    kind,
    message,
    stack,
    component_stack: componentStack ? String(componentStack).slice(0, 8000) : null,
    url: String(globalThis.location?.href || "").slice(0, 1000) || null,
    build: import.meta.env?.VITE_BUILD_ID || null,
  };
}

/** Post one crash report. Never throws; at most MAX_PER_PAGE per page load.
 * `force` sends from a dev build too — only the tests use it. */
export function reportClientError(error, options = {}, send = globalThis.fetch) {
  try {
    if (import.meta.env?.DEV && !options.force) return false;
    const report = describeError(error, options);
    if (!report) return false;
    const firstFrame = (report.stack || "").split("\n").find((l) => /\bat\b|@/.test(l)) || "";
    const key = `${report.kind}|${report.message}|${firstFrame.trim()}`;
    if (seen.has(key) || sent >= MAX_PER_PAGE) return false;
    seen.add(key);
    sent += 1;
    const token = globalThis.localStorage?.getItem("access_token");
    // keepalive so a report sent while the tab closes still leaves.
    Promise.resolve(
      send(ENDPOINT, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(report),
      })
    ).catch(() => {});
    return true;
  } catch {
    return false; // reporting a crash must never cause one
  }
}

/** Uncaught errors and rejections outside React's render tree. */
export function installGlobalErrorReporting(target = globalThis) {
  if (!target?.addEventListener || target.__lqErrorReporting) return;
  target.__lqErrorReporting = true;
  target.addEventListener("error", (e) => {
    const err =
      e?.error ||
      (e?.message
        ? { message: e.message, stack: e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : null }
        : null);
    reportClientError(err, { kind: "error" });
  });
  target.addEventListener("unhandledrejection", (e) => {
    reportClientError(e?.reason, { kind: "rejection" });
  });
}
