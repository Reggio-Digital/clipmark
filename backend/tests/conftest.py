import os
import secrets
import tempfile
import uuid
from urllib.parse import urlsplit, parse_qs
from datetime import datetime, timedelta

# DATA_DIR must be set before importing the app: config.py reads it at import
# time and creates directories under it. Point everything at a throwaway dir so
# tests never touch the real ./data or /data.
_TEST_DATA_DIR = tempfile.mkdtemp(prefix="clipmark-test-")
os.environ["DATA_DIR"] = _TEST_DATA_DIR

import httpx
import pytest
import requests
import pytest_asyncio
from asgi_lifespan import LifespanManager

from app.database import async_session, engine
from app.models.db import Base, Session, User
from app.models.schemas import AppConfig
from app.services import plex


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

    async def _make(role: str = "user", enabled: bool = True, plex_token: str | None = None):
        now = datetime.utcnow()
        user = User(
            id=str(uuid.uuid4()),
            plex_account_id=str(uuid.uuid4()),
            plex_username=f"user-{secrets.token_hex(4)}",
            plex_email=None,
            role=role,
            enabled=enabled,
            plex_token=plex_token,
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


@pytest.fixture
def plex_api(monkeypatch, tmp_path):
    """Exercise PlexAPI's real XML parsing and HTTP errors without a live server."""
    monkeypatch.setattr(plex, "CONFIG_FILE", tmp_path / "config.json")
    plex.save_config(AppConfig(
        plex_token="oauth-owner", server_url="http://plex.test:32400",
        server_machine_id="server-1", server_name="Test Plex",
    ))
    state = {
        "libraries": {"owner": {"1", "2", "3"}, "guest": {"1", "3"}, "empty": set()},
        "revoked": set(), "hidden": set(), "calls": [], "offline": False,
        "machine_id": "server-1", "resource_token": True,
    }
    libraries = {
        "1": '<Directory key="1" title="Movies" type="movie"/>',
        "2": '<Directory key="2" title="Home Videos" type="movie"/>',
        "3": '<Directory key="3" title="TV" type="show"/>',
    }
    movies = {
        "10": ("1", "Zulu", "2020", "1000"),
        "11": ("1", "Alpha", "2024", "2000"),
        "20": ("2", "Private home movie", "2025", "3000"),
    }
    items = {
        key: (
            f'<Video type="movie" ratingKey="{key}" key="/library/metadata/{key}" '
            f'librarySectionID="{lib}" title="{title}" year="{year}" addedAt="{added}" '
            f'duration="600000" thumb="/library/metadata/{key}/thumb">'
            f'<Guid id="imdb://tt{key}"/><Media><Part key="/library/parts/{key}/file">'
            '<Stream streamType="3" index="1" codec="srt" language="English" '
            'key="/library/streams/1"/></Part></Media></Video>'
        ) for key, (lib, title, year, added) in movies.items()
    }
    items.update({
        "30": '<Directory type="show" ratingKey="30" key="/library/metadata/30/children" librarySectionID="3" title="A show" year="2024" addedAt="1000"/>',
        "31": '<Directory type="season" ratingKey="31" key="/library/metadata/31/children" librarySectionID="3" index="1" title="Season 1"/>',
        "32": '<Video type="episode" ratingKey="32" key="/library/metadata/32" librarySectionID="3" title="Pilot" index="1" parentIndex="1" grandparentTitle="A show" duration="600000"/>',
        "40": '<Directory type="show" ratingKey="40" key="/library/metadata/40/children" librarySectionID="2" title="Private show" year="2024"/>',
    })

    def request(_session, method, url, **kwargs):
        parsed = urlsplit(url)
        query = parse_qs(parsed.query)
        token = kwargs.get("headers", {}).get("X-Plex-Token", "")
        state["calls"].append((parsed.hostname, parsed.path, token))
        if state["offline"]:
            raise requests.ConnectionError("private upstream URL and token")
        identity = token.removeprefix("oauth-").removeprefix("server-")
        response = requests.Response()
        response.status_code = 200
        response.url = url
        response.headers["Content-Type"] = "application/xml"
        body = ""
        if parsed.hostname == "plex.tv":
            if identity not in state["libraries"]:
                response.status_code = 401
            elif parsed.path == "/api/v2/user":
                account_id = {"owner": 1, "guest": 2, "empty": 3}[identity]
                body = (f'<user id="{account_id}" username="{identity}" email="{identity}@example.test" '
                        f'authToken="{token}" scrobbleTypes="1"><subscription active="0"/><profile/></user>')
            elif parsed.path == "/api/v2/resources":
                resource_token = f"server-{identity}" if state["resource_token"] else ""
                body = "" if identity in state["revoked"] else (
                    f'<Device name="Test Plex" provides="server" clientIdentifier="server-1" '
                    f'accessToken="{resource_token}" connections=""/>'
                )
                body = f"<MediaContainer>{body}</MediaContainer>"
            else:
                raise AssertionError(f"Unexpected Plex account path: {parsed.path}")
        elif parsed.hostname == "plex.test":
            assert token.startswith("server-"), "Media requests must use the user's resource token"
            if identity in state["revoked"]:
                response.status_code = 401
            else:
                allowed = state["libraries"][identity]
                visible = {key for key in items if (
                    (movies[key][0] if key in movies else "2" if key == "40" else "3") in allowed
                    and key not in state["hidden"]
                )}
                path = parsed.path.rstrip("/")
                if not path:
                    body = f'<MediaContainer machineIdentifier="{state["machine_id"]}" friendlyName="Test Plex"/>'
                elif path == "/library":
                    body = "<MediaContainer/>"
                elif path == "/library/sections":
                    body = "".join(libraries[key] for key in sorted(allowed))
                elif path == "/library/all":
                    body = "".join(items[key] for key in sorted(visible) if key not in {"31", "32"})
                elif path.startswith("/library/sections/"):
                    lib_id = path.split("/")[3]
                    if lib_id not in allowed:
                        response.status_code = 404
                    elif query.get("includeMeta") == ["1"]:
                        libtype = "show" if lib_id == "3" else "movie"
                        body = f'<Meta><Type type="{libtype}">' + "".join(
                            f'<Sort key="{key}" defaultDirection="asc"/>' for key in ("titleSort", "year", "addedAt")
                        ) + '</Type></Meta>'
                    else:
                        selected = [key for key in sorted(visible) if (
                            movies[key][0] == lib_id if key in movies else key == "30" and lib_id == "3"
                        )]
                        sort = query.get("sort", [""])[0]
                        if sort and lib_id in {"1", "2"}:
                            field, direction = sort.split(".")[-1].split(":")
                            index = {"titleSort": 1, "year": 2, "addedAt": 3}[field]
                            selected.sort(key=lambda key: movies[key][index], reverse=direction == "desc")
                        total = len(selected)
                        start = int(kwargs["headers"].get("X-Plex-Container-Start", "0"))
                        size = int(kwargs["headers"].get("X-Plex-Container-Size", str(total)))
                        selected = selected[start:start + size]
                        body = f'<MediaContainer totalSize="{total}" size="{len(selected)}">' + "".join(items[key] for key in selected) + "</MediaContainer>"
                elif path.startswith("/library/metadata/"):
                    item_id = path.split("/")[3]
                    if item_id not in visible:
                        response.status_code = 404
                    elif path.endswith("/children"):
                        child_id = {"30": "31", "31": "32"}.get(item_id)
                        body = items[child_id] if child_id in visible else ""
                    else:
                        body = items[item_id]
                else:
                    raise AssertionError(f"Unexpected Plex server path: {parsed.path}")
                if not body.startswith("<MediaContainer"):
                    body = f"<MediaContainer>{body}</MediaContainer>"
        else:
            raise AssertionError(f"Unexpected network host: {parsed.hostname}")
        response._content = body.encode() if response.status_code == 200 else b"private upstream error"
        return response

    monkeypatch.setattr(requests.Session, "request", request)
    return state
