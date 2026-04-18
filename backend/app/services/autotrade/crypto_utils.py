"""
LuxQuant Terminal - Crypto Utils
Fernet symmetric encryption for exchange API keys.

Setup:
    1. Generate key:
       python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    2. Set in .env:
       AUTOTRADE_ENCRYPTION_KEY=<generated_key>

Usage:
    from app.services.autotrade.crypto_utils import encrypt_value, decrypt_value

    cipher = encrypt_value("my-api-key")
    plain = decrypt_value(cipher)
"""
import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger("autotrade.crypto")


def _get_fernet() -> Fernet:
    """
    Get Fernet instance from env var.
    Accepts two formats:
      1. Pre-generated Fernet key (urlsafe_b64encoded 32 bytes) — preferred
      2. Any passphrase — derived via PBKDF2 (backward compat)
    """
    master_key = os.getenv("AUTOTRADE_ENCRYPTION_KEY")
    if not master_key:
        raise RuntimeError(
            "AUTOTRADE_ENCRYPTION_KEY not set. "
            'Generate: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )

    # Try as pre-generated Fernet key
    try:
        return Fernet(master_key.encode())
    except Exception:
        pass

    # Fallback: derive from passphrase via PBKDF2
    salt = os.getenv("AUTOTRADE_ENCRYPTION_SALT", "luxquant-autotrade-salt").encode()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480_000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
    return Fernet(key)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns empty string if input is empty."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns empty string if input is empty."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        raise


def mask_api_key(api_key: str) -> str:
    """Mask API key for logging/display: 'abcd...wxyz'."""
    if not api_key or len(api_key) < 10:
        return "****"
    return f"{api_key[:4]}...{api_key[-4:]}"
