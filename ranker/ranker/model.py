"""Ranking candidate outings: probability they'll go times expected enjoyment, with reasons.

Reasons come from leave-one-feature-out: refit without a group of related features and see
how much the score moves. tabpfn-client has no built-in attribution, so this is the documented
fallback. Related features are dropped together (the trip, the timing, the weather), which
keeps it to about ten refits, and the refits run in parallel because each is an API round trip.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from .backend import Backend
from .features import FEATURES, to_frame
from .reasons import reason_label

GROUPS: dict[str, list[str]] = {
    "category": ["category"],
    "languageMatch": ["languageMatch", "languageNeeded"],
    "trip": ["travelMinutes", "transfers", "walkingMinutes"],
    "timing": ["startHour", "dayOfWeek"],
    "weather": ["weather", "temperatureC", "rainChance"],
    "setting": ["indoor", "groupSize"],
    "costUsd": ["costUsd"],
    "knowsSomeone": ["knowsSomeone"],
}

# The feature whose value names a group's reason chip.
LABEL_FEATURE = {"trip": "travelMinutes", "timing": "timing", "weather": "weather", "setting": "groupSize"}


@dataclass
class Ranked:
    index: int
    p_go: float
    enjoyment: float
    combined: float
    reasons: list[dict[str, str]] = field(default_factory=list)


def _fit_predict(backend: Backend, past: pd.DataFrame, went: list[int], enjoy: list[float | None], cand: pd.DataFrame):
    if len(set(went)) > 1:
        p_go = backend.predict("classifier", past, [float(v) for v in went], cand)
    else:
        p_go = [float(went[0])] * len(cand)
    mask = [e is not None for e in enjoy]
    past_e = past[mask].reset_index(drop=True)
    y_e = [float(e) for e in enjoy if e is not None]
    enjoyment = backend.predict("regressor", past_e, y_e, cand)
    return p_go, enjoyment


def rank(
    past_rows: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    drop: list[str] | None = None,
    reasons: bool = True,
    backend: Backend | None = None,
    workers: int = 8,
) -> list[Ranked]:
    """past_rows carry features plus `went` (0/1) and `enjoyment` (1-5 or None)."""
    backend = backend or Backend()
    went = [int(r["went"]) for r in past_rows]
    enjoy = [r.get("enjoyment") for r in past_rows]
    past = to_frame(past_rows, drop=drop)
    cand = to_frame(candidates, drop=drop)
    p_go, enjoyment = _fit_predict(backend, past, went, enjoy, cand)
    combined = [p * e for p, e in zip(p_go, enjoyment, strict=True)]
    out = [Ranked(i, p_go[i], enjoyment[i], combined[i]) for i in range(len(candidates))]
    if reasons:
        present = set(past.columns)
        groups = {g: [c for c in cols if c in present] for g, cols in GROUPS.items()}
        groups = {g: cols for g, cols in groups.items() if cols and len(cols) < len(present)}

        mask = [e is not None for e in enjoy]
        y_e = [float(e) for e in enjoy if e is not None]
        past_categories = {r.get("category") for r in past_rows}

        def without(cols: list[str]):
            # Reasons explain expected enjoyment; the probability of going barely varies with two negatives.
            e2 = backend.predict("regressor", past[mask].reset_index(drop=True).drop(columns=cols), y_e, cand.drop(columns=cols))
            return [p_go[i] * (enjoyment[i] - e2[i]) for i in range(len(candidates))]

        with ThreadPoolExecutor(max_workers=workers) as pool:
            deltas = dict(zip(groups, pool.map(without, groups.values()), strict=True))
        for r in out:
            for g in sorted(groups, key=lambda g: abs(deltas[g][r.index]), reverse=True):
                if len(r.reasons) == 3:
                    break
                d = deltas[g][r.index]
                if abs(d) < 0.02:
                    continue
                if g == "weather" and candidates[r.index].get("indoor") is True:
                    continue  # weather can't be the reason for an indoor outing
                if g == "category" and candidates[r.index].get("category") not in past_categories:
                    continue  # they've never done this kind of outing, so there's nothing to compare
                feature = LABEL_FEATURE.get(g, g)
                label = reason_label(feature, candidates[r.index].get(feature), d > 0)
                if label:
                    r.reasons.append({"feature": g, "direction": "for" if d > 0 else "against", "label": label})
    return sorted(out, key=lambda r: r.combined, reverse=True)


__all__ = ["FEATURES", "GROUPS", "Ranked", "rank"]
