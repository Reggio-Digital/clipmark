from datetime import datetime
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class AppConfig(BaseModel):
    plex_token: str | None = None
    server_url: str | None = None
    server_name: str | None = None
    server_machine_id: str | None = None
    gifsicle_enabled: bool = True
    gifsicle_lossy: int = 100  # 0-200, higher = more compression
    public_sharing_enabled: bool = False  # Admin-controlled, off by default
    giphy_global_enabled: bool = True  # Admin-controlled, on by default
    max_gif_duration_seconds: int = 15
    max_width: int = 480
    max_fps: int = 10
    browse_page_size: int = 48


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total_items: int


class ServerConnection(BaseModel):
    uri: str
    local: bool


class Server(BaseModel):
    id: str
    name: str
    connections: list[ServerConnection]


class Library(BaseModel):
    id: str
    title: str
    type: str  # "movie" | "show"


class SearchResult(BaseModel):
    id: str
    title: str
    type: str  # "movie" | "show"
    year: int | None
    thumb_url: str


class MediaItem(BaseModel):
    id: str
    title: str
    type: str  # "movie" | "show" | "episode"
    thumb_url: str
    duration_ms: int | None = None
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None
    year: int | None = None
    added_at: str | None = None  # ISO datetime string


class ShowDetail(BaseModel):
    id: str
    title: str
    thumb_url: str
    year: int | None
    season_count: int


class Season(BaseModel):
    index: int
    title: str
    episode_count: int


class SubtitleTrack(BaseModel):
    index: int
    language: str
    title: str | None
    format: str  # "srt" | "ass" | "vtt" | "pgs" | "unknown"


class SubtitleLine(BaseModel):
    index: int
    start_ms: int
    end_ms: int
    text: str


class MediaDetail(BaseModel):
    id: str
    title: str
    type: str  # "movie" | "episode"
    thumb_url: str
    duration_ms: int
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None
    year: int | None = None
    subtitle_tracks: list[SubtitleTrack]


class GifCreate(BaseModel):
    media_id: str
    start_ms: int
    end_ms: int
    include_subtitles: bool = False
    subtitle_index: int | None = None
    custom_text: str | None = None  # Custom text to burn into GIF
    text_position: str | None = None  # "top", "center", "bottom" (default: bottom)
    text_size: str | None = None  # "small", "medium", "large" (default: medium)


class Gif(BaseModel):
    id: str
    user_id: str | None = None
    media_id: str
    media_title: str
    media_type: str | None = None
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None
    year: int | None = None
    start_ms: int
    end_ms: int
    width: int
    fps: int
    include_subtitles: bool
    subtitle_index: int | None
    custom_text: str | None = None
    text_position: str | None = None
    text_size: str | None = None
    status: str  # "queued" | "processing" | "complete" | "failed"
    progress: int  # 0-100
    filename: str | None = None
    size_bytes: int | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    giphy_id: str | None = None
    giphy_url: str | None = None
    uploaded_at: datetime | None = None
    public_token: str | None = None


class ShareResponse(BaseModel):
    public_token: str
    public_url: str


class PublicGif(BaseModel):
    media_title: str
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None
    year: int | None = None
    filename: str
    size_bytes: int | None = None
    start_ms: int
    end_ms: int
    created_at: datetime


class SharingSettings(BaseModel):
    enabled: bool


class SetupStatus(BaseModel):
    needs_setup: bool  # True if no admin user exists yet
    configured: bool  # True if Plex server is connected
    server_name: str | None = None


class AuthInitResponse(BaseModel):
    auth_url: str
    pin_id: str


class AuthCheckResponse(BaseModel):
    complete: bool
    token: str | None = None


class PreviewRequest(BaseModel):
    start_ms: int
    end_ms: int
    subtitle_index: int | None = None
    custom_text: str | None = None
    text_position: str | None = None
    text_size: str | None = None


class PreviewResponse(BaseModel):
    url: str


class GiphyConfigStatus(BaseModel):
    configured: bool


class GiphyUploadResponse(BaseModel):
    giphy_id: str
    giphy_url: str


# Multi-user auth schemas
class AuthStatus(BaseModel):
    authenticated: bool
    needs_setup: bool  # True if no admin user exists
    user: "UserInfo | None" = None


class UserInfo(BaseModel):
    id: str
    username: str
    email: str | None = None
    thumb: str | None = None
    role: str  # "admin" | "user"
    giphy_configured: bool = False


class PlexLoginRequest(BaseModel):
    pin_id: str


class PlexLoginResponse(BaseModel):
    success: bool
    needs_server_selection: bool = False
    servers: list[Server] | None = None
    user: UserInfo | None = None


class ServerSelectRequest(BaseModel):
    server_id: str
    connection_uri: str | None = None


class AdminUserInfo(BaseModel):
    id: str
    username: str
    email: str | None = None
    thumb: str | None = None
    role: str
    enabled: bool
    created_at: datetime
    last_login: datetime | None = None
    gif_count: int = 0


class AdminUserUpdate(BaseModel):
    enabled: bool | None = None
    role: str | None = None


class GifsicleSettings(BaseModel):
    enabled: bool
    lossy: int


class GifsicleSettingsUpdate(BaseModel):
    enabled: bool | None = None
    lossy: int | None = None


class ScheduledTaskInfo(BaseModel):
    id: str
    name: str
    description: str | None = None
    interval_minutes: int
    enabled: bool
    status: str  # "idle" | "running"
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    last_error: str | None = None


class ScheduledTaskUpdate(BaseModel):
    interval_minutes: int | None = None
    enabled: bool | None = None


class CachedLibraryInfo(BaseModel):
    id: str
    title: str
    type: str
    item_count: int


class LibraryCacheStats(BaseModel):
    populated: bool
    library_count: int
    total_items: int
    last_refreshed: str | None = None
    refresh_status: str | None = None
    disk_usage_bytes: int = 0
    libraries: list[CachedLibraryInfo]


class FavoriteCreate(BaseModel):
    media_id: str
    media_type: str  # "movie" | "show" | "episode"
    media_title: str
    thumb_url: str
    year: int | None = None
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None


class FavoriteResponse(BaseModel):
    id: str
    user_id: str
    media_id: str
    media_type: str
    media_title: str
    thumb_url: str
    year: int | None = None
    show_title: str | None = None
    season: int | None = None
    episode: int | None = None
    created_at: datetime
