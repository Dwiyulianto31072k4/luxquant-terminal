"""
LuxQuant Terminal - Shared HTTP Client Pool
============================================
Reuses persistent TCP connections + per-purpose API key injection.

Multiple CoinGecko clients support "sharded API key strategy" — different
features use different API keys to isolate rate-limit quota:

  - coingecko_main_client     → market data (overview, AI, coin metadata)
  - coingecko_currency_client → FX rates only (multi-currency feature)
  - coingecko_anon_client     → no key (anonymous IP-based quota for low-traffic)

Usage:
    from app.core.http_client import (
        get_binance_client,
        get_coingecko_main_client,
        get_coingecko_currency_client,
        get_coingecko_anon_client,
        get_general_client,
        init_clients, close_clients,
    )

    # In lifespan (main.py):
    async def lifespan(app):
        init_clients()
        yield
        await close_clients()

    # In workers/routes:
    client = get_coingecko_main_client()
    response = await client.get("/simple/price", params={...})
    # No need to manually inject x-cg-demo-api-key header — already in client
"""

import os
import httpx
from typing import Optional

# ============================================
# Configuration
# ============================================

DEFAULT_TIMEOUT = 15.0
BINANCE_TIMEOUT = 12.0
COINGECKO_TIMEOUT = 15.0

BINANCE_POOL = httpx.Limits(
    max_connections=20,
    max_keepalive_connections=10,
    keepalive_expiry=30,
)

COINGECKO_POOL = httpx.Limits(
    max_connections=10,
    max_keepalive_connections=5,
    keepalive_expiry=30,
)

GENERAL_POOL = httpx.Limits(
    max_connections=15,
    max_keepalive_connections=8,
    keepalive_expiry=30,
)

BASE_HEADERS = {
    "User-Agent": "LuxQuant/2.0",
    "Accept": "application/json",
}

# ============================================
# API Key Loading
# ============================================

COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")
COINGECKO_API_KEY_CURRENCY = os.getenv("COINGECKO_API_KEY_CURRENCY", "")


def _build_cg_headers(api_key: str = "") -> dict:
    """Build CoinGecko headers with optional API key injection."""
    headers = dict(BASE_HEADERS)
    if api_key:
        headers["x-cg-demo-api-key"] = api_key
    return headers


# ============================================
# Singleton Clients
# ============================================

_binance_client: Optional[httpx.AsyncClient] = None
_coingecko_main_client: Optional[httpx.AsyncClient] = None
_coingecko_currency_client: Optional[httpx.AsyncClient] = None
_coingecko_anon_client: Optional[httpx.AsyncClient] = None
_general_client: Optional[httpx.AsyncClient] = None

# Legacy alias for backward compat (points to anon client)
_coingecko_client: Optional[httpx.AsyncClient] = None


