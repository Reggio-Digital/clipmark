import asyncio
import shutil
import time
from collections import OrderedDict

from plexapi.exceptions import Unauthorized
from plexapi.server import PlexServer

from app.config import CACHE_DIR, CACHE_SUBDIRS
from app.services.plex import get_user_plex_server, load_config

SERVER_CACHE_TTL_SECONDS = 30
SERVER_CACHE_MAX_SIZE = 128


class LibraryCache:
    def __init__(self) -> None:
        self._servers: OrderedDict[tuple[str, str, str], tuple[PlexServer, float]] = OrderedDict()
        self._pending: dict[tuple[str, str, str], asyncio.Task] = {}

    async def get_server(self, token: str | None, server_id: str | None) -> PlexServer | None:
        config = load_config()
        if not token or not server_id:
            raise Unauthorized("Sign in to Plex again for the configured server")
        if not config.server_url or not config.server_machine_id:
            return None
        if server_id != config.server_machine_id:
            raise Unauthorized("Sign in to Plex again for the configured server")
        key = (config.server_url, server_id, token)
        now = time.monotonic()
        for expired_key, (_, expires_at) in list(self._servers.items()):
            if now >= expires_at:
                self._servers.pop(expired_key)
        if key in self._servers:
            self._servers.move_to_end(key)
            return self._servers[key][0]
        if key not in self._pending:
            self._pending[key] = asyncio.create_task(self._connect(key))
        return await asyncio.shield(self._pending[key])

    async def _connect(self, key: tuple[str, str, str]) -> PlexServer | None:
        try:
            server = await asyncio.to_thread(get_user_plex_server, key[2], key[1])
            # A disconnect/clear during the network call must not repopulate the cache.
            if server and self._pending.get(key) is asyncio.current_task():
                self._servers[key] = (server, time.monotonic() + SERVER_CACHE_TTL_SECONDS)
                while len(self._servers) > SERVER_CACHE_MAX_SIZE:
                    self._servers.popitem(last=False)
            return server
        finally:
            if self._pending.get(key) is asyncio.current_task():
                self._pending.pop(key)

    @staticmethod
    def _dir_size_bytes(path) -> int:
        if not path.exists():
            return 0
        return sum(f.stat().st_size for f in path.iterdir() if f.is_file())

    def get_stats(self) -> dict:
        # Keep the admin response contract without retaining an owner's library inventory.
        return {
            "populated": False,
            "library_count": 0,
            "total_items": 0,
            "last_refreshed": None,
            "refresh_status": None,
            "disk_usage_bytes": sum(self._dir_size_bytes(CACHE_DIR / sub) for sub in CACHE_SUBDIRS),
            "libraries": [],
        }

    def clear(self) -> None:
        self._servers.clear()
        self._pending.clear()
        self.clear_disk_cache()

    @staticmethod
    def clear_disk_cache() -> None:
        """Clear all cached files on disk (thumbnails, frames, previews, subtitles)."""
        for sub in CACHE_SUBDIRS:
            sub_dir = CACHE_DIR / sub
            if sub_dir.exists():
                shutil.rmtree(sub_dir)
                sub_dir.mkdir(parents=True, exist_ok=True)


library_cache = LibraryCache()
