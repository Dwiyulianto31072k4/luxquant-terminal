// Shared free-preview counter + soft-gate events for landing proof opens.
// Sticky CTA listens for open/close so it never stacks under the account sheet.

export const FREE_PREVIEW_KEY = "lq_landing_free_preview_v1";
export const FREE_PREVIEW_LIMIT = 1;

export function readFreePreviewCount() {
  try {
    return Number(sessionStorage.getItem(FREE_PREVIEW_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

export function bumpFreePreviewCount() {
  try {
    const n = readFreePreviewCount() + 1;
    sessionStorage.setItem(FREE_PREVIEW_KEY, String(n));
    return n;
  } catch {
    return FREE_PREVIEW_LIMIT + 1;
  }
}

/** True if this guest has already used their free preview this session. */
export function guestUsedFreePreview(isAuthenticated) {
  if (isAuthenticated) return false;
  return readFreePreviewCount() >= FREE_PREVIEW_LIMIT;
}

/** Call when a guest opens a proof chart. Returns whether to show soft-gate sheet. */
export function onGuestProofOpen(isAuthenticated) {
  if (isAuthenticated) return false;
  const used = readFreePreviewCount() >= FREE_PREVIEW_LIMIT;
  if (!used) bumpFreePreviewCount();
  return used; // second+ open → show account tease
}

export function emitSoftGateOpen() {
  try {
    window.dispatchEvent(new CustomEvent("lq-soft-gate-open"));
  } catch {
    /* ignore */
  }
}

export function emitSoftGateClose() {
  try {
    window.dispatchEvent(new CustomEvent("lq-soft-gate-close"));
  } catch {
    /* ignore */
  }
}
