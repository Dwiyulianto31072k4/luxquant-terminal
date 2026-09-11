import { describe, it, expect } from 'vitest';
import { marketProxyUrl } from './publicMarket';
import { criteriaToDeskState } from './signalAlertApi';
describe('market proxy', () => {
  it('preserves Unicode instruments and parameters through the local proxy', () => {
    const u = new URL(marketProxyUrl('https://api.bybit.com/v5/market/kline?symbol=牛来USDT&interval=60&limit=25'), 'http://localhost');
    expect(u.pathname).toBe('/api/v1/market/exchange-data');
    expect(u.searchParams.get('symbol')).toBe('牛来USDT');
    expect(u.searchParams.get('provider')).toBe('bybit');
    expect(u.searchParams.get('limit')).toBe('25');
  });
  it('rejects unknown providers', () => expect(() => marketProxyUrl('https://example.org/private')).toThrow());
});
it('Custom preserves all criteria without collapsing multi selections', () => {
  const c = { pairs: ['BTCUSDT','ETHUSDT'], risk_level: ['low','normal'], rating:['A'], min_confidence:80, edge_top:20, smc_golden:true };
  const state = criteriaToDeskState(c);
  expect(state.extra.criteria).toEqual(c);
  expect(state.searchPair).toBe('');
  c.pairs.push('SOLUSDT');
  expect(state.extra.criteria.pairs).toHaveLength(2);
});
