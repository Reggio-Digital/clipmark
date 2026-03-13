import asyncio
import shutil
from pathlib import Path
from app.config import OUTPUT_DIR, WORK_DIR, FFMPEG_TIMEOUT_SECONDS
from app.services.plex import get_plex_server, get_media_stream_url, get_subtitle_stream_url, get_media_detail, load_config
from app.services.subtitles import download_subtitle, extract_embedded_subtitle, offset_srt_content, srt_to_ass


async def run_ffmpeg_with_timeout(cmd: list[str], timeout: int = FFMPEG_TIMEOUT_SECONDS) -> tuple[bytes, bytes]:
    """Run FFmpeg command with timeout. Raises TimeoutError if exceeded."""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        return stdout, stderr
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError(f"FFmpeg command timed out after {timeout} seconds")


async def optimize_gif(gif_path: Path, lossy: int = 80) -> bool:
    """Optimize GIF using gifsicle. Returns True if successful."""
    try:
        # Check if gifsicle is available
        check = await asyncio.create_subprocess_exec(
            "which", "gifsicle",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await check.communicate()
        if check.returncode != 0:
            return False

        # Run gifsicle optimization in-place
        # --optimize=3: maximum optimization
        # --lossy: lossy compression (lower = more compression, 80 is good balance)
        process = await asyncio.create_subprocess_exec(
            "gifsicle",
            "--optimize=3",
            f"--lossy={lossy}",
            "-b",  # batch mode (modify in place)
            str(gif_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(process.communicate(), timeout=60)
        return process.returncode == 0
    except Exception:
        return False


def escape_drawtext(text: str) -> str:
    """Escape text for FFmpeg drawtext filter."""
    # Escape special characters for FFmpeg drawtext
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "'\\''")
    text = text.replace(":", "\\:")
    text = text.replace("%", "\\%")
    return text


def get_fontsize(width: int, size: str | None) -> int:
    """Calculate font size based on width and size preference."""
    base = max(16, width // 20)  # Default medium
    if size == "small":
        return max(12, int(base * 0.7))
    elif size == "large":
        return int(base * 1.4)
    return base  # medium or None


def get_text_y_position(position: str | None) -> tuple[str, int]:
    """Get FFmpeg y expression and ASS alignment for text position.
    Returns (y_expr for drawtext, alignment for ASS subtitles)."""
    if position == "top":
        return "20", 8  # ASS Alignment 8 = top-center
    elif position == "center":
        return "(h-th)/2", 5  # ASS Alignment 5 = middle-center
    else:  # bottom (default)
        return "h-th-20", 2  # ASS Alignment 2 = bottom-center


def get_subtitle_style(width: int, position: str | None = None, size: str | None = None) -> str:
    """Generate ASS force_style string to match drawtext appearance."""
    fontsize = get_fontsize(width, size)

    # ASS alignment: 1-3 bottom, 4-6 middle, 7-9 top (center column is 2,5,8)
    # MarginV is always distance from the edge corresponding to alignment
    if position == "top":
        alignment = 8  # top-center
        margin_v = 20
    elif position == "center":
        alignment = 5  # middle-center
        margin_v = 0
    else:  # bottom (default)
        alignment = 2  # bottom-center
        margin_v = 20

    # ASS color format: &HAABBGGRR (AA=alpha 00=opaque, BGR order)
    # White = &H00FFFFFF, Black = &H00000000
    return (
        f"FontSize={fontsize},"
        f"PrimaryColour=&H00FFFFFF,"
        f"OutlineColour=&H00000000,"
        f"BorderStyle=1,"
        f"Outline=2,"
        f"Shadow=0,"
        f"Alignment={alignment},"
        f"MarginV={margin_v}"
    )


async def generate_gif(
    gif_id: str,
    user_id: str,
    media_id: str,
    start_ms: int,
    end_ms: int,
    width: int,
    fps: int,
    include_subtitles: bool,
    subtitle_index: int | None,
    custom_text: str | None,
    text_position: str | None,
    text_size: str | None,
    progress_callback,
) -> tuple[str, int]:
    """Generate a GIF from media. Returns (filename, size_bytes)."""
    config = load_config()
    width = min(width, config.max_width)
    fps = min(fps, config.max_fps)
    work_dir = WORK_DIR / gif_id
    work_dir.mkdir(parents=True, exist_ok=True)
    server = get_plex_server()
    if not server:
        raise ValueError("Plex server not configured")
    media_url = get_media_stream_url(server, media_id)
    if not media_url:
        raise ValueError("Could not get media stream URL")
    start_sec = start_ms / 1000.0
    duration_sec = (end_ms - start_ms) / 1000.0
    palette_path = work_dir / "palette.png"
    user_output_dir = OUTPUT_DIR / user_id
    user_output_dir.mkdir(parents=True, exist_ok=True)
    output_filename = f"{user_id}/{gif_id}.gif"
    output_path = user_output_dir / f"{gif_id}.gif"
    filters = f"fps={fps},scale={width}:-1:flags=lanczos"
    text_filter = ""

    # Handle custom text
    if custom_text:
        escaped_text = escape_drawtext(custom_text)
        fontsize = get_fontsize(width, text_size)
        y_expr, _ = get_text_y_position(text_position)
        text_filter = (
            f",drawtext=text='{escaped_text}'"
            f":fontsize={fontsize}"
            f":fontcolor=white"
            f":borderw=2"
            f":bordercolor=black"
            f":x=(w-text_w)/2"
            f":y={y_expr}"
        )
    # Handle subtitle burn-in
    elif include_subtitles and subtitle_index is not None:
        sub_content = None
        # Try external subtitle URL first
        sub_url = get_subtitle_stream_url(server, media_id, subtitle_index)
        if sub_url:
            sub_content = await download_subtitle(sub_url)
        # Fall back to FFmpeg extraction for embedded subtitles
        if not sub_content:
            # Find the FFmpeg stream index for this subtitle track
            subtitle_stream_index = 0
            item = server.fetchItem(int(media_id))
            if hasattr(item, "media") and item.media:
                for m in item.media:
                    for part in m.parts:
                        sub_idx = 0
                        for stream in part.streams:
                            if stream.streamType == 3:  # Subtitle stream
                                if stream.index == subtitle_index:
                                    subtitle_stream_index = sub_idx
                                    break
                                sub_idx += 1
            sub_content = await extract_embedded_subtitle(
                media_url, subtitle_stream_index, work_dir
            )
        if sub_content:
            # Offset subtitle timestamps to match clip (FFmpeg -ss seeks to time 0)
            offset_content = offset_srt_content(sub_content, start_ms, end_ms)
            if offset_content:
                # Get style parameters
                fontsize = get_fontsize(width, text_size)
                if text_position == "top":
                    alignment = 8
                    margin_v = 20
                elif text_position == "center":
                    alignment = 5
                    margin_v = 0
                else:
                    alignment = 2
                    margin_v = 20
                # Convert to ASS with positioning baked in
                ass_content = srt_to_ass(offset_content, fontsize, alignment, margin_v)
                if ass_content:
                    sub_file = work_dir / "subtitles.ass"
                    sub_file.write_text(ass_content)
                    escaped_path = str(sub_file).replace(":", "\\:").replace("\\", "/")
                    text_filter = f",subtitles='{escaped_path}'"
    palette_cmd = [
        "ffmpeg",
        "-ss",
        str(start_sec),
        "-t",
        str(duration_sec),
        "-i",
        media_url,
        "-vf",
        f"{filters}{text_filter},palettegen=stats_mode=diff",
        "-y",
        str(palette_path),
    ]
    await progress_callback(10)
    await run_ffmpeg_with_timeout(palette_cmd)
    if not palette_path.exists():
        raise ValueError("Failed to generate palette")
    await progress_callback(30)
    gif_cmd = [
        "ffmpeg",
        "-ss",
        str(start_sec),
        "-t",
        str(duration_sec),
        "-i",
        media_url,
        "-i",
        str(palette_path),
        "-lavfi",
        f"{filters}{text_filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5",
        "-y",
        "-progress",
        "pipe:1",
        str(output_path),
    ]
    process = await asyncio.create_subprocess_exec(
        *gif_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    total_frames = int(duration_sec * fps)
    try:
        async def read_progress():
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                line_str = line.decode().strip()
                if line_str.startswith("frame="):
                    try:
                        frame = int(line_str.split("=")[1])
                        progress = 30 + int((frame / max(total_frames, 1)) * 65)
                        await progress_callback(min(progress, 95))
                    except ValueError:
                        pass
            await process.wait()

        await asyncio.wait_for(read_progress(), timeout=FFMPEG_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError(f"GIF generation timed out after {FFMPEG_TIMEOUT_SECONDS} seconds")
    if not output_path.exists():
        raise ValueError("Failed to generate GIF")
    # Optimize with gifsicle if enabled
    config = load_config()
    if config.gifsicle_enabled:
        await optimize_gif(output_path, config.gifsicle_lossy)
    await progress_callback(100)
    size_bytes = output_path.stat().st_size
    shutil.rmtree(work_dir, ignore_errors=True)
    return output_filename, size_bytes


async def generate_frame(media_id: str, ts_ms: int, width: int = 320) -> bytes | None:
    """Generate a single frame from media at the given timestamp."""
    server = get_plex_server()
    if not server:
        return None
    media_url = get_media_stream_url(server, media_id)
    if not media_url:
        return None
    ts_sec = ts_ms / 1000.0
    cmd = [
        "ffmpeg",
        "-ss",
        str(ts_sec),
        "-i",
        media_url,
        "-vframes",
        "1",
        "-vf",
        f"scale={width}:-1",
        "-f",
        "image2",
        "-c:v",
        "mjpeg",
        "-q:v",
        "5",
        "pipe:1",
    ]
    try:
        stdout, _ = await run_ffmpeg_with_timeout(cmd, timeout=30)  # 30s timeout for single frame
        if stdout:
            return stdout
    except (TimeoutError, Exception):
        pass
    return None


async def generate_preview(
    media_id: str,
    start_ms: int,
    end_ms: int,
    output_path: Path,
    subtitle_index: int | None = None,
    custom_text: str | None = None,
    text_position: str | None = None,
    text_size: str | None = None,
) -> bool:
    """Generate an MP4 preview clip with optional subtitles/text."""
    server = get_plex_server()
    if not server:
        return False
    media_url = get_media_stream_url(server, media_id)
    if not media_url:
        return False
    start_sec = start_ms / 1000.0
    duration_sec = (end_ms - start_ms) / 1000.0

    # Build video filter (use -2 to ensure height is even for libx264)
    vf_parts = ["scale=480:-2"]

    # Handle custom text
    if custom_text:
        escaped_text = escape_drawtext(custom_text)
        fontsize = get_fontsize(480, text_size)  # Preview uses 480px width
        y_expr, _ = get_text_y_position(text_position)
        vf_parts.append(
            f"drawtext=text='{escaped_text}'"
            f":fontsize={fontsize}"
            f":fontcolor=white"
            f":borderw=2"
            f":bordercolor=black"
            f":x=(w-text_w)/2"
            f":y={y_expr}"
        )
    # Handle subtitle burn-in
    elif subtitle_index is not None:
        work_dir = WORK_DIR / f"preview_{output_path.stem}"
        work_dir.mkdir(parents=True, exist_ok=True)
        sub_content = None
        sub_url = get_subtitle_stream_url(server, media_id, subtitle_index)
        if sub_url:
            sub_content = await download_subtitle(sub_url)
        if not sub_content:
            # FFmpeg extraction for embedded subtitles
            subtitle_stream_index = 0
            item = server.fetchItem(int(media_id))
            if hasattr(item, "media") and item.media:
                for m in item.media:
                    for part in m.parts:
                        sub_idx = 0
                        for stream in part.streams:
                            if stream.streamType == 3:
                                if stream.index == subtitle_index:
                                    subtitle_stream_index = sub_idx
                                    break
                                sub_idx += 1
            sub_content = await extract_embedded_subtitle(
                media_url, subtitle_stream_index, work_dir
            )
        if sub_content:
            # Offset subtitle timestamps to match clip (FFmpeg -ss seeks to time 0)
            offset_content = offset_srt_content(sub_content, start_ms, end_ms)
            if offset_content:
                # Get style parameters (preview uses 480px width)
                fontsize = get_fontsize(480, text_size)
                if text_position == "top":
                    alignment = 8
                    margin_v = 20
                elif text_position == "center":
                    alignment = 5
                    margin_v = 0
                else:
                    alignment = 2
                    margin_v = 20
                # Convert to ASS with positioning baked in
                ass_content = srt_to_ass(offset_content, fontsize, alignment, margin_v)
                if ass_content:
                    sub_file = work_dir / "subtitles.ass"
                    sub_file.write_text(ass_content)
                    escaped_path = str(sub_file).replace(":", "\\:").replace("\\", "/")
                    vf_parts.append(f"subtitles='{escaped_path}'")

    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg",
        "-ss",
        str(start_sec),
        "-t",
        str(duration_sec),
        "-i",
        media_url,
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-an",
        "-movflags",
        "+faststart",
        "-y",
        str(output_path),
    ]
    try:
        stdout, stderr = await run_ffmpeg_with_timeout(cmd, timeout=60)  # 60s timeout for preview
        # Check file exists and has content (not empty)
        if output_path.exists() and output_path.stat().st_size > 0:
            return True
        # Delete empty file if created
        if output_path.exists():
            output_path.unlink()
        # Log FFmpeg error for debugging
        if stderr:
            print(f"[preview] FFmpeg failed: {stderr.decode()[-500:]}")
        return False
    except (TimeoutError, Exception) as e:
        print(f"[preview] Exception: {e}")
        # Clean up any partial file
        if output_path.exists():
            output_path.unlink()
        return False
