# backend/app/models/payment_audit.py
"""
Payment record audit — assignment + status for active premium/subscriber users
who still lack a confirmed payment record. The "needs a record" set itself is
computed live in the API; this table only persists who owns each case.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func

from app.core.database import Base


class PaymentRecordAssignment(Base):
    __tablename__ = "payment_record_assignments"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    assigned_admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending | recorded | waived
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<PaymentRecordAssignment user={self.user_id} status={self.status}>"
