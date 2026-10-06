"""The clip manifest the web app reads, and what each run has to do.

data/demo/audio/manifest.json maps each clip key to its file and how it was made:

    { "provenance": "synthetic", "generatedAt": ISO time,
      "models": { "te-tts", "en-tts", "de-tts", "te-asr", "en-asr", "de-asr" },
      "clips": { key: { file, lang, kind, source, model, seconds, bytes, transcript, cer } } }

data/demo/audio/transcripts.json keeps the evaluation detail per clip (the spoken form the voice
was given, the CER reference, which listening model produced the transcript), and
data/demo/audio/runs.json logs time and peak memory for every model run.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .models import OPEN_TTS_MODELS
from .sources import ClipSpec

MANIFEST_LANGS = ("te", "en", "de")
CLIP_FIELDS = ("file", "lang", "kind", "source", "model", "seconds", "bytes", "transcript", "cer")


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def empty_manifest() -> dict:
    return {"provenance": "synthetic", "generatedAt": None, "models": {}, "clips": {}}


def load_json(path: Path, default: dict) -> dict:
    if not path.exists() or not path.read_text(encoding="utf-8").strip():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_manifest(path: Path) -> dict:
    manifest = load_json(path, empty_manifest())
    manifest.setdefault("clips", {})
    return manifest


def clip_entry(spec: ClipSpec, model: str, seconds: float, size: int, transcript=None, cer=None) -> dict:
    return {
        "file": spec.file,
        "lang": spec.lang,
        "kind": spec.kind,
        "source": spec.source,
        "model": model,
        "seconds": seconds,
        "bytes": size,
        "transcript": transcript,
        "cer": cer,
    }


@dataclass
class Plan:
    voice: list[ClipSpec] = field(default_factory=list)  # new, changed, or made by an older model
    keep: list[ClipSpec] = field(default_factory=list)  # file and entry already match
    stale: list[str] = field(default_factory=list)  # keys this pipeline made for text that's gone
    no_voice: list[ClipSpec] = field(default_factory=list)  # no usable model for the language


def plan(specs: list[ClipSpec], manifest: dict, audio_dir: Path, tts_model: dict[str, str], force: bool = False) -> Plan:
    """Decide what to voice.

    A clip is kept when its file exists and its manifest entry was made by the model now chosen
    for its language. Clips made outside this pipeline (another model, such as an ElevenLabs demo
    clip) are kept as they are and never pruned.
    """
    result = Plan()
    clips = manifest.get("clips", {})
    wanted = {s.key for s in specs}
    for spec in specs:
        entry = clips.get(spec.key)
        exists = (audio_dir / f"{spec.key}.mp3").exists()
        if entry and exists and entry.get("model") not in OPEN_TTS_MODELS:
            result.keep.append(spec)
        elif entry and exists and not force and entry.get("model") == tts_model.get(spec.lang):
            result.keep.append(spec)
        elif spec.lang in tts_model:
            result.voice.append(spec)
        else:
            result.no_voice.append(spec)
    for key, entry in clips.items():
        if key not in wanted and entry.get("model") in OPEN_TTS_MODELS:
            result.stale.append(key)
    return result


def prune(manifest: dict, transcripts: dict, keys: list[str], audio_dir: Path) -> list[str]:
    """Remove stale clips: their entries, their evaluation detail and their files."""
    removed = []
    for key in keys:
        manifest["clips"].pop(key, None)
        transcripts.get("clips", {}).pop(key, None)
        path = audio_dir / f"{key}.mp3"
        if path.exists():
            path.unlink()
        removed.append(key)
    return removed


def models_used(manifest: dict, transcripts: dict) -> dict[str, str]:
    """The models behind the current clips, per language and job (te-tts, te-asr, ...)."""
    out: dict[str, str] = {}
    details = transcripts.get("clips", {})
    for lang in MANIFEST_LANGS:
        tts = sorted({c["model"] for c in manifest["clips"].values() if c["lang"] == lang and c.get("model")})
        asr = sorted(
            {
                details[k]["asrModel"]
                for k, c in manifest["clips"].items()
                if c["lang"] == lang and details.get(k, {}).get("asrModel")
            }
        )
        if tts:
            out[f"{lang}-tts"] = ", ".join(tts)
        if asr:
            out[f"{lang}-asr"] = ", ".join(asr)
    order = [f"{lang}-{job}" for job in ("tts", "asr") for lang in MANIFEST_LANGS]
    return {key: out[key] for key in order if key in out}


def ordered(manifest: dict, transcripts: dict) -> dict:
    """The manifest with its fields in the documented order and clips sorted by key.

    A field that isn't known yet (a transcript before scoring) is left out rather than written
    as null, so the web app's ClipManifest type, where those fields are optional, still fits.
    """
    clips = {
        key: {f: manifest["clips"][key][f] for f in CLIP_FIELDS if manifest["clips"][key].get(f) is not None}
        for key in sorted(manifest["clips"])
    }
    return {
        "provenance": "synthetic",
        "generatedAt": manifest.get("generatedAt"),
        "models": models_used({"clips": clips}, transcripts),
        "clips": clips,
    }
