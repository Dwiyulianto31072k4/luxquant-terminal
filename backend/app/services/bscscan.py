# backend/app/services/bscscan.py
"""
BSCScan API Service — Verify BEP-20 USDT transactions on BNB Smart Chain

Flow:
1. User submits TX hash
2. We call BSCScan API to get transaction details  
3. Verify: correct recipient, correct amount, correct token, enough confirmations
4. Return verification result
"""
import httpx
import os
import logging
from decimal import Decimal
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# BSCScan API config
BSCSCAN_API_URL = "https://api.bscscan.com/api"
BSCSCAN_API_KEY = os.getenv("BSCSCAN_API_KEY", "")

# USDT BEP-20 contract address on BSC
USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955".lower()

# Receiving wallet address (set via env or config)
RECEIVING_WALLET = os.getenv("RECEIVING_WALLET_BSC", "").lower()

# Minimum confirmations required
MIN_CONFIRMATIONS = 12


class TxVerificationResult:
    def __init__(self, valid: bool, error: str = None, data: dict = None):
        self.valid = valid
        self.error = error
        self.data = data or {}


async def verify_bep20_tx(
    tx_hash: str,
    expected_amount: Decimal,
    expected_wallet_to: str = None
) -> TxVerificationResult:
    """
    Verify a BEP-20 USDT transaction on BSC.
    
    Checks:
    1. Transaction exists and is confirmed
    2. Token is USDT (correct contract)
    3. Recipient matches our wallet
    4. Amount matches expected amount
    5. Enough confirmations (>= 12)
    
    Returns TxVerificationResult with valid=True/False
    """
    wallet_to = (expected_wallet_to or RECEIVING_WALLET).lower()
    
    if not wallet_to:
        return TxVerificationResult(False, "Receiving wallet not configured")
    
    if not BSCSCAN_API_KEY:
        return TxVerificationResult(False, "BSCScan API key not configured")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Step 1: Get token transfer events for this TX
            response = await client.get(BSCSCAN_API_URL, params={
                "module": "account",
                "action": "tokentx",
                "txhash": tx_hash,
                "apikey": BSCSCAN_API_KEY
            })
            
            data = response.json()
            
            if data.get("status") != "1" or not data.get("result"):
                # Try getting normal transaction to check if TX exists
                tx_response = await client.get(BSCSCAN_API_URL, params={
                    "module": "proxy",
                    "action": "eth_getTransactionByHash",
                    "txhash": tx_hash,
                    "apikey": BSCSCAN_API_KEY
                })
                tx_data = tx_response.json()
                
                if not tx_data.get("result"):
                    return TxVerificationResult(False, "Transaksi tidak ditemukan di BSC")
                
                return TxVerificationResult(
                    False,
                    "Transaksi ditemukan tapi bukan transfer USDT BEP-20",
                    {"raw": tx_data.get("result")}
                )
            
            # Step 2: Find the USDT transfer in this TX
            transfers = data["result"]
            usdt_transfer = None
            
            for transfer in transfers:
                contract = transfer.get("contractAddress", "").lower()
                to_addr = transfer.get("to", "").lower()
                
                if contract == USDT_CONTRACT and to_addr == wallet_to:
                    usdt_transfer = transfer
                    break
            
            if not usdt_transfer:
                # Check if USDT was sent to wrong address
                for transfer in transfers:
                    if transfer.get("contractAddress", "").lower() == USDT_CONTRACT:
                        return TxVerificationResult(
                            False,
                            f"USDT dikirim ke alamat yang salah: {transfer.get('to')}",
                            {"raw": transfer}
                        )
                
                return TxVerificationResult(
                    False,
                    "Tidak ada transfer USDT ke wallet yang benar dalam transaksi ini",
                    {"transfers": transfers}
                )
            
            # Step 3: Verify amount
            # USDT has 18 decimals on BSC
            token_decimals = int(usdt_transfer.get("tokenDecimal", "18"))
            raw_value = int(usdt_transfer.get("value", "0"))
            actual_amount = Decimal(raw_value) / Decimal(10 ** token_decimals)
            
            # Allow small tolerance (0.01 USDT) for rounding
            amount_diff = abs(actual_amount - expected_amount)
            if amount_diff > Decimal("0.01"):
                return TxVerificationResult(
                    False,
                    f"Jumlah tidak sesuai. Diharapkan: {expected_amount} USDT, Diterima: {actual_amount} USDT",
                    {"expected": str(expected_amount), "actual": str(actual_amount)}
                )
            
            # Step 4: Check confirmations
            confirmations = int(usdt_transfer.get("confirmations", "0"))
            if confirmations < MIN_CONFIRMATIONS:
                return TxVerificationResult(
                    False,
                    f"Konfirmasi belum cukup: {confirmations}/{MIN_CONFIRMATIONS}. Coba lagi nanti.",
                    {"confirmations": confirmations, "required": MIN_CONFIRMATIONS}
                )
            
            # Step 5: Check TX status (not failed)
            tx_receipt_response = await client.get(BSCSCAN_API_URL, params={
                "module": "proxy",
                "action": "eth_getTransactionReceipt",
                "txhash": tx_hash,
                "apikey": BSCSCAN_API_KEY
            })
            receipt = tx_receipt_response.json().get("result", {})
            tx_status = receipt.get("status", "0x1")
            
            if tx_status == "0x0":
                return TxVerificationResult(False, "Transaksi gagal (reverted) di blockchain")
            
            # All checks passed!
            return TxVerificationResult(
                True,
                data={
                    "tx_hash": tx_hash,
                    "from": usdt_transfer.get("from", ""),
                    "to": usdt_transfer.get("to", ""),
                    "amount": str(actual_amount),
                    "confirmations": confirmations,
                    "block": usdt_transfer.get("blockNumber", ""),
                    "timestamp": usdt_transfer.get("timeStamp", ""),
                    "raw": usdt_transfer
                }
            )

    except httpx.TimeoutException:
        return TxVerificationResult(False, "BSCScan API timeout, coba lagi nanti")
    except Exception as e:
        logger.error(f"BSCScan verification error: {e}")
        return TxVerificationResult(False, f"Verification error: {str(e)}")


async def get_tx_status(tx_hash: str) -> Optional[Dict[str, Any]]:
    """Quick check if TX exists and its basic info (without full verification)"""
    if not BSCSCAN_API_KEY:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(BSCSCAN_API_URL, params={
                "module": "proxy",
                "action": "eth_getTransactionByHash",
                "txhash": tx_hash,
                "apikey": BSCSCAN_API_KEY
            })
            data = response.json()
            return data.get("result")
    except Exception as e:
        logger.error(f"BSCScan status check error: {e}")
        return None