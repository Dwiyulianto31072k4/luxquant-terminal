const API_BASE =
  import.meta.env.VITE_AUTOTRADE_API_URL ||
  import.meta.env.VITE_AUTOTRADE_URL ||
  "https://api.cryptobot.id";

export const AUTOTRADE_TOKEN_KEY = "autotrade_access_token";
export const AUTOTRADE_REFRESH_TOKEN_KEY = "autotrade_refresh_token";
export const AUTOTRADE_REDIRECT_KEY = "autotrade_post_login_redirect";
export const CRYPTOBOT_TOKEN_KEY = "cryptobot_token";
export const LUXQUANT_CRYPTOBOT_TOKEN_KEY = "luxquant_cryptobot_token";

function getToken() {
  return (
    localStorage.getItem(AUTOTRADE_TOKEN_KEY) ||
    localStorage.getItem(CRYPTOBOT_TOKEN_KEY) ||
    localStorage.getItem("autotrade_bearer_token") ||
    ""
  );
}

export function storeAutotradeAuth(accessToken, refreshToken = null) {
  localStorage.setItem(AUTOTRADE_TOKEN_KEY, accessToken);
  localStorage.setItem(CRYPTOBOT_TOKEN_KEY, accessToken);

  if (refreshToken) {
    localStorage.setItem(AUTOTRADE_REFRESH_TOKEN_KEY, refreshToken);
  } else {
    localStorage.removeItem(AUTOTRADE_REFRESH_TOKEN_KEY);
  }
}

export function clearAutotradeAuth() {
  localStorage.removeItem(AUTOTRADE_TOKEN_KEY);
  localStorage.removeItem(AUTOTRADE_REFRESH_TOKEN_KEY);
  localStorage.removeItem(CRYPTOBOT_TOKEN_KEY);
  localStorage.removeItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
  localStorage.removeItem("autotrade_bearer_token");
}

export function storeLuxquantCryptobotToken(luxquantToken) {
  if (luxquantToken) {
    localStorage.setItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY, luxquantToken);
  }
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

async function request(path, { method = "GET", body, skipAuth = false } = {}) {
  const headers = {};
  const token = skipAuth ? "" : getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;

    try {
      const errorBody = await response.json();

      if (Array.isArray(errorBody?.detail)) {
        detail = errorBody.detail
          .map((item) => item?.msg || item?.message || "Validation error")
          .join(", ");
      } else if (typeof errorBody?.detail === "string") {
        detail = errorBody.detail;
      }
    } catch {
      detail = response.statusText || detail;
    }

    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function exchangeLuxquantToken(luxquantToken) {
  const data = await request("/auth/luxquant", {
    method: "POST",
    body: { token: luxquantToken },
    skipAuth: true,
  });

  if (!data?.access_token) {
    throw new Error("Cryptobot did not return an access token");
  }

  storeAutotradeAuth(data.access_token, data.refresh_token || null);
  localStorage.removeItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
  return data;
}

export async function syncCryptobotAuth(luxquantToken) {
  if (!luxquantToken) return null;

  storeLuxquantCryptobotToken(luxquantToken);

  try {
    return await exchangeLuxquantToken(luxquantToken);
  } catch (error) {
    console.warn("Cryptobot token exchange failed:", error);
    return null;
  }
}

// Health
export const getHealth = () => request("/health");

// User
export const getMe = () => request("/me");

// Exchange Accounts
export const saveBinanceKeys = (payload) =>
  request("/me/exchange-accounts/binance", {
    method: "PUT",
    body: payload,
  });

export const checkBinanceKeys = () =>
  request("/me/exchange-accounts/binance/check", {
    method: "POST",
  });

// Portfolio
export const getPortfolio = () =>
  request("/me/portfolio");

export const getTradeHistory = () =>
  request("/me/trade-history");

export const forceSellSpotPosition = (positionId, payload) =>
  request(`/me/portfolio/position/${encodeURIComponent(positionId)}/force-sell`, {
    method: "POST",
    body: payload,
  });

export const forceSellAllSpotPositions = (payload) =>
  request("/me/portfolio/positions/force-sell-all", {
    method: "POST",
    body: payload,
  });

export const convertSpotAssetsToUsdt = (payload) =>
  request("/me/portfolio/spot-assets/convert-to-usdt", {
    method: "POST",
    body: payload,
  });

export const getActivityLogs = (limit = 100) =>
  request(`/me/activity-logs?limit=${encodeURIComponent(limit)}`);

// Strategy Configs
export const getStrategyConfigs = () =>
  request("/me/strategy-configs");

export const updateBinanceStrategyConfig = (payload) =>
  request("/me/strategy-configs/binance", {
    method: "PUT",
    body: payload,
  });

export const setBinanceStrategyActive = (active) =>
  request("/me/strategy-configs/binance/active", {
    method: "PUT",
    body: { active },
  });

// Signals
export const getSignals = () =>
  request("/signals");

export const parseSignalPreview = (text) =>
  request("/signals/parse-preview", {
    method: "POST",
    body: { text },
  });

// Executions
export const getExecutions = () =>
  request("/executions");

export const retryExecution = (executionId) =>
  request(`/executions/${executionId}/retry`, {
    method: "POST",
  });

// Monitoring and Telegram Alerts
export const getAlertStatus = () =>
  request("/me/alerts");

export const updateAlertPreferences = (payload) =>
  request("/me/alerts", {
    method: "PUT",
    body: payload,
  });

export const sendTestAlert = () =>
  request("/me/alerts/test", {
    method: "POST",
  });
