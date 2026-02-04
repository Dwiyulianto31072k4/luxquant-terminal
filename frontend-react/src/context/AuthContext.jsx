// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/authApi';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await authApi.getMe();
          setUser(userData);
        } catch (err) {
          // Token invalid, clear storage
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const response = await authApi.login(email, password);
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      setUser(response.user);
      return response;
    } catch (err) {
      const message = err.response?.data?.detail || 'Login gagal';
      setError(message);
      throw err;
    }
  };

  const register = async (email, username, password) => {
    setError(null);
    try {
      const response = await authApi.register(email, username, password);
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);
      setUser(response.user);
      return response;
    } catch (err) {
      const message = err.response?.data?.detail || 'Registrasi gagal';
      setError(message);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};