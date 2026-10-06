"""Audio in and out: loudness-normalized MP3 for phones, and 16 kHz mono for the listening models.

ffmpeg does both jobs. The loudnorm filter is EBU R128 loudness normalization, run in two
passes so the second pass applies the gain the first pass measured
(https://ffmpeg.org/ffmpeg-filters.html#loudnorm). It upsamples internally, so the output rate
is set explicitly. The ffmpeg binary comes from the system if there is one, otherwise from
imageio-ffmpeg's wheel (https://github.com/imageio/imageio-ffmpeg, get_ffmpeg_exe()).
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import numpy as np

# Spoken word on phones: -16 LUFS integrated, true peak at most -1.5 dBTP.
TARGET_LUFS = -16.0
TARGET_TP = -1.5
TARGET_LRA = 11.0
MP3_RATE = 24_000
MP3_KBPS = 48
ASR_RATE = 16_000
LEAD_IN = 0.15  # seconds of silence before speech; some phones clip the first moment
TAIL = 0.25


@lru_cache(maxsize=1)
def ffmpeg_exe() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg  # models group only

    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(args: list[str], data: bytes | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", *args], input=data, capture_output=True, check=True)


def pad(wave: np.ndarray, rate: int) -> np.ndarray:
    lead = np.zeros(int(LEAD_IN * rate), dtype=np.float32)
    tail = np.zeros(int(TAIL * rate), dtype=np.float32)
    return np.concatenate([lead, wave.astype(np.float32), tail])


def measure_loudness(pcm: bytes, rate: int) -> dict:
    """First loudnorm pass: measure, print JSON to stderr, write nothing."""
    target = f"I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA}"
    proc = _run(
        ["-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"],
        pcm,
    )
    stderr = proc.stderr.decode("utf-8", errors="replace")
    found = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, re.S)
    if not found:
        raise RuntimeError("loudnorm printed no measurement")
    return json.loads(found.group(0))


def encode_mp3(wave: np.ndarray, rate: int, out: Path, kbps: int = MP3_KBPS) -> None:
    """Pad, normalize loudness (two passes) and write a mono MP3 at 24 kHz."""
    pcm = pad(wave, rate).astype("<f4").tobytes()
    m = measure_loudness(pcm, rate)
    second = (
        f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA={TARGET_LRA}"
        f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
        f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.mp3")
    _run(
        [
            "-y", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0",
            "-af", second, "-ar", str(MP3_RATE), "-ac", "1",
            "-c:a", "libmp3lame", "-b:a", f"{kbps}k",
            "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1",
            str(tmp),
        ],
        pcm,
    )
    tmp.replace(out)


def decode(path: Path, rate: int = ASR_RATE) -> np.ndarray:
    """Any audio file to mono float32 at `rate`, the input the listening models expect."""
    proc = _run(["-i", str(path), "-vn", "-ac", "1", "-ar", str(rate), "-f", "f32le", "pipe:1"])
    return np.frombuffer(proc.stdout, dtype="<f4").copy()


def duration(path: Path) -> float:
    """Seconds of audio in a file, from its decoded samples."""
    return round(len(decode(path, MP3_RATE)) / MP3_RATE, 2)


def has_mp3_encoder() -> bool:
    proc = _run(["-encoders"])
    return b"libmp3lame" in proc.stdout
