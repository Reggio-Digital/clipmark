import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
import httpx
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from sqlalchemy import select, text
from plexapi.exceptions import PlexApiException, Unauthorized, NotFound
from requests.exceptions import RequestException
from app.dependencies import get_current_user, get_current_plex_server, require_media_access
from app.database import init_db, async_session
from app.routers import setup, search, media, gifs, auth, admin, favorites
from app.routers.shared import router as shared_router
from app.services.worker import worker
from app.services.cache import janitor, get_server_cache_key
from app.services.scheduler import scheduler, register_task
from app.services.auth import get_user_by_session_token, maybe_rotate_session, cleanup_expired_sessions
from app.services.plex import get_plex_server, load_config
from app.routers.auth import _is_https
from app.models.db import GifRecord
from app.config import OUTPUT_DIR, PREVIEWS_CACHE_DIR, VERSION

STATIC_DIR = Path(__file__).parent.parent / "static"


async def _session_cleanup_action() -> None:
    async with async_session() as db:
        await cleanup_expired_sessions(db)


register_task("cache_cleanup", janitor._cleanup)
register_task("session_cleanup", _session_cleanup_action)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await janitor.cleanup_legacy_files()
    await worker.start()
    await scheduler.start()
    yield
    await worker.stop()
    await scheduler.stop()


app = FastAPI(title="Clipmark", lifespan=lifespan)


@app.exception_handler(PlexApiException)
@app.exception_handler(RequestException)
async def plex_error_handler(request: Request, exc: Exception):
    if isinstance(exc, Unauthorized):
        return JSONResponse(status_code=403, content={"detail": "Plex access denied. Sign in to Plex again."})
    if isinstance(exc, NotFound):
        return JSONResponse(status_code=404, content={"detail": "Plex library or media not found"})
    return JSONResponse(status_code=503, content={"detail": "Plex is unavailable. Please try again shortly."})


PUBLIC_PATHS = {
    "/api/auth/status",
    "/api/auth/plex/initiate",
    "/api/auth/plex/check",
    "/api/auth/plex/login",
    "/api/auth/setup/select-server",
    "/api/auth/logout",
    "/api/setup/status",
    "/api/health",
}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    is_api = path.startswith("/api/")
    is_output = path.startswith("/output/")
    is_public_share = path.startswith("/api/shared/")

    if not is_api and not is_output:
        return await call_next(request)

    if is_public_share:
        return await call_next(request)

    if is_api and path in PUBLIC_PATHS:
        return await call_next(request)

    session_token = request.cookies.get("clipmark_session")
    if not session_token:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    async with async_session() as db:
        user = await get_user_by_session_token(db, session_token)
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        new_token = await maybe_rotate_session(db, session_token)

    secure = _is_https(request)
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    if new_token:
        response.set_cookie(
            key="clipmark_session",
            value=new_token,
            httponly=True,
            secure=secure,
            samesite="strict",
            max_age=30 * 24 * 3600,
        )
    return response


_plex_status_cache: dict = {"status": None, "expires_at": 0.0}
_PLEX_STATUS_TTL_SECONDS = 30

_update_check_cache: dict = {
    "latest": None,
    "latest_published_at": None,
    "current_published_at": None,
    "expires_at": 0.0,
}
_UPDATE_CHECK_TTL_SECONDS = 6 * 3600
_GITHUB_REPO = "Reggio-Digital/clipmark"
_GITHUB_LATEST_RELEASE_URL = f"https://api.github.com/repos/{_GITHUB_REPO}/releases/latest"
_GITHUB_TAG_RELEASE_URL = f"https://api.github.com/repos/{_GITHUB_REPO}/releases/tags/v{{tag}}"


def _parse_version(value: str) -> tuple[int, ...] | None:
    try:
        cleaned = value.strip().lstrip("vV").split("-")[0].split("+")[0]
        return tuple(int(p) for p in cleaned.split("."))
    except (ValueError, AttributeError):
        return None


async def _check_release_info() -> tuple[str | None, str | None, str | None]:
    """Return (latest_version, latest_published_at, current_published_at) from GitHub, cached."""
    now = time.monotonic()
    if now < _update_check_cache["expires_at"]:
        return (
            _update_check_cache["latest"],
            _update_check_cache["latest_published_at"],
            _update_check_cache["current_published_at"],
        )
    latest: str | None = None
    latest_published_at: str | None = None
    current_published_at: str | None = None
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "clipmark"}
    try:
        async with httpx.AsyncClient(timeout=2.0, headers=headers) as client:
            latest_resp, current_resp = await asyncio.gather(
                client.get(_GITHUB_LATEST_RELEASE_URL),
                client.get(_GITHUB_TAG_RELEASE_URL.format(tag=VERSION)),
                return_exceptions=True,
            )
            if isinstance(latest_resp, httpx.Response) and latest_resp.status_code == 200:
                data = latest_resp.json()
                tag = data.get("tag_name")
                if tag:
                    latest = tag.lstrip("vV")
                latest_published_at = data.get("published_at")
            if isinstance(current_resp, httpx.Response) and current_resp.status_code == 200:
                current_published_at = current_resp.json().get("published_at")
    except Exception:
        pass
    if latest and latest == VERSION and latest_published_at and not current_published_at:
        current_published_at = latest_published_at
    _update_check_cache["latest"] = latest
    _update_check_cache["latest_published_at"] = latest_published_at
    _update_check_cache["current_published_at"] = current_published_at
    _update_check_cache["expires_at"] = now + _UPDATE_CHECK_TTL_SECONDS
    return latest, latest_published_at, current_published_at


