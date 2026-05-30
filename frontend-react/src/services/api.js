// src/services/api.js
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — shared Axios instance
// - baseURL: /api/v1 (semua endpoint relatif ke sini)
// - request interceptor: auto-inject Bearer token dari localStorage
//   (key: "access_token") ke SETIAP request. Endpoint public aman —
//   server abaikan header kalau nggak perlu.
// - response interceptor: kalau 401 (token invalid/expired), bersihin
//   token biar guard frontend bisa redirect ke login.
// ════════════════════════════════════════════════════════════════
import axios from "axios";

const API_BASE = "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// ── Request: inject token ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response: handle auth errors ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    // 401 = token invalid/expired → clear biar guard redirect ke login.
    // (403 = role kurang / subscription → JANGAN clear token, user tetap
    //  login, cuma nggak punya akses fitur itu.)
    if (status === 401) {
      try {
        localStorage.removeItem("access_token");
      } catch {
        /* noop */
      }
    }
    return Promise.reject(error);
  }
);

// ════════════════════════════════════════════════════════════════
// Domain API helpers
// ════════════════════════════════════════════════════════════════
export const signalsApi = {
  // Get paginated signals
  getSignals: async (page = 1, pageSize = 20, status = null, pair = null) => {
    const params = { page, page_size: pageSize };
    if (status) params.status = status;
    if (pair) params.pair = pair;
    const response = await api.get("/signals/", { params });
    return response.data;
  },

  // Get active signals only
  getActiveSignals: async (limit = 20) => {
    const response = await api.get("/signals/active", { params: { limit } });
    return response.data;
  },

  // Get signal stats
  getStats: async () => {
    const response = await api.get("/signals/stats");
    return response.data;
  },

  // Get single signal
  getSignal: async (signalId) => {
    const response = await api.get(`/signals/${signalId}`);
    return response.data;
  },
};

export const marketApi = {
  // Get market overview
  getOverview: async () => {
    const response = await api.get("/market/overview");
    return response.data;
  },

  // Get BTC price
  getBtcPrice: async () => {
    const response = await api.get("/market/btc-price");
    return response.data;
  },
};

export default api;
