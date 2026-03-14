from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from app.database import init_db, async_session
from app.routers import setup, search, media, gifs, auth, admin, favorites
from app.routers.shared import router as shared_router
from app.services.worker import worker
from app.services.cache import janitor
from app.services.scheduler import scheduler, register_task
from app.services.library_cache import library_cache
from app.services.auth import get_user_by_session_token, maybe_rotate_session, cleanup_expired_sessions
from app.config import OUTPUT_DIR, PREVIEWS_CACHE_DIR

STATIC_DIR = Path(__file__).parent.parent / "static"


async def _session_cleanup_action() -> None:
    async with async_session() as db:
        await cleanup_expired_sessions(db)


register_task("library_cache_refresh", library_cache.refresh)
register_task("cache_cleanup", janitor._cleanup)
register_task("session_cleanup", _session_cleanup_action)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await worker.start()
    await scheduler.start()
    yield
    await worker.stop()
    await scheduler.stop()


app = FastAPI(title="Clipmark", lifespan=lifespan)

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

    response = await call_next(request)
    if new_token:
        response.set_cookie(
            key="clipmark_session",
            value=new_token,
            httponly=True,
            samesite="strict",
            max_age=30 * 24 * 3600,
        )
    return response


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(setup.router)
app.include_router(search.router)
app.include_router(media.router)
app.include_router(gifs.router)
app.include_router(admin.router)
app.include_router(favorites.router)
app.include_router(shared_router)

app.mount("/output/previews", StaticFiles(directory=str(PREVIEWS_CACHE_DIR)), name="previews")
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
