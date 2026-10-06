"""Tinker spend cap and ledger, the same rules as agent/src/tinker/client.ts.

Every paid Tinker call is checked against MAX_TINKER_SPEND_USD before it is made (worst case:
the whole prompt at the uncached prefill price plus max_tokens of sampling) and logged to
data/demo/usage/tinker-ledger.jsonl afterwards with its actual tokens and estimated cost.
`pnpm costs` sums the same file into docs/costs.md. The cap value is never printed.

Prices per million tokens, from https://tinker-docs.thinkingmachines.ai/tinker/models/models_and_pricing/
(checked 2026-10-06). Cached prefill is billed at 20% of the prefill price; Tinker reports the
cached part as prompt_cache_hit_tokens (changelog, SDK 0.23.0).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime

from finetune.env import USAGE, load_env

LEDGER = USAGE / "tinker-ledger.jsonl"


@dataclass(frozen=True)
class Price:
    prefill: float
    cached_prefill: float
    sample: float
    train: float


PRICES: dict[str, Price] = {
    "Qwen/Qwen3.5-4B": Price(0.33, 0.066, 1.005, 0.737),
    "Qwen/Qwen3.5-9B": Price(0.66, 0.132, 1.995, 1.463),
    "Qwen/Qwen3.6-35B-A3B": Price(0.54, 0.108, 1.335, 1.177),
    "Qwen/Qwen3.5-397B-A17B": Price(3.00, 0.60, 7.50, 6.60),
    "moonshotai/Kimi-K2.6": Price(2.205, 0.441, 5.49, 4.84),
    "deepseek-ai/DeepSeek-V3.1": Price(1.695, 0.339, 4.215, 3.718),
}


class SpendCapReached(RuntimeError):
    def __init__(self, spent: float, next_cost: float) -> None:
        super().__init__(
            f"Tinker spend cap: ${spent:.4f} spent, the next call costs up to ${next_cost:.4f}, "
            "which would pass MAX_TINKER_SPEND_USD."
        )


def price(model: str) -> Price:
    base = "Qwen/Qwen3.5-4B" if model.startswith("tinker://") else model
    if base not in PRICES:
        raise KeyError(f"No Tinker price for {model}; add it to PRICES first.")
    return PRICES[base]


def sample_cost(model: str, prompt_tokens: int, completion_tokens: int, cached_tokens: int = 0) -> float:
    p = price(model)
    uncached = max(0, prompt_tokens - cached_tokens)
    return (uncached * p.prefill + cached_tokens * p.cached_prefill + completion_tokens * p.sample) / 1_000_000


def train_cost(model: str, tokens: int) -> float:
    return tokens * price(model).train / 1_000_000


def spent() -> float:
    if not LEDGER.exists():
        return 0.0
    total = 0.0
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        if line.strip():
            total += float(json.loads(line).get("costUsd", 0))
    return total


def _cap() -> float:
    load_env()
    try:
        value = float(os.environ.get("MAX_TINKER_SPEND_USD", ""))
    except ValueError:
        return 0.0
    return value if value > 0 else 0.0


def fits(estimate: float) -> bool:
    """True when `estimate` more dollars stays under the cap. Says nothing about the cap itself."""
    return spent() + estimate <= _cap()


def check(estimate: float) -> None:
    if not fits(estimate):
        raise SpendCapReached(spent(), estimate)


def record(
    *,
    model: str,
    purpose: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    kind: str = "sample",
    cached_tokens: int | None = None,
    notes: str | None = None,
) -> None:
    entry: dict[str, object] = {
        "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "model": model,
        "purpose": purpose,
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "costUsd": cost_usd,
        "kind": kind,
        "service": "tinker",
    }
    if cached_tokens is not None:
        entry["cachedTokens"] = cached_tokens
    if notes:
        entry["notes"] = notes
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    import sys

    if len(sys.argv) == 3 and sys.argv[1] == "--fits":
        print("fits under the cap" if fits(float(sys.argv[2])) else "does not fit under the cap")
    else:
        print(f"Tinker spend so far: ${spent():.4f}")
