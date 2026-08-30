"""Structured learning domain for LuxQuant Learning Studio.

Resources remain the general research/media shelf.  Learning content has its
own hierarchy because a course, a module and an assessable lesson have
different lifecycle and analytics needs.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.core.database import Base


class LearningCourse(Base):
    __tablename__ = "learning_courses"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(180), unique=True, nullable=False, index=True)
    title = Column(String(240), nullable=False)
    short_title = Column(String(100), nullable=True)
    summary = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(60), default="LuxQuant", nullable=False, index=True)
    level = Column(String(20), default="beginner", nullable=False)
    access_tier = Column(String(20), default="free", nullable=False)
    status = Column(String(20), default="draft", nullable=False, index=True)
    is_featured = Column(Boolean, default=False, nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    estimated_minutes = Column(Integer, default=0, nullable=False)
    cover_image = Column(String(1000), nullable=True)
    skills_json = Column(Text, default="[]", nullable=False)
    outcomes_json = Column(Text, default="[]", nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)


class LearningModule(Base):
    __tablename__ = "learning_modules"
    __table_args__ = (UniqueConstraint("course_id", "slug", name="uq_learning_module_course_slug"),)

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(
        Integer, ForeignKey("learning_courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug = Column(String(180), nullable=False)
    title = Column(String(240), nullable=False)
    summary = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    estimated_minutes = Column(Integer, default=0, nullable=False)
    is_preview = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LearningLesson(Base):
    __tablename__ = "learning_lessons"
    __table_args__ = (UniqueConstraint("module_id", "slug", name="uq_learning_lesson_module_slug"),)

    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(
        Integer, ForeignKey("learning_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug = Column(String(180), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    summary = Column(Text, nullable=True)
    lesson_type = Column(String(24), default="slides", nullable=False, index=True)
    level = Column(String(20), default="beginner", nullable=False)
    access_tier = Column(String(20), default="inherit", nullable=False)
    status = Column(String(20), default="draft", nullable=False, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    estimated_minutes = Column(Integer, default=4, nullable=False)
    content_json = Column(Text, default="[]", nullable=False)
    transcript = Column(Text, nullable=True)
    youtube_url = Column(String(1000), nullable=True)
    source_url = Column(String(1000), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), nullable=True)


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id", name="uq_learning_progress_user_lesson"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(
        Integer, ForeignKey("learning_lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    progress_pct = Column(Integer, default=0, nullable=False)
    score = Column(Float, nullable=True)
    last_position = Column(String(120), nullable=True)
    state_json = Column(Text, default="{}", nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LearningNote(Base):
    __tablename__ = "learning_notes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(
        Integer, ForeignKey("learning_lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    anchor = Column(String(120), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
