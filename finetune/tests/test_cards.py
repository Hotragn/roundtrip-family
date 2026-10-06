import json
from pathlib import Path

import pytest

from finetune.cards import card_json, check_card, check_script, facts_prompt, parse_card

ROOT = Path(__file__).parents[2]
PROMPTS = json.loads((ROOT / "data/demo/finetune/prompt-cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", PROMPTS, ids=[c["id"] for c in PROMPTS])
def test_facts_prompt_matches_the_app(case):
    # The student must be trained on exactly what agent/src/cards/writer.ts sends.
    assert facts_prompt(case["facts"]) == case["prompt"]


def test_parse_card_reads_fenced_json_and_rejects_bad_shapes():
    assert parse_card('```json\n{"title": "Central Park కి", "body": "అమ్మా, బుధవారం వెళ్దాం."}\n```') == {
        "title": "Central Park కి",
        "body": "అమ్మా, బుధవారం వెళ్దాం.",
    }
    assert parse_card('Here: {"title": "Central Park కి", "body": "అమ్మా, బుధవారం వెళ్దాం."} done') is not None
    assert parse_card('{"title": "x", "body": "too short"}') is None
    assert parse_card("no json at all") is None


def test_card_json_round_trips_telugu_without_escapes():
    card = {"title": "Central Park కి", "body": "అమ్మా, బుధవారం 08:30కి వెళ్దాం."}
    text = card_json(card)
    assert "\\u" not in text
    assert parse_card(text) == card


def test_script_check_matches_the_app_rules():
    assert check_script("అమ్మా, బుధవారం 10:30కి Central Park కి వెళ్దాం.").ok
    orphan = check_script("ా అమ్మా")  # a vowel sign with no letter before it
    assert not orphan.ok and orphan.orphan_marks == 1
    assert not check_script("అమ్మా �").ok


def test_check_card_uses_title_and_body_like_the_writer():
    facts = PROMPTS[2]["facts"]
    good = {"title": f"{facts['venue']} కి", "body": f"{facts['addressAs']}, మనం కలిసి కారులో వెళ్దాం. మీకు నచ్చుతుంది."}
    result = check_card(good, facts)
    assert result["passed"], result["failures"]
    bad = {"title": "కి", "body": f"{facts['addressAs']}, మనం కలిసి వెళ్దాం. మీకు నచ్చుతుంది, 99 మంది వస్తారు."}
    failures = check_card(bad, facts)["failures"]
    assert any("missing exact name" in f for f in failures)
    assert any("number not in the input: 99" in f for f in failures)
