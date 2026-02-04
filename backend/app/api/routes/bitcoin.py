"""
Bitcoin Extended Data Router
Endpoints for Bitcoin network & derivatives data from multiple sources:
- Coinalyze: Liquidations
- Blockchain.com: Hash Rate, Difficulty, Transaction Count
- Mempool.space: Fee Estimates
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
import httpx
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# API Configuration
COINALYZE_API = "https://api.coinalyze.net/v1"
COINALYZE_API_KEY = os.getenv("COINALYZE_API_KEY", "")

BLOCKCHAIN_API = "https://api.blockchain.info"
MEMPOOL_API = "https://mempool.space/api"

TIMEOUT = 15.0


# ============ Response Models ============

class LiquidationData(BaseModel):
    total_24h: float
    long_24h: float
    short_24h: float
    long_pct: float
    short_pct: float
    timestamp: str


class HashRateData(BaseModel):
    hashrate: float
    hashrate_formatted: str
    unit: str
    timestamp: str


class DifficultyData(BaseModel):
    difficulty: float
    difficulty_formatted: str
    timestamp: str


class MempoolFeesData(BaseModel):
    fastest: int
    half_hour: int
    hour: int
    economy: int
    minimum: int
    timestamp: str


class TransactionData(BaseModel):
    count_24h: int
    timestamp: str


class NetworkStatsData(BaseModel):
    hashrate: float
    hashrate_formatted: str
    difficulty: float
    difficulty_formatted: str
    block_height: int
    mempool_size: int
    timestamp: str


class BitcoinExtendedData(BaseModel):
    liquidations: Optional[LiquidationData] = None
    hashrate: Optional[HashRateData] = None
    difficulty: Optional[DifficultyData] = None
    mempool_fees: Optional[MempoolFeesData] = None
    transactions: Optional[TransactionData] = None
    timestamp: str


# ============ Helper Functions ============

def format_hashrate(hashrate: float) -> tuple:
    """Convert hashrate to human readable format"""
    if hashrate >= 1e18:
        return f"{hashrate / 1e18:.2f}", "EH/s"
    elif hashrate >= 1e15:
        return f"{hashrate / 1e15:.2f}", "PH/s"
    elif hashrate >= 1e12:
        return f"{hashrate / 1e12:.2f}", "TH/s"
    else:
        return f"{hashrate:.2f}", "H/s"


def format_difficulty(difficulty: float) -> str:
    """Convert difficulty to human readable format"""
    if difficulty >= 1e12:
        return f"{difficulty / 1e12:.2f}T"
    elif difficulty >= 1e9:
        return f"{difficulty / 1e9:.2f}B"
    elif difficulty >= 1e6:
        return f"{difficulty / 1e6:.2f}M"
    else:
        return f"{difficulty:.2f}"


# ============ Coinalyze - Liquidations ============

@router.get("/liquidations", response_model=LiquidationData)
async def get_liquidations():
    """
    Get BTC liquidation data from Coinalyze API.
    Returns 24h liquidation totals for long and short positions.
    """
    if not COINALYZE_API_KEY:
        raise HTTPException(status_code=500, detail="Coinalyze API key not configured")
    
    try:
        # Calculate timestamps for last 24 hours
        now = datetime.utcnow()
        from_ts = int((now - timedelta(hours=24)).timestamp())
        to_ts = int(now.timestamp())
        
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{COINALYZE_API}/liquidation-history",
                params={
                    "symbols": "BTCUSDT_PERP.A",  # Binance BTC Perpetual
                    "interval": "1hour",
                    "from": from_ts,
                    "to": to_ts,
                    "convert_to_usd": "true"
                },
                headers={"api_key": COINALYZE_API_KEY}
            )
            response.raise_for_status()
            data = response.json()
            
            # Sum up all liquidations in the period
            total_long = 0.0
            total_short = 0.0
            
            if data and len(data) > 0 and "history" in data[0]:
                for item in data[0]["history"]:
                    total_long += item.get("l", 0)  # long liquidations
                    total_short += item.get("s", 0)  # short liquidations
            
            total = total_long + total_short
            long_pct = (total_long / total * 100) if total > 0 else 50
            short_pct = (total_short / total * 100) if total > 0 else 50
            
            return LiquidationData(
                total_24h=total,
                long_24h=total_long,
                short_24h=total_short,
                long_pct=round(long_pct, 1),
                short_pct=round(short_pct, 1),
                timestamp=now.isoformat()
            )
            
    except httpx.HTTPError as e:
        logger.error(f"Coinalyze API error: {e}")
        raise HTTPException(status_code=502, detail=f"Coinalyze API error: {str(e)}")
    except Exception as e:
        logger.error(f"Liquidation fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Blockchain.com - Hash Rate ============

@router.get("/hashrate", response_model=HashRateData)
async def get_hashrate():
    """Get current Bitcoin network hash rate from Blockchain.com"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/hash-rate",
                params={"timespan": "1days", "format": "json"}
            )
            response.raise_for_status()
            data = response.json()
            
            # Get latest value (in TH/s from Blockchain.com)
            if data.get("values"):
                latest = data["values"][-1]
                # Blockchain.com returns in TH/s, convert to H/s for formatting
                hashrate_ths = latest["y"]
                hashrate_hs = hashrate_ths * 1e12  # Convert TH/s to H/s
                
                formatted, unit = format_hashrate(hashrate_hs)
                
                return HashRateData(
                    hashrate=hashrate_hs,
                    hashrate_formatted=formatted,
                    unit=unit,
                    timestamp=datetime.utcnow().isoformat()
                )
            
            raise HTTPException(status_code=404, detail="No hashrate data available")
            
    except httpx.HTTPError as e:
        logger.error(f"Blockchain.com API error: {e}")
        raise HTTPException(status_code=502, detail=f"Blockchain.com API error: {str(e)}")


