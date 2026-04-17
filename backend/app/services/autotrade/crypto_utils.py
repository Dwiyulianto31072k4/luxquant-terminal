"""
LuxQuant Terminal - Crypto Utils
Fernet symmetric encryption for exchange API keys.
"""
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_fernet() -> Fernet:
    master_key = os.getenv("AUTOTRADE_ENCRYPTION_KEY")
    if not master_key:
        raise RuntimeError(
            "AUTOTRADE_ENCRYPTION_KEY not set. "
            "Generate with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(master_key.encode())
    except Exception:
        pass
    salt = os.getenv("AUTOTRADE_ENCRYPTION_SALT", "luxquant-autotrade-salt").encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=480_000)
    key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
    return Fernet(key)


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def mask_api_key(api_key: str) -> str:
    if not api_key or len(api_key) < 10:
        return "****"
    return f"{api_key[:4]}...{api_key[-4:]}"
