import re

from speech.sources import collect
from speech.spoken import (
    chunks,
    de_number,
    de_time,
    en_number,
    en_time,
    spoken,
    te_letters,
    te_number,
    te_time,
)


def test_telugu_numbers():
    assert te_number(7) == "ఏడు"
    assert te_number(14) == "పద్నాలుగు"
    assert te_number(22) == "ఇరవై రెండు"
    assert te_number(100) == "వంద"
    assert te_number(101) == "నూట ఒకటి"
    assert te_number(211) == "రెండు వందల పదకొండు"
    assert te_number(2500) == "రెండు వేల ఐదు వందలు"


def test_telugu_times_take_the_case_ending():
    assert te_time(8, 30, "కి") == "ఉదయం ఎనిమిదిన్నరకి"
    assert te_time(10, 0, "కి") == "ఉదయం పది గంటలకి"
    assert te_time(10, 10, "కి") == "ఉదయం పది గంటల పది నిమిషాలకి"
    assert te_time(13, 3, "కి") == "మధ్యాహ్నం ఒంటి గంట మూడు నిమిషాలకి"
    assert te_time(19, 0) == "రాత్రి ఏడు గంటలు"
    assert te_time(16, 45) == "సాయంత్రం నాలుగు గంటల నలభై ఐదు నిమిషాలు"


def test_a_card_line_is_all_telugu_letters():
    out = spoken("అమ్మా, సోమవారం 08:30కి Karya Siddhi Hanuman Temple కి వెళ్దాం.", "te")
    assert out.text == "అమ్మా, సోమవారం ఉదయం ఎనిమిదిన్నరకి కార్య సిద్ధి హనుమాన్ టెంపుల్ కి వెళ్దాం."
    assert out.unknown_words == []


def test_bus_and_train_lines_are_read_digit_by_digit():
    assert spoken("Bus 211 ఎక్కండి", "te").text == "బస్ రెండు ఒకటి ఒకటి ఎక్కండి"
    assert spoken("Bus U5 ఎక్కి", "te").text == "బస్ యూ ఐదు ఎక్కి"
    assert spoken("7 స్టాపుల తర్వాత", "te").text == "ఏడు స్టాపుల తర్వాత"


def test_abbreviations_are_not_sentence_ends():
    out = spoken("Fremont Blvd. at Peralta Ct. దగ్గర దిగి, Fremont Blvd & Mowry Ave దగ్గర.", "te").text
    assert out == "ఫ్రీమాంట్ బులేవార్డ్ ఎట్ పెరాల్టా కోర్ట్ దగ్గర దిగి, ఫ్రీమాంట్ బులేవార్డ్ అండ్ మౌరీ అవెన్యూ దగ్గర."
    assert spoken("Indian-Grocery-Store München కి", "te").text == "ఇండియన్ గ్రోసరీ స్టోర్ మ్యూన్‌షెన్ కి"


def test_unknown_names_fall_back_to_letter_rules_and_are_reported():
    out = spoken("Zooland కి", "te")
    assert out.unknown_words == ["Zooland"]
    assert not re.search(r"[A-Za-z]", out.text)
    assert te_letters("stevenson") == "స్టెవెన్సొన్"
    assert te_letters("park") == "పార్క్"


def test_every_demo_text_leaves_nothing_the_voices_would_skip():
    for spec in collect():
        text = spoken(spec.text, spec.lang).text
        assert not re.search(r"\d", text), (spec.key, text)
        if spec.lang == "te":
            assert not re.search(r"[A-Za-zÀ-ÿ]", text), (spec.key, text)


def test_english_and_german_numbers():
    assert en_number(211) == "two hundred eleven"
    assert en_time(10, 30) == "ten thirty"
    assert en_time(9, 5) == "nine oh five"
    assert en_time(9, 0) == "nine o'clock"
    assert de_number(21) == "einundzwanzig"
    assert de_number(101) == "einhunderteins"
    assert de_time(10, 30) == "zehn Uhr dreißig"
    assert spoken("Bus 7 um 10:30", "de").text == "Bus sieben um zehn Uhr dreißig"
    assert spoken("Where is the bathroom?", "en").text == "Where is the bathroom?"


def test_chunks_pause_at_sentence_and_clause_ends():
    pieces = chunks("అమ్మా, బస్సు వస్తుంది. ఇంటికి రండి.")
    assert pieces == [("అమ్మా,", 0.2), ("బస్సు వస్తుంది.", 0.45), ("ఇంటికి రండి.", 0.0)]
    assert chunks("How much?") == [("How much?", 0.0)]
