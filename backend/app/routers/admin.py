from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.db import GifRecord
from app.config import OUTPUT_DIR
from app.services.auth import (
    get_all_users,
    get_user_by_id,
    delete_user_sessions,
)
from app.services.plex import (
    load_config,
    save_config,
    get_available_servers,
    connect_to_server,
    user_has_server_access,
)
from app.services.scheduler import scheduler
from app.services.library_cache import library_cache
from app.dependencies import require_admin
from app.routers.auth import peek_pending_token, pop_pending_token
from app.models.schemas import (
    AdminUserInfo,
    AdminUserUpdate,
    SharingSettings,
    ScheduledTaskInfo,
    ScheduledTaskUpdate,
    LibraryCacheStats,
    Server,
    ServerSelectRequest,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserInfo])
async def list_users(
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users with their GIF counts."""
    users = await get_all_users(db)
    result = []
    for user in users:
        gif_count = await db.scalar(
            select(func.count())
            .select_from(GifRecord)
            .where(GifRecord.user_id == user.id)
        ) or 0
        result.append(AdminUserInfo(
            id=user.id,
            username=user.plex_username,
            email=user.plex_email,
            thumb=user.plex_thumb,
            role=user.role,
            enabled=user.enabled,
            created_at=user.created_at,
            last_login=user.last_login,
            gif_count=gif_count,
        ))
    return result


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    update: AdminUserUpdate,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a user's role or enabled status."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from disabling themselves
    if user.id == admin.id and update.enabled is False:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    if user.id == admin.id and update.role and update.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot remove your own admin role")

    if update.enabled is not None:
        user.enabled = update.enabled
        if not update.enabled:
            # Invalidate all sessions for disabled user
            await delete_user_sessions(db, user_id)
    if update.role is not None:
        if update.role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
        user.role = update.role

    await db.commit()
    return {"success": True}


@router.get("/server")
async def get_server_info(admin=Depends(require_admin)):
    """Get current server configuration."""
    config = load_config()
    return {
        "configured": bool(config.plex_token and config.server_url),
        "server_name": config.server_name,
        "server_url": config.server_url,
    }


@router.post("/server/disconnect")
async def disconnect_server(admin=Depends(require_admin)):
    """Disconnect from the Plex server."""
    config = load_config()
    config.plex_token = None
    config.server_url = None
    config.server_name = None
    config.server_machine_id = None
    save_config(config)
    library_cache.clear()
    return {"success": True}


@router.get("/server/list-servers", response_model=list[Server])
async def admin_list_servers(pin_id: str, admin=Depends(require_admin)):
    """List Plex servers available to a completed OAuth token (identified by pin_id).
    Does not consume the pending token so the admin can still call /change afterwards."""
    plex_token = peek_pending_token(pin_id)
    if not plex_token:
        raise HTTPException(status_code=400, detail="Invalid or expired pin. Please try again.")
    try:
        return get_available_servers(plex_token)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to get Plex servers")


@router.post("/server/change")
async def admin_change_server(
    request: ServerSelectRequest,
    pin_id: str,
    admin=Depends(require_admin),
):
    """Swap the configured Plex server using a completed OAuth token."""
    plex_token = pop_pending_token(pin_id)
    if not plex_token:
        raise HTTPException(status_code=400, detail="Invalid or expired pin. Please try again.")

    if not user_has_server_access(plex_token, request.server_id):
        raise HTTPException(
            status_code=403,
            detail="This Plex account does not have access to the selected server.",
        )

    try:
        server_url, server_name = connect_to_server(
            plex_token, request.server_id, request.connection_uri
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to connect to server")

    config = load_config()
    config.plex_token = plex_token
    config.server_url = server_url
    config.server_name = server_name
    config.server_machine_id = request.server_id
    save_config(config)
    library_cache.clear()

    return {"success": True, "server_name": server_name, "server_url": server_url}


@router.get("/settings")
async def get_admin_settings(admin=Depends(require_admin)):
    """Get admin-controlled global settings."""
    config = load_config()
    return {
        "public_sharing_enabled": config.public_sharing_enabled,
        "giphy_global_enabled": config.giphy_global_enabled,
        "gifsicle_enabled": config.gifsicle_enabled,
        "gifsicle_lossy": config.gifsicle_lossy,
        "max_gif_duration_seconds": config.max_gif_duration_seconds,
        "max_width": config.max_width,
        "max_fps": config.max_fps,
    }


@router.put("/settings")
async def update_admin_settings(
    request: dict,
    admin=Depends(require_admin),
):
    """Update admin-controlled global settings."""
    config = load_config()
    if "public_sharing_enabled" in request:
        config.public_sharing_enabled = bool(request["public_sharing_enabled"])
    if "giphy_global_enabled" in request:
        config.giphy_global_enabled = bool(request["giphy_global_enabled"])
    if "gifsicle_enabled" in request:
        config.gifsicle_enabled = bool(request["gifsicle_enabled"])
    if "gifsicle_lossy" in request:
        config.gifsicle_lossy = max(0, min(200, int(request["gifsicle_lossy"])))
    if "max_gif_duration_seconds" in request:
        config.max_gif_duration_seconds = max(1, min(60, int(request["max_gif_duration_seconds"])))
    if "max_width" in request:
        config.max_width = max(100, min(640, int(request["max_width"])))
    if "max_fps" in request:
        config.max_fps = max(5, min(15, int(request["max_fps"])))
    save_config(config)
    return {
        "public_sharing_enabled": config.public_sharing_enabled,
        "giphy_global_enabled": config.giphy_global_enabled,
        "gifsicle_enabled": config.gifsicle_enabled,
        "gifsicle_lossy": config.gifsicle_lossy,
        "max_gif_duration_seconds": config.max_gif_duration_seconds,
        "max_width": config.max_width,
        "max_fps": config.max_fps,
    }


@router.get("/cache/stats", response_model=LibraryCacheStats)
async def get_cache_stats(admin=Depends(require_admin)):
    """Get library cache statistics."""
    return library_cache.get_stats()


@router.delete("/cache/disk")
async def clear_disk_cache(admin=Depends(require_admin)):
    """Clear all cached files on disk (thumbnails, frames, previews)."""
    library_cache.clear_disk_cache()
    return {"success": True}


@router.get("/stats")
async def get_gif_stats(
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get GIF creation statistics."""
    total_gifs = await db.scalar(
        select(func.count()).select_from(GifRecord).where(GifRecord.status == "complete")
    ) or 0
    total_size = await db.scalar(
        select(func.coalesce(func.sum(GifRecord.size_bytes), 0))
        .select_from(GifRecord)
        .where(GifRecord.status == "complete")
    ) or 0
    failed_gifs = await db.scalar(
        select(func.count()).select_from(GifRecord).where(GifRecord.status == "failed")
    ) or 0
    return {
        "total_gifs": total_gifs,
        "total_size_bytes": total_size,
        "failed_gifs": failed_gifs,
    }


@router.delete("/gifs")
async def delete_all_gifs(
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete every GIF record and its output file."""
    result = await db.execute(select(GifRecord.filename).where(GifRecord.filename.is_not(None)))
    filenames = [row for row in result.scalars().all() if row]
    deleted_files = 0
    for filename in filenames:
        output_path = OUTPUT_DIR / filename
        if output_path.exists():
            try:
                output_path.unlink()
                deleted_files += 1
            except OSError:
                pass
    delete_result = await db.execute(delete(GifRecord))
    await db.commit()
    return {
        "deleted_records": delete_result.rowcount or 0,
        "deleted_files": deleted_files,
    }


@router.get("/tasks", response_model=list[ScheduledTaskInfo])
async def list_tasks(admin=Depends(require_admin)):
    """List all scheduled tasks with current status."""
    tasks = await scheduler.get_all_tasks()
    return [
        ScheduledTaskInfo(
            id=t.id,
            name=t.name,
            description=t.description,
            interval_minutes=t.interval_minutes,
            enabled=t.enabled,
            status=t.status,
            last_run_at=t.last_run_at,
            next_run_at=t.next_run_at,
            last_error=t.last_error,
        )
        for t in tasks
    ]


@router.patch("/tasks/{task_id}", response_model=ScheduledTaskInfo)
async def update_task(
    task_id: str,
    body: ScheduledTaskUpdate,
    admin=Depends(require_admin),
):
    """Update a task's interval or enabled status."""
    try:
        task = await scheduler.update_task(task_id, body.interval_minutes, body.enabled)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ScheduledTaskInfo(
        id=task.id,
        name=task.name,
        description=task.description,
        interval_minutes=task.interval_minutes,
        enabled=task.enabled,
        status=task.status,
        last_run_at=task.last_run_at,
        next_run_at=task.next_run_at,
        last_error=task.last_error,
    )


@router.post("/tasks/{task_id}/run")
async def run_task_now(task_id: str, admin=Depends(require_admin)):
    """Trigger immediate execution of a scheduled task."""
    try:
        await scheduler.run_now(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"success": True}
