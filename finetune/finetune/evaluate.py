"""Evaluation on the 40 held-out outings: base Qwen3.5-4B, the tuned adapter, and the Gemma writer.

Every writer runs through the app's own code (finetune/ts/write.ts): GemmaCardWriter, and
TinkerCardWriter for the base model (with docs/card-style.md as its prompt) and for the adapter
(facts only, as trained). Each gets one corrective regeneration, as in the app. Then:
- the code checks (finetune/rubric.py and the Telugu script check) on every final card;
- Gemma rates every card's tone and facts (agent/src/cards/judge.ts);
- order-swapped pairs: tuned vs base and tuned vs Gemma judged by Gemma, and tuned vs Gemma again
  by Kimi-K2.6, a third family, because Gemma may favor its own card.
All of it is synthetic and automated, not reviewed by native speakers.

Run: uv run python -m finetune.evaluate write | judge | report | all
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import subprocess
from typing import Any

from finetune.cards import check_card, check_script
from finetune.env import FINETUNE_DATA, ROOT
from finetune.gate import read_jsonl, run_judge, write_jsonl
from finetune.pairwise import judge_pairs

EVAL = FINETUNE_DATA / "eval"
WRITERS = ["tinker-base", "tinker-lora", "gemma"]
LABEL = {
    "tinker-base": "Qwen3.5-4B base, card-style prompt",
    "tinker-lora": "Qwen3.5-4B + LoRA, facts only",
    "gemma": "Gemma 4 26B A4B, card-style prompt (current writer)",
}
CHECKS = [
    ("60 words or fewer", "more than 60"),
    ("Every given name, exactly", "missing exact name"),
    ("No number outside the input", "number not in the input"),
    ("No other Latin-script text", "Latin-script text not in the input"),
    ("Right address form", "doesn't address"),
    ("A respectful మీరు form", "no respectful"),
]


def outings() -> list[dict[str, Any]]:
    return [o for o in read_jsonl(FINETUNE_DATA / "outings.jsonl") if o["split"] == "eval"]


def cards(writer: str) -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in read_jsonl(EVAL / f"cards-{writer}.jsonl") if "error" not in r}


def write() -> None:
    EVAL.mkdir(parents=True, exist_ok=True)
    write_jsonl(EVAL / "outings.jsonl", [{"id": o["id"], "facts": o["facts"]} for o in outings()])
    for w in WRITERS:
        subprocess.run(
            ["pnpm", "exec", "tsx", "finetune/ts/write.ts", w, str(EVAL / "outings.jsonl"), str(EVAL / f"cards-{w}.jsonl")],
            cwd=ROOT,
            check=True,
            shell=True,
        )


def judge() -> None:
    facts = {o["id"]: o["facts"] for o in outings()}
    for w in WRITERS:
        tasks = [
            {"id": i, "task": "card", "facts": facts[i], "card": {"title": c["title"], "body": c["body"]}}
            for i, c in cards(w).items()
        ]
        run_judge(f"eval-tone-{w}", tasks)
    text = {w: {i: {"title": c["title"], "body": c["body"]} for i, c in cards(w).items()} for w in WRITERS}
    pairs = {
        "tuned vs base (Gemma judge)": judge_pairs("eval-pair-lora-vs-base", facts, text["tinker-lora"], text["tinker-base"]),
        "tuned vs Gemma writer (Gemma judge)": judge_pairs("eval-pair-lora-vs-gemma", facts, text["tinker-lora"], text["gemma"]),
        "tuned vs Gemma writer (Kimi-K2.6 judge)": judge_pairs(
            "eval-pair-lora-vs-gemma-kimi", facts, text["tinker-lora"], text["gemma"], judge="kimi"
        ),
    }
    (EVAL / "pairs.json").write_text(json.dumps(pairs, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def wilson(k: int, n: int) -> str:
    if n == 0:
        return "n/a"
    z, p = 1.96, k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return f"{max(0, centre - half):.0%} to {min(1, centre + half):.0%}"


def tone_verdicts(writer: str) -> dict[str, dict[str, Any]]:
    path = FINETUNE_DATA / "judge" / f"eval-tone-{writer}-results.jsonl"
    return {r["id"]: r for r in read_jsonl(path) if "error" not in r}


def metrics(writer: str, n_outings: int) -> dict[str, Any]:
    facts = {o["id"]: o["facts"] for o in outings()}
    written = cards(writer)
    verdicts = tone_verdicts(writer)
    rows = []
    for i, c in written.items():
        check = check_card({"title": c["title"], "body": c["body"]}, facts[i])
        f = check["failures"]
        given = facts[i]["names"]
        text = f"{c['title']} {c['body']}"
        v = verdicts.get(i)
        walks = re.findall(r"walk (\d+) minutes", facts[i]["trip"])
        rows.append(
            {
                "id": i,
                "passed": check["passed"],
                "firstDraftPassed": check["passed"] and c.get("attempts") == 1,
                "failures": f,
                "words": check["words"],
                "scriptOk": check["scriptOk"],
                "teluguShare": check_script(c["body"]).telugu_share,
                "namesGiven": len(given),
                "namesKept": sum(1 for n in given if n in text),
                "inventedLatin": [x.split(": ", 1)[1] for x in f if x.startswith("Latin-script text not in the input")],
                "inventedNumbers": [x.split(": ", 1)[1] for x in f if x.startswith("number not in the input")],
                "walks": len(walks),
                "walksStated": sum(1 for m in walks if re.search(rf"(?<!\d){m}\s?-?\s?నిమిష", text)),
                "latencyMs": c["writer"]["latencyMs"],
                "attempts": c.get("attempts"),
                "tone": v["tone"] if v else None,
                "factsOk": v["factsOk"] if v else None,
            }
        )
    n = len(rows)
    tones = [r["tone"] for r in rows if r["tone"] is not None]
    gate = sum(1 for r in rows if r["passed"] and r["tone"] is not None and r["tone"] >= 4 and r["factsOk"])
    return {
        "writer": writer,
        "label": LABEL[writer],
        "outings": n_outings,
        "cards": n,
        "passed": sum(r["passed"] for r in rows),
        "firstDraftPassed": sum(r["firstDraftPassed"] for r in rows),
        "checks": {name: sum(1 for r in rows if not any(key in x for x in r["failures"])) for name, key in CHECKS},
        "scriptOk": sum(r["scriptOk"] for r in rows),
        "meanTeluguShare": round(statistics.mean(r["teluguShare"] for r in rows), 3) if rows else None,
        "namesGiven": sum(r["namesGiven"] for r in rows),
        "namesKept": sum(r["namesKept"] for r in rows),
        "cardsWithAllNames": sum(1 for r in rows if r["namesKept"] == r["namesGiven"]),
        "cardsWithInventedLatin": sum(1 for r in rows if r["inventedLatin"]),
        "inventedLatin": sorted({x for r in rows for x in r["inventedLatin"]}),
        "cardsWithInventedNumbers": sum(1 for r in rows if r["inventedNumbers"]),
        "inventedNumbers": sorted({x for r in rows for x in r["inventedNumbers"]}),
        "words": {
            "median": statistics.median(r["words"] for r in rows) if rows else None,
            "mean": round(statistics.mean(r["words"] for r in rows), 1) if rows else None,
            "min": min((r["words"] for r in rows), default=None),
            "max": max((r["words"] for r in rows), default=None),
            "over60": sum(1 for r in rows if r["words"] > 60),
        },
        "walks": sum(r["walks"] for r in rows),
        "walksStated": sum(r["walksStated"] for r in rows),
        "medianLatencyMs": statistics.median(r["latencyMs"] for r in rows) if rows else None,
        "regenerated": sum(1 for r in rows if r["attempts"] == 2),
        "judged": len(tones),
        "meanTone": round(statistics.mean(tones), 2) if tones else None,
        "tone4or5": sum(1 for t in tones if t >= 4),
        "factsOk": sum(1 for r in rows if r["factsOk"]),
        "fullGate": gate,
        "rows": rows,
    }


def report() -> None:
    n = len(outings())
    results = {w: metrics(w, n) for w in WRITERS}
    pairs = json.loads((EVAL / "pairs.json").read_text(encoding="utf-8")) if (EVAL / "pairs.json").exists() else {}
    (EVAL / "results.json").write_text(json.dumps({"writers": results, "pairs": pairs}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cols = [results[w] for w in WRITERS]
    head = "| | " + " | ".join(c["label"] for c in cols) + " |\n|---|" + "---|" * len(cols)
    pct = lambda k, m: f"{k}/{m} ({k / m:.0%})" if m else "n/a"  # noqa: E731
    lines = ["## Rubric pass rate per check (final cards)", "", head]
    lines.append("| Cards written | " + " | ".join(f"{c['cards']}/{c['outings']}" for c in cols) + " |")
    for name, _ in CHECKS:
        lines.append(f"| {name} | " + " | ".join(pct(c["checks"][name], c["cards"]) for c in cols) + " |")
    lines.append("| Telugu script intact | " + " | ".join(pct(c["scriptOk"], c["cards"]) for c in cols) + " |")
    lines.append("| **All code checks** | " + " | ".join(f"**{pct(c['passed'], c['cards'])}**" for c in cols) + " |")
    lines.append("| 95% interval | " + " | ".join(wilson(c["passed"], c["cards"]) for c in cols) + " |")
    lines.append("| First draft passed | " + " | ".join(pct(c["firstDraftPassed"], c["cards"]) for c in cols) + " |")
    lines.append("| Regenerated once | " + " | ".join(str(c["regenerated"]) for c in cols) + " |")
    lines += ["", "## Name preservation", "", head]
    lines.append("| Given names kept exactly | " + " | ".join(pct(c["namesKept"], c["namesGiven"]) for c in cols) + " |")
    lines.append("| Cards with every given name | " + " | ".join(pct(c["cardsWithAllNames"], c["cards"]) for c in cols) + " |")
    lines.append("| Cards with invented Latin-script text | " + " | ".join(str(c["cardsWithInventedLatin"]) for c in cols) + " |")
    lines.append("| Cards with invented numbers | " + " | ".join(str(c["cardsWithInventedNumbers"]) for c in cols) + " |")
    lines += ["", "## Words, script and speed", "", head]
    lines.append("| Median words (min to max) | " + " | ".join(f"{c['words']['median']} ({c['words']['min']} to {c['words']['max']})" for c in cols) + " |")
    lines.append("| Walk minutes stated (walks in the trips) | " + " | ".join(pct(c["walksStated"], c["walks"]) for c in cols) + " |")
    lines.append("| Over 60 words | " + " | ".join(str(c["words"]["over60"]) for c in cols) + " |")
    lines.append("| Mean Telugu share of letters | " + " | ".join(f"{c['meanTeluguShare']:.0%}" for c in cols) + " |")
    lines.append("| Median ms per card (first run) | " + " | ".join(f"{c['medianLatencyMs']:,.0f}" for c in cols) + " |")
    lines += ["", "## Gemma's tone and facts verdicts", "", head]
    lines.append("| Mean tone (1 to 5) | " + " | ".join(str(c["meanTone"]) for c in cols) + " |")
    lines.append("| Tone 4 or 5 | " + " | ".join(pct(c["tone4or5"], c["judged"]) for c in cols) + " |")
    lines.append("| Facts supported | " + " | ".join(pct(c["factsOk"], c["judged"]) for c in cols) + " |")
    lines.append("| **Full gate (code checks, tone 4+, facts)** | " + " | ".join(f"**{pct(c['fullGate'], c['cards'])}**" for c in cols) + " |")
    if pairs:
        lines += ["", "## Order-swapped pairwise judge", "", "| Pair | Tuned wins | Other wins | Ties | Orders disagreed |", "|---|---|---|---|---|"]
        for name, p in pairs.items():
            lines.append(f"| {name} | {p['firstWins']} | {p['secondWins']} | {p['ties']} | {p['ordersDisagreed']} of {p['pairs']} |")
    (EVAL / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["write", "judge", "report", "all"])
    step = parser.parse_args().step
    if step in ("write", "all"):
        write()
    if step in ("judge", "all"):
        judge()
    if step in ("report", "all"):
        report()
