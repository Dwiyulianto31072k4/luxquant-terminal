// src/services/resourcesApi.js
// Client for the unified Resource Hub (research / pdf / video / link).
import api from './authApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';
const BASE = '/api/v1/resources';

// ── URL helpers ─────────────────────────────────────────────
// Cover can be an uploaded filename OR an external URL (oEmbed thumbnail).
export const coverUrl = (res) => {
  if (!res?.cover_image) return null;
  if (res.cover_is_external || /^https?:\/\//i.test(res.cover_image)) return res.cover_image;
  return `${API_URL}${BASE}/file/cover/${res.cover_image}`;
};

export const pdfUrl = (res) => {
  if (!res?.pdf_path) return null;
  return `${API_URL}${BASE}/file/pdf/${res.pdf_path}`;
};

// ── YouTube helpers (client-side, no key needed) ────────────
export const youtubeId = (url) => {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
};

export const youtubeThumb = (url) => {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
};

export const youtubeEmbedUrl = (url) => {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
};

// ── API ─────────────────────────────────────────────────────
export const resourcesApi = {
  list: async (params = {}) => {
    const res = await api.get(`${BASE}/`, { params });
    return res.data; // { items, total }
  },

  get: async (idOrSlug) => {
    const res = await api.get(`${BASE}/${idOrSlug}`);
    return res.data;
  },

  categories: async () => {
    const res = await api.get(`${BASE}/categories`);
    return res.data.categories || [];
  },

  meta: async () => {
    const res = await api.get(`${BASE}/meta`);
    return res.data.counts || {};
  },

  // Admin: fetch oEmbed / OG preview for a pasted URL.
  urlPreview: async (url) => {
    const res = await api.post(`${BASE}/url-preview`, { url });
    return res.data;
  },

  // Admin: create/update via multipart (supports pdf + cover uploads).
  create: async (formData) => {
    const res = await api.post(`${BASE}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  update: async (id, formData) => {
    const res = await api.put(`${BASE}/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  remove: async (id) => {
    const res = await api.delete(`${BASE}/${id}`);
    return res.data;
  },
};

export default resourcesApi;
