// frontend-react/src/services/authApi.js
import axios from "axios";
import { attachAuthRefresh } from "./authSession";

const API_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - tambah token ke header
api.interceptors.request.use(
  (config) => {
    const token = config.skipAuthHeader ? null : localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - resilient token refresh, shared with the /api/v1
// axios instance and plain fetch (see ./authSession):
// 1. SINGLE-FLIGHT: a burst of 401s awaits ONE refresh call — no stampede.
// 2. ONLY a genuine auth failure ends the session (refresh answered 401/403,
// or there is no refresh token). A timeout / 5xx / network error on the
// refresh keeps the tokens and just lets the request fail, so a busy backend
// never kicks anyone to /login.
attachAuthRefresh(api);

export const authApi = {
  /**
   * Google OAuth — kirim id_token dari GSI ke backend.
   * @param {string} idToken - dari window.google.accounts.id callback
   * @param {string|null} referralCode - optional, dari ?ref= di URL atau localStorage
   */
  googleLogin: async (idToken, referralCode = null, acq = null) => {
    const body = { id_token: idToken };
    if (referralCode) body.referral_code = referralCode;
    if (acq) body.acq = acq;
    const response = await api.post("/api/v1/auth/google", body, {
      skipAuthHeader: true,
      skipAuthRefresh: true,
    });
    return response.data;
  },

  /**
   * Telegram Login — kirim auth data dari Telegram Widget ke backend.
   * @param {object} telegramData - { id, first_name, ..., hash }
   * @param {string|null} referralCode - optional
   * @param {object|null} acq - first-touch UTM / referrer
   */
  /**
   * Telegram Mini App login — the signed initData string, verified server-side.
   * No popup, no redirect: Telegram already handed us the identity.
   */
  telegramWebAppLogin: async (initData, referralCode = null, acq = null) => {
    const body = { init_data: initData };
    if (referralCode) body.referral_code = referralCode;
    if (acq) body.acq = acq;
    const response = await api.post("/api/v1/auth/telegram/webapp", body, {
      skipAuthHeader: true,
      skipAuthRefresh: true,
    });
    return response.data;
  },

  telegramLogin: async (telegramData, referralCode = null, acq = null) => {
    const body = { ...telegramData };
    if (referralCode) body.referral_code = referralCode;
    if (acq) body.acq = acq;
    const response = await api.post("/api/v1/auth/telegram", body, {
      skipAuthHeader: true,
      skipAuthRefresh: true,
    });
    return response.data;
  },

  /**
   * Claim first-touch acquisition after OAuth redirect (Google/Discord).
   * Backend writes only if user.acq_source is still empty.
   */
  claimAcq: async (acq) => {
    if (!acq) return { ok: true, written: false };
    try {
      const response = await api.post("/api/v1/auth/me/acq", acq);
      return response.data;
    } catch {
      return { ok: false, written: false };
    }
  },

  /**
   * Discord OAuth2 — get authorization URL.
   * referralCode di-pass via query param, backend encode ke OAuth `state`
   * yang akan ke-passback saat Discord redirect ke /callback.
   * @param {string|null} referralCode - optional
   */
  discordGetUrl: async (referralCode = null) => {
    const params = referralCode ? { referral_code: referralCode } : {};
    const response = await api.get("/api/v1/auth/discord/url", {
      params,
      skipAuthHeader: true,
      skipAuthRefresh: true,
    });
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

export async function getExchangeWaitlist() {
  const response = await api.get("/api/v1/agent/exchange-waitlist");
  return response.data;
}

export async function joinExchangeWaitlist(exchange) {
  const response = await api.post("/api/v1/agent/exchange-waitlist", { exchange });
  return response.data;
}

export async function submitAgentDisclaimerAck(payload) {
  const response = await api.post("/api/v1/agent/disclaimer-acks", payload);
  return response.data;
}

export async function getMyAgentDisclaimerAcks() {
  const response = await api.get("/api/v1/agent/disclaimer-acks");
  return response.data;
}

export async function downloadMyAgentAckPdf(ackId) {
  const response = await api.get(`/api/v1/agent/disclaimer-acks/${ackId}/pdf`, {
    responseType: "blob",
  });
  return response.data;
}

export default api;
