"""Voice every text the demo plays, skipping clips that are already up to date, then score them.

One command does the whole job: voice the new or changed texts, remove clips for texts that
are gone, transcribe and score what's new, and refresh docs/speech-results.md.

    uv run --group models python -m speech.generate              # everything that changed
    uv run --group models python -m speech.generate --dry-run    # list what would be voiced
    uv run --group models python -m speech.generate --lang te    # one language
    uv run --group models python -m speech.generate --force      # re-voice everything

A clip is up to date when apps/web/public/audio/<key>.mp3 exists and its manifest entry was made
by the model now chosen for its language, so changing a card's text (a new key) or getting
access to a better model re-voices it. Run it in the Codespace (speech/codespace.sh), not on a
laptop: the models need Linux x64 and about 6 GB of memory.
"""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import asdict

from .manifest import clip_entry, load_json, load_manifest, now, ordered, plan, prune, write_json
from .models import TTS, Choice, resolve
from .runner import log_run, run_worker
from .sources import AUDIO_DIR, MANIFEST_PATH, TRANSCRIPTS_PATH, collect
from .spoken import spoken
from .tts_settings import seed_for, speaking_rate

BUDGET_BYTES = 8 * 1024 * 1024  # keep the demo's audio under about 8 MB


def encoder_ready() -> bool:
    """Whether the ffmpeg in reach can write MP3 (libmp3lame)."""
    try:
        from .audio import has_mp3_encoder

        return has_mp3_encoder()
    except (ImportError, OSError, subprocess.CalledProcessError):
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", action="append", help="only this language (te, en, de); repeatable")
    parser.add_argument("--force", action="store_true", help="re-voice clips even when up to date")
    parser.add_argument("--dry-run", action="store_true", help="list what would change and stop")
    parser.add_argument("--no-evaluate", action="store_true", help="skip transcription and scoring")
    parser.add_argument("--no-prune", action="store_true", help="keep clips whose text is gone")
    parser.add_argument("--keep-models", action="store_true", help="leave downloaded models in the cache")
    parser.add_argument("--kbps", type=int, default=48, help="MP3 bitrate (use 40 if the audio passes 8 MB)")
    args = parser.parse_args(argv)

    specs = collect()
    if args.lang:
        specs = [s for s in specs if s.lang in args.lang]
    manifest = load_manifest(MANIFEST_PATH)
    from .evaluate import empty_transcripts

    transcripts = load_json(TRANSCRIPTS_PATH, empty_transcripts())

    chosen: dict[str, Choice] = {}
    for lang in sorted({s.lang for s in specs}):
        choice, passed = resolve(lang, TTS)
        for model, reason in passed:
            print(f"{lang}: not speaking with {model}: {reason}")
        if choice:
            chosen[lang] = choice
            print(f"{lang}: speaking with {choice.model}")
    todo = plan(specs, manifest, AUDIO_DIR, {lang: c.model for lang, c in chosen.items()}, force=args.force)
    stale = [k for k in todo.stale if not args.lang or manifest["clips"][k]["lang"] in args.lang]
    print(
        f"{len(todo.voice)} to voice, {len(todo.keep)} up to date, {len(stale)} no longer used, "
        f"{len(todo.no_voice)} with no voice available"
    )
    for spec in todo.voice:
        unknown = spoken(spec.text, spec.lang).unknown_words
        if unknown:
            print(f"{spec.key}: no Telugu spelling for {', '.join(unknown)}; add them to speech/speech/te_names.json")
    if args.dry_run:
        for spec in todo.voice:
            print(f"  {spec.key} {spec.lang} {spec.kind:<10} {spec.source:<14} {spec.text[:60]}")
        return 0

    if todo.voice and not encoder_ready():
        print("ffmpeg here can't write MP3 (no libmp3lame): install the system ffmpeg (sudo apt-get install -y ffmpeg)")
        return 1

    changed = False
    if stale and not args.no_prune:
        prune(manifest, transcripts, stale, AUDIO_DIR)
        print(f"removed {len(stale)} clip(s) whose text is gone")
        changed = True
    for spec in todo.keep:  # the same text can move to another card or household
        entry = manifest["clips"][spec.key]
        if (entry.get("kind"), entry.get("source")) != (spec.kind, spec.source):
            entry["kind"], entry["source"] = spec.kind, spec.source
            changed = True

    def save() -> None:
        manifest["generatedAt"] = now()
        write_json(TRANSCRIPTS_PATH, transcripts)
        write_json(MANIFEST_PATH, ordered(manifest, transcripts))

    if changed:
        save()
    voiced = 0
    for lang in sorted({s.lang for s in todo.voice}):
        group = [s for s in todo.voice if s.lang == lang]
        failed: list[str] = []
        while True:
            choice, _ = resolve(lang, TTS, skip=failed)
            if choice is None:
                print(f"{lang}: no voice could load; {len(group)} clip(s) not voiced")
                break
            job = {
                "task": "tts",
                "choice": asdict(choice),
                "audioDir": str(AUDIO_DIR),
                "kbps": args.kbps,
                "keepModels": args.keep_models,
                "clips": [
                    {
                        "key": s.key,
                        "spoken": spoken(s.text, s.lang).text,
                        "seed": seed_for(s.key),
                        "rate": speaking_rate(s.kind),
                    }
                    for s in group
                ],
            }
            try:
                result = run_worker(job)
            except RuntimeError as exc:  # a crash (out of memory, say) counts as failing to load here
                result = {"status": "load-failed", "error": str(exc), "task": "tts", "model": choice.model}
            log_run(result, langs=[lang])
            if result["status"] == "load-failed":
                print(f"{choice.model} failed: {result['error']}; trying the next choice")
                failed.append(choice.model)
                continue
            done = 0
            for s in group:
                r = result["clips"].get(s.key, {})
                if "seconds" not in r:
                    print(f"{s.key}: not voiced ({r.get('error', 'missing')})")
                    continue
                manifest["clips"][s.key] = clip_entry(s, choice.model, r["seconds"], r["bytes"])
                transcripts["clips"].pop(s.key, None)  # the old score belongs to the old audio
                done += 1
            voiced += done
            if done:
                save()  # after each language, so a later failure keeps this one's clips
            break

    total = sum(c.get("bytes", 0) for c in manifest["clips"].values())
    print(f"voiced {voiced} clip(s); {len(manifest['clips'])} clips, {total / 1024 / 1024:.2f} MB of audio")
    if total > BUDGET_BYTES:
        print("the audio is over 8 MB: run again with --force --kbps 40")

    if not args.no_evaluate:
        from . import evaluate

        evaluate.run(langs=args.lang, keep_models=args.keep_models)
    from . import report

    report.write()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
