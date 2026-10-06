"""One model in one process: voice or transcribe a list of clips, and report time and peak memory.

generate.py and evaluate.py start this as `python -m speech.worker <job.json> <result.json>`, so
the peak memory it reports (the process's maximum resident set size, from getrusage) belongs to
that model alone. Model time excludes downloading, loading and MP3 encoding.
"""

from __future__ import annotations

import json
import os
import platform
import sys
import time
from pathlib import Path


def peak_rss_mb() -> float:
    import resource

    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)  # Linux reports KiB


def host() -> str:
    mem = ""
    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        kib = int(meminfo.read_text().split("MemTotal:")[1].split()[0])
        mem = f", {kib / 1024 / 1024:.0f} GB memory"
    return f"{platform.system()} {platform.machine()}, {os.cpu_count()} CPUs{mem}"


def run_tts(job: dict) -> dict:
    from . import audio, models, tts

    choice = models.Choice(**job["choice"])
    t0 = time.perf_counter()
    local = models.fetch(choice)
    fetch_s = time.perf_counter() - t0
    t0 = time.perf_counter()
    try:
        voice = tts.load(choice, local)
    except Exception as exc:  # a load failure on this CPU sends the driver to the next choice
        return {"status": "load-failed", "error": f"{type(exc).__name__}: {exc}", "fetchSeconds": round(fetch_s, 1)}
    load_s = time.perf_counter() - t0
    clips: dict[str, dict] = {}
    model_s = encode_s = audio_s = 0.0
    for i, clip in enumerate(job["clips"], start=1):
        t0 = time.perf_counter()
        try:
            wave = voice.say(clip["spoken"], clip["seed"], clip["rate"])
        except Exception as exc:  # one bad text shouldn't stop the other clips
            clips[clip["key"]] = {"error": f"{type(exc).__name__}: {exc}"}
            print(f"[tts {choice.model}] {i}/{len(job['clips'])} {clip['key']} failed: {exc}", flush=True)
            continue
        model_s += time.perf_counter() - t0
        out = Path(job["audioDir"]) / f"{clip['key']}.mp3"
        t0 = time.perf_counter()
        audio.encode_mp3(wave, voice.rate, out, kbps=job["kbps"])
        encode_s += time.perf_counter() - t0
        seconds = round(len(wave) / voice.rate + audio.LEAD_IN + audio.TAIL, 2)
        audio_s += seconds
        clips[clip["key"]] = {"seconds": seconds, "bytes": out.stat().st_size}
        print(f"[tts {choice.model}] {i}/{len(job['clips'])} {clip['key']} {seconds:.1f} s", flush=True)
    return {
        "status": "ok",
        "fetchSeconds": round(fetch_s, 1),
        "loadSeconds": round(load_s, 1),
        "modelSeconds": round(model_s, 1),
        "encodeSeconds": round(encode_s, 1),
        "audioSeconds": round(audio_s, 1),
        "droppedCharacters": dict(voice.dropped),
        "clips": clips,
    }


def run_asr(job: dict) -> dict:
    from . import asr, audio, models
    from .cer import cer

    choice = models.Choice(**job["choice"])
    codes = sorted({c["code"] for c in job["clips"]})
    t0 = time.perf_counter()
    local = models.fetch(choice, codes)
    fetch_s = time.perf_counter() - t0
    t0 = time.perf_counter()
    try:
        listener = asr.load(models.Choice(choice.model, choice.backend, codes[0], choice.library), local)
    except Exception as exc:
        return {"status": "load-failed", "error": f"{type(exc).__name__}: {exc}", "fetchSeconds": round(fetch_s, 1)}
    load_s = time.perf_counter() - t0
    clips: dict[str, dict] = {}
    per_lang: dict[str, dict] = {}
    ordered_clips = sorted(job["clips"], key=lambda c: (c["code"], c["key"]))
    for i, clip in enumerate(ordered_clips, start=1):
        listener.use(clip["code"])
        wave = audio.decode(Path(clip["path"]))
        t0 = time.perf_counter()
        try:
            text = listener.transcribe(wave)
        except Exception as exc:
            clips[clip["key"]] = {"error": f"{type(exc).__name__}: {exc}"}
            print(f"[asr {choice.model}] {clip['key']} failed: {exc}", flush=True)
            continue
        spent = time.perf_counter() - t0
        stats = per_lang.setdefault(clip["lang"], {"clips": 0, "audioSeconds": 0.0, "modelSeconds": 0.0})
        stats["clips"] += 1
        stats["audioSeconds"] += len(wave) / asr.RATE
        stats["modelSeconds"] += spent
        clips[clip["key"]] = {"transcript": text, "cer": round(cer(clip["reference"], text), 3)}
        print(f"[asr {choice.model} {clip['code']}] {i}/{len(ordered_clips)} {clip['key']}", flush=True)
    for stats in per_lang.values():
        stats["audioSeconds"] = round(stats["audioSeconds"], 1)
        stats["modelSeconds"] = round(stats["modelSeconds"], 1)
    return {
        "status": "ok",
        "fetchSeconds": round(fetch_s, 1),
        "loadSeconds": round(load_s, 1),
        "modelSeconds": round(sum(s["modelSeconds"] for s in per_lang.values()), 1),
        "audioSeconds": round(sum(s["audioSeconds"] for s in per_lang.values()), 1),
        "perLanguage": per_lang,
        "clips": clips,
    }


def main(argv: list[str]) -> int:
    job_path, result_path = Path(argv[0]), Path(argv[1])
    job = json.loads(job_path.read_text(encoding="utf-8"))
    import torch

    if os.environ.get("SPEECH_THREADS"):
        torch.set_num_threads(int(os.environ["SPEECH_THREADS"]))
    result = run_tts(job) if job["task"] == "tts" else run_asr(job)
    result.update(
        task=job["task"],
        model=job["choice"]["model"],
        peakRssMB=peak_rss_mb(),
        torch=torch.__version__,
        threads=torch.get_num_threads(),
        host=host(),
    )
    if not job.get("keepModels"):
        from . import models

        result["freedBytes"] = models.forget([job["choice"]["model"]])
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
