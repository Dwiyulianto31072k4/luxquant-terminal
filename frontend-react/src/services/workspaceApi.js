// src/services/workspaceApi.js
//
// Admin Workspace API client.
// Mirrors adminApi.js pattern — uses shared axios instance from ./authApi.
// All endpoints prefixed /api/v1/workspace/. Require admin role.

import api from "./authApi";

export const workspaceApi = {
  // ════════════════════════════════════
  // STATS
  // ════════════════════════════════════
  getStats: async () => {
    const response = await api.get("/api/v1/workspace/stats");
    return response.data;
  },

  // ════════════════════════════════════
  // GROWTH — revenue, retention & attribution (read-only)
  // ════════════════════════════════════
  getGrowth: async () => {
    const response = await api.get("/api/v1/workspace/growth");
    return response.data;
  },

  getReferralAdvocates: async (filters = {}) => {
    const response = await api.get(
      "/api/v1/workspace/growth/referrals/advocates",
      {
        params: filters,
      },
    );
    return response.data;
  },

  // Policy-checked, one-at-a-time referral outreach. The backend deliberately
  // exposes no bulk-send endpoint: every reminder stays an explicit approval.
  sendReferralReminder: async (userId) => {
    const response = await api.post(
      `/api/v1/workspace/growth/referral-reminders/${userId}/send`,
    );
    return response.data;
  },

  setReferralReminderPreference: async (userId, optedOut, reason = null) => {
    const response = await api.post(
      `/api/v1/workspace/growth/referral-reminders/${userId}/preference`,
      { opted_out: optedOut, reason },
    );
    return response.data;
  },

  // ════════════════════════════════════
  // EXTERNAL API HEALTH
  // ════════════════════════════════════
  getApiHealth: async () => {
    const response = await api.get("/api/v1/workspace/api-health");
    return response.data;
  },

  // What X published, and what those calls did afterwards. Live prices are
  // fetched server-side on each call, so this is deliberately not cached.
  getXTracker: async (days = 7) => {
    const response = await api.get("/api/v1/admin/x-tracker", { params: { days } });
    return response.data;
  },

  // Which two or three calls are worth a hand-written post right now. Ranked
  // server-side; nothing here posts anything.
  getXCandidates: async (days = 7, limit = 3) => {
    const response = await api.get("/api/v1/admin/x-tracker/candidates", {
      params: { days, limit },
    });
    return response.data;
  },

  // Mark a suggestion handled so two admins never post the same coin.
  dismissXCandidate: async (signal_id, kind, action = "dismissed") => {
    const response = await api.post("/api/v1/admin/x-tracker/dismiss", {
      signal_id,
      kind,
      action,
    });
    return response.data;
  },

  refreshApiHealth: async () => {
    const response = await api.post("/api/v1/workspace/api-health/refresh");
    return response.data;
  },

  // ════════════════════════════════════
  // AI COST TRACKER
  // ════════════════════════════════════
  getAiCostSummary: async (days = 30) => {
    const response = await api.get("/api/v1/workspace/ai-cost/summary", {
      params: { days },
    });
    return response.data;
  },
  getAiCostRecent: async (limit = 50) => {
    const response = await api.get("/api/v1/workspace/ai-cost/recent", {
      params: { limit },
    });
    return response.data;
  },
  getAiSettings: async () => {
    const response = await api.get("/api/v1/workspace/ai-cost/settings");
    return response.data;
  },
  setAiSettings: async (assistant_enabled) => {
    const response = await api.post("/api/v1/workspace/ai-cost/settings", {
      assistant_enabled,
    });
    return response.data;
  },

  // ════════════════════════════════════
  // X API USAGE & SPEND (Marketing tab)
  // ════════════════════════════════════
  getXUsageSummary: async (days = 30) => {
    const response = await api.get("/api/v1/workspace/x-usage/summary", {
      params: { days },
    });
    return response.data;
  },
  getXUsageRecent: async (limit = 50) => {
    const response = await api.get("/api/v1/workspace/x-usage/recent", {
      params: { limit },
    });
    return response.data;
  },
  getXUsageSettings: async () => {
    const response = await api.get("/api/v1/workspace/x-usage/settings");
    return response.data;
  },
  getXUsageTopups: async (limit = 40) => {
    const response = await api.get("/api/v1/workspace/x-usage/topups", {
      params: { limit },
    });
    return response.data;
  },

  // ════════════════════════════════════
  // FOLLOW-UPS
  // ════════════════════════════════════
  listFollowups: async (filters = {}) => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.category) params.category = filters.category;
    if (filters.priority) params.priority = filters.priority;
    if (filters.user_id) params.user_id = filters.user_id;
    if (filters.search) params.search = filters.search;

    const response = await api.get("/api/v1/workspace/followups", { params });
    return response.data;
  },

  createFollowup: async (payload) => {
    const response = await api.post("/api/v1/workspace/followups", payload);
    return response.data;
  },

  // Retention engine — auto-generate renewal + win-back follow-ups.
  generateFollowups: async (payload = {}) => {
    const response = await api.post(
      "/api/v1/workspace/followups/generate",
      payload,
    );
    return response.data;
  },

  updateFollowup: async (id, payload) => {
    const response = await api.patch(
      `/api/v1/workspace/followups/${id}`,
      payload,
    );
    return response.data;
  },

  deleteFollowup: async (id) => {
    const response = await api.delete(`/api/v1/workspace/followups/${id}`);
    return response.data;
  },

  // ════════════════════════════════════
  // CAMPAIGNS
  // ════════════════════════════════════
  listCampaigns: async (filters = {}) => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.platform) params.platform = filters.platform;
    if (filters.search) params.search = filters.search;

    const response = await api.get("/api/v1/workspace/campaigns", { params });
    return response.data;
  },

  createCampaign: async (payload) => {
    const response = await api.post("/api/v1/workspace/campaigns", payload);
    return response.data;
  },

  updateCampaign: async (id, payload) => {
    const response = await api.patch(
      `/api/v1/workspace/campaigns/${id}`,
      payload,
    );
    return response.data;
  },

  deleteCampaign: async (id) => {
    const response = await api.delete(`/api/v1/workspace/campaigns/${id}`);
    return response.data;
  },

  // ════════════════════════════════════
  // SYSTEM — VPS service health monitor
  // ════════════════════════════════════
  getServices: async () => {
    const response = await api.get("/api/v1/workspace/services");
    return response.data;
  },

  getServicesTopology: async () => {
    const response = await api.get("/api/v1/workspace/services/topology");
    return response.data;
  },

  getBackendHealth: async () => {
    const response = await api.get("/api/v1/workspace/backend-health");
    return response.data;
  },

  // ── CRM: behavioural segments ──
  getCrmSegments: async () => {
    const response = await api.get("/api/v1/workspace/crm/segments");
    return response.data;
  },

  getCrmSegment: async (key, limit = 200) => {
    const response = await api.get(`/api/v1/workspace/crm/segments/${key}`, {
      params: { limit },
    });
    return response.data;
  },

  // ════════════════════════════════════
  // PAYMENT RECORD AUDIT + PROFIT SHARING
  // ════════════════════════════════════
  getPaymentAudit: async () => {
    const response = await api.get("/api/v1/workspace/payment-audit");
    return response.data;
  },
  assignPaymentAudit: async (userId, payload) => {
    const response = await api.post(
      `/api/v1/workspace/payment-audit/${userId}`,
      payload,
    );
    return response.data;
  },
  getProfitSharing: async ({ from, to } = {}) => {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const response = await api.get("/api/v1/workspace/profit-sharing", {
      params,
    });
    return response.data;
  },
  setPaymentPartnerSource: async (paymentId, partner_source) => {
    const response = await api.post(
      `/api/v1/workspace/payments/${paymentId}/partner-source`,
      {
        partner_source,
      },
    );
    return response.data;
  },

  // action: 'start' | 'stop' | 'restart'
  controlService: async (unit, action) => {
    const response = await api.post(
      `/api/v1/workspace/services/${encodeURIComponent(unit)}/action`,
      { action },
    );
    return response.data;
  },

  // ════════════════════════════════════
  // TODOS
  // ════════════════════════════════════
  listTodos: async (filters = {}) => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.category) params.category = filters.category;
    if (filters.priority) params.priority = filters.priority;
    if (filters.search) params.search = filters.search;

    const response = await api.get("/api/v1/workspace/todos", { params });
    return response.data;
  },

  createTodo: async (payload) => {
    const response = await api.post("/api/v1/workspace/todos", payload);
    return response.data;
  },

  updateTodo: async (id, payload) => {
    const response = await api.patch(`/api/v1/workspace/todos/${id}`, payload);
    return response.data;
  },

  deleteTodo: async (id) => {
    const response = await api.delete(`/api/v1/workspace/todos/${id}`);
    return response.data;
  },
};
