"""Teacher drafts and the quality gate (docs/card-style.md, "The quality gate").

A teacher on Tinker writes each card with docs/card-style.md as its fixed system prompt and the
outing's facts as the user turn, exactly as GemmaCardWriter prompts Gemma. A draft passes when
the code checks pass (finetune/rubric.py plus the Telugu script check) and Gemma, a different
model family, rates its tone and register 4 or 5 with no unsupported facts. A failing draft is
regenerated once with its failures listed, the same corrective turn the app's writers use, then
dropped if it fails again. Kept cards become prompt-distillation examples: the facts prompt
alone, answered with the card's JSON.

Run: uv run python -m finetune.gate pilot | full --teacher <model>
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import statistics
import subprocess
from pathlib import Path
from typing import Any

from finetune import ledger
from finetune.cards import card_json, card_style, check_card, facts_prompt, parse_card
from finetune.env import FINETUNE_DATA, ROOT
from finetune.tinker_sample import TinkerSampler

OUTINGS = FINETUNE_DATA / "outings.jsonl"
JUDGE_DIR = FINETUNE_DATA / "judge"
PILOT_TEACHERS = ["Qwen/Qwen3.6-35B-A3B", "Qwen/Qwen3.5-397B-A17B", "moonshotai/Kimi-K2.6", "deepseek-ai/DeepSeek-V3.1"]
TEMPERATURE = 0.6
MAX_TOKENS = 400


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def slug(model: str) -> str:
    return model.split("/")[-1].lower()


def seed_for(outing_id: str, attempt: int) -> int:
    return int(hashlib.sha256(f"{outing_id}:{attempt}".encode()).hexdigest()[:8], 16)


# The teacher's fixed prompt is docs/card-style.md plus these notes, which spell out the code checks
# (finetune/rubric.py). The first pilot showed every teacher failing them on most first drafts. The
# student never sees either: it learns from the kept cards alone (prompt distillation).
TEACHER_NOTES = """## Checks every card must pass

Code checks each card, so follow these exactly:
- The title and body together have 60 words or fewer.
- Every name listed under "Names to keep exactly" appears exactly as written, in English letters.
- No other English words. Don't copy the bus's direction (the "toward ..." part of the trip) or any English or German words from "What's there"; say those things in Telugu.
- Every number is one from the input, written exactly the same: 13:45 stays 13:45, never 1:45. Don't add any other number, not even one that appears in "What's there" or a total of minutes.
- Address the parent once, at the start: అమ్మా for a mother, నాన్నగారు for a father.
- Use a respectful మీరు form at least once: మీరు, మీకు, or a verb ending in ండి, such as ఎక్కండి, దిగండి or చూడండి."""


def teacher_system() -> str:
    return f"{card_style().rstrip()}\n\n{TEACHER_NOTES}\n"


def teacher_messages(facts: dict[str, Any]) -> list[dict[str, str]]:
    return [{"role": "system", "content": teacher_system()}, {"role": "user", "content": facts_prompt(facts)}]


def run_judge(name: str, tasks: list[dict[str, Any]], judge: str = "gemma") -> dict[str, dict[str, Any]]:
    """Runs finetune/ts/judge.ts (Gemma through the repo's helper, or Kimi-K2.6 on Tinker for
    pairs) and returns verdicts by id."""
    if not tasks:
        return {}
    JUDGE_DIR.mkdir(parents=True, exist_ok=True)
    tasks_path, results_path = JUDGE_DIR / f"{name}-tasks.jsonl", JUDGE_DIR / f"{name}-results.jsonl"
    write_jsonl(tasks_path, tasks)
    extra = ["--judge=kimi"] if judge == "kimi" else []
    subprocess.run(
        ["pnpm", "exec", "tsx", "finetune/ts/judge.ts", str(tasks_path), str(results_path), *extra],
        cwd=ROOT,
        check=True,
        shell=True,
    )
    return {r["id"]: r for r in read_jsonl(results_path)}


def judge_failures(verdict: dict[str, Any] | None) -> list[str]:
    if verdict is None or "error" in verdict:
        return ["the judge could not read the card"]
    out = []
    if verdict["tone"] < 4:
        out.append(f"the tone and register need work ({verdict.get('problem') or f'rated {verdict['tone']} of 5'})")
    if not verdict["factsOk"]:
        out.append(f"something doesn't match the outing details ({verdict.get('problem') or 'unsupported fact'})")
    return out


async def draft(sampler: TinkerSampler, outing: dict[str, Any], messages: list[dict[str, str]], attempt: int) -> dict[str, Any]:
    s = await sampler.sample(messages, max_tokens=MAX_TOKENS, temperature=TEMPERATURE, seed=seed_for(outing["id"], attempt))
    card = parse_card(s.text)
    checks = check_card(card, outing["facts"]) if card else {"passed": False, "failures": ["the answer wasn't the JSON asked for"], "words": 0, "scriptOk": False}
    return {
        "id": outing["id"],
        "attempt": attempt,
        "raw": s.text,
        "card": card,
        "checks": checks,
        "promptTokens": s.prompt_tokens,
        "completionTokens": s.completion_tokens,
        "cachedTokens": s.cached_tokens,
        "costUsd": s.cost_usd,
        "latencyMs": s.latency_ms,
    }


def judge_drafts(name: str, outings: dict[str, dict[str, Any]], drafts: list[dict[str, Any]], *, judge_all: bool = False) -> None:
    """Adds Gemma's verdict to every draft that passed the code checks (or every readable one)."""
    tasks = [
        {"id": f"{d['id']}:{d['attempt']}", "task": "card", "facts": outings[d["id"]]["facts"], "card": d["card"]}
        for d in drafts
        if d["card"] and (judge_all or d["checks"]["passed"])
    ]
    verdicts = run_judge(name, tasks)
    for d in drafts:
        v = verdicts.get(f"{d['id']}:{d['attempt']}")
        d["verdict"] = v
        d["passedGate"] = bool(d["checks"]["passed"] and v and not judge_failures(v))


