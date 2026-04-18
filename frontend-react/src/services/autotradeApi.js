// src/services/autotradeApi.js
// ============================================================
// LuxQuant Terminal — AutoTrade API client
// Wraps all 18 backend endpoints under /api/v1/autotrade
// ============================================================

const BASE = "/api/v1/autotrade";

function getToken() {
  return localStorage.getItem("access_token") || "";
}

async function request(path, { method = "GET", body, params } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }

  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(url.pathname + url.search, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    let detail = "Request failed";
    try {
      const err = await resp.json();
      detail = err.detail || err.error || detail;
    } catch {}
    throw new Error(detail);
  }

  if (resp.status === 204) return null;
  return resp.json();
}

// ============================================================
// Exchange metadata
// ============================================================
export const listSupportedExchanges = () => request("/exchanges");

// ============================================================
// Accounts
// ============================================================
export const listAccounts = () => request("/accounts");
export const getAccount = (id) => request(`/accounts/${id}`);
export const createAccount = (data) => request("/accounts", { method: "POST", body: data });
export const updateAccount = (id, data) => request(`/accounts/${id}`, { method: "PUT", body: data });
export const deleteAccount = (id) => request(`/accounts/${id}`, { method: "DELETE" });
export const testAccountConnection = (id) => request(`/accounts/${id}/test`, { method: "POST" });
export const fetchAccountBalance = (id) => request(`/accounts/${id}/balance`);

// ============================================================
// Config
// ============================================================
export const getConfig = (accountId) => request(`/config/${accountId}`);
export const updateConfig = (accountId, data) =>
  request(`/config/${accountId}`, { method: "PUT", body: data });
export const toggleConfig = (accountId, enabled) =>
  request(`/config/${accountId}/toggle`, { method: "POST", body: { enabled } });

// ============================================================
// Trade orders
// ============================================================
export const listOrders = (filters = {}) => request("/orders", { params: filters });
export const getOrder = (id) => request(`/orders/${id}`);
export const getOrderLogs = (id, limit = 50) =>
  request(`/orders/${id}/logs`, { params: { limit } });
export const closeOrderManually = (id, reason = "manual") =>
  request(`/orders/${id}/close`, { method: "POST", body: { reason } });

// ============================================================
// Portfolio
// ============================================================
export const getPortfolioSummary = () => request("/portfolio/summary");
export const getPortfolioByExchange = () => request("/portfolio/by-exchange");
export const getDailyPnl = (days = 30, exchangeAccountId) =>
  request("/portfolio/daily-pnl", {
    params: { days, exchange_account_id: exchangeAccountId },
  });

// ============================================================
// Engine
// ============================================================
export const getEngineStatus = () => request("/engine/status");

export const getOrderPnLCard = (orderId) => request(`/orders/${orderId}/pnl-card`);
