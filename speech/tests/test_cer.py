from speech.cer import cer, normalize


def test_identical_text_scores_zero():
    assert cer("అమ్మా, బస్సు పది గంటలకు వస్తుంది.", "అమ్మా బస్సు పది గంటలకు వస్తుంది") == 0.0


def test_a_wrong_vowel_sign_counts():
    # వస్తుంది vs వస్తంది: one dropped vowel sign.
    assert 0 < cer("వస్తుంది", "వస్తంది") < 0.25


def test_normalizes_unicode_forms():
    assert normalize("Café") == normalize("Café")


def test_zero_width_joiners_are_not_errors():
    # బాత్‌రూమ్ carries a zero-width non-joiner that only changes how the word is drawn.
    assert cer("బాత్‌రూమ్ ఎక్కడ ఉంది", "బాత్రూమ్ ఎక్కడ ఉంది") == 0.0


def test_empty_reference():
    assert cer("", "") == 0.0
    assert cer("", "x") == 1.0
