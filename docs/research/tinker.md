# Tinker notes

What the card-writer fine-tune relies on, from Tinker's documentation (read 2026-10-06). The docs list every page at https://tinker-docs.thinkingmachines.ai/llms.txt, and each page has a plain-text version at `<page>/index.md`.

## Models and prices

Source: https://tinker-docs.thinkingmachines.ai/tinker/models/models_and_pricing/

- Prices are per million tokens: prefill (prompt), sample (output) and train (forward and backward passes). Cached prefill costs 20% of the prefill price. Checkpoint storage costs $0.10 per GB a month.
- Prices used here (standard context): Qwen3.5-4B $0.33 prefill, $0.066 cached, $1.005 sample, $0.737 train. Qwen3.6-35B-A3B $0.54, $0.108, $1.335. Qwen3.5-397B-A17B $3.00, $0.60, $7.50. Kimi-K2.6 $2.205, $0.441, $5.49. DeepSeek-V3.1 $1.695, $0.339, $4.215. The same numbers are in `finetune/finetune/ledger.py` and `agent/src/tinker/client.ts`.
- Mixture-of-experts models are priced by active parameters, which is why the teacher candidates were all MoE models.
- Hybrid models (Qwen3.5 and 3.6, Kimi-K2.6) think by default; a renderer or argument turns that off. The page also lists models Tinker retired in June and July 2026, which is the case for publishing the adapter's weights.
- The JSON behind the tables (`models.json`) is the stable interface for scripts.

## Sampling

Sources: https://tinker-docs.thinkingmachines.ai/tinker/api-reference/samplingclient/, https://tinker-docs.thinkingmachines.ai/tinker/api-reference/types/samplingparams/, https://tinker-docs.thinkingmachines.ai/tutorials/basics/async-patterns/

- `ServiceClient().create_sampling_client(base_model=...)` or `model_path=` a `tinker://` sampler path. `sample_async(prompt, num_samples, sampling_params)` takes a rendered `ModelInput`.
- `SamplingParams` has `max_tokens`, `temperature`, `top_p`, `top_k`, `stop` and `seed`.
- Send many requests at once with `asyncio.gather`; Tinker batches them.
- Since SDK 0.23.0, a sample response reports `prompt_cache_hit_tokens`, the prompt tokens billed at the cached price (changelog, https://tinker-docs.thinkingmachines.ai/changelog/). In the teacher run, 89% of prompt tokens were cache hits because docs/card-style.md is the same first message every time.

## Renderers

Source: https://tinker-docs.thinkingmachines.ai/tutorials/core-concepts/rendering/

- A renderer turns chat messages into tokens. Qwen3.5 and 3.6 share `qwen3_5` (thinking on) and `qwen3_5_disable_thinking` (an empty think block, so the model answers directly). Kimi-K2.6 has `kimi_k26_disable_thinking`; DeepSeek-V3.1 uses `deepseekv3`.
- `build_supervised_example` weights only the last assistant message by default. The default renderers match Hugging Face's chat template, so a model trained with them works on the OpenAI-compatible endpoint. Checked here: the disable-thinking renderer's generation prompt is byte for byte the template with `enable_thinking=False`.
- The cookbook's Inkling renderers need the `tml-renderers` package, which has no Windows wheels, so `finetune/pyproject.toml` skips it on Windows. Nothing here uses Inkling.

## Supervised fine-tuning and prompt distillation

Sources: https://tinker-docs.thinkingmachines.ai/tutorials/basics/first-sft/, https://tinker-docs.thinkingmachines.ai/tutorials/advanced/prompt-distillation/, https://tinker-docs.thinkingmachines.ai/cookbook/recipes/prompt-distillation/, https://tinker-docs.thinkingmachines.ai/tinker/lora-primer/, https://tinker-docs.thinkingmachines.ai/tutorials/advanced/sl-hyperparams/

- `create_lora_training_client_async(base_model, rank)`, then per step `forward_backward_async(data, "cross_entropy")` and `optim_step_async(AdamParams(learning_rate=...))`, submitting both before waiting. `forward_async` gives a loss without gradients (billed at the training price).
- `conversation_to_datum(messages, renderer, max_length, train_on_what=LAST_ASSISTANT_MESSAGE)` builds a training example.
- Prompt distillation: a teacher answers with a long instruction prompt; the student is trained on the same inputs without it, so it learns to behave as if the prompt were there. The student copies the teacher's habits and mistakes, so the gate filters the teacher's drafts first.
- LoRA needs about ten times the full fine-tuning learning rate; `hyperparam_utils.get_lr("Qwen/Qwen3.5-4B")` gives 4.9e-4. Rank 32 is the default and is plenty when the adapter has more parameters than the completion tokens (72.9 million at rank 32 for this model). LoRA prefers smaller batches. Use a held-out loss to catch overfitting.

## Checkpoints and the OpenAI-compatible endpoint

Sources: https://tinker-docs.thinkingmachines.ai/tinker/howto/checkpoints/, https://tinker-docs.thinkingmachines.ai/tinker/compatible-apis/openai/

- `save_weights_for_sampler(name)` saves weights only and returns a `tinker://<run_id>/sampler_weights/<name>` path. A TTL is optional; without one the checkpoint stays until deleted.
- That path works as the `model` on the OpenAI-compatible endpoint (`https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1`, `/chat/completions`), which applies the Hugging Face chat template. `reasoning_effort` "none" (0.0) turns thinking off. The endpoint is meant for testing and light internal use, so the app records every card and replays it.

## Exporting and publishing the adapter

Sources: https://tinker-docs.thinkingmachines.ai/cookbook/deployment/lora-adapter/, https://tinker-docs.thinkingmachines.ai/cookbook/deployment/publish-hub/, https://tinker-docs.thinkingmachines.ai/cookbook/api-reference/weights/download/

- A sampler checkpoint downloads as an archive with Tinker's own `adapter_model.safetensors` and `adapter_config.json`. `weights.download(tinker_path, output_dir)` fetches it through a signed URL.
- `weights.build_lora_adapter(base_model, adapter_path, output_path)` remaps the keys to the PEFT names vLLM, SGLang and `peft` expect. It reads only the base model's config.
- `weights.publish_to_hf_hub(model_path, repo_id, model_card=ModelCardConfig(...), private=False)` uploads the folder with `HF_TOKEN`. Repositories are private unless `private=False`. An existing README.md in the folder is kept instead of the generated card.
