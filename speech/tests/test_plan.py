from speech.manifest import CLIP_FIELDS, clip_entry, empty_manifest, models_used, ordered, plan, prune
from speech.models import ASR, TTS, Choice, label, resolve
from speech.sources import ClipSpec, clip_key
from speech.tts_settings import seed_for, speaking_rate

MMS_TE = "facebook/mms-tts-tel"


def spec(text, lang="te", kind="card-body", source="fremont-demo"):
    return ClipSpec(key=clip_key(lang, text), lang=lang, text=text, kind=kind, source=source)


def with_clip(manifest, s, model, audio_dir, make_file=True):
    manifest["clips"][s.key] = clip_entry(s, model, 3.2, 19200)
    if make_file:
        (audio_dir / f"{s.key}.mp3").write_bytes(b"ID3")


def test_new_text_is_voiced(tmp_path):
    s = spec("అమ్మా, వెళ్దాం.")
    p = plan([s], empty_manifest(), tmp_path, {"te": MMS_TE})
    assert p.voice == [s] and not p.keep


def test_existing_clip_from_the_same_model_is_skipped(tmp_path):
    s = spec("అమ్మా, వెళ్దాం.")
    m = empty_manifest()
    with_clip(m, s, MMS_TE, tmp_path)
    p = plan([s], m, tmp_path, {"te": MMS_TE})
    assert p.keep == [s] and not p.voice
    assert plan([s], m, tmp_path, {"te": MMS_TE}, force=True).voice == [s]


def test_a_missing_file_or_a_better_model_means_voicing_again(tmp_path):
    s = spec("అమ్మా, వెళ్దాం.")
    m = empty_manifest()
    with_clip(m, s, MMS_TE, tmp_path, make_file=False)
    assert plan([s], m, tmp_path, {"te": MMS_TE}).voice == [s]
    (tmp_path / f"{s.key}.mp3").write_bytes(b"ID3")
    assert plan([s], m, tmp_path, {"te": "ai4bharat/indic-parler-tts"}).voice == [s]


def test_clips_made_elsewhere_are_left_alone(tmp_path):
    kept = spec("అమ్మా, వెళ్దాం.")
    gone = spec("పాత కార్డు.")
    m = empty_manifest()
    with_clip(m, kept, "eleven_v3", tmp_path)
    with_clip(m, gone, "eleven_v3", tmp_path)
    p = plan([kept], m, tmp_path, {"te": MMS_TE})
    assert p.keep == [kept] and not p.stale


def test_changed_text_prunes_the_old_clip(tmp_path):
    old, new = spec("సోమవారం 08:30కి వెళ్దాం."), spec("సోమవారం 09:00కి వెళ్దాం.")
    m = empty_manifest()
    with_clip(m, old, MMS_TE, tmp_path)
    transcripts = {"clips": {old.key: {"cer": 0.1}}}
    p = plan([new], m, tmp_path, {"te": MMS_TE})
    assert p.voice == [new] and p.stale == [old.key]
    prune(m, transcripts, p.stale, tmp_path)
    assert old.key not in m["clips"] and old.key not in transcripts["clips"]
    assert not (tmp_path / f"{old.key}.mp3").exists()


def test_a_language_without_a_model_is_reported(tmp_path):
    s = spec("नमस्ते", lang="hi")
    p = plan([s], empty_manifest(), tmp_path, {"te": MMS_TE})
    assert p.no_voice == [s] and not p.voice


def test_manifest_fields_and_models_map():
    s = spec("Wo ist die Toilette?", lang="de", kind="phrase", source="munich-demo")
    m = {"provenance": "synthetic", "generatedAt": "2026-10-06T00:00:00Z", "clips": {}}
    m["clips"][s.key] = clip_entry(s, "facebook/mms-tts-deu", 1.4, 8400, "wo ist die toilette", 0.0)
    transcripts = {"clips": {s.key: {"asrModel": "facebook/mms-1b-all (deu)"}}}
    out = ordered(m, transcripts)
    assert list(out) == ["provenance", "generatedAt", "models", "clips"]
    assert list(out["clips"][s.key]) == list(CLIP_FIELDS)
    assert out["clips"][s.key]["file"] == f"/audio/{s.key}.mp3"
    assert out["models"]["de-tts"] == "facebook/mms-tts-deu"
    assert out["models"]["de-asr"] == "facebook/mms-1b-all (deu)"
    assert list(out["models"]) == ["de-tts", "de-asr"]


def test_unscored_clips_leave_out_unknown_fields():
    # The web app's ClipManifest type has optional fields; a JSON null wouldn't fit it.
    s = spec("అమ్మా, వెళ్దాం.")
    m = {"clips": {s.key: clip_entry(s, MMS_TE, 3.2, 19200)}}
    out = ordered(m, {"clips": {}})
    assert "transcript" not in out["clips"][s.key] and "cer" not in out["clips"][s.key]
    assert out["models"] == {"te-tts": MMS_TE}
    assert models_used(out, {"clips": {}}) == {"te-tts": MMS_TE}


def test_a_gated_model_falls_back_to_mms():
    def gated(repo):
        return "gated: no access" if repo.startswith("ai4bharat/") else None

    choice, passed = resolve("te", TTS, access=gated)
    assert choice is not None and choice.model == MMS_TE
    assert passed[0][0] == "ai4bharat/indic-parler-tts"
    listener, _ = resolve("te", ASR, access=gated)
    assert label(listener) == "facebook/mms-1b-all (tel)"
    assert resolve("de", TTS, access=lambda r: None)[0].model == "facebook/mms-tts-deu"


def test_a_model_that_failed_to_load_is_skipped():
    choice, passed = resolve("te", TTS, access=lambda r: None, skip=["ai4bharat/indic-parler-tts", MMS_TE])
    assert choice is None or choice.model not in {"ai4bharat/indic-parler-tts", MMS_TE}
    assert label(Choice("ai4bharat/indic-parler-tts", "indic-parler-tts", "te")) == "ai4bharat/indic-parler-tts"


def test_voice_settings():
    assert speaking_rate("phrase") < speaking_rate("card-body") <= 1.0
    key = clip_key("te", "అమ్మా")
    assert seed_for(key) == seed_for(key) == int(key[:8], 16)
