import json

import pytest

from finetune import ledger


@pytest.fixture
def temp_ledger(tmp_path, monkeypatch):
    path = tmp_path / "tinker-ledger.jsonl"
    monkeypatch.setattr(ledger, "LEDGER", path)
    monkeypatch.setattr(ledger, "load_env", lambda: None)
    return path


def test_costs_follow_the_published_prices():
    # Qwen3.5-4B: $0.33 prefill, $0.066 cached, $1.005 sample, $0.737 train per million tokens.
    assert ledger.sample_cost("Qwen/Qwen3.5-4B", 1_000_000, 0) == pytest.approx(0.33)
    assert ledger.sample_cost("Qwen/Qwen3.5-4B", 1_000_000, 0, cached_tokens=1_000_000) == pytest.approx(0.066)
    assert ledger.sample_cost("tinker://run/sampler_weights/x", 0, 1_000_000) == pytest.approx(1.005)
    assert ledger.train_cost("Qwen/Qwen3.5-4B", 1_000_000) == pytest.approx(0.737)
    with pytest.raises(KeyError):
        ledger.price("someone/unpriced-model")


def test_cap_counts_everything_already_spent(temp_ledger, monkeypatch):
    monkeypatch.setenv("MAX_TINKER_SPEND_USD", "1.00")
    ledger.record(model="Qwen/Qwen3.5-4B", purpose="test", prompt_tokens=10, completion_tokens=5, cost_usd=0.75)
    assert ledger.spent() == pytest.approx(0.75)
    assert ledger.fits(0.25)
    assert not ledger.fits(0.26)
    with pytest.raises(ledger.SpendCapReached):
        ledger.check(0.30)


def test_no_cap_means_no_spending(temp_ledger, monkeypatch):
    monkeypatch.delenv("MAX_TINKER_SPEND_USD", raising=False)
    assert not ledger.fits(0.0001)


def test_entries_match_the_typescript_ledger(temp_ledger):
    ledger.record(model="Qwen/Qwen3.5-4B", purpose="finetune:train", prompt_tokens=100, completion_tokens=0, cost_usd=0.01, kind="train", notes="estimate")
    entry = json.loads(temp_ledger.read_text(encoding="utf-8"))
    for key in ("ts", "model", "purpose", "promptTokens", "completionTokens", "costUsd", "kind"):
        assert key in entry
    assert entry["service"] == "tinker" and entry["notes"] == "estimate"
