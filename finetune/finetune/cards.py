"""The card writer's prompt and checks, mirrored from the TypeScript writer.

facts_prompt() is agent/src/cards/writer.ts factsPrompt(), check_script() is
agent/src/telugu.ts checkTeluguScript(), and parse_card() follows parseJson() in
agent/src/gemma/index.ts. data/demo/finetune/prompt-cases.json holds shared cases that both
test suites check, so the student is trained on exactly the prompt the app sends.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from finetune.env import ROOT
from finetune.rubric import CardInput, check

CARD_STYLE_PATH = ROOT / "docs/card-style.md"


def card_style() -> str:
    return CARD_STYLE_PATH.read_text(encoding="utf-8")


def facts_prompt(f: dict[str, Any]) -> str:
    lines = [
        f"Write the card for the {f['addressee']}. Address them as {f['addressAs']}.",
        f"Venue: {f['venue']}",
        f"When: {f['day']}, leave at {f['departTime']}, back by {f['backTime']}",
        f"Trip: {f['trip']}",
        f"What's there: {f['whatsThere']}",
        f"Names to keep exactly, in English letters: {'; '.join(f['names'])}",
        f"Other stops on the way (mention only if needed): {'; '.join(f['optionalNames'])}"
        if f.get("optionalNames")
        else "",
        "This is the first card of the visit: end with the one-line safety tip." if f.get("firstCard") else "",
        'Answer with only JSON: {"title": "...", "body": "..."}',
    ]
    return "\n".join(line for line in lines if line)


def rubric_input(f: dict[str, Any]) -> CardInput:
    return CardInput(
        names=list(f["names"]),
        numbers=list(f["numbers"]),
        addressee=f["addressee"],
        extra_allowed=[f["venue"], *f.get("optionalNames", [])],
    )


def parse_card(text: str) -> dict[str, str] | None:
    """{"title", "body"} from a model answer, or None. Same limits as the writer's Zod schema."""
    cleaned = re.sub(r"```$", "", re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.I)).strip()
    try:
        raw = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return None
        try:
            raw = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    title, body = raw.get("title"), raw.get("body")
    if not isinstance(title, str) or not isinstance(body, str):
        return None
    if not (2 <= len(title) <= 80 and 10 <= len(body) <= 600):
        return None
    return {"title": title, "body": body}


def card_json(card: dict[str, str]) -> str:
    """The exact answer text the student is trained to produce."""
    return json.dumps({"title": card["title"], "body": card["body"]}, ensure_ascii=False)


_REPLACEMENT = "�"
_ZWNJ, _ZWJ = "‌", "‍"
_LETTER = re.compile("[అ-హౘ-ౚౠౡ]")
_MARK = re.compile("[ఀ-ఄ఼ా-ౖౢౣ]")


@dataclass
class ScriptReport:
    ok: bool
    nfc_stable: bool
    replacement_chars: int
    orphan_marks: int
    telugu_share: float


def check_script(text: str) -> ScriptReport:
    nfc_stable = text == unicodedata.normalize("NFC", text)
    chars = list(text)
    replacement = chars.count(_REPLACEMENT)
    orphans = 0
    for i, c in enumerate(chars):
        if not _MARK.match(c):
            continue
        prev = chars[i - 1] if i > 0 else None
        if prev is None or not (_LETTER.match(prev) or _MARK.match(prev) or prev in (_ZWNJ, _ZWJ)):
            orphans += 1
    letters = [c for c in chars if c.isalpha() or _MARK.match(c)]
    telugu = [c for c in letters if _LETTER.match(c) or _MARK.match(c)]
    share = len(telugu) / len(letters) if letters else 0.0
    return ScriptReport(nfc_stable and replacement == 0 and orphans == 0, nfc_stable, replacement, orphans, share)


def check_card(card: dict[str, str], facts: dict[str, Any]) -> dict[str, Any]:
    """The writer's own pass test: the rubric on title and body, plus the body's script."""
    r = check(f"{card['title']} {card['body']}", rubric_input(facts))
    script = check_script(card["body"])
    return {"passed": r.passed and script.ok, "failures": r.failures, "words": r.words, "scriptOk": script.ok}
