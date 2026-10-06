"""The card writer's one LoRA training run on Qwen/Qwen3.5-4B (prompt distillation).

Each example is the facts prompt alone, answered with a teacher card that passed the gate; the
style guide is not in the prompt, so the adapter learns it. Rendered with the cookbook's
qwen3_5_disable_thinking renderer, which matches the chat template Tinker's OpenAI-compatible
endpoint applies with thinking off, and trained on the last assistant message only.
- First SFT run, conversation_to_datum, forward_backward and optim_step:
  https://tinker-docs.thinkingmachines.ai/tutorials/basics/first-sft/
- Prompt distillation: https://tinker-docs.thinkingmachines.ai/tutorials/advanced/prompt-distillation/
- Learning rate (get_lr) and rank: https://tinker-docs.thinkingmachines.ai/tinker/lora-primer/ and
  https://tinker-docs.thinkingmachines.ai/tutorials/advanced/sl-hyperparams/
- Sampler checkpoints: https://tinker-docs.thinkingmachines.ai/tinker/howto/checkpoints/
The token count and cost are estimated before anything is sent, written into the ledger notes,
and every forward pass is checked against the spend cap and logged. It refuses to run twice.

Run: uv run python -m finetune.train
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
from datetime import UTC, datetime
from typing import Any

import numpy as np

from finetune import ledger
from finetune.env import FINETUNE_DATA, load_env

BASE = "Qwen/Qwen3.5-4B"
RENDERER = "qwen3_5_disable_thinking"
RANK = 32
EPOCHS = 3
BATCH = 16
VALIDATION = 16
MAX_LENGTH = 1024
SEED = 20261006
TRAIN = FINETUNE_DATA / "train.jsonl"
ADAPTER = FINETUNE_DATA / "adapter.json"
METRICS = FINETUNE_DATA / "train-metrics.jsonl"


def nll(result: Any, data: list[Any]) -> float:
    logprobs = np.concatenate([np.asarray(out["logprobs"].tolist()) for out in result.loss_fn_outputs])
    weights = np.concatenate([np.asarray(d.loss_fn_inputs["weights"].tolist()) for d in data])
    return float(-np.dot(logprobs, weights) / weights.sum())


async def main(force: bool, dry_run: bool) -> None:
    if ADAPTER.exists() and not force:
        raise SystemExit(f"{ADAPTER.name} exists: the card writer is trained once. Pass --force only to redo a failed run.")
    load_env()
    import tinker
    from tinker_cookbook import renderers, tokenizer_utils
    from tinker_cookbook.hyperparam_utils import get_lr
    from tinker_cookbook.renderers import TrainOnWhat
    from tinker_cookbook.supervised.data import conversation_to_datum

    rows = [json.loads(line) for line in TRAIN.read_text(encoding="utf-8").splitlines() if line.strip()]
    rng = random.Random(SEED)
    rng.shuffle(rows)
    val_rows, train_rows = rows[:VALIDATION], rows[VALIDATION:]
    tokenizer = tokenizer_utils.get_tokenizer(BASE)
    renderer = renderers.get_renderer(RENDERER, tokenizer)

    def datum(r: dict[str, Any]) -> Any:
        return conversation_to_datum(r["messages"], renderer, max_length=MAX_LENGTH, train_on_what=TrainOnWhat.LAST_ASSISTANT_MESSAGE)

    train_data = [datum(r) for r in train_rows]
    val_data = [datum(r) for r in val_rows]
    lr = get_lr(BASE)
    steps_per_epoch = math.ceil(len(train_data) / BATCH)
    total_steps = steps_per_epoch * EPOCHS
    train_tokens = sum(d.model_input.length for d in train_data) * EPOCHS
    val_tokens = sum(d.model_input.length for d in val_data) * (EPOCHS + 1)
    estimate = ledger.train_cost(BASE, train_tokens + val_tokens)
    note = (
        f"estimate before the run: {len(train_data)} examples x {EPOCHS} epochs = {train_tokens:,} training tokens "
        f"plus {val_tokens:,} validation tokens, ${estimate:.4f} at ${ledger.price(BASE).train}/M"
    )
    print(note)
    ledger.check(estimate * 1.1)
    if dry_run:
        print(f"Dry run: {len(train_data)} training and {len(val_data)} validation examples, {total_steps} steps at lr {lr:.2e}.")
        return

    service = tinker.ServiceClient()
    tc = await service.create_lora_training_client_async(base_model=BASE, rank=RANK, seed=SEED)
    metrics: list[dict[str, Any]] = []
    first_entry = True

    def log(purpose: str, tokens: int) -> None:
        nonlocal first_entry
        ledger.record(
            model=BASE,
            purpose=purpose,
            prompt_tokens=tokens,
            completion_tokens=0,
            cost_usd=ledger.train_cost(BASE, tokens),
            kind="train",
            notes=note if first_entry else None,
        )
        first_entry = False

    async def validate(epoch: int) -> float:
        tokens = sum(d.model_input.length for d in val_data)
        ledger.check(ledger.train_cost(BASE, tokens))
        fut = await tc.forward_async(val_data, "cross_entropy")
        value = nll(await fut.result_async(), val_data)
        log("finetune:validation", tokens)
        metrics.append({"epoch": epoch, "validationNll": value})
        print(f"epoch {epoch}: validation NLL {value:.4f}")
        return value

    await validate(0)
    checkpoints: list[dict[str, Any]] = []
    step = 0
    for epoch in range(1, EPOCHS + 1):
        order = list(range(len(train_data)))
        random.Random(SEED + epoch).shuffle(order)
        for b in range(steps_per_epoch):
            batch = [train_data[i] for i in order[b * BATCH : (b + 1) * BATCH]]
            tokens = sum(d.model_input.length for d in batch)
            ledger.check(ledger.train_cost(BASE, tokens))
            step_lr = lr * (1 - step / total_steps)
            fb = await tc.forward_backward_async(batch, "cross_entropy")
            opt = await tc.optim_step_async(tinker.AdamParams(learning_rate=step_lr))
            result = await fb.result_async()
            await opt.result_async()
            log("finetune:train", tokens)
            metrics.append({"epoch": epoch, "step": step, "lr": step_lr, "tokens": tokens, "trainNll": nll(result, batch)})
            step += 1
        value = await validate(epoch)
        saved = await tc.save_weights_for_sampler_async(f"card-writer-te-epoch{epoch}")
        path = (await saved.result_async()).path
        checkpoints.append({"epoch": epoch, "path": path, "validationNll": value})
        print(f"epoch {epoch}: saved {path}")
        # Kept as it goes, so a failure later in the run never needs a second training run.
        (FINETUNE_DATA / "train-checkpoints.json").write_text(json.dumps(checkpoints, indent=1) + "\n", encoding="utf-8")
        METRICS.write_text("".join(json.dumps(m) + "\n" for m in metrics), encoding="utf-8")

    best = min(checkpoints, key=lambda c: (round(c["validationNll"], 4), -c["epoch"]))
    METRICS.write_text("".join(json.dumps(m) + "\n" for m in metrics), encoding="utf-8")
    record = {
        "model": best["path"],
        "baseModel": BASE,
        "chosenEpoch": best["epoch"],
        "why": "lowest validation NLL on held-back training examples",
        "checkpoints": checkpoints,
        "renderer": RENDERER,
        "loraRank": RANK,
        "learningRate": lr,
        "schedule": "linear decay to 0",
        "epochs": EPOCHS,
        "batchSize": BATCH,
        "trainExamples": len(train_data),
        "validationExamples": len(val_data),
        "trainTokens": train_tokens,
        "validationTokens": val_tokens,
        "estimatedCostUsd": round(estimate, 4),
        "trainedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "data": "synthetic outings built from public place listings and a fictional family; teacher Qwen/Qwen3.5-397B-A17B",
        "huggingFace": None,
    }
    ADAPTER.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Chose epoch {best['epoch']}: {best['path']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.force, args.dry_run))