def init_clients():
    """
    Initialize all shared HTTP clients.
    Call once during app startup (lifespan).
    """
    global _binance_client
    global _coingecko_main_client, _coingecko_currency_client, _coingecko_anon_client
    global _coingecko_client  # legacy alias
    global _general_client

    _binance_client = httpx.AsyncClient(
        timeout=httpx.Timeout(BINANCE_TIMEOUT, connect=8.0),
        limits=BINANCE_POOL,
        headers=BASE_HEADERS,
        http2=False,
        follow_redirects=False,
    )

    # ─── CoinGecko: Main (key utama — market data) ───
    _coingecko_main_client = httpx.AsyncClient(
        timeout=httpx.Timeout(COINGECKO_TIMEOUT, connect=8.0),
        limits=COINGECKO_POOL,
        headers=_build_cg_headers(COINGECKO_API_KEY),
        http2=False,
        follow_redirects=False,
    )

    # ─── CoinGecko: Currency (key isolated — FX rates only) ───
    # Falls back to main key if currency-specific key not configured
    currency_key = COINGECKO_API_KEY_CURRENCY or COINGECKO_API_KEY
    _coingecko_currency_client = httpx.AsyncClient(
        timeout=httpx.Timeout(COINGECKO_TIMEOUT, connect=8.0),
        limits=COINGECKO_POOL,
        headers=_build_cg_headers(currency_key),
        http2=False,
        follow_redirects=False,
    )

    # ─── CoinGecko: Anonymous (no key — IP-based quota) ───
    _coingecko_anon_client = httpx.AsyncClient(
        timeout=httpx.Timeout(COINGECKO_TIMEOUT, connect=8.0),
        limits=COINGECKO_POOL,
        headers=BASE_HEADERS,  # No API key
        http2=False,
        follow_redirects=False,
    )

    # Legacy alias — defaults to anon for backward compat
    # (existing callers using get_coingecko_client() still work)
    _coingecko_client = _coingecko_anon_client

    _general_client = httpx.AsyncClient(
        timeout=httpx.Timeout(DEFAULT_TIMEOUT, connect=8.0),
        limits=GENERAL_POOL,
        headers={**BASE_HEADERS, "User-Agent": "LuxQuant/2.0 (News Aggregator)"},
        http2=False,
        follow_redirects=True,
    )

    # Logging
    main_status = "✓ key" if COINGECKO_API_KEY else "✗ anon"
    currency_status = "✓ dedicated key" if COINGECKO_API_KEY_CURRENCY else ("✓ fallback main key" if COINGECKO_API_KEY else "✗ anon")
    print(f"✅ HTTP clients initialized:")
    print(f"   • Binance, General")
    print(f"   • CoinGecko-main:     {main_status}")
    print(f"   • CoinGecko-currency: {currency_status}")
    print(f"   • CoinGecko-anon:     no key (IP quota)")


async def close_clients():
    """Gracefully close all HTTP clients."""
    global _binance_client
    global _coingecko_main_client, _coingecko_currency_client, _coingecko_anon_client
    global _coingecko_client
    global _general_client

    clients_to_close = [
        ("Binance", _binance_client),
        ("CoinGecko-main", _coingecko_main_client),
        ("CoinGecko-currency", _coingecko_currency_client),
        ("CoinGecko-anon", _coingecko_anon_client),
        ("General", _general_client),
    ]

    for name, client in clients_to_close:
        if client:
            try:
                await client.aclose()
            except Exception as e:
                print(f"⚠️ Error closing {name} client: {e}")

    _binance_client = None
    _coingecko_main_client = None
    _coingecko_currency_client = None
    _coingecko_anon_client = None
    _coingecko_client = None
    _general_client = None
    print("✅ HTTP clients closed")


# ============================================
# Client Getters
# ============================================

def get_binance_client() -> httpx.AsyncClient:
    """Shared Binance HTTP client. Covers: api.binance.com, fapi.binance.com"""
    if _binance_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _binance_client


def get_coingecko_main_client() -> httpx.AsyncClient:
    """
    CoinGecko client with MAIN API key.
    Use for: market data, AI workers, coin metadata, overview, routes.
    """
    if _coingecko_main_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _coingecko_main_client


def get_coingecko_currency_client() -> httpx.AsyncClient:
    """
    CoinGecko client with CURRENCY-DEDICATED API key (isolated quota).
    Use for: FX rates only (fx_worker).
    """
    if _coingecko_currency_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _coingecko_currency_client


def get_coingecko_anon_client() -> httpx.AsyncClient:
    """
    CoinGecko client WITHOUT API key (anonymous, IP-based quota).
    Use for: low-traffic occasional calls (whale price lookup, etc).
    """
    if _coingecko_anon_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _coingecko_anon_client


# Legacy alias — kept for backward compat with existing callers
def get_coingecko_client() -> httpx.AsyncClient:
    """
    DEPRECATED: Use get_coingecko_main_client() / get_coingecko_currency_client() /
    get_coingecko_anon_client() depending on your use case.

    This getter now returns the anonymous client for backward compat with
    code that doesn't yet specify which key tier to use.
    """
    if _coingecko_anon_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _coingecko_anon_client


def get_general_client() -> httpx.AsyncClient:
    """General HTTP client. Covers: mempool.space, blockchain.info, RSS feeds."""
    if _general_client is None:
        raise RuntimeError("HTTP clients not initialized. Call init_clients() in app lifespan.")
    return _general_client