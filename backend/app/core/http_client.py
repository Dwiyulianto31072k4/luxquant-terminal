"""
LuxQuant Terminal - Shared HTTP Client Pool
============================================
Reuses persistent TCP connections instead of creating new httpx.AsyncClient 
per request. This dramatically reduces ConnectError failures (especially 
for Binance which rate-limits/blocks frequent new connections).

BEFORE (cache_workers.py had 8x this pattern):
    async with httpx.AsyncClient(timeout=15) as client:
        # Creates new TCP connection, does TLS handshake, fetches, closes
        response = await client.get(url)
    # Connection destroyed — next call starts from scratch

AFTER:
    client = get_binance_client()
    response = await client.get(url)
    # Connection stays alive, reused for next request (HTTP keep-alive)

Usage:
    from app.core.http_client import (
        get_binance_client, get_coingecko_client, get_general_client,
        init_clients, close_clients
    )
    
    # In lifespan (main.py):
    async def lifespan(app):
        init_clients()
        yield
        await close_clients()
    
    # In cache workers or routes:
    client = get_binance_client()
    response = await client.get("https://api.binance.com/api/v3/ticker/24hr", params={...})
"""

import httpx
from typing import Optional

# ============================================
# Configuration
# ============================================

# Timeouts (seconds)
DEFAULT_TIMEOUT = 15.0
BINANCE_TIMEOUT = 12.0      # Binance can be slow from Indonesia
COINGECKO_TIMEOUT = 15.0    # CoinGecko free tier is slower

# Connection pool limits
# max_connections: total TCP connections per client
# max_keepalive_connections: how many to keep alive when idle
BINANCE_POOL = httpx.Limits(
    max_connections=20,
    max_keepalive_connections=10,
    keepalive_expiry=30,        # Keep idle connections for 30s
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

# Common headers
HEADERS = {
    "User-Agent": "LuxQuant/2.0",
    "Accept": "application/json",
}

# ============================================
# Singleton Clients
# ============================================

_binance_client: Optional[httpx.AsyncClient] = None
_coingecko_client: Optional[httpx.AsyncClient] = None
_general_client: Optional[httpx.AsyncClient] = None


def init_clients():
    """
    Initialize all shared HTTP clients.
    Call once during app startup (lifespan).
    
    Each client maintains its own TCP connection pool,
    so connections are reused across requests.
    """
    global _binance_client, _coingecko_client, _general_client

    _binance_client = httpx.AsyncClient(
        timeout=httpx.Timeout(BINANCE_TIMEOUT, connect=8.0),
        limits=BINANCE_POOL,
        headers=HEADERS,
        http2=False,           # Binance doesn't support HTTP/2
        follow_redirects=False,
    )

    _coingecko_client = httpx.AsyncClient(
        timeout=httpx.Timeout(COINGECKO_TIMEOUT, connect=8.0),
        limits=COINGECKO_POOL,
        headers=HEADERS,
        http2=False,
        follow_redirects=False,
    )

    # General client for mempool.space, blockchain.info, RSS feeds, etc.
    _general_client = httpx.AsyncClient(
        timeout=httpx.Timeout(DEFAULT_TIMEOUT, connect=8.0),
        limits=GENERAL_POOL,
        headers={**HEADERS, "User-Agent": "LuxQuant/2.0 (News Aggregator)"},
        http2=False,
        follow_redirects=True,  # RSS feeds often redirect
    )

    print("✅ HTTP clients initialized (Binance, CoinGecko, General)")


async def close_clients():
    """
    Gracefully close all HTTP clients.
    Call during app shutdown (lifespan).
    """
    global _binance_client, _coingecko_client, _general_client

    for name, client in [
        ("Binance", _binance_client),
        ("CoinGecko", _coingecko_client),
        ("General", _general_client),
    ]:
        if client:
            try:
                await client.aclose()
            except Exception as e:
                print(f"⚠️ Error closing {name} client: {e}")

    _binance_client = None
    _coingecko_client = None
    _general_client = None
    print("✅ HTTP clients closed")


# ============================================
# Client Getters
# ============================================

def get_binance_client() -> httpx.AsyncClient:
    """
    Get shared Binance HTTP client.
    Covers: api.binance.com, fapi.binance.com
    
    Raises RuntimeError if clients not initialized (call init_clients first).
    """
    if _binance_client is None:
        raise RuntimeError(
            "HTTP clients not initialized. Call init_clients() in app lifespan."
        )
    return _binance_client


def get_coingecko_client() -> httpx.AsyncClient:
    """
    Get shared CoinGecko HTTP client.
    Covers: api.coingecko.com, api.alternative.me
    """
    if _coingecko_client is None:
        raise RuntimeError(
            "HTTP clients not initialized. Call init_clients() in app lifespan."
        )
    return _coingecko_client


def get_general_client() -> httpx.AsyncClient:
    """
    Get shared general HTTP client.
    Covers: mempool.space, blockchain.info, RSS feeds, etc.
    """
    if _general_client is None:
        raise RuntimeError(
            "HTTP clients not initialized. Call init_clients() in app lifespan."
        )
    return _general_client