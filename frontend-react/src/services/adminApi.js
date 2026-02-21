// src/services/adminApi.js
import api from './authApi';

export const adminApi = {
  // Dashboard stats
  getStats: async () => {
    const response = await api.get('/api/v1/admin/stats');
    return response.data;
  },

  // List users with search/filter/pagination
  getUsers: async ({ search, role, status, sortBy, sortOrder, page, pageSize } = {}) => {
    const params = {};
    if (search) params.search = search;
    if (role) params.role = role;
    if (status) params.status = status;
    if (sortBy) params.sort_by = sortBy;
    if (sortOrder) params.sort_order = sortOrder;
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await api.get('/api/v1/admin/users', { params });
    return response.data;
  },

  // Grant subscription
  grantSubscription: async (userId, duration, note = null, startDate = null) => {
    const body = { duration };
    if (note) body.note = note;
    if (startDate) body.start_date = startDate;
    const response = await api.post(`/api/v1/admin/users/${userId}/grant-subscription`, body);
    return response.data;
  },

  // Revoke subscription
  revokeSubscription: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/revoke-subscription`);
    return response.data;
  },

  // Get expiring subscriptions
  getExpiringSubscriptions: async (days = 7) => {
    const response = await api.get('/api/v1/admin/expiring-subscriptions', {
      params: { days }
    });
    return response.data;
  },

  // Cleanup expired subscriptions
  cleanupExpired: async () => {
    const response = await api.post('/api/v1/admin/cleanup-expired');
    return response.data;
  },

  // Toggle user active status
  toggleUserActive: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/toggle-active`);
    return response.data;
  },
};