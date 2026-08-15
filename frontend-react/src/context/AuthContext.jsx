// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { authApi } from "../services/authApi";
import { clearAutotradeAuth, syncCryptobotAuth } from "../services/autotradeApi";
import { getStoredRef, clearStoredRef } from "../utils/referralStorage";
import { openTelegramAuth } from "../utils/telegramLoader";
import { getStoredAcq } from "../utils/acqAttribution";
import { trackFunnel } from "../utils/funnelAnalytics";
import { clearAuthRescueState } from "../utils/authRescue";
import {
  miniAppInitData,
  ensureMiniAppSdk,
  markMiniAppReady,
  initDataPreferSdk,
} from "../utils/telegramWebApp";
import { LoadingScreen } from "../components/ui/Loaders";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

// Why Telegram sign-in failed, in the words the person needs. Keyed by the
// reason telegramLoader rejects with; see utils/telegramLoader.js.
const TG_AUTH_FAILURES = {
  // The browser refused the popup. Retrying does nothing — LoginPage picks up
  // the same signal and offers the redirect flow instead.
  "popup-unreachable":
    "Your browser blocked the Telegram window. Use the sign-in link below, or allow pop-ups for this site.",
  // Genuinely not loaded yet: the widget script had not finished when the
  // button was pressed.
  "not-ready": "Telegram is still loading. Please try again in a moment.",
  "telegram-load-timeout":
    "Telegram could not be reached. Check your connection, or sign in with Google instead.",
  default: "Telegram sign-in did not complete. Please try again, or use Google instead.",
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Token is still held but /auth/me could not be reached. NOT the same thing
  // as logged out — see the guard in App.jsx.
  const [authUnreachable, setAuthUnreachable] = useState(false);

  // ─── Check token on mount ───
  useEffect(() => {
    let cancelled = false;

    const getMeWithTimeout = () =>
      Promise.race([
        authApi.getMe(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Auth check timeout")), 8000)),
      ]);

    const initAuth = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        // Inside Telegram there is nobody to ask for a login: Telegram already
        // signed who this is. Sign them in before showing a sign-in screen they
        // do not need — and which, in this very browser, is the one that keeps
        // failing.
        const initData = miniAppInitData();
        if (initData) {
          ensureMiniAppSdk().then(markMiniAppReady);
          try {
            const referralCode = getStoredRef();
            const acq = getStoredAcq();
            const result = await authApi.telegramWebAppLogin(initData, referralCode, acq);
            localStorage.setItem("access_token", result.access_token);
            localStorage.setItem("refresh_token", result.refresh_token);
            if (result.cryptobot_token) {
              await syncCryptobotAuth(result.cryptobot_token);
            }
            if (referralCode) clearStoredRef();
            // is_new separates a signup from a sign-in. Mini App boot looks
            // like a session restore but genuinely creates the account on a
            // first open, so the flag has to come from the server, not the mode.
            trackFunnel("auth_success", {
              provider: "telegram",
              source: "miniapp",
              meta: { mode: "miniapp_boot", is_new: !!result.is_new_user },
            });
            clearAuthRescueState();
            if (!cancelled) {
              setUser(result.user);
              setLoading(false);
            }
            return;
          } catch {
            // Fall through to the normal logged-out state — a Mini App that
            // cannot authenticate is still a usable public site.
          }
        }
        setLoading(false);
        return;
      }

      // Validate the session, but RETRY through TRANSIENT backend hiccups
      // (deploy reload, momentary 5xx / timeout / network) so a single failed
      // /auth/me never bounces a still-logged-in user to the login page. Only a
      // genuine 401 (token invalid/expired — and authApi already tried a token
      // refresh before surfacing it) means we should actually log out.
      // After MAX_ATTEMPTS we stop the spinner and show the "can't reach the
      // server" screen, but we KEEP probing every RETRY_MS — a screen that sits
      // there stuck until the user thinks to click reload is barely better than
      // the login bounce it replaced. When the API answers, the session simply
      // resumes on its own.
      const MAX_ATTEMPTS = 4;
      const RETRY_MS = 5000;
      for (let attempt = 1; !cancelled; attempt++) {
        try {
          const userData = await getMeWithTimeout();
          if (!cancelled) {
            setUser(userData);
            setAuthUnreachable(false);
            setLoading(false);
          }
          return;
        } catch (err) {
          if (err?.response?.status === 401) {
            // Genuine auth failure → clear token and log out.
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            if (!cancelled) {
              setUser(null);
              setLoading(false);
            }
            return;
          }
          // Transient error → DON'T touch the token, wait a bit, and retry.
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, attempt * 1500));
            continue;
          }
          // Retries exhausted but token is still (as far as we know) valid —
          // do NOT destroy the session; just stop the spinner.
          //
          // Keeping the token was never enough on its own: `user` stayed null,
          // so isAuthenticated read false and the route guard bounced a still
          // logged-in admin to /login mid-deploy. Flag the difference between
          // "not authenticated" and "could not ask" so the guard can wait.
          if (!cancelled) {
            setAuthUnreachable(true);
            setLoading(false);
          }
          await new Promise((r) => setTimeout(r, RETRY_MS));
        }
      }
    };

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Google Login via OAuth2 Redirect (full-page, Cloudflare-style) ───
  // Catatan: flow GSI popup lama (POST /auth/google) tetap ada di backend
  // sebagai fallback, tapi frontend sekarang pakai redirect flow yang juga
  // lebih kompatibel dengan in-app browser/webview.
  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      // ─── Layer 6: forward stored referral code via OAuth state ───
      const referralCode = getStoredRef();
      const params = referralCode ? `?referral_code=${encodeURIComponent(referralCode)}` : "";
      const res = await fetch(`/api/v1/auth/google/url${params}`);
      if (!res.ok) throw new Error(`auth url request failed: ${res.status}`);
      const data = await res.json();

      // Note: don't clearStoredRef here — the user hasn't logged in yet (just
      // redirecting). Same pattern as Discord: cleared after a successful
      // callback (GoogleCallback.jsx).

      window.location.href = data.url;
    } catch (err) {
      const message = "Google sign-in failed. Please try again.";
      setError(message);
      throw err;
    }
  }, []);

  // ─── Telegram Login via Telegram.Login.auth ───
  // Tombol "Continue with Telegram" di LoginPage adalah tombol React kita
  // sendiri (selalu ada). Saat diklik, openTelegramAuth() membuka popup OAuth
  // Telegram langsung — tidak ada lagi inject <script> per-klik, jadi bug
  // "card muncul tapi tombolnya tidak" hilang permanen.
  //
  // PENTING: openTelegramAuth() dipanggil SEBELUM await pertama, supaya
  // window.open Telegram tetap di dalam gesture klik (anti popup-blocker).
  const loginWithTelegram = useCallback(async () => {
    setError(null);

    let telegramUser;
    try {
      telegramUser = await openTelegramAuth(); // popup kebuka sinkron di sini
    } catch (err) {
      if (err.message === "cancelled") throw err; // user batal — diam
      // Each reason needs different advice. "Still loading, try again" is
      // actively wrong for a blocked popup — waiting cannot unblock it, so the
      // instruction sends people into an unwinnable retry loop.
      const message = TG_AUTH_FAILURES[err.message] || TG_AUTH_FAILURES.default;
      // Popup loss is already measured as auth_popup_blocked/auth_abandoned
      // and LoginPage has a working Mini App rescue visible. Do not turn the
      // same incident into a second red auth_error banner 90 seconds later.
      if (err.message !== "popup-unreachable") setError(message);
      const wrapped = new Error(message);
      wrapped.reason = err.message; // so callers report the cause, not the copy
      throw wrapped;
    }

    try {
      // ─── Layer 6: forward stored referral code + first-touch acq ───
      const referralCode = getStoredRef();
      const acq = getStoredAcq();
      const result = await authApi.telegramLogin(telegramUser, referralCode, acq);

      localStorage.setItem("access_token", result.access_token);
      localStorage.setItem("refresh_token", result.refresh_token);
      if (result.cryptobot_token) {
        await syncCryptobotAuth(result.cryptobot_token);
      }

      // Clear pending ref after successful login
      if (referralCode) clearStoredRef();
      // Claim again in case body acq was ignored (idempotent)
      if (acq) authApi.claimAcq(acq).catch(() => {});

      setUser(result.user);
      clearAuthRescueState();
      return result;
    } catch (err) {
      const message = err.response?.data?.detail || "Telegram sign-in failed. Please try again.";
      setError(message);
      throw err;
    }
  }, []);

  // Signing out inside a Mini App used to strand people: the login screen it
  // fell back to offers "Continue with Telegram", which is the popup flow —
  // the one thing that cannot work in Telegram's own browser. Telegram still
  // has the signed identity, so ask it again rather than opening a window.
  const loginWithMiniApp = useCallback(async () => {
    setError(null);
    const initData = await initDataPreferSdk();
    if (!initData) {
      const message = "Telegram sign-in is unavailable here.";
      setError(message);
      throw new Error(message);
    }
    try {
      const referralCode = getStoredRef();
      const acq = getStoredAcq();
      const result = await authApi.telegramWebAppLogin(initData, referralCode, acq);
      localStorage.setItem("access_token", result.access_token);
      localStorage.setItem("refresh_token", result.refresh_token);
      if (result.cryptobot_token) {
        await syncCryptobotAuth(result.cryptobot_token);
      }
      if (referralCode) clearStoredRef();
      setUser(result.user);
      clearAuthRescueState();
      return result;
    } catch (err) {
      const message = err.response?.data?.detail || "Telegram sign-in failed.";
      setError(message);
      throw err;
    }
  }, []);

  // ─── Discord Login via OAuth2 Redirect ───
  const loginWithDiscord = useCallback(async () => {
    setError(null);
    try {
      // ─── Layer 6: forward stored referral code via OAuth state ───
      const referralCode = getStoredRef();
      const data = await authApi.discordGetUrl(referralCode);

      // Note: don't clearStoredRef here — the user hasn't logged in yet (just redirecting).
      // The backend handles it after a successful callback. localStorage stays persisted
      // until the user returns from the Discord callback. After the redirect to
      // /auth/discord/callback succeeds, it's cleared there (DiscordCallback.jsx).

      window.location.href = data.url;
    } catch (err) {
      const message = err.response?.data?.detail || "Discord sign-in failed. Please try again.";
      setError(message);
      throw err;
    }
  }, []);

  // ─── Refresh VIP Status (periodic) ───
  // ─── Re-read the session from the server ───────────────────────
  //
  // PaymentPage has always called this on a confirmed payment — and it has
  // always been `undefined`, because the provider never exposed it. Both
  // branches of `if (refreshUser)` were dead, so the role in memory stayed
  // `free` until a full page reload re-ran /auth/me. That is the whole of
  // "I paid but still can't get in; I refreshed and then it worked".
  //
  // `next` is the already-fresh user some endpoints hand back (the payment
  // verify response carries one), which saves a round-trip at the exact moment
  // the customer is watching.
  const refreshUser = useCallback(async (next) => {
    if (next && typeof next === "object") {
      setUser(next);
      return next;
    }
    try {
      const fresh = await authApi.getMe();
      setUser(fresh);
      setAuthUnreachable(false);
      return fresh;
    } catch (err) {
      // A transient failure must not log anyone out — that is the rule the
      // mount-time check already follows. Only a genuine 401 is authority.
      if (err?.response?.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      }
      return null;
    }
  }, []);

  // ─── Pick up entitlement changes made elsewhere ────────────────
  //
  // A self-serve payment updates the session directly. A payment an operator
  // confirms by hand does not: that customer is sitting on a stale role with
  // no way to know, which is the other half of the same complaint. Re-reading
  // on tab focus closes it within a second of them looking back at the app,
  // and costs one request — throttled, so flicking between tabs cannot turn
  // into a poll.
  const lastSyncRef = useRef(0);
  useEffect(() => {
    if (!user) return undefined;
    const MIN_GAP_MS = 30000;
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSyncRef.current < MIN_GAP_MS) return;
      lastSyncRef.current = now;
      refreshUser();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [user, refreshUser]);

  const refreshVipStatus = useCallback(async () => {
    try {
      const result = await authApi.refreshVipStatus();
      if (result.updated && user) {
        setUser((prev) => (prev ? { ...prev, role: result.new_role } : prev));
      }
      return result;
    } catch (err) {
      console.error("Failed to refresh VIP status:", err);
      return null;
    }
  }, [user]);

  // ─── Periodic VIP Check (every 30 minutes) ───
  useEffect(() => {
    if (!user?.telegram_id) return;

    const interval = setInterval(
      () => {
        refreshVipStatus();
      },
      30 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [user?.telegram_id, refreshVipStatus]);

  // ─── Logout ───
  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    clearAutotradeAuth();
    setUser(null);
    setError(null);

    // Guard: GSI script tidak lagi di-load oleh app, tapi jaga-jaga kalau
    // masih ada di halaman (mis. dari cache/extension).
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    authUnreachable,
    // googleReady dipertahankan demi kompatibilitas konsumen lama.
    // Redirect flow tidak butuh SDK, jadi selalu siap.
    googleReady: true,
    logout,
    loginWithGoogle,
    loginWithTelegram,
    loginWithMiniApp,
    loginWithDiscord,
    refreshVipStatus,
    refreshUser,
    setUser,
    setError,
  };

  if (loading) {
    return (
      <AuthContext.Provider value={value}>
        <LoadingScreen />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
