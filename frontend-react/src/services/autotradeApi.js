const API_BASE = import.meta.env.VITE_API_URL || "";

function getToken() {
  return localStorage.getItem("access_token") || "";
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();

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
    let detail = "Request failed";

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

  if (response.status === 204) return null;
  return response.json();
}

export const getHealth = () => request("/health");
export const getMe = () => request("/me");
export const saveBinanceKeys = (payload) =>
  request("/me/exchange-accounts/binance", { method: "PUT", body: payload });
export const checkBinanceKeys = () =>
  request("/me/exchange-accounts/binance/check", { method: "POST" });

export const getPortfolio = () => request("/me/portfolio");

export const getStrategyConfigs = () => request("/me/strategy-configs");
export const updateBinanceStrategyConfig = (payload) =>
  request("/me/strategy-configs/binance", { method: "PUT", body: payload });
export const setBinanceStrategyActive = (active) =>
  request("/me/strategy-configs/binance/active", {
    method: "PUT",
    body: { active },
  });

export const getSignals = () => request("/signals");
export const parseSignalPreview = (text) =>
  request("/signals/parse-preview", { method: "POST", body: { text } });

export const getExecutions = () => request("/executions");
export const retryExecution = (executionId) =>
  request(`/executions/${executionId}/retry`, { method: "POST" });
