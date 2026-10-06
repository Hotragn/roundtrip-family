"""Give the training run's unused sampler checkpoints a time to live on Tinker.

Storage costs $0.10 per GB a month (docs/research/tinker.md), and only the checkpoint that
data/demo/finetune/adapter.json points at is used: the app samples it. Every other checkpoint in
train-checkpoints.json gets a TTL, so it is removed when that runs out. Until then it can be kept
again with `set_checkpoint_ttl_from_tinker_path(path, ttl_seconds=None)`.
Docs: https://tinker-docs.thinkingmachines.ai/tinker/howto/checkpoints/

    uv run python -m finetune.expire --dry-run
    uv run python -m finetune.expire --days 1
"""

from __future__ import annotations

import argparse
import json

from finetune.env import FINETUNE_DATA, load_env


def unused_checkpoints() -> tuple[str, list[str]]:
    """The served checkpoint, and every other one the training run saved."""
    keep = json.loads((FINETUNE_DATA / "adapter.json").read_text(encoding="utf-8"))["model"]
    saved = json.loads((FINETUNE_DATA / "train-checkpoints.json").read_text(encoding="utf-8"))
    return keep, [c["path"] for c in saved if c["path"] != keep]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=float, default=1.0, help="time to live for unused checkpoints")
    parser.add_argument("--dry-run", action="store_true", help="list them without calling Tinker")
    args = parser.parse_args()

    keep, unused = unused_checkpoints()
    print(f"keeping {keep}")
    if args.dry_run or not unused:
        for path in unused:
            print(f"would expire in {args.days:g} day(s): {path}")
        return

    load_env()
    import tinker

    rest = tinker.ServiceClient().create_rest_client()
    for path in unused:
        rest.set_checkpoint_ttl_from_tinker_path(path, ttl_seconds=int(args.days * 86400)).result()
        print(f"expires in {args.days:g} day(s): {path}")


if __name__ == "__main__":
    main()
