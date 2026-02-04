// Market API Service - Uses BACKEND APIs with caching
// Backend handles: Bybit fallback for derivatives, CoinGecko caching

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Helper: fetch dengan timeout
const fetchWithTimeout = async (url, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

// ============================================
// BITCOIN DATA (via Backend)
// ============================================

export const getBTCData = async () => {
  try {
    // Use backend market overview (has Bybit fallback)
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/overview`);
    
    if (data?.btc) {
      return {
        price: data.btc.price,
        change24h: data.btc.price_change_pct,
        high24h: data.btc.high_24h,
        low24h: data.btc.low_24h,
        volume24h: data.btc.volume_24h,
        source: 'backend'
      };
    }
    return null;
  } catch (error) {
    console.error('BTC data error:', error);
    return null;
  }
};

// Get BTC Dominance (via Backend CoinGecko proxy with cache)
export const getBTCDominance = async () => {
  try {
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/coingecko/global`);
    return {
      dominance: data.btc_dominance,
      totalMarketCap: data.total_market_cap,
      total24hVolume: data.total_volume,
      source: 'backend_coingecko'
    };
  } catch (error) {
    console.error('BTC Dominance error:', error);
    return null;
  }
};

// ============================================
// FEAR & GREED INDEX (via Backend)
// ============================================

export const getFearGreedIndex = async () => {
  try {
    // Backend /coingecko/bitcoin includes fear & greed
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/coingecko/bitcoin`);
    return {
      value: data.fear_greed_value,
      classification: data.fear_greed_label,
      timestamp: new Date(),
      source: 'backend'
    };
  } catch (error) {
    console.error('Fear & Greed error:', error);
    return null;
  }
};

// ============================================
// FUTURES DATA (via Backend - has Bybit fallback)
// ============================================

// Get BTC Funding Rate
export const getFundingRate = async (symbol = 'BTCUSDT') => {
  try {
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/overview`);
    if (data?.funding) {
      return {
        rate: data.funding.rate,
        time: new Date(data.funding.next_time),
        source: 'backend'
      };
    }
    return null;
  } catch (error) {
    console.error('Funding rate error:', error);
    return null;
  }
};

// Get Open Interest
export const getOpenInterest = async (symbol = 'BTCUSDT') => {
  try {
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/overview`);
    if (data?.open_interest) {
      return {
        openInterest: data.open_interest.btc,
        openInterestUSD: data.open_interest.usd,
        symbol: symbol,
        source: 'backend'
      };
    }
    return null;
  } catch (error) {
    console.error('Open Interest error:', error);
    return null;
  }
};

// Get Long/Short Ratio
export const getLongShortRatio = async (symbol = 'BTCUSDT', period = '5m') => {
  try {
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/overview`);
    if (data?.long_short) {
      return {
        longAccount: data.long_short.long_pct,
        shortAccount: data.long_short.short_pct,
        longShortRatio: data.long_short.ratio,
        timestamp: new Date(),
        source: 'backend'
      };
    }
    return null;
  } catch (error) {
    console.error('Long/Short ratio error:', error);
    return null;
  }
};

// Get Top Funding Rates (multiple coins)
export const getTopFundingRates = async (limit = 10) => {
  try {
    // Try backend first
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/funding-rates?symbols=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,DOTUSDT,MATICUSDT,LINKUSDT,LTCUSDT,ATOMUSDT,UNIUSDT,ETCUSDT`);
    
    if (data && data.length > 0) {
      return data
        .map(item => ({
          symbol: item.symbol,
          fundingRate: item.rate,
          markPrice: 0, // Not available from this endpoint
          indexPrice: 0,
        }))
        .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
        .slice(0, limit);
    }
    return [];
  } catch (error) {
    console.error('Top funding rates error:', error);
    return [];
  }
};

// ============================================
// AGGREGATED MARKET DATA (Single API call)
// ============================================

export const getMarketOverview = async () => {
  try {
    // Single call to backend - it handles all the fetching and fallbacks
    const [overview, cgBitcoin] = await Promise.all([
      fetchWithTimeout(`${API_BASE}/api/v1/market/overview`),
      fetchWithTimeout(`${API_BASE}/api/v1/coingecko/bitcoin`).catch(() => null)
    ]);

    return {
      btc: overview?.btc ? {
        price: overview.btc.price,
        change24h: overview.btc.price_change_pct,
        high24h: overview.btc.high_24h,
        low24h: overview.btc.low_24h,
        volume24h: overview.btc.volume_24h,
      } : null,
      dominance: cgBitcoin ? {
        dominance: cgBitcoin.dominance,
      } : null,
      fearGreed: cgBitcoin ? {
        value: cgBitcoin.fear_greed_value,
        classification: cgBitcoin.fear_greed_label,
      } : null,
      funding: overview?.funding ? {
        rate: overview.funding.rate,
        time: new Date(overview.funding.next_time),
      } : null,
      openInterest: overview?.open_interest ? {
        openInterest: overview.open_interest.btc,
        openInterestUSD: overview.open_interest.usd,
      } : null,
      longShort: overview?.long_short ? {
        longAccount: overview.long_short.long_pct,
        shortAccount: overview.long_short.short_pct,
        longShortRatio: overview.long_short.ratio,
      } : null,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Market overview error:', error);
    return {
      btc: null,
      dominance: null,
      fearGreed: null,
      funding: null,
      openInterest: null,
      longShort: null,
      timestamp: new Date()
    };
  }
};

// ============================================
// COIN SPECIFIC DATA
// ============================================

export const getCoinData = async (symbol) => {
  try {
    const data = await fetchWithTimeout(`${API_BASE}/api/v1/market/price/${symbol}USDT`);
    return {
      price: data.price,
      source: data.source
    };
  } catch (error) {
    console.error(`Coin data error for ${symbol}:`, error);
    return null;
  }
};

// Get OHLC data for chart (Binance Spot - usually works)
export const getOHLCData = async (symbol, interval = '1h', limit = 100) => {
  try {
    // Binance Spot klines usually work in Indonesia
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    return data.map(candle => ({
      time: Math.floor(candle[0] / 1000),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  } catch (error) {
    console.error(`OHLC error for ${symbol}:`, error);
    return [];
  }
};

export default {
  getBTCData,
  getBTCDominance,
  getFearGreedIndex,
  getFundingRate,
  getOpenInterest,
  getLongShortRatio,
  getTopFundingRates,
  getMarketOverview,
  getCoinData,
  getOHLCData
};