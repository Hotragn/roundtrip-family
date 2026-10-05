"""The ranker service. POST /rank takes past outings and candidates and returns, for each
candidate, the probability of going, expected enjoyment, a combined score and up to three
reasons. Run: uv run uvicorn ranker.app:app --port 8100
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .backend import Backend
from .features import FORBIDDEN
from .model import rank

app = FastAPI(title="Roundtrip ranker", version="0.1.0")


class PastOuting(BaseModel):
    features: dict[str, Any]
    went: int = Field(ge=0, le=1)
    enjoyment: float | None = Field(default=None, ge=1, le=5)


class RankRequest(BaseModel):
    past: list[PastOuting] = Field(min_length=3, max_length=500)
    candidates: list[dict[str, Any]] = Field(min_length=1, max_length=60)
    drop: list[str] = []
    reasons: bool = True


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/rank")
def rank_endpoint(req: RankRequest, x_ranker_key: str | None = Header(default=None)) -> dict[str, Any]:
    expected = os.environ.get("RANKER_SHARED_KEY")
    if expected and x_ranker_key != expected:
        raise HTTPException(status_code=401, detail="Missing or wrong ranker key.")
    for row in [p.features for p in req.past] + req.candidates:
        bad = FORBIDDEN.intersection(row)
        if bad:
            raise HTTPException(status_code=422, detail=f"Personal fields can't go to the ranker: {sorted(bad)}")
    backend = Backend()
    started = time.perf_counter()
    past_rows = [{**p.features, "went": p.went, "enjoyment": p.enjoyment} for p in req.past]
    result = rank(past_rows, req.candidates, drop=req.drop, reasons=req.reasons, backend=backend)
    return {
        "results": [
            {
                "index": r.index,
                "pGo": round(r.p_go, 4),
                "enjoyment": round(r.enjoyment, 3),
                "combined": round(r.combined, 4),
                "reasons": r.reasons,
            }
            for r in result
        ],
        "usage": {"apiCalls": backend.calls, "cacheHits": backend.cache_hits},
        "ms": round((time.perf_counter() - started) * 1000),
    }
