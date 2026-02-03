from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# ============ Request Schemas ============

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    
    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        if len(v) < 3:
            raise ValueError('Username minimal 3 karakter')
        if len(v) > 50:
            raise ValueError('Username maksimal 50 karakter')
        if not v.replace('_', '').isalnum():
            raise ValueError('Username hanya boleh huruf, angka, dan underscore')
        return v.lower()
    
    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 8:
            raise ValueError('Password minimal 8 karakter')
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenRefresh(BaseModel):
    refresh_token: str


# ============ Response Schemas ============

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
    success: bool = True