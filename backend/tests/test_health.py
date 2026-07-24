import app.main


async def test_health_ok(client, monkeypatch):
    async def _no_release():
        return None, None, None

    monkeypatch.setattr(app.main, "_check_release_info", _no_release)

    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["version"] == app.main.VERSION
    # No Plex configured in tests, so status resolves without a network call.
    assert body["plex"] == "disconnected"
    assert body["update_available"] is False


async def test_health_is_public(client, monkeypatch):
    async def _no_release():
        return None, None, None

    monkeypatch.setattr(app.main, "_check_release_info", _no_release)

    # No session cookie set; /api/health is whitelisted in PUBLIC_PATHS.
    resp = await client.get("/api/health")
    assert resp.status_code == 200
