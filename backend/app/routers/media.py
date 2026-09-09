import asyncio
from fastapi import APIRouter, HTTPException, Query, Response, Depends
from pathlib import Path
import tempfile
from app.services.plex import (
    get_libraries,
    get_library_items,
    get_show_detail,
    get_show_seasons,
    get_show_episodes,
    get_media_detail,
    get_thumbnail_url,
    get_subtitle_stream_url,
    get_media_stream_url,
)
from app.services.subtitles import download_subtitle, parse_subtitle_content, extract_embedded_subtitle
from app.services.gif import generate_frame, generate_preview
from app.services.cache import get_frame_cache_path, get_preview_cache_path, get_thumbnail_cache_path, get_subtitle_cache_path, get_media_detail_cache_path
from app.models.schemas import (
    Library,
    MediaItem,
    MediaDetail,
    ShowDetail,
    Season,
    SubtitleLine,
    PaginatedResponse,
    PreviewRequest,
    PreviewResponse,
)
from app.config import MAX_PREVIEW_DURATION_SECONDS
from app.dependencies import get_current_plex_server, require_media_access
import httpx
import json

router = APIRouter(prefix="/api", tags=["media"])


@router.get("/libraries", response_model=list[Library])
async def list_libraries(server=Depends(get_current_plex_server)):
    return await asyncio.to_thread(get_libraries, server)


@router.get("/libraries/{library_id}/items", response_model=PaginatedResponse[MediaItem])
async def list_library_items(
    library_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    sort: str = Query(default="added", pattern="^(added|alpha|year)$"),
    server=Depends(get_current_plex_server),
):
    try:
        items, total = await asyncio.to_thread(get_library_items, server, library_id, page, page_size, sort)
    except ValueError:
        raise HTTPException(status_code=404, detail="Library not found")
    return PaginatedResponse(items=items, page=page, page_size=page_size, total_items=total)


@router.get("/shows/{show_id}", response_model=ShowDetail)
async def get_show(show_id: str, server=Depends(get_current_plex_server)):
    try:
        result = await asyncio.to_thread(get_show_detail, server, show_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/shows/{show_id}/seasons", response_model=list[Season])
async def list_seasons(show_id: str, server=Depends(get_current_plex_server)):
    try:
        result = await asyncio.to_thread(get_show_seasons, server, show_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/shows/{show_id}/episodes", response_model=PaginatedResponse[MediaItem])
async def list_episodes(
    show_id: str,
    season: int = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    server=Depends(get_current_plex_server),
):
    try:
        items, total = await asyncio.to_thread(get_show_episodes, server, show_id, season, page, page_size)
        return PaginatedResponse(
            items=items,
            page=page,
            page_size=page_size,
            total_items=total,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/media/{media_id}", response_model=MediaDetail)
async def get_media(media_id: str, server=Depends(require_media_access)):
    cache_path = get_media_detail_cache_path(media_id, server_id=server.machineIdentifier)
    if cache_path.exists():
        return MediaDetail(**json.loads(cache_path.read_text()))

    try:
        result = get_media_detail(server, media_id)
        cache_path.write_text(result.model_dump_json())
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/media/{media_id}/subtitles/{index}", response_model=list[SubtitleLine])
async def get_subtitles(media_id: str, index: int, server=Depends(require_media_access)):
    cache_path = get_subtitle_cache_path(media_id, index, server_id=server.machineIdentifier)
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    try:
        media = get_media_detail(server, media_id)
        track = next((t for t in media.subtitle_tracks if t.index == index), None)
        if not track:
            raise HTTPException(status_code=404, detail="Subtitle track not found")

        content = None

        sub_url = get_subtitle_stream_url(server, media_id, index)
        if sub_url:
            content = await download_subtitle(sub_url)

        if not content:
            media_url = get_media_stream_url(server, media_id)
            if media_url:
                subtitle_stream_index = 0
                item = server.fetchItem(int(media_id))
                if hasattr(item, "media") and item.media:
                    for m in item.media:
                        for part in m.parts:
                            sub_idx = 0
                            for stream in part.streams:
                                if stream.streamType == 3:
                                    if stream.index == index:
                                        subtitle_stream_index = sub_idx
                                        break
                                    sub_idx += 1

                with tempfile.TemporaryDirectory() as work_dir:
                    content = await extract_embedded_subtitle(
                        media_url, subtitle_stream_index, Path(work_dir)
                    )

        if not content:
            return []

        result = parse_subtitle_content(content, track.format)
        cache_path.write_text(json.dumps([line.model_dump() for line in result]))
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/media/{media_id}/thumbnail")
async def get_thumbnail(media_id: str, server=Depends(require_media_access)):
    # Check disk cache first
    cache_path = get_thumbnail_cache_path(media_id, server_id=server.machineIdentifier)
    if cache_path.exists():
        return Response(
            content=cache_path.read_bytes(),
            media_type="image/jpeg",
            headers={"Cache-Control": "private, no-store"},
        )
    thumb_url = get_thumbnail_url(server, media_id)
    if not thumb_url:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    async with httpx.AsyncClient() as client:
        response = await client.get(thumb_url, follow_redirects=True, timeout=30.0)
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Failed to fetch thumbnail")
        # Cache to disk
        cache_path.write_bytes(response.content)
        return Response(
            content=response.content,
            media_type=response.headers.get("content-type", "image/jpeg"),
            headers={"Cache-Control": "private, no-store"},
        )


@router.get("/media/{media_id}/frame")
async def get_frame(
    media_id: str,
    ts: int = Query(..., description="Timestamp in milliseconds"),
    width: int = Query(default=320, ge=100, le=720),
    server=Depends(require_media_access),
):
    cache_path = get_frame_cache_path(media_id, ts, width, server_id=server.machineIdentifier)
    if cache_path.exists():
        return Response(
            content=cache_path.read_bytes(),
            media_type="image/jpeg",
        )
    frame_data = await generate_frame(server, media_id, ts, width)
    if not frame_data:
        raise HTTPException(status_code=500, detail="Failed to generate frame")
    cache_path.write_bytes(frame_data)
    return Response(content=frame_data, media_type="image/jpeg")


@router.post("/media/{media_id}/preview", response_model=PreviewResponse)
async def create_preview_endpoint(media_id: str, request: PreviewRequest, server=Depends(require_media_access)):
    duration_ms = request.end_ms - request.start_ms
    max_duration_ms = MAX_PREVIEW_DURATION_SECONDS * 1000
    if duration_ms > max_duration_ms:
        raise HTTPException(
            status_code=400,
            detail=f"Preview duration exceeds maximum of {MAX_PREVIEW_DURATION_SECONDS} seconds",
        )
    if duration_ms <= 0:
        raise HTTPException(status_code=400, detail="Invalid time range")
    cache_path = get_preview_cache_path(
        media_id,
        request.start_ms,
        request.end_ms,
        request.subtitle_index,
        request.custom_text,
        request.text_position,
        request.text_size,
        server_id=server.machineIdentifier,
    )
    if not cache_path.exists():
        success = await generate_preview(
            server,
            media_id,
            request.start_ms,
            request.end_ms,
            cache_path,
            request.subtitle_index,
            request.custom_text,
            request.text_position,
            request.text_size,
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to generate preview")
    return PreviewResponse(url=f"/output/previews/{cache_path.name}")
