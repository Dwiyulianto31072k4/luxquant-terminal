# backend/app/services/bscscan.py
"""
BSCScan Verification Service — Verify BEP-20 USDT transactions on BNB Smart Chain

Strategy:
  1. Query BSC blockchain directly via public RPC nodes
  2. Parse Transfer event logs from TX receipt
  3. No dependency on BSCScan API (deprecated)
"""
import httpx
import ssl
import logging
from decimal import Decimal
from typing import Optional, Dict, Any

from app.config import settings

logger = logging.getLogger(__name__)

# Multiple BSC RPC endpoints (non-Binance to avoid SSL issues on some systems)
BSC_RPC_URLS = [
    "https://bsc-rpc.publicnode.com",
    "https://bsc.drpc.org",
    "https://rpc.ankr.com/bsc",
    "https://bsc-dataseed1.binance.org",
]

# USDT BEP-20 contract address on BSC
USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"
USDT_CONTRACT_LOWER = USDT_CONTRACT.lower()

# ERC20 Transfer event signature: Transfer(address,address,uint256)
TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Receiving wallet address
RECEIVING_WALLET = settings.RECEIVING_WALLET_BSC.lower() if settings.RECEIVING_WALLET_BSC else ""

# Minimum confirmations required
MIN_CONFIRMATIONS = 12


class TxVerificationResult:
    def __init__(self, valid: bool, error: str = None, data: dict = None):
        self.valid = valid
        self.error = error
        self.data = data or {}


async def _rpc_call(client: httpx.AsyncClient, rpc_url: str, method: str, params: list) -> Optional[dict]:
    """Make a JSON-RPC call to BSC node"""
    try:
        resp = await client.post(rpc_url, json={
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        })
        data = resp.json()
        if "error" in data:
            logger.warning(f"   RPC error from {rpc_url}: {data['error']}")
            return None
        return data.get("result")
    except Exception as e:
        logger.warning(f"   RPC call failed ({rpc_url}): {type(e).__name__}: {e}")
        return None


async def _get_working_rpc(client: httpx.AsyncClient) -> Optional[str]:
    """Find a working BSC RPC endpoint"""
    for url in BSC_RPC_URLS:
        try:
            result = await _rpc_call(client, url, "eth_blockNumber", [])
            if result:
                logger.info(f"   ✅ Using RPC: {url}")
                return url
        except Exception:
            continue
    return None


