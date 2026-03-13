import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.db import Favorite
from app.models.schemas import FavoriteCreate, FavoriteResponse, PaginatedResponse

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


@router.get("/ids", response_model=list[str])
async def get_favorite_ids(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all favorited media IDs for the current user (lightweight check)."""
    result = await db.execute(
        select(Favorite.media_id).where(Favorite.user_id == user.id)
    )
    return [row[0] for row in result.fetchall()]


@router.get("", response_model=PaginatedResponse[FavoriteResponse])
async def list_favorites(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    media_type: str | None = Query(default=None, description="Filter: 'movie' or 'show'"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's favorites with pagination."""
    query = select(Favorite).where(Favorite.user_id == user.id)
    count_query = select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id)

    if media_type:
        if media_type not in ("movie", "show"):
            raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'show'")
        if media_type == "show":
            # Include both shows and episodes under the "show" filter
            query = query.where(Favorite.media_type.in_(("show", "episode")))
            count_query = count_query.where(Favorite.media_type.in_(("show", "episode")))
        else:
            query = query.where(Favorite.media_type == media_type)
            count_query = count_query.where(Favorite.media_type == media_type)

    total = await db.scalar(count_query)
    query = query.order_by(Favorite.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    records = result.scalars().all()

    return PaginatedResponse(
        items=[
            FavoriteResponse(
                id=r.id,
                user_id=r.user_id,
                media_id=r.media_id,
                media_type=r.media_type,
                media_title=r.media_title,
                thumb_url=r.thumb_url,
                year=r.year,
                show_title=r.show_title,
                season=r.season,
                episode=r.episode,
                created_at=r.created_at,
            )
            for r in records
        ],
        page=page,
        page_size=page_size,
        total_items=total or 0,
    )


@router.post("", response_model=FavoriteResponse)
async def add_favorite(
    request: FavoriteCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a media item to favorites."""
    if request.media_type not in ("movie", "show", "episode"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie', 'show', or 'episode'")

    existing = await db.execute(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.media_id == request.media_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already favorited")

    record = Favorite(
        id=str(uuid.uuid4()),
        user_id=user.id,
        media_id=request.media_id,
        media_type=request.media_type,
        media_title=request.media_title,
        thumb_url=request.thumb_url,
        year=request.year,
        show_title=request.show_title,
        season=request.season,
        episode=request.episode,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return FavoriteResponse(
        id=record.id,
        user_id=record.user_id,
        media_id=record.media_id,
        media_type=record.media_type,
        media_title=record.media_title,
        thumb_url=record.thumb_url,
        year=record.year,
        show_title=record.show_title,
        season=record.season,
        episode=record.episode,
        created_at=record.created_at,
    )


@router.delete("/{media_id}", status_code=204)
async def remove_favorite(
    media_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a media item from favorites."""
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.media_id == media_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Favorite not found")

    await db.execute(delete(Favorite).where(Favorite.id == record.id))
    await db.commit()
