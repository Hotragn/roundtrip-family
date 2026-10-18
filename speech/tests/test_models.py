def test_parler_runs_in_its_own_environment_when_one_is_named(monkeypatch):
    import sys

    from speech.models import INDIC_CONFORMER, INDIC_PARLER, python_for

    monkeypatch.delenv("PARLER_PYTHON", raising=False)
    assert python_for(INDIC_PARLER) == sys.executable
    monkeypatch.setenv("PARLER_PYTHON", "/tmp/parler/bin/python")
    assert python_for(INDIC_PARLER) == "/tmp/parler/bin/python"
    assert python_for(INDIC_CONFORMER) == sys.executable


def test_whisper_pieces_fit_its_30_second_window():
    import pytest

    np = pytest.importorskip("numpy")  # only in the models environment
    from speech.asr import RATE, windows

    wave = np.random.default_rng(0).standard_normal(int(70 * RATE)).astype(np.float32)
    pieces = windows(wave, long=30.0)
    assert sum(len(p) for p in pieces) == len(wave)
    assert all(len(p) <= 30 * RATE for p in pieces)


def test_parler_voices_share_the_parler_environment(monkeypatch):
    from speech.models import TTS, python_for

    monkeypatch.setenv("PARLER_PYTHON", "/tmp/parler/bin/python")
    assert python_for(TTS["de"][0]) == python_for(TTS["en"][0]) == "/tmp/parler/bin/python"
