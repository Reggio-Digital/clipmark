import asyncio
import json
import secrets
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, async_session
from app.models.db import GifRecord
from app.models.schemas import Gif, GifCreate, PaginatedResponse, GiphyUploadResponse, ShareResponse, PublicGif
from app.services.plex import get_plex_server, get_media_detail, load_config
from app.services.giphy import upload_gif_to_giphy, GiphyError
from app.dependencies import get_current_user
from app.config import (
    MAX_QUEUED_JOBS,
    MAX_QUEUED_JOBS_PER_USER,
    OUTPUT_DIR,
)

router = APIRouter(prefix="/api/gifs", tags=["gifs"])


def record_to_gif(record: GifRecord) -> Gif:
    return Gif(
        id=record.id,
        user_id=record.user_id,
        media_id=record.media_id,
        media_title=record.media_title,
        media_type=record.media_type,
        show_title=record.show_title,
        season=record.season,
        episode=record.episode,
        year=record.year,
        imdb_id=record.imdb_id,
        tvdb_id=record.tvdb_id,
        tmdb_id=record.tmdb_id,
        start_ms=record.start_ms,
        end_ms=record.end_ms,
        width=record.width,
        fps=record.fps,
        include_subtitles=bool(record.include_subtitles),
        subtitle_index=record.subtitle_index,
        custom_text=record.custom_text,
        text_position=record.text_position,
        text_size=record.text_size,
        status=record.status,
        progress=record.progress,
        filename=record.filename,
        size_bytes=record.size_bytes,
        error=record.error,
        created_at=record.created_at,
        completed_at=record.completed_at,
        giphy_id=record.giphy_id,
        giphy_url=record.giphy_url,
        uploaded_at=record.uploaded_at,
        public_token=record.public_token,
    )


