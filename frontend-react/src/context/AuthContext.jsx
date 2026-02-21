// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi';

const AuthContext = createContext(null);

// Google Client ID — sama dengan yang di backend
const GOOGLE_CLIENT_ID = '352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com';

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
  const [googleReady, setGoogleReady] = useState(false);

  // ─── Load Google Identity Services SDK ───
  useEffect(() => {
    // Cek apakah script sudah ada
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
      // SDK loaded, tapi initialization dilakukan saat loginWithGoogle dipanggil
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

  // ─── Standard login ───
  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const response = await authApi.login(email, password);
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      setUser(response.user);
      return response;
    } catch (err) {
      const message = err.response?.data?.detail || 'Login gagal';
      setError(message);
      throw err;
    }
  }, []);

  // ─── Standard register ───
  const register = useCallback(async (email, username, password) => {
    setError(null);
    try {
      const response = await authApi.register(email, username, password);
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      setUser(response.user);
      return response;
    } catch (err) {
      const message = err.response?.data?.detail || 'Registrasi gagal';
      setError(message);
      throw err;
    }
  }, []);

  // ─── Google Login via GSI Popup ───
  const loginWithGoogle = useCallback(() => {
    return new Promise((resolve, reject) => {
      setError(null);

      if (!window.google?.accounts?.id) {
        const msg = 'Google login belum siap. Coba refresh halaman.';
        setError(msg);
        reject(new Error(msg));
        return;
      }

      // Initialize GSI with callback
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          // response.credential = id_token dari Google
          try {
            const result = await authApi.googleLogin(response.credential);
            localStorage.setItem('access_token', result.access_token);
            localStorage.setItem('refresh_token', result.refresh_token);
            setUser(result.user);
            resolve(result);
          } catch (err) {
            const message = err.response?.data?.detail || 'Google login gagal';
            setError(message);
            reject(err);
          }
        },
        auto_select: false,
        itp_support: true,
      });

      // Trigger popup Google One Tap / account chooser
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          // One Tap tidak bisa ditampilkan, fallback ke tombol biasa
          // Ini bisa terjadi karena browser block popup, cooldown, dll
          console.log('One Tap not displayed:', notification.getNotDisplayedReason());
          
          // Fallback: gunakan renderButton approach
          // Buat temporary container untuk Google button
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'fixed';
          tempDiv.style.top = '50%';
          tempDiv.style.left = '50%';
          tempDiv.style.transform = 'translate(-50%, -50%)';
          tempDiv.style.zIndex = '99999';
          tempDiv.style.background = 'rgba(0,0,0,0.8)';
          tempDiv.style.padding = '32px';
          tempDiv.style.borderRadius = '16px';
          tempDiv.style.border = '1px solid rgba(212,168,83,0.3)';
          tempDiv.id = 'google-fallback-container';
          
          // Close button
          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '✕';
          closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;color:#8a7a6e;background:none;border:none;font-size:18px;cursor:pointer;';
          closeBtn.onclick = () => { document.body.removeChild(tempDiv); reject(new Error('Dibatalkan')); };
          tempDiv.appendChild(closeBtn);
          
          // Title
          const title = document.createElement('p');
          title.textContent = 'Pilih akun Google';
          title.style.cssText = 'color:#b8a89a;margin-bottom:16px;text-align:center;font-size:14px;';
          tempDiv.appendChild(title);
          
          // Google button container
          const btnDiv = document.createElement('div');
          btnDiv.id = 'google-fallback-btn';
          tempDiv.appendChild(btnDiv);
          
          document.body.appendChild(tempDiv);
          
          window.google.accounts.id.renderButton(btnDiv, {
            theme: 'filled_black',
            size: 'large',
            width: 280,
            text: 'continue_with',
          });
        }
        
        if (notification.isDismissedMoment()) {
          console.log('One Tap dismissed:', notification.getDismissedReason());
          // Hapus fallback container jika ada
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

      // Telegram Login Widget menggunakan callback approach
      // Kita set global callback function yang dipanggil oleh widget
      window.onTelegramAuth = async (telegramUser) => {
        try {
          const result = await authApi.telegramLogin(telegramUser);
          localStorage.setItem('access_token', result.access_token);
          localStorage.setItem('refresh_token', result.refresh_token);
          setUser(result.user);
          
          // Hapus fallback container kalau ada
          const container = document.getElementById('telegram-login-container');
          if (container) document.body.removeChild(container);
          
          resolve(result);
        } catch (err) {
          const message = err.response?.data?.detail || 'Telegram login gagal';
          setError(message);
          reject(err);
        }
      };

      // Buat popup overlay dengan Telegram Login Widget
      const container = document.createElement('div');
      container.id = 'telegram-login-container';
      container.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);';
      
      // Inner card
      const card = document.createElement('div');
      card.style.cssText = 'background:#1a1014;padding:32px;border-radius:16px;border:1px solid rgba(212,168,83,0.3);text-align:center;min-width:300px;';
      
      // Title
      const title = document.createElement('p');
      title.textContent = 'Login dengan Telegram';
      title.style.cssText = 'color:#b8a89a;margin-bottom:20px;font-size:16px;font-weight:600;';
      card.appendChild(title);

      // Telegram widget script
      const widgetDiv = document.createElement('div');
      widgetDiv.style.cssText = 'display:flex;justify-content:center;margin-bottom:16px;';
      
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

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Batal';
      closeBtn.style.cssText = 'color:#8a7a6e;background:none;border:1px solid rgba(212,168,83,0.2);padding:8px 24px;border-radius:12px;cursor:pointer;font-size:14px;margin-top:8px;';
      closeBtn.onmouseenter = () => { closeBtn.style.borderColor = 'rgba(212,168,83,0.5)'; closeBtn.style.color = '#b8a89a'; };
      closeBtn.onmouseleave = () => { closeBtn.style.borderColor = 'rgba(212,168,83,0.2)'; closeBtn.style.color = '#8a7a6e'; };
      closeBtn.onclick = () => { 
        document.body.removeChild(container);
        reject(new Error('Dibatalkan'));
      };
      card.appendChild(closeBtn);

      container.appendChild(card);
      
      // Close on backdrop click
      container.onclick = (e) => {
        if (e.target === container) {
          document.body.removeChild(container);
          reject(new Error('Dibatalkan'));
        }
      };
      
      document.body.appendChild(container);
    });
  }, []);

  // ─── Refresh VIP Status (periodik) ───
  const refreshVipStatus = useCallback(async () => {
    try {
      const result = await authApi.refreshVipStatus();
      if (result.updated && user) {
        // Update local user state dengan role baru
        setUser(prev => prev ? { ...prev, role: result.new_role } : prev);
      }
      return result;
    } catch (err) {
      console.error('Failed to refresh VIP status:', err);
      return null;
    }
  }, [user]);

  // ─── Periodic VIP Check (setiap 30 menit) ───
  useEffect(() => {
    if (!user?.telegram_id) return;
    
    // Check VIP status setiap 30 menit
    const interval = setInterval(() => {
      refreshVipStatus();
    }, 30 * 60 * 1000); // 30 menit
    
    return () => clearInterval(interval);
  }, [user?.telegram_id, refreshVipStatus]);

  // ─── Logout ───
  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setError(null);
    
    // Revoke Google session juga
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
    login,
    register,
    logout,
    loginWithGoogle,
    loginWithTelegram,
    refreshVipStatus,
    setUser,
    setError
  };

  // Don't render children until initial auth check is done
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