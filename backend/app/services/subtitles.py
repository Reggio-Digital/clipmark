import re
import tempfile
import asyncio
from pathlib import Path
import httpx
import pysrt
from app.models.schemas import SubtitleLine


def parse_srt_content(content: str) -> list[SubtitleLine]:
    lines = []
    try:
        subs = pysrt.from_string(content)
        for i, sub in enumerate(subs):
            start_ms = (
                sub.start.hours * 3600000
                + sub.start.minutes * 60000
                + sub.start.seconds * 1000
                + sub.start.milliseconds
            )
            end_ms = (
                sub.end.hours * 3600000
                + sub.end.minutes * 60000
                + sub.end.seconds * 1000
                + sub.end.milliseconds
            )
            text = re.sub(r"<[^>]+>", "", sub.text)
            text = re.sub(r"\{[^}]+\}", "", text)
            text = text.strip()
            if text:
                lines.append(SubtitleLine(index=i, start_ms=start_ms, end_ms=end_ms, text=text))
    except Exception:
        pass
    return lines


def parse_ass_content(content: str) -> list[SubtitleLine]:
    lines = []
    dialogue_pattern = re.compile(
        r"Dialogue:\s*\d+,(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),[^,]*,[^,]*,\d+,\d+,\d+,[^,]*,(.*)"
    )
    try:
        for i, match in enumerate(dialogue_pattern.finditer(content)):
            start_h, start_m, start_s, start_cs = map(int, match.groups()[:4])
            end_h, end_m, end_s, end_cs = map(int, match.groups()[4:8])
            text = match.group(9)
            start_ms = start_h * 3600000 + start_m * 60000 + start_s * 1000 + start_cs * 10
            end_ms = end_h * 3600000 + end_m * 60000 + end_s * 1000 + end_cs * 10
            text = re.sub(r"\{[^}]*\}", "", text)
            text = text.replace("\\N", "\n").replace("\\n", "\n")
            text = re.sub(r"<[^>]+>", "", text)
            text = text.strip()
            if text:
                lines.append(SubtitleLine(index=i, start_ms=start_ms, end_ms=end_ms, text=text))
    except Exception:
        pass
    return lines


def parse_vtt_content(content: str) -> list[SubtitleLine]:
    lines = []
    time_pattern = re.compile(r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})")
    try:
        blocks = content.split("\n\n")
        index = 0
        for block in blocks:
            match = time_pattern.search(block)
            if match:
                start_h, start_m, start_s, start_ms_part = map(int, match.groups()[:4])
                end_h, end_m, end_s, end_ms_part = map(int, match.groups()[4:8])
                start_ms = start_h * 3600000 + start_m * 60000 + start_s * 1000 + start_ms_part
                end_ms = end_h * 3600000 + end_m * 60000 + end_s * 1000 + end_ms_part
                text_lines = block.split("\n")
                time_line_idx = next(
                    (i for i, line in enumerate(text_lines) if "-->" in line), -1
                )
                if time_line_idx >= 0:
                    text = "\n".join(text_lines[time_line_idx + 1 :])
                    text = re.sub(r"<[^>]+>", "", text)
                    text = text.strip()
                    if text:
                        lines.append(
                            SubtitleLine(index=index, start_ms=start_ms, end_ms=end_ms, text=text)
                        )
                        index += 1
    except Exception:
        pass
    return lines


async def download_subtitle(url: str) -> str | None:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, follow_redirects=True, timeout=30.0)
            if response.status_code == 200:
                return response.text
        except Exception:
            pass
    return None


async def extract_embedded_subtitle(
    media_url: str, subtitle_index: int, work_dir: Path
) -> str | None:
    output_path = work_dir / f"subtitle_{subtitle_index}.srt"
    cmd = [
        "ffmpeg",
        "-i",
        media_url,
        "-map",
        f"0:s:{subtitle_index}",
        "-c:s",
        "srt",
        str(output_path),
        "-y",
    ]
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        if output_path.exists():
            return output_path.read_text(errors="ignore")
    except Exception:
        pass
    return None


def parse_subtitle_content(content: str, format: str) -> list[SubtitleLine]:
    if format == "srt":
        return parse_srt_content(content)
    elif format == "ass":
        return parse_ass_content(content)
    elif format == "vtt":
        return parse_vtt_content(content)
    return []


def offset_srt_content(content: str, start_ms: int, end_ms: int) -> str:
    from io import StringIO
    try:
        subs = pysrt.from_string(content)
        new_subs = pysrt.SubRipFile()

        for sub in subs:
            sub_start_ms = (
                sub.start.hours * 3600000
                + sub.start.minutes * 60000
                + sub.start.seconds * 1000
                + sub.start.milliseconds
            )
            sub_end_ms = (
                sub.end.hours * 3600000
                + sub.end.minutes * 60000
                + sub.end.seconds * 1000
                + sub.end.milliseconds
            )

            if sub_end_ms < start_ms or sub_start_ms > end_ms:
                continue

            new_start_ms = max(0, sub_start_ms - start_ms)
            new_end_ms = sub_end_ms - start_ms

            new_sub = pysrt.SubRipItem(
                index=len(new_subs) + 1,
                start=pysrt.SubRipTime(milliseconds=new_start_ms),
                end=pysrt.SubRipTime(milliseconds=new_end_ms),
                text=sub.text,
            )
            new_subs.append(new_sub)

        if not new_subs:
            return ""
        buf = StringIO()
        new_subs.write_into(buf)
        return buf.getvalue()
    except Exception:
        return ""


def srt_to_ass(
    srt_content: str,
    fontsize: int = 24,
    alignment: int = 2,
    margin_v: int = 20,
) -> str:
    """Convert SRT content to ASS format with custom styling.

    Alignment values (numpad layout):
    7=top-left, 8=top-center, 9=top-right
    4=mid-left, 5=mid-center, 6=mid-right
    1=bot-left, 2=bot-center, 3=bot-right
    """
    try:
        subs = pysrt.from_string(srt_content)
    except Exception:
        return ""

    if not subs:
        return ""

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 384
PlayResY: 288
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,{fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,{alignment},10,10,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines = []
    for sub in subs:
        start_total_cs = (
            sub.start.hours * 360000
            + sub.start.minutes * 6000
            + sub.start.seconds * 100
            + sub.start.milliseconds // 10
        )
        end_total_cs = (
            sub.end.hours * 360000
            + sub.end.minutes * 6000
            + sub.end.seconds * 100
            + sub.end.milliseconds // 10
        )

        start_h = start_total_cs // 360000
        start_m = (start_total_cs % 360000) // 6000
        start_s = (start_total_cs % 6000) // 100
        start_cs = start_total_cs % 100

        end_h = end_total_cs // 360000
        end_m = (end_total_cs % 360000) // 6000
        end_s = (end_total_cs % 6000) // 100
        end_cs = end_total_cs % 100

        start_str = f"{start_h}:{start_m:02d}:{start_s:02d}.{start_cs:02d}"
        end_str = f"{end_h}:{end_m:02d}:{end_s:02d}.{end_cs:02d}"

        text = sub.text.replace("\n", "\\N")
        text = re.sub(r"<[^>]+>", "", text)

        lines.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}")

    return header + "\n".join(lines) + "\n"
