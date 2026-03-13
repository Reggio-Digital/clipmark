from fastapi import APIRouter, HTTPException, Query, Depends
from app.services.plex import get_plex_server, search_media
from app.models.schemas import SearchResult
from app.dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=list[SearchResult])
async def search(
    query: str = Query(..., min_length=2),
    library_id: str | None = None,
    type: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    _user=Depends(get_current_user),
):
    server = get_plex_server()
    if not server:
        raise HTTPException(status_code=503, detail="Plex server not configured")
    if type and type not in ("movie", "show"):
        raise HTTPException(status_code=400, detail="Type must be 'movie' or 'show'")
    return search_media(server, query, library_id, type, limit)
