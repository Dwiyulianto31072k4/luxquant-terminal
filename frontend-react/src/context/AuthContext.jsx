// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi';
import { clearAutotradeAuth, syncCryptobotAuth } from '../services/autotradeApi';
import { getStoredRef, clearStoredRef } from '../utils/referralStorage';

const AuthContext = createContext(null);

// Google Client ID — must match backend
const GOOGLE_CLIENT_ID = '352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

/* ── Shared modal helpers (vanilla DOM, brand-styled) ── */
const MODAL_KEYFRAMES_ID = 'lq-auth-modal-styles';
const ensureModalStyles = () => {
  if (document.getElementById(MODAL_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = MODAL_KEYFRAMES_ID;
  style.textContent = `
    @keyframes lq-modal-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes lq-modal-pop { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  `;
  document.head.appendChild(style);
};

const buildOverlay = (id) => {
  ensureModalStyles();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:16px',
    'background:rgba(5,3,2,0.78)',
    'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
    'animation:lq-modal-fade 0.2s ease-out',
  ].join(';');
  return overlay;
};

const buildCard = () => {
  const card = document.createElement('div');
  card.style.cssText = [
    'position:relative',
    'background:linear-gradient(165deg, #15100c 0%, #0c0806 100%)',
    'padding:36px 32px 28px',
    'border-radius:20px',
    'border:1px solid rgba(212,168,83,0.18)',
    'box-shadow:0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(212,168,83,0.05)',
    'text-align:center',
    'width:100%', 'max-width:360px',
    'animation:lq-modal-pop 0.25s cubic-bezier(0.16,1,0.3,1)',
  ].join(';');

  // Gold hairline on top edge
  const hairline = document.createElement('div');
  hairline.style.cssText = 'position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(to right, transparent, rgba(212,168,83,0.5), transparent);';
  card.appendChild(hairline);

  return card;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);

  // ─── Load Google Identity Services SDK ───
  useEffect(() => {
    if (document.getElementById('google-gsi-script')) {
      if (window.google?.accounts?.id) {
        setGoogleReady(true);
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setGoogleReady(true);
    };
    script.onerror = () => {
      console.error('Failed to load Google Identity Services SDK');
    };
    document.head.appendChild(script);
  }, []);

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

  // ─── Google Login via GSI Popup ───
  const loginWithGoogle = useCallback(() => {
    return new Promise((resolve, reject) => {
      setError(null);

      if (!window.google?.accounts?.id) {
        const msg = 'Google sign-in is still loading. Please refresh the page and try again.';
        setError(msg);
        reject(new Error(msg));
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            // ─── Layer 6: forward stored referral code ───
            const referralCode = getStoredRef();
            const result = await authApi.googleLogin(response.credential, referralCode);

            localStorage.setItem('access_token', result.access_token);
            localStorage.setItem('refresh_token', result.refresh_token);
            if (result.cryptobot_token) {
              await syncCryptobotAuth(result.cryptobot_token);
            }

            // Clear pending ref after successful login
            // (backend ignores it for existing users, so safe to clear)
            if (referralCode) clearStoredRef();

            setUser(result.user);
            resolve(result);
          } catch (err) {
            const message = err.response?.data?.detail || 'Google sign-in failed. Please try again.';
            setError(message);
            reject(err);
          }
        },
        auto_select: false,
        itp_support: true,
      });

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.log('One Tap not displayed:', notification.getNotDisplayedReason());

          const overlay = buildOverlay('google-fallback-container');
          const card = buildCard();

          // Close (×) button
          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '✕';
          closeBtn.setAttribute('aria-label', 'Close');
          closeBtn.style.cssText = 'position:absolute;top:12px;right:14px;color:#8a7a6e;background:none;border:none;font-size:16px;cursor:pointer;line-height:1;padding:4px;';
          closeBtn.onmouseenter = () => { closeBtn.style.color = '#d4cfc8'; };
          closeBtn.onmouseleave = () => { closeBtn.style.color = '#8a7a6e'; };
          closeBtn.onclick = () => { document.body.removeChild(overlay); reject(new Error('cancelled')); };
          card.appendChild(closeBtn);

          // Title
          const title = document.createElement('p');
          title.textContent = 'Choose your Google account';
          title.style.cssText = "color:#f0ece6;margin-bottom:20px;font-size:16px;font-weight:600;font-family:'Space Grotesk',sans-serif;";
          card.appendChild(title);

          // Google button container
          const btnDiv = document.createElement('div');
          btnDiv.id = 'google-fallback-btn';
          btnDiv.style.cssText = 'display:flex;justify-content:center;';
          card.appendChild(btnDiv);

          overlay.appendChild(card);
          overlay.onclick = (e) => {
            if (e.target === overlay) { document.body.removeChild(overlay); reject(new Error('cancelled')); }
          };
          document.body.appendChild(overlay);

          window.google.accounts.id.renderButton(btnDiv, {
            theme: 'filled_black',
            size: 'large',
            width: 280,
            text: 'continue_with',
          });
        }

        if (notification.isDismissedMoment()) {
          console.log('One Tap dismissed:', notification.getDismissedReason());
          const fallback = document.getElementById('google-fallback-container');
          if (fallback) document.body.removeChild(fallback);
        }
      });
    });
  }, []);

  // ─── Telegram Login via Widget ───
  const loginWithTelegram = useCallback(() => {
    return new Promise((resolve, reject) => {
      setError(null);

      window.onTelegramAuth = async (telegramUser) => {
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

          const container = document.getElementById('telegram-login-container');
          if (container) document.body.removeChild(container);

          resolve(result);
        } catch (err) {
          const message = err.response?.data?.detail || 'Telegram sign-in failed. Please try again.';
          setError(message);
          reject(err);
        }
      };

      const overlay = buildOverlay('telegram-login-container');
      const card = buildCard();

      // Telegram badge icon
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'width:52px;height:52px;margin:0 auto 16px;border-radius:16px;background:rgba(41,171,226,0.1);border:1px solid rgba(41,171,226,0.25);display:flex;align-items:center;justify-content:center;';
      iconWrap.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#29ABE2"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';
      card.appendChild(iconWrap);

      // Title + subtitle
      const title = document.createElement('p');
      title.textContent = 'Sign in with Telegram';
      title.style.cssText = "color:#f0ece6;margin-bottom:6px;font-size:17px;font-weight:600;font-family:'Space Grotesk',sans-serif;";
      card.appendChild(title);

      const subtitle = document.createElement('p');
      subtitle.textContent = 'Authorize with your Telegram account to continue';
      subtitle.style.cssText = 'color:#8a7a6e;margin-bottom:22px;font-size:12.5px;line-height:1.5;';
      card.appendChild(subtitle);

      // Telegram widget
      const widgetDiv = document.createElement('div');
      widgetDiv.style.cssText = 'display:flex;justify-content:center;margin-bottom:18px;min-height:46px;';

      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', 'LuxQuantTerminalBot');
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-radius', '12');
      script.async = true;
      widgetDiv.appendChild(script);
      card.appendChild(widgetDiv);

      // Cancel button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Cancel';
      closeBtn.style.cssText = 'color:#8a7a6e;background:none;border:1px solid rgba(212,168,83,0.18);padding:9px 28px;border-radius:12px;cursor:pointer;font-size:13px;transition:all 0.2s;';
      closeBtn.onmouseenter = () => { closeBtn.style.borderColor = 'rgba(212,168,83,0.45)'; closeBtn.style.color = '#d4cfc8'; };
      closeBtn.onmouseleave = () => { closeBtn.style.borderColor = 'rgba(212,168,83,0.18)'; closeBtn.style.color = '#8a7a6e'; };
      closeBtn.onclick = () => {
        document.body.removeChild(overlay);
        reject(new Error('cancelled'));
      };
      card.appendChild(closeBtn);

      overlay.appendChild(card);

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          reject(new Error('cancelled'));
        }
      };

      document.body.appendChild(overlay);
    });
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

    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    googleReady,
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
