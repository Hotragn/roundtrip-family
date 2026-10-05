import math

import pytest

from ranker.features import FEATURES, to_frame


def test_builds_one_column_per_feature():
    frame = to_frame([{"category": "temple", "languageMatch": 2, "indoor": True}])
    assert list(frame.columns) == FEATURES
    assert frame.loc[0, "category"] == "temple"
    assert frame.loc[0, "indoor"] == 1.0
    assert math.isnan(frame.loc[0, "travelMinutes"])


def test_can_drop_a_feature():
    frame = to_frame([{"category": "park", "withAdultChild": True}], drop=["withAdultChild"])
    assert "withAdultChild" not in frame.columns


def test_refuses_personal_fields():
    with pytest.raises(ValueError):
        to_frame([{"category": "park", "firstName": "Sarala"}])
