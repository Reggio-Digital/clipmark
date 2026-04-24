import os
from pathlib import Path

VERSION = "1.0.0"

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
CONFIG_FILE = DATA_DIR / "config.json"
DATABASE_FILE = DATA_DIR / "clipmark.db"
OUTPUT_DIR = DATA_DIR / "output"
WORK_DIR = DATA_DIR / "work"
CACHE_DIR = DATA_DIR / "cache"
CACHE_SUBDIRS = ("frames", "previews", "thumbnails", "subtitles")
FRAMES_CACHE_DIR = CACHE_DIR / "frames"
PREVIEWS_CACHE_DIR = CACHE_DIR / "previews"
THUMBNAILS_CACHE_DIR = CACHE_DIR / "thumbnails"
SUBTITLES_CACHE_DIR = CACHE_DIR / "subtitles"

MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "1"))
MAX_QUEUED_JOBS = int(os.getenv("MAX_QUEUED_JOBS", "10"))
MAX_QUEUED_JOBS_PER_USER = int(os.getenv("MAX_QUEUED_JOBS_PER_USER", "3"))
MAX_GIF_DURATION_SECONDS = int(os.getenv("MAX_GIF_DURATION_SECONDS", "15"))
MAX_PREVIEW_DURATION_SECONDS = int(os.getenv("MAX_PREVIEW_DURATION_SECONDS", "10"))
MAX_WIDTH = int(os.getenv("MAX_WIDTH", "480"))
MAX_FPS = int(os.getenv("MAX_FPS", "10"))
FRAME_CACHE_TTL_MINUTES = int(os.getenv("FRAME_CACHE_TTL_MINUTES", "30"))
PREVIEW_CACHE_TTL_MINUTES = int(os.getenv("PREVIEW_CACHE_TTL_MINUTES", "30"))
FAILED_WORKSPACE_TTL_HOURS = int(os.getenv("FAILED_WORKSPACE_TTL_HOURS", "24"))
FFMPEG_TIMEOUT_SECONDS = int(os.getenv("FFMPEG_TIMEOUT_SECONDS", "300"))  # 5 minutes default

for dir_path in [DATA_DIR, OUTPUT_DIR, WORK_DIR, FRAMES_CACHE_DIR, PREVIEWS_CACHE_DIR, THUMBNAILS_CACHE_DIR, SUBTITLES_CACHE_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)
