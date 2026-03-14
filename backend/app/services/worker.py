import asyncio
import logging
from datetime import datetime
from sqlalchemy import select, update
from app.database import async_session
from app.models.db import GifRecord
from app.services.gif import generate_gif
from app.config import MAX_CONCURRENT_JOBS

logger = logging.getLogger(__name__)


class GifWorker:
    def __init__(self):
        self.running = False
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
        self.tasks: set[asyncio.Task] = set()

    async def start(self):
        self.running = True
        await self._recover_interrupted_jobs()
        asyncio.create_task(self._poll_loop())

    async def _recover_interrupted_jobs(self):
        async with async_session() as session:
            result = await session.execute(
                update(GifRecord)
                .where(GifRecord.status == "processing")
                .values(status="queued", progress=0)
            )
            if result.rowcount > 0:
                await session.commit()
                logger.info("Re-queued %d interrupted jobs from previous run", result.rowcount)

    async def stop(self):
        self.running = False
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)

    async def _poll_loop(self):
        while self.running:
            await self._check_for_jobs()
            await asyncio.sleep(1)

    async def _check_for_jobs(self):
        # Only check for jobs if we have capacity
        if self.semaphore.locked():
            return

        async with async_session() as session:
            result = await session.execute(
                select(GifRecord)
                .where(GifRecord.status == "queued")
                .order_by(GifRecord.created_at)
                .limit(1)
            )
            job = result.scalar_one_or_none()
            if job:
                job.status = "processing"
                await session.commit()
                # Create task that will acquire semaphore for actual work
                task = asyncio.create_task(self._process_job(job.id))
                self.tasks.add(task)
                task.add_done_callback(self.tasks.discard)

    async def _process_job(self, gif_id: str):
        # Acquire semaphore to limit concurrent FFmpeg processes
        async with self.semaphore:
            async with async_session() as session:
                result = await session.execute(
                    select(GifRecord).where(GifRecord.id == gif_id)
                )
                job = result.scalar_one_or_none()
                if not job:
                    return

                try:
                    async def update_progress(progress: int):
                        async with async_session() as s:
                            await s.execute(
                                update(GifRecord)
                                .where(GifRecord.id == gif_id)
                                .values(progress=progress)
                            )
                            await s.commit()

                    filename, size_bytes = await generate_gif(
                        gif_id=gif_id,
                        user_id=job.user_id,
                        media_id=job.media_id,
                        start_ms=job.start_ms,
                        end_ms=job.end_ms,
                        width=job.width,
                        fps=job.fps,
                        include_subtitles=bool(job.include_subtitles),
                        subtitle_index=job.subtitle_index,
                        custom_text=job.custom_text,
                        text_position=job.text_position,
                        text_size=job.text_size,
                        progress_callback=update_progress,
                    )
                    job.status = "complete"
                    job.filename = filename
                    job.size_bytes = size_bytes
                    job.progress = 100
                    job.completed_at = datetime.utcnow()
                except TimeoutError as e:
                    job.status = "failed"
                    job.error = str(e)
                    logger.warning("GIF %s timed out: %s", gif_id, e)
                except Exception as e:
                    job.status = "failed"
                    error_msg = str(e)
                    if "No such file" in error_msg:
                        job.error = "Media file not accessible. Check Plex server connection."
                    elif "FFmpeg" in error_msg or "ffmpeg" in error_msg:
                        job.error = f"FFmpeg error: {error_msg}"
                    else:
                        job.error = error_msg
                    logger.error("GIF %s failed: %s", gif_id, e)

                await session.commit()


worker = GifWorker()
