"""TabPFN backends with recorded responses.

Every fit-and-predict is keyed by a hash of its exact inputs and saved under ranker/fixtures/,
so tests and CI replay recorded API responses and never call Prior Labs.

- "api": tabpfn-client, the Prior Labs hosted API (https://github.com/PriorLabs/tabpfn-client).
  Reads TABPFN_TOKEN from the environment. Prior Labs asks users not to upload personal data;
  only outing feature rows with no names go here, and only synthetic rows in demo mode.
- "local": the open-weights tabpfn package, for family mode on the family's own hardware.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"

Kind = Literal["classifier", "regressor"]


class ReplayMiss(RuntimeError):
    pass


def _key(kind: Kind, X: pd.DataFrame, y: list[float], X_test: pd.DataFrame) -> str:
    payload = json.dumps(
        {
            "kind": kind,
            "columns": list(X.columns),
            "X": X.astype(object).where(pd.notna(X), None).values.tolist(),
            "y": [float(v) for v in y],
            "X_test": X_test.astype(object).where(pd.notna(X_test), None).values.tolist(),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


class Backend:
    def __init__(self, mode: str | None = None, engine: str | None = None) -> None:
        self.mode = mode or os.environ.get("RANKER_MODE") or ("replay" if os.environ.get("CI") else "live")
        self.engine = engine or os.environ.get("RANKER_ENGINE", "api")
        self.calls = 0
        self.cache_hits = 0

    def predict(self, kind: Kind, X: pd.DataFrame, y: list[float], X_test: pd.DataFrame) -> list[float]:
        """Classifier: probability of the positive class. Regressor: predicted value."""
        key = _key(kind, X, y, X_test)
        path = FIXTURES / f"{key}.json"
        if path.exists():
            self.cache_hits += 1
            return json.loads(path.read_text())["prediction"]
        if self.mode == "replay":
            raise ReplayMiss(f"No recorded TabPFN response {key[:12]}; run once with RANKER_MODE=live.")
        prediction = self._call(kind, X, y, X_test)
        FIXTURES.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"kind": kind, "engine": self.engine, "prediction": prediction}))
        self.calls += 1
        return prediction

    def _call(self, kind: Kind, X: pd.DataFrame, y: list[float], X_test: pd.DataFrame) -> list[float]:
        if self.engine == "local":
            from tabpfn import TabPFNClassifier, TabPFNRegressor  # type: ignore[import-not-found]
        else:
            from tabpfn_client import TabPFNClassifier, TabPFNRegressor  # type: ignore[import-not-found]
        if kind == "classifier":
            model = TabPFNClassifier()
            model.fit(X, np.array(y, dtype=int))
            proba = model.predict_proba(X_test)
            classes = list(model.classes_)
            col = classes.index(1) if 1 in classes else len(classes) - 1
            return [float(p[col]) for p in proba]
        model = TabPFNRegressor()
        model.fit(X, np.array(y, dtype=float))
        return [float(v) for v in model.predict(X_test)]
