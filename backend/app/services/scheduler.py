import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.database import async_session
from app.models.db import ScheduledTask

logger = logging.getLogger(__name__)

# Registry: maps task_id -> async callable
_task_registry: dict[str, Callable] = {}


def register_task(task_id: str, func: Callable) -> None:
    """Register an async callable for a task ID."""
    _task_registry[task_id] = func


TASK_DEFAULTS = [
    {
        "id": "library_cache_refresh",
        "name": "Library Cache Refresh",
        "description": "Refreshes cached Plex library and item data",
        "interval_minutes": 1440,
        "enabled": True,
    },
    {
        "id": "cache_cleanup",
        "name": "Cache Cleanup",
        "description": "Removes expired frame/preview cache files and abandoned workspaces",
        "interval_minutes": 360,
        "enabled": True,
    },
    {
        "id": "session_cleanup",
        "name": "Session Cleanup",
        "description": "Removes expired user sessions from the database",
        "interval_minutes": 1440,
        "enabled": True,
    },
]


class TaskScheduler:
    def __init__(self) -> None:
        self.running = False

    async def seed_tasks(self) -> None:
        """Insert default task rows if they don't exist."""
        async with async_session() as db:
            for task_def in TASK_DEFAULTS:
                result = await db.execute(
                    select(ScheduledTask).where(ScheduledTask.id == task_def["id"])
                )
                if not result.scalar_one_or_none():
                    now = datetime.utcnow()
                    task = ScheduledTask(
                        **task_def,
                        status="idle",
                        created_at=now,
                        next_run_at=now,  # Run immediately on first startup
                    )
                    db.add(task)
            await db.commit()

    async def start(self) -> None:
        self.running = True
        await self.seed_tasks()
        await self._reset_stale_running()
        asyncio.create_task(self._poll_loop())

    async def _reset_stale_running(self) -> None:
        """Reset any tasks stuck in 'running' from a previous crash."""
        async with async_session() as db:
            result = await db.execute(
                update(ScheduledTask)
                .where(ScheduledTask.status == "running")
                .values(status="idle")
            )
            if result.rowcount:
                logger.info("Reset %d stale running task(s) to idle", result.rowcount)
            await db.commit()

    async def stop(self) -> None:
        self.running = False

    async def _poll_loop(self) -> None:
        while self.running:
            try:
                await self._check_tasks()
            except Exception:
                logger.exception("Error checking scheduled tasks")
            await asyncio.sleep(10)

    async def _check_tasks(self) -> None:
        now = datetime.utcnow()
        async with async_session() as db:
            result = await db.execute(
                select(ScheduledTask).where(
                    ScheduledTask.enabled == True,
                    ScheduledTask.status == "idle",
                    ScheduledTask.next_run_at <= now,
                )
            )
            due_tasks = result.scalars().all()

        for task in due_tasks:
            if task.id in _task_registry:
                await self._run_task(task.id)

    async def _run_task(self, task_id: str) -> None:
        func = _task_registry.get(task_id)
        if not func:
            return

        # Mark as running
        async with async_session() as db:
            await db.execute(
                update(ScheduledTask)
                .where(ScheduledTask.id == task_id)
                .values(status="running")
            )
            await db.commit()

        # Execute the task
        try:
            await func()
            error = None
        except Exception as e:
            logger.exception("Task %s failed", task_id)
            error = str(e)

        # Update status, timestamps, and schedule next run
        now = datetime.utcnow()
        async with async_session() as db:
            result = await db.execute(
                select(ScheduledTask).where(ScheduledTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task:
                task.status = "idle"
                task.last_run_at = now
                task.last_error = error
                task.next_run_at = now + timedelta(minutes=task.interval_minutes)
                await db.commit()

    async def run_now(self, task_id: str) -> None:
        """Trigger immediate execution of a task (called from API)."""
        if task_id not in _task_registry:
            raise ValueError(f"Unknown task: {task_id}")
        await self._run_task(task_id)

    async def get_all_tasks(self) -> list[ScheduledTask]:
        async with async_session() as db:
            result = await db.execute(
                select(ScheduledTask).order_by(ScheduledTask.name)
            )
            return list(result.scalars().all())

    async def update_task(
        self, task_id: str, interval_minutes: int | None, enabled: bool | None
    ) -> ScheduledTask:
        async with async_session() as db:
            result = await db.execute(
                select(ScheduledTask).where(ScheduledTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if not task:
                raise ValueError(f"Task not found: {task_id}")
            if interval_minutes is not None:
                task.interval_minutes = interval_minutes
                base = task.last_run_at or datetime.utcnow()
                task.next_run_at = base + timedelta(minutes=interval_minutes)
            if enabled is not None:
                task.enabled = enabled
            await db.commit()
            await db.refresh(task)
            return task


scheduler = TaskScheduler()
