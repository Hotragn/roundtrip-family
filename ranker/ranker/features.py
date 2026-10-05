"""Turns outing feature records into the table TabPFN sees.

The columns follow docs/plan.md section 8. Names, addresses and other personal data never
appear here; the outing features carry only kinds of places, minutes, hours, weather and
language match. TabPFN takes text categories and missing values as they are, so nothing is
hand-encoded (https://docs.priorlabs.ai).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

FEATURES: list[str] = [
    "category",
    "languageMatch",
    "travelMinutes",
    "transfers",
    "walkingMinutes",
    "startHour",
    "dayOfWeek",
    "weather",
    "temperatureC",
    "rainChance",
    "indoor",
    "groupSize",
    "costUsd",
    "knowsSomeone",
    "foodAvailable",
    "daysSinceLastOuting",
    "withAdultChild",
    "languageNeeded",
]

TEXT_COLUMNS = {"category", "dayOfWeek", "weather", "groupSize"}
BOOL_COLUMNS = {"indoor", "knowsSomeone", "foodAvailable", "withAdultChild", "languageNeeded"}

FORBIDDEN = {"name", "firstName", "label", "address", "phone", "email", "notes", "title", "venueName"}


def to_frame(rows: list[dict[str, Any]], drop: list[str] | None = None) -> pd.DataFrame:
    """Builds the feature table. Unknown keys are ignored; forbidden keys raise."""
    for row in rows:
        bad = FORBIDDEN.intersection(row)
        if bad:
            raise ValueError(f"Personal fields can't go to the ranker: {sorted(bad)}")
    cols = [c for c in FEATURES if c not in set(drop or [])]
    frame = pd.DataFrame([{c: row.get(c) for c in cols} for row in rows], columns=cols)
    for c in cols:
        if c in BOOL_COLUMNS:
            frame[c] = frame[c].map({True: 1.0, False: 0.0}).astype("float64")
        elif c in TEXT_COLUMNS:
            frame[c] = frame[c].astype("object")
        else:
            frame[c] = pd.to_numeric(frame[c], errors="coerce").astype("float64")
    return frame