def estimate(model: str, n: int, prompt_tokens: int = 1150) -> float:
    """Worst case for n drafts: the full prompt uncached and every answer at max_tokens."""
    return n * ledger.sample_cost(model, prompt_tokens, MAX_TOKENS)


# Budget kept back for the training run and the evaluation, so drafting can't use it up.
RESERVE_FOR_TRAINING_AND_EVAL = 1.2


def measured_estimate(model: str, n: int, factor: float = 1.0) -> float:
    """n drafts at the pilot's measured cost per draft (cache hits included), with a 1.5x margin.
    Each call still passes the worst-case check before it is sent."""
    summary = json.loads((FINETUNE_DATA / "pilot/with-check-notes/summary.json").read_text(encoding="utf-8"))
    per = next(r["costPerDraftUsd"] for r in summary if r.get("teacher") == model)
    return n * per * factor * 1.5


async def pilot() -> None:
    outings = {o["id"]: o for o in read_jsonl(OUTINGS) if o["pilot"]}
    out_dir = FINETUNE_DATA / "pilot" / "with-check-notes"
    total = sum(estimate(m, len(outings)) for m in PILOT_TEACHERS)
    print(f"Pilot: {len(outings)} outings x {len(PILOT_TEACHERS)} teachers, worst case ${total:.3f}")
    ledger.check(total)
    summary = []
    for model in PILOT_TEACHERS:
        try:
            sampler = TinkerSampler(model, f"finetune:pilot:{slug(model)}")
        except Exception as e:  # a renderer or tokenizer this machine can't load
            print(f"{model}: skipped ({type(e).__name__}: {str(e)[:120]})")
            summary.append({"teacher": model, "skipped": f"{type(e).__name__}: {str(e)[:200]}"})
            continue
        drafts = await asyncio.gather(*(draft(sampler, o, teacher_messages(o["facts"]), 1) for o in outings.values()))
        judge_drafts(f"pilot-notes-{slug(model)}", outings, list(drafts), judge_all=True)
        write_jsonl(out_dir / f"{slug(model)}.jsonl", list(drafts))
        tones = [d["verdict"]["tone"] for d in drafts if d.get("verdict") and "tone" in d["verdict"]]
        row = {
            "teacher": model,
            "drafts": len(drafts),
            "codeChecksPass": sum(d["checks"]["passed"] for d in drafts),
            "judged": len(tones),
            "meanTone": round(statistics.mean(tones), 2) if tones else None,
            "tone4or5": sum(1 for t in tones if t >= 4),
            "factsOk": sum(1 for d in drafts if d.get("verdict") and d["verdict"].get("factsOk")),
            "passGate": sum(d["passedGate"] for d in drafts),
            "medianWords": statistics.median(d["checks"]["words"] for d in drafts),
            "costUsd": round(sum(d["costUsd"] for d in drafts), 4),
            "costPerDraftUsd": round(sum(d["costUsd"] for d in drafts) / len(drafts), 5),
            "medianLatencyMs": statistics.median(d["latencyMs"] for d in drafts),
            "cachedShare": round(sum(d["cachedTokens"] for d in drafts) / max(1, sum(d["promptTokens"] for d in drafts)), 2),
            "failures": sorted({f.split(":")[0] for d in drafts for f in d["checks"]["failures"]}),
        }
        summary.append(row)
        print(json.dumps(row, ensure_ascii=False))
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


