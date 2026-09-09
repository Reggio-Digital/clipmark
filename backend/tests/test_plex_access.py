import pytest

from app.services import plex
from app.services.cache import (
    get_frame_cache_path, get_preview_cache_path, get_thumbnail_cache_path,
    get_subtitle_cache_path, get_media_detail_cache_path,
)


def test_resource_token_and_configured_server_are_used(plex_api):
    server = plex.get_user_plex_server("server-guest", "server-1")
    assert server._token == "server-guest"
    assert server._baseurl == "http://plex.test:32400"
    assert [library.id for library in plex.get_libraries(server)] == ["1", "3"]


@pytest.mark.parametrize("sort,expected", [("added", ["11", "10"]), ("alpha", ["11", "10"]), ("year", ["11", "10"])])
def test_library_sort_and_pagination_use_visible_items(plex_api, sort, expected):
    server = plex.get_user_plex_server("server-guest", "server-1")
    first, total = plex.get_library_items(server, "1", 1, 1, sort)
    second, _ = plex.get_library_items(server, "1", 2, 1, sort)
    empty, _ = plex.get_library_items(server, "1", 3, 1, sort)
    assert [first[0].id, second[0].id] == expected
    assert total == 2
    assert empty == []


@pytest.mark.parametrize("factory,args", [
    (get_frame_cache_path, ("10", 0, 320)), (get_preview_cache_path, ("10", 0, 2000)),
    (get_thumbnail_cache_path, ("10",)), (get_subtitle_cache_path, ("10", 1)),
    (get_media_detail_cache_path, ("10",)),
])
def test_cache_keys_separate_servers_even_for_identical_media_ids(factory, args):
    first = factory(*args, server_id="server-1")
    second = factory(*args, server_id="server-2")
    assert first != second
    assert first.parent == second.parent
