def test_parler_runs_in_its_own_environment_when_one_is_named(monkeypatch):
    import sys

    from speech.models import INDIC_CONFORMER, INDIC_PARLER, python_for

    monkeypatch.delenv("PARLER_PYTHON", raising=False)
    assert python_for(INDIC_PARLER) == sys.executable
    monkeypatch.setenv("PARLER_PYTHON", "/tmp/parler/bin/python")
    assert python_for(INDIC_PARLER) == "/tmp/parler/bin/python"
    assert python_for(INDIC_CONFORMER) == sys.executable
