// src/services/authApi.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';

// Axios instance dengan interceptor
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - tambah token ke header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Jika 401 dan belum retry, coba refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken
          });
          
          localStorage.setItem('access_token', response.data.access_token);
          localStorage.setItem('refresh_token', response.data.refresh_token);
          
          // Retry original request dengan token baru
          originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh gagal, clear tokens
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email, password) => {
    const response = await api.post('/api/v1/auth/login', { email, password });
    return response.data;
  },

  register: async (email, username, password) => {
    const response = await api.post('/api/v1/auth/register', { email, username, password });
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/api/v1/auth/logout');
    return response.data;
  },

  refreshToken: async (refreshToken) => {
    const response = await api.post('/api/v1/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  }
};

export default api;