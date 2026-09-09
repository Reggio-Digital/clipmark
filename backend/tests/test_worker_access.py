from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.config import OUTPUT_DIR
from app.database import async_session
from app.models.db import GifRecord, User
from app.services import gif, plex
from app.services.worker import worker
from tests.test_gifs import _insert_gif


@pytest.mark.parametrize("case", ["revoked", "private", "disabled", "deleted", "legacy", "offline", "other_server", "legacy_job"])
async def test_worker_rechecks_access_before_generating(client, make_user, plex_api, monkeypatch, case):
    import app.services.worker as worker_module
    user, _ = await make_user(plex_token=None if case == "legacy" else "oauth-guest")
    server_id = None if case == "legacy_job" else "server-2" if case == "other_server" else "server-1"
    gif_id = await _insert_gif(user.id, status="queued", plex_server_id=server_id, media_id="20" if case == "private" else "10")
    if case == "revoked":
        plex_api["revoked"].add("guest")
    elif case == "offline":
        plex_api["offline"] = True
    elif case in {"disabled", "deleted"}:
        async with async_session() as db:
            user = await db.get(User, user.id)
            if case == "disabled":
                user.enabled = False
            else:
                await db.delete(user)
            await db.commit()
    generate = AsyncMock(side_effect=AssertionError("Inaccessible media generated"))
    monkeypatch.setattr(worker_module, "generate_gif", generate)
    await worker._process_job(gif_id)
    generate.assert_not_awaited()
    async with async_session() as db:
        record = await db.get(GifRecord, gif_id)
        assert record.status == "failed"
        assert record.filename is None
        assert "oauth-" not in record.error
        assert "private upstream" not in record.error


async def test_worker_and_all_generators_use_creator_stream_token(client, make_user, plex_api, monkeypatch, tmp_path):
    user, _ = await make_user(plex_token="oauth-guest")
    gif_id = await _insert_gif(user.id, status="queued", plex_server_id="server-1", media_id="10")
    config = plex.load_config()
    config.gifsicle_enabled = False
    plex.save_config(config)
    commands = []

    async def run_ffmpeg(cmd, **kwargs):
        commands.append(cmd)
        if cmd[-1] != "pipe:1":
            Path(cmd[-1]).write_bytes(b"encoded output")
        return b"encoded frame", b""

    async def start_ffmpeg(*cmd, **kwargs):
        commands.append(list(cmd))
        Path(cmd[-1]).write_bytes(b"GIF output")
        return SimpleNamespace(stdout=SimpleNamespace(readline=AsyncMock(return_value=b"")), wait=AsyncMock())

    monkeypatch.setattr(gif, "run_ffmpeg_with_timeout", run_ffmpeg)
    monkeypatch.setattr(gif.asyncio, "create_subprocess_exec", start_ffmpeg)
    await worker._process_job(gif_id)
    async with async_session() as db:
        record = await db.get(GifRecord, gif_id)
        assert record.status == "complete", record.error
        assert (OUTPUT_DIR / record.filename).read_bytes() == b"GIF output"
    server = plex.get_user_plex_server("oauth-guest")
    assert await gif.generate_frame(server, "10", 0) == b"encoded frame"
    assert await gif.generate_preview(server, "10", 0, 2000, tmp_path / "preview.mp4")
    assert len(commands) == 4
    for cmd in commands:
        stream_url = cmd[cmd.index("-i") + 1]
        assert stream_url.startswith("http://plex.test:32400/library/parts/10/file")
        assert "X-Plex-Token=server-guest" in stream_url
        assert "oauth-owner" not in stream_url
