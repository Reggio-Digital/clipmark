from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Index, Boolean
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    plex_account_id = Column(String, unique=True, nullable=False)
    plex_username = Column(String, nullable=False)
    plex_email = Column(String, nullable=True)
    plex_thumb = Column(String, nullable=True)
    role = Column(String, nullable=False, default="user")  # "admin" or "user"
    giphy_api_key = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_users_plex_account_id", "plex_account_id"),
    )


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    token = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    __table_args__ = (
        Index("idx_sessions_token", "token"),
        Index("idx_sessions_user_id", "user_id"),
        Index("idx_sessions_expires_at", "expires_at"),
    )


class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    interval_minutes = Column(Integer, nullable=False, default=60)
    enabled = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="idle")  # "idle" | "running"
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_scheduled_tasks_enabled", "enabled"),
    )


class GifRecord(Base):
    __tablename__ = "gifs"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    media_id = Column(String, nullable=False)
    media_title = Column(String, nullable=False)
    media_type = Column(String, nullable=True)
    show_title = Column(String, nullable=True)
    season = Column(Integer, nullable=True)
    episode = Column(Integer, nullable=True)
    year = Column(Integer, nullable=True)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    fps = Column(Integer, nullable=False)
    include_subtitles = Column(Integer, nullable=False, default=0)
    subtitle_index = Column(Integer, nullable=True)
    custom_text = Column(Text, nullable=True)
    text_position = Column(String, nullable=True)
    text_size = Column(String, nullable=True)
    status = Column(String, nullable=False, default="queued")
    progress = Column(Integer, nullable=False, default=0)
    filename = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    giphy_id = Column(String, nullable=True)
    giphy_url = Column(String, nullable=True)
    uploaded_at = Column(DateTime, nullable=True)
    public_token = Column(String, nullable=True, unique=True)

    __table_args__ = (
        Index("idx_gifs_status", "status"),
        Index("idx_gifs_created_at", "created_at"),
        Index("idx_gifs_user_id", "user_id"),
        Index("idx_gifs_public_token", "public_token"),
    )


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    media_id = Column(String, nullable=False)
    media_type = Column(String, nullable=False)  # "movie" | "show" | "episode"
    media_title = Column(String, nullable=False)
    thumb_url = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    show_title = Column(String, nullable=True)
    season = Column(Integer, nullable=True)
    episode = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_favorites_user_id", "user_id"),
        Index("idx_favorites_media_id", "media_id"),
        Index("idx_favorites_user_media", "user_id", "media_id", unique=True),
    )
