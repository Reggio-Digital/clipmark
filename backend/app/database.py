from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.config import DATABASE_FILE
from app.models.db import Base

DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_FILE}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration: add new columns to gifs if they don't exist
        result = await conn.execute(text("PRAGMA table_info(gifs)"))
        columns = [row[1] for row in result.fetchall()]
        if "custom_text" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN custom_text TEXT"))
        if "media_type" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN media_type TEXT"))
        if "show_title" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN show_title TEXT"))
        if "season" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN season INTEGER"))
        if "episode" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN episode INTEGER"))
        if "year" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN year INTEGER"))
        if "giphy_id" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN giphy_id TEXT"))
        if "giphy_url" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN giphy_url TEXT"))
        if "uploaded_at" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN uploaded_at DATETIME"))
        if "text_position" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN text_position TEXT"))
        if "text_size" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN text_size TEXT"))
        if "user_id" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN user_id TEXT"))
        if "public_token" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN public_token TEXT"))
            await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_gifs_public_token ON gifs(public_token)"))
        if "imdb_id" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN imdb_id TEXT"))
        if "tvdb_id" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN tvdb_id TEXT"))
        if "tmdb_id" not in columns:
            await conn.execute(text("ALTER TABLE gifs ADD COLUMN tmdb_id TEXT"))

        # Migration: add season/episode columns to favorites if they don't exist
        result = await conn.execute(text("PRAGMA table_info(favorites)"))
        fav_columns = [row[1] for row in result.fetchall()]
        if "season" not in fav_columns:
            await conn.execute(text("ALTER TABLE favorites ADD COLUMN season INTEGER"))
        if "episode" not in fav_columns:
            await conn.execute(text("ALTER TABLE favorites ADD COLUMN episode INTEGER"))


async def get_db():
    async with async_session() as session:
        yield session
