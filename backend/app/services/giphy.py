import httpx
from app.config import OUTPUT_DIR

GIPHY_UPLOAD_URL = "https://upload.giphy.com/v1/gifs"
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB


class GiphyError(Exception):
    """Custom exception for Giphy API errors."""
    pass


async def upload_gif_to_giphy(
    filename: str,
    api_key: str,
    tags: list[str] | None = None,
) -> tuple[str, str]:
    """
    Upload a GIF to Giphy using the provided API key.

    Args:
        filename: The filename of the GIF in OUTPUT_DIR
        api_key: The user's Giphy API key
        tags: Optional list of tags for the GIF

    Returns:
        Tuple of (giphy_id, giphy_url)

    Raises:
        GiphyError: If upload fails
    """
    if not api_key:
        raise GiphyError("Giphy API key not configured")

    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise GiphyError(f"GIF file not found: {filename}")

    file_size = file_path.stat().st_size
    if file_size > MAX_FILE_SIZE_BYTES:
        raise GiphyError(f"File too large ({file_size} bytes). Maximum is 100MB.")

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "image/gif")}
            data = {"api_key": api_key}
            if tags:
                data["tags"] = ",".join(tags)

            response = await client.post(
                GIPHY_UPLOAD_URL,
                files=files,
                data=data,
            )

    if response.status_code != 200:
        try:
            error_data = response.json()
            error_msg = error_data.get("message", error_data.get("meta", {}).get("msg", "Unknown error"))
        except Exception:
            error_msg = f"HTTP {response.status_code}"
        raise GiphyError(f"Giphy upload failed: {error_msg}")

    result = response.json()
    giphy_id = result["data"]["id"]
    giphy_url = f"https://giphy.com/gifs/{giphy_id}"

    return giphy_id, giphy_url
