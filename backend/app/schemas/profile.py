# backend/app/schemas/profile.py
from pydantic import BaseModel, field_validator
from typing import Optional


class ProfileUpdate(BaseModel):
    """Update profile fields"""
    username: Optional[str] = None

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