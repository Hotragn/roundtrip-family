from speech.manifest import clip_entry, empty_manifest
from speech.report import by_kind, model_runs, render, round_trip
from speech.sources import ClipSpec, clip_key


def manifest_with(scores):
    m = empty_manifest()
    m["generatedAt"] = "2026-10-06T00:00:00Z"
    details = {}
    for i, score in enumerate(scores):
        text = f"వాక్యం {i}"
        s = ClipSpec(clip_key("te", text), "te", text, "card-body" if i % 2 else "diary", "fremont-demo")
        m["clips"][s.key] = clip_entry(s, "facebook/mms-tts-tel", 2.0, 12000, text, score)
        details[s.key] = {"asrModel": "facebook/mms-1b-all (tel)", "text": text}
    return m, {"clips": details}


def test_empty_manifest_says_not_run():
    assert render(empty_manifest(), {"clips": {}}, {"runs": []}).startswith("**Not run yet.**")


def test_round_trip_statistics():
    m, t = manifest_with([0.0, 0.1, 0.2, 0.5])
    (row,) = round_trip(m, t)
    assert row["clips"] == 4 and row["asr"] == "facebook/mms-1b-all (tel)"
    assert abs(row["mean"] - 0.2) < 1e-9 and abs(row["median"] - 0.15) < 1e-9
    assert [w[3] for w in row["worst"]] == [0.5, 0.2, 0.1]
    assert row["seconds"] == 8.0
    kinds = {kind: mean for _, kind, _, mean in by_kind(m)}
    assert abs(kinds["diary"] - 0.1) < 1e-9 and abs(kinds["card-body"] - 0.3) < 1e-9


def test_model_runs_add_up_time_and_keep_the_peak():
    runs = {
        "runs": [
            {"status": "ok", "task": "tts", "model": "facebook/mms-tts-tel", "langs": ["te"], "clips": 2, "audioSeconds": 10.0, "modelSeconds": 2.0, "loadSeconds": 1.0, "peakRssMB": 900.0},
            {"status": "ok", "task": "tts", "model": "facebook/mms-tts-tel", "langs": ["te"], "clips": 1, "audioSeconds": 10.0, "modelSeconds": 4.0, "loadSeconds": 1.5, "peakRssMB": 950.0},
            {"status": "load-failed", "task": "tts", "model": "ai4bharat/indic-parler-tts", "langs": ["te"]},
            {"status": "ok", "task": "asr", "model": "facebook/mms-1b-all", "langs": ["de", "en"], "loadSeconds": 20.0, "peakRssMB": 5200.0,
             "perLanguage": {"de": {"clips": 8, "audioSeconds": 16.0, "modelSeconds": 4.0}, "en": {"clips": 7, "audioSeconds": 14.0, "modelSeconds": 3.5}}},
        ]
    }
    rows = {(r["task"], r["model"], r["lang"]): r for r in model_runs(runs)}
    tel = rows[("tts", "facebook/mms-tts-tel", "te")]
    assert tel["clips"] == 3 and tel["per_second"] == 0.3 and tel["peak"] == 950.0
    assert ("tts", "ai4bharat/indic-parler-tts", "te") not in rows
    assert rows[("asr", "facebook/mms-1b-all", "de")]["per_second"] == 0.25


def test_render_labels_results_synthetic():
    m, t = manifest_with([0.05, 0.1])
    body = render(m, t, {"runs": []})
    assert "synthetic text, automated scores" in body
    assert "| Telugu | facebook/mms-tts-tel | facebook/mms-1b-all (tel) | 2 |" in body