async def verify_bep20_tx(
    tx_hash: str,
    expected_amount: Decimal,
    expected_wallet_to: str = None
) -> TxVerificationResult:
    """
    Verify a BEP-20 USDT transaction on BSC via direct RPC.
    """
    wallet_to = (expected_wallet_to or RECEIVING_WALLET).lower()

    logger.info(f"🔍 === BSC Verification Start ===")
    logger.info(f"🔍 TX Hash: {tx_hash}")
    logger.info(f"🔍 Expected amount: {expected_amount} USDT")
    logger.info(f"🔍 Expected wallet_to: {wallet_to}")

    if not wallet_to:
        return TxVerificationResult(False, "Receiving wallet not configured")

    try:
        # Use ssl context that doesn't verify (workaround for macOS SSL issues)
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            # Find a working RPC
            rpc_url = await _get_working_rpc(client)
            if not rpc_url:
                logger.error("❌ No working BSC RPC endpoint found")
                return TxVerificationResult(False, "Tidak dapat terhubung ke BSC network. Coba lagi nanti.")

            # ─── Step 1: Get TX receipt ───
            logger.info(f"📡 Step 1: Getting TX receipt from {rpc_url}...")
            receipt = await _rpc_call(client, rpc_url, "eth_getTransactionReceipt", [tx_hash])

            if not receipt or not isinstance(receipt, dict):
                logger.warning(f"⚠️ TX receipt not found")
                return TxVerificationResult(False, "Transaksi tidak ditemukan di BSC")

            # Check TX status
            tx_status = receipt.get("status", "0x0")
            if tx_status == "0x0":
                return TxVerificationResult(False, "Transaksi gagal (reverted) di blockchain")

            logger.info(f"   TX status: success")
            logger.info(f"   Block: {receipt.get('blockNumber')}")
            logger.info(f"   Logs: {len(receipt.get('logs', []))}")

            # ─── Step 2: Find USDT Transfer in logs ───
            logger.info(f"🔍 Step 2: Scanning logs for USDT transfer...")
            usdt_log = None
            from_addr = ""

            for i, log in enumerate(receipt.get("logs", [])):
                log_address = log.get("address", "").lower()
                topics = log.get("topics", [])

                if log_address == USDT_CONTRACT_LOWER and len(topics) >= 3:
                    if topics[0] == TRANSFER_EVENT_TOPIC:
                        log_from = "0x" + topics[1][-40:]
                        log_to = "0x" + topics[2][-40:]

                        logger.info(f"   Transfer found: from={log_from}, to={log_to}")

                        if log_to.lower() == wallet_to:
                            usdt_log = log
                            from_addr = log_from
                            logger.info(f"   ✅ Match! USDT to our wallet")
                            break

            if not usdt_log:
                # Check wrong address
                for log in receipt.get("logs", []):
                    if log.get("address", "").lower() == USDT_CONTRACT_LOWER:
                        topics = log.get("topics", [])
                        if len(topics) >= 3 and topics[0] == TRANSFER_EVENT_TOPIC:
                            wrong_to = "0x" + topics[2][-40:]
                            return TxVerificationResult(
                                False,
                                f"USDT dikirim ke alamat yang salah: {wrong_to}",
                                {"expected": wallet_to, "actual": wrong_to}
                            )
                return TxVerificationResult(
                    False,
                    "Transaksi bukan transfer USDT ke wallet yang benar",
                    {}
                )

            # ─── Step 3: Verify amount ───
            logger.info(f"🔍 Step 3: Verifying amount...")
            raw_value_hex = usdt_log.get("data", "0x0")
            raw_value = int(raw_value_hex, 16)
            actual_amount = Decimal(raw_value) / Decimal(10 ** 18)  # USDT BSC = 18 decimals

            logger.info(f"   Actual: {actual_amount} USDT, Expected: {expected_amount} USDT")

            amount_diff = abs(actual_amount - expected_amount)
            if amount_diff > Decimal("1.0"):
                return TxVerificationResult(
                    False,
                    f"Jumlah tidak sesuai. Diharapkan: {expected_amount} USDT, Diterima: {actual_amount} USDT",
                    {"expected": str(expected_amount), "actual": str(actual_amount)}
                )

            # ─── Step 4: Check confirmations ───
            logger.info(f"🔍 Step 4: Checking confirmations...")
            block_result = await _rpc_call(client, rpc_url, "eth_blockNumber", [])
            current_block = int(block_result, 16) if block_result else 0
            tx_block = int(receipt.get("blockNumber", "0x0"), 16)
            confirmations = current_block - tx_block

            logger.info(f"   Confirmations: {confirmations} (required: {MIN_CONFIRMATIONS})")

            if confirmations < MIN_CONFIRMATIONS:
                return TxVerificationResult(
                    False,
                    f"Konfirmasi belum cukup: {confirmations}/{MIN_CONFIRMATIONS}. Coba lagi nanti.",
                    {"confirmations": confirmations, "required": MIN_CONFIRMATIONS}
                )

            # ─── All checks passed! ───
            logger.info(f"✅ === Verification PASSED ===")
            logger.info(f"✅ Amount: {actual_amount} USDT, Confirmations: {confirmations}")

            return TxVerificationResult(
                True,
                data={
                    "tx_hash": tx_hash,
                    "from": from_addr,
                    "to": wallet_to,
                    "amount": str(actual_amount),
                    "confirmations": confirmations,
                    "block": str(tx_block),
                }
            )

    except Exception as e:
        logger.error(f"❌ Verification error: {e}", exc_info=True)
        return TxVerificationResult(False, f"Verification error: {str(e)}")


async def get_tx_status(tx_hash: str) -> Optional[Dict[str, Any]]:
    """Quick check if TX exists"""
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            rpc_url = await _get_working_rpc(client)
            if not rpc_url:
                return None
            result = await _rpc_call(client, rpc_url, "eth_getTransactionByHash", [tx_hash])
            return result if isinstance(result, dict) else None
    except Exception as e:
        logger.error(f"TX status check error: {e}")
        return None