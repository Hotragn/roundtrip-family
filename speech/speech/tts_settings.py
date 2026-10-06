"""Voice settings shared by the planner and the speaking worker (no model libraries needed)."""

from __future__ import annotations

DEFAULT_RATE = 0.9  # a little slower than MMS-TTS's natural pace, for older listeners
RATE_BY_KIND = {"phrase": 0.85}  # practice phrases slower still, so they're easy to repeat


def speaking_rate(kind: str) -> float:
    return RATE_BY_KIND.get(kind, DEFAULT_RATE)


def seed_for(key: str) -> int:
    """A fixed seed per clip: MMS-TTS's flow is random, and re-runs should sound the same."""
    return int(key[:8], 16)
