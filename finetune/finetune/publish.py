"""Publishes the trained adapter to Hugging Face as a PEFT LoRA with a model card.

Downloads the chosen sampler checkpoint, converts Tinker's keys to PEFT names, adds the model
card from data/demo/finetune/model-card.md, and uploads it to a public model repo under the
account HF_TOKEN belongs to. The token is read from the environment and never printed.
- Download and convert: https://tinker-docs.thinkingmachines.ai/cookbook/deployment/lora-adapter/
- Publish: https://tinker-docs.thinkingmachines.ai/cookbook/deployment/publish-hub/
- Hub uploads: https://huggingface.co/docs/huggingface_hub/guides/upload
Weights land in finetune/.checkpoints/ (gitignored); nothing large is committed.

Run: uv run python -m finetune.publish
"""

from __future__ import annotations

import json
import os
import shutil

from finetune.env import FINETUNE_DATA, ROOT, load_env

ADAPTER = FINETUNE_DATA / "adapter.json"
CARD = FINETUNE_DATA / "model-card.md"
WORK = ROOT / "finetune/.checkpoints"
REPO_NAME = "roundtrip-card-writer-te-qwen3.5-4b-lora"


def main() -> None:
    load_env()
    from huggingface_hub import HfApi
    from tinker_cookbook import weights

    record = json.loads(ADAPTER.read_text(encoding="utf-8"))
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise SystemExit("HF_TOKEN is not set.")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    base_license = (api.model_info(record["baseModel"]).card_data or {}).get("license")
    print(f"Base model license: {base_license}")

    raw_dir, peft_dir = WORK / "tinker-adapter", WORK / "peft-adapter"
    for d in (raw_dir, peft_dir):
        if d.exists():
            shutil.rmtree(d)
    downloaded = weights.download(tinker_path=record["model"], output_dir=str(raw_dir))
    weights.build_lora_adapter(base_model=record["baseModel"], adapter_path=str(downloaded), output_path=str(peft_dir))
    size = sum(p.stat().st_size for p in peft_dir.rglob("*") if p.is_file())
    print(f"PEFT adapter: {sorted(p.name for p in peft_dir.iterdir())}, {size / 1e6:.1f} MB")
    shutil.copyfile(CARD, peft_dir / "README.md")

    repo_id = f"{user}/{REPO_NAME}"
    url = weights.publish_to_hf_hub(model_path=str(peft_dir), repo_id=repo_id, private=False, token=token)
    record["huggingFace"] = url
    record["adapterMegabytes"] = round(size / 1e6, 1)
    record["license"] = base_license
    ADAPTER.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Published {url}")


if __name__ == "__main__":
    main()
