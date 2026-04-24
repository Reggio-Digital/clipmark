from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.plex import load_config, save_config
from app.services.auth import has_any_admin
from app.dependencies import get_current_user
from app.models.schemas import (
    SetupStatus,
    GiphyConfigStatus,
    GifsicleSettings,
    GifsicleSettingsUpdate,
)

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
async def get_status(db: AsyncSession = Depends(get_db)):
    """Check setup status - public endpoint."""
    config = load_config()
    needs_setup = not await has_any_admin(db)
    return SetupStatus(
        needs_setup=needs_setup,
        configured=bool(config.plex_token and config.server_url),
        server_name=config.server_name,
    )


# Per-user Giphy API key management
@router.get("/giphy/status", response_model=GiphyConfigStatus)
async def get_giphy_status(user=Depends(get_current_user)):
    return GiphyConfigStatus(configured=bool(user.giphy_api_key))


class GiphyConfigRequest(BaseModel):
    api_key: str


@router.post("/giphy")
async def configure_giphy(
    request: GiphyConfigRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.giphy_api_key = request.api_key
    await db.commit()
    return {"success": True}


@router.delete("/giphy")
async def remove_giphy_config(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.giphy_api_key = None
    await db.commit()
    return {"success": True}


# Global gifsicle settings (admin only for writes, all users can read)
@router.get("/gifsicle", response_model=GifsicleSettings)
async def get_gifsicle_settings():
    config = load_config()
    return GifsicleSettings(
        enabled=config.gifsicle_enabled,
        lossy=config.gifsicle_lossy,
    )


@router.put("/gifsicle")
async def update_gifsicle_settings(
    request: GifsicleSettingsUpdate,
    user=Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    config = load_config()
    if request.enabled is not None:
        config.gifsicle_enabled = request.enabled
    if request.lossy is not None:
        config.gifsicle_lossy = max(0, min(200, request.lossy))
    save_config(config)
    return GifsicleSettings(
        enabled=config.gifsicle_enabled,
        lossy=config.gifsicle_lossy,
    )


@router.get("/features")
async def get_feature_flags(user=Depends(get_current_user)):
    """Get globally enabled features (for UI display decisions)."""
    config = load_config()
    return {
        "public_sharing_enabled": config.public_sharing_enabled,
        "giphy_global_enabled": config.giphy_global_enabled,
    }
