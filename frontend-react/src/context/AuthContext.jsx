// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi';

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

  // Check token on mount — with timeout to prevent stuck loading
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Race between getMe() and a timeout (8 seconds max)
        const userData = await Promise.race([
          authApi.getMe(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth check timeout')), 8000)
          )
        ]);
        setUser(userData);
      } catch (err) {
        // Token invalid / expired / backend down / timeout
        // Only clear tokens if it's an auth error (401), not a timeout or network error
        if (err?.response?.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        // For timeout or network errors, keep tokens but don't set user
        // User can retry by refreshing the page
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

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

  // LOGIN WITH GOOGLE - Fixed for Vite (dengan semua opsi yang sudah ada)
  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      // Untuk Vite, gunakan import.meta.env, BUKAN process.env
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // PENDEKATAN 1: Redirect biasa (paling umum untuk OAuth)
      console.log('Redirecting to Google auth:', `${apiUrl}/api/auth/google`);
      window.location.href = `${apiUrl}/api/auth/google`;
      
      /* 
      // PENDEKATAN 2: Jika menggunakan popup (alternatif)
      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        `${apiUrl}/api/auth/google`,
        'Google Login',
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      // Listen for message from popup
      const handleMessage = (event) => {
        if (event.origin !== apiUrl) return;
        if (event.data.token) {
          localStorage.setItem('access_token', event.data.token);
          localStorage.setItem('refresh_token', event.data.refresh_token);
          setUser(event.data.user);
          popup.close();
          window.removeEventListener('message', handleMessage);
        }
      };
      
      window.addEventListener('message', handleMessage);
      */
      
      /* 
      // PENDEKATAN 3: Testing dengan dummy data (tanpa backend)
      window.location.href = 'http://localhost:3000/auth/google/callback?token=test123&refresh_token=test456&user=%7B%22id%22:1,%22email%22:%22test%40gmail.com%22,%22name%22:%22Test%20User%22%7D';
      */
      
    } catch (err) {
      console.error('Google login error:', err);
      const message = err.response?.data?.detail || 'Google login gagal';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setError(null);
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    loginWithGoogle,
    setUser,
    setError
  };

  // Don't render children until initial auth check is done
  // This prevents flash of wrong state (blank pages, wrong redirects)
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