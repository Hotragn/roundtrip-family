"""Score the round trip: transcribe each clip and compute its character error rate (CER).

The reference is the spoken form the voice was given (speech/speech/spoken.py), and reference
and transcript both go through cer.normalize before scoring. The scores are automated (text to
speech to text) on synthetic text; nobody listened to the clips.

    uv run --group models python -m speech.evaluate          # clips without a score, or scored by an older model
    uv run --group models python -m speech.evaluate --all    # re-score every clip
"""

from __future__ import annotations

import argparse
from dataclasses import asdict

from .manifest import load_json, load_manifest, now, ordered, write_json
from .models import ASR, Choice, label, resolve
from .runner import log_run, run_worker
from .sources import AUDIO_DIR, MANIFEST_PATH, TRANSCRIPTS_PATH, collect
from .spoken import spoken


def empty_transcripts() -> dict:
    return {
        "provenance": "synthetic",
        "note": "Automated round trip on synthetic text: each clip's spoken form, the reference used for "
        "the character error rate, and what the listening model heard. Not a listening test.",
        "clips": {},
    }


def run(langs: list[str] | None = None, rescore_all: bool = False, keep_models: bool = False) -> int:
    manifest = load_manifest(MANIFEST_PATH)
    transcripts = load_json(TRANSCRIPTS_PATH, empty_transcripts())
    specs = {s.key: s for s in collect()}
    chosen: dict[str, Choice] = {}
    skip: list[str] = []
    pending: list[tuple[str, str]] = []  # (key, lang)
    for key, entry in sorted(manifest["clips"].items()):
        lang = entry["lang"]
        if langs and lang not in langs:
            continue
        if key not in specs or not (AUDIO_DIR / f"{key}.mp3").exists():
            continue
        pending.append((key, lang))
    scored = 0

    def save() -> None:
        transcripts["clips"] = {k: transcripts["clips"][k] for k in sorted(transcripts["clips"]) if k in manifest["clips"]}
        manifest["generatedAt"] = now()
        write_json(TRANSCRIPTS_PATH, transcripts)
        write_json(MANIFEST_PATH, ordered(manifest, transcripts))

    while pending:
        for lang in sorted({lang for _, lang in pending}):
            if lang not in chosen:
                choice, passed = resolve(lang, ASR, skip=skip)
                for model, reason in passed:
                    print(f"{lang}: not listening with {model}: {reason}")
                if choice:
                    chosen[lang] = choice
        todo = []
        for key, lang in pending:
            choice = chosen.get(lang)
            detail = transcripts["clips"].get(key, {})
            entry = manifest["clips"][key]
            if choice is None:
                continue
            if rescore_all or entry.get("cer") is None or detail.get("asrModel") != label(choice):
                todo.append((key, lang, choice))
        if not todo:
            break
        retry: list[tuple[str, str]] = []
        for model in sorted({c.model for _, _, c in todo}):
            group = [(k, lang, c) for k, lang, c in todo if c.model == model]
            first = group[0][2]
            job = {
                "task": "asr",
                "choice": asdict(first),
                "keepModels": keep_models,
                "clips": [
                    {
                        "key": k,
                        "lang": lang,
                        "code": c.code,
                        "path": str(AUDIO_DIR / f"{k}.mp3"),
                        "reference": spoken(specs[k].text, lang).text,
                    }
                    for k, lang, c in group
                ],
            }
            try:
                result = run_worker(job)
            except RuntimeError as exc:  # a crash (out of memory, say) counts as failing to load here
                result = {"status": "load-failed", "error": str(exc), "task": "asr", "model": model}
            log_run(result, langs=sorted({lang for _, lang, _ in group}))
            if result["status"] == "load-failed":
                print(f"{model} failed: {result['error']}; trying the next choice")
                skip.append(model)
                for k, lang, _ in group:
                    chosen.pop(lang, None)
                    retry.append((k, lang))
                continue
            for k, lang, c in group:
                r = result["clips"].get(k, {})
                if "transcript" not in r:
                    print(f"{k}: no transcript ({r.get('error', 'missing')})")
                    continue
                spec = specs[k]
                manifest["clips"][k]["transcript"] = r["transcript"]
                manifest["clips"][k]["cer"] = r["cer"]
                transcripts["clips"][k] = {
                    "lang": lang,
                    "kind": spec.kind,
                    "source": spec.source,
                    "text": spec.text,
                    "spoken": spoken(spec.text, lang).text,
                    "reference": spoken(spec.text, lang).text,
                    "ttsModel": manifest["clips"][k]["model"],
                    "asrModel": label(c),
                    "transcript": r["transcript"],
                    "cer": r["cer"],
                }
                scored += 1
            save()  # after each model, so a later failure keeps these scores
        pending = retry
    if scored or set(transcripts["clips"]) - set(manifest["clips"]):
        save()
    print(f"scored {scored} clip(s)")
    return scored


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", action="append", help="only this language (te, en, de); repeatable")
    parser.add_argument("--all", action="store_true", help="re-score every clip")
    parser.add_argument("--keep-models", action="store_true", help="leave downloaded models in the cache")
    args = parser.parse_args(argv)
    run(langs=args.lang, rescore_all=args.all, keep_models=args.keep_models)
    from . import report

    report.write()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
