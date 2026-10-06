import json

from speech.sources import DIARY_PATH, KINDS, WEEKS_DIR, clip_key, collect, dedupe, diary_specs, week_specs


def test_keys_match_the_voice_router():
    # Computed with Node's crypto exactly as agent/src/voice/router.ts clipKey() does.
    assert clip_key("de", "Wo ist die Toilette?") == "5b66b146662fc332"
    assert clip_key("te", "Karya Siddhi Hanuman Temple కి") == "bb957ef0f170af76"
    help_card = (
        "Hello. I am visiting my family and I speak very little English. "
        "Please call my family at this number. Thank you."
    )
    assert clip_key("en", help_card) == "2d7f8b04938cddef"


def test_keys_use_the_text_exactly():
    assert clip_key("de", "Wo ist die Toilette?") != clip_key("de", "Wo ist die Toilette? ")
    assert clip_key("de", "Danke.") != clip_key("en", "Danke.")


def tiny_week():
    return {
        "household": {"slug": "test-home", "localLanguage": "de", "helpCardText": "Bitte helfen Sie mir."},
        "parents": [{"id": "p_a", "language": "te"}, {"id": "p_b", "language": "te"}],
        "outings": [
            {
                "cards": [
                    {"parentId": "p_a", "title": "Park కి", "body": "అమ్మా, పార్క్ కి వెళ్దాం.", "phrases": [{"local": "Danke."}]},
                    {"parentId": "p_b", "title": "Park కి", "body": "నాన్నగారు, పార్క్ కి వెళ్దాం.", "phrases": [{"local": "Danke."}]},
                ]
            }
        ],
    }


def test_week_texts_get_the_right_language_and_kind():
    specs = dedupe(week_specs(tiny_week()))
    kinds = [(s.lang, s.kind) for s in specs]
    assert kinds == [("de", "help-card"), ("te", "card-title"), ("te", "card-body"), ("de", "phrase"), ("te", "card-body")]
    assert all(s.source == "test-home" for s in specs)
    assert specs[0].file == f"/audio/{specs[0].key}.mp3"


def test_only_voice_diary_entries_are_voiced():
    diary = {
        "entries": [
            {"id": "d1", "parentId": "p_a", "kind": "voice", "text": "ఈరోజు గుడికి వెళ్ళాం."},
            {"id": "d2", "parentId": "p_a", "kind": "text", "text": "బాగుంది."},
        ]
    }
    specs = diary_specs(diary, {"p_a": "te"})
    assert [(s.source, s.kind, s.lang) for s in specs] == [("d1", "diary", "te")]


def test_the_demo_data_is_fully_covered():
    specs = collect()
    by_key = {s.key: s for s in specs}
    assert len(by_key) == len(specs), "one clip per key"
    assert {s.kind for s in specs} <= set(KINDS)
    expected = set()
    for path in sorted(WEEKS_DIR.glob("*.json")):
        week = json.loads(path.read_text(encoding="utf-8"))
        local = week["household"]["localLanguage"]
        lang_of = {p["id"]: p["language"] for p in week["parents"]}
        expected.add((local, week["household"]["helpCardText"]))
        for outing in week["outings"]:
            for card in outing["cards"]:
                expected.add((lang_of[card["parentId"]], card["title"]))
                expected.add((lang_of[card["parentId"]], card["body"]))
                expected.update((local, p["local"]) for p in card["phrases"])
    diary = json.loads(DIARY_PATH.read_text(encoding="utf-8"))
    expected.update(("te", e["text"]) for e in diary["entries"] if e["kind"] == "voice")
    assert {(s.lang, s.text) for s in specs} == expected
    for lang, text in expected:
        assert by_key[clip_key(lang, text)].text == text
