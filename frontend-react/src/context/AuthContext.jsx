// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi';
import { clearAutotradeAuth, syncCryptobotAuth } from '../services/autotradeApi';
import { getStoredRef, clearStoredRef } from '../utils/referralStorage';
import { openTelegramAuth } from '../utils/telegramLoader';
import { LoadingScreen } from '../components/ui/Loaders';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Check token on mount ───
  useEffect(() => {
    let cancelled = false;

    const getMeWithTimeout = () =>
      Promise.race([
        authApi.getMe(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Auth check timeout')), 8000)
        ),
      ]);

    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Validate the session, but RETRY through TRANSIENT backend hiccups
      // (deploy reload, momentary 5xx / timeout / network) so a single failed
      // /auth/me never bounces a still-logged-in user to the login page. Only a
      // genuine 401 (token invalid/expired — and authApi already tried a token
      // refresh before surfacing it) means we should actually log out.
      const MAX_ATTEMPTS = 4;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt++) {
        try {
          const userData = await getMeWithTimeout();
          if (!cancelled) {
            setUser(userData);
            setLoading(false);
          }
          return;
        } catch (err) {
          if (err?.response?.status === 401) {
            // Genuine auth failure → clear token and log out.
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
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
          // do NOT destroy the session; just stop the spinner. Per-request auth
          // will re-validate once the backend is reachable again.
          if (!cancelled) setLoading(false);
        }
      }
    };

    initAuth();
    return () => { cancelled = true; };
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
      const params = referralCode ? `?referral_code=${encodeURIComponent(referralCode)}` : '';
      const res = await fetch(`/api/v1/auth/google/url${params}`);
      if (!res.ok) throw new Error(`auth url request failed: ${res.status}`);
      const data = await res.json();

      // Note: don't clearStoredRef here — the user hasn't logged in yet (just
      // redirecting). Same pattern as Discord: cleared after a successful
      // callback (GoogleCallback.jsx).

      window.location.href = data.url;
    } catch (err) {
      const message = 'Google sign-in failed. Please try again.';
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
      if (err.message === 'cancelled') throw err; // user batal — diam
      const message = 'Telegram is still loading. Please try again in a moment.';
      setError(message);
      throw new Error(message);
    }

    try {
      // ─── Layer 6: forward stored referral code ───
      const referralCode = getStoredRef();
      const result = await authApi.telegramLogin(telegramUser, referralCode);

      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('refresh_token', result.refresh_token);
      if (result.cryptobot_token) {
        await syncCryptobotAuth(result.cryptobot_token);
      }

      // Clear pending ref after successful login
      if (referralCode) clearStoredRef();

      setUser(result.user);
      return result;
    } catch (err) {
      const message = err.response?.data?.detail || 'Telegram sign-in failed. Please try again.';
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
      const message = err.response?.data?.detail || 'Discord sign-in failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  // ─── Refresh VIP Status (periodic) ───
  const refreshVipStatus = useCallback(async () => {
    try {
      const result = await authApi.refreshVipStatus();
      if (result.updated && user) {
        setUser(prev => prev ? { ...prev, role: result.new_role } : prev);
      }
      return result;
    } catch (err) {
      console.error('Failed to refresh VIP status:', err);
      return null;
    }
  }, [user]);

  // ─── Periodic VIP Check (every 30 minutes) ───
  useEffect(() => {
    if (!user?.telegram_id) return;

    const interval = setInterval(() => {
      refreshVipStatus();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user?.telegram_id, refreshVipStatus]);

  // ─── Logout ───
  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
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
    // googleReady dipertahankan demi kompatibilitas konsumen lama.
    // Redirect flow tidak butuh SDK, jadi selalu siap.
    googleReady: true,
    logout,
    loginWithGoogle,
    loginWithTelegram,
    loginWithDiscord,
    refreshVipStatus,
    setUser,
    setError
  };

  if (loading) {
    return (
      <AuthContext.Provider value={value}>
        <LoadingScreen />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};