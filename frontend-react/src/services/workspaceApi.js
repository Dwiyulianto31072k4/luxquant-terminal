// src/services/workspaceApi.js
//
// Admin Workspace API client.
// Endpoints prefixed with /api/v1/workspace/.
// All require admin role; data shared across admins.

import api from './api'; // axios instance with auth interceptor

export const workspaceApi = {
  // ════════════════════════════════════
  // STATS
  // ════════════════════════════════════
  getStats: async () => {
    const r = await api.get('/api/v1/workspace/stats');
    return r.data;
  },

  // ════════════════════════════════════
  // FOLLOW-UPS
  // ════════════════════════════════════
  listFollowups: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.user_id) params.set('user_id', filters.user_id);
    if (filters.search) params.set('search', filters.search);

    const qs = params.toString();
    const url = qs ? `/api/v1/workspace/followups?${qs}` : '/api/v1/workspace/followups';
    const r = await api.get(url);
    return r.data;
  },

  createFollowup: async (payload) => {
    const r = await api.post('/api/v1/workspace/followups', payload);
    return r.data;
  },

  updateFollowup: async (id, payload) => {
    const r = await api.patch(`/api/v1/workspace/followups/${id}`, payload);
    return r.data;
  },

  deleteFollowup: async (id) => {
    const r = await api.delete(`/api/v1/workspace/followups/${id}`);
    return r.data;
  },

  // ════════════════════════════════════
  // CAMPAIGNS
  // ════════════════════════════════════
  listCampaigns: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.search) params.set('search', filters.search);

    const qs = params.toString();
    const url = qs ? `/api/v1/workspace/campaigns?${qs}` : '/api/v1/workspace/campaigns';
    const r = await api.get(url);
    return r.data;
  },

  createCampaign: async (payload) => {
    const r = await api.post('/api/v1/workspace/campaigns', payload);
    return r.data;
  },

  updateCampaign: async (id, payload) => {
    const r = await api.patch(`/api/v1/workspace/campaigns/${id}`, payload);
    return r.data;
  },

  deleteCampaign: async (id) => {
    const r = await api.delete(`/api/v1/workspace/campaigns/${id}`);
    return r.data;
  },

  // ════════════════════════════════════
  // TODOS
  // ════════════════════════════════════
  listTodos: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.search) params.set('search', filters.search);

    const qs = params.toString();
    const url = qs ? `/api/v1/workspace/todos?${qs}` : '/api/v1/workspace/todos';
    const r = await api.get(url);
    return r.data;
  },

  createTodo: async (payload) => {
    const r = await api.post('/api/v1/workspace/todos', payload);
    return r.data;
  },

  updateTodo: async (id, payload) => {
    const r = await api.patch(`/api/v1/workspace/todos/${id}`, payload);
    return r.data;
  },

  deleteTodo: async (id) => {
    const r = await api.delete(`/api/v1/workspace/todos/${id}`);
    return r.data;
  },
};
