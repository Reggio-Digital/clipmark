import asyncio
import logging
import shutil
from datetime import datetime

from app.config import CACHE_DIR, CACHE_SUBDIRS, THUMBNAILS_CACHE_DIR
from app.models.schemas import Library, MediaItem
from app.services.plex import get_plex_server, get_libraries, get_library_items

logger = logging.getLogger(__name__)


class LibraryCache:
    def __init__(self) -> None:
        self._libraries: list[Library] = []
        self._library_items: dict[str, tuple[list[MediaItem], int]] = {}
        self._last_refreshed: datetime | None = None
        self._lock = asyncio.Lock()
        self._refresh_status: str | None = None

    @property
    def is_populated(self) -> bool:
        return self._last_refreshed is not None

    def get_libraries(self) -> list[Library] | None:
        """Return cached libraries, or None if cache is empty."""
        if not self.is_populated:
            return None
        return self._libraries

    def get_library_items(
        self, library_id: str, page: int, page_size: int, sort: str = "added"
    ) -> tuple[list[MediaItem], int] | None:
        """Return cached items for a library with pagination and sorting, or None if not cached."""
        if library_id not in self._library_items:
            return None
        all_items, total = self._library_items[library_id]
        if sort == "alpha":
            all_items = sorted(all_items, key=lambda x: x.title.lower())
        elif sort == "year":
            all_items = sorted(all_items, key=lambda x: x.year or 0, reverse=True)
        else:  # "added" (default) — newest first
            all_items = sorted(all_items, key=lambda x: x.added_at or "", reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return all_items[start:end], total

    async def refresh(self) -> None:
        """Full refresh of all library data from Plex."""
        server = get_plex_server()
        if not server:
            logger.warning("Cannot refresh library cache: Plex server not configured")
            return

        async with self._lock:
            self._refresh_status = "Discovering libraries..."
            # Fetch libraries (sync plexapi call, run in thread)
            libraries = await asyncio.to_thread(get_libraries, server)

            # Fetch all items for each library
            items_cache: dict[str, tuple[list[MediaItem], int]] = {}
            for i, lib in enumerate(libraries, 1):
                self._refresh_status = f"Scanning {lib.title} ({i}/{len(libraries)})..."
                try:
                    items, total = await asyncio.to_thread(
                        get_library_items, server, lib.id, 1, 100000
                    )
                    items_cache[lib.id] = (items, total)
                except Exception:
                    logger.exception("Failed to cache library %s", lib.id)

            # Atomic swap
            self._libraries = libraries
            self._library_items = items_cache
            self._last_refreshed = datetime.utcnow()
            self._refresh_status = None
            logger.info(
                "Library cache refreshed: %d libraries, %d total items",
                len(libraries),
                sum(t for _, t in items_cache.values()),
            )

    @staticmethod
    def _dir_size_bytes(path) -> int:
        """Sum file sizes in a directory (non-recursive)."""
        if not path.exists():
            return 0
        return sum(f.stat().st_size for f in path.iterdir() if f.is_file())

    def get_stats(self) -> dict:
        """Return cache statistics."""
        libraries = []
        for lib in self._libraries:
            items_data = self._library_items.get(lib.id)
            libraries.append({
                "id": lib.id,
                "title": lib.title,
                "type": lib.type,
                "item_count": items_data[1] if items_data else 0,
            })
        # Calculate disk usage across all cache subdirectories
        disk_usage_bytes = sum(
            self._dir_size_bytes(CACHE_DIR / sub)
            for sub in CACHE_SUBDIRS
        )
        return {
            "populated": self.is_populated,
            "library_count": len(self._libraries),
            "total_items": sum(t for _, t in self._library_items.values()),
            "last_refreshed": self._last_refreshed.isoformat() if self._last_refreshed else None,
            "refresh_status": self._refresh_status,
            "disk_usage_bytes": disk_usage_bytes,
            "libraries": libraries,
        }

    def clear(self) -> None:
        """Clear the cache (e.g., on server disconnect)."""
        self._libraries = []
        self._library_items = {}
        self._last_refreshed = None
        self.clear_disk_cache()

    @staticmethod
    def clear_disk_cache() -> None:
        """Clear all cached files on disk (thumbnails, frames, previews)."""
        for sub in CACHE_SUBDIRS:
            sub_dir = CACHE_DIR / sub
            if sub_dir.exists():
                shutil.rmtree(sub_dir)
                sub_dir.mkdir(parents=True, exist_ok=True)


library_cache = LibraryCache()
