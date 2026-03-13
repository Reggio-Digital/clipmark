import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import User, Session

SESSION_MAX_AGE_DAYS = 30


async def get_user_by_session_token(db: AsyncSession, token: str) -> User | None:
    """Look up a user by their session token. Returns None if expired or invalid."""
    if not token:
        return None
    result = await db.execute(
        select(Session).where(
            Session.token == token,
            Session.expires_at > datetime.utcnow(),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    if user and not user.enabled:
        return None
    return user


async def create_session_for_user(db: AsyncSession, user_id: str) -> str:
    """Create a new session token for a user."""
    token = secrets.token_urlsafe(32)
    session = Session(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token=token,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=SESSION_MAX_AGE_DAYS),
    )
    db.add(session)
    await db.commit()
    return token


async def delete_session(db: AsyncSession, token: str) -> None:
    """Delete a session by token."""
    await db.execute(delete(Session).where(Session.token == token))
    await db.commit()


async def delete_user_sessions(db: AsyncSession, user_id: str) -> None:
    """Delete all sessions for a user."""
    await db.execute(delete(Session).where(Session.user_id == user_id))
    await db.commit()


async def cleanup_expired_sessions(db: AsyncSession) -> None:
    """Remove expired sessions."""
    await db.execute(delete(Session).where(Session.expires_at <= datetime.utcnow()))
    await db.commit()


async def get_user_by_plex_id(db: AsyncSession, plex_account_id: str) -> User | None:
    """Look up a user by their Plex account ID."""
    result = await db.execute(
        select(User).where(User.plex_account_id == plex_account_id)
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    plex_account_id: str,
    plex_username: str,
    plex_email: str | None = None,
    plex_thumb: str | None = None,
    role: str = "user",
) -> User:
    """Create a new user."""
    user = User(
        id=str(uuid.uuid4()),
        plex_account_id=plex_account_id,
        plex_username=plex_username,
        plex_email=plex_email,
        plex_thumb=plex_thumb,
        role=role,
        enabled=True,
        created_at=datetime.utcnow(),
        last_login=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_login(
    db: AsyncSession,
    user: User,
    plex_username: str | None = None,
    plex_email: str | None = None,
    plex_thumb: str | None = None,
) -> None:
    """Update user info on login."""
    user.last_login = datetime.utcnow()
    if plex_username:
        user.plex_username = plex_username
    if plex_email is not None:
        user.plex_email = plex_email
    if plex_thumb is not None:
        user.plex_thumb = plex_thumb
    await db.commit()


async def has_any_admin(db: AsyncSession) -> bool:
    """Check if any admin user exists."""
    result = await db.scalar(
        select(func.count()).select_from(User).where(User.role == "admin")
    )
    return (result or 0) > 0


async def get_all_users(db: AsyncSession) -> list[User]:
    """Get all users."""
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
