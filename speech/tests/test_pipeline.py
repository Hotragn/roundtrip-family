"""The whole run (plan, voice, prune, score, report) with a stand-in worker instead of models."""

import json

import pytest

from speech import evaluate, generate, report, runner, sources
from speech.models import resolve as real_resolve


def week(body="అమ్మా, సోమవారం 08:30కి Central Park కి వెళ్దాం."):
    return {
        "household": {"slug": "test-home", "localLanguage": "de", "helpCardText": "Bitte helfen Sie mir."},
        "parents": [{"id": "p_a", "language": "te"}],
        "outings": [{"cards": [{"parentId": "p_a", "title": "Central Park కి", "body": body, "phrases": [{"local": "Danke."}]}]}],
    }


@pytest.fixture
def world(tmp_path, monkeypatch):
    weeks_dir = tmp_path / "weeks"
    weeks_dir.mkdir()
    diary = tmp_path / "diary.json"
    diary.write_text(json.dumps({"entries": [{"id": "d1", "parentId": "p_a", "kind": "voice", "text": "ఈరోజు గుడికి వెళ్ళాం."}]}), encoding="utf-8")
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    paths = {
        "AUDIO_DIR": audio_dir,
        "MANIFEST_PATH": tmp_path / "manifest.json",
        "TRANSCRIPTS_PATH": tmp_path / "transcripts.json",
    }
    runs_path = tmp_path / "runs.json"
    gated = lambda repo: "gated" if repo.startswith("ai4bharat/") else None  # noqa: E731
    calls: list[dict] = []

    def fake_worker(job):
        calls.append(job)
        if job["task"] == "tts":
            out = {}
            for clip in job["clips"]:
                (audio_dir / f"{clip['key']}.mp3").write_bytes(b"ID3")
                out[clip["key"]] = {"seconds": 1.5, "bytes": 100}
            return {"status": "ok", "task": "tts", "model": job["choice"]["model"], "clips": out, "audioSeconds": 1.5 * len(out), "modelSeconds": 0.3 * len(out), "loadSeconds": 1.0, "peakRssMB": 800.0}
        per: dict = {}
        for clip in job["clips"]:
            s = per.setdefault(clip["lang"], {"clips": 0, "audioSeconds": 0.0, "modelSeconds": 0.0})
            s["clips"] += 1
            s["audioSeconds"] += 1.5
            s["modelSeconds"] += 0.1
        out = {c["key"]: {"transcript": c["reference"], "cer": 0.0} for c in job["clips"]}
        return {"status": "ok", "task": "asr", "model": job["choice"]["model"], "clips": out, "perLanguage": per, "loadSeconds": 5.0, "peakRssMB": 5000.0}

    for mod in (generate, evaluate):
        for name, value in paths.items():
            monkeypatch.setattr(mod, name, value, raising=False)
        monkeypatch.setattr(mod, "collect", lambda: sources.collect(weeks_dir, diary))
        monkeypatch.setattr(mod, "resolve", lambda lang, table, skip=(): real_resolve(lang, table, access=gated, skip=skip))
        monkeypatch.setattr(mod, "run_worker", fake_worker)
        monkeypatch.setattr(mod, "log_run", lambda result, langs: runner.log_run(result, langs, runs_path))
    monkeypatch.setattr(generate, "encoder_ready", lambda: True)
    monkeypatch.setattr(report, "MANIFEST_PATH", paths["MANIFEST_PATH"])
    monkeypatch.setattr(report, "TRANSCRIPTS_PATH", paths["TRANSCRIPTS_PATH"])
    monkeypatch.setattr(report, "RUNS_PATH", runs_path)
    monkeypatch.setattr(report, "RESULTS_DOC", tmp_path / "speech-results.md")

    def write_week(w):
        (weeks_dir / "test-home.json").write_text(json.dumps(w, ensure_ascii=False), encoding="utf-8")

    write_week(week())
    return {"write_week": write_week, "calls": calls, "audio": audio_dir, **paths, "doc": tmp_path / "speech-results.md"}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_first_run_voices_scores_and_reports(world):
    generate.main([])
    manifest = read(world["MANIFEST_PATH"])
    assert manifest["provenance"] == "synthetic" and manifest["generatedAt"]
    assert len(manifest["clips"]) == 5  # help card, title, body, phrase, diary
    assert manifest["models"] == {
        "te-tts": "facebook/mms-tts-tel",
        "de-tts": "facebook/mms-tts-deu",
        "te-asr": "facebook/mms-1b-all (tel)",
        "de-asr": "facebook/mms-1b-all (deu)",
    }
    for key, clip in manifest["clips"].items():
        assert clip["file"] == f"/audio/{key}.mp3" and (world["audio"] / f"{key}.mp3").exists()
        assert clip["cer"] == 0.0 and clip["transcript"]
    tasks = [(c["task"], c["choice"]["model"]) for c in world["calls"]]
    assert tasks == [("tts", "facebook/mms-tts-deu"), ("tts", "facebook/mms-tts-tel"), ("asr", "facebook/mms-1b-all")]
    body = next(c for c in world["calls"][1]["clips"] if "ఎనిమిదిన్నరకి" in c["spoken"])
    assert "సెంట్రల్ పార్క్" in body["spoken"]
    assert "| Telugu | facebook/mms-tts-tel | facebook/mms-1b-all (tel) | 3 |" in world["doc"].read_text(encoding="utf-8")


def test_a_second_run_does_nothing(world):
    generate.main([])
    before = world["MANIFEST_PATH"].read_text(encoding="utf-8")
    world["calls"].clear()
    generate.main([])
    assert world["calls"] == []
    assert world["MANIFEST_PATH"].read_text(encoding="utf-8") == before


def test_a_changed_card_revoices_only_that_card(world):
    generate.main([])
    old = read(world["MANIFEST_PATH"])
    world["calls"].clear()
    world["write_week"](week(body="అమ్మా, సోమవారం 09:00కి Central Park కి వెళ్దాం."))
    generate.main([])
    new = read(world["MANIFEST_PATH"])
    assert len(new["clips"]) == 5
    (gone,) = set(old["clips"]) - set(new["clips"])
    (added,) = set(new["clips"]) - set(old["clips"])
    assert not (world["audio"] / f"{gone}.mp3").exists()
    assert [(c["task"], [x["key"] for x in c["clips"]]) for c in world["calls"]] == [("tts", [added]), ("asr", [added])]
    assert read(world["TRANSCRIPTS_PATH"])["clips"].keys() == new["clips"].keys()