@router.post("", response_model=Gif)
async def create_gif(
    request: GifCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = load_config()
    duration_ms = request.end_ms - request.start_ms
    max_duration_ms = config.max_gif_duration_seconds * 1000
    if duration_ms > max_duration_ms:
        raise HTTPException(
            status_code=400,
            detail=f"Duration exceeds maximum of {config.max_gif_duration_seconds} seconds",
        )
    if duration_ms <= 0:
        raise HTTPException(status_code=400, detail="Invalid time range")
    queued_count = await db.scalar(
        select(func.count())
        .select_from(GifRecord)
        .where(GifRecord.status.in_(["queued", "processing"]))
    )
    if queued_count >= MAX_QUEUED_JOBS:
        raise HTTPException(
            status_code=429,
            detail=f"Queue is full. Maximum {MAX_QUEUED_JOBS} pending jobs allowed.",
        )
    user_queued = await db.scalar(
        select(func.count())
        .select_from(GifRecord)
        .where(GifRecord.user_id == user.id, GifRecord.status.in_(["queued", "processing"]))
    )
    if user_queued >= MAX_QUEUED_JOBS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail=f"You have {user_queued} pending jobs. Maximum {MAX_QUEUED_JOBS_PER_USER} per user.",
        )
    server = get_plex_server()
    if not server:
        raise HTTPException(status_code=503, detail="Plex server not configured")
    try:
        media = get_media_detail(server, request.media_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if request.include_subtitles:
        if request.subtitle_index is None:
            raise HTTPException(
                status_code=400,
                detail="subtitle_index is required when include_subtitles is true",
            )
        valid_indices = {track.index for track in media.subtitle_tracks}
        if request.subtitle_index not in valid_indices:
            raise HTTPException(
                status_code=400,
                detail=f"subtitle_index {request.subtitle_index} not found. Available: {sorted(valid_indices)}",
            )
    gif_id = str(uuid.uuid4())
    record = GifRecord(
        id=gif_id,
        user_id=user.id,
        media_id=request.media_id,
        media_title=media.title,
        media_type=media.type,
        show_title=media.show_title,
        season=media.season,
        episode=media.episode,
        year=media.year,
        imdb_id=media.imdb_id,
        tvdb_id=media.tvdb_id,
        tmdb_id=media.tmdb_id,
        start_ms=request.start_ms,
        end_ms=request.end_ms,
        width=config.max_width,
        fps=config.max_fps,
        include_subtitles=1 if request.include_subtitles else 0,
        subtitle_index=request.subtitle_index,
        custom_text=request.custom_text,
        text_position=request.text_position,
        text_size=request.text_size,
        status="queued",
        progress=0,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record_to_gif(record)


@router.get("/{gif_id}", response_model=Gif)
async def get_gif(
    gif_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")
    # Users can only see their own GIFs, admins can see all
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=404, detail="GIF not found")
    return record_to_gif(record)


@router.get("/{gif_id}/progress")
async def gif_progress_stream(gif_id: str, request: Request, user=Depends(get_current_user)):
    async with async_session() as db:
        result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
        record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=404, detail="GIF not found")

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            async with async_session() as db:
                result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
                record = result.scalar_one_or_none()
            if not record:
                break
            data = json.dumps({
                "status": record.status,
                "progress": record.progress,
                "error": record.error,
                "filename": record.filename,
                "size_bytes": record.size_bytes,
            })
            yield {"data": data}
            if record.status in ("complete", "failed"):
                break
            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.get("", response_model=PaginatedResponse[Gif])
async def list_gifs(
    status: str = Query(default="complete"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    search: str = Query(default="", description="Search by media title, show title, or custom text"),
    sort: str = Query(default="newest", description="Sort order: newest, oldest, title, size"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Users see only their own GIFs
    query = select(GifRecord).where(GifRecord.user_id == user.id)
    count_query = select(func.count()).select_from(GifRecord).where(GifRecord.user_id == user.id)
    if status != "all":
        valid_statuses = ["queued", "processing", "complete", "failed"]
        if status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}, all",
            )
        query = query.where(GifRecord.status == status)
        count_query = count_query.where(GifRecord.status == status)
    # Search filter
    if search.strip():
        term = f"%{search.strip()}%"
        search_filter = (
            GifRecord.media_title.ilike(term)
            | GifRecord.show_title.ilike(term)
            | GifRecord.custom_text.ilike(term)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    total = await db.scalar(count_query)
    # Sort order
    if sort == "oldest":
        query = query.order_by(GifRecord.created_at.asc())
    elif sort == "title":
        query = query.order_by(GifRecord.media_title.asc(), GifRecord.created_at.desc())
    elif sort == "size":
        query = query.order_by(GifRecord.size_bytes.desc().nullslast(), GifRecord.created_at.desc())
    else:  # newest (default)
        query = query.order_by(GifRecord.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await db.execute(query)
    records = result.scalars().all()
    return PaginatedResponse(
        items=[record_to_gif(r) for r in records],
        page=page,
        page_size=page_size,
        total_items=total or 0,
    )


@router.delete("/{gif_id}", status_code=204)
async def delete_gif(
    gif_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")
    # Users can only delete their own GIFs, admins can delete any
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    if record.filename:
        output_path = OUTPUT_DIR / record.filename
        if output_path.exists():
            output_path.unlink()
    await db.execute(delete(GifRecord).where(GifRecord.id == gif_id))
    await db.commit()


@router.post("/{gif_id}/upload", response_model=GiphyUploadResponse)
async def upload_to_giphy(
    gif_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = load_config()
    if not config.giphy_global_enabled:
        raise HTTPException(status_code=403, detail="GIPHY integration has been disabled by the administrator")
    if not user.giphy_api_key:
        raise HTTPException(status_code=400, detail="Giphy API key not configured. Set it in Settings.")

    result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")

    # Users can only upload their own GIFs
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    if record.status != "complete" or not record.filename:
        raise HTTPException(status_code=400, detail="GIF is not complete")

    if record.giphy_id:
        raise HTTPException(
            status_code=400,
            detail=f"Already uploaded to Giphy: {record.giphy_url}",
        )

    tags = [record.media_title]
    if record.show_title:
        tags.append(record.show_title)

    try:
        giphy_id, giphy_url = await upload_gif_to_giphy(
            filename=record.filename,
            api_key=user.giphy_api_key,
            tags=tags,
        )
    except GiphyError as e:
        raise HTTPException(status_code=500, detail=str(e))

    record.giphy_id = giphy_id
    record.giphy_url = giphy_url
    record.uploaded_at = datetime.utcnow()
    await db.commit()

    return GiphyUploadResponse(giphy_id=giphy_id, giphy_url=giphy_url)


@router.post("/{gif_id}/share", response_model=ShareResponse)
async def share_gif(
    gif_id: str,
    request: Request,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = load_config()
    if not config.public_sharing_enabled:
        raise HTTPException(status_code=403, detail="Public sharing has been disabled by the administrator")

    result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    if record.status != "complete" or not record.filename:
        raise HTTPException(status_code=400, detail="GIF is not complete")

    if not record.public_token:
        record.public_token = secrets.token_urlsafe(16)
        await db.commit()

    # Use Origin header to get the actual browser URL (not the proxied backend URL)
    origin = request.headers.get("origin")
    if not origin:
        origin = str(request.base_url).rstrip("/")
    return ShareResponse(
        public_token=record.public_token,
        public_url=f"{origin}/s/{record.public_token}",
    )


@router.delete("/{gif_id}/share", status_code=204)
async def unshare_gif(
    gif_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GifRecord).where(GifRecord.id == gif_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="GIF not found")
    if record.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    record.public_token = None
    await db.commit()
