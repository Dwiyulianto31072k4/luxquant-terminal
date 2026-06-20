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

  // Global activity feed (who touched which feature, newest first)
  getActivityFeed: async ({ feature = null, limit = 50, beforeId = null } = {}) => {
    const params = { limit };
    if (feature) params.feature = feature;
    if (beforeId) params.before_id = beforeId;
    const response = await api.get('/api/v1/workspace/growth/activity-feed', { params });
    return response.data;
  },

  // Per-user activity summary, sortable (last_seen | event_count | feature)
  getActiveUsers: async ({ sortBy = 'last_seen', window = '30d', limit = 50 } = {}) => {
    const response = await api.get('/api/v1/workspace/growth/active-users', {
      params: { sort_by: sortBy, window, limit },
    });
    return response.data;
  },
};