# ============ Blockchain.com - Network Difficulty ============

@router.get("/difficulty", response_model=DifficultyData)
async def get_difficulty():
    """Get current Bitcoin network difficulty from Blockchain.com"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/difficulty",
                params={"timespan": "1days", "format": "json"}
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("values"):
                latest = data["values"][-1]
                difficulty = latest["y"]
                
                return DifficultyData(
                    difficulty=difficulty,
                    difficulty_formatted=format_difficulty(difficulty),
                    timestamp=datetime.utcnow().isoformat()
                )
            
            raise HTTPException(status_code=404, detail="No difficulty data available")
            
    except httpx.HTTPError as e:
        logger.error(f"Blockchain.com API error: {e}")
        raise HTTPException(status_code=502, detail=f"Blockchain.com API error: {str(e)}")


# ============ Mempool.space - Fee Estimates ============

@router.get("/mempool-fees", response_model=MempoolFeesData)
async def get_mempool_fees():
    """Get recommended transaction fees from Mempool.space"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{MEMPOOL_API}/v1/fees/recommended")
            response.raise_for_status()
            data = response.json()
            
            return MempoolFeesData(
                fastest=data.get("fastestFee", 0),
                half_hour=data.get("halfHourFee", 0),
                hour=data.get("hourFee", 0),
                economy=data.get("economyFee", 0),
                minimum=data.get("minimumFee", 0),
                timestamp=datetime.utcnow().isoformat()
            )
            
    except httpx.HTTPError as e:
        logger.error(f"Mempool.space API error: {e}")
        raise HTTPException(status_code=502, detail=f"Mempool.space API error: {str(e)}")


# ============ Blockchain.com - Transaction Count ============

@router.get("/transactions", response_model=TransactionData)
async def get_transaction_count():
    """Get 24h transaction count from Blockchain.com"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/n-transactions",
                params={"timespan": "1days", "format": "json"}
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("values"):
                latest = data["values"][-1]
                
                return TransactionData(
                    count_24h=int(latest["y"]),
                    timestamp=datetime.utcnow().isoformat()
                )
            
            raise HTTPException(status_code=404, detail="No transaction data available")
            
    except httpx.HTTPError as e:
        logger.error(f"Blockchain.com API error: {e}")
        raise HTTPException(status_code=502, detail=f"Blockchain.com API error: {str(e)}")


# ============ Blockchain.com - Network Stats (Combined) ============

@router.get("/network-stats", response_model=NetworkStatsData)
async def get_network_stats():
    """Get combined network statistics from Blockchain.com"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(f"{BLOCKCHAIN_API}/stats", params={"format": "json"})
            response.raise_for_status()
            data = response.json()
            
            hashrate = data.get("hash_rate", 0) * 1e9  # Convert GH/s to H/s
            formatted_hr, unit = format_hashrate(hashrate)
            difficulty = data.get("difficulty", 0)
            
            return NetworkStatsData(
                hashrate=hashrate,
                hashrate_formatted=formatted_hr,
                difficulty=difficulty,
                difficulty_formatted=format_difficulty(difficulty),
                block_height=data.get("n_blocks_total", 0),
                mempool_size=data.get("mempool_size", 0),
                timestamp=datetime.utcnow().isoformat()
            )
            
    except httpx.HTTPError as e:
        logger.error(f"Blockchain.com API error: {e}")
        raise HTTPException(status_code=502, detail=f"Blockchain.com API error: {str(e)}")


