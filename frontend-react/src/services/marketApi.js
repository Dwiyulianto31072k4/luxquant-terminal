// Market API Service - Free APIs untuk market data
// Dengan fallback dan error handling yang lebih baik

const BINANCE_API = 'https://api.binance.com/api/v3';
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

// Helper: fetch dengan timeout
const fetchWithTimeout = async (url, timeout = 8000) => {
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
// BITCOIN DATA
// ============================================

// Get BTC price + 24h data dari Binance (paling reliable)
export const getBTCData = async () => {
  try {
    const data = await fetchWithTimeout(`${BINANCE_API}/ticker/24hr?symbol=BTCUSDT`);
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.quoteVolume), // in USDT
      source: 'binance'
    };
  } catch (error) {
    console.error('Binance BTC error:', error);
    // Fallback ke CoinGecko
    try {
      const data = await fetchWithTimeout(
        `${COINGECKO_API}/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true`
      );
      return {
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
        high24h: null,
        low24h: null,
        volume24h: data.bitcoin.usd_24h_vol,
        source: 'coingecko'
      };
    } catch (e) {
      console.error('CoinGecko fallback error:', e);
      return null;
    }
  }
};

// Get BTC Dominance dari CoinGecko
export const getBTCDominance = async () => {
  try {
    const data = await fetchWithTimeout(`${COINGECKO_API}/global`);
    return {
      dominance: data.data.market_cap_percentage.btc,
      totalMarketCap: data.data.total_market_cap.usd,
      total24hVolume: data.data.total_volume.usd,
      source: 'coingecko'
    };
  } catch (error) {
    console.error('BTC Dominance error:', error);
    return null;
  }
};

// ============================================
// FEAR & GREED INDEX
// ============================================

export const getFearGreedIndex = async () => {
  try {
    const data = await fetchWithTimeout(`${FEAR_GREED_API}/?limit=1`);
    const fng = data.data[0];
    return {
      value: parseInt(fng.value),
      classification: fng.value_classification,
      timestamp: new Date(fng.timestamp * 1000),
      source: 'alternative.me'
    };
  } catch (error) {
    console.error('Fear & Greed error:', error);
    return null;
  }
};

// ============================================
// FUTURES DATA (Binance Futures)
// ============================================

// Get BTC Funding Rate
export const getFundingRate = async (symbol = 'BTCUSDT') => {
  try {
    const data = await fetchWithTimeout(`${BINANCE_FUTURES}/fundingRate?symbol=${symbol}&limit=1`);
    if (data && data.length > 0) {
      return {
        rate: parseFloat(data[0].fundingRate) * 100, // Convert to percentage
        time: new Date(data[0].fundingTime),
        source: 'binance_futures'
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
    const data = await fetchWithTimeout(`${BINANCE_FUTURES}/openInterest?symbol=${symbol}`);
    const price = await getBTCData();
    
    return {
      openInterest: parseFloat(data.openInterest),
      openInterestUSD: parseFloat(data.openInterest) * (price?.price || 0),
      symbol: data.symbol,
      source: 'binance_futures'
    };
  } catch (error) {
    console.error('Open Interest error:', error);
    return null;
  }
};

// Get Long/Short Ratio - using Binance Futures Data API
// Docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Long-Short-Ratio
export const getLongShortRatio = async (symbol = 'BTCUSDT', period = '5m') => {
  // Binance Futures Data endpoints (different base URL!)
  const BINANCE_FUTURES_DATA = 'https://fapi.binance.com/futures/data';
  
  // Try multiple endpoints in order of preference
  const endpoints = [
    // Global account ratio - all traders
    {
      url: `${BINANCE_FUTURES_DATA}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`,
      type: 'global'
    },
    // Top trader account ratio
    {
      url: `${BINANCE_FUTURES_DATA}/topLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=1`,
      type: 'top_account'
    },
    // Top trader position ratio
    {
      url: `${BINANCE_FUTURES_DATA}/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=1`,
      type: 'top_position'
    },
    // Taker buy/sell ratio
    {
      url: `${BINANCE_FUTURES_DATA}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=1`,
      type: 'taker'
    }
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await fetchWithTimeout(endpoint.url, 5000);
      
      if (data && data.length > 0) {
        const ratio = data[0];
        
        // Handle different response formats
        if (endpoint.type === 'taker') {
          // Taker endpoint has different fields: buySellRatio, buyVol, sellVol
          const buySellRatio = parseFloat(ratio.buySellRatio);
          const buyVol = parseFloat(ratio.buyVol);
          const sellVol = parseFloat(ratio.sellVol);
          const total = buyVol + sellVol;
          
          return {
            longAccount: (buyVol / total * 100),
            shortAccount: (sellVol / total * 100),
            longShortRatio: buySellRatio,
            timestamp: new Date(ratio.timestamp),
            source: `binance_${endpoint.type}`
          };
        } else {
          // Other endpoints have longAccount, shortAccount, longShortRatio
          return {
            longAccount: parseFloat(ratio.longAccount) * 100,
            shortAccount: parseFloat(ratio.shortAccount) * 100,
            longShortRatio: parseFloat(ratio.longShortRatio),
            timestamp: new Date(ratio.timestamp),
            source: `binance_${endpoint.type}`
          };
        }
      }
    } catch (error) {
      console.warn(`Long/Short endpoint failed (${endpoint.type}):`, error.message);
      continue;
    }
  }
  
  // All endpoints failed
  console.error('All Long/Short ratio endpoints failed');
  return null;
};

// Get Top Funding Rates (multiple coins)
export const getTopFundingRates = async (limit = 10) => {
  try {
    // Get all funding rates
    const data = await fetchWithTimeout(`${BINANCE_FUTURES}/premiumIndex`);
    
    // Sort by absolute funding rate
    const sorted = data
      .filter(item => item.symbol.endsWith('USDT'))
      .map(item => ({
        symbol: item.symbol,
        fundingRate: parseFloat(item.lastFundingRate) * 100,
        markPrice: parseFloat(item.markPrice),
        indexPrice: parseFloat(item.indexPrice),
      }))
      .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
      .slice(0, limit);
    
    return sorted;
  } catch (error) {
    console.error('Top funding rates error:', error);
    return [];
  }
};

// ============================================
// AGGREGATED MARKET DATA (untuk dashboard)
// ============================================

export const getMarketOverview = async () => {
  // Fetch semua data secara parallel
  const [btcData, dominance, fearGreed, fundingRate, openInterest, longShort] = await Promise.all([
    getBTCData(),
    getBTCDominance(),
    getFearGreedIndex(),
    getFundingRate(),
    getOpenInterest(),
    getLongShortRatio()
  ]);

  return {
    btc: btcData,
    dominance: dominance,
    fearGreed: fearGreed,
    funding: fundingRate,
    openInterest: openInterest,
    longShort: longShort,
    timestamp: new Date()
  };
};

// ============================================
// COIN SPECIFIC DATA
// ============================================

export const getCoinData = async (symbol) => {
  try {
    // Binance spot ticker
    const data = await fetchWithTimeout(`${BINANCE_API}/ticker/24hr?symbol=${symbol}USDT`);
    return {
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
      volume24h: parseFloat(data.quoteVolume),
      source: 'binance'
    };
  } catch (error) {
    console.error(`Coin data error for ${symbol}:`, error);
    return null;
  }
};

// Get OHLC data for chart
export const getOHLCData = async (symbol, interval = '1h', limit = 100) => {
  try {
    const data = await fetchWithTimeout(
      `${BINANCE_FUTURES}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    
    return data.map(candle => ({
      time: Math.floor(candle[0] / 1000), // Unix timestamp in seconds
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