import asyncio
import time
from pathlib import Path
from app.config import (
    FRAMES_CACHE_DIR,
    PREVIEWS_CACHE_DIR,
    THUMBNAILS_CACHE_DIR,
    WORK_DIR,
    FRAME_CACHE_TTL_MINUTES,
    PREVIEW_CACHE_TTL_MINUTES,
    FAILED_WORKSPACE_TTL_HOURS,
)


class CacheJanitor:
    def __init__(self):
        self.running = False

    async def start(self):
        self.running = True
        asyncio.create_task(self._cleanup_loop())

    async def stop(self):
        self.running = False

    async def _cleanup_loop(self):
        while self.running:
            await self._cleanup()
            await asyncio.sleep(300)  # Run every 5 minutes

    async def _cleanup(self):
        now = time.time()
        await self._cleanup_directory(
            FRAMES_CACHE_DIR,
            FRAME_CACHE_TTL_MINUTES * 60,
            now,
        )
        await self._cleanup_directory(
            PREVIEWS_CACHE_DIR,
            PREVIEW_CACHE_TTL_MINUTES * 60,
            now,
        )
        await self._cleanup_workspaces(now)

    async def _cleanup_directory(self, directory: Path, ttl_seconds: float, now: float):
        if not directory.exists():
            return
        for file_path in directory.iterdir():
            if file_path.is_file():
                age = now - file_path.stat().st_mtime
                if age > ttl_seconds:
                    try:
                        file_path.unlink()
                    except Exception:
                        pass

    async def _cleanup_workspaces(self, now: float):
        if not WORK_DIR.exists():
            return
        ttl_seconds = FAILED_WORKSPACE_TTL_HOURS * 3600
        for workspace in WORK_DIR.iterdir():
            if workspace.is_dir():
                age = now - workspace.stat().st_mtime
                if age > ttl_seconds:
                    try:
                        import shutil
                        shutil.rmtree(workspace)
                    except Exception:
                        pass


def get_frame_cache_path(media_id: str, ts_ms: int, width: int) -> Path:
    return FRAMES_CACHE_DIR / f"{media_id}_{ts_ms}_{width}.jpg"


def get_preview_cache_path(
    media_id: str,
    start_ms: int,
    end_ms: int,
    subtitle_index: int | None = None,
    custom_text: str | None = None,
    text_position: str | None = None,
    text_size: str | None = None,
) -> Path:
    # Include text options in cache key
    text_key = ""
    if subtitle_index is not None:
        text_key = f"_sub{subtitle_index}"
    elif custom_text:
        import hashlib
        text_hash = hashlib.md5(custom_text.encode()).hexdigest()[:8]
        text_key = f"_txt{text_hash}"
    # Add position and size to key if not default
    if text_position and text_position != "bottom":
        text_key += f"_pos{text_position}"
    if text_size and text_size != "medium":
        text_key += f"_sz{text_size}"
    return PREVIEWS_CACHE_DIR / f"{media_id}_{start_ms}_{end_ms}{text_key}.mp4"


def get_thumbnail_cache_path(media_id: str) -> Path:
    return THUMBNAILS_CACHE_DIR / f"{media_id}.jpg"


janitor = CacheJanitor()
