import asyncio
import time

from fastapi import APIRouter, HTTPException, Cookie, Response, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.schemas import (
    AuthStatus,
    AuthInitResponse,
    AuthCheckResponse,
    UserInfo,
    PlexLoginRequest,
)
from app.services.auth import (
    get_user_by_session_token,
    create_session_for_user,
    delete_session,
    has_any_admin,
    get_user_by_plex_id,
    create_user,
    update_user_login,
)
from app.services.plex import (
    initiate_oauth,
    check_oauth,
    get_plex_account_info,
    get_available_servers,
    user_has_server_access,
    load_config,
    save_config,
    connect_to_server,
)
from app.models.schemas import ServerSelectRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE_NAME = "clipmark_session"
PENDING_TOKEN_TTL = 600
PENDING_TOKEN_MAX_SIZE = 100

_pending_plex_tokens: dict[str, tuple[str, float]] = {}
_setup_lock = asyncio.Lock()


def _store_pending_token(pin_id: str, token: str) -> None:
    now = time.monotonic()
    expired = [k for k, (_, ts) in _pending_plex_tokens.items() if now - ts > PENDING_TOKEN_TTL]
    for k in expired:
        del _pending_plex_tokens[k]
    if len(_pending_plex_tokens) >= PENDING_TOKEN_MAX_SIZE:
        oldest = min(_pending_plex_tokens, key=lambda k: _pending_plex_tokens[k][1])
        del _pending_plex_tokens[oldest]
    _pending_plex_tokens[pin_id] = (token, now)


def _pop_pending_token(pin_id: str) -> str | None:
    entry = _pending_plex_tokens.pop(pin_id, None)
    if not entry:
        return None
    token, ts = entry
    if time.monotonic() - ts > PENDING_TOKEN_TTL:
        return None
    return token


def _user_to_info(user) -> UserInfo:
    return UserInfo(
        id=user.id,
        username=user.plex_username,
        email=user.plex_email,
        thumb=user.plex_thumb,
        role=user.role,
        giphy_configured=bool(user.giphy_api_key),
    )


@router.get("/status", response_model=AuthStatus)
async def get_auth_status(
    clipmark_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    needs_setup = not await has_any_admin(db)
    if not clipmark_session:
        return AuthStatus(authenticated=False, needs_setup=needs_setup)
    user = await get_user_by_session_token(db, clipmark_session)
    if not user:
        return AuthStatus(authenticated=False, needs_setup=needs_setup)
    return AuthStatus(
        authenticated=True,
        needs_setup=False,
        user=_user_to_info(user),
    )


@router.post("/plex/initiate", response_model=AuthInitResponse)
async def initiate_plex_auth(forward_url: str | None = None):
    auth_url, pin_id = initiate_oauth(forward_url=forward_url)
    return AuthInitResponse(auth_url=auth_url, pin_id=pin_id)


@router.get("/plex/check", response_model=AuthCheckResponse)
async def check_plex_auth(pin_id: str):
    token = check_oauth(pin_id)
    if token:
        _store_pending_token(pin_id, token)
        return AuthCheckResponse(complete=True, token=pin_id)
    return AuthCheckResponse(complete=False)


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 30,  # 30 days
    )


@router.post("/plex/login")
async def plex_login(
    request: PlexLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    plex_token = _pop_pending_token(request.pin_id)
    if not plex_token:
        raise HTTPException(status_code=400, detail="Invalid or expired pin. Please try again.")

    try:
        account_info = get_plex_account_info(plex_token)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to get Plex account info")

    plex_id = account_info["id"]
    needs_setup = not await has_any_admin(db)

    if needs_setup:
        try:
            servers = get_available_servers(plex_token)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to get Plex servers")

        _store_pending_token(request.pin_id, plex_token)

        return {
            "success": True,
            "needs_server_selection": True,
            "servers": [s.model_dump() for s in servers],
            "pin_id": request.pin_id,
            "user": None,
        }

    config = load_config()
    if not config.server_machine_id:
        raise HTTPException(status_code=500, detail="Server not configured. Contact admin.")

    if not user_has_server_access(plex_token, config.server_machine_id):
        raise HTTPException(
            status_code=403,
            detail="Your Plex account does not have access to this server.",
        )

    user = await get_user_by_plex_id(db, plex_id)
    if user:
        if not user.enabled:
            raise HTTPException(status_code=403, detail="Your account has been disabled.")
        await update_user_login(
            db, user,
            plex_username=account_info["username"],
            plex_email=account_info["email"],
            plex_thumb=account_info["thumb"],
        )
    else:
        user = await create_user(
            db,
            plex_account_id=plex_id,
            plex_username=account_info["username"],
            plex_email=account_info["email"],
            plex_thumb=account_info["thumb"],
            role="user",
        )

    token = await create_session_for_user(db, user.id)
    _set_session_cookie(response, token)

    return {
        "success": True,
        "needs_server_selection": False,
        "servers": None,
        "user": _user_to_info(user).model_dump(),
    }


@router.post("/setup/select-server")
async def setup_select_server(
    request: ServerSelectRequest,
    pin_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    async with _setup_lock:
        needs_setup = not await has_any_admin(db)
        if not needs_setup:
            raise HTTPException(status_code=400, detail="Setup already complete")

        plex_token = _pop_pending_token(pin_id)
        if not plex_token:
            raise HTTPException(status_code=400, detail="Invalid or expired session. Please try again.")

        try:
            account_info = get_plex_account_info(plex_token)
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to get Plex account info")

        try:
            server_url, server_name = connect_to_server(
                plex_token, request.server_id, request.connection_uri
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

        config = load_config()
        config.plex_token = plex_token
        config.server_url = server_url
        config.server_name = server_name
        config.server_machine_id = request.server_id
        save_config(config)

        user = await create_user(
            db,
            plex_account_id=account_info["id"],
            plex_username=account_info["username"],
            plex_email=account_info["email"],
            plex_thumb=account_info["thumb"],
            role="admin",
        )

    token = await create_session_for_user(db, user.id)
    _set_session_cookie(response, token)

    return {
        "success": True,
        "user": _user_to_info(user).model_dump(),
        "server_name": server_name,
    }


@router.post("/logout")
async def logout(
    response: Response,
    clipmark_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    if clipmark_session:
        await delete_session(db, clipmark_session)
    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"success": True}
