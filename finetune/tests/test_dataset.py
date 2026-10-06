import re
from collections import Counter

import pytest

from finetune.dataset import DEMO_VENUES, N_EVAL, N_PILOT, N_TOTAL, build
from finetune.places import clean_stop, display_name


@pytest.fixture(scope="module")
def rows():
    return build()


def test_sizes_and_split(rows):
    assert len(rows) == N_TOTAL
    assert sum(r["split"] == "eval" for r in rows) == N_EVAL
    assert sum(r["pilot"] for r in rows) == N_PILOT
    assert all(r["split"] == "train" for r in rows if r["pilot"])


def test_build_is_reproducible(rows):
    assert build() == rows


def test_eval_venues_never_appear_in_training(rows):
    eval_venues = {r["facts"]["venue"] for r in rows if r["split"] == "eval"}
    train_venues = {r["facts"]["venue"] for r in rows if r["split"] == "train"}
    assert not eval_venues & train_venues
    assert not eval_venues & DEMO_VENUES


def test_eval_set_is_stratified(rows):
    held = [r for r in rows if r["split"] == "eval"]
    assert set(Counter(r["area"] for r in held)) == {"fremont", "munich", "bozeman"}
    assert set(Counter(r["kind"] for r in held)) == {"bus", "transfer", "walk", "family", "event"}
    by_parent = Counter(r["facts"]["addressee"] for r in held)
    assert min(by_parent.values()) >= N_EVAL // 3


def test_facts_are_built_like_build_week(rows):
    for r in rows:
        f = r["facts"]
        assert f["addressAs"] == {"mother": "అమ్మా", "father": "నాన్నగారు"}[f["addressee"]]
        assert f["names"][0] == f["venue"]
        assert f["departTime"] in f["numbers"] and f["backTime"] in f["numbers"]
        assert f["backTime"] > f["departTime"]
        assert not set(f["optionalNames"]) & set(f["names"])
        if r["kind"] == "family":
            assert f["trip"] == "you go together by car" and f["names"] == [f["venue"]]
        if r["kind"] == "transfer":
            assert f["trip"].count("take Bus") == 2 and len(f["names"]) >= 3
        if len(f["names"]) > 1:
            # The bus line and the stop to get off at are always in the trip; the boarding stop is
            # missing when a route starts at the stop with no walk, as in the app.
            assert f["names"][1] in f["trip"] and f["names"][-1] in f["trip"]


def test_no_personal_data(rows):
    text = " ".join(str(r["facts"]) for r in rows)
    assert "@" not in text
    assert not re.search(r"\d{7,}", text)


def test_names_are_shown_as_the_app_shows_them():
    assert display_name("Karya Siddhi Hanuman Temple - Fremont") == "Karya Siddhi Hanuman Temple"
    assert display_name("Bozeman Public Library | City of Bozeman") == "Bozeman Public Library"
    assert clean_stop("Fremont Blvd:Central Av") == "Fremont Blvd & Central Av"
