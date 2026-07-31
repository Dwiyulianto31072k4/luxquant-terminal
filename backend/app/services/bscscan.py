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
# Ordered by whether they can actually serve eth_getTransactionReceipt, which
# is the only call that matters here. Measured 2026-08-01 against a real user
# payment that had been rejected:
#   bsc-dataseed1.binance.org   receipt ok
#   bsc-dataseed.bnbchain.org   receipt ok
#   bsc-dataseed1.defibit.io    receipt ok
#   bsc-dataseed1.ninicoin.io   receipt ok
#   bsc.blockrazor.xyz          receipt ok
#   bsc-rpc.publicnode.com      online, but refuses archive reads without a token
#   bsc.drpc.org                dead
#   rpc.ankr.com/bsc            dead
# publicnode used to sit first in this list while answering eth_blockNumber
# happily, so it won every health check and then failed every real lookup.
BSC_RPC_URLS = [
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-dataseed1.ninicoin.io",
    "https://bsc.blockrazor.xyz",
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
    def __init__(self, valid: bool, error: str = None, data: dict = None, retryable: bool = False):
        self.valid = valid
        self.error = error
        self.data = data or {}
        # True when we could not *check*, as opposed to having checked and found
        # a problem. The difference matters enormously to the person who paid:
        # "we cannot reach the blockchain right now" is our fault and will pass
        # on retry, "this transaction does not exist" is an accusation. The
        # caller must keep the user's tx hash when this is set.
        self.retryable = retryable


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
    """Deprecated: probed with eth_blockNumber and returned the first responder.

    That is exactly how every payment came to be rejected. publicnode answers
    eth_blockNumber happily but refuses eth_getTransactionReceipt without an
    archive token, so this always handed back an endpoint that could not do the
    one job it was picked for. Use _fetch_receipt instead, which tries the real
    call against each endpoint in turn.
    """
    for url in BSC_RPC_URLS:
        try:
            result = await _rpc_call(client, url, "eth_blockNumber", [])
            if result:
                return url
        except Exception:
            continue
    return None


async def _rpc_call_ex(
    client: httpx.AsyncClient, rpc_url: str, method: str, params: list
) -> tuple[Optional[dict], bool]:
    """Like _rpc_call, but says whether the node actually answered.

    Returns (result, answered). `_rpc_call` collapses "the node replied null"
    and "the node refused or was unreachable" into the same None, and that lost
    distinction is what turned an RPC outage into "your transaction does not
    exist" for paying users.
    """
    try:
        resp = await client.post(
            rpc_url, json={"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
        )
        data = resp.json()
        if "error" in data:
            logger.warning(f"   RPC refused ({rpc_url}): {data['error']}")
            return None, False
        return data.get("result"), True
    except Exception as e:
        logger.warning(f"   RPC unreachable ({rpc_url}): {type(e).__name__}: {e}")
        return None, False


async def _fetch_receipt(client: httpx.AsyncClient, tx_hash: str) -> tuple[Optional[dict], str, bool]:
    """Get a transaction receipt, trying every endpoint with the *real* call.

    Returns (receipt, url_that_answered, anyone_answered_the_receipt_query).

    The third value is the one that matters. A node returning null is not proof
    the transaction is absent — it may be pruned, lagging, or refusing archive
    queries, which is precisely what publicnode started doing. "Not found" is
    only safe to tell a user once some node has genuinely answered the receipt
    query itself, not merely proved it is online.
    """
    answered_by_anyone = False
    for url in BSC_RPC_URLS:
        receipt, answered = await _rpc_call_ex(client, url, "eth_getTransactionReceipt", [tx_hash])
        if answered:
            answered_by_anyone = True
            if receipt and isinstance(receipt, dict):
                logger.info(f"   ✅ Receipt from {url}")
                return receipt, url, True
            logger.info(f"   … {url} answered but has no such transaction")
    return None, "", answered_by_anyone


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

    # An exchange settles a withdrawal internally when it recognises the
    # destination as one of its own addresses: no chain transaction, zero fee,
    # and an id like INTERNAL84846461... instead of a 0x hash. Searching the
    # chain for it will always fail, so say what actually happened rather than
    # reporting the transfer as missing. A real user hit this on MEXC.
    cleaned = (tx_hash or "").strip()
    if not cleaned.lower().startswith("0x") or len(cleaned) != 66:
        looks_internal = cleaned.upper().startswith("INTERNAL")
        return TxVerificationResult(
            False,
            (
                "This looks like an exchange-internal transfer, not a blockchain "
                "transaction. Your exchange settled it inside its own books, so it "
                "never reached BNB Smart Chain and cannot be verified here. Contact "
                "support with this transfer id and we will confirm it manually."
                if looks_internal
                else "That does not look like a BSC transaction hash. A BEP20 hash "
                "starts with 0x and is 66 characters long — please paste the full hash."
            ),
            {"submitted": cleaned[:80], "internal_transfer": looks_internal},
        )

    try:
        # Use ssl context that doesn't verify (workaround for macOS SSL issues)
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            # ─── Step 1: Get TX receipt, trying every endpoint ───
            logger.info("📡 Step 1: Getting TX receipt...")
            receipt, rpc_url, anyone_answered = await _fetch_receipt(client, tx_hash)

            if not receipt:
                if not anyone_answered:
                    # Nothing could answer the question, so we have not earned
                    # the right to tell a paying user their transaction is
                    # missing. Retryable: the caller keeps their hash.
                    logger.error("❌ No BSC endpoint could serve a receipt lookup")
                    return TxVerificationResult(
                        False,
                        "We could not reach the BSC network to check this transaction. "
                        "Your payment details have been kept and we will retry — "
                        "you do not need to send anything again.",
                        retryable=True,
                    )
                logger.warning("⚠️ TX receipt genuinely not found")
                return TxVerificationResult(
                    False,
                    "This transaction hash was not found on BSC. Please check that you "
                    "copied the full hash, and that the transfer was sent on BNB Smart "
                    "Chain (BEP20) rather than another network.",
                )

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
            block_result, block_answered = await _rpc_call_ex(client, rpc_url, "eth_blockNumber", [])
            if not block_answered or not block_result:
                # Falling back to current_block = 0 here made confirmations
                # negative, which read as "not enough confirmations" and blamed
                # the user for our own failed lookup.
                return TxVerificationResult(
                    False,
                    "We could not read the current block height to count confirmations. "
                    "Your payment details have been kept and we will retry.",
                    retryable=True,
                )
            current_block = int(block_result, 16)
            tx_block = int(receipt.get("blockNumber", "0x0"), 16)
            confirmations = current_block - tx_block

            logger.info(f"   Confirmations: {confirmations} (required: {MIN_CONFIRMATIONS})")

            if confirmations < MIN_CONFIRMATIONS:
                return TxVerificationResult(
                    False,
                    f"Only {confirmations} of {MIN_CONFIRMATIONS} confirmations so far. "
                    "The transfer is on-chain — this just needs another minute.",
                    {"confirmations": confirmations, "required": MIN_CONFIRMATIONS},
                    # Purely a matter of waiting, so never discard the hash.
                    retryable=True,
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
        # Our crash, not their transaction. Keep the hash and let them retry.
        logger.error(f"❌ Verification error: {e}", exc_info=True)
        return TxVerificationResult(
            False,
            "Something went wrong on our side while checking this transaction. "
            "Your payment details have been kept and we will retry.",
            {"exception": str(e)[:200]},
            retryable=True,
        )


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
        return None# ════════════════════════════════════════════════════════════════════
# Admin manual-payment recording — flexible TX inspector
# Added separately so it doesn't disturb the existing self-verify flow.
# ════════════════════════════════════════════════════════════════════

async def fetch_tx_details(
    tx_hash: str,
    valid_pool_addresses: Optional[set] = None,
) -> Dict[str, Any]:
    """
    Inspect a BSC transaction WITHOUT requiring expected_amount/wallet upfront.

    Used by the admin "Manual Payment Record" flow — admin pastes a TX hash,
    backend fetches everything we can know from-chain, frontend renders a
    preview, admin then picks the plan + user.

    Args:
        tx_hash: 0x... hex tx hash
        valid_pool_addresses: optional set of lowercase pool wallet addresses.
            If provided, response includes `in_pool` flag.

    Returns dict with shape:
        {
          "found": bool,
          "status": "success" | "failed" | "not_found",
          "tx_hash": str,
          "is_usdt": bool,
          "from": str | None,
          "to": str | None,
          "amount": str (decimal) | None,
          "block": int | None,
          "confirmations": int | None,
          "timestamp": ISO 8601 str | None,
          "in_pool": bool | None,
          "error": str | None,         # human-readable, if blocker
        }
    """
    out: Dict[str, Any] = {
        "found": False,
        "status": "not_found",
        "tx_hash": tx_hash,
        "is_usdt": False,
        "from": None,
        "to": None,
        "amount": None,
        "block": None,
        "confirmations": None,
        "timestamp": None,
        "in_pool": None,
        "error": None,
    }

    pool_set = {a.lower() for a in (valid_pool_addresses or set())}

    try:
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            rpc_url = await _get_working_rpc(client)
            if not rpc_url:
                out["error"] = "Could not connect to BSC network. Try again later."
                return out

            # ── Step 1: Get TX receipt ──
            receipt = await _rpc_call(client, rpc_url, "eth_getTransactionReceipt", [tx_hash])

            if not receipt or not isinstance(receipt, dict):
                out["status"] = "not_found"
                out["error"] = "Transaction not found on BSC. Check the hash and try again."
                return out

            out["found"] = True

            # TX status
            tx_status_hex = receipt.get("status", "0x0")
            if tx_status_hex == "0x0":
                out["status"] = "failed"
                out["error"] = "Transaction failed (reverted) on chain."
                return out

            out["status"] = "success"
            out["block"] = int(receipt.get("blockNumber", "0x0"), 16)

            # ── Step 2: Find USDT Transfer log ──
            for log in receipt.get("logs", []):
                if log.get("address", "").lower() != USDT_CONTRACT_LOWER:
                    continue
                topics = log.get("topics", [])
                if len(topics) < 3:
                    continue
                if topics[0] != TRANSFER_EVENT_TOPIC:
                    continue

                # Found USDT transfer log
                out["is_usdt"] = True
                out["from"] = "0x" + topics[1][-40:]
                out["to"] = "0x" + topics[2][-40:]

                raw_value = int(log.get("data", "0x0"), 16)
                amount = Decimal(raw_value) / Decimal(10 ** 18)
                out["amount"] = str(amount)
                break

            if not out["is_usdt"]:
                out["error"] = "Transaction is not a USDT (BEP-20) transfer."
                return out

            # ── Step 3: Pool membership check (if pool set provided) ──
            if pool_set:
                out["in_pool"] = (out["to"] or "").lower() in pool_set

            # ── Step 4: Confirmations ──
            block_result = await _rpc_call(client, rpc_url, "eth_blockNumber", [])
            current_block = int(block_result, 16) if block_result else 0
            out["confirmations"] = max(0, current_block - out["block"])

            # ── Step 5: Block timestamp ──
            block_data = await _rpc_call(
                client, rpc_url, "eth_getBlockByNumber",
                [hex(out["block"]), False]
            )
            if block_data and isinstance(block_data, dict):
                ts_hex = block_data.get("timestamp", "0x0")
                ts_int = int(ts_hex, 16)
                from datetime import datetime, timezone
                out["timestamp"] = datetime.fromtimestamp(ts_int, tz=timezone.utc).isoformat()

            return out

    except Exception as e:
        logger.error(f"fetch_tx_details error for {tx_hash}: {e}", exc_info=True)
        out["error"] = f"Inspection error: {str(e)}"
        return out
