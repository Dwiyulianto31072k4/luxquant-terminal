// src/services/authApi.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';

// Axios instance dengan interceptor
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 second timeout to prevent hanging requests
});

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Clean logout — clear tokens without causing full page reload loop
const cleanLogout = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  isRefreshing = false;
  failedQueue = [];
  
  // Only redirect if not already on login/register page
  // Use replaceState to avoid adding to browser history
  if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
    window.history.replaceState(null, '', '/login');
    // Dispatch event so React can pick up the navigation
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

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

// Response interceptor - handle token refresh (no infinite loop)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 errors, and never retry auth endpoints
    const isAuthEndpoint = originalRequest.url?.includes('/auth/refresh') || 
                           originalRequest.url?.includes('/auth/login') ||
                           originalRequest.url?.includes('/auth/register');

    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      }).catch(err => {
        return Promise.reject(err);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      isRefreshing = false;
      cleanLogout();
      return Promise.reject(error);
    }

    try {
      // Use plain axios (not the intercepted instance) to avoid circular refresh
      const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
        refresh_token: refreshToken
      }, { timeout: 10000 });

      const newAccessToken = response.data.access_token;
      localStorage.setItem('access_token', newAccessToken);
      localStorage.setItem('refresh_token', response.data.refresh_token);

      isRefreshing = false;
      processQueue(null, newAccessToken);

      // Retry original request with new token
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      processQueue(refreshError, null);
      cleanLogout();
      return Promise.reject(refreshError);
    }
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