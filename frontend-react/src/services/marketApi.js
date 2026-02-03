import axios from 'axios';

// Backend API (proxy untuk Binance Futures - bypass CORS)
const BACKEND_API = import.meta.env.VITE_API_URL || 'http://localhost:8002/api/v1';

// External APIs (CORS-friendly)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

// Create axios instances
const backend = axios.create({ baseURL: BACKEND_API, timeout: 15000 });
const coingecko = axios.create({ baseURL: COINGECKO_API, timeout: 15000 });

export const freeMarketApi = {
  // ============ BACKEND PROXY (Real-time Binance Data) ============
  
  /**
   * Get complete market overview from backend
   * Includes: BTC ticker, funding rates, long/short ratio, open interest
   */
  getMarketOverview: async () => {
    try {
      const response = await backend.get('/market/overview');
      return response.data;
    } catch (error) {
      console.error('Backend market overview error:', error);
      return null;
    }
  },

  /**
   * Get BTC ticker from backend proxy
   */
  getBtcTicker: async () => {
    try {
      const response = await backend.get('/market/btc-ticker');
      return response.data;
    } catch (error) {
      console.error('Backend BTC ticker error:', error);
      return null;
    }
  },

  /**
   * Get funding rates from backend proxy
   */
  getFundingRates: async (symbols = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT') => {
    try {
      const response = await backend.get('/market/funding-rates', {
        params: { symbols }
      });
      return response.data;
    } catch (error) {
      console.error('Backend funding rates error:', error);
      return [];
    }
  },

  /**
   * Get long/short ratio from backend proxy
   */
  getLongShortRatio: async (symbol = 'BTCUSDT', period = '5m') => {
    try {
      const response = await backend.get('/market/long-short-ratio', {
        params: { symbol, period }
      });
      return response.data;
    } catch (error) {
      console.error('Backend long/short ratio error:', error);
      return null;
    }
  },

  /**
   * Get top trader ratio from backend proxy
   */
  getTopTraderRatio: async (symbol = 'BTCUSDT', period = '5m') => {
    try {
      const response = await backend.get('/market/top-trader-ratio', {
        params: { symbol, period }
      });
      return response.data;
    } catch (error) {
      console.error('Backend top trader ratio error:', error);
      return null;
    }
  },

  /**
   * Get open interest from backend proxy
   */
  getOpenInterest: async (symbol = 'BTCUSDT') => {
    try {
      const response = await backend.get('/market/open-interest', {
        params: { symbol }
      });
      return response.data;
    } catch (error) {
      console.error('Backend open interest error:', error);
      return null;
    }
  },

  /**
   * Get open interest history from backend proxy
   */
  getOpenInterestHistory: async (symbol = 'BTCUSDT', period = '1h', limit = 24) => {
    try {
      const response = await backend.get('/market/open-interest-history', {
        params: { symbol, period, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Backend OI history error:', error);
      return [];
    }
  },

  /**
   * Get taker buy/sell volume from backend proxy
   */
  getTakerVolume: async (symbol = 'BTCUSDT', period = '5m', limit = 30) => {
    try {
      const response = await backend.get('/market/taker-volume', {
        params: { symbol, period, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Backend taker volume error:', error);
      return [];
    }
  },

  // ============ COINGECKO (Free, CORS-friendly) ============
  
  /**
   * Get BTC dominance and global market data
   */
  getGlobalData: async () => {
    try {
      const response = await coingecko.get('/global');
      return {
        btc_dominance: response.data.data.market_cap_percentage.btc,
        eth_dominance: response.data.data.market_cap_percentage.eth,
        total_market_cap: response.data.data.total_market_cap.usd,
        total_volume: response.data.data.total_volume.usd,
        market_cap_change_24h: response.data.data.market_cap_change_percentage_24h_usd,
        active_cryptocurrencies: response.data.data.active_cryptocurrencies
      };
    } catch (error) {
      console.error('CoinGecko global data error:', error);
      return null;
    }
  },

  // ============ ALTERNATIVE.ME (Free) ============
  
  /**
   * Get Fear & Greed Index
   */
  getFearGreedIndex: async () => {
    try {
      const response = await axios.get(FEAR_GREED_API, {
        params: { limit: 7 }
      });
      const data = response.data.data;
      return {
        value: parseInt(data[0].value),
        classification: data[0].value_classification,
        timestamp: data[0].timestamp,
        yesterday: parseInt(data[1]?.value || 0),
        last_week: parseInt(data[6]?.value || 0),
        history: data.map(d => ({ value: parseInt(d.value), date: d.timestamp }))
      };
    } catch (error) {
      console.error('Fear & Greed API error:', error);
      return null;
    }
  },

  // ============ AGGREGATE DATA ============
  
  /**
   * Get all market data in one call
   * Uses backend proxy for Binance data + external APIs for others
   */
  getAllMarketData: async () => {
    try {
      // Fetch all data concurrently
      const [
        marketOverview,
        globalData,
        fearGreed
      ] = await Promise.all([
        freeMarketApi.getMarketOverview(),
        freeMarketApi.getGlobalData(),
        freeMarketApi.getFearGreedIndex()
      ]);

      // If backend is down, return partial data
      if (!marketOverview) {
        console.warn('Backend unavailable, returning partial data');
        return {
          btc: null,
          global: globalData,
          fearGreed,
          longShortRatio: null,
          topTraderRatio: null,
          openInterest: null,
          fundingRates: [],
          oiHistory: []
        };
      }

      return {
        btc: marketOverview.btc,
        global: globalData,
        fearGreed,
        longShortRatio: marketOverview.longShortRatio,
        topTraderRatio: marketOverview.longShortRatio, // Same endpoint
        openInterest: marketOverview.openInterest,
        fundingRates: marketOverview.fundingRates,
        oiHistory: marketOverview.oiHistory
      };
    } catch (error) {
      console.error('Get all market data error:', error);
      return null;
    }
  }
};

export default freeMarketApi;