// src/services/workspaceApi.js
//
// Admin Workspace API client.
// Mirrors adminApi.js pattern — uses shared axios instance from ./authApi.
// All endpoints prefixed /api/v1/workspace/. Require admin role.

import api from './authApi';

export const workspaceApi = {
  // ════════════════════════════════════
  // STATS
  // ════════════════════════════════════
  getStats: async () => {
    const response = await api.get('/api/v1/workspace/stats');
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

    const response = await api.get('/api/v1/workspace/followups', { params });
    return response.data;
  },

  createFollowup: async (payload) => {
    const response = await api.post('/api/v1/workspace/followups', payload);
    return response.data;
  },

  updateFollowup: async (id, payload) => {
    const response = await api.patch(`/api/v1/workspace/followups/${id}`, payload);
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

    const response = await api.get('/api/v1/workspace/campaigns', { params });
    return response.data;
  },

  createCampaign: async (payload) => {
    const response = await api.post('/api/v1/workspace/campaigns', payload);
    return response.data;
  },

  updateCampaign: async (id, payload) => {
    const response = await api.patch(`/api/v1/workspace/campaigns/${id}`, payload);
    return response.data;
  },

  deleteCampaign: async (id) => {
    const response = await api.delete(`/api/v1/workspace/campaigns/${id}`);
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

    const response = await api.get('/api/v1/workspace/todos', { params });
    return response.data;
  },

  createTodo: async (payload) => {
    const response = await api.post('/api/v1/workspace/todos', payload);
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
