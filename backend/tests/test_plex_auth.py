from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app import database
from app.database import async_session
from app.models.db import User
from app.routers.auth import store_pending_token


async def test_login_persists_and_refreshes_private_plex_token(client, make_user, plex_api):
    await make_user(role="admin", plex_token="oauth-owner")
    for pin in ("new-login", "repeat-login"):
        store_pending_token(pin, "oauth-guest")
        response = await client.post("/api/auth/plex/login", json={"pin_id": pin})
        assert response.status_code == 200, response.text
        assert "oauth-guest" not in response.text
        assert "server-guest" not in response.text
        assert "plex_token" not in response.text
        async with async_session() as db:
            user = (await db.execute(select(User).where(User.plex_account_id == "2"))).scalar_one()
            assert user.plex_token == "oauth-guest"
            user.plex_token = "stale-token"
            await db.commit()
    # The second login must refresh the existing user rather than creating another.
    async with async_session() as db:
        assert len((await db.execute(select(User))).scalars().all()) == 2


async def test_setup_persists_admin_token_without_returning_it(client, plex_api, monkeypatch):
    import app.routers.auth as auth_router
    monkeypatch.setattr(auth_router, "connect_to_server", lambda *args: ("http://plex.test:32400", "Test Plex"))
    store_pending_token("setup", "oauth-owner")
    response = await client.post("/api/auth/setup/select-server?pin_id=setup", json={"server_id": "server-1"})
    assert response.status_code == 200
    assert "oauth-owner" not in response.text
    async with async_session() as db:
        user = (await db.execute(select(User))).scalar_one()
        assert user.plex_token == "oauth-owner"
        assert user.role == "admin"
    response = await client.get("/api/libraries")
    assert response.status_code == 200
    assert [library["id"] for library in response.json()] == ["1", "2", "3"]
    response = await client.get("/api/auth/status")
    assert "plex_token" not in response.text
    assert "oauth-owner" not in response.text
    response = await client.post("/api/auth/setup/select-server?pin_id=setup", json={"server_id": "server-1"})
    assert response.status_code == 400


async def test_token_migration_is_repeatable_and_preserves_legacy_users(monkeypatch, tmp_path):
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'legacy.db'}")
    monkeypatch.setattr(database, "engine", test_engine)
    try:
        async with test_engine.begin() as conn:
            await conn.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, plex_account_id TEXT, plex_username TEXT)"))
            await conn.execute(text("INSERT INTO users VALUES ('legacy', '7', 'legacy-user')"))
            await conn.execute(text("CREATE TABLE gifs (id TEXT PRIMARY KEY, media_id TEXT)"))
            await conn.execute(text("INSERT INTO gifs VALUES ('old-gif', '10')"))
        await database.init_db()
        await database.init_db()
        async with test_engine.begin() as conn:
            row = (await conn.execute(text("SELECT id, plex_username, plex_token FROM users"))).one()
            assert tuple(row) == ("legacy", "legacy-user", None)
            columns = (await conn.execute(text("PRAGMA table_info(users)"))).fetchall()
            assert [column[1] for column in columns].count("plex_token") == 1
            row = (await conn.execute(text("SELECT id, media_id, plex_server_id FROM gifs"))).one()
            assert tuple(row) == ("old-gif", "10", None)
    finally:
        await test_engine.dispose()
