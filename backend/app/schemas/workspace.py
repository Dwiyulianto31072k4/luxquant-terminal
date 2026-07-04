# backend/app/schemas/workspace.py
"""
Pydantic schemas for Admin Workspace endpoints.

Notes:
- 'extra_data' is used instead of 'metadata' to avoid SQLAlchemy collision
  (Base classes already define .metadata). Field accepts free-form JSON.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, date


# ════════════════════════════════════════════════════════════════════
# Common
# ════════════════════════════════════════════════════════════════════

class UserMini(BaseModel):
    """Lightweight user info for audit fields."""
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)


# ════════════════════════════════════════════════════════════════════
# Follow-ups
# ════════════════════════════════════════════════════════════════════

VALID_FOLLOWUP_STATUS = {'pending', 'in_progress', 'done', 'cancelled'}
VALID_FOLLOWUP_CATEGORY = {'renewal', 'winback', 'payment', 'support', 'general'}
VALID_PRIORITY = {'low', 'normal', 'high', 'urgent'}


class GenerateFollowupsRequest(BaseModel):
    """Auto-generate retention follow-ups from subscription lifecycle."""
    renewal: bool = True          # expiring subscribers
    winback: bool = True          # recently expired subscribers
    renewal_days: int = Field(default=7, ge=1, le=90)   # expiring within N days
    winback_days: int = Field(default=14, ge=1, le=180)  # expired within last N days


class FollowupCreate(BaseModel):
    user_id: Optional[int] = None
    title: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = None
    category: str = Field(default='general')
    due_date: datetime
    priority: str = Field(default='normal')

    @field_validator('category')
    @classmethod
    def cat_valid(cls, v):
        if v not in VALID_FOLLOWUP_CATEGORY:
            raise ValueError(f"category must be one of: {', '.join(VALID_FOLLOWUP_CATEGORY)}")
        return v

    @field_validator('priority')
    @classmethod
    def pri_valid(cls, v):
        if v not in VALID_PRIORITY:
            raise ValueError(f"priority must be one of: {', '.join(VALID_PRIORITY)}")
        return v


class FollowupUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = None
    category: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None
    priority: Optional[str] = None

    @field_validator('category')
    @classmethod
    def cat_valid(cls, v):
        if v is not None and v not in VALID_FOLLOWUP_CATEGORY:
            raise ValueError(f"category must be one of: {', '.join(VALID_FOLLOWUP_CATEGORY)}")
        return v

    @field_validator('status')
    @classmethod
    def status_valid(cls, v):
        if v is not None and v not in VALID_FOLLOWUP_STATUS:
            raise ValueError(f"status must be one of: {', '.join(VALID_FOLLOWUP_STATUS)}")
        return v

    @field_validator('priority')
    @classmethod
    def pri_valid(cls, v):
        if v is not None and v not in VALID_PRIORITY:
            raise ValueError(f"priority must be one of: {', '.join(VALID_PRIORITY)}")
        return v


class FollowupResponse(BaseModel):
    id: int
    user_id: Optional[int]
    user: Optional[UserMini]
    title: str
    note: Optional[str]
    category: str
    due_date: datetime
    status: str
    priority: str
    created_by: int
    creator: Optional[UserMini]
    completed_by: Optional[int]
    completer: Optional[UserMini]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ════════════════════════════════════════════════════════════════════
# Marketing Campaigns
# ════════════════════════════════════════════════════════════════════

VALID_CAMPAIGN_STATUS = {'planning', 'active', 'paused', 'completed', 'cancelled'}
VALID_PLATFORM = {'twitter', 'telegram', 'discord', 'influencer', 'other'}


class CampaignCreate(BaseModel):
    # Disable protected_namespaces to allow flexible field names
    model_config = ConfigDict(protected_namespaces=())

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    platform: Optional[str] = None
    budget_usd: float = Field(default=0, ge=0)
    spent_usd: float = Field(default=0, ge=0)
    extra_data: Optional[Dict[str, Any]] = None
    line_items: Optional[List[Dict[str, Any]]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = Field(default='planning')

    @field_validator('platform')
    @classmethod
    def platform_valid(cls, v):
        if v is not None and v not in VALID_PLATFORM:
            raise ValueError(f"platform must be one of: {', '.join(VALID_PLATFORM)}")
        return v

    @field_validator('status')
    @classmethod
    def status_valid(cls, v):
        if v not in VALID_CAMPAIGN_STATUS:
            raise ValueError(f"status must be one of: {', '.join(VALID_CAMPAIGN_STATUS)}")
        return v


class CampaignUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    platform: Optional[str] = None
    budget_usd: Optional[float] = Field(default=None, ge=0)
    spent_usd: Optional[float] = Field(default=None, ge=0)
    extra_data: Optional[Dict[str, Any]] = None
    line_items: Optional[List[Dict[str, Any]]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None

    @field_validator('platform')
    @classmethod
    def platform_valid(cls, v):
        if v is not None and v not in VALID_PLATFORM:
            raise ValueError(f"platform must be one of: {', '.join(VALID_PLATFORM)}")
        return v

    @field_validator('status')
    @classmethod
    def status_valid(cls, v):
        if v is not None and v not in VALID_CAMPAIGN_STATUS:
            raise ValueError(f"status must be one of: {', '.join(VALID_CAMPAIGN_STATUS)}")
        return v


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    name: str
    description: Optional[str]
    platform: Optional[str]
    budget_usd: float
    spent_usd: float
    extra_data: Dict[str, Any]
    line_items: List[Dict[str, Any]]
    start_date: Optional[date]
    end_date: Optional[date]
    status: str
    created_by: int
    creator: Optional[UserMini]
    created_at: datetime
    updated_at: datetime


# ════════════════════════════════════════════════════════════════════
# Brand TODOs
# ════════════════════════════════════════════════════════════════════

VALID_TODO_STATUS = {'backlog', 'in_progress', 'done', 'cancelled'}
VALID_TODO_CATEGORY = {'product', 'marketing', 'ops', 'bug', 'idea', 'other'}


class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: str = Field(default='other')
    priority: str = Field(default='normal')
    due_date: Optional[date] = None
    tags: Optional[List[str]] = None

    @field_validator('category')
    @classmethod
    def cat_valid(cls, v):
        if v not in VALID_TODO_CATEGORY:
            raise ValueError(f"category must be one of: {', '.join(VALID_TODO_CATEGORY)}")
        return v

    @field_validator('priority')
    @classmethod
    def pri_valid(cls, v):
        if v not in VALID_PRIORITY:
            raise ValueError(f"priority must be one of: {', '.join(VALID_PRIORITY)}")
        return v


class TodoUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    tags: Optional[List[str]] = None

    @field_validator('category')
    @classmethod
    def cat_valid(cls, v):
        if v is not None and v not in VALID_TODO_CATEGORY:
            raise ValueError(f"category must be one of: {', '.join(VALID_TODO_CATEGORY)}")
        return v

    @field_validator('status')
    @classmethod
    def status_valid(cls, v):
        if v is not None and v not in VALID_TODO_STATUS:
            raise ValueError(f"status must be one of: {', '.join(VALID_TODO_STATUS)}")
        return v

    @field_validator('priority')
    @classmethod
    def pri_valid(cls, v):
        if v is not None and v not in VALID_PRIORITY:
            raise ValueError(f"priority must be one of: {', '.join(VALID_PRIORITY)}")
        return v


class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    category: str
    status: str
    priority: str
    due_date: Optional[date]
    tags: List[str]
    created_by: int
    creator: Optional[UserMini]
    completed_by: Optional[int]
    completer: Optional[UserMini]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ════════════════════════════════════════════════════════════════════
# Stats (overview cards)
# ════════════════════════════════════════════════════════════════════

class WorkspaceStats(BaseModel):
    # Follow-ups
    followups_pending: int
    followups_overdue: int
    followups_today: int

    # Marketing
    campaigns_active: int
    total_budget: float
    total_spent: float

    # TODOs
    todos_in_progress: int
    todos_backlog: int
    todos_urgent: int
