# backend/app/models/workspace.py
"""
SQLAlchemy models for Admin Workspace (Follow-ups, Marketing, TODO).
All tables are SHARED — visible by any admin.

Notes:
- Uses app.core.database.Base (project convention)
- 'metadata' is RESERVED by SQLAlchemy on Base classes, so we use
  'extra_data' as the column name (renamed from initial 'metadata').
"""

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date, ForeignKey, Numeric, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


# ════════════════════════════════════════════════════════════════════
# AdminFollowup — penagihan / outreach reminder queue
# ════════════════════════════════════════════════════════════════════

class AdminFollowup(Base):
    __tablename__ = 'admin_followups'

    id = Column(Integer, primary_key=True, index=True)

    # Optional link to user (NULL for non-user followups)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)

    # Content
    title = Column(String(200), nullable=False)
    note = Column(Text, nullable=True)
    category = Column(String(50), default='general')  # renewal | payment | support | general

    # Schedule
    due_date = Column(DateTime(timezone=True), nullable=False, index=True)
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    status = Column(String(20), nullable=False, default='pending', index=True)
    # pending | in_progress | done | cancelled

    # Priority
    priority = Column(String(20), nullable=False, default='normal')
    # low | normal | high | urgent

    # Audit
    created_by = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    completed_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship('User', foreign_keys=[user_id], lazy='joined')
    creator = relationship('User', foreign_keys=[created_by], lazy='joined')
    completer = relationship('User', foreign_keys=[completed_by], lazy='joined')


# ════════════════════════════════════════════════════════════════════
# MarketingCampaign — flexible budget + line items
# ════════════════════════════════════════════════════════════════════

class MarketingCampaign(Base):
    __tablename__ = 'marketing_campaigns'

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    platform = Column(String(50), nullable=True, index=True)
    # twitter | telegram | discord | influencer | other

    # Money
    budget_usd = Column(Numeric(12, 2), nullable=False, default=0)
    spent_usd = Column(Numeric(12, 2), nullable=False, default=0)

    # Custom flexible data (free-form JSON)
    # IMPORTANT: NOT named 'metadata' karena reserved by SQLAlchemy Base.
    # Renamed: 'metadata' -> 'extra_data' (in DB + Python).
    # e.g. {"impressions": 50000, "conversions": 12, "tags": ["promo", "Q2"]}
    extra_data = Column(JSONB, nullable=False, default=dict)

    # Line items (free-form list)
    # e.g. [{"label": "Ad spend", "amount": 100, "date": "2025-05-20", "note": "..."}]
    line_items = Column(JSONB, nullable=False, default=list)

    # Schedule
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    # Status
    status = Column(String(20), nullable=False, default='planning', index=True)
    # planning | active | paused | completed | cancelled

    # Audit
    created_by = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    creator = relationship('User', foreign_keys=[created_by], lazy='joined')


# ════════════════════════════════════════════════════════════════════
# BrandTodo — internal task list for LuxQuant team
# ════════════════════════════════════════════════════════════════════

class BrandTodo(Base):
    __tablename__ = 'brand_todos'

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    category = Column(String(50), default='other', index=True)
    # product | marketing | ops | bug | idea | other

    status = Column(String(20), nullable=False, default='backlog', index=True)
    # backlog | in_progress | done | cancelled

    priority = Column(String(20), nullable=False, default='normal')
    # low | normal | high | urgent

    due_date = Column(Date, nullable=True)

    # Free-form tags array
    # e.g. ["frontend", "v2", "user-request"]
    tags = Column(JSONB, nullable=False, default=list)

    # Audit
    created_by = Column(Integer, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    completed_by = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    creator = relationship('User', foreign_keys=[created_by], lazy='joined')
    completer = relationship('User', foreign_keys=[completed_by], lazy='joined')
