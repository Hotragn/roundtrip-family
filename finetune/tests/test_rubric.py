import json
from pathlib import Path

import pytest

from finetune.rubric import CardInput, check, word_count

CASES = json.loads((Path(__file__).parents[2] / "evals/fixtures/rubric-cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_shared_rubric_cases(case):
    given = CardInput(**case["input"])
    result = check(case["card"], given)
    assert result.passed == case["expect"]["passed"], result.failures
    if "failureIncludes" in case["expect"]:
        assert any(case["expect"]["failureIncludes"] in f for f in result.failures), result.failures


def test_word_count_splits_on_whitespace():
    assert word_count("అమ్మా,  ఈ రోజు ఏం చేద్దాం?") == 5
