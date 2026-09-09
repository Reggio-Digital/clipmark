from fastapi import APIRouter, HTTPException, Query, Depends
import asyncio

from app.services.plex import search_media
from app.models.schemas import SearchResult
from app.dependencies import get_current_plex_server

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=list[SearchResult])
async def search(
    query: str = Query(..., min_length=2),
    library_id: str | None = None,
    type: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    server=Depends(get_current_plex_server),
):
    if type and type not in ("movie", "show"):
        raise HTTPException(status_code=400, detail="Type must be 'movie' or 'show'")
    try:
        return await asyncio.to_thread(search_media, server, query, library_id, type, limit)
    except ValueError:
        raise HTTPException(status_code=404, detail="Library not found")
