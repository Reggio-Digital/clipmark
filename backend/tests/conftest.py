import os
import secrets
import tempfile
import uuid
from datetime import datetime, timedelta

# DATA_DIR must be set before importing the app: config.py reads it at import
# time and creates directories under it. Point everything at a throwaway dir so
# tests never touch the real ./data or /data.
_TEST_DATA_DIR = tempfile.mkdtemp(prefix="clipmark-test-")
os.environ["DATA_DIR"] = _TEST_DATA_DIR

import httpx
import pytest_asyncio
from asgi_lifespan import LifespanManager

from app.database import async_session, engine
from app.models.db import Base, Session, User


@pytest_asyncio.fixture
async def client(monkeypatch):
    """An httpx client bound to the app with a fresh database per test.

    The background worker and scheduler are disabled so tests are deterministic
    and never reach out to Plex, FFmpeg, or GitHub.
    """
    from app.services.scheduler import scheduler
    from app.services.worker import worker

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(worker, "start", _noop)
    monkeypatch.setattr(worker, "stop", _noop)
    monkeypatch.setattr(scheduler, "start", _noop)
    monkeypatch.setattr(scheduler, "stop", _noop)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    from app.main import app

    async with LifespanManager(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def make_user():
    """Factory that seeds a user plus an active session and returns the pair.

    Returns a coroutine ``make_user(role=..., enabled=...) -> (user, token)``.
    Send the token as the ``clipmark_session`` cookie to authenticate.
    """

    async def _make(role: str = "user", enabled: bool = True):
        now = datetime.utcnow()
        user = User(
            id=str(uuid.uuid4()),
            plex_account_id=str(uuid.uuid4()),
            plex_username=f"user-{secrets.token_hex(4)}",
            plex_email=None,
            role=role,
            enabled=enabled,
            created_at=now,
            last_login=now,
        )
        token = secrets.token_urlsafe(32)
        session = Session(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token=token,
            created_at=now,
            expires_at=now + timedelta(days=30),
        )
        async with async_session() as db:
            db.add(user)
            db.add(session)
            await db.commit()
        return user, token

    return _make
