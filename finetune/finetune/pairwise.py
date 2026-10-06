"""Order-swapped pairwise judging with Gemma (agent/src/cards/judge.ts judgePair).

Each pair is judged twice, once with each card first. A card wins only when both orders pick
it; any disagreement, or a tie in either order, counts as a tie. This cancels position bias.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from finetune.gate import run_judge


def judge_pairs(
    name: str,
    facts_by_id: dict[str, dict[str, Any]],
    first: dict[str, dict[str, str]],
    second: dict[str, dict[str, str]],
    judge: str = "gemma",
) -> dict[str, Any]:
    """first and second map outing ids to cards. Returns per-outing outcomes and the tally."""
    ids = sorted(set(first) & set(second))
    tasks = []
    for i in ids:
        tasks.append({"id": f"{i}:ab", "task": "pair", "facts": facts_by_id[i], "a": first[i], "b": second[i]})
        tasks.append({"id": f"{i}:ba", "task": "pair", "facts": facts_by_id[i], "a": second[i], "b": first[i]})
    verdicts = run_judge(name, tasks, judge)
    outcomes: dict[str, str] = {}
    disagreements = 0
    for i in ids:
        ab, ba = verdicts.get(f"{i}:ab", {}), verdicts.get(f"{i}:ba", {})
        # In the swapped order, "A" means the second system's card.
        pick_ab = {"A": "first", "B": "second"}.get(ab.get("better", ""), "tie")
        pick_ba = {"A": "second", "B": "first"}.get(ba.get("better", ""), "tie")
        outcomes[i] = pick_ab if pick_ab == pick_ba else "tie"
        if pick_ab != pick_ba:
            disagreements += 1
    tally = Counter(outcomes.values())
    position = Counter(v.get("better", "error") for v in verdicts.values())
    return {
        "pairs": len(ids),
        "firstWins": tally.get("first", 0),
        "secondWins": tally.get("second", 0),
        "ties": tally.get("tie", 0),
        "ordersDisagreed": disagreements,
        "picksByPosition": dict(position),
        "outcomes": outcomes,
    }
