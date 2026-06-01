// src/services/growthApi.js
//
// Growth / Activity analytics API client.
// Mirrors financeApi pattern — uses the shared axios instance from ./authApi.
// Backed by /api/v1/workspace/growth/* (admin only).

import api from './authApi';

export const growthApi = {
  // Headline metrics: DAU/WAU/MAU, stickiness, subs, signups, power users
  getOverview: async () => {
    const response = await api.get('/api/v1/workspace/growth/overview');
    return response.data;
  },

  // Per-feature reach (subscriber vs free) over the last N days
  getFeatureFunnel: async (days = 30) => {
    const response = await api.get('/api/v1/workspace/growth/feature-funnel', {
      params: { days },
    });
    return response.data;
  },

  // Active subscribers gone dormant / expiring soon
  getAtRisk: async ({ dormantDays = 14, limit = 50 } = {}) => {
    const response = await api.get('/api/v1/workspace/growth/at-risk', {
      params: { dormant_days: dormantDays, limit },
    });
    return response.data;
  },

  // Free users engaging a lot — upgrade candidates
  getHotLeads: async ({ minActiveDays = 4, limit = 50 } = {}) => {
    const response = await api.get('/api/v1/workspace/growth/hot-leads', {
      params: { min_active_days: minActiveDays, limit },
    });
    return response.data;
  },

  // Detailed timeline + 30d sparkline for one user
  getUserActivity: async (userId) => {
    const response = await api.get(
      `/api/v1/workspace/growth/user-activity/${userId}`
    );
    return response.data;
  },
};
