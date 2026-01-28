import axios from 'axios';

// Free Market Data APIs
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const FEAR_GREED_API = 'https://api.alternative.me/fng';

// Create axios instances with timeout
const coingecko = axios.create({ baseURL: COINGECKO_API, timeout: 10000 });
const binanceFutures = axios.create({ baseURL: BINANCE_FUTURES_API, timeout: 10000 });

export const freeMarketApi = {
  // ============ COINGECKO (Free) ============
  
  // Get BTC price with 24h stats
  getBtcPrice: async () => {
    try {
      const response = await coingecko.get('/simple/price', {
        params: {
          ids: 'bitcoin',
          vs_currencies: 'usd',
          include_24hr_high: true,
          include_24hr_low: true,
          include_24hr_vol: true,
          include_24hr_change: true,
          include_market_cap: true
        }
      });
      return response.data.bitcoin;
    } catch (error) {
      console.error('CoinGecko BTC price error:', error);
      return null;
    }
  },

  // Get BTC dominance and global market data
  getGlobalData: async () => {
    try {
      const response = await coingecko.get('/global');
      return {
        btc_dominance: response.data.data.market_cap_percentage.btc,
        total_market_cap: response.data.data.total_market_cap.usd,
        total_volume: response.data.data.total_volume.usd,
        market_cap_change_24h: response.data.data.market_cap_change_percentage_24h_usd
      };
    } catch (error) {
      console.error('CoinGecko global data error:', error);
      return null;
    }
  },

  // ============ ALTERNATIVE.ME (Free) ============
  
  // Get Fear & Greed Index
  getFearGreedIndex: async () => {
    try {
      const response = await axios.get(FEAR_GREED_API, {
        params: { limit: 7 } // Get last 7 days for history
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

  // ============ BINANCE FUTURES (Free) ============
  
  // Get 24h ticker for BTCUSDT futures
  getBtcFuturesTicker: async () => {
    try {
      const response = await binanceFutures.get('/fapi/v1/ticker/24hr', {
        params: { symbol: 'BTCUSDT' }
      });
      return {
        price: parseFloat(response.data.lastPrice),
        high_24h: parseFloat(response.data.highPrice),
        low_24h: parseFloat(response.data.lowPrice),
        volume_24h: parseFloat(response.data.quoteVolume),
        price_change_24h: parseFloat(response.data.priceChange),
        price_change_pct: parseFloat(response.data.priceChangePercent)
      };
    } catch (error) {
      console.error('Binance futures ticker error:', error);
      return null;
    }
  },

  // Get current funding rate
  getFundingRate: async (symbol = 'BTCUSDT') => {
    try {
      const response = await binanceFutures.get('/fapi/v1/fundingRate', {
        params: { symbol, limit: 1 }
      });
      if (response.data && response.data.length > 0) {
        return {
          symbol,
          rate: parseFloat(response.data[0].fundingRate),
          time: response.data[0].fundingTime
        };
      }
      return null;
    } catch (error) {
      console.error('Binance funding rate error:', error);
      return null;
    }
  },

  // Get funding rates for multiple symbols
  getMultipleFundingRates: async () => {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    try {
      const rates = await Promise.all(
        symbols.map(async (symbol) => {
          const response = await binanceFutures.get('/fapi/v1/fundingRate', {
            params: { symbol, limit: 1 }
          });
          if (response.data && response.data.length > 0) {
            return {
              symbol: symbol.replace('USDT', ''),
              rate: parseFloat(response.data[0].fundingRate),
              time: response.data[0].fundingTime
            };
          }
          return null;
        })
      );
      return rates.filter(r => r !== null);
    } catch (error) {
      console.error('Multiple funding rates error:', error);
      return [];
    }
  },

  // Get open interest
  getOpenInterest: async (symbol = 'BTCUSDT') => {
    try {
      const response = await binanceFutures.get('/fapi/v1/openInterest', {
        params: { symbol }
      });
      // Get current price for USD value
      const ticker = await binanceFutures.get('/fapi/v1/ticker/price', {
        params: { symbol }
      });
      const price = parseFloat(ticker.data.price);
      const oi = parseFloat(response.data.openInterest);
      
      return {
        symbol,
        openInterest: oi,
        openInterestUsd: oi * price
      };
    } catch (error) {
      console.error('Binance open interest error:', error);
      return null;
    }
  },

  // Get Open Interest history (for chart)
  getOpenInterestHistory: async (symbol = 'BTCUSDT', period = '5m', limit = 30) => {
    try {
      const response = await binanceFutures.get('/futures/data/openInterestHist', {
        params: { symbol, period, limit }
      });
      return response.data.map(d => ({
        timestamp: d.timestamp,
        sumOpenInterest: parseFloat(d.sumOpenInterest),
        sumOpenInterestValue: parseFloat(d.sumOpenInterestValue)
      }));
    } catch (error) {
      console.error('OI history error:', error);
      return [];
    }
  },

  // Get Long/Short Account Ratio
  getLongShortRatio: async (symbol = 'BTCUSDT', period = '5m') => {
    try {
      const response = await binanceFutures.get('/futures/data/globalLongShortAccountRatio', {
        params: { symbol, period, limit: 1 }
      });
      if (response.data && response.data.length > 0) {
        const data = response.data[0];
        return {
          symbol,
          longAccount: parseFloat(data.longAccount),
          shortAccount: parseFloat(data.shortAccount),
          longShortRatio: parseFloat(data.longShortRatio),
          timestamp: data.timestamp
        };
      }
      return null;
    } catch (error) {
      console.error('Long/Short ratio error:', error);
      return null;
    }
  },

  // Get Top Trader Long/Short Ratio (Position)
  getTopTraderRatio: async (symbol = 'BTCUSDT', period = '5m') => {
    try {
      const response = await binanceFutures.get('/futures/data/topLongShortPositionRatio', {
        params: { symbol, period, limit: 1 }
      });
      if (response.data && response.data.length > 0) {
        const data = response.data[0];
        return {
          symbol,
          longAccount: parseFloat(data.longAccount),
          shortAccount: parseFloat(data.shortAccount),
          longShortRatio: parseFloat(data.longShortRatio),
          timestamp: data.timestamp
        };
      }
      return null;
    } catch (error) {
      console.error('Top trader ratio error:', error);
      return null;
    }
  },

  // Get Taker Buy/Sell Volume
  getTakerVolume: async (symbol = 'BTCUSDT', period = '5m', limit = 30) => {
    try {
      const response = await binanceFutures.get('/futures/data/takerlongshortRatio', {
        params: { symbol, period, limit }
      });
      return response.data.map(d => ({
        timestamp: d.timestamp,
        buyVol: parseFloat(d.buyVol),
        sellVol: parseFloat(d.sellVol),
        buySellRatio: parseFloat(d.buySellRatio)
      }));
    } catch (error) {
      console.error('Taker volume error:', error);
      return [];
    }
  },

  // ============ AGGREGATE DATA ============
  
  // Get all market data in one call
  getAllMarketData: async () => {
    try {
      const [
        btcTicker,
        globalData,
        fearGreed,
        longShortRatio,
        topTraderRatio,
        openInterest,
        fundingRates,
        oiHistory
      ] = await Promise.all([
        freeMarketApi.getBtcFuturesTicker(),
        freeMarketApi.getGlobalData(),
        freeMarketApi.getFearGreedIndex(),
        freeMarketApi.getLongShortRatio(),
        freeMarketApi.getTopTraderRatio(),
        freeMarketApi.getOpenInterest(),
        freeMarketApi.getMultipleFundingRates(),
        freeMarketApi.getOpenInterestHistory('BTCUSDT', '1h', 24)
      ]);

      return {
        btc: btcTicker,
        global: globalData,
        fearGreed,
        longShortRatio,
        topTraderRatio,
        openInterest,
        fundingRates,
        oiHistory
      };
    } catch (error) {
      console.error('Get all market data error:', error);
      return null;
    }
  }
};

export default freeMarketApi;