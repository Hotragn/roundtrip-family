"""Sampling base models on Tinker for teacher drafts, with the spend cap and a local cache.

Uses the SDK's SamplingClient, which the docs recommend over the OpenAI-compatible endpoint
for anything beyond light testing, with the cookbook renderer for each model family:
- SamplingClient.sample and SamplingParams: https://tinker-docs.thinkingmachines.ai/tinker/api-reference/samplingclient/
- Renderers, and qwen3_5_disable_thinking for direct answers: https://tinker-docs.thinkingmachines.ai/tutorials/core-concepts/rendering/
- Concurrent requests with asyncio.gather: https://tinker-docs.thinkingmachines.ai/tutorials/basics/async-patterns/
The long instructions go first and never change, so repeated prompts share a cached prefix
(billed at 20% of prefill; SampleResponse.prompt_cache_hit_tokens reports it).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from finetune import ledger
from finetune.env import FINETUNE_DATA, load_env

RENDERERS = {
    "Qwen/": "qwen3_5_disable_thinking",
    "moonshotai/Kimi-K2.6": "kimi_k26_disable_thinking",
    "deepseek-ai/DeepSeek-V3.1": "deepseekv3",
}

CACHE = FINETUNE_DATA / "tinker-sample-cache.jsonl"


def renderer_name(model: str) -> str:
    for prefix, name in RENDERERS.items():
        if model.startswith(prefix):
            return name
    raise KeyError(f"No renderer chosen for {model}")


def cache_key(model: str, messages: list[dict[str, str]], max_tokens: int, temperature: float, seed: int) -> str:
    raw = json.dumps(
        {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature, "seed": seed},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class Sample:
    text: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int
    cost_usd: float
    latency_ms: int
    cached: bool


class TinkerSampler:
    """One sampler per base model. Calls run concurrently up to `concurrency`."""

    _in_flight = 0.0

    def __init__(self, model: str, purpose: str, concurrency: int = 8, cache_path: Path = CACHE) -> None:
        load_env()
        import tinker
        from tinker_cookbook import renderers, tokenizer_utils

        self.model = model
        self.purpose = purpose
        self._tinker = tinker
        self.tokenizer = tokenizer_utils.get_tokenizer(model)
        self.renderer = renderers.get_renderer(renderer_name(model), self.tokenizer)
        self.client = tinker.ServiceClient().create_sampling_client(base_model=model)
        self.sem = asyncio.Semaphore(concurrency)
        self.cache_path = cache_path
        self.cache: dict[str, dict[str, Any]] = {}
        if cache_path.exists():
            for line in cache_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    row = json.loads(line)
                    self.cache[row["key"]] = row
        self.spent_here = 0.0

    def prompt_tokens(self, messages: list[dict[str, str]]) -> int:
        return self.renderer.build_generation_prompt(messages).length

    async def sample(
        self, messages: list[dict[str, str]], *, max_tokens: int = 400, temperature: float = 0.6, seed: int = 0
    ) -> Sample:
        key = cache_key(self.model, messages, max_tokens, temperature, seed)
        if key in self.cache:
            row = self.cache[key]
            return Sample(row["text"], row["promptTokens"], row["completionTokens"], row["cachedTokens"], 0.0, row["latencyMs"], True)
        async with self.sem:
            prompt = self.renderer.build_generation_prompt(messages)
            worst = ledger.sample_cost(self.model, prompt.length, max_tokens)
            # Calls already in flight count against the cap too (asyncio runs this check atomically).
            ledger.check(TinkerSampler._in_flight + worst)
            TinkerSampler._in_flight += worst
            params = self._tinker.SamplingParams(
                max_tokens=max_tokens, temperature=temperature, seed=seed, stop=self.renderer.get_stop_sequences()
            )
            started = time.monotonic()
            try:
                result = await self.client.sample_async(prompt=prompt, num_samples=1, sampling_params=params)
            finally:
                TinkerSampler._in_flight -= worst
            latency = int((time.monotonic() - started) * 1000)
        tokens = list(result.sequences[0].tokens)
        message, _ = self.renderer.parse_response(tokens)
        content = message.get("content", "")
        text = content if isinstance(content, str) else "".join(p.get("text", "") for p in content if isinstance(p, dict))
        cached = int(getattr(result, "prompt_cache_hit_tokens", 0) or 0)
        cost = ledger.sample_cost(self.model, prompt.length, len(tokens), cached)
        ledger.record(
            model=self.model,
            purpose=self.purpose,
            prompt_tokens=prompt.length,
            completion_tokens=len(tokens),
            cost_usd=cost,
            cached_tokens=cached,
        )
        self.spent_here += cost
        row = {
            "key": key,
            "model": self.model,
            "text": text,
            "promptTokens": prompt.length,
            "completionTokens": len(tokens),
            "cachedTokens": cached,
            "latencyMs": latency,
        }
        self.cache[key] = row
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        with self.cache_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return Sample(text, prompt.length, len(tokens), cached, cost, latency, False)