# ============ Combined Endpoint - All Bitcoin Extended Data ============

@router.get("/extended", response_model=BitcoinExtendedData)
async def get_bitcoin_extended():
    """
    Get all extended Bitcoin data in one call.
    Fetches from multiple sources: Coinalyze, Blockchain.com, Mempool.space
    """
    result = BitcoinExtendedData(timestamp=datetime.utcnow().isoformat())
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        # Liquidations (Coinalyze) - Try multiple header formats
        if COINALYZE_API_KEY:
            try:
                now = datetime.utcnow()
                from_ts = int((now - timedelta(hours=24)).timestamp())
                to_ts = int(now.timestamp())
                
                # Try with api_key in headers (official format)
                response = await client.get(
                    f"{COINALYZE_API}/liquidation-history",
                    params={
                        "symbols": "BTCUSDT_PERP.A",
                        "interval": "1hour",
                        "from": from_ts,
                        "to": to_ts,
                        "convert_to_usd": "true"
                    },
                    headers={"api_key": COINALYZE_API_KEY}
                )
                
                logger.info(f"Coinalyze response status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"Coinalyze data: {data}")
                    total_long = 0.0
                    total_short = 0.0
                    
                    if data and len(data) > 0 and "history" in data[0]:
                        for item in data[0]["history"]:
                            total_long += item.get("l", 0)
                            total_short += item.get("s", 0)
                    
                    total = total_long + total_short
                    if total > 0:
                        result.liquidations = LiquidationData(
                            total_24h=total,
                            long_24h=total_long,
                            short_24h=total_short,
                            long_pct=round((total_long / total * 100), 1),
                            short_pct=round((total_short / total * 100), 1),
                            timestamp=now.isoformat()
                        )
                else:
                    logger.warning(f"Coinalyze error: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Liquidation fetch error: {e}")
        
        # Hash Rate (Blockchain.com)
        try:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/hash-rate",
                params={"timespan": "1days", "format": "json"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("values"):
                    hashrate_ths = data["values"][-1]["y"]
                    hashrate_hs = hashrate_ths * 1e12
                    formatted, unit = format_hashrate(hashrate_hs)
                    result.hashrate = HashRateData(
                        hashrate=hashrate_hs,
                        hashrate_formatted=formatted,
                        unit=unit,
                        timestamp=datetime.utcnow().isoformat()
                    )
        except Exception as e:
            logger.error(f"Hashrate fetch error: {e}")
        
        # Difficulty (Blockchain.com)
        try:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/difficulty",
                params={"timespan": "1days", "format": "json"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("values"):
                    difficulty = data["values"][-1]["y"]
                    result.difficulty = DifficultyData(
                        difficulty=difficulty,
                        difficulty_formatted=format_difficulty(difficulty),
                        timestamp=datetime.utcnow().isoformat()
                    )
        except Exception as e:
            logger.error(f"Difficulty fetch error: {e}")
        
        # Mempool Fees (Mempool.space)
        try:
            response = await client.get(f"{MEMPOOL_API}/v1/fees/recommended")
            if response.status_code == 200:
                data = response.json()
                result.mempool_fees = MempoolFeesData(
                    fastest=data.get("fastestFee", 0),
                    half_hour=data.get("halfHourFee", 0),
                    hour=data.get("hourFee", 0),
                    economy=data.get("economyFee", 0),
                    minimum=data.get("minimumFee", 0),
                    timestamp=datetime.utcnow().isoformat()
                )
        except Exception as e:
            logger.error(f"Mempool fees fetch error: {e}")
        
        # Transaction Count (Blockchain.com)
        try:
            response = await client.get(
                f"{BLOCKCHAIN_API}/charts/n-transactions",
                params={"timespan": "1days", "format": "json"}
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("values"):
                    result.transactions = TransactionData(
                        count_24h=int(data["values"][-1]["y"]),
                        timestamp=datetime.utcnow().isoformat()
                    )
        except Exception as e:
            logger.error(f"Transaction count fetch error: {e}")
    
    return result