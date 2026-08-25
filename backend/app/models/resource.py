from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class Resource(Base):
    """
    Unified content hub entity — a CoinGecko-style "Resource".

    One table backs four content types via `type`:
      • article — long-form written content (HTML or Markdown body)
      • pdf     — an uploaded PDF module (the legacy "Tips" behaviour)
      • video   — a YouTube / Vimeo link; embed_html + thumbnail auto-fetched
      • link    — any external URL; preview card built from Open Graph tags

    Admins manage everything from the Management System → Resources tab
    (and inline quick-controls on the public hub).
    """
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)

    # ── Type & identity ──
    type = Column(String(20), default="article", index=True)   # article | pdf | video | link
    title = Column(String(300), nullable=False)
    slug = Column(String(340), unique=True, index=True)
    excerpt = Column(Text, nullable=True)                       # short summary / dek

    # ── Article body ──
    content = Column(Text, nullable=True)                       # HTML or Markdown
    content_format = Column(String(10), default="html")         # html | markdown

    # ── Media / cover ──
    cover_image = Column(String(1000), nullable=True)           # uploaded filename OR full URL
    cover_is_external = Column(Boolean, default=False)          # True → cover_image is a full URL

    # ── PDF type ──
    pdf_path = Column(String(500), nullable=True)

    # ── Video / link type ──
    source_url = Column(String(1000), nullable=True)            # original pasted URL
    embed_html = Column(Text, nullable=True)                    # cached oEmbed iframe (video)
    provider = Column(String(50), nullable=True)                # youtube | vimeo | twitter | web

    # ── Curriculum (Learn) ──
    # `track` is the shelf: an ordered path, not a format bucket. NULL keeps a
    # row out of Learn entirely, which is what the two legacy rows do until
    # somebody files them.
    track = Column(String(40), nullable=True, index=True)
    order_index = Column(Integer, default=0, nullable=False)
    level = Column(String(16), nullable=True)          # basic | intermediate | advanced
    est_minutes = Column(Integer, nullable=True)       # author override; else derived

    # ── Taxonomy & meta ──
    category = Column(String(100), default="General", index=True)
    tags = Column(Text, nullable=True)                          # comma-separated
    author_name = Column(String(200), nullable=True)           # display author / channel
    reading_time = Column(Integer, nullable=True)              # minutes (articles)
    view_count = Column(Integer, default=0)

    # ── Publishing ──
    status = Column(String(20), default="published", index=True)  # draft | published
    is_featured = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True)

    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Resource {self.type}:{self.title}>"


class ResourceProgress(Base):
    """One lesson, finished by one person.

    Kept as its own table rather than a column on the user so the shape stays
    honest: completion is per lesson, and the rows also answer "which lesson do
    people abandon", which a boolean on the user could never.
    """
    __tablename__ = "resource_progress"

    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    resource_id = Column(
        Integer, ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True
    )
    completed_at = Column(DateTime(timezone=True), server_default=func.now())
