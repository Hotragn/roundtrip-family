"""Code checks for a Telugu outing card (docs/card-style.md).

A card passes when it has 60 words or fewer, keeps every bus, stop and venue name exactly as
given (in Latin script), adds no numbers or names that aren't in the input, and addresses the
parent with the respectful form from docs/persona.md. Tone and register are judged separately
by Gemma. The same rules live in agent/src/cards/rubric.ts and share evals/fixtures/rubric-cases.json.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

MAX_WORDS = 60
ADDRESS_FORMS = {"mother": "అమ్మా", "father": "నాన్నగారు"}
RESPECTFUL = re.compile(r"(మీరు|మీకు|మీ |మిమ్మల్ని|ండి)")
LATIN_RUN = re.compile(r"[A-Za-z][A-Za-z0-9&'.\- ]*[A-Za-z0-9]|[A-Za-z]")
NUMBER = re.compile(r"\d+(?::\d+)?")


@dataclass
class CardInput:
    names: list[str]
    numbers: list[str]
    addressee: str  # "mother" or "father"
    extra_allowed: list[str] = field(default_factory=list)


@dataclass
class RubricResult:
    passed: bool
    words: int
    failures: list[str]


def word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", text.strip()) if w])


def check(card: str, given: CardInput) -> RubricResult:
    failures: list[str] = []
    words = word_count(card)
    if words > MAX_WORDS:
        failures.append(f"{words} words, more than {MAX_WORDS}")
    for name in given.names:
        if name not in card:
            failures.append(f"missing exact name: {name}")
    allowed_numbers = set(given.numbers)
    for name in given.names + given.extra_allowed:
        allowed_numbers.update(NUMBER.findall(name))
    for num in NUMBER.findall(card):
        if num not in allowed_numbers:
            failures.append(f"number not in the input: {num}")
    allowed_latin = " ".join(given.names + given.extra_allowed)
    for run in LATIN_RUN.findall(card):
        token = run.strip(" .'-")
        if token and token not in allowed_latin:
            failures.append(f"Latin-script text not in the input: {token}")
    form = ADDRESS_FORMS.get(given.addressee)
    if form and form not in card:
        failures.append(f"doesn't address the parent as {form}")
    if not RESPECTFUL.search(card):
        failures.append("no respectful మీరు form")
    return RubricResult(passed=not failures, words=words, failures=failures)