async def full(teacher: str) -> None:
    rows = read_jsonl(OUTINGS)
    outings = {o["id"]: o for o in rows if o["split"] == "train"}
    expected = measured_estimate(teacher, len(outings))
    print(f"Full run: {len(outings)} outings with {teacher}, first drafts about ${expected:.3f} (pilot cost per draft x 1.5)")
    ledger.check(expected + RESERVE_FOR_TRAINING_AND_EVAL)
    sampler = TinkerSampler(teacher, f"finetune:teacher:{slug(teacher)}")
    first = await asyncio.gather(*(draft(sampler, o, teacher_messages(o["facts"]), 1) for o in outings.values()))
    judge_drafts("gate-1", outings, list(first))

    retry_rows = []
    for d in first:
        if d["passedGate"]:
            continue
        failures = d["checks"]["failures"] if not d["checks"]["passed"] else judge_failures(d.get("verdict"))
        messages = teacher_messages(outings[d["id"]]["facts"]) + [
            {"role": "assistant", "content": d["raw"]},
            {"role": "user", "content": f"Fix these and answer with the corrected JSON only: {'; '.join(failures)}"},
        ]
        retry_rows.append((d["id"], messages, failures))
    expected = measured_estimate(teacher, len(retry_rows), factor=1.4)
    print(f"Regenerating {len(retry_rows)} drafts, about ${expected:.3f} (longer prompts)")
    ledger.check(expected + RESERVE_FOR_TRAINING_AND_EVAL)
    second = await asyncio.gather(*(draft(sampler, outings[i], m, 2) for i, m, _ in retry_rows))
    for d, (_, _, failures) in zip(second, retry_rows, strict=True):
        d["fixing"] = failures
    judge_drafts("gate-2", outings, list(second))

    all_drafts = list(first) + list(second)
    write_jsonl(FINETUNE_DATA / "drafts.jsonl", all_drafts)
    kept = {d["id"]: d for d in all_drafts if d["passedGate"]}
    train = [
        {
            "id": i,
            "messages": [
                {"role": "user", "content": facts_prompt(outings[i]["facts"])},
                {"role": "assistant", "content": card_json(kept[i]["card"])},
            ],
            "attempt": kept[i]["attempt"],
            "provenance": "synthetic: teacher draft that passed the automated gate",
        }
        for i in outings
        if i in kept
    ]
    write_jsonl(FINETUNE_DATA / "train.jsonl", train)
    summary = {
        "teacher": teacher,
        "outings": len(outings),
        "firstDraftsPassed": sum(d["passedGate"] for d in first),
        "firstDraftCodeChecksPassed": sum(d["checks"]["passed"] for d in first),
        "regenerated": len(second),
        "regeneratedPassed": sum(d["passedGate"] for d in second),
        "kept": len(train),
        "dropped": len(outings) - len(train),
        "costUsd": round(sum(d["costUsd"] for d in all_drafts), 4),
        "promptTokens": sum(d["promptTokens"] for d in all_drafts),
        "cachedTokens": sum(d["cachedTokens"] for d in all_drafts),
        "completionTokens": sum(d["completionTokens"] for d in all_drafts),
        "codeFailures": sorted({f.split(":")[0] for d in all_drafts for f in d["checks"]["failures"]}),
    }
    (FINETUNE_DATA / "gate-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=["pilot", "full"])
    parser.add_argument("--teacher", default="Qwen/Qwen3.6-35B-A3B")
    args = parser.parse_args()
    asyncio.run(pilot() if args.step == "pilot" else full(args.teacher))


if __name__ == "__main__":
    main()
