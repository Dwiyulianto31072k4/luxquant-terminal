# backend/app/schemas/profile.py
from pydantic import BaseModel, field_validator
from typing import Optional

from app.services.currency_mapping import (
    SUPPORTED_CURRENCIES,
    is_valid_country_code,
)


class ProfileUpdate(BaseModel):
    """Update profile fields"""
    username: Optional[str] = None

    # ─── Display preferences (multi-currency support) ───
    # country_code: ISO 3166-1 alpha-2 (e.g. "ID", "TW", "US")
    #   - empty string "" → clear (set back to NULL)
    #   - None → field not provided (no change)
    # currency_code: ISO 4217 (e.g. "USD", "IDR", "TWD")
    #   - must be in CoinGecko-supported list
    #   - if omitted while country_code is set, backend auto-resolves from mapping
    country_code: Optional[str] = None
    currency_code: Optional[str] = None

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if len(v) < 3:
            raise ValueError('Username minimal 3 karakter')
        if len(v) > 50:
            raise ValueError('Username maksimal 50 karakter')
        if not v.replace('_', '').isalnum():
            raise ValueError('Username hanya boleh huruf, angka, dan underscore')
        return v

    @field_validator('country_code')
    @classmethod
    def country_valid(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if v == "":
            return ""  # sentinel for "clear field"
        if not is_valid_country_code(v):
            raise ValueError('Country code harus 2 huruf ISO 3166-1 (contoh: ID, US, TW)')
        return v

    @field_validator('currency_code')
    @classmethod
    def currency_valid(cls, v):
        if v is None:
            return v
        v = v.strip().upper()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(f'Currency code "{v}" tidak didukung. Gunakan kode ISO 4217 yang valid (USD, IDR, EUR, dll).')
        return v