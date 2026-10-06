"""Write the tables in docs/speech-results.md from the manifest, transcripts and run log.

    uv run python -m speech.report

Only the part between the speech-results markers is rewritten; the notes around it stay.
"""

from __future__ import annotations

import statistics
from collections import defaultdict

from .manifest import load_json, load_manifest
from .sources import MANIFEST_PATH, RESULTS_DOC, RUNS_PATH, TRANSCRIPTS_PATH

START = "<!-- speech-results:start -->"
END = "<!-- speech-results:end -->"
LANG_NAMES = {"te": "Telugu", "en": "English", "de": "German"}
KIND_ORDER = ["card-title", "card-body", "phrase", "help-card", "diary"]


def _f(x: float | None, digits: int = 3) -> str:
    return "n/a" if x is None else f"{x:.{digits}f}"


def round_trip(manifest: dict, transcripts: dict) -> list[dict]:
    """CER per language, voice and listener."""
    groups: dict[tuple, list[tuple[str, dict]]] = defaultdict(list)
    details = transcripts.get("clips", {})
    for key, clip in manifest["clips"].items():
        asr = details.get(key, {}).get("asrModel", "not scored")
        groups[(clip["lang"], clip["model"], asr)].append((key, clip))
    rows = []
    for (lang, tts, asr), items in sorted(groups.items()):
        scores = [c["cer"] for _, c in items if c.get("cer") is not None]
        worst = sorted((c for c in items if c[1].get("cer") is not None), key=lambda kc: -kc[1]["cer"])[:3]
        rows.append(
            {
                "lang": lang,
                "tts": tts,
                "asr": asr,
                "clips": len(items),
                "scored": len(scores),
                "mean": statistics.fmean(scores) if scores else None,
                "median": statistics.median(scores) if scores else None,
                "seconds": sum(c["seconds"] for _, c in items),
                "worst": [(k, c["kind"], c["source"], c["cer"], details.get(k, {}).get("text", "")) for k, c in worst],
            }
        )
    return rows


def by_kind(manifest: dict) -> list[tuple[str, str, int, float | None]]:
    groups: dict[tuple[str, str], list[float]] = defaultdict(list)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for clip in manifest["clips"].values():
        counts[(clip["lang"], clip["kind"])] += 1
        if clip.get("cer") is not None:
            groups[(clip["lang"], clip["kind"])].append(clip["cer"])
    order = {k: i for i, k in enumerate(KIND_ORDER)}
    keys = sorted(counts, key=lambda lk: (lk[0], order.get(lk[1], 99)))
    return [(lang, kind, counts[(lang, kind)], statistics.fmean(groups[(lang, kind)]) if groups[(lang, kind)] else None) for lang, kind in keys]


def model_runs(runs: dict) -> list[dict]:
    """Time and peak memory per model and language, summed over every successful run."""
    acc: dict[tuple[str, str, str], dict] = {}
    for run in runs.get("runs", []):
        if run.get("status") != "ok" or run.get("task") not in ("tts", "asr"):
            continue
        if run["task"] == "asr":
            parts = [(lang, s["clips"], s["audioSeconds"], s["modelSeconds"]) for lang, s in run.get("perLanguage", {}).items()]
        else:
            parts = [(",".join(run["langs"]), run["clips"], run["audioSeconds"], run["modelSeconds"])]
        for lang, clips, audio_s, model_s in parts:
            row = acc.setdefault(
                (run["task"], run["model"], lang),
                {"runs": 0, "clips": 0, "audio": 0.0, "model": 0.0, "load": 0.0, "peak": 0.0, "host": "", "torch": "", "threads": 0},
            )
            row["runs"] += 1
            row["clips"] += clips
            row["audio"] += audio_s
            row["model"] += model_s
            row["load"] = max(row["load"], run.get("loadSeconds", 0.0))
            row["peak"] = max(row["peak"], run.get("peakRssMB", 0.0))
            row["host"], row["torch"], row["threads"] = run.get("host", ""), run.get("torch", ""), run.get("threads", 0)
    out = []
    for (task, model, lang), row in sorted(acc.items()):
        row.update(task=task, model=model, lang=lang, per_second=row["model"] / row["audio"] if row["audio"] else None)
        out.append(row)
    return out


