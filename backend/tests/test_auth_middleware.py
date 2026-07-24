async def test_protected_route_requires_session(client):
    resp = await client.get("/api/gifs")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


async def test_invalid_session_is_rejected(client):
    resp = await client.get("/api/gifs", cookies={"clipmark_session": "not-a-real-token"})
    assert resp.status_code == 401


async def test_public_auth_status_needs_no_session(client):
    resp = await client.get("/api/auth/status")
    assert resp.status_code == 200


async def test_valid_session_reaches_protected_route(client, make_user):
    _, token = await make_user()
    resp = await client.get("/api/gifs", headers={"Cookie": f"clipmark_session={token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total_items"] == 0


async def test_disabled_user_is_rejected(client, make_user):
    _, token = await make_user(enabled=False)
    resp = await client.get("/api/gifs", headers={"Cookie": f"clipmark_session={token}"})
    assert resp.status_code == 401
