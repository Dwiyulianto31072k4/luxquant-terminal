// src/context/CurrencyContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/authApi';

const CurrencyContext = createContext(null);

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return ctx;
};

// Refresh rates every 10 min in browser (matches backend worker cycle)
const REFRESH_INTERVAL = 10 * 60 * 1000;

export const CurrencyProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [rates, setRates] = useState(null);       // { USD: 1.0, IDR: 17549.81, ... }
  const [updatedAt, setUpdatedAt] = useState(null);
  const [supported, setSupported] = useState([]); // ['AED', 'ARS', ...]
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── User's preferred display currency ───
  // Falls back to USD if user not logged in or hasn't set preference
  const currency = useMemo(() => {
    return (user?.currency_code || 'USD').toUpperCase();
  }, [user?.currency_code]);

  const country = useMemo(() => {
    return user?.country_code || null;
  }, [user?.country_code]);

  // ─── Fetch rates ───
  const fetchRates = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/fx/rates');
      setRates(res.data.rates || {});
      setUpdatedAt(res.data.updated_at);
      setIsStale(!!res.data.is_stale);
      setError(null);
    } catch (err) {
      console.error('[CurrencyContext] Failed to fetch rates:', err);
      setError('Failed to load currency rates');
      // Don't clear existing rates — keep what we have
    }
  }, []);

  const fetchSupported = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/fx/supported');
      setSupported(res.data.supported || []);
    } catch (err) {
      console.error('[CurrencyContext] Failed to fetch supported list:', err);
    }
  }, []);

  // ─── Initial load + periodic refresh ───
  useEffect(() => {
    let mounted = true;
    let intervalId;

    const init = async () => {
      await Promise.all([fetchRates(), fetchSupported()]);
      if (mounted) setLoading(false);
    };
    init();

    intervalId = setInterval(fetchRates, REFRESH_INTERVAL);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchRates, fetchSupported]);

  // ─── Helpers exposed to consumers ───

  /**
   * Convert USDT-denominated price to user's currency.
   * Returns null if rates not loaded or currency unsupported.
   */
  const convertFromUsdt = useCallback((usdtPrice, targetCurrency = null) => {
    if (usdtPrice == null || !rates) return null;
    const code = (targetCurrency || currency).toUpperCase();
    const rate = rates[code];
    if (!rate || rate <= 0) return null;
    return usdtPrice * rate;
  }, [rates, currency]);

  /**
   * Get raw rate for any currency.
   */
  const getRate = useCallback((targetCurrency) => {
    if (!rates) return null;
    return rates[(targetCurrency || currency).toUpperCase()] || null;
  }, [rates, currency]);

  const value = useMemo(() => ({
    // State
    rates,
    supported,
    currency,         // user's display currency
    country,          // user's country
    updatedAt,
    isStale,
    loading,
    error,
    isAuthenticated,

    // Helpers
    convertFromUsdt,
    getRate,
    refresh: fetchRates,

    // Display flag: should we show local price?
    // Hide if user chose USD or rate unavailable
    shouldShowLocal: currency !== 'USD' && !!rates?.[currency],
  }), [rates, supported, currency, country, updatedAt, isStale, loading, error,
       isAuthenticated, convertFromUsdt, getRate, fetchRates]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};