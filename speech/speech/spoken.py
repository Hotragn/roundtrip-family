"""The spoken form of a card: the words a voice should say, before any model sees them.

Cards mix scripts. A Telugu card says "సోమవారం 08:30కి Karya Siddhi Hanuman Temple కి",
keeping venue, street and bus names in English as the plan asks. MMS-TTS Telugu knows only
Telugu letters (its tokenizer drops digits and Latin letters), so without this step the voice
would skip the time, the bus number and the place, which are what the parent needs most.

- Times become Telugu words with the part of the day: 08:30కి -> ఉదయం ఎనిమిదిన్నరకి.
- Bus and train line numbers are read digit by digit, as printed on the bus: Bus 211 ->
  బస్ రెండు ఒకటి ఒకటి.
- Other numbers become Telugu number words: 14 నిమిషాలు -> పద్నాలుగు నిమిషాలు.
- Latin-script names are written in Telugu letters from te_names.json, then by letter rules.

English and German text only needs its numbers written out (MMS-TTS drops most digits).
The same spoken form is the reference for the character error rate, so the score measures
whether the words survive text to speech to text, not whether a model can print digits.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

LEXICON_PATH = Path(__file__).with_name("te_names.json")

TE_LETTER = "ఀ-౿"
LATIN = "A-Za-zÀ-ÖØ-öø-ÿ"

# --- Telugu numbers -------------------------------------------------------------------------

TE_UNITS = [
    "సున్నా", "ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది",
    "పది", "పదకొండు", "పన్నెండు", "పదమూడు", "పద్నాలుగు", "పదిహేను", "పదహారు", "పదిహేడు",
    "పద్దెనిమిది", "పందొమ్మిది",
]
TE_TENS = {2: "ఇరవై", 3: "ముప్పై", 4: "నలభై", 5: "యాభై", 6: "అరవై", 7: "డెబ్బై", 8: "ఎనభై", 9: "తొంభై"}


def te_number(n: int) -> str:
    """Telugu number words for 0 to 999,999."""
    if n < 0:
        raise ValueError("negative numbers are not spoken here")
    if n < 20:
        return TE_UNITS[n]
    if n < 100:
        tens, unit = divmod(n, 10)
        return TE_TENS[tens] + ("" if unit == 0 else " " + TE_UNITS[unit])
    if n < 1000:
        hundreds, rest = divmod(n, 100)
        if hundreds == 1:
            head = "వంద" if rest == 0 else "నూట"
        else:
            head = te_number(hundreds) + (" వందలు" if rest == 0 else " వందల")
        return head if rest == 0 else f"{head} {te_number(rest)}"
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        if thousands == 1:
            head = "వెయ్యి"
        else:
            head = te_number(thousands) + (" వేలు" if rest == 0 else " వేల")
        return head if rest == 0 else f"{head} {te_number(rest)}"
    raise ValueError(f"{n} is too large to speak")


def te_digits(digits: str) -> str:
    return " ".join(TE_UNITS[int(d)] for d in digits)


def te_part_of_day(hour: int) -> str:
    if 4 <= hour < 12:
        return "ఉదయం"
    if 12 <= hour < 16:
        return "మధ్యాహ్నం"
    if 16 <= hour < 19:
        return "సాయంత్రం"
    return "రాత్రి"


def te_time(hour: int, minute: int, suffix: str = "") -> str:
    """08:30కి -> ఉదయం ఎనిమిదిన్నరకి; 13:03కి -> మధ్యాహ్నం ఒంటి గంట మూడు నిమిషాలకి.

    A case ending written after the digits (కి, కు, లోపు) moves onto the last word, which
    then takes its oblique form (గంటలు -> గంటల, నిమిషాలు -> నిమిషాల).
    """
    h12 = hour % 12 or 12
    part = te_part_of_day(hour)
    if minute == 30:
        return f"{part} {te_number(h12)}న్నర{suffix}"
    if h12 == 1:
        hour_words = "ఒంటి గంట"
    else:
        hour_words = f"{te_number(h12)} {'గంటలు' if minute == 0 and not suffix else 'గంటల'}"
    if minute == 0:
        return f"{part} {hour_words}{suffix}"
    minutes = "నిమిషాల" if suffix else "నిమిషాలు"
    return f"{part} {hour_words} {te_number(minute)} {minutes}{suffix}"


# --- English and German numbers ------------------------------------------------------------

EN_UNITS = (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
    "fifteen sixteen seventeen eighteen nineteen"
).split()
EN_TENS = {2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy", 8: "eighty", 9: "ninety"}


def en_number(n: int) -> str:
    if n < 20:
        return EN_UNITS[n]
    if n < 100:
        tens, unit = divmod(n, 10)
        return EN_TENS[tens] + ("" if unit == 0 else " " + EN_UNITS[unit])
    if n < 1000:
        hundreds, rest = divmod(n, 100)
        return f"{EN_UNITS[hundreds]} hundred" + ("" if rest == 0 else " " + en_number(rest))
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        return f"{en_number(thousands)} thousand" + ("" if rest == 0 else " " + en_number(rest))
    raise ValueError(f"{n} is too large to speak")


def en_time(hour: int, minute: int) -> str:
    h12 = hour % 12 or 12
    if minute == 0:
        return f"{en_number(h12)} o'clock"
    if minute < 10:
        return f"{en_number(h12)} oh {en_number(minute)}"
    return f"{en_number(h12)} {en_number(minute)}"


DE_UNITS = (
    "null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn "
    "fünfzehn sechzehn siebzehn achtzehn neunzehn"
).split()
DE_TENS = {2: "zwanzig", 3: "dreißig", 4: "vierzig", 5: "fünfzig", 6: "sechzig", 7: "siebzig", 8: "achtzig", 9: "neunzig"}


def de_number(n: int) -> str:
    if n < 20:
        return DE_UNITS[n]
    if n < 100:
        tens, unit = divmod(n, 10)
        if unit == 0:
            return DE_TENS[tens]
        return ("ein" if unit == 1 else DE_UNITS[unit]) + "und" + DE_TENS[tens]
    if n < 1000:
        hundreds, rest = divmod(n, 100)
        head = ("ein" if hundreds == 1 else DE_UNITS[hundreds]) + "hundert"
        return head + ("" if rest == 0 else de_number(rest))
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        head = ("ein" if thousands == 1 else de_number(thousands)) + "tausend"
        return head + ("" if rest == 0 else de_number(rest))
    raise ValueError(f"{n} is too large to speak")


def de_time(hour: int, minute: int) -> str:
    head = "ein" if hour == 1 else de_number(hour)
    return f"{head} Uhr" + ("" if minute == 0 else " " + de_number(minute))


# --- Latin names in Telugu letters ------------------------------------------------------

TE_LETTER_NAMES = {
    "a": "ఏ", "b": "బీ", "c": "సీ", "d": "డీ", "e": "ఈ", "f": "ఎఫ్", "g": "జీ", "h": "హెచ్",
    "i": "ఐ", "j": "జే", "k": "కే", "l": "ఎల్", "m": "ఎమ్", "n": "ఎన్", "o": "ఓ", "p": "పీ",
    "q": "క్యూ", "r": "ఆర్", "s": "ఎస్", "t": "టీ", "u": "యూ", "v": "వీ", "w": "డబ్ల్యూ",
    "x": "ఎక్స్", "y": "వై", "z": "జెడ్",
}

# Letter rules for names the lexicon doesn't know: an approximation, logged so a person can add
# the name. Each rule maps spelling to consonant (C) or vowel (V) sounds.
_C = {
    "k": "క", "kh": "ఖ", "g": "గ", "c": "చ", "j": "జ", "T": "ట", "D": "డ", "th": "థ",
    "dh": "ద", "n": "న", "p": "ప", "f": "ఫ", "b": "బ", "m": "మ", "y": "య", "r": "ర",
    "l": "ల", "v": "వ", "sh": "ష", "s": "స", "h": "హ",
}
_V_SIGN = {"a": "", "aa": "ా", "i": "ి", "ii": "ీ", "u": "ు", "uu": "ూ", "e": "ె", "ee": "ే", "ai": "ై", "o": "ొ", "oo": "ో", "au": "ౌ"}
_V_FULL = {"a": "అ", "aa": "ఆ", "i": "ఇ", "ii": "ఈ", "u": "ఉ", "uu": "ఊ", "e": "ఎ", "ee": "ఏ", "ai": "ఐ", "o": "ఒ", "oo": "ఓ", "au": "ఔ"}
VIRAMA = "్"

# (spelling, [(kind, sound), ...]), longest spellings first.
_SPELLING: list[tuple[str, list[tuple[str, str]]]] = sorted(
    [
        ("tsch", [("C", "c")]), ("sch", [("C", "sh")]), ("sh", [("C", "sh")]), ("ch", [("C", "c")]),
        ("ck", [("C", "k")]), ("ph", [("C", "f")]), ("th", [("C", "th")]), ("kh", [("C", "kh")]),
        ("gh", [("C", "g")]), ("qu", [("C", "k"), ("C", "v")]), ("x", [("C", "k"), ("C", "s")]),
        ("ee", [("V", "ii")]), ("ea", [("V", "ii")]), ("ie", [("V", "ii")]), ("oo", [("V", "uu")]),
        ("ou", [("V", "au")]), ("ai", [("V", "ee")]), ("ay", [("V", "ee")]), ("ei", [("V", "ai")]),
        ("eu", [("V", "o"), ("C", "y")]), ("au", [("V", "aa")]), ("aa", [("V", "aa")]),
        ("ü", [("C", "y"), ("V", "uu")]), ("ö", [("V", "oo")]), ("ä", [("V", "e")]), ("ß", [("C", "s")]),
        ("a", [("V", "aa")]), ("e", [("V", "e")]), ("i", [("V", "i")]), ("o", [("V", "o")]), ("u", [("V", "u")]),
        ("b", [("C", "b")]), ("c", [("C", "k")]), ("d", [("C", "D")]), ("f", [("C", "f")]), ("g", [("C", "g")]),
        ("h", [("C", "h")]), ("j", [("C", "j")]), ("k", [("C", "k")]), ("l", [("C", "l")]), ("m", [("C", "m")]),
        ("n", [("C", "n")]), ("p", [("C", "p")]), ("q", [("C", "k")]), ("r", [("C", "r")]), ("s", [("C", "s")]),
        ("t", [("C", "T")]), ("v", [("C", "v")]), ("w", [("C", "v")]), ("y", [("V", "ii")]), ("z", [("C", "j")]),
    ],
    key=lambda rule: -len(rule[0]),
)


def te_letters(word: str) -> str:
    """Approximate Telugu letters for an unknown Latin word, by spelling rules."""
    w = re.sub(rf"[^{LATIN}ß]", "", word.lower())
    if len(w) > 3 and w.endswith("e") and w[-2] not in "aeiouy":
        w = w[:-1]  # a silent final e: "store" -> stor
    w = re.sub(r"([bcdfgklmnprstvz])\1", r"\1", w)  # doubled consonants sound single
    sounds: list[tuple[str, str]] = []
    i = 0
    while i < len(w):
        if w[i] == "c" and i + 1 < len(w) and w[i + 1] in "eiy":
            sounds.append(("C", "s"))
            i += 1
            continue
        if w[i] == "y" and (i == 0 or (i + 1 < len(w) and w[i + 1] in "aeiou")):
            sounds.append(("C", "y"))
            i += 1
            continue
        for spelling, out in _SPELLING:
            if w.startswith(spelling, i):
                sounds.extend(out)
                i += len(spelling)
                break
        else:
            i += 1
    text = ""
    for j, (kind, sound) in enumerate(sounds):
        nxt = sounds[j + 1] if j + 1 < len(sounds) else None
        if kind == "V":
            prev = sounds[j - 1] if j > 0 else None
            if prev is None or prev[0] == "V":
                text += _V_FULL[sound]
            else:
                text += _V_SIGN[sound]
        else:
            text += _C[sound]
            if nxt is None or nxt[0] == "C":
                text += VIRAMA
    return text


@lru_cache(maxsize=1)
def lexicon() -> dict[str, str]:
    return json.loads(LEXICON_PATH.read_text(encoding="utf-8"))["words"]


@dataclass
class SpokenForm:
    text: str
    unknown_words: list[str]


# --- Patterns ---------------------------------------------------------------------------------

TIME_RE = re.compile(rf"(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])([{TE_LETTER}]*)")
# "Bus 211", "Tram 17": the word before a line number. "U5", "S8": a letter fused to the number.
LINE_WORD_RE = re.compile(r"\b(Bus|Tram|Line|Linie|Route)(\s+)(\d{1,4})\b")
LINE_CODE_RE = re.compile(r"\b([A-Z]{1,2})(\d{1,3})\b")
NUMBER_RE = re.compile(rf"(?<![\d:])(\d{{1,6}})(?![\d:])([{TE_LETTER}]*)")
LATIN_WORD_RE = re.compile(rf"[{LATIN}ß]+(?:['’][{LATIN}]*)?(?:-[{LATIN}ß]+)*\.?")
ABBREVIATIONS = {"blvd.", "ct.", "ave.", "av.", "st.", "rd.", "mrs.", "mr."}


def _te_latin(match: re.Match[str], unknown: list[str]) -> str:
    token = match.group(0)
    trailing = ""
    if token.endswith(".") and token.lower() not in ABBREVIATIONS:
        token, trailing = token[:-1], "."  # a sentence ends here, keep the full stop
    words = []
    for part in re.split(r"-", token.rstrip(".")):
        bare = re.sub(r"['’]", "", part).lower()
        if not bare:
            continue
        known = lexicon().get(bare)
        if known is None:
            unknown.append(part)
            known = te_letters(bare)
        words.append(known)
    return " ".join(words) + trailing


def te_spoken(text: str) -> SpokenForm:
    unknown: list[str] = []
    out = TIME_RE.sub(lambda m: te_time(int(m.group(1)), int(m.group(2)), m.group(3)), text)
    out = LINE_WORD_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}{te_digits(m.group(3))}", out)
    out = LINE_CODE_RE.sub(
        lambda m: " ".join(TE_LETTER_NAMES[c.lower()] for c in m.group(1)) + " " + te_digits(m.group(2)), out
    )

    def number(m: re.Match[str]) -> str:
        n = int(m.group(1))
        follows_word = m.end() < len(out) and out[m.end() : m.end() + 1] == " "
        if n == 1 and not m.group(2) and follows_word:
            return "ఒక"  # "1 స్టాప్" reads ఒక స్టాప్
        return te_number(n) + m.group(2)

    out = NUMBER_RE.sub(number, out)
    out = LATIN_WORD_RE.sub(lambda m: _te_latin(m, unknown), out)
    out = out.replace("&", " అండ్ ")
    return SpokenForm(text=" ".join(out.split()), unknown_words=unknown)


def _latin_spoken(text: str, number_words, time_words, amp: str) -> SpokenForm:
    out = TIME_RE.sub(lambda m: time_words(int(m.group(1)), int(m.group(2))), text)
    out = re.sub(r"(?<![\d:])\d{1,6}(?![\d:])", lambda m: number_words(int(m.group(0))), out)
    out = out.replace("&", f" {amp} ")
    return SpokenForm(text=" ".join(out.split()), unknown_words=[])


def spoken(text: str, lang: str) -> SpokenForm:
    """The words to say for `text` in `lang`. Languages without rules pass through unchanged."""
    if lang == "te":
        return te_spoken(text)
    if lang == "en":
        return _latin_spoken(text, en_number, en_time, "and")
    if lang == "de":
        return _latin_spoken(text, de_number, de_time, "und")
    return SpokenForm(text=" ".join(text.split()), unknown_words=[])


# --- Pauses -----------------------------------------------------------------------------------

SENTENCE_END = re.compile(r"(?<=[.!?।॥])\s+")
CLAUSE_END = re.compile(r"(?<=[,;:])\s+")
SENTENCE_PAUSE = 0.45
CLAUSE_PAUSE = 0.2


def chunks(spoken_text: str) -> list[tuple[str, float]]:
    """Split the spoken form at sentence and clause ends, with the pause to leave after each.

    MMS-TTS ignores punctuation, so a long card read in one pass runs every sentence together.
    Reading it piece by piece and leaving a gap is what a careful reader does for an older
    listener.
    """
    pieces: list[tuple[str, float]] = []
    for sentence in SENTENCE_END.split(spoken_text.strip()):
        clauses = [c for c in CLAUSE_END.split(sentence) if c.strip()]
        for i, clause in enumerate(clauses):
            pause = SENTENCE_PAUSE if i == len(clauses) - 1 else CLAUSE_PAUSE
            pieces.append((clause.strip(), pause))
    if pieces:
        pieces[-1] = (pieces[-1][0], 0.0)
    return pieces
