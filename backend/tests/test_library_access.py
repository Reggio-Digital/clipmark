from datetime import datetime
import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, func

from app.config import OUTPUT_DIR
from app.database import async_session
from app.models.db import GifRecord
from app.models.schemas import Library, ShowDetail, Season, MediaItem, MediaDetail
from app.services.cache import (
    get_media_detail_cache_path, get_thumbnail_cache_path, get_subtitle_cache_path,
    get_frame_cache_path, get_preview_cache_path, get_server_cache_key,
)
from app.services.library_cache import library_cache
from tests.test_gifs import _insert_gif


async def test_legacy_session_cannot_read_owner_library_cache(client, make_user, monkeypatch):
    _, token = await make_user()
    monkeypatch.setattr(library_cache, "_last_refreshed", datetime.utcnow())
    monkeypatch.setattr(library_cache, "_libraries", [
        Library(id="2", title="Home Videos", type="movie"),
    ])

    response = await client.get("/api/libraries", headers={"Cookie": f"clipmark_session={token}"})

    assert response.status_code == 403
    assert "Home Videos" not in response.text


@pytest.mark.parametrize("role", ["user", "admin"])
async def test_library_access_follows_plex_not_clipmark_role(client, make_user, plex_api, role):
    _, token = await make_user(role=role, plex_token="oauth-guest")
    response = await client.get("/api/libraries", headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 200
    assert [library["id"] for library in response.json()] == ["1", "3"]
    assert "Home Videos" not in response.text
    assert response.headers["cache-control"] == "private, no-store"


async def test_owner_guest_and_empty_access_stay_separate(client, make_user, plex_api):
    sessions = [await make_user(plex_token=f"oauth-{name}") for name in ("owner", "guest", "empty")]
    responses = await asyncio.gather(*[
        client.get("/api/libraries", headers={"Cookie": f"clipmark_session={token}"})
        for _, token in sessions
    ])
    assert [[library["id"] for library in response.json()] for response in responses] == [
        ["1", "2", "3"], ["1", "3"], [],
    ]


@pytest.mark.parametrize("path", [
    "/api/libraries/2/items", "/api/search?query=Private&library_id=2",
    "/api/shows/40", "/api/shows/40/seasons", "/api/shows/40/episodes?season=1",
])
async def test_private_library_and_show_urls_are_denied(client, make_user, plex_api, monkeypatch, path):
    _, token = await make_user(plex_token="oauth-guest")
    monkeypatch.setattr(library_cache, "_show_details", {
        "40": ShowDetail(id="40", title="Private show", thumb_url="", year=2024, season_count=1),
    })
    monkeypatch.setattr(library_cache, "_seasons", {"40": [Season(index=1, title="Private season", episode_count=1)]})
    monkeypatch.setattr(library_cache, "_episodes", {"40:1": ([MediaItem(id="20", title="Private episode", type="episode", thumb_url="")], 1)})
    response = await client.get(path, headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 404
    assert "Private" not in response.text


@pytest.mark.parametrize("path,ids", [
    ("/api/libraries/1/items?page=1&page_size=1&sort=alpha", ["11"]),
    ("/api/search?query=Movie", ["10", "11", "30"]),
    ("/api/search?query=Movie&library_id=1", ["10", "11"]),
    ("/api/shows/30/episodes?season=1", ["32"]),
])
async def test_permitted_browse_search_and_episodes(client, make_user, plex_api, path, ids):
    _, token = await make_user(plex_token="oauth-guest")
    response = await client.get(path, headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["id"] for item in (body["items"] if isinstance(body, dict) else body)] == ids
    assert "Private" not in response.text


async def test_content_restrictions_filter_counts_and_children(client, make_user, plex_api):
    _, token = await make_user(plex_token="oauth-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    plex_api["hidden"] = {"10", "32"}
    response = await client.get("/api/libraries/1/items", headers=headers)
    assert response.json()["total_items"] == 1
    assert [item["id"] for item in response.json()["items"]] == ["11"]
    response = await client.get("/api/shows/30", headers=headers)
    assert response.status_code == 200
    assert response.json()["season_count"] == 1
    response = await client.get("/api/shows/30/seasons", headers=headers)
    assert response.status_code == 200
    assert response.json()[0]["episode_count"] == 0
    response = await client.get("/api/shows/30/episodes?season=1", headers=headers)
    assert response.json()["items"] == []
    assert response.json()["total_items"] == 0


@pytest.mark.parametrize("warm", [False, True])
@pytest.mark.parametrize("method,path", [
    ("GET", "/api/media/20"), ("GET", "/api/media/20/thumbnail"),
    ("GET", "/api/media/20/subtitles/1"), ("GET", "/api/media/20/frame?ts=0"),
    ("POST", "/api/media/20/preview"), ("GET", f"/output/previews/{get_server_cache_key('server-1')}_20_0_2000.mp4"),
    ("HEAD", f"/output/previews/{get_server_cache_key('server-1')}_20_0_2000.mp4"),
])
async def test_private_media_denied_before_cache_or_generation(client, make_user, plex_api, monkeypatch, warm, method, path):
    import app.routers.media as media_router
    _, token = await make_user(plex_token="oauth-guest")
    paths = [get_media_detail_cache_path("20", server_id="server-1"), get_thumbnail_cache_path("20", server_id="server-1"),
             get_subtitle_cache_path("20", 1, server_id="server-1"), get_frame_cache_path("20", 0, 320, server_id="server-1"),
             get_preview_cache_path("20", 0, 2000, server_id="server-1")]
    for cache_path in paths:
        cache_path.unlink(missing_ok=True)
        if warm:
            cache_path.write_bytes(b"private cached content")
    frame = AsyncMock(side_effect=AssertionError("Private frame generated"))
    preview = AsyncMock(side_effect=AssertionError("Private preview generated"))
    monkeypatch.setattr(media_router, "generate_frame", frame)
    monkeypatch.setattr(media_router, "generate_preview", preview)
    response = await client.request(method, path, json={"start_ms": 0, "end_ms": 2000}, headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 404
    assert "private cached" not in response.text
    frame.assert_not_awaited()
    preview.assert_not_awaited()


async def test_revocation_blocks_warm_media_and_preview_files(client, make_user, plex_api):
    _, token = await make_user(plex_token="oauth-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    get_thumbnail_cache_path("10", server_id="server-1").write_bytes(b"image")
    get_preview_cache_path("10", 0, 2000, server_id="server-1").write_bytes(b"preview")
    for path in ("/api/media/10/thumbnail", f"/output/previews/{get_server_cache_key('server-1')}_10_0_2000.mp4"):
        assert (await client.get(path, headers=headers)).status_code == 200
    plex_api["libraries"]["guest"].remove("1")
    for path in ("/api/media/10/thumbnail", f"/output/previews/{get_server_cache_key('server-1')}_10_0_2000.mp4", "/api/libraries/1/items"):
        assert (await client.get(path, headers=headers)).status_code == 404


@pytest.mark.parametrize("case,status", [("revoked", 403), ("offline", 503), ("resource_token", 403), ("machine_id", 403)])
async def test_unavailable_access_fails_closed_without_upstream_details(client, make_user, plex_api, case, status):
    _, token = await make_user(plex_token="oauth-guest")
    if case == "revoked":
        plex_api[case].add("guest")
    else:
        plex_api[case] = {"offline": True, "resource_token": False, "machine_id": "other-server"}[case]
    response = await client.get("/api/libraries", headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == status
    assert "private upstream" not in response.text
    assert "oauth-" not in response.text
    assert "server-guest" not in response.text


async def test_gif_creation_cannot_queue_private_media(client, make_user, plex_api):
    _, token = await make_user(plex_token="oauth-guest")
    response = await client.post("/api/gifs", json={"media_id": "20", "start_ms": 0, "end_ms": 2000}, headers={"Cookie": f"clipmark_session={token}"})
    assert response.status_code == 404
    async with async_session() as db:
        assert await db.scalar(select(func.count()).select_from(GifRecord)) == 0


async def test_permitted_media_detail_and_gif_creation(client, make_user, plex_api):
    _, token = await make_user(plex_token="oauth-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    response = await client.get("/api/media/11", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Alpha"
    response = await client.post("/api/gifs", json={"media_id": "11", "start_ms": 0, "end_ms": 2000}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["media_title"] == "Alpha"
    assert response.json()["status"] == "queued"


async def test_direct_gif_file_follows_existing_ownership_rules(client, make_user):
    owner, owner_token = await make_user()
    _, guest_token = await make_user()
    _, admin_token = await make_user(role="admin")
    filename = f"{owner.id}/private.gif"
    path = OUTPUT_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"private GIF")
    await _insert_gif(owner.id, filename=filename)
    for token, expected in ((owner_token, 200), (guest_token, 404), (admin_token, 200)):
        for method in ("GET", "HEAD"):
            response = await client.request(method, f"/output/{filename}", headers={"Cookie": f"clipmark_session={token}"})
            assert response.status_code == expected
            assert response.headers["cache-control"] == "private, no-store"
    assert (await client.get(f"/output/{filename}")).status_code == 401


async def test_other_server_and_legacy_caches_are_not_served(client, make_user, plex_api):
    _, token = await make_user(plex_token="oauth-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    old_detail = MediaDetail(id="10", title="Private old-server movie", type="movie", thumb_url="", duration_ms=1000, subtitle_tracks=[])
    get_media_detail_cache_path("10", server_id="server-1").unlink(missing_ok=True)
    get_media_detail_cache_path("10", server_id="other-server").write_text(old_detail.model_dump_json())
    response = await client.get("/api/media/10", headers=headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Zulu"
    old_preview = get_preview_cache_path("10", 0, 2000, server_id="other-server")
    old_preview.write_bytes(b"old private clip")
    for name in (old_preview.name, "10_0_2000.mp4"):
        old_preview.with_name(name).write_bytes(b"old private clip")
        response = await client.get(f"/output/previews/{name}", headers=headers)
        assert response.status_code == 404


async def test_preview_creation_and_range_reads_check_access(client, make_user, plex_api, monkeypatch):
    from app.services import gif
    _, token = await make_user(plex_token="oauth-guest")
    headers = {"Cookie": f"clipmark_session={token}"}
    preview_path = get_preview_cache_path("11", 0, 2000, server_id="server-1")
    preview_path.unlink(missing_ok=True)
    calls = []

    async def encode(cmd, **kwargs):
        calls.append(cmd)
        assert "X-Plex-Token=server-guest" in cmd[cmd.index("-i") + 1]
        preview_path.write_bytes(b"preview bytes")
        return b"", b""

    monkeypatch.setattr(gif, "run_ffmpeg_with_timeout", encode)
    response = await client.post("/api/media/11/preview", json={"start_ms": 0, "end_ms": 2000}, headers=headers)
    assert response.status_code == 200
    assert response.json()["url"] == f"/output/previews/{preview_path.name}"
    response = await client.get(response.json()["url"], headers={**headers, "Range": "bytes=0-6"})
    assert response.status_code == 206
    assert response.content == b"preview"
    assert len(calls) == 1
    plex_api["revoked"].add("guest")
    response = await client.get(f"/output/previews/{preview_path.name}", headers={**headers, "Range": "bytes=0-6"})
    assert response.status_code == 403


async def test_public_gif_shares_keep_explicit_sharing_behavior(client, make_user, plex_api):
    from app.services import plex
    owner, _ = await make_user()
    filename = f"{owner.id}/public.gif"
    path = OUTPUT_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"shared GIF")
    await _insert_gif(owner.id, filename=filename, public_token="public-share")
    assert (await client.get("/api/shared/public-share/file")).status_code == 404
    config = plex.load_config()
    config.public_sharing_enabled = True
    plex.save_config(config)
    response = await client.get("/api/shared/public-share/file")
    assert response.status_code == 200
    assert response.content == b"shared GIF"
