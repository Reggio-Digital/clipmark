import asyncio

from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth import get_user_by_session_token
from app.services.plex import get_user_plex_server


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


async def get_current_plex_server(user=Depends(get_current_user)):
    if not user.plex_token:
        raise HTTPException(status_code=403, detail="Sign in to Plex again to access libraries")
    server = await asyncio.to_thread(get_user_plex_server, user.plex_token)
    if not server:
        raise HTTPException(status_code=503, detail="Plex server not configured")
    return server


async def require_media_access(media_id: str, server=Depends(get_current_plex_server)):
    if not media_id.isascii() or not media_id.isdecimal():
        raise HTTPException(status_code=404, detail="Media not found")
    await asyncio.to_thread(server.fetchItem, int(media_id))
    return server


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