def render(manifest: dict, transcripts: dict, runs: dict) -> str:
    clips = manifest["clips"]
    if not clips:
        return (
            "**Not run yet.** data/demo/audio/manifest.json has no clips, so there are no scores to report. "
            "See docs/blocked.md for why, and run `bash speech/codespace.sh` in the Codespace to produce them."
        )
    total_bytes = sum(c["bytes"] for c in clips.values())
    total_seconds = sum(c["seconds"] for c in clips.values())
    lines = [
        f"Generated {manifest.get('generatedAt')} (synthetic text, automated scores). "
        f"{len(clips)} clips, {total_seconds:.0f} s of audio, {total_bytes / 1024 / 1024:.2f} MB of MP3 "
        "(mono, 24 kHz, loudness-normalized to -16 LUFS).",
        "",
        "### Round trip by language and model",
        "",
        "| Language | Voice (text to speech) | Listener (speech to text) | Clips | Mean CER | Median CER | Audio (s) |",
        "|---|---|---|---|---|---|---|",
    ]
    rt = round_trip(manifest, transcripts)
    for r in rt:
        lines.append(
            f"| {LANG_NAMES.get(r['lang'], r['lang'])} | {r['tts']} | {r['asr']} | {r['clips']} "
            f"| {_f(r['mean'])} | {_f(r['median'])} | {r['seconds']:.1f} |"
        )
    lines += ["", "### Worst three clips per language", "", "| Language | Clip | Kind | Source | CER | Text (start) |", "|---|---|---|---|---|---|"]
    for r in rt:
        for key, kind, source, score, text in r["worst"]:
            snippet = text.replace("|", "/")[:48] + ("..." if len(text) > 48 else "")
            lines.append(f"| {LANG_NAMES.get(r['lang'], r['lang'])} | `{key}` | {kind} | {source} | {score:.3f} | {snippet} |")
    lines += ["", "### Mean CER by kind of clip", "", "| Language | Kind | Clips | Mean CER |", "|---|---|---|---|"]
    for lang, kind, n, mean in by_kind(manifest):
        lines.append(f"| {LANG_NAMES.get(lang, lang)} | {kind} | {n} | {_f(mean)} |")
    rows = model_runs(runs)
    lines += [
        "",
        "### Time and peak memory per model (Codespace CPU)",
        "",
        "Model time excludes downloading, loading and MP3 encoding. Peak memory is the worker process's "
        "maximum resident set size while the model ran.",
        "",
        "| Model | Job | Language | Clips | Audio (s) | Load (s) | Model seconds per audio second | Peak memory (MB) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        job = "text to speech" if row["task"] == "tts" else "speech to text"
        lines.append(
            f"| {row['model']} | {job} | {row['lang']} | {row['clips']} | {row['audio']:.1f} | {row['load']:.1f} "
            f"| {_f(row['per_second'], 2)} | {row['peak']:.0f} |"
        )
    if rows and rows[-1]["host"]:
        lines += ["", f"Machine: {rows[-1]['host']}; torch {rows[-1]['torch']}, {rows[-1]['threads']} threads."]
    return "\n".join(lines)


TEMPLATE = """# Speech results

Synthetic text, automated scores. Every clip voices a fictional household's card, practice phrase or help card, or a synthetic diary entry, and every score comes from an automated round trip: text to speech to text, scored by character error rate (CER) against the words the voice was asked to say. Nobody listened to these clips, so these are not listening tests.

{start}
{body}
{end}
"""


def write(path=None) -> str:
    path = path or RESULTS_DOC
    manifest = load_manifest(MANIFEST_PATH)
    transcripts = load_json(TRANSCRIPTS_PATH, {"clips": {}})
    runs = load_json(RUNS_PATH, {"runs": []})
    body = render(manifest, transcripts, runs)
    if path.exists() and START in path.read_text(encoding="utf-8"):
        text = path.read_text(encoding="utf-8")
        head, rest = text.split(START, 1)
        _, tail = rest.split(END, 1)
        new = f"{head}{START}\n{body}\n{END}{tail}"
    else:
        new = TEMPLATE.format(start=START, body=body, end=END)
    path.write_text(new, encoding="utf-8")
    return body


if __name__ == "__main__":
    print(write())
