// frontend-react/src/utils/referralStorage.js
/**
 * Referral storage helper.
 *
 * Capture ?ref= dari URL → simpan ke localStorage dengan TTL 7 hari.
 * Frontend pake helper ini di:
 * - LandingPage (saveRefFromURL on mount)
 * - AuthContext (getStoredRef saat OAuth login, clearStoredRef setelah register)
 * - LoginPage (validateRef untuk show banner)
 *
 * Storage keys:
 * - lq_pending_ref : "DWI-2026"
 * - lq_pending_ref_exp : "1731234567890" (epoch ms expiry)
 */

const STORAGE_KEY = "lq_pending_ref";
const EXPIRY_KEY = "lq_pending_ref_exp";
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Normalize referral code: uppercase, strip whitespace, validate basic shape.
 * Returns null kalau invalid format.
 */
export function normalizeRefCode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  // Basic shape check (alphanumeric + dash + underscore, 4-20 chars)
  if (!/^[A-Z0-9][A-Z0-9_-]{2,18}[A-Z0-9]$/.test(v)) return null;
  // No consecutive special chars
  if (/[-_]{2,}/.test(v)) return null;
  return v;
}

/**
 * Save referral code to localStorage.
 * Called manually atau by saveRefFromURL.
 */
export function saveRef(code) {
  const normalized = normalizeRefCode(code);
  if (!normalized) return null;

  const expiry = Date.now() + TTL_MS;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    return normalized;
  } catch (e) {
    // Storage quota exceeded atau private browsing
    console.warn("Failed to save referral code:", e);
    return null;
  }
}

/**
 * Read ?ref= dari URL, kalau ada save ke localStorage.
 * Return code yang ke-save, atau null.
 */
export function saveRefFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return null;
    return saveRef(ref);
  } catch {
    return null;
  }
}

/**
 * Get stored ref kalau belum expired.
 * Auto-cleanup kalau expired.
 */
export function getStoredRef() {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    const expiryStr = localStorage.getItem(EXPIRY_KEY);

    if (!code || !expiryStr) return null;

    const expiry = parseInt(expiryStr, 10);
    if (!expiry || Date.now() > expiry) {
      // Expired, cleanup
      clearStoredRef();
      return null;
    }

    return code;
  } catch {
    return null;
  }
}

/**
 * Clear stored ref. Call setelah register sukses.
 */
export function clearStoredRef() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Validate referral code via backend public endpoint.
 * Return { valid, code, discount_pct, referrer_username, message } atau null.
 */
export async function validateRef(code) {
  const normalized = normalizeRefCode(code);
  if (!normalized) return null;

  try {
    const response = await fetch(`${API_BASE}/api/v1/referral/validate/${normalized}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Convenience: get stored ref + validate via backend.
 * Useful untuk LoginPage banner.
 *
 * Returns:
 * { valid: true, code, referrer_username, discount_pct } → show banner
 * null → no ref or invalid
 */
export async function getStoredRefValidated() {
  const code = getStoredRef();
  if (!code) return null;

  const result = await validateRef(code);
  if (!result || !result.valid) {
    // Invalid (expired, deleted, etc) → cleanup
    clearStoredRef();
    return null;
  }
  return result;
}
