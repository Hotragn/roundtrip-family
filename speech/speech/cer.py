"""Character error rate for the speech round trip (text to speech to text).

Text is NFC-normalized and stripped of punctuation and extra spaces before scoring, so a
transcript isn't penalized for a missing comma. Telugu is compared code point by code point,
which counts a wrong vowel sign or a broken conjunct as an error, as it should.
"""

from __future__ import annotations

import unicodedata


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    kept = [
        ch
        for ch in text
        if not unicodedata.category(ch).startswith("P") and unicodedata.category(ch) not in ("Sm", "Sc", "So")
    ]
    return " ".join("".join(kept).split()).lower()


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return prev[-1]


def cer(reference: str, hypothesis: str) -> float:
    ref, hyp = normalize(reference), normalize(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return edit_distance(ref, hyp) / len(ref)
