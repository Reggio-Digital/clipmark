import asyncio
from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app import database
from app.database import async_session
from app.models.db import ScheduledTask, User
from app.routers.auth import store_pending_token
from app.services import cache, plex
from app.services.library_cache import LibraryCache, library_cache
from app.services.scheduler import scheduler, _task_registry


async def test_browse_connections_avoid_plex_tv_and_repeated_handshakes(client, make_user, plex_api):
    _, token = await make_user(plex_token="server-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    media_ids = [str(100 + i) for i in range(48)]
    for media_id in media_ids:
        plex_api["movies"][media_id] = ("1", f"Movie {media_id}", "2024", "1000")
        plex_api["items"][media_id] = f'<Video type="movie" ratingKey="{media_id}" key="/library/metadata/{media_id}" librarySectionID="1" title="Movie {media_id}"/>'
        cache.get_thumbnail_cache_path(media_id, server_id="server-1").write_bytes(b"thumbnail")
    responses = await asyncio.gather(*[
        client.get(f"/api/media/{media_id}/thumbnail", headers=headers) for media_id in media_ids
    ])
    assert all(response.status_code == 200 for response in responses)
    assert len(plex_api["calls"]) == 49
    assert sum(path == "/" for _, path, _ in plex_api["calls"]) == 1
    assert all(host == "plex.test" and token == "server-guest" for host, _, token in plex_api["calls"])
    plex_api["calls"].clear()
    assert (await client.get("/api/libraries", headers=headers)).status_code == 200
    assert len(plex_api["calls"]) == 2
    plex_api["calls"].clear()
    assert (await client.get("/api/libraries", headers=headers)).status_code == 200
    assert plex_api["calls"] == []
    cache.get_thumbnail_cache_path("10", server_id="server-1").write_bytes(b"thumbnail")
    assert (await client.get("/api/media/10/thumbnail", headers=headers)).status_code == 200
    assert plex_api["calls"] == [("plex.test", "/library/metadata/10", "server-guest")]
    preview = cache.get_preview_cache_path("10", 0, 2000, server_id="server-1")
    preview.write_bytes(b"preview bytes")
    plex_api["calls"].clear()
    for _ in range(3):
        response = await client.get(f"/output/previews/{preview.name}", headers={**headers, "Range": "bytes=0-6"})
        assert response.status_code == 206
        assert response.content == b"preview"
    assert plex_api["calls"] == [("plex.test", "/library/metadata/10", "server-guest")] * 3
    print("48 concurrent disk-warm thumbnails: 49 server calls, 0 plex.tv calls; warm library list: 0 calls; warm thumbnail/Range: 1 live access call each")


async def test_connection_expiry_refreshes_libraries_and_fails_closed(client, make_user, plex_api, monkeypatch):
    import app.services.library_cache as cache_module
    clock = [0.0]
    monkeypatch.setattr(cache_module, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    _, token = await make_user(plex_token="server-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    assert [lib["id"] for lib in (await client.get("/api/libraries", headers=headers)).json()] == ["1", "3"]
    plex_api["libraries"]["guest"].remove("1")
    clock[0] = 30.0
    assert [lib["id"] for lib in (await client.get("/api/libraries", headers=headers)).json()] == ["3"]
    clock[0] = 60.0
    plex_api["offline"] = True
    response = await client.get("/api/libraries", headers=headers)
    assert response.status_code == 503
    assert "private upstream" not in response.text
    plex_api["offline"] = False
    assert (await client.get("/api/libraries", headers=headers)).status_code == 200


async def test_stored_token_server_binding_and_rotation(client, make_user, plex_api):
    user, token = await make_user(plex_token="server-owner")
    headers = {"Cookie": f"clipmark_session={token}"}
    assert "Home Videos" in (await client.get("/api/libraries", headers=headers)).text
    async with async_session() as db:
        stored_user = await db.get(User, user.id)
        stored_user.plex_token = "server-guest"
        await db.commit()
    assert "Home Videos" not in (await client.get("/api/libraries", headers=headers)).text
    config = plex.load_config()
    config.server_machine_id = "server-2"
    plex.save_config(config)
    plex_api["calls"].clear()
    assert (await client.get("/api/libraries", headers=headers)).status_code == 403
    assert plex_api["calls"] == []


async def test_promoted_admin_cannot_read_owner_library_inventory(client, make_user, plex_api):
    _, owner_token = await make_user(role="admin", plex_token="server-owner")
    guest, guest_token = await make_user(plex_token="server-guest")
    owner_headers = {"Cookie": f"clipmark_session={owner_token}"}
    guest_headers = {"Cookie": f"clipmark_session={guest_token}"}
    assert "Home Videos" in (await client.get("/api/libraries", headers=owner_headers)).text
    assert (await client.patch(f"/api/admin/users/{guest.id}", json={"role": "admin"}, headers=owner_headers)).status_code == 200
    response = await client.get("/api/admin/cache/stats", headers=guest_headers)
    assert response.status_code == 200
    assert response.json()["libraries"] == []
    assert response.json()["library_count"] == response.json()["total_items"] == 0
    assert "Home Videos" not in response.text
    assert "server-owner" not in response.text


async def test_retired_scan_removed_from_existing_and_new_scheduler_rows(client, make_user, plex_api):
    _, token = await make_user(role="admin", plex_token="server-owner")
    async with async_session() as db:
        db.add(ScheduledTask(id="library_cache_refresh", name="Library Cache Refresh", next_run_at=datetime.utcnow()))
        await db.commit()
    await scheduler.seed_tasks()
    await scheduler.seed_tasks()
    assert "library_cache_refresh" not in _task_registry
    assert {task.id for task in await scheduler.get_all_tasks()} == {"cache_cleanup", "session_cleanup"}
    response = await client.post("/api/admin/tasks/library_cache_refresh/run", headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 404
    assert plex_api["calls"] == []
    assert not hasattr(library_cache, "_library_items")


@pytest.mark.parametrize("mode", ["startup", "scheduled"])
async def test_legacy_cleanup_preserves_namespaced_files(client, monkeypatch, tmp_path, mode):
    from app.main import app, lifespan
    for name in ("THUMBNAILS_CACHE_DIR", "SUBTITLES_CACHE_DIR"):
        directory = tmp_path / name
        directory.mkdir()
        monkeypatch.setattr(cache, name, directory)
    legacy = [cache.THUMBNAILS_CACHE_DIR / "10.jpg", cache.SUBTITLES_CACHE_DIR / "detail_10.json", cache.SUBTITLES_CACHE_DIR / "10_1.json"]
    keep = [cache.get_thumbnail_cache_path("10", server_id="server-1"), cache.get_media_detail_cache_path("10", server_id="server-1"), cache.get_subtitle_cache_path("10", 1, server_id="server-1"), cache.SUBTITLES_CACHE_DIR / "notes.txt"]
    for path in legacy + keep:
        path.write_bytes(b"content")
    if mode == "startup":
        async with lifespan(app):
            pass
    else:
        await cache.janitor._cleanup()
    await cache.janitor.cleanup_legacy_files()
    assert all(not path.exists() for path in legacy)
    assert all(path.read_bytes() == b"content" for path in keep)


@pytest.mark.parametrize("case", ["resource_token", "revoked"])
async def test_login_without_resource_token_does_not_persist_account_token(client, make_user, plex_api, case):
    await make_user(role="admin", plex_token="server-owner")
    if case == "resource_token":
        plex_api[case] = False
    else:
        plex_api[case].add("guest")
    store_pending_token("denied-login", "oauth-guest")
    response = await client.post("/api/auth/plex/login", json={"pin_id": "denied-login"})
    assert response.status_code == 403
    assert "clipmark_session" not in response.cookies
    async with async_session() as db:
        assert (await db.execute(select(User).where(User.plex_account_id == "2"))).scalar_one_or_none() is None


async def test_existing_account_token_migration_clears_once_and_preserves_resource_token(monkeypatch, tmp_path):
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'account-tokens.db'}")
    monkeypatch.setattr(database, "engine", test_engine)
    try:
        async with test_engine.begin() as conn:
            await conn.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, plex_token TEXT)"))
            await conn.execute(text("INSERT INTO users VALUES ('guest', 'old-account-token')"))
        await database.init_db()
        async with test_engine.begin() as conn:
            assert tuple((await conn.execute(text("SELECT id, plex_token, plex_server_id FROM users"))).one()) == ("guest", None, None)
            await conn.execute(text("UPDATE users SET plex_token = 'server-guest', plex_server_id = 'server-1'"))
        await database.init_db()
        async with test_engine.begin() as conn:
            assert tuple((await conn.execute(text("SELECT plex_token, plex_server_id FROM users"))).one()) == ("server-guest", "server-1")
    finally:
        await test_engine.dispose()


async def test_connection_cache_is_bounded_and_clear_during_connect_does_not_repopulate(plex_api, monkeypatch):
    import app.services.library_cache as cache_module
    instance = LibraryCache()
    monkeypatch.setattr(cache_module, "SERVER_CACHE_MAX_SIZE", 2)
    for identity in ("owner", "guest", "empty"):
        await instance.get_server(f"server-{identity}", "server-1")
    assert len(instance._servers) == 2
    assert all(key[2] != "server-owner" for key in instance._servers)
    monkeypatch.setattr(instance, "clear_disk_cache", lambda: None)
    instance.clear()
    connected = asyncio.Event()
    release = asyncio.Event()

    async def connect(*args):
        connected.set()
        await release.wait()
        return object()

    monkeypatch.setattr(cache_module.asyncio, "to_thread", connect)
    pending = asyncio.create_task(instance.get_server("server-guest", "server-1"))
    await connected.wait()
    instance.clear()
    release.set()
    await pending
    assert instance._servers == {}
    assert instance._pending == {}
