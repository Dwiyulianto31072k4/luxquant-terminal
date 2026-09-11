// Exchange reads go through the same origin, never the viewer's regional network.
const providers = {
  "fapi.binance.com": "binance-futures",
  "api.binance.com": "binance-spot",
  "api.bybit.com": "bybit",
  "api.bybit.id": "bybit-id",
};

export function marketProxyUrl(url) {
  const parsed = new URL(url);
  const provider = providers[parsed.hostname];
  if (!provider) throw new Error("Unsupported market provider");
  const params = new URLSearchParams(parsed.search);
  params.set("provider", provider);
  params.set("path", parsed.pathname);
  return `/api/v1/market/exchange-data?${params}`;
}

export function fetchPublicMarket(url) {
  return fetch(marketProxyUrl(url), { signal: AbortSignal.timeout(12000) });
}
