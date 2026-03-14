import json
import time
import httpx
from plexapi.myplex import MyPlexAccount, MyPlexPinLogin
from plexapi.server import PlexServer
from plexapi.video import Movie, Episode, Show
from plexapi.library import MovieSection, ShowSection
from app.config import CONFIG_FILE
from app.models.schemas import (
    AppConfig,
    Server,
    ServerConnection,
    Library,
    MediaItem,
    MediaDetail,
    ShowDetail,
    Season,
    SubtitleTrack,
    SearchResult,
)


_pending_oauth: dict[str, tuple[MyPlexPinLogin, float]] = {}
_OAUTH_TTL = 600
_OAUTH_MAX_SIZE = 100


def _cleanup_pending_oauth() -> None:
    now = time.monotonic()
    expired = [k for k, (_, ts) in _pending_oauth.items() if now - ts > _OAUTH_TTL]
    for k in expired:
        del _pending_oauth[k]
    if len(_pending_oauth) >= _OAUTH_MAX_SIZE:
        oldest = min(_pending_oauth, key=lambda k: _pending_oauth[k][1])
        del _pending_oauth[oldest]


def load_config() -> AppConfig:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            data = json.load(f)
            return AppConfig(**data)
    return AppConfig()


def save_config(config: AppConfig) -> None:
    with open(CONFIG_FILE, "w") as f:
        json.dump(config.model_dump(), f, indent=2)


def get_plex_server() -> PlexServer | None:
    config = load_config()
    if not config.plex_token or not config.server_url:
        return None
    return PlexServer(config.server_url, config.plex_token)


def initiate_oauth() -> tuple[str, str]:
    """Start Plex OAuth flow. Returns (auth_url, pin_id)."""
    _cleanup_pending_oauth()
    pin_login = MyPlexPinLogin(oauth=True)
    pin_login.run(timeout=300)
    auth_url = pin_login.oauthUrl()
    pin_id = str(pin_login._id)
    _pending_oauth[pin_id] = (pin_login, time.monotonic())
    return auth_url, pin_id


def check_oauth(pin_id: str) -> str | None:
    """Check if OAuth is complete. Returns token if done, None otherwise."""
    entry = _pending_oauth.get(pin_id)
    if not entry:
        return None
    pin_login, ts = entry
    if time.monotonic() - ts > _OAUTH_TTL:
        _pending_oauth.pop(pin_id, None)
        return None
    if pin_login.finished and pin_login.token:
        token = pin_login.token
        _pending_oauth.pop(pin_id, None)
        return token
    return None


def get_plex_account_info(token: str) -> dict:
    account = MyPlexAccount(token=token)
    return {
        "id": str(account.id),
        "username": account.username or account.title,
        "email": account.email,
        "thumb": getattr(account, "thumb", None),
    }


def get_available_servers(token: str) -> list[Server]:
    account = MyPlexAccount(token=token)
    servers = []
    for resource in account.resources():
        if resource.provides == "server":
            connections = []
            for conn in resource.connections:
                connections.append(ServerConnection(uri=conn.uri, local=conn.local))
            servers.append(Server(
                id=resource.clientIdentifier,
                name=resource.name,
                connections=connections,
            ))
    return servers


def user_has_server_access(user_plex_token: str, server_machine_id: str) -> bool:
    try:
        account = MyPlexAccount(token=user_plex_token)
        for resource in account.resources():
            if resource.provides == "server" and resource.clientIdentifier == server_machine_id:
                return True
        return False
    except Exception:
        return False


def connect_to_server(token: str, server_id: str, connection_uri: str | None = None) -> tuple[str, str]:
    account = MyPlexAccount(token=token)
    for resource in account.resources():
        if resource.clientIdentifier == server_id and resource.provides == "server":
            if connection_uri:
                server = PlexServer(connection_uri, token)
                return connection_uri, resource.name
            else:
                server = resource.connect()
                return server._baseurl, resource.name
    raise ValueError(f"Server {server_id} not found")


def get_libraries(server: PlexServer) -> list[Library]:
    libraries = []
    for section in server.library.sections():
        if isinstance(section, MovieSection):
            libraries.append(Library(id=str(section.key), title=section.title, type="movie"))
        elif isinstance(section, ShowSection):
            libraries.append(Library(id=str(section.key), title=section.title, type="show"))
    return libraries


PLEX_SORT_MAP = {
    "added": "addedAt:desc",
    "alpha": "titleSort:asc",
    "year": "year:desc",
}


def get_library_items(
    server: PlexServer, library_id: str, page: int = 1, page_size: int = 50,
    sort: str = "added",
) -> tuple[list[MediaItem], int]:
    section = server.library.sectionByID(int(library_id))
    plex_sort = PLEX_SORT_MAP.get(sort, "addedAt:desc")
    start = (page - 1) * page_size
    results = section.all(sort=plex_sort, container_start=start, container_size=page_size)
    total = section.totalViewSize if hasattr(section, 'totalViewSize') else section.totalSize
    items = []
    for item in results:
        if isinstance(item, Movie):
            items.append(
                MediaItem(
                    id=str(item.ratingKey),
                    title=item.title,
                    type="movie",
                    thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
                    duration_ms=item.duration if item.duration else None,
                    year=item.year,
                    added_at=item.addedAt.isoformat() if item.addedAt else None,
                )
            )
        elif isinstance(item, Show):
            items.append(
                MediaItem(
                    id=str(item.ratingKey),
                    title=item.title,
                    type="show",
                    thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
                    year=item.year,
                    added_at=item.addedAt.isoformat() if item.addedAt else None,
                )
            )
    return items, total


