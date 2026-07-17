// frontend-react/src/services/authApi.js
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8002";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - tambah token ke header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - resilient token refresh.
//
// Two hardening changes vs the naive version:
// 1. SINGLE-FLIGHT: when many requests get 401 at once (dashboard fires a
// burst), they all await ONE shared refresh call instead of each firing
// its own — no refresh stampede.
// 2. ONLY log out on a GENUINE auth failure. A transient failure of the
// refresh call (timeout / 5xx / network — e.g. backend momentarily busy)
// must NOT kick the user to /login; we keep the tokens and just let the
// request fail so it can be retried. The user is only logged out when the
// refresh endpoint itself says the refresh token is invalid (401/403) or
// there is no refresh token at all.
let refreshPromise = null;

async function performRefresh() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    const err = new Error("no_refresh_token");
    err.__noRefresh = true;
    throw err;
  }
  const resp = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
    refresh_token: refreshToken,
  });
  localStorage.setItem("access_token", resp.data.access_token);
  localStorage.setItem("refresh_token", resp.data.refresh_token);
  return resp.data.access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // All concurrent 401s share ONE in-flight refresh.
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newAccessToken = await refreshPromise;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        const refreshStatus = refreshError?.response?.status;
        const hadRefreshToken = !refreshError?.__noRefresh;
        // Genuine auth failure → log out. Transient (timeout/5xx/network) → keep session.
        const isAuthFailure = !hadRefreshToken || refreshStatus === 401 || refreshStatus === 403;

        if (isAuthFailure) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
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
    const response = await api.post("/api/v1/auth/google", body);
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
    const response = await api.post("/api/v1/auth/telegram", body);
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
    const response = await api.get("/api/v1/auth/discord/url", { params });
    return response.data;
  },

  // Check VIP status
  checkVipStatus: async () => {
    const response = await api.get("/api/v1/auth/telegram/check-vip");
    return response.data;
  },

  // Refresh VIP status (update role di DB)
  refreshVipStatus: async () => {
    const response = await api.post("/api/v1/auth/telegram/refresh-vip");
    return response.data;
  },

  // Link Telegram ke existing account
  linkTelegram: async (telegramData) => {
    const response = await api.post("/api/v1/auth/telegram/link", telegramData);
    return response.data;
  },

  getMe: async () => {
    const response = await api.get("/api/v1/auth/me");
    return response.data;
  },

  getCryptobotToken: async () => {
    const paths = [
      "/api/v1/auth/me/cryptobot-token",
      "/api/v1/me/cryptobot-token",
      "/me/cryptobot-token",
    ];

    let lastError = null;

    for (const path of paths) {
      try {
        const response = await api.get(path);
        return response.data;
      } catch (err) {
        lastError = err;
        if (err?.response?.status !== 404) {
          throw err;
        }
      }
    }

    throw lastError || new Error("Cryptobot token endpoint not found");
  },

  logout: async () => {
    const response = await api.post("/api/v1/auth/logout");
    return response.data;
  },

  refreshToken: async (refreshToken) => {
    const response = await api.post("/api/v1/auth/refresh", { refresh_token: refreshToken });
    return response.data;
  },
};

export default api;
