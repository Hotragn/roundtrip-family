import json

from speech.review import rows, write_csv, write_html
from speech.sources import clip_key


def test_every_telugu_text_is_listed_with_its_clip(tmp_path):
    weeks = tmp_path / "weeks"
    weeks.mkdir()
    week = {
        "household": {"localLanguage": "de", "helpCardText": "Bitte helfen Sie mir."},
        "outings": [{"cards": [{"title": "Park కి", "phrases": [{"local": "Danke.", "meaning": "ధన్యవాదాలు"}]}]}],
    }
    (weeks / "w.json").write_text(json.dumps(week, ensure_ascii=False), encoding="utf-8")
    messages = tmp_path / "te.json"
    messages.write_text(json.dumps({"Diary": {"title": "డైరీ"}}, ensure_ascii=False), encoding="utf-8")
    manifest = tmp_path / "manifest.json"
    keys = [clip_key("te", "Park కి"), clip_key("de", "Danke.")]
    manifest.write_text(json.dumps({"clips": {k: {} for k in keys}}), encoding="utf-8")

    items = rows(weeks, tmp_path / "none.json", messages, manifest)
    assert [r["text"] for r in items] == ["Park కి", "ధన్యవాదాలు", "డైరీ"]  # no German rows
    assert items[0]["clip"] == f"apps/web/public/audio/{keys[0]}.mp3"
    assert items[1]["clip"].endswith(f"{keys[1]}.mp3") and items[1]["heard_with"] == "Danke."
    assert items[2]["clip"] == "" and items[2]["where"] == "Diary.title"
    assert all(r.get("natural", "") == "" for r in items)  # nothing is pre-filled

    write_csv(items, tmp_path / "r.csv")
    write_html(items, tmp_path / "r.html")
    assert "ధన్యవాదాలు" in (tmp_path / "r.csv").read_text(encoding="utf-8-sig")
    assert "../../apps/web/public/audio/" in (tmp_path / "r.html").read_text(encoding="utf-8")
