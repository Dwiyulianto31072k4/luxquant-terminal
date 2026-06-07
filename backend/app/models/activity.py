# backend/app/models/activity.py
"""
UserActivityEvent — lightweight per-feature usage log for growth analytics.

Written by ActivityTrackerMiddleware, deduped to at most one row per
(user, feature, hour) so the table stays small. Read by the Growth
dashboard endpoints (Batch 2) to compute DAU/WAU/MAU, feature funnels,
hot leads, and at-risk subscribers.

Rows older than ~90 days can be safely purged (see growth purge cron).
"""
from sqlalchemy import (
    Column, BigInteger, Integer, String, DateTime, ForeignKey, Index
)
from sqlalchemy.sql import func

from app.core.database import Base


class UserActivityEvent(Base):
    __tablename__ = "user_activity_events"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Coarse feature bucket: 'signals', 'autotrade', 'markets', etc.
    feature = Column(String(50), nullable=False, index=True)
    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    __table_args__ = (
        Index("ix_activity_user_time", "user_id", "occurred_at"),
        Index("ix_activity_feature_time", "feature", "occurred_at"),
    )

    def __repr__(self):
        return (
            f"<UserActivityEvent user={self.user_id} "
            f"feature={self.feature} at={self.occurred_at}>"
        )
