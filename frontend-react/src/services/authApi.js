// frontend-react/src/services/authApi.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - tambah token ke header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken
          });

          localStorage.setItem('access_token', response.data.access_token);
          localStorage.setItem('refresh_token', response.data.refresh_token);

          originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  /**
   * Google OAuth — kirim id_token dari GSI ke backend.
   * @param {string} idToken - dari window.google.accounts.id callback
   * @param {string|null} referralCode - optional, dari ?ref= di URL atau localStorage
   */
  googleLogin: async (idToken, referralCode = null) => {
    const body = { id_token: idToken };
    if (referralCode) body.referral_code = referralCode;
    const response = await api.post('/api/v1/auth/google', body);
    return response.data;
  },

  /**
   * Telegram Login — kirim auth data dari Telegram Widget ke backend.
   * @param {object} telegramData - { id, first_name, ..., hash }
   * @param {string|null} referralCode - optional
   */
  telegramLogin: async (telegramData, referralCode = null) => {
    const body = { ...telegramData };
    if (referralCode) body.referral_code = referralCode;
    const response = await api.post('/api/v1/auth/telegram', body);
    return response.data;
  },

  /**
   * Discord OAuth2 — get authorization URL.
   * referralCode di-pass via query param, backend encode ke OAuth `state`
   * yang akan ke-passback saat Discord redirect ke /callback.
   * @param {string|null} referralCode - optional
   */
  discordGetUrl: async (referralCode = null) => {
    const params = referralCode ? { referral_code: referralCode } : {};
    const response = await api.get('/api/v1/auth/discord/url', { params });
    return response.data;
  },

  // Check VIP status
  checkVipStatus: async () => {
    const response = await api.get('/api/v1/auth/telegram/check-vip');
    return response.data;
  },

  // Refresh VIP status (update role di DB)
  refreshVipStatus: async () => {
    const response = await api.post('/api/v1/auth/telegram/refresh-vip');
    return response.data;
  },

  // Link Telegram ke existing account
  linkTelegram: async (telegramData) => {
    const response = await api.post('/api/v1/auth/telegram/link', telegramData);
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/api/v1/auth/logout');
    return response.data;
  },

  refreshToken: async (refreshToken) => {
    const response = await api.post('/api/v1/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  }
};

export default api;
