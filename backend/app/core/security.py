from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import time

# ============ Config ============
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "luxquant-secret-key-change-in-production-123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 7
LUXQUANT_JWT_SECRET = os.getenv("LUXQUANT_JWT_SECRET", "")
LUXQUANT_CRYPTOBOT_TOKEN_EXPIRE_SECONDS = int(
    os.getenv("LUXQUANT_CRYPTOBOT_TOKEN_EXPIRE_SECONDS", "3600")
)

# ============ Password Hashing ============
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password menggunakan bcrypt"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifikasi password"""
    return pwd_context.verify(plain_password, hashed_password)


# ============ JWT Tokens ============
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Generate JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode dan validasi JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def create_tokens(user_id: int, email: str) -> dict:
    """Generate both access dan refresh tokens"""
    token_data = {"sub": str(user_id), "email": email}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data)
    }


def create_cryptobot_exchange_token(user) -> Optional[str]:
    """Generate short-lived LuxQuant JWT for Cryptobot token exchange.

    Embeds entitlement (has_active_access) + role so Cryptobot can gate
    access without querying the LuxQuant DB.
    """
    if not LUXQUANT_JWT_SECRET:
        return None

    issued_at = int(time.time())
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "has_active_access": bool(user.has_active_access),
        "telegram_id": str(user.telegram_id) if user.telegram_id else None,
        "telegram_username": user.telegram_username,
        "iat": issued_at,
        "exp": issued_at + LUXQUANT_CRYPTOBOT_TOKEN_EXPIRE_SECONDS,
    }
    return jwt.encode(payload, LUXQUANT_JWT_SECRET, algorithm=ALGORITHM)
