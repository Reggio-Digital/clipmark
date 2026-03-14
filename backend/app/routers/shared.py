from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from app.database import async_session
from app.models.db import GifRecord
from app.models.schemas import PublicGif
from app.services.plex import load_config
from app.config import OUTPUT_DIR

router = APIRouter(prefix="/api/shared", tags=["shared"])


@router.get("/{token}", response_model=PublicGif)
async def get_shared_gif(token: str):
    config = load_config()
    if not config.public_sharing_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    async with async_session() as db:
        result = await db.execute(
            select(GifRecord).where(
                GifRecord.public_token == token,
                GifRecord.status == "complete",
            )
        )
        record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    return PublicGif(
        media_title=record.media_title,
        show_title=record.show_title,
        season=record.season,
        episode=record.episode,
        year=record.year,
        imdb_id=record.imdb_id,
        tvdb_id=record.tvdb_id,
        tmdb_id=record.tmdb_id,
        filename=record.filename,
        size_bytes=record.size_bytes,
        start_ms=record.start_ms,
        end_ms=record.end_ms,
        created_at=record.created_at,
    )


@router.get("/{token}/file")
async def get_shared_gif_file(token: str):
    config = load_config()
    if not config.public_sharing_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    async with async_session() as db:
        result = await db.execute(
            select(GifRecord).where(
                GifRecord.public_token == token,
                GifRecord.status == "complete",
            )
        )
        record = result.scalar_one_or_none()
    if not record or not record.filename:
        raise HTTPException(status_code=404, detail="Not found")
    file_path = OUTPUT_DIR / record.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path, media_type="image/gif")
