from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth import get_user_by_session_token


async def get_current_user(
    clipmark_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Get the current authenticated user. Raises 401 if not authenticated."""
    if not clipmark_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_user_by_session_token(db, clipmark_session)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(
    clipmark_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Require admin role for access. Raises 401/403 as appropriate."""
    if not clipmark_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_user_by_session_token(db, clipmark_session)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