async def _check_plex_status() -> str:
    now = time.monotonic()
    if _plex_status_cache["status"] and now < _plex_status_cache["expires_at"]:
        return _plex_status_cache["status"]

    config = load_config()
    if not config.plex_token or not config.server_url:
        status = "disconnected"
    else:
        try:
            def _probe() -> str:
                server = get_plex_server()
                if server is None:
                    return "disconnected"
                _ = server.machineIdentifier
                return "connected"
            status = await asyncio.wait_for(asyncio.to_thread(_probe), timeout=3.0)
        except Exception:
            status = "error"

    _plex_status_cache["status"] = status
    _plex_status_cache["expires_at"] = now + _PLEX_STATUS_TTL_SECONDS
    return status


@app.get("/api/health")
async def health_check():
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        database_status = "ok"
    except Exception:
        database_status = "error"

    plex_status = await _check_plex_status()
    latest_version, latest_version_published_at, version_published_at = await _check_release_info()
    update_available = False
    if latest_version:
        current = _parse_version(VERSION)
        latest = _parse_version(latest_version)
        if current and latest:
            update_available = latest > current

    return {
        "status": "ok",
        "version": VERSION,
        "version_published_at": version_published_at,
        "database": database_status,
        "plex": plex_status,
        "latest_version": latest_version,
        "latest_version_published_at": latest_version_published_at,
        "update_available": update_available,
    }


app.include_router(auth.router)
app.include_router(setup.router)
app.include_router(search.router)
app.include_router(media.router)
app.include_router(gifs.router)
app.include_router(admin.router)
app.include_router(favorites.router)
app.include_router(shared_router)


@app.api_route("/output/previews/{filename}", methods=["GET", "HEAD"])
async def preview_file(filename: str, server=Depends(get_current_plex_server)):
    parts = filename.split("_", 2)
    if len(parts) != 3 or parts[0] != get_server_cache_key(server.machineIdentifier) or not filename.endswith(".mp4"):
        raise HTTPException(status_code=404, detail="Preview not found")
    media_id = parts[1]
    await require_media_access(media_id, server)
    path = PREVIEWS_CACHE_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(path, media_type="video/mp4")


@app.api_route("/output/{filename:path}", methods=["GET", "HEAD"])
async def gif_file(filename: str, user=Depends(get_current_user)):
    async with async_session() as db:
        result = await db.execute(select(GifRecord).where(
            GifRecord.filename == filename,
            GifRecord.status == "complete",
        ))
        record = result.scalar_one_or_none()
    if not record or (record.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="GIF not found")
    path = (OUTPUT_DIR / filename).resolve()
    if not path.is_relative_to(OUTPUT_DIR.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="GIF not found")
    return FileResponse(path, media_type="image/gif")


@app.get("/s/{token}")
async def shared_gif_page(token: str, request: Request):
    """Serve HTML with Open Graph meta tags for shared GIF link previews."""
    from html import escape
    from app.services.plex import load_config

    config = load_config()
    if not config.public_sharing_enabled:
        if STATIC_DIR.exists():
            return FileResponse(STATIC_DIR / "index.html")
        return HTMLResponse("<html><body>Not found</body></html>", status_code=404)

    async with async_session() as db:
        result = await db.execute(
            select(GifRecord).where(
                GifRecord.public_token == token,
                GifRecord.status == "complete",
            )
        )
        record = result.scalar_one_or_none()

    if not record:
        if STATIC_DIR.exists():
            return FileResponse(STATIC_DIR / "index.html")
        return HTMLResponse("<html><body>Not found</body></html>", status_code=404)

    # Build title
    title = escape(record.media_title)
    if record.show_title:
        ep = ""
        if record.season is not None and record.episode is not None:
            ep = f" S{record.season:02d}E{record.episode:02d}"
        title = f"{escape(record.show_title)}{ep} — {title}"

    # Build absolute URL for the GIF image
    base_url = str(request.base_url).rstrip("/")
    image_url = f"{base_url}/api/shared/{token}/file"
    page_url = f"{base_url}/s/{token}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} — Clipmark</title>

    <!-- Open Graph -->
    <meta property="og:type" content="image" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="GIF created with Clipmark" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:type" content="image/gif" />
    <meta property="og:url" content="{page_url}" />

    <!-- Twitter/Discord -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:image" content="{image_url}" />
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
</body>
</html>"""

    # In production, the SPA assets are in /assets, not /src
    if STATIC_DIR.exists():
        index_html = (STATIC_DIR / "index.html").read_text()
        # Inject OG tags into the production index.html <head>
        og_tags = f"""
    <!-- Open Graph -->
    <meta property="og:type" content="image" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="GIF created with Clipmark" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:type" content="image/gif" />
    <meta property="og:url" content="{page_url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:image" content="{image_url}" />"""
        html = index_html.replace("</head>", f"{og_tags}\n</head>", 1)

    return HTMLResponse(html)


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
