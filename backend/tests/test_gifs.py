import uuid
from datetime import datetime

import app.routers.gifs as gifs_router
from app.config import MAX_QUEUED_JOBS, MAX_QUEUED_JOBS_PER_USER
from app.database import async_session
from app.models.db import GifRecord
from app.models.schemas import AppConfig, MediaDetail


async def _insert_gif(user_id, status="complete", **overrides):
    fields = dict(
        id=str(uuid.uuid4()),
        user_id=user_id,
        media_id="plex-1",
        media_title="Some Movie",
        media_type="movie",
        start_ms=0,
        end_ms=2000,
        width=480,
        fps=10,
        include_subtitles=0,
        status=status,
        progress=100 if status == "complete" else 0,
        filename="clip.gif" if status == "complete" else None,
        created_at=datetime.utcnow(),
    )
    fields.update(overrides)
    record = GifRecord(**fields)
    async with async_session() as db:
        db.add(record)
        await db.commit()
    return record.id


async def test_create_gif_duration_over_limit(client, make_user, monkeypatch):
    _, token = await make_user()
    monkeypatch.setattr(gifs_router, "load_config", lambda: AppConfig(max_gif_duration_seconds=15))

    resp = await client.post(
        "/api/gifs",
        json={"media_id": "plex-1", "start_ms": 0, "end_ms": 20_000},
        headers={"Cookie": f"clipmark_session={token}"},
    )
    assert resp.status_code == 400
    assert "maximum" in resp.json()["detail"].lower()


async def test_create_gif_invalid_time_range(client, make_user, monkeypatch):
    _, token = await make_user()
    monkeypatch.setattr(gifs_router, "load_config", lambda: AppConfig(max_gif_duration_seconds=15))

    resp = await client.post(
        "/api/gifs",
        json={"media_id": "plex-1", "start_ms": 2000, "end_ms": 1000},
        headers={"Cookie": f"clipmark_session={token}"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid time range"


async def test_create_gif_queue_full(client, make_user, monkeypatch):
    _, token = await make_user()
    monkeypatch.setattr(gifs_router, "load_config", lambda: AppConfig(max_gif_duration_seconds=15))

    # Fill the global queue with jobs owned by other users.
    for _ in range(MAX_QUEUED_JOBS):
        await _insert_gif(str(uuid.uuid4()), status="queued")

    resp = await client.post(
        "/api/gifs",
        json={"media_id": "plex-1", "start_ms": 0, "end_ms": 2000},
        headers={"Cookie": f"clipmark_session={token}"},
    )
    assert resp.status_code == 429
    assert "queue is full" in resp.json()["detail"].lower()


async def test_create_gif_per_user_limit(client, make_user, monkeypatch):
    user, token = await make_user()
    monkeypatch.setattr(gifs_router, "load_config", lambda: AppConfig(max_gif_duration_seconds=15))

    # Below the global cap, but at the per-user cap.
    assert MAX_QUEUED_JOBS_PER_USER < MAX_QUEUED_JOBS
    for _ in range(MAX_QUEUED_JOBS_PER_USER):
        await _insert_gif(user.id, status="queued")

    resp = await client.post(
        "/api/gifs",
        json={"media_id": "plex-1", "start_ms": 0, "end_ms": 2000},
        headers={"Cookie": f"clipmark_session={token}"},
    )
    assert resp.status_code == 429
    assert "per user" in resp.json()["detail"].lower()


async def test_create_gif_success_queues_record(client, make_user, monkeypatch):
    _, token = await make_user()
    monkeypatch.setattr(gifs_router, "load_config", lambda: AppConfig(max_gif_duration_seconds=15))
    monkeypatch.setattr(gifs_router, "get_plex_server", lambda: object())

    media = MediaDetail(
        id="plex-1",
        title="Some Movie",
        type="movie",
        thumb_url="",
        duration_ms=600_000,
        year=1999,
        subtitle_tracks=[],
    )
    monkeypatch.setattr(gifs_router, "get_media_detail", lambda server, media_id: media)

    resp = await client.post(
        "/api/gifs",
        json={"media_id": "plex-1", "start_ms": 0, "end_ms": 2000},
        headers={"Cookie": f"clipmark_session={token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["media_title"] == "Some Movie"
    assert body["status"] == "queued"


async def test_user_cannot_read_another_users_gif(client, make_user):
    owner, _ = await make_user()
    _, other_token = await make_user()
    gif_id = await _insert_gif(owner.id)

    resp = await client.get(f"/api/gifs/{gif_id}", headers={"Cookie": f"clipmark_session={other_token}"})
    assert resp.status_code == 404


async def test_owner_can_read_own_gif(client, make_user):
    owner, token = await make_user()
    gif_id = await _insert_gif(owner.id)

    resp = await client.get(f"/api/gifs/{gif_id}", headers={"Cookie": f"clipmark_session={token}"})
    assert resp.status_code == 200
    assert resp.json()["id"] == gif_id


async def test_list_gifs_scoped_to_owner(client, make_user):
    owner, owner_token = await make_user()
    other, _ = await make_user()
    await _insert_gif(owner.id)
    await _insert_gif(other.id)

    resp = await client.get("/api/gifs", headers={"Cookie": f"clipmark_session={owner_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_items"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["user_id"] == owner.id