def get_show_detail(server: PlexServer, show_id: str) -> ShowDetail:
    show = server.fetchItem(int(show_id))
    if not isinstance(show, Show):
        raise ValueError(f"Item {show_id} is not a show")
    return ShowDetail(
        id=str(show.ratingKey),
        title=show.title,
        thumb_url=f"/api/media/{show.ratingKey}/thumbnail",
        year=show.year,
        season_count=len(show.seasons()),
    )


def get_show_seasons(server: PlexServer, show_id: str) -> list[Season]:
    show = server.fetchItem(int(show_id))
    if not isinstance(show, Show):
        raise ValueError(f"Item {show_id} is not a show")
    seasons = []
    for season in sorted(show.seasons(), key=lambda s: s.index):
        seasons.append(
            Season(
                index=season.index,
                title=season.title,
                episode_count=len(season.episodes()),
            )
        )
    return seasons


def get_show_episodes(
    server: PlexServer, show_id: str, season_index: int, page: int = 1, page_size: int = 50
) -> tuple[list[MediaItem], int]:
    show = server.fetchItem(int(show_id))
    if not isinstance(show, Show):
        raise ValueError(f"Item {show_id} is not a show")
    season = None
    for s in show.seasons():
        if s.index == season_index:
            season = s
            break
    if not season:
        raise ValueError(f"Season {season_index} not found")
    all_episodes = sorted(season.episodes(), key=lambda e: e.index)
    total = len(all_episodes)
    start = (page - 1) * page_size
    end = start + page_size
    items = []
    for ep in all_episodes[start:end]:
        items.append(
            MediaItem(
                id=str(ep.ratingKey),
                title=ep.title,
                type="episode",
                thumb_url=f"/api/media/{ep.ratingKey}/thumbnail",
                duration_ms=ep.duration if ep.duration else None,
                show_title=show.title,
                season=ep.parentIndex,
                episode=ep.index,
            )
        )
    return items, total


def get_media_detail(server: PlexServer, media_id: str) -> MediaDetail:
    item = server.fetchItem(int(media_id))
    subtitle_tracks = []
    if hasattr(item, "media") and item.media:
        for media in item.media:
            for part in media.parts:
                for stream in part.streams:
                    if stream.streamType == 3:
                        codec = getattr(stream, "codec", "unknown")
                        format_map = {
                            "srt": "srt",
                            "ass": "ass",
                            "ssa": "ass",
                            "webvtt": "vtt",
                            "vtt": "vtt",
                            "pgs": "pgs",
                            "dvd_subtitle": "pgs",
                        }
                        fmt = format_map.get(codec.lower() if codec else "", "unknown")
                        subtitle_tracks.append(
                            SubtitleTrack(
                                index=stream.index,
                                language=getattr(stream, "language", "Unknown") or "Unknown",
                                title=getattr(stream, "title", None),
                                format=fmt,
                            )
                        )
    if isinstance(item, Movie):
        return MediaDetail(
            id=str(item.ratingKey),
            title=item.title,
            type="movie",
            thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
            duration_ms=item.duration or 0,
            year=getattr(item, "year", None),
            subtitle_tracks=subtitle_tracks,
        )
    elif isinstance(item, Episode):
        return MediaDetail(
            id=str(item.ratingKey),
            title=item.title,
            type="episode",
            thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
            duration_ms=item.duration or 0,
            show_title=item.grandparentTitle,
            season=item.parentIndex,
            episode=item.index,
            year=getattr(item, "year", None),
            subtitle_tracks=subtitle_tracks,
        )
    raise ValueError(f"Item {media_id} is not a movie or episode")


def search_media(
    server: PlexServer,
    query: str,
    library_id: str | None = None,
    type_filter: str | None = None,
    limit: int = 25,
) -> list[SearchResult]:
    results = []
    if library_id:
        section = server.library.sectionByID(int(library_id))
        search_results = section.search(query, limit=limit)
    else:
        search_results = server.library.search(query, limit=limit)
    for item in search_results:
        if isinstance(item, Movie):
            if type_filter and type_filter != "movie":
                continue
            results.append(
                SearchResult(
                    id=str(item.ratingKey),
                    title=item.title,
                    type="movie",
                    year=item.year,
                    thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
                )
            )
        elif isinstance(item, Show):
            if type_filter and type_filter != "show":
                continue
            results.append(
                SearchResult(
                    id=str(item.ratingKey),
                    title=item.title,
                    type="show",
                    year=item.year,
                    thumb_url=f"/api/media/{item.ratingKey}/thumbnail",
                )
            )
        if len(results) >= limit:
            break
    return results


def get_thumbnail_url(server: PlexServer, media_id: str) -> str | None:
    item = server.fetchItem(int(media_id))
    if hasattr(item, "thumb") and item.thumb:
        return server.url(item.thumb, includeToken=True)
    return None


def get_media_stream_url(server: PlexServer, media_id: str) -> str | None:
    item = server.fetchItem(int(media_id))
    if hasattr(item, "media") and item.media:
        for media in item.media:
            for part in media.parts:
                return server.url(part.key, includeToken=True)
    return None


def get_subtitle_stream_url(server: PlexServer, media_id: str, subtitle_index: int) -> str | None:
    item = server.fetchItem(int(media_id))
    if hasattr(item, "media") and item.media:
        for media in item.media:
            for part in media.parts:
                for stream in part.streams:
                    if stream.streamType == 3 and stream.index == subtitle_index:
                        if hasattr(stream, "key") and stream.key:
                            return server.url(stream.key, includeToken=True)
    return None
