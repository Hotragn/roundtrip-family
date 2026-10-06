"""What gets a voice: every text the parents' app plays, read from the demo data.

- Each card's title and body, in the parent's language (Telugu for the demo households).
- Each practice phrase's local-language text (English in Fremont, German in Munich).
- Each household's help card, in the local language, so a stranger can hear it.
- The synthetic diary entries recorded as voice notes, the stand-in for parents' recordings.

A clip's key is the first 16 hex characters of sha256("<lang>|<text>"), with the text exactly as
it appears in the source JSON. agent/src/voice/router.ts computes the same key to find a clip.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WEEKS_DIR = REPO / "data" / "demo" / "weeks"
DIARY_PATH = REPO / "data" / "persona" / "diary.json"
AUDIO_DIR = REPO / "apps" / "web" / "public" / "audio"
AUDIO_DATA_DIR = REPO / "data" / "demo" / "audio"
MANIFEST_PATH = AUDIO_DATA_DIR / "manifest.json"
TRANSCRIPTS_PATH = AUDIO_DATA_DIR / "transcripts.json"
RUNS_PATH = AUDIO_DATA_DIR / "runs.json"
RESULTS_DOC = REPO / "docs" / "speech-results.md"

KINDS = ("card-title", "card-body", "phrase", "help-card", "diary")


def clip_key(lang: str, text: str) -> str:
    return hashlib.sha256(f"{lang}|{text}".encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class ClipSpec:
    key: str
    lang: str
    text: str
    kind: str
    source: str

    @property
    def file(self) -> str:
        return f"/audio/{self.key}.mp3"


def _spec(lang: str, text: str, kind: str, source: str) -> ClipSpec:
    if kind not in KINDS:
        raise ValueError(f"unknown clip kind {kind!r}")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"empty {kind} text in {source}")
    return ClipSpec(key=clip_key(lang, text), lang=lang, text=text, kind=kind, source=source)


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def week_specs(week: dict) -> list[ClipSpec]:
    """Clips for one household's week file (data/demo/weeks/<slug>.json)."""
    household = week["household"]
    slug = household["slug"]
    local = household["localLanguage"]
    parent_lang = {p["id"]: p["language"] for p in week["parents"]}
    specs = [_spec(local, household["helpCardText"], "help-card", slug)]
    for outing in week["outings"]:
        for card in outing.get("cards", []):
            lang = parent_lang[card["parentId"]]
            specs.append(_spec(lang, card["title"], "card-title", slug))
            specs.append(_spec(lang, card["body"], "card-body", slug))
            for phrase in card.get("phrases", []):
                specs.append(_spec(local, phrase["local"], "phrase", slug))
    return specs


def diary_specs(diary: dict, parent_lang: dict[str, str]) -> list[ClipSpec]:
    """Voice entries only; text and photo entries have nothing to play."""
    specs = []
    for entry in diary["entries"]:
        if entry.get("kind") != "voice":
            continue
        lang = parent_lang.get(entry["parentId"])
        if lang is None:
            raise ValueError(f"diary entry {entry['id']} names unknown parent {entry['parentId']}")
        specs.append(_spec(lang, entry["text"], "diary", entry["id"]))
    return specs


def dedupe(specs: list[ClipSpec]) -> list[ClipSpec]:
    """One clip per key. The first occurrence names the kind and source."""
    seen: dict[str, ClipSpec] = {}
    for spec in specs:
        seen.setdefault(spec.key, spec)
    return list(seen.values())


def collect(weeks_dir: Path = WEEKS_DIR, diary_path: Path = DIARY_PATH) -> list[ClipSpec]:
    """Every clip the demo needs, in a stable order: households by file name, then the diary."""
    specs: list[ClipSpec] = []
    parent_lang: dict[str, str] = {}
    for path in sorted(weeks_dir.glob("*.json")):
        week = _read_json(path)
        parent_lang.update({p["id"]: p["language"] for p in week["parents"]})
        specs.extend(week_specs(week))
    if diary_path.exists():
        specs.extend(diary_specs(_read_json(diary_path), parent_lang))
    return dedupe(specs)


if __name__ == "__main__":
    # `uv run python -m speech.sources`: how many clips the demo data needs, without any model.
    from collections import Counter

    found = collect()
    for (lang, kind), n in sorted(Counter((s.lang, s.kind) for s in found).items()):
        print(f"{lang} {kind:<10} {n}")
    print(f"total      {len(found)}")
