// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi';
import { clearAutotradeAuth, syncCryptobotAuth } from '../services/autotradeApi';
import { getStoredRef, clearStoredRef } from '../utils/referralStorage';
import { openTelegramAuth } from '../utils/telegramLoader';

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
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await Promise.race([
          authApi.getMe(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth check timeout')), 8000)
          )
        ]);
        setUser(userData);
      } catch (err) {
        if (err?.response?.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
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
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0506' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: 'rgba(212, 168, 83, 0.2)' }} />
              <div className="absolute inset-0 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: '#d4a853' }} />
            </div>
            <p className="text-sm font-medium tracking-wide" style={{ color: '#6b5c52' }}>Loading LuxQuant...</p>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};