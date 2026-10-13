"""Ranking logic with a fake TabPFN backend, so tests never call the API."""

from fastapi.testclient import TestClient

from ranker import app as app_module
from ranker.model import rank


class FakeBackend:
    """Scores rows by language match and knowing someone, like a model that learned the persona."""

    calls = 0
    cache_hits = 0

    def predict(self, kind, X, y, X_test):
        out = []
        for _, row in X_test.iterrows():
            lm = row.get("languageMatch", 0) if "languageMatch" in X_test.columns else 0
            ks = row.get("knowsSomeone", 0) if "knowsSomeone" in X_test.columns else 0
            lm = 0 if lm != lm else lm  # NaN to 0
            ks = 0 if ks != ks else ks
            out.append(0.5 + 0.2 * lm + 0.1 * ks if kind == "classifier" else 2 + lm + ks)
        return out


PAST = [
    {"category": "temple", "languageMatch": 2, "knowsSomeone": True, "went": 1, "enjoyment": 5},
    {"category": "mall", "languageMatch": 0, "knowsSomeone": False, "went": 1, "enjoyment": 2},
    {"category": "park", "languageMatch": 1, "knowsSomeone": False, "went": 1, "enjoyment": 4},
    {"category": "community_event", "languageMatch": 2, "knowsSomeone": False, "went": 0, "enjoyment": None},
]


def test_ranks_language_match_first_with_reasons():
    cands = [
        {"category": "mall", "languageMatch": 0, "knowsSomeone": False},
        {"category": "temple", "languageMatch": 2, "knowsSomeone": True},
    ]
    out = rank(PAST, cands, backend=FakeBackend())
    assert out[0].index == 1
    labels = [r["label"] for r in out[0].reasons]
    assert "Speaks their language" in labels
    assert "Knows someone there" in labels


def test_can_drop_with_adult_child():
    cands = [{"category": "park", "languageMatch": 1, "withAdultChild": True}]
    out = rank(PAST, cands, drop=["withAdultChild"], reasons=False, backend=FakeBackend())
    assert len(out) == 1


def test_api_refuses_personal_fields(monkeypatch):
    monkeypatch.setattr(app_module, "Backend", FakeBackend)
    client = TestClient(app_module.app)
    body = {
        "past": [{"features": f, "went": 1, "enjoyment": 4} for f in ({"category": "park"},) * 3],
        "candidates": [{"category": "park", "firstName": "Sarala"}],
    }
    assert client.post("/rank", json=body).status_code == 422


def test_api_ranks(monkeypatch):
    monkeypatch.setattr(app_module, "Backend", FakeBackend)
    client = TestClient(app_module.app)
    past = [{"features": {k: v for k, v in p.items() if k not in ("went", "enjoyment")}, "went": p["went"], "enjoyment": p["enjoyment"]} for p in PAST]
    body = {"past": past, "candidates": [{"category": "temple", "languageMatch": 2}, {"category": "mall", "languageMatch": 0}]}
    r = client.post("/rank", json=body)
    assert r.status_code == 200
    assert r.json()["results"][0]["index"] == 0


class TimingBackend:
    """Enjoyment falls with start hour, so dropping the timing features moves every score a little."""

    calls = 0
    cache_hits = 0

    def predict(self, kind, X, y, X_test):
        if kind == "classifier":
            return [1.0] * len(X_test)
        if "startHour" not in X_test.columns:
            return [4.0] * len(X_test)
        return [4.0 - 0.02 * (h - 8) for h in X_test["startHour"]]


TIMING_PAST = [
    {"category": "park", "startHour": 8, "went": 1, "enjoyment": 5},
    {"category": "park", "startHour": 10, "went": 1, "enjoyment": 4},
    {"category": "park", "startHour": 16, "went": 1, "enjoyment": 3},
]


def _timing_against(out):
    return {r.index for r in out if any(x["feature"] == "timing" and x["direction"] == "against" for x in r.reasons)}


def test_timing_against_only_when_it_stands_out():
    # Hours 10 to 13 cost about the same; 18 costs clearly more than the typical option.
    cands = [{"category": "park", "startHour": h} for h in (10, 11, 12, 13, 18)]
    out = rank(TIMING_PAST, cands, backend=TimingBackend())
    assert _timing_against(out) == {4}
    late = next(r for r in out if r.index == 4)
    assert "This day and time rated lower so far" in [x["label"] for x in late.reasons]


def test_timing_against_dropped_when_every_option_shares_it():
    cands = [{"category": "park", "startHour": h} for h in (12, 13, 14, 15)]
    out = rank(TIMING_PAST, cands, backend=TimingBackend())
    assert _timing_against(out) == set()
